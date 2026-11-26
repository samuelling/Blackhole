// From Betamax (samuelling/betamax, src/audio.js): the offline synthesis of a rifle's report, a bullet's crack and an impact,
// fitted there to recordings of real rifles (tools/sound-tuning). Taken as it is; only exported here.
import { mulberry32 } from './rng.js';
const C_SOUND = 343;
const TAU2 = Math.PI * 2;

// ---------- offline DSP helpers ----------
function coeffs(type, f, q, sr) {
  const w = TAU2 * Math.min(f, sr * 0.45) / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
  else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; }
  const a0 = 1 + al;
  return [b0 / a0, b1 / a0, b2 / a0, (-2 * cs) / a0, (1 - al) / a0];
}
function filt(x, type, f, q, sr) {
  const [b0, b1, b2, a1, a2] = coeffs(type, f, q, sr);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i], y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y;
  }
  return x;
}
function rms(x) { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / x.length) || 1; }
// filtered noise normalised to rms 0.3
function fnoise(r, n, type, f, q, sr) {
  const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = r() * 2 - 1;
  if (type) filt(x, type === 'bp1' ? 'bp' : type, f, q, sr);
  if (type === 'bp') filt(x, 'bp', f, q, sr);
  const k = 0.3 / rms(x); for (let i = 0; i < n; i++) x[i] *= k;
  return x;
}
const hump = (t, tp) => (t <= 0 ? 0 : (t / tp) * (t / tp) * Math.exp(2 * (1 - t / tp)));
// N-wave: the pressure signature of a shock (instant rise, linear fall through zero, instant recovery)
function nwave(d, i0, len, amp) { len = Math.max(2, Math.round(len)); for (let k = 0; k < len && i0 + k < d.length; k++) d[i0 + k] += amp * (1 - (2 * k) / len); }
// short decaying burst of filtered noise added at t0 (debris, grains, clods)
function grain(d, r, sr, t0, amp, dec, lpk) {
  const i0 = Math.floor(t0 * sr), len = Math.floor(dec * 5 * sr); let y = 0;
  for (let k = 0; k < len && i0 + k < d.length; k++) { y += ((r() * 2 - 1) - y) * lpk; d[i0 + k] += y * amp * Math.exp(-k / (dec * sr)); }
}
function ring(d, sr, t0, f, amp, dec) {
  const i0 = Math.floor(t0 * sr), len = Math.floor(dec * 6 * sr);
  for (let k = 0; k < len && i0 + k < d.length; k++) d[i0 + k] += Math.sin(TAU2 * f * k / sr) * amp * Math.exp(-k / (dec * sr));
}
function softclip(d, drive) { const k = Math.tanh(drive); for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * drive) / k; }
function fadeIn(d, sr, s = 0.0004) { const n = Math.floor(s * sr); for (let i = 0; i < n && i < d.length; i++) d[i] *= i / n; }

// ---------- sound recipes (forward time; mono Float32Arrays) ----------
const RIFLES = [
  // parameters fitted (tune/opt_rifle.py) to 34 real rifle recordings: flat ~125 Hz-2 kHz blast in the first 50 ms,
  // tail centred ~500 Hz-1 kHz, little below 120 Hz. The other calibres are scaled from the fitted M7.
  // 0: invaders' 5.8 mm bullpup — sharper and brighter
  { len: 0.45, nw: 0.0007, bA: 1.0, bD: 0.0014, pA: 0.6, pD: 0.0038, bodyF: 1000, bodyQ: 0.7, bodyD: 0.02, bodyA: 0.62, hiA: 0.38, hiD: 0.01, tA: 0.29, tD: 0.055, tF: 500, blF: 1500, th0: 220, th1: 110, thD: 0.016, thA: 0.16, mech: 0.1, mechF: 3300 },
  // 1: defenders' M7 6.8 mm (fitted)
  { len: 0.45, nw: 0.0009, bA: 1.0, bD: 0.00154, pA: 0.703, pD: 0.00422, bodyF: 820, bodyQ: 0.7, bodyD: 0.022, bodyA: 0.67, hiA: 0.32, hiD: 0.01, tA: 0.31, tD: 0.058, tF: 449, blF: 1120, th0: 200, th1: 95, thD: 0.022, thA: 0.198, mech: 0.12, mechF: 2900 },
  // 2: belt-fed MGs (7.62) — longer, deeper
  { len: 0.5, nw: 0.001, bA: 1.0, bD: 0.0018, pA: 0.5, pD: 0.004, bodyF: 760, bodyQ: 0.7, bodyD: 0.022, bodyA: 0.7, hiA: 0.42, hiD: 0.01, tA: 0.3, tD: 0.05, tF: 650, blF: 1500, th0: 200, th1: 110, thD: 0.018, thA: 0.15, mech: 0.1, mechF: 2400 },
  // 3: IFV 30 mm autocannon — big pressure thump and a steel clank
  { len: 0.85, nw: 0.0018, bA: 1.0, bD: 0.004, pA: 1.2, pD: 0.02, bodyF: 420, bodyQ: 0.7, bodyD: 0.05, bodyA: 0.8, hiA: 0.25, hiD: 0.012, tA: 0.35, tD: 0.11, tF: 380, blF: 900, th0: 130, th1: 55, thD: 0.06, thA: 0.6, mech: 0.3, mechF: 1250 },
];
// ---------------------------------------------------------------- the deck running
// A seamless loop of the Betamax transport in PLAY: noise with the measured spectrum (random phase, so it loops
// without a seam) plus the measured tonal lines snapped to whole cycles per loop, and the faint 60 Hz flutter of
// the drum. N must be a power of two.
function fftInPlace(re, im, inv) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k], ai = im[i + k], br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br; im[i + k] = ai + bi; re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
function synthVcrRun(r, sr, P, N = 1 << 17) {
  const re = new Float64Array(N), im = new Float64Array(N);
  const env = (f) => { const x = Math.log2(Math.max(f, P.f0) / P.f0) * P.perOct, i = Math.min(P.psd.length - 2, Math.floor(x)), t = Math.min(1, x - i); return P.psd[i] + (P.psd[i + 1] - P.psd[i]) * t; };
  let pw = 0;
  for (let k = 1; k < N / 2; k++) {
    const f = k * sr / N; if (f > sr / 2 - 200) break;
    const S = Math.pow(10, env(f) / 10) * (f < 25 ? (f / 25) ** 2 : 1), a = Math.sqrt(S), ph = r() * 2 * Math.PI;
    re[k] = a * Math.cos(ph); im[k] = a * Math.sin(ph); re[N - k] = re[k]; im[N - k] = -im[k];
    pw += S * sr / N;
  }
  fftInPlace(re, im, true);
  const x = new Float32Array(N); let e = 0; for (let i = 0; i < N; i++) e += re[i] * re[i];
  const k = Math.sqrt(pw) / Math.sqrt(e / N);
  for (let i = 0; i < N; i++) x[i] = re[i] * k;
  const T = N / sr;
  for (const [f, amp] of P.tones) { const c = Math.max(1, Math.round(f * T)), w = 2 * Math.PI * c / N, ph = r() * 6.283; for (let i = 0; i < N; i++) x[i] += amp * Math.sin(w * i + ph); }
  const cAM = Math.round(60 * T), wa = 2 * Math.PI * cAM / N;
  for (let i = 0; i < N; i++) x[i] *= 1 + 0.12 * Math.sin(wa * i);
  return x;
}


function synthRifle(r, sr, cal, opt = {}) {
  const P = RIFLES[cal], n = Math.floor(P.len * sr), d = new Float32Array(n);
  const blastK = opt.suppressed ? 0.25 : 1, bodyK = opt.suppressed ? 0.45 : 1;
  nwave(d, 0, P.nw * sr * (0.9 + r() * 0.2), 1.0 * blastK);
  // broadband blast (flat ~125 Hz-5 kHz like the recordings), low punch, a body resonance, bright edge, short tail
  const bl = fnoise(r, n, 'lp', P.blF || 3800, 0.6, sr); filt(bl, 'hp', 90, 0.6, sr);
  const pu = fnoise(r, n, 'lp', 420, 0.6, sr), bo = fnoise(r, n, 'bp1', P.bodyF * (0.9 + r() * 0.2), P.bodyQ, sr);
  const hi = fnoise(r, n, 'bp1', 2100 + r() * 500, 0.8, sr), tl = fnoise(r, n, 'bp1', P.tF || 650, 0.55, sr);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = P.th1 + (P.th0 - P.th1) * Math.exp(-t / 0.012); ph += TAU2 * f / sr;
    d[i] += bl[i] * Math.exp(-t / P.bD) * P.bA * 3.0 * blastK
      + pu[i] * Math.exp(-t / P.pD) * P.pA * 3.0 * blastK
      + bo[i] * Math.exp(-t / P.bodyD) * P.bodyA * 3.0 * bodyK
      + hi[i] * Math.exp(-t / P.hiD) * P.hiA * 3.0 * blastK
      + Math.sin(ph) * Math.exp(-t / P.thD) * P.thA * Math.min(1, t / 0.0008)
      + tl[i] * Math.min(1, t / 0.004) * Math.exp(-t / P.tD) * P.tA * 3.0;
  }
  // the action cycling: bolt carrier slams, a few metallic modes
  const tm = 0.007 + r() * 0.005, mk = P.mech * (opt.suppressed ? 2.4 : 1);
  ring(d, sr, tm, P.mechF * (0.95 + r() * 0.1), mk, 0.005); ring(d, sr, tm, P.mechF * 1.53, mk * 0.7, 0.004); ring(d, sr, tm + 0.0005, P.mechF * 2.21, mk * 0.5, 0.003);
  grain(d, r, sr, tm, mk * 1.5, 0.002, 0.6);
  if (opt.suppressed) ring(d, sr, 0, 1700, 0.25, 0.012); // can ring
  softclip(d, 1.5); fadeIn(d, sr, 0.0001);
  return d;
}
function synthCrack(r, sr) {
  const n = Math.floor(0.16 * sr), d = new Float32Array(n);
  const L = 0.0003 + r() * 0.00015;
  nwave(d, 0, L * sr, 1.0);
  const hp = fnoise(r, n, 'hp', 3200, 0.7, sr), rg = fnoise(r, n, 'bp', 5500 + r() * 1500, 4, sr), ts = fnoise(r, n, 'bp', 2600 + r() * 600, 1.5, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    d[i] += hp[i] * Math.exp(-t / 0.0015) * 1.6 + rg[i] * Math.exp(-t / 0.004) * 1.2 + ts[i] * (t > 0.002 ? Math.exp(-(t - 0.002) / 0.035) : 0) * 0.35;
  }
  softclip(d, 1.3);
  return d;
}
function synthImpact(r, sr, kind) {
  const len = kind === 'iHard' ? 0.85 : kind === 'iWater' ? 0.5 : 0.4, n = Math.floor(len * sr), d = new Float32Array(n);
  if (kind === 'iSand') {
    const lo = fnoise(r, n, 'lp', 700, 0.7, sr), sp = fnoise(r, n, 'hp', 2200, 0.7, sr);
    for (let i = 0; i < n; i++) { const t = i / sr; d[i] = lo[i] * Math.min(1, t / 0.001) * Math.exp(-t / 0.025) * 2.4 + sp[i] * Math.exp(-t / 0.1) * 0.35; }
    for (let k = 0; k < 24; k++) grain(d, r, sr, 0.01 + Math.pow(r(), 1.5) * 0.3, 0.12 * r(), 0.002, 0.5);
  } else if (kind === 'iWater') {
    const no = fnoise(r, n, 'bp', 1500, 0.9, sr); let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr; ph += TAU2 * (600 + 900 * (1 - Math.exp(-t / 0.02))) / sr;
      d[i] = Math.sin(ph) * Math.exp(-t / 0.035) * 0.5 + no[i] * Math.min(1, t / 0.002) * Math.exp(-t / 0.06) * 1.6;
    }
    for (let k = 0; k < 10; k++) { const t0 = 0.05 + r() * 0.35, f = 1200 + r() * 2200; ring(d, sr, t0, f, 0.08, 0.01); }
  } else if (kind === 'iBody') {
    const sl = fnoise(r, n, 'lp', 1500, 0.7, sr), cl = fnoise(r, n, 'hp', 3000, 0.7, sr);
    for (let i = 0; i < n; i++) { const t = i / sr; d[i] = Math.sin(TAU2 * 105 * t) * Math.exp(-t / 0.035) * 0.9 + sl[i] * Math.exp(-t / 0.01) * 2 + cl[i] * Math.exp(-t / 0.0015) * 1.2; }
  } else {
    // steel: inharmonic ping, often followed by a ricochet whine sliding down
    const modes = [[2350, 0.32, 0.22], [3910, 0.24, 0.13], [5720, 0.16, 0.07], [1430, 0.12, 0.3]];
    for (const [f, a, dc] of modes) ring(d, sr, 0, f * (0.93 + r() * 0.14), a, dc);
    const cl = fnoise(r, n, 'hp', 2500, 0.7, sr);
    for (let i = 0; i < n; i++) d[i] += cl[i] * Math.exp(-i / sr / 0.002) * 2;
    if (r() < 0.75) {
      let ph = 0; const f0 = 3800 + r() * 1500, f1 = 900 + r() * 700, T = 0.55;
      for (let i = Math.floor(0.03 * sr); i < n; i++) {
        const t = i / sr - 0.03; if (t > T) break;
        const f = f1 + (f0 - f1) * Math.exp(-t / 0.25) + Math.sin(t * 190) * 60; ph += TAU2 * f / sr;
        d[i] += Math.sin(ph) * hump(t, 0.06) * Math.exp(-t / 0.3) * 0.28;
      }
    }
  }
  softclip(d, 1.2); fadeIn(d, sr);
  return d;
}
// explosion kinds
const BOOMS = {
  // fitted against real detonations (decay to -10/-20/-30 dB ≈ 110/380/830 ms; energy centred ~125-250 Hz,
  // a 1 kHz shoulder, the tail as loud as the first 50 ms); see tune/ and refs/features.json
  eShell: { len: 4.0, crack: 0.6, bodyF: 300, bodyD: 0.1, bodyA: 2.4, sub: 60, subD: 0.15, subA: 0.8, cr: 1200, crD: 0.05, crA: 0.5, midA: 1.6, midD: 0.09, rumA: 0.3, rumD: 0.45, deb: 170, debT: 2.6, debA: 0.6, sand: 0.1 },
  eMortar: { len: 3.0, crack: 0.7, bodyF: 330, bodyD: 0.08, bodyA: 2.2, sub: 70, subD: 0.12, subA: 0.7, cr: 1600, crD: 0.05, crA: 0.5, midA: 1.6, midD: 0.07, rumA: 0.22, rumD: 0.35, deb: 110, debT: 1.9, debA: 0.6, sand: 0.1, frag: 1 },
  eDrone: { len: 2.0, crack: 1.0, bodyF: 520, bodyD: 0.06, bodyA: 1.8, sub: 80, subD: 0.08, subA: 0.5, cr: 2400, crD: 0.04, crA: 0.8, midA: 1.5, midD: 0.05, rumA: 0.12, rumD: 0.25, deb: 35, debT: 0.9, debA: 0.6, sand: 0.06, frag: 0.6 },
  eRocket: { len: 3.3, crack: 0.7, bodyF: 340, bodyD: 0.09, bodyA: 2.3, sub: 62, subD: 0.14, subA: 0.8, cr: 1500, crD: 0.05, crA: 0.6, midA: 1.6, midD: 0.08, rumA: 0.28, rumD: 0.42, deb: 130, debT: 2.1, debA: 0.6, sand: 0.1 },
  eBig: { len: 5.0, crack: 0.6, bodyF: 240, bodyD: 0.18, bodyA: 2.6, sub: 45, subD: 0.3, subA: 1.0, cr: 900, crD: 0.08, crA: 0.5, midA: 1.5, midD: 0.14, rumA: 0.45, rumD: 0.9, deb: 200, debT: 3.4, debA: 0.6, sand: 0.12, metal: 1 },
  eAir: { len: 3.2, crack: 1.0, bodyF: 380, bodyD: 0.09, bodyA: 2.0, sub: 60, subD: 0.14, subA: 0.6, cr: 2000, crD: 0.06, crA: 0.7, midA: 1.6, midD: 0.08, rumA: 0.35, rumD: 0.6, deb: 0, debT: 0, sand: 0, frag: 1.4 },
  eWater: { len: 4.2, crack: 0.4, bodyF: 220, bodyD: 0.12, bodyA: 2.2, sub: 50, subD: 0.2, subA: 1.0, cr: 800, crD: 0.05, crA: 0.3, midA: 1.0, midD: 0.08, rumA: 0.3, rumD: 0.5, deb: 0, debT: 0, sand: 0, water: 1 },
};
if (typeof globalThis !== 'undefined' && globalThis.__BOOM_TUNE) globalThis.__BOOM_TUNE(BOOMS);
function synthBoom(r, sr, kind) {
  const P = BOOMS[kind], n = Math.floor(P.len * sr), d = new Float32Array(n);
  nwave(d, 0, 0.0016 * sr, P.crack);
  const hi = fnoise(r, n, 'hp', 1500, 0.7, sr), body = fnoise(r, n, 'lp', P.bodyF, 0.8, sr), cr = fnoise(r, n, 'bp', P.cr, 0.8, sr), mid = fnoise(r, n, 'bp1', 750, 0.5, sr), rum = fnoise(r, n, 'lp', 140, 0.7, sr);
  filt(body, 'lp', P.bodyF * 1.2, 0.7, sr); filt(body, 'hp', 45, 0.7, sr); filt(rum, 'hp', 40, 0.7, sr);
  const kb = 0.3 / rms(body); for (let i = 0; i < n; i++) body[i] *= kb;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = P.sub * (1 + 1.6 * Math.exp(-t / 0.05)); ph += TAU2 * f / sr;
    d[i] += hi[i] * Math.exp(-t / 0.006) * 2.6 * P.crack
      + body[i] * Math.min(1, t / 0.003) * Math.exp(-t / P.bodyD) * P.bodyA * 2.6
      + Math.sin(ph) * Math.min(1, t / 0.002) * Math.exp(-t / P.subD) * P.subA
      + cr[i] * Math.exp(-t / P.crD) * P.crA * 2.4
      + mid[i] * Math.min(1, t / 0.004) * Math.exp(-t / (P.midD || 0.2)) * (P.midA || 0) * 2.4
      + rum[i] * Math.min(1, t / 0.05) * Math.exp(-t / (P.rumD || 0.8)) * (P.rumA || 0) * 2.4;
  }
  // fragments: a few high, fast whips through the air in the first moments
  if (P.frag) for (let k = 0; k < 7 * P.frag; k++) grain(d, r, sr, 0.01 + r() * 0.12, 0.25 * r(), 0.004 + r() * 0.01, 0.5);
  // debris and clods coming back down, dense early then sparse, plus a sand-rain hiss
  if (P.deb) {
    for (let k = 0; k < P.deb; k++) {
      const t0 = 0.12 + P.debT * Math.pow(r(), 1.6), fall = 1 - t0 / (P.debT + 0.3);
      grain(d, r, sr, t0, (0.05 + r() * 0.3) * fall * (P.debA || 1), 0.003 + r() * 0.012, 0.06 + r() * 0.2);
    }
    const sd = fnoise(r, n, 'bp', 1900, 0.6, sr), tp = P.debT * 0.35;
    for (let i = 0; i < n; i++) d[i] += sd[i] * hump(i / sr, tp) * P.sand * Math.exp(-i / sr / P.debT);
    if (P.metal) for (let k = 0; k < 14; k++) { const t0 = 0.3 + r() * 2.5; ring(d, sr, t0, 600 + r() * 2400, 0.12 * r(), 0.05 + r() * 0.15); }
  }
  if (P.water) {
    // the water column collapsing: long rushing splash with droplets
    const sp = fnoise(r, n, 'hp', 900, 0.7, sr), tp = 0.9;
    for (let i = 0; i < n; i++) { const t = i / sr; d[i] += sp[i] * hump(t, tp) * Math.exp(-Math.max(0, t - tp) / 1.0) * 0.9; }
    for (let k = 0; k < 140; k++) { const t0 = 0.4 + Math.pow(r(), 0.8) * 2.8; ring(d, sr, t0, 900 + r() * 2600, 0.05 * r(), 0.008); }
  }
  { let pk = 1e-6; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i])); const k = 1.3 / pk; for (let i = 0; i < n; i++) d[i] *= k; }
  softclip(d, P.drive || 1.0); fadeIn(d, sr, 0.0002);
  return d;
}
// incoming rounds: rushing whistle that grows to the moment of impact (the event is at the END of this buffer)
function synthWhistle(r, sr, kind) {
  const D = kind === 'wMortar' ? 2.1 : 1.7, n = Math.floor(D * sr), d = new Float32Array(n);
  let low = 0, band = 0, ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, u = t / D;
    const fc = kind === 'wMortar' ? 1150 - 500 * u : 520 - 180 * u;
    const f1 = 2 * Math.sin(Math.PI * fc / sr), q = kind === 'wMortar' ? 0.35 : 0.9;
    const x = r() * 2 - 1; low += f1 * band; const high = x - low - q * band; band += f1 * high;
    ph += TAU2 * (kind === 'wMortar' ? 1250 - 420 * u : 0) / sr;
    const env = Math.exp((t - D) / (kind === 'wMortar' ? 0.5 : 0.42)) * Math.min(1, t / 0.08);
    const flutter = kind === 'wMortar' ? 1 + 0.2 * Math.sin(t * 2 * Math.PI * 23) : 1 + 0.35 * Math.sin(t * 2 * Math.PI * 31);
    d[i] = (band * 0.6 + Math.sin(ph) * 0.18) * env * flutter;
  }
  let pk = 1e-6; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i]));
  const k = 0.9 / pk; for (let i = 0; i < n; i++) d[i] *= k;
  for (let i = 0; i < 64; i++) d[n - 1 - i] *= i / 64;
  return d;
}
function synthThoonk(r, sr) {
  const n = Math.floor(0.9 * sr), d = new Float32Array(n);
  nwave(d, 0, 0.002 * sr, 0.8);
  const lo = fnoise(r, n, 'lp', 420, 0.7, sr), tube = fnoise(r, n, 'bp', 520, 8, sr); let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr; ph += TAU2 * (45 + 50 * Math.exp(-t / 0.03)) / sr;
    d[i] += Math.sin(ph) * Math.exp(-t / 0.09) * 1.2 + lo[i] * Math.exp(-t / 0.03) * 2.4 + tube[i] * Math.exp(-t / 0.22) * 0.9;
  }
  softclip(d, 1.3);
  return d;
}
function synthMissile(r, sr) {
  // soft-launch pop, then the flight motor lights and roars away
  const n = Math.floor(2.4 * sr), d = new Float32Array(n);
  nwave(d, 0, 0.0015 * sr, 0.7);
  const pop = fnoise(r, n, 'lp', 900, 0.7, sr), roar = fnoise(r, n, 'lp', 2600, 0.6, sr), hiss = fnoise(r, n, 'hp', 3000, 0.7, sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr, m = t - 0.32;
    d[i] += pop[i] * Math.exp(-t / 0.04) * 2;
    if (m > 0) { const e = Math.min(1, m / 0.025) * Math.exp(-m / 0.75); d[i] += (roar[i] * 2.2 + hiss[i] * 0.8) * e * (1 + 0.3 * (r() - 0.5)); }
  }
  for (let k = 0; k < 60; k++) grain(d, r, sr, 0.33 + r() * 0.9, 0.2 * r(), 0.002, 0.7);
  softclip(d, 1.3);
  return d;
}
// impulse responses: open beach with a hard ground bounce, slap-back off the dunes and houses, rolling tail
function synthIR(r, sr, far) {
  const D = far ? 2.9 : 1.9, n = Math.floor(D * sr), d = new Float32Array(n);
  const tail = fnoise(r, n, 'lp', far ? 1000 : 1200, 0.6, sr);
  for (let i = 0; i < n; i++) { const t = i / sr; d[i] = tail[i] * Math.min(1, t / 0.05) * Math.exp(-t / (far ? 0.5 : 0.26)) * (far ? 0.5 : 0.35); }
  d[Math.floor(0.004 * sr)] += 0.5;
  const echoes = far ? [[0.09, 0.3], [0.38, 0.35], [0.7, 0.28], [1.2, 0.22], [1.9, 0.14]] : [[0.065, 0.3], [0.11, 0.22], [0.26, 0.24], [0.43, 0.18], [0.61, 0.12]];
  for (const [t0, a] of echoes) grain(d, r, sr, t0 + (r() - 0.5) * 0.02, a * 2.2, 0.006 + (far ? 0.015 : 0.008), far ? 0.1 : 0.16);
  let e = 0; for (let i = 0; i < n; i++) e += d[i] * d[i];
  const k = 1 / Math.sqrt(e || 1); for (let i = 0; i < n; i++) d[i] *= k; // unit energy: the wet gain alone sets the level
  return d;
}

// ---------- forward "bang": the first instant of a report, played forward on top of the reversed shot ----------
function synthBang(r, sr, cal) {
  const x = synthRifle(r, sr, cal), n = Math.floor(0.14 * sr), d = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / sr; d[i] = x[i] * (t < 0.004 ? 1 : Math.exp(-(t - 0.004) / (cal === 3 ? 0.03 : 0.016))); }
  return d;
}

export { synthRifle, synthCrack, synthImpact, synthBang, RIFLES, mulberry32 };
