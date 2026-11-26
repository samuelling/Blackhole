// brook.js: a spring-fed pond west of the garden, and the brook that leaves it. It goes under the west wall, wanders across the garden's
// north lawns (through the field of light stalks, under the centre walk, among the globes), out under the east wall, and then meanders
// north-east down the fall of the land to its lowest corner, where it runs off the edge and falls into the bubble.
//
// One description serves everything: a centre line (a spline through hand-set points), a half-width at each point, and a water level
// that only ever goes down. From those come the channel cut into the ground (field.js heightAt), the meshes for banks and water, the
// mask that keeps turf, grass, plants and trees out of it, and the distances the sound uses.
import * as THREE from 'three';

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// x, z, half-width of the water (m). The wall is crossed at the middle of a stint (z = 35.87 west, 41.83 east), under a lintel.
const CTRL = [
  [-40.6, 35.4, 0.6], [-36.4, 36.9, 0.6], [-32.2, 35.3, 0.6], [-27.25, 35.87, 0.45],
  [-24.3, 36.7, 0.55], [-21.0, 37.0, 0.5], [-17.4, 38.9, 0.65], [-13.4, 35.8, 0.7], [-9.8, 38.2, 0.65], [-6.7, 37.42, 0.48], [-3.6, 37.36, 0.46], [0, 37.4, 0.45], [3.6, 37.36, 0.46], [6.7, 37.42, 0.48],
  [9.8, 38.5, 0.65], [13.0, 36.0, 0.7], [17.0, 38.6, 0.65], [21.0, 40.4, 0.5], [24.3, 41.4, 0.55], [27.25, 41.83, 0.45],
  [31.2, 41.5, 0.6], [35.6, 44.6, 0.7], [40.0, 43.6, 0.75], [44.2, 48.2, 0.8], [41.6, 53.6, 0.8], [46.4, 58.6, 0.85], [44.2, 64.8, 0.85], [39.4, 69.0, 0.9],
  [42.2, 75.2, 0.9], [37.2, 80.6, 0.95], [41.0, 86.4, 1.0], [37.2, 92.0, 1.0], [33.6, 97.0, 1.05], [30.6, 101.2, 1.1], [29.0, 106.0, 1.1]];
// stone slabs over the water: where the garden's walks cross (a footbridge), and where the wall does (a lintel the wall stands on)
const DECKS = [{ x: -27.25, kind: 'lintel', along: 1.15 }, { x: -21, kind: 'bridge', along: 2.3 }, { x: 0, kind: 'bridge', along: 2.6 }, { x: 21, kind: 'bridge', along: 2.3 }, { x: 27.25, kind: 'lintel', along: 1.15 }];

export function makeBrook(base, edgeR, CENTRE) {
  const POND = { x: -46.4, z: 35.0, r: 6.2, bank: 1.1, depth: 0.9 };
  const pondR = a => POND.r * (1 + 0.13 * Math.sin(2 * a + 0.6) + 0.07 * Math.sin(3 * a + 2.1) + 0.035 * Math.sin(5 * a + 4.0));
  const curve = new THREE.CatmullRomCurve3(CTRL.map(c => new THREE.Vector3(c[0], 0, c[1])), false, 'centripetal');
  const L = curve.getLength(), n0 = Math.ceil(L / 0.4), X = [], Z = [], TX = [], TZ = [], HW = [], S = [];
  for (let i = 0; i <= n0; i++) {
    const u = i / n0, p = curve.getPointAt(u), t = curve.getTangentAt(u), f = curve.getUtoTmapping(u) * (CTRL.length - 1), k = Math.min(CTRL.length - 2, Math.floor(f));
    if (Math.hypot(p.x - CENTRE.x, p.z - CENTRE.z) > edgeR(p.x, p.z) + 0.3) break;          // it stops where the land does
    // no brook keeps a drawn line: it shifts a few hand-widths side to side and swells and narrows, except where it is held between stones (under the slabs)
    const s = u * L, tl = Math.hypot(t.x, t.z) || 1, tx = t.x / tl, tz = t.z / tl; let free = Math.abs(p.x) < 7.5 ? 0.3 : 1; for (const d of DECKS) free = Math.min(free, ss(1.2, 4.5, Math.abs(p.x - d.x)));   // (and between the hedge ends and the canal beds there is little room)
    const off = free * (0.26 * Math.sin(s * 1.07 + 0.4) + 0.17 * Math.sin(s * 2.31 + 2.0) + 0.1 * Math.sin(s * 4.9 + 1.1));
    const wid = 1 + free * (0.2 * Math.sin(s * 0.83 + 1.7) + 0.14 * Math.sin(s * 1.9 + 0.3) + 0.09 * Math.sin(s * 3.7 + 2.9));
    X.push(p.x - tz * off); Z.push(p.z + tx * off); TX.push(tx); TZ.push(tz); HW.push(lerp(CTRL[k][2], CTRL[k + 1][2], ss(0, 1, f - k)) * wid); S.push(s);
  }
  const n = X.length;
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2), dx = X[b] - X[a], dz = Z[b] - Z[a], l = Math.hypot(dx, dz) || 1; TX[i] = dx / l; TZ[i] = dz / l; }   // headings of the line as it now runs
  // the pond stands a hand below the lowest point of its rim; from there the water level only falls, never less than 1 in 600
  let rim = 1e9; for (let a = 0; a < 6.283; a += 0.1) rim = Math.min(rim, base(POND.x + Math.cos(a) * pondR(a), POND.z + Math.sin(a) * pondR(a)));
  const pondY = rim - 0.16, WY = [pondY], BW = [], DEP = [];
  for (let i = 1; i < n; i++) WY.push(Math.min(WY[i - 1] - 0.0016 * (S[i] - S[i - 1]), base(X[i], Z[i]) - 0.2));
  for (let i = 0; i < n; i++) { let hi = 0; for (let j = Math.max(0, i - 4); j <= Math.min(n - 1, i + 4); j++) hi = Math.max(hi, base(X[j], Z[j]) - WY[j] - 0.2);
    BW.push(0.45 + 1.5 * hi + 0.12 * Math.sin(S[i] * 1.4 + 2.2)); DEP.push(Math.max(0.14, 0.12 + 0.26 * HW[i] + 0.07 * Math.sin(S[i] * 0.6 + 1.0))); }                              // higher banks are laid back further
  const decks = DECKS.map(d => { let bi = 0; for (let i = 1; i < n; i++) if (Math.abs(X[i] - d.x) < Math.abs(X[bi] - d.x)) bi = i;
    return { ...d, i: bi, x: X[bi], z: Z[bi], tx: TX[bi], tz: TZ[bi], across: 2 * (HW[bi] + BW[bi]) + 0.9 }; });
  // a grid of distance to the centre line, a quarter metre to the cell, stamped along the line
  const CELL = 0.25, GN = 896, G0x = CENTRE.x - 112, G0z = CENTRE.z - 112, gd = new Float32Array(GN * GN).fill(99), gi = new Int16Array(GN * GN).fill(-1);
  for (let i = 0; i < n; i++) { const R = HW[i] + BW[i] + 1.4, c0 = Math.floor((X[i] - R - G0x) / CELL), c1 = Math.ceil((X[i] + R - G0x) / CELL), r0 = Math.floor((Z[i] - R - G0z) / CELL), r1 = Math.ceil((Z[i] + R - G0z) / CELL);
    for (let r = Math.max(0, r0); r <= Math.min(GN - 1, r1); r++) for (let c = Math.max(0, c0); c <= Math.min(GN - 1, c1); c++) {
      const d = Math.hypot(G0x + (c + 0.5) * CELL - X[i], G0z + (r + 0.5) * CELL - Z[i]), o = r * GN + c; if (d < gd[o]) { gd[o] = d; gi[o] = i; } } }
  const Q = { d: 99, i: -1 };
  function at(x, z) {     // distance from the centre line and the nearest sample, into Q; false when nowhere near
    const fx = (x - G0x) / CELL - 0.5, fz = (z - G0z) / CELL - 0.5, c = Math.floor(fx), r = Math.floor(fz); if (c < 0 || r < 0 || c >= GN - 1 || r >= GN - 1) return false;
    const o = r * GN + c, u = fx - c, v = fz - r, i = gi[o + (v > 0.5 ? GN : 0) + (u > 0.5 ? 1 : 0)]; if (i < 0) return false;
    Q.d = lerp(lerp(gd[o], gd[o + 1], u), lerp(gd[o + GN], gd[o + GN + 1], u), v); Q.i = i; return true;
  }
  const onDeck = (x, z) => { for (const d of decks) { const dx = x - d.x, dz = z - d.z; if (Math.abs(dx * d.tx + dz * d.tz) < d.along / 2 && Math.abs(-dx * d.tz + dz * d.tx) < d.across / 2) return true; } return false; };
  /** How far the channel and the pond are cut below the uncut ground b at this point. */
  function carve(x, z, b) {
    let c = 0;
    if (at(x, z)) { const i = Q.i, d = Q.d, hw = HW[i], bw = BW[i];
      if (d < hw + bw) { const w0 = WY[i] - 0.04, y = d < hw ? w0 - DEP[i] * (1 - (d / hw) * (d / hw)) : lerp(w0, b, ss(0, 1, (d - hw) / bw)); c = Math.max(0, b - y); } }
    const dx = x - POND.x, dz = z - POND.z, dp = Math.hypot(dx, dz);
    if (dp < POND.r * 1.3 + POND.bank) { const R = pondR(Math.atan2(dz, dx)), w0 = pondY - 0.04;
      if (dp < R + POND.bank) { const y = dp < R ? w0 - POND.depth * (1 - Math.pow(dp / R, 2.2)) : lerp(w0, b, ss(0, 1, (dp - R) / POND.bank)); c = Math.max(c, b - y); } }
    return c;
  }
  /** Metres from the water's edge (negative in the water); 99 when far from it. */
  function edge(x, z) {
    let e = 99; if (at(x, z)) e = Q.d - HW[Q.i];
    const dx = x - POND.x, dz = z - POND.z, dp = Math.hypot(dx, dz); if (dp < POND.r * 1.3 + 6) e = Math.min(e, dp - pondR(Math.atan2(dz, dx)));
    return e;
  }
  /** Metres from where the banks begin (negative anywhere in the cut). */
  function bank(x, z) {
    let e = 99; if (at(x, z)) e = Q.d - HW[Q.i] - BW[Q.i];
    const dx = x - POND.x, dz = z - POND.z, dp = Math.hypot(dx, dz); if (dp < POND.r * 1.3 + 6) e = Math.min(e, dp - pondR(Math.atan2(dz, dx)) - POND.bank);
    return e;
  }
  let quiet = n - 1; for (let i = 8; i < n - 8; i++) if ((WY[i - 8] - WY[i + 8]) / (S[i + 8] - S[i - 8]) > 0.02) { quiet = i - 12; break; }
  const e = n - 1, fall = { x: X[e], z: Z[e], y: WY[e], tx: TX[e], tz: TZ[e], hw: HW[e] };
  /** For the sound: metres to the nearest running water, and to the fall. */
  function range(x, z) { let m = 1e9; for (let i = 0; i < n; i += 3) { const d = (X[i] - x) * (X[i] - x) + (Z[i] - z) * (Z[i] - z); if (d < m) m = d; } return { stream: Math.sqrt(m), fall: Math.hypot(fall.x - x, fall.z - z) }; }
  return { POND, pondR, pondY, n, X, Z, TX, TZ, HW, BW, WY, DEP, S, decks, fall, quiet, carve, edge, bank, onDeck, range };
}

/** Everything you see of it: banks, water, pond, the slabs over it, the fall. ground(x, z) is the cut ground (field.js terrainAt). */
export function createBrookView({ brook: B, U, COMMON, P, gravel, wn, ground, lite, bridge }) {
  const group = new THREE.Group(); group.name = 'brook';
  const pos = [], col = [], uv = [], idx = [];
  const dry = [0.26, 0.25, 0.21], wet = [0.2, 0.18, 0.15], turf = [0.19, 0.25, 0.11], silt = [0.12, 0.115, 0.09];
  const vert = (x, z, sink, wy) => { const y = ground(x, z) - sink, h = y - wy, k = ss(0.14, 0.02, h), g = ss(0.08, 0.22, h); pos.push(x, y, z); uv.push(x / 1.6, z / 1.6);
    const deep = ss(0.12, 0.5, -h), mottle = 0.8 + 0.4 * (Math.sin(x * 3.1 + z * 1.7) * Math.sin(x * 1.3 - z * 2.9) * 0.5 + 0.5);
    for (let c = 0; c < 3; c++) col.push(lerp(lerp(lerp(dry[c], wet[c], k), turf[c], g), silt[c], deep) * mottle); };
  // the banks, as a ribbon of cross-sections along the brook
  let first = 0; while (first < B.n - 1 && Math.hypot(B.X[first] - B.POND.x, B.Z[first] - B.POND.z) < B.pondR(Math.atan2(B.Z[first] - B.POND.z, B.X[first] - B.POND.x)) - 0.4) first++;
  const NS = 11;
  for (let i = first; i < B.n; i++) { const hw = B.HW[i], bw = B.BW[i], nx = -B.TZ[i], nz = B.TX[i];
    const offs = [hw + bw + 0.45, hw + bw, hw + 0.55 * bw, hw + 0.2 * bw, hw + 0.03, hw * 0.55];
    for (let k = 0; k < NS; k++) { const o = k < 5 ? -offs[k] : k === 5 ? 0 : offs[10 - k], a = Math.abs(o); vert(B.X[i] + nx * o, B.Z[i] + nz * o, a > hw + bw - 0.01 ? (a > hw + bw + 0.2 ? 0.12 : 0.02) : 0, B.WY[i]); }
    if (i > first) { const a = (i - first - 1) * NS, b = a + NS; for (let k = 0; k < NS - 1; k++) idx.push(a + k, b + k, a + k + 1, a + k + 1, b + k, b + k + 1); } }
  // the pond's banks and bed: rings about its centre
  { const base = pos.length / 3, NA = 72, rings = [[1, B.POND.bank + 0.45], [1, B.POND.bank], [1, 0.55 * B.POND.bank], [1, 0.2 * B.POND.bank], [1, 0.03], [0.8, 0], [0.4, 0], [0, 0]];
    for (let a = 0; a < NA; a++) { const th = a / NA * 6.2832, R = B.pondR(th), cx = Math.cos(th), cz = Math.sin(th);
      rings.forEach(([q, o], k) => { const r = R * q + o; vert(B.POND.x + cx * r, B.POND.z + cz * r, k === 0 ? 0.12 : k === 1 ? 0.02 : 0, B.pondY); }); }
    const NR = rings.length; for (let a = 0; a < NA; a++) { const p = base + a * NR, q = base + ((a + 1) % NA) * NR; for (let k = 0; k < NR - 1; k++) idx.push(p + k, p + k + 1, q + k, q + k, p + k + 1, q + k + 1); } }
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  bg.setIndex(idx); bg.computeVertexNormals();
  gravel.diff.wrapS = gravel.diff.wrapT = THREE.RepeatWrapping;
  const banks = new THREE.Mesh(bg, P.std({ map: gravel.diff, normalMap: gravel.nor, roughness: 0.92, vertexColors: true, side: THREE.DoubleSide }, { key: 'brookbank' })); banks.receiveShadow = true; group.add(banks);

  // the water: a ribbon at the water level, and the pond's surface; each vertex carries which way and how fast the water runs
  const wp = [], wf = [], wq = [], wi = [];
  for (let i = first; i < B.n; i++) { const hw = B.HW[i] * 1.03, nx = -B.TZ[i], nz = B.TX[i], j = Math.min(B.n - 1, i + 6), k = Math.max(0, i - 6);
    const slope = Math.max(0, (B.WY[k] - B.WY[j]) / Math.max(0.1, B.S[j] - B.S[k])), v = Math.min(2.6, 0.45 + 9 * Math.sqrt(slope)) * (0.75 / Math.max(0.45, B.HW[i]) * 0.6 + 0.4);
    for (let c = 0; c < 5; c++) { const q = (c - 2) / 2, o = q * hw, sp = v * (1 - 0.65 * q * q); wp.push(B.X[i] + nx * o, B.WY[i], B.Z[i] + nz * o); wf.push(B.TX[i] * sp, B.TZ[i] * sp); wq.push(q, B.DEP[i] * (1 - q * q) + 0.02, Math.min(1, slope * 14)); }
    if (i > first) { const a = (i - first - 1) * 5, b = a + 5; for (let c = 0; c < 4; c++) wi.push(a + c, b + c, a + c + 1, a + c + 1, b + c, b + c + 1); } }
  { const base = wp.length / 3, NA = 72, out = B.X[first] - B.POND.x, outz = B.Z[first] - B.POND.z, ol = Math.hypot(out, outz) || 1;
    wp.push(B.POND.x, B.pondY, B.POND.z); wf.push(0, 0); wq.push(0, B.POND.depth, 0);
    for (const q of [0.5, 1.0]) for (let a = 0; a < NA; a++) { const th = a / NA * 6.2832, R = B.pondR(th) * q * (q === 1 ? 1.01 : 1), x = B.POND.x + Math.cos(th) * R, z = B.POND.z + Math.sin(th) * R;
      const pull = 0.22 * ss(7, 1.5, Math.hypot(x - B.X[first], z - B.Z[first]));                     // the pond stands still but for the draw toward its outlet
      wp.push(x, B.pondY, z); wf.push(out / ol * pull, outz / ol * pull); wq.push(q, B.POND.depth * (1 - Math.pow(q, 2.2)) + 0.03, 0); }
    for (let a = 0; a < NA; a++) { const a1 = (a + 1) % NA, p = base + 1 + a, q = base + 1 + a1, r = base + 1 + NA + a, s = base + 1 + NA + a1; wi.push(base, q, p, p, q, r, r, q, s); } }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3)); wg.setAttribute('aFlow', new THREE.Float32BufferAttribute(wf, 2)); wg.setAttribute('aQ', new THREE.Float32BufferAttribute(wq, 3)); wg.setIndex(wi);
  const waterMat = new THREE.ShaderMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: false,
    uniforms: Object.assign({}, U, { tWN: { value: wn } }),
    vertexShader: `attribute vec2 aFlow; attribute vec3 aQ; varying vec3 vW; varying vec2 vFlow; varying vec3 vQ;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vFlow = aFlow; vQ = aQ; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: COMMON + `
      uniform sampler2D tWN; uniform vec3 uSunCol; uniform vec3 uSunDir; uniform float uExhibit;
      varying vec3 vW; varying vec2 vFlow; varying vec3 vQ;
      void main(){
        vec2 p = vW.xz; float q = abs(vQ.x), spd = length(vFlow);
        // the ripple pattern is carried along by the water: two copies, each riding for 2.5 s and then swapped out while the other shows
        float ph = uTime * 0.4, pa = fract(ph), pb = fract(ph + 0.5), wa = 1.0 - abs(2.0 * pa - 1.0);
        vec2 ua = p - vFlow * pa * 2.5, ub = p - vFlow * pb * 2.5 + 3.7;
        vec2 ta = texture2D(tWN, ua * 0.9).xy, tb = texture2D(tWN, ub * 0.9).xy, ta2 = texture2D(tWN, ua * 2.3 + 0.5).xy, tb2 = texture2D(tWN, ub * 2.3 + 0.5).xy;
        vec2 g = (mix(tb, ta, wa) + 0.6 * mix(tb2, ta2, wa) - 0.8) * (0.07 + 0.2 * min(spd, 1.6));
        g += (texture2D(tWN, p * 0.31 + uTime * vec2(0.011, 0.006)).xy - 0.5) * 0.06;                    // and the wind's own ripple, which is all the pond has
        vec3 N = normalize(vec3(-g.x, 1.0, -g.y)), V = normalize(cameraPosition - vW);
        float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0), depth = max(0.02, vQ.y);
        vec3 gl = groundLight(p) * uExhibit * uLightGain;
        vec3 light = uAmb + uSun * 0.35 + gl * 0.5;
        // what the water itself adds: a green-brown body that thickens with depth, and the sky on its surface
        float body = 1.0 - exp(-depth * 1.3 / max(V.y, 0.35));
        vec3 sky = uFogColor * 0.75 + uAmb * 0.4 + gl * 0.25;
        vec3 c = mix(vec3(0.05, 0.075, 0.05) * light, sky, clamp(fres, 0.0, 1.0));
        float a = clamp(body * 0.7 + fres * 1.2 + 0.06, 0.0, 1.0);
        // white water: along the edges, and wherever it runs steeply
        float fn = mix(vnoise(ub * 3.3), vnoise(ua * 3.3), wa) * 0.6 + mix(vnoise(ub * 9.0 + 5.0), vnoise(ua * 9.0 + 5.0), wa) * 0.4;
        float foam = smoothstep(0.64, 0.84, fn + 0.2 * smoothstep(0.75, 1.0, q) * min(spd * 1.5, 1.0) + 0.6 * vQ.z - 0.12) * max(smoothstep(0.3, 0.8, spd), vQ.z);   // none on still water
        c = mix(c, vec3(0.8, 0.85, 0.88) * (uAmb * 0.9 + uSun * 0.3 + gl * 0.4), foam * 0.8); a = max(a, foam * 0.85);
        vec3 H = normalize(uSunDir + V); float spec = pow(max(dot(N, H), 0.0), 420.0) * step(0.0, uSunDir.y); c += uSunCol * spec * 4.0; a = max(a, min(1.0, spec * 3.0));
        c *= mix(1.0, drainAt(vW), 0.93); c = gshift(c, vW);
        gl_FragColor = vec4(mix(uFogColor, c, fogF(distance(cameraPosition, vW))), a);
      }` });
  const water = new THREE.Mesh(wg, waterMat); water.renderOrder = 2; group.add(water);

  // slabs: a footbridge where a walk crosses, a lintel where the wall does
  const slabMat = P.std({ color: 0x6d6a63, normalMap: gravel.nor, roughness: 0.95 }, { key: 'brookslab' });
  const kit = bridge && bridge.scene ? bridgeKit(bridge, P) : null;
  for (const d of B.decks) { if (kit && d.kind === 'bridge') continue;
    const th = d.kind === 'lintel' ? 0.2 : 0.16, g = new THREE.BoxGeometry(d.across, th, d.along), m = new THREE.Mesh(g, slabMat);
    { const u = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < u.count; i++) u.setXY(i, (p.getX(i) + p.getY(i)) / 2.2 + d.x * 0.3, (p.getZ(i) + p.getY(i)) / 2.2); }
    const top = Math.max(ground(d.x - d.tz * d.across / 2, d.z + d.tx * d.across / 2), ground(d.x + d.tz * d.across / 2, d.z - d.tx * d.across / 2)) + (d.kind === 'lintel' ? 0.015 : 0.05);   // level with the ground either side
    m.position.set(d.x, top - th / 2, d.z); m.rotation.y = Math.atan2(-d.tx, -d.tz);                                  // its long side across the water
    m.castShadow = m.receiveShadow = true; group.add(m); d.top = m.position.y + th / 2; }
  if (kit) { for (const d of B.decks) if (d.kind === 'bridge') {
      const top = Math.max(ground(d.x - d.tz * d.across / 2, d.z + d.tx * d.across / 2), ground(d.x + d.tz * d.across / 2, d.z - d.tx * d.across / 2)) + 0.05;
      kit.lay(d, top); d.top = top; }
    kit.finish(group); }

  // the fall: the water leaves the lip at the speed it arrived and drops; the sheet tears into strands and then into mist before the bubble's skin
  { const F = B.fall, v0 = 2.2, G = 9.8, T = 2.55, NT = lite ? 40 : 64, fp = [], fu = [], fi = [];
    for (let k = 0; k <= NT; k++) { const t = T * Math.pow(k / NT, 1.35) - 0.12, tt = Math.max(0, t), w = F.hw * (1.0 + 0.16 * tt + 0.05 * tt * tt), fwd = v0 * t, y = F.y - 0.5 * G * tt * tt;
      for (let c = 0; c < 5; c++) { const q = (c - 2) / 2, bow = 0.25 * (1 - q * q) * Math.min(1, tt * 2); fp.push(F.x + F.tx * (fwd + bow) - F.tz * q * w, y, F.z + F.tz * (fwd + bow) + F.tx * q * w); fu.push(q, Math.max(0, t)); }
      if (k > 0) { const a = (k - 1) * 5, b = a + 5; for (let c = 0; c < 4; c++) fi.push(a + c, b + c, a + c + 1, a + c + 1, b + c, b + c + 1); } }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2)); fg.setIndex(fi);
    const fallMat = new THREE.ShaderMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: false, uniforms: Object.assign({}, U, { uT: { value: T } }),
      vertexShader: `varying vec3 vW; varying vec2 vUv; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vUv = uv; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: COMMON + `
        uniform float uT; varying vec3 vW; varying vec2 vUv;
        void main(){
          float t = vUv.y, f = t / uT, q = vUv.x;
          // the pattern is laid out in time of flight, so it travels at the speed of the falling water
          float n1 = vnoise(vec2(q * 5.0 + 3.0, (t - uTime) * 3.2)), n2 = vnoise(vec2(q * 13.0, (t - uTime) * 7.0 + 9.0)), n = n1 * 0.6 + n2 * 0.4;
          float tear = smoothstep(f * 1.15 - 0.25, f * 1.15 + 0.2, n + 0.25 * (1.0 - abs(q)));           // whole at the lip, strands lower down
          float a = tear * (1.0 - smoothstep(0.55, 1.0, f)) * smoothstep(1.0, 0.8, abs(q) * (1.0 - 0.3 * f)) * mix(0.82, 0.5, f);
          vec3 c = mix(vec3(0.55, 0.66, 0.72), vec3(0.92, 0.95, 0.98), smoothstep(0.35, 0.8, n) * 0.6 + 0.4 * f) * (uAmb * 2.1 + uSun * 0.95 + groundLight(vW.xz) * 0.3);
          c *= mix(1.0, drainAt(vW), 0.9);
          gl_FragColor = vec4(mix(uFogColor, c, fogF(distance(cameraPosition, vW))), a);
        }` });
    const fallMesh = new THREE.Mesh(fg, fallMat); fallMesh.renderOrder = 3; fallMesh.frustumCulled = false; group.add(fallMesh);
    // mist: soft points that ride the lower half of the fall and drift out of it
    const NM = lite ? 70 : 150, ms = new Float32Array(NM * 3); for (let i = 0; i < NM * 3; i++) ms[i] = Math.random();
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NM * 3), 3)); mg.setAttribute('aSeed', new THREE.BufferAttribute(ms, 3));
    const mist = new THREE.Points(mg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.NormalBlending,
      uniforms: Object.assign({}, U, { uF: { value: new THREE.Vector4(F.x, F.y, F.z, F.hw) }, uDir: { value: new THREE.Vector2(F.tx, F.tz) }, uPx: { value: 600 } }),
      vertexShader: `attribute vec3 aSeed; uniform vec4 uF; uniform vec2 uDir; uniform float uTime; uniform float uPx; varying float vA; varying vec3 vW;
        void main(){ float life = fract(aSeed.x + uTime * (0.05 + 0.04 * aSeed.y)), t = 1.1 + 1.5 * life;                 // seconds of fall: from a third of the way down
          float fwd = ${v0.toFixed(1)} * t + (aSeed.z - 0.3) * 3.5 * life, side = (aSeed.y - 0.5) * (uF.w * 2.6 + 5.0 * life);
          vec3 w = vec3(uF.x + uDir.x * fwd - uDir.y * side, uF.y - 4.9 * t * t * (1.0 - 0.25 * life) + 2.0 * life * aSeed.z, uF.z + uDir.y * fwd + uDir.x * side);
          vW = w; vA = sin(life * 3.1416) * 0.1; vec4 mv = viewMatrix * vec4(w, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = min(220.0, uPx * (1.2 + 2.6 * life) / max(1.0, -mv.z)); }`,
      fragmentShader: COMMON + `varying float vA; varying vec3 vW;
        void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; if (r > 1.0) discard; vec3 c = vec3(0.9, 0.94, 0.98) * (uAmb * 2.0 + uSun * 0.8) * mix(1.0, drainAt(vW), 0.9);
          gl_FragColor = vec4(mix(uFogColor, c, fogF(distance(cameraPosition, vW))), vA * (1.0 - r * r)); }` }));
    mist.frustumCulled = false; mist.renderOrder = 4; group.add(mist);
    group.userData.mist = mist;
  }

  // stones: along the water's edge, in the stream on the steep run, round the pond
  const mul = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  { const rnd = mul(77123), R = [];
    const add = (x, z, r, sink) => { if (B.onDeck(x, z)) return; R.push([x, ground(x, z) + r * (0.28 - sink), z, r, rnd(), rnd(), rnd(), rnd()]); };
    for (let i = first + 2; i < B.n - 1; i++) { const nx = -B.TZ[i], nz = B.TX[i], steep = i > B.quiet + 8, inGarden = Math.abs(B.X[i]) < 27.4;
      for (const sd of [-1, 1]) if (rnd() < (steep ? 0.85 : inGarden ? 0.2 : 0.34)) { const r = 0.06 + 0.3 * Math.pow(rnd(), 2.4) * (steep ? 1.5 : 1), o = sd * (B.HW[i] + (rnd() - 0.4) * 0.4); add(B.X[i] + nx * o, B.Z[i] + nz * o, r, 0.1 * rnd()); }
      if (rnd() < (steep ? 0.6 : 0.06)) { const r = 0.1 + 0.3 * rnd() * (steep ? 1.4 : 1), o = (rnd() * 2 - 1) * B.HW[i] * 0.75; add(B.X[i] + nx * o, B.Z[i] + nz * o, r, 0.25); } }
    for (let a = 0; a < 6.283; a += 0.05) if (rnd() < 0.42) { const r = 0.07 + 0.36 * Math.pow(rnd(), 2.2), rad = B.pondR(a) + (rnd() - 0.45) * 0.5; add(B.POND.x + Math.cos(a) * rad, B.POND.z + Math.sin(a) * rad, r, 0.1 * rnd()); }
    const rg = new THREE.IcosahedronGeometry(1, 2), rp = rg.attributes.position;
    for (let i = 0; i < rp.count; i++) { const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i), k = 1 + 0.16 * Math.sin(x * 2.7 + y * 1.3) * Math.sin(z * 3.1 - y * 2.2) + 0.09 * Math.sin(x * 5.3 - z * 4.1 + y * 6.0); rp.setXYZ(i, x * k, y * k, z * k); }
    rg.computeVertexNormals();
    const rocks = new THREE.InstancedMesh(rg, P.std({ color: 0xffffff, normalMap: gravel.nor, roughness: 0.94 }, { key: 'brookrock' }), R.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    R.forEach(([x, y, z, r, a, b, d, f], i) => { e.set((a - 0.5) * 0.9, b * 6.283, (d - 0.5) * 0.9); q.setFromEuler(e); M.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(r * (0.85 + 0.5 * a), r * (0.5 + 0.35 * b), r * (0.85 + 0.5 * d))); rocks.setMatrixAt(i, M);
      const g = 0.55 + 0.6 * f; rocks.setColorAt(i, c.setRGB(0.4 * g, 0.39 * g, 0.36 * g)); });   // grey fieldstone, some paler
    rocks.castShadow = rocks.receiveShadow = true; rocks.frustumCulled = false; group.add(rocks); }

  // lily pads on the still side of the pond
  { const rnd = mul(4411), pads = [], out = Math.atan2(B.Z[first] - B.POND.z, B.X[first] - B.POND.x);
    for (let t = 0; t < 400 && pads.length < (lite ? 26 : 48); t++) { const a = out + 1.0 + rnd() * 4.3, rr = B.pondR(a) * (0.35 + 0.55 * Math.sqrt(rnd())), x = B.POND.x + Math.cos(a) * rr, z = B.POND.z + Math.sin(a) * rr, r = 0.11 + 0.13 * rnd();
      if (pads.every(p => Math.hypot(p[0] - x, p[1] - z) > p[2] + r + 0.02)) pads.push([x, z, r, rnd(), rnd()]); }
    const pg = new THREE.CircleGeometry(1, 18, 0.22, 6.2832 - 0.44).rotateX(-Math.PI / 2), pm = new THREE.InstancedMesh(pg, P.std({ color: 0xffffff, roughness: 0.45, side: THREE.DoubleSide }, { key: 'brookpad' }), pads.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    pads.forEach(([x, z, r, a, b], i) => { q.setFromAxisAngle(up, a * 6.283); M.compose(new THREE.Vector3(x, B.pondY + 0.012, z), q, new THREE.Vector3(r, 1, r)); pm.setMatrixAt(i, M); pm.setColorAt(i, c.setRGB(0.1 + 0.08 * b, 0.26 + 0.14 * b, 0.07 + 0.05 * a)); });
    pm.receiveShadow = true; pm.frustumCulled = false; group.add(pm); }

  // koi: a body that tapers to the tail, a forked tail fin, a dorsal fin and two pectorals; the swimming wave is put on in the shader
  const NK = lite ? 9 : 16, kois = [];
  { const kp = [], kf = [], ki = [], prof = [[-0.42, 0.018, 0.034], [-0.32, 0.04, 0.058], [-0.14, 0.078, 0.096], [0.06, 0.098, 0.112], [0.26, 0.09, 0.1], [0.4, 0.062, 0.074], [0.47, 0.034, 0.042], [0.5, 0.0, 0.0]], NA = 10;
    prof.forEach(([z, w, h]) => { for (let a = 0; a < NA; a++) { const th = a / NA * 6.2832; kp.push(Math.cos(th) * w, Math.sin(th) * h * (Math.sin(th) > 0 ? 1 : 0.85), z); kf.push(0); } });
    for (let r = 0; r < prof.length - 1; r++) for (let a = 0; a < NA; a++) { const a1 = (a + 1) % NA, p = r * NA + a, q = r * NA + a1, u = p + NA, v = q + NA; ki.push(p, q, u, u, q, v); }
    const fin = (...pts) => { const b = kp.length / 3; for (const [x, y, z] of pts) { kp.push(x, y, z); kf.push(1); } for (let i = 1; i < pts.length - 1; i++) ki.push(b, b + i, b + i + 1); };
    fin([0, 0, -0.4], [0, 0.15, -0.7], [0, 0.02, -0.58], [0, -0.13, -0.68]);                    // tail
    fin([0, 0.1, 0.14], [0, 0.165, 0.0], [0, 0.15, -0.14], [0, 0.085, -0.22]);                 // dorsal
    for (const sd of [-1, 1]) fin([sd * 0.075, -0.03, 0.27], [sd * 0.2, -0.06, 0.16], [sd * 0.17, -0.06, 0.08], [sd * 0.07, -0.04, 0.14]);
    const kg = new THREE.BufferGeometry(); kg.setAttribute('position', new THREE.Float32BufferAttribute(kp, 3)); kg.setAttribute('aFin', new THREE.Float32BufferAttribute(kf, 1)); kg.setIndex(ki); kg.computeVertexNormals();
    const kAttr = new THREE.InstancedBufferAttribute(new Float32Array(NK * 4), 4); kAttr.setUsage(THREE.DynamicDrawUsage); kg.setAttribute('aKoi', kAttr);
    const dAttr = new THREE.InstancedBufferAttribute(new Float32Array(NK), 1); dAttr.setUsage(THREE.DynamicDrawUsage); kg.setAttribute('aDeep', dAttr);
    const koiMat = new THREE.ShaderMaterial({ side: THREE.DoubleSide, transparent: true, uniforms: Object.assign({}, U),
      vertexShader: `attribute vec4 aKoi; attribute float aFin; attribute float aDeep; varying vec3 vW; varying vec3 vN; varying vec3 vO; varying vec4 vK; varying float vFin; varying float vDeep;
        void main(){ vec3 p = position; float tail = 0.5 - p.z;                                        // 0 at the nose, 1.2 at the tips of the tail
          p.x += sin(aKoi.y - tail * 5.2) * (0.01 + 0.1 * tail * tail) * aKoi.z;                     // the wave runs down the body and grows toward the tail
          if (aFin > 0.5 && abs(position.x) > 0.05) p.y += sin(aKoi.y * 0.6 + position.x * 9.0) * 0.02;   // pectorals scull
          mat4 m = modelMatrix * instanceMatrix; vec4 w = m * vec4(p, 1.0); vW = w.xyz; vN = normalize(mat3(m) * normal); vO = position; vK = aKoi; vFin = aFin; vDeep = aDeep - p.y * length(m[1].xyz);
          gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: COMMON + `
        uniform vec3 uSunDir; uniform float uExhibit; varying vec3 vW; varying vec3 vN; varying vec3 vO; varying vec4 vK; varying float vFin; varying float vDeep;
        void main(){
          float sd = vK.x, v = vK.w, ang = atan(vO.x, vO.y);                                           // the pattern wraps over the back
          float n1 = vnoise(vec2(vO.z * 4.2 + sd * 17.0, ang * 1.3 + sd * 5.0)), n2 = vnoise(vec2(vO.z * 12.0 - sd * 9.0, ang * 3.2 + 3.0 + sd));
          vec3 white = vec3(0.9, 0.88, 0.82), red = vec3(0.86, 0.2, 0.04), black = vec3(0.035, 0.035, 0.04), gold = vec3(0.95, 0.6, 0.1), c;
          if (v < 0.5) c = mix(white, red, smoothstep(0.47, 0.54, n1));                                 // kohaku: red on white
          else if (v < 1.5) { c = mix(white, red, smoothstep(0.5, 0.57, n1)); c = mix(c, black, smoothstep(0.66, 0.71, n2)); }   // sanke: with black flecks
          else if (v < 2.5) c = gold * (0.8 + 0.35 * n2);                                               // ogon: one metal colour
          else if (v < 3.5) { c = mix(black, red, smoothstep(0.46, 0.55, n1)); c = mix(c, white, smoothstep(0.67, 0.73, n2)); }  // showa: black-based
          else c = mix(vec3(0.95, 0.42, 0.06), white, smoothstep(0.56, 0.63, n1));                      // orange and white
          c = mix(c, white * 0.92, smoothstep(0.0, -0.07, vO.y) * 0.75);                                // pale belly
          c = mix(c, mix(c, white, 0.45), vFin);
          vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
          vec3 light = uAmb * 0.95 + uSun * 0.34 * (0.35 + 0.65 * max(dot(N, uSunDir), 0.0)) + groundLight(vW.xz) * uExhibit * uLightGain * 0.5;
          c *= light; float under = 1.0 - exp(-max(vDeep, 0.0) * 1.7);                       // the deeper it swims, the more of the water's own colour lies over it
          c = mix(c * vec3(0.9, 0.97, 0.92), vec3(0.05, 0.075, 0.05) * light, under * 0.75);
          c *= mix(1.0, drainAt(vW), 0.93); c = gshift(c, vW);
          gl_FragColor = vec4(mix(uFogColor, c, fogF(distance(cameraPosition, vW))), 1.0);
        }` });
    const koi = new THREE.InstancedMesh(kg, koiMat, NK); koi.frustumCulled = false; koi.renderOrder = 3; group.add(koi); group.userData.koi = koi;
    const rnd = mul(31337), lo = first + 4, hi = Math.max(lo + 20, B.quiet);
    for (let i = 0; i < NK; i++) { const pond = i < Math.round(NK * 0.44), a = rnd() * 6.283, rr = B.pondR(a) * 0.6 * Math.sqrt(rnd());
      kois.push({ pond, x: B.POND.x + Math.cos(a) * rr, z: B.POND.z + Math.sin(a) * rr, tx: B.POND.x, tz: B.POND.z, u: lo + (hi - lo) * rnd(), goal: lo + (hi - lo) * rnd(), q: (rnd() - 0.5) * 0.8, qg: (rnd() - 0.5) * 0.8,
        yaw: rnd() * 6.283, v: 0.2, cruise: 0.25 + 0.3 * rnd(), hold: rnd() * 6, flee: 0, len: 0.3 + 0.24 * rnd(), deep: 0.4 + 0.35 * rnd(), phase: rnd() * 6.283, seed: rnd(), kind: Math.floor(rnd() * 5) }); }
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  const wrap = a => { a = (a + Math.PI) % (2 * Math.PI); return (a < 0 ? a + 2 * Math.PI : a) - Math.PI; };
  /** Moves the koi. (px, pz) is where you are: come too near and they bolt. */
  function update(dt, t, px, pz) {
    const koi = group.userData.koi, A = koi.geometry.attributes.aKoi, D = koi.geometry.attributes.aDeep, lo = first + 4, hi = Math.max(lo + 20, B.quiet); dt = Math.min(dt, 0.1);
    kois.forEach((k, i) => {
      let y, hx, hz, top;
      if (k.pond) {   // in the pond: swim for a point, arrive, idle, choose another
        const near = Math.hypot(px - k.x, pz - k.z) < 2.4;
        if (near && k.flee <= 0) { k.flee = 1.6; const a = Math.atan2(B.POND.z - pz, B.POND.x - px) + (Math.random() - 0.5), r = B.pondR(a) * 0.6; k.tx = B.POND.x + Math.cos(a) * r; k.tz = B.POND.z + Math.sin(a) * r; k.hold = 0; }
        k.flee -= dt; const dx = k.tx - k.x, dz = k.tz - k.z, d = Math.hypot(dx, dz);
        if (d < 0.5) { if (k.hold <= 0) k.hold = 1 + Math.random() * 7; k.hold -= dt; if (k.hold <= 0) { const a = Math.random() * 6.283, r = B.pondR(a) * 0.72 * Math.sqrt(Math.random()); k.tx = B.POND.x + Math.cos(a) * r; k.tz = B.POND.z + Math.sin(a) * r; } }
        const want = k.flee > 0 ? 1.9 : d < 0.5 ? 0.04 : k.cruise; k.v += (want - k.v) * Math.min(1, dt * (k.flee > 0 ? 6 : 1.5));
        if (d > 0.3) k.yaw += Math.max(-1, Math.min(1, wrap(Math.atan2(dx, dz) - k.yaw) * 2.5)) * (k.flee > 0 ? 4 : 1.3) * dt;
        hx = Math.sin(k.yaw); hz = Math.cos(k.yaw); k.x += hx * k.v * dt; k.z += hz * k.v * dt;
        const dp = Math.hypot(k.x - B.POND.x, k.z - B.POND.z), R = B.pondR(Math.atan2(k.z - B.POND.z, k.x - B.POND.x));
        if (dp > R * 0.82) { k.tx = B.POND.x; k.tz = B.POND.z; }                                        // turned back from the shallows
        const depth = B.POND.depth * (1 - Math.pow(Math.min(1, dp / R), 2.2)); top = B.pondY; y = top - Math.max(0.07, Math.min(depth * k.deep, depth - 0.09));
      } else {        // in the brook: along it to a place, hold there nose to the current, move on
        const j = Math.max(0, Math.min(B.n - 2, Math.floor(k.u))), f = k.u - j, cx = lerp(B.X[j], B.X[j + 1], f), cz = lerp(B.Z[j], B.Z[j + 1], f), hw = lerp(B.HW[j], B.HW[j + 1], f), dep = lerp(B.DEP[j], B.DEP[j + 1], f);
        const nx = -B.TZ[j], nz = B.TX[j]; k.x = cx + nx * k.q * hw; k.z = cz + nz * k.q * hw;
        if (Math.hypot(px - k.x, pz - k.z) < 2.2 && k.flee <= 0) { k.flee = 1.5; const away = (px - cx) * B.TX[j] + (pz - cz) * B.TZ[j] > 0 ? -1 : 1; k.goal = Math.max(lo, Math.min(hi, k.u + away * 30)); k.hold = 0; }
        k.flee -= dt; const gap = k.goal - k.u, there = Math.abs(gap) < 1.2;
        if (there) { if (k.hold <= 0) k.hold = 2 + Math.random() * 10; k.hold -= dt; if (k.hold <= 0) { k.goal = Math.max(lo, Math.min(hi, k.u + (Math.random() - 0.5) * 140)); k.qg = (Math.random() - 0.5) * 1.1; } }
        const want = k.flee > 0 ? 2.1 : there ? 0 : k.cruise * (gap < 0 ? 0.8 : 1.15); k.v += (want - k.v) * Math.min(1, dt * (k.flee > 0 ? 6 : 1.5));
        k.u += Math.sign(gap) * k.v * dt / 0.4; k.q += (k.qg - k.q) * Math.min(1, dt * 0.5);
        const face = there ? -1 : Math.sign(gap) || 1, ty = Math.atan2(B.TX[j] * face, B.TZ[j] * face); k.yaw += wrap(ty - k.yaw) * Math.min(1, dt * 3);
        const bed = dep * (1 - k.q * k.q); top = B.WY[j]; y = top - Math.max(0.05, Math.min(bed * k.deep, bed - 0.05));
      }
      const swim = k.pond || k.v > 0.05 ? k.v : 0.35;                                                   // holding station in the current is still swimming
      k.phase += dt * (3.5 + 9 * Math.min(2, swim));
      _q.setFromAxisAngle(_up, k.yaw); koi.setMatrixAt(i, _m.compose(_p.set(k.x, y, k.z), _q, _s.setScalar(k.len)));
      A.setXYZW(i, k.seed, k.phase, 0.45 + 0.75 * Math.min(1.3, swim / 0.5), k.kind); D.setX(i, top - y);
    });
    koi.instanceMatrix.needsUpdate = true; A.needsUpdate = true; D.needsUpdate = true;
  }
  update(0.016, 0, 1e6, 1e6);
  return { group, water, banks, update, kois, setSize(h) { group.userData.mist.material.uniforms.uPx.value = h * 0.9; } };
}

// Timber footbridges (tools/blender/build_bridge.py): a kit of boards, stringers, sills, posts and rails, laid out here to each crossing's
// span and width. In the kit's frame X runs along the span, Z across it, Y up; the boards' tops are the deck (y = 0).
function bridgeKit(bridge, P) {
  const parts = {}; bridge.scene.updateMatrixWorld(true);
  bridge.scene.traverse(o => { if (!o.isMesh) return; const g = o.geometry.clone();
    for (const k of ['position', 'normal', 'uv']) { const a = g.attributes[k]; if (!a) continue; const n = a.itemSize, f = new Float32Array(a.count * n), get = [a.getX, a.getY, a.getZ]; for (let i = 0; i < a.count; i++) for (let c = 0; c < n; c++) f[i * n + c] = get[c].call(a, i); g.setAttribute(k, new THREE.BufferAttribute(f, n)); }   // unpack the quantized parts
    g.applyMatrix4(o.matrixWorld); parts[o.name] = g; });
  const mat = P.std({ map: bridge.map, normalMap: bridge.nmap, normalScale: new THREE.Vector2(1, 1), roughness: 0.88, side: THREE.DoubleSide }, { key: 'oak' });
  const lists = {}, put = (name, M) => { (lists[name] = lists[name] || []).push(M); };
  const hash = i => { let h = (i * 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };
  const Mx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  let seed = 0;
  return {
    lay(d, top) {
      const S = d.across, W = d.along, base = new THREE.Matrix4().compose(new THREE.Vector3(d.x, top, d.z), q.setFromEuler(e.set(0, Math.atan2(-d.tx, -d.tz), 0)), sc.set(1, 1, 1));
      const at = (x, y, z, ry, rz, sx, sy, sz) => { Mx.compose(v.set(x, y, z), q.setFromEuler(e.set(0, ry, rz)), sc.set(sx, sy, sz)); return base.clone().multiply(Mx); };
      // boards across the walk, a finger's gap apart, each a little different
      const n = Math.max(4, Math.round(S / 0.152)), pitch = S / n;
      for (let i = 0; i < n; i++) { const r = hash(seed++), r2 = hash(seed++);
        put('board' + Math.floor(r * 6), at(-S / 2 + pitch * (i + 0.5) + (r2 - 0.5) * 0.008, (r - 0.5) * 0.005, (r2 - 0.5) * 0.04, (r - 0.5) * 0.02, 0, 1, 1, W + 0.04 + r2 * 0.03)); }
      for (const z of [-W / 2 + 0.16, 0, W / 2 - 0.16]) put('stringer', at(-S / 2 - 0.05, -0.035, z, 0, 0, S + 0.1, 1, 1));
      for (const x of [-S / 2 + 0.12, S / 2 - 0.12]) put('sill', at(x, -0.255, 0, 0, 0, 1, 1, W + 0.3));
      // posts each side, about every 1.2 m, handrail and mid rail on them, a brace in each end panel
      const np = Math.max(2, Math.ceil((S - 0.2) / 1.25) + 1), x0 = -S / 2 + 0.12, x1 = S / 2 - 0.12;
      for (const s of [-1, 1]) { const z = s * (W / 2 + 0.065);
        for (let i = 0; i < np; i++) put('post', at(x0 + (x1 - x0) * i / (np - 1), 0, z, 0, 0, 1, 1, 1));
        put('rail', at(x0 - 0.06, 0.985, z, 0, 0, x1 - x0 + 0.12, 1, 1)); put('midrail', at(x0, 0.5, z + s * 0.01, 0, 0, x1 - x0, 1, 1));
        const pw = (x1 - x0) / (np - 1), rise = 0.42, len = Math.hypot(pw, rise), ang = Math.atan2(rise, pw);
        put('brace', at(x0, 0.05, z - s * 0.012, 0, ang, len, 1, 1)); put('brace', at(x1, 0.05, z - s * 0.012, Math.PI, ang, len, 1, 1)); }
    },
    finish(group) {
      for (const [name, Ms] of Object.entries(lists)) { const g = parts[name]; if (!g) continue;
        const im = new THREE.InstancedMesh(g, mat, Ms.length); Ms.forEach((M, i) => im.setMatrixAt(i, M)); im.castShadow = im.receiveShadow = true; group.add(im); }
    },
  };
}
