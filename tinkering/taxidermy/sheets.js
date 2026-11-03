import * as THREE from 'three';

/* Drawing sheets: the posed specimen in orthographic views, drawn in ink on paper like an
   architectural set. One small renderer draws every view and copies it into each sheet. */

export const VIEWS = [
  { id: 'left', title: 'Elevation, left side', no: 'A-101', dir: [1, 0, 0], up: [0, 1, 0] },
  { id: 'front', title: 'Elevation, front', no: 'A-102', dir: [0, 0, 1], up: [0, 1, 0] },
  { id: 'plan', title: 'Plan, from above', no: 'A-103', dir: [0, 1, 0], up: [0, 0, 1] },
  { id: 'axo', title: 'Axonometric', no: 'A-104', dir: [1, 0.8, 1], up: [0, 1, 0] },
];

const INK = '#2b2620', PAPER = '#efe8da';

export function createSheets(list, { skeleton, onPick }) {
  const W = 220, H = 150, DPR = Math.min(devicePixelRatio, 2);
  const gl = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  gl.setPixelRatio(DPR); gl.setSize(W, H);
  gl.setClearColor(PAPER);
  const scene = new THREE.Scene();
  // flat ink with a little shading, so the bones read as drawn forms rather than silhouettes
  const ramp = new THREE.DataTexture(new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 235, 235, 235, 255]), 3, 1);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;
  scene.overrideMaterial = new THREE.MeshToonMaterial({ color: '#8c7f6c', gradientMap: ramp });
  scene.add(new THREE.AmbientLight('#fff', 1.1));
  const sun = new THREE.DirectionalLight('#fff', 2.2); scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 0.012), new THREE.MeshBasicMaterial({ color: INK }));
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);

  const sheets = VIEWS.map(v => {
    const el = document.createElement('button');
    el.className = 'sheet'; el.type = 'button'; el.title = `Look from here: ${v.title.toLowerCase()}`;
    el.innerHTML = `<canvas width="${W * DPR}" height="${H * DPR}"></canvas>
      <span class="sheet__block"><span class="sheet__title">${v.title}</span><span class="sheet__no">${v.no}</span></span>`;
    el.addEventListener('click', () => onPick(v));
    list.append(el);
    return { v, ctx: el.querySelector('canvas').getContext('2d') };
  });

  const box = new THREE.Box3(), size = new THREE.Vector3(), mid = new THREE.Vector3();
  function draw(bounds) {
    box.copy(bounds); box.getSize(size); box.getCenter(mid);
    const holder = skeleton.parent;                  // borrow the skeleton for a moment
    const at = skeleton.position.clone(), parentPos = holder.position.clone();
    scene.add(skeleton);
    skeleton.position.copy(at).add(parentPos);
    skeleton.updateMatrixWorld(true);
    for (const { v, ctx } of sheets) {
      const d = new THREE.Vector3(...v.dir).normalize();
      // fit the bounding box's projection into the sheet, with a margin and room for the title
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(...v.up), d).normalize();
      const up = new THREE.Vector3().crossVectors(d, right);
      let hw = 0, hh = 0;
      for (let i = 0; i < 8; i++) {
        const c = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(mid);
        hw = Math.max(hw, Math.abs(c.dot(right))); hh = Math.max(hh, Math.abs(c.dot(up)));
      }
      const aspect = W / (H - 26);
      const k = Math.max(hw / aspect, hh) * 1.12;
      cam.left = -k * aspect; cam.right = k * aspect; cam.top = k; cam.bottom = -k - (26 / (H - 26)) * k * 2;
      cam.updateProjectionMatrix();
      cam.position.copy(mid).addScaledVector(d, 30); cam.up.set(...v.up); cam.lookAt(mid);
      sun.position.copy(cam.position).add(up.clone().multiplyScalar(20)).add(right.clone().multiplyScalar(-10));
      // a ground line in the elevations
      ground.visible = v.id === 'left' || v.id === 'front';
      if (ground.visible) { ground.position.set(mid.x, box.min.y - 0.006, mid.z); ground.lookAt(cam.position); scene.add(ground); }
      gl.render(scene, cam);
      ctx.drawImage(gl.domElement, 0, 0);
      scaleBar(ctx, (W * DPR) / (cam.right - cam.left), DPR);
    }
    holder.add(skeleton);
    skeleton.position.copy(at);
    skeleton.updateMatrixWorld(true);
  }

  function scaleBar(ctx, pxPerM, dpr) {
    const x = 10 * dpr, y = (H - 34) * dpr;
    ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineWidth = dpr;
    for (let i = 0; i < 2; i++) {
      ctx[i ? 'strokeRect' : 'fillRect'](x + i * pxPerM * 0.5, y, pxPerM * 0.5, 3 * dpr);
    }
    ctx.font = `${9 * dpr}px Geist, sans-serif`; ctx.fillText('0', x - 2 * dpr, y - 3 * dpr); ctx.fillText('1 m', x + pxPerM - 6 * dpr, y - 3 * dpr);
  }

  let timer = 0;
  return {
    update(bounds, delay = 120) { clearTimeout(timer); timer = setTimeout(() => draw(bounds), delay); },
  };
}
