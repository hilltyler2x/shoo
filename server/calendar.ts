import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { Fetch } from '../src/providers';

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export type Resolve = (host: string) => Promise<string[]>;

export const resolveHost: Resolve = async (host) => (await lookup(host, { all: true })).map((a) => a.address);

/**
 * Fetches a calendar's secret iCal address for the app. Browsers can't do
 * this themselves (CORS). Only public https addresses are allowed, so the
 * server can't be pointed at its own private network.
 */
export async function fetchCalendar(raw: string, fetchFn: Fetch, resolve: Resolve): Promise<string> {
  let url = toUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url, resolve);
    const res = await fetchFn(url, {
      redirect: 'manual',
      headers: { Accept: 'text/calendar, */*' },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = toUrl(new URL(res.headers.get('location')!, url).toString());
      continue;
    }
    if (!res.ok) throw new CalendarError(`The calendar address answered ${res.status}.`);
    const text = await readCapped(res);
    if (!text.includes('BEGIN:VCALENDAR')) throw new CalendarError("That address isn't an iCal calendar.");
    return text;
  }
  throw new CalendarError('Too many redirects.');
}

export class CalendarError extends Error {}

function toUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim().replace(/^webcals?:\/\//i, 'https://'));
  } catch {
    throw new CalendarError("That doesn't look like a web address.");
  }
  if (url.protocol !== 'https:') throw new CalendarError('Calendar addresses must start with https:// or webcal://.');
  return url;
}

async function assertPublic(url: URL, resolve: Resolve) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [host] : await resolve(host).catch(() => []);
  if (addresses.length === 0) throw new CalendarError("Couldn't find that calendar's server.");
  if (addresses.some(isPrivate)) throw new CalendarError('That address points at a private network.');
}

export function isPrivate(ip: string): boolean {
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b < 128) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168) || a >= 224
    );
  }
  const lower = ip.toLowerCase();
  return lower === '::' || lower === '::1' || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower);
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new CalendarError('That calendar is too big.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
