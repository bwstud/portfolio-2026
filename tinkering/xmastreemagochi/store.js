/* Saves. Signed in: the account on the server (/api/xmas). Otherwise: this browser. */
const API = '/api/xmas';
const GUEST_KEY = 'xmastreemagochi:guest';

async function call(op, method = 'GET', body) {
  const res = await fetch(`${API}?op=${op}`, {
    method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, data };
}

export const store = {
  mode: 'none',          // 'account' | 'guest'
  user: null,
  accounts: true,        // false when the server has no storage set up
  saving: false,
  lastSaved: 0,
  _timer: null,
  _pending: null,

  async init() {
    try {
      const r = await call('me');
      if (r.ok) { this.mode = 'account'; this.user = r.data.user; return; }
      if (r.status === 503 || r.status === 404 || r.status === 405) this.accounts = false;
    } catch { this.accounts = false; }
  },
  hasGuest() { try { return !!localStorage.getItem(GUEST_KEY); } catch { return false; } },
  guest() { this.mode = 'guest'; this.user = null; },

  async auth(kind, username, password) {
    const r = await call(kind, 'POST', { username, password });
    if (!r.ok) return r.data.error || 'Something went wrong.';
    this.mode = 'account'; this.user = r.data.user;
    return null;
  },
  async logout() {
    await this.flush();
    await call('logout', 'POST').catch(() => {});
    this.mode = 'none'; this.user = null;
  },

  async load() {
    if (this.mode === 'account') {
      const r = await call('state');
      if (r.ok) return r.data.state;
      throw new Error(r.data.error || 'Could not load your trees.');
    }
    try { return JSON.parse(localStorage.getItem(GUEST_KEY)); } catch { return null; }
  },
  loadGuest() { try { return JSON.parse(localStorage.getItem(GUEST_KEY)); } catch { return null; } },
  clearGuest() { try { localStorage.removeItem(GUEST_KEY); } catch {} },

  save(state, now = false) {
    this._pending = state;
    clearTimeout(this._timer);
    if (now) return this.flush();
    this._timer = setTimeout(() => this.flush(), 1500);
  },
  async flush() {
    clearTimeout(this._timer);
    const state = this._pending;
    if (!state) return;
    this._pending = null;
    if (this.mode === 'account') {
      this.saving = true;
      try {
        const r = await call('state', 'PUT', state);
        if (r.ok) this.lastSaved = Date.now();
        else this.onError?.(r.data.error || 'Save failed.');
      } catch { this.onError?.('Offline. Will retry.'); this._pending = this._pending || state; }
      this.saving = false;
    } else if (this.mode === 'guest') {
      try { localStorage.setItem(GUEST_KEY, JSON.stringify(state)); this.lastSaved = Date.now(); } catch {}
    }
  },
};

addEventListener('pagehide', () => {
  if (!store._pending) return;
  if (store.mode === 'account') {
    const blob = new Blob([JSON.stringify(store._pending)], { type: 'application/json' });
    // sendBeacon is POST only; fall back to a keepalive PUT
    fetch(`${API}?op=state`, { method: 'PUT', body: blob, keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } }).catch(() => {});
  } else if (store.mode === 'guest') {
    try { localStorage.setItem(GUEST_KEY, JSON.stringify(store._pending)); } catch {}
  }
});
