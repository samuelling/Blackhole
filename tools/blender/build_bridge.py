#!/usr/bin/env python3
"""Timber footbridges for the brook, modelled in Blender from photographs of garden and park footbridges and boardwalks.

    python3 tools/blender/build_bridge.py            (bpy as a module)

Writes assets/models/bridge.json (glTF: the kit of parts), assets/tex/bridge.webp and bridge_n.webp (weathered oak, painted by script)
and blender/bridge.blend, with a preview render in /tmp/plants/bridge_*.png.

From the photographs (Wikimedia Commons and Flickr via Openverse, credited in assets/models/BRIDGE_CREDITS.md): the deck is boards laid
across the walk, 12-15 cm wide with finger-wide gaps, on two or three heavy stringers bearing on sills at each bank; posts about every
1.2 m carry a handrail at waist height and a mid rail, with diagonal braces at the ends; the timber weathers silver-grey over brown,
greener and darker low down where it stays damp.

The bridges differ in span and width, so this makes a kit and the garden lays it out (src/brook.js): boards of a few shapes, each 1 m
long (stretched to the deck's width), a stringer, sill, rail and mid rail 1 m long (stretched along the span), a post and a brace.
In each part's own frame X runs along the span, Z across it (the boards' length), Y is up, and the part sits on y = 0.
"""
import bpy, numpy as np, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plantkit import Atlas, lin, noise2, mix, band, Geo, tube, TAU

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
rg = np.random.default_rng(5)


# ---------------------------------------------------------------- the wood
def paint_wood(at, rect, seed, base='#7d6d58', grey='#9a9488', dark='#4a3e30', damp=0.0, knots=2, end_grain=False):
    """Weathered oak along a strip (t runs along the grain): brown under silver-grey, long wavy grain lines, a knot or two, the
    edges darker; damp greens the lower part."""
    r = np.random.default_rng(seed); kn = [(r.uniform(0.2, 0.8), r.uniform(0.1, 0.9), r.uniform(0.04, 0.1)) for _ in range(knots)]
    def fn(u, t):
        wav = u + 0.03 * np.sin(t * 9 + seed) + 0.02 * (noise2(u, t, 6, seed) - 0.5)
        for (ku, kt, ks) in kn:   # grain swirls round a knot
            d = np.hypot((u - ku) * 3, (t - kt) * 12) + 1e-3; wav = wav + 0.04 * ks / d * np.exp(-d * 2)
        grain = 0.5 + 0.5 * np.sin(wav * 70 + 3 * noise2(u, t * 0.2, 8, seed + 1))
        col = mix(lin(base), lin(grey), np.clip(0.55 + 0.5 * (noise2(u, t, 10, seed + 2) - 0.5) + 0.25 * grain, 0, 1))
        col = mix(col, lin(dark), (grain > 0.92) * 0.6 + 0.35 * np.clip(1 - np.minimum(u, 1 - u) * 14, 0, 1))
        for (ku, kt, ks) in kn:
            d = np.hypot((u - ku) * 3, (t - kt) * 12); col = mix(col, lin(dark), np.clip(1 - d / (ks * 3), 0, 1) ** 0.6)
        if damp: col = mix(col, lin('#4e5a3a'), damp * np.clip(noise2(u, t, 14, seed + 3) - 0.35, 0, 1))
        col = col * (1 + 0.18 * (noise2(u, t, 60, seed + 4) - 0.5))[..., None]
        hgt = 0.5 + 0.18 * grain + 0.25 * noise2(u, t, 40, seed + 5) - 0.6 * np.clip(1 - np.minimum(u, 1 - u) * 20, 0, 1)
        return col, np.ones_like(u), hgt
    at.fill(rect, fn)


# ---------------------------------------------------------------- shapes
def box(x0, x1, y0, y1, z0, z1, rect_long, rect_end, along='x', bevel=0.006, warp=None):
    """A sawn timber, slightly chamfered, its long faces mapped along the grain strip rect_long."""
    g = Geo(); b = bevel
    # an octagonal section (the chamfered arrises) swept along its length
    if along == 'x': L0, L1, a0, a1, c0, c1 = x0, x1, y0, y1, z0, z1
    else: L0, L1, a0, a1, c0, c1 = z0, z1, y0, y1, x0, x1
    sec = [(a0, c0 + b), (a0 + b, c0), (a1 - b, c0), (a1, c0 + b), (a1, c1 - b), (a1 - b, c1), (a0 + b, c1), (a0, c1 - b)]
    n = 6; P, UV, F = [], [], []
    per = np.cumsum([0] + [math.hypot(sec[(i + 1) % 8][0] - sec[i][0], sec[(i + 1) % 8][1] - sec[i][1]) for i in range(8)]); per = per / per[-1]
    for i in range(n + 1):
        s = i / n; L = L0 + (L1 - L0) * s; dy = warp(s) if warp else 0.0
        for j in range(9):
            a, c = sec[j % 8]
            p = (L, a + dy, c) if along == 'x' else (c, a + dy, L)
            P.append(p); UV.append([rect_long[0] + per[j] * (rect_long[2] - rect_long[0]), rect_long[1] + s * (rect_long[3] - rect_long[1])])
    for i in range(n):
        for j in range(8):
            q0, q1 = i * 9 + j, i * 9 + j + 1; F += [(q0, q1 + 9, q1), (q0, q0 + 9, q1 + 9)] if along == 'x' else [(q0, q1, q1 + 9), (q0, q1 + 9, q0 + 9)]
    g.add(P, UV, F)
    for end, L in ((0, L0), (1, L1)):   # end grain
        base = len(P); cap = []
        for j in range(8):
            a, c = sec[j]; cap.append((L, a, c) if along == 'x' else (c, a, L))
        cu = [[rect_end[0] + (c - min(c0, c1)) / max(abs(c1 - c0), 1e-6) * (rect_end[2] - rect_end[0]), rect_end[1] + (a - a0) / max(a1 - a0, 1e-6) * (rect_end[3] - rect_end[1])] for (a, c) in sec]
        tri = [(0, k, k + 1) for k in range(1, 7)]
        if (end == 0) == (along == 'x'): tri = [(x, z, y) for (x, y, z) in tri]
        g.put(Geo().add(cap, cu, tri))
    return g


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    at = Atlas(1024)
    boards = []
    for k in range(6):   # six boards' worth of grain, a little different in colour each
        r = at.region(64, 480); paint_wood(at, r, 10 + k, base=['#7d6d58', '#86745c', '#756652', '#8a7a62', '#7a6a55', '#837058'][k], damp=0.25, knots=int(rg.integers(1, 4))); boards.append(r)
    beam = at.region(96, 480); paint_wood(at, beam, 30, base='#6a5a46', grey='#8a8478', damp=0.6, knots=3)
    rail = at.region(64, 480); paint_wood(at, rail, 31, base='#8a7a64', grey='#a49e92', knots=1)
    post = at.region(64, 300); paint_wood(at, post, 32, base='#74644e', grey='#948e82', damp=0.5, knots=1)
    endg = at.region(64, 64)
    def ringfn(u, t):
        x, y = (u - 0.5) * 2, (t - 0.5) * 2; r = np.hypot(x - 0.6, y + 0.4); col = mix(lin('#8a7a64'), lin('#5a4a38'), (np.sin(r * 30) > 0.6) * 0.5)
        return col * (1 + 0.15 * (noise2(u, t, 30, 33) - 0.5))[..., None], np.ones_like(u), 0.5 + 0.1 * np.sin(r * 30)
    at.fill(endg, ringfn)
    os.makedirs(os.path.join(ROOT, 'assets', 'tex'), exist_ok=True)
    at.save(os.path.join(ROOT, 'assets', 'tex', 'bridge.webp'), os.path.join(ROOT, 'assets', 'tex', 'bridge_n.webp'), strength=4.0)

    parts = {}
    for k in range(6):   # boards: 1 m long (Z), 14 cm wide (X), 3.5 cm thick, each cupped or bowed a little differently
        w = 0.14 * rg.uniform(0.92, 1.05); bow = rg.uniform(-0.006, 0.006); cup = rg.uniform(0, 0.003)
        parts[f'board{k}'] = box(-w / 2, w / 2, 0, 0.035, -0.5, 0.5, boards[k], endg, along='z', warp=lambda s, bow=bow: bow * math.sin(math.pi * s))
    parts['stringer'] = box(0, 1, -0.22, 0, -0.04, 0.04, beam, endg, along='x', bevel=0.01)
    parts['sill'] = box(-0.09, 0.09, -0.2, 0, -0.5, 0.5, beam, endg, along='z', bevel=0.012)
    parts['post'] = post_geo(post, endg)
    parts['rail'] = box(0, 1, -0.045, 0.045, -0.04, 0.04, rail, endg, along='x', bevel=0.015)
    parts['midrail'] = box(0, 1, -0.035, 0.035, -0.02, 0.02, rail, endg, along='x', bevel=0.008)
    parts['brace'] = box(0, 1, -0.03, 0.03, -0.025, 0.025, post, endg, along='x', bevel=0.008)

    mat = bpy.data.materials.new('oak'); coll = bpy.context.scene.collection
    for name, g in parts.items():
        P, UV, F = g.arrays(); P = P[:, [0, 2, 1]] * [1, -1, 1]     # our Y-up frame to Blender's Z-up (the exporter turns it back)
        me = bpy.data.meshes.new(name); me.from_pydata(P.tolist(), [], F.tolist()); me.update()
        uv = me.uv_layers.new(name='UVMap'); loops = np.empty(len(me.loops), dtype=np.int32); me.loops.foreach_get('vertex_index', loops)
        uvs = UV[loops].copy(); uvs[:, 1] = 1 - uvs[:, 1]; uv.data.foreach_set('uv', uvs.ravel())
        import bmesh; bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()   # outward, whatever order they were built in
        me.materials.append(mat); o = bpy.data.objects.new(name, me); coll.objects.link(o)
        for p in me.polygons: p.use_smooth = False
        print(name, len(F), 'triangles')
    for o in coll.objects: o.select_set(True)
    path = os.path.join(ROOT, 'assets', 'models', 'bridge.gltf')
    want = dict(filepath=path, export_format='GLTF_SEPARATE', use_selection=True, export_texcoords=True, export_normals=True, export_materials='NONE', export_yup=True)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys(); bpy.ops.export_scene.gltf(**{k: v for k, v in want.items() if k in props})
    sys.path.insert(0, os.path.join(ROOT, 'tools')); import gltf_embed; gltf_embed.embed(path)
    os.makedirs(os.path.join(ROOT, 'blender'), exist_ok=True); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'blender', 'bridge.blend'), compress=True)


def post_geo(rect, endg):
    """A square post 9 cm across, 1.25 m long (0.25 of it below the deck), its top cut to a shallow pyramid to shed rain."""
    g = box(-0.25, 1.0, -0.045, 0.045, -0.045, 0.045, rect, endg, along='x', bevel=0.008)   # built lying along x (so the grain runs its length), then stood up
    P, UV, F = g.arrays(); P = P[:, [1, 0, 2]]; F = F[:, [0, 2, 1]]
    g = Geo().add(P, UV, F)
    cap = [[0, 1.03, 0], [-0.045, 1.0, -0.045], [0.045, 1.0, -0.045], [0.045, 1.0, 0.045], [-0.045, 1.0, 0.045]]
    cu = [[(endg[0] + endg[2]) / 2, (endg[1] + endg[3]) / 2]] + [[endg[0], endg[1]], [endg[2], endg[1]], [endg[2], endg[3]], [endg[0], endg[3]]]
    g.add(cap, cu, [(0, 2, 1), (0, 3, 2), (0, 4, 3), (0, 1, 4)])
    return g


if __name__ == '__main__':
    build()
    import subprocess; subprocess.run(['node', os.path.join(ROOT, 'tools', 'plants', 'compact.mjs'), os.path.join(ROOT, 'assets', 'models', 'bridge.json')], check=True)
