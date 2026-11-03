import type { Occasion } from './messages';
import type { PlaceKind, Settings } from './types';

/**
 * Free vs Shoo Pro. Free gets you to one place (usually work) on time, with
 * live traffic and the first two nag tiers. Pro is everything else: more
 * places, calendars and imports, Panic mode, and jokes for every occasion.
 */
export type ProFeature = 'places' | 'calendars' | 'phoneCalendar' | 'quickAdd' | 'panic' | 'occasions' | 'elsewhere';

export const FREE_PLACES = 1;

export const PRO_PITCH: Record<ProFeature, string> = {
  places: 'Free covers one place. Pro adds as many as you like: the gym, class, the dentist, the airport.',
  calendars: 'Pro links your calendars and shift apps (Homebase, When I Work, 7shifts, Deputy) so plans show up on their own.',
  phoneCalendar: "Pro reads your phone's calendar and Reminders so you never type a plan in.",
  quickAdd: 'Pro reads pasted schedules, confirmation emails and screenshots for you.',
  panic: 'Free nags go up to Getting serious. Pro adds Panic mode for the truly couch-bound.',
  occasions: 'Pro has jokes for every occasion: dentist, date night, flights, kids pickup and more.',
  elsewhere: 'Free covers one saved place. Pro times a trip anywhere.',
};

/**
 * What a free account actually plans with. Nothing is deleted: the rest
 * comes back the moment you go Pro.
 */
export function applyFreeLimits(settings: Settings): Settings {
  const places = settings.places.slice(0, FREE_PLACES);
  const ids = new Set(places.map((p) => p.id));
  const atFreePlace = (placeId?: string) => placeId === undefined || ids.has(placeId);
  return {
    ...settings,
    places,
    calendars: [],
    deviceCalendar: false,
    weekly: settings.weekly.filter((w) => atFreePlace(w.placeId)),
    // One-time plans only at the free place (not "somewhere else").
    manualShifts: settings.manualShifts.filter((s) => s.placeId !== undefined && ids.has(s.placeId)),
    placeFor: Object.fromEntries(Object.entries(settings.placeFor).filter(([, id]) => ids.has(id))),
  };
}

/** Free gets one joke pack: work jokes at work, the general set anywhere else. */
export function freeOccasion(kind: PlaceKind | undefined): Occasion {
  return kind === 'work' ? 'work' : 'other';
}
