"""plantforms.py: plants described rather than scripted, for tools/blender/build_plants.py.

The first six species in build_plants.py were each written out by hand. The rest share a small number of forms, so they are built here
from a description: what the leaves are like (leaf kinds), how the plant stands (habits: a clump of leafy stems over basal leaves, a dome
of stalked leaves, a fountain of blades), and what its flowers are (heads: daisies, spikes, balls, umbels, plumes, cups and a few
particular ones). A species is then a dict (species2.py), its numbers and colours read from photographs.

Conventions as in plantkit: metres, Z up, a leaf or petal along +Y with its face to +Z, a head along +Z from the tip of its stalk.
"""
import numpy as np, math
from plantkit import *

IN = 0.0254
GA = math.pi * (3 - math.sqrt(5))


def rng_range(rg, r):
    """A number from r: a single value, or (lo, hi) to choose between."""
    return float(r) if np.isscalar(r) else float(rg.uniform(r[0], r[1]))


def at_frac(pts, f):
    """The point f of the way along a polyline (by index), and the direction there."""
    n = len(pts) - 1; x = min(max(f, 0), 1) * n; k = min(n - 1, int(x)); s = x - k
    p = pts[k] + (pts[k + 1] - pts[k]) * s; d = pts[k + 1] - pts[k]; return p, d / max(np.linalg.norm(d), 1e-9)


def unit(v): v = np.asarray(v, float); return v / max(np.linalg.norm(v), 1e-9)


def facing(g, p, n, up=(0, 0, 1), roll=0.0, scale=1.0):
    """A plate (face +Z) set at p with its face turned along n."""
    M = frame(n, up) @ rot([1, 0, 0], -math.pi / 2)
    if roll: M = rot(n, roll) @ M
    return Geo().put(g, M * scale, p)


# ================================================================= outlines (half-width along a leaf or petal, 0..1)
def outline(name, teeth=0, tooth=0.0):
    base = {
        'lance':   lambda t: np.clip(np.sin(np.pi * np.clip(t, 0, 1) ** 0.8) ** 0.9, 0, 1),
        'linear':  lambda t: np.clip(1.15 - t ** 6 * 1.1, 0, 1) * np.clip(t * 12, 0, 1),
        'ovate':   lambda t: np.clip(np.sin(np.pi * np.clip(t, 0, 1) ** 0.62) ** 0.7, 0, 1),
        'obovate': lambda t: np.clip(np.sin(np.pi * np.clip(t, 0, 1) ** 1.35) ** 0.7, 0, 1),
        'elliptic': lambda t: np.clip(np.sin(np.pi * np.clip(t, 0, 1)) ** 0.75, 0, 1),
        'heart':   lambda t: np.clip(np.sin(np.pi * (0.13 + 0.87 * np.clip(t, 0, 1)) ** 0.8) ** 0.75, 0, 1) * np.clip(t / 0.05, 0.35, 1) ** 0.5,
        'spoon':   lambda t: np.where(t < 0.35, 0.18, np.clip(np.sin(np.pi * np.clip((t - 0.25) / 0.75, 0, 1) ** 0.8) ** 0.7, 0.18, 1)),
        'oblong':  lambda t: np.clip(np.sin(np.pi * np.clip(t, 0, 1)) ** 0.35, 0, 1),
        'petal':   lambda t: np.clip(0.3 + 0.75 * np.sin(np.pi * np.clip(t * 0.62, 0, 1)) ** 0.8, 0, 1) * np.clip((1 - t) * 9, 0, 1) ** 0.5,
        'ray':     lambda t: np.clip(0.42 + 0.55 * np.sin(np.pi * np.clip(t * 0.62, 0, 1)), 0, 1),
        'strap':   lambda t: np.clip((1 - t) * 6, 0, 1) ** 0.6,
        'tepal':   lambda t: np.clip(np.sin(np.pi * np.clip(t, 0, 1) ** 0.75) ** 0.8, 0, 1),
        'fan':     lambda t: np.clip(0.2 + 0.85 * t ** 0.7, 0, 1),
    }[name]
    if not teeth: return base
    return lambda t: base(t) * (1 - tooth * np.abs(np.sin(t * np.pi * teeth)) ** 0.6 * np.clip(t * 5, 0, 1))


# ================================================================= painters
def paint_petal(at, rect, shape, c0, c1, c2=None, veins=0, notch=0, blotch=None, spots=None, seed=0):
    """A petal or ray: c0 at its foot to c1 by the middle (and c2 at the tip); veins running along it; notch cuts the tip into teeth;
    blotch=(colour, extent) a patch at the foot; spots=(colour, n) freckles in the throat."""
    def fn(u, t):
        v = (u - 0.5) * 2; w = shape(t); inside = np.abs(v) < w
        if notch: inside &= ~(t > 1 - 0.08 * (1 - np.abs(np.sin(v * np.pi * notch * 0.5))))
        col = mix(lin(c0), lin(c1), np.clip(t * 1.8, 0, 1))
        if c2: col = mix(col, lin(c2), np.clip((t - 0.55) * 2.2, 0, 1))
        if blotch: col = mix(col, lin(blotch[0]), np.clip((blotch[1] - t) / 0.06, 0, 1))
        if spots:
            sp = (noise2(u, t, 26, seed + 5) > 0.72) * (t < 0.45) * (np.abs(v) < 0.6); col = mix(col, lin(spots[0]), sp * 0.9)
        vm = 0
        if veins:
            ph = v / np.maximum(w, 0.05) * veins * 0.5; vm = band(ph - np.round(ph), 0.16) * 0.5 * np.clip(1.3 - t, 0, 1)
            col = col * (1 - 0.15 * vm)[..., None]
        col = col * (1 + 0.12 * (noise2(u, t, 24, seed) - 0.5))[..., None]
        return col, inside.astype(np.float32), 0.4 - vm * 0.4
    at.fill(rect, fn)


def paint_flower(at, rect, n, shape, c_in, c_out, eye=None, eye_r=0.18, depth=0.55, ring=None, veins=0, seed=0, round_=0.0):
    """A whole small flower seen face on, in a square rect: n petals (shape: 'round', 'star', 'narrow'), c_in at the centre to c_out at
    the rim, an eye of another colour, a ring between."""
    def fn(u, t):
        x, y = (u - 0.5) * 2, (t - 0.5) * 2; r = np.hypot(x, y); a = np.arctan2(y, x)
        ph = (a * n / TAU) % 1.0; c = np.abs(ph - 0.5) * 2   # 0 mid-petal .. 1 between petals
        if shape == 'round': R = 1 - depth * c ** 3
        elif shape == 'star': R = 1 - depth * c ** 0.9
        else: R = np.where(c < 0.45, 1.0, 1 - depth * np.clip((c - 0.45) * 4, 0, 1))
        if round_: R = R * (1 - round_) + round_
        inside = r < R * 0.98
        col = mix(lin(c_in), lin(c_out), np.clip(r / np.maximum(R, 1e-3) * 1.3, 0, 1))
        if ring is not None: col = mix(col, lin(ring), band(r - eye_r * 1.6, 0.12) * 0.8)
        if eye is not None: col = mix(col, lin(eye), np.clip((eye_r - r) / 0.05, 0, 1))
        if veins: vm = band(((a * n * veins / TAU) % 1.0) - 0.5, 0.25) * np.clip(r - eye_r, 0, 1); col = col * (1 - 0.2 * vm)[..., None]
        col = col * (1 + 0.1 * (noise2(u, t, 20, seed) - 0.5))[..., None]
        return col, inside.astype(np.float32), 0.5 * (1 - r) + 0.2 * (1 - c)
    at.fill(rect, fn)


def paint_disc(at, rect, c_mid, c_rim, dots='#000000', ndots=0.0, ring=None, seed=0):
    """A flower's centre seen from above: c_mid to c_rim, with florets as dots and a ring (pollen) if asked."""
    def fn(u, t):
        x, y = (u - 0.5) * 2, (t - 0.5) * 2; r = np.hypot(x, y)
        col = mix(lin(c_mid), lin(c_rim), np.clip(r, 0, 1))
        if ndots: d = noise2(u, t, 18 + 30 * ndots, seed) > 0.62; col = mix(col, lin(dots), d * 0.6)
        if ring: col = mix(col, lin(ring[0]), band(r - ring[1], 0.15))
        col = col * (1 + 0.25 * (noise2(u, t, 50, seed + 1) - 0.5))[..., None]
        return col, (r < 1).astype(np.float32), noise2(u, t, 60, seed + 2) * 0.6 + 0.4 * (1 - r)
    at.fill(rect, fn)


def paint_brush(at, rect, prof, stops, el='dots', size=0.06, density=1.0, axis=None, gap=0.0, seed=0, upward=0.0, hair=0.0):
    """A card for a spike or plume seen from the side (the axis up the middle, t from foot to tip): prof(t) its half-width; filled with
    el: 'dots' (tight florets), 'stars' (small open flowers), 'threads' (feathery, liatris), 'branches' (a grass panicle, spikelets on
    branches), 'beads' (spikelets close to the axis); stops colour it from foot to tip."""
    rg = np.random.default_rng(seed)
    def ramp(t):
        ts = [s[0] for s in stops]; cs = [lin(s[1]) for s in stops]; col = np.zeros(t.shape + (3,))
        for k in range(3): col[..., k] = np.interp(t, ts, [c[k] for c in cs])
        return col
    def fn(u, t):
        x = (u - 0.5) * 2; w = prof(t); A = np.zeros_like(u); Hh = np.zeros_like(u)
        if el in ('dots', 'stars'):
            # florets as soft blobs on a jittered lattice, thinning toward the rim of the profile
            N = int(1 / size); cells_u, cells_t = np.floor(u * N), np.floor(t * N * 4)
            for k in range(2):
                jx = noise2(cells_u / N + k * 0.37, cells_t / (N * 4), N, seed + k) - 0.5; jy = noise2(cells_u / N, cells_t / (N * 4) + k * 0.41, N, seed + 7 + k) - 0.5
                cx = (cells_u + 0.5 + jx * 0.6) / N; cy = (cells_t + 0.5 + jy * 0.6) / (N * 4)
                dx = (u - cx) * N; dy = (t - cy) * N * 4; r = np.hypot(dx, dy * 1.0)
                blob = r < (0.5 if el == 'dots' else 0.45 * (0.75 + 0.25 * np.cos(5 * np.arctan2(dy, dx))))
                keep = (np.abs(cx - 0.5) * 2 < prof(cy) * (0.75 + 0.35 * noise2(cx, cy, 9, seed + 3))) & (noise2(cx, cy, 30, seed + 4 + k) < 0.5 + 0.5 * density)
                A = np.maximum(A, (blob & keep).astype(np.float32)); Hh = np.maximum(Hh, (0.5 - r) * blob * keep)
        elif el == 'threads':
            for k in range(int(80 * density)):
                t0 = rg.uniform(0, 1); s = rg.choice([-1, 1]); ang = rg.uniform(0.15, 0.9) + upward
                L = prof(np.array(t0)) * rg.uniform(0.7, 1.05); xs = s * np.clip((t - t0) / max(math.tan(ang), 0.05), 0, None) * 0 + s * (t - t0) / max(np.cos(ang), 0.1)
                along = (x * s) / max(math.cos(ang), 0.15); ty = t0 + along * math.sin(ang) * 0.15
                m = (x * s > 0) & (x * s < L) & (np.abs(t - ty) < 0.004 + 0.004 * size * 10)
                A = np.maximum(A, m.astype(np.float32))
            A = np.maximum(A, (np.abs(x) < w * 0.35) * (noise2(u, t, 120, seed) > 0.45))
            Hh = A * 0.4
        elif el in ('branches', 'beads'):
            nb = int(18 * density)
            for k in range(nb):
                t0 = (k + rg.uniform(0.2, 0.8)) / nb * 0.92; s = 1 if k % 2 else -1; L = float(prof(np.array(t0 + 0.04))) * rg.uniform(0.75, 1.05)
                ang = rg.uniform(0.35, 0.8) + upward
                # the branch: from (0, t0) out at angle ang above the horizontal, as far as the profile allows
                xx = x * s; ty = t0 + xx * math.tan(ang) * 0.12; onb = (xx > 0) & (xx < L) & (np.abs(t - ty) < 0.0028)
                A = np.maximum(A, onb.astype(np.float32) * (0.0 if el == 'beads' else 1.0))
                nsp = int(4 + 10 * L) if el == 'branches' else 6
                for j in range(nsp):
                    f = (j + 0.6) / nsp; sx = f * L; sy = t0 + sx * math.tan(ang) * 0.12
                    if el == 'beads': sx = f * L * 0.45; sy = t0 + j * 0.006
                    e = ((xx - sx) / (size * 0.55)) ** 2 + ((t - sy - size * 0.05) / (size * 0.2)) ** 2 < 1
                    A = np.maximum(A, e.astype(np.float32)); Hh = np.maximum(Hh, e * 0.5)
        if axis is not None or el == 'branches': A = np.maximum(A, (np.abs(x) < 0.025) & (t < 0.97))
        A = A * (t < 0.995) * (t > gap)
        col = ramp(t) * (1 + 0.3 * (noise2(u, t, 70, seed + 9) - 0.5))[..., None]
        if axis is not None: col = np.where(((np.abs(x) < 0.03) & (Hh < 0.05))[..., None], lin(axis), col)
        return col, A, Hh + hair * noise2(u, t, 150, seed + 11)
    at.fill(rect, fn)


def paint_dissected(at, rect, npin, c0, c1, rachis, depth=1, pin_ang=0.9, pin_w=0.3, lobes=0, prof=None, seed=0, mottle=0.12, hair=0.0):
    """A leaf cut into pinnae (a fern frond, yarrow, poppy, globe thistle): pinnae every 1/npin along a rachis, angled forward by pin_ang,
    reaching the profile prof(t); lobes cuts each pinna into that many lobes (bipinnate)."""
    prof = prof or (lambda t: np.clip(np.sin(np.pi * np.clip(t, 0, 1) ** 0.75) ** 0.8, 0, 1))
    def fn(u, t):
        x = (u - 0.5) * 2; ax = np.abs(x); inside = (ax < 0.035) & (t < 0.985)
        for k in range(npin):
            t0 = 0.04 + 0.94 * (k + 0.5) / npin; L = float(prof(np.array(t0)));
            if L < 0.03: continue
            ca, sa = math.cos(pin_ang), math.sin(pin_ang)
            # in units where the rect is 2 wide and 1 long: along the pinna and across it
            dy = (t - t0) * (2 * npin) / npin * 1.0
            along = ax * ca + (t - t0) * 6 * sa; across = -ax * sa + (t - t0) * 6 * ca
            f = np.clip(along / max(L, 1e-3), 0, 1); hw = pin_w / npin * 6 * np.sin(np.pi * np.clip(f, 0, 1) ** 0.7) ** 0.8
            if lobes: hw = hw * (0.55 + 0.45 * np.abs(np.cos(f * np.pi * lobes)))
            inside |= (along > 0) & (along < L) & (np.abs(across) < hw)
        col = mix(lin(c0), lin(c1), t); col = col * (1 + mottle * (noise2(u, t, 30, seed) - 0.5) * 2)[..., None]
        col = np.where(((ax < 0.035))[..., None], lin(rachis), col)
        return col, inside.astype(np.float32), 0.4 + hair * noise2(u, t, 150, seed + 3) - (ax < 0.035) * 0.3
    at.fill(rect, fn)


def paint_strap(at, rect, c0, c1, stripes=None, margin=None, veins=5, mottle=0.08, seed=0):
    """A grass blade or strap leaf: c0 at the foot to c1 at the tip; stripes=(colour, half-width) a band down the middle (variegated);
    margin=(colour, width) its edges."""
    def fn(u, t):
        v = (u - 0.5) * 2; col = mix(lin(c0), lin(c1), t ** 0.8)
        if stripes: col = mix(col, lin(stripes[0]), np.clip((stripes[1] - np.abs(v)) / 0.08, 0, 1))
        if margin: col = mix(col, lin(margin[0]), np.clip((np.abs(v) - (1 - margin[1])) / 0.06, 0, 1))
        ph = v * veins * 0.5; vm = band(ph - np.round(ph), 0.12) * 0.5
        col = col * (1 + mottle * (noise2(u, t, 30, seed) - 0.5) * 2)[..., None] * (1 + 0.1 * vm)[..., None]
        return col, np.ones_like(u), 0.4 - vm * 0.3 - band(v, 0.06) * 0.3
    at.fill(rect, fn)


# ================================================================= leaves
class Leaf:
    """A kind of leaf: painted once into the atlas, then built at any size. o: kind and colours (see the kinds below).
    geo(L, rg, q, **bend) gives one in its own frame: +Y along it from its foot, face up. Plate-like leaves (centre=True) are built
    round their middle instead, to be put at the end of a stalk."""
    def __init__(self, at, **o):
        self.o = o; k = self.kind = o.get('kind', 'simple'); self.centre = False; c = o.get('col', '#4a6a36')
        tip, mid, edge = o.get('tip', c), o.get('mid'), o.get('edge')
        if k == 'simple':
            self.aspect = o.get('aspect', 0.35); shp = outline(o.get('shape', 'lance'), *o.get('teeth', (0, 0)))
            h = 256; w = int(min(256, max(24, h * self.aspect)))
            self.rect = at.region(w, h)
            cut = None
            if o.get('notch'):   # a heart-shaped foot: a notch where the stalk meets it
                nd = o['notch']; cut = lambda v, t: t < nd * (1 - np.abs(v) / 0.45)
            paint_blade(at, self.rect, shp, base=c, tip=tip, mid=mid, edge=edge, veins=o.get('veins', ('pinnate', 7, 0.7)), midrib=o.get('midrib', 1.0),
                        mottle=o.get('mottle', 0.12), seed=o.get('seed', 1), hair=o.get('hair', 0.0), cut=cut)
        elif k == 'strap':
            self.aspect = o.get('aspect', 0.02); self.rect = at.region(o.get('px', 40), 384)
            paint_strap(at, self.rect, c, tip, stripes=o.get('stripes'), margin=o.get('margin'), veins=o.get('nveins', 5), seed=o.get('seed', 2))
        elif k == 'plate':
            self.centre = True; self.aspect = 1.0; self.rect = at.region(220, 220); lobes, depth, nt, td = o.get('lobes', 5), o.get('depth', 0.4), o.get('nteeth', 0), o.get('tooth', 0.05)
            sinus = o.get('sinus', 0.0)
            def radius(a):
                r = 1 - depth * (1 - np.abs(np.cos(a * lobes / 2)) ** o.get('lobe_pow', 0.6))
                if nt: r = r * (1 - td * np.abs(np.sin(a * nt / 2)) ** 0.8)
                if sinus: r = r * np.clip(np.abs(np.abs(a) - math.pi) / sinus, 0, 1) ** 0.4
                return r * 0.98
            paint_plate(at, self.rect, radius, base=c, edge=edge, centre=mid, veins=o.get('nveins', lobes), mottle=o.get('mottle', 0.14), marble=o.get('marble', 0.0), seed=o.get('seed', 3))
        elif k == 'dissected':
            self.aspect = o.get('aspect', 0.45); h = 320; self.rect = at.region(int(h * self.aspect), h)
            paint_dissected(at, self.rect, o.get('npin', 12), c, tip, o.get('rachis', c), pin_ang=o.get('pin_ang', 0.9), pin_w=o.get('pin_w', 0.3), lobes=o.get('lobes', 0),
                            prof=o.get('prof'), seed=o.get('seed', 4), hair=o.get('hair', 0.0))
        elif k in ('compound', 'digitate', 'ternate'):
            sub = dict(o.get('leaflet', {})); sub.setdefault('col', c); sub.setdefault('tip', tip); sub.setdefault('kind', 'simple'); sub.setdefault('seed', o.get('seed', 5))
            self.leaflet = Leaf(at, **sub); self.aspect = o.get('aspect', 0.6); self.centre = k in ('digitate',)
            self.stalk = o.get('stalk_rect') or at.region(16, 128)
            if not o.get('stalk_rect'): paint_ramp(at, self.stalk, [(0, o.get('rachis', c)), (1, o.get('rachis', c))], seed=6)
        else: raise ValueError(k)

    def geo(self, L, rg, q, bend=None, fold=None, cup=0.0, twist=None, wprof=None, ripple=0.0):
        o = self.o; k = self.kind; hi = q >= 1
        bend = o.get('bend', 0.6) * rg.uniform(0.7, 1.3) if bend is None else bend
        fold = o.get('fold', 0.2) if fold is None else fold
        twist = rg.normal(0, o.get('twist', 0.15)) if twist is None else twist
        if k == 'simple':   # segments enough for its size: a 2 cm leaf needs three, a 15 cm one six
            nu = min(o.get('nu', 6), max(2, int(L / 0.02) + 2)); nu = nu if hi else max(2, nu // 2)
            g = ribbon(L, L * self.aspect, self.rect, nu=nu, nv=3 if (hi and L > 0.03) else 2, bend=bend, fold=fold, cup=o.get('cup', cup), twist=twist, ripple=o.get('ripple', ripple), seed=int(rg.integers(1e6)))
            if o.get('notch'): g = Geo().put(g, None, [0, -L * o['notch'], 0])
            return g
        if k == 'strap':
            taper = o.get('wprof') or (lambda u: np.clip(1.1 - u ** 3, 0, 1) * (1 - np.clip((u - 0.82) / 0.18, 0, 1) * 0.9))
            return ribbon(L, o.get('width', 0.006) * rg.uniform(0.85, 1.15), self.rect, nu=o.get('nu', 7) if hi else 3, nv=3 if hi and o.get('fold', 0.5) else 2, bend=bend, bend_pow=o.get('bend_pow', 1.3),
                          fold=fold, twist=twist, wprof=taper, seed=int(rg.integers(1e6)))
        if k == 'plate':
            big = L > 0.08
            return plate(L * 0.5, self.rect, nr=(3 if big else 2) if hi else 1, ns=(o.get('ns', 12) if big else 8) if hi else 6, cup=o.get('cup', 0.15) * rg.uniform(0.6, 1.4), droop=o.get('droop', 0.25) * rg.uniform(0.5, 1.5),
                         ripple=o.get('ripple', 0.1), seed=int(rg.integers(1e6)))
        if k == 'dissected':
            nu = min(o.get('nu', 7), max(2, int(L / 0.03) + 2))
            return ribbon(L, L * self.aspect, self.rect, nu=nu if hi else max(2, nu // 2), nv=3 if (hi and L > 0.05) else 2, bend=bend, fold=fold, twist=twist, seed=int(rg.integers(1e6)))
        if k == 'compound':
            # a rachis with pairs of leaflets and one at the end
            g = Geo(); npair = o.get('pairs', 3); ll = L * o.get('leaflet_len', 0.35); rach = L - ll * 0.8
            pts = curve([0, 0, 0], [0, 1.0, 0.0], max(rach, 1e-3), 4 if hi else 2, droop=bend * 0.5, seed=1)
            # the rachis as a thin flat strip (two triangles a segment)
            g.put(ribbon(rach, o.get('rachis_w', 0.003), self.stalk, nu=3 if hi else 2, nv=2, bend=bend * 0.5))
            for j in range(npair):
                f = o.get('first', 0.25) + (1 - o.get('first', 0.25)) * j / max(1, npair)
                p, d = at_frac(pts, f); side = np.cross(d, [0, 0, 1.0]); side = unit(side)
                s = ll * (o.get('shrink', 0.75) + (1 - o.get('shrink', 0.75)) * f)
                for sg in (1, -1):
                    dd = unit(side * sg * 0.85 + d * o.get('fwd', 0.5) + np.array([0, 0, 0.05]))
                    g.put(place(self.leaflet.geo(s, rg, q, bend=0.15, fold=0.25), p, dd, roll=rg.normal(0, 0.1)))
            p, d = at_frac(pts, 1.0); g.put(place(self.leaflet.geo(ll * o.get('terminal', 1.1), rg, q, bend=0.2, fold=0.25), p, d))
            return g
        if k == 'ternate':
            # three leaflets (or three groups of three) from the end of the stalk, spread in its plane
            g = Geo(); n2 = o.get('levels', 1); ll = L * o.get('leaflet_len', 0.55)
            g.put(ribbon(L - ll * 0.6, 0.0025, self.stalk, nu=2, nv=2, bend=bend * 0.3)); tip = np.array([0, L - ll * 0.6, -0.0])
            def three(at_p, d0, s, lev):
                for a in (-0.95, 0, 0.95):
                    d = unit(rot([0, 0, 1], a) @ d0)
                    if lev > 1: q2 = at_p + d * s * 0.35; g.put(ribbon(s * 0.35, 0.002, self.stalk, nu=2, nv=2)); three(q2, d, s * 0.6, lev - 1)
                    else: g.put(place(self.leaflet.geo(s * (1.1 if a == 0 else 0.9), rg, q, bend=0.2, fold=0.2), at_p, d + np.array([0, 0, 0.05])))
            three(tip, np.array([0, 1.0, 0]), ll, n2)
            return g
        if k == 'digitate':
            # leaflets fanning out from the end of the stalk (lupin, rodgersia), centred on it
            g = Geo(); n = o.get('n', 7); spread = o.get('spread', TAU); ll = L * 0.5
            for j in range(n):
                a = -spread / 2 + spread * (j + 0.5) / n if spread < TAU - 0.01 else j / n * TAU
                d = np.array([math.sin(a), math.cos(a), -0.15]); s = ll * (0.75 + 0.25 * math.cos(a / 2) ** 2 if spread < TAU else 1.0) * rg.uniform(0.9, 1.1)
                g.put(place(self.leaflet.geo(s, rg, q, bend=o.get('lbend', 0.3), fold=0.25), d * 0.004, unit(d)))
            return g


# ================================================================= florets (small flowers, built along +Y like a petal, or plates)
class Florets:
    """Kinds of small flower, each painted once. make(kind, size, rg, q) -> Geo in its own frame, pointing (and opening) along +Z."""
    def __init__(self, at): self.at = at; self.rects = {}

    def flower(self, key, n=5, shape='round', c_in='#ffffff', c_out='#ffffff', eye=None, eye_r=0.18, depth=0.55, ring=None, veins=0, px=64, round_=0.0):
        r = self.at.region(px, px); paint_flower(self.at, r, n, shape, c_in, c_out, eye=eye, eye_r=eye_r, depth=depth, ring=ring, veins=veins, seed=len(self.rects), round_=round_); self.rects[key] = r; return r

    def petal(self, key, shape, c0, c1, c2=None, w=48, h=96, **k):
        r = self.at.region(w, h); paint_petal(self.at, r, outline(shape) if isinstance(shape, str) else shape, c0, c1, c2, seed=len(self.rects), **k); self.rects[key] = r; return r

    def ramp(self, key, stops, w=24, h=96):
        r = self.at.region(w, h); paint_ramp(self.at, r, stops, seed=len(self.rects)); self.rects[key] = r; return r


def flat_floret(rect, size, q, ns=6):
    """A flower face on, as a little polar plate facing +Z."""
    return plate(size, rect, nr=1, ns=ns if q >= 1 else 4, cup=0.25)


def tube_floret(rect, L, r0, r1, q, sides=4):
    return tube(np.array([[0, 0, 0], [0, 0, L]]), np.array([r0, r1]), rect, sides=sides if q >= 1 else 3)


def bell_floret(rect, L, R, q, flare=1.4, sides=6):
    """A bell or trumpet opening along +Z (foxglove, campanula, hosta)."""
    z = np.array([0, 0.45, 0.85, 1.0]) * L; r = np.array([0.25, 0.7, 0.95, flare]) * R
    if q < 1: z, r = z[[0, 2, 3]], r[[0, 2, 3]]
    return tube(np.stack([np.zeros_like(z), np.zeros_like(z), z], 1), r, rect, sides=sides if q >= 1 else 4)


def lipped_floret(rect_tube, rect_face, L, R, q, tilt=1.25):
    """A two-lipped flower (sage, hyssop, lobelia): a short tube and its face, the face tilted to look out and a little down."""
    g = Geo(); g.put(tube_floret(rect_tube, L * 0.6, R * 0.25, R * 0.4, q, sides=3))
    g.put(plate(R, rect_face, nr=1, ns=6 if q >= 1 else 4, cup=0.2), rot([1, 0, 0], 0.0), [0, 0, L * 0.6])
    return g


def pea_floret(rect_std, rect_keel, L, q):
    """A pea flower (lupin, false indigo): an upright standard behind a folded keel, opening along +Z, the standard toward +Y."""
    g = Geo()
    g.put(ribbon(L, L * 0.9, rect_std, nu=3 if q >= 1 else 2, nv=3 if q >= 1 else 2, bend=-0.5, cup=0.35), rot([1, 0, 0], math.pi / 2 - 0.3), [0, -L * 0.15, 0])
    if q >= 1: g.put(ribbon(L * 0.9, L * 0.45, rect_keel, nu=3, nv=3, bend=0.3, fold=0.9), rot([1, 0, 0], math.pi / 2 + 0.35) @ rot([0, 1, 0], math.pi), [0, 0, 0])
    return g


# ================================================================= heads (built along +Z from the tip of their stalk)
def h_daisy(q, ray, nray, L, W, disc=None, bend=0.3, pitch=0.0, rows=1, rg=None, jitter=0.06, twist=0.2, cup=0.0, ray_rects=None):
    """Rays round a disc. disc: dict(kind='flat'|'dome'|'cone'|'ball', r, h, rect, spines=(rect, n, len))."""
    g = Geo(); rg = rg or np.random.default_rng(0); r0 = disc['r'] if disc else 0.002
    if disc: g.put(h_disc(q, **disc))
    for row in range(rows):
        nr = nray if q >= 1 else max(5, nray * 2 // 3)
        for i in range(nr):
            a = (i + row * 0.5) / nr * TAU + rg.normal(0, jitter); s = (1 - 0.18 * row) * rg.uniform(0.9, 1.08)
            rr = ray_rects[i % len(ray_rects)] if ray_rects else ray
            pg = ribbon(L * s, W, rr, nu=4 if q >= 1 else 2, nv=3 if (q >= 1 and L > 0.035) else 2, bend=bend * rg.uniform(0.7, 1.3), bend_pow=1.0, cup=cup, twist=rg.normal(0, twist), seed=int(rg.integers(1e6)))
            g.put(place(pg, [math.cos(a) * r0 * 0.9, math.sin(a) * r0 * 0.9, 0.0015 + row * 0.001], heading(a, pitch + row * 0.25 + rg.normal(0, 0.05)), up=(0, 0, 1)))
    return g


def h_disc(q, kind='flat', r=0.008, h=0.004, rect=None, spines=None):
    """A flower's middle: a flat disc, a dome, a cone or a ball, with stiff spines (coneflower bracts) on it if asked."""
    g = Geo(); nr, ns = ((4, 14) if r > 0.006 else (2, 10)) if q >= 1 else (2, 7 if r > 0.006 else 5)
    prof = {'flat': lambda s: h * (1 - s ** 2) * 0.3, 'dome': lambda s: h * (1 - s ** 2) ** 0.7, 'cone': lambda s: h * (1 - s ** 1.3), 'ball': lambda s: h * (1 - s ** 2) ** 0.5}[kind]
    P, UV, F = [[0, 0, prof(0)]], [[(rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2]], []
    for i in range(1, nr + 1):
        s = i / nr
        for j in range(ns):
            a = j / ns * TAU; P.append([math.cos(a) * r * s, math.sin(a) * r * s, prof(s)]); UV.append([rect[0] + (0.5 + 0.5 * math.cos(a) * s) * (rect[2] - rect[0]), rect[1] + (0.5 + 0.5 * math.sin(a) * s) * (rect[3] - rect[1])])
    for j in range(ns): F.append((0, 1 + j, 1 + (j + 1) % ns))
    for i in range(nr - 1):
        for j in range(ns):
            a, b = 1 + i * ns + j, 1 + i * ns + (j + 1) % ns; F += [(a, a + ns, b + ns), (a, b + ns, b)]
    if kind == 'ball':   # close the underside a little so it reads as round from the side
        base = len(P); P.append([0, 0, -h * 0.4]); UV.append(UV[0])
        for j in range(ns): F.append((base, 1 + (nr - 1) * ns + (j + 1) % ns, 1 + (nr - 1) * ns + j))
    g.add(P, UV, F)
    if spines and q >= 1:
        srect, n, sl = spines
        for i in range(n):
            s = math.sqrt((i + 0.5) / n) * 0.95; a = i * GA; z = prof(s)
            nz = unit([math.cos(a) * s * 1.2, math.sin(a) * s * 1.2, 1.0]); base = np.array([math.cos(a) * r * s, math.sin(a) * r * s, z])
            g.put(tube(np.array([base, base + nz * sl]), np.array([sl * 0.22, 0.0002]), srect, sides=3))
    return g


def h_spike(q, L, R, florets, n, rg, spiral=True, taper=0.6, buds=0.2, bud=None, core=None, core_r=0.0, pitch=0.25, nod=0.0, start=0.0, scale_top=0.55, droop=0.0, arc=None):
    """Florets up a spike of length L from its foot (z=0) to its tip, the spike R across at its foot and taper of that at the top.
    florets(s, rg, q) -> Geo pointing along +Z; the top buds fraction are bud(s, rg, q) instead. core: the axis rect, core_r its radius."""
    g = Geo(); m = n if q >= 1 else max(3, int(n * 0.25))
    axis = lambda z: np.array([0, droop * (z / L) ** 2 * L, z])
    if core is not None: g.put(tube(np.array([axis(z) for z in np.linspace(0, L, 4 if q >= 1 else 2)]), np.linspace(core_r, core_r * 0.5, 4 if q >= 1 else 2), core, sides=4 if q >= 1 else 3))
    for i in range(m):
        f = start + (1 - start) * (i + 0.5) / m; z = f * L; a = (i * GA if spiral else (i % 4) * math.pi / 2 + (i // 4) * math.pi / 4) + rg.normal(0, 0.1)
        if arc is not None: a = rg.uniform(-arc, arc)
        rr = R * (1 - (1 - taper) * f); s = 1 - (1 - scale_top) * f
        out = np.array([math.cos(a), math.sin(a), 0]); d = unit(out * math.cos(pitch) + np.array([0, 0, math.sin(pitch)]) + rg.normal(0, 0.06, 3))
        p = axis(z) + out * rr * 0.5
        el = bud(s, rg, q) if (bud is not None and f > 1 - buds) else florets(s, rg, q)
        M = frame(d, up=(0, 0, 1)) @ rot([1, 0, 0], -math.pi / 2)    # its +Z out along d
        g.put(el, M, p)
    return g


def h_cards(q, L, W, rect, n=3, bend=0.0, twist=0.0, foot=0.0):
    """A spike, plume or brush as crossed cards, each a strip of the painted head (cheap, and reads as round)."""
    g = Geo(); m = n if q >= 1 else 2
    for k in range(m):
        c = ribbon(L, W, rect, nu=4 if q >= 1 else 2, nv=2, bend=bend, twist=twist)
        g.put(place(c, [0, 0, foot], [0, 0, 1.0], up=heading(k / m * math.pi, 0)))
    return g


def h_ball(q, R, florets, n, rg, core=None, stalks=0.0, cap=1.0, flat=1.0):
    """Florets over a sphere of radius R (allium, globe thistle, bergamot): each on a short stalk out from the centre if stalks; cap is
    how much of the sphere (1 all of it, 0.5 the top half), flat squashes it (hydrangea, phlox domes)."""
    g = Geo(); m = n if q >= 1 else min(n, max(6, int(n * 0.12))); c = np.array([0, 0, R * flat * (0.9 if cap > 0.6 else 0.2)])
    if core is not None:
        nr, ns = (5, 10) if q >= 1 else (3, 6); P, UV, F = [], [], []
        for i in range(nr + 1):
            th = math.pi * (1 - cap) + math.pi * cap * i / nr
            for j in range(ns + 1):
                a = j / ns * TAU; P.append(c + np.array([math.sin(math.pi - th) * math.cos(a) * R * 0.85, math.sin(math.pi - th) * math.sin(a) * R * 0.85, -math.cos(math.pi - th) * R * 0.85 * flat]))
                UV.append([core[0] + j / ns * (core[2] - core[0]), core[1] + i / nr * (core[3] - core[1])])
        for i in range(nr):
            for j in range(ns):
                a = i * (ns + 1) + j; F += [(a, a + 1, a + ns + 2), (a, a + ns + 2, a + ns + 1)]
        g.add(P, UV, F)
    for i in range(m):
        zf = 1 - 2 * (i + 0.5) / m; zf = 1 - (1 - zf) * cap; th = math.acos(max(-1, min(1, zf))); a = i * GA
        d = np.array([math.sin(th) * math.cos(a), math.sin(th) * math.sin(a), math.cos(th) * flat]); dn = unit(d)
        p = c + d * R * 0.9
        el = florets(1.0, rg, q); M = frame(dn, up=(0, 0, 1)) @ rot([1, 0, 0], -math.pi / 2); g.put(el, M, p)
    return g


def h_umbel(q, R, florets, n, rg, dome=0.3, pedicel=None, ped_len=0.0):
    """Many small flowers on a flat or gently domed top (yarrow, butterfly weed, verbena, stonecrop): florets face up, spread over a disc
    of radius R raised in the middle by dome x R; with pedicels (rect) each on its own little stalk from the centre."""
    g = Geo(); m = n if q >= 1 else min(n, max(4, int(n * 0.15)))
    for i in range(m):
        s = math.sqrt((i + 0.5) / m); a = i * GA + rg.normal(0, 0.1); x, y = math.cos(a) * s * R, math.sin(a) * s * R; z = ped_len + dome * R * (1 - s * s)
        p = np.array([x, y, z]); d = unit([x * 0.6 / max(R, 1e-6), y * 0.6 / max(R, 1e-6), 1.0])
        if pedicel is not None and q >= 1 and i % 2 == 0: g.put(tube(np.array([[0, 0, 0], p]), 0.0004, pedicel, sides=3))
        el = florets(1.0 - 0.1 * s, rg, q); M = frame(d, up=(0, 1, 0)) @ rot([1, 0, 0], -math.pi / 2); g.put(el, M, p)
    return g


def h_cup(q, petal, npet, L, W, rg, cup=0.5, pitch=0.6, rows=1, centre=None, bend=-0.3, ripple=0.08, open_=1.0, twist=0.1):
    """A bowl or saucer of petals (poppy, marsh marigold, anemone, rose): npet petals rising at pitch (radians above flat) round a centre."""
    g = Geo()
    if centre is not None: g.put(centre)
    for row in range(rows):
        rf = row / max(1, rows - 1) if rows > 1 else 0
        nn = npet + row * 2 if q >= 1 else max(4, npet)
        if q < 1 and row > 1: break
        for i in range(nn):
            a = (i + row * 0.37) / nn * TAU + rg.normal(0, 0.08); s = (1 - 0.32 * rf) * rg.uniform(0.92, 1.06)
            pg = ribbon(L * s, W * s, petal[row % len(petal)] if isinstance(petal, list) else petal, nu=5 if q >= 1 else 3, nv=3, bend=bend, bend_pow=1.0, cup=cup, ripple=ripple, twist=rg.normal(0, twist), seed=int(rg.integers(1e6)))
            g.put(place(pg, [math.cos(a) * 0.002, math.sin(a) * 0.002, 0.001 * row], heading(a, (pitch + rf * 0.6) * open_ + (1 - open_) * 1.3), up=(0, 0, 1)))
    return g


def h_trumpet(q, tepal, n, L, W, rg, flare=0.45, recurve=0.6, tube_rect=None, stamens=None, tw=0.1):
    """A lily-like flower (daylily, lily): n tepals rising together from a short tube and curving out."""
    g = Geo()
    for i in range(n):
        a = i / n * TAU + (0.0 if i % 2 else 0.2) + rg.normal(0, 0.05); s = rg.uniform(0.92, 1.05) * (1.0 if i % 2 == 0 else 0.92)
        pg = ribbon(L * s, W * (1.15 if i % 2 else 1.0), tepal, nu=6 if q >= 1 else 3, nv=3, bend=recurve * rg.uniform(0.85, 1.15), bend_pow=1.6, cup=0.3, twist=rg.normal(0, tw), seed=int(rg.integers(1e6)))
        g.put(place(pg, [math.cos(a) * 0.002, math.sin(a) * 0.002, 0], heading(a, math.pi / 2 - flare), up=(0, 0, 1)))
    if stamens and q >= 1:
        sr, sl = stamens
        for i in range(6):
            a = i / 6 * TAU; tip = np.array([math.cos(a) * sl * 0.35, math.sin(a) * sl * 0.35, sl])
            g.put(tube(np.array([[0, 0, 0], tip * 0.5 + [0, 0, sl * 0.1], tip]), 0.0005, sr, sides=3))
    return g


# ================================================================= habits
class Ctx:
    def __init__(self, at, q, rg): self.at, self.q, self.rg, self.hi = at, q, rg, q >= 1


def stem_leaves(ctx, leaf, pts, spec, yaw0, geo_leaf, sym=None):
    """Leaves up a stem: spec n, f (from, to), L (m), shrink, arr 'alt'|'opp'|'whorl', pitch, bend."""
    rg = ctx.rg; n = int(round(rng_range(rg, spec['n']) * (1 if ctx.hi else spec.get('lo', 0.5))))
    f0, f1 = spec.get('f', (0.08, 0.7)); arr = spec.get('arr', 'alt')
    k = 0
    for j in range(n):
        f = f0 + (f1 - f0) * (j / max(1, n - 1)) + rg.uniform(-0.02, 0.02); p, d = at_frac(pts, f)
        Ls = rng_range(rg, spec['L']) * (1 - spec.get('shrink', 0.4) * f)
        if arr == 'alt': yaws = [yaw0 + j * 2.4 + rg.normal(0, 0.3)]
        elif arr == 'opp': yaws = [yaw0 + j * math.pi / 2, yaw0 + j * math.pi / 2 + math.pi]
        else: yaws = [yaw0 + j * 0.9 + m * TAU / spec.get('whorl', 3) for m in range(spec.get('whorl', 3))]
        for ly in yaws:
            pitch = rng_range(rg, spec.get('pitch', (0.3, 0.8)))
            dd = unit(heading(ly, pitch) * 0.8 + d * spec.get('hug', 0.25))
            g = leaf.geo(Ls, rg, ctx.q, bend=spec.get('bend', 0.6) * rg.uniform(0.6, 1.3))
            if leaf.centre: geo_leaf.put(place(g, p + heading(ly, 0) * Ls * 0.45, heading(ly + rg.normal(0, 0.3), rg.uniform(-0.2, 0.2)), roll=rg.normal(0, 0.2)))
            else: geo_leaf.put(place(g, p, dd, roll=rg.normal(0, 0.2)))
            k += 1
    return k


def basal(ctx, leaf, spec, geo_leaf, geo_stem, stalk_rect):
    """A rosette or tuft of leaves from the crown: spec n, L, pitch, r0 (spread of the crown), stalk (fraction of L that is stalk), bend."""
    rg = ctx.rg; n = int(round(rng_range(rg, spec['n']) * (1 if ctx.hi else spec.get('lo', 0.5))))
    for i in range(n):
        yaw = i * GA + rg.normal(0, 0.2); r0 = rng_range(rg, spec.get('r0', 0.02)); pitch = rng_range(rg, spec.get('pitch', (0.4, 0.9))); L = rng_range(rg, spec['L'])
        base = np.array([math.cos(yaw) * r0, math.sin(yaw) * r0, 0.005]); stalk = spec.get('stalk', 0.0)
        if leaf.centre or stalk:
            sl = L * (stalk or 0.6); tipd = heading(yaw, pitch); pts = curve(base, tipd, sl, 4 if ctx.hi else 2, droop=spec.get('droop', 0.4), seed=i)
            geo_stem.put(tube(pts, np.linspace(spec.get('stalk_r', 0.002), spec.get('stalk_r', 0.002) * 0.6, len(pts)), stalk_rect, sides=3))
            p, d = at_frac(pts, 1.0)
            if leaf.centre:
                g = leaf.geo(L, rg, ctx.q); geo_leaf.put(place(g, p + unit([d[0], d[1], 0]) * L * 0.42, heading(yaw + rg.normal(0, 0.3), rng_range(rg, spec.get('tilt', (-0.35, 0.15)))), roll=rg.normal(0, 0.2)))
            else:
                g = leaf.geo(L * (1 - stalk), rg, ctx.q, bend=spec.get('bend', 0.8) * rg.uniform(0.6, 1.3)); geo_leaf.put(place(g, p, d, roll=rg.normal(0, 0.2)))
        else:
            g = leaf.geo(L, rg, ctx.q, bend=spec.get('bend', 0.8) * rg.uniform(0.6, 1.4) * (1.6 - pitch * 0.5))
            geo_leaf.put(place(g, base, heading(yaw, pitch), roll=rg.normal(0, spec.get('roll', 0.2))))


def clump(ctx, sp, leaves, stem_rect):
    """The common form: basal leaves, then leafy flowering stems with a head at the tip of each (and of side shoots, or of many short
    branches up the top of the stem). sp: H, W (m); basal; stems: n, h (fraction of H), lean, droop, r, leaves, heads."""
    rg = ctx.rg; H, W = sp['H'], sp['W']; leaf, stem, heads = Geo(), Geo(), []
    if sp.get('basal'): basal(ctx, leaves[sp['basal'].get('leaf', 'basal')], sp['basal'], leaf, stem, stem_rect)
    st = sp.get('stems')
    if st:
        ns = int(round(rng_range(rg, st['n'])))
        for i in range(ns):
            yaw = i * GA * 1.3 + rg.uniform(0, 0.5); lean = rng_range(rg, st.get('lean', (0.05, 0.3))); L = rng_range(rg, st['len']) if 'len' in st else H * rng_range(rg, st.get('h', (0.75, 1.0)))
            r0 = rng_range(rg, st.get('r0', (0.01, W * 0.12))); base = np.array([math.cos(yaw) * r0, math.sin(yaw) * r0, 0])
            nseg = st.get('seg', 8) if ctx.hi else 4
            pts = curve(base, heading(yaw, math.pi / 2 - lean), L, nseg, droop=rng_range(rg, st.get('droop', (0.0, 0.2))), wander=st.get('wander', 0.02), seed=i + 7)
            r = st.get('r', (0.003, 0.0018)); geo_r = np.linspace(r[0], r[1], len(pts))
            stem.put(tube(pts, geo_r, stem_rect, sides=st.get('sides', 4) if ctx.hi else 3))
            if st.get('leaves'): stem_leaves(ctx, leaves[st['leaves'].get('leaf', 'stem')], pts, st['leaves'], yaw, leaf)
            hs = st.get('heads', {'at': 'tip'}); kind = 'head'
            def head_at(p, d, s=1.0, up=0.3, out=0.0, yy=yaw):
                dd = unit(d * (1 - up) + np.array([0, 0, up]) + heading(yy, 0) * out + rg.normal(0, hs.get('jit', 0.12), 3))
                heads.append(dict(p=p, d=dd, roll=rg.uniform(0, TAU), s=s * rg.uniform(0.88, 1.1), kind=kind))
            at = hs.get('at', 'tip')
            if at in ('tip', 'tip+side'):
                p, d = at_frac(pts, 1.0); head_at(p, d, 1.0, hs.get('up', 0.3), hs.get('out', 0.0))
            if at in ('tip+side', 'branches'):
                nb = int(round(rng_range(rg, hs.get('n', (1, 3)))))
                for b in range(nb):
                    f = rng_range(rg, hs.get('f', (0.55, 0.9))) if at == 'tip+side' else hs.get('f', (0.5, 0.95))[0] + (hs.get('f', (0.5, 0.95))[1] - hs.get('f', (0.5, 0.95))[0]) * (b + 0.5) / nb
                    p, d = at_frac(pts, f); by = yaw + b * 2.4 + rg.normal(0, 0.3); bl = L * rng_range(rg, hs.get('len', (0.08, 0.2))) * (1.2 - f * 0.6 if at == 'branches' else 1)
                    bp = curve(p, unit(d * 0.4 + heading(by, hs.get('bpitch', 0.6))), bl, 3, droop=hs.get('bdroop', 0.1), seed=b + 90)
                    stem.put(tube(bp, np.linspace(r[1] * 0.8, r[1] * 0.5, len(bp)), stem_rect, sides=3))
                    if hs.get('bleaf') and ctx.hi: stem_leaves(ctx, leaves[hs['bleaf']], bp, dict(n=1, f=(0.4, 0.4), L=hs.get('bleafL', 0.02), pitch=(0.4, 0.8)), by, leaf)
                    q2, d2 = at_frac(bp, 1.0); head_at(q2, d2, rng_range(rg, hs.get('s', (0.7, 0.9))), hs.get('up', 0.3))
            if at == 'axils':   # flowers or spikes up the stem itself (hollyhock-like): heads along f
                nb = int(round(rng_range(rg, hs.get('n', (4, 8)))))
                for b in range(nb):
                    f = hs.get('f', (0.5, 1.0))[0] + (hs.get('f', (0.5, 1.0))[1] - hs.get('f', (0.5, 1.0))[0]) * b / max(1, nb - 1); p, d = at_frac(pts, f)
                    head_at(p, unit(heading(yaw + b * 2.4, 0.5)), 1.0 - 0.3 * f, 0.4)
    return dict(leaf=leaf, stem=stem, heads=heads)


def mound(ctx, sp, leaves, stem_rect):
    """A dome of stalked leaves (lady's mantle, masterwort, hosta), flowers on stalks held over it (or among it)."""
    rg = ctx.rg; H, W = sp['H'], sp['W']; leaf, stem, heads = Geo(), Geo(), []
    m = sp['mound']; lf = leaves[m.get('leaf', 'basal')]
    nl = int(round(rng_range(rg, m['n']) * (1 if ctx.hi else m.get('lo', 0.4))))
    for i in range(nl):
        yaw = i * GA + rg.normal(0, 0.2); out = rg.uniform(0.05, 1.0) ** m.get('spread_pow', 0.6); reach = W * 0.46 * out
        hgt = H * m.get('top', 0.6) * (1 - m.get('flat', 0.8) * out ** 2) * rg.uniform(0.75, 1.05) + 0.02
        tip = np.array([math.cos(yaw) * reach, math.sin(yaw) * reach, hgt]); base = np.array([math.cos(yaw) * 0.02, math.sin(yaw) * 0.02, 0])
        mid = (base + tip) / 2 + np.array([0, 0, hgt * 0.25]); pts = np.array([base + (mid - base) * k / 2 for k in range(2)] + [mid + (tip - mid) * k / 2 for k in range(1, 3)])
        stem.put(tube(pts, np.linspace(m.get('stalk_r', 0.002), m.get('stalk_r', 0.002) * 0.6, len(pts)), stem_rect, sides=3))
        L = rng_range(rg, m['L']) * (1.1 - 0.25 * out)
        if lf.centre: leaf.put(place(lf.geo(L, rg, ctx.q), tip + heading(yaw, 0) * L * 0.1, heading(yaw + rg.normal(0, 0.4), rng_range(rg, m.get('tilt', (-0.4, 0.15)))), roll=rg.normal(0, 0.25)))
        else: leaf.put(place(lf.geo(L, rg, ctx.q), tip, heading(yaw + rg.normal(0, 0.3), rng_range(rg, m.get('tilt', (-0.1, 0.5)))), roll=rg.normal(0, 0.25)))
    f = sp.get('flowers')
    if f:
        nf = int(round(rng_range(rg, f['n'])))
        for i in range(nf):
            yaw = rg.uniform(0, TAU); out = rg.uniform(*f.get('out', (0.1, 0.9))) ** 0.7; reach = W * 0.48 * out
            hgt = H * rng_range(rg, f.get('h', (0.85, 1.0))) * (1 - f.get('flat', 0.4) * out ** 2)
            tip = np.array([math.cos(yaw) * reach, math.sin(yaw) * reach, hgt]); base = np.array([math.cos(yaw) * reach * f.get('from', 0.2), math.sin(yaw) * reach * f.get('from', 0.2), hgt * f.get('from_h', 0.0)])
            pts = curve(base, unit(tip - base + np.array([0, 0, 0.3 * hgt])), np.linalg.norm(tip - base) * 1.05, 4 if ctx.hi else 2, droop=f.get('droop', 0.3), seed=i + 50)
            stem.put(tube(pts, f.get('r', 0.0012), stem_rect, sides=3))
            if f.get('leaves'): stem_leaves(ctx, leaves[f['leaves'].get('leaf', 'stem')], pts, f['leaves'], yaw, leaf)
            p, d = at_frac(pts, 1.0)
            if f.get('branch'):   # a loose spray: a few heads from the stalk's end
                for b in range(int(rng_range(rg, f['branch']))):
                    by = yaw + b * 2.4; bp = curve(p, unit(d * 0.5 + heading(by, 0.7)), rng_range(rg, f.get('blen', (0.02, 0.05))), 3, droop=0.2, seed=b)
                    stem.put(tube(bp, f.get('r', 0.0012) * 0.7, stem_rect, sides=3)); q2, d2 = at_frac(bp, 1.0)
                    heads.append(dict(p=q2, d=unit(d2 + np.array([0, 0, f.get('up', 0.6)]) + rg.normal(0, 0.2, 3)), roll=rg.uniform(0, TAU), s=rg.uniform(0.8, 1.05), kind='head'))
            else:
                heads.append(dict(p=p, d=unit(d * (1 - f.get('up', 0.5)) + np.array([0, 0, f.get('up', 0.5)]) + heading(yaw, 0) * out * f.get('out_face', 0.3) + rg.normal(0, 0.2, 3)), roll=rg.uniform(0, TAU), s=rg.uniform(0.85, 1.1), kind='head'))
    return dict(leaf=leaf, stem=stem, heads=heads)


def grass(ctx, sp, leaves, stem_rect):
    """A fountain of blades from a tight crown, with culms carrying the flower heads (or straps and leafless scapes, for bulbs)."""
    rg = ctx.rg; H, W = sp['H'], sp['W']; leaf, stem, heads = Geo(), Geo(), []
    b = sp['blades']; lf = leaves[b.get('leaf', 'blade')]; lf2 = leaves.get(b.get('leaf2', ''))
    nb = int(round(rng_range(rg, b['n']) * (1 if ctx.hi else b.get('lo', 0.3))))
    for i in range(nb):
        yaw = rg.uniform(0, TAU) if not b.get('fan') else (rg.choice([0, math.pi]) + rg.normal(0, 0.25)); r0 = rg.uniform(0, rng_range(rg, b.get('r0', 0.03)))
        pitch = rng_range(rg, b.get('pitch', (0.85, 1.4))); L = rng_range(rg, b['L'])
        bend = rng_range(rg, b.get('bend', (1.2, 2.4))) * (1.8 - pitch * 0.6) ** b.get('bend_k', 1.0)
        use = lf2 if (lf2 is not None and rg.random() < b.get('p2', 0.15)) else lf
        g = use.geo(L, rg, ctx.q, bend=bend, twist=rg.normal(0, b.get('twist', 0.5)))
        leaf.put(place(g, [math.cos(yaw) * r0, math.sin(yaw) * r0, 0], heading(yaw, pitch), roll=rg.normal(0, 0.3)))
    c = sp.get('culms')
    if c:
        nc = int(round(rng_range(rg, c['n'])))
        for i in range(nc):
            yaw = rg.uniform(0, TAU); r0 = rg.uniform(0, rng_range(rg, c.get('r0', 0.025))); L = H * rng_range(rg, c.get('h', (0.8, 1.0)))
            pts = curve([math.cos(yaw) * r0, math.sin(yaw) * r0, 0], heading(yaw, math.pi / 2 - rng_range(rg, c.get('lean', (0.05, 0.3)))), L, 6 if ctx.hi else 3,
                        droop=rng_range(rg, c.get('droop', (0.05, 0.35))), wander=c.get('wander', 0.015), seed=i)
            stem.put(tube(pts, np.linspace(*c.get('r', (0.0014, 0.0009)), len(pts)), stem_rect, sides=3))
            if c.get('leaves'): stem_leaves(ctx, leaves[c['leaves'].get('leaf', 'blade')], pts, c['leaves'], yaw, leaf)
            p, d = at_frac(pts, 1.0)
            nh = int(round(rng_range(rg, c.get('per', 1))))
            for k in range(nh):
                if k == 0: heads.append(dict(p=p, d=unit(d + np.array([0, 0, c.get('up', 0.0)])), roll=rg.uniform(0, TAU), s=rg.uniform(0.85, 1.12), kind='head'))
                else:   # a few flowers on short stalks from the scape's top (daylily, iris)
                    by = yaw + k * 2.2; bp = curve(p - d * 0.01 * k, unit(d * 0.5 + heading(by, 0.6)), rng_range(rg, c.get('blen', (0.02, 0.05))), 3, droop=0.2, seed=k)
                    stem.put(tube(bp, 0.001, stem_rect, sides=3)); q2, d2 = at_frac(bp, 1.0)
                    heads.append(dict(p=q2, d=unit(d2 + np.array([0, 0, 0.3])), roll=rg.uniform(0, TAU), s=rg.uniform(0.8, 1.0), kind='head'))
    return dict(leaf=leaf, stem=stem, heads=heads)


HABITS = dict(clump=clump, mound=mound, grass=grass)


def make_species(name, sp):
    """A species function for build_plants.build from a description (species2.py)."""
    def fn(at, q, rg):
        ctx = Ctx(at, q, rg); leaves = {k: Leaf(at, **v) for k, v in sp['leaves'].items()}
        stem_rect = at.region(24, 256); paint_ramp(at, stem_rect, sp.get('stem_col', [(0, '#4a5e36'), (1, '#5e7a42')]), stripes=sp.get('stripes', 0), seed=9)
        fl = Florets(at); heads_fn = sp['head'](fl, ctx) if sp.get('head') else None   # the head: paints its parts now, builds later
        sp2 = dict(sp); sp2['H'] = sp['size'][0] * IN; sp2['W'] = sp['size'][1] * IN
        out = HABITS[sp['habit']](ctx, sp2, leaves, stem_rect)
        if sp.get('extra'): sp['extra'](ctx, sp2, leaves, stem_rect, out)
        out['head'] = {'head': heads_fn} if heads_fn else {}
        if not heads_fn: out['heads'] = []
        out['size'] = (sp2['H'], sp2['W'])
        for part in ('leaf', 'stem'):   # nothing below the ground: blades and leaves bowed over that far lie on it instead
            g = out[part]
            for P in g.P: z = P[:, 2]; low = z < 0.006; z[low] = 0.006 - (0.006 - z[low]) * 0.08
        return out
    fn.__name__ = name; fn.__doc__ = sp.get('doc', ''); fn.atlas = sp.get('atlas', 512); fn.variants = sp.get('variants', 3)
    return fn
