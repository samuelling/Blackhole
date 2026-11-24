// planter.js: the plant menu and the act of planting.
//
// P opens the menu: about 130 perennials in ten kinds of garden. Pick one and a ring appears on the ground where you look, as wide as
// the plant will be when grown, with a smaller ring for the pot you are holding. Green: it has room. Amber: it will live but a neighbour
// will hold it back. Red: not here. Click plants it; keep clicking for a drift. X digs up the one of yours you are looking at, Q puts
// the trowel down. What you plant is kept in this browser with its age, and goes on growing with the garden's seasons.
import * as THREE from 'three';
import { FLORA, CATS } from './flora.js';

const KEY = 'gd.plants.v1';
const CSS = `
#gdPlants { position:fixed; left:0; top:0; bottom:0; width:min(390px,100vw); z-index:9; background:rgba(8,10,11,.9); -webkit-backdrop-filter:blur(10px); backdrop-filter:blur(10px);
  border-right:1px solid rgba(233,228,218,.12); display:flex; flex-direction:column; transform:translateX(-102%); transition:transform .28s ease; color:#e9e4da; }
#gdPlants.on { transform:none; }
#gdPlants header { display:flex; align-items:baseline; justify-content:space-between; padding:16px 18px 6px; }
#gdPlants h2 { font:400 26px 'Cormorant Garamond',Georgia,serif; letter-spacing:.01em; }
#gdPlants header button { background:none; border:0; color:rgba(233,228,218,.6); font:20px/1 sans-serif; cursor:pointer; padding:4px 8px; }
#gdPlants .cats { display:flex; flex-wrap:wrap; gap:5px 6px; padding:6px 16px 12px; border-bottom:1px solid rgba(233,228,218,.1); }
#gdPlants .cats button { background:none; border:1px solid rgba(233,228,218,.16); border-radius:999px; color:rgba(233,228,218,.6); font:10px 'IBM Plex Mono',monospace; letter-spacing:.1em; text-transform:uppercase; padding:6px 10px; cursor:pointer; white-space:nowrap; }
#gdPlants .cats button.on { color:#0b0d0d; background:#e9e4da; border-color:#e9e4da; }
#gdPlants .list { overflow-y:auto; flex:1; padding:6px 8px 16px; overscroll-behavior:contain; }
#gdPlants .row { display:grid; grid-template-columns:34px 1fr; gap:2px 10px; padding:9px 10px; border-radius:8px; cursor:pointer; align-items:center; }
#gdPlants .row:hover, #gdPlants .row.on { background:rgba(233,228,218,.08); }
#gdPlants .sw { grid-row:1 / span 2; width:30px; height:30px; border-radius:50%; position:relative; border:1px solid rgba(255,255,255,.14); }
#gdPlants .sw i { position:absolute; right:-3px; bottom:-3px; width:15px; height:15px; border-radius:50%; border:1.5px solid #0b0d0d; }
#gdPlants .nm { font:500 19px/1.15 'Cormorant Garamond',Georgia,serif; }
#gdPlants .nm em { font-style:italic; font-weight:400; color:rgba(233,228,218,.5); font-size:15px; margin-left:6px; }
#gdPlants .mt { font:10px/1.5 'IBM Plex Mono',monospace; letter-spacing:.04em; color:rgba(233,228,218,.5); }
#gdPlants .foot { padding:10px 18px 14px; border-top:1px solid rgba(233,228,218,.1); font:10px/1.6 'IBM Plex Mono',monospace; letter-spacing:.05em; color:rgba(233,228,218,.45); }
#gdTrowel { position:fixed; left:50%; bottom:calc(var(--bar, 64px) + 56px); transform:translateX(-50%); z-index:6; pointer-events:none; text-align:center; opacity:0; transition:opacity .3s;
  font:11px/1.6 'IBM Plex Mono',monospace; letter-spacing:.06em; color:#e9e4da; text-shadow:0 1px 4px #000; white-space:nowrap; }
#gdTrowel.on { opacity:1; }
#gdTrowel b { font:500 20px 'Cormorant Garamond',Georgia,serif; letter-spacing:.01em; display:block; }
#gdTrowel .st { color:#9dffb0; } #gdTrowel .st.warn { color:#ffc46b; } #gdTrowel .st.no { color:#ff8a78; }
body.mpIn #gdTrowel { bottom:calc(var(--bar, 64px) + 102px); }
@media (max-width:640px){ #gdTrowel { white-space:normal; width:92%; } }`;

export function createPlanter({ scene, camera, garden, heightAt, hint, lock, unlock, isTouch, blockedNow = () => false }) {
  const P = garden.planting;
  const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
  const panel = document.createElement('div'); panel.id = 'gdPlants';
  panel.innerHTML = `<header><h2>Plant</h2><button title="close">×</button></header><div class="cats"></div><div class="list"></div><div class="foot"></div>`;
  document.body.append(panel);
  const bar = document.createElement('div'); bar.id = 'gdTrowel'; document.body.append(bar);
  const catsEl = panel.querySelector('.cats'), listEl = panel.querySelector('.list'), footEl = panel.querySelector('.foot');
  let cat = CATS[0][0], armed = null, open = false, spot = null, look = null, dirty = false, saveAt = 0;
  for (const [id, label] of CATS) { const b = document.createElement('button'); b.textContent = label; b.dataset.c = id; b.onclick = () => { cat = id; draw(); }; catsEl.append(b); }
  function draw() {
    for (const b of catsEl.children) b.classList.toggle('on', b.dataset.c === cat);
    listEl.innerHTML = '';
    for (const f of FLORA) { if (f.cat !== cat) continue;
      const row = document.createElement('div'); row.className = 'row' + (armed === f.k ? ' on' : '');
      row.innerHTML = `<div class="sw" style="background:${f.leafCol}">${f.flCol ? `<i style="background:${f.flCol}"></i>` : ''}</div><div class="nm">${f.name}<em>${f.latin}</em></div><div class="mt">${f.meta}</div>`;
      row.onclick = () => { arm(f.k); setOpen(false); lock(); };
      listEl.append(row);
    }
    listEl.scrollTop = 0;
    footEl.textContent = `${P.count} of ${P.max} planted · they grow as the seasons run (S) · kept in this browser`;
  }
  function setOpen(v) { open = !!v; panel.classList.toggle('on', open); if (open) { unlock(); draw(); } }
  panel.querySelector('header button').onclick = () => setOpen(false);
  panel.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
  function arm(k) { armed = k; ring.visible = false; if (!k) { bar.classList.remove('on'); return; } bar.classList.add('on'); spot = null; }

  // the ring on the ground: full spread, and the pot
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x9dffb0, transparent: true, opacity: 0.85, depthWrite: false, depthTest: false, fog: false, toneMapped: false });
  const ring = new THREE.Group(); ring.visible = false; ring.renderOrder = 9;
  const outer = new THREE.Mesh(new THREE.RingGeometry(0.965, 1, 72).rotateX(-Math.PI / 2), ringMat), pot = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2), ringMat);
  outer.renderOrder = pot.renderOrder = 9; ring.add(outer, pot); scene.add(ring);

  const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _ndc = new THREE.Vector2(), ray = new THREE.Raycaster();
  function groundAt(nx = 0, ny = 0) {          // where a ray through the view meets the ground, within reach
    ray.setFromCamera(_ndc.set(nx, ny), camera); _o.copy(ray.ray.origin); _d.copy(ray.ray.direction);
    let t0 = 0.3;
    for (let t = 0.5; t <= 11; t += 0.25) { const x = _o.x + _d.x * t, z = _o.z + _d.z * t; if (_o.y + _d.y * t <= heightAt(x, z)) {
      let a = t0, b = t; for (let i = 0; i < 8; i++) { const m = (a + b) / 2; if (_o.y + _d.y * m <= heightAt(_o.x + _d.x * m, _o.z + _d.z * m)) b = m; else a = m; }
      return { x: _o.x + _d.x * b, z: _o.z + _d.z * b }; } t0 = t; }
    return null;
  }
  const pct = v => Math.round(v * 100) + '%';
  function update() {
    if (!armed || open || blockedNow()) { ring.visible = false; if (armed && blockedNow()) bar.classList.remove('on'); return; }
    bar.classList.add('on');
    const g = groundAt(), f = P.flora[armed];
    look = g ? P.nearAny(g.x, g.z, 0.6) : null;
    if (!g) { ring.visible = false; spot = null; bar.innerHTML = `<b>${f.name}</b><span class="st no">look at the ground within reach</span>`; return; }
    const c = P.check(armed, g.x, g.z); spot = { x: g.x, z: g.z, c };
    ring.visible = true; ring.position.set(g.x, heightAt(g.x, g.z) + 0.03, g.z); outer.scale.setScalar(c.r || 0.3); pot.scale.setScalar(0.115);
    ringMat.color.set(!c.ok ? 0xff7a66 : c.crowd < 0.995 ? 0xffc46b : 0x9dffb0);
    const status = !c.ok ? `<span class="st no">${c.why}</span>` : c.crowd < 0.995 ? `<span class="st warn">crowded here: it will reach ${pct(c.crowd)} of its size</span>` : `<span class="st">room to grow · ${f.meta.split(' · ').slice(1, 4).join(' · ')}</span>`;
    const mine = !look ? '' : look.garden ? `<br>here: ${nameOf(look.k)}, the garden's own · X digs it up (and frees the spot)` : `<br>yours here: ${nameOf(look.k)} · ${look.age < 0.1 ? 'just planted' : look.age.toFixed(1) + ' years'} · ${pct(look.size)} of full size${look.crowd < 0.995 ? ' (crowded)' : ''} · X digs it up`;
    bar.innerHTML = `<b>${f.name}</b>${status}${mine}<br>${isTouch ? 'tap the ground to plant' : 'click plants · P menu · Q done'}`;
  }
  function plantHere(s = spot) {
    if (!armed || !s) return false;
    if (!s.c.ok) { hint(s.c.why, 2500); return true; }
    const id = P.plant(armed, s.x, s.z, 0); if (id == null) return true;
    if (net) net.send({ p: 'plant', k: armed, x: Math.round(s.x * 100) / 100, z: Math.round(s.z * 100) / 100 });
    dirty = true; saveAt = performance.now() + 1500; return true;
  }
  /** A click with the trowel in hand. Returns true if the click was the planter's. */
  function click() { if (!armed || open || blockedNow()) return false; return plantHere(); }
  /** A tap at a point of the screen (touch): plant where the tap falls. */
  function tap(nx, ny) { if (!armed || open || blockedNow()) return false; const g = groundAt(nx, ny); if (!g) return true; return plantHere({ x: g.x, z: g.z, c: P.check(armed, g.x, g.z) }); }
  const nameOf = k => (P.flora[k] && P.flora[k].name) || String(k).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  function dig() { if (!look) return false; const name = nameOf(look.k); const lk = look; if (P.digUp(look.id)) { if (net) net.send(lk.garden ? { p: 'gdig', d: [lk.id, lk.k, Math.round(lk.x * 100) / 100, Math.round(lk.z * 100) / 100] } : { p: 'dig', x: lk.x, z: lk.z }); dirty = true; saveAt = performance.now() + 1500; hint(`${name} dug up`, 2500); } return true; }
  function onKey(code) {
    if (blockedNow()) return false;
    if (code === 'KeyP') { setOpen(!open); return true; }
    if (!armed) return false;
    if (code === 'KeyQ') { arm(null); hint('trowel down', 1500); return true; }
    if (code === 'KeyX') return dig();
    return false;
  }
  // keeping
  // in a room (multi.js) the planting is the room's: what anyone plants or digs is told to all; a guest's own comes back on leaving
  let net = null, guestP = false;
  function save() { dirty = false; if (guestP) return; try { localStorage.setItem(KEY, JSON.stringify({ v: 1, plants: P.list(), dug: P.dugList() })); } catch (e) { hint('this browser would not save your planting', 5000); } }
  function tick(now) { if (dirty && now > saveAt) save(); else if (P.count && now > saveAt + 30000) { saveAt = now; save(); } }   // ages move on, so save now and then
  function setAll(d) {   // the garden's own you dug up first, then yours back in where they stood
    if (d && Array.isArray(d.dug)) P.redig(d.dug.slice(0, 4000));
    if (d && Array.isArray(d.plants)) { let n = 0; for (const r of d.plants.slice(0, P.max)) if (Array.isArray(r) && P.flora[r[0]] && isFinite(r[1]) && isFinite(r[2]) && P.plant(r[0], +r[1], +r[2], +r[3] || 0, true) != null) n++; if (n) P.refresh(); }
  }
  const loadOwn = () => { try { setAll(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) {} };
  loadOwn();
  const netApi = {
    attach(n) { net = n; }, snapshot: () => ({ plants: P.list(), dug: P.dugList() }),
    adopt(w, mine) { if (!guestP && !mine) save(); guestP = !mine; P.clear(); P.undigAll(); setAll(w); if (mine) save(); draw(); },
    release() { net = null; if (guestP) { guestP = false; P.clear(); P.undigAll(); loadOwn(); draw(); } else save(); },
    onMsg(m) {
      if (!m || typeof m !== 'object') return;
      if (m.p === 'plant') { if (P.flora[m.k] && isFinite(m.x) && isFinite(m.z) && P.plant(m.k, +m.x, +m.z, 0, true) != null) P.refresh(); }
      else if (m.p === 'dig') { const n = isFinite(m.x) && isFinite(m.z) ? P.near(+m.x, +m.z, 0.08) : null; if (n) P.digUp(n.id); }
      else if (m.p === 'gdig') { if (Array.isArray(m.d)) P.redig([m.d]); }
      else if (m.p === 'clear') P.clear(); else if (m.p === 'undig') P.undigAll();
      dirty = true; saveAt = performance.now() + 1500; draw();
    },
  };
  addEventListener('pagehide', () => { if (P.count || P.dug || dirty) save(); });
  draw();
  return { net: netApi, update, tick, click, tap, onKey, setOpen, arm, save,
    get armed() { return armed; }, get open() { return open; }, get count() { return P.count; },
    clear() { P.clear(); if (net) net.send({ p: 'clear' }); arm(null); save(); draw(); },
    /** Put back every one of the garden's own plants you dug up. */
    undig() { const n = P.undigAll(); if (net) net.send({ p: 'undig' }); save(); return n; } };
}
