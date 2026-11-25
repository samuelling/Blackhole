"""species2.py: the garden's other species, described for plantforms.make_species.

Each entry: size (height, spread in inches, as src/looks.js and src/flora.js have them), habit (clump | mound | grass), leaves (named kinds
for plantforms.Leaf), the habit's own numbers, the stem colour, and head(fl, ctx): paints the flower's parts into the atlas (through fl, a
plantforms.Florets) and returns head(qh) building one flower head along +Z. Numbers, shapes and colours were read from openly licensed
iNaturalist photographs (assets/plants/CREDITS.md); lengths are in metres.
"""
import numpy as np, math
from plantkit import *
from plantforms import *

S = {}
def sp(name, **d): S[name] = d


# ================================================================= head makers (paint the parts, return a builder)
def daisy_head(ray_shape, c0, c1, c2, nray, L, W, disc, disc_cols, bend=0.3, pitch=0.0, rows=1, notch=0, veins=4, cup=0.0, ring=None, twist=0.2):
    def head(fl, ctx):
        ray = fl.petal('ray', ray_shape, c0, c1, c2, w=48, h=128, notch=notch, veins=veins)
        dr = fl.at.region(64, 64); paint_disc(fl.at, dr, disc_cols[0], disc_cols[1], dots=disc_cols[2] if len(disc_cols) > 2 else '#000000', ndots=0.6, ring=ring, seed=3)
        def build(qh):
            d = dict(disc); d['rect'] = dr
            return h_daisy(qh, ray, nray, L, W, disc=d, bend=bend, pitch=pitch, rows=rows, rg=np.random.default_rng(11), cup=cup, twist=twist)
        return build
    return head


def cards_head(L, W, prof, stops, el='dots', size=0.06, density=1.0, cards=3, core=None, upward=0.0, gap=0.0, hair=0.0, bend=0.0, px=(80, 320)):
    """A spike, brush or plume as crossed painted cards, with a core of stem through it if asked."""
    def head(fl, ctx):
        r = fl.at.region(*px); paint_brush(fl.at, r, prof, stops, el=el, size=size, density=density, upward=upward, gap=gap, seed=5, hair=hair)
        cr = fl.ramp('core', core) if core else None
        def build(qh):
            g = h_cards(qh, L, W, r, n=cards, bend=bend)
            if cr is not None: g.put(tube(np.array([[0, 0, 0], [0, 0, L * 0.95]]), np.array([W * 0.1, W * 0.04]), cr, sides=4 if qh >= 1 else 3))
            return g
        return build
    return head


def spike_head(L, R, n, floret, core=None, core_r=0.0012, bud=None, buds=0.2, pitch=0.3, taper=0.6, spiral=True, scale_top=0.6, arc=None, droop=0.0, start=0.0):
    """Florets up a spike. floret(fl) paints and returns f(s, rg, q); bud likewise."""
    def head(fl, ctx):
        f = floret(fl); b = bud(fl) if bud else None; cr = fl.ramp('core', core) if core else None
        return lambda qh: h_spike(qh, L, R, f, n, np.random.default_rng(5), spiral=spiral, taper=taper, buds=buds, bud=b, core=cr, core_r=core_r, pitch=pitch, scale_top=scale_top, arc=arc, droop=droop, start=start)
    return head


def ball_head(R, n, floret, core=None, cap=1.0, flat=1.0, stalks=0.0):
    def head(fl, ctx):
        f = floret(fl); cr = None
        if core: cr = fl.at.region(64, 64); paint_disc(fl.at, cr, core[0], core[1], dots=core[2] if len(core) > 2 else '#000000', ndots=0.8, seed=4)
        return lambda qh: h_ball(qh, R, f, n, np.random.default_rng(6), core=cr, cap=cap, flat=flat, stalks=stalks)
    return head


def umbel_head(R, n, floret, dome=0.3, ped=None, base=None, base_r=0.9):
    """A flat or domed head of small flowers; base: a painted disc of them underneath (cols c_mid, c_rim, dots) so it reads as solid."""
    def head(fl, ctx):
        f = floret(fl); pr = fl.ramp('ped', [(0, ped), (1, ped)], w=8, h=48) if ped else None; br = None
        if base: br = fl.at.region(96, 96); paint_brush(fl.at, br, lambda t: np.clip(np.sin(np.pi * t) ** 0.4, 0, 1), [(0, base[0]), (1, base[1])], el='dots', size=0.07, density=1.0, seed=12)
        def build(qh):
            rg = np.random.default_rng(7); g = h_umbel(qh, R, f, n, rg, dome=dome, pedicel=pr)
            if br is not None: g.put(plate(R * base_r, br, nr=2 if qh >= 1 else 1, ns=10 if qh >= 1 else 6, cup=-dome * 0.6))
            return g
        return build
    return head


# ----------------------------------------------------------------- florets (paint once; return f(s, rg, q) -> Geo along +Z)
def fl_star(n, c_in, c_out, R, shape='star', eye=None, eye_r=0.2, depth=0.55, ns=6, px=48, cup=0.25):
    def make(fl):
        r = fl.flower('star%d' % len(fl.rects), n=n, shape=shape, c_in=c_in, c_out=c_out, eye=eye, eye_r=eye_r, depth=depth, px=px)
        return lambda s, rg, q: plate(R * s, r, nr=1, ns=ns if q >= 1 else 4, cup=cup)
    return make

def fl_lip(c_in, c_out, tube_col, L, R, n=3, bract=None):
    def make(fl):
        face = fl.flower('lip%d' % len(fl.rects), n=n, shape='round', c_in=c_in, c_out=c_out, depth=0.5, px=48); tb = fl.ramp('tube%d' % len(fl.rects), [(0, tube_col), (1, c_in)])
        br = fl.petal('bract%d' % len(fl.rects), 'ovate', bract[0], bract[1], None, w=32, h=48) if bract else None
        def f(s, rg, q):
            g = lipped_floret(tb, face, L * s, R * s, q)
            if br is not None: g.put(ribbon(L * 0.5 * s, R * s, br, nu=2, nv=2, bend=-0.3), rot([1, 0, 0], -1.3))
            return g
        return f
    return make

def fl_bell(c_out, c_in, L, R, flare=1.35, spots=None, sides=6):
    def make(fl):
        r = fl.at.region(48, 96)
        def fn(u, t):
            col = mix(lin(c_out), lin(c_in), np.clip((t - 0.5) * 2, 0, 1) * 0.4)
            if spots: col = mix(col, lin(spots), ((noise2(u, t, 22, 9) > 0.7) & (t > 0.45)) * 0.85)
            return col * (1 + 0.1 * (noise2(u, t, 20, 4) - 0.5))[..., None], np.ones_like(u), 0.3 + 0.2 * np.sin(u * TAU * 5)
        fl.at.fill(r, fn)
        return lambda s, rg, q: bell_floret(r, L * s, R * s, q, flare=flare, sides=sides)
    return make

def fl_pea(c_std, c_keel, L, eye=None):
    def make(fl):
        st = fl.petal('std%d' % len(fl.rects), 'obovate', c_std, c_std, None, w=48, h=48, blotch=(eye, 0.35) if eye else None, veins=5)
        kl = fl.petal('keel%d' % len(fl.rects), 'elliptic', c_keel, c_keel, None, w=32, h=48)
        return lambda s, rg, q: pea_floret(st, kl, L * s, q)
    return make

def fl_tube(col0, col1, L, R0, R1):
    def make(fl):
        r = fl.ramp('tb%d' % len(fl.rects), [(0, col0), (1, col1)])
        return lambda s, rg, q: tube_floret(r, L * s, R0 * s, R1 * s, q)
    return make

def fl_bud(c0, c1, L, W):
    def make(fl):
        r = fl.petal('bud%d' % len(fl.rects), 'elliptic', c0, c1, None, w=32, h=48)
        return lambda s, rg, q: ribbon(L * s, W * s, r, nu=2, nv=3 if q >= 1 else 2, bend=0.0, fold=0.9)
    return make


# ================================================================= the species
G = [(0, '#3e5a2c'), (1, '#4e6a36')]   # an ordinary green stem

sp('rudbeckia', doc="Black-eyed Susan 'Goldsturm': a dense clump of dark rough ovate leaves; branched stiff stems topped by daisies 6-8 cm, 12-14 golden-orange notched rays round a domed near-black cone.",
   size=(30, 24), habit='clump', stem_col=[(0, '#3a4a26'), (1, '#4c5e30')],
   leaves=dict(basal=dict(kind='simple', shape='ovate', aspect=0.5, col='#2e4a20', tip='#38562a', mid='#4a6634', veins=('pinnate', 6, 0.8), hair=0.2, teeth=(9, 0.05)),
               stem=dict(kind='simple', shape='lance', aspect=0.35, col='#30502a', tip='#3a5a2c', mid='#4c6a38', veins=('pinnate', 5, 0.8), hair=0.2)),
   basal=dict(n=(22, 28), L=(0.14, 0.2), pitch=(0.3, 0.8), stalk=0.4, r0=(0.01, 0.1), lo=0.4),
   stems=dict(n=(14, 18), h=(0.8, 1.0), lean=(0.05, 0.4), r=(0.0032, 0.002), r0=(0.01, 0.1),
              leaves=dict(n=(5, 7), L=(0.07, 0.1), f=(0.1, 0.7), pitch=(0.3, 0.8)),
              heads=dict(at='tip+side', n=(1, 3), f=(0.6, 0.85), len=(0.08, 0.16), s=(0.85, 1.0), up=0.6)),
   head=daisy_head('ray', '#d07c08', '#f0a812', '#f4b41a', 13, 0.032, 0.011, dict(kind='dome', r=0.0075, h=0.008), ('#1e140c', '#2e1e12', '#120a06'), bend=0.5, pitch=0.05, notch=3))

sp('leucanthemum', doc="Shasta daisy: dark glossy toothed lance leaves in a clump; sturdy stems, one big daisy each, 8-10 cm, some 24 pure white rays round a flat golden disc.",
   size=(42, 30), habit='clump', stem_col=G,
   leaves=dict(basal=dict(kind='simple', shape='spoon', aspect=0.3, col='#264a22', tip='#2e5428', mid='#3a6030', veins=('pinnate', 6, 0.8), teeth=(12, 0.08)),
               stem=dict(kind='simple', shape='lance', aspect=0.2, col='#2a4e24', tip='#30562a', teeth=(10, 0.1))),
   basal=dict(n=(18, 24), L=(0.15, 0.22), pitch=(0.4, 0.95), r0=(0.01, 0.08), lo=0.4),
   stems=dict(n=(10, 14), h=(0.8, 1.0), lean=(0.05, 0.3), r=(0.003, 0.0022), r0=(0.01, 0.09), leaves=dict(n=(5, 7), L=(0.06, 0.09), f=(0.1, 0.65), pitch=(0.5, 0.9)),
              heads=dict(at='tip', up=0.75)),
   head=daisy_head('ray', '#f4f2ea', '#fbfaf4', '#fdfcf8', 24, 0.042, 0.0085, dict(kind='flat', r=0.011, h=0.006), ('#d8a81a', '#ecc21e', '#b88a10'), bend=0.15, pitch=0.04, notch=3, veins=5))

sp('heliopsis', doc="False sunflower: opposite, toothed, dark ovate leaves on branching stems; golden daisies 6-7 cm, 10-14 rays round a domed orange disc.",
   size=(30, 21), habit='clump', stem_col=[(0, '#3a4e2a'), (1, '#4a5e34')],
   leaves=dict(stem=dict(kind='simple', shape='ovate', aspect=0.45, col='#2e4e24', tip='#38582c', teeth=(16, 0.06), hair=0.15)),
   stems=dict(n=(10, 14), h=(0.8, 1.0), lean=(0.05, 0.35), r=(0.003, 0.002), r0=(0.01, 0.07), leaves=dict(n=(5, 7), arr='opp', L=(0.07, 0.1), f=(0.06, 0.75), pitch=(0.3, 0.7)),
              heads=dict(at='tip+side', n=(1, 3), f=(0.6, 0.85), len=(0.1, 0.18), up=0.6)),
   head=daisy_head('ray', '#e09a10', '#f2b31a', '#f6c02a', 12, 0.03, 0.012, dict(kind='dome', r=0.009, h=0.007), ('#a8600c', '#c87a10', '#8a4a08'), bend=0.25, notch=2))

sp('gaillardia', doc="Blanket flower: a low spreading clump of soft grey-green lance leaves; daisies 5-6 cm on wiry stems, the rays red with broad yellow three-toothed tips round a domed red-brown disc.",
   size=(9, 15), habit='clump', stem_col=[(0, '#5a6a44'), (1, '#6a7a4a')],
   leaves=dict(basal=dict(kind='simple', shape='spoon', aspect=0.28, col='#5e7448', tip='#6a7e50', hair=0.35, teeth=(6, 0.08))),
   basal=dict(n=(22, 30), L=(0.08, 0.12), pitch=(0.15, 0.55), r0=(0.01, 0.1), lo=0.4),
   stems=dict(n=(10, 14), len=(0.16, 0.24), lean=(0.2, 0.7), droop=(0.1, 0.4), r=(0.0018, 0.0012), r0=(0.01, 0.1), seg=5, heads=dict(at='tip', up=0.6)),
   head=daisy_head('fan', '#7a1a10', '#c8321e', '#f2c22a', 13, 0.026, 0.013, dict(kind='dome', r=0.008, h=0.007), ('#5a1a0c', '#7a2a12', '#3a0c06'), bend=0.2, notch=3, veins=6))

sp('helenium', doc="Sneezeweed: leafy winged stems branching at the top into many daisies 4-5 cm; fan-shaped three-lobed rays, burnt orange, swept back from a round brown button.",
   size=(48, 30), habit='clump', stem_col=[(0, '#4a5a30'), (1, '#5a6a3a')],
   leaves=dict(stem=dict(kind='simple', shape='lance', aspect=0.22, col='#3a5a2c', tip='#46662e', teeth=(8, 0.04))),
   stems=dict(n=(10, 14), h=(0.8, 1.0), lean=(0.05, 0.3), r=(0.0034, 0.002), r0=(0.01, 0.08), leaves=dict(n=(8, 11), L=(0.06, 0.1), f=(0.05, 0.75), pitch=(0.4, 0.8)),
              heads=dict(at='branches', n=(4, 6), f=(0.72, 0.98), len=(0.05, 0.12), s=(0.85, 1.0), up=0.5)),
   head=daisy_head('fan', '#b85a14', '#e08a24', '#e89a30', 13, 0.02, 0.012, dict(kind='ball', r=0.0075, h=0.009), ('#3a2410', '#5a3a1a', '#2a1808'), bend=0.9, pitch=-0.25, notch=3, veins=5))

sp('aster', doc="New England aster: tall leafy stems, lance leaves clasping, branching at the top into sprays of daisies 3-4 cm, 40 or so narrow violet-purple rays round a yellow disc.",
   size=(48, 30), habit='clump', stem_col=[(0, '#4a4430'), (1, '#5a5038')],
   leaves=dict(stem=dict(kind='simple', shape='lance', aspect=0.18, col='#3e5e32', tip='#4a6a3a', hair=0.2)),
   stems=dict(n=(12, 16), h=(0.8, 1.0), lean=(0.05, 0.35), r=(0.0032, 0.0018), r0=(0.01, 0.08), leaves=dict(n=(12, 16), L=(0.05, 0.08), f=(0.05, 0.85), pitch=(0.3, 0.8)),
              heads=dict(at='branches', n=(5, 7), f=(0.6, 0.98), len=(0.04, 0.12), s=(0.85, 1.0), up=0.55)),
   head=daisy_head('linear', '#6a30b8', '#8d55d0', '#9a60d8', 20, 0.017, 0.0026, dict(kind='dome', r=0.0045, h=0.003), ('#d8a020', '#e3b422', '#b08010'), bend=0.2, veins=0))

sp('knautia', doc="Macedonian scabious: a rosette of lobed leaves; branching wiry stems; pincushion heads 2-3 cm, crimson, a dome of tubular florets with pale anthers, the outer ones a little larger.",
   size=(26, 18), habit='clump', stem_col=[(0, '#5a6a44'), (1, '#6a7a52')],
   leaves=dict(basal=dict(kind='simple', shape='lance', aspect=0.3, col='#4e6a40', tip='#5a7648', teeth=(7, 0.22), hair=0.2),
               stem=dict(kind='simple', shape='lance', aspect=0.2, col='#506c42', tip='#5a7648', teeth=(5, 0.2))),
   basal=dict(n=(14, 20), L=(0.12, 0.18), pitch=(0.25, 0.7), r0=(0.01, 0.05), lo=0.4),
   stems=dict(n=(10, 14), h=(0.75, 1.0), lean=(0.2, 0.6), droop=(0.1, 0.4), r=(0.0018, 0.0011), r0=(0.01, 0.05), leaves=dict(n=(2, 3), arr='opp', L=(0.04, 0.07), f=(0.1, 0.4)),
              heads=dict(at='tip+side', n=(1, 2), f=(0.55, 0.8), len=(0.1, 0.2), up=0.7)),
   head=daisy_head('fan', '#6a0e30', '#9a1e48', '#a82a52', 16, 0.007, 0.006, dict(kind='ball', r=0.0095, h=0.008), ('#7a1438', '#9a1e48', '#e8c8d0'), bend=0.0, pitch=0.15, rows=2, notch=4, veins=0))

sp('echinops', doc="Globe thistle: deeply cut, spiny grey-green leaves, white beneath; stiff whitish woolly branched stems; perfect spheres 3-4 cm of steel-blue spiky florets.",
   size=(39, 21), habit='clump', stem_col=[(0, '#9aa49a'), (1, '#b4bcb4')],
   leaves=dict(basal=dict(kind='dissected', npin=9, aspect=0.4, col='#6e8270', tip='#7a8e7a', rachis='#a8b4a8', pin_ang=0.7, pin_w=0.35, lobes=2),
               stem=dict(kind='dissected', npin=7, aspect=0.4, col='#728672', tip='#7e907e', rachis='#a8b4a8', pin_ang=0.7, pin_w=0.35, lobes=2)),
   basal=dict(n=(10, 14), L=(0.2, 0.3), pitch=(0.3, 0.8), r0=(0.01, 0.05), lo=0.4),
   stems=dict(n=(6, 9), h=(0.8, 1.0), lean=(0.05, 0.3), r=(0.0045, 0.003), r0=(0.01, 0.05), leaves=dict(n=(4, 6), L=(0.08, 0.14), f=(0.1, 0.65), pitch=(0.3, 0.7)),
              heads=dict(at='tip+side', n=(1, 3), f=(0.7, 0.88), len=(0.08, 0.16), up=0.8)),
   head=ball_head(0.017, 56, fl_tube('#7a8ab8', '#4a68c8', 0.012, 0.0012, 0.0005), core=('#4a5a98', '#6070b0', '#8aa0e0'), cap=1.0))

# ----------------------------------------------------------------- spikes
sp('liatris', doc="Blazing star 'Kobold': a tuft of narrow dark leaves; stiff leafy stems ending in dense bottlebrush spikes 15-25 cm of fluffy rosy-purple florets, opening from the top down.",
   size=(24, 9), habit='grass', stem_col=[(0, '#3e5a2c'), (1, '#4a6634')],
   leaves=dict(blade=dict(kind='strap', col='#2f5a26', tip='#3e6a2e', width=0.006, nveins=3, fold=0.4),
               stem=dict(kind='strap', col='#335e28', tip='#3e6a2e', width=0.003, nveins=2, fold=0.3)),
   blades=dict(n=(40, 55), L=(0.2, 0.35), pitch=(0.9, 1.4), bend=(0.8, 1.6)),
   culms=dict(n=(6, 9), h=(0.6, 0.72), lean=(0.02, 0.15), droop=(0.0, 0.1), r=(0.0028, 0.0022), leaves=dict(n=(10, 14), L=(0.04, 0.08), f=(0.05, 0.95), pitch=(1.0, 1.35), hug=0.6, bend=0.3)),
   head=cards_head(0.2, 0.034, lambda t: np.clip(0.62 + 0.38 * np.sin(np.pi * np.clip(t, 0, 1) ** 0.9) - (t > 0.9) * (t - 0.9) * 4, 0, 1),
                   [(0, '#5a2a60'), (0.35, '#7a2e7e'), (0.5, '#a43aa6'), (1, '#c058bc')], el='dots', size=0.05, density=1.3, core=[(0, '#4a2a4a'), (1, '#6a3a6a')]))

sp('salvia', doc="Meadow sage 'Caradonna': a low clump of wrinkled toothed lance leaves; near-black purple stems with narrow spikes of small violet-blue two-lipped flowers in whorls, in purple bracts.",
   size=(20, 18), habit='clump', stem_col=[(0, '#3a2a3e'), (1, '#4a3058')],
   leaves=dict(basal=dict(kind='simple', shape='lance', aspect=0.32, col='#3e5a38', tip='#4a6640', mid='#5a7650', veins=('pinnate', 9, 0.7), teeth=(14, 0.06), hair=0.35, mottle=0.18),
               stem=dict(kind='simple', shape='lance', aspect=0.3, col='#3e5a38', tip='#4a6640', veins=('pinnate', 7, 0.7), hair=0.3)),
   basal=dict(n=(20, 26), L=(0.08, 0.12), pitch=(0.25, 0.7), stalk=0.25, r0=(0.01, 0.08), lo=0.4),
   stems=dict(n=(22, 30), h=(0.6, 0.8), lean=(0.05, 0.3), r=(0.0022, 0.0014), r0=(0.01, 0.08), seg=6, leaves=dict(n=(2, 3), arr='opp', L=(0.035, 0.05), f=(0.08, 0.35), pitch=(0.4, 0.8)),
              heads=dict(at='tip', up=0.9, jit=0.05)),
   head=spike_head(0.15, 0.009, 30, fl_lip('#3a2290', '#4c34b8', '#3a2a6a', 0.008, 0.0032, bract=('#3c1e52', '#4c2a6a')), core=[(0, '#3a2a3e'), (1, '#4a2a5a')],
                   bud=fl_bud('#3a1e50', '#4a2a68', 0.005, 0.003), buds=0.3, spiral=False, taper=0.55, pitch=0.35))

sp('agastache', doc="Anise hyssop: bushy square stems with opposite, toothed, pointed ovate leaves; dense spikes 8-12 cm of tiny lavender-blue flowers in violet calyces, on the main stems and side shoots.",
   size=(30, 21), habit='clump', stem_col=[(0, '#4a4a3a'), (1, '#5a5a42')],
   leaves=dict(stem=dict(kind='simple', shape='ovate', aspect=0.5, col='#4e6a3e', tip='#5a7648', teeth=(14, 0.07), veins=('pinnate', 6, 0.8))),
   stems=dict(n=(12, 16), h=(0.8, 1.0), lean=(0.05, 0.35), r=(0.0032, 0.002), r0=(0.01, 0.07), leaves=dict(n=(6, 8), arr='opp', L=(0.05, 0.08), f=(0.05, 0.78), pitch=(0.2, 0.6)),
              heads=dict(at='tip+side', n=(1, 3), f=(0.62, 0.82), len=(0.1, 0.18), s=(0.75, 0.9), up=0.85, jit=0.06)),
   head=cards_head(0.1, 0.03, lambda t: np.clip(0.75 + 0.25 * np.sin(np.pi * t) - (t > 0.85) * (t - 0.85) * 3, 0, 1), [(0, '#5a4a8a'), (0.5, '#7a6ac0'), (1, '#8a7ad0')], el='dots', size=0.06, density=1.2, core=[(0, '#4a3a5a'), (1, '#5a4a6a')]))

sp('veronica', doc="Spike speedwell: a low clump of toothed lance leaves; slim spikes 8-10 cm of tiny deep blue flowers, tapering to a point, held just above.",
   size=(11, 8), habit='clump', stem_col=G,
   leaves=dict(stem=dict(kind='simple', shape='lance', aspect=0.3, col='#2e5428', tip='#3a6030', teeth=(12, 0.06))),
   stems=dict(n=(10, 14), h=(0.75, 1.0), lean=(0.05, 0.35), r=(0.0018, 0.0012), r0=(0.01, 0.04), seg=5, leaves=dict(n=(4, 6), arr='opp', L=(0.035, 0.055), f=(0.05, 0.5), pitch=(0.3, 0.7)), heads=dict(at='tip', up=0.9)),
   head=cards_head(0.09, 0.016, lambda t: np.clip(0.9 - t ** 2 * 0.7, 0, 1), [(0, '#2a2a90'), (0.6, '#3a3ab8'), (1, '#5050c8')], el='dots', size=0.07, density=1.2))

sp('persicaria', doc="Mountain fleece: a big loose mound of broad pointed leaves; many thin stems with slender bottlebrush spikes 5-8 cm of crimson flowers.",
   size=(42, 40), habit='clump', stem_col=[(0, '#5a4a32'), (1, '#6a5a3a')],
   leaves=dict(basal=dict(kind='simple', shape='heart', aspect=0.5, col='#3e6230', tip='#4a6e36', notch=0.06, veins=('pinnate', 10, 0.75)),
               stem=dict(kind='simple', shape='lance', aspect=0.35, col='#426632', tip='#4c7038')),
   basal=dict(n=(14, 20), L=(0.16, 0.24), pitch=(0.2, 0.7), stalk=0.35, r0=(0.02, 0.15), lo=0.4),
   stems=dict(n=(22, 30), h=(0.7, 1.0), lean=(0.1, 0.5), droop=(0.05, 0.3), r=(0.0022, 0.0012), r0=(0.02, 0.15), leaves=dict(n=(2, 3), L=(0.06, 0.1), f=(0.1, 0.5)), heads=dict(at='tip+side', n=(0, 2), f=(0.6, 0.85), len=(0.05, 0.12), up=0.75)),
   head=cards_head(0.07, 0.012, lambda t: np.clip(0.85 - t ** 3 * 0.6, 0, 1), [(0, '#9a1a34'), (1, '#c42a48')], el='dots', size=0.08, density=1.2, cards=2))

sp('lobelia', doc="Cardinal flower: a rosette and leafy upright stems of dark, often bronzed lance leaves; spikes 20-30 cm of scarlet flowers, the lower lip three spreading lobes, the upper two narrow ones.",
   size=(40, 18), habit='clump', stem_col=[(0, '#4a3a2a'), (1, '#6a3a2a')],
   leaves=dict(basal=dict(kind='simple', shape='lance', aspect=0.3, col='#3a4a28', tip='#4a3a2a', teeth=(10, 0.04)), stem=dict(kind='simple', shape='lance', aspect=0.25, col='#3e4e2a', tip='#4a4028', teeth=(8, 0.04))),
   basal=dict(n=(8, 12), L=(0.08, 0.12), pitch=(0.2, 0.5), r0=(0.01, 0.04), lo=0.4),
   stems=dict(n=(3, 5), h=(0.85, 1.0), lean=(0.02, 0.12), r=(0.003, 0.0022), r0=(0.01, 0.04), leaves=dict(n=(9, 12), L=(0.06, 0.1), f=(0.04, 0.65), pitch=(0.4, 0.8)), heads=dict(at='tip', up=0.95, jit=0.03)),
   head=spike_head(0.26, 0.022, 18, fl_lip('#c8101a', '#e8242c', '#a01018', 0.028, 0.012, n=5), core=[(0, '#5a2a20'), (1, '#7a2a20')], core_r=0.002,
                   bud=fl_bud('#901018', '#b81a20', 0.012, 0.004), buds=0.25, pitch=0.15))

sp('stachys', doc="Lamb's ears: a mat of thick, woolly, silver-white tongue-shaped leaves; woolly stems with spikes of whorled silvery bracts, tiny pink-purple flowers peeping out.",
   size=(13, 15), habit='clump', stem_col=[(0, '#b8bcb4'), (1, '#c8ccc4')],
   leaves=dict(basal=dict(kind='simple', shape='spoon', aspect=0.38, col='#a8b0a8', tip='#c4ccc4', mid='#b8c0b8', hair=0.8, veins=('pinnate', 5, 0.8), midrib=0.5, cup=0.2),
               stem=dict(kind='simple', shape='lance', aspect=0.3, col='#b0b8b0', tip='#c4ccc4', hair=0.8)),
   basal=dict(n=(28, 36), L=(0.08, 0.13), pitch=(0.05, 0.4), r0=(0.01, 0.12), bend=0.4, lo=0.4),
   stems=dict(n=(3, 5), h=(0.8, 1.0), lean=(0.05, 0.3), r=(0.003, 0.002), r0=(0.01, 0.1), leaves=dict(n=(2, 3), arr='opp', L=(0.04, 0.06), f=(0.1, 0.4)), heads=dict(at='tip', up=0.9)),
   head=spike_head(0.13, 0.014, 16, fl_star(5, '#b04a98', '#c8c8c0', 0.006, shape='round', eye='#a03890', eye_r=0.35, depth=0.2), core=[(0, '#c0c4bc'), (1, '#c8ccc4')], core_r=0.003, pitch=0.2, spiral=False))

sp('perovskia', doc="Russian sage: a haze of many upright silver-grey stems, small grey cut leaves; airy branched panicles 25-35 cm of tiny lavender-blue flowers in grey felted calyces.",
   size=(48, 36), habit='clump', stem_col=[(0, '#8a948e'), (1, '#9aa49e')],
   leaves=dict(stem=dict(kind='dissected', npin=6, aspect=0.45, col='#7f8c86', tip='#8a968e', rachis='#9aa49e', pin_ang=0.6, pin_w=0.4)),
   stems=dict(n=(24, 32), h=(0.6, 0.8), lean=(0.05, 0.45), droop=(0.0, 0.2), r=(0.0024, 0.0014), r0=(0.01, 0.12), leaves=dict(n=(6, 9), arr='opp', L=(0.03, 0.05), f=(0.05, 0.7)), heads=dict(at='tip', up=0.9)),
   head=cards_head(0.3, 0.07, lambda t: np.clip(np.sin(np.pi * np.clip(t, 0, 1) ** 0.6), 0, 1) * 0.95, [(0, '#7a8aa0'), (0.4, '#8c9fe6'), (1, '#9aaaf0')], el='branches', size=0.03, density=1.1, upward=0.4, bend=0.1))

sp('solidago', doc="Rough goldenrod 'Fireworks': a clump of leafy stems, rough toothed lance leaves; at the top an explosion of arching one-sided sprays of tiny golden flowers.",
   size=(39, 33), habit='clump', stem_col=[(0, '#4a5a30'), (1, '#5a6a3a')],
   leaves=dict(stem=dict(kind='simple', shape='lance', aspect=0.28, col='#3e5e30', tip='#4a6a36', teeth=(12, 0.06), hair=0.2)),
   stems=dict(n=(14, 18), h=(0.75, 0.9), lean=(0.05, 0.4), r=(0.003, 0.002), r0=(0.01, 0.1), leaves=dict(n=(10, 14), L=(0.05, 0.09), f=(0.05, 0.8), pitch=(0.3, 0.8)), heads=dict(at='tip', up=0.6)),
   head=lambda fl, ctx: _spray(fl, ctx))

def _spray(fl, ctx):
    """Goldenrod 'Fireworks': a dozen thin arching racemes radiating from the stem's top, flowers along their upper sides."""
    r = fl.at.region(40, 256); paint_brush(fl.at, r, lambda t: np.clip(0.6 + 0.4 * np.sin(np.pi * t), 0, 1) * (1 - t * 0.5), [(0, '#c89a10'), (1, '#f2c21a')], el='dots', size=0.1, density=1.3, seed=21)
    def build(qh):
        g = Geo(); rg = np.random.default_rng(9); n = 12 if qh >= 1 else 5
        for k in range(n):
            a = k / n * TAU + rg.normal(0, 0.2); L = rg.uniform(0.1, 0.17)
            c = ribbon(L, 0.012, r, nu=4 if qh >= 1 else 2, nv=2, bend=rg.uniform(1.2, 1.9))
            g.put(place(c, [0, 0, rg.uniform(-0.03, 0)], heading(a, rg.uniform(0.7, 1.2)), up=(0, 0, 1)))   # lying flat along the arch, flowers up
        return g
    return build

sp('astilbe', doc="Astilbe: a mound of glossy, toothed, divided leaves, bronzed when young; slender stems with feathery pyramidal plumes 20-30 cm of tiny pink flowers.",
   size=(30, 24), habit='mound', stem_col=[(0, '#5a3a2a'), (1, '#7a4a3a')],
   leaves=dict(basal=dict(kind='ternate', levels=2, leaflet_len=0.5, col='#2e4a26', leaflet=dict(shape='ovate', aspect=0.5, col='#2e4a26', tip='#3a5a2a', teeth=(12, 0.1)), rachis='#5a4a30')),
   mound=dict(n=(14, 20), L=(0.2, 0.3), top=0.55, flat=0.6, stalk_r=0.0018, tilt=(-0.1, 0.4)),
   flowers=dict(n=(5, 8), h=(0.9, 1.0), out=(0.0, 0.6), flat=0.3, r=0.002, droop=0.1, up=0.9, out_face=0.1),
   head=cards_head(0.24, 0.1, lambda t: np.clip((1 - t) ** 0.7 * 1.0, 0, 1), [(0, '#d07898'), (0.5, '#e898b8'), (1, '#f2b0c8')], el='branches', size=0.04, density=1.3, upward=0.5))

sp('filipendula', doc="Queen of the prairie: big jagged, deeply lobed leaves; tall stems topped by broad fluffy clouds 15-20 cm of tiny peach-pink flowers, like candyfloss.",
   size=(66, 40), habit='clump', stem_col=[(0, '#4a5a34'), (1, '#6a5a3a')],
   leaves=dict(basal=dict(kind='plate', lobes=7, depth=0.6, nteeth=50, tooth=0.08, col='#3a5e2c', mid='#4a6a34', nveins=7, cup=0.1, droop=0.25),
               stem=dict(kind='compound', pairs=2, leaflet_len=0.3, terminal=1.6, col='#3c602e', leaflet=dict(shape='ovate', aspect=0.55, teeth=(10, 0.12), col='#3c602e', tip='#466a34'))),
   basal=dict(n=(8, 11), L=(0.25, 0.32), pitch=(0.5, 0.9), stalk=0.8, r0=(0.02, 0.1), tilt=(-0.2, 0.25), lo=0.5),
   stems=dict(n=(5, 8), h=(0.8, 1.0), lean=(0.02, 0.2), r=(0.005, 0.003), r0=(0.02, 0.1), leaves=dict(n=(4, 5), L=(0.14, 0.2), f=(0.1, 0.75), pitch=(0.4, 0.8)), heads=dict(at='tip', up=0.95, jit=0.05)),
   head=ball_head(0.075, 40, fl_star(5, '#f4b8c4', '#e88a9c', 0.014, shape='round', depth=0.6), core=('#e890a0', '#f0a8b8', '#f8d0d8'), cap=0.6, flat=0.55))

sp('sanguisorba', doc="Great burnet: blue-green leaves of many toothed oval leaflets; wiry, branched, almost leafless stems holding small oval heads 1.5-2.5 cm of dark crimson flowers.",
   size=(48, 18), habit='clump', stem_col=[(0, '#4a4a30'), (1, '#5a4a38')],
   leaves=dict(basal=dict(kind='compound', pairs=5, leaflet_len=0.18, terminal=1.0, col='#5a7652', leaflet=dict(shape='elliptic', aspect=0.6, col='#5a7652', tip='#64805a', teeth=(12, 0.1)))),
   basal=dict(n=(10, 14), L=(0.22, 0.32), pitch=(0.3, 0.8), r0=(0.01, 0.06), bend=0.5, lo=0.5),
   stems=dict(n=(5, 8), h=(0.8, 1.0), lean=(0.05, 0.3), r=(0.0024, 0.0012), r0=(0.01, 0.05), heads=dict(at='branches', n=(4, 7), f=(0.45, 0.95), len=(0.1, 0.22), s=(0.8, 1.0), up=0.85)),
   head=ball_head(0.0085, 0, fl_star(4, '#6a1428', '#7c1e30', 0.003), core=('#5a0e22', '#7c1e30', '#3a0610'), flat=1.7))

sp('lupinus', doc="Lupin: a rosette of soft, hairy, palmate leaves of 9-11 narrow leaflets on long stalks; stout spires 30-40 cm crowded with violet-blue pea flowers, paler standards, buds at the tip.",
   size=(42, 15), habit='clump', stem_col=[(0, '#4a5a3a'), (1, '#5a6a44')],
   leaves=dict(basal=dict(kind='digitate', n=10, col='#56744a', leaflet=dict(shape='oblong', aspect=0.22, col='#56744a', tip='#62804e', hair=0.3, veins=('parallel', 1)))),
   basal=dict(n=(14, 18), L=(0.2, 0.26), pitch=(0.4, 0.9), stalk=0.7, r0=(0.01, 0.06), tilt=(-0.1, 0.35), lo=0.5),
   stems=dict(n=(3, 6), h=(0.85, 1.0), lean=(0.02, 0.15), r=(0.006, 0.004), r0=(0.01, 0.05), leaves=dict(n=(2, 3), L=(0.12, 0.16), f=(0.1, 0.4), leaf='basal'), heads=dict(at='tip', up=0.95, jit=0.04)),
   head=spike_head(0.36, 0.032, 60, fl_pea('#6a5ad8', '#4a3ab0', 0.022, eye='#f0eef8'), core=[(0, '#4a5a3a'), (1, '#4a3a6a')], core_r=0.004, bud=fl_bud('#4a3aa0', '#5a4ab8', 0.01, 0.005), buds=0.25, pitch=0.1, taper=0.45))

sp('baptisia', doc="Blue false indigo: a shrubby dome of blue-green three-parted leaves on many stems; loose upright spikes 20-30 cm of indigo pea flowers.",
   size=(42, 42), habit='clump', stem_col=[(0, '#4a5a5e'), (1, '#5a6a6e')],
   leaves=dict(stem=dict(kind='ternate', levels=1, leaflet_len=0.7, col='#5f7f86', leaflet=dict(shape='obovate', aspect=0.45, col='#587a80', tip='#66868c', veins=('pinnate', 4, 0.8)), rachis='#5a6a6e')),
   stems=dict(n=(18, 24), h=(0.7, 0.85), lean=(0.15, 0.6), droop=(0.1, 0.3), r=(0.004, 0.0024), r0=(0.02, 0.12), leaves=dict(n=(8, 11), L=(0.06, 0.09), f=(0.15, 0.85), pitch=(0.2, 0.6)), heads=dict(at='tip', up=0.9)),
   head=spike_head(0.24, 0.025, 16, fl_pea('#3e48c0', '#2e36a0', 0.02), core=[(0, '#4a5a5e'), (1, '#3a3a5a')], core_r=0.0025, bud=fl_bud('#2e3088', '#3a40a8', 0.012, 0.006), buds=0.2, pitch=0.2, spiral=True))

sp('delphinium', doc="Delphinium: a rosette of deeply cut palmate leaves; tall stout spires 40-60 cm densely set with flat spurred blue flowers 4-5 cm, each with a dark 'bee' at its centre.",
   size=(48, 30), habit='clump', stem_col=[(0, '#3a5a3a'), (1, '#4a6a48')],
   leaves=dict(basal=dict(kind='plate', lobes=5, depth=0.75, nteeth=30, tooth=0.15, col='#3a6234', mid='#46703c', nveins=5, cup=0.15, droop=0.2)),
   basal=dict(n=(10, 14), L=(0.16, 0.22), pitch=(0.4, 0.9), stalk=0.9, r0=(0.01, 0.06), tilt=(-0.2, 0.3), lo=0.5),
   stems=dict(n=(3, 5), h=(0.88, 1.0), lean=(0.02, 0.12), r=(0.007, 0.004), r0=(0.01, 0.06), leaves=dict(n=(3, 4), L=(0.1, 0.14), f=(0.1, 0.4), leaf='basal'), heads=dict(at='tip', up=0.95, jit=0.03)),
   head=spike_head(0.5, 0.04, 34, fl_star(5, '#2a2a6a', '#3a5ad6', 0.022, shape='round', eye='#2a2030', eye_r=0.22, depth=0.35), core=[(0, '#3a5a3a'), (1, '#3a4a6a')], core_r=0.004,
                   bud=fl_bud('#2a3a90', '#3a50b8', 0.012, 0.007), buds=0.22, pitch=0.1, taper=0.5))

sp('digitalis', doc="Foxglove: a rosette of large, soft, hairy, broad leaves; tall spires 50-90 cm hung down one side with tubular bells 4-5 cm, magenta-pink, the throats white and spotted dark.",
   size=(48, 21), habit='clump', stem_col=[(0, '#4a5a3a'), (1, '#5a6a44')],
   leaves=dict(basal=dict(kind='simple', shape='elliptic', aspect=0.38, col='#4a6a40', tip='#5a7a4c', mid='#6a8a58', hair=0.5, teeth=(14, 0.03), veins=('pinnate', 9, 0.6))),
   basal=dict(n=(14, 20), L=(0.22, 0.3), pitch=(0.15, 0.6), r0=(0.01, 0.05), bend=0.5, lo=0.4),
   stems=dict(n=(1, 3), h=(0.88, 1.0), lean=(0.02, 0.15), r=(0.006, 0.004), r0=(0.01, 0.04), leaves=dict(n=(4, 6), L=(0.08, 0.14), f=(0.05, 0.4), leaf='basal'), heads=dict(at='tip', up=0.95, jit=0.03)),
   head=spike_head(0.55, 0.03, 26, fl_bell('#c4519f', '#f0d8ec', 0.045, 0.011, flare=1.45, spots='#6a1a4a'), core=[(0, '#4a5a3a'), (1, '#5a4a4a')], core_r=0.004,
                   bud=fl_bud('#a84088', '#c05aa0', 0.015, 0.008), buds=0.2, pitch=-0.45, arc=1.3, taper=0.6))

sp('penstemon', doc="Beardtongue 'Husker Red': a rosette and opposite leaves of glossy lance leaves, maroon-flushed; dark red stems with open panicles of white tubular flowers 2-3 cm, blushed pink.",
   size=(30, 18), habit='clump', stem_col=[(0, '#4a1e1e'), (1, '#6a2a2a')],
   leaves=dict(basal=dict(kind='simple', shape='lance', aspect=0.3, col='#4a2e26', tip='#5a4a30', teeth=(10, 0.03)), stem=dict(kind='simple', shape='lance', aspect=0.26, col='#4e3428', tip='#5a4a30', teeth=(8, 0.03))),
   basal=dict(n=(12, 16), L=(0.1, 0.15), pitch=(0.2, 0.6), r0=(0.01, 0.05), lo=0.4),
   stems=dict(n=(7, 10), h=(0.85, 1.0), lean=(0.02, 0.2), r=(0.0028, 0.002), r0=(0.01, 0.05), leaves=dict(n=(4, 5), arr='opp', L=(0.06, 0.1), f=(0.08, 0.6), pitch=(0.3, 0.7)), heads=dict(at='tip', up=0.95, jit=0.04)),
   head=spike_head(0.18, 0.05, 20, fl_bell('#f2e8ec', '#f6eef2', 0.024, 0.006, flare=1.5), core=[(0, '#5a2a2a'), (1, '#6a2a2a')], core_r=0.0015, pitch=-0.25, taper=0.4, buds=0.15, bud=fl_bud('#c8a0a8', '#e8d0d6', 0.01, 0.004)))

sp('hosta', doc="Hosta sieboldiana: a great mound of big heart-shaped, deeply ribbed, blue-grey leaves 25-35 cm; scapes just above with pale lavender-white bells.",
   size=(26, 44), habit='mound', stem_col=[(0, '#7a9a88'), (1, '#8aa494')],
   leaves=dict(basal=dict(kind='simple', shape='heart', aspect=0.78, notch=0.08, col='#3e5a5e', tip='#48646a', mid='#567276', veins=('pinnate', 13, 0.35), midrib=1.2, mottle=0.08, cup=0.25, nu=7)),
   mound=dict(n=(16, 22), L=(0.26, 0.34), top=0.75, flat=0.7, stalk_r=0.005, tilt=(0.0, 0.5), spread_pow=0.7),
   flowers=dict(n=(3, 6), h=(0.95, 1.1), out=(0.0, 0.5), flat=0.2, r=0.003, droop=0.1, up=0.95, out_face=0.1),
   head=spike_head(0.16, 0.03, 12, fl_bell('#d8d0e8', '#f0ecf6', 0.04, 0.008, flare=1.4), core=[(0, '#7a9a88'), (1, '#8a9a94')], core_r=0.002, pitch=-0.5, taper=0.6, bud=fl_bud('#c8c0e0', '#d8d0e8', 0.015, 0.006), buds=0.3))

sp('camassia', doc="Camas: a tuft of strap leaves; straight scapes 60-75 cm with loose spires of starry blue-violet flowers 4-5 cm, six tepals, golden anthers.",
   size=(30, 14), habit='grass', stem_col=[(0, '#4a6a40'), (1, '#5a7a48')],
   leaves=dict(blade=dict(kind='strap', col='#4a6e3e', tip='#5a7a48', width=0.014, nveins=7, fold=0.35)),
   blades=dict(n=(10, 14), L=(0.3, 0.42), pitch=(0.7, 1.3), bend=(0.8, 1.6), lo=0.5),
   culms=dict(n=(2, 4), h=(0.85, 1.0), lean=(0.02, 0.12), droop=(0.0, 0.1), r=(0.0035, 0.0025)),
   head=spike_head(0.22, 0.03, 18, fl_star(6, '#3a3ab0', '#6060d8', 0.022, shape='narrow', eye='#d8c040', eye_r=0.12, depth=0.7), core=[(0, '#4a6a40'), (1, '#4a5a60')], core_r=0.002, pitch=0.35, bud=fl_bud('#3a3a90', '#5050b0', 0.012, 0.004), buds=0.25))

sp('ligularia', doc="Ligularia 'The Rocket': a mound of big, round-hearted, sharply toothed dark leaves on long stalks; near-black stems carrying narrow spires 40-50 cm of small lemon-yellow daisies.",
   size=(60, 36), habit='clump', stem_col=[(0, '#2a2a20'), (1, '#3a3428')],
   leaves=dict(basal=dict(kind='simple', shape='heart', aspect=0.95, notch=0.12, col='#2e5228', tip='#3a5e2e', mid='#46683a', teeth=(30, 0.06), veins=('pinnate', 8, 0.5), cup=0.2, nu=6)),
   basal=dict(n=(10, 14), L=(0.22, 0.28), pitch=(0.5, 1.0), stalk=0.9, stalk_r=0.004, r0=(0.01, 0.08), bend=0.6, lo=0.5),
   stems=dict(n=(3, 6), h=(0.88, 1.0), lean=(0.02, 0.12), r=(0.005, 0.003), r0=(0.01, 0.06), leaves=dict(n=(2, 3), L=(0.08, 0.12), f=(0.1, 0.4), leaf='basal'), heads=dict(at='tip', up=0.95, jit=0.03)),
   head=spike_head(0.45, 0.032, 34, fl_star(5, '#e0a810', '#f2c418', 0.014, shape='narrow', eye='#c89010', eye_r=0.2, depth=0.6), core=[(0, '#2a2a20'), (1, '#3a3428')], core_r=0.003, pitch=0.15, bud=fl_bud('#5a5020', '#8a7a20', 0.008, 0.004), buds=0.2, taper=0.4))

sp('hemerocallis', doc="Daylily 'Stella de Oro': a fountain of arching strap leaves; scapes just above carrying trumpets 6-7 cm of golden yellow, six tepals curving back.",
   size=(11, 11), habit='grass', stem_col=[(0, '#4a6a3a'), (1, '#5a7a40')],
   leaves=dict(blade=dict(kind='strap', col='#3e6a32', tip='#4e7a3a', width=0.012, nveins=6, fold=0.5)),
   blades=dict(n=(24, 32), L=(0.25, 0.35), pitch=(0.7, 1.35), bend=(1.0, 1.8), lo=0.4),
   culms=dict(n=(5, 8), h=(0.85, 1.05), lean=(0.05, 0.35), droop=(0.1, 0.3), r=(0.0028, 0.002), per=(2, 3), blen=(0.02, 0.04), up=0.4),
   head=lambda fl, ctx: _lily(fl, '#e8a010', '#f4b81c', '#f6c43a', 0.038, 0.016, '#e8c050'))

def _lily(fl, c0, c1, c2, L, W, stamen):
    tep = fl.petal('tepal', 'tepal', c0, c1, c2, w=48, h=128, veins=3); sr = fl.ramp('stamen', [(0, stamen), (1, '#6a4a10')], w=8, h=32)
    return lambda qh: h_trumpet(qh, tep, 6, L, W, np.random.default_rng(4), flare=0.55, recurve=0.9, stamens=(sr, L * 0.7))

# ----------------------------------------------------------------- umbels and balls
sp('achillea', doc="Fern-leaf yarrow: soft, finely cut, grey-green feathery leaves; stiff stems topped by flat plates 8-10 cm of tiny mustard-yellow flowers.",
   size=(18, 11), habit='clump', stem_col=[(0, '#7a8a6a'), (1, '#8a9a7a')],
   leaves=dict(basal=dict(kind='dissected', npin=16, aspect=0.32, col='#7e8e70', tip='#8a9a7c', rachis='#94a286', pin_ang=0.8, pin_w=0.35, lobes=3, hair=0.2),
               stem=dict(kind='dissected', npin=10, aspect=0.3, col='#808e72', tip='#8a9a7c', rachis='#94a286', pin_ang=0.8, pin_w=0.35, lobes=2)),
   basal=dict(n=(14, 20), L=(0.14, 0.22), pitch=(0.4, 0.9), r0=(0.01, 0.05), lo=0.4),
   stems=dict(n=(8, 12), h=(0.85, 1.0), lean=(0.02, 0.2), r=(0.0028, 0.002), r0=(0.01, 0.05), leaves=dict(n=(5, 7), L=(0.05, 0.08), f=(0.05, 0.7), pitch=(0.4, 0.8)), heads=dict(at='tip', up=0.95, jit=0.03)),
   head=umbel_head(0.045, 50, fl_star(5, '#d8b81a', '#f0d040', 0.0055, shape='round', depth=0.3), dome=0.18, base=('#c8a81a', '#e8cc3a')))

sp('asclepias', doc="Butterfly weed: a bushy clump of many stems crowded with narrow lance leaves; flat-topped clusters 5-8 cm of bright orange flowers, petals swept back under little crowns.",
   size=(21, 15), habit='clump', stem_col=[(0, '#5a6a3a'), (1, '#6a7a4a')],
   leaves=dict(stem=dict(kind='simple', shape='lance', aspect=0.2, col='#3e5e2e', tip='#4a6a36', mid='#5e7e44', veins=('pinnate', 8, 0.8))),
   stems=dict(n=(12, 16), h=(0.8, 1.0), lean=(0.05, 0.4), r=(0.0032, 0.0022), r0=(0.01, 0.08), leaves=dict(n=(12, 16), L=(0.05, 0.08), f=(0.05, 0.85), pitch=(0.4, 0.9)),
              heads=dict(at='tip+side', n=(1, 3), f=(0.78, 0.92), len=(0.03, 0.06), s=(0.75, 0.9), up=0.85, jit=0.08)),
   head=umbel_head(0.03, 22, fl_star(5, '#e05a10', '#f07a1c', 0.0055, shape='round', eye='#f8a030', eye_r=0.3, depth=0.4, cup=-0.3), dome=0.25, ped='#7a8a4a'))

sp('verbena', doc="Verbena bonariensis: a few rough leaves at the foot; tall, wiry, square, branching stems, almost leafless, each branch ending in a small cluster of tiny bright purple flowers.",
   size=(60, 14), habit='clump', stem_col=[(0, '#4a6a3a'), (1, '#56703e')],
   leaves=dict(basal=dict(kind='simple', shape='lance', aspect=0.2, col='#3e5e30', tip='#4a6a38', teeth=(12, 0.06), hair=0.3), stem=dict(kind='simple', shape='lance', aspect=0.15, col='#40602e', tip='#4a6a38', teeth=(8, 0.06))),
   basal=dict(n=(6, 9), L=(0.08, 0.12), pitch=(0.2, 0.6), r0=(0.01, 0.04), lo=0.5),
   stems=dict(n=(4, 6), h=(0.85, 1.0), lean=(0.02, 0.2), r=(0.0025, 0.0015), r0=(0.01, 0.04), sides=4, leaves=dict(n=(2, 3), arr='opp', L=(0.06, 0.1), f=(0.1, 0.4)),
              heads=dict(at='branches', n=(5, 8), f=(0.55, 0.92), len=(0.12, 0.28), bpitch=0.9, s=(0.9, 1.1), up=0.9)),
   head=umbel_head(0.013, 18, fl_star(5, '#8a3ad0', '#a05ae0', 0.0035, shape='round', depth=0.45), dome=0.6, base=('#6a2a90', '#8a3ab0'), base_r=0.6))

sp('sedum', doc="Stonecrop 'Autumn Joy': stout pale fleshy stems with thick, toothed, blue-green leaves; broad domed heads 10-15 cm of tiny starry flowers, pink turning rust.",
   size=(21, 21), habit='clump', stem_col=[(0, '#8aa08a'), (1, '#9ab09a')],
   leaves=dict(stem=dict(kind='simple', shape='obovate', aspect=0.6, col='#7a9a7e', tip='#88a68a', mid='#96b098', teeth=(8, 0.04), cup=0.3, mottle=0.06, veins=('pinnate', 4, 0.8), midrib=0.3)),
   stems=dict(n=(14, 18), h=(0.8, 1.0), lean=(0.05, 0.35), r=(0.0045, 0.0035), r0=(0.01, 0.09), leaves=dict(n=(8, 10), L=(0.045, 0.065), f=(0.05, 0.85), pitch=(0.2, 0.6)), heads=dict(at='tip', up=0.9, jit=0.05)),
   head=umbel_head(0.05, 90, fl_star(5, '#c86080', '#d47a96', 0.0045, shape='star', depth=0.6), dome=0.4))

sp('eutrochium', doc="Joe-Pye weed: tall purple-spotted stems with whorls of big toothed lance leaves; huge domed heads 20-30 cm of fluffy dusky pink flowers.",
   size=(54, 21), habit='clump', stem_col=[(0, '#5a2a3a'), (1, '#6a3a4a')],
   leaves=dict(stem=dict(kind='simple', shape='lance', aspect=0.3, col='#36562a', tip='#406030', teeth=(18, 0.05), veins=('pinnate', 9, 0.7))),
   stems=dict(n=(5, 8), h=(0.85, 1.0), lean=(0.02, 0.2), r=(0.007, 0.0045), r0=(0.01, 0.06), leaves=dict(n=(5, 6), arr='whorl', whorl=4, L=(0.14, 0.2), f=(0.08, 0.8), pitch=(0.1, 0.5)), heads=dict(at='tip', up=0.95, jit=0.03)),
   head=ball_head(0.11, 60, fl_star(6, '#d8a4bc', '#b87a98', 0.02, shape='narrow', depth=0.7), core=('#a06a84', '#c48aa8', '#e0b8c8'), cap=0.55, flat=0.5))

sp('monardaF', doc="Wild bergamot: a clump of square stems with opposite, toothed, pointed leaves; ragged pompoms 4-6 cm of slender, two-lipped lavender flowers over a ring of pale bracts.",
   size=(42, 36), habit='clump', stem_col=[(0, '#5a5a40'), (1, '#6a6a4a')],
   leaves=dict(stem=dict(kind='simple', shape='lance', aspect=0.38, col='#4a6640', tip='#56704a', teeth=(12, 0.05), veins=('pinnate', 7, 0.7))),
   stems=dict(n=(14, 18), h=(0.8, 1.0), lean=(0.05, 0.35), r=(0.0034, 0.0022), r0=(0.01, 0.1), leaves=dict(n=(6, 8), arr='opp', L=(0.06, 0.09), f=(0.05, 0.85), pitch=(0.2, 0.6)),
              heads=dict(at='tip+side', n=(0, 1), f=(0.75, 0.88), len=(0.08, 0.14), up=0.85)),
   head=ball_head(0.016, 34, fl_tube('#b090c8', '#c7a3dc', 0.026, 0.0012, 0.0016), core=('#6a6a50', '#8a8a6a', '#5a4a40'), cap=0.6, flat=0.8))

sp('phloxJ', doc="Garden phlox 'Jeana': upright stems with opposite lance leaves; domed panicles 10-15 cm of small five-petalled lilac-pink flowers with darker eyes.",
   size=(36, 27), habit='clump', stem_col=[(0, '#4a5a34'), (1, '#56683c')],
   leaves=dict(stem=dict(kind='simple', shape='lance', aspect=0.25, col='#33602e', tip='#3e6a34', veins=('pinnate', 7, 0.7))),
   stems=dict(n=(10, 14), h=(0.85, 1.0), lean=(0.02, 0.25), r=(0.0034, 0.0024), r0=(0.01, 0.08), leaves=dict(n=(8, 11), arr='opp', L=(0.07, 0.11), f=(0.05, 0.8), pitch=(0.2, 0.6)), heads=dict(at='tip', up=0.95, jit=0.03)),
   head=ball_head(0.055, 44, fl_star(5, '#a85ab8', '#c98ad8', 0.011, shape='round', eye='#8a3f9e', eye_r=0.22, depth=0.35), core=('#8a5a9a', '#a070b4'), cap=0.6, flat=0.85))

sp('phloxR', doc="Garden phlox, red: as 'Jeana' but the flowers carmine red with a darker eye.",
   size=(32, 28), habit='clump', stem_col=[(0, '#4a5a34'), (1, '#56683c')],
   leaves=dict(stem=dict(kind='simple', shape='lance', aspect=0.25, col='#33602e', tip='#3e6a34', veins=('pinnate', 7, 0.7))),
   stems=dict(n=(10, 14), h=(0.85, 1.0), lean=(0.02, 0.25), r=(0.0034, 0.0024), r0=(0.01, 0.08), leaves=dict(n=(8, 11), arr='opp', L=(0.07, 0.11), f=(0.05, 0.8), pitch=(0.2, 0.6)), heads=dict(at='tip', up=0.95, jit=0.03)),
   head=ball_head(0.055, 44, fl_star(5, '#c82040', '#de3550', 0.012, shape='round', eye='#8e1430', eye_r=0.22, depth=0.35), core=('#902030', '#b02838'), cap=0.6, flat=0.85))

sp('hydrangea', doc="Smooth hydrangea 'Annabelle': a rounded shrub of many stems, big opposite, toothed, rounded leaves; huge snowballs 20-25 cm of creamy white four-petalled florets, green-tinged when young.",
   size=(48, 60), habit='clump', stem_col=[(0, '#6a5a40'), (1, '#7a6a4a')],
   leaves=dict(stem=dict(kind='simple', shape='ovate', aspect=0.65, col='#4a7a34', tip='#56863c', mid='#64904a', teeth=(22, 0.05), veins=('pinnate', 8, 0.7))),
   stems=dict(n=(20, 26), h=(0.7, 0.9), lean=(0.15, 0.7), droop=(0.1, 0.4), r=(0.006, 0.004), r0=(0.02, 0.2), leaves=dict(n=(4, 5), arr='opp', L=(0.1, 0.14), f=(0.2, 0.85), pitch=(0.1, 0.5)), heads=dict(at='tip', up=0.55, out=0.3)),
   head=ball_head(0.1, 70, fl_star(4, '#e8ecd8', '#f6f6ec', 0.016, shape='round', depth=0.3, eye='#c8d4a0', eye_r=0.12), core=('#d8dcc0', '#eaeedc'), cap=0.72, flat=0.85))

sp('alliumG', doc="Allium 'Globemaster': a few broad grey-green strap leaves; one or two thick scapes with a sphere 15-20 cm of hundreds of starry violet flowers.",
   size=(24, 15), habit='grass', stem_col=[(0, '#5a7a48'), (1, '#6a8a52')],
   leaves=dict(blade=dict(kind='strap', col='#5a7a5a', tip='#6a8a62', width=0.05, nveins=9, fold=0.25, nu=6)),
   blades=dict(n=(6, 9), L=(0.28, 0.4), pitch=(0.3, 0.9), bend=(0.6, 1.4), lo=0.6),
   culms=dict(n=(1, 2), h=(0.9, 1.0), lean=(0.0, 0.08), droop=(0.0, 0.05), r=(0.007, 0.006)),
   head=ball_head(0.085, 160, fl_star(6, '#7a3ab0', '#a46ad4', 0.011, shape='narrow', depth=0.65), core=('#5a2a80', '#7a3aa0', '#9a5ac8'), stalks=1.0))

sp('alliumS', doc="Drumstick allium: a few thin leaves; slender scapes 60 cm with egg-shaped heads 2.5-3 cm, tight florets, wine-purple, greener at the top before they open.",
   size=(26, 4), habit='grass', stem_col=[(0, '#5a7a48'), (1, '#6a8a52')],
   leaves=dict(blade=dict(kind='strap', col='#5a7a48', tip='#8a8a5a', width=0.003, nveins=2, fold=0.5)),
   blades=dict(n=(3, 5), L=(0.2, 0.3), pitch=(0.6, 1.2), bend=(1.0, 1.8)),
   culms=dict(n=(1, 2), h=(0.9, 1.0), lean=(0.0, 0.1), droop=(0.0, 0.1), r=(0.0018, 0.0014)),
   head=ball_head(0.012, 40, fl_star(6, '#6a1a40', '#8a2a5a', 0.0035, shape='narrow', depth=0.5), core=('#5a1a3a', '#7a2a52', '#9a3a6a'), flat=1.35))

sp('amsonia', doc="Threadleaf bluestar: a soft billowing dome of many upright stems clothed in needle-fine leaves; small loose clusters of pale ice-blue starry flowers at the tips.",
   size=(30, 30), habit='clump', stem_col=[(0, '#5a7a40'), (1, '#6a8448')],
   leaves=dict(stem=dict(kind='simple', shape='linear', aspect=0.06, col='#4e7a34', tip='#5e8a3e', veins=('parallel', 1), midrib=0.5)),
   stems=dict(n=(30, 40), h=(0.75, 1.0), lean=(0.05, 0.6), droop=(0.05, 0.3), r=(0.0024, 0.0014), r0=(0.01, 0.1), seg=6, leaves=dict(n=(14, 18), L=(0.06, 0.09), f=(0.1, 0.92), pitch=(0.5, 1.0), lo=0.35, shrink=0.2), heads=dict(at='tip', up=0.8)),
   head=umbel_head(0.022, 12, fl_star(5, '#c8d8f2', '#a8c0ea', 0.0065, shape='narrow', depth=0.7), dome=0.5, ped='#6a8448'))

sp('astrantia', doc="Masterwort: a mound of deeply lobed, toothed palmate leaves; branched stems with pincushions 3 cm of tiny flowers in a collar of papery pointed bracts, white flushed pink, green-tipped.",
   size=(24, 18), habit='mound', stem_col=[(0, '#4a5a40'), (1, '#5a6a48')],
   leaves=dict(basal=dict(kind='plate', lobes=5, depth=0.65, nteeth=40, tooth=0.1, col='#3a6030', mid='#46703a', nveins=5, cup=0.1, droop=0.25)),
   mound=dict(n=(18, 24), L=(0.12, 0.16), top=0.5, flat=0.75, stalk_r=0.0018),
   flowers=dict(n=(10, 14), h=(0.85, 1.0), out=(0.0, 0.8), flat=0.3, r=0.0014, droop=0.2, up=0.7, branch=(2, 3), blen=(0.03, 0.06)),
   head=daisy_head('lance', '#c8d0b8', '#ead6dc', '#8aa070', 16, 0.014, 0.0045, dict(kind='dome', r=0.007, h=0.006), ('#d8c0c8', '#eadce0', '#a07a8a'), bend=-0.15, pitch=0.25, veins=3, twist=0.05))

sp('anemone', doc="Japanese anemone: a mound of large three-parted, toothed dark leaves; tall wiry branched stems to a metre with saucers 6-7 cm, white (pink on the back) round a ring of golden stamens and a green knob.",
   size=(42, 21), habit='mound', stem_col=[(0, '#4a5a40'), (1, '#5a6a48')],
   leaves=dict(basal=dict(kind='ternate', levels=1, leaflet_len=0.6, col='#2e5628', leaflet=dict(shape='ovate', aspect=0.7, col='#2e5628', tip='#386030', teeth=(10, 0.14), veins=('pinnate', 5, 0.8)), rachis='#4a5a40')),
   mound=dict(n=(12, 16), L=(0.18, 0.24), top=0.45, flat=0.6, stalk_r=0.003, tilt=(-0.2, 0.3)),
   flowers=dict(n=(5, 8), h=(0.9, 1.05), out=(0.0, 0.7), flat=0.2, r=0.0022, droop=0.15, up=0.6, branch=(2, 4), blen=(0.06, 0.12)),
   head=lambda fl, ctx: _saucer(fl, 'petal', '#f0e8ee', '#fbfaf6', 6, 0.032, 0.026, ('#90a040', '#f2d24a'), pitch=0.15, cup=0.25))

def _saucer(fl, shape, c0, c1, n, L, W, centre, pitch=0.3, cup=0.3, rows=1, bend=-0.15, blotch=None, ring='#f2d24a', knob=0.006):
    pet = fl.petal('petal', shape, c0, c1, None, w=64, h=96, veins=5, blotch=blotch)
    dr = fl.at.region(64, 64); paint_disc(fl.at, dr, centre[0], centre[1], dots='#3a2a10', ndots=0.5, ring=(ring, 0.55) if ring else None, seed=2)
    def build(qh):
        c = h_disc(qh, kind='dome', r=knob * 1.6, h=knob, rect=dr)
        return h_cup(qh, pet, n, L, W, np.random.default_rng(3), cup=cup, pitch=pitch, rows=rows, centre=c, bend=bend)
    return build

sp('caltha', doc="Marsh marigold: a low mound of glossy, round, kidney-shaped, scalloped leaves; buttercups 3-4 cm of five shiny golden sepals on short stalks among them.",
   size=(14, 18), habit='mound', stem_col=[(0, '#4a6a3a'), (1, '#5a7a44')],
   leaves=dict(basal=dict(kind='plate', lobes=1, depth=0.0, nteeth=26, tooth=0.04, sinus=0.5, col='#2e5a22', mid='#3a6a2a', edge='#2a5020', nveins=9, cup=0.25, droop=0.1, mottle=0.08)),
   mound=dict(n=(14, 20), L=(0.08, 0.12), top=0.6, flat=0.6, stalk_r=0.0025),
   flowers=dict(n=(10, 14), h=(0.95, 1.1), out=(0.0, 0.8), flat=0.4, r=0.0018, droop=0.2, up=0.7),
   head=lambda fl, ctx: _saucer(fl, 'obovate', '#e8b010', '#f4c418', 5, 0.016, 0.016, ('#c89a10', '#e8b818'), pitch=0.45, cup=0.45, ring=None, knob=0.004))

sp('papaver', doc="Oriental poppy: a rosette of coarse, bristly, deeply cut leaves; hairy stems with huge bowls 10-15 cm of crinkled scarlet-orange petals, black blotches at their feet, round a boss of black stamens and a purple-black seed cap.",
   size=(30, 21), habit='clump', stem_col=[(0, '#5a6a44'), (1, '#6a7a4a')],
   leaves=dict(basal=dict(kind='dissected', npin=10, aspect=0.4, col='#4e6e42', tip='#5a7a4a', rachis='#6a8a58', pin_ang=0.75, pin_w=0.4, lobes=2, hair=0.4)),
   basal=dict(n=(16, 22), L=(0.22, 0.3), pitch=(0.3, 0.8), r0=(0.01, 0.06), bend=0.7, lo=0.4),
   stems=dict(n=(4, 7), h=(0.8, 1.0), lean=(0.05, 0.35), droop=(0.05, 0.25), r=(0.004, 0.003), r0=(0.01, 0.05), leaves=dict(n=(2, 3), L=(0.08, 0.12), f=(0.1, 0.4), leaf='basal'), heads=dict(at='tip', up=0.8)),
   head=lambda fl, ctx: _saucer(fl, 'obovate', '#d02a10', '#e8401a', 5, 0.065, 0.07, ('#2a1a30', '#1a0a10'), pitch=0.8, cup=0.55, blotch=('#1a0a0a', 0.22), ring='#1a1010', knob=0.01, bend=-0.35))

sp('roseDA', doc="English rose (Austin): an arching shrub of thorny canes with glossy leaves of five toothed leaflets; deep cups 8-10 cm packed with soft pink petals, the outer ones paler.",
   size=(54, 42), habit='clump', stem_col=[(0, '#4a5030'), (1, '#5a6a3a')],
   leaves=dict(stem=dict(kind='compound', pairs=2, leaflet_len=0.4, terminal=1.1, col='#2e5a2a', leaflet=dict(shape='ovate', aspect=0.6, col='#2e5a2a', tip='#386630', teeth=(16, 0.05), veins=('pinnate', 6, 0.8)))),
   stems=dict(n=(11, 14), h=(0.75, 1.0), lean=(0.2, 0.75), droop=(0.2, 0.6), r=(0.006, 0.0035), r0=(0.02, 0.15), leaves=dict(n=(6, 8), L=(0.1, 0.14), f=(0.15, 0.92), pitch=(0.2, 0.7), lo=0.35),
              heads=dict(at='tip+side', n=(1, 2), f=(0.65, 0.9), len=(0.06, 0.12), s=(0.8, 1.0), up=0.45, out=0.3)),
   head=lambda fl, ctx: _rose(fl))

def _rose(fl):
    outer = fl.petal('outer', 'obovate', '#f0b0c0', '#f6c8d2', '#f8d8e0', w=64, h=80, veins=4); inner = fl.petal('inner', 'obovate', '#e88aa0', '#f2a2b4', None, w=64, h=80, veins=3)
    def build(qh):
        rg = np.random.default_rng(8); g = Geo()
        rows = [(5, 0.042, 0.95, 0.35, outer), (7, 0.036, 1.15, 0.6, outer), (8, 0.03, 1.3, 0.8, inner), (8, 0.022, 1.45, 0.9, inner), (6, 0.015, 1.55, 1.0, inner)]
        for k, (n, L, pitch, cup, rect) in enumerate(rows if qh >= 1 else rows[:3]):
            for i in range(n if qh >= 1 else max(4, n // 2)):
                a = (i + k * 0.37) / n * TAU + rg.normal(0, 0.1)
                pg = ribbon(L, L * 1.05, rect, nu=4 if qh >= 1 else 2, nv=3, bend=-0.5 - 0.2 * k, bend_pow=1.0, cup=cup, ripple=0.05, seed=int(rg.integers(1e6)))
                g.put(place(pg, [math.cos(a) * 0.004 * (1 - k / 5), math.sin(a) * 0.004 * (1 - k / 5), 0.002 * k], heading(a, pitch), up=(0, 0, 1)))
        return g
    return build

# ----------------------------------------------------------------- particular flowers
sp('aquilegia', doc="Wild columbine (Aquilegia canadensis): a loose mound of blue-green leaves divided into round-lobed leaflets; wiry branched stalks with nodding flowers 3-4 cm, five long red spurs and red sepals over yellow petal blades, a tassel of yellow stamens hanging below.",
   size=(30, 15), habit='mound', stem_col=[(0, '#5a5a48'), (1, '#6a5a4a')],
   leaves=dict(basal=dict(kind='ternate', levels=2, leaflet_len=0.5, col='#5e8070', leaflet=dict(kind='plate', lobes=3, depth=0.45, nteeth=9, tooth=0.15, col='#5e8070', mid='#6a8a78', nveins=3, cup=0.2, droop=0.1), rachis='#6a6a50')),
   mound=dict(n=(10, 14), L=(0.14, 0.2), top=0.5, flat=0.6, stalk_r=0.0016),
   flowers=dict(n=(5, 7), h=(0.85, 1.0), out=(0.0, 0.6), flat=0.3, r=0.0012, droop=0.2, up=-0.8, branch=(2, 4), blen=(0.04, 0.09)),
   head=lambda fl, ctx: _columbine(fl))

def _columbine(fl):
    spur = fl.ramp('spur', [(0, '#e8a030'), (0.3, '#d83a20'), (1, '#c02818')]); sep = fl.petal('sepal', 'lance', '#d83a20', '#e04a28', '#c8a030', w=32, h=64)
    blade = fl.petal('blade', 'obovate', '#f2d24a', '#f6dc5a', None, w=32, h=48); st = fl.ramp('stam', [(0, '#e8d050'), (1, '#f2e060')], w=8, h=32)
    def build(qh):
        g = Geo(); rg = np.random.default_rng(2)
        for i in range(5):   # the head points down (+Z down along the nodding stalk): spurs rise back up behind, the mouth faces down
            a = i / 5 * TAU; o = np.array([math.cos(a), math.sin(a), 0])
            pts = np.array([o * 0.004 + [0, 0, 0.004], o * 0.006 + [0, 0, -0.006], o * 0.0055 + [0, 0, -0.016], o * 0.004 + [0, 0, -0.022]])
            g.put(tube(pts, np.array([0.003, 0.0026, 0.0014, 0.0011]), spur, sides=5 if qh >= 1 else 3))
            g.put(place(ribbon(0.012, 0.004, blade, nu=2, nv=2, bend=-0.1), o * 0.003 + [0, 0, 0.004], unit(o * 0.25 + [0, 0, 1.0])))
            a2 = a + TAU / 10; o2 = np.array([math.cos(a2), math.sin(a2), 0])
            g.put(place(ribbon(0.016, 0.006, sep, nu=3 if qh >= 1 else 2, nv=2, bend=-0.3), o2 * 0.004 + [0, 0, 0.002], unit(o2 + [0, 0, 0.4])))
        if qh >= 1: g.put(tube(np.array([[0, 0, 0.004], [0, 0, 0.022]]), np.array([0.0012, 0.002]), st, sides=4))
        return g
    return build

sp('irisP', doc="Yellow flag: tall upright fans of broad, sword-shaped grey-green leaves; stems with two or three bright yellow flowers 8-10 cm, three broad falls hanging, veined brown at the throat, three small upright standards.",
   size=(44, 30), habit='grass', stem_col=[(0, '#4a6a48'), (1, '#5a7a50')],
   leaves=dict(blade=dict(kind='strap', col='#4a7048', tip='#5a7a52', width=0.024, nveins=9, fold=0.15, nu=6, wprof=lambda u: np.clip(1 - u ** 3, 0, 1) * np.clip((1 - u) * 5, 0, 1) ** 0.5)),
   blades=dict(n=(18, 24), L=(0.75, 1.0), pitch=(1.15, 1.48), bend=(0.2, 0.7), fan=True, r0=0.06, twist=0.15, lo=0.5),
   culms=dict(n=(3, 5), h=(0.85, 1.0), lean=(0.02, 0.12), droop=(0.0, 0.1), r=(0.004, 0.003), per=(2, 3), blen=(0.03, 0.05), up=0.3),
   head=lambda fl, ctx: _iris(fl))

def _iris(fl):
    fall = fl.petal('fall', 'obovate', '#e8b810', '#f4c418', '#f8d030', w=64, h=96, veins=7, spots=('#7a4a10', 1)); std = fl.petal('std', 'spoon', '#e0b010', '#f0c020', None, w=32, h=64)
    style = fl.petal('style', 'oblong', '#f0c820', '#f4d040', None, w=32, h=48)
    def build(qh):
        g = Geo()
        for i in range(3):
            a = i / 3 * TAU; o = heading(a, 0)
            g.put(place(ribbon(0.06, 0.04, fall, nu=5 if qh >= 1 else 3, nv=3, bend=1.6, bend_pow=1.4, cup=0.3, ripple=0.06), [0, 0, 0.012], heading(a, 0.7)))
            g.put(place(ribbon(0.032, 0.012, std, nu=3, nv=2, bend=-0.3, cup=0.3), [0, 0, 0.014], heading(a + math.pi / 3, 1.25)))
            if qh >= 1: g.put(place(ribbon(0.03, 0.012, style, nu=2, nv=2, bend=0.8, fold=0.6), [0, 0, 0.016], heading(a, 0.5)))
        return g
    return build

sp('typha', doc="Cattail: tall stiff upright strap leaves 1.5 m; stems carrying the brown velvet cylinder 15 cm, a thin spike above it.",
   size=(72, 30), habit='grass', stem_col=[(0, '#5a7a48'), (1, '#6a8a52')],
   leaves=dict(blade=dict(kind='strap', col='#4a7040', tip='#6a8450', width=0.016, nveins=7, fold=0.35, nu=7)),
   blades=dict(n=(24, 32), L=(1.2, 1.7), pitch=(1.25, 1.5), bend=(0.4, 1.2), r0=0.05, twist=0.3, lo=0.4),
   culms=dict(n=(3, 5), h=(0.85, 1.0), lean=(0.0, 0.08), droop=(0.0, 0.05), r=(0.005, 0.004)),
   head=lambda fl, ctx: _cattail(fl))

def _cattail(fl):
    br = fl.ramp('velvet', [(0, '#4a2e18'), (0.5, '#5a381e'), (1, '#4a2e18')], w=64, h=128); sp_ = fl.ramp('spikel', [(0, '#7a6a40'), (1, '#a89a6a')], w=8, h=64)
    def build(qh):
        n = 12 if qh >= 1 else 5; z = np.linspace(0, 0.16, n); r = 0.012 * np.clip(np.sin(np.pi * np.clip(z / 0.16, 0, 1)) ** 0.25, 0.4, 1)
        g = tube(np.stack([np.zeros(n), np.zeros(n), z], 1), r, br, sides=8 if qh >= 1 else 5)
        g.put(tube(np.array([[0, 0, 0.16], [0, 0, 0.3]]), np.array([0.0025, 0.0008]), sp_, sides=4 if qh >= 1 else 3)); return g
    return build

sp('thymus', doc="Creeping thyme: a tight mat of wiry stems and tiny oval leaves; covered in summer with small rounded heads of pinkish-purple flowers.",
   size=(3, 8), habit='clump', stem_col=[(0, '#6a4a3a'), (1, '#7a5a44')],
   leaves=dict(stem=dict(kind='simple', shape='elliptic', aspect=0.6, col='#3e5a34', tip='#4a663c', veins=('pinnate', 2, 0.8), midrib=0.3, mottle=0.06)),
   stems=dict(n=(40, 55), len=(0.06, 0.13), lean=(1.15, 1.45), droop=(-0.3, 0.1), r=(0.0011, 0.0008), r0=(0.0, 0.05), seg=4, leaves=dict(n=(8, 11), arr='opp', L=(0.006, 0.009), f=(0.05, 0.95), pitch=(0.1, 0.5), shrink=0.1, lo=0.4),
              heads=dict(at='tip', up=0.95, jit=0.1)),
   head=umbel_head(0.008, 9, fl_star(4, '#b85aa8', '#c87ab8', 0.0028, shape='round', depth=0.35), dome=0.8, base=('#a04a90', '#c070b0'), base_r=0.8))

# ----------------------------------------------------------------- foliage plants
sp('fern', doc="Ostrich fern: a shuttlecock of upright, arching fronds 80-110 cm, bright green, broadest above the middle and tapering to the foot, cut into many narrow pinnae, each pinna cut again into blunt lobes.",
   size=(44, 30), habit='clump', variants=3, atlas=1024, stem_col=[(0, '#5a7a40'), (1, '#6a8a48')],
   leaves=dict(basal=dict(kind='dissected', npin=28, aspect=0.28, col='#3e7a30', tip='#5a9440', rachis='#6a8a48', pin_ang=0.3, pin_w=0.2, lobes=8, nu=9,
                          prof=lambda t: np.clip(np.sin(np.pi * np.clip(t, 0, 1) ** 1.6) ** 0.7, 0, 1) * 0.95)),
   basal=dict(n=(10, 14), L=(0.8, 1.1), pitch=(1.0, 1.38), r0=(0.02, 0.06), bend=0.9, roll=0.15))

sp('carex', doc="Sedge 'Evergold': a dense, low, arching fountain of narrow evergreen blades, creamy-gold down the middle with dark green edges.",
   size=(12, 18), habit='grass', stem_col=[(0, '#6a7a40'), (1, '#8a9a4a')],
   leaves=dict(blade=dict(kind='strap', col='#d0c870', tip='#e0d890', width=0.007, nveins=3, fold=0.45, margin=('#2e5a22', 0.3), nu=7)),
   blades=dict(n=(110, 140), L=(0.24, 0.34), pitch=(0.6, 1.3), bend=(1.4, 2.4), lo=0.3))

sp('hakonechloa', doc="Japanese forest grass: soft, lax, bright lime-green blades 1 cm wide on thin stems, cascading out and down to one side like a waterfall.",
   size=(14, 24), habit='grass', stem_col=[(0, '#7a8a3a'), (1, '#9aa04a')],
   leaves=dict(blade=dict(kind='strap', col='#8ea030', tip='#a8b848', width=0.01, nveins=5, fold=0.3, nu=7)),
   blades=dict(n=(80, 110), L=(0.2, 0.3), pitch=(0.55, 1.25), bend=(1.5, 2.6), r0=0.05, lo=0.3),
   culms=dict(n=(10, 16), h=(0.8, 1.0), lean=(0.4, 0.9), droop=(0.6, 1.0), r=(0.0012, 0.0009), leaves=dict(n=(2, 3), L=(0.12, 0.18), f=(0.2, 0.8), pitch=(0.2, 0.6), bend=1.4)),
   head=cards_head(0.05, 0.025, lambda t: np.clip(np.sin(np.pi * t), 0, 1), [(0, '#a8a060'), (1, '#c0b890')], el='branches', size=0.05, density=0.6, cards=2))

# ----------------------------------------------------------------- grasses with plumes
def plume(L, W, prof, stops, el='branches', size=0.035, density=1.0, cards=3, bend=0.25, upward=0.0):
    return cards_head(L, W, prof, stops, el=el, size=size, density=density, cards=cards, bend=bend, upward=upward, px=(120, 384))

sp('sporobolus', doc="Prairie dropseed: a fine dense fountain of very narrow bright green blades arching to the ground; an airy haze of open pinkish-buff panicles well above the leaves.",
   size=(30, 30), habit='grass', atlas=1024, stem_col=[(0, '#8a8a5a'), (1, '#b0a07a')],
   leaves=dict(blade=dict(kind='strap', col='#4a6a2c', tip='#6a8a3c', width=0.0026, nveins=2, fold=0.3, nu=8, px=24),
               old=dict(kind='strap', col='#7a7a40', tip='#a89a60', width=0.0026, nveins=2, fold=0.3, nu=8, px=24)),
   blades=dict(n=(190, 240), leaf2='old', p2=0.08, L=(0.3, 0.48), pitch=(0.75, 1.45), bend=(1.4, 2.4), lo=0.25),
   culms=dict(n=(22, 32), h=(0.72, 0.95), lean=(0.15, 0.55), droop=(0.2, 0.6), r=(0.0009, 0.0006)),
   head=plume(0.17, 0.08, lambda t: np.clip(np.sin(np.pi * np.clip(t, 0, 1) ** 0.7) * 0.95, 0, 1), [(0, '#9a8a6a'), (0.5, '#c4a890'), (1, '#d8bca8')], size=0.028, density=1.6, bend=0.5, upward=0.2))

sp('deschampsia', doc="Tufted hair grass: a low dense tussock of fine dark green blades; above it a shimmering cloud of tiny-flowered open panicles on thin stems, gold to tan.",
   size=(30, 22), habit='grass', atlas=1024, stem_col=[(0, '#8a8a5a'), (1, '#b8a070')],
   leaves=dict(blade=dict(kind='strap', col='#2e5224', tip='#44662e', width=0.003, nveins=2, fold=0.5, nu=6, px=24)),
   blades=dict(n=(110, 140), L=(0.18, 0.3), pitch=(0.7, 1.4), bend=(1.2, 2.2), lo=0.3),
   culms=dict(n=(30, 40), h=(0.75, 1.0), lean=(0.1, 0.5), droop=(0.1, 0.45), r=(0.0008, 0.0006)),
   head=plume(0.28, 0.2, lambda t: np.clip(np.sin(np.pi * np.clip(t, 0, 1) ** 0.8), 0, 1), [(0, '#a8905a'), (0.5, '#cdb27c'), (1, '#dcc490')], size=0.022, density=1.8, bend=0.4, upward=0.25))

sp('calamagrostis', doc="Feather reed grass 'Karl Foerster': an upright clump of arching green blades; dense ranks of stiff vertical stems with narrow feathery plumes 20-30 cm, wheat-coloured.",
   size=(48, 24), habit='grass', atlas=1024, stem_col=[(0, '#8a8a5a'), (1, '#c0a874')],
   leaves=dict(blade=dict(kind='strap', col='#466a34', tip='#5a7a40', width=0.007, nveins=4, fold=0.4, nu=7)),
   blades=dict(n=(90, 120), L=(0.4, 0.6), pitch=(1.05, 1.45), bend=(0.8, 1.6), r0=0.05, lo=0.3),
   culms=dict(n=(36, 46), h=(0.85, 1.0), lean=(0.0, 0.12), droop=(0.0, 0.08), r=(0.0016, 0.0011), r0=0.06),
   head=plume(0.28, 0.03, lambda t: np.clip(0.55 + 0.45 * np.sin(np.pi * np.clip(t, 0, 1) ** 0.7) - (t > 0.85) * (t - 0.85) * 3, 0, 1), [(0, '#a89060'), (0.5, '#c9b07a'), (1, '#d8c08c')], el='beads', size=0.05, density=2.2, bend=0.03, upward=0.8))

sp('molinia', doc="Purple moor grass 'Skyracer': a low dense tuft of fine blades; very tall, thin, upright stems 1.5-1.8 m with narrow airy panicles, purplish turning straw.",
   size=(72, 26), habit='grass', atlas=1024, stem_col=[(0, '#8a8a5a'), (1, '#b8a678')],
   leaves=dict(blade=dict(kind='strap', col='#4a6a34', tip='#5c7a40', width=0.006, nveins=4, fold=0.4, nu=6)),
   blades=dict(n=(80, 100), L=(0.32, 0.45), pitch=(0.8, 1.4), bend=(1.0, 2.0), lo=0.3),
   culms=dict(n=(24, 32), h=(0.85, 1.0), lean=(0.05, 0.3), droop=(0.05, 0.3), r=(0.0014, 0.0009)),
   head=plume(0.32, 0.07, lambda t: np.clip(np.sin(np.pi * np.clip(t, 0, 1) ** 0.6) * 0.9, 0, 1), [(0, '#5a4a52'), (0.5, '#7a6a6a'), (1, '#9a8a6a')], size=0.03, density=1.4, bend=0.15, upward=0.5))

sp('panicum', doc="Switchgrass: an upright vase of stiff blue-green blades; open, airy, branching panicles 30-40 cm across the top, reddish-tan.",
   size=(54, 27), habit='grass', atlas=1024, stem_col=[(0, '#6a8a7a'), (1, '#8a9a7a')],
   leaves=dict(blade=dict(kind='strap', col='#58786c', tip='#6a8a7a', width=0.009, nveins=5, fold=0.35, nu=7)),
   blades=dict(n=(90, 120), L=(0.45, 0.65), pitch=(1.0, 1.45), bend=(0.6, 1.4), r0=0.05, lo=0.3),
   culms=dict(n=(22, 30), h=(0.85, 1.0), lean=(0.02, 0.25), droop=(0.0, 0.15), r=(0.0022, 0.0015), leaves=dict(n=(3, 4), L=(0.2, 0.3), f=(0.1, 0.7), pitch=(0.6, 1.1), bend=0.8)),
   head=plume(0.34, 0.24, lambda t: np.clip(np.sin(np.pi * np.clip(t, 0, 1) ** 0.65), 0, 1), [(0, '#8a6a4a'), (0.5, '#b08a6a'), (1, '#c4a080')], size=0.026, density=1.4, bend=0.2, upward=0.3))

sp('schizachyrium', doc="Little bluestem: a narrow upright clump of blue-green blades flushed red-purple; thin stems with small fluffy silvery-white tufts along their upper part.",
   size=(36, 21), habit='grass', atlas=1024, stem_col=[(0, '#7a6a5a'), (1, '#9a7a6a')],
   leaves=dict(blade=dict(kind='strap', col='#5a7a84', tip='#8a6a6a', width=0.004, nveins=3, fold=0.5, nu=6)),
   blades=dict(n=(100, 130), L=(0.35, 0.5), pitch=(1.15, 1.48), bend=(0.4, 1.0), r0=0.04, lo=0.3),
   culms=dict(n=(24, 32), h=(0.85, 1.0), lean=(0.02, 0.2), droop=(0.0, 0.15), r=(0.0011, 0.0008), r0=0.04),
   head=plume(0.2, 0.04, lambda t: np.clip(0.8 * np.sin(np.pi * np.clip(t, 0, 1)) ** 0.5, 0, 1), [(0, '#b8a898'), (1, '#e0d8d0')], el='beads', size=0.06, density=1.0, bend=0.1, upward=0.6))

sp('miscanthus', doc="Maiden grass: a big fountain of long narrow arching blades, a white stripe down each midrib; tall stems with fans of silky plumes, rosy-silver turning buff.",
   size=(78, 54), habit='grass', atlas=1024, stem_col=[(0, '#8a8a5a'), (1, '#b0a07a')],
   leaves=dict(blade=dict(kind='strap', col='#4a6a3a', tip='#5a7a44', width=0.008, nveins=4, fold=0.35, stripes=('#d8dcc0', 0.1), nu=8)),
   blades=dict(n=(130, 170), L=(0.8, 1.1), pitch=(0.9, 1.45), bend=(1.4, 2.4), r0=0.08, lo=0.25),
   culms=dict(n=(18, 26), h=(0.85, 1.0), lean=(0.02, 0.3), droop=(0.05, 0.3), r=(0.003, 0.002), leaves=dict(n=(3, 5), L=(0.4, 0.6), f=(0.1, 0.6), pitch=(0.6, 1.1), bend=1.5)),
   head=plume(0.26, 0.14, lambda t: np.clip(0.4 + 0.6 * np.sin(np.pi * np.clip(t, 0, 1) ** 0.6), 0, 1), [(0, '#a08070'), (0.5, '#c8a8a0'), (1, '#e0ccc4')], size=0.03, density=1.5, bend=0.5, upward=0.6))

sp('rodgersia', doc="Rodgersia: a bold mound of huge leaves, five to seven toothed leaflets like a horse chestnut's, bronzed; tall reddish stems with fluffy branched plumes of creamy flowers.",
   size=(48, 44), habit='mound', stem_col=[(0, '#5a3a2a'), (1, '#6a4a34')],
   leaves=dict(basal=dict(kind='digitate', n=7, col='#3a5228', leaflet=dict(shape='obovate', aspect=0.38, col='#3a5228', tip='#5a5a30', teeth=(18, 0.05), veins=('pinnate', 9, 0.6)))),
   mound=dict(n=(9, 12), L=(0.4, 0.5), top=0.55, flat=0.55, stalk_r=0.006, tilt=(-0.1, 0.25)),
   flowers=dict(n=(3, 5), h=(0.9, 1.0), out=(0.0, 0.5), flat=0.2, r=0.004, droop=0.1, up=0.9, out_face=0.1),
   head=plume(0.3, 0.16, lambda t: np.clip(np.sin(np.pi * np.clip(t, 0, 1) ** 0.8), 0, 1), [(0, '#d8c0a8'), (1, '#f0e0d0')], el='branches', size=0.04, density=1.3, bend=0.1, upward=0.4))

sp('alchemilla', doc="Lady's mantle: a soft mound of round, pleated, softly hairy leaves 8-15 cm across, shallowly lobed and finely toothed, pale grey-green; frothy sprays of tiny star-shaped chartreuse flowers arching over and among them.",
   size=(15, 24), habit='mound', stem_col=[(0, '#7a8a5a'), (1, '#8a9a62')],
   leaves=dict(basal=dict(kind='plate', lobes=9, depth=0.08, nteeth=60, tooth=0.04, sinus=0.35, col='#7a9058', edge='#8aa064', mid='#6a8250', nveins=9, cup=0.35, droop=0.1, ripple=0.18, mottle=0.1)),
   mound=dict(n=(40, 55), L=(0.1, 0.15), top=0.65, flat=0.75, stalk_r=0.0022, tilt=(-0.25, 0.2)),
   flowers=dict(n=(16, 24), h=(0.9, 1.05), out=(0.2, 1.0), flat=0.5, r=0.0012, droop=0.5, up=0.7),
   head=lambda fl, ctx: _froth(fl, '#bcc232', '#d6dc50', 0.04, 90, 0.0022))

def _froth(fl, c_in, c_out, R, n, fs):
    star = fl.flower('star', n=4, shape='star', c_in=c_in, c_out=c_out, depth=0.6, px=32); pr = fl.ramp('ped', [(0, '#9aa050'), (1, '#a8b058')], w=8, h=48)
    cl = fl.at.region(64, 64); paint_brush(fl.at, cl, lambda t: np.clip(np.sin(np.pi * t) ** 0.5, 0, 1), [(0, c_in), (1, c_out)], el='dots', size=0.1, density=0.9, seed=31)
    def floret(s, rg, q): return plate(fs * s, star, nr=1, ns=5 if q >= 1 else 4, cup=0.2)
    def build(qh):
        rg = np.random.default_rng(3); g = Geo(); nb = 7 if qh >= 1 else 4
        for b in range(nb):   # a loose spray: branches, each ending in a cluster drawn as a card of tiny flowers with a few in relief
            a = b / nb * TAU + rg.normal(0, 0.3); d = unit(heading(a, rg.uniform(0.4, 1.0))); L = R * rg.uniform(0.6, 1.0); tip = d * L
            g.put(tube(np.array([[0, 0, 0], tip * 0.5 + [0, 0, L * 0.15], tip]), 0.0005, pr, sides=3))
            g.put(plate(R * 0.42, cl, nr=1, ns=7 if qh >= 1 else 5, cup=-0.3), None, tip)
            if qh >= 1 and b % 2 == 0: g.put(h_umbel(qh, R * 0.4, floret, n // nb, rg, dome=0.5), None, tip)
        return g
    return build
