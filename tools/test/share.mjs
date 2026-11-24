// Two-player check of shared building (two physics simulations), run in node with no browser: each player is a real instance of the game's own module, joined by an in-memory bus.
// To run: a folder holding src/ and vendor/ from this repo, `npm i three@0.160`, this file, then `node share.mjs`.
import * as THREE from 'three';
globalThis.localStorage = { d: {}, getItem(k){ return this.d[k] ?? null; }, setItem(k,v){ this.d[k]=v; } };
globalThis.addEventListener = () => {}; globalThis.document = { hidden: true };
const { createWalling, HEAPS } = await import('./src/walling.js');
const { createJunk } = await import('./src/junk.js');
const { heightAt } = await import('./src/field.js');
const P = { std: p => new THREE.MeshStandardMaterial(p) };
const bus = [], peers = {};
function mk(name) {
  const scene = new THREE.Group(), camera = new THREE.PerspectiveCamera(70, 1.6, 0.07, 1000); scene.add(camera);
  const junk = createJunk({ scene, U: { uTime: { value: 0 } }, COMMON: '', P, heightAt });
  const hints = [];
  const W = createWalling({ scene, camera, U: {}, patchFrag: () => {}, junk, garden: { block() {}, blockRound() {}, setExtraBlocked() {}, clearWall() {} }, hint: t => hints.push(t) });
  const c = { name, W, junk, camera, hints, px: 0, pz: 0, ready: true };
  W.net.attach({ send: (m, to) => bus.push([name, to || null, JSON.stringify(m)]), id: name, ready: () => c.ready });
  peers[name] = c; return c;
}
let T = 0, bytes = 0, msgs = 0;
function pump() { for (const [from, to, s] of bus.splice(0)) { bytes += s.length; msgs++; for (const c of Object.values(peers)) if (c.name !== from && (!to || to === c.name)) c.W.net.onMsg(from, JSON.parse(s)); } }
function run(n, hold = true) { for (let i = 0; i < n; i++) { T += 1 / 60; for (const c of Object.values(peers)) c.W.update(1 / 60, T, c.px, c.pz);
  if (hold) for (const c of Object.values(peers)) for (const o of Object.values(peers)) if (o !== c) o.W.net.remoteHold(c.name, c.W.net.holdState());
  pump(); } }
const stand = (c, x, z, lx, lz) => { c.px = x; c.pz = z; c.camera.position.set(x, 1.65, z); c.camera.lookAt(lx, 0.6, lz); c.camera.updateMatrixWorld(true); };
const put = (st, x, y, z) => { st.body.setTranslation({ x, y, z }, true); st.body.setLinvel({ x: 0, y: 0, z: 0 }, true); st.body.setAngvel({ x: 0, y: 0, z: 0 }, true); };
const pos = st => { const t = st.body.translation(); return [t.x, t.y, t.z]; };
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const ok = (name, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));

const H = mk('H'), G = mk('G');
run(30);
// G comes into H's garden
const mine = G.W.net.adopt(H.W.net.snapshot()); ok('guest adopts, not its own', mine === false && G.W.net.guest === true);
// --- 1. H starts a stint; G sees it as a mirror
const s0 = H.W.stints[0]; stand(H, s0.x + s0.ox * 3, s0.z + s0.oz * 3, s0.x, s0.z); stand(G, s0.x + s0.ox * 3.5 + 1, s0.z + s0.oz * 3.5, s0.x, s0.z);
await H.W.begin(H.px, H.pz, 0); run(400);
const nH = H.W._a.stones.length, mir = G.W.net.mirrors.get(0);
ok('stint pile mirrored', !!mir && mir.byUid.size === nH, `H ${nH} stones, mirror ${mir && mir.byUid.size}, ${msgs} msgs ${Math.round(bytes / 1024)} KB`);
ok('stint shows as someone else\'s to G', G.W.stints[0].state === 'remote');
// --- 2. H lifts a builder and sets it on the wall line; G's mirror follows the held stone, then its rest
const b1 = H.W._a.stones.find(s => s.cls === 'foundation'); H.W._t.pick(b1); run(5);
put(b1, 0.3, 0.6, 0); run(3);
const it1 = mir.byUid.get(b1.uid); ok('held stone streamed to mirror', d3([it1.p.x, it1.p.y, it1.p.z], pos(b1)) < 0.05, `off by ${d3([it1.p.x, it1.p.y, it1.p.z], pos(b1)).toFixed(3)} m`);
H.W._t.drop(); run(240);
ok('rest pose reaches mirror', d3([it1.p.x, it1.p.y, it1.p.z], pos(b1)) < 0.02, `off by ${d3([it1.p.x, it1.p.y, it1.p.z], pos(b1)).toFixed(4)} m, y ${pos(b1)[1].toFixed(2)}`);
// --- 3. G joins the same stint: same stones, same places
msgs = 0; bytes = 0;
await G.W.begin(G.px, G.pz, 0); run(120); const j1 = msgs; run(600); console.log('     ten seconds idle together:', msgs - j1, 'msgs');
const A1 = H.W._a, A2 = G.W._a;
ok('guest joined the stint with the same stones', !!A2 && A2.s.id === 0 && A2.stones.length === nH, `G ${A2 && A2.stones.length}, join cost ${msgs} msgs ${Math.round(bytes / 1024)} KB`);
let worst = 0; for (const st of A1.stones) { const o = A2.byUid.get(st.uid); if (o) worst = Math.max(worst, d3(pos(st), pos(o))); }
ok('both simulations agree at rest', worst < 0.03, `worst ${worst.toFixed(4)} m`);
// G sets a stone; H's copy goes there
const g1 = A2.stones.find(s => s.cls === 'foundation' && s.uid !== b1.uid); G.W._t.pick(g1); run(5); put(g1, -0.4, 0.6, 0.05); run(4);
const h1 = A1.byUid.get(g1.uid); ok('guest\'s held stone moves in host\'s simulation', d3(pos(h1), pos(g1)) < 0.06, `off by ${d3(pos(h1), pos(g1)).toFixed(3)}`);
G.W._t.drop(); run(300);
ok('guest\'s stone rests in the same place for host', d3(pos(h1), pos(g1)) < 0.02, `off by ${d3(pos(h1), pos(g1)).toFixed(4)}`);
// both at once: each sets a stone on the other's
const hb = A1.stones.find(s => s.cls === 'builder'), gb = A2.stones.filter(s => s.cls === 'builder')[5];
H.W._t.pick(hb); G.W._t.pick(gb); run(5); put(hb, 0.3, 1.0, 0); put(gb, -0.4, 1.0, 0.05); run(4); H.W._t.drop(); G.W._t.drop(); run(400);
worst = 0; let wu = ''; for (const st of A1.stones) { const o = A2.byUid.get(st.uid); const d = d3(pos(st), pos(o)); if (d > worst) { worst = d; wu = st.uid + ' ' + st.cls; } }
ok('after both build at once, simulations agree', worst < 0.03, `worst ${worst.toFixed(4)} m (${wu})`);
// --- 4. H puts it away; G carries on; then G puts it away: H keeps the record
H.W.pause(); run(30);
ok('host left: host mirrors the stint, guest still simulating', H.W.net.mirrors.has(0) && !!G.W._a);
const gp = pos(g1); G.W.pause(); run(30);
const saved = JSON.parse(localStorage.d['gd.wall.v1'] || '{}');
ok('record kept by the garden\'s owner only', !!(saved.paused && saved.paused[0] && saved.paused[0].stones.length === nH) && !H.W.net.mirrors.has(0), `saved ${saved.paused && saved.paused[0] && saved.paused[0].stones.length}`);
// --- 5. coming back to a put-away stint brings back the stones as they were (the regression)
await H.W.begin(H.px, H.pz, 0); run(200);
const back = H.W._a.byUid.get(g1.uid);
ok('resumed stint has its stones where they were', H.W._a.stones.length === nH && !!back && d3(pos(back), gp) < 0.03, `${H.W._a.stones.length} stones, moved ${back ? d3(pos(back), gp).toFixed(4) : '?'}`);
H.W.pause(); run(30);
// --- 6. a free build by the guest with heap stones and glue
const [hx, hz] = HEAPS[0]; stand(G, hx - 6, hz, hx, hz); G.camera.lookAt(hx, 1.2, hz); G.camera.updateMatrixWorld(true); stand(H, hx - 8, hz + 2, hx, hz);
await G.W.begin(G.px, G.pz, Math.atan2(-6, 0)); run(10);
const x1 = G.W._t.pickExt(7.5), a = G.W._t.pluck(x1), x2 = G.W._t.pickExt(7.5), b = G.W._t.pluck(x2);
put(a, 0, 0.4, -1.5); run(240); const ta = a.body.translation(); put(b, ta.x, ta.y + 0.5, ta.z); run(300);
const touch = G.W._t.touching(b).find(([o]) => o === a);
const fid = G.W._a.s.id, fm = H.W.net.mirrors.get(fid);
ok('free build mirrored with heap stones', !!fm && fm.byUid.size === 2 && H.W.heaps[x1.hi].taken.has(x1.idx) && H.W.heaps[x2.hi].taken.has(x2.idx), `site ${fid}`);
// glue through the real key path
G.W._t.pick(b); G.W.onKey('KeyJ', true, false); run(30);
console.log('     touch', !!touch, 'b at', pos(b).map(v=>v.toFixed(2)), 'a at', pos(a).map(v=>v.toFixed(2)), 'hints G:', G.hints.slice(-2).join(' | '));
ok('glue told to the room', !!touch && G.W._t.glue.length === 1 && fm.glue.length === 1, `guest glue ${G.W._t.glue.length}, host mirror glue ${fm.glue.length}`);
G.W.pause(); run(30);
const fsv = JSON.parse(localStorage.d['gd.free.v1'] || '{}'), fr = (fsv.sites || []).find(f => f.id === fid);
ok('free build kept by owner with its glue', !!fr && fr.stones.length === 2 && fr.glue.length === 1 && H.W.freeCount === 1);
// host opens the guest's free build: glue comes back
stand(H, G.px, G.pz, hx, hz); await H.W.begin(H.px, H.pz, 0); run(60);
ok('host opens guest\'s free build, glued', H.W._a && H.W._a.s.id === fid && H.W._t.glue.length === 1 && G.W.net.mirrors.has(fid));
// --- 7. a third comes in mid-build: handed the garden as it stands
const C = mk('C'); run(5); C.W.net.adopt(G.W.net.snapshot()); run(30);
ok('newcomer gets the garden, with the site in hand', C.W.freeCount === 1 && C.W.stints[0].state === 'paused' && C.W.heaps[x1.hi].taken.has(x1.idx));
// --- 8. somebody vanishes mid-build: their site stays as it stood
G.W.net.peerGone('H'); C.W.net.peerGone('H'); delete peers.H; run(20);
ok('a vanished builder\'s site settles', !G.W.net.mirrors.has(fid) && G.W.freeCount === 1);
// --- 9. the guest leaves: its own (empty) garden comes back
G.W.net.release(); run(10);
ok('guest gets its own garden back', G.W.net.guest === false && G.W.freeCount === 0 && G.W.stints[0].state === 'todo' && !G.W.heaps[x1.hi].taken.has(x1.idx));
console.log('hints H:', H.hints.slice(-3).join(' | '));
