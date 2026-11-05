---
date: "2026-10-30"
time: "18:30"
project: "Portfolio Site — Pottery wheel (tinkering)"
working_directory: "/Users/bws/Desktop/Portfolio Site"
tags: ["prototype", "frontend", "ui", "layout", "color"]
milestone: false
---

# Pottery wheel: built studio stages replace HDRI rooms; sharper viewer

## Project Context
Second pass on the pottery wheel tinkering project. The user found the HDRI rooms (photos projected onto a floor) distorted and the final viewer's glaze looking blurry.

## Work Performed
- Replaced the GroundedSkybox rooms with a built stage in `studio.js` (`buildStage`):
  - a floor and a curved cove wall all round
  - vertex-colour falloff with distance and height
  - fog matched to each setting
- One shadow-casting spotlight per setting shines through a canvas-drawn gobo (`goboTexture`): window panes (workshop), skylight (attic), dappled leaves that sway (veranda), a flickering glow that moves the shadows (fireside).
- Procedural floors per setting (`floorTexture`): concrete, pine planks, painted boards, dark planks.
- `data.js` SETTINGS rewritten to hold the stage data: floor, wall, fog, light position, lux, cone and gobo. The HDRIs are now used only for reflections and fill, and are never shown. Setup swatches and CREDITS.md updated.
- Removed the dust motes, which read as stars against the backdrop.
- Viewer sharpness, in `materials.js`:
  - The clear-coat roughness was fixed at 0.18, which put a hazy reflection over every glaze. It now follows each glaze's gloss.
  - Crackle and speckle are antialiased with fwidth, so they don't shimmer below a pixel.
- Viewer sharpness, in `pottery.js`:
  - Film grain is computed per screen pixel (gl_FragCoord), replacing a fixed 1000-cell grid, and is a little lighter.
  - Depth of field now focuses on the near face at the camera's target.
  - The Detail shot now comes from the front, so the backdrop's edge no longer shows.
- Gallery and window looks: rim lights moved further behind the piece and the gallery fill raised, closing a dark V where the key and rim shadow edges met.
- Verified in headless Chrome (SwiftShader): all four settings in close and wide shots, a full throw, glaze, fire and viewer (hero and detail), the view-to-throw round trip restoring fog, environment and gobo, and the setup and throw screens at 390 px. The console was clean apart from the favicon 404 and gesture-gated audio and vibrate warnings.

## Key Decisions
- Abstract stage over a modelled room: the light, not set dressing, carries the sense of place, and the clay stays the focus.
- Lights sit on the camera side at an angle, so the gobo patterns land on the floor and wall you actually see while throwing.

## Next Steps
- Check on a real GPU and a retina display, which is where the old blur would have shown most.
- Commit when the user is happy (still uncommitted).
