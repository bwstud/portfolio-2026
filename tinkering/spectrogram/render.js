/* Spectrogram renderer (WebGL 2). The finished columns live in a float texture used as a
   ring: one row per column, one texel per frequency bin, plus a small integer texture that
   says which column each row holds. One pass looks every pixel up in it, through the chosen
   frequency scale and layout; the ridgeline view draws each column as a line instead. A
   blurred copy adds the glow, and a last pass adds grain, scanlines and vignette. */

const VS = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// shared lookups: column + frequency -> level 0..1
const LOOKUP = `
uniform sampler2D uMag;
uniform highp isampler2D uSlot;
uniform vec2 uMagSize;       // max bins, ring rows
uniform float uLatest;       // newest finished column
uniform float uBins;
uniform float uBinHz;
uniform float uFmin;
uniform float uFmax;
uniform int uScale;          // 0 linear, 1 log, 2 mel
uniform float uLo;
uniform float uHi;
uniform float uGamma;
uniform float uLevels;
uniform int uBlocky;
uniform int uLinearMag;
uniform sampler2D uPal;

vec3 pal(float v) { return texture(uPal, vec2(clamp(v, 0.0, 1.0) * 0.996 + 0.002, 0.5)).rgb; }

float mel(float f) { return 2595.0 * log(1.0 + f / 700.0) / log(10.0); }
float melInv(float m) { return 700.0 * (pow(10.0, m / 2595.0) - 1.0); }

float freqAt(float y) {
  if (uScale == 0) return uFmin + (uFmax - uFmin) * y;
  if (uScale == 2) return melInv(mel(uFmin) + (mel(uFmax) - mel(uFmin)) * y);
  return uFmin * pow(uFmax / uFmin, y);
}

float rawAt(float c, float bin) {
  if (c < 0.0 || c > uLatest) return -200.0;
  int s = int(mod(c, uMagSize.y));
  if (texelFetch(uSlot, ivec2(s, 0), 0).r != int(c)) return -200.0;
  float b = uBlocky == 1 ? floor(bin + 0.5) : bin;
  return texture(uMag, vec2((b + 0.5) / uMagSize.x, (float(s) + 0.5) / uMagSize.y)).r;
}

// the loudest of a few taps across the bins one pixel covers, so peaks don't flicker away
float rawSpan(float c, float b0, float b1) {
  float span = abs(b1 - b0);
  int taps = int(clamp(ceil(span), 1.0, 8.0));
  float v = -200.0;
  for (int i = 0; i < 8; i++) {
    if (i >= taps) break;
    float b = mix(b0, b1, (float(i) + 0.5) / float(taps));
    v = max(v, rawAt(c, clamp(b, 0.0, uBins - 1.0)));
  }
  return v;
}

float norm(float v) {
  float l;
  if (uLinearMag == 1) {
    float a = pow(10.0, uLo / 20.0), b = pow(10.0, uHi / 20.0);
    l = (v - a) / (b - a);
  } else {
    l = (v - uLo) / (uHi - uLo);
  }
  l = pow(clamp(l, 0.0, 1.0), uGamma);
  if (uLevels > 0.5) l = floor(l * uLevels + 0.5) / uLevels;
  return l;
}

// y0, y1: the pixel's extent along the frequency axis (0..1)
float levelAt(float col, float y0, float y1) {
  float b0 = freqAt(y0) / uBinHz, b1 = freqAt(y1) / uBinHz;
  if (max(b0, b1) < 0.0 || min(b0, b1) > uBins) return 0.0;
  float v;
  if (uBlocky == 1) {
    v = rawSpan(floor(col + 0.5), b0, b1);
  } else {
    float c0 = floor(col), f = col - c0;
    float c1 = min(c0 + 1.0, uLatest);
    v = mix(rawSpan(c0, b0, b1), rawSpan(c1, b0, b1), f);
  }
  return norm(v);
}
`;

const FS_SPEC = `#version 300 es
precision highp float;
in vec2 vUv;
${LOOKUP}
uniform vec4 uPlot;          // x, y, w, h in pixels, from the bottom left
uniform float uColNow;
uniform float uSpan;         // columns across the plot
uniform int uView;           // 0 across, 1 down, 2 polar
uniform int uWipe;
uniform float uHole;
uniform vec3 uBg;
out vec4 o;

const float PI = 3.14159265;

float colFor(float u) {
  if (uWipe == 1) return uColNow - mod(uColNow - u * uSpan, uSpan);
  return uColNow - (1.0 - u) * uSpan;
}

void main() {
  vec2 p = (gl_FragCoord.xy - uPlot.xy) / uPlot.zw;
  float l = -1.0;
  if (uView == 2) {
    vec2 c = uPlot.xy + uPlot.zw * 0.5;
    float R = min(uPlot.z, uPlot.w) * 0.5;
    vec2 d = gl_FragCoord.xy - c;
    float r = length(d);
    float r0 = R * uHole;
    if (r <= R && r >= r0) {
      float y = (r - r0) / (R - r0);
      float dy = 0.5 / (R - r0);
      float a = fract(atan(d.x, d.y) / (2.0 * PI) + 1.0);
      l = levelAt(colFor(a), y - dy, y + dy);
    }
  } else if (all(greaterThanEqual(p, vec2(0.0))) && all(lessThanEqual(p, vec2(1.0)))) {
    if (uView == 0) {
      float dy = 0.5 / uPlot.w;
      l = levelAt(colFor(p.x), p.y - dy, p.y + dy);
    } else {
      float dx = 0.5 / uPlot.z;
      l = levelAt(colFor(p.y), p.x - dx, p.x + dx);
    }
  }
  o = vec4(l < 0.0 ? uBg : pal(l), 1.0);
}`;

/* Ridgelines: instance i is one line (0 is the furthest back). Each is drawn as a filled
   band from its baseline up to its curve, then a stroke along the curve; instances are
   drawn in order, so nearer lines paint over the ones behind them. */
const VS_RIDGE = `#version 300 es
precision highp float;
${LOOKUP}
uniform vec4 uPlot;
uniform vec2 uRes;
uniform float uColNow;
uniform float uStepCols;
uniform float uLines;
uniform float uPoints;
uniform float uHeight;
uniform float uDepth;
uniform float uWidth;
out float vLevel;
out float vFill;
out float vRow;
out float vStroke;

float lineCol(float i) { return floor(uColNow - (uLines - 1.0 - i) * uStepCols); }

vec2 pos(float i, float k, out float lv) {
  float x = k / (uPoints - 1.0);
  float dx = 0.5 / uPoints;
  lv = levelAt(lineCol(i), x - dx, x + dx);
  float back = (uLines - 1.0 - i) / max(1.0, uLines - 1.0);
  float shrink = 1.0 - uDepth * 0.45 * back;
  float sx = uPlot.x + uPlot.z * (0.5 + (x - 0.5) * shrink);
  float gap = uPlot.w * (1.0 - uHeight * 0.55) / max(1.0, uLines - 1.0);
  float base = uPlot.y + (uLines - 1.0 - i) * gap;
  // the middle of the band rises highest, as in a pulsar plot
  float bell = 0.35 + 0.65 * smoothstep(0.0, 0.35, min(x, 1.0 - x));
  return vec2(sx, base + lv * uHeight * uPlot.w * 0.55 * bell * shrink);
}

void main() {
  float i = float(gl_InstanceID);
  int per = int(uPoints - 1.0) * 6;
  int v = gl_VertexID;
  bool stroke = v >= per;
  if (stroke) v -= per;
  int seg = v / 6, corner = v % 6;
  // two triangles per segment: (0,1,2) (2,1,3) as a quad a0 b0 a1 b1
  int q = corner == 0 ? 0 : corner == 1 || corner == 4 ? 1 : corner == 2 || corner == 3 ? 2 : 3;
  float l0, l1;
  vec2 p0 = pos(i, float(seg), l0), p1 = pos(i, float(seg) + 1.0, l1);
  float lv = (q == 2 || q == 3) ? l1 : l0;
  vec2 p = (q == 2 || q == 3) ? p1 : p0;
  bool top = q == 1 || q == 3;
  vec2 outp;
  if (stroke) {
    vec2 t = normalize(p1 - p0 + vec2(1e-4, 0.0));
    vec2 n = vec2(-t.y, t.x);
    outp = p + n * uWidth * (top ? 0.5 : -0.5);
    vFill = 0.0;
  } else {
    float gap = uPlot.w * (1.0 - uHeight * 0.55) / max(1.0, uLines - 1.0);
    float base = uPlot.y + (uLines - 1.0 - i) * gap;
    outp = top ? p : vec2(p.x, base - 1.0);
    vFill = top ? 1.0 : 0.0;
  }
  vLevel = lv;
  vStroke = stroke ? 1.0 : 0.0;
  vRow = i / max(1.0, uLines - 1.0);
  gl_Position = vec4(outp / uRes * 2.0 - 1.0, stroke ? 0.0 : 0.5, 1.0);
}`;

const FS_RIDGE = `#version 300 es
precision highp float;
in float vLevel;
in float vFill;
in float vRow;
in float vStroke;
uniform sampler2D uPal;
uniform int uColorMode;     // 0 by level, 1 one colour, 2 by row
uniform float uFillMode;    // 0 hide what's behind, 1 tint
uniform vec3 uBg;
out vec4 o;
vec3 pal(float v) { return texture(uPal, vec2(clamp(v, 0.0, 1.0) * 0.996 + 0.002, 0.5)).rgb; }
void main() {
  if (vStroke > 0.5) {
    float t = uColorMode == 0 ? 0.35 + 0.65 * vLevel : uColorMode == 1 ? 0.92 : 0.25 + 0.75 * vRow;
    o = vec4(pal(t), 1.0);
  } else {
    vec3 c = uBg;
    if (uFillMode > 0.5) c = mix(uBg, pal(0.25 + 0.6 * vLevel), 0.55 * vFill);
    o = vec4(c, 1.0);
  }
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
  float l = max(c.r, max(c.g, c.b));
  o = vec4(c * smoothstep(0.3, 1.0, l), 1.0);
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
uniform float uScan;
uniform float uDpr;
uniform float uSeed;
uniform int uInvert;
out vec4 o;
float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}
void main() {
  vec3 c = texture(uImg, vUv).rgb + texture(uBloom, vUv).rgb * uGlow * 1.8;
  vec2 q = (vUv - 0.5) * vec2(uRes.x / max(uRes.x, uRes.y), uRes.y / max(uRes.x, uRes.y)) * 2.0;
  c *= 1.0 - uVignette * smoothstep(0.35, 1.45, length(q));
  float line = 0.5 + 0.5 * cos(gl_FragCoord.y / uDpr * 3.14159265);
  c *= 1.0 - uScan * line * line;
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

    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.ring = Math.min(4096, max);
    this.maxBins = Math.min(4096, max);

    this.spec = program(gl, VS, FS_SPEC);
    this.ridge = program(gl, VS_RIDGE, FS_RIDGE);
    this.down = program(gl, VS, FS_DOWN);
    this.blur = program(gl, VS, FS_BLUR);
    this.show = program(gl, VS, FS_SHOW);
    this.vao = gl.createVertexArray();

    this.mag = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.mag);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, this.maxBins, this.ring, 0, gl.RED, gl.FLOAT, null);
    this.texParams(gl.LINEAR);

    this.slots = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.slots);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32I, this.ring, 1, 0, gl.RED_INTEGER, gl.INT, new Int32Array(this.ring).fill(-1));
    this.texParams(gl.NEAREST);
    this.one = new Int32Array(1);

    this.pal = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.pal);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.texParams(gl.LINEAR);

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

  upload(slot, col, data, bins) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.mag);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, slot, bins, 1, gl.RED, gl.FLOAT, data);
    this.one[0] = col;
    gl.bindTexture(gl.TEXTURE_2D, this.slots);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, slot, 0, 1, 1, gl.RED_INTEGER, gl.INT, this.one);
  }

  clearSlots() {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.slots);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.ring, 1, gl.RED_INTEGER, gl.INT, new Int32Array(this.ring).fill(-1));
  }

  setPalette(bytes) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.pal);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  }

  bind(unit, tex, loc) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc, unit);
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

  lookup(u, v) {
    const gl = this.gl;
    this.bind(0, this.mag, u.uMag);
    this.bind(1, this.slots, u.uSlot);
    this.bind(2, this.pal, u.uPal);
    gl.uniform2f(u.uMagSize, this.maxBins, this.ring);
    gl.uniform1f(u.uLatest, v.latest);
    gl.uniform1f(u.uBins, v.bins);
    gl.uniform1f(u.uBinHz, v.binHz);
    gl.uniform1f(u.uFmin, v.fmin);
    gl.uniform1f(u.uFmax, v.fmax);
    gl.uniform1i(u.uScale, v.scale);
    gl.uniform1f(u.uLo, v.lo);
    gl.uniform1f(u.uHi, v.hi);
    gl.uniform1f(u.uGamma, v.gamma);
    gl.uniform1f(u.uLevels, v.levels);
    gl.uniform1i(u.uBlocky, v.blocky ? 1 : 0);
    gl.uniform1i(u.uLinearMag, v.linearMag ? 1 : 0);
  }

  /* v: { plot:[x,y,w,h] (pixels, bottom left), colNow, span, latest, bins, binHz, fmin, fmax,
          scale, lo, hi, gamma, levels, blocky, linearMag, view, wipe, hole, bg:[r,g,b],
          ridge:{ lines, points, stepCols, height, depth, width, colorMode, fill },
          glow, grain, vignette, scan, dpr, seed, invert } */
  draw(v) {
    const gl = this.gl;
    const { img, bA, bB } = this;
    if (v.view === 3) {
      const r = v.ridge;
      gl.bindFramebuffer(gl.FRAMEBUFFER, img.fb);
      gl.viewport(0, 0, img.w, img.h);
      gl.clearColor(v.bg[0], v.bg[1], v.bg[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this.ridge.p);
      gl.bindVertexArray(this.vao);
      const u = this.ridge.u;
      this.lookup(u, v);
      gl.uniform4f(u.uPlot, ...v.plot);
      gl.uniform2f(u.uRes, this.w, this.h);
      gl.uniform1f(u.uColNow, v.colNow);
      gl.uniform1f(u.uStepCols, r.stepCols);
      gl.uniform1f(u.uLines, r.lines);
      gl.uniform1f(u.uPoints, r.points);
      gl.uniform1f(u.uHeight, r.height);
      gl.uniform1f(u.uDepth, r.depth);
      gl.uniform1f(u.uWidth, r.width);
      gl.uniform1i(u.uColorMode, r.colorMode);
      gl.uniform1f(u.uFillMode, r.fill);
      gl.uniform3f(u.uBg, ...v.bg);
      // one instance per line: fill segments, then stroke segments
      const per = (r.points - 1) * 6;
      gl.drawArraysInstanced(gl.TRIANGLES, 0, per * 2, r.lines);
    } else {
      this.pass(this.spec, img, (u) => {
        this.lookup(u, v);
        gl.uniform4f(u.uPlot, ...v.plot);
        gl.uniform1f(u.uColNow, v.colNow);
        gl.uniform1f(u.uSpan, v.span);
        gl.uniform1i(u.uView, v.view);
        gl.uniform1i(u.uWipe, v.wipe ? 1 : 0);
        gl.uniform1f(u.uHole, v.hole);
        gl.uniform3f(u.uBg, ...v.bg);
      });
    }
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
      gl.uniform1f(u.uScan, v.scan);
      gl.uniform1f(u.uDpr, v.dpr);
      gl.uniform1f(u.uSeed, v.seed);
      gl.uniform1i(u.uInvert, v.invert ? 1 : 0);
    });
  }
}
