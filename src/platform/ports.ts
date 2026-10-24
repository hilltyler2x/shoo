// What the app needs from the device. The website and the phone apps each
// plug in their own version, so nothing above this line cares which it is.

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
}
