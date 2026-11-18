/* Raptor Run: the renderer. WebGL 2, four passes a frame:
   1. shadows: every actor's silhouette, pushed away from the sun by its height off the ground,
      into a half-size buffer (max blending, so overlaps never double up);
   2. a two-pass blur of that buffer, so the shadows are soft and float like the koi's;
   3. the ground, lit by a low sun through moving leaves; a shadow only removes sunlight, so in
      leaf shade an actor's shadow fades away, as it would;
   4. prints, dust and the actors. Each actor part is a painted texture with a height map; the
      shader builds a normal from the heights, tilts it by the part's roundness, and lights it
      with the same sun, leaves and sky as the ground, so everything sits in one light. */

// sun from the upper left and a little in front, as on the ground plane (screen y points down)
const SUN = [-0.46, -0.52, 0.72];
const LIGHT = `
uniform float uTime;
uniform float uK;
const vec3 SUN = normalize(vec3(${SUN.join(',')}));
const vec3 SUN_COL = vec3(1.18, 1.02, 0.80);
const vec3 SKY_COL = vec3(0.26, 0.34, 0.38);
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float a = 0.0, w = 0.5; for (int i = 0; i < 5; i++) { a += vnoise(p) * w; p = p * 2.02 + 17.3; w *= 0.5; } return a; }
// sunlight through a canopy we never see: broad drifting shade, leafy edges that sway
float leaves(vec2 px) {
  // mostly sun: shade comes in leafy patches with crisp, broken edges, and flecks of sun inside them
  vec2 q = px / (520.0 * uK);
  float t = uTime;
  vec2 sway = vec2(sin(t * 0.7), cos(t * 0.53)) * 0.03;
  float n = fbm(q + vec2(t * 0.008, t * 0.005));
  n += 0.30 * (fbm(q * 4.2 + sway * 5.0 - t * 0.015) - 0.5);
  n += 0.14 * (fbm(q * 11.0 + sway * 12.0) - 0.5);
  float shade = smoothstep(0.53, 0.6, n);
  float fleck = smoothstep(0.78, 0.84, fbm(q * 14.0 + 40.0 + sway * 10.0));
  return 1.0 - shade * (1.0 - fleck * 0.8);
}
vec3 grade(vec3 c, vec2 frag, vec2 res) {
  // soft filmic shoulder, a cool lift in the shadows, a vignette and a fine grain
  c = c / (1.0 + c * 0.18) * 1.12;
  c = mix(c, c * vec3(0.92, 1.0, 1.06), 1.0 - smoothstep(0.0, 0.45, dot(c, vec3(0.333))));
  vec2 v = frag / res - 0.5;
  c *= 1.0 - 0.3 * smoothstep(0.3, 0.9, length(v * vec2(1.0, 0.85)));
  c += (hash(frag + fract(uTime) * 61.0) - 0.5) * 0.018;
  return c;
}
`;

const VS_ACTOR = `#version 300 es
in vec2 aPos; in vec2 aUv; in vec2 aU; in vec2 aV; in float aRound; in float aZ; in float aAlpha;
uniform vec2 uRes; uniform vec2 uShadowOff; uniform float uShadow; uniform float uScale;
out vec2 vUv; out vec2 vU; out vec2 vV; out float vRound; out float vAlpha; out vec2 vPos;
void main() {
  vec2 p = aPos + uShadowOff * aZ * uShadow;
  vPos = aPos; vUv = aUv; vU = aU; vV = aV; vRound = aRound; vAlpha = aAlpha;
  vec2 c = p / uRes * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
}`;

const FS_ACTOR = `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vU; in vec2 vV; in float vRound; in float vAlpha; in vec2 vPos;
uniform sampler2D uA; uniform sampler2D uN; uniform sampler2D uM;
uniform float uShadow; uniform vec2 uRes; uniform float uDpr; uniform float uBaked;
out vec4 o;
${LIGHT}
void main() {
  vec4 al = texture(uA, vUv);
  float a = al.a * vAlpha;
  if (a < 0.004) discard;
  if (uShadow > 0.5) { o = vec4(a); return; }
  if (uBaked > 0.5) {
    // a painting carries its own form and light, so the scene only adds what changes: the leaf
    // shade drifting over it, cooler where it falls, and the same grade as the ground
    float sunP = leaves(vPos);
    vec3 cP = al.rgb * mix(vec3(0.46, 0.53, 0.58), vec3(1.04, 1.0, 0.95), sunP);
    cP = grade(cP, gl_FragCoord.xy / uDpr * vec2(1, -1) + vec2(0, uRes.y), uRes);
    o = vec4(cP * a, a);
    return;
  }
  vec4 nt = texture(uN, vUv);
  vec4 mt = texture(uM, vUv);
  vec3 tn = normalize(nt.xyz * 2.0 - 1.0);
  // the baked normal lives in the part's plane: x along U, y along V
  vec3 n = normalize(vec3(tn.x * vU + tn.y * vV + vV * vRound, tn.z));
  float gloss = nt.a, ao = mt.r, sss = mt.g;
  float sun = leaves(vPos);
  float ndl = dot(n, SUN);
  // diffuse with a soft, warm terminator where light passes through the skin
  float wrap = 0.18 + sss * 0.32;
  float diff = clamp((ndl + wrap) / (1.0 + wrap), 0.0, 1.0);
  vec3 through = mix(vec3(1.0), vec3(1.15, 0.72, 0.55), sss * (1.0 - smoothstep(0.0, 0.6, ndl)) * 0.7);
  // sky from above, a green bounce from the forest floor on surfaces turned down and away
  vec3 amb = SKY_COL * (0.5 + 0.5 * n.z) + vec3(0.09, 0.14, 0.07) * (1.0 - n.z) * 1.4;
  // specular: a GGX lobe with Schlick fresnel, rough where the gloss is low
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(SUN + V);
  float rough = mix(0.62, 0.1, gloss);
  float a2 = pow(rough, 4.0);
  float ndh = max(dot(n, H), 0.0);
  float D = a2 / (3.14159 * pow(ndh * ndh * (a2 - 1.0) + 1.0, 2.0));
  float F = 0.04 + 0.96 * pow(1.0 - max(dot(V, H), 0.0), 5.0);
  float spec = D * F * max(ndl, 0.0) * 0.55;
  float rim = pow(1.0 - max(n.z, 0.0), 3.0) * (0.25 + gloss * 0.5);
  vec3 c = al.rgb * (amb * 0.8 * (0.25 + 0.75 * ao) + SUN_COL * diff * through * sun * 1.2 * (0.55 + 0.45 * ao));
  c += SUN_COL * spec * sun * (0.4 + 0.6 * ao) + SKY_COL * rim * ao * 0.6;
  c = grade(c, gl_FragCoord.xy / uDpr * vec2(1, -1) + vec2(0, uRes.y), uRes);
  o = vec4(c * a, a);
}`;

const VS_FULL = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS_BLUR = `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D uT; uniform vec2 uDir; out vec4 o;
void main() {
  float w[7] = float[](0.1964, 0.1748, 0.1232, 0.0688, 0.0304, 0.0106, 0.0029);
  float s = texture(uT, vUv).r * w[0];
  for (int i = 1; i < 7; i++) {
    s += texture(uT, vUv + uDir * float(i)).r * w[i];
    s += texture(uT, vUv - uDir * float(i)).r * w[i];
  }
  o = vec4(s);
}`;

const FS_GROUND = `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D uG; uniform sampler2D uS; uniform vec2 uRes; uniform float uDpr; out vec4 o;
${LIGHT}
void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec3 al = texture(uG, uv).rgb;
  float sh = texture(uS, vUv).r;
  vec2 px = uv * uRes;
  float sun = leaves(px) * (1.0 - sh * 0.86);
  vec3 c = al * (SKY_COL * 1.0 + SUN_COL * SUN.z * sun * 1.3);
  // ambient occlusion: a little darker even in shade right under an actor
  c *= 1.0 - sh * 0.22;
  o = vec4(grade(c, px, uRes), 1.0);
}`;

const VS_SPRITE = `#version 300 es
in vec2 aPos; in vec2 aUv; in float aAlpha;
uniform vec2 uRes; out vec2 vUv; out float vAlpha; out vec2 vPos;
void main() { vUv = aUv; vAlpha = aAlpha; vPos = aPos; vec2 c = aPos / uRes * 2.0 - 1.0; gl_Position = vec4(c.x, -c.y, 0.0, 1.0); }`;
const FS_PRINT = `#version 300 es
precision highp float;
in vec2 vUv; in float vAlpha; in vec2 vPos; uniform sampler2D uT; out vec4 o;
void main() { float a = texture(uT, vUv).a * vAlpha; o = vec4(mix(vec3(1.0), vec3(0.62, 0.7, 0.62), a), 1.0); }`;
const FS_PUFF = `#version 300 es
precision highp float;
in vec2 vUv; in float vAlpha; in vec2 vPos; uniform sampler2D uT; out vec4 o;
${LIGHT}
void main() { float a = texture(uT, vUv).a * vAlpha * 0.6; vec3 c = vec3(0.36, 0.40, 0.28) * (0.6 + 0.5 * leaves(vPos)); o = vec4(c * a, a); }`;

function compile(gl, vs, fs) {
  const p = gl.createProgram();
  ['aPos', 'aUv', 'aU', 'aV', 'aRound', 'aZ', 'aAlpha'].forEach((n, i) => gl.bindAttribLocation(p, i, n));
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
  return { p, u, a: (name) => gl.getAttribLocation(p, name) };
}

export const FLOATS = 11; // per actor vertex: pos 2, uv 2, U 2, V 2, round, z, alpha

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: false });
  if (!gl) return null;
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  const actor = compile(gl, VS_ACTOR, FS_ACTOR);
  const blur = compile(gl, VS_FULL, FS_BLUR);
  const ground = compile(gl, VS_FULL, FS_GROUND);
  const print = compile(gl, VS_SPRITE, FS_PRINT);
  const puff = compile(gl, VS_SPRITE, FS_PUFF);

  const full = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, full);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const vbo = gl.createBuffer();

  // one vertex array per layout
  const vaoFull = gl.createVertexArray();
  gl.bindVertexArray(vaoFull);
  gl.bindBuffer(gl.ARRAY_BUFFER, full);
  for (const prog of [blur, ground]) { const l = prog.a('aPos'); if (l >= 0) { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0); } }
  const vaoActor = gl.createVertexArray();
  gl.bindVertexArray(vaoActor);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  [['aPos', 2, 0], ['aUv', 2, 2], ['aU', 2, 4], ['aV', 2, 6], ['aRound', 1, 8], ['aZ', 1, 9], ['aAlpha', 1, 10]].forEach(([n, size, off]) => {
    const l = actor.a(n);
    if (l < 0) return;
    gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, FLOATS * 4, off * 4);
  });
  const vaoSprite = gl.createVertexArray();
  gl.bindVertexArray(vaoSprite);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  [['aPos', 2, 0], ['aUv', 2, 2], ['aAlpha', 1, 4]].forEach(([n, size, off]) => {
    const l = print.a(n);
    if (l < 0) return;
    gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 5 * 4, off * 4);
  });
  gl.bindVertexArray(null);

  const texture = (src, mip = true) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (mip) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    return t;
  };
  // a painted part: albedo (premultiplied by alpha would fringe at the mip edges, so we keep straight alpha
  // and bleed the colour out under transparent pixels) and its height map
  const blank = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, blank);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 255, 255]));
  const paint = (p) => ({ a: texture(bleed(p.albedo)), h: texture(p.height) });
  const free = (t) => { if (t) { gl.deleteTexture(t.a); gl.deleteTexture(t.h); } };

  let fbo = [], groundTex = null, W = 1, H = 1, DPR = 1, SW = 1, SH = 1;
  const makeTarget = (w, h) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { t, f };
  };
  const resize = (w, h, dpr, groundCanvas) => {
    W = w; H = h; DPR = dpr;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    for (const x of fbo) { gl.deleteTexture(x.t); gl.deleteFramebuffer(x.f); }
    SW = Math.max(1, Math.round(canvas.width / 2)); SH = Math.max(1, Math.round(canvas.height / 2));
    fbo = [makeTarget(SW, SH), makeTarget(SW, SH)];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (groundTex) gl.deleteTexture(groundTex);
    groundTex = texture(groundCanvas, false);
  };

  let data = new Float32Array(FLOATS * 6 * 4096);
  const upload = (arr, n) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, arr.subarray(0, n), gl.STREAM_DRAW);
  };

  // items: [{tex:{a,h}, verts: Float32Array, count, gloss, bump}], drawn in order
  const drawActors = (items, shadow, K) => {
    gl.useProgram(actor.p);
    gl.bindVertexArray(vaoActor);
    gl.uniform2f(actor.u.uRes, W, H);
    gl.uniform1f(actor.u.uShadow, shadow ? 1 : 0);
    const sx = -SUN[0] / SUN[2], sy = -SUN[1] / SUN[2];
    gl.uniform2f(actor.u.uShadowOff, sx * 0.5, sy * 0.5);
    gl.uniform1f(actor.u.uK, K);
    gl.uniform1f(actor.u.uDpr, DPR);
    gl.uniform1i(actor.u.uA, 0);
    if (actor.u.uN) { gl.uniform1i(actor.u.uN, 1); gl.uniform1i(actor.u.uM, 2); }
    for (const it of items) {
      if (it.shadowOnly && !shadow) continue;
      gl.uniform1f(actor.u.uBaked, it.baked ? 1 : 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, it.tex.a);
      // always bind something of our own to every unit the shader declares, never the shadow buffer
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, it.tex.n || blank);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, it.tex.m || blank);
      upload(it.verts, it.count * FLOATS);
      gl.drawArrays(gl.TRIANGLES, 0, it.count);
    }
  };

  const sprites = (prog, tex, list, blendFn) => {
    if (!list.length) return;
    if (data.length < list.length * 30) data = new Float32Array(list.length * 60);
    let n = 0;
    for (const s of list) {
      const c = Math.cos(s.ang), si = Math.sin(s.ang);
      const corners = [[-s.w0, -s.h], [s.w1, -s.h], [s.w1, s.h], [-s.w0, -s.h], [s.w1, s.h], [-s.w0, s.h]];
      const uvs = [[0, s.flip ? 1 : 0], [1, s.flip ? 1 : 0], [1, s.flip ? 0 : 1], [0, s.flip ? 1 : 0], [1, s.flip ? 0 : 1], [0, s.flip ? 0 : 1]];
      for (let i = 0; i < 6; i++) {
        const [x, y] = corners[i];
        data[n++] = s.x + x * c - y * si; data[n++] = s.y + x * si + y * c;
        data[n++] = uvs[i][0]; data[n++] = uvs[i][1]; data[n++] = s.a;
      }
    }
    gl.useProgram(prog.p);
    gl.bindVertexArray(vaoSprite);
    gl.uniform2f(prog.u.uRes, W, H);
    if (prog.u.uK) gl.uniform1f(prog.u.uK, 1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(prog.u.uT, 0);
    blendFn();
    upload(data, n);
    gl.drawArrays(gl.TRIANGLES, 0, n / 5);
  };

  const frame = ({ items, prints, puffs, time, K, printTex, puffTex }) => {
    for (const prog of [actor, ground, puff]) { gl.useProgram(prog.p); gl.uniform1f(prog.u.uTime, time); if (prog.u.uK) gl.uniform1f(prog.u.uK, K); }
    // 1. shadows
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[0].f);
    gl.viewport(0, 0, SW, SH);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
    drawActors(items, true, K);
    gl.blendEquation(gl.FUNC_ADD);
    gl.disable(gl.BLEND);
    // 2. blur, there and back
    gl.useProgram(blur.p); gl.bindVertexArray(vaoFull);
    gl.uniform1i(blur.u.uT, 0); gl.activeTexture(gl.TEXTURE0);
    const step = 1.25 * K * DPR / 2;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[1].f); gl.bindTexture(gl.TEXTURE_2D, fbo[0].t);
    gl.uniform2f(blur.u.uDir, step / SW, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[0].f); gl.bindTexture(gl.TEXTURE_2D, fbo[1].t);
    gl.uniform2f(blur.u.uDir, 0, step / SH); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // 3. the ground
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(ground.p); gl.bindVertexArray(vaoFull);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, groundTex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, fbo[0].t);
    gl.uniform1i(ground.u.uG, 0); gl.uniform1i(ground.u.uS, 1);
    gl.uniform2f(ground.u.uRes, W, H); gl.uniform1f(ground.u.uDpr, DPR);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // 4. prints (multiplied into the ground), dust, then the actors
    gl.enable(gl.BLEND);
    sprites(print, printTex, prints, () => gl.blendFunc(gl.DST_COLOR, gl.ZERO));
    sprites(puff, puffTex, puffs, () => gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA));
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    drawActors(items, false, K);
    gl.disable(gl.BLEND);
  };

  return { gl, paint, free, texture, resize, frame };
}

// spread each opaque pixel's colour into its transparent neighbours, so mipmaps and filtering
// never pull black into the painted edges
function bleed(src) {
  const w = src.width, h = src.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  // a few blurred, dilated copies under the original, then the original's alpha restored
  g.filter = 'blur(3px)';
  for (let i = 0; i < 3; i++) g.drawImage(src, 0, 0);
  g.filter = 'blur(10px)';
  g.globalCompositeOperation = 'destination-over';
  for (let i = 0; i < 3; i++) g.drawImage(src, 0, 0);
  g.filter = 'none';
  g.globalCompositeOperation = 'source-over';
  const id = g.getImageData(0, 0, w, h), px = id.data;
  const sd = src.getContext('2d').getImageData(0, 0, w, h).data;
  for (let i = 0; i < px.length; i += 4) {
    const a = sd[i + 3];
    if (a > 250) { px[i] = sd[i]; px[i + 1] = sd[i + 1]; px[i + 2] = sd[i + 2]; }
    else if (a > 0) {
      // unpremultiply-safe blend toward the source colour where it exists
      const k = a / 255;
      const ca = px[i + 3] / 255 || 1;
      px[i] = sd[i] * k + (px[i] / ca) * (1 - k); px[i + 1] = sd[i + 1] * k + (px[i + 1] / ca) * (1 - k); px[i + 2] = sd[i + 2] * k + (px[i + 2] / ca) * (1 - k);
    } else if (px[i + 3] > 0) {
      const ca = px[i + 3] / 255;
      px[i] /= ca; px[i + 1] /= ca; px[i + 2] /= ca;
    }
    px[i + 3] = a;
  }
  g.putImageData(id, 0, 0);
  return c;
}
