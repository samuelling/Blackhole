// field.js: the garden's setting. A field about two football pitches across, rolling a little, inside a bubble of air
// travelling through space. The garden and the trees just beyond its wall stand on a level plateau at the centre.
import * as THREE from 'three';
import { makeBrook, createBrookView } from './brook.js';

export const CENTRE = { x: 0, z: 12 };                 // middle of the garden, and of the bubble
export const RIM = 106;                                // where the ground meets the bubble's skin (m from the centre)
export const BUBBLE = { y: 4, R: 113 };                // a sphere centred at about the level of the land, which floats in it clear of the skin
/** How far the land reaches in each direction from the centre: a torn outline, 92 to 106 m. The GLSL landEdge() is the same function. */
export function edgeR(x, z) { const a = Math.atan2(z - CENTRE.z, x - CENTRE.x);
  return 99 + 2.6 * Math.sin(3 * a + 0.7) + 1.8 * Math.sin(7 * a + 2.3) + 1.1 * Math.sin(13 * a + 4.1) + 0.7 * Math.sin(29 * a + 1.1) + 0.4 * Math.sin(53 * a + 0.3); }
const PX = 37, PZC = 11.5, PZ = 52.5;                  // the plateau: |x| < 37, 41 m north to 64 m south
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** How far a point is outside the plateau (0 on it). */
export function outside(x, z) { return Math.hypot(Math.max(Math.abs(x) - PX, 0), Math.max(Math.abs(z - PZC) - PZ, 0)); }
/** Ground height: level on the plateau, long swells beyond it, rising gently to the rim. The GLSL below is the same function. */
function baseH(x, z) {
  const w = ss(0, 34, outside(x, z)), r = Math.hypot(x - CENTRE.x, z - CENTRE.z), e = ss(84, 108, r);
  return w * (1.5 * Math.sin(x * 0.033 + 1.3) * Math.cos(z * 0.029 - 0.4) + 0.8 * Math.sin(x * 0.071 - z * 0.057 + 2.1) + 0.28 * Math.sin(x * 0.19 + z * 0.15 + 0.7)) + 2.6 * e * e;
}
/** The pond and the brook (brook.js): cut into the ground below. */
export const BROOK = makeBrook(baseH, edgeR, CENTRE);
/** The ground as it is cut: down into the brook's channel and the pond. */
export function terrainAt(x, z) { const b = baseH(x, z); return b - BROOK.carve(x, z, b); }
/** The ground you walk and plant on: the cut ground, but the slabs over the brook are floor too. */
export function heightAt(x, z) { const b = baseH(x, z); return BROOK.onDeck(x, z) ? b + 0.04 : b - BROOK.carve(x, z, b); }
/** True within m metres of the brook's or the pond's banks: nothing is planted or stood there. */
export const nearBrook = (x, z, m = 0) => BROOK.bank(x, z) < m;
/** How deep the ground is cut here for the brook or the pond (m; 0 away from them). */
export const cutAt = (x, z) => BROOK.carve(x, z, baseH(x, z));
export function createBrook(o) { return createBrookView({ brook: BROOK, ground: terrainAt, ...o }); }
export const FIELD_GLSL = /* glsl */`
float fieldOut(vec2 p){ return length(max(abs(p - vec2(0.0, ${PZC.toFixed(1)})) - vec2(${PX.toFixed(1)}, ${PZ.toFixed(1)}), 0.0)); }
float fieldH(vec2 p){
  float w = smoothstep(0.0, 34.0, fieldOut(p)), e = smoothstep(84.0, 108.0, length(p - vec2(${CENTRE.x.toFixed(1)}, ${CENTRE.z.toFixed(1)})));
  return w * (1.5 * sin(p.x * 0.033 + 1.3) * cos(p.y * 0.029 - 0.4) + 0.8 * sin(p.x * 0.071 - p.y * 0.057 + 2.1) + 0.28 * sin(p.x * 0.19 + p.y * 0.15 + 0.7)) + 2.6 * e * e;
}
vec3 fieldN(vec2 p){ float e = 0.6; return normalize(vec3(fieldH(p - vec2(e, 0.0)) - fieldH(p + vec2(e, 0.0)), 2.0 * e, fieldH(p - vec2(0.0, e)) - fieldH(p + vec2(0.0, e)))); }
// 0 in the garden, 1 out in the field: where mown lawn gives way to long grass (the old wall line is at |x| = 27, z = -31 and 55)
float fieldF(vec2 p){ return smoothstep(0.6, 3.5, length(max(abs(p - vec2(0.0, 12.0)) - vec2(27.4, 43.4), 0.0))); }
// where the land ends (metres from the centre, by direction): edgeR() in JS
float landEdge(vec2 p){ vec2 d = p - vec2(${CENTRE.x.toFixed(1)}, ${CENTRE.z.toFixed(1)}); float a = atan(d.y, d.x);
  return 99.0 + 2.6 * sin(3.0 * a + 0.7) + 1.8 * sin(7.0 * a + 2.3) + 1.1 * sin(13.0 * a + 4.1) + 0.7 * sin(29.0 * a + 1.1) + 0.4 * sin(53.0 * a + 0.3); }
// the yard beside the length of wall being built: the grass is trodden short there, so the stone can be seen (walling.js sets these)
uniform vec4 uWork; uniform float uWorkOn;
float workF(vec2 p){ vec2 d = p - uWork.xy; float lx = d.x * uWork.z - d.y * uWork.w, lz = d.x * uWork.w + d.y * uWork.z;
  return uWorkOn * (1.0 - smoothstep(3.0, 4.0, abs(lx))) * smoothstep(-1.7, -0.9, lz) * (1.0 - smoothstep(8.8, 9.8, lz)); }`;

/** The ground as a mesh: a 2 m grid out to the rim, lifted to the field's height. */
export function groundGeometry() {
  const N = 112, S = 224, g = new THREE.PlaneGeometry(S, S, N, N).rotateX(-Math.PI / 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) + CENTRE.x, z = p.getZ(i) + CENTRE.z; p.setXYZ(i, x, baseH(x, z), z); }   // uncut: the turf over the brook is thrown away in the shader, and the banks are their own mesh
  const idx = g.index.array, keep = [];
  for (let t = 0; t < idx.length; t += 3) { let inside = false; for (let k = 0; k < 3; k++) { const i = idx[t + k]; if (Math.hypot(p.getX(i) - CENTRE.x, p.getZ(i) - CENTRE.z) < RIM + 3.5) inside = true; } if (inside) keep.push(idx[t], idx[t + 1], idx[t + 2]); }
  g.setIndex(keep); g.computeVertexNormals(); return g;
}
// The wood. Most of the field is under trees: [x, z, crown radius, species], thrown down at random with room between trunks.
// Left open: a band round the garden for the wall and its stone, a ride from the gate to the rim, and four glades for the sky.
export const GLADES = [[-64, -34, 15], [66, 50, 14], [4, -78, 12], [-58, 70, 11]];
export const CLEARING = { x: 52.6, z: 5.6, r: 10.5 };    // where the wormhole hangs and the junk lands (junk.js); kept clear of trees after the wood is laid out
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
    const r = 92 * Math.sqrt(rnd()), th = rnd() * Math.PI * 2, x = CENTRE.x + Math.cos(th) * r, z = CENTRE.z + Math.sin(th) * r, gap = 7.8 + 2.8 * rnd();
    if (r > edgeR(x, z) - 7 || beyondWall(x, z) < KEEP || (Math.abs(x) < RIDE && z > 55) || GLADES.some(g => Math.hypot(x - g[0], z - g[1]) < g[2])) continue;
    let near = null, nd = 1e9, ok = true;
    for (const t of out) { const d = Math.hypot(x - t[0], z - t[1]); if (d < gap) { ok = false; break; } if (d < nd) { nd = d; near = t; } }
    if (!ok) continue;
    // stands: half the time a tree is of its nearest neighbour's kind
    out.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10, Math.round((4.4 + 1.8 * rnd()) * 10) / 10, near && nd < 19 && rnd() < 0.5 ? near[3] : pick()]);
  }
  return out.filter(t => BROOK.bank(t[0], t[1]) > 1.6 && Math.hypot(t[0] - CLEARING.x, t[1] - CLEARING.z) > CLEARING.r);   // and none in the wormhole's clearing            // none standing in the brook or the pond (taken out afterwards, so the rest of the wood is as it was)
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
  float th = acos(clamp(ah, -1.0, 1.0)), ph = atan(dot(d, ay), dot(d, ax) + 1e-7);
  vec2 q = vec2(ph * 28.0 / 6.2832, log(max(tan(min(th * 0.5, 1.5)), 1e-3)) * 5.0 - t * 0.11), c = floor(q), f = fract(q);
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
  float nv = clamp(dot(N, V), 0.0, 1.0), fres = pow(1.0 - nv, 2.6);   // clamped: a hair over 1 makes pow() return not-a-number, and bloom spreads one such pixel into a black block
  // film thickness drifts and drains downward, as on a soap bubble; its colour is the interference of that thickness
  vec3 q = vW * 0.022; float th = fbm(q.xz + q.y * 0.7 + vec2(uTime * 0.012, 0.0)) * 1.3 + fbm(q.zy * 2.3 - uTime * 0.02) * 0.5 + vW.y * 0.004;
  vec3 irid = 0.5 + 0.5 * cos(6.2832 * (th * 2.2 + vec3(0.0, 0.33, 0.67)));
  float lightLevel = 0.06 + 0.5 * uDay;
  // the film drains: thick and banded with colour low down, thinning to almost nothing overhead, where you look straight out
  float hgt = clamp(abs(vW.y - 2.0) / ${(BUBBLE.y + BUBBLE.R).toFixed(1)}, 0.0, 1.0), low = exp(-hgt * 5.5) * mix(0.26, 1.0, smoothstep(-8.0, 8.0, vW.y - 2.0)), bands = 0.5 + 0.5 * sin(hgt * 90.0 + th * 9.0);
  vec3 c = irid * lightLevel * (fres * 0.9 + low * (0.3 + 0.5 * bands) + 0.012) * (0.55 + 0.45 * fbm(q.xy * 3.0 + uTime * 0.03));
  c += vec3(0.6, 0.75, 1.0) * pow(1.0 - nv, 6.0) * 0.9 * lightLevel;   // the bright edge where the skin turns away
  vec3 L = uSunDir.y > -0.08 ? uSunDir : uMoonDir; float sp = pow(max(dot(reflect(-L, N), V), 0.0), 240.0);
  c += (uSunDir.y > -0.08 ? vec3(1.0, 0.93, 0.8) * 2.2 : vec3(0.6, 0.7, 1.0) * 0.5) * sp;           // the sun or the moon glinting off the inside
  c += vec3(1.0, 0.6, 0.22) * pow(max(dot(reflect(-uHead, N), V), 0.0), 30.0) * 0.05;               // and the nebula's glow
  c *= mix(1.0, 0.35, uOut);                                                         // from outside this is the far wall, seen through the near one
  c += uOut * uDay * vec3(0.08, 0.17, 0.4) * (0.3 + 0.7 * pow(1.0 - nv, 1.5));       // and the lit air the bubble holds: by day it is a blue marble
  gl_FragColor = vec4(c, 1.0);
}`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.position.set(CENTRE.x, BUBBLE.y, CENTRE.z); mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.name = 'bubble';
  return mesh;
}


// ---------------------------------------------------------------- the bubble from outside (the space view)
// Two things that exist only for a camera beyond the skin: the skin's outer face, and the dust the bubble is flying through.
// U.uOut runs 0 (inside) to 1 (out there).
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
  vec3 N = normalize(vN), V = normalize(cameraPosition - vW); float nv = clamp(dot(N, V), 0.0, 1.0);
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


// ---------------------------------------------------------------- the land, torn out of somewhere
// The field is the top of a piece of ground ripped away whole and carried off: an iceberg of earth, upside down, hanging in the bubble.
// Below the turf's torn edge it is a cliff of soil and roots, undercut, then bedded rock narrowing in fins to a keel some 70 m down.
// You can walk to the brink and look over; from the space view it is the whole shape.
export function createLand(U) {
  const NT = 480, F = Array.from({ length: 34 }, (_, k) => Math.max(0.006 * (k + 1), Math.pow((k + 1) / 34, 1.6)));   // rings down the face, closest together near the top
  const h3 = (i, j, k) => { let n = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 2147483647); n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967296; };
  const n3 = (x, y, z) => { const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), u = ss(0, 1, x - i), v = ss(0, 1, y - j), w = ss(0, 1, z - k), L = (a, b, t) => a + (b - a) * t;
    return L(L(L(h3(i, j, k), h3(i + 1, j, k), u), L(h3(i, j + 1, k), h3(i + 1, j + 1, k), u), v), L(L(h3(i, j, k + 1), h3(i + 1, j, k + 1), u), L(h3(i, j + 1, k + 1), h3(i + 1, j + 1, k + 1), u), v), w) * 2 - 1; };
  const notch = (x, z) => 1.7 * ss(5.0, 1.6, Math.hypot(x - BROOK.fall.x, z - BROOK.fall.z));        // the rock is cut down where the brook goes over, so the water clears it
  const NR = F.length + 2, pos = new Float32Array(NT * NR * 3), dep = new Float32Array(NT * NR), idx = [];
  for (let t = 0; t < NT; t++) {
    const a = t / NT * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), ex = CENTRE.x + ca, ez = CENTRE.z + sa, E = edgeR(ex, ez);
    const put = (k, x, y, z, d) => { const o = (t * NR + k) * 3; pos[o] = x; pos[o + 1] = y; pos[o + 2] = z; dep[t * NR + k] = d; };
    // under the turf, then the bare lip
    { const r = E - 2.0, x = CENTRE.x + ca * r, z = CENTRE.z + sa * r; put(0, x, terrainAt(x, z) - 0.7 - notch(x, z), z, 0); }   // well under the turf (the ground is a 2 m mesh and sags a little between its points)
    const bx = CENTRE.x + ca * E, bz = CENTRE.z + sa * E, by = terrainAt(bx, bz) - 0.3 - notch(bx, bz); put(1, bx, by, bz, 0);
    const D = 64 + 15 * Math.sin(2 * a + 1.0) + 9 * Math.sin(5 * a + 0.4) + 5 * Math.sin(11 * a + 2.0);
    const fin = Math.pow(1 - Math.abs(Math.sin(2.5 * a + 0.6)), 2.2) + 0.6 * Math.pow(1 - Math.abs(Math.sin(5.5 * a + 2.2)), 3) + 0.35 * Math.pow(1 - Math.abs(Math.sin(12.5 * a + 0.9)), 4);   // ridges, sharp along their crests
    F.forEach((f, k) => {
      const s = f * (D + (72 - D) * f * f);                                    // metres below the brink; every direction meets at the keel
      let rho = 1 - Math.pow(f, 1.25) - 0.014 * ss(0.004, 0.02, f) * (1 - f);    // the cliff under the lip is cut back, so the turf overhangs
      rho = rho * (1 - 0.11 * ss(0.03, 0.35, f) + 0.55 * fin * ss(0.04, 0.4, f)) + 0.1 * fin * ss(0.3, 0.8, f) * (1 - f);   // ridges of harder rock stand proud, gullies between them cut in
      let r = Math.max(0, rho) * E; const y = by - s, cx = CENTRE.x + 13 * Math.pow(f, 1.5), cz = CENTRE.z - 9 * Math.pow(f, 1.5);
      const x0 = cx + ca * r, z0 = cz + sa * r, lump = (n3(x0 * 0.04, y * 0.05, z0 * 0.04) * (3 + 11 * f) + n3(x0 * 0.11, y * 0.13, z0 * 0.11) * (1.2 + 3 * f) + n3(x0 * 0.33, y * 0.4, z0 * 0.33) * 0.8) * Math.pow(1 - f, 0.4) * ss(0, 0.03, f);
      r = Math.max(0, r + lump); put(k + 2, cx + ca * r, y + (n3(x0 * 0.3, y * 0.3 + 9, z0 * 0.3) * 0.6 + n3(x0 * 0.07, 3, z0 * 0.07) * 5 * ss(0.05, 0.5, f)) * (1 - f), cz + sa * r, s);
    });
  }
  for (let t = 0; t < NT; t++) for (let k = 0; k < NR - 1; k++) { const t1 = (t + 1) % NT, a = t * NR + k, b = t1 * NR + k, c = a + 1, d = b + 1; idx.push(a, c, b, b, c, d); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aDepth', new THREE.BufferAttribute(dep, 1)); geo.setIndex(idx); geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    side: THREE.DoubleSide, fog: false, uniforms: { uSunDir: U.uSunDir, uMoonDir: U.uMoonDir, uDay: U.uDay, uHead: U.uHead },
    vertexShader: /* glsl */`attribute float aDepth; varying vec3 vW; varying float vDepth; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vDepth = aDepth; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`uniform vec3 uSunDir; uniform vec3 uMoonDir; uniform float uDay; uniform vec3 uHead; varying vec3 vW; varying float vDepth;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + vec2(17.0, 5.0); a *= 0.5; } return s; }
void main(){
  vec3 V = normalize(cameraPosition - vW), N = normalize(cross(dFdx(vW), dFdy(vW))); if (dot(N, V) < 0.0) N = -N;   // broken rock: each face its own plane
  float az = atan(vW.z - ${CENTRE.z.toFixed(1)}, vW.x - ${CENTRE.x.toFixed(1)});
  vec2 p = vec2(az * 34.0, vW.y * 0.5); float n = fbm(p), n2 = fbm(p * 3.7 + 9.0);
  float d = max(vDepth, 0.0) + (n - 0.5) * 2.0 * smoothstep(0.3, 3.0, vDepth);
  vec3 top = vec3(0.05, 0.034, 0.02), sub = vec3(0.14, 0.09, 0.048), rock = mix(vec3(0.11, 0.1, 0.095), vec3(0.2, 0.175, 0.15), n2);
  float beds = 0.5 + 0.5 * sin(vW.y * 1.7 + n * 5.0 + az * 3.0); rock *= 0.7 + 0.42 * smoothstep(0.35, 0.65, beds);
  rock *= 1.0 - 0.5 * smoothstep(0.62, 0.7, fbm(vec2(az * 9.0, vW.y * 0.09) + 3.0));                       // joints and overhangs
  vec3 col = mix(mix(top, sub, smoothstep(0.7, 2.8, d)), rock, smoothstep(3.6, 9.0, d));
  float root = smoothstep(0.84, 0.97, vn(vec2(az * 300.0, 3.0))) * (1.0 - smoothstep(0.8, 2.5 + 9.0 * vn(vec2(az * 70.0, 7.0)), d)) * step(0.2, d);   // roots left hanging
  col = mix(col, vec3(0.32, 0.25, 0.17), root * 0.8);
  bool sunUp = uSunDir.y > -0.08; vec3 L = sunUp ? uSunDir : uMoonDir; float sun = max(dot(N, L), 0.0) * (sunUp ? 2.4 * uDay : 0.12);
  vec3 lit = vec3(0.05, 0.055, 0.07) + vec3(0.3, 0.31, 0.34) * uDay * (0.6 + 0.4 * N.y) + vec3(1.0, 0.96, 0.9) * sun + vec3(1.0, 0.62, 0.28) * (0.1 + 0.9 * max(dot(N, uHead), 0.0)) * 0.3;
  gl_FragColor = vec4(col * lit, 1.0);
}`,
  }));
  mesh.frustumCulled = false; mesh.name = 'land'; return mesh;
}
