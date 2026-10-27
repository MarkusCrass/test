import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
  '.ico': 'image/x-icon',
};

const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? '0.0.0.0';

let hubRef: ReturnType<typeof attachMultiplayerHub> | null = null;

const server = http.createServer((req, res) => {
  if (hubRef && hubRef.handleApiRequest(req, res)) {
    return;
  }

  const rawPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
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
    filePath = path.join(DIST_DIR, 'index.html');
  }
  if (!fs.existsSync(filePath)) {
    res.statusCode = 404;
    res.end('Build not found. Run `npm run build` first.');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.statusCode = 200;
  res.setHeader(
    'Content-Type',
    MIME_TYPES[ext] ?? 'application/octet-stream'
  );
  fs.createReadStream(filePath).pipe(res);
});

hubRef = attachMultiplayerHub(server);

server.listen(port, host, () => {
  console.log(
    `[Knights: Last Standing] Server + WebSocket Hub running at http://${host}:${port}`
  );
});
