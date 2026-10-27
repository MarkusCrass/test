import type { Server as HttpServer } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import { attachMultiplayerHub } from './server/wsHub';

function knightsMultiplayerPlugin(): Plugin {
  return {
    name: 'knights-multiplayer-ws',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        // Strip anonymous `crossorigin` attributes so authenticated preview proxies receive same-origin cookies
        return html.replace(/\s+crossorigin(?:="[^"]*")?/gi, '');
      },
    },
    configureServer(server) {
      if (!server.httpServer) return;
      const hub = attachMultiplayerHub(server.httpServer as HttpServer);
      server.middlewares.use((req, res, next) => {
        if (hub.handleApiRequest(req, res)) return;
        next();
      });
    },
    configurePreviewServer(server) {
      if (!server.httpServer) return;
      const hub = attachMultiplayerHub(server.httpServer as HttpServer);
      server.middlewares.use((req, res, next) => {
        if (hub.handleApiRequest(req, res)) return;
        next();
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [knightsMultiplayerPlugin()],
  build: {
    modulePreload: false,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    hmr: false,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
});
