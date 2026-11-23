/* Lesson 4: render linear HDR into a float target, then do exposure → tone map → encode by hand
   in a full-screen shader, so every step of the image pipeline is visible and switchable. */
import { TONEMAP_GLSL, TONEMAP_JS, TURBO_GLSL, srgbEncode, turboCSS } from '../shared.js';

const OPS = ['None (clip)', 'Reinhard', 'ACES', 'AgX', 'Neutral'];

export default async function (ctx, ui) {
  const { THREE, scene, camera, controls, renderer, size } = ctx;
  camera.position.set(0.25, 1.3, 4.3);
  controls.target.set(0, 0.85, 0);
  renderer.toneMapping = THREE.NoToneMapping;   // we do it ourselves below

  const state = { ev: 0, op: 3, view: 'image', enc: 0, blue: 6, bg: 'lebombo' };

  /* objects with known values: 18% grey, white, saturated red, a saturated blue lamp, and a stop chart */
  const sph = (c, r, x, y, z, opt = {}) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 64, 32), new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.6, ...opt })); m.position.set(x, y, z); scene.add(m); return m; };
  sph(new THREE.Color(0.18, 0.18, 0.18), 0.28, -0.75, 0.85, 0);
  sph(new THREE.Color(0.9, 0.9, 0.9), 0.28, -0.1, 0.85, 0.15);
  sph(new THREE.Color(0.8, 0.02, 0.02), 0.28, 0.55, 0.85, 0, { roughness: 0.15, clearcoat: 1 });
  const blueMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.15, 1) });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 32, 16), blueMat);
  orb.position.set(1.15, 1.25, -0.2);
  const blueLight = new THREE.PointLight(new THREE.Color(0.05, 0.15, 1), 1, 0, 2);
  orb.add(blueLight);
  scene.add(orb);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.57, 48), new THREE.MeshPhysicalMaterial({ color: 0x777069, roughness: 0.8 }));
  stand.position.set(-0.1, 0.285, 0.05); scene.add(stand);
  const chart = new THREE.Group();
  for (let i = 0; i < 11; i++) {   // stops −5 … +5 around middle grey, self-lit so their values are exact
    const v = 0.18 * Math.pow(2, i - 5);
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshBasicMaterial({ color: new THREE.Color(v, v, v) }));
    tile.position.set((i - 5) * 0.18, 0, 0);
    chart.add(tile);
  }
  chart.position.set(0.15, 1.5, -0.6);
  scene.add(chart);

  /* linear HDR target and the display shader */
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { tex: { value: rt.texture }, exposure: { value: 1 }, op: { value: 3 }, enc: { value: 0 }, falseColor: { value: false } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */`
      uniform sampler2D tex; uniform float exposure; uniform int op, enc; uniform bool falseColor; varying vec2 vUv;
      ${TONEMAP_GLSL}
      ${TURBO_GLSL}
      void main() {
        vec3 radiance = texture2D(tex, vUv).rgb;          // linear, unbounded scene light
        vec3 exposed = radiance * exposure;                // 1. exposure
        if (falseColor) {
          float Y = dot(exposed, vec3(0.2126, 0.7152, 0.0722));
          float stops = floor(log2(max(Y, 1e-6) / 0.18) + 0.5);   // whole stops from middle grey
          gl_FragColor = vec4(turbo((stops + 7.0) / 14.0), 1.0);
          return;
        }
        vec3 display = tonemap(exposed, op);               // 2. tone map to 0..1
        vec3 outc = display;                               // 3. encode for the screen
        if (enc == 0) outc = srgbEncode(display);                  // correct
        if (enc == 2) outc = srgbEncode(srgbEncode(display));      // the double-encode bug
        gl_FragColor = vec4(outc, 1.0);                    // enc == 1 leaves it linear: the "forgot" bug
      }`,
    depthTest: false, depthWrite: false,
  }));
  const quadScene = new THREE.Scene(); quadScene.add(quad);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  ctx.cleanup(() => rt.dispose());
  ctx.onResize(s => rt.setSize(s.w * renderer.getPixelRatio(), s.h * renderer.getPixelRatio()));
  rt.setSize(size.w * renderer.getPixelRatio(), size.h * renderer.getPixelRatio());
  ctx.setRender(() => {
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(quadScene, quadCam);
  });

  /* backgrounds: the actual HDR images, so the window really is thousands of times brighter */
  const pick = async name => {
    const [tex, env] = await Promise.all([ctx.hdri(name), ctx.envMap(name)]);
    scene.background = tex; scene.environment = env;
  };

  /* tone curve plot */
  function readout() {
    const u = quad.material.uniforms;
    u.exposure.value = Math.pow(2, state.ev); u.op.value = state.op; u.enc.value = state.enc; u.falseColor.value = state.view === 'false';
    blueLight.intensity = state.blue * 0.06;
    blueMat.color.setRGB(0.05, 0.15, 1).multiplyScalar(state.blue);
    const fc = state.view === 'false';
    ctx.readout(`
      <span class="eq">pixel = encode(tonemap(radiance × 2<sup>EV</sup>))</span><hr>
      <span class="k">exposure</span> <span class="v">${state.ev > 0 ? '+' : ''}${state.ev} EV = × ${Math.pow(2, state.ev).toFixed(state.ev < -3 ? 3 : 2)}</span><br>
      <span class="k">tone map</span> <span class="v">${OPS[state.op]}</span>   <span class="k">encode</span> <span class="v">${['sRGB', 'none', 'sRGB twice'][state.enc]}</span><br>
      ${fc ? `<hr><span class="k">stops from middle grey</span><div class="legend">${Array.from({ length: 15 }, (_, i) => `<span style="flex:1;background:${turboCSS(i / 14)}"></span>`).join('')}</div><div class="legend-l"><span>−7</span><span>0 (18% grey)</span><span>+7</span></div>`
        : `<hr><span class="k">tone curve: scene stops → screen</span><br><canvas id="curve" width="300" height="130" style="width:300px;height:130px;max-width:100%"></canvas>`}`);
    if (!fc) drawCurve(document.getElementById('curve'));
  }
  function drawCurve(cv) {
    if (!cv) return;
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, pad = 18;
    g.clearRect(0, 0, W, H);
    g.font = '10px ui-monospace, monospace'; g.fillStyle = '#6f6e6a';
    const X = s => pad + (s + 8) / 16 * (W - pad * 2), Y = v => H - pad - v * (H - pad * 2);
    g.strokeStyle = 'rgba(255,255,255,.1)'; g.lineWidth = 1;
    for (let s = -8; s <= 8; s += 2) { g.beginPath(); g.moveTo(X(s), Y(0)); g.lineTo(X(s), Y(1)); g.stroke(); }
    g.beginPath(); g.moveTo(X(-8), Y(1)); g.lineTo(X(8), Y(1)); g.stroke();
    g.fillText('−8', X(-8) - 6, H - 4); g.fillText('0', X(0) - 3, H - 4); g.fillText('+8', X(8) - 8, H - 4); g.fillText('1.0', 0, Y(1) + 3);
    const plot = (fn, color, w) => {
      g.strokeStyle = color; g.lineWidth = w; g.beginPath();
      for (let i = 0; i <= 160; i++) {
        const s = -8 + i / 10, x = 0.18 * Math.pow(2, s) * Math.pow(2, state.ev);
        const out = srgbEncode(fn([x, x, x])[1]);
        i ? g.lineTo(X(s), Y(out)) : g.moveTo(X(s), Y(out));
      }
      g.stroke();
    };
    plot(TONEMAP_JS[0], 'rgba(255,255,255,.25)', 1);
    plot(TONEMAP_JS[state.op], '#ffb45e', 2);
    g.fillStyle = '#8fc4ff'; g.fillRect(X(0) - 1, Y(0), 2, Y(1) - Y(0) + (H - pad * 2));
    g.fillText('18% grey', X(0) + 4, Y(0.08));
  }

  ui.slider('Exposure', { min: -6, max: 6, step: 0.25, value: 0, fmt: v => `${v > 0 ? '+' : ''}${v} EV` }, v => { state.ev = v; readout(); });
  ui.seg('Tone mapping', OPS.map((l, i) => ({ value: i, label: l.replace(' (clip)', '') })), 3, v => { state.op = +v; readout(); });
  ui.seg('View', [{ value: 'image', label: 'Image' }, { value: 'false', label: 'False colour (stops)' }], 'image', v => { state.view = v; readout(); });
  ui.seg('Output encoding', [{ value: 0, label: 'sRGB' }, { value: 1, label: 'Forgot to encode' }, { value: 2, label: 'Encoded twice' }], 0, v => { state.enc = +v; readout(); },
    'The last step. Only sRGB is right for a normal screen.');
  ui.slider('Blue lamp', { min: 1, max: 5000, value: state.blue, log: true, unit: 'nits' }, v => { state.blue = v; readout(); },
    'A very saturated, very bright light: the hardest test for a tone mapper.');
  ui.seg('Surroundings', [{ value: 'lebombo', label: 'Room with windows' }, { value: 'outdoor', label: 'Open sky' }, { value: 'studio', label: 'Studio' }], 'lebombo', v => { state.bg = v; pick(v); });
  await pick(state.bg);
  readout();
}
