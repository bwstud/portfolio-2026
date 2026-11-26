/* The loom: a WebGL2 renderer that turns a photo, its face landmarks and two masks into a wicker portrait.

   Passes, in order:
     tensor   the photo's structure tensor at quarter size, blurred, so straw can follow the way the hair lies
     face     each face mesh, drawn with its canonical UVs, woven in UV space (rings round the eyes and mouth,
              a herringbone down the nose, arcs over the cheeks, a grid on the forehead, a diagonal on the chin,
              and a bound seam wherever two panels meet), lit by the light the photo was taken in
     final    the photo, with bare skin woven in a wider herringbone, hair turned to straw, an optional beard,
              the faces on top, stray straws, then the grade

   Coordinates: image space, y down, 0..1. Offscreen targets store row 0 as the top of the image. */

import { UV, TRIS } from './mesh.js';

/* ---------------- landmark sets (MediaPipe face mesh indices) ---------------- */
const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const EYE_R = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];   // the subject's right: image left
const EYE_L = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
const LIPS_IN = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191];
const LIPS_OUT = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
const BROW_R = [[70, 46], [63, 53], [105, 52], [66, 65], [107, 55]];   // outer to inner, upper and lower edge
const BROW_L = [[300, 276], [293, 283], [334, 282], [296, 295], [336, 285]];
const BROWS = new Set([...BROW_R.flat(), ...BROW_L.flat()]);
const NOT_SKIN = new Set([...EYE_R, ...EYE_L, ...LIPS_IN, ...LIPS_OUT, ...BROWS]);
const N_BASE = 468, N_EXT = OVAL.length, N_V = N_BASE + N_EXT;

/* triangles: the weave, the two eye openings (left as holes that show the real eyes) and the mouth opening */
const eyeSet = new Set([...EYE_R, ...EYE_L]), mouthSet = new Set(LIPS_IN);
const triWeave = [], triEye = [], triMouth = [];
for (let i = 0; i < TRIS.length; i += 3) {
  const t = [TRIS[i], TRIS[i + 1], TRIS[i + 2]];
  if (t.every(v => eyeSet.has(v))) triEye.push(...t);
  else if (t.every(v => mouthSet.has(v))) triMouth.push(...t);
  else triWeave.push(...t);
}
for (let k = 0; k < N_EXT; k++) {          // a ring outside the jaw and hairline, so the weave can reach the hair
  const a = OVAL[k], b = OVAL[(k + 1) % N_EXT], ea = N_BASE + k, eb = N_BASE + (k + 1) % N_EXT;
  triWeave.push(a, b, ea, b, eb, ea);
}
const allTris = [...triWeave, ...triEye, ...triMouth];

/* static per-vertex data: UV (v up in the model; kept as is), and flags: ext (0 on the face, 1 on the outer ring) and rim */
const uvAll = new Float32Array(N_V * 2);
uvAll.set(UV);
const uvc = OVAL.reduce((s, i) => [s[0] + UV[i * 2] / N_EXT, s[1] + UV[i * 2 + 1] / N_EXT], [0, 0]);
const extF = OVAL.map(i => 1.07 + 0.3 * smooth(0.45, 0.85, UV[i * 2 + 1]));   // reach further up over the forehead than down the jaw
OVAL.forEach((i, k) => {
  uvAll[(N_BASE + k) * 2] = uvc[0] + (UV[i * 2] - uvc[0]) * extF[k];
  uvAll[(N_BASE + k) * 2 + 1] = uvc[1] + (UV[i * 2 + 1] - uvc[1]) * extF[k];
});
const rimSet = new Set([...EYE_R, ...EYE_L, ...LIPS_IN]);
function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

/* the features the weave is laid out around, in UV */
const uvOf = i => [UV[i * 2], UV[i * 2 + 1]];
function ellipseOf(ids) {
  const p = ids.map(uvOf), xs = p.map(q => q[0]), ys = p.map(q => q[1]);
  return [xs.reduce((a, b) => a + b) / xs.length, ys.reduce((a, b) => a + b) / ys.length, (Math.max(...xs) - Math.min(...xs)) / 2, (Math.max(...ys) - Math.min(...ys)) / 2];
}
const eyeR = ellipseOf(EYE_R), eyeL = ellipseOf(EYE_L);
const mouthIn = ellipseOf(LIPS_IN), mouthOut = ellipseOf(LIPS_OUT);
const FEAT = {
  eyeR: [eyeR[0], eyeR[1], eyeR[2] * 1.05, Math.max(eyeR[3] * 1.9, eyeR[2] * 0.62)],
  eyeL: [eyeL[0], eyeL[1], eyeL[2] * 1.05, Math.max(eyeL[3] * 1.9, eyeL[2] * 0.62)],
  mouth: [mouthIn[0], mouthIn[1], mouthOut[2] * 1.02, mouthOut[3] * 1.15],
  nose: [...uvOf(9), ...uvOf(4)],
  noseTip: uvOf(1),
  forehead: uvOf(151),
  cheekR: uvOf(50), cheekL: uvOf(280),
  chin: uvOf(199),
  browR: BROW_R.flatMap(([a, b]) => [(UV[a * 2] + UV[b * 2]) / 2, (UV[a * 2 + 1] + UV[b * 2 + 1]) / 2]),
  browL: BROW_L.flatMap(([a, b]) => [(UV[a * 2] + UV[b * 2]) / 2, (UV[a * 2 + 1] + UV[b * 2 + 1]) / 2]),
};

/* ---------------- GLSL ---------------- */
const VS_FULL = `#version 300 es
in vec2 aPos; out vec2 vUv; uniform float uFlip;
void main(){ vUv = aPos * 0.5 + 0.5; if (uFlip > 0.5) vUv.y = 1.0 - vUv.y; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const COMMON = `
precision highp float;
uniform sampler2D tNoise;
float hash1(float n){ return fract(sin(n * 12.9898 + 4.1414) * 43758.5453); }
float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
float dip(float x){ return smoothstep(0.0, 0.24, x) * (1.0 - smoothstep(0.76, 1.0, x)); }
mat2 rows(vec2 ra, vec2 rb){ return mat2(ra.x, rb.x, ra.y, rb.y); }

uniform vec3 uCaneLo, uCaneHi, uGapC;
uniform float uPattern;

/* One woven surface. ab: strand coordinates (one unit per strand); A strands run along a, B strands along b.
   J: d(ab)/d(pixel), for antialiasing and to turn the strand's height into a slope on screen. */
struct Wv { vec3 alb; float ao; vec2 slope; float spec; float gap; vec2 cell; float lod; };
Wv weave(vec2 ab, mat2 J, float seed){
  Wv w;
  float fwA = abs(J[0].x) + abs(J[1].x), fwB = abs(J[0].y) + abs(J[1].y);
  vec2 c = floor(ab), f = fract(ab);
  float k = uPattern < 0.5 ? mod(c.x + c.y, 4.0) : mod(c.x + c.y, 2.0) * 2.0;
  bool aTop = k < 2.0;
  const float HW = 0.44;
  float tA = (f.y - 0.5) / HW, tB = (f.x - 0.5) / HW;
  float covA = 1.0 - smoothstep(1.0 - fwB / HW * 1.4, 1.0, abs(tA));
  float covB = 1.0 - smoothstep(1.0 - fwA / HW * 1.4, 1.0, abs(tB));
  float runA = uPattern < 0.5 ? (k + f.x) * 0.5 : f.x;
  float runB = uPattern < 0.5 ? (k - 2.0 + f.y) * 0.5 : f.y;
  float tT = aTop ? tA : tB, covT = aTop ? covA : covB, run = aTop ? runA : runB;
  float tU = aTop ? tB : tA, covU = (aTop ? covB : covA) * (1.0 - covT);
  float idT = aTop ? c.y * 1.37 + seed * 17.0 : c.x * 2.11 + seed * 31.0 + 100.0;
  float idU = aTop ? c.x * 2.11 + seed * 31.0 + 100.0 : c.y * 1.37 + seed * 17.0;
  float alongT = aTop ? ab.x : ab.y, acrossT = aTop ? f.y : f.x;
  float prof = sqrt(max(1.0 - tT * tT, 0.0));
  float d = dip(run), dd = (dip(run + 0.02) - dip(run - 0.02)) / 0.04 * (uPattern < 0.5 ? 0.5 : 1.0);
  float hT = prof * (0.42 + 0.58 * d);
  float gAcross = -tT / max(prof, 0.25) * (0.42 + 0.58 * d) / HW;
  float gAlong = prof * 0.58 * dd;
  vec2 g = aTop ? vec2(gAlong, gAcross) : vec2(gAcross, gAlong);

  float r1 = hash1(idT), r2 = hash1(idT + 7.31), r3 = hash1(idT + 2.9);
  vec3 tone = mix(uCaneLo, uCaneHi, 0.3 + 0.7 * smoothstep(0.0, 1.0, r1));
  tone *= r3 < 0.12 ? 0.62 : r3 > 0.93 ? 1.12 : 1.0;            /* now and then a darker or paler cane, as in any real basket */
  float grain = texture(tNoise, vec2(alongT * 0.0021 + r2, acrossT * 0.018 + idT * 0.093)).r;
  float blot = texture(tNoise, vec2(alongT * 0.0007 + r1 * 3.0, idT * 0.0131)).g;
  tone *= (0.8 + 0.32 * grain) * (0.88 + 0.24 * blot);
  vec3 toneU = mix(uCaneLo, uCaneHi, 0.25 + 0.6 * hash1(idU)) * 0.8;

  w.alb = tone * covT + toneU * covU + uGapC * (1.0 - covT - covU);
  w.ao = (0.6 + 0.4 * hT) * covT + (0.5 + 0.25 * sqrt(max(1.0 - tU * tU, 0.0))) * covU + 1.0 * (1.0 - covT - covU);
  w.spec = covT * hT * (0.6 + 0.4 * r2);
  w.gap = clamp(1.0 - covT - covU, 0.0, 1.0);
  w.cell = c;
  /* the slope on screen: dh/dpixel = J^T g, scaled by the strand's size on screen so a strand reads as round */
  float px = 1.0 / max(max(fwA, fwB), 1e-4);
  w.slope = (transpose(J) * g) * px * 0.28 * covT;
  /* strands smaller than a few pixels melt into their average */
  float fw = max(fwA, fwB);
  w.lod = smoothstep(0.22, 0.55, fw);
  vec3 avg = mix(uCaneLo, uCaneHi, 0.55) * 0.8;
  w.alb = mix(w.alb, avg, w.lod); w.ao = mix(w.ao, 0.78, w.lod); w.slope *= 1.0 - w.lod; w.spec *= 1.0 - w.lod; w.gap *= 1.0 - w.lod;
  return w;
}

/* a straw fibre texture: white noise smeared along a direction (line integral convolution) */
float fibre(vec2 px, vec2 dir, float scale){
  float s = 0.0;
  for (int i = -9; i <= 9; i++) s += texture(tNoise, (px + dir * float(i) * 1.6 * scale) / (256.0 * scale)).b;
  s /= 19.0;
  return clamp((s - 0.5) * 3.4 + 0.5, 0.0, 1.0);
}
vec3 straw(float t){
  t = clamp(t, 0.0, 1.0);
  vec3 a = vec3(0.13, 0.075, 0.035), b = vec3(0.39, 0.235, 0.105), c = vec3(0.66, 0.45, 0.22), d = vec3(0.89, 0.72, 0.45);
  return t < 0.4 ? mix(a, b, t / 0.4) : t < 0.75 ? mix(b, c, (t - 0.4) / 0.35) : mix(c, d, (t - 0.75) / 0.25);
}
uniform vec2 uSkinMu; uniform mat2 uSkinInv; uniform float uFaceLum;
float skinProb(vec3 c){
  float y = luma(c);
  float rl = y / max(uFaceLum, 0.02);
  vec2 cbcr = vec2(-0.1687 * c.r - 0.3313 * c.g + 0.5 * c.b, 0.5 * c.r - 0.4187 * c.g - 0.0813 * c.b);
  vec2 d = cbcr - uSkinMu;
  float m = dot(d, uSkinInv * d);
  float sat = smoothstep(0.3, 0.6, length(cbcr) / max(length(uSkinMu), 0.01));
  return sat * exp(-m / 7.0) * smoothstep(0.03, 0.1, y) * smoothstep(0.25, 0.45, rl) * (1.0 - smoothstep(2.2, 3.0, rl));
}
`;

const VS_MESH = `#version 300 es
in vec3 aPos; in vec2 aUV; in vec3 aNorm; in vec2 aFlag;
out vec2 vUV; out vec2 vImg; out vec3 vN; out vec2 vFlag;
void main(){
  vUV = aUV; vImg = aPos.xy; vN = aNorm; vFlag = aFlag;
  gl_Position = vec4(aPos.x * 2.0 - 1.0, aPos.y * 2.0 - 1.0, clamp(aPos.z, -0.98, 0.98), 1.0);
}`;

const FS_MESH = `#version 300 es
${COMMON}
in vec2 vUV; in vec2 vImg; in vec3 vN; in vec2 vFlag;
out vec4 frag;
uniform sampler2D tPhoto, tHair, tPerson;
uniform vec2 uRes;
uniform float uPitch, uKind, uReveal, uHollow, uDebug, uSeed, uBlurLod;
uniform vec4 uEyeL, uEyeR, uMouth, uNose;
uniform vec2 uNoseTip, uForehead, uCheekL, uCheekR, uChin;
uniform vec2 uBrowL[5], uBrowR[5];
uniform vec3 uLight; uniform float uAmb;

/* each panel: strand coordinates, their derivative in UV, and how strongly the panel claims this point */
void ring(vec2 uv, vec4 e, float reach, float P, out vec2 ab, out mat2 M, out float m){
  /* rings evenly spaced outward from an ellipse: distance to it is about (r - 1) / |grad r| */
  vec2 q = (uv - e.xy) / e.zw; float r = max(length(q), 1e-4);
  vec2 gr = q / (r * e.zw); float gl = max(length(gr), 1e-4);
  float d = (r - 1.0) / gl;
  float th = atan(q.y, q.x);
  float per = 6.2832 * sqrt(0.5 * (e.z * e.z + e.w * e.w));
  float N = max(10.0, floor(per * 1.05 / P));
  ab = vec2(d / P + 0.5, th / 6.2832 * N);
  vec2 dth = vec2(-q.y, q.x) / (r * r) / e.zw;
  M = rows(gr / gl / P, dth * N / 6.2832);
  m = reach - max(d, 0.0);
}
float segDist(vec2 p, vec2 a, vec2 b, out vec2 t){
  vec2 ba = b - a; float h = clamp(dot(p - a, ba) / dot(ba, ba), 0.0, 1.0); t = normalize(ba);
  return length(p - a - ba * h);
}
float browDist(vec2 uv, vec2 B[5], out vec2 tan, out float along){
  float best = 1e9; tan = vec2(1, 0); along = 0.0;
  for (int i = 0; i < 4; i++){
    vec2 t; float d = segDist(uv, B[i], B[i + 1], t);
    if (d < best){ best = d; tan = t; along = (float(i) + clamp(dot(uv - B[i], B[i + 1] - B[i]) / dot(B[i + 1] - B[i], B[i + 1] - B[i]), 0.0, 1.0)) / 4.0; }
  }
  return best;
}

void main(){
  vec3 photo = texture(tPhoto, vImg).rgb;
  vec2 dUx = dFdx(vUV), dUy = dFdy(vUV);
  mat2 Jpx = mat2(dUx, dUy);                       // d(uv)/d(pixel)

  if (uKind > 1.5) { frag = vec4(photo, 1.0); return; }           // the eyes: left as they are
  float hair = texture(tHair, vImg).r;

  /* reveal: the weave grows out from the tip of the nose, strand by strand */
  float dn = length(vUV - uNoseTip);

  if (uKind > 0.5) {                                                // inside the mouth: carved wooden teeth
    float l = luma(photo), lb = luma(textureLod(tPhoto, vImg, 3.0).rgb);
    float g = texture(tNoise, vec2(vUV.x * 0.9, vUV.y * 14.0)).r;
    vec3 wood = mix(vec3(0.05, 0.028, 0.014), vec3(0.6, 0.43, 0.25), smoothstep(0.12, 0.9, l));
    wood *= 0.86 + 0.28 * g; wood *= clamp(1.0 + (l - lb) * 1.6, 0.6, 1.3);
    float front = uReveal * 0.9 - dn;
    float a = smoothstep(0.0, 0.02, front);
    frag = vec4(wood * a, a); return;
  }

  float P = uPitch;
  /* panels, each a feature with a reach; the strongest claim wins, and a bound seam runs where two are level */
  vec2 ab[7]; mat2 M[7]; float m[7];
  /* base panels first (forehead, cheeks, chin): nearest seed wins */
  { // forehead: a square grid
    ab[4] = vUV / P; M[4] = mat2(1.0 / P); m[4] = -length((vUV - uForehead) * vec2(0.75, 1.0)) + 0.04;
  }
  { // cheeks: arcs swept round the nose, like the fold from nose to mouth
    vec2 rel = vUV - uNoseTip; float r = max(length(rel), 1e-4), th = atan(rel.y, rel.x);
    float R0 = 0.16;
    ab[5] = vec2(r / P, th * R0 / P);
    M[5] = rows(rel / r / P, vec2(-rel.y, rel.x) / (r * r) * R0 / P);
    m[5] = -min(length(vUV - uCheekR), length(vUV - uCheekL));
  }
  { // chin and jaw: a diagonal
    float k = 0.7071 / P;
    ab[6] = vec2(vUV.x + vUV.y, vUV.y - vUV.x) * k; M[6] = rows(vec2(k, k), vec2(-k, k));
    m[6] = -length((vUV - uChin) * vec2(0.7, 1.0)) + 0.01;
  }
  float B = max(m[4], max(m[5], m[6]));
  /* then the features, each claiming a band around itself whatever panel lies under it */
  ring(vUV, uEyeR, 0.07, P, ab[0], M[0], m[0]);
  ring(vUV, uEyeL, 0.07, P, ab[1], M[1], m[1]);
  ring(vUV, uMouth, 0.045, P * 0.9, ab[2], M[2], m[2]);
  { // nose: a herringbone running down the bridge
    vec2 t; float d = segDist(vUV, uNose.xy, uNose.zw, t);
    vec2 n = vec2(-t.y, t.x); vec2 rel = vUV - uNose.xy;
    float y = dot(rel, t), x = dot(rel, n), s = x < 0.0 ? -1.0 : 1.0;
    float L = length(uNose.zw - uNose.xy), w = mix(0.026, 0.05, clamp(y / L, 0.0, 1.0));
    float k = 0.7071 / P;
    ab[3] = vec2(y + abs(x), y - abs(x)) * k;
    M[3] = rows((t + s * n) * k, (t - s * n) * k);
    m[3] = w - d;
  }
  m[0] += B; m[1] += B; m[2] += B; m[3] += B;
  int best = 0; float m1 = -1e9, m2 = -1e9;
  for (int i = 0; i < 7; i++){ if (m[i] > m1){ m2 = m1; m1 = m[i]; best = i; } else if (m[i] > m2) m2 = m[i]; }

  Wv w = weave(ab[best], M[best] * Jpx, float(best) + uSeed);

  /* the seam between panels: a wrapped binding cane */
  float seamW = P * 0.36;
  float st = (m1 - m2) / seamW;
  float uvpx = length(dUx) + length(dUy);
  float seam = 1.0 - smoothstep(1.0 - uvpx / seamW, 1.0, st);
  if (seam > 0.0 && best != 2) {
    float prof = sqrt(max(1.0 - st * st, 0.0));
    float wrap = fract((vUV.x * 0.8 + vUV.y) / (P * 0.55));
    float wp = smoothstep(0.0, 0.12, wrap) * (1.0 - smoothstep(0.78, 1.0, wrap));
    vec3 cane = mix(uCaneLo, uCaneHi, 0.45) * (0.75 + 0.3 * wp);
    w.alb = mix(w.alb, cane, seam); w.ao = mix(w.ao, 0.45 + 0.55 * prof * (0.5 + 0.5 * wp), seam);
    w.spec = mix(w.spec, prof * 0.7, seam); w.gap *= 1.0 - seam;
    w.slope = mix(w.slope, vec2(0.0), seam);
  }

  /* light: the face's own shape, lit the way the photo was, and the photo's broad shading over it */
  vec3 N = normalize(vN);
  vec3 Nb = normalize(N - vec3(w.slope, 0.0));
  float diff = max(dot(Nb, uLight), 0.0);
  float shadeP = clamp(luma(textureLod(tPhoto, vImg, uBlurLod).rgb) / uFaceLum, 0.25, 1.8);
  float lit = mix(uAmb + (1.0 - uAmb) * diff * 1.2, shadeP, 0.7);
  vec3 H = normalize(uLight + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(Nb, H), 0.0), 42.0) * 0.5 * w.spec * shadeP;
  float rim = smoothstep(0.35, 1.0, vFlag.y);                     // shadow where the weave folds into an eye or the mouth
  vec3 col = w.alb * w.ao * lit * (1.0 - 0.5 * rim) + spec * vec3(1.0, 0.93, 0.8);
  /* light shining through the weave: he's hollow */
  float inside = smoothstep(0.42, 0.78, texture(tNoise, vUV * 0.22 + uSeed * 0.13).a);
  float glow = uHollow * w.gap * (0.06 + inside * (0.7 + 1.8 * step(0.8, hash2(w.cell + float(best) * 13.0))));
  col += glow * vec3(1.0, 0.7, 0.34) + uHollow * inside * 0.1 * vec3(1.0, 0.6, 0.25);   /* and a soft warmth around them, as if lit from inside */

  /* brows: tufts of flax, combed outward */
  vec2 tanR, tanL; float alR, alL;
  float bR = browDist(vUV, uBrowR, tanR, alR), bL = browDist(vUV, uBrowL, tanL, alL);
  float bd = min(bR, bL); vec2 btan = bR < bL ? tanR : tanL; float bal = bR < bL ? alR : alL;
  float bw = mix(0.011, 0.02, smoothstep(0.0, 0.8, bal));        // thin at the tail, full at the head
  if (bd < bw * 1.6) {
    vec2 dirUV = normalize(btan * (bR < bL ? -1.0 : 1.0) + vec2(0.0, 0.45));
    vec2 dpx = inverse(Jpx) * dirUV; dpx = normalize(dpx);
    float fb = fibre(vImg * uRes, dpx, 1.0);
    float a = (1.0 - smoothstep(bw * 0.55, bw * 1.5, bd + (fb - 0.5) * bw * 0.6));
    vec3 bc = straw(0.22 + fb * 0.45) * lit;
    col = mix(col, bc, a * 0.92);
  }

  if (uDebug > 0.5) col = mix(col, vec3(hash1(float(best) + 1.0), hash1(float(best) + 2.0), hash1(float(best) + 3.0)), 0.55);

  /* where the face ends: feather the outer ring onto bare skin only, and let hair fall over it */
  float a = 1.0;
  float ext = vFlag.x;
  /* the outer ring reaches into the hairline and round the jaw: keep it on the person and off the background */
  float person = texture(tPerson, vImg).r;
  float skinish = mix(1.0, smoothstep(0.05, 0.35, skinProb(textureLod(tPhoto, vImg, 2.5).rgb)), smoothstep(0.55, 1.0, ext));
  a *= mix(1.0, smoothstep(0.35, 0.7, person) * skinish, smoothstep(0.02, 0.3, ext)) * (1.0 - smoothstep(0.8, 1.0, ext));
  a *= 1.0 - smoothstep(0.35, 0.75, hair);
  float jit = hash1(floor(ab[best].x) * 3.1 + floor(ab[best].y) * 7.7 + float(best));
  float front = uReveal * 0.9 - dn - jit * 0.045;
  a *= smoothstep(0.0, 0.012, front);
  col *= 1.0 + 0.7 * (1.0 - smoothstep(0.0, 0.05, front)) * step(0.0, front);
  frag = vec4(col * a, a);
}`;

const FS_TENSOR = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag; uniform sampler2D tPhoto; uniform vec2 uTexel;
float L(vec2 o){ return dot(textureLod(tPhoto, vUv + o * uTexel, 1.5).rgb, vec3(0.299, 0.587, 0.114)); }
void main(){
  float gx = (L(vec2(1,-1)) + 2.0*L(vec2(1,0)) + L(vec2(1,1))) - (L(vec2(-1,-1)) + 2.0*L(vec2(-1,0)) + L(vec2(-1,1)));
  float gy = (L(vec2(-1,1)) + 2.0*L(vec2(0,1)) + L(vec2(1,1))) - (L(vec2(-1,-1)) + 2.0*L(vec2(0,-1)) + L(vec2(1,-1)));
  frag = vec4(gx * gx, gy * gy, gx * gy, 1.0);
}`;
const FS_BLUR = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag; uniform sampler2D tSrc; uniform vec2 uDir;
void main(){
  vec4 s = vec4(0.0); float wsum = 0.0;
  for (int i = -6; i <= 6; i++){ float w = exp(-float(i * i) / 18.0); s += texture(tSrc, vUv + uDir * float(i)) * w; wsum += w; }
  frag = s / wsum;
}`;

const FS_FINAL = `#version 300 es
${COMMON}
in vec2 vUv; out vec4 frag;
uniform sampler2D tPhoto, tFace, tHair, tPerson, tTensor, tFly;
uniform vec2 uRes;
uniform float uHasFace, uHasTensor, uFly, uReveal, uHollow, uGradeMix, uSeed, uOriginal, uBlurLod;
uniform vec2 uFC, uFX; uniform float uFD, uBodyP;
uniform vec4 uBeardA, uBeardB; uniform float uBeard;
uniform int uGrade;
uniform vec3 uLight;

vec3 grade(vec3 c, vec2 uv){
  vec3 o = c;
  float aspect = uRes.x / uRes.y;
  float vig = 0.0;
  if (uGrade == 0) {            // golden hour: warm highs, green-teal shadows, a soft roll-off
    c = pow(max(c, 0.0), vec3(0.97, 1.0, 1.06));
    c *= vec3(1.06, 1.0, 0.88);
    c = mix(vec3(0.035, 0.05, 0.045), vec3(1.0), c);
    float l = luma(c); c = mix(vec3(l), c, 1.06);
    c = c * c * (3.0 - 2.0 * c) * 0.35 + c * 0.65;
    vig = 0.38;
  } else if (uGrade == 1) {     // riverbank: low and green, the light falling only on him
    c *= 0.86; c *= vec3(1.0, 1.03, 0.9);
    c = mix(vec3(0.01, 0.025, 0.018), vec3(1.0), c);
    float l = luma(c); c = mix(vec3(l), c, 0.92);
    c = c * c * (3.0 - 2.0 * c) * 0.5 + c * 0.5;
    vig = 0.62;
  } else if (uGrade == 2) {     // village: overcast, quiet, a little cold in the shadows
    float l = luma(c); c = mix(vec3(l), c, 0.78);
    c *= vec3(1.02, 1.0, 0.97);
    c = mix(vec3(0.04, 0.045, 0.05), vec3(0.97, 0.96, 0.93), c);
    vig = 0.28;
  }
  vec2 q = (uv - 0.5) * vec2(aspect, 1.0) / max(aspect, 1.0);
  c *= mix(1.0, smoothstep(0.95, 0.25, length(q) * 1.15), vig);
  return mix(o, c, uGradeMix);
}

void main(){
  vec2 px = vUv * uRes;
  vec3 photo = texture(tPhoto, vUv).rgb;
  if (uOriginal > 0.5) { frag = vec4(photo, 1.0); return; }
  vec3 col = photo;
  float person = texture(tPerson, vUv).r;
  float hair = texture(tHair, vUv).r;
  vec4 face = texture(tFace, vUv);
  float lb = luma(textureLod(tPhoto, vUv, uBlurLod).rgb);

  if (uHasFace > 0.5) {
    vec2 rel = px - uFC; vec2 FY = vec2(-uFX.y, uFX.x);
    float dist = length(rel) / uFD;

    /* bare skin beyond the face: a wider herringbone, chevrons down the neck and arms */
    float bright = smoothstep(1.15, 1.6, luma(photo) / uFaceLum);       // a highlight on skin: judge it by the skin around it
    float skin = max(skinProb(textureLod(tPhoto, vUv, 2.5).rgb), skinProb(textureLod(tPhoto, vUv, 4.5).rgb) * bright) * smoothstep(0.3, 0.7, person) * (1.0 - smoothstep(0.2, 0.6, hair));
    if (skin > 0.01) {
      float qx = dot(rel, uFX) / uBodyP, qy = dot(rel, FY) / uBodyP, s = qx < 0.0 ? -1.0 : 1.0;
      float k = 0.7071;
      vec2 ab = vec2(qy + abs(qx), qy - abs(qx)) * k;
      mat2 J = rows((FY + s * uFX) * k / uBodyP, (FY - s * uFX) * k / uBodyP);
      Wv w = weave(ab, J, 40.0 + uSeed);
      vec3 Nb = normalize(vec3(-w.slope, 1.0));
      float lit = clamp(lb / uFaceLum, 0.25, 1.8) * (0.8 + 0.3 * max(dot(Nb, uLight), 0.0));
      vec3 H = normalize(uLight + vec3(0.0, 0.0, 1.0));
      vec3 wc = w.alb * w.ao * lit + pow(max(dot(Nb, H), 0.0), 30.0) * 0.3 * w.spec * lit;
      float inside = smoothstep(0.42, 0.78, texture(tNoise, px / uFD * 0.045 + uSeed * 0.13).a);
      wc += uHollow * w.gap * (0.06 + inside * (0.7 + 1.8 * step(0.8, hash2(w.cell + 9.0)))) * vec3(1.0, 0.7, 0.34);
      float front = uReveal - 0.3 - dist * 0.14 - hash1(floor(ab.x) * 1.7 + floor(ab.y) * 5.3) * 0.04;
      float a = skin * smoothstep(0.0, 0.02, front);
      col = mix(col, wc, a);
    }
  }

  /* hair: straw, combed the way the hair lies */
  if (hair > 0.02) {
    vec2 dir = vec2(0.0, 1.0);
    if (uHasTensor > 0.5) {
      vec3 T = texture(tTensor, vUv).xyz;
      float th = 0.5 * atan(2.0 * T.z, T.x - T.y) + 1.5708;
      dir = vec2(cos(th), sin(th));
    }
    float scale = max(1.0, uRes.y / 1400.0);
    float f1 = fibre(px, dir, scale), f2 = fibre(px * 0.5 + 91.0, dir, scale * 1.8);
    float clump = texture(tNoise, px / (uRes.y * 0.6)).a;
    float t = clamp(0.3 + (lb / uFaceLum - 0.6) * 0.32 + (f1 - 0.5) * 0.75 + (f2 - 0.5) * 0.45 + (clump - 0.5) * 0.4, 0.0, 1.0);
    vec3 sc = straw(t) * clamp(0.65 + lb * 0.9, 0.5, 1.4);
    float hd = uHasFace > 0.5 ? length(px - uFC) / uFD : 0.0;
    float front = uReveal - 0.55 - hd * 0.1;
    float a = smoothstep(0.02, 0.5, hair + (f1 - 0.5) * 0.25) * smoothstep(0.0, 0.08, front);
    col = mix(col, sc, a);
  }

  /* the faces */
  col = face.rgb + col * (1.0 - face.a);

  /* a beard of flax, if asked for */
  if (uBeard > 0.5 && uHasFace > 0.5) {
    vec2 rel = px - uFC; vec2 FY = vec2(-uFX.y, uFX.x);
    vec2 q = vec2(dot(rel, uFX), dot(rel, FY)) / uFD;
    float jawW = uBeardA.x, chinY = uBeardA.y, noseY = uBeardA.z, mouthY = uBeardA.w, mouthW = uBeardB.x, ext = uBeardB.y;
    vec2 c = vec2(0.0, (noseY + chinY + ext) * 0.5); vec2 r = vec2(jawW, (chinY + ext - noseY) * 0.5);
    float taper = 1.0 - 0.5 * smoothstep(chinY - 0.25, chinY + ext, q.y);             // full at the jaw, narrowing to a point below the chin
    vec2 qq = vec2(q.x / taper, q.y);
    float sdf = (length((qq - c) / r) - 1.0) * min(r.x, r.y);
    float clumps = texture(tNoise, vec2(q.x * 0.3, q.y * 0.05) + 0.37).a - 0.5;      // locks of uneven length
    sdf += clumps * 0.16 * smoothstep(chinY - 0.2, chinY + ext, q.y);
    if (q.y < mouthY - 0.02) sdf = max(sdf, abs(q.x) - mouthW * 1.35 - (q.y - noseY) * 0.4);    // above the mouth, only a moustache
    float mouth = (length((q - vec2(0.0, mouthY + 0.01)) / vec2(mouthW * 0.82, 0.055)) - 1.0) * 0.055;
    sdf = max(sdf, -mouth);
    if (sdf < 0.15) {
      vec2 dq = q.y < mouthY ? normalize(vec2(sign(q.x) * 1.0, 0.75)) : normalize(vec2(q.x * 0.7, 1.0));
      /* locks: the combing direction wanders a little from clump to clump, so it reads as flax, not a broom */
      float lock = texture(tNoise, q * vec2(0.24, 0.07) + 0.71).a - 0.5;
      float ang = lock * 0.8;
      dq = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * dq;
      vec2 dir = normalize(dq.x * uFX + dq.y * FY);
      float scale = max(1.0, uRes.y / 1400.0);
      float f1 = fibre(px, dir, scale), f2 = fibre(px * 0.5 + 37.0, dir, scale * 2.2);
      float a = smoothstep(0.0, 0.07, -sdf + (f1 - 0.5) * 0.14 + (f2 - 0.5) * 0.08 + lock * 0.06) * uBeardB.z;
      float depth = smoothstep(0.0, 0.5, -sdf);                                     // denser and darker inside, wispy and lit at the edge
      float shade = 0.62 + 0.32 * clamp(dot(normalize(uLight.xy + 1e-4), normalize(-q + 1e-4)), -1.0, 1.0) * 0.5 + 0.22 * (lock + 0.5) - 0.16 * depth;
      vec3 bc = straw(0.12 + f1 * 0.48 + f2 * 0.24 + lock * 0.25) * shade * 1.08;
      float front = uReveal - 0.8;
      col = mix(col, bc, a * smoothstep(0.0, 0.15, front));
    }
  }

  /* stray straws standing out of the hair */
  vec4 fly = texture(tFly, vUv);
  col = mix(col, fly.rgb / max(fly.a, 1e-3) * clamp(0.7 + lb, 0.6, 1.3), fly.a * uFly * smoothstep(0.7, 1.1, uReveal));

  col = grade(col, vUv);
  float g = hash2(px + uSeed * 31.7) - 0.5;
  col += g * 0.028 * uGradeMix;
  frag = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

/* ---------------- GL plumbing ---------------- */
function compile(gl, type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n'));
  return s;
}
function program(gl, vs, fs, attribs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  attribs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); const name = info.name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}

export class Loom {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true, alpha: false });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl; this.canvas = canvas;
    this.halfFloat = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
    this.pFinal = program(gl, VS_FULL, FS_FINAL, ['aPos']);
    this.pMesh = program(gl, VS_MESH, FS_MESH, ['aPos', 'aUV', 'aNorm', 'aFlag']);
    this.pTensor = program(gl, VS_FULL, FS_TENSOR, ['aPos']);
    this.pBlur = program(gl, VS_FULL, FS_BLUR, ['aPos']);

    this.quad = gl.createVertexArray(); gl.bindVertexArray(this.quad);
    const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.meshVao = gl.createVertexArray(); gl.bindVertexArray(this.meshVao);
    this.vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    const S = 10 * 4;
    [[0, 3, 0], [1, 2, 12], [2, 3, 20], [3, 2, 32]].forEach(([loc, n, off]) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, S, off); });
    this.ibo = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bindVertexArray(null);

    this.tex = {};
    this.tex.noise = this.makeNoise();
    this.tex.photo = this.newTex(gl.LINEAR_MIPMAP_LINEAR);
    this.tex.hair = this.newTex(gl.LINEAR); this.tex.person = this.newTex(gl.LINEAR); this.tex.fly = this.newTex(gl.LINEAR);
    this.blank(this.tex.hair, 0); this.blank(this.tex.person, 255); this.blank(this.tex.fly, 0, true);
    this.faces = [];
    this.w = 0; this.h = 0;
  }
  newTex(minF) {
    const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minF); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  blank(t, v, rgba) {
    const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, t);
    if (rgba) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([v]));
  }
  makeNoise() {
    const gl = this.gl, n = 256, d = new Uint8Array(n * n * 4);
    let s = 1234567;
    const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) >>> 8) / 16777216;
    for (let i = 0; i < d.length; i++) d[i] = rnd() * 256;
    // alpha: smooth clumps (a few octaves of blurred noise)
    const a = new Float32Array(n * n); for (let i = 0; i < a.length; i++) a[i] = rnd();
    for (let pass = 0; pass < 6; pass++) {
      const b = new Float32Array(n * n);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        let sum = 0; for (let k = -2; k <= 2; k++) sum += a[y * n + ((x + k + n) % n)] + a[((y + k + n) % n) * n + x];
        b[y * n + x] = sum / 10;
      }
      a.set(b);
    }
    let lo = 1, hi = 0; for (const v of a) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    for (let i = 0; i < n * n; i++) d[i * 4 + 3] = ((a[i] - lo) / (hi - lo)) * 255;
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, d);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return t;
  }
  target(w, h, fmt) {
    const gl = this.gl, t = this.newTex(gl.LINEAR);
    const half = fmt === 'half';
    gl.texImage2D(gl.TEXTURE_2D, 0, half ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, half ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    let depth = null;
    if (fmt === 'depth') {
      depth = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    }
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { t, fb, depth, w, h, ok };
  }
  free(tg) { if (!tg) return; const gl = this.gl; gl.deleteTexture(tg.t); gl.deleteFramebuffer(tg.fb); if (tg.depth) gl.deleteRenderbuffer(tg.depth); }

  /* the photo (a canvas or video frame already at output size) */
  setPhoto(src) {
    const gl = this.gl, w = src.width, h = src.height;
    gl.bindTexture(gl.TEXTURE_2D, this.tex.photo);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.generateMipmap(gl.TEXTURE_2D);
    if (w !== this.w || h !== this.h) {
      this.w = w; this.h = h; this.canvas.width = w; this.canvas.height = h;
      this.free(this.faceT); this.free(this.tA); this.free(this.tB);
      this.faceT = this.target(w, h, 'depth');
      const tw = Math.max(1, w >> 2), th = Math.max(1, h >> 2);
      if (this.halfFloat) { this.tA = this.target(tw, th, 'half'); this.tB = this.target(tw, th, 'half'); this.hasTensor = this.tA.ok && this.tB.ok; }
      else this.hasTensor = false;
    }
    this.tensorDirty = true;
  }
  /* masks: Uint8 arrays, one byte per pixel */
  setMask(name, data, w, h) {
    const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, this.tex[name]);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, data);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  }
  clearMask(name) { this.blank(this.tex[name], name === 'person' ? 255 : 0); }
  setFly(canvas) {
    const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, this.tex.fly);
    if (!canvas) { this.blank(this.tex.fly, 0, true); return; }
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  /* faces: arrays of 478 landmarks {x,y,z} (normalized). pixels: ImageData of a small copy of the photo, for light and skin */
  setFaces(list, small) {
    const W = this.w, H = this.h;
    this.faces = list.map(lm => this.buildFace(lm, W, H, small)).sort((a, b) => b.size - a.size);
    const verts = new Float32Array(this.faces.length * N_V * 10);
    const idx = [];
    this.faces.forEach((f, n) => {
      verts.set(f.verts, n * N_V * 10);
      const o = n * N_V;
      f.ranges = {};
      for (const [k, list] of [['weave', triWeave], ['eye', triEye], ['mouth', triMouth]]) { f.ranges[k] = [idx.length, list.length]; for (const v of list) idx.push(v + o); }
    });
    const gl = this.gl;
    gl.bindVertexArray(this.meshVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);
    return this.faces.length;
  }
  buildFace(lm, W, H, small) {
    const P = new Float32Array(N_V * 3);
    for (let i = 0; i < N_BASE; i++) { P[i * 3] = lm[i].x * W; P[i * 3 + 1] = lm[i].y * H; P[i * 3 + 2] = lm[i].z * W; }
    let cx = 0, cy = 0, cz = 0;
    for (const i of OVAL) { cx += P[i * 3] / N_EXT; cy += P[i * 3 + 1] / N_EXT; cz += P[i * 3 + 2] / N_EXT; }
    OVAL.forEach((i, k) => {
      const dx = P[i * 3] - cx, dy = P[i * 3 + 1] - cy, f = extF[k];
      const e = (N_BASE + k) * 3;
      P[e] = cx + dx * f; P[e + 1] = cy + dy * f; P[e + 2] = P[i * 3 + 2] + Math.hypot(dx, dy) * (f - 1) * 1.6;
    });
    /* vertex normals from the triangles, turned to face the camera */
    const Nn = new Float32Array(N_V * 3);
    for (let t = 0; t < allTris.length; t += 3) {
      const a = allTris[t] * 3, b = allTris[t + 1] * 3, c = allTris[t + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const v of [a, b, c]) { Nn[v] += nx; Nn[v + 1] += ny; Nn[v + 2] += nz; }
    }
    // in image space z grows away from the camera, so a camera-facing normal has negative z; flip to +z toward the viewer
    let sz = 0; for (let i = 0; i < N_BASE; i++) sz += Nn[i * 3 + 2];
    const flip = sz > 0 ? -1 : 1;
    for (let i = 0; i < N_V; i++) {
      const x = Nn[i * 3] * flip, y = Nn[i * 3 + 1] * flip, z = -Nn[i * 3 + 2] * flip, l = Math.hypot(x, y, z) || 1;
      Nn[i * 3] = x / l; Nn[i * 3 + 1] = y / l; Nn[i * 3 + 2] = z / l;
    }
    const verts = new Float32Array(N_V * 10);
    for (let i = 0; i < N_V; i++) {
      const o = i * 10;
      verts[o] = P[i * 3] / W; verts[o + 1] = P[i * 3 + 1] / H; verts[o + 2] = P[i * 3 + 2] / W * 2;
      verts[o + 3] = uvAll[i * 2]; verts[o + 4] = uvAll[i * 2 + 1];
      verts[o + 5] = Nn[i * 3]; verts[o + 6] = Nn[i * 3 + 1]; verts[o + 7] = Nn[i * 3 + 2];
      verts[o + 8] = i >= N_BASE ? 1 : 0; verts[o + 9] = rimSet.has(i) ? 1 : 0;
    }
    /* face frame: centred between the eyes, x along the eye line, D the outer eye-corner distance */
    const px = i => [P[i * 3], P[i * 3 + 1]];
    const [ax, ay] = px(33), [bx, by] = px(263);
    const D = Math.hypot(bx - ax, by - ay) || 1;
    const fx = [(bx - ax) / D, (by - ay) / D];
    const c = px(168);
    const toF = i => { const [x, y] = px(i); const rx = x - c[0], ry = y - c[1]; return [(rx * fx[0] + ry * fx[1]) / D, (-rx * fx[1] + ry * fx[0]) / D]; };
    const jaw = (Math.abs(toF(172)[0]) + Math.abs(toF(397)[0])) / 2;
    const beard = [jaw * 1.04, toF(152)[1], toF(2)[1], (toF(13)[1] + toF(14)[1]) / 2, (Math.abs(toF(61)[0]) + Math.abs(toF(291)[0])) / 2];
    /* the light the photo was taken in: luminance at each landmark ~ a + b·normal, least squares */
    let faceLum = 0.5, light = [0.35, -0.45, 0.82], amb = 0.45, skinMu = [-0.06, 0.08], skinInv = [400, 0, 0, 400];
    if (small) {
      const sw = small.width, sh = small.height, d = small.data;
      const at = i => {
        const x = Math.min(sw - 2, Math.max(1, Math.round(lm[i].x * sw))), y = Math.min(sh - 2, Math.max(1, Math.round(lm[i].y * sh)));
        let r = 0, g = 0, b = 0;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const o = ((y + oy) * sw + x + ox) * 4; r += d[o]; g += d[o + 1]; b += d[o + 2]; }
        return [r / 2295, g / 2295, b / 2295];
      };
      const A = Array.from({ length: 4 }, () => [0, 0, 0, 0, 0]);
      let n = 0, lsum = 0; const cb = [], cr = [];
      for (let i = 0; i < N_BASE; i++) {
        if (NOT_SKIN.has(i)) continue;
        const [r, g, b] = at(i), L = 0.299 * r + 0.587 * g + 0.114 * b;
        const row = [1, Nn[i * 3], Nn[i * 3 + 1], Nn[i * 3 + 2]];
        for (let p = 0; p < 4; p++) { for (let q = 0; q < 4; q++) A[p][q] += row[p] * row[q]; A[p][4] += row[p] * L; }
        lsum += L; n++;
        cb.push(-0.1687 * r - 0.3313 * g + 0.5 * b); cr.push(0.5 * r - 0.4187 * g - 0.0813 * b);
      }
      faceLum = Math.max(0.05, lsum / n);
      for (let p = 0; p < 4; p++) A[p][p] += 1e-3 * n;
      const sol = solve4(A);
      if (sol) {
        let [a, bx2, by2, bz] = sol; const bl = Math.hypot(bx2, by2, bz);
        if (bl > 1e-4) {
          light = [bx2 / bl, by2 / bl, Math.max(0.25, bz / bl)]; const ll = Math.hypot(...light); light = light.map(v => v / ll);
          amb = Math.min(0.8, Math.max(0.2, a / (a + bl)));
        }
      }
      const mean = v => v.reduce((s, x) => s + x, 0) / v.length;
      const mb = mean(cb), mr = mean(cr);
      let sbb = 0, srr = 0, sbr = 0;
      for (let k = 0; k < cb.length; k++) { const x = cb[k] - mb, y = cr[k] - mr; sbb += x * x; srr += y * y; sbr += x * y; }
      sbb = sbb / cb.length + 0.0006; srr = srr / cb.length + 0.0006; sbr /= cb.length;
      const det = sbb * srr - sbr * sbr;
      skinMu = [mb, mr]; skinInv = [srr / det, -sbr / det, -sbr / det, sbb / det];
    }
    return { verts, size: D, c, fx, D, beard, faceLum, light, amb, skinMu, skinInv };
  }

  /* the face is about 2.1 eye-widths across; keep each strand at least 4.5 pixels wide */
  static strandsFor(n, f) { return Math.max(12, Math.min(n, (2.1 * f.D) / 4.5)); }
  render(o) {
    const gl = this.gl, W = this.w, H = this.h;
    if (!W) return;
    const f0 = this.faces[0];
    const bindTex = (prog, name, t, unit) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); if (prog.u[name]) gl.uniform1i(prog.u[name], unit); };
    const caneU = (prog) => {
      gl.uniform3fv(prog.u.uCaneLo, o.cane.lo); gl.uniform3fv(prog.u.uCaneHi, o.cane.hi); gl.uniform3fv(prog.u.uGapC, o.cane.gap);
      gl.uniform1f(prog.u.uPattern, o.pattern === 'plain' ? 1 : 0);
    };
    const blurLod = Math.max(1, Math.log2(Math.max(W, H) / 220));

    /* tensor */
    if (this.hasTensor && this.tensorDirty) {
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      gl.bindVertexArray(this.quad);
      gl.useProgram(this.pTensor.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.tA.fb); gl.viewport(0, 0, this.tA.w, this.tA.h);
      gl.uniform1f(this.pTensor.u.uFlip, 0); gl.uniform2f(this.pTensor.u.uTexel, 1 / this.tA.w, 1 / this.tA.h);
      bindTex(this.pTensor, 'tPhoto', this.tex.photo, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.useProgram(this.pBlur.p); gl.uniform1f(this.pBlur.u.uFlip, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.tB.fb); bindTex(this.pBlur, 'tSrc', this.tA.t, 0);
      gl.uniform2f(this.pBlur.u.uDir, 1.5 / this.tA.w, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.tA.fb); bindTex(this.pBlur, 'tSrc', this.tB.t, 0);
      gl.uniform2f(this.pBlur.u.uDir, 0, 1.5 / this.tA.h); gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.tensorDirty = false;
    }

    /* faces */
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.faceT.fb); gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (this.faces.length && o.reveal > 0) {
      const pm = this.pMesh, u = pm.u;
      gl.useProgram(pm.p); gl.bindVertexArray(this.meshVao);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      bindTex(pm, 'tPhoto', this.tex.photo, 0); bindTex(pm, 'tHair', this.tex.hair, 1); bindTex(pm, 'tPerson', this.tex.person, 2); bindTex(pm, 'tNoise', this.tex.noise, 3);
      caneU(pm);
      gl.uniform2f(u.uRes, W, H);
      gl.uniform1f(u.uPitch, 1 / o.strands); gl.uniform1f(u.uReveal, o.reveal); gl.uniform1f(u.uHollow, o.hollow ? 1 : 0);
      gl.uniform1f(u.uDebug, o.debug ? 1 : 0); gl.uniform1f(u.uSeed, o.seed || 0); gl.uniform1f(u.uBlurLod, blurLod);
      gl.uniform4fv(u.uEyeL, FEAT.eyeL); gl.uniform4fv(u.uEyeR, FEAT.eyeR); gl.uniform4fv(u.uMouth, FEAT.mouth); gl.uniform4fv(u.uNose, FEAT.nose);
      gl.uniform2fv(u.uNoseTip, FEAT.noseTip); gl.uniform2fv(u.uForehead, FEAT.forehead); gl.uniform2fv(u.uCheekL, FEAT.cheekL); gl.uniform2fv(u.uCheekR, FEAT.cheekR); gl.uniform2fv(u.uChin, FEAT.chin);
      gl.uniform2fv(u.uBrowL, FEAT.browL); gl.uniform2fv(u.uBrowR, FEAT.browR);
      for (const f of this.faces) {
        gl.uniform1f(u.uPitch, 1 / Loom.strandsFor(o.strands, f));     // never thinner than a strand can be drawn
        gl.uniform1f(u.uFaceLum, f.faceLum); gl.uniform3fv(u.uLight, f0.light); gl.uniform1f(u.uAmb, f0.amb);
        gl.uniform2fv(u.uSkinMu, f.skinMu); gl.uniformMatrix2fv(u.uSkinInv, false, f.skinInv);
        for (const [k, kind] of [['weave', 0], ['mouth', 1], ['eye', 2]]) {
          gl.uniform1f(u.uKind, kind);
          const [start, count] = f.ranges[k];
          if (count) gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, start * 2);
        }
      }
      gl.disable(gl.DEPTH_TEST);
    }

    /* final */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    const pf = this.pFinal, u = pf.u;
    gl.useProgram(pf.p); gl.bindVertexArray(this.quad);
    gl.uniform1f(u.uFlip, 1);
    bindTex(pf, 'tPhoto', this.tex.photo, 0); bindTex(pf, 'tFace', this.faceT.t, 1); bindTex(pf, 'tHair', this.tex.hair, 2);
    bindTex(pf, 'tPerson', this.tex.person, 3); bindTex(pf, 'tTensor', this.hasTensor ? this.tA.t : this.tex.hair, 4);
    bindTex(pf, 'tFly', this.tex.fly, 5); bindTex(pf, 'tNoise', this.tex.noise, 6);
    caneU(pf);
    gl.uniform2f(u.uRes, W, H);
    gl.uniform1f(u.uHasFace, f0 ? 1 : 0); gl.uniform1f(u.uHasTensor, this.hasTensor ? 1 : 0);
    gl.uniform1f(u.uFly, o.flyaways); gl.uniform1f(u.uReveal, o.reveal); gl.uniform1f(u.uHollow, o.hollow ? 1 : 0);
    gl.uniform1f(u.uGradeMix, Math.min(1, o.reveal / 0.3)); gl.uniform1f(u.uSeed, o.seed || 0); gl.uniform1f(u.uOriginal, o.original ? 1 : 0);
    gl.uniform1f(u.uBlurLod, blurLod);
    gl.uniform1i(u.uGrade, { golden: 0, river: 1, village: 2, none: 3 }[o.grade] ?? 0);
    if (f0) {
      gl.uniform2fv(u.uFC, f0.c); gl.uniform2fv(u.uFX, f0.fx); gl.uniform1f(u.uFD, f0.D);
      gl.uniform1f(u.uBodyP, f0.D / Loom.strandsFor(o.strands, f0) * 4.2); gl.uniform1f(u.uFaceLum, f0.faceLum);
      gl.uniform2fv(u.uSkinMu, f0.skinMu); gl.uniformMatrix2fv(u.uSkinInv, false, f0.skinInv);
      gl.uniform3fv(u.uLight, f0.light);
      const b = f0.beard, full = o.beard === 'full';
      gl.uniform1f(u.uBeard, o.beard === 'none' ? 0 : 1);
      gl.uniform4f(u.uBeardA, b[0], b[1], b[2], b[3]);
      gl.uniform4f(u.uBeardB, b[4], full ? 0.5 : 0.1, full ? 1.0 : 0.85, 0);
    } else {
      gl.uniform1f(u.uBeard, 0); gl.uniform1f(u.uFaceLum, 0.5); gl.uniform1f(u.uFD, 100); gl.uniform2f(u.uFC, W / 2, H / 2); gl.uniform2f(u.uFX, 1, 0);
      gl.uniform3f(u.uLight, 0.3, -0.4, 0.86);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

function solve4(A) {
  const M = A.map(r => r.slice());
  for (let c = 0; c < 4; c++) {
    let p = c; for (let r = c + 1; r < 4; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-9) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 4; r++) if (r !== c) { const k = M[r][c] / M[c][c]; for (let q = c; q < 5; q++) M[r][q] -= k * M[c][q]; }
  }
  return M.map((r, i) => r[4] / r[i]);
}

export const FEATURES = FEAT;
