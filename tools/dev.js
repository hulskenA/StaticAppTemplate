// `npm run dev`: the site on your PC. Each page is built when it is asked for, and the browser
// reloads by itself when you save a file of src/ or site.config.json. It answers like nginx does
// on the server: / is index.html, /about/ is about/index.html, anything else missing is a 404.
// Never used on the server: there, nginx serves the files `npm run build` wrote.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SRC, loadConfig, render, SiteError } from './site.js';

const PORT = Number(process.env.PORT) || 3002;
const HOST = '127.0.0.1';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.pdf': 'application/pdf', '.webmanifest': 'application/manifest+json',
};

// The script added to every page here, and only here: reload when a file was saved, or when
// this server came back after `node --watch` restarted it.
const RELOAD = `let dropped = false;
const events = new EventSource('/__dev/events');
events.addEventListener('reload', () => location.reload());
events.onerror = () => { dropped = true; };
events.onopen = () => { if (dropped) location.reload(); };
`;

const pagesOpen = new Set();
let soon = null;
function saved() {
  clearTimeout(soon);
  soon = setTimeout(() => { for (const res of pagesOpen) res.write('event: reload\ndata: saved\n\n'); }, 80);
}
fs.watch(SRC, { recursive: true }, saved);
fs.watch(ROOT, (event, name) => { if (name === 'site.config.json') saved(); });

function send(res, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
  res.end(body);
}

const escText = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://site');
  if (url.pathname === '/__dev/reload.js') return send(res, 200, RELOAD, TYPES['.js']);
  if (url.pathname === '/__dev/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
    res.write('retry: 500\n\n');
    pagesOpen.add(res);
    req.on('close', () => pagesOpen.delete(res));
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed\n');

  let rel;
  try { rel = decodeURIComponent(url.pathname).replace(/^\/+/, ''); } catch { return send(res, 400, 'Bad address\n'); }
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const file = path.join(SRC, rel);
  // Parts (_parts/…) and hidden files are not part of the site, here or on the server.
  if (!file.startsWith(SRC + path.sep) || rel.split('/').some((p) => p.startsWith('_') || p.startsWith('.'))) return send(res, 404, 'Not found\n');
  let stat = null;
  try { stat = fs.statSync(file); } catch { /* answered below */ }
  // A folder asked for without its final slash: nginx redirects to the address with it.
  if (stat?.isDirectory()) return send(res, 301, '', undefined, { Location: `${url.pathname}/${url.search}` });
  // A missing address: the site's own 404.html, as the server sends it.
  let status = 200;
  if (!stat?.isFile()) {
    if (!fs.existsSync(path.join(SRC, '404.html'))) return send(res, 404, 'Not found\n');
    rel = '404.html'; status = 404;
  }

  if (!rel.endsWith('.html')) return send(res, 200, req.method === 'HEAD' ? '' : fs.readFileSync(file), TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
  try {
    const html = render(rel, { config: loadConfig(), version: false });
    return send(res, status, html.replace(/<\/head>/i, '<script src="/__dev/reload.js"></script>\n</head>'), TYPES['.html']);
  } catch (err) {
    if (!(err instanceof SiteError)) console.error(err);
    else console.error(`Cannot build /${rel}: ${err.message}`);
    // The mistake, in the browser too; saving the fix reloads the page.
    return send(res, 500, `<!doctype html><meta charset="utf-8"><title>Cannot build this page</title><script src="/__dev/reload.js"></script><pre style="font: 15px/24px monospace; padding: 24px; white-space: pre-wrap">Cannot build this page.\n\n${escText(err instanceof SiteError ? err.message : err.stack)}</pre>`, TYPES['.html']);
  }
});

server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`Port ${PORT} is already used on this PC. Pick another one: PORT=3005 npm run dev (in PowerShell: $env:PORT="3005"; npm run dev)`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  let name = 'The site';
  try { name = loadConfig().name; } catch (err) { console.error(err.message); }
  console.log(`${name} on http://${HOST}:${PORT} (reloads when you save)`);
});
