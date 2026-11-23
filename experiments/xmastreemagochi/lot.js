/* Boy Scout Troop 31's lot on East Avenue: the painted white trailer, tall weathered posts
   with welded-wire fence, netted trees piled on pallets, and rows of firs standing up for
   inspection under a string of bare bulbs. */
import * as THREE from 'three';
import { canvasTexture, rng, TAU, speckle, smoothstep, lerp } from './util.js';
import { sunPosition, lotHours, localParts } from './sun.js';
import { buildTree } from './tree.js';
import { SPECIES, SPECIES_KEYS } from './species.js';

export function buildLot(stock) {
  const scene = new THREE.Scene();
  const r = rng(31);
  const shadowy = o => { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };

  /* ---- Ground ---- */
  const groundTex = canvasTexture(1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#4c4a46'; ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 60000, ['#2c2b29', '#6b6862', '#57524a'], [1, 3], [0.2, 0.6], r);
    // trodden needles and straw
    for (let i = 0; i < 5000; i++) {
      const x = r() * w, y = r() * h, a = r() * TAU;
      ctx.strokeStyle = r() < 0.6 ? `rgba(40,70,40,${0.3 + r() * 0.4})` : `rgba(150,120,70,${0.3 + r() * 0.3})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8); ctx.stroke();
    }
  }, { repeat: [8, 8] });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  /* ---- Trailer ---- */
  const side = canvasTexture(2048, 512, (ctx, w, h) => {
    ctx.fillStyle = '#f1efe9'; ctx.fillRect(0, 0, w, h);
    // panel seams and rivets
    for (let x = 0; x < w; x += 128) {
      ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(x, 0, 3, h);
      ctx.fillStyle = 'rgba(80,80,80,.45)';
      for (let y = 12; y < h - 50; y += 18) { ctx.beginPath(); ctx.arc(x + 8, y, 2, 0, TAU); ctx.fill(); }
    }
    speckle(ctx, w, h, 8000, ['#998f80', '#fff'], [1, 4], [0.05, 0.2], r);
    // orange stripe at the bottom
    ctx.fillStyle = '#d8622a'; ctx.fillRect(0, h - 46, w, 46);
    const brush = (text, x, y, size, color, rot = 0) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.font = `900 ${size}px "Arial Black", Impact, sans-serif`;
      ctx.fillStyle = color;
      for (let k = 0; k < 4; k++) { ctx.globalAlpha = 0.45; ctx.fillText(text, (r() - 0.5) * 6, (r() - 0.5) * 6); }
      ctx.globalAlpha = 1; ctx.fillText(text, 0, 0);
      ctx.restore();
    };
    brush('CHRISTMAS', 520, 150, 120, '#d8622a', -0.08);
    brush('TREES', 700, 290, 130, '#d8622a', -0.05);
    brush('BOY SCOUT', 640, 390, 92, '#222', -0.02);
    brush('TROOP 31', 760, 470, 92, '#222', -0.02);
    // the 31 badge
    ctx.strokeStyle = '#d8622a'; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(330, 230, 80, 0, TAU); ctx.stroke();
    brush('31', 272, 268, 100, '#d8622a');
    // stripes by the door
    ['#d8622a', '#f1efe9', '#2c8a3a', '#f1efe9', '#c8202a'].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(160 + i * 16, 300, 12, 170); });
  });
  const trailer = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf0eee8, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(14, 3.2, 2.6), [white, white, white, white, new THREE.MeshStandardMaterial({ map: side, roughness: 0.6 }), white]);
  body.position.y = 2.9;
  trailer.add(body);
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(14, 0.3, 2.4), new THREE.MeshStandardMaterial({ color: 0x222, roughness: 0.7 })); chassis.position.y = 1.15; trailer.add(chassis);
  const tire = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  for (const x of [4.2, 5.4]) for (const z of [-1.0, 1.0]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 20), tire); t.rotation.x = Math.PI / 2; t.position.set(x, 0.5, z); trailer.add(t); }
  // wreath on the trailer
  const wreath = new THREE.Group();
  const wg = new THREE.MeshStandardMaterial({ color: 0x1f4424, roughness: 0.9 });
  for (let i = 0; i < 60; i++) { const a = (i / 60) * TAU; const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), wg); b.position.set(Math.cos(a) * 0.55, Math.sin(a) * 0.75, 0); b.rotation.set(r() * 3, r() * 3, r() * 3); wreath.add(b); }
  for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: 0xb3121f, roughness: 0.3 })); b.position.set(Math.cos(a) * 0.6, Math.sin(a) * 0.8, 0.12); wreath.add(b); }
  wreath.position.set(-6.6, 2.6, 1.42);
  trailer.add(wreath);
  trailer.position.set(0, 0, -9);
  scene.add(shadowy(trailer));

  /* ---- Fence: tall weathered posts and welded wire ---- */
  const postMat = new THREE.MeshStandardMaterial({ color: 0x6e665c, roughness: 0.95 });
  const wireTex = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#b9bcbc'; ctx.lineWidth = 3;
    for (let k = 0; k <= w; k += 32) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, k); ctx.lineTo(w, k); ctx.stroke(); }
  }, { repeat: [1, 1] });
  const fence = new THREE.Group();
  const fenceLine = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.round(len / 2.4);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.6 + r() * 0.5, 0.14), postMat);
      p.position.set(lerp(x0, x1, t), 1.35, lerp(z0, z1, t));
      p.rotation.z = (r() - 0.5) * 0.04;
      fence.add(p);
    }
    const tex = wireTex.clone(); tex.needsUpdate = true; tex.repeat.set(len / 0.6, 2);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.2), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.4 }));
    mesh.position.set((x0 + x1) / 2, 0.6, (z0 + z1) / 2);
    mesh.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    fence.add(mesh);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.06), postMat);
    rail.position.set((x0 + x1) / 2, 1.25, (z0 + z1) / 2); rail.rotation.y = mesh.rotation.y;
    fence.add(rail);
  };
  fenceLine(-11, -6.5, -11, 7);
  fenceLine(11, -6.5, 11, 7);
  fenceLine(-11, -6.5, -7.5, -6.5);
  fenceLine(7.5, -6.5, 11, -6.5);
  scene.add(shadowy(fence));

  /* ---- Netted trees piled on pallets ---- */
  const netTex = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#28462a'; ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 9000, ['#3d6a3c', '#18301b', '#6a8c6a', '#c8d4c8'], [2, 4], [0.3, 0.7], r);
    ctx.strokeStyle = 'rgba(235,235,225,.55)'; ctx.lineWidth = 2;
    for (let k = -w; k < w * 2; k += 22) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k + w, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(k + w, 0); ctx.lineTo(k, h); ctx.stroke(); }
  }, { repeat: [3, 1] });
  const netMat = new THREE.MeshStandardMaterial({ map: netTex, roughness: 0.95 });
  const pallet = new THREE.MeshStandardMaterial({ color: 0x9c8462, roughness: 0.9 });
  const piles = new THREE.Group();
  const pile = (x, z, rot, layers) => {
    const g = new THREE.Group();
    const pb = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.15, 1.8), pallet); pb.position.y = 0.075; g.add(pb);
    for (let l = 0; l < layers; l++) for (let i = 0; i < 4 - l; i++) {
      const len = 1.8 + r() * 0.8;
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.2 + r() * 0.06, len, 8), netMat);
      t.rotation.z = Math.PI / 2 * (r() < 0.5 ? 1 : -1);
      t.rotation.y = (r() - 0.5) * 0.2;
      t.position.set((r() - 0.5) * 0.4, 0.35 + l * 0.32, -0.6 + i * 0.4 + l * 0.2);
      g.add(t);
      const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.35, 8), new THREE.MeshStandardMaterial({ color: 0x7a5a3a })); stump.rotation.z = Math.PI / 2;
      stump.position.copy(t.position).add(new THREE.Vector3(t.rotation.z > 0 ? -len / 2 - 0.1 : len / 2 + 0.1, 0, 0)); g.add(stump);
    }
    g.position.set(x, 0, z); g.rotation.y = rot;
    piles.add(g);
  };
  pile(-8.6, -4.6, 0.1, 3); pile(-8.8, -1.6, -0.05, 2); pile(8.6, -4.2, 0.2, 3); pile(8.4, 4.4, -0.1, 2);
  scene.add(shadowy(piles));

  /* ---- Baler (the funnel that nets your tree) and the cash table ---- */
  const baler = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xa8231c, metalness: 0.5, roughness: 0.5 });
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.2, 1.1, 20, 1, true), red); funnel.rotation.z = Math.PI / 2; funnel.material.side = THREE.DoubleSide; funnel.position.y = 1.0; baler.add(funnel);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.6, 16), new THREE.MeshStandardMaterial({ color: 0xdcdcd2, roughness: 0.9 })); sleeve.rotation.z = Math.PI / 2; sleeve.position.set(0.85, 1.0, 0); baler.add(sleeve);
  for (const x of [-0.3, 0.3]) for (const z of [-0.3, 0.3]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 6), red); l.position.set(x, 0.5, z); baler.add(l); }
  baler.position.set(5.6, 0, -5.4); baler.rotation.y = 0.3;
  scene.add(shadowy(baler));
  const table = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 0.8), new THREE.MeshStandardMaterial({ color: 0xd8d2c4 })); top.position.y = 0.75; table.add(top);
  for (const x of [-0.8, 0.8]) for (const z of [-0.3, 0.3]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.75, 6), new THREE.MeshStandardMaterial({ color: 0x333 })); l.position.set(x, 0.375, z); table.add(l); }
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.25), new THREE.MeshStandardMaterial({ color: 0x2a3e7a })); box.position.set(0.4, 0.86, 0); table.add(box);
  const hoursTex = canvasTexture(512, 320, (ctx, w, h) => {
    ctx.fillStyle = '#f6f1e4'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1d4a2a'; ctx.font = '700 46px Georgia, serif'; ctx.fillText('Troop 31 trees', 30, 70);
    ctx.font = '30px Georgia, serif'; ctx.fillStyle = '#222';
    ctx.fillText('Since 1952', 30, 116);
    ctx.fillText('Mon–Fri  11 a.m.–9 p.m.', 30, 180);
    ctx.fillText('Sat  9 a.m.–9 p.m.', 30, 222);
    ctx.fillText('Sun  noon–8 p.m.', 30, 264);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.56), new THREE.MeshStandardMaterial({ map: hoursTex, roughness: 0.9 }));
  sign.position.set(-0.3, 1.08, 0.38); sign.rotation.x = -0.3; table.add(sign);
  table.position.set(3.4, 0, -6.2);
  scene.add(shadowy(table));
  // a blue portable toilet, as at every tree lot in America
  const potty = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.3, 1.1), new THREE.MeshStandardMaterial({ color: 0x2b5fa8, roughness: 0.5 }));
  potty.position.set(-9.8, 1.15, -8.4); scene.add(shadowy(potty));

  /* ---- Bare street trees and the church beyond ---- */
  const bark = new THREE.MeshStandardMaterial({ color: 0x3e352c, roughness: 1 });
  const bare = (x, z, h) => {
    const g = new THREE.Group();
    const grow = (p, d, len, rad, depth) => {
      const end = p.clone().addScaledVector(d, len);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.7, rad, len, 5), bark);
      c.position.copy(p).add(end).multiplyScalar(0.5);
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      g.add(c);
      if (depth > 0) for (let k = 0; k < 3; k++) {
        const nd = d.clone().add(new THREE.Vector3(r() - 0.5, r() * 0.4, r() - 0.5).multiplyScalar(1.3)).normalize();
        grow(end, nd, len * 0.7, rad * 0.62, depth - 1);
      }
    };
    grow(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), h * 0.35, h * 0.03, 4);
    g.position.set(x, 0, z);
    scene.add(g);
  };
  for (let i = 0; i < 9; i++) bare(-26 + i * 6.5 + r() * 2, -15 - r() * 6, 9 + r() * 5);
  bare(-14, 3, 11); bare(15, -2, 12);
  const stone = new THREE.MeshStandardMaterial({ color: 0x8a7f72, roughness: 0.95 });
  const church = new THREE.Group();
  const nave = new THREE.Mesh(new THREE.BoxGeometry(14, 9, 8), stone); nave.position.y = 4.5; church.add(nave);
  const roofShape = new THREE.Shape(); roofShape.moveTo(-4.2, 0); roofShape.lineTo(0, 4.5); roofShape.lineTo(4.2, 0); roofShape.lineTo(-4.2, 0);
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 14, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.8 }));
  roof.rotation.y = Math.PI / 2; roof.position.set(-7, 9, 0); church.add(roof);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(4, 20, 4), stone); tower.position.set(-8, 10, 1); church.add(tower);
  const spireM = new THREE.Mesh(new THREE.ConeGeometry(2.6, 8, 4), roof.material); spireM.position.set(-8, 24, 1); spireM.rotation.y = Math.PI / 4; church.add(spireM);
  const glassM = new THREE.MeshStandardMaterial({ color: 0x2a2a40, emissive: 0xffb050, emissiveIntensity: 0 });
  for (let i = 0; i < 4; i++) { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 3.2), glassM); w.position.set(-4.5 + i * 3, 5, 4.01); church.add(w); }
  church.position.set(-6, 0, -28);
  scene.add(church);

  /* ---- Bulb string across the lot ---- */
  const bulbs = [];
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.6 });
  const polePts = [[-10.5, -5.5], [10.5, -5.5], [10.5, 6.5], [-10.5, 6.5]];
  for (const [x, z] of polePts) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 5, 8), poleMat); p.position.set(x, 2.5, z); scene.add(p); }
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd08a, toneMapped: false });
  const runs = [[0, 2], [1, 3], [0, 1], [2, 3]];
  const wireMat = new THREE.LineBasicMaterial({ color: 0x111111 });
  for (const [a, b] of runs) {
    const A = new THREE.Vector3(polePts[a][0], 4.9, polePts[a][1]), Bv = new THREE.Vector3(polePts[b][0], 4.9, polePts[b][1]);
    const pts = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40; const p = A.clone().lerp(Bv, t); p.y -= Math.sin(t * Math.PI) * 0.9; pts.push(p); }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
    for (let i = 1; i < 40; i += 2) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), bulbMat); s.position.copy(pts[i]).add(new THREE.Vector3(0, -0.08, 0)); scene.add(s); bulbs.push(s); }
  }
  const lotLights = [];
  for (const [x, z] of [[-5, 0], [5, 0], [0, -3], [0, 4]]) {
    const l = new THREE.PointLight(0xffc27a, 0, 16, 1.3);
    l.position.set(x, 4.2, z);
    scene.add(l);
    lotLights.push(l);
  }

  /* ---- The rows of trees for sale ---- */
  const standWood = new THREE.MeshStandardMaterial({ color: 0xb89a6a, roughness: 0.9 });
  const specimens = [];
  const rowZ = { fraser: -2.6, balsam: 0.4, douglas: 3.4 };
  SPECIES_KEYS.forEach(key => {
    const list = stock.filter(s => s.species === key);
    // a hand-painted plywood sign at the head of each row
    const signTex = canvasTexture(512, 256, (ctx, w, h) => {
      ctx.fillStyle = '#e8dcc0'; ctx.fillRect(0, 0, w, h);
      speckle(ctx, w, h, 4000, ['#8a7550', '#fff'], [1, 3], [0.08, 0.25], r);
      ctx.fillStyle = '#1d4a2a'; ctx.font = '700 62px Georgia, serif'; ctx.fillText(SPECIES[key].name, 26, 100);
      ctx.fillStyle = '#b3121f'; ctx.font = '700 54px Georgia, serif'; ctx.fillText(`$${SPECIES[key].pricePerFt} a foot`, 26, 190);
    });
    const sgn = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 0.03), [standWood, standWood, standWood, standWood, new THREE.MeshStandardMaterial({ map: signTex }), standWood]);
    sgn.position.set(-7.6, 1.5, rowZ[key]);
    sgn.rotation.y = 0.5;
    const stake = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), standWood); stake.position.set(-7.6, 0.6, rowZ[key]);
    scene.add(shadowy(sgn), shadowy(stake));
    list.forEach((spec, i) => {
      const t = buildTree(spec, { lod: 'card' });
      const holder = new THREE.Group();
      // 2x4 cross stand
      for (const rot of [0, Math.PI / 2]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.09, 0.04), standWood); b.rotation.y = rot; b.position.y = 0.045; holder.add(b); }
      holder.add(t.group);
      t.group.position.y = 0.06;
      t.group.rotation.z = spec.lean * Math.PI / 180;
      holder.position.set(-5.2 + i * 2.6 + (r() - 0.5) * 0.3, 0, rowZ[key] + (r() - 0.5) * 0.3);
      holder.rotation.y = r() * TAU;
      // price tag
      const tagTex = canvasTexture(128, 96, (ctx, w, h) => {
        ctx.fillStyle = '#ffd34a'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#222'; ctx.font = '700 22px sans-serif'; ctx.fillText(`#${spec.tag}`, 10, 30);
        ctx.font = '700 34px sans-serif'; ctx.fillText(`$${spec.price}`, 10, 76);
      });
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.09), new THREE.MeshStandardMaterial({ map: tagTex, side: THREE.DoubleSide }));
      tag.position.set(t.layout.profile(1.1) * 0.95, 1.1, 0);
      tag.rotation.y = Math.PI / 2;
      t.sway.add(tag);
      shadowy(holder);
      scene.add(holder);
      t.hull.userData.specimen = spec;
      specimens.push({ spec, tree: t, holder });
    });
  });

  /* ---- Sky and light ---- */
  scene.background = new THREE.Color();
  scene.fog = new THREE.Fog(0x9fb0c8, 30, 75);
  const hemi = new THREE.HemisphereLight(0xc8d8f0, 0x40382e, 0.8);
  const sun = new THREE.DirectionalLight(0xfff2dc, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, far: 80 });
  sun.shadow.bias = -0.0006;
  scene.add(hemi, sun, sun.target);

  const state = { dayness: 1, open: true };
  function setTime(ms) {
    const { alt, az } = sunPosition(ms);
    const day = smoothstep(-6, 8, alt);
    state.dayness = day;
    const a = alt * Math.PI / 180, z = az * Math.PI / 180;
    // lot faces south: −z is north (the trailer side)
    const dir = new THREE.Vector3(Math.sin(z) * Math.cos(a), Math.sin(a), -Math.cos(z) * Math.cos(a));
    sun.position.copy(dir).multiplyScalar(40);
    sun.intensity = smoothstep(-2, 6, alt) * lerp(0.8, 2.6, smoothstep(0, 30, alt));
    sun.color.setHSL(0.09, lerp(0.8, 0.25, smoothstep(0, 25, alt)), lerp(0.62, 0.93, smoothstep(0, 25, alt)));
    hemi.intensity = lerp(0.06, 0.9, day);
    const dusk = Math.max(0, 1 - Math.abs(alt - 1) / 9);
    const sky = new THREE.Color().setHSL(0.6, 0.45, lerp(0.03, 0.66, day));
    sky.lerp(new THREE.Color(0xe7a477), dusk * 0.45);
    scene.background.copy(sky);
    scene.fog.color.copy(sky);
    const p = localParts(ms);
    const [o, c] = lotHours(ms);
    state.open = p.hour >= o && p.hour < c;
    const lit = alt < 4;
    bulbs.forEach(b => { b.visible = lit; });
    lotLights.forEach(l => { l.intensity = lit ? 9 : 0; });
    glassM.emissiveIntensity = lit ? 0.8 : 0;
  }

  return { scene, specimens, setTime, state, ground };
}
