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

export interface StoragePort {
  load<T>(key: string, fallback: T): T;
  save<T>(key: string, value: T): void;
}

export interface Platform {
  name: 'web' | 'ios' | 'android';
  notifications: NotificationPort;
  location: LocationPort;
  storage: StoragePort;
}
