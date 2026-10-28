import type { CalendarEvent } from './ics';
import { DAY, MINUTE, parseClock } from './time';
import type { Settings, Shift, WeeklyShift } from './types';

/** Weekly shifts turned into real dates between `from` and `to`, in local time. */
export function expandWeekly(weekly: WeeklyShift[], from: number, to: number): Shift[] {
  const out: Shift[] = [];
  const first = new Date(from);
  first.setHours(0, 0, 0, 0);
  for (let day = new Date(first); day.getTime() <= to; day.setDate(day.getDate() + 1)) {
    for (const w of weekly) {
      if (!w.days.includes(day.getDay())) continue;
      const startMin = parseClock(w.start);
      if (startMin === null) continue;
      const start = atMinutes(day, startMin);
      const endMin = w.end ? parseClock(w.end) : null;
      let end: number | undefined;
      if (endMin !== null) {
        end = atMinutes(day, endMin);
        if (end <= start) end += DAY; // overnight shift
      }
      if (start < from || start > to) continue;
      out.push({ id: `weekly:${w.id}:${dateKey(day)}`, title: 'Work', start, end, source: 'weekly' });
    }
  }
  return out;
}

export function calendarShifts(events: CalendarEvent[], keyword: string): Shift[] {
  const needle = keyword.trim().toLowerCase();
  return events
    .filter((e) => !needle || e.title.toLowerCase().includes(needle))
    .map((e) => ({ id: `cal:${e.uid}`, title: e.title || 'Work', start: e.start, end: e.end, source: 'calendar' }));
}

const SOURCE_RANK: Record<Shift['source'], number> = { manual: 0, calendar: 1, weekly: 2 };

/**
 * Every known shift from now until `horizonDays` out, soonest first. A shift
 * that started in the last `graceMinutes` still counts, so the late nags have
 * somewhere to live. Two shifts starting within a minute of each other are
 * the same shift (a manual entry wins over the calendar, which wins over the
 * weekly pattern).
 */
export function upcomingShifts(
  settings: Pick<Settings, 'weekly' | 'manualShifts' | 'calendarKeyword'>,
  events: CalendarEvent[],
  now: number,
  horizonDays = 7,
  graceMinutes = 15,
): Shift[] {
  const from = now - graceMinutes * MINUTE;
  const to = now + horizonDays * DAY;
  const all = [
    ...settings.manualShifts,
    ...calendarShifts(events, settings.calendarKeyword),
    ...expandWeekly(settings.weekly, from, to),
  ]
    .filter((s) => s.start >= from && s.start <= to)
    .sort((a, b) => a.start - b.start || SOURCE_RANK[a.source] - SOURCE_RANK[b.source]);

  const out: Shift[] = [];
  for (const s of all) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.start - s.start) < MINUTE) continue;
    out.push(s);
  }
  return out;
}

function atMinutes(day: Date, minutes: number): number {
  const d = new Date(day);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d.getTime();
}

function dateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
