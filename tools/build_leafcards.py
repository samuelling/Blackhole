#!/usr/bin/env python3
"""Leaf cards for the garden's trees, drawn from botanical outlines: one leafy twig and one single leaf per species.

    python3 tools/build_leafcards.py [--preview]

Writes assets/tex/trees_atlas.webp (colour + cut-out), trees_atlas_n.webp (normals) and trees_atlas_m.webp, the map the
leaf-colour model reads: R = which leaf (so each leaf on a twig turns and falls on its own), G = turn order within the
leaf (0 turns first: margins and the tissue between veins; 1 last: along the veins), B = wood (twigs keep their colour).

Layout (2048 x 1280): eight 512 px twig cells in two rows, then eight 256 px single leaves in a third row.
Species order matches src/senescence.js: lime, willow, red maple, sugar maple, sweetgum, paper birch, red oak, ginkgo.
The leaf shapes are the ones Turning Grove drew; lime and willow are new."""
import math, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
TAU = math.tau
frac = lambda x: x - math.floor(x)
tooth = lambda x: 1 - 2 * frac(x)
def ang_diff(a, b):
    d = (a - b) % TAU
    return d - TAU if d > math.pi else d
def qline(a, b, bend, n=10):
    mx, my, dx, dy = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, b[0] - a[0], b[1] - a[1]; cx, cy = mx - dy * bend, my + dx * bend
    return [((1 - t) ** 2 * a[0] + 2 * (1 - t) * t * cx + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * cy + t * t * b[1]) for t in (i / n for i in range(n + 1))]

# ------------------------------------------------------------------ outlines: base at (0, 0), tip at (0, -1)
def polar_shape(lobes, base, w, pw, serr, serrA, notch, pet, pinnate=None):
    def r_at(th):
        r = base
        for a, L in lobes: r = max(r, L * max(0, 1 - abs(ang_diff(th, a)) / w) ** pw)
        db = abs(ang_diff(th, math.pi))
        if db < notch: r *= 0.3 + 0.7 * (db / notch) ** 0.8
        return r * (1 + serrA * tooth(th / TAU * serr))
    raw = [(math.sin(th) * r_at(th), -math.cos(th) * r_at(th)) for th in (k / 720 * TAU for k in range(720))]
    by = r_at(math.pi) * 0.3; k = 1 / (by - min(p[1] for p in raw)); tf = lambda p: (p[0] * k, (p[1] - by) * k)
    veins = []
    if pinnate:                                   # a midrib with side veins (lime)
        veins.append(([(0, 0), (0, -0.97)], 0.028))
        for t, ang, L in pinnate:
            for s in (-1, 1): veins.append((qline((0, -t), (s * math.sin(ang) * L, -t - math.cos(ang) * L), 0.1 * s, 8), 0.012))
    else:
        for a, L in lobes:
            if L < base * 1.2: continue
            r = r_at(a) * 0.93; tip = (math.sin(a) * r, -math.cos(a) * r); main = qline((0, by), tip, 0.06 * (1 if a >= 0 else -1))
            veins.append(([tf(p) for p in main], 0.03 if a == 0 else 0.022))
            for f in (0.32, 0.5, 0.66, 0.8):
                p, q = main[round(f * 10)], main[min(10, round(f * 10) + 1)]; d = math.atan2(q[1] - p[1], q[0] - p[0])
                for s in (-1, 1):
                    ang, ln = d + s * 0.78, L * 0.24 * (1 - f * 0.5); veins.append(([tf(x) for x in qline(p, (p[0] + math.cos(ang) * ln, p[1] + math.sin(ang) * ln), 0.08 * s, 5)], 0.009))
    return dict(outline=[tf(p) for p in raw], veins=veins, pet=pet)
def pinnate_shape(wfn, vein_ts, pet, bend, vw=0.011):
    N = 360; Lf = [(-wfn(i / N, -1), -i / N) for i in range(N + 1)]; R = [(wfn(i / N, 1), -i / N) for i in range(N + 1)]
    veins = [([(0, 0), (0, -0.98)], 0.03)]
    for t in vein_ts:
        for s in (-1, 1): t2 = min(0.99, t + bend); veins.append((qline((0, -t), (s * wfn(t2, s) * 0.9, -t2), 0.05 * s, 8), vw))
    return dict(outline=Lf + R[::-1], veins=veins, pet=pet)
def fan_shape():
    A = 1.02; rA = lambda a: 0.93 + 0.06 * math.cos(a * 2.6) - 0.26 * math.exp(-(a / 0.075) ** 2) + 0.016 * math.sin(a * 29)
    pts = [(0, 0)]
    for i in range(41): s = i / 40; a = -A * (0.35 + 0.65 * s ** 0.7); r = rA(-A) * s; pts.append((math.sin(a) * r, -math.cos(a) * r))
    for i in range(201): a = -A + 2 * A * i / 200; r = rA(a); pts.append((math.sin(a) * r, -math.cos(a) * r))
    for i in range(40, -1, -1): s = i / 40; a = A * (0.35 + 0.65 * s ** 0.7); r = rA(A) * s; pts.append((math.sin(a) * r, -math.cos(a) * r))
    k = 1 / -min(p[1] for p in pts); veins = []
    for i in range(27):
        a = -A * 0.97 + 2 * A * 0.97 * i / 26; r = rA(a) * 0.96; a0 = a * 0.35
        veins.append(([(p[0] * k, p[1] * k) for p in qline((math.sin(a0) * 0.05, -math.cos(a0) * 0.05), (math.sin(a) * r, -math.cos(a) * r), 0.0, 8)], 0.008))
    return dict(outline=[(p[0] * k, p[1] * k) for p in pts], veins=veins, pet=0.42)
def oak_w(t, s):
    env = 0.5 * math.sin(math.pi * min(1, t * 1.02)) ** 0.72 * min(1, (t / 0.16) ** 0.7); lob = abs(math.sin(math.pi * (t * 4.4 + 0.3 + (0.12 if s > 0 else 0))))
    return env * (0.4 + 0.6 * lob ** 0.6) + (0.04 * env if lob > 0.99 else 0)
birch_w = lambda t, s: 0.37 * math.sin(math.pi * t ** 0.72) ** 0.92 * (1 + 0.05 * tooth(t * 26) + 0.025 * tooth(t * 52))
willow_w = lambda t, s: 0.075 * math.sin(math.pi * t ** 0.62) ** 0.85 * (1 + 0.04 * tooth(t * 60))

# name, shape, summer colour (sRGB), leaf length as a fraction of the twig card, how leaves sit on the twig
SPECIES = [
    ('lime', polar_shape([(0, 0.68), (1.1, 0.5), (-1.1, 0.5), (2.15, 0.5), (-2.15, 0.5)], 0.45, 1.0, 0.55, 46, 0.025, 0.42, 0.45,
                         pinnate=[(0.1, 1.15, 0.4), (0.26, 0.95, 0.4), (0.42, 0.85, 0.34), (0.58, 0.8, 0.26), (0.74, 0.75, 0.17)]), (88, 150, 52), 0.135, dict(n=5, per=6, ang=58, opp=False, sep=0.7)),
    ('willow', pinnate_shape(willow_w, [0.08 + 0.065 * i for i in range(13)], 0.05, 0.1, 0.006), (112, 160, 62), 0.2, dict(n=7, per=14, ang=32, opp=False, slender=True, gap=0.16, sep=0.1)),
    ('rubrum', polar_shape([(0, 0.64), (1.0, 0.5), (-1.0, 0.5), (1.95, 0.22), (-1.95, 0.22)], 0.22, 0.6, 0.95, 64, 0.03, 0.45, 0.4), (90, 152, 54), 0.2, dict(n=4, per=3, ang=52, opp=True)),
    ('saccharum', polar_shape([(0, 0.62), (0.88, 0.58), (-0.88, 0.58), (1.8, 0.38), (-1.8, 0.38)], 0.2, 0.52, 0.7, 22, 0.04, 0.5, 0.45), (84, 146, 50), 0.235, dict(n=4, per=3, ang=55, opp=True)),
    ('liquidambar', polar_shape([(0, 0.64), (1.26, 0.6), (-1.26, 0.6), (2.45, 0.5), (-2.45, 0.5)], 0.17, 0.5, 1.25, 110, 0.014, 0.3, 0.5), (80, 148, 54), 0.22, dict(n=4, per=4, ang=55, opp=False)),
    ('papyrifera', pinnate_shape(birch_w, [0.14, 0.23, 0.32, 0.41, 0.5, 0.59, 0.68, 0.77, 0.86], 0.22, 0.08), (98, 156, 54), 0.125, dict(n=5, per=9, ang=55, opp=False, slender=True, sep=0.6)),
    ('rubra', pinnate_shape(oak_w, [t for t in ((k + 0.2) / 4.4 for k in range(4)) if 0.08 < t < 0.92], 0.16, 0.05, 0.014), (72, 140, 54), 0.27, dict(n=4, per=4, ang=48, opp=False)),
    ('biloba', fan_shape(), (104, 158, 54), 0.14, dict(n=5, per=4, ang=40, opp=False, whorl=3, sep=0.42)),
]

rs = np.random.RandomState(20261122)
def noise(shape, scale):                         # smooth noise in -1..1
    g = rs.rand(max(2, int(shape[0] / scale) + 2), max(2, int(shape[1] / scale) + 2)).astype(np.float32)
    z = ndi.zoom(g, (shape[0] / g.shape[0] + 0.01, shape[1] / g.shape[1] + 0.01), order=3)[:shape[0], :shape[1]]
    return (z - z.mean()) / (np.abs(z - z.mean()).max() + 1e-6)
lin = lambda c: np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
srgb = lambda c: np.where(c <= 0.0031308, c * 12.92, 1.055 * np.clip(c, 0, None) ** (1 / 2.4) - 0.055)
LUM_REF = 0.115                                   # every leaf's art is brought to this mean linear luminance; the shader divides by it

def render_leaf(shape, col, L=420):
    """One leaf, tip up: colour, cut-out, normal, turn order. L = leaf length in pixels."""
    xs = [p[0] for p in shape['outline']]; hw = max(abs(min(xs)), abs(max(xs))) + 0.04; pet = shape['pet']
    W, H = int(2 * hw * L) + 8, int((1.06 + pet) * L) + 8; ox, oy = W / 2, 0.04 * L + L + 4
    P = lambda p: (ox + p[0] * L, oy + p[1] * L)
    im = Image.new('L', (W, H), 0); d = ImageDraw.Draw(im); d.polygon([P(p) for p in shape['outline']], fill=255)
    stalk = Image.new('L', (W, H), 0); ds = ImageDraw.Draw(stalk); sway = rs.uniform(-0.05, 0.05)
    ds.line([P(p) for p in qline((0, -0.03), (sway, pet), 0.12 * (1 if sway > 0 else -1), 8)], fill=255, width=max(2, int(0.022 * L)))
    blade = np.asarray(im, np.float32) / 255; stalk = np.asarray(stalk, np.float32) / 255; a = np.maximum(blade, stalk)
    vm = Image.new('L', (W, H), 0); dv = ImageDraw.Draw(vm); vn = Image.new('L', (W, H), 0); dn = ImageDraw.Draw(vn)
    for pts, w in shape['veins']: (dv if w >= 0.02 else dn).line([P(p) for p in pts], fill=255, width=max(1, int(round(w * L))))
    vmain = np.maximum(np.asarray(vm, np.float32) / 255, stalk); vmin = np.asarray(vn, np.float32) / 255; veins = np.maximum(vmain, vmin * 0.8) * a
    dist = ndi.distance_transform_edt(blade > 0.5) / L
    near = np.clip(ndi.gaussian_filter(vmain, 0.03 * L) * 5.5 + ndi.gaussian_filter(vmin, 0.014 * L) * 2.2, 0, 1)
    blotch = noise((H, W), 0.2 * L)
    order = np.clip(0.12 + 0.72 * near - 0.3 * np.exp(-dist / 0.035) + 0.2 * blotch + 0.5 * stalk, 0, 1)
    h = 0.55 * np.sqrt(np.clip(dist / 0.22, 0, 1)) - 0.5 * ndi.gaussian_filter(veins, 0.006 * L) + 0.05 * noise((H, W), 0.03 * L) + 0.1 * noise((H, W), 0.3 * L)
    h = ndi.gaussian_filter(h, 0.004 * L); gy, gx = np.gradient(h); k = 0.05 * L
    n = np.dstack([-gx * k, gy * k, np.ones_like(h)]); n /= np.linalg.norm(n, axis=2, keepdims=True)     # +y = up the image
    base = lin(np.array(col, np.float32) / 255)
    shade = (0.86 + 0.16 * np.clip(dist / 0.12, 0, 1)) * (1 + 0.1 * noise((H, W), 0.08 * L) + 0.07 * blotch)
    c = base[None, None, :] * shade[..., None]
    pale = lin(np.array([176, 196, 110], np.float32) / 255); c = c * (1 - 0.5 * veins[..., None]) + pale[None, None, :] * 0.5 * veins[..., None]
    lum = (c @ np.array([0.3, 0.59, 0.11], np.float32)); c *= LUM_REF / (lum[blade > 0.5].mean() + 1e-6)
    return dict(rgb=np.clip(srgb(c), 0, 1).astype(np.float32), a=a, n=n.astype(np.float32), order=order.astype(np.float32), base=(ox, oy + pet * L), tip=(ox, oy - L), L=L)

def xform(leaf, length, ang, flip):
    """Scale a leaf to `length` px, turn it by `ang` (radians, counter-clockwise from tip-up). Returns layers and where its stalk end lands."""
    k = length / leaf['L']; H, W = leaf['a'].shape; w2, h2 = max(2, int(W * k)), max(2, int(H * k)); deg = math.degrees(ang)
    def ch(arr, cval=0.0):
        if flip: arr = arr[:, ::-1]
        im = Image.fromarray(arr).resize((w2, h2), Image.LANCZOS).rotate(deg, resample=Image.BICUBIC, expand=True, fillcolor=float(cval)); return np.asarray(im, np.float32)
    a = np.clip(ch(leaf['a']), 0, 1); rgb = np.dstack([ch(leaf['rgb'][..., i]) for i in range(3)]); order = ch(leaf['order'])
    nx, ny, nz = leaf['n'][..., 0] * (-1 if flip else 1), leaf['n'][..., 1], leaf['n'][..., 2]
    if flip: nx, ny, nz = nx[:, ::-1], ny[:, ::-1], nz[:, ::-1]
    r = lambda arr, cv: np.asarray(Image.fromarray(np.ascontiguousarray(arr)).resize((w2, h2), Image.LANCZOS).rotate(deg, resample=Image.BICUBIC, expand=True, fillcolor=float(cv)), np.float32)
    nx, ny, nz = r(nx, 0), r(ny, 0), r(nz, 1); c, s = math.cos(ang), math.sin(ang)
    n = np.dstack([nx * c - ny * s, nx * s + ny * c, nz])                                              # image x right, y up
    bx, by = leaf['base']; bx = (W - bx if flip else bx) * k - w2 / 2; by = by * k - h2 / 2             # stalk end, relative to the centre
    H2, W2 = a.shape; px = W2 / 2 + bx * c + by * s; py = H2 / 2 - bx * s + by * c
    return dict(a=a, rgb=rgb, order=order, n=n), (px, py)

class Canvas:
    def __init__(s, S): s.S = S; s.rgb = np.zeros((S, S, 3), np.float32); s.a = np.zeros((S, S), np.float32); s.n = np.zeros((S, S, 3), np.float32); s.n[..., 2] = 1; s.id = np.zeros((S, S), np.float32); s.order = np.zeros((S, S), np.float32); s.wood = np.zeros((S, S), np.float32)
    def over(s, lay, x0, y0, lid, shade=1.0):
        h, w = lay['a'].shape; x0, y0 = int(round(x0)), int(round(y0)); xa, ya, xb, yb = max(0, x0), max(0, y0), min(s.S, x0 + w), min(s.S, y0 + h)
        if xa >= xb or ya >= yb: return
        sl = (slice(ya, yb), slice(xa, xb)); ls = (slice(ya - y0, yb - y0), slice(xa - x0, xb - x0)); a = lay['a'][ls]; A = a[..., None]
        s.rgb[sl] = s.rgb[sl] * (1 - A) + lay['rgb'][ls] * shade * A; s.n[sl] = s.n[sl] * (1 - A) + lay['n'][ls] * A
        s.order[sl] = s.order[sl] * (1 - a) + lay['order'][ls] * a; s.wood[sl] *= (1 - a); s.id[sl] = np.where(a > 0.5, lid, s.id[sl]); s.a[sl] = np.maximum(s.a[sl], a)
    def stem(s, pts, w0, w1, col=(74, 58, 42)):
        m = Image.new('L', (s.S, s.S), 0); d = ImageDraw.Draw(m); n = len(pts)
        for i in range(n - 1): d.line([pts[i], pts[i + 1]], fill=255, width=max(2, int(round(w0 + (w1 - w0) * i / max(1, n - 2)))))
        for i, p in enumerate(pts): r = max(1, (w0 + (w1 - w0) * i / max(1, n - 1)) / 2); d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=255)
        a = ndi.gaussian_filter(np.asarray(m, np.float32) / 255, 0.7); A = a[..., None]; c = np.array(col, np.float32) / 255
        tex = 1 + 0.18 * noise((s.S, s.S), 6)
        s.rgb = s.rgb * (1 - A) + c[None, None, :] * tex[..., None] * A; s.wood = np.maximum(s.wood * (1 - a), a); s.order = s.order * (1 - a) + a; s.a = np.maximum(s.a, a)

def twig_card(leaf, rel, P, S=1024):
    """A leafy branchlet: stalk at the bottom centre, fanning upward."""
    cv = Canvas(S); U = rs.uniform; Lpx = rel * S; placed = []
    def shoot(p0, ang, length, w0, depth):
        n = max(3, int(length / (0.05 * S))); pts = [p0]; a = ang
        for i in range(n): a += U(-0.07, 0.07) + (0.03 * math.copysign(1, math.sin(a)) if P.get('slender') else 0); pts.append((pts[-1][0] + math.sin(a) * length / n, pts[-1][1] - math.cos(a) * length / n))
        cv.stem(pts, w0, max(2.0, w0 * 0.35)); return pts, a
    def leaves_on(pts, per, side0):
        n = len(pts) - 1; side = side0
        for j in range(per):
            t = (j + 0.6) / per * 0.95; i = min(n - 1, int(t * n)); f = t * n - i; p = (pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f)
            dirn = math.atan2(pts[i + 1][0] - pts[i][0], -(pts[i + 1][1] - pts[i][1]))
            for sd in ((-1, 1) if P['opp'] else (side,)):
                k = P.get('whorl', 1)
                for q in range(k):
                    spread = (q - (k - 1) / 2) * 0.5 if k > 1 else 0
                    placed.append((p, dirn + sd * math.radians(P['ang'] + U(-12, 14)) + spread, Lpx * U(0.78, 1.08) * (1 - 0.18 * t)))
            side = -side
        placed.append((pts[-1], math.atan2(pts[-1][0] - pts[-2][0], -(pts[-1][1] - pts[-2][1])) + U(-0.25, 0.25), Lpx * U(0.85, 1.0)))
    # an open fan: a leader with side shoots (and, for small leaves, shoots off those), leaves spaced so each keeps its outline
    deep = 2 if rel < 0.16 else 1
    def grow(p0, ang, length, w0, depth, side):
        pts, _ = shoot(p0, ang, length, w0, depth)
        if depth >= deep or length > Lpx * 2.2: leaves_on(pts, max(1, int(length / (Lpx * P.get('gap', 0.62)) * (0.55 if depth < deep else 1))), side)
        if depth < deep:
            nS = P['n'] if depth == 0 else max(2, P['n'] // 2)
            for k in range(nS):
                t = 0.12 + 0.7 * k / max(1, nS - 1); i = int(t * (len(pts) - 1)); sd = (1 if k % 2 == 0 else -1) * (side if depth else 1)
                grow(pts[i], ang + sd * math.radians(U(42, 72)) * (1 - 0.2 * t), length * U(0.5, 0.72) * (1 - 0.3 * t), max(2.0, w0 * 0.6), depth + 1, sd)
    grow((S * 0.5, S * 0.985), U(-0.06, 0.06), S * (0.84 - 0.9 * rel), S * 0.012, 0, 1)
    keep = []                                  # thin where leaves would pile up
    for (p, ang, ln) in placed:
        c = (p[0] + math.sin(ang) * ln * 0.5, p[1] - math.cos(ang) * ln * 0.5)
        if 0.58 * ln < c[0] < S - 0.58 * ln and 0.58 * ln < c[1] and all(math.hypot(c[0] - q[0], c[1] - q[1]) > Lpx * P.get('sep', 0.5) for q in keep): keep.append(c + (p, ang, ln))
    placed = [(k[2], k[3], k[4]) for k in keep]
    order = sorted(range(len(placed)), key=lambda i: rs.rand())
    for z, i in enumerate(order):
        p, ang, ln = placed[i]; lay, (px, py) = xform(leaf, ln, -ang + U(-0.12, 0.12), rs.rand() < 0.5)
        cv.over(lay, p[0] - px, p[1] - py, (1 + (z * 37) % 255) / 255.0, shade=U(0.74, 1.1))
    return cv
def down(arr, S):
    if arr.ndim == 2: return np.asarray(Image.fromarray(arr.astype(np.float32)).resize((S, S), Image.LANCZOS), np.float32)
    return np.dstack([down(arr[..., i], S) for i in range(arr.shape[2])])
def bleed(rgb, a, it=20):
    rgb = rgb.copy(); known = a > 0.35
    for _ in range(it):
        if known.all(): break
        k = ndi.uniform_filter(known.astype(np.float32), 3); s = np.dstack([ndi.uniform_filter(rgb[..., i] * known, 3) for i in range(3)])
        new = (~known) & (k > 0); rgb[new] = s[new] / k[new, None]; known = known | new
    return rgb

W, H = 2048, 1280
col = np.zeros((H, W, 3), np.float32); alpha = np.zeros((H, W), np.float32); nrm = np.zeros((H, W, 3), np.float32); nrm[..., 2] = 1; aux = np.zeros((H, W, 3), np.float32)
for i, (name, shape, c, rel, P) in enumerate(SPECIES):
    leaf = render_leaf(shape, c); cv = twig_card(leaf, rel, P)
    x0, y0 = (i % 4) * 512, (i // 4) * 512; sl = (slice(y0, y0 + 512), slice(x0, x0 + 512)); a = np.clip(down(cv.a, 512), 0, 1)
    col[sl] = bleed(np.clip(down(cv.rgb, 512) / np.maximum(down(cv.a, 512), 1e-3)[..., None] * (a[..., None] > 0.02), 0, 1), a); alpha[sl] = a
    n = down(cv.n, 512); nrm[sl] = n / np.linalg.norm(n, axis=2, keepdims=True)
    idm = np.asarray(Image.fromarray(cv.id).resize((512, 512), Image.NEAREST), np.float32)
    aux[sl] = np.dstack([idm, np.clip(down(cv.order, 512), 0, 1), np.clip(down(cv.wood, 512), 0, 1)])
    # the single leaf, tip up, centred in its 256 cell
    lay, _ = xform(leaf, 226 / (1.06 + shape['pet']), 0.0, False); h, w = lay['a'].shape
    if w > 250: lay, _ = xform(leaf, 226 / (1.06 + shape['pet']) * 250 / w, 0.0, False); h, w = lay['a'].shape
    sx, sy = i * 256 + (256 - w) // 2, 1024 + (256 - h) // 2; s2 = (slice(sy, sy + h), slice(sx, sx + w)); cell = (slice(1024, 1280), slice(i * 256, i * 256 + 256))
    alpha[s2] = lay['a']; tmp = np.zeros((256, 256, 3), np.float32); tmp[(256 - h) // 2:(256 - h) // 2 + h, (256 - w) // 2:(256 - w) // 2 + w] = lay['rgb']; col[cell] = bleed(tmp, alpha[cell])
    nrm[s2] = lay['n'] / np.linalg.norm(lay['n'], axis=2, keepdims=True); aux[s2] = np.dstack([np.full((h, w), 0.5, np.float32), lay['order'], np.zeros((h, w), np.float32)])
    print(f'{name:12s} twig cover {a.mean():.2f}', flush=True)
out = os.path.join(ROOT, 'assets', 'tex'); u8 = lambda x: (np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8)
Image.fromarray(np.dstack([u8(col), u8(alpha)]), 'RGBA').save(os.path.join(out, 'trees_atlas.webp'), quality=92, method=6, exact=True)
Image.fromarray(u8(nrm * 0.5 + 0.5), 'RGB').save(os.path.join(out, 'trees_atlas_n.webp'), quality=88, method=6)
Image.fromarray(u8(aux), 'RGB').save(os.path.join(out, 'trees_atlas_m.webp'), lossless=True, method=6)
for f in ('trees_atlas', 'trees_atlas_n', 'trees_atlas_m'): print(f, os.path.getsize(os.path.join(out, f + '.webp')) // 1024, 'KB')
if '--preview' in sys.argv:
    bg = np.array([0.16, 0.17, 0.2], np.float32); pv = col * alpha[..., None] + bg * (1 - alpha[..., None])
    Image.fromarray(u8(np.vstack([pv, aux]))).save('/home/claude/leafcards_preview.png')
