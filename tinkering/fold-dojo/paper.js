/* Paper: colours, printed patterns, weights and sizes, drawn into canvas textures. The
   pattern is drawn once per choice; creases are drawn over a copy each time a fold adds one. */

export const COLORS = [
  { id: 'red', name: 'Red', hex: '#c8282e' }, { id: 'vermilion', name: 'Vermilion', hex: '#e2542b' },
  { id: 'orange', name: 'Orange', hex: '#ef8a24' }, { id: 'yellow', name: 'Yellow', hex: '#f1c22e' },
  { id: 'lime', name: 'Lime', hex: '#9cc63b' }, { id: 'green', name: 'Green', hex: '#2f8f4e' },
  { id: 'teal', name: 'Teal', hex: '#1f8a8a' }, { id: 'sky', name: 'Sky', hex: '#4aa3df' },
  { id: 'blue', name: 'Blue', hex: '#2456a6' }, { id: 'navy', name: 'Navy', hex: '#1d2c5a' },
  { id: 'purple', name: 'Purple', hex: '#6b3fa0' }, { id: 'pink', name: 'Pink', hex: '#e86a9a' },
  { id: 'peach', name: 'Peach', hex: '#f4b393' }, { id: 'cream', name: 'Cream', hex: '#efe6cf' },
  { id: 'brown', name: 'Brown', hex: '#7a4a2a' }, { id: 'gray', name: 'Grey', hex: '#8c8f94' },
  { id: 'black', name: 'Black', hex: '#232427' }, { id: 'white', name: 'White', hex: '#f4f2ec' },
];
export const colorHex = id => (COLORS.find(c => c.id === id) || COLORS[0]).hex;

// usesColor: whether the chosen colour tints the pattern. metal: foil, so it reflects.
export const PATTERNS = [
  { id: 'solid', name: 'Plain', usesColor: true },
  { id: 'washi', name: 'Washi', usesColor: true },
  { id: 'seigaiha', name: 'Waves', usesColor: true },
  { id: 'asanoha', name: 'Hemp leaf', usesColor: true },
  { id: 'sakura', name: 'Blossom', usesColor: true },
  { id: 'dots', name: 'Dots', usesColor: true },
  { id: 'stripes', name: 'Stripes', usesColor: true },
  { id: 'gingham', name: 'Gingham', usesColor: true },
  { id: 'marble', name: 'Marbled', usesColor: true },
  { id: 'gradient', name: 'Rainbow', usesColor: false },
  { id: 'kraft', name: 'Kraft', usesColor: false },
  { id: 'newsprint', name: 'Newsprint', usesColor: false },
  { id: 'gold', name: 'Gold foil', usesColor: false, metal: true },
  { id: 'silver', name: 'Silver foil', usesColor: false, metal: true },
];

// mm: sheet thickness. curl: how much a moving flap bends behind the crease. rough: surface.
// crease: how strongly a fold shows once it's opened again (fibres crack in heavier paper).
export const WEIGHTS = [
  { id: 'thin', name: 'Thin kami', gsm: 50, mm: 0.06, curl: 0.55, rough: 0.8, crease: 0.55, note: 'Light and crisp. Flaps flutter as they move.' },
  { id: 'kami', name: 'Kami', gsm: 70, mm: 0.08, curl: 0.38, rough: 0.75, crease: 0.7, note: 'Standard origami paper. Holds a sharp crease.' },
  { id: 'copy', name: 'Copy paper', gsm: 80, mm: 0.1, curl: 0.26, rough: 0.86, crease: 0.85, note: 'Everyday printer paper.' },
  { id: 'washi', name: 'Washi', gsm: 100, mm: 0.14, curl: 0.18, rough: 0.93, crease: 0.75, note: 'Soft, fibrous and strong.' },
  { id: 'card', name: 'Light card', gsm: 160, mm: 0.21, curl: 0.06, rough: 0.8, crease: 1, note: 'Stiff. Layers build up thick in the crane.' },
];

export const SIZES = {
  square: [
    { id: 's75', name: '7.5 cm', w: 0.075, h: 0.075 },
    { id: 's15', name: '15 cm', w: 0.15, h: 0.15 },
    { id: 's24', name: '24 cm', w: 0.24, h: 0.24 },
    { id: 's35', name: '35 cm', w: 0.35, h: 0.35 },
  ],
  rect: [
    { id: 'a5', name: 'A5', w: 0.148, h: 0.21 },
    { id: 'a4', name: 'A4', w: 0.21, h: 0.297 },
    { id: 'letter', name: 'Letter', w: 0.2159, h: 0.2794 },
  ],
};

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shade(hex, k) {           // k > 0 lightens toward white, k < 0 darkens toward black
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const t = k > 0 ? 255 : 0, a = Math.abs(k);
  r = Math.round(r + (t - r) * a); g = Math.round(g + (t - g) * a); b = Math.round(b + (t - b) * a);
  return `rgb(${r},${g},${b})`;
}

// fine fibres and mottling every paper has
function fibres(g, W, H, rnd, amount = 1, long = false) {
  for (let i = 0; i < W * H / 260 * amount; i++) {
    g.globalAlpha = 0.025 + rnd() * 0.05;
    g.fillStyle = rnd() < 0.5 ? '#000' : '#fff';
    g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  if (long) {
    g.lineCap = 'round';
    for (let i = 0; i < W * H / 9000 * amount; i++) {
      g.globalAlpha = 0.06 + rnd() * 0.1;
      g.strokeStyle = rnd() < 0.7 ? '#fff' : '#000';
      g.lineWidth = 0.6 + rnd() * 1.6;
      const x = rnd() * W, y = rnd() * H, a = rnd() * 6.28, l = 10 + rnd() * 50;
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
  }
  g.globalAlpha = 1;
}

const DRAW = {
  solid(g, W, H, c, rnd) { g.fillStyle = c; g.fillRect(0, 0, W, H); fibres(g, W, H, rnd, 0.6); },
  washi(g, W, H, c, rnd) {
    g.fillStyle = c; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) {      // uneven pulp
      const x = rnd() * W, y = rnd() * H, r = 40 + rnd() * 160;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rnd() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    fibres(g, W, H, rnd, 1.4, true);
  },
  seigaiha(g, W, H, c, rnd) {
    g.fillStyle = shade(c, 0.82); g.fillRect(0, 0, W, H);
    const R = W / 14;
    g.lineWidth = R * 0.07;
    for (let row = -1; row * R * 0.5 < H + R; row++) {
      for (let col = -1; col * R * 2 < W + R * 2; col++) {
        const x = col * R * 2 + (row % 2 ? R : 0), y = row * R * 0.5;
        for (let k = 4; k >= 1; k--) {
          g.beginPath(); g.arc(x, y, (R * k) / 4, Math.PI, 0, false);
          g.fillStyle = k === 4 ? shade(c, 0.82) : k % 2 ? shade(c, 0.82) : c;
          g.fill();
          g.strokeStyle = c; g.stroke();
        }
      }
    }
    fibres(g, W, H, rnd, 0.5);
  },
  asanoha(g, W, H, c, rnd) {
    g.fillStyle = c; g.fillRect(0, 0, W, H);
    const s = W / 9, hh = s * Math.sqrt(3) / 2;
    g.strokeStyle = shade(c, 0.75); g.lineWidth = s * 0.03;
    // a lattice of triangles, each split into three kites meeting at its centre
    for (let row = -1; row * hh < H + hh; row++) {
      for (let col = -1; col * s < W + s; col++) {
        const x0 = col * s + (row % 2 ? s / 2 : 0), y0 = row * hh;
        const tris = [[[x0, y0], [x0 + s, y0], [x0 + s / 2, y0 + hh]], [[x0 + s, y0], [x0 + s * 1.5, y0 + hh], [x0 + s / 2, y0 + hh]]];
        for (const t of tris) {
          const cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cy = (t[0][1] + t[1][1] + t[2][1]) / 3;
          g.beginPath();
          for (const p of t) { g.moveTo(p[0], p[1]); g.lineTo(cx, cy); }
          g.moveTo(...t[0]); g.lineTo(...t[1]); g.lineTo(...t[2]); g.closePath();
          g.stroke();
        }
      }
    }
    fibres(g, W, H, rnd, 0.5);
  },
  sakura(g, W, H, c, rnd) {
    g.fillStyle = c; g.fillRect(0, 0, W, H);
    const n = Math.round(W * H / 26000);
    for (let i = 0; i < n; i++) {
      const x = rnd() * W, y = rnd() * H, r = W * (0.012 + rnd() * 0.022), rot = rnd() * 6.28;
      const col = rnd() < 0.5 ? '#fbe3ea' : rnd() < 0.5 ? '#f4b8c8' : '#ffffff';
      g.save(); g.translate(x, y); g.rotate(rot);
      g.fillStyle = col; g.globalAlpha = 0.92;
      for (let k = 0; k < 5; k++) {
        g.rotate((Math.PI * 2) / 5);
        g.beginPath(); g.moveTo(0, 0);
        g.bezierCurveTo(r * 0.5, -r * 0.35, r * 1.05, -r * 0.25, r, 0.02 * r);
        g.lineTo(r * 0.86, r * 0.12);
        g.bezierCurveTo(r * 1.0, r * 0.3, r * 0.5, r * 0.4, 0, 0);
        g.fill();
      }
      g.fillStyle = '#d9a03a'; g.beginPath(); g.arc(0, 0, r * 0.16, 0, 6.28); g.fill();
      g.restore();
    }
    g.globalAlpha = 1;
    fibres(g, W, H, rnd, 0.6);
  },
  dots(g, W, H, c, rnd) {
    g.fillStyle = c; g.fillRect(0, 0, W, H);
    const s = W / 12; g.fillStyle = shade(c, 0.85);
    for (let y = 0, row = 0; y < H + s; y += s * 0.866, row++) for (let x = row % 2 ? s / 2 : 0; x < W + s; x += s) { g.beginPath(); g.arc(x, y, s * 0.2, 0, 6.28); g.fill(); }
    fibres(g, W, H, rnd, 0.5);
  },
  stripes(g, W, H, c, rnd) {
    g.fillStyle = shade(c, 0.85); g.fillRect(0, 0, W, H);
    g.save(); g.translate(W / 2, H / 2); g.rotate(-Math.PI / 4);
    const s = W / 16, L = Math.hypot(W, H);
    g.fillStyle = c;
    for (let x = -L; x < L; x += s * 2) g.fillRect(x, -L, s, L * 2);
    g.restore();
    fibres(g, W, H, rnd, 0.5);
  },
  gingham(g, W, H, c, rnd) {
    g.fillStyle = '#f6f3ea'; g.fillRect(0, 0, W, H);
    const s = W / 18;
    g.globalAlpha = 0.5; g.fillStyle = c;
    for (let x = 0; x < W; x += s * 2) g.fillRect(x, 0, s, H);
    for (let y = 0; y < H; y += s * 2) g.fillRect(0, y, W, s);
    g.globalAlpha = 1;
    fibres(g, W, H, rnd, 0.5);
  },
  marble(g, W, H, c, rnd) {
    // suminagashi: ink dropped on water in rings, then drawn across with a comb
    g.fillStyle = '#f3ecdc'; g.fillRect(0, 0, W, H);
    const img = g.getImageData(0, 0, W, H), d = img.data;
    const n = parseInt(c.slice(1), 16), cr = n >> 16, cg = (n >> 8) & 255, cb = n & 255;
    const drops = Array.from({ length: 5 }, () => [rnd() * W, rnd() * H, 0.7 + rnd() * 0.6]);
    const sc = 2;   // work at half resolution, then scale up
    for (let y = 0; y < H; y += sc) {
      for (let x = 0; x < W; x += sc) {
        const wx = x + Math.sin(y * 0.006 + 1.3) * W * 0.05 + Math.sin(y * 0.017) * W * 0.012;
        const wy = y + Math.sin(x * 0.005 + 0.4) * H * 0.04;
        let v = 0;
        for (const [px, py, k] of drops) v += Math.sin(Math.hypot(wx - px, wy - py) * 0.045 * k);
        const ink = Math.max(0, Math.min(1, (Math.sin(v * 2.2) - 0.1) * 1.8));
        for (let yy = y; yy < Math.min(H, y + sc); yy++) for (let xx = x; xx < Math.min(W, x + sc); xx++) {
          const i = (yy * W + xx) * 4;
          d[i] = d[i] + (cr - d[i]) * ink * 0.85; d[i + 1] = d[i + 1] + (cg - d[i + 1]) * ink * 0.85; d[i + 2] = d[i + 2] + (cb - d[i + 2]) * ink * 0.85;
        }
      }
    }
    g.putImageData(img, 0, 0);
    fibres(g, W, H, rnd, 0.6);
  },
  gradient(g, W, H, c, rnd) {
    const gr = g.createLinearGradient(0, 0, W, H);
    ['#e8414b', '#f08a24', '#f1c22e', '#5fb34a', '#2f8fd0', '#6b3fa0'].forEach((col, i, a) => gr.addColorStop(i / (a.length - 1), col));
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    fibres(g, W, H, rnd, 0.5);
  },
  kraft(g, W, H, c, rnd) { g.fillStyle = '#b98d5d'; g.fillRect(0, 0, W, H); fibres(g, W, H, rnd, 2.2, true); },
  newsprint(g, W, H, c, rnd) {
    g.fillStyle = '#e7e3d8'; g.fillRect(0, 0, W, H);
    const cols = 5, m = W * 0.05, cw = (W - m * 2) / cols;
    g.fillStyle = '#3a3a3a';
    let y = m;
    g.globalAlpha = 0.85;
    g.fillRect(m, y, W - m * 2, W * 0.035); y += W * 0.06;
    for (let ci = 0; ci < cols; ci++) {
      let yy = y;
      while (yy < H - m) {
        if (rnd() < 0.05) { g.globalAlpha = 0.6; g.fillRect(m + ci * cw + 4, yy, cw - 8, W * 0.02); yy += W * 0.03; g.globalAlpha = 0.85; continue; }
        if (rnd() < 0.03) { g.globalAlpha = 0.18; g.fillRect(m + ci * cw + 4, yy, cw - 8, W * 0.12); yy += W * 0.135; g.globalAlpha = 0.85; continue; }
        const len = rnd() < 0.12 ? cw * (0.3 + rnd() * 0.5) : cw - 8;
        g.globalAlpha = 0.42; g.fillRect(m + ci * cw + 4, yy, len, W * 0.0045);
        yy += W * 0.0095;
      }
    }
    g.globalAlpha = 1;
    fibres(g, W, H, rnd, 1.2);
  },
  gold(g, W, H) { metal(g, W, H, ['#8a6a24', '#e7c56a', '#b8902f', '#f4dc8e']); },
  silver(g, W, H) { metal(g, W, H, ['#7d8186', '#d9dde1', '#a3a8ad', '#eef0f2']); },
};
function metal(g, W, H, stops) {
  const gr = g.createLinearGradient(0, 0, W, H);
  stops.forEach((s, i) => gr.addColorStop(i / (stops.length - 1), s));
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const rnd = mulberry(5);
  for (let i = 0; i < 1400; i++) { g.globalAlpha = 0.04; g.fillStyle = rnd() < 0.5 ? '#fff' : '#000'; g.fillRect(0, rnd() * H, W, 1); }
  g.globalAlpha = 1;
}

// one side of the sheet: w and h in metres, so patterns keep their real size on any sheet
export function drawSide(pattern, color, w, h, px = 2048) {
  const W = Math.round(px * Math.min(1, w / h)), H = Math.round(px * Math.min(1, h / w));
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const g = c.getContext('2d');
  // patterns are designed for a 15 cm square; scale so larger paper has more repeats
  const scale = Math.max(w, h) / 0.15;
  const rnd = mulberry(11);
  if (pattern === 'solid' || pattern === 'washi' || pattern === 'kraft' || pattern === 'gold' || pattern === 'silver' || pattern === 'gradient' || pattern === 'marble') {
    DRAW[pattern](g, W, H, color, rnd);
  } else {
    // draw at 15 cm scale into a tile and repeat it
    const tw = Math.round(W / scale), th = Math.round(H / scale);
    if (scale <= 1.05 || pattern === 'newsprint') DRAW[pattern](g, W, H, color, rnd);
    else {
      const t = Object.assign(document.createElement('canvas'), { width: tw, height: th });
      DRAW[pattern](t.getContext('2d'), tw, th, color, rnd);
      for (let y = 0; y < H; y += th) for (let x = 0; x < W; x += tw) g.drawImage(t, x, y);
    }
  }
  return c;
}

// a small preview of a pattern, for the picker
export function swatch(pattern, color, size = 40) {
  const c = Object.assign(document.createElement('canvas'), { width: size * 2, height: size * 2 });
  const big = drawSide(pattern, color, 0.15, 0.15, 400);
  c.getContext('2d').drawImage(big, 0, 0, 200, 200, 0, 0, size * 2, size * 2);
  return c;
}

// creases over a copy of the side. `flip` mirrors valley and mountain for the back.
export function withCreases(base, creases, sheet, strength, back) {
  const c = Object.assign(document.createElement('canvas'), { width: base.width, height: base.height });
  const g = c.getContext('2d');
  g.drawImage(base, 0, 0);
  const W = c.width, H = c.height;
  const toPx = p => [((p[0] + sheet.w / 2) / sheet.w) * W, (1 - (p[1] + sheet.h / 2) / sheet.h) * H];
  g.lineCap = 'round';
  for (const cr of creases) {
    const a = toPx(cr.a), b = toPx(cr.b);
    const valley = back ? !cr.valley : cr.valley;
    // a valley shows a dark line in its trough, a mountain a light ridge with a shadow beside it
    const lw = Math.max(1.2, W / 900);
    g.globalAlpha = (valley ? 0.28 : 0.2) * strength;
    g.strokeStyle = '#000'; g.lineWidth = lw;
    g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke();
    const nx = -(b[1] - a[1]), ny = b[0] - a[0], nl = Math.hypot(nx, ny) || 1;
    const o = lw * 0.9;
    g.globalAlpha = (valley ? 0.18 : 0.34) * strength;
    g.strokeStyle = '#fff'; g.lineWidth = lw * 0.8;
    g.beginPath(); g.moveTo(a[0] + (nx / nl) * o, a[1] + (ny / nl) * o); g.lineTo(b[0] + (nx / nl) * o, b[1] + (ny / nl) * o); g.stroke();
  }
  g.globalAlpha = 1;
  return c;
}

// a grey fibre map for the paper's surface relief, one tile per 10 cm
let fibreTile = null;
export function fibreCanvas() {
  if (fibreTile) return fibreTile;
  const S = 512;
  const c = Object.assign(document.createElement('canvas'), { width: S, height: S });
  const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
  fibres(g, S, S, mulberry(3), 3, true);
  fibreTile = c;
  return c;
}
