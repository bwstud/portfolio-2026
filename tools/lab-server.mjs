/* Local server for the site. It serves exactly what .vercelignore ships, and lets the
   Split-Flap Lab write split-flap-versions.js. Never deployed. Start it with `dvs`. */
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = await realpath(path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const FIRST_PORT = Number(process.env.PORT) || 8080;
const LAST_PORT = FIRST_PORT + 10;
const API = '/__lab/versions';
const VERSIONS_FILE = path.join(ROOT, 'split-flap-versions.js');
const HEADER = '/* Written by the Split-Flap Lab. The home page runs the version named by "active". */\n';
const MAX_BODY = 256 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.pdf': 'application/pdf',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
};

/* ---- What ships: the same answer .vercelignore gives ---- */
const rules = (await readFile(path.join(ROOT, '.vercelignore'), 'utf8'))
  .split('\n').map(line => line.trim())
  .filter(line => line && !line.startsWith('#') && line !== '/*');
const shipped = rules.filter(line => line.startsWith('!')).map(line => line.slice(1));
const withheld = rules.filter(line => !line.startsWith('!')).map(line => line.replace(/^\//, ''));
const within = (rel, entry) => rel === entry || rel.startsWith(`${entry}/`);
const ships = rel => shipped.some(entry => within(rel, entry)) && !withheld.some(entry => within(rel, entry));

function send(res, code, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

/* ---- Static files ---- */
async function serveFile(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');

  let rel;
  try { rel = decodeURIComponent(pathname).slice(1); } catch { return send(res, 400, 'Bad path'); }
  if (!rel || rel.endsWith('/')) rel += 'index.html';
  const hidden = rel.includes('\0') || rel.split('/').some(part => part.startsWith('.'));
  if (hidden || !ships(rel)) return send(res, 404, 'Not found');

  let file, info;
  try {
    file = await realpath(path.join(ROOT, rel));
    info = await stat(file);
  } catch {
    return send(res, 404, 'Not found');
  }
  if (!ships(path.relative(ROOT, file))) return send(res, 404, 'Not found');   // a link out of the site
  if (info.isDirectory()) {
    res.writeHead(301, { Location: `${pathname}/`, 'Cache-Control': 'no-store' });
    return res.end();
  }

  // video needs byte ranges to seek, and Safari won't play it without them
  const size = info.size;
  let start = 0, end = size - 1, code = 200;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (range && (range[1] || range[2])) {
    if (range[1]) {
      start = Number(range[1]);
      if (range[2]) end = Math.min(Number(range[2]), size - 1);
    } else {
      start = Math.max(size - Number(range[2]), 0);
    }
    if (start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      return res.end();
    }
    code = 206;
  }

  const headers = {
    'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': size ? end - start + 1 : 0,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (code === 206) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  res.writeHead(code, headers);
  if (req.method === 'HEAD' || !size) return res.end();
  createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
}

/* ---- Versions ---- */
async function readVersions() {
  const text = await readFile(VERSIONS_FILE, 'utf8');
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
}

function problemWith(store) {
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!isObject(store) || !Array.isArray(store.versions) || !store.versions.length) return 'No versions in the request.';
  const valid = store.versions.every(version => isObject(version)
    && typeof version.id === 'string' && version.id
    && typeof version.name === 'string' && version.name
    && isObject(version.config));
  if (!valid) return 'A version is missing its id, name or config.';
  if (new Set(store.versions.map(version => version.id)).size !== store.versions.length) return 'Two versions share an id.';
  if (!store.versions.some(version => version.id === store.active)) return 'The active version is not in the list.';
  return null;
}

async function writeVersions(store) {
  const text = `${HEADER}window.SPLIT_FLAP_VERSIONS = ${JSON.stringify(store, null, 2)};\n`;
  const temp = `${VERSIONS_FILE}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temp, text);
    await rename(temp, VERSIONS_FILE);   // a reader sees the old file or the new one, never half
  } finally {
    await rm(temp, { force: true });
  }
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('Request too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function versionsApi(req, res) {
  if (req.method === 'GET') return send(res, 200, JSON.stringify(await readVersions()), 'application/json');
  if (req.method !== 'POST') return send(res, 405, 'Method not allowed');

  // other sites in the same browser can reach this port: only the page itself may write.
  // application/json also makes a cross-site browser ask first, and nothing here says yes.
  if (req.headers.origin !== `http://${req.headers.host}`) return send(res, 403, 'Only the lab can save versions.');
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return send(res, 415, 'Send JSON.');

  let store;
  try {
    store = JSON.parse(await readBody(req));
  } catch (e) {
    return send(res, 400, e.message);
  }
  const problem = problemWith(store);
  if (problem) return send(res, 400, problem);
  await writeVersions({ active: store.active, versions: store.versions });
  send(res, 200, 'Saved.');
}

/* ---- Server ---- */
const server = createServer(async (req, res) => {
  try {
    // a hostile domain can point itself at 127.0.0.1, so the name has to be ours as well
    const { port } = server.address();
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) return send(res, 403, 'Wrong host.');

    const { pathname } = new URL(req.url, 'http://local');
    if (pathname === API) await versionsApi(req, res);
    else await serveFile(req, res, pathname);
  } catch (e) {
    console.error(e);
    if (res.headersSent) res.destroy();
    else send(res, 500, e.message);
  }
});

server.on('error', e => {
  const port = FIRST_PORT + tries;
  if (e.code === 'EADDRINUSE' && port < LAST_PORT) {
    tries += 1;
    server.listen(port + 1, '127.0.0.1');
  } else {
    console.error(e.message);
    process.exit(1);
  }
});

server.on('listening', () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  console.log(`Site:  ${url}\nLab:   ${url}tinkering/split-flap-lab/`);
  if (process.argv.includes('--open')) spawn('open', [url], { stdio: 'ignore' }).on('error', () => {});
});

let tries = 0;
server.listen(FIRST_PORT, '127.0.0.1');
