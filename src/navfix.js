// navfix.js: the arithmetic of a star fix (no drawing: nav.js does that). Celestial navigation as it has been done since the
// eighteenth century, by the altitude-intercept method (Marcq St Hilaire, 1875):
//
//  - Every star stands straight overhead somewhere: its ground point, at latitude = its declination, longitude = where its hour
//    angle is zero. Measure its altitude above the level (a bubble sextant carries its own level), and you know how far you are
//    from that point: 90° minus the altitude, a degree of arc being 60 nautical miles. So one sight puts you somewhere on a circle.
//  - A second star gives a second circle; they cross twice. A third picks the crossing, and the three never quite meet: the little
//    triangle they leave (the navigator's "cocked hat") is the size of your errors.
//  - Near where you are, each circle is as good as a straight line square to the star's bearing: the line of position. Guess a
//    position, work out what the altitude would be there (Hc), compare with what you measured (Ho): the line lies (Ho − Hc) miles
//    toward the star. Least squares over all the sights moves the guess to where the lines agree best; repeat until it stops moving.
//
// Angles in radians unless they say otherwise; longitude east positive; J is the Julian date of the sight.
import { gmstDeg } from './astro.js';
const { sin, cos, asin, atan2, PI } = Math, D2R = PI / 180;
export const NM_PER_RAD = 60 * 180 / PI;   // nautical miles in a radian of arc (1′ = 1 nm)

/** A J2000 direction carried to the date: [ra, dec] of date. P: the 3×3 precession matrix (row-major), as astro.js gives it. */
export function ofDate(raDeg, decDeg, P) {
  const r = raDeg * D2R, d = decDeg * D2R, x = cos(d) * cos(r), y = cos(d) * sin(r), z = sin(d);
  const X = P ? P[0] * x + P[1] * y + P[2] * z : x, Y = P ? P[3] * x + P[4] * y + P[5] * z : y, Z = P ? P[6] * x + P[7] * y + P[8] * z : z;
  return [atan2(Y, X), asin(Math.max(-1, Math.min(1, Z)))];
}
/** Where a star stands from a place: altitude, and azimuth from north through east. */
export function altAz(ra, dec, lat, lon, J) {
  const H = gmstDeg(J) * D2R + lon - ra;
  const E = -cos(dec) * sin(H), N = sin(dec) * cos(lat) - cos(dec) * cos(H) * sin(lat), U = sin(dec) * sin(lat) + cos(dec) * cos(H) * cos(lat);
  return { alt: asin(Math.max(-1, Math.min(1, U))), az: atan2(E, N) };
}
const sse = (S, lat, lon) => { let s = 0; for (const q of S) { const d = q.Ho - altAz(q.ra, q.dec, lat, lon, q.J).alt; s += d * d; } return s; };
/**
 * The fix from sights [{ ra, dec, J, Ho }] (three or more, of at least three stars): { lat, lon, rms (rad: how far the lines miss
 * each other, per sight), lops: [{ az, d }] (each sight's line: the star's bearing, and how far the line stands from the fix toward
 * it, rad), spread (rad: the widest gap between two lines' crossings: the cocked hat's size), hdop }, or null if the sights don't fix a place.
 */
export function solveFix(S) {
  if (!S || S.length < 3) return null;
  // somewhere to start: the best of a coarse sweep of the globe (the circles cross in two places; least squares needs the right basin)
  const seeds = [];
  for (let la = -80; la <= 80; la += 10) for (let lo = -180; lo < 180; lo += 15) seeds.push([sse(S, la * D2R, lo * D2R), la * D2R, lo * D2R]);
  seeds.sort((a, b) => a[0] - b[0]);
  let best = null;
  for (const [, la0, lo0] of seeds.slice(0, 4)) {
    let lat = la0, lon = lo0;
    for (let it = 0; it < 14; it++) {   // Gauss–Newton: dH = cos(az)·dlat + cos(lat)·sin(az)·dlon
      let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
      for (const q of S) { const { alt, az } = altAz(q.ra, q.dec, lat, lon, q.J), r = q.Ho - alt, g1 = cos(az), g2 = cos(lat) * sin(az); a11 += g1 * g1; a12 += g1 * g2; a22 += g2 * g2; b1 += g1 * r; b2 += g2 * r; }
      const det = a11 * a22 - a12 * a12; if (Math.abs(det) < 1e-9) break;
      let dla = (a22 * b1 - a12 * b2) / det, dlo = (a11 * b2 - a12 * b1) / det; const m = Math.max(Math.abs(dla), Math.abs(dlo)); if (m > 0.3) { dla *= 0.3 / m; dlo *= 0.3 / m; }
      lat = Math.max(-1.55, Math.min(1.55, lat + dla)); lon += dlo; if (m < 1e-9) break;
    }
    const e = sse(S, lat, lon); if (!best || e < best.e) best = { e, lat, lon };
  }
  if (!best) return null;
  const lat = best.lat, lon = atan2(sin(best.lon), cos(best.lon));
  const lops = S.map(q => { const { alt, az } = altAz(q.ra, q.dec, lat, lon, q.J); return { az, d: q.Ho - alt }; });
  // the cocked hat: where each pair of lines cross (in a flat patch about the fix), and how far apart those crossings lie
  const X = []; for (let i = 0; i < lops.length; i++) for (let j = i + 1; j < lops.length; j++) {
    const a = lops[i], b = lops[j], det = sin(a.az) * cos(b.az) - cos(a.az) * sin(b.az); if (Math.abs(det) < 0.2) continue;   // (nearly the same bearing: no crossing worth the name)
    X.push([(a.d * cos(b.az) - b.d * cos(a.az)) / det, (sin(a.az) * b.d - sin(b.az) * a.d) / det]); }   // [east, north]
  let spread = 0; for (let i = 0; i < X.length; i++) for (let j = i + 1; j < X.length; j++) spread = Math.max(spread, Math.hypot(X[i][0] - X[j][0], X[i][1] - X[j][1]));
  // how well the lines cross: with the stars spread round the sky, an error in one sight moves the fix about as far; with them all
  // one way, it slides far along the lines. hdop: miles of fix error per mile of sight error (1 to 1.5 is good; over 3, poor)
  let a11 = 0, a12 = 0, a22 = 0; for (const l of lops) { const g1 = cos(l.az), g2 = sin(l.az); a11 += g1 * g1; a12 += g1 * g2; a22 += g2 * g2; }
  const det = a11 * a22 - a12 * a12, hdop = det > 1e-6 ? Math.sqrt((a11 + a22) / det) : 99;
  return { lat, lon, rms: Math.sqrt(best.e / S.length), lops, spread, crossings: X, hdop };
}
/** Great-circle distance between two places (rad). */
export function arc(lat1, lon1, lat2, lon2) { return Math.acos(Math.max(-1, Math.min(1, sin(lat1) * sin(lat2) + cos(lat1) * cos(lat2) * cos(lon1 - lon2)))); }
/** 42.3712, -71.1830 → "42°22′N 71°11′W" */
export function fmtLatLon(latDeg, lonDeg) {
  const f = (v, pos, neg) => { const a = Math.abs(v), d = Math.floor(a), m = Math.round((a - d) * 60); return `${m === 60 ? d + 1 : d}°${String(m === 60 ? 0 : m).padStart(2, '0')}′${v >= 0 ? pos : neg}`; };
  return `${f(latDeg, 'N', 'S')} ${f(lonDeg, 'E', 'W')}`;
}
