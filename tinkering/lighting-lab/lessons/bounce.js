/* Lesson 6: the Cornell box, raster (direct + cheats) against path traced (real bounces). */
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { cornellBox, CORNELL, num } from '../shared.js';
import { makePathTracer } from '../pt.js';

export default async function (ctx, ui) {
  const { THREE, scene, camera, controls, renderer } = ctx;
  RectAreaLightUniformsLib.init();
  const c = CORNELL.camera;
  camera.position.set(...c.pos); camera.fov = c.fov; camera.updateProjectionMatrix();
  controls.target.set(...c.target);
  renderer.toneMapping = THREE.AgXToneMapping;
  scene.background = new THREE.Color(0x000000);

  const state = { mode: 'raster', rlight: 'point', fill: 'none', bounces: 4, size: 0.5, L: 60 };

  const { group } = cornellBox();
  scene.add(group);

  /* the light: an area light (what the path tracer uses) plus a matching point light with a shadow map for raster */
  const area = new THREE.RectAreaLight(0xfff3e4, state.L, state.size, state.size);
  area.position.set(0, 1.995, 0);
  area.lookAt(0, 0, 0);
  const point = new THREE.PointLight(0xfff3e4, 1, 0, 2);
  point.position.set(0, 1.9, 0);
  point.castShadow = true;
  point.shadow.mapSize.set(1024, 1024);
  point.shadow.bias = -0.002; point.shadow.normalBias = 0.01; point.shadow.radius = 3;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  panel.rotation.x = Math.PI / 2; panel.position.y = 1.994;
  const ambient = new THREE.AmbientLight(0xffffff, 0);
  const hemi = new THREE.HemisphereLight(0xfff3e4, 0x8a8178, 0);
  scene.add(area, point, panel, ambient, hemi);

  const pt = makePathTracer(ctx, { bounces: state.bounces, maxSamples: 3000 });
  /* path traced: area light only. raster: whichever light the user picked, plus the fill cheat */
  pt.beforeSync = () => { area.visible = true; point.visible = false; panel.visible = false; ambient.visible = hemi.visible = false; };
  pt.afterSync = () => {
    area.visible = state.rlight === 'area';
    point.visible = state.rlight === 'point';
    panel.visible = true;
    ambient.visible = hemi.visible = true;
  };
  ctx.setRender(() => pt.render());

  function apply(what = 'lights') {
    area.width = area.height = state.size;
    area.intensity = state.L;
    panel.scale.set(state.size, state.size, 1);
    panel.material.color.setScalar(state.L);   // the panel's own brightness, in the same units
    // same power: a flat emitter of luminance L and area A has intensity ≈ L·A candela straight down
    point.intensity = state.L * state.size * state.size;
    ambient.intensity = state.fill === 'ambient' ? 0.25 : 0;
    hemi.intensity = state.fill === 'hemi' ? 0.35 : 0;
    pt.setBounces(state.bounces);
    if (pt.ready) { if (what === 'lights') pt.updateLights(); pt.reset(); }
    pt.afterSync();
    const raster = state.mode !== 'pt';
    ctx.readout(`
      <span class="k">light</span> <span class="v">${state.size.toFixed(2)} × ${state.size.toFixed(2)} m at ${num(state.L)} nits ≈ ${num(point.intensity)} cd down</span><br>
      <span class="k">floor centre, direct</span> <span class="v">≈ ${num(point.intensity / 4)} lux</span><br>
      ${state.mode !== 'raster' ? `<span class="k">path traced</span> <span class="v">${state.bounces} bounce${state.bounces > 1 ? 's' : ''}${state.bounces === 1 ? ' (direct light only)' : ''}</span><br>` : ''}
      ${raster ? `<span class="k">raster</span> <span class="v">${state.rlight === 'point' ? 'point light + shadow map' : 'area light (no shadows)'}${state.fill === 'none' ? ', direct only' : state.fill === 'ambient' ? ', + flat ambient' : ', + hemisphere'}</span>` : ''}`);
  }

  ui.seg('Renderer', [{ value: 'raster', label: 'Raster' }, { value: 'pt', label: 'Path traced' }, { value: 'compare', label: 'Compare' }], 'raster', async v => {
    state.mode = v; pt.setMode(v);
    if (v !== 'raster' && !pt.ready) { ctx.hint('Building the path tracer…'); await pt.sync(); ctx.hint(''); }
    apply('none');
  }, 'Compare puts raster on the left and path traced on the right. Drag the white handle.');
  ui.slider('Bounces (path traced)', { min: 1, max: 10, step: 1, value: state.bounces }, v => { state.bounces = v; apply('none'); },
    '1 = direct light only. Each extra bounce adds light that has bounced once more.');
  ui.label('Raster fill');
  ui.seg('', [{ value: 'none', label: 'Direct only' }, { value: 'ambient', label: 'Flat ambient' }, { value: 'hemi', label: 'Hemisphere' }], 'none', v => { state.fill = v; apply('none'); });
  ui.seg('Raster light', [{ value: 'point', label: 'Point + shadow map' }, { value: 'area', label: 'Area (no shadows)' }], 'point', v => { state.rlight = v; apply('none'); },
    'three.js area lights shade nicely but can\'t cast shadows.');
  ui.slider('Light size', { min: 0.1, max: 1.4, step: 0.05, value: state.size, unit: 'm' }, v => { state.size = v; apply(); });
  ui.slider('Light luminance', { min: 5, max: 500, value: state.L, log: true, unit: 'nits' }, v => { state.L = v; apply(); });
}
