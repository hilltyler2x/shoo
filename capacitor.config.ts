import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // The bundle ID. It must match the Apple Identifier and the App Store
  // Connect record exactly, and it can't be changed after the first upload.
  appId: 'com.tylerhill.shoo',
  appName: 'Shoo',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
  },
};

export default config;
