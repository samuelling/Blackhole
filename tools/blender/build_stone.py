#!/usr/bin/env python3
"""Stonework for Garden of Delight, modelled in Blender by script.

Run either way:
    blender -b -P tools/blender/build_stone.py           (the Blender app, no window)
    python3 tools/blender/build_stone.py                 (the `bpy` Python module: pip install bpy)

It writes
    assets/models/stone.json   glTF: geometry + ambient occlusion baked into vertex colours (the garden loads this)
    blender/stone.blend        the same scene, to open and explore in Blender
    blender/stone_preview.png  a quick render

Each piece is a turned profile (like work on a lathe) with carving added round the turn — gadroons, flutes, scales,
jointed coping stones — then lightly weathered, simplified, and its creases shaded by a Cycles ambient-occlusion bake.
The web garden supplies the stone texture itself, so the file carries no images."""
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector, noise

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TAU = math.tau
def sstep(a, b, x): t = min(1.0, max(0.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)

# ----------------------------------------------------------------------------------------------- profiles
# A profile is a list of (r, z) points traced counter-clockwise: up the outside, in over the top, down the inside.
# The surface normal is always on the right of the direction of travel.
def bez(p0, c, p1, n):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1]) for t in (i / n for i in range(1, n + 1))]
class Prof:
    def __init__(s, r, z): s.p = [(r, z)]; s.marks = {}
    def to(s, r, z): s.p.append((r, z)); return s                                   # a straight run, hard corners
    def curve(s, cr, cz, r, z, n=12): s.p += bez(s.p[-1], (cr, cz), (r, z), n); return s
    def torus(s, r, z, bulge, n=10):                                                 # a half-round moulding standing `bulge` proud
        p0 = s.p[-1]; dx, dz = r - p0[0], z - p0[1]; L = math.hypot(dx, dz) or 1
        s.p += bez(p0, ((p0[0] + r) / 2 + dz / L * bulge * 2, (p0[1] + z) / 2 - dx / L * bulge * 2), (r, z), n); return s
    def cove(s, r, z, depth, n=10): return s.torus(r, z, -depth, n)                  # a hollow moulding
    def mark(s, name): s.marks[name] = len(s.p) - 1; return s
    def lengths(s):
        S = [0.0]
        for a, b in zip(s.p, s.p[1:]): S.append(S[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
        return S

def revolve(name, prof, mod=None, segs=192, step=0.03, angles=None):
    """Turn a profile about the Z axis. mod(a, r, z, s, M) -> (dn, k): move dn along the surface normal, scale radius by k."""
    S0 = prof.lengths(); M = {k: S0[i] for k, i in prof.marks.items()}
    pts = []                                                                         # resample so no ring is further than `step` from the next
    for (a, b, s0, s1) in zip(prof.p, prof.p[1:], S0, S0[1:]):
        n = max(1, math.ceil((s1 - s0) / step)); dx, dz = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dz) or 1
        if not pts: pts.append((a[0], a[1], s0, dz / L, -dx / L))
        for i in range(1, n + 1): t = i / n; pts.append((a[0] + dx * t, a[1] + dz * t, s0 + (s1 - s0) * t, dz / L, -dx / L))
    for j in range(1, len(pts) - 1):                                                 # average the normal across each ring
        nr, nz = pts[j][3] + pts[j + 1][3], pts[j][4] + pts[j + 1][4]; L = math.hypot(nr, nz) or 1; pts[j] = pts[j][:3] + (nr / L, nz / L)
    A = angles or [i / segs * TAU for i in range(segs)]
    bm = bmesh.new(); rings = []
    for (r, z, s, nr, nz) in pts:
        if r < 1e-4: rings.append([bm.verts.new((0, 0, z))] * len(A)); continue
        ring = []
        for a in A:
            dn, k = mod(a, r, z, s, M) if mod else (0.0, 1.0); rr = (r + nr * dn) * k
            ring.append(bm.verts.new((math.cos(a) * rr, math.sin(a) * rr, z + nz * dn)))
        rings.append(ring)
    n = len(A)
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(n):
            vs = []
            for v in (r0[i], r0[(i + 1) % n], r1[(i + 1) % n], r1[i]):
                if v not in vs: vs.append(v)
            if len(vs) >= 3:
                try: bm.faces.new(vs)
                except ValueError: pass
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob); return ob

# ----------------------------------------------------------------------------------------------- carving
def gadroon(a, s, s0, s1, n, depth):      # convex lobes parted by grooves, fading in and out along the run s0..s1
    if not (s0 < s < s1): return 0.0
    env = sstep(s0, s0 + 0.12 * (s1 - s0), s) * (1 - sstep(s1 - 0.16 * (s1 - s0), s1, s))
    return -depth * env * (1 - abs(math.cos(n * a / 2)) ** 0.55)
def flute(a, s, s0, s1, n, depth):        # concave channels with flat fillets between
    if not (s0 < s < s1): return 0.0
    env = sstep(s0, s0 + 0.14 * (s1 - s0), s) * (1 - sstep(s1 - 0.14 * (s1 - s0), s1, s))
    return -depth * env * sstep(0.1, 0.95, math.cos(n * a))
def scales(a, s, s0, s1, n, pitch, depth):  # crossing spirals: the diamond scales of a pinecone finial
    if not (s0 < s < s1): return 0.0
    u = (s - s0) * pitch; env = sstep(s0, s0 + 0.1 * (s1 - s0), s) * (1 - sstep(s1 - 0.12 * (s1 - s0), s1, s))
    return depth * env * ((abs(math.cos(n * a / 2 + u)) * abs(math.cos(n * a / 2 - u))) ** 0.5 - 0.45)

def fountain_grand():
    """Three-tier fountain. Fixed by the garden: lower lip r 2.28 at z 1.80, upper lip r 1.16 at z 2.69, top at z 3.16."""
    p = Prof(1.26, 0).to(1.26, 0.17).to(1.18, 0.17).to(1.18, 0.31).to(1.12, 0.36).mark('oct')        # octagonal stepped plinth
    p.to(1.0, 0.36).torus(0.98, 0.5, 0.07).to(0.9, 0.52).to(0.9, 0.555).cove(0.62, 0.72, 0.05).torus(0.6, 0.8, 0.035)
    p.mark('f0').curve(0.8, 0.95, 0.5, 1.2, 16).mark('f1')                                           # fluted baluster
    p.to(0.45, 1.2).torus(0.45, 1.27, 0.04).to(0.5, 1.3)
    p.mark('g0').curve(1.5, 1.3, 2.2, 1.68, 40).mark('g1')                                           # gadrooned underside of the great bowl
    p.to(2.24, 1.7).torus(2.24, 1.8, 0.045).to(2.17, 1.8).curve(2.13, 1.76, 2.06, 1.72, 6).curve(1.3, 1.6, 0.42, 1.6, 14)
    p.torus(0.36, 1.7, 0.035).mark('f2').curve(0.52, 1.9, 0.24, 2.12, 14).mark('f3')
    p.torus(0.24, 2.19, 0.04).cove(0.3, 2.3, 0.02)
    p.mark('h0').curve(0.75, 2.32, 1.1, 2.58, 24).mark('h1')                                         # gadrooned upper bowl
    p.to(1.12, 2.6).torus(1.12, 2.69, 0.04).to(1.08, 2.69).curve(1.07, 2.64, 1.02, 2.6, 5).curve(0.6, 2.53, 0.2, 2.53, 10)
    p.torus(0.16, 2.6, 0.03).cove(0.1, 2.68, 0.015).mark('p0').curve(0.31, 2.78, 0.19, 2.99, 14).curve(0.11, 3.1, 0.0, 3.16, 8).mark('p1')
    def mod(a, r, z, s, M):
        if s <= M['oct'] + 1e-6: d = ((a + math.pi / 8) % (math.pi / 4)) - math.pi / 8; return 0.0, 1 / math.cos(d)
        dn = flute(a, s, M['f0'], M['f1'], 20, 0.022) + gadroon(a, s, M['g0'], M['g1'], 24, 0.05) + flute(a, s, M['f2'], M['f3'], 12, 0.014)
        dn += gadroon(a, s, M['h0'], M['h1'], 16, 0.035) + scales(a, s, M['p0'], M['p1'], 10, 15.0, 0.028)
        return dn, 1.0
    return revolve('fountain_grand', p, mod, segs=192, step=0.03)

def fountain_bowl():
    """Single-bowl fountain. Fixed by the garden: lip r 0.98 at z 1.20, bowl holds a water surface r 0.87 at z 1.18."""
    p = Prof(0.62, 0).to(0.62, 0.1).mark('oct').to(0.55, 0.1).torus(0.53, 0.2, 0.035).cove(0.31, 0.34, 0.045).torus(0.29, 0.42, 0.03)
    p.mark('f0').curve(0.44, 0.6, 0.24, 0.84, 14).mark('f1').torus(0.24, 0.9, 0.03).to(0.3, 0.93)
    p.mark('g0').curve(0.64, 0.94, 0.92, 1.1, 26).mark('g1').to(0.94, 1.11).torus(0.94, 1.2, 0.04).to(0.905, 1.2)
    p.curve(0.895, 1.16, 0.85, 1.12, 5).curve(0.5, 1.06, 0.0, 1.06, 10)
    def mod(a, r, z, s, M):
        if s <= M['oct'] + 1e-6: d = ((a + math.pi / 8) % (math.pi / 4)) - math.pi / 8; return 0.0, 1 / math.cos(d)
        return flute(a, s, M['f0'], M['f1'], 16, 0.014) + gadroon(a, s, M['g0'], M['g1'], 16, 0.032), 1.0
    return revolve('fountain_bowl', p, mod, segs=128, step=0.022)

def pool(name, R, blocks):
    """Raised pool kerb of jointed coping stones round a pool of inner radius R; top at z 0.67."""
    p = Prof(R + 0.74, 0).to(R + 0.74, 0.1).to(R + 0.69, 0.135).to(R + 0.69, 0.4).cove(R + 0.72, 0.47, 0.012, 5).torus(R + 0.72, 0.6, 0.035, 8)
    p.curve(R + 0.72, 0.67, R + 0.62, 0.67, 6).to(R + 0.1, 0.67).curve(R, 0.67, R, 0.58, 6).to(R, 0.0)
    Rm = R + 0.4; A = []; ba = TAU / blocks
    for k in range(blocks):                                                          # extra columns of vertices at each joint, a few along each stone
        a0 = k * ba; A += [a0, a0 + 0.011 / Rm, a0 + 0.03 / Rm] + [a0 + ba * t / 7 for t in range(1, 7)] + [a0 + ba - 0.03 / Rm, a0 + ba - 0.011 / Rm]
    rs = np.random.RandomState(int(R * 100)); wob = rs.uniform(-1, 1, (blocks, 2))
    def mod(a, r, z, s, M):
        k = int((a + 1e-6) / ba) % blocks; d = min(a - k * ba, (k + 1) * ba - a) * Rm    # metres from the nearest joint
        return -0.009 * math.exp(-(d / 0.011) ** 2) + 0.0025 * wob[k][0] * sstep(0.1, 0.2, z), 1.0
    return revolve(name, p, mod, step=0.05, angles=A)

def urn():
    """Campana urn on a square plinth; soil surface at z 1.24."""
    p = Prof(0.27, 0.59).to(0.27, 0.625).torus(0.24, 0.67, 0.02, 6).cove(0.13, 0.75, 0.035).torus(0.15, 0.8, 0.025, 8)
    p.mark('g0').curve(0.5, 0.8, 0.53, 1.08, 26).mark('g1').to(0.51, 1.095).torus(0.51, 1.15, 0.022, 8)
    p.curve(0.42, 1.22, 0.5, 1.3, 12).curve(0.56, 1.33, 0.6, 1.355, 6).mark('b0').torus(0.6, 1.39, 0.02, 8).mark('b1').to(0.545, 1.39)
    p.curve(0.5, 1.35, 0.46, 1.28, 6).to(0.0, 1.24)
    def mod(a, r, z, s, M):
        dn = gadroon(a, s, M['g0'], M['g1'], 18, 0.03)
        if M['b0'] < s < M['b1']: dn += 0.008 * (0.5 + 0.5 * math.cos(36 * a)) ** 2     # beading round the rim
        return dn, 1.0
    ob = revolve('urn', p, mod, segs=144, step=0.018)
    parts = [ob]
    for (w, z0, z1) in ((0.84, 0.0, 0.1), (0.7, 0.1, 0.52), (0.8, 0.52, 0.59)):       # plinth: base, die, cap
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, (z0 + z1) / 2)); c = bpy.context.object; c.scale = (w, w, z1 - z0)
        bpy.ops.object.transform_apply(scale=True); m = c.modifiers.new('bevel', 'BEVEL'); m.width = 0.012; m.segments = 2
        sub = c.modifiers.new('grid', 'SUBSURF'); sub.subdivision_type = 'SIMPLE'; sub.levels = 3
        parts.append(c)
    for sx in (-1, 1):                                                               # a pair of loop handles
        bpy.ops.mesh.primitive_torus_add(major_radius=0.1, minor_radius=0.022, major_segments=28, minor_segments=10, location=(sx * 0.585, 0, 1.03), rotation=(math.pi / 2, 0, 0))
        parts.append(bpy.context.object)
    return join(parts, 'urn')

def finial():
    """Ball finial for the gate piers; sits on z 0."""
    p = Prof(0.21, 0).to(0.21, 0.04).cove(0.1, 0.12, 0.02, 8).torus(0.1, 0.171, 0.028, 8)
    R, c = 0.25, 0.4; t0 = -math.acos(0.1 / R)
    for i in range(1, 25): t = t0 + (math.pi / 2 - t0) * i / 24; p.to(max(0.0, R * math.cos(t)) if i < 24 else 0.0, c + R * math.sin(t))
    return revolve('finial', p, None, segs=64, step=0.03)

# ----------------------------------------------------------------------------------------------- finishing
def activate(ob):
    for o in bpy.context.scene.objects: o.select_set(False)
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
def join(parts, name):
    for o in bpy.context.scene.objects: o.select_set(False)
    for o in parts:
        o.select_set(True); bpy.context.view_layer.objects.active = o
        for m in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join(); parts[0].name = name; parts[0].data.name = name; return parts[0]

def weather(ob, amp=0.0028, seed=0):
    """Two centuries outdoors: a slow wobble in every surface and fine pitting, pushed along the vertex normals."""
    me = ob.data; off = Vector((seed * 7.3, seed * 3.1, seed * 5.7))
    for v in me.vertices:
        q = v.co + off
        d = amp * 1.6 * noise.noise(q * 2.3) + amp * noise.noise(q * 9.0) + amp * 0.5 * noise.noise(q * 31.0)
        v.co += v.normal * d
    me.update()

def simplify(ob, ratio):
    activate(ob)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=0.0004); bpy.ops.object.mode_set(mode='OBJECT')
    if ratio < 1:
        m = ob.modifiers.new('decimate', 'DECIMATE'); m.ratio = ratio; bpy.ops.object.modifier_apply(modifier=m.name)
    for poly in ob.data.polygons: poly.use_smooth = True
    try: ob.data.set_sharp_from_angle(angle=math.radians(42))
    except Exception as e: print('  (no sharp-from-angle:', e, ')')

def bake_ao(ob, others=()):
    """Cycles ambient occlusion, stored per face-corner in a colour attribute the glTF exporter writes as COLOR_0."""
    me = ob.data
    if not me.materials: me.materials.append(STONE)
    col = me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER'); me.color_attributes.active_color = col
    try: me.color_attributes.render_color_index = 0
    except Exception: pass
    for o in bpy.context.scene.objects: o.hide_render = not (o is ob or o in others)   # creases only: the garden's own lighting does the rest
    activate(ob)
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    n = len(me.loops); c = np.empty(n * 4, np.float32); col.data.foreach_get('color', c); c = c.reshape(n, 4)
    g = np.clip(c[:, 0], 0, 1) ** 1.6; g = 0.3 + 0.7 * g                              # a little contrast; never fully black
    return me, col, g

def store(me, col, g):
    """Average the baked corners onto the vertices (so the export need not split them) and keep that as the colour layer."""
    nv = len(me.vertices); vi = np.empty(len(me.loops), np.int32); me.loops.foreach_get('vertex_index', vi)
    tot = np.zeros(nv, np.float64); cnt = np.zeros(nv, np.float64); np.add.at(tot, vi, g); np.add.at(cnt, vi, 1); vg = (tot / np.maximum(cnt, 1)).astype(np.float32)
    me.color_attributes.remove(col); pc = me.color_attributes.new('Col', 'BYTE_COLOR', 'POINT'); me.color_attributes.active_color = pc
    c = np.ones((nv, 4), np.float32); c[:, 0] = c[:, 1] = c[:, 2] = vg; pc.data.foreach_set('color', c.ravel()); me.update()

# ----------------------------------------------------------------------------------------------- build
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = 16
scene.unit_settings.system = 'METRIC'
if scene.world is None: scene.world = bpy.data.worlds.new('World')
try: scene.world.light_settings.distance = 0.7
except Exception: pass
STONE = bpy.data.materials.new('limestone'); STONE.diffuse_color = (0.74, 0.71, 0.63, 1)
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0)); ground = bpy.context.object; ground.name = 'ground'

SPEC = [  # builder, decimate ratio
    (fountain_grand, 0.24), (fountain_bowl, 0.3), (lambda: pool('pool_grand', 4.6, 30), 0.42), (lambda: pool('pool_bowl', 1.9, 14), 0.42), (urn, 0.3), (finial, 0.6)]
made = []
for i, (fn, ratio) in enumerate(SPEC):
    ob = fn(); weather(ob, seed=i + 1); simplify(ob, ratio)
    me, col, g = bake_ao(ob)
    if ob.name.startswith('pool'):                                                       # each coping stone its own slightly different tone
        blocks = 30 if ob.name == 'pool_grand' else 14; rs = np.random.RandomState(blocks); tone = rs.uniform(0.86, 1.06, blocks)
        co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
        vi = np.empty(len(me.loops), np.int32); me.loops.foreach_get('vertex_index', vi)
        ang = np.arctan2(co[vi, 1], co[vi, 0]) % TAU; g = g * tone[(ang / (TAU / blocks)).astype(int) % blocks]
    store(me, col, np.clip(g, 0, 1))
    print(f'{ob.name}: {len(me.vertices)} vertices, {sum(len(p.vertices) - 2 for p in me.polygons)} triangles', flush=True)
    made.append(ob)

# ----------------------------------------------------------------------------------------------- export
os.makedirs(os.path.join(ROOT, 'assets', 'models'), exist_ok=True); os.makedirs(os.path.join(ROOT, 'blender'), exist_ok=True)
for o in scene.objects: o.select_set(o in made); o.hide_render = False
bpy.context.view_layer.objects.active = made[0]
want = dict(filepath=os.path.join(ROOT, 'assets', 'models', 'stone.gltf'), export_format='GLTF_SEPARATE', use_selection=True, export_apply=True, export_texcoords=False, export_normals=True,
            export_materials='EXPORT', export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_active_vertex_color_when_no_material=True, export_yup=True, export_animations=False, export_cameras=False, export_lights=False)
props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
bpy.ops.export_scene.gltf(**{k: v for k, v in want.items() if k in props})
sys.path.insert(0, os.path.join(ROOT, 'tools')); import gltf_embed; gltf_embed.embed(want['filepath'])   # -> assets/models/stone.json

# lay the pieces out side by side, light them, and save a scene worth opening
if '--no-preview' not in sys.argv:
    for o, x in zip(made, (0, 5.2, 0, 5.2, 8.2, 9.6)): o.location.x = x
    try:
        nt = STONE.node_tree if STONE.node_tree else None
        if nt is None: STONE.use_nodes = True; nt = STONE.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); attr = nt.nodes.new('ShaderNodeVertexColor'); attr.layer_name = 'Col'
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs[0].default_value = 1.0
        mix.inputs[6].default_value = (0.74, 0.71, 0.63, 1); nt.links.new(attr.outputs['Color'], mix.inputs[7]); nt.links.new(mix.outputs[2], bsdf.inputs['Base Color']); bsdf.inputs['Roughness'].default_value = 0.85
    except Exception as e: print('  (preview material:', e, ')')
    bpy.ops.object.light_add(type='SUN', rotation=(math.radians(52), 0, math.radians(35))); bpy.context.object.data.energy = 3.2; bpy.context.object.data.angle = math.radians(3)
    try:
        scene.world.use_nodes = True; bg = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs[0].default_value = (0.55, 0.68, 0.9, 1); bg.inputs[1].default_value = 0.9
    except Exception as e: print('  (world:', e, ')')
    bpy.ops.object.camera_add(location=(3.6, -12.5, 3.3), rotation=(math.radians(80), 0, math.radians(2))); cam = bpy.context.object; cam.data.lens = 40; scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = 1280, 560; scene.cycles.samples = 40
    try: scene.cycles.use_denoising = False
    except Exception: pass
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'blender', 'stone.blend'))
    if '--no-render' not in sys.argv: scene.render.filepath = os.path.join(ROOT, 'blender', 'stone_preview.png'); bpy.ops.render.render(write_still=True)
    print('saved blender/stone.blend and a preview render')
