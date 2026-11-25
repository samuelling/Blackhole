#!/usr/bin/env python3
"""Garden plants, modelled in Blender from reference photographs.

    python3 tools/blender/build_plants.py [key ...] [--preview]          (bpy as a module)

For each species: assets/plants/<key>.json (glTF, buffer embedded), <key>.webp and <key>_n.webp (its atlas and normal map), and
blender/plants/<key>.blend to work on by hand. --preview renders each to /tmp/plants/<key>_*.png with Cycles.

Shapes, counts, sizes and colours were read from openly licensed photographs on iNaturalist (CC0 and CC-BY; listed in
assets/plants/CREDITS.md) and checked against nursery sizes in src/looks.js. Nothing is a scan: leaves and petals are drawn as outlines
on curved strips, their colour painted to match the photos.

How the garden uses a model (src/plantmodels.js): each species has three variants. A variant is a plant's foliage (leaf_<v>) and its
stems (stem_<v>), both standing on the plant's own origin, and empties (fl_<v>_<n>) where its flower heads go; the heads themselves are
meshes of their own (head, and head_lo), drawn once for every empty. Each part also has a _lo version for plants further away. The
garden's seasons work on the parts as they do on its own plants: foliage grows and dies back, stems stay while there are flowers or seed,
heads come with the bloom and brown into seed heads.
"""
import bpy, bmesh, numpy as np, math, os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plantkit import *

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'plants'); BLEND = os.path.join(ROOT, 'blender', 'plants'); PREV = '/tmp/plants'
IN = 0.0254
SPECIES = {}
def species(fn): SPECIES[fn.__name__] = fn; return fn


# ================================================================= the species
@species
def echinacea(at, q, rg):
    """Purple coneflower, Echinacea purpurea. 40 in tall, 24 in across (looks.js). From the photos: 12-18 rays, 5-8 cm, strongly
    drooping from the base of the cone, deep pink to pale at the notched tips; the cone domed, 3-4 cm, a spiral of stiff orange-tipped
    bracts over brown, a ring of yellow pollen part way up; rough lance-shaped leaves, the basal ones on long stalks, a few sessile ones up
    the stems; stout upright stems, purplish at the foot, one head each and now and then a smaller one on a side shoot."""
    R = {}
    R['leaf'] = at.region(150, 420); R['sleaf'] = at.region(110, 360); R['ray'] = at.region(70, 300); R['stem'] = at.region(40, 300); R['cone'] = at.region(40, 160); R['spine'] = at.region(24, 120)
    lance = lambda t: np.where(t < 0.16, 0.07, np.clip(np.sin(np.pi * np.clip((t - 0.16) / 0.84, 0, 1) ** 0.75) ** 0.8, 0, 1) * (1 - 0.035 * np.maximum(0, np.sin(t * 46)) ** 6))   # sparse, shallow teeth
    paint_blade(at, R['leaf'], lance, base='#3f5a26', tip='#46632a', mid='#6d8a4e', edge='#3a5222', veins=('pinnate', 7, 0.8), seed=1, mottle=0.14, hair=0.15)
    slance = lambda t: np.clip(np.sin(np.pi * t ** 0.8) ** 0.85, 0, 1) * (1 - 0.03 * np.maximum(0, np.sin(t * 38)) ** 6)
    paint_blade(at, R['sleaf'], slance, base='#425e28', tip='#4a6a2e', mid='#6f8f50', edge='#3b5323', veins=('pinnate', 6, 0.9), seed=2, hair=0.15)
    # a ray: narrow at its foot, widest two thirds out, ending in two or three shallow teeth
    def rayshape(t):
        w = np.clip(0.42 + 0.55 * np.sin(np.pi * np.clip(t * 0.62, 0, 1)), 0, 1)
        return np.where(t > 0.9, w * (1 - 0.35 * (np.abs(np.sin(t * 0 + 1)) * 0)), w)
    def raycut(u, t):
        v = (u - 0.5) * 2; w = rayshape(t); notch = (t > 1 - 0.07 * (1 - np.abs(np.sin(v * np.pi * 1.5)))) ; return (np.abs(v) < w) & ~notch
    def rayfn(u, t):
        v = (u - 0.5) * 2; col = mix(lin('#7c1a4c'), lin('#c2427f'), np.clip(t * 1.5, 0, 1)); col = mix(col, lin('#cf6a9f'), np.clip((t - 0.65) * 3, 0, 1) * 0.7)
        ph = v / np.maximum(rayshape(t), 0.05) * 6; vm = band(ph - np.round(ph), 0.18) * 0.5
        col = col * (1 - 0.18 * vm)[..., None] * (1 + 0.1 * (noise2(u, t, 30, 5) - 0.5))[..., None]
        return col, raycut(u, t).astype(np.float32), 0.4 - vm * 0.4
    at.fill(R['ray'], rayfn)
    paint_ramp(at, R['stem'], [(0, '#5a3a3a'), (0.25, '#4d5a2c'), (1, '#5e7a36')], stripes=3, seed=3)
    paint_ramp(at, R['cone'], [(0, '#3a1a08'), (0.6, '#5a2c0a'), (1, '#6e3510')], seed=4)
    paint_ramp(at, R['spine'], [(0, '#4a2408'), (0.5, '#a8420e'), (0.8, '#d0601a'), (1, '#e07a22')], seed=5)

    H = 40 * IN; W = 24 * IN; leaf, stem = Geo(), Geo(); heads = []
    # basal leaves on long stalks, arching out
    nb = int(rg.integers(11, 15) * (1 if q >= 1 else 0.6))
    for i in range(nb):
        yaw = golden(nb, i) + rg.normal(0, 0.15); pitch = rg.uniform(0.4, 0.9); L = rg.uniform(0.2, 0.3)
        g = ribbon(L, L * 0.36, R['leaf'], nu=8 if q >= 1 else 4, nv=3, bend=rg.uniform(0.8, 1.4), fold=0.35, cup=-0.1, twist=rg.normal(0, 0.15), seed=i)
        leaf.put(place(g, [math.cos(yaw) * 0.02, math.sin(yaw) * 0.02, 0.01], heading(yaw, pitch), roll=rg.normal(0, 0.15)))
    # flowering stems
    ns = int(rg.integers(8, 13))
    for i in range(ns):
        yaw = golden(ns, i) * 1.3 + rg.uniform(0, 0.4); lean = rg.uniform(0.08, 0.32); L = H * rg.uniform(0.72, 1.0)
        base = np.array([math.cos(yaw), math.sin(yaw), 0]) * rg.uniform(0.02, 0.1)
        pts = curve(base, heading(yaw, math.pi / 2 - lean), L, 10 if q >= 1 else 5, droop=rg.uniform(0.0, 0.25), wander=0.02, seed=i + 7)
        stem.put(tube(pts, np.linspace(0.0045, 0.0028, len(pts)), R['stem'], sides=5 if q >= 1 else 3))
        # leaves up the lower two thirds, alternate, sessile
        nl = int(rg.integers(4, 8) * (1 if q >= 1 else 0.5))
        for j in range(nl):
            f = 0.12 + 0.55 * j / max(1, nl - 1) + rg.uniform(-0.03, 0.03); k = int(f * (len(pts) - 1)); p = pts[k]
            ly = yaw + math.pi * j + rg.normal(0, 0.4); Ls = rg.uniform(0.11, 0.16) * (1 - 0.4 * f)
            g = ribbon(Ls, Ls * 0.3, R['sleaf'], nu=6 if q >= 1 else 3, nv=3, bend=rg.uniform(0.6, 1.2), fold=0.4, twist=rg.normal(0, 0.2), seed=20 + j)
            leaf.put(place(g, p, heading(ly, rg.uniform(0.35, 0.8)), roll=rg.normal(0, 0.2)))
        # the head: nodding out from the stem's tip, facing outward and up
        d = pts[-1] - pts[-2]; d = d / np.linalg.norm(d); out = np.array([math.cos(yaw), math.sin(yaw), 0])
        hd = d * 0.55 + out * rg.uniform(0.35, 0.75) + np.array([0, 0, 0.3]); hd = hd / np.linalg.norm(hd)
        heads.append(dict(p=pts[-1], d=hd, roll=rg.uniform(0, TAU), s=rg.uniform(0.85, 1.1), kind='head'))
        if rg.random() < 0.45:   # a side shoot from the top leaf, with a smaller head
            k = int(0.62 * (len(pts) - 1)); sy = yaw + rg.choice([-1, 1]) * rg.uniform(0.6, 1.2)
            sp = curve(pts[k], heading(sy, 1.0), L * 0.3, 5, droop=0.2, seed=i + 40); stem.put(tube(sp, np.linspace(0.003, 0.002, len(sp)), R['stem'], sides=4 if q >= 1 else 3))
            sd = (sp[-1] - sp[-2]); sd = sd / np.linalg.norm(sd) + np.array([0, 0, 0.4]); heads.append(dict(p=sp[-1], d=sd / np.linalg.norm(sd), roll=rg.uniform(0, TAU), s=rg.uniform(0.7, 0.85), kind='head'))

    def head(qh):
        """In the head's own frame: Z along its axis, the rays round the foot of the cone."""
        g = Geo(); rc, hc = 0.019, 0.022
        # the cone: a dome of brown
        nr, nsct = (4, 18) if qh >= 1 else (3, 10)
        P, UV, F = [[0, 0, hc]], [[(R['cone'][0] + R['cone'][2]) / 2, R['cone'][3]]], []
        for i in range(1, nr + 1):
            r = i / nr
            for j in range(nsct):
                a = j / nsct * TAU; z = hc * (1 - r ** 1.6); P.append([math.cos(a) * rc * r, math.sin(a) * rc * r, z]); UV.append([R['cone'][0] + j / nsct * (R['cone'][2] - R['cone'][0]), R['cone'][3] - r * (R['cone'][3] - R['cone'][1])])
        for j in range(nsct): F.append((0, 1 + j, 1 + (j + 1) % nsct))
        for i in range(nr - 1):
            for j in range(nsct):
                a, b = 1 + i * nsct + j, 1 + i * nsct + (j + 1) % nsct; F += [(a, a + nsct, b + nsct), (a, b + nsct, b)]
        g.add(P, UV, F)
        # the bracts: stiff spines in a golden spiral over the dome, orange at the tips
        nsp = 130 if qh >= 1 else 0
        for i in range(nsp):
            r = math.sqrt((i + 0.5) / nsp) * 0.97; a = golden(nsp, i); z = hc * (1 - r ** 1.6)
            nz = np.array([math.cos(a) * 1.6 * r ** 0.6 * hc / rc, math.sin(a) * 1.6 * r ** 0.6 * hc / rc, 1.0]); nz = nz / np.linalg.norm(nz)
            base = np.array([math.cos(a) * rc * r, math.sin(a) * rc * r, z]); tip = base + nz * 0.0045
            sx = R['spine']; P = [tip]; UV = [[(sx[0] + sx[2]) / 2, sx[3]]]
            side = np.cross(nz, [0, 0, 1.0]) if r > 0.05 else np.array([1.0, 0, 0]); side = side / max(np.linalg.norm(side), 1e-6); up = np.cross(side, nz)
            for k in range(3):
                b = k / 3 * TAU; P.append(base + (side * math.cos(b) + up * math.sin(b)) * 0.0011); UV.append([sx[0] + k / 2 * (sx[2] - sx[0]), sx[1]])
            g.add(P, UV, [(0, 1, 2), (0, 2, 3), (0, 3, 1)])
        # the rays
        nray = int(rg.integers(13, 17))
        for i in range(nray):
            a = i / nray * TAU + rg.normal(0, 0.06); L = rg.uniform(0.05, 0.07)
            pg = ribbon(L, 0.0115, R['ray'], nu=6 if qh >= 1 else 3, nv=3, bend=rg.uniform(1.1, 1.8), bend_pow=1.0, cup=-0.4, fold=-0.15, twist=rg.normal(0, 0.25), seed=60 + i)
            d = heading(a, rg.uniform(-0.15, 0.1)); g.put(place(pg, [math.cos(a) * rc * 0.92, math.sin(a) * rc * 0.92, 0.002], d, up=(0, 0, 1)))
        return g
    return dict(leaf=leaf, stem=stem, heads=heads, head={'head': head}, size=(H, W))


def paint_threads(at, rect, n, col_base, col_tip, width=0.06, spread=0.8, seed=0):
    """A leaf cut into n threads (coreopsis): filaments fanning from the foot of the rect, forking once."""
    rg = np.random.default_rng(seed); ends = np.linspace(-spread, spread, n) + rg.normal(0, 0.05, n)
    def fn(u, t):
        x = (u - 0.5) * 2; inside = np.zeros_like(u, bool); hgt = np.zeros_like(u)
        for e in ends:
            xc = e * t ** 1.3; d = np.abs(x - xc); w = width * (1 - 0.6 * t); m = d < w; inside |= m; hgt = np.maximum(hgt, np.clip(1 - d / np.maximum(w, 1e-3), 0, 1))
        col = mix(lin(col_base), lin(col_tip), t)
        return col, inside.astype(np.float32), hgt
    at.fill(rect, fn)


@species
def sesleria(at, q, rg):
    """Autumn moor grass, Sesleria autumnalis. 18 x 18 in with its flowers, the foliage a foot high (looks.js). From the photos: a dense
    fountain of flat, narrow (4-6 mm), bright yellow-green blades, arching from a tight crown and flopping at the tips; in late summer
    narrow spikes, silvery white then buff, on thin stalks held just above the leaves."""
    R = {}; R['blade'] = at.region(48, 512); R['old'] = at.region(48, 512); R['culm'] = at.region(24, 256); R['spike'] = at.region(64, 256)
    flat = lambda t: np.ones_like(t)
    paint_blade(at, R['blade'], flat, base='#5e7a2c', tip='#88a040', mid='#94aa50', veins=('parallel', 5), midrib=0.6, mottle=0.1, seed=11)
    paint_blade(at, R['old'], flat, base='#6f7a34', tip='#a09a58', veins=('parallel', 5), midrib=0.5, mottle=0.18, seed=12)
    paint_ramp(at, R['culm'], [(0, '#7a8a46'), (1, '#b9b48a')], seed=13)
    def spikefn(u, t):
        v = (u - 0.5) * 2; w = 0.5 + 0.4 * np.sin(np.pi * np.clip(t, 0, 1)) ** 0.5; ph = t * 14; m = (np.abs(v) < w * (0.75 + 0.25 * np.cos((ph - np.round(ph)) * np.pi)))
        col = mix(lin('#c9c6b4'), lin('#e6e3d6'), t) * (1 + 0.25 * (noise2(u, t, 40, 14) - 0.5))[..., None]
        return col, m.astype(np.float32), noise2(u, t, 60, 15)
    at.fill(R['spike'], spikefn)
    H = 18 * IN; leaf, stem, heads = Geo(), Geo(), []
    nb = int(rg.integers(130, 170) * (1 if q >= 1 else 0.3))
    taper = lambda u: np.clip(1.15 - u ** 3, 0, 1) * (1 - np.clip((u - 0.85) / 0.15, 0, 1) * 0.85)
    for i in range(nb):
        yaw = rg.uniform(0, TAU); r0 = rg.uniform(0, 0.035); pitch = rg.uniform(0.85, 1.4); L = rg.uniform(0.26, 0.4)
        g = ribbon(L, rg.uniform(0.004, 0.006), R['old'] if rg.random() < 0.12 else R['blade'], nu=7 if q >= 1 else 3, nv=3, bend=rg.uniform(1.5, 2.6) * (1.7 - pitch * 0.5), bend_pow=1.25, fold=0.6, twist=rg.normal(0, 0.6), wprof=taper, seed=i)
        leaf.put(place(g, [math.cos(yaw) * r0, math.sin(yaw) * r0, 0], heading(yaw, pitch), roll=rg.normal(0, 0.3)))
    nf = int(rg.integers(14, 24))
    for i in range(nf):
        yaw = rg.uniform(0, TAU); r0 = rg.uniform(0, 0.025); L = H * rg.uniform(0.78, 0.95)
        pts = curve([math.cos(yaw) * r0, math.sin(yaw) * r0, 0], heading(yaw, rg.uniform(1.15, 1.45)), L, 6 if q >= 1 else 3, droop=rg.uniform(0.05, 0.35), wander=0.015, seed=i)
        stem.put(tube(pts, np.linspace(0.0012, 0.0008, len(pts)), R['culm'], sides=3))
        d = pts[-1] - pts[-2]; heads.append(dict(p=pts[-1], d=d / np.linalg.norm(d), roll=rg.uniform(0, TAU), s=rg.uniform(0.85, 1.1), kind='head'))
    def head(qh):
        g = Geo(); L = 0.06
        for k in range(3 if qh >= 1 else 2):   # crossed cards of the spike, each a narrow strip
            c = ribbon(L, 0.009, R['spike'], nu=4 if qh >= 1 else 2, nv=2, bend=0.15, seed=k); g.put(place(c, [0, 0, -0.004], [0, 0, 1.0], up=heading(k / 3 * math.pi, 0)))
        return g
    return dict(leaf=leaf, stem=stem, heads=heads, head={'head': head}, size=(H, 18 * IN))


@species
def geranium(at, q, rg):
    """Cranesbill 'Rozanne' (Geranium, wallichianum x himalayense). 18 in tall, 26 in across (looks.js). From the photos: a loose mound of
    long-stalked leaves 6-10 cm across, cut deep into five toothed lobes, mid green, a little marbled; saucers 4-5 cm across, five broad
    rounded petals, violet-blue with purple veins running out from a white centre, held just above the leaves on wiry stalks."""
    R = {}; R['leaf'] = at.region(300, 300); R['petal'] = at.region(130, 170); R['stem'] = at.region(24, 256); R['eye'] = at.region(64, 64)
    def lobes(a):
        r = 0.32 + 0.68 * np.abs(np.cos(2.5 * a)) ** 0.55
        return r * (1 - 0.16 * np.abs(np.sin(7.5 * a)) ** 0.8) * (1 - 0.05 * np.abs(np.sin(22.5 * a)) ** 2) * 0.98
    paint_plate(at, R['leaf'], lobes, base='#4a7434', edge='#3f6a2c', centre='#5f8a44', veins=5, mottle=0.16, marble=0.25, seed=21)
    def petal(t): return np.clip(0.25 + 0.85 * np.sin(np.pi * np.clip(t * 0.58, 0, 1)) ** 0.8, 0, 1) * np.where(t > 0.93, 1 - (t - 0.93) * 6, 1)
    def petalfn(u, t):
        v = (u - 0.5) * 2; w = petal(t); inside = (np.abs(v) < w) & ~((t > 0.95) & (np.abs(v) < 0.08))
        col = mix(lin('#eee6f2'), lin('#6a30c0'), np.clip((t - 0.05) * 3.5, 0, 1)); col = mix(col, lin('#7438c8'), np.clip((t - 0.5) * 2, 0, 1) * 0.6)
        ph = v / np.maximum(w, 0.05) * 5.5 + 0.15 * np.sin(t * 9); vm = band(ph - np.round(ph), 0.1) * np.clip(1.2 - t, 0, 1) * (t > 0.08); col = mix(col, lin('#3a1478'), vm * 0.8)
        return col, inside.astype(np.float32), 0.5 - vm * 0.4
    at.fill(R['petal'], petalfn)
    paint_ramp(at, R['stem'], [(0, '#4e6a36'), (1, '#6a8a46')], seed=22)
    def eyefn(u, t):
        x, y = (u - 0.5) * 2, (t - 0.5) * 2; r = np.hypot(x, y); col = mix(lin('#e8e2c8'), lin('#3a2a5a'), np.clip((r - 0.5) * 3, 0, 1))
        dots = sum(band(np.hypot(x - 0.55 * math.cos(k * TAU / 10), y - 0.55 * math.sin(k * TAU / 10)), 0.14) for k in range(10)); col = mix(col, lin('#2a1a40'), np.clip(dots, 0, 1))
        return col, (r < 1).astype(np.float32), 1 - r
    at.fill(R['eye'], eyefn)
    H = 18 * IN; W = 26 * IN; leaf, stem, heads = Geo(), Geo(), []
    nl = int(rg.integers(95, 120) * (1 if q >= 1 else 0.3))
    for i in range(nl):
        yaw = golden(nl, i) + rg.normal(0, 0.2); out = rg.uniform(0.05, 1.0) ** 0.6; reach = W * 0.46 * out; hgt = H * (0.62 - 0.5 * out ** 2) * rg.uniform(0.75, 1.05) + 0.03
        tip = np.array([math.cos(yaw) * reach, math.sin(yaw) * reach, hgt]); base = np.array([math.cos(yaw) * 0.02, math.sin(yaw) * 0.02, 0])
        mid = (base + tip) / 2 + np.array([0, 0, hgt * 0.25]); pts = np.array([base + (mid - base) * k / 3 for k in range(3)] + [mid + (tip - mid) * k / 3 for k in range(1, 4)])
        stem.put(tube(pts, np.linspace(0.0018, 0.0012, len(pts)), R['stem'], sides=3))
        Rl = rg.uniform(0.038, 0.055) * (1.1 - 0.25 * out)
        g = plate(Rl, R['leaf'], nr=3 if q >= 1 else 2, ns=12 if q >= 1 else 7, cup=rg.uniform(0.05, 0.25), droop=rg.uniform(0.1, 0.4), ripple=0.12, seed=i)
        leaf.put(place(g, tip + np.array([math.cos(yaw), math.sin(yaw), 0]) * Rl * 0.15, heading(yaw + rg.normal(0, 0.4), rg.uniform(-0.45, 0.15)), roll=rg.normal(0, 0.25)))
    nf = int(rg.integers(24, 36))
    for i in range(nf):
        yaw = rg.uniform(0, TAU); out = rg.uniform(0.2, 1.0) ** 0.6; reach = W * 0.48 * out; hgt = H * (0.95 - 0.55 * out ** 2) * rg.uniform(0.85, 1.05)
        tip = np.array([math.cos(yaw) * reach, math.sin(yaw) * reach, hgt]); base = np.array([math.cos(yaw) * reach * 0.6, math.sin(yaw) * reach * 0.6, hgt * 0.7])
        stem.put(tube(np.array([base, (base + tip) / 2 + [0, 0, 0.02], tip]), 0.0011, R['stem'], sides=3))
        d = np.array([math.cos(yaw) * 0.4 * out, math.sin(yaw) * 0.4 * out, 1.0]) + rg.normal(0, 0.2, 3); heads.append(dict(p=tip, d=d / np.linalg.norm(d), roll=rg.uniform(0, TAU), s=rg.uniform(0.85, 1.1), kind='head'))
    def head(qh):
        g = Geo()
        for k in range(5):
            a = k / 5 * TAU; pg = ribbon(0.025, 0.022, R['petal'], nu=4 if qh >= 1 else 2, nv=3, bend=-0.12, bend_pow=1.0, cup=0.12, ripple=0.06, seed=k)
            g.put(place(pg, [math.cos(a) * 0.002, math.sin(a) * 0.002, 0.001], heading(a, 0.14), up=(0, 0, 1), roll=0.0))
        e = plate(0.0065, R['eye'], nr=1, ns=8, cup=0.3); g.put(e, None, [0, 0, 0.0035])
        return g
    return dict(leaf=leaf, stem=stem, heads=heads, head={'head': head}, size=(H, W))


@species
def lavandula(at, q, rg):
    """English lavender, Lavandula angustifolia. 16 x 15 in with its flowers (looks.js). From the photos: a dense rounded cushion of
    upright grey-green shoots, the leaves narrow and linear (2-4 cm by 2-4 mm), silvery; above it a crowd of bare, straight flower stalks,
    each ending in a spike of tight whorls of small violet-purple flowers, interrupted near its foot."""
    R = {}; R['leaf'] = at.region(24, 200); R['stalk'] = at.region(24, 256); R['calyx'] = at.region(48, 96); R['flower'] = at.region(64, 64)
    paint_blade(at, R['leaf'], lambda t: np.ones_like(t), base='#56655a', tip='#6f7d6e', midrib=0.4, veins=('parallel', 1), mottle=0.06, seed=31)
    paint_ramp(at, R['stalk'], [(0, '#56664a'), (1, '#6c7c5c')], seed=32)
    paint_ramp(at, R['calyx'], [(0, '#4a3a6a'), (0.6, '#5a3f88'), (1, '#6a4aa0')], seed=33, noise=0.15)
    def flfn(u, t):
        x, y = (u - 0.5) * 2, (t - 0.5) * 2; r = np.hypot(x, y); a = np.arctan2(y, x); R5 = 0.75 + 0.25 * np.cos(5 * a); col = mix(lin('#6c4cc0'), lin('#8a6ad8'), r)
        return col, (r < R5).astype(np.float32), 1 - r
    at.fill(R['flower'], flfn)
    H = 16 * IN; leaf, stem, heads = Geo(), Geo(), []
    lin_taper = lambda u: np.clip(1.0 - u ** 4, 0.25, 1)
    nsh = int(rg.integers(55, 75) * (1 if q >= 1 else 0.4))
    for i in range(nsh):   # leafy shoots making the cushion
        yaw = rg.uniform(0, TAU); out = math.sqrt(rg.uniform(0, 1)); r0 = out * 0.05
        L = H * 0.55 * rg.uniform(0.55, 1.0) * (1.05 - 0.4 * out ** 2); d = heading(yaw, math.pi / 2 - out * 0.9 - rg.uniform(0, 0.15))
        pts = curve([math.cos(yaw) * r0, math.sin(yaw) * r0, 0], d, L, 4 if q >= 1 else 2, droop=0.1, wander=0.03, seed=i)
        stem.put(tube(pts, np.linspace(0.0022, 0.0012, len(pts)), R['stalk'], sides=3))
        nlf = 10 if q >= 1 else 4
        for j in range(nlf):
            f = 0.35 + 0.65 * j / nlf; k = min(len(pts) - 2, int(f * (len(pts) - 1))); p = pts[k] + (pts[k + 1] - pts[k]) * (f * (len(pts) - 1) - k)
            for side in (0, math.pi):
                ly = yaw + side + j * math.pi / 2; Ll = rg.uniform(0.025, 0.04) * (1.1 - 0.4 * f)
                g = ribbon(Ll, 0.0032, R['leaf'], nu=3 if q >= 1 else 2, nv=2, bend=rg.uniform(-0.2, 0.4), wprof=lin_taper, seed=j)
                leaf.put(place(g, p, heading(ly, rg.uniform(0.6, 1.2)), roll=rg.normal(0, 0.3)))
    nf = int(rg.integers(35, 55))
    for i in range(nf):   # flower stalks above the cushion
        yaw = rg.uniform(0, TAU); out = math.sqrt(rg.uniform(0, 1)); r0 = out * 0.06
        L = H * rg.uniform(0.82, 1.0) - 0.04; pts = curve([math.cos(yaw) * r0, math.sin(yaw) * r0, H * 0.2], heading(yaw, math.pi / 2 - out * 0.55 - rg.uniform(0, 0.12)), L - H * 0.2, 5 if q >= 1 else 2, droop=rg.uniform(0, 0.2), wander=0.01, seed=100 + i)
        stem.put(tube(pts, 0.0011, R['stalk'], sides=3))
        d = pts[-1] - pts[-2]; heads.append(dict(p=pts[-1], d=d / np.linalg.norm(d), roll=rg.uniform(0, TAU), s=rg.uniform(0.85, 1.1), kind='head'))
    def head(qh):
        g = Geo(); nw = 7 if qh >= 1 else 4
        for w in range(nw):   # whorls up the spike, the lowest one apart from the rest
            z = -0.05 + (0.0 if w == 0 else 0.016 + (w - 1) * 0.0062); rr = 0.0042 * (1 - 0.35 * w / nw)
            nfl = 5 if qh >= 1 else 3
            for k in range(nfl):
                a = k / nfl * TAU + w * 0.5; d = heading(a, 0.55)
                c = ribbon(0.0065, 0.0028, R['calyx'], nu=2, nv=2, bend=-0.3, seed=k); g.put(place(c, [math.cos(a) * rr * 0.5, math.sin(a) * rr * 0.5, z], d, up=(0, 0, 1)))
                if qh >= 1 and (w > nw * 0.35 or rg.random() < 0.3):
                    fl = plate(0.0026, R['flower'], nr=1, ns=4); tip = np.array([math.cos(a) * rr * 1.5, math.sin(a) * rr * 1.5, z + 0.004])
                    g.put(fl, frame(d, up=(0, 0, 1)) @ rot([1, 0, 0], -1.2), tip)
        return g
    return dict(leaf=leaf, stem=stem, heads=heads, head={'head': head}, size=(H, 15 * IN))


@species
def nepeta(at, q, rg):
    """Catmint, Nepeta x faassenii. 27 in tall, 33 in across (looks.js). From the photos: a sprawling grey-green mound, the leaves small
    (2-3 cm), heart-shaped at the foot, scalloped, soft and hairy, in pairs up square stems that arch out from the crown; loose spikes of
    small two-lipped lavender-blue flowers in whorls over the last third of every stem."""
    R = {}; R['leaf'] = at.region(130, 160); R['stem'] = at.region(24, 256); R['calyx'] = at.region(40, 80); R['flower'] = at.region(80, 80)
    def ovate(t):
        w = np.where(t < 0.12, 0.06, np.clip(np.sin(np.pi * np.clip((t - 0.1) / 0.9, 0, 1) ** 0.6) ** 0.7 * 1.0, 0, 1))
        return w * (1 - 0.09 * (1 - np.abs(np.cos(t * np.pi * 7))) ** 1.5)
    paint_blade(at, R['leaf'], ovate, base='#4f6450', tip='#5a7058', mid='#6a7f66', edge='#73866c', veins=('pinnate', 5, 0.7), mottle=0.1, seed=41, hair=0.35)
    paint_ramp(at, R['stem'], [(0, '#4e5e48'), (1, '#62725a')], seed=42)
    paint_ramp(at, R['calyx'], [(0, '#4c4868'), (1, '#6a5c98')], seed=43)
    def flfn(u, t):   # a two-lipped flower seen from in front: a broad lower lip, a small hooded upper one
        x, y = (u - 0.5) * 2, (t - 0.5) * 2
        lower = ((x / 0.85) ** 2 + ((y - 0.25) / 0.6) ** 2 < 1); upper = ((x / 0.45) ** 2 + ((y + 0.45) / 0.45) ** 2 < 1)
        col = mix(lin('#6a52d0'), lin('#8a78e8'), np.clip(1 - np.hypot(x, y), 0, 1)); dots = band(np.hypot(x - 0.15 * np.sin(y * 20), y - 0.2), 0.25) * (np.sin(x * 40) > 0.5)
        col = mix(col, lin('#5a3aa0'), dots * 0.7)
        return col, (lower | upper).astype(np.float32), 0.5
    at.fill(R['flower'], flfn)
    H = 27 * IN; W = 33 * IN; leaf, stem, heads = Geo(), Geo(), []
    ns = int(rg.integers(55, 70) * (1 if q >= 1 else 0.35))
    for i in range(ns):
        yaw = golden(ns, i) + rg.normal(0, 0.2); out = rg.uniform(0.15, 1.0) ** 0.8; L = H * rg.uniform(0.75, 1.05) * (1.1 - 0.15 * out)
        pts = curve([math.cos(yaw) * 0.04, math.sin(yaw) * 0.04, 0], heading(yaw, math.pi / 2 - out * 1.15), L, 9 if q >= 1 else 4, droop=out * rg.uniform(0.2, 0.6), wander=0.04, seed=i)
        stem.put(tube(pts, np.linspace(0.0022, 0.0013, len(pts)), R['stem'], sides=3))
        npair = 11 if q >= 1 else 4
        for j in range(npair):   # opposite pairs, each pair at right angles to the last, up the lower two thirds
            f = 0.06 + 0.72 * j / npair; k = min(len(pts) - 2, int(f * (len(pts) - 1))); p = pts[k] + (pts[k + 1] - pts[k]) * (f * (len(pts) - 1) - k)
            sd = pts[k + 1] - pts[k]; sd = sd / np.linalg.norm(sd); ax = np.cross(sd, [0, 0, 1.0]); ax = ax / max(np.linalg.norm(ax), 1e-6)
            if j % 2: ax = np.cross(sd, ax)
            for sgn in (1, -1):
                Ll = rg.uniform(0.028, 0.04) * (1.2 - 0.5 * f); d = ax * sgn * 0.8 + sd * 0.4 + np.array([0, 0, 0.25]); d = d / np.linalg.norm(d)
                g = ribbon(Ll, Ll * 0.85, R['leaf'], nu=3 if q >= 1 else 2, nv=3, bend=rg.uniform(0.3, 0.8), fold=0.25, cup=-0.15, seed=j)
                leaf.put(place(g, p, d, roll=rg.normal(0, 0.25)))
        d = pts[-1] - pts[-2]
        if rg.random() < 0.9: heads.append(dict(p=pts[-1], d=d / np.linalg.norm(d), roll=rg.uniform(0, TAU), s=rg.uniform(0.95, 1.25), kind='head'))
    def head(qh):
        """A loose spike 14 cm long, ending at the origin, growing down the stem (-Z): whorls of flowers, wider apart toward the foot."""
        g = Geo(); g.put(tube(np.array([[0, 0, -0.1], [0, 0, 0.0]]), 0.0012, R['stem'], sides=3)); nw = 6 if qh >= 1 else 3
        for w in range(nw):
            z = -0.01 - 0.1 * (w / nw) ** 1.2; nfl = 6 if qh >= 1 else 4
            for k in range(nfl):
                a = k / nfl * TAU + w * 0.7 + rg.normal(0, 0.2); d = heading(a, 0.45 + rg.normal(0, 0.15))
                c = ribbon(0.006, 0.0025, R['calyx'], nu=2, nv=2, bend=-0.2, seed=k); g.put(place(c, [0, 0, z], d, up=(0, 0, 1)))
                fl = plate(0.0058, R['flower'], nr=1, ns=4); tip = np.array([math.cos(a) * 0.011, math.sin(a) * 0.011, z + 0.006])
                g.put(fl, frame(d, up=(0, 0, 1)) @ rot([1, 0, 0], -1.35), tip)
        return g
    return dict(leaf=leaf, stem=stem, heads=heads, head={'head': head}, size=(H, W))


@species
def coreopsis(at, q, rg):
    """Threadleaf coreopsis, Coreopsis verticillata. 16 x 18 in (looks.js). From the photos: an airy, bushy dome of thin upright stems,
    the leaves in whorls of three, each split into needle-fine threads; covered on top with small butter-yellow daisies 2.5-4 cm across,
    eight rays with toothed tips round a small yellow-brown disc."""
    R = {}; R['leaf'] = at.region(110, 220); R['stem'] = at.region(24, 256); R['ray'] = at.region(60, 120); R['disc'] = at.region(64, 64)
    paint_threads(at, R['leaf'], 5, '#3c6a2c', '#4f7c36', width=0.05, spread=0.85, seed=51)
    paint_ramp(at, R['stem'], [(0, '#40602e'), (1, '#55783a')], seed=52)
    def rayshape(t): return np.clip(0.45 + 0.5 * np.sin(np.pi * np.clip(t * 0.7, 0, 1)), 0, 1)
    def rayfn(u, t):
        v = (u - 0.5) * 2; w = rayshape(t); teeth = (t > 0.9) & (np.abs(np.sin(v * np.pi * 1.5)) < (t - 0.9) * 7)
        col = mix(lin('#e4a800'), lin('#f6cf1c'), np.clip(t * 1.4, 0, 1)); ph = v / np.maximum(w, 0.05) * 3.5; vm = band(ph - np.round(ph), 0.15) * 0.4
        return col * (1 - 0.12 * vm)[..., None], ((np.abs(v) < w) & ~teeth).astype(np.float32), 0.4 - vm * 0.4
    at.fill(R['ray'], rayfn)
    def discfn(u, t):
        x, y = (u - 0.5) * 2, (t - 0.5) * 2; r = np.hypot(x, y); col = mix(lin('#8a6a10'), lin('#c09a18'), np.clip(r * 1.3, 0, 1)) * (1 + 0.3 * (noise2(u, t, 30, 53) - 0.5))[..., None]
        return col, (r < 1).astype(np.float32), noise2(u, t, 40, 54)
    at.fill(R['disc'], discfn)
    H = 16 * IN; W = 18 * IN; leaf, stem, heads = Geo(), Geo(), []
    ns = int(rg.integers(38, 52) * (1 if q >= 1 else 0.4))
    for i in range(ns):
        yaw = rg.uniform(0, TAU); out = math.sqrt(rg.uniform(0, 1)); r0 = out * 0.06; L = H * rg.uniform(0.78, 0.98) * (1.05 - 0.3 * out ** 2)
        pts = curve([math.cos(yaw) * r0, math.sin(yaw) * r0, 0], heading(yaw, math.pi / 2 - out * 0.6 - rg.uniform(0, 0.1)), L, 6 if q >= 1 else 3, droop=rg.uniform(0, 0.2), wander=0.03, seed=i)
        stem.put(tube(pts, np.linspace(0.0016, 0.0009, len(pts)), R['stem'], sides=3))
        nn = 6 if q >= 1 else 3
        for j in range(nn):   # whorls of three thread-cut leaves
            f = 0.12 + 0.75 * j / nn; k = min(len(pts) - 2, int(f * (len(pts) - 1))); p = pts[k] + (pts[k + 1] - pts[k]) * (f * (len(pts) - 1) - k)
            for m in range(3):
                ly = yaw + m * TAU / 3 + j * 0.6; Ll = rg.uniform(0.04, 0.06)
                g = ribbon(Ll, Ll * 0.55, R['leaf'], nu=3 if q >= 1 else 2, nv=2, bend=rg.uniform(0, 0.4), seed=j * 3 + m)
                leaf.put(place(g, p, heading(ly, rg.uniform(0.7, 1.15)), roll=rg.normal(0, 0.6)))
        for b in range(int(rg.integers(1, 4))):   # a few flowers at the top of each stem, on short branches
            p = pts[-1] if b == 0 else pts[-2] + rg.normal(0, 0.012, 3); hd = np.array([0, 0, 1.0]) + rg.normal(0, 0.35, 3) + np.array([math.cos(yaw), math.sin(yaw), 0]) * out * 0.5
            tip = p + hd / np.linalg.norm(hd) * (0.0 if b == 0 else rg.uniform(0.02, 0.05))
            if b: stem.put(tube(np.array([p, tip]), 0.0008, R['stem'], sides=3))
            heads.append(dict(p=tip, d=hd / np.linalg.norm(hd), roll=rg.uniform(0, TAU), s=rg.uniform(0.8, 1.1), kind='head'))
    def head(qh):
        g = Geo(); g.put(plate(0.0045, R['disc'], nr=1, ns=8, cup=-0.4), None, [0, 0, 0.0015])
        for k in range(8):
            a = k / 8 * TAU; pg = ribbon(0.014, 0.0075, R['ray'], nu=3 if qh >= 1 else 2, nv=2, bend=rg.uniform(0.0, 0.35), twist=rg.normal(0, 0.2), seed=k)
            g.put(place(pg, [math.cos(a) * 0.003, math.sin(a) * 0.003, 0.0008], heading(a, rg.uniform(-0.05, 0.12))))
        return g
    return dict(leaf=leaf, stem=stem, heads=heads, head={'head': head}, size=(H, W))


# ================================================================= Blender
def clean():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def material(key):
    m = bpy.data.materials.new(key); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    img = bpy.data.images.load(os.path.join(OUT, key + '.webp')); tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = img
    nt.links.new(tx.outputs['Color'], b.inputs['Base Color']); nt.links.new(tx.outputs['Alpha'], b.inputs['Alpha'])
    nimg = bpy.data.images.load(os.path.join(OUT, key + '_n.webp')); nimg.colorspace_settings.name = 'Non-Color'; nx = nt.nodes.new('ShaderNodeTexImage'); nx.image = nimg
    nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(nx.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    b.inputs['Roughness'].default_value = 0.55
    try: b.inputs['Subsurface Weight'].default_value = 0.15
    except KeyError: pass
    for attr, v in (('blend_method', 'CLIP'), ('surface_render_method', 'DITHERED')):
        try: setattr(m, attr, v)
        except Exception: pass
    m.use_backface_culling = False
    return m

def obj(name, g, mat, coll):
    P, UV, F = g.arrays(); me = bpy.data.meshes.new(name); me.from_pydata(P.tolist(), [], F.tolist()); me.update()
    uv = me.uv_layers.new(name='UVMap'); loops = np.empty(len(me.loops), dtype=np.int32); me.loops.foreach_get('vertex_index', loops)
    uvs = UV[loops].copy(); uvs[:, 1] = 1 - uvs[:, 1]; uv.data.foreach_set('uv', uvs.ravel())
    for p in me.polygons: p.use_smooth = True
    me.materials.append(mat); o = bpy.data.objects.new(name, me); coll.objects.link(o); return o

def head_empty(name, h, coll):
    e = bpy.data.objects.new(name, None); e.empty_display_type = 'SINGLE_ARROW'; e.empty_display_size = 0.04
    M = np.eye(4); d = h['d'] / np.linalg.norm(h['d']); R = frame(d, up=(0, 0, 1))      # the head's axis (+Z in its own frame) along d
    Rz = np.stack([R[:, 0], np.cross(d, R[:, 0]), d], 1); Rz = rot(d, h['roll']) @ Rz
    M[:3, :3] = Rz * h['s']; M[:3, 3] = h['p']
    import mathutils; e.matrix_world = mathutils.Matrix(M.tolist()); e['kind'] = h['kind']; coll.objects.link(e); return e

def build(key, preview=False, variants=None):
    clean(); os.makedirs(OUT, exist_ok=True); os.makedirs(BLEND, exist_ok=True)
    fn = SPECIES[key]; parts = []; AS = getattr(fn, 'atlas', 1024); variants = variants or getattr(fn, 'variants', 3)
    # every call paints the same atlas (the painting does not depend on the variant), so each gets a fresh one and the last is kept
    for v in range(variants):
        at = Atlas(AS); hi = fn(at, 1.0, np.random.default_rng(100 + v)); lo = fn(Atlas(AS), 0.4, np.random.default_rng(100 + v)); parts.append((hi, lo))
    at.save(os.path.join(OUT, key + '.webp'), os.path.join(OUT, key + '_n.webp'))
    mat = material(key); coll = bpy.context.scene.collection; tris = {}
    for v, (hi, lo) in enumerate(parts):
        for nm, g in (('leaf', hi['leaf']), ('stem', hi['stem']), ('leaf_lo', lo['leaf']), ('stem_lo', lo['stem'])):
            n = nm.replace('_lo', f'_{v}_lo') if nm.endswith('_lo') else f'{nm}_{v}'; obj(n, g, mat, coll); tris[n] = g.tris
        for i, h in enumerate(hi['heads']): head_empty(f'fl_{v}_{i:03d}', h, coll)
    rgh = np.random.default_rng(7)
    for kind, f in parts[0][0]['head'].items():
        g = f(1.0); obj(kind, g, mat, coll); tris[kind] = g.tris; g = f(0.4); obj(kind + '_lo', g, mat, coll); tris[kind + '_lo'] = g.tris
    meta = dict(key=key, size=list(parts[0][0]['size']), heads={v: len(p[0]['heads']) for v, p in enumerate(parts)}, tris=tris)
    bpy.context.scene['plant'] = json.dumps(meta)
    # export: every mesh and empty, no materials (the garden brings its own, from the atlas)
    for o in bpy.context.scene.objects: o.select_set(True)
    path = os.path.join(OUT, key + '.gltf')
    want = dict(filepath=path, export_format='GLTF_SEPARATE', use_selection=True, export_apply=True, export_texcoords=True, export_normals=True, export_materials='NONE',
                export_yup=True, export_animations=False, export_cameras=False, export_lights=False, export_extras=True)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys(); bpy.ops.export_scene.gltf(**{k: v for k, v in want.items() if k in props})
    sys.path.insert(0, os.path.join(ROOT, 'tools')); import gltf_embed; gltf_embed.embed(path)
    import subprocess; subprocess.run(['node', os.path.join(ROOT, 'tools', 'plants', 'compact.mjs'), path.replace('.gltf', '.json')], check=True)   # quantize and meshopt-pack it
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BLEND, key + '.blend'), compress=True)
    th = tris.get('head', 0); per = [tris[f'leaf_{v}'] + tris[f'stem_{v}'] + meta['heads'][v] * th for v in range(variants)]
    lo = [tris[f'leaf_{v}_lo'] + tris[f'stem_{v}_lo'] + meta['heads'][v] * tris.get('head_lo', 0) for v in range(variants)]
    print(f'{key}: {variants} variants, {np.mean(per):.0f} / {np.mean(lo):.0f} triangles a plant near / far ({th} a head), atlas {os.path.getsize(os.path.join(OUT, key + ".webp")) // 1024} KB, model {os.path.getsize(path.replace(".gltf", ".json")) // 1024} KB')
    if preview: render_preview(key, meta)

def render_preview(key, meta):
    """A Cycles picture of variant 0 with its heads, on a soil-coloured ground, morning sun; and a close-up of a head."""
    import mathutils
    os.makedirs(PREV, exist_ok=True); sc = bpy.context.scene; coll = bpy.data.collections.new('preview'); sc.collection.children.link(coll)
    head = bpy.data.objects.get('head')
    for o in list(sc.objects):
        if o.name.startswith('fl_0_') and head is not None:
            d = bpy.data.objects.new('p_' + o.name, head.data); d.matrix_world = o.matrix_world; coll.objects.link(d)
        if o.name.startswith(('leaf_', 'stem_', 'fl_', 'head')) and not o.name.endswith(('_0',)) and not o.name.startswith('fl_0_'): o.hide_render = True
    if head is not None: head.hide_render = True
    bpy.ops.mesh.primitive_plane_add(size=6); g = bpy.context.object; gm = bpy.data.materials.new('soil'); gm.use_nodes = True; gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.09, 0.06, 0.04, 1); g.data.materials.append(gm)
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 4.0; so = bpy.data.objects.new('sun', sun); so.rotation_euler = (math.radians(50), 0, math.radians(30)); sc.collection.objects.link(so)
    sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True; sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.5, 0.62, 0.8, 1); sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    cam = bpy.data.cameras.new('cam'); co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 24; sc.cycles.transparent_max_bounces = 96; sc.cycles.use_denoising = False; sc.render.resolution_x = 640; sc.render.resolution_y = 640
    H = meta['size'][0]
    def shoot(name, eye, look, lens=40):
        co.location = eye; d = mathutils.Vector(look) - mathutils.Vector(eye); co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); cam.lens = lens
        sc.render.filepath = os.path.join(PREV, f'{key}_{name}.png'); bpy.ops.render.render(write_still=True)
    shoot('plant', (H * 1.6, -H * 1.9, H * 1.0), (0, 0, H * 0.45))
    if not len(coll.objects): return
    hp = [o for o in coll.objects][0].matrix_world.translation
    shoot('head', (hp.x + 0.12, hp.y - 0.18, hp.z + 0.08), tuple(hp), lens=60)

def write_index():
    """assets/plants/index.json: the species the garden may fetch (every one whose model, atlas and normal map are all there)."""
    have = sorted(f[:-5] for f in os.listdir(OUT) if f.endswith('.json') and f != 'index.json' and os.path.exists(os.path.join(OUT, f[:-5] + '.webp')) and os.path.exists(os.path.join(OUT, f[:-5] + '_n.webp')))
    json.dump(dict(species=have), open(os.path.join(OUT, 'index.json'), 'w')); print('index:', len(have), 'species')


import species2
for _k, _v in species2.S.items():
    import plantforms; SPECIES[_k] = plantforms.make_species(_k, _v)


if __name__ == '__main__':
    args = [a for a in (sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])]
    pv = '--preview' in args; keys = [a for a in args if not a.startswith('--')] or list(SPECIES)
    for k in keys: build(k, pv)
    write_index()
