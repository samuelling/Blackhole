// hands.js: the suit's gloves, with fingers. The suit was modelled with its fingers fixed in one relaxed curl (build_astronaut.py);
// here they are cut off the glove and rebuilt as jointed shells (three per finger, three for the thumb), posed every frame.
//
// A hand is driven by a handful of numbers: the curl of each digit (0 straight, 1 a fist), how far the fingers spread, how far the
// thumb is brought across the palm, and the wrist's flex, sideways bend and roll. Gestures set targets for those numbers; springs
// carry the hand to them, a little underdamped, so a hand settles rather than snaps. On top of that the hand is a loose thing on the
// end of an arm: when the wrist is swung or stopped the fingers and the wrist lag and overshoot by its acceleration, so walking,
// reaching and stopping all show in the hand. pose() packs a hand's numbers small enough to send to other players.
import * as THREE from 'three';

const WHITE = [0.80, 0.82, 0.86, 1.0], DARK = [0.055, 0.06, 0.075, 0.4], GREY = [0.34, 0.37, 0.43, 1.0];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** A capsule hanging from its top (the joint), down -y, coloured with the suit's vertex colours (alpha names the surface). */
function phalanx(r0, r1, L, col) {
  const g = new THREE.CylinderGeometry(r1, r0, L, 10, 1, false).translate(0, -L / 2, 0), top = new THREE.SphereGeometry(r0, 10, 6, 0, 6.2832, 0, Math.PI / 2), end = new THREE.SphereGeometry(r1, 10, 6, 0, 6.2832, Math.PI / 2, Math.PI / 2).translate(0, -L, 0);
  const parts = [g, top, end].map(x => x.toNonIndexed()), n = parts.reduce((a, x) => a + x.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), colA = new Float32Array(n * 4); let o = 0;
  for (const x of parts) { pos.set(x.attributes.position.array, o * 3); nor.set(x.attributes.normal.array, o * 3); o += x.attributes.position.count; x.dispose(); }
  for (let i = 0; i < n; i++) colA.set(col, i * 4);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(colA, 4));
  return geo;
}

/** Strip the fixed fingers and thumb off a glove's geometry: the white shells and dark tips below the knuckles, keeping wrist, palm, guard, knuckle bar. */
function stripGlove(geo) {
  const P = geo.attributes.position, C = geo.attributes.color, idx = geo.index ? geo.index.array : null, keep = [];
  const n = idx ? idx.length : P.count, at = k => idx ? idx[k] : k, cs = C.normalized ? 1 : 1;
  for (let t = 0; t < n; t += 3) {
    let cx = 0, cy = 0, cz = 0, r = 0, a = 0;
    for (let k = 0; k < 3; k++) { const i = at(t + k); cx += P.getX(i) / 3; cy += P.getY(i) / 3; cz += P.getZ(i) / 3; r += C.getX(i) * cs / 3; a += C.getW(i) * cs / 3; }
    const white = r > 0.7 && a > 0.9, dark = r < 0.1 && a < 0.5;
    const finger = white && Math.abs(cx) < 0.016 && cy < -0.074;                 // the four fingers (the guard is out at the side)
    const thumb = white && Math.abs(cx) < 0.016 && cz > 0.04 && cy < -0.03;       // and the thumb, forward of the palm
    const tip = dark && cy < -0.062;                                             // dark tips (the wrist ball sits higher)
    if (!(finger || thumb || tip)) for (let k = 0; k < 3; k++) keep.push(at(t + k));
  }
  const g = geo.clone(); g.setIndex(keep); return g;
}

export function createHands({ B, mat, ink, hullOf }) {
  const hands = {};
  for (const sd of ['L', 'R']) {
    const s = sd === 'L' ? 1 : -1, hd = B['hand_' + sd];
    // swap the glove's meshes for the stripped glove
    for (const m of hd.children.slice()) if (m.isMesh) { const stripped = stripGlove(m.geometry); if (m.material === ink) { const h = hullOf(stripped); m.geometry = h; } else m.geometry = stripped; }
    const palmN = new THREE.Vector3(-s, 0, 0);                                   // the palm faces the leg at rest
    const digits = [];
    // fingers: index (forward, beside the thumb) to little; lengths and bases from the suit's model
    [0.078, 0.086, 0.08, 0.066].forEach((L, i) => {
      const root = new THREE.Group(); root.position.set(s * 0.001, -0.094, 0.0345 - i * 0.0228); hd.add(root);
      const segs = [], lens = [L * 0.44, L * 0.34, L * 0.26], rads = [[0.0125, 0.012], [0.012, 0.0115], [0.0118, 0.0105]];
      let parent = root;
      lens.forEach((l, k) => {
        const j = new THREE.Group(); if (k) j.position.y = -lens[k - 1]; parent.add(j);
        const geo = phalanx(rads[k][0], rads[k][1], l * 0.94, k === 2 ? DARK : WHITE), m = new THREE.Mesh(geo, mat); m.castShadow = true; j.add(m);
        j.add(new THREE.Mesh(hullOf(geo), ink));
        if (k) { const kn = new THREE.Mesh(phalanx(0.0124, 0.0124, 0.0015, GREY), mat); kn.position.y = 0.0008; j.add(kn); }   // a grey joint ring between shells
        segs.push(j); parent = j;
      });
      digits.push({ root, segs, spreadDir: [1.5, 0.5, -0.5, -1.5][i], thumb: false });
    });
    // the thumb: from the heel of the palm, forward and down
    { const t0 = new THREE.Vector3(s * -0.004, -0.042, 0.043), t1 = new THREE.Vector3(s * -0.01, -0.072, 0.064), d = t1.clone().sub(t0).normalize();
      const root = new THREE.Group(); root.position.copy(t0); root.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), d); hd.add(root);
      const segs = [], lens = [0.036, 0.03, 0.022], rads = [[0.0152, 0.014], [0.014, 0.0128], [0.0128, 0.0112]]; let parent = root;
      lens.forEach((l, k) => { const j = new THREE.Group(); if (k) j.position.y = -lens[k - 1]; parent.add(j);
        const geo = phalanx(rads[k][0], rads[k][1], l * 0.94, k === 2 ? DARK : k === 0 ? GREY : WHITE), m = new THREE.Mesh(geo, mat); m.castShadow = true; j.add(m); j.add(new THREE.Mesh(hullOf(geo), ink));
        segs.push(j); parent = j; });
      // the thumb curls toward the palm and across toward the fingers: about the axis that turns its length that way
      const cdir = new THREE.Vector3(-s, 0, -0.6).normalize(), ax = new THREE.Vector3().crossVectors(d, cdir).normalize().applyQuaternion(root.quaternion.clone().invert());
      digits.push({ root, segs, thumb: true, rest: root.quaternion.clone(), ax }); }
    hands[sd] = {
      s, hd, digits, palmN,
      // state: what the springs are carrying, and how fast
      curl: [0.3, 0.3, 0.32, 0.36, 0.4], curlV: [0, 0, 0, 0, 0], spread: 0.15, spreadV: 0, opp: 0.2, oppV: 0,
      wr: new THREE.Vector3(), wrV: new THREE.Vector3(),                          // wrist: flex (x), roll (y), sideways (z), on top of the arm's own pose
      lag: new THREE.Vector3(), lagV: new THREE.Vector3(),                        // the hand's swing from its own inertia
      prevP: new THREE.Vector3(), vel: new THREE.Vector3(), has: false, seed: s > 0 ? 1.7 : 4.1,
      target: null,
    };
  }

  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _a = new THREE.Vector3(), _qi = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
  // the springs: a little underdamped (zeta 0.62), so a hand comes to rest with the faintest overshoot
  const spring = (x, v, target, k, dt) => { const c = 2 * Math.sqrt(k) * 0.62; v += (k * (target - x) - c * v) * dt; return [x + v * dt, v]; };

  /** Gesture targets for one hand from what the body is doing. */
  function aimFor(h, sd, st, t) {
    const n = (k, f) => 0.5 + 0.5 * Math.sin(t * f + h.seed * (k + 1) * 1.37);   // slow idle drift, finger by finger
    const T = { curl: [0.24, 0.28, 0.32, 0.37, 0.43].map((c, k) => c + 0.06 * (n(k, 0.37) - 0.5)), spread: 0.14, opp: 0.2, wr: [0, 0, 0] };
    // walking: the relaxed curl tightens toward a loose fist as the pace rises
    const run = st.run * st.move; for (let k = 0; k < 5; k++) T.curl[k] = lerp(T.curl[k], [0.45, 0.62, 0.66, 0.7, 0.74][k], run);
    T.opp = lerp(T.opp, 0.45, run);
    if (sd === 'R' && st.reach > 0) {   // reaching for a void: fingers open and spread, close on it as it goes
      const a = st.reachAge, close = ss(0.55, 0.85, a) * (1 - ss(0.95, 1.3, a));
      for (let k = 0; k < 5; k++) T.curl[k] = lerp(lerp(T.curl[k], 0.04, st.reach), 0.72, close);
      T.spread = lerp(T.spread, 0.95, st.reach * (1 - close)); T.opp = lerp(T.opp, 0.6, close); T.wr = [-0.35 * st.reach * (1 - close), 0, 0];
    }
    if (st.work > 0.01) {
      const w = st.work, g = st.gesture || {};
      if (sd === 'L') {   // holding the console up: the hand open and easy, the fingers lifting a little toward the display
        for (let k = 0; k < 5; k++) T.curl[k] = lerp(T.curl[k], [0.15, 0.12, 0.18, 0.24, 0.3][k] + 0.05 * (n(k, 0.8) - 0.5), w);
        T.spread = lerp(T.spread, 0.32, w); T.wr = [lerp(T.wr[0], -0.18, w), 0, 0];
      } else {
        let curl = [0.12, 0.05, 0.08, 0.13, 0.18], spread = 0.45, opp = 0.15, wr = [-0.2, 0, 0];   // ready: the hand up and open
        if (g.hover && !g.held) { curl = [0.08, 0.02, 0.04, 0.07, 0.1]; spread = 0.95; wr = [-0.5, 0, 0]; }   // pointing at a stone: palm to it, fingers wide
        if (g.held) {   // the suit has it: the fingers hold an invisible stone, harder the heavier it is, trembling at the limit
          const e = g.effort || 0, tr = e * e * 0.09, tf = 9 + 4 * e;
          curl = [0.42, 0.46, 0.5, 0.54, 0.58].map((c, k) => c + 0.32 * e + tr * Math.sin(t * tf + k * 1.9));
          spread = 0.55 - 0.25 * e; opp = 0.5 + 0.3 * e; wr = [-0.3 - 0.25 * e + tr * 0.5 * Math.sin(t * tf * 0.83), 0, tr * 0.6 * Math.sin(t * tf * 1.13)];
          if (g.placing) { curl = curl.map(c => c * 0.6); spread = 0.7; wr[0] = -0.15; }          // letting it down: the grip eases
          if (g.press) { curl = [0.05, 0, 0.02, 0.05, 0.08]; spread = 0.75; wr = [-0.8, 0, 0]; }  // pressing it down: palm flat, wrist back
          if (g.ghost) curl = curl.map((c, k) => 0.2 + 0.25 * Math.sin(t * 14 + k * 1.3));           // passing through: the fingers ripple
        }
        wr[1] += g.turn || 0;                                                                     // turning it: the wrist rolls into the turn
        for (let k = 0; k < 5; k++) T.curl[k] = lerp(T.curl[k], curl[k], w);
        T.spread = lerp(T.spread, spread, w); T.opp = lerp(T.opp, opp, w); for (let k = 0; k < 3; k++) T.wr[k] = lerp(T.wr[k], wr[k], w);
      }
    }
    if (sd === 'R' && st.point > 0) {   // the trowel's aim: index out, the rest folded
      const p = st.point; const pc = [0.55, 0.02, 0.85, 0.9, 0.92]; for (let k = 0; k < 5; k++) T.curl[k] = lerp(T.curl[k], pc[k], p); T.spread = lerp(T.spread, 0.1, p); T.opp = lerp(T.opp, 0.7, p);
    }
    return T;
  }

  /** Each frame, after the arms are posed. st: { move, run, reach, reachAge, work, gesture, point } */
  function update(dt, t, st, root) {
    dt = Math.min(dt, 1 / 30);
    root.updateMatrixWorld(true);
    for (const sd of ['L', 'R']) {
      const h = hands[sd], T = h.target || aimFor(h, sd, st, t);
      for (let k = 0; k < 5; k++) [h.curl[k], h.curlV[k]] = spring(h.curl[k], h.curlV[k], clamp(T.curl[k], -0.05, 1.1), 160, dt);
      [h.spread, h.spreadV] = spring(h.spread, h.spreadV, T.spread, 120, dt); [h.opp, h.oppV] = spring(h.opp, h.oppV, T.opp, 110, dt);
      for (const a of ['x', 'y', 'z']) [h.wr[a], h.wrV[a]] = spring(h.wr[a], h.wrV[a], T.wr[{ x: 0, y: 1, z: 2 }[a]], 90, dt);
      // the hand's own inertia: how the wrist is being accelerated, in the hand's frame (relative to the body, so walking at a steady pace does not count)
      h.hd.getWorldPosition(_p); root.worldToLocal(_p);
      if (h.has && dt > 0) { _a.subVectors(_p, h.prevP).divideScalar(dt); const acc = _a.clone().sub(h.vel).divideScalar(dt); h.vel.lerp(_a, Math.min(1, dt * 30));
        h.hd.getWorldQuaternion(_q); root.getWorldQuaternion(_qi); _q.premultiply(_qi.invert()).invert(); acc.applyQuaternion(_q).clampLength(0, 60);
        // the fingers swing against it, and the wrist bends: a pendulum, about a twentieth of a radian per g
        const kx = -acc.z * 0.012, kz = acc.x * 0.012 * h.s, kc = -acc.x * h.s * 0.006;
        [h.lag.x, h.lagV.x] = spring(h.lag.x, h.lagV.x, clamp(kx, -0.5, 0.5), 70, dt); [h.lag.z, h.lagV.z] = spring(h.lag.z, h.lagV.z, clamp(kz, -0.4, 0.4), 70, dt); [h.lag.y, h.lagV.y] = spring(h.lag.y, h.lagV.y, clamp(kc, -0.25, 0.25), 90, dt);
      }
      h.prevP.copy(_p); h.has = true;
      // pose: the wrist on top of the arm's own pose
      h.hd.rotation.x += h.wr.x + h.lag.x; h.hd.rotation.y += h.wr.y; h.hd.rotation.z += h.wr.z * h.s + h.lag.z;
      h.digits.forEach((d, k) => {
        const c = clamp((d.thumb ? h.curl[0] : h.curl[k + 1]) + h.lag.y, -0.05, 1.15);
        if (d.thumb) {
          // the thumb: brought across the palm (opposition), then curled in two joints
          _q.setFromAxisAngle(Z, -h.s * (0.15 + 0.7 * h.opp)); d.root.quaternion.copy(d.rest).premultiply(_q);
          d.segs[0].quaternion.setFromAxisAngle(d.ax, c * 0.35); d.segs[1].quaternion.setFromAxisAngle(d.ax, c * 0.9); d.segs[2].quaternion.setFromAxisAngle(d.ax, c * 0.75);
        } else {
          const sp = -d.spreadDir * h.spread * 0.13;                                                     // the fingers fan along the knuckle line
          d.root.rotation.set(sp, 0, -h.s * (0.08 + c * 1.35));                                         // knuckle
          d.segs[1].rotation.set(0, 0, -h.s * c * 1.55);                                                // middle joint
          d.segs[2].rotation.set(0, 0, -h.s * c * 0.95);                                                // end joint
        }
      });
    }
  }
  /** A hand's state in eleven numbers (five curls, spread, opposition, wrist x y z, and a spare), for sending to other players. */
  function pose(sd) { const h = hands[sd]; return [...h.curl, h.spread, h.opp, h.wr.x, h.wr.y, h.wr.z, 0].map(v => Math.round(v * 1000) / 1000); }
  /** Drive a hand from someone else's pose instead of from gestures (null hands it back). */
  function drive(sd, p) { const h = hands[sd]; h.target = p ? { curl: p.slice(0, 5), spread: p[5], opp: p[6], wr: [p[7], p[8], p[9]] } : null; }
  return { update, pose, drive, hands };
}
