#!/usr/bin/env python3
"""The walker's own body for Garden of Delight: a hard-shell suit for a future astronaut, modelled in Blender by script.

    blender -b -P tools/blender/build_astronaut.py        or        python3 tools/blender/build_astronaut.py

Writes assets/models/astronaut.json (glTF) and blender/astronaut.blend.

The suit is built the way a real hard suit is: rigid shells joined by bearing rings, with a dark ball at every joint, so
the web app can pose it by turning whole segments and never needs skinning. One object per segment, its origin at the
joint it turns about. Front is -Y in Blender (+Z in the exported file); the wearer's left is +X.

Every shell carries one flat colour in its vertex colours; alpha names how the cel shader treats it:
1.0 painted shell, 0.8 gloss (metal, visor), 0.6 glowing, 0.4 soft (rubber, fabric)."""
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

WHITE = (0.80, 0.82, 0.86, 1.0); GREY = (0.34, 0.37, 0.43, 1.0); ORANGE = (1.0, 0.30, 0.035, 1.0)
METAL = (0.55, 0.59, 0.66, 0.8); VISOR = (0.95, 0.56, 0.10, 0.8)
GLOW = (0.25, 0.95, 1.0, 0.6); AMBER = (1.0, 0.62, 0.12, 0.6); LAMP = (1.0, 0.95, 0.82, 0.6)
DARK = (0.055, 0.06, 0.075, 0.4)

J = {  # joints, Blender coordinates (left side; mirror x for the right)
    'pelvis': (0, 0, 0.95), 'torso': (0, 0, 1.06), 'head': (0, 0, 1.50),
    'armU': (0.215, 0, 1.43), 'armL': (0.235, 0, 1.14), 'hand': (0.25, 0, 0.88),
    'thigh': (0.095, 0, 0.92), 'shin': (0.10, 0, 0.50), 'foot': (0.10, 0, 0.11),
}
PARTS = {}

def link(bm, name):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob); return ob
def activate(ob):
    for o in bpy.context.scene.objects: o.select_set(False)
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
def put(seg, ob, col, bevel=0.0, sharp=38):
    """Finish a shell (bevel, smooth shading, one flat colour) and file it under its segment."""
    activate(ob)
    if bevel:
        m = ob.modifiers.new('bevel', 'BEVEL'); m.width = bevel; m.segments = 2; m.limit_method = 'ANGLE'; m.angle_limit = math.radians(40)
        bpy.ops.object.modifier_apply(modifier=m.name)
    me = ob.data
    for p in me.polygons: p.use_smooth = True
    try: me.set_sharp_from_angle(angle=math.radians(sharp))
    except Exception: pass
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    for d in ca.data: d.color = col
    me.color_attributes.active_color = ca
    PARTS.setdefault(seg, []).append(ob); return ob

def se(t, e):                                      # a point on a superellipse: e = 2 round, larger = squarer
    c, s = math.cos(t), math.sin(t); p = 2.0 / e
    return math.copysign(abs(c) ** p, c), math.copysign(abs(s) ** p, s)
def loft(name, secs, n=32, axis='z', rnd=(0.0, 0.0)):
    """Skin a run of cross-sections (t, cu, cv, ru, rv[, e]) along an axis; rnd rounds the first and last ends by that much."""
    secs = [tuple(s) + ((2.0,) if len(s) < 6 else ()) for s in secs]
    def cap(s, r, sign):
        out = []
        for j in (1, 2, 3):
            a = j / 3 * math.radians(78); k = r * (1 - math.cos(a))
            out.append((s[0] + sign * r * math.sin(a), s[1], s[2], max(s[3] - k, 1e-3), max(s[4] - k, 1e-3), s[5]))
        return out
    d = 1 if secs[-1][0] > secs[0][0] else -1
    if rnd[0]: secs = cap(secs[0], rnd[0], -d)[::-1] + secs
    if rnd[1]: secs = secs + cap(secs[-1], rnd[1], d)
    bm = bmesh.new(); rings = []
    for t, cu, cv, ru, rv, e in secs:
        ring = []
        for i in range(n):
            C, S = se(math.tau * i / n, e); u, v = cu + ru * C, cv + rv * S
            ring.append(bm.verts.new((u, v, t) if axis == 'z' else (u, t, v) if axis == 'y' else (t, u, v)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(n): bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); return link(bm, name)
def tube(name, pts, radii, n=12, flat=1.0, up=None, rnd=True, e=2.0):
    """A round (or flattened) section swept along a path, with rounded ends."""
    pts = [Vector(p) for p in pts]; rr = list(radii) if isinstance(radii, (list, tuple)) else [radii] * len(pts)
    if rnd:
        t0 = (pts[0] - pts[1]).normalized(); t1 = (pts[-1] - pts[-2]).normalized(); r0, r1 = rr[0] * flat, rr[-1] * flat
        pts = [pts[0] + t0 * r0 * 0.92, pts[0] + t0 * r0 * 0.6] + pts + [pts[-1] + t1 * r1 * 0.6, pts[-1] + t1 * r1 * 0.92]
        rr = [rr[0] * 0.38, rr[0] * 0.8] + rr + [rr[-1] * 0.8, rr[-1] * 0.38]
    bm = bmesh.new(); rings = []; prev = None
    for i, p in enumerate(pts):
        tan = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        if prev is None:
            ref = Vector(up) if up else (Vector((0, 0, 1)) if abs(tan.z) < 0.9 else Vector((1, 0, 0)))
            nrm = (ref - tan * ref.dot(tan)).normalized()
        else: nrm = (prev - tan * prev.dot(tan)).normalized()
        bn = tan.cross(nrm); prev = nrm; ring = []
        for j in range(n):
            C, S = se(math.tau * j / n, e); ring.append(bm.verts.new(p + nrm * (C * rr[i] * flat) + bn * (S * rr[i])))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(n): bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); return link(bm, name)
def box(name, c, size, rz=0.0, rx=0.0):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    M = Matrix.Translation(c) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Diagonal((size[0], size[1], size[2], 1.0))
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts); return link(bm, name)
def ball(name, c, r, scale=(1, 1, 1), seg=28, rings=14):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(c) @ Matrix.Diagonal((scale[0], scale[1], scale[2], 1.0)), verts=bm.verts); return link(bm, name)
def ring(name, c, R, r, axis='z', ry=None, major=36, minor=8):
    """A bearing ring: a torus about an axis; ry makes it elliptical (the second radius)."""
    bm = bmesh.new(); ry = R if ry is None else ry
    rows = []
    for i in range(major):
        a = math.tau * i / major; row = []
        for j in range(minor):
            b = math.tau * j / minor; k = 1 + r * math.cos(b) / max(R, ry)
            u, v, w = R * math.cos(a) * k, ry * math.sin(a) * k, r * math.sin(b)
            p = (u, v, w) if axis == 'z' else (u, w, v) if axis == 'y' else (w, u, v)
            row.append(bm.verts.new((c[0] + p[0], c[1] + p[1], c[2] + p[2])))
        rows.append(row)
    for i in range(major):
        a, b = rows[i], rows[(i + 1) % major]
        for j in range(minor): bm.faces.new((a[j], a[(j + 1) % minor], b[(j + 1) % minor], b[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); return link(bm, name)

bpy.ops.wm.read_factory_settings(use_empty=True); scene = bpy.context.scene

# ---------------------------------------------------------------- torso: hard upper shell, chest unit, life-support pack
put('torso', loft('shell', [(1.075, 0, 0.0, 0.136, 0.104, 2.4), (1.12, 0, -0.003, 0.15, 0.112, 2.5), (1.20, 0, -0.008, 0.172, 0.125, 2.6),
                            (1.30, 0, -0.012, 0.188, 0.135, 2.6), (1.38, 0, -0.008, 0.19, 0.13, 2.5), (1.43, 0, 0.0, 0.176, 0.118, 2.4),
                            (1.47, 0, 0.004, 0.146, 0.105, 2.2), (1.495, 0, 0.006, 0.118, 0.098, 2.0)], n=40, rnd=(0.012, 0.0)), WHITE)
ribs = [(1.0 + 0.011 * i, 0, 0, 0.128 + (0.008 if i % 2 else 0), 0.098 + (0.008 if i % 2 else 0), 2.4) for i in range(9)]
put('torso', loft('waist', ribs, n=32), DARK, sharp=80)
put('torso', ring('collar', (0, 0.006, 1.498), 0.118, 0.013, ry=0.1), METAL)
put('torso', loft('neckseal', [(1.49, 0, 0.006, 0.108, 0.09), (1.512, 0, 0.006, 0.1, 0.084)], n=28), DARK)
for s in (1, -1):
    put('torso', ball('pauldron', (s * 0.213, 0, 1.432), 1, (0.083, 0.085, 0.078)), WHITE)
    put('torso', tube('strap', [(s * 0.088, -0.139, 1.33), (s * 0.094, -0.136, 1.40), (s * 0.1, -0.1, 1.462), (s * 0.102, -0.02, 1.488), (s * 0.1, 0.08, 1.462), (s * 0.096, 0.125, 1.40)],
                      0.023, n=12, flat=0.32, up=(s, 0, 0), e=3.0), GREY)
    put('torso', box('buckle', (s * 0.091, -0.146, 1.368), (0.036, 0.012, 0.026), rx=-0.12), ORANGE, 0.003)
# chest unit: what you see first when you look down
put('torso', box('unit', (0, -0.158, 1.268), (0.176, 0.064, 0.118)), GREY, 0.012)
put('torso', box('unit_top', (0, -0.16, 1.329), (0.15, 0.046, 0.008)), WHITE, 0.003)
put('torso', box('readout', (-0.022, -0.16, 1.3335), (0.082, 0.026, 0.004)), GLOW)
for i, c in enumerate((AMBER, GLOW)): put('torso', box('pip', (0.04 + i * 0.02, -0.16, 1.3335), (0.011, 0.011, 0.005)), c)
put('torso', box('screen', (-0.03, -0.1905, 1.282), (0.08, 0.004, 0.046)), GLOW)
put('torso', box('bezel', (-0.03, -0.189, 1.282), (0.092, 0.004, 0.058)), DARK)
for z, c in ((1.298, ORANGE), (1.258, DARK)): put('torso', tube('knob', [(0.052, -0.186, z), (0.052, -0.203, z)], 0.0135, n=14, rnd=False), c, 0.002)
put('torso', box('switches', (0.052, -0.19, 1.226), (0.03, 0.006, 0.012)), METAL, 0.002)
put('torso', tube('hose', [(0.088, -0.162, 1.245), (0.118, -0.15, 1.225), (0.158, -0.09, 1.2), (0.168, 0.0, 1.195), (0.15, 0.09, 1.2), (0.12, 0.125, 1.21)], 0.0125, n=10), DARK)
put('torso', tube('hose_collar', [(0.093, -0.16, 1.242), (0.108, -0.154, 1.232)], 0.0165, n=12, rnd=False), ORANGE)
put('torso', tube('cable', [(-0.088, -0.165, 1.29), (-0.13, -0.14, 1.3), (-0.176, -0.07, 1.31), (-0.188, 0.02, 1.32), (-0.16, 0.11, 1.33)], 0.007, n=8), DARK)
# mission patch (left breast) and name tape (right)
put('torso', tube('patch', [(0.088, -0.118, 1.398), (0.088, -0.134, 1.398)], 0.027, n=20, rnd=False), ORANGE)
put('torso', tube('patch_in', [(0.088, -0.12, 1.398), (0.088, -0.1365, 1.398)], 0.018, n=20, rnd=False), WHITE)
put('torso', tube('patch_dot', [(0.088, -0.12, 1.398), (0.088, -0.1385, 1.398)], 0.007, n=12, rnd=False), DARK)
put('torso', box('tape', (-0.088, -0.129, 1.398), (0.064, 0.012, 0.02), rz=-0.1), DARK, 0.002)
put('torso', box('tape_led', (-0.068, -0.134, 1.398), (0.008, 0.008, 0.008), rz=-0.1), AMBER)
# life-support pack
put('torso', box('pack', (0, 0.185, 1.275), (0.31, 0.13, 0.41)), WHITE, 0.03)
put('torso', box('pack_panel', (0, 0.253, 1.29), (0.2, 0.012, 0.25)), GREY, 0.006)
for i in range(4): put('torso', box('vent', (-0.02, 0.26, 1.2 + i * 0.045), (0.11, 0.006, 0.016)), DARK)
put('torso', box('pack_strip', (0.118, 0.2515, 1.29), (0.012, 0.006, 0.22)), GLOW)
put('torso', box('pack_base', (0, 0.18, 1.085), (0.24, 0.1, 0.06)), GREY, 0.015)
put('torso', tube('antenna', [(0.12, 0.2, 1.47), (0.12, 0.203, 1.6), (0.12, 0.215, 1.74)], 0.0045, n=8), GREY)
put('torso', ball('antenna_tip', (0.12, 0.216, 1.745), 0.012, seg=12, rings=8), ORANGE)

# ---------------------------------------------------------------- pelvis: brief shell, belt, hip balls
put('pelvis', loft('brief', [(0.865, 0, 0, 0.118, 0.094, 2.6), (0.9, 0, 0, 0.154, 0.11, 2.6), (0.96, 0, 0, 0.16, 0.112, 2.5), (1.0, 0, 0, 0.148, 0.108, 2.4)], n=40, rnd=(0.03, 0.0)), WHITE)
put('pelvis', loft('belt', [(0.982, 0, 0, 0.163, 0.116, 2.5), (1.024, 0, 0, 0.159, 0.114, 2.5)], n=40, rnd=(0.004, 0.004)), GREY)
put('pelvis', box('buckle', (0, -0.12, 1.003), (0.062, 0.016, 0.048)), METAL, 0.005)
put('pelvis', box('buckle_pip', (0, -0.1285, 1.003), (0.026, 0.004, 0.012)), GLOW)
put('pelvis', box('pouch', (0.112, -0.09, 0.972), (0.064, 0.04, 0.078), rz=0.62), GREY, 0.008)
put('pelvis', box('pouch_tab', (0.123, -0.105, 0.995), (0.03, 0.012, 0.02), rz=0.62), ORANGE, 0.003)
put('pelvis', ring('clip', (-0.126, -0.092, 0.972), 0.022, 0.0055, axis='x', minor=6, major=20), METAL)
put('pelvis', box('clip_loop', (-0.118, -0.085, 1.0), (0.03, 0.03, 0.022), rz=-0.62), ORANGE, 0.004)
for s in (1, -1): put('pelvis', ball('hip', (s * 0.095, 0, 0.92), 0.089), DARK)

# ---------------------------------------------------------------- limbs, mirrored
def side(s):
    T = lambda seg: seg + ('_L' if s > 0 else '_R')
    # upper arm
    a = T('armU')
    put(a, ball('shoulder', (s * 0.215, 0, 1.43), 0.066), DARK)
    put(a, loft('upper', [(1.388, s * 0.222, 0, 0.058, 0.06), (1.30, s * 0.227, 0, 0.056, 0.058), (1.20, s * 0.232, 0, 0.05, 0.052), (1.18, s * 0.233, 0, 0.048, 0.05)], n=28, rnd=(0.008, 0.008)), WHITE)
    put(a, ring('ring', (s * 0.221, 0, 1.386), 0.06, 0.009, ry=0.062), METAL)
    put(a, ring('ring', (s * 0.233, 0, 1.182), 0.05, 0.008, ry=0.052), METAL)
    if s < 0: put(a, loft('band', [(1.262, s * 0.229, 0, 0.0572, 0.0592), (1.298, s * 0.227, 0, 0.0592, 0.0612)], n=28, rnd=(0.002, 0.002)), ORANGE)
    else:
        put(a, box('flag', (s * 0.284, 0, 1.3), (0.006, 0.058, 0.038)), GREY, 0.002)
        put(a, box('flag_bar', (s * 0.2865, 0, 1.3), (0.004, 0.046, 0.009)), GLOW)
    put(a, ball('elbow', (s * 0.235, 0, 1.14), 0.053), DARK)
    # forearm
    f = T('armL')
    put(f, loft('fore', [(1.1, s * 0.237, 0, 0.047, 0.049), (1.04, s * 0.24, 0, 0.05, 0.052), (0.96, s * 0.245, 0, 0.046, 0.047), (0.922, s * 0.248, 0, 0.043, 0.044)], n=28, rnd=(0.008, 0.004)), WHITE)
    put(f, ring('ring', (s * 0.237, 0, 1.1), 0.049, 0.008, ry=0.051), METAL)
    put(f, loft('cuff', [(0.898, s * 0.249, 0, 0.049, 0.05), (0.93, s * 0.248, 0, 0.049, 0.05)], n=28, rnd=(0.004, 0.004)), ORANGE)
    ang = math.radians(42); d = Vector((s * math.sin(ang), -math.cos(ang), 0)); ax = Vector((s * 0.242, 0, 1.005))
    if s > 0:   # wrist display, turned to face you
        put(f, box('wrist', ax + d * 0.05, (0.064, 0.016, 0.082), rz=s * ang), GREY, 0.005)
        put(f, box('wrist_screen', ax + d * 0.0585, (0.046, 0.004, 0.05), rz=s * ang) , GLOW)
        put(f, box('wrist_key', ax + d * 0.0585 + Vector((0, 0, -0.033)), (0.02, 0.005, 0.008), rz=s * ang), AMBER)
    else:       # a torch clipped along the other forearm
        put(f, tube('torch', [ax + d * 0.058 + Vector((0, 0, 0.05)), ax + d * 0.056 + Vector((0, 0, -0.045))], 0.013, n=12, rnd=False), GREY, 0.002)
        put(f, tube('torch_head', [ax + d * 0.056 + Vector((0, 0, -0.045)), ax + d * 0.056 + Vector((0, 0, -0.062))], 0.016, n=12, rnd=False), ORANGE, 0.002)
        put(f, box('torch_clip', ax + d * 0.05 + Vector((0, 0, 0.01)), (0.036, 0.012, 0.018), rz=s * ang), DARK, 0.002)
    # glove: relaxed, fingers curling in toward the leg, thumb forward
    h = T('hand')
    put(h, ball('wrist', (s * 0.25, 0, 0.882), 0.041, seg=20, rings=10), DARK)
    put(h, loft('palm', [(0.866, s * 0.25, -0.002, 0.024, 0.04, 2.6), (0.83, s * 0.25, -0.004, 0.027, 0.047, 2.8), (0.79, s * 0.25, -0.002, 0.026, 0.046, 2.8), (0.774, s * 0.25, -0.002, 0.023, 0.043, 2.6)], n=24, rnd=(0.008, 0.008)), GREY)
    put(h, box('guard', (s * 0.279, -0.002, 0.822), (0.012, 0.062, 0.05)), WHITE, 0.005)
    put(h, box('guard_pip', (s * 0.2855, -0.002, 0.83), (0.004, 0.03, 0.008)), GLOW)
    put(h, tube('knuckles', [(s * 0.268, -0.04, 0.784), (s * 0.268, 0.036, 0.784)], 0.0125, n=10), ORANGE)
    for i, L in enumerate((0.078, 0.086, 0.08, 0.066)):
        y = -0.0345 + i * 0.0228; p0 = Vector((s * 0.251, y, 0.782)); p1 = p0 + Vector((-s * 0.004, 0, -L * 0.42)); p2 = p1 + Vector((-s * 0.02, 0, -L * 0.34)); p3 = p2 + Vector((-s * 0.026, 0, -L * 0.2))
        put(h, tube('finger', [p0, p1, p2], [0.0125, 0.012, 0.0115], n=10), WHITE)
        put(h, tube('tip', [p2, p3], [0.0122, 0.0112], n=10), DARK)
    t0 = Vector((s * 0.246, -0.043, 0.838)); t1 = Vector((s * 0.24, -0.064, 0.808)); t2 = Vector((s * 0.229, -0.074, 0.778))
    put(h, tube('thumb', [t0, t1], [0.015, 0.0135], n=10), WHITE); put(h, tube('thumb_tip', [t1, t2], [0.0138, 0.012], n=10), DARK)
    # thigh
    th = T('thigh')
    put(th, loft('thigh', [(0.878, s * 0.098, 0, 0.086, 0.09, 2.2), (0.80, s * 0.1, -0.004, 0.084, 0.088, 2.2), (0.68, s * 0.1, -0.004, 0.075, 0.08), (0.575, s * 0.1, 0, 0.066, 0.07), (0.552, s * 0.1, 0, 0.062, 0.066)], n=32, rnd=(0.008, 0.008)), WHITE)
    put(th, ring('ring', (s * 0.098, 0, 0.876), 0.088, 0.011, ry=0.092), METAL)
    put(th, ring('ring', (s * 0.1, 0, 0.555), 0.064, 0.009, ry=0.068), METAL)
    if s > 0: put(th, loft('band', [(0.69, s * 0.1, -0.004, 0.0785, 0.0835), (0.735, s * 0.1, -0.004, 0.0815, 0.0862)], n=32, rnd=(0.002, 0.002)), ORANGE)
    else:
        a2 = math.radians(40); d2 = Vector((s * math.sin(a2), -math.cos(a2), 0)); c2 = Vector((s * 0.1, -0.004, 0.72))
        put(th, box('pocket', c2 + d2 * 0.079, (0.082, 0.034, 0.118), rz=s * a2), GREY, 0.008)
        put(th, box('pocket_flap', c2 + d2 * 0.084 + Vector((0, 0, 0.042)), (0.088, 0.034, 0.036), rz=s * a2), WHITE, 0.006)
        put(th, box('pocket_tab', c2 + d2 * 0.101 + Vector((0, 0, 0.03)), (0.024, 0.008, 0.02), rz=s * a2), ORANGE, 0.002)
    put(th, ball('knee', (s * 0.1, 0, 0.5), 0.067), DARK)
    # shin, with the knee pad and a light down the front
    sh = T('shin')
    put(sh, loft('shin', [(0.455, s * 0.1, 0, 0.06, 0.064), (0.4, s * 0.1, 0.006, 0.064, 0.07), (0.3, s * 0.1, 0.008, 0.06, 0.066), (0.2, s * 0.1, 0.002, 0.052, 0.056), (0.166, s * 0.1, 0, 0.05, 0.053)], n=28, rnd=(0.008, 0.006)), WHITE)
    put(sh, ring('ring', (s * 0.1, 0, 0.455), 0.062, 0.009, ry=0.066), METAL)
    put(sh, ball('kneepad', (s * 0.1, -0.05, 0.502), 1, (0.06, 0.04, 0.074), seg=24, rings=12), ORANGE)
    put(sh, ball('kneepad_boss', (s * 0.1, -0.078, 0.502), 1, (0.03, 0.016, 0.04), seg=16, rings=8), GREY)
    put(sh, box('greave', (s * 0.1, -0.06, 0.315), (0.04, 0.02, 0.2)), GREY, 0.008)
    put(sh, box('greave_light', (s * 0.1, -0.0705, 0.315), (0.009, 0.004, 0.14)), GLOW)
    put(sh, ball('ankle', (s * 0.1, 0, 0.112), 0.056, seg=20, rings=10), DARK)
    # boot
    b = T('foot'); x = s * 0.1; x2 = s * 0.104
    put(b, loft('upper', [(0.086, x, 0.076, 0.03, 0.03, 2.4), (0.07, x, 0.086, 0.046, 0.05, 2.4), (0.03, x, 0.096, 0.055, 0.062, 2.5), (-0.02, x, 0.09, 0.057, 0.058, 2.6), (-0.07, x2, 0.078, 0.059, 0.046, 2.6),
                        (-0.13, x2, 0.07, 0.059, 0.038, 2.6), (-0.18, x2, 0.062, 0.051, 0.03, 2.6), (-0.206, x2, 0.056, 0.036, 0.022, 2.4)], n=28, axis='y', rnd=(0.006, 0.01)), WHITE)
    put(b, loft('sole', [(0.098, x, 0.021, 0.05, 0.021, 4.0), (0.05, x, 0.021, 0.061, 0.021, 4.0), (-0.07, x2, 0.021, 0.066, 0.021, 4.0), (-0.16, x2, 0.021, 0.064, 0.021, 4.0), (-0.212, x2, 0.022, 0.048, 0.02, 4.0)],
                n=28, axis='y', rnd=(0.008, 0.012)), DARK)
    put(b, ball('toecap', (x2, -0.166, 0.058), 1, (0.054, 0.052, 0.036), seg=24, rings=12), GREY)
    put(b, loft('strap', [(-0.082, x2, 0.077, 0.0615, 0.0465, 2.6), (-0.046, x2 - s * 0.002, 0.083, 0.0605, 0.0525, 2.6)], n=28, axis='y', rnd=(0.003, 0.003)), ORANGE)
    put(b, box('strap_buckle', (x2 + s * 0.058, -0.064, 0.085), (0.01, 0.03, 0.03)), METAL, 0.003)
    put(b, box('toe_light', (x2, -0.122, 0.1085), (0.064, 0.013, 0.006), rx=-0.14), GLOW)
    put(b, loft('cuff', [(0.118, x, 0.012, 0.059, 0.062), (0.158, x, 0.008, 0.061, 0.064)], n=28, rnd=(0.004, 0.006)), GREY)
    put(b, box('heel', (x, 0.086, 0.068), (0.066, 0.03, 0.07)), GREY, 0.008)
side(1); side(-1)

# ---------------------------------------------------------------- head: you never see it, but your shadow and the water do
hc = Vector((0, -0.03, 1.665))
put('head', ball('helmet', hc, 1, (0.172, 0.186, 0.176), seg=36, rings=18), WHITE)
put('head', ball('visor', (0, -0.088, 1.674), 1, (0.151, 0.15, 0.126), seg=32, rings=16), VISOR)
crest = [(0, hc.y - 0.188 * math.sin(a), hc.z + 0.178 * math.cos(a)) for a in [math.radians(v) for v in (38, 20, 0, -20, -40, -60, -78)]]
put('head', tube('crest', crest, 0.02, n=10, flat=0.45, up=(0, 0, 1)), ORANGE)
put('head', loft('base', [(1.5, 0, 0.004, 0.126, 0.11), (1.545, 0, -0.004, 0.14, 0.132)], n=32, rnd=(0.004, 0.0)), GREY)
put('head', ring('base_ring', (0, 0.004, 1.512), 0.129, 0.011, ry=0.113), METAL)
for s in (1, -1):
    put('head', box('lamp', (s * 0.17, -0.07, 1.705), (0.034, 0.076, 0.044)), GREY, 0.008)
    put('head', box('lamp_lens', (s * 0.17, -0.109, 1.705), (0.024, 0.005, 0.03)), LAMP)
    put('head', tube('ear', [(s * 0.168, -0.01, 1.64), (s * 0.184, -0.01, 1.64)], 0.03, n=18, rnd=False), GREY, 0.004)

# ---------------------------------------------------------------- one object per segment, origin at its joint
made = []
for seg, obs in PARTS.items():
    for o in scene.objects: o.select_set(o in obs)
    bpy.context.view_layer.objects.active = obs[0]; bpy.ops.object.join()
    ob = obs[0]; ob.name = ob.data.name = seg
    base = seg.split('_')[0]; jx, jy, jz = J[base]; j = Vector((-jx if seg.endswith('_R') else jx, jy, jz))
    ob.data.transform(Matrix.Translation(-j)); ob.location = j; made.append(ob)
    print(f'{seg:9s} {len(ob.data.polygons):6d} faces')
print('total', sum(len(o.data.polygons) for o in made), 'faces')

for o in scene.objects: o.select_set(o in made)
bpy.context.view_layer.objects.active = made[0]
want = dict(filepath=os.path.join(ROOT, 'assets', 'models', 'astronaut.gltf'), export_format='GLTF_SEPARATE', use_selection=True, export_apply=True, export_texcoords=False, export_normals=True,
            export_materials='EXPORT', export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_active_vertex_color_when_no_material=True, export_yup=True, export_animations=False, export_cameras=False, export_lights=False)
props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
bpy.ops.export_scene.gltf(**{k: v for k, v in want.items() if k in props})
sys.path.insert(0, os.path.join(ROOT, 'tools')); import gltf_embed; gltf_embed.embed(want['filepath'])   # -> assets/models/astronaut.json
os.makedirs(os.path.join(ROOT, 'blender'), exist_ok=True); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'blender', 'astronaut.blend'))
