// Diffusion Studio shaders (WebGL2, GLSL ES 3.00).
//
// The model, in one sentence: a diffusing surface spreads each point of light that reaches it into a disc whose
// size grows with how far behind the surface that light came from, so whatever touches the glass is sharp and
// whatever stands back from it melts.
//
// Passes, every frame:
//   source    the words, at their depth, as two images: what they let through (transmittance) and what they give
//             off (emission), each with coverage and coverage-weighted depth in alpha
//   pyramid   each image blurred at doubling radii into its own mip levels (2, 4, 8 … px), so any radius can be read
//   state     the surface's own record: condensation, water film and grease, painted by the pointer and the drops
//   composite per pixel: the material and its conditions decide how far light is spread and how much passes
//             straight through; the words are read from the pyramids at the radius their depth calls for; the
//             lamps and the wall behind are drawn analytically, already spread; the front light lands on the pane
//   final     bloom, exposure, white balance, tone curve, split tone, vignette, grain

export const VS = `#version 300 es
out vec2 vUv;
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); vUv = p; gl_Position = vec4(p * 2. - 1., 0., 1.); }`;

const HEAD = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
in vec2 vUv;
`;

// Noise, cells, the error function and pyramid reads, shared by the passes that need them.
const LIB = `
float h11(float n){ return fract(sin(n * 127.1 + 3.7) * 43758.5453); }
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 h22(vec2 p){ float n = h21(p); return vec2(n, h21(p + n + 17.31)); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= .5; } return s; }
float ridged(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++){ s += a * (1. - abs(vnoise(p) * 2. - 1.)); p = p * 2.11 + vec2(4.1, 2.7); a *= .5; } return s; }
// nearest and second-nearest cell points: x = F1, y = F2, z = the nearest cell's hash; cc its point, cid its cell
vec3 voro(vec2 p, out vec2 cc, out vec2 cid){
  vec2 i = floor(p), f = fract(p); float d1 = 8., d2 = 8.; cc = vec2(0); cid = vec2(0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec2 g = vec2(x, y); vec2 o = h22(i + g); vec2 r = g + o - f; float d = dot(r, r);
    if (d < d1){ d2 = d1; d1 = d; cc = i + g + o; cid = i + g; } else if (d < d2) d2 = d;
  }
  return vec3(sqrt(d1), sqrt(d2), h21(cid));
}
float erf_(float x){ float s = sign(x), a = abs(x); float t = 1. / (1. + .3275911 * a);
  float y = 1. - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * exp(-a * a);
  return s * y; }
// a rectangle of half size hs, convolved with a gaussian of sigma s (exact)
float rectB(vec2 q, vec2 hs, float s){ float k = .70710678 / max(s, 1e-3);
  return .25 * (erf_((hs.x - q.x) * k) + erf_((hs.x + q.x) * k)) * (erf_((hs.y - q.y) * k) + erf_((hs.y + q.y) * k)); }
// a disc of radius R, convolved with a gaussian of sigma s (close: exact at the centre, and the right width)
float discB(float d, float R, float s){ s = max(s, 1e-3); float k = .70710678 / s;
  float e = .5 * (1. - erf_((d - R) * k)), e0 = .5 * (1. - erf_(-R * k)), c = 1. - exp(-R * R / (2. * s * s));
  return e * c / max(e0, 1e-5); }
vec3 hsv(float h, float s, float v){ vec3 k = clamp(abs(mod(h * 6. + vec3(0, 4, 2), 6.) - 3.) - 1., 0., 1.); return v * mix(vec3(1), k, s); }

// Pyramids: mip k holds the image blurred by 2^k px (mip 0 is sharp). A radius between levels blends the two
// either side; levels above 0 are read with a cubic B-spline so the coarse ones don't show their texels.
uniform float uMaxLod;
vec4 bspline(sampler2D t, vec2 uv, int lod){
  vec2 sz = vec2(textureSize(t, lod)); vec2 st = uv * sz - .5; vec2 i = floor(st); vec2 f = st - i;
  vec2 f2 = f * f, f3 = f2 * f;
  vec2 w0 = (1. - 3. * f + 3. * f2 - f3) / 6., w1 = (4. - 6. * f2 + 3. * f3) / 6., w2 = (1. + 3. * f + 3. * f2 - 3. * f3) / 6., w3 = f3 / 6.;
  vec2 g0 = w0 + w1, g1 = w2 + w3;
  vec2 h0 = (i - .5 + w1 / g0) / sz, h1 = (i + 1.5 + w3 / g1) / sz;
  float l = float(lod);
  return g0.y * (g0.x * textureLod(t, vec2(h0.x, h0.y), l) + g1.x * textureLod(t, vec2(h1.x, h0.y), l))
       + g1.y * (g0.x * textureLod(t, vec2(h0.x, h1.y), l) + g1.x * textureLod(t, vec2(h1.x, h1.y), l));
}
float lodFor(float r){ return clamp(r < 2. ? r * .5 : log2(r), 0., uMaxLod); }
vec4 pyr(sampler2D t, vec2 uv, float r){
  float lod = lodFor(r); int l0 = int(floor(lod)); float f = lod - float(l0);
  vec4 a = l0 == 0 ? textureLod(t, uv, 0.) : bspline(t, uv, l0);
  if (f < .002) return a;
  return mix(a, bspline(t, uv, min(l0 + 1, int(uMaxLod))), f);
}
`;

// The lamps behind the pane, drawn already spread. Each lamp is four vec4s:
//   (x cm, y cm, distance behind the glass cm, shape) (half width, half height, rotation, intensity)
//   (r, g, b, slats) (slat opening, mullion width, —, —)
// Shapes: 0 bulb, 1 softbox, 2 window with cross bars, 3 blinds, 4 strip, 5 ring.
const LAMPS = `
uniform vec4 uL[12];
vec3 lampOne(int i, vec2 p, float s){
  vec4 a = uL[i * 4], b = uL[i * 4 + 1], c = uL[i * 4 + 2], d = uL[i * 4 + 3];
  if (b.w <= 0.) return vec3(0);
  vec2 q = p - a.xy; float cr = cos(b.z), sr = sin(b.z); q = vec2(cr * q.x + sr * q.y, -sr * q.x + cr * q.y);
  int shape = int(a.w + .5); vec2 hs = max(b.xy, vec2(.05)); float v = 0.;
  if (shape == 0) v = discB(length(q), hs.x, s);
  else if (shape == 1) v = rectB(q, hs, s);
  else if (shape == 2){ float m = d.y * .5; v = rectB(q, hs, s) - rectB(q, vec2(m, hs.y), s) - rectB(q, vec2(hs.x, m), s) + rectB(q, vec2(m), s); }
  else if (shape == 3){ int n = int(c.w + .5); float pitch = 2. * hs.y / float(n); float gh = max(pitch * d.x * .5, .02);
    for (int j = 0; j < 40; j++){ if (j >= n) break; float yc = -hs.y + pitch * (float(j) + .5); v += rectB(q - vec2(0, yc), vec2(hs.x, gh), s); } }
  else if (shape == 4) v = rectB(q, vec2(hs.x, min(hs.y, 1.5)), s);
  else { float l = length(q); v = discB(l, hs.x, s) - discB(l, hs.x * .8, s); }
  return max(v, 0.) * b.w * c.rgb;
}
// every lamp, seen through a surface that spreads by k (and k2 for a second pane gap cm further back), its image
// shifted by the surface's slope times the lamp's distance (refraction moves far things more)
vec3 lamps(vec2 p, vec2 slope, float k, float k2, float gap, float s0){
  vec3 o = vec3(0);
  for (int i = 0; i < 3; i++){
    float dist = uL[i * 4].z;
    float s = sqrt(pow(k * dist, 2.) + pow(k2 * max(dist - gap, 0.), 2.) + s0 * s0);
    o += lampOne(i, p + slope * dist, s);
  }
  return o;
}
`;

// ---- copy: the text canvas into the mask pyramid's sharp level ----
export const COPY = HEAD + `
uniform sampler2D uSrc; out vec4 o;
void main(){ o = texture(uSrc, vUv); }`;

// ---- one direction of a pyramid step: read level k-1 (or the other texture's level k), write level k ----
export const BLUR = HEAD + `
uniform sampler2D uSrc; uniform float uLod; uniform vec2 uDir; uniform float uSigma; out vec4 o;
void main(){
  vec4 acc = vec4(0); float ws = 0.;
  for (int i = -4; i <= 4; i++){ float x = float(i); float w = exp(-.5 * x * x / (uSigma * uSigma)); acc += w * textureLod(uSrc, vUv + uDir * x, uLod); ws += w; }
  o = acc / ws;
}`;

// ---- source: the words, at their depth ----
// Outputs: oT = (transmittance rgb, depth × coverage), oE = (emission rgb, coverage).
// Scenario parameters arrive generically in uP, uQ, uColA, uColB; app.js maps each scenario onto them.
export const SOURCE = HEAD + LIB + LAMPS + `
uniform sampler2D uMask; uniform sampler2D uText;
uniform vec2 uRes; uniform float uPxCm, uTime, uSeed;
uniform int uScene;
uniform float uDepth; uniform vec2 uTilt; uniform vec2 uTextCm;
// The camera: a render pixel's uv maps onto the pane, in cm, through an affine (zoom, pan, roll)
uniform vec2 uO, uAx, uAy; uniform mat2 uToUv;
vec2 paneAt(vec2 uv){ return uO + uAx * uv.x + uAy * uv.y; }
vec2 toUv(vec2 p){ return uToUv * (p - uO); }

uniform float uScatter, uWaveAmp, uWaveLen, uWaveSpd, uApprAmp, uApprPeriod, uStagger;
uniform vec2 uMagC; uniform float uMag;
uniform vec4 uP, uQ; uniform vec3 uColA, uColB;
uniform vec3 uInnerCol, uInnerDir, uInnerAmb;
uniform vec4 uBBox;
layout(location = 0) out vec4 oT;
layout(location = 1) out vec4 oE;

float lodCm(float cm){ return lodFor(cm * uPxCm); }
// the letters as rounded forms: the mask blurred by the roundness gives a height, its slope a normal
vec3 shade(vec2 tuv, float lodR, vec3 base, float sheen){
  vec2 e = exp2(max(lodR, 1.)) / uRes;
  float hx = textureLod(uMask, tuv + vec2(e.x, 0), lodR).r - textureLod(uMask, tuv - vec2(e.x, 0), lodR).r;
  float hy = textureLod(uMask, tuv + vec2(0, e.y), lodR).r - textureLod(uMask, tuv - vec2(0, e.y), lodR).r;
  vec3 N = normalize(vec3(-hx * 1.6, -hy * 1.6, 1.));
  float dif = max(dot(N, uInnerDir), 0.);
  vec3 H = normalize(uInnerDir + vec3(0, 0, 1)); float sp = pow(max(dot(N, H), 0.), 28.) * sheen;
  return base * (uInnerAmb + dif * uInnerCol) + sp * uInnerCol;
}
float inRect(vec2 uv, vec4 r, float soft){ vec2 a = smoothstep(r.xy - soft, r.xy, uv) * (1. - smoothstep(r.zw, r.zw + soft, uv)); return a.x * a.y; }

void main(){
  vec2 uv = vUv;
  vec2 tuv = uv;
  if (uMag != 1.) tuv = uMagC + (uv - uMagC) / uMag;           // a shadow grows as the letter moves toward the lamp
  if (uScene == 8){ tuv += uToUv * vec2(uTime * uP.w, 0.); tuv = fract(tuv); }   // the marquee scrolls
  vec4 m0 = textureLod(uMask, tuv, 0.); float fill = m0.r, tube = m0.g;
  ivec2 ts = textureSize(uText, 0);
  float id = floor(texelFetch(uText, ivec2(clamp(tuv, 0., .9999) * vec2(ts)), 0).b * 255. + .5);

  // depth behind the glass, in cm: the text's plane, tilted, each letter scattered, waved and breathing in
  vec2 pc = paneAt(uv) - uTextCm;
  float D = uDepth + dot(uTilt, pc);
  float ph = uTime / max(uApprPeriod, .1);
  if (id > 0.){
    D += (h11(id + uSeed) - .5) * 2. * uScatter;
    D += uWaveAmp * sin(6.2832 * id / max(uWaveLen, .1) - uTime * uWaveSpd);
    ph -= id * uStagger;
  }
  D += uApprAmp * (.5 - .5 * cos(6.2832 * ph));
  D = max(D, 0.);

  vec3 T = vec3(1), E = vec3(0); float cov = 0.;
  if (uScene == 0){                                   // silhouette: opacity P.x, roundness cm P.y
    cov = fill * uP.x; E = shade(tuv, lodCm(uP.y), uColA, .2) * cov; T = vec3(1. - cov);
  } else if (uScene == 1){                            // pressed: falls back P.x cm, roundness P.y, contact P.z
    float lr = lodCm(uP.y);
    float b = textureLod(uMask, tuv, lr).r; float h = sqrt(clamp((b - .5) * 2., 0., 1.));
    D = D + uP.x * (1. - h);
    cov = fill;
    vec3 c = shade(tuv, lr, uColA, .35);
    float contact = 1. - smoothstep(0., .6, D);
    E = c * (1. - uP.z * contact * .7) * cov; T = vec3(1. - cov);
  } else if (uScene == 2){                            // lit object: roundness P.y, sheen P.z
    cov = fill; E = shade(tuv, lodCm(uP.y), uColA, uP.z) * cov; T = vec3(1. - cov);
  } else if (uScene == 3){                            // stencil: opacity P.x, margin cm P.y, fills frame P.w
    vec2 m = abs(uToUv * vec2(uP.y, 0.)) + abs(uToUv * vec2(0., uP.y));
    float card = uP.w > .5 ? 1. : inRect(uv, uBBox + vec4(-m, m), 1.5 / uRes.x);
    cov = (1. - fill) * card * uP.x;
    E = uColA * (uInnerAmb + uInnerCol * max(uInnerDir.z, 0.)) * cov; T = vec3(1. - cov);
  } else if (uScene == 4){                            // glowing letters: intensity P.x, body P.y, softness cm P.z, flicker P.w
    float soft = textureLod(uMask, tuv, lodCm(uP.z)).r;
    float fl = 1. - uP.w * smoothstep(.55, .85, vnoise(vec2(uTime * 7., id * 7.3)));
    E = uColA * uP.x * fl * mix(fill, max(fill, soft), .7);
    cov = fill * uP.y; T = vec3(1. - cov);
  } else if (uScene == 5){                            // neon: intensity P.x, dead P.y, flicker P.z, core P.w
    float alive = step(uP.y, h11(id * 1.7 + uSeed + 3.));
    float fl = 1. - uP.z * smoothstep(.5, .8, vnoise(vec2(uTime * 11., id * 5.1)));
    float glow = textureLod(uMask, tuv, 2.5).g;
    float core = smoothstep(.55, 1., textureLod(uMask, tuv, 1.).g);
    E = (uColA * (tube + glow * .5) + vec3(1) * uP.w * core) * uP.x * alive * fl + uColA * .015 * tube;
    cov = tube * .3; T = vec3(1. - cov);
  } else if (uScene == 6){                            // halo-lit: the face, dark; the halo is on the wall (composite)
    cov = fill; E = shade(tuv, lodCm(1.5), uColA, .3) * cov; T = vec3(1. - cov);
  } else if (uScene == 7){                            // gel: density P.x, colours by P.y (0 one, 1 a spectrum, 2 alternating)
    vec3 g = uColA;
    if (uP.y > .5 && uP.y < 1.5) g = hsv(fract(id * .137 + uSeed * .1), .9, 1.);
    else if (uP.y > 1.5) g = mod(id, 2.) < 1. ? uColA : uColB;
    vec3 gt = pow(max(g, vec3(.001)), vec3(max(uP.x, .01)));
    T = mix(vec3(1), gt, fill); cov = fill;
    E = g * uInnerCol * .04 * fill;
  } else if (uScene == 8){                            // LED matrix: pitch cm P.x, dot P.y, intensity P.z; off glow Q.x, board Q.y, threshold Q.z
    vec2 g = paneAt(tuv) / uP.x;
    vec2 cell = floor(g) + .5;
    float on = smoothstep(uQ.z - .12, uQ.z + .12, textureLod(uMask, toUv(cell * uP.x), lodCm(uP.x * .3)).r);
    float d = length(fract(g) - .5) / max(uP.y * .5, .01);
    float dotm = 1. - smoothstep(.75, 1., d);
    E = uColA * uP.z * dotm * (on + uQ.x * .03);
    vec2 m = abs(uToUv * vec2(uP.x * 2., 0.)) + abs(uToUv * vec2(0., uP.x * 2.));
    float board = inRect(uv, uBBox + vec4(-m, m), 1.5 / uRes.x);
    cov = board * uQ.y; T = vec3(1. - cov * (1. - dotm * .4));
  } else if (uScene == 12){                           // smoke: density P.x, turbulence P.y, rise P.z, dissolve P.w; brightness Q.x
    vec2 q = paneAt(tuv) * .05;
    float t = uTime * uP.z;
    vec2 w = vec2(fbm(q * 1.5 + vec2(0, -t * .5)), fbm(q * 1.5 + vec2(3.1, -t * .4))) - .5;
    vec2 suv = tuv + w * uP.y * .06 - vec2(0, uP.y * .025 * fbm(q * 3. - vec2(0, t)));   // pulled about, and lifted
    float dens = textureLod(uMask, suv, 1.5 + uP.y * 2.).r;
    float wisp = fbm(q * 4. + w * 3. - vec2(0, t * 1.2));
    dens *= smoothstep(uP.w, uP.w + .45, wisp + .2);
    dens = clamp(dens * uP.x, 0., 1.);
    vec3 lit = lamps(paneAt(uv), vec2(0), .9, 0., 0., 1.);
    E = dens * uQ.x * uColA * (lit * 8. + uInnerCol * .5 + .06);
    cov = dens; T = vec3(1. - dens * .2);
  }
  oT = vec4(T, D * cov);
  oE = vec4(E, cov);
}`;

// ---- surface state: condensation (r), water film (g), grease (b) ----
export const STATE = HEAD + `
uniform sampler2D uPrev; uniform vec2 uPaneCm; uniform float uDt;
uniform float uFogTarget, uRegrow, uEvap, uDry;
uniform vec4 uBrush;          // x y (uv), previous x y
uniform vec4 uBrushP;         // radius cm, strength, tool (1 wipe 2 wet 3 breathe 4 grease 5 clean), down
uniform vec4 uBreath;         // x y (uv), radius cm, amount
uniform vec4 uDrops[48]; uniform int uDropN;
uniform float uReset;
out vec4 o;
float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0., 1.); return length(pa - ba * h); }
void main(){
  vec4 s = texture(uPrev, vUv);
  float fog = s.r, wet = s.g, gr = s.b;
  if (uReset > .5){ fog = uFogTarget; wet = 0.; gr = 0.; }
  vec2 p = vUv * uPaneCm;
  // condensation settles toward the level the air sets, never onto a water film or grease, and evaporates back down
  float target = uFogTarget * (1. - gr * .92) * (1. - wet);
  if (uBreath.w > 0.){ float d = length(p - uBreath.xy * uPaneCm) / max(uBreath.z, .1); target = max(target, uBreath.w * (1. - smoothstep(.4, 1., d)) * (1. - gr * .92)); }
  fog += target > fog ? (target - fog) * (1. - exp(-uDt * uRegrow)) : (target - fog) * (1. - exp(-uDt * uEvap));
  wet = max(0., wet - uDt * uDry);
  if (uBrushP.w > .5){
    float d = seg(p, uBrush.xy * uPaneCm, uBrush.zw * uPaneCm) / max(uBrushP.x, .1);
    float b = (1. - smoothstep(.55, 1., d)) * uBrushP.y;
    int tool = int(uBrushP.z + .5);
    if (tool == 1){ fog *= 1. - b; wet = max(wet, b * .55); }
    else if (tool == 2) wet = max(wet, b);
    else if (tool == 3) fog = min(1., fog + b * uDt * 2.5);
    else if (tool == 4) gr = max(gr, b);
    else if (tool == 5){ fog = mix(fog, uFogTarget, b); wet *= 1. - b; gr *= 1. - b; }
  }
  for (int i = 0; i < 48; i++){
    if (i >= uDropN) break;
    vec4 dr = uDrops[i];
    vec2 q = p - dr.xy * uPaneCm; q.y *= .8;
    float b = 1. - smoothstep(dr.z * .7, dr.z * 1.05, length(q));
    fog *= 1. - b; wet = max(wet, b);
  }
  o = vec4(clamp(fog, 0., 1.), clamp(wet, 0., 1.), clamp(gr, 0., 1.), 1.);
}`;

// ---- composite: the pane and everything seen through it ----
export const COMPOSITE = HEAD + LIB + LAMPS + `
uniform sampler2D uN1, uN2, uMask, uState;
uniform vec2 uRes, uPaneCm; uniform float uPxCm, uTime;
uniform vec4 uPA[4], uPB[4];
uniform vec2 uView; uniform vec3 uSurround;
// The camera: a render pixel's uv maps onto the pane, in cm, through an affine (zoom, pan, roll)
uniform vec2 uO, uAx, uAy; uniform mat2 uToUv;
vec2 paneAt(vec2 uv){ return uO + uAx * uv.x + uAy * uv.y; }
vec2 toUv(vec2 p){ return uToUv * (p - uO); }

uniform int uArr; uniform vec4 uArrP; uniform float uFrameW; uniform vec3 uFrameCol;
uniform vec4 uC0, uC1, uC2, uC3, uC4;
uniform vec4 uDrops[48]; uniform int uDropN;
uniform int uScene; uniform float uDepth; uniform vec4 uP, uQ; uniform vec3 uColA, uColB;
uniform vec2 uPen;
uniform vec3 uWall; uniform float uWallDist, uWash;
uniform float uHaze; uniform vec3 uHazeCol;
uniform vec3 uFront; uniform vec2 uFrontPos; uniform float uFrontSpread, uFrontGloss;
uniform vec2 uRefl; uniform float uBokeh;
out vec4 o;

struct Surf { float k; float k2; float gap; float clar; float tail; float spread; vec3 tr; vec2 slope; float refl; vec3 n; float wetc; float white; };

mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

Surf surf(vec4 P0, vec4 P1, vec4 P2, vec4 P3, vec2 p){
  Surf s;
  s.k = tan(radians(clamp(P0.x, 0., 84.))); s.k2 = 0.; s.gap = 0.;
  s.clar = P0.y; s.tail = P0.z; s.spread = max(P0.w, 1.);
  s.tr = P1.rgb * exp(-P1.a);
  s.slope = vec2(0); s.refl = P3.y; s.n = vec3(0, 0, 1); s.wetc = P3.w; s.white = 0.;
  int tx = int(P2.x + .5); float sc = max(P2.y, .02), am = P2.z, rf = P2.w;
  float ang = radians(P3.x);
  vec2 q = rot(-ang) * p / sc;
  float px = sc * uPxCm;                                   // the texture's period in pixels: too fine and it is averaged
  float fine = smoothstep(2., 6., px);
  // a frosted face's micro-relief: the spread and the light passed wander a little
  if (P3.z > 0.){ float g = vnoise(p * 6.) * .6 + vnoise(p * 19.) * .4; s.k *= 1. + P3.z * (g - .5) * 1.4; s.tr *= 1. - P3.z * .12 * g; }
  if (tx == 1){                                            // sandblast: coarse grain
    float n = vnoise(q * 5.) * .55 + vnoise(q * 15.) * .45;
    s.k *= 1. + am * (n - .5) * 1.4; s.tr *= 1. - am * .3 * n; s.clar *= 1. - am * .6 * n; s.white += am * .05 * n;
  } else if (tx == 2){                                     // paper: a cloud of pulp and long fibres
    float f = 0.;
    vec2 wq = q + (vec2(fbm(q * .7), fbm(q * .7 + 5.)) - .5) * 1.5;           // fibres wander
    for (int i = 0; i < 5; i++){ float a = float(i) * 1.37 + .4; vec2 d = vec2(cos(a), sin(a));
      vec2 r = vec2(dot(wq, d), dot(wq, vec2(-d.y, d.x)));
      f += smoothstep(.78, 1., vnoise(vec2(r.x * .35, r.y * 6.) + float(i) * 7.)) * (.5 + .5 * h11(float(i))); }
    float cloud = fbm(q * 1.1) * .7 + fbm(q * 4.) * .3;
    s.tr *= (1. - am * .42 * (cloud - .3)) * (1. + am * .22 * f * fine); s.k *= 1. + am * .3 * (cloud - .5); s.white += am * .05 * f;
  } else if (tx == 3){                                     // weave: threads scatter, the gaps between them don't
    vec2 g = fract(q) - .5;
    float tw = mix(.35, .95, am);
    float aa = 1.2 / max(px, 1.);
    float tX = 1. - smoothstep(tw * .5 - aa, tw * .5 + aa, abs(g.y));
    float tY = 1. - smoothstep(tw * .5 - aa, tw * .5 + aa, abs(g.x));
    float thread = max(tX, tY);
    float open = mix(1. - (tw * 2. - tw * tw), 1. - thread, fine);
    s.clar = mix(s.clar, 1., open);
    float over = mod(floor(q.x) + floor(q.y), 2.);
    s.tr *= mix(vec3(1), vec3(.82 + .1 * over), (1. - open));
    s.n = normalize(vec3(g.x * tY - g.y * 0., g.y * tX, 2.));
  } else if (tx == 4){                                     // reeds: a row of cylindrical lenses
    float fx = fract(q.x) - .5;
    vec2 sl = vec2(fx * 2.2 * rf, 0.);
    s.slope = rot(ang) * sl;
    s.n = normalize(vec3(rot(ang) * vec2(-fx * rf * 1.5, 0.), 1.));
    s.tr *= 1. - .1 * smoothstep(.44, .5, abs(fx)) * fine;
  } else if (tx == 5){                                     // hammered: a beaten, lumpy face
    float e = .08;
    float hx = fbm(q + vec2(e, 0)) - fbm(q - vec2(e, 0)), hy = fbm(q + vec2(0, e)) - fbm(q - vec2(0, e));
    vec2 gr = vec2(hx, hy) / (2. * e);
    s.slope = rot(ang) * gr * rf * .5;
    s.n = normalize(vec3(-rot(ang) * gr * rf * .6, 1.));
  } else if (tx == 6){                                     // glass block: a pillow lens per block, ripples, mortar
    vec2 g = fract(q) - .5;
    vec2 sl = sin(g * 6.2832) * rf * .35 + g * rf * .3;
    s.slope = rot(ang) * sl;
    s.n = normalize(vec3(-rot(ang) * g * rf, 1.));
    float e = .5 - max(abs(g.x), abs(g.y));
    float mortar = 1. - smoothstep(am * .05, am * .05 + 1.5 / max(px, 1.), e);
    s.tr *= 1. - mortar * .93; s.clar *= 1. - mortar; s.white += mortar * .15;
  } else if (tx == 7){                                     // ice: shards, each bending light its own way, and bubbles
    vec2 cc, cid; vec3 v = voro(q, cc, cid);
    float edge = 1. - smoothstep(0., .05 + .4 / max(px, 1.), v.y - v.x);
    s.slope = (h22(cid) - .5) * rf * .35 * (1. - edge * .7) + (vec2(vnoise(q * 3.), vnoise(q * 3. + 4.)) - .5) * rf * .15;
    vec2 cc2, cid2; vec3 b = voro(q * 7. + 3.1, cc2, cid2);
    float bub = (1. - smoothstep(.06, .12, b.x)) * step(.6, b.z);
    s.white += (edge * .25 + bub * .3) * am; s.k *= 1. + edge * 1.5 * am; s.tr *= 1. - .08 * edge * am;
    s.n = normalize(vec3((h22(cid) - .5) * rf * .6, 1.));
  } else if (tx == 8){                                     // ripple: poured cathedral glass
    vec2 sl = vec2(sin(q.y * 6.28 + sin(q.x * 3.1) * 1.5), cos(q.x * 4.4 + sin(q.y * 2.3))) * rf * .25;
    s.slope = rot(ang) * sl; s.n = normalize(vec3(-s.slope * 1.4, 1.));
  }
  return s;
}
Surf mixSurf(Surf a, Surf b, float w){
  Surf s;
  s.k = mix(a.k, b.k, w); s.k2 = 0.; s.gap = 0.; s.clar = mix(a.clar, b.clar, w); s.tail = mix(a.tail, b.tail, w); s.spread = mix(a.spread, b.spread, w);
  s.tr = mix(a.tr, b.tr, w); s.slope = mix(a.slope, b.slope, w); s.refl = mix(a.refl, b.refl, w);
  s.n = normalize(mix(a.n, b.n, w)); s.wetc = mix(a.wetc, b.wetc, w); s.white = mix(a.white, b.white, w);
  return s;
}

float aaCm(){ return 1.2 / uPxCm; }
// how the panes are arranged: w is pane B's share (0 pane A, 1 pane B); fr is the frame bars
void arrange(vec2 p, out float w, out float fr){
  w = 0.; fr = 0.; float bw = uFrameW * .5, aa = aaCm();
  if (uArr == 1){ float x = p.x - uArrP.x; w = smoothstep(-aa, aa, x); fr = 1. - smoothstep(bw - aa, bw + aa, abs(x)); }
  else if (uArr == 2){ float y = abs(p.y - uArrP.x) - uArrP.y * .5; w = 1. - smoothstep(-aa, aa, y); fr = 1. - smoothstep(bw - aa, bw + aa, abs(y)); }
  else if (uArr == 3){ w = smoothstep(uArrP.x, uArrP.y, p.y); }
  else if (uArr == 5){ vec2 g = p / max(uArrP.z, 1.); vec2 c = floor(g); w = mod(c.x + c.y, 2.);
    vec2 f = abs(fract(g) - .5) * uArrP.z; float e = uArrP.z * .5 - max(f.x, f.y); fr = 1. - smoothstep(bw - aa, bw + aa, e); }
  else if (uArr == 6){ float g = p.x / max(uArrP.w, 1.); w = mod(floor(g), 2.);
    float e = (.5 - abs(fract(g) - .5)) * uArrP.w; fr = 1. - smoothstep(bw - aa, bw + aa, e); }
  if (uFrameW <= 0.) fr = 0.;
}

// a water bead as a lens: inverts and shrinks what is behind, is clear inside, dark at the rim, shines from the front
void bead(inout Surf M, vec2 dq, float strength){
  float d = length(dq);
  if (d >= 1.) return;
  float inner = 1. - smoothstep(.82, 1., d);
  M.slope += -dq * .55 * strength;
  M.clar = mix(M.clar, 1., inner);
  M.k *= 1. - inner * .95; M.k2 *= 1. - inner;
  M.tr *= mix(1., .62, smoothstep(.7, 1., d));
  M.n = normalize(vec3(dq * .95, sqrt(max(1. - d * d, .02))));
  M.white *= 1. - inner;
  M.refl = max(M.refl, .06);
}

void main(){
  vec2 uv = vUv;
  vec2 p = paneAt(uv);
  vec2 pin = uPaneCm * .5 - abs(p);
  float inside = smoothstep(-aaCm(), aaCm(), min(pin.x, pin.y));
  float w, fr; arrange(p, w, fr);
  Surf A = surf(uPA[0], uPA[1], uPA[2], uPA[3], p);
  Surf M;
  if (uArr == 4){                                          // stacked: pane B stands gap cm behind pane A
    Surf B = surf(uPB[0], uPB[1], uPB[2], uPB[3], p);
    M = A; M.k2 = B.k; M.gap = uArrP.x; M.clar = A.clar * B.clar; M.tr = A.tr * B.tr; M.slope = A.slope + B.slope;
    M.white = A.white + B.white * (1. - A.clar * .5) * .6; M.tail = max(A.tail, B.tail); M.spread = max(A.spread, B.spread);
  } else if (uArr == 0) M = A;
  else { Surf B = surf(uPB[0], uPB[1], uPB[2], uPB[3], p); M = mixSurf(A, B, w); }

  // ---- conditions on the surface ----
  vec4 st = inside > 0. ? texture(uState, p / uPaneCm + .5) : vec4(0);
  float fog = st.r, wet = st.g;
  if (uScene == 10){                                       // written in the condensation: finger P.x cm, fogging over P.y
    float wm = pyr(uMask, uv, uP.x * uPxCm).r;
    wm = smoothstep(.25, .75, wm);
    fog *= 1. - wm * (1. - uP.y); wet = max(wet, wm * .7 * (1. - uP.y));
  } else if (uScene == 11){                                // latent: grease resists condensation, resist P.x
    float lm = textureLod(uMask, uv, 1.).r;
    fog *= 1. - lm * uP.x;
    M.refl += lm * .015;
  }
  if (uC0.w > 0.){ float wp = smoothstep(1. - uC0.w, 1. - uC0.w + .08, fbm(p * .045 + 11.)); wet = max(wet, wp); }
  // smudges and fingerprints: oil fills a frosted face's pits and keeps condensation off
  if (uC1.z > 0.){
    vec2 g = p / 26.; vec2 c = floor(g);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
      vec2 cell = c + vec2(x, y); vec2 hh = h22(cell * 1.7 + 5.);
      if (hh.x > uC1.z) continue;
      vec2 ctr = (cell + .2 + .6 * h22(cell + 9.)) * 26.;
      vec2 l = rot(hh.y * 6.28) * (p - ctr); l.x *= 1.35;
      float sz = 3.2 + 3. * hh.y; float ed = length(l) / sz;
      if (ed > 1.) continue;
      float ridge = .5 + .5 * sin(length(l) * 9. + fbm(l * .6) * 4.);
      float sm = (1. - smoothstep(.55, 1., ed)) * mix(.6, 1., ridge);
      M.clar = mix(M.clar, min(1., M.clar + .55), sm * .7); M.k *= 1. - .45 * sm; fog *= 1. - sm * .8;
      M.refl += sm * .03;
    }
  }
  // condensation: a film of tiny droplets spreads light as frost does
  M.k = sqrt(M.k * M.k + pow(.95 * fog, 2.));
  M.clar *= 1. - .97 * fog; M.white += fog * .32; M.tr *= 1. - fog * .06;
  // a film of water fills the frost and clears it (wetted frosted glass goes clear)
  M.clar = mix(M.clar, 1., wet * M.wetc); M.k *= 1. - .92 * wet * M.wetc; M.k2 *= 1. - .5 * wet * M.wetc;
  M.white *= 1. - wet * .7;
  if (wet > .01) M.slope += (vec2(vnoise(p * .4), vnoise(p * .4 + 7.)) - .5) * .03 * wet;
  // beads: condensation's larger drops (where it is thick) and rain's
  float bAmt = uC0.x * smoothstep(.2, .6, fog) + uC0.z;
  if (bAmt > 0.){
    float spacing = uC0.y * 2.4;
    vec2 cc, cid; vec3 v = voro(p / spacing, cc, cid);
    if (v.z < bAmt){
      float r = uC0.y * (.3 + .7 * h21(cid + 3.3));
      bead(M, (p - cc * spacing) / r, 1.);
    }
    vec2 cc2, cid2; vec3 v2 = voro(p / (spacing * .45) + 40., cc2, cid2);  // a finer mist of small beads
    float mist = uC0.x * smoothstep(.2, .6, fog);
    if (v2.z < mist * .8){ float r = uC0.y * .3 * (.3 + .7 * h21(cid2)); bead(M, (p - (cc2 - 40.) * spacing * .45) / r, .6); }
  }
  for (int i = 0; i < 48; i++){                            // running drops
    if (i >= uDropN) break;
    vec4 dr = uDrops[i];
    vec2 q = p - (dr.xy - .5) * uPaneCm;
    q.y = q.y < 0. ? q.y * 1.15 : q.y / (1. + dr.w * .8);  // a running drop drags out a tail above it
    bead(M, q / dr.z, 1.);
  }
  // dust and specks: they block light, so they read dark against the glow
  if (uC1.x > 0.){
    vec2 cc, cid; float cs = uC1.y * 7.;
    vec3 v = voro(p / cs, cc, cid);
    if (v.z < uC1.x){ float r = uC1.y * (.25 + .75 * h21(cid + 1.)) / cs; float sp = 1. - smoothstep(r * .55, r, v.x); M.tr *= 1. - .9 * sp; M.white += sp * .03; }
    vec3 v2 = voro(p / (cs * .4) + 9., cc, cid);
    if (v2.z < uC1.x * .8){ float r = uC1.y * .35 * (.3 + .7 * h21(cid)) / (cs * .4); float sp = 1. - smoothstep(r * .5, r, v2.x); M.tr *= 1. - .7 * sp; }
  }
  // scratches catch the front light when they lie across it
  float glint = 0.;
  if (uC1.w > 0.){
    vec2 g = p / 9.; vec2 c = floor(g);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
      vec2 cell = c + vec2(x, y); vec2 hh = h22(cell + 2.2);
      if (hh.x > uC1.w) continue;
      vec2 ctr = (cell + h22(cell + 4.4)) * 9.; float a = hh.y * 6.28 + 1.;
      vec2 dir = vec2(cos(a), sin(a)); float len = uC2.x * (.4 + .6 * hh.y);
      vec2 pa = p - ctr; float hpos = clamp(dot(pa, dir), -len, len);
      float dist = length(pa - dir * hpos);
      float sc = (1. - smoothstep(0., .06 + .7 / uPxCm, dist)) * (1. - pow(abs(hpos) / len, 4.));
      vec2 toL = normalize(uFrontPos - p);
      glint += sc * pow(abs(dot(vec2(-dir.y, dir.x), toL)), 6.);
      M.white += sc * .05; M.k *= 1. + sc;
    }
  }
  // frost: feathers of ice that grow in from the edges
  if (uC2.y > 0.){
    float e = min(uPaneCm.x * .5 - abs(p.x), uPaneCm.y * .5 - abs(p.y));
    float reach = 1. - e / max(uC2.z, 1.);
    vec2 wp = p + (vec2(fbm(p * .06), fbm(p * .06 + 3.)) - .5) * 14.;
    float fern = ridged(wp * .16) * .6 + ridged(wp * .7 + 2.) * .4;
    float fz = smoothstep(.58, .8, fern * .55 + reach * uC2.y * .75) * smoothstep(0., .15, uC2.y);
    M.k = sqrt(M.k * M.k + pow(1.6 * fz, 2.)); M.clar *= 1. - fz * .9; M.white += fz * .4; M.tr *= 1. - .1 * fz;
  }
  // cracks: a star of breaks around a point, each shard bending what is behind a little differently
  if (uC2.w > 0.){
    vec2 rel = p - uC3.xy; float rad = length(rel);
    float region = 1. - smoothstep(uC2.w * 55., uC2.w * 60., rad);
    if (region > 0.){
      float a = atan(rel.y, rel.x);
      vec2 cc, cid; vec3 v = voro(vec2(a * 2.4, log(rad + 1.) * 4.), cc, cid);
      float lineW = .03 + .5 / (uPxCm * max(rad, 1.) * .1);
      float line = 1. - smoothstep(0., lineW, v.y - v.x);
      float ring = 1. - smoothstep(0., .5 / uPxCm + .05, abs(fract(log(rad + 1.) * 2.2) - .5) * rad * .2);
      line = max(line, ring * step(fract(cid.x * .37), .55)) * region;
      M.slope += (h22(cid) - .5) * .09 * region;
      M.white += line * .45; M.tr *= 1. - line * .5;
      M.n = normalize(vec3((h22(cid) - .5) * .25 * region, 1.));
    }
  }
  // heat shimmer in the air: moves what is far behind more than what is near
  if (uC3.z > 0.){
    float t = uTime * uC3.w;
    M.slope += (vec2(vnoise(p * .12 + vec2(0, t)), vnoise(p * .12 + vec2(7., t * 1.1))) - .5) * uC3.z * .05;
  }
  // streaks: dried water marks running down
  if (uC4.x > 0.){
    float s = smoothstep(.6, .92, vnoise(vec2(p.x * .55, p.y * .035 + 3.))) * smoothstep(.3, .7, fbm(p * .08));
    M.tr *= 1. - uC4.x * .45 * s; M.white += uC4.x * .06 * s;
  }

  // ---- how far behind: depth from the words' own record, finest first ----
  float num = 0., den = 0.;
  float lw[4] = float[4](4., 2., 1., .35); float ll[4] = float[4](0., 2., 4., 7.);
  for (int i = 0; i < 4; i++){ float l = min(ll[i], uMaxLod); num += lw[i] * textureLod(uN1, uv, l).a; den += lw[i] * textureLod(uN2, uv, l).a; }
  float Dt = den > .002 ? num / den : uDepth;
  Dt = mix(uDepth, Dt, smoothstep(.002, .05, den));

  float kpx = M.k * uPxCm, k2px = M.k2 * uPxCm;
  float rE = sqrt(pow(kpx * Dt, 2.) + pow(k2px * max(Dt - M.gap, 0.), 2.) + .25);
  float pen = uPen.x > 0. ? uPxCm * uPen.x * Dt / max(uPen.y - Dt, 2.) : 0.;
  rE = sqrt(rE * rE + uBokeh * uBokeh);
  float rT = sqrt(rE * rE + pen * pen);
  // scattered light leaves from the surface, so it stays put as the camera moves; light passing straight
  // through comes from behind, and shifts with the camera's angle (parallax)
  vec2 nuv = uv + uToUv * (M.slope * Dt);
  vec2 suv = uv + uToUv * ((M.slope + uView) * Dt);

  vec3 Td = pyr(uN1, nuv, rT).rgb, Ed = pyr(uN2, nuv, rE).rgb;
  if (M.tail > 0.){ Td = mix(Td, pyr(uN1, nuv, rT * M.spread).rgb, M.tail); Ed = mix(Ed, pyr(uN2, nuv, rE * M.spread).rgb, M.tail); }
  vec3 Ts = Td, Es = Ed;
  if (M.clar > .001){ float rb = sqrt(.25 + uBokeh * uBokeh); Ts = pyr(uN1, suv, sqrt(rb * rb + pen * pen * .25)).rgb; Es = pyr(uN2, suv, rb).rgb; }

  // ---- what is behind the words: the lamps, the wall, the halo ----
  float s0 = sqrt(.25 + uBokeh * uBokeh) / uPxCm;
  vec3 Ld = lamps(p, M.slope, M.k, M.k2, M.gap, s0);
  if (M.tail > 0.) Ld = mix(Ld, lamps(p, M.slope, M.k * M.spread, M.k2 * M.spread, M.gap, s0), M.tail);
  vec3 Ls = M.clar > .001 ? lamps(p, M.slope + uView, 0., 0., 0., s0) : Ld;
  vec2 pw = p + M.slope * uWallDist, pws = p + (M.slope + uView) * uWallDist;
  vec3 wall = uWall * (.75 + .35 * smoothstep(-uPaneCm.y * .6, uPaneCm.y * .6, pw.y));
  vec3 wallS = uWall * (.75 + .35 * smoothstep(-uPaneCm.y * .6, uPaneCm.y * .6, pws.y));
  if (uWash > 0.){                                          // the lamps light the wall behind them
    for (int i = 0; i < 3; i++){
      vec4 a = uL[i * 4], b = uL[i * 4 + 1], c = uL[i * 4 + 2];
      if (b.w <= 0.) continue;
      float spread = max(uWallDist - a.z, 10.) * .9 + b.x;
      vec2 dq = pw - a.xy, dqs = pws - a.xy;
      float k = uWash * b.w * (b.x * b.y + 4.) / (spread * spread) * .08;
      wall += k * c.rgb * exp(-dot(dq, dq) / (2. * spread * spread));
      wallS += k * c.rgb * exp(-dot(dqs, dqs) / (2. * spread * spread));
    }
  }
  vec3 haloD = vec3(0), haloS = vec3(0);
  if (uScene == 6){                                        // halo: intensity P.x, spread cm P.y, standoff cm P.z
    float dh = uDepth + uP.z;
    vec2 huv = uv + uToUv * (M.slope * dh), huvS = uv + uToUv * ((M.slope + uView) * dh);
    float sp = uP.y * uPxCm;
    float rh = sqrt(sp * sp + pow(kpx * dh, 2.) + pow(k2px * max(dh - M.gap, 0.), 2.) + uBokeh * uBokeh);
    sp = sqrt(sp * sp + uBokeh * uBokeh);
    haloD = uColB * uP.x * pyr(uMask, huv, rh).r;
    haloS = uColB * uP.x * pyr(uMask, huvS, sp).r;
  }
  vec3 behindD = Ld + wall + haloD, behindS = Ls + wallS + haloS;

  vec3 frontD = behindD * Td + Ed, frontS = behindS * Ts + Es;
  if (uHaze > 0.){                                         // haze in the box: light scattered between the words and the glass
    float hz = 1. - exp(-uHaze * Dt * .02);
    vec3 wide = lamps(p, vec2(0), 1.1, 0., 0., 1.) * uHazeCol;
    frontD = mix(frontD, wide, hz) + wide * uHaze * .15; frontS = mix(frontS, wide, hz) + wide * uHaze * .15;
  }
  vec3 col = mix(frontD, frontS, clamp(M.clar, 0., 1.)) * M.tr;

  if (uScene == 9){                                        // projected: intensity P.x, focus offset cm P.y
    float r = abs(uP.y) * uPxCm * .12 + .5;
    vec3 pj = uColA * uP.x * pyr(uMask, uv, r).r;
    col += pj * (1. - .95 * clamp(M.clar, 0., 1.)) * M.tr;
  }

  // ---- your side: the front light on the pane, and the room reflected in it ----
  vec2 fd = p - uFrontPos;
  vec3 fl = uFront * (exp(-dot(fd, fd) / (2. * uFrontSpread * uFrontSpread)) * .85 + .15);
  // what scatters on the surface (frost, fog, dust, fibres) is lit from the front and, glowing, from behind
  col += fl * (M.refl * (1. - clamp(M.clar, 0., 1.)) + M.white) + M.white * behindD * .18;
  vec3 L = normalize(vec3(uFrontPos - p, uFrontSpread * 1.5)); vec3 H = normalize(L + vec3(0, 0, 1));
  float spec = pow(max(dot(M.n, H), 0.), uFrontGloss);
  col += uFront * spec * mix(.08, .9, smoothstep(0., .03, 1. - M.n.z)) * (.3 + M.refl * 4.);
  col += uFront * glint * uC4.y * 1.5;
  if (uRefl.x > 0.){
    vec2 rc = vec2(-uPaneCm.x * .22, uPaneCm.y * .12);
    float r = rectB(p - rc, vec2(uPaneCm.x * .16, uPaneCm.y * .32), uRefl.y * uPaneCm.x * .06 + .3);
    r -= rectB(p - rc, vec2(.8, uPaneCm.y * .32), uRefl.y * uPaneCm.x * .06 + .3) * .9;
    col += uRefl.x * r * (.05 + .1 * clamp(M.clar, 0., 1.)) * vec3(.85, .92, 1.);
  }
  col = mix(col, uFrameCol * (.05 + fl * .5), fr);
  // beyond the pane's edge: the wall it is set in
  col = mix(uSurround * (.04 + fl * .6), col, inside);
  o = vec4(max(col, 0.), 1.);
}`;

// ---- final: the camera ----
export const FINAL = HEAD + LIB + `
uniform sampler2D uC; uniform vec2 uRes; uniform float uTime;
uniform float uExposure, uContrast, uSat, uBloom, uBloomR, uHalation, uVig, uGrain, uGrainSize, uCA, uFocus, uSplit;
uniform vec3 uWB, uShadow, uHigh; uniform int uTone;
uniform mat3 uOrbit; uniform float uF0, uAspect; uniform vec4 uBB; uniform vec3 uBg;
out vec4 o;
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
vec3 toSRGB(vec3 c){ c = clamp(c, 0., 1.); return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
float luma(vec3 c){ return dot(c, vec3(.2126, .7152, .0722)); }
void main(){
  // the screen pixel's ray, from an eye orbiting the pane's centre, meets the pane: that point in the flat render
  vec2 ndc = vec2((vUv.x - .5) * uAspect, vUv.y - .5);
  vec3 E = uOrbit * vec3(0, 0, -uF0), R = uOrbit * vec3(ndc, uF0);
  bool hit = R.z > 1e-4;
  vec2 q = E.xy + R.xy * (-E.z / max(R.z, 1e-4));
  vec2 f = vec2(q.x / uAspect + .5, q.y + .5);
  vec2 uv = (f - uBB.xy) / uBB.zw;
  hit = hit && all(greaterThanEqual(uv, vec2(0))) && all(lessThanEqual(uv, vec2(1)));
  vec3 c;
  if (!hit) c = uBg;
  else if (uFocus > .01) c = pyr(uC, uv, uFocus).rgb; else c = textureLod(uC, uv, 0.).rgb;
  if (uCA > 0. && hit){
    vec2 d = (uv - .5) * uCA * .004;
    float r = (uFocus > .01 ? pyr(uC, uv + d, uFocus).r : textureLod(uC, uv + d, 0.).r);
    float b = (uFocus > .01 ? pyr(uC, uv - d, uFocus).b : textureLod(uC, uv - d, 0.).b);
    c = vec3(r, c.g, b);
  }
  if ((uBloom > 0. || uHalation > 0.) && hit){
    vec3 bl = vec3(0); float ws = 0.;
    float centre = 3. + uBloomR * 4.;
    for (int i = 2; i <= 9; i++){ float l = float(i); if (l > uMaxLod) break; float w = exp(-pow(l - centre, 2.) * .5); bl += w * textureLod(uC, uv, l).rgb; ws += w; }
    bl /= max(ws, 1e-4);
    c += bl * uBloom * .25;
    c += vec3(1., .35, .12) * luma(textureLod(uC, uv, min(5., uMaxLod)).rgb) * uHalation * .2;
  }
  c *= exp2(uExposure) * uWB;
  if (uTone == 0) c = aces(c * .8);
  else if (uTone == 1) c = c / (1. + luma(c)) * (1. + luma(c) / 16.);
  else if (uTone == 2) c = aces(c * 1.1);
  else c = clamp(c, 0., 1.);
  c = clamp(c, 0., 1.);
  float l = luma(c);
  c = mix(vec3(l), c, uSat);
  c = clamp((c - .5) * uContrast + .5, 0., 1.);
  if (uSplit > 0.){ l = luma(c); c = mix(c, c * mix(uShadow, uHigh, smoothstep(.15, .8, l)) * 1.6, uSplit * .5); }
  vec2 vq = (vUv - .5) * vec2(uRes.x / uRes.y, 1.);
  c *= 1. - uVig * smoothstep(.25, 1.1, length(vq));
  vec3 s = toSRGB(c);
  if (uGrain > 0.){
    vec2 g = floor(gl_FragCoord.xy / max(uGrainSize, 1.));
    float n = h21(g + fract(uTime * 13.7) * 91.7) + h21(g * 1.31 + fract(uTime * 7.3) * 37.1) - 1.;
    s += n * uGrain * .09 * (1. - abs(luma(s) - .5));
  }
  o = vec4(s, 1.);
}`;
