// senescence.js: how the garden's trees turn and drop their leaves. The pigment model from Turning Grove, run for
// every species in the garden over one year's weather, leaf class by leaf class.
//
//   onset     Delpierre et al. 2009: once daylength is below a species' threshold, cold-degree-days accumulate,
//             dS = (Tb - Tmean) * (P / Pstart); senescence starts when S reaches the species' critical sum. Drought adds to it.
//             A warm spring brings it forward (Zohner et al. 2023).
//   green     chlorophyll is dismantled (and its nitrogen shipped back to the twig), faster in cold bright weather
//   yellow    carotenoids were there all summer and are unmasked; they fade slowly
//   red       anthocyanin is built fresh from sugar trapped in the leaf: bright days, cold nights, sunlit leaves first
//   brown     tannins, as the cells die; frost kills in place and browns at once
//   fall      an abscission layer forms as the green goes; heavy rain and frost finish it. Oaks hold some leaves all winter.
//
// A leaf's colour is the light its pigments let back out (Beer-Lambert), so mixtures look right: a maple leaf half way
// through is orange because red anthocyanin sits over a yellowing blade, not because orange was painted on.
// Parameters are illustrative (tuned to typical timing at 42°N), not fitted to data.

export const D0 = 180, ND = 192;            // the table runs from doy 180 (29 June) for 192 days, into the first week of January
const DAY0 = 152, DAY1 = D0 + ND - 1;       // weather and soil water spin up from 1 June
export const NE = 8, NJ = 8, NC = NE * NJ;  // leaf classes: 8 exposures (deep shade .. full sun) x 8 individual variations
export const Q = { C: 1.6, X: 1.5, A: 2.8, T: 1.8 };   // what a byte of 255 means for each pigment

export const SPECIES = [
  { id: 'lime', common: 'Small-leaved lime', latin: 'Tilia cordata', Pstart: 13.5, Tb: 20, target: 289, chl: 1.25,
    kC: 0.06, X: 0.9, xVar: 0.12, Acap: 0.02, aVar: 0.3, kT: 0.02, kAb: 0.09, marc: 0, droughtSens: 1.6, frostDrop: false },
  { id: 'willow', common: 'Weeping willow', latin: 'Salix × sepulcralis', Pstart: 12.8, Tb: 17, target: 316, chl: 0.95,
    kC: 0.04, X: 0.8, xVar: 0.1, Acap: 0, aVar: 0, kT: 0.01, kAb: 0.035, marc: 0, droughtSens: 0.6, frostDrop: false },
  { id: 'rubrum', common: 'Red maple', latin: 'Acer rubrum', Pstart: 13.7, Tb: 20, target: 278, chl: 1.15,
    kC: 0.065, X: 0.75, xVar: 0.15, Acap: 2.1, aVar: 0.25, kT: 0.010, kAb: 0.075, marc: 0, droughtSens: 1.2, frostDrop: false },
  { id: 'saccharum', common: 'Sugar maple', latin: 'Acer saccharum', Pstart: 13.5, Tb: 20, target: 285, chl: 1.25,
    kC: 0.058, X: 1.0, xVar: 0.12, Acap: 0.85, aVar: 0.7, kT: 0.009, kAb: 0.07, marc: 0, droughtSens: 1.4, frostDrop: false },
  { id: 'liquidambar', common: 'Sweetgum', latin: 'Liquidambar styraciflua', Pstart: 13.1, Tb: 19, target: 300, chl: 1.3,
    kC: 0.048, X: 0.85, xVar: 0.45, Acap: 1.35, aVar: 0.9, kT: 0.012, kAb: 0.05, marc: 0, droughtSens: 1, frostDrop: false },
  { id: 'papyrifera', common: 'Paper birch', latin: 'Betula papyrifera', Pstart: 13.6, Tb: 20, target: 285, chl: 1.1,
    kC: 0.07, X: 0.95, xVar: 0.1, Acap: 0.03, aVar: 0.3, kT: 0.018, kAb: 0.11, marc: 0, droughtSens: 1.8, frostDrop: false },
  { id: 'rubra', common: 'Red oak', latin: 'Quercus rubra', Pstart: 13.0, Tb: 18, target: 304, chl: 1.45,
    kC: 0.042, X: 0.5, xVar: 0.2, Acap: 0.95, aVar: 0.55, kT: 0.04, kAb: 0.03, marc: 0.3, droughtSens: 0.7, frostDrop: false },
  { id: 'biloba', common: 'Ginkgo', latin: 'Ginkgo biloba', Pstart: 12.9, Tb: 18, target: 313, chl: 1.0,
    kC: 0.05, X: 1.05, xVar: 0.06, Acap: 0, aVar: 0, kT: 0.006, kAb: 0.012, marc: 0, droughtSens: 0.5, frostDrop: true },
];
export const SP_INDEX = Object.fromEntries(SPECIES.map((s, i) => [s.id, i]));
export const DEFAULTS = { seed: 7, tOffset: 0, preWarm: 0, swing: 1, sun: 0.55, rain: 1, frost: false, frostDay: 279, lat: 42.36 };

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function gauss(r) { let u = 0; while (u === 0) u = r(); const v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const doyOf = d => ((d - 1) % 365 + 365) % 365 + 1;

// daylength (Forsythe et al. 1995) and relative clear-sky daily irradiance (1 = midsummer)
const declination = doy => { const th = 0.2163108 + 2 * Math.atan(0.9671396 * Math.tan(0.00860 * (doy - 186))); return Math.asin(0.39795 * Math.cos(th)); };
export function photoperiod(d, lat) {
  const ph = declination(doyOf(d)), L = lat * Math.PI / 180, p = 0.8333 * Math.PI / 180;
  return 24 - (24 / Math.PI) * Math.acos(clamp((Math.sin(p) + Math.sin(L) * Math.sin(ph)) / (Math.cos(L) * Math.cos(ph)), -1, 1));
}
function clearSky(d, lat) {
  const L = lat * Math.PI / 180, noon = Math.max(0.03, Math.sin(Math.PI / 2 - L + declination(doyOf(d))));
  return (photoperiod(d, lat) / Math.max(1, photoperiod(172, lat))) * noon / Math.sin(Math.PI / 2 - L + 0.4091);
}

/** A year's daily weather from 1 June: a seeded generator on a temperate climatology, with any real days laid over it.
 *  real: { [doy]: { tmin, tmax, rain (mm), sun (0..1 of the possible sunshine) } } */
export function makeWeather(s, real) {
  const r = mulberry32(s.seed * 7919 + 13), n = DAY1 - DAY0 + 1, lat = clamp(Math.abs(s.lat == null ? 42.36 : s.lat), 0, 64);
  const W = { n, tmin: new Float32Array(n), tmax: new Float32Array(n), tmean: new Float32Array(n), cloud: new Float32Array(n), rad: new Float32Array(n), rain: new Float32Array(n),
    soil: new Float32Array(n), P: new Float32Array(n), real: 0 };
  let a = 0, soil = 0.72 * 140, cPrev = 0.45; const cap = 140, cloudMean = 0.78 - 0.56 * s.sun;
  for (let i = 0; i < n; i++) {
    const d = DAY0 + i, cs = Math.cos(2 * Math.PI * (d - 201) / 365);
    a = 0.7 * a + 0.714 * 2.4 * gauss(r);
    let c = clamp(0.45 * cPrev + 0.55 * cloudMean + 0.3 * gauss(r), 0, 1); cPrev = c;
    const swingDay = 8.5 * s.swing * (0.5 + 1.0 * (1 - c));
    let tmean = 11 + 12.75 * cs + s.tOffset + a + 0.8 * (c - 0.45), tmax = tmean + swingDay / 2, tmin = tmean - swingDay / 2;
    const pr = clamp((c - 0.3) * 1.1, 0, 0.8) * Math.pow(s.rain, 0.75);
    let rain = r() < pr ? -Math.log(1 - r() * 0.999) * 11.5 * Math.pow(s.rain, 0.35) : 0;
    if (s.frost && (d === s.frostDay || d === s.frostDay + 1)) { const hard = d === s.frostDay; c = 0.05; rain = 0; tmin = hard ? -5.5 : -2.5; tmax = hard ? 7 : 10; tmean = (tmin + tmax) / 2; }
    const o = real && real[d];
    if (o && isFinite(o.tmin) && isFinite(o.tmax)) { tmin = o.tmin; tmax = o.tmax; tmean = (tmin + tmax) / 2; if (isFinite(o.rain)) rain = o.rain; if (isFinite(o.sun)) c = clamp(1 - o.sun, 0, 1); W.real++; }
    const et = (0.55 + 0.21 * Math.max(0, tmean)) * (0.5 + 0.5 * (1 - c)) * Math.sqrt(soil / cap);
    soil = clamp(soil + rain - et, 0, cap);
    W.tmin[i] = tmin; W.tmax[i] = tmax; W.tmean[i] = tmean; W.cloud[i] = c; W.rain[i] = rain; W.soil[i] = soil / cap; W.P[i] = photoperiod(d, lat); W.rad[i] = clearSky(d, lat) * (1 - 0.72 * c);
  }
  return W;
}

function treeDrive(sp, W, s) {
  const S = new Float32Array(W.n), Pst = sp.Pstart + 0.086 * (s.preWarm || 0); let acc = 0;
  for (let i = 0; i < W.n; i++) {
    const P = W.P[i], T = W.tmean[i], d = DAY0 + i;
    if (d > 172 && P < Pst && T < sp.Tb) acc += (sp.Tb - T) * (P / Pst);
    if (W.soil[i] < 0.3) acc += sp.Ycrit * 0.012 * sp.droughtSens * (0.3 - W.soil[i]) / 0.3;
    S[i] = acc / sp.Ycrit;
  }
  return S;
}

// pigment absorbance -> the light a leaf sends back (linear RGB). A little is reflected by the surface whatever is inside.
// (Chlorophyll's green absorbance is set so a summer leaf reflects about 15% in the green, as real leaves do; Turning Grove's was brighter.)
const ABS = { C: [2.4, 1.15, 2.6], X: [0.0, 0.3, 3.3], A: [0.12, 2.7, 1.05], T: [0.95, 1.35, 1.95] }, BASE = [0.86, 0.80, 0.6];
export const SURFACE = 0.035;
export function reflect(C, X, A, T, out = [0, 0, 0]) {
  for (let k = 0; k < 3; k++) out[k] = SURFACE + (1 - SURFACE) * BASE[k] * Math.exp(-(ABS.C[k] * C + ABS.X[k] * X + ABS.A[k] * A + ABS.T[k] * T));
  return out;
}
/** The same in GLSL, for the shaders that colour leaves. */
export const REFLECT_GLSL = /* glsl */`
vec3 leafReflect(vec4 pg){   // pg = chlorophyll, carotenoid, anthocyanin, tannin
  vec3 k = vec3(2.4, 1.15, 2.6) * pg.x + vec3(0.0, 0.3, 3.3) * pg.y + vec3(0.12, 2.7, 1.05) * pg.z + vec3(0.95, 1.35, 1.95) * pg.w;
  return ${SURFACE.toFixed(3)} + ${(1 - SURFACE).toFixed(3)} * vec3(0.86, 0.80, 0.6) * exp(-k);
}`;

// the 64 kinds of leaf on a tree: how sunlit, and how this one differs from its neighbours
const ZQ = [-1.45, -0.85, -0.45, -0.15, 0.15, 0.45, 0.85, 1.45];
function leafClasses(sp, si) {
  const r = mulberry32(977 + si * 131), out = [], perm = k => { const p = ZQ.slice(); for (let i = 7; i > 0; i--) { const j = Math.floor(mulberry32(k * 53 + si * 7 + i)() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } return p; };
  const zj = perm(1), za = perm(2), zx = perm(3), zb = perm(4);
  for (let ei = 0; ei < NE; ei++) for (let ji = 0; ji < NJ; ji++) {
    const e = clamp((ei + 0.5) / NE, 0.04, 1), q = (ji + ei * 3) % NJ;
    out.push({ e, thr: clamp(1 + 0.16 * zj[q] - 0.22 * (e - 0.5), 0.6, 1.5), aMul: Math.exp(sp.aVar * za[(q + ei) % NJ] - sp.aVar * sp.aVar / 2), xMul: clamp(1 + sp.xVar * zx[(q + 2 * ei) % NJ], 0.15, 1.4),
      abThr: 0.75 + (zb[(q + 5 * ei) % NJ] + 1.45) / 2.9 * 0.55, marc: sp.marc > 0 && r() < sp.marc * (1.3 - 0.8 * e), dropJit: Math.floor(r() * 3) });
  }
  return out;
}

// one leaf through the season; calls back each stored day with its pigments. Returns the day it fell (9999 = still on).
function runLeaf(sp, l, W, drive, each) {
  let C = 1, X = sp.X * l.xMul, A = 0, T = 0, Sg = 0.6, Ab = 0, fd = 0, fallen = -1, pendingDrop = -1;
  for (let i = 0; i < W.n; i++) {
    const d = DAY0 + i, tmin = W.tmin[i], tmax = W.tmax[i], w = W.soil[i], light = W.rad[i] * (0.28 + 0.72 * l.e);
    if (fallen < 0) {
      const sDrive = drive[i] / l.thr, on = smooth(0.9, 1.06, sDrive);
      let dmg = 0;
      if (tmin < -1.5) { dmg = (-1.5 - tmin) * 0.2 * (0.55 + 0.45 * l.e) * (C > 0.05 ? 1 : 0.3); fd += dmg; }
      const killed = clamp(fd, 0, 1), coldLight = light * clamp((8 - tmin) / 10, 0, 1);
      C *= Math.exp(-sp.kC * on * (0.6 + 0.9 * clamp(sDrive - 1, 0, 1.5)) * (1 + 0.45 * coldLight) * (1 - killed * 0.9));
      C *= Math.exp(-dmg * 1.6);                                      // frost destroys chlorophyll in place
      const prod = C * light * clamp((tmax - 3) / 15, 0, 1) * 0.5, expK = 0.62 * clamp((tmin + 1) / 12, 0.07, 1) * (1 - 0.85 * clamp(Ab, 0, 1));
      Sg = Sg + prod - expK * Sg;                                     // sugar: made in the light, exported unless the night is cold or the stalk is sealing
      const cool = tmin <= -2 ? 0 : tmin < 1 ? (tmin + 2) / 3 : tmin <= 7 ? 1 : Math.max(0.12, 1 - (tmin - 7) / 9);
      const water = w < 0.12 ? 0.3 + w / 0.12 * 0.5 : w < 0.4 ? 1.18 : w > 0.85 ? 0.9 : 1, metab = clamp(C * 1.8 + 0.25, 0, 1) * (1 - killed);
      A += sp.Acap * l.aMul * on * (Sg / (Sg + 0.55)) * Math.pow(light, 0.8) * cool * water * metab * 0.3;
      A *= (1 - 0.01) * (1 - 0.6 * Math.min(dmg, 1));
      X *= Math.exp(-(0.003 + 0.016 * on * clamp(1 - C * 2, 0, 1)) - dmg * 0.35);
      const drought = w < 0.15 ? (0.15 - w) / 0.15 * 0.02 * sp.droughtSens : 0;
      T += sp.kT * on * (1 - C) * (1 - C) * (0.7 + 0.6 * (1 - l.e)) + dmg * 0.55 * (0.35 + C) + drought * (0.3 + on);
      Ab += sp.kAb * on * Math.pow(1 - C, 1.5) * (1 + 0.8 * killed) + (W.rain[i] > 14 && Ab > 0.5 ? 0.06 : 0) + drought * 0.5;
      if (sp.frostDrop && tmin < -2 && C < 0.7 && pendingDrop < 0 && d > 270) pendingDrop = d + l.dropJit;   // ginkgo: the whole tree lets go after the first hard frost
      if (pendingDrop > 0 && d >= pendingDrop) Ab = 99;
      if (Ab >= l.abThr && !(l.marc && Ab < 99)) fallen = d;
      if (l.marc && d > 330) Ab = Math.min(Ab, l.abThr * 0.98);
    } else { A *= 0.965; X *= 0.975; T += 0.028; C *= 0.9; }           // on the ground: reds leach, everything browns
    if (each && d >= D0) each(d - D0, C * sp.chl, X, A, T, fallen >= 0);
  }
  return fallen < 0 ? 9999 : fallen;
}
function halfDay(sp, W, s) {
  const drive = treeDrive(sp, W, s); let C = 1;
  for (let i = 0; i < W.n; i++) {
    const sD = drive[i], on = smooth(0.9, 1.06, sD), light = W.rad[i] * 0.64, coldLight = light * clamp((8 - W.tmin[i]) / 10, 0, 1);
    C *= Math.exp(-sp.kC * on * (0.6 + 0.9 * clamp(sD - 1, 0, 1.5)) * (1 + 0.45 * coldLight));
    if (C < 0.5) return DAY0 + i;
  }
  return 9999;
}
let calibrated = false;
/** Set each species' critical cold sum so a typical leaf is half-turned on its target date in an ordinary year at 42°N. */
export function calibrate() {
  if (calibrated) return; calibrated = true;
  const W = makeWeather(DEFAULTS);
  for (const sp of SPECIES) { let lo = 10, hi = 6000; for (let it = 0; it < 40; it++) { sp.Ycrit = (lo + hi) / 2; if (halfDay(sp, W, DEFAULTS) < sp.target) lo = sp.Ycrit; else hi = sp.Ycrit; } sp.Ycrit = (lo + hi) / 2; }
}

/** Run the year. Returns
 *    table   Uint8Array, (ND + 1) x (species * NC) RGBA: per day, a leaf class's pigments; the last column holds its fall day
 *    stats   per species: fallen[], rate[] (fraction of the crown per day), fallCol[], litterCol[] (linear RGB per day), turn, peak, bare (doy)
 *    W       the weather used */
export function simulate(settings, real) {
  calibrate();
  const s = Object.assign({}, DEFAULTS, settings), W = makeWeather(s, real), TW = ND + 1, table = new Uint8Array(TW * SPECIES.length * NC * 4), stats = [], rf = [0, 0, 0];
  SPECIES.forEach((sp, si) => {
    const drive = treeDrive(sp, W, s), classes = leafClasses(sp, si);
    const fallen = new Float32Array(ND), fc = new Float32Array(ND * 3), fn = new Float32Array(ND), lc = new Float32Array(ND * 3), ln = new Float32Array(ND), ac = new Float32Array(ND * 3), green = new Float32Array(ND), falls = [];
    classes.forEach((l, ci) => {
      const row = (si * NC + ci) * TW * 4;
      const fall = runLeaf(sp, l, W, drive, (k, C, X, A, T, down) => {
        const o = row + k * 4; table[o] = clamp(C / Q.C, 0, 1) * 255; table[o + 1] = clamp(X / Q.X, 0, 1) * 255; table[o + 2] = clamp(A / Q.A, 0, 1) * 255; table[o + 3] = clamp(T / Q.T, 0, 1) * 255;
        reflect(C, X, A, T, rf);
        if (down) { fallen[k] += 1 / NC; lc[k * 3] += rf[0]; lc[k * 3 + 1] += rf[1]; lc[k * 3 + 2] += rf[2]; ln[k]++; }
        else { ac[k * 3] += rf[0]; ac[k * 3 + 1] += rf[1]; ac[k * 3 + 2] += rf[2]; fn[k]++; green[k] += C / sp.chl / NC; }
      });
      falls.push(fall);
      const f16 = fall >= 9999 ? 65535 : Math.round(clamp((fall - D0) / ND, 0, 0.9999) * 65535), o = row + ND * 4;
      table[o] = f16 >> 8; table[o + 1] = f16 & 255; table[o + 2] = l.marc ? 255 : 0; table[o + 3] = 255;
    });
    // the colour of what is coming down now: leaves about to fall, else whatever is still up
    for (let k = 0; k < ND; k++) {
      let r = 0, g = 0, b = 0, n = 0;
      classes.forEach((l, ci) => { const d = falls[ci] - D0; if (d >= k - 1 && d <= k + 3) { const o = (si * NC + ci) * TW * 4 + k * 4; reflect(table[o] / 255 * Q.C, table[o + 1] / 255 * Q.X, table[o + 2] / 255 * Q.A, table[o + 3] / 255 * Q.T, rf); r += rf[0]; g += rf[1]; b += rf[2]; n++; } });
      if (n) { fc[k * 3] = r / n; fc[k * 3 + 1] = g / n; fc[k * 3 + 2] = b / n; }
      else if (fn[k]) { fc[k * 3] = ac[k * 3] / fn[k]; fc[k * 3 + 1] = ac[k * 3 + 1] / fn[k]; fc[k * 3 + 2] = ac[k * 3 + 2] / fn[k]; }
      else { fc[k * 3] = 0.2; fc[k * 3 + 1] = 0.13; fc[k * 3 + 2] = 0.07; }
      if (ln[k]) { lc[k * 3] /= ln[k]; lc[k * 3 + 1] /= ln[k]; lc[k * 3 + 2] /= ln[k]; } else { lc[k * 3] = fc[k * 3]; lc[k * 3 + 1] = fc[k * 3 + 1]; lc[k * 3 + 2] = fc[k * 3 + 2]; }
      if (fn[k]) { ac[k * 3] /= fn[k]; ac[k * 3 + 1] /= fn[k]; ac[k * 3 + 2] /= fn[k]; }
    }
    const rate = new Float32Array(ND); for (let k = 0; k < ND; k++) rate[k] = (fallen[Math.min(ND - 1, k + 2)] - fallen[Math.max(0, k - 2)]) / 4;
    const first = (arr, test) => { for (let k = 0; k < ND; k++) if (test(arr[k])) return D0 + k; return 9999; };
    stats.push({ fallen, rate, fallCol: fc, litterCol: lc, crownCol: ac, green, turn: first(green, v => v < 0.75), peak: first(green, v => v < 0.35), bare: first(fallen, v => v > 0.8) });
  });
  return { table, width: TW, height: SPECIES.length * NC, stats, W };
}
