// SOLMAR dev server — serves game/ on localhost:8080 for local play-testing.
// Node 22 stdlib only. Improvements over a plain static server:
//  - HEAD requests answered with headers and no body (handy for screenshot
//    tooling that probes a page before loading it);
//  - a --host option (default 127.0.0.1) and a --port option (default 8080);
//  - one-line request logging with status and bytes, so a failed asset load
//    is visible immediately;
//  - directory requests redirect to index.html; paths that climb out of
//    game/ are refused with 403 instead of served.
// Usage: node serve.ts [--host 0.0.0.0] [--port 8080]

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const gameRoot = resolve(join(here, 'game'));

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function parseArgs(argv) {
  const opts = { host: '127.0.0.1', port: 8080 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--host' && argv[i + 1]) opts.host = argv[++i];
    else if (argv[i] === '--port' && argv[i + 1]) opts.port = Number(argv[++i]);
    else if (argv[i] === '--help') {
      console.log('Usage: node serve.ts [--host <addr>] [--port <n>]');
      process.exit(0);
    }
  }
  return opts;
}

function logLine(method, url, status, bytes) {
  const stamp = new Date().toISOString();
  console.log(`[${stamp}] ${method} ${url} -> ${status} (${bytes} bytes)`);
}

// Resolve a request path to a file inside game/, or null when refused.
function resolveGamePath(requestPath) {
  const decoded = decodeURIComponent(requestPath.split('?')[0].split('#')[0]);
  const joined = normalize(join(gameRoot, decoded));
  if (joined !== gameRoot && !joined.startsWith(gameRoot + sep)) return null;
  return joined;
}

function sendFile(res, filePath, method) {
  const stat = statSync(filePath);
  const ext = extname(filePath).toLowerCase();
  const type = MIME_TYPES[ext] ?? 'application/octet-stream';
  res.writeHead(200, {
    'content-type': type,
    'content-length': stat.size,
    'cache-control': 'no-cache',
  });
  if (method === 'HEAD') {
    res.end();
    return stat.size;
  }
  return new Promise((resolvePromise, reject) => {
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('end', () => resolvePromise(stat.size));
    stream.pipe(res);
  });
}

const opts = parseArgs(process.argv.slice(2));

const server = createServer(async (req, res) => {
  const method = req.method ?? 'GET';
  const url = req.url ?? '/';
  try {
    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Method not allowed\n');
      logLine(method, url, 405, 19);
      return;
    }
    let filePath = resolveGamePath(url === '/' ? '/index.html' : url);
    if (filePath === null) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Forbidden\n');
      logLine(method, url, 403, 10);
      return;
    }
    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
      filePath = join(filePath, 'index.html');
    }
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found\n');
      logLine(method, url, 404, 10);
      return;
    }
    const bytes = await sendFile(res, filePath, method);
    logLine(method, url, 200, bytes);
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Internal error\n');
    } else {
      res.end();
    }
    logLine(method, url, 500, 0);
    console.error(err);
  }
});

server.listen(opts.port, opts.host, () => {
  console.log(`SOLMAR dev server: http://${opts.host}:${opts.port}/ (serving game/)`);
  console.log('Press Ctrl-C to stop. HEAD requests, --host and request logging enabled.');
});
