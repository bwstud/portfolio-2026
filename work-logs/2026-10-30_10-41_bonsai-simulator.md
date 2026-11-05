---
date: "2026-10-30"
time: "10:41"
project: "Portfolio Site — Bonsai (tinkering)"
working_directory: "/Users/bws/Desktop/Portfolio Site"
tags: ["prototype", "frontend", "ui", "animation", "layout"]
milestone: true
---

# Built a first working prototype of the Bonsai simulator

## Project Context
A new experiment in the portfolio site's tinkering section. You raise a bonsai from a nursery starter, shape it with real bonsai techniques, rewind time and try other choices. Beauty and believable growth were the brief.

## Work Performed
- Built a deterministic growth model (`tinkering/bonsai/sim.js`) based on Palubicki et al.'s self-organizing tree model. Buds compete for light in a voxel shade grid. Growth is allocated by Borchert–Honda with apical dominance and acrotony. Branches thicken by the pipe model and never shrink.
- The model includes seasonal flushes, spur shoots, leaf colour and drop, bud ageing and latency, shedding, dieback, a nursery trunk chop, roots and pot capacity, feeding and stress.
- Defined three species by parameters alone (`species.js`): Japanese maple, Chinese elm and Chinese juniper. Juniper doesn't back-bud on bare wood; elm buds back almost anywhere.
- Implemented interventions as graph edits that the model responds to:
  - cut, with back-budding and leader takeover
  - pinch
  - defoliate, with a second flush of smaller leaves
  - wire, which sets over time, springs back if removed early and bites in as the branch thickens
  - guy wire and jin deadwood
  - feeding, turning the pot (the light comes from the setting, so the tree leans), repotting with root pruning, and moving to another setting
- Built time travel in a Web Worker (`worker.js`): yearly snapshots plus replay. Acting with later interventions on the branch forks a new timeline branch, and undo works within a step. Projects autosave to localStorage.
- Wrote a geometry builder (`build.js`). It produces bark tubes with a flared, lobed trunk base, branch collars, cut caps and per-vertex maturity, deadwood and scar data. It also builds instanced leaf cards with seasonal colour, and wire coils that stay at the original radius so they visibly bite in. Nodes are numbered depth-first with the main child first, so subtree and axis highlights are single ranges.
- Rendering (`bonsai.js`):
  - three.js 0.170 with AgX tone mapping and Poly Haven HDRIs and textures (CC0)
  - its own multisampled scene target, whose depth feeds GTAO and a custom depth-of-field pass, plus a vignette and grain grade
  - a bark shader for the young-to-mature transition, deadwood and the wire-scar groove
  - leaf shader translucency and wind
  - GPU picking over a 9×9 patch
- Containers (`pots.js`): superellipse lathe sweeps covering round, oval and rounded-rectangle shapes, with procedurally painted namako, clay, celadon-crackle and tenmoku glazes. Soil is painted akadama with moss cushions. Leaf textures are procedural (`leaves.js`).
- Built the UI (`index.html`):
  - a setup panel for species, container and setting, with a live preview
  - a left toolbar with keyboard shortcuts, contextual tool hints and hover previews (cut tints red, wire copper)
  - an inspector with age, thickness, light and wire set or bite
  - care controls
  - a timeline with season bands, intervention markers and a branch selector
  - a lil-gui "Look" panel with a line of explanation under each control, plus saved looks through the shared `versions.js`
  - sentence case throughout, no uppercase
- Stubbed portrait generation in `portrait.js` (capture plus depth pass, prompt builder, request to `/api/portrait`). It isn't surfaced in the UI; `?portrait` exposes it in the console.
- Added the tinkering index card, `thumb.jpg` and `assets/CREDITS.md`.

## Key Decisions
- The growth model is the priority. It was tuned in Node with line drawings before any rendering. The main lessons:
  - Shade must scale with leaf area and be capped.
  - Old-wood buds must be latent, or the budget spreads too thin.
  - Acrotony is needed to get long leaders that pinching can work on.
  - Shedding must measure light per leafy tip, not per internode.
- Randomness comes from hashing seed, node and purpose, so replay is exact and edits don't reshuffle the rest of the tree.
- The image generator is held back at the user's request.
- Desktop-first. The tree is forgiving: it weakens under heavy work but doesn't die. A run lasts about 45 simulated years.

## Milestone
First end-to-end prototype. Growth, all tools, rewind and forking, and the three species, pots and settings were verified through scripted real mouse input in headless Chrome, and determinism and undo through Node tests.

## Next Steps
- Review it on a real GPU; tests ran on SwiftShader. Also check playback speed and the defaults for depth of field and AO.
- Tune unpruned maple and elm, which get leggy, and the shape of the starter.
- Smooth the remaining small fork seams.
- Commit and deploy when the user is ready.
- Optionally: a framing overlay and a portrait backend.
