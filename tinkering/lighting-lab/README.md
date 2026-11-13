# Lighting lab

A playground for learning how light works in 3D scenes, from the inverse-square law to path
tracing, with a link to Blender. Ten lessons; each has an explanation, a live scene with controls,
things to try, self-check questions and questions to bring to Claude.

Run it with the dev server from the repo root:

```
npm run dev
```

then open http://127.0.0.1:8080/tinkering/lighting-lab/. Add `?debug` to expose `window.__lab`.

## The course

| # | Lesson | What it teaches |
|---|---|---|
| 0 | Start here | The rendering equation; raster vs path tracing; the five ingredients of photorealism |
| 1 | Light and distance | Inverse-square law, cosine law, candela, lux and nits, false-colour illuminance |
| 2 | Surfaces | Diffuse vs specular, roughness, metalness, Fresnel, energy conservation |
| 3 | Shadows | Shadow maps, bias, acne, peter-panning, resolution, PCF and VSM, penumbrae |
| 4 | Exposure and tone | HDR radiance, exposure in EV, tone mapping operators, sRGB encoding, false-colour stops |
| 5 | Light from everywhere | HDRIs, image-based lighting, PMREM, missing occlusion, finding the sun |
| 6 | Bounce light | Global illumination in a Cornell box, raster cheats vs path traced bounces |
| 7 | Write a path tracer | A whole path tracer in one readable GLSL shader: Monte Carlo, NEE, glass, Russian roulette |
| 8 | Photoreal | three-gpu-pathtracer on a still life, depth of field, raster vs path traced split |
| 9 | Bring in Blender | glTF import, live link, comparing against a Cycles render |

## Blender

Blender isn't bundled. Install it from blender.org, then:

- **Ground truth:** `/Applications/Blender.app/Contents/MacOS/Blender -b -P tools/blender/cornell.py`
  builds lesson 6's Cornell box, renders it with Cycles to `reference/cornell-cycles.png` and
  exports `scenes/cornell.glb`. Lesson 9 loads both.
- **Live link:** open `tools/blender/live_link.py` in Blender's Scripting workspace and run it.
  Every save exports to `scenes/live.glb`; lesson 9 reloads it when "Live link" is on. Needs the
  dev server, which sends `Last-Modified` for the polling.

## Known issue

In headless Chrome on an Apple M5 (ANGLE on Metal), three-gpu-pathtracer renders solid glass
(`transmission` with `thickness` > 0) black in lesson 8. The same page renders it correctly
under Chrome's software renderer (SwiftShader), and thin-walled glass (`thickness: 0`) works.
It happens with 0.0.23 and 0.0.27. Lesson 8 has a "Glass" switch so the lesson stays usable.
Lesson 7's own shader handles glass correctly on the same GPU.

## Credits

- HDRIs from [Poly Haven](https://polyhaven.com) (CC0): Small Studio 09, Kloofendal 48d Partly
  Cloudy (Pure Sky), Lebombo.
- [three.js](https://threejs.org) 0.186 and [three-gpu-pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer)
  0.0.27 with three-mesh-bvh 0.9.16, from jsDelivr.
- Tone-mapping operators ported from three.js's own shader chunk (ACES fit by Stephen Hill, AgX
  after Filament and Blender, Khronos PBR Neutral).
- Turbo colormap polynomial by Anton Mikhailov (Google).
