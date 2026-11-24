// walling.js: the long task. A dry stone wall round the garden, built a stint at a time with Dry Stack's stones and physics.
//
// The wall's line is where the brick wall stood: 92 stints of about three metres. Walk up to one and start it: your suit
// delivers a pile of stone beside it, sets up batter frames and string lines, and from then on lifts what you point at.
// A stone you are moving is still a real body (Rapier): it pushes and is pushed, lags when heavy, and settles where it is set.
// Finish a stint and its stones are fixed in place and remembered; come back any time for the next.
//
// Everything about one stint happens in its own frame (x along the wall, z out into the field, y up), so Dry Stack's wall
// spec, guides and wall-reading work unchanged; the stint's group carries that frame to its place on the perimeter.
//
// Free building works the same way without the guides: B anywhere off the wall line opens a site where you stand, and whatever you
// set there stays as you set it. Stone can be drawn from three places: the pile the suit brings (N for more), the four fieldstone
// heaps, and the junk heap under the wormhole (junk.js), whose pieces are the Shred Hole's own debris. A piece taken from a heap and
// not used goes back to it.
//
// Glue, for free builds (as Tears of the Kingdom's Ultrahand has it): press a piece against others and J welds it to everything it
// touches, a fixed joint at each seam, marked by a green blob. Glued pieces move as one: lift any of them and the whole assembly comes
// too, weightless in the suit's beam while it is held. Shift+J unglues the piece you hold or look at. A dry stone wall takes no glue.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STONE_TYPES, SIZE_CLASSES, generateStone, makeStoneMaterial, hooks, perf } from './drystack/stones.js';
import { WallSpec, Guides } from './drystack/wall.js';
import { analyseWall } from './drystack/analysis.js';
import { heightAt } from './field.js';

export const LINE = { x: 27.25, z0: -31.25, z1: 55.25, gate: 2.4 };          // the wall's centre line, and half the gap left for the gate
const BASE = 0.72, TOP = 0.42, HEIGHT = 1.1;
const CLS = ['foundation', 'builder', 'through', 'cope', 'hearting', 'pinning'];
const STRENGTH = 520, REACH = 7.5;                                           // newtons the suit can put into a stone; how far it reaches
const KEY = 'gd.wall.v1', FREE_KEY = 'gd.free.v1';
const UP = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;

/** The stints, in order round the perimeter from the gate's east pier, clockwise seen from above. */
export function makeStints() {
  const out = [], run = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.round(L / 3), tx = (x1 - x0) / L, tz = (z1 - z0) / L;
    // local +x runs along the wall; local +z must point out of the garden. The centre of the garden is (0, 12).
    let nx = -tz, nz = tx; const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2; let flip = false;
    if (nx * mx + nz * (mz - 12) < 0) flip = true;
    for (let i = 0; i < n; i++) {
      const c = (i + 0.5) / n, cx = x0 + (x1 - x0) * c, cz = z0 + (z1 - z0) * c;
      // rotation about y that takes local x to (tx, tz) or its reverse, so that local z = outward
      const ax = flip ? -tx : tx, az = flip ? -tz : tz, yaw = Math.atan2(-az, ax);
      out.push({ id: out.length, x: cx, z: cz, yaw, L: L / n, ox: Math.sin(yaw), oz: Math.cos(yaw), state: 'todo' });
    }
  };
  run(LINE.gate, LINE.z1, LINE.x, LINE.z1); run(LINE.x, LINE.z1, LINE.x, LINE.z0); run(LINE.x, LINE.z0, -LINE.x, LINE.z0);
  run(-LINE.x, LINE.z0, -LINE.x, LINE.z1); run(-LINE.x, LINE.z1, -LINE.gate, LINE.z1);
  return out;
}
// the four fieldstone heaps: x, z, radius, height
export const HEAPS = [[35.4, 63.4, 4.7, 2.9], [-35.6, 62.8, 5.3, 3.2], [35.8, -39.4, 4.3, 2.6], [-35.0, -39.0, 5.0, 3.0]];
const lumpOf = (hi, a) => 0.82 + 0.2 * Math.sin(3 * a + hi) + 0.12 * Math.sin(7 * a + 2 * hi);
/** How high heap hi's mound stands above the ground here (0 off it). */
export function moundAt(hi, x, z) { const [hx, hz, R, H] = HEAPS[hi], dx = x - hx, dz = z - hz, r = Math.hypot(dx, dz); if (r > R * 1.4) return 0; const a = Math.atan2(dz, dx);
  return H * lumpOf(hi, a) * Math.max(0, 1 - Math.pow(r / (R * lumpOf(hi, a + 1.3)), 1.7)); }
function counts(L, lite) {
  return { foundation: Math.round(L * 6.5) + 2, builder: Math.round(L * 34) + 6, through: Math.max(2, Math.round(L / 0.9) + 1), cope: Math.ceil(L / 0.115) + 3,
    hearting: Math.round(L * (lite ? 34 : 55)), pinning: Math.round(L * (lite ? 6 : 10)) + 4 };
}
const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
// a stone at lower detail than its class's: the same shape function, sampled more coarsely
function stoneAt(type, cls, seed, detail) {
  const S = SIZE_CLASSES[cls], d0 = S.detail, l0 = perf.lite; if (detail) { S.detail = detail; perf.lite = false; }
  try { return generateStone(type, cls, seed); } finally { S.detail = d0; perf.lite = l0; }
}

export function createWalling({ scene, camera, U, patchFrag, garden, junk = null, lite = false, hint = () => {}, onChange = () => {}, onTurn = () => {} }) {
  perf.lite = !!lite;
  // the stone shader takes the garden's light, weather and voids (see makePatcher.fragOnly)
  hooks.post = (sh, mat) => {
    let f = sh.fragmentShader;
    f = f.replace('uniform float uTime;', '').replace(/\bvnoise\b/g, 'dsVnoise').replace('varying vec3 vWPos; varying vec3 vWNormal;', 'varying vec3 vWNormal;');
    // a stone the suit has hold of, or that you are pointing at, is rimmed with the beam's light
    f = f.replace('totalEmissiveRadiance += vec3(1.0, 0.8, 0.4) * uHighlight * 0.04;', 'totalEmissiveRadiance += vec3(0.2, 0.85, 1.0) * uHighlight * (0.03 + 0.4 * pow(clamp(1.0 - abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 2.0));');
    sh.fragmentShader = f; patchFrag(sh);
    if (mat.userData.merged) sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aObj;').replace('vObjPos = position;', 'vObjPos = aObj;');
  };
  const stints = makeStints();
  let A = null;                                          // active: { s, group, inv, physics, spec, guides, stones[], type, seedNext, queue[], notes }
  U.uWork = { value: new THREE.Vector4(0, 0, 1, 0) }; U.uWorkOn = { value: 0 };   // the trodden yard beside the stint in hand (field.js)
  let store = { stone: 'newengland', done: {}, paused: {}, heapTaken: {} };
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.done) store = Object.assign(store, s); } catch (e) {}
  if (!store.heapTaken) store.heapTaken = {};
  let free = { sites: [], seq: 0 };                     // free builds: { id, x, y, z, yaw, type, stones, seedNext }
  try { const s = JSON.parse(localStorage.getItem(FREE_KEY) || 'null'); if (s && Array.isArray(s.sites)) free = s; } catch (e) {}
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); localStorage.setItem(FREE_KEY, JSON.stringify(free)); } catch (e) { hint('this browser would not save the wall (storage full or blocked)', 6000); } };
  const freeSites = free.sites.map(f => ({ ...f, free: true, L: 6, state: 'paused' }));
  for (const s of stints) s.state = store.done[s.id] ? 'done' : store.paused[s.id] ? 'paused' : 'todo';

  const root = new THREE.Group(); root.name = 'walling'; scene.add(root);
  const mats = {}, matOf = (type, merged) => mats[type + (merged ? 'm' : '')] || (mats[type + (merged ? 'm' : '')] = makeStoneMaterial(type, merged));
  const glowMat = {};                                   // a stone you are pointing at or holding: its own material instance, lit up
  const hotMat = type => { if (!glowMat[type]) { const m = makeStoneMaterial(type); m.userData.uniforms.uHighlight.value = 1; glowMat[type] = m; } return glowMat[type]; };
  const junkHot = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15, emissive: 0x1d6f86, emissiveIntensity: 0.6 });
  // one entry of a stone list: [class, seed, x, y, z, qx, qy, qz, qw, source?]; source says where it came from when not the site's own pile
  const srcType = (e, type) => (e[9] && e[9].t) || type;
  function geomOf(e, type, detail) {
    if (e[9] && e[9].j) { const d = junk && junk.stoneData(e[9].j); if (!d) return null; return d.geometry; }
    const st = stoneAt(srcType(e, type), CLS[e[0]], e[1], detail); return st.geometry;
  }

  // ---------------------------------------------------------------- markers: where each unbuilt stint goes
  const pegGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.42, 6).translate(0, 0.19, 0), pegMat = new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.85 });
  const stringMat = new THREE.MeshBasicMaterial({ color: 0xf2e14b });
  const pegs = new THREE.InstancedMesh(pegGeo, pegMat, stints.length * 4), strings = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.004, 0.004), stringMat, stints.length * 2);
  pegs.castShadow = true; pegs.frustumCulled = strings.frustumCulled = false; root.add(pegs, strings);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  function drawMarkers() {
    stints.forEach((s, i) => {
      const show = s.state === 'todo';
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([ex, ez], k) => {
        if (!show) { pegs.setMatrixAt(i * 4 + k, ZERO); return; }
        const lx = ex * s.L / 2, lz = ez * BASE / 2; _p.set(s.x + Math.cos(s.yaw) * lx + s.ox * lz, 0, s.z - Math.sin(s.yaw) * lx + s.oz * lz);
        pegs.setMatrixAt(i * 4 + k, _m.compose(_p, _q.identity(), _s.set(1, 1, 1)));
      });
      [-1, 1].forEach((ez, k) => {
        if (!show) { strings.setMatrixAt(i * 2 + k, ZERO); return; }
        _p.set(s.x + s.ox * ez * BASE / 2, 0.3, s.z + s.oz * ez * BASE / 2); strings.setMatrixAt(i * 2 + k, _m.compose(_p, _q.setFromAxisAngle(UP, s.yaw), _s.set(s.L, 1, 1)));
      });
    });
    pegs.instanceMatrix.needsUpdate = strings.instanceMatrix.needsUpdate = true;
  }
  drawMarkers();

  // ---------------------------------------------------------------- built stints: one fixed mesh each, in two levels of detail
  const built = new Map();                              // id -> { group, far, near, job }
  const jobs = [];                                      // geometry to build, a little each frame
  // vertices per stone are 10 (d + 1)^2 + 2. Far: a whole built wall is about 0.7 million vertices. Near: the dozen stints around you.
  const DETAIL = { far: { foundation: 2, builder: 1, through: 2, cope: 1, hearting: 0, pinning: 0 }, near: lite ? { foundation: 4, builder: 3, through: 3, cope: 3, hearting: 0, pinning: 0 } : { foundation: 6, builder: 5, through: 5, cope: 5, hearting: 1, pinning: 1 } };
  const NEAR = lite ? 12 : 18;
  DETAIL.heap = lite ? { foundation: 2, builder: 1, through: 2, cope: 1, hearting: 0, pinning: 0 } : { foundation: 3, builder: 2, through: 3, cope: 2, hearting: 1, pinning: 0 };
  function frameOf(s) { const g = new THREE.Group(); g.position.set(s.x, s.y || 0, s.z); g.rotation.y = s.yaw; g.updateMatrixWorld(true); return g; }
  function queueBuilt(s, rec, level, type, list) {
    const parts = new Map(), q = new THREE.Quaternion(), m = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(); let i = 0;
    const ranges = level === 'heap' ? (rec.ranges = new Array(list.length)) : null, skip = level === 'heap' ? (rec.taken || new Set()) : null, vcount = new Map();
    jobs.push({ s, level, step() {
      if (rec.dead) { for (const L of parts.values()) L.forEach(g => g.dispose()); return true; }
      const t0 = performance.now();
      while (i < list.length && performance.now() - t0 < 5) {
        const e = list[i++], cls = CLS[e[0]], d = DETAIL[level][cls]; if (!d && !(e[9] && e[9].j)) continue;
        const g = geomOf(e, type, d); if (!g) continue;
        const key = e[9] && e[9].j ? 'junk' : srcType(e, type);
        if (key !== 'junk') g.setAttribute('aObj', g.attributes.position.clone());
        g.applyMatrix4(m.compose(p.set(e[2], e[3], e[4]), q.set(e[5], e[6], e[7], e[8]), one));
        let L = parts.get(key); if (!L) parts.set(key, L = []);
        if (ranges) { const v0 = vcount.get(key) || 0; ranges[i - 1] = [v0, g.attributes.position.count]; vcount.set(key, v0 + g.attributes.position.count); if (skip.has(i - 1)) g.attributes.position.array.fill(0); }
        L.push(g);
      }
      if (i < list.length) return false;
      const holder = new THREE.Group(); holder.visible = false;
      for (const [key, L] of parts) {
        const geo = mergeGeometries(L, false); L.forEach(g => g.dispose()); if (!geo) continue; geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, key === 'junk' ? junk.material : matOf(key, true)); mesh.castShadow = mesh.receiveShadow = true; holder.add(mesh);
        if (ranges) { rec.mesh = mesh; rec.orig = Float32Array.from(geo.attributes.position.array); }
      }
      rec.group.add(holder); rec[level] = holder;
      return true;
    } });
  }
  function showBuilt(s, type, list) {
    let rec = built.get(s.id); if (rec) { rec.dead = true; root.remove(rec.group); rec.group.traverse(o => o.geometry && o.geometry.dispose()); }
    rec = { s, group: frameOf(s), far: null, near: null, type, list, wantNear: false }; root.add(rec.group); built.set(s.id, rec);
    queueBuilt(s, rec, 'far', type, list);
    if (s.free) { for (const g of s.glue || []) glueBlob(rec.group, new THREE.Vector3(g[2], g[3], g[4])); blockFree(); return; }
    for (let d = -s.L / 2; d <= s.L / 2 + 0.01; d += 0.25) garden.block(s.x + Math.cos(s.yaw) * d, s.z - Math.sin(s.yaw) * d, 0.42);   // a wall you built is a wall you walk round
  }
  // what you have built freely is in your way too: every stone bigger than a fist, by the metre square
  const freeBlock = new Map();
  function blockFree() {
    freeBlock.clear(); const v = new THREE.Vector3();
    for (const f of freeSites) { if (A && A.s === f) continue; const g = frameOf(f);
      for (const e of f.stones || []) { const cls = CLS[e[0]]; if (cls === 'hearting' || cls === 'pinning') continue; v.set(e[2], e[3], e[4]).applyMatrix4(g.matrixWorld);
        const r = cls === 'foundation' ? 0.3 : cls === 'through' ? 0.28 : 0.2, k = Math.floor(v.x) + ',' + Math.floor(v.z); let L = freeBlock.get(k); if (!L) freeBlock.set(k, L = []); L.push(v.x, v.z, r); } }
  }
  if (garden.setExtraBlocked) garden.setExtraBlocked((x, z) => {
    if (!freeBlock.size) return false; const cx = Math.floor(x), cz = Math.floor(z);
    for (let a = cx - 1; a <= cx + 1; a++) for (let b = cz - 1; b <= cz + 1; b++) { const L = freeBlock.get(a + ',' + b); if (L) for (let k = 0; k < L.length; k += 3) if ((x - L[k]) ** 2 + (z - L[k + 1]) ** 2 < L[k + 2] * L[k + 2]) return true; }
    return false; });
  for (const s of stints) { const d = store.done[s.id] || store.paused[s.id]; if (d) showBuilt(s, d.type, d.stones); }
  for (const f of freeSites) if (f.stones && f.stones.length) showBuilt(f, f.type, f.stones);

  // ---------------------------------------------------------------- the stone heaps: fieldstone tipped at the four corners, for building
  // Each is a mound of stone lying as it fell: big stones first, each where it does not sit on another, then smaller ones in the gaps,
  // then hearting, with a buried layer under it all so no light shows through. Every stone in it can be lifted out (it is hidden in
  // the heap's mesh and becomes a real body in the site you are working); taken stones are remembered.
  const heaps = [];
  { const _hq = new THREE.Quaternion(), _hn = new THREE.Vector3(), _hy = new THREE.Quaternion();
    const RAD = [0.3, 0.18, 0.32, 0.17, 0.05, 0.06], THICK = [0.25, 0.15, 0.13, 0.1, 0.05, 0.02];
    HEAPS.forEach(([hx, hz, R, H], hi) => {
      const rng = mulberry(9100 + hi * 131), list = [], meta = [], cell = new Map(), CELL = 0.5;
      const near = (x, z, r, f) => { const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
        for (let a = cx - 2; a <= cx + 2; a++) for (let b = cz - 2; b <= cz + 2; b++) { const L = cell.get(a + ',' + b); if (L) for (const o of L) if (Math.hypot(o[0] - x, o[1] - z) < (r + o[2]) * f) return true; } return false; };
      const mark = (x, z, r) => { const k = Math.floor(x / CELL) + ',' + Math.floor(z / CELL); let L = cell.get(k); if (!L) cell.set(k, L = []); L.push([x, z, r]); };
      const put = (ci, x, z, sink, deep = 0) => {
        const h = moundAt(hi, x, z) * (1 - deep), e = 0.2, sx = (moundAt(hi, x + e, z) - moundAt(hi, x - e, z)) / (2 * e) * (1 - deep), sz = (moundAt(hi, x, z + e) - moundAt(hi, x, z - e)) / (2 * e) * (1 - deep);
        _hn.set(-sx, 1, -sz).normalize();                                                                      // lying on the slope, turned any way, a little askew
        _hq.setFromUnitVectors(UP, _hn).multiply(_hy.setFromEuler(new THREE.Euler((rng() - 0.5) * 0.5, rng() * Math.PI * 2, (rng() - 0.5) * 0.5, 'YXZ')));
        const y = heightAt(x, z) + h + THICK[ci] * (0.5 - sink) - deep * 0.15;
        list.push([ci, 70000 + hi * 9000 + list.length, +x.toFixed(3), +y.toFixed(3), +z.toFixed(3), +_hq.x.toFixed(4), +_hq.y.toFixed(4), +_hq.z.toFixed(4), +_hq.w.toFixed(4)]);
        meta.push([x, y, z, deep ? 0 : RAD[ci] * 0.9]);   // the buried layer is not to be lifted out from under the rest
      };
      const area = Math.PI * R * R * 1.2, k = lite ? 0.75 : 1;
      // the buried layer: big stones, close, under the skin
      for (let t = 0, N = area / 0.3 * k; t < N; t++) { const r = R * 0.95 * Math.sqrt(rng()), a = rng() * 6.2832; put(0, hx + Math.cos(a) * r, hz + Math.sin(a) * r, 0.3, 0.07); }
      const fill = (ci, tries, f, spill) => { for (let t = 0; t < tries; t++) { const r = R * (spill ? 0.9 + 0.4 * rng() : 1.02 * Math.sqrt(rng())), a = rng() * 6.2832, x = hx + Math.cos(a) * r, z = hz + Math.sin(a) * r;
        if (near(x, z, RAD[ci], f)) continue; mark(x, z, RAD[ci]); put(ci, x, z, spill ? 0.15 : 0.3); } };
      fill(0, area / 0.1 * k, 0.72, false); fill(2, 14 * k, 0.85, false); fill(1, area / 0.04 * k, 0.7, false); fill(3, 10 * k, 0.85, false);
      fill(4, area / 0.02 * k * (lite ? 0.4 : 0.7), 0.9, false); fill(0, 30 * k, 0.9, true); fill(1, 40 * k, 0.9, true);
      const rec = { group: new THREE.Group(), type: 'newengland', list, meta, hi, taken: new Set(store.heapTaken[hi] || []) }; root.add(rec.group); heaps.push(rec);
      // and the core under them, a little smaller, for what you cannot see
      const NR = 16, NA = 72, cp = [], ci = [];                                    // the same lumpy mound as the stones lie on, a hand lower
      for (let k = 0; k <= NR; k++) for (let a = 0; a < NA; a++) { const th = a / NA * 6.2832, r = R * 1.25 * k / NR, x = hx + Math.cos(th) * r, z = hz + Math.sin(th) * r; cp.push(x, heightAt(x, z) + Math.max(-0.05, moundAt(hi, x, z) - 0.2), z); }
      for (let k = 0; k < NR; k++) for (let a = 0; a < NA; a++) { const p = k * NA + a, q = k * NA + (a + 1) % NA; ci.push(p, q, p + NA, q, q + NA, p + NA); }   // wound to face up and out
      const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3)); cg.setIndex(ci); cg.computeVertexNormals();
      { // the core wears the stone's own surface (small rubble and dirt between the stones, not a painted dome), a shade darker
        const sample = stoneAt('newengland', 'hearting', 4242 + hi, 1).geometry.attributes, n = cg.attributes.position.count;
        for (const [k, w, f] of [['aColA', 3, 0.55], ['aColB', 3, 0.55], ['aStone', 4, 1], ['aFresh', 1, 0]]) { const src = sample[k], arr = new Float32Array(n * w);
          for (let i = 0; i < n; i++) for (let c = 0; c < w; c++) arr[i * w + c] = (src ? src.array[c] : 0) * (k === 'aStone' ? 1 : f); cg.setAttribute(k, new THREE.BufferAttribute(arr, w)); } }
      const core = new THREE.Mesh(cg, matOf('newengland', false)); core.castShadow = core.receiveShadow = true; rec.group.add(core);
      queueBuilt(null, rec, 'heap', 'newengland', list); garden.blockRound(hx, hz, R * 0.82);
    });
  }
  /** The heap stone a world ray hits first within maxT: { hi, idx, t } or null. */
  function pickHeap(o, d, maxT) {
    // walk the ray until it meets the heap's skin (the mound, plus the stones lying on it), then take the stone lying nearest there
    let best = null;
    for (const h of heaps) {
      const [hx, hz, R] = HEAPS[h.hi], g = heightAt(hx, hz); let t = 0.3, p = null;
      for (; t < maxT; t += 0.06) { const x = o.x + d.x * t, z = o.z + d.z * t; if ((x - hx) ** 2 + (z - hz) ** 2 > (R * 1.4) ** 2) continue; const y = o.y + d.y * t; if (y < g + moundAt(h.hi, x, z) + 0.12) { p = [x, y, z]; break; } }
      if (!p || (best && best.t < t)) continue;
      let bi = -1, bd = 0.75;
      h.meta.forEach(([x, y, z, r], i) => { if (!r || h.taken.has(i)) return; const q = Math.hypot(x - p[0], (y - p[1]) * 0.7, z - p[2]) - r * 0.5; if (q < bd) { bd = q; bi = i; } });   // the nearest, a big stone before a chip
      if (bi >= 0) best = { hi: h.hi, idx: bi, t };
    }
    return best;
  }
  function hideHeapStone(hi, idx, hide) {
    const h = heaps[hi]; if (hide) h.taken.add(idx); else h.taken.delete(idx); store.heapTaken[hi] = [...h.taken];
    const r = h.ranges && h.ranges[idx], m = h.mesh; if (!r || !m) return;
    const P = m.geometry.attributes.position, a = P.array; if (hide) a.fill(0, r[0] * 3, (r[0] + r[1]) * 3); else a.set(h.orig.subarray(r[0] * 3, (r[0] + r[1]) * 3), r[0] * 3);
    P.needsUpdate = true;
  }
  /** The ground the physics stands on: the land, the brook's channel, and the heaps' mounds (world y). */
  function groundY(x, z) {
    let y = heightAt(x, z);
    for (let hi = 0; hi < HEAPS.length; hi++) { const m = moundAt(hi, x, z); if (m > 0.3) y = Math.max(y, heightAt(x, z) + m - 0.3); }   // under the outer stones, not through them
    if (junk && junk.topAt) y = Math.max(y, junk.topAt(x, z));
    return y;
  }

  // ---------------------------------------------------------------- the stint in hand
  let RAPIER = null, Physics = null, physFail = '';
  let held = null, hover = null, placing = false, placeT = 0, placeY = 0, placeXZ = null, landing = null, ghosted = false, press = false, effort = 0, effortRaw = 0, confirmT = -9, notesAt = 0;
  const target = new THREE.Vector3(), smooth = new THREE.Vector3(), targetQ = new THREE.Quaternion(), undo = [];
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.066, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7ff0ff, transparent: true, opacity: 0.7, depthWrite: false }));
  ring.visible = false; ring.renderOrder = 6;
  // the beam: from your pointing hand to the stone
  const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0x55e8ff, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending }));
  beam.visible = false; beam.frustumCulled = false; scene.add(beam);
  const hand = new THREE.Vector3();                      // where the beam starts, world; main sets it each frame from the body

  async function loadPhysics() {
    if (Physics || physFail) return !!Physics;
    try { const m = await import('./drystack/physics.js'); await m.Physics.init(); Physics = m.Physics; RAPIER = m.RAPIER; return true; }
    catch (e) { physFail = (e && e.message) || 'could not start'; return false; }
  }
  function addStone(cls, seed, x, z, yaw, opts = {}) {
    const src = opts.src || null, jd = src && src.j ? junk && junk.stoneData(src.j) : null; if (src && src.j && !jd) return null;
    const type = jd ? 'junk' : (src && src.t) || A.type;
    const data = jd || stoneAt(type, cls, seed, 0); if (jd) cls = jd.cls;
    if (!RAPIER.ColliderDesc.convexHull(data.hullPoints)) data.hullPoints = Float32Array.from(new THREE.IcosahedronGeometry(Math.max(0.03, (jd && jd.r) || 0.1) * 0.6, 0).attributes.position.array);
    const mesh = new THREE.Mesh(data.geometry, jd ? junk.material : matOf(type, false)); mesh.castShadow = mesh.receiveShadow = true; A.group.add(mesh);
    const q = opts.q || new THREE.Quaternion().setFromEuler(new THREE.Euler(opts.tilt || 0, yaw, opts.roll || 0, 'YXZ'));
    let y = opts.y;
    if (y == null) { let minY = Infinity; const v = new THREE.Vector3(), hp = data.hullPoints; for (let i = 0; i < hp.length; i += 3) { v.set(hp[i], hp[i + 1], hp[i + 2]).applyQuaternion(q); minY = Math.min(minY, v.y); } y = -minY + 0.006 + (opts.lift || 0); }
    const stone = { ...data, mesh, cls, seed, type, src, gi: opts.gi };
    A.physics.addStone(stone, x, y, z, { x: q.x, y: q.y, z: q.z, w: q.w }, jd ? jd.friction : STONE_TYPES[type].friction);
    mesh.userData.stone = stone; mesh.position.set(x, y, z); mesh.quaternion.copy(q); A.stones.push(stone); return stone;
  }
  // the pile: laid out on the field side only, so nothing lands in the borders
  function planPile(s, type) {
    const L = s.L, half = L / 2, rng = mulberry(4242 + s.id * 97), R = (a, b) => a + (b - a) * rng(), n = counts(L, lite), plan = []; let seed = 1000 + s.id * 5000;
    for (let i = 0; i < n.foundation; i++) { const row = i % 2, k = Math.floor(i / 2), per = Math.ceil(n.foundation / 2); plan.push(['foundation', seed++, -half - 0.2 + (k + 0.5) * ((L + 0.4) / per) + R(-0.05, 0.05), 1.0 + row * 0.55 + R(-0.04, 0.08), R(-0.4, 0.4) + (rng() < 0.5 ? 0 : Math.PI / 2), {}]); }
    const cols = Math.max(6, Math.round((L + 1.6) / 0.42)); let placed = 0;
    for (let row = 0; placed < n.builder; row++) for (let c = 0; c < cols && placed < n.builder; c++, placed++) plan.push(['builder', seed++, -half - 0.8 + (c + 0.5) * ((L + 1.6) / cols) + R(-0.05, 0.05), 2.15 + row * 0.38 + R(-0.05, 0.05), rng() * Math.PI * 2, {}]);
    const rows = Math.ceil(n.builder / cols), back = 2.15 + rows * 0.38;
    for (let i = 0; i < n.through; i++) plan.push(['through', seed++, -half + 0.3 + i * 0.36, back + 0.45, Math.PI / 2 + R(-0.1, 0.1), {}]);
    for (let i = 0; i < n.cope; i++) plan.push(['cope', seed++, half - 0.2 - (i % 10) * 0.34, back + 0.4 + Math.floor(i / 10) * 0.5, Math.PI / 2 + R(-0.15, 0.15), {}]);
    const heaps = [[-half * 0.5, back + 1.9], [half * 0.5, back + 1.9]];
    for (let i = 0; i < n.hearting; i++) { const [hx, hz] = heaps[i % 2], r = 0.42 * Math.sqrt(rng()), th = rng() * Math.PI * 2; plan.push(['hearting', seed++, hx + Math.cos(th) * r, hz + Math.sin(th) * r, rng() * 6.28, { lift: (0.42 - r) * 0.55 + rng() * 0.25, tilt: R(-1, 1), roll: R(-1, 1) }]); }
    for (let i = 0; i < n.pinning; i++) plan.push(['pinning', seed++, -half - 0.45 - (i % 4) * 0.13, 1.0 + Math.floor(i / 4) * 0.11, rng() * 6.28, {}]);
    return { plan, seedNext: seed, heaps };
  }
  // the ground under a site, as a heightfield in the site's frame: 60 m across, a sample every 30 cm (the heaps' mounds included)
  function groundFor(group) {
    const SIZE = 60, N = 200, Hf = new Float32Array((N + 1) * (N + 1)), v = new THREE.Vector3(), y0 = group.position.y;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) { v.set(-SIZE / 2 + SIZE * j / N, 0, -SIZE / 2 + SIZE * i / N).applyMatrix4(group.matrixWorld); Hf[j * (N + 1) + i] = groundY(v.x, v.z) - y0; }
    return { Hf, N, SIZE };
  }
  async function start(s, stoneType) {
    if (A && A.s === s) return true;
    if (!(await loadPhysics())) { hint(`the stone-handling physics could not start here (${physFail}); walking still works`, 9000); return false; }
    if (A) pause();
    const saved = s.free ? (s.stones && s.stones.length ? s : null) : store.paused[s.id], type = saved ? saved.type : (stoneType || store.stone);
    const rec = built.get(s.id); if (rec) { rec.dead = true; root.remove(rec.group); rec.group.traverse(o => o.geometry && o.geometry.dispose()); built.delete(s.id); }
    const group = frameOf(s); root.add(group); group.add(ring);
    const physics = new Physics(), gr = groundFor(group); physics.addHeightfield(gr.Hf, gr.N, gr.N, gr.SIZE, gr.SIZE);
    const spec = s.free ? null : new WallSpec({ length: s.L, base: BASE, top: TOP, height: HEIGHT, heightFn: () => 0 });
    const guides = s.free ? null : new Guides(group, spec, {});
    A = { s, group, inv: new THREE.Matrix4().copy(group.matrixWorld).invert(), physics, spec, guides, stones: [], glue: [], type, queue: [], seedNext: 0, notes: null, heaps: s.free ? [[0, -2.6]] : [[0, 4]], t0: performance.now() };
    const restore = list => list.map(([ci, seed, x, y, z, qx, qy, qz, qw, src], gi) => [CLS[ci], seed, x, z, 0, { y, q: new THREE.Quaternion(qx, qy, qz, qw), src, gi }]);
    if (saved) { A.queue = restore(saved.stones); A.seedNext = saved.seedNext || 9e5; if (!s.free) delete store.paused[s.id]; }
    if (saved && s.free) {   // a free build comes back as it was left, at once, so what was glued is glued again before anything can fall
      while (A.queue.length) { const [cls, seed, x, z, yaw, o] = A.queue.shift(); addStone(cls, seed, x, z, yaw, o); }
      const byGi = new Map(A.stones.map(st => [st.gi, st]));
      for (const [i, j, px, py, pz] of saved.glue || []) { const a = byGi.get(i), b = byGi.get(j); if (a && b) joinStones(a, b, { x: px, y: py, z: pz }); }
    }
    else if (s.free) { A.queue = []; A.seedNext = 5e6 + free.seq * 1e5; }
    else { const pl = planPile(s, type); A.queue = pl.plan; A.seedNext = pl.seedNext; A.heaps = pl.heaps; }
    if (s.free) U.uWork.value.set(s.x, s.z, Math.cos(s.yaw), Math.sin(s.yaw)); else U.uWork.value.set(s.x, s.z, Math.cos(s.yaw), Math.sin(s.yaw));
    A.total = Math.max(1, A.queue.length); s.state = 'active'; drawMarkers(); blockFree(); onChange();
    if (s.free) hint(saved ? 'back at your free build · lift from the heaps, the junk, or N for a pile of stone' : 'a free build, here · point at any stone in a heap or the junk and click to lift it · N brings a pile of stone · P puts it away', 7000);
    else hint(`stint ${s.id + 1} of ${stints.length} · ${STONE_TYPES[type].name} · your suit is bringing stone from the heaps`, 6000);
    return true;
  }
  /** B: the stint you stand at, or the free build you stand in, or a new free build where you stand (facing yaw). */
  async function begin(px, pz, yaw) {
    const st = nearest(px, pz); if (st) return start(st);
    let f = null, fd = 1e9; for (const s of freeSites) { const d = Math.hypot(s.x - px, s.z - pz); if (d < fd && d < 9) { fd = d; f = s; } }
    if (!f) {
      if (Math.hypot(px, pz - 12) > 90) { hint('too near the edge of the land to build', 4000); return false; }
      const rec = { id: 'f' + (free.seq++), x: +px.toFixed(2), y: +heightAt(px, pz).toFixed(3), z: +pz.toFixed(2), yaw: +yaw.toFixed(4), type: store.stone, stones: [], seedNext: 0 };
      f = { ...rec, free: true, L: 6, state: 'todo' }; freeSites.push(f);
    }
    return start(f);
  }
  function snapshot(all) {
    const list = [], r3 = v => Math.round(v * 1000) / 1000, r4 = v => Math.round(v * 10000) / 10000;
    for (const st of all) { const t = st.body.translation(), r = st.body.rotation(), e = [CLS.indexOf(st.cls), st.seed, r3(t.x), r3(t.y), r3(t.z), r4(r.x), r4(r.y), r4(r.z), r4(r.w)]; if (st.src) e.push(st.src); list.push(e); }
    return list;
  }
  function dispose() {
    if (!A) return;
    if (held) drop(true);
    for (const st of A.stones) st.geometry.dispose();
    A.group.remove(ring); root.remove(A.group); try { A.physics.world.free(); } catch (e) {}
    A = null; setHover(null); undo.length = 0; ring.visible = beam.visible = false;
  }
  /** Leave the stint as it stands; everything stays where it lies until you come back. */
  function pause() {
    if (!A) return; const s = A.s; if (held) drop(true);
    while (A.queue.length) { const [cls, seed, x, z, yaw, o] = A.queue.shift(); addStone(cls, seed, x, z, yaw, o); }
    const list = snapshot(A.stones), type = A.type;
    if (s.free) { saveFree(s, list); dispose(); if (list.length) { s.state = 'paused'; showBuilt(s, type, list); } else dropFree(s); blockFree(); drawMarkers(); onChange(); return; }
    store.paused[s.id] = { type, stones: list, seedNext: A.seedNext }; persist();
    dispose(); s.state = 'paused'; showBuilt(s, type, list); drawMarkers(); onChange();
  }
  function saveFree(s, list) {
    s.stones = list; s.seedNext = A ? A.seedNext : s.seedNext; let r = free.sites.find(f => f.id === s.id);
    if (A && A.s === s) s.glue = A.glue.map(g => [A.stones.indexOf(g.a), A.stones.indexOf(g.b), ...g.p.map(v => Math.round(v * 1000) / 1000)]).filter(g => g[0] >= 0 && g[1] >= 0);
    if (!r) free.sites.push(r = {}); Object.assign(r, { id: s.id, x: s.x, y: s.y, z: s.z, yaw: s.yaw, type: s.type || A.type, stones: list, seedNext: s.seedNext, glue: s.glue || [] }); persist();
  }
  // ---------------------------------------------------------------- glue (free builds)
  const glueGeo = new THREE.SphereGeometry(1, 12, 8), glueMat = new THREE.MeshBasicMaterial({ color: 0x8dff5a, toneMapped: false });
  function glueBlob(parent, p) { const m = new THREE.Mesh(glueGeo, glueMat); m.scale.set(0.034, 0.026, 0.034); m.position.copy(p); parent.add(m); return m; }
  /** Weld a to b with a fixed joint at P (the site's frame), as they lie now. */
  function joinStones(a, b, P) {
    if (!A || a === b || A.glue.some(g => (g.a === a && g.b === b) || (g.a === b && g.b === a))) return false;
    const ta = a.body.translation(), ra = a.body.rotation(), tb = b.body.translation(), rb = b.body.rotation();
    const qa = new THREE.Quaternion(ra.x, ra.y, ra.z, ra.w), qb = new THREE.Quaternion(rb.x, rb.y, rb.z, rb.w), ia = qa.clone().invert(), ib = qb.clone().invert();
    const la = new THREE.Vector3(P.x - ta.x, P.y - ta.y, P.z - ta.z).applyQuaternion(ia), lb = new THREE.Vector3(P.x - tb.x, P.y - tb.y, P.z - tb.z).applyQuaternion(ib);
    const params = RAPIER.JointData.fixed({ x: la.x, y: la.y, z: la.z }, { x: ia.x, y: ia.y, z: ia.z, w: ia.w }, { x: lb.x, y: lb.y, z: lb.z }, { x: ib.x, y: ib.y, z: ib.z, w: ib.w });
    const joint = A.physics.world.createImpulseJoint(params, a.body, b.body, true);
    A.glue.push({ a, b, joint, blob: glueBlob(a.mesh, la), p: [P.x, P.y, P.z] });
    return true;
  }
  /** The pieces st is pressed against, each with a point where they meet (the site's frame). */
  function touchingStones(st) {
    const w = A.physics.world, out = [];
    w.contactPairsWith(st.collider, other => {
      const o = A.physics.bodies.get(other.handle); if (!o || o === st) return;
      let P = null; w.contactPair(st.collider, other, m => { if (!P && m.numSolverContacts() > 0) { const c = m.solverContactPoint(0); P = { x: c.x, y: c.y, z: c.z }; } });
      if (P) out.push([o, P]);
    });
    return out;
  }
  function unglue(st) {
    let n = 0;
    for (const g of A.glue.slice()) if (g.a === st || g.b === st) { try { A.physics.world.removeImpulseJoint(g.joint, true); } catch (e) {} g.blob.parent && g.blob.parent.remove(g.blob); A.glue.splice(A.glue.indexOf(g), 1); n++; }
    return n;
  }
  /** Everything glued to st, through any chain of seams (st included). */
  function groupOf(st) {
    const seen = new Set([st]), q = [st];
    while (q.length) { const x = q.pop(); for (const g of A.glue) { const o = g.a === x ? g.b : g.b === x ? g.a : null; if (o && !seen.has(o)) { seen.add(o); q.push(o); } } }
    return seen;
  }
  function glueKey(shift) {
    if (!A) return;
    if (!A.s.free) { hint('a dry stone wall takes no glue · glue is for free builds (B away from the wall line)', 4000); return; }
    const st = held || (hover && !hover.ext && A.stones.includes(hover) ? hover : null);
    if (!st) { hint('hold a piece against another, or look at one, and J glues them', 3500); return; }
    if (shift) { const n = unglue(st); if (held === st) for (const x of A.stones) if (x !== st) x.body.setGravityScale(1, true); hint(n ? `unglued from ${n} piece${n === 1 ? '' : 's'}` : 'nothing is glued to it', 2200); onChange(); return; }
    const parts = touchingStones(st);
    if (!parts.length) { hint('press it against another piece first, then J glues them', 3200); return; }
    let n = 0; for (const [o, P] of parts) if (joinStones(st, o, P)) n++;
    if (held === st) drop(true);   // it holds by its glue now
    hint(n ? `glued to ${n} piece${n === 1 ? '' : 's'} · lift any one and the rest come too · Shift+J unglues` : 'already glued there', 3500); onChange();
  }
  function dropFree(s) { free.sites = free.sites.filter(f => f.id !== s.id); const i = freeSites.indexOf(s); if (i >= 0) freeSites.splice(i, 1); persist(); }
  function giveBack(st) {   // a stone taken from a heap goes back to its place there
    if (!st.src) return;
    if (st.src.h) hideHeapStone(st.src.h[0], st.src.h[1], false);
    else if (st.src.j && junk) junk.giveBack(st.src.j);
  }
  /** Fix what stands in the wall; the rest of the pile goes back. */
  function finish() {
    if (!A || A.queue.length) return false; if (held) drop(true);
    if (A.s.free) { const n = A.stones.length; pause(); hint(n ? `kept: ${n} stone${n === 1 ? '' : 's'} as you set them · B here to carry on` : 'nothing set here, so nothing kept', 6000); return true; }
    const s = A.s, res = read(), inWall = res.stones.map(i => i.s);
    if (inWall.length < 8) { hint('nothing much stands in the wall yet · Backspace on a held stone undoes, P puts the stint away for later', 6000); return false; }
    for (const st of A.stones) if (!inWall.includes(st)) giveBack(st);
    const list = snapshot(inWall), type = A.type; store.done[s.id] = { type, stones: list, height: Math.round(res.height * 100) / 100, t: Date.now() }; delete store.paused[s.id]; persist();
    dispose(); s.state = 'done'; showBuilt(s, type, list); drawMarkers(); onChange();
    const n = stints.filter(x => x.state === 'done').length;
    hint(`stint finished: ${n} of ${stints.length} standing, ${Math.round(stints.filter(x => x.state === 'done').reduce((a, x) => a + x.L, 0))} m of wall`, 8000);
    return true;
  }
  function read() { return A.spec ? analyseWall({ spec: A.spec, stones: A.stones, physics: A.physics, interaction: { held } }) : null; }

  // ---------------------------------------------------------------- pointing, lifting, turning, setting
  const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _v = new THREE.Vector3(), _n = new THREE.Vector3();
  function ray() { camera.getWorldPosition(_o); camera.getWorldDirection(_d); _o.applyMatrix4(A.inv); _d.transformDirection(A.inv); return { o: _o, d: _d }; }
  function cast(exclude) {
    const { o, d } = ray(), w = A.physics.world;
    const hit = w.castRayAndGetNormal(new RAPIER.Ray(o, d), REACH, true, undefined, undefined, undefined, exclude || undefined);
    if (hit) { const col = hit.collider; return { point: new THREE.Vector3(o.x + d.x * hit.timeOfImpact, o.y + d.y * hit.timeOfImpact, o.z + d.z * hit.timeOfImpact), stone: A.physics.bodies.get(col.handle) || null }; }
    if (d.y < -0.02) { const t = Math.min(REACH, -o.y / d.y); return { point: new THREE.Vector3(o.x + d.x * t, Math.max(0, o.y + d.y * t), o.z + d.z * t), stone: null }; }
    return { point: new THREE.Vector3(o.x + d.x * 3, Math.max(0.2, o.y + d.y * 3), o.z + d.z * 3), stone: null, air: true };
  }
  function look(st, hot) { st.mesh.material = st.type === 'junk' ? (hot ? junkHot : junk.material) : hot ? hotMat(st.type || A.type) : matOf(st.type || A.type, false); }
  // ---------------------------------------------------------------- stone in the heaps and the junk: pointed at, lifted out
  const ghost = new THREE.Mesh(new THREE.BufferGeometry(), junkHot); ghost.visible = false; ghost.renderOrder = 4; scene.add(ghost);
  const keyOf = h => h ? (h.ext === 'heap' ? 'h' + h.hi + ':' + h.idx : h.ext === 'junk' ? 'j' + h.id : h) : null;
  function showGhost(h) {
    ghost.geometry.dispose(); ghost.visible = false; if (!h) return;
    if (h.ext === 'heap') { const e = heaps[h.hi].list[h.idx]; ghost.geometry = stoneAt('newengland', CLS[e[0]], e[1], DETAIL.heap[CLS[e[0]]] || 1).geometry; ghost.material = hotMat('newengland'); ghost.position.set(e[2], e[3], e[4]); ghost.quaternion.set(e[5], e[6], e[7], e[8]); }
    else { const d = junk && junk.stoneData(h.id), e = junk && junk.where(h.id); if (!d || !e) { ghost.geometry = new THREE.BufferGeometry(); return; } ghost.geometry = d.geometry; ghost.material = junkHot; ghost.position.set(e[1], e[2], e[3]); ghost.quaternion.set(e[4], e[5], e[6], e[7]); }
    ghost.scale.setScalar(1.02); ghost.visible = true;
  }
  function setHover(h) {
    if (keyOf(h) === keyOf(hover) && (!h || !h.ext || hover)) { if (h && h.ext) hover = h; return; }
    if (hover && !hover.ext && A && A.stones.includes(hover)) look(hover, false);
    if (hover && hover.ext) showGhost(null);
    hover = h;
    if (hover && !hover.ext) look(hover, true); else if (hover) showGhost(hover);
  }
  const _wo = new THREE.Vector3(), _wd = new THREE.Vector3();
  function pickExt(maxT) {   // the nearest heap or junk stone along your line of sight
    camera.getWorldPosition(_wo); camera.getWorldDirection(_wd);
    const a = pickHeap(_wo, _wd, maxT), b = junk ? junk.pick(_wo, _wd, a ? a.t : maxT) : null;
    return b ? { ext: 'junk', id: b.id, t: b.t } : a ? { ext: 'heap', hi: a.hi, idx: a.idx, t: a.t } : null;
  }
  function pluck(x) {
    let pos, q, src, cls = 'builder', seed = 0;
    if (x.ext === 'heap') { const e = heaps[x.hi].list[x.idx]; if (heaps[x.hi].taken.has(x.idx)) return null; pos = new THREE.Vector3(e[2], e[3], e[4]); q = new THREE.Quaternion(e[5], e[6], e[7], e[8]); src = { t: 'newengland', h: [x.hi, x.idx] }; cls = CLS[e[0]]; seed = e[1]; hideHeapStone(x.hi, x.idx, true); persist(); }
    else { const w = junk && junk.take(x.id); if (!w) return null; pos = w.pos; q = w.q; src = { j: x.id }; }
    pos.applyMatrix4(A.inv); const ql = A.group.quaternion.clone().invert().multiply(q);
    const st = addStone(cls, seed, pos.x, pos.z, 0, { y: pos.y + 0.04, q: ql, src });
    if (!st) giveBack({ src });
    return st;
  }
  let idleOn = false, idleHover = null;
  /** Clicked a heap or junk stone with nothing open: open a site here (the stint you stand at, the free build you stand in, or a new one) and lift it. */
  async function pluckIdle(px, pz, yaw) {
    const x = idleHover; if (!x || A) return false;
    idleHover = null; showGhost(null);
    if (!(await begin(px, pz, yaw)) || !A) return true;
    const st = pluck(x); if (st) { setHover(null); pick(st); }
    return true;
  }
  function pick(st) {
    undo.push(snapshot(A.stones)); if (undo.length > 20) undo.shift();
    held = st; placing = false; effort = 0; ghosted = false; press = false;
    const b = st.body; b.setGravityScale(0, true); b.wakeUp();
    for (const x of groupOf(st)) { x.body.setGravityScale(0, true); x.body.wakeUp(); }   // glued to it: they come too
    const r = b.rotation(), t = b.translation(); targetQ.set(r.x, r.y, r.z, r.w); smooth.set(t.x, t.y + 0.06, t.z); target.copy(smooth); landing = null;
    look(st, true); ring.visible = true; onChange();
  }
  function drop(force) {
    const st = held; if (!st) return;
    if (!force && !placing) { const t = st.body.translation(); placing = true; placeT = 0; placeXZ = { x: t.x, z: t.z }; placeY = t.y; return; }
    placing = false; const b = st.body; b.setGravityScale(1, true); b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    if (A) for (const x of groupOf(st)) { x.body.setGravityScale(1, true); x.body.setLinvel({ x: 0, y: 0, z: 0 }, true); x.body.setAngvel({ x: 0, y: 0, z: 0 }, true); }
    if (ghosted) { st.collider.setCollisionGroups(0xffffffff); ghosted = false; }
    look(st, false); held = null; ring.visible = false; notesAt = 0; onChange();
  }
  function rotateWorld(axis, ang) { targetQ.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, ang)).normalize(); onTurn(Math.sign(ang) * Math.min(1, Math.abs(ang) / 0.5 + 0.3)); }
  // the stone's long axis laid across the wall: length into the wall, as wallers set them
  function turnIn() {
    const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(targetQ); ax.y = 0; if (ax.lengthSq() < 1e-4) return; ax.normalize();
    rotateWorld(UP, Math.atan2(ax.x, ax.z) - (ax.z < 0 ? Math.PI : 0));
  }
  // on edge, thin axis along the wall: a cope
  function onEdge() { targetQ.setFromEuler(new THREE.Euler(0, 0, Math.PI / 2, 'YXZ')); rotateWorld(UP, 0); }
  function pour() {
    if (!A) return; const hit = cast(held ? held.body : null); if (!hit || hit.air) return;
    const loose = A.stones.filter(s => s.cls === 'hearting' && s !== held && (Math.abs(s.body.translation().z) > 1.2 || Math.abs(s.body.translation().x) > A.s.L / 2 + 0.3)).slice(0, 7);
    if (!loose.length) { hint('the hearting heap is empty', 3000); return; }
    undo.push(snapshot(A.stones)); if (undo.length > 20) undo.shift();
    loose.forEach((s, i) => { s.body.setTranslation({ x: hit.point.x + (Math.random() - 0.5) * 0.12, y: hit.point.y + 0.2 + i * 0.06, z: hit.point.z + (Math.random() - 0.5) * 0.08 }, true); s.body.setLinvel({ x: 0, y: -0.2, z: 0 }, true); });
  }
  function undoLast() {
    const snap = undo.pop(); if (!snap || !A) return; if (held) drop(true);
    snap.forEach((r, i) => { const st = A.stones[i]; if (!st) return; st.body.setTranslation({ x: r[2], y: r[3], z: r[4] }, true); st.body.setRotation({ x: r[5], y: r[6], z: r[7], w: r[8] }, true); st.body.setLinvel({ x: 0, y: 0, z: 0 }, true); st.body.setAngvel({ x: 0, y: 0, z: 0 }, true); });
    hint('taken back', 1500);
  }
  function steer(h) {
    const st = held; if (!st) return; const b = st.body, t = b.translation(), m = st.mass;
    const vmax = placing ? 0.25 : clamp(4.6 * Math.pow(20 / m, 0.9), 0.35, 4.6);
    let vx = (smooth.x - t.x) * 12, vy = (smooth.y - t.y) * 12, vz = (smooth.z - t.z) * 12; const sp = Math.hypot(vx, vy, vz);
    if (sp > vmax) { vx *= vmax / sp; vy *= vmax / sp; vz *= vmax / sp; }
    const c0 = b.linvel(), cs = Math.hypot(c0.x, c0.y, c0.z), lim = vmax * 1.25 + 0.2, k = cs > lim ? lim / cs : 1, cx = c0.x * k, cy = c0.y * k, cz = c0.z * k;
    let ax = vx - cx, ay = vy - cy, az = vz - cz; const need = Math.hypot(ax, ay, az) / h * m;
    if (need > STRENGTH) { const f = STRENGTH / need; ax *= f; ay *= f; az *= f; }
    effortRaw = Math.min(1, need / STRENGTH); b.setLinvel({ x: cx + ax, y: cy + ay, z: cz + az }, true);
    const r = b.rotation(), err = targetQ.clone().multiply(new THREE.Quaternion(r.x, r.y, r.z, r.w).invert()); if (err.w < 0) { err.x *= -1; err.y *= -1; err.z *= -1; err.w *= -1; }
    const ang = 2 * Math.acos(Math.min(1, err.w)), sn = Math.sqrt(1 - err.w * err.w); let wx = 0, wy = 0, wz = 0;
    if (sn > 1e-4) { const w = Math.min(ang * 10, clamp(5 * Math.pow(20 / m, 0.5), 1.2, 5)); wx = err.x / sn * w; wy = err.y / sn * w; wz = err.z / sn * w; }
    b.setAngvel({ x: wx, y: wy, z: wz }, true);
  }
  function carry(dt) {
    const st = held, w = A.physics.world;
    if (placing) {
      placeT += dt; const touch = A.physics.touching(st), v = st.body.linvel(), still = Math.hypot(v.x, v.y, v.z) < 0.08;
      placeY -= clamp(0.22 / Math.sqrt(Math.max(1, st.mass / 10)), 0.07, 0.22) * dt; if (landing) placeY = Math.max(placeY, landing.y - 0.012);
      target.set(placeXZ.x, placeY, placeXZ.z); smooth.copy(target);
      if (((touch.ground || touch.stones.length) && placeT > 0.1 && (still || placeT > 0.5)) || placeT > 2.2) drop(true);
      return;
    }
    const hit = cast(st.body);
    if (hit) {
      const start = { x: hit.point.x, y: hit.point.y + 1.6, z: hit.point.z }, rot = { x: targetQ.x, y: targetQ.y, z: targetQ.z, w: targetQ.w };
      const sc = hit.air ? null : w.castShape(start, rot, { x: 0, y: -1, z: 0 }, st.collider.shape, 0, 3.5, true, undefined, undefined, st.collider, st.body);
      let y = hit.point.y + 0.15;
      if (sc && sc.time_of_impact > 0.02) y = start.y - sc.time_of_impact; else if (sc && landing) y = landing.y;
      y = Math.min(y, hit.point.y + 0.9); landing = new THREE.Vector3(hit.point.x, y, hit.point.z);
      target.set(hit.point.x, y + (press ? -0.03 : 0.035), hit.point.z); ring.position.set(hit.point.x, hit.point.y + 0.004, hit.point.z); ring.visible = !hit.air;
    }
    effort += (effortRaw - effort) * (1 - Math.exp(-dt * 6));
    smooth.lerp(target, 1 - Math.exp(-dt * (14 / Math.pow(Math.max(1, st.mass / 8), 0.6))));
  }

  // ---------------------------------------------------------------- each frame
  function nearest(px, pz, states = ['todo', 'paused']) {
    let best = null, bd = 1e9; for (const s of stints) { if (!states.includes(s.state)) continue; const d = Math.hypot(s.x - px, s.z - pz); if (d < bd) { bd = d; best = s; } }
    return best && bd < 5.5 ? best : null;
  }
  const _w = new THREE.Vector3();
  function update(dt, t, px, pz) {
    // built stints: a few milliseconds of geometry each frame; nearer ones get their finer mesh
    if (jobs.length) { if (jobs[0].step()) jobs.shift(); }
    U.uWorkOn.value += ((A ? 1 : 0) - U.uWorkOn.value) * Math.min(1, dt * 1.5);
    for (const h of heaps) if (h.heap && !h.heap.visible) h.heap.visible = true;
    for (const [id, rec] of built) {
      const s = rec.s, d = Math.hypot(s.x - px, s.z - pz), near = d < NEAR;
      if (near && !rec.near && !rec.wantNear) { rec.wantNear = true; queueBuilt(s, rec, 'near', rec.type, rec.list); }
      if (rec.near) { rec.near.visible = near; if (rec.far) rec.far.visible = !near; } else if (rec.far) rec.far.visible = true;
    }
    if (!A) {
      const h = idleOn ? pickExt(REACH) : null;
      if (keyOf(h) !== keyOf(idleHover)) { idleHover = h; showGhost(h); onChange(); } else if (h) idleHover = h;
      return;
    }
    // delivery: a few stones a frame until the pile is all there
    if (A.queue.length) { const t0 = performance.now(); while (A.queue.length && performance.now() - t0 < 7) { const [cls, seed, x, z, yaw, o] = A.queue.shift(); addStone(cls, seed, x, z, yaw, o); } if (!A.queue.length) { onChange(); hint('the pile is here · point at a stone and click to lift it', 6000); } }
    A.physics.step(dt, h => steer(h));
    for (const st of A.stones) { if (st !== held && st.body.isSleeping()) continue; const p = st.body.translation(), r = st.body.rotation(); st.mesh.position.set(p.x, p.y, p.z); st.mesh.quaternion.set(r.x, r.y, r.z, r.w); if (p.y < -3) { st.body.setTranslation({ x: 0, y: 0.5, z: 3 }, true); st.body.setLinvel({ x: 0, y: 0, z: 0 }, true); } }
    if (held) carry(dt);
    else {
      const hit = cast(null), { o } = ray(), dist = hit && !hit.air ? hit.point.distanceTo(o) : REACH, x = pickExt(Math.min(REACH, dist));
      setHover(x || (hit && hit.stone ? hit.stone : null));
    }
    // the beam from your hand to what you hold or point at
    const tgt = held || (hover && !hover.ext ? hover : null);
    if (hover && hover.ext && !held) { _w.copy(ghost.position); beam.visible = true; beam.position.copy(hand); beam.lookAt(_w); beam.scale.set(0.006, 0.006, hand.distanceTo(_w)); beam.material.opacity = 0.14; }
    else if (tgt) { _w.copy(tgt.mesh.position).applyMatrix4(A.group.matrixWorld); beam.visible = true; beam.position.copy(hand); beam.lookAt(_w); const L = hand.distanceTo(_w), r = held ? 0.012 + 0.01 * effort : 0.006; beam.scale.set(r, r, L); beam.material.opacity = held ? 0.3 + 0.35 * effort : 0.14; }
    else beam.visible = false;
    if (t - notesAt > 1.2 && !A.queue.length) { notesAt = t; A.notes = read(); onChange(); }
    if (Math.hypot(A.s.x - px, A.s.z - pz) > 40) { hint('you have walked away from your stint · it is put by until you come back', 6000); pause(); }
  }
  /** Where the suit is reaching, world space (the stone held or pointed at), or null. */
  function aim(out) { if (!A) return null; if (!held && hover && hover.ext) return out.copy(ghost.position); const tgt = held || hover; if (!tgt) return null; return out.copy(tgt.mesh.position).applyMatrix4(A.group.matrixWorld); }
  function hoverInfo(h) { if (h.ext === 'heap') { const e = heaps[h.hi].list[h.idx]; return { cls: CLS[e[0]], kg: null, heap: true }; } if (h.ext === 'junk') { const d = junk.stoneData(h.id); return d ? { cls: d.cls, kg: d.massKg, name: d.name, junk: h.id } : null; } return { cls: h.cls, kg: h.mass, name: h.name || null }; }

  // ---------------------------------------------------------------- input (main.js hands these on while the pointer is locked)
  function onDown(button) {
    if (!A || A.queue.length) return false;
    if (held) { if (button === 0) drop(false); return true; }
    if (button === 0 && hover && hover.ext) { const h = hover; setHover(null); const st = pluck(h); if (st) pick(st); return true; }
    if (button === 0 && hover) { const h = hover; hover = null; pick(h); return true; }
    return false;
  }
  function onWheel(dy, shift) { if (!held) return false; rotateWorld(UP, (dy > 0 ? 1 : -1) * (shift ? Math.PI / 60 : Math.PI / 12)); return true; }
  function onKey(code, down, shift) {
    if (!A) return false;
    if (code === 'Space') { press = down && !!held; return !!held; }
    if (code === 'KeyG') { if (held && down !== ghosted) { ghosted = down; held.collider.setCollisionGroups(down ? 0 : 0xffffffff); } return !!held; }
    if (!down) return false;
    if (code === 'KeyJ') { glueKey(shift); return true; }
    const fine = shift ? Math.PI / 12 : Math.PI / 2;
    camera.getWorldDirection(_v).transformDirection(A.inv); _v.y = 0; _v.normalize(); _n.crossVectors(_v, UP).normalize();
    switch (code) {
      case 'KeyQ': if (held) rotateWorld(UP, shift ? Math.PI / 60 : Math.PI / 12); return !!held;
      case 'KeyE': if (held) rotateWorld(UP, -(shift ? Math.PI / 60 : Math.PI / 12)); return !!held;
      case 'KeyR': if (held) rotateWorld(_n, -fine); return !!held;
      case 'KeyV': if (held) rotateWorld(_v, fine); return !!held;
      case 'KeyT': if (held) turnIn(); return !!held;
      case 'KeyC': if (held) onEdge(); return !!held;
      case 'KeyH': pour(); return true;
      case 'Backspace': undoLast(); return true;
      case 'KeyP': pause(); return true;
      case 'KeyM': moreStone(); return true;
      case 'Enter': if (performance.now() - confirmT < 4000) { confirmT = -9; finish(); } else { confirmT = performance.now(); hint('Enter again to finish this stint: what stands in the wall is fixed, the rest of the pile goes back', 4000); } return true;
    }
    return false;
  }
  function moreStone() {
    if (!A || A.queue.length) return; const s = A.s, rng = mulberry(A.seedNext), half = s.L / 2;
    if (s.free) {   // in front of where the site was begun: builders in a row, a few big ones, a heap of hearting
      for (let i = 0; i < 12; i++) A.queue.push(['builder', A.seedNext++, -2 + (i % 6) * 0.68 + (rng() - 0.5) * 0.08, -2.0 - Math.floor(i / 6) * 0.42, rng() * 6.28, {}]);
      for (let i = 0; i < 4; i++) A.queue.push(['foundation', A.seedNext++, -1.6 + i * 1.05, -3.2, rng() * 6.28, {}]);
      for (let i = 0; i < 2; i++) A.queue.push(['through', A.seedNext++, -0.4 + i * 0.4, -4.0, Math.PI / 2, {}]);
      for (let i = 0; i < 30; i++) A.queue.push(['hearting', A.seedNext++, 2.7 + (rng() - 0.5) * 0.6, -2.4 + (rng() - 0.5) * 0.6, rng() * 6.28, { lift: 0.3 + i * 0.04 }]);
      A.total = A.queue.length; hint('stone on its way', 3000); return;
    }
    for (let i = 0; i < 14; i++) A.queue.push(['builder', A.seedNext++, -half + rng() * s.L, 1.2 + rng() * 0.7, rng() * 6.28, { lift: 0.4 + i * 0.12 }]);
    for (let i = 0; i < 20; i++) A.queue.push(['hearting', A.seedNext++, A.heaps[i % A.heaps.length][0] + (rng() - 0.5) * 0.5, A.heaps[i % A.heaps.length][1] + (rng() - 0.5) * 0.5, rng() * 6.28, { lift: 0.3 + i * 0.05 }]);
    hint('more stone on its way', 3000);
  }

  // ---------------------------------------------------------------- what the forearm console says
  function status() {
    const done = stints.filter(s => s.state === 'done'), o = { stints: stints.length, done: done.length, metres: done.reduce((a, s) => a + s.L, 0), active: null, physFail };
    if (A) {
      const n = A.notes;
      o.active = { id: A.s.id, free: !!A.s.free, count: A.stones.length, stone: STONE_TYPES[A.type].name, delivering: A.queue.length ? 1 - A.queue.length / Math.max(1, A.total) : 1,
        held: held ? { cls: held.cls, kg: held.mass, effort, ghost: ghosted, placing, name: held.name || null } : null, hover: hover ? hoverInfo(hover) : null,
        notes: n ? { footings: Math.min(n.footings.covA, n.footings.covB), height: n.height, min: n.minHeight || 0, target: HEIGHT, face: n.faceStones, traced: n.traced, proud: n.proud, running: n.running, throughs: n.throughs, copes: n.copeCov, hearting: n.heartingFill, settled: n.settled } : null };
    }
    return o;
  }
  function sourcesIn(list) { return (list || []).filter(e => e[9]).map(e => ({ src: e[9] })); }
  function resetFree() {
    if (A && A.s.free) dispose();
    for (const f of freeSites) { for (const st of sourcesIn(f.stones)) giveBack(st); const rec = built.get(f.id); if (rec) { rec.dead = true; root.remove(rec.group); rec.group.traverse(o => o.geometry && o.geometry.dispose()); built.delete(f.id); } }
    freeSites.length = 0; free.sites = []; persist(); blockFree(); onChange();
  }
  function reset() { if (A && !A.s.free) dispose(); for (const d of Object.values(store.done).concat(Object.values(store.paused))) for (const st of sourcesIn(d.stones)) giveBack(st);
    for (const [id, rec] of [...built]) if (typeof id === 'string') continue; else { rec.dead = true; root.remove(rec.group); rec.group.traverse(o => o.geometry && o.geometry.dispose()); built.delete(id); }
    store.done = {}; store.paused = {}; persist(); for (const s of stints) s.state = 'todo'; drawMarkers(); onChange(); }
  addEventListener('pagehide', () => { if (A) { const s = A.s; while (A.queue.length) { const [cls, seed, x, z, yaw, o] = A.queue.shift(); addStone(cls, seed, x, z, yaw, o); }
    if (s.free) saveFree(s, snapshot(A.stones)); else { store.paused[s.id] = { type: A.type, stones: snapshot(A.stones), seedNext: A.seedNext }; persist(); } } });
  if (junk) junk.usedElsewhere = () => { const out = new Set(), add = list => { for (const e of list || []) if (e[9] && e[9].j) out.add(e[9].j); };
    for (const d of Object.values(store.done).concat(Object.values(store.paused), freeSites)) add(d.stones); if (A) for (const st of A.stones) if (st.src && st.src.j) out.add(st.src.j); return out; };

  return { stints, start, begin, pause, finish, update, nearest, aim, hand, onDown, onWheel, onKey, status, reset, resetFree, moreStone, pluckIdle, groundY, heaps,
    set idle(v) { idleOn = !!v; if (!idleOn && idleHover) { idleHover = null; showGhost(null); } }, get idleHover() { return idleHover ? hoverInfo(idleHover) : null; },
    get freeCount() { return freeSites.filter(f => f.stones && f.stones.length).length; },
    get _a() { return A; },   // for tests
    _t: { pickExt, pluck, touching: st => touchingStones(st), join: (a, b, P) => joinStones(a, b, P), groupOf: st => groupOf(st), get glue() { return A ? A.glue : []; }, pick: st => pick(st), drop: () => drop(true), heaps, pickHeap, flush() { while (jobs.length) { const j = jobs[0]; while (!j.step()); jobs.shift(); } for (const h of heaps) if (h.heap) h.heap.visible = true; } },
    get active() { return A ? A.s : null; }, get holding() { return !!held; }, get busy() { return !!A; },
    /** What the hands should be doing: for the body's gestures. */
    get gesture() { return { held: !!held, effort, hover: !!hover, press: press && !!held, placing, ghost: ghosted, kg: held ? held.mass : 0 }; },
    get stone() { return store.stone; }, set stone(k) { if (STONE_TYPES[k]) { store.stone = k; persist(); } }, types: Object.keys(STONE_TYPES).filter(k => !STONE_TYPES[k].unit).map(k => ({ value: k, label: STONE_TYPES[k].name })) };
}
