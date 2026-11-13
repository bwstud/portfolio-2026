# Design system research spike

Date: 2026-11-12. Status: findings and a proposed backlog. Nothing here is built yet.

## 1. Summary

- Top-tier systems are built in five layers: foundations, tokens, components, patterns and guidance. We have
  parts of the first three and almost none of the last two.
- The site design system (`tinkering/design-system/`) is strongest on type, colour roles, space and radius.
  Matte (`tinkering/matte-lab/`) is strongest on controls. Neither has interaction states, forms, overlays,
  feedback, layout rules, accessibility rules, content rules or motion tokens.
- Motion is the least systematic part of both. The site lists five durations and one curve with no tokens.
  Matte has about ten raw durations and four different overshoot curves.
- Section 5 is the backlog: 46 things to create, in three tiers. Section 6 is a full motion spec that could be
  adopted as written and then tuned in a lab.
- Decided since: it is one system, with shared foundations and Matte as its control and material layer, and
  Matte gets a light finish (section 8).

## 2. What I looked at

Read directly this session: IBM Carbon (component list, foundations, patterns, motion), Atlassian Design System
(component list, motion), GitHub Primer (component list, patterns), Microsoft Fluent 2 (motion tokens from the
`@fluentui/tokens` source), Adobe Spectrum 2 (motion principles), WCAG 2.2 (animation criteria).

From memory, not re-checked this session: Material 3, Shopify Polaris, Salesforce Lightning, Apple HIG and the
Spectrum component list. Their pages either render client-side or have moved, so I could not fetch them. Where
a number below comes from memory it is marked "unverified".

## 3. What top-tier systems contain

### 3.1 The five layers

| Layer | What it holds | Examples |
|---|---|---|
| Foundations | The rules everything else obeys | Colour, type, space, grid, elevation, shape, iconography, motion, accessibility, content |
| Tokens | Foundations as named values, in tiers | Raw value → role (semantic) → component |
| Components | Reusable parts with states and specs | Button, text field, dialog, table |
| Patterns | Parts combined to solve a recurring task | Forms, empty states, loading, filtering, notifications |
| Guidance | How to use and extend the system | Per-component do and don't, status labels, changelog, contribution rules |

### 3.2 Foundations found in most systems

| Foundation | Carbon | Atlassian | Primer | Typical contents |
|---|---|---|---|---|
| Colour | yes | yes | yes | Palette, roles, themes, contrast rules, status colours |
| Typography | yes | yes | yes | Type scale, styles, pairing rules, line length |
| Spacing and layout | yes (2x grid) | yes | yes | Space scale, grid, breakpoints, density |
| Elevation and layering | themes and layers | yes | yes | Surface levels, shadows, z-index order |
| Shape | in components | yes | yes | Radius scale, border widths |
| Iconography | yes, plus pictograms | yes | yes | Grid, stroke, sizes, naming |
| Motion | yes | yes | CSS utilities | Durations, easings, choreography, reduced motion |
| Accessibility | yes | yes | yes | Contrast, focus, keyboard, target size, screen reader text |
| Content | yes | yes | yes | Voice, capitalisation, labels, error messages |
| Data visualisation | yes | charts | yes | Chart colours, axes, legends |

### 3.3 Components, by how widely they appear

Present in Carbon, Atlassian and Primer alike (and, from memory, in Material, Polaris, Spectrum, Lightning and
Fluent):

- **Actions:** button, icon button, link, button group, menu button.
- **Selection:** checkbox, radio group, toggle switch, select or dropdown, segmented control (Carbon calls it
  content switcher), slider.
- **Text entry:** text field, text area, number input, search, date picker, form field wrapper (label, help
  text, error).
- **Navigation:** tabs, breadcrumb, pagination, navigation list or side nav, page header, app shell.
- **Overlays:** tooltip, popover, menu, modal dialog, drawer or side panel.
- **Feedback:** banner, inline message, toast (Atlassian calls it flag), progress bar, spinner, skeleton,
  empty state.
- **Data display:** table or data table, list, card or tile, tag, badge or status label, avatar, tree view,
  accordion or disclosure, code snippet.

Common but not universal: file uploader, timeline, stepper or progress tracker, command palette, inline edit,
token input, AI label.

### 3.4 Patterns

Carbon's pattern list is the fullest I read: common actions, dialogs, disabled states, disclosures, empty
states, filtering, forms, global header, loading, login, notifications, overflow content, read-only states,
search, status indicators, text toolbar. Primer adds degraded experiences, feature onboarding, progressive
disclosure, saving, and "scenario" patterns named after verbs: copy, create, customise, delete, edit, filter,
search, view.

### 3.5 What a component page contains

Across the systems the same sections recur: purpose, anatomy, variants, sizes, states, behaviour, content
rules, accessibility notes, do and don't, the tokens it uses, a status label and related components.

## 4. Where we stand

### 4.1 Site design system (`tinkering/design-system/`)

| Area | What exists | Status on the page |
|---|---|---|
| Colour | Palette (24 colours), theme roles, five section bands | Draft |
| Type | Ten text styles on `--text-*` tokens, three Söhne cuts | Draft |
| Shape and space | Seven radii, nine spacing steps, page column rule | Draft |
| Motion | Five durations listed (150, 200, 250, 280, 400ms); one curve used ten times, no tokens | Draft |
| Components | Nav button, controls menu, buttons, tags, card, split-flap board, project section and halftone, reel player, static spark | Two settled, seven draft |
| Process | Lab → settle → token → document; Settled and Draft labels; an open issues list | In use |

### 4.2 Matte (`tinkering/matte-lab/`)

| Area | What exists |
|---|---|
| Surface tokens | Ten colours derived from one tone value, three metal greys, an accent, three radii, a drop shadow |
| Heights | Well, body, key, knob |
| Type | Maker's mark, legend in three weights, lit display type |
| Controls | Knob (three sizes, two finishes), slide switch, rocker switch, push switch, key (plain, latching, accent), pad, fader, lamp |
| Read-outs | Display, meter in five forms |
| Assemblies | Tuner, channel strip |
| Tooling | Tuning bar for accent, tone, speckle, corner and backdrop |

### 4.3 Gap against the inventory

| Layer | Item | Site system | Matte | Gap |
|---|---|---|---|---|
| Foundations | Colour roles and themes | Draft | Dark only; light is a backdrop, not a theme | Status colours; a decision on a light Matte |
| | Type scale | Draft, with near-duplicate sizes | Three styles | One shared scale; a minimum size rule |
| | Space scale | Draft | None; paddings are written by hand | Matte should use the site scale |
| | Grid and breakpoints | Page column only | None | Breakpoints, panel grid, density |
| | Elevation and layering | None | Four heights, undocumented as tokens | Shadow tokens, z-index order |
| | Shape | Radius scale | Three radii | Merge; add border and seam rules |
| | Iconography | Lucide icons used ad hoc | Two chevrons | Icon set, sizes, stroke |
| | Motion | Five durations, no tokens | Raw values | Section 6 |
| | Accessibility | None written | None written | Focus, contrast, target size, keyboard |
| | Content | None written | Implicit (capitals, short) | Legend and label rules, voice |
| Tokens | Tiers | Palette → roles; component tokens for nav buttons | Raw → derived | Naming convention across both |
| Components | Actions | Nav button, buttons | Key, pad | States; link; icon button |
| | Selection | None | Switches, pads | Radio group, select, segmented control |
| | Text entry | None | None | The whole family |
| | Navigation | Nav, controls menu | None | Tabs, breadcrumb, pagination |
| | Overlays | Dropdown menu | None | Tooltip, popover, dialog, drawer |
| | Feedback | None | Lamp, meters | Banner, toast, progress, loading, empty state |
| | Data display | Card, tags | Display | Table, list, badge |
| Patterns | All | None | Two assemblies | Forms, loading, empty, notifications, disabled |
| Guidance | Component pages | Short notes per part | Class name only | A page template (section 7) |
| | Status and change log | Settled and Draft labels | None | Extend the labels to Matte |

## 5. Backlog: what to create

Each line is one thing to design, try in a lab, then document. Tier 1 makes the system usable for a real
screen. Tier 2 makes it complete. Tier 3 is depth.

### Tier 1: foundations and rules (do first)

Status, 2026-11-12: first versions of all twelve are in. Motion tokens and a 16px radius are in `styles.css`;
Matte reads the site's space, radius, type and motion tokens; states, focus, layers, status colours (checked
for contrast) and a compact density are in `matte.css`; the written rules are the last section of the lab.
Not done: the site's own older transitions still use their own values, and legend size is still undecided.

1. **Token naming.** One convention for raw, role and component tokens across the site system and Matte.
2. **Interaction states.** Rest, hover, focus, pressed, selected, disabled, read-only and error, defined once
   and applied to every control. Matte has rest, pressed and selected only.
3. **Focus indicator.** One ring: colour, width, offset, and how it sits on a raised part and in a well.
4. **Motion tokens and rules.** Section 6.
5. **Elevation.** Name the four Matte heights as tokens with their shadows, and add a z-index order for
   overlays.
6. **Space and density.** Put Matte on the site's spacing scale; define cell padding, control gaps and a
   compact density.
7. **Type scale, merged.** One scale for both, with a minimum legend size. Legends are 9 to 10px today, which
   is below what most systems allow for text people must read.
8. **Status colours.** Success, warning, danger and info, as lamp colours and as text colours, each checked
   for contrast.
9. **Accessibility rules.** Contrast minimums, target size (the small push switch is 30px), keyboard behaviour
   per control, and screen reader names for controls that carry no visible text.
10. **Content rules.** Legend wording, capitalisation, units, number formatting, and when a control needs a
    legend at all.
11. **Layout grid.** Breakpoints, panel widths, how cells and seams reflow on a phone.
12. **Iconography.** Pick a set, a stroke weight and sizes; define when an icon replaces a legend.

### Tier 2: components that are missing

Status, 2026-11-12: all 27 have a first version in `tinkering/matte-lab/` (sections 04 to 09 of the lab), in
both finishes. They are drafts: none has states beyond those shown, a written page, or motion tokens yet.

13. **Text field.** A recessed well with a cursor: label, help text, error, disabled.
14. **Text area.**
15. **Number input.** Display plus step keys; the tuner already does this informally.
16. **Search field.**
17. **Form field wrapper.** Label, help and error layout shared by every input.
18. **Radio group.** An interlocked bank of push switches, where pressing one releases the others.
19. **Checkbox.** A latching key or pad with a lamp; define which.
20. **Select.** A rotary selector with detents and printed positions, plus a menu form for long lists.
21. **Segmented control.** A row of joined keys.
22. **Stepper knob.** A knob that clicks between fixed values.
23. **Button hierarchy.** Primary, secondary and quiet keys, plus a destructive key.
24. **Link.** How text links look on a body and on the page.
25. **Tabs.** Source-selector keys or a printed strip.
26. **Menu.** The site's dropdown, restyled as a module.
27. **Tooltip.** A printed callout.
28. **Popover.**
29. **Dialog.** A module that sits above the bench, with a scrim.
30. **Drawer or side panel.**
31. **Toast.** A short message on a display strip.
32. **Banner and inline message.**
33. **Progress bar.** The meter, driven by a task.
34. **Loading indicator.** A lamp blink or needle sweep; and a skeleton for content.
35. **Badge and tag.** A printed label and a lit one.
36. **Card or module.** A panel that holds content, not controls.
37. **Table.** Rows as a ruled panel with a display-type header.
38. **List.**
39. **Empty state.**

### Tier 3: patterns and guidance

40. **Forms pattern.** Layout, validation timing, error summary.
41. **Loading pattern.** When to use lamp, meter, skeleton or nothing.
42. **Notifications pattern.** Which of lamp, toast, banner and dialog fits which severity.
43. **Disabled and read-only pattern.**
44. **Assembly rules.** How to compose a faceplate: one accent per assembly, seam placement, legend placement,
    how many control types can share a panel.
45. **Component page template.** Section 7, applied to every existing part.
46. **Status, change log and versions.** Extend Settled and Draft to Matte; record what changed and when.

## 6. Motion: rules and specs

### 6.1 What the reference systems do

| System | Durations | Easing | Notable rule |
|---|---|---|---|
| Carbon | 70, 110, 150, 240, 400, 700ms | Standard, entrance and exit curves, each in a productive and an expressive form | Longer for larger distance or size; expressive motion only for rare, important moments |
| Atlassian | 0, 50, 100, 150, 200, 250, 400, 600ms | Ease-out for entrances, ease-in for exits, ease-in-out for moves in place | Exits are 50 to 100ms shorter than entrances; open from the trigger; one or two properties per transition |
| Fluent 2 | 50, 100, 150, 200, 250, 300, 400, 500ms | Accelerate, decelerate and easy-ease families, each in three strengths | Named tokens for every step |
| Material 3 | 50ms to 1000ms in sixteen steps (unverified) | Standard and emphasised sets (unverified) | Newer versions add spring tokens |
| Spectrum 2 | Not published on the page I read | Not published there | Motion over large areas must honour reduced-motion settings |

The six-to-eight-step scale, ease-out in and ease-in out, shorter exits, and transform and opacity only are
common to all of them.

### 6.2 What we use today

- **Site:** 150ms hover, 200ms card lift, 250ms overlay fade, 280ms spark, 400ms thumbnail zoom, 520 to 600ms
  cover entrances. One curve, `cubic-bezier(0.23, 1, 0.32, 1)`, used ten times.
- **Matte:** 60, 90, 110, 120, 130, 150, 170, 200 and 220ms. Four overshoot curves that differ only in how far
  they overshoot (1.3, 1.3, 1.4, 1.6).

Both sets are close to a coherent scale already. They need naming and trimming, not a rethink.

### 6.3 Proposed tokens

Durations:

| Token | Value | Use | Replaces |
|---|---|---|---|
| `--dur-0` | 0ms | Focus ring, error text, anything a person is waiting on | |
| `--dur-1` | 60ms | A part going down under a finger; meter segments | 60, 90 |
| `--dur-2` | 110ms | A part coming back up; hover colour; lamp on | 110, 120, 130, 150 (site hover) |
| `--dur-3` | 160ms | Short mechanical travel: rocker, push latch, needle | 150, 170 |
| `--dur-4` | 220ms | Long mechanical travel: slide switch; card lift; menus and popovers entering | 200, 220, 250 |
| `--dur-5` | 320ms | Dialogs, drawers and panels entering | 280 |
| `--dur-6` | 520ms | Page-level and cover entrances | 400, 520, 600 |

Easings:

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Anything entering or responding; the default. Already the site's curve |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | Anything leaving |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Something moving or resizing while staying on screen |
| `--ease-detent` | `cubic-bezier(0.34, 1.3, 0.64, 1)` | A physical part settling into its stop. Replaces all four overshoot curves |
| `--ease-linear` | `linear` | Continuous read-outs: meters, progress, anything tracking a value |

The `--ease-in` and `--ease-in-out` values are my proposals and should be tuned by eye in a lab. The other two
are already in use.

### 6.4 Rules

1. **Motion shows the mechanism.** A part moves only the way the real part would: a thumb slides along its
   slot, a rocker tips on its pivot, a key sinks. Matter moves; light fades. A lamp never slides and a switch
   never fades.
2. **Hands are never eased.** Anything being dragged or turned (knob, fader) follows the pointer exactly, with
   no transition.
3. **Down fast, up slower.** Pressing uses `--dur-1`; releasing uses `--dur-2`.
4. **In slower than out.** An exit uses one step shorter than its entrance, with `--ease-in`.
5. **Duration follows distance.** Up to 8px of travel: `--dur-1` or `--dur-2`. 8 to 40px: `--dur-3` or
   `--dur-4`. 40 to 200px: `--dur-5`. Viewport-scale: `--dur-6`.
6. **Frequency shortens.** The more often something happens in a session, the shorter it runs. Hover is
   `--dur-2` at most.
7. **Overshoot is for parts with a stop.** `--ease-detent` applies to switches, keys and needles. Never to
   overlays, text or page content.
8. **Two properties at most.** Animate `transform` and `opacity`. Colour and shadow are allowed on small parts.
   Never animate width, height or position properties.
9. **Open from the trigger.** A menu, popover or dialog grows from the control that opened it and leaves the
   way it came.
10. **Stagger sparingly.** 30 to 70ms between items, and the whole sequence done inside `--dur-6`. The cover's
    70ms per word is the upper end.
11. **Feedback is never gated.** Focus rings and errors appear at `--dur-0`. Focus moves, and screen reader
    announcements fire, at the start of a transition, not the end.
12. **Light has attack and decay.** A lamp or display comes on in `--dur-1` and goes off in `--dur-4`, like a
    filament or phosphor. Meter segments rise instantly and fall at a fixed rate. Peak hold is 900ms.
13. **Sound follows motion.** A sound fires at the start of the movement it belongs to, never after it.
14. **Reduced motion.** When the visitor asks for less motion: travel becomes an instant state change, fades
    stay but run at `--dur-2` or less, staggering is removed, and anything that moves by itself (the meter
    signal, the plate drifting on the cover) holds still. WCAG 2.2.2 additionally requires a pause control for
    anything that starts moving unprompted and runs longer than five seconds.

### 6.5 Spec per part

| Part | What moves | Duration | Easing | Reduced motion |
|---|---|---|---|---|
| Key, pad | Sinks 2px; shadow shortens | Down `--dur-1`, up `--dur-2` | `--ease-out` | Instant |
| Push switch | Cap drops into collar; 1px over-travel while held | `--dur-3` | `--ease-detent` | Instant |
| Rocker switch | Paddle tips 26° about its centre; faces cross-fade | Tip `--dur-3`, fade `--dur-2` | `--ease-detent`, fade linear | Instant |
| Slide switch | Thumb travels 28px | `--dur-4` | `--ease-detent` | Instant |
| Knob, fader | Follows the pointer | None | None | Unchanged |
| Knob stepping by key | Grip turns to the new value | `--dur-2` | `--ease-out` | Instant |
| Lamp | Colour and glow | On `--dur-1`, off `--dur-4` | linear | On and off `--dur-2` |
| Meter segments | Light and unlight | `--dur-1` | linear | Unchanged if driven by real data |
| Needle | Rotates about its pivot | `--dur-3` | `--ease-detent` | Instant |
| Display digits | Digits roll | `--dur-4` | `--ease-out` | Swap without rolling |
| Hover on any control | Legend or icon colour | `--dur-2` | `--ease-out` | Unchanged |
| Tooltip | Fades in after 400ms rest; fades out | In `--dur-2`, out `--dur-1` | `--ease-out`, `--ease-in` | Unchanged |
| Menu, popover | Fade plus 4px rise from the trigger | In `--dur-4`, out `--dur-3` | `--ease-out`, `--ease-in` | Fade only |
| Dialog | Fade plus scale from 96%; scrim fades | In `--dur-5`, out `--dur-4` | `--ease-out`, `--ease-in` | Fade only |
| Drawer | Slides in from its edge | In `--dur-5`, out `--dur-4` | `--ease-out`, `--ease-in` | Fade only |
| Toast | Slides 8px and fades; holds 5s | In `--dur-4`, out `--dur-3` | `--ease-out`, `--ease-in` | Fade only |
| Card | Lifts; border lightens | `--dur-4` | `--ease-out` | Border only |
| Panel entering a page | Fade plus 8px rise | `--dur-6` | `--ease-out` | Fade only |
| Cover headline | Words rise 0.18em, unblur and fade, 70ms apart | `--dur-6` each | `--ease-out` | All words shown at once |

The tooltip, menu, dialog, drawer and toast rows describe parts that do not exist yet; their numbers follow
the rules above and Atlassian's enter and exit pairs.

## 7. Component page template

Use the same headings for every part, so gaps are obvious:

1. **Purpose.** One sentence, and what to use instead when it does not fit.
2. **Anatomy.** Named pieces and which are optional.
3. **Variants and sizes.**
4. **States.** Rest, hover, focus, pressed, selected, disabled, read-only, error.
5. **Behaviour.** Pointer, touch, keyboard and wheel.
6. **Motion.** The row from 6.5.
7. **Content.** Legend rules, length limits, units.
8. **Accessibility.** Role, name, keyboard map, contrast, target size.
9. **Tokens.** Every token the part reads.
10. **Do and don't.** Two or three pairs.
11. **Status.** Draft or Settled, with the date it last changed.

## 8. Decisions

Decided on 2026-11-12:

1. **One system.** The site system owns type, space, radius, motion and the process. Matte is its control and
   material layer and stops defining its own versions of those.
2. **A light Matte.** Added as a second finish. It follows the site's light theme, or is forced with
   `.matte--light`. Status colours (backlog item 8) must now be chosen for both finishes.

Still open:

3. **Minimum text size.** Legends at 9 to 10px are true to the hardware and hard to read. A floor of 11px
   keeps most of the look.
4. **How literal the metaphor stays.** A text field or a table has no obvious hardware equivalent. Decide
   whether such parts imitate hardware (a display with a cursor) or sit plainly on a panel.
5. **Where the system is documented.** Extend the existing Design System page, or give Matte its own
   catalogue page built from the lab.

## Sources

- IBM Carbon: components overview, motion overview (carbondesignsystem.com)
- Atlassian Design System: components, applying motion (atlassian.design)
- GitHub Primer: product components and patterns (primer.style)
- Microsoft Fluent UI tokens: `durations.ts`, `curves.ts` (github.com/microsoft/fluentui)
- Adobe Spectrum 2: motion (spectrum.adobe.com)
- W3C: Understanding SC 2.3.3 Animation from Interactions (w3.org/WAI/WCAG22)
