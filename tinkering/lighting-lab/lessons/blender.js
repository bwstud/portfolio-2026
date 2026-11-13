/* Lesson 9: load scenes from Blender (drop a .glb, or the live link), and compare against a Cycles render. */
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { stillLife, cyc } from '../shared.js';
import { makePathTracer } from '../pt.js';

const LIVE = 'scenes/live.glb';

export default async function (ctx, ui) {
  const { THREE, scene, camera, controls, renderer, canvas } = ctx;
  RectAreaLightUniformsLib.init();
  camera.position.set(1.7, 1.1, 3.1);
  controls.target.set(0, 0.3, -0.15);
  renderer.toneMapping = THREE.AgXToneMapping;
  scene.background = new THREE.Color(0x141414);

  const state = { mode: 'raster', env: 'studio', envOn: true, live: false, name: 'placeholder still life', ev: 0 };
  let content = new THREE.Group();
  scene.add(content);
  const pt = makePathTracer(ctx, { bounces: 8, maxSamples: 3000 });
  pt.setMode('raster');

  /* placeholder until something is loaded */
  {
    const { group } = await stillLife();
    content.add(cyc({ color: 0xd8d4cc }), group);
    const key = new THREE.DirectionalLight(0xffffff, 2.5);
    key.position.set(-3, 5, 3); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 });
    key.shadow.normalBias = 0.02;
    content.add(key);
  }

  /* reference image (a Cycles render): shown under the left part of the split */
  const ref = document.createElement('img');
  Object.assign(ref.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', display: 'none', background: '#000' });
  canvas.after(ref);
  let refURL = null;
  ctx.cleanup(() => { ref.remove(); if (refURL) URL.revokeObjectURL(refURL); });
  ctx.frame(() => {
    if (state.mode === 'reference') ref.style.clipPath = `inset(0 ${(1 - ctx.split.value) * 100}% 0 0)`;
  });

  async function setEnv() {
    scene.environment = state.envOn ? await ctx.hdri(state.env) : null;   // equirect: the path tracer needs it
    if (pt.ready) { pt.updateEnvironment(); pt.reset(); }
  }

  /* ---------- loading glTF ---------- */
  const loader = new GLTFLoader();
  async function loadGLTF(buffer, name) {
    let gltf;
    try { gltf = await loader.parseAsync(buffer, ''); } catch (e) { ctx.hint(`Couldn't read ${name}: ${e.message}`); return; }
    scene.remove(content); ctx.dispose(content);
    content = gltf.scene;
    let lights = 0, meshes = 0, emitters = 0;
    content.traverse(o => {
      if (o.isMesh) {
        o.castShadow = o.receiveShadow = true; meshes++;
        const m = o.material;
        if (m?.emissive && m.emissive.getHex() !== 0 && (m.emissiveIntensity ?? 1) > 0) emitters++;
      }
      if (o.isLight) {
        lights++;
        if (o.shadow && !o.isRectAreaLight) { o.castShadow = true; o.shadow.mapSize.set(2048, 2048); o.shadow.normalBias = 0.02; o.shadow.bias = -0.0005; }
      }
    });
    scene.add(content);
    // use the file's camera if it has one, so this view matches a render from Blender
    const cam = gltf.cameras?.[0];
    let camNote = 'none in the file, kept the orbit camera';
    if (cam?.isPerspectiveCamera) {
      cam.updateWorldMatrix(true, false);
      const p = new THREE.Vector3(), q = new THREE.Quaternion();
      cam.matrixWorld.decompose(p, q, new THREE.Vector3());
      camera.position.copy(p);
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      const box = new THREE.Box3().setFromObject(content);
      const dist = box.isEmpty() ? 3 : Math.max(0.5, p.distanceTo(box.getCenter(new THREE.Vector3())));
      controls.target.copy(p).addScaledVector(fwd, dist);
      controls.update();
      camNote = `from the file (vertical fov ${cam.fov.toFixed(1)}°)`;
    } else {
      const box = new THREE.Box3().setFromObject(content);
      if (!box.isEmpty()) {
        const c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2;
        controls.target.copy(c);
        camera.position.copy(c).add(new THREE.Vector3(0.6, 0.45, 1).normalize().multiplyScalar(r * 2.4));
        controls.update();
      }
    }
    state.name = name;
    if (pt.ready || state.mode !== 'raster') { ctx.hint('Rebuilding the path tracer…'); await pt.sync(); ctx.hint(''); }
    readout(`${meshes} meshes · ${lights} light${lights === 1 ? '' : 's'}${emitters ? ` · ${emitters} glowing surface${emitters === 1 ? '' : 's'}` : ''}`, camNote,
      emitters && !lights ? 'This scene is lit only by glowing surfaces. A rasteriser can\'t use those as lights, so switch to path traced.' : '');
  }

  function readout(stats = '', camNote = '', note = '') {
    ctx.readout(`
      <span class="k">scene</span> <span class="v">${state.name}</span><br>
      ${stats ? `<span class="k">contains</span> <span class="v">${stats}</span><br>` : ''}
      ${camNote ? `<span class="k">camera</span> <span class="v">${camNote}</span><br>` : ''}
      <span class="k">live link</span> <span class="v">${state.live ? `watching ${LIVE}` : 'off'}</span>
      ${note ? `<hr><span class="v">${note}</span>` : ''}`);
  }

  /* drag and drop: .glb/.gltf loads a scene, an image becomes the reference */
  const stage = canvas.parentElement;
  const onOver = e => { e.preventDefault(); stage.classList.add('dragging'); };
  const onLeave = () => stage.classList.remove('dragging');
  const onDrop = async e => {
    e.preventDefault(); onLeave();
    for (const f of e.dataTransfer.files) {
      if (/\.(glb|gltf)$/i.test(f.name)) await loadGLTF(await f.arrayBuffer(), f.name);
      else if (f.type.startsWith('image/')) {
        if (refURL) URL.revokeObjectURL(refURL);
        refURL = URL.createObjectURL(f);
        ref.src = refURL;
        viewSeg.set('reference');
      }
    }
  };
  ctx.listen(stage, 'dragover', onOver);
  ctx.listen(stage, 'dragleave', onLeave);
  ctx.listen(stage, 'drop', onDrop);

  /* ---------- live link: poll the file the Blender script writes ---------- */
  let lastStamp = null, polling = null;
  async function poll() {
    try {
      const r = await fetch(LIVE, { method: 'HEAD', cache: 'no-store' });
      if (!r.ok) { ctx.hint(`Live link: waiting for Blender to write ${LIVE}`); return; }
      ctx.hint('');
      const stamp = r.headers.get('last-modified') + r.headers.get('content-length');
      if (stamp !== lastStamp) {
        lastStamp = stamp;
        const buf = await (await fetch(LIVE, { cache: 'no-store' })).arrayBuffer();
        await loadGLTF(buf, `live.glb · ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`);
      }
    } catch { ctx.hint('Live link needs the dev server (npm run dev)'); }
  }
  function setLive(on) {
    state.live = on;
    clearInterval(polling); polling = null;
    if (on) { lastStamp = null; poll(); polling = setInterval(poll, 1500); } else ctx.hint('');
    readout();
  }
  ctx.cleanup(() => clearInterval(polling));

  ctx.setRender(() => {
    renderer.toneMappingExposure = Math.pow(2, state.ev);
    if (state.mode === 'reference') {
      // reference on the left (the <img>), the lab's raster render on the right
      renderer.render(scene, camera);
      ctx.badge('left: your reference · right: raster');
    } else pt.render();
  });

  const viewSeg = ui.seg('View', [
    { value: 'raster', label: 'Raster' }, { value: 'pt', label: 'Path traced' }, { value: 'compare', label: 'Raster vs path traced' }, { value: 'reference', label: 'Against your render' },
  ], 'raster', async v => {
    state.mode = v;
    ref.style.display = v === 'reference' && ref.src ? 'block' : 'none';
    if (v === 'reference') { pt.setMode('raster'); ctx.split.enable('your render', 'lab'); if (!ref.src) ctx.hint('Drop a PNG or JPG rendered from the same camera'); return; }
    pt.setMode(v);
    if (v !== 'raster' && !pt.ready) { ctx.hint('Building the path tracer…'); await pt.sync(); ctx.hint(''); }
  });
  ui.buttons([
    { label: 'Load scenes/cornell.glb', onClick: async () => {
      try { const r = await fetch('scenes/cornell.glb', { cache: 'no-store' }); if (!r.ok) throw new Error(); await loadGLTF(await r.arrayBuffer(), 'cornell.glb'); }
      catch { ctx.hint('No scenes/cornell.glb yet. Run tools/blender/cornell.py first'); }
    } },
    { label: 'Load the Cycles reference', onClick: async () => {
      const url = 'reference/cornell-cycles.png';
      const r = await fetch(url, { method: 'HEAD', cache: 'no-store' }).catch(() => null);
      if (!r?.ok) { ctx.hint('No reference/cornell-cycles.png yet. Run tools/blender/cornell.py first'); return; }
      ref.src = `${url}?t=${Date.now()}`; viewSeg.set('reference');
    } },
  ]);
  ui.toggle('Live link with Blender', false, setLive, 'Reloads scenes/live.glb whenever Blender writes it. Needs the dev server.');
  ui.toggle('Environment light', true, v => { state.envOn = v; setEnv(); }, 'Turn off to see only the lights from your Blender file.');
  ui.select('Environment', [{ value: 'studio', label: 'Small studio' }, { value: 'outdoor', label: 'Open sky, sun' }, { value: 'lebombo', label: 'Interior with windows' }],
    state.env, v => { state.env = v; setEnv(); });
  ui.slider('Exposure', { min: -6, max: 6, step: 0.25, value: 0, fmt: v => `${v > 0 ? '+' : ''}${v} EV` }, v => { state.ev = v; });
  ctx.hint('Drop a .glb from Blender here, or an image to compare against');
  await setEnv();
  readout();
}
