/* Raptor Run: the sculptor. Each creature part is modelled as a set of rounded forms (capsules
   that taper from one radius to another, blended smoothly into one surface, like clay), then
   surfaced with skin detail (pebble scales sized by region, folds, toe scutes, pores; cloth
   folds and weave; hair strands) and baked on the GPU into three textures:
     albedo   colour and coverage
     normal   the surface normal in the part's own plane, and gloss in alpha
     material ambient occlusion, how much light the surface lets through, height
   The renderer then lights those like skin: soft light through it, glossy highlights, sky fill.

   Part space is in world px: u runs along the part from its joint (or the snout), v across it.
   A part covers u in [0, len] and v in [-half, half]. */

const MAX = 96;

const FS = `#version 300 es
precision highp float;
uniform vec2 uSize;      // len, 2 * half (world px)
uniform vec2 uTex;       // texture size
uniform int uCount;
uniform vec4 uA[${MAX}]; // a.xy, b.xy
uniform vec4 uR[${MAX}]; // ra, rb, material, flat
uniform vec4 uZ[${MAX}]; // z, blend, colour index, detail
uniform vec4 uC[16];     // palette: rgb, pattern
uniform float uHw[64];   // the body's half width along u (raptor body only)
uniform int uPat;        // 0 raptor body, 1 raptor limb, 2 person
uniform vec3 uCoat[6];   // dorsal, flank, stripe, light, eye, claw
uniform float uScale;    // base scale size, world px
uniform float uSeed;
layout(location = 0) out vec4 oAlb;
layout(location = 1) out vec4 oNrm;
layout(location = 2) out vec4 oMat;

float hash1(vec2 p) { p = fract(p * vec2(443.897, 441.423) + uSeed * 0.013); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
vec2 hash2(vec2 p) { return vec2(hash1(p), hash1(p + 17.31)); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash1(i), hash1(i + vec2(1, 0)), u.x), mix(hash1(i + vec2(0, 1)), hash1(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float a = 0.0, w = 0.5; for (int i = 0; i < 5; i++) { a += vnoise(p) * w; p = p * 2.03 + 11.7; w *= 0.5; } return a; }
// cellular: distance to the nearest and second-nearest cell centres, and the nearest cell's id
vec3 voronoi(vec2 p, out vec2 cid) {
  vec2 n = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  cid = n;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(i, j);
    vec2 o = 0.5 + 0.38 * (hash2(n + g) - 0.5) * 2.0;
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; cid = n + g; } else if (d < d2) d2 = d;
  }
  return vec3(sqrt(d1), sqrt(d2), sqrt(d2) - sqrt(d1));
}
float smax(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(a, b, h) + k * h * (1.0 - h); }
float hw(float u) {
  float x = clamp(u / uSize.x, 0.0, 1.0) * 63.0;
  int i = int(floor(x));
  return mix(uHw[i], uHw[min(i + 1, 63)], fract(x));
}

struct Hit { float h; float cov; int blob; float t; float along; float across; float r; };

Hit field(vec2 p, float px) {
  Hit o; o.h = -1000.0; o.cov = 0.0; o.blob = -1; o.t = 0.0; o.along = 0.0; o.across = 0.0; o.r = 1.0;
  float best = -1e9;
  for (int i = 0; i < ${MAX}; i++) {
    if (i >= uCount) break;
    vec2 a = uA[i].xy, b = uA[i].zw;
    vec2 pa = p - a, ba = b - a;
    float L2 = max(dot(ba, ba), 1e-6);
    float t = clamp(dot(pa, ba) / L2, 0.0, 1.0);
    vec2 q = pa - ba * t;
    float d = length(q);
    float r = mix(uR[i].x, uR[i].y, t);
    float inside = r - d;
    float h = inside > 0.0 ? uZ[i].x + uR[i].w * sqrt(max(r * r - d * d, 0.0)) : -1000.0;
    float k = uZ[i].y;
    o.h = k > 0.0 ? smax(o.h, h, k) : max(o.h, h);
    if (uR[i].z < 8.5) o.cov = max(o.cov, clamp(inside / px + 0.5, 0.0, 1.0));
    float score = inside > 0.0 ? 1000.0 + h : inside;
    if (score > best) {
      best = score; o.blob = i; o.t = t; o.r = r;
      vec2 dir = ba / sqrt(L2);
      o.along = dot(pa, dir); o.across = dot(pa, vec2(-dir.y, dir.x)) / max(r, 1e-3);
    }
  }
  return o;
}

// surface detail for a material at p; returns height added, and crevice (0 deep in a crease .. 1 open)
vec2 detail(vec2 p, Hit f, int mat, float detailCode, out vec2 cid, out float scaleSize) {
  float h = 0.0, crev = 1.0;
  cid = vec2(0);
  scaleSize = 1.0;
  if (mat == 0) { // reptile skin
    float s = uScale;
    float q = 0.5;
    if (uPat == 0) {
      float w = max(hw(p.x), 0.5);
      q = clamp(abs(p.y) / w, 0.0, 1.0);
      s *= mix(1.45, 0.62, q);                       // big pebbles on the back, fine on the flanks
      s *= mix(0.5, 1.0, smoothstep(8.0, 40.0, p.x)); // fine scales on the snout and face
      if (abs(p.y) < 1.7 && p.x > 44.0) s *= 1.5;    // a row of larger scutes along the spine
    } else s *= mix(0.9, 0.6, abs(f.across));
    if (detailCode > 0.5) { // scutes: plates across the toes and shins
      float band = fract(f.along / (1.25 * uScale));
      h += smoothstep(0.0, 0.18, band) * smoothstep(1.0, 0.75, band) * 0.32 * uScale;
      crev = min(crev, smoothstep(0.0, 0.12, band) * smoothstep(1.0, 0.88, band) * 0.6 + 0.4);
      s *= 0.7;
    }
    scaleSize = s;
    vec2 warp = vec2(fbm(p * 0.09), fbm(p * 0.09 + 7.0)) * 2.0;
    vec3 v = voronoi(p / s + warp, cid);
    float dome = pow(smoothstep(0.0, 0.5, v.z), 0.55);
    h += dome * 0.42 * s;
    crev = min(crev, mix(0.22, 1.0, smoothstep(0.0, 0.2, v.z)));
    // skin folds: across the neck, at the hips and shoulders, around the joints of the limbs
    float fold = 0.0;
    if (uPat == 0) {
      float side = smoothstep(0.3, 0.75, q);
      fold = side * smoothstep(38.0, 48.0, p.x) * smoothstep(92.0, 76.0, p.x);
      fold += 0.6 * side * smoothstep(128.0, 136.0, p.x) * smoothstep(162.0, 150.0, p.x);
      float wv = sin(p.x * 1.15 + fbm(p * 0.25) * 6.0 + q * 2.0);
      h += fold * (wv * 0.5 + 0.5) * 0.75;
      crev = min(crev, mix(1.0, smoothstep(-0.9, -0.2, wv) * 0.7 + 0.3, fold));
    } else {
      float wv = sin(f.along * 1.6 + fbm(p * 0.3) * 5.0);
      fold = smoothstep(0.55, 0.95, abs(f.across)) * 0.6;
      h += fold * (wv * 0.5 + 0.5) * 0.4;
    }
    h += (fbm(p * 2.6) - 0.5) * 0.08; // pores and tooth
  } else if (mat == 1 || mat == 3) { // claw, tooth: smooth keratin with fine growth lines
    h += sin(f.along * 6.0 + fbm(p * 2.0) * 2.0) * 0.03;
  } else if (mat == 4) { // cloth: folds that follow the pull of the limb or body, a fine weave
    float wv = sin(f.along * 0.75 + fbm(p * 0.22) * 7.0 + f.across * 1.4);
    float folds = wv * 0.5 + 0.5;
    h += folds * 0.9 + (hash1(floor(p * 3.2)) - 0.5) * 0.05;
    crev = mix(0.55, 1.0, smoothstep(0.0, 0.5, folds));
  } else if (mat == 5) { // human skin
    h += (fbm(p * 1.6) - 0.5) * 0.05;
  } else if (mat == 6) { // hair: fine strands that run along the form's axis, gathered into clumps
    vec2 sp = vec2(f.along * 0.35, f.across * 9.0);
    float strands = fbm(sp) * 0.7 + fbm(sp * vec2(1.0, 3.0)) * 0.3;
    h += strands * 0.55;
    crev = mix(0.5, 1.0, strands);
  } else if (mat == 7) { // leather, rubber
    h += (fbm(p * 1.2) - 0.5) * 0.08;
  }
  return vec2(h, crev);
}

float heightAt(vec2 p, float px) {
  Hit f = field(p, px);
  if (f.blob < 0) return 0.0;
  int mat = int(uR[f.blob].z + 0.5);
  vec2 cid; float ss;
  return max(f.h, 0.0) + detail(p, f, mat, uZ[f.blob].w, cid, ss).x * step(0.0, f.h);
}

vec3 coat(vec2 p, Hit f, vec2 cid, float crev) {
  float q = 0.5, w = 1.0;
  if (uPat == 0) { w = max(hw(p.x), 0.5); q = clamp(abs(p.y) / w, 0.0, 1.0); }
  else q = clamp(abs(f.across), 0.0, 1.0) * 0.8 + 0.1;
  vec3 c = mix(uCoat[0], uCoat[1], smoothstep(0.25, 1.0, q + (fbm(p * 0.06) - 0.5) * 0.3));
  // tiger stripes: thin, ragged, raked bands across the back and down the flanks
  float u = uPat == 0 ? p.x : f.along * 1.4 + uSeed * 3.0;
  float period = uPat == 0 ? (p.x > 190.0 ? 11.0 : 13.0) : 9.0;
  float warpS = fbm(p * 0.07) * 18.0 + fbm(p * 0.3) * 3.0;
  float s = sin((u + warpS - q * q * 9.0) * 6.2831 / period);
  float stripe = smoothstep(0.55, 0.92, s) * smoothstep(0.3, 0.62, fbm(p * 0.11 + 3.0));
  float stripeZone = uPat == 0 ? smoothstep(36.0, 60.0, p.x) * smoothstep(1.02, 0.55, q) : 0.6;
  c = mix(c, uCoat[2], stripe * stripeZone * 0.88);
  // a darker saddle and snout ridge, lighter lips and throat at the very edge
  if (uPat == 0) {
    c = mix(c, uCoat[0] * 0.7, smoothstep(0.35, 0.0, q) * smoothstep(40.0, 70.0, p.x) * 0.5);
    float head = smoothstep(42.0, 30.0, p.x);
    c = mix(c, uCoat[3], head * smoothstep(0.78, 0.97, q) * 0.7);
    c = mix(c, uCoat[0] * 0.75, head * smoothstep(0.45, 0.0, q) * 0.4);
    // nostrils and a dark streak from eye to snout
    vec2 nos = vec2(5.0, (w - 1.9));
    float nd = length((vec2(p.x, abs(p.y)) - nos) * vec2(0.8, 1.6));
    c *= mix(0.25, 1.0, smoothstep(0.8, 1.4, nd));
  }
  // every scale its own slightly different colour, darker in the cracks between them
  float jit = hash1(cid);
  c *= 0.88 + jit * 0.24;
  c = mix(c, c * vec3(1.05, 0.98, 0.9), fbm(p * 0.5));
  c *= mix(0.45, 1.0, crev);
  return c;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uTex;
  vec2 p = vec2(uv.x * uSize.x, (uv.y - 0.5) * uSize.y);
  float px = uSize.x / uTex.x;
  Hit f = field(p, px);
  if (f.blob < 0) { oAlb = vec4(0); oNrm = vec4(0.5, 0.5, 1.0, 0.0); oMat = vec4(1, 0, 0, 1); return; }
  int mat = int(uR[f.blob].z + 0.5);
  vec2 cid; float ss;
  vec2 det = detail(p, f, mat, uZ[f.blob].w, cid, ss);
  float crev = det.y;
  // normal from the full surface, sampled a texel either side
  float e = px;
  float hx = heightAt(p + vec2(e, 0), px) - heightAt(p - vec2(e, 0), px);
  float hy = heightAt(p + vec2(0, e), px) - heightAt(p - vec2(0, e), px);
  vec3 n = normalize(vec3(-hx / (2.0 * e), -hy / (2.0 * e), 1.0));
  if (f.h < 0.0) n = vec3(0, 0, 1);

  vec3 col; float gloss = 0.2, sss = 0.0;
  vec4 pal = uC[int(uZ[f.blob].z + 0.5)];
  vec2 a = uA[f.blob].xy;
  if (mat == 0) { col = coat(p, f, cid, crev); gloss = mix(0.15, 0.62, crev * crev); sss = 0.35; }
  else if (mat == 1) { // claw: horn, pale at the root, near black at the tip
    col = mix(uCoat[5] * 1.9, uCoat[5] * 0.55, smoothstep(0.0, 1.0, f.t)); gloss = 0.78;
  } else if (mat == 2) { // eye: amber iris, a slit pupil, a dark lid rim
    vec2 l = (p - a) / max(uR[f.blob].x, 1e-3);
    float rr = length(l);
    col = mix(uCoat[4] * 1.25, uCoat[4] * 0.45, smoothstep(0.1, 0.95, rr));
    col = mix(col, vec3(0.02), smoothstep(0.2, 0.12, abs(l.y)) * smoothstep(0.75, 0.6, abs(l.x)));
    col = mix(col, vec3(0.03, 0.02, 0.015), smoothstep(0.78, 0.98, rr));
    gloss = 1.0; crev = 1.0;
  } else if (mat == 3) { col = mix(vec3(0.86, 0.82, 0.7), vec3(0.97, 0.95, 0.88), f.t); gloss = 0.6; }
  else if (mat == 4) { // cloth, plain or patterned
    col = pal.rgb;
    if (pal.a > 0.5 && pal.a < 1.5) { // a loud print: big leaves in the second colour
      float leaf = smoothstep(0.56, 0.6, fbm(p * 0.12 + 5.0));
      col = mix(col, uC[int(uZ[f.blob].z + 1.5)].rgb, leaf);
    } else if (pal.a > 1.5) { // hi-vis: silver bands
      float band = smoothstep(0.08, 0.0, abs(fract(f.across * 1.1 + 0.1) - 0.5) - 0.38);
      col = mix(col, vec3(0.86, 0.87, 0.84), band);
    }
    col *= 0.94 + hash1(floor(p * 3.2)) * 0.1;
    col *= mix(0.62, 1.0, crev);
    gloss = 0.07;
  } else if (mat == 5) { col = pal.rgb * (0.96 + fbm(p * 0.4) * 0.08); col = mix(col, col * vec3(1.06, 0.92, 0.9), fbm(p * 0.9) * 0.4); gloss = 0.32; sss = 0.7; }
  else if (mat == 6) { col = pal.rgb * mix(0.55, 1.35, crev); gloss = 0.55; }
  else if (mat == 7) { col = pal.rgb; gloss = 0.45; }
  else { col = pal.rgb; gloss = 0.1; }

  oAlb = vec4(clamp(col, 0.0, 1.0), f.cov);
  oNrm = vec4(n * 0.5 + 0.5, gloss);
  oMat = vec4(crev, sss, clamp(f.h / 40.0, 0.0, 1.0), 1.0);
}`;

const VS = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

export function createSculptor(gl) {
  const prog = gl.createProgram();
  gl.bindAttribLocation(prog, 0, 'aPos');
  for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('sculpt: ' + gl.getShaderInfoLog(s));
    gl.attachShader(prog, s);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('sculpt: ' + gl.getProgramInfoLog(prog));
  const U = (n) => gl.getUniformLocation(prog, n);
  const loc = {
    size: U('uSize'), tex: U('uTex'), count: U('uCount'), A: U('uA'), R: U('uR'), Z: U('uZ'), C: U('uC'),
    hw: U('uHw'), pat: U('uPat'), coat: U('uCoat'), scale: U('uScale'), seed: U('uSeed'),
  };
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');

  const target = (w, h) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, Math.floor(Math.log2(Math.max(w, h))) + 1, gl.RGBA8, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    return t;
  };

  // spec: { len, half, res (texture px per world px), blobs, palette, pattern, coat, scale, seed, hw }
  const bake = (spec) => {
    const w = Math.min(4096, Math.ceil(spec.len * spec.res)), h = Math.min(2048, Math.ceil(spec.half * 2 * spec.res));
    const tex = { a: target(w, h), n: target(w, h), m: target(w, h) };
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    [tex.a, tex.n, tex.m].forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.useProgram(prog);
    const n = Math.min(MAX, spec.blobs.length);
    const A = new Float32Array(MAX * 4), Rr = new Float32Array(MAX * 4), Z = new Float32Array(MAX * 4);
    spec.blobs.slice(0, n).forEach((b, i) => {
      const bb = b.b ?? b.a;
      A.set([b.a[0], b.a[1], bb[0], bb[1]], i * 4);
      Rr.set([b.ra, b.rb ?? b.ra, b.mat ?? 0, b.flat ?? 1], i * 4);
      Z.set([b.z ?? 0, b.k ?? 0, b.col ?? 0, b.detail ?? 0], i * 4);
    });
    const C = new Float32Array(16 * 4);
    (spec.palette || []).slice(0, 16).forEach((c, i) => C.set([c[0], c[1], c[2], c[3] ?? 0], i * 4));
    const HW = new Float32Array(64);
    if (spec.hw) for (let i = 0; i < 64; i++) HW[i] = spec.hw((i / 63) * spec.len);
    const coat = new Float32Array(18);
    (spec.coat || []).slice(0, 6).forEach((c, i) => coat.set(c, i * 3));
    gl.uniform2f(loc.size, spec.len, spec.half * 2);
    gl.uniform2f(loc.tex, w, h);
    gl.uniform1i(loc.count, n);
    gl.uniform4fv(loc.A, A); gl.uniform4fv(loc.R, Rr); gl.uniform4fv(loc.Z, Z); gl.uniform4fv(loc.C, C);
    gl.uniform1fv(loc.hw, HW);
    gl.uniform1i(loc.pat, spec.pattern ?? 2);
    gl.uniform3fv(loc.coat, coat);
    gl.uniform1f(loc.scale, spec.scale ?? 1);
    gl.uniform1f(loc.seed, spec.seed ?? 1);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    for (const t of [tex.a, tex.n, tex.m]) { gl.bindTexture(gl.TEXTURE_2D, t); gl.generateMipmap(gl.TEXTURE_2D); }
    tex.w = w; tex.h = h;
    return tex;
  };
  const free = (t) => { if (t) for (const k of ['a', 'n', 'm']) gl.deleteTexture(t[k]); };
  return { bake, free };
}
