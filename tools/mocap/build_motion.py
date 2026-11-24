#!/usr/bin/env python3
"""Motion capture for the body in Garden of Delight: walks and runs in many manners, things to do standing, and gestures.

    python3 tools/mocap/build_motion.py            ->  assets/motion.json

Reads BVH files from two free libraries, cloned beside the repo (or point $MOCAP_SRC at the folder holding both):
  cmu-mocap/                              the CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), in B. Hahne's BVH conversion
                                          (github.com/sfd158/cmu-mocap). Free for any use.
  Bandai-Namco-Research-Motiondataset/    (github.com/BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset)
                                          Creative Commons Attribution-NonCommercial 4.0: credit them, and no commercial use.

The body (src/body.js) is fifteen rigid parts on a rig that stands, at rest, with arms and legs straight down. A capture's
skeleton has other bones, other proportions and its own idea of a rest pose (CMU's is a T; Bandai Namco's is not a pose at all).
So nothing is taken from the files' rest poses or local angles. For every frame the skeleton is run forward to world space, and
for each bone that drives a part of the rig a frame of reference is fixed to it ("up the bone, forward, to the wearer's left")
by calibrating once, on a frame where the performer stands (or the T-pose), so that in that pose every part reads "at rest".
What is kept, per frame, in the wearer's own frame (heading taken out):
  the pelvis (place, as fractions of leg length, and turn), the chest, head, upper arms, forearms and hands (each relative to
  the part it hangs from), and for each leg where the ankle is, how the foot is turned, and which way the knee points.
Legs are kept as ankle targets, not angles, because the rig's legs are another length: the app solves each leg to its target,
which is also what lets a stride be lengthened or shortened to the speed you are actually walking without the feet sliding.

Walks and runs are cut down to one stride, left heel strike to left heel strike, 40 samples, closed into a loop, with the speed
and the stride time they were walked at. Everything else is a clip at 20 frames a second.
"""
import numpy as np, json, base64, os, sys, math, re
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.environ.get('MOCAP_SRC', os.path.abspath(os.path.join(ROOT, '..', 'mocap')))
BN1 = 'Bandai-Namco-Research-Motiondataset/dataset/Bandai-Namco-Research-Motiondataset-1/data/dataset-1_%s_001.bvh'
BN2 = 'Bandai-Namco-Research-Motiondataset/dataset/Bandai-Namco-Research-Motiondataset-2/data/dataset-2_%s_001.bvh'
CMU = 'cmu-mocap/data/%03d/%s.bvh'

# ---------------------------------------------------------------- BVH
def read_bvh(path):
    tok = open(path).read().split(); i = 0; joints = []; stack = []
    while tok[i] != 'MOTION':
        t = tok[i]
        if t in ('ROOT', 'JOINT'):
            joints.append(dict(name=tok[i + 1], parent=stack[-1] if stack else -1, offset=None, ch=[], end=None)); stack.append(len(joints) - 1); i += 2
        elif t == 'End': joints.append(dict(name=joints[stack[-1]]['name'] + '_end', parent=stack[-1], offset=None, ch=[], end=True)); stack.append(len(joints) - 1); i += 2
        elif t == 'OFFSET': joints[stack[-1]]['offset'] = np.array([float(tok[i + 1]), float(tok[i + 2]), float(tok[i + 3])]); i += 4
        elif t == 'CHANNELS': n = int(tok[i + 1]); joints[stack[-1]]['ch'] = tok[i + 2:i + 2 + n]; i += 2 + n
        elif t == '}': stack.pop(); i += 1
        else: i += 1
    nf = int(tok[tok.index('Frames:', i) + 1]); k = tok.index('Time:', i); dt = float(tok[k + 1])
    data = np.array(tok[k + 2:], dtype=np.float64).reshape(nf, -1)
    return joints, data, dt

def rot_axis(a, ax):
    c, s = np.cos(a), np.sin(a); R = np.zeros(a.shape + (3, 3)); R[..., 0, 0] = R[..., 1, 1] = R[..., 2, 2] = 1
    if ax == 'X': R[..., 1, 1] = c; R[..., 1, 2] = -s; R[..., 2, 1] = s; R[..., 2, 2] = c
    elif ax == 'Y': R[..., 0, 0] = c; R[..., 0, 2] = s; R[..., 2, 0] = -s; R[..., 2, 2] = c
    else: R[..., 0, 0] = c; R[..., 0, 1] = -s; R[..., 1, 0] = s; R[..., 1, 1] = c
    return R

def forward(joints, data, rest=False):
    """World rotation (F,3,3) and position (F,3) of every joint. rest: the skeleton as the file defines it, no motion."""
    F = 1 if rest else len(data); Rw = {}; P = {}; col = 0
    for j, J in enumerate(joints):
        n = len(J['ch']); ch = data[:, col:col + n] if not rest else np.zeros((1, n)); col += n
        T = np.tile(J['offset'], (F, 1)); R = np.tile(np.eye(3), (F, 1, 1)); has_pos = False
        for k, c in enumerate(J['ch']):
            if c.endswith('position'): has_pos = True
        if has_pos and not rest: T = np.stack([ch[:, J['ch'].index(a + 'position')] for a in 'XYZ'], 1)
        for k, c in enumerate(J['ch']):
            if c.endswith('rotation'): R = R @ rot_axis(np.radians(ch[:, k]), c[0])
        p = J['parent']
        if p < 0: Rw[j] = R; P[j] = T
        else: Rw[j] = Rw[p] @ R; P[j] = P[p] + np.einsum('fij,fj->fi', Rw[p], T)
    name = {J['name']: j for j, J in enumerate(joints)}
    return {n: Rw[j] for n, j in name.items()}, {n: P[j] for n, j in name.items()}

# which of a library's bones drive the rig: part -> (the bone whose turning it follows, the next joint down it)
MAPS = {
    'bandai': dict(pelvis='Hips', torso='Chest', head='Head', hipL='UpperLeg_L', hipR='UpperLeg_R', shL='UpperArm_L', shR='UpperArm_R',
                   armU=('UpperArm_%s', 'LowerArm_%s'), armL=('LowerArm_%s', 'Hand_%s'), hand=('Hand_%s', None),
                   thigh=('UpperLeg_%s', 'LowerLeg_%s'), shin=('LowerLeg_%s', 'Foot_%s'), foot=('Foot_%s', 'Toes_%s'), sides=dict(L='L', R='R')),
    'cmu': dict(pelvis='Hips', torso='Spine1', head='Head', hipL='LeftUpLeg', hipR='RightUpLeg', shL='LeftArm', shR='RightArm',
                armU=('%sArm', '%sForeArm'), armL=('%sForeArm', '%sHand'), hand=('%sHand', None),
                thigh=('%sUpLeg', '%sLeg'), shin=('%sLeg', '%sFoot'), foot=('%sFoot', '%sToeBase'), sides=dict(L='Left', R='Right')),
}
unit = lambda v: v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-9)
def frame(x=None, y=None, z=None):
    """An orthonormal frame (columns x left, y up, z forward) from two of its axes; the first given is kept exactly."""
    if y is not None and z is not None: y = unit(y); z = unit(z - (z * y).sum(-1, keepdims=True) * y); x = np.cross(y, z)
    elif x is not None and y is not None: x = unit(x); y = unit(y - (y * x).sum(-1, keepdims=True) * x); z = np.cross(x, y)
    return np.stack([x, y, z], -1)
def basis(P, m):
    """The wearer's own frame from the hips: left, up, forward (rows of the returned matrix's transpose)."""
    L = P[m['hipL']] - P[m['hipR']]; L[:, 1] = 0; L = unit(L); U = np.tile([0, 1.0, 0], (len(L), 1)); return L, U, np.cross(L, U)

def calibrate(joints, kind, Rw, P):
    """For each part, the turn from its bone's own axes to the rig's ("left, up the bone, forward"), read off one standing frame."""
    m = MAPS[kind]; L, U, Fw = basis(P, m); C = {}
    def put(part, bone, A): C[part] = (bone, np.swapaxes(Rw[bone], -1, -2)[0] @ A[0])
    put('pelvis', m['pelvis'], frame(x=P[m['hipL']] - P[m['hipR']], y=U))
    put('torso', m['torso'], frame(x=P[m['shL']] - P[m['shR']], y=U))
    put('head', m['head'], np.stack([L, U, Fw], -1))
    for s, S in m['sides'].items():
        for part in ('armU', 'armL', 'thigh', 'shin'):
            b, c = m[part][0] % S, m[part][1] % S; put(part + '_' + s, b, frame(y=P[b] - P[c], z=Fw))
        b = m['hand'][0] % S; a = m['armL'][0] % S; put('hand_' + s, b, frame(y=P[a] - P[b], z=Fw))          # the hand in line with the forearm
        b, c = m['foot'][0] % S, m['foot'][1] % S; d = P[c] - P[b]; d[:, 1] = 0; put('foot_' + s, b, frame(y=U, z=d))
    for s, S in m['sides'].items(): print(f"  calibrating {kind}: {s} upper arm points", np.round(unit(P[m['armU'][1] % S] - P[m['armU'][0] % S])[0], 2), 'thigh', np.round(unit(P[m['thigh'][1] % S] - P[m['thigh'][0] % S])[0], 2), 'forward', np.round(Fw[0], 2), 'left', np.round(L[0], 2))
    leg = np.mean([np.linalg.norm(P[m['thigh'][0] % S] - P[m['thigh'][1] % S]) + np.linalg.norm(P[m['shin'][0] % S] - P[m['shin'][1] % S]) for S in m['sides'].values()])
    return dict(C=C, leg=leg, hipup=P[m['pelvis']][0, 1] - np.mean([P[m['thigh'][0] % S][0, 1] for S in m['sides'].values()]))      # hipup: how far the pelvis joint sits above the hip joints

def smooth(x, sigma):
    if sigma <= 0: return x
    r = int(3 * sigma) + 1; k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2); k /= k.sum()
    pad = np.pad(x, [(r, r)] + [(0, 0)] * (x.ndim - 1), mode='edge'); return np.stack([np.convolve(pad[:, i], k, mode='valid') for i in range(x.shape[1])], 1) if x.ndim > 1 else np.convolve(pad, k, mode='valid')

def quat(R):
    """Rotation matrices (...,3,3) to quaternions (...,4) as x y z w."""
    m = R; t = m[..., 0, 0] + m[..., 1, 1] + m[..., 2, 2]; q = np.zeros(m.shape[:-2] + (4,))
    w = np.sqrt(np.maximum(0, 1 + t)) / 2; x = np.sqrt(np.maximum(0, 1 + m[..., 0, 0] - m[..., 1, 1] - m[..., 2, 2])) / 2
    y = np.sqrt(np.maximum(0, 1 - m[..., 0, 0] + m[..., 1, 1] - m[..., 2, 2])) / 2; z = np.sqrt(np.maximum(0, 1 - m[..., 0, 0] - m[..., 1, 1] + m[..., 2, 2])) / 2
    x = np.copysign(x, m[..., 2, 1] - m[..., 1, 2]); y = np.copysign(y, m[..., 0, 2] - m[..., 2, 0]); z = np.copysign(z, m[..., 1, 0] - m[..., 0, 1])
    q[..., 0], q[..., 1], q[..., 2], q[..., 3] = x, y, z, w; return q / np.linalg.norm(q, axis=-1, keepdims=True)
def untangle(q):
    """Keep each quaternion on the same side as the one before, so they can be averaged and interpolated."""
    q = q.copy()
    for i in range(1, len(q)):
        if (q[i] * q[i - 1]).sum() < 0: q[i] = -q[i]
    return q

PARENT = dict(torso='pelvis', head='torso', armU_L='torso', armL_L='armU_L', hand_L='armL_L', armU_R='torso', armL_R='armU_R', hand_R='armL_R')
ORDER = ['torso', 'head', 'armU_L', 'armL_L', 'hand_L', 'armU_R', 'armL_R', 'hand_R']
NCH = 3 + 4 + 8 * 4 + 2 * (3 + 4 + 3)      # 59 numbers a frame

def retarget(joints, data, dt, kind, cal, travelling, follow=False):
    """Every frame as the rig's numbers (F, 59), with the root's speed along its heading (leg lengths a second)."""
    m = MAPS[kind]; Rw, P = forward(joints, data); F = len(data); C = cal['C']; leg = cal['leg']
    L, U, Fw = basis(P, m); hips = P[m['pelvis']]
    if travelling or follow:      # heading and place follow the walker, smoothed over about a stride so the hips' own swing stays in (standing: over longer)
        k = 1.0 if travelling else 2.2; ang = np.unwrap(np.arctan2(Fw[:, 0], Fw[:, 2])); ang = smooth(ang, 0.6 * k / dt); org = smooth(hips[:, [0, 2]], 0.45 * k / dt)
    else:               # standing: one heading and one place for the whole clip
        ang = np.full(F, np.median(np.unwrap(np.arctan2(Fw[:, 0], Fw[:, 2])))); org = np.tile(np.median(hips[:, [0, 2]], 0), (F, 1))
    Fh = np.stack([np.sin(ang), np.zeros(F), np.cos(ang)], 1); Lh = np.cross(U, Fh); B = np.stack([Lh, U, Fh], 1)      # rows: left, up, forward
    A = {part: np.einsum('fij,fjk,kl->fil', B, Rw[bone], Cb) for part, (bone, Cb) in C.items()}                              # each part's turn, in the wearer's frame
    rel = lambda p: np.einsum('fij,fj->fi', B, p - np.stack([org[:, 0], np.zeros(F), org[:, 1]], 1))
    # the ground, from the feet (the files' own zero is not it), and the height the hips stand at with the legs straight
    ank = {s: P[m['foot'][0] % S] for s, S in m['sides'].items()}; gnd = np.percentile(np.minimum(ank['L'][:, 1], ank['R'][:, 1]), 5); hip0 = gnd + leg + cal['hipup']
    if cal.get('flatfoot'):      # a rest pose that is not a standing one says nothing of how the foot lies: take that from a frame where it is flat on the ground
        C = dict(C)
        for s, S in m['sides'].items():
            b, c = m['foot'][0] % S, m['foot'][1] % S; t = int(np.argmin(P[b][:, 1] + P[c][:, 1] + 0.5 * np.abs(P[b][:, 1] - gnd))); d = P[c][t] - P[b][t]; d[1] = 0
            C['foot_' + s] = (b, Rw[b][t].T @ frame(y=np.array([[0, 1.0, 0]]), z=d[None])[0])
    out = np.zeros((F, NCH)); hp = rel(hips); out[:, 0] = hp[:, 0] / leg; out[:, 1] = (hips[:, 1] - hip0) / leg; out[:, 2] = hp[:, 2] / leg
    out[:, 3:7] = untangle(quat(A['pelvis'])); c = 7
    for part in ORDER:
        out[:, c:c + 4] = untangle(quat(np.swapaxes(A[PARENT[part]], -1, -2) @ A[part])); c += 4
    for s, S in m['sides'].items():
        an = rel(P[m['foot'][0] % S]); out[:, c] = an[:, 0] / leg; out[:, c + 1] = (P[m['foot'][0] % S][:, 1] - gnd) / leg; out[:, c + 2] = an[:, 2] / leg; c += 3
        out[:, c:c + 4] = untangle(quat(A['foot_' + s])); c += 4
        out[:, c:c + 3] = A['thigh_' + s][:, :, 2]; c += 3                                                                   # which way the knee points: the thigh's own forward
    v = np.gradient(org, dt, axis=0); speed = (v[:, 0] * Fh[:, 0] + v[:, 1] * Fh[:, 2]) / leg
    return out, speed

def resample(x, t_src, t_dst):
    return np.stack([np.interp(t_dst, t_src, x[:, i]) for i in range(x.shape[1])], 1)
def renorm(a):
    a = a.copy()
    for c in list(range(3, 39, 4)) + [42, 52]: a[:, c:c + 4] /= np.linalg.norm(a[:, c:c + 4], axis=1, keepdims=True)
    for c in (46, 56): a[:, c:c + 3] /= np.linalg.norm(a[:, c:c + 3], axis=1, keepdims=True)
    return a

def stride(out, speed, dt, N=40):
    """One stride cut from a walk or run: left heel strike to left heel strike, closed into a loop."""
    zl = smooth(out[:, 41], 0.03 / dt)      # the left ankle's place ahead of the hips: furthest forward at heel strike
    pk = [i for i in range(2, len(zl) - 2) if zl[i] >= zl[i - 1] and zl[i] > zl[i + 1] and zl[i] > 0.05]
    pk = [p for k, p in enumerate(pk) if k == 0 or p - pk[k - 1] > 0.3 / dt]
    if len(pk) < 2: return None
    cyc = [(a, b) for a, b in zip(pk, pk[1:]) if 0.45 < (b - a) * dt < 2.2 and np.mean(speed[a:b]) > 0.6 * np.percentile(speed, 90)]
    if not cyc: return None
    T = np.median([(b - a) * dt for a, b in cyc]); a, b = min(cyc, key=lambda ab: abs((ab[1] - ab[0]) * dt - T) + 0.002 * abs((ab[0] + ab[1]) / 2 - len(zl) / 2))
    seg = out[a:b + 1].copy()
    for c in list(range(3, 39, 4)) + [42, 52]:                         # quaternions end on the side they started on
        if (seg[-1, c:c + 4] * seg[0, c:c + 4]).sum() < 0: seg[-1, c:c + 4] *= -1
    drift = seg[-1] - seg[0]; u = np.linspace(0, 1, len(seg))[:, None]; seg = seg - drift * (u - 0.5)      # the loop closes: what is left over is spread along it
    s = resample(seg, np.linspace(0, 1, len(seg)), np.arange(N) / N)
    return dict(data=renorm(s), T=float((b - a) * dt), v=float(np.mean(speed[a:b])), n=N)

def q16(a):
    a = a.copy(); a[:, 0:3] *= 8000; a[:, 3:39] *= 32767
    for c in (39, 49): a[:, c:c + 3] *= 8000; a[:, c + 3:c + 7] *= 32767; a[:, c + 7:c + 10] *= 32767
    return base64.b64encode(np.clip(np.round(a), -32767, 32767).astype('<i2').tobytes()).decode()

# ---------------------------------------------------------------- what to take
STYLES = [('normal', 'easy'), ('proud', 'proud'), ('happy', 'happy'), ('active', 'brisk'), ('masculinity', 'broad'), ('feminine', 'light'), ('childish', 'skipping'), ('musical', 'musical'),
          ('chimpira', 'swagger'), ('giant', 'giant'), ('not-confident', 'shy'), ('sad', 'sad'), ('tired', 'tired'), ('old', 'old'), ('angry', 'angry')]
#        id          name                 file                                  seconds (from, to)   loops   follow (stay with a performer who drifts or turns)
CLIPS = [('stand',   'standing',          CMU % (40, '40_10'),                   (1.0, 5.8),          True,   True),
         ('wait',    'waiting',           CMU % (40, '40_10'),                   (19.6, 24.0),        True,   True),
         ('shift',   'shifting',          CMU % (40, '40_11'),                   (2.0, 6.0),          True,   True),
         ('idle4',   'waiting',           CMU % (40, '40_11'),                   (20.0, 24.0),        True,   True),
         ('think',   'thinking',          CMU % (74, '74_12'),                   (0.3, 2.8),          False,  True),
         ('stretch', 'stretching',        CMU % (42, '42_01'),                   (0.5, 9.0),          False,  True),
         ('laugh',   'laugh',             CMU % (79, '79_70'),                   (0.3, 6.0),          False,  True),
         ('wave',    'wave',              BN1 % 'bye_normal',                    None,                False,  False),
         ('bigwave', 'wave both arms',    BN2 % 'wave-both-hands_normal',        None,                False,  False),
         ('bow',     'bow',               BN1 % 'bow_normal',                    None,                False,  False),
         ('call',    'beckon',            BN1 % 'call_normal',                   None,                False,  False),
         ('guide',   'this way',          BN1 % 'guide_normal',                  None,                False,  False),
         ('nod',     'nod',               BN1 % 'respond_normal',                None,                False,  False),
         ('cheer',   'arms up',           BN2 % 'raise-up-both-hands_normal',    None,                False,  False),
         ('dance',   'dance',             BN1 % 'dance-short_normal',            (1.0, 19.0),         False,  False),
         ('chicken', 'chicken dance',     CMU % (18, '18_15'),                   (2.0, 14.0),         False,  True),
         ('traffic', 'direct traffic',    CMU % (13, '13_27'),                   (1.0, 11.0),         False,  True)]

def main():
    cals = {}; out = dict(v=1, nch=NCH, credit='Motion: Bandai Namco Research Inc. (CC BY-NC 4.0) and the CMU Graphics Lab Motion Capture Database', gaits=[], clips=[])
    def load(path):
        kind = 'cmu' if 'cmu-mocap' in path else 'bandai'; joints, data, dt = read_bvh(os.path.join(SRC, path))
        key = path if kind == 'cmu' else kind                                                 # CMU's performers each have a skeleton of their own
        if key not in cals:
            if kind == 'cmu': Rw, P = forward(joints, data, rest=True); cals[key] = calibrate(joints, kind, Rw, P); cals[key]['flatfoot'] = True      # CMU's rest pose is a T: calibrate on it
            else: Rw, P = forward(joints, data[:1]); cals[key] = calibrate(joints, kind, Rw, P)                                                         # Bandai Namco's is not: the first clip read must open standing (it does: a bow)
        return joints, data, dt, kind, cals[key]
    load(BN1 % 'bow_normal')
    for sid, name in STYLES:
        g = dict(id=name, name=name)
        for gait in ('walk', 'run'):
            p = BN1 % f'{gait}_{sid}'
            if (gait, sid) == ('run', 'normal'): p = (BN2 % 'run_normal').replace('_001', '_002')      # (the first set's plain run is under a second long)
            if not os.path.exists(os.path.join(SRC, p)): continue
            joints, data, dt, kind, cal = load(p); o, sp = retarget(joints, data, dt, kind, cal, True); s = stride(o, sp, dt)
            if not s: print('  no stride found in', p); continue
            g[gait] = dict(T=round(s['T'], 3), v=round(s['v'], 3), n=s['n'], d=q16(s['data'])); print(f"{name:9s} {gait:4s} stride {s['T']:.2f} s at {s['v']:.2f} leg lengths/s")
        if 'walk' in g: out['gaits'].append(g)
    for cid, name, path, win, loop, follow in CLIPS:
        if not os.path.exists(os.path.join(SRC, path)): print('  missing', path); continue
        joints, data, dt, kind, cal = load(path)
        if win: data = data[int(win[0] / dt):int(win[1] / dt)]
        o, _ = retarget(joints, data, dt, kind, cal, False, follow); t = np.arange(len(o)) * dt; td = np.arange(0, t[-1], 1 / 20); o = renorm(resample(o, t, td))
        if loop:                                                       # ends eased into each other over half a second
            n = 10; w = (np.arange(n) / n)[:, None]; o[-n:] = renorm(o[-n:] * (1 - w) + o[:1] * w)
        out['clips'].append(dict(id=cid, name=name, fps=20, n=len(o), loop=loop, d=q16(o))); print(f'{cid:9s} {len(o) / 20:5.1f} s')
    dst = os.path.join(ROOT, 'assets', 'motion.json'); json.dump(out, open(dst, 'w'), separators=(',', ':')); print(os.path.relpath(dst), round(os.path.getsize(dst) / 1e6, 2), 'MB')
    return out

if __name__ == '__main__': main()
