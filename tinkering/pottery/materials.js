/* One material for the clay at every stage: wet on the wheel, leather-hard, and fired under glaze.
   It is MeshPhysicalMaterial with a patch: the mesh tells each vertex which surface it is on, its
   height and whether glaze would pool there, and the shader turns that into the dip line, breaking
   on rims, pooling in carved lines, iron speckle and the slip streaks of wet clay. */

import * as THREE from 'three';
import { BODIES, GLAZES, LINER } from './data.js';

const NOISE = /* glsl */`
  float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { return 0.5 * vnoise(p) + 0.3 * vnoise(p * 2.07) + 0.2 * vnoise(p * 4.13); }
  // distance to the nearest cell edge, for crackle
  float cellEdge(vec3 p) {
    vec3 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
    for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
      vec3 g = vec3(x, y, z), o = vec3(h31(i + g), h31(i + g + 17.1), h31(i + g + 41.7));
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    return d2 - d1;
  }
`;

export function makeClayMaterial() {
  const u = {
    uWetLook: { value: 1 }, uWet: { value: 0.5 }, uFired: { value: 0 },
    uRawWet: { value: new THREE.Color() }, uRawFired: { value: new THREE.Color() },
    uSpeck: { value: 0 }, uSpeckCol: { value: new THREE.Color() }, uRawRough: { value: 0.8 },
    uGlazed: { value: 0 }, uDip: { value: 0.1 }, uThick: { value: 0.5 }, uInside: { value: 1 },
    uThin: { value: new THREE.Color() }, uThickCol: { value: new THREE.Color() },
    uOpa: { value: new THREE.Vector2(0.5, 1) }, uGRough: { value: 0.1 }, uGCoat: { value: 1 },
    uLThin: { value: new THREE.Color() }, uLThick: { value: new THREE.Color() },
    uLOpa: { value: new THREE.Vector2(0.8, 1) }, uLRough: { value: 0.1 }, uLiner: { value: 0 },
    uCrackle: { value: 0 }, uRuns: { value: 0 }, uCarbon: { value: 0 }, uHeight: { value: 0.1 },
    uHighlight: { value: new THREE.Vector2(-1, 0) },
  };
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.8, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.18, envMapIntensity: 1,
  });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aInfo; varying vec3 vInfo; varying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInfo = aInfo; vObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vInfo; varying vec3 vObj;
        uniform float uWetLook, uWet, uFired, uSpeck, uRawRough, uGlazed, uDip, uThick, uInside, uGRough, uGCoat, uLRough, uLiner, uCrackle, uRuns, uCarbon, uHeight;
        uniform vec3 uRawWet, uRawFired, uSpeckCol, uThin, uThickCol, uLThin, uLThick;
        uniform vec2 uOpa, uLOpa, uHighlight;
        float gMask; float gRough; float gCoat; float gCoatRough;
        ${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float side = vInfo.x, yy = vInfo.y, pool = vInfo.z;
          vec3 p = vObj;
          float mott = fbm(p * 90.0);
          vec3 raw = mix(uRawWet, uRawFired, uFired) * (0.9 + 0.2 * mott);
          float spn = vnoise(p * 620.0), spw = max(0.035, fwidth(spn));
          float sp = smoothstep(0.865 - spw, 0.865 + spw, spn) * uSpeck;
          raw = mix(raw, uSpeckCol, sp * 0.85);
          // wet slip: darker, with streaks that drag round with the wheel
          float streak = vnoise(vec3(p.x * 55.0, p.y * 7.0, p.z * 55.0));
          raw *= mix(1.0, 0.8 + 0.22 * streak - 0.12 * uWet, uWetLook);
          gMask = 0.0;
          if (uGlazed > 0.5) {
            float drip = (fbm(vec3(p.x * 30.0, 0.0, p.z * 30.0)) - 0.5) * 0.014 + (vnoise(vec3(p.x * 90.0, 0.0, p.z * 90.0)) - 0.5) * 0.004;
            if (side < 0.5) gMask = 0.0;
            else if (side < 1.5) gMask = smoothstep(-0.0007, 0.0007, yy - (uHeight - uDip) - drip);   // dipped rim-first
            else if (side < 2.5) gMask = 1.0;
            else gMask = uInside;
          }
          bool liner = side > 2.5 && uLiner > 0.5;
          float th = clamp(pool + (uThick - 0.5) * 0.8 + (mott - 0.5) * 0.25, 0.0, 1.0);
          if (uRuns > 0.0) {
            // rivulets: streaks that run down the outside and gather towards the foot
            float riv = vnoise(vec3(p.x * 160.0, p.y * 7.0, p.z * 160.0)) * 0.65 + vnoise(vec3(p.x * 420.0, p.y * 18.0, p.z * 420.0)) * 0.35;
            th = clamp(th - 0.3 * uRuns + uRuns * (riv - 0.4) * 1.5 + uRuns * 0.2 * (1.0 - yy / max(uHeight, 0.01)) * step(side, 1.5), 0.0, 1.0);
          }
          vec3 thin = liner ? uLThin : uThin, thick = liner ? uLThick : uThickCol;
          vec2 opa = liner ? uLOpa : uOpa;
          // the thin colour only shows where it breaks over rims and ridges; pools go deeper
          vec3 gz = mix(thin, thick, smoothstep(0.08, 0.5, th));
          gz *= mix(1.0, 0.7, smoothstep(0.62, 1.0, th));
          gz = mix(raw, gz, mix(opa.x, opa.y, smoothstep(0.05, 0.6, th)));
          if (uCarbon > 0.0 && !liner) gz = mix(gz, vec3(0.16, 0.13, 0.12), smoothstep(0.86, 0.94, vnoise(p * 260.0)) * uCarbon * (1.0 - th));
          if (uCrackle > 0.0 && !liner) {
            // keep the crackle lines at least a pixel wide, so they read as lines instead of shimmer
            float ce = cellEdge(p * 210.0), cw = max(0.035, fwidth(ce) * 1.2);
            gz *= 1.0 - (1.0 - smoothstep(0.0, cw, ce)) * uCrackle * 0.4 * (0.035 / cw);
          }
          gz = mix(gz, uSpeckCol, sp * 0.5);
          diffuseColor.rgb = mix(raw, gz, gMask);
          gRough = mix(mix(uRawRough, 0.22 + 0.25 * (1.0 - uWet), uWetLook), liner ? uLRough : uGRough, gMask);
          gCoat = mix(uWetLook * uWet * 0.55, uGCoat, gMask);
          // the coat is the glaze's glassy skin: as smooth as the glaze, or it hazes every reflection
          gCoatRough = mix(0.2, max(0.03, (liner ? uLRough : uGRough) * 0.6), gMask);
          // a faint band showing where the tool is touching
          if (uHighlight.x > 0.0) diffuseColor.rgb += vec3(0.12, 0.09, 0.04) * exp(-pow((yy - uHighlight.x) / max(0.002, uHighlight.y), 2.0)) * step(0.5, side) * step(side, 3.5);
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gRough;')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.clearcoat *= gCoat;\nmaterial.clearcoatRoughness = clamp(gCoatRough, 0.0525, 1.0);');
  };
  mat.customProgramCacheKey = () => 'clay-v3';
  return { mat, u };
}

export function setBody(u, id) {
  const b = BODIES[id];
  u.uRawWet.value.set(b.wet);
  u.uRawFired.value.set(b.fired);
  u.uSpeck.value = b.speck;
  u.uSpeckCol.value.set(b.speckCol);
  u.uRawRough.value = b.rough;
}

export function setGlaze(u, id, { dip = 0.85, thick = 0.5, inside = 'same', height = 0.1 } = {}) {
  const g = GLAZES[id];
  u.uHeight.value = height;
  if (!g || g.none) { u.uGlazed.value = 0; return; }
  u.uGlazed.value = 1;
  u.uThin.value.set(g.thin); u.uThickCol.value.set(g.thick);
  u.uOpa.value.set(g.opaThin, g.opaThick);
  u.uGRough.value = g.rough; u.uGCoat.value = g.coat;
  u.uCrackle.value = g.crackle || 0; u.uRuns.value = g.runs || 0; u.uCarbon.value = g.carbon || 0;
  u.uDip.value = dip * height;
  u.uThick.value = thick;
  u.uInside.value = inside === 'bare' ? 0 : 1;
  u.uLiner.value = inside === 'liner' ? 1 : 0;
  u.uLThin.value.set(LINER.thin); u.uLThick.value.set(LINER.thick);
  u.uLOpa.value.set(LINER.opaThin, LINER.opaThick); u.uLRough.value = LINER.rough;
}
