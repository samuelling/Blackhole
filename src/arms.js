// arms.js: guns. They come through the wormhole from the Shred Hole (its Arsenal: Betamax's guns, sent whole), land by the junk
// heap as the real thing (Betamax's models, src/betamax/), and can be picked up and fired: at the stones and junk of a free build
// (a round carries real momentum), at the trees, the plants, the lamps and the ground, and, in a room, at each other.
//
// Holding one: the gun is placed in the frame of your eye (at the hip, or aimed with its sight on your eye), and your suit's own arms
// hold it (body.js solves them to it every frame): the right glove round the grip with the index finger along the guard, the left
// under the fore-end. It's the same body and the same hold you see in first person, in the mirror view, and on everyone else.
// Reloading is Betamax's own choreography, played on those arms: the rifle comes in to the workspace canted, the magazine drops out
// (a spent one falls to the ground and lies there), the left hand goes to the pouch, seats a fresh one, tugs it, and slaps the bolt
// catch or racks the handle; the Benelli has its shells thumbed in one at a time. Each step has its own sound.
//
// Firing is hitscan from the eye along where you look, with each gun's own numbers from Betamax (rate, magazine, spread, damage,
// a shotgun's nine pellets), its report synthesized as Betamax does it (fitted to recordings of real rifles), a tracer, a flash at
// the muzzle and brass flying out of the port. What the round hits shows it, and some of it stays (havoc.js): craters in the ground,
// holes in wood and stone, debris that bounces and settles. Plants shot through are destroyed (dug up, as a trowel would: "put back"
// in Settings brings the garden's own back). A planted tree cut through falls, away from you. Lamps shot out go dark until you reload.
// In a room: the shooter decides the hit (what you saw is what you hit) and tells whoever it was; a body shot takes the gun's damage
// off 100, a head shot its head damage. Everyone sees it: the body flinches away from the round, the suit is holed where it went in
// and leaks air for a few seconds, a head shot cracks the visor (and your own view through it). At nothing left you topple the way the
// round pushed you and lie there, the view stepped out to see yourself, until you choose to get up: where you fell, or at the gate.
// Anyone can turn off being shot (Settings → Garden); their own guns still work.
//
// Keys: Q picks up the gun you're looking at (swapping for the one you hold), or draws / puts away your own; Shift+Q puts it down.
// Click fires (held, for the automatics), right button aims, R reloads. For now there's also a crate of the whole arsenal just
// inside the gate: Q at it takes a gun (the next one each time, the one you held going back in). Touch and the controller have their own buttons.
import * as THREE from 'three';
import { WEAPONS, weaponProp } from './betamax/arsenal.js';
import { reloadDuration, evalReload, pathPoint } from './betamax/weapons.js';
import { synthRifle, synthImpact, mulberry32 } from './betamax/gunsound.js';
import { createHavoc } from './havoc.js';

export const GUN_IDS = Object.keys(WEAPONS).filter(k => k !== 'm2');
const KEY = 'gd.arms.v1', REACH = 2.2, HP = 100, MOMENTUM = [4, 7, 9, 12];   // N·s a round carries, by calibre (a shotgun pellet: 1.6)
const okW = w => GUN_IDS.includes(w);
const r3 = v => Math.round(v * 1000) / 1000;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const KC = { ground: 'g', water: 'w', hedge: 'h', tree: 't', piece: 's', junk: 'j', lamp: 'l', post: 'm', crate: 'c', plant: 'p', body: 'b' };
const KIND = Object.fromEntries(Object.entries(KC).map(([k, v]) => [v, k]));

/**
 * o: { scene, camera, heightAt, blocked(x,z), trees(): [{x,z,r,gy,top,id?}], walling, audio(): {ctx, master}, hint(t,ms),
 *      players(): [{id, x, gy, z, down}], send(m) (to the room, or null), heapSpot(): {x,z}, respawn(), kick(pitch, yaw), canBeShot(): bool,
 *      me(): {x,gy,z,yaw,pitch}, selfView(): bool, body, waterAt(x, z) (the water's surface there, or null), lamps(): [[x, y, z]], breakLamp(i), arborTree(id): {wood, leaves, x, z, gy, H},
 *      plants: { near(x, z, d), destroy(rec) }, crateSpot() }
 */
export function createArms(o) {
  const { scene, camera } = o;
  const havoc = createHavoc({ scene, heightAt: o.heightAt, waterAt: o.waterAt || (() => null), audio: o.audio });
  let own = { seq: 0, lying: [] };   // guns on the ground: [uid, w, x, z, yaw]
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && Array.isArray(s.lying)) own = { seq: s.seq | 0, lying: s.lying.filter(okL) }; } catch (e) {}
  function okL(l) { return Array.isArray(l) && typeof l[0] === 'string' && okW(l[1]) && isFinite(l[2]) && isFinite(l[3]); }
  let store = own, guest = false;
  const save = () => { if (guest) return; try { localStorage.setItem(KEY, JSON.stringify(own)); } catch (e) {} };
  const group = new THREE.Group(); group.name = 'arms'; scene.add(group);
  const lying = new Map();   // uid -> { w, mesh, y, vy }
  function layDown(l, fall) {
    const [uid, w, x, z, yaw] = l; if (lying.has(uid)) return;
    const mesh = weaponProp(w), gy = o.heightAt(x, z);
    mesh.rotation.set(0, yaw || 0, Math.PI / 2);   // on its side
    const bb = new THREE.Box3().setFromObject(mesh); mesh.userData.lift = -bb.min.y;   // (the box is about the gun's own origin: lift it till its lowest point is on the ground)
    mesh.position.set(x, gy + (fall ? 6 : 0) + mesh.userData.lift, z); group.add(mesh);
    lying.set(uid, { w, mesh, gy, vy: 0, fall: !!fall });
  }
  // the demo crate by the gate: a box of the whole arsenal that never runs out (for now, before anything has come through the
  // Shred Hole). It's everyone's own (each browser has the same crate in the same place), so it's neither saved nor sent.
  const CRATE_ORDER = ['m1014', 'm7', 'x95', 'hk416', 'mp7', 'csass', 'm250', 'ng7', 'm18', 'g17'].filter(okW);
  let crate = null, crateNext = 0;
  if (o.crateSpot) {
    const c = o.crateSpot(), g = new THREE.Group(), gy = o.heightAt(c.x, c.z);
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a5a36, roughness: 0.85 }), dark = new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.9 });
    const W = 1.25, D = 0.62, H = 0.42, t = 0.025;
    const plank = (w, h, d, x, y, z, m = wood) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; g.add(b); };
    plank(W, t, D, 0, t / 2 + 0.04, 0, dark);                                                                    // floor
    for (const s of [-1, 1]) { plank(W, H, t, 0, H / 2 + 0.04, s * (D / 2 - t / 2)); plank(t, H, D - 2 * t, s * (W / 2 - t / 2), H / 2 + 0.04, 0); }
    for (const s of [-1, 1]) for (const k of [-1, 1]) plank(0.06, H + 0.02, 0.06, s * (W / 2 - 0.03), H / 2 + 0.05, k * (D / 2 - 0.03), dark);   // corner posts
    for (const s of [-1, 1]) plank(0.07, 0.04, D + 0.02, s * 0.32, 0.02, 0, dark);                                // skids
    plank(W + 0.02, 0.06, 0.035, 0, H * 0.55, -(D / 2 + 0.005), dark); plank(W + 0.02, 0.06, 0.035, 0, H * 0.55, D / 2 + 0.005, dark);   // bands
    // a few of the guns showing over the rim
    [['m1014', -0.12, 0.12, 0.1], ['m7', 0.06, -0.1, -0.2], ['x95', 0.2, 0.1, 0.15], ['mp7', -0.3, -0.12, -0.2]].filter(([w]) => okW(w)).forEach(([w, x, z, r], i) => {
      const m = weaponProp(w); m.rotation.set(0.35 * (i % 2 ? 1 : -1), Math.PI / 2 + r, Math.PI / 2); m.position.set(x, H - 0.06 + i * 0.015, z); g.add(m); });
    g.position.set(c.x, gy, c.z); g.rotation.y = c.yaw || 0; group.add(g);
    crate = { x: c.x, z: c.z, y: gy + H * 0.6, g };
  }
  function crateGun() { let w = CRATE_ORDER[crateNext % CRATE_ORDER.length]; if (held && held.w === w) w = CRATE_ORDER[++crateNext % CRATE_ORDER.length]; return w; }
  function fromCrate() {
    const w = crateGun(); crateNext = (CRATE_ORDER.indexOf(w) + 1) % CRATE_ORDER.length;
    take(w);   // (the one you held goes back in the crate)
    o.hint(`${WEAPONS[w].name} · ${WEAPONS[w].cal} · click fires, right button aims, R reloads · Q at the crate again for the next gun`, 5000);
    return true;
  }
  function clearLying() { for (const L of lying.values()) group.remove(L.mesh); lying.clear(); }
  function redraw() { clearLying(); for (const l of store.lying) layDown(l, false); }
  redraw();

  // ---------------------------------------------------------------- the gun in hand
  let held = null;   // { w, ud, gun (Betamax's model, in the world where your hands hold it), mag, rl (a reload under way), nextAt, drawn }
  let trigger = false, aiming = 0, aimOn = false, recoil = 0, lastShot = 0, flashT = 0;
  const flashTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,250,230,1)'); gr.addColorStop(0.25, 'rgba(255,200,110,.9)'); gr.addColorStop(1, 'rgba(255,120,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    for (let k = 0; k < 6; k++) { g.save(); g.translate(32, 32); g.rotate(k * Math.PI / 3 + 0.3); g.fillStyle = 'rgba(255,220,150,.7)'; g.beginPath(); g.moveTo(-2, 0); g.lineTo(0, -31); g.lineTo(2, 0); g.fill(); g.restore(); }
    return new THREE.CanvasTexture(c); })();
  const flashMat = new THREE.MeshBasicMaterial({ map: flashTex, color: new THREE.Color(4, 2.4, 1.1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  function take(w, mag) {
    if (held) unhold();
    const gun = WEAPONS[w].build(), ud = gun.userData; gun.traverse(m => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } });
    gun.matrixAutoUpdate = false; gun.visible = false;
    ud.handMag = ud.makeMag ? ud.makeMag() : null; if (ud.handMag) { ud.handMag.visible = false; ud.handMag.traverse(m => { if (m.isMesh) m.frustumCulled = false; }); }
    ud.chHome = ud.chargeHandle ? ud.chargeHandle.position.z : 0;
    const s = ud.suppressed ? 0.12 : ud.pistol ? 0.16 : ud.tube ? 0.42 : 0.3;   // the flash: a star across the muzzle and a flame along it (Betamax's sizes)
    const f1 = new THREE.Mesh(new THREE.PlaneGeometry(s, s), flashMat); f1.position.set(0, 0, (ud.muzzleZ || -0.6) - s * 0.3);
    const f2 = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.6, s * 1.8), flashMat); f2.rotation.y = Math.PI / 2; f2.position.copy(f1.position);
    gun.add(f1, f2); f1.visible = f2.visible = false; ud.flash = f1; ud.flash2 = f2;
    held = { w, ud, gun, mag: mag == null ? ud.magSize || 20 : mag, rl: null, nextAt: 0, drawn: true, name: WEAPONS[w].name };
    group.add(gun); hud(); foley('tug', 0.4, 1.2);
  }
  function unhold() { if (!held) return; group.remove(held.gun); const hm = held.ud.handMag; if (hm && hm.parent) hm.parent.remove(hm); held = null; trigger = false; aimOn = false; }
  function stow() { if (!held) return; held.drawn = !held.drawn; held.rl = null; trigger = false; aimOn = false; hud(); foley('tug', 0.35, held.drawn ? 1.2 : 0.9); o.hint(held.drawn ? `${held.name} drawn` : `${held.name} put away · Q draws it`, 2000); }
  function dropHeld() {
    if (!held) return; const me = o.me();
    const l = ['a' + (store.seq++).toString(36) + Math.random().toString(36).slice(2, 5), held.w, r3(me.x - Math.sin(me.yaw) * 1.2), r3(me.z - Math.cos(me.yaw) * 1.2), r3(Math.random() * 6.28)];
    unhold();
    store.lying.push(l); layDown(l, false); save(); if (o.send) o.send({ a: 'put', l }); hud();
  }
  function nearest() {
    const me = o.me(); let best = null, bd = REACH;
    camera.getWorldDirection(_d);
    for (const [uid, L] of lying) {
      const p = L.mesh.position, d = Math.hypot(p.x - me.x, p.z - me.z); if (d > bd) continue;
      _v.copy(p).sub(camera.position).normalize(); if (_v.dot(_d) < 0.55 && d > 1.0) continue;   // in front of you (or at your feet)
      bd = d; best = uid;
    }
    if (crate) {   // the crate, if no gun on the ground is nearer
      const d = Math.hypot(crate.x - me.x, crate.z - me.z) - 0.4;
      if (d < bd) { _v.set(crate.x, crate.y, crate.z).sub(camera.position).normalize(); if (_v.dot(_d) > 0.45 || d < 0.9) best = 'crate'; }
    }
    return best;
  }
  function pickUp(uid) {
    if (uid === 'crate') return fromCrate();
    const L = lying.get(uid); if (!L) return false;
    const i = store.lying.findIndex(l => l[0] === uid); if (i < 0) return false;
    const w = L.w; store.lying.splice(i, 1); group.remove(L.mesh); lying.delete(uid);
    if (held) dropHeld();
    take(w); save(); if (o.send) o.send({ a: 'take', u: uid });
    o.hint(`${WEAPONS[w].name} · ${WEAPONS[w].cal} · click fires, right button aims, R reloads, Q puts it away`, 5000);
    return true;
  }

  // ---------------------------------------------------------------- sound
  const bufs = {};
  function report(w, at, gain = 1) {
    const A = o.audio(); if (!A || !A.ctx || !A.master) return;
    const ac = A.ctx, ud = WEAPONS[w] && (held && held.w === w ? held.ud : null);
    const cal = ud ? ud.cal : CAL[w] ?? 1;
    if (!bufs[w]) bufs[w] = [0, 1, 2].map(k => { const d = synthRifle(mulberry32(300 + k * 7 + w.length * 31 + w.charCodeAt(0)), ac.sampleRate, cal); const b = ac.createBuffer(1, d.length, ac.sampleRate); b.copyToChannel(d, 0); return b; });
    const src = ac.createBufferSource(); src.buffer = bufs[w][(Math.random() * 3) | 0]; src.playbackRate.value = (RATE[w] || 1) * (0.98 + Math.random() * 0.04);
    const g = ac.createGain(); g.gain.value = 0.5 * gain * (GAIN[w] || 1);
    if (at) { const pn = ac.createPanner(); pn.panningModel = 'HRTF'; pn.distanceModel = 'inverse'; pn.refDistance = 6; pn.rolloffFactor = 0.8; pn.positionX ? (pn.positionX.value = at.x, pn.positionY.value = at.y, pn.positionZ.value = at.z) : pn.setPosition(at.x, at.y, at.z); src.connect(g); g.connect(pn); pn.connect(A.master); }
    else { src.connect(g); g.connect(A.master); }
    if (A.send) g.connect(A.send);
    src.start();
  }
  const imp = {};
  function thud(kind, at) {
    const A = o.audio(); if (!A || !A.ctx || !A.master) return; const ac = A.ctx;
    if (!imp[kind]) imp[kind] = [0, 1].map(k => { const d = synthImpact(mulberry32(90 + k + kind.length * 13), ac.sampleRate, kind); const b = ac.createBuffer(1, d.length, ac.sampleRate); b.copyToChannel(d, 0); return b; });
    const src = ac.createBufferSource(); src.buffer = imp[kind][(Math.random() * 2) | 0];
    const g = ac.createGain(); g.gain.value = 0.18; const pn = ac.createPanner(); pn.refDistance = 3; pn.rolloffFactor = 1;
    pn.positionX ? (pn.positionX.value = at.x, pn.positionY.value = at.y, pn.positionZ.value = at.z) : pn.setPosition(at.x, at.y, at.z);
    src.connect(g); g.connect(pn); pn.connect(A.master); src.start();
  }
  // each gun's sound numbers, for guns not in hand (someone else's)
  const CAL = {}, RATE = {}, GAIN = {}, UD = {};   // (UD: each gun's numbers and points, for the guns in other hands)
  for (const w of GUN_IDS) { try { const g = WEAPONS[w].build(); UD[w] = g.userData; CAL[w] = g.userData.cal; RATE[w] = g.userData.rate; GAIN[w] = g.userData.gainK; } catch (e) {} }
  // handling noises, synthesized as Betamax does them: a few short struck, damped partials over a little noise
  const FOLEY = { magOut: [[0, 0.5, 2400], [0.03, 0.3, 900]], magIn: [[0, 0.9, 1600], [0.012, 0.6, 3800], [0.05, 0.3, 700]], tug: [[0, 0.3, 1200]],
    bolt: [[0, 1.0, 900], [0.004, 0.8, 4200], [0.03, 0.4, 300]], rack: [[0, 0.7, 2000], [0.09, 1.0, 1000], [0.1, 0.6, 4000]], drop: [[0, 0.5, 400], [0.06, 0.25, 600]], click: [[0, 0.5, 3000], [0.002, 0.3, 6000]] };
  const fbufs = {};
  function foley(name, gain = 0.5, rate = 1) {
    const A = o.audio(); if (!A || !A.ctx || !A.master || !FOLEY[name]) return; const ac = A.ctx, sr = ac.sampleRate;
    if (!fbufs[name]) { const b = ac.createBuffer(1, Math.floor(0.25 * sr), sr), d = b.getChannelData(0), r = mulberry32(name.length * 131);
      for (let i = 0; i < d.length; i++) { const t = i / sr; let v = 0; for (const [t0, amp, f] of FOLEY[name]) { const dt = t - t0; if (dt < 0) continue; v += amp * Math.exp(-dt / 0.012) * (Math.sin(2 * Math.PI * f * dt) * 0.6 + (r() * 2 - 1) * 0.5); } d[i] = v * 0.7; }
      fbufs[name] = b; }
    const src = ac.createBufferSource(); src.buffer = fbufs[name]; src.playbackRate.value = rate; const g = ac.createGain(); g.gain.value = gain * 0.6; src.connect(g); g.connect(A.master); src.start();
  }

  // ---------------------------------------------------------------- what a shot shows: flash, tracer, puff
  const flash = new THREE.PointLight(0xffc070, 0, 9, 2); group.add(flash);
  const fx = [];   // { obj, t, life, kind }
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false });
  function tracer(a, b) {
    const g = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]), line = new THREE.Line(g, tracerMat.clone());
    group.add(line); fx.push({ obj: line, t: 0, life: 0.07, kind: 'line' });
  }
  const softTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();   // a soft round puff, not a square
  const puffMat = new THREE.SpriteMaterial({ map: softTex, color: 0xcfc4b0, transparent: true, opacity: 0.7, depthWrite: false });
  const sparkMat = new THREE.SpriteMaterial({ map: softTex, color: 0xffd080, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const leafMat = new THREE.SpriteMaterial({ map: softTex, color: 0x5f7a3a, transparent: true, opacity: 0.85, depthWrite: false });
  const bloodMat = new THREE.SpriteMaterial({ map: softTex, color: 0x9fe8ff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });   // the suit's glow, not blood
  function puff(at, kind, n = 6) {
    const mat = kind === 'spark' ? sparkMat : kind === 'leaf' ? leafMat : kind === 'suit' ? bloodMat : puffMat;
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(mat.clone()); s.position.copy(at); const k = kind === 'spark' ? 0.03 : 0.09; s.scale.setScalar(k * (0.6 + Math.random()));
      s.userData.v = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.6 + 0.3, (Math.random() - 0.5) * 2).multiplyScalar(kind === 'spark' ? 2.5 : 0.8);
      group.add(s); fx.push({ obj: s, t: 0, life: kind === 'spark' ? 0.25 : 0.9 + Math.random() * 0.5, kind: 'sprite', grow: kind === 'spark' ? 0 : 0.35 });
    }
  }
  function stepFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; f.t += dt; const u = f.t / f.life;
      if (u >= 1) { group.remove(f.obj); f.obj.geometry && f.kind === 'line' && f.obj.geometry.dispose(); f.obj.material.dispose(); fx.splice(i, 1); continue; }
      if (f.kind === 'line') f.obj.material.opacity = 0.9 * (1 - u);
      else { const v = f.obj.userData.v; f.obj.position.addScaledVector(v, dt); v.y -= 2.0 * dt; v.multiplyScalar(Math.exp(-dt * 2)); f.obj.material.opacity = (1 - u) * (f.grow ? 0.6 : 1); f.obj.scale.multiplyScalar(1 + f.grow * dt); }
    }
    flash.intensity *= Math.exp(-dt * 60);
  }

  // ---------------------------------------------------------------- the shot itself
  const players = () => (o.players ? o.players() : []);
  // a ray against a standing body: the trunk a capsule, the head a ball. -> { d, head } or null
  function hitBody(O, D, p, maxD) {
    let best = null;
    // head
    _v.set(p.x, p.gy + 1.64, p.z).sub(O); const tc = _v.dot(D);
    if (tc > 0) { const d2 = _v.lengthSq() - tc * tc, r = 0.16; if (d2 < r * r) { const t = tc - Math.sqrt(r * r - d2); if (t < maxD) best = { d: t, head: true }; } }
    // trunk: the vertical segment from 0.25 to 1.45 m, radius 0.3 (closest approach of two lines)
    const ax = p.x - O.x, az = p.z - O.z, dd = D.x * D.x + D.z * D.z;
    if (dd > 1e-6) {
      const t = (ax * D.x + az * D.z) / dd, cx = O.x + D.x * t - p.x, cz = O.z + D.z * t - p.z, h2 = cx * cx + cz * cz, r = 0.3;
      if (h2 < r * r && t > 0) { const back = Math.sqrt((r * r - h2) / dd), t0 = t - back, y = O.y + D.y * t0 - p.gy;
        if (y > 0.25 && y < 1.45 && t0 < maxD && (!best || t0 < best.d)) best = { d: t0, head: false }; }
    }
    return best;
  }
  const felled = new Set(), treeDmg = new Map(), plantDmg = new Map(), lampOut = new Set();
  function hitTrunk(O, D, maxD) {
    let best = null;
    for (const T of o.trees()) {
      if (T.id != null && felled.has(T.id)) continue;
      const ax = T.x - O.x, az = T.z - O.z, dd = D.x * D.x + D.z * D.z; if (dd < 1e-6) continue;
      const t = (ax * D.x + az * D.z) / dd; if (t < 0 || t > maxD) continue;
      const cx = O.x + D.x * t - T.x, cz = O.z + D.z * t - T.z, h2 = cx * cx + cz * cz, r = T.r; if (h2 > r * r) continue;
      const t0 = t - Math.sqrt((r * r - h2) / dd), y = O.y + D.y * t0 - T.gy;
      if (y > 0 && y < T.top && (!best || t0 < best.d)) best = { d: t0, kind: 'tree', T, y };
    }
    return best;
  }
  function hitGround(O, D, maxD) {
    let prev = 0;
    for (let t = 0.3; t < maxD; t += t < 20 ? 0.2 : 0.6) {
      const x = O.x + D.x * t, y = O.y + D.y * t, z = O.z + D.z * t, wy = o.waterAt ? o.waterAt(x, z) : null;
      if (wy != null && y < wy && D.y < 0 && o.heightAt(x, z) < wy) { const tw = (wy - O.y) / D.y; return { d: Math.max(0.3, Math.min(t, Math.max(prev, tw))), kind: 'water' }; }
      if (y < o.heightAt(x, z)) { let a = prev, b = t; for (let k = 0; k < 8; k++) { const m = (a + b) / 2; if (O.y + D.y * m < o.heightAt(O.x + D.x * m, O.z + D.z * m)) b = m; else a = m; } return { d: b, kind: 'ground' }; }
      if (y < o.heightAt(x, z) + 1.4 && o.blocked(x, z) && wy == null && !(o.notHedge && o.notHedge(x, z)) && !o.trees().some(T => Math.abs(T.x - x) < T.r + 0.8 && Math.abs(T.z - z) < T.r + 0.8) && !(o.lamps && o.lamps().some(L => Math.hypot(L[0] - x, L[2] - z) < 0.6))) return { d: t, kind: 'hedge' };   // (blocked ground that's a hedge: not the rim of the water, a trunk's or a lamp's foot)
      prev = t;
    }
    return null;
  }
  // the lamp posts: a glass head (a ball, near enough) on an iron post
  function hitLamp(O, D, maxD) {
    if (!o.lamps) return null; let best = null;
    o.lamps().forEach(([x, y, z], i) => {
      _v.set(x, y, z).sub(O); const tc = _v.dot(D);
      if (tc > 0 && !lampOut.has(i)) { const d2 = _v.lengthSq() - tc * tc, r = 0.2; if (d2 < r * r) { const t = tc - Math.sqrt(r * r - d2); if (t < maxD && (!best || t < best.d)) best = { d: t, kind: 'lamp', i }; } }
      const ax = x - O.x, az = z - O.z, dd = D.x * D.x + D.z * D.z; if (dd < 1e-6) return;
      const t = (ax * D.x + az * D.z) / dd, cx = O.x + D.x * t - x, cz = O.z + D.z * t - z, h2 = cx * cx + cz * cz, r = 0.07;
      if (t > 0 && h2 < r * r) { const t0 = t - Math.sqrt((r * r - h2) / dd), yy = O.y + D.y * t0; if (yy < y - 0.15 && yy > o.heightAt(x, z) && t0 < maxD && (!best || t0 < best.d)) best = { d: t0, kind: 'post', i, c: [x, z] }; }
    });
    return best;
  }
  function hitCrate(O, D, maxD) {   // the demo crate: a box, in its own frame
    if (!crate) return null; const g = crate.g, c = Math.cos(-g.rotation.y), s = Math.sin(-g.rotation.y);
    const ox = O.x - g.position.x, oz = O.z - g.position.z, lo = [ox * c - oz * s, O.y - g.position.y, ox * s + oz * c], ld = [D.x * c - D.z * s, D.y, D.x * s + D.z * c];
    const mn = [-0.63, 0, -0.32], mx = [0.63, 0.47, 0.32]; let t0 = 0, t1 = maxD, ax = -1;
    for (let k = 0; k < 3; k++) { if (Math.abs(ld[k]) < 1e-8) { if (lo[k] < mn[k] || lo[k] > mx[k]) return null; continue; }
      let a = (mn[k] - lo[k]) / ld[k], b = (mx[k] - lo[k]) / ld[k]; if (a > b) [a, b] = [b, a]; if (a > t0) { t0 = a; ax = k; } t1 = Math.min(t1, b); if (t0 > t1) return null; }
    if (ax < 0) return null;
    const nl = [0, 0, 0]; nl[ax] = -Math.sign(ld[ax]); const n = new THREE.Vector3(nl[0], nl[1], nl[2]).applyAxisAngle(UP, g.rotation.y);
    return { d: t0, kind: 'crate', n };
  }
  const groundN = (x, z, out = new THREE.Vector3()) => { const e = 0.15; return out.set(o.heightAt(x - e, z) - o.heightAt(x + e, z), 2 * e, o.heightAt(x, z - e) - o.heightAt(x, z + e)).normalize(); };
  // how big a round's mark and spray are, by calibre (a pellet much less)
  const calK = (cal, pellet) => pellet ? 0.35 : [0.8, 1, 1.3, 1.8][cal] || 1;
  /** What a round does where it lands: the mark, the spray, the sound. (Ours and the others' alike; what it destroys is decided by the shooter.) */
  function impact(kind, at, n, D, k, mesh, first) {
    const holeAt = (m, size) => havoc.hole(m, at, n, size, mesh);
    if (kind === 'ground' || kind === 'plant') {
      holeAt('soil', 0.08 + 0.09 * k); havoc.spray('soil', at, n, D, null, k); puff(at, 'dust', 4);
      if (kind === 'plant') { havoc.spray('leaf', at.clone().add(_w.set(0, 0.25, 0)), n, D, 12); havoc.spray('petal', at.clone().add(_w.set(0, 0.35, 0)), n, D, 8); }
      if (first) havoc.thud('iSand', at);
    } else if (kind === 'water') { havoc.splash(at, k); if (first) havoc.thud('iWater', at, 0.25); }
    else if (kind === 'hedge') { havoc.spray('leaf', at, n, D, 16, k); puff(at, 'leaf', 4); if (first) havoc.thud('iSand', at, 0.12, 1.3); }
    else if (kind === 'tree' || kind === 'crate') { holeAt('wood', 0.03 + 0.03 * k); havoc.spray('wood', at, n, D, null, k); if (kind === 'tree') havoc.spray('bark', at, n, D, null, k); if (first) havoc.thud('iHard', at, 0.2, 0.7); }
    else if (kind === 'piece' || kind === 'junk') { holeAt(kind === 'junk' ? 'metal' : 'stone', 0.03 + 0.025 * k); havoc.spray('stone', at, n, D, null, k); if (kind === 'junk') havoc.spray('metal', at, n, D, null, k); puff(at, 'spark', 6); puff(at, 'dust', 3); if (first) havoc.thud('iHard', at); }
    else if (kind === 'post') { holeAt('metal', 0.025 + 0.015 * k); havoc.spray('metal', at, n, D, 5); puff(at, 'spark', 10); if (first) havoc.thud('iHard', at, 0.25, 1.4); }
    else if (kind === 'lamp') { havoc.spray('glass', at, n, D, 30); havoc.glass(at); puff(at, 'spark', 12); }
    else if (kind === 'body') puff(at, 'suit', 3);
  }
  function fire() {
    const h = held, ud = h.ud, now = performance.now() / 1000;
    if (h.rl) return;
    if (h.mag <= 0) { foley('click', 0.5); trigger = false; reload(); return; }
    h.mag--; h.nextAt = now + 60 / (ud.rpm || 600); lastShot = now; hud();
    const O = camera.getWorldPosition(new THREE.Vector3()); camera.getWorldDirection(_d);
    const moving = o.moving ? o.moving() : 0;
    const spread = (0.022 * (1 - aiming) + 0.0025 * aiming + moving * 0.012 + recoil * 0.2) * (ud.spread || 1) + ((ud.pellets || 1) > 1 ? 0.045 : 0);
    const muzzle = muzzleWorld(new THREE.Vector3());
    const shots = [];
    for (let k = 0; k < (ud.pellets || 1); k++) {
      const D = _d.clone(); const a = Math.random() * Math.PI * 2, r = spread * Math.sqrt(Math.random());
      _w.set(1, 0, 0).applyQuaternion(camera.quaternion); _v.set(0, 1, 0).applyQuaternion(camera.quaternion);
      D.addScaledVector(_w, Math.cos(a) * r).addScaledVector(_v, Math.sin(a) * r).normalize();
      shots.push(trace(O, D, ud, k === 0));
    }
    // what the others see and hear: from your muzzle to where each round landed, and what it landed in
    if (o.send) o.send({ a: 'shot', w: h.w, f: [r3(muzzle.x), r3(muzzle.y), r3(muzzle.z)], e: shots.slice(0, 4).map(s => [r3(s.at.x), r3(s.at.y), r3(s.at.z), KC[s.kind] || 'g']) });
    for (const s of shots.slice(0, 3)) tracer(muzzle, s.at);
    flash.position.copy(muzzle); flash.intensity = 6; flashT = 0.05; if (ud.flash) { ud.flash.rotation.z = Math.random() * 6.28; }
    report(h.w, null, 1);
    // the brass (a red hull from the Benelli), out of the port to the right
    { const g = h.gun.matrix, fw = ud.bullpup ? 0.12 : ud.pistol ? -0.02 : -0.06;
      _o.set(0.03, 0.025, fw).applyMatrix4(g); _v.set(2.2 + Math.random(), 1.4 + Math.random(), 0.6 + Math.random() * 0.6).transformDirection(g).multiplyScalar(2.2 + Math.random());
      havoc.brass(_o, _v, (ud.cal || 0) >= 1, !!ud.tube); }
    recoil = Math.min(1, recoil + (ud.kick || 0.025) * 6);
    if (o.kick) o.kick((ud.kick || 0.025) * (1 - 0.5 * aiming) * (0.7 + Math.random() * 0.6), (Math.random() - 0.5) * (ud.kick || 0.025) * 0.5);
  }
  // one round: the nearest of a body, a stone or piece of junk, a trunk, a lamp, the crate, the water, the ground or a hedge
  function trace(O, D, ud, first) {
    const maxD = 400, pellet = (ud.pellets || 1) > 1, k = calK(ud.cal, pellet), dmg = ud.dmg || 40; let d = maxD, hit = null;
    const g = hitGround(O, D, maxD); if (g) { d = g.d; hit = g; }
    const tr = hitTrunk(O, D, d); if (tr && tr.d < d) { d = tr.d; hit = tr; }
    const lp = hitLamp(O, D, d); if (lp && lp.d < d) { d = lp.d; hit = lp; }
    const cr = hitCrate(O, D, d); if (cr && cr.d < d) { d = cr.d; hit = cr; }
    let who = null;
    for (const p of players()) { if (p.down) continue; const b = hitBody(O, D, p, d); if (b && b.d < d) { d = b.d; who = { p, head: b.head }; hit = { kind: 'body' }; } }
    if (!who) { const pc = o.walling && o.walling.shoot ? o.walling.shoot(O, D, d, pellet ? 1.6 : MOMENTUM[ud.cal] || 7) : null; if (pc && pc.d < d) { d = pc.d; hit = { kind: pc.junk ? 'junk' : 'piece', n: pc.n, mesh: pc.mesh }; } }
    const at = O.clone().addScaledVector(D, d);
    if (!hit) return { at, kind: null };
    let kind = hit.kind, n = hit.n || null;
    if (kind === 'ground') {
      n = groundN(at.x, at.z);
      // a plant where it lands: the round goes through it; enough of them and it's destroyed
      const rec = o.plants && o.plants.near(at.x, at.z, pellet ? 0.22 : 0.3);
      if (rec && !rec.tree) {
        kind = 'plant'; const key = rec.garden ? 'g' + rec.id : 'o' + rec.id, left = (plantDmg.has(key) ? plantDmg.get(key) : 40 + 40 * Math.min(1, rec.size || 0.5)) - dmg;
        plantDmg.set(key, left); if (left <= 0) { plantDmg.delete(key); o.plants.destroy(rec); havoc.spray('leaf', at.clone().add(_w.set(0, 0.3, 0)), UP, null, 30); havoc.spray('petal', at.clone().add(_w.set(0, 0.45, 0)), UP, null, 24); }
      }
    }
    if (kind === 'tree') {
      const T = hit.T; n = _w.set(at.x - T.x, 0, at.z - T.z).normalize().clone();
      if (T.id != null && o.arborTree) {   // one you planted: cut through, it falls (the wood a round takes out goes as the trunk's cross-section)
        const hp0 = 120 * (T.r / 0.05) ** 2, left = (treeDmg.has(T.id) ? treeDmg.get(T.id) : hp0) - dmg; treeDmg.set(T.id, left);
        if (left <= 0) fellTree(T, D, true);
      }
    }
    if (kind === 'post') n = _w.set(at.x - hit.c[0], 0, at.z - hit.c[1]).normalize().clone();
    if (kind === 'lamp' && !lampOut.has(hit.i)) { lampOut.add(hit.i); if (o.breakLamp) o.breakLamp(hit.i); if (o.send) o.send({ a: 'lamp', i: hit.i }); }
    if (!n) n = D.clone().negate();
    impact(kind, at, n, D, k, hit.mesh || null, first);
    if (who) {
      const dm = who.head ? (ud.head || ud.dmg * 3) : ud.dmg, p = who.p, y = at.y - p.gy, an = Math.atan2(at.z - p.z, at.x - p.x), dl = Math.hypot(D.x, D.z) || 1;
      const m = { a: 'hit', to: p.id, d: Math.round(dm), h: who.head ? 1 : 0, w: held.w, y: r3(y), an: r3(an), dx: r3(D.x / dl), dz: r3(D.z / dl), k: r3(k) };
      if (o.send) o.send(m);
      if (p.body) bodyHit(p.body, p, m);
      marker(who.head);
    }
    return { at, kind };
  }
  // ---------------------------------------------------------------- a body shot: it flinches, the suit is holed and leaks, a visor cracks
  let lastRay = null; const marksOf = new Map(), vents = [], _rc = new THREE.Raycaster(), vaporMat = new THREE.SpriteMaterial({ map: softTex, color: 0xeef6ff, transparent: true, opacity: 0.55, depthWrite: false });
  function bodyHit(body, p, m) {
    const head = !!m.h, y = +m.y, an = +m.an, dx = +m.dx, dz = +m.dz; if (![y, an, dx, dz].every(isFinite)) return;
    body.react && body.react(dx, dz, (+m.k || 1) * (head ? 1.3 : 1));
    // where on the suit: from outside the body toward its axis (or the helmet's centre), onto the suit itself
    const c = head ? new THREE.Vector3(p.x, p.gy + 1.64, p.z) : new THREE.Vector3(p.x, p.gy + y, p.z);
    const out = head ? new THREE.Vector3(Math.cos(an), (y - 1.64) / 0.16, Math.sin(an)).normalize() : new THREE.Vector3(Math.cos(an), 0, Math.sin(an));
    body.root.updateMatrixWorld(true); _rc.set(c.clone().addScaledVector(out, 0.8), out.clone().negate()); _rc.far = 1.2;
    const hits = _rc.intersectObject(body.root, true).filter(h => h.object.isMesh && h.object.visible && !h.object.isSprite);
    lastRay = hits.slice(0, 6).map(h => [h.distance.toFixed(3), h.point.z.toFixed(3), h.object.parent && (h.object.parent.name || h.object.parent.type), h.object.material.side, h.object.material.type, h.object.geometry.attributes.position.count, h.object.renderOrder]);
    let at = c.clone().addScaledVector(out, head ? 0.16 : 0.22), n = out.clone(), parent = null;
    if (hits.length) { const h = hits[0]; at.copy(h.point); if (h.face) n.copy(h.face.normal).transformDirection(h.object.matrixWorld); if (n.dot(out) < 0) n.negate(); parent = h.object.isSkinnedMesh ? null : h.object; }
    if (!parent && hits.length) { const B = body.bones || {}; parent = head ? B.head : y > 0.95 ? B.torso : B.pelvis || body.root; }
    const mk = parent ? havoc.hole(head ? 'crack' : 'suit', at, n, head ? 0.26 : 0.12, parent) : null;   // (no mark where the round only grazed the suit's outline)
    if (mk) { if (!marksOf.has(body)) marksOf.set(body, []); marksOf.get(body).push(mk); vents.push({ mk, until: performance.now() / 1000 + (head ? 4 : 3), next: 0 }); }
    havoc.thud('iBody', at, 0.3); havoc.hiss(at, head ? 1.3 : 1);
    puff(at, 'suit', 4);
  }
  function clearMarks(body) { const L = body && marksOf.get(body); if (!L) return; for (const mk of L) if (mk.parent) mk.parent.remove(mk); marksOf.delete(body); }
  function stepVapor(dt) {   // air out of the holes: a thin jet, thinning as the suit's pressure goes
    const now = performance.now() / 1000;
    for (let i = vents.length - 1; i >= 0; i--) {
      const V = vents[i]; if (now > V.until || !V.mk.parent) { vents.splice(i, 1); continue; }
      if (now < V.next) continue; V.next = now + 0.05;
      V.mk.updateMatrixWorld(); const P = _v.setFromMatrixPosition(V.mk.matrixWorld), N = _w.set(0, 0, 1).transformDirection(V.mk.matrixWorld), left = (V.until - now) / 3;
      const sp = new THREE.Sprite(vaporMat.clone()); sp.position.copy(P); sp.scale.setScalar(0.03 + 0.03 * Math.random());
      sp.userData.v = N.clone().multiplyScalar(0.8 + 1.4 * left).add(_o.set(Math.random() - 0.5, Math.random() * 0.3, Math.random() - 0.5).multiplyScalar(0.25));
      group.add(sp); fx.push({ obj: sp, t: 0, life: 0.6 + 0.4 * Math.random(), kind: 'sprite', grow: 1.6 });
    }
  }
  function fellTree(T, D, mine) {
    if (felled.has(T.id)) return; felled.add(T.id);
    const tree = o.arborTree(T.id); if (!tree) return;
    const foot = new THREE.Vector3(tree.x, tree.gy, tree.z);
    havoc.fell([tree.wood, tree.leaves].filter(Boolean), foot, D.x, D.z, tree.H, mine ? () => { if (o.plants) o.plants.destroy({ id: T.id, x: tree.x, z: tree.z, tree: true }); } : null);
    if (mine && o.send) o.send({ a: 'fell', x: r3(tree.x), z: r3(tree.z), dx: r3(D.x), dz: r3(D.z) });
    if (mine) o.hint('timber!', 2500);
  }
  function muzzleWorld(out) {
    if (!held) return out.copy(camera.position);
    const g = held.gun; g.updateMatrixWorld(); return out.set(0, 0, held.ud.muzzleZ || -0.6).applyMatrix4(g.matrixWorld);
  }

  // ---------------------------------------------------------------- reloading: Betamax's timeline, played on your own arms
  function reload() {
    const h = held; if (!h || h.rl || !h.drawn || downUntil) return;
    const ud = h.ud, size = ud.magSize || 20;
    if (h.mag >= size + (ud.tube ? 0 : 1) || (ud.tube && h.mag >= size)) return;
    const tac = h.mag > 0, missing = size - h.mag;
    let dur = 2.2; try { dur = reloadDuration(ud, tac, missing) || 2.2; } catch (e) {}
    h.rl = { t: 0, dur, tac, o: { gunOff: new THREE.Vector3(), gunRot: new THREE.Euler(), path: null, magState: 'in', events: [], jolt: 0, seat: 0, missing } };
    trigger = false; hud('reloading'); if (o.send) o.send({ a: 'rl', tac: tac ? 1 : 0, m: missing });
  }
  function reloadEvent(name) {
    const h = held; if (!h) return; const ud = h.ud;
    if (name === 'drop') {   // the empty one falls out of the well and lies where it lands
      foley('magOut', 0.5);
      if (ud.mag && ud.makeMag) { ud.mag.updateMatrixWorld(true); const m = ud.makeMag(); ud.mag.matrixWorld.decompose(m.position, m.quaternion, m.scale); havoc.prop(m, _v.set((Math.random() - 0.5) * 0.4, -0.8, (Math.random() - 0.5) * 0.4), _w.set(Math.random() * 6 - 3, Math.random() * 4, 2)); }
    }
    else if (name === 'magOut') foley('magOut', 0.45); else if (name === 'magIn') foley('magIn', 0.7); else if (name === 'tug') foley('tug', 0.35);
    else if (name === 'shell') { foley('magIn', 0.45, 1.4); h.mag = Math.min(ud.magSize || 6, h.mag + 1); hud('reloading'); }
    else if (name === 'bolt') foley('bolt', 0.8); else if (name === 'rack') foley('rack', 0.8);
  }
  // where the left hand goes on its way through a reload: points on the gun, or (the pouch, the pocket) about you
  function lhPoint(ud, name, out) {
    switch (name) {
      case 'pouch': out.eye = true; return out.v.set(-0.06, -0.45, -0.2);
      case 'pocket': out.eye = true; return out.v.set(-0.28, -0.5, -0.06);
      case 'below': return out.v.copy(ud.magwell || ud.support).add(_w.set(0, -0.13, 0.02));
      case 'well': return out.v.copy(ud.magwell || ud.support).add(_w.set(0, -0.06, 0));
      case 'catch': return out.v.copy(ud.boltCatch || ud.support);
      case 'charge': return out.v.copy(ud.charge || ud.support);
      case 'chargeBack': return out.v.copy(ud.charge || ud.support).add(_w.set(0, 0, 0.08));
      default: return out.v.copy(ud.support);
    }
  }
  /** The hold this frame for a body: the gun's place in the eye's frame and the hands' points, through a reload if one is under way. */
  function holdSpec(ud, spec, aimK, rec, R) {
    if (!spec) spec = { off: new THREE.Vector3(), rot: new THREE.Euler(), grip: ud.grip || new THREE.Vector3(0.012, -0.095, 0.065), sup: ud.support || new THREE.Vector3(-0.03, -0.05, -0.28), lh: null, _a: { v: new THREE.Vector3(), eye: false }, _b: { v: new THREE.Vector3(), eye: false }, _lh: {} };
    // at the hip: where the suit's arms (shorter than Betamax's view-model arms) can hold it, the stock against the right of the chest
    const hipP = ud.pistol ? _o.set(0.05, -0.17, -0.34) : _o.set(0.09, -0.21, -0.26);
    spec.off.lerpVectors(hipP, _v.set(0, -(ud.sightY || 0.05), -(ud.eyeZ || 0.25)), aimK); spec.off.z += rec * 0.05; spec.off.y -= rec * 0.01;
    spec.rot.set(rec * 0.12, 0.02 * (1 - aimK), 0); spec.lh = null;
    if (R && R.o.path) {
      const ro = R.o; spec.off.add(ro.gunOff); spec.off.z += ro.jolt * 0.02; spec.rot.x += ro.gunRot.x + ro.jolt * 0.04; spec.rot.y += ro.gunRot.y; spec.rot.z += ro.gunRot.z;
      const [a, b, k] = pathPoint(ro.path, R.t); spec._a.eye = spec._b.eye = false; lhPoint(ud, a, spec._a); lhPoint(ud, b, spec._b);
      const L = spec._lh; L.a = spec._a.v; L.b = spec._b.v; L.aEye = spec._a.eye; L.bEye = spec._b.eye; L.k = k; spec.lh = L;
    }
    return spec;
  }
  let mySpec = null;
  // ---------------------------------------------------------------- being shot (in a room)
  let hp = HP, downUntil = 0, downAt = 0, hurtAt = -9, hurt = 0, myDir = [0, 1], byName = '';
  // Down: you lie where you fell, the view stepped out to see yourself, until you choose to get up: there, or back at the gate.
  function onHit(from, m) {
    if (!o.canBeShot() || downUntil) return;
    hp -= Math.max(0, Math.min(400, +m.d || 0)); hurtAt = performance.now() / 1000; hurt = Math.min(1, hurt + 0.5 + (m.h ? 0.4 : 0));
    if (isFinite(m.dx) && isFinite(m.dz)) myDir = [+m.dx, +m.dz];
    if (o.kick) o.kick(0.03 + (m.h ? 0.05 : 0), (Math.random() - 0.5) * 0.06);   // knocked: the view jolts
    if (m.h) crack(true);
    if (hp <= 0) {
      hp = 0; downUntil = 1; downAt = hurtAt; trigger = false; aimOn = false; if (held) held.rl = null;
      byName = o.nameOf ? o.nameOf(from) : '';
      if (o.send) o.send({ a: 'down', by: from, dx: r3(myDir[0]), dz: r3(myDir[1]) });
      downEl.querySelector('.by').textContent = (m.h ? 'head shot' : 'shot down') + (byName ? ` by ${byName}` : '');
    }
    hud();
  }
  function getUp(atGate) {
    if (!downUntil || performance.now() / 1000 - downAt < 1.2) return false;
    downUntil = 0; hp = HP; if (atGate) o.respawn(); downEl.style.opacity = 0; downEl.style.pointerEvents = 'none'; crack(false);
    clearMarks(o.body); if (o.send) o.send({ a: 'up' }); hud(); return true;
  }
  // ---------------------------------------------------------------- the HUD: health, rounds, the hit marker, the red at the edges
  const css = document.createElement('style');
  css.textContent = `#armsHud { position:fixed; right:calc(18px + env(safe-area-inset-right)); bottom:calc(18px + env(safe-area-inset-bottom)); z-index:6; font:12px/1.3 "IBM Plex Mono",ui-monospace,monospace; color:#e9e4da; text-align:right; pointer-events:none; text-shadow:0 1px 3px rgba(0,0,0,.7); opacity:0; transition:opacity .3s; }
    #armsHud b { font-size:26px; font-weight:500; letter-spacing:.02em; } #armsHud .hp { display:inline-block; width:120px; height:5px; background:rgba(233,228,218,.2); border-radius:3px; overflow:hidden; vertical-align:middle; margin-left:8px; }
    #armsHud .hp i { display:block; height:100%; background:#9fe8ff; }
    body.tui #armsHud { bottom:calc(240px + env(safe-area-inset-bottom)); right:calc(100px + env(safe-area-inset-right)); }
    #armsCross { position:fixed; left:50%; top:50%; width:22px; height:22px; margin:-11px 0 0 -11px; z-index:6; pointer-events:none; opacity:0; }
    #armsCross:before, #armsCross:after { content:''; position:absolute; background:rgba(233,228,218,.85); box-shadow:0 0 2px rgba(0,0,0,.8); }
    #armsCross:before { left:10px; top:0; width:2px; height:22px; } #armsCross:after { top:10px; left:0; height:2px; width:22px; }
    #armsCross.hit:before, #armsCross.hit:after { background:#ff5a4a; } #armsCross { clip-path: polygon(0 0,100% 0,100% 100%,0 100%,0 0, 35% 35%, 35% 65%, 65% 65%, 65% 35%, 35% 35%); }
    #armsHurt { position:fixed; inset:0; z-index:5; pointer-events:none; box-shadow: inset 0 0 160px 40px rgba(200,20,20,.9); opacity:0; }
    #armsDown { position:fixed; inset:0; z-index:7; pointer-events:none; background:radial-gradient(ellipse at center, rgba(20,0,0,0) 40%, rgba(40,0,0,.55)); opacity:0; transition:opacity .4s; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; padding-bottom:calc(12vh + env(safe-area-inset-bottom)); font:500 30px 'Cormorant Garamond',Georgia,serif; color:#e9e4da; text-shadow:0 1px 6px rgba(0,0,0,.8); }
    #armsDown .by { font:13px/1.4 "IBM Plex Mono",ui-monospace,monospace; opacity:.8; margin:4px 0 16px; }
    #armsDown .row { display:flex; gap:12px; } #armsDown button { font:14px "IBM Plex Mono",ui-monospace,monospace; color:#e9e4da; background:rgba(20,18,16,.72); border:1px solid rgba(233,228,218,.45); border-radius:22px; padding:11px 18px; cursor:pointer; }
    #armsDown button:hover { background:rgba(60,54,48,.85); } #armsDown button:disabled { opacity:.35; cursor:default; } #armsDown kbd { opacity:.6; font-size:11px; margin-left:6px; }
    #armsCrack { position:fixed; inset:0; z-index:5; pointer-events:none; opacity:0; transition:opacity .15s; }`;
  document.head.append(css);
  const hudEl = document.createElement('div'); hudEl.id = 'armsHud'; const cross = document.createElement('div'); cross.id = 'armsCross';
  const hurtEl = document.createElement('div'); hurtEl.id = 'armsHurt'; const downEl = document.createElement('div'); downEl.id = 'armsDown';
  downEl.innerHTML = '<div>down</div><div class="by"></div><div class="row"><button data-up="here">get up here<kbd>E</kbd></button><button data-up="gate">back to the gate<kbd>G</kbd></button></div>';
  for (const b of downEl.querySelectorAll('button')) { const go = e => { e.preventDefault(); e.stopPropagation(); getUp(b.dataset.up === 'gate'); }; b.addEventListener('click', go); b.addEventListener('touchend', go); b.addEventListener('mousedown', e => e.stopPropagation()); b.addEventListener('pointerdown', e => e.stopPropagation()); }
  // a head shot cracks your visor: the cracks stay until you're up again
  const crackEl = document.createElement('div'); crackEl.id = 'armsCrack';
  function crack(on) {
    if (!on) { crackEl.style.opacity = 0; crackEl.innerHTML = ''; return; }
    const W = innerWidth, H = innerHeight, cx = W * (0.3 + 0.4 * Math.random()), cy = H * (0.25 + 0.4 * Math.random()); let d = '';
    for (let k = 0; k < 11; k++) { let a = k / 11 * 6.28 + Math.random() * 0.4, x = cx, y = cy; d += `M${cx},${cy}`; for (let j = 0; j < 5; j++) { a += (Math.random() - 0.5) * 0.6; const L = 30 + Math.random() * 90; x += Math.cos(a) * L; y += Math.sin(a) * L; d += `L${x.toFixed(0)},${y.toFixed(0)}`; } }
    for (let r of [18, 45, 80]) { d += `M${cx + r},${cy}`; for (let k = 1; k <= 14; k++) { const a = k / 14 * 6.28, rr = r * (0.8 + 0.4 * Math.random()); d += `L${(cx + Math.cos(a) * rr).toFixed(0)},${(cy + Math.sin(a) * rr).toFixed(0)}`; } }
    crackEl.innerHTML += `<svg width="${W}" height="${H}" style="position:absolute;inset:0"><path d="${d}" fill="none" stroke="rgba(235,245,255,.75)" stroke-width="1.2"/><path d="${d}" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="2.6" transform="translate(1,1)"/></svg>`;
    crackEl.style.opacity = 1;
  }
  document.body.append(hudEl, cross, hurtEl, downEl, crackEl);
  function hud(state) {
    const on = !!(held && held.drawn) || hp < HP;
    hudEl.style.opacity = on ? 1 : 0;
    hudEl.innerHTML = (held ? `${held.name}<br><b>${(state === 'reloading' || held.rl) && !held.ud.tube ? '··' : held.mag}</b> / ${held.ud.magSize || 20}<br>` : '') + `<span class="hp"><i style="width:${hp}%"></i></span>`;
  }
  let markT = 0; function marker(head) { cross.classList.add('hit'); markT = head ? 0.35 : 0.2; }

  // ---------------------------------------------------------------- each frame
  let hintFor = null;
  function update(dt) {
    const now = performance.now() / 1000;
    // guns falling out of the wormhole's air onto the ground
    for (const L of lying.values()) if (L.fall) { L.vy -= 4.2 * dt; L.mesh.position.y += L.vy * dt; const floor = L.gy + L.mesh.userData.lift; if (L.mesh.position.y <= floor) { L.mesh.position.y = floor; if (L.vy < -2) havoc.thud('iHard', L.mesh.position); L.fall = false; } }
    // the one you could pick up
    const nu = !downUntil && o.free() ? nearest() : null;
    if (nu !== hintFor) { hintFor = nu; if (nu === 'crate') o.hint(`Q · take a gun from the crate (${WEAPONS[crateGun()].name}${held ? `, for the ${held.name}` : ''})`, 3000); else if (nu) o.hint(`Q · pick up the ${WEAPONS[lying.get(nu).w].name}${held ? ` (puts down the ${held.name})` : ''}`, 3000); }
    // down, and up again
    if (downUntil) { downEl.style.opacity = 1; downEl.style.pointerEvents = 'auto'; const ready = now - downAt > 1.2; for (const b of downEl.querySelectorAll('button')) b.disabled = !ready; }
    else if (hp < HP && now - hurtAt > 4) { hp = Math.min(HP, hp + 12 * dt); if (hp >= HP) hud(); else if (Math.random() < 0.1) hud(); }
    hurt *= Math.exp(-dt * 2.2); hurtEl.style.opacity = hurt.toFixed(3);
    if (markT > 0) { markT -= dt; if (markT <= 0) cross.classList.remove('hit'); }
    recoil *= Math.exp(-dt * 8);
    // the gun in hand
    const drawn = !!(held && held.drawn && !downUntil && o.free(true));
    cross.style.opacity = drawn && !o.selfView() && !(held && held.rl) ? (1 - aiming * 0.7) : 0;
    if (held) {
      const h = held, ud = h.ud;
      // the reload's timeline
      if (h.rl) {
        const R = h.rl, prev = R.t; R.t += dt; evalReload(ud, R.tac, R.t, R.o);
        for (const [te, name] of R.o.events) if (prev < te && R.t >= te) reloadEvent(name);
        if (R.t >= R.dur) { h.mag = ud.tube ? ud.magSize : R.tac ? ud.magSize + 1 : ud.magSize; h.rl = null; hud(); }
      }
      aiming += ((drawn && aimOn && !h.rl ? 1 : 0) - aiming) * Math.min(1, dt * 10);
      if (drawn && trigger && now >= h.nextAt) { fire(); if (!ud.auto) trigger = false; }
      // the magazine: in the well, in the left hand, or both (a tactical reload)
      const st = h.rl ? h.rl.o.magState : 'in';
      if (ud.mag) ud.mag.visible = st === 'in' || st === 'swap';
      if (ud.handMag) {
        const hand = o.body && o.body.bones && o.body.bones.hand_L;
        if (hand && ud.handMag.parent !== hand) { hand.add(ud.handMag); ud.handMag.position.set(-0.05, -0.085, 0.03); ud.handMag.rotation.set(0, 0, Math.PI / 2); }
        ud.handMag.visible = drawn && (st === 'hand' || st === 'swap');
      }
      if (ud.chargeHandle) ud.chargeHandle.position.z = ud.chHome + (h.rl && h.rl.o.jolt > 0.05 && (ud.bullpup || ud.tube) ? 0.08 * h.rl.o.jolt : 0);
      flashT -= dt; if (ud.flash) ud.flash.visible = ud.flash2.visible = flashT > 0;
      // held: your body is given the hold for its next frame, and the gun goes where the body holds it this one
      mySpec = holdSpec(ud, mySpec, aiming, recoil, h.rl);
      if (o.body && o.body.setArmed) o.body.setArmed(drawn, drawn ? mySpec : null);
      let placed = false;
      if (drawn && o.body && o.body.gunWorld) placed = o.body.gunWorld(h.gun.matrix);
      if (drawn && !placed && !o.body) {   // (no body: in the camera's frame, as Betamax does it)
        _q.setFromEuler(_e.set(mySpec.rot.x, mySpec.rot.y, mySpec.rot.z, 'XYZ')).premultiply(camera.quaternion);
        h.gun.matrix.compose(_v.copy(mySpec.off).applyQuaternion(camera.quaternion).add(camera.position), _q, _w.set(1, 1, 1)); placed = true;
      }
      h.gun.visible = drawn && placed; h.gun.matrixWorldNeedsUpdate = true;
    } else if (o.body && o.body.setArmed) o.body.setArmed(false, null);
    if (o.body && o.body.setDown) o.body.setDown(!!downUntil, myDir[0], myDir[1]);
    stepOthers(dt); stepVapor(dt);
    stepFx(dt); havoc.step(dt);
  }
  // what the others are holding: their guns in their bodies' hands, reloading when they do
  const theirs = new Map(), theirDir = new Map();   // id -> { w, prop, spec, rl }; id -> the way the last round that hit them went
  let othersList = [];
  function others(list) { othersList = list; }
  function stepOthers(dt) {
    const seen = new Set();
    for (const p of othersList) {
      seen.add(p.id); let t = theirs.get(p.id);
      if (p.body && p.body.setDown) { const d = theirDir.get(p.id) || [0, 1]; p.body.setDown(!!p.down, d[0], d[1]); }
      if (!p.w || p.down || !UD[p.w]) { if (t) { group.remove(t.prop); theirs.delete(p.id); } if (p.body && p.body.setArmed) p.body.setArmed(false, null); continue; }
      if (!t || t.w !== p.w) { if (t) group.remove(t.prop); t = { w: p.w, prop: weaponProp(p.w), spec: null, rl: null }; t.prop.matrixAutoUpdate = false; group.add(t.prop); theirs.set(p.id, t); }
      const ud = UD[p.w];
      if (t.rl) { const R = t.rl; R.t += dt; try { evalReload(ud, R.tac, R.t, R.o); } catch (e) { t.rl = null; } if (t.rl && R.t >= R.dur) t.rl = null; }
      t.spec = holdSpec(ud, t.spec, 0, 0, t.rl);
      if (p.body.setArmed) p.body.setArmed(true, t.spec);
      const ok = p.body.gunWorld && p.body.gunWorld(t.prop.matrix); t.prop.matrixWorldNeedsUpdate = true; t.prop.visible = !!ok && p.body.root.visible;
    }
    for (const [id, t] of theirs) if (!seen.has(id)) { group.remove(t.prop); theirs.delete(id); }
  }
  // ---------------------------------------------------------------- input
  function key(code, down, shift) {
    if (downUntil) { if (down && (code === 'KeyE' || code === 'KeyG' || code === 'Enter')) getUp(code === 'KeyG'); return code === 'KeyQ' || code === 'KeyE' || code === 'KeyG' || code === 'Enter'; }
    if (code === 'KeyQ' && down) {
      if (shift && held) { dropHeld(); return true; }
      const nu = nearest(); if (nu) return pickUp(nu);
      if (held) { stow(); return true; }
      return false;
    }
    if (!held || !held.drawn || downUntil) return false;
    if (code === 'KeyR' && down) { reload(); return true; }
    if (code === 'KeyK') { trigger = down; return true; }   // the trigger, for touch and the controller
    if (code === 'KeyL') { aimOn = down; return true; }      // aim, held
    return false;
  }
  function mouse(button, down) {
    if (!held || !held.drawn || downUntil || !o.free(true)) return false;
    if (button === 0) { trigger = down; return true; }
    if (button === 2) { aimOn = down; return true; }
    return false;
  }

  // ---------------------------------------------------------------- arrivals, and the room
  function arrive(w) {
    if (!okW(w)) return;
    const s = o.heapSpot(), a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 3;
    const l = ['a' + (store.seq++).toString(36) + Math.random().toString(36).slice(2, 5), w, r3(s.x + Math.cos(a) * r), r3(s.z + Math.sin(a) * r), r3(Math.random() * 6.28)];
    store.lying.push(l); layDown(l, true); save(); if (o.send) o.send({ a: 'put', l, f: 1 });
  }
  function onMsg(from, m) {
    if (!m || !m.a) return;
    if (m.a === 'put' && okL(m.l) && !store.lying.some(l => l[0] === m.l[0])) { store.lying.push(m.l); layDown(m.l, !!m.f); save(); }
    else if (m.a === 'take') { const i = store.lying.findIndex(l => l[0] === m.u); if (i >= 0) { store.lying.splice(i, 1); const L = lying.get(m.u); if (L) { group.remove(L.mesh); lying.delete(m.u); } save(); } }
    else if (m.a === 'shot' && okW(m.w) && Array.isArray(m.f)) {
      const f = new THREE.Vector3().fromArray(m.f); report(m.w, f, 1); flash.position.copy(f); flash.intensity = 4;
      const ud = UD[m.w] || {}, k = calK(ud.cal, (ud.pellets || 1) > 1);
      (Array.isArray(m.e) ? m.e : []).slice(0, 4).forEach((e, i) => {
        if (!Array.isArray(e) || !e.slice(0, 3).every(isFinite)) return; const b = new THREE.Vector3(+e[0], +e[1], +e[2]), kind = KIND[e[3]] || 'ground';
        if (i < 3) tracer(f, b); const D = b.clone().sub(f).normalize();
        let n = D.clone().negate();
        if (kind === 'ground' || kind === 'plant') n = groundN(b.x, b.z);
        else if (kind === 'tree') { let best = null, bd = 3; for (const T of o.trees()) { const q = Math.hypot(T.x - b.x, T.z - b.z); if (q < bd) { bd = q; best = T; } } if (best) n.set(b.x - best.x, 0, b.z - best.z).normalize(); }
        impact(kind, b, n, D, k, null, i === 0);
      });
    }
    else if (m.a === 'hit') {
      if (m.to === (o.myId ? o.myId() : '')) { if (o.canBeShot() && !downUntil) { onHit(from, m); if (o.body) { const me = o.me(); bodyHit(o.body, { x: me.x, gy: me.gy, z: me.z }, m); } } }
      else { const p = othersList.find(q => q.id === m.to); if (p && p.body) { bodyHit(p.body, p, m); if (isFinite(m.dx)) theirDir.set(p.id, [+m.dx, +m.dz]); } }
    }
    else if (m.a === 'down') { if (isFinite(m.dx) && isFinite(m.dz)) theirDir.set(from, [+m.dx, +m.dz]); if (o.onDown) o.onDown(from, m.by); }
    else if (m.a === 'up') { const p = othersList.find(q => q.id === from); if (p && p.body) clearMarks(p.body); }
    else if (m.a === 'rl') { const t = theirs.get(from); if (t && UD[t.w]) { const ud = UD[t.w], tac = !!m.tac, missing = Math.max(1, Math.min(60, +m.m || 1)); let dur = 2.2; try { dur = reloadDuration(ud, tac, missing); } catch (e) {} t.rl = { t: 0, dur, tac, o: { gunOff: new THREE.Vector3(), gunRot: new THREE.Euler(), path: null, magState: 'in', events: [], jolt: 0, seat: 0, missing } }; } }
    else if (m.a === 'lamp' && Number.isInteger(m.i) && m.i >= 0 && m.i < 64 && !lampOut.has(m.i)) { lampOut.add(m.i); if (o.breakLamp) o.breakLamp(m.i); const L = o.lamps && o.lamps()[m.i]; if (L) impact('lamp', new THREE.Vector3(L[0], L[1], L[2]), UP.clone(), UP.clone().negate(), 1, null, false); }
    else if (m.a === 'fell' && [m.x, m.z, m.dx, m.dz].every(isFinite)) { let best = null, bd = 0.3; for (const T of o.trees()) { if (T.id == null) continue; const q = Math.hypot(T.x - m.x, T.z - m.z); if (q < bd) { bd = q; best = T; } } if (best) fellTree(best, new THREE.Vector3(+m.dx, 0, +m.dz), false); }
  }
  return {
    update, others, key, mouse, arrive, onMsg,
    get held() { return held && held.drawn ? held.w : ''; }, get down() { return !!downUntil; }, get hp() { return hp; }, get aiming() { return aiming; },
    get armed() { return !!(held && held.drawn); }, has: () => !!held, get reloading() { return !!(held && held.rl); }, get rounds() { return held ? held.mag : 0; },
    /** How much the view narrows, aiming: 1 at the hip, the gun's own sight field (Betamax's adsFov, of 70°) aimed. */
    get zoom() { return held ? 1 + ((held.ud.adsFov || 55) / 70 - 1) * aiming : 1; },
    net: {
      snapshot() { return { seq: store.seq, lying: store.lying }; },
      adopt(w, mine) { if (!guest && !mine) save(); guest = !mine; store = { seq: +((w && w.seq) || 0), lying: (w && Array.isArray(w.lying) ? w.lying : []).filter(okL) }; if (mine) own = store; redraw(); save(); },
      release() { if (!guest) return; guest = false; store = own; redraw(); },
    },
    /** For tests: a gun in hand at once. */
    give(w) { if (okW(w)) take(w); },
    lyingCount: () => lying.size,
    /** The demo crate by the gate (tests): where it is, and what Q would give from it. */
    get crate() { return crate && { x: crate.x, z: crate.z, next: crateGun() }; }, near: () => nearest(),
    get fallDir() { const l = Math.hypot(myDir[0], myDir[1]) || 1; return [myDir[0] / l, myDir[1] / l]; }, get cracked() { return crackEl.style.opacity === '1'; },
    get lastRay() { return lastRay; }, getUp, bodyHit: (body, p, m) => bodyHit(body, p, m), get marks() { let n = 0; for (const L of marksOf.values()) n += L.length; return n; },
    havoc, get gun() { return held && held.gun; }, reload, trace: (O, D) => held && trace(O, D, held.ud, true), lampsOut: () => [...lampOut], felled: () => [...felled],
  };
}
