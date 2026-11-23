/* Lesson 2: diffuse vs specular, roughness, metalness and Fresnel. */
export default async function (ctx, ui) {
  const { THREE, scene, camera, controls, renderer } = ctx;
  camera.position.set(0, 1.4, 4.6);
  controls.target.set(0, 0.6, 0);
  renderer.toneMapping = THREE.AgXToneMapping;
  scene.background = new THREE.Color(0x0b0c0e);

  const state = { layout: 'one', color: '#c0392b', rough: 0.35, metal: 0, part: 'both', light: 'lamp', glossy: false, clearcoat: 0 };

  const key = new THREE.DirectionalLight(0xffffff, 3);
  key.position.set(-3, 4, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 });
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const env = await ctx.envMap('studio');

  const floorMat = new THREE.MeshPhysicalMaterial({ color: 0x2a2b2e, roughness: 0.9 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  scene.add(floor);

  const geo = new THREE.SphereGeometry(0.5, 96, 48);
  const balls = new THREE.Group();
  scene.add(balls);
  let mats = [];

  function build() {
    for (const c of [...balls.children]) { c.material.dispose(); balls.remove(c); }
    mats = [];
    const make = (rough, metal, x, z, r = 0.5) => {
      const m = new THREE.MeshPhysicalMaterial();
      m.userData = { rough, metal };
      const s = new THREE.Mesh(geo, m);
      s.scale.setScalar(r / 0.5);
      s.position.set(x, r, z);
      s.castShadow = s.receiveShadow = true;
      balls.add(s); mats.push(m);
    };
    if (state.layout === 'one') make(null, null, 0, 0, 0.6);
    if (state.layout === 'row') for (let i = 0; i < 7; i++) make(i / 6, null, (i - 3) * 0.72, 0, 0.3);
    if (state.layout === 'grid') for (let j = 0; j < 2; j++) for (let i = 0; i < 6; i++) make(i / 5, j, (i - 2.5) * 0.72, (j - 0.5) * -0.9, 0.3);
    apply();
  }

  function apply() {
    const color = new THREE.Color(state.color);
    for (const m of mats) {
      const rough = m.userData.rough ?? state.rough;
      const metal = m.userData.metal ?? state.metal;
      m.roughness = rough;
      m.metalness = metal;
      m.clearcoat = state.clearcoat;
      m.clearcoatRoughness = 0.05;
      // "diffuse only" removes the specular lobe; "specular only" removes the diffuse colour
      m.specularIntensity = state.part === 'diffuse' ? 0 : 1;
      m.color.copy(state.part === 'specular' && metal < 0.5 ? new THREE.Color(0x000000) : color);
      if (state.part === 'diffuse' && metal > 0.5) m.color.set(0x000000);   // a metal has no diffuse to show
    }
    floorMat.color.set(state.glossy ? 0x050505 : 0x2a2b2e);
    floorMat.roughness = state.glossy ? 0.04 : 0.9;
    key.visible = state.light !== 'env';
    scene.environment = state.light === 'lamp' ? null : env;
    scene.background = state.light === 'lamp' ? new THREE.Color(0x0b0c0e) : env;
    scene.backgroundIntensity = 0.4;
    scene.backgroundBlurriness = 0.35;
    readout();
  }

  function readout() {
    const f0 = state.metal > 0.5 ? `base colour (${state.color})` : '0.04 (4%)';
    const sch = th => { const c = Math.cos(th * Math.PI / 180); return 0.04 + 0.96 * Math.pow(1 - c, 5); };
    ctx.readout(`
      <span class="eq">F(θ) = F₀ + (1 − F₀)(1 − cos θ)⁵</span><hr>
      <span class="k">F₀ here</span> <span class="v">${f0}</span><br>
      <span class="k">non-metal F at</span> 0° <span class="v">${(sch(0) * 100).toFixed(0)}%</span> · 60° <span class="v">${(sch(60) * 100).toFixed(0)}%</span> · 80° <span class="v">${(sch(80) * 100).toFixed(0)}%</span> · 89° <span class="v">${(sch(89) * 100).toFixed(0)}%</span><br>
      <span class="k">roughness</span> <span class="v">${state.layout === 'one' ? state.rough.toFixed(2) : '0 → 1, left to right'}</span>
      ${state.layout === 'grid' ? '<br><span class="k">back row</span> <span class="v">non-metal</span> <span class="k">front row</span> <span class="v">metal</span>' : ''}`);
  }

  ui.seg('Layout', [{ value: 'one', label: 'One sphere' }, { value: 'row', label: 'Roughness row' }, { value: 'grid', label: 'Rough × metal' }], 'one', v => { state.layout = v; build(); });
  ui.color('Base colour', state.color, v => { state.color = v; apply(); });
  ui.slider('Roughness', { min: 0, max: 1, step: 0.01, value: state.rough }, v => { state.rough = v; apply(); },
    'How spread out the microfacets are. Ignored by the row and grid, which sweep it.');
  ui.slider('Metalness', { min: 0, max: 1, step: 1, value: state.metal, fmt: v => v ? '1 · metal' : '0 · non-metal' }, v => { state.metal = v; apply(); },
    'Real materials are one or the other. In-between values are for blends like dusty metal.');
  ui.seg('Show', [{ value: 'both', label: 'Both' }, { value: 'diffuse', label: 'Diffuse only' }, { value: 'specular', label: 'Specular only' }], 'both', v => { state.part = v; apply(); });
  ui.seg('Light', [{ value: 'lamp', label: 'One lamp' }, { value: 'env', label: 'Studio HDRI' }, { value: 'both', label: 'Both' }], 'lamp', v => { state.light = v; apply(); });
  ui.slider('Clearcoat', { min: 0, max: 1, step: 0.01, value: 0 }, v => { state.clearcoat = v; apply(); },
    'A second, glossy layer on top, like car paint or varnish.');
  ui.toggle('Glossy black floor', false, v => { state.glossy = v; apply(); }, 'Orbit down to a grazing angle to see Fresnel.');
  build();
}
