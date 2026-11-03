import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { CalendarEvent } from '../../core/ics';
import type { ScheduledNag } from '../../core/types';
import type { PermissionState, TripEvent, TripWatch } from '../ports';

type BackgroundState = PermissionState | 'when-in-use';

/** The app's own native plugin: ios/App/App/ShooNative.swift and android/.../ShooNativePlugin.java. */
export interface ShooNativePlugin {
  permissionStatus(): Promise<{ notifications: PermissionState; backgroundLocation: BackgroundState }>;
  requestNotifications(): Promise<{ notifications: PermissionState }>;
  requestBackgroundLocation(): Promise<{ backgroundLocation: BackgroundState }>;
  openSettings(): Promise<void>;
  scheduleNags(options: { nags: ScheduledNag[] }): Promise<void>;
  cancelAllNags(): Promise<void>;
  showNow(options: { title: string; body: string }): Promise<void>;
  watchTrip(options: TripWatch): Promise<void>;
  clearTrip(): Promise<void>;
  markLeft(): Promise<void>;
  takeTripEvents(): Promise<{ events: TripEvent[] }>;
  calendarStatus(): Promise<{ calendar: PermissionState; reminders: PermissionState }>;
  requestCalendar(options: { which: 'calendar' | 'reminders' }): Promise<{ state: PermissionState }>;
  calendarEvents(options: { from: number; to: number }): Promise<{ events: CalendarEvent[] }>;
  addListener(event: 'trip', fn: (e: TripEvent) => void): Promise<PluginListenerHandle>;
}

export const ShooNative = registerPlugin<ShooNativePlugin>('ShooNative');
