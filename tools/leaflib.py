# Shared helpers for building the garden's foliage textures from ambientCG CC0 leaf scans.
import numpy as np, glob, os
from PIL import Image
from scipy import ndimage as ndi
SRC = os.environ.get('ASSET_SRC', '/home/claude/assets_src')
_cache = {}
def load_set(name):
    if name in _cache: return _cache[name]
    d = f'{SRC}/acg/{name}'
    f = lambda k: glob.glob(f'{d}/*_{k}.jpg')[0]
    col = np.asarray(Image.open(f('Color')).convert('RGB'), np.float32) / 255
    op = np.asarray(Image.open(f('Opacity')).convert('L'), np.float32) / 255
    nor = np.asarray(Image.open(f('NormalGL')).convert('RGB'), np.float32) / 255
    lab, n = ndi.label(ndi.binary_closing(op > 0.5, iterations=3))
    boxes = []
    for i, sl in enumerate(ndi.find_objects(lab)):
        area = (lab[sl] == i + 1).sum()
        if area > 0.002 * op.size: boxes.append((sl, i + 1, area))
    boxes.sort(key=lambda b: (round(b[0][0].start / (op.shape[0] / 4)), b[0][1].start))
    _cache[name] = (col, op, nor, lab, boxes); return _cache[name]
def rot(img, deg, order=1):
    return ndi.rotate(img, deg, reshape=True, order=order, mode='constant', cval=0)
def extract(name, idx, extra_rot=None, pad=6):
    """Return (rgb, alpha, normal) of one scanned leaf, rotated so its stalk is at the bottom centre and its tip points up."""
    col, op, nor, lab, boxes = load_set(name)
    sl, li, area = boxes[idx]
    sl = (slice(max(0, sl[0].start - pad), sl[0].stop + pad), slice(max(0, sl[1].start - pad), sl[1].stop + pad))
    m = (lab[sl] == li); m = ndi.binary_dilation(m, iterations=2)
    a = op[sl] * m; c = col[sl]; n = nor[sl]
    ys, xs = np.nonzero(a > 0.5); cy, cx = ys.mean(), xs.mean()
    if extra_rot is None:
        # stalk = what disappears when the blade is eroded; point it down
        r = max(2, int(np.sqrt(area) / 14))
        core = ndi.binary_dilation(ndi.binary_erosion(a > 0.5, iterations=r), iterations=r + 2)
        st = (a > 0.5) & ~core
        cov = np.cov(np.vstack([xs - cx, ys - cy])); w, v = np.linalg.eigh(cov); ax = v[:, 1]   # long axis (x, y-down)
        if st.sum() > 0.004 * area:
            sy, sx = np.nonzero(st); d = np.array([sx.mean() - cx, sy.mean() - cy])
            if w[1] / max(w[0], 1e-6) > 2.2: d = ax * np.sign(ax @ d)       # elongated: snap to the long axis
        else:
            t = (xs - cx) * ax[0] + (ys - cy) * ax[1]; lo, hi = t.min(), t.max()
            d = ax if (t > hi - 0.14 * (hi - lo)).sum() < (t < lo + 0.14 * (hi - lo)).sum() else -ax   # thinner end = stalk
        ang = np.degrees(np.arctan2(d[0], d[1]))    # rotate CCW by -ang so d → straight down
        deg = -ang
    else: deg = extra_rot
    a2 = np.clip(rot(a, deg), 0, 1); c2 = np.clip(rot(c, deg), 0, 1)
    nv = n * 2 - 1; th = np.radians(deg); nx = nv[..., 0] * np.cos(th) - nv[..., 1] * np.sin(th); ny = nv[..., 0] * np.sin(th) + nv[..., 1] * np.cos(th)
    n2 = np.dstack([rot(nx, deg), rot(ny, deg), rot(nv[..., 2], deg)])
    ys, xs = np.nonzero(a2 > 0.3); y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    return c2[y0:y1, x0:x1], a2[y0:y1, x0:x1], n2[y0:y1, x0:x1]
def bleed(rgb, a, it=24):
    """Flood leaf colour outward under the cut-out so mip-maps don't pick up black fringes."""
    rgb = rgb.copy(); known = a > 0.4
    for _ in range(it):
        if known.all(): break
        k = ndi.uniform_filter(known.astype(np.float32), 3); s = np.dstack([ndi.uniform_filter(rgb[..., i] * known, 3) for i in range(3)])
        new = (~known) & (k > 0); rgb[new] = s[new] / k[new, None]; known = known | new
    return rgb
def resize(arr, w, h):
    if arr.ndim == 2: return np.asarray(Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8)).resize((w, h), Image.LANCZOS), np.float32) / 255
    return np.dstack([resize(arr[..., i] * 0.5 + 0.5 if arr.min() < -0.01 else arr[..., i], w, h) for i in range(arr.shape[2])])
