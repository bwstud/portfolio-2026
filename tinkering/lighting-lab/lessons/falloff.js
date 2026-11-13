/* Lesson 1: inverse-square and cosine law, with a false-colour illuminance view and a probe. */
import { TURBO_GLSL, legend, num } from '../shared.js';

export default async function (ctx, ui) {
  const { THREE, scene, camera, controls, renderer } = ctx;
  camera.position.set(5.5, 4.2, 6.5);
  controls.target.set(0, 0.6, 0);
  scene.background = new THREE.Color(0x07080a);

  const state = { I: 200, h: 1.5, x: 0, decay: 2, view: 'render', albedo: 0.8, ev: -5 };

  /* the bulb */
  const light = new THREE.PointLight(0xffffff, state.I, 0, 2);
  light.castShadow = false;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 24, 12), new THREE.MeshBasicMaterial({ color: 0xfff4e0 }));
  light.add(bulb);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 6), new THREE.MeshBasicMaterial({ color: 0x555555 }));
  scene.add(light, cord);

  /* floor and wall share one false-colour material, which computes E analytically per pixel */
  const fcMat = new THREE.ShaderMaterial({
    uniforms: { lightPos: { value: new THREE.Vector3() }, I: { value: 1 }, decay: { value: 2 }, lo: { value: -1 }, hi: { value: 3 } },
    vertexShader: /* glsl */`
      varying vec3 vPos; varying vec3 vN;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vPos = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform vec3 lightPos; uniform float I, decay, lo, hi; varying vec3 vPos; varying vec3 vN;
      ${TURBO_GLSL}
      void main() {
        vec3 L = lightPos - vPos; float d = length(L);
        float cosT = max(dot(normalize(vN), L / d), 0.0);
        float E = I * cosT / pow(max(d, 0.01), decay);              // the whole lesson, in one line
        float t = (log(max(E, 1e-6)) / log(10.0) - lo) / (hi - lo); // log10 scale for the legend
        vec3 c = turbo(t);
        // contour lines every decade make the falloff readable
        float dec = log(max(E, 1e-6)) / log(10.0) * 4.0;
        float line = smoothstep(0.0, fwidth(dec) * 1.2, abs(fract(dec) - 0.5) - 0.47);
        gl_FragColor = vec4(c * mix(0.55, 1.0, 1.0 - line), 1.0);
      }`,
  });
  const litMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), litMat);
  floor.rotation.x = -Math.PI / 2;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(12, 4), litMat);
  wall.position.set(0, 2, -3);
  scene.add(floor, wall);
  const grid = new THREE.GridHelper(12, 12, 0x000000, 0x000000);
  grid.material.opacity = 0.18; grid.material.transparent = true; grid.position.y = 0.002;
  scene.add(grid);

  /* probe */
  const probe = { point: new THREE.Vector3(1.5, 0, 0), normal: new THREE.Vector3(0, 1, 0) };
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.09, 32), new THREE.MeshBasicMaterial({ color: 0xffb45e, side: THREE.DoubleSide, depthTest: false }));
  marker.renderOrder = 10;
  const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const ray = new THREE.Line(rayGeo, new THREE.LineDashedMaterial({ color: 0xffb45e, dashSize: 0.08, gapSize: 0.06, depthTest: false }));
  ray.renderOrder = 10;
  const normalArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.5, 0x8fc4ff, 0.1, 0.06);
  scene.add(marker, ray, normalArrow);

  const raycaster = new THREE.Raycaster();
  ctx.onClick(e => {
    raycaster.setFromCamera(ctx.ndc(e), camera);
    const hit = raycaster.intersectObjects([floor, wall])[0];
    if (!hit) return;
    probe.point.copy(hit.point);
    probe.normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
    update();
  });
  ctx.hint('Click the floor or wall to probe it · drag to orbit');

  function update() {
    light.position.set(state.x, state.h, 0);
    light.intensity = state.I;
    light.decay = state.decay;
    cord.scale.y = Math.max(0.01, 4 - state.h); cord.position.set(state.x, state.h + cord.scale.y / 2, 0);
    litMat.color.setScalar(state.albedo);
    const fc = state.view === 'false';
    floor.material = wall.material = fc ? fcMat : litMat;
    fcMat.uniforms.lightPos.value.copy(light.position);
    fcMat.uniforms.I.value = state.I;
    fcMat.uniforms.decay.value = state.decay;
    renderer.toneMappingExposure = Math.pow(2, state.ev);
    renderer.toneMapping = fc ? THREE.NoToneMapping : THREE.NeutralToneMapping;

    // probe maths, in the same form as the formula on the right
    const L = light.position.clone().sub(probe.point);
    const d = L.length();
    const cosT = Math.max(0, probe.normal.dot(L.clone().normalize()));
    const theta = Math.acos(Math.min(1, cosT)) * 180 / Math.PI;
    const E = state.I * cosT / Math.pow(Math.max(d, 0.01), state.decay);
    const Lum = state.albedo * E / Math.PI;
    marker.position.copy(probe.point).addScaledVector(probe.normal, 0.004);
    marker.lookAt(probe.point.clone().add(probe.normal));
    rayGeo.setFromPoints([light.position, probe.point]); ray.computeLineDistances();
    normalArrow.position.copy(probe.point); normalArrow.setDirection(probe.normal);

    const dPow = state.decay === 2 ? 'd²' : state.decay === 1 ? 'd' : '1';
    ctx.readout(`
      <span class="eq">E = I · cos θ / ${dPow}</span><hr>
      <span class="k">I</span>      <span class="v">${num(state.I)} cd</span><br>
      <span class="k">d</span>      <span class="v">${num(d)} m</span>   <span class="k">θ</span> <span class="v">${theta.toFixed(0)}°</span>   <span class="k">cos θ</span> <span class="v">${cosT.toFixed(2)}</span><br>
      <span class="k">E</span>      <span class="v">${num(state.I)} × ${cosT.toFixed(2)} / ${state.decay === 0 ? '1' : num(Math.pow(d, state.decay))} = ${num(E)} lux</span><br>
      <span class="k">L</span>      <span class="v">ρE/π = ${state.albedo.toFixed(2)} × ${num(E)} / π = ${num(Lum)} nits</span>
      ${fc ? `<hr><span class="k">illuminance, lux (log scale, lines every ×1.78)</span>${legend(12, ['0.1', '1', '10', '100', '1000'])}` : ''}
    `);
  }

  ui.seg('View', [{ value: 'render', label: 'Render' }, { value: 'false', label: 'False colour (lux)' }], 'render', v => { state.view = v; update(); },
    'False colour shows the light arriving (E) before the material or camera touch it.');
  const iS = ui.slider('Bulb intensity', { min: 1, max: 10000, value: state.I, log: true, unit: 'cd' }, v => { state.I = v; update(); });
  const hS = ui.slider('Bulb height', { min: 0.2, max: 3.8, step: 0.05, value: state.h, unit: 'm' }, v => { state.h = v; update(); });
  ui.slider('Bulb position', { min: -4, max: 4, step: 0.05, value: state.x, unit: 'm' }, v => { state.x = v; update(); });
  ui.seg('Decay', [{ value: 2, label: '2 · physical' }, { value: 1, label: '1' }, { value: 0, label: '0 · none' }], 2, v => { state.decay = +v; update(); },
    'The exponent on d. Only 2 matches reality.');
  ui.slider('Surface albedo ρ', { min: 0.02, max: 1, step: 0.01, value: state.albedo }, v => { state.albedo = v; update(); },
    'Fraction of light a matte surface reflects. Fresh snow ≈ 0.9, concrete ≈ 0.3, asphalt ≈ 0.05.');
  ui.slider('Camera exposure', { min: -10, max: 4, step: 0.25, value: state.ev, fmt: v => `${v > 0 ? '+' : ''}${v} EV` }, v => { state.ev = v; update(); },
    'How much the camera multiplies light by (×2 per step). Lesson 4 is all about this.');
  ui.buttons([
    { label: 'Candle · 1 cd', onClick: () => preset(1, 0.4) },
    { label: 'Bulb · 65 cd', onClick: () => preset(65, 2.4) },
    { label: 'Work light · 800 cd', onClick: () => preset(800, 2) },
  ]);
  function preset(I, h) { iS.set(I); hS.set(h); }
  update();
}
