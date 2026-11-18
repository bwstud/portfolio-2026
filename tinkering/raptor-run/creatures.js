/* Raptor Run: what the sculptor models. Each function returns a part spec for sculpt.js: its
   extent in world px, its rounded forms (blobs), and how to surface them. The raptor is the
   classic film-era kind: scaly, unfeathered, a boxy skull, a heavy neck, a stiff tail. Only the
   forms are taken from the reference stills; the coats are this page's own. */

const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// materials, as numbered in sculpt.js
export const SKIN = 0, CLAW = 1, EYE = 2, TOOTH = 3, CLOTH = 4, FLESH = 5, HAIR = 6, LEATHER = 7, DARK = 8;

export const LENGTH = 300; // snout to tail tip, world px at K = 1
// the body's half width (world px) along its length
const PROFILE = [[0, 3.6], [3, 6.8], [8, 8.8], [18, 10.6], [30, 12.8], [38, 13.2], [46, 10.4], [56, 7.6], [70, 7.4], [84, 9.6], [98, 13.6], [114, 16.6], [130, 17.4], [146, 16.8], [162, 14.4], [178, 11.2], [196, 8.6], [220, 6.4], [246, 4.6], [270, 3.2], [288, 2.0], [300, 0.8]];
export function halfWidth(d) {
  for (let i = 1; i < PROFILE.length; i++) {
    if (d <= PROFILE[i][0]) {
      const [d0, w0] = PROFILE[i - 1], [d1, w1] = PROFILE[i];
      const t = (d - d0) / (d1 - d0);
      return lerp(w0, w1, t * t * (3 - 2 * t) * 0.55 + t * 0.45);
    }
  }
  return 0.9;
}
export const BODY_HALF = 16; // the body texture covers v in [-BODY_HALF*K..] beyond the widest point
export const BODY_EXTENT = 26; // half the body texture's height, world px

// classic coats: a dark back, paler flanks, black tiger stripes, a pale lip line
const rgb = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
export const COATS = [
  { name: 'tawny', dorsal: '#4a3420', flank: '#a3825a', stripe: '#1c130b', light: '#c8b08a', eye: '#d8941e', claw: '#2a2118' },
  { name: 'rust', dorsal: '#6a3418', flank: '#b26a38', stripe: '#220e06', light: '#d6a77a', eye: '#e6a62a', claw: '#25170e' },
  { name: 'slate', dorsal: '#22292d', flank: '#69757a', stripe: '#0e1012', light: '#a4a69e', eye: '#d48a24', claw: '#18191a' },
  { name: 'bone', dorsal: '#8a7a62', flank: '#cbbd9e', stripe: '#211a12', light: '#e2d8c0', eye: '#c98a2a', claw: '#2c2620' },
].map((c) => ({ ...c, rgb: ['dorsal', 'flank', 'stripe', 'light', 'eye', 'claw'].map((k) => rgb(c[k])) }));

// the surface height of the body at (d, v), so details can sit on it
const FLAT = 0.72;
const surf = (d, v) => { const w = halfWidth(d); return FLAT * Math.sqrt(Math.max(0, w * w - v * v)); };

export function raptorBody(coat, seed) {
  const blobs = [];
  // the trunk: a chain of tapering capsules along the spine, flattened to an ellipse
  for (let d = 0; d < LENGTH; d += 6) {
    const d1 = Math.min(LENGTH, d + 6);
    blobs.push({ a: [d, 0], b: [d1, 0], ra: halfWidth(d), rb: halfWidth(d1), flat: FLAT, k: 2.5 });
  }
  const on = (d, v, r, extra = 0.25) => surf(d, v) - r * 0.9 * (1 - extra);
  for (const s of [1, -1]) {
    // eyes, set into the side of the skull under a heavy brow
    const ev = s * (halfWidth(29) - 2.3);
    blobs.push({ a: [29.5, ev], ra: 2.15, mat: 2, flat: 0.85, z: on(28.5, ev, 2.15, 0.35), k: 0 });
    blobs.push({ a: [19, s * (halfWidth(19) - 3.4)], b: [33.5, s * (halfWidth(33) - 3.6)], ra: 1.4, rb: 1.8, flat: 0.9, z: on(26, s * (halfWidth(26) - 3.5), 1.8, 0.55), k: 1.6 });
    // jaw muscles bulging behind the eye, the nasal ridges down the snout
    blobs.push({ a: [33, s * (halfWidth(33) - 3.5)], b: [41, s * (halfWidth(41) - 3.2)], ra: 3.4, rb: 2.8, flat: 0.8, z: on(37, s * (halfWidth(37) - 3.4), 3.4, 0.3), k: 2.4 });
    blobs.push({ a: [3, s * 1.6], b: [20, s * 3.4], ra: 1.0, rb: 1.5, flat: 0.8, z: on(12, s * 2.5, 1.4, 0.4), k: 1.3 });
    // a row of teeth just showing past the lip along each side of the jaw
    for (let d = 4.5; d < 25; d += 1.55) {
      const w = halfWidth(d);
      blobs.push({ a: [d, s * (w - 0.35)], b: [d + 0.35, s * (w + 0.55)], ra: 0.42, rb: 0.08, mat: 3, flat: 0.6, z: surf(d, w - 0.4) * 0.35 });
    }
    // shoulder blades and hips under the skin
    blobs.push({ a: [96, s * 5], b: [112, s * 7], ra: 5.5, rb: 4.5, flat: 0.55, z: on(100, s * 8, 6.5, 0.12), k: 4 });
    blobs.push({ a: [130, s * 7], b: [152, s * 8.5], ra: 7, rb: 6, flat: 0.55, z: on(140, s * 10, 8, 0.12), k: 4 });
  }
  // the spine: a low ridge from the neck down the tail
  blobs.push({ a: [44, 0], b: [292, 0], ra: 1.3, rb: 0.6, flat: 0.9, z: surf(120, 0) - 1.0, k: 1.2 });
  return {
    len: LENGTH, half: BODY_EXTENT, res: 2560 / LENGTH, blobs, pattern: 0, coat: coat.rgb, scale: 1.55, seed, hw: halfWidth,
  };
}

// the thigh: a heavy muscle from hip (u = 0) to knee
export function raptorThigh(coat, seed) {
  return {
    len: 42, half: 15, res: 12, pattern: 1, coat: coat.rgb, scale: 1.3, seed,
    blobs: [
      { a: [3, 0], b: [34, 0.5], ra: 12.5, rb: 6.5, flat: 0.7, k: 3 },
      { a: [8, 3], b: [26, 4], ra: 8, rb: 5, flat: 0.7, z: 2, k: 3 },
      { a: [34, 0.5], ra: 6.2, flat: 0.8, z: 1, k: 2.5 },
    ],
  };
}
// the metatarsus: slim, scaly, plated on the front
export function raptorShin(coat, seed) {
  return {
    len: 31, half: 6, res: 14, pattern: 1, coat: coat.rgb, scale: 1.1, seed,
    blobs: [{ a: [1, 0], b: [29, 0], ra: 4.4, rb: 3.2, flat: 0.9, detail: 1, k: 2 }],
  };
}
// the foot: three toes forward with scutes and claws, the sickle claw on toe II held up and back.
// v > 0 is the outer side (toe IV), v < 0 the inner side.
export function raptorFoot(coat, seed) {
  const blobs = [{ a: [2, 0], ra: 4.2, flat: 0.75, k: 2 }];
  const toe = (pts, r0, r1, claw) => {
    for (let i = 0; i < pts.length - 1; i++) blobs.push({ a: pts[i], b: pts[i + 1], ra: lerp(r0, r1, i / (pts.length - 1)), rb: lerp(r0, r1, (i + 1) / (pts.length - 1)), flat: 0.8, detail: 1, k: 1.6 });
    const e = pts[pts.length - 1];
    for (let i = 0; i < claw.length; i++) {
      const a = i === 0 ? e : claw[i - 1];
      blobs.push({ a, b: claw[i], ra: lerp(r1 * 0.85, 0.25, i / claw.length), rb: lerp(r1 * 0.85, 0.25, (i + 1) / claw.length), mat: 1, flat: 0.9, z: 0.6 });
    }
  };
  toe([[2, 0.5], [10, 0.6], [18, 0.4], [25, 0]], 2.9, 2.0, [[28, 0.2], [30.5, 0.9]]);          // III
  toe([[2, 1.5], [8, 3.8], [14, 6.0], [19.5, 7.6]], 2.6, 1.8, [[22, 8.6], [24, 9.8]]);           // IV
  toe([[2, -1.2], [6, -3.6], [9, -5.4]], 2.6, 2.2, [[11.5, -7.6], [11.6, -10.2], [9.6, -12.2], [6.6, -12.8]]); // II with the sickle
  return { len: 34, half: 14, res: 14, pattern: 1, coat: coat.rgb, scale: 1.0, seed, blobs };
}
// the arm: held folded forward under the chest; three fingers with hooked claws
export function raptorArm(coat, seed) {
  const blobs = [
    { a: [0, 0], b: [13, 1], ra: 4.0, rb: 2.9, flat: 0.75, k: 2 },
    { a: [13, 1], b: [24, 0], ra: 2.9, rb: 2.2, flat: 0.75, k: 1.8 },
    { a: [25, 0], ra: 2.5, flat: 0.7, k: 1.5 },
  ];
  for (const [dx, dy] of [[5, -2.4], [6.5, 0], [4.5, 2.4]]) {
    const tip = [25 + dx, dy];
    blobs.push({ a: [25, dy * 0.3], b: tip, ra: 1.15, rb: 0.85, flat: 0.8, k: 1 });
    blobs.push({ a: tip, b: [tip[0] + 2.2, tip[1] + dy * 0.25 + 0.6], ra: 0.85, rb: 0.5, mat: 1, z: 0.2 });
    blobs.push({ a: [tip[0] + 2.2, tip[1] + dy * 0.25 + 0.6], b: [tip[0] + 3.2, tip[1] + dy * 0.25 + 2.0], ra: 0.5, rb: 0.15, mat: 1, z: 0.2 });
  }
  return { len: 38, half: 8, res: 14, pattern: 1, coat: coat.rgb, scale: 0.95, seed, blobs };
}

/* ---------- people ---------- */
export const SKIN_TONES = ['#f1d3bd', '#e5b897', '#d39d76', '#b77c55', '#8f5c3e', '#6b432b', '#4a2d1d'];
export const HAIR_TONES = ['#17120e', '#352519', '#573a22', '#83552b', '#b4864a', '#d8be88', '#9a9a9a', '#e6e2d8', '#9e3f27'];

// the palette slots every person uses
const SLOT = { top: 0, top2: 1, coat: 2, legs: 3, shoes: 4, skin: 5, hair: 6, hat: 7, pack: 8, strap: 9, dress: 10, case: 11, vest: 12, dark: 13 };
function palette(p) {
  const pal = new Array(16).fill([0.5, 0.5, 0.5, 0]);
  const set = (k, hex, pat = 0) => { if (hex) pal[SLOT[k]] = [...rgb(hex), pat]; };
  set('top', p.top, p.pattern ? 1 : 0);
  pal[SLOT.top2] = [...rgb(p.pattern2 || '#f4ecd8'), 0];
  set('coat', p.coat || p.top); set('legs', p.legs || p.skin); set('shoes', p.shoes); set('skin', p.skin); set('hair', p.hair);
  set('hat', p.hatCol || '#888888'); set('pack', p.backpack || '#444444'); set('strap', p.straps || '#333333'); set('dress', p.dress || p.top);
  set('case', p.briefcase || '#5a3a22'); set('vest', p.vest || '#d4ee2c', 2);
  pal[SLOT.dark] = [0.06, 0.05, 0.05, 0];
  return pal;
}

export function personParts(p, seed) {
  const W = p.W, pal = palette(p);
  const out = {};
  const base = { res: 10, pattern: 2, palette: pal, seed };
  const topSlot = p.vest ? SLOT.vest : p.coat ? SLOT.coat : SLOT.top;
  // shoulders and back, front at u = 0
  {
    const len = W * 0.56, half = W * 0.6;
    const blobs = [
      { a: [len * 0.42, -W * 0.36], b: [len * 0.42, W * 0.36], ra: W * 0.2, mat: 4, col: topSlot, flat: 0.75, k: W * 0.08 },
      { a: [len * 0.38, 0], b: [len * 0.74, 0], ra: W * 0.27, rb: W * 0.24, mat: 4, col: topSlot, flat: 0.62, k: W * 0.1 },
      { a: [len * 0.3, 0], ra: W * 0.1, mat: 5, col: SLOT.skin, flat: 0.8, z: W * 0.12 },
    ];
    if (p.straps) for (const s of [1, -1]) blobs.push({ a: [len * 0.12, s * W * 0.22], b: [len * 0.82, s * W * 0.2], ra: W * 0.045, mat: 4, col: SLOT.strap, flat: 0.6, z: W * 0.15 });
    out.torso = { ...base, len, half, blobs };
  }
  // the head from above: face toward u = 0, hair from the crown, ears, maybe a hat
  {
    const R0 = W * 0.2, len = R0 * 4.2, half = R0 * 2.1, cx = R0 * 2.1;
    const blobs = [
      { a: [cx, 0], ra: R0, mat: 5, col: SLOT.skin, flat: 1 },
      { a: [cx - R0 * 0.92, 0], ra: R0 * 0.2, mat: 5, col: SLOT.skin, flat: 1, z: R0 * 0.25 },
    ];
    for (const s of [1, -1]) blobs.push({ a: [cx + R0 * 0.02, s * R0 * 0.98], b: [cx + R0 * 0.2, s * R0 * 1.0], ra: R0 * 0.2, mat: 5, col: SLOT.skin, flat: 0.6, z: R0 * 0.2 });
    const style = p.hairStyle;
    if (style !== 'bald') {
      // hair is modelled as strands of the form: a cap running crown to forehead, swept back
      const back = style === 'long' || style === 'ponytail' || style === 'bun';
      for (let i = -3; i <= 3; i++) {
        const y = (i / 3) * R0 * 0.8;
        blobs.push({ a: [cx + R0 * 0.85, y * 0.6], b: [cx - R0 * 0.55, y * 1.05], ra: R0 * 0.42, rb: R0 * 0.3, mat: 6, col: SLOT.hair, flat: 0.5, z: R0 * 0.62, k: R0 * 0.25 });
      }
      blobs.push({ a: [cx + R0 * 0.25, 0], ra: R0 * 1.02, mat: 6, col: SLOT.hair, flat: 0.98, z: R0 * 0.02, k: R0 * 0.2 });
      if (style === 'curly') blobs.push({ a: [cx + R0 * 0.15, 0], ra: R0 * 1.16, mat: 6, col: SLOT.hair, flat: 0.9, z: R0 * 0.08, k: R0 * 0.3 });
      if (back) blobs.push({ a: [cx + R0 * 0.8, 0], b: [cx + R0 * (style === 'long' ? 1.55 : 1.4), 0], ra: R0 * (style === 'long' ? 0.9 : 0.36), rb: R0 * (style === 'long' ? 0.85 : 0.26), mat: 6, col: SLOT.hair, flat: 0.5, z: R0 * 0.1, k: R0 * 0.2 });
      if (style === 'bun') blobs.push({ a: [cx + R0 * 0.85, 0], ra: R0 * 0.45, mat: 6, col: SLOT.hair, flat: 1, z: R0 * 0.5 });
    }
    const hc = SLOT.hat;
    if (p.hat === 'cap') {
      blobs.push({ a: [cx + R0 * 0.08, 0], ra: R0 * 1.06, mat: 4, col: hc, flat: 0.85, z: R0 * 0.25, k: R0 * 0.1 });
      blobs.push({ a: [cx - R0 * 0.75, 0], b: [cx - R0 * 1.35, 0], ra: R0 * 0.78, rb: R0 * 0.65, mat: 4, col: hc, flat: 0.12, z: R0 * 0.95 });
    } else if (p.hat === 'hard') {
      blobs.push({ a: [cx, 0], ra: R0 * 1.3, mat: 7, col: hc, flat: 0.1, z: R0 * 0.85 });
      blobs.push({ a: [cx + R0 * 0.05, 0], ra: R0 * 1.1, mat: 7, col: hc, flat: 0.9, z: R0 * 0.3, k: R0 * 0.2 });
      blobs.push({ a: [cx - R0 * 1.0, 0], b: [cx + R0 * 1.0, 0], ra: R0 * 0.16, mat: 7, col: hc, flat: 0.8, z: R0 * 1.25 });
    } else if (p.hat === 'safari' || p.hat === 'sun') {
      const br = p.hat === 'sun' ? 1.95 : 1.6;
      blobs.push({ a: [cx, 0], ra: R0 * br, mat: 4, col: hc, flat: 0.1, z: R0 * 0.85 });
      blobs.push({ a: [cx, 0], ra: R0 * 0.92, mat: 4, col: hc, flat: 0.75, z: R0 * 0.6, k: R0 * 0.25 });
    } else if (p.hat === 'toque') {
      blobs.push({ a: [cx + R0 * 0.1, 0], ra: R0 * 1.18, mat: 4, col: hc, flat: 1.1, z: R0 * 0.3 });
    } else if (p.hat === 'hood') {
      blobs.push({ a: [cx + R0 * 0.25, 0], ra: R0 * 1.22, mat: 4, col: hc, flat: 0.95, z: R0 * 0.1, k: R0 * 0.2 });
      blobs.push({ a: [cx - R0 * 0.62, 0], ra: R0 * 0.62, mat: 8, col: SLOT.dark, flat: 0.3, z: R0 * 0.55 });
      blobs.push({ a: [cx - R0 * 0.75, 0], ra: R0 * 0.42, mat: 5, col: SLOT.skin, flat: 0.5, z: R0 * 0.6 });
    }
    out.head = { ...base, len, half, blobs, centre: cx };
  }
  // an arm: sleeve, forearm, hand
  {
    const len = W * 0.74, half = W * 0.14;
    const sleeve = p.sleeves === 'long' ? 0.86 : p.sleeves === 'short' ? 0.38 : 0.0;
    const sl = p.coat ? SLOT.coat : SLOT.top;
    const blobs = [
      { a: [half * 0.9, 0], b: [len * 0.84, 0], ra: half * 0.72, rb: half * 0.6, mat: 5, col: SLOT.skin, flat: 0.85, k: half * 0.3 },
      { a: [len * 0.9, 0], ra: half * 0.82, mat: 5, col: SLOT.skin, flat: 0.75, k: half * 0.4 },
    ];
    if (sleeve > 0) blobs.push({ a: [half * 0.9, 0], b: [len * sleeve, 0], ra: half * 0.98, rb: half * 0.85, mat: 4, col: sl, flat: 0.85, z: half * 0.08, k: half * 0.2 });
    out.arm = { ...base, len, half, blobs };
  }
  // a leg: trousers or skin, then the shoe
  {
    const len = W * 0.88, half = W * 0.15;
    const blobs = [{ a: [half, 0], b: [len * 0.76, 0], ra: half * 0.78, rb: half * 0.62, mat: 5, col: SLOT.skin, flat: 0.85, k: half * 0.3 }];
    const cloth = p.dress ? 0 : p.shorts ? 0.42 : 0.78;
    if (cloth > 0) blobs.push({ a: [half * 0.9, 0], b: [len * cloth, 0], ra: half * 0.96, rb: half * 0.82, mat: 4, col: SLOT.legs, flat: 0.85, z: half * 0.06, k: half * 0.2 });
    blobs.push({ a: [len * 0.7, 0], b: [len * 0.97, 0], ra: half * 0.86, rb: half * 0.78, mat: 7, col: SLOT.shoes, flat: 0.75, z: half * 0.1, k: half * 0.25 });
    out.leg = { ...base, len, half, blobs };
  }
  if (p.dress || p.coat) {
    const len = W * (p.dress ? 0.62 : 0.5), half = W * 0.62;
    const blobs = [];
    for (let i = -3; i <= 3; i++) blobs.push({ a: [W * 0.06, (i / 3) * W * 0.26], b: [len * 0.92, (i / 3) * half * 0.86], ra: W * 0.16, rb: W * 0.13, mat: 4, col: p.dress ? SLOT.dress : SLOT.coat, flat: 0.35, k: W * 0.08 });
    out.skirt = { ...base, len, half, blobs };
  }
  if (p.backpack) {
    const len = W * (p.bigPack ? 0.52 : 0.38), half = W * (p.bigPack ? 0.32 : 0.27);
    out.pack = { ...base, len, half, blobs: [
      { a: [len * 0.5, -half * 0.45], b: [len * 0.5, half * 0.45], ra: len * 0.46, mat: 4, col: SLOT.pack, flat: 0.6, k: len * 0.1 },
      { a: [len * 0.75, -half * 0.3], b: [len * 0.75, half * 0.3], ra: len * 0.2, mat: 4, col: SLOT.pack, flat: 0.5, z: len * 0.22, k: len * 0.06 },
    ] };
  }
  if (p.briefcase) {
    const len = W * 0.46, half = W * 0.08;
    out.case = { ...base, len, half, blobs: [{ a: [half, 0], b: [len - half, 0], ra: half * 0.95, mat: 7, col: SLOT.case, flat: 0.9 }] };
  }
  return out;
}

void sstep;
