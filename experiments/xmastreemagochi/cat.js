/* The cat. Every so often it slinks out from behind the sofa, eyes the tree, wiggles,
   and jumps. Click the cat to scoop it up. Click the floor right in front of it to block it.
   Once it's climbing, it takes a few grabs to pull it off, and ornaments near it can fall. */
import * as THREE from 'three';
import { rng, lerp, clamp, TAU } from './util.js';

const COATS = [
  { name: 'orange tabby', body: 0xd2823a, belly: 0xf1d2a8, stripe: 0x9a5520 },
  { name: 'black cat', body: 0x161517, belly: 0x262428, stripe: 0x0c0c0d },
  { name: 'grey tabby', body: 0x7e7c78, belly: 0xc8c4bc, stripe: 0x4a4844 },
  { name: 'tuxedo', body: 0x1a1a1c, belly: 0xf2f0ea, stripe: 0x111 },
  { name: 'cream', body: 0xe9d5b5, belly: 0xf8efe2, stripe: 0xc9a982 },
];
export const CAT_NAMES = ['Pierogi', 'Biscuit', 'Mittens', 'Figgy', 'Tinsel', 'Clementine', 'Pepper', 'Gus', 'Noodle', 'Juniper'];

function buildCat(coat) {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: coat.body, roughness: 0.95 });
  const belly = new THREE.MeshStandardMaterial({ color: coat.belly, roughness: 0.95 });
  const body = new THREE.Group();
  g.add(body);
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.1, 18, 14), fur); torso.scale.set(2.1, 1.0, 1.05); torso.position.y = 0.2; body.add(torso);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), belly); chest.position.set(0.15, 0.19, 0); chest.scale.set(1, 1.1, 1); body.add(chest);
  const headG = new THREE.Group(); headG.position.set(0.24, 0.3, 0); body.add(headG);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 18, 14), fur); head.scale.set(1, 0.9, 1.05); headG.add(head);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), belly); muzzle.position.set(0.055, -0.018, 0); muzzle.scale.set(0.8, 0.7, 1.1); headG.add(muzzle);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd88a8a })); nose.position.set(0.085, -0.005, 0); headG.add(nose);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.06, 4), fur); ear.position.set(0.0, 0.065, s * 0.04); ear.rotation.x = s * 0.3; headG.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), new THREE.MeshStandardMaterial({ color: 0xc8d23a, emissive: 0x6a7a10, emissiveIntensity: 0.6, roughness: 0.1 }));
    eye.position.set(0.055, 0.015, s * 0.03); headG.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshBasicMaterial({ color: 0x000000 })); pupil.scale.set(0.5, 1.4, 1); pupil.position.set(0.065, 0.015, s * 0.031); headG.add(pupil);
  }
  // stripes
  if (coat.name.includes('tabby')) {
    const sm = new THREE.MeshStandardMaterial({ color: coat.stripe, roughness: 0.95 });
    for (let i = 0; i < 5; i++) { const st = new THREE.Mesh(new THREE.TorusGeometry(0.103, 0.01, 4, 16, Math.PI * 0.8), sm); st.rotation.set(0, Math.PI / 2, Math.PI * 0.1); st.position.set(-0.12 + i * 0.05, 0.2, 0); st.scale.set(1.05, 1.0, 1); body.add(st); }
  }
  const legs = [];
  for (const [x, z] of [[0.13, -0.05], [0.13, 0.05], [-0.13, -0.05], [-0.13, 0.05]]) {
    const hip = new THREE.Group(); hip.position.set(x, 0.17, z);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.12, 4, 8), fur); leg.position.y = -0.08; hip.add(leg);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), belly); paw.position.set(0.01, -0.155, 0); paw.scale.set(1.3, 0.6, 1); hip.add(paw);
    body.add(hip); legs.push(hip);
  }
  const tail = [];
  let parent = body;
  for (let i = 0; i < 7; i++) {
    const seg = new THREE.Group();
    seg.position.set(i === 0 ? -0.2 : -0.045, i === 0 ? 0.22 : 0, 0);
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.017 - i * 0.0012, 0.03, 3, 6), i === 6 && coat.name === 'tuxedo' ? belly : fur);
    m.rotation.z = Math.PI / 2; m.position.x = -0.022;
    seg.add(m); parent.add(seg); parent = seg; tail.push(seg);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  // an easy target to click
  const hit = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial());
  hit.visible = false; hit.position.y = 0.2; hit.name = 'cathit';
  g.add(hit);
  return { g, body, headG, legs, tail, hit };
}

export class Cat {
  constructor(scene, { treeAt, treeRadiusAt, treeHeight, start, onDislodge, onEnd, onSay }) {
    this.scene = scene;
    this.treeAt = treeAt; this.treeRadiusAt = treeRadiusAt; this.treeHeight = treeHeight;
    this.start = start; this.onDislodge = onDislodge; this.onEnd = onEnd; this.onSay = onSay;
    const r = rng(Date.now() % 1e6);
    this.coat = r.pick(COATS);
    this.name = r.pick(CAT_NAMES);
    this.m = buildCat(this.coat);
    this.m.g.position.copy(start);
    scene.add(this.m.g);
    this.state = 'enter';
    this.t = 0;
    this.grabs = 0;
    this.damage = 0;
    this.r = r;
    this.pos = start.clone();
    const tree = treeAt();
    // approach from the open side of the room
    const ang = Math.atan2(start.z - tree.z, start.x - tree.x) + r.range(-0.4, 0.4);
    this.stalkPoint = new THREE.Vector3(tree.x + Math.cos(ang) * 1.25, 0, tree.z + Math.sin(ang) * 1.25);
    this.crouchPoint = new THREE.Vector3(tree.x + Math.cos(ang) * 0.85, 0, tree.z + Math.sin(ang) * 0.85);
    this.ang = ang;
    this.pause = 0;
    this.climbY = 0;
    this.dislodgeT = 0;
    onSay(`${this.name} the ${this.coat.name} is eyeing the tree. Click the cat to scoop it up.`);
  }
  get hitObject() { return this.m.hit; }
  face(target, dt, k = 6) {
    const want = Math.atan2(-(target.z - this.pos.z), target.x - this.pos.x);
    let d = want - this.m.g.rotation.y;
    d = ((d + Math.PI) % TAU + TAU) % TAU - Math.PI;
    this.m.g.rotation.y += d * Math.min(1, dt * k);
  }
  walk(target, speed, dt) {
    const d = target.clone().sub(this.pos); d.y = 0;
    const dist = d.length();
    this.face(target, dt);
    if (dist < 0.02) return true;
    this.pos.addScaledVector(d.normalize(), Math.min(dist, speed * dt));
    this.gait += dt * speed * 28;
    return false;
  }
  click(kind) {
    if (['caught', 'flee', 'done', 'leap'].includes(this.state)) return;
    if (kind === 'block' && ['enter', 'stalk', 'crouch'].includes(this.state)) {
      this.onSay(`Blocked. ${this.name} flattens its ears and stalks off.`);
      this.finish('flee', true);
      return;
    }
    if (kind !== 'cat') return;
    if (this.state === 'climb') {
      this.grabs++;
      if (this.grabs >= 3) {
        this.onSay(`Got ${this.name} off the tree.`);
        this.finish('caught', this.damage === 0);
      } else {
        this.onSay(this.grabs === 1 ? `${this.name} is clinging on. Again!` : 'Almost…');
      }
      return;
    }
    this.onSay(`Scooped up ${this.name}. The tree is safe.`);
    this.finish('caught', true);
  }
  finish(state, saved) {
    this.state = state;
    this.t = 0;
    this.saved = saved;
    this.fromPos = this.pos.clone();
    this.fromRot = this.m.g.rotation.clone();
  }
  update(dt, time) {
    this.t += dt;
    this.gait = this.gait || 0;
    const tree = this.treeAt();
    const g = this.m.g;
    let moving = false;
    switch (this.state) {
      case 'enter': {
        if (this.pause > 0) { this.pause -= dt; this.face(tree, dt); break; }
        moving = !this.walk(this.stalkPoint, 0.55, dt);
        if (this.r() < dt * 0.4) this.pause = this.r.range(0.4, 1.2);
        if (!moving) { this.state = 'stalk'; this.t = 0; }
        break;
      }
      case 'stalk': {
        moving = !this.walk(this.crouchPoint, 0.18, dt);
        this.m.body.position.y = -0.04;
        if (!moving) { this.state = 'crouch'; this.t = 0; this.crouchFor = this.r.range(1.2, 2.2); }
        break;
      }
      case 'crouch': {
        this.face(tree, dt);
        this.m.body.position.y = -0.07;
        this.m.body.rotation.x = Math.sin(time * 18) * 0.08;   // the butt wiggle
        if (this.t > this.crouchFor) {
          this.state = 'leap'; this.t = 0;
          this.m.body.rotation.x = 0;
          this.leapFrom = this.pos.clone();
          const yy = clamp(0.55 + this.r() * 0.3, 0.4, this.treeHeight() * 0.5);
          const rad = this.treeRadiusAt(yy) * 0.7;
          this.leapTo = new THREE.Vector3(tree.x + Math.cos(this.ang) * rad, yy, tree.z + Math.sin(this.ang) * rad);
          this.climbY = yy;
        }
        break;
      }
      case 'leap': {
        const k = clamp(this.t / 0.5);
        this.pos.lerpVectors(this.leapFrom, this.leapTo, k);
        this.pos.y = lerp(this.leapFrom.y, this.leapTo.y, k) + Math.sin(k * Math.PI) * 0.3;
        this.m.body.rotation.z = lerp(0.3, 1.1, k);
        if (k >= 1) { this.state = 'climb'; this.t = 0; this.onSay(`${this.name} is in the tree! Click it three times to pull it off.`); }
        break;
      }
      case 'climb': {
        const H = this.treeHeight();
        this.climbY = Math.min(H * 0.9, this.climbY + dt * 0.16 * (0.6 + Math.sin(time * 3) * 0.4 + 0.4));
        this.ang += dt * 0.25 * Math.sin(time * 0.7);
        const rad = this.treeRadiusAt(this.climbY) * 0.6;
        this.pos.set(tree.x + Math.cos(this.ang) * rad, this.climbY, tree.z + Math.sin(this.ang) * rad);
        this.face(new THREE.Vector3(tree.x, 0, tree.z), dt);
        this.m.body.rotation.z = 1.15 + Math.sin(time * 9) * 0.1;
        this.gait += dt * 12;
        this.dislodgeT += dt;
        if (this.dislodgeT > 0.7) {
          this.dislodgeT = 0;
          const n = this.onDislodge(this.pos.clone().add(new THREE.Vector3(0, 0.1, 0)), 0.32);
          this.damage += n;
        }
        if (this.climbY >= H * 0.9 - 0.01 && this.t > 3) {
          this.onDislodge(new THREE.Vector3(tree.x, H, tree.z), 0.4, true);
          this.onSay(`${this.name} reached the top, knocked things loose and leapt off.`);
          this.finish('flee', false);
        }
        break;
      }
      case 'caught': {
        // lifted up and carried off toward the camera side
        const k = clamp(this.t / 1.1);
        this.pos.lerpVectors(this.fromPos, new THREE.Vector3(1.8, 1.4, 2.4), k);
        this.m.body.rotation.z = lerp(this.m.body.rotation.z, 0, k);
        this.m.legs.forEach((l, i) => { l.rotation.z = Math.sin(time * 4 + i) * 0.2; });
        if (k >= 1) this.done();
        break;
      }
      case 'flee': {
        if (this.pos.y > 0.001) { this.pos.y = Math.max(0, this.pos.y - dt * 2.5); this.m.body.rotation.z *= 0.9; }
        const exit = new THREE.Vector3(2.4, 0, 2.4);
        moving = !this.walk(exit, 1.6, dt);
        if (!moving || this.t > 4) this.done();
        break;
      }
    }
    g.position.copy(this.pos);
    // legs and tail
    const swing = moving || this.state === 'climb' ? Math.sin(this.gait) * 0.55 : 0;
    this.m.legs.forEach((l, i) => { l.rotation.z = (i % 2 === (i < 2 ? 0 : 1) ? swing : -swing); });
    this.m.tail.forEach((s, i) => {
      s.rotation.z = 0.35 + Math.sin(time * 2.5 - i * 0.6) * (this.state === 'crouch' ? 0.35 : 0.12);
      s.rotation.y = Math.sin(time * 1.7 - i * 0.5) * 0.2;
    });
    this.m.headG.rotation.z = this.state === 'climb' ? -0.9 : 0;
  }
  done() {
    if (this.state === 'done') return;
    this.scene.remove(this.m.g);
    const saved = this.saved;
    this.state = 'done';
    this.onEnd({ saved, damage: this.damage, name: this.name });
  }
  wobble() { return this.state === 'climb' ? 1 : 0; }
}
