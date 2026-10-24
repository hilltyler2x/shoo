import type { Platform } from './ports';
import { WebLocation } from './web/location';
import { WebNotifications } from './web/notifications';
import { WebStorage } from './web/storage';

// The Capacitor build swaps in native adapters here (step 3).
export const platform: Platform = {
  name: 'web',
  notifications: new WebNotifications(),
  location: new WebLocation(),
  storage: new WebStorage(),
};

export type * from './ports';
