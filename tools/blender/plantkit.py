"""plantkit.py: the parts plants are made of, for tools/blender/build_plants.py.

Geometry is built in numpy (leaves, petals, blades, stems, cones), textures are painted with numpy and PIL into one atlas per species,
and Blender (bpy) is only used to hold the result, render previews and write the glTF and .blend. Everything is in metres, Blender's
axes (Z up), with each plant standing on its own origin.

A leaf or a petal is a ribbon: a curved strip along a centreline, as wide as the organ, with its outline cut by the texture's alpha.
Its local frame: length along +Y, width along +X, its upper face toward +Z. place() puts it on a plant.
"""
import numpy as np, math
from PIL import Image

TAU = 2 * math.pi


# ---------------------------------------------------------------- geometry
class Geo:
    """A triangle mesh being built: positions, uvs, faces."""
    def __init__(self):
        self.P, self.UV, self.F, self.n = [], [], [], 0

    def add(self, P, UV, F):
        P = np.asarray(P, float); self.P.append(P); self.UV.append(np.asarray(UV, float)); self.F.append(np.asarray(F, int) + self.n); self.n += len(P)
        return self

    def put(self, g, M=None, t=None):
        """Add another Geo, turned by M (3x3) and moved by t."""
        if not g.n: return self
        P, UV, F = g.arrays()
        if M is not None: P = P @ np.asarray(M).T
        if t is not None: P = P + np.asarray(t)
        return self.add(P, UV, F)

    def arrays(self):
        if not self.n: return np.zeros((0, 3)), np.zeros((0, 2)), np.zeros((0, 3), int)
        return np.concatenate(self.P), np.concatenate(self.UV), np.concatenate(self.F)

    @property
    def tris(self): return sum(len(f) for f in self.F)


def rot(axis, a):
    axis = np.asarray(axis, float); axis = axis / np.linalg.norm(axis); x, y, z = axis; c, s = math.cos(a), math.sin(a); C = 1 - c
    return np.array([[c + x * x * C, x * y * C - z * s, x * z * C + y * s], [y * x * C + z * s, c + y * y * C, y * z * C - x * s], [z * x * C - y * s, z * y * C + x * s, c + z * z * C]])


def frame(d, up=(0, 0, 1)):
    """A turn whose +Y points along d and whose +Z is as near to up as it can be (so a leaf put with it lies face up)."""
    y = np.asarray(d, float); y = y / np.linalg.norm(y); u = np.asarray(up, float)
    x = np.cross(y, u)
    if np.linalg.norm(x) < 1e-6: x = np.cross(y, [1.0, 0, 0])
    x = x / np.linalg.norm(x); z = np.cross(x, y)
    return np.stack([x, y, z], 1)


def heading(yaw, pitch):
    """A direction: yaw round the vertical (0 = +X), pitch up from the horizontal."""
    return np.array([math.cos(yaw) * math.cos(pitch), math.sin(yaw) * math.cos(pitch), math.sin(pitch)])


def centreline(L, n, bend=0.0, bend_pow=1.6, curl=0.0, twist=0.0):
    """Samples along a curve of length L that sets off along +Y and bends toward -Z (bend: radians turned by the tip), and the frame there.
    Returns points (n,3), side (n,3) and normal (n,3); curl turns the tip back on itself as well, twist turns the strip about its length."""
    u = np.linspace(0, 1, n); th = bend * u ** bend_pow + curl * u ** 4
    d = np.stack([np.zeros(n), np.cos(th), -np.sin(th)], 1); nrm = np.stack([np.zeros(n), np.sin(th), np.cos(th)], 1)
    P = np.zeros((n, 3)); ds = L / (n - 1)
    for i in range(1, n): P[i] = P[i - 1] + (d[i - 1] + d[i]) * 0.5 * ds
    side = np.tile([1.0, 0, 0], (n, 1))
    if twist:
        for i in range(n):
            R = rot(d[i], twist * u[i]); side[i] = R @ side[i]; nrm[i] = R @ nrm[i]
    return P, side, nrm


def ribbon(L, W, rect, nu=8, nv=3, bend=0.0, bend_pow=1.6, curl=0.0, twist=0.0, fold=0.0, cup=0.0, wprof=None, ripple=0.0, seed=0):
    """A leaf, petal or blade: length L, greatest width W, uvs into the atlas rect (x0, y0, x1, y1; y0 at its base).
    fold lifts the halves from the midrib (a V), cup curls the edges up, wprof(u) narrows the strip itself (for blades with no cut-out),
    ripple waves the edges."""
    P0, side, nrm = centreline(L, nu, bend, bend_pow, curl, twist)
    u = np.linspace(0, 1, nu); v = np.linspace(-1, 1, nv); w = wprof(u) if wprof is not None else np.ones(nu)
    rg = np.random.default_rng(seed); ph = rg.uniform(0, TAU)
    P = np.zeros((nu, nv, 3)); UV = np.zeros((nu, nv, 2))
    for i in range(nu):
        hw = W * 0.5 * w[i]
        for j in range(nv):
            z = fold * abs(v[j]) * hw + cup * v[j] ** 2 * hw + ripple * hw * math.sin(ph + u[i] * 9 + (1 if v[j] > 0 else 0) * 2) * abs(v[j]) ** 2
            P[i, j] = P0[i] + side[i] * v[j] * hw + nrm[i] * z
            UV[i, j] = (rect[0] + (v[j] * 0.5 * w[i] + 0.5) * (rect[2] - rect[0]) if wprof is not None else rect[0] + (v[j] * 0.5 + 0.5) * (rect[2] - rect[0]), rect[1] + u[i] * (rect[3] - rect[1]))
    F = []
    for i in range(nu - 1):
        for j in range(nv - 1):
            a, b, c, d = i * nv + j, i * nv + j + 1, (i + 1) * nv + j, (i + 1) * nv + j + 1
            F += [(a, b, d), (a, d, c)]
    return Geo().add(P.reshape(-1, 3), UV.reshape(-1, 2), F)


def plate(R, rect, nr=4, ns=12, cup=0.0, droop=0.0, ripple=0.0, seed=0):
    """A round leaf seen from above (palmate, peltate): a polar mesh of radius R round its stalk's end, cupped or drooping at the rim.
    Its texture is a square rect with the stalk at the centre and the leaf's tip toward +Y."""
    rg = np.random.default_rng(seed); ph = rg.uniform(0, TAU, 3)
    P, UV = [[0, 0, 0]], [[(rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2]]
    for i in range(1, nr + 1):
        r = i / nr
        for j in range(ns):
            a = j / ns * TAU; x, y = math.cos(a) * r, math.sin(a) * r
            z = cup * r * r - droop * max(0, y) * r + ripple * r * r * (math.sin(3 * a + ph[0]) * 0.6 + math.sin(5 * a + ph[1]) * 0.4)
            P.append([x * R, y * R, z * R]); UV.append([rect[0] + (x * 0.5 + 0.5) * (rect[2] - rect[0]), rect[1] + (y * 0.5 + 0.5) * (rect[3] - rect[1])])
    F = [(0, 1 + j, 1 + (j + 1) % ns) for j in range(ns)]
    for i in range(nr - 1):
        for j in range(ns):
            a, b = 1 + i * ns + j, 1 + i * ns + (j + 1) % ns; c, d = a + ns, b + ns
            F += [(a, c, d), (a, d, b)]
    return Geo().add(P, UV, F)


def tube(pts, radii, rect, sides=5, cap=False):
    """A stem along points, tapering through radii; uvs run up a narrow strip of the atlas."""
    pts = np.asarray(pts, float); n = len(pts); radii = np.broadcast_to(np.asarray(radii, float), (n,))
    T = np.gradient(pts, axis=0); T = T / np.maximum(np.linalg.norm(T, axis=1, keepdims=True), 1e-9)
    ref = np.array([0, 0, 1.0]) if abs(T[0][2]) < 0.9 else np.array([1.0, 0, 0])
    X = np.cross(T[0], ref); X = X / np.linalg.norm(X); P, UV, F = [], [], []
    acc = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]); tot = max(acc[-1], 1e-6)
    for i in range(n):
        if i: X = X - T[i] * (X @ T[i]); X = X / max(np.linalg.norm(X), 1e-9)   # carried along (parallel transport), so the stem does not twist
        Y = np.cross(T[i], X)
        for j in range(sides + 1):
            a = j / sides * TAU; P.append(pts[i] + (X * math.cos(a) + Y * math.sin(a)) * radii[i])
            UV.append([rect[0] + j / sides * (rect[2] - rect[0]), rect[1] + acc[i] / tot * (rect[3] - rect[1])])
    for i in range(n - 1):
        for j in range(sides):
            a, b = i * (sides + 1) + j, i * (sides + 1) + j + 1; c, d = a + sides + 1, b + sides + 1
            F += [(a, b, d), (a, d, c)]
    return Geo().add(P, UV, F)


def curve(p0, d0, L, n, droop=0.0, wander=0.0, seed=0):
    """Points of a stem from p0 setting off along d0 for length L, bowing over by droop (radians at the tip) and wandering a little."""
    rg = np.random.default_rng(seed); d = np.asarray(d0, float); d = d / np.linalg.norm(d); p = np.asarray(p0, float); out = [p.copy()]
    hor = np.array([d[0], d[1], 0.0]); hor = hor / np.linalg.norm(hor) if np.linalg.norm(hor) > 1e-6 else np.array([1.0, 0, 0])
    axis = np.cross(d, hor) if np.linalg.norm(np.cross(d, hor)) > 1e-6 else np.cross(d, [1.0, 0, 0]); axis = axis / np.linalg.norm(axis)
    for i in range(1, n):
        u = i / (n - 1); step = L / (n - 1)
        d = rot(axis, -droop * (1.6 * u ** 0.6) / n) @ d   # bows over toward its own outside
        if wander: d = d + rg.normal(0, wander, 3); d = d / np.linalg.norm(d)
        p = p + d * step; out.append(p.copy())
    return np.array(out)


def place(g, origin, d, up=(0, 0, 1), roll=0.0, scale=1.0):
    """A copy of a leaf or petal (local +Y along its length) set at origin, pointing along d, its face as near up as can be, rolled about d."""
    M = frame(d, up)
    if roll: M = rot(M[:, 1], roll) @ M
    return Geo().put(g, M * scale, origin)


def golden(n, i): return i * math.pi * (3 - math.sqrt(5))


# ---------------------------------------------------------------- textures
class Atlas:
    """One species' texture: colour with alpha (the cut-outs) and a normal map, regions handed out in rows."""
    def __init__(self, size=1024):
        self.S = size; self.C = np.zeros((size, size, 4), np.float32); self.H = np.zeros((size, size), np.float32); self.x = 0; self.y = 0; self.row = 0
        self.C[..., :3] = 0.3

    def region(self, w, h, pad=6):
        """A free rect w x h pixels: returns (x0, y0, x1, y1) as fractions (y0 at the top of the image)."""
        if self.x + w + pad > self.S: self.x = 0; self.y += self.row + pad; self.row = 0
        if self.y + h > self.S: raise ValueError('atlas full')
        r = (self.x, self.y, self.x + w, self.y + h); self.x += w + pad; self.row = max(self.row, h)
        return tuple(v / self.S for v in r)

    def grid(self, rect, ss=2):
        """Pixel centres of a rect as (u across 0..1, t along 0..1, 0 at the base = top of the rect) at ss times the resolution."""
        x0, y0, x1, y1 = [int(round(v * self.S)) for v in rect]; w, h = x1 - x0, y1 - y0
        uu, tt = np.meshgrid((np.arange(w * ss) + 0.5) / (w * ss), (np.arange(h * ss) + 0.5) / (h * ss))
        return (x0, y0, w, h), uu, tt

    def put(self, box, col, alpha, height, ss=2):
        """Write supersampled colour (h*ss, w*ss, 3), alpha and height into the atlas."""
        x0, y0, w, h = box
        def down(a): return a.reshape(h, ss, w, ss, *a.shape[2:]).mean(axis=(1, 3))
        a = down(alpha.astype(np.float32)); c = down(col * alpha[..., None]) / np.maximum(a[..., None], 1e-4)
        self.C[y0:y0 + h, x0:x0 + w, :3] = np.where(a[..., None] > 0.002, c, self.C[y0:y0 + h, x0:x0 + w, :3]); self.C[y0:y0 + h, x0:x0 + w, 3] = a
        self.H[y0:y0 + h, x0:x0 + w] = down(height * alpha)

    def fill(self, rect, fn, ss=2):
        """fn(u, t) -> (rgb, alpha, height) over the rect."""
        box, uu, tt = self.grid(rect, ss); c, a, h = fn(uu, tt); self.put(box, c, a, h, ss)

    def bleed(self, n=8):
        """Spread colour out under the transparent parts, so mip levels do not darken the edges."""
        C = self.C[..., :3].copy(); A = (self.C[..., 3] > 0.01).astype(np.float32)
        for _ in range(n):
            s = np.zeros_like(C); k = np.zeros_like(A)
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                s += np.roll(np.roll(C * A[..., None], dy, 0), dx, 1); k += np.roll(np.roll(A, dy, 0), dx, 1)
            grow = (A < 0.5) & (k > 0); C[grow] = s[grow] / k[grow][:, None]; A = np.maximum(A, grow.astype(np.float32))
        self.C[..., :3] = C

    def save(self, path_rgba, path_n, strength=3.0):
        self.bleed()
        rgb = np.clip(self.C[..., :3], 0, 1) ** (1 / 2.2)                 # painted in linear light, stored as sRGB
        Image.fromarray((np.concatenate([rgb, self.C[..., 3:]], 2) * 255 + 0.5).astype(np.uint8), 'RGBA').save(path_rgba)
        gy, gx = np.gradient(self.H); n = np.stack([-gx * strength, gy * strength, np.ones_like(gx)], 2); n = n / np.linalg.norm(n, axis=2, keepdims=True)
        Image.fromarray(((n * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8), 'RGB').save(path_n)


def lin(hexc):
    """'#rrggbb' to linear rgb."""
    c = np.array([int(hexc[i:i + 2], 16) for i in (1, 3, 5)]) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def noise2(u, t, f, seed):
    """Smooth value noise on the rect, about 0..1."""
    rg = np.random.default_rng(seed); g = rg.random((int(f) + 3, int(f) + 3))
    x, y = u * f, t * f; i, j = np.floor(x).astype(int), np.floor(y).astype(int); fx, fy = x - i, y - j
    sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b, c, d = g[j, i], g[j, i + 1], g[j + 1, i], g[j + 1, i + 1]
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy


def mix(a, b, t): t = np.asarray(t)[..., None]; return a * (1 - t) + b * t


def band(x, w):
    """1 on the line x=0, falling off over w."""
    return np.clip(1 - np.abs(x) / w, 0, 1) ** 2


def paint_blade(at, rect, shape, base, tip, mid=None, edge=None, veins=('pinnate', 9, 0.55), midrib=1.0, mottle=0.12, seed=0, gloss_vein=0.0, hair=0.0):
    """A leaf or petal: shape(t) is its half-width (0..1 of the rect's half width) at t along it, tooth(t) roughens the rim.
    Colours run base -> tip along it; veins: ('pinnate', count, angle) or ('parallel', count) or ('radial', count) for petals."""
    def fn(u, t):
        v = (u - 0.5) * 2; w = shape(t); av = np.abs(v); inside = av < w
        edge_d = np.clip((w - av) / np.maximum(w, 1e-3), 0, 1)             # 0 at the rim, 1 on the midrib
        col = mix(lin(base), lin(tip), t ** 0.9)
        if mid is not None: col = mix(col, lin(mid), np.clip(1 - av / 0.35, 0, 1) * 0.5)
        if edge is not None: col = mix(col, lin(edge), (1 - edge_d) ** 3 * 0.8)
        n = noise2(u, t, 18, seed) * 0.6 + noise2(u, t, 60, seed + 1) * 0.4; col = col * (1 + mottle * (n - 0.5) * 2)[..., None]
        hgt = 0.6 * edge_d ** 0.5
        kind = veins[0]; vm = np.zeros_like(u)
        if kind == 'pinnate':
            cnt, ang = veins[1], veins[2]; ph = (t - ang * av) * cnt; vm = band(ph - np.round(ph), 0.07) * (av < w * 0.92) * np.clip(t * 6, 0, 1)
        elif kind == 'parallel':
            cnt = veins[1]; ph = v / np.maximum(w, 1e-3) * cnt * 0.5; vm = band(ph - np.round(ph), 0.12) * 0.6
        elif kind == 'radial':
            cnt = veins[1]; ph = (v / np.maximum(w, 0.05)) * cnt * 0.5; vm = band(ph - np.round(ph), 0.1) * 0.7 * np.clip(1.2 - t, 0, 1)
        rib = band(v, 0.035) * midrib * np.clip(1.1 - t, 0, 1)
        vein_col = lin(mid) if mid is not None else col
        col = mix(col, col * 1.25 + 0.02, np.clip(vm * 0.6 + rib * 0.7, 0, 1))
        hgt = hgt - vm * 0.35 - rib * 0.5 + (hair * noise2(u, t, 200, seed + 2))
        return col, inside.astype(np.float32), hgt
    at.fill(rect, fn)


def paint_plate(at, rect, radius_fn, base, edge=None, centre=None, veins=5, mottle=0.15, seed=0, marble=0.0):
    """A round leaf drawn from above: radius_fn(angle) (angle 0 = toward the tip, +Y) gives its outline; palmate veins run out from the centre."""
    def fn(u, t):
        x, y = (u - 0.5) * 2, (0.5 - t) * -2; r = np.hypot(x, y); a = np.arctan2(x, y)   # a = 0 toward +Y (the tip), t=0 is the stalk end's row
        R = radius_fn(a); inside = r < R
        col = np.broadcast_to(lin(base), r.shape + (3,)).copy()
        if centre is not None: col = mix(col, lin(centre), np.clip(1 - r / 0.35, 0, 1) * 0.6)
        if edge is not None: col = mix(col, lin(edge), np.clip((r / np.maximum(R, 1e-3) - 0.75) * 4, 0, 1) * 0.6)
        n = noise2(u, t, 14, seed) * 0.6 + noise2(u, t, 50, seed + 1) * 0.4; col = col * (1 + mottle * (n - 0.5) * 2)[..., None]
        if marble: col = col * (1 + marble * (noise2(u, t, 6, seed + 3) - 0.5))[..., None]
        ph = a / TAU * veins; vm = band(ph - np.round(ph), 0.06 * veins / 5) * np.clip(1 - r / np.maximum(R, 1e-3), 0, 1) ** 0.4
        col = mix(col, col * 1.3 + 0.02, np.clip(vm * 0.7, 0, 1))
        hgt = 0.5 * np.clip((R - r) * 4, 0, 1) - vm * 0.5
        return col, inside.astype(np.float32), hgt
    at.fill(rect, fn)


def paint_ramp(at, rect, stops, stripes=0, seed=0, noise=0.08):
    """A strip for stems, cones and the like: colour stops along t, with long stripes if asked."""
    def fn(u, t):
        col = np.zeros(u.shape + (3,))
        ts = [s[0] for s in stops]; cs = [lin(s[1]) for s in stops]
        for k in range(3): col[..., k] = np.interp(t, ts, [c[k] for c in cs])
        n = noise2(u, t, 8, seed) * 0.5 + noise2(u, t, 40, seed + 1) * 0.5; col = col * (1 + noise * (n - 0.5) * 2)[..., None]
        if stripes: col = col * (1 - 0.12 * band(np.sin(u * TAU * stripes), 0.4))[..., None]
        return col, np.ones_like(u), noise2(u, t, 30, seed + 2) * 0.3
    at.fill(rect, fn)
