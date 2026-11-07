/* The effects gallery. An effect hangs off one domino and fires when that domino is hit or
   when it comes to rest. Every effect is drawn as a pure function of time since it fired,
   with its randomness seeded, so scrubbing backward and forward shows the same thing. */
import * as THREE from 'three';
import { PARAMS } from './params.js';

export const EFFECTS = [
  { id: 'sparks', name: 'Sparks', note: 'A shower of sparks as it’s hit.', when: 'hit', color: '#ffb347' },
  { id: 'glow', name: 'Light up', note: 'Glows in its own colour once it’s hit, and stays lit.', when: 'hit', color: '#ffe08a' },
  { id: 'trail', name: 'Light trail', note: 'Its top edge paints a ribbon of light as it falls.', when: 'hit', color: '#7fd4ff' },
  { id: 'chime', name: 'Chime', note: 'Rings a note. Several in a row climb a scale.', when: 'hit', color: '#b9a4ff' },
  { id: 'slowmo', name: 'Slow motion', note: 'Time slows down around this domino.', when: 'hit', color: '#9fe3c4' },
  { id: 'spotlight', name: 'Spotlight', note: 'The room dims and a light finds this domino.', when: 'hit', color: '#fff4d6' },
  { id: 'confetti', name: 'Confetti', note: 'Bursts into confetti when it lands.', when: 'rest', color: '#ff6fae' },
  { id: 'dust', name: 'Dust puff', note: 'A ring of dust where it lands.', when: 'rest', color: '#d9cbb4' },
  { id: 'fireworks', name: 'Fireworks', note: 'Launches a firework when it lands. Best at the very end.', when: 'rest', color: '#ff5d5d' },
];
export const effectById = Object.fromEntries(EFFECTS.map(e => [e.id, e]));

const LIFE = { sparks: 1.0, glow: Infinity, trail: Infinity, chime: 0.9, slowmo: 0, spotlight: 2.6, confetti: 4, dust: 1.5, fireworks: 2.8 };

function seeded(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => ((s = (s ^ (s << 13)) >>> 0, s = (s ^ (s >>> 17)) >>> 0, s = (s ^ (s << 5)) >>> 0) / 4294967296);
}

let spriteTex = null;
function sprite() {
  if (spriteTex) return spriteTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  spriteTex = new THREE.CanvasTexture(c);
  return spriteTex;
}

const tmp = new Float64Array(7);
const q = new THREE.Quaternion(), v = new THREE.Vector3(), v2 = new THREE.Vector3();

export class EffectLayer {
  constructor(scene, sound) {
    this.scene = scene;
    this.sound = sound;
    this.root = new THREE.Group();
    this.root.name = 'effects';
    scene.add(this.root);
    this.items = [];
    this.run = null;
    this.dimLevel = 0;
  }

  /* one item per (domino, effect) */
  setRun(run, layout, viewOf) {
    this.clear();
    this.run = run;
    this.viewOf = viewOf;
    if (!run) return;
    let chimeStep = 0;
    const hasChime = [];
    layout.dominoes.forEach((d, i) => {
      for (const id of d.effects ?? []) {
        if (!effectById[id]) continue;
        const item = { id, i, d, seed: d.id * 31 + id.length * 7, obj: null, fired: false };
        if (id === 'chime') hasChime.push(item);
        this.items.push(item);
      }
    });
    // chimes climb in the order they'll be hit; until the run gets there, order of placement
    hasChime.sort((a, b) => a.d.seq - b.d.seq).forEach(it => { it.step = chimeStep++; });
  }

  clear() {
    for (const it of this.items) this.drop(it);
    this.items = [];
    this.run = null;
    this.dimLevel = 0;
  }

  drop(it) {
    if (it.obj) {
      this.root.remove(it.obj);
      it.obj.traverse(o => { o.geometry?.dispose(); if (o.material && o.material !== it.shared) o.material.dispose?.(); });
      it.obj = null;
    }
    if (it.id === 'glow' && it.saved) {
      const view = this.viewOf(it.d.id);
      if (view) { view.mesh.material = it.saved; view.glow = null; }
      it.glowMat?.dispose?.();
      it.saved = null;
    }
  }

  trigger(it) {
    const r = this.run;
    return effectById[it.id].when === 'hit' ? r.hit[it.i] : r.rest[it.i];
  }

  /* playback speed multiplier from any slow-motion effects active at t */
  timeScale(t) {
    if (!this.run) return 1;
    let s = 1;
    const len = PARAMS.slowLength * PARAMS.effectScale, f = PARAMS.slowFactor;
    for (const it of this.items) {
      if (it.id !== 'slowmo') continue;
      const t0 = this.trigger(it);
      if (t0 === Infinity) continue;
      const a = t - t0 + 0.15;
      if (a < 0 || a > len) continue;
      const ramp = Math.min(1, a / 0.2, (len - a) / 0.4);
      s = Math.min(s, 1 + (f - 1) * Math.max(0, ramp));
    }
    return s;
  }

  slowActive(t) { return this.timeScale(t) < 0.98; }

  /* when the last effect that has fired so far finishes */
  endTime() {
    if (!this.run) return 0;
    let end = 0;
    for (const it of this.items) {
      const t0 = this.trigger(it);
      if (t0 === Infinity) continue;
      const life = it.id === 'slowmo' ? PARAMS.slowLength : it.id === 'trail' ? PARAMS.trailLength : LIFE[it.id];
      if (life === Infinity) continue;
      end = Math.max(end, t0 + life * PARAMS.effectScale + 0.2);
    }
    return end;
  }

  /* t: playhead; prev: last frame's playhead (fires sounds when crossing forward) */
  update(t, prev, playing, panOf, camera) {
    if (!this.run) { this.dimLevel = 0; return; }
    const forward = playing && t > prev && t - prev < 0.3;
    let dim = 0;
    for (const it of this.items) {
      const t0 = this.trigger(it);
      const life = LIFE[it.id] * (LIFE[it.id] === Infinity ? 1 : PARAMS.effectScale);
      const local = t - t0;
      const live = t0 !== Infinity && local >= 0 && local <= life;
      if (forward && t0 !== Infinity && prev < t0 && t >= t0) this.sounds(it, panOf);
      if (!live) { if (it.obj) it.obj.visible = false; if (it.id === 'glow') this.glow(it, -1); continue; }
      switch (it.id) {
        case 'sparks': this.sparks(it, local, t0); break;
        case 'glow': this.glow(it, local); break;
        case 'trail': this.trail(it, t, t0); break;
        case 'chime': this.ring(it, local, t0, '#b9a4ff', 0.9); break;
        case 'spotlight': dim = Math.max(dim, this.spot(it, local, t0, t)); break;
        case 'confetti': this.confetti(it, local, t0); break;
        case 'dust': this.dust(it, local, t0); break;
        case 'fireworks': this.fireworks(it, local, t0, forward && prev - t0 < 0.9 && local >= 0.9, panOf); break;
      }
    }
    this.dimLevel = dim;
  }

  sounds(it, panOf) {
    const pan = panOf ? panOf(it.d) : 0;
    if (it.id === 'chime') this.sound.chime(it.step ?? 0, pan);
    else if (it.id === 'confetti') this.sound.pop(pan, false);
    else if (it.id === 'fireworks') this.sound.whoosh(pan, true);
    else if (it.id === 'slowmo') this.sound.whoosh(pan, false);
    else if (it.id === 'sparks') this.sound.crackle(pan, 6);
  }

  top(i, t) {
    const p = this.run.pose(i, t, tmp);
    q.set(p[3], p[4], p[5], p[6]);
    v.set(0, this.run.half[i], 0).applyQuaternion(q);
    return new THREE.Vector3(p[0] + v.x, p[1] + v.y, p[2] + v.z);
  }

  points(it, n, size, color, additive = true) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const mat = new THREE.PointsMaterial({
      size, map: sprite(), vertexColors: true, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, color: color ?? '#ffffff',
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.root.add(pts);
    return pts;
  }

  sparks(it, l, t0) {
    const h = it.d.h, n = 70;
    if (!it.obj) {
      it.obj = this.points(it, n, h * 0.09);
      const r = seeded(it.seed);
      it.p0 = this.top(it.i, t0);
      it.vel = Array.from({ length: n }, () => {
        const a = r() * Math.PI * 2, up = 0.4 + r() * 0.9, out = 0.3 + r() * 0.9;
        return [Math.cos(a) * out, up, Math.sin(a) * out].map(x => x * Math.sqrt(h / 0.048) * 1.1);
      });
      it.life = Array.from({ length: n }, () => 0.35 + r() * 0.65);
    }
    const pos = it.obj.geometry.attributes.position, col = it.obj.geometry.attributes.color;
    const floorY = it.d.y + 0.001;
    for (let k = 0; k < n; k++) {
      const [vx, vy, vz] = it.vel[k];
      const y = Math.max(floorY, it.p0.y + vy * l - 4.9 * l * l);
      pos.setXYZ(k, it.p0.x + vx * l, y, it.p0.z + vz * l);
      const a = Math.max(0, 1 - l / (it.life[k] * PARAMS.effectScale));
      col.setXYZ(k, a * 1.0, a * a * 0.75, a * a * a * 0.35);
    }
    pos.needsUpdate = col.needsUpdate = true;
    it.obj.visible = true;
  }

  glow(it, l) {
    const view = this.viewOf(it.d.id);
    if (!view) return;
    if (l < 0) {
      if (it.saved) { view.mesh.material = it.saved; view.glow = null; }
      return;
    }
    if (!it.glowMat) {
      const base = Array.isArray(view.mesh.material) ? view.mesh.material[0] : view.mesh.material;
      it.glowMat = base.clone();
      it.glowMat.emissive = new THREE.Color(it.d.color).lerp(new THREE.Color('#ffffff'), 0.25);
    }
    if (view.mesh.material !== it.glowMat) { it.saved = view.mesh.material; view.mesh.material = it.glowMat; view.glow = it; }
    it.glowMat.emissiveIntensity = 0.6 + 2.4 * Math.exp(-l * 2.2);
  }

  trail(it, t, t0) {
    const n = 48;
    if (!it.obj) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
      const idx = [];
      for (let k = 0; k < n - 1; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      geo.setIndex(idx);
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      it.obj = new THREE.Mesh(geo, mat);
      it.obj.frustumCulled = false;
      it.color = new THREE.Color(it.d.color).lerp(new THREE.Color('#ffffff'), 0.35);
      this.root.add(it.obj);
    }
    const len = PARAMS.trailLength * PARAMS.effectScale;
    const a0 = Math.max(t0, t - len);
    const pos = it.obj.geometry.attributes.position, col = it.obj.geometry.attributes.color;
    const hw = it.d.h * PARAMS.widthRatio / 2, hh = this.run.half[it.i];
    for (let k = 0; k < n; k++) {
      const s = a0 + (t - a0) * k / (n - 1);
      const p = this.run.pose(it.i, s, tmp);
      q.set(p[3], p[4], p[5], p[6]);
      for (const side of [0, 1]) {
        v.set(side ? hw : -hw, hh, 0).applyQuaternion(q);
        pos.setXYZ(k * 2 + side, p[0] + v.x, p[1] + v.y, p[2] + v.z);
        const fade = k / (n - 1);
        const age = (t - s) / len;
        const a = fade * fade * Math.max(0, 1 - age) * 0.9;
        col.setXYZ(k * 2 + side, it.color.r * a, it.color.g * a, it.color.b * a);
      }
    }
    pos.needsUpdate = col.needsUpdate = true;
    it.obj.visible = true;
  }

  ring(it, l, t0, color, life) {
    if (!it.obj) {
      const geo = new THREE.RingGeometry(0.85, 1, 48);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      it.obj = new THREE.Mesh(geo, mat);
      const p = this.run.pose(it.i, t0, tmp);
      it.obj.position.set(p[0], it.d.y + 0.002, p[2]);
      this.root.add(it.obj);
    }
    const k = l / (life * PARAMS.effectScale);
    it.obj.scale.setScalar(it.d.h * (0.4 + k * 2.4));
    it.obj.material.opacity = Math.max(0, 1 - k) * 0.8;
    it.obj.visible = true;
  }

  spot(it, l, t0, t) {
    const life = LIFE.spotlight * PARAMS.effectScale;
    const env = Math.min(1, l / 0.35, (life - l) / 0.6);
    if (!it.obj) {
      const light = new THREE.SpotLight('#fff4d6', 0, 6, 0.22, 0.6, 1.2);
      light.castShadow = false;
      it.obj = new THREE.Group();
      it.obj.add(light, light.target);
      it.light = light;
      this.root.add(it.obj);
    }
    const p = this.run.pose(it.i, t, tmp);
    it.light.position.set(p[0] + 0.3, p[1] + 1.8, p[2] + 0.4);
    it.light.target.position.set(p[0], p[1], p[2]);
    it.light.angle = THREE.MathUtils.clamp(it.d.h * 1.6, 0.06, 0.5);
    it.light.intensity = 60 * Math.max(0, env);
    it.obj.visible = true;
    return Math.max(0, env);
  }

  confetti(it, l, t0) {
    const n = 90, h = it.d.h;
    if (!it.obj) {
      const s = Math.max(0.006, h * 0.12);
      const geo = new THREE.PlaneGeometry(s, s * 0.6);
      const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.5, transparent: true });
      it.obj = new THREE.InstancedMesh(geo, mat, n);
      it.obj.frustumCulled = false;
      const r = seeded(it.seed);
      const pal = ['#ff5d8f', '#ffd24a', '#5ad1ff', '#7be07b', '#b48bff', '#ff8a3d', '#ffffff'];
      it.data = Array.from({ length: n }, (_, k) => {
        it.obj.setColorAt(k, new THREE.Color(pal[Math.floor(r() * pal.length)]));
        const a = r() * Math.PI * 2, out = 0.4 + r() * 1.3, up = 1.6 + r() * 1.8;
        const sc = Math.sqrt(h / 0.048) * 0.9;
        return { v: [Math.cos(a) * out * sc, up * sc, Math.sin(a) * out * sc], spin: [r() * 14 - 7, r() * 14 - 7, r() * 14 - 7], ph: r() * 6 };
      });
      it.p0 = this.top(it.i, t0);
      this.root.add(it.obj);
    }
    const tau = 0.32, vt = -0.45 * Math.sqrt(h / 0.048);
    const m = new THREE.Matrix4(), e = new THREE.Euler(), sc = new THREE.Vector3(1, 1, 1);
    const ex = 1 - Math.exp(-l / tau);
    const floorY = it.d.y + 0.001;
    for (let k = 0; k < n; k++) {
      const d = it.data[k];
      const x = it.p0.x + d.v[0] * tau * ex + Math.sin(l * 3 + d.ph) * 0.01;
      let y = it.p0.y + vt * l + (d.v[1] - vt) * tau * ex;
      const z = it.p0.z + d.v[2] * tau * ex + Math.cos(l * 3 + d.ph) * 0.01;
      const landed = y <= floorY;
      y = Math.max(floorY, y);
      if (landed) e.set(-Math.PI / 2, 0, d.ph); else e.set(d.spin[0] * l, d.spin[1] * l, d.spin[2] * l);
      m.compose(v2.set(x, y, z), q.setFromEuler(e), sc);
      it.obj.setMatrixAt(k, m);
    }
    it.obj.instanceMatrix.needsUpdate = true;
    if (it.obj.instanceColor) it.obj.instanceColor.needsUpdate = true;
    const life = LIFE.confetti * PARAMS.effectScale;
    it.obj.material.opacity = Math.min(1, (life - l) / 0.6);
    it.obj.visible = true;
  }

  dust(it, l, t0) {
    const n = 28, h = it.d.h;
    if (!it.obj) {
      it.obj = this.points(it, n, h * 0.7, '#ffffff', false);
      it.obj.material.color.set('#cbbda5');
      const r = seeded(it.seed);
      const p = this.run.pose(it.i, t0, tmp);
      it.p0 = new THREE.Vector3(p[0], it.d.y + h * 0.05, p[2]);
      it.dir = Array.from({ length: n }, (_, k) => { const a = k / n * Math.PI * 2 + r() * 0.3; return [Math.cos(a), Math.sin(a), 0.6 + r() * 0.6]; });
    }
    const life = LIFE.dust * PARAMS.effectScale;
    const k = l / life;
    const pos = it.obj.geometry.attributes.position, col = it.obj.geometry.attributes.color;
    const reach = h * 1.4 * (1 - Math.exp(-l * 4));
    for (let j = 0; j < n; j++) {
      const [cx, cz, s] = it.dir[j];
      pos.setXYZ(j, it.p0.x + cx * reach * s, it.p0.y + h * 0.25 * k * s, it.p0.z + cz * reach * s);
      const a = 0.55 * (1 - k);
      col.setXYZ(j, a, a, a);
    }
    pos.needsUpdate = col.needsUpdate = true;
    it.obj.material.opacity = 1 - k;
    it.obj.visible = true;
  }

  fireworks(it, l, t0, burstNow, panOf) {
    const n = 170, climb = 0.9;
    if (!it.obj) {
      it.obj = this.points(it, n + 12, 0.035);
      const r = seeded(it.seed);
      const p = this.run.pose(it.i, t0, tmp);
      it.p0 = new THREE.Vector3(p[0], it.d.y, p[2]);
      it.apex = new THREE.Vector3(p[0] + (r() - 0.5) * 0.2, Math.min(it.d.y + 1.5, 2.2), p[2] + (r() - 0.5) * 0.2);
      const pal = [[1, 0.35, 0.35], [1, 0.85, 0.35], [0.45, 0.8, 1], [0.6, 1, 0.55], [0.85, 0.55, 1]];
      const c1 = pal[Math.floor(r() * pal.length)], c2 = pal[Math.floor(r() * pal.length)];
      it.stars = Array.from({ length: n }, () => {
        const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u), sp = 1.6 + r() * 0.5;
        return { v: [s * Math.cos(a) * sp, u * sp, s * Math.sin(a) * sp], c: r() < 0.5 ? c1 : c2, life: 1.2 + r() * 0.7 };
      });
    }
    if (burstNow) { const pan = panOf ? panOf(it.d) : 0; this.sound.pop(pan, true); this.sound.crackle(pan, 18); }
    const pos = it.obj.geometry.attributes.position, col = it.obj.geometry.attributes.color;
    if (l < climb) {
      const k = l / climb, e = 1 - (1 - k) * (1 - k);
      for (let j = 0; j < 12; j++) {
        const back = Math.max(0, e - j * 0.025);
        pos.setXYZ(n + j, it.p0.x + (it.apex.x - it.p0.x) * back, it.p0.y + (it.apex.y - it.p0.y) * back, it.p0.z + (it.apex.z - it.p0.z) * back);
        const a = (1 - j / 12) * 0.9;
        col.setXYZ(n + j, a, a * 0.8, a * 0.5);
      }
      for (let j = 0; j < n; j++) col.setXYZ(j, 0, 0, 0);
    } else {
      for (let j = 0; j < 12; j++) col.setXYZ(n + j, 0, 0, 0);
      const b = l - climb, tau = 0.5;
      const ex = 1 - Math.exp(-b / tau);
      for (let j = 0; j < n; j++) {
        const s = it.stars[j];
        pos.setXYZ(j, it.apex.x + s.v[0] * tau * ex, it.apex.y + s.v[1] * tau * ex - 0.6 * b * b, it.apex.z + s.v[2] * tau * ex);
        const a = Math.max(0, 1 - b / (s.life * PARAMS.effectScale));
        const flick = 0.75 + 0.25 * Math.sin(b * 40 + j);
        col.setXYZ(j, s.c[0] * a * flick, s.c[1] * a * flick, s.c[2] * a * flick);
      }
    }
    pos.needsUpdate = col.needsUpdate = true;
    it.obj.visible = true;
  }
}
