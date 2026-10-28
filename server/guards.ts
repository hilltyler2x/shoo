import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * The app asks for this passcode once and sends it on every request, so
 * strangers who find the server can't spend your Google Maps credit.
 * With no APP_PASSCODE set (local development) every request is let in.
 */
export function requirePasscode(passcode: string | undefined) {
  const expected = Buffer.from(passcode ?? '');
  return (req: Request, res: Response, next: NextFunction) => {
    if (!passcode) return next();
    const given = Buffer.from(req.get('x-shoo-passcode') ?? '');
    if (given.length === expected.length && timingSafeEqual(given, expected)) return next();
    res.status(401).json({ error: 'passcode', message: 'Wrong passcode.' });
  };
}

/** At most `limit` requests per visitor per hour. In memory: resets when the server restarts. */
export function rateLimit(limit: number, now: () => number = Date.now) {
  const HOUR = 3_600_000;
  const hits = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? 'unknown';
    const t = now();
    const recent = (hits.get(key) ?? []).filter((h) => t - h < HOUR);
    if (recent.length >= limit) {
      const retry = Math.ceil((recent[0] + HOUR - t) / 1000);
      res.set('Retry-After', String(retry));
      res.status(429).json({ error: 'rate-limit', message: 'Slow down! Try again in a bit.' });
      return;
    }
    recent.push(t);
    hits.set(key, recent);
    if (hits.size > 10_000) hits.clear(); // don't let a flood eat the memory
    next();
  };
}

const APP_ORIGINS = ['capacitor://localhost', 'https://localhost', 'http://localhost', 'http://localhost:5173'];

/** The phone apps load from capacitor://localhost or https://localhost, so they need CORS. */
export function cors(extra: string[] = []) {
  const allowed = new Set([...APP_ORIGINS, ...extra]);
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.get('origin');
    if (origin && allowed.has(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Headers', 'Content-Type, X-Shoo-Passcode');
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  };
}
