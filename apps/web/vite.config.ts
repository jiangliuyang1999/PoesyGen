import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: {
    // Authoritative pattern and pronunciation datasets are emitted as separate chunks.
    chunkSizeWarningLimit: 5_000,
  },
  server: {
    port: 5_173,
  },
});
