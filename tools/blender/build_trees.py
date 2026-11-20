#!/usr/bin/env python3
"""Trees for Garden of Delight, grown and shaded in Blender by script.

    blender -b -P tools/blender/build_trees.py [-- --render]     or     python3 tools/blender/build_trees.py [--render]

Writes assets/models/trees.json (glTF) and blender/trees.blend; with --render also blender/trees_preview.png.

Each tree is a skeleton — trunk, scaffold limbs, branches, twigs — grown toward the surface of its crown.
  * Trunk, root buttresses and the first stretch of every limb are fused with a voxel remesh, so limbs flow out of the
    trunk and the roots flare into the ground instead of being pipes stuck together.
  * Leaves are boughs (textured cards, crossed in pairs) set along the twigs.
  * How much sky each bough and each patch of bark can see is measured by casting rays through the crown (a leaf lets
    about half the light through), and stored as vertex colour: the canopy is bright outside and dim within.
The garden instances three variants, scaling each to the crown its fairy lights are wrapped round."""
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector, noise
from mathutils.bvhtree import BVHTree

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CY, A, B, H = 4.6, 3.25, 2.4, 2.7            # crown centre height, crown radii (horizontal, vertical), clear trunk
C = np.array([0, 0, CY]); E = np.array([A, A, B]); UP = np.array([0, 0, 1.0])
unit = lambda v: v / (np.linalg.norm(v) or 1)

def spline(ctrl, step=0.12):                  # Catmull-Rom through the control points, sampled about every `step`
    P = np.array(ctrl, float); P = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]]); out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]; n = max(2, math.ceil(np.linalg.norm(p2 - p1) / step))
        for t in np.linspace(0, 1, n, endpoint=False): out.append(0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t ** 3))
    out.append(P[-2]); return np.array(out)
def taper(n, r0, r1, pw=0.85): return r0 + (r1 - r0) * np.linspace(0, 1, n) ** pw
def at(L, u):
    p = L['p']; i = min(len(p) - 1, int(u * (len(p) - 1))); return p[i], L['r'][i], unit(p[min(i + 1, len(p) - 1)] - p[max(i - 1, 0)])
def inside(p, k=1.0):                         # pull a point back inside the crown
    d = (p - C) / E / k; n = np.linalg.norm(d); return p if n <= 1 else C + d / n * E * k

def grow(kind, seed):
    rs = np.random.RandomState(seed); U = rs.uniform; weep = kind == 'weep'
    rand3 = lambda: unit(rs.normal(size=3))
    top = np.array([U(-.2, .2), U(-.2, .2), CY + 0.35 * B])
    trunk = dict(p=spline([[0, 0, -0.3], [U(-.05, .05), U(-.05, .05), H * 0.4], [U(-.12, .12), U(-.12, .12), H], [top[0] * .6, top[1] * .6, (H + top[2]) / 2], top], 0.1), lv=0)
    trunk['r'] = taper(len(trunk['p']), 0.25, 0.055, 0.85)
    prim, sec, twig, cards = [], [], [], []
    nP = 9; az0 = U(0, 6.28)
    for k in range(nP):                       # scaffold limbs: leave the trunk climbing, then reach for the crown's surface
        f = k / (nP - 1); s, sr, _ = at(trunk, 0.5 + 0.47 * f); az = az0 + k * 2.39996 + U(-.3, .3); el = -0.3 + 1.6 * f ** 1.15 + U(-.1, .1)
        d = np.array([math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)]); tip = C + d * E * U(0.8, 0.92)
        out = unit(np.array([math.cos(az), math.sin(az), 0])); L = np.linalg.norm(tip - s); m1 = s + out * L * 0.32 + UP * L * 0.24
        ctrl = [s, m1, tip + UP * 0.35, tip + out * 0.25 - UP * U(1.3, 2.1)] if weep else [s, m1, (m1 + tip) / 2 + UP * 0.14 * L, tip]
        p = spline(ctrl, 0.14); prim.append(dict(p=p, r=taper(len(p), min(sr * 0.72, 0.12) * U(.85, 1), 0.013), lv=1))
    for P in prim:                            # branches
        for j in range(6):
            u = 0.2 + 0.76 * (j + U(0, 1)) / 6; s, sr, tg = at(P, u)
            d = unit(rand3() * 0.8 + unit(s - C) * 0.75 + tg * 0.45 + UP * (-0.45 if weep else 0.22)); L = U(0.9, 1.6) * (1 - 0.35 * u)
            e = inside(s + d * L, 0.97); ctrl = [s, (s + e) / 2 + UP * L * (0.0 if weep else 0.12), e]
            if weep: ctrl.append(e + d * 0.1 - UP * U(0.6, 1.3))
            p = spline(ctrl, 0.24); sec.append(dict(p=p, r=taper(len(p), max(0.011, sr * 0.6), 0.005), lv=2))
    def add_twig(s, e, droop=0.05):
        p = spline([s, (s + e) / 2 + UP * 0.03, e - UP * droop], 0.3); T = dict(p=p, r=taper(len(p), 0.0065, 0.0028), lv=3); twig.append(T); return T
    def leaf(T, u):                           # a pair of crossed boughs fanning from a point on a twig
        b, _, tg = at(T, u); d = unit(tg * 0.6 + rand3() * 0.5 + unit(b - C) * 0.3 - UP * (0.7 if weep else 0.35)); s = U(0.46, 0.7)
        x = unit(np.cross(d, rand3())); cards.append((b - d * s * 0.12, x, d, s)); cards.append((b - d * s * 0.12, np.cross(d, x), d, s * U(0.85, 1)))
    for S in sec + prim:
        for j in range((3 if weep else 5) if S['lv'] == 2 else 3):
            u = (0.25 + 0.73 * (j + U(0, 1)) / 5) if S['lv'] == 2 else U(0.8, 1); s, _, tg = at(S, u)
            d = unit(rand3() + unit(s - C) * 0.6 + tg * 0.4 - UP * (0.9 if weep else 0.2)); T = add_twig(s, inside(s + d * U(0.35, 0.75)))
            leaf(T, U(0.5, 0.75)); leaf(T, 1.0)
        leaf(S, 1.0)
    if weep:                                  # the weeping habit: long pendulous shoots hanging from the ends of the branches, nearly to the ground
        for S in sec + prim:
            for j in range(2 if S['lv'] == 2 else 3):
                s, _, tg = at(S, U(0.7, 1.0)); out = unit(np.array([s[0], s[1], 0.0]) + rand3() * np.array([0.3, 0.3, 0])); L = min(U(1.4, 3.0), s[2] - U(0.8, 1.4))
                if L < 0.6: continue
                p = spline([s, s + out * 0.18 - UP * L * 0.35, s + out * 0.3 - UP * L], 0.3); T = dict(p=p, r=taper(len(p), 0.006, 0.0025), lv=3); twig.append(T)
                for q in np.arange(0.3, L, 0.34):
                    b, _, tg2 = at(T, q / L); d = unit(tg2 * 0.8 + rand3() * 0.35); sz = U(0.36, 0.5); cards.append((b - d * sz * 0.1, unit(np.cross(d, rand3())), d, sz))
    skel = np.vstack([L['p'] for L in sec + prim]); lp = np.array([c[0] for c in cards])
    for _ in range(420):                      # make sure no part of the crown's shell is left bare
        d = rand3()
        if d[2] < (-0.75 if weep else -0.4): continue
        q = C + d * E * U(0.8, 0.97)
        if np.min(np.linalg.norm(lp - q, axis=1)) < 0.42: continue
        dd = np.linalg.norm(skel - q, axis=1); i = int(np.argmin(dd))
        if dd[i] > 1.7: continue
        T = add_twig(skel[i], q, 0.1); leaf(T, 0.6); leaf(T, 1.0); lp = np.vstack([lp, q])
    return trunk, prim, sec, twig, cards

# ----------------------------------------------------------------------------------------------- meshes
def tube(bm, p, r, sides, cap_base=False):
    """A limb: rings carried along the path without twisting, closed to a point at the tip."""
    n = len(p); t = unit(p[1] - p[0]); nr = unit(np.cross(t, [0, 0, 1] if abs(t[2]) < 0.9 else [1, 0, 0])); rings = []
    for j in range(n):
        t2 = unit(p[min(j + 1, n - 1)] - p[max(j - 1, 0)]); nr = unit(nr - t2 * np.dot(nr, t2)); bn = np.cross(t2, nr)
        if j == n - 1: rings.append([bm.verts.new(p[j])] * sides); break
        rings.append([bm.verts.new(p[j] + (nr * math.cos(a) + bn * math.sin(a)) * r[j]) for a in (i / sides * math.tau for i in range(sides))])
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(sides):
            vs = []
            for v in (r0[i], r0[(i + 1) % sides], r1[(i + 1) % sides], r1[i]):
                if v not in vs: vs.append(v)
            if len(vs) >= 3: bm.faces.new(vs)
    if cap_base: bm.faces.new(rings[0][::-1])
def to_object(bm, name):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob); return ob
def activate(ob):
    for o in bpy.context.scene.objects: o.select_set(False)
    ob.select_set(True); bpy.context.view_layer.objects.active = ob

def build_wood(name, trunk, prim, sec, twig, seed):
    rs = np.random.RandomState(seed + 99); bm = bmesh.new()
    tube(bm, trunk['p'], trunk['r'], 16, True)
    for k in range(6):                        # root buttresses
        a = k / 6 * math.tau + rs.uniform(-.3, .3); o = np.array([math.cos(a), math.sin(a), 0]); L = rs.uniform(0.5, 0.8)
        p = spline([np.array([0, 0, 0.62]), o * 0.2 + UP * 0.3, o * L * 0.6 + UP * 0.03, o * L - UP * 0.16], 0.08); tube(bm, p, taper(len(p), 0.15, 0.05, 1.2), 10, True)
    for P in prim:                            # the first stretch of each limb, a little stout, to fuse with the trunk
        n = max(4, int(len(P['p']) * 0.3)); tube(bm, P['p'][:n], P['r'][:n] * np.linspace(1.3, 1.02, n), 10, True)
    core = to_object(bm, name + '_core'); activate(core)
    m = core.modifiers.new('fuse', 'REMESH'); m.mode = 'VOXEL'; m.voxel_size = 0.028; bpy.ops.object.modifier_apply(modifier=m.name)
    m = core.modifiers.new('ease', 'SMOOTH'); m.factor = 0.5; m.iterations = 3; bpy.ops.object.modifier_apply(modifier=m.name)
    m = core.modifiers.new('thin', 'DECIMATE'); m.ratio = min(1.0, 5000 / max(1, len(core.data.polygons))); bpy.ops.object.modifier_apply(modifier=m.name)
    for v in core.data.vertices: v.co += v.normal * (0.007 * noise.noise(v.co * 5.0 + Vector((seed, 0, 0))) + 0.004 * noise.noise(v.co * 17.0))   # lumps and burrs
    bm = bmesh.new()
    for L in prim: tube(bm, L['p'], L['r'], 8)
    for L in sec: tube(bm, L['p'], L['r'], 5)
    for L in twig: tube(bm, L['p'], L['r'], 3)
    limbs = to_object(bm, name + '_limbs')
    for o in bpy.context.scene.objects: o.select_set(o in (core, limbs))
    bpy.context.view_layer.objects.active = core; bpy.ops.object.join(); core.name = core.data.name = name + '_wood'
    core.data.validate()
    for poly in core.data.polygons: poly.use_smooth = True
    return core

def build_leaves(name, cards, shrink=1.0):
    bm = bmesh.new(); uv = bm.loops.layers.uv.new('UVMap')
    for (b, x, y, s) in cards:
        h = s * shrink; o = b + y * s * (1 - shrink) / 2
        vs = [bm.verts.new(o - x * h / 2), bm.verts.new(o + x * h / 2), bm.verts.new(o + x * h / 2 + y * h), bm.verts.new(o - x * h / 2 + y * h)]
        f = bm.faces.new(vs)
        for loop, st in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))): loop[uv].uv = st
    return to_object(bm, name)

# ----------------------------------------------------------------------------------------------- light
def sky_dirs(k, seed=3):                      # directions over the sky, denser overhead
    rs = np.random.RandomState(seed); out = []
    for i in range(k): u, v = (i + rs.rand()) / k, rs.rand(); r = math.sqrt(u) * 0.985; a = v * math.tau; out.append(Vector((r * math.cos(a), r * math.sin(a), math.sqrt(1 - r * r))))
    return out
def bvh_of(ob):
    me = ob.data; return BVHTree.FromPolygons([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])
def sky_seen(p, d, wood, leaves):             # 1 = open sky; bark blocks, each layer of leaf passes about half
    T = 1.0; o = p + d * 0.03
    if wood.ray_cast(o, d, 30.0)[0] is not None: return 0.0
    for _ in range(7):
        hit = leaves.ray_cast(o, d, 30.0)
        if hit[0] is None: break
        T *= 0.55; o = hit[0] + d * 0.02
    return T
def colour(ob, values):
    me = ob.data; col = me.color_attributes.new('Col', 'BYTE_COLOR', 'POINT'); me.color_attributes.active_color = col
    c = np.ones((len(me.vertices), 4), np.float32); c[:, 0] = c[:, 1] = c[:, 2] = values; col.data.foreach_set('color', c.ravel()); me.update()

# ----------------------------------------------------------------------------------------------- build
bpy.ops.wm.read_factory_settings(use_empty=True); scene = bpy.context.scene
made = []; DL, DW = sky_dirs(28), sky_dirs(14, 5)
for vi, (name, kind, seed) in enumerate((('tree_round_a', 'round', 11), ('tree_round_b', 'round', 29), ('tree_weep', 'weep', 47))):
    trunk, prim, sec, twig, cards = grow(kind, seed)
    wood = build_wood(name, trunk, prim, sec, twig, seed); leaves = build_leaves(name + '_leaves', cards)
    proxy = build_leaves('proxy', cards, 0.72); bw, bl = bvh_of(wood), bvh_of(proxy); bpy.data.objects.remove(proxy)
    seen = []
    for (b, x, y, s) in cards:
        p = Vector(b + y * s * 0.5); seen += [sum(sky_seen(p, d, bw, bl) for d in DL) / len(DL)] * 4
    colour(leaves, 0.3 + 0.7 * np.array(seen) ** 0.75)
    wv = []
    for v in wood.data.vertices:
        tot = wt = 0.0
        for d in DW: w = max(0.12, v.normal.dot(d)); tot += w * sky_seen(v.co + v.normal * 0.02, d, bw, bl); wt += w
        wv.append(tot / wt)
    colour(wood, 0.36 + 0.64 * np.array(wv) ** 0.8)
    print(f'{name}: wood {len(wood.data.vertices)} vertices, {len(cards)} boughs, mean sky {np.mean(seen):.2f}', flush=True)
    made += [wood, leaves]

# ----------------------------------------------------------------------------------------------- export
bark = bpy.data.materials.new('bark'); bark.diffuse_color = (0.3, 0.24, 0.18, 1); leafm = bpy.data.materials.new('lime leaves'); leafm.diffuse_color = (0.25, 0.42, 0.1, 1)
for o in made: o.data.materials.append(leafm if o.name.endswith('leaves') else bark)
for o in scene.objects: o.select_set(o in made)
bpy.context.view_layer.objects.active = made[0]
want = dict(filepath=os.path.join(ROOT, 'assets', 'models', 'trees.gltf'), export_format='GLTF_SEPARATE', use_selection=True, export_apply=True, export_texcoords=True, export_normals=True,
            export_materials='EXPORT', export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_active_vertex_color_when_no_material=True, export_yup=True, export_animations=False)
props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
bpy.ops.export_scene.gltf(**{k: v for k, v in want.items() if k in props})
sys.path.insert(0, os.path.join(ROOT, 'tools')); import gltf_embed; gltf_embed.embed(want['filepath'])

# a scene worth opening: textured leaves, the three trees in a row, sun and sky
os.makedirs(os.path.join(ROOT, 'blender'), exist_ok=True)
try:
    for mat, tex in ((leafm, 'card_lime.webp'), (bark, None)):
        mat.use_nodes = True; nt = mat.node_tree; bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs[0].default_value = 1.0; nt.links.new(vc.outputs['Color'], mix.inputs[7])
        if tex:
            img = nt.nodes.new('ShaderNodeTexImage'); img.image = bpy.data.images.load(os.path.join(ROOT, 'assets', 'tex', tex)); nt.links.new(img.outputs['Color'], mix.inputs[6]); nt.links.new(img.outputs['Alpha'], bsdf.inputs['Alpha'])
        else: mix.inputs[6].default_value = (0.3, 0.24, 0.18, 1)
        nt.links.new(mix.outputs[2], bsdf.inputs['Base Color']); bsdf.inputs['Roughness'].default_value = 0.7
    for i, o in enumerate(made): o.location.x = (i // 2 - 1) * 8.0
    bpy.ops.mesh.primitive_plane_add(size=80); bpy.context.object.name = 'ground'
    bpy.ops.object.light_add(type='SUN', rotation=(math.radians(50), 0, math.radians(30))); bpy.context.object.data.energy = 3.5
    scene.world = bpy.data.worlds.new('World'); scene.world.use_nodes = True; bg = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs[0].default_value = (0.5, 0.65, 0.9, 1); bg.inputs[1].default_value = 1.0
    bpy.ops.object.camera_add(location=(0, -25, 3.4), rotation=(math.radians(89), 0, 0)); scene.camera = bpy.context.object; scene.camera.data.lens = 32
    scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = 24; scene.cycles.transparent_max_bounces = 10; scene.render.resolution_x, scene.render.resolution_y = 1100, 480
    try: bpy.data.images[0].pack()
    except Exception: pass
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'blender', 'trees.blend'))
    if '--render' in sys.argv: scene.render.filepath = os.path.join(ROOT, 'blender', 'trees_preview.png'); bpy.ops.render.render(write_still=True)
except Exception as e: print('preview scene:', e)
