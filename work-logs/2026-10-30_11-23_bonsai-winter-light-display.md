---
date: "2026-10-30"
time: "11:23"
project: "Portfolio Site — Bonsai (tinkering)"
working_directory: "/Users/bws/Desktop/Portfolio Site"
tags: ["prototype", "frontend", "ui", "layout"]
milestone: false
---

# Bonsai: winter garden, 500-year lifespan, camera presets, Light and Display panels

## Project Context
The second pass on the Bonsai simulator in the portfolio's tinkering section. The user asked for a snowy setting, a far longer lifespan, camera presets, full control of the lighting, and a way to swap the container and stand mid-session.

## Work Performed
- Committed the first prototype as `2a5eb65`, then built this pass on top. This pass is uncommitted.
- **Winter garden setting.** A snowy forest HDRI (Poly Haven, CC0) behind a snowfield with half-buried, snow-capped boulders, plus falling snow. Through the cold months, snow settles on sky-facing bark, dusts evergreen sprays and drifts over the soil.
- **Five centuries of life.**
  - The age limit is now 500 years, with 25× and 100× speeds and timeline ticks that adapt (every 50 years at the 300-year mark).
  - To make that viable, potted-tree limits joined the growth model: a hydraulic limit (shoots far from the roots get less), self-thinning (the pot supports only so many leafy tips), consolidation of old bare internodes into smooth limbs, and trunk growth that slows logarithmically with age.
  - Worker snapshots thin out to every 5 years after year 20, then every 10 after a century.
  - 500 simulated years take 4–8 s in Node, and trees stay around 4,000–5,000 internodes.
- **Camera presets.** Front, side, back and top, on keys 1–4. Top frames the canopy's spread.
- **Tabbed side panel.**
  - Tree: inspector and care.
  - Display: camera presets, setting, container and stand.
  - Light: every light in the scene. Exposure and tone mapping; key light (on/off, intensity, colour, direction, height, shadows, softness, strength); new fill and rim lights; surroundings (ambient, rotation, background brightness and blur); contact shadows (on, strength, reach); leaf glow. Settings are kept per setting, with a reset and saved presets.
  - Look: lens, grade and breeze.
- **Stands are independent of the setting.** Nothing, walnut slab, rosewood table, jita board, stone slab, or burl slab with a natural edge. Each setting has a default stand and now provides only its surface. Stands are display-only and saved as a preference.
- **Container swap in Display** is recorded as a repot without root pruning, so rewinding restores the earlier pot.
- Smaller fixes: juniper foliage now ages out only behind newer growth; framing aims lower so the pot clears the timeline; near-camera snowflakes are clamped and faded.

## Key Decisions
- The light panel is display-only. The tree grows towards the setting's light, not the key light, so history stays deterministic.
- Changing container is an intervention on the timeline. Changing stand is not.

## Next Steps
- Commit this pass when the user is happy.
- Review on a real GPU. Under SwiftShader, CPU rasterization at full size starves the worker; small windows run normally.
- Some seeds still grow a leggy juniper with a bare lower trunk.
