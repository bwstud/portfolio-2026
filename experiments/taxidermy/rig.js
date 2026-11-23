import * as THREE from 'three';

/* The articulated skeleton. Every bone hangs from a joint placed at its pivot (where it meets
   its parent bone); at rest every joint's rotation is identity, so a pose is one quaternion
   per joint plus where the whole skeleton stands. Turning a joint carries everything below
   it along. Moving a bone bends the joints above it (CCD inverse kinematics) so it stays
   attached, the way soft tissue would hold it. */

// how far each kind of joint may turn away from rest when the skeleton bends itself (radians)
const LIMIT = { spine: 0.32, tail: 0.6, head: 1.0, chest: 0.2, limb: 2.6, small: 0.25, toe: 1.4, girdle: 0.5 };
const SMALL = /^(Scaphoide|Lunatum|Triquetrum|Pisiforme|Capito|Hamatum|Talus|Calcaneum|Gd_|Pt_|Sesamoide|Patella)/;

function kind(name, group) {
  if (SMALL.test(name)) return 'small';
  if (name.startsWith('Phalange')) return 'toe';
  if (/^(Scapula|Coxal)/.test(name)) return 'girdle';
  if (group.startsWith('fore') || group.startsWith('hind')) return 'limb';
  if (name === 'Crane' || name === 'Mandibule') return 'head';
  return group;
}

export async function loadRig(gltf, rigUrl) {
  const rig = await (await fetch(rigUrl)).json();
  const meshes = {};
  gltf.scene.traverse(o => { if (o.isMesh) meshes[o.name] = o; });

  const root = new THREE.Group();            // the whole skeleton; position is the pose's stance
  const joints = {}, bones = {};
  const pivot = n => new THREE.Vector3(...rig.bones[n].pivot);
  for (const [name, b] of Object.entries(rig.bones)) {
    const joint = new THREE.Object3D();
    joint.name = name;
    const parentPivot = b.parent ? pivot(b.parent) : new THREE.Vector3();
    joint.position.copy(pivot(name)).sub(parentPivot);
    (b.parent ? joints[b.parent] : root).add(joint);

    const src = meshes[b.mesh];
    src.updateMatrix();
    const mesh = new THREE.Mesh(src.geometry, src.material.clone());
    const m = mesh.material;
    if (!m.map && !m.vertexColors) m.color.set('#d8ccb4');   // a few scans came without a texture
    m.roughness = 0.82; m.metalness = 0;
    // scan coords -> world rest pose -> relative to this joint (the node matrix undoes quantization)
    mesh.matrix.makeTranslation(-b.pivot[0], -b.pivot[1], -b.pivot[2])
      .multiply(new THREE.Matrix4().fromArray(b.T.flat()).transpose())
      .multiply(src.matrix);
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.bone = name;
    joint.add(mesh);
    joints[name] = joint;
    bones[name] = { ...b, kind: b.kind || kind(name, b.group), mesh, joint };
  }
  root.updateMatrixWorld(true);
  for (const b of Object.values(bones)) {           // each bone's middle, in its joint's frame
    b.mesh.geometry.computeBoundingBox();
    const c = b.mesh.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(b.mesh.matrix);
    b.centre = c;
  }
  return new Rig(root, bones, rig);
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _id = new THREE.Quaternion();

class Rig {
  constructor(root, bones, data) {
    this.root = root; this.bones = bones; this.data = data;
    this.names = Object.keys(bones);
    this.rootName = this.names[0];
  }

  label(n) { return this.bones[n].label; }

  /* where a bone's middle is in the world */
  centreOf(n, out = new THREE.Vector3()) {
    const b = this.bones[n];
    return out.copy(b.centre).applyMatrix4(b.joint.matrixWorld);
  }

  /* the joints that bend when n is moved, n first; limbs stop at the shoulder blade or hip bone */
  chain(n) {
    const b = this.bones[n];
    const out = [n];
    if (b.kind === 'chest' || n === this.rootName) return out;
    const max = b.group === 'spine' || b.group === 'head' ? 12 : b.group === 'tail' ? 19 : 9;
    let p = b.parent;
    while (p && out.length < max) {
      const pb = this.bones[p];
      if (b.group.startsWith('fore') || b.group.startsWith('hind')) { if (!pb.group.startsWith(b.group.slice(0, 4))) break; }
      else if (b.group === 'tail' && pb.group !== 'tail') break;
      else if (p === this.rootName) break;
      out.push(p);
      p = pb.parent;
    }
    return out;
  }

  /* bend the chain so that bone n's middle reaches target (world). Returns the miss distance. */
  reach(n, target, iterations = 24) {
    const chain = this.chain(n);
    if (n === this.rootName) {                       // the sacrum carries the whole skeleton
      this.centreOf(n, _e);
      this.root.position.add(_v1.subVectors(target, _e));
      this.root.updateMatrixWorld(true);
      return 0;
    }
    const top = this.bones[chain.at(-1)].joint;
    for (let it = 0; it < iterations; it++) {
      for (const name of chain) {
        const b = this.bones[name], j = b.joint;
        this.centreOf(n, _e);
        j.getWorldPosition(_p);
        _v1.subVectors(_e, _p); _v2.subVectors(target, _p);
        if (_v1.lengthSq() < 1e-8 || _v2.lengthSq() < 1e-8) continue;
        _v1.normalize(); _v2.normalize();
        _q.setFromUnitVectors(_v1, _v2);
        // spread the bend: no single joint takes a big step
        const step = 2 * Math.acos(Math.min(1, Math.abs(_q.w)));
        const maxStep = b.kind === 'spine' || b.kind === 'tail' ? 0.05 : 0.2;
        if (step > maxStep) _q.slerp(_id, 1 - maxStep / step);
        // world-space turn -> joint's local rotation
        j.parent.getWorldQuaternion(_qp);
        j.getWorldQuaternion(_qw);
        _qw.premultiply(_q);
        j.quaternion.copy(_qp.invert().multiply(_qw));
        this.clamp(b);
        top.updateMatrixWorld(true);
      }
      if (this.centreOf(n, _e).distanceTo(target) < 5e-4) break;
    }
    return this.centreOf(n, _e).distanceTo(target);
  }

  clamp(b) {
    const lim = LIMIT[b.kind] ?? 0.5;
    const a = 2 * Math.acos(Math.min(1, Math.abs(b.joint.quaternion.w)));
    if (a > lim) b.joint.quaternion.slerp(_id, 1 - lim / a);
  }

  /* turn bone n by angle (radians) about one of its own axes ('x'|'y'|'z') */
  turn(n, axis, angle) {
    const j = this.bones[n].joint;
    j.quaternion.multiply(_q.setFromAxisAngle(new THREE.Vector3(...{ x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[axis]), angle));
    this.root.updateMatrixWorld(true);
  }

  /* --- poses --- */
  pose() {
    const q = {};
    for (const n of this.names) {
      const r = this.bones[n].joint.quaternion;
      if (Math.abs(r.w) < 0.999999) q[n] = r.toArray().map(x => +x.toFixed(6));
    }
    return { at: this.root.position.toArray().map(x => +x.toFixed(5)), q };
  }

  setPose(p) {
    this.root.position.fromArray(p.at || [0, 0, 0]);
    for (const n of this.names) {
      const v = p.q?.[n];
      v ? this.bones[n].joint.quaternion.fromArray(v) : this.bones[n].joint.quaternion.identity();
    }
    this.root.updateMatrixWorld(true);
  }

  /* lowest point of the posed skeleton, from each bone's bounding box */
  bounds(box = new THREE.Box3()) {
    box.makeEmpty();
    for (const b of Object.values(this.bones)) {
      const bb = b.mesh.geometry.boundingBox;
      box.union(_box.copy(bb).applyMatrix4(b.mesh.matrixWorld));
    }
    return box;
  }
}
const _box = new THREE.Box3();
