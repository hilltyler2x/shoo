import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { isPrivate } from '../server/calendar';
import type { Fetch } from '../src/providers';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Stands in for Google, OSRM and calendar hosts. Nothing real gets called in tests. */
function fakeFetch(handler: (url: string, init?: RequestInit) => Response): Fetch & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input.toString();
    calls.push(url);
    return handler(url, init);
  }) as Fetch & { calls: string[] };
  fn.calls = calls;
  return fn;
}

const publicDns = async () => ['142.250.1.1'];
const home = { lat: 41.8781, lng: -87.6298 };
const work = { lat: 41.9484, lng: -87.6553 };

describe('server', () => {
  it('health is open and says whether a passcode is needed', async () => {
    const app = createApp({ env: { APP_PASSCODE: 'pizza' } });
    const res = await request(app).get('/api/health');
    expect(res.body).toMatchObject({ ok: true, passcodeRequired: true, routing: 'osrm' });
  });

  it('rejects a wrong passcode', async () => {
    const app = createApp({ env: { APP_PASSCODE: 'pizza' } });
    expect((await request(app).post('/api/passcode')).status).toBe(401);
    expect((await request(app).post('/api/passcode').set('X-Shoo-Passcode', 'nope')).status).toBe(401);
    expect((await request(app).post('/api/passcode').set('X-Shoo-Passcode', 'pizza')).status).toBe(200);
  });

  it('rate limits each visitor', async () => {
    const app = createApp({ env: { RATE_LIMIT_PER_HOUR: '2' } });
    expect((await request(app).post('/api/passcode')).status).toBe(200);
    expect((await request(app).post('/api/passcode')).status).toBe(200);
    const third = await request(app).post('/api/passcode');
    expect(third.status).toBe(429);
    expect(third.headers['retry-after']).toBeDefined();
  });

  it('lets the phone apps call it (CORS)', async () => {
    const app = createApp({ env: {} });
    const res = await request(app).options('/api/route').set('Origin', 'capacitor://localhost');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('capacitor://localhost');
    const other = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('routes with Google and live traffic when a key is set', async () => {
    const fetch = fakeFetch((url, init) => {
      expect(url).toContain('routes.googleapis.com');
      const body = JSON.parse(String(init?.body));
      expect(body.routingPreference).toBe('TRAFFIC_AWARE');
      expect((init?.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('secret');
      return json({ routes: [{ duration: '1290s', distanceMeters: 9800 }] });
    });
    const app = createApp({ env: { GOOGLE_MAPS_API_KEY: 'secret' }, fetch });
    const res = await request(app).post('/api/route').send({ from: home, to: work, mode: 'drive' });
    expect(res.body).toEqual({ minutes: 22, distanceMeters: 9800, trafficAware: true, provider: 'google' });
  });

  it('falls back to OSRM, then to an estimate, without a key', async () => {
    const ok = fakeFetch(() => json({ routes: [{ duration: 600, distance: 8000 }] }));
    const res = await request(createApp({ env: {}, fetch: ok })).post('/api/route').send({ from: home, to: work, mode: 'drive' });
    expect(res.body).toMatchObject({ minutes: 12, provider: 'osrm', trafficAware: false });

    const down = fakeFetch(() => json({}, 503));
    const est = await request(createApp({ env: {}, fetch: down })).post('/api/route').send({ from: home, to: work, mode: 'drive' });
    expect(est.body.provider).toBe('estimate');
    expect(est.body.minutes).toBeGreaterThan(0);
  });

  it('validates route input', async () => {
    const res = await request(createApp({ env: {} })).post('/api/route').send({ from: home, mode: 'drive' });
    expect(res.status).toBe(400);
  });

  it('geocodes through OpenStreetMap without a key', async () => {
    const fetch = fakeFetch((url) => {
      expect(url).toContain('nominatim.openstreetmap.org');
      return json([{ display_name: 'Wrigley Field, Chicago', lat: '41.9484', lon: '-87.6553' }]);
    });
    const res = await request(createApp({ env: {}, fetch })).get('/api/geocode').query({ q: 'wrigley field' });
    expect(res.body.places).toEqual([{ label: 'Wrigley Field, Chicago', location: work }]);
  });

  it('fetches a calendar, turning webcal into https', async () => {
    const fetch = fakeFetch(() => new Response('BEGIN:VCALENDAR\r\nEND:VCALENDAR'));
    const res = await request(createApp({ env: {}, fetch, resolve: publicDns }))
      .get('/api/calendar')
      .query({ url: 'webcal://calendar.example.com/me.ics' });
    expect(res.status).toBe(200);
    expect(fetch.calls[0]).toBe('https://calendar.example.com/me.ics');
  });

  it('refuses calendar addresses on private networks', async () => {
    const fetch = fakeFetch(() => new Response('BEGIN:VCALENDAR'));
    const app = createApp({ env: {}, fetch, resolve: async () => ['10.0.0.5'] });
    const res = await request(app).get('/api/calendar').query({ url: 'https://sneaky.example.com/x.ics' });
    expect(res.status).toBe(400);
    expect(fetch.calls).toHaveLength(0);
    expect((await request(app).get('/api/calendar').query({ url: 'http://example.com/x.ics' })).status).toBe(400);
  });

  it('knows private addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:10.0.0.1']) {
      expect(isPrivate(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '142.250.1.1', '2607:f8b0::1']) expect(isPrivate(ip), ip).toBe(false);
  });
});
