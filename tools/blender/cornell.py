"""Build the lighting lab's Cornell box (lesson 6) in Blender, render it with Cycles as ground
truth, and export it as glTF so the lab can load the exact same scene.

Run from the repo root (Blender 4.2 or later):
    /Applications/Blender.app/Contents/MacOS/Blender -b -P tools/blender/cornell.py
Options after a "--":
    -- --samples 1024 --size 1024 --light 60

Writes:
    tinkering/lighting-lab/reference/cornell-cycles.png   (drop it on lesson 9's viewport)
    tinkering/lighting-lab/scenes/cornell.glb             (or press "Load scenes/cornell.glb")

Coordinates: the lab is Y-up, Blender is Z-up. The glTF exporter converts, so here a lab point
(x, y, z) is built at Blender (x, -z, y).
"""
import argparse
import math
import os
import sys

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
LAB = os.path.join(ROOT, "tinkering", "lighting-lab")

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--samples", type=int, default=512)
ap.add_argument("--size", type=int, default=1024)
ap.add_argument("--light", type=float, default=60.0, help="emitter radiance, same number as the lab's nits slider")
args = ap.parse_args(argv)


def srgb_hex(h):
    """Same colours as CORNELL in shared.js: sRGB hex, converted to Blender's linear values."""
    def lin(c):
        c /= 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin((h >> 16) & 255), lin((h >> 8) & 255), lin(h & 255), 1.0)


RED, GREEN, WHITE = srgb_hex(0xA8231C), srgb_hex(0x2F8A2A), srgb_hex(0xC9C5BD)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def material(name, color, roughness=0.95, emission=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = color
    p.inputs["Roughness"].default_value = roughness
    p.inputs["IOR"].default_value = 1.5          # F0 = 0.04, like three.js's default
    if emission:
        p.inputs["Emission Color"].default_value = (1, 1, 1, 1)
        p.inputs["Emission Strength"].default_value = emission
    return m


def plane(name, size, loc, rot, mat):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = (size[0], size[1], 1)
    o.data.materials.append(mat)
    return o


white, red, green = material("white", WHITE), material("red", RED), material("green", GREEN)
plane("floor", (2, 2), (0, 0, 0), (0, 0, 0), white)
plane("ceiling", (2, 2), (0, 0, 2), (math.pi, 0, 0), white)
plane("back", (2, 2), (0, 1, 1), (math.pi / 2, 0, 0), white)
plane("left", (2, 2), (-1, 0, 1), (0, math.pi / 2, 0), red)
plane("right", (2, 2), (1, 0, 1), (0, -math.pi / 2, 0), green)

# the light: an emissive panel facing down, 0.5 m square like the lab's default.
# glTF has no area lights, but it does carry emissive materials, and a path tracer treats those as lights.
emitter = material("light", (0, 0, 0, 1), emission=args.light)
plane("light", (0.5, 0.5), (0, 0, 1.995), (math.pi, 0, 0), emitter)


def box(name, w, h, d, lx, lz, ry):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(lx, -lz, h / 2), rotation=(0, 0, ry))
    o = bpy.context.object
    o.name = name
    o.scale = (w, d, h)
    o.data.materials.append(white)


box("tall box", 0.6, 1.2, 0.6, -0.33, -0.3, 0.3)
box("short box", 0.6, 0.6, 0.6, 0.35, 0.3, -0.3)

# camera: lab (0, 1, 3.9) looking at (0, 1, 0), vertical fov 39.3°, square frame
cam_data = bpy.data.cameras.new("camera")
cam_data.sensor_fit = "AUTO"
cam_data.angle = math.radians(39.3)
cam = bpy.data.objects.new("camera", cam_data)
cam.location = (0, -3.9, 1)
cam.rotation_euler = (math.pi / 2, 0, 0)
scene.collection.objects.link(cam)
scene.camera = cam

# black world, like the lab with the environment light off
world = bpy.data.worlds.new("black")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0
scene.world = world

# Cycles, with the same image pipeline as the lab: AgX, no look, 0 EV
scene.render.engine = "CYCLES"
scene.cycles.samples = args.samples
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 12
scene.render.resolution_x = scene.render.resolution_y = args.size
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "None"
scene.view_settings.exposure = 0
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    scene.cycles.device = "GPU"
except Exception as e:  # no GPU backend: CPU still works, just slower
    print("Cycles GPU not available, using CPU:", e)

os.makedirs(os.path.join(LAB, "reference"), exist_ok=True)
os.makedirs(os.path.join(LAB, "scenes"), exist_ok=True)
png = os.path.join(LAB, "reference", "cornell-cycles.png")
scene.render.filepath = png
scene.render.image_settings.file_format = "PNG"
bpy.ops.render.render(write_still=True)
print("Rendered", png)

glb = os.path.join(LAB, "scenes", "cornell.glb")
opts = dict(filepath=glb, export_format="GLB", export_cameras=True, export_lights=True, export_apply=True, export_yup=True)
try:
    bpy.ops.export_scene.gltf(**opts)
except TypeError:  # older exporters name things differently; the defaults are close enough
    bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB")
print("Exported", glb)
