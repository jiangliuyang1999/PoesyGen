import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiTarget = process.env['POESYGEN_API'] ?? 'http://127.0.0.1:3000';
const apiStartupTimeoutMs = 8_000;
const apiHealthCheckIntervalMs = 200;

async function waitForApi(): Promise<boolean> {
  const deadline = Date.now() + apiStartupTimeoutMs;
  const healthUrl = `${apiTarget.replace(/\/$/, '')}/v1/generation/health`;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(healthUrl, {
        signal: AbortSignal.timeout(apiHealthCheckIntervalMs),
      });
      if (response.ok) return true;
    } catch {
      // API and Web start in parallel during `pnpm dev`.
    }
    await new Promise((resolve) => setTimeout(resolve, apiHealthCheckIntervalMs));
  }

  return false;
}

export default defineConfig({
  plugins: [
    {
      name: 'wait-for-poesygen-api',
      apply: 'serve',
      async configureServer(server) {
        if (!(await waitForApi())) {
          server.config.logger.warn(
            `PoesyGen API was not reachable at ${apiTarget}; starting Web without it.`,
          );
        }
      },
    },
    react(),
  ],
  server: {
    port: 5_173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
