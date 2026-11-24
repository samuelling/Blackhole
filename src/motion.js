// motion.js: motion capture for the body (assets/motion.json, made by tools/mocap/build_motion.py from the CMU Graphics Lab Motion
// Capture Database, free for any use, and Bandai Namco Research's motion dataset, CC BY-NC 4.0).
//
// A frame is 59 numbers in the wearer's own frame (x to their left, y up, z ahead), lengths as fractions of leg length:
//   0-2   the pelvis's place, from where it stands at rest          3-6   the pelvis's turn (a quaternion, x y z w)
//   7-38  chest, head, left upper arm, forearm, hand, right upper arm, forearm, hand: each a quaternion relative to the part it hangs from
//   39-48 left leg: the ankle's place (from the ground under the body), the foot's turn, and which way the knee points
//   49-58 right leg, the same
// A gait is one stride of walking and one of running (left heel strike to left heel strike) with the speed and time it was walked at.
// A clip is something done standing: a few ways of standing about, and gestures.
export const NCH = 59;
const QUATS = [3, 7, 11, 15, 19, 23, 27, 31, 35, 42, 52];
export const STAND = ['stand', 'wait', 'shift', 'idle4'];                       // ways of standing: they follow one another
export const FIDGET = ['think', 'stretch', 'nod'];                              // now and then, standing a long while
export const EMOTES = [['wave', 'wave'], ['bow', 'bow'], ['call', 'beckon'], ['guide', 'this way'], ['nod', 'nod'], ['cheer', 'arms up'], ['laugh', 'laugh'], ['dance', 'dance'], ['chicken', 'chicken dance'], ['stretch', 'stretch'],
  ['bigwave', 'wave both arms'], ['traffic', 'direct traffic'], ['think', 'think']];   // the first ten are on the number keys 1-9, 0

let lib = null, loading = null;
function unpack(s, n) {
  const bin = atob(s), a = new Float32Array(n * NCH);
  for (let i = 0; i < n * NCH; i++) { const v = (bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)) << 16 >> 16, c = i % NCH; a[i] = v / ((c < 3 || (c >= 39 && c < 42) || (c >= 49 && c < 52)) ? 8000 : 32767); }
  return a;
}
/** Fetch the motion library (once). Resolves to it, or to null if it could not be had: the body then walks by its own rules. */
export function loadMotion() {
  if (!loading) loading = fetch(new URL('../assets/motion.json', import.meta.url)).then(r => r.ok ? r.json() : Promise.reject(new Error(r.status))).then(j => {
    const gaits = j.gaits.map(g => { const o = { id: g.id, name: g.name }; for (const k of ['walk', 'run']) if (g[k]) o[k] = { T: g[k].T, v: g[k].v, n: g[k].n, loop: true, f: unpack(g[k].d, g[k].n) }; return o; });
    const clip = {}; for (const c of j.clips) clip[c.id] = { id: c.id, name: c.name, fps: c.fps, n: c.n, loop: false, f: unpack(c.d, c.n) };
    lib = { gaits, clip, credit: j.credit }; return lib;
  }).catch(() => null);
  return loading;
}
export const motionLib = () => lib;

/** One frame out of a set at a fractional frame number (looping sets wrap, others hold their ends). */
export function sample(set, u, out) {
  const n = set.n, f = set.f; let i0 = Math.floor(u), t = u - i0, i1;
  if (set.loop) { i0 = ((i0 % n) + n) % n; i1 = (i0 + 1) % n; } else { i0 = Math.max(0, Math.min(n - 1, i0)); i1 = Math.min(n - 1, i0 + 1); }
  const a = i0 * NCH, b = i1 * NCH;
  for (let c = 0; c < NCH; c++) out[c] = f[a + c] + (f[b + c] - f[a + c]) * t;
  for (const q of QUATS) { if (f[a + q] * f[b + q] + f[a + q + 1] * f[b + q + 1] + f[a + q + 2] * f[b + q + 2] + f[a + q + 3] * f[b + q + 3] < 0) for (let c = q; c < q + 4; c++) out[c] = f[a + c] - (f[b + c] + f[a + c]) * t; }
  return out;
}
/** a toward b by w, channel by channel (quaternions the short way round), into out (which may be a or b); from, to: only those channels. */
export function blend(a, b, w, out, from = 0, to = NCH) {
  if (w <= 0) { if (out !== a) for (let c = from; c < to; c++) out[c] = a[c]; return out; }
  for (const q of QUATS) {
    if (q < from || q >= to) continue;
    const s = a[q] * b[q] + a[q + 1] * b[q + 1] + a[q + 2] * b[q + 2] + a[q + 3] * b[q + 3] < 0 ? -1 : 1; let x = 0;
    for (let c = q; c < q + 4; c++) { const v = a[c] + (s * b[c] - a[c]) * w; out[c] = v; x += v * v; }
    x = 1 / Math.sqrt(x || 1); for (let c = q; c < q + 4; c++) out[c] *= x;
  }
  for (let c = from; c < to; c++) { if ((c >= 3 && c < 39) || (c >= 42 && c < 46) || (c >= 52 && c < 56)) continue; out[c] = a[c] + (b[c] - a[c]) * w; }
  return out;
}
