// astro.js — where the sun, moon, planets and stars are, seen from a place at a moment.
// Low-precision formulas, good to the eye: the sun to about 0.01°, the moon to about 0.2° (a truncated Meeus series, with
// parallax), the planets to a few arcminutes (JPL's approximate Keplerian elements, valid 1800–2050). Star positions are
// J2000, carried to the date by IAU 1976 precession.
//
// Scene axes: +x east, +y up, −z north (so the garden's north wall is at −z and the noon sun shines on its inner face).

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const { sin, cos, tan, asin, atan2, sqrt, log10, PI } = Math;
export const julian = date => date.getTime() / 86400000 + 2440587.5;
const norm360 = x => ((x % 360) + 360) % 360;
export const gmstDeg = J => norm360(280.46061837 + 360.98564736629 * (J - 2451545.0));
const obliquity = J => (23.439 - 0.00000036 * (J - 2451545.0)) * D2R;

export function sunEq(J) {
  const d = J - 2451545.0, g = (357.529 + 0.98560028 * d) * D2R, q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * sin(g) + 0.020 * sin(2 * g)) * D2R, e = obliquity(J), R = 1.00014 - 0.01671 * cos(g) - 0.00014 * cos(2 * g);
  return { ra: atan2(cos(e) * sin(L), cos(L)), dec: asin(sin(e) * sin(L)), lon: L, distAU: R };
}

export function moonEq(J) {
  const d = J - 2451545.0;
  const L = 218.316 + 13.176396 * d, M = (134.963 + 13.064993 * d) * D2R, F = (93.272 + 13.229350 * d) * D2R, D = (297.850 + 12.190749 * d) * D2R, Ms = (357.529 + 0.98560028 * d) * D2R;
  const lon = (L + 6.289 * sin(M) + 1.274 * sin(2 * D - M) + 0.658 * sin(2 * D) + 0.214 * sin(2 * M) - 0.186 * sin(Ms) - 0.114 * sin(2 * F)
    - 0.059 * sin(2 * D - 2 * M) - 0.057 * sin(2 * D - Ms - M) + 0.053 * sin(2 * D + M) + 0.046 * sin(2 * D - Ms) - 0.041 * sin(Ms - M) - 0.035 * sin(D) - 0.031 * sin(M + Ms)) * D2R;
  const lat = (5.128 * sin(F) + 0.281 * sin(M + F) + 0.278 * sin(M - F) + 0.173 * sin(2 * D - F) + 0.055 * sin(2 * D - M + F) - 0.046 * sin(2 * D - M - F) + 0.033 * sin(2 * D + F) + 0.017 * sin(2 * M + F)) * D2R;
  const dist = 385001 - 20905 * cos(M) - 3699 * cos(2 * D - M) - 2956 * cos(2 * D) - 570 * cos(2 * M);   // km
  const e = obliquity(J);
  return { ra: atan2(sin(lon) * cos(e) - tan(lat) * sin(e), cos(lon)), dec: asin(sin(lat) * cos(e) + cos(lat) * sin(e) * sin(lon)), lon, lat, dist };
}

// JPL "Approximate Positions of the Planets", Table 1: a (AU), e, I, L, long. perihelion, long. node (deg), and rates per century
const EL = {
  mercury: [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593, 0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  venus:   [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255, 0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418],
  earth:   [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0, 0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
  mars:    [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891, 0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  jupiter: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909, -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  saturn:  [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448, -0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
};
function helio(k, T) {   // heliocentric ecliptic J2000 position, AU
  const E0 = EL[k], a = E0[0] + E0[6] * T, e = E0[1] + E0[7] * T, I = (E0[2] + E0[8] * T) * D2R, L = E0[3] + E0[9] * T, wb = E0[4] + E0[10] * T, Om = E0[5] + E0[11] * T;
  const w = (wb - Om) * D2R, O = Om * D2R; let M = norm360(L - wb); if (M > 180) M -= 360; M *= D2R;
  let E = M + e * sin(M); for (let i = 0; i < 8; i++) E -= (E - e * sin(E) - M) / (1 - e * cos(E));
  const xp = a * (cos(E) - e), yp = a * sqrt(1 - e * e) * sin(E);
  return [(cos(w) * cos(O) - sin(w) * sin(O) * cos(I)) * xp + (-sin(w) * cos(O) - cos(w) * sin(O) * cos(I)) * yp,
          (cos(w) * sin(O) + sin(w) * cos(O) * cos(I)) * xp + (-sin(w) * sin(O) + cos(w) * cos(O) * cos(I)) * yp,
          (sin(w) * sin(I)) * xp + (cos(w) * sin(I)) * yp];
}
// visual magnitude: H + 5 log10(r Δ) + phase terms (Astronomical Almanac, older forms; Saturn's rings ignored)
const MAG = {   // Mercury and Venus from Mallama & Hilton (2018), which hold near conjunction
  mercury: i => -0.613 + 6.3280e-2 * i - 1.6336e-3 * i ** 2 + 3.3644e-5 * i ** 3 - 3.4265e-7 * i ** 4 + 1.6893e-9 * i ** 5 - 3.0334e-12 * i ** 6,
  venus: i => i < 163.7 ? -4.384 - 1.044e-3 * i + 3.687e-4 * i ** 2 - 2.814e-6 * i ** 3 + 8.938e-9 * i ** 4 : 236.05828 - 2.81914 * i + 8.39034e-3 * i ** 2, mars: i => -1.52 + 0.016 * i, jupiter: i => -9.40 + 0.005 * i, saturn: () => -8.88 };
export const PLANETS = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];
export function planetsEq(J) {
  const T = (J - 2451545.0) / 36525, ea = helio('earth', T), e = 23.43928 * D2R, out = {};
  for (const k of PLANETS) {
    const p = helio(k, T), x = p[0] - ea[0], y = p[1] - ea[1], z = p[2] - ea[2];
    const r = Math.hypot(...p), Dl = Math.hypot(x, y, z), R = Math.hypot(...ea);
    const i = Math.acos(Math.max(-1, Math.min(1, (r * r + Dl * Dl - R * R) / (2 * r * Dl)))) * R2D;   // phase angle
    const xe = x, ye = y * cos(e) - z * sin(e), ze = y * sin(e) + z * cos(e);
    out[k] = { ra: atan2(ye, xe), dec: atan2(ze, Math.hypot(xe, ye)), mag: MAG[k](i) + 5 * log10(r * Dl) };
  }
  return out;
}

// precession from J2000 to date (IAU 1976): returns the 3x3 rotation as a flat row-major array
export function precession(J) {
  const T = (J - 2451545.0) / 36525, as = D2R / 3600;
  const z0 = (2306.2181 * T + 0.30188 * T * T) * as, zz = (2306.2181 * T + 1.09468 * T * T) * as, th = (2004.3109 * T - 0.42665 * T * T) * as;
  const cz0 = cos(z0), sz0 = sin(z0), cz = cos(zz), sz = sin(zz), ct = cos(th), st = sin(th);
  return [cz0 * ct * cz - sz0 * sz, -sz0 * ct * cz - cz0 * sz, -st * cz,
          cz0 * ct * sz + sz0 * cz, -sz0 * ct * sz + cz0 * cz, -st * sz,
          cz0 * st, -sz0 * st, ct];
}
function precess(ra, dec, P) {
  const x = cos(dec) * cos(ra), y = cos(dec) * sin(ra), z = sin(dec);
  const X = P[0] * x + P[1] * y + P[2] * z, Y = P[3] * x + P[4] * y + P[5] * z, Z = P[6] * x + P[7] * y + P[8] * z;
  return [atan2(Y, X), asin(Math.max(-1, Math.min(1, Z)))];
}
// equatorial -> scene direction, for latitude lat (rad) and local sidereal time lst (rad)
export function eqToScene(ra, dec, lat, lst, out) {
  const H = lst - ra, E = -cos(dec) * sin(H), N = sin(dec) * cos(lat) - cos(dec) * cos(H) * sin(lat), U = sin(dec) * sin(lat) + cos(dec) * cos(H) * cos(lat);
  return out.set(E, U, -N);
}
// the same as a rotation, for the whole star sphere: v_scene = A · Rz(−lst) · v_equatorial
export function eqMatrix(lat, lst, m4, P = null) {   // P: precession, so J2000 catalogue positions land where they are on the date
  const cl = cos(lst), sl = sin(lst), cp = cos(lat), sp = sin(lat);
  // Rz(-lst) = [[cl, sl, 0], [-sl, cl, 0], [0, 0, 1]];  A = [[0, 1, 0], [cp, 0, sp], [sp, 0, -cp]]
  const M = [-sl, cl, 0, cp * cl, cp * sl, sp, sp * cl, sp * sl, -cp];
  const R = P ? [0, 1, 2].flatMap(r => [0, 1, 2].map(c => M[r * 3] * P[c] + M[r * 3 + 1] * P[3 + c] + M[r * 3 + 2] * P[6 + c])) : M;
  return m4.set(R[0], R[1], R[2], 0, R[3], R[4], R[5], 0, R[6], R[7], R[8], 0, 0, 0, 0, 1);
}
// atmospheric refraction lifts things near the horizon (Bennett), applied to a scene direction
export function refract(v) {
  const alt = asin(Math.max(-1, Math.min(1, v.y))) * R2D; if (alt < -2) return v;
  const R = 1.02 / tan((alt + 10.3 / (alt + 5.11)) * D2R) / 60, a2 = (alt + R) * D2R, h = Math.hypot(v.x, v.z) || 1;
  return v.set(v.x / h * cos(a2), sin(a2), v.z / h * cos(a2));
}

// everything at once, for a place and a moment
export function sky(date, latDeg, lonDeg, V3) {
  const J = julian(date), lat = latDeg * D2R, lst = (gmstDeg(J) + lonDeg) * D2R;
  const s = sunEq(J), m = moonEq(J), pl = planetsEq(J), P = precession(J);
  for (const k of PLANETS) [pl[k].ra, pl[k].dec] = precess(pl[k].ra, pl[k].dec, P);
  const sun = refract(eqToScene(s.ra, s.dec, lat, lst, new V3()));
  const moon = eqToScene(m.ra, m.dec, lat, lst, new V3());
  // topocentric parallax: the moon sits lower by its horizontal parallax times the cosine of its altitude
  const hp = asin(6378.14 / m.dist), alt = asin(moon.y) - hp * cos(asin(moon.y)), hz = Math.hypot(moon.x, moon.z) || 1;
  moon.set(moon.x / hz * cos(alt), sin(alt), moon.z / hz * cos(alt)); refract(moon);
  // phase: the angle sun–moon–earth from their geocentric elongation
  const cpsi = sin(s.dec) * sin(m.dec) + cos(s.dec) * cos(m.dec) * cos(s.ra - m.ra), psi = Math.acos(Math.max(-1, Math.min(1, cpsi)));
  const Rkm = s.distAU * 149597870.7, iang = atan2(Rkm * sin(psi), m.dist - Rkm * cos(psi)), lit = (1 + cos(iang)) / 2;
  const waxing = norm360((m.lon - s.lon) * R2D) < 180;
  const planets = PLANETS.map(k => ({ name: k, mag: pl[k].mag, ra: pl[k].ra, dec: pl[k].dec, dir: refract(eqToScene(pl[k].ra, pl[k].dec, lat, lst, new V3())) }));
  return { J, lat, lst, P, sun, moon, moonLit: lit, moonWaxing: waxing, moonDistKm: m.dist, moonRadius: asin(1737.4 / m.dist), planets };
}
export function phaseName(lit, waxing) {
  if (lit < 0.03) return 'new moon'; if (lit > 0.97) return 'full moon';
  if (Math.abs(lit - 0.5) < 0.06) return waxing ? 'first quarter' : 'last quarter';
  return (waxing ? 'waxing ' : 'waning ') + (lit < 0.5 ? 'crescent' : 'gibbous');
}
export function compass(v) { const az = norm360(atan2(v.x, -v.z) * R2D); return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(az / 45) % 8]; }
// colour of a star from its B–V index (Ballesteros' temperature, then a blackbody fit)
export function bvToRGB(bv) {
  const T = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62)), t = T / 100;
  let r, g, b;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
  else { r = 329.70 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); b = 255; }
  const c = v => Math.min(255, Math.max(0, v)) / 255; return [c(r), c(g), c(b)];
}
