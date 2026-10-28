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
  plugins: {
    // Native networking for fetch: lets the app read calendars and call the free
    // map services directly, without the browser's cross-site limits.
    CapacitorHttp: { enabled: true },
    // Android: edge to edge, with the safe areas passed to CSS as --safe-area-inset-*.
    SystemBars: { insetsHandling: 'css', initialViewportFitValueHint: 'cover' },
  },
};

export default config;
