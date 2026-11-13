/* Lesson 7: a complete path tracer in one fragment shader. The shader source is shown in the
   tutor panel, so it is written to be read: plain names, one idea per block, comments on the maths. */
import { TONEMAP_GLSL, CORNELL } from '../shared.js';

export const TRACER = /* glsl */`// ---------- inputs ----------
uniform sampler2D prevFrame;   // the running average of every frame so far
uniform float frame;           // how many frames are already in that average
uniform vec2 resolution;
uniform vec3 camPos;
uniform mat4 camWorld, projInv;
uniform int maxBounces, mode, spp;
uniform bool useNEE;
uniform float lightSize, lightL;
uniform vec3 cRed, cGreen, cWhite;
varying vec2 vUv;

#define PI 3.14159265
#define DIFFUSE 0
#define METAL 1
#define GLASS 2
#define LIGHT 3

// ---------- random numbers (a PCG hash, seeded per pixel and per frame) ----------
uint seed;
float rand() {
  seed = seed * 747796405u + 2891336453u;
  uint w = ((seed >> ((seed >> 28u) + 4u)) ^ seed) * 277803737u;
  return float((w >> 22u) ^ w) / 4294967295.0;
}

// ---------- what a ray hit ----------
struct Hit { float t; vec3 p; vec3 n; vec3 albedo; int mat; bool front; };

bool sphere(vec3 c, float r, vec3 albedo, int mat, vec3 ro, vec3 rd, inout Hit h) {
  vec3 oc = ro - c;
  float b = dot(oc, rd), disc = b * b - dot(oc, oc) + r * r;
  if (disc < 0.0) return false;
  float t = -b - sqrt(disc);
  if (t < 1e-4) t = -b + sqrt(disc);           // we're inside (glass): take the far side
  if (t < 1e-4 || t > h.t) return false;
  h.t = t; h.p = ro + rd * t;
  vec3 n = (h.p - c) / r;
  h.front = dot(rd, n) < 0.0;                    // entering or leaving?
  h.n = h.front ? n : -n;                        // always face the ray
  h.albedo = albedo; h.mat = mat;
  return true;
}

// a rectangle on the plane where coordinate [axis] == k
bool rect(int axis, float k, vec2 lo, vec2 hi, vec3 albedo, int mat, vec3 ro, vec3 rd, inout Hit h) {
  if (abs(rd[axis]) < 1e-8) return false;
  float t = (k - ro[axis]) / rd[axis];
  if (t < 1e-4 || t > h.t) return false;
  vec3 p = ro + rd * t;
  vec2 q = axis == 0 ? p.yz : axis == 1 ? p.xz : p.xy;
  if (any(lessThan(q, lo)) || any(greaterThan(q, hi))) return false;
  vec3 n = vec3(0.0); n[axis] = 1.0;
  h.front = dot(rd, n) < 0.0;
  h.n = h.front ? n : -n;
  h.t = t; h.p = p; h.albedo = albedo; h.mat = mat;
  return true;
}

// ---------- the scene: a 2 m box open at the front, a ceiling light, three spheres ----------
bool scene(vec3 ro, vec3 rd, out Hit h) {
  h.t = 1e9;
  bool hit = false;
  float s = lightSize * 0.5;
  if (rect(1, 0.0,   vec2(-1.0, -1.0), vec2(1.0, 1.0), cWhite, DIFFUSE, ro, rd, h)) hit = true; // floor
  if (rect(1, 2.0,   vec2(-1.0, -1.0), vec2(1.0, 1.0), cWhite, DIFFUSE, ro, rd, h)) hit = true; // ceiling
  if (rect(2, -1.0,  vec2(-1.0, 0.0),  vec2(1.0, 2.0), cWhite, DIFFUSE, ro, rd, h)) hit = true; // back
  if (rect(0, -1.0,  vec2(0.0, -1.0),  vec2(2.0, 1.0), cRed,   DIFFUSE, ro, rd, h)) hit = true; // left
  if (rect(0, 1.0,   vec2(0.0, -1.0),  vec2(2.0, 1.0), cGreen, DIFFUSE, ro, rd, h)) hit = true; // right
  if (rect(1, 1.999, vec2(-s), vec2(s), vec3(lightL),    LIGHT,   ro, rd, h)) hit = true; // the light
  if (sphere(vec3(-0.45, 0.4, -0.35), 0.4, cWhite,             DIFFUSE, ro, rd, h)) hit = true;
  if (sphere(vec3(0.52, 0.3, -0.45),  0.3, vec3(0.95, 0.93, 0.88), METAL, ro, rd, h)) hit = true;
  if (sphere(vec3(0.25, 0.3, 0.45),   0.3, vec3(1.0),          GLASS,   ro, rd, h)) hit = true;
  return hit;
}

// ---------- sampling ----------
// A random direction around n, more likely near n: pdf = cos θ / π.
vec3 cosineSample(vec3 n) {
  float a = 2.0 * PI * rand(), r2 = rand(), r = sqrt(r2);
  vec3 t = normalize(cross(n, abs(n.x) > 0.5 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 b = cross(n, t);
  return normalize(t * cos(a) * r + b * sin(a) * r + n * sqrt(1.0 - r2));
}

// Next event estimation: pick a random point on the light and ask whether we can see it.
// Returns E / π, i.e. what a white Lambert surface here reflects toward any viewer.
vec3 directLight(vec3 p, vec3 n) {
  float s = lightSize * 0.5;
  vec3 q = vec3((rand() * 2.0 - 1.0) * s, 1.999, (rand() * 2.0 - 1.0) * s);
  vec3 L = q - p;
  float d2 = dot(L, L), d = sqrt(d2);
  L /= d;
  float cosSurface = dot(n, L);
  float cosLight = L.y;                          // the light faces straight down
  if (cosSurface <= 0.0 || cosLight <= 0.0) return vec3(0.0);
  Hit sh;
  if (scene(p + n * 1e-4, L, sh) && sh.t < d - 1e-3) return vec3(0.0);   // something is in the way
  // E = Le · cosθ_surface · cosθ_light · area / d²   (lesson 1's law, for a light with size)
  return vec3(lightL) * cosSurface * cosLight * lightSize * lightSize / (d2 * PI);
}

// ---------- one path ----------
vec3 trace(vec3 ro, vec3 rd) {
  vec3 radiance = vec3(0.0);     // light collected so far
  vec3 throughput = vec3(1.0);   // how much of any light found from here on will reach the camera
  bool lastWasSpecular = true;   // the camera ray counts as specular: it may see the light directly

  for (int bounce = 0; bounce < 16; bounce++) {
    if (bounce >= maxBounces) break;
    Hit h;
    if (!scene(ro, rd, h)) break;                          // out through the open front: the world is black

    if (mode == 0) return h.n * 0.5 + 0.5;                 // view: surface normals
    if (mode == 1) return h.mat == LIGHT ? vec3(1.0) : h.albedo;   // view: albedo

    if (h.mat == LIGHT) {
      // With NEE on, a diffuse bounce already counted this light, so only add it after a mirror,
      // glass or the camera. Otherwise we'd count it twice.
      if ((!useNEE || lastWasSpecular) && rd.y > 0.0) radiance += throughput * h.albedo;
      break;
    }

    if (h.mat == DIFFUSE) {
      // The rendering equation, estimated with one sample:
      if (useNEE) radiance += throughput * h.albedo * directLight(h.p, h.n);  // light from the lamp
      rd = cosineSample(h.n);                                               // pick the next direction
      ro = h.p + h.n * 1e-4;
      throughput *= h.albedo;               // f · cos θ / pdf = (albedo/π) · cos θ / (cos θ/π) = albedo
      lastWasSpecular = false;
    } else if (h.mat == METAL) {
      rd = reflect(rd, h.n);
      ro = h.p + h.n * 1e-4;
      throughput *= h.albedo;                // a metal's reflection is tinted by its colour
      lastWasSpecular = true;
    } else {                                 // glass: reflect or refract, chosen by Fresnel
      float eta = h.front ? 1.0 / 1.5 : 1.5;
      float cosI = min(dot(-rd, h.n), 1.0);
      float F = 0.04 + 0.96 * pow(1.0 - cosI, 5.0);       // Schlick, lesson 2
      bool tir = eta * eta * (1.0 - cosI * cosI) > 1.0;   // total internal reflection
      if (tir || rand() < F) { rd = reflect(rd, h.n); ro = h.p + h.n * 1e-4; }
      else { rd = refract(rd, h.n, eta); ro = h.p - h.n * 1e-4; }
      lastWasSpecular = true;
    }

    // Russian roulette: randomly end weak paths, and boost survivors so the average stays right.
    if (bounce > 3) {
      float q = max(throughput.r, max(throughput.g, throughput.b));
      if (rand() > q) break;
      throughput /= q;
    }
  }
  return radiance;
}

void main() {
  seed = (uint(gl_FragCoord.x) * 1973u + uint(gl_FragCoord.y) * 9277u + uint(frame) * 26699u) | 1u;
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    if (i >= spp) break;
    vec2 px = gl_FragCoord.xy + vec2(rand(), rand());        // jitter within the pixel: free antialiasing
    vec4 v = projInv * vec4(px / resolution * 2.0 - 1.0, 1.0, 1.0);
    vec3 dir = normalize((camWorld * vec4(v.xyz / v.w, 0.0)).xyz);
    sum += trace(camPos, dir);
  }
  vec3 color = sum / float(spp);
  vec3 prev = texture2D(prevFrame, vUv).rgb;
  gl_FragColor = vec4(mix(prev, color, 1.0 / (frame + 1.0)), 1.0);   // fold into the running average
}`;

export default async function (ctx, ui) {
  const { THREE, scene, camera, controls, renderer, size } = ctx;
  const c = CORNELL.camera;
  camera.position.set(...c.pos); camera.fov = c.fov; camera.updateProjectionMatrix();
  controls.target.set(...c.target);

  const state = { mode: 2, bounces: 6, nee: true, size: 0.5, L: 60, spp: 2, ev: 0, max: 20000 };
  const lin = hex => { const col = new THREE.Color(hex); return new THREE.Vector3(col.r, col.g, col.b); };

  const targets = [0, 1].map(() => new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType, depthBuffer: false }));
  let read = 0, frame = 0, t0 = performance.now(), convergedAt = null;
  const tracer = new THREE.ShaderMaterial({
    uniforms: {
      prevFrame: { value: null }, frame: { value: 0 }, resolution: { value: new THREE.Vector2() },
      camPos: { value: new THREE.Vector3() }, camWorld: { value: new THREE.Matrix4() }, projInv: { value: new THREE.Matrix4() },
      maxBounces: { value: 6 }, mode: { value: 2 }, spp: { value: 2 }, useNEE: { value: true },
      lightSize: { value: 0.5 }, lightL: { value: 60 },
      cRed: { value: lin(CORNELL.red) }, cGreen: { value: lin(CORNELL.green) }, cWhite: { value: lin(CORNELL.white) },
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: TRACER,
    depthTest: false, depthWrite: false,
  });
  const show = new THREE.ShaderMaterial({
    uniforms: { tex: { value: null }, exposure: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tex; uniform float exposure; varying vec2 vUv; ${TONEMAP_GLSL}
      void main() { gl_FragColor = vec4(srgbEncode(tmAgX(texture2D(tex, vUv).rgb * exposure)), 1.0); }`,
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), tracer);
  const qScene = new THREE.Scene(); qScene.add(quad);
  const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  scene.add(new THREE.Object3D());   // the lesson scene stays empty: everything is in the shader
  ctx.cleanup(() => { targets.forEach(t => t.dispose()); tracer.dispose(); show.dispose(); quad.geometry.dispose(); });

  const reset = () => { frame = 0; t0 = performance.now(); convergedAt = null; };
  const fit = s => { targets.forEach(t => t.setSize(s.w, s.h)); tracer.uniforms.resolution.value.set(s.w, s.h); reset(); };
  ctx.onResize(fit); fit(size);
  ctx.listen(controls, 'change', reset);

  ctx.setRender(() => {
    const u = tracer.uniforms;
    if (frame * state.spp < state.max) {
      camera.updateMatrixWorld();
      u.camPos.value.copy(camera.position);
      u.camWorld.value.copy(camera.matrixWorld);
      u.projInv.value.copy(camera.projectionMatrixInverse);
      u.frame.value = frame;
      u.prevFrame.value = targets[read].texture;
      quad.material = tracer;
      renderer.setRenderTarget(targets[1 - read]);
      renderer.render(qScene, qCam);
      renderer.setRenderTarget(null);
      read = 1 - read; frame++;
    } else if (!convergedAt) convergedAt = performance.now();
    show.uniforms.tex.value = targets[read].texture;
    show.uniforms.exposure.value = Math.pow(2, state.ev);
    quad.material = show;
    renderer.render(qScene, qCam);
    const secs = ((convergedAt || performance.now()) - t0) / 1000;
    ctx.badge(`${(frame * state.spp).toLocaleString('en-US')} samples per pixel · ${secs.toFixed(1)} s`);
  });

  function apply() {
    const u = tracer.uniforms;
    u.mode.value = state.mode; u.maxBounces.value = state.bounces; u.useNEE.value = state.nee;
    u.lightSize.value = state.size; u.lightL.value = state.L; u.spp.value = state.spp;
    reset();
    ctx.readout(`
      <span class="eq">pixel ≈ (1/N) Σ f · L<sub>i</sub> · cos θ / pdf</span><hr>
      <span class="k">view</span> <span class="v">${['first-hit normals', 'first-hit albedo', 'path traced'][state.mode]}</span><br>
      ${state.mode === 2 ? `<span class="k">max bounces</span> <span class="v">${state.bounces}</span>   <span class="k">NEE</span> <span class="v">${state.nee ? 'on' : 'off'}</span><br>
      <span class="k">light</span> <span class="v">${state.size.toFixed(2)} m square, ${state.L} nits</span>` : ''}`);
  }

  ui.seg('View', [{ value: 0, label: 'Normals' }, { value: 1, label: 'Albedo' }, { value: 2, label: 'Path traced' }], 2, v => { state.mode = +v; apply(); });
  ui.slider('Max bounces', { min: 1, max: 16, step: 1, value: state.bounces }, v => { state.bounces = v; apply(); });
  ui.toggle('Next event estimation', true, v => { state.nee = v; apply(); }, 'Aim a shadow ray at the light at every diffuse bounce.');
  ui.slider('Light size', { min: 0.05, max: 1.6, step: 0.05, value: state.size, unit: 'm' }, v => { state.size = v; apply(); });
  ui.slider('Light luminance', { min: 5, max: 2000, value: state.L, log: true, unit: 'nits' }, v => { state.L = v; apply(); });
  ui.slider('Samples per frame', { min: 1, max: 16, step: 1, value: state.spp }, v => { state.spp = v; apply(); },
    'More per frame converges faster but can make the page sluggish.');
  ui.slider('Exposure', { min: -4, max: 4, step: 0.25, value: 0, fmt: v => `${v > 0 ? '+' : ''}${v} EV` }, v => { state.ev = v; });
  ui.buttons([{ label: 'Restart sampling', onClick: reset }]);

  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const code = esc(TRACER).split('\n').map(line => line.replace(/(\/\/.*)$/, '<span class="c">$1</span>')).join('\n');
  ui.html(`<div class="group-label" style="margin-top:14px">The shader (this is the whole renderer)</div><pre class="code">${code}</pre>`);
  apply();
}
