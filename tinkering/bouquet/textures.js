/* Painted textures for the rose: petal colour and veins, a bump map from the same veins, and
   serrated leaflets with alpha. Everything is drawn on canvases at load, so there are no image
   files to fetch and every colourway is a few numbers.

   Petal textures run u across the petal (0 left edge, 1 right edge) and v from the base (0) to
   the tip (1). Colour is painted near-final here; each petal's own small variation comes from
   vertex colours in the mesh. */

import * as THREE from 'three';

let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mixc = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

function canvas(w, h = w) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  return [cv, cv.getContext('2d', { willReadFrequently: true })];
}

function tex(cv, srgb = true) {
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/* Veins: a fan of fine lines from the claw that spread and branch towards the margin, as on a
   real rose petal held up to the light. Returned as polylines in uv space. */
function petalVeins() {
  seed = 11;
  const lines = [];
  const N = 46;
  for (let k = 0; k < N; k++) {
    const t = (k + 0.5) / N;                       // where across the margin it ends up
    const end = (t - 0.5) * 1.06;
    const pts = [];
    let wob = (rnd() - 0.5) * 0.01;
    for (let s = 0; s <= 24; s++) {
      const v = s / 24;
      // veins leave the narrow claw nearly parallel, then fan out with the petal's width
      const spread = Math.pow(smooth(0, 0.85, v), 0.75);
      wob += (rnd() - 0.5) * 0.004;
      pts.push([0.5 + end * spread * 0.98 + wob * v, 0.015 + v * 0.98]);
    }
    lines.push({ pts, w: 0.6 + rnd() * 0.9, a: 0.55 + rnd() * 0.45 });
    // a few branch off towards the tip
    if (rnd() < 0.45) {
      const from = 8 + Math.floor(rnd() * 10);
      const dir = rnd() < 0.5 ? -1 : 1;
      const br = pts.slice(from).map(([u, v], j) => [u + dir * j * 0.0022, v]);
      lines.push({ pts: br, w: 0.5, a: 0.4 });
    }
  }
  return lines;
}

/* A petal colourway: { face, edge, claw, back, vein } as hex. Face is the inner (upper) side,
   back the outside. Returns { map, bump } where map holds both sides side by side: the left half
   of the canvas is the face, the right half the back, and the shader picks by facing. */
export function petalTextures(c) {
  const W = 512, H = 512;
  const [cv, g] = canvas(W * 2, H);
  const [bv, bg] = canvas(W, H);
  const face = hex(c.face), edge = hex(c.edge), claw = hex(c.claw), back = hex(c.back), vein = hex(c.vein);
  const img = g.createImageData(W * 2, H);
  seed = 3;
  const noise = new Float32Array(64 * 64).map(() => rnd());
  const n2 = (u, v) => {                            // smooth value noise, 64² lattice
    const x = u * 63, y = v * 63, i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const at = (a, b) => noise[Math.min(63, b) * 64 + Math.min(63, a)];
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return mix(mix(at(i, j), at(i + 1, j), sx), mix(at(i, j + 1), at(i + 1, j + 1), sx), sy);
  };
  for (let y = 0; y < H; y++) {
    const v = 1 - y / (H - 1);
    for (let x = 0; x < W; x++) {
      const u = x / (W - 1), au = Math.abs(u - 0.5) * 2;
      const toEdge = Math.max(smooth(0.55, 1, v), smooth(0.6, 1, au) * smooth(0.25, 0.9, v));
      const mottle = (n2(u * 0.9, v * 0.9) - 0.5) * c.mottle + (n2(u * 3.1 + 0.3, v * 2.3) - 0.5) * c.mottle * 0.5;
      for (const side of [0, 1]) {
        let col = side ? back : face;
        col = mixc(col, edge, toEdge * c.edgeAmt * (side ? 0.6 : 1));
        col = mixc(claw, col, smooth(0.02, c.clawLen, v));
        const k = 1 + mottle;
        const o = (y * W * 2 + x + side * W) * 4;
        img.data[o] = Math.min(255, col[0] * k);
        img.data[o + 1] = Math.min(255, col[1] * k);
        img.data[o + 2] = Math.min(255, col[2] * k);
        img.data[o + 3] = 255;
      }
    }
  }
  g.putImageData(img, 0, 0);
  // veins on both halves (a touch stronger on the back, where they show as fine ribs)
  bg.fillStyle = '#808080';
  bg.fillRect(0, 0, W, H);
  const veins = petalVeins();
  for (const side of [0, 1]) {
    g.save();
    g.translate(side * W, 0);
    g.lineCap = 'round';
    for (const l of veins) {
      g.strokeStyle = `rgba(${vein[0]},${vein[1]},${vein[2]},${l.a * c.veinAmt * (side ? 1.25 : 1)})`;
      g.lineWidth = l.w;
      g.beginPath();
      l.pts.forEach(([u, v], i) => (i ? g.lineTo(u * W, (1 - v) * H) : g.moveTo(u * W, (1 - v) * H)));
      g.stroke();
    }
    g.restore();
  }
  bg.lineCap = 'round';
  for (const l of veins) {
    bg.strokeStyle = `rgba(150,150,150,${l.a * 0.8})`;
    bg.lineWidth = l.w * 2.2;
    bg.beginPath();
    l.pts.forEach(([u, v], i) => (i ? bg.lineTo(u * W, (1 - v) * H) : bg.moveTo(u * W, (1 - v) * H)));
    bg.stroke();
  }
  const map = tex(cv);
  const bump = tex(bv, false);
  return { map, bump };
}

/* One rose leaflet: ovate with a pointed tip, finely double-serrate, a sunk midrib and six or
   seven pairs of side veins curving up to the margin. Alpha carries the outline. */
export function leafletTexture(c) {
  const W = 256, H = 384;
  const [cv, g] = canvas(W * 2, H);
  const [bv, bg] = canvas(W, H);
  seed = 5;
  const face = hex(c.face), back = hex(c.back), rib = hex(c.rib), edge = hex(c.edge);
  // outline in leaf coords: y from 0 (base) to 1 (tip), half-width w(y)
  const halfW = y => {
    const b = Math.pow(Math.sin(Math.PI * Math.pow(y, 0.82)), 0.85);
    return 0.46 * b * (1 - 0.18 * y);
  };
  const outline = [];
  const teeth = 26;
  for (let s = 0; s <= 200; s++) {
    const y = s / 200;
    const w = halfW(y);
    // serration: saw teeth pointing forward, a small tooth between the big ones
    const ph = (y * teeth) % 1;
    const tooth = (ph < 0.75 ? ph / 0.75 : (1 - ph) / 0.25) * 0.028 * smooth(0.05, 0.2, y) * (1 - smooth(0.9, 1, y));
    outline.push([w - 0.028 * smooth(0.05, 0.2, y) + tooth, y]);
  }
  const path = (ctx, ox) => {
    ctx.beginPath();
    outline.forEach(([w, y], i) => { const X = ox + (0.5 + w) * W, Y = (1 - y) * H; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
    for (let i = outline.length - 1; i >= 0; i--) { const [w, y] = outline[i]; ctx.lineTo(ox + (0.5 - w) * W, (1 - y) * H); }
    ctx.closePath();
  };
  for (const side of [0, 1]) {
    const ox = side * W;
    const col = side ? back : face;
    g.save();
    path(g, ox);
    g.clip();
    const grd = g.createLinearGradient(ox, 0, ox + W, 0);
    const c0 = `rgb(${col.join(',')})`, c1 = `rgb(${mixc(col, edge, 0.35).map(Math.round).join(',')})`;
    grd.addColorStop(0, c1); grd.addColorStop(0.5, c0); grd.addColorStop(1, c1);
    g.fillStyle = grd;
    g.fillRect(ox, 0, W, H);
    // mottling
    for (let k = 0; k < 900; k++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,230'},${0.025 + rnd() * 0.03})`;
      g.beginPath(); g.arc(ox + rnd() * W, rnd() * H, 2 + rnd() * 7, 0, 7); g.fill();
    }
    // veins
    g.strokeStyle = `rgba(${rib.join(',')},${side ? 0.75 : 0.55})`;
    g.lineCap = 'round';
    g.lineWidth = side ? 3.2 : 2.4;
    g.beginPath(); g.moveTo(ox + W / 2, H); g.quadraticCurveTo(ox + W / 2 + 3, H * 0.5, ox + W / 2, H * 0.02); g.stroke();
    g.lineWidth = side ? 1.5 : 1.1;
    for (let k = 1; k <= 7; k++) {
      const y0 = 0.08 + k * 0.11;
      for (const d of [-1, 1]) {
        const w = halfW(Math.min(0.98, y0 + 0.12)) * 0.92;
        g.beginPath();
        g.moveTo(ox + W / 2, (1 - y0) * H);
        g.quadraticCurveTo(ox + (0.5 + d * w * 0.55) * W, (1 - y0 - 0.05) * H, ox + (0.5 + d * w) * W, (1 - y0 - 0.13) * H);
        g.stroke();
      }
    }
    g.restore();
  }
  // bump: the midrib and side veins sunk into the blade
  bg.fillStyle = '#000';
  bg.fillRect(0, 0, W, H);
  path(bg, 0);
  bg.fillStyle = '#909090';
  bg.fill();
  bg.strokeStyle = '#5a5a5a';
  bg.lineCap = 'round';
  bg.lineWidth = 4;
  bg.beginPath(); bg.moveTo(W / 2, H); bg.lineTo(W / 2, H * 0.03); bg.stroke();
  bg.lineWidth = 2.2;
  for (let k = 1; k <= 7; k++) {
    const y0 = 0.08 + k * 0.11;
    for (const d of [-1, 1]) {
      const w = halfW(Math.min(0.98, y0 + 0.12)) * 0.92;
      bg.beginPath(); bg.moveTo(W / 2, (1 - y0) * H);
      bg.quadraticCurveTo((0.5 + d * w * 0.55) * W, (1 - y0 - 0.05) * H, (0.5 + d * w) * W, (1 - y0 - 0.13) * H);
      bg.stroke();
    }
  }
  return { map: tex(cv), bump: tex(bv, false), halfW };
}

/* Sepal: long, narrow, tapering to a thread; green outside, pale and woolly inside. */
export function sepalTexture() {
  const W = 128, H = 512;
  const [cv, g] = canvas(W * 2, H);
  seed = 9;
  for (const side of [0, 1]) {
    const ox = side * W;
    const grd = g.createLinearGradient(0, H, 0, 0);
    if (side === 0) {          // inner face: felted, grey-green
      grd.addColorStop(0, '#7d8a5e'); grd.addColorStop(0.6, '#93a07a'); grd.addColorStop(1, '#6f7d4a');
    } else {                   // outer face: green, a little glandular
      grd.addColorStop(0, '#3f5a24'); grd.addColorStop(0.7, '#4c6a2a'); grd.addColorStop(1, '#5a4a28');
    }
    g.fillStyle = grd;
    g.fillRect(ox, 0, W, H);
    for (let k = 0; k < (side ? 160 : 700); k++) {
      g.fillStyle = side ? `rgba(90,40,20,${0.1 + rnd() * 0.15})` : `rgba(235,240,220,${0.05 + rnd() * 0.08})`;
      g.beginPath(); g.arc(ox + rnd() * W, rnd() * H, side ? 0.8 + rnd() : 1 + rnd() * 2.5, 0, 7); g.fill();
    }
    g.strokeStyle = side ? 'rgba(30,45,15,0.5)' : 'rgba(80,95,60,0.4)';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(ox + W / 2, H); g.lineTo(ox + W / 2, 0); g.stroke();
  }
  return tex(cv);
}

/* Stem skin: green, faintly striate, with a bloom of red towards the top in some varieties. */
export function stemTexture() {
  const W = 64, H = 512;
  const [cv, g] = canvas(W, H);
  seed = 13;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);
  for (let k = 0; k < 120; k++) {
    g.fillStyle = `rgba(0,0,0,${0.02 + rnd() * 0.05})`;
    g.fillRect(rnd() * W, 0, 0.6 + rnd() * 1.4, H);
  }
  for (let k = 0; k < 400; k++) {
    g.fillStyle = `rgba(255,255,240,${0.04 + rnd() * 0.06})`;
    g.fillRect(rnd() * W, rnd() * H, 1, 2 + rnd() * 6);
  }
  const t = tex(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
