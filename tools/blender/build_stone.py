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

def acanthus(a, s, s0, s1, n, depth, phase=0.0, curl=0.6):
    """A ring of n acanthus leaves standing up the run s0..s1: pointed, raised, serrated, a groove down each midrib, the tips curling out."""
    if not (s0 < s < s1): return 0.0
    v = (s - s0) / (s1 - s0); u = ((a * n / TAU + phase) % 1.0) * 2 - 1                    # u: -1..1 across a leaf, v: 0 foot .. 1 tip
    w = (1 - v ** 1.6) ** 0.8 * (0.55 + 0.45 * math.sin(math.pi * min(1.0, v * 1.3)))     # its half-width: full at the foot, a point at the tip
    w *= 1 - 0.18 * abs(math.sin(v * math.pi * 6.5)) ** 1.5                               # lobed, toothed edges
    if abs(u) >= w: return 0.0
    e = 1 - abs(u) / max(w, 1e-3); rib = math.exp(-(u / 0.07) ** 2)
    return depth * (e ** 0.35 * (0.55 + 0.45 * v + curl * sstep(0.7, 1.0, v)) - 0.35 * rib * (1 - v))

def beads(a, s, s0, s1, n, depth, dart=True):
    """Egg-and-dart (or plain beading) round a moulding: ovals parted by points."""
    if not (s0 < s < s1): return 0.0
    v = (s - s0) / (s1 - s0); u = (a * n / TAU) % 1.0; egg = max(0.0, 1 - ((u - 0.5) / 0.36) ** 2 - ((v - 0.5) / 0.5) ** 2) ** 0.5
    d = math.exp(-((u - 0.0) / 0.05) ** 2) * math.exp(-((v - 0.4) / 0.35) ** 2) if dart else 0.0
    return depth * (egg - 0.45 + 0.6 * d) * math.sin(math.pi * v)

GRAND = dict(l1=(2.42, 1.72), w1=(2.27, 1.685), l2=(1.36, 2.95), w2=(1.26, 2.915), l3=(0.66, 3.92), w3=(0.58, 3.89), top=4.56)

def fountain_grand():
    """The garden's centrepiece: three scalloped, gadrooned basins diminishing up a column of acanthus-carved balusters, on an octagonal
    plinth just out of the water, crowned by a pine cone the jet rises from. The garden fits its water to the numbers in GRAND."""
    p = Prof(1.5, 0).to(1.5, 0.22).to(1.42, 0.22).to(1.42, 0.38).to(1.36, 0.42).mark('oct')                         # octagonal plinth, stepped
    p.to(1.18, 0.42).torus(1.16, 0.52, 0.05).to(1.08, 0.54).mark('b0').torus(1.06, 0.6, 0.03).mark('b1').cove(0.8, 0.7, 0.045)
    p.torus(0.78, 0.76, 0.035)
    p.mark('a0').curve(0.92, 0.86, 0.64, 1.0, 18).mark('a1')                                                         # the vase: acanthus
    p.cove(0.5, 1.04, 0.015).torus(0.5, 1.1, 0.03).to(0.54, 1.11)
    p.mark('g0').curve(1.05, 1.08, 1.75, 1.36, 30).curve(2.2, 1.5, 2.34, 1.62, 14).mark('g1')                     # a deep, gadrooned bowl, not a table
    p.to(2.37, 1.63).mark('e0').torus(2.38, 1.72, 0.045).mark('e1').to(2.3, 1.725).curve(2.27, 1.7, 2.22, 1.665, 5).curve(1.4, 1.62, 0.36, 1.62, 14)
    p.torus(0.33, 1.7, 0.03).mark('c0').curve(0.5, 1.95, 0.25, 2.32, 18).mark('c1')                                # second baluster, its own leaves
    p.cove(0.2, 2.42, 0.02).torus(0.2, 2.5, 0.03).to(0.24, 2.52)
    p.mark('h0').curve(0.85, 2.54, 1.33, 2.87, 30).mark('h1').to(1.35, 2.88).mark('f0').torus(1.36, 2.95, 0.035).mark('f1')
    p.to(1.29, 2.955).curve(1.27, 2.93, 1.23, 2.905, 5).curve(0.7, 2.86, 0.17, 2.86, 10)
    p.torus(0.15, 2.92, 0.025).mark('k0').curve(0.29, 3.15, 0.12, 3.45, 16).mark('k1').torus(0.12, 3.52, 0.025)      # the slender top baluster, fluted
    p.mark('j0').curve(0.42, 3.55, 0.64, 3.86, 18).mark('j1').to(0.65, 3.87).torus(0.66, 3.92, 0.025)                  # the top cup
    p.to(0.61, 3.925).curve(0.59, 3.9, 0.56, 3.88, 4).curve(0.3, 3.85, 0.13, 3.85, 6)
    p.torus(0.11, 3.92, 0.025).cove(0.08, 3.98, 0.012).mark('p0').curve(0.24, 4.12, 0.16, 4.36, 14).curve(0.08, 4.48, 0.0, GRAND['top'], 8).mark('p1')   # pine cone
    def mod(a, r, z, s, M):
        if s <= M['oct'] + 1e-6: d = ((a + math.pi / 8) % (math.pi / 4)) - math.pi / 8; return 0.0, 1 / math.cos(d)
        dn = beads(a, s, M['b0'], M['b1'], 56, 0.012, dart=False)
        dn += acanthus(a, s, M['a0'], M['a1'], 8, 0.05) + acanthus(a, s, M['a0'] + 0.04, M['a1'] - 0.08, 8, 0.035, phase=0.5, curl=0.3)
        dn += gadroon(a, s, M['g0'], M['g1'], 32, 0.045) + beads(a, s, M['e0'], M['e1'], 72, 0.016)
        dn += acanthus(a, s, M['c0'], M['c1'], 6, 0.03) + gadroon(a, s, M['h0'], M['h1'], 24, 0.03) + beads(a, s, M['f0'], M['f1'], 48, 0.012)
        dn += flute(a, s, M['k0'], M['k1'], 12, 0.012) + gadroon(a, s, M['j0'], M['j1'], 16, 0.02) + scales(a, s, M['p0'], M['p1'], 10, 18.0, 0.024)
        k = 1.0
        if s > M['g1'] - 0.3 and s < M['e1'] + 0.25: k += 0.012 * (abs(math.cos(16 * a)) ** 0.5 - 0.6) * sstep(M['g1'] - 0.3, M['g1'], s)   # the lip scalloped
        return dn, k
    body = revolve('fountain_grand', p, mod, segs=288, step=0.016)
    parts = [body]
    for i in range(4):   # scroll consoles buttressing the vase, between the plinth and the basin's underside
        parts.append(console(f'console{i}', i * TAU / 4 + TAU / 8, [(1.22, 0.5), (1.22, 0.64), (0.98, 0.8), (0.95, 0.96), (1.16, 1.12)], 0.2, 0.13))
    for i in range(4):   # and between them, shells on the plinth that the arching jets come from
        parts.append(shell(f'shell{i}', i * TAU / 4, 1.36, 0.4, 0.3))
    return join(parts, 'fountain_grand')

def console(name, ang, pts, width, thick=0.05):
    """A carved scroll console standing in the radial plane at angle ang: a band of stone along pts (r, z), its ends rolled into volutes."""
    import numpy as np
    P = np.array(pts, float); t = np.linspace(0, 1, 40); idx = np.linspace(0, len(P) - 1, 40)
    C = np.stack([np.interp(idx, np.arange(len(P)), P[:, 0]), np.interp(idx, np.arange(len(P)), P[:, 1])], 1)
    for _ in range(3): C[1:-1] = (C[:-2] + C[1:-1] * 2 + C[2:]) / 4                                # smooth it
    def scroll(c, d, rad, turns, sign):                                                         # a spiral rolling up from c, leaving along d
        out = []; nrm = np.array([-d[1], d[0]]) * sign
        for k in range(1, 22):
            th = k / 21 * turns * TAU; rr = rad * (1 - 0.75 * k / 21)
            cen = c + nrm * rad; v = -nrm * math.cos(th) + d * math.sin(th); out.append(cen + v * rr)
        return np.array(out)
    d0 = C[0] - C[1]; d0 /= np.linalg.norm(d0); d1 = C[-1] - C[-2]; d1 /= np.linalg.norm(d1)
    C = np.concatenate([scroll(C[0], d0, 0.085, 1.15, 1)[::-1], C, scroll(C[-1], d1, 0.065, 1.15, -1)])
    bm = bmesh.new(); rings = []; n = len(C)
    for i in range(n):
        tg = C[min(i + 1, n - 1)] - C[max(i - 1, 0)]; tg /= max(np.linalg.norm(tg), 1e-9); nr = np.array([-tg[1], tg[0]])   # normal in the (r, z) plane
        th = thick * (0.7 + 0.3 * math.sin(math.pi * i / (n - 1))); w = width * (0.85 + 0.15 * math.sin(math.pi * i / (n - 1)))
        ring = []
        for (a, b) in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            rz = C[i] + nr * a * th * 0.5; side = b * w * 0.5
            x = math.cos(ang) * rz[0] - math.sin(ang) * side; y = math.sin(ang) * rz[0] + math.cos(ang) * side
            ring.append(bm.verts.new((x, y, rz[1])))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(4): bm.faces.new((r0[k], r0[(k + 1) % 4], r1[(k + 1) % 4], r1[k]))
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    m = ob.modifiers.new('bevel', 'BEVEL'); m.width = 0.012; m.segments = 2
    sub = ob.modifiers.new('sub', 'SUBSURF'); sub.levels = 2
    return ob

def shell(name, ang, r, z, size):
    """A scallop shell lying against the plinth at angle ang, its ribs fanning up and out (the jets leave from its hinge)."""
    bm = bmesh.new(); nu, nv = 49, 12; V = []; nrib = 11
    for i in range(nu):
        u = -1 + 2 * i / (nu - 1); row = []
        rib = abs(math.cos(u * nrib * math.pi / 2))                                              # 1 on a rib, 0 in a furrow
        for j in range(nv):
            v = j / (nv - 1); th = u * 1.2; rr = size * (0.1 + 0.9 * v) * (1 + 0.05 * rib * v)           # ribbed and scalloped at the rim
            lx, lz = math.sin(th) * rr, math.cos(th) * rr * 0.9
            ly = 0.16 * size * (1 - v * v) ** 0.5 * (1 - u * u) ** 0.5 + 0.03 * rib * v + 0.06 * size * v   # a shallow fan, leaning out
            x0 = r + ly; y0 = lx
            row.append(bm.verts.new((math.cos(ang) * x0 - math.sin(ang) * y0, math.sin(ang) * x0 + math.cos(ang) * y0, z + lz)))
        V.append(row)
    for i in range(nu - 1):
        for j in range(nv - 1): bm.faces.new((V[i][j], V[i + 1][j], V[i + 1][j + 1], V[i][j + 1]))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    m = ob.modifiers.new('solid', 'SOLIDIFY'); m.thickness = 0.025; m.offset = -1
    return ob

BOWL = dict(lip=(0.98, 1.2), water=(0.87, 1.18), top=1.46)

def fountain_bowl():
    """Single-bowl fountain on the cross walk: an acanthus baluster under a gadrooned bowl with an egg-and-dart lip, a small pine-cone
    jet in the middle. Kept under the void that hangs over the west one (its foot at 1.8 m)."""
    p = Prof(0.64, 0).to(0.64, 0.12).to(0.58, 0.12).to(0.58, 0.38).to(0.54, 0.42).mark('oct').to(0.5, 0.42).torus(0.48, 0.5, 0.03).cove(0.32, 0.6, 0.035).torus(0.3, 0.66, 0.025)
    p.mark('f0').curve(0.46, 0.76, 0.24, 0.9, 14).mark('f1').torus(0.22, 0.95, 0.025).to(0.28, 0.97)
    p.mark('g0').curve(0.66, 0.97, 0.93, 1.11, 26).mark('g1').to(0.945, 1.12).mark('e0').torus(0.95, 1.2, 0.035).mark('e1').to(0.905, 1.2)
    p.curve(0.895, 1.16, 0.85, 1.12, 5).curve(0.5, 1.07, 0.1, 1.07, 10)
    p.torus(0.08, 1.13, 0.02).mark('p0').curve(0.13, 1.24, 0.09, 1.37, 10).curve(0.05, 1.43, 0.0, BOWL['top'], 6).mark('p1')
    def mod(a, r, z, s, M):
        if s <= M['oct'] + 1e-6: d = ((a + math.pi / 8) % (math.pi / 4)) - math.pi / 8; return 0.0, 1 / math.cos(d)
        dn = acanthus(a, s, M['f0'], M['f1'], 6, 0.03) + acanthus(a, s, M['f0'] + 0.02, M['f1'] - 0.05, 6, 0.02, phase=0.5, curl=0.2)
        dn += gadroon(a, s, M['g0'], M['g1'], 20, 0.03) + beads(a, s, M['e0'], M['e1'], 40, 0.012) + scales(a, s, M['p0'], M['p1'], 8, 22.0, 0.014)
        return dn, 1.0
    return revolve('fountain_bowl', p, mod, segs=192, step=0.014)

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
    me = ob.data; off = Vector((seed * 7.3, seed * 3.1, seed * 5.7)); n = len(me.vertices)
    co = np.empty(n * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(n, 3)
    nr = np.empty(n * 3, np.float32); me.vertices.foreach_get('normal', nr); nr = nr.reshape(n, 3)   # read once: touching v.normal after moving a vertex recomputes them all
    d = np.empty(n, np.float32)
    for i in range(n):
        q = Vector(co[i]) + off
        d[i] = amp * 1.6 * noise.noise(q * 2.3) + amp * noise.noise(q * 9.0) + amp * 0.5 * noise.noise(q * 31.0)
    me.vertices.foreach_set('co', (co + nr * d[:, None]).ravel()); me.update()

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
    (fountain_grand, 0.16), (fountain_bowl, 0.22), (lambda: pool('pool_grand', 4.6, 30), 0.42), (lambda: pool('pool_bowl', 1.9, 14), 0.42), (urn, 0.3), (finial, 0.6)]
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
