/* Lesson 5: image-based lighting. Also finds the sun in an HDRI by searching for its brightest pixel. */
import { num, hdriStats } from '../shared.js';

export default async function (ctx, ui) {
  const { THREE, scene, camera, controls, renderer } = ctx;
  camera.position.set(0, 1.7, 5.8);
  controls.target.set(0, 0.55, 0);
  renderer.toneMapping = THREE.AgXToneMapping;

  const state = { env: 'outdoor', intensity: 1, rot: 0, bg: 'show', rough: 0.3, sun: false };

  /* a roughness row, a bowl (to show missing occlusion), a knot, all on a shadow-catching floor */
  const row = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 64, 32), new THREE.MeshPhysicalMaterial({ color: 0xf2f2f2, roughness: i / 4, metalness: i === 0 ? 1 : 0 }));
    m.position.set((i - 2) * 0.55, 0.22, 0.9);
    m.castShadow = m.receiveShadow = true;
    scene.add(m); row.push(m);
  }
  row[0].material.color.set(0xdddddd);
  const pts = [];
  for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 0.5; pts.push(new THREE.Vector2(Math.sin(a) * 0.5 + 0.02, (1 - Math.cos(a)) * 0.45)); }
  for (let i = 24; i >= 0; i--) { const a = (i / 24) * Math.PI * 0.5; pts.push(new THREE.Vector2(Math.sin(a) * 0.46 + 0.02, (1 - Math.cos(a)) * 0.45 + 0.04)); }
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(pts, 96), new THREE.MeshPhysicalMaterial({ color: 0xe9e4da, roughness: 0.5, side: THREE.DoubleSide }));
  bowl.position.set(-0.75, 0, -0.35);
  bowl.castShadow = bowl.receiveShadow = true;
  const knotMat = new THREE.MeshPhysicalMaterial({ color: 0xc7a06a, roughness: state.rough, metalness: 1 });
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.3, 0.1, 220, 32), knotMat);
  knot.position.set(0.75, 0.55, -0.35);
  knot.castShadow = knot.receiveShadow = true;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 96), new THREE.MeshPhysicalMaterial({ color: 0x9a958c, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  scene.add(bowl, knot, floor);

  const sun = new THREE.DirectionalLight(0xffffff, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 30 });
  sun.shadow.normalBias = 0.02; sun.shadow.radius = 2;
  scene.add(sun, sun.target);

  const analyse = name => hdriStats(ctx, name);

  let cur = { tex: null, env: null, st: null };
  async function load() {
    const name = state.env;
    if (name === 'none') cur = { tex: null, env: null, st: null };
    else cur = { tex: name === 'room' ? null : await ctx.hdri(name), env: await ctx.envMap(name), st: await analyse(name) };
    if (name !== state.env) return;
    apply();
  }

  function apply() {
    scene.environment = cur.env;
    scene.environmentIntensity = state.intensity;
    const rot = new THREE.Euler(0, state.rot * Math.PI / 180, 0);
    scene.environmentRotation.copy(rot);
    scene.backgroundRotation.copy(rot);
    scene.backgroundIntensity = state.intensity;
    if (state.bg === 'off' || !cur.env) { scene.background = new THREE.Color(0x0b0c0e); }
    else { scene.background = state.bg === 'blur' ? cur.env : (cur.tex || cur.env); scene.backgroundBlurriness = state.bg === 'blur' ? state.rough : 0; }
    knotMat.roughness = state.rough;
    const st = cur.st;
    const sunOn = state.sun && st && st.elev > 2;
    sun.intensity = sunOn ? 3.5 * state.intensity : 0;
    if (st) {
      const d = st.dir.clone().applyEuler(rot);
      sun.position.copy(d.multiplyScalar(10));
    }
    let r = `<span class="k">environment</span> <span class="v">${{ outdoor: 'open sky with sun', studio: 'small studio', lebombo: 'interior with windows', room: 'procedural room (RoomEnvironment)', none: 'none' }[state.env]}</span><br>`;
    if (st) {
      r += `<span class="k">brightest pixel</span> <span class="v">${num(st.best)}</span>   <span class="k">average</span> <span class="v">${num(st.avg, 3)}</span><br>
        <span class="k">ratio</span> <span class="v">${num(st.best / st.avg)} : 1 ≈ ${Math.log2(st.best / st.avg).toFixed(1)} stops</span><br>
        <span class="k">brightest spot is</span> <span class="v">${st.elev.toFixed(0)}° ${st.elev >= 0 ? 'above' : 'below'} the horizon</span>`;
      if (state.sun) r += st.elev > 2 ? `<br><span class="k">matching sun</span> <span class="v">on, aimed from that pixel</span>` : `<br><span class="k">matching sun</span> <span class="v">this HDRI's brightest spot isn't a sun</span>`;
    }
    ctx.readout(r);
  }

  ui.select('Environment', [
    { value: 'outdoor', label: 'Open sky, with sun (Kloofendal)' },
    { value: 'studio', label: 'Small studio (softboxes)' },
    { value: 'lebombo', label: 'Interior with windows (Lebombo)' },
    { value: 'room', label: 'Procedural room (no photo)' },
    { value: 'none', label: 'None' },
  ], state.env, v => { state.env = v; load(); }, 'HDRIs from Poly Haven, CC0.');
  ui.slider('Intensity', { min: 0.05, max: 4, step: 0.05, value: 1 }, v => { state.intensity = v; apply(); });
  ui.slider('Rotation', { min: -180, max: 180, step: 1, value: 0, unit: '°' }, v => { state.rot = v; apply(); });
  ui.seg('Background', [{ value: 'show', label: 'Show HDRI' }, { value: 'blur', label: 'Blur to roughness' }, { value: 'off', label: 'Off' }], 'show', v => { state.bg = v; apply(); });
  ui.slider('Knot roughness', { min: 0, max: 1, step: 0.01, value: state.rough }, v => { state.rough = v; apply(); },
    'With "blur to roughness", the background shows roughly what this surface is reflecting.');
  ui.toggle('Add a matching sun', false, v => { state.sun = v; apply(); },
    'A directional light aimed from the HDRI\'s brightest pixel, so the sun can cast a shadow map.');
  await load();
}
