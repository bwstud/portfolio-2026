/* Local server for the site. It serves exactly what .vercelignore ships, lets the
   Split-Flap Lab write split-flap-versions.js and the Halftone Lab write halftone-versions.js,
   lets Domino Run save runs, elements and lab settings into tinkering/domino-run/, and lets
   the Kaleidoscope Lab write tinkering/kaleidoscopes/configs.json. Never deployed. Start it with `dvs`. */
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = await realpath(path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const FIRST_PORT = Number(process.env.PORT) || 8080;
const LAST_PORT = FIRST_PORT + 10;
// each lab keeps its saved versions in a script the home page loads
const STORES = {
  '/__lab/versions': {
    file: path.join(ROOT, 'split-flap-versions.js'),
    global: 'SPLIT_FLAP_VERSIONS',
    header: '/* Written by the Split-Flap Lab. The home page runs the version named by "active". */\n',
  },
  '/__lab/halftone': {
    file: path.join(ROOT, 'halftone-versions.js'),
    global: 'HALFTONE_VERSIONS',
    header: '/* Written by the Halftone Lab. The home page draws the version named by "active". */\n',
  },
};
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
async function readVersions({ file }) {
  const text = await readFile(file, 'utf8');
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
  if (store.activeLight != null && !store.versions.some(version => version.id === store.activeLight)) return 'The light active version is not in the list.';
  return null;
}

async function writeVersions({ file, global, header }, store) {
  const text = `${header}window.${global} = ${JSON.stringify(store, null, 2)};\n`;
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temp, text);
    await rename(temp, file);   // a reader sees the old file or the new one, never half
  } finally {
    await rm(temp, { force: true });
  }
}

async function readBody(req, max = MAX_BODY) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw new Error('Request too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function versionsApi(req, res, target) {
  if (req.method === 'GET') return send(res, 200, JSON.stringify(await readVersions(target)), 'application/json');
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
  // activeLight: the Split-Flap Lab's light-mode board, when one is set
  const { active, activeLight, versions } = store;
  await writeVersions(target, activeLight == null ? { active, versions } : { active, activeLight, versions });
  send(res, 200, 'Saved.');
}

/* ---- Domino Run: saved runs, elements and lab settings ---- */
const DOMINO = '/__domino';
const DOMINO_DIR = path.join(ROOT, 'tinkering', 'domino-run');
const DOMINO_KINDS = { states: path.join(DOMINO_DIR, 'saves', 'states'), elements: path.join(DOMINO_DIR, 'saves', 'elements') };
const DOMINO_MAX = 12 * 1024 * 1024;
const ID = /^[a-z0-9][a-z0-9-]{0,99}$/;

async function writeAtomic(file, data) {
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temp, data);
    await rename(temp, file);
  } finally {
    await rm(temp, { force: true });
  }
}

async function dominoApi(req, res, pathname) {
  const parts = pathname.slice(DOMINO.length + 1).split('/');
  const [kind, file] = parts;
  if (kind === 'ping' && req.method === 'GET') return send(res, 200, JSON.stringify({ ok: true }), 'application/json');

  const writes = req.method === 'POST' || req.method === 'DELETE';
  if (writes) {
    if (req.headers.origin !== `http://${req.headers.host}`) return send(res, 403, 'Only Domino Run can save here.');
    if (req.method === 'POST' && !(req.headers['content-type'] ?? '').startsWith('application/json')) return send(res, 415, 'Send JSON.');
  }

  if (kind === 'params') {
    if (req.method !== 'POST') return send(res, 405, 'Method not allowed');
    let values;
    try { values = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, e.message); }
    if (!values || typeof values !== 'object' || Array.isArray(values)) return send(res, 400, 'Send an object of settings.');
    await writeAtomic(path.join(DOMINO_DIR, 'params.json'), `${JSON.stringify(values, null, 2)}\n`);
    return send(res, 200, JSON.stringify({ ok: true }), 'application/json');
  }

  const dir = DOMINO_KINDS[kind];
  if (!dir || parts.length > 2) return send(res, 404, 'Not found');

  if (!file) {
    if (req.method === 'GET') {
      let names = [];
      try { names = (await readdir(dir)).filter(n => n.endsWith('.json')); } catch {}
      const items = [];
      for (const n of names) {
        try {
          const { id, name, savedAt, count, thumb } = JSON.parse(await readFile(path.join(dir, n), 'utf8'));
          items.push({ id, name, savedAt, count, thumb: thumb ? `${DOMINO}/${kind}/${id}.jpg` : null });
        } catch {}
      }
      items.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
      return send(res, 200, JSON.stringify(items), 'application/json');
    }
    if (req.method !== 'POST') return send(res, 405, 'Method not allowed');
    let body;
    try { body = JSON.parse(await readBody(req, DOMINO_MAX)); } catch (e) { return send(res, 400, e.message); }
    const { id, name, savedAt, data, thumb } = body ?? {};
    if (typeof id !== 'string' || !ID.test(id)) return send(res, 400, 'Bad id.');
    if (typeof name !== 'string' || !name.trim() || name.length > 120) return send(res, 400, 'Give it a name.');
    if (!data || !Array.isArray(data.dominoes)) return send(res, 400, 'Nothing to save.');
    await mkdir(dir, { recursive: true });
    let hasThumb = false;
    if (typeof thumb === 'string' && thumb.startsWith('data:image/jpeg;base64,')) {
      await writeAtomic(path.join(dir, `${id}.jpg`), Buffer.from(thumb.slice(23), 'base64'));
      hasThumb = true;
    }
    const record = { id, name: name.trim(), savedAt: savedAt ?? new Date().toISOString(), count: data.dominoes.length, thumb: hasThumb, data };
    await writeAtomic(path.join(dir, `${id}.json`), `${JSON.stringify(record, null, 1)}\n`);
    return send(res, 200, JSON.stringify({ id }), 'application/json');
  }

  const jpg = file.endsWith('.jpg');
  const id = jpg ? file.slice(0, -4) : file;
  if (!ID.test(id)) return send(res, 400, 'Bad id.');
  if (req.method === 'GET') {
    try {
      if (jpg) {
        const buf = await readFile(path.join(dir, `${id}.jpg`));
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        return res.end(buf);
      }
      const record = JSON.parse(await readFile(path.join(dir, `${id}.json`), 'utf8'));
      return send(res, 200, JSON.stringify(record.data), 'application/json');
    } catch { return send(res, 404, 'Not found'); }
  }
  if (req.method === 'DELETE' && !jpg) {
    await rm(path.join(dir, `${id}.json`), { force: true });
    await rm(path.join(dir, `${id}.jpg`), { force: true });
    return send(res, 200, JSON.stringify({ ok: true }), 'application/json');
  }
  return send(res, 405, 'Method not allowed');
}

/* ---- Kaleidoscopes: configurations made in the Kaleidoscope Lab ---- */
const KALEIDO = '/__kaleido';
const KALEIDO_FILE = path.join(ROOT, 'tinkering', 'kaleidoscopes', 'configs.json');
const COLOUR = /^#[0-9a-f]{6}$/i;

async function kaleidoApi(req, res, pathname) {
  const route = pathname.slice(KALEIDO.length + 1);
  if (route === 'ping' && req.method === 'GET') return send(res, 200, JSON.stringify({ ok: true }), 'application/json');
  if (route !== 'configs') return send(res, 404, 'Not found');
  if (req.method !== 'POST') return send(res, 405, 'Method not allowed');
  if (req.headers.origin !== `http://${req.headers.host}`) return send(res, 403, 'Only the Kaleidoscope Lab can save here.');
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return send(res, 415, 'Send JSON.');

  let list;
  try { list = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, e.message); }
  if (!Array.isArray(list) || list.length > 500) return send(res, 400, 'Send a list of configurations.');
  const seen = new Set();
  for (const c of list) {
    if (!c || typeof c !== 'object') return send(res, 400, 'Each configuration must be an object.');
    if (typeof c.id !== 'string' || !ID.test(c.id) || seen.has(c.id)) return send(res, 400, 'Bad or repeated id.');
    seen.add(c.id);
    if (typeof c.name !== 'string' || !c.name.trim() || c.name.length > 120) return send(res, 400, 'Give each one a name.');
    if (c.about != null && (typeof c.about !== 'string' || c.about.length > 400)) return send(res, 400, 'Description too long.');
    if (!c.params || typeof c.params !== 'object' || Array.isArray(c.params)) return send(res, 400, 'Missing settings.');
    for (const v of Object.values(c.params)) {
      const ok = (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && (COLOUR.test(v) || /^[a-z0-9]{1,16}$/.test(v)));
      if (!ok) return send(res, 400, 'Settings must be numbers, colours or names.');
    }
  }
  await writeAtomic(KALEIDO_FILE, `${JSON.stringify(list, null, 2)}\n`);
  return send(res, 200, JSON.stringify({ ok: true }), 'application/json');
}

/* ---- Server ---- */
const server = createServer(async (req, res) => {
  try {
    // a hostile domain can point itself at 127.0.0.1, so the name has to be ours as well
    const { port } = server.address();
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) return send(res, 403, 'Wrong host.');

    const { pathname } = new URL(req.url, 'http://local');
    if (Object.hasOwn(STORES, pathname)) await versionsApi(req, res, STORES[pathname]);
    else if (pathname === DOMINO || pathname.startsWith(`${DOMINO}/`)) await dominoApi(req, res, pathname);
    else if (pathname.startsWith(`${KALEIDO}/`)) await kaleidoApi(req, res, pathname);
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
  console.log(`Site:  ${url}\nLab:   ${url}tinkering/split-flap-lab/\nHalftone: ${url}tinkering/halftone-lab/\nDominoes: ${url}tinkering/domino-run/\nKaleidoscopes: ${url}tinkering/kaleidoscopes/`);
  if (process.argv.includes('--open')) spawn('open', [url], { stdio: 'ignore' }).on('error', () => {});
});

let tries = 0;
server.listen(FIRST_PORT, '127.0.0.1');
