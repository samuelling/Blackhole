// walling.js: the long task. A dry stone wall round the garden, built a stint at a time with Dry Stack's stones and physics.
//
// The wall's line is where the brick wall stood: 92 stints of about three metres. Walk up to one and start it: your suit
// delivers a pile of stone beside it, sets up batter frames and string lines, and from then on lifts what you point at.
// A stone you are moving is still a real body (Rapier): it pushes and is pushed, lags when heavy, and settles where it is set.
// Finish a stint and its stones are fixed in place and remembered; come back any time for the next.
//
// Everything about one stint happens in its own frame (x along the wall, z out into the field, y up), so Dry Stack's wall
// spec, guides and wall-reading work unchanged; the stint's group carries that frame to its place on the perimeter.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STONE_TYPES, SIZE_CLASSES, generateStone, makeStoneMaterial, hooks, perf } from './drystack/stones.js';
import { WallSpec, Guides } from './drystack/wall.js';
import { analyseWall } from './drystack/analysis.js';

export const LINE = { x: 27.25, z0: -31.25, z1: 55.25, gate: 2.4 };          // the wall's centre line, and half the gap left for the gate
const BASE = 0.72, TOP = 0.42, HEIGHT = 1.1;
const CLS = ['foundation', 'builder', 'through', 'cope', 'hearting', 'pinning'];
const STRENGTH = 520, REACH = 7.5;                                           // newtons the suit can put into a stone; how far it reaches
const KEY = 'gd.wall.v1';
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

export function createWalling({ scene, camera, U, patchFrag, garden, lite = false, hint = () => {}, onChange = () => {} }) {
  perf.lite = !!lite;
  // the stone shader takes the garden's light, weather and voids (see makePatcher.fragOnly)
  hooks.post = (sh, mat) => {
    let f = sh.fragmentShader;
    f = f.replace('uniform float uTime;', '').replace(/\bvnoise\b/g, 'dsVnoise').replace('varying vec3 vWPos; varying vec3 vWNormal;', 'varying vec3 vWNormal;');
    // a stone the suit has hold of, or that you are pointing at, is rimmed with the beam's light
    f = f.replace('totalEmissiveRadiance += vec3(1.0, 0.8, 0.4) * uHighlight * 0.04;', 'totalEmissiveRadiance += vec3(0.2, 0.85, 1.0) * uHighlight * (0.03 + 0.4 * pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.0));');
    sh.fragmentShader = f; patchFrag(sh);
    if (mat.userData.merged) sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aObj;').replace('vObjPos = position;', 'vObjPos = aObj;');
  };
  const stints = makeStints();
  U.uWork = { value: new THREE.Vector4(0, 0, 1, 0) }; U.uWorkOn = { value: 0 };   // the trodden yard beside the stint in hand (field.js)
  let store = { stone: 'newengland', done: {}, paused: {} };
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.done) store = Object.assign(store, s); } catch (e) {}
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { hint('this browser would not save the wall (storage full or blocked)', 6000); } };
  for (const s of stints) s.state = store.done[s.id] ? 'done' : store.paused[s.id] ? 'paused' : 'todo';

  const root = new THREE.Group(); root.name = 'walling'; scene.add(root);
  const mats = {}, matOf = (type, merged) => mats[type + (merged ? 'm' : '')] || (mats[type + (merged ? 'm' : '')] = makeStoneMaterial(type, merged));
  const glowMat = {};                                   // a stone you are pointing at or holding: its own material instance, lit up
  const hotMat = type => { if (!glowMat[type]) { const m = makeStoneMaterial(type); m.userData.uniforms.uHighlight.value = 1; glowMat[type] = m; } return glowMat[type]; };

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
  function frameOf(s) { const g = new THREE.Group(); g.position.set(s.x, 0, s.z); g.rotation.y = s.yaw; g.updateMatrixWorld(true); return g; }
  function queueBuilt(s, rec, level, type, list) {
    const parts = [], q = new THREE.Quaternion(), m = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(); let i = 0;
    jobs.push({ s, level, step() {
      if (rec.dead) { parts.forEach(g => g.dispose()); return true; }
      const t0 = performance.now();
      while (i < list.length && performance.now() - t0 < 5) {
        const [ci, seed, x, y, z, qx, qy, qz, qw] = list[i++], cls = CLS[ci], d = DETAIL[level][cls]; if (!d) continue;
        const st = stoneAt(type, cls, seed, d), g = st.geometry; g.setAttribute('aObj', g.attributes.position.clone());
        g.applyMatrix4(m.compose(p.set(x, y, z), q.set(qx, qy, qz, qw), one)); parts.push(g);
      }
      if (i < list.length) return false;
      if (parts.length) {
        const geo = mergeGeometries(parts, false); parts.forEach(g => g.dispose()); geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, matOf(type, true)); mesh.castShadow = mesh.receiveShadow = true; mesh.visible = false; rec.group.add(mesh); rec[level] = mesh;
      }
      return true;
    } });
  }
  function showBuilt(s, type, list) {
    let rec = built.get(s.id); if (rec) { rec.dead = true; root.remove(rec.group); rec.group.traverse(o => o.geometry && o.geometry.dispose()); }
    rec = { group: frameOf(s), far: null, near: null, type, list, wantNear: false }; root.add(rec.group); built.set(s.id, rec);
    queueBuilt(s, rec, 'far', type, list);
    for (let d = -s.L / 2; d <= s.L / 2 + 0.01; d += 0.25) garden.block(s.x + Math.cos(s.yaw) * d, s.z - Math.sin(s.yaw) * d, 0.42);   // a wall you built is a wall you walk round
  }
  for (const s of stints) { const d = store.done[s.id] || store.paused[s.id]; if (d) showBuilt(s, d.type, d.stones); }

  // ---------------------------------------------------------------- the stint in hand
  let RAPIER = null, Physics = null, physFail = '';
  let A = null;                                          // active: { s, group, inv, physics, spec, guides, stones[], type, seedNext, queue[], notes }
  let held = null, hover = null, placing = false, placeT = 0, placeY = 0, placeXZ = null, landing = null, ghost = false, press = false, effort = 0, effortRaw = 0, confirmT = -9, notesAt = 0;
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
    const data = stoneAt(A.type, cls, seed, 0), mesh = new THREE.Mesh(data.geometry, matOf(A.type, false)); mesh.castShadow = mesh.receiveShadow = true; A.group.add(mesh);
    const q = opts.q || new THREE.Quaternion().setFromEuler(new THREE.Euler(opts.tilt || 0, yaw, opts.roll || 0, 'YXZ'));
    let y = opts.y;
    if (y == null) { let minY = Infinity; const v = new THREE.Vector3(), hp = data.hullPoints; for (let i = 0; i < hp.length; i += 3) { v.set(hp[i], hp[i + 1], hp[i + 2]).applyQuaternion(q); minY = Math.min(minY, v.y); } y = -minY + 0.006 + (opts.lift || 0); }
    const stone = { ...data, mesh, cls, seed };
    A.physics.addStone(stone, x, y, z, { x: q.x, y: q.y, z: q.z, w: q.w }, STONE_TYPES[A.type].friction);
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
  async function start(s, stoneType) {
    if (A && A.s === s) return true;
    if (!(await loadPhysics())) { hint(`the stone-handling physics could not start here (${physFail}); walking still works`, 9000); return false; }
    if (A) pause();
    const saved = store.paused[s.id], type = saved ? saved.type : (stoneType || store.stone);
    const rec = built.get(s.id); if (rec) { rec.dead = true; root.remove(rec.group); rec.group.traverse(o => o.geometry && o.geometry.dispose()); built.delete(s.id); }
    const group = frameOf(s); root.add(group); group.add(ring);
    const physics = new Physics(); physics.addBox(60, 0.5, 60, 0, -0.5, 0, 0.9);
    const spec = new WallSpec({ length: s.L, base: BASE, top: TOP, height: HEIGHT, heightFn: () => 0 });
    const guides = new Guides(group, spec, {});
    A = { s, group, inv: new THREE.Matrix4().copy(group.matrixWorld).invert(), physics, spec, guides, stones: [], type, queue: [], seedNext: 0, notes: null, heaps: [[0, 4]], t0: performance.now() };
    if (saved) { A.queue = saved.stones.map(([ci, seed, x, y, z, qx, qy, qz, qw]) => [CLS[ci], seed, x, z, 0, { y, q: new THREE.Quaternion(qx, qy, qz, qw) }]); A.seedNext = saved.seedNext || 9e5; delete store.paused[s.id]; }
    else { const pl = planPile(s, type); A.queue = pl.plan; A.seedNext = pl.seedNext; A.heaps = pl.heaps; }
    U.uWork.value.set(s.x, s.z, Math.cos(s.yaw), Math.sin(s.yaw));
    A.total = A.queue.length; s.state = 'active'; drawMarkers(); onChange();
    hint(`stint ${s.id + 1} of ${stints.length} · ${STONE_TYPES[type].name} · your suit is bringing the stone`, 6000);
    return true;
  }
  function snapshot(all) {
    const list = [], r3 = v => Math.round(v * 1000) / 1000, r4 = v => Math.round(v * 10000) / 10000;
    for (const st of all) { const t = st.body.translation(), r = st.body.rotation(); list.push([CLS.indexOf(st.cls), st.seed, r3(t.x), r3(t.y), r3(t.z), r4(r.x), r4(r.y), r4(r.z), r4(r.w)]); }
    return list;
  }
  function dispose() {
    if (!A) return;
    if (held) drop(true);
    for (const st of A.stones) st.geometry.dispose();
    A.group.remove(ring); root.remove(A.group); try { A.physics.world.free(); } catch (e) {}
    A = null; hover = null; undo.length = 0; ring.visible = beam.visible = false;
  }
  /** Leave the stint as it stands; everything stays where it lies until you come back. */
  function pause() {
    if (!A) return; const s = A.s; if (held) drop(true);
    while (A.queue.length) { const [cls, seed, x, z, yaw, o] = A.queue.shift(); addStone(cls, seed, x, z, yaw, o); }
    const list = snapshot(A.stones), type = A.type; store.paused[s.id] = { type, stones: list, seedNext: A.seedNext }; persist();
    dispose(); s.state = 'paused'; showBuilt(s, type, list); drawMarkers(); onChange();
  }
  /** Fix what stands in the wall; the rest of the pile goes back. */
  function finish() {
    if (!A || A.queue.length) return false; if (held) drop(true);
    const s = A.s, res = read(), inWall = res.stones.map(i => i.s);
    if (inWall.length < 8) { hint('nothing much stands in the wall yet · Backspace on a held stone undoes, P puts the stint away for later', 6000); return false; }
    const list = snapshot(inWall), type = A.type; store.done[s.id] = { type, stones: list, height: Math.round(res.height * 100) / 100, t: Date.now() }; delete store.paused[s.id]; persist();
    dispose(); s.state = 'done'; showBuilt(s, type, list); drawMarkers(); onChange();
    const n = stints.filter(x => x.state === 'done').length;
    hint(`stint finished: ${n} of ${stints.length} standing, ${Math.round(stints.filter(x => x.state === 'done').reduce((a, x) => a + x.L, 0))} m of wall`, 8000);
    return true;
  }
  function read() { return analyseWall({ spec: A.spec, stones: A.stones, physics: A.physics, interaction: { held } }); }

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
  function look(st, hot) { st.mesh.material = hot ? hotMat(A.type) : matOf(A.type, false); }
  function pick(st) {
    undo.push(snapshot(A.stones)); if (undo.length > 20) undo.shift();
    held = st; placing = false; effort = 0; ghost = false; press = false;
    const b = st.body; b.setGravityScale(0, true); b.wakeUp();
    const r = b.rotation(), t = b.translation(); targetQ.set(r.x, r.y, r.z, r.w); smooth.set(t.x, t.y + 0.06, t.z); target.copy(smooth); landing = null;
    look(st, true); ring.visible = true; onChange();
  }
  function drop(force) {
    const st = held; if (!st) return;
    if (!force && !placing) { const t = st.body.translation(); placing = true; placeT = 0; placeXZ = { x: t.x, z: t.z }; placeY = t.y; return; }
    placing = false; const b = st.body; b.setGravityScale(1, true); b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    if (ghost) { st.collider.setCollisionGroups(0xffffffff); ghost = false; }
    look(st, false); held = null; ring.visible = false; notesAt = 0; onChange();
  }
  function rotateWorld(axis, ang) { targetQ.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, ang)).normalize(); }
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
    for (const [id, rec] of built) {
      const s = stints[id], d = Math.hypot(s.x - px, s.z - pz), near = d < NEAR;
      if (near && !rec.near && !rec.wantNear) { rec.wantNear = true; queueBuilt(s, rec, 'near', rec.type, rec.list); }
      if (rec.near) { rec.near.visible = near; if (rec.far) rec.far.visible = !near; } else if (rec.far) rec.far.visible = true;
    }
    if (!A) return;
    // delivery: a few stones a frame until the pile is all there
    if (A.queue.length) { const t0 = performance.now(); while (A.queue.length && performance.now() - t0 < 7) { const [cls, seed, x, z, yaw, o] = A.queue.shift(); addStone(cls, seed, x, z, yaw, o); } if (!A.queue.length) { onChange(); hint('the pile is here · point at a stone and click to lift it', 6000); } }
    A.physics.step(dt, h => steer(h));
    for (const st of A.stones) { if (st !== held && st.body.isSleeping()) continue; const p = st.body.translation(), r = st.body.rotation(); st.mesh.position.set(p.x, p.y, p.z); st.mesh.quaternion.set(r.x, r.y, r.z, r.w); if (p.y < -3) { st.body.setTranslation({ x: 0, y: 0.5, z: 3 }, true); st.body.setLinvel({ x: 0, y: 0, z: 0 }, true); } }
    if (held) carry(dt);
    else {
      const hit = cast(null), h = hit && hit.stone ? hit.stone : null;
      if (h !== hover) { if (hover) look(hover, false); hover = h; if (hover) look(hover, true); }
    }
    // the beam from your hand to what you hold or point at
    const tgt = held || hover;
    if (tgt) { _w.copy(tgt.mesh.position).applyMatrix4(A.group.matrixWorld); beam.visible = true; beam.position.copy(hand); beam.lookAt(_w); const L = hand.distanceTo(_w), r = held ? 0.012 + 0.01 * effort : 0.006; beam.scale.set(r, r, L); beam.material.opacity = held ? 0.3 + 0.35 * effort : 0.14; }
    else beam.visible = false;
    if (t - notesAt > 1.2 && !A.queue.length) { notesAt = t; A.notes = read(); onChange(); }
    if (Math.hypot(A.s.x - px, A.s.z - pz) > 40) { hint('you have walked away from your stint · it is put by until you come back', 6000); pause(); }
  }
  /** Where the suit is reaching, world space (the stone held or pointed at), or null. */
  function aim(out) { const tgt = held || hover; if (!A || !tgt) return null; return out.copy(tgt.mesh.position).applyMatrix4(A.group.matrixWorld); }

  // ---------------------------------------------------------------- input (main.js hands these on while the pointer is locked)
  function onDown(button) {
    if (!A || A.queue.length) return false;
    if (held) { if (button === 0) drop(false); return true; }
    if (button === 0 && hover) { pick(hover); hover = null; return true; }
    return false;
  }
  function onWheel(dy, shift) { if (!held) return false; rotateWorld(UP, (dy > 0 ? 1 : -1) * (shift ? Math.PI / 60 : Math.PI / 12)); return true; }
  function onKey(code, down, shift) {
    if (!A) return false;
    if (code === 'Space') { press = down && !!held; return !!held; }
    if (code === 'KeyG') { if (held && down !== ghost) { ghost = down; held.collider.setCollisionGroups(down ? 0 : 0xffffffff); } return !!held; }
    if (!down) return false;
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
    for (let i = 0; i < 14; i++) A.queue.push(['builder', A.seedNext++, -half + rng() * s.L, 1.2 + rng() * 0.7, rng() * 6.28, { lift: 0.4 + i * 0.12 }]);
    for (let i = 0; i < 20; i++) A.queue.push(['hearting', A.seedNext++, A.heaps[i % A.heaps.length][0] + (rng() - 0.5) * 0.5, A.heaps[i % A.heaps.length][1] + (rng() - 0.5) * 0.5, rng() * 6.28, { lift: 0.3 + i * 0.05 }]);
    hint('more stone on its way', 3000);
  }

  // ---------------------------------------------------------------- what the forearm console says
  function status() {
    const done = stints.filter(s => s.state === 'done'), o = { stints: stints.length, done: done.length, metres: done.reduce((a, s) => a + s.L, 0), active: null, physFail };
    if (A) {
      const n = A.notes;
      o.active = { id: A.s.id, stone: STONE_TYPES[A.type].name, delivering: A.queue.length ? 1 - A.queue.length / Math.max(1, A.total) : 1,
        held: held ? { cls: held.cls, kg: held.mass, effort, ghost, placing } : null, hover: hover ? { cls: hover.cls, kg: hover.mass } : null,
        notes: n ? { footings: Math.min(n.footings.covA, n.footings.covB), height: n.height, min: n.minHeight || 0, target: HEIGHT, face: n.faceStones, traced: n.traced, proud: n.proud, running: n.running, throughs: n.throughs, copes: n.copeCov, hearting: n.heartingFill, settled: n.settled } : null };
    }
    return o;
  }
  function reset() { if (A) dispose(); jobs.length = 0; for (const [, rec] of built) { rec.dead = true; root.remove(rec.group); rec.group.traverse(o => o.geometry && o.geometry.dispose()); } built.clear(); store.done = {}; store.paused = {}; persist(); for (const s of stints) s.state = 'todo'; drawMarkers(); onChange(); }
  addEventListener('pagehide', () => { if (A) { const s = A.s; while (A.queue.length) { const [cls, seed, x, z, yaw, o] = A.queue.shift(); addStone(cls, seed, x, z, yaw, o); } store.paused[s.id] = { type: A.type, stones: snapshot(A.stones), seedNext: A.seedNext }; persist(); } });

  return { stints, start, pause, finish, update, nearest, aim, hand, onDown, onWheel, onKey, status, reset, moreStone,
    get _a() { return A; },   // for tests
    get active() { return A ? A.s : null; }, get holding() { return !!held; }, get busy() { return !!A; },
    get stone() { return store.stone; }, set stone(k) { if (STONE_TYPES[k]) { store.stone = k; persist(); } }, types: Object.keys(STONE_TYPES).filter(k => !STONE_TYPES[k].unit).map(k => ({ value: k, label: STONE_TYPES[k].name })) };
}
