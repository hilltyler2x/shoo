export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Whole minutes from `from` to `to`, rounded up so "0.2 minutes" reads as 1. */
export function minutesBetween(from: number, to: number): number {
  return Math.ceil((to - from) / MINUTE);
}

/** "1h 5m", "12m", "now". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / MINUTE));
  if (total === 0) return 'now';
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Parses "HH:MM" into minutes after midnight, or null. */
export function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}
