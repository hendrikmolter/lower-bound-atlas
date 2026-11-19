import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = fileURLToPath(new URL('../dist/site/', import.meta.url));
const root = await realpath(site).catch(() => {
  throw new Error('Build the local reader first with npm run site.');
});
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf', '.tex': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.bib': 'text/plain; charset=utf-8',
};
const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);
    const segments = pathname.split('/').filter(Boolean);
    if (segments.some(s => s.startsWith('.') || /[\\:\0]/.test(s))) throw new Error();
    if (pathname.endsWith('/')) segments.push('index.html');
    const path = await realpath(join(root, ...segments));
    const local = relative(root, path);
    if (!local || isAbsolute(local) || local.startsWith('..' + sep)) throw new Error();
    const info = await stat(path);
    if (!info.isFile()) throw new Error();
    res.writeHead(200, {
      'Content-Type': types[extname(path)] || 'application/octet-stream',
      'Content-Length': info.size, 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(path).on('error', () => res.destroy()).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Page not found');
  }
});
const port = Number(process.argv[2] ?? 4173);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port.');
server.listen(port, '127.0.0.1', () => {
  console.log('Lower Bound Atlas: http://127.0.0.1:' + server.address().port + '/');
});
