/* Leaf cards, painted procedurally. Each texture is a grey value with alpha: the per-leaf colour
   from the model tints it, and the grey carries veins, margins and the slight sheen of a blade.
   Cards are drawn with the stalk at the bottom centre, which is where they attach to the twig. */

import * as THREE from 'three';

const S = 256;
let seed = 1;
const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function canvas() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  return [cv, cv.getContext('2d')];
}

function finish(cv) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  return t;
}

/* Japanese maple: seven slender lobes, cut deep, with toothed edges, radiating from the stalk. */
function palmate() {
  seed = 7;
  const [cv, ctx] = canvas();
  const C = [S / 2, S * 0.6];
  const lobes = [[0, 1], [34, 0.93], [-34, 0.93], [68, 0.8], [-68, 0.8], [108, 0.5], [-108, 0.5]];
  const L = S * 0.5;
  ctx.fillStyle = 'rgb(205,205,205)';
  for (const [deg, k] of lobes) {
    const a = (deg - 90) * Math.PI / 180, l = L * k;
    const dx = Math.cos(a), dy = Math.sin(a), px = -dy, py = dx;
    ctx.beginPath();
    ctx.moveTo(C[0], C[1]);
    const pts = [];
    for (let side of [1, -1]) {
      const edge = [];
      for (let i = 1; i <= 26; i++) {
        const t = i / 26;
        let w = l * 0.19 * Math.pow(Math.sin(Math.PI * Math.min(0.98, t * 0.9 + 0.04)), 0.85) * (1 - t * 0.35);
        const tooth = (i % 2 ? 1 : 0) * l * 0.025 * (1 - t * 0.3);
        w += tooth;
        edge.push([C[0] + dx * l * t + px * w * side, C[1] + dy * l * t + py * w * side]);
      }
      pts.push(side === 1 ? edge : edge.reverse());
    }
    for (const [x, y] of pts[0]) ctx.lineTo(x, y);
    ctx.lineTo(C[0] + dx * l * 1.02, C[1] + dy * l * 1.02);
    for (const [x, y] of pts[1]) ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();
  }
  // gentle darkening towards the margins, then veins
  ctx.globalCompositeOperation = 'source-atop';
  const g = ctx.createRadialGradient(C[0], C[1], 4, C[0], C[1], L);
  g.addColorStop(0, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  for (const [deg, k] of lobes) {
    const a = (deg - 90) * Math.PI / 180, l = L * k * 0.92;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(C[0], C[1]);
    ctx.lineTo(C[0] + Math.cos(a) * l, C[1] + Math.sin(a) * l);
    ctx.stroke();
    ctx.lineWidth = 0.8;
    for (let t = 0.2; t < 0.85; t += 0.13) for (const side of [1, -1]) {
      const bx = C[0] + Math.cos(a) * l * t, by = C[1] + Math.sin(a) * l * t;
      const b2 = a + side * 0.9;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(b2) * l * 0.13, by + Math.sin(b2) * l * 0.13);
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  // the stalk
  ctx.strokeStyle = 'rgb(170,150,140)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(S / 2, S - 2);
  ctx.quadraticCurveTo(S / 2 + 3, S * 0.8, C[0], C[1]);
  ctx.stroke();
  return finish(cv);
}

/* Chinese elm: small, ovate, glossy, with a crenate edge and straight parallel veins. */
function elm() {
  seed = 3;
  const [cv, ctx] = canvas();
  const base = S * 0.9, tip = S * 0.04, len = base - tip;
  ctx.fillStyle = 'rgb(200,200,200)';
  ctx.beginPath();
  const edge = side => {
    const out = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      let w = S * 0.27 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.9) * (side > 0 ? 1 : 0.92);
      w += (i % 2 ? 1 : -0.4) * S * 0.008 * Math.sin(Math.PI * t);
      out.push([S / 2 + side * w, base - len * t]);
    }
    return out;
  };
  const right = edge(1), left = edge(-1).reverse();
  ctx.moveTo(S / 2, base);
  for (const [x, y] of right) ctx.lineTo(x, y);
  for (const [x, y] of left) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'source-atop';
  const g = ctx.createLinearGradient(S * 0.2, 0, S * 0.8, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.18)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(S / 2, base); ctx.lineTo(S / 2, tip + 8); ctx.stroke();
  ctx.lineWidth = 0.9;
  for (let t = 0.1; t < 0.88; t += 0.085) for (const side of [1, -1]) {
    const y = base - len * t;
    ctx.beginPath();
    ctx.moveTo(S / 2, y);
    ctx.lineTo(S / 2 + side * S * 0.22 * Math.sin(Math.PI * Math.pow(t, 0.8)), y - len * 0.07);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgb(160,150,130)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(S / 2, S - 1); ctx.lineTo(S / 2, base); ctx.stroke();
  return finish(cv);
}

/* Juniper: a spray of tiny overlapping scales on branching cords. */
function spray() {
  seed = 5;
  const [cv, ctx] = canvas();
  const scale = (x, y, a, size) => {
    const v = 150 + r() * 90;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.beginPath();
    ctx.ellipse(x, y, size * 0.55, size, a, 0, Math.PI * 2);
    ctx.fill();
  };
  const cord = (x, y, a, len, size, depth) => {
    const steps = Math.max(3, Math.floor(len / (size * 0.9)));
    let px = x, py = y, pa = a;
    for (let i = 0; i < steps; i++) {
      pa += (r() - 0.5) * 0.12;
      px += Math.cos(pa) * size * 0.9; py += Math.sin(pa) * size * 0.9;
      const sz = size * (1 - (i / steps) * 0.45);
      scale(px, py, pa + Math.PI / 2, sz);
      if (depth > 0 && i > 1 && i % 3 === 0) {
        const side = (i / 3) % 2 ? 1 : -1;
        cord(px, py, pa + side * (0.75 + r() * 0.25), len * 0.42 * (1 - i / steps), size * 0.85, depth - 1);
      }
    }
  };
  ctx.globalAlpha = 1;
  cord(S / 2, S - 4, -Math.PI / 2, S * 0.92, 9, 3);
  cord(S / 2, S - 4, -Math.PI / 2 - 0.5, S * 0.6, 8, 2);
  cord(S / 2, S - 4, -Math.PI / 2 + 0.5, S * 0.6, 8, 2);
  return finish(cv);
}

const cache = {};
export function leafTexture(shape) {
  if (!cache[shape]) cache[shape] = shape === 'palmate' ? palmate() : shape === 'elm' ? elm() : spray();
  return cache[shape];
}

/* A unit card, stalk at the origin, blade up +y, slightly cupped along the midrib so it catches
   light like a real leaf rather than a sheet of paper. */
export function leafGeometry(shape) {
  const g = new THREE.PlaneGeometry(1, 1, 4, 4);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position;
  const cup = shape === 'spray' ? 0.05 : 0.16;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, cup * x * x * 4 * 0.25 - 0.12 * y * y * (shape === 'spray' ? 0.3 : 1));
  }
  g.computeVertexNormals();
  return g;
}
