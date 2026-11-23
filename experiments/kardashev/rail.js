/* Powers of Watts — the rail: a printed scale of powers of ten, 10⁰ to 10³⁷ W, with a copper needle for where the
   zoom is. Kardashev's types sit on it as marks; the chapters as numbered notches. Drag, scroll or use the arrow keys
   to travel. Under the types, the year each would arrive at 2.3% growth a year: ten times every century. */
import { sup, TODAY, TODAY_YEAR } from './data.js';

const P_MIN = 0, P_MAX = 37;
const MARKS = [
  { p: 2, text: 'a body' },
  { p: 9.4, text: 'a city' },
  { p: 13.27, text: 'humanity', strong: true },
];
const yearAt = p => Math.round(TODAY_YEAR + Math.log(Math.pow(10, p) / TODAY) / Math.log(1.023));   // the same sum the Today chapter does
const TYPES = [{ p: 16, text: 'I', year: yearAt(16) }, { p: 26, text: 'II', year: yearAt(26) }, { p: 36, text: 'III', year: null }];

export function createRail(canvas, { onInput, chapters, onChapter }) {
  const g = canvas.getContext('2d');
  let p = 2, w = 0, h = 0, dpr = 1, done = new Set(), current = -1, dragging = false, hoverChapter = -1;
  const pad = { l: 20, r: 22 };
  const X = v => pad.l + (v - P_MIN) / (P_MAX - P_MIN) * (w - pad.l - pad.r);
  const V = x => P_MIN + (x - pad.l) / (w - pad.l - pad.r) * (P_MAX - P_MIN);

  function size() {
    dpr = Math.min(2, devicePixelRatio || 1);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    draw();
  }
  new ResizeObserver(size).observe(canvas);

  function draw() {
    if (!w) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const base = Math.round(h * 0.56) + 0.5, narrow = w < 520;
    // the window the scale is printed behind
    g.fillStyle = 'rgba(0,0,0,0.32)';
    g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 8); g.fill();
    // the Kardashev bands: each type a faint step lighter
    TYPES.forEach((T, i) => {
      const x0 = X(T.p), x1 = i + 1 < TYPES.length ? X(TYPES[i + 1].p) : w - 8;
      g.fillStyle = `rgba(224,138,60,${0.025 + i * 0.02})`;
      g.fillRect(x0, 12, x1 - x0, h - 24);
    });
    // ticks: one per power of ten, longer every fifth
    g.strokeStyle = 'rgba(236,230,216,0.28)'; g.lineWidth = 1;
    g.beginPath();
    for (let v = P_MIN; v <= P_MAX; v++) {
      const x = Math.round(X(v)) + 0.5, long = v % 5 === 0;
      g.moveTo(x, base - (long ? 7 : 3.5)); g.lineTo(x, base + (long ? 7 : 3.5));
    }
    g.moveTo(X(P_MIN), base); g.lineTo(X(P_MAX), base);
    g.stroke();
    g.font = '10px "Söhne Mono", ui-monospace, monospace'; g.textBaseline = 'middle'; g.textAlign = 'center';
    g.fillStyle = 'rgba(236,230,216,0.42)';
    for (let v = 0; v <= P_MAX; v += narrow ? 10 : 5) g.fillText(`10${sup(v)}`, X(v), base + 17);
    // the types, printed bolder, with their year at 2.3% a year; their boxes are kept so the everyday marks can step aside
    const taken = [];
    for (const T of TYPES) {
      const x = Math.round(X(T.p)) + 0.5;
      g.strokeStyle = 'rgba(224,138,60,0.7)'; g.beginPath(); g.moveTo(x, 14); g.lineTo(x, base + 9); g.stroke();
      const right = x > w - 150;            // near the end, print to the left of the mark
      g.fillStyle = '#e08a3c'; g.textAlign = right ? 'right' : 'left';
      const tx = right ? x - 5 : x + 5;
      g.font = '600 11px "Söhne", sans-serif';
      const name = narrow ? T.text : `Type ${T.text}`;
      let wd = g.measureText(name).width;
      const box = right ? [tx - wd - 4, tx + 4] : [tx - 4, tx + wd + 4];
      if (taken.some(([a, b]) => box[1] > a && box[0] < b)) continue;
      g.fillText(name, tx, 22);
      if (!narrow) {
        g.font = '10px "Söhne Mono", ui-monospace, monospace'; g.fillStyle = 'rgba(224,138,60,0.6)';
        const yr = T.year ? `${T.year} at 2.3%` : 'no date: light is too slow';
        g.fillText(yr, tx, 35);
        wd = Math.max(wd, g.measureText(yr).width);
      }
      taken.push(right ? [tx - wd - 6, tx + 6] : [tx - 6, tx + wd + 6]);
    }
    const nX = X(p);
    taken.push([nX - 8, nX + 8]);
    // everyday marks
    g.font = '10px "Söhne Mono", ui-monospace, monospace'; g.textAlign = 'center';
    for (const M of MARKS) {
      if (narrow) continue;
      const x = Math.round(X(M.p)) + 0.5, half = g.measureText(M.text).width / 2 + 4;
      g.fillStyle = M.strong ? 'rgba(236,230,216,0.85)' : 'rgba(236,230,216,0.5)';
      g.fillRect(x - 1, base - 2, 2, 4);
      if (taken.some(([a, b]) => x + half > a && x - half < b)) continue;
      taken.push([x - half, x + half]);
      g.fillText(M.text, x, base - 16);
    }
    // chapter notches below the numbers
    chapters.forEach((c, i) => {
      const x = X(c.p), y = h - 16;
      const on = i === current, met = done.has(c.id), hov = i === hoverChapter;
      g.fillStyle = on ? '#e08a3c' : met ? 'rgba(224,138,60,0.55)' : hov ? 'rgba(236,230,216,0.7)' : 'rgba(236,230,216,0.3)';
      g.beginPath(); g.arc(x, y, on ? 3.5 : 2.5, 0, Math.PI * 2); g.fill();
    });
    // the needle
    const nx = Math.round(X(Math.min(P_MAX, Math.max(P_MIN, p)))) + 0.5;
    const grd = g.createLinearGradient(nx - 18, 0, nx + 18, 0);
    grd.addColorStop(0, 'rgba(224,138,60,0)'); grd.addColorStop(0.5, 'rgba(224,138,60,0.16)'); grd.addColorStop(1, 'rgba(224,138,60,0)');
    g.fillStyle = grd; g.fillRect(nx - 18, 12, 36, h - 24);
    g.strokeStyle = '#ffb06a'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(nx, 12); g.lineTo(nx, h - 12); g.stroke();
    g.fillStyle = '#ffb06a';
    g.beginPath(); g.moveTo(nx - 5, 12); g.lineTo(nx + 5, 12); g.lineTo(nx, 18); g.closePath(); g.fill();
  }

  function chapterAt(x, y) {
    if (y < h - 30) return -1;
    let best = -1, bd = 12;
    chapters.forEach((c, i) => { const d = Math.abs(X(c.p) - x); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  const rel = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointerdown', e => {
    const [x, y] = rel(e);
    const c = chapterAt(x, y);
    if (c >= 0) { onChapter(c); return; }
    dragging = true; canvas.setPointerCapture(e.pointerId);
    onInput(Math.min(P_MAX, Math.max(P_MIN, V(x))), { drag: true });
  });
  canvas.addEventListener('pointermove', e => {
    const [x, y] = rel(e);
    if (dragging) { onInput(Math.min(P_MAX, Math.max(P_MIN, V(x))), { drag: true }); return; }
    const c = chapterAt(x, y);
    if (c !== hoverChapter) { hoverChapter = c; canvas.style.cursor = c >= 0 ? 'pointer' : ''; canvas.title = c >= 0 ? `${c + 1}. ${chapters[c].name}` : ''; draw(); }
  });
  const end = () => { dragging = false; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => { if (hoverChapter >= 0) { hoverChapter = -1; draw(); } });
  canvas.addEventListener('keydown', e => {
    const step = e.shiftKey || e.key === 'PageUp' || e.key === 'PageDown' ? 1 : 0.1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'PageUp') { onInput(Math.min(P_MAX, p + step), { drag: true }); e.preventDefault(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'PageDown') { onInput(Math.max(P_MIN, p - step), { drag: true }); e.preventDefault(); }
    e.stopPropagation();
  });

  return {
    set(v) { if (Math.abs(v - p) < 1e-4) return; p = v; canvas.setAttribute('aria-valuenow', v.toFixed(1)); canvas.setAttribute('aria-valuetext', `10 to the ${v.toFixed(1)} watts`); draw(); },
    setCurrent(i) { current = i; draw(); },
    setDone(s) { done = s; draw(); },
    get dragging() { return dragging; },
    size,
  };
}
