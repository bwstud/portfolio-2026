import * as THREE from 'three';
import {
  Builder, revolve, loft, slab, strut, bell, bellInner, ogive, radiusAt, lattice, truss, around, paint,
  livery, verticalText, usFlag, canvasTexture, decalMaterial, mulberry, TAU, DEG,
} from './kit.js';

/* The five major pieces, modelled in metres from published dimensions.
   Each returns a Group standing on y = 0 with its "front" (flags, lettering, heat shield)
   facing +z. Sources and judgement calls are listed in the set definition (sets.js). */

const metres = { v0: 0, vSpan: 1 };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const std = o => new THREE.MeshStandardMaterial(o);

// engines: bell + dark throat, exit at `y`, pointing down
function engine(b, M, x, y, z, exitR, len, mat = M.engine) {
  b.add(bell(exitR, len), mat, { pos: V(x, y, z) });
  b.add(bellInner(exitR, len), M.throat, { pos: V(x, y, z) });
}

// a fin or flap: outline in (out, y), thickness t, standing radially at angle phi from r0
function radialSlab(b, mat, outline, t, phi, r0) {
  const g = slab(outline.map(([x, y]) => [x + r0, y]), t);
  b.add(g, mat, { rot: [0, phi - Math.PI / 2, 0] });
}

/* ================================================================
   KING · SpaceX Starship (Block 3 / V3) · 124.4 m
   Super Heavy 72.3 m + Ship 52.1 m, 9 m diameter, stainless steel,
   hexagonal black tiles on the windward side, 33 + 6 Raptor 3.
   ================================================================ */
export function starship(M) {
  const b = new Builder();
  const R = 4.5, BH = 72.3, TOP = 124.4, S = BH;

  // 304L stainless: barrel welds every 1.83 m, faint brushed streaks around
  const rnd = mulberry(11);
  const weldMap = canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = '#cfd1d4'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 220; i++) {
      g.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '90,96,104'},${0.03 + rnd() * 0.06})`;
      g.fillRect(rnd() * w, 0, 1 + rnd() * 6, h);
    }
    g.fillStyle = 'rgba(70,64,58,0.3)'; g.fillRect(0, 0, w, 2);        // circumferential weld
    g.fillStyle = 'rgba(160,140,110,0.15)'; g.fillRect(0, 2, w, 3);    // heat tint beside it
  }, { repeat: true });
  weldMap.repeat.set(3, 1 / 1.83);
  const steel = std({ color: 0xffffff, map: weldMap, metalness: 0.75, roughness: 0.36 });

  // ~18,000 hexagonal silica tiles (~0.3 m across) on the windward half
  const hexW = 0.31, hexH = hexW * Math.sqrt(3);
  const tileMap = canvasTexture(256, Math.round(256 * Math.sqrt(3)), (g, w, h) => {
    g.fillStyle = '#3a3b3d'; g.fillRect(0, 0, w, h);                  // gap / grout
    const s = w / 3 * 1.02;
    const hex = (cx, cy, shade) => {
      g.fillStyle = shade; g.beginPath();
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; g.lineTo(cx + Math.cos(a) * s * 0.94, cy + Math.sin(a) * s * 0.94); }
      g.fill();
    };
    const r2 = mulberry(5);
    // flat-topped hexes on a 3s × √3s lattice that tiles seamlessly
    for (let col = -1; col <= 2; col++) for (let row = -1; row <= 2; row++) {
      const cx = col * 1.5 * s, cy = row * h / 2 + (col % 2 ? h / 4 : -h / 4);
      const v = 18 + Math.floor(r2() * 10);
      hex(cx, cy, `rgb(${v},${v},${v + 2})`);
    }
  }, { repeat: true });
  tileMap.repeat.set(TAU * R / (hexW * 3), 1 / hexH);
  const tiles = std({ map: tileMap, roughness: 0.82, metalness: 0 });

  /* --- Super Heavy --- */
  b.add(revolve([[R - 0.12, 2.2], [R - 0.12, 0.6], [R, 0.6], [R, BH - 2.4]], { segments: 96, ...metres }), steel);
  b.add(revolve([[0, 2.2], [R - 0.12, 2.2]], { segments: 64 }), M.darkgray);         // aft (shielding removed on V3)
  // integrated hot-staging band: a ring of vents just under the ship
  const vents = canvasTexture(1024, 64, (g, w, h) => {
    g.fillStyle = '#cfd1d4'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#141414';
    for (let i = 0; i < 40; i++) g.fillRect((i + 0.18) * w / 40, h * 0.18, w / 40 * 0.64, h * 0.64);
  });
  b.add(revolve([[R, BH - 2.4], [R, BH]], { segments: 96 }), std({ map: vents, metalness: 0.9, roughness: 0.35 }));

  // 33 Raptor 3: 3 centre, 10 inner ring, 20 outer ring
  const raptor = (n, r, phi0) => { for (let i = 0; i < n; i++) { const p = around(r, phi0 + (i / n) * TAU); engine(b, M, p.x, 0, p.z, 0.64, 2.2); } };
  raptor(3, 0.86, 0); raptor(10, 2.32, 0.1); raptor(20, 3.72, 0.05);

  // three grid fins (Block 3: three larger fins, none on the leeward side), ~6 m below the top
  for (const phi of [0, Math.PI / 2, -Math.PI / 2]) {
    const fin = lattice(4.6, 3.4, 0.85, 7, 5, 0.18, 0.06);
    // lattice plane horizontal so the airflow passes through the cells
    b.add(fin, M.darkgray, { matrix: new THREE.Matrix4().makeRotationY(phi).multiply(
      new THREE.Matrix4().compose(V(0, BH - 6.6, R + 1.8), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.12, 0, 0)), V(1, 1, 1))) });
    b.add(new THREE.BoxGeometry(1.3, 1.6, 0.7), steel, { matrix: new THREE.Matrix4().makeRotationY(phi).multiply(
      new THREE.Matrix4().makeTranslation(0, BH - 6.4, R + 0.2)) });
  }
  // cable raceway and a chine-like conduit along the booster
  b.add(slab([[0, 3], [0.32, 3.6], [0.32, BH - 4], [0, BH - 3.4]], 0.7), steel, { rot: [0, -150 * DEG - Math.PI / 2, 0], pos: around(R - 0.05, -150 * DEG) });

  /* --- Ship --- */
  const body = [[R, S], [R, S + 33.6], ...ogive(R, 18.4, S + 33.6, { tip: 0.9, blunt: 0.95, end: TOP }).slice(1)];
  b.add(revolve(body, { segments: 72, phiStart: -Math.PI / 2, phiLength: Math.PI, ...metres }), tiles);   // windward
  b.add(revolve(body, { segments: 72, phiStart: Math.PI / 2, phiLength: Math.PI, ...metres }), steel);    // leeward

  // flaps: windward face tiled, leeward face bare steel
  const flap = (outline, phi, t) => {
    const right = Math.sin(phi) >= 0;
    const ol = right ? outline : outline.map(([x, y]) => [-x, y]);
    const rot = [0, right ? phi - Math.PI / 2 : phi + Math.PI / 2, 0];
    b.add(slab(ol, t / 2, { from: 0 }), tiles, { rot });
    b.add(slab(ol, t / 2, { from: -t / 2 }), steel, { rot });
  };
  // aft flaps on the tile line (180° apart)
  const aft = [[0, 0.8], [3.4, 1.0], [3.95, 1.8], [3.95, 7.6], [3.3, 9.2], [0, 12.8]].map(([x, y]) => [R - 0.15 + x, S + y]);
  flap(aft, Math.PI / 2, 0.42);
  flap(aft, -Math.PI / 2, 0.42);
  // forward flaps on the nose, swung toward the leeward side (~140° apart)
  const nose = body.slice(2);
  const fy0 = S + 35.6, fy1 = S + 45.6;
  const fwd = [];   // root follows the nose surface bottom → top, tip edge returns top → bottom
  for (let i = 0; i <= 6; i++) { const y = fy0 + (i / 6) * (fy1 - fy0); fwd.push([radiusAt(nose, y) - 0.25, y]); }
  fwd.push([radiusAt(nose, fy1) + 1.2, fy1 - 0.7], [radiusAt(nose, fy0 + 3.2) + 2.3, fy0 + 2.4], [radiusAt(nose, fy0) + 2.2, fy0 + 0.5]);
  for (const s of [1, -1]) flap(fwd, s * 110 * DEG, 0.34);
  // chines running along the tile line between the flaps
  for (const s of [1, -1]) {
    const c = [[0, 0], [0.38, 0.5], [0.38, 20.4], [0, 21]].map(([x, y]) => [R - 0.05 + x, S + 12.4 + y]);
    flap(c, s * Math.PI / 2, 0.2);
  }
  return b.build();
}

/* ================================================================
   QUEEN · Saturn V (SA-506, Apollo 11) · 110.6 m
   S-IC 42.1 m × 10.1 m, S-II 24.9 m, S-IVB 17.9 m × 6.6 m, IU 0.9 m,
   SLA 8.5 m, CSM under the boost protective cover, LES tower.
   ================================================================ */
export function saturnV(M) {
  const b = new Builder();
  const R = 5.03, R3 = 3.3, Rc = 1.955;
  const eighths = (g, X, Y, y0, y1, odd) => {
    g.fillStyle = '#121214';
    for (let k = 0; k < 4; k++) {
      const u = 0.5 + (k * 0.25 + (odd ? 0.125 : 0)), x0 = X(u % 1), w = X(0.125);
      g.fillRect(x0, Y(y1), w, Y(y0) - Y(y1));
      if (x0 + w > X(1)) g.fillRect(x0 - X(1), Y(y1), w, Y(y0) - Y(y1));
    }
  };

  // S-IC: roll pattern on the lower third, flag and "USA" above (both faces)
  const sicH = 42.06 - 4.4;
  const sic = livery(TAU * R, sicH, (g, W, H, X, Y) => {
    eighths(g, X, Y, 0, 14.6 - 4.4, false);
    g.fillStyle = '#c8c8c4'; for (const y of [8.8, 19.6, 26.2]) g.fillRect(0, Y(y - 4.4), W, 2);   // tank joints
    for (const u of [0.5, 0, 1]) {
      const fw = X(0.185), fh = Y(0) - Y(3.1);
      usFlag(g, X(u) - fw / 2, Y(37.2 - 4.4), fw, fh);
      verticalText(g, 'USA', X, Y, u, 21.2 - 4.4, 33.2 - 4.4, { width: 0.072 });
    }
  }, { px: 40 });
  b.add(revolve([[R, 4.4], [R, 42.06]], { segments: 96 }), std({ map: sic, roughness: 0.5 }));
  b.add(revolve([[0, 4.4], [R, 4.4]], { segments: 64 }), M.darkgray);          // base heat shield

  // five F-1s: 3.76 m exit, ~5.8 m long; four outboard under conical fairings
  const f1 = [V(0, 0, 0), ...[45, 135, 225, 315].map(a => around(3.85, a * DEG))];
  for (const p of f1) {
    engine(b, M, p.x, 0, p.z, 1.88, 4.4, M.engine);
    b.add(revolve([[0.98, 1.75], [1.1, 1.85], [1.1, 2.05], [0.95, 2.15]], { segments: 24 }), M.engine, { pos: V(p.x, 0, p.z) }); // turbine exhaust manifold
    b.add(revolve([[0.95, 2.8], [0.95, 4.4]], { segments: 20 }), M.foil, { pos: V(p.x, 0, p.z) }); // insulation blankets
  }
  const fairing = revolve([[1.1, 1.6], [1.98, 1.6], [1.98, 4.8], [1.4, 8.6], [0.3, 12.8]], { segments: 40 });
  const fin = [[5.6, 1.3], [9.6, 1.3], [9.6, 3.2], [5.6, 7.9]];
  for (const a of [45, 135, 225, 315]) {
    const p = around(3.85, a * DEG);
    b.add(fairing, M.white, { pos: V(p.x, 0, p.z) });
    radialSlab(b, M.white, fin.map(([x, y]) => [x - 5.6, y]), 0.42, a * DEG, 5.6);
  }

  // S-IC/S-II interstage with its eight ullage motors, then the S-II
  b.add(revolve([[R, 42.06], [R + 0.03, 42.12], [R + 0.03, 42.3], [R, 42.36], [R, 47.04]], { segments: 96 }), M.white);
  for (let i = 0; i < 8; i++) {
    const a = (22.5 + i * 45) * DEG;
    b.add(revolve([[0, 0], [0.24, 0.3], [0.24, 2.6], [0, 3.1]], { segments: 10 }), M.white, { pos: around(R, a, 42.5) });
  }
  const s2H = 71.6 - 47.04;
  const s2 = livery(TAU * R, s2H, (g, W, H, X, Y) => {
    for (const u of [0.5]) verticalText(g, 'UNITED STATES', X, Y, u, 50.0 - 47.04, 69.4 - 47.04, { width: 0.05 });
    g.fillStyle = '#c8c8c4'; g.fillRect(0, Y(s2H - 0.25), W, 2); g.fillRect(0, Y(3.2), W, 2);
  }, { px: 40 });
  b.add(revolve([[R, 47.04], [R, 71.6]], { segments: 96 }), std({ map: s2, roughness: 0.5 }));

  // S-II/S-IVB interstage: the uneven black-and-white checker
  const ckH = 75.9 - 71.6;
  const ck = livery(TAU * 4.2, ckH, (g, W, H, X, Y) => {
    eighths(g, X, Y, 0, ckH * 0.58, false);
    eighths(g, X, Y, ckH * 0.58, ckH, true);
  });
  b.add(revolve([[R, 71.6], [R3, 75.9]], { segments: 96 }), std({ map: ck, roughness: 0.5 }));

  // S-IVB with its two APS modules, then the Instrument Unit
  b.add(revolve([[R3, 75.9], [R3, 84.19]], { segments: 80 }), M.white);
  for (const a of [Math.PI / 2, -Math.PI / 2]) {
    radialSlab(b, M.white, [[0, 76.1], [0.55, 76.3], [0.62, 77.9], [0, 78.2]], 1.2, a, R3 - 0.05);
  }
  b.add(revolve([[R3, 84.19], [R3, 85.1]], { segments: 80 }), M.black);

  // Spacecraft–LM adapter (four panels) and the service module
  const sla = livery(TAU * 2.7, 8.5, (g, W, H, X) => {
    g.fillStyle = '#bdbdb8';
    for (let k = 0; k < 4; k++) g.fillRect(X(0.125 + k * 0.25) - 1, 0, 2, H);
    g.fillRect(0, H * 0.02, W, 2);
  });
  b.add(revolve([[R3, 85.1], [Rc, 93.62]], { segments: 80 }), std({ map: sla, roughness: 0.5 }));
  const smSilver = std({ color: 0xd8d9d8, metalness: 0.55, roughness: 0.35 });
  b.add(revolve([[Rc, 93.62], [Rc, 97.5], [Rc - 0.06, 97.6]], { segments: 64 }), smSilver);
  for (let k = 0; k < 4; k++) {
    const a = (7.25 + k * 90) * DEG;
    b.add(new THREE.BoxGeometry(0.67, 0.82, 0.3), smSilver, { pos: around(Rc + 0.1, a, 96.7), rot: [0, a, 0] });
  }

  // boost protective cover over the command module, then the launch escape system
  b.add(revolve([[Rc + 0.03, 97.55], [Rc + 0.03, 97.85], [0.68, 100.5], [0.5, 100.85], [0.0, 100.9]], { segments: 64 }), M.white);
  const legs = [45, 135, 225, 315].map(a => [around(1.0, a * DEG, 100.5), around(0.34, a * DEG, 103.5)]);
  for (const [a, c] of legs) b.add(strut(a, c, 0.06), M.lightgray);
  for (let i = 0; i < 4; i++) {
    const [a0, c0] = legs[i], [a1, c1] = legs[(i + 1) % 4];
    const lerp = (p, q, t) => p.clone().lerp(q, t);
    for (const t of [0, 0.5]) b.add(strut(lerp(a0, c0, t), lerp(a1, c1, t + 0.5), 0.035), M.lightgray);
    b.add(strut(lerp(a0, c0, 0.5), lerp(a1, c1, 0.5), 0.04), M.lightgray);
  }
  b.add(revolve([[0.62, 103.4], [0.62, 103.55], [0.33, 104.4]], { segments: 32 }), M.black);       // nozzle skirt
  for (let k = 0; k < 4; k++) {
    const a = (k * 90 + 45) * DEG;
    b.add(bell(0.2, 0.55), M.engine, { matrix: new THREE.Matrix4().makeRotationY(a).multiply(
      new THREE.Matrix4().compose(V(0, 103.45, 0.5), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.6, 0, 0)), V(1, 1, 1))) });
  }
  b.add(revolve([[0.33, 104.4], [0.33, 108.4]], { segments: 32 }), M.white);                     // escape motor
  b.add(revolve([[0.33, 108.4], [0.24, 109.5], [0.08, 110.4], [0.1, 110.45], [0.1, 110.55], [0, 110.6]], { segments: 24 }), M.black); // canards + Q-ball
  for (const a of [0, Math.PI]) radialSlab(b, M.black, [[0, 108.6], [0.25, 108.75], [0.25, 109.35], [0, 109.4]], 0.05, a, 0.28);
  return b.build();
}

/* ================================================================
   BISHOP · N1-L3 (Soviet lunar rocket, vehicle 3L, Feb 1969) · 105.3 m
   17 m base, a single cone over three stages, open truss interstages,
   30 NK-15 on Block A, four grid fins, L3 lunar complex under a shroud.
   ================================================================ */
export function n1(M) {
  const b = new Builder();
  const gray = std({ color: 0x9da1a3, roughness: 0.55 });
  const white = M.white;
  const seam = (r, y) => b.add(revolve([[r + 0.04, y - 0.12], [r + 0.04, y + 0.12]], { segments: 96 }), M.darkgray);

  // Block A: 30 engines (24 outer + 6 inner) under a flat base, then the big cone
  b.add(revolve([[0, 1.0], [8.1, 1.0]], { segments: 96 }), M.darkgray);
  b.add(revolve([[8.1, 1.0], [8.45, 1.6], [8.45, 2.8], [5.3, 30.1]], { segments: 120 }), gray);
  for (let i = 0; i < 24; i++) { const p = around(7.2, (i / 24) * TAU); engine(b, M, p.x, 0, p.z, 0.72, 1.6); }
  for (let i = 0; i < 6; i++) { const p = around(2.3, (i / 6) * TAU + 0.3); engine(b, M, p.x, 0, p.z, 0.72, 1.6); }
  // four grid fins, folded flat against the base
  for (const a of [45, 135, 225, 315]) {
    b.add(lattice(3.0, 7.0, 0.35, 4, 9, 0.2, 0.07), M.darkgray, {
      matrix: new THREE.Matrix4().makeRotationY(a * DEG).multiply(
        new THREE.Matrix4().compose(V(0, 4.7, 8.55), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.11, 0, 0)), V(1, 1, 1))),
    });
  }
  // two cable tunnels running up the side
  for (const a of [70, 250]) {
    b.add(strut(around(8.5, a * DEG, 2.8), around(5.38, a * DEG, 30.0), 0.32, 8), gray);
    b.add(strut(around(5.12, a * DEG, 32.7), around(3.96, a * DEG, 52.6), 0.26, 8), gray);
  }
  seam(7.6, 9.0); seam(6.4, 19.5);

  // open truss: Block A → Block B, with B's dark aft end showing through
  b.add(truss(5.25, 30.1, 5.05, 32.7, 16, 0.12), M.darkgray);
  b.add(revolve([[4.7, 30.1], [4.7, 32.7]], { segments: 64 }), M.black);
  b.add(revolve([[0, 30.1], [5.25, 30.1]], { segments: 64 }), M.darkgray);
  // Block B
  b.add(revolve([[5.05, 32.7], [3.9, 52.8]], { segments: 112 }), gray);
  seam(4.5, 42.5);
  // truss B → V
  b.add(truss(3.85, 52.8, 3.8, 55.0, 12, 0.1), M.darkgray);
  b.add(revolve([[3.45, 52.8], [3.45, 55.0]], { segments: 64 }), M.black);
  // Block V: grey below, white above (as flown on 3L)
  b.add(revolve([[3.8, 55.0], [3.4, 61.0]], { segments: 96 }), gray);
  b.add(revolve([[3.4, 61.0], [3.0, 66.8]], { segments: 96 }), white);

  // L3: shroud over Blocks G and D and the LK lander, then the LOK and escape tower
  b.add(revolve([[3.0, 66.8], [2.25, 69.2], [2.25, 85.2], [2.32, 85.6], [2.32, 86.4], [2.2, 86.8], [1.55, 92.4], [1.55, 94.4], [0.9, 96.2], [0.55, 96.8]], { segments: 96 }), white);
  seam(2.25, 75.0); seam(2.25, 80.4);
  // escape tower: four-leg truss, motor with angled nozzles, pointed nose
  const legs = [45, 135, 225, 315].map(a => [around(0.6, a * DEG, 96.7), around(0.35, a * DEG, 99.4)]);
  for (const [p, q] of legs) b.add(strut(p, q, 0.05), M.lightgray);
  b.add(revolve([[0.45, 99.3], [0.45, 103.6], [0.3, 104.6], [0.06, 105.25], [0, 105.3]], { segments: 32 }), white);
  for (let k = 0; k < 4; k++) {
    b.add(bell(0.16, 0.5), M.engine, { matrix: new THREE.Matrix4().makeRotationY(k * TAU / 4).multiply(
      new THREE.Matrix4().compose(V(0, 99.5, 0.45), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.7, 0, 0)), V(1, 1, 1))) });
  }
  for (let k = 0; k < 4; k++) radialSlab(b, white, [[0, 94.5], [0.9, 94.6], [0.9, 95.0], [0, 95.4]], 0.06, (k * 90 + 45) * DEG, 1.4);
  return b.build();
}

/* ================================================================
   KNIGHT · Space Shuttle stack (Discovery) · 56.1 m
   Orbiter 37.24 m long, 23.79 m span; External Tank 46.9 m × 8.4 m;
   SRBs 45.46 m × 3.71 m. The orbiter rides on the tank's +x side.
   ================================================================ */
export function shuttle(M) {
  const b = new Builder();
  const ET0 = 9.2, ETR = 4.2;

  // External Tank: sprayed-on foam, ribbed intertank, ogive LOX tank, nose spike
  const r = mulberry(3);
  const foamMap = canvasTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = '#c6692c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const v = r();
      g.fillStyle = v > 0.5 ? `rgba(220,130,70,${0.08 + r() * 0.1})` : `rgba(120,55,20,${0.06 + r() * 0.1})`;
      g.beginPath(); g.ellipse(r() * w, r() * h, 4 + r() * 22, 3 + r() * 14, r() * 3, 0, TAU); g.fill();
    }
  }, { repeat: true });
  foamMap.repeat.set(2, 1 / 12);
  const foam = std({ map: foamMap, roughness: 0.92 });
  const ribs = canvasTexture(1024, 64, (g, w, h) => {
    g.fillStyle = '#bd6229'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(80,35,10,0.45)';
    for (let i = 0; i < 108; i++) g.fillRect((i / 108) * w, 0, 2.5, h);
  });
  const lh2 = [[0.01, ET0], [1.7, ET0 + 0.25], [2.8, ET0 + 0.7], [3.6, ET0 + 1.3], [4.05, ET0 + 2.0], [ETR, ET0 + 2.7], [ETR, ET0 + 29.5]];
  b.add(revolve(lh2, { segments: 96, ...metres }), foam);
  b.add(revolve([[ETR, ET0 + 29.5], [ETR + 0.03, ET0 + 29.6], [ETR + 0.03, ET0 + 36.3], [ETR, ET0 + 36.4]], { segments: 96 }), std({ map: ribs, roughness: 0.8 }));
  const lox = [[ETR, ET0 + 36.4], [ETR, ET0 + 38.3], ...ogive(ETR, 8.6, ET0 + 38.3, { tip: 0.42, blunt: 0.3 }).slice(1)];
  const loxTop = lox.at(-1)[1];
  b.add(revolve(lox, { segments: 96, ...metres }), foam);
  b.add(revolve([[0.42, loxTop - 0.15], [0.3, loxTop + 0.3], [0.05, 56.0], [0, 56.1]], { segments: 24 }), M.darkgray);   // nose cap and spike
  // LO2 feedline and cable tray down the orbiter side of the tank
  const feed = a => [around(ETR + 0.3, a, ET0 + 37.5), around(ETR + 0.3, a, ET0 + 3.0)];
  b.add(strut(...feed(68 * DEG), 0.24, 10), foam);
  b.add(strut(...feed(112 * DEG), 0.16, 8), foam);

  // Solid Rocket Boosters on the ±z sides
  const srb = [
    [1.9, 0.0], [1.6, 1.4], [2.62, 1.45], [2.62, 1.7], [1.86, 4.6], [1.86, 38.6], [1.86, 39.6], [1.62, 41.2],
    ...ogive(1.62, 4.1, 41.2, { tip: 0.32, blunt: 0.5, end: 45.46 }).slice(1),
  ];
  const srbMap = canvasTexture(64, 1024, (g, w, h) => {
    g.fillStyle = '#efefea'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#9c9c97';
    for (const y of [9.6, 17.6, 25.6, 33.6]) g.fillRect(0, h - (y / 45.46) * h, w, 3);  // field joints
  });
  const srbMat = std({ map: srbMap, roughness: 0.5 });
  for (const z of [6.55, -6.55]) {
    b.add(revolve(srb, { segments: 64 }), srbMat, { pos: V(0, 0, z) });
    b.add(bellInner(1.9, 1.4, 0.7), M.throat, { pos: V(0, 0, z) });
    b.add(strut(V(0, 12.5, z - Math.sign(z) * 1.86), V(0, 12.5, Math.sign(z) * ETR), 0.18), M.lightgray);
    b.add(strut(V(0.9, 12.0, z - Math.sign(z) * 1.86), V(1.4, 13.6, Math.sign(z) * ETR * 0.9), 0.12), M.lightgray);
    b.add(strut(V(0, ET0 + 32.0, z - Math.sign(z) * 1.86), V(0, ET0 + 32.0, Math.sign(z) * ETR), 0.3), M.lightgray);
    // systems tunnel
    b.add(strut(V(-1.55, 6, z + Math.sign(z) * 1.1), V(-1.55, 38, z + Math.sign(z) * 1.1), 0.18, 6), srbMat);
  }

  // ---- orbiter, in its own frame: X nose-ward, Y dorsal, Z to starboard ----
  const o = new Builder();
  const L = 37.24;
  const W = X => X < 29 ? 5.25 : 5.25 * Math.sqrt(Math.max(0, 1 - Math.pow((X - 29) / (L - 29), 2.2)));
  const yb = X => X < 29 ? 0 : 1.9 * Math.pow((X - 29) / (L - 29), 1.7);
  const yt = X => {
    if (X < 2) return 6.2 - X * 0.25;
    if (X < 24) return 5.7;
    if (X < 27.5) return 5.7 + (X - 24) / 3.5 * 0.65;
    return 6.35 - (6.35 - 2.3) * Math.pow((X - 27.5) / (L - 27.5), 1.35);
  };
  const section = (X, n = 32) => {
    const w = Math.max(W(X), 0.02) / 2, lo = yb(X), hi = Math.max(yt(X), lo + 0.05), cy = lo + (hi - lo) * 0.45;
    const nTop = X > 28 ? 2.4 : 3.2, nBot = X > 30 ? 2.6 : 7;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * TAU, c = Math.cos(t), s = Math.sin(t);
      const sgn = v => Math.sign(v) * Math.pow(Math.abs(v), 2 / (s >= 0 ? nTop : nBot));
      pts.push(V(X, s >= 0 ? cy + (hi - cy) * sgn(s) : cy - (cy - lo) * -sgn(s), -w * sgn(c)));
    }
    return pts;
  };
  const stations = [];
  for (let X = 0; X <= 29; X += 0.725) stations.push(X);
  for (let i = 1; i <= 14; i++) stations.push(29 + (L - 29) * (1 - Math.pow(1 - i / 14, 1.6)));
  const fuselage = loft(stations.map(X => section(X)), { capStart: true });
  const chin = X => X < 30 ? 0.7 : 0.7 + (X - 30) * 0.12;
  const fusePaint = (p, n) => {
    if (n.x < -0.7 && p.x < 0.5) return '#2a2b2d';                                   // base heat shield
    if (p.x > L - 0.75) return '#55575a';                                             // RCC nose cap
    if (p.x > 28.2 && p.x < 29.8 && n.y > 0.55 && Math.abs(p.z) < 1.7) return '#0c0c0d'; // windscreen surround
    if (n.y < -0.45 || p.y < chin(p.x)) return '#141416';                              // HRSI belly
    return '#f1f1ed';
  };
  o.add(paint(fuselage, fusePaint), M.vertex);

  // double-delta wings: 81° glove, 45° main panel, flat underside
  const le = Z => Z <= 4.6 ? 24.5 - (Z - 2.6) * 3.75 : 17.0 - (Z - 4.6) * (11.4 / 7.3);
  const te = Z => 0.6 + (Z - 2.6) * 0.09;
  const thick = Z => Z <= 4.6 ? 0.95 + (Z - 2.6) * 0.2 : 1.35 - (Z - 4.6) / 7.3 * 1.05;
  const airfoil = (Z, n = 12) => {
    const a = le(Z), c = a - te(Z), t = thick(Z), up = [], dn = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n, s = Math.pow(Math.sin(Math.PI * Math.pow(f, 0.62)), 1.0) * t;
      up.push(V(a - f * c, 0.06 + s, Z));
      dn.push(V(a - f * c, 0.06 - s * 0.08, Z));
    }
    return [...up, ...dn.reverse().slice(1, -1)];
  };
  const spans = [1.9, 2.6, 3.6, 4.6, 6.0, 7.6, 9.2, 10.6, 11.9];
  const wingR = loft(spans.map(Z => airfoil(Z)), { capEnd: true });
  const wingL = loft(spans.map(Z => airfoil(Z).map(p => V(p.x, p.y, -p.z)).reverse()), { capEnd: true });
  const wingPaint = (p, n) => {
    const z = Math.abs(p.z);
    if (p.x > le(z) - 0.5) return '#3c3e41';                // RCC leading edge
    if (n.y < -0.2) return '#141416';
    return '#f1f1ed';
  };
  o.add(paint(wingR, wingPaint), M.vertex).add(paint(wingL, wingPaint), M.vertex);

  // vertical stabiliser with rudder / speed brake
  const tle = Y => 8.6 - (Y - 5.4) * 0.66, tte = Y => -0.55 + (Y - 5.4) * 0.05, tt = Y => 0.38 - (Y - 5.4) * 0.025;
  const tail = loft([5.2, 7.5, 10, 12.5, 15.25].map(Y => {
    const a = tle(Y), c = a - tte(Y), t = tt(Y), one = [], two = [];
    for (let i = 0; i <= 10; i++) {
      const f = i / 10, s = Math.sin(Math.PI * Math.pow(f, 0.6)) * t + 0.01;
      one.push(V(a - f * c, Y, -s)); two.push(V(a - f * c, Y, s));
    }
    return [...one, ...two.reverse().slice(1, -1)];
  }), { capEnd: true });
  o.add(paint(tail, (p) => (p.x > tle(p.y) - 0.35 ? '#c9c9c6' : '#f1f1ed')), M.vertex);

  // OMS pods either side of the tail, body flap, three SSMEs
  for (const z of [1.95, -1.95]) {
    const pod = revolve([[0.6, -0.2], [1.02, 0.4], [1.05, 3.4], [0.85, 5.4], [0.45, 6.6], [0, 7.1]], { segments: 24 });
    pod.applyMatrix4(new THREE.Matrix4().compose(V(-0.1, 5.35, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2)), V(0.82, 1, 1)));
    o.add(paint(pod, (p, n) => (n.x > 0.55 && p.x > 4.4 ? '#141416' : '#f1f1ed')), M.vertex);
    o.add(bell(0.5, 1.0), M.engine, { pos: V(-1.0, 5.35, z), rot: [0, 0, -Math.PI / 2] });
  }
  o.add(paint(new THREE.BoxGeometry(2.4, 0.5, 6.2), (p, n) => (n.y > 0.5 ? '#f1f1ed' : '#141416')), M.vertex, { pos: V(-0.6, 0.3, 0) });
  const ssmeMat = std({ color: 0xb9bcc0, metalness: 0.85, roughness: 0.35 });
  for (const [y, z] of [[4.35, 0], [1.95, 1.35], [1.95, -1.35]]) {
    o.add(bell(1.15, 3.1, 0.3), ssmeMat, { pos: V(-2.9, y, z), rot: [0, 0, -Math.PI / 2] });
    o.add(bellInner(1.15, 3.1, 0.3), M.throat, { pos: V(-2.9, y, z), rot: [0, 0, -Math.PI / 2] });
  }

  // name and NASA insignia on both sides of the fuselage
  const nameMat = decalMaterial(1024, 128, (g, w, h) => {
    g.fillStyle = '#111'; g.font = `700 ${h * 0.8}px Geist, Helvetica, Arial, sans-serif`;
    g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText('Discovery', w / 2, h / 2);
  });
  const meatball = decalMaterial(256, 256, (g, w, h) => {
    g.fillStyle = '#0b3d91'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.48, 0, TAU); g.fill();
    g.strokeStyle = '#fc3d21'; g.lineWidth = w * 0.06; g.beginPath();
    g.moveTo(w * 0.12, h * 0.68); g.quadraticCurveTo(w * 0.5, h * 0.45, w * 0.9, h * 0.22); g.stroke();
    g.fillStyle = '#fff'; g.font = `800 ${h * 0.22}px Helvetica, Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('NASA', w / 2, h * 0.52);
  });
  for (const s of [1, -1]) {
    const rot = [0, s > 0 ? 0 : Math.PI, 0];
    o.decal(new THREE.PlaneGeometry(4.6, 0.58), nameMat, { pos: V(23.6, 3.15, s * 2.645), rot });
    o.decal(new THREE.PlaneGeometry(1.5, 1.5), meatball, { pos: V(19.4, 3.3, s * 2.645), rot });
  }

  const orbiter = o.build();
  // orbiter X → world +y, Y → world +x (belly toward the tank), Z → world −z
  orbiter.matrixAutoUpdate = false;
  orbiter.matrix.set(0, 1, 0, ETR + 1.0, 1, 0, 0, 10.4, 0, 0, -1, 0, 0, 0, 0, 1);
  // attach struts: forward bipod and the two aft attach points
  for (const z of [0.7, -0.7]) b.add(strut(V(ETR - 0.1, ET0 + 30.2, z * 0.4), V(ETR + 1.05, 37.6, z), 0.14), M.lightgray);
  for (const z of [1.4, -1.4]) b.add(strut(V(ETR - 0.1, ET0 + 2.5, z), V(ETR + 1.05, 12.8, z * 1.2), 0.26), M.lightgray);

  const stack = b.build();
  stack.add(orbiter);
  return stack;
}

/* ================================================================
   ROOK · Soyuz-2.1a with Soyuz MS · 46.3 m
   Core (Blok A) 27.1 m × 2.95 m, four strap-ons (19.6 m × 2.68 m)
   with air rudders, truss to Blok I (6.7 m × 2.66 m), crew fairing
   with folded grid fins and the escape tower. 10.3 m across the fins.
   ================================================================ */
export function soyuz(M) {
  const b = new Builder();
  const paintGray = std({ color: 0xc9ccc8, roughness: 0.55 });
  const tailGray = std({ color: 0x6e7174, roughness: 0.6 });

  // core: narrow waist where the boosters nestle, widening to 2.95 m
  const coreR = y => y < 8 ? 1.03 : y < 19 ? 1.03 + (y - 8) / 11 * 0.445 : 1.475;
  const coreProfile = [[1.03, 1.6]];
  for (let y = 8; y <= 19; y += 1) coreProfile.push([coreR(y), y]);
  coreProfile.push([1.475, 27.4], [1.42, 27.8]);
  b.add(revolve([[0, 1.6], [1.03, 1.6]], { segments: 40 }), tailGray);
  b.add(revolve(coreProfile, { segments: 72 }), paintGray);
  for (const [x, z] of [[0.45, 0.45], [-0.45, 0.45], [0.45, -0.45], [-0.45, -0.45]]) engine(b, M, x, 0.15, z, 0.34, 1.45);
  for (let k = 0; k < 4; k++) { const p = around(0.86, (k * 90 + 45) * DEG); engine(b, M, p.x, 0.6, p.z, 0.14, 0.9); }

  // four strap-on boosters: oblique cones whose inner edge rides the core
  const br = y => y < 5 ? 1.34 : y < 18.6 ? 1.34 - (y - 5) / 13.6 * 0.86 : 0.48 * Math.sqrt(Math.max(0, 1 - Math.pow((y - 18.6) / 1.0, 2)));
  for (let k = 0; k < 4; k++) {
    const psi = k * TAU / 4;
    const dir = V(Math.sin(psi), 0, Math.cos(psi));
    const ring = (y, scale = 1) => {
      const r = Math.max(br(y), 0.03) * scale, c = coreR(y) + Math.max(br(y), 0.03) + 0.02, pts = [];
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * TAU;
        pts.push(V(dir.x * c + r * Math.sin(a), y, dir.z * c + r * Math.cos(a)));
      }
      return pts;
    };
    const tailYs = [1.45, 1.75, 2.6];
    b.add(loft(tailYs.map((y, i) => ring(y, i ? 1 : 0.96)), { capStart: true }), tailGray);
    const ys = [2.6, 4, 5, 7, 9, 11, 13, 15, 17, 18.2, 18.6, 18.9, 19.2, 19.45, 19.6];
    b.add(loft(ys.map(y => ring(y))), paintGray);
    // RD-107A: four chambers and two verniers
    const c0 = coreR(1.45) + 1.36;
    for (const [s, t] of [[0.42, 0.42], [-0.42, 0.42], [0.42, -0.42], [-0.42, -0.42]]) {
      engine(b, M, dir.x * (c0 + s) + dir.z * t, 0.1, dir.z * (c0 + s) - dir.x * t, 0.33, 1.4);
    }
    for (const t of [0.95, -0.95]) engine(b, M, dir.x * (c0 + 0.5) + dir.z * t, 0.6, dir.z * (c0 + 0.5) - dir.x * t, 0.13, 0.85);
    // air rudder fin on the outside of each booster
    radialSlab(b, tailGray, [[0, 1.4], [1.42, 1.4], [1.42, 2.0], [0, 3.7]], 0.12, psi, c0 + 1.3);
  }

  // truss up to the third stage, Blok I and its RD-0124 just visible inside
  b.add(truss(1.42, 27.8, 1.33, 28.75, 12, 0.06), M.darkgray);
  engine(b, M, 0, 27.85, 0, 0.55, 0.9);
  b.add(revolve([[0, 28.75], [1.33, 28.75], [1.33, 35.2]], { segments: 64 }), paintGray);

  // crew fairing with flag and lettering, folded grid fins, escape tower
  const fair = livery(TAU * 1.5, 3.4, (g, W, H, X, Y) => {
    const fw = X(0.13), fh = Y(0) - Y(0.6), x0 = X(0.5) - fw / 2, y0 = Y(3.05);
    ['#ffffff', '#0039a6', '#d52b1e'].forEach((c, i) => { g.fillStyle = c; g.fillRect(x0, y0 + (i * fh) / 3, fw, fh / 3 + 0.5); });
    g.strokeStyle = '#bbb'; g.lineWidth = 1; g.strokeRect(x0, y0, fw, fh);
    g.fillStyle = '#1b3d8f'; g.font = `700 ${(Y(0) - Y(0.34))}px Geist, Helvetica, Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('РОСКОСМОС', X(0.5), Y(1.95));
  }, { px: 110 });
  b.add(revolve([[1.33, 35.2], [1.5, 35.6]], { segments: 64 }), M.white);
  b.add(revolve([[1.5, 35.6], [1.5, 39.0]], { segments: 64, v0: 35.6, vSpan: 3.4 }), std({ map: fair, roughness: 0.45 }));
  b.add(revolve([[1.5, 39.0], [1.3, 39.9], [0.9, 40.7], [0.62, 41.2]], { segments: 64 }), M.white);
  for (let k = 0; k < 4; k++) {
    b.add(lattice(1.05, 1.5, 0.12, 3, 4, 0.08, 0.04), M.darkgray, {
      matrix: new THREE.Matrix4().makeRotationY((k * 90 + 45) * DEG).multiply(new THREE.Matrix4().makeTranslation(0, 36.5, 1.56)),
    });
  }
  b.add(revolve([[0.62, 41.2], [0.48, 41.9], [0.48, 43.75], [0.3, 44.8], [0.12, 45.6], [0.03, 46.3], [0, 46.3]], { segments: 32 }), M.white);
  for (let k = 0; k < 12; k++) {
    b.add(bell(0.09, 0.32), M.engine, { matrix: new THREE.Matrix4().makeRotationY(k * TAU / 12).multiply(
      new THREE.Matrix4().compose(V(0, 43.2, 0.47), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.55, 0, 0)), V(1, 1, 1))) });
  }
  b.add(revolve([[0.5, 42.05], [0.5, 42.25]], { segments: 32 }), M.darkgray);
  return b.build();
}
