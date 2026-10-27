/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { currentBuildId } from './scripts/build-id.ts';

export default defineConfig({
  base: '/shape-of-war/', // GitHub Pages project path; Capacitor build overrides with --base=./
  define: {
    // Visible on device in a corner label so a stale service worker cache is detectable.
    __BUILD_ID__: JSON.stringify(currentBuildId()),
  },
  build: { target: 'es2022', sourcemap: true, assetsInlineLimit: 0 },
  server: { host: true, port: 5173 },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: false, // we ship public/manifest.webmanifest ourselves (doc 04)
      includeAssets: ['manifest.webmanifest', 'icons/*.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [], // no runtime caching: everything is precached
      },
      devOptions: { enabled: false },
    }),
  ],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
