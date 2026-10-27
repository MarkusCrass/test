import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { attachMultiplayerHub } from './wsHub';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '../dist');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

const COMPRESSIBLE_EXTS = new Set([
  '.html',
  '.js',
  '.css',
  '.json',
  '.svg',
  '.glb',
  '.txt',
]);

const port = Number(process.env.PORT ?? 5173);
const host = process.env.HOST ?? '0.0.0.0';

let hubRef: ReturnType<typeof attachMultiplayerHub> | null = null;

const server = http.createServer((req, res) => {
  const pathname = (req.url ?? '/').split('?')[0];

  if (req.method === 'POST' && pathname === '/api/client-error') {
    let body = '';
    req.on('data', (chunk) => {
      if (body.length < 4096) body += chunk.toString();
    });
    req.on('end', () => {
      console.error('[Browser Client Boot Error]:', body);
      res.statusCode = 204;
      res.end();
    });
    return;
  }

  if (hubRef && hubRef.handleApiRequest(req, res)) {
    return;
  }

  let rawPath = '/';
  try {
    rawPath = decodeURIComponent(pathname);
  } catch {
    res.statusCode = 400;
    res.end('Bad Request');
    return;
  }

  const safeRel = path
    .normalize(rawPath)
    .replace(/^(\.\.(\/|\\|$))+/, '')
    .replace(/^[/\\]+/, '');

  let filePath = path.join(DIST_DIR, safeRel || 'index.html');
  if (!filePath.startsWith(DIST_DIR)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!fs.existsSync(filePath)) {
    // Only fall back to index.html for navigation routes, never for missing asset files
    if (!path.extname(safeRel)) {
      filePath = path.join(DIST_DIR, 'index.html');
    } else {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }
  }
  if (!fs.existsSync(filePath)) {
    res.statusCode = 404;
    res.end('Build not found. Run `npm run build` first.');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] ?? 'application/octet-stream';
  const stat = fs.statSync(filePath);

  res.setHeader('Content-Type', mime);
  if (ext === '.html') {
    res.setHeader('Cache-Control', 'no-cache');
  } else if (rawPath.startsWith('/assets/') || rawPath.startsWith('/models/')) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
  }

  if (req.method === 'HEAD') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const acceptEncoding = String(req.headers['accept-encoding'] ?? '');
  if (COMPRESSIBLE_EXTS.has(ext) && acceptEncoding.includes('gzip')) {
    res.statusCode = 200;
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
    fs.createReadStream(filePath).pipe(zlib.createGzip()).pipe(res);
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Length', stat.size);
  fs.createReadStream(filePath).pipe(res);
});

hubRef = attachMultiplayerHub(server);

server.listen(port, host, () => {
  console.log(
    `[Knights: Last Standing] Server + WebSocket Hub running at http://${host}:${port}`
  );
});
