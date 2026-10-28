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

export type TravelMode = 'drive' | 'transit' | 'walk' | 'bike';

export type ShiftSource = 'manual' | 'weekly' | 'calendar';

export interface Shift {
  id: string;
  title: string;
  /** Epoch milliseconds. */
  start: number;
  end?: number;
  source: ShiftSource;
}

/** A repeating shift, e.g. every Monday 09:00 to 17:00. */
export interface WeeklyShift {
  id: string;
  /** 0 = Sunday ... 6 = Saturday, matching Date#getDay. */
  days: number[];
  /** "HH:MM", 24 hour, local time. */
  start: string;
  end?: string;
}

export interface Settings {
  job: Place | null;
  /** Used as the starting point when the device can't share its location. */
  home: Place | null;
  travelMode: TravelMode;
  /** Minutes it takes to get out the door (shoes, keys, coffee). */
  prepMinutes: number;
  /** Minutes you want to be there before the shift starts. */
  arriveEarlyMinutes: number;
  weekly: WeeklyShift[];
  manualShifts: Shift[];
  /** Secret iCal address of a calendar (Google, Outlook, iCloud). */
  calendarUrl: string;
  /** Only calendar events whose title contains this count as shifts. Empty = all. */
  calendarKeyword: string;
}

export const DEFAULT_SETTINGS: Settings = {
  job: null,
  home: null,
  travelMode: 'drive',
  prepMinutes: 10,
  arriveEarlyMinutes: 5,
  weekly: [],
  manualShifts: [],
  calendarUrl: '',
  calendarKeyword: '',
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
