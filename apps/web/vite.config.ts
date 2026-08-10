import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

export default defineConfig({
  plugins: [privacyPolicyRoute(), react()],
  build: {
    // Authoritative pattern and pronunciation datasets are emitted as separate chunks.
    chunkSizeWarningLimit: 5_000,
  },
  server: {
    port: 5_173,
  },
});

function privacyPolicyRoute(): Plugin {
  const rewrite = (url: string | undefined): string | undefined => {
    if (url === undefined) return undefined;
    const queryIndex = url.indexOf('?');
    const pathname = queryIndex === -1 ? url : url.slice(0, queryIndex);
    if (pathname !== '/privacy' && pathname !== '/privacy/') return url;
    const query = queryIndex === -1 ? '' : url.slice(queryIndex);
    return `/privacy/index.html${query}`;
  };

  return {
    name: 'poesygen-privacy-policy-route',
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        request.url = rewrite(request.url);
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, _response, next) => {
        request.url = rewrite(request.url);
        next();
      });
    },
  };
}
