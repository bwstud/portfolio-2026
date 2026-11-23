/* CRT renderer (WebGL 2). The beam deposits energy into a floating-point buffer, which
   fades each frame like phosphor. Each segment of the trace is a quad whose brightness is
   the exact integral of a Gaussian spot moving along it, divided by the segment's length,
   so the beam is dim where it moves fast and bright where it lingers. A blurred copy adds
   the glow, and a final pass tone-maps, tints and draws the graticule and glass. */

const VS_FULL = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const VS_BEAM = `#version 300 es
in vec2 aCorner;
in vec2 aP0;
in vec2 aP1;
uniform vec2 uOrigin;
uniform float uDiv;
uniform vec2 uRes;
uniform float uSigma;
out vec2 vSD;
out float vL;
void main() {
  vec2 a = uOrigin + aP0 * uDiv;
  vec2 b = uOrigin + aP1 * uDiv;
  vec2 d = b - a;
  float L = length(d);
  vec2 dir = L > 1e-4 ? d / L : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float R = uSigma * 3.5 + 1.0;
  float along = aCorner.x * (L + 2.0 * R) - R;
  float across = aCorner.y * R;
  vSD = vec2(along, across);
  vL = L;
  gl_Position = vec4((a + dir * along + nrm * across) / uRes * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS_BEAM = `#version 300 es
precision highp float;
in vec2 vSD;
in float vL;
uniform float uSigma;
uniform float uEnergy;
uniform vec3 uColor;
out vec4 o;
float erf1(float x) {
  float s = sign(x);
  x = abs(x);
  float t = 1.0 / (1.0 + 0.3275911 * x);
  float y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-x * x);
  return s * y;
}
void main() {
  float s2 = uSigma * uSigma;
  float s = vSD.x, d = vSD.y;
  float k;
  if (vL < 0.5) {
    k = exp(-(s * s + d * d) / (2.0 * s2)) / (6.2831853 * s2);
  } else {
    float r = 1.0 / (1.41421356 * uSigma);
    k = exp(-d * d / (2.0 * s2)) / (6.2831853 * s2) * uSigma * 1.25331414 * (erf1(s * r) - erf1((s - vL) * r)) / vL;
  }
  o = vec4(uColor * (uEnergy * k), 1.0);
}`;

const FS_CLEAR = `#version 300 es
precision mediump float;
out vec4 o;
void main() { o = vec4(0.0); }`;

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
  o = vec4(c * 0.25, 1.0);
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
uniform sampler2D uAcc;
uniform sampler2D uBloom;
uniform vec2 uRes;
uniform vec2 uOrigin;
uniform float uDiv;
uniform float uExposure;
uniform float uGlow;
uniform float uCurve;
uniform int uGrat;
uniform float uGratLight;
uniform float uGlass;
uniform vec3 uTint;
out vec4 o;

float lineA(float dpx, float w) { return 1.0 - smoothstep(w * 0.5, w * 0.5 + 1.0, dpx); }

float graticule(vec2 q) {
  float px = 1.0 / uDiv;
  bool inX = q.x > -px && q.x < 10.0 + px;
  bool inY = q.y > -4.0 - px && q.y < 4.0 + px;
  if (!inX || !inY) return 0.0;
  vec2 dMajor = abs(q - floor(q + 0.5)) * uDiv;
  vec2 dMinor = abs(q * 5.0 - floor(q * 5.0 + 0.5)) / 5.0 * uDiv;
  float w = max(1.0, uDiv * 0.012);
  float a = 0.0;
  if (uGrat == 1) {
    a = max(lineA(dMajor.x, w), lineA(dMajor.y, w)) * 0.7;
    // ticks on the centre axes and the border
    float onAxisX = lineA(abs(q.y) * uDiv, uDiv * 0.16);
    float onAxisY = lineA(abs(q.x - 5.0) * uDiv, uDiv * 0.16);
    a = max(a, lineA(dMinor.x, w) * onAxisX);
    a = max(a, lineA(dMinor.y, w) * onAxisY);
    float border = max(lineA(min(abs(q.x), abs(q.x - 10.0)) * uDiv, w * 1.4), lineA((4.0 - abs(q.y)) * uDiv, w * 1.4));
    a = max(a, border);
    float centre = max(lineA(abs(q.y) * uDiv, w * 1.2), lineA(abs(q.x - 5.0) * uDiv, w * 1.2));
    a = max(a, centre * 0.9);
  } else if (uGrat == 2) {
    float r = max(1.1, uDiv * 0.018);
    float dotV = 1.0 - smoothstep(r - 0.6, r + 0.6, length(vec2(dMajor.x, dMinor.y)));
    float dotH = 1.0 - smoothstep(r - 0.6, r + 0.6, length(vec2(dMinor.x, dMajor.y)));
    a = max(dotV, dotH);
  }
  return a;
}

void main() {
  vec2 c = vUv * 2.0 - 1.0;
  float r2 = dot(c, c);
  vec2 w = c * (1.0 + uCurve * 0.07 * r2);
  vec2 uv = w * 0.5 + 0.5;
  vec2 edge = smoothstep(vec2(0.0), vec2(0.004), uv) * smoothstep(vec2(0.0), vec2(0.004), 1.0 - uv);
  float inside = edge.x * edge.y;

  vec3 acc = texture(uAcc, uv).rgb;
  vec3 bloom = texture(uBloom, uv).rgb;
  vec3 e = (acc + bloom * uGlow * 2.5) * uExposure;
  vec3 col = 1.0 - exp(-e);

  // unlit phosphor and the glass
  float lit = 1.0 - smoothstep(0.2, 1.5, length(c * vec2(0.85, 1.0)));
  vec3 base = mix(vec3(0.010, 0.013, 0.013), uTint * 0.03, 0.5) * (0.6 + 0.4 * lit);
  col += base;

  vec2 q = (uv * uRes - uOrigin) / uDiv;
  col += mix(vec3(0.55, 0.6, 0.58), uTint, 0.25) * graticule(q) * uGratLight;

  if (uGlass > 0.5) {
    float glare = smoothstep(0.9, 0.0, length((c - vec2(-0.55, 0.62)) * vec2(0.8, 1.4)));
    col += vec3(0.85, 0.9, 1.0) * glare * glare * 0.035;
    col *= 1.0 - 0.45 * smoothstep(0.55, 1.45, length(c * vec2(0.92, 1.0)));
  }
  col *= inside;
  o = vec4(col, 1.0);
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
    u[name] = gl.getUniformLocation(p, name);
  }
  return { p, u };
}

export class CRT {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL 2 is not available in this browser.');
    this.gl = gl;
    this.canvas = canvas;
    this.float = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');

    this.beam = program(gl, VS_BEAM, FS_BEAM);
    this.clearP = program(gl, VS_FULL, FS_CLEAR);
    this.down = program(gl, VS_FULL, FS_DOWN);
    this.blur = program(gl, VS_FULL, FS_BLUR);
    this.show = program(gl, VS_FULL, FS_SHOW);

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.corner = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corner);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW);
    this.aCorner = gl.getAttribLocation(this.beam.p, 'aCorner');
    this.aP0 = gl.getAttribLocation(this.beam.p, 'aP0');
    this.aP1 = gl.getAttribLocation(this.beam.p, 'aP1');
    gl.enableVertexAttribArray(this.aCorner);
    gl.vertexAttribPointer(this.aCorner, 2, gl.FLOAT, false, 0, 0);
    this.pts = gl.createBuffer();
    this.ptsSize = 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pts);
    gl.enableVertexAttribArray(this.aP0);
    gl.enableVertexAttribArray(this.aP1);
    gl.vertexAttribDivisor(this.aP0, 1);
    gl.vertexAttribDivisor(this.aP1, 1);
    this.empty = gl.createVertexArray();

    this.w = 0; this.h = 0;
  }

  target(w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (this.float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE && this.float) {
      this.float = false;
      gl.deleteFramebuffer(fb);
      gl.deleteTexture(tex);
      return this.target(w, h);
    }
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fb, w, h };
  }

  resize(w, h) {
    if (w === this.w && h === this.h) return;
    const gl = this.gl;
    for (const t of [this.acc, this.bA, this.bB]) if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
    this.w = w; this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.acc = this.target(w, h);
    const bw = Math.max(1, Math.round(w / 4)), bh = Math.max(1, Math.round(h / 4));
    this.bA = this.target(bw, bh);
    this.bB = this.target(bw, bh);
  }

  clear() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.acc.fb);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  // multiply the stored energy by f: the phosphor fading
  decay(f) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.acc.fb);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.clearP.p);
    gl.bindVertexArray(this.empty);
    gl.enable(gl.BLEND);
    gl.blendColor(0, 0, 0, f);
    gl.blendFunc(gl.ZERO, gl.CONSTANT_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
  }

  // layout: { origin: [x, y] in px, div: px per division, clip: [x, y, w, h] }
  beams(points, used, strips, layout, sigma, dots) {
    if (!strips.length) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.acc.fb);
    gl.viewport(0, 0, this.w, this.h);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(...layout.clip);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    const { p, u } = this.beam;
    gl.useProgram(p);
    gl.uniform2f(u.uOrigin, layout.origin[0], layout.origin[1]);
    gl.uniform1f(u.uDiv, layout.div);
    gl.uniform2f(u.uRes, this.w, this.h);
    gl.uniform1f(u.uSigma, sigma);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pts);
    const bytes = used * 8;
    if (bytes > this.ptsSize) {
      this.ptsSize = Math.max(bytes, this.ptsSize * 2, 1 << 16);
      gl.bufferData(gl.ARRAY_BUFFER, this.ptsSize, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, points, 0, used * 2);
    for (const s of strips) {
      gl.uniform1f(u.uEnergy, dots ? s.energy : s.energy);
      gl.uniform3f(u.uColor, s.color[0], s.color[1], s.color[2]);
      const off = s.start * 8;
      if (dots) {
        gl.vertexAttribPointer(this.aP0, 2, gl.FLOAT, false, 8, off);
        gl.vertexAttribPointer(this.aP1, 2, gl.FLOAT, false, 8, off);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, s.n);
      } else {
        gl.vertexAttribPointer(this.aP0, 2, gl.FLOAT, false, 8, off);
        gl.vertexAttribPointer(this.aP1, 2, gl.FLOAT, false, 8, off + 8);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, s.n - 1);
      }
    }
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
  }

  pass(prog, dst, setup) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null);
    gl.viewport(0, 0, dst ? dst.w : this.w, dst ? dst.h : this.h);
    gl.useProgram(prog.p);
    gl.bindVertexArray(this.empty);
    setup(prog.u);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  bind(unit, tex, loc) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc, unit);
  }

  // look: { exposure, glow, curve, grat (0 off, 1 lines, 2 dots), gratLight, glass, tint, origin, div }
  present(look) {
    const gl = this.gl;
    const { bA, bB, acc } = this;
    this.pass(this.down, bA, u => {
      this.bind(0, acc.tex, u.uSrc);
      gl.uniform2f(u.uTexel, 1 / acc.w, 1 / acc.h);
    });
    for (let i = 0; i < 2; i++) {
      this.pass(this.blur, bB, u => { this.bind(0, bA.tex, u.uSrc); gl.uniform2f(u.uStep, (1 + i) / bA.w, 0); });
      this.pass(this.blur, bA, u => { this.bind(0, bB.tex, u.uSrc); gl.uniform2f(u.uStep, 0, (1 + i) / bA.h); });
    }
    this.pass(this.show, null, u => {
      this.bind(0, acc.tex, u.uAcc);
      this.bind(1, bA.tex, u.uBloom);
      gl.uniform2f(u.uRes, this.w, this.h);
      gl.uniform2f(u.uOrigin, look.origin[0], look.origin[1]);
      gl.uniform1f(u.uDiv, look.div);
      gl.uniform1f(u.uExposure, look.exposure);
      gl.uniform1f(u.uGlow, look.glow);
      gl.uniform1f(u.uCurve, look.curve);
      gl.uniform1i(u.uGrat, look.grat);
      gl.uniform1f(u.uGratLight, look.gratLight);
      gl.uniform1f(u.uGlass, look.glass ? 1 : 0);
      gl.uniform3f(u.uTint, ...look.tint);
    });
  }
}
