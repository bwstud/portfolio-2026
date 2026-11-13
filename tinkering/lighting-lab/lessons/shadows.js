/* Lesson 3: shadow maps, bias, resolution, filtering and the light's frustum. */
import { num } from '../shared.js';

export default async function (ctx, ui) {
  const { THREE, scene, camera, controls, renderer } = ctx;
  camera.position.set(3.6, 2.6, 4.4);
  controls.target.set(0, 0.5, 0);
  renderer.toneMapping = THREE.AgXToneMapping;
  scene.background = new THREE.Color(0x0e1013);
  scene.add(new THREE.HemisphereLight(0x9fb4d0, 0x30281f, 0.35));

  const state = { type: 'sun', size: 1024, filter: 'pcf', radius: 2, bias: -0.0005, nbias: 0.02, frustum: 4, elev: 38, helper: false };

  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; scene.add(o); return o; };
  const floor = add(new THREE.PlaneGeometry(20, 20), mat(0xb9b4aa), 0, 0, 0);
  floor.rotation.x = -Math.PI / 2;
  add(new THREE.BoxGeometry(0.7, 0.7, 0.7), mat(0xd26b3c), -1.1, 0.35, 0.2).rotation.y = 0.5;
  add(new THREE.SphereGeometry(0.42, 64, 32), mat(0xe6e1d6), 0.25, 0.42, -0.6);
  add(new THREE.TorusKnotGeometry(0.28, 0.09, 160, 24), mat(0x3d6fb6), 1.25, 0.55, 0.5);
  add(new THREE.CylinderGeometry(0.035, 0.035, 1.4, 16), mat(0x333333), 0.1, 0.7, 1.1);   // thin pole: peter-panning shows here
  const board = add(new THREE.BoxGeometry(1.4, 0.03, 0.8), mat(0xc9b38a), -0.9, 0.45, -1.2); // shallow slope: acne shows here
  board.rotation.z = 0.32;

  let light = null, helper = null;
  function makeLight() {
    if (light) { scene.remove(light, light.target); light.shadow.map?.dispose(); light.dispose(); }
    if (helper) { scene.remove(helper); helper.dispose(); helper = null; }
    if (state.type === 'sun') light = new THREE.DirectionalLight(0xfff1de, 3.2);
    if (state.type === 'spot') light = new THREE.SpotLight(0xfff1de, 90, 0, Math.PI / 6, 0.25, 2);
    if (state.type === 'point') light = new THREE.PointLight(0xfff1de, 30, 0, 2);
    light.castShadow = true;
    light.target?.position.set(0, 0.3, 0);
    scene.add(light);
    if (light.target) scene.add(light.target);
    apply();
  }

  function apply() {
    renderer.shadowMap.type = { hard: THREE.BasicShadowMap, pcf: THREE.PCFShadowMap, vsm: THREE.VSMShadowMap }[state.filter];
    const e = state.elev * Math.PI / 180;
    const dist = state.type === 'sun' ? 8 : 4.2;
    light.position.set(-Math.cos(e) * dist * 0.6, Math.sin(e) * dist, Math.cos(e) * dist * 0.8);
    if (state.type === 'point') light.position.multiplyScalar(0.45).add(new THREE.Vector3(0, 0.6, 0));
    const sh = light.shadow;
    if (sh.mapSize.x !== state.size) { sh.mapSize.set(state.size, state.size); sh.map?.dispose(); sh.map = null; }
    sh.bias = state.bias;
    sh.normalBias = state.nbias;
    sh.radius = state.radius;
    sh.blurSamples = 16;
    if (state.type === 'sun') {
      const f = state.frustum;
      Object.assign(sh.camera, { left: -f, right: f, top: f, bottom: -f, near: 0.5, far: 20 });
    }
    sh.camera.updateProjectionMatrix();
    // switching shadow filter changes shader code, so materials must recompile
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    if (helper) { scene.remove(helper); helper.dispose(); helper = null; }
    if (state.helper) { helper = new THREE.CameraHelper(sh.camera); scene.add(helper); }
    readout();
  }

  function readout() {
    let texel = '';
    if (state.type === 'sun') texel = `${num(state.frustum * 2 / state.size * 100)} cm`;
    else {
      const d = light.position.length();
      const fov = state.type === 'spot' ? light.angle * 2 : Math.PI / 2;
      texel = `≈ ${num(2 * d * Math.tan(fov / 2) / state.size * 100)} cm at the floor`;
    }
    ctx.readout(`
      <span class="k">light</span> <span class="v">${{ sun: 'directional · orthographic shadow camera', spot: 'spot · perspective shadow camera', point: 'point · six-sided cube shadow' }[state.type]}</span><br>
      <span class="k">map</span> <span class="v">${state.size} × ${state.size}${state.type === 'point' ? ' × 6' : ''}</span>   <span class="k">one texel ≈</span> <span class="v">${texel}</span><br>
      <span class="k">filter</span> <span class="v">${{ hard: 'none (one comparison)', pcf: 'PCF (average of nearby comparisons)', vsm: 'VSM (blurred depth statistics)' }[state.filter]}</span><br>
      <span class="k">bias</span> <span class="v">${state.bias.toFixed(4)}</span>   <span class="k">normal bias</span> <span class="v">${state.nbias.toFixed(3)}</span>`);
  }

  const relight = () => makeLight();
  ui.seg('Light', [{ value: 'sun', label: 'Sun' }, { value: 'spot', label: 'Spot' }, { value: 'point', label: 'Point' }], 'sun', v => { state.type = v; relight(); });
  ui.slider('Light elevation', { min: 8, max: 85, step: 1, value: state.elev, unit: '°' }, v => { state.elev = v; light && apply(); },
    'Low sun gives long shadows and makes acne and aliasing worse.');
  ui.seg('Shadow map size', [256, 512, 1024, 2048, 4096].map(n => ({ value: n, label: String(n) })), 1024, v => { state.size = +v; light && apply(); });
  ui.seg('Filter', [{ value: 'hard', label: 'Hard' }, { value: 'pcf', label: 'PCF' }, { value: 'vsm', label: 'VSM' }], 'pcf', v => { state.filter = v; light && apply(); });
  ui.slider('Blur radius', { min: 0, max: 12, step: 0.5, value: state.radius }, v => { state.radius = v; light && apply(); },
    'Softens PCF and VSM edges by the same amount everywhere. Real penumbrae don\'t work that way.');
  ui.slider('Bias', { min: -0.01, max: 0.002, step: 0.0001, value: state.bias, fmt: v => v.toFixed(4) }, v => { state.bias = v; light && apply(); },
    'Pushes the depth comparison toward the light. Too little gives acne, too much detaches shadows.');
  ui.slider('Normal bias', { min: 0, max: 0.2, step: 0.005, value: state.nbias, fmt: v => v.toFixed(3) }, v => { state.nbias = v; light && apply(); },
    'Offsets along the surface normal instead. It fixes acne on slopes with less peter-panning.');
  ui.slider('Sun frustum half-width', { min: 1, max: 12, step: 0.25, value: state.frustum, unit: 'm' }, v => { state.frustum = v; light && apply(); },
    'The area the sun\'s shadow map covers. Smaller is sharper, but shadows outside it vanish.');
  ui.toggle('Show the light\'s view', false, v => { state.helper = v; light && apply(); }, 'Draws the shadow camera\'s frustum.');
  makeLight();
  ctx.cleanup(() => { light?.shadow.map?.dispose(); helper?.dispose(); });
}
