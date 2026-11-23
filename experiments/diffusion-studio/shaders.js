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
//   gobo      a pattern (leaves, bars, lace, caustics) standing between the lamps and the glass
//   shaft     haze lit by the lamps, ray-marched with the shadows of everything between (a quarter size)
//   final     orbit, the glass's focus, bloom, exposure, white balance, tone curve, split tone, vignette, grain
// And, for a still: trace, a Monte Carlo ray tracer of the same scene, averaged over many passes.

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
float lodForM(float r, float m){ return clamp(r < 2. ? r * .5 : log2(r), 0., m); }
float lodFor(float r){ return lodForM(r, uMaxLod); }
vec4 pyrM(sampler2D t, vec2 uv, float r, float m){
  float lod = lodForM(r, m); int l0 = int(floor(lod)); float f = lod - float(l0);
  vec4 a = l0 == 0 ? textureLod(t, uv, 0.) : bspline(t, uv, l0);
  if (f < .002) return a;
  return mix(a, bspline(t, uv, min(l0 + 1, int(m))), f);
}
vec4 pyr(sampler2D t, vec2 uv, float r){ return pyrM(t, uv, r, uMaxLod); }
float lum(vec3 c){ return dot(c, vec3(.2126, .7152, .0722)); }
`;

// The lamps behind the pane, drawn already spread. Each lamp is four vec4s:
//   (x cm, y cm, distance behind the glass cm, shape) (half width, half height, rotation, intensity)
//   (r, g, b, slats) (slat opening, mullion width, —, —)
// Shapes: 0 bulb, 1 softbox, 2 window with cross bars, 3 blinds, 4 strip, 5 ring. Four lamps: three you set,
// and the projector's.
//
// The lens: a camera uCamD cm in front of the glass, focused uFd cm behind it, blurs a thing d cm behind the glass
// by defoc(d) px (uBk is the blur of something far away when the glass is in focus).
const LAMPS = `
uniform vec4 uL[16];
uniform float uPxCm;
uniform float uBk, uFd, uCamD;
float defoc(float d){ return uBk * uCamD * abs(1. / (uCamD + uFd) - 1. / (uCamD + max(d, 0.))); }
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
// shifted by the surface's slope times the lamp's distance (refraction moves far things more). s0 below zero: the
// lamp seen straight through, blurred by the lens at its distance.
vec3 lamps(vec2 p, vec2 slope, float k, float k2, float gap, float s0){
  vec3 o = vec3(0);
  for (int i = 0; i < 4; i++){
    float dist = uL[i * 4].z;
    float s0i = s0 < 0. ? defoc(dist) / uPxCm + .05 : s0;
    float s = sqrt(pow(k * dist, 2.) + pow(k2 * max(dist - gap, 0.), 2.) + s0i * s0i);
    o += lampOne(i, p + slope * dist, s);
  }
  return o;
}
`;


// A pattern standing between the lamps and the glass, uGobD cm behind it: leaves, window bars, blinds, lace, water
// caustics, branches, chain-link. It multiplies the light from everything behind it (caustics can brighten).
const GOBO_FN = `
uniform int uGobK; uniform vec4 uGob; uniform float uGobT;   // kind (-1 none); scale cm, amount, sway, angle rad; time
float gobo(vec2 p){
  if (uGobK < 0) return 1.;
  float ca = cos(uGob.w), sa = sin(uGob.w);
  vec2 q = mat2(ca, -sa, sa, ca) * p / max(uGob.x, .1);
  float t = uGobT, amt = uGob.y;
  vec2 w = uGob.z * vec2(sin(t * .9 + q.y * .7) + .5 * sin(t * 2.3 + q.x * 1.3), cos(t * .7 + q.x * .6)) * .12;
  if (uGobK == 0){                                         // leaves on branches
    vec2 cc, cid; vec2 lq = q * 1.5 + w * 2.; vec3 v = voro(lq, cc, cid);
    vec2 d = lq - cc; float an = h21(cid) * 6.28; d = mat2(cos(an), sin(an), -sin(an), cos(an)) * d; d.x *= 1.7;
    float leaf = (1. - smoothstep(.4, .46, length(d))) * step(.12, v.z);
    vec2 cc2, cid2; vec2 lq2 = q * 2.6 + 7. + w * 3.; vec3 v2 = voro(lq2, cc2, cid2);
    vec2 d2 = lq2 - cc2; float an2 = h21(cid2) * 6.28; d2 = mat2(cos(an2), sin(an2), -sin(an2), cos(an2)) * d2; d2.x *= 1.7;
    leaf = max(leaf, (1. - smoothstep(.36, .42, length(d2))) * step(.2, v2.z));
    float canopy = smoothstep(.3, .5, fbm(q * .35 + w));
    float br = smoothstep(.955, .985, ridged(q * .22 + w * .5));
    return 1. - amt * clamp(max(leaf * canopy, br), 0., 1.);
  }
  if (uGobK == 1){ vec2 e = .5 - abs(fract(q) - .5); return 1. - amt * (1. - smoothstep(.03, .045, min(e.x, e.y))); }
  if (uGobK == 2){ float f = fract(q.y * 4.); return 1. - amt * (1. - smoothstep(.53, .57, f)); }
  if (uGobK == 3){                                         // lace
    vec2 g = fract(q) - .5; float r = length(g), an = atan(g.y, g.x);
    float ring = 1. - smoothstep(.025, .045, abs(r - (.27 + .07 * cos(an * 6.))));
    float hub = 1. - smoothstep(.06, .08, r);
    vec2 m4 = abs(fract(q * 5.) - .5); float mesh = 1. - smoothstep(.06, .12, min(m4.x, m4.y));
    return 1. - amt * clamp(max(max(ring, hub), mesh * .55), 0., 1.);
  }
  if (uGobK == 4){                                         // water caustics: light gathered into moving lines
    vec2 pp = mod(q * 6.2832, 6.2832) - 250.; vec2 i = pp; float c = 1.;
    for (int n = 0; n < 4; n++){ float tt = t * .5 * (1. - 3.5 / float(n + 1));
      i = pp + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
      c += 1. / length(vec2(pp.x / (sin(i.x + tt) / .005), pp.y / (cos(i.y + tt) / .005))); }
    c /= 4.; c = 1.17 - pow(c, 1.4);
    return mix(1., .35 + clamp(pow(abs(c), 8.), 0., 3.) * 1.6, amt);
  }
  if (uGobK == 5){                                         // bare branches
    float b1 = smoothstep(.94, .98, ridged(q * .3 + w)), b2 = smoothstep(.95, .985, ridged(q * .9 + 3. + w * 2.)) * .8;
    return 1. - amt * clamp(b1 + b2, 0., 1.);
  }
  vec2 dq = vec2(q.x + q.y, q.x - q.y) * 2.12; vec2 f = abs(fract(dq) - .5);   // chain-link
  return 1. - amt * (1. - smoothstep(.04, .09, min(f.x, f.y)));
}
`;

// What the composite, the light-shaft march and the still renderer share: the camera, the words' images, the extra
// layers of words (coverage in r, g, b of uLay; each layer's depth, mode and colour), the pattern plane, the haze.
const COMMON = `
uniform sampler2D uN1, uN2, uMask, uState, uLay, uGobTex, uShTex;
uniform vec2 uRes, uPaneCm; uniform float uTime;
uniform vec2 uO, uAx, uAy; uniform mat2 uToUv;
vec2 paneAt(vec2 uv){ return uO + uAx * uv.x + uAy * uv.y; }
vec2 toUv(vec2 p){ return uToUv * (p - uO); }
uniform vec2 uView; uniform vec3 uSurround;
uniform int uScene; uniform float uDepth; uniform vec4 uP, uQ; uniform vec3 uColA, uColB;
uniform vec4 uLayD; uniform vec4 uLayM[3]; uniform vec3 uLayC[3]; uniform vec3 uLit;   // on, mode, opacity, glow
uniform float uGobD, uLampD;
uniform float uHg, uShDen, uShD, uShTop; uniform int uShOn;
// a layer's coverage c as what it lets through (T) and gives off (E): 0 shadow, 1 lit from the front, 2 glowing, 3 gel
void layerTE(int i, float c, out vec3 T, out vec3 E){
  float a = clamp(c * uLayM[i].z, 0., 1.); int mode = int(uLayM[i].y + .5); vec3 col = uLayC[i];
  T = vec3(1. - a); E = vec3(0);
  if (mode == 0) E = col * a * .03;
  else if (mode == 1) E = col * a * uLit;
  else if (mode == 2) E = col * a * uLayM[i].w;
  else T = mix(vec3(1), pow(max(col, vec3(.001)), vec3(1.5)), a);
}
`;

// Light scattered toward you by the haze at a point x (pane cm, z cm behind the glass): each lamp's light, dimmed
// by distance, shaped by the haze's forward glow (Henyey-Greenstein), and shadowed by whatever stands between that
// point and the lamp (the words, the other layers, the pattern), softened by the lamp's size.
const SHAFT_FN = `
vec3 shaftVis(vec3 x, vec3 Lp, float lampR){
  vec3 T = vec3(1);
  float span = max(Lp.z - x.z, 1e-3);
  if (uDepth > x.z && uDepth < Lp.z){
    vec2 q = mix(x.xy, Lp.xy, (uDepth - x.z) / span); float pen = lampR * (uDepth - x.z) / max(Lp.z - uDepth, 1.);
    vec2 u = toUv(q); if (u == clamp(u, 0., 1.)) T *= textureLod(uN1, u, lodFor(pen * uPxCm)).rgb;
  }
  for (int i = 0; i < 3; i++){
    float d = uLayD[i];
    if (uLayM[i].x < .5 || d <= x.z || d >= Lp.z) continue;
    vec2 q = mix(x.xy, Lp.xy, (d - x.z) / span); float pen = lampR * (d - x.z) / max(Lp.z - d, 1.);
    vec2 u = toUv(q); if (u != clamp(u, 0., 1.)) continue;
    vec3 lt, le; layerTE(i, textureLod(uLay, u, lodFor(pen * uPxCm))[i], lt, le); T *= lt;
  }
  if (uGobK >= 0 && uGobD > x.z && uGobD < Lp.z) T *= gobo(mix(x.xy, Lp.xy, (uGobD - x.z) / span));
  return T;
}
vec3 inscatter(vec3 x, vec3 vdir){
  vec3 s = vec3(0);
  for (int i = 0; i < 4; i++){
    vec4 a = uL[i * 4], b = uL[i * 4 + 1], c = uL[i * 4 + 2];
    if (b.w <= 0. || a.z <= x.z) continue;
    vec3 Lp = a.xyz; vec3 dv = x - Lp;
    float r2 = dot(dv, dv) + b.x * b.x;
    float g = uHg, ct = dot(dv, vdir) / sqrt(max(dot(dv, dv), 1e-4));
    float ph = (1. - g * g) / pow(max(1. + g * g - 2. * g * ct, 1e-4), 1.5) * .0796;
    float pw = b.w * max(b.x * b.y, .25) * 4.;
    s += c.rgb * pw * ph / r2 * shaftVis(x, Lp, b.x);
  }
  return s;
}
`;

// ---- pattern plane: the gobo, drawn on the pane's grid so it can be spread like everything else ----
export const GOBO = HEAD + LIB + LAMPS + GOBO_FN + COMMON + `
out vec4 o;
void main(){ o = vec4(gobo(paneAt(vUv)), 0., 0., 1.); }`;

// ---- light shafts: march each straight-through ray into the box, gathering the haze's glow (a quarter size) ----
export const SHAFT = HEAD + LIB + LAMPS + GOBO_FN + COMMON + SHAFT_FN + `
out vec4 o;
void main(){
  vec2 p = paneAt(vUv);
  vec3 vdir = normalize(vec3(-uView, -1.));
  float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));   // interleaved steps
  vec3 acc = vec3(0), Tv = vec3(1);
  float zPrev = 0.;
  for (int i = 0; i < 40; i++){
    float z = (float(i) + j) / 40. * uShD;
    // the eye's own view passes the words and layers on the way out: haze behind them is seen through them
    if (uDepth > zPrev && uDepth <= z){ vec2 u = toUv(p + uView * uDepth); if (u == clamp(u, 0., 1.)) Tv *= textureLod(uN1, u, 0.).rgb; }
    for (int k = 0; k < 3; k++){
      float d = uLayD[k];
      if (uLayM[k].x < .5 || d <= zPrev || d > z) continue;
      vec2 u = toUv(p + uView * d); if (u != clamp(u, 0., 1.)) continue;
      vec3 lt, le; layerTE(k, textureLod(uLay, u, 0.)[k], lt, le); Tv *= lt;
    }
    zPrev = z;
    acc += Tv * inscatter(vec3(p + uView * z, z), vdir);
  }
  o = vec4(acc * uShD / 40. * uShDen, 1.);
}`;

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
uniform vec2 uRes; uniform float uTime, uSeed;
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

// ---- surface state: condensation (r), water film (g), grease (b), melt (a) ----
export const STATE = HEAD + LIB + `
uniform sampler2D uPrev; uniform vec2 uPaneCm; uniform float uDt, uTime;
uniform float uFogTarget, uRegrow, uEvap, uDry;
uniform vec4 uBrush;          // x y (uv), previous x y
uniform vec4 uBrushP;         // radius cm, strength, tool (1 wipe 2 wet 3 breathe 4 grease 5 clean), down
uniform vec4 uBreath;         // x y (uv), radius cm, amount
uniform vec4 uDrops[48]; uniform int uDropN;
uniform float uReset;
uniform vec4 uTimeC;          // creep cm/s, seconds since the surface was set, warmth, steam
uniform float uSteamSpd;
uniform vec4 uL[16];
out vec4 o;
float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0., 1.); return length(pa - ba * h); }
void main(){
  vec4 s = texture(uPrev, vUv);
  float fog = s.r, wet = s.g, gr = s.b, melt = s.a;
  if (uReset > .5){ fog = uTimeC.x > 0. ? 0. : uFogTarget; wet = 0.; gr = 0.; melt = 0.; }
  vec2 p = vUv * uPaneCm;
  // condensation settles toward the level the air sets, never onto a water film or grease, and evaporates back down
  float target = uFogTarget * (1. - gr * .92) * (1. - wet);
  if (uTimeC.x > 0.){                                      // creeping in from the edges, a front that advances
    float e = min(min(p.x, uPaneCm.x - p.x), min(p.y, uPaneCm.y - p.y));
    float front = uTimeC.y * uTimeC.x;
    target *= 1. - smoothstep(front - 5., front + 5., e + (fbm(p * .07) - .5) * 18.);
  }
  if (uTimeC.w > 0.){                                      // steam rising from below
    vec2 q = p * .03; float t = uTime * uSteamSpd;
    float plume = fbm(vec2(q.x * 1.2, q.y * .7 - t) + vec2(fbm(q * 2. + t * .3) * 1.4, 0.));
    float rise = 1. - .7 * smoothstep(0., uPaneCm.y, p.y);
    target = max(target, smoothstep(.45, .75, plume) * rise * uTimeC.w * (1. - gr * .92));
  }
  float heat = 0.;
  if (uTimeC.z > 0.){                                      // warmth from the lamps: near them fog lifts and frost melts
    vec2 pc = p - uPaneCm * .5;
    for (int i = 0; i < 4; i++){
      vec4 a = uL[i * 4], b = uL[i * 4 + 1];
      if (b.w <= 0.) continue;
      float r = a.z * .8 + b.x + 4.; vec2 d = pc - a.xy;
      heat += clamp(log2(1. + b.w * max(b.x * b.y, 1.)) / 12., 0., 1.5) * exp(-dot(d, d) / (2. * r * r));
    }
    heat *= uTimeC.z;
    target *= 1. - clamp(heat, 0., 1.) * .95;
    melt = min(1., melt + uDt * heat * .12);
  }
  if (uBreath.w > 0.){ float d = length(p - uBreath.xy * uPaneCm) / max(uBreath.z, .1); target = max(target, uBreath.w * (1. - smoothstep(.4, 1., d)) * (1. - gr * .92)); }
  fog += target > fog ? (target - fog) * (1. - exp(-uDt * uRegrow)) : (target - fog) * (1. - exp(-uDt * (uEvap + heat * 1.5)));
  wet = max(0., wet - uDt * uDry * (1. + heat * 2.));
  if (uBrushP.w > .5){
    float d = seg(p, uBrush.xy * uPaneCm, uBrush.zw * uPaneCm) / max(uBrushP.x, .1);
    float b = (1. - smoothstep(.55, 1., d)) * uBrushP.y;
    int tool = int(uBrushP.z + .5);
    if (tool == 1){ fog *= 1. - b; wet = max(wet, b * .55); }
    else if (tool == 2) wet = max(wet, b);
    else if (tool == 3) fog = min(1., fog + b * uDt * 2.5);
    else if (tool == 4) gr = max(gr, b);
    else if (tool == 5){ fog = mix(fog, uFogTarget, b); wet *= 1. - b; gr *= 1. - b; melt *= 1. - b; }
  }
  for (int i = 0; i < 48; i++){
    if (i >= uDropN) break;
    vec4 dr = uDrops[i];
    vec2 q = p - dr.xy * uPaneCm; q.y *= .8;
    float b = 1. - smoothstep(dr.z * .7, dr.z * 1.05, length(q));
    fog *= 1. - b; wet = max(wet, b);
  }
  o = vec4(clamp(fog, 0., 1.), clamp(wet, 0., 1.), clamp(gr, 0., 1.), clamp(melt, 0., 1.));
}`;

// ---- composite: the pane and everything seen through it ----
const SURF = `
// The pane's surface: its material(s), arrangement and every condition on it.
uniform vec4 uPA[4], uPB[4];
uniform int uArr; uniform vec4 uArrP; uniform float uFrameW; uniform vec3 uFrameCol;
uniform vec4 uC0, uC1, uC2, uC3, uC4;
uniform vec4 uDrops[48]; uniform int uDropN;
uniform vec2 uPen;
uniform vec3 uWall; uniform float uWallDist, uWash;
uniform float uHaze; uniform vec3 uHazeCol;
uniform vec3 uFront; uniform vec2 uFrontPos; uniform float uFrontSpread, uFrontGloss;
uniform vec2 uRefl;

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
  } else if (tx == 3 || tx == 15){                        // weave: threads scatter, the gaps between them don't
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
    if (tx == 15){                                         // in a breeze: folds that sway, bunching the cloth
      float f = sin(p.x * .22 + sin(uTime * .6 + p.y * .05) * 2. + uTime * .45);
      s.clar *= .65 + .35 * (.5 + .5 * f); s.tr *= .9 + .1 * f; s.k *= 1.1 - .2 * f;
      s.slope += vec2(cos(p.x * .22 + uTime * .45), 0.) * rf * .03;
    }
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
  } else if (tx == 9){                                     // wired: a square mesh of fine wire set in the glass
    vec2 e = .5 - abs(fract(q) - .5); float ww = .012 + am * .03, aa = 1.2 / max(px, 1.);
    float wire = mix(ww * 4., 1. - smoothstep(ww - aa, ww + aa, min(e.x, e.y)), fine);
    s.tr *= 1. - .93 * wire; s.clar *= 1. - wire; s.white += wire * .05; s.refl += wire * .05;
  } else if (tx == 10){                                    // etched stripes: frosted bands, clear between
    float aa = 1.2 / max(px, 1.), f = fract(q.y);
    float etch = mix(am, 1. - smoothstep(am - aa, am + aa, f), fine);
    s.k *= etch; s.clar = mix(1., s.clar, etch); s.white *= etch; s.tail *= etch;
  } else if (tx == 11){                                    // leaded glass: coloured panes in lead cames
    vec2 cc, cid; vec3 v = voro(q, cc, cid);
    float h = h21(cid + 7.);
    vec3 pal = h < .2 ? vec3(.85, .12, .1) : h < .38 ? vec3(.12, .3, .85) : h < .55 ? vec3(.95, .7, .15) : h < .7 ? vec3(.2, .62, .3) : h < .82 ? vec3(.55, .2, .7) : vec3(.92, .9, .82);
    float lw = .04 + am * .08, lead = 1. - smoothstep(lw, lw + .04 + 1.2 / max(px, 1.), v.y - v.x);
    s.tr *= mix(pal, vec3(.02), lead);
    s.slope += ((h22(cid) - .5) * .5 + (vec2(vnoise(q * 3.), vnoise(q * 3. + 5.)) - .5) * .5) * rf * .12 * (1. - lead);
    s.clar *= 1. - lead; s.white += lead * .03; s.n = normalize(vec3((h22(cid) - .5) * rf * .4, 1.));
  } else if (tx == 12){                                    // crumpled plastic: creased, each facet bending light
    float e = .06; vec2 gr = vec2(ridged(q + vec2(e, 0)) - ridged(q - vec2(e, 0)), ridged(q + vec2(0, e)) - ridged(q - vec2(0, e))) / (2. * e);
    float crease = smoothstep(.78, .95, ridged(q));
    s.slope = rot(ang) * gr * rf * .1; s.n = normalize(vec3(-rot(ang) * gr * rf * .25, 1.));
    s.white += crease * am * .12; s.k *= 1. + crease * am; s.clar *= 1. - crease * am * .6;
  } else if (tx == 13){                                    // bubble wrap: domes of air, each a little lens
    vec2 r = vec2(1., 1.732), hh = r * .5;
    vec2 a = mod(q, r) - hh, b = mod(q - hh, r) - hh; vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    float R = .3 + am * .12, d = length(gv) / R;
    if (d < 1.){
      s.slope += -gv / R * rf * .35; s.n = normalize(vec3(gv / R * 1.4, sqrt(max(1. - d * d, .05))));
      float rim = smoothstep(.75, 1., d); s.white += rim * .08; s.tr *= 1. - rim * .2; s.refl = max(s.refl, .06);
    }
  } else if (tx == 14){                                    // perforated metal: an opaque sheet with round holes
    vec2 g = q; g.x += .5 * mod(floor(g.y), 2.); g = fract(g) - .5;
    float R = .15 + am * .3, aa = 1.2 / max(px, 1.);
    float hole = mix(3.1416 * R * R, 1. - smoothstep(R - aa, R + aa, length(g)), fine);
    s.tr *= hole; s.clar = mix(s.clar, 1., hole); s.k *= hole; s.white += (1. - hole) * .22; s.refl += (1. - hole) * .08;
  } else if (tx == 16){                                    // water running down the glass
    float t = uTime * 1.4;
    vec2 wv = vec2(vnoise(vec2(q.x * 2., q.y * .6 + t)), vnoise(vec2(q.x * 2. + 5., q.y * .6 + t))) - .5;
    float str = sin(q.x * 3. + vnoise(q * .5 + vec2(0, t * .3)) * 4.);
    s.slope += rot(ang) * (wv * rf * .3 + vec2(str * rf * .04, 0.));
    s.n = normalize(vec3(-wv * rf * .8, 1.)); s.white += am * .03 * smoothstep(.3, .5, abs(wv.x));
    s.k *= 1. - am * .8; s.clar = mix(s.clar, 1., am * .7);
  } else if (tx == 17){                                    // seeded glass: small bubbles caught in it
    vec2 cc, cid; vec3 v = voro(q, cc, cid);
    if (v.z < am){
      float r = .08 + .14 * h21(cid + 2.), d = v.x / r;
      if (d < 1.){ vec2 gv = (q - cc) / r; s.slope += -gv * rf * .2; float rim = smoothstep(.6, 1., d); s.white += rim * .12; s.tr *= 1. - rim * .3; s.n = normalize(vec3(gv, 1.)); }
    }
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


void paneSurface(vec2 p, vec2 uv, out Surf M, out float fr, out float glint, out float inside){
  vec2 pin = uPaneCm * .5 - abs(p);
  inside = smoothstep(-aaCm(), aaCm(), min(pin.x, pin.y));
  float w; arrange(p, w, fr);
  Surf A = surf(uPA[0], uPA[1], uPA[2], uPA[3], p);
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
  glint = 0.;
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
    float fz = smoothstep(.58, .8, fern * .55 + reach * uC2.y * .75) * smoothstep(0., .15, uC2.y) * (1. - st.a);   // warm lights melt it (state a)
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

}

// the wall behind, and the lamps' light on it
vec3 wallAt(vec2 pw){
  vec3 wall = uWall * (.75 + .35 * smoothstep(-uPaneCm.y * .6, uPaneCm.y * .6, pw.y));
  if (uWash > 0.){
    for (int i = 0; i < 4; i++){
      vec4 a = uL[i * 4], b = uL[i * 4 + 1], c = uL[i * 4 + 2];
      if (b.w <= 0.) continue;
      float spread = max(uWallDist - a.z, 10.) * .9 + b.x;
      vec2 dq = pw - a.xy;
      wall += uWash * b.w * (b.x * b.y + 4.) / (spread * spread) * .08 * c.rgb * exp(-dot(dq, dq) / (2. * spread * spread));
    }
  }
  return wall;
}

// your side: the front light on the pane, the room reflected in it, steam in the air, the frame, the wall around
vec3 yourSide(vec3 col, Surf M, vec2 p, vec3 behind, float glint, float fr, float inside){
  vec2 fd = p - uFrontPos;
  vec3 fl = uFront * (exp(-dot(fd, fd) / (2. * uFrontSpread * uFrontSpread)) * .85 + .15);
  col += fl * (M.refl * (1. - clamp(M.clar, 0., 1.)) + M.white) + M.white * behind * .18;
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
  if (uC4.z > 0.){                                         // steam drifting up in front of the glass
    vec2 q = p * .03; float t = uTime * uC4.w;
    float plume = fbm(vec2(q.x * 1.2, q.y * .7 - t) + vec2(fbm(q * 2. + t * .3) * 1.4, 0.));
    float rise = 1. - .7 * smoothstep(-uPaneCm.y * .5, uPaneCm.y * .5, p.y);
    col = mix(col, fl * .55 + col * .4 + .015, smoothstep(.5, .8, plume) * rise * uC4.z * .45);
  }
  col = mix(col, uFrameCol * (.05 + fl * .5), fr);
  return mix(uSurround * (.04 + fl * .6), col, inside);
}
`;

export const COMPOSITE = HEAD + LIB + LAMPS + GOBO_FN + COMMON + SHAFT_FN + SURF + `
out vec4 o;
// what lies behind, applied far to near: each thing dims what is behind it and adds its own light
vec3 chain(vec3 c, float dz[6], vec3 T[6], vec3 E[6]){
  bool used[6] = bool[6](false, false, false, false, false, false);
  for (int n = 0; n < 6; n++){
    int b = 0; float bd = -1e9;
    for (int i = 0; i < 6; i++) if (!used[i] && dz[i] > bd){ bd = dz[i]; b = i; }
    used[b] = true; c = c * T[b] + E[b];
  }
  return c;
}
void main(){
  vec2 uv = vUv;
  vec2 p = paneAt(uv);
  Surf M; float fr, glint, inside;
  paneSurface(p, uv, M, fr, glint, inside);

  // ---- how far behind: depth from the words' own record, finest first ----
  float num = 0., den = 0.;
  float lw[4] = float[4](4., 2., 1., .35); float ll[4] = float[4](0., 2., 4., 7.);
  for (int i = 0; i < 4; i++){ float l = min(ll[i], uMaxLod); num += lw[i] * textureLod(uN1, uv, l).a; den += lw[i] * textureLod(uN2, uv, l).a; }
  float Dt = den > .002 ? num / den : uDepth;
  Dt = mix(uDepth, Dt, smoothstep(.002, .05, den));

  float kpx = M.k * uPxCm, k2px = M.k2 * uPxCm;
  float rE = sqrt(pow(kpx * Dt, 2.) + pow(k2px * max(Dt - M.gap, 0.), 2.) + .25);
  float pen = uPen.x > 0. ? uPxCm * uPen.x * Dt / max(uPen.y - Dt, 2.) : 0.;
  float rT = sqrt(rE * rE + pen * pen);
  // scattered light leaves from the surface, so it stays put as the camera moves (and is focused with the
  // glass); light passing straight through comes from behind, shifts with the camera's angle (parallax) and is
  // focused with its own distance
  vec2 nuv = uv + uToUv * (M.slope * Dt);
  vec2 suv = uv + uToUv * ((M.slope + uView) * Dt);
  float clar = clamp(M.clar, 0., 1.);

  vec3 Td = pyr(uN1, nuv, rT).rgb, Ed = pyr(uN2, nuv, rE).rgb;
  if (M.tail > 0.){ Td = mix(Td, pyr(uN1, nuv, rT * M.spread).rgb, M.tail); Ed = mix(Ed, pyr(uN2, nuv, rE * M.spread).rgb, M.tail); }
  vec3 Ts = Td, Es = Ed;
  if (clar > .001){ float rb = sqrt(.25 + pow(defoc(Dt), 2.)); Ts = pyr(uN1, suv, sqrt(rb * rb + pen * pen * .25)).rgb; Es = pyr(uN2, suv, rb).rgb; }

  // ---- what is behind: the lamps, the wall, the halo ----
  vec3 Ld = lamps(p, M.slope, M.k, M.k2, M.gap, .05);
  if (M.tail > 0.) Ld = mix(Ld, lamps(p, M.slope, M.k * M.spread, M.k2 * M.spread, M.gap, .05), M.tail);
  vec3 Ls = clar > .001 ? lamps(p, M.slope + uView, 0., 0., 0., -1.) : Ld;
  vec3 wallD = wallAt(p + M.slope * uWallDist), wallS = wallAt(p + (M.slope + uView) * uWallDist);
  vec3 haloD = vec3(0), haloS = vec3(0);
  if (uScene == 6){                                        // halo: intensity P.x, spread cm P.y, standoff cm P.z
    float dh = uDepth + uP.z;
    vec2 huv = uv + uToUv * (M.slope * dh), huvS = uv + uToUv * ((M.slope + uView) * dh);
    float sp = uP.y * uPxCm;
    float rh = sqrt(sp * sp + pow(kpx * dh, 2.) + pow(k2px * max(dh - M.gap, 0.), 2.));
    haloD = uColB * uP.x * pyr(uMask, huv, rh).r;
    haloS = uColB * uP.x * pyr(uMask, huvS, sqrt(sp * sp + pow(defoc(dh), 2.))).r;
  }

  // ---- the things between, each at its own depth ----
  float dz[6]; vec3 tD[6], eD[6], tS[6], eS[6];
  dz[0] = uLampD; tD[0] = vec3(1); eD[0] = Ld; tS[0] = vec3(1); eS[0] = Ls;
  dz[1] = Dt; tD[1] = Td; eD[1] = Ed; tS[1] = Ts; eS[1] = Es;
  for (int i = 0; i < 3; i++){
    float d = uLayD[i]; dz[2 + i] = d;
    tD[2 + i] = vec3(1); eD[2 + i] = vec3(0); tS[2 + i] = vec3(1); eS[2 + i] = vec3(0);
    if (uLayM[i].x < .5) continue;
    float rD = sqrt(pow(kpx * d, 2.) + pow(k2px * max(d - M.gap, 0.), 2.) + .25);
    layerTE(i, pyr(uLay, uv + uToUv * (M.slope * d), rD)[i], tD[2 + i], eD[2 + i]);
    if (clar > .001) layerTE(i, pyr(uLay, uv + uToUv * ((M.slope + uView) * d), sqrt(.25 + pow(defoc(d), 2.)))[i], tS[2 + i], eS[2 + i]);
  }
  dz[5] = uGobD; tD[5] = vec3(1); eD[5] = vec3(0); tS[5] = vec3(1); eS[5] = vec3(0);
  if (uGobK >= 0){
    float rD = sqrt(pow(kpx * uGobD, 2.) + pow(k2px * max(uGobD - M.gap, 0.), 2.) + .25);
    tD[5] = vec3(pyr(uGobTex, uv + uToUv * (M.slope * uGobD), rD).r);
    if (clar > .001) tS[5] = vec3(pyr(uGobTex, uv + uToUv * ((M.slope + uView) * uGobD), sqrt(.25 + pow(defoc(uGobD), 2.))).r);
  }
  vec3 frontD = chain(wallD + haloD, dz, tD, eD);
  vec3 frontS = clar > .001 ? chain(wallS + haloS, dz, tS, eS) : frontD;

  // ---- the haze: ray-marched shafts, and the veil it lays over distance ----
  if (uShOn == 1){
    float dS = uShD * .5;
    frontD += pyrM(uShTex, uv + uToUv * (M.slope * dS), sqrt(pow(kpx * dS, 2.) + .25) * .25, uShTop).rgb;
    frontS += pyrM(uShTex, uv + uToUv * ((M.slope + uView) * dS), sqrt(.25 + pow(defoc(dS), 2.)) * .25, uShTop).rgb;
  }
  if (uHaze > 0.){
    float hz = 1. - exp(-uHaze * Dt * .02);
    vec3 wide = lamps(p, vec2(0), 1.1, 0., 0., 1.) * uHazeCol;
    vec3 add = uShOn == 1 ? vec3(0) : wide * uHaze * .15;
    frontD = mix(frontD, wide, hz) + add; frontS = mix(frontS, wide, hz) + add;
  }
  vec3 col = mix(frontD, frontS, clar) * M.tr;
  float direct = lum(frontS * clar * M.tr);

  if (uScene == 9){                                        // projected: intensity P.x, focus offset cm P.y
    float r = abs(uP.y) * uPxCm * .12 + .5;
    col += uColA * uP.x * pyr(uMask, uv, r).r * (1. - .95 * clar) * M.tr;
  }
  col = yourSide(col, M, p, Ld + wallD, glint, fr, inside);
  // alpha: the share of this pixel that came straight through, focused at its own distance, not the glass's
  o = vec4(max(col, 0.), clamp(direct / max(lum(col), 1e-4), 0., 1.));
}`;

// ---- the still: one ray per pixel per pass, traced through the pane and into the box, averaged ----
// A ray leaves a point on a lens, crosses the glass and is scattered by its surface (by the material's own spread,
// or straight through, by chance in proportion to how clear it is), then travels back: through the words (a march
// through their depth record), the other layers, the pattern, the lamps, the haze, to the wall.
export const TRACE = HEAD + LIB + LAMPS + GOBO_FN + COMMON + SHAFT_FN + SURF + `
uniform sampler2D uAcc; uniform float uN, uLensA, uTextZ, uThick;
out vec4 o;
uint rs;
uint pcg(uint v){ uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
float rnd(){ rs = pcg(rs); return float(rs) * (1. / 4294967296.); }
vec2 gauss2(){ float u = max(rnd(), 1e-7), v = rnd(); return sqrt(-2. * log(u)) * vec2(cos(6.2832 * v), sin(6.2832 * v)); }
vec2 gp, gs, gs2, ga; float ggap; bool gdirect;
vec2 at(float z){ return gp + gs * z + gs2 * max(z - ggap, 0.) + (gdirect ? ga * z / (uCamD + z) : vec2(0)); }
bool inUv(vec2 u){ return u == clamp(u, 0., 1.); }
// a lamp seen by a scattered ray: rather than hope the ray lands on a small bright lamp (which speckles the picture),
// take the lamp already spread by the surface, as the live view does; the ray still carries the shadows in front of it
vec3 lampSpread(int i, vec2 p, Surf M){
  float dist = uL[i * 4].z;
  float s = sqrt(pow(M.k * dist, 2.) + pow(M.k2 * max(dist - M.gap, 0.), 2.) + .0025);
  vec3 v = lampOne(i, p + M.slope * dist, s);
  if (M.tail > 0.) v = mix(v, lampOne(i, p + M.slope * dist, s * M.spread), M.tail);
  return v;
}
void main(){
  ivec2 fc = ivec2(gl_FragCoord.xy);
  rs = pcg(uint(fc.x) * 1973u + uint(fc.y) * 9277u + uint(uN) * 26699u + 1u);
  rs = pcg(rs + uint(uN));
  vec2 uv = vUv + (vec2(rnd(), rnd()) - .5) / uRes;
  vec2 p0 = paneAt(uv);
  ga = gauss2() * uLensA;
  vec2 p = p0 - ga * uFd / (uCamD + uFd);                  // where this lens ray meets the glass
  Surf M; float fr, glint, inside;
  paneSurface(p, toUv(p), M, fr, glint, inside);
  float clar = clamp(M.clar, 0., 1.);
  gdirect = rnd() < clar; gp = p; ggap = M.gap; gs2 = vec2(0);
  if (gdirect) gs = M.slope + uView;
  else { float tl = rnd() < M.tail ? M.spread : 1.; gs = M.slope + gauss2() * M.k * tl; gs2 = gauss2() * M.k2 * tl; }

  // the fixed planes, nearest first
  float ed[10]; int ek[10]; int ei[10]; int n = 0;
  for (int i = 0; i < 4; i++) if (uL[i * 4 + 1].w > 0.){ ed[n] = uL[i * 4].z; ek[n] = 0; ei[n] = i; n++; }
  for (int i = 0; i < 3; i++) if (uLayM[i].x > .5){ ed[n] = uLayD[i]; ek[n] = 1; ei[n] = i; n++; }
  if (uGobK >= 0){ ed[n] = uGobD; ek[n] = 2; ei[n] = 0; n++; }
  if (uScene == 6){ ed[n] = uDepth + uP.z; ek[n] = 3; ei[n] = 0; n++; }
  bool hazy = uShOn == 1 && uShDen > 0.;
  if (hazy){ ed[n] = rnd() * uWallDist; ek[n] = 4; ei[n] = 0; n++; }
  for (int i = 1; i < 10; i++){ if (i >= n) break; float d = ed[i]; int k = ek[i], x = ei[i]; int j = i - 1;
    while (j >= 0 && ed[j] > d){ ed[j + 1] = ed[j]; ek[j + 1] = ek[j]; ei[j + 1] = ei[j]; j--; } ed[j + 1] = d; ek[j + 1] = k; ei[j + 1] = x; }

  vec3 L = vec3(0), Tp = vec3(1);
  vec3 vdir = normalize(vec3(-uView, -1.));
  bool textDone = false, glowDone = false;
  float zT = uTextZ + uThick + .5, z0 = 0.; int j = 0;
  for (int i = 1; i <= 40; i++){
    float z1 = zT * float(i) / 40.;
    while (j < n && ed[j] <= z1){
      float d = ed[j]; int k = ek[j], x = ei[j];
      if (k == 0) L += Tp * (gdirect ? lampOne(x, at(d), .03) : lampSpread(x, p, M));
      else if (k == 1){ vec2 u = toUv(at(d)); if (inUv(u)){ vec3 T, E; layerTE(x, textureLod(uLay, u, 0.)[x], T, E); L += Tp * E; Tp *= T; } }
      else if (k == 2) Tp *= gobo(at(d));
      else if (k == 3) L += Tp * uColB * uP.x * pyr(uMask, toUv(at(d)), uP.y * uPxCm).r;
      else L += Tp * inscatter(vec3(at(d), d), vdir) * uShDen * uWallDist;
      j++;
    }
    if (!textDone){
      vec2 u = toUv(at(z1));
      if (inUv(u)){
        vec4 n1 = textureLod(uN1, u, 0.), n2 = textureLod(uN2, u, 0.);
        if (n2.a > .02){ float D = n1.a / n2.a; if (D <= z1 && D + uThick >= z0){ L += Tp * n2.rgb; Tp *= n1.rgb; textDone = true; } }
        else if (!glowDone && uDepth > z0 && uDepth <= z1){ L += Tp * n2.rgb; glowDone = true; }   // glow beyond the letters' edges
      }
    }
    z0 = z1;
  }
  while (j < n){
    float d = ed[j]; int k = ek[j], x = ei[j];
    if (k == 0) L += Tp * (gdirect ? lampOne(x, at(d), .03) : lampSpread(x, p, M));
    else if (k == 1){ vec2 u = toUv(at(d)); if (inUv(u)){ vec3 T, E; layerTE(x, textureLod(uLay, u, 0.)[x], T, E); L += Tp * E; Tp *= T; } }
    else if (k == 2) Tp *= gobo(at(d));
    else if (k == 3) L += Tp * uColB * uP.x * pyr(uMask, toUv(at(d)), uP.y * uPxCm).r;
    else L += Tp * inscatter(vec3(at(d), d), vdir) * uShDen * uWallDist;
    j++;
  }
  L += Tp * wallAt(at(uWallDist));
  if (uHaze > 0.){
    float hz = 1. - exp(-uHaze * uDepth * .02);
    vec3 wide = lamps(p, vec2(0), 1.1, 0., 0., 1.) * uHazeCol;
    L = mix(L, wide, hz) + (hazy ? vec3(0) : wide * uHaze * .15);
  }
  vec3 col = L * M.tr;
  if (uScene == 9){ float r = abs(uP.y) * uPxCm * .12 + .5; col += uColA * uP.x * pyr(uMask, toUv(p), r).r * (1. - .95 * clar) * M.tr; }
  col = yourSide(col, M, p, L, glint, fr, inside);
  vec4 prev = texelFetch(uAcc, fc, 0);
  o = mix(prev, vec4(max(col, 0.), 1.), 1. / (uN + 1.));
}`;

// ---- final: the camera ----
export const FINAL = HEAD + LIB + `
uniform sampler2D uC; uniform vec2 uRes; uniform float uTime;
uniform float uExposure, uContrast, uSat, uBloom, uBloomR, uHalation, uVig, uGrain, uGrainSize, uCA, uFocus, uSplit;
uniform vec3 uWB, uShadow, uHigh; uniform int uTone;
uniform mat3 uOrbit; uniform float uF0, uAspect; uniform vec4 uBB; uniform vec3 uBg;
uniform float uPaneBlur; uniform sampler2D uAB; uniform float uSplitX;
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
  else {
    vec4 cs = textureLod(uC, uv, 0.);
    c = uFocus > .01 ? pyr(uC, uv, uFocus).rgb : cs.rgb;
    // the glass and all on it blur when the lens is focused behind it; what came straight through (alpha) was
    // already focused at its own distance
    if (uPaneBlur > .3) c = mix(pyr(uC, uv, sqrt(uPaneBlur * uPaneBlur + uFocus * uFocus)).rgb, c, cs.a);
  }
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
  if (uSplitX > 0.){
    if (vUv.x < uSplitX) s = texture(uAB, vUv).rgb;
    float lw = 1. / uRes.x; s = mix(s, vec3(.92), (1. - smoothstep(lw, lw * 2.5, abs(vUv.x - uSplitX))) * .85);
  }
  o = vec4(s, 1.);
}`;
