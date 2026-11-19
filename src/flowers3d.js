// flowers3d.js — real 3D flower heads and florets for the cottage garden's showpiece species.
// Shapes follow published descriptions (RHS, Kew POWO, extension services):
//   foxglove: pendant, tubular, four-lobed bells ~4–6 cm, spotted inside, on a one-sided raceme
//   delphinium: 5 petal-like sepals, the uppermost drawn back into a spur, around a small 4-petalled "bee"
//   lupine: pea flowers 1–2 cm (banner, two wings, keel) in dense whorls on an erect spike
//   English rose: cupped rosette, longer outer petals around many inner ones
//   oriental poppy: bowl of 4 crinkled petals with dark basal blotches, dark stamens, a capsule
//   double peony: broad guard petals around a ruffled mass of inner petals
//   allium: sphere of many star-shaped, six-tepalled florets
// Every geometry is built in unit space with UVs into a small mask texture:
//   R = brightness, G = whiten, B = mix toward the instance's secondary colour (eye, bee, banner, spots).
import * as THREE from 'three';

const TAU = Math.PI * 2, V = THREE.Vector3;
function rngOf(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

class GB {
  constructor() { this.p = []; this.uv = []; this.i = []; }
  v(P, u, w) { this.p.push(P.x, P.y, P.z); this.uv.push(u, w); return this.p.length / 3 - 1; }
  t(a, b, c) { this.i.push(a, b, c); }
  build() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.setIndex(this.i); g.computeVertexNormals(); return g; }
}
const broad = v => Math.max(0.08, Math.sin(Math.PI * (0.12 + 0.8 * v)));
// a curved petal patch: base B, length direction D, width direction S, bulge direction N
function petal(gb, o) {
  const N = o.N ? o.N.clone().normalize() : new V().crossVectors(o.S, o.D).normalize();
  const nu = o.nu || 2, nv = o.nv || 3, wf = o.wf || broad, rows = [];
  for (let j = 0; j <= nv; j++) {
    const v = j / nv, row = [];
    for (let i = 0; i <= nu; i++) {
      const u = i / nu * 2 - 1, w = o.W * wf(v), x = u * w * 0.5;
      let n = (o.cup || 0) * u * u * w * 0.5 + (o.curl || 0) * v * v * o.L;
      if (o.ruffle) n += o.ruffle * Math.sin(u * 7 + o.seed) * Math.sin(v * 6 + o.seed * 1.7) * v;
      const P = o.B.clone().addScaledVector(o.D, v * o.L).addScaledVector(o.S, x).addScaledVector(N, n);
      row.push(gb.v(P, o.uv[0] + (u * 0.5 + 0.5) * (o.uv[2] - o.uv[0]), o.uv[1] + v * (o.uv[3] - o.uv[1])));
    }
    rows.push(row);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = rows[j][i], b = rows[j][i + 1], c = rows[j + 1][i], d = rows[j + 1][i + 1]; gb.t(a, b, d); gb.t(a, d, c); }
}
function maskTex(fn, W = 256, H = 256) {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [r, gg, b] = fn(x / (W - 1), 1 - y / (H - 1)), k = (y * W + x) * 4;
    img.data[k] = Math.max(0, Math.min(255, r * 255)); img.data[k + 1] = Math.max(0, Math.min(255, gg * 255)); img.data[k + 2] = Math.max(0, Math.min(255, b * 255)); img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
}
const headDir = (th, tilt) => new V(Math.cos(th) * Math.sin(tilt), Math.cos(tilt), Math.sin(th) * Math.sin(tilt));
const headSide = th => new V(-Math.sin(th), 0, Math.cos(th));

// ---------------------------------------------------------------- heads (axis +y, unit diameter)
function rose() {
  const gb = new GB(), r = rngOf(7);
  const rings = [
    { n: 5, r0: 0.07, L: 0.46, W: 0.33, tilt: 1.22, cup: 0.4, curl: -0.08 },
    { n: 5, r0: 0.055, L: 0.39, W: 0.29, tilt: 0.86, cup: 0.5, curl: 0.12 },
    { n: 4, r0: 0.04, L: 0.3, W: 0.23, tilt: 0.55, cup: 0.6, curl: 0.22 },
    { n: 4, r0: 0.025, L: 0.2, W: 0.16, tilt: 0.28, cup: 0.7, curl: 0.3 },
  ];
  rings.forEach((R, k) => { for (let i = 0; i < R.n; i++) {
    const th = i / R.n * TAU + k * 0.63 + (r() - 0.5) * 0.25, tilt = R.tilt + (r() - 0.5) * 0.12;
    petal(gb, { B: new V(Math.cos(th) * R.r0, 0.02 + k * 0.015, Math.sin(th) * R.r0), D: headDir(th, tilt), S: headSide(th), L: R.L * (0.92 + r() * 0.16), W: R.W, cup: R.cup, curl: R.curl, nu: 2, nv: 3, uv: [0, k / 4, 1, (k + 1) / 4 - 0.01] });
  } });
  const mask = maskTex((u, v) => { const k = Math.floor(v * 4), vb = v * 4 - k, vein = 0.06 * Math.pow(Math.abs(Math.sin(u * 38 + vb * 3)), 10) * (1 - vb);
    return [0.58 - k * 0.05 + 0.24 * vb - vein, 0.12 * sm(0.7, 1, vb) * (k === 0 ? 1.4 : 1), 0]; });
  return { geo: gb.build(), mask };
}
function peony() {
  const gb = new GB(), r = rngOf(11);
  const rings = [
    { n: 6, r0: 0.08, L: 0.48, W: 0.38, tilt: 1.15, cup: 0.45, curl: 0.05, ruf: 0.01 },
    { n: 7, r0: 0.06, L: 0.34, W: 0.22, tilt: 0.7, cup: 0.5, curl: 0.25, ruf: 0.035 },
    { n: 7, r0: 0.045, L: 0.28, W: 0.18, tilt: 0.45, cup: 0.6, curl: 0.3, ruf: 0.04 },
    { n: 6, r0: 0.02, L: 0.2, W: 0.15, tilt: 0.2, cup: 0.6, curl: 0.35, ruf: 0.04 },
  ];
  rings.forEach((R, k) => { for (let i = 0; i < R.n; i++) {
    const th = i / R.n * TAU + k * 0.5 + (r() - 0.5) * 0.4, tilt = R.tilt + (r() - 0.5) * 0.2;
    petal(gb, { B: new V(Math.cos(th) * R.r0, 0.02 + k * 0.02, Math.sin(th) * R.r0), D: headDir(th, tilt), S: headSide(th), L: R.L * (0.85 + r() * 0.3), W: R.W * (0.85 + r() * 0.3), cup: R.cup, curl: R.curl, ruffle: R.ruf, seed: r() * 10, nu: 3, nv: 2, uv: [0, k / 4, 1, (k + 1) / 4 - 0.01] });
  } });
  const mask = maskTex((u, v) => { const k = Math.floor(v * 4), vb = v * 4 - k; return [0.66 - k * 0.04 + 0.16 * vb + 0.03 * Math.sin(u * 50 + vb * 9), 0.08 + 0.22 * sm(0.55, 1, vb), 0]; });
  return { geo: gb.build(), mask };
}
function poppy() {
  const gb = new GB(), r = rngOf(5);
  for (let i = 0; i < 4; i++) {
    const th = i / 4 * TAU + (i % 2 ? 0.08 : 0) + (r() - 0.5) * 0.2;
    petal(gb, { B: new V(Math.cos(th) * 0.04, 0.015 * (i % 2), Math.sin(th) * 0.04), D: headDir(th, 0.95 + (i % 2) * 0.12), S: headSide(th), L: 0.5, W: 0.6, cup: 0.32, curl: 0.06, ruffle: 0.028, seed: i * 3.1, nu: 4, nv: 4, wf: v => Math.max(0.12, Math.sin(Math.PI * (0.1 + 0.62 * v)) * (0.55 + 0.45 * v)), uv: [0, 0, 1, 0.78] });
  }
  // seed capsule (dome with a flat stigmatic disc) and a ring of dark stamens
  const cap = (u, w) => gb.v(new V(Math.cos(u) * 0.07 * Math.sin(w), 0.03 + 0.11 * Math.cos(w * 0.9), Math.sin(u) * 0.07 * Math.sin(w)), u / TAU, 0.8 + w / Math.PI * 0.08);
  const S = 8, R2 = 3, ids = []; for (let j = 0; j <= R2; j++) { const row = []; for (let i = 0; i <= S; i++) row.push(cap(i / S * TAU, j / R2 * Math.PI / 2)); ids.push(row); }
  for (let j = 0; j < R2; j++) for (let i = 0; i < S; i++) { gb.t(ids[j][i], ids[j][i + 1], ids[j + 1][i + 1]); gb.t(ids[j][i], ids[j + 1][i + 1], ids[j + 1][i]); }
  for (let i = 0; i < 14; i++) { const a = i / 14 * TAU, a2 = a + 0.2; const p = [new V(Math.cos(a) * 0.07, 0.02, Math.sin(a) * 0.07), new V(Math.cos(a2) * 0.075, 0.02, Math.sin(a2) * 0.075), new V(Math.cos(a + 0.1) * 0.13, 0.07, Math.sin(a + 0.1) * 0.13)];
    gb.t(gb.v(p[0], 0.5, 0.92), gb.v(p[1], 0.55, 0.92), gb.v(p[2], 0.52, 0.99)); }
  const mask = maskTex((u, v) => {
    if (v > 0.9) return [0.06, 0, 0];
    if (v > 0.79) return [0.8, 0, 1];
    const vv = v / 0.78, blot = 1 - sm(0.12, 0.26 + 0.04 * Math.sin(u * 20), vv);
    return [(0.74 + 0.1 * Math.sin(u * 70 + vv * 25) * vv + 0.1 * vv) * (1 - blot * 0.95), 0, 0];
  });
  return { geo: gb.build(), mask };
}
function allium() {
  const gb = new GB(), r = rngOf(9);
  const core = new THREE.IcosahedronGeometry(0.3, 1), cp = core.attributes.position;
  for (let i = 0; i < cp.count; i += 3) { const ids = []; for (let k = 0; k < 3; k++) ids.push(gb.v(new V().fromBufferAttribute(cp, i + k), 0.25, 0.25)); gb.t(ids[0], ids[1], ids[2]); }
  const N = 130;
  for (let i = 0; i < N; i++) {
    const y = 1 - (i + 0.5) / N * 2, rr = Math.sqrt(1 - y * y), th = i * 2.39996, n = new V(Math.cos(th) * rr, y, Math.sin(th) * rr);
    const c = n.clone().multiplyScalar(0.4 + r() * 0.06), t1 = new V().crossVectors(n, Math.abs(n.y) < 0.9 ? new V(0, 1, 0) : new V(1, 0, 0)).normalize(), t2 = new V().crossVectors(n, t1), s = 0.075;
    for (let k = 0; k < 2; k++) { const ids = []; for (let m = 0; m < 3; m++) { const a = (m / 3 + k / 6) * TAU; ids.push(gb.v(c.clone().addScaledVector(t1, Math.cos(a) * s).addScaledVector(t2, Math.sin(a) * s).addScaledVector(n, k * 0.004), 0.75 + Math.cos(a) * 0.2, 0.75 + Math.sin(a) * 0.2)); } gb.t(ids[0], ids[1], ids[2]); }
    gb.t(gb.v(c.clone().addScaledVector(n, -0.12), 0.75, 0.5), gb.v(c.clone().addScaledVector(t1, 0.006), 0.75, 0.75), gb.v(c.clone().addScaledVector(t1, -0.006), 0.75, 0.75));
  }
  const mask = maskTex((u, v) => u < 0.5 ? [0.3, 0, 1] : [0.72 + 0.2 * (1 - Math.hypot(u - 0.75, v - 0.75) * 4), 0.1 * (1 - Math.hypot(u - 0.75, v - 0.75) * 5), 0]);
  return { geo: gb.build(), mask };
}

// ---------------------------------------------------------------- florets (facing +z, up +y)
function delphFloret() {
  const gb = new GB();
  for (let i = 0; i < 5; i++) {
    const a = Math.PI / 2 + i / 5 * TAU, D = new V(Math.cos(a), Math.sin(a), 0.22).normalize(), S = new V(-Math.sin(a), Math.cos(a), 0);
    petal(gb, { B: new V(Math.cos(a) * 0.04, Math.sin(a) * 0.04, 0), D, S, N: new V().crossVectors(D, S), L: i ? 0.47 : 0.5, W: 0.4, cup: 0.28, curl: 0.06, nu: 2, nv: 2, uv: [0, 0, 1, 0.7] });
  }
  // the spur, sweeping back from the top sepal
  const sp = [], S6 = 6; for (let k = 0; k <= 1; k++) { const row = []; const c = k ? new V(0, 0.34, -0.42) : new V(0, 0.12, -0.02), rad = k ? 0.012 : 0.07; for (let i = 0; i <= S6; i++) { const a = i / S6 * TAU; row.push(gb.v(c.clone().add(new V(Math.cos(a) * rad, Math.sin(a) * rad * 0.7, 0)), 0.5, 0.75)); } sp.push(row); }
  for (let i = 0; i < S6; i++) { gb.t(sp[0][i], sp[1][i], sp[1][i + 1]); gb.t(sp[0][i], sp[1][i + 1], sp[0][i + 1]); }
  // the "bee": four small petals in the centre
  for (let i = 0; i < 4; i++) { const a = Math.PI / 2 + (i - 1.5) * 0.55, D = new V(Math.cos(a) * 0.6, Math.sin(a) * 0.6, 0.8).normalize(), S = new V(-Math.sin(a), Math.cos(a), 0);
    petal(gb, { B: new V(0, 0.02, 0.02), D, S, N: new V().crossVectors(D, S), L: 0.17, W: 0.13, cup: 0.4, nu: 1, nv: 1, uv: [0, 0.8, 1, 1] }); }
  const mask = maskTex((u, v) => {
    if (v > 0.78) return [0.85, 0, 1];
    if (v > 0.7) return [0.7, 0, 0];
    const vv = v / 0.7; return [0.66 + 0.22 * vv + 0.05 * Math.sin(u * 30) * vv, 0.18 * (1 - sm(0, 0.35, vv)), 0];
  });
  return { geo: gb.build(), mask };
}
function lupinFloret() {
  const gb = new GB();
  { const D = new V(0, 0.93, 0.36).normalize(), S = new V(1, 0, 0);   // banner, reflexed
    petal(gb, { B: new V(0, 0.02, 0), D, S, L: 0.58, W: 0.56, cup: -0.22, curl: -0.08, nu: 2, nv: 2, uv: [0, 0, 1, 0.48] }); }
  for (const s of [-1, 1]) { const D = new V(s * 0.3, -0.18, 0.94).normalize(), S = new V(0, 1, 0);   // wings
    petal(gb, { B: new V(s * 0.04, 0, 0.02), D, S, N: new V(-s, 0, 0.2), L: 0.5, W: 0.36, cup: 0.35, nu: 2, nv: 1, uv: [0, 0.5, 1, 0.78] }); }
  { const D = new V(0, -0.28, 0.96).normalize(), S = new V(1, 0, 0);   // keel
    petal(gb, { B: new V(0, -0.02, 0.02), D, S, N: new V(0, -1, 0.3), L: 0.46, W: 0.2, cup: 0.6, nu: 1, nv: 2, wf: v => Math.max(0.05, 1 - v * 0.9), uv: [0, 0.8, 1, 1] }); }
  const mask = maskTex((u, v) => {
    if (v < 0.48) { const vv = v / 0.48; return [0.72 + 0.2 * vv, 0, 0.75 * sm(0.25, 0.65, vv) * (1 - sm(0.9, 1, vv) * 0.3)]; }
    if (v < 0.78) return [0.78, 0, 0];
    return [0.86, 0.35, 0];
  });
  return { geo: gb.build(), mask };
}
function bell() {   // foxglove: hangs from the origin along −y; the longer lower lip faces +z
  const gb = new GB(), SEG = 12, RINGS = 5, rows = [];
  for (let j = 0; j <= RINGS; j++) {
    const v = j / RINGS, row = [];
    for (let i = 0; i <= SEG; i++) {
      const a = i / SEG * TAU, lower = 0.5 + 0.5 * Math.cos(a - Math.PI / 2);   // 1 on the +z side
      const len = 1 + 0.18 * lower * sm(0.6, 1, v) + 0.05 * Math.cos(a * 4) * sm(0.8, 1, v);
      const rad = 0.12 + 0.11 * v + 0.16 * Math.pow(v, 3) * (1 + 0.35 * lower);
      const y = -v * len, curve = 0.18 * v * v;
      row.push(gb.v(new V(Math.cos(a) * rad, y, Math.sin(a) * rad + curve), i / SEG, v));
    }
    rows.push(row);
  }
  for (let j = 0; j < RINGS; j++) for (let i = 0; i < SEG; i++) { const a = rows[j][i], b = rows[j][i + 1], c = rows[j + 1][i], d = rows[j + 1][i + 1]; gb.t(a, b, d); gb.t(a, d, c); }
  const r = rngOf(3), spots = [];
  for (let i = 0; i < 70; i++) spots.push([0.12 + r() * 0.26, 0.35 + r() * 0.62, 0.012 + r() * 0.02]);
  const mask = maskTex((u, v) => {
    let b = 0; for (const [su, sv, sr] of spots) { const d = Math.hypot(u - su, (v - sv) * 0.6); if (d < sr) b = Math.max(b, 1 - d / sr); }
    return [0.7 + 0.22 * v + 0.04 * Math.sin(u * 80), 0, Math.min(1, b * 1.6)];
  });
  return { geo: gb.build(), mask };
}
function bud() {   // a closed, pointed bud along +y
  const gb = new GB(), SEG = 6, RINGS = 4, rows = [];
  for (let j = 0; j <= RINGS; j++) { const v = j / RINGS, rad = 0.32 * Math.sin(Math.PI * Math.min(0.999, v * 0.9 + 0.05)) * (1 - v * 0.35), row = [];
    for (let i = 0; i <= SEG; i++) { const a = i / SEG * TAU; row.push(gb.v(new V(Math.cos(a) * rad, v, Math.sin(a) * rad), i / SEG, v)); } rows.push(row); }
  for (let j = 0; j < RINGS; j++) for (let i = 0; i < SEG; i++) { const a = rows[j][i], b = rows[j][i + 1], c = rows[j + 1][i], d = rows[j + 1][i + 1]; gb.t(a, d, b); gb.t(a, c, d); }
  const mask = maskTex((u, v) => [0.62 + 0.2 * v, 0, 0.55 * (1 - v)]);
  return { geo: gb.build(), mask };
}

export function buildFlowers3D() {
  return { rose: rose(), peony: peony(), poppy: poppy(), allium: allium(), delph: delphFloret(), lupin: lupinFloret(), bell: bell(), bud: bud() };
}

// colour variety within a species, as in a real cottage border
export const PALETTES = {
  roseDA: [['#f2a2b4', '#f6d36a'], ['#f6c7cf', '#f6d36a'], ['#e0708a', '#f6d36a'], ['#fbe3c8', '#f6d36a'], ['#f4c08a', '#f6d36a'], ['#c8285a', '#f6d36a'], ['#fff4ee', '#f6d36a']],
  roseKO: [['#e0255a', '#f6d36a'], ['#d81b4a', '#f6d36a'], ['#f0607a', '#f6d36a']],
  peony: [['#f4a9c3', '#f2d24a'], ['#fbe9ef', '#f2d24a'], ['#e05a86', '#f2d24a'], ['#f7d3de', '#f2d24a'], ['#b8204a', '#f2d24a']],
  papaver: [['#d8201a', '#6c7468'], ['#e8461c', '#6c7468'], ['#f07a2a', '#6c7468'], ['#c8323c', '#6c7468'], ['#f2ece6', '#6c7468'], ['#9a4a6e', '#6c7468']],
  alliumG: [['#9a62c8', '#4a3a50'], ['#8a52b8', '#4a3a50'], ['#b07ad8', '#4a3a50']],
  alliumM: [['#b46ad2', '#4a3a50'], ['#a05ac0', '#4a3a50'], ['#f0eef2', '#6a6a5a']],
  delphinium: [['#3a5ad6', '#f4f4f8'], ['#2c3a9e', '#f4f4f8'], ['#6a5ac8', '#2a1a2a'], ['#8fb0f0', '#f4f4f8'], ['#f2f2f6', '#2a1a2a'], ['#5a3aa8', '#f4f4f8'], ['#c890d8', '#2a1a2a']],
  lupinus: [['#5a4ac8', '#f0ecf8'], ['#d9488f', '#f8e4ee'], ['#f2c94c', '#fff6d8'], ['#c22f4a', '#f2e0c8'], ['#e8e0f4', '#ffffff'], ['#9b59b6', '#f0ecf8'], ['#e88aa8', '#fff0f4']],
  digitalis: [['#c4519f', '#4a1030'], ['#d98bc0', '#5a1838'], ['#f4eef0', '#6a2848'], ['#a8458a', '#3a0a24'], ['#e8c2d8', '#5a1838']],
};
export const HEAD3D = { roseDA: 'rose', roseKO: 'rose', peony: 'peony', papaver: 'poppy', alliumG: 'allium', alliumM: 'allium' };
export const SPIRE3D = { delphinium: 'delph', lupinus: 'lupin', digitalis: 'bell' };
