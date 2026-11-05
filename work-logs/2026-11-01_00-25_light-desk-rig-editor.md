---
date: "2026-11-01"
time: "00:25"
project: "Portfolio Site — Light desk (tinkering)"
working_directory: "/Users/bws/Desktop/Portfolio Site"
tags: ["prototype", "frontend", "ui", "interaction", "responsive", "component"]
milestone: true
---

# Light desk: rig editor, fixture groups and effect orders, then shipped

## Project Context
The Light desk is a concert light show playground in the portfolio's Tinkering section. Until now only the looks could be edited; the rig layout was hard-coded. This pass makes the rig itself something you design, and ships the whole project for the first time.

## Work Performed
- **Rig as data (`plot.js`, new)**:
  - A plot is trusses (straight, arc or ring; hung, tower or floor line) plus fixtures, each at a position 0–1 along its truss.
  - Coordinates are relative to the stage, so a rig moves between venues; arcs stay round.
  - `defaultPlot(def)` reproduces the previous hard-coded rig. Checked in Node: the same fixture counts at every venue (45 heads at the Bowl), and the front row's positions match the old formula.
  - Five templates (Chevron, Halo, Pods, Ladders, Empty); Pods, Halo and Ladders come with custom groups.
  - Helpers for mirroring, finding the nearest point along a truss, and resolving to metres.
  - Each fixture gets its side, its place in its group, and a position in five effect orders.
- **Rig (`rig.js`)**: `buildRig` now builds from the plot.
  - Truss segments follow lines and arcs, and pixel cells turn to follow their strip.
  - Empty fixture groups keep valid buffers.
- **Show engine (`show.js`, `data.js`)**:
  - New "Order" field on beams, washes, lasers, strobes and pixels: rig order, left to right, centre out, around, front to back, shuffled.
  - Each fixture reads its group's own settings laid over the type's.
  - Looks carry `groups` overrides through `fullLook`.
- **Rig editor (`rigedit.js`, new)**:
  - SVG plan of the stage from above: click a truss to select it, drag to move it, drag handles to reshape it.
  - Drag fixtures to slide them along their truss; drag across empty space to lasso-select.
  - Mirror editing, on by default, finds the matching truss or fixture on the other side.
  - Rig tab panel:
    - Templates and add-truss buttons (straight, arc, ring, towers, floor line).
    - Truss controls: trim height, rake, radius, sweep; hang N fixtures of a type, or run a pixel strip.
    - Duplicate, clear and delete.
    - Fixture selection: group assignment, make a group, select its truss, space evenly, delete.
    - Group list with rename and delete, and a budget meter (160 spots, 48 washes, 12 lasers, 48 strobes, 40 pixel strips).
- **App (`app.js`, `index.html`)**:
  - `prog.rig` is saved with each program, so undo, the session, versions and export all cover it.
  - The rig rebuilds without reloading the venue, at most every 50 ms while dragging.
  - A cancelled gesture reverts.
  - In rig mode the camera moves to a high rig view, with a view offset that centres the picture between the plan and the programmer.
  - Cue editor: group chips ("All beams", then each group); fields with their own setting are marked "own"; a "Match all" button clears them.
  - On phones the plan sits on top and the sheet below.
  - Notes, the Keys list and the gallery card text were updated.
- Fixed while testing: the venue's own rig generated new fixture ids on every read, so the first drag on an unedited rig threw. It is now made once per venue. Also fixed "1 pixels" in labels.
- Verified in headless Chrome (SwiftShader):
  - Truss select, move and mirrored tower drag; hanging 12 washes; lasso of 9 floor heads into a group; fixture slide and undo.
  - Group chip and a group-only "Circle" override in the cue editor.
  - All templates at Red Rocks and SoFi; a custom rig carried from Red Rocks to SoFi.
  - Reload restores the rig; the 390 px layout with tap to select.
  - All ten venues with their own rig.
  - The live site after deploy.
- Shipped: commit 2f46fb0 on main, pushed; Vercel production deploy Ready and serving the new files.

## Key Decisions
- Kept the show engine rig-agnostic: it reads side, group index and order positions per fixture, so every preset and saved program works on any rig.
- Aim and fan use the fixture's real position across the stage, not its place within its truss, so lights on the left point left in any layout. The house rig's aim spread therefore differs slightly from before (front row ±0.48 against ±0.5).
- The "Rig order" default keeps the old phase behaviour (out from the centre) and the old chase order, so the default show looks as it did.
- Each group runs its own chases. Applying a preset clears a cue's group settings, because a preset is a complete look.
- Rebuilding the rig at a throttled rate during drags was simpler than a position-only update path, and was fast enough here.

## Milestone
The rig editor works: rigs can be built, reshaped, grouped and versioned, and the Light desk is shipped to production.

## Next Steps
- Not tested on a real GPU or phone; rebuild cost during drags on slower devices is unknown.
- Heads on a tower can't be dragged in the plan (no vertical axis there); they're placed by hanging.
- Not yet built: focus points (step 4 of the plan) and layered effects.
