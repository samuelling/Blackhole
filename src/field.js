// field.js: the garden's setting. A field about two football pitches across, rolling a little, inside a bubble of air
// travelling through space. The garden and the trees just beyond its wall stand on a level plateau at the centre.
import * as THREE from 'three';

export const CENTRE = { x: 0, z: 12 };                 // middle of the garden, and of the bubble
export const RIM = 106;                                // where the ground meets the bubble's skin (m from the centre)
export const BUBBLE = { y: 26, R: Math.hypot(RIM, 26 - 2.6) };   // a sphere: the field cuts it low down, so the skin leans out over the rim
const PX = 37, PZC = 11.5, PZ = 52.5;                  // the plateau: |x| < 37, 41 m north to 64 m south
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** How far a point is outside the plateau (0 on it). */
export function outside(x, z) { return Math.hypot(Math.max(Math.abs(x) - PX, 0), Math.max(Math.abs(z - PZC) - PZ, 0)); }
/** Ground height: level on the plateau, long swells beyond it, rising gently to the rim. The GLSL below is the same function. */
export function heightAt(x, z) {
  const w = ss(0, 34, outside(x, z)), r = Math.hypot(x - CENTRE.x, z - CENTRE.z), e = ss(84, 108, r);
  return w * (1.5 * Math.sin(x * 0.033 + 1.3) * Math.cos(z * 0.029 - 0.4) + 0.8 * Math.sin(x * 0.071 - z * 0.057 + 2.1) + 0.28 * Math.sin(x * 0.19 + z * 0.15 + 0.7)) + 2.6 * e * e;
}
export const FIELD_GLSL = /* glsl */`
float fieldOut(vec2 p){ return length(max(abs(p - vec2(0.0, ${PZC.toFixed(1)})) - vec2(${PX.toFixed(1)}, ${PZ.toFixed(1)}), 0.0)); }
float fieldH(vec2 p){
  float w = smoothstep(0.0, 34.0, fieldOut(p)), e = smoothstep(84.0, 108.0, length(p - vec2(${CENTRE.x.toFixed(1)}, ${CENTRE.z.toFixed(1)})));
  return w * (1.5 * sin(p.x * 0.033 + 1.3) * cos(p.y * 0.029 - 0.4) + 0.8 * sin(p.x * 0.071 - p.y * 0.057 + 2.1) + 0.28 * sin(p.x * 0.19 + p.y * 0.15 + 0.7)) + 2.6 * e * e;
}
vec3 fieldN(vec2 p){ float e = 0.6; return normalize(vec3(fieldH(p - vec2(e, 0.0)) - fieldH(p + vec2(e, 0.0)), 2.0 * e, fieldH(p - vec2(0.0, e)) - fieldH(p + vec2(0.0, e)))); }
// 0 in the garden, 1 out in the field: where mown lawn gives way to long grass (the old wall line is at |x| = 27, z = -31 and 55)
float fieldF(vec2 p){ return smoothstep(0.6, 3.5, length(max(abs(p - vec2(0.0, 12.0)) - vec2(27.4, 43.4), 0.0))); }
// the yard beside the length of wall being built: the grass is trodden short there, so the stone can be seen (walling.js sets these)
uniform vec4 uWork; uniform float uWorkOn;
float workF(vec2 p){ vec2 d = p - uWork.xy; float lx = d.x * uWork.z - d.y * uWork.w, lz = d.x * uWork.w + d.y * uWork.z;
  return uWorkOn * (1.0 - smoothstep(3.0, 4.0, abs(lx))) * smoothstep(-1.7, -0.9, lz) * (1.0 - smoothstep(8.8, 9.8, lz)); }`;

/** The ground as a mesh: a 2 m grid out to the rim, lifted to the field's height. */
export function groundGeometry() {
  const N = 112, S = 224, g = new THREE.PlaneGeometry(S, S, N, N).rotateX(-Math.PI / 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) + CENTRE.x, z = p.getZ(i) + CENTRE.z; p.setXYZ(i, x, heightAt(x, z), z); }
  const idx = g.index.array, keep = [];
  for (let t = 0; t < idx.length; t += 3) { let inside = false; for (let k = 0; k < 3; k++) { const i = idx[t + k]; if (Math.hypot(p.getX(i) - CENTRE.x, p.getZ(i) - CENTRE.z) < RIM + 3.5) inside = true; } if (inside) keep.push(idx[t], idx[t + 1], idx[t + 2]); }
  g.setIndex(keep); g.computeVertexNormals(); return g;
}
// The wood. Most of the field is under trees: [x, z, crown radius, species], thrown down at random with room between trunks.
// Left open: a band round the garden for the wall and its stone, a ride from the gate to the rim, and four glades for the sky.
export const GLADES = [[-64, -34, 15], [66, 50, 14], [4, -78, 12], [-58, 70, 11]];
export const RIDE = 5.5;                                // half the ride's width; it runs south from the gate
const KEEP = 13.5;                                      // metres clear beyond the wall line (27.25; -31.25 and 55.25)
/** How far a point lies outside the wall line (0 inside it). */
export function beyondWall(x, z) { return Math.hypot(Math.max(Math.abs(x) - 27.25, 0), Math.max(Math.abs(z - 12) - 43.25, 0)); }
export const FIELD_TREES = (() => {
  let a = 20261122; const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const MIX = [['saccharum', 22], ['rubra', 20], ['rubrum', 18], ['papyrifera', 14], ['lime', 10], ['liquidambar', 10], ['biloba', 4], ['willow', 2]], tot = MIX.reduce((n, m) => n + m[1], 0);
  const pick = () => { let r = rnd() * tot; for (const [sp, w] of MIX) { r -= w; if (r <= 0) return sp; } return MIX[0][0]; };
  const out = [];
  for (let n = 0; n < 9000; n++) {
    const r = 97 * Math.sqrt(rnd()), th = rnd() * Math.PI * 2, x = CENTRE.x + Math.cos(th) * r, z = CENTRE.z + Math.sin(th) * r, gap = 7.8 + 2.8 * rnd();
    if (beyondWall(x, z) < KEEP || (Math.abs(x) < RIDE && z > 55) || GLADES.some(g => Math.hypot(x - g[0], z - g[1]) < g[2])) continue;
    let near = null, nd = 1e9, ok = true;
    for (const t of out) { const d = Math.hypot(x - t[0], z - t[1]); if (d < gap) { ok = false; break; } if (d < nd) { nd = d; near = t; } }
    if (!ok) continue;
    // stands: half the time a tree is of its nearest neighbour's kind
    out.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10, Math.round((4.4 + 1.8 * rnd()) * 10) / 10, near && nd < 19 && rnd() < 0.5 ? near[3] : pick()]);
  }
  return out;
})();

// ---------------------------------------------------------------- space, seen through the bubble
// Added to the sky shader. A nebula lies dead ahead (uHead); faint dust streams back past the bubble from that point.
export const SPACE_GLSL = /* glsl */`
uniform vec3 uHead;
float sfbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * (vn(p.xy + p.z * 1.7) * 0.5 + vn(p.yz * 1.13 + p.x * 2.3 + 7.0) * 0.5); p = p * 2.07 + vec3(11.0, 5.0, 3.0); a *= 0.5; } return s; }
vec3 spaceAt(vec3 d, float t){
  float ah = dot(d, uHead), core = smoothstep(0.35, 0.995, ah);
  float n1 = sfbm(d * 2.2 + vec3(0.0, 0.0, t * 0.002)), n2 = sfbm(d * 5.5 + 13.0), fil = pow(1.0 - abs(2.0 * n2 - 1.0), 3.0);
  // the nebula ahead: a golden heart in dusty amber, rose and violet at its edges
  vec3 neb = mix(vec3(0.20, 0.05, 0.12), vec3(1.0, 0.55, 0.16), smoothstep(0.3, 0.8, n1 * (0.55 + core))) * (0.05 + 0.95 * core * core) * smoothstep(0.25, 0.75, n1 + 0.5 * core);
  neb += vec3(1.0, 0.86, 0.6) * pow(max(ah, 0.0), 60.0) * 0.9 + vec3(1.0, 0.7, 0.3) * fil * core * 0.5;
  // elsewhere: thin teal and violet wisps
  float w2 = smoothstep(0.52, 0.85, sfbm(d.zxy * 1.7 + 4.0)) * (1.0 - core);
  vec3 wisp = mix(vec3(0.04, 0.10, 0.16), vec3(0.11, 0.05, 0.17), n2) * w2;
  // dust streaming back from the point we are heading for
  vec3 ax = normalize(cross(uHead, vec3(0.0, 1.0, 0.0))), ay = cross(ax, uHead);
  float th = acos(clamp(ah, -1.0, 1.0)), ph = atan(dot(d, ay), dot(d, ax));
  vec2 q = vec2(ph * 28.0 / 6.2832, log(max(tan(th * 0.5), 1e-3)) * 5.0 - t * 0.11), c = floor(q), f = fract(q);
  float rnd = hash(c), on = step(0.93, rnd), sx = hash(c + 3.1);
  float streak = on * smoothstep(0.06, 0.0, abs(f.x - 0.2 - 0.6 * sx)) * smoothstep(0.0, 0.25, f.y) * smoothstep(0.85, 0.3, f.y) * smoothstep(0.05, 0.5, th) * smoothstep(3.1, 2.4, th);
  return neb * 0.34 + wisp * 0.1 + vec3(0.8, 0.85, 1.0) * streak * 0.05;
}`;

/** The bubble's skin: seen from inside, a soap film that shows mostly where you look along it. */
export function createBubble(U) {
  const geo = new THREE.SphereGeometry(BUBBLE.R, 96, 64);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: U.uTime, uSunDir: U.uSunDir, uMoonDir: U.uMoonDir, uDay: U.uDay, uSunCol: U.uSunCol, uHead: U.uHead, uOut: U.uOut },
    vertexShader: /* glsl */`varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
uniform float uTime; uniform vec3 uSunDir; uniform vec3 uMoonDir; uniform float uDay; uniform vec3 uSunCol; uniform vec3 uHead; uniform float uOut; varying vec3 vW; varying vec3 vN;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + vec2(17.0, 5.0); a *= 0.5; } return s; }
void main(){
  vec3 N = -normalize(vN), V = normalize(cameraPosition - vW);                      // N points inward, toward us
  float nv = max(dot(N, V), 0.0), fres = pow(1.0 - nv, 2.6);
  // film thickness drifts and drains downward, as on a soap bubble; its colour is the interference of that thickness
  vec3 q = vW * 0.022; float th = fbm(q.xz + q.y * 0.7 + vec2(uTime * 0.012, 0.0)) * 1.3 + fbm(q.zy * 2.3 - uTime * 0.02) * 0.5 + vW.y * 0.004;
  vec3 irid = 0.5 + 0.5 * cos(6.2832 * (th * 2.2 + vec3(0.0, 0.33, 0.67)));
  float lightLevel = 0.06 + 0.5 * uDay;
  // the film drains: thick and banded with colour low down, thinning to almost nothing overhead, where you look straight out
  float hgt = clamp((vW.y - 2.0) / ${(BUBBLE.y + BUBBLE.R).toFixed(1)}, 0.0, 1.0), low = exp(-hgt * 5.5), bands = 0.5 + 0.5 * sin(hgt * 90.0 + th * 9.0);
  vec3 c = irid * lightLevel * (fres * 0.9 + low * (0.3 + 0.5 * bands) + 0.012) * (0.55 + 0.45 * fbm(q.xy * 3.0 + uTime * 0.03));
  c += vec3(0.6, 0.75, 1.0) * (pow(1.0 - nv, 6.0) * 0.9 + exp(-max(vW.y - 2.4, 0.0) * 0.55) * 0.5) * lightLevel;   // the bright edge where the skin turns away, and where it meets the ground
  vec3 L = uSunDir.y > -0.08 ? uSunDir : uMoonDir; float sp = pow(max(dot(reflect(-L, N), V), 0.0), 240.0);
  c += (uSunDir.y > -0.08 ? vec3(1.0, 0.93, 0.8) * 2.2 : vec3(0.6, 0.7, 1.0) * 0.5) * sp;           // the sun or the moon glinting off the inside
  c += vec3(1.0, 0.6, 0.22) * pow(max(dot(reflect(-uHead, N), V), 0.0), 30.0) * 0.05;               // and the nebula's glow
  c *= mix(1.0, 0.35, uOut);                                                         // from outside this is the far wall, seen through the near one
  c += uOut * uDay * vec3(0.08, 0.17, 0.4) * (0.3 + 0.7 * pow(1.0 - nv, 1.5));       // and the lit air the bubble holds: by day it is a blue marble
  c *= smoothstep(-0.5, 5.0, vW.y);                                                  // nothing below the ground line
  gl_FragColor = vec4(c, 1.0);
}`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.position.set(CENTRE.x, BUBBLE.y, CENTRE.z); mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.name = 'bubble';
  return mesh;
}


// ---------------------------------------------------------------- the bubble from outside (the space view)
// Three things that exist only for a camera beyond the skin: the skin's outer face, the earth the field rests on (the sphere below the
// ground line is full of it), and the dust the bubble is flying through. U.uOut runs 0 (inside) to 1 (out there).
export function createSpaceView(U) {
  const group = new THREE.Group(); group.name = 'space view'; group.visible = false;
  const C = new THREE.Vector3(CENTRE.x, BUBBLE.y, CENTRE.z), R = BUBBLE.R;
  const NOISE = /* glsl */`
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + vec2(17.0, 5.0); a *= 0.5; } return s; }`;
  const VERT = /* glsl */`varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;

  // the skin's outer face: a soap film in starlight. Bright where it turns away from you, banded with slow colour, glinting with the sun
  // or moon, and warm on the side that faces the nebula, where the dust burns off it
  const shell = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 80), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: U.uTime, uSunDir: U.uSunDir, uMoonDir: U.uMoonDir, uHead: U.uHead, uOut: U.uOut },
    vertexShader: VERT,
    fragmentShader: /* glsl */`uniform float uTime; uniform vec3 uSunDir; uniform vec3 uMoonDir; uniform vec3 uHead; uniform float uOut; varying vec3 vW; varying vec3 vN;${NOISE}
void main(){
  vec3 N = normalize(vN), V = normalize(cameraPosition - vW); float nv = max(dot(N, V), 0.0);
  vec3 q = vW * 0.018; float th = fbm(q.xz + q.y * 0.7 + vec2(uTime * 0.012, 0.0)) * 1.3 + fbm(q.zy * 2.1 - uTime * 0.02) * 0.5 + vW.y * 0.004;
  vec3 irid = 0.5 + 0.5 * cos(6.2832 * (th * 2.0 + vec3(0.0, 0.33, 0.67)));
  vec3 c = irid * (pow(1.0 - nv, 3.0) * 0.5 + 0.018) * (0.5 + 0.5 * fbm(q.xy * 3.0 + uTime * 0.03));
  c += vec3(0.62, 0.8, 1.0) * pow(1.0 - nv, 5.0) * 0.85;
  bool sunUp = uSunDir.y > -0.08; vec3 L = sunUp ? uSunDir : uMoonDir;
  c += (sunUp ? vec3(1.0, 0.94, 0.82) * 3.0 : vec3(0.6, 0.7, 1.0) * 0.7) * pow(max(dot(reflect(-L, N), V), 0.0), 320.0);
  float lead = max(dot(N, uHead), 0.0);
  c += vec3(1.0, 0.6, 0.24) * (pow(lead, 3.0) * 0.07 + pow(max(dot(reflect(-uHead, N), V), 0.0), 22.0) * 0.22);
  c += vec3(1.0, 0.78, 0.5) * pow(lead, 9.0) * 0.14 * (0.55 + 0.45 * fbm(q.xz * 7.0 + uTime * 1.6));
  gl_FragColor = vec4(c * uOut, 1.0);
}`,
  }));
  shell.position.copy(C); shell.renderOrder = 5; shell.frustumCulled = false; group.add(shell);

  // the earth under the field: topsoil, subsoil, then bedded rock, with roots hanging in the first few metres
  const th0 = Math.acos((7 - BUBBLE.y) / (R - 0.8));
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(R - 0.8, 128, 56, 0, Math.PI * 2, th0, Math.PI - th0), new THREE.ShaderMaterial({
    fog: false, uniforms: { uSunDir: U.uSunDir, uMoonDir: U.uMoonDir, uDay: U.uDay, uHead: U.uHead },
    vertexShader: /* glsl */`${FIELD_GLSL}
varying vec3 vW; varying vec3 vN; varying float vDepth;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); float gy = fieldH(w.xz) - 0.07; vDepth = gy - w.y; w.y = min(w.y, gy);   // the top of the bowl is drawn in under the turf
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`uniform vec3 uSunDir; uniform vec3 uMoonDir; uniform float uDay; uniform vec3 uHead; varying vec3 vW; varying vec3 vN; varying float vDepth;${NOISE}
void main(){
  vec3 N = normalize(vN); float az = atan(vW.z - ${CENTRE.z.toFixed(1)}, vW.x - ${CENTRE.x.toFixed(1)});
  vec2 p = vec2(az * 34.0, vW.y * 0.5); float n = fbm(p), n2 = fbm(p * 3.7 + 9.0);
  float d = max(vDepth, 0.0) + (n - 0.5) * 2.2;
  vec3 top = vec3(0.045, 0.03, 0.018), sub = vec3(0.13, 0.085, 0.045), rock = mix(vec3(0.11, 0.1, 0.095), vec3(0.19, 0.165, 0.14), n2);
  float beds = 0.5 + 0.5 * sin(vW.y * 1.7 + n * 5.0 + az * 3.0); rock *= 0.72 + 0.4 * smoothstep(0.35, 0.65, beds);
  rock *= 1.0 - 0.5 * smoothstep(0.62, 0.7, fbm(vec2(az * 9.0, vW.y * 0.09) + 3.0));                       // joints and overhangs
  vec3 col = mix(mix(top, sub, smoothstep(0.6, 2.6, d)), rock, smoothstep(3.5, 9.0, d));
  float root = smoothstep(0.86, 0.97, vn(vec2(az * 260.0, 3.0))) * (1.0 - smoothstep(1.0, 3.0 + 10.0 * vn(vec2(az * 60.0, 7.0)), d)) * step(0.15, d);
  col = mix(col, vec3(0.3, 0.24, 0.16), root * 0.8);
  vec3 L = uSunDir.y > -0.08 ? uSunDir : uMoonDir; float sun = max(dot(N, L), 0.0) * (uSunDir.y > -0.08 ? 2.6 * uDay : 0.12);
  vec3 lit = vec3(0.05, 0.055, 0.07) + vec3(0.15, 0.16, 0.18) * uDay + vec3(1.0, 0.96, 0.9) * sun + vec3(1.0, 0.62, 0.28) * (0.1 + 0.9 * max(dot(N, uHead), 0.0)) * 0.3;
  gl_FragColor = vec4(col * lit, 1.0);
}`,
  }));
  bowl.position.copy(C); bowl.frustumCulled = false; group.add(bowl);

  // dust: streaks coming out of the point the bubble is heading for and going by. None pass through it, and it leaves a clear wake.
  const NS = 3200, pos = new Float32Array(NS * 2 * 3), seed = new Float32Array(NS * 2 * 4), end = new Float32Array(NS * 2);
  let a = 77123; const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  for (let i = 0; i < NS; i++) { const sx = rnd(), sy = rnd(), sz = rnd(), sw = rnd(); for (let k = 0; k < 2; k++) { seed.set([sx, sy, sz, sw], (i * 2 + k) * 4); end[i * 2 + k] = k; } }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4)); sg.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const streaks = new THREE.LineSegments(sg, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: U.uTime, uHead: U.uHead, uOut: U.uOut, uC: { value: C }, uR: { value: R } },
    vertexShader: /* glsl */`attribute vec4 aSeed; attribute float aEnd; uniform float uTime; uniform vec3 uHead; uniform vec3 uC; uniform float uR; uniform float uOut; varying vec3 vCol;
void main(){
  const float B = 1100.0;
  vec3 ax = normalize(cross(uHead, vec3(0.0, 1.0, 0.0))), ay = cross(ax, uHead);
  float v = 70.0 + 190.0 * aSeed.w * aSeed.w, along = B * 0.5 - mod(aSeed.z * B + uTime * v, B);
  vec3 rel = ax * (aSeed.x - 0.5) * B + ay * (aSeed.y - 0.5) * B + uHead * (along + aEnd * v * 0.16);
  float rp = length(rel - uHead * dot(rel, uHead)), ah = dot(rel, uHead);
  float wake = ah < 0.0 ? mix(smoothstep(uR * 0.95, uR * 1.35, rp), 1.0, smoothstep(0.0, uR * 6.0, -ah)) : 1.0;   // downstream of the bubble
  float clear = smoothstep(uR * 1.02, uR * 1.3, length(rel)) * wake;
  float fade = smoothstep(B * 0.5, B * 0.36, abs(along));
  vCol = mix(vec3(1.0, 0.72, 0.42), vec3(0.72, 0.84, 1.0), fract(aSeed.x * 91.7)) * (0.25 + 0.75 * fract(aSeed.y * 57.3)) * clamp(clear, 0.0, 1.0) * fade * (1.0 - 0.75 * aEnd) * uOut * 0.65;
  gl_Position = projectionMatrix * viewMatrix * vec4(uC + rel, 1.0);
}`,
    fragmentShader: /* glsl */`varying vec3 vCol; void main(){ gl_FragColor = vec4(vCol, 1.0); }`,
  }));
  streaks.frustumCulled = false; streaks.renderOrder = 6; group.add(streaks);
  return { group, centre: C, radius: R, update(out) { group.visible = out > 0.001; } };
}
