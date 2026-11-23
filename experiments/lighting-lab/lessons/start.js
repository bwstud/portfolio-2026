/* Lesson 0: a finished-looking scene to orient by. */
import { cyc, stillLife } from '../shared.js';

export default async function (ctx, ui) {
  const { THREE, scene, camera, controls, renderer } = ctx;
  camera.position.set(2.6, 1.5, 3.4);
  controls.target.set(0, 0.35, -0.2);
  controls.autoRotateSpeed = 0.6;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.1;

  scene.add(cyc());
  const { group } = await stillLife();
  scene.add(group);

  const lamp = new THREE.SpotLight(0xffe2c0, 60, 0, Math.PI / 7, 0.6, 2);
  lamp.position.set(-2.5, 3.2, 2);
  lamp.target.position.set(0, 0.2, -0.2);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(2048, 2048);
  lamp.shadow.bias = -0.0002;
  lamp.shadow.normalBias = 0.02;
  lamp.shadow.radius = 4;
  scene.add(lamp, lamp.target);

  const env = await ctx.envMap('studio');
  scene.background = new THREE.Color(0x111214);

  ui.toggle('Environment light (HDRI)', true, on => { scene.environment = on ? env : null; },
    'A photo of a small studio, used as light from every direction.');
  ui.toggle('Key lamp', true, on => { lamp.visible = on; }, 'One spot light with a shadow map.');
  ui.toggle('Turn slowly', true, on => { controls.autoRotate = on; });
  ctx.readout('<span class="k">raster · three.js</span><br><span class="k">tone mapping</span> <span class="v">AgX</span>');
}
