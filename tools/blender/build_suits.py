#!/usr/bin/env python3
"""Other suits to wear in Garden of Delight, made from NASA's free models (github.com/nasa/NASA-3D-Resources, "3D Models").

    python3 tools/blender/build_suits.py [id ...]        (bpy as a module)   or   blender -b -P tools/blender/build_suits.py -- [id ...]

Reads the models from $SUIT_SRC (default ../models/plain beside the repo): NASA's .glb files with their Draco compression
undone (tools/undraco.mjs does that; Blender's importer needs its Draco library, which the bpy module lacks), named with
underscores for spaces. Writes assets/models/suit_<id>.json (glTF) and blender/suit_<id>.blend for working on by hand.

The body in the web app (src/body.js) is not a skinned mesh. It is fifteen rigid parts, each a mesh named for its part with its
origin at the joint it turns about, standing with arms and legs straight down, painted in vertex colours whose alpha names the
surface. A NASA model is one mesh in whatever pose it was drawn. So, for each suit:

  1. Stand it up: turn it to face -Y, scale it so the visor's middle is at eye height, centre it over its legs.
  2. Cut it: every face goes to the part whose bone it is nearest (a capsule round each bone, sized per suit), with a few plain
     rules on top (helmet and boots by material or height). The joints are set by eye from orthographic views, per suit, below.
  3. Straighten it: each limb segment is turned about its joint until its bone points straight down, and hung from where the
     skeleton at rest puts that joint. Left and right are made the same lengths, because the walk assumes it.
  4. Close the joints: a ball at each one, so a bent elbow or knee shows cloth and not the hollow inside of a sleeve.
  5. Repaint it in the suit's five colours (shell, trim, accent, visor, glow: the same flat colours the first suit is painted in,
     so an outfit recolours it in the shader), keeping any other colour as it is. The suit's own colours go in src/outfits.js as
     its outfit "as built". NASA's insignia and wordmark are not carried over (they have their own rules of use).
  6. Thin it to about thirty thousand triangles, and give it the first suit's gloves, whose fingers the app knows how to move.
"""
import bpy, bmesh, numpy as np, json, base64, math, os, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.environ.get('SUIT_SRC', os.path.abspath(os.path.join(ROOT, '..', 'models', 'plain')))
DEBUG = os.environ.get('SUIT_DEBUG')            # a folder: write each stage's mesh there for looking at

KEY = dict(suit=(0.80, 0.82, 0.86, 1.0), trim=(0.34, 0.37, 0.43, 1.0), accent=(1.0, 0.30, 0.035, 1.0), visor=(0.95, 0.56, 0.10, 0.8),
           glow=(0.25, 0.95, 1.0, 0.6), dark=(0.055, 0.06, 0.075, 0.4), metal=(0.55, 0.59, 0.66, 0.8))
PARTS = ['pelvis', 'torso', 'head', 'armU_L', 'armL_L', 'hand_L', 'armU_R', 'armL_R', 'hand_R', 'thigh_L', 'shin_L', 'foot_L', 'thigh_R', 'shin_R', 'foot_R']
PI = {n: i for i, n in enumerate(PARTS)}

# Per suit. Lengths in metres in the stood-up model: x the wearer's left, -y the front, z up.
#   J: joints (left side; the right is the mirror unless JR gives its own, for a model drawn lopsided)
#   R: capsule radius per bone, for the cut.  roles: material index -> one of KEY, or (r, g, b, class) to keep a colour, or None to drop.
SUITS = {
    'aces': dict(src='Advanced_Crew_Escape_Suit', rot=180, visor=[6], name='ACES',
        J=dict(pelvis=(0, 0, 0.93), torso=(0, 0, 1.05), head=(0, 0, 1.52), armU=(0.215, 0.0, 1.40), armL=(0.345, 0.0, 1.23), hand=(0.333, -0.224, 1.089), tip=(0.31, -0.36, 0.97),
               thigh=(0.10, 0.0, 0.86), shin=(0.11, 0.0, 0.50), foot=(0.115, 0.02, 0.11), toe=(0.13, -0.25, 0.03)),
        R=dict(pelvis=0.22, torso=0.24, armU=0.095, armL=0.11, hand=0.13, thigh=0.115, shin=0.10, foot=0.09),
        head_mats=[4, 5, 6, 7], hand_mats=[13], foot_z=0.185, shoulder_out=0.04, arm_x=0.235, ball_r=dict(armL=0.062, armU=0.075), thin={7: 0.05, 5: 0.5, 4: 0.6},
        roles={9: 'suit', 10: 'trim', 8: 'accent', 6: 'visor', 0: (0.90, 0.90, 0.88, 1.0), 4: (0.92, 0.92, 0.90, 1.0), 5: (0.92, 0.92, 0.90, 1.0), 7: (0.42, 0.44, 0.48, 0.8),
               12: (0.50, 0.51, 0.53, 1.0), 11: 'dark', 2: 'dark', 1: 'dark', 3: 'metal', 13: None},
        ball=dict(armU='suit', armL='suit', thigh='suit', shin='suit', foot='dark')),
    'mark3': dict(src='Mark_III_Spacesuit', rot=180, visor=[4], name='Mark III', shift=(0.02, 0.06), twist=11, upper_shift=(-0.027, 0.0),
        J=dict(pelvis=(0, 0, 0.93), torso=(0, 0, 1.13), head=(0, 0, 1.50), armU=(0.27, -0.14, 1.38), armL=(0.37, -0.36, 1.27), hand=(0.30, -0.64, 1.085), tip=(0.24, -0.74, 0.97),
               thigh=(0.17, 0.0, 0.84), shin=(0.17, 0.0, 0.50), foot=(0.18, 0.0, 0.14), toe=(0.19, -0.33, 0.03)),
        JR=dict(armU=(-0.25, -0.04, 1.38), armL=(-0.53, -0.27, 1.30), hand=(-0.555, -0.455, 1.065), tip=(-0.52, -0.55, 0.96)),
        R=dict(pelvis=0.3, torso=0.3, armU=0.13, armL=0.13, hand=0.14, thigh=0.13, shin=0.11, foot=0.1),
        head_ball=(0.0, -0.03, 1.67, 0.27), head_z=1.46, foot_mats=[7, 8], crotch=0.78, arm_x=0.2, shoulder_out=0.08,
        force={2: 'torso', 3: 'torso', 0: 'thigh', 1: 'thigh', 13: 'pelvis', 10: 'shin'},
        roles={5: 'suit', 9: 'suit', 13: 'suit', 11: 'suit', 6: None, 2: 'trim', 3: 'trim', 1: 'trim', 0: 'metal', 4: 'visor', 7: 'dark', 8: (0.30, 0.31, 0.33, 0.4), 10: 'accent', 12: 'accent'},
        ball=dict(armU='trim', armL='suit', thigh='trim', shin='suit', foot='dark')),    # Mercury and Gemini are the same figure in different dress: one set of joints serves both
    'mercury': dict(src='Mercury_Spacesuit', rot=180, visor=[13], name='Mercury',
        J=dict(pelvis=(0, 0, 0.91), torso=(0, 0, 1.02), head=(0, 0, 1.51), armU=(0.18, 0.02, 1.41), armL=(0.30, 0.03, 1.16), hand=(0.405, 0.045, 0.94), tip=(0.42, 0.03, 0.77),
               thigh=(0.105, 0.0, 0.87), shin=(0.105, 0.0, 0.475), foot=(0.115, 0.02, 0.11), toe=(0.13, -0.2, 0.03)),
        JR=dict(armU=(-0.18, -0.04, 1.41), armL=(-0.30, -0.09, 1.16), hand=(-0.40, -0.17, 0.94), tip=(-0.42, -0.23, 0.76)),
        R=dict(pelvis=0.2, torso=0.22, armU=0.11, armL=0.125, hand=0.13, thigh=0.11, shin=0.09, foot=0.09), shift=(0.02, 0.0), twist=-11, arm_med=0.075,
        head_mats=[9, 12, 13, 14, 4], foot_z=0.2, arm_x=0.15,
        roles={15: 'suit', 3: 'trim', 1: 'accent', 13: 'visor', 0: (0.90, 0.90, 0.88, 1.0), 9: (0.90, 0.90, 0.88, 1.0), 2: 'metal', 4: 'metal', 14: 'metal', 10: (0.62, 0.64, 0.68, 0.8),
               5: 'dark', 6: 'dark', 7: 'dark', 8: 'metal', 11: 'metal', 12: 'dark', 16: 'dark'},
        ball=dict(armU='suit', armL='suit', thigh='suit', shin='suit', foot='suit')),
    'gemini': dict(src='Gemini_Spacesuit', rot=180, visor=[3], name='Gemini',
        J=dict(pelvis=(0, 0, 0.91), torso=(0, 0, 1.02), head=(0, 0, 1.51), armU=(0.18, 0.02, 1.41), armL=(0.30, 0.03, 1.16), hand=(0.405, 0.045, 0.94), tip=(0.42, 0.03, 0.77),
               thigh=(0.105, 0.0, 0.87), shin=(0.105, 0.0, 0.475), foot=(0.115, 0.02, 0.11), toe=(0.13, -0.2, 0.03)),
        JR=dict(armU=(-0.18, -0.04, 1.41), armL=(-0.30, -0.09, 1.16), hand=(-0.40, -0.17, 0.94), tip=(-0.42, -0.23, 0.76)),
        R=dict(pelvis=0.2, torso=0.22, armU=0.11, armL=0.125, hand=0.13, thigh=0.11, shin=0.09, foot=0.09), shift=(0.02, 0.0), twist=-11, arm_med=0.075,
        head_mats=[0, 3, 4, 13], foot_z=0.2, arm_x=0.15, drop=[(0.1, -0.7, 0.3, 0.6, -0.2, 0.62)],
        roles={10: 'suit', 15: 'trim', 5: 'accent', 4: 'accent', 7: 'accent', 14: 'accent', 3: 'visor', 0: (0.90, 0.90, 0.88, 1.0), 2: (0.62, 0.64, 0.68, 0.8), 6: 'metal', 13: 'metal',
               1: 'dark', 8: (0.60, 0.61, 0.62, 1.0), 9: (0.60, 0.61, 0.62, 1.0), 11: None, 12: None, 16: 'dark', 17: 'dark'},
        ball=dict(armU='suit', armL='suit', thigh='suit', shin='suit', foot='suit')),    'eva': dict(src='Astronaut', rot=0, visor=[1], name='EVA suit', pre=0.0269, shift=(0.0, 0.13),
        J=dict(pelvis=(0, 0, 0.93), torso=(0, 0, 1.04), head=(0, 0, 1.505), armU=(0.28, -0.03, 1.385), armL=(0.50, -0.03, 1.36), hand=(0.72, -0.03, 1.31), tip=(0.87, -0.03, 1.27),
               thigh=(0.10, 0.0, 0.86), shin=(0.12, 0.0, 0.485), foot=(0.13, 0.03, 0.11), toe=(0.14, -0.2, 0.03)),
        R=dict(pelvis=0.22, torso=0.24, armU=0.16, armL=0.15, hand=0.16, thigh=0.12, shin=0.10, foot=0.1),
        head_ball=(0.0, -0.04, 1.68, 0.2), head_z=1.5, foot_z=0.17, arm_x=0.27, pack_y=0.16, shoulder_out=0.05, crotch=0.80,
        roles={0: 'paint', 1: 'visor'}, paint=dict(),
        ball=dict(armU='suit', armL='suit', thigh='suit', shin='suit', foot='suit')),
    'z2': dict(src='Z2_Spacesuit', rot=0, eye=0.887, name='Z-2',
        J=dict(pelvis=(0, 0, 0.90), torso=(0, 0, 0.99), head=(0, 0, 1.45), armU=(0.27, -0.15, 1.37), armL=(0.33, -0.36, 1.22), hand=(0.29, -0.52, 1.10), tip=(0.27, -0.63, 1.03),
               thigh=(0.12, 0.0, 0.90), shin=(0.12, 0.0, 0.485), foot=(0.126, 0.02, 0.125), toe=(0.14, -0.22, 0.03)),
        R=dict(pelvis=0.25, torso=0.28, armU=0.13, armL=0.14, hand=0.17, thigh=0.13, shin=0.11, foot=0.1),
        head_ball=(0.0, -0.15, 1.67, 0.25), head_z=1.45, foot_z=0.195, arm_x=0.2, crotch=0.84, shoulder_out=0.06,
        roles={0: 'paint'}, paint=dict(visor=(0.0, -0.2, 1.67, 0.3), dark=0.012, trim=0.05),
        ball=dict(armU='suit', armL='suit', thigh='suit', shin='suit', foot='dark')),
}

# ---------------------------------------------------------------- reading
def read_glb(path):
    """The model as one triangle soup in world space: vertices, faces, each face's material, and (for materials painted with a
    picture) each face's colour in that picture, linear, or NaN."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    V, F, M, TC, off, nm = [], [], [], [], 0, 0
    def pixels(im):
        px = np.empty(im.size[0] * im.size[1] * 4, dtype=np.float32); im.pixels.foreach_get(px); return px.reshape(im.size[1], im.size[0], 4)[..., :3]
    cache = {}
    for o in [o for o in bpy.data.objects if o.type == 'MESH']:
        me = o.data; me.calc_loop_triangles(); mw = np.array(o.matrix_world)
        v = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', v); v = v.reshape(-1, 3) @ mw[:3, :3].T + mw[:3, 3]
        t = np.empty(len(me.loop_triangles) * 3, dtype=np.int64); me.loop_triangles.foreach_get('vertices', t)
        tl = np.empty(len(me.loop_triangles) * 3, dtype=np.int64); me.loop_triangles.foreach_get('loops', tl)
        mi = np.empty(len(me.loop_triangles), dtype=np.int64); me.loop_triangles.foreach_get('material_index', mi)
        tc = np.full((len(mi), 3), np.nan)
        if me.uv_layers:
            uv = np.empty(len(me.loops) * 2); me.uv_layers[0].data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)[tl].reshape(-1, 3, 2)
            for k, m in enumerate(me.materials):
                img = None
                if m and m.node_tree:
                    for n in m.node_tree.nodes:
                        if n.type == 'BSDF_PRINCIPLED' and n.inputs['Base Color'].links:
                            nd = n.inputs['Base Color'].links[0].from_node
                            while nd and nd.type != 'TEX_IMAGE':
                                ins = [i for i in nd.inputs if i.links]; nd = ins[0].links[0].from_node if ins else None
                            if nd and nd.image: img = nd.image
                if img is None or not img.size[0]: continue
                if img.name not in cache: cache[img.name] = pixels(img)
                px = cache[img.name]; sel = np.where(mi == k)[0]; acc = np.zeros((len(sel), 3))
                for w in ((1/3, 1/3, 1/3), (0.6, 0.2, 0.2), (0.2, 0.6, 0.2), (0.2, 0.2, 0.6)):          # four samples a face
                    q = uv[sel, 0] * w[0] + uv[sel, 1] * w[1] + uv[sel, 2] * w[2]
                    acc += px[(np.clip(q[:, 1] % 1.0, 0, 0.9999) * px.shape[0]).astype(int), (np.clip(q[:, 0] % 1.0, 0, 0.9999) * px.shape[1]).astype(int)]
                c = acc / 4; tc[sel] = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)                                  # sRGB picture to linear
        V.append(v); F.append(t.reshape(-1, 3) + off); M.append(mi + nm); TC.append(tc); off += len(v); nm += max(1, len(me.materials))
    return np.concatenate(V), np.concatenate(F), np.concatenate(M), np.concatenate(TC)

def stand(V, F, M, cfg, used=None):
    U = V if used is None else V[used]                                 # what the suit is measured by: its own surface, not a prop drawn beside it
    a = math.radians(cfg.get('rot', 0)); R = np.array([[math.cos(a), -math.sin(a), 0], [math.sin(a), math.cos(a), 0], [0, 0, 1]]); V = V @ R.T
    V = V - [0, 0, U[:, 2].min()]; U = V if used is None else V[used]
    H = U[:, 2].max(); vc = V[np.unique(F[np.isin(M, cfg['visor'])])].mean(0) if cfg.get('visor') else np.array([0, 0, cfg['eye'] * H]); s = cfg.get('scale') or 1.665 / vc[2]
    leg = U[(U[:, 2] > 0.3 * H) & (U[:, 2] < 0.45 * H)]; cx = (leg[:, 0].min() + leg[:, 0].max()) / 2
    hv = U[U[:, 2] > vc[2] - 0.02]; cy = (hv[:, 1].min() + hv[:, 1].max()) / 2 + 0.03 / s
    sh = cfg.get('shift', (0, 0))
    return (V - [cx, cy, 0]) * s + [sh[0], sh[1], 0]

# ---------------------------------------------------------------- cutting
def seg_dist(P, a, b):
    ab = b - a; t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1); return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)

def joints(cfg):
    """Both sides' joints as measured: { 'armU_L': xyz, ... , 'tip_L', 'toe_L' }."""
    J = {}; JL = cfg['J']; JR = cfg.get('JR', {})
    for k in ('pelvis', 'torso', 'head'): J[k] = np.array(JL[k], float)
    for k in ('armU', 'armL', 'hand', 'tip', 'thigh', 'shin', 'foot', 'toe'):
        J[k + '_L'] = np.array(JL[k], float); J[k + '_R'] = np.array(JR[k], float) if k in JR else J[k + '_L'] * [-1, 1, 1]
    return J

def cut(V, F, M, cfg):
    """Which part each face belongs to. First which limb (or the trunk), then where along it."""
    J = joints(cfg); R = cfg['R']; C = V[F].mean(1); side = np.where(C[:, 0] > 0, 0, 1); part = np.full(len(F), PI['torso'])
    unit = lambda v: v / np.linalg.norm(v)
    crotch = cfg.get('crotch', J['thigh_L'][2] - 0.05)
    arm = np.zeros(len(F), bool)
    for si, s in enumerate('LR'):
        sg = 1 if s == 'L' else -1; S, E, W, Tp = J['armU_' + s], J['armL_' + s], J['hand_' + s], J['tip_' + s]
        # the arm: within its capsules, on its own side, and not inside the trunk
        sc = np.minimum(np.minimum(seg_dist(C, S, E) / R['armU'], seg_dist(C, E, W) / R['armL']), seg_dist(C, W, Tp) / R['hand'])
        a = (sc < cfg.get('arm_fit', 1.12)) & (C[:, 0] * sg > cfg.get('arm_x', 0.0))
        if cfg.get('hand_mats'): a |= np.isin(M, cfg['hand_mats']) & (side == si)
        # beyond the shoulder only: the plane through the joint that faces half down the arm and half out to the side, so the cap of the
        # shoulder goes with the arm (and rounds over as the arm comes down) and the top of the shoulder stays with the trunk
        a &= ((C - S) @ unit(unit(E - S) + [sg, 0, 0])) > cfg.get('shoulder_cut', 0.0)
        if cfg.get('arm_med'):                                         # an arm hanging close to the body: nothing further in toward the body than this from the upper arm's axis
            d = unit(E - S); nm = np.array([-sg, 0, 0.0]); nm = unit(nm - (nm @ d) * d); up_ = ((C - E) @ unit(unit(E - S) + unit(W - E))) <= 0
            a &= ~(up_ & (((C - S) @ nm) > cfg['arm_med']))
        arm |= a
        du, dl = unit(E - S), unit(W - E); fore = ((C - E) @ unit(du + dl)) > 0; hand = ((C - W) @ dl) > 0
        if cfg.get('hand_mats'): hand = hand | np.isin(M, cfg['hand_mats'])
        part[a] = np.where(hand[a] & (fore[a] | np.isin(M[a], cfg.get('hand_mats', []))), PI['hand_' + s], np.where(fore[a], PI['armL_' + s], PI['armU_' + s]))
    rest_ = ~arm
    pack = rest_ & (C[:, 1] > cfg['pack_y']) & (C[:, 2] > cfg.get('pack_z', 0.45)) if cfg.get('pack_y') is not None else np.zeros(len(F), bool)   # a pack on the back rides with the chest, all of it
    for si, s in enumerate('LR'):
        H, Kn, A = J['thigh_' + s], J['shin_' + s], J['foot_' + s]
        leg = rest_ & ~pack & (C[:, 2] < crotch) & (side == si)
        low = ((C - Kn) @ unit(unit(Kn - H) + unit(A - Kn))) > 0
        foot = (C[:, 2] < cfg['foot_z']) if cfg.get('foot_z') else np.zeros(len(F), bool)
        if cfg.get('foot_mats'): foot = foot | np.isin(M, cfg['foot_mats'])
        part[leg] = np.where(foot[leg], PI['foot_' + s], np.where(low[leg], PI['shin_' + s], PI['thigh_' + s]))
    trunk = rest_ & ~pack & (C[:, 2] >= crotch)
    part[trunk] = np.where(C[trunk, 2] < J['torso'][2], PI['pelvis'], PI['torso'])
    part[pack] = PI['torso']
    if cfg.get('head_mats'): part[np.isin(M, cfg['head_mats'])] = PI['head']
    if cfg.get('head_ball'):                                           # a helmet that is one piece with the shell behind it: what lies within a ball round the head
        hb = cfg['head_ball']; part[trunk & (np.linalg.norm(C - hb[:3], axis=1) < hb[3]) & (C[:, 2] > cfg.get('head_z', 0))] = PI['head']
    elif cfg.get('head_z'): part[trunk & (C[:, 2] > cfg['head_z'])] = PI['head']
    for mat, to in cfg.get('force', {}).items():
        m = M == mat
        if to in PI: part[m] = PI[to]
        else: part[m] = np.where(side[m] == 0, PI[to + '_L'], PI[to + '_R'])
    # small loose pieces (a buckle, a pocket) go whole to whichever part has most of them
    key = np.round(V * 2e4).astype(np.int64); _, inv = np.unique(key, axis=0, return_inverse=True); inv = inv.ravel(); f = inv[F]
    parent = np.arange(inv.max() + 1)
    def find(x):
        while parent[x] != x: parent[x] = parent[parent[x]]; x = parent[x]
        return x
    for a, b in np.concatenate([f[:, [0, 1]], f[:, [1, 2]]]):
        ra, rb = find(a), find(b)
        if ra != rb: parent[ra] = rb
    comp = np.array([find(x) for x in f[:, 0]]); area = np.linalg.norm(np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]]), axis=1) / 2
    keep_head = part == PI['head']
    for c in np.unique(comp):
        m = comp == c
        if m.sum() > cfg.get('island', 600) or keep_head[m].any(): continue
        ext = V[F[m]].reshape(-1, 3);
        if (ext.max(0) - ext.min(0)).max() > 0.22: continue
        w = np.bincount(part[m], weights=area[m], minlength=len(PARTS)); part[m] = w.argmax()
    return part, J

def rot_to(a, b):
    """The smallest turn that takes direction a to direction b."""
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b); v = np.cross(a, b); c = a @ b; s = np.linalg.norm(v)
    if s < 1e-9: return np.eye(3)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]]); return np.eye(3) + K + K @ K * ((1 - c) / (s * s))

def straighten(V, F, part, J, cfg):
    """Each part's vertices (in the stood-up frame, at rest) and the skeleton at rest. Returns { part: (verts, faces, face index) }, rest joints."""
    DOWN = np.array([0, 0, -1.0]); rest = {k: J[k].copy() for k in ('pelvis', 'torso', 'head')}; out = {}
    # a model drawn with its shoulders turned on its hips is squared up: everything above the waist goes round by cfg['twist'] degrees
    a = math.radians(cfg.get('twist', 0)); Rz = np.array([[math.cos(a), -math.sin(a), 0], [math.sin(a), math.cos(a), 0], [0, 0, 1]]); us = np.array(list(cfg.get('upper_shift', (0, 0))) + [0.0])
    up = lambda p: Rz @ p + us
    def chunk(nm): m = part == PI[nm]; return m
    # lengths the same both sides
    Lu = np.mean([np.linalg.norm(J['armL_' + s] - J['armU_' + s]) for s in 'LR']); Ll = np.mean([np.linalg.norm(J['hand_' + s] - J['armL_' + s]) for s in 'LR'])
    L1 = np.mean([np.linalg.norm(J['shin_' + s] - J['thigh_' + s]) for s in 'LR']); L2 = np.mean([np.linalg.norm(J['foot_' + s] - J['shin_' + s]) for s in 'LR'])
    sx = np.mean([abs(up(J['armU_' + s])[0]) for s in 'LR']) + cfg.get('shoulder_out', 0.0); sy = np.mean([up(J['armU_' + s])[1] for s in 'LR']); sz = np.mean([J['armU_' + s][2] for s in 'LR'])
    hx = np.mean([abs(J['thigh_' + s][0]) for s in 'LR']); ankle = np.mean([J['foot_' + s][2] for s in 'LR'])
    hz = ankle + L1 + L2                                             # hips where straight legs put them
    lift = hz - np.mean([J['thigh_' + s][2] for s in 'LR'])          # ... so everything above rides up by this much
    rest['pelvis'] = rest['pelvis'] + [0, 0, lift]; rest['torso'] = rest['torso'] + [0, 0, lift]; rest['head'] = up(rest['head']) + [0, 0, lift]
    T = {'pelvis': (np.eye(3), np.array([0, 0, lift])), 'torso': (Rz, us + [0, 0, lift]), 'head': (Rz, us + [0, 0, lift])}      # part -> (R, t): x' = R x + t
    for s, sg in (('L', 1), ('R', -1)):
        S = np.array([sg * sx, sy, sz + lift]); E = S + DOWN * Lu; W = E + DOWN * Ll
        H = np.array([sg * hx, 0, hz]); Kn = H + DOWN * L1; A = Kn + DOWN * L2
        rest.update({'armU_' + s: S, 'armL_' + s: E, 'hand_' + s: W, 'thigh_' + s: H, 'shin_' + s: Kn, 'foot_' + s: A})
        for nm, a, b, to in (('armU', 'armU', 'armL', S), ('armL', 'armL', 'hand', E), ('thigh', 'thigh', 'shin', H), ('shin', 'shin', 'foot', Kn)):
            p0 = J[a + '_' + s]; d = J[b + '_' + s] - p0
            if nm.startswith('arm'): Rm = rot_to(Rz @ d, DOWN) @ Rz
            else: Rm = rot_to(d, DOWN)
            T[nm + '_' + s] = (Rm, to - Rm @ p0)
        # the boot: turned about the vertical until it points ahead, its sole on the ground
        p0 = J['foot_' + s]; d = J['toe_' + s] - p0; yaw = math.atan2(d[0], -d[1]); c, sn = math.cos(yaw), math.sin(yaw)   # angle of the toe from straight ahead (-y)
        Rm = np.array([[c, sn, 0], [-sn, c, 0], [0, 0, 1]]); T['foot_' + s] = (Rm, A - Rm @ p0)
    for nm in PARTS:
        if nm.startswith('hand'): continue
        m = part == PI[nm]; idx = np.where(m)[0]
        if not len(idx): continue
        vi, inv = np.unique(F[idx], return_inverse=True); Rm, t = T[nm]
        out[nm] = (V[vi] @ Rm.T + t, inv.reshape(-1, 3), idx)
    for s in 'LR':                                                   # soles on the ground
        if 'foot_' + s in out: v, f, i = out['foot_' + s]; out['foot_' + s] = (v - [0, 0, v[:, 2].min()], f, i)
    return out, rest, T

# ---------------------------------------------------------------- building in Blender
def palette(cfg, M, TC=None, V=None, F=None):
    """The colours this suit is painted in, and which one each face gets (-1: dropped)."""
    pal = []
    def idx(r):
        c = KEY[r] if isinstance(r, str) else tuple(r)
        if c not in pal: pal.append(c)
        return pal.index(c)
    fi = np.full(len(M), -1)
    for m in range(int(M.max()) + 1):
        r = cfg['roles'].get(m, 'suit')
        if r is not None and r != 'paint': fi[M == m] = idx(r)
    tx = cfg.get('paint')
    if tx is not None and TC is not None:
        # a material painted with a picture: each face sorted by its colour there. Bright and unsaturated is the shell, mid grey the trim,
        # very dark the soft parts, anything with real colour the accent (so a flag or a badge becomes a plain patch of the accent colour)
        sel = np.where((np.array([cfg['roles'].get(int(m)) for m in M], dtype=object) == 'paint') & ~np.isnan(TC[:, 0]))[0]; c = TC[sel]
        mx, mn = c.max(1), c.min(1); lum = c @ [0.2126, 0.7152, 0.0722]; sat = (mx - mn) / np.maximum(mx, 1e-4)
        role = np.where((sat > tx.get('sat', 0.45)) & (mx > 0.06), idx('accent'), np.where(lum < tx.get('dark', 0.03), idx('dark'), np.where(lum < tx.get('trim', 0.22), idx('trim'), idx('suit'))))
        if tx.get('visor') and V is not None:                          # dark, and within the visor's ball: the visor
            vb = tx['visor']; Cc = V[F[sel]].mean(1); role = np.where((np.linalg.norm(Cc - vb[:3], axis=1) < vb[3]) & (lum < tx.get('visor_lum', 0.08)), idx('visor'), role)
        # speckle out: a face takes the colour most of its neighbours have
        key = np.round(V[F[sel]] * 2e4).astype(np.int64).reshape(-1, 3); _, inv = np.unique(key, axis=0, return_inverse=True); f = inv.ravel().reshape(-1, 3)
        for _ in range(tx.get('smooth', 2)):
            votes = np.zeros((f.max() + 1, len(pal))); np.add.at(votes, (f.ravel(), np.repeat(role, 3)), 1)
            fv = votes[f].sum(1); fv[np.arange(len(role)), role] += tx.get('stay', 1.5); role = fv.argmax(1)
        fi[sel] = role
    return pal, fi

def mesh_object(name, v, f, mi=None, nslots=0):
    me = bpy.data.meshes.new(name); me.from_pydata(v.tolist(), [], f.tolist()); me.update()
    for _ in range(nslots): me.materials.append(None)
    if mi is not None: me.polygons.foreach_set('material_index', mi.astype(np.int32)); me.update()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob); return ob
def activate(ob):
    for o in bpy.context.scene.objects: o.select_set(False)
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
def thin(ob, ratio):
    activate(ob)
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=2e-5); bm.to_mesh(ob.data); bm.free()
    if ratio < 0.999:
        m = ob.modifiers.new('thin', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = ratio; m.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=m.name)
def paint(ob, pal):
    me = ob.data; n = len(me.polygons); mi = np.empty(n, dtype=np.int32); me.polygons.foreach_get('material_index', mi); lt = np.empty(n, dtype=np.int32); me.polygons.foreach_get('loop_total', lt)
    col = np.repeat(np.array(pal, dtype=np.float32)[np.clip(mi, 0, len(pal) - 1)], lt, axis=0)
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER'); ca.data.foreach_set('color', col.ravel()); me.color_attributes.active_color = ca
    me.materials.clear()
def smooth(ob, sharp=42):
    me = ob.data
    for p in me.polygons: p.use_smooth = True
    try: me.set_sharp_from_angle(angle=math.radians(sharp))
    except Exception: pass
def ball_object(name, c, r, col, seg=20, rings=10, scale=(1, 1, 1)):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    for v in bm.verts: v.co.x = v.co.x * scale[0] + c[0]; v.co.y = v.co.y * scale[1] + c[1]; v.co.z = v.co.z * scale[2] + c[2]
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER'); ca.data.foreach_set('color', np.tile(np.array(col, dtype=np.float32), len(me.loops))); me.color_attributes.active_color = ca
    return ob

def gloves():
    """The first suit's gloves, as { 'hand_L': (verts in Blender axes about the wrist, faces, per-vertex rgba) }."""
    g = json.load(open(os.path.join(ROOT, 'assets', 'models', 'astronaut.json')))
    def acc(i):
        a = g['accessors'][i]; bv = g['bufferViews'][a['bufferView']]; raw = base64.b64decode(g['buffers'][bv['buffer']]['uri'].split(',', 1)[1])
        ct = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}[a['componentType']]; n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        arr = np.frombuffer(raw, dtype=ct, count=a['count'] * n, offset=bv.get('byteOffset', 0) + a.get('byteOffset', 0)).reshape(-1, n).astype(np.float64)
        return arr / (65535 if a.get('normalized') and ct == np.uint16 else 255 if a.get('normalized') and ct == np.uint8 else 1)
    out = {}
    for nm in ('hand_L', 'hand_R'):
        p = [m for m in g['meshes'] if m['name'] == nm][0]['primitives'][0]
        P = acc(p['attributes']['POSITION']); C = acc(p['attributes']['COLOR_0']); I = acc(p['indices']).astype(int).reshape(-1, 3)
        out[nm] = (np.stack([P[:, 0], -P[:, 2], P[:, 1]], 1), I, C)
    return out

def build(sid):
    cfg = SUITS[sid]; print('==', sid)
    V, F, M, TC = read_glb(os.path.join(SRC, cfg['src'] + '.glb'))
    if cfg.get('pre'): V = V * cfg['pre']                              # a model drawn in other units
    keep = np.array([cfg['roles'].get(int(m), 'suit') is not None for m in M]); V = stand(V, F, M, cfg, np.unique(F[keep]))
    pal, fi = palette(cfg, M, TC, V, F); keep &= fi >= 0
    for x0, y0, z0, x1, y1, z1 in cfg.get('drop', []):                 # props drawn with the suit: whatever lies in these boxes goes
        C = V[F].mean(1); keep &= ~((C[:, 0] > x0) & (C[:, 0] < x1) & (C[:, 1] > y0) & (C[:, 1] < y1) & (C[:, 2] > z0) & (C[:, 2] < z1))
    F, M, fi = F[keep], M[keep], fi[keep]
    part, J = cut(V, F, M, cfg)
    chunks, rest, T = straighten(V, F, part, J, cfg)
    if DEBUG:
        os.makedirs(DEBUG, exist_ok=True); vv, ff, pp, cc, o = [], [], [], [], 0
        for nm, (v, f, idx) in chunks.items(): vv.append(v); ff.append(f + o); pp.append(np.full(len(f), PI[nm])); cc.append(np.array(pal)[fi[idx]][:, :3]); o += len(v)
        np.savez_compressed(os.path.join(DEBUG, sid + '_rest.npz'), V=np.concatenate(vv), F=np.concatenate(ff), part=np.concatenate(pp), col=np.concatenate(cc), rest=json.dumps({k: v.tolist() for k, v in rest.items()}))
        np.savez_compressed(os.path.join(DEBUG, sid + '_cut.npz'), V=V, F=F, part=part, col=np.array(pal)[fi][:, :3], rest=json.dumps({k: v.tolist() for k, v in J.items()}))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    total = sum(len(f) for _, f, _ in chunks.values()); budget = cfg.get('budget', 30000); made = []
    # how hard to thin: some materials (a helmet's works, never seen) much harder than the rest
    tk = cfg.get('thin', {}); w = np.ones(len(F));
    for m, k in tk.items(): w[M == m] = k
    base = min(1.0, budget / max(1.0, sum(w[idx].sum() for _, _, idx in chunks.values())))
    for nm in PARTS:
        if nm.startswith('hand'): continue
        v, f, idx = chunks[nm]; obs = []
        for k in sorted(set(w[idx])):                                # one piece per thinning rate, thinned on its own, then joined
            m = w[idx] == k; vi, inv = np.unique(f[m], return_inverse=True)
            ob = mesh_object(nm, v[vi], inv.reshape(-1, 3), fi[idx[m]], len(pal)); thin(ob, min(1.0, base * k)); paint(ob, pal); obs.append(ob)
        if len(obs) > 1:
            for o in bpy.context.scene.objects: o.select_set(o in obs)
            bpy.context.view_layer.objects.active = obs[0]; bpy.ops.object.join()
        ob = obs[0]
        base_nm = nm.split('_')[0]
        if base_nm in cfg.get('ball', {}):                           # the joint this part hangs from, closed with a ball
            r = cfg.get('ball_r', {}).get(base_nm, cfg['R'][base_nm] * 0.78); c = cfg['ball'][base_nm]
            b = ball_object('ball', rest[nm], r, KEY[c] if isinstance(c, str) else c)
            for o in bpy.context.scene.objects: o.select_set(o in (ob, b))
            bpy.context.view_layer.objects.active = ob; bpy.ops.object.join()
        smooth(ob); ob.name = ob.data.name = nm
        j = rest[nm]; ob.data.transform(__import__('mathutils').Matrix.Translation((-j[0], -j[1], -j[2]))); ob.location = j.tolist(); made.append(ob)
        print(f'  {nm:9s} {len(ob.data.polygons):6d} faces   joint {np.round(j, 3)}')
    for nm, (v, f, c) in gloves().items():
        me = bpy.data.meshes.new(nm); me.from_pydata(v.tolist(), [], f.tolist()); me.update()
        li = np.empty(len(me.loops), dtype=np.int32); me.loops.foreach_get('vertex_index', li)
        ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER'); ca.data.foreach_set('color', c[li].astype(np.float32).ravel()); me.color_attributes.active_color = ca
        ob = bpy.data.objects.new(nm, me); bpy.context.scene.collection.objects.link(ob); smooth(ob, 38); ob.location = rest[nm].tolist(); made.append(ob)
    print('  total', sum(len(o.data.polygons) for o in made), 'faces (from', total, ')')
    for o in bpy.context.scene.objects: o.select_set(o in made)
    bpy.context.view_layer.objects.active = made[0]
    want = dict(filepath=os.path.join(ROOT, 'assets', 'models', f'suit_{sid}.gltf'), export_format='GLTF_SEPARATE', use_selection=True, export_apply=True, export_texcoords=False, export_normals=True,
                export_materials='EXPORT', export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_active_vertex_color_when_no_material=True, export_yup=True, export_animations=False, export_cameras=False, export_lights=False)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    bpy.ops.export_scene.gltf(**{k: v for k, v in want.items() if k in props})
    sys.path.insert(0, os.path.join(ROOT, 'tools')); import gltf_embed; gltf_embed.embed(want['filepath'])
    os.makedirs(os.path.join(ROOT, 'blender'), exist_ok=True); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'blender', f'suit_{sid}.blend'), compress=True)

if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    for sid in (args or list(SUITS)): build(sid)
