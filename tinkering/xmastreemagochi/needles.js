/* Needles in the air and needles on the floor. */
import * as THREE from 'three';
import { rng, TAU } from './util.js';

function needleGeometry() {
  const g = new THREE.BoxGeometry(0.022, 0.0012, 0.0016);
  return g;
}

export class FallingNeedles {
  constructor(scene, max = 700) {
    this.mesh = new THREE.InstancedMesh(needleGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.7 }), max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    scene.add(this.mesh);
    this.parts = [];
    this.max = max;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
  }
  /* pos in world; color THREE.Color; groundAt(x,z) → floor height */
  spawn(pos, color, vel = null) {
    if (this.parts.length >= this.max) this.parts.shift();
    this.parts.push({
      p: pos.clone(), v: vel ? vel.clone() : new THREE.Vector3((Math.random() - 0.5) * 0.3, Math.random() * 0.2, (Math.random() - 0.5) * 0.3),
      rot: new THREE.Vector3(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU),
      spin: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14),
      c: color.clone(), landed: false, life: 0,
    });
  }
  update(dt, groundAt, onLand) {
    const keep = [];
    for (const n of this.parts) {
      n.life += dt;
      if (!n.landed) {
        n.v.y -= 2.2 * dt;               // needles flutter: low terminal speed
        n.v.multiplyScalar(1 - 2.4 * dt);
        n.p.addScaledVector(n.v, dt);
        n.p.x += Math.sin(n.life * 9 + n.rot.x) * 0.06 * dt;
        n.rot.addScaledVector(n.spin, dt);
        const g = groundAt(n.p.x, n.p.z);
        if (n.p.y <= g) {
          n.p.y = g;
          n.landed = true;
          if (onLand && onLand(n)) continue;
        }
      }
      if (n.landed && n.life > 6) continue;
      keep.push(n);
    }
    this.parts = keep;
    const mesh = this.mesh;
    keep.forEach((n, i) => {
      this.e.set(n.landed ? 0 : n.rot.x, n.rot.y, n.landed ? 0 : n.rot.z);
      this.q.setFromEuler(this.e);
      this.m.compose(n.p, this.q, new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(i, this.m);
      mesh.setColorAt(i, n.c);
    });
    mesh.count = keep.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  clear() { this.parts = []; this.mesh.count = 0; }
}

/* Needles lying around the base of the tree. Positions are scattered fresh each load;
   only the count is saved. */
export class FloorNeedles {
  constructor(parent, heightAt, max = 9000) {
    this.max = max;
    this.heightAt = heightAt;
    this.mesh = new THREE.InstancedMesh(needleGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.8 }), max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    parent.add(this.mesh);
    this.pts = [];
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.r = rng(Date.now() % 100000);
  }
  color(dry) {
    const r = this.r;
    const brown = r() < 0.35 + dry * 0.5;
    return brown ? new THREE.Color().setHSL(0.08 + r() * 0.04, 0.45, 0.22 + r() * 0.12) : new THREE.Color().setHSL(0.3 + r() * 0.05, 0.4, 0.12 + r() * 0.08);
  }
  scatterPoint(spread) {
    const r = this.r;
    const a = r() * TAU;
    const d = 0.1 + Math.abs(r.norm()) * spread;
    return new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d);
  }
  /* local (tree-base) coordinates */
  add(local, color) {
    if (this.pts.length >= this.max) return;
    local.y = this.heightAt(local.x, local.z) + 0.0015;
    this.pts.push({ p: local, a: this.r() * TAU, c: color });
    this.write(this.pts.length - 1);
    this.mesh.count = this.pts.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
  write(i) {
    const n = this.pts[i];
    this.q.setFromEuler(new THREE.Euler(0, n.a, 0));
    this.m.compose(n.p, this.q, new THREE.Vector3(1, 1, 1));
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.setColorAt(i, n.c);
  }
  setCount(n, spread, dry) {
    this.pts = [];
    n = Math.min(n, this.max);
    for (let i = 0; i < n; i++) {
      const p = this.scatterPoint(spread);
      p.y = this.heightAt(p.x, p.z) + 0.0015;
      this.pts.push({ p, a: this.r() * TAU, c: this.color(dry) });
    }
    this.rewrite();
  }
  rewrite() {
    this.pts.forEach((_, i) => this.write(i));
    this.mesh.count = this.pts.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  /* re-seat needles after the skirt changes */
  reseat() { for (const n of this.pts) n.p.y = this.heightAt(n.p.x, n.p.z) + 0.0015; this.rewrite(); }
  /* sweep within radius of local point; returns how many were picked up */
  sweep(local, radius, pull = null) {
    const before = this.pts.length;
    const r2 = radius * radius;
    this.pts = this.pts.filter(n => {
      const dx = n.p.x - local.x, dz = n.p.z - local.z;
      return dx * dx + dz * dz > r2;
    });
    const removed = before - this.pts.length;
    if (removed) this.rewrite();
    return removed;
  }
  get count() { return this.pts.length; }
}
