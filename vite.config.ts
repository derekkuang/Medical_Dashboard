/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Without this, running the coverage reporter while the dev server is up
    // rewrites coverage/lcov-report and triggers a full page reload each time.
    watch: { ignored: ['**/coverage/**', '**/dist/**'] },
  },
  build: {
    // Surfaced deliberately: the telemetry work will add a canvas renderer and
    // MUI is large. A budget that warns early is worth more than one that never
    // fires, so this is tightened rather than silenced.
    chunkSizeWarningLimit: 600,
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // Coverage weight belongs on the pure layers. Charts are covered by
      // render tests, but thresholds there would reward asserting on SVG
      // internals, which is exactly the brittle test this design avoids.
      include: [
        'src/transforms/**',
        'src/telemetry/**',
        'src/data/**',
        // Slices and URL codecs are logic, not presentation, and are covered
        // to the same standard as the pure layers.
        'src/features/**',
      ],
      // Type-only modules compile to nothing, so they report 0% with no
      // statements to cover. Listing them would make the report read as a gap.
      exclude: ['**/schema.ts'],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
});
