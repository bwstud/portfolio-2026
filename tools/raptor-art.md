# Raptor Run art

The page uses painted cut-outs, the way the koi page does: each creature is one painting seen from
straight above, bent along a moving spine. Generate the paintings, drop them in
`tinkering/raptor-run/source/` (local only, never committed or deployed), then run:

```
python3 tools/raptor-art.py
```

It keys out the plain background, cleans the edge, crops, and writes `tinkering/raptor-run/art/*.webp`
and `art/manifest.json`, which are what ship. Anything you haven't made yet falls back to the
code-sculpted version, so you can add images a few at a time.

## Getting good results

- **Straight down.** The camera must look straight down from directly above, like a drone over
  the animal, not a three-quarter view. The generator drifts toward side views; reject those.
- **Plain white background, no shadow.** The page draws its own shadows from the sun. A painted
  shadow under the figure would be cut out with the figure.
- **Straight body.** The page bends the spine itself, so the painting should lie in a straight
  line: raptors head to the right, tail to the left; runners heading to the right.
- **One style for all.** Paste the same style line at the end of every prompt, so the set looks
  painted by one hand. Generate several and keep the best of each.
- **Size.** Raptors at least 2048 px wide in a wide 2:1 frame; people at least 1024 px square.
- **Names.** `raptor-<coat>.png` and `person-<role>.png`, using the names below.

## The style line (end every prompt with this)

> Photorealistic painted illustration in the manner of a natural history plate, extremely detailed,
> rich subtle colour, soft even daylight from the upper left, crisp edges. Isolated on a plain pure
> white background. No shadow, no ground, no text, no border. The whole figure in frame with a
> small margin.

## Raptors

The classic scaly kind, without feathers: a boxy skull, heavy jaw muscles, pebbly reptile scales,
deep folds of skin on the neck, a long stiff tail. Each coat is this page's own; don't ask for any
film's dinosaur by name.

Base prompt:

> A featherless velociraptor seen from directly above, a top-down orthographic view looking straight
> down at its back. Its body lies in a perfectly straight horizontal line, head pointing right, the
> long stiff tail pointing straight left. It is mid-sprint, with its arms folded under its chest and
> its legs tucked beneath the body, so only the toe claws show at its sides. A boxy, heavy skull,
> pebbly reptile scales larger along the spine and fine on the head and flanks, deep folds of skin
> along the neck, a slight ridge down the spine, glossy amber eyes set under heavy brows. [COAT]
> Wide 2:1 frame. [STYLE LINE]

Coats (replace `[COAT]`, and save as the name shown):

| File | Coat |
|---|---|
| `raptor-tawny.png` | Warm tawny-brown skin, darker along the back, broken dark brown tiger stripes across the back and tail, a cream lip line. |
| `raptor-rust.png` | Rust-orange skin with near-black tiger stripes, darker on the back, paler orange on the flanks. |
| `raptor-slate.png` | Slate grey skin with a faint blue-green sheen, thin black stripes across the back and tail, a pale grey throat. |
| `raptor-bone.png` | Pale bone-cream skin with bold black tiger stripes and a darker grey-brown back. |

## People

Base prompt:

> A [ROLE] seen from directly above, a top-down view looking straight down on the top of their head
> and shoulders, running hard toward the right of the frame, mid-stride: one arm swung forward and
> the other back, one leg reaching forward and the other pushing off behind. Seen from overhead, the
> head and shoulders are the largest part; the arms and legs are foreshortened. Square frame.
> [STYLE LINE]

Roles (replace `[ROLE]`, and save as the name shown):

| File | Role |
|---|---|
| `person-ranger.png` | park ranger in a khaki shirt and a wide-brimmed ranger hat |
| `person-scientist.png` | scientist in a white lab coat over a blue shirt, coat tails flying |
| `person-tourist.png` | tourist in a loud floral shirt and khaki shorts, a baseball cap and a backpack |
| `person-jogger.png` | jogger in a bright running vest and black shorts, hair in a ponytail |
| `person-builder.png` | construction worker in a yellow hard hat and a hi-vis vest with silver bands |
| `person-suit.png` | person in a dark business suit carrying a briefcase |
| `person-dress.png` | person in a flowing summer dress and a straw sun hat |
| `person-hiker.png` | hiker with a large trekking backpack and a sun hat |
| `person-guard.png` | security guard in a navy uniform and a black cap |
| `person-chef.png` | chef in chef's whites and a tall white toque |
| `person-raincoat.png` | person in a bright yellow raincoat with the hood up |
| `person-hoodie.png` | person in a purple hoodie and jeans |

The runner is drawn alternately as the painting and its mirror image, one per stride, so the arms
and legs swap sides. Anything that must stay on one side (a briefcase in one hand, a parting in the
hair) will swap too; at running speed it doesn't show.
