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
  build: {
    // Surfaced deliberately: the telemetry work will add a canvas renderer and
    // MUI is large. A budget that warns early is worth more than one that never
    // fires, so this is tightened rather than silenced.
    chunkSizeWarningLimit: 600,
    sourcemap: true,
  },
});
