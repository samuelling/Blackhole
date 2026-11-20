
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { makeLayout, createGarden, loadAssets, MAP, WATER_Y } from './garden.js';
import { doyLabel, doyToMonthDay } from './seasons.js';

// ------------------------------------------------------------------ setup
const MAXV = 12;
const QS = new URLSearchParams(location.search), LOW = QS.get('q') === 'low', TEST = QS.has('test');
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const $ = id => document.getElementById(id);
$('keys').innerHTML = isTouch
  ? 'drag left side to walk · drag right side to look<br>double-tap or “open a void” to make a new one'
  : 'WASD / arrows walk · mouse looks · Shift hurries<br>E new void · S season speed · R replant · T night / live · M sound · F frame rate';

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
} catch (e) {
  $('err').style.display = 'flex'; $('err').textContent = 'This garden needs WebGL, which this browser could not start.'; throw e;
}
const PR_MAX = Math.min(window.devicePixelRatio || 1, isTouch ? 1.25 : LOW ? 1 : 1.5);
let PR = PR_MAX;   // drops by itself if frames run slow (see frame())
const MSAA = isTouch || LOW ? 0 : QS.has('msaa') ? Math.max(0, parseInt(QS.get('msaa')) || 0) : 4;
renderer.setPixelRatio(PR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setClearColor(0x000000, 1);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
document.body.prepend(renderer.domElement);
const canvas = renderer.domElement;

// scanned textures and models (about 12 MB), with progress on the entry button
let assets;
try { assets = await loadAssets(renderer, f => { $('enter').textContent = `loading… ${Math.round(f * 100)}%`; }); }
catch (e) { $('err').style.display = 'flex'; $('err').textContent = 'The garden could not load its textures (' + e.message + '). Check the connection and reload.'; throw e; }
$('enter').textContent = 'planting…'; await new Promise(r => setTimeout(r, 30));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.15, 1000);
camera.rotation.order = 'YXZ';

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rng = mulberry32(20261119);
const rr = (a, b) => a + (b - a) * rng();
const pick = arr => arr[Math.floor(rng() * arr.length)];

// ------------------------------------------------------------------ shared uniforms + GLSL
const U = {
  uTime: { value: 0 },
  uVoid: { value: Array.from({ length: MAXV }, () => new THREE.Vector4()) },     // xyz, drain strength
  uVoidAux: { value: Array.from({ length: MAXV }, () => new THREE.Vector4()) },  // horizon R, wake, reach, -
  uVoidCol: { value: Array.from({ length: MAXV }, () => new THREE.Vector3(1, .8, .6)) },
  uFogColor: { value: new THREE.Color(0.004, 0.006, 0.012) },
  uFogDensity: { value: 0.0125 },
  uLightMap: { value: null },
  uPathMap: { value: null },
  uPx: { value: 500 },
  uAmb: { value: new THREE.Vector3(0.030, 0.040, 0.072) },   // sky/moon ambient
  uSun: { value: new THREE.Vector3() },                      // direct sun on an up-facing surface
  uLightGain: { value: 1 },
  uSunDir: { value: new THREE.Vector3(0, -1, 0) },
  uDay: { value: 0 }, uTwi: { value: 0 }, uStarGain: { value: 1 },
  uWind: { value: 0.35 }, uGust: { value: 0 }, uWindDir: { value: new THREE.Vector2(0.8, 0.6) },
  uExhibit: { value: 2.6 }, uSunCol: { value: new THREE.Vector3() }, uCam: { value: new THREE.Vector3() },
  uGT: { value: 2.6 }, uPlayerF: { value: 1 }, uSeasonTint: { value: new THREE.Vector3(1, 1, 1) },
};

const COMMON = /* glsl */`
#define MAXV ${MAXV}
uniform float uTime;
uniform vec4 uVoid[MAXV];
uniform vec4 uVoidAux[MAXV];
uniform vec3 uVoidCol[MAXV];
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform sampler2D uLightMap;
uniform vec3 uAmb; uniform vec3 uSun; uniform float uLightGain;
float drainAt(vec3 p){
  float L = 1.0;
  for(int i=0;i<MAXV;i++){
    float s = uVoid[i].w;
    if(s < 0.001) continue;
    float reach = uVoidAux[i].z;
    float d = distance(p, uVoid[i].xyz);
    float f = 1.0 - smoothstep(reach*0.3, reach, d);
    L *= 1.0 - s*f;
  }
  return L;
}
float fogF(float dist){ float k = uFogDensity*dist; return exp(-k*k); }
// gravitational time dilation: a static clock at p ticks at sqrt(1 - sum rs/r) of the garden's (distant) rate.
// rs = uGT x the void's horizon radius; potentials add in the weak-field limit.
uniform float uGT; uniform float uPlayerF;
float dilAt(vec3 p){
  float s = 0.0;
  for(int i=0;i<MAXV;i++){ float R = uVoidAux[i].x; if(R <= 0.0) continue; s += R * uGT / max(distance(p, uVoid[i].xyz), 0.05); }
  return sqrt(max(0.0144, 1.0 - s));
}
// light climbing out of a deeper well than yours arrives redshifted; from a shallower one, blueshifted
vec3 gshift(vec3 c, vec3 p){
  float z = clamp(log2(dilAt(p) / uPlayerF), -2.0, 2.0);
  return c * (z < 0.0 ? mix(vec3(1.0), vec3(1.0, 0.5, 0.26), min(1.0, -z * 0.55)) : mix(vec3(1.0), vec3(0.62, 0.84, 1.3), min(1.0, z * 0.45)));
}
vec3 groundLight(vec2 xz){ return texture2D(uLightMap, vec2((xz.x - (${MAP.x0.toFixed(1)}))/${MAP.s.toFixed(1)}, 1.0 - (xz.y - (${MAP.z0.toFixed(1)}))/${MAP.s.toFixed(1)})).rgb; }
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
`;
const MOON = 'vec3(0.030,0.040,0.072)';

// ------------------------------------------------------------------ light-map canvas (pools of light on the ground)
const LM = isTouch ? 1024 : 2048;
const lmCanvas = document.createElement('canvas'); lmCanvas.width = lmCanvas.height = LM;
const lm = lmCanvas.getContext('2d'); lm.fillStyle = '#000'; lm.fillRect(0, 0, LM, LM);
lm.globalCompositeOperation = 'lighter';
function splat(x, z, r, c, a) {
  const px = (x - MAP.x0) / MAP.s * LM, pz = (z - MAP.z0) / MAP.s * LM, pr = Math.max(1.5, r / MAP.s * LM);
  const m = Math.max(c[0], c[1], c[2], 1e-3);
  const col = `${(c[0] / m * 255) | 0},${(c[1] / m * 255) | 0},${(c[2] / m * 255) | 0}`;
  const g = lm.createRadialGradient(px, pz, 0, px, pz, pr);
  g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(0.45, `rgba(${col},${a * 0.38})`); g.addColorStop(1, `rgba(${col},0)`);
  lm.fillStyle = g; lm.fillRect(px - pr, pz - pr, pr * 2, pr * 2);
}

// ------------------------------------------------------------------ data collectors
const LP = [], LC = [], LS = [], LSeed = [];
function light(x, y, z, c, size = 0.3, b = 1.3) { LP.push(x, y, z); LC.push(c[0] * b, c[1] * b, c[2] * b); LS.push(size); LSeed.push(rng()); }
const jit = (c, a = 0.1) => [c[0] * (1 - a + 2 * a * rng()), c[1] * (1 - a + 2 * a * rng()), c[2] * (1 - a + 2 * a * rng())];

const P = {
  warm: [1.0, 0.70, 0.40], amber: [1.0, 0.48, 0.14], rose: [1.0, 0.30, 0.45], violet: [0.62, 0.32, 1.0],
  cyan: [0.30, 0.80, 1.0], ice: [0.72, 0.86, 1.0], green: [0.45, 1.0, 0.55], magenta: [1.0, 0.25, 0.80], gold: [1.0, 0.82, 0.45],
};

// ------------------------------------------------------------------ layout (shared with the garden)
const layout = makeLayout();
const { loopCurve, distToPath, loopLen } = layout;
const METAL = [];   // [a, b, radius] — drawn as dark metal tubes by the garden
const metal = (a, b, r) => METAL.push([a, b, r]);
const LANTERNS = [];   // [x, z, colour] — the garden stands a lantern at each
const BULBS = [];   // [x, y, z, colour] — small glass bulbs under the brightest point lights
const bulb = (x, y, z, c, size = 0.26, b = 1.5) => { light(x, y, z, c, size, b); BULBS.push([x, y, z, c]); };

// ------------------------------------------------------------------ tunnel of light arches over the entrance walk
{
  const stops = [P.amber, P.rose, P.violet, P.cyan], T = layout.tunnel;
  for (let i = 0; i < T.n; i++) {
    const z = T.z0 - i * T.step, t = i / (T.n - 1) * (stops.length - 1), k = Math.min(Math.floor(t), stops.length - 2), f = t - k;
    const c = stops[k].map((v, j) => v * (1 - f) + stops[k + 1][j] * f);
    const W = T.W, H0 = 1.3;
    for (let y = 0.2; y < H0; y += 0.22) { bulb(-W, y, z, jit(c, .05)); bulb(W, y, z, jit(c, .05)); }
    let prev = [W, H0, z];
    for (let a = 0; a <= 32; a++) {
      const ang = a / 32 * Math.PI, pt = [Math.cos(ang) * W, H0 + Math.sin(ang) * W, z];
      bulb(pt[0], pt[1], pt[2], jit(c, .05));
      if (a) metal(prev, pt, 0.016); prev = pt;
    }
    metal([-W, 0, z], [-W, H0, z], 0.02); metal([W, 0, z], [W, H0, z], 0.02);
    splat(-W, z, 2.6, c, 0.3); splat(W, z, 2.6, c, 0.3); splat(0, z, 3.4, c, 0.16);
  }
}

// ------------------------------------------------------------------ low path lanterns round the loop walk
{
  const lantern = (x, z, c = P.warm) => {
    LANTERNS.push([x, z, c]); light(x, 0.675, z, jit(c, .05), 0.42, 1.6); splat(x, z, 2.6, c, 0.34);
  };
  const n = Math.floor(loopLen / 7.5);
  for (let i = 0; i < n; i++) {
    const s = layout.loopS[Math.floor((i + 0.5) / n * layout.loopS.length)];
    if (Math.abs(s.x) < 5 && s.z > 45) continue;
    lantern(s.x - s.ox * 1.72, s.z - s.oz * 1.72, i % 5 === 0 ? P.gold : P.warm);   // on the lawn side of the walk
  }
  for (const s of [-1, 1]) for (let z = layout.canal.z0 + 0.2; z <= layout.canal.z1; z += 3.2) lantern(s * 3.3, z, P.ice);
  for (const [x, z] of layout.lamps) { light(x, 2.79, z, P.warm, 0.75, 2.0); splat(x, z, 6.5, P.warm, 0.5); splat(x, z, 2.2, P.gold, 0.35); }   // heads of the cast-iron lamp posts
}

// ------------------------------------------------------------------ fields of light stalks
const meadows = [
  { ...layout.meadows[0], n: 950, pal: [P.amber, P.rose, P.violet, P.warm, P.magenta] },
  { ...layout.meadows[1], n: 520, pal: [P.cyan, P.ice, P.ice, P.violet, P.green] },
];
for (const m of meadows) {
  for (let i = 0; i < m.n; i++) {
    const a = rng() * Math.PI * 2, r = m.r * Math.sqrt(rng());
    const x = m.x + Math.cos(a) * r, z = m.z + Math.sin(a) * r;
    if (distToPath(x, z) < 1.9 || Math.hypot(x - m.x, z - m.z) < 0.7) continue;
    const h = rr(0.45, 1.2), c = jit(pick(m.pal), .08), lx = rr(-0.05, 0.05) * h, lz = rr(-0.05, 0.05) * h;
    metal([x, 0, z], [x + lx, h, z + lz], 0.0035); light(x + lx, h + 0.02, z + lz, c, 0.28, 1.35); splat(x, z, 1.1, c, 0.055);
  }
}

// ------------------------------------------------------------------ trees wrapped in light
const trunks = [];
const treeSpecs = [];
function tree(x, z, kind, c1, c2, big = 1) {
  const h = rr(2.5, 3.4) * big, s = rr(0.95, 1.35) * big;
  trunks.push({ x, z, h, s });
  const cy = h + rr(1.4, 2.0) * big, A = rr(2.9, 3.6) * big, B = rr(2.1, 2.7) * big;
  const spec = { x, z, h, s, cy, A, B, kind, strands: [] }; treeSpecs.push(spec);
  const dir = () => { const v = new THREE.Vector3(rr(-1, 1), rr(-1, 1), rr(-1, 1)); return v.lengthSq() > 1 || v.lengthSq() < 1e-4 ? dir() : v.normalize(); };
  if (kind === 'round') {
    for (let i = 0; i < 300; i++) {
      const d = dir(), k = 0.78 + 0.26 * rng();
      light(x + d.x * A * k, cy + d.y * B * k, z + d.z * A * k, jit(rng() < 0.82 ? c1 : c2, .08), 0.25, 1.45);
    }
  } else {
    for (let i = 0; i < 130; i++) {
      const d = dir(); if (d.y < -0.1) d.y = -d.y * 0.5;
      const k = 0.84 + 0.2 * rng();
      light(x + d.x * A * k, cy + d.y * B * k, z + d.z * A * k, jit(c1, .08), 0.24, 1.4);
    }
    for (let sI = 0; sI < 24; sI++) {
      const ang = rng() * Math.PI * 2, el = rr(-0.15, 0.45);
      const sx = x + Math.cos(ang) * Math.cos(el) * A, sz = z + Math.sin(ang) * Math.cos(el) * A, sy = cy + Math.sin(el) * B;
      const bot = rr(0.5, 1.3), N = 15;
      const strand = [[sx, sy, sz]]; spec.strands.push(strand);
      for (let k = 1; k <= N; k++) {
        const u = k / N, bulge = Math.sin(u * Math.PI) * 0.35;
        const pt = [sx + Math.cos(ang) * bulge, sy + (bot - sy) * u, sz + Math.sin(ang) * bulge];
        light(pt[0], pt[1], pt[2], jit(rng() < 0.7 ? c1 : c2, .06), 0.22, 1.4);
        metal(strand[strand.length - 1], pt, 0.003); strand.push(pt);
      }
    }
  }
  splat(x, z, A * 2.1, c1, 0.22);
}
{
  const pals = [[P.warm, P.gold], [P.green, P.cyan], [P.cyan, P.ice], [P.violet, P.rose], [P.magenta, P.violet], [P.gold, P.amber]];
  layout.trees.forEach((t, i) => tree(t.x, t.z, t.kind, pals[i % pals.length][0], pals[i % pals.length][1], t.kind === 'weep' ? 0.92 : 1));
}

// ------------------------------------------------------------------ globe lawn, and globes tucked into the borders
const globes = [];
function addGlobe(x, z, r, c) { globes.push({ x, y: r * 0.92, z, r, c }); splat(x, z, r * 3.0, c, 0.3); }
function globeOk(x, z, r) { for (const g of globes) if (Math.hypot(x - g.x, z - g.z) < r + g.r + 0.3) return false; return true; }
{
  const pal = [P.cyan, P.violet, P.magenta, P.ice, P.rose];
  let tries = 0;
  const gl = layout.globeLawn;
  while (globes.length < 26 && tries++ < 5000) {
    const a = rng() * Math.PI * 2, rad = (gl.r - 0.8) * Math.sqrt(rng()), x = gl.x + Math.cos(a) * rad, z = gl.z + Math.sin(a) * rad, r = rr(0.22, 0.8);
    if (globeOk(x, z, r) && distToPath(x, z) > 1.8 + r) addGlobe(x, z, r, jit(pick(pal), .06));
  }
  const clusterAt = (cx, cz, c) => { for (let i = 0, t = 0; i < 4 && t < 60; t++) { const x = cx + rr(-1.3, 1.3), z = cz + rr(-1.3, 1.3), r = rr(0.2, 0.5); if (globeOk(x, z, r) && distToPath(x, z) > 1.8 + r && layout.inWalls(x, z, 0.8)) { addGlobe(x, z, r, jit(c, .06)); i++; } } };
  for (const [x, z, c] of [[24.2, 44, P.rose], [-24.3, -2, P.gold], [24.3, 10, P.cyan], [-24.2, 28, P.violet], [12, -28.4, P.green], [-12, -28.4, P.amber], [24, -24, P.magenta]]) clusterAt(x, z, c);
}
// fairy lights draped along the yew ring round the great fountain
{
  const R = layout.ring.r, N = 46;
  for (let i = 0; i < N; i++) {
    const a = (i + 0.5) / N * Math.PI * 2, q = ((a % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
    if (q < layout.ring.gap + 0.02 || q > Math.PI / 2 - layout.ring.gap - 0.02) continue;
    for (const side of [-1, 1]) for (let k = 0; k < 6; k++) {
      const aa = a + (k / 6 - 0.5) * (Math.PI * 2 / N), droop = 0.1 * Math.sin((k + 0.5) / 6 * Math.PI), rad = R + side * 0.5;
      light(Math.cos(aa) * rad, 1.56 - droop, Math.sin(aa) * rad, jit(rng() < 0.85 ? P.gold : P.warm, .05), 0.2, 1.3);
    }
    splat(Math.cos(a) * R, Math.sin(a) * R, 2.0, P.gold, 0.12);
  }
}

// ------------------------------------------------------------------ textures
const lightTex = new THREE.CanvasTexture(lmCanvas); lightTex.colorSpace = THREE.NoColorSpace;
U.uLightMap.value = lightTex;

// ------------------------------------------------------------------ materials
const WORLD_VS = /* glsl */`
varying vec3 vW;
void main(){
  vec4 p = vec4(position,1.0);
  #ifdef USE_INSTANCING
  p = instanceMatrix * p;
  #endif
  vec4 w = modelMatrix * p; vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

function silhouetteMat(base, leafy = 0) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uBase: { value: new THREE.Color(...base) }, uLeafy: { value: leafy } },
    vertexShader: WORLD_VS,
    fragmentShader: COMMON + /* glsl */`
    uniform vec3 uBase; uniform float uLeafy;
    varying vec3 vW;
    void main(){
      float leaf = mix(1.0, 0.45 + 1.1*vnoise(vW.xz*4.0 + vW.y*3.0), uLeafy);
      float L = drainAt(vW);
      vec3 lit = groundLight(vW.xz) * 1.9 * L + (uAmb * 1.6 + uSun * 0.7) * mix(1.0, L, 0.92);
      vec3 col = uBase * leaf * lit;
      gl_FragColor = vec4(mix(uFogColor, col, fogF(distance(cameraPosition, vW))), 1.0);
    }`,
  });
}

const pointsMat = new THREE.ShaderMaterial({
  uniforms: { ...U },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: COMMON + /* glsl */`
  uniform float uPx;
  attribute vec3 aColor; attribute float aSize; attribute float aSeed;
  varying vec3 vCol; varying float vB;
  void main(){
    vec3 p = position;
    p.x += sin(uTime*0.6 + aSeed*25.0)*0.015;
    p.z += cos(uTime*0.5 + aSeed*17.0)*0.015;
    float L = 1.0;
    for(int i=0;i<MAXV;i++){
      float s = uVoid[i].w;
      if(s < 0.001) continue;
      vec3 c = uVoid[i].xyz;
      vec3 dv = c - p; float d = length(dv);
      float reach = uVoidAux[i].z;
      float f = 1.0 - smoothstep(reach*0.3, reach, d);
      float k = s*f;
      L *= 1.0 - k;
      // spacetime twist around the void's vertical axis, then a pull inward
      float ang = k*k*(1.3 + 0.5*sin(uTime*0.7 + aSeed*6.283));
      vec2 rel = p.xz - c.xz; float cs = cos(ang), sn = sin(ang);
      p.xz = c.xz + vec2(cs*rel.x - sn*rel.y, sn*rel.x + cs*rel.y);
      p += (c - p) * k * 0.42 * (0.85 + 0.15*sin(uTime*3.0 + aSeed*30.0));
    }
    float tw = 0.78 + 0.22*sin(uTime*(0.8 + aSeed*2.5) + aSeed*50.0);
    vec4 mv = modelViewMatrix * vec4(p,1.0);
    float dist = -mv.z;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(aSize * uPx / dist * (0.2 + 0.8*L), 0.0, 90.0);
    vB = L * tw * fogF(dist) * uLightGain;
    vCol = gshift(aColor, p);
  }`,
  fragmentShader: /* glsl */`
  varying vec3 vCol; varying float vB;
  void main(){
    if(vB < 0.004) discard;
    vec2 q = gl_PointCoord*2.0 - 1.0; float r2 = dot(q,q);
    if(r2 > 1.0) discard;
    float halo = exp(-r2*5.0), core = exp(-r2*38.0);
    gl_FragColor = vec4(vCol * (halo*0.5 + core*3.0) * vB, 1.0);
  }`,
});

const streamMat = new THREE.ShaderMaterial({
  uniforms: { ...U },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: COMMON + /* glsl */`
  uniform float uPx; uniform float uDay;
  attribute vec4 aSeed; attribute float aVoid;
  varying vec3 vCol; varying float vB;
  void main(){
    vec4 V = vec4(0.0); vec4 A = vec4(0.0); vec3 C = vec3(1.0);
    for(int i=0;i<MAXV;i++){ if(abs(float(i) - aVoid) < 0.5){ V = uVoid[i]; A = uVoidAux[i]; C = uVoidCol[i]; } }
    float wake = A.y;
    float size = A.w;
    if(wake < 0.01 || fract(aSeed.y*7.31) > 0.25 + 0.75*clamp(size/1.4, 0.0, 1.0)){ gl_Position = vec4(2.0,2.0,2.0,1.0); gl_PointSize = 0.0; vB = 0.0; vCol = vec3(0.0); return; }
    float ph = fract(uTime*(0.07 + 0.13*aSeed.x) + aSeed.y);
    float e = ph*ph*ph;
    float R0 = max(A.z, 2.0)*(0.3 + 0.7*aSeed.z);
    float rho = mix(R0, A.x*1.03, e);
    float ang = aSeed.w*6.2831 + e*9.0 + ph*1.5;
    float h0 = -V.y + 0.1 + aSeed.x*aSeed.z*4.0;
    float h = h0*(1.0 - sqrt(e));
    vec3 p = V.xyz + vec3(cos(ang)*rho, h, sin(ang)*rho);
    vec4 mv = viewMatrix * vec4(p,1.0);
    float dist = -mv.z;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp((0.09 + 0.07*aSeed.x)*(1.0 + 0.5*e)*(0.6 + 0.4*min(size, 2.0)) * uPx / dist, 0.0, 22.0);
    float fade = smoothstep(0.0,0.2,ph)*(1.0 - smoothstep(0.92,1.0,ph));
    vB = wake * fade * (0.28 + 1.1*e) * fogF(dist) * (0.6 + 0.4*uLightGain) * mix(1.0, 0.3, uDay);   // faint by day
    vCol = mix(C, vec3(0.75,0.86,1.0), e*0.8);
  }`,
  fragmentShader: pointsMat.fragmentShader,
});

const globeMat = new THREE.ShaderMaterial({
  uniforms: { ...U },
  vertexShader: /* glsl */`
  varying vec3 vW; varying vec3 vN; varying vec3 vC; varying vec3 vCtr;
  void main(){
    mat4 m = modelMatrix;
    #ifdef USE_INSTANCING
    m = m * instanceMatrix;
    #endif
    vec4 w = m * vec4(position,1.0); vW = w.xyz;
    vN = normalize(mat3(m) * normal);
    vCtr = (m * vec4(0.0,0.0,0.0,1.0)).xyz;
    #ifdef USE_INSTANCING_COLOR
    vC = instanceColor;
    #else
    vC = vec3(1.0);
    #endif
    gl_Position = projectionMatrix * viewMatrix * w;
  }`,
  fragmentShader: COMMON + /* glsl */`
  varying vec3 vW; varying vec3 vN; varying vec3 vC; varying vec3 vCtr;
  void main(){
    vec3 V = normalize(cameraPosition - vW);
    float fr = 1.0 - max(dot(normalize(vN), V), 0.0);
    float L = drainAt(vCtr + vec3(0.0,0.3,0.0));
    float pulse = 0.85 + 0.15*sin(uTime*0.9 + vCtr.x*0.7 + vCtr.z*0.3);
    float inner = pow(1.0 - fr, 1.6);
    vec3 glow = vC * (0.18 + 1.25*inner) * L * pulse * uLightGain;
    vec3 glass = (vec3(0.02,0.025,0.04) + uAmb*0.45 + uSun*0.25) * (0.3 + 1.5*fr*fr) * mix(1.0, L, 0.85);
    vec3 col = glow + glass;
    gl_FragColor = vec4(mix(uFogColor, col, fogF(distance(cameraPosition, vW))), 1.0);
  }`,
});

// ------------------------------------------------------------------ build meshes
{
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(LP, 3));
  g.setAttribute('aColor', new THREE.Float32BufferAttribute(LC, 3));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(LS, 1));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(LSeed, 1));
  const pts = new THREE.Points(g, pointsMat); pts.frustumCulled = false; pts.renderOrder = 2; scene.add(pts);
}
{
  const im = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 28, 18), globeMat, globes.length);
  const m = new THREE.Matrix4(), col = new THREE.Color();
  globes.forEach((g, i) => { m.compose(new THREE.Vector3(g.x, g.y, g.z), new THREE.Quaternion(), new THREE.Vector3(g.r, g.r, g.r)); im.setMatrixAt(i, m); im.setColorAt(i, col.setRGB(...g.c)); });
  im.frustumCulled = false; scene.add(im);
}

// sky, stars, moon
const starPR = { value: PR };
const CLOUD_GLSL = `
    float fbm(vec2 p){ float a = 0.5, s = 0.0; for(int i=0;i<5;i++){ s += a*vn(p); p = p*2.03 + vec2(17.0, 5.0); a *= 0.5; } return s; }
    float cloudAt(vec3 d, float t){ if(d.y < 0.012) return 0.0; vec2 p = d.xz/(d.y + 0.14)*1.05 + t*vec2(0.0045, 0.0017);
      return smoothstep(0.47, 0.74, fbm(p*1.25)*0.78 + fbm(p*3.3 + 9.0)*0.22) * smoothstep(0.012, 0.14, d.y); }`;
let moon, envSkyMat;
const MOON_COL = new THREE.Color().setRGB(1.05, 1.07, 1.2);
{
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: { uSunDir: U.uSunDir, uDay: U.uDay, uTwi: U.uTwi, uNoSun: { value: 0 }, uPlayerF: U.uPlayerF, uTime: U.uTime },
    vertexShader: `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
    varying vec3 vD;
    uniform vec3 uSunDir; uniform float uDay; uniform float uTwi; uniform float uNoSun; uniform float uPlayerF; uniform float uTime;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
    float fbm(vec2 p){ float a = 0.5, s = 0.0; for(int i=0;i<5;i++){ s += a*vn(p); p = p*2.03 + vec2(17.0, 5.0); a *= 0.5; } return s; }
    float cloudAt(vec3 d, float t){ if(d.y < 0.012) return 0.0; vec2 p = d.xz/(d.y + 0.14)*1.05 + t*vec2(0.0045, 0.0017);
      return smoothstep(0.47, 0.74, fbm(p*1.25)*0.78 + fbm(p*3.3 + 9.0)*0.22) * smoothstep(0.012, 0.14, d.y); }
    void main(){
      vec3 d = normalize(vD);
      vec3 c = mix(vec3(0.014,0.018,0.032), vec3(0.0015,0.002,0.006), smoothstep(-0.02, 0.55, d.y));
      float band = exp(-pow(dot(d, normalize(vec3(0.55,0.35,0.76))), 2.0)*22.0);
      float n = vn(d.xy*9.0)*0.6 + vn(d.zy*23.0)*0.4;
      c += vec3(0.018,0.02,0.03) * band * n * smoothstep(-0.05, 0.2, d.y) * (1.0 - uDay);
      vec3 dayc = mix(vec3(0.56,0.68,0.84), vec3(0.10,0.25,0.62), smoothstep(0.0, 0.6, d.y));
      c = mix(c, dayc, uDay);
      float sd = max(dot(d, uSunDir), 0.0), low = 1.0 - smoothstep(-0.05, 0.45, d.y);
      c += (vec3(1.0,0.42,0.16)*pow(sd, 4.0) + vec3(0.32,0.16,0.30)*0.5) * low * uTwi;
      float up = smoothstep(-0.03, 0.02, uSunDir.y);
      c += vec3(1.0,0.9,0.75) * (pow(sd, 1400.0)*40.0*(1.0 - uNoSun) + pow(sd, 14.0)*0.35*uDay + pow(sd, 3.0)*0.08*uDay) * up;
      { // broken cloud: lit and self-shadowed from the sun (or faintly by the moon), warm underneath at dusk
        float cl = cloudAt(d, uTime);
        if (cl > 0.0) { vec3 Ld = uSunDir.y > -0.05 ? uSunDir : normalize(vec3(-0.25, 0.38, -1.0));
          float sh = cloudAt(normalize(d + Ld*0.07), uTime), lit = 1.0 - 0.6*sh;
          vec3 cd = mix(vec3(0.5, 0.55, 0.63), vec3(1.0, 0.98, 0.95), lit) * (0.75 + 0.5*pow(sd, 3.0));
          vec3 cn = vec3(0.011, 0.014, 0.024) * (0.5 + 0.9*lit);
          vec3 cc = mix(cn, cd, uDay) + vec3(1.0, 0.45, 0.2) * lit * uTwi * (0.35 + 0.9*pow(sd, 2.0));
          c = mix(c, cc, cl * 0.9); } }
      c *= mix(vec3(1.0), vec3(0.8, 0.93, 1.35), clamp(log2(1.0 / uPlayerF) * 0.35, 0.0, 1.0));   // the sky, blueshifted when you sit deep in a well
      gl_FragColor = vec4(c, 1.0);
    }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(470, 32, 16), skyMat);
  sky.renderOrder = -2; scene.add(sky);
  envSkyMat = skyMat.clone(); envSkyMat.uniforms = { uSunDir: U.uSunDir, uDay: U.uDay, uTwi: U.uTwi, uNoSun: { value: 1 }, uPlayerF: { value: 1 }, uTime: U.uTime };

  const N = 2200, pos = [], col = [], sz = [], sd = [];
  for (let i = 0; i < N; i++) {
    const v = new THREE.Vector3(rr(-1, 1), rr(-0.08, 1), rr(-1, 1)).normalize().multiplyScalar(440);
    pos.push(v.x, v.y, v.z);
    const b = Math.pow(rng(), 3) * 2.2 + 0.25, t = rng();
    col.push(b * (0.8 + 0.2 * t), b * 0.88, b * (1.05 - 0.15 * t)); sz.push(rr(1.0, 2.4)); sd.push(rng());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(sz, 1));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(sd, 1));
  const stars = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uPR: starPR, uStarGain: U.uStarGain }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uTime; uniform float uPR; uniform float uStarGain; attribute vec3 aColor; attribute float aSize; attribute float aSeed; varying vec3 vC;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }` + CLOUD_GLSL + `
      void main(){ vC = aColor*(0.7+0.3*sin(uTime*(1.0+aSeed*3.0)+aSeed*90.0)) * smoothstep(-0.05, 0.12, normalize(position).y) * uStarGain * (1.0 - 0.94*cloudAt(normalize(position), uTime));
      gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_PointSize = aSize*uPR; }`,
    fragmentShader: `varying vec3 vC; void main(){ vec2 q=gl_PointCoord*2.0-1.0; float r2=dot(q,q); if(r2>1.0) discard; gl_FragColor=vec4(vC*exp(-r2*3.0),1.0); }`,
  }));
  stars.frustumCulled = false; stars.renderOrder = -1; scene.add(stars);

  moon = new THREE.Mesh(new THREE.SphereGeometry(9, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(1.05, 1.07, 1.2) }));
  moon.material.depthWrite = false;
  moon.position.set(-0.25, 0.38, -1).normalize().multiplyScalar(420); moon.renderOrder = -1; scene.add(moon);
}

// ------------------------------------------------------------------ the garden itself
scene.fog = new THREE.FogExp2(0x000000, U.uFogDensity.value);
const garden = createGarden({ scene, renderer, U, COMMON, layout, assets, treeSpecs, metalSegs: METAL, bulbs: BULBS, lanterns: LANTERNS, isTouch, low: LOW, grassScale: parseFloat(QS.get('grass')) || 1 });
const sunLight = new THREE.DirectionalLight(0xffffff, 3);
sunLight.castShadow = true; sunLight.shadow.mapSize.set(isTouch ? 2048 : 4096, isTouch ? 2048 : 4096);
Object.assign(sunLight.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 320 });
sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.024;
scene.add(sunLight, sunLight.target);
const hemi = new THREE.HemisphereLight(0x5a6a90, 0x1a1612, 0.15); scene.add(hemi);
const MOON_DIR = new THREE.Vector3(-0.25, 0.38, -1).normalize();
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), envSkyMat));
let envRT = null, envKey = '', envAt = -1;
function refreshEnv(key, now) {
  if (key === envKey || now - envAt < 0.25) return;
  envKey = key; envAt = now; const old = envRT;
  envRT = pmrem.fromScene(envScene, 0.04, 0.1, 500); scene.environment = envRT.texture; if (old) old.dispose();
}
const mirrorVoids = [];   // black spheres seen only by the water's reflection camera (layer 3)

// ------------------------------------------------------------------ voids
const voidSlots = new Array(MAXV).fill(null);
function avgColorNear(p, rad = 16) {
  let r = 0, g = 0, b = 0, w = 0;
  for (let i = 0; i < LP.length; i += 3) {
    const d = Math.hypot(LP[i] - p.x, LP[i + 1] - p.y, LP[i + 2] - p.z);
    if (d < rad) { const k = 1 / (1 + d); r += LC[i] * k; g += LC[i + 1] * k; b += LC[i + 2] * k; w += k; }
  }
  if (w < 1e-3) return new THREE.Vector3(1, 0.75, 0.5);
  const v = new THREE.Vector3(r / w, g / w, b / w); return v.multiplyScalar(1.15 / Math.max(v.x, v.y, v.z));
}
let spawnCounter = 0;
function makeVoid(x, y, z, slot, k = 1, spawned = false) {
  const v = { home: new THREE.Vector3(x, y, z), pos: new THREE.Vector3(x, y, z), wake: 0, scar: 0, drain: 0, R: 0.18 * k, reach: 2.5, k,
    seed: rng() * 10, spawned, born: spawnCounter++, col: avgColorNear(new THREE.Vector3(x, 0.8, z), 10 + 8 * k), wasAwake: false };
  voidSlots[slot] = v; return v;
}
// size k: ~0.35 is a pinhole that drains one bush; 2.6 is a giant that eats a meadow
const curated = layout.voids;
curated.forEach(([x, y, z, k], i) => makeVoid(x, y, z, i, k));
const GIANT = 1; voidSlots[GIANT].giant = true;   // the great one, above the grand fountain

{
  const counts = Array.from({ length: MAXV }, (_, i) => i === GIANT ? (isTouch ? 1500 : 3200) : 400), N = counts.reduce((a, b) => a + b, 0), seeds = new Float32Array(N * 4), vid = new Float32Array(N);
  for (let i = 0, slot = 0, left = counts[0]; i < N; i++) { while (left === 0) left = counts[++slot]; seeds.set([rng(), rng(), rng(), rng()], i * 4); vid[i] = slot; left--; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  g.setAttribute('aVoid', new THREE.BufferAttribute(vid, 1));
  const s = new THREE.Points(g, streamMat); s.frustumCulled = false; s.renderOrder = 3; scene.add(s);
}

// ------------------------------------------------------------------ the giant's accretion disk of stolen light
const diskTilt = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationX(0.16).multiply(new THREE.Matrix4().makeRotationZ(0.07)));
U.uDiskPos = { value: new THREE.Vector3(0, 12.5, 0) }; U.uDiskGlow = { value: new THREE.Vector3() };
const diskU = { uGiant: { value: new THREE.Vector4(0, 12.5, 0, 1) }, uGW: { value: 0.4 }, uTilt: { value: diskTilt } };
{
  const N = isTouch ? 6000 : 16000, sd = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) sd.set([rng(), rng(), rng(), rng()], i * 4);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, U, diskU), transparent: true, depthWrite: true, blending: THREE.AdditiveBlending,
    vertexShader: COMMON + `uniform float uPx; uniform vec4 uGiant; uniform float uGW; uniform mat3 uTilt; attribute vec4 aSeed; varying vec3 vC;
      void main(){
        float R = uGiant.w, rr = R * (1.55 + 2.7 * pow(aSeed.x, 1.5));
        float om = 0.55 * pow(R * 1.55 / rr, 1.5), ang = aSeed.y * 6.2831 + uTime * om;
        vec3 lp = vec3(cos(ang) * rr, (aSeed.z - 0.5) * 0.05 * rr, sin(ang) * rr);
        vec3 p = uTilt * lp + uGiant.xyz;
        vec3 T = uTilt * vec3(-sin(ang), 0.0, cos(ang));
        vec3 V = normalize(cameraPosition - p);
        float boost = 1.0 + 0.75 * dot(T, V);                     // relativistic beaming: the approaching side is brighter
        float t = clamp((rr / R - 1.55) / 2.7, 0.0, 1.0);
        vec3 col = mix(vec3(1.0, 0.93, 0.82) * 1.7, vec3(1.0, 0.42, 0.14) * 0.85, sqrt(t));
        vC = col * boost * boost * uGW * (0.25 + 0.75 * (1.0 - t)) * (0.6 + 0.4 * aSeed.w);
        vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp((0.05 + 0.09 * aSeed.w) * R / 2.5 * uPx / -mv.z, 0.0, 30.0);
        vC *= fogF(-mv.z);
      }`,
    fragmentShader: `varying vec3 vC; void main(){ vec2 q = gl_PointCoord * 2.0 - 1.0; float r2 = dot(q, q); if (r2 > 0.8) discard; gl_FragColor = vec4(vC * exp(-r2 * 3.0), 1.0); }`,
  });
  const disk = new THREE.Points(g, mat); disk.frustumCulled = false; disk.renderOrder = 4; scene.add(disk);
}
for (let i = 0; i < MAXV; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0x000000 })); m.layers.set(3); m.visible = false; scene.add(m); mirrorVoids.push(m); }
function drainAtJS(p) {
  let L = 1;
  for (const v of voidSlots) { if (!v || v.drain < 0.001) continue;
    const d = p.distanceTo(v.pos), a = v.reach * 0.3, b = v.reach, t = Math.min(1, Math.max(0, (d - a) / (b - a)));
    L *= 1 - v.drain * (1 - t * t * (3 - 2 * t)); }
  return L;
}

// ------------------------------------------------------------------ post: gravitational lensing → bloom → output
let rt, aoRT, aoRT2, bufW = 1, bufH = 1;
function makeRT() {
  if (rt) { rt.depthTexture.dispose(); rt.dispose(); aoRT.dispose(); aoRT2.dispose(); }
  const w = bufW = Math.floor(innerWidth * PR), h = bufH = Math.floor(innerHeight * PR);
  rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: MSAA });   // multisampled: with alpha-to-coverage this smooths every leaf edge
  rt.depthTexture = new THREE.DepthTexture(w, h); rt.depthTexture.type = THREE.UnsignedIntType;
  const o = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  aoRT = new THREE.WebGLRenderTarget(Math.ceil(w / 2), Math.ceil(h / 2), o); aoRT2 = new THREE.WebGLRenderTarget(Math.ceil(w / 2), Math.ceil(h / 2), o);
}
makeRT();
// ambient occlusion from the depth buffer alone (half resolution): darkens creases, the foot of walls, the inside of hedges and borders
const AO_ON = !isTouch && !LOW && QS.get('ao') !== '0';
const FS_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const aoMat = new THREE.ShaderMaterial({
  uniforms: { tDepth: { value: rt.depthTexture }, uTexel: { value: new THREE.Vector2() }, uProj: { value: new THREE.Vector2() }, uNear: { value: camera.near }, uFar: { value: camera.far } },
  depthTest: false, depthWrite: false, vertexShader: FS_VS,
  fragmentShader: /* glsl */`
  uniform sampler2D tDepth; uniform vec2 uTexel, uProj; uniform float uNear, uFar; varying vec2 vUv;
  float lin(vec2 uv){ return (uNear*uFar)/(uFar - (uFar - uNear)*texture2D(tDepth, uv).x); }
  vec3 posAt(vec2 uv){ float z = lin(uv); return vec3((uv*2.0 - 1.0)*uProj*z, -z); }
  void main(){
    vec3 pc = posAt(vUv); float z = -pc.z;
    if (z > 70.0) { gl_FragColor = vec4(1.0, z, 0.0, 1.0); return; }
    vec3 pr = posAt(vUv + vec2(uTexel.x, 0.0)), pl = posAt(vUv - vec2(uTexel.x, 0.0)), pu = posAt(vUv + vec2(0.0, uTexel.y)), pd = posAt(vUv - vec2(0.0, uTexel.y));
    vec3 dx = abs(pr.z - pc.z) < abs(pc.z - pl.z) ? pr - pc : pc - pl, dy = abs(pu.z - pc.z) < abs(pc.z - pd.z) ? pu - pc : pc - pd;
    vec3 n = normalize(cross(dx, dy));
    float R = 0.6, rs = R / (z * 2.0 * uProj.y);                                  // sample disc radius in uv (y)
    float ang = 6.2831 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))), occ = 0.0;
    for (int i = 0; i < 12; i++) {
      float fi = (float(i) + 0.5) / 12.0, a = ang + fi * 6.2831 * 3.3, rr = rs * sqrt(fi);
      vec3 v = posAt(vUv + vec2(cos(a) * rr * uProj.y / uProj.x, sin(a) * rr)) - pc;
      float d2 = dot(v, v);
      occ += max(dot(v, n) - 0.012 * z - 0.01, 0.0) / (d2 + 0.004) * max(0.0, 1.0 - d2 / (R * R));
    }
    float ao = clamp(1.0 - occ * (0.8 / 12.0), 0.0, 1.0);
    gl_FragColor = vec4(mix(ao, 1.0, smoothstep(40.0, 70.0, z)), z, 0.0, 1.0);
  }`,
});
const aoBlurMat = new THREE.ShaderMaterial({
  uniforms: { tAO: { value: null }, uTexel: { value: new THREE.Vector2() } }, depthTest: false, depthWrite: false, vertexShader: FS_VS,
  fragmentShader: `uniform sampler2D tAO; uniform vec2 uTexel; varying vec2 vUv;
    void main(){ vec2 c = texture2D(tAO, vUv).rg; float s = 0.0, w = 0.0;
      for (int j = -2; j < 2; j++) for (int i = -2; i < 2; i++) { vec2 q = texture2D(tAO, vUv + (vec2(float(i), float(j)) + 0.5) * uTexel).rg; float k = exp(-abs(q.g - c.g) / (0.04 * c.g + 0.02)); s += q.r * k; w += k; }
      gl_FragColor = vec4(s / max(w, 1e-4), c.g, 0.0, 1.0); }`,
});
const aoQuad = new FullScreenQuad(aoMat), aoBlurQuad = new FullScreenQuad(aoBlurMat);
function renderAO() {
  if (!AO_ON) return;
  const th = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  aoMat.uniforms.uProj.value.set(th * camera.aspect, th); aoMat.uniforms.uTexel.value.set(1 / aoRT.width, 1 / aoRT.height); aoBlurMat.uniforms.uTexel.value.copy(aoMat.uniforms.uTexel.value);
  aoMat.uniforms.tDepth.value = rt.depthTexture;
  renderer.setRenderTarget(aoRT); aoQuad.render(renderer);
  aoBlurMat.uniforms.tAO.value = aoRT.texture; renderer.setRenderTarget(aoRT2); aoBlurQuad.render(renderer);
}
const lensMat = new THREE.ShaderMaterial({
  uniforms: {
    tScene: { value: rt.texture }, tDepth: { value: rt.depthTexture }, tAO: { value: aoRT2.texture }, uAO: { value: AO_ON ? 0.85 : 0 },
    uLens: { value: Array.from({ length: MAXV }, () => new THREE.Vector4()) },
    uLensB: { value: Array.from({ length: MAXV }, () => new THREE.Vector4()) },
    uLensC: { value: Array.from({ length: MAXV }, () => new THREE.Vector3()) },
    uAspect: { value: 1 }, uNear: { value: camera.near }, uFar: { value: camera.far }, uDark: { value: 0 },
  },
  depthTest: false, depthWrite: false,
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
  uniform sampler2D tScene; uniform sampler2D tDepth; uniform sampler2D tAO; uniform float uAO;
  uniform vec4 uLens[${MAXV}]; uniform vec4 uLensB[${MAXV}]; uniform vec3 uLensC[${MAXV}];
  uniform float uAspect, uNear, uFar, uDark;
  varying vec2 vUv;
  void main(){
    float dz = texture2D(tDepth, vUv).x;
    float pz = -(uNear*uFar)/((uFar - uNear)*dz - uFar);
    vec2 uv = vUv; float shade = 1.0; vec3 ringc = vec3(0.0);
    for(int i=0;i<${MAXV};i++){
      vec4 L = uLens[i];
      if(L.z <= 0.0) continue;
      float wR = uLensB[i].x;
      float behind = smoothstep(L.w - wR*1.2, L.w + wR*0.4, pz);
      if(behind <= 0.0) continue;
      vec2 d = uv - L.xy; d.x *= uAspect;
      float r = length(d) + 1e-5;
      float rh = L.z, te = rh*1.8;
      float k = (te*te)/(r*r);
      k *= (1.0 - smoothstep(te*3.0, te*10.0, r)) * behind;
      vec2 nd = d*(1.0 - k); nd.x /= uAspect;
      uv = L.xy + nd;
      float hole = 1.0 - smoothstep(rh*0.96, rh*1.03, r);
      shade *= 1.0 - hole*behind;
      float ring = exp(-pow((r - rh*1.06)/(rh*0.025 + 0.0012), 2.0));
      ringc += uLensC[i] * ring * 0.12 / (1.0 + rh*6.0) * uLensB[i].y * behind;
    }
    uv = 1.0 - abs(1.0 - abs(uv));   // light bent in from beyond the frame: mirror, rather than smear the edge pixels
    vec3 col = texture2D(tScene, uv).rgb;
    if (uAO > 0.0) { float lum = max(col.r, max(col.g, col.b)); col *= mix(mix(1.0, texture2D(tAO, uv).r, uAO), 1.0, smoothstep(0.9, 2.8, lum)); }   // lights and glows are not occluded
    col = col * shade + ringc;
    float vig = smoothstep(0.3, 1.1, length((vUv - 0.5)*vec2(uAspect, 1.0))*1.25);
    col *= 1.0 - vig*(0.3 + 0.6*uDark);
    gl_FragColor = vec4(col, 1.0);
  }`,
});
const composer = new EffectComposer(renderer);
composer.addPass(new ShaderPass(lensMat));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.75, 0.5, 0.62);
composer.addPass(bloom);
// after bloom, black the shadows again so glare from a bright sky can't wash them grey
const holeMat = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: null }, tDepth: { value: rt.depthTexture }, uLens: lensMat.uniforms.uLens, uLensB: lensMat.uniforms.uLensB, uAspect: lensMat.uniforms.uAspect, uNear: lensMat.uniforms.uNear, uFar: lensMat.uniforms.uFar },
  depthTest: false, depthWrite: false,
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform vec4 uLens[${MAXV}]; uniform vec4 uLensB[${MAXV}]; uniform float uAspect, uNear, uFar; varying vec2 vUv;
    void main(){
      float dz = texture2D(tDepth, vUv).x, pz = -(uNear*uFar)/((uFar - uNear)*dz - uFar), shade = 1.0;
      for(int i=0;i<${MAXV};i++){ vec4 L = uLens[i]; if(L.z <= 0.0) continue; float wR = uLensB[i].x;
        float behind = smoothstep(L.w - wR*1.2, L.w + wR*0.4, pz); vec2 d = vUv - L.xy; d.x *= uAspect;
        shade *= 1.0 - (1.0 - smoothstep(L.z*0.8, L.z*0.99, length(d))) * behind; }
      vec3 c = texture2D(tDiffuse, vUv).rgb * shade;
      // grade: a touch more colour, cool shadows and warm highlights
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = max(mix(vec3(l), c, 1.1), 0.0);
      c *= mix(vec3(0.95, 1.0, 1.06), vec3(1.04, 1.0, 0.95), smoothstep(0.015, 0.7, l));
      gl_FragColor = vec4(c, 1.0);
    }`,
});
composer.addPass(new ShaderPass(holeMat));
composer.addPass(new OutputPass());

function onResize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  bloom.resolution.set(innerWidth / 2, innerHeight / 2);
  makeRT(); lensMat.uniforms.tScene.value = rt.texture; lensMat.uniforms.tDepth.value = rt.depthTexture; lensMat.uniforms.tAO.value = aoRT2.texture; holeMat.uniforms.tDepth.value = rt.depthTexture;
}
addEventListener('resize', onResize);

// ------------------------------------------------------------------ audio
const A = { ctx: null, on: true };
function initAudio() {
  if (A.ctx) return;
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)(); A.ctx = ac;
    const master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination); A.master = master;
    master.gain.setTargetAtTime(0.55, ac.currentTime, 2.5);
    // space: feedback delay
    const dl = ac.createDelay(2), fb = ac.createGain(), dlf = ac.createBiquadFilter(), wet = ac.createGain();
    dl.delayTime.value = 0.43; fb.gain.value = 0.55; dlf.type = 'lowpass'; dlf.frequency.value = 2200; wet.gain.value = 0.5;
    dl.connect(dlf); dlf.connect(fb); fb.connect(dl); dlf.connect(wet); wet.connect(master); A.send = dl;
    // garden pad: brightness follows the light around you
    const pf = ac.createBiquadFilter(); pf.type = 'lowpass'; pf.frequency.value = 1600; pf.Q.value = 0.6;
    const pg = ac.createGain(); pg.gain.value = 0.16; pf.connect(pg); pg.connect(master); pg.connect(dl);
    A.padF = pf; A.padG = pg;
    [146.83, 220.0, 293.66, 329.63, 369.99, 440.0, 554.37].forEach((f, i) => {
      for (const det of [-5, 5]) {
        const o = ac.createOscillator(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
        o.type = i < 2 ? 'sine' : 'triangle'; o.frequency.value = f; o.detune.value = det; o._det = det; (A.oscs = A.oscs || []).push(o);
        lfo.frequency.value = 0.05 + Math.random() * 0.1; lg.gain.value = 0.025;
        lfo.connect(lg); lg.connect(g.gain); g.gain.value = 0.035;
        o.connect(g); g.connect(pf); o.start(); lfo.start();
      }
    });
    // void rumble: sub + filtered noise
    const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    A.noise = buf;
    const rg = ac.createGain(); rg.gain.value = 0; rg.connect(master); A.rumble = rg;
    for (const f of [36.7, 55.0]) { const o = ac.createOscillator(); o.frequency.value = f; const g = ac.createGain(); g.gain.value = 0.5; o.connect(g); g.connect(rg); o.start(); }
    const ns = ac.createBufferSource(); ns.buffer = buf; ns.loop = true;
    const nf = ac.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 110; nf.Q.value = 1.2;
    const ng = ac.createGain(); ng.gain.value = 0.9; ns.connect(nf); nf.connect(ng); ng.connect(rg); ns.start();
  } catch (e) { A.ctx = null; }
}
function chime(L) {
  const ac = A.ctx, t = ac.currentTime, notes = [880, 987.77, 1174.66, 1318.51, 1479.98, 1760, 1975.53];
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine'; o.frequency.value = notes[Math.floor(Math.random() * notes.length)] * (Math.random() < 0.3 ? 2 : 1) / Math.sqrt(playerF);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03 * L, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
  o.connect(g); g.connect(A.master); g.connect(A.send); o.start(t); o.stop(t + 2.3);
}
function inhale(vol, k = 1) {
  const ac = A.ctx, t = ac.currentTime;
  const s = ac.createBufferSource(); s.buffer = A.noise; s.loop = true;
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 6;
  const dur = 3.2 * Math.sqrt(k);
  f.frequency.setValueAtTime(5000 / Math.sqrt(k), t); f.frequency.exponentialRampToValueAtTime(70 / k, t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.32 * vol, t + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.4);
  s.connect(f); f.connect(g); g.connect(A.master); g.connect(A.send); s.start(t); s.stop(t + dur + 0.5);
}
function setSound(on) {
  A.on = on; $('bSound').textContent = 'sound: ' + (on ? 'on' : 'off');
  if (!A.ctx) return;
  A.master.gain.setTargetAtTime(on ? 0.55 : 0, A.ctx.currentTime, 0.3);
  if (on && A.ctx.state === 'suspended') A.ctx.resume();
}

// ------------------------------------------------------------------ controls
const player = new THREE.Vector3(layout.start.x, 1.65, layout.start.z);
let yaw = 0, pitch = 0.02, started = false, mouseDown = false, bobPhase = 0;
const keys = new Set();
const grav = new THREE.Vector3();
addEventListener('keydown', e => {
  keys.add(e.code);
  if (!started) return;
  if (e.code === 'KeyE' || e.code === 'Space') { openVoid(); e.preventDefault(); }
  if (e.code === 'KeyM') setSound(!A.on);
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
function tryLock() { if (isTouch) return; try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
canvas.addEventListener('mousedown', () => { mouseDown = true; if (started && document.pointerLockElement !== canvas) tryLock(); });
addEventListener('mouseup', () => { mouseDown = false; });
addEventListener('mousemove', e => {
  if (!started || isTouch) return;
  if (document.pointerLockElement === canvas || mouseDown) {
    yaw -= e.movementX * 0.0022; pitch -= e.movementY * 0.0022; pitch = Math.max(-1.35, Math.min(1.35, pitch));
  }
});
const touches = new Map(); let lastTap = 0;
const moveTouch = { x: 0, y: 0 };
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  for (const t of e.changedTouches) touches.set(t.identifier, { type: t.clientX < innerWidth / 2 ? 'move' : 'look', x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, t0: performance.now() });
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    const o = touches.get(t.identifier); if (!o) continue;
    if (o.type === 'look') { yaw -= (t.clientX - o.x) * 0.0055; pitch -= (t.clientY - o.y) * 0.0055; pitch = Math.max(-1.35, Math.min(1.35, pitch)); }
    o.x = t.clientX; o.y = t.clientY;
  }
}, { passive: false });
const endTouch = e => {
  for (const t of e.changedTouches) {
    const o = touches.get(t.identifier);
    if (o) {
      const quick = performance.now() - o.t0 < 260 && Math.hypot(o.x - o.x0, o.y - o.y0) < 14, now = performance.now();
      if (quick) { if (now - lastTap < 380) { openVoid(); lastTap = 0; } else lastTap = now; }
    }
    touches.delete(t.identifier);
  }
};
canvas.addEventListener('touchend', endTouch); canvas.addEventListener('touchcancel', endTouch);

function openVoid() {
  const k = 0.4 + 1.8 * Math.pow(Math.random(), 1.6);
  const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const p = player.clone().addScaledVector(f, 6 + 4 * k); p.y = Math.max(2.3, 1.4 + 1.3 * k);
  if (Math.hypot(p.x, p.z) > 90) return;
  for (const v of voidSlots) if (v && v.pos.distanceTo(p) < 3 + 2 * (k + v.k)) return;
  let slot = voidSlots.findIndex(v => !v);
  if (slot < 0) { // reuse the oldest void you made, else the farthest sleeping one
    let best = -1, score = -1e9;
    voidSlots.forEach((v, i) => { const s = v.giant ? -1e9 : v.spawned ? 1e6 - v.born : (v.wake < 0.05 ? v.pos.distanceTo(player) : -1e5); if (s > score) { score = s; best = i; } });
    slot = best;
  }
  makeVoid(p.x, p.y, p.z, slot, k, true);
}
// how hard the voids tug on the walker: a slider, remembered between visits where the browser allows
let PULL = 0.55; try { const v = parseFloat(localStorage.getItem('gd.pull')); if (v >= 0 && v <= 1.5) PULL = v; } catch (e) {}
const setPull = v => { PULL = v; $('pSlider').value = Math.round(v * 100); $('bPull').textContent = `pull ${Math.round(v * 100)}%`; try { localStorage.setItem('gd.pull', String(v)); } catch (e) {} };
$('pSlider').addEventListener('input', e => { e.stopPropagation(); setPull(e.target.value / 100); });
$('bPull').addEventListener('click', e => { e.stopPropagation(); setPull(PULL > 0.02 ? 0 : 0.55); });
setPull(PULL);
$('bVoid').addEventListener('click', e => { e.stopPropagation(); if (started) openVoid(); });
$('bSound').addEventListener('click', e => { e.stopPropagation(); initAudio(); setSound(!A.on); });

const hint = $('hint');
function setHint(t, ms = 9000) { hint.textContent = t; hint.style.opacity = 1; clearTimeout(setHint.h); setHint.h = setTimeout(() => hint.style.opacity = 0, ms); }

$('enter').addEventListener('click', () => {
  started = true; $('intro').classList.add('gone'); $('hud').classList.add('on');
  initAudio(); setSound(true); tryLock();
  setHint(isTouch ? 'walk through the arches · something is waiting past them' : 'walk through the arches · something is waiting past them · Esc frees the mouse');
});

// ------------------------------------------------------------------ time of day
// The garden's entrance faces south (−z), so west is +x. Latitude ≈ 42°N; longitude is
// taken from your time zone's standard meridian, so "live" sun is right to within ~half an hour.
const D2R = Math.PI / 180;
function sunDirAt(date) {
  const lat = 42.4 * D2R, y = date.getFullYear();
  const stdOff = Math.max(new Date(y, 0, 1).getTimezoneOffset(), new Date(y, 6, 1).getTimezoneOffset());
  const lon = -stdOff / 4;
  const n = Math.floor((date - new Date(y, 0, 0)) / 864e5);
  const B = 2 * Math.PI * (n - 81) / 364, eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  const utcH = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const H = ((utcH + lon / 15 + eot / 60) - 12) * 15 * D2R;
  const dec = 23.44 * D2R * Math.sin(2 * Math.PI * (284 + n) / 365);
  const el = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)); // from south, + toward west
  return new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az));
}
// ------------------------------------------------------------------ the garden's calendar, your watch, and time dilation
const SPEEDS = [0, 1, 7, 30], SPEED_LBL = ['season: paused', '1 day / s', '1 week / s', '1 month / s'];
let speedIdx = 0, gardenDays = 0, yourDays = 0, playerF = 1;
const calDoy = () => garden.seasons.DOY0 + gardenDays;
const dilJS = (x, y, z) => { let s = 0; for (const v of voidSlots) if (v) s += v.R * U.uGT.value / Math.max(0.05, Math.hypot(x - v.pos.x, y - v.pos.y, z - v.pos.z)); return Math.sqrt(Math.max(0.0144, 1 - s)); };
const fmtDur = d => { d = Math.abs(d); if (d < 1) return `${Math.round(d * 24)} h`; if (d < 60) return `${Math.round(d)} days`; if (d < 730) return `${(d / 30.4).toFixed(1)} months`; return `${(d / 365).toFixed(1)} years`; };
function refreshSeasonUI() {
  const d = calDoy(), yr = Math.floor(d / 365) + 1;
  $('dLabel').textContent = `${doyLabel(d)} · yr ${yr}`; $('bSpeed').textContent = SPEED_LBL[speedIdx];
  if (document.activeElement !== $('dSlider')) $('dSlider').value = ((Math.floor(d) % 365) + 365) % 365;
}
$('bSpeed').addEventListener('click', e => { e.stopPropagation(); speedIdx = (speedIdx + 1) % SPEEDS.length; refreshSeasonUI(); if (speedIdx === 1) setHint('seasons running · near a void, time slows: its plants fall behind the calendar', 7000); });
$('dSlider').addEventListener('input', e => { e.stopPropagation(); const cur = ((calDoy() % 365) + 365) % 365; let dd = parseFloat(e.target.value) - cur; if (dd > 182) dd -= 365; if (dd < -182) dd += 365; gardenDays += dd; yourDays += dd; garden.seasons.jump(dd); refreshSeasonUI(); refreshTimeUI(); });
for (const ev of ['mousedown', 'touchstart']) $('dSlider').addEventListener(ev, e => e.stopPropagation(), { passive: true });
$('bReplant').addEventListener('click', e => { e.stopPropagation(); garden.seasons.replant(); setHint('replanted · they will fill in over about three years', 6000); });
addEventListener('keydown', e => {
  if (!started) return;
  if (e.code === 'KeyS') $('bSpeed').click();
  if (e.code === 'KeyR') $('bReplant').click();
});

let timeMode = 'night', manualHour = 12;
try { const m = localStorage.getItem('umbra-time'); if (m === 'live' || m === 'night') timeMode = m; } catch (e) {}
const fmtTime = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
function garderDate() {   // the garden's calendar date (it sets the sun's height), at the chosen hour
  const now = new Date(), [m, dd] = doyToMonthDay(calDoy());
  if (timeMode === 'live') return now;   // live is the real sky right now: today's date as well as the clock (the plants keep the garden's own season)
  const h = timeMode === 'live' ? now.getHours() + now.getMinutes() / 60 : timeMode === 'night' ? 23 : manualHour;
  return new Date(now.getFullYear(), m, dd, Math.floor(h), Math.round((h % 1) * 60));
}
function refreshTimeUI() {
  const d = garderDate();
  $('bTime').textContent = timeMode === 'night' ? 'time: night' : (timeMode === 'live' ? 'live · ' : 'set · ') + fmtTime(d);
  if (timeMode !== 'manual') $('tSlider').value = d.getHours() + d.getMinutes() / 60;
}
function setTimeMode(m) {
  timeMode = m; try { if (m !== 'manual') localStorage.setItem('umbra-time', m); } catch (e) {}
  refreshTimeUI();
  if (m === 'live') setHint('live time · the sun and sky are where they really are right now', 5000);
}
$('bTime').addEventListener('click', e => { e.stopPropagation(); setTimeMode(timeMode === 'live' ? 'night' : 'live'); });
$('tSlider').addEventListener('input', e => { e.stopPropagation(); manualHour = parseFloat(e.target.value); timeMode = 'manual'; refreshTimeUI(); });
$('tSlider').addEventListener('mousedown', e => e.stopPropagation());
$('tSlider').addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
addEventListener('keydown', e => { if (started && e.code === 'KeyT') setTimeMode(timeMode === 'live' ? 'night' : 'live'); });
refreshTimeUI(); setInterval(refreshTimeUI, 15000); refreshSeasonUI();

const _a = new THREE.Vector3(), _sunCol = new THREE.Color(), FOG_NIGHT = new THREE.Color(0.004, 0.006, 0.012), FOG_DAY = new THREE.Color(0.40, 0.48, 0.60), FOG_TWI = new THREE.Color(0.30, 0.17, 0.14);
const lightDir = new THREE.Vector3(0, 1, 0);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function applyTimeOfDay() {
  const sd = sunDirAt(garderDate()), sy = sd.y;
  const day = sstep(-0.10, 0.22, sy), twi = Math.exp(-(((sy + 0.02) / 0.11) ** 2));
  U.uSunDir.value.copy(sd); U.uDay.value = day; U.uTwi.value = twi;
  // ambient: moonlight → skylight, with warm twilight
  _a.set(0.030, 0.040, 0.072).lerp(new THREE.Vector3(0.42, 0.50, 0.64), day).add(new THREE.Vector3(0.10, 0.05, 0.035).multiplyScalar(twi));
  U.uAmb.value.copy(_a);
  _sunCol.setRGB(1.0, 0.55, 0.30).lerp(new THREE.Color(1.0, 0.95, 0.88), sstep(0.0, 0.35, sy));
  const sunPhys = 3.6 * sstep(-0.02, 0.25, sy);
  U.uSun.value.set(_sunCol.r, _sunCol.g, _sunCol.b).multiplyScalar(sunPhys * Math.max(sy, 0) / Math.PI * 1.3);
  U.uSunCol.value.set(_sunCol.r, _sunCol.g, _sunCol.b).multiplyScalar(sunPhys);
  if (sy > -0.03) { sunLight.color.copy(_sunCol); sunLight.intensity = sunPhys; lightDir.copy(sd); }
  else { sunLight.color.setRGB(0.55, 0.66, 1.0); sunLight.intensity = 0.3 * (1 - day); lightDir.copy(MOON_DIR); }
  hemi.intensity = 0.05 + 0.3 * (1 - day);
  U.uFogColor.value.copy(FOG_NIGHT).lerp(FOG_DAY, day).lerp(FOG_TWI, twi * 0.5 * (1 - day * 0.6));
  U.uLightGain.value = 1 - 0.45 * sstep(0.12, 0.5, sy);   // the exhibit's lights stay up until the sun is well clear of the wall
  U.uStarGain.value = (1 - day) ** 3;
  moon.material.color.copy(MOON_COL).multiplyScalar(1 - day); moon.visible = day < 0.98;
  scene.fog.color.copy(U.uFogColor.value);
  refreshEnv(`${Math.round(sy * 80)}|${Math.round(day * 20)}|${Math.round(twi * 10)}`, clock.elapsedTime);
  renderer.toneMappingExposure = 1.05 + 0.12 * day;
  U.uFogDensity.value = 0.0125 - 0.0072 * day; scene.fog.density = U.uFogDensity.value;
  bloom.threshold = 0.62 + 0.5 * day; bloom.strength = 0.75 - 0.3 * day;
}

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
const tmpV = new THREE.Vector3(), tmpP = new THREE.Vector3();
let firstWake = false;

function update(dt, t) {
  // movement
  const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  let mx = 0, mz = 0;
  if (started) {
    if (keys.has('KeyW') || keys.has('ArrowUp')) mz += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) mz -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
    for (const o of touches.values()) if (o.type === 'move') { mx += (o.x - o.x0) / 70; mz -= (o.y - o.y0) / 70; }
  }
  const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight')) ? 6.2 : 3.2;
  const move = f.clone().multiplyScalar(mz * speed).addScaledVector(r, mx * speed);

  // voids: wake, drift, pull
  grav.set(0, 0, 0);
  let near = 0, nearPull = 0;
  for (const v of voidSlots) {
    if (!v) continue;
    const d = player.distanceTo(v.pos);
    const k = v.k, wakeR = v.giant ? 25 : 5.5 + 7 * Math.pow(k, 0.9);
    let target = started && d < wakeR ? 1 : 0; if (v.giant) target = Math.max(target, 0.4);   // it never fully sleeps
    const rate = target > v.wake ? 0.45 : 0.08;
    v.wake += (target - v.wake) * Math.min(1, dt * rate);
    v.scar = Math.max(v.scar - dt / 40, v.wake);
    v.drain = Math.max(v.wake, v.scar * 0.8);
    const w = v.wake * v.wake * (3 - 2 * v.wake);
    v.R = (0.18 + 1.0 * w + 0.05 * Math.sin(t * 1.3 + v.seed) * w) * k;
    v.reach = (2.5 + 15.5 * v.drain) * Math.pow(k, 0.85); v.reach = Math.min(v.reach, v.giant ? 21 : 13);
    if (v.giant) { if (!v.wasAwake && v.wake > 0.6) { v.wasAwake = true; if (A.ctx && A.on) inhale(1.4, 3.5); } if (v.wake < 0.5) v.wasAwake = false; }
    else if (!v.wasAwake && v.wake > 0.04) { v.wasAwake = true; if (A.ctx && A.on) inhale(Math.min(1.3, 0.45 + 0.4 * k), k); if (!firstWake) { firstWake = true; setHint('it noticed you · walk away and the light comes back', 7000); } }
    if (v.wake < 0.02) v.wasAwake = false;
    // drift toward the walker, tethered to home
    const desired = tmpP.copy(v.home);
    if (v.wake > 0.2 && !v.giant) {
      const teth = 8 * Math.sqrt(k), keep = 3.5 + 1.5 * k;
      tmpV.set(player.x - v.home.x, 0, player.z - v.home.z); if (tmpV.length() > teth) tmpV.setLength(teth); desired.add(tmpV);
      tmpV.set(desired.x - player.x, 0, desired.z - player.z);
      if (tmpV.length() < keep) { tmpV.setLength(keep); desired.x = player.x + tmpV.x; desired.z = player.z + tmpV.z; }
    }
    desired.y = v.home.y + Math.sin(t * 0.4 + v.seed) * (v.giant ? 0.25 : 0.3 * k);
    tmpV.subVectors(desired, v.pos); const step = (v.wake > 0.2 ? 0.4 * v.wake : 0.25) / Math.sqrt(k) * dt;
    if (tmpV.length() > step) tmpV.setLength(step); v.pos.add(tmpV);
    // gravity on the walker
    tmpV.set(v.pos.x - player.x, 0, v.pos.z - player.z); const dh = tmpV.length();
    const pull = v.giant ? 1.25 * w * (1 - Math.min(1, Math.max(0, (dh - 4) / 19))) : 2.4 * w * Math.pow(k, 0.7) * (1 - Math.min(1, Math.max(0, (dh - 2) / (13 * Math.pow(k, 0.6)))));
    if (dh > 0.01) grav.addScaledVector(tmpV.normalize(), pull * PULL);
    const prox = w * Math.max(0, 1 - d / (18 * Math.pow(k, 0.7))) * Math.min(1, 0.4 + 0.6 * k); near = Math.max(near, prox); nearPull = Math.max(nearPull, pull);
  }
  if (grav.length() > 2.8) grav.setLength(2.8);
  { // walk, sliding along hedges, pools and trunks
    const sx = (move.x + grav.x) * dt, sz = (move.z + grav.z) * dt, nx = player.x + sx, nz = player.z + sz;
    if (!garden.blocked(nx, nz)) { player.x = nx; player.z = nz; }
    else if (!garden.blocked(nx, player.z)) player.x = nx;
    else if (!garden.blocked(player.x, nz)) player.z = nz;
  }
  // can't cross the horizon
  for (const v of voidSlots) {
    if (!v) continue;
    if (Math.abs(v.pos.y - 1.65) > v.R + 0.8) continue;   // you can walk beneath the big ones
    tmpV.set(player.x - v.pos.x, 0, player.z - v.pos.z); const dh = tmpV.length(), minD = v.R + 1.0;
    if (dh < minD) { tmpV.setLength(minD); player.x = v.pos.x + tmpV.x; player.z = v.pos.z + tmpV.z; }
  }
  player.x = Math.max(layout.B.x0 + 0.4, Math.min(layout.B.x1 - 0.4, player.x)); player.z = Math.max(layout.B.z0 + 0.4, Math.min(layout.B.z1 - 0.4, player.z));

  const moving = Math.min(1, Math.hypot(mx, mz));
  bobPhase += dt * moving * speed * 2.2;
  camera.position.set(player.x, 1.65 + Math.sin(bobPhase) * 0.035 * moving, player.z);
  camera.rotation.set(pitch, yaw, 0);
  camera.fov = 70 + 7 * near; camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  U.uGust.value = 0.5 + 0.5 * Math.sin(t * 0.31) * Math.sin(t * 0.17 + 1.0);
  { const S = 52 / sunLight.shadow.mapSize.x;
    sunLight.target.position.set(Math.round(player.x / S) * S, 0, Math.round(player.z / S) * S);
    sunLight.position.copy(sunLight.target.position).addScaledVector(lightDir, 160); sunLight.target.updateMatrixWorld(); }
  U.uPx.value = (innerHeight * PR) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  // time: your watch runs at real time; the garden's calendar runs faster for you the deeper you stand in a well,
  // and every plant integrates its own proper time from the calendar at its own depth
  playerF = dilJS(camera.position.x, camera.position.y, camera.position.z); U.uPlayerF.value = playerF;
  { const rate = SPEEDS[speedIdx], dCal = dt * rate / playerF;
    if (rate > 0) { gardenDays += dCal; yourDays += dt * rate; garden.seasons.advance(dCal, dilJS); }
    garden.setLawnSeason(calDoy());
    if (rate > 0 && (t * 4 | 0) !== ((t - dt) * 4 | 0)) { refreshSeasonUI(); }
    const gap = gardenDays - yourDays, show = playerF < 0.985 || gap > 0.5, el = $('dil');
    el.style.opacity = show ? 1 : 0;
    if (show) el.innerHTML = `time here runs at <b>${Math.round(playerF * 100)}%</b>${rate ? ` · the garden runs <b>${(1 / playerF).toFixed(playerF < 0.5 ? 1 : 2)}×</b> for you` : ''}${gap > 0.5 ? `<br>you are ${fmtDur(gap)} younger than the garden` : ''}`;
  }

  // uniforms
  const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  voidSlots.forEach((v, i) => {
    const lu = lensMat.uniforms;
    if (!v) { mirrorVoids[i].visible = false; U.uVoid.value[i].set(0, -100, 0, 0); U.uVoidAux.value[i].set(0, 0, 0, 0); lu.uLens.value[i].set(0, 0, 0, 0); return; }
    U.uVoid.value[i].set(v.pos.x, v.pos.y, v.pos.z, v.drain);
    mirrorVoids[i].visible = true; mirrorVoids[i].position.copy(v.pos); mirrorVoids[i].scale.setScalar(v.R);
    U.uVoidAux.value[i].set(v.R, v.wake, v.reach, v.k);
    U.uVoidCol.value[i].copy(v.col);
    tmpV.copy(v.pos).applyMatrix4(camera.matrixWorldInverse); const dist = -tmpV.z;
    if (dist < 0.05) { lu.uLens.value[i].set(0, 0, 0, 0); return; }
    tmpP.copy(v.pos).project(camera);
    lu.uLens.value[i].set(tmpP.x * 0.5 + 0.5, tmpP.y * 0.5 + 0.5, (v.R / dist) / tanH * 0.5, dist);
    lu.uLensB.value[i].set(v.R, v.wake, 0, 0); lu.uLensC.value[i].copy(v.col);
  });
  { const G = voidSlots[GIANT]; if (G) { diskU.uGiant.value.set(G.pos.x, G.pos.y, G.pos.z, G.R); diskU.uGW.value = 0.25 + 0.75 * G.wake;
      U.uDiskPos.value.copy(G.pos); U.uDiskGlow.value.set(1.0, 0.62, 0.32).multiplyScalar(0.55 * (0.2 + 0.8 * G.wake)); } }
  const Lhere = drainAtJS(tmpP.copy(player));
  lensMat.uniforms.uAspect.value = innerWidth / innerHeight;
  lensMat.uniforms.uDark.value = Math.max(1 - Lhere, near * 0.6);

  // sound follows the light
  if (A.ctx && A.on) {
    const ct = A.ctx.currentTime;
    A.padF.frequency.setTargetAtTime(140 + 2700 * Lhere * Lhere, ct, 0.4);
    { const shift = Math.min(900, 1200 * Math.log2(1 / playerF) * 0.5); for (const o of A.oscs || []) o.detune.setTargetAtTime(o._det + shift, ct, 0.3); }
    A.padG.gain.setTargetAtTime(0.05 + 0.13 * Lhere, ct, 0.5);
    A.rumble.gain.setTargetAtTime(0.32 * near + 0.05 * nearPull, ct, 0.4);
    if (Math.random() < dt * 1.6 * Lhere * Lhere) chime(Lhere);
  }
}

let slowT = 1 / 60, prAt = 0, fpsS = 60, fpsAt = 0, showFps = QS.has('fps');
addEventListener('keydown', e => { if (e.code === 'KeyF' && !e.metaKey && !e.ctrlKey) { showFps = !showFps; if (!showFps) $('title').textContent = 'GARDEN OF DELIGHT'; } });
function frame() {
  const rawDt = clock.getDelta(), dt = Math.min(rawDt, 0.05), t = clock.elapsedTime;
  U.uTime.value = t;
  applyTimeOfDay();
  if (!started) { yaw = Math.sin(t * 0.07) * 0.12; pitch = 0.04 + Math.sin(t * 0.05) * 0.02; }
  update(dt, t);
  garden.update(dt, t, camera);
  garden.preRender(camera, bufW, bufH);
  renderer.shadowMap.needsUpdate = true;
  renderer.setRenderTarget(rt); renderer.render(scene, camera);
  renderAO();
  renderer.setRenderTarget(null);
  composer.render(dt);
  fpsS = fpsS * 0.94 + 0.06 / Math.max(rawDt, 1e-3);
  if (showFps && t - fpsAt > 0.5) { fpsAt = t; $('title').textContent = `GARDEN OF DELIGHT · ${Math.round(fpsS)} fps · ${bufW}×${bufH}`; }
  // adaptive resolution: if frames run slow for a while, render fewer pixels (never under test)
  if (started && !TEST) { slowT = slowT * 0.97 + rawDt * 0.03; if (t - prAt > 2.5 && slowT > 1 / 40 && PR > 0.7) { PR = Math.max(0.7, PR * 0.86); prAt = t; slowT = 1 / 60;
    renderer.setPixelRatio(PR); composer.setPixelRatio(PR); starPR.value = PR; onResize(); } } else prAt = t + 3;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
$('enter').disabled = false; $('enter').textContent = 'enter the garden';
window.__umbra = { // debug handle
  treeSpecs,
  simulate(days, giantWake) {   // headless testing: advance the calendar in steps with the giant held awake
    const G = voidSlots[GIANT]; for (let i = 0; i < 60; i++) { if (giantWake != null) { G.wake = giantWake; G.R = (0.18 + 1.0) * G.k; }
      const f = dilJS(camera.position.x, camera.position.y, camera.position.z), d = days / 60; gardenDays += d / f; yourDays += d; garden.seasons.advance(d / f, dilJS); }
    refreshSeasonUI(); refreshTimeUI();
  },
  setHour(h) { manualHour = h; timeMode = 'manual'; refreshTimeUI(); }, voidSlots, player, get started() { return started; }, set view(v) { yaw = v[0]; pitch = v[1]; }, forceStart() { started = true; $('intro').classList.add('gone'); } };
