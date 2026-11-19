#!/usr/bin/env python3
"""Builds assets/ from CC0 scans: ambientCG leaf atlases and PolyHaven PBR textures + models.
Sources are downloaded separately (see tools/README in the repo's README); run:  ASSET_SRC=... python3 tools/build_assets.py"""
import sys, os, json, shutil
sys.path.insert(0, os.path.dirname(__file__))
from leaflib import *
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets'); os.makedirs(OUT + '/tex', exist_ok=True); os.makedirs(OUT + '/models', exist_ok=True)
rs = np.random.RandomState(7)

def leaf(name, idx, flip=False, grey=True, gain=1.0):
    c, a, n = extract(name, idx)
    if flip: c, a, n = c[::-1, ::-1], a[::-1, ::-1], n[::-1, ::-1] * np.array([-1, -1, 1], np.float32)
    if grey:   # normalise to a bright, nearly neutral leaf that the garden tints per species; keep vein and blemish colour
        lum = c @ np.array([0.3, 0.59, 0.11], np.float32) + 1e-4; m = a > 0.6
        ln = np.clip(lum / np.percentile(lum[m], 88) * 0.9, 0, 1.12)
        ch = (c / lum[..., None]) ** 0.3; ch /= ch[m].mean(0)
        c = np.clip(ln[..., None] * ch * gain, 0, 1)
    # centre the stalk at the bottom
    h, w = a.shape; rows = a[int(h * 0.97):] > 0.4; xs = np.nonzero(rows.any(0))[0]; bx = xs.mean() if len(xs) else w / 2
    padl = int(max(0, (w - bx) - bx)); padr = int(max(0, bx - (w - bx)))
    c = np.pad(c, ((0, 0), (padl, padr), (0, 0))); a = np.pad(a, ((0, 0), (padl, padr))); n = np.pad(n, ((0, 0), (padl, padr), (0, 0)))
    n[..., 2][a < 0.05] = 1
    return c, a, n

class Canvas:
    def __init__(s, w, h): s.w, s.h = w, h; s.c = np.zeros((h, w, 3), np.float32); s.a = np.zeros((h, w), np.float32); s.n = np.zeros((h, w, 3), np.float32); s.n[..., 2] = 1
    def over(s, c, a, n, x0, y0):
        h, w = a.shape; X0, Y0 = max(0, x0), max(0, y0); X1, Y1 = min(s.w, x0 + w), min(s.h, y0 + h)
        if X1 <= X0 or Y1 <= Y0: return
        sl = (slice(Y0 - y0, Y1 - y0), slice(X0 - x0, X1 - x0)); dl = (slice(Y0, Y1), slice(X0, X1)); aa = a[sl][..., None]
        s.c[dl] = s.c[dl] * (1 - aa) + c[sl] * aa; s.n[dl] = s.n[dl] * (1 - aa) + n[sl] * aa; s.a[dl] = np.maximum(s.a[dl], a[sl])
    def place(s, L, bx, by, ang, length, wscale=1.0, shade=1.0):
        """Paste a leaf with its stalk base at (bx, by), pointing `ang` degrees clockwise from straight up."""
        c, a, n = L; h, w = a.shape; k = length / h; w2, h2 = max(2, int(w * k * wscale)), max(2, int(h * k))
        c, a, n = resize(c, w2, h2) * shade, resize(a, w2, h2), resize(n, w2, h2) * 2 - 1
        S = int(2 * np.hypot(h2, w2 / 2)) + 4; C = np.zeros((S, S, 3), np.float32); A = np.zeros((S, S), np.float32); N = np.zeros((S, S, 3), np.float32); N[..., 2] = 1
        y0, x0 = S // 2 - h2, S // 2 - w2 // 2; C[y0:y0 + h2, x0:x0 + w2] = c; A[y0:y0 + h2, x0:x0 + w2] = a; N[y0:y0 + h2, x0:x0 + w2] = n
        deg = -ang; r = lambda im: ndi.rotate(im, deg, reshape=False, order=1, mode='constant', cval=0)
        th = np.radians(deg); nx = N[..., 0] * np.cos(th) - N[..., 1] * np.sin(th); ny = N[..., 0] * np.sin(th) + N[..., 1] * np.cos(th)
        A2 = np.clip(r(A), 0, 1); N2 = np.dstack([r(nx), r(ny), r(N[..., 2])]); N2[..., 2][A2 < 0.05] = 1
        s.over(np.clip(r(C), 0, 1), A2, N2, int(bx) - S // 2, int(by) - S // 2)
    def stem(s, pts, wd, col):
        im = Image.new('L', (s.w, s.h), 0); from PIL import ImageDraw
        ImageDraw.Draw(im).line([tuple(p) for p in pts], fill=255, width=int(max(1, wd)), joint='curve'); m = np.asarray(im, np.float32) / 255
        m = ndi.gaussian_filter(m, 0.6); n = np.zeros((s.h, s.w, 3), np.float32); n[..., 2] = 1
        s.over(np.broadcast_to(np.array(col, np.float32), (s.h, s.w, 3)), m, n, 0, 0)
    def fit(s, L, margin=0.02):
        c, a, n = L; w2, h2 = int(s.w * (1 - 2 * margin)), int(s.h * (1 - margin)); s.over(resize(c, w2, h2), resize(a, w2, h2), resize(n, w2, h2) * 2 - 1, (s.w - w2) // 2, s.h - h2)
    def out(s, size=None):
        c, a, n = bleed(s.c, s.a), s.a, s.n
        if size: c, a, n = resize(c, *size), resize(a, *size), resize(n, *size) * 2 - 1
        n = n / np.maximum(np.linalg.norm(n, axis=2, keepdims=True), 1e-4)
        return c, a, n
def save(name, c, a, n, q=90):
    Image.fromarray((np.dstack([np.clip(c, 0, 1), np.clip(a, 0, 1)[..., None]]) * 255).astype(np.uint8), 'RGBA').save(f'{OUT}/tex/{name}.webp', quality=q, method=6, exact=True)
    Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8), 'RGB').save(f'{OUT}/tex/{name}_n.webp', quality=q, method=6)
    print(name, c.shape, round(os.path.getsize(f'{OUT}/tex/{name}.webp') / 1e3), 'KB +', round(os.path.getsize(f'{OUT}/tex/{name}_n.webp') / 1e3), 'KB')

# ------------------------------------------------------------------ the tintable leaf atlas (same keys as PlantArt.LEAF)
STEM = (0.62, 0.66, 0.55)
def single(L, w, h): cv = Canvas(w, h); cv.fit(L); return cv
def radial(leaflet, n, spread, length, w=512, h=512, cy=0.42, petiole=True, wscale=1.0):
    cv = Canvas(w, h); cx, cyp = w / 2, h * cy
    if petiole: cv.stem([(cx, h), (cx, cyp)], 7, STEM)
    order = sorted(range(n), key=lambda i: -abs(i - (n - 1) / 2))
    for i in order: cv.place(leaflet, cx, cyp, (i - (n - 1) / 2) * spread / max(1, n - 1) * 2, length * (1 - 0.18 * abs(i - (n - 1) / 2) / max(1, (n - 1) / 2)), wscale)
    return cv
def pinnate(leaflet, pairs, w, h, length, wscale=1.0, top=True, droop=62):
    cv = Canvas(w, h); cx = w / 2; cv.stem([(cx, h), (cx, h * 0.1)], 6, STEM)
    for i in range(pairs):
        y = h * (0.9 - 0.72 * i / max(1, pairs - 1))
        for sd in (-1, 1): cv.place(leaflet, cx, y, sd * (droop - 6 * i), length * (1 - 0.1 * i), wscale)
    if top: cv.place(leaflet, cx, h * 0.14, 0, length * 0.95, wscale)
    return cv
lance, ovate, serr, broadl, small, narrow, lobed, roundl = leaf('LeafSet020', 2), leaf('LeafSet022', 1), leaf('LeafSet024', 3, flip=True), leaf('LeafSet018', 1), leaf('LeafSet001', 4), leaf('LeafSet013', 1), leaf('LeafSet026', 1), leaf('LeafSet009', 3)
palm, serr2, bladeW, bladeT, twig = leaf('LeafSet025', 3), leaf('LeafSet005', 2, flip=True), leaf('Foliage008', 1, flip=True), leaf('Foliage008', 4, flip=True), leaf('LeafSet002', 1)
def palmate_cell(L, scale=0.86):
    cv = Canvas(512, 512); cv.stem([(256, 512), (256, 230)], 7, STEM); c, a, n = L; s = int(512 * scale); cv.over(resize(c, s, s), resize(a, s, s), resize(n, s, s) * 2 - 1, (512 - s) // 2, int(512 * 0.02)); return cv
def thread_cell():
    cv = Canvas(256, 512); cv.stem([(128, 512), (128, 20)], 5, STEM)
    for i in range(22): cv.place(narrow, 128, 495 - i * 21, (1 if i % 2 else -1) * (38 + rs.rand() * 22), 92 - i * 2.2, 0.42)
    cv.place(narrow, 128, 40, 0, 50, 0.4); return cv
def rose_cell():
    cv = Canvas(512, 512); cv.stem([(256, 512), (256, 215)], 6, STEM)
    for y, ln, ang in [(425, 175, 66), (300, 185, 60)]:
        for sd in (-1, 1): cv.place(serr2, 256, y, sd * ang, ln)
    cv.place(serr2, 256, 220, 0, 205); return cv
def straight(L, w, h):
    # a strap leaf, straightened row by row so it fills a narrow card symmetrically
    c, a, n = L; H = a.shape[0]; cv = Canvas(w, h); prof = np.zeros(H); spans = []
    for y in range(H):
        xs = np.nonzero(a[y] > 0.3)[0]; spans.append((xs.min(), xs.max() + 1) if len(xs) > 1 else None); prof[y] = (xs.max() - xs.min() + 1) if len(xs) > 1 else 0
    prof = ndi.gaussian_filter1d(prof, H / 40); prof /= prof.max()
    for yy in range(h):
        y = min(H - 1, int(yy / h * H)); sp = spans[y]
        if sp is None: continue
        ww = max(2, int(w * 0.96 * max(prof[y], 0.06))); x0 = (w - ww) // 2; src = np.linspace(sp[0], sp[1] - 1, ww).astype(int)
        cv.c[yy, x0:x0 + ww] = c[y, src]; cv.a[yy, x0:x0 + ww] = 1; cv.n[yy, x0:x0 + ww] = n[y, src]
    cv.a = ndi.gaussian_filter(cv.a, 0.7); return cv
def fuzzy_leaf():
    c, a, n = small; return np.clip(c * 0.55 + 0.45, 0, 1), a, n * np.array([0.6, 0.6, 1], np.float32)
CELLS = {
    'lance': single(lance, 128, 512), 'ovate': single(ovate, 256, 512), 'serrate': single(serr, 256, 512), 'broad': single(broadl, 256, 512),
    'fuzzy': single(fuzzy_leaf(), 256, 512), 'fleshy': single(leaf('LeafSet001', 2), 256, 256), 'sprig': single(twig, 256, 512),
    'trifoliate': radial(small, 3, 46, 285, cy=0.6), 'palmate': palmate_cell(palm), 'digitate': radial(narrow, 9, 150, 232, cy=0.48, wscale=0.8), 'round': palmate_cell(roundl, 0.8),
    'thread': thread_cell(), 'fern': single(lobed, 256, 512), 'compound': radial(ovate, 5, 80, 285, cy=0.6, wscale=0.8), 'rose': rose_cell(),
    'sword': straight(bladeW, 96, 768), 'blade': straight(bladeT, 64, 768),
}
KEYS = ['lance', 'ovate', 'serrate', 'broad', 'fuzzy', 'fleshy', 'sprig', 'trifoliate', 'palmate', 'digitate', 'round', 'thread', 'fern', 'compound', 'rose', 'sword', 'blade']
CELL, COLS = 512, 5; ROWS = (len(KEYS) + COLS - 1) // COLS; PAD = 12
atl = Canvas(COLS * CELL, ROWS * CELL); rects = {}
for i, k in enumerate(KEYS):
    c, a, n = CELLS[k].out((CELL - 2 * PAD, CELL - 2 * PAD)); x, y = (i % COLS) * CELL + PAD, (i // COLS) * CELL + PAD
    atl.c[y:y + c.shape[0], x:x + c.shape[1]] = c; atl.a[y:y + c.shape[0], x:x + c.shape[1]] = a; atl.n[y:y + c.shape[0], x:x + c.shape[1]] = n
    W, H = COLS * CELL, ROWS * CELL; rects[k] = [x / W, 1 - (y + CELL - 2 * PAD) / H, (CELL - 2 * PAD) / W, (CELL - 2 * PAD) / H]
save('leaf_atlas', atl.c, atl.a, atl.n, 88)
json.dump({'rects': rects}, open(f'{OUT}/tex/leaf_atlas.json', 'w'))

# ------------------------------------------------------------------ full-colour foliage cards
def colour(name, idx, flip=False, mul=(1, 1, 1), sat=1.0):
    c, a, n = leaf(name, idx, flip, grey=False); lum = (c @ np.array([0.3, 0.59, 0.11], np.float32))[..., None]
    return np.clip((lum + (c - lum) * sat) * np.array(mul, np.float32), 0, 1), a, n
# yew: flat sprays of dark needles fanned from the clipped face of the hedge
cv = Canvas(1024, 1024); sprays = [colour('LeafSet019', i, mul=(0.5, 0.62, 0.42), sat=0.9) for i in range(3)]
sprays = [(np.rot90(c, 3), np.rot90(a, 3), np.rot90(n, 3) @ np.array([[0, 1, 0], [-1, 0, 0], [0, 0, 1]], np.float32)) for c, a, n in sprays]   # lay each spray upright
for k, (ang, ln) in enumerate([(-58, 560), (52, 600), (-26, 760), (24, 800), (0, 940), (-40, 420), (38, 460)]): cv.place(sprays[k % 3], 512, 1016, ang, ln, shade=0.8 + 0.2 * (k % 3) / 2 + (0.18 if k == 4 else 0))
save('card_yew', *cv.out((768, 768)))
# box: short twigs of small glossy opposite leaves
cv = Canvas(1024, 1024); tw = [colour('LeafSet002', i, mul=(0.7, 0.86, 0.6), sat=0.95) for i in (0, 1, 3, 4, 5)]
for k, (ang, ln) in enumerate([(-62, 520), (58, 540), (-34, 700), (30, 720), (-6, 860), (12, 600), (-48, 380)]): cv.place(tw[k % 5], 512, 1016, ang, ln, shade=0.85 + 0.25 * rs.rand())
save('card_box', *cv.out((640, 640)))
# small-leaved lime: a drooping branchlet of heart-shaped leaves
cv = Canvas(1024, 1024); lime = [colour('LeafSet004', i, mul=(0.92, 1.0, 0.8)) for i in (0, 1, 2, 5)]
def twig(bx, by, ang, L, n, leafL):   # a bough is five leafy twigs fanned from one stalk: about half the card is leaf
    a = np.radians(ang); dx, dy = np.sin(a), -np.cos(a)
    pts = [(bx + dx * L * t + 36 * np.sin(t * 3 + ang) * t, by + dy * L * t + 34 * t * t) for t in np.linspace(0, 1, n + 1)]
    cv.stem(pts, 7, (0.3, 0.25, 0.18))
    for i in range(1, n + 1):
        x, y = pts[i]; sd = 1 if i % 2 else -1
        cv.place(lime[(i + int(abs(ang))) % 4], x, y, ang + sd * (56 + rs.rand() * 30) + rs.randn() * 6, leafL * (1 - 0.22 * i / n) + rs.rand() * 26, shade=0.74 + 0.34 * rs.rand())
    cv.place(lime[0], pts[-1][0], pts[-1][1], ang + rs.randn() * 10, leafL * 0.85)
twig(512, 1012, -52, 600, 7, 190); twig(512, 1012, 50, 620, 7, 190); twig(512, 930, -24, 740, 9, 196); twig(512, 910, 26, 760, 9, 196); twig(512, 1012, 0, 960, 12, 205)
save('card_lime', *cv.out((1024, 1024)))
# ground cover: a low rosette of cranesbill and small leaves, seen from above
cv = Canvas(1024, 1024); gp = colour('LeafSet025', 5, mul=(0.85, 0.95, 0.75)); gs = colour('LeafSet001', 1, mul=(0.9, 1.0, 0.8))
for k in range(9):
    ang = k * 40 + rs.rand() * 20; d = 150 + rs.rand() * 120; x, y = 512 + np.sin(np.radians(ang)) * d, 512 - np.cos(np.radians(ang)) * d
    cv.place(gp if k % 3 else gs, x, y + 150, ang * 0.2 + rs.randn() * 20, 300 + rs.rand() * 90, shade=0.75 + 0.3 * rs.rand())
save('card_cover', *cv.out((512, 512)))
# ivy: a trailing stem for the walls
cv = Canvas(1024, 1024); ivy = [colour('LeafSet017', i, mul=(0.62, 0.8, 0.62)) for i in (0, 2, 3, 5)]
pts = [(512 + 170 * np.sin(t * 5.0), 1010 - 960 * t) for t in np.linspace(0, 1, 14)]; cv.stem(pts, 8, (0.28, 0.22, 0.16))
for i in range(1, 14):
    x, y = pts[i]; sd = 1 if i % 2 else -1; cv.place(ivy[i % 4], x, y, sd * (70 + rs.rand() * 40), 250 + rs.rand() * 110, shade=0.8 + 0.3 * rs.rand())
save('card_ivy', *cv.out((768, 768)))

# ------------------------------------------------------------------ PolyHaven PBR sets → webp
for t in ['gravel_floor', 'sparse_grass', 'yellow_flower_mulch', 'cobblestone_square', 'castle_brick_02_red', 'white_plaster_02', 'bark_brown_02']:
    for m in ['diff', 'nor', 'arm']:
        im = Image.open(f'{SRC}/ph/{t}_{m}.jpg').convert('RGB'); im.save(f'{OUT}/tex/{t}_{m}.webp', quality=84 if m != 'nor' else 88, method=6)
Image.open(f'{SRC}/ph/waternormals.jpg').convert('RGB').resize((512, 512), Image.LANCZOS).save(f'{OUT}/tex/waternormals.webp', quality=88, method=6)
# ------------------------------------------------------------------ PolyHaven models (gltf + bin, textures recompressed)
for m in ['street_lamp_01', 'large_iron_gate', 'painted_wooden_bench', 'concrete_cat_statue']:
    d = f'{OUT}/models/{m}'; os.makedirs(d + '/textures', exist_ok=True)
    shutil.copy(f'{SRC}/models/{m}/{m}.gltf', d); shutil.copy(f'{SRC}/models/{m}/{m}.bin', d)
    for f in os.listdir(f'{SRC}/models/{m}/textures'): Image.open(f'{SRC}/models/{m}/textures/{f}').convert('RGB').save(f'{d}/textures/{f}', quality=82, optimize=True)
tot = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(OUT) for f in fs); print('assets total', round(tot / 1e6, 1), 'MB')

# models: fold each .bin into its .gltf and save as .json (see tools/gltf_embed.py)
import glob, gltf_embed
for g in glob.glob(f'{OUT}/models/**/*.gltf', recursive=True): gltf_embed.embed(g)
