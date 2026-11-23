/* Lesson 8: a still life, path traced with three-gpu-pathtracer, against the best raster version. */
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { PhysicalCamera } from 'three-gpu-pathtracer';
import { cyc, stillLife, hdriStats } from '../shared.js';
import { makePathTracer } from '../pt.js';

export async function setupStudio(ctx, { glossyFloor = false } = {}) {
  const { THREE, scene } = ctx;
  RectAreaLightUniformsLib.init();
  const floor = cyc({ color: 0xd8d4cc });
  scene.add(floor);
  const softbox = new THREE.RectAreaLight(0xfff2e2, 12, 1.6, 1.0);
  softbox.position.set(-1.8, 2.4, 1.6);
  softbox.lookAt(0, 0.3, 0);
  scene.add(softbox);
  /* raster only: the HDRI's sun as a shadow-casting light (the path tracer gets it from the image) */
  const sun = new THREE.DirectionalLight(0xffffff, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 30 });
  sun.shadow.normalBias = 0.02; sun.shadow.radius = 2;
  scene.add(sun, sun.target);
  return { floor, softbox, sun };
}

export default async function (ctx, ui) {
  const { THREE, scene, controls, renderer } = ctx;
  /* a physical camera gives the path tracer an aperture, for depth of field */
  const camera = new PhysicalCamera(38, ctx.size.w / ctx.size.h, 0.05, 200);
  camera.position.set(1.7, 1.1, 3.1);
  ctx.camera = camera; controls.object = camera;
  controls.target.set(0, 0.3, -0.15);
  controls.update();
  renderer.toneMapping = THREE.AgXToneMapping;
  scene.background = new THREE.Color(0x141414);

  const state = { mode: 'compare', env: 'studio', bounces: 8, softbox: true, dof: false, focus: 3.25, fstop: 1.8, glossy: false, ev: 0, glass: 'solid' };
  const { floor, softbox, sun } = await setupStudio(ctx);
  const { group, mats } = await stillLife();
  scene.add(group);

  let started = false;
  const pt = makePathTracer(ctx, { bounces: state.bounces, maxSamples: 4000 });
  pt.beforeSync = () => { sun.visible = false; };
  pt.afterSync = () => { sun.visible = true; };
  ctx.setRender(() => { renderer.toneMappingExposure = Math.pow(2, state.ev); pt.render(); });

  async function setEnv() {
    // the path tracer needs the equirectangular HDR itself (it importance-samples its bright pixels);
    // the rasteriser turns the same texture into a PMREM on its own
    scene.environment = await ctx.hdri(state.env);
    const st = await hdriStats(ctx, state.env);
    const isSun = st && st.elev > 2 && st.best / st.avg > 1000;
    sun.intensity = isSun ? 3 : 0;
    if (st) sun.position.copy(st.dir).multiplyScalar(10);
    if (pt.ready) { pt.updateEnvironment(); pt.updateLights(); pt.reset(); }
  }
  function apply(what) {
    softbox.visible = state.softbox;
    floor.material.roughness = state.glossy ? 0.12 : 0.85;
    floor.material.color.set(state.glossy ? 0x6b6964 : 0xd8d4cc);
    pt.setBounces(state.bounces);
    camera.fStop = state.dof ? state.fstop : 1e4;
    camera.focusDistance = state.focus;
    camera.apertureBlades = 6;
    if (pt.ready) {
      if (what === 'lights') pt.updateLights();
      if (what === 'materials') pt.updateMaterials();
      if (what === 'camera') pt.updateCamera();
      pt.reset();
    }
    ctx.readout(`
      <span class="k">left</span> <span class="v">raster: environment light, softbox (no shadow), sun shadow map</span><br>
      <span class="k">right</span> <span class="v">path traced: ${state.bounces} bounces, same lights and materials</span><br>
      <span class="k">camera</span> <span class="v">${state.dof ? `f/${state.fstop} focused at ${state.focus.toFixed(2)} m` : 'pinhole (everything sharp)'}</span>`);
  }

  ui.seg('Renderer', [{ value: 'raster', label: 'Raster' }, { value: 'pt', label: 'Path traced' }, { value: 'compare', label: 'Compare' }], state.mode, async v => {
    state.mode = v; pt.setMode(v);
    if (started && v !== 'raster' && !pt.ready) { ctx.hint('Building the path tracer…'); await pt.sync(); ctx.hint(''); }
  });
  ui.select('Environment', [
    { value: 'studio', label: 'Small studio' }, { value: 'outdoor', label: 'Open sky, sun' }, { value: 'lebombo', label: 'Interior with windows' },
  ], state.env, v => { state.env = v; setEnv(); });
  ui.toggle('Softbox (area light)', true, v => { state.softbox = v; apply('lights'); });
  ui.slider('Bounces', { min: 1, max: 16, step: 1, value: state.bounces }, v => { state.bounces = v; apply(); });
  ui.seg('Glass', [{ value: 'solid', label: 'Solid (refracts)' }, { value: 'thin', label: 'Thin-walled' }], 'solid', v => {
    state.glass = v; mats.glass.thickness = v === 'solid' ? 0.6 : 0; apply('materials');
  }, 'Solid glass bends light through its volume, so you see the room upside down in it. Thin glass (a bubble, a bauble) has no volume, so it barely bends anything.');
  ui.toggle('Glossy floor', false, v => { state.glossy = v; apply('materials'); });
  ui.toggle('Depth of field', false, v => { state.dof = v; apply('camera'); }, 'Path traced only: a real aperture, with six blades.');
  ui.slider('Focus distance', { min: 1.5, max: 6, step: 0.05, value: state.focus, unit: 'm' }, v => { state.focus = v; apply('camera'); },
    'From the starting view: glass ≈ 3.3 m, gold ring ≈ 3.5 m, teapot ≈ 4.0 m.');
  ui.slider('Aperture', { min: 1.2, max: 16, step: 0.1, value: state.fstop, fmt: v => `f/${v}` }, v => { state.fstop = v; apply('camera'); });
  ui.slider('Exposure', { min: -3, max: 3, step: 0.25, value: 0, fmt: v => `${v > 0 ? '+' : ''}${v} EV` }, v => { state.ev = v; });

  await setEnv();
  apply();
  started = true;
  if (state.mode !== 'raster') { ctx.hint('Building the path tracer…'); await pt.sync(); ctx.hint(''); }
}
