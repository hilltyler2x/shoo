import type { LatLng, Place, TravelEstimate, TravelMode } from './core/types';

/** Empty on the website (same server). The phone apps set VITE_API_URL in .env.app. */
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

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
const WAKE_BUDGET_MS = 120_000;

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

export async function health(): Promise<{ ok: boolean; passcodeRequired: boolean; routing: string }> {
  return (await call('/api/health')).json();
}

export async function checkPasscode(): Promise<void> {
  await call('/api/passcode', { method: 'POST' });
}

export async function searchPlaces(q: string): Promise<Place[]> {
  return (await (await call(`/api/geocode?q=${encodeURIComponent(q)}`)).json()).places;
}

export async function travelTime(from: LatLng, to: LatLng, mode: TravelMode, departAt?: number): Promise<TravelEstimate> {
  const res = await call('/api/route', { method: 'POST', body: JSON.stringify({ from, to, mode, departAt }) });
  return res.json();
}

export async function fetchCalendar(url: string): Promise<string> {
  return (await call(`/api/calendar?url=${encodeURIComponent(url)}`)).text();
}
