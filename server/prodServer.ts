import { execSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { attachMultiplayerHub } from './wsHub';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');

// Auto-build dist/ if missing (e.g. after sandbox snapshot restore where dist/ is excluded)
if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  console.log('[Knights: Last Standing] Building dist/ bundle...');
  execSync('npx vite build', { cwd: ROOT_DIR, stdio: 'inherit' });
}

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

interface CachedAsset {
  mtimeMs: number;
  raw: Buffer;
  gzipped: Buffer | null;
}

const assetCache = new Map<string, CachedAsset>();

function getAssetBuffers(filePath: string, ext: string): CachedAsset {
  const stat = fs.statSync(filePath);
  const existing = assetCache.get(filePath);
  if (existing && existing.mtimeMs === stat.mtimeMs) {
    return existing;
  }

  const raw = fs.readFileSync(filePath);
  const gzipped = COMPRESSIBLE_EXTS.has(ext)
    ? zlib.gzipSync(raw, { level: 6 })
    : null;
  const entry: CachedAsset = { mtimeMs: stat.mtimeMs, raw, gzipped };
  // Cache text/JS/CSS/SVG/GLB up to 64 MB total
  if (assetCache.size < 180) {
    assetCache.set(filePath, entry);
  }
  return entry;
}

const port = Number(process.env.PORT ?? 5173);
const host = process.env.HOST ?? '0.0.0.0';

let hubRef: ReturnType<typeof attachMultiplayerHub> | null = null;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const pathname = (req.url ?? '/').split('?')[0];

  if (req.method === 'POST' && pathname === '/api/client-ready') {
    console.log('[Browser Client Ready] UI mounted successfully.');
    res.statusCode = 204;
    res.end();
    return;
  }

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
    res.end('Build not found.');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] ?? 'application/octet-stream';
  const entry = getAssetBuffers(filePath, ext);

  res.setHeader('Content-Type', mime);
  if (ext === '.html') {
    res.setHeader('Cache-Control', 'no-cache');
  } else if (rawPath.startsWith('/assets/') || rawPath.startsWith('/models/')) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
  }

  const acceptEncoding = String(req.headers['accept-encoding'] ?? '');
  const useGzip = Boolean(entry.gzipped && acceptEncoding.includes('gzip'));
  const payload = useGzip ? entry.gzipped! : entry.raw;

  if (useGzip) {
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
  }
  res.setHeader('Content-Length', payload.byteLength);

  if (req.method === 'HEAD') {
    res.statusCode = 200;
    res.end();
    return;
  }

  res.statusCode = 200;
  res.end(payload);
});

hubRef = attachMultiplayerHub(server);

server.listen(port, host, () => {
  console.log(
    `[Knights: Last Standing] Server + WebSocket Hub running at http://${host}:${port}`
  );
});
