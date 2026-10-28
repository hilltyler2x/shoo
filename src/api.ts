import type { LatLng, Place, TravelEstimate, TravelMode } from './core/types';
import { geocode as directGeocode, route as directRoute } from './providers';

/**
 * Empty on the website served by Shoo's own server. The phone apps set the
 * server's address in .env.app. "none" means there is no server (the GitHub
 * Pages copy), so everything goes straight to the free map services.
 */
const API_URL = import.meta.env.VITE_API_URL ?? '';
const SERVERLESS = API_URL === 'none';
const BASE = SERVERLESS ? '' : API_URL.replace(/\/$/, '');

/**
 * When the server can't be reached (not set up yet, or down), Shoo still
 * works: it calls the free routing and address services directly (no live
 * traffic) and reads calendars itself. On the phone apps CapacitorHttp lets
 * those calls skip the browser's cross-site rules.
 */
const DIRECT = { sendUserAgent: false } as const;
const RETRY_SERVER_AFTER_MS = 10 * 60_000;
let serverDownUntil = 0;

async function viaServer<T>(server: () => Promise<T>, direct: () => Promise<T>): Promise<T> {
  if (SERVERLESS || Date.now() < serverDownUntil) return direct();
  try {
    return await server();
  } catch (err) {
    if (err instanceof PasscodeError) throw err;
    serverDownUntil = Date.now() + RETRY_SERVER_AFTER_MS;
    return direct();
  }
}

export class PasscodeError extends Error {}
export class ApiError extends Error {}

type WakeListener = (waking: boolean) => void;
const listeners = new Set<WakeListener>();
let waking = false;

/** The free server sleeps after 15 idle minutes. This tells the UI when it's waking up. */
export function onServerWaking(fn: WakeListener): () => void {
  listeners.add(fn);
  fn(waking);
  return () => listeners.delete(fn);
}

function setWaking(value: boolean) {
  if (waking === value) return;
  waking = value;
  listeners.forEach((fn) => fn(value));
}

let passcode = '';
export function setPasscode(value: string) {
  passcode = value;
}

/** Keep retrying for this long while the server boots (Render's cold start is about a minute). */
const WAKE_BUDGET_MS = 75_000;

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const started = Date.now();
  let delay = 1500;
  for (;;) {
    let res: Response | null = null;
    try {
      res = await fetch(`${BASE}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', 'X-Shoo-Passcode': passcode, ...init.headers },
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      res = null; // network error or timeout: probably asleep
    }
    const sleepy = !res || res.status === 502 || res.status === 503 || res.status === 504;
    if (!sleepy) {
      setWaking(false);
      if (res!.status === 401) throw new PasscodeError('Wrong passcode.');
      if (!res!.ok) {
        const body = await res!.json().catch(() => ({}));
        throw new ApiError(body.message ?? `Server error ${res!.status}`);
      }
      return res!;
    }
    if (Date.now() - started > WAKE_BUDGET_MS) {
      setWaking(false);
      throw new ApiError("Can't reach the Shoo server. Check your connection.");
    }
    setWaking(true);
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 8000);
  }
}

const NO_SERVER = { ok: false, passcodeRequired: false, routing: 'direct' };

export async function health(): Promise<{ ok: boolean; passcodeRequired: boolean; routing: string }> {
  if (SERVERLESS) return NO_SERVER;
  try {
    const body = await (await call('/api/health')).json();
    if (body?.ok) return body;
  } catch {
    // fall through
  }
  serverDownUntil = Date.now() + RETRY_SERVER_AFTER_MS;
  return NO_SERVER;
}

export async function checkPasscode(): Promise<void> {
  if (SERVERLESS || Date.now() < serverDownUntil) return;
  await call('/api/passcode', { method: 'POST' });
}

export function searchPlaces(q: string): Promise<Place[]> {
  return viaServer(
    async () => (await (await call(`/api/geocode?q=${encodeURIComponent(q)}`)).json()).places,
    () => directGeocode(DIRECT, fetch, q),
  );
}

export function travelTime(from: LatLng, to: LatLng, mode: TravelMode, departAt?: number): Promise<TravelEstimate> {
  return viaServer(
    async () =>
      (await call('/api/route', { method: 'POST', body: JSON.stringify({ from, to, mode, departAt }) })).json(),
    () => directRoute(DIRECT, fetch, from, to, mode, departAt),
  );
}

export function fetchCalendar(url: string): Promise<string> {
  return viaServer(
    async () => (await call(`/api/calendar?url=${encodeURIComponent(url)}`)).text(),
    async () => {
      let res: Response;
      try {
        res = await fetch(url.trim().replace(/^webcals?:\/\//i, 'https://'), { signal: AbortSignal.timeout(15_000) });
      } catch {
        // Browsers block most calendar hosts from being read by other sites. The phone apps aren't limited.
        throw new ApiError("Couldn't read that calendar here. It works in the phone app, or once Shoo's server is online.");
      }
      if (!res.ok) throw new ApiError(`The calendar address answered ${res.status}.`);
      const text = await res.text();
      if (!text.includes('BEGIN:VCALENDAR')) throw new ApiError("That address isn't an iCal calendar.");
      return text;
    },
  );
}
