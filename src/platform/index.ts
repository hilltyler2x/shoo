import { Capacitor } from '@capacitor/core';
import { nativeLocation, nativeNotifications, nativeTrip } from './native';
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
    }
  : {
      name: 'web',
      notifications: new WebNotifications(),
      location: new WebLocation(),
      storage: new WebStorage(),
      trip: webTrip,
    };

export type * from './ports';
