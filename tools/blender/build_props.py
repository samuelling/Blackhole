#!/usr/bin/env python3
"""Small repeated pieces for Garden of Delight, modelled in Blender by script: coping stones and the path lantern.

    blender -b -P tools/blender/build_props.py        or        python3 tools/blender/build_props.py

Writes assets/models/props.json (glTF) and blender/props.blend. The garden instances each piece many times:
coping stones end to end along the wall and the canal (each with its own tone), a lantern beside every walk."""
import bpy, bmesh, math, os, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

def link(bm, name):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob); return ob
def activate(ob):
    for o in bpy.context.scene.objects: o.select_set(False)
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
def finish(ob, bevel=0.0, sharp=40):
    activate(ob)
    if bevel: m = ob.modifiers.new('bevel', 'BEVEL'); m.width = bevel; m.segments = 3; m.limit_method = 'ANGLE'; bpy.ops.object.modifier_apply(modifier=m.name)
    for p in ob.data.polygons: p.use_smooth = True
    try: ob.data.set_sharp_from_angle(angle=math.radians(sharp))
    except Exception: pass
    return ob
def prism(name, profile, length):                 # a cross-section in (y, z) run along x; a hair short, so stones show a joint
    bm = bmesh.new(); L = length / 2 - 0.004
    a = [bm.verts.new((-L, y, z)) for y, z in profile]; b = [bm.verts.new((L, y, z)) for y, z in profile]; n = len(profile)
    for i in range(n): bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bm.faces.new(a[::-1]); bm.faces.new(b); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); return link(bm, name)
def turned(name, profile, steps=28):              # a profile in (r, z) spun about the z axis
    bm = bmesh.new(); vs = [bm.verts.new((r, 0, z)) for r, z in profile]; es = [bm.edges.new((u, v)) for u, v in zip(vs, vs[1:])]
    bmesh.ops.spin(bm, geom=vs + es, angle=math.tau, steps=steps, axis=(0, 0, 1), cent=(0, 0, 0)); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); return link(bm, name)
def join(parts, name):
    for o in bpy.context.scene.objects: o.select_set(o in parts)
    bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join(); parts[0].name = parts[0].data.name = name; return parts[0]

bpy.ops.wm.read_factory_settings(use_empty=True); scene = bpy.context.scene
# saddleback coping for the brick wall: 0.9 m long, 0.66 wide, weathered to a soft ridge, with a drip overhang
wall = finish(prism('coping_wall', [(-0.33, 0.0), (0.33, 0.0), (0.33, 0.055), (0.07, 0.135), (-0.07, 0.135), (-0.33, 0.055)], 0.9), 0.012)
# flat bullnosed coping for the canal kerb: 0.8 m long, 0.56 wide, 0.09 thick
flat = finish(prism('coping_flat', [(-0.28, 0.0), (0.28, 0.0), (0.28, 0.09), (-0.28, 0.09)], 0.8), 0.022)
# path lantern: flanged post, glazed cage, conical cap
post = turned('post', [(0, 0), (0.07, 0), (0.07, 0.014), (0.034, 0.03), (0.024, 0.055), (0.02, 0.3), (0.02, 0.54), (0.03, 0.565), (0.054, 0.582), (0.054, 0.6), (0, 0.6)])
cap = turned('cap', [(0, 0.748), (0.09, 0.748), (0.093, 0.76), (0.055, 0.8), (0.016, 0.828), (0.012, 0.85), (0.021, 0.864), (0.012, 0.878), (0, 0.882)])
bars = []
for k in range(4):
    a = k * math.pi / 2 + math.pi / 4; bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.0045, depth=0.15, location=(0.05 * math.cos(a), 0.05 * math.sin(a), 0.675)); bars.append(bpy.context.object)
metal = finish(join([post, cap] + bars, 'lantern_metal'), 0.0, 32)
glass = finish(turned('lantern_glass', [(0.043, 0.6), (0.046, 0.675), (0.043, 0.75)], 16))
made = [wall, flat, metal, glass]
for o in made: print(o.name, len(o.data.vertices), 'vertices')

for o in scene.objects: o.select_set(o in made)
bpy.context.view_layer.objects.active = made[0]
want = dict(filepath=os.path.join(ROOT, 'assets', 'models', 'props.gltf'), export_format='GLTF_SEPARATE', use_selection=True, export_apply=True, export_texcoords=False, export_normals=True, export_materials='NONE', export_yup=True, export_animations=False)
props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
bpy.ops.export_scene.gltf(**{k: v for k, v in want.items() if k in props})
sys.path.insert(0, os.path.join(ROOT, 'tools')); import gltf_embed; gltf_embed.embed(want['filepath'])
for o, x in zip(made, (-1.2, 0, 1.0, 1.0)): o.location.x = x
os.makedirs(os.path.join(ROOT, 'blender'), exist_ok=True); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'blender', 'props.blend'))
