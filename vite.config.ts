import type { Server as HttpServer } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import { attachMultiplayerHub } from './server/wsHub';

function knightsMultiplayerPlugin(): Plugin {
  return {
    name: 'knights-multiplayer-ws',
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
  plugins: [knightsMultiplayerPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
});
