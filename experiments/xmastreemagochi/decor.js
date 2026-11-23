/* Stands and tree skirts. */
import * as THREE from 'three';
import { STANDS } from './decor-data.js';
import { canvasTexture, rng, TAU, speckle } from './util.js';

/* ---------- Stands ---------- */
export function buildStand(id) {
  const g = new THREE.Group();
  const S = STANDS[id];
  const water = new THREE.MeshStandardMaterial({ color: 0x6f8f9a, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.75 });
  let wellR = 0.12, wellBottom = 0.04, wellTop = S.mount;
  if (id === 'classic') {
    const red = new THREE.MeshStandardMaterial({ color: 0xb4191f, metalness: 0.5, roughness: 0.35 });
    const green = new THREE.MeshStandardMaterial({ color: 0x1d5a2b, metalness: 0.5, roughness: 0.4 });
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.13, 32, 1, true), red);
    bowl.material.side = THREE.DoubleSide;
    bowl.position.y = 0.1;
    const base = new THREE.Mesh(new THREE.CircleGeometry(0.13, 32), red); base.rotation.x = -Math.PI / 2; base.position.y = 0.035;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.007, 8, 32), red); rim.rotation.x = Math.PI / 2; rim.position.y = 0.165;
    g.add(bowl, base, rim);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.012, 0.04), green);
      leg.position.set(Math.cos(a) * 0.2, 0.02, Math.sin(a) * 0.2); leg.rotation.y = -a; leg.rotation.z = 0.12;
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.12, 6), new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 1, roughness: 0.3 }));
      bolt.rotation.z = Math.PI / 2; bolt.rotation.y = -a; bolt.position.set(Math.cos(a) * 0.13, 0.13, Math.sin(a) * 0.13);
      const eye = new THREE.Mesh(new THREE.TorusGeometry(0.015, 0.004, 6, 12), bolt.material);
      eye.rotation.y = -a + Math.PI / 2; eye.position.set(Math.cos(a) * 0.2, 0.13, Math.sin(a) * 0.2);
      g.add(leg, bolt, eye);
    }
    wellR = 0.14; wellBottom = 0.04; wellTop = 0.16;
  } else if (id === 'heirloom') {
    const iron = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, metalness: 0.7, roughness: 0.55 });
    const cup = new THREE.Mesh(new THREE.LatheGeometry([[0.06, 0.05], [0.11, 0.07], [0.13, 0.14], [0.135, 0.2], [0.125, 0.2]].map(([x, y]) => new THREE.Vector2(x, y)), 28), iron);
    cup.material.side = THREE.DoubleSide;
    g.add(cup);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.1, 0.1, 0), new THREE.Vector3(0.2, 0.06, 0), new THREE.Vector3(0.3, 0.02, 0), new THREE.Vector3(0.34, 0.03, 0), new THREE.Vector3(0.33, 0.06, 0), new THREE.Vector3(0.3, 0.05, 0)]);
      const leg = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.012, 6), iron);
      leg.rotation.y = a;
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), iron); foot.position.set(Math.cos(-a) * 0.31, 0.015, Math.sin(-a) * 0.31);
      g.add(leg, foot);
    }
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.008, 6, 28), new THREE.MeshStandardMaterial({ color: 0x8a6a2a, metalness: 1, roughness: 0.4 }));
    band.rotation.x = Math.PI / 2; band.position.y = 0.2;
    g.add(band);
    wellR = 0.12; wellBottom = 0.07; wellTop = 0.19;
  } else if (id === 'reservoir') {
    const plastic = new THREE.MeshStandardMaterial({ color: 0x1f5a34, roughness: 0.45 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.27, 0.19, 36, 1, true), plastic);
    body.material.side = THREE.DoubleSide;
    body.position.y = 0.105;
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.012, 8, 36), plastic); lip.rotation.x = Math.PI / 2; lip.position.y = 0.2;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.26, 36), plastic); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.012;
    const gauge = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.12), new THREE.MeshStandardMaterial({ color: 0xd8efe6, roughness: 0.2, transparent: true, opacity: 0.7 }));
    gauge.position.set(0, 0.11, 0.252); gauge.rotation.x = -0.25;
    g.add(body, lip, floor, gauge);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 10), new THREE.MeshStandardMaterial({ color: 0xc8a030, roughness: 0.4 }));
      knob.rotation.z = Math.PI / 2; knob.rotation.y = -a; knob.position.set(Math.cos(a) * 0.235, 0.16, Math.sin(a) * 0.235);
      g.add(knob);
    }
    wellR = 0.21; wellBottom = 0.02; wellTop = 0.19;
  } else if (id === 'bucket') {
    const zinc = new THREE.MeshStandardMaterial({ color: 0xa9adb1, metalness: 0.85, roughness: 0.4, side: THREE.DoubleSide, map: galvanized() });
    const pail = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.3, 36, 1, true), zinc); pail.position.y = 0.15;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.16, 36), zinc); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.005;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.008, 6, 36), zinc); rim.rotation.x = Math.PI / 2; rim.position.y = 0.3;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.004, 4, 36, Math.PI), zinc); handle.position.y = 0.3; handle.rotation.y = 0.6; handle.rotation.x = -1.2;
    g.add(pail, floor, rim, handle);
    const stone = new THREE.MeshStandardMaterial({ color: 0x8f8a80, roughness: 0.8 });
    const r = rng(12);
    for (let i = 0; i < 18; i++) {
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(r.range(0.03, 0.05), 1), stone);
      const a = r() * TAU, d = r.range(0.06, 0.15);
      s.position.set(Math.cos(a) * d, 0.24 + r() * 0.03, Math.sin(a) * d); s.scale.y = 0.6;
      s.material = stone.clone(); s.material.color.offsetHSL(0, 0, r.range(-0.1, 0.1));
      g.add(s);
    }
    wellR = 0.18; wellBottom = 0.02; wellTop = 0.26;
  }
  const surface = new THREE.Mesh(new THREE.CircleGeometry(wellR, 32), water);
  surface.rotation.x = -Math.PI / 2;
  surface.name = 'water';
  g.add(surface);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const setLevel = f => { surface.visible = f > 0.01; surface.position.y = wellBottom + (wellTop - wellBottom) * f; };
  setLevel(0);
  return { group: g, setLevel, mount: S.mount, outer: id === 'reservoir' ? 0.28 : id === 'heirloom' ? 0.34 : id === 'bucket' ? 0.21 : 0.3, top: wellTop };
}

function galvanized() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#c9ccce'; ctx.fillRect(0, 0, w, h);
    const r = rng(4);
    for (let i = 0; i < 140; i++) {
      ctx.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '90,95,100'},${r() * 0.18})`;
      ctx.beginPath();
      const x = r() * w, y = r() * h, s = 6 + r() * 18;
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + r(); ctx.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s); }
      ctx.fill();
    }
  }, { repeat: [3, 1] });
}

/* ---------- Skirts ---------- */
const SK_R = 0.78;
const skirtTexCache = new Map();
function skirtTexture(id) {
  if (!skirtTexCache.has(id)) skirtTexCache.set(id, paintSkirt(id));
  return skirtTexCache.get(id);
}
function paintSkirt(id) {
  const S = 1024;
  return canvasTexture(S, S, (ctx, w, h) => {
    const r = rng(id.length * 131);
    const cx = w / 2, cy = h / 2;
    const plaid = (bg, bands) => {
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      for (const [color, pos, width, alpha] of bands) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        for (let k = 0; k < w; k += 128) { ctx.fillRect(k + pos, 0, width, h); ctx.fillRect(0, k + pos, w, width); }
      }
      ctx.globalAlpha = 1;
    };
    switch (id) {
      case 'buffalo': {
        ctx.fillStyle = '#b3121b'; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) {
          const a = i % 2, b = j % 2;
          if (a && b) { ctx.fillStyle = '#111'; ctx.fillRect(i * 64, j * 64, 64, 64); }
          else if (a || b) { ctx.fillStyle = 'rgba(20,10,10,.55)'; ctx.fillRect(i * 64, j * 64, 64, 64); }
        }
        break;
      }
      case 'stewart': plaid('#c3141e', [['#0f2a5c', 10, 34, 0.9], ['#0d4d2a', 60, 24, 0.85], ['#111', 52, 6, 0.9], ['#f2d64a', 96, 3, 1], ['#fff', 108, 3, 0.9]]); break;
      case 'gingham': {
        ctx.fillStyle = '#f5f1e8'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(28,96,52,.55)';
        for (let k = 0; k < w; k += 48) { ctx.fillRect(k, 0, 24, h); ctx.fillRect(0, k, w, 24); }
        break;
      }
      case 'fairisle': {
        ctx.fillStyle = '#8f1a1f'; ctx.fillRect(0, 0, w, h);
        for (let ring = 0; ring < 9; ring++) {
          const rr = 60 + ring * 52;
          const col = ring % 3 === 0 ? '#f4ecdc' : ring % 3 === 1 ? '#1d3b2a' : '#f4ecdc';
          const n = 24 + ring * 10;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU;
            ctx.save(); ctx.translate(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); ctx.rotate(a);
            ctx.fillStyle = col;
            if (ring % 3 === 1) { ctx.fillRect(-8, -8, 16, 16); ctx.fillStyle = '#f4ecdc'; ctx.fillRect(-3, -3, 6, 6); }
            else { ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(8, 0); ctx.lineTo(0, 12); ctx.lineTo(-8, 0); ctx.fill(); }
            ctx.restore();
          }
        }
        speckle(ctx, w, h, 9000, ['#000', '#fff'], [1, 3], [0.03, 0.08], r);
        break;
      }
      case 'velvet': {
        const g = ctx.createRadialGradient(cx, cy, 50, cx, cy, w / 2);
        g.addColorStop(0, '#5b0a16'); g.addColorStop(0.6, '#7a1020'); g.addColorStop(1, '#4a0812');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#d6a945'; ctx.lineWidth = 18;
        ctx.beginPath(); ctx.arc(cx, cy, w * 0.47, 0, TAU); ctx.stroke();
        ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, w * 0.44, 0, TAU); ctx.stroke();
        speckle(ctx, w, h, 20000, ['#000', '#c04050'], [1, 2], [0.04, 0.1], r);
        break;
      }
      case 'patchwork': {
        const cols = ['#9b2b2b', '#2f5d3a', '#c9a24a', '#e9e0cc', '#3a4f7a', '#8a5a3a'];
        for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
          ctx.fillStyle = cols[Math.floor(r() * cols.length)]; ctx.fillRect(i * 128, j * 128, 128, 128);
          ctx.fillStyle = 'rgba(255,255,255,.25)';
          if (r() < 0.5) for (let k = 0; k < 4; k++) for (let l = 0; l < 4; l++) { ctx.beginPath(); ctx.arc(i * 128 + 16 + k * 32, j * 128 + 16 + l * 32, 5, 0, TAU); ctx.fill(); }
          ctx.strokeStyle = 'rgba(255,245,220,.8)'; ctx.setLineDash([8, 6]); ctx.lineWidth = 3; ctx.strokeRect(i * 128 + 6, j * 128 + 6, 116, 116); ctx.setLineDash([]);
        }
        break;
      }
      case 'burlap': {
        ctx.fillStyle = '#a88a5c'; ctx.fillRect(0, 0, w, h);
        for (let k = 0; k < w; k += 6) { ctx.fillStyle = `rgba(70,50,25,${0.12 + r() * 0.2})`; ctx.fillRect(k, 0, 2, h); ctx.fillRect(0, k, w, 2); }
        ctx.strokeStyle = '#f7f2e8'; ctx.lineWidth = 3;
        for (let i = 0; i < 90; i++) {
          const a = (i / 90) * TAU;
          ctx.beginPath(); ctx.arc(cx + Math.cos(a) * w * 0.455, cy + Math.sin(a) * w * 0.455, 18, 0, TAU); ctx.stroke();
          ctx.beginPath(); ctx.arc(cx + Math.cos(a) * w * 0.455, cy + Math.sin(a) * w * 0.455, 8, 0, TAU); ctx.stroke();
        }
        break;
      }
      case 'fur': {
        ctx.fillStyle = '#eeeae3'; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 60000; i++) {
          const x = r() * w, y = r() * h, a = r() * TAU;
          ctx.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,.5)' : 'rgba(170,160,150,.25)';
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9); ctx.stroke();
        }
        break;
      }
      case 'poinsettia': {
        ctx.fillStyle = '#f3ede1'; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 26; i++) {
          const x = r() * w, y = r() * h, s = 30 + r() * 26;
          for (let k = 0; k < 7; k++) {
            const a = (k / 7) * TAU + r();
            ctx.fillStyle = '#1f5a2c';
            ctx.beginPath(); ctx.ellipse(x + Math.cos(a + 0.4) * s * 1.3, y + Math.sin(a + 0.4) * s * 1.3, s * 0.7, s * 0.25, a + 0.4, 0, TAU); ctx.fill();
          }
          for (let k = 0; k < 7; k++) {
            const a = (k / 7) * TAU;
            ctx.fillStyle = k % 2 ? '#b8141e' : '#d42029';
            ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * s * 0.8, y + Math.sin(a) * s * 0.8, s * 0.8, s * 0.3, a, 0, TAU); ctx.fill();
          }
          ctx.fillStyle = '#e8c13a';
          for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc(x + (r() - 0.5) * 12, y + (r() - 0.5) * 12, 4, 0, TAU); ctx.fill(); }
        }
        break;
      }
      case 'snowflake': {
        ctx.fillStyle = '#1b2a4a'; ctx.fillRect(0, 0, w, h);
        speckle(ctx, w, h, 15000, ['#000', '#4a5a7a'], [1, 3], [0.05, 0.12], r);
        ctx.strokeStyle = '#f2f4f8'; ctx.lineWidth = 5; ctx.lineCap = 'round';
        for (let i = 0; i < 30; i++) {
          const x = r() * w, y = r() * h, s = 22 + r() * 30;
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * TAU;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s); ctx.stroke();
            const mx = x + Math.cos(a) * s * 0.6, my = y + Math.sin(a) * s * 0.6;
            for (const sg of [-1, 1]) { ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(a + sg * 0.8) * s * 0.3, my + Math.sin(a + sg * 0.8) * s * 0.3); ctx.stroke(); }
          }
        }
        break;
      }
      case 'candy': {
        for (let i = 0; i < 48; i++) {
          ctx.fillStyle = i % 2 ? '#f7f3ec' : '#c9161f';
          ctx.beginPath(); ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, w, (i / 48) * TAU, ((i + 1) / 48) * TAU); ctx.fill();
        }
        break;
      }
      case 'houndstooth': {
        ctx.fillStyle = '#efe9dc'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#1a1a1a';
        const u = 16;
        for (let i = 0; i < w / (u * 4); i++) for (let j = 0; j < h / (u * 4); j++) {
          const x = i * u * 4, y = j * u * 4;
          ctx.beginPath();
          ctx.moveTo(x, y); ctx.lineTo(x + u * 2, y); ctx.lineTo(x + u * 4, y + u * 2); ctx.lineTo(x + u * 4, y + u * 4);
          ctx.lineTo(x + u * 2, y + u * 2); ctx.lineTo(x + u * 2, y + u * 4); ctx.lineTo(x, y + u * 2); ctx.closePath(); ctx.fill();
        }
        break;
      }
      case 'scandi': {
        ctx.fillStyle = '#a8141c'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#f6efe2';
        for (const [rr, n, s] of [[0.42, 40, 16], [0.3, 28, 14], [0.18, 16, 12]]) {
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU;
            const x = cx + Math.cos(a) * w * rr, y = cy + Math.sin(a) * h * rr;
            ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.PI / 2);
            if (i % 2) { ctx.beginPath(); ctx.moveTo(0, s * 0.8); ctx.bezierCurveTo(-s * 1.4, -s * 0.2, -s * 0.5, -s * 1.2, 0, -s * 0.4); ctx.bezierCurveTo(s * 0.5, -s * 1.2, s * 1.4, -s * 0.2, 0, s * 0.8); ctx.fill(); }
            else { for (let k = 0; k < 8; k++) { ctx.rotate(Math.PI / 4); ctx.fillRect(-2, 0, 4, s); } }
            ctx.restore();
          }
        }
        ctx.strokeStyle = '#f6efe2'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy, w * 0.48, 0, TAU); ctx.stroke();
        break;
      }
    }
  });
}

/* Height of the skirt's draped surface at radius d (0 at the centre) */
export function skirtHeight(d, standTop, outerStand) {
  if (d > SK_R) return 0;
  const inner = Math.max(0.05, outerStand * 0.55);
  if (d < inner) return standTop + 0.01;
  const t = (d - inner) / (SK_R - inner);
  return (standTop + 0.01) * Math.pow(1 - t, 2.2) + 0.004;
}

export function buildSkirt(id, stand) {
  if (id === 'none') return null;
  const geo = new THREE.RingGeometry(0.06, SK_R, 96, 18);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const d = Math.hypot(x, z), a = Math.atan2(z, x);
    const fold = Math.sin(a * 11) * 0.012 * Math.min(1, d / 0.5) + Math.sin(a * 5 + 1) * 0.006;
    const y = skirtHeight(d, stand.top, stand.outer) + Math.max(0, fold) * (d / SK_R);
    p.setY(i, y);
    uv.setXY(i, 0.5 + x / (SK_R * 2), 0.5 - z / (SK_R * 2));
  }
  geo.computeVertexNormals();
  const fur = id === 'fur', velvet = id === 'velvet';
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: skirtTexture(id), roughness: fur ? 1 : velvet ? 0.55 : 0.9, side: THREE.DoubleSide,
  }));
  m.receiveShadow = true;
  m.castShadow = true;
  m.name = 'skirt';
  return m;
}

/* small swatch for the picker */
export function skirtSwatch(id) {
  if (id === 'none') return null;
  return skirtTexture(id).image.toDataURL('image/jpeg', 0.7);
}
