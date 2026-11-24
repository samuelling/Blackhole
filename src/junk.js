// junk.js: what comes through from the Shred Hole. A wormhole hangs over a clearing in the east field; when someone pulls FLUSH! in
// the Shred Hole with the garden chosen as the destination, the pieces come out of it, arc down and land on a junk heap below. Every
// piece is the real thing from the shredder: its convex hull (16 points), its mass in kilograms, its outer and inner colours and the
// name of what it was. So it can be lifted and built with like stone (walling.js asks this module for a piece's shape and mass).
//
// The drops are read from the Shred Hole's mailbox (its Cloudflare Worker), which any page may read. Only drops addressed to the
// garden (to: 'garden') are taken. The heap is kept in this browser: what you build with leaves it, and comes back if you put it back.
//
// A thing that reached the portal unbroken (the Shred Hole's WHOLE switch, or something too tough for the fan) comes with its recipe,
// and comes out of the wormhole as itself (whole.js): a duck, a watermelon, a car. It lands upright beside the heap rather than in it.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { wholeShape, recipeKey, keepRecipe, surfaceShader } from './whole.js';

export const RELAY = 'https://tunnel-claude.samuelling.workers.dev/drops';
export const HEAP = { x: 50.4, z: 6.4 };                               // where the junk piles up
export const HOLE = { x: 55.6, z: 4.4, h: 11.0, r: 1.8 };               // the wormhole: centre, height above the ground (high, so the heap can grow under it), radius
const KEY = 'gd.junk.v1', MAXP = 1400, CHUNK = 160, FIRST_LOOK = 14 * 86400e3;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function decodePoints(pc) {
  if (Array.isArray(pc.p)) return Float32Array.from(pc.p);
  const s = atob(pc.b), out = new Float32Array(s.length);
  for (let i = 0; i < s.length; i++) { let v = s.charCodeAt(i); if (v > 127) v -= 256; out[i] = v / 127 * pc.s; }
  return out;
}
function encodePoints(flat) {
  let m = 0; for (const v of flat) m = Math.max(m, Math.abs(v));
  const s = +((m || 1e-4) * 1.0005).toPrecision(4); let str = '';
  for (const v of flat) str += String.fromCharCode(Math.max(-127, Math.min(127, Math.round(v / s * 127))) & 255);
  return { s, b: btoa(str) };
}

/** A piece's shape, ready for drawing and for physics: centred on its own middle. */
function shapeOf(rec) {
  const flat = decodePoints(rec), pts = [], c = new THREE.Vector3();
  for (let i = 0; i + 2 < flat.length; i += 3) { const p = new THREE.Vector3(flat[i], flat[i + 1], flat[i + 2]); pts.push(p); c.add(p); }
  if (pts.length) c.divideScalar(pts.length);
  for (const p of pts) p.sub(c);
  let geo = null;
  if (pts.length >= 4) try { geo = new ConvexGeometry(pts); } catch (e) { geo = null; }
  if (!geo || !geo.attributes.position || geo.attributes.position.count < 12) { const e = Math.max(0.02, ...pts.map(p => p.length())); geo = new THREE.IcosahedronGeometry(e * 0.7, 0); }
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  // the outside of the thing on most faces, the broken inside on the rest
  const n = geo.attributes.position.count, col = new Float32Array(n * 3), co = new THREE.Color(rec.c || '#888888'), ci = new THREE.Color(rec.i || rec.c || '#777777'), k = new THREE.Color();
  let h = (rec.id || '').split('').reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7);
  for (let f = 0; f < n / 3; f++) { h = (Math.imul(h, 1103515245) + 12345) | 0; const inner = ((h >>> 8) & 255) < 70, j = 0.88 + 0.24 * (((h >>> 16) & 255) / 255);
    k.copy(inner ? ci : co).multiplyScalar(j); for (let v = 0; v < 3; v++) col.set([k.r, k.g, k.b], (f * 3 + v) * 3); }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  { const sf = new Float32Array(n * 3); for (let v = 0; v < n; v++) sf.set([1.6, 0.15, 0], v * 3); geo.setAttribute('aSurf', new THREE.BufferAttribute(sf, 3)); }   // the junk material's own roughness and metalness
  const hull = new Float32Array(pts.length * 3); pts.forEach((p, i) => hull.set([p.x, p.y, p.z], i * 3));
  // volume, by the divergence theorem over the hull's faces
  let vol = 0; const P = geo.attributes.position, a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
  for (let f = 0; f < P.count; f += 3) { a.fromBufferAttribute(P, f); b.fromBufferAttribute(P, f + 1); d.fromBufferAttribute(P, f + 2); vol += a.dot(b.cross(d)) / 6; }
  const size = new THREE.Vector3(); geo.boundingBox.getSize(size);
  return { geo, hull, vol: Math.max(Math.abs(vol), 1e-6), size, r: geo.boundingSphere.radius };
}

export function createJunk({ scene, U, COMMON, P, heightAt, lite = false, onArrive = () => {}, hint = () => {}, mailbox = true }) {
  const group = new THREE.Group(); group.name = 'junk'; scene.add(group);
  let store = { since: 0, pieces: {}, heap: [], seq: 0, drops: 0, recipes: {} };   // a whole thing's piece has w: the key of its recipe
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.pieces) store = Object.assign(store, s); } catch (e) {}
  if (!store.recipes) store.recipes = {};
  // in a room (multi.js) the heap is the room's: whoever has been there longest fetches from the mailbox and tells the rest what came
  // out and where it landed; taking, putting back and vaporizing are told too. A guest's own heap is set aside and comes back on leaving.
  let net = null, guestJ = false, ownStore = null, outbox = [];
  let saveT = 0; const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { if (guestJ) return; try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { hint('this browser would not keep the junk heap (storage full or blocked)', 6000); } }, 800); };
  const shapes = new Map(); const shape = id => { let s = shapes.get(id); const rec = store.pieces[id];
    if (!s && rec) { s = rec.w ? (store.recipes[rec.w] && wholeShape(store.recipes[rec.w])) : shapeOf({ ...rec, id }); if (s) shapes.set(id, s); } return s; };
  const isWhole = id => !!(store.pieces[id] && store.pieces[id].w);
  const mat = P.std({ vertexColors: true, roughness: 0.6, metalness: 0.15 }, { key: 'junk', extra: surfaceShader });
  const g0 = heightAt(HEAP.x, HEAP.z), holeC = new THREE.Vector3(HOLE.x, heightAt(HOLE.x, HOLE.z) + HOLE.h, HOLE.z);

  // ---------------------------------------------------------------- the heap: a height grid the pieces stack on, drawn in chunks
  const GC = 0.12, GN = 120, gx0 = HEAP.x - GN * GC / 2, gz0 = HEAP.z - GN * GC / 2, grid = new Float32Array(GN * GN), under = new Float32Array(GN * GN);   // under: the surface beneath the top layer
  for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) under[j * GN + i] = grid[j * GN + i] = heightAt(gx0 + (i + 0.5) * GC, gz0 + (j + 0.5) * GC);
  const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _m = new THREE.Matrix4(), ONE = new THREE.Vector3(1, 1, 1);
  function footprint(sh, q, x, z, fn) {   // the grid cells under a piece at this turn and place, with the piece's lowest and highest points
    let minY = 1e9, maxY = -1e9, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; const H = sh.hull;
    for (let i = 0; i < H.length; i += 3) { _v.set(H[i], H[i + 1], H[i + 2]).applyQuaternion(q); minY = Math.min(minY, _v.y); maxY = Math.max(maxY, _v.y); x0 = Math.min(x0, _v.x); x1 = Math.max(x1, _v.x); z0 = Math.min(z0, _v.z); z1 = Math.max(z1, _v.z); }
    const i0 = Math.max(0, Math.floor((x + x0 * 0.8 - gx0) / GC)), i1 = Math.min(GN - 1, Math.floor((x + x1 * 0.8 - gx0) / GC)), j0 = Math.max(0, Math.floor((z + z0 * 0.8 - gz0) / GC)), j1 = Math.min(GN - 1, Math.floor((z + z1 * 0.8 - gz0) / GC));
    return fn(i0, i1, j0, j1, minY, maxY);
  }
  function restOn(sh, q, x, z, nest = 0.18) {   // where a piece comes to rest: on whatever is highest under it, nested in a little
    return footprint(sh, q, x, z, (i0, i1, j0, j1, minY, maxY) => {
      let top = -1e9; for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) top = Math.max(top, grid[j * GN + i]);
      if (top < -1e8) top = heightAt(x, z);
      return top - minY - nest * (maxY - minY);
    });
  }
  function settle(sh, q, x, y, z) {      // and once it lies there, the heap is that much higher
    footprint(sh, q, x, z, (i0, i1, j0, j1, minY, maxY) => { const top = y + minY + 0.8 * (maxY - minY); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * GN + i; if (top > grid[k]) { under[k] = Math.max(under[k], Math.min(grid[k], y + minY)); grid[k] = top; } } });
  }
  const chunks = [];                     // { ids: Set, mesh, dirty }
  const where = new Map();               // piece id -> its heap entry
  function chunkFor() { let c = chunks.find(c => c.ids.size < CHUNK); if (!c) { c = { ids: new Set(), mesh: null, dirty: true }; chunks.push(c); } return c; }
  function rebuild(c) {
    c.dirty = false; if (c.mesh) { group.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh = null; }
    const parts = [];
    for (const id of c.ids) { const e = where.get(id), sh = shape(id); if (!e || !sh) continue; const g = sh.geo.clone(); g.applyMatrix4(_m.compose(_v.set(e[1], e[2], e[3]), _q.set(e[4], e[5], e[6], e[7]), ONE)); parts.push(g); }
    if (!parts.length) return;
    const geo = mergeGeometries(parts, false); parts.forEach(g => g.dispose()); geo.computeBoundingSphere();
    c.mesh = new THREE.Mesh(geo, mat); c.mesh.castShadow = c.mesh.receiveShadow = true; group.add(c.mesh);
  }
  function addToHeap(e) { const c = chunkFor(); c.ids.add(e[0]); c.dirty = true; where.set(e[0], e); e.c = c; }
  for (const e of store.heap) { const sh = shape(e[0]); if (!sh) continue; addToHeap(e); settle(sh, _q.set(e[4], e[5], e[6], e[7]), e[1], e[2], e[3]); }
  store.heap = store.heap.filter(e => where.has(e[0]));

  // ---------------------------------------------------------------- the wormhole
  // A sphere you look into: the middle shows the far side (the Shred Hole's vortex, turning), the rim the bent light of this side,
  // a thin bright ring where the two meet. It swells and brightens while something is coming through.
  const holeU = { uTime: U.uTime, uFlare: { value: 0 }, uR: { value: HOLE.r } };
  const holeMat = new THREE.ShaderMaterial({ uniforms: Object.assign({}, U, holeU),
    vertexShader: `varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: COMMON + `
      uniform float uFlare; varying vec3 vW; varying vec3 vN;
      void main(){
        vec3 V = normalize(cameraPosition - vW), N = normalize(vN);
        float mu = clamp(dot(N, V), 0.0, 1.0), b = sqrt(1.0 - mu * mu);              // 0 looking at the middle, 1 at the rim
        vec3 side = normalize(cross(V, vec3(0.0, 1.0, 0.0)) + 1e-4), up = cross(side, V);
        vec2 q = vec2(dot(N, side), dot(N, up));                                       // where on the disc, as seen
        float r = length(q), a = atan(q.y, q.x);
        // the far side: the vortex turning, faster toward its eye, with debris streaking down the throat
        float throat = 1.0 / max(0.06, 1.0 - min(r, 0.97));
        float swirl = a + uTime * 0.7 + throat * 1.6;
        float arms = 0.5 + 0.5 * sin(swirl * 3.0 + vnoise(vec2(throat * 2.0, a * 2.0)) * 3.0);
        float streak = smoothstep(0.82, 1.0, vnoise(vec2(a * 9.0, throat * 3.0 - uTime * 2.4)));
        vec3 far = mix(vec3(0.01, 0.025, 0.05), vec3(0.7, 0.36, 0.1), pow(arms, 3.0) * 0.5) + vec3(0.2, 0.6, 0.8) * pow(arms, 8.0) * 0.35;
        far += vec3(1.0, 0.85, 0.6) * streak * 0.35;
        far *= 0.35 + 0.9 * smoothstep(0.0, 0.55, r) * (1.0 - smoothstep(0.7, 0.9, r));
        far += vec3(1.0, 0.8, 0.5) * smoothstep(0.22, 0.0, r) * 0.45;                   // light at the end of the throat
        // this side, bent round the rim: the sky's own colour, turned through
        vec3 near = (uFogColor * 0.8 + uAmb * 0.5) * (0.55 + 0.45 * vnoise(vec2(a * 6.0 + uTime * 0.05, b * 8.0)));   // this side, turned inside out
        float rim = smoothstep(0.7, 0.93, b);
        vec3 c = mix(far, near, rim);
        c += vec3(0.6, 0.9, 1.0) * exp(-pow((b - 0.92) * 55.0, 2.0)) * (0.55 + 0.6 * uFlare);   // the photon ring, thin
        c *= 1.0 + 0.45 * uFlare;
        gl_FragColor = vec4(mix(uFogColor, c, fogF(distance(cameraPosition, vW)) * 0.9 + 0.1), 1.0);
      }` });
  // (the wormhole itself is drawn by the lens pass in main.js, as light bent through and round its throat; this sphere is kept only for tests)
  const hole = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), holeMat); hole.position.copy(holeC); hole.scale.setScalar(HOLE.r); hole.visible = false; group.add(hole);
  // a soft halo round it
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ uniforms: Object.assign({}, U, holeU), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0) + vec4(position.xy * 2.0, 0.0, 0.0)); }`,
    fragmentShader: `uniform float uTime, uFlare, uR; varying vec2 vUv;
      void main(){ float r = length(vUv), d = max(0.0, r - 0.31);                        // the sphere's edge is at 0.31 of the quad's half-width
        float a = atan(vUv.y, vUv.x), w = 0.65 + 0.35 * sin(a * 5.0 + uTime * 0.9) * sin(a * 3.0 - uTime * 0.6);
        gl_FragColor = vec4(vec3(0.35, 0.75, 1.0) * exp(-d * 9.0) * smoothstep(0.29, 0.32, r) * (0.08 + 0.25 * uFlare) * w, 1.0); }` }));
  halo.scale.setScalar(HOLE.r * 3.2); halo.position.copy(holeC); halo.renderOrder = 5; halo.visible = false; group.add(halo);

  // ---------------------------------------------------------------- arrivals
  const flying = [];                     // { id, mesh, p0, v0, T, t, q0, q1, spin, x, y, z }
  const queue = [];                      // pieces still to come out
  let flare = 0;
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = Math.random(); v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v); };
  // a whole thing comes down on its feet, round the edge of the heap (bigger things further out), where it can be seen
  function wholePlace(sh) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(gauss() * 0.04, Math.random() * 6.28, gauss() * 0.04)), a = Math.random() * 6.28, rr = 2.2 + 1.2 * Math.random() + Math.min(3, sh.r);
    const x = HEAP.x + Math.cos(a) * rr, z = HEAP.z + Math.sin(a) * rr * 0.85;
    return { q, x, z, y: restOn(sh, q, x, z, 0.02) };
  }
  function launch(id, to) {   // to: where it is to land, when the room's keeper has already said
    const sh = shape(id); if (!sh) return;
    let q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28));
    const spread = 0.6 + 0.05 * Math.sqrt(store.heap.length);
    let x = HEAP.x + gauss() * spread, z = HEAP.z + gauss() * spread * 0.85, y;
    if (to) { x = to[1]; y = to[2]; z = to[3]; q1.set(to[4], to[5], to[6], to[7]); }
    else if (sh.whole) { const w = wholePlace(sh); q1 = w.q; x = w.x; z = w.z; y = w.y; } else y = restOn(sh, q1, x, z);
    if (!to && net) { const pc = store.pieces[id]; outbox.push({ id, p: pc, r: pc.w ? store.recipes[pc.w] : undefined, e: [id, +x.toFixed(3), +y.toFixed(3), +z.toFixed(3), +q1.x.toFixed(4), +q1.y.toFixed(4), +q1.z.toFixed(4), +q1.w.toFixed(4)] }); }
    const dir = new THREE.Vector3(x - holeC.x, 0, z - holeC.z).normalize(), p0 = holeC.clone().addScaledVector(dir, HOLE.r * 0.7).add(new THREE.Vector3(gauss() * 0.3, gauss() * 0.3 - 0.3, gauss() * 0.3));
    const T = 0.9 + Math.random() * 0.6, v0 = new THREE.Vector3(x - p0.x, y - p0.y + 4.9 * T * T, z - p0.z).divideScalar(T);
    const mesh = new THREE.Mesh(sh.geo, mat); mesh.castShadow = true; mesh.position.copy(p0); group.add(mesh);
    flying.push({ id, mesh, p0, v0, T, t: 0, q0: new THREE.Quaternion().random(), q1, spin: new THREE.Vector3(gauss(), gauss(), gauss()).multiplyScalar(sh.whole ? 2.5 : 6), x, y, z });
  }
  function land(f) {
    group.remove(f.mesh);
    const sh = shape(f.id); if (!sh) return;
    const e = [f.id, +f.x.toFixed(3), +f.y.toFixed(3), +f.z.toFixed(3), +f.q1.x.toFixed(4), +f.q1.y.toFixed(4), +f.q1.z.toFixed(4), +f.q1.w.toFixed(4)];
    settle(sh, f.q1, f.x, f.y, f.z); store.heap.push(e); addToHeap(e);
  }
  function receive(d) {
    const ids = [], obj = d.object || {}, names = Array.isArray(d.objects) ? d.objects : null, pieces = (d.pieces || []).slice(0, 400);
    // a payload holds several things: newer ones mark each piece with its thing (k); older ones are in order, a share each
    let owner = null;
    if (names && pieces.length && pieces[0].k == null) {
      const total = names.reduce((n, o) => n + (o.pieces || 0), 0), budget = Math.min(400, total); owner = [];
      names.forEach((o, i) => { const share = Math.max(Math.min(8, o.pieces || 0), Math.round(budget * (o.pieces || 0) / Math.max(1, total))); for (let k = 0; k < share; k++) owner.push(i); });
    }
    const wholeSeen = new Set(); let whole = 0;
    pieces.forEach((pc, n) => {
      const oi = pc.k != null ? pc.k : owner ? owner[n] : null, from = names && oi != null && names[oi] ? names[oi] : obj;
      // part of a thing that came through in one piece, with its recipe: the thing itself, once
      const rcp = pc.u != null && keepRecipe(from.recipe);
      if (rcp) {
        const key = (oi ?? '') + ':' + pc.u; if (wholeSeen.has(key)) return; wholeSeen.add(key);
        const rk = recipeKey(rcp); store.recipes[rk] = rcp;
        const id = 'j' + (store.seq++).toString(36);
        store.pieces[id] = { w: rk, c: pc.c, m: Math.max(0.03, +rcp.mass || +pc.m || 0.3), n: (from.name || rcp.name || 'something').slice(0, 40), k: from.icon || rcp.icon || '' };
        if (!shape(id)) { delete store.pieces[id]; return; }
        ids.push(id); whole++; return;
      }
      const id = 'j' + (store.seq++).toString(36), enc = Array.isArray(pc.p) ? encodePoints(pc.p) : { s: pc.s, b: pc.b };
      if (!enc.b) return;
      store.pieces[id] = { c: pc.c, i: pc.i, m: Math.max(0.03, +pc.m || 0.3), s: enc.s, b: enc.b, n: (from.name || obj.name || 'something').slice(0, 40), k: from.icon || obj.icon || '' };
      ids.push(id);
    });
    if (!ids.length) return;
    store.drops++; queue.push(...ids); flare = Math.max(flare, 0.4);
    const info = { name: names && names.length ? [...new Set(names.map(o => o.name))].slice(0, 3).join(', ') + (new Set(names.map(o => o.name)).size > 3 ? ' and more' : '') : obj.name || 'something', icon: names ? '📦' : obj.icon || '', pieces: ids.length - whole, whole };
    onArrive(info); if (net) net.send({ j: 'arr', info });
    trim(); save();
  }
  function trim() {   // the heap keeps the newest pieces; what is built into a wall is never thrown away
    const inUse = new Set(store.heap.map(e => e[0]).concat(queue, flying.map(f => f.id))), used = usedElsewhere();   // (what is still in the air counts: trimming it left nothing to land)
    let n = Object.keys(store.pieces).length;
    if (n <= MAXP) return;
    const gone = [];
    for (const e of store.heap.slice()) { if (n <= MAXP) break; if (used.has(e[0])) continue; take(e[0], true); delete store.pieces[e[0]]; shapes.delete(e[0]); gone.push(e[0]); n--; }
    if (net && gone.length) for (let i = 0; i < gone.length; i += 300) net.send({ j: 'vap', ids: gone.slice(i, i + 300) });
    for (const id of Object.keys(store.pieces)) if (!inUse.has(id) && !used.has(id) && n > MAXP) { delete store.pieces[id]; shapes.delete(id); n--; }
    const live = new Set(Object.values(store.pieces).map(p => p.w).filter(Boolean)); for (const k of Object.keys(store.recipes)) if (!live.has(k)) delete store.recipes[k];
  }
  let usedElsewhere = () => new Set();

  // ---------------------------------------------------------------- the mailbox
  let polling = false, lastPoll = -1e9, failed = 0;
  async function poll() {
    if (polling || !mailbox || (net && !net.host())) return; polling = true;   // in a room, one of you fetches for all
    try {
      const since = store.since || Date.now() - FIRST_LOOK;
      const r = await fetch(`${RELAY}?since=${since}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json(); failed = 0;
      for (const d of j.drops || []) { if (d && d.to === 'garden' && Array.isArray(d.pieces)) receive(d); if (d && d.at > (store.since || 0)) store.since = d.at; }
      if (!store.since) store.since = since;
      save();
    } catch (e) { failed++; }
    polling = false;
  }

  // ---------------------------------------------------------------- each frame
  let rebuildAt = 0;
  /** Tell the room where the pieces just thrown are to land. */
  function flush() { if (outbox.length && net) { for (let i = 0; i < outbox.length; i += 30) net.send({ j: 'fly', a: outbox.slice(i, i + 30), since: store.since }); } outbox.length = 0; }
  function update(dt, t) {
    if (document.hidden) { if (queue.length || flying.length) finish(); flush(); return; }   // nobody watching: no need to throw them one by one
    if (t - lastPoll > (failed ? Math.min(300, 30 * failed) : 25)) { lastPoll = t; poll(); }
    // out they come, a few at a time
    flush();
    if (queue.length) { flare = Math.min(1, flare + dt * 2); const n = Math.min(queue.length, Math.max(1, Math.ceil(dt * (lite ? 30 : 50)))); for (let i = 0; i < n; i++) launch(queue.shift()); }
    else flare = Math.max(0, flare - dt * 0.4);
    holeU.uFlare.value = flare; hole.scale.setScalar(HOLE.r * (1 + 0.05 * flare + 0.015 * Math.sin(t * 1.3)));
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i]; f.t += dt; const s = Math.min(f.t, f.T), k = ss(0.7, 1.0, s / f.T);
      f.mesh.position.set(f.p0.x + f.v0.x * s, f.p0.y + f.v0.y * s - 4.9 * s * s, f.p0.z + f.v0.z * s);
      _q.setFromAxisAngle(_v.copy(f.spin).normalize(), f.spin.length() * s); f.mesh.quaternion.copy(f.q0).premultiply(_q).slerp(f.q1, k);
      if (f.t >= f.T) { land(f); flying.splice(i, 1); }
    }
    if (t > rebuildAt) { let n = 0; for (const c of chunks) if (c.dirty && n++ < 2) rebuild(c); rebuildAt = t + (flying.length ? 0.35 : 0.1); }
    if (!flying.length && !queue.length && chunks.some(c => c.dirty) === false && dirtySave) { dirtySave = false; save(); }
  }
  let dirtySave = false;

  // ---------------------------------------------------------------- for building: point at a piece, take it, put it back
  const _o = new THREE.Vector3();
  /** The heap piece a ray (world) hits first within maxT: { id, t } or null. */
  function pick(o, d, maxT) {
    let best = null, bt = maxT;
    for (const e of store.heap) {
      const sh = shape(e[0]); if (!sh) continue; const r = sh.r * 0.8;
      _o.set(e[1] - o.x, e[2] - o.y, e[3] - o.z); const tc = _o.dot(d); if (tc < 0) continue;
      const d2 = _o.lengthSq() - tc * tc; if (d2 > r * r) continue; const th = tc - Math.sqrt(r * r - d2);
      if (th < bt) { bt = th; best = e; }
    }
    return best ? { id: best[0], t: bt } : null;
  }
  /** Lift a piece out of the heap: its pose (world) and its shape. */
  function take(id, quiet) {
    const e = where.get(id); if (!e) return null;
    if (!quiet && net) net.send({ j: 'take', id });
    where.delete(id); e.c.ids.delete(id); e.c.dirty = true; store.heap = store.heap.filter(x => x !== e); dirtySave = true;
    return { pos: new THREE.Vector3(e[1], e[2], e[3]), q: new THREE.Quaternion(e[4], e[5], e[6], e[7]) };
  }
  /** Put a piece back on the heap (a stint was finished without it). */
  function giveBack(id, to) {
    const sh = shape(id); if (!sh || where.has(id)) return;
    let q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28)), x = HEAP.x + gauss() * 1.4, z = HEAP.z + gauss() * 1.2, y;
    if (to) { x = to[1]; y = to[2]; z = to[3]; q.set(to[4], to[5], to[6], to[7]); }
    else if (sh.whole) ({ q, x, z, y } = wholePlace(sh)); else y = restOn(sh, q, x, z);
    const e = [id, +x.toFixed(3), +y.toFixed(3), +z.toFixed(3), +q.x.toFixed(4), +q.y.toFixed(4), +q.z.toFixed(4), +q.w.toFixed(4)];
    if (!to && net) net.send({ j: 'back', e });
    settle(sh, q, x, y, z); store.heap.push(e); addToHeap(e); dirtySave = true;
  }
  /** Vaporize a piece on the heap: gone for good. Returns where it was, for the flash, or null. */
  function vaporize(id, quiet) {
    const w = take(id, true); if (!w) return null;
    if (!quiet && net) net.send({ j: 'vap', ids: [id] });
    delete store.pieces[id]; shapes.delete(id); dirtySave = true;
    const live = new Set(Object.values(store.pieces).map(p => p.w).filter(Boolean)); for (const k of Object.keys(store.recipes)) if (!live.has(k)) delete store.recipes[k];
    return w.pos;
  }
  /** Vaporize the whole heap (what is built into walls stays). Returns how many pieces went. */
  function vaporizeAll(quiet) {
    finish(); let n = 0;
    if (!quiet && net) net.send({ j: 'vap', all: 1 });
    for (const e of store.heap.slice()) if (vaporize(e[0], true)) n++;
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) under[j * GN + i] = grid[j * GN + i] = heightAt(gx0 + (i + 0.5) * GC, gz0 + (j + 0.5) * GC);   // back to bare ground
    return n;
  }
  // ---------------------------------------------------------------- the room's heap
  function resetHeap() {   // everything drawn and stacked, again, from the store
    for (const f of flying.splice(0)) group.remove(f.mesh); queue.length = 0; outbox.length = 0;
    for (const c of chunks) if (c.mesh) { group.remove(c.mesh); c.mesh.geometry.dispose(); } chunks.length = 0; where.clear();
    for (const sh of shapes.values()) sh.geo.dispose(); shapes.clear();
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) under[j * GN + i] = grid[j * GN + i] = heightAt(gx0 + (i + 0.5) * GC, gz0 + (j + 0.5) * GC);
    const heap = store.heap; store.heap = [];
    for (const e of heap) { const sh = shape(e[0]); if (!sh) continue; store.heap.push(e); addToHeap(e); settle(sh, _q.set(e[4], e[5], e[6], e[7]), e[1], e[2], e[3]); }
  }
  const okE = e => Array.isArray(e) && e.length >= 8 && typeof e[0] === 'string' && e.slice(1, 8).every(v => typeof v === 'number' && isFinite(v));
  const okP = p => p && typeof p === 'object' && (typeof p.w === 'string' || typeof p.b === 'string');
  const netApi = {
    attach(n) { net = n; }, get guest() { return guestJ; },
    snapshot() { finish(); return { pieces: store.pieces, heap: store.heap, recipes: store.recipes, seq: store.seq, since: store.since }; },
    /** Take on the room's heap; mine: it is this browser's own garden (kept). */
    adopt(w, mine) {
      if (!w || typeof w !== 'object') return;
      if (!ownStore) ownStore = store; guestJ = !mine;
      const pieces = {}; let n = 0; for (const [id, pc] of Object.entries(w.pieces || {})) if (okP(pc) && n++ < 4000) pieces[id] = pc;
      store = { since: +w.since || 0, pieces, heap: (Array.isArray(w.heap) ? w.heap : []).filter(e => okE(e) && pieces[e[0]]).slice(0, 4000), seq: w.seq | 0, drops: ownStore.drops, recipes: w.recipes && typeof w.recipes === 'object' ? w.recipes : {} };
      resetHeap(); if (mine) { ownStore = null; save(); }
    },
    release() { net = null; outbox.length = 0; if (guestJ && ownStore) { store = ownStore; guestJ = false; ownStore = null; resetHeap(); } else { ownStore = null; guestJ = false; save(); } },
    onMsg(m) {
      if (!m || typeof m !== 'object') return;
      if (m.j === 'fly') { for (const a of Array.isArray(m.a) ? m.a.slice(0, 60) : []) { if (!a || !okE(a.e) || !okP(a.p) || a.e[0] !== a.id || where.has(a.id)) continue; store.pieces[a.id] = a.p; if (a.p.w && a.r) { const r = keepRecipe(a.r); if (r) store.recipes[a.p.w] = r; } shapes.delete(a.id); launch(a.id, a.e); } if (+m.since > (store.since || 0)) store.since = +m.since; flare = Math.max(flare, 0.4); save(); }
      else if (m.j === 'arr') { if (m.info && typeof m.info === 'object') onArrive({ name: String(m.info.name || 'something').slice(0, 80), icon: String(m.info.icon || '').slice(0, 4), pieces: m.info.pieces | 0, whole: m.info.whole | 0 }); }
      else if (m.j === 'take') take(String(m.id), true);
      else if (m.j === 'back') { if (okE(m.e)) giveBack(m.e[0], m.e); }
      else if (m.j === 'vap') { if (m.all) vaporizeAll(true); else for (const id of Array.isArray(m.ids) ? m.ids.slice(0, 400) : []) { if (!vaporize(String(id), true) && store.pieces[id]) { delete store.pieces[id]; shapes.delete(id); } } }
    },
  };
  /** What walling.js needs to build with a piece. */
  function stoneData(id) {
    const sh = shape(id), rec = store.pieces[id]; if (!sh || !rec) return null;
    const L = Math.max(sh.size.x, sh.size.y, sh.size.z), H = Math.min(sh.size.x, sh.size.y, sh.size.z), m = rec.m, rho = m / sh.vol;
    const cls = L > 0.6 ? 'through' : L > 0.13 ? 'builder' : H / L < 0.3 ? 'pinning' : 'hearting';
    return { geometry: sh.geo.clone(), hullPoints: sh.hull, massKg: m, cls, name: rec.n, icon: rec.k, junk: id, density: rho, whole: !!sh.whole,
      friction: rho < 350 ? 0.55 : rho < 1500 ? 0.62 : 0.7, restitution: rho < 350 ? 0.12 : 0.05, damp: rho < 200 ? [0.6, 0.8] : null, r: sh.r };
  }
  /** The top of the junk heap here (world y), or -Infinity off it: the physics stands on it. */
  function topAt(x, z) { const i = Math.floor((x - gx0) / GC), j = Math.floor((z - gz0) / GC); if (i < 0 || j < 0 || i >= GN || j >= GN) return -Infinity; const g = under[j * GN + i]; return g > heightAt(x, z) + 0.05 ? g - 0.06 : -Infinity; }
  /** Land everything at once (for tests, and for a page coming back from the background). */
  function finish() { while (queue.length) launch(queue.shift()); for (const f of flying.splice(0)) land(f); for (const c of chunks) if (c.dirty) rebuild(c); save(); }
  return { net: netApi, group, update, pick, take, giveBack, stoneData, vaporize, vaporizeAll, material: mat, shape, poll, receive, topAt, finish, where: id => where.get(id), isWhole,
    set usedElsewhere(fn) { usedElsewhere = fn; },
    get count() { return store.heap.length; }, get drops() { return store.drops; }, get flying() { return flying.length + queue.length; },
    hole: holeC, heap: HEAP, throat: HOLE.r, get flare() { return flare; } };
}
