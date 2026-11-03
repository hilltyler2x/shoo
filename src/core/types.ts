// Platform-neutral types. Nothing in src/core may touch the browser, the
// network, or Capacitor: the phone apps reuse this folder unchanged.

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Place {
  label: string;
  location: LatLng;
}

export type PlaceKind = 'work' | 'school' | 'gym' | 'doctor' | 'airport' | 'social' | 'other';

/** A place you go often, saved by name ("Work", "Gym"). */
export interface SavedPlace extends Place {
  id: string;
  name: string;
  kind: PlaceKind;
  /** Overrides Settings.arriveEarlyMinutes here (airports want a lot more). */
  arriveEarlyMinutes?: number;
}

export type TravelMode = 'drive' | 'transit' | 'walk' | 'bike';

export type ShiftSource = 'manual' | 'weekly' | 'calendar' | 'device';

/**
 * Anything with a start time and somewhere to be: a work shift, a class, a
 * dentist appointment, a flight. (Named for where Shoo started.)
 */
export interface Shift {
  id: string;
  title: string;
  /** Epoch milliseconds. */
  start: number;
  end?: number;
  source: ShiftSource;
  /** A saved place. */
  placeId?: string;
  /** Free-text address, e.g. a calendar event's location. Looked up later. */
  address?: string;
  /** Coordinates the source already knows (the phone calendar often does). */
  location?: LatLng;
}

/** A repeating plan, e.g. work every Monday 09:00 to 17:00. */
export interface WeeklyShift {
  id: string;
  /** 0 = Sunday ... 6 = Saturday, matching Date#getDay. */
  days: number[];
  /** "HH:MM", 24 hour, local time. */
  start: string;
  end?: string;
  title?: string;
  placeId?: string;
}

/** A calendar shared by link: Google, Outlook, iCloud, or a scheduling app like Homebase. */
export interface CalendarFeed {
  id: string;
  name: string;
  /** Secret iCal address. */
  url: string;
  /** Every event goes to this saved place. Empty = each event's own location. */
  placeId: string;
  /** Only events whose title contains this. Empty = all. */
  keyword: string;
}

export interface Settings {
  places: SavedPlace[];
  /** Used as the starting point when the device can't share its location. */
  home: Place | null;
  travelMode: TravelMode;
  /** Minutes it takes to get out the door (shoes, keys, coffee). */
  prepMinutes: number;
  /** Minutes you want to be there before things start. */
  arriveEarlyMinutes: number;
  weekly: WeeklyShift[];
  manualShifts: Shift[];
  calendars: CalendarFeed[];
  /** Phone apps: read the phone's own calendar. */
  deviceCalendar: boolean;
  /** Places picked by hand for single plans, by plan id. Wins over everything else. */
  placeFor: Record<string, string>;
}

export const DEFAULT_SETTINGS: Settings = {
  places: [],
  home: null,
  travelMode: 'drive',
  prepMinutes: 10,
  arriveEarlyMinutes: 5,
  weekly: [],
  manualShifts: [],
  calendars: [],
  deviceCalendar: false,
  placeFor: {},
};

export type NagTier = 'gentle' | 'serious' | 'panic' | 'celebrate';

export interface ScheduledNag {
  /** Stable id so a platform can replace or cancel it. */
  id: string;
  shiftId: string;
  /** Epoch milliseconds. */
  at: number;
  tier: NagTier;
  title: string;
  body: string;
}

export interface TravelEstimate {
  minutes: number;
  distanceMeters: number;
  /** True when the minutes include live traffic. */
  trafficAware: boolean;
  provider: string;
}
