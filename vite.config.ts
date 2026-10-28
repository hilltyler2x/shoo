/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the site from /shoo/, everything else from the root.
const base = process.env.PAGES_BASE ?? '/';

export default defineConfig(({ mode }) => ({
  base,
  plugins: [
    react(),
    VitePWA({
      // The phone apps ship their files inside the app; a service worker would only get in the way.
      disable: mode === 'app',
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Shoo: Never Be Late.',
        short_name: 'Shoo',
        description: 'Knows when you need to leave for work, and nags you until you do.',
        theme_color: '#ff5a32',
        background_color: '#fff8f0',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    proxy: { '/api': 'http://localhost:8787' },
  },
  test: {
    env: { TZ: 'America/Chicago' },
    include: ['tests/**/*.test.ts'],
  },
}));
