/* The living room. Everything is built in code except the floorboards (a Poly Haven scan).
   Coordinates: metres, floor at y = 0, room centred on the origin.
   Back wall (built-ins and TV) at z = -depth/2, couch against the front wall at z = +depth/2,
   windows in the left and right walls. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const ASSETS = new URL('./assets/', import.meta.url);
const loader = new THREE.TextureLoader();
let floorMaps = null;
function floorTextures(renderer) {
  if (floorMaps) return floorMaps;
  const load = (name, srgb) => {
    const t = loader.load(new URL(name, ASSETS).href);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  floorMaps = {
    map: load('wood_floor_diff_2k.jpg', true),
    normalMap: load('wood_floor_nor_gl_2k.jpg'),
    roughnessMap: load('wood_floor_rough_1k.jpg'),
  };
  return floorMaps;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/* A few materials, made once per build */
function materials(p) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    wall: std({ color: p.wallColor, roughness: 0.93 }),
    ceiling: std({ color: '#f4f2ee', roughness: 0.95 }),
    trim: std({ color: '#f6f4ef', roughness: 0.55 }),
    cabinet: std({ color: p.cabinetColor, roughness: 0.48 }),
    counter: std({ color: '#c9c4bb', roughness: 0.32, metalness: 0 }),
    walnut: std({ color: '#6b4a32', roughness: 0.45 }),
    oak: std({ color: '#a77c52', roughness: 0.55 }),
    fabric: new THREE.MeshPhysicalMaterial({ color: p.couchColor, roughness: 0.92, sheen: 1, sheenRoughness: 0.7, sheenColor: new THREE.Color(p.couchColor).lerp(new THREE.Color('#ffffff'), 0.35) }),
    cushion: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(p.couchColor).offsetHSL(0, -0.04, 0.04), roughness: 0.9, sheen: 1, sheenRoughness: 0.6, sheenColor: '#ffffff' }),
    brass: std({ color: '#c49a52', roughness: 0.32, metalness: 1 }),
    black: std({ color: '#121314', roughness: 0.35, metalness: 0.2 }),
    ceramic: std({ color: '#d8d2c6', roughness: 0.28 }),
    ceramicDark: std({ color: '#33413d', roughness: 0.3 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.02, metalness: 0, transparent: true, opacity: 0.07, depthWrite: false, envMapIntensity: 1.4 }),
    leaf: std({ color: '#3f6b3a', roughness: 0.6, side: THREE.DoubleSide }),
    soil: std({ color: '#2b2119', roughness: 1 }),
    linen: std({ color: '#f3efe6', roughness: 0.9, side: THREE.DoubleSide, transparent: true, opacity: 0.86 }),
  };
}

export function buildRoom(renderer, p) {
  const W = p.width, D = p.depth, H = p.ceiling;
  const group = new THREE.Group();
  group.name = 'room';
  const colliders = [];
  const placeables = [];
  const m = materials(p);
  const rand = rng(7);
  const disposables = Object.values(m);

  const add = (geo, mat, x, y, z, { cast = true, receive = true, parent = group } = {}) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = cast; mesh.receiveShadow = receive;
    parent.add(mesh);
    disposables.push(geo);
    return mesh;
  };
  const box = (w, h, d, mat, x, y, z, opts) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, opts);
  const rbox = (w, h, d, r, mat, x, y, z, opts) => add(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2) * 0.999), mat, x, y, z, opts);
  const collide = (x, y, z, w, h, d, mat) => colliders.push({ pos: [x, y, z], half: [w / 2, h / 2, d / 2], mat });
  const placeable = (mesh, mat) => { mesh.userData.placeable = mat; placeables.push(mesh); return mesh; };

  /* ---------- floor ---------- */
  const maps = floorTextures(renderer);
  const rep = new THREE.Vector2(W / 1.7 / p.floorScale, D / 1.7 / p.floorScale);
  const floorMat = new THREE.MeshStandardMaterial({
    map: maps.map, normalMap: maps.normalMap, roughnessMap: maps.roughnessMap,
    roughness: 1, normalScale: new THREE.Vector2(0.6, 0.6),
  });
  // each map gets its own repeat without cloning the texture
  for (const k of ['map', 'normalMap', 'roughnessMap']) { maps[k].repeat.copy(rep); }
  disposables.push(floorMat);
  const floor = add(new THREE.PlaneGeometry(W, D), floorMat, 0, 0, 0, { cast: false });
  floor.rotation.x = -Math.PI / 2;
  placeable(floor, 'floor');
  collide(0, -0.1, 0, W + 1, 0.2, D + 1, 'floor');

  /* ---------- walls with window openings ---------- */
  const T = 0.14;   // wall thickness, all outside the room
  const winW = p.windowWidth, winH = p.windowHeight, sill = p.sill;
  const winTop = Math.min(sill + winH, H - 0.18);
  const sideWindows = [-D * 0.2, D * 0.2];

  function wall(axis, sign, length, openings) {
    // a wall runs along `axis`; interior face at sign * half-size of the other axis
    const pieces = [];
    const sorted = [...openings].sort((a, b) => a.c - b.c);
    let at = -length / 2;
    for (const o of sorted) {
      const a = o.c - o.w / 2, b = o.c + o.w / 2;
      pieces.push([at, a, 0, H]);
      pieces.push([a, b, 0, o.y0]);
      pieces.push([a, b, o.y1, H]);
      at = b;
    }
    pieces.push([at, length / 2, 0, H]);
    for (const [a, b, y0, y1] of pieces) {
      if (b - a < 1e-4 || y1 - y0 < 1e-4) continue;
      const c = (a + b) / 2, len = b - a, h = y1 - y0;
      if (axis === 'z') {
        const x = sign * (W / 2 + T / 2);
        box(T, h, len, m.wall, x, y0 + h / 2, c);
      } else {
        const z = sign * (D / 2 + T / 2);
        box(len, h, T, m.wall, c, y0 + h / 2, z);
      }
    }
    if (axis === 'z') collide(sign * (W / 2 + 0.25), H / 2, 0, 0.5, H, D + 1, 'wall');
    else collide(0, H / 2, sign * (D / 2 + 0.25), W + 1, H, 0.5, 'wall');
  }
  const opens = sideWindows.map(c => ({ c, w: winW, y0: sill, y1: winTop }));
  wall('z', -1, D + 2 * T, opens);
  wall('z', 1, D + 2 * T, opens);
  wall('x', -1, W, []);
  wall('x', 1, W, []);

  // ceiling
  const ceil = add(new THREE.PlaneGeometry(W + 0.3, D + 0.3), m.ceiling, 0, H, 0, { cast: true });
  ceil.rotation.x = Math.PI / 2;
  // a lid above the ceiling so the sun only gets in through the windows
  box(W + 2, 0.1, D + 2, m.ceiling, 0, H + 0.06, 0, { receive: false });

  // baseboards and crown
  const base = 0.1, bt = 0.014;
  box(W, base, bt, m.trim, 0, base / 2, -D / 2 + bt / 2);
  box(W, base, bt, m.trim, 0, base / 2, D / 2 - bt / 2);
  box(bt, base, D, m.trim, -W / 2 + bt / 2, base / 2, 0);
  box(bt, base, D, m.trim, W / 2 - bt / 2, base / 2, 0);
  const cr = 0.06;
  box(W, cr, 0.03, m.trim, 0, H - cr / 2, -D / 2 + 0.015, { cast: false });
  box(W, cr, 0.03, m.trim, 0, H - cr / 2, D / 2 - 0.015, { cast: false });
  box(0.03, cr, D, m.trim, -W / 2 + 0.015, H - cr / 2, 0, { cast: false });
  box(0.03, cr, D, m.trim, W / 2 - 0.015, H - cr / 2, 0, { cast: false });

  /* ---------- windows ---------- */
  for (const sx of [-1, 1]) for (const zc of sideWindows) {
    const x = sx * W / 2, fh = winTop - sill, fw = 0.05, depth = T + 0.02;
    const xIn = x + sx * depth / 2 - sx * 0.01;
    // frame
    box(depth, fw, winW, m.trim, xIn, sill + fw / 2, zc);
    box(depth, fw, winW, m.trim, xIn, winTop - fw / 2, zc);
    box(depth, fh, fw, m.trim, xIn, sill + fh / 2, zc - winW / 2 + fw / 2);
    box(depth, fh, fw, m.trim, xIn, sill + fh / 2, zc + winW / 2 - fw / 2);
    // mullions: one upright, two rails
    box(0.04, fh, 0.03, m.trim, x + sx * T * 0.55, sill + fh / 2, zc);
    for (const f of [0.38, 0.69]) box(0.04, 0.03, winW, m.trim, x + sx * T * 0.55, sill + fh * f, zc);
    // glass
    const g = add(new THREE.PlaneGeometry(winW - 2 * fw, fh - 2 * fw), m.glass, x + sx * T * 0.6, sill + fh / 2, zc, { cast: false, receive: false });
    g.rotation.y = Math.PI / 2;
    // sill board
    box(0.07, 0.03, winW + 0.1, m.trim, x - sx * 0.035, sill - 0.015, zc);
    // apron under the sill
    box(0.018, 0.08, winW, m.trim, x - sx * 0.009, sill - 0.07, zc);
    // sheer curtains gathered at each side
    for (const side of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(0.28, winTop - 0.02, 12, 1);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 44) * 0.025);
      geo.computeVertexNormals();
      const c = add(geo, m.linen, x - sx * 0.07, (winTop + 0.02) / 2 + 0.01, zc + side * (winW / 2 + 0.12), { cast: true, receive: true });
      c.rotation.y = Math.PI / 2;
    }
    // curtain rod
    const rod = add(new THREE.CylinderGeometry(0.009, 0.009, winW + 0.7, 10), m.brass, x - sx * 0.09, winTop + 0.07, zc);
    rod.rotation.x = Math.PI / 2;
  }

  /* ---------- built-ins along the back wall ---------- */
  const cd = p.cabinetDepth, ch = p.cabinetHeight;
  const zBack = -D / 2;
  const runW = W - 0.3;
  const kick = 0.08;
  box(runW - 0.04, kick, cd - 0.05, m.black, 0, kick / 2, zBack + (cd - 0.05) / 2, { cast: false });
  box(runW, ch - kick - 0.035, cd, m.cabinet, 0, kick + (ch - kick - 0.035) / 2, zBack + cd / 2);
  const counter = rbox(runW + 0.02, 0.035, cd + 0.025, 0.006, m.counter, 0, ch - 0.0175, zBack + (cd + 0.025) / 2);
  placeable(counter, 'stone');
  collide(0, ch / 2, zBack + cd / 2 + 0.0125, runW + 0.02, ch, cd + 0.025, 'stone');
  // doors
  const nDoors = Math.max(4, Math.round(runW / 0.6));
  const dw = runW / nDoors;
  for (let i = 0; i < nDoors; i++) {
    const cx = -runW / 2 + dw * (i + 0.5);
    const dh = ch - kick - 0.05;
    rbox(dw - 0.006, dh, 0.02, 0.003, m.cabinet, cx, kick + dh / 2 + 0.004, zBack + cd + 0.009);
    // shaker panel inset
    box(dw - 0.12, dh - 0.12, 0.004, m.cabinet, cx, kick + dh / 2 + 0.004, zBack + cd + 0.017, { cast: false });
    const kx = cx + (i % 2 ? -1 : 1) * (dw / 2 - 0.05);
    const knob = add(new THREE.CylinderGeometry(0.009, 0.009, 0.03, 12), m.brass, kx, kick + dh * 0.82, zBack + cd + 0.03);
    knob.rotation.x = Math.PI / 2;
  }
  // shelving towers either side of the TV
  const towerW = Math.min(0.95, runW * 0.22), towerD = 0.3, towerTop = H - 0.06;
  const shelfMat = m.cabinet;
  for (const sx of [-1, 1]) {
    const cx = sx * (runW / 2 - towerW / 2);
    const y0 = ch, th = towerTop - y0;
    box(towerW, th, 0.02, shelfMat, cx, y0 + th / 2, zBack + 0.01);
    box(0.025, th, towerD, shelfMat, cx - towerW / 2 + 0.0125, y0 + th / 2, zBack + towerD / 2);
    box(0.025, th, towerD, shelfMat, cx + towerW / 2 - 0.0125, y0 + th / 2, zBack + towerD / 2);
    box(towerW, 0.03, towerD, shelfMat, cx, towerTop - 0.015, zBack + towerD / 2);
    const shelves = 4;
    for (let s = 1; s <= shelves; s++) {
      const y = y0 + th * s / (shelves + 1);
      box(towerW - 0.05, 0.022, towerD - 0.01, shelfMat, cx, y, zBack + towerD / 2);
      dressShelf(cx, y + 0.011, towerW - 0.07, zBack + towerD * 0.5, th / (shelves + 1) - 0.06);
    }
    dressShelf(cx, y0, towerW - 0.07, zBack + towerD * 0.5, th / (shelves + 1) - 0.06);
  }
  function dressShelf(cx, y, w, z, hMax) {
    let x = cx - w / 2 + 0.02;
    const end = cx + w / 2 - 0.02;
    const kind = rand();
    if (kind < 0.25) {
      // a vase and a little stack
      const vh = Math.min(hMax, 0.16 + rand() * 0.1);
      const pts = [];
      for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(0.03 + 0.035 * Math.sin(Math.PI * (0.15 + 0.8 * t)), t * vh)); }
      add(new THREE.LatheGeometry(pts, 24), rand() < 0.5 ? m.ceramic : m.ceramicDark, cx + (rand() - 0.5) * w * 0.4, y, z);
      return;
    }
    const palette = ['#7b2f2a', '#2e4a62', '#d8c9a3', '#3b5b45', '#a46a2c', '#1f2226', '#8c8f93', '#c0533b', '#5a4a6b'];
    while (x < end - 0.02) {
      if (rand() < 0.12) { x += 0.06 + rand() * 0.1; continue; }
      const bw = 0.018 + rand() * 0.03, bh = Math.min(hMax, 0.15 + rand() * 0.09), bd = 0.13 + rand() * 0.07;
      if (x + bw > end) break;
      const mat = new THREE.MeshStandardMaterial({ color: palette[Math.floor(rand() * palette.length)], roughness: 0.7 + rand() * 0.2 });
      disposables.push(mat);
      const b = box(bw, bh, bd, mat, x + bw / 2, y + bh / 2, z);
      if (rand() < 0.1) { b.rotation.z = 0.25; b.position.x += 0.02; }
      x += bw + 0.002;
    }
  }

  // TV on the wall above the centre run
  const diag = p.tvSize * 0.0254;
  const tvW = diag * 16 / Math.hypot(16, 9), tvH = diag * 9 / Math.hypot(16, 9);
  const tvY = ch + 0.28 + tvH / 2;
  rbox(tvW + 0.012, tvH + 0.012, 0.028, 0.004, m.black, 0, tvY, zBack + 0.045);
  const screenTex = new THREE.CanvasTexture(screenCanvas());
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const screenMat = new THREE.MeshStandardMaterial({ color: '#050607', roughness: 0.12, metalness: 0.1, emissive: '#ffffff', emissiveMap: screenTex, emissiveIntensity: 0.38 });
  disposables.push(screenMat, screenTex);
  add(new THREE.PlaneGeometry(tvW, tvH), screenMat, 0, tvY, zBack + 0.0595, { cast: false });
  // soundbar on the counter
  rbox(Math.min(1.0, tvW * 0.7), 0.06, 0.09, 0.02, m.black, 0, ch + 0.03, zBack + 0.09);
  collide(0, ch + 0.03, zBack + 0.09, Math.min(1.0, tvW * 0.7), 0.06, 0.09, 'wood');

  /* ---------- couch ---------- */
  const cl = p.couchLength, cdp = 0.95, seatH = 0.43, backH = 0.84, armW = 0.17, armH = 0.62;
  const czBack = D / 2 - p.couchZ;
  const cz = czBack - cdp / 2, cx0 = p.couchX;
  const couch = new THREE.Group();
  couch.position.set(cx0, 0, cz);
  group.add(couch);
  const on = { parent: couch };
  // legs
  for (const lx of [-1, 1]) for (const lz of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.018, 0.012, 0.09, 10), m.walnut, lx * (cl / 2 - 0.08), 0.045, lz * (cdp / 2 - 0.08), on);
  }
  rbox(cl, 0.2, cdp, 0.04, m.fabric, 0, 0.09 + 0.1, 0, on);                     // base
  rbox(cl - 2 * armW + 0.02, backH - 0.2, 0.2, 0.06, m.fabric, 0, 0.29 + (backH - 0.29) / 2, cdp / 2 - 0.1, on);  // back frame
  for (const sx of [-1, 1]) rbox(armW, armH - 0.09, cdp, 0.06, m.fabric, sx * (cl / 2 - armW / 2), 0.09 + (armH - 0.09) / 2, 0, on);
  const seats = Math.round((cl - 2 * armW) / 0.62);
  const sw = (cl - 2 * armW) / seats;
  for (let i = 0; i < seats; i++) {
    const sx = -cl / 2 + armW + sw * (i + 0.5);
    rbox(sw - 0.01, 0.15, cdp - 0.24, 0.06, m.cushion, sx, 0.29 + 0.075, -0.08 + 0.04, on);
    const back = rbox(sw - 0.02, 0.42, 0.17, 0.07, m.cushion, sx, seatH + 0.22, cdp / 2 - 0.27, on);
    back.rotation.x = -0.12;
  }
  // a throw pillow
  const pillowMat = new THREE.MeshPhysicalMaterial({ color: '#c9a76a', roughness: 0.85, sheen: 1, sheenColor: '#fff' });
  disposables.push(pillowMat);
  const pillow = rbox(0.42, 0.4, 0.13, 0.06, pillowMat, -cl / 2 + armW + 0.25, seatH + 0.2, cdp / 2 - 0.4, on);
  pillow.rotation.set(-0.25, 0.3, 0.12);
  collide(cx0, 0.15, cz, cl, 0.3, cdp, 'fabric');
  collide(cx0, 0.29 + 0.075, cz - 0.04, cl - 2 * armW, 0.15, cdp - 0.24, 'fabric');
  collide(cx0, backH / 2, cz + cdp / 2 - 0.12, cl, backH, 0.24, 'fabric');
  for (const sx of [-1, 1]) collide(cx0 + sx * (cl / 2 - armW / 2), armH / 2, cz, armW, armH, cdp, 'fabric');

  /* ---------- coffee table ---------- */
  const tl = p.tableLength, td = 0.62, tH = p.tableHeight, top = 0.04;
  const tz = cz - cdp / 2 - p.tableGap - td / 2;
  const tableTop = rbox(tl, top, td, 0.012, m.walnut, cx0, tH - top / 2, tz);
  placeable(tableTop, 'wood');
  collide(cx0, tH - top / 2, tz, tl, top, td, 'wood');
  // lower shelf and legs
  box(tl - 0.12, 0.022, td - 0.12, m.walnut, cx0, 0.12, tz);
  collide(cx0, 0.12, tz, tl - 0.12, 0.022, td - 0.12, 'wood');
  for (const lx of [-1, 1]) for (const lz of [-1, 1]) {
    const lxp = cx0 + lx * (tl / 2 - 0.05), lzp = tz + lz * (td / 2 - 0.05);
    add(new THREE.CylinderGeometry(0.022, 0.016, tH - top, 12), m.walnut, lxp, (tH - top) / 2, lzp);
    collide(lxp, (tH - top) / 2, lzp, 0.04, tH - top, 0.04, 'wood');
  }

  /* ---------- side tables and lamps ---------- */
  const lamps = [];
  const shadeMats = [];
  const stS = 0.5, stH = 0.56;
  for (const sx of [-1, 1]) {
    const x = cx0 + sx * (cl / 2 + 0.06 + stS / 2), z = cz + 0.05;
    const st = rbox(stS, 0.03, stS, 0.006, m.oak, x, stH - 0.015, z);
    placeable(st, 'wood');
    collide(x, stH - 0.015, z, stS, 0.03, stS, 'wood');
    box(stS - 0.04, 0.02, stS - 0.04, m.oak, x, 0.18, z);
    for (const lx of [-1, 1]) for (const lz of [-1, 1]) {
      box(0.03, stH - 0.03, 0.03, m.oak, x + lx * (stS / 2 - 0.03), (stH - 0.03) / 2, z + lz * (stS / 2 - 0.03));
      collide(x + lx * (stS / 2 - 0.03), (stH - 0.03) / 2, z + lz * (stS / 2 - 0.03), 0.03, stH - 0.03, 0.03, 'wood');
    }
    // lamp at the back corner of the table, leaving the front for dominoes
    const lxp = x + sx * 0.08, lzp = z + 0.1;
    const pts = [];
    for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push(new THREE.Vector2(0.025 + 0.075 * Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.95)), t * 0.3)); }
    add(new THREE.LatheGeometry(pts, 28), sx < 0 ? m.ceramic : m.ceramicDark, lxp, stH, lzp);
    collide(lxp, stH + 0.15, lzp, 0.18, 0.3, 0.18, 'stone');
    add(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 8), m.brass, lxp, stH + 0.4, lzp);
    const shadeMat = new THREE.MeshStandardMaterial({ color: '#f1e7d6', roughness: 0.85, side: THREE.DoubleSide, emissive: new THREE.Color(p.lampColor || '#ffcf94'), emissiveIntensity: 0.6 });
    disposables.push(shadeMat);
    shadeMats.push(shadeMat);
    add(new THREE.CylinderGeometry(0.13, 0.19, 0.25, 32, 1, true), shadeMat, lxp, stH + 0.5, lzp, { cast: false });
    collide(lxp, stH + 0.5, lzp, 0.36, 0.25, 0.36, 'fabric');
    const bulb = new THREE.PointLight('#ffcf94', 1, 5, 2);
    bulb.position.set(lxp, stH + 0.46, lzp);
    group.add(bulb);
    lamps.push(bulb);
  }

  /* ---------- a plant in the far corner, art above the couch ---------- */
  {
    const px = -W / 2 + 0.38, pz = D / 2 - 0.4;
    const pts = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(0.15 + 0.04 * t, t * 0.38)); }
    pts.push(new THREE.Vector2(0.001, 0.38));
    add(new THREE.LatheGeometry(pts, 28), m.ceramicDark, px, 0, pz);
    add(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 24), m.soil, px, 0.36, pz);
    collide(px, 0.19, pz, 0.38, 0.38, 0.38, 'stone');
    const leafGeo = new THREE.SphereGeometry(1, 12, 8);
    leafGeo.scale(0.09, 0.008, 0.16);
    disposables.push(leafGeo);
    for (let i = 0; i < 34; i++) {
      const a = rand() * Math.PI * 2, h = 0.5 + rand() * 0.9, r = 0.05 + rand() * 0.26;
      const leaf = new THREE.Mesh(leafGeo, m.leaf);
      leaf.position.set(px + Math.cos(a) * r, h, pz + Math.sin(a) * r);
      leaf.rotation.set(-0.5 + rand() * 1.0, a, 0.3 + rand() * 0.6);
      leaf.castShadow = true;
      group.add(leaf);
    }
    const stem = add(new THREE.CylinderGeometry(0.012, 0.016, 1.3, 8), m.walnut, px, 0.95, pz);
    stem.rotation.z = 0.05;
  }
  {
    const aw = Math.min(1.3, cl * 0.55), ah = aw * 0.68;
    const artY = Math.min(H - 0.4 - ah / 2, 1.45);
    box(aw + 0.06, ah + 0.06, 0.03, m.walnut, cx0, artY, D / 2 - 0.015);
    const artTex = new THREE.CanvasTexture(artCanvas());
    artTex.colorSpace = THREE.SRGBColorSpace;
    const artMat = new THREE.MeshStandardMaterial({ map: artTex, roughness: 0.8 });
    disposables.push(artTex, artMat);
    const art = add(new THREE.PlaneGeometry(aw, ah), artMat, cx0, artY, D / 2 - 0.031, { cast: false });
    art.rotation.y = Math.PI;
  }

  /* ---------- lights ---------- */
  const sun = new THREE.DirectionalLight('#fff1dc', 5);
  sun.castShadow = true;
  const ext = Math.max(W, D) * 0.75;
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 0.5, far: 30 });
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.012;
  group.add(sun, sun.target);
  const fill = new THREE.HemisphereLight('#dfe8f5', '#a88a6a', 0.35);
  group.add(fill);

  // where to look first: the open floor between the coffee table and the built-ins
  const openFloor = new THREE.Vector3(cx0 * 0.5, 0, (zBack + cd + (tz - td / 2)) / 2);

  return {
    group, colliders, placeables, lamps, shadeMats, sun, fill, openFloor,
    bounds: { W, D, H },
    surfaces: { floor: 0, table: tH, counter: ch, side: stH },
    dispose() {
      group.traverse(o => { if (o.isLight && o.shadow?.map) o.shadow.map.dispose(); });
      for (const d of disposables) d.dispose?.();
    },
  };
}

export function updateRoomLights(room, p) {
  const az = THREE.MathUtils.degToRad(p.sunAzimuth), el = THREE.MathUtils.degToRad(p.sunElevation);
  const dir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  room.sun.position.copy(dir.multiplyScalar(12));
  room.sun.target.position.set(0, 0, 0);
  room.sun.intensity = p.sun;
  room.sun.color.set(p.sunColor);
  room.sun.shadow.radius = p.shadowSoftness;
  if (room.sun.shadow.mapSize.x !== p.shadowSize) {
    room.sun.shadow.mapSize.set(p.shadowSize, p.shadowSize);
    room.sun.shadow.map?.dispose();
    room.sun.shadow.map = null;
  }
  room.fill.intensity = p.fill;
  for (const l of room.lamps) { l.intensity = p.lamps; l.color.set(p.lampColor); }
  for (const s of room.shadeMats) { s.emissive.set(p.lampColor); s.emissiveIntensity = 0.15 + p.lamps * 0.35; }
}

function screenCanvas() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 288;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 288);
  grad.addColorStop(0, '#0d2233'); grad.addColorStop(0.55, '#2a4d5e'); grad.addColorStop(1, '#0c1418');
  g.fillStyle = grad; g.fillRect(0, 0, 512, 288);
  g.fillStyle = 'rgba(255, 214, 160, 0.55)';
  g.beginPath(); g.arc(360, 120, 26, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#0a1014';
  g.beginPath(); g.moveTo(0, 220);
  for (let x = 0; x <= 512; x += 16) g.lineTo(x, 200 - Math.sin(x * 0.013) * 26 - Math.sin(x * 0.041) * 9);
  g.lineTo(512, 288); g.lineTo(0, 288); g.fill();
  return c;
}

function artCanvas() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 350;
  const g = c.getContext('2d');
  g.fillStyle = '#efe6d6'; g.fillRect(0, 0, 512, 350);
  const blocks = [['#c4572f', 40, 60, 180, 130], ['#2f4f5f', 250, 40, 200, 90], ['#d9a441', 270, 160, 120, 140], ['#26302c', 60, 220, 150, 80]];
  for (const [col, x, y, w, h] of blocks) { g.fillStyle = col; g.fillRect(x, y, w, h); }
  g.strokeStyle = '#26302c'; g.lineWidth = 6;
  g.beginPath(); g.arc(200, 200, 70, Math.PI * 1.1, Math.PI * 1.95); g.stroke();
  return c;
}
