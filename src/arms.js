// arms.js: guns. They come through the wormhole from the Shred Hole (its Arsenal: Betamax's guns, sent whole), land by the junk
// heap as the real thing (Betamax's models, src/betamax/), and can be picked up and fired: at the stones and junk of a free build
// (a round carries real momentum), at the trees and the ground, and, in a room, at each other.
//
// Firing is hitscan from the eye along where you look, with each gun's own numbers from Betamax (rate, magazine, spread, damage,
// a shotgun's nine pellets), its report synthesized as Betamax does it (fitted to recordings of real rifles), a tracer, a flash at
// the muzzle and a puff where it lands. In a room: the shooter decides the hit (what you saw is what you hit) and tells whoever it
// was; a body shot takes the gun's damage off 100, a head shot its head damage. At nothing left you go down, and four seconds later
// you're back on your feet at the gate. Anyone can turn off being shot (Settings → Garden); their own guns still work.
//
// Keys: Q picks up the gun you're looking at (swapping for the one you hold), or draws / puts away your own; Shift+Q puts it down.
// Click fires (held, for the automatics), right button aims, R reloads. Touch and the controller have their own buttons.
import * as THREE from 'three';
import { WEAPONS, weaponProp } from './betamax/arsenal.js';
import { reloadDuration } from './betamax/weapons.js';
import { synthRifle, synthImpact, mulberry32 } from './betamax/gunsound.js';

export const GUN_IDS = Object.keys(WEAPONS).filter(k => k !== 'm2');
const KEY = 'gd.arms.v1', REACH = 2.2, HP = 100, MOMENTUM = [4, 7, 9];   // N·s a round carries, by calibre (a shotgun pellet: 1.6)
const okW = w => GUN_IDS.includes(w);
const r3 = v => Math.round(v * 1000) / 1000;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');

/**
 * o: { scene, camera, heightAt, blocked(x,z), nearBrook(x,z), trees(): [{x,z,r,gy,top}], walling, audio(): {ctx, master}, hint(t,ms),
 *      players(): [{id, x, gy, z, down}], send(m) (to the room, or null), heapSpot(): {x,z}, respawn(), kick(pitch, yaw), canBeShot(): bool, me(): {x,gy,z,yaw,pitch}, selfView(): bool, body }
 */
export function createArms(o) {
  const { scene, camera } = o;
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
  function clearLying() { for (const L of lying.values()) group.remove(L.mesh); lying.clear(); }
  function redraw() { clearLying(); for (const l of store.lying) layDown(l, false); }
  redraw();

  // ---------------------------------------------------------------- the gun in hand
  let held = null;   // { w, ud, gun (Object3D, in view), prop (in the hand, seen from outside), mag, reloadAt, nextAt, drawn }
  let trigger = false, aiming = 0, aimOn = false, recoil = 0, lastShot = 0;
  function take(w, mag) {
    if (held) { group.remove(held.gun); group.remove(held.prop); }
    const gun = WEAPONS[w].build(); gun.traverse(m => { if (m.isMesh) { m.castShadow = false; m.frustumCulled = false; } });
    const prop = weaponProp(w); const ud = gun.userData;
    held = { w, ud, gun, prop, mag: mag == null ? ud.magSize || 20 : mag, reloadAt: 0, nextAt: 0, drawn: true, name: WEAPONS[w].name };
    group.add(gun); group.add(prop); hud();
  }
  function stow() { if (!held) return; held.drawn = !held.drawn; trigger = false; aimOn = false; hud(); o.hint(held.drawn ? `${held.name} drawn` : `${held.name} put away · Q draws it`, 2000); }
  function dropHeld() {
    if (!held) return; const me = o.me();
    const l = ['a' + (store.seq++).toString(36) + Math.random().toString(36).slice(2, 5), held.w, r3(me.x - Math.sin(me.yaw) * 1.2), r3(me.z - Math.cos(me.yaw) * 1.2), r3(Math.random() * 6.28)];
    group.remove(held.gun); group.remove(held.prop); held = null; trigger = false; aimOn = false;
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
    return best;
  }
  function pickUp(uid) {
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
  const CAL = {}, RATE = {}, GAIN = {};
  for (const w of GUN_IDS) { try { const g = WEAPONS[w].build(); CAL[w] = g.userData.cal; RATE[w] = g.userData.rate; GAIN[w] = g.userData.gainK; } catch (e) {} }

  // ---------------------------------------------------------------- what a shot shows: flash, tracer, puff
  const flash = new THREE.PointLight(0xffc070, 0, 9, 2); group.add(flash);
  const fx = [];   // { obj, t, life, kind }
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false });
  function tracer(a, b) {
    const g = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]), line = new THREE.Line(g, tracerMat.clone());
    group.add(line); fx.push({ obj: line, t: 0, life: 0.07, kind: 'line' });
  }
  const puffMat = new THREE.SpriteMaterial({ color: 0xcfc4b0, transparent: true, opacity: 0.7, depthWrite: false });
  const sparkMat = new THREE.SpriteMaterial({ color: 0xffd080, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const leafMat = new THREE.SpriteMaterial({ color: 0x5f7a3a, transparent: true, opacity: 0.85, depthWrite: false });
  const bloodMat = new THREE.SpriteMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });   // the suit's glow, not blood
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
  function hitTrunk(O, D, maxD) {
    let best = null;
    for (const T of o.trees()) {
      const ax = T.x - O.x, az = T.z - O.z, dd = D.x * D.x + D.z * D.z; if (dd < 1e-6) continue;
      const t = (ax * D.x + az * D.z) / dd; if (t < 0 || t > maxD) continue;
      const cx = O.x + D.x * t - T.x, cz = O.z + D.z * t - T.z, h2 = cx * cx + cz * cz, r = T.r; if (h2 > r * r) continue;
      const t0 = t - Math.sqrt((r * r - h2) / dd), y = O.y + D.y * t0 - T.gy;
      if (y > 0 && y < T.top && (!best || t0 < best)) best = t0;
    }
    return best;
  }
  function hitGround(O, D, maxD) {
    let prev = 0;
    for (let t = 0.3; t < maxD; t += t < 20 ? 0.2 : 0.6) {
      const x = O.x + D.x * t, y = O.y + D.y * t, z = O.z + D.z * t;
      if (y < o.heightAt(x, z)) { let a = prev, b = t; for (let k = 0; k < 8; k++) { const m = (a + b) / 2; if (O.y + D.y * m < o.heightAt(O.x + D.x * m, O.z + D.z * m)) b = m; else a = m; } return { d: b, kind: 'ground' }; }
      if (y < o.heightAt(x, z) + 1.4 && o.blocked(x, z)) return { d: t, kind: 'hedge' };
      prev = t;
    }
    return null;
  }
  function fire() {
    const h = held, ud = h.ud, now = performance.now() / 1000;
    if (h.reloadAt) return;
    if (h.mag <= 0) { reload(); return; }
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
    // what the others see and hear: from your muzzle to where each round landed
    if (o.send) o.send({ a: 'shot', w: h.w, f: [r3(muzzle.x), r3(muzzle.y), r3(muzzle.z)], e: shots.slice(0, 3).map(s => [r3(s.x), r3(s.y), r3(s.z)]) });
    for (const s of shots.slice(0, 3)) tracer(muzzle, s);
    flash.position.copy(muzzle); flash.intensity = 6;
    report(h.w, null, 1);
    recoil = Math.min(1, recoil + (ud.kick || 0.025) * 6);
    if (o.kick) o.kick((ud.kick || 0.025) * (1 - 0.5 * aiming) * (0.7 + Math.random() * 0.6), (Math.random() - 0.5) * (ud.kick || 0.025) * 0.5);
  }
  // one round: the nearest of a body, a stone or piece of junk, a trunk, the ground or a hedge
  function trace(O, D, ud, first) {
    const maxD = 400; let d = maxD, what = null;
    const g = hitGround(O, D, maxD); if (g) { d = g.d; what = g; }
    const tr = hitTrunk(O, D, d); if (tr != null && tr < d) { d = tr; what = { kind: 'tree' }; }
    const pc = o.walling && o.walling.shoot ? o.walling.shoot(O, D, d, ((ud.pellets || 1) > 1 ? 1.6 : MOMENTUM[ud.cal] || 7)) : null;
    if (pc && pc.d < d) { d = pc.d; what = { kind: 'piece' }; }
    let who = null;
    for (const p of players()) { if (p.down) continue; const b = hitBody(O, D, p, d); if (b && b.d < d) { d = b.d; who = { p, head: b.head }; what = { kind: 'body' }; } }
    const at = O.clone().addScaledVector(D, d);
    if (who) {
      const dmg = who.head ? (ud.head || ud.dmg * 3) : ud.dmg; puff(at, 'suit', 5);
      if (o.send) o.send({ a: 'hit', to: who.p.id, d: Math.round(dmg), h: who.head ? 1 : 0, w: held.w });
      marker(who.head);
    } else if (what) {
      const k = what.kind; puff(at, k === 'piece' ? 'spark' : k === 'tree' ? 'leaf' : 'dust', k === 'piece' ? 8 : 6);
      if (first) thud(k === 'piece' ? 'iHard' : 'iSand', at);
    }
    return at;
  }
  function muzzleWorld(out) {
    if (!held) return out.copy(camera.position);
    const g = held.gun; g.updateMatrixWorld(); return out.set(0, 0, held.ud.muzzleZ || -0.6).applyMatrix4(g.matrixWorld);
  }
  function reload() {
    const h = held; if (!h || h.reloadAt || h.mag >= (h.ud.magSize || 20)) return;
    let dur = 2.2; try { dur = reloadDuration(h.ud, h.mag > 0) || 2.2; } catch (e) {}
    h.reloadAt = performance.now() / 1000 + dur; trigger = false; hud('reloading');
  }

  // ---------------------------------------------------------------- being shot (in a room)
  let hp = HP, downUntil = 0, hurtAt = -9, hurt = 0;
  function onHit(from, m) {
    if (!o.canBeShot() || downUntil) return;
    hp -= Math.max(0, Math.min(400, +m.d || 0)); hurtAt = performance.now() / 1000; hurt = Math.min(1, hurt + 0.5 + (m.h ? 0.4 : 0));
    if (hp <= 0) {
      hp = 0; downUntil = hurtAt + 4; trigger = false; aimOn = false;
      if (o.send) o.send({ a: 'down', by: from }); o.hint(m.h ? 'head shot: you are down · back on your feet at the gate in a moment' : 'you are down · back on your feet at the gate in a moment', 4000);
    }
    hud();
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
    #armsDown { position:fixed; inset:0; z-index:5; pointer-events:none; background:rgba(20,0,0,.6); opacity:0; transition:opacity .4s; display:flex; align-items:center; justify-content:center; font:500 30px 'Cormorant Garamond',Georgia,serif; color:#e9e4da; }`;
  document.head.append(css);
  const hudEl = document.createElement('div'); hudEl.id = 'armsHud'; const cross = document.createElement('div'); cross.id = 'armsCross';
  const hurtEl = document.createElement('div'); hurtEl.id = 'armsHurt'; const downEl = document.createElement('div'); downEl.id = 'armsDown'; downEl.textContent = 'down';
  document.body.append(hudEl, cross, hurtEl, downEl);
  function hud(state) {
    const on = !!(held && held.drawn) || hp < HP;
    hudEl.style.opacity = on ? 1 : 0;
    hudEl.innerHTML = (held ? `${held.name}<br><b>${state === 'reloading' || held.reloadAt ? '··' : held.mag}</b> / ${held.ud.magSize || 20}<br>` : '') + `<span class="hp"><i style="width:${hp}%"></i></span>`;
  }
  let markT = 0; function marker(head) { cross.classList.add('hit'); markT = head ? 0.35 : 0.2; }

  // ---------------------------------------------------------------- each frame
  const hip = new THREE.Vector3(), ads = new THREE.Vector3();
  let hintFor = null;
  function update(dt) {
    const now = performance.now() / 1000;
    // guns falling out of the wormhole's air onto the ground
    for (const L of lying.values()) if (L.fall) { L.vy -= 4.2 * dt; L.mesh.position.y += L.vy * dt; const floor = L.gy + L.mesh.userData.lift; if (L.mesh.position.y <= floor) { L.mesh.position.y = floor; if (L.vy < -2) thud('iHard', L.mesh.position); L.fall = false; } }
    // the one you could pick up
    const nu = !downUntil && o.free() ? nearest() : null;
    if (nu !== hintFor) { hintFor = nu; if (nu) o.hint(`Q · pick up the ${WEAPONS[lying.get(nu).w].name}${held ? ` (puts down the ${held.name})` : ''}`, 3000); }
    // down, and up again
    if (downUntil) { downEl.style.opacity = 1; if (now > downUntil) { downUntil = 0; hp = HP; o.respawn(); downEl.style.opacity = 0; if (o.send) o.send({ a: 'up' }); hud(); } }
    else if (hp < HP && now - hurtAt > 4) { hp = Math.min(HP, hp + 12 * dt); if (hp >= HP) hud(); else if (Math.random() < 0.1) hud(); }
    hurt *= Math.exp(-dt * 2.2); hurtEl.style.opacity = hurt.toFixed(3);
    if (markT > 0) { markT -= dt; if (markT <= 0) cross.classList.remove('hit'); }
    recoil *= Math.exp(-dt * 8);
    // the gun in hand
    const drawn = !!(held && held.drawn && !downUntil && o.free(true));
    cross.style.opacity = drawn && !o.selfView() ? (1 - aiming * 0.7) : 0;
    if (held) {
      const h = held;
      if (h.reloadAt && now >= h.reloadAt) { h.reloadAt = 0; h.mag = h.ud.magSize || 20; hud(); }
      aiming += ((drawn && aimOn ? 1 : 0) - aiming) * Math.min(1, dt * 10);
      if (drawn && trigger && now >= h.nextAt) { fire(); if (!h.ud.auto) trigger = false; }
      const first = drawn && !o.selfView();
      h.gun.visible = first; h.prop.visible = drawn && !first;
      if (first) {
        // in view: at the hip (Betamax's own place for it) or, aiming, its sight on your eye
        const ud = h.ud; if (ud.hip && ud.hip.isVector3) hip.copy(ud.hip); else hip.set(ud.pistol ? 0.1 : 0.13, -0.17, ud.pistol ? -0.36 : -0.42);
        ads.set(0, -(ud.sightY || 0.05), -(ud.eyeZ || 0.25));
        _v.lerpVectors(hip, ads, aiming); _v.z += recoil * 0.05; _v.y -= recoil * 0.01;
        h.gun.position.copy(_v).applyQuaternion(camera.quaternion).add(camera.position);
        _q.setFromAxisAngle(_w.set(1, 0, 0), recoil * 0.12); h.gun.quaternion.copy(camera.quaternion).multiply(_q);
      } else if (drawn && o.body) {
        const me = o.me(); o.body.palm(_v); _e.set(me.pitch, me.yaw, 0); h.prop.quaternion.setFromEuler(_e);
        _w.set(0.012, -0.095, 0.065).applyQuaternion(h.prop.quaternion); h.prop.position.copy(_v).sub(_w);
      }
    }
    if (o.body && o.body.setArmed) o.body.setArmed(drawn && o.selfView());   // (in your own eyes the gun is held in view; your arms stay down out of it)
    stepFx(dt);
  }
  // what the others are holding (their bodies), drawn in their hands
  const theirs = new Map();   // id -> { w, prop }
  function others(list) {   // list: [{ id, body, w, yaw, pitch, down }]
    const seen = new Set();
    for (const p of list) {
      seen.add(p.id); let t = theirs.get(p.id);
      if (!p.w || p.down) { if (t) { group.remove(t.prop); theirs.delete(p.id); } if (p.body.setArmed) p.body.setArmed(false); continue; }
      if (!t || t.w !== p.w) { if (t) group.remove(t.prop); t = { w: p.w, prop: weaponProp(p.w) }; group.add(t.prop); theirs.set(p.id, t); }
      if (p.body.setArmed) p.body.setArmed(true);
      p.body.palm(_v); _e.set(p.pitch || 0, p.yaw || 0, 0); t.prop.quaternion.setFromEuler(_e);
      _w.set(0.012, -0.095, 0.065).applyQuaternion(t.prop.quaternion); t.prop.position.copy(_v).sub(_w); t.prop.visible = p.body.root.visible;
    }
    for (const [id, t] of theirs) if (!seen.has(id)) { group.remove(t.prop); theirs.delete(id); }
  }

  // ---------------------------------------------------------------- input
  function key(code, down, shift) {
    if (code === 'KeyQ' && down) {
      if (downUntil) return true;
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
      for (const e of (Array.isArray(m.e) ? m.e : []).slice(0, 3)) { if (!Array.isArray(e)) continue; const b = new THREE.Vector3().fromArray(e); tracer(f, b); puff(b, 'dust', 3); }
    }
    else if (m.a === 'hit' && m.to === (o.myId ? o.myId() : '')) onHit(from, m);
    else if (m.a === 'down') { if (o.onDown) o.onDown(from, m.by); }
  }
  return {
    update, others, key, mouse, arrive, onMsg,
    get held() { return held && held.drawn ? held.w : ''; }, get down() { return !!downUntil; }, get hp() { return hp; }, get aiming() { return aiming; },
    get armed() { return !!(held && held.drawn); }, has: () => !!held,
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
  };
}
