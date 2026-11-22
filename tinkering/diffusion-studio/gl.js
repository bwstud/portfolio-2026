// Small WebGL2 helpers: programs with named uniforms, half-float textures with mip levels, and pyramids built
// into those mip levels (level k blurred by 2^k px), ping-ponging between two textures so no pass reads what
// it writes.

import { VS, BLUR } from './shaders.js';

export function context(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error('WebGL2 is not available in this browser.');
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('This GPU cannot render to half-float textures.');
  gl.getExtension('OES_texture_float_linear');
  gl.bindVertexArray(gl.createVertexArray());
  return gl;
}

export function program(gl, fs, name) {
  const sh = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      const lines = src.split('\n');
      const m = /ERROR: \d+:(\d+)/.exec(log || '');
      const near = m ? lines.slice(Math.max(0, m[1] - 3), Number(m[1]) + 2).join('\n') : '';
      throw new Error(`${name} shader: ${log}\n${near}`);
    }
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`${name} link: ${gl.getProgramInfoLog(p)}`);
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    const key = info.name.replace(/\[0\]$/, '');
    u[key] = { loc: gl.getUniformLocation(p, info.name), type: info.type, size: info.size };
  }
  let unit = 0;
  return {
    p, u,
    use() { gl.useProgram(p); unit = 0; return this; },
    // set a uniform by name; textures take the next free unit
    set(name, v) {
      const x = u[name];
      if (!x) return this;
      switch (x.type) {
        case gl.FLOAT: x.size > 1 ? gl.uniform1fv(x.loc, v) : gl.uniform1f(x.loc, v); break;
        case gl.FLOAT_VEC2: gl.uniform2fv(x.loc, v); break;
        case gl.FLOAT_VEC3: gl.uniform3fv(x.loc, v); break;
        case gl.FLOAT_VEC4: gl.uniform4fv(x.loc, v); break;
        case gl.FLOAT_MAT2: gl.uniformMatrix2fv(x.loc, false, v); break;
        case gl.FLOAT_MAT3: gl.uniformMatrix3fv(x.loc, false, v); break;
        case gl.INT: case gl.BOOL: gl.uniform1i(x.loc, v); break;
        case gl.SAMPLER_2D: gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, v); gl.uniform1i(x.loc, unit); unit++; break;
        default: break;
      }
      return this;
    },
  };
}

export function levelsFor(w, h) { return Math.floor(Math.log2(Math.max(w, h))) + 1; }

export function texture(gl, w, h, { levels = 1, format = 'rgba16f' } = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texStorage2D(gl.TEXTURE_2D, levels, format === 'rgba8' ? gl.RGBA8 : gl.RGBA16F, w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, levels > 1 ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return { t, w, h, levels, fbos: [] };
}

export function fbo(gl, tex, level = 0) {
  if (tex.fbos[level]) return tex.fbos[level];
  const f = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex.t, level);
  tex.fbos[level] = f;
  return f;
}

// one framebuffer writing two textures' level 0 at once
export function fbo2(gl, a, b) {
  const f = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, a.t, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, b.t, 0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  return f;
}

export const size = (tex, level) => [Math.max(1, tex.w >> level), Math.max(1, tex.h >> level)];

export function draw(gl, target, w, h) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target);
  gl.viewport(0, 0, w, h);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// A pyramid: the image in level 0 of main; build() fills levels 1 … top, each blurred by 2^k px in all.
export function pyramid(gl, w, h, maxLevels = 11) {
  const levels = Math.min(levelsFor(w, h), maxLevels);
  const main = texture(gl, w, h, { levels }), tmp = texture(gl, w, h, { levels });
  const blur = pyramid.blur || (pyramid.blur = new WeakMap());
  if (!blur.has(gl)) blur.set(gl, program(gl, BLUR, 'blur'));
  const prog = blur.get(gl);
  return {
    main, tmp, levels, top: levels - 1,
    build(upTo = levels - 1) {
      prog.use();
      for (let k = 1; k <= upTo; k++) {
        const [lw, lh] = size(main, k);
        const sPrev = k === 1 ? 0 : 2 ** (k - 1), sNow = 2 ** k;
        const sigma = Math.sqrt(sNow * sNow - sPrev * sPrev) / 2 ** k;   // in this level's texels
        prog.use().set('uSrc', main.t).set('uLod', k - 1).set('uDir', [1 / lw, 0]).set('uSigma', sigma);
        draw(gl, fbo(gl, tmp, k), lw, lh);
        prog.use().set('uSrc', tmp.t).set('uLod', k).set('uDir', [0, 1 / lh]).set('uSigma', sigma);
        draw(gl, fbo(gl, main, k), lw, lh);
      }
    },
    dispose() { for (const t of [main, tmp]) { t.fbos.forEach((f) => f && gl.deleteFramebuffer(f)); gl.deleteTexture(t.t); } },
  };
}
