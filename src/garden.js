// garden.js — the English cottage garden that the light exhibit (and its voids) live in.
// Plants come from Shortwood Meadow's PlantArt: procedural leaf/flower textures and plant structure,
// packed into two texture atlases so thousands of plants draw in a few hundred instanced calls.
import * as THREE from 'three';
import { PlantArt } from './plantart.js';
import { LOOKS, SIZE } from './looks.js';

const TAU = Math.PI * 2, IN = 0.0254;
export const WATER_Y = 0.35;
const V3 = THREE.Vector3, Q = THREE.Quaternion;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const _Y = new V3(0, 1, 0);
function ihash(a, b, c = 0) { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vn2(x, y, s = 0) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(ihash(xi, yi, s), ihash(xi + 1, yi, s), u), lerp(ihash(xi, yi + 1, s), ihash(xi + 1, yi + 1, s), u), v); }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

// ======================================================================= layout
export function makeLayout() {
  const loopPts = [[0, 62], [-26, 48], [-38, 18], [-34, -14], [-12, -40], [18, -44], [40, -22], [44, 10], [30, 40]];
  const loopCurve = new THREE.CatmullRomCurve3(loopPts.map(([x, z]) => new V3(x, 0, z)), true, 'centripetal');
  const loopLen = loopCurve.getLength();
  const NL = Math.ceil(loopLen * 2), loopS = [];
  for (let i = 0; i < NL; i++) { const t = i / NL, p = loopCurve.getPointAt(t), g = loopCurve.getTangentAt(t); loopS.push({ x: p.x, z: p.z, tx: g.x, tz: g.z, t }); }
  const borderT = [[0.035, 0.13], [0.37, 0.46], [0.60, 0.70], [0.86, 0.955]];
  const inBorderT = t => borderT.some(([a, b]) => t >= a && t <= b);
  const meadows = [{ x: -50, z: -30, r: 22 }, { x: 50, z: 45, r: 18 }];
  const globeLawn = { x: 60, z: -4, r: 10 };
  const pools = [{ x: 0, z: 0, r: 5.0, kind: 'grand' }, { x: -27, z: 0, r: 2.3, kind: 'bowl' }, { x: 29, z: 0, r: 2.3, kind: 'bowl' }];
  const canal = { hw: 1.3, z0: 22, z1: 60 };
  const radial = [[[-15.5, 0], [-37.2, 0]], [[15.5, 0], [43.6, 0]], [[0, -15.5], [0, -42.2]]];
  const pathS = [];
  for (let z = 96; z >= 60; z -= 0.5) pathS.push([0, z]);
  for (const s of loopS) pathS.push([s.x, s.z]);
  for (const [a, b] of radial) { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let d = 0; d <= L; d += 0.5) pathS.push([a[0] + (b[0] - a[0]) * d / L, a[1] + (b[1] - a[1]) * d / L]); }
  for (let z = 22; z <= 62; z += 0.5) { pathS.push([2.5, z]); pathS.push([-2.5, z]); }
  function distToPath(x, z) { let m = 1e9; for (const p of pathS) { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < m) m = d; } return Math.sqrt(m); }
  function nearestLoop(x, z) { let m = 1e9, best = null; for (const s of loopS) { const d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < m) { m = d; best = s; } } return { d: Math.sqrt(m), s: best }; }
  const borderBand = (x, z) => { const n = nearestLoop(x, z); return n.d > 1.2 && n.d < 5.6 && inBorderT(n.s.t); };
  function isFormal(x, z) {
    const r = Math.hypot(x, z);
    if (r < 18.5) return true;
    if (Math.abs(x) < 8 && z > 18 && z < 97) return true;
    if (Math.abs(z) < 5 && Math.abs(x) > 14 && Math.abs(x) < 46) return true;
    if (Math.abs(x) < 5 && z < -14 && z > -44) return true;
    for (const p of pools) if (Math.hypot(x - p.x, z - p.z) < p.r + 4.5) return true;
    if (Math.hypot(x - globeLawn.x, z - globeLawn.z) < globeLawn.r + 1) return true;
    return false;
  }
  return { loopPts, loopCurve, loopLen, loopS, pathS, distToPath, nearestLoop, borderBand, inBorderT, borderT, meadows, globeLawn, pools, canal, radial, isFormal };
}

// ======================================================================= material patcher
// Adds wind sway, atlas sub-rects, cupped flower discs, and — on every lit surface — the exhibit's
// light pools and the voids' drain, so the garden itself goes dark around an awake void.
export function makePatcher(U, COMMON) {
  const VHEAD = `uniform float uWind; uniform float uGust; uniform vec2 uWindDir; uniform float uSway; uniform float uSwayH; uniform float uTime;
varying vec3 vWPos;
#ifdef ATLAS
attribute vec4 aRect;
#endif
#ifdef DISC
attribute vec2 aShape;
#endif
`;
  const VPROJ = `
vec4 wp = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
wp = instanceMatrix * wp;
#endif
wp = modelMatrix * wp;
if (uSway > 0.0) {
  #ifdef USE_INSTANCING
  vec3 org = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #else
  vec3 org = wp.xyz;
  #endif
  float hh = max(wp.y, 0.0);
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
  const FHEAD = COMMON + `\nuniform float uExhibit; varying vec3 vWPos;\n`;
  const FDRAIN = `{
  float Ld = drainAt(vWPos);
  vec3 exh = groundLight(vWPos.xz) * uExhibit * uLightGain * clamp(1.25 - vWPos.y * 0.12, 0.35, 1.25);
  outgoingLight = outgoingLight * mix(1.0, Ld, 0.93) + diffuseColor.rgb * exh * Ld;
}`;
  function patch(m, o = {}) {
    m.defines = Object.assign(m.defines || {}, o.atlas ? { ATLAS: '' } : {}, o.disc ? { DISC: '' } : {});
    const key = ['g', o.sway || 0, o.swayH || 0.9, o.atlas ? 'a' : '', o.disc ? 'd' : '', o.depth ? 'z' : '', o.key || ''].join('|');
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.uniforms.uSway = { value: o.sway || 0 }; sh.uniforms.uSwayH = { value: o.swayH || 0.9 };
      let v = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VHEAD).replace('#include <project_vertex>', VPROJ);
      if (o.atlas) v = v.replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef ATLAS\nvMapUv = vMapUv * aRect.zw + aRect.xy;\n#endif');
      if (o.disc) {
        v = v.replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef DISC
{ float rr = length(position.xz) / 0.5; transformed.y += aShape.x * rr * rr * 0.5 + (rr < 0.34 ? aShape.y * 0.5 * (1.0 - rr / 0.34) : 0.0); }
#endif`);
        v = v.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
#ifdef DISC
objectNormal = normalize(vec3(-4.0 * aShape.x * position.x, 1.0, -4.0 * aShape.x * position.z));
#endif`);
      }
      sh.vertexShader = v;
      if (!o.depth) sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FHEAD).replace('#include <opaque_fragment>', FDRAIN + '\n#include <opaque_fragment>');
      if (o.extra) o.extra(sh);
    };
    m.customProgramCacheKey = () => key;
    return m;
  }
  const std = (params, o = {}) => patch(new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.85, metalness: 0 }, params)), o);
  const depth = (map, o = {}) => patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: map || null, alphaTest: map ? 0.4 : 0 }), Object.assign({}, o, { depth: true }));
  return { patch, std, depth };
}

// ======================================================================= textures
function noiseTex(w, h, base, specks, seed = 1) {
  const [c, g] = canvas(w, h); g.fillStyle = base; g.fillRect(0, 0, w, h);
  const r = PlantArt.rngOf(w * 31 + specks.length + seed * 977);
  for (const [n, cols, size, shape] of specks) for (let i = 0; i < n; i++) {
    g.fillStyle = cols[Math.floor(r() * cols.length)]; const x = r() * w, y = r() * h, s = size[0] + r() * (size[1] - size[0]);
    g.save(); g.translate(x, y); g.rotate(r() * TAU);
    if (shape === 'blade') g.fillRect(-s * 0.08, -s, s * 0.16, s);
    else if (shape === 'chip') { g.beginPath(); g.ellipse(0, 0, s, s * (0.25 + r() * 0.3), 0, 0, TAU); g.fill(); }
    else { g.beginPath(); g.arc(0, 0, s, 0, TAU); g.fill(); }
    g.restore();
  }
  return c;
}
function texOf(c, renderer, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t;
}
function leafCard(g, x, y, ang, len, wid, shade) {
  g.save(); g.translate(x, y); g.rotate(ang);
  g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(wid, -len * 0.25, wid * 0.9, -len * 0.75, 0, -len); g.bezierCurveTo(-wid * 0.9, -len * 0.75, -wid, -len * 0.25, 0, 0);
  const gr = g.createLinearGradient(-wid, 0, wid, 0); const s = shade | 0;
  gr.addColorStop(0, `rgb(${s * 0.62 | 0},${s * 0.62 | 0},${s * 0.62 | 0})`); gr.addColorStop(0.5, `rgb(${s},${s},${s})`); gr.addColorStop(1, `rgb(${s * 0.7 | 0},${s * 0.7 | 0},${s * 0.7 | 0})`);
  g.fillStyle = gr; g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = Math.max(0.6, wid * 0.12); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -len * 0.92); g.stroke();
  g.restore();
}
function sprigTex(kind) {
  const [c, g] = canvas(128, 128), r = PlantArt.rngOf(kind === 'yew' ? 3 : 9);
  if (kind === 'yew') {
    for (let k = 0; k < 6; k++) {
      const x0 = 20 + r() * 88, y0 = 118, a = -Math.PI / 2 + (r() - 0.5) * 1.4, L = 70 + r() * 40;
      const x1 = x0 + Math.cos(a) * L, y1 = y0 + Math.sin(a) * L;
      g.strokeStyle = '#6a6a5a'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      for (let i = 0; i < 26; i++) { const t = i / 26, px = lerp(x0, x1, t), py = lerp(y0, y1, t);
        for (const s of [-1, 1]) leafCard(g, px, py, a + Math.PI / 2 + s * (1.25 + r() * 0.2), 13 - t * 4, 1.8, 150 + r() * 90); }
    }
  } else {
    for (let i = 0; i < 70; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 50; leafCard(g, 64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r() * TAU, 13 + r() * 5, 5.5, 150 + r() * 100); }
  }
  return c;
}
function clusterTex(kind) {
  const [c, g] = canvas(256, 256), r = PlantArt.rngOf(kind === 'willow' ? 21 : 13);
  if (kind === 'willow') {
    for (let k = 0; k < 9; k++) {
      const x = 20 + k * 27 + r() * 8; g.strokeStyle = '#7a7460'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + (r() - 0.5) * 20, 128, x + (r() - 0.5) * 16, 250); g.stroke();
      for (let i = 0; i < 22; i++) { const y = 8 + i * 11 + r() * 4; leafCard(g, x + (r() - 0.5) * 6, y, Math.PI + (r() - 0.5) * 0.9, 30 + r() * 10, 3.2, 140 + r() * 110); }
    }
  } else {
    g.strokeStyle = '#6a5a48'; g.lineWidth = 3; g.beginPath(); g.moveTo(128, 250); g.lineTo(128, 120); g.stroke();
    for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (r() - 0.5) * 2.4; g.lineWidth = 1.6; g.beginPath(); g.moveTo(128, 170 - r() * 40); g.lineTo(128 + Math.cos(a) * 90, 140 + Math.sin(a) * 90); g.stroke(); }
    const pts = []; for (let i = 0; i < 64; i++) { const a = r() * TAU, d = Math.pow(r(), 0.6) * 104; pts.push([128 + Math.cos(a) * d, 120 + Math.sin(a) * d * 0.9, a]); }
    pts.sort((a, b) => a[1] - b[1]);
    for (const [x, y, a] of pts) leafCard(g, x, y, a + Math.PI / 2 + (r() - 0.5) * 0.9, 30 + r() * 12, 11 + r() * 4, 130 + r() * 120);
  }
  return c;
}

// ======================================================================= the garden
export function createGarden({ scene, renderer, U, COMMON, layout, treeSpecs, metalSegs, isTouch }) {
  const P = makePatcher(U, COMMON);
  const rng = PlantArt.rngOf(1969);
  const rr = (a, b) => a + (b - a) * rng();
  const pick = a => a[Math.floor(rng() * a.length)];
  const DETAIL = isTouch ? 0.28 : 0.42, LS = isTouch ? 1.45 : 1.38;
  const colliders = new Uint8Array(800 * 800);
  const block = (x, z, r) => {
    const i0 = Math.floor((x - r + 100) * 4), i1 = Math.ceil((x + r + 100) * 4), j0 = Math.floor((z - r + 100) * 4), j1 = Math.ceil((z + r + 100) * 4);
    for (let j = Math.max(0, j0); j <= Math.min(799, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(799, i1); i++) {
      const cx = i / 4 - 100 + 0.125, cz = j / 4 - 100 + 0.125; if ((cx - x) ** 2 + (cz - z) ** 2 <= r * r) colliders[j * 800 + i] = 1; }
  };
  const blocked = (x, z) => { const i = Math.floor((x + 100) * 4), j = Math.floor((z + 100) * 4); return i < 0 || j < 0 || i > 799 || j > 799 ? false : colliders[j * 800 + i] === 1; };

  // ---------------------------------------------------------------- ground mask + ground
  const MS = 2048, [mc, mg] = canvas(MS, MS);
  const px = v => (v + 100) / 200 * MS, pl = m => m / 200 * MS;
  const LAWN = 'rgb(255,0,0)', SOIL = 'rgb(0,255,0)', GRAV = 'rgb(0,0,255)';
  mg.fillStyle = LAWN; mg.fillRect(0, 0, MS, MS);
  const rect = (x0, z0, x1, z1, c) => { mg.fillStyle = c; mg.fillRect(px(x0), px(z0), px(x1) - px(x0), px(z1) - px(z0)); };
  const circ = (x, z, r, c) => { mg.fillStyle = c; mg.beginPath(); mg.arc(px(x), px(z), pl(r), 0, TAU); mg.fill(); };
  const stroke = (pts, w, c, closed = false) => { mg.strokeStyle = c; mg.lineWidth = pl(w); mg.lineCap = mg.lineJoin = 'round'; mg.beginPath();
    pts.forEach((p, i) => i ? mg.lineTo(px(p[0]), px(p[1])) : mg.moveTo(px(p[0]), px(p[1]))); if (closed) mg.closePath(); mg.stroke(); };
  const loopRange = (a, b) => layout.loopS.filter(s => s.t >= a && s.t <= b).map(s => [s.x, s.z]);
  for (const [a, b] of layout.borderT) stroke(loopRange(a, b), 2 * 4.45, SOIL);
  for (const m of layout.meadows) circ(m.x, m.z, m.r, LAWN);
  rect(-6.8, 62.5, 6.8, 90.5, SOIL); rect(-1.6, 58, 1.6, 97, GRAV);
  rect(-3.5, 21, 3.5, 62, GRAV); rect(-1.7, 21.6, 1.7, 60.4, SOIL); rect(3.5, 22.5, 4.5, 59.5, SOIL); rect(-4.5, 22.5, -3.5, 59.5, SOIL);
  circ(0, 0, 15.1, GRAV); circ(0, 0, 14.0, SOIL); circ(0, 0, 8.5, GRAV); rect(-1.6, -15.2, 1.6, 15.2, GRAV); rect(-15.2, -1.6, 15.2, 1.6, GRAV);
  mg.strokeStyle = SOIL; mg.lineWidth = pl(1.3); mg.beginPath(); mg.arc(px(0), px(0), pl(15.5), 0, TAU); mg.stroke();
  rect(-1.6, -16.5, 1.6, 16.5, GRAV); rect(-16.5, -1.6, 16.5, 1.6, GRAV); rect(-1.6, 14, 1.6, 22, GRAV);
  for (const [a, b] of layout.radial) stroke([a, b], 3.2, GRAV);
  for (const p of layout.pools.slice(1)) circ(p.x, p.z, p.r + 1.9, GRAV);
  stroke(layout.loopS.map(s => [s.x, s.z]), 3.2, GRAV, true);
  mg.filter = 'blur(2px)'; mg.drawImage(mc, 0, 0); mg.filter = 'none';
  const maskTex = new THREE.CanvasTexture(mc); maskTex.colorSpace = THREE.NoColorSpace; maskTex.generateMipmaps = false; maskTex.minFilter = THREE.LinearFilter;
  U.uGroundMask = { value: maskTex };
  U.uMeadow = { value: layout.meadows.map(m => new THREE.Vector4(m.x, m.z, m.r, 0)) };

  const lawnT = texOf(noiseTex(512, 512, '#46602f', [[14000, ['#3f5a2a', '#506c35', '#5b763c', '#364f25', '#62783f', '#4a5f2e'], [3, 9], 'blade'], [500, ['#6a6438', '#2f4420', '#7a7444'], [1.5, 4], 'dot']]), renderer);
  const soilT = texOf(noiseTex(512, 512, '#2c251d', [[3000, ['#3d3326', '#332a20', '#4a3f30', '#231d17', '#55483a', '#2e261d'], [3, 9], 'chip'], [900, ['#1a1510', '#6a5a48'], [1, 2.5], 'dot']]), renderer);
  const gravT = texOf(noiseTex(512, 512, '#8a7f6c', [[14000, ['#9f9480', '#7a705e', '#b2a690', '#655b4c', '#958a76', '#c0b49c', '#5a5246'], [1.3, 3.2], 'dot']]), renderer);
  const groundMat = P.std({ color: 0xffffff, roughness: 0.96 }, {
    key: 'ground', extra: sh => {
      Object.assign(sh.uniforms, { uLawnT: { value: lawnT }, uSoilT: { value: soilT }, uGravT: { value: gravT } });
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uGroundMask; uniform sampler2D uLawnT; uniform sampler2D uSoilT; uniform sampler2D uGravT; uniform vec4 uMeadow[2];')
        .replace('#include <map_fragment>', `
        vec2 gq = vWPos.xz;
        vec4 gm = texture2D(uGroundMask, vec2(0.5 + gq.x / 200.0, 0.5 - gq.y / 200.0));
        if (length(gq) > 98.5) gm = vec4(1.0, 0.0, 0.0, 1.0);
        float mead = 0.0;
        for (int i = 0; i < 2; i++) mead = max(mead, 1.0 - smoothstep(uMeadow[i].z - 5.0, uMeadow[i].z, distance(gq, uMeadow[i].xy)));
        float macro = 0.8 + 0.4 * vnoise(gq * 0.11) * (0.7 + 0.3 * vnoise(gq * 0.6));
        float stripe = 1.0 + 0.07 * sign(sin(gq.x * 3.14159 / 1.8)) * (1.0 - mead);
        vec3 cl = texture2D(uLawnT, gq / 1.1).rgb * macro * stripe * mix(vec3(1.0), vec3(1.15, 1.05, 0.7), mead * 0.6);
        vec3 cs = texture2D(uSoilT, gq / 0.9).rgb * (0.8 + 0.4 * vnoise(gq * 0.5));
        vec3 cg = texture2D(uGravT, gq / 1.0).rgb * (0.9 + 0.2 * vnoise(gq * 0.3));
        float ws = gm.r + gm.g + gm.b + 1e-4;
        diffuseColor.rgb *= (cl * gm.r + cs * gm.g + cg * gm.b) / ws;`);
    },
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(420, 420).rotateX(-Math.PI / 2), groundMat);
  ground.receiveShadow = true; scene.add(ground);

  // ---------------------------------------------------------------- lawn: GPU grass blades that follow the walker
  let grass;
  {
    const N = isTouch ? 70000 : 170000, TILE = isTouch ? 26 : 34;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.4, 0.5, 0, 0.4, 0.5, 0, 0, 1, 0], 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(15).fill(1), 3));
    geo.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
    const off = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) { off[i * 4] = rng() * TILE; off[i * 4 + 1] = rng() * TILE; off[i * 4 + 2] = rng(); off[i * 4 + 3] = rng(); }
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
    geo.instanceCount = N;
    U.uCam = U.uCam || { value: new V3() };
    const mat = P.std({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide, vertexColors: true }, {
      key: 'grass', extra: sh => {
        sh.uniforms.uTile = { value: TILE };
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aOff; uniform vec3 uCam; uniform float uTile; uniform sampler2D uGroundMask; uniform vec4 uMeadow[2]; varying float vGH;')
          .replace('#include <beginnormal_vertex>', `
            vec2 gc = uCam.xz;
            vec2 gp = gc + mod(aOff.xy - gc + 0.5 * uTile, uTile) - 0.5 * uTile;
            float lawn = texture(uGroundMask, vec2(0.5 + gp.x / 200.0, 0.5 - gp.y / 200.0)).r;
            if (length(gp) > 98.0) lawn = 0.0;
            float mead = 0.0;
            for (int i = 0; i < 2; i++) mead = max(mead, 1.0 - smoothstep(uMeadow[i].z - 5.0, uMeadow[i].z, distance(gp, uMeadow[i].xy)));
            float gd = length(gp - gc);
            float fade = 1.0 - smoothstep(uTile * 0.5 - 7.0, uTile * 0.5 - 1.0, gd);
            float gh = mix(0.06 + 0.07 * aOff.z, 0.3 + 0.65 * aOff.z, mead) * smoothstep(0.35, 0.75, lawn) * fade;
            float gang = aOff.w * 6.2831;
            vec2 gfw = vec2(cos(gang), sin(gang));
            vec3 objectNormal = normalize(vec3(gfw.x, 0.6, gfw.y));`)
          .replace('#include <begin_vertex>', `
            float gy = position.y;
            float gw = mix(0.010, 0.016, aOff.z) * (1.0 + mead * 0.5) * step(0.004, gh);
            vec3 transformed = vec3(gp.x, gy * gh, gp.y);
            transformed.xz += vec2(-gfw.y, gfw.x) * position.x * gw;
            float gph = dot(gp, uWindDir) * 0.8 - uTime * 2.2;
            float gwave = 0.55 + 0.3 * sin(gph) + 0.15 * sin(gph * 2.7 + 1.3);
            float gpush = uWind * (0.6 + 1.4 * uGust) * gwave * (0.3 + mead * 1.4);
            vec2 glean = vec2(cos(gang * 3.1), sin(gang * 3.1)) * (0.15 + 0.3 * aOff.z);
            transformed.xz += (glean + uWindDir * gpush * 0.7) * gy * gy * gh;
            vGH = gy;
            vColor = mix(vec3(0.035, 0.07, 0.022), vec3(0.13, 0.21, 0.06), gy) * (0.7 + 0.55 * aOff.z);
            vColor = mix(vColor, vec3(0.30, 0.27, 0.10) * (0.7 + 0.5 * aOff.z), mead * gy * 0.55);`);
      },
    });
    grass = new THREE.Mesh(geo, mat); grass.frustumCulled = false; grass.receiveShadow = true; scene.add(grass);
  }

  // ---------------------------------------------------------------- plant atlases
  const CELL = 256, PAD = 6;
  const atlas = (items, cols, draw) => {
    const rows = Math.ceil(items.length / cols), W = cols * CELL, H = rows * CELL, [c, g] = canvas(W, H), rects = {};
    items.forEach((k, i) => {
      const cx = (i % cols) * CELL, cy = Math.floor(i / cols) * CELL;
      const tmp = draw(k); g.drawImage(tmp, cx + PAD, cy + PAD, CELL - 2 * PAD, CELL - 2 * PAD);
      rects[k] = [(cx + PAD) / W, 1 - (cy + CELL - PAD) / H, (CELL - 2 * PAD) / W, (CELL - 2 * PAD) / H];
    });
    return { tex: texOf(c, renderer, { repeat: false }), rects };
  };
  const leafKeys = Object.keys(PlantArt.LEAF);
  const leafAtlas = atlas(leafKeys, 5, k => { const [w, h, draw] = PlantArt.LEAF[k], [c, g] = canvas(w, h); draw(g, w, h); return c; });
  const speciesKeys = Object.keys(LOOKS).filter(k => SIZE[k] && PlantArt.FL[LOOKS[k].flStyle]);
  const flAtlas = atlas(speciesKeys, 8, k => { const L = LOOKS[k], F = PlantArt.FL[L.flStyle], [w, h] = F.size || [256, 256], [c, g] = canvas(w, h); g.save(); F.paint(g, L, w, h); g.restore(); return c; });

  const art = PlantArt.make(THREE);
  const discGeo = (() => {   // flat polar mesh, double-sided with upper normals; the shader cups/reflexes it per species
    const RINGS = 2, SECT = 10, pos = [0, 0, 0], uv = [0.5, 0.5], idx = [];
    for (let i = 1; i <= RINGS; i++) for (let j = 0; j < SECT; j++) { const r = 0.5 * i / RINGS, a = j / SECT * TAU; pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); uv.push(0.5 + Math.cos(a) * r, 0.5 - Math.sin(a) * r); }
    for (let j = 0; j < SECT; j++) idx.push(0, 1 + (j + 1) % SECT, 1 + j);
    for (let i = 1; i < RINGS; i++) for (let j = 0; j < SECT; j++) { const a = 1 + (i - 1) * SECT + j, b = 1 + (i - 1) * SECT + (j + 1) % SECT, c = 1 + i * SECT + j, d = 1 + i * SECT + (j + 1) % SECT; idx.push(a, b, d, a, d, c); }
    const n = pos.length / 3, P2 = [...pos, ...pos], U2 = [...uv, ...uv], N2 = new Array(n * 6).fill(0).map((_, i) => i % 3 === 1 ? 1 : 0), I2 = [...idx];
    for (let k = 0; k < idx.length; k += 3) I2.push(idx[k] + n, idx[k + 2] + n, idx[k + 1] + n);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P2, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N2, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U2, 2)); g.setIndex(I2);
    return g;
  })();
  const GEOS = {
    leafC: PlantArt.curvedLeaf(THREE, 0.1, 0.22, 2), leafS: PlantArt.strapGeo(THREE, 0.3, 4), disc: discGeo,
    ball: PlantArt.crossGeo(THREE, 3, true, true), sphere: new THREE.IcosahedronGeometry(0.5, 1), spike: PlantArt.crossGeo(THREE, 3, false, false),
    stem: new THREE.CylinderGeometry(1, 1, 1, 5, 1, true).translate(0, 0.5, 0),
  };
  const leafMat = P.std({ map: leafAtlas.tex, alphaTest: 0.4, roughness: 0.72, side: THREE.DoubleSide }, { sway: 1, atlas: true });
  const flMat = P.std({ map: flAtlas.tex, alphaTest: 0.4, roughness: 0.55, side: THREE.DoubleSide }, { sway: 1, atlas: true });
  const flDiscMat = P.std({ map: flAtlas.tex, alphaTest: 0.4, roughness: 0.55, side: THREE.DoubleSide }, { sway: 1, atlas: true, disc: true });
  const stemMat = P.std({ roughness: 0.8 }, { sway: 1 });
  const MATS = { leafC: leafMat, leafS: leafMat, disc: flDiscMat, ball: flMat, sphere: flMat, spike: flMat, stem: stemMat };
  const DEPTHS = { leafC: P.depth(leafAtlas.tex, { sway: 1, atlas: true }), leafS: null, disc: P.depth(flAtlas.tex, { sway: 1, atlas: true, disc: true }), ball: P.depth(flAtlas.tex, { sway: 1, atlas: true }), sphere: null, spike: null, stem: P.depth(null, { sway: 1 }) };
  DEPTHS.leafS = DEPTHS.leafC; DEPTHS.sphere = DEPTHS.spike = DEPTHS.ball;
  const TYPES = Object.keys(GEOS);

  const CH = 16, buckets = new Map();
  const bucket = (x, z) => {
    const i = Math.floor(x / CH), j = Math.floor(z / CH), k = i + ',' + j;
    let b = buckets.get(k); if (!b) { b = { x: (i + 0.5) * CH, z: (j + 0.5) * CH }; for (const t of TYPES) b[t] = { m: [], c: [], r: [], s: [], n: 0 }; buckets.set(k, b); }
    return b;
  };
  const _m = new THREE.Matrix4(), _p = new V3(), _a = new V3(), _b = new V3(), _s = new V3(), _q = new Q(), _qr = new Q(), _c = new THREE.Color();
  function push(B, p, q, s, c, rect, shape) {
    _m.compose(p, q, s); const e = _m.elements; for (let i = 0; i < 16; i++) B.m.push(e[i]);
    B.c.push(c.r, c.g, c.b); if (rect) B.r.push(rect[0], rect[1], rect[2], rect[3]); if (shape) B.s.push(shape[0], shape[1]); B.n++;
  }
  let plantCount = 0;
  const placed = new Map();   // spatial hash for spacing
  const hkey = (x, z) => Math.floor(x / 2) + ',' + Math.floor(z / 2);
  function spaceOk(x, z, r, k = 0.8) {
    const i0 = Math.floor(x / 2), j0 = Math.floor(z / 2);
    for (let j = j0 - 1; j <= j0 + 1; j++) for (let i = i0 - 1; i <= i0 + 1; i++) { const L = placed.get(i + ',' + j); if (L) for (const p of L) if ((p[0] - x) ** 2 + (p[1] - z) ** 2 < ((p[2] + r) * k) ** 2) return false; }
    return true;
  }
  function claim(x, z, r) { const k = hkey(x, z); let L = placed.get(k); if (!L) placed.set(k, L = []); L.push([x, z, r]); }

  function addPlant(k, x, z, o = {}) {
    const L = LOOKS[k], sz = SIZE[k]; if (!L || !sz) return;
    const F = PlantArt.FL[L.flStyle] || { kind: 'none' };
    const seed = ((Math.floor(x * 997) * 73856093) ^ (Math.floor(z * 991) * 19349663) ^ (o.salt || 0)) >>> 0;
    const r = PlantArt.rngOf(seed + 17), G = art.gen(L, seed), sc = o.scale || 1;
    const R = sz[1] / 2 * IN * sc * (0.85 + 0.25 * r()), H = sz[0] * IN * sc * (0.85 + 0.27 * r());
    const y0 = o.y || 0, rot = r() * TAU, cr = Math.cos(rot), sr = Math.sin(rot);
    _qr.setFromAxisAngle(_Y, -rot);
    const Wp = (n, out) => { const a = n[0] * R, b = n[2] * R; return out.set(x + a * cr - b * sr, y0 + n[1] * H, z + a * sr + b * cr); };
    const bk = bucket(x, z), lr = leafAtlas.rects[L.leaf], fr = flAtlas.rects[k];
    const leafCol = new THREE.Color(L.leafCol), stemCol = new THREE.Color(L.stemCol);
    const strap = L.leaf === 'sword' || L.leaf === 'blade';
    const nL = Math.ceil(G.leaves.length * DETAIL);
    for (let i = 0; i < nL; i++) {
      const lf = G.leaves[i]; Wp(lf.p, _p); _q.copy(_qr).multiply(lf.q);
      if (lf.sword) _s.set(L.leafIn[0] * IN * (0.8 + lf.v * 0.4) * sc, lf.sword * H, IN); else _s.set(L.leafIn[0] * lf.s * IN * LS * sc, L.leafIn[1] * lf.s * IN * LS * sc, IN);
      _c.copy(leafCol).multiplyScalar(0.82 + 0.36 * lf.v); push(bk[strap ? 'leafS' : 'leafC'], _p, _q, _s, _c, lr);
    }
    const rad = (L.stemR || (0.06 + 0.0035 * sz[0])) * IN * Math.sqrt(sc) * 1.4;
    for (const pts of (L.form === 'rosette' ? G.spires : G.stems)) for (let i = 0; i < pts.length - 1; i++) {
      Wp(pts[i], _a); Wp(pts[i + 1], _b); _b.sub(_a); const len = _b.length(); if (len < 0.01) continue;
      _q.setFromUnitVectors(_Y, _b.multiplyScalar(1 / len)); _s.set(rad * (1 - i * 0.18), len, rad * (1 - i * 0.18)); push(bk.stem, _a, _q, _s, stemCol);
    }
    if (fr && F.kind !== 'none' && GEOS[F.kind]) {
      const shape = F.kind === 'disc' ? [L.curve != null ? L.curve : (F.curve || 0), F.cone || 0] : null, fsc = Math.sqrt(sc);
      const nF = G.fls.length > 24 ? Math.ceil(G.fls.length * 0.6) : G.fls.length;
      for (let fi = 0; fi < nF; fi++) { const f = G.fls[fi];
        Wp(f.p, _p); _q.copy(_qr).multiply(f.q);
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
    _p.set(x + lean, h, z + lean2); _a.set(x, 0, z); _b.subVectors(_p, _a); const len = _b.length();
    _q.setFromUnitVectors(_Y, _b.clone().normalize()); _s.set(0.0022, len, 0.0022); push(bk.stem, _a, _q, _s, _c.set(L.stemCol));
    _q.setFromEuler(new THREE.Euler(rr(-0.4, 0.4), rr(0, TAU), rr(-0.4, 0.4)));
    const d = (Array.isArray(L.flIn) ? L.flIn[0] : L.flIn) * IN * s; _s.set(d, F.kind === 'spike' ? L.flIn[1] * IN * s : d, d);
    push(bk[F.kind], _p, _q, _s, _c.setScalar(0.95), fr, F.kind === 'disc' ? [L.curve != null ? L.curve : (F.curve || 0), F.cone || 0] : null);
  }
  // drift planting: Worley cells pick a species so plants come in natural-looking groups
  function drift(x, z, list, scale, salt) {
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
  const radiusOf = k => SIZE[k][1] / 2 * IN;
  function borderPlant(x, z, f, salt) {
    if (blocked(x, z)) return;
    for (const m of layout.meadows) if (Math.hypot(x - m.x, z - m.z) < m.r - 1) return;
    const ff = f + (vn2(x * 0.6, z * 0.6, salt) - 0.5) * 0.35;
    const list = ff < 0.34 ? FRONT : ff < 0.7 ? MID : BACK;
    const k = drift(x, z, list, 2.4, salt + (ff < 0.34 ? 0 : ff < 0.7 ? 50 : 100));
    const r = radiusOf(k) * 0.9;
    if (!spaceOk(x, z, r, 0.98)) return;
    claim(x, z, r); addPlant(k, x, z, { salt });
  }

  // ---------------------------------------------------------------- hedges & topiary
  const hedgeBase = texOf(noiseTex(512, 512, '#1e3219', [[16000, ['#2b4322', '#1a2b15', '#365229', '#1d3318', '#41602f', '#253c1d'], [1.5, 4], 'chip']], 5), renderer);
  const boxBase = texOf(noiseTex(512, 512, '#2e4a1e', [[16000, ['#3e6026', '#2a4419', '#4a7230', '#355420', '#557c34'], [1.5, 3.5], 'chip']], 6), renderer);
  const yewCard = texOf(sprigTex('yew'), renderer, { repeat: false }), boxCard = texOf(sprigTex('box'), renderer, { repeat: false });
  const HK = {
    yew: { base: P.std({ map: hedgeBase, roughness: 0.92, color: 0xb8c4b4 }), card: P.std({ map: yewCard, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 }, { sway: 0.025, swayH: 2 }), depth: P.depth(yewCard, {}), size: 0.2, dens: 34, colA: new THREE.Color('#2c4a26'), colB: new THREE.Color('#40633a') },
    box: { base: P.std({ map: boxBase, roughness: 0.85, color: 0xc8d0bc }), card: P.std({ map: boxCard, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.6 }, { sway: 0.02, swayH: 1 }), depth: P.depth(boxCard, {}), size: 0.12, dens: 75, colA: new THREE.Color('#4c7a2e'), colB: new THREE.Color('#6a9a3a') },
  };
  function sweepGeo(pts, closed, W, H, kind) {
    const w = W / 2, rt = kind === 'box' ? w * 0.95 : Math.min(w * 0.55, H * 0.25), prof = [];
    prof.push([-w * 1.03, 0], [-w, (H - rt) * 0.5], [-w, H - rt]);
    for (let k = 1; k < 6; k++) { const a = Math.PI - k / 6 * Math.PI / 2; prof.push([-w + rt + Math.cos(a) * rt, H - rt + Math.sin(a) * rt]); }
    prof.push([-w + rt, H], [w - rt, H]);
    for (let k = 1; k < 6; k++) { const a = Math.PI / 2 - k / 6 * Math.PI / 2; prof.push([w - rt + Math.cos(a) * rt, H - rt + Math.sin(a) * rt]); }
    prof.push([w, H - rt], [w, (H - rt) * 0.5], [w * 1.03, 0]);
    const np = prof.length, pos = [], uv = [], idx = [];
    const n = pts.length; let along = 0;
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
    for (let i = 0; i < segs; i++) { const i1 = (i + 1) % n; for (let k = 0; k < np - 1; k++) { const a = i * np + k, b = i * np + k + 1, c = i1 * np + k, d = i1 * np + k + 1; idx.push(a, c, b, b, c, d); } }
    if (!closed) for (const [i, s] of [[0, 1], [n - 1, -1]]) {   // end caps
      const c0 = pos.length / 3; pos.push(pts[i][0], H * 0.45, pts[i][1]); uv.push(0, 0);
      for (let k = 0; k < np - 1; k++) s > 0 ? idx.push(c0, i * np + k + 1, i * np + k) : idx.push(c0, i * np + k, i * np + k + 1);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  function shellify(geo, kind, extraScale = 1) {   // leafy cards scattered over a surface
    const K = HK[kind], P0 = geo.attributes.position, I = geo.index.array, tris = [];
    let area = 0; const A = new V3(), B = new V3(), C = new V3(), N = new V3(), E1 = new V3(), E2 = new V3();
    for (let t = 0; t < I.length; t += 3) { A.fromBufferAttribute(P0, I[t]); B.fromBufferAttribute(P0, I[t + 1]); C.fromBufferAttribute(P0, I[t + 2]);
      E1.subVectors(B, A); E2.subVectors(C, A); N.crossVectors(E1, E2); const a = N.length() / 2; if (a < 1e-5) continue; N.normalize(); if (N.y < -0.3) continue; area += a; tris.push([area, I[t], I[t + 1], I[t + 2], N.clone()]); }
    const n = Math.min(60000, Math.floor(area * K.dens * (isTouch ? 0.5 : 1)));
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), K.card, n);
    const m = new THREE.Matrix4(), q = new Q(), q2 = new Q(), s = new V3(), p = new V3(), dir = new V3(), c = new THREE.Color(), z = new V3(0, 0, 1);
    for (let i = 0; i < n; i++) {
      const u = rng() * area; let lo = 0, hi = tris.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (tris[mid][0] < u) lo = mid + 1; else hi = mid; }
      const T = tris[lo]; let a = rng(), b = rng(); if (a + b > 1) { a = 1 - a; b = 1 - b; }
      A.fromBufferAttribute(P0, T[1]); B.fromBufferAttribute(P0, T[2]); C.fromBufferAttribute(P0, T[3]);
      p.copy(A).addScaledVector(E1.subVectors(B, A), a).addScaledVector(E2.subVectors(C, A), b).addScaledVector(T[4], 0.01 + rng() * 0.03);
      dir.copy(T[4]).add(new V3(rr(-0.8, 0.8), rr(-0.4, 0.9), rr(-0.8, 0.8))).normalize();
      q.setFromUnitVectors(z, dir); q2.setFromAxisAngle(dir, rng() * TAU); q.premultiply(q2);
      const sc = K.size * extraScale * (0.7 + rng() * 0.6); s.set(sc, sc, sc);
      m.compose(p, q, s); mesh.setMatrixAt(i, m); mesh.setColorAt(i, c.copy(K.colA).lerp(K.colB, rng()).multiplyScalar(0.8 + 0.4 * rng()));
    }
    mesh.customDepthMaterial = K.depth; mesh.castShadow = true; mesh.receiveShadow = true; mesh.computeBoundingSphere();
    return mesh;
  }
  const hedgeMeshes = [];
  function hedge(pts, closed, W, H, kind) {
    const geo = sweepGeo(pts, closed, W, H, kind), base = new THREE.Mesh(geo, HK[kind].base);
    base.castShadow = base.receiveShadow = true; scene.add(base); const shell = shellify(geo, kind); scene.add(shell);
    hedgeMeshes.push({ base, shell, x: pts.reduce((a, p) => a + p[0], 0) / pts.length, z: pts.reduce((a, p) => a + p[1], 0) / pts.length });
    for (const p of pts) block(p[0], p[1], W / 2 + 0.25);
  }
  function topiary(x, z, kind, form, Hh, R) {
    let geo;
    if (form === 'ball') geo = new THREE.SphereGeometry(R, 20, 14).translate(0, R * 0.9, 0);
    else { const pts = []; for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push(new THREE.Vector2(Math.max(0.01, R * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.02)), form === 'cone' ? 0.9 : 0.45) * (form === 'cone' ? 1 - t * 0.75 : 1)), t * Hh)); } geo = new THREE.LatheGeometry(pts, 20); }
    const pa = geo.attributes.position; for (let i = 0; i < pa.count; i++) { const v = new V3().fromBufferAttribute(pa, i), d = 1 + (vn2(v.x * 4 + x, v.y * 4 + v.z * 3, 8) - 0.5) * 0.08; pa.setXYZ(i, v.x * d, v.y, v.z * d); }
    geo.computeVertexNormals(); geo.translate(x, 0, z);
    const base = new THREE.Mesh(geo, HK[kind].base); base.castShadow = base.receiveShadow = true; scene.add(base); scene.add(shellify(geo, kind, form === 'ball' ? 0.9 : 1.05));
    block(x, z, R + 0.2);
  }
  // entrance avenue: yew hedges behind the double border
  for (const s of [-1, 1]) { const pts = []; for (let z = 63; z <= 90.01; z += 0.5) pts.push([s * 6.15, z]); hedge(pts, false, 1.05, 2.3, 'yew'); }
  for (const s of [-1, 1]) topiary(s * 4.6, 93, 'yew', 'cone', 2.6, 0.85);
  // central round garden: yew ring with four gaps
  for (let q = 0; q < 4; q++) { const pts = []; const a0 = q * Math.PI / 2 + 0.13, a1 = (q + 1) * Math.PI / 2 - 0.13; for (let a = a0; a <= a1 + 1e-6; a += 0.5 / 15.5) pts.push([Math.cos(a) * 15.5, Math.sin(a) * 15.5]); hedge(pts, false, 0.9, 1.65, 'yew'); }
  for (const [x, z] of [[1.9, 16.6], [-1.9, 16.6], [1.9, -16.6], [-1.9, -16.6], [16.6, 1.9], [16.6, -1.9], [-16.6, 1.9], [-16.6, -1.9]]) topiary(x, z, 'box', 'ball', 0, 0.48);
  // parterre: box-edged quadrant beds
  for (let q = 0; q < 4; q++) {
    const pts = [], c = q * Math.PI / 2 + Math.PI / 4, ro = 13.85, ri = 8.75;
    const ao = Math.asin(1.8 / ro), ai = Math.asin(1.8 / ri), A0o = q * Math.PI / 2 + ao, A1o = (q + 1) * Math.PI / 2 - ao, A0i = q * Math.PI / 2 + ai, A1i = (q + 1) * Math.PI / 2 - ai;
    for (let a = A0o; a <= A1o; a += 0.4 / ro) pts.push([Math.cos(a) * ro, Math.sin(a) * ro]);
    for (let t = 0.1; t < 1; t += 0.12) { const r = lerp(ro, ri, t), a = lerp(A1o, A1i, t); pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    for (let a = A1i; a >= A0i; a -= 0.4 / ri) pts.push([Math.cos(a) * ri, Math.sin(a) * ri]);
    for (let t = 0.1; t < 1; t += 0.12) { const r = lerp(ri, ro, t), a = lerp(A0i, A0o, t); pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    const geo = sweepGeo(pts, true, 0.32, 0.42, 'box'), base = new THREE.Mesh(geo, HK.box.base); base.castShadow = base.receiveShadow = true; scene.add(base); scene.add(shellify(geo, 'box'));
    void c;
  }
  // canal garden: low box hedges and Irish yew columns
  for (const s of [-1, 1]) { const pts = []; for (let z = 23; z <= 59.01; z += 0.5) pts.push([s * 4.9, z]); hedge(pts, false, 0.38, 0.48, 'box'); }
  for (const s of [-1, 1]) for (let z = 25; z <= 56; z += 6.2) topiary(s * 5.75, z, 'yew', 'column', 3.3, 0.5);
  // borders along the loop: some backed by yew
  for (const [a, b] of [layout.borderT[1], layout.borderT[3]]) {
    const ss = layout.loopS.filter(s => s.t >= a && s.t <= b), out = [];
    for (const s of ss) { const nx = -s.tz, nz = s.tx; const p1 = [s.x + nx * 5.1, s.z + nz * 5.1], p2 = [s.x - nx * 5.1, s.z - nz * 5.1]; out.push(Math.hypot(...p1) > Math.hypot(...p2) ? p1 : p2); }
    const pts = out.filter((_, i) => i % 1 === 0); hedge(pts, false, 0.95, 1.95, 'yew');
  }

  // ---------------------------------------------------------------- stone, water, fountains
  const stoneC = (() => { const c = noiseTex(512, 512, '#b3a78f', [[260, ['#c2b69e', '#a0937a', '#bcb098'], [20, 80], 'dot'], [26000, ['#998c74', '#c9bda4', '#8a7e68', '#d4c9b0', '#a69a82'], [0.6, 1.6], 'dot'], [400, ['#6f6656'], [0.5, 1.4], 'dot']], 7); return c; })();
  const stoneT = texOf(stoneC, renderer), stoneB = texOf(stoneC, renderer, { srgb: false });
  const stoneMat = P.std({ map: stoneT, bumpMap: stoneB, bumpScale: 1.2, roughness: 0.86 });
  const darkStone = P.std({ color: 0x2a2c2a, roughness: 0.6 });
  const metalMat = P.std({ color: 0x1c1d1c, roughness: 0.45, metalness: 0.6 });
  const sheetC = (() => { const [c, g] = canvas(512, 256), r = PlantArt.rngOf(31); for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(235,245,250,${0.05 + r() * 0.22})`; g.fillRect(r() * 512, 0, 0.6 + r() * 1.6, 256); } for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.5})`; g.fillRect(r() * 512, r() * 256, 1 + r() * 2, 6 + r() * 30); } return c; })();
  const sheetT = texOf(sheetC, renderer); sheetT.repeat.set(5, 1.2);
  const sheetMat = P.std({ map: sheetT, color: 0xbcd0da, transparent: true, opacity: 0.5, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide }, { key: 'sheet' });
  const foamC = (() => { const [c, g] = canvas(512, 64), r = PlantArt.rngOf(41); for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(250,252,255,${0.15 + r() * 0.5})`; g.beginPath(); g.arc(r() * 512, r() * 64 * r(), 0.8 + r() * 2.5, 0, TAU); g.fill(); } return c; })();
  const foamT = texOf(foamC, renderer); foamT.repeat.set(6, 1);
  const foamMat = P.std({ map: foamT, transparent: true, depthWrite: false, roughness: 0.4 }, { key: 'foam' });
  const bowlWater = P.std({ color: 0x14222a, roughness: 0.04, metalness: 0.1, envMapIntensity: 1.6 }, { key: 'bowlw' });

  // planar reflection, shared by every water surface (all at WATER_Y)
  const reflScale = isTouch ? 0.3 : 0.42;
  const reflRT = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType });
  const reflCam = new THREE.PerspectiveCamera(); reflCam.layers.enable(3);
  U.uSunCol = U.uSunCol || { value: new V3(1, 1, 1) };
  const ripples = Array.from({ length: 6 }, () => new THREE.Vector4());
  const waterMat = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, U, { tRefl: { value: reflRT.texture }, uRes: { value: new THREE.Vector2(1, 1) }, uRipple: { value: ripples }, uDeep: { value: new V3(0.03, 0.05, 0.05) } }),
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: COMMON + `
      uniform sampler2D tRefl; uniform vec2 uRes; uniform vec4 uRipple[6]; uniform vec3 uDeep; uniform vec3 uSunCol; uniform vec3 uSunDir; uniform float uExhibit;
      varying vec3 vW;
      void main(){
        vec2 p = vW.xz; vec2 g = vec2(0.0);
        g += vec2(cos(p.x * 5.1 + p.y * 1.7 + uTime * 2.3), sin(p.y * 4.3 - p.x * 2.1 + uTime * 1.9)) * 0.010;
        g += vec2(cos(p.x * 13.0 - p.y * 7.0 + uTime * 3.7), sin(p.y * 11.0 + p.x * 5.0 - uTime * 3.1)) * 0.005;
        for (int i = 0; i < 6; i++) { vec4 R = uRipple[i]; if (R.z <= 0.0) continue; vec2 d = p - R.xy; float r = length(d) + 1e-3; g += d / r * sin(r * R.w - uTime * 5.0) * R.z * exp(-r * 0.4); }
        vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 V = normalize(cameraPosition - vW);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec2 suv = gl_FragCoord.xy / uRes;
        vec3 refl = texture2D(tRefl, vec2(suv.x, 1.0 - suv.y) + N.xz * 0.045).rgb;
        float Ld = drainAt(vW);
        vec3 deep = uDeep * (uAmb * 2.0 + groundLight(p) * uExhibit * uLightGain * 0.8);
        vec3 col = mix(deep, refl, clamp(0.3 + fres, 0.0, 1.0));
        vec3 H = normalize(uSunDir + V);
        col += uSunCol * pow(max(dot(N, H), 0.0), 500.0) * 4.0 * step(0.0, uSunDir.y);
        col *= mix(1.0, Ld, 0.93);
        gl_FragColor = vec4(mix(uFogColor, col, fogF(distance(cameraPosition, vW))), 1.0);
      }`,
  });
  const waterBodies = [], waterMeshes = [];
  const worldUV = (geo, k = 1) => { const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
      if (ay > 0.5) uv.setXY(i, x * k, z * k); else if (ax > 0.5) uv.setXY(i, z * k, y * k); else uv.setXY(i, x * k, y * k); }
    return geo; };
  const lathe = (pts, segs = 72) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  const addMesh = (geo, mat, x = 0, z = 0, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, 0, z); m.castShadow = cast; m.receiveShadow = true; scene.add(m); return m; };
  const jets = [];   // GPU droplet emitters: {o:[x,y,z], v:[vx,vy,vz] spread, n}
  const sheets = [];
  function poolRim(x, z, r) {
    addMesh(lathe([[r + 0.6, 0], [r + 0.6, 0.48], [r + 0.55, 0.58], [r + 0.42, 0.62], [r + 0.1, 0.62], [r, 0.56], [r, 0.04]], 96), stoneMat, x, z);
    addMesh(new THREE.CircleGeometry(r, 64).rotateX(-Math.PI / 2).translate(0, 0.04, 0), darkStone, x, z, false);
    const w = addMesh(new THREE.CircleGeometry(r, 96).rotateX(-Math.PI / 2).translate(0, WATER_Y, 0), waterMat, x, z, false); waterBodies.push({ x, z, r: r + 2 }); waterMeshes.push(w);
    block(x, z, r + 0.7); return w;
  }
  function sheet(x, z, y0, y1, r0, r1) {
    const m = addMesh(new THREE.CylinderGeometry(r0, r1, y0 - y1, 72, 1, true).translate(0, (y0 + y1) / 2, 0), sheetMat, x, z, false); m.renderOrder = 4; sheets.push(m);
    const f = addMesh(new THREE.RingGeometry(r1, r1 + 0.55, 72, 1).rotateX(-Math.PI / 2).translate(0, y1 + 0.012, 0), foamMat, x, z, false); f.renderOrder = 5;
  }
  { // the grand tiered fountain
    const p = layout.pools[0]; poolRim(p.x, p.z, p.r);
    addMesh(lathe([[0.95, 0], [0.95, 0.2], [0.75, 0.28], [0.42, 0.4], [0.33, 0.8], [0.37, 1.05], [0.6, 1.18], [1.2, 1.32], [1.9, 1.44], [2.12, 1.52], [2.12, 1.6], [2.0, 1.62], [1.92, 1.52], [1.2, 1.47], [0.01, 1.44]]), stoneMat, p.x, p.z);
    addMesh(new THREE.CircleGeometry(1.93, 64).rotateX(-Math.PI / 2).translate(0, 1.55, 0), bowlWater, p.x, p.z, false);
    addMesh(lathe([[0.28, 1.44], [0.21, 1.8], [0.26, 2.2], [0.45, 2.32], [0.9, 2.44], [1.08, 2.52], [1.08, 2.58], [1.0, 2.6], [0.95, 2.52], [0.5, 2.5], [0.01, 2.49]]), stoneMat, p.x, p.z);
    addMesh(new THREE.CircleGeometry(0.96, 48).rotateX(-Math.PI / 2).translate(0, 2.555, 0), bowlWater, p.x, p.z, false);
    addMesh(lathe([[0.18, 2.49], [0.12, 2.6], [0.2, 2.72], [0.08, 2.86], [0.02, 2.92]], 32), stoneMat, p.x, p.z);
    sheet(p.x, p.z, 1.6, WATER_Y, 2.13, 2.3); sheet(p.x, p.z, 2.58, 1.55, 1.09, 1.16);
    jets.push({ o: [p.x, 2.92, p.z], vy: [2.3, 2.9], vr: [0.15, 0.6], n: isTouch ? 400 : 900 });
    ripples[0].set(p.x, p.z, 0.02, 5.0);
  }
  for (const [i, p] of layout.pools.slice(1).entries()) {   // two bowl fountains on the cross walks
    poolRim(p.x, p.z, p.r);
    addMesh(lathe([[0.55, 0], [0.55, 0.15], [0.3, 0.3], [0.2, 0.7], [0.3, 0.82], [0.7, 0.92], [0.86, 0.98], [0.86, 1.03], [0.78, 1.05], [0.4, 0.98], [0.01, 0.96]], 48), stoneMat, p.x, p.z);
    addMesh(new THREE.CircleGeometry(0.77, 40).rotateX(-Math.PI / 2).translate(0, 1.01, 0), bowlWater, p.x, p.z, false);
    sheet(p.x, p.z, 1.03, WATER_Y, 0.87, 0.95);
    jets.push({ o: [p.x, 1.02, p.z], vy: [1.2, 1.6], vr: [0.0, 0.12], n: 160 });
    ripples[1 + i].set(p.x, p.z, 0.012, 7.0);
  }
  { // the canal: coping, floor, water, arching jets
    const { hw, z0, z1 } = layout.canal, L = z1 - z0, zc = (z0 + z1) / 2;
    for (const s of [-1, 1]) { addMesh(worldUV(new THREE.BoxGeometry(0.4, 0.5, L + 0.8).translate(s * (hw + 0.2), 0.25, zc), 0.5), stoneMat); }
    for (const zz of [z0 - 0.2, z1 + 0.2]) addMesh(worldUV(new THREE.BoxGeometry(hw * 2 + 0.8, 0.5, 0.4).translate(0, 0.25, zz), 0.5), stoneMat);
    addMesh(new THREE.PlaneGeometry(hw * 2, L).rotateX(-Math.PI / 2).translate(0, 0.04, zc), darkStone, 0, 0, false);
    waterMeshes.push(addMesh(new THREE.PlaneGeometry(hw * 2, L).rotateX(-Math.PI / 2).translate(0, WATER_Y, zc), waterMat, 0, 0, false));
    waterBodies.push({ x: 0, z: zc, r: L / 2 + 3 });
    for (let z = z0 + 0.5; z <= z1; z += 0.25) block(0, z, hw + 0.45);
    for (let z = z0 + 2; z <= z1 - 1.5; z += 3.8) for (const s of [-1, 1]) jets.push({ o: [s * (hw + 0.05), 0.5, z], dir: [-s, 0], vy: [2.3, 2.6], vh: [1.45, 1.65], n: 70 });
    ripples[3].set(0, zc, 0.0, 0.0);
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
          gl_PointSize = clamp((0.022 + 0.02 * aSeed.z) * uPx / -mv.z, 0.0, 14.0);
          vC = vec3(0.7, 0.8, 0.86) * (uAmb * 1.6 + uSun * 0.9 + groundLight(p.xz) * uExhibit * uLightGain * 0.9) * mix(1.0, L, 0.93);
          vA = 0.55 * fogF(-mv.z);
        }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 q = gl_PointCoord * 2.0 - 1.0; float r2 = dot(q, q); if (r2 > 1.0) discard; gl_FragColor = vec4(vC * (1.0 + 0.6 * (1.0 - r2)), vA * (1.0 - r2 * 0.6)); }`,
    });
    const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 6; scene.add(pts);
  }
  // urns on the gravel ring around the fountain
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2, x = Math.cos(a) * 7.1, z = Math.sin(a) * 7.1;
    addMesh(worldUV(new THREE.BoxGeometry(0.8, 0.5, 0.8).translate(0, 0.25, 0), 0.8), stoneMat, x, z);
    addMesh(lathe([[0.22, 0.5], [0.18, 0.62], [0.3, 0.72], [0.45, 0.95], [0.5, 1.15], [0.55, 1.2], [0.5, 1.22], [0.44, 1.12], [0.01, 1.1]], 40), stoneMat, x, z);
    addPlant('geranium', x, z, { y: 1.12, scale: 0.7 }); addPlant('nepeta', x + 0.05, z - 0.05, { y: 1.1, scale: 0.45, salt: 5 });
    block(x, z, 0.6);
  }
  // metal: light-tunnel frames, lantern poles (from the exhibit) and rose arches
  const tubeSegs = metalSegs.slice();
  const roseArch = (t) => {
    const p = layout.loopCurve.getPointAt(t), tg = layout.loopCurve.getTangentAt(t), nx = -tg.z, nz = tg.x, Wd = 1.78;
    const frames = [];
    for (const d of [-0.22, 0.22]) {
      const pts = []; const bx = p.x + tg.x * d, bz = p.z + tg.z * d;
      for (let i = 0; i <= 24; i++) { const u = i / 24; let off, y;
        if (u < 0.3) { off = -Wd; y = u / 0.3 * 2.1; } else if (u > 0.7) { off = Wd; y = (1 - u) / 0.3 * 2.1; } else { const a = Math.PI * (1 - (u - 0.3) / 0.4); off = Math.cos(a) * Wd; y = 2.1 + Math.sin(a) * 0.75; }
        pts.push(new V3(bx + nx * off, y, bz + nz * off)); }
      frames.push(pts); for (let i = 0; i < pts.length - 1; i++) tubeSegs.push([pts[i].toArray(), pts[i + 1].toArray(), 0.022]);
    }
    for (let i = 4; i <= 20; i += 2) tubeSegs.push([frames[0][i].toArray(), frames[1][i].toArray(), 0.014]);
    // the climbing rose itself
    const L = LOOKS.roseDA, lr = leafAtlas.rects[L.leaf], fr = flAtlas.rects.roseDA, lc = new THREE.Color(L.leafCol);
    for (let i = 0; i < (isTouch ? 170 : 300); i++) {
      const fi = rng() < 0.5 ? 0 : 1, u = rng() * 24, a = frames[fi][Math.floor(u)], b = frames[fi][Math.min(24, Math.floor(u) + 1)];
      _p.copy(a).lerp(b, u % 1).add(new V3(rr(-0.25, 0.25), rr(-0.2, 0.25), rr(-0.25, 0.25)));
      if (_p.y < 0.2) continue;
      _q.setFromEuler(new THREE.Euler(rr(-1, 1), rr(0, TAU), rr(-1, 1))); _s.set(L.leafIn[0] * IN * 1.15, L.leafIn[1] * IN * 1.15, IN);
      push(bucket(_p.x, _p.z).leafC, _p, _q, _s, _c.copy(lc).multiplyScalar(0.8 + 0.4 * rng()), lr);
    }
    for (let i = 0; i < 55; i++) {
      const fi = rng() < 0.5 ? 0 : 1, u = 3 + rng() * 18, a = frames[fi][Math.floor(u)], b = frames[fi][Math.floor(u) + 1];
      _p.copy(a).lerp(b, u % 1).add(new V3(rr(-0.2, 0.2), rr(-0.1, 0.2), rr(-0.2, 0.2)));
      _q.setFromEuler(new THREE.Euler(rr(-1.2, 1.2), rr(0, TAU), rr(-1.2, 1.2))); const d = L.flIn * IN * rr(0.9, 1.2); _s.set(d, d, d);
      push(bucket(_p.x, _p.z).disc, _p, _q, _s, _c.setScalar(rr(0.9, 1.05)), fr, [L.curve != null ? L.curve : 0.36, 0]);
    }
    for (const s of [-1, 1]) addPlant('roseDA', p.x + nx * s * (Wd + 0.35), p.z + nz * s * (Wd + 0.35), { scale: 0.75, salt: 9 });
  };
  for (const t of [0.085, 0.2, 0.29, 0.415, 0.52, 0.655, 0.775, 0.905]) roseArch(t);
  {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, false).translate(0, 0.5, 0), n = tubeSegs.length, im = new THREE.InstancedMesh(geo, metalMat, n);
    const m = new THREE.Matrix4(), a = new V3(), b = new V3(), q = new Q(), s = new V3();
    tubeSegs.forEach(([A, B, r], i) => { a.fromArray(A); b.fromArray(B).sub(a); const len = b.length(); q.setFromUnitVectors(_Y, b.normalize()); s.set(r, len, r); m.compose(a, q, s); im.setMatrixAt(i, m); });
    im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im);
  }

  // ---------------------------------------------------------------- trees (the exhibit's light-wrapped trees, made real)
  {
    const barkC = (() => { const [c, g] = canvas(256, 512), r = PlantArt.rngOf(77); g.fillStyle = '#4b4136'; g.fillRect(0, 0, 256, 512);
      for (let i = 0; i < 900; i++) { const x = r() * 256, w = 2 + r() * 8; g.fillStyle = ['#3a3229', '#5c5144', '#2e2821', '#6a5e4e', '#433a30'][Math.floor(r() * 5)]; g.globalAlpha = 0.5 + r() * 0.5; g.fillRect(x, r() * 512, w, 20 + r() * 120); }
      g.globalAlpha = 1; return c; })();
    const barkT = texOf(barkC, renderer); barkT.repeat.set(1, 2);
    const barkMat = P.std({ map: barkT, bumpMap: texOf(barkC, renderer, { srgb: false }), bumpScale: 2, roughness: 0.95 }, { sway: 0.02, swayH: 8 });
    const broadT = texOf(clusterTex('broad'), renderer, { repeat: false }), willowT = texOf(clusterTex('willow'), renderer, { repeat: false });
    const broadMat = P.std({ map: broadT, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75 }, { sway: 0.08, swayH: 6, key: 'broad' });
    const willowMat = P.std({ map: willowT, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75 }, { sway: 0.14, swayH: 5, key: 'willow' });
    const broadD = P.depth(broadT, { sway: 0.08, swayH: 6, key: 'broad' }), willowD = P.depth(willowT, { sway: 0.14, swayH: 5, key: 'willow' });
    const segs = [], broad = [], willow = [];
    const seg = (a, b, r) => segs.push([a.clone(), b.clone(), r]);
    for (const T of treeSpecs) {
      const tr = PlantArt.rngOf(Math.floor(T.x * 131 + T.z * 71) >>> 0), R = (a, b) => a + (b - a) * tr();
      const r0 = 0.17 * T.s + 0.06, base = new V3(T.x, -0.1, T.z), top = new V3(T.x + R(-0.15, 0.15), T.h, T.z + R(-0.15, 0.15));
      const mid = base.clone().lerp(top, 0.5).add(new V3(R(-0.1, 0.1), 0, R(-0.1, 0.1)));
      seg(base, mid, r0); seg(mid, top, r0 * 0.8);
      block(T.x, T.z, r0 + 0.3);
      const nP = 6 + Math.floor(tr() * 3), tips = [];
      for (let k = 0; k < nP; k++) {
        const th = k / nP * TAU + R(-0.3, 0.3), el = T.kind === 'weep' ? R(0.25, 0.75) : R(-0.15, 0.6);
        const tp = new V3(T.x + Math.cos(th) * T.A * 0.6 * Math.cos(el), T.cy + T.B * 0.5 * Math.sin(el), T.z + Math.sin(th) * T.A * 0.6 * Math.cos(el));
        const st = top.clone().lerp(base, R(0, 0.3)); seg(st, tp, r0 * 0.45);
        for (let j = 0; j < 3; j++) { const d = new V3(Math.cos(th + R(-0.9, 0.9)), R(0.1, 0.9), Math.sin(th + R(-0.9, 0.9))).normalize(); const e = tp.clone().addScaledVector(d, T.A * R(0.25, 0.4)); seg(tp, e, r0 * 0.2); tips.push(e); }
      }
      const leafCol = new THREE.Color().setHSL(R(0.22, 0.31), R(0.35, 0.55), R(0.22, 0.33));
      const nC = Math.floor((T.kind === 'weep' ? 170 : 300 + T.A * 40) * (isTouch ? 0.55 : 1));
      for (let i = 0; i < nC; i++) {
        const d = new V3(R(-1, 1), R(-1, 1), R(-1, 1)); if (d.lengthSq() > 1 || d.lengthSq() < 0.01) { i--; continue; } d.normalize();
        if (T.kind === 'weep' && d.y < -0.1) d.y = -d.y * 0.4;
        const k = 0.4 + 0.45 * Math.sqrt(tr());
        broad.push({ p: new V3(T.x + d.x * T.A * k, T.cy + d.y * T.B * k, T.z + d.z * T.A * k), s: R(0.75, 1.15) * Math.min(1.25, T.A / 3), c: leafCol.clone().multiplyScalar(R(0.8, 1.2)), out: d });
      }
      for (const st of T.strands || []) for (let i = 0; i < st.length - 1; i += 1) {
        const a = new V3(...st[i]), b = new V3(...st[i + 1]);
        willow.push({ p: a.clone().lerp(b, 0.5), s: R(0.5, 0.7), c: leafCol.clone().multiplyScalar(R(0.85, 1.25)), hang: true });
        if (i % 2 === 0) seg(a, b, 0.008);
      }
    }
    const build = (list, mat, depth, geo, hang) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length), m = new THREE.Matrix4(), q = new Q(), s = new V3();
      list.forEach((L, i) => {
        if (hang) { q.setFromEuler(new THREE.Euler(rr(-0.2, 0.2), rng() * TAU, rr(-0.15, 0.15))); s.set(L.s * 0.8, L.s * 1.5, L.s); }
        else { q.setFromUnitVectors(new V3(0, 0, 1), L.out.clone().add(new V3(rr(-1, 1), rr(-0.5, 1), rr(-1, 1))).normalize()); q.multiply(new Q().setFromAxisAngle(new V3(0, 0, 1), rng() * TAU)); s.setScalar(L.s); }
        m.compose(L.p, q, s); im.setMatrixAt(i, m); im.setColorAt(i, L.c);
      });
      im.customDepthMaterial = depth; im.castShadow = im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im); return im;
    };
    if (broad.length) build(broad, broadMat, broadD, new THREE.PlaneGeometry(1, 1), false);
    if (willow.length) build(willow, willowMat, willowD, new THREE.PlaneGeometry(1, 1).translate(0, -0.4, 0), true);
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.7, 1, 1, 8, 1, true).translate(0, 0.5, 0), barkMat, segs.length), m = new THREE.Matrix4(), q = new Q(), s = new V3(), d = new V3();
    segs.forEach(([a, b, r], i) => { d.subVectors(b, a); const len = d.length(); q.setFromUnitVectors(_Y, d.normalize()); s.set(r, len, r); m.compose(a, q, s); im.setMatrixAt(i, m); });
    im.castShadow = im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im);
  }

  // ---------------------------------------------------------------- planting
  // entrance avenue double border
  for (const s of [-1, 1]) for (let z = 63.2; z <= 89.8; z += 0.3) for (let d = 1.8; d <= 5.45; d += 0.3) borderPlant(s * (d + rr(-0.12, 0.12)), z + rr(-0.12, 0.12), (d - 1.8) / 3.65, 11);
  // loop borders, both sides of the path
  for (const s of layout.loopS) {
    if (!layout.inBorderT(s.t)) continue;
    const nx = -s.tz, nz = s.tx;
    for (const side of [-1, 1]) for (let d = 1.75; d <= 4.4; d += 0.32) { const j = rr(-0.13, 0.13); borderPlant(s.x + nx * side * d + j, s.z + nz * side * d - j, (d - 1.75) / 2.65, 23); }
  }
  // canal: lavender walks
  for (const s of [-1, 1]) for (let z = 23; z <= 59; z += 0.42) for (const x of [3.75, 4.25]) { const k = (Math.floor(z / 0.42) % 9 === 0) ? 'nepeta' : 'lavandula'; addPlant(k, s * x + rr(-0.05, 0.05), z + (x > 4 ? 0.21 : 0), { scale: 1.1 }); }
  // parterre: roses, lavender edging, catmint, alliums, peonies
  for (let q = 0; q < 4; q++) {
    for (let r = 9.2; r <= 13.5; r += 0.55) for (let a = q * Math.PI / 2; a < (q + 1) * Math.PI / 2; a += 0.55 / r) {
      const x = Math.cos(a) * r + rr(-0.1, 0.1), z = Math.sin(a) * r + rr(-0.1, 0.1);
      if (Math.abs(x) < 2.05 || Math.abs(z) < 2.05) continue;
      let k;
      if (r < 9.6 || r > 13.2) k = 'lavandula';
      else k = drift(x, z, ['roseDA', 'roseDA', 'roseKO', 'nepeta', 'alliumG', 'peony', 'geranium', 'alliumM', 'roseDA', 'nepeta'], 1.8, 77 + q);
      const rad = radiusOf(k) * 0.85; if (!spaceOk(x, z, rad, 0.75)) continue; claim(x, z, rad); addPlant(k, x, z, { salt: q });
    }
  }
  // wildflowers in the two meadows
  for (const m of layout.meadows) {
    const n = Math.floor(m.r * m.r * (isTouch ? 1.0 : 2.0));
    for (let i = 0; i < n; i++) {
      const a = rng() * TAU, d = m.r * Math.sqrt(rng()) * 0.95, x = m.x + Math.cos(a) * d, z = m.z + Math.sin(a) * d;
      if (layout.distToPath(x, z) < 2) continue;
      const k = drift(x, z, ['papaver', 'leucanthemum', 'leucanthemum', 'coreopsis', 'aster', 'geranium', 'achillea', 'papaver'], 3.5, 300);
      addFlowerStalk(k, x, z, rr(0.35, 0.85), rr(0.45, 0.7));
    }
  }

  // low leafy ground cover between plants in the beds
  {
    const pts = [];
    const add = (x, z) => { if (!blocked(x, z)) pts.push([x, z]); };
    for (const s of [-1, 1]) for (let i = 0; i < 26 * 3.6 * 18; i++) add(s * rr(1.75, 5.5), rr(63, 90));
    for (const s of layout.loopS) if (layout.inBorderT(s.t)) for (let i = 0; i < 2 * 2.7 * 0.5 * 18; i++) { const side = rng() < 0.5 ? -1 : 1, d = rr(1.7, 4.45); add(s.x - s.tz * side * d + rr(-0.25, 0.25), s.z + s.tx * side * d + rr(-0.25, 0.25)); }
    for (let i = 0; i < 300 * 16; i++) { const a = rng() * TAU, r = Math.sqrt(rr(8.85 ** 2, 13.75 ** 2)), x = Math.cos(a) * r, z = Math.sin(a) * r; if (Math.abs(x) > 2.0 && Math.abs(z) > 2.0) add(x, z); }
    const ct = texOf(clusterTex('broad'), renderer, { repeat: false });
    const mat = P.std({ map: ct, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 }, { sway: 0.3, key: 'cover' });
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, pts.length), m = new THREE.Matrix4(), q = new Q(), sc = new V3(), c = new THREE.Color(), p = new V3();
    pts.forEach(([x, z], i) => {
      q.setFromEuler(new THREE.Euler(-Math.PI / 2 + rr(-0.7, 0.7), rng() * TAU, rr(-0.5, 0.5), 'YXZ')); const k = rr(0.35, 0.6); sc.set(k, k, k);
      m.compose(p.set(x, rr(0.04, 0.22), z), q, sc); im.setMatrixAt(i, m); im.setColorAt(i, c.setHSL(rr(0.22, 0.3), rr(0.35, 0.55), rr(0.13, 0.22)));
    });
    im.customDepthMaterial = P.depth(ct, { sway: 0.3, key: 'cover' }); im.castShadow = false; im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im);
  }

  // ---------------------------------------------------------------- bake the plant buckets into instanced meshes
  const chunks = [];
  let instTotal = 0; const byType = {};
  for (const bk of buckets.values()) {
    const ch = { x: bk.x, z: bk.z, meshes: [] };
    for (const type of TYPES) {
      const B = bk[type]; if (!B.n) continue;
      const n = B.n, perm = Array.from({ length: n }, (_, i) => i);
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
      const m = new Float32Array(n * 16), c = new Float32Array(n * 3), r = B.r.length ? new Float32Array(n * 4) : null, s = B.s.length ? new Float32Array(n * 2) : null;
      for (let j = 0; j < n; j++) { const i = perm[j]; for (let e = 0; e < 16; e++) m[j * 16 + e] = B.m[i * 16 + e]; c[j * 3] = B.c[i * 3]; c[j * 3 + 1] = B.c[i * 3 + 1]; c[j * 3 + 2] = B.c[i * 3 + 2];
        if (r) for (let e = 0; e < 4; e++) r[j * 4 + e] = B.r[i * 4 + e]; if (s) { s[j * 2] = B.s[i * 2]; s[j * 2 + 1] = B.s[i * 2 + 1]; } }
      const geo = GEOS[type].clone();
      if (r) geo.setAttribute('aRect', new THREE.InstancedBufferAttribute(r, 4));
      if (s) geo.setAttribute('aShape', new THREE.InstancedBufferAttribute(s, 2));
      const mesh = new THREE.InstancedMesh(geo, MATS[type], n);
      mesh.instanceMatrix = new THREE.InstancedBufferAttribute(m, 16);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(c, 3);
      mesh.customDepthMaterial = DEPTHS[type]; mesh.castShadow = mesh.receiveShadow = true; mesh.computeBoundingSphere();
      scene.add(mesh); ch.meshes.push({ mesh, n, type }); instTotal += n; byType[type] = (byType[type] || 0) + n;
    }
    chunks.push(ch);
  }
  buckets.clear();
  console.log(`[garden] ${plantCount} plants, ${instTotal} plant instances in ${chunks.length} chunks ${JSON.stringify(byType)}`);

  // ---------------------------------------------------------------- per-frame
  const v2 = new THREE.Vector2();
  function update(dt, t, camera) {
    U.uCam.value.copy(camera.position);
    sheetT.offset.y = (sheetT.offset.y + dt * 1.4) % 1; foamT.offset.x = (foamT.offset.x + dt * 0.05) % 1;
    const cx = camera.position.x, cz = camera.position.z;
    for (const ch of chunks) {
      const d = Math.hypot(ch.x - cx, ch.z - cz), vis = d < 95;
      for (const M of ch.meshes) {
        M.mesh.visible = vis; if (!vis) continue;
        const f = M.type === 'leafC' || M.type === 'leafS' ? (d < 24 ? 1 : d < 42 ? 0.6 : 0.33) : M.type === 'stem' ? (d < 30 ? 1 : 0.35) : (d < 45 ? 1 : 0.6);
        M.mesh.count = Math.max(1, Math.floor(M.n * f)); M.mesh.castShadow = d < 32;
      }
    }
    renderer.getDrawingBufferSize(v2); waterMat.uniforms.uRes.value.copy(v2);
  }
  function preRender(camera, extras) {   // the mirrored pass for water reflections
    const cx = camera.position.x, cz = camera.position.z;
    if (!waterBodies.some(w => Math.hypot(w.x - cx, w.z - cz) < w.r + 70)) return;
    renderer.getDrawingBufferSize(v2);
    const w = Math.max(16, Math.floor(v2.x * reflScale)), h = Math.max(16, Math.floor(v2.y * reflScale));
    if (reflRT.width !== w || reflRT.height !== h) reflRT.setSize(w, h);
    reflCam.copy(camera); reflCam.layers.set(0); reflCam.layers.enable(3);
    reflCam.position.y = 2 * WATER_Y - camera.position.y; reflCam.rotation.set(-camera.rotation.x, camera.rotation.y, 0, 'YXZ'); reflCam.updateMatrixWorld();
    grass.visible = false; for (const w of waterMeshes) w.visible = false;
    const hidden = [];
    for (const ch of chunks) if (Math.hypot(ch.x - cx, ch.z - cz) > 40) for (const M of ch.meshes) if (M.mesh.visible) { M.mesh.visible = false; hidden.push(M.mesh); }
    const px0 = U.uPx.value; U.uPx.value = px0 * reflScale;
    renderer.clippingPlanes = [new THREE.Plane(new V3(0, 1, 0), -WATER_Y)];
    renderer.setRenderTarget(reflRT); renderer.render(scene, reflCam);
    renderer.clippingPlanes = []; U.uPx.value = px0; grass.visible = true; for (const m of hidden) m.visible = true; for (const w of waterMeshes) w.visible = true;
    if (extras) extras();
  }
  return { update, preRender, blocked, plantCount, WATER_Y };
}
