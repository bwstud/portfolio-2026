/* Portrait generation: stubbed and deliberately not surfaced in the page.

   The idea: frame the tree, capture a high-resolution render plus a depth pass, and send both to an
   image model that takes depth guidance, with a prompt built from the species, pot, setting and
   season. Depth guidance keeps the tree's silhouette while the model relights and re-renders it.

   What's needed to switch it on:
   1. A server function at /api/portrait that holds the API key and calls the model. The site is
      static, so add an `api/` folder (and allow it in .vercelignore) or host the function elsewhere.
   2. A limit on use (rate limit, passphrase, or the visitor's own key), since the page is public.
   3. UI: a framing overlay with phone and laptop aspect ratios, and a button that calls
      capturePortrait() then requestPortrait().

   For now, load the page with ?portrait and call window.bonsaiPortrait.capture() in the console to
   download the capture this would send. */

import * as THREE from 'three';

export const ASPECTS = { laptop: 16 / 10, phone: 9 / 19.5, square: 1 };

/* Renders the current view at the given size. Returns PNG blobs for the colour image and the
   depth guide (near is white). */
export async function capturePortrait({ renderer, scene, camera, composer, width = 2560, aspect = ASPECTS.laptop }) {
  const height = Math.round(width / aspect);
  const prev = { size: renderer.getSize(new THREE.Vector2()), ratio: renderer.getPixelRatio(), aspect: camera.aspect };
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  composer.setPixelRatio(1);
  composer.setSize(width, height);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();

  composer.render();
  const image = await canvasBlob(renderer.domElement);

  const depthMat = new THREE.MeshDepthMaterial();
  const bg = scene.background;
  scene.overrideMaterial = depthMat;
  scene.background = new THREE.Color(0x000000);
  const near = camera.near, far = camera.far;
  camera.near = 0.05; camera.far = 3; camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const depth = await canvasBlob(renderer.domElement);
  scene.overrideMaterial = null;
  scene.background = bg;
  camera.near = near; camera.far = far;

  renderer.setPixelRatio(prev.ratio);
  renderer.setSize(prev.size.x, prev.size.y, false);
  composer.setPixelRatio(prev.ratio);
  composer.setSize(prev.size.x, prev.size.y);
  camera.aspect = prev.aspect;
  camera.updateProjectionMatrix();
  return { image, depth, width, height };
}

const canvasBlob = c => new Promise(res => c.toBlob(res, 'image/png'));

export function portraitPrompt({ species, pot, setting, season, style = 'soft morning light' }) {
  return [
    `A photorealistic portrait of a ${species} bonsai in a ${pot}, displayed in a ${setting}.`,
    `${season}. ${style}, shallow depth of field, cinematic, fine detail in bark and leaves.`,
    'Keep the tree’s exact silhouette and branch structure from the depth guide.',
  ].join(' ');
}

/* Not connected: there is no /api/portrait yet. */
export async function requestPortrait({ image, depth }, prompt, { endpoint = '/api/portrait' } = {}) {
  const body = new FormData();
  body.append('image', image, 'image.png');
  body.append('depth', depth, 'depth.png');
  body.append('prompt', prompt);
  const res = await fetch(endpoint, { method: 'POST', body });
  if (!res.ok) throw new Error(`Portrait service unavailable (${res.status})`);
  return res.blob();
}
