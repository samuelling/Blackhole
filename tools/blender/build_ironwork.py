#!/usr/bin/env python3
"""Wrought ironwork for the garden, modelled in Blender from photographs of estate gates and garden rose arches.

    python3 tools/blender/build_ironwork.py            (bpy as a module)

Writes assets/models/ironwork.json (glTF) and blender/ironwork.blend, with preview renders in /tmp/plants/iron_*.png.

From the photographs (Flickr and Wikimedia Commons via Openverse, credited in assets/models/IRONWORK_CREDITS.md):
- the gates: a pair of leaves hung between the piers, each a frame of flat bar with round bars between, close-set "dog bars" at the foot,
  a band of C-scrolls above them, the top rail sweeping up toward the meeting stiles in a swan-neck curve, the bars running through it
  to spear heads; above the whole opening an overthrow, an arch of scrollwork spanning pier to pier with a crest in the middle.
- the rose arch: two ladder-like sides of twin uprights joined by rungs, a pair of arched hoops over the top, and in each face of the
  arch head a half-round fan of radiating bars.

Sizes are the garden's own: the gateway is 3.0 m between the piers' faces (piers 2.1 m to their caps); the rose arches are 3.4 m wide,
2.1 m to the spring of the arch and 0.75 m more to the crown, their two faces 0.44 m apart (src/garden.js, roseArch).
In each part's own frame X runs across the opening, Y up, Z through it; the parts stand on y = 0.
"""
import bpy, bmesh, numpy as np, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plantkit import Geo, tube, TAU

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
R0 = (0, 0, 1, 1)
def T(pts, r, sides=6): return tube(np.asarray(pts, float), r, R0, sides=sides)
def line(a, b, n=2): a, b = np.asarray(a, float), np.asarray(b, float); return [a + (b - a) * i / (n - 1) for i in range(n)]


def scroll(c, r, turns, a0, sense, z=0.0, n=28, tail=None):
    """A flat spiral in the XY plane round c: starting at radius r and angle a0, winding inward by turns; sense +1 counter-clockwise."""
    pts = []
    for i in range(n + 1):
        f = i / n; a = a0 + sense * f * turns * TAU; rr = r * (1 - 0.78 * f)
        pts.append([c[0] + math.cos(a) * rr, c[1] + math.sin(a) * rr, z])
    if tail is not None: pts = [list(tail)] + pts
    return pts


def C_scroll(p0, p1, z, curl=0.35):
    """A C-scroll between two points: a gentle arc whose ends roll inward."""
    p0, p1 = np.array(p0, float), np.array(p1, float); m = (p0 + p1) / 2; d = p1 - p0; L = np.linalg.norm(d); u = d / L; nrm = np.array([-u[1], u[0]])
    g = Geo()
    arc = [m + u * (L / 2) * math.cos(a) + nrm * (L * curl) * math.sin(a) for a in np.linspace(math.pi, 0, 14)]
    g.put(T([[p[0], p[1], z] for p in arc], 0.0065, 5))
    for end, sgn in ((p0, 1), (p1, -1)):   # the curls
        c = end + nrm * L * 0.09 + u * sgn * L * 0.06
        g.put(T(scroll(c, L * 0.1, 1.1, math.atan2(*(end - c)[::-1]), -sgn, z), 0.0055, 5))
    return g


def spear(x, y, z, s=1.0):
    """A spear head on a bar's end."""
    return T([[x, y, z], [x, y + 0.03 * s, z], [x, y + 0.075 * s, z], [x, y + 0.11 * s, z]], np.array([0.008, 0.022, 0.012, 0.0005]) * s, 4)


def leaf(x0, x1, hinge_h, meet_h):
    """One gate leaf from x0 (the hinge, at the pier) to x1 (the meeting stile)."""
    g = Geo(); z = 0.0; W = x1 - x0; sgn = 1 if W > 0 else -1
    top = lambda x: hinge_h + (meet_h - hinge_h) * (0.5 - 0.5 * math.cos(math.pi * (x - x0) / W))   # the swan-neck sweep
    # frame
    for x in (x0, x1): g.put(T(line([x, 0.06, z], [x, top(x) + 0.02, z], 3), 0.017, 4))
    xs = np.linspace(x0, x1, 18); g.put(T([[x, top(x), z] for x in xs], 0.014, 4))
    for y in (0.08, 0.4, 0.62, 1.55): g.put(T(line([x0, y, z], [x1, y, z]), 0.012, 4))
    # bars through the top rail to spear heads; dog bars between them at the foot
    nb = int(abs(W) / 0.11);
    for i in range(1, nb):
        x = x0 + W * i / nb; h = top(x) + (0.14 if i % 2 else 0.08)
        g.put(T(line([x, 0.08, z], [x, h, z]), 0.0085, 5)); g.put(spear(x, h, z, 1.0 if i % 2 else 0.7))
        if i < nb: xd = x - W / nb / 2; g.put(T(line([xd, 0.08, z], [xd, 0.4, z]), 0.007, 5))
    # a band of C-scrolls between the rails at 0.4 and 0.62, and rings in the panel under the top rail
    for i in range(nb):
        xa, xb = x0 + W * i / nb, x0 + W * (i + 1) / nb
        g.put(C_scroll([xa + 0.01 * sgn, 0.42], [xb - 0.01 * sgn, 0.6], z, 0.3 if i % 2 else -0.3))
    for i in range(nb):
        xc = x0 + W * (i + 0.5) / nb; yc = 1.55 + 0.07
        if yc + 0.05 < top(xc): g.put(T([[xc + 0.045 * math.cos(a), yc + 0.045 * math.sin(a), z] for a in np.linspace(0, TAU, 13)], 0.005, 4))
    return g


def overthrow(half, y0, rise):
    """The scrollwork arch over the gateway, from pier to pier, with a crest in the middle."""
    g = Geo(); z = 0.0
    outer = lambda x: y0 + rise * math.cos(x / half * math.pi / 2) ** 0.8
    inner = lambda x: y0 + 0.08 + 0.12 * math.cos(x / half * math.pi / 2)
    xs = np.linspace(-half, half, 40)
    g.put(T([[x, outer(x), z] for x in xs], 0.014, 5)); g.put(T([[x, y0, z] for x in xs[[0, -1]]], 0.016, 4)); g.put(T([[x, inner(x), z] for x in xs], 0.01, 5))
    # paired C-scrolls standing between the bands, mirrored about the middle
    n = 6
    for side in (-1, 1):
        for i in range(n):
            xa = side * half * (i + 0.15) / n; xb = side * half * (i + 0.85) / n
            ya, yb = inner(xa) + 0.02, outer(xb) - 0.03
            if yb - ya < 0.08: continue
            g.put(C_scroll([xa, ya], [xb, yb], z, 0.22 * side))
        # a big volute rising to the crest
        g.put(T(scroll([side * 0.28, y0 + rise * 0.62], 0.2, 1.25, math.pi / 2 if side < 0 else math.pi / 2, side, z), 0.009, 5))
    # the crest: a ring, a cluster of leaves (flat bar spirals) and a spear finial
    yc = y0 + rise + 0.14
    g.put(T([[0.09 * math.cos(a), yc + 0.09 * math.sin(a), z] for a in np.linspace(0, TAU, 17)], 0.01, 5))
    for side in (-1, 1): g.put(T(scroll([side * 0.13, yc - 0.06], 0.1, 1.0, math.pi, -side, z), 0.007, 5))
    g.put(T(line([0, y0 + rise, z], [0, yc + 0.22, z]), 0.01, 5)); g.put(spear(0, yc + 0.22, z, 1.6))
    return g


def rose_arch():
    """Twin ladder sides, two arched hoops over the top, fans in the arch head; 3.4 m wide, 2.1 m to the spring, crown at 2.85."""
    g = Geo(); Wd, H, rise, D = 1.7, 2.1, 0.75, 0.22
    arch = lambda u: (math.cos(math.pi * (1 - u)) * Wd, H + math.sin(math.pi * (1 - u)) * rise)
    for z in (-D, D):
        pts = [[-Wd, 0, z], [-Wd, H, z]] + [[*arch(u), z] for u in np.linspace(0.02, 0.98, 30)] + [[Wd, H, z], [Wd, 0, z]]
        g.put(T(pts, 0.016, 6))
        # the fan in the arch head: a half ring and bars radiating to the hoop
        cx, cy, rr = 0, H, 0.32
        g.put(T([[cx + math.cos(a) * rr, cy + math.sin(a) * rr, z] for a in np.linspace(0, math.pi, 15)], 0.009, 5))
        for a in np.linspace(0.12, math.pi - 0.12, 9):
            d = np.array([math.cos(a), math.sin(a)]); p0 = np.array([cx, cy]) + d * rr
            # where the ray meets the hoop (an ellipse of half-widths Wd and rise)
            t = 1 / math.sqrt((d[0] / Wd) ** 2 + (d[1] / rise) ** 2); p1 = np.array([cx, cy]) + d * t
            g.put(T([[p0[0], p0[1], z], [p1[0], p1[1], z]], 0.007, 4))
        g.put(T([[-Wd, H, z], [Wd, H, z]], 0.01, 4))   # the springing bar the fan stands on
    for x in (-Wd, Wd):   # rungs up each side, and the scrolls at their feet
        for y in np.arange(0.3, H, 0.3): g.put(T([[x, y, -D], [x, y, D]], 0.009, 4))
        g.put(T([[x, -0.25, -D], [x, 0, -D]], 0.016, 4)); g.put(T([[x, -0.25, D], [x, 0, D]], 0.016, 4))   # stakes into the ground
    for u in np.linspace(0.08, 0.92, 9): x, y = arch(u); g.put(T([[x, y, -D], [x, y, D]], 0.008, 4))   # rungs over the top
    return g


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    half = 1.5
    parts = {'gate_left': leaf(-half, -0.005, 1.86, 2.12), 'gate_right': leaf(half, 0.005, 1.86, 2.12), 'overthrow': overthrow(half, 2.28, 0.62), 'rose_arch': rose_arch()}
    coll = bpy.context.scene.collection; mat = bpy.data.materials.new('iron')
    for name, g in parts.items():
        P, UV, F = g.arrays(); P = P[:, [0, 2, 1]] * [1, -1, 1]     # our Y-up frame to Blender's Z-up (the exporter turns it back)
        me = bpy.data.meshes.new(name); me.from_pydata(P.tolist(), [], F.tolist()); me.update()
        bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
        for p in me.polygons: p.use_smooth = True
        me.materials.append(mat); o = bpy.data.objects.new(name, me); coll.objects.link(o); print(name, len(F), 'triangles')
    for o in coll.objects: o.select_set(True)
    path = os.path.join(ROOT, 'assets', 'models', 'ironwork.gltf')
    want = dict(filepath=path, export_format='GLTF_SEPARATE', use_selection=True, export_texcoords=False, export_normals=True, export_materials='NONE', export_yup=True)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys(); bpy.ops.export_scene.gltf(**{k: v for k, v in want.items() if k in props})
    sys.path.insert(0, os.path.join(ROOT, 'tools')); import gltf_embed; gltf_embed.embed(path)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'blender', 'ironwork.blend'), compress=True)
    # a picture of the gate and the arch
    import mathutils
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 24; sc.render.resolution_x, sc.render.resolution_y = 800, 600
    sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True; sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.75, 0.8, 0.88, 1)
    mat.use_nodes = True; b = mat.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (0.03, 0.035, 0.03, 1); b.inputs['Metallic'].default_value = 0.6; b.inputs['Roughness'].default_value = 0.45
    cam = bpy.data.cameras.new('c'); co = bpy.data.objects.new('c', cam); coll.objects.link(co); sc.camera = co
    for nm, show, eye, look in (('gate', ('gate_left', 'gate_right', 'overthrow'), (0, -5.5, 1.6), (0, 0, 1.5)), ('arch', ('rose_arch',), (2.2, -4.6, 1.6), (0, 0, 1.5))):
        for o in coll.objects:
            if o.type == 'MESH': o.hide_render = o.name not in show
        co.location = eye; co.rotation_euler = (mathutils.Vector(look) - mathutils.Vector(eye)).to_track_quat('-Z', 'Y').to_euler(); cam.lens = 32
        sc.render.filepath = f'/tmp/plants/iron_{nm}.png'; bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    build()
    import subprocess; subprocess.run(['node', os.path.join(ROOT, 'tools', 'plants', 'compact.mjs'), os.path.join(ROOT, 'assets', 'models', 'ironwork.json')], check=True)
