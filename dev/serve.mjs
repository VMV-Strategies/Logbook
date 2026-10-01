// Tiny local web server for trying the app on a computer. No dependencies.
//   node dev/serve.mjs            ->  http://localhost:4173/logbook/
// It serves the app under /logbook/ on purpose, to mimic a GitHub Pages address
// such as https://USERNAME.github.io/REPOSITORY/
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASE = '/logbook/';
const PORT = Number(process.env.PORT) || 4173;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/' || path === BASE.slice(0, -1)) { res.writeHead(302, { Location: BASE }); res.end(); return; }
  if (!path.startsWith(BASE)) { res.writeHead(404); res.end('Not found'); return; }
  let rel = normalize(path.slice(BASE.length)).replace(/^(\.\.[/\\])+/, '');
  if (rel === '' || rel === '.' || rel.endsWith('/')) rel = join(rel, 'index.html');
  try {
    const data = await readFile(join(ROOT, rel));
    res.writeHead(200, { 'Content-Type': TYPES[extname(rel)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}).listen(PORT, () => console.log(`Logbook is running at http://localhost:${PORT}${BASE}`));
