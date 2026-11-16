# Portfolio site

Static site (HTML, CSS, vanilla JS, no build step) deployed on Vercel. `.vercelignore` is an
allowlist: only `index.html`, `styles.css`, `nav.js`, `fonts/`, `reels/` and `tinkering/` ship.
`.env.local` and `.vercel/` are local only, so don't touch them.

## Work log

This project is worked on from two Macs. `work-logs/` is the single running log for both, so
treat it as one continuous record.

- **Start of session:** if the working tree is clean, `git pull`. Then read the newest file or
  two in `work-logs/` (sorted by name, which is chronological) to see what the other machine
  did last, including its "Next steps".
- **One file per session**, named `YYYY-MM-DD-<first 8 chars of the session ID>.md`, dated
  the day the session started. Later in the same session, update that file instead of starting
  another one.
- **Format:** match the newest log. That means an `# Portfolio 2026 — <title>` heading, a
  Date / Session / Branch and commit / Written list, then Goals, Starting state, Work done,
  Challenges and how we solved them, Unsolved problems, Ending state and Next steps.
- **Two copies:** write the same file to `~/.claude/work-logs/` too, under the same name.
- **When to write:** when the user asks ("log it", "log our work"), when work ships, before
  compaction, and at wrap-up.
- **Commit and push:** commit the log with the work it describes. A log-only commit goes on
  the current branch with a message starting `Work log:`, and is pushed straight away so the
  other machine can pull it.

## Grid

The site's pages sit on a 12-column grid across the page column, defined in `matte-page.css` (`--grid-gutter`: 16px on
phones, 24px to 1099px, 32px with the rail). Anything laid out side by side starts and ends on its columns: a record's words
and picture (4 + 8, the picture in line with the second field), its fields and the footer (4 + 4 + 4), the Experiments cards, a reading page's text, the project sheet
(4 + 8), the design system's specimen grids. New layout follows it. Shift+G, or `?grid` in the address, shows
the columns (`nav.js`). The cover, the experiments themselves and the labs are full-window stages and sit outside it.

## Tuning labs

Every lab page uses the Matte system (`matte.css`) for its chrome and controls: keys, faders, fields, selects,
legends and panels. This holds for new labs and when a lab is reworked. A full-page lab loads Matte the way the Peek
Lab does; an experiment with its own layout loads it in a cascade layer through `tinkering/rig.css` (its header says
how). The stage or canvas a lab tunes is its own; Matte is the instrument around it.

Every control in a tuning lab that sets a number (a slider, fader, knob, stepper or drag handle) must also
take a typed value: a number field beside it, kept in step with it both ways. This holds for new labs and
for controls added to existing ones.

- A typed number inside the control's range takes effect as it is typed. Leaving the field, or Enter,
  tidies it: a value outside the range goes to the nearest end, and an empty field goes back to the
  current value.
- A typed value need not sit on the slider's step. Keep the number as typed; the slider shows the
  nearest position.
- Give the field an accessible name (the control's label plus ", typed" is the pattern in use).

The Split-Flap, Halftone, Button, Dissolve, Peek, Kaleidoscope and Domino labs all follow this.
