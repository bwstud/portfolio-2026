/* Xmastreemagochi accounts and saves. One Vercel Function, routed by ?op=.
   Storage is Upstash Redis over its REST API (no npm packages: the site has no build step).
   Locally, tools/lab-server.mjs imports this file and hands it a JSON-file store instead.

   ops:  GET  me      → { user } | 401
         POST signup  { username, password } → sets the session cookie
         POST login   { username, password } → sets the session cookie
         POST logout
         GET  state   → the saved game, or null
         PUT  state   { ...game } */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
const COOKIE = 'xmas_session';
const SESSION_DAYS = 120;
const MAX_STATE = 600 * 1024;
const NAME_RE = /^[a-z0-9_.-]{3,24}$/;

/* ---- Storage ---- */
function upstash() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const cmd = async (...args) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const out = await r.json();
    if (out.error) throw new Error(out.error);
    return out.result;
  };
  return {
    get: key => cmd('GET', key),
    set: (key, value, ttlSeconds) => ttlSeconds ? cmd('SET', key, value, 'EX', ttlSeconds) : cmd('SET', key, value),
    setNew: async (key, value) => (await cmd('SET', key, value, 'NX')) === 'OK',
    del: key => cmd('DEL', key),
    incr: async (key, ttlSeconds) => {
      const n = await cmd('INCR', key);
      if (n === 1) await cmd('EXPIRE', key, ttlSeconds);
      return n;
    },
  };
}
const store = () => upstash() || globalThis.__XMAS_LOCAL_STORE || null;

/* ---- Helpers ---- */
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
});

function readCookie(request) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return null;
}

function sessionCookie(request, token, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

async function hash(password, salt = randomBytes(16).toString('hex')) {
  const key = await scrypt(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}
async function verify(password, stored) {
  const [salt, hex] = stored.split(':');
  const key = await scrypt(password, salt, 64);
  const want = Buffer.from(hex, 'hex');
  return want.length === key.length && timingSafeEqual(want, key);
}

async function currentUser(db, request) {
  const token = readCookie(request);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return db.get(`xmas:session:${token}`);
}

async function startSession(db, request, username) {
  const token = randomBytes(32).toString('hex');
  await db.set(`xmas:session:${token}`, username, SESSION_DAYS * 86400);
  return json({ user: username }, 200, { 'Set-Cookie': sessionCookie(request, token, SESSION_DAYS * 86400) });
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_STATE) throw Object.assign(new Error('Too large'), { status: 413 });
  try { return JSON.parse(text || '{}'); } catch { throw Object.assign(new Error('Bad JSON'), { status: 400 }); }
}

function credentials(body) {
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!NAME_RE.test(username)) return { error: 'Usernames are 3 to 24 letters, numbers, dots, dashes or underscores.' };
  if (password.length < 8 || password.length > 200) return { error: 'Passwords need at least 8 characters.' };
  return { username, password };
}

/* ---- Router ---- */
async function handle(request) {
  const db = store();
  if (!db) return json({ error: 'Accounts are not set up on this server yet.' }, 503);
  const op = new URL(request.url).searchParams.get('op');
  const method = request.method;

  try {
    if (op === 'me' && method === 'GET') {
      const user = await currentUser(db, request);
      return user ? json({ user }) : json({ error: 'Signed out' }, 401);
    }

    if (op === 'signup' && method === 'POST') {
      const c = credentials(await readBody(request));
      if (c.error) return json({ error: c.error }, 400);
      const created = await db.setNew(`xmas:user:${c.username}`, await hash(c.password));
      if (!created) return json({ error: 'That username is taken.' }, 409);
      return startSession(db, request, c.username);
    }

    if (op === 'login' && method === 'POST') {
      const c = credentials(await readBody(request));
      if (c.error) return json({ error: 'Wrong username or password.' }, 401);
      const tries = await db.incr(`xmas:tries:${c.username}`, 900);
      if (tries > 12) return json({ error: 'Too many tries. Wait 15 minutes.' }, 429);
      const stored = await db.get(`xmas:user:${c.username}`);
      if (!stored || !(await verify(c.password, stored))) return json({ error: 'Wrong username or password.' }, 401);
      await db.del(`xmas:tries:${c.username}`);
      return startSession(db, request, c.username);
    }

    if (op === 'logout' && method === 'POST') {
      const token = readCookie(request);
      if (token && /^[a-f0-9]{64}$/.test(token)) await db.del(`xmas:session:${token}`);
      return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(request, '', 0) });
    }

    if (op === 'state') {
      const user = await currentUser(db, request);
      if (!user) return json({ error: 'Signed out' }, 401);
      if (method === 'GET') {
        const raw = await db.get(`xmas:state:${user}`);
        return json({ state: raw ? JSON.parse(raw) : null });
      }
      if (method === 'PUT') {
        const body = await readBody(request);
        if (!body || typeof body !== 'object' || !Array.isArray(body.trees)) return json({ error: 'Bad save' }, 400);
        body.savedAt = Date.now();
        await db.set(`xmas:state:${user}`, JSON.stringify(body));
        return json({ ok: true, savedAt: body.savedAt });
      }
    }

    return json({ error: 'Not found' }, 404);
  } catch (e) {
    return json({ error: e.status ? e.message : 'Server error' }, e.status || 500);
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
