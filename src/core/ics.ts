// A small iCalendar (.ics) reader, enough for work shifts: timed events,
// time zones, and daily or weekly repeats. All-day events are ignored.

import { DAY } from './time';

export interface CalendarEvent {
  uid: string;
  title: string;
  location: string;
  start: number;
  end?: number;
}

interface RawProp {
  name: string;
  params: Record<string, string>;
  value: string;
}

interface Wall {
  y: number;
  mo: number; // 0-based
  d: number;
  h: number;
  mi: number;
  s: number;
}

type ToEpoch = (wall: Wall) => number;

/** Events that overlap [from, to]. Repeats are expanded inside that window. */
export function parseIcs(text: string, from: number, to: number): CalendarEvent[] {
  const lines = text.replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const blocks: RawProp[][] = [];
  let current: RawProp[] | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') current = [];
    else if (line === 'END:VEVENT') {
      if (current) blocks.push(current);
      current = null;
    } else if (current && line) {
      const prop = parseLine(line);
      if (prop) current.push(prop);
    }
  }

  const out: CalendarEvent[] = [];
  const overridden = new Set<string>();
  const masters: RawProp[][] = [];

  for (const props of blocks) {
    const get = (n: string) => props.find((p) => p.name === n);
    if (get('STATUS')?.value.toUpperCase() === 'CANCELLED') {
      const rid = get('RECURRENCE-ID');
      const uid = get('UID')?.value ?? '';
      if (rid) {
        const t = toEpochProp(rid);
        if (t !== null) overridden.add(`${uid}@${t}`);
      }
      continue;
    }
    const rid = get('RECURRENCE-ID');
    if (rid) {
      const t = toEpochProp(rid);
      const uid = get('UID')?.value ?? '';
      if (t !== null) overridden.add(`${uid}@${t}`);
      pushSingle(props, from, to, out);
    } else masters.push(props);
  }

  for (const props of masters) {
    const get = (n: string) => props.find((p) => p.name === n);
    const rrule = get('RRULE');
    if (!rrule) {
      pushSingle(props, from, to, out);
      continue;
    }
    const dtstart = get('DTSTART');
    if (!dtstart || isDateOnly(dtstart)) continue;
    const wall = parseWall(dtstart.value);
    if (!wall) continue;
    const toEpoch = epochConverter(dtstart);
    const start = toEpoch(wall);
    const duration = eventDuration(props, start);
    const uid = get('UID')?.value ?? `${start}`;
    const exdates = new Set(
      props
        .filter((p) => p.name === 'EXDATE')
        .flatMap((p) =>
          p.value.split(',').map((v) => {
            const w = parseWall(v);
            return w ? epochConverter({ ...p, value: v })(w) : NaN;
          }),
        ),
    );
    for (const t of expandRule(rrule.value, wall, toEpoch, from - (duration ?? 0), to)) {
      if (exdates.has(t) || overridden.has(`${uid}@${t}`)) continue;
      out.push({
        uid: `${uid}@${t}`,
        title: unescape(get('SUMMARY')?.value ?? ''),
        location: unescape(get('LOCATION')?.value ?? ''),
        start: t,
        end: duration === undefined ? undefined : t + duration,
      });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

function pushSingle(props: RawProp[], from: number, to: number, out: CalendarEvent[]) {
  const get = (n: string) => props.find((p) => p.name === n);
  const dtstart = get('DTSTART');
  if (!dtstart || isDateOnly(dtstart)) return;
  const start = toEpochProp(dtstart);
  if (start === null) return;
  const duration = eventDuration(props, start);
  const end = duration === undefined ? undefined : start + duration;
  if (start > to || (end ?? start) < from) return;
  out.push({
    uid: get('UID')?.value ?? String(start),
    title: unescape(get('SUMMARY')?.value ?? ''),
    location: unescape(get('LOCATION')?.value ?? ''),
    start,
    end,
  });
}

function eventDuration(props: RawProp[], start: number): number | undefined {
  const dtend = props.find((p) => p.name === 'DTEND');
  if (dtend) {
    const end = toEpochProp(dtend);
    if (end !== null) return end - start;
  }
  const dur = props.find((p) => p.name === 'DURATION');
  if (dur) {
    const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(dur.value);
    if (m) return ((+(m[1] ?? 0) * 24 + +(m[2] ?? 0)) * 60 + +(m[3] ?? 0)) * 60_000 + +(m[4] ?? 0) * 1000;
  }
  return undefined;
}

function parseLine(line: string): RawProp | null {
  // NAME;PARAM=a;PARAM2="b:c":VALUE. Colons can appear inside quoted params.
  let inQuotes = false;
  let split = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ':' && !inQuotes) {
      split = i;
      break;
    }
  }
  if (split < 0) return null;
  const [name, ...paramParts] = line.slice(0, split).split(';');
  const params: Record<string, string> = {};
  for (const part of paramParts) {
    const eq = part.indexOf('=');
    if (eq > 0) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value: line.slice(split + 1) };
}

function isDateOnly(prop: RawProp): boolean {
  return prop.params.VALUE === 'DATE' || /^\d{8}$/.test(prop.value);
}

function parseWall(value: string): Wall | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?/.exec(value.trim());
  if (!m) return null;
  return { y: +m[1], mo: +m[2] - 1, d: +m[3], h: +(m[4] ?? 0), mi: +(m[5] ?? 0), s: +(m[6] ?? 0) };
}

function toEpochProp(prop: RawProp): number | null {
  const wall = parseWall(prop.value);
  return wall ? epochConverter(prop)(wall) : null;
}

function epochConverter(prop: RawProp): ToEpoch {
  if (prop.value.trim().endsWith('Z')) {
    return (w) => Date.UTC(w.y, w.mo, w.d, w.h, w.mi, w.s);
  }
  const tz = resolveZone(prop.params.TZID);
  if (tz) return (w) => zonedToEpoch(w, tz);
  // A "floating" time means the device's own local time.
  return (w) => new Date(w.y, w.mo, w.d, w.h, w.mi, w.s).getTime();
}

// Outlook writes Windows zone names. These are the common ones.
const WINDOWS_ZONES: Record<string, string> = {
  'Eastern Standard Time': 'America/New_York',
  'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver',
  'US Mountain Standard Time': 'America/Phoenix',
  'Pacific Standard Time': 'America/Los_Angeles',
  'Alaskan Standard Time': 'America/Anchorage',
  'Hawaiian Standard Time': 'Pacific/Honolulu',
  'GMT Standard Time': 'Europe/London',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Romance Standard Time': 'Europe/Paris',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'India Standard Time': 'Asia/Kolkata',
  UTC: 'UTC',
};

function resolveZone(tzid: string | undefined): string | null {
  if (!tzid) return null;
  const name = WINDOWS_ZONES[tzid] ?? tzid.replace(/^\/[^/]*\//, '');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name });
    return name;
  } catch {
    return null;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** How far `zone` is ahead of UTC at instant `t`, in ms. */
function zoneOffset(t: number, zone: string): number {
  let fmt = formatters.get(zone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(zone, fmt);
  }
  const parts = Object.fromEntries(fmt.formatToParts(t).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(t / 1000) * 1000;
}

export function zonedToEpoch(w: Wall, zone: string): number {
  const guess = Date.UTC(w.y, w.mo, w.d, w.h, w.mi, w.s);
  const first = guess - zoneOffset(guess, zone);
  const second = guess - zoneOffset(first, zone);
  return second;
}

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
// Guards against a malformed rule looping forever. Daily since 1900 is ~46k.
const MAX_STEPS = 100_000;

/** Occurrence start times (epoch ms) inside [from, to]. Supports DAILY and WEEKLY. */
function expandRule(rule: string, start: Wall, toEpoch: ToEpoch, from: number, to: number): number[] {
  const parts = Object.fromEntries(
    rule.split(';').map((kv) => {
      const [k, v] = kv.split('=');
      return [k.toUpperCase(), v ?? ''];
    }),
  );
  const freq = parts.FREQ;
  if (freq !== 'DAILY' && freq !== 'WEEKLY') {
    // Unsupported repeat: keep the first occurrence so the shift isn't lost.
    const t = toEpoch(start);
    return t >= from && t <= to ? [t] : [];
  }
  const interval = Math.max(1, Number(parts.INTERVAL) || 1);
  const count = parts.COUNT ? Number(parts.COUNT) : Infinity;
  const untilWall = parts.UNTIL ? parseWall(parts.UNTIL) : null;
  const until = untilWall
    ? parts.UNTIL.endsWith('Z')
      ? Date.UTC(untilWall.y, untilWall.mo, untilWall.d, untilWall.h, untilWall.mi, untilWall.s)
      : toEpoch(untilWall)
    : Infinity;

  // Do date arithmetic on a UTC "wall clock" so DST never shifts the time of day.
  const startDay = Date.UTC(start.y, start.mo, start.d);
  const dayAt = (dayUtc: number): number => {
    const d = new Date(dayUtc);
    return toEpoch({ ...start, y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate() });
  };

  let byDay: number[];
  if (freq === 'WEEKLY') {
    byDay = parts.BYDAY
      ? parts.BYDAY.split(',').map((c) => DAY_CODES.indexOf(c.slice(-2).toUpperCase())).filter((i) => i >= 0)
      : [new Date(startDay).getUTCDay()];
  } else byDay = [];

  const out: number[] = [];
  let emitted = 0;
  let steps = 0;
  const consider = (dayUtc: number): boolean => {
    if (++steps > MAX_STEPS) return false;
    if (dayUtc < startDay) return true;
    const t = dayAt(dayUtc);
    if (t > until || t > to || emitted >= count) return false;
    emitted++;
    if (t >= from) out.push(t);
    return true;
  };

  if (freq === 'DAILY') {
    for (let day = startDay; ; day += interval * DAY) if (!consider(day)) break;
  } else {
    // Weeks start on Monday unless WKST says otherwise.
    const wkst = DAY_CODES.indexOf((parts.WKST ?? 'MO').toUpperCase());
    const back = (new Date(startDay).getUTCDay() - wkst + 7) % 7;
    const sorted = [...new Set(byDay)].sort((a, b) => ((a - wkst + 7) % 7) - ((b - wkst + 7) % 7));
    outer: for (let week = startDay - back * DAY; ; week += interval * 7 * DAY) {
      for (const dow of sorted) {
        if (!consider(week + ((dow - wkst + 7) % 7) * DAY)) break outer;
      }
    }
  }
  return out;
}

function unescape(value: string): string {
  return value.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
}
