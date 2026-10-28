import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { LatLng, TravelMode } from '../src/core/types';
import { CalendarError, fetchCalendar, resolveHost, type Resolve } from './calendar';
import { cors, rateLimit, requirePasscode } from './guards';
import { geocode, route, type Fetch, type ProviderEnv } from '../src/providers';

export interface AppEnv extends ProviderEnv {
  APP_PASSCODE?: string;
  RATE_LIMIT_PER_HOUR?: string;
  /** Extra comma-separated origins allowed to call the API. */
  ALLOWED_ORIGINS?: string;
}

export interface AppDeps {
  env: AppEnv;
  fetch?: Fetch;
  resolve?: Resolve;
  /** Folder with the built website, served at /. */
  staticDir?: string;
}

const MODES: TravelMode[] = ['drive', 'transit', 'walk', 'bike'];

export function createApp({ env, fetch: fetchFn = fetch, resolve = resolveHost, staticDir }: AppDeps) {
  const app = express();
  app.set('trust proxy', 1); // Render sits in front of us
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));
  app.use('/api', cors((env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)));

  // Health stays open so Render can check it and the app can see the server woke up.
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      passcodeRequired: Boolean(env.APP_PASSCODE),
      routing: env.GOOGLE_MAPS_API_KEY ? 'google' : 'osrm',
    });
  });

  const api = express.Router();
  api.use(requirePasscode(env.APP_PASSCODE));
  api.use(rateLimit(Number(env.RATE_LIMIT_PER_HOUR) || 300));

  api.post('/passcode', (_req, res) => {
    res.json({ ok: true });
  });

  api.get('/geocode', async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 3 || q.length > 200) {
      res.status(400).json({ error: 'bad-request', message: 'Type at least 3 characters.' });
      return;
    }
    res.json({ places: await geocode(env, fetchFn, q) });
  });

  api.post('/route', async (req, res) => {
    const { from, to, mode, departAt } = req.body ?? {};
    if (!isLatLng(from) || !isLatLng(to) || !MODES.includes(mode)) {
      res.status(400).json({ error: 'bad-request', message: 'Need from, to and mode.' });
      return;
    }
    res.json(await route(env, fetchFn, from, to, mode, typeof departAt === 'number' ? departAt : undefined));
  });

  api.get('/calendar', async (req, res) => {
    try {
      const text = await fetchCalendar(String(req.query.url ?? ''), fetchFn, resolve);
      res.type('text/calendar').send(text);
    } catch (err) {
      if (err instanceof CalendarError) res.status(400).json({ error: 'calendar', message: err.message });
      else throw err;
    }
  });

  app.use('/api', api);
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not-found' });
  });

  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(502).json({ error: 'upstream', message: 'Something went wrong talking to the maps service.' });
  });

  return app;
}

function isLatLng(v: unknown): v is LatLng {
  const p = v as LatLng;
  return (
    typeof p?.lat === 'number' && typeof p?.lng === 'number' &&
    Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180
  );
}
