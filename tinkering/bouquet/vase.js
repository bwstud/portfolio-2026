/* The florist's cylinder: thick-bottomed glass, a rounded lip, water two-thirds up, and
   optionally a grid of clear tape across the mouth. One description feeds both the meshes and
   the physics, so what you see is what the stems lean on.

   Glass and water are drawn differently on purpose. Water is a transmissive volume, so stems
   below the line are refracted and magnified the way they are in a real vase. Glass is a thin
   blended shell whose reflections are added on top. If both were transmissive, three.js would
   not let the glass see the water through it. */

import * as THREE from 'three';

export const CYLINDER = {
  id: 'cylinder', name: 'Glass cylinder',
  rOut: 0.059, wall: 0.0038, height: 0.26, base: 0.016,
};

export function vaseDescription(v, { water = 0.66, tape = true } = {}) {
  const rIn = v.rOut - v.wall;
  const lipR = v.wall / 2;
  const rimY = v.height - lipR;
  const floorY = v.base;
  const waterY = floorY + (rimY - floorY) * water;
  const tapeY = v.height + 0.0006;
  const strips = [];
  if (tape) {
    const d = rIn * 0.36;
    for (const o of [-d, d]) {
      const half = Math.sqrt(v.rOut * v.rOut - o * o);
      strips.push({ ax: o, az: -half, bx: o, bz: half, y: tapeY, r: 0.0011 });
      strips.push({ ax: -half, az: o, bx: half, bz: o, y: tapeY, r: 0.0011 });
    }
  }
  return { floorY, rimY, rIn, rOut: v.rOut, lipR, waterY, tape: strips, muGlass: 0.25, muTape: 0.45 };
}

/* Profile for the lathe, outside up and over the lip and down the inside to the inner floor. */
function profile(v) {
  const rIn = v.rOut - v.wall, lipR = v.wall / 2, top = v.height - lipR;
  const pts = [];
  pts.push([0, 0], [v.rOut - 0.006, 0], [v.rOut - 0.0015, 0.0012], [v.rOut, 0.005]);
  pts.push([v.rOut, top]);
  for (let k = 1; k < 10; k++) {
    const a = (k / 10) * Math.PI;
    pts.push([v.rOut - lipR + Math.cos(a) * lipR, top + Math.sin(a) * lipR]);
  }
  pts.push([rIn, top], [rIn, v.base + 0.004], [rIn - 0.003, v.base + 0.0005], [rIn - 0.008, v.base], [0, v.base]);
  return pts.map(([x, y]) => new THREE.Vector2(x, y));
}

/* Glass: reflections are kept at full strength (premultiplied, added) while the body of the
   glass is nearly clear, picking up a sea-green tint at grazing angles where you look through
   more of it, the way the edge of a pane does. */
function glassMaterial(side, envMap) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xdaf0e6, roughness: 0.03, metalness: 0, ior: 1.5, specularIntensity: 1,
    transparent: true, premultipliedAlpha: true, depthWrite: false, side, envMap, envMapIntensity: 1.1,
  });
  m.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      float fres = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 3.0);
      float a = clamp(0.05 + 0.6 * fres, 0.0, 0.85);
      gl_FragColor = vec4(totalDiffuse * a * 0.5 + totalSpecular, a);
    `);
  };
  return m;
}

export function buildVase(v, desc, envMap) {
  const group = new THREE.Group();
  group.name = 'vase';
  const lathe = new THREE.LatheGeometry(profile(v), 96);
  const back = new THREE.Mesh(lathe, glassMaterial(THREE.BackSide, envMap));
  const front = new THREE.Mesh(lathe, glassMaterial(THREE.FrontSide, envMap));
  back.renderOrder = 2; front.renderOrder = 4;
  group.add(back, front);

  // the thick base: a solid green-tinged puck you can see the light gather in
  const puck = new THREE.Mesh(
    new THREE.CylinderGeometry(desc.rIn - 0.0025, v.rOut - 0.002, v.base - 0.001, 96, 1),
    new THREE.MeshPhysicalMaterial({ color: 0xbfe0d2, roughness: 0.05, transmission: 1, thickness: 0.012, ior: 1.5, attenuationColor: new THREE.Color(0x8fc7ae), attenuationDistance: 0.05, envMap, envMapIntensity: 0.8 }),
  );
  puck.position.y = v.base / 2;
  puck.renderOrder = 1;
  group.add(puck);

  // water: a transmissive volume, with a meniscus that climbs the glass a little
  const water = new THREE.Mesh(waterGeometry(desc), new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.0, transmission: 1, thickness: 0.026, ior: 1.333,
    attenuationColor: new THREE.Color(0xe9f4ee), attenuationDistance: 0.6, specularIntensity: 1, envMap, envMapIntensity: 1,
    depthWrite: false,
  }));
  water.name = 'water';
  water.renderOrder = 3;
  group.add(water);

  group.add(buildTape(v, desc));
  return { group, water };
}

export function waterGeometry(desc) {
  const r = desc.rIn - 0.0003;
  const pts = [[0, desc.floorY + 0.0004], [r - 0.001, desc.floorY + 0.0004], [r, desc.floorY + 0.0014], [r, desc.waterY + 0.0016]];
  // meniscus: up the wall by a millimetre or two, falling off over a few millimetres
  for (let k = 1; k <= 6; k++) {
    const t = k / 6;
    pts.push([r - t * t * 0.0045, desc.waterY + 0.0016 * (1 - Math.sqrt(t))]);
  }
  pts.push([0, desc.waterY]);
  return new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 96);
}

/* Clear floral tape: flat strips across the mouth, over the lip and a little way down the
   outside, slightly frosted so they read against the water. */
export function buildTape(v, desc) {
  const g = new THREE.Group();
  g.name = 'tape';
  if (!desc.tape.length) return g;
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xf4f6f2, roughness: 0.28, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide,
    clearcoat: 0.6, clearcoatRoughness: 0.15,
  });
  const width = 0.0062, down = 0.022;
  for (const t of desc.tape) {
    const along = t.ax === t.bx ? 'z' : 'x';
    const off = along === 'z' ? t.ax : t.az;
    const half = Math.sqrt(v.rOut * v.rOut - off * off);
    const pts = [];
    // down the outside, over the lip, straight across, over and down again
    const lipTop = v.height + 0.0004;
    const out = half + 0.0004;
    pts.push([-out, lipTop - down], [-out, lipTop - 0.002], [-out + 0.0012, lipTop], [out - 0.0012, lipTop], [out, lipTop - 0.002], [out, lipTop - down]);
    const geo = new THREE.BufferGeometry();
    const pos = [], idx = [];
    // slightly sagging across the mouth
    const dense = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const [a, b] = [pts[k], pts[k + 1]];
      const n = k === 2 ? 24 : 2;
      for (let s = 0; s < n; s++) {
        const f = s / n, x = a[0] + (b[0] - a[0]) * f;
        let y = a[1] + (b[1] - a[1]) * f;
        if (k === 2) y -= Math.sin(f * Math.PI) * 0.0012;
        dense.push([x, y]);
      }
    }
    dense.push(pts[pts.length - 1]);
    for (const [s, y] of dense) {
      for (const w of [-width / 2, width / 2]) {
        if (along === 'z') pos.push(off + w, y, s); else pos.push(s, y, off + w);
      }
    }
    for (let k = 0; k < dense.length - 1; k++) { const a = k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 5;
    g.add(m);
  }
  return g;
}
