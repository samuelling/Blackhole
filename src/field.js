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
    uniforms: { uTime: U.uTime, uSunDir: U.uSunDir, uMoonDir: U.uMoonDir, uDay: U.uDay, uSunCol: U.uSunCol, uHead: U.uHead },
    vertexShader: /* glsl */`varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
uniform float uTime; uniform vec3 uSunDir; uniform vec3 uMoonDir; uniform float uDay; uniform vec3 uSunCol; uniform vec3 uHead; varying vec3 vW; varying vec3 vN;
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
  c *= smoothstep(-0.5, 5.0, vW.y);                                                  // nothing below the ground line
  gl_FragColor = vec4(c, 1.0);
}`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.position.set(CENTRE.x, BUBBLE.y, CENTRE.z); mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.name = 'bubble';
  return mesh;
}
