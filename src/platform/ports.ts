// What the app needs from the device. The website and the phone apps each
// plug in their own version, so nothing above this line cares which it is.

import type { CalendarEvent } from '../core/ics';
import type { LatLng, ScheduledNag } from '../core/types';

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

export interface NotificationPort {
  /** True when nags fire even with the app closed (phone apps). */
  readonly firesWhenClosed: boolean;
  permission(): Promise<PermissionState>;
  request(): Promise<PermissionState>;
  /** Replaces every pending nag with this list. */
  schedule(nags: ScheduledNag[]): Promise<void>;
  cancelAll(): Promise<void>;
  showNow(title: string, body: string): Promise<void>;
}

export interface LocationPort {
  current(): Promise<LatLng | null>;
  /** Calls back on each new fix. Returns a stop function. */
  watch(onFix: (fix: LatLng) => void, onError?: (message: string) => void): () => void;
}

export interface TripWatch {
  shiftId: string;
  shiftStart: number;
  /** Leaving before this doesn't count (a late-night snack run). */
  watchFrom: number;
  origin: LatLng;
  /** Where you're headed. (Called "job" on the native side, from when that was the only place.) */
  job: LatLng;
  radius: number;
  celebrateTitle: string;
  onTimeBody: string;
  lateBody: string;
}

export interface TripEvent {
  type: 'left' | 'arrived';
  shiftId: string;
  at: number;
}

/**
 * Watches for leaving and arriving while the app is closed (geofences), and
 * cancels the rest of a shift's nags by itself. The website can't do this,
 * so there it does nothing and the app watches location while it's open.
 */
export interface TripPort {
  readonly native: boolean;
  /** "granted" means "Always" location: geofences work with the app closed. */
  backgroundPermission(): Promise<PermissionState | 'when-in-use'>;
  requestBackground(): Promise<PermissionState | 'when-in-use'>;
  openSettings(): Promise<void>;
  watch(trip: TripWatch): Promise<void>;
  clear(): Promise<void>;
  markLeft(): Promise<void>;
  /** Events that happened while the app wasn't listening. Clears them. */
  takeEvents(): Promise<TripEvent[]>;
  onEvent(fn: (event: TripEvent) => void): () => void;
}

/** The App Store / Play Store review prompt. The website has no store, so there it does nothing. */
export interface ReviewPort {
  readonly available: boolean;
  /** Shows the store's own review prompt (the OS may decide not to). */
  request(): Promise<void>;
  /** The store page to send people to from a "Rate Shoo" button, if known. */
  readonly storeUrl: string | null;
}

/**
 * The phone's own calendar and (on iPhone) the Reminders app. Read-only.
 * The website can't reach either, so there it's unavailable.
 */
export interface DeviceCalendarPort {
  readonly available: boolean;
  /** Reminders app support (iPhone only). */
  readonly reminders: boolean;
  permission(): Promise<{ calendar: PermissionState; reminders: PermissionState }>;
  request(which: 'calendar' | 'reminders'): Promise<PermissionState>;
  /** Timed events and reminders between two times. All-day ones are left out. */
  events(from: number, to: number): Promise<CalendarEvent[]>;
}

export interface ProOption {
  /** Store package id, passed back to buy(). */
  id: string;
  kind: 'monthly' | 'annual' | 'lifetime';
  /** "$4.99", in the shopper's own currency. */
  price: string;
  /** "7-day free trial" or "$1.99/mo for 3 months", when the store has one. */
  intro: string | null;
}

/**
 * Shoo Pro through the App Store and Google Play (RevenueCat). Not available
 * on the website or before the store keys exist; then everything is unlocked.
 */
export interface PurchasesPort {
  readonly available: boolean;
  isPro(): Promise<boolean>;
  options(): Promise<ProOption[]>;
  /** True if it went through; false if they backed out. Throws on a real error. */
  buy(id: string): Promise<boolean>;
  restore(): Promise<boolean>;
  onChange(fn: (pro: boolean) => void): () => void;
}

export interface StoragePort {
  load<T>(key: string, fallback: T): T;
  save<T>(key: string, value: T): void;
}

export interface Platform {
  name: 'web' | 'ios' | 'android';
  notifications: NotificationPort;
  location: LocationPort;
  storage: StoragePort;
  trip: TripPort;
  reviews: ReviewPort;
  deviceCalendar: DeviceCalendarPort;
  purchases: PurchasesPort;
}
