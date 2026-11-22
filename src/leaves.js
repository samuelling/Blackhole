// leaves.js: the garden's side of the leaf model (senescence.js).
//   - shader chunks that colour every leaf on every bough from its own pigments, and drop it on its own day
//   - leaves coming down through the air, shaped and coloured like the tree they left
//   - litter gathering under the crowns, on the paths and afloat on the water
import * as THREE from 'three';
import { D0, ND, NC, NE, NJ, Q, REFLECT_GLSL, SPECIES, SP_INDEX } from './senescence.js';

// atlas layout (tools/build_leafcards.py): 2048 x 1280; eight 512 px twigs in two rows, eight 256 px single leaves below
const AW = 2048, AH = 1280;
export const twigRect = i => [(i % 4) * 512 / AW, 1 - (Math.floor(i / 4) + 1) * 512 / AH, 512 / AW, 512 / AH];
export const leafRect = i => [i * 256 / AW, 1 - (1024 + 256) / AH, 256 / AW, 256 / AH];
export const LUM_REF = 0.115;
// which Blender form each species grows as, and what its bark looks like against the scanned brown bark
export const HABIT = {
  lime: { kind: 'round', bark: [1, 1, 1] }, willow: { kind: 'weep', bark: [0.95, 0.9, 0.82] }, rubrum: { kind: 'round', bark: [1.2, 1.22, 1.28] }, saccharum: { kind: 'round', bark: [0.95, 0.95, 0.97] },
  liquidambar: { kind: 'cone', bark: [0.88, 0.86, 0.84] }, papyrifera: { kind: 'birch', bark: [3.3, 3.45, 3.6] }, rubra: { kind: 'oak', bark: [0.72, 0.72, 0.75] }, biloba: { kind: 'cone', bark: [1.05, 1.0, 0.96] },
};
export { SPECIES, SP_INDEX };

// ---------------------------------------------------------------- one leaf's state, in GLSL
// L = (how sunlit this bough is, a random number for the bough, the tree's day of year, the tree's species)
export const LEAF_GLSL = REFLECT_GLSL + /* glsl */`
uniform sampler2D uLeafTab; uniform sampler2D uLeafAux;
float leafState(vec4 L, float lid, float order, out vec4 pg){
  float e = clamp(L.x + (fract(lid * 7.31) - 0.5) * 0.22, 0.0, 0.999);
  int row = int(L.w + 0.5) * ${NC} + int(e * ${NE}.0) * ${NJ} + int(fract(lid * 13.7 + L.y * 5.3) * ${NJ}.0);
  float d = L.z, k = d >= ${D0}.0 ? d - ${D0}.0 : d < 95.0 ? d + ${365 - D0}.0 : 0.0;       // after leaf-out and before July the crown is simply in leaf
  vec4 fz = texelFetch(uLeafTab, ivec2(${ND}, row), 0);
  float f16 = fz.r * 65280.0 + fz.g * 255.0, fallK = f16 > 65534.5 ? 1e6 : f16 / 65535.0 * ${ND}.0;
  float kl = clamp(k - 7.0 * order, 0.0, ${ND - 1}.0), k0 = floor(kl);                        // the blade along the veins runs about a week behind the margins
  pg = mix(texelFetch(uLeafTab, ivec2(int(k0), row), 0), texelFetch(uLeafTab, ivec2(min(int(k0) + 1, ${ND - 1}), row), 0), kl - k0) * vec4(${Q.C.toFixed(2)}, ${Q.X.toFixed(2)}, ${Q.A.toFixed(2)}, ${Q.T.toFixed(2)});
  if (d >= 95.0 && d < ${D0}.0) { float s = smoothstep(100.0, 165.0, d); pg.x *= mix(0.45, 1.0, s); pg.y *= mix(0.7, 1.0, s); }   // young leaves are thin and pale
  float on = step(k, fallK);
  if (d < 95.0) on *= step(smoothstep(45.0, 92.0, d), fract(lid * 91.7 + L.y * 3.1));          // what an oak holds all winter it lets go before the buds break
  return on;
}`;
const V_DECL = /* glsl */`attribute vec2 aLeaf; flat varying vec4 vLeaf;\n`;
const V_SET = /* glsl */`
{ int lp = int(aPlant + 0.5); vec4 lps = texelFetch(uPlantS, ivec2(lp % uPlantW, lp / uPlantW), 0); vLeaf = vec4(aLeaf, lps.y, lps.w); }`;
const F_PICK = /* glsl */`
  vec3 lm = texture2D(uLeafAux, vMapUv).rgb;
  float lml = log2(max(length(dFdx(vMapUv)), length(dFdy(vMapUv))) * ${AW}.0 + 1e-6);
  float lid = mix(lm.r, vLeaf.y, smoothstep(1.6, 3.2, lml));            // far away a whole bough turns and drops as one
  vec4 lpg; float lon = leafState(vLeaf, lid, lm.g, lpg);
  if (lon < 0.5 && lm.b < 0.5) discard;                                 // this leaf is down; the twig stays`;
/** Patch a canopy material (made with the garden's patcher, options grow + atlas) so the model colours and drops its leaves. */
export function patchCanopy(sh, U, depth) {
  sh.uniforms.uLeafTab = U.uLeafTab; sh.uniforms.uLeafAux = U.uLeafAux;
  sh.vertexShader = sh.vertexShader.replace('void main() {', V_DECL + 'void main() {').replace('vWPos = wp.xyz;', 'vWPos = wp.xyz;' + V_SET);
  const head = 'flat varying vec4 vLeaf;\n' + LEAF_GLSL + '\nvoid main() {';
  if (depth) sh.fragmentShader = sh.fragmentShader.replace('void main() {', head).replace('#include <map_fragment>', '#include <map_fragment>\n{' + F_PICK + '\n}');
  else sh.fragmentShader = sh.fragmentShader.replace('void main() {', head).replace('#include <color_fragment>', `#include <color_fragment>
{${F_PICK}
  float ldet = dot(sampledDiffuseColor.rgb, vec3(0.3, 0.59, 0.11)) / ${LUM_REF};
  vec3 lsh = diffuseColor.rgb / max(sampledDiffuseColor.rgb, vec3(1e-4));   // the bough's own shading: how much sky it sees
  diffuseColor.rgb = mix(leafReflect(lpg) * ldet * lsh, diffuseColor.rgb, smoothstep(0.35, 0.65, lm.b));
}`);
}

// ---------------------------------------------------------------- per-tree numbers the falling leaves and the litter read
// a float texture, one column per tree: row 0 = x, z, crown radius, crown top; row 1 = litter amount, fall rate, species, crown bottom;
// row 2 = colour of the litter; row 3 = colour of what is falling now; row 4 = ground height at the tree
export function createLeafFall({ U, COMMON, P, trees, tex, blocked, pools, canal, WATER_Y, lite, heightAt = () => 0 }) {
  const NT = trees.length, info = new Float32Array(NT * 5 * 4);
  const tInfo = new THREE.DataTexture(info, NT, 5, THREE.RGBAFormat, THREE.FloatType); tInfo.magFilter = tInfo.minFilter = THREE.NearestFilter; tInfo.generateMipmaps = false;
  trees.forEach((T, i) => { const gy = T.gy || 0; info.set([T.x, T.z, T.A, gy + T.cy + T.B], i * 4); info.set([0, 0, T.sp, gy + Math.max(1.2, T.cy - T.B)], (NT + i) * 4); info.set([gy, T.k || 1, 0, 0], (4 * NT + i) * 4); });
  tInfo.needsUpdate = true;
  const uInfo = { value: tInfo };
  let stats = null;
  /** d: each tree's own day of year. Fills in how much has come down, how fast it is coming, and in what colours. */
  function update(doyOf) {
    if (!stats) return;
    for (let i = 0; i < NT; i++) {
      const T = trees[i], S = stats[T.sp], d = doyOf(T), o1 = (NT + i) * 4, o2 = (2 * NT + i) * 4, o3 = (3 * NT + i) * 4;
      let amt = 0, rate = 0, k = 0;
      if (d >= D0) { const kf = Math.min(ND - 1.001, d - D0), f = kf - Math.floor(kf); k = Math.floor(kf); amt = S.fallen[k] * (1 - f) + S.fallen[k + 1] * f; rate = S.rate[k] * (1 - f) + S.rate[k + 1] * f; }
      else if (d < 95) { k = ND - 1; const t = Math.min(1, Math.max(0, (d - 12) / 70)); amt = S.fallen[k] * (1 - t * t * (3 - 2 * t)); rate = d > 45 ? (1 - S.fallen[k]) * 0.03 : 0; }   // swept and rotted away by spring
      info[o1] = amt; info[o1 + 1] = rate;
      info[o2] = S.litterCol[k * 3]; info[o2 + 1] = S.litterCol[k * 3 + 1]; info[o2 + 2] = S.litterCol[k * 3 + 2];
      info[o3] = S.fallCol[k * 3]; info[o3 + 1] = S.fallCol[k * 3 + 1]; info[o3 + 2] = S.fallCol[k * 3 + 2];
    }
    tInfo.needsUpdate = true;
  }
  const rnd = (() => { let a = 91173; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();
  const group = new THREE.Group(); group.name = 'leaf fall';
  const quad = new THREE.PlaneGeometry(1, 1);
  const weights = trees.map(T => T.A * T.A * (T.inside ? 1 : 0.45)), wsum = weights.reduce((a, b) => a + b, 0);

  // ---- litter: single leaves lying where they landed. Each has a threshold: it is there once that much of the crown is down.
  const litter = [];
  trees.forEach((T, ti) => {
    const n = Math.round((lite ? 4200 : 15000) * weights[ti] / wsum);
    for (let i = 0; i < n; i++) {
      const u = rnd(), r = T.A * (0.1 + 1.5 * Math.pow(u, 0.75)), a = rnd() * Math.PI * 2, x = T.x + Math.cos(a) * r + 0.3 * T.A * 0.8, z = T.z + Math.sin(a) * r + 0.3 * T.A * 0.6;   // drifted a little downwind
      const inPool = pools.some(p => Math.hypot(x - p.x, z - p.z) < p.r - 0.12), inCanal = Math.abs(x) < canal.hw - 0.1 && z > canal.z0 + 0.1 && z < canal.z1 - 0.1, wet = inPool || inCanal;
      if (!wet && blocked(x, z)) continue;
      if (!wet && Math.hypot(x - T.x, z - T.z) < 0.5) continue;
      litter.push({ x, z, y: wet ? WATER_Y + 0.006 : heightAt(x, z) + 0.015 + rnd() * 0.05, wet, ti, thr: 0.03 + 0.94 * Math.pow(rnd(), 1.15) * (0.55 + 0.45 * Math.min(1, r / (T.A * 1.3))), s: 0.8 + rnd() * 0.45 });
    }
  });
  if (litter.length) {
    const g = quad.clone(), n = litter.length, rect = new Float32Array(n * 4), lit = new Float32Array(n * 3);
    const mat = P.std({ map: tex.trees_atlas, normalMap: tex.trees_atlas_n, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.7, envMapIntensity: 0.3 }, { atlas: true, key: 'litter', extra: sh => {
      sh.uniforms.uTreeInfo = uInfo;
      sh.vertexShader = sh.vertexShader.replace('void main() {', `attribute vec3 aLit; uniform sampler2D uTreeInfo; varying vec3 vLitCol;\nvoid main() {`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
{ int ti = int(aLit.x + 0.5); vec4 r1 = texelFetch(uTreeInfo, ivec2(ti, 1), 0);
  transformed *= step(aLit.y, r1.x);                                                      // not fallen yet: nothing to draw
  float age = clamp((r1.x - aLit.y) * 3.5, 0.0, 1.0);                                      // the first down have lain longest and browned most
  vLitCol = mix(texelFetch(uTreeInfo, ivec2(ti, 3), 0).rgb, texelFetch(uTreeInfo, ivec2(ti, 2), 0).rgb * 0.8, age) * (0.75 + 0.5 * aLit.z); }`);
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'varying vec3 vLitCol;\nvoid main() {')
        .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb = vLitCol * dot(sampledDiffuseColor.rgb, vec3(0.3, 0.59, 0.11)) / ${LUM_REF};`);
    } });
    const im = new THREE.InstancedMesh(g, mat, n), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    litter.forEach((l, i) => {
      const T = trees[l.ti], size = SIZE[T.sp] * l.s * (T.k || 1); rect.set(leafRect(T.sp), i * 4); lit.set([l.ti, l.thr, rnd()], i * 3);
      e.set(-Math.PI / 2 + (l.wet ? 0 : (rnd() - 0.5) * 0.7), rnd() * Math.PI * 2, (l.wet ? 0 : (rnd() - 0.5) * 0.7), 'YXZ'); q.setFromEuler(e); if (rnd() < 0.5) q.multiply(FLIP);
      im.setMatrixAt(i, m.compose(p.set(l.x, l.y, l.z), q, s.setScalar(size)));
    });
    g.setAttribute('aRect', new THREE.InstancedBufferAttribute(rect, 4)); g.setAttribute('aLit', new THREE.InstancedBufferAttribute(lit, 3));
    im.frustumCulled = false; im.receiveShadow = true; im.castShadow = false; im.name = 'litter'; group.add(im);
  }

  // ---- leaves in the air: each slot belongs to a tree and falls again and again; how many are showing follows how fast the tree is shedding
  const NF = lite ? 1200 : 4000;
  {
    const g = new THREE.InstancedBufferGeometry(); g.index = quad.index; g.setAttribute('position', quad.attributes.position); g.setAttribute('uv', quad.attributes.uv);
    const seed = new Float32Array(NF * 4), tr = new Float32Array(NF * 2); let acc = 0, ti = 0;
    for (let i = 0; i < NF; i++) { while (ti < NT - 1 && (i + 0.5) / NF > (acc + weights[ti]) / wsum) acc += weights[ti++]; seed.set([rnd(), rnd(), rnd(), rnd()], i * 4); tr.set([ti, trees[ti].sp], i * 2); }
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4)); g.setAttribute('aTree', new THREE.InstancedBufferAttribute(tr, 2)); g.instanceCount = NF;
    const mat = new THREE.ShaderMaterial({
      uniforms: Object.assign({}, U, { uTreeInfo: uInfo, uAtlas: { value: tex.trees_atlas }, uSizes: { value: SIZE } }), side: THREE.DoubleSide,
      vertexShader: COMMON + /* glsl */`
attribute vec4 aSeed; attribute vec2 aTree; uniform sampler2D uTreeInfo; uniform float uWind; uniform float uGust; uniform vec2 uWindDir; uniform float uExhibit; uniform float uSizes[8];
varying vec2 vUv; varying vec3 vCol;
float h1(float n){ return fract(sin(n * 127.1) * 43758.5453); }
void main(){
  int ti = int(aTree.x + 0.5), sp = int(aTree.y + 0.5);
  vec4 r0 = texelFetch(uTreeInfo, ivec2(ti, 0), 0), r1 = texelFetch(uTreeInfo, ivec2(ti, 1), 0);
  float per = 5.5 + 4.5 * aSeed.w, ph = uTime / per + aSeed.x * 19.0, cyc = floor(ph), u = fract(ph), n = cyc * 3.71 + aSeed.y * 57.0;
  float blow = 0.45 + uWind * (0.6 + 1.4 * uGust);                                           // a gust shakes more of them loose
  float show = step(h1(n + 0.5), clamp(r1.y * 7.0 * blow, 0.0, 0.92));
  float a = h1(n + 1.3) * 6.2832, rr = sqrt(h1(n + 2.1)) * 0.95, hh = mix(r1.w, r0.w, pow(h1(n + 3.7), 0.7));
  vec3 p0 = vec3(r0.x + cos(a) * rr * r0.z, hh, r0.y + sin(a) * rr * r0.z);
  float t = u * per, fallen = u * (p0.y - 0.04 - texelFetch(uTreeInfo, ivec2(ti, 4), 0).x);
  vec2 drift = uWindDir * uWind * 1.6 * t * (0.6 + 0.8 * h1(n + 4.4));
  float zig = 0.32 * (0.4 + h1(n + 5.9));                                                    // the side-to-side swing of a falling leaf
  vec3 p = p0 + vec3(drift.x, -fallen, drift.y) + vec3(cos(a + 1.7), 0.0, sin(a + 1.7)) * zig * sin(t * 2.3 + aSeed.z * 6.3) * smoothstep(0.0, 0.8, t);
  p.y += 0.05 * cos(t * 4.6 + aSeed.z * 6.3) * smoothstep(0.0, 0.8, t);
  for (int i = 0; i < MAXV; i++) { float s = uVoid[i].w; if (s < 0.001) continue;
    vec3 dv = uVoid[i].xyz - p; float f = 1.0 - smoothstep(uVoidAux[i].z * 0.2, uVoidAux[i].z, length(dv)); p += dv * min(0.9, s * f * f * 0.95); }
  // tumble: the leaf rocks about its long axis and turns slowly as it comes
  float ra = sin(t * 2.3 + aSeed.z * 6.3) * 1.1 + t * (h1(n + 6.6) - 0.5) * 3.0, rb = t * (0.6 + h1(n + 7.2)) + aSeed.x * 6.3;
  vec3 ax = vec3(cos(rb), 0.0, sin(rb)), up = vec3(-sin(rb) * sin(ra), cos(ra), cos(rb) * sin(ra));
  float size = uSizes[sp] * texelFetch(uTreeInfo, ivec2(ti, 4), 0).y * (0.8 + 0.45 * aSeed.y) * show * smoothstep(0.0, 0.04, u) * (1.0 - smoothstep(0.985, 1.0, u));
  vec3 wp = p + (ax * position.x + up * position.y) * size;
  vCol = texelFetch(uTreeInfo, ivec2(ti, 3), 0).rgb * (0.75 + 0.5 * aSeed.z)
    * (uAmb * 1.5 + uSun * 0.55 + groundLight(wp.xz) * uExhibit * uLightGain * clamp(1.25 - wp.y * 0.12, 0.3, 1.25)) * drainAt(wp);
  vUv = (uv * vec2(0.125, 0.2) + vec2(float(sp) * 0.125, 0.0));
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`,
      fragmentShader: /* glsl */`uniform sampler2D uAtlas; varying vec2 vUv; varying vec3 vCol;
void main(){ vec4 tx = texture2D(uAtlas, vUv); if (tx.a < 0.4) discard; gl_FragColor = vec4(vCol * dot(tx.rgb, vec3(0.3, 0.59, 0.11)) / ${LUM_REF} * (gl_FrontFacing ? 1.0 : 0.82), 1.0); }`,
    });
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.name = 'falling leaves'; group.add(mesh);
  }
  return { group, update, setStats(s) { stats = s; }, info, count: { litter: litter.length, falling: NF } };
}
// leaf lengths in metres, stalk included, in species order
// a fallen leaf's size (m) on a tree at its nominal size: the same leaf as on the bough (a 0.58 m bough card times the species' leaf
// fraction in tools/build_leafcards.py), times the tree's scale k, so what lies under a tree matches what hangs on it
const SIZE = [0.082, 0.118, 0.118, 0.138, 0.13, 0.075, 0.158, 0.084];
const FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
