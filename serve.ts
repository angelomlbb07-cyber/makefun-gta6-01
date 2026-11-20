// serve.ts — a tiny static file server for SOLMAR's game/ folder (Node 22
// standard library only). Serves game/index.html at http://localhost:8080
// so the game can be played and screenshotted in desktop Chrome.
//   node serve.ts [--host 127.0.0.1] [--port 8080]
// Features: HEAD support, --host/--port flags, per-request logging,
// 403 for path escapes, correct MIME types (html/css/js/json/jpg/png).

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, 'game');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const args = process.argv.slice(2);
let host = '127.0.0.1';
let port = 8080;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--host' && args[i + 1]) host = args[++i];
  else if (args[i] === '--port' && args[i + 1]) port = Number(args[++i]);
  else if (args[i].startsWith('--port=')) port = Number(args[i].slice(7));
  else if (args[i].startsWith('--host=')) host = args[i].slice(7);
}

const server = createServer(async (req, res) => {
  const started = Date.now();
  const method = req.method ?? 'GET';
  const rawPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let pathname = rawPath === '/' ? '/index.html' : rawPath;
  // Resolve inside game/ and refuse anything that climbs out (403).
  const resolved = normalize(join(root, pathname));
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('403 forbidden\n');
    console.log(`${method} ${rawPath} -> 403 (${Date.now() - started}ms)`);
    return;
  }
  try {
    const info = await stat(resolved);
    const file = info.isDirectory() ? join(resolved, 'index.html') : resolved;
    const body = await readFile(file);
    const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'content-length': body.length });
    if (method !== 'HEAD') res.end(body);
    else res.end();
    console.log(`${method} ${rawPath} -> 200 ${type} (${Date.now() - started}ms)`);
  } catch (e) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 not found\n');
    console.log(`${method} ${rawPath} -> 404 (${Date.now() - started}ms)`);
  }
});

server.listen(port, host, () => {
  console.log(`SOLMAR serving game/ at http://${host}:${port}/`);
});
