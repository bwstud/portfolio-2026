# Bison sheet

Builds `experiments/bison-lab/bison.png` and `bison-marks.png`, the frames the Bison Lab sets in type.

## From the 3D model (what the lab uses)

- `model/` holds 3DRT's bison, a purchased model, so it is not in the repo (`.gitignore`). `model/3drt-bison/` is
  the download; `model/src/` is its main archive unpacked, with `bison_blender.blend`, the texture `bison.tga` and
  `animnals_animations.txt`, the list of its animations. The gallop is `run_fast`, frames 1010 to 1030.
- `render.py` is run by Blender. It renders fourteen frames of the gallop from the side into `model/out/`: the
  coat's colours, which way the surface faces, how near it is to the camera, and where the head is. `ROCK`,
  `BOUNCE` and `SWING` at its top calm the model's gallop: how much of the body's rocking, its rise and fall, and
  the head's nodding are kept (1 is the gallop as the model has it).
  `/Applications/Blender.app/Contents/MacOS/Blender -b model/src/bison_blender.blend --python render.py`
- `sheet.py` packs those into the sheet: the coat lit from above and ahead, a height made of the rounded outline
  and the model's nearness, the outline, and the horn and eye as marks. Its settings (`LIGHT`, `AMBIENT`, `COAT`,
  `DEPTH`) are at the top. `python3 sheet.py ../../experiments/bison-lab/bison.png`. It needs numpy and Pillow.

Run both from this folder. On a Mac without the model, the sheet in the repo is used as it is.

## From Muybridge's photographs (the first version, not used now)

- `raw/` holds the sixteen photographs of Eadweard Muybridge's "Buffalo galloping" (Animal Locomotion, plate 700,
  1887; public domain, from Wikimedia Commons).
- `mask.swift` cuts the animal out of each photograph with the Mac's subject detector:
  `swift mask.swift raw/f01.jpg mask/f01.png raw/f02.jpg mask/f02.png …`
- `pack.py` writes a sheet in the same layout from photographs 3 to 16, drawing the horn, eye, snout and tail by
  hand. `python3 pack.py <out.png>`.

## Tatankagram

- `tatankagram.py` is run by Blender. It stands the model in `stand_pose` and scatters 30,000 points over its surface,
  each with the coat's tone under it (`bison.tga`), a size, and the surface's facing, into
  `experiments/tatankagram/head.bin` (a bust: the head, beard and front of the hump, the scatter weighted toward
  the surfaces facing forward; each bead lifted off the skin a little, most in the dark shag) and `whole.bin` (the whole animal, from the side). The file format is at its top.
  `/Applications/Blender.app/Contents/MacOS/Blender -b model/src/bison_blender.blend --python tatankagram.py`
