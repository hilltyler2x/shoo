import type { LatLng, Place, PlaceKind, SavedPlace, Settings, Shift } from './types';
import { DEFAULT_SETTINGS } from './types';

export const PLACE_KINDS: Record<PlaceKind, { icon: string; label: string; arriveEarlyMinutes?: number }> = {
  work: { icon: '💼', label: 'Work' },
  school: { icon: '🎓', label: 'School' },
  gym: { icon: '🏋️', label: 'Gym' },
  doctor: { icon: '🩺', label: 'Doctor' },
  airport: { icon: '✈️', label: 'Airport', arriveEarlyMinutes: 90 },
  social: { icon: '🍻', label: 'Friends' },
  other: { icon: '📍', label: 'Somewhere' },
};

/** Where a plan is, worked out from whatever its source told us. */
export interface Destination {
  location: LatLng;
  name: string;
  icon: string;
  kind: PlaceKind;
  arriveEarlyMinutes: number;
  /** The saved place, if it is one. */
  placeId?: string;
}

/** Looked-up addresses, by addressKey. null = looked up, found nothing. */
export type Geocoded = Record<string, Place | null>;

export function addressKey(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Video calls and phone numbers aren't places you drive to. */
export function isVirtual(address: string): boolean {
  const a = address.trim().toLowerCase();
  if (!a) return true;
  if (/^(https?:|www\.)/.test(a)) return true;
  if (/\b(zoom|teams|google meet|meet\.google|webex|facetime|skype|online|virtual|remote|phone call|tbd|tba)\b/.test(a)) return true;
  return /^[\d\s()+-]{7,}$/.test(a);
}

/**
 * A calendar location that names one of your saved places: "Work",
 * "Planet Fitness", or the start of its address.
 */
export function matchPlace(address: string, places: SavedPlace[]): SavedPlace | undefined {
  const a = addressKey(address);
  if (!a) return undefined;
  for (const p of places) {
    const name = addressKey(p.name);
    if (name.length >= 3 && (a === name || new RegExp(`\\b${escapeRegExp(name)}\\b`).test(a))) return p;
  }
  for (const p of places) {
    const first = addressKey(p.label.split(',')[0] ?? '');
    if (first.length >= 6 && a.includes(first)) return p;
  }
  return undefined;
}

export function destinationFor(
  shift: Shift,
  settings: Pick<Settings, 'places' | 'placeFor' | 'arriveEarlyMinutes'>,
  geocoded: Geocoded,
): Destination | null {
  const placeId = settings.placeFor[shift.id] ?? shift.placeId;
  if (placeId) {
    const saved = settings.places.find((p) => p.id === placeId);
    if (saved) return fromSaved(saved, settings.arriveEarlyMinutes);
  }
  // "Gym" in the title is a good hint when the event doesn't say where.
  const hint = shift.address ?? (shift.location ? undefined : shift.title);
  if (hint) {
    const saved = matchPlace(hint, settings.places);
    if (saved) return fromSaved(saved, settings.arriveEarlyMinutes);
  }
  const location = shift.location ?? (shift.address ? geocoded[addressKey(shift.address)]?.location : undefined);
  if (!location) return null;
  return {
    location,
    name: shortName(shift.address ?? shift.title),
    icon: PLACE_KINDS.other.icon,
    kind: 'other',
    arriveEarlyMinutes: settings.arriveEarlyMinutes,
  };
}

/** Addresses Shoo should look up before it can plan a trip. */
export function addressesToLookUp(
  shifts: Shift[],
  settings: Pick<Settings, 'places' | 'placeFor'>,
  geocoded: Geocoded,
): string[] {
  const out = new Set<string>();
  for (const s of shifts) {
    if (!s.address || s.location || settings.placeFor[s.id] || s.placeId) continue;
    if (isVirtual(s.address) || matchPlace(s.address, settings.places)) continue;
    if (addressKey(s.address) in geocoded) continue;
    out.add(s.address);
  }
  return [...out];
}

function fromSaved(p: SavedPlace, fallbackEarly: number): Destination {
  return {
    location: p.location,
    name: p.name,
    icon: PLACE_KINDS[p.kind]?.icon ?? PLACE_KINDS.other.icon,
    kind: p.kind,
    arriveEarlyMinutes: p.arriveEarlyMinutes ?? PLACE_KINDS[p.kind]?.arriveEarlyMinutes ?? fallbackEarly,
    placeId: p.id,
  };
}

/** "Blue Bottle Coffee, 300 Webster St, Oakland" → "Blue Bottle Coffee" */
export function shortName(address: string): string {
  const first = address.split(/[,\n]/)[0].trim();
  return first.length > 32 ? `${first.slice(0, 31)}…` : first || 'there';
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Settings saved by older versions of Shoo had one job, one calendar link,
 * and assumed every shift was at work. Turn them into today's shape.
 */
export function migrateSettings(raw: Record<string, unknown>): Settings {
  const old = raw as Partial<Settings> & {
    job?: Place | null;
    calendarUrl?: string;
    calendarKeyword?: string;
  };
  const settings: Settings = { ...DEFAULT_SETTINGS, ...old };
  delete (settings as { job?: unknown }).job;
  delete (settings as { calendarUrl?: unknown }).calendarUrl;
  delete (settings as { calendarKeyword?: unknown }).calendarKeyword;

  if (old.places) return settings;

  const work: SavedPlace | null = old.job ? { ...old.job, id: 'work', name: 'Work', kind: 'work' } : null;
  const workId = work ? work.id : undefined;
  settings.places = work ? [work] : [];
  settings.weekly = (old.weekly ?? []).map((w) => ({ title: 'Work', placeId: workId, ...w }));
  settings.manualShifts = (old.manualShifts ?? []).map((s) => ({ placeId: workId, ...s }));
  settings.calendars = old.calendarUrl
    ? [{ id: 'cal1', name: 'Work schedule', url: old.calendarUrl, placeId: workId ?? '', keyword: old.calendarKeyword ?? '' }]
    : [];
  return settings;
}
