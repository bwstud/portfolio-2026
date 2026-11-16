# Renders the 3DRT bison's gallop from the side, for sheet.py to pack. Run by Blender, from this folder:
#   /Applications/Blender.app/Contents/MacOS/Blender -b model/src/bison_blender.blend --python render.py
# Out, in model/out/: for each frame, aNN.png (the texture's own colours, unlit, on a clear ground), dNN.png (how near each point is to the camera:
# white the near flank, black the far one), nNN.png (which way the surface faces at each point: red across the
# animal's width, green along its length, blue up, 0.5 being none) and meta.json (where the head is in each frame).
import bpy, math, json, os
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

N = 14                       # frames in the stride the lab loops
RUN = (1010, 1030)           # run_fast in the model's own frame numbers (animnals_animations.txt), which run at 30 a second
RATE = 0.8                   # the Blender file plays them at 24 a second, so its frames are 0.8 of those
W, H = 1300, 780             # one frame as rendered; sheet.py brings it down to the sheet's 400 x 240
ROCK = 0.45                  # how much of the body's own rocking is kept: its pitch nose-up and nose-down, and the flex of its spine. 1 is the model's gallop as made
BOUNCE = 0.6                 # how much of the body's rise and fall is kept
SWING = 0.3                  # how much of the neck's and the head's own nodding is kept, on top of the body's
FILL = 0.86                  # how much of the frame's width the animal's reach over the whole stride takes

here = os.path.dirname(os.path.abspath(__file__)); out = os.path.join(here, 'model', 'out'); os.makedirs(out, exist_ok=True)
sc = bpy.context.scene
arm = bpy.data.objects['Armature']; mesh = bpy.data.objects['bison']; mat = mesh.data.materials[0]
img = bpy.data.images.get('bison.tga') or bpy.data.images.load('//bison.tga')
tex = mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = img; mat.node_tree.nodes.active = tex   # what the workbench draws as the texture

sc.render.engine = 'BLENDER_WORKBENCH'
sc.render.film_transparent = True
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W, H, 100
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'Standard'
sc.display.render_aa = '16'
sh = sc.display.shading; sh.show_specular_highlight = False; sh.show_shadows = False; sh.show_cavity = False

# The gallop is read off the model once, bone by bone, and then set by hand, so it can be calmed: each bone that rocks
# the body or swings the head is turned only part of the way from its average over the stride to where the model has it
def at(k):
    t = (RUN[0] + (RUN[1] - RUN[0]) * k / N) * RATE
    sc.frame_set(int(t), subframe=t - int(t))
film = []
for k in range(N):
    at(k); film.append({b.name: b.matrix_basis.decompose() for b in arm.pose.bones})
arm.animation_data.action = None
CALM = {'Bip01': ROCK, 'Bip01_Spine': ROCK, 'Bip01_Spine1': ROCK, 'Bip01_Spine2': ROCK, 'Bip01_Neck': SWING, 'Bip01_Head': SWING}
rest = {}
for name in CALM:
    q0 = film[0][name][1]; qs = [f[name][1] if f[name][1].dot(q0) >= 0 else -f[name][1] for f in film]
    mean = qs[0].copy()
    for q in qs[1:]: mean = mean + q
    mean.normalize(); rest[name] = mean
mid = sum((f['Bip01'][0] for f in film), Vector()) / N
def pose(k):
    for b in arm.pose.bones:
        loc, rot, scale = film[k][b.name]
        if b.name in CALM: rot = rest[b.name].slerp(rot, CALM[b.name])
        if b.name == 'Bip01': loc = mid.lerp(loc, BOUNCE)
        b.rotation_mode = 'QUATERNION'; b.location, b.rotation_quaternion, b.scale = loc, rot, scale
    bpy.context.view_layer.update()

# the camera: straight on to the animal's side, far enough out to take in the whole stride, the animal running right
deps = bpy.context.evaluated_depsgraph_get
lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
for k in range(N):
    pose(k); ev = mesh.evaluated_get(deps()); m = ev.to_mesh()
    for v in m.vertices:
        p = ev.matrix_world @ v.co
        for i in range(3): lo[i] = min(lo[i], p[i]); hi[i] = max(hi[i], p[i])
    ev.to_mesh_clear()
cam = bpy.data.objects['Camera']; cam.data.type = 'ORTHO'; sc.camera = cam
cam.data.ortho_scale = max((hi.y - lo.y) / FILL, (hi.z - lo.z) / FILL * W / H)
cam.location = (-10, (lo.y + hi.y) / 2, (lo.z + hi.z) / 2); cam.rotation_euler = (math.radians(90), 0, math.radians(-90))
cam.data.clip_start, cam.data.clip_end = 0.1, 100
print('stride reaches %.2f m along and %.2f m up; the frame is %.2f m wide' % (hi.y - lo.y, hi.z - lo.z, cam.data.ortho_scale))

# nearness, as a material of its own: the distance from the camera, read straight out as a grey
near_mat = bpy.data.materials.new('nearness'); near_mat.use_nodes = True; nt = near_mat.node_tree; nt.nodes.clear()
cd = nt.nodes.new('ShaderNodeCameraData'); mr = nt.nodes.new('ShaderNodeMapRange'); em = nt.nodes.new('ShaderNodeEmission'); om = nt.nodes.new('ShaderNodeOutputMaterial')
mr.inputs['From Min'].default_value = lo.x + 10; mr.inputs['From Max'].default_value = hi.x + 10; mr.inputs['To Min'].default_value = 1; mr.inputs['To Max'].default_value = 0
nt.links.new(cd.outputs['View Z Depth'], mr.inputs['Value']); nt.links.new(mr.outputs['Result'], em.inputs['Color']); nt.links.new(em.outputs['Emission'], om.inputs['Surface'])
# and which way the surface faces
face_mat = bpy.data.materials.new('facing'); face_mat.use_nodes = True; nt = face_mat.node_tree; nt.nodes.clear()
geo = nt.nodes.new('ShaderNodeNewGeometry'); half = nt.nodes.new('ShaderNodeVectorMath'); half.operation = 'MULTIPLY_ADD'
half.inputs[1].default_value = (0.5, 0.5, 0.5); half.inputs[2].default_value = (0.5, 0.5, 0.5)
em = nt.nodes.new('ShaderNodeEmission'); om = nt.nodes.new('ShaderNodeOutputMaterial')
nt.links.new(geo.outputs['Normal'], half.inputs[0]); nt.links.new(half.outputs['Vector'], em.inputs['Color']); nt.links.new(em.outputs['Emission'], om.inputs['Surface'])
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
EEVEE = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in engines else 'BLENDER_EEVEE_NEXT'

meta = []
for k in range(N):
    pose(k)
    sc.render.engine = 'BLENDER_WORKBENCH'; sc.view_settings.view_transform = 'Standard'; mesh.data.materials[0] = mat
    sh.light = 'FLAT'; sh.color_type = 'TEXTURE'
    sc.render.filepath = os.path.join(out, 'a%02d.png' % k); bpy.ops.render.render(write_still=True)
    sc.render.engine = EEVEE; sc.view_settings.view_transform = 'Raw'; mesh.data.materials[0] = near_mat
    sc.render.filepath = os.path.join(out, 'd%02d.png' % k); bpy.ops.render.render(write_still=True)
    mesh.data.materials[0] = face_mat
    sc.render.filepath = os.path.join(out, 'n%02d.png' % k); bpy.ops.render.render(write_still=True)
    spot = {}
    for name in ('Bip01_Head', 'Bip01_HeadNub', 'Bip01_Neck'):
        v = world_to_camera_view(sc, cam, arm.matrix_world @ arm.pose.bones[name].head)
        spot[name] = (v.x * W, (1 - v.y) * H)
    meta.append(spot)
json.dump(dict(w=W, h=H, frames=meta), open(os.path.join(out, 'meta.json'), 'w'))
print('rendered', N, 'frames to', out)
