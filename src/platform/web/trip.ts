import type { TripPort } from '../ports';

/** Browsers can't watch location in the background. The app watches while it's open instead. */
export const webTrip: TripPort = {
  native: false,
  backgroundPermission: async () => 'unsupported',
  requestBackground: async () => 'unsupported',
  openSettings: async () => {},
  watch: async () => {},
  clear: async () => {},
  markLeft: async () => {},
  takeEvents: async () => [],
  onEvent: () => () => {},
};
