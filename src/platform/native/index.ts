import { InAppReview } from '@capacitor-community/in-app-review';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import type { LatLng } from '../../core/types';
import type { LocationPort, NotificationPort, ReviewPort, TripPort } from '../ports';
import { ShooNative } from './shooNative';

export const nativeNotifications: NotificationPort = {
  firesWhenClosed: true,
  permission: async () => (await ShooNative.permissionStatus()).notifications,
  request: async () => (await ShooNative.requestNotifications()).notifications,
  schedule: (nags) => ShooNative.scheduleNags({ nags }),
  cancelAll: () => ShooNative.cancelAllNags(),
  showNow: (title, body) => ShooNative.showNow({ title, body }),
};

const toLatLng = (p: { coords: { latitude: number; longitude: number } }): LatLng => ({
  lat: p.coords.latitude,
  lng: p.coords.longitude,
});

export const nativeLocation: LocationPort = {
  async current() {
    try {
      return toLatLng(await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 20_000 }));
    } catch {
      return null;
    }
  },
  watch(onFix, onError) {
    let id: string | null = null;
    let stopped = false;
    Geolocation.watchPosition({ enableHighAccuracy: true }, (pos, err) => {
      if (err || !pos) onError?.('Location is turned off for Shoo.');
      else onFix(toLatLng(pos));
    })
      .then((watchId) => {
        id = watchId;
        if (stopped) void Geolocation.clearWatch({ id });
      })
      .catch(() => onError?.('Location is turned off for Shoo.'));
    return () => {
      stopped = true;
      if (id) void Geolocation.clearWatch({ id });
    };
  },
};

export const nativeTrip: TripPort = {
  native: true,
  backgroundPermission: async () => (await ShooNative.permissionStatus()).backgroundLocation,
  requestBackground: async () => (await ShooNative.requestBackgroundLocation()).backgroundLocation,
  openSettings: () => ShooNative.openSettings(),
  watch: (trip) => ShooNative.watchTrip(trip),
  clear: () => ShooNative.clearTrip(),
  markLeft: () => ShooNative.markLeft(),
  takeEvents: async () => (await ShooNative.takeTripEvents()).events,
  onEvent(fn) {
    const handle = ShooNative.addListener('trip', fn);
    return () => void handle.then((h) => h.remove());
  },
};

/** Apple's numeric app id, shown in App Store Connect → App Information → Apple ID. */
const APP_STORE_ID = import.meta.env.VITE_APP_STORE_ID ?? '';

export const nativeReviews: ReviewPort = {
  available: true,
  request: () => InAppReview.requestReview(),
  storeUrl:
    Capacitor.getPlatform() === 'android'
      ? 'https://play.google.com/store/apps/details?id=com.tylerhill.shoo'
      : APP_STORE_ID
        ? `itms-apps://itunes.apple.com/app/id${APP_STORE_ID}?action=write-review`
        : null,
};
