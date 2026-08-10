import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

export default defineConfig({
  plugins: [staticInfoPageRoutes(), react()],
  build: {
    // Authoritative pattern and pronunciation datasets are emitted as separate chunks.
    chunkSizeWarningLimit: 5_000,
  },
  server: {
    port: 5_173,
  },
});

function staticInfoPageRoutes(): Plugin {
  const rewrite = (url: string | undefined): string | undefined => {
    if (url === undefined) return undefined;
    const queryIndex = url.indexOf('?');
    const pathname = queryIndex === -1 ? url : url.slice(0, queryIndex);
    const pageMatch = /^\/(privacy|support)\/?$/u.exec(pathname);
    if (pageMatch === null) return url;
    const query = queryIndex === -1 ? '' : url.slice(queryIndex);
    return `/${pageMatch[1]}/index.html${query}`;
  };

  return {
    name: 'poesygen-static-info-page-routes',
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
