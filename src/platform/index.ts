import { Capacitor } from '@capacitor/core';
import { nativeDeviceCalendar, nativeLocation, nativeNotifications, nativeReviews, nativeTrip } from './native';
import { nativePurchases } from './native/purchases';
import type { Platform } from './ports';
import { WebLocation } from './web/location';
import { WebNotifications } from './web/notifications';
import { WebStorage } from './web/storage';
import { webTrip } from './web/trip';

const native = Capacitor.isNativePlatform();

export const platform: Platform = native
  ? {
      name: Capacitor.getPlatform() as 'ios' | 'android',
      notifications: nativeNotifications,
      location: nativeLocation,
      storage: new WebStorage(),
      trip: nativeTrip,
      reviews: nativeReviews,
      deviceCalendar: nativeDeviceCalendar,
      purchases: nativePurchases,
    }
  : {
      name: 'web',
      notifications: new WebNotifications(),
      location: new WebLocation(),
      storage: new WebStorage(),
      trip: webTrip,
      reviews: { available: false, request: async () => {}, storeUrl: null },
      deviceCalendar: {
        available: false,
        reminders: false,
        permission: async () => ({ calendar: 'unsupported', reminders: 'unsupported' }),
        request: async () => 'unsupported',
        events: async () => [],
      },
      purchases: {
        available: false,
        isPro: async () => true,
        options: async () => [],
        buy: async () => false,
        restore: async () => true,
        onChange: () => () => {},
      },
    };

export type * from './ports';
