"""Live link from Blender to the lighting lab (lesson 9).

Open this file in Blender's Scripting workspace (Text > Open) and press Run Script.
From then on, every time you save the .blend it exports the scene to
    experiments/lighting-lab/scenes/live.glb
and the lab (with "Live link with Blender" on, served by `npm run dev`) reloads it.
Run the script again to turn the link off.

Tips:
- Under the exporter's Lighting mode, "Standard" converts watts to physical units. That's what this script uses.
- Give the scene a camera if you want the lab to match your Cycles framing exactly.
"""
import os

import bpy
from bpy.app.handlers import persistent

TAG = "lighting_lab_live_link"


def scenes_dir():
    # When the script was opened from disk, its text block knows where it lives in the repo.
    for t in bpy.data.texts:
        if t.filepath and os.path.basename(t.filepath) == "live_link.py":
            here = os.path.dirname(bpy.path.abspath(t.filepath))
            return os.path.abspath(os.path.join(here, "..", "..", "experiments", "lighting-lab", "scenes"))
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.abspath(os.path.join(here, "..", "..", "experiments", "lighting-lab", "scenes"))


OUT_DIR = scenes_dir()


def export_to_lab():
    os.makedirs(OUT_DIR, exist_ok=True)
    final = os.path.join(OUT_DIR, "live.glb")
    tmp = os.path.join(OUT_DIR, ".live-tmp.glb")   # write then rename, so the lab never reads half a file
    opts = dict(filepath=tmp, export_format="GLB", export_cameras=True, export_lights=True,
                export_apply=True, export_yup=True, export_import_convert_lighting_mode="SPEC")
    try:
        bpy.ops.export_scene.gltf(**opts)
    except TypeError:
        bpy.ops.export_scene.gltf(filepath=tmp, export_format="GLB")
    os.replace(tmp, final)
    print("Lighting lab: exported", final)


@persistent
def on_save(_dummy=None):
    try:
        export_to_lab()
    except Exception as e:
        print("Lighting lab live link failed:", e)


on_save.__name__ = TAG
existing = [h for h in bpy.app.handlers.save_post if getattr(h, "__name__", "") == TAG]
if existing:
    for h in existing:
        bpy.app.handlers.save_post.remove(h)
    print("Lighting lab live link: off")
else:
    bpy.app.handlers.save_post.append(on_save)
    print("Lighting lab live link: on. Save the .blend to send it to", OUT_DIR)
    export_to_lab()
