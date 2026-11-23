import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

/* The posed skeleton as a file, in metres, standing on y = 0 (the setting is left out).
   The bones are stored compressed (16-bit, normalised); exporters want plain floats, and
   mirrored stand-in bones need their triangles turned back the right way out. */

function plain(geo, matrix) {
  const out = new THREE.BufferGeometry();
  const pos = geo.attributes.position, n = pos.count;
  const p = new Float32Array(n * 3), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) { v.fromBufferAttribute(pos, i); if (matrix) v.applyMatrix4(matrix); v.toArray(p, i * 3); }
  out.setAttribute('position', new THREE.BufferAttribute(p, 3));
  if (geo.attributes.uv && !matrix) {
    const uv = geo.attributes.uv, t = new Float32Array(uv.count * 2);
    for (let i = 0; i < uv.count; i++) { t[i * 2] = uv.getX(i); t[i * 2 + 1] = uv.getY(i); }
    out.setAttribute('uv', new THREE.BufferAttribute(t, 2));
  }
  if (geo.attributes.color) {                    // bones coloured per vertex (the moa) keep it
    const col = geo.attributes.color, c = new Float32Array(col.count * 3);
    for (let i = 0; i < col.count; i++) { c[i * 3] = col.getX(i); c[i * 3 + 1] = col.getY(i); c[i * 3 + 2] = col.getZ(i); }
    out.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  let index = geo.index ? Uint32Array.from(geo.index.array) : null;
  if (matrix && matrix.determinant() < 0) {
    if (!index) index = Uint32Array.from({ length: n }, (_, i) => i);
    for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
  }
  if (index) out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeVertexNormals();
  return out;
}

export async function exportSkeleton(kind, rig, stand, base) {
  rig.root.updateMatrixWorld(true);
  const toStand = new THREE.Matrix4().copy(stand.matrixWorld).invert();
  const baked = Object.values(rig.bones).map(b => ({
    label: b.label, geometry: plain(b.mesh.geometry, new THREE.Matrix4().multiplyMatrices(toStand, b.mesh.matrixWorld)),
  }));
  // stand it on y = 0
  let lo = Infinity;
  for (const { geometry } of baked) { geometry.computeBoundingBox(); lo = Math.min(lo, geometry.boundingBox.min.y); }
  for (const { geometry } of baked) geometry.translate(0, -lo, 0);

  if (kind === 'stl') {
    const group = new THREE.Group();
    for (const { geometry } of baked) group.add(new THREE.Mesh(geometry));
    const data = new STLExporter().parse(group, { binary: true });
    return { blob: new Blob([data], { type: 'model/stl' }), name: `${base}.stl` };
  }
  if (kind === 'obj') {
    // one named object per bone, positions to 0.1 mm; far smaller than three's OBJExporter
    const parts = [`# ${base}, metres, y up, facing +z\n`];
    let offset = 1;
    for (const { label, geometry } of baked) {
      const pos = geometry.attributes.position, idx = geometry.index.array;
      const lines = [`o ${label.replace(/[^\w]+/g, '_')}\n`];
      for (let i = 0; i < pos.count; i++) lines.push(`v ${pos.getX(i).toFixed(4)} ${pos.getY(i).toFixed(4)} ${pos.getZ(i).toFixed(4)}\n`);
      for (let i = 0; i < idx.length; i += 3) lines.push(`f ${idx[i] + offset} ${idx[i + 1] + offset} ${idx[i + 2] + offset}\n`);
      offset += pos.count;
      parts.push(lines.join(''));
    }
    return { blob: new Blob(parts, { type: 'text/plain' }), name: `${base}.obj` };
  }
  // GLB: the joint hierarchy with textured bones, so it can be posed again elsewhere
  const root = rig.root.clone(true);
  root.position.y -= lo;
  root.traverse(o => {
    if (!o.isMesh) return;
    const src = rig.bones[o.userData.bone].mesh;
    o.geometry = plain(src.geometry, null);
    o.material = src.material.clone(); o.material.emissive.set(0x000000);
    // bake the dequantising node transform the scan carried; it may mirror, so do it in the geometry
    o.matrix.decompose(o.position, o.quaternion, o.scale);
    o.matrixAutoUpdate = true;
    o.name = rig.bones[o.userData.bone].label;
  });
  const fixed = [];
  root.traverse(o => { if (o.isMesh && o.matrix.determinant() < 0) fixed.push(o); });
  for (const o of fixed) {               // glTF can't carry a mirrored node: put the mirror in the vertices
    o.updateMatrix();
    const m = o.matrix.clone();
    const g = plain(o.geometry, m);
    g.setAttribute('uv', plain(o.geometry, null).getAttribute('uv'));
    o.geometry = g; o.position.set(0, 0, 0); o.quaternion.identity(); o.scale.set(1, 1, 1);
  }
  const glb = await new GLTFExporter().parseAsync(root, { binary: true });
  return { blob: new Blob([glb], { type: 'model/gltf-binary' }), name: `${base}.glb` };
}
