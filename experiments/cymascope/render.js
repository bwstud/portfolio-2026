/* Cymascope renderer (WebGL 2). One pass rebuilds the liquid surface at every pixel from the
   active dish modes (their radial profiles live in a small float texture) and lights it:
   a ring of LEDs reflecting off the slopes, a shadowgraph of light focused by the curvature,
   a raking light, a height map, contours or a schlieren knife edge. The result is coloured
   through a palette, then a blurred copy adds the glow and a last pass adds grain and vignette. */

import { PROFILE_N, PROFILE_U } from './physics.js';

export const MAX_MODES = 16;

const VS = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS_FIELD = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uZoom;
uniform float uRot;
uniform int uFold;
uniform int uCount;
uniform vec4 uMode[${MAX_MODES}];
uniform sampler2D uProf;
uniform float uSlope;
uniform float uLapScale;
uniform float uNonlin;
uniform int uLight;
uniform vec4 uRing;
uniform float uSplit;
uniform float uFocus;
uniform float uContour;
uniform float uAngle;
uniform float uAmbient;
uniform int uColorBy;
uniform sampler2D uPal;
uniform float uExposure;
uniform float uContrast;
uniform int uCrop;
uniform float uRim;
uniform float uHue;
uniform vec3 uTouch;    // a fingertip over the dish: x, y in pixels, and strength (0 = none)
uniform vec4 uPulse[4];  // rings spreading from clicks: x, y, radius and push, all in pixels (push 0 = unused)
uniform float uPulseW;   // how wide a ring is, in pixels
uniform vec4 uTouchK;   // its reach in pixels, the ripple's phase, how much of it is ripple (0 = plain lens), ring count
out vec4 o;

const float PI = 3.14159265;

vec3 pal(float v) { return texture(uPal, vec2(clamp(v, 0.0, 1.0) * 0.996 + 0.002, 0.5)).rgb; }

vec3 hue(float a) {
  return clamp(abs(mod(a * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

float ringLight(vec2 d, float rho) {
  float sz = uRing.y;
  float n = uRing.z;
  float I;
  if (n < 1.0) {
    float e = length(d) - rho;
    I = exp(-e * e / (2.0 * sz * sz));
  } else {
    float step = 2.0 * PI / n;
    float a = floor(atan(d.y, d.x) / step + 0.5) * step;
    vec2 e = d - rho * vec2(cos(a), sin(a));
    I = exp(-dot(e, e) / (2.0 * sz * sz)) * 1.6;
  }
  I += uRing.w * exp(-dot(d, d) / (2.0 * sz * sz));
  return I;
}

float shade(int mode, vec2 s, float h, float lap, float k) {
  if (mode == 0) return ringLight(2.0 * s, uRing.x * k);
  if (mode == 1) {
    float f = 1.0 + uFocus * k * lap;
    return min(10.0, 0.1 / pow(max(0.03, abs(f)), 1.5));
  }
  if (mode == 2) {
    vec3 n = normalize(vec3(-s * 2.5, 1.0));
    vec3 L = normalize(vec3(cos(uAngle) * 0.75, sin(uAngle) * 0.75, 0.62 * k));
    float dif = max(dot(n, L), 0.0);
    float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 48.0);
    return dif * 0.75 + spec * 1.4;
  }
  if (mode == 3) return 0.5 + 0.5 * h * k;
  if (mode == 4) {
    float q = h * uContour * k;
    float w = fwidth(q);
    float d = abs(fract(q + 0.5) - 0.5);
    float line = 1.0 - smoothstep(w * 0.5, w * 1.5, d);
    return 0.05 + line * 1.1;
  }
  vec2 dir = vec2(cos(uAngle), sin(uAngle));
  float v = 0.5 + dot(s, dir) * 1.6 * k;
  return clamp(v, 0.0, 1.0) * clamp(v, 0.0, 1.0) * 1.4;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  for (int i = 0; i < 4; i++) {
    if (uPulse[i].w == 0.0) continue;
    // a ring of displacement travelling outward: the picture is pushed out, then drawn back, as it passes
    vec2 d = gl_FragCoord.xy - uPulse[i].xy;
    float r = length(d);
    float q = (r - uPulse[i].z) / uPulseW;
    fc -= d / max(r, 1.0) * uPulse[i].w * exp(-q * q) * cos(q * 2.2);
  }
  if (uTouch.z != 0.0) {
    // the picture bends under the fingertip like a lens, with a ripple spreading from it
    vec2 d = gl_FragCoord.xy - uTouch.xy;
    float r = length(d) / uTouchK.x;
    fc -= d * uTouch.z * exp(-r * r * 1.6) * (1.0 - uTouchK.z + uTouchK.z * cos(r * uTouchK.w - uTouchK.y));
  }
  fc -= uCenter;
  float uScreen = length(fc) / uRadius;
  vec2 p = fc / (uRadius * uZoom);
  float cr = cos(uRot), sr = sin(uRot);
  p = vec2(cr * p.x + sr * p.y, -sr * p.x + cr * p.y);
  float u = length(p);
  float th = atan(p.y, p.x);

  // kaleidoscope fold: sample one wedge, mirror it round the dish
  float tsign = 1.0;
  float thf = th;
  if (uFold > 0) {
    float w = 2.0 * PI / float(uFold);
    float a = mod(th, w);
    if (a > w * 0.5) { a = w - a; tsign = -1.0; }
    thf = a;
  }

  float uu = max(u, 1e-3);
  float tx = clamp(u / ${PROFILE_U.toFixed(2)}, 0.0, 1.0) * ${((PROFILE_N - 1) / PROFILE_N).toFixed(6)} + ${(0.5 / PROFILE_N).toFixed(6)};
  float h = 0.0, gr = 0.0, gt = 0.0, lap = 0.0;
  for (int i = 0; i < ${MAX_MODES}; i++) {
    if (i >= uCount) break;
    vec4 md = uMode[i];
    vec2 pr = texture(uProf, vec2(tx, (float(i) + 0.5) / ${MAX_MODES}.0)).rg;
    float c = cos(md.x * thf), s = sin(md.x * thf);
    h += md.z * pr.x * c;
    gr += md.z * pr.y * c;
    gt -= md.z * md.x * pr.x * s / uu;
    lap -= md.z * md.y * md.y * pr.x * c;
  }
  gt *= tsign;
  // crests steepen and troughs flatten as the waves grow
  float nl = 1.0 + uNonlin * h;
  vec2 er = vec2(cos(th), sin(th)), et = vec2(-er.y, er.x);
  vec2 g = (gr * er + gt * et) * nl;
  g = vec2(cr * g.x - sr * g.y, sr * g.x + cr * g.y);

  vec2 sl = g * uSlope;
  float lp = lap * uLapScale * nl;

  vec3 I;
  if (uSplit > 0.0 && (uLight == 0 || uLight == 1 || uLight == 5)) {
    I = vec3(shade(uLight, sl, h, lp, 1.0 - uSplit), shade(uLight, sl, h, lp, 1.0), shade(uLight, sl, h, lp, 1.0 + uSplit));
  } else {
    I = vec3(shade(uLight, sl, h, lp, 1.0));
  }
  I += uAmbient;
  vec3 v = 1.0 - exp(-I * uExposure);
  v = pow(v, vec3(uContrast));

  vec3 col;
  if (uColorBy == 1) {
    float a = atan(sl.y, sl.x) / (2.0 * PI) + uHue;
    float m = clamp(length(sl) * 3.0, 0.0, 1.0);
    vec3 base = vec3(pal(v.r).r, pal(v.g).g, pal(v.b).b);
    col = mix(base, hue(fract(a)) * dot(v, vec3(0.333)) * 1.15, 0.8 * m);
  } else if (uColorBy == 2) {
    vec3 hc = pal(0.5 + 0.36 * h);
    col = hc * (0.12 + 1.1 * v);
  } else {
    col = vec3(pal(v.r).r, pal(v.g).g, pal(v.b).b);
  }

  if (uCrop == 1) {
    float edge = clamp((1.0 - uScreen) * uRadius + 0.5, 0.0, 1.0);
    vec3 bg = pal(0.0);
    vec3 outside = bg * mix(0.55, 0.94, dot(bg, vec3(0.2126, 0.7152, 0.0722)));
    // the glass wall: a thin bright line with a soft glow inside it
    float wall = exp(-pow((uScreen - 1.0) * uRadius / 1.6, 2.0)) * uRim;
    float glowIn = exp(-max((1.0 - uScreen) * uRadius, 0.0) / (uRadius * 0.02)) * uRim * 0.5;
    col = mix(outside, col + pal(0.92) * glowIn, edge) + pal(0.98) * wall * 0.8;
  }
  o = vec4(col, 1.0);
}`;

const FS_DOWN = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
out vec4 o;
void main() {
  vec3 c = texture(uSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb
         + texture(uSrc, vUv + uTexel * vec2( 1.0, -1.0)).rgb
         + texture(uSrc, vUv + uTexel * vec2(-1.0,  1.0)).rgb
         + texture(uSrc, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  c *= 0.25;
  // only the bright parts glow
  float l = max(c.r, max(c.g, c.b));
  o = vec4(c * smoothstep(0.35, 1.0, l), 1.0);
}`;

const FS_BLUR = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uStep;
out vec4 o;
void main() {
  vec3 c = texture(uSrc, vUv).rgb * 0.1964825;
  c += (texture(uSrc, vUv + uStep * 1.4117647).rgb + texture(uSrc, vUv - uStep * 1.4117647).rgb) * 0.2969069;
  c += (texture(uSrc, vUv + uStep * 3.2941176).rgb + texture(uSrc, vUv - uStep * 3.2941176).rgb) * 0.0944703;
  c += (texture(uSrc, vUv + uStep * 5.1764706).rgb + texture(uSrc, vUv - uStep * 5.1764706).rgb) * 0.0103813;
  o = vec4(c, 1.0);
}`;

const FS_SHOW = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uImg;
uniform sampler2D uBloom;
uniform vec2 uRes;
uniform float uGlow;
uniform float uGrain;
uniform float uVignette;
uniform float uSeed;
uniform int uInvert;
out vec4 o;
float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}
void main() {
  vec3 c = texture(uImg, vUv).rgb + texture(uBloom, vUv).rgb * uGlow * 1.6;
  vec2 q = (vUv - 0.5) * vec2(uRes.x / max(uRes.x, uRes.y), uRes.y / max(uRes.x, uRes.y)) * 2.0;
  c *= 1.0 - uVignette * smoothstep(0.35, 1.45, length(q));
  c += (hash(gl_FragCoord.xy + uSeed) - 0.5) * uGrain;
  c = c / (1.0 + max(c - 1.0, 0.0));
  if (uInvert == 1) c = 1.0 - c;
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

const NO_PULSES = new Float32Array(16);

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(p, i).name;
    u[name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, name);
  }
  return { p, u };
}

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL 2 is not available in this browser.');
    this.gl = gl;
    this.canvas = canvas;
    this.float = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');

    this.field = program(gl, VS, FS_FIELD);
    this.down = program(gl, VS, FS_DOWN);
    this.blur = program(gl, VS, FS_BLUR);
    this.show = program(gl, VS, FS_SHOW);
    this.vao = gl.createVertexArray();

    this.prof = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.prof);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, PROFILE_N, MAX_MODES, 0, gl.RG, gl.FLOAT, null);
    this.texParams(gl.LINEAR);

    this.pal = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.pal);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.texParams(gl.LINEAR);

    this.modeData = new Float32Array(MAX_MODES * 4);
    this.w = 0; this.h = 0;
  }

  texParams(filter) {
    const gl = this.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  target(w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (this.float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.texParams(gl.LINEAR);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE && this.float) {
      this.float = false;
      gl.deleteFramebuffer(fb);
      gl.deleteTexture(tex);
      return this.target(w, h);
    }
    return { tex, fb, w, h };
  }

  resize(w, h) {
    if (w === this.w && h === this.h) return;
    const gl = this.gl;
    for (const t of [this.img, this.bA, this.bB]) if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
    this.w = w; this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.img = this.target(w, h);
    const bw = Math.max(1, Math.round(w / 4)), bh = Math.max(1, Math.round(h / 4));
    this.bA = this.target(bw, bh);
    this.bB = this.target(bw, bh);
  }

  setProfile(row, data) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.prof);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, row, PROFILE_N, 1, gl.RG, gl.FLOAT, data);
  }

  setPalette(bytes) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.pal);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  }

  pass(prog, dst, setup) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null);
    gl.viewport(0, 0, dst ? dst.w : this.w, dst ? dst.h : this.h);
    gl.useProgram(prog.p);
    gl.bindVertexArray(this.vao);
    setup(prog.u);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  bind(unit, tex, loc) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc, unit);
  }

  /* modes: [{ m, x, coef }] in texture-row order
     v: { center, radius, zoom, rot, fold, slope, lapScale, nonlin, light, ring:[rho,size,leds,coax],
          split, focus, contour, angle, ambient, colorBy, exposure, contrast, crop, rim, hue,
          glow, grain, vignette, seed, invert } */
  draw(modes, v) {
    const gl = this.gl;
    const md = this.modeData;
    const n = Math.min(MAX_MODES, modes.length);
    for (let i = 0; i < n; i++) {
      md[i * 4] = modes[i].m;
      md[i * 4 + 1] = modes[i].x;
      md[i * 4 + 2] = modes[i].coef;
      md[i * 4 + 3] = 0;
    }
    this.pass(this.field, this.img, (u) => {
      this.bind(0, this.prof, u.uProf);
      this.bind(1, this.pal, u.uPal);
      gl.uniform2f(u.uCenter, v.center[0], v.center[1]);
      gl.uniform1f(u.uRadius, v.radius);
      gl.uniform1f(u.uZoom, v.zoom);
      gl.uniform1f(u.uRot, v.rot);
      gl.uniform1i(u.uFold, v.fold);
      gl.uniform1i(u.uCount, n);
      gl.uniform4fv(u.uMode, md);
      gl.uniform1f(u.uSlope, v.slope);
      gl.uniform1f(u.uLapScale, v.lapScale);
      gl.uniform1f(u.uNonlin, v.nonlin);
      gl.uniform1i(u.uLight, v.light);
      gl.uniform4f(u.uRing, ...v.ring);
      gl.uniform1f(u.uSplit, v.split);
      gl.uniform1f(u.uFocus, v.focus);
      gl.uniform1f(u.uContour, v.contour);
      gl.uniform1f(u.uAngle, v.angle);
      gl.uniform1f(u.uAmbient, v.ambient);
      gl.uniform1i(u.uColorBy, v.colorBy);
      gl.uniform1f(u.uExposure, v.exposure);
      gl.uniform1f(u.uContrast, v.contrast);
      gl.uniform1i(u.uCrop, v.crop);
      gl.uniform1f(u.uRim, v.rim);
      gl.uniform1f(u.uHue, v.hue);
      const tc = v.touch || [0, 0, 0, 1, 0, 0, 0];
      gl.uniform3f(u.uTouch, tc[0], tc[1], tc[2]);
      gl.uniform4f(u.uTouchK, Math.max(1, tc[3]), tc[4], tc[5], tc[6]);
      gl.uniform4fv(u.uPulse, v.pulses || NO_PULSES);
      gl.uniform1f(u.uPulseW, Math.max(1, v.pulseW || 1));
    });
    const { img, bA, bB } = this;
    this.pass(this.down, bA, (u) => {
      this.bind(0, img.tex, u.uSrc);
      gl.uniform2f(u.uTexel, 1 / img.w, 1 / img.h);
    });
    for (let i = 0; i < 2; i++) {
      this.pass(this.blur, bB, (u) => { this.bind(0, bA.tex, u.uSrc); gl.uniform2f(u.uStep, (1 + i * 1.5) / bA.w, 0); });
      this.pass(this.blur, bA, (u) => { this.bind(0, bB.tex, u.uSrc); gl.uniform2f(u.uStep, 0, (1 + i * 1.5) / bA.h); });
    }
    this.pass(this.show, null, (u) => {
      this.bind(0, img.tex, u.uImg);
      this.bind(1, bA.tex, u.uBloom);
      gl.uniform2f(u.uRes, this.w, this.h);
      gl.uniform1f(u.uGlow, v.glow);
      gl.uniform1f(u.uGrain, v.grain);
      gl.uniform1f(u.uVignette, v.vignette);
      gl.uniform1f(u.uSeed, v.seed);
      gl.uniform1i(u.uInvert, v.invert ? 1 : 0);
    });
  }
}
