/* Shared by the main page and the lab: moving the picture under the mirrors by hand, and
   small rendered thumbnails of each kaleidoscope. */
import { Scope, pose } from './scope.js';

/* Pointer gestures on a view canvas. user = { x, y, rot, scale } is changed in place.
   - drag: slide the picture under the mirrors
   - shift-drag, or two fingers twisting: turn it
   - wheel, or pinch: magnify
   - double-click: put it back */
export function attachGestures(canvas, { user, config, onChange = () => {} }) {
  const pts = new Map();
  let last = null;

  const reset = () => { Object.assign(user, { x: 0, y: 0, rot: 0, scale: 1 }); onChange(); };

  function pair() {
    const [a, b] = [...pts.values()];
    return { d: Math.hypot(b.x - a.x, b.y - a.y), a: Math.atan2(b.y - a.y, b.x - a.x), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function slide(dx, dy) {
    const cfg = config();
    const m = Math.min(canvas.clientWidth, canvas.clientHeight) || 1;
    const P = pose(cfg, 0, user);
    const k = (2 / m) * P.zoom * P.picScale;
    user.x -= dx * k;
    user.y += dy * k;
    user.x = Math.max(-3, Math.min(3, user.x));
    user.y = Math.max(-3, Math.min(3, user.y));
  }

  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    last = pts.size === 2 ? pair() : { x: e.clientX, y: e.clientY };
    canvas.classList.add('is-dragging');
  });

  canvas.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      const now = pair();
      if (last?.d) {
        user.scale = Math.max(0.15, Math.min(6, user.scale * (last.d / now.d)));
        user.rot += (now.a - last.a) * 180 / Math.PI;
        slide(now.x - last.x, now.y - last.y);
      }
      last = now;
    } else if (pts.size === 1 && last) {
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      if (e.shiftKey) user.rot += dx * 0.35;
      else slide(dx, dy);
      last = { x: e.clientX, y: e.clientY };
    }
    onChange();
  });

  const end = e => {
    pts.delete(e.pointerId);
    last = pts.size === 1 ? { ...[...pts.values()][0] } : null;
    if (!pts.size) canvas.classList.remove('is-dragging');
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    user.scale = Math.max(0.15, Math.min(6, user.scale * Math.exp(d * 0.0015)));
    onChange();
  }, { passive: false });

  canvas.addEventListener('dblclick', reset);
  return { reset };
}

/* One small WebGL canvas renders every thumbnail in turn; each is copied out to a 2D canvas.
   The same canvas is reused for every call, so only one extra WebGL context ever exists. */
let thumbScope = null;
export function renderThumb(target, cfg, sourceEl, t = 7) {
  if (!thumbScope) {
    const c = document.createElement('canvas');
    thumbScope = new Scope(c, { preserve: true, maxDpr: 1 });
    thumbScope.lastSource = null;
  }
  if (thumbScope.lastSource !== sourceEl) {
    thumbScope.setSource(sourceEl);
    thumbScope.lastSource = sourceEl;
  } else if (thumbScope.isVideo) {
    thumbScope.setSource(sourceEl); // take the current frame
  }
  const size = target.width;
  thumbScope.setSize(size, size);
  thumbScope.draw(cfg, t, {});
  const ctx = target.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(thumbScope.canvas, 0, 0);
}

/* Download a blob under a file name */
export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const fileSlug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'kaleidoscope';

/* Small status messages */
export function toaster(el) {
  let timer;
  return (text, { bad = false, ms = 2600 } = {}) => {
    el.textContent = text;
    el.classList.toggle('is-bad', bad);
    el.classList.add('is-shown');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('is-shown'), ms);
  };
}

export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
