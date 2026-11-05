---
date: "2026-11-01"
time: "18:00"
project: "Portfolio Site — Chladni plate (tinkering)"
working_directory: "/Users/bws/Desktop/Portfolio Site"
tags: ["prototype", "frontend", "ui", "interaction", "animation", "responsive", "component", "color"]
milestone: true
---

# Chladni plate: fifteen materials and four plates

## Project Context
This builds on the first version of the Chladni plate experiment (a sand-covered plate with a toggle and a frequency knob). The goal was a broad set of visual effects from the same setup: solids, liquids, particles, glass, metal and fire.

## Work Performed
- **Physics (`plate.js`)**:
  - The grain simulation now takes per-material settings: lift threshold, kick, drift, damping, cooling, alignment and collision radius.
  - Grains gained a heat value (recent motion, for materials that glow) and an angle. Long grains turn to lie along the node lines.
  - Solid objects push each other apart through a neighbour grid, so they form single-layer bands.
  - The field now exposes its in-phase and quarter-phase parts and a version counter. Node renders checked the iron, bearings, beads and rice behaviour.
- **Registry (`media.js`)**: 15 materials in four groups, 4 plates and 3 amounts, each with a swatch, a one-line description and settings for the noise under the tone.
- **Grains (`grains.js`)**: one points shader with seven styles:
  - Sand.
  - Salt: rotated cubes with view-dependent glints.
  - Iron filings: needles oriented in screen space.
  - Glitter: holographic flakes that flash with view angle and tumbling.
  - Pigment: four colours poured in quarters that the figures stir together.
  - Glow powder: phosphor that lights up with motion and fades.
  - Embers: flaring coals plus a pool of 260 sparks thrown off hopping grains.
  - Every grain falls in from above when poured, at its own moment.
- **Solids (`solids.js`)**: instanced meshes.
  - Chrome ball bearings.
  - Sea-glass beads with transmission, attenuation and slight iridescence.
  - Rice capsules that yaw to the node lines and tumble when they hop.
- **Liquids (`liquid.js`)**: a 260-segment surface (360 for ferrofluid) in a dark anodised tray, with a patched MeshPhysicalMaterial.
  - The vertex shader displaces the surface by the plate's standing wave, read from a half-float field texture and slowed to about 1 Hz so it's visible.
  - Normals come from finite differences.
  - Water (transmissive, teal attenuation), mercury (a mirror), ferrofluid (sharp hexagonal cones that rise where the plate shakes) and lava (an emissive crust whose cracks and antinodes glow, plus a warm point light).
- **Fire (`fire.js`)**:
  - A 27 × 27 flame table: 725 jets drawn as camera-facing billboards with a procedural flame shader (blue base, orange body, white core, flicker).
  - Heights follow the local vibration with smoothing, and the jets relight from the centre outwards.
  - Drilled holes with soot rings; a warm light that follows the mean flame height.
- **Plates (`app.js`)**:
  - Brushed steel, brushed brass, black glass (clearcoat) and a light table: frosted transmissive glass over a warm panel, with grains drawn as silhouettes.
- **Lighting (`app.js`)**:
  - A second, striped studio of 13 strip lights for liquids, which is what makes their figures readable.
  - A pale floor in the reflections, for chrome and glass.
  - A key light from the camera side, whose reflection off the plate points away from the viewer.
  - Glow powder, embers, lava and flames dim the studio so their light carries.
- **UI (`index.html`, `app.js`)**:
  - A right-hand material panel with swatch grids by group, a description, an amount control (labelled Depth for liquids and Gas for fire) and plate swatches.
  - On phones it's a sheet opened from a header chip showing the current material, and it closes on a pick.
  - Choices persist in localStorage. "Pour again" becomes "Refill" or "Relight". The notes were updated, and the phone header was fixed so it no longer wraps.
- **Sound**: the noise under the tone changes per material: a hiss for sand, a rattle for steel balls, a low roar from the flame table that follows the flames.
- **Verified in headless Chrome (SwiftShader)**:
  - Captures of all 15 materials, and of the plates with several materials.
  - A sweep of every material on every plate with no console errors.
  - The amount control (26,400 / 48,000 / 76,800 grains for sand); the phone sheet open, pick and close; no horizontal overflow at 390 px.

## Key Decisions
- One field drives every material, and each renderer reads it in its own way. Grains and solids use the CPU simulation, liquids a texture in the vertex shader, and fire CPU samples per jet. Every material shows the same resonance.
- Liquids needed structured reflections. Under a single softbox the wave was invisible; strip lights make the figure read strongly.
- I removed a key light from behind because it blew out the plate. The light now comes from the camera side.
- Ferrofluid uses a magnet-under-the-plate premise, and liquid waves are shown slowed down; the notes say so.

## Milestone
The Chladni plate now has 15 materials and 4 plates (60 combinations), each with its own look and sound. Ready for review, and shipped (see below).

## Next Steps
- Not yet seen on a real GPU or phone, and not yet heard. Transmission (beads, water, light table) and 76k-grain "Lots" are the likely costs.
- Possible additions: an automatic sweep, mixing two materials, a slow-motion/strobe control for liquids, a circular plate, and refreshed gallery thumbnails.

## Shipped
- Commit 30d72a9 "Add Chladni plate tinkering project" pushed to main. The Vercel production deploy is serving it: every page file matches its local size byte for byte, and the gallery has the Chladni card.
- Live smoke test at https://portfolio-2026-three-ochre.vercel.app/tinkering/chladni/: the page booted, showed 15 material and 4 plate swatches, switched to mercury and reached "Resonance (4, 2)". The only console errors were the site-wide favicon 404.
