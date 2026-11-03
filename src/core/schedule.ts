import { DAY } from './time';

/**
 * Reads shifts out of a schedule someone pasted or photographed: a Homebase
 * screenshot, a text from a manager, a printed rota. Forgiving on purpose:
 *
 *   Mon 11/4 9:00am - 5:00pm
 *   Tuesday, Nov 5   2-10pm
 *   Wed               OFF
 *   11/07/2026 07:00 – 15:30
 *
 * A date or weekday applies to the times after it, on its line or the lines
 * below. A row of dates followed by a row of the same number of times (a
 * weekly grid) is paired up column by column.
 */
export interface ParsedShift {
  start: number;
  end: number;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const MONTH_DATE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(\d{4}))?/gi;
const DAY_MONTH = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\b(?:,?\s+(\d{4}))?/gi;
const NUMERIC_DATE = /(?<![\d:.])(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?(?![\d:])/g;
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const WEEKDAY = /\b(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)\b\.?/gi;
const TIME = String.raw`(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m?\.?|p\.?m?\.?)?`;
const RANGE = new RegExp(String.raw`(?<![\d/-])${TIME}\s*(?:-|–|—|to|until|till)\s*${TIME}(?![\d/])`, 'gi');

interface DateHit {
  index: number;
  /** Midnight, local time. */
  day: number;
}

interface RangeHit {
  index: number;
  startMin: number;
  endMin: number;
}

export function parseSchedule(text: string, now: number): ParsedShift[] {
  const lines = text.split(/\r?\n/);
  const out: ParsedShift[] = [];
  let current: number | null = null;
  let pendingRow: DateHit[] = [];

  for (const line of lines) {
    const ranges = findRanges(line);
    // Strip the times first so "9-5" can't be read as a date.
    const dates = findDates(blank(line, RANGE), now);

    if (dates.length > 1 && ranges.length === 0) {
      pendingRow = dates;
      current = dates[dates.length - 1].day;
      continue;
    }
    if (pendingRow.length > 1 && ranges.length === pendingRow.length && dates.length === 0) {
      ranges.forEach((r, i) => out.push(toShift(pendingRow[i].day, r)));
      pendingRow = [];
      continue;
    }
    pendingRow = [];

    // Each time range belongs to the closest date before it on the line, or the last one seen.
    for (const r of ranges) {
      const before = dates.filter((d) => d.index < r.index);
      const day = before.length ? before[before.length - 1].day : dates.length ? dates[0].day : current;
      if (day !== null) out.push(toShift(day, r));
    }
    if (dates.length) current = dates[dates.length - 1].day;
  }

  const seen = new Set<string>();
  return out
    .filter((s) => {
      const key = `${s.start}-${s.end}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.start - b.start);
}

function toShift(day: number, r: RangeHit): ParsedShift {
  const start = atMinutes(day, r.startMin);
  let end = atMinutes(day, r.endMin);
  if (end <= start) end = atMinutes(day + DAY + 2 * 3_600_000, r.endMin); // overnight
  return { start, end };
}

function findRanges(line: string): RangeHit[] {
  const out: RangeHit[] = [];
  for (const m of blank(line, ISO_DATE).matchAll(RANGE)) {
    const range = toMinutes(m);
    if (range) out.push({ index: m.index ?? 0, ...range });
  }
  return out;
}

function toMinutes(m: RegExpMatchArray): { startMin: number; endMin: number } | null {
  const [, h1s, m1s, ap1, h2s, m2s, ap2] = m;
  let h1 = Number(h1s);
  let h2 = Number(h2s);
  const m1 = Number(m1s ?? 0);
  const m2 = Number(m2s ?? 0);
  if (h1 > 23 || h2 > 23 || m1 > 59 || m2 > 59) return null;
  const mer1 = meridiem(ap1);
  const mer2 = meridiem(ap2);
  const twentyFour = h1 > 12 || h2 > 12 || /^0\d/.test(h1s) || /^0\d/.test(h2s);

  if (!twentyFour) {
    if (mer1 && mer2) {
      h1 = to24(h1, mer1);
      h2 = to24(h2, mer2);
    } else if (mer2) {
      // "2-10pm" is 2pm to 10pm, but "9-5pm" is 9am to 5pm.
      h2 = to24(h2, mer2);
      const same = to24(h1, mer2);
      h1 = same * 60 + m1 <= h2 * 60 + m2 ? same : to24(h1, mer2 === 'am' ? 'pm' : 'am');
    } else if (mer1) {
      h1 = to24(h1, mer1);
      const same = to24(h2, mer1);
      h2 = same * 60 + m2 > h1 * 60 + m1 ? same : to24(h2, mer1 === 'am' ? 'pm' : 'am');
    } else {
      // No am/pm anywhere: shifts mostly start in the day. 1-6 is afternoon.
      if (h1 >= 1 && h1 <= 6) h1 += 12;
      if (h2 * 60 + m2 <= h1 * 60 + m1 && h2 < 12) h2 += 12;
    }
  }
  const startMin = (h1 % 24) * 60 + m1;
  const endMin = (h2 % 24) * 60 + m2;
  if (startMin === endMin) return null;
  return { startMin, endMin };
}

function meridiem(ap: string | undefined): 'am' | 'pm' | null {
  if (!ap) return null;
  return ap.toLowerCase().startsWith('p') ? 'pm' : 'am';
}

function to24(h: number, mer: 'am' | 'pm'): number {
  if (mer === 'am') return h === 12 ? 0 : h;
  return h === 12 ? 12 : h + 12;
}

function findDates(line: string, now: number): DateHit[] {
  const hits: DateHit[] = [];
  const taken: [number, number][] = [];
  const add = (index: number, length: number, day: number | null) => {
    if (day === null || taken.some(([a, b]) => index < b && index + length > a)) return;
    taken.push([index, index + length]);
    hits.push({ index, day });
  };

  for (const m of line.matchAll(ISO_DATE)) {
    add(m.index!, m[0].length, makeDay(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  }
  for (const m of line.matchAll(MONTH_DATE)) {
    add(m.index!, m[0].length, dayNear(monthIndex(m[1]), Number(m[2]), m[3], now));
  }
  for (const m of line.matchAll(DAY_MONTH)) {
    add(m.index!, m[0].length, dayNear(monthIndex(m[2]), Number(m[1]), m[3], now));
  }
  for (const m of line.matchAll(NUMERIC_DATE)) {
    // US order: month/day.
    add(m.index!, m[0].length, dayNear(Number(m[1]) - 1, Number(m[2]), m[3], now));
  }
  // A weekday on its own means the next one coming up (today counts).
  for (const m of line.matchAll(WEEKDAY)) {
    const near = hits.some((h) => Math.abs(h.index - m.index!) < 16);
    if (near) continue;
    add(m.index!, m[0].length, nextWeekday(WEEKDAYS.indexOf(m[1].toLowerCase().slice(0, 3)), now));
  }
  return hits.sort((a, b) => a.index - b.index);
}

function monthIndex(name: string): number {
  return MONTHS.indexOf(name.toLowerCase().slice(0, 3));
}

/** The date with this month and day closest to now: last week's or the coming year's. */
function dayNear(month: number, date: number, year: string | undefined, now: number): number | null {
  if (month < 0 || month > 11 || date < 1 || date > 31) return null;
  if (year) {
    const y = Number(year.length === 2 ? `20${year}` : year);
    return makeDay(y, month, date);
  }
  const thisYear = new Date(now).getFullYear();
  for (const y of [thisYear, thisYear + 1]) {
    const day = makeDay(y, month, date);
    if (day !== null && day >= startOfDay(now) - 14 * DAY) return day;
  }
  return null;
}

function makeDay(y: number, month: number, date: number): number | null {
  const d = new Date(y, month, date);
  if (d.getMonth() !== month || d.getDate() !== date) return null;
  return d.getTime();
}

function nextWeekday(weekday: number, now: number): number | null {
  if (weekday < 0) return null;
  const d = new Date(startOfDay(now));
  d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7));
  return d.getTime();
}

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function atMinutes(day: number, minutes: number): number {
  const d = new Date(day);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d.getTime();
}

function blank(line: string, pattern: RegExp): string {
  return line.replace(pattern, (m) => ' '.repeat(m.length));
}

export interface ParsedPlan {
  start: number;
  /** A street address found in the text, if any. */
  address?: string;
}

const SINGLE_TIME = /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])|\b([01]?\d|2[0-3]):([0-5]\d)\b/i;
const STREET =
  /\b\d{1,6}\s+(?:[A-Za-z0-9.'’-]+\s+){0,5}(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court|pl|place|pkwy|parkway|hwy|highway|cir|circle|ter|terrace|sq|square|plaza)\b\.?(?:[^\n]{0,60})/i;

/**
 * One plan out of a confirmation email or text: "Your appointment is on
 * Thursday, November 5 at 2:30 PM ... 1 Health Way, Austin, TX". The first
 * date with a time on its line (or the next line) wins.
 */
export function parsePlan(text: string, now: number): ParsedPlan | null {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const dates = findDates(lines[i], now);
    if (dates.length === 0) continue;
    const after = lines[i].slice(dates[0].index);
    const time = SINGLE_TIME.exec(after) ?? SINGLE_TIME.exec(lines[i + 1] ?? '');
    if (!time) continue;
    const minutes = time[3]
      ? to24(Number(time[1]), meridiem(time[3])!) * 60 + Number(time[2] ?? 0)
      : Number(time[4]) * 60 + Number(time[5]);
    if (Number(time[1] ?? 0) > 12) continue;
    const address = STREET.exec(text)?.[0].trim().replace(/[.,;]$/, '');
    return { start: atMinutes(dates[0].day, minutes), ...(address ? { address } : {}) };
  }
  return null;
}
