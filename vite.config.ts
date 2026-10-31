import type { Server as HttpServer } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import { attachMultiplayerHub } from './server/wsHub';

function knightsMultiplayerPlugin(mode: string): Plugin {
  return {
    name: 'knights-multiplayer-ws',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        // Strip anonymous `crossorigin` attributes so authenticated preview proxies receive same-origin cookies,
        // and in production builds convert module script to classic <script defer> (no-cors with full cookies).
        let out = html.replace(/\s+crossorigin(?:="[^"]*")?/gi, '');
        if (mode === 'crazygames') {
          out = out.replace('<html lang="ru">', '<html lang="en" data-default-language="en">');
          out = out.replace(
            '<script src="/sdk.js"></script>',
            '<script id="crazygames-sdk" async src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>'
          );
          // An unavailable optional SDK is not a game boot failure.
          out = out.replace("if (t && t !== window &&", "if (t && t.id === 'crazygames-sdk') return;\n          if (t && t !== window &&");
          out = out.replace("fetch('/api/client-error'", "fetch('./api/client-error'");
        }
        if (ctx.bundle) {
          out = out.replace(/<script\s+type="module"\s+src=/gi, '<script defer src=');
        }
        return out;
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

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [knightsMultiplayerPlugin(mode)],
  build: {
    outDir: mode === 'yandex' ? 'dist-yandex' : mode === 'crazygames' ? 'dist-crazygames' : 'dist',
    modulePreload: false,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'assets/knights-[hash].js',
        assetFileNames: 'assets/knights-[name]-[hash][extname]',
      },
    },
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
}));
