// garden.js — the compact walled English garden that the light exhibit (and its voids) live in.
// Surfaces use CC0 photo-scans: PolyHaven PBR sets (gravel, lawn, mulch, setts, brick, stone, bark) and models
// (lamp posts, gate, bench, cat), and ambientCG leaf scans (see tools/build_assets.py). Plants come from
// Shortwood Meadow's PlantArt structure, with scanned leaves and true-3D showpiece flowers.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PlantArt } from './plantart.js';
import { LOOKS, SIZE } from './looks.js';
import { buildFlowers3D, PALETTES, HEAD3D, SPIRE3D } from './flowers3d.js';
import { plantState, flagsFor, lawnTint, sizeAt } from './seasons.js';
import { FLORA_BY_KEY } from './flora.js';
import { HEAP as JUNK_HEAP } from './junk.js';   // (also adds the newer species to LOOKS, SIZE and the calendar, before anything here reads them)
import { simulate, SPECIES, SP_INDEX, ND, NC } from './senescence.js';
import { patchCanopy, createLeafFall, twigRect, HABIT } from './leaves.js';
import { heightAt, FIELD_GLSL, FIELD_TREES, groundGeometry, beyondWall, edgeR, BROOK, nearBrook, createBrook, cutAt } from './field.js';

const TAU = Math.PI * 2, IN = 0.0254;
export const WATER_Y = 0.35;
export const MAP = { x0: -50, z0: -40, s: 100 };   // world rectangle covered by the ground masks and the exhibit light map
const V3 = THREE.Vector3, Q = THREE.Quaternion;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const _Y = new V3(0, 1, 0), _X = new V3(1, 0, 0);
function ihash(a, b, c = 0) { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vn2(x, y, s = 0) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(ihash(xi, yi, s), ihash(xi + 1, yi, s), u), lerp(ihash(xi, yi + 1, s), ihash(xi + 1, yi + 1, s), u), v); }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

// ======================================================================= layout
export function makeLayout() {
  const B = { x0: -27, x1: 27, z0: -31, z1: 55, h: 2.7 };          // inner faces of the brick wall
  const gate = { x: 0, z: 55.25, hw: 1.5 };
  const LX = 21, LZ0 = -25, LZ1 = 49, CR = 5.5, loopPts = [];
  const corner = (cx, cz, a0) => { for (let i = 0; i <= 6; i++) { const a = a0 + i / 6 * Math.PI / 2; loopPts.push([cx + Math.cos(a) * CR, cz + Math.sin(a) * CR]); } };
  const straight = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 6)); for (let i = 1; i < n; i++) loopPts.push([x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n]); };
  corner(LX - CR, LZ1 - CR, 0); straight(LX - CR, LZ1, -LX + CR, LZ1);
  corner(-LX + CR, LZ1 - CR, Math.PI / 2); straight(-LX, LZ1 - CR, -LX, LZ0 + CR);
  corner(-LX + CR, LZ0 + CR, Math.PI); straight(-LX + CR, LZ0, LX - CR, LZ0);
  corner(LX - CR, LZ0 + CR, 1.5 * Math.PI); straight(LX, LZ0 + CR, LX, LZ1 - CR);
  const loopCurve = new THREE.CatmullRomCurve3(loopPts.map(([x, z]) => new V3(x, 0, z)), true, 'centripetal');
  const loopLen = loopCurve.getLength(), NL = Math.ceil(loopLen * 2), loopS = [];
  for (let i = 0; i < NL; i++) { const t = i / NL, p = loopCurve.getPointAt(t), g = loopCurve.getTangentAt(t);
    let ox = -g.z, oz = g.x; if (ox * p.x + oz * (p.z - 12) < 0) { ox = -ox; oz = -oz; }
    loopS.push({ x: p.x, z: p.z, tx: g.x, tz: g.z, ox, oz, t }); }
  const ring = { r: 13.2, bedIn: 8.15, bedOut: 11.55, apron: 7.95, gap: 0.145 };
  const pools = [{ x: 0, z: 0, r: 4.6, kind: 'grand' }, { x: -17.2, z: 0, r: 1.9, kind: 'bowl' }, { x: 17.2, z: 0, r: 1.9, kind: 'bowl' }];
  const canal = { hw: 1.3, z0: 19.5, z1: 35.5 };
  const tunnel = { z0: 46.6, n: 7, step: 1.4, W: 2.2 };
  const avenue = { z0: 38.5, z1: 46.5, x0: 1.85, x1: 5.5, hedgeX: 6.15 };
  const meadow = { x: -13, z: 37.5, r: 5.6 };
  const meadows = [meadow, { x: -14.5, z: -16.5, r: 4.4 }];
  const globeLawn = { x: 13, z: 37.5, r: 5.0 };
  const trees = [{ x: -13, z: 22.5, kind: 'round', sp: 'lime' }, { x: 13, z: 22.5, kind: 'round', sp: 'lime' }, { x: -23.4, z: -27.4, kind: 'weep', sp: 'willow' }, { x: 23.4, z: -27.4, kind: 'weep', sp: 'willow' },
    { x: -14.5, z: -16.5, kind: 'round', sp: 'lime' }, { x: 14.5, z: -16.5, kind: 'round', sp: 'lime' },
    // from Turning Grove: a red maple and a sweetgum on the north lawns, a paper birch in the prairie, a ginkgo by the globes
    { x: 6.5, z: -20.5, kind: 'round', sp: 'rubrum' }, { x: -6.5, z: -20.5, kind: 'cone', sp: 'liquidambar' }, { x: -16.2, z: 41, kind: 'birch', sp: 'papyrifera' }, { x: 16.4, z: 41.2, kind: 'cone', sp: 'biloba' }];
  const lamps = [[-22.9, 40], [-22.9, 14], [-22.9, -12], [22.9, 28], [22.9, 4], [22.9, -20], [-9, -26.9], [9, -26.9], [-11, 50.9], [11, 50.9]];
  const arches = [[-21, 27, 0, 1], [-21, -8, 0, 1], [21, 16, 0, 1], [21, -8, 0, 1], [0, -17, 0, 1]];   // x, z, tangent
  const bench = { x: 0, z: -28.0 };
  // x, y, z, size — index 1 is the giant above the grand fountain
  const voids = [[0, 2.6, 37.0, 1.0], [0, 16.5, 0, 3.0], [-13, 3.0, 37.5, 1.25], [13, 2.6, 37.5, 0.9], [-17.2, 2.6, 0, 0.8], [13.4, 4.6, 22.2, 0.5], [0.5, 2.8, -22.5, 1.0], [22.6, 2.6, -12, 0.7], [-22.8, 2.4, 14, 0.45], [-14.2, 4.8, -16.8, 0.55]];
  const start = { x: 0, z: 52.6 };
  const pathS = [];
  const line = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0); for (let d = 0; d <= L; d += 0.5) pathS.push([x0 + (x1 - x0) * d / L, z0 + (z1 - z0) * d / L]); };
  for (const s of loopS) pathS.push([s.x, s.z]);
  line(0, 55, 0, 36.6); line(2.6, 18.4, 2.6, 36.6); line(-2.6, 18.4, -2.6, 36.6); line(0, 18.4, 0, -25); line(-21, 0, 21, 0);
  for (let a = 0; a < TAU; a += 0.04) pathS.push([Math.cos(a) * 12.2, Math.sin(a) * 12.2]);
  function distToPath(x, z) { let m = 1e9; for (const p of pathS) { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < m) m = d; } return Math.sqrt(m); }
  const inWalls = (x, z, m = 0) => x > B.x0 + m && x < B.x1 - m && z > B.z0 + m && z < B.z1 - m;
  return { B, gate, loopPts, loopCurve, loopLen, loopS, pathS, distToPath, inWalls, ring, pools, canal, tunnel, avenue, meadow, meadows, globeLawn, trees, lamps, arches, bench, voids, start, LX, LZ0, LZ1 };
}

// ======================================================================= assets
export const PBR_SETS = ['gravel_floor', 'sparse_grass', 'yellow_flower_mulch', 'cobblestone_square', 'castle_brick_02_red', 'white_plaster_02', 'bark_brown_02'];
const CARDS = ['leaf_atlas', 'card_yew', 'card_box', 'card_lime', 'card_cover', 'card_ivy', 'trees_atlas'];
const MODELS = ['street_lamp_01', 'large_iron_gate', 'painted_wooden_bench', 'concrete_cat_statue'];
// Models are glTF saved as .json with the buffer embedded as base64 (tools/gltf_embed.py). The buffer is unpacked here and
// handed to GLTFLoader as an in-memory GLB, so nothing but same-origin fetches is needed (data: URLs are often blocked).
export async function loadModel(url) {
  const r = await fetch(url); if (!r.ok) throw new Error(r.status + ' ' + url);
  const g = await r.json(), b = g.buffers && g.buffers[0]; let bin = null;
  if (b && b.uri && b.uri.startsWith('data:')) { const s = atob(b.uri.slice(b.uri.indexOf(',') + 1)); bin = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) bin[i] = s.charCodeAt(i); delete b.uri; }
  const enc = new TextEncoder().encode(JSON.stringify(g)), jl = (enc.length + 3) & ~3, bl = bin ? (bin.length + 3) & ~3 : 0;
  const glb = new ArrayBuffer(20 + jl + (bin ? 8 + bl : 0)), dv = new DataView(glb), u8 = new Uint8Array(glb);
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, glb.byteLength, true);
  dv.setUint32(12, jl, true); dv.setUint32(16, 0x4E4F534A, true); u8.set(enc, 20); u8.fill(0x20, 20 + enc.length, 20 + jl);
  if (bin) { dv.setUint32(20 + jl, bl, true); dv.setUint32(24 + jl, 0x004E4942, true); u8.set(bin, 28 + jl); }
  return new Promise((res, rej) => new GLTFLoader().parse(glb, url.slice(0, url.lastIndexOf('/') + 1), o => res(o.scene), rej));
}
export async function loadAssets(renderer, onProgress = () => {}) {
  const base = new URL('../assets/', import.meta.url).href, tl = new THREE.TextureLoader(), aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  let done = 0; const total = PBR_SETS.length * 3 + CARDS.length * 2 + 2 + MODELS.length + 4;
  const tick = () => onProgress(++done / total);
  const T = (file, srgb, repeat) => new Promise((res, rej) => tl.load(base + 'tex/' + file + '.webp', t => {
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; tick(); res(t); }, undefined, () => rej(new Error('could not load ' + file))));
  const tex = {}, models = {}, jobs = [];
  for (const s of PBR_SETS) { tex[s] = {}; for (const [m, srgb] of [['diff', true], ['nor', false], ['arm', false]]) jobs.push(T(`${s}_${m}`, srgb, true).then(t => { tex[s][m] = t; })); }
  for (const c of CARDS) { jobs.push(T(c, true, false).then(t => { tex[c] = t; })); jobs.push(T(c + '_n', false, false).then(t => { tex[c + '_n'] = t; })); }
  jobs.push(T('waternormals', false, true).then(t => { tex.waternormals = t; }));
  jobs.push(T('trees_atlas_m', false, false).then(t => { tex.trees_atlas_m = t; }));   // which leaf, turn order, wood (tools/build_leafcards.py)
  for (const m of MODELS) jobs.push(loadModel(`${base}models/${m}/${m}.json`).then(sc => { models[m] = sc; tick(); }, () => { throw new Error('could not load ' + m); }));
  // stonework modelled in Blender (tools/blender/build_stone.py); the garden falls back to simple turned shapes without it
  jobs.push(loadModel(base + 'models/stone.json').then(sc => { models.stone = sc; tick(); }, () => tick()));
  // trees grown in Blender (tools/blender/build_trees.py); simpler procedural trees stand in without them
  jobs.push(loadModel(base + 'models/props.json').then(sc => { models.props = sc; tick(); }, () => tick()));   // coping stones, lantern (build_props.py)
  jobs.push(loadModel(base + 'models/trees.json').then(sc => { models.trees = sc; tick(); }, () => tick()));
  jobs.push(loadModel(base + 'models/astronaut.json').then(sc => { models.astronaut = sc; tick(); }, () => tick()));   // your own body (build_astronaut.py); you walk as a bare camera without it
  await Promise.all(jobs);
  return { tex, models };
}
const LEAF_KEYS = ['lance', 'ovate', 'serrate', 'broad', 'fuzzy', 'fleshy', 'sprig', 'trifoliate', 'palmate', 'digitate', 'round', 'thread', 'fern', 'compound', 'rose', 'sword', 'blade'];
const LEAF_RECTS = {}; LEAF_KEYS.forEach((k, i) => { const CELL = 512, COLS = 5, ROWS = 4, PAD = 12, W = COLS * CELL, H = ROWS * CELL, x = (i % COLS) * CELL + PAD, y = Math.floor(i / COLS) * CELL + PAD; LEAF_RECTS[k] = [x / W, 1 - (y + CELL - 2 * PAD) / H, (CELL - 2 * PAD) / W, (CELL - 2 * PAD) / H]; });

// ======================================================================= material patcher
// Adds to three's standard material: wind sway, atlas sub-rects, per-plant growth and seasonal colour, cupped flower discs,
// 3D-floret colouring, leaf translucency, triplanar weathered stone, alpha-to-coverage edges — and, on every lit surface,
// the exhibit's light pools, the giant's disk glow, the voids' drain and gravitational red/blue shift.
export function makePatcher(U, COMMON) {
  const VHEAD = `uniform float uWind; uniform float uGust; uniform vec2 uWindDir; uniform float uSway; uniform float uSwayH; uniform float uTime;
varying vec3 vWPos;
#ifdef ATLAS
attribute vec4 aRect;
#endif
#ifdef DISC
attribute vec2 aShape;
#endif
#ifdef FLORET
attribute vec3 aCol2; varying vec3 vCol2;
#endif
#ifdef GROW
attribute float aPlant; uniform sampler2D uPlantA; uniform sampler2D uPlantS; uniform int uPlantW; varying float vSen;
#endif
`;
  const VPROJ = `
vec4 wp = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
wp = instanceMatrix * wp;
#endif
wp = modelMatrix * wp;
float gBase = 0.0;
#ifdef GROW
{ int pid = int(aPlant + 0.5); ivec2 tc = ivec2(pid % uPlantW, pid / uPlantW);
  vec4 PA = texelFetch(uPlantA, tc, 0), PS = texelFetch(uPlantS, tc, 0);
  vec3 org0 = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #if defined(PART_FLOWER)
  float gs = PS.y, gpos = max(PS.x, step(0.01, PS.y)); vSen = PS.w;
  #elif defined(PART_STEM)
  float gs = max(max(PS.x, step(0.01, PS.y)), mod(PA.w, 2.0)); float gpos = gs; vSen = PS.z;
  #else
  float gs = PS.x, gpos = PS.x; vSen = PS.z;
  #endif
  if (PA.w > 1.5) gpos = 1.0;                       // trees keep their twigs; only the leaves come and go
  else gBase = PA.y;                                // a plant on a slope bends from its own foot, not from sea level
  wp.xyz = PA.xyz + (org0 - PA.xyz) * gpos + (wp.xyz - org0) * gs;
  #ifdef PUFF
  // canopy shading: lean every leaf's normal toward "outward from the crown", so the tree lights as one rounded mass
  vNormal = normalize(mix(vNormal, (viewMatrix * vec4(normalize(wp.xyz - PA.xyz + vec3(0.0, 1.0, 0.0)), 0.0)).xyz, 0.7));
  #endif
}
#endif
if (uSway > 0.0) {
  #ifdef USE_INSTANCING
  vec3 org = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #else
  vec3 org = wp.xyz;
  #endif
  float hh = max(wp.y - gBase, 0.0);
  float bend = pow(clamp(hh / uSwayH, 0.0, 1.8), 1.6) * uSway;
  float ph = dot(wp.xz, uWindDir) * 0.8 - uTime * 2.2;
  float wave = 0.55 + 0.3 * sin(ph) + 0.15 * sin(ph * 2.7 + 1.3);
  float push = uWind * (0.6 + 1.4 * uGust) * wave;
  float flutter = sin(uTime * (5.0 + 3.0 * uWind) + org.x * 35.0 + org.z * 67.0) * (0.12 + uWind) * 0.6;
  vec2 side = vec2(-uWindDir.y, uWindDir.x);
  wp.xz += uWindDir * push * 0.1 * bend + side * flutter * bend * 0.02;
  wp.y -= push * push * 0.03 * bend;
}
vWPos = wp.xyz;
vec4 mvPosition = viewMatrix * wp;
gl_Position = projectionMatrix * mvPosition;`;
  const GTINT = `
#ifdef GROW
{ float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
  if (vSen < 0.0) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum) * vec3(0.85, 1.3, 0.42) * 1.3, -vSen);
  else if (vSen > 0.0) { vec3 yel = vec3(lum) * vec3(1.6, 1.25, 0.32), brn = vec3(lum) * vec3(0.95, 0.62, 0.36);
    diffuseColor.rgb = vSen < 0.5 ? mix(diffuseColor.rgb, yel, vSen * 2.0) : mix(yel, brn, vSen * 2.0 - 1.0); } }
#endif`;
  const FHEAD = COMMON + `
#ifdef GROW
varying float vSen;
#endif
#ifdef FLORET
varying vec3 vCol2;
#endif
#ifdef A2C
uniform float uTexSz;
#endif
#ifdef TRIPLANAR
uniform sampler2D uArm; uniform float uTriS; uniform float uMoss; uniform float uWet;
#endif
uniform float uExhibit; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uDiskPos; uniform vec3 uDiskGlow; uniform vec3 uFlashPos; uniform vec3 uFlashCol; varying vec3 vWPos;
uniform float uSnowCover; uniform float uRainWet;
`;
  // weather on every surface: snow lies on whatever faces the sky, patchy until there is a lot of it; rain darkens and glosses
  const FWEATHER = `
#ifdef STANDARD
{ vec3 wnw = inverseTransformDirection(normal, viewMatrix);
  if (uSnowCover > 0.002) {
    float sn = vnoise(vWPos.xz * 2.3) * 0.55 + vnoise(vWPos.xz * 9.0) * 0.3 + vnoise(vWPos.xz * 31.0) * 0.15;
    float edge = 1.0 - uSnowCover * 1.2;
    float sc = smoothstep(edge, edge + 0.22, smoothstep(0.2, 0.75, wnw.y) * (0.62 + 0.38 * sn));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.83, 0.92), sc); roughnessFactor = mix(roughnessFactor, 0.9, sc); }
  if (uRainWet > 0.002) { float wf = uRainWet * smoothstep(-0.2, 0.5, wnw.y); diffuseColor.rgb *= mix(1.0, 0.66, wf); roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.45, wf); }
}
#endif`;
  const TRI_MAP = `
vec3 twn = normalize(inverseTransformDirection(normalize(vNormal), viewMatrix)) * (gl_FrontFacing ? 1.0 : -1.0);
vec3 tbw = pow(abs(twn), vec3(4.0)); tbw /= (tbw.x + tbw.y + tbw.z);
vec2 tux = vWPos.zy * uTriS, tuy = vWPos.xz * uTriS, tuz = vWPos.xy * uTriS;
vec4 tcol = texture2D(map, tux) * tbw.x + texture2D(map, tuy) * tbw.y + texture2D(map, tuz) * tbw.z;
vec3 tarm = texture2D(uArm, tux).rgb * tbw.x + texture2D(uArm, tuy).rgb * tbw.y + texture2D(uArm, tuz).rgb * tbw.z;
diffuseColor.rgb *= tcol.rgb * mix(1.0, tarm.r, 0.85);
{ // weathering: lichen and moss on upward faces, rain streaks down the sides, dark algae where it stays wet
  vec2 mq = vWPos.xz + vWPos.y * vec2(0.7, 0.4);
  float mn = vnoise(mq * 5.5) * 0.5 + vnoise(mq * 15.0) * 0.3 + vnoise(mq * 41.0) * 0.2;
  float mossy = smoothstep(0.5, 0.92, twn.y) * smoothstep(0.52, 0.7, mn) * uMoss;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.2, 0.07) * (0.6 + 0.9 * mn), mossy * 0.5);
  float lich = smoothstep(0.62, 0.7, vnoise(mq * 23.0 + 7.0)) * uMoss * (1.0 - mossy);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.74, 0.72, 0.55), lich * 0.12);
  float streak = (1.0 - abs(twn.y)) * smoothstep(0.5, 0.9, vnoise(vec2((vWPos.x + vWPos.z) * 17.0, vWPos.y * 1.1)));
  diffuseColor.rgb *= 1.0 - 0.16 * streak * uMoss;
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.6, 0.66, 0.58), uWet);
}`;
  const TRI_NORMAL = `
{ vec3 tnx = texture2D(normalMap, tux).xyz * 2.0 - 1.0, tny = texture2D(normalMap, tuy).xyz * 2.0 - 1.0, tnz = texture2D(normalMap, tuz).xyz * 2.0 - 1.0;
  vec3 nX = vec3(tnx.xy + twn.zy, twn.x), nY = vec3(tny.xy + twn.xz, twn.y), nZ = vec3(tnz.xy + twn.xy, twn.z);
  vec3 wnn = normalize(nX.zyx * tbw.x + nY.xzy * tbw.y + nZ.xyz * tbw.z);
  normal = normalize((viewMatrix * vec4(wnn, 0.0)).xyz); }`;
  const FDRAIN = `
#ifdef TRANSLUCENT
{ vec3 Lv = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  float bl = max(dot(-normal, Lv), 0.0);
  float fw = pow(max(dot(normalize(vWPos - cameraPosition), uSunDir), 0.0), 4.0);
  outgoingLight += diffuseColor.rgb * uSunCol * (0.06 * bl + 0.18 * fw) * step(0.0, uSunDir.y); }
#endif
{
  float Ld = drainAt(vWPos);
  vec3 exh = groundLight(vWPos.xz) * uExhibit * uLightGain * clamp(1.25 - vWPos.y * 0.12, 0.35, 1.25);
  outgoingLight = outgoingLight * mix(1.0, Ld, 0.93) + diffuseColor.rgb * exh * Ld;
  outgoingLight = gshift(outgoingLight, vWPos);
  vec3 dd = uDiskPos - vWPos; float dl = length(dd);
  outgoingLight += diffuseColor.rgb * uDiskGlow * (0.35 + 0.65 * max(dot(normalize((viewMatrix * vec4(dd / dl, 0.0)).xyz), normal), 0.0)) / (1.0 + dl * dl / 180.0);
  vec3 fd = uFlashPos - vWPos; float fl = length(fd);   // an evaporating void's glow and final flash
  outgoingLight += diffuseColor.rgb * uFlashCol * (0.3 + 0.7 * max(dot(normalize((viewMatrix * vec4(fd / max(fl, 1e-3), 0.0)).xyz), normal), 0.0)) / (1.0 + fl * fl / 6.0);
}`;
  function patch(m, o = {}) {
    const a2c = m.alphaToCoverage === true && m.alphaTest > 0;
    m.defines = Object.assign(m.defines || {}, o.grow ? { GROW: '' } : {}, o.part === 'flower' ? { PART_FLOWER: '' } : {}, o.part === 'stem' ? { PART_STEM: '' } : {}, o.atlas ? { ATLAS: '' } : {}, o.disc ? { DISC: '' } : {},
      o.floret ? { FLORET: '' } : {}, o.bell ? { BELL: '' } : {}, o.translucent ? { TRANSLUCENT: '' } : {}, o.tri ? { TRIPLANAR: '' } : {}, a2c ? { A2C: '' } : {}, o.puff && !o.depth ? { PUFF: '' } : {});
    const key = ['g', o.grow ? 'G' + (o.part || 'leaf') : '', o.sway || 0, o.swayH || 0.9, o.atlas ? 'a' : '', o.disc ? 'd' : '', o.depth ? 'z' : '', o.floret ? 'f' : '', o.bell ? 'b' : '', o.translucent ? 't' : '', o.tri ? 'T' : '', a2c ? 'A' : '', o.puff ? 'P' : '', o.key || ''].join('|');
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.uniforms.uSway = { value: o.sway || 0 }; sh.uniforms.uSwayH = { value: o.swayH || 0.9 };
      if (a2c) sh.uniforms.uTexSz = { value: m.map && m.map.image ? m.map.image.width : 1024 };
      if (o.tri) Object.assign(sh.uniforms, { uArm: { value: o.tri.arm }, uTriS: { value: o.tri.scale || 0.6 }, uMoss: { value: o.tri.moss == null ? 1 : o.tri.moss }, uWet: { value: o.tri.wet || 0 } });
      let v = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VHEAD).replace('#include <project_vertex>', VPROJ);
      if (o.atlas) v = v.replace('#include <uv_vertex>', `#include <uv_vertex>
#ifdef USE_MAP
vMapUv = vMapUv * aRect.zw + aRect.xy;
#endif
#ifdef USE_NORMALMAP
vNormalMapUv = vNormalMapUv * aRect.zw + aRect.xy;
#endif`);
      if (o.floret) v = v.replace('#include <color_vertex>', '#include <color_vertex>\nvCol2 = aCol2;');
      if (o.disc) {
        v = v.replace('#include <begin_vertex>', `#include <begin_vertex>
{ float rr = length(position.xz) / 0.5; transformed.y += aShape.x * rr * rr * 0.5 + (rr < 0.34 ? aShape.y * 0.5 * (1.0 - rr / 0.34) : 0.0); }`);
        v = v.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
objectNormal = normalize(vec3(-4.0 * aShape.x * position.x, 1.0, -4.0 * aShape.x * position.z));`);
      }
      sh.vertexShader = v;
      if (!o.depth) {
        let f = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FHEAD).replace('#include <opaque_fragment>', FDRAIN + '\n#include <opaque_fragment>');
        f = f.replace('#include <lights_physical_fragment>', FWEATHER + '\n#include <lights_physical_fragment>');
        if (o.grow) f = f.replace('#include <color_fragment>', '#include <color_fragment>\n' + GTINT);
        if (o.floret) f = f.replace('#include <map_fragment>', '').replace('#include <color_fragment>', `#include <color_fragment>
{ vec4 fm = texture2D(map, vMapUv);
#ifdef BELL
  if (gl_FrontFacing) diffuseColor.rgb *= fm.r * 1.25;
  else { diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), 0.72); diffuseColor.rgb = mix(diffuseColor.rgb, vCol2, fm.b * 0.92); }
#else
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), fm.g);
  diffuseColor.rgb = mix(diffuseColor.rgb, vCol2, fm.b);
  diffuseColor.rgb *= fm.r * 1.25;
#endif
}`);
        if (o.puff) f = f.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normalize(vNormal), normal, 0.3));');
        if (o.tri) f = f.replace('#include <map_fragment>', TRI_MAP).replace('#include <normal_fragment_maps>', TRI_NORMAL)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(tarm.g * mix(1.0, 0.22, uWet), 0.05, 1.0);');
        // alpha-to-coverage: turn the alpha-test edge into a one-pixel coverage ramp, so MSAA smooths every leaf outline
        // far away, where the texture is minified and its alpha averages out, the raw alpha is used so foliage keeps its density
        if (a2c) f = f.replace('#include <alphatest_fragment>', `float a2cMl = log2(max(length(dFdx(vMapUv)), length(dFdy(vMapUv))) * uTexSz + 1e-6);
float a2cA = clamp(mix((diffuseColor.a - alphaTest) / max(fwidth(diffuseColor.a), 1e-4) + 0.5, diffuseColor.a * 1.9, smoothstep(0.8, 2.6, a2cMl)), 0.0, 1.0); if (a2cA <= 0.02) discard;`)
          .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a = a2cA;');
        sh.fragmentShader = f;
      }
      if (o.extra) o.extra(sh);
    };
    m.customProgramCacheKey = () => key;
    return m;
  }
  const std = (params, o = {}) => patch(new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.85, metalness: 0 }, params)), o);
  const depth = (map, o = {}) => patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: map || null, alphaTest: map ? 0.4 : 0 }), Object.assign({}, o, { depth: true }));
  // another library's standard material (Dry Stack's stone): its own vertex stage is kept, the garden's light, weather and voids go into the fragment
  const fragOnly = sh => { Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FHEAD).replace('#include <opaque_fragment>', FDRAIN + '\n#include <opaque_fragment>')
      .replace('#include <lights_physical_fragment>', FWEATHER + '\n#include <lights_physical_fragment>'); };
  return { patch, std, depth, fragOnly };
}

// ======================================================================= small texture helpers
function noiseTex(w, h, base, specks, seed = 1) {
  const [c, g] = canvas(w, h); g.fillStyle = base; g.fillRect(0, 0, w, h);
  const r = PlantArt.rngOf(w * 31 + specks.length + seed * 977);
  for (const [n, cols, size] of specks) for (let i = 0; i < n; i++) {
    g.fillStyle = cols[Math.floor(r() * cols.length)]; const x = r() * w, y = r() * h, s = size[0] + r() * (size[1] - size[0]);
    g.save(); g.translate(x, y); g.rotate(r() * TAU); g.beginPath(); g.ellipse(0, 0, s, s * (0.25 + r() * 0.3), 0, 0, TAU); g.fill(); g.restore();
  }
  return c;
}
function texOf(c, renderer, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t;
}
// a lathe with optional fluting: profile points are [radius, y, fluteAmplitude]
function lathe(pts, segs = 96, flutes = 0) {
  const pos = [], uv = [], idx = [], n = pts.length;
  for (let j = 0; j < n; j++) for (let i = 0; i <= segs; i++) { const a = i / segs * TAU, [r, y, f = 0] = pts[j], rr = r * (1 + (flutes ? f * (0.5 + 0.5 * Math.cos(flutes * a)) : 0));
    pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr); uv.push(i / segs, j / (n - 1)); }
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < segs; i++) { const a = j * (segs + 1) + i, b = a + 1, c = a + segs + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const nm = g.attributes.normal; for (let j = 0; j < n; j++) { const a = j * (segs + 1), b = a + segs, x = nm.getX(a) + nm.getX(b), y = nm.getY(a) + nm.getY(b), z = nm.getZ(a) + nm.getZ(b), l = Math.hypot(x, y, z) || 1; nm.setXYZ(a, x / l, y / l, z / l); nm.setXYZ(b, x / l, y / l, z / l); }
  return g;
}
function worldUV(geo, k = 1) { const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    if (ay > 0.5) uv.setXY(i, x * k, z * k); else if (ax > 0.5) uv.setXY(i, z * k, y * k); else uv.setXY(i, x * k, y * k); }
  return geo; }

// ======================================================================= the garden
export function createGarden({ scene, renderer, U, COMMON, layout, assets, treeSpecs, metalSegs, bulbs = [], lanterns = [], low = false, grassScale = 1, reflScale: reflScale0 = 0.5, woodFull = true }) {
  const P = makePatcher(U, COMMON), TX = assets.tex;
  console.log('[garden] GPU texture units per shader: ' + renderer.capabilities.maxTextures);
  const rng = PlantArt.rngOf(1969);
  const rr = (a, b) => a + (b - a) * rng();
  const pick = a => a[Math.floor(rng() * a.length)];
  const lite = low;   // 'lite' detail: fewer leaves, sprigs, plants and grass, smaller masks and atlases (gfx.js)
  const DETAIL = lite ? 0.3 : 0.46, LS = lite ? 1.45 : 1.38;
  const { B, ring } = layout;
  const A2C = renderer.capabilities.isWebGL2 && !lite;
  const cut = (params) => Object.assign(params, A2C ? { alphaToCoverage: true } : {});
  // ---------------------------------------------------------------- collisions (25 cm grid)
  const CG = 4, CW = MAP.s * CG, colliders = new Uint8Array(CW * CW);
  const block = (x, z, r) => {
    if (x < MAP.x0 || z < MAP.z0 || x > MAP.x0 + MAP.s || z > MAP.z0 + MAP.s) { blockFar(x, z, r); return; }
    const i0 = Math.floor((x - r - MAP.x0) * CG), i1 = Math.ceil((x + r - MAP.x0) * CG), j0 = Math.floor((z - r - MAP.z0) * CG), j1 = Math.ceil((z + r - MAP.z0) * CG);
    for (let j = Math.max(0, j0); j <= Math.min(CW - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(CW - 1, i1); i++) {
      const cx = i / CG + MAP.x0 + 0.125, cz = j / CG + MAP.z0 + 0.125; if ((cx - x) ** 2 + (cz - z) ** 2 <= r * r) colliders[j * CW + i] = 1; }
  };
  // the dry stone wall, as it is built (walling.js): marked 2, so it can be cleared again without touching the garden's own
  const blockWall = (x, z, r) => { const i0 = Math.floor((x - r - MAP.x0) * CG), i1 = Math.ceil((x + r - MAP.x0) * CG), j0 = Math.floor((z - r - MAP.z0) * CG), j1 = Math.ceil((z + r - MAP.z0) * CG);
    for (let j = Math.max(0, j0); j <= Math.min(CW - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(CW - 1, i1); i++) if (!colliders[j * CW + i]) colliders[j * CW + i] = 2; };
  const clearWall = () => { for (let i = 0; i < colliders.length; i++) if (colliders[i] === 2) colliders[i] = 0; };
  const farTrunks = new Map();   // beyond the grid (the field's trees): trunks by 8 m cell
  const blockFar = (x, z, r) => { const key = Math.floor(x / 8) + ',' + Math.floor(z / 8); let L = farTrunks.get(key); if (!L) farTrunks.set(key, L = []); L.push(x, z, r); };
  let extraBlocked = null;                                  // what you have built freely (walling.js)
  const blocked = (x, z) => { const i = Math.floor((x - MAP.x0) * CG), j = Math.floor((z - MAP.z0) * CG);
    if (extraBlocked && extraBlocked(x, z)) return true;
    if (i >= 0 && j >= 0 && i < CW && j < CW && colliders[j * CW + i] !== 0) return true;
    const rr = Math.hypot(x, z - 12); if (rr > 88 && rr > edgeR(x, z) - 0.9) return true;   // the brink: as far as the land goes
    const cx = Math.floor(x / 8), cz = Math.floor(z / 8);
    for (let a = cx - 1; a <= cx + 1; a++) for (let b = cz - 1; b <= cz + 1; b++) { const L = farTrunks.get(a + ',' + b); if (!L) continue; for (let k = 0; k < L.length; k += 3) if ((x - L[k]) ** 2 + (z - L[k + 1]) ** 2 < L[k + 2] * L[k + 2]) return true; }
    return false; };

  // ---------------------------------------------------------------- ground masks
  // mask 1: R lawn, G bed soil, B gravel (black = setts paving).  mask 2: R setts edging, G contact shadow, B wetness.
  const MS = lite ? 2048 : 3072, [mc, mg] = canvas(MS, MS), [m2c, m2] = canvas(MS, MS);
  const px = v => (v - MAP.x0) / MAP.s * MS, pz = v => (v - MAP.z0) / MAP.s * MS, pl = m => m / MAP.s * MS;
  const LAWN = 'rgb(255,0,0)', SOIL = 'rgb(0,255,0)', GRAV = 'rgb(0,0,255)', SETT = 'rgb(0,0,0)';
  m2.fillStyle = 'rgb(0,255,0)'; m2.fillRect(0, 0, MS, MS);
  const shapes = {
    rect: (g, x0, z0, x1, z1, grow = 0) => g.fillRect(px(x0 - grow / 2), pz(z0 - grow / 2), pl(x1 - x0 + grow), pl(z1 - z0 + grow)),
    circ: (g, x, z, r, grow = 0) => { g.beginPath(); g.arc(px(x), pz(z), pl(r + grow / 2), 0, TAU); g.fill(); },
    stroke: (g, pts, w, closed, grow = 0) => { g.lineWidth = pl(w + grow); g.lineCap = g.lineJoin = 'round'; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(px(p[0]), pz(p[1])) : g.moveTo(px(p[0]), pz(p[1]))); if (closed) g.closePath(); g.stroke(); },
  };
  const fill = (kind, col, ...a) => { mg.fillStyle = mg.strokeStyle = col; shapes[kind](mg, ...a); };
  // gravel is edged with a 23 cm band of setts: the edging mask is the same shape, grown
  const gravel = (kind, ...a) => { fill(kind, GRAV, ...a); m2.save(); m2.globalCompositeOperation = 'lighter'; m2.fillStyle = m2.strokeStyle = 'rgb(255,0,0)'; shapes[kind](m2, ...a, 0.46); m2.restore(); };
  const loopXY = layout.loopS.map(s => [s.x, s.z]);
  mg.fillStyle = LAWN; mg.fillRect(0, 0, MS, MS);
  fill('rect', SOIL, B.x0, B.z0, B.x1, B.z1);
  mg.fillStyle = LAWN; mg.beginPath(); loopXY.forEach((p, i) => i ? mg.lineTo(px(p[0]), pz(p[1])) : mg.moveTo(px(p[0]), pz(p[1]))); mg.closePath(); mg.fill();
  fill('rect', SOIL, -5.75, 38.3, 5.75, 46.8);                                   // entrance double border
  fill('rect', SOIL, -6.4, 18.6, 6.4, 36.4);                                     // canal garden beds
  mg.strokeStyle = SOIL; mg.lineWidth = pl(1.3); mg.beginPath(); mg.arc(px(0), pz(0), pl(ring.r), 0, TAU); mg.stroke();
  gravel('circ', 0, 0, 12.75); fill('circ', SOIL, 0, 0, 11.75);
  m2.save(); m2.globalCompositeOperation = 'multiply'; m2.fillStyle = 'rgb(0,255,255)'; shapes.circ(m2, 0, 0, 11.52); m2.restore();   // no edging inside the parterre
  gravel('rect', -1.6, -13.9, 1.6, 13.9); gravel('rect', -13.9, -1.6, 13.9, 1.6); fill('circ', SETT, 0, 0, ring.apron);
  gravel('rect', -3.55, 18.2, 3.55, 36.8); gravel('rect', -1.6, 12.4, 1.6, 18.4); gravel('rect', -1.6, 36.6, 1.6, 55.3); gravel('rect', -4.2, 50.4, 4.2, 55.3);
  for (const s of [-1, 1]) { gravel('rect', Math.min(s * 12.4, s * 21), -1.5, Math.max(s * 12.4, s * 21), 1.5); gravel('circ', s * 17.2, 0, 3.7); }
  gravel('rect', -1.5, -25, 1.5, -12.4); gravel('circ', layout.bench.x, layout.bench.z + 0.9, 2.5);
  gravel('stroke', loopXY, 3.0, true);
  // contact shadows and wet patches are painted as things are added
  const aoBlob = (x, z, r, a) => { const g = m2.createRadialGradient(px(x), pz(z), 0, px(x), pz(z), pl(r)); const c = Math.round(255 * (1 - a)); g.addColorStop(0, `rgba(255,${c},255,1)`); g.addColorStop(0.55, `rgba(255,${c},255,0.6)`); g.addColorStop(1, `rgba(255,${c},255,0)`);
    m2.globalCompositeOperation = 'multiply'; m2.fillStyle = g; m2.fillRect(px(x) - pl(r), pz(z) - pl(r), pl(r) * 2, pl(r) * 2); };
  const aoLine = (pts, w, a, closed = false) => { m2.save(); m2.globalCompositeOperation = 'multiply'; m2.strokeStyle = `rgb(255,${Math.round(255 * Math.pow(1 - a, 1 / 5))},255)`; for (let k = 1; k <= 5; k++) shapes.stroke(m2, pts, w * k / 5, closed); m2.restore(); };
  const wet = (x, z, r0, r1, a) => { const g = m2.createRadialGradient(px(x), pz(z), pl(r0), px(x), pz(z), pl(r1)); g.addColorStop(0, `rgba(0,0,255,${a})`); g.addColorStop(1, 'rgba(0,0,255,0)'); m2.globalCompositeOperation = 'lighter'; m2.fillStyle = g; m2.fillRect(px(x) - pl(r1), pz(z) - pl(r1), pl(r1) * 2, pl(r1) * 2); };
  const maskTex = new THREE.CanvasTexture(mc), mask2Tex = new THREE.CanvasTexture(m2c);
  for (const t of [maskTex, mask2Tex]) { t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
  maskTex.generateMipmaps = true; maskTex.minFilter = THREE.LinearMipmapLinearFilter;   // its coarse mip levels double as a blurred map: how far into a path a point is
  U.uGroundMask = { value: maskTex }; U.uGroundMask2 = { value: mask2Tex };
  // where you have planted: a cleared circle round each of your plants, so the long grass does not swallow them (the whole land, about 22 cm a texel)
  const OWNM = { N: lite ? 512 : 1024, x0: -112, z0: -100, s: 224 }, [oc, og] = canvas(OWNM.N, OWNM.N);
  // the same map carries the brook and the pond: green where the turf is cut away (full over the water, part over the banks),
  // blue how deep the ground is cut there, so the grass on the banks can stand on the bank and not in the air over it
  const [bc, bgx] = canvas(OWNM.N, OWNM.N);
  { const N = OWNM.N, q = N / OWNM.s, B = BROOK, img = bgx.createImageData(N, N), d = img.data; for (let o = 3; o < d.length; o += 4) d[o] = 255;
    let x0 = B.POND.x - 10, x1 = B.POND.x + 10, z0 = B.POND.z - 10, z1 = B.POND.z + 10; for (let i = 0; i < B.n; i++) { x0 = Math.min(x0, B.X[i] - 4); x1 = Math.max(x1, B.X[i] + 4); z0 = Math.min(z0, B.Z[i] - 4); z1 = Math.max(z1, B.Z[i] + 4); }
    const i0 = Math.max(0, Math.floor((x0 - OWNM.x0) * q)), i1 = Math.min(N - 1, Math.ceil((x1 - OWNM.x0) * q)), j0 = Math.max(0, Math.floor((z0 - OWNM.z0) * q)), j1 = Math.min(N - 1, Math.ceil((z1 - OWNM.z0) * q));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const x = OWNM.x0 + (i + 0.5) / q, z = OWNM.z0 + (j + 0.5) / q, bk = B.bank(x, z); if (bk > 0.5) continue;
      const o = (j * N + i) * 4; d[o + 1] = B.edge(x, z) < 0.05 ? 255 : bk < -0.1 ? 140 : 0; d[o + 2] = Math.min(255, Math.round(cutAt(x, z) / 1.5 * 255)); }
    bgx.putImageData(img, 0, 0); }
  { const q = OWNM.N / OWNM.s, cx = (JUNK_HEAP.x - OWNM.x0) * q, cy = (JUNK_HEAP.z - OWNM.z0) * q, gr = bgx.createRadialGradient(cx, cy, 0, cx, cy, 5.5 * q);   // the junk heap: the grass round it is trodden flat
    gr.addColorStop(0, '#ff0000'); gr.addColorStop(0.7, '#ff0000'); gr.addColorStop(1, '#000000'); bgx.globalCompositeOperation = 'lighter'; bgx.fillStyle = gr; bgx.beginPath(); bgx.arc(cx, cy, 5.5 * q, 0, 6.2832); bgx.fill(); bgx.globalCompositeOperation = 'source-over'; }
  og.drawImage(bc, 0, 0);
  const ownTex = new THREE.CanvasTexture(oc); ownTex.colorSpace = THREE.NoColorSpace; ownTex.generateMipmaps = false; ownTex.minFilter = THREE.LinearFilter; ownTex.flipY = false;
  U.uOwnMask = { value: ownTex };
  U.uMeadow = { value: layout.meadows.map(m => new THREE.Vector4(m.x, m.z, m.r, 0)) };
  U.uSeasonTint = U.uSeasonTint || { value: new V3(1, 1, 1) };
  const MASKUV = `vec2 muv = vec2((gq.x - (${MAP.x0.toFixed(1)})) / ${MAP.s.toFixed(1)}, 1.0 - (gq.y - (${MAP.z0.toFixed(1)})) / ${MAP.s.toFixed(1)}); bool mout = muv.x < 0.0 || muv.y < 0.0 || muv.x > 1.0 || muv.y > 1.0;`;

  // ---------------------------------------------------------------- ground: four scanned materials blended by the masks
  const G = { lawn: TX.sparse_grass, soil: TX.yellow_flower_mulch, grav: TX.gravel_floor, sett: TX.cobblestone_square };
  const groundMat = P.std({ color: 0xffffff, roughness: 1 }, {
    key: 'ground', extra: sh => {
      // nine textures here + two masks + light map + shadow map + environment = 14 samplers: many GPUs (Apple's included) stop at 16
      Object.assign(sh.uniforms, { tLD: { value: G.lawn.diff }, tSD: { value: G.soil.diff }, tSN: { value: G.soil.nor },
        tGD: { value: G.grav.diff }, tGN: { value: G.grav.nor }, tGA: { value: G.grav.arm }, tPD: { value: G.sett.diff }, tPN: { value: G.sett.nor }, tPA: { value: G.sett.arm } });
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D uGroundMask, uGroundMask2, uOwnMask, tLD, tSD, tSN, tGD, tGN, tGA, tPD, tPN, tPA; uniform vec4 uMeadow[2]; uniform vec3 uSeasonTint;
${FIELD_GLSL}`)
        .replace('#include <map_fragment>', `
vec2 gq = vWPos.xz; ${MASKUV}
vec4 gm = texture2D(uGroundMask, muv), g2 = texture2D(uGroundMask2, muv);
float gcore = smoothstep(0.5, 0.95, texture2D(uGroundMask, muv, 5.0).b);   // 1 along the trodden middle of a path, falling to 0 at its edges
if (mout) { gm = vec4(1.0, 0.0, 0.0, 1.0); g2 = vec4(0.0, 1.0, 0.0, 1.0); gcore = 1.0; }
float nz = vnoise(gq * 6.0) - 0.5, nz2 = vnoise(gq * 21.0) - 0.5;
float wA = smoothstep(0.45, 0.62, 1.0 - (gm.r + gm.g + gm.b));
float wG = smoothstep(0.36, 0.6, gm.b + nz * 0.24 + nz2 * 0.12) * (1.0 - wA);
float wE = smoothstep(0.3, 0.55, g2.r) * (1.0 - wG);
float wP = max(wA, wE);
float wS = smoothstep(0.36, 0.6, gm.g + nz * 0.2) * (1.0 - wG) * (1.0 - wP);
float wL = max(0.0, 1.0 - wG - wS - wP);
float mead = 0.0;
for (int i = 0; i < 2; i++) mead = max(mead, 1.0 - smoothstep(uMeadow[i].z - 1.6, uMeadow[i].z, distance(gq, uMeadow[i].xy)));
if (length(gq - vec2(0.0, 12.0)) > landEdge(gq) - 0.55 * vnoise(gq * 1.3)) discard;   // the turf is torn off where the land ends
if (texture2D(uOwnMask, (gq - vec2(${OWNM.x0.toFixed(1)}, ${OWNM.z0.toFixed(1)})) / ${OWNM.s.toFixed(1)}).g > 0.3) discard;   // and cut away over the brook and the pond, whose banks are their own mesh
float fld = fieldF(gq);               // beyond the wall line the lawn runs out into field
float gmacro = 0.82 + 0.36 * vnoise(gq * 0.13) * (0.7 + 0.3 * vnoise(gq * 0.7));
vec2 uvL = gq / 1.7, uvS = gq / 1.5, uvG = gq / 1.45, uvP = gq / 1.25, uvG2 = vec2(gq.y, -gq.x) / 2.3 + 0.37;
float gmix = smoothstep(0.35, 0.65, vnoise(gq * 0.45));
float gstripe = sin(gq.x * 3.14159 / 1.5); gstripe = clamp(gstripe * 4.0, -1.0, 1.0) * (1.0 - mead) * (1.0 - fld);
vec3 tl0 = texture2D(tLD, uvL).rgb; float tsoil = smoothstep(-0.02, 0.07, tl0.r - tl0.g);   // the scan is sparse grass on bare earth: the earth is turned to dense turf
vec3 cL = mix(tl0 * vec3(0.74, 1.0, 0.46) * 1.08, dot(tl0, vec3(0.3, 0.55, 0.15)) * vec3(0.4, 0.74, 0.2) * 1.2, 0.5 + 0.45 * tsoil) * (1.0 + 0.09 * gstripe) * gmacro * mix(vec3(1.0), vec3(1.2, 1.05, 0.7), mead * 0.6) * mix(vec3(1.0), vec3(0.62, 0.86, 0.5) * (0.8 + 0.3 * vnoise(gq * 0.09)), fld) * uSeasonTint;
{ vec3 tl = texture2D(tLD, uvL).rgb;   // the field: the same turf seen through long grass, so it takes the blades' green and no soil shows between them
  cL = mix(cL, dot(tl, vec3(0.333)) * vec3(0.30, 0.62, 0.14) * (0.8 + 0.35 * vnoise(gq * 0.09)) * gmacro * uSeasonTint, fld); }
cL *= mix(vec3(1.0), vec3(1.12, 1.02, 0.8), workF(gq));
vec3 cS = texture2D(tSD, uvS).rgb * (0.85 + 0.3 * vnoise(gq * 0.6)) * 0.85;
vec3 cG = pow(mix(texture2D(tGD, uvG).rgb, texture2D(tGD, uvG2).rgb, gmix), vec3(1.4)) * vec3(0.9, 0.82, 0.7) * (0.8 + 0.3 * vnoise(gq * 0.35));
float gmac = vnoise(gq * 0.9) * 0.6 + vnoise(gq * 3.1) * 0.4;
cG *= mix(0.72, 1.16, gcore) * (0.84 + 0.32 * gmac);   // pale and compacted where feet go, darker and damper at the sides, patchy everywhere
cG = mix(cG, vec3(0.1, 0.105, 0.05) * (0.7 + 0.6 * gmac), (1.0 - gcore) * smoothstep(0.45, 0.8, vnoise(gq * 2.3 + 11.0)) * 0.55);   // moss and leaf litter creeping in from the edges
vec3 cP = texture2D(tPD, uvP).rgb * 0.95;
vec3 aL = vec3(1.0, 0.92, 0.0), aS = vec3(1.0, 0.94, 0.0), aG = mix(texture2D(tGA, uvG).rgb, texture2D(tGA, uvG2).rgb, gmix), aP = texture2D(tPA, uvP).rgb;
vec3 gArm = aL * wL + aS * wS + aG * wG + aP * wP;
vec3 gN = vec3(0.0, 0.0, 1.0) * wL + (texture2D(tSN, uvS).xyz * 2.0 - 1.0) * wS + (texture2D(tGN, uvG).xyz * 2.0 - 1.0) * vec3(1.9, 1.9, 1.0) * wG + (texture2D(tPN, uvP).xyz * 2.0 - 1.0) * wP * 1.2;
float gWet = g2.b * (wG + wP + wS * 0.5);
vec3 gAlb = (cL * wL + cS * wS + cG * wG + cP * wP) * mix(1.0, gArm.r, 0.8 - 0.4 * wL) * mix(1.0, g2.g, 0.9) * mix(1.0, 0.55, gWet);
diffuseColor.rgb *= gAlb;`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(mix(max(gArm.g, 0.8), 0.16, gWet * 0.85), 0.05, 1.0);')
        .replace('#include <normal_fragment_maps>', '{ vec3 fn = fieldN(gq); normal = normalize((viewMatrix * vec4(normalize(vec3(gN.x, gN.z + 0.35, gN.y) + vec3(fn.x, 0.0, fn.z) * 1.35), 0.0)).xyz); }');
    },
  });
  groundMat.envMapIntensity = 0.35;   // gravel in shade should not mirror the sky
  const ground = new THREE.Mesh(groundGeometry(), groundMat);   // out to the bubble's rim, rolling beyond the plateau (field.js)
  ground.receiveShadow = true; scene.add(ground);

  // ---------------------------------------------------------------- lawn: two tiers of GPU grass blades that follow the walker
  let grass;
  {
    const NN = Math.round((lite ? 55000 : 210000) * grassScale), NF = Math.round((lite ? 50000 : 150000) * grassScale), N = NN + NF, T0 = 13, T1 = 46;
    const geo = new THREE.InstancedBufferGeometry(), pos = [], idx = [];
    for (let k = 0; k < 4; k++) pos.push(-0.5, k / 4, 0, 0.5, k / 4, 0); pos.push(0, 1, 0);
    for (let k = 0; k < 3; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } idx.push(6, 7, 8);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(27).fill(0).map((_, i) => i % 3 === 2 ? 1 : 0), 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(27).fill(1), 3));
    geo.setIndex(idx);
    const off = new Float32Array(N * 4), tier = new Float32Array(N);
    for (let i = 0; i < N; i++) { off[i * 4] = rng(); off[i * 4 + 1] = rng(); off[i * 4 + 2] = rng(); off[i * 4 + 3] = rng(); tier[i] = i < NN ? 0 : 1; }
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4)); geo.setAttribute('aTier', new THREE.InstancedBufferAttribute(tier, 1));
    geo.instanceCount = N;
    U.uCam = U.uCam || { value: new V3() };
    const mat = P.std({ color: 0xffffff, roughness: 0.5, side: THREE.DoubleSide, vertexColors: true }, {
      key: 'grass', translucent: true, extra: sh => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute vec4 aOff; attribute float aTier; uniform vec3 uCam; uniform sampler2D uGroundMask, uOwnMask; uniform vec4 uMeadow[2]; uniform vec3 uSeasonTint;
${FIELD_GLSL}
float ghash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(ghash(i), ghash(i + vec2(1, 0)), f.x), mix(ghash(i + vec2(0, 1)), ghash(i + vec2(1, 1)), f.x), f.y); }`)
          .replace('#include <beginnormal_vertex>', `
float tile = aTier < 0.5 ? ${T0.toFixed(1)} : ${T1.toFixed(1)};
vec2 gc = uCam.xz;
vec2 gq = gc + mod(aOff.xy * tile - gc + 0.5 * tile, tile) - 0.5 * tile;
${MASKUV}
float lawn = mout ? 1.0 : texture2D(uGroundMask, muv).r;
float mead = 0.0;
for (int i = 0; i < 2; i++) mead = max(mead, 1.0 - smoothstep(uMeadow[i].z - 1.6, uMeadow[i].z, distance(gq, uMeadow[i].xy)));
float gmead0 = mead;                  // the garden's own meadows go to straw at the tips; the field stays green
mead = max(mead, fieldF(gq) * (0.3 + 0.35 * gnoise(gq * 0.11)));   // field grass: longer, in drifts
float gwork = workF(gq); mead *= 1.0 - 0.95 * gwork;
vec4 gom = texture2D(uOwnMask, (gq - vec2(${OWNM.x0.toFixed(1)}, ${OWNM.z0.toFixed(1)})) / ${OWNM.s.toFixed(1)}); float gown = gom.r; mead *= 1.0 - gown;
float gd = length(gq - gc);
float fade = aTier < 0.5 ? 1.0 - smoothstep(tile * 0.5 - 2.2, tile * 0.5 - 0.4, gd) : smoothstep(3.2, 5.6, gd) * (1.0 - smoothstep(tile * 0.5 - 6.0, tile * 0.5 - 1.0, gd));
float r1 = aOff.z, r2 = aOff.w, r3 = fract(aOff.z * 91.7 + aOff.w * 37.3);
float clump = gnoise(gq * 1.6);
float gh = mix(0.05 + 0.055 * r1 + 0.035 * clump, 0.26 + 0.62 * r1, mead) * smoothstep(0.42, 0.7, lawn) * fade * step(length(gq - vec2(0.0, 12.0)), landEdge(gq) - 0.6) * (1.0 - 0.45 * gwork) * (1.0 - 0.7 * gown) * (1.0 - step(0.8, gom.g));   // none in the water; on the banks it grows as anywhere
float gang = r2 * 6.2831;
vec2 gside = vec2(cos(gang), sin(gang)), gface = vec2(-gside.y, gside.x);
float stripe = sign(sin(gq.x * 3.14159 / 1.5));
vec2 glean = normalize(gface * 0.7 + vec2(0.0, stripe * 0.9 * (1.0 - mead)) + vec2(1e-4));
float gy = position.y;
vec3 objectNormal = normalize(vec3(gface.x, 0.0, gface.y) + vec3(gside.x, 0.0, gside.y) * position.x * 1.5 + vec3(0.0, 0.55 + gy * 0.6, 0.0) - vec3(glean.x, 0.0, glean.y) * gy * 0.5);`)
          .replace('#include <begin_vertex>', `
float gw = mix(0.0052, 0.0085, r3) * (1.0 + mead * 0.6) * (aTier < 0.5 ? 1.0 : 1.0 + gd * 0.12) * step(0.004, gh) * (1.0 - pow(gy, 1.6) * 0.9);
float gbend = (0.22 + 0.4 * r3) * (1.0 + mead * 0.8);
vec3 transformed = vec3(gq.x, fieldH(gq) - gom.b * 1.5 + gy * gh * (1.0 - 0.22 * gbend * gy), gq.y);
transformed.xz += gside * position.x * gw * 2.0 + glean * gy * gy * gh * gbend;
float gph = dot(gq, uWindDir) * 0.8 - uTime * 2.2;
float gwave = 0.55 + 0.3 * sin(gph) + 0.15 * sin(gph * 2.7 + 1.3);
transformed.xz += uWindDir * uWind * (0.6 + 1.4 * uGust) * gwave * (0.25 + mead * 1.3) * 0.6 * gy * gy * gh;
vec3 gbase = vec3(0.022, 0.05, 0.012), gtip = mix(vec3(0.1, 0.17, 0.04), vec3(0.15, 0.2, 0.058), r1);
gtip = mix(gtip, vec3(0.17, 0.17, 0.055), step(0.86, r3) * 0.8);
vColor = mix(gbase, gtip, pow(gy, 0.8)) * (0.78 + 0.4 * clump) * (1.0 + 0.1 * stripe * (1.0 - mead)) * uSeasonTint;
vColor = mix(vColor, vec3(0.3, 0.26, 0.1) * (0.7 + 0.5 * r1), (gmead0 * 0.55 + max(0.0, mead - gmead0) * 0.12) * gy);`)
          .replace('#include <color_vertex>', '');
      },
    });
    grass = new THREE.Mesh(geo, mat); grass.frustumCulled = false; grass.receiveShadow = true; scene.add(grass);
  }

  // ---------------------------------------------------------------- plants: scanned leaf atlas, painted flower atlas, 3D showpiece flowers
  const CELL = lite ? 224 : 320, PAD = lite ? 6 : 8, SUPER = lite ? 1 : 2;   // one cell per flowering species, about 120 of them
  const speciesKeys = Object.keys(LOOKS).filter(k => SIZE[k] && PlantArt.FL[LOOKS[k].flStyle]);
  const flAtlas = (() => {
    const cols = 12, rows = Math.ceil(speciesKeys.length / cols), W = cols * CELL, H = rows * CELL, [c, g] = canvas(W, H), rects = {};
    speciesKeys.forEach((k, i) => {
      const L = LOOKS[k], F = PlantArt.FL[L.flStyle], [w, h] = F.size || [256, 256], [tc, tg] = canvas(w * SUPER, h * SUPER); tg.scale(SUPER, SUPER); tg.save(); F.paint(tg, L, w, h); tg.restore();
      const cx = (i % cols) * CELL, cy = Math.floor(i / cols) * CELL; g.drawImage(tc, cx + PAD, cy + PAD, CELL - 2 * PAD, CELL - 2 * PAD);
      rects[k] = [(cx + PAD) / W, 1 - (cy + CELL - PAD) / H, (CELL - 2 * PAD) / W, (CELL - 2 * PAD) / H];
    });
    return { tex: texOf(c, renderer, { repeat: false }), rects };
  })();
  const art = PlantArt.make(THREE);
  const discGeo = (() => {   // flat polar mesh; the shader cups or reflexes it per species
    const RINGS = 3, SECT = 12, pos = [0, 0, 0], uv = [0.5, 0.5], idx = [];
    for (let i = 1; i <= RINGS; i++) for (let j = 0; j < SECT; j++) { const r = 0.5 * i / RINGS, a = j / SECT * TAU; pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); uv.push(0.5 + Math.cos(a) * r, 0.5 - Math.sin(a) * r); }
    for (let j = 0; j < SECT; j++) idx.push(0, 1 + (j + 1) % SECT, 1 + j);
    for (let i = 1; i < RINGS; i++) for (let j = 0; j < SECT; j++) { const a = 1 + (i - 1) * SECT + j, b = 1 + (i - 1) * SECT + (j + 1) % SECT, c = 1 + i * SECT + j, d = 1 + i * SECT + (j + 1) % SECT; idx.push(a, b, d, a, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => i % 3 === 1 ? 1 : 0), 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    return g;
  })();
  const GEOS = {
    leafC: PlantArt.curvedLeaf(THREE, 0.1, 0.22, 3), leafS: PlantArt.strapGeo(THREE, 0.3, 5), disc: discGeo,
    ball: PlantArt.crossGeo(THREE, 3, true, true), sphere: new THREE.IcosahedronGeometry(0.5, 1), spike: PlantArt.crossGeo(THREE, 3, false, false),
    stem: new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0),
  };
  const leafMat = P.std(cut({ map: TX.leaf_atlas, normalMap: TX.leaf_atlas_n, normalScale: new THREE.Vector2(0.9, 0.9), alphaTest: 0.4, roughness: 0.52, side: THREE.DoubleSide }), { sway: 1, atlas: true, translucent: true, grow: true, part: 'leaf' });
  const flMat = P.std(cut({ map: flAtlas.tex, alphaTest: 0.4, roughness: 0.55, side: THREE.DoubleSide }), { sway: 1, atlas: true, translucent: true, grow: true, part: 'flower' });
  const flDiscMat = P.std(cut({ map: flAtlas.tex, alphaTest: 0.4, roughness: 0.55, side: THREE.DoubleSide }), { sway: 1, atlas: true, disc: true, translucent: true, grow: true, part: 'flower' });
  const stemMat = P.std({ roughness: 0.7 }, { sway: 1, grow: true, part: 'stem' });
  const MATS = { leafC: leafMat, leafS: leafMat, disc: flDiscMat, ball: flMat, sphere: flMat, spike: flMat, stem: stemMat };
  const DEPTHS = { leafC: P.depth(TX.leaf_atlas, { sway: 1, atlas: true, grow: true, part: 'leaf' }), disc: P.depth(flAtlas.tex, { sway: 1, atlas: true, disc: true, grow: true, part: 'flower' }), ball: P.depth(flAtlas.tex, { sway: 1, atlas: true, grow: true, part: 'flower' }), stem: P.depth(null, { sway: 1, grow: true, part: 'stem' }) };
  DEPTHS.leafS = DEPTHS.leafC; DEPTHS.sphere = DEPTHS.spike = DEPTHS.ball;
  const floretDepth = P.depth(null, { sway: 1, grow: true, part: 'flower' });
  const FL3 = buildFlowers3D(), F3TYPES = Object.keys(FL3);
  for (const t of F3TYPES) {
    GEOS[t] = FL3[t].geo;
    MATS[t] = P.std({ map: FL3[t].mask, side: THREE.DoubleSide, roughness: t === 'rose' || t === 'peony' ? 0.6 : 0.5 }, { sway: 1, floret: true, bell: t === 'bell', translucent: true, grow: true, part: 'flower', key: 'f3' + t });
    DEPTHS[t] = floretDepth;
  }
  const TYPES = Object.keys(GEOS);
  // every plant (and tree) has its own clock; instances carry the index of the plant they belong to
  const PT = { k: [], x: [], y: [], z: [], bx: [], by: [], bz: [], tau: [], planted: [], own: [], crowd: [], gone: [] }, pgrid = new Map();
  let curPid = 0, baseAge = 3;
  function registerPlant(k, x, y, z, bx = x, by = y, bz = z) {
    const i = PT.k.length; PT.k.push(k); PT.x.push(x); PT.y.push(y); PT.z.push(z); PT.bx.push(bx); PT.by.push(by); PT.bz.push(bz); PT.tau.push(0); PT.planted.push(0); PT.own.push(0); PT.crowd.push(1); PT.gone.push(0);
    if (k !== 'tree') { const g = Math.floor(x / 2) + ',' + Math.floor(z / 2); let L = pgrid.get(g); if (!L) pgrid.set(g, L = []); L.push(i); }
    curPid = i; return i;
  }
  function nearestPid(x, z) {
    let best = -1, bd = 1e9; const i0 = Math.floor(x / 2), j0 = Math.floor(z / 2);
    for (let r = 1; r <= 3 && best < 0; r++) for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) { const L = pgrid.get(i + ',' + j); if (L) for (const p of L) { const d = (PT.x[p] - x) ** 2 + (PT.z[p] - z) ** 2; if (d < bd) { bd = d; best = p; } } }
    return Math.max(0, best);
  }
  const CH = 16, buckets = new Map();
  const bucket = (x, z) => {
    const i = Math.floor(x / CH), j = Math.floor(z / CH), k = i + ',' + j;
    let b = buckets.get(k); if (!b) { b = { x: (i + 0.5) * CH, z: (j + 0.5) * CH }; for (const t of TYPES) b[t] = { m: [], c: [], r: [], s: [], c2: [], pid: [], n: 0 }; buckets.set(k, b); }
    return b;
  };
  const _m = new THREE.Matrix4(), _p = new V3(), _a = new V3(), _b = new V3(), _s = new V3(), _q = new Q(), _qr = new Q(), _c = new THREE.Color();
  function push(Bk, p, q, s, c, rect, shape, c2) {
    _m.compose(p, q, s); const e = _m.elements; for (let i = 0; i < 16; i++) Bk.m.push(e[i]);
    Bk.c.push(c.r, c.g, c.b); if (rect) Bk.r.push(rect[0], rect[1], rect[2], rect[3]); if (shape) Bk.s.push(shape[0], shape[1]); if (c2) Bk.c2.push(c2.r, c2.g, c2.b); Bk.pid.push(curPid); Bk.n++;
  }
  // florets along a spire (delphinium, lupine, foxglove) — see flowers3d.js for the morphology
  const _mb = new THREE.Matrix4(), _ex = new V3(), _ey = new V3(), _ez = new V3(), _e1 = new V3(), _e2 = new V3(), _O = new V3(), _F = new V3(), _P = new V3();
  const GREEN = new THREE.Color('#6a8a4a'), _c3 = new THREE.Color(), _c4 = new THREE.Color();
  function frameZ(z, yHint, out) { _ez.copy(z).normalize(); _ey.copy(yHint).addScaledVector(_ez, -yHint.dot(_ez)).normalize(); _ex.crossVectors(_ey, _ez); _mb.makeBasis(_ex, _ey, _ez); return out.setFromRotationMatrix(_mb); }
  function frameY(y, zHint, out) { _ey.copy(y).normalize(); _ez.copy(zHint).addScaledVector(_ey, -zHint.dot(_ey)).normalize(); _ex.crossVectors(_ey, _ez); _mb.makeBasis(_ex, _ey, _ez); return out.setFromRotationMatrix(_mb); }
  function spireFlorets(type, bk, P0, A, Ls, c1, c2, r, stemCol) {
    _q.setFromUnitVectors(_Y, A); _s.set(0.0042, Ls, 0.0042); push(bk.stem, P0, _q, _s, stemCol);
    _e1.crossVectors(A, Math.abs(A.y) < 0.95 ? _Y : _X).normalize(); _e2.crossVectors(A, _e1);
    const out = phi => _O.copy(_e1).multiplyScalar(Math.cos(phi)).addScaledVector(_e2, Math.sin(phi));
    const budCol = _c4.copy(c1).lerp(GREEN, 0.55);
    const budAt = (t, phi, sz) => { out(phi); _P.copy(P0).addScaledVector(A, Ls * (0.05 + 0.95 * t)).addScaledVector(_O, 0.005); frameY(_F.copy(A).addScaledVector(_O, 0.25), _O, _q); _s.set(sz, sz * 2.4, sz); push(bk.bud, _P, _q, _s, budCol, null, null, c2); };
    if (type === 'delph') {
      const n = clamp(Math.round(Ls / 0.02), 12, 40);
      for (let i = 0; i < n; i++) { const t = i / n, phi = i * 2.39996;
        if (t > 0.86) { budAt(t, phi, 0.014 * (1 - (t - 0.86) * 2)); continue; }
        out(phi); _F.copy(_O).multiplyScalar(0.94).addScaledVector(A, 0.34);
        _P.copy(P0).addScaledVector(A, Ls * (0.05 + 0.95 * t)).addScaledVector(_O, 0.012); frameZ(_F, A, _q);
        const d = 0.056 * (1 - 0.42 * t) * (0.9 + 0.2 * r()); _s.set(d, d, d); push(bk.delph, _P, _q, _s, _c3.copy(c1).multiplyScalar(0.88 + 0.24 * r()), null, null, c2); }
    } else if (type === 'lupin') {
      const nW = clamp(Math.round(Ls / 0.022), 8, 18);
      for (let w = 0; w < nW; w++) { const t = w / nW, m = t < 0.6 ? 5 : 4;
        for (let k = 0; k < m; k++) { const phi = k / m * TAU + w * 0.62;
          if (t > 0.8) { budAt(t, phi, 0.007); continue; }
          out(phi); _F.copy(_O).multiplyScalar(0.97).addScaledVector(A, -0.22);
          _P.copy(P0).addScaledVector(A, Ls * (0.04 + 0.96 * t)).addScaledVector(_O, 0.011); frameZ(_F, A, _q);
          const d = 0.024 * (1 - 0.35 * t); _s.set(d, d, d); push(bk.lupin, _P, _q, _s, _c3.copy(c1).multiplyScalar(0.9 + 0.2 * r()), null, null, c2); } }
    } else {
      const n = clamp(Math.round(Ls / 0.028), 12, 34), side = r() * TAU;
      for (let i = 0; i < n; i++) { const t = i / n, phi = side + (r() - 0.5) * 1.9;
        if (t > 0.82) { budAt(t, phi, 0.011); continue; }
        out(phi); _P.copy(P0).addScaledVector(A, Ls * (0.05 + 0.95 * t)).addScaledVector(_O, 0.01);
        _F.copy(A).multiplyScalar(0.78).addScaledVector(_O, -0.62);
        frameY(_F, _O, _q); const d = 0.055 * (1 - 0.35 * t) * (0.9 + 0.2 * r()); _s.set(d, d, d);
        push(bk.bell, _P, _q, _s, _c3.copy(c1).multiplyScalar(0.92 + 0.16 * r()), null, null, c2); }
    }
  }
  let plantCount = 0;
  const placed = new Map();
  function spaceOk(x, z, r, k = 0.8) {
    const i0 = Math.floor(x / 2), j0 = Math.floor(z / 2);
    for (let j = j0 - 1; j <= j0 + 1; j++) for (let i = i0 - 1; i <= i0 + 1; i++) { const L = placed.get(i + ',' + j); if (L) for (const p of L) if ((p[0] - x) ** 2 + (p[1] - z) ** 2 < ((p[2] + r) * k) ** 2) return false; }
    return true;
  }
  function claim(x, z, r) { const k = Math.floor(x / 2) + ',' + Math.floor(z / 2); let L = placed.get(k); if (!L) placed.set(k, L = []); L.push([x, z, r]); }

  function addPlant(k, x, z, o = {}) {
    const L = LOOKS[k], sz = SIZE[k]; if (!L || !sz) return;
    if (nearBrook(x, z, 0.15)) return;                                   // nothing is planted in the brook
    const F = PlantArt.FL[L.flStyle] || { kind: 'none' };
    const seed = ((Math.floor(x * 997) * 73856093) ^ (Math.floor(z * 991) * 19349663) ^ (o.salt || 0)) >>> 0;
    const r = PlantArt.rngOf(seed + 17), G0 = art.gen(L, seed), sc = o.scale || 1;
    const R = sz[1] / 2 * IN * sc * (0.85 + 0.25 * r()), H = sz[0] * IN * sc * (0.85 + 0.27 * r());
    const y0 = o.y || 0, rot = r() * TAU, cr = Math.cos(rot), sr = Math.sin(rot);
    registerPlant(k, x, y0, z);
    if (!o.y) aoBlob(x, z, R * 1.5 + 0.08, 0.42);
    _qr.setFromAxisAngle(_Y, -rot);
    const Wp = (n, out) => { const a = n[0] * R, b = n[2] * R; return out.set(x + a * cr - b * sr, y0 + n[1] * H, z + a * sr + b * cr); };
    const bk = bucket(x, z), lr = LEAF_RECTS[L.leaf] || LEAF_RECTS.ovate, fr = flAtlas.rects[k];
    const leafCol = new THREE.Color(L.leafCol), stemCol = new THREE.Color(L.stemCol);
    const strap = L.leaf === 'sword' || L.leaf === 'blade';
    const nL = Math.ceil(G0.leaves.length * DETAIL);
    for (let i = 0; i < nL; i++) {
      const lf = G0.leaves[i]; Wp(lf.p, _p); _q.copy(_qr).multiply(lf.q);
      if (lf.sword) _s.set(L.leafIn[0] * IN * (0.8 + lf.v * 0.4) * sc, lf.sword * H, IN); else _s.set(L.leafIn[0] * lf.s * IN * LS * sc, L.leafIn[1] * lf.s * IN * LS * sc, IN);
      // leaves low and deep in the clump sit in the plant's own shade
      _c.copy(leafCol).multiplyScalar((0.86 + 0.34 * lf.v) * (0.62 + 0.38 * clamp(lf.p[1] * 1.6 + Math.hypot(lf.p[0], lf.p[2]) * 0.5, 0, 1))); push(bk[strap ? 'leafS' : 'leafC'], _p, _q, _s, _c, lr);
    }
    const rad = (L.stemR || (0.06 + 0.0035 * sz[0])) * IN * Math.sqrt(sc) * 1.4;
    for (const pts of (L.form === 'rosette' ? G0.spires : G0.stems)) for (let i = 0; i < pts.length - 1; i++) {
      Wp(pts[i], _a); Wp(pts[i + 1], _b); _b.sub(_a); const len = _b.length(); if (len < 0.01) continue;
      _q.setFromUnitVectors(_Y, _b.multiplyScalar(1 / len)); _s.set(rad * (1 - i * 0.18), len, rad * (1 - i * 0.18)); push(bk.stem, _a, _q, _s, stemCol);
    }
    const head3 = HEAD3D[k], spire3 = SPIRE3D[k], pal = PALETTES[k], pc = pal ? pal[Math.floor(r() * pal.length)] : null;
    const col1 = pc ? new THREE.Color(pc[0]) : null, col2 = pc ? new THREE.Color(pc[1]) : null;
    if (fr && F.kind !== 'none' && GEOS[F.kind]) {
      const shape = F.kind === 'disc' ? [L.curve != null ? L.curve : (F.curve || 0), F.cone || 0] : null, fsc = Math.sqrt(sc);
      const nF = G0.fls.length > 24 ? Math.ceil(G0.fls.length * 0.6) : G0.fls.length;
      for (let fi = 0; fi < nF; fi++) { const f = G0.fls[fi];
        Wp(f.p, _p); _q.copy(_qr).multiply(f.q);
        if (spire3 && F.kind === 'spike') { const hs = f.hs ? H / (sz[0] * IN) : 1; spireFlorets(spire3, bk, _p.clone(), new V3(0, 1, 0).applyQuaternion(_q), L.flIn[1] * f.s * IN * hs * fsc, col1, col2, r, stemCol); continue; }
        if (head3) { const d = (Array.isArray(L.flIn) ? L.flIn[0] : L.flIn) * f.s * IN * fsc * (head3 === 'allium' ? 1 : 1.08); _s.set(d, d, d); push(bk[head3], _p, _q, _s, _c3.copy(col1).multiplyScalar(0.92 + 0.16 * r()), null, null, col2); continue; }
        if (F.kind === 'spike') { const hs = f.hs ? H / (sz[0] * IN) : 1; _s.set(L.flIn[0] * f.s * IN * fsc, L.flIn[1] * f.s * IN * hs * fsc, L.flIn[0] * f.s * IN * fsc); }
        else { const d = (Array.isArray(L.flIn) ? L.flIn[0] : L.flIn) * f.s * IN * fsc; _s.set(d, d, d); }
        _c.setScalar(0.9 + 0.15 * r()); push(bk[F.kind], _p, _q, _s, _c, fr, shape);
      }
    }
    plantCount++;
  }
  function addFlowerStalk(k, x, z, h, s = 1) {   // a single bloom on a wiry stem (meadow wildflowers)
    const L = LOOKS[k], F = PlantArt.FL[L.flStyle], fr = flAtlas.rects[k]; if (!fr || !GEOS[F.kind]) return;
    const bk = bucket(x, z), lean = rr(-0.08, 0.08), lean2 = rr(-0.08, 0.08);
    registerPlant(k, x, 0, z);
    _p.set(x + lean, h, z + lean2); _a.set(x, 0, z); _b.subVectors(_p, _a); const len = _b.length();
    _q.setFromUnitVectors(_Y, _b.clone().normalize()); _s.set(0.0022, len, 0.0022); push(bk.stem, _a, _q, _s, _c.set(L.stemCol));
    _q.setFromEuler(new THREE.Euler(rr(-0.4, 0.4), rr(0, TAU), rr(-0.4, 0.4)));
    const d = (Array.isArray(L.flIn) ? L.flIn[0] : L.flIn) * IN * s; _s.set(d, F.kind === 'spike' ? L.flIn[1] * IN * s : d, d);
    if (HEAD3D[k]) { const pc = PALETTES[k][Math.floor(rng() * PALETTES[k].length)]; push(bk[HEAD3D[k]], _p, _q, _s, _c.set(pc[0]), null, null, new THREE.Color(pc[1])); return; }
    push(bk[F.kind], _p, _q, _s, _c.setScalar(0.95), fr, F.kind === 'disc' ? [L.curve != null ? L.curve : (F.curve || 0), F.cone || 0] : null);
  }
  function drift(x, z, list, scale, salt) {   // Worley cells pick a species so plants come in natural-looking groups
    const gx = Math.floor(x / scale), gz = Math.floor(z / scale); let best = 1e9, id = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = (gx + i + ihash(gx + i, gz + j, salt)) * scale, cz = (gz + j + ihash(gx + i, gz + j, salt + 7)) * scale, d = (cx - x) ** 2 + (cz - z) ** 2;
      if (d < best) { best = d; id = ihash(gx + i, gz + j, salt + 13); }
    }
    return list[Math.floor(id * list.length)];
  }
  const FRONT = ['nepeta', 'geranium', 'alchemilla', 'lavandula', 'dianthus', 'salvia', 'veronica', 'aquilegia', 'stachys', 'echinaceaS', 'coreopsis', 'geranium', 'nepeta'];
  const MID = ['phloxJ', 'phloxR', 'leucanthemum', 'achillea', 'iris', 'irisG', 'peony', 'monardaF', 'papaver', 'platycodon', 'agastache', 'alliumM', 'hemerocallis', 'penstemon', 'sedum', 'echinacea', 'anemone', 'lilium', 'roseKO', 'leucanthemum', 'phloxJ'];
  const BACK = ['delphinium', 'digitalis', 'lupinus', 'alliumG', 'perovskia', 'baptisia', 'eutrochium', 'roseDA', 'calamagrostis', 'echinops', 'helenium', 'aster', 'monardaJ', 'hydrangea', 'delphinium', 'digitalis', 'lupinus'];
  for (const L of [FRONT, MID, BACK]) for (let i = L.length - 1; i >= 0; i--) if (!LOOKS[L[i]] || !SIZE[L[i]]) L.splice(i, 1);
  const radiusOf = k => SIZE[k][1] / 2 * IN;
  // ---------------------------------------------------------------- hedges & topiary: clipped forms shelled with scanned sprigs
  const hedgeBase = texOf(noiseTex(512, 512, '#223319', [[16000, ['#2f4423', '#1b2913', '#3a5229', '#24361a'], [1.5, 4]]], 5), renderer);
  const HK = {
    yew: { base: P.std({ map: hedgeBase, roughness: 1, color: 0x8f9a8a }), card: P.std(cut({ map: TX.card_yew, normalMap: TX.card_yew_n, color: new THREE.Color(1.5, 1.55, 1.4), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.72, envMapIntensity: 0.4 }), { sway: 0.025, swayH: 2, translucent: true, key: 'yew' }), depth: P.depth(TX.card_yew, {}), size: 0.2, dens: lite ? 110 : 300 },
    box: { base: P.std({ map: hedgeBase, roughness: 1, color: 0xb4c49a }), card: P.std(cut({ map: TX.card_box, normalMap: TX.card_box_n, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.55, envMapIntensity: 0.5 }), { sway: 0.02, swayH: 1, translucent: true, key: 'box' }), depth: P.depth(TX.card_box, {}), size: 0.135, dens: lite ? 170 : 420 },
  };
  function sweepGeo(pts, closed, W, H, kind) {
    const w = W / 2, rt = kind === 'box' ? w * 0.95 : Math.min(w * 0.55, H * 0.25), prof = [];
    prof.push([-w * 1.03, 0], [-w, (H - rt) * 0.5], [-w, H - rt]);
    for (let k = 1; k < 6; k++) { const a = Math.PI - k / 6 * Math.PI / 2; prof.push([-w + rt + Math.cos(a) * rt, H - rt + Math.sin(a) * rt]); }
    prof.push([-w + rt, H], [w - rt, H]);
    for (let k = 1; k < 6; k++) { const a = Math.PI / 2 - k / 6 * Math.PI / 2; prof.push([w - rt + Math.cos(a) * rt, H - rt + Math.sin(a) * rt]); }
    prof.push([w, H - rt], [w, (H - rt) * 0.5], [w * 1.03, 0]);
    const np = prof.length, pos = [], uv = [], idx = [], n = pts.length; let along = 0;
    const plen = [0]; for (let k = 1; k < np; k++) plen.push(plen[k - 1] + Math.hypot(prof[k][0] - prof[k - 1][0], prof[k][1] - prof[k - 1][1]));
    for (let i = 0; i < n; i++) {
      const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const nx = -tz, nz = tx;
      if (i) along += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      for (let k = 0; k < np; k++) {
        const [qx, qy] = prof[k], taper = 1 - 0.07 * qy / H;
        const cx = qx * taper, d = qy > 0.02 ? (vn2(along * 2.2, qy * 2.2 + k * 0.1, 3) - 0.5) * 0.06 + (vn2(along * 7, qy * 7, 4) - 0.5) * 0.03 : 0;
        const ox = qx === 0 ? 0 : Math.sign(qx), oy = qy > H - rt ? 1 : 0, ol = Math.hypot(ox, oy) || 1;
        pos.push(pts[i][0] + nx * (cx + d * ox / ol), qy + d * oy / ol, pts[i][1] + nz * (cx + d * ox / ol)); uv.push(along, plen[k]);
      }
    }
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) { const i1 = (i + 1) % n; for (let k = 0; k < np - 1; k++) { const a = i * np + k, b = i * np + k + 1, c = i1 * np + k, d = i1 * np + k + 1; idx.push(a, b, c, b, d, c); } }   // wound to face outward
    if (!closed) for (const [i, s] of [[0, 1], [n - 1, -1]]) {
      const c0 = pos.length / 3; pos.push(pts[i][0], H * 0.45, pts[i][1]); uv.push(0, 0);
      for (let k = 0; k < np - 1; k++) s > 0 ? idx.push(c0, i * np + k + 1, i * np + k) : idx.push(c0, i * np + k, i * np + k + 1);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  const cardGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);   // sprig cards: stalk at the origin, tip up
  function scatter(geo, card, depth, { size, dens, max = 60000, lift = [0.0, 0.03], outFrac = 0.5, bright = [1.3, 2.0], keep = null, flat = 0 }) {
    const P0 = geo.attributes.position, I = geo.index.array, tris = [];
    let area = 0; const A = new V3(), Bv = new V3(), C = new V3(), N = new V3(), E1 = new V3(), E2 = new V3();
    for (let t = 0; t < I.length; t += 3) { A.fromBufferAttribute(P0, I[t]); Bv.fromBufferAttribute(P0, I[t + 1]); C.fromBufferAttribute(P0, I[t + 2]);
      E1.subVectors(Bv, A); E2.subVectors(C, A); N.crossVectors(E1, E2); const a = N.length() / 2; if (a < 1e-5) continue; N.normalize(); if (N.y < -0.3) continue; area += a; tris.push([area, I[t], I[t + 1], I[t + 2], N.clone()]); }
    const want = Math.min(max, Math.floor(area * dens)), mats = [], cols = [];
    const m = new THREE.Matrix4(), q = new Q(), s = new V3(), p = new V3(), yv = new V3(), zv = new V3(), xv = new V3(), tv = new V3(), bm = new THREE.Matrix4();
    for (let i = 0; i < want; i++) {
      const u = rng() * area; let lo = 0, hi = tris.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (tris[mid][0] < u) lo = mid + 1; else hi = mid; }
      const T = tris[lo]; let a = rng(), b = rng(); if (a + b > 1) { a = 1 - a; b = 1 - b; }
      A.fromBufferAttribute(P0, T[1]); Bv.fromBufferAttribute(P0, T[2]); C.fromBufferAttribute(P0, T[3]);
      p.copy(A).addScaledVector(E1.subVectors(Bv, A), a).addScaledVector(E2.subVectors(C, A), b);
      if (keep && !keep(p, T[4])) continue;
      const nrm = T[4], sc = size * (0.7 + rng() * 0.6);
      tv.set(rr(-1, 1), rr(-0.2, 1), rr(-1, 1)); tv.addScaledVector(nrm, -tv.dot(nrm)); if (tv.lengthSq() < 1e-4) tv.set(1, 0, 0).addScaledVector(nrm, -nrm.x); tv.normalize();
      if (rng() < outFrac) {   // a twig growing out of the clipped face
        yv.copy(nrm).addScaledVector(tv, rr(0.15, 0.75)).normalize(); zv.copy(tv).addScaledVector(yv, -tv.dot(yv)).normalize(); p.addScaledVector(nrm, -sc * 0.55);
      } else {                 // a spray lying against the face
        zv.copy(nrm).addScaledVector(tv, rr(-0.35, 0.35) * (1 - flat)).normalize(); yv.copy(tv).addScaledVector(zv, -tv.dot(zv)).normalize(); p.addScaledVector(yv, -sc * 0.5).addScaledVector(nrm, lerp(lift[0], lift[1], rng()));
      }
      xv.crossVectors(yv, zv); bm.makeBasis(xv, yv, zv); q.setFromRotationMatrix(bm); s.set(sc, sc, sc);
      m.compose(p, q, s); for (let e = 0; e < 16; e++) mats.push(m.elements[e]);
      const br = lerp(bright[0], bright[1], rng()) * (0.86 + 0.18 * clamp(nrm.y, 0, 1)); cols.push(br * rr(0.92, 1.06), br, br * rr(0.86, 1.02));
    }
    const n = cols.length / 3, mesh = new THREE.InstancedMesh(cardGeo, card, n);
    mesh.instanceMatrix = new THREE.InstancedBufferAttribute(new Float32Array(mats), 16); mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cols), 3);
    mesh.customDepthMaterial = depth; mesh.castShadow = true; mesh.receiveShadow = true; mesh.computeBoundingSphere(); scene.add(mesh);
    return mesh;
  }
  const shellify = (geo, kind, k = 1) => scatter(geo, HK[kind].card, HK[kind].depth, { size: HK[kind].size * k, dens: HK[kind].dens / (k * k) });
  function hedge(pts, closed, W, H, kind, solid = true) {
    const geo = sweepGeo(pts, closed, W, H, kind), base = new THREE.Mesh(geo, HK[kind].base);
    base.castShadow = base.receiveShadow = true; scene.add(base); shellify(geo, kind);
    aoLine(pts, W + 0.9, 0.5, closed);
    if (solid) for (const p of pts) block(p[0], p[1], W / 2 + 0.25);
  }
  function topiary(x, z, kind, form, Hh, R) {
    let geo;
    if (form === 'ball') geo = new THREE.SphereGeometry(R, 24, 16).translate(0, R * 0.9, 0);
    else if (form === 'standard') { geo = new THREE.SphereGeometry(R, 22, 14).translate(0, Hh - R, 0); metalSegs.push([[x, 0, z], [x, Hh - R * 1.5, z], 0.03]); }   // a clipped ball on a clear stem
    else if (form === 'cube') geo = new THREE.BoxGeometry(R * 2, Hh, R * 2, 5, 6, 5).translate(0, Hh / 2, 0);
    else if (form === 'dome') geo = new THREE.SphereGeometry(1, 24, 12, 0, TAU, 0, Math.PI / 2).scale(R, Hh, R);
    else if (form === 'tier') { const pts = []; for (let i = 0; i <= 36; i++) { const t = i / 36; pts.push(new THREE.Vector2(Math.max(0.01, R * (1 - 0.5 * t) * (0.2 + 0.8 * Math.pow(Math.abs(Math.sin(Math.PI * t * 3)), 0.6)) * Math.min(1, (1 - t) / 0.04)), t * Hh)); } geo = new THREE.LatheGeometry(pts, 24); }   // three stacked rounds: a "cake stand"
    else { const pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(new THREE.Vector2(Math.max(0.01, R * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.02)), form === 'cone' ? 0.9 : 0.45) * (form === 'cone' ? 1 - t * 0.75 : 1)), t * Hh)); } geo = new THREE.LatheGeometry(pts, 24); }
    const pa = geo.attributes.position; for (let i = 0; i < pa.count; i++) { const v = new V3().fromBufferAttribute(pa, i), d = 1 + (vn2(v.x * 4 + x, v.y * 4 + v.z * 3, 8) - 0.5) * 0.08; pa.setXYZ(i, v.x * d, v.y, v.z * d); }
    geo.computeVertexNormals(); geo.translate(x, 0, z);
    const base = new THREE.Mesh(geo, HK[kind].base); base.castShadow = base.receiveShadow = true; scene.add(base); shellify(geo, kind, form === 'ball' ? 0.85 : 1);
    aoBlob(x, z, R * 2.2, 0.55); block(x, z, R + 0.2);
  }
  const AV = layout.avenue, CN = layout.canal;
  for (const s of [-1, 1]) { const pts = []; for (let z = AV.z0 - 0.1; z <= AV.z1 + 0.11; z += 0.5) pts.push([s * AV.hedgeX, z]); hedge(pts, false, 1.0, 2.25, 'yew'); }
  for (let q = 0; q < 4; q++) { const pts = [], a0 = q * Math.PI / 2 + ring.gap, a1 = (q + 1) * Math.PI / 2 - ring.gap; for (let a = a0; a <= a1 + 1e-6; a += 0.5 / ring.r) pts.push([Math.cos(a) * ring.r, Math.sin(a) * ring.r]); hedge(pts, false, 0.9, 1.6, 'yew'); }
  for (const [x, z] of [[1.95, 14.3], [-1.95, 14.3], [1.95, -14.3], [-1.95, -14.3], [14.3, 1.95], [14.3, -1.95], [-14.3, 1.95], [-14.3, -1.95]]) topiary(x, z, 'box', 'ball', 0, 0.48);
  for (let q = 0; q < 4; q++) {   // parterre: box-edged quadrant beds
    const pts = [], ro = ring.bedOut, ri = ring.bedIn, ao = Math.asin(1.8 / ro), ai = Math.asin(1.8 / ri), A0o = q * Math.PI / 2 + ao, A1o = (q + 1) * Math.PI / 2 - ao, A0i = q * Math.PI / 2 + ai, A1i = (q + 1) * Math.PI / 2 - ai;
    for (let a = A0o; a <= A1o; a += 0.4 / ro) pts.push([Math.cos(a) * ro, Math.sin(a) * ro]);
    for (let t = 0.1; t < 1; t += 0.12) { const r = lerp(ro, ri, t), a = lerp(A1o, A1i, t); pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    for (let a = A1i; a >= A0i; a -= 0.4 / ri) pts.push([Math.cos(a) * ri, Math.sin(a) * ri]);
    for (let t = 0.1; t < 1; t += 0.12) { const r = lerp(ri, ro, t), a = lerp(A0i, A0o, t); pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    hedge(pts, true, 0.34, 0.42, 'box', false);
  }
  for (const s of [-1, 1]) { const pts = []; for (let z = CN.z0 - 0.3; z <= CN.z1 + 0.31; z += 0.5) pts.push([s * 4.9, z]); hedge(pts, false, 0.4, 0.5, 'box'); }
  for (const s of [-1, 1]) for (let z = CN.z0 + 1.2; z <= CN.z1 - 1; z += 4.5) topiary(s * 5.8, z, 'yew', 'column', 3.2, 0.5);
  { const b = layout.bench, pts = []; for (let a = Math.PI * 1.08; a <= Math.PI * 1.92; a += 0.16) pts.push([b.x + Math.cos(a) * 2.75, b.z + 1.0 + Math.sin(a) * 2.75]); hedge(pts, false, 0.8, 1.85, 'yew'); }

  // --- formal structure: a steady rhythm of clipped shapes through the borders, topiary lawns either side of the great circle
  const free = (x, z, m) => layout.inWalls(x, z, m) && !(Math.abs(x) < 6 && z > 47.5) && layout.lamps.every(l => Math.hypot(l[0] - x, l[1] - z) > 1.6) && layout.trees.every(t => Math.hypot(t.x - x, t.z - z) > 3.2) && Math.hypot(x - layout.bench.x, z - layout.bench.z) > 4.2;
  const obelisks = [];
  { const S = layout.loopS, n = S.length, step = Math.round(n / Math.round(layout.loopLen / 7));   // every seven metres round the loop walk
    for (let k = 0, i = 0; i + step / 2 < n; i += step, k++) { const s = S[i];
      const bx = s.x + s.ox * 1.98, bz = s.z + s.oz * 1.98; if (free(bx, bz, 0.6)) topiary(bx, bz, 'box', 'ball', 0, 0.33);            // box balls along the front edge
      if (k % 2 === 0) { const cx = s.x + s.ox * 4.4, cz = s.z + s.oz * 4.4; if (free(cx, cz, 1.0)) { if (k % 4 === 0) topiary(cx, cz, 'yew', 'cone', 2.3, 0.62); else { obelisks.push([cx, cz]); block(cx, cz, 0.4); } } } } }   // yew cones and rose obelisks alternating at the back
  for (const [x, z] of [[-3.1, 53.3], [3.1, 53.3], [19.1, 2.3], [19.1, -2.3], [-19.1, 2.3], [-19.1, -2.3]]) topiary(x, z, 'box', 'standard', 1.9, 0.42);
  for (const sx of [-1, 1]) [['cone', 2.4, 0.7], ['tier', 2.6, 0.75], ['cone', 2.4, 0.7], ['cube', 1.3, 0.6], ['tier', 3.1, 0.9], ['cube', 1.3, 0.6], ['dome', 1.0, 0.85], ['column', 2.8, 0.5], ['dome', 1.0, 0.85]]
    .forEach(([form, H, R], i) => topiary(sx * (12.2 + (i % 3) * 2.8), 8.7 + Math.floor(i / 3) * 2.8, 'yew', form, H, R));   // a topiary lawn: three by three
  for (let q = 0; q < 4; q++) { const a = Math.PI / 4 + q * Math.PI / 2; topiary(Math.cos(a) * 9.85, Math.sin(a) * 9.85, 'yew', 'cone', 1.7, 0.45); }   // a cone at the heart of each parterre bed

  // ---------------------------------------------------------------- stone, brick, water
  const ST = TX.white_plaster_02;
  const stone = (o = {}) => P.std({ map: ST.diff, normalMap: ST.nor, color: o.color || 0xf0e8d6, roughness: 1, vertexColors: !!o.vc }, { tri: { arm: ST.arm, scale: o.scale || 0.55, moss: o.moss == null ? 1 : o.moss, wet: o.wet || 0 }, key: 'st' + (o.key || '') + (o.vc ? 'v' : '') });
  const stoneMat = stone(), stoneWet = stone({ wet: 0.75, moss: 0.5, key: 'w' }), stoneFloor = stone({ wet: 1, moss: 1.4, color: 0x8f9a86, key: 'f' });
  const stoneVC = stone({ vc: true }), stoneWetVC = stone({ wet: 0.75, moss: 0.5, key: 'w', vc: true });
  const BR = TX.castle_brick_02_red;
  const brickMat = P.std({ map: BR.diff, normalMap: BR.nor, aoMap: BR.arm, roughnessMap: BR.arm, roughness: 1, color: 0xe0d6d0 }, { key: 'brick' });
  const metalMat = P.std({ color: 0x1b1c1b, roughness: 0.42, metalness: 0.7 });
  const addMesh = (geo, mat, x = 0, z = 0, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, 0, z); m.castShadow = cast; m.receiveShadow = true; scene.add(m); return m; };
  // stonework from Blender: geometry with ambient occlusion baked into vertex colours, shaded with the same scanned stone
  const propParts = {}; if (assets.models.props) assets.models.props.traverse(o => { if (o.isMesh) propParts[o.name] = o.geometry; });
  const instanced = (geo, mat, Ms, cols) => { const im = new THREE.InstancedMesh(geo, mat, Ms.length); Ms.forEach((M, i) => { im.setMatrixAt(i, M); if (cols) im.setColorAt(i, cols[i]); }); im.castShadow = im.receiveShadow = true; im.frustumCulled = false; scene.add(im); return im; };
  // a course of stones laid end to end from (x0, z0) to (x1, z1), each stretched a little so a whole number fits
  const course = (list, x0, z0, x1, z1, y, unitLen) => { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / unitLen)), q = new Q().setFromAxisAngle(_Y, Math.abs(x1 - x0) > Math.abs(z1 - z0) ? 0 : Math.PI / 2);
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; list.push(new THREE.Matrix4().compose(new V3(lerp(x0, x1, t), y, lerp(z0, z1, t)), q, new V3(L / n / unitLen, 1, 1))); } };
  const tones = n => Array.from({ length: n }, () => new THREE.Color().setScalar(rr(0.8, 1.06)));
  const stoneParts = {};
  if (assets.models.stone) assets.models.stone.traverse(o => { if (!o.isMesh) return; const g = o.geometry, c = g.attributes.color;
    if (c) { for (let i = 0; i < c.count; i++) { const v = 0.3 + 0.7 * c.getX(i); c.setXYZ(i, v, v, v); } c.needsUpdate = true; }   // ease the baked occlusion: the live lighting adds its own
    stoneParts[o.name] = g; });
  console.log('[garden] stonework: ' + (Object.keys(stoneParts).join(', ') || 'none (using turned fallbacks)'));
  const carved = (name, x, z, wetStone = false, rotY = 0, y = 0) => {
    const g = stoneParts[name]; if (!g) return false;
    const m = addMesh(g, g.attributes.color ? (wetStone ? stoneWetVC : stoneVC) : (wetStone ? stoneWet : stoneMat), x, z); m.position.y = y; m.rotation.y = rotY; return true;
  };
  const sheetC = (() => { const [c, g] = canvas(512, 512), r = PlantArt.rngOf(31);   // ribbons of falling water, broken into dashes
    for (let i = 0; i < 150; i++) { const x = r() * 512, w = 1.2 + r() * 4.5, a0 = 0.25 + r() * 0.6; let y = -r() * 200;
      while (y < 512) { const len = 40 + r() * 260, gr = g.createLinearGradient(0, y, 0, y + len); gr.addColorStop(0, 'rgba(240,248,252,0)'); gr.addColorStop(0.25, `rgba(240,248,252,${a0})`); gr.addColorStop(0.8, `rgba(250,253,255,${a0 * 0.8})`); gr.addColorStop(1, 'rgba(250,253,255,0)');
        g.fillStyle = gr; g.fillRect(x, y, w, len); y += len + r() * 90; } }
    return c; })();
  const sheetT = texOf(sheetC, renderer);
  const sheetMat = P.std({ map: sheetT, color: 0xe6f0f4, transparent: true, opacity: 0.85, roughness: 0.25, depthWrite: false, side: THREE.DoubleSide }, { key: 'sheet' });
  const foamC = (() => { const [c, g] = canvas(512, 64), r = PlantArt.rngOf(41); for (let i = 0; i < 2200; i++) { g.fillStyle = `rgba(250,252,255,${0.15 + r() * 0.5})`; g.beginPath(); g.arc(r() * 512, r() * 64 * r(), 0.8 + r() * 2.5, 0, TAU); g.fill(); } return c; })();
  const foamT = texOf(foamC, renderer); foamT.repeat.set(6, 1);
  const foamMat = P.std({ map: foamT, transparent: true, depthWrite: false, roughness: 0.4 }, { key: 'foam' });
  // planar reflection, shared by every water surface (all at WATER_Y)
  let reflScale = reflScale0;
  const reflRT = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType });
  const reflCam = new THREE.PerspectiveCamera();
  const ripples = Array.from({ length: 6 }, () => new THREE.Vector4());
  const waterMat = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, U, { tRefl: { value: reflRT.texture }, tWN: { value: TX.waternormals }, tFloor: { value: ST.diff }, uRes: { value: new THREE.Vector2(1, 1) }, uRipple: { value: ripples } }),
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: COMMON + `
      uniform sampler2D tRefl, tWN, tFloor; uniform vec2 uRes; uniform vec4 uRipple[6]; uniform vec3 uSunCol; uniform vec3 uSunDir; uniform float uExhibit;
      varying vec3 vW;
      void main(){
        vec2 p = vW.xz;
        vec2 g = (texture2D(tWN, p * 0.22 + uTime * vec2(0.012, 0.007)).xy + texture2D(tWN, p * 0.61 - uTime * vec2(0.01, 0.017)).xy - 1.0) * 0.16;
        for (int i = 0; i < 6; i++) { vec4 R = uRipple[i]; if (R.z <= 0.0) continue; vec2 d = p - R.xy; float r = length(d) + 1e-3; g += d / r * sin(r * R.w - uTime * 5.0) * R.z * exp(-r * 0.4); }
        vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 V = normalize(cameraPosition - vW);
        float fres = 0.025 + 0.975 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec2 suv = gl_FragCoord.xy / uRes;
        vec3 refl = texture2D(tRefl, vec2(suv.x, 1.0 - suv.y) + N.xz * 0.05).rgb;
        float Ld = drainAt(vW);
        // the stone floor seen through 30 cm of greenish water, with caustics when the sun is on it
        vec2 fp = p + V.xz / max(V.y, 0.25) * 0.22 + N.xz * 0.35;
        vec3 fl = texture2D(tFloor, fp * 0.5).rgb * vec3(0.3, 0.42, 0.34);
        float ca = texture2D(tWN, fp * 0.55 + uTime * 0.03).r * texture2D(tWN, fp * 0.73 - uTime * 0.025).g;
        vec3 light = uAmb * 1.6 + uSun * (0.5 + 2.6 * smoothstep(0.2, 0.42, ca)) + groundLight(p) * uExhibit * uLightGain * 0.9;
        vec3 col = mix(fl * light, refl, clamp(fres + 0.06, 0.0, 1.0));
        vec3 H = normalize(uSunDir + V);
        col += uSunCol * pow(max(dot(N, H), 0.0), 600.0) * 5.0 * step(0.0, uSunDir.y);
        col *= mix(1.0, Ld, 0.93); col = gshift(col, vW);
        gl_FragColor = vec4(mix(uFogColor, col, fogF(distance(cameraPosition, vW))), 1.0);
      }`,
  });
  const bowlWater = P.std({ color: 0x1a2a2e, roughness: 0.03, metalness: 0.15, envMapIntensity: 1.8, normalMap: TX.waternormals, normalScale: new THREE.Vector2(0.12, 0.12) }, { key: 'bowlw' });
  const waterBodies = [], waterMeshes = [], jets = [];
  const disc = (r, y, segs = 96) => new THREE.CircleGeometry(r, segs).rotateX(-Math.PI / 2).translate(0, y, 0);
  function poolRim(x, z, r, name) {
    if (!carved(name, x, z)) addMesh(lathe([[r + 0.74, 0], [r + 0.74, 0.1], [r + 0.66, 0.14], [r + 0.64, 0.42], [r + 0.7, 0.47], [r + 0.74, 0.53], [r + 0.73, 0.6], [r + 0.66, 0.65], [r + 0.5, 0.67], [r + 0.14, 0.67], [r + 0.03, 0.63], [r, 0.56], [r, 0.02]], 128), stoneMat, x, z);
    addMesh(disc(r, 0.03), stoneFloor, x, z, false);
    const w = addMesh(disc(r, WATER_Y, 128), waterMat, x, z, false); waterBodies.push({ x, z, r: r + 2 }); waterMeshes.push(w);
    block(x, z, r + 0.82); aoBlob(x, z, r + 2.2, 0.38); wet(x, z, r + 0.6, r + 2.4, 0.75);
  }
  function sheet(x, z, y0, y1, r0, r1) {
    const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(r0 + (r1 - r0) * Math.sqrt(t), y0 - (y0 - y1) * t)); }   // a thrown sheet falls on a parabola
    const geo = new THREE.LatheGeometry(pts, 96), uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(r0 * 1.4)), uv.getY(i) * (y0 - y1) / 1.6);
    const m = addMesh(geo, sheetMat, x, z, false); m.renderOrder = 4;
    const f = addMesh(new THREE.RingGeometry(r1 - 0.12, r1 + 0.5, 96, 1).rotateX(-Math.PI / 2).translate(0, y1 + 0.012, 0), foamMat, x, z, false); f.renderOrder = 5;
  }
  { // the grand tiered fountain: lower bowl lip at r 2.27 / y 1.8, upper bowl lip at r 1.16 / y 2.69, finial top at y 3.16
    const p = layout.pools[0]; poolRim(p.x, p.z, p.r, 'pool_grand');
    if (!carved('fountain_grand', p.x, p.z, true)) {
      addMesh(lathe([[1.3, 0, 0.05], [1.3, 0.3, 0.05], [1.18, 0.36, 0.05], [0.95, 0.42], [0.55, 0.48], [0.42, 0.6], [0.56, 0.8], [0.62, 0.95], [0.46, 1.1], [0.34, 1.2], [0.4, 1.3], [0.72, 1.37, 0.05], [1.3, 1.47, 0.09], [1.95, 1.6, 0.07], [2.2, 1.7, 0.03], [2.27, 1.76], [2.25, 1.81], [2.15, 1.82], [2.07, 1.74], [1.3, 1.62], [0.01, 1.58]], 128, 16), stoneWet, p.x, p.z);
      addMesh(lathe([[0.3, 1.58], [0.22, 1.76], [0.31, 1.96], [0.24, 2.2], [0.3, 2.35], [0.52, 2.41, 0.06], [0.95, 2.51, 0.08], [1.12, 2.61, 0.03], [1.16, 2.67], [1.09, 2.7], [1.03, 2.62], [0.5, 2.55], [0.01, 2.53]], 96, 12), stoneWet, p.x, p.z);
      addMesh(lathe([[0.17, 2.53], [0.1, 2.66], [0.19, 2.76, 0.25], [0.23, 2.9, 0.3], [0.17, 3.02, 0.25], [0.07, 3.1], [0.03, 3.16]], 48, 8), stoneWet, p.x, p.z);
    }
    addMesh(disc(2.09, 1.775), bowlWater, p.x, p.z, false);
    addMesh(disc(1.05, 2.655, 64), bowlWater, p.x, p.z, false);
    sheet(p.x, p.z, 1.8, WATER_Y, 2.28, 2.42); sheet(p.x, p.z, 2.69, 1.775, 1.17, 1.24);
    jets.push({ o: [p.x, 3.16, p.z], vy: [2.3, 2.9], vr: [0.15, 0.6], n: lite ? 400 : 1000 });
    ripples[0].set(p.x, p.z, 0.02, 5.0);
  }
  for (const [i, p] of layout.pools.slice(1).entries()) {   // two bowl fountains on the cross walk: lip at r 0.98 / y 1.2
    poolRim(p.x, p.z, p.r, 'pool_bowl');
    if (!carved('fountain_bowl', p.x, p.z, true, i * 0.7))
      addMesh(lathe([[0.62, 0, 0.05], [0.62, 0.2, 0.05], [0.38, 0.3], [0.25, 0.6], [0.31, 0.78], [0.26, 0.9], [0.5, 0.98, 0.07], [0.82, 1.06, 0.08], [0.95, 1.14, 0.03], [0.98, 1.2], [0.91, 1.22], [0.85, 1.15], [0.4, 1.09], [0.01, 1.07]], 96, 12), stoneWet, p.x, p.z);
    addMesh(disc(0.87, 1.18, 48), bowlWater, p.x, p.z, false);
    sheet(p.x, p.z, 1.21, WATER_Y, 0.99, 1.06);
    jets.push({ o: [p.x, 1.19, p.z], vy: [1.2, 1.6], vr: [0.0, 0.12], n: 180 });
    ripples[1 + i].set(p.x, p.z, 0.012, 7.0);
  }
  { // the canal: stone coping, water, arching jets
    const { hw, z0, z1 } = CN, L = z1 - z0, zc = (z0 + z1) / 2, copingF = [];
    for (const s of [-1, 1]) { addMesh(new THREE.BoxGeometry(0.46, 0.46, L + 0.92, 1, 1, 1).translate(s * (hw + 0.23), 0.23, zc), stoneMat); if (propParts.coping_flat) course(copingF, s * (hw + 0.23), z0 - 0.5, s * (hw + 0.23), z1 + 0.5, 0.455, 0.8); else addMesh(new THREE.BoxGeometry(0.54, 0.09, L + 1.0).translate(s * (hw + 0.23), 0.5, zc), stoneMat); }
    for (const zz of [z0 - 0.23, z1 + 0.23]) { addMesh(new THREE.BoxGeometry(hw * 2 + 0.92, 0.46, 0.46).translate(0, 0.23, zz), stoneMat); if (propParts.coping_flat) course(copingF, -hw + 0.05, zz, hw - 0.05, zz, 0.455, 0.8); else addMesh(new THREE.BoxGeometry(hw * 2 + 1.0, 0.09, 0.54).translate(0, 0.5, zz), stoneMat); }
    if (copingF.length) instanced(propParts.coping_flat, stoneMat, copingF, tones(copingF.length));
    addMesh(new THREE.PlaneGeometry(hw * 2, L).rotateX(-Math.PI / 2).translate(0, 0.03, zc), stoneFloor, 0, 0, false);
    waterMeshes.push(addMesh(new THREE.PlaneGeometry(hw * 2, L).rotateX(-Math.PI / 2).translate(0, WATER_Y, zc), waterMat, 0, 0, false));
    waterBodies.push({ x: 0, z: zc, r: L / 2 + 3 });
    for (let z = z0 - 0.2; z <= z1 + 0.2; z += 0.25) block(0, z, hw + 0.5);
    aoLine([[-hw - 0.5, z0 - 0.5], [hw + 0.5, z0 - 0.5], [hw + 0.5, z1 + 0.5], [-hw - 0.5, z1 + 0.5]], 0.7, 0.45, true);
    for (let z = z0 + 0.5; z < z1; z += 2) for (const s of [-1, 1]) wet(s * (hw + 0.9), z, 0.1, 1.3, 0.35);
    for (let z = z0 + 1.6; z <= z1 - 1.2; z += 3.2) for (const s of [-1, 1]) { jets.push({ o: [s * (hw + 0.05), 0.56, z], dir: [-s, 0], vy: [2.3, 2.6], vh: [1.45, 1.65], n: 80 }); addMesh(new THREE.CylinderGeometry(0.018, 0.024, 0.1, 8).translate(s * (hw + 0.08), 0.58, z), metalMat); }
  }
  { // droplets
    const tot = jets.reduce((a, j) => a + j.n, 0), seeds = new Float32Array(tot * 4), o = new Float32Array(tot * 3), v = new Float32Array(tot * 3); let k = 0;
    for (const j of jets) for (let i = 0; i < j.n; i++, k++) {
      o.set(j.o, k * 3);
      if (j.dir) { const vh = rr(j.vh[0], j.vh[1]); v.set([j.dir[0] * vh + rr(-0.05, 0.05), rr(j.vy[0], j.vy[1]), rr(-0.06, 0.06)], k * 3); }
      else { const a = rng() * TAU, vr = rr(j.vr[0], j.vr[1]); v.set([Math.cos(a) * vr, rr(j.vy[0], j.vy[1]), Math.sin(a) * vr], k * 3); }
      seeds.set([rng(), rng(), rng(), rng()], k * 4);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(o, 3)); g.setAttribute('aVel', new THREE.BufferAttribute(v, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    const mat = new THREE.ShaderMaterial({
      uniforms: Object.assign({}, U), transparent: true, depthWrite: false,
      vertexShader: COMMON + `uniform float uPx; uniform float uExhibit; attribute vec3 aVel; attribute vec4 aSeed; varying vec3 vC; varying float vA;
        void main(){
          float T = 2.2 * aVel.y / 9.8;
          float t = fract(uTime / T * (0.9 + 0.2 * aSeed.x) + aSeed.y) * T;
          vec3 p = position + aVel * t + vec3(0.0, -4.9 * t * t, 0.0);
          if (p.y < ${WATER_Y.toFixed(2)}) p.y = -10.0;
          vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          float L = drainAt(p);
          gl_PointSize = clamp((0.02 + 0.022 * aSeed.z) * uPx / -mv.z, 0.0, 14.0);
          vC = gshift(vec3(0.72, 0.82, 0.88) * (uAmb * 1.8 + uSun * 1.1 + groundLight(p.xz) * uExhibit * uLightGain * 0.9) * mix(1.0, L, 0.93), p);
          vA = 0.6 * fogF(-mv.z);
        }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 q = gl_PointCoord * 2.0 - 1.0; float r2 = dot(q, q); if (r2 > 1.0) discard; gl_FragColor = vec4(vC * (1.0 + 0.8 * (1.0 - r2)), vA * (1.0 - r2 * 0.6)); }`,
    });
    const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 6; scene.add(pts);
  }
  // urns on the setts apron (soil surface at y 1.24)
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2, x = Math.cos(a) * 6.75, z = Math.sin(a) * 6.75;
    if (!carved('urn', x, z, false, a)) {
      addMesh(new THREE.BoxGeometry(0.84, 0.1, 0.84).translate(0, 0.05, 0), stoneMat, x, z); addMesh(new THREE.BoxGeometry(0.7, 0.42, 0.7).translate(0, 0.3, 0), stoneMat, x, z); addMesh(new THREE.BoxGeometry(0.8, 0.07, 0.8).translate(0, 0.54, 0), stoneMat, x, z);
      addMesh(lathe([[0.24, 0.57], [0.2, 0.62], [0.15, 0.72], [0.19, 0.78], [0.34, 0.86, 0.1], [0.5, 1.0, 0.12], [0.55, 1.14, 0.06], [0.5, 1.24], [0.56, 1.3], [0.6, 1.35], [0.57, 1.38], [0.5, 1.36], [0.46, 1.28], [0.01, 1.24]], 64, 16), stoneMat, x, z);
    }
    addPlant('geranium', x, z, { y: 1.26, scale: 0.7 }); addPlant('nepeta', x + 0.05, z - 0.05, { y: 1.24, scale: 0.45, salt: 5 });
    block(x, z, 0.62); aoBlob(x, z, 1.1, 0.5);
  }
  // the brick wall, its stone coping and gate piers
  {
    const T = 0.5, H = B.h, copingW = [];
    const wall = (x0, z0, x1, z1) => {   // centre line of a straight run
      const L = Math.hypot(x1 - x0, z1 - z0), alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      addMesh(worldUV(new THREE.BoxGeometry(alongX ? L : T, H, alongX ? T : L).translate(cx, H / 2, cz), 1 / 1.35), brickMat);
      if (propParts.coping_wall) course(copingW, x0, z0, x1, z1, H, 0.9); else {
        addMesh(new THREE.BoxGeometry(alongX ? L + 0.1 : T + 0.16, 0.1, alongX ? T + 0.16 : L + 0.1).translate(cx, H + 0.05, cz), stoneMat);
        addMesh(new THREE.BoxGeometry(alongX ? L : T - 0.06, 0.08, alongX ? T - 0.06 : L).translate(cx, H + 0.13, cz), stoneMat); }
      for (let d = 0; d <= L; d += 0.25) block(x0 + (x1 - x0) * d / L, z0 + (z1 - z0) * d / L, T / 2 + 0.3);
      aoLine([[x0, z0], [x1, z1]], 1.5, 0.5);
    };
    const pier = (x, z, s = 0.82, h = H + 0.5) => {
      addMesh(worldUV(new THREE.BoxGeometry(s, h, s).translate(x, h / 2, z), 1 / 1.35), brickMat); addMesh(new THREE.BoxGeometry(s + 0.2, 0.12, s + 0.2).translate(x, h + 0.06, z), stoneMat);
      addMesh(new THREE.BoxGeometry(s + 0.06, 0.1, s + 0.06).translate(x, h + 0.17, z), stoneMat);
      if (!carved('finial', x, z, false, 0, h + 0.22)) addMesh(lathe([[0.1, 0], [0.13, 0.05], [0.09, 0.1], [0.24, 0.2], [0.3, 0.36], [0.24, 0.52], [0.1, 0.6], [0.01, 0.62]], 32).translate(x, h + 0.22, z), stoneMat);
      block(x, z, s * 0.7); aoBlob(x, z, 1.2, 0.5);
    };
    const o = T / 2, gw = layout.gate.hw + 0.41;
    // The brick wall is gone: the garden now stands open in its field, and the wall round it is yours to build in dry stone (walling.js).
    // Only the gate and its two piers remain, to show where the wall will meet them.
    if (layout.brickWall) { wall(B.x0 - o, B.z0 - o, B.x1 + o, B.z0 - o); wall(B.x0 - o, B.z0 - o, B.x0 - o, B.z1 + o); wall(B.x1 + o, B.z0 - o, B.x1 + o, B.z1 + o);
      wall(B.x0 - o, B.z1 + o, -gw, B.z1 + o); wall(gw, B.z1 + o, B.x1 + o, B.z1 + o);
      for (const [x, z] of [[B.x0 - o, B.z0 - o], [B.x1 + o, B.z0 - o], [B.x0 - o, B.z1 + o], [B.x1 + o, B.z1 + o]]) pier(x, z, 0.7, H + 0.25); }
    pier(-gw, B.z1 + o, 0.82, 2.1); pier(gw, B.z1 + o, 0.82, 2.1);
    if (copingW.length) instanced(propParts.coping_wall, stoneMat, copingW, tones(copingW.length));
  }
  // ivy, in patches, on the inside faces of the wall (only if the brick wall stands)
  if (layout.brickWall) {
    const ivyMat = P.std(cut({ map: TX.card_ivy, normalMap: TX.card_ivy_n, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.4 }), { sway: 0.03, swayH: 2, translucent: true, key: 'ivy' }), ivyDepth = P.depth(TX.card_ivy, {});
    const faces = [[B.x0, B.z0, B.x1, B.z0, 0, 1], [B.x0, B.z0, B.x0, B.z1, 1, 0], [B.x1, B.z0, B.x1, B.z1, -1, 0], [B.x0, B.z1, -2.2, B.z1, 0, -1], [2.2, B.z1, B.x1, B.z1, 0, -1]];
    for (const [x0, z0, x1, z1, nx, nz] of faces) {
      const L = Math.hypot(x1 - x0, z1 - z0), g = new THREE.PlaneGeometry(L, B.h + 0.1, Math.ceil(L), 3), p = g.attributes.position, tx = (x1 - x0) / L, tz = (z1 - z0) / L;
      for (let i = 0; i < p.count; i++) { const u = p.getX(i) + L / 2, y = p.getY(i) + (B.h + 0.1) / 2; p.setXYZ(i, x0 + tx * u + nx * 0.02, y, z0 + tz * u + nz * 0.02); }
      const idx = g.index.array, a = new V3().fromBufferAttribute(p, idx[0]), b = new V3().fromBufferAttribute(p, idx[1]), c = new V3().fromBufferAttribute(p, idx[2]);
      if (new V3().crossVectors(b.sub(a), c.sub(a)).dot(new V3(nx, 0, nz)) < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
      scatter(g, ivyMat, ivyDepth, { size: 0.62, dens: lite ? 9 : 20, outFrac: 0.12, flat: 0.6, lift: [0.01, 0.07], bright: [0.7, 1.15],
        keep: (q, n) => { const u = (q.x * tx + q.z * tz), cover = vn2(u * 0.16 + nx * 7, q.y * 0.2 + nz * 3, 31) + 0.25 * vn2(u * 0.7, q.y * 0.9, 32) - q.y * 0.07; return cover > 0.62 && Math.abs(n.y) < 0.5; } });
    }
  }
  // scanned props: lamp posts, the iron gate, a bench, and a stone cat on the pool rim
  const lampHeads = [];
  {
    const adopt = (model, tweak) => model.traverse(o => { if (!o.isMesh) return; const s = o.material, p = { map: s.map, normalMap: s.normalMap, roughnessMap: s.roughnessMap, metalnessMap: s.metalnessMap, roughness: s.roughness, metalness: s.metalness, color: s.color, side: s.side };
      const extra = tweak ? tweak(s, p) : null; o.material = P.std(Object.assign(p, extra || {}), { key: 'gltf' + s.name }); o.castShadow = !o.material.transparent; o.receiveShadow = true; });
    const lamp = assets.models.street_lamp_01, LAMP_H = 3.3, lk = LAMP_H / 3.87;
    adopt(lamp, s => /glass/.test(s.name) ? { transparent: true, opacity: 0.22, roughness: 0.08, metalness: 0, depthWrite: false } : /bulb/.test(s.name) ? { emissive: new THREE.Color(1, 0.72, 0.4), emissiveIntensity: 6, map: null } : null);
    for (const [x, z] of layout.lamps) { const m = lamp.clone(); m.scale.setScalar(lk); m.position.set(x, 0, z); m.rotation.y = Math.atan2(x, z); scene.add(m); block(x, z, 0.3); aoBlob(x, z, 0.7, 0.55); lampHeads.push([x, 3.27 * lk, z]); }
    const gate = assets.models.large_iron_gate; adopt(gate);
    { const k = (layout.gate.hw * 2 + 0.04) / 2.96; gate.scale.setScalar(k); gate.position.set(layout.gate.x, 0, layout.gate.z); scene.add(gate);
      for (let x = -layout.gate.hw; x <= layout.gate.hw; x += 0.25) block(x, layout.gate.z, 0.3); }
    const bench = assets.models.painted_wooden_bench; adopt(bench);
    { bench.scale.setScalar(1.18); bench.position.set(layout.bench.x, 0, layout.bench.z); scene.add(bench);
      for (const dx of [-0.5, 0, 0.5]) block(layout.bench.x + dx, layout.bench.z, 0.45); aoBlob(layout.bench.x, layout.bench.z, 1.3, 0.5); }
    const cat = assets.models.concrete_cat_statue; adopt(cat);
    { const a = 0.92, r = layout.pools[0].r + 0.4, x = Math.cos(a) * r, z = Math.sin(a) * r; cat.scale.setScalar(0.44 / 0.28); cat.rotation.y = Math.atan2(x, z); cat.position.set(x, 0.67, z); scene.add(cat); }
  }
  // metal: light-tunnel frames, light stalks (from the exhibit) and rose arches; plus the festoon bulbs
  const tubeSegs = metalSegs.slice();
  if (!propParts.lantern_metal) for (const [x, z] of lanterns) tubeSegs.push([[x, 0, z], [x, 0.62, z], 0.02], [[x, 0.6, z], [x, 0.66, z], 0.05], [[x, 0.78, z], [x, 0.8, z], 0.06]);
  const roseArch = ([ax, az, tx, tz]) => {
    const nx = -tz, nz = tx, Wd = 1.7, frames = [], archPid = registerPlant('roseDA', ax, 0, az);
    for (const d of [-0.22, 0.22]) {
      const pts = [], bx = ax + tx * d, bz = az + tz * d;
      for (let i = 0; i <= 24; i++) { const u = i / 24; let off, y;
        if (u < 0.3) { off = -Wd; y = u / 0.3 * 2.1; } else if (u > 0.7) { off = Wd; y = (1 - u) / 0.3 * 2.1; } else { const a = Math.PI * (1 - (u - 0.3) / 0.4); off = Math.cos(a) * Wd; y = 2.1 + Math.sin(a) * 0.75; }
        pts.push(new V3(bx + nx * off, y, bz + nz * off)); }
      frames.push(pts); for (let i = 0; i < pts.length - 1; i++) tubeSegs.push([pts[i].toArray(), pts[i + 1].toArray(), 0.02]);
    }
    for (let i = 4; i <= 20; i += 2) tubeSegs.push([frames[0][i].toArray(), frames[1][i].toArray(), 0.012]);
    const L = LOOKS.roseDA, lr = LEAF_RECTS[L.leaf] || LEAF_RECTS.rose, lc = new THREE.Color(L.leafCol), archPal = pick(PALETTES.roseDA);
    for (let i = 0; i < (lite ? 200 : 420); i++) {
      const fi = rng() < 0.5 ? 0 : 1, u = rng() * 24, a = frames[fi][Math.floor(u)], b = frames[fi][Math.min(24, Math.floor(u) + 1)];
      _p.copy(a).lerp(b, u % 1).add(new V3(rr(-0.25, 0.25), rr(-0.2, 0.25), rr(-0.25, 0.25)));
      if (_p.y < 0.2) continue; curPid = archPid;
      _q.setFromEuler(new THREE.Euler(rr(-1, 1), rr(0, TAU), rr(-1, 1))); _s.set(L.leafIn[0] * IN * 1.15, L.leafIn[1] * IN * 1.15, IN);
      push(bucket(_p.x, _p.z).leafC, _p, _q, _s, _c.copy(lc).multiplyScalar(0.8 + 0.4 * rng()), lr);
    }
    for (let i = 0; i < 70; i++) {
      const fi = rng() < 0.5 ? 0 : 1, u = 3 + rng() * 18, a = frames[fi][Math.floor(u)], b = frames[fi][Math.floor(u) + 1];
      _p.copy(a).lerp(b, u % 1).add(new V3(rr(-0.2, 0.2), rr(-0.1, 0.2), rr(-0.2, 0.2))); curPid = archPid;
      _q.setFromEuler(new THREE.Euler(rr(-1.2, 1.2), rr(0, TAU), rr(-1.2, 1.2))); const d = L.flIn * IN * rr(0.95, 1.25); _s.set(d, d, d);
      push(bucket(_p.x, _p.z).rose, _p, _q, _s, _c.set(archPal[0]).multiplyScalar(rr(0.9, 1.08)), null, null, _c4.set(archPal[1]));
    }
    for (const s of [-1, 1]) addPlant('roseDA', ax + nx * s * (Wd + 0.3), az + nz * s * (Wd + 0.3), { scale: 0.75, salt: 9 });
  };
  for (const a of layout.arches) roseArch(a);
  for (const [x, z] of obelisks) { const w = 0.34, top = [x, 2.35, z], cs = [[-w, -w], [w, -w], [w, w], [-w, w]];   // a four-legged iron obelisk with a rose at its foot
    cs.forEach(([dx, dz], i) => { tubeSegs.push([[x + dx, 0, z + dz], top, 0.018]); for (const t of [0.3, 0.55, 0.78]) { const [ex, ez] = cs[(i + 1) % 4]; tubeSegs.push([[x + dx * (1 - t), 2.35 * t, z + dz * (1 - t)], [x + ex * (1 - t), 2.35 * t, z + ez * (1 - t)], 0.012]); } });
    tubeSegs.push([top, [x, 2.5, z], 0.03]); addPlant('roseDA', x, z, { scale: 1.05, salt: 3 }); }
  {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, false).translate(0, 0.5, 0), n = tubeSegs.length, im = new THREE.InstancedMesh(geo, metalMat, n);
    const m = new THREE.Matrix4(), a = new V3(), b = new V3(), q = new Q(), s = new V3();
    tubeSegs.forEach(([A, Bp, r], i) => { a.fromArray(A); b.fromArray(Bp).sub(a); const len = b.length(); q.setFromUnitVectors(_Y, b.normalize()); s.set(r, len, r); m.compose(a, q, s); im.setMatrixAt(i, m); });
    im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im);
  }
  {   // small glass bulbs on the tunnel's festoons: the sprite glow sits on top of these
    const mat = new THREE.ShaderMaterial({ uniforms: Object.assign({}, U),
      vertexShader: COMMON + `varying vec3 vC; varying vec3 vN; varying vec3 vW;
        void main(){ vec4 w = instanceMatrix * vec4(position, 1.0); vW = w.xyz; vN = normal; vC = instanceColor * drainAt(w.xyz) * uLightGain; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: COMMON + `varying vec3 vC; varying vec3 vN; varying vec3 vW;
        void main(){ float f = max(dot(normalize(vN), normalize(cameraPosition - vW)), 0.0); vec3 col = vC * (0.6 + 2.6 * f * f) + (uAmb + uSun * 0.4) * (1.0 - f) * 0.5; gl_FragColor = vec4(mix(uFogColor, gshift(col, vW), fogF(distance(cameraPosition, vW))), 1.0); }` });
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.021, 10, 8), mat, bulbs.length), m = new THREE.Matrix4(), c = new THREE.Color();
    bulbs.forEach(([x, y, z, col], i) => { m.makeTranslation(x, y, z); im.setMatrixAt(i, m); im.setColorAt(i, c.setRGB(col[0], col[1], col[2])); });
    im.frustumCulled = false; scene.add(im);
    if (propParts.lantern_metal && propParts.lantern_glass && lanterns.length) {   // Blender path lanterns: dark metal, glowing glass
      const Ms = lanterns.map(([x, z]) => new THREE.Matrix4().makeRotationY(rng() * TAU).setPosition(x, 0, z));
      instanced(propParts.lantern_metal, metalMat, Ms); instanced(propParts.lantern_glass, mat, Ms, lanterns.map(l => new THREE.Color(l[2][0] * 1.5, l[2][1] * 1.5, l[2][2] * 1.5))).castShadow = false; }
  }

  // ---------------------------------------------------------------- trees: limbs fused in Blender with scanned bark; canopies of leafy twigs, a species each
  const TREES = [], treeSp = {};
  const BELT = [];   // the trees that stood just outside the brick wall have gone with it: the wood (field.js) begins beyond the walling yards
  {
    const BK = TX.bark_brown_02;
    const barkMat = P.std({ map: BK.diff, normalMap: BK.nor, aoMap: BK.arm, roughnessMap: BK.arm, roughness: 1, normalScale: new THREE.Vector2(1.3, 1.3) }, { sway: 0.02, swayH: 9, key: 'bark' });
    // every species' twig is a cell of one atlas; each leaf on it is coloured, and dropped, by the pigment model (senescence.js, leaves.js)
    U.uLeafAux = { value: TX.trees_atlas_m };
    const leafM = P.std(cut({ map: TX.trees_atlas, normalMap: TX.trees_atlas_n, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.62, envMapIntensity: 0.45 }),
      { sway: 0.1, swayH: 6, translucent: true, key: 'treeleaf', grow: true, part: 'leaf', puff: true, atlas: true, extra: sh => patchCanopy(sh, U, false) });
    const leafD = P.depth(TX.trees_atlas, { sway: 0.1, swayH: 6, key: 'treeleaf', grow: true, part: 'leaf', atlas: true, extra: sh => patchCanopy(sh, U, true) });
    const spOf = T => SP_INDEX[T.sp || (T.kind === 'weep' ? 'willow' : 'lime')];
    const addTree = (T, pid, inside) => { TREES.push({ x: T.x, z: T.z, gy: heightAt(T.x, T.z), A: T.A, B: T.B, cy: T.cy, sp: spOf(T), pid, inside, k: T.k || 1 }); treeSp[pid] = spOf(T); };
    const pos = [], uvs = [], idx = [], cards = [];
    const limb = (pts, r0, r1, flare = 0, sides = 10) => {   // pts: V3[]; a smooth tube along a Catmull-Rom curve
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), len = curve.getLength(), n = Math.max(3, Math.ceil(len / (r0 > 0.08 ? 0.3 : 0.22))), base = pos.length / 3;
      const uRep = Math.max(1, Math.round(TAU * (r0 + r1) / 2 / 0.75)); let nrm = null; const tan = new V3(), bin = new V3(), pt = new V3(), prevT = new V3(), ph = rng() * TAU;
      for (let j = 0; j <= n; j++) {
        const t = j / n; curve.getPointAt(t, pt); curve.getTangentAt(t, tan);
        if (!nrm) nrm = new V3().crossVectors(tan, Math.abs(tan.y) < 0.9 ? _Y : _X).normalize(); else { const ax = new V3().crossVectors(prevT, tan), s = ax.length(); if (s > 1e-5) nrm.applyAxisAngle(ax.multiplyScalar(1 / s), Math.asin(Math.min(1, s))); }
        prevT.copy(tan); bin.crossVectors(tan, nrm).normalize(); nrm.crossVectors(bin, tan).normalize();
        const r = lerp(r0, r1, Math.pow(t, 0.8));
        for (let i = 0; i <= sides; i++) { const a = i / sides * TAU, fl = flare ? 1 + flare * Math.exp(-Math.max(pt.y, 0) * 3.4) * (0.62 + 0.38 * Math.cos(5 * a + ph)) : 1, lump = 1 + 0.05 * Math.sin(a * 3 + t * 9 + ph);
          pos.push(pt.x + (Math.cos(a) * nrm.x + Math.sin(a) * bin.x) * r * fl * lump, pt.y + (Math.cos(a) * nrm.y + Math.sin(a) * bin.y) * r * fl * lump, pt.z + (Math.cos(a) * nrm.z + Math.sin(a) * bin.z) * r * fl * lump); uvs.push(i / sides * uRep, t * len / 0.75); }
      }
      for (let j = 0; j < n; j++) for (let i = 0; i < sides; i++) { const a = base + j * (sides + 1) + i, b = a + 1, c = a + sides + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
      return curve;
    };
    const growTree = (T, detail) => {
      const tr = PlantArt.rngOf((Math.floor(T.x * 131 + T.z * 71) >>> 0) + 5), R = (a, b) => a + (b - a) * tr();
      const r0 = 0.15 * T.s + 0.07, top = new V3(T.x + R(-0.25, 0.25), T.h + 0.5, T.z + R(-0.25, 0.25));
      const tpid = registerPlant('tree', T.x, 0, T.z, T.x, T.cy, T.z);
      const trunk = limb([new V3(T.x, -0.2, T.z), new V3(T.x + R(-0.06, 0.06), T.h * 0.35, T.z + R(-0.06, 0.06)), new V3(T.x + R(-0.12, 0.12), T.h * 0.7, T.z + R(-0.12, 0.12)), top], r0, r0 * 0.6, 1.5, 14);
      block(T.x, T.z, r0 + 0.32); aoBlob(T.x, T.z, 1.1, 0.6); aoBlob(T.x, T.z, T.A * 1.25, 0.26);
      addTree(T, tpid, layout.inWalls(T.x, T.z));
      const leafAt = (p, dir, s, c = R(0.82, 1.14)) => cards.push({ p: p.clone(), dir: dir.clone(), s, pid: tpid, c, sp: spOf(T), e: Math.min(1, Math.max(0, (c - 0.4) / 0.7)) });
      const nP = 6 + Math.floor(tr() * 3);
      for (let k = 0; k < nP; k++) {
        const th = k / nP * TAU + R(-0.35, 0.35), el = T.kind === 'weep' ? R(0.2, 0.7) : R(-0.1, 0.75), t0 = k === 0 ? 1 : R(0.55, 0.98);
        const st = trunk.getPointAt(t0), tip = new V3(T.x + Math.cos(th) * T.A * 0.78 * Math.cos(el), T.cy + T.B * 0.7 * Math.sin(el), T.z + Math.sin(th) * T.A * 0.78 * Math.cos(el));
        if (k === 0) tip.set(T.x + R(-0.4, 0.4), T.cy + T.B * 0.8, T.z + R(-0.4, 0.4));
        const mid = st.clone().lerp(tip, 0.5).add(new V3(R(-0.2, 0.2), T.A * 0.14, R(-0.2, 0.2))), rp = r0 * R(0.34, 0.46);
        const prim = limb([st, st.clone().lerp(mid, 0.5).add(new V3(0, 0.1, 0)), mid, tip], rp, 0.022, 0, 8);
        const nS = detail > 0.6 ? 4 : 2;
        for (let j = 0; j < nS; j++) {
          const u = R(0.3, 0.92), sp = prim.getPointAt(u), tg = prim.getTangentAt(u), d = new V3(R(-1, 1), R(-0.25, 0.8), R(-1, 1)).normalize().lerp(tg, 0.45).normalize(), L = T.A * R(0.3, 0.52);
          const e = sp.clone().addScaledVector(d, L); e.y -= L * 0.12;
          const sec = limb([sp, sp.clone().lerp(e, 0.5).add(new V3(0, L * 0.12, 0)), e], rp * (1 - u) * 0.7 + 0.014, 0.008, 0, 6);
          const nT = Math.round(5 * detail) + 2;
          for (let q2 = 0; q2 < nT; q2++) { const v = R(0.25, 1), tp = sec.getPointAt(v), tt = sec.getTangentAt(v); leafAt(tp, new V3(R(-1, 1), R(-0.7, 0.35), R(-1, 1)).normalize().lerp(tt, 0.35).normalize(), R(0.62, 0.95)); }
        }
        for (let q2 = 0; q2 < Math.round(7 * detail) + 2; q2++) { const v = R(0.45, 1), tp = prim.getPointAt(v), tt = prim.getTangentAt(v); leafAt(tp, new V3(R(-1, 1), R(-0.6, 0.5), R(-1, 1)).normalize().lerp(tt, 0.3).normalize(), R(0.65, 1.0)); }
      }
      // fill the crown's outer shell so the canopy reads as a solid, layered mass
      // ... with darker boughs deeper in, so little sky shows through the middle
      for (let i = 0; i < Math.round(170 * detail); i++) { const d = new V3(R(-1, 1), R(-0.4, 1), R(-1, 1)).normalize(), k = R(0.15, 0.6);
        leafAt(new V3(T.x + d.x * T.A * k, T.cy + d.y * T.B * k - 0.2, T.z + d.z * T.A * k), new V3(R(-1, 1), R(-0.6, 0.6), R(-1, 1)).normalize(), R(0.9, 1.3), R(0.42, 0.62)); }
      const nFill = Math.round((420 + T.A * 130) * detail);
      for (let i = 0; i < nFill; i++) {
        const d = new V3(R(-1, 1), R(-0.55, 1), R(-1, 1)); if (d.lengthSq() > 1 || d.lengthSq() < 0.05) { i--; continue; } d.normalize();
        const k = R(0.55, 0.98), p = new V3(T.x + d.x * T.A * k, T.cy + d.y * T.B * k, T.z + d.z * T.A * k);
        leafAt(p.addScaledVector(d, -0.3), new V3(d.x * 0.8 + R(-0.4, 0.4), R(-0.75, 0.1), d.z * 0.8 + R(-0.4, 0.4)).normalize(), R(0.7, 1.05) * (detail < 0.6 ? 1.5 : 1));
      }
    };
    // --- trees from Blender: three variants, each a fused trunk-and-limb mesh plus a few thousand boughs with baked sky shading
    const TV = {}, VAR = ['tree_round_a', 'tree_round_b', 'tree_weep', 'tree_birch', 'tree_oak', 'tree_cone'];
    const NOM = { tree_round_a: [3.25, 7.0], tree_round_b: [3.25, 7.0], tree_weep: [3.25, 7.0], tree_birch: [2.1, 8.1], tree_oak: [4.0, 6.8], tree_cone: [2.5, 8.2] };   // each form's crown radius and top (build_trees.py)
    if (assets.models.trees) assets.models.trees.traverse(o => { if (!o.isMesh) return; const m = /^(tree_.+)_(woodlo|wood|leaves)$/.exec(o.name); if (m) (TV[m[1]] = TV[m[1]] || {})[m[2]] = o.geometry; });
    const blender = VAR.every(k => TV[k] && TV[k].wood && TV[k].leaves && TV[k].leaves.index && TV[k].leaves.attributes.uv), vCards = {}, woodM = {};
    const cardsOf = g => {   // each bough is a quad in the file; recover its frame (base, across, along) so it can be instanced
      const Pa = g.attributes.position, UVa = g.attributes.uv, Ca = g.attributes.color, I = g.index.array, out = [];
      for (let t = 0; t + 5 < I.length; t += 6) { const ids = [...new Set([I[t], I[t + 1], I[t + 2], I[t + 3], I[t + 4], I[t + 5]])]; if (ids.length !== 4) continue; let bl, br, tl, tr;
        for (const i of ids) { const p = new V3().fromBufferAttribute(Pa, i), right = UVa.getX(i) > 0.5, top = UVa.getY(i) < 0.5; if (top) { if (right) tr = p; else tl = p; } else if (right) br = p; else bl = p; }
        if (!bl || !br || !tl || !tr) continue;
        const base = bl.clone().add(br).multiplyScalar(0.5), x = br.clone().sub(bl), y = tl.clone().add(tr).multiplyScalar(0.5).sub(base), z = new V3().crossVectors(x, y).normalize().multiplyScalar(x.length());
        out.push({ m: new THREE.Matrix4().makeBasis(x, y, z).setPosition(base), c: Ca ? Ca.getX(ids[0]) : 1 }); }
      return out; };
    const woodC = {};
    if (blender) for (const k of VAR) { vCards[k] = cardsOf(TV[k].leaves); woodM[k] = []; woodC[k] = []; woodM[k + '~'] = []; woodC[k + '~'] = []; }
    // a bough in its tree: it stays where the tree's shape puts it and keeps its heading, but its size is its own times kL in every direction
    const _bx = new V3(), _by = new V3(), _bz = new V3(), _bp = new V3();
    const boughM = (M, cm, kL) => { const W = M.clone().multiply(cm); _bx.setFromMatrixColumn(cm, 0); const s0 = _bx.length() * kL;
      _bx.setFromMatrixColumn(W, 0); _by.setFromMatrixColumn(W, 1).normalize(); _bp.setFromMatrixPosition(W);
      _bx.addScaledVector(_by, -_bx.dot(_by)).normalize(); _bz.crossVectors(_bx, _by);
      return W.makeBasis(_bx.multiplyScalar(s0), _by.multiplyScalar(s0), _bz.multiplyScalar(s0)).setPosition(_bp); };
    const plantTree = (T, thin, far) => {
      const tpid = registerPlant('tree', T.x, 0, T.z, T.x, T.cy, T.z), r0 = 0.15 * T.s + 0.07;
      block(T.x, T.z, r0 + 0.32); aoBlob(T.x, T.z, 1.1, 0.6); aoBlob(T.x, T.z, T.A * 1.25, 0.26);
      const k = T.kind === 'weep' ? VAR[2] : T.kind === 'birch' ? VAR[3] : T.kind === 'oak' ? VAR[4] : T.kind === 'cone' ? VAR[5] : VAR[ihash(Math.floor(T.x * 7), Math.floor(T.z * 7), 3) < 0.5 ? 0 : 1];
      const sxz = T.A / NOM[k][0], M = new THREE.Matrix4().compose(new V3(T.x, heightAt(T.x, T.z), T.z), new Q().setFromAxisAngle(_Y, rng() * TAU), new V3(sxz, (T.cy + T.B) / NOM[k][1], sxz));
      // leaves keep proportion with their tree: one scale per tree (its linear size against the form it was grown from), the same along
      // every axis, so a tall narrow tree's leaves are not stretched and a tree twice the size carries leaves twice the size
      const sy = (T.cy + T.B) / NOM[k][1], kL = Math.cbrt(sxz * sxz * sy); T.k = kL;
      { const wk = far && TV[k].woodlo ? k + '~' : k; woodM[wk].push(M); woodC[wk].push(HABIT[T.sp || (T.kind === 'weep' ? 'willow' : 'lime')].bark); } addTree(T, tpid, layout.inWalls(T.x, T.z));
      // how much sky a bough sees (baked in Blender) is how sunlit its leaves are: the outside of the crown turns first and reddest
      vCards[k].forEach((c, i) => { if (thin > 1 && (i >> 1) % thin) return; cards.push({ M: boughM(M, c.m, kL), pid: tpid, c: Math.min(1.3, c.c * 1.4) * rr(0.92, 1.08), s: 1, sp: spOf(T), e: Math.pow(Math.min(1, Math.max(0, (c.c - 0.3) / 0.7)), 1.2) }); });
    };
    if (blender) {
      const thin = lite ? 2 : 1;
      for (const T of treeSpecs) plantTree(T, thin);
      // the borrowed landscape beyond the wall: bigger trees of the grove's species, so the skyline turns over six weeks
      for (const [x, z, A, sp] of [...BELT, ...FIELD_TREES]) { const kind = HABIT[sp].kind, h = rr(3.4, 4.6), tall = kind === 'cone' || kind === 'birch' ? 1.5 : kind === 'oak' ? 0.8 : 1, wide = kind === 'cone' || kind === 'birch' ? 0.7 : kind === 'oak' ? 1.12 : 1;
        // the first rank of the wood, which you work beside, is grown in full; the rest stand on plainer limbs, and carry every bough too
        // unless the graphics setting says half. A bough is never enlarged to fill a crown: where more cover is wanted, it gets more leaves.
        const far = beyondWall(x, z) > 20;
        plantTree({ x, z, h, s: rr(1.2, 1.7), cy: h + rr(1.8, 2.6) * tall, A: A * wide, B: A * rr(0.75, 0.95) * tall, kind, sp }, far && !woodFull ? thin * 2 : thin, far); }
      const barkT = P.std({ map: BK.diff, normalMap: BK.nor, roughness: 1, vertexColors: true, color: new THREE.Color(1.25, 1.2, 1.15) }, { tri: { arm: BK.arm, scale: 0.9, moss: 0.4 }, sway: 0.02, swayH: 9, key: 'barkT' });
      const bc = new THREE.Color();
      for (const k of [...VAR, ...VAR.map(v => v + '~')]) { if (!woodM[k].length) continue; const lo = k.endsWith('~'), im = new THREE.InstancedMesh(lo ? TV[k.slice(0, -1)].woodlo : TV[k].wood, barkT, woodM[k].length); woodM[k].forEach((M, i) => { im.setMatrixAt(i, M); im.setColorAt(i, bc.setRGB(...woodC[k][i])); }); im.castShadow = im.receiveShadow = true; im.frustumCulled = false; scene.add(im); }
    } else
    for (const T of treeSpecs) growTree(T, lite ? 0.55 : 1);
    // a belt of trees beyond the wall
    if (!blender) for (const [x, z, A, sp] of [...BELT, ...FIELD_TREES]) { const h = rr(3.4, 4.6); growTree({ x, z, h, s: rr(1.2, 1.7), cy: h + rr(1.8, 2.6), A, B: A * rr(0.75, 0.95), kind: 'round', sp }, lite ? 0.3 : 0.5); }
    const wood = new THREE.BufferGeometry(); wood.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); wood.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); wood.setIndex(idx); wood.computeVertexNormals();
    if (idx.length) { const wm = new THREE.Mesh(wood, barkMat); wm.castShadow = wm.receiveShadow = true; wm.frustumCulled = false; scene.add(wm); }
    const g = cardGeo.clone(); g.setAttribute('aPlant', new THREE.InstancedBufferAttribute(Float32Array.from(cards.map(c => c.pid)), 1));
    g.setAttribute('aRect', new THREE.InstancedBufferAttribute(Float32Array.from(cards.flatMap(c => twigRect(c.sp))), 4)); g.setAttribute('aLeaf', new THREE.InstancedBufferAttribute(Float32Array.from(cards.flatMap(c => [c.e, rng()])), 2));
    const im = new THREE.InstancedMesh(g, leafM, cards.length), m = new THREE.Matrix4(), q = new Q(), s = new V3(), yv = new V3(), zv = new V3(), xv = new V3(), bm = new THREE.Matrix4(), col = new THREE.Color();
    cards.forEach((c, i) => {
      if (c.M) { im.setMatrixAt(i, c.s === 1 ? c.M : m.copy(c.M).scale(s.setScalar(c.s))); im.setColorAt(i, col.setRGB(c.c, c.c, c.c)); return; }
      yv.copy(c.dir); zv.set(rr(-0.5, 0.5), 1, rr(-0.5, 0.5)); zv.addScaledVector(yv, -zv.dot(yv)); if (zv.lengthSq() < 1e-4) zv.set(1, 0, 0); zv.normalize(); xv.crossVectors(yv, zv);
      bm.makeBasis(xv, yv, zv); q.setFromRotationMatrix(bm); s.setScalar(c.s); m.compose(c.p, q, s); im.setMatrixAt(i, m); im.setColorAt(i, col.setRGB(c.c, c.c, c.c));
    });
    im.customDepthMaterial = leafD; im.castShadow = im.receiveShadow = true; im.frustumCulled = false; scene.add(im);
    console.log(`[garden] trees: ${blender ? 'Blender variants' : 'procedural'}, ${cards.length} boughs`);
  }

  // ---------------------------------------------------------------- planting
  const keepOut = [...layout.lamps.map(([x, z]) => [x, z, 0.45]), [layout.bench.x, layout.bench.z + 0.9, 2.9], ...treeSpecs.map(T => [T.x, T.z, 0.85])];
  const clear = (x, z) => { for (const [kx, kz, kr] of keepOut) if ((x - kx) ** 2 + (z - kz) ** 2 < kr * kr) return false; return true; };
  // ---------------------------------------------------------------- planting design
  // Layered, matrix-style planting (after Oudolf & Kingsbury's "Planting: A New Perspective", Rainer & West's "Planting in
  // a Post-Wild World", Dunnett's naturalistic schemes), held inside the clipped English frame of hedges, box and yew:
  //   structure  ~10%  long-lived plants with strong form, in odd-numbered groups on a steady beat: the bones of the bed;
  //   theme      ~30%  the showy seasonal plants, in long, thin, interlocking drifts (Jekyll) that recur along the bed;
  //   scatter     ~5%  see-through and self-seeding emergents dotted singly, front included, so no bed is a staircase;
  //   matrix     ~55%  a low, knitting ground layer, mostly a grass, filling every gap: a "green mulch", no bare soil.
  // Each bed's palette suits its aspect (right plant, right place); Verbena bonariensis, Calamagrostis and the alliums
  // recur in every bed so the garden reads as one. Seed heads and grasses stand through winter.
  const SCHEMES = {
    // north wall, facing south, the hottest and driest spot: a gravel-garden mix of silvers, blues and lilacs (Beth Chatto)
    dry:    { matrix: [['sesleria', 0.5], ['nepeta', 0.3], ['thymus', 0.2]], structure: [['perovskia'], ['schizachyrium'], ['calamagrostis']],
              theme: ['achillea', 'agastache', 'stachys', 'sedum', 'echinops', 'salvia', 'lavandula', 'liatris', 'amsonia'], scatter: ['verbena', 'alliumS', 'papaver', 'alliumG'] },
    // east wall, facing west into the evening sun: late-summer prairie in hot colours (Oudolf's Lurie Garden, Hermannshof)
    hot:    { matrix: [['sporobolus', 0.6], ['coreopsis', 0.25], ['gaillardia', 0.15]], structure: [['calamagrostis'], ['panicum'], ['eutrochium']],
              theme: ['helenium', 'rudbeckia', 'heliopsis', 'echinacea', 'achillea', 'hemerocallis', 'asclepias', 'monardaF', 'solidago'], scatter: ['verbena', 'knautia', 'alliumS'] },
    // west wall, facing the morning sun: a cool Oudolf mix of blues, purples, plums and pinks
    cool:   { matrix: [['sesleria', 0.45], ['geranium', 0.35], ['deschampsia', 0.2]], structure: [['calamagrostis'], ['baptisia', 'amsonia'], ['eutrochium']],
              theme: ['salvia', 'veronica', 'echinacea', 'monardaJ', 'phloxJ', 'persicaria', 'sanguisorba', 'agastache', 'aster', 'liatris'], scatter: ['verbena', 'alliumS', 'knautia', 'alliumG'] },
    // south wall, facing north, in its shadow: a green-and-white woodland-edge planting
    shade:  { matrix: [['hakonechloa', 0.5], ['alchemilla', 0.3], ['geranium', 0.2]], structure: [['hydrangea'], ['molinia']],
              theme: ['astrantia', 'anemone', 'digitalis', 'aquilegia', 'phloxR', 'leucanthemum'], scatter: ['digitalis', 'aquilegia'] },
    // the entrance double border: high-summer pinks and plums, mirrored across the walk
    avenue: { matrix: [['nepeta', 0.4], ['geranium', 0.3], ['sesleria', 0.3]], structure: [['calamagrostis']],
              theme: ['phloxJ', 'echinacea', 'persicaria', 'sanguisorba', 'monardaJ', 'salvia', 'delphinium', 'lupinus', 'penstemon'], scatter: ['verbena', 'alliumG', 'alliumS', 'knautia'] },
  };
  const okK = k => LOOKS[k] && SIZE[k];
  for (const S of Object.values(SCHEMES)) { S.theme = S.theme.filter(okK); S.scatter = S.scatter.filter(okK); S.matrix = S.matrix.filter(([k]) => okK(k)); S.structure = S.structure.map(g => g.filter(okK)).filter(g => g.length); }
  const tallM = k => SIZE[k][0] * IN;
  const prefDepth = k => clamp((tallM(k) - 0.35) / 0.9, 0, 1);              // where in the bed's depth a plant of this height belongs
  const pickW = (list, h) => { let a = 0, t = list.reduce((s, [, w]) => s + w, 0) * h; for (const [k, w] of list) { a += w; if (t < a) return k; } return list[list.length - 1][0]; };
  const bedCount = {};
  const placeOne = (k, x, z, salt, kk, ok, scale = 1) => {
    if (!k || blocked(x, z) || !clear(x, z) || (ok && !ok(x, z))) return false;
    const r = radiusOf(k) * 0.9 * scale; if (!spaceOk(x, z, r, kk)) return false;
    claim(x, z, r); addPlant(k, x, z, { salt, scale }); bedCount[k] = (bedCount[k] || 0) + 1; return true;
  };
  // a bed is a strip: pos(u, d) maps distance along it and depth into it to the ground; D(u) is its depth there
  function layeredBed(S, { U, D, pos, salt, mirror = null, step = 0.27, rhythm = 3.6, ok = null }) {
    const put = (k, u, d, kk, sc = 1) => { const [x, z] = pos(u, d); const done = placeOne(k, x, z, salt, kk, ok, sc); if (done && mirror) { const [mx, mz] = mirror(x, z); placeOne(k, mx, mz, salt + 7, kk, ok, sc); } return done; };
    // 1. structure: odd-numbered groups on a steady beat, every third group stepping forward
    for (let i = 0, u = rhythm * 0.5; u < U; u += rhythm, i++) {
      const g = S.structure[i % S.structure.length], k = g[Math.floor(ihash(i, salt, 5) * g.length)], Dm = D(u); if (!k || Dm < 1.0) continue;
      const d = Math.min(Dm - 0.4, Dm * (i % 3 === 2 ? 0.38 : 0.7)), n = radiusOf(k) < 0.4 ? 3 : 1;
      for (let j = 0; j < n; j++) { const a = j / n * TAU + i; put(k, u + (n > 1 ? Math.cos(a) * 0.36 : 0), d + (n > 1 ? Math.sin(a) * 0.36 : 0), 0.7); }
    }
    const cand = [];
    for (let u = 0; u < U; u += step) { const Dm = D(u); for (let d = 0.1; d < Dm - 0.12; d += step) cand.push([u + rr(-0.1, 0.1), d + rr(-0.09, 0.09), Dm]); }
    // 2. scatter: single emergents, tall and see-through, anywhere but the very edge
    if (S.scatter.length) for (const [u, d] of cand) if (d > 0.35 && ihash(Math.floor(u * 9), Math.floor(d * 9), salt + 3) < 0.035)
      put(S.scatter[Math.floor(ihash(Math.floor(u * 5), Math.floor(d * 5), salt) * S.scatter.length)], u, d, 0.55);
    // 3. theme: long diagonal drifts, broken into islands by the matrix
    for (const [u, d, Dm] of cand) {
      const f = d / Dm; if (f < 0.15) continue;                                // the front stays matrix: one clean ribbon along the path
      if (vn2(u * 0.33, d * 0.45, salt + 11) < 0.47) continue;
      const band = Math.floor((u + d * 1.7) / 1.5), L = S.theme, n = L.length, b0 = Math.floor(ihash(band, salt, 9) * n);
      for (let t = 0; t < n; t++) { const k = L[(b0 + t) % n]; if (Math.abs(prefDepth(k) - f) < 0.38) { put(k, u, d, 0.84); break; } }
    }
    // 4. matrix: everything left
    for (const [u, d] of cand) put(pickW(S.matrix, ihash(Math.floor(u * 7), Math.floor(d * 7), salt + 1)), u, d, 0.6, 1.2);   // planted tight and grown on, so it closes over the soil
  }
  // which border a point belongs to, by the wall it backs onto (and so by its aspect); a little noise softens the corners
  const aspectAt = (x, z) => { const w = (vn2(x * 0.12, z * 0.12, 41) - 0.5) * 3;
    const c = [['dry', z - B.z0 + w], ['shade', B.z1 - z - w], ['cool', x - B.x0 - w * 0.5], ['hot', B.x1 - x + w * 0.5]]; return c.reduce((a, b) => b[1] < a[1] ? b : a)[0]; };
  // the wall borders round the loop walk, split into runs by aspect
  { const S0 = layout.loopS, n = S0.length, ds = layout.loopLen / n, front = 1.8;
    const depth = S0.map(s => { let d = front; while (d < 12 && layout.inWalls(s.x + s.ox * d, s.z + s.oz * d, 0.42)) d += 0.1; return Math.max(0, d - front - 0.1); });
    const asp = S0.map(s => aspectAt(s.x + s.ox * 4, s.z + s.oz * 4));
    let i0 = asp.findIndex((a, i) => a !== asp[(i - 1 + n) % n]); if (i0 < 0) i0 = 0;
    const gateOk = (x, z) => !(Math.abs(x) < 4.5 && z > 49.8) && layout.inWalls(x, z, 0.42);
    for (let k = 0, run = 0; k < n; run++) {
      const a = asp[(i0 + k) % n], idx = []; while (k < n && asp[(i0 + k) % n] === a) idx.push((i0 + k++) % n);
      const at = u => idx[clamp(Math.round(u / ds), 0, idx.length - 1)];
      layeredBed(SCHEMES[a], { U: idx.length * ds, D: u => depth[at(u)], pos: (u, d) => { const s = S0[at(u)]; return [s.x + s.ox * (front + d), s.z + s.oz * (front + d)]; }, salt: 23 + run * 17, ok: gateOk });
    } }
  // the entrance double border, mirrored across the walk: Calamagrostis standing in pairs like a colonnade
  layeredBed(SCHEMES.avenue, { U: AV.z1 - AV.z0 - 0.2, D: () => AV.x1 - AV.x0, pos: (u, d) => [AV.x0 + d, AV.z0 + 0.1 + u], mirror: (x, z) => [-x, z], salt: 11, rhythm: 2.0 });
  // canal: lavender walks
  for (const s of [-1, 1]) for (let z = CN.z0; z <= CN.z1; z += 0.42) for (const x of [3.8, 4.28]) { const k = (Math.floor(z / 0.42) % 9 === 0) ? 'nepeta' : 'lavandula'; addPlant(k, s * x + rr(-0.05, 0.05), z + (x > 4 ? 0.21 : 0), { scale: 1.1 }); }
  // parterre: crisp lavender edging inside the box; within it roses on a regular beat through a matrix of catmint and lady's mantle, alliums rising through
  { const rm = (ring.bedIn + ring.bedOut) / 2;
    for (let q = 0; q < 4; q++) for (let a = q * Math.PI / 2 + 0.2; a < (q + 1) * Math.PI / 2 - 0.15; a += 1.35 / rm) { const x = Math.cos(a) * rm, z = Math.sin(a) * rm; if (Math.abs(x) > 2.2 && Math.abs(z) > 2.2) placeOne('roseDA', x, z, q, 0.7); }
    for (let q = 0; q < 4; q++) for (let r = ring.bedIn + 0.38; r <= ring.bedOut - 0.3; r += 0.38) for (let a = q * Math.PI / 2; a < (q + 1) * Math.PI / 2; a += 0.38 / r) {
      const x = Math.cos(a) * r + rr(-0.08, 0.08), z = Math.sin(a) * r + rr(-0.08, 0.08);
      if (Math.abs(x) < 2.05 || Math.abs(z) < 2.05) continue;
      const edge = r < ring.bedIn + 0.6 || r > ring.bedOut - 0.6, h = ihash(Math.floor(x * 6), Math.floor(z * 6), 77);
      const k = edge ? 'lavandula' : h < 0.07 ? 'alliumG' : h < 0.12 ? 'alliumS' : h < 0.15 ? 'verbena' : h < 0.72 ? 'nepeta' : 'alchemilla';
      placeOne(k, x, z, q, edge ? 0.75 : 0.62, null, edge || k === 'alliumG' || k === 'alliumS' || k === 'verbena' ? 1 : 1.15);
    } }
  // wildflowers in the long grass
  for (const md of layout.meadows) {
    const n = Math.floor(md.r * md.r * (lite ? 1.6 : 3.4));
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, d = md.r * Math.sqrt(rng()) * 0.95, x = md.x + Math.cos(a) * d, z = md.z + Math.sin(a) * d;
      if (layout.distToPath(x, z) < 1.9 || !clear(x, z)) continue;
      addFlowerStalk(drift(x, z, ['echinacea', 'leucanthemum', 'rudbeckia', 'liatris', 'knautia', 'achillea', 'papaver', 'coreopsis'], 2.2, 300), x, z, rr(0.35, 0.85), rr(0.45, 0.7));
    }
    // and clumps of prairie grass through it: the meadow's own matrix
    for (let i = 0; i < Math.floor(md.r * md.r * 0.9); i++) { const a = rng() * TAU, d = md.r * Math.sqrt(rng()) * 0.92, x = md.x + Math.cos(a) * d, z = md.z + Math.sin(a) * d;
      if (layout.distToPath(x, z) > 2.0) placeOne(rng() < 0.6 ? 'sporobolus' : 'schizachyrium', x, z, 300 + i, 0.9); }
  }
  console.log('[garden] planting by species: ' + Object.entries(bedCount).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ' ' + n).join(', '));
  // low ground cover between plants in the beds
  {
    const pts = [], add = (x, z) => { if (!blocked(x, z) && clear(x, z)) pts.push([x, z]); }, dens = lite ? 5 : 9;   // the matrix does most of the covering now
    for (const s of layout.loopS) for (let i = 0; i < 2 * dens; i++) { const d = rr(1.7, 5.6), x = s.x + s.ox * d + rr(-0.25, 0.25), z = s.z + s.oz * d + rr(-0.25, 0.25); if (layout.inWalls(x, z, 0.4) && !(Math.abs(x) < 4.4 && z > 49.8)) add(x, z); }
    for (const s of [-1, 1]) for (let i = 0; i < 8 * 3.7 * dens; i++) add(s * rr(AV.x0 - 0.1, AV.x1 + 0.1), rr(AV.z0, AV.z1));
    for (let i = 0; i < 220 * dens; i++) { const a = rng() * TAU, r = Math.sqrt(rr((ring.bedIn + 0.3) ** 2, (ring.bedOut - 0.25) ** 2)), x = Math.cos(a) * r, z = Math.sin(a) * r; if (Math.abs(x) > 2.0 && Math.abs(z) > 2.0) add(x, z); }
    const mat = P.std(cut({ map: TX.card_cover, normalMap: TX.card_cover_n, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5 }), { sway: 0.3, key: 'cover', grow: true, part: 'leaf', translucent: true });
    const cg = new THREE.PlaneGeometry(1, 1); cg.setAttribute('aPlant', new THREE.InstancedBufferAttribute(Float32Array.from(pts.map(([x, z]) => nearestPid(x, z))), 1));
    const im = new THREE.InstancedMesh(cg, mat, pts.length), m = new THREE.Matrix4(), q = new Q(), sc = new V3(), c = new THREE.Color(), p = new V3();
    pts.forEach(([x, z], i) => {
      const tuft = i % 5 < 2, k = tuft ? rr(0.3, 0.55) : rr(0.3, 0.52); sc.set(k, k, k);   // two in five stand up as leafy tufts, filling between the plants; the rest lie as rosettes
      q.setFromEuler(new THREE.Euler(tuft ? -rr(0.25, 0.85) : -Math.PI / 2 + rr(-0.6, 0.6), rng() * TAU, rr(-0.45, 0.45), 'YXZ'));
      m.compose(p.set(x, tuft ? k * 0.4 : rr(0.04, 0.2), z), q, sc); im.setMatrixAt(i, m); const b = tuft ? rr(0.5, 0.82) : rr(0.5, 0.95); im.setColorAt(i, c.setRGB(b * rr(0.85, 1.05), b, b * rr(0.8, 1)));
    });
    im.customDepthMaterial = P.depth(TX.card_cover, { sway: 0.3, key: 'cover', grow: true, part: 'leaf' }); im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false; scene.add(im);
  }
  maskTex.needsUpdate = true; mask2Tex.needsUpdate = true;

  // ---------------------------------------------------------------- bake the plant buckets into instanced meshes
  const chunks = []; let instTotal = 0; const byType = {};
  // bk.ch, once set, is the chunk a bucket was last baked into: baking again replaces its meshes (that is how a planted bed grows)
  function bakeBucket(bk) {
    const ch = bk.ch || { x: bk.x, z: bk.z, meshes: [] };
    for (const M of ch.meshes) { scene.remove(M.mesh); M.mesh.geometry.dispose(); }
    ch.meshes = [];
    for (const type of TYPES) {
      const Bk = bk[type]; if (!Bk.n) continue;
      const n = Bk.n, perm = Array.from({ length: n }, (_, i) => i);
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
      const m = new Float32Array(n * 16), c = new Float32Array(n * 3), r = Bk.r.length ? new Float32Array(n * 4) : null, s = Bk.s.length ? new Float32Array(n * 2) : null, c2 = Bk.c2.length ? new Float32Array(n * 3) : null, pa = new Float32Array(n);
      for (let j = 0; j < n; j++) { const i = perm[j]; for (let e = 0; e < 16; e++) m[j * 16 + e] = Bk.m[i * 16 + e]; c[j * 3] = Bk.c[i * 3]; c[j * 3 + 1] = Bk.c[i * 3 + 1]; c[j * 3 + 2] = Bk.c[i * 3 + 2]; pa[j] = Bk.pid[i];
        if (r) for (let e = 0; e < 4; e++) r[j * 4 + e] = Bk.r[i * 4 + e]; if (s) { s[j * 2] = Bk.s[i * 2]; s[j * 2 + 1] = Bk.s[i * 2 + 1]; }
        if (c2) for (let e = 0; e < 3; e++) c2[j * 3 + e] = Bk.c2[i * 3 + e]; }
      const geo = GEOS[type].clone();
      if (r) geo.setAttribute('aRect', new THREE.InstancedBufferAttribute(r, 4));
      if (s) geo.setAttribute('aShape', new THREE.InstancedBufferAttribute(s, 2));
      geo.setAttribute('aPlant', new THREE.InstancedBufferAttribute(pa, 1));
      if (F3TYPES.includes(type)) geo.setAttribute('aCol2', new THREE.InstancedBufferAttribute(c2 || new Float32Array(n * 3).fill(1), 3));
      const mesh = new THREE.InstancedMesh(geo, MATS[type], n);
      mesh.instanceMatrix = new THREE.InstancedBufferAttribute(m, 16); mesh.instanceColor = new THREE.InstancedBufferAttribute(c, 3);
      mesh.customDepthMaterial = DEPTHS[type]; mesh.castShadow = mesh.receiveShadow = true; mesh.computeBoundingSphere();
      scene.add(mesh); ch.meshes.push({ mesh, n, type }); instTotal += n; byType[type] = (byType[type] || 0) + n;
    }
    if (!bk.ch) { bk.ch = ch; chunks.push(ch); }
    return ch;
  }
  { // the brook's own planting: sedges, iris, marsh marigold, ferns and the like along the banks, thick round the pond and thin inside the garden
    const rr = PlantArt.rngOf(90210), B = BROOK, ok = k => LOOKS[k] && SIZE[k];
    const WET = ['carex', 'carex', 'irisP', 'caltha', 'ligularia', 'filipendula', 'lobelia', 'astilbe', 'fern', 'fern', 'hosta', 'rodgersia', 'camassia', 'molinia', 'hakonechloa'].filter(ok), TALL = ['typha', 'typha', 'irisP', 'miscanthus', 'filipendula'].filter(ok);
    const put = (k, x, z, scale) => { if (!k || blocked(x, z) || nearBrook(x, z, 0.15)) return false; const r = radiusOf(k) * 0.9 * scale; if (!spaceOk(x, z, r, 0.7)) return false;
      claim(x, z, r); addPlant(k, x, z, { salt: 31, scale, y: heightAt(x, z) || 1e-4 }); return true; };
    for (let i = 4; i < B.n - 8; i++) { const inG = Math.abs(B.X[i]) < 27.6 && B.Z[i] < 55.5 && B.Z[i] > -31.5;
      for (const sd of [-1, 1]) { if (rr() > (inG ? 0.09 : 0.4)) continue; const o = sd * (B.HW[i] + B.BW[i] + 0.2 + rr() * rr() * 1.5), x = B.X[i] - B.TZ[i] * o, z = B.Z[i] + B.TX[i] * o;
        if (inG && layout.distToPath(x, z) < 1.7) continue; put(WET[Math.floor(rr() * WET.length)], x, z, 0.65 + 0.5 * rr()); } }
    for (let a = 0; a < 6.283; a += 0.055) { if (rr() > 0.8) continue; const tall = Math.sin(a * 2 + 1) > 0.2, R = B.pondR(a) + B.POND.bank + 0.15 + rr() * rr() * 2.2, list = tall && rr() < 0.6 ? TALL : WET;
      put(list[Math.floor(rr() * list.length)], B.POND.x + Math.cos(a) * R, B.POND.z + Math.sin(a) * R, 0.7 + 0.5 * rr()); }
    if (ok('gunnera')) { const a = Math.atan2(B.Z[0] - B.POND.z, B.X[0] - B.POND.x) + 2.5, R = B.pondR(a) + B.POND.bank + 1.6; put('gunnera', B.POND.x + Math.cos(a) * R, B.POND.z + Math.sin(a) * R, 0.85); }
  }
  for (const bk of buckets.values()) bakeBucket(bk);
  buckets.clear();
  console.log(`[garden] ${plantCount} plants, ${instTotal} plant instances in ${chunks.length} chunks ${JSON.stringify(byType)}`);

  // ---------------------------------------------------------------- the clocks
  const NP0 = PT.k.length, PW = 128, PCAP = NP0 + 4096, PH = Math.ceil(PCAP / PW);   // room for the plants you set out yourself
  const pa = new Float32Array(PW * PH * 4), ps = new Float32Array(PW * PH * 4);
  for (let i = 0; i < NP0; i++) pa.set([PT.bx[i], PT.by[i], PT.bz[i], flagsFor(PT.k[i])], i * 4);
  const texA = new THREE.DataTexture(pa, PW, PH, THREE.RGBAFormat, THREE.FloatType), texS = new THREE.DataTexture(ps, PW, PH, THREE.RGBAFormat, THREE.FloatType);
  for (const t of [texA, texS]) { t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; }
  U.uPlantA = { value: texA }; U.uPlantS = { value: texS }; U.uPlantW = { value: PW };
  const st = [0, 0, 0, 0], DOY0 = 165;   // the garden opens on 14 June
  function writeStates() {
    for (let i = 0, NP = PT.k.length; i < NP; i++) { const d = ((DOY0 + PT.tau[i]) % 365 + 365) % 365, own = PT.own[i], age = (own ? 0 : baseAge) + (PT.tau[i] - PT.planted[i]) / 365;
      if (PT.gone[i]) { ps[i * 4] = ps[i * 4 + 1] = 0; continue; }
      // a plant you set out: its size is its species' curve from the pot, held back by whatever crowds it
      plantState(PT.k[i], d, age, st, own ? sizeAt(PT.k[i], age, own) * PT.crowd[i] : undefined); ps[i * 4] = st[0]; ps[i * 4 + 1] = st[1]; ps[i * 4 + 2] = st[2]; ps[i * 4 + 3] = st[3];
      if (treeSp[i] !== undefined) { ps[i * 4 + 1] = d; ps[i * 4 + 3] = treeSp[i]; } }   // a tree's leaves read its own day and species (leaves.js)
    texS.needsUpdate = true;
    leafFall.update(T => ((DOY0 + PT.tau[T.pid]) % 365 + 365) % 365);
  }
  // the year's leaf model: a table of every leaf class's pigments by day, and each species' fall
  const leafTab = new THREE.DataTexture(new Uint8Array((ND + 1) * SPECIES.length * NC * 4), ND + 1, SPECIES.length * NC, THREE.RGBAFormat, THREE.UnsignedByteType);
  leafTab.magFilter = leafTab.minFilter = THREE.NearestFilter; leafTab.generateMipmaps = false; leafTab.needsUpdate = true; U.uLeafTab = { value: leafTab };
  const brook = createBrook({ U, COMMON, P, gravel: G.grav, wn: TX.waternormals, lite }); scene.add(brook.group);
  const leafFall = createLeafFall({ U, COMMON, P, trees: TREES, tex: TX, blocked, pools: layout.pools, canal: layout.canal, WATER_Y, lite, heightAt }); scene.add(leafFall.group);
  let autumn = null;
  function setAutumn(settings, real) { autumn = simulate(settings, real); leafTab.image.data.set(autumn.table); leafTab.needsUpdate = true; leafFall.setStats(autumn.stats); writeStates(); return autumn; }
  console.log(`[garden] leaves: ${TREES.length} trees, ${leafFall.count.litter} litter, ${leafFall.count.falling} falling`);
  setAutumn({});
  const seasons = {
    get count() { return PT.k.length; }, DOY0,
    advance(dDays, dil) { if (dDays !== 0) for (let i = 0, NP = PT.k.length; i < NP; i++) PT.tau[i] += dDays * dil(PT.x[i], PT.y[i] + 0.4, PT.z[i]); writeStates(); },
    jump(dDays) { for (let i = 0, NP = PT.k.length; i < NP; i++) PT.tau[i] += dDays; writeStates(); },
    replant() { for (let i = 0; i < NP0; i++) PT.planted[i] = PT.tau[i]; baseAge = 0; writeStates(); },   // the garden's own planting; yours keeps its age
    age() { return baseAge + (NP0 ? (PT.tau[0] - PT.planted[0]) / 365 : 0); },
    setAge(y) { for (let i = 0; i < NP0; i++) PT.planted[i] = PT.tau[i]; baseAge = Math.max(0, y); writeStates(); },
  };
  // ---------------------------------------------------------------- planting: perennials you set out yourself
  // A plant goes in at pot size and grows to its species' height and spread over its species' years (seasons.js sizeAt), on its own clock
  // like every other plant here. Spacing is the gardener's rule: neighbours whose full spreads would overlap hold each other back, and
  // one set almost on top of another is refused. Paths, paving, water, hedges and trunks are not for planting; lawn, beds and the field are.
  let kindData = null;
  const kindAt = (x, z) => {
    if (x < MAP.x0 || z < MAP.z0 || x >= MAP.x0 + MAP.s || z >= MAP.z0 + MAP.s) return 'field';
    if (!kindData) { const N = 1024, [kc, kg] = canvas(N, N); kg.drawImage(mc, 0, 0, N, N); kindData = { N, d: kg.getImageData(0, 0, N, N).data }; }
    const N = kindData.N, d = kindData.d, i = (Math.min(N - 1, Math.floor((z - MAP.z0) / MAP.s * N)) * N + Math.min(N - 1, Math.floor((x - MAP.x0) / MAP.s * N))) * 4;
    return d[i] > 128 ? 'lawn' : d[i + 1] > 128 ? 'bed' : d[i + 2] > 128 ? 'gravel' : 'paving';
  };
  const OWN = [], OWN_MAX = 800;
  // how near the nearest neighbour is, as a fraction of the two full spreads meeting (1 = just touching when both are grown)
  const nearRatio = (x, z, r, skip) => {
    let ratio = 9; const n = Math.ceil((r + 1.6) / 2), i0 = Math.floor(x / 2), j0 = Math.floor(z / 2);
    for (let j = j0 - n; j <= j0 + n; j++) for (let i = i0 - n; i <= i0 + n; i++) { const L = placed.get(i + ',' + j); if (L) for (const p of L) { if (p === skip) continue; ratio = Math.min(ratio, Math.hypot(p[0] - x, p[1] - z) / (p[2] + r)); } }
    return ratio;
  };
  const crowdOf = ratio => clamp(ratio / 0.85, 0.5, 1);
  function checkSpot(k, x, z) {
    if (!LOOKS[k] || !SIZE[k]) return { ok: false, why: 'no such plant' };
    const r = radiusOf(k);
    if (blocked(x, z)) return { ok: false, why: 'something is in the way', r };
    if (nearBrook(x, z, 0.1)) return { ok: false, why: 'that is the brook', r };
    const g = kindAt(x, z); if (g === 'gravel' || g === 'paving') return { ok: false, why: 'not in the path', r };
    if (OWN.length >= OWN_MAX || PT.k.length >= PCAP - 1) return { ok: false, why: 'the garden is full', r };
    const ratio = nearRatio(x, z, r * 0.9);
    if (ratio < 0.42) return { ok: false, why: 'too close: it would be smothered', r };
    return { ok: true, r, crowd: crowdOf(ratio), ground: g };
  }
  let ownT = 0;
  function drawOwn() {   // redrawn whole, a moment after the last change
    ownT = 0; og.globalCompositeOperation = 'source-over'; og.drawImage(bc, 0, 0); og.globalCompositeOperation = 'lighter';
    const q = OWNM.N / OWNM.s;
    for (const o of OWN) { const r = (0.35 + 0.7 * o.cl[2]) * q, cx = (o.x - OWNM.x0) * q, cy = (o.z - OWNM.z0) * q, gr = og.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, '#f00'); gr.addColorStop(0.6, '#f00'); gr.addColorStop(1, '#000'); og.fillStyle = gr; og.beginPath(); og.arc(cx, cy, r, 0, 6.2832); og.fill(); }
    ownTex.needsUpdate = true;
  }
  const ownChanged = () => { if (!ownT) ownT = setTimeout(drawOwn, 0); };
  function recrowd() { for (const o of OWN) PT.crowd[o.id] = crowdOf(nearRatio(o.x, o.z, o.cl[2], o.cl)); }
  function setOut(k, x, z, ageDays = 0, quiet = false) {
    const c = checkSpot(k, x, z); if (!c.ok) return null;
    const [h, w] = SIZE[k], near = nearestPid(x, z);
    addPlant(k, x, z, { y: heightAt(x, z) || 1e-4, salt: (OWN.length * 7919 + 3) | 0 });
    const id = curPid; PT.own[id] = clamp(9 / Math.max(h, w), 0.16, 0.5);            // a pot about nine inches across
    PT.tau[id] = PT.tau[near] || 0; PT.planted[id] = PT.tau[id] - ageDays;
    pa.set([PT.bx[id], PT.by[id], PT.bz[id], flagsFor(k)], id * 4); texA.needsUpdate = true;
    const cl = [x, z, c.r * 0.9]; { const key = Math.floor(x / 2) + ',' + Math.floor(z / 2); let L = placed.get(key); if (!L) placed.set(key, L = []); L.push(cl); }
    OWN.push({ id, k, x, z, cl }); recrowd(); ownChanged();
    bakeBucket(buckets.get(Math.floor(x / CH) + ',' + Math.floor(z / CH)));
    if (!quiet) writeStates();
    return id;
  }
  function digUp(id) {
    const i = OWN.findIndex(o => o.id === id); if (i < 0) return false; const o = OWN[i];
    const L = placed.get(Math.floor(o.x / 2) + ',' + Math.floor(o.z / 2)); if (L) { const j = L.indexOf(o.cl); if (j >= 0) L.splice(j, 1); }
    PT.gone[id] = 1; OWN.splice(i, 1); recrowd(); ownChanged(); writeStates(); return true;
  }
  const planting = {
    check: checkSpot, plant: setOut, digUp, max: OWN_MAX, get count() { return OWN.length; }, refresh: writeStates,
    /** Your plant nearest a point, within d metres: { id, k, age (years), size (fraction of full), crowd }. */
    near(x, z, d = 1.2) { let best = null, bd = d; for (const o of OWN) { const q = Math.hypot(o.x - x, o.z - z); if (q < Math.max(bd, 0)) { bd = q; best = o; } }
      if (!best) return null; const age = (PT.tau[best.id] - PT.planted[best.id]) / 365; return { id: best.id, k: best.k, x: best.x, z: best.z, age, crowd: PT.crowd[best.id], size: sizeAt(best.k, age, PT.own[best.id]) * PT.crowd[best.id] }; },
    /** Everything you have planted, for saving: [species, x, z, age in days]. */
    list: () => OWN.map(o => [o.k, Math.round(o.x * 100) / 100, Math.round(o.z * 100) / 100, Math.round(PT.tau[o.id] - PT.planted[o.id])]),
    clear() { for (const o of OWN.slice()) digUp(o.id); },
    flora: FLORA_BY_KEY, radius: radiusOf,
  };

  const lt = [1, 1, 1];
  function setLawnSeason(d) { lawnTint(((d % 365) + 365) % 365, lt); U.uSeasonTint.value.set(lt[0], lt[1], lt[2]); }

  // ---------------------------------------------------------------- per-frame
  const v2 = new THREE.Vector2(), clipPlane = [new THREE.Plane(new V3(0, 1, 0), -WATER_Y)];
  function update(dt, t, camera) {
    U.uCam.value.copy(camera.position); brook.update(dt, t, camera.position.x, camera.position.z);
    sheetT.offset.y = (sheetT.offset.y - dt * 1.5) % 1; foamT.offset.x = (foamT.offset.x + dt * 0.05) % 1;
    TX.waternormals.offset.set(t * 0.011, t * 0.017);
    const cx = camera.position.x, cz = camera.position.z;
    for (const ch of chunks) {
      const d = Math.hypot(ch.x - cx, ch.z - cz);
      for (const M of ch.meshes) {
        const f = M.type === 'leafC' || M.type === 'leafS' ? (d < 26 ? 1 : d < 44 ? 0.62 : 0.36) : M.type === 'stem' ? (d < 30 ? 1 : 0.4) : (M.type === 'delph' || M.type === 'lupin' || M.type === 'bell' || M.type === 'bud') ? (d < 24 ? 1 : d < 42 ? 0.55 : 0.32) : (d < 45 ? 1 : 0.6);
        M.mesh.count = Math.max(1, Math.floor(M.n * f)); M.mesh.castShadow = d < 36;
      }
    }
  }
  function preRender(camera, bufW, bufH) {   // the mirrored pass for water reflections; bufW × bufH is the size of the main scene buffer
    waterMat.uniforms.uRes.value.set(bufW, bufH);
    const cx = camera.position.x, cz = camera.position.z;
    if (!waterBodies.some(w => Math.hypot(w.x - cx, w.z - cz) < w.r + 60)) return;
    const w = Math.max(16, Math.floor(bufW * reflScale)), h = Math.max(16, Math.floor(bufH * reflScale));
    if (reflRT.width !== w || reflRT.height !== h) reflRT.setSize(w, h);
    reflCam.copy(camera); reflCam.layers.set(0); reflCam.layers.enable(3);
    reflCam.position.y = 2 * WATER_Y - camera.position.y; reflCam.rotation.set(-camera.rotation.x, camera.rotation.y, 0, 'YXZ'); reflCam.updateMatrixWorld();
    grass.visible = false; for (const wm of waterMeshes) wm.visible = false;
    const hidden = [];
    for (const ch of chunks) if (Math.hypot(ch.x - cx, ch.z - cz) > 34) for (const M of ch.meshes) if (M.mesh.visible) { M.mesh.visible = false; hidden.push(M.mesh); }
    const px0 = U.uPx.value; U.uPx.value = px0 * reflScale;
    renderer.clippingPlanes = clipPlane;
    renderer.setRenderTarget(reflRT); renderer.render(scene, reflCam);
    renderer.clippingPlanes = []; U.uPx.value = px0; grass.visible = true; for (const m of hidden) m.visible = true; for (const wm of waterMeshes) wm.visible = true;
  }
  return { update, preRender, blocked, setExtraBlocked: f => { extraBlocked = f; }, P, block: blockWall, blockRound: blockFar, clearWall, patchFrag: P.fragOnly, planting, plantCount, WATER_Y, seasons, setLawnSeason, lampHeads, grass, setReflScale: k => { reflScale = k; }, setAutumn, autumn: () => autumn, trees: TREES, leafFall, brook };
}
