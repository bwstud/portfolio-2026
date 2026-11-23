// Solid objects on the plate, drawn as instanced meshes with real materials.
import * as THREE from 'three';

function make(shape, r) {
  if (shape === 'rice') {
    const g = new THREE.CapsuleGeometry(r, r * 3.2, 4, 10);
    g.rotateZ(Math.PI / 2);                       // lie along x
    g.scale(1, 0.85, 1);
    return [g, new THREE.MeshPhysicalMaterial({
      color: 0xf6f0e2, roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.5, envMapIntensity: 2,
      sheen: 0.4, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.6,
    })];
  }
  const g = new THREE.SphereGeometry(r, shape === 'ball' ? 22 : 18, shape === 'ball' ? 16 : 12);
  if (shape === 'ball') {
    return [g, new THREE.MeshPhysicalMaterial({ color: 0xe3e6ea, metalness: 1, roughness: 0.07, envMapIntensity: 1.3 })];
  }
  return [g, new THREE.MeshPhysicalMaterial({
    color: 0xeefcff, metalness: 0, roughness: 0.02, transmission: 1, ior: 1.52, thickness: r * 2,
    attenuationColor: new THREE.Color(0x6fd1b8), attenuationDistance: 0.045,
    iridescence: 0.25, iridescenceIOR: 1.3, envMapIntensity: 1.2,
  })];
}

export function createSolids({ medium, sand }) {
  const n = sand.count, r = medium.radius;
  const [geo, mat] = make(medium.shape, r);
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const group = new THREE.Group();
  group.add(mesh);

  const seed = new Float32Array(n).map(() => Math.random());
  const spin = new Float32Array(n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  const rice = medium.shape === 'rice';
  const rest = rice ? r * 0.85 : r;

  let pourAt = -1;
  const pour = (t) => { pourAt = t; };

  const update = ({ t, dt, drive }) => {
    const pouring = pourAt >= 0 ? t - pourAt : 99;
    for (let i = 0; i < n; i++) {
      const hop = sand.hop[i] * drive;
      let y = rest + 0.0006 + hop * (rice ? 0.028 : 0.018);
      if (pouring < 1.3) {
        const k = (pouring - seed[i] * 0.75) / 0.45;
        if (k < 0) y = -50; else if (k < 1) y += (1 - k) * (1 - k) * 1.2;
      }
      p.set(sand.x[i], y, sand.y[i]);
      if (rice) {
        // A hopping grain tumbles end over end and lands flat again.
        spin[i] = hop > 0.05 ? spin[i] + dt * hop * 40 * (seed[i] - 0.5) : spin[i] * 0.8;
        e.set(0, -sand.ang[i], spin[i] * 0.6, 'YXZ');
        q.setFromEuler(e);
      } else q.identity();
      m4.compose(p, q, s);
      m4.toArray(mesh.instanceMatrix.array, i * 16);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return Math.min(1, Math.max(0, (pouring - 0.3) / 0.9));
  };

  const dispose = () => { geo.dispose(); mat.dispose(); mesh.dispose(); };
  return { group, update, pour, dispose };
}
