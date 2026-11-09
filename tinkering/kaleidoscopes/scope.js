/* The kaleidoscope itself: one WebGL 2 fragment shader that folds every pixel of the view
   back into the mirrors' object cell, then samples the picture there.

   Two kinds of mirror arrangement:
   - wedge: two mirrors meeting at 180°/n. The view is folded by angle, like a real two-mirror
     scope, so the picture repeats n times around a centre.
   - polygon: three or four mirrors forming a triangle or square that tiles the plane by
     reflection. Each pixel is reflected across whichever mirror it lies beyond, until it lands
     inside the cell. The number of reflections it took darkens it a little, as real mirrors do.

   Shared by the main page, the lab and the thumbnail renderer. */

export const MIRRORS = {
  wedge:  { label: 'Two mirrors', short: 'Two mirrors' },
  tri60:  { label: 'Three mirrors, 60° 60° 60°', short: 'Equilateral' },
  tri45:  { label: 'Three mirrors, 90° 45° 45°', short: 'Right isosceles' },
  tri30:  { label: 'Three mirrors, 90° 60° 30°', short: 'Half equilateral' },
  square: { label: 'Four mirrors, square', short: 'Square' },
};

/* Cell outlines in cell units, counter-clockwise, centred on their centroid. */
function centred(points) {
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
  return points.map(([x, y]) => [x - cx, y - cy]);
}
const R3 = Math.sqrt(3);
export const CELLS = {
  tri60: centred([[0, 0.5], [-0.25 * R3, -0.25], [0.25 * R3, -0.25]]),
  tri45: centred([[0, 0], [0.8, 0], [0, 0.8]]),
  tri30: centred([[0, 0], [0.5, 0], [0, 0.5 * R3]]),
  square: [[-0.4, -0.4], [0.4, -0.4], [0.4, 0.4], [-0.4, 0.4]],
};
// make every outline counter-clockwise so outward normals point out
for (const key of Object.keys(CELLS)) {
  const pts = CELLS[key];
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    area += x1 * y2 - x2 * y1;
  }
  if (area < 0) pts.reverse();
}

/* Each mirror as (outward normal, offset): a point p is inside when dot(n, p) <= d. */
function edgesOf(points) {
  const out = new Float32Array(12);
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    let nx = b[1] - a[1], ny = -(b[0] - a[0]);
    const len = Math.hypot(nx, ny);
    nx /= len; ny /= len;
    out.set([nx, ny, nx * a[0] + ny * a[1]], i * 3);
  });
  return out;
}

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform float uM;
uniform vec2 uAspect;
uniform int uMode;
uniform float uSeg;
uniform vec3 uEdges[4];
uniform int uEdgeCount;
uniform float uPicScale;
uniform mat2 uCellRot;
uniform vec2 uCellOff;
uniform mat2 uViewRot;
uniform float uZoom, uTwist, uLens;
uniform float uCircle, uEyeSize, uEdge, uVignette, uSheen;
uniform float uLoss, uSeam, uAberr;
uniform float uBright, uContrast, uSat, uHue, uTintAmt;
uniform vec3 uTint, uRim;
out vec4 outColor;

const float PI = 3.14159265;

// Fold a view point into the object cell. Returns the cell point, with the number of
// reflections in z and the distance to the nearest mirror in w.
vec4 fold(vec2 p) {
  if (uMode == 0) {
    float r = length(p);
    float a = atan(p.y, p.x);
    float k = floor(a / uSeg);
    float b = a - k * uSeg;
    if (mod(k, 2.0) != 0.0) b = uSeg - b;
    float n = floor(PI / uSeg + 0.5);
    float refl = k >= 0.0 ? k : -k;
    refl = min(refl, 2.0 * n - refl);
    float dist = r * sin(min(b, uSeg - b));
    return vec4(r * cos(b), r * sin(b), refl, dist);
  }
  float refl = 0.0;
  for (int i = 0; i < 96; i++) {
    bool moved = false;
    for (int e = 0; e < 4; e++) {
      if (e >= uEdgeCount) break;
      vec3 E = uEdges[e];
      float s = dot(E.xy, p) - E.z;
      if (s > 0.0) { p -= 2.0 * s * E.xy; refl += 1.0; moved = true; }
    }
    if (!moved) break;
  }
  float dist = 1e3;
  for (int e = 0; e < 4; e++) {
    if (e >= uEdgeCount) break;
    dist = min(dist, uEdges[e].z - dot(uEdges[e].xy, p));
  }
  return vec4(p, refl, dist);
}

vec2 toUv(vec2 q) {
  vec2 v = uCellRot * q * uPicScale + uCellOff;
  return 0.5 + v / uAspect;
}

// one channel set at a view point: colour, plus mirror loss and seam darkening
vec3 look(vec2 pv, float pxCell) {
  vec4 f = fold(pv);
  vec3 c = texture(uTex, toUv(f.xy)).rgb;
  c *= pow(1.0 - uLoss, min(f.z, 40.0));
  float seam = smoothstep(0.0, 1.6 * pxCell, f.w);
  c *= 1.0 - uSeam * (1.0 - seam);
  return c;
}

vec3 hueRotate(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a), sa = sin(a);
  return c * ca + cross(k, c) * sa + k * dot(k, c) * (1.0 - ca);
}

void main() {
  float m = uM;
  vec2 p = (gl_FragCoord.xy - uCenter) / (0.5 * m);
  float r = length(p);
  float R = uCircle > 0.5 ? uEyeSize : 1e3;

  // eyepiece lens: barrel bulge, then twist, then the view's own rotation and zoom
  vec2 pl = p * (1.0 + uLens * (dot(p, p) - 0.5));
  float tw = uTwist * length(pl);
  float ct = cos(tw), st = sin(tw);
  pl = mat2(ct, st, -st, ct) * pl;
  vec2 pv = uViewRot * pl * uZoom;
  float pxCell = (2.0 / m) * uZoom;

  vec3 col;
  if (uAberr > 0.0) {
    col.r = look(pv * (1.0 + uAberr * r), pxCell).r;
    col.g = look(pv, pxCell).g;
    col.b = look(pv * (1.0 - uAberr * r), pxCell).b;
  } else {
    col = look(pv, pxCell);
  }

  // colour
  col += uBright;
  col = (col - 0.5) * uContrast + 0.5;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat);
  if (uHue != 0.0) col = hueRotate(col, uHue);
  col = mix(col, col * uTint, uTintAmt);

  // tube: vignette, glass sheen, soft eyepiece edge
  float rr = uCircle > 0.5 ? r / R : length(p * vec2(m / uRes.x, m / uRes.y)) / 1.42;
  col *= 1.0 - uVignette * smoothstep(0.25, 1.05, rr);
  vec2 hp = (p - vec2(-0.38, 0.46) * min(R, 1.0)) * vec2(1.0, 1.9);
  col += uSheen * 0.55 * exp(-dot(hp, hp) * 5.0);
  col += uSheen * 0.12 * smoothstep(0.82, 0.98, rr) * (1.0 - smoothstep(0.98, 1.0, rr));
  col = clamp(col, 0.0, 1.0);

  float edge = max(uEdge, 1.5 / m);
  float mask = 1.0 - smoothstep(R - edge, R, r);
  outColor = vec4(mix(uRim, col, mask), 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

const hex = h => {
  const n = parseInt(String(h).replace('#', ''), 16) || 0;
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
};
const DEG = Math.PI / 180;
const rot2 = a => new Float32Array([Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a)]);

/* Where the cell and view are at time t (seconds), with the user's own nudges on top.
   Returned values are what both the shader and the lab's cell overlay use. */
export function pose(cfg, t, user = {}) {
  const drift = cfg.drift * 0.12;
  const breathe = 1 + cfg.breathe * 0.18 * Math.sin(t * 0.55);
  return {
    cellRot: (cfg.cellRotate + cfg.turn * t + (user.rot ?? 0)) * DEG,
    off: [
      cfg.cellX + drift * Math.sin(t * 0.23) + (user.x ?? 0),
      cfg.cellY + drift * Math.cos(t * 0.17) + (user.y ?? 0),
    ],
    viewRot: cfg.spin * t * DEG,
    zoom: cfg.zoom * breathe,
    picScale: cfg.picScale * (user.scale ?? 1),
  };
}

export class Scope {
  constructor(canvas, { preserve = false, maxDpr = 2 } = {}) {
    this.canvas = canvas;
    this.maxDpr = maxDpr;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: preserve, powerPreference: 'high-performance' });
    if (!gl) throw new Error('This browser has no WebGL 2, which the kaleidoscope needs.');
    this.gl = gl;

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    this.prog = prog;
    gl.useProgram(prog);
    this.u = {};
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(prog, i).name.replace('[0]', '');
      this.u[name] = gl.getUniformLocation(prog, name);
    }
    gl.bindVertexArray(gl.createVertexArray());

    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([40, 40, 44, 255]));
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    this.source = null;
    this.aspect = [1, 1];
    this.frame = null; // { x, y, size } in CSS pixels from the top left, or null for the whole canvas
  }

  /* el: a canvas (photos are drawn into one first) or a video element */
  setSource(el) {
    const gl = this.gl;
    this.source = el;
    const video = el instanceof HTMLVideoElement;
    this.isVideo = video;
    const w = video ? el.videoWidth : el.width, h = video ? el.videoHeight : el.height;
    const m = Math.min(w, h) || 1;
    this.aspect = [w / m, h / m];
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (video) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    } else {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    }
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  setSize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
  }

  draw(cfg, t, user) {
    const gl = this.gl, u = this.u;
    if (this.isVideo && this.source.readyState >= 2) {
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.source);
    }
    const P = pose(cfg, t, user);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.prog);
    const W = this.canvas.width, H = this.canvas.height;
    gl.uniform2f(u.uRes, W, H);
    if (this.frame && this.canvas.clientWidth) {
      const k = W / this.canvas.clientWidth;
      gl.uniform2f(u.uCenter, this.frame.x * k, H - this.frame.y * k);
      gl.uniform1f(u.uM, this.frame.size * k);
    } else {
      gl.uniform2f(u.uCenter, W / 2, H / 2);
      gl.uniform1f(u.uM, Math.min(W, H));
    }
    gl.uniform2f(u.uAspect, this.aspect[0], this.aspect[1]);
    const wedge = cfg.mirrors === 'wedge';
    gl.uniform1i(u.uMode, wedge ? 0 : 1);
    gl.uniform1f(u.uSeg, Math.PI / Math.max(1, cfg.segments));
    if (!wedge) {
      const cell = CELLS[cfg.mirrors] ?? CELLS.tri60;
      gl.uniform3fv(u.uEdges, edgesOf(cell));
      gl.uniform1i(u.uEdgeCount, cell.length);
    } else {
      gl.uniform1i(u.uEdgeCount, 0);
    }
    gl.uniform1f(u.uPicScale, P.picScale);
    gl.uniformMatrix2fv(u.uCellRot, false, rot2(P.cellRot));
    gl.uniform2f(u.uCellOff, P.off[0], P.off[1]);
    gl.uniformMatrix2fv(u.uViewRot, false, rot2(P.viewRot));
    gl.uniform1f(u.uZoom, P.zoom);
    gl.uniform1f(u.uTwist, cfg.twist);
    gl.uniform1f(u.uLens, cfg.lens);
    gl.uniform1f(u.uCircle, cfg.eyepiece === 'circle' ? 1 : 0);
    gl.uniform1f(u.uEyeSize, cfg.eyeSize);
    gl.uniform1f(u.uEdge, cfg.edge);
    gl.uniform1f(u.uVignette, cfg.vignette);
    gl.uniform1f(u.uSheen, cfg.sheen);
    gl.uniform1f(u.uLoss, cfg.loss);
    gl.uniform1f(u.uSeam, cfg.seam);
    gl.uniform1f(u.uAberr, cfg.aberration);
    gl.uniform1f(u.uBright, cfg.brightness);
    gl.uniform1f(u.uContrast, cfg.contrast);
    gl.uniform1f(u.uSat, cfg.saturation);
    gl.uniform1f(u.uHue, cfg.hue * DEG);
    gl.uniform1f(u.uTintAmt, cfg.tintAmount);
    gl.uniform3fv(u.uTint, hex(cfg.tint));
    gl.uniform3fv(u.uRim, hex(cfg.rim));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(u.uTex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

/* The object cell drawn over the picture, in picture coordinates (0–1, y down), for the lab.
   viewAspect is the preview's width over height, used to find how far a wedge reaches. */
export function cellOutline(cfg, t, user, aspect, viewAspect = 1) {
  const P = pose(cfg, t, user);
  const c = Math.cos(P.cellRot), s = Math.sin(P.cellRot);
  const toPic = ([x, y]) => {
    const vx = (c * x - s * y) * P.picScale + P.off[0];
    const vy = (s * x + c * y) * P.picScale + P.off[1];
    return [0.5 + vx / aspect[0], 1 - (0.5 + vy / aspect[1])];
  };
  if (cfg.mirrors !== 'wedge') return (CELLS[cfg.mirrors] ?? CELLS.tri60).map(toPic);
  // the wedge reaches as far as the farthest visible point of the view
  const reach = cfg.eyepiece === 'circle' ? cfg.eyeSize : Math.hypot(Math.max(1, viewAspect), Math.max(1, 1 / viewAspect));
  const r = reach * P.zoom * (1 + Math.max(0, cfg.lens) * 0.5);
  const seg = Math.PI / Math.max(1, cfg.segments);
  const pts = [[0, 0]];
  for (let i = 0; i <= 24; i++) pts.push([r * Math.cos(seg * i / 24), r * Math.sin(seg * i / 24)]);
  return pts.map(toPic);
}
