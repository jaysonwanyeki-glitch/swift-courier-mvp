// Dev-only preview server: serves the repo root (customer site) and proxies
// /api to the Express backend so the page works same-origin with no setup.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const API = { host: 'localhost', port: process.env.API_PORT || 4001 };
const PORT = process.env.PORT || 3000;
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

http.createServer((req, res) => {
  if (req.url.startsWith('/api')) {
    const proxy = http.request({ ...API, path: req.url, method: req.method, headers: req.headers }, (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    });
    proxy.on('error', () => { res.writeHead(502); res.end('{"error":"backend unreachable"}'); });
    req.pipe(proxy);
    return;
  }
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file;
  if (url === '/ops' || url.startsWith('/ops/')) {
    // /ops serves the internal console, mirroring the README layout.
    const rest = url.replace(/^\/ops\/?/, '') || 'index.html';
    file = path.join(__dirname, 'frontend', 'public', rest);
  } else {
    file = path.join(ROOT, url === '/' ? 'index.html' : url);
    // Extensionless URLs map to their .html page, as a static host would.
    if (!path.extname(file)) file += '.html';
  }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(PORT, () => console.log('Customer site: http://localhost:' + PORT + '/  |  Ops console: http://localhost:' + PORT + '/ops'));