// Together: up to six astronauts in one garden, each in an outfit of their own, talking.
//
// - Rooms. A room is a short code (ABCD); the link linglab.org/blackhole/?room=ABCD takes a friend straight in. room.js (from MEGAjam)
//   does the handshake through the Cloudflare relay and then links every pair of browsers directly by WebRTC.
// - Bodies. Each other astronaut is a second copy of your own suit (body.js), walked by the same gait from where they are: their
//   browser sends where they stand, which way they face and look, and what their hands are doing at the wall about 15 times a second
//   (unreliable and unordered, so a lost packet is just skipped), and this end plays it back a tenth of a second late, smoothly
//   interpolated. Their hands, fingers, sway and stride are worked out here from that, the same way your own are, so they move like
//   people and cost a few dozen bytes a packet. A pair that can only talk through the relay sends four times a second instead.
// - Voices. As in MEGAjam's talkback: WebRTC audio (Opus, with the browser's echo cancelling, noise suppression and level control),
//   sent only while you talk (hold ` or the mic button, or leave the mic open). Each voice comes from that astronaut's helmet, in 3-D:
//   nearer is louder, and you can tell where they are with your eyes shut. "Everyone close" plays every voice at full level instead.
//   While someone talks, their name tag shows it and their suit's glow strips pulse with their voice.
// - The sky. The garden's clock and calendar follow whoever has been in the room longest, so everyone sees the same sun or stars.
// - One garden. Everyone in a room builds, plants and digs in the same garden: that of whoever was in the room first. Someone coming
//   in is handed it as it stands (walls, free builds, glue, the stone and junk heaps, the planting), their own is set aside untouched,
//   and it comes back when they leave. Only the browser the garden belongs to saves it. What each module sends is its own business
//   (walling.js, junk.js, planter.js); this file carries it: reliably and in order, in pieces when it is large (a whole garden can be
//   a megabyte), held back until the garden itself has arrived. The stone in each astronaut's beam rides with their body's stream.
// - The voids each of you opens are still your own.
import * as THREE from 'three';
import { Room } from './room.js';
import { PRESETS, SUITS, VISORS, GLOWS, TOPS, cleanOutfit, fromPreset, loadOutfit, saveOutfit, css } from './outfits.js';

const MAX = 6;
const SERVER = () => new URLSearchParams(location.search).get('server') || window.MP_SERVER || 'wss://crush-commando-mp.samuelling.workers.dev';
const HOME = 'https://linglab.org/blackhole/';
const DELAY = 0.12;              // play the others back this far behind, to have two packets to interpolate between
const RATE = 1 / 15, RELAY_RATE = 0.25;
const TALK_RMS = 0.012;
const clean = s => String(s || '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯]/g, '').trim().slice(0, 16);
const code4 = () => { const A = 'BCDFGHJKLMNPQRSTVWXZ'; let c = ''; for (let i = 0; i < 4; i++) c += A[Math.floor(Math.random() * A.length)]; return c; };
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
const r3 = v => Math.round(v * 1000) / 1000;

export function createMulti(o) {
  const { scene, camera, model, U, COMMON, createBody, selfBody } = o;
  const shared = new Set(); model.traverse(m => { if (m.isMesh) shared.add(m.geometry); });
  let room = null, code = '', name = '', outfit = loadOutfit(), hearAll = false, followSky = true, sendT = 0, skyT = 0, status = '';
  let gardenOf = null, synced = false, openedAt = 0, asked = null, askedAt = 0, joinedAt = 0, bigSeq = 0; const pendingW = [], bigIn = new Map(); let W = null;
  try { name = clean(localStorage.getItem('gd.name')) || ''; hearAll = localStorage.getItem('gd.hearAll') === '1'; } catch (e) {}
  const others = new Map();     // jammer id -> { id, n, name, outfit, body, tag, snaps, off, voice, level, muted }
  if (selfBody) selfBody.setOutfit(outfit);

  // ---------------------------------------------------------------- the lobby
  const css0 = `
  #mp { position:fixed; left:18px; top:58px; z-index:12; width:min(360px, calc(100vw - 36px)); max-height:calc(100vh - 140px); overflow:auto; display:none;
    font-family:'IBM Plex Mono',monospace; font-size:11px; letter-spacing:.06em; color:var(--ink,#e9e4da); background:rgba(8,10,14,.82);
    border:1px solid rgba(233,228,218,.18); border-radius:14px; padding:16px 16px 14px; backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); pointer-events:auto; }
  #mp.on { display:block; }
  #mp h2 { font:400 20px 'Cormorant Garamond',Georgia,serif; letter-spacing:.02em; margin:0 0 10px; }
  #mp h3 { font-size:9px; letter-spacing:.22em; text-transform:uppercase; color:var(--dim,#9a958c); margin:14px 0 7px; font-weight:400; }
  #mp input[type=text] { width:100%; box-sizing:border-box; background:rgba(255,255,255,.05); border:1px solid rgba(233,228,218,.2); border-radius:8px;
    color:inherit; font:inherit; letter-spacing:.08em; padding:8px 10px; }
  #mp .pre { display:grid; grid-template-columns:repeat(5, 1fr); gap:6px; }
  #mp .pre button { background:rgba(255,255,255,.04); border:1px solid rgba(233,228,218,.14); border-radius:9px; padding:6px 2px 5px; color:var(--dim,#9a958c);
    font:inherit; font-size:8.5px; letter-spacing:.08em; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:4px; }
  #mp .pre button[aria-pressed=true] { border-color:var(--ink,#e9e4da); color:var(--ink,#e9e4da); }
  #mp .pre i { display:block; width:26px; height:26px; border-radius:50%; box-shadow:inset 0 0 0 1px rgba(0,0,0,.4); }
  #mp .sw { display:flex; flex-wrap:wrap; gap:6px; }
  #mp .sw button { width:22px; height:22px; border-radius:50%; border:2px solid transparent; cursor:pointer; padding:0; box-shadow:inset 0 0 0 1px rgba(0,0,0,.35); }
  #mp .sw button[aria-pressed=true] { border-color:var(--ink,#e9e4da); }
  #mp .tops { display:flex; flex-wrap:wrap; gap:5px; }
  #mp .tops button { background:rgba(255,255,255,.04); border:1px solid rgba(233,228,218,.14); border-radius:999px; padding:5px 9px; color:var(--dim,#9a958c); font:inherit; font-size:9px; letter-spacing:.08em; cursor:pointer; }
  #mp .tops button[aria-pressed=true] { border-color:var(--ink,#e9e4da); color:var(--ink,#e9e4da); }
  #mp .row { display:flex; gap:8px; align-items:center; margin-top:8px; }
  #mp .act { background:rgba(255,255,255,.06); border:1px solid rgba(233,228,218,.28); border-radius:999px; color:inherit; font:inherit; font-size:10px;
    letter-spacing:.18em; text-transform:uppercase; padding:9px 14px; cursor:pointer; white-space:nowrap; }
  #mp .act:hover { border-color:var(--ink,#e9e4da); }
  #mp .act.big { flex:1; }
  #mp .st { color:var(--dim,#9a958c); margin-top:10px; min-height:1.2em; line-height:1.5; }
  #mp .who { list-style:none; margin:0; padding:0; }
  #mp .who li { display:flex; align-items:center; gap:8px; padding:5px 0; border-bottom:1px solid rgba(233,228,218,.07); }
  #mp .who i { width:14px; height:14px; border-radius:50%; flex:none; }
  #mp .who span { flex:1; } #mp .who small { color:var(--dim,#9a958c); font-size:9px; }
  #mp .who button { background:none; border:none; color:var(--dim,#9a958c); cursor:pointer; font-size:13px; padding:0 2px; }
  #mp label { display:flex; gap:8px; align-items:center; color:var(--dim,#9a958c); margin-top:6px; cursor:pointer; }
  #mp .x { position:absolute; right:10px; top:8px; background:none; border:none; color:var(--dim,#9a958c); font-size:18px; cursor:pointer; }
  #mpTalk { position:fixed; left:50%; bottom:calc(var(--bar, 64px) + 12px); transform:translateX(-50%); z-index:6; display:none; pointer-events:auto; user-select:none; -webkit-user-select:none;
    font-family:'IBM Plex Mono',monospace; font-size:10px; letter-spacing:.18em; text-transform:uppercase; color:var(--dim,#9a958c);
    background:rgba(0,0,0,.4); border:1px solid rgba(233,228,218,.2); border-radius:999px; padding:9px 16px; cursor:pointer; touch-action:none; }
  #mpTalk.on { display:block; } #mpTalk.live { color:#0b0c0f; background:rgba(120,240,200,.92); border-color:transparent; }
  #mpTalk.open:not(.live) { border-color:rgba(120,240,200,.7); }
  `;
  const st = document.createElement('style'); st.textContent = css0; document.head.append(st);
  const el = document.createElement('div'); el.id = 'mp'; document.body.append(el);
  const talkB = document.createElement('button'); talkB.id = 'mpTalk'; talkB.textContent = '🎙 hold to talk'; document.body.append(talkB);
  const stop = e => e.stopPropagation();
  for (const ev of ['mousedown', 'pointerdown', 'click', 'wheel', 'touchstart']) el.addEventListener(ev, stop);

  function render() {
    const inRoom = !!room;
    const pre = PRESETS.map(p => `<button data-p="${p.id}" aria-pressed="${outfit.p === p.id}"><i style="background:conic-gradient(${css(p.suit)} 0 55%, ${css(p.accent)} 0 70%, ${css(p.trim)} 0 85%, ${css(p.visor)} 0)"></i>${p.name}</button>`).join('');
    const sw = (list, key) => list.map((c, i) => `<button data-k="${key}" data-i="${i}" style="background:${css(c)}" aria-pressed="${outfit[key].every((v, j) => Math.abs(v - c[j]) < 0.002)}" title="${key}"></button>`).join('');
    const q = new URLSearchParams(location.search).get('room');
    let rm;
    if (!inRoom) rm = `<h3>Room</h3>
      <div class="row"><button class="act big" data-a="new">start a new room</button></div>
      <div class="row"><input type="text" id="mpCode" maxlength="8" placeholder="or a friend's code" value="${q ? clean(q).toUpperCase() : ''}" autocomplete="off" spellcheck="false"><button class="act" data-a="join">join</button></div>`;
    else rm = `<h3>Room ${code}${synced && gardenOf ? ` · ${gardenOf === 'yours' ? 'your garden' : esc(gardenOf) + ' garden'}` : room.id && !synced ? ' · the garden is arriving…' : ''}</h3>
      <div class="row"><input type="text" readonly value="${HOME}?room=${code}" id="mpLink"><button class="act" data-a="copy">copy</button></div>
      <h3>Here (${others.size + 1} of ${MAX})</h3><ul class="who">
        <li><i style="background:${css(outfit.suit)}"></i><span>${esc(name || 'you')} <small>(you)</small></span></li>
        ${[...others.values()].map(p => `<li><i style="background:${css(p.outfit ? p.outfit.suit : [0.5, 0.5, 0.5])}"></i><span>${esc(p.name || '…')} <small>${p.peer ? (p.peer.path === 'direct' ? 'direct' : p.peer.path === 'relay' ? 'via relay, no voice' : 'connecting…') : ''}</small></span><button data-mute="${p.id}" title="mute or unmute their voice">${p.muted ? '🔇' : '🔊'}</button></li>`).join('')}
      </ul>
      <label><input type="checkbox" id="mpAll" ${hearAll ? 'checked' : ''}> hear everyone as if they were close</label>
      <label><input type="checkbox" id="mpSky" ${followSky ? 'checked' : ''}> share the sky (the room's clock and calendar)</label>
      <label><input type="checkbox" id="mpOpen" ${micOpen ? 'checked' : ''}> open mic (otherwise hold \` or the mic button to talk)</label>
      <div class="row"><button class="act" data-a="leave">leave the room</button></div>`;
    el.innerHTML = `<button class="x" data-a="close" title="close">×</button><h2>Together</h2>
      <h3>Your name</h3><input type="text" id="mpName" maxlength="16" placeholder="astronaut" value="${esc(name)}" autocomplete="off" spellcheck="false">
      <h3>Your suit</h3><div class="pre">${pre}</div>
      <h3>Suit colour</h3><div class="sw">${sw(SUITS, 'suit')}</div>
      <h3>Trim (joints, belt, boots)</h3><div class="sw">${sw(SUITS, 'trim')}</div>
      <h3>Patches</h3><div class="sw">${sw(SUITS, 'accent')}</div>
      <h3>Visor</h3><div class="sw">${sw(VISORS, 'visor')}</div>
      <h3>Glow</h3><div class="sw">${sw(GLOWS, 'glow')}</div>
      <h3>On the helmet</h3><div class="tops">${TOPS.map(t => `<button data-top="${t[0]}" aria-pressed="${(outfit.top || 'none') === t[0]}">${t[1]}</button>`).join('')}</div>
      ${rm}<div class="st">${esc(status)}</div>`;
  }
  const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  el.addEventListener('input', e => {
    if (e.target.id === 'mpName') { name = clean(e.target.value); try { localStorage.setItem('gd.name', name); } catch (_) {} sendWho(); }
  });
  el.addEventListener('change', e => {
    if (e.target.id === 'mpAll') { hearAll = e.target.checked; try { localStorage.setItem('gd.hearAll', hearAll ? '1' : '0'); } catch (_) {} for (const p of others.values()) routeVoice(p); }
    if (e.target.id === 'mpSky') followSky = e.target.checked;
    if (e.target.id === 'mpOpen') setOpen(e.target.checked);
  });
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.p) { outfit = fromPreset(b.dataset.p, outfit); wear(); }
    else if (b.dataset.top) { outfit.top = b.dataset.top; wear(); }
    else if (b.dataset.k) { const list = b.dataset.k === 'visor' ? VISORS : b.dataset.k === 'glow' ? GLOWS : SUITS; outfit[b.dataset.k] = list[+b.dataset.i].slice(); wear(); }
    else if (b.dataset.mute) { const p = others.get(b.dataset.mute); if (p) { p.muted = !p.muted; if (p.voice) p.voice.gain.gain.value = p.muted ? 0 : 1.2; render(); } }
    else if (b.dataset.a === 'new') join(code4());
    else if (b.dataset.a === 'join') { const c = clean(el.querySelector('#mpCode').value).toUpperCase().replace(/[^A-Z0-9]/g, ''); if (c) join(c); else setStatus('Type the code your friend gave you.'); }
    else if (b.dataset.a === 'copy') { const t = `${HOME}?room=${code}`; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => setStatus('Link copied: send it to up to five friends.'), () => { el.querySelector('#mpLink').select(); setStatus('Select the link and copy it.'); }); }
    else if (b.dataset.a === 'leave') leave();
    else if (b.dataset.a === 'close') close();
  });
  function wear() { outfit = cleanOutfit(outfit); saveOutfit(outfit); if (selfBody) selfBody.setOutfit(outfit); sendWho(); render(); }
  function setStatus(t) { status = t || ''; const s = el.querySelector('.st'); if (s) s.textContent = status; }
  let isOpen = false;
  function open() { isOpen = true; render(); el.classList.add('on'); o.onOpen && o.onOpen(true); }
  function close() { isOpen = false; el.classList.remove('on'); o.onOpen && o.onOpen(false); }

  // ---------------------------------------------------------------- the room
  function join(c) {
    leave(true);
    code = c; o.initAudio && o.initAudio();
    room = new Room({ server: SERVER(), maxPeers: MAX - 1, prefix: 'gd-', handlers: {
      status: (kind, text) => { if (kind === 'in') { joinedAt = performance.now(); if (room.alone) { synced = true; gardenOf = 'yours'; o.hint && o.hint('this is your garden: friends who come in build in it with you', 5000); } }
        setStatus(kind === 'in' ? `In room ${code}. ${text}` : text); if (kind === 'error') { room && room.leave(); room = null; render(); } o.onRoom && o.onRoom(); },
      roster: () => { syncPeers(); if (isOpen) render(); o.onRoom && o.onRoom(); },
      peerOpen: p => { if (!openedAt) openedAt = performance.now(); sendWho(p.id); syncPeers(); askWorld(); if (isOpen) render(); },
      peerLeft: p => { if (W) W.peerGone(p.id); if (asked === p.id) asked = null; for (const k of [...bigIn.keys()]) if (k.startsWith(p.id + ':')) bigIn.delete(k);
        const x = others.get(p.id); if (x) { o.hint && o.hint(`${x.name || 'someone'} left the garden`, 4000); drop(x); } if (isOpen) render(); o.onRoom && o.onRoom(); },
      message: (p, m) => onMessage(p, m),
      binary: () => {},
      track: (p, track, stream) => onTrack(p, track, stream),
    } });
    synced = false; gardenOf = null; openedAt = 0; asked = null; pendingW.length = 0; bigIn.clear(); W = o.world || null;
    if (W) W.attach({ send: (m, to) => sendBig({ k: 'w', m }, to), get id() { return room ? room.id || '' : ''; }, host: () => !!room && isHost(room.id), ready: () => synced });
    room.join(code, name || 'astronaut');
    try { const u = new URL(location.href); u.searchParams.set('room', code); history.replaceState(null, '', u); } catch (_) {}
    if (micStream) room.addTrack(micTrack, micStream);
    talkB.classList.add('on'); document.body.classList.add('mpIn'); render();
  }
  function leave(quiet) {
    if (room) { if (W) { try { W.release(); } catch (e) { console.warn('[together] leaving', e); } } room.leave(); room = null; }   // (what is in hand is put by and told before the links close)
    synced = false; pendingW.length = 0; bigIn.clear();
    for (const p of others.values()) drop(p);
    talkB.classList.remove('on'); document.body.classList.remove('mpIn'); setTalk(false);
    if (!quiet) { setStatus('Left the room.'); try { const u = new URL(location.href); u.searchParams.delete('room'); history.replaceState(null, '', u); } catch (_) {} render(); o.onRoom && o.onRoom(); }
  }
  // everyone the room knows, as bodies here (a body appears once we know who they are)
  function syncPeers() {
    if (!room) return;
    for (const pr of room.peers.values()) { let p = others.get(pr.id); if (!p) { p = { id: pr.id, name: pr.name, snaps: [], off: null, level: 0, muted: false }; others.set(pr.id, p); } p.peer = pr; p.n = pr.n; if (!p.name && pr.name) p.name = pr.name; }
    for (const p of [...others.values()]) if (!room.peers.has(p.id)) drop(p);
  }
  function drop(p) {
    if (p.body) { scene.remove(p.body.root); p.body.dispose(shared); }
    if (p.tag) p.tag.remove();
    if (p.voice) { try { p.voice.src.disconnect(); p.voice.gain.disconnect(); p.voice.el.srcObject = null; } catch (_) {} }
    others.delete(p.id);
  }
  function sendWho(id) { if (room) room.send({ k: 'who', name: name || 'astronaut', outfit }, id); }
  // ---------------------------------------------------------------- the one garden
  // a message of any size: whole if small, else in pieces put together again at the far end
  function sendBig(m, to) {
    if (!room) return; const s = JSON.stringify(m);
    if (s.length <= 14000) { room.send(m, to); return; }
    const t = (bigSeq++).toString(36) + Math.random().toString(36).slice(2, 6), n = Math.ceil(s.length / 12000);
    for (let i = 0; i < n; i++) room.send({ k: 'big', t, i, n, d: s.slice(i * 12000, (i + 1) * 12000) }, to);
  }
  // coming in: ask whoever has been here longest for the garden; if they don't answer, the next
  function askWorld() {
    if (!room || !W || synced || (asked && performance.now() - askedAt < 6000)) return;
    // over a direct link if there is one (the whole garden, junk heap and all); over the relay only if none comes up in a few seconds
    const direct = p => !!(p.dc && p.dc.readyState === 'open'), wait = performance.now() - joinedAt < 8000;
    const open = [...room.peers.values()].filter(p => p.opened && p.id !== asked && (direct(p) || !wait)).sort((a, b) => (direct(b) - direct(a)) || ((a.n || 1e9) - (b.n || 1e9)));
    const pick = open[0] || (asked && !wait && room.peers.get(asked)); if (!pick) return;
    asked = pick.id; askedAt = performance.now(); room.send({ k: 'world?' }, pick.id);
  }
  function gotWorld(pr, w) {
    if (synced || !W) return;
    let mine = false; try { mine = W.adopt(w); gardenOf = mine ? 'yours' : null; } catch (e) { console.warn('[together] the garden did not arrive whole', e); }
    synced = true;
    const host = others.get(pr.id), who = host && host.name ? host.name + "'s" : 'the room\'s'; if (!mine) gardenOf = who;
    o.hint && o.hint(mine ? 'your garden, as the room has kept it' : `you are in ${who} garden: build, plant and dig here together · your own is kept, and comes back when you leave`, 8000);
    for (const [id, m] of pendingW.splice(0)) { try { W.onMsg(id, m); } catch (e) { console.warn(e); } }
    if (isOpen) render();
  }

  function onMessage(pr, m) {
    let p = others.get(pr.id); if (!p) { syncPeers(); p = others.get(pr.id); if (!p) return; }
    if (m.k === 'big') {   // a piece of something large
      if (typeof m.t !== 'string' || !(m.n > 0 && m.n <= 600) || !(m.i >= 0 && m.i < m.n) || typeof m.d !== 'string') return;
      const key = pr.id + ':' + m.t; let b = bigIn.get(key); if (!b) { if (bigIn.size > 8) return; bigIn.set(key, b = { parts: new Array(m.n), got: 0 }); }
      if (b.parts.length !== m.n || b.parts[m.i] != null) return; b.parts[m.i] = m.d; b.got++;
      if (b.got === m.n) { bigIn.delete(key); let whole = null; try { whole = JSON.parse(b.parts.join('')); } catch (e) { return; } if (whole && whole.k !== 'big') onMessage(pr, whole); }
      return;
    }
    if (m.k === 'world?') { if (synced && W) sendBig({ k: 'world', w: W.snapshot(pr.path === 'relay') }, pr.id); return; }
    if (m.k === 'world') { gotWorld(pr, m.w); return; }
    if (m.k === 'w') { if (!W) return; if (!synced) { if (pendingW.length < 4000) pendingW.push([pr.id, m.m]); return; } try { W.onMsg(pr.id, m.m); } catch (e) { console.warn('[together]', e); } return; }
    if (m.k === 'who') {
      const was = p.name; p.name = clean(m.name) || 'astronaut'; p.outfit = cleanOutfit(m.outfit);
      ensureBody(p); p.body.setOutfit(p.outfit); drawTag(p);
      if (!p.greeted) { p.greeted = true; o.hint && o.hint(`${p.name} is in the garden`, 4000); } else if (was !== p.name) drawTag(p);
      if (isOpen) render(); o.onRoom && o.onRoom();
    } else if (m.k === 's') {
      const now = performance.now() / 1000;
      const lag = now - (+m.t || 0); p.off = p.off == null ? lag : Math.min(p.off + 0.002, lag);   // their clock against ours, from the quickest packet lately
      p.snaps.push({ t: +m.t || 0, x: +m.x, z: +m.z, y: +m.y, yaw: +m.yw, pitch: +m.pt, w: m.w | 0, a: Array.isArray(m.a) ? m.a : null, g: m.g || null, pn: +m.pn || 0 });
      if (p.snaps.length > 30) p.snaps.splice(0, p.snaps.length - 30);
      ensureBody(p);
      if (W && synced) { try { W.remoteHold(pr.id, Array.isArray(m.h) ? m.h : null); } catch (e) {} }   // the stone in their beam
    } else if (m.k === 'sky') {
      if (followSky && isHost(pr.id) && o.setSky) o.setSky(m);
    }
  }
  // the one who has been here longest keeps the clock
  function isHost(id) {
    if (!room) return false; let best = { id: room.id, n: room.n };
    for (const p of room.peers.values()) if (p.n && (!best.n || p.n < best.n)) best = { id: p.id, n: p.n };
    return best.id === id;
  }

  // ---------------------------------------------------------------- their bodies
  function ensureBody(p) {
    if (p.body) return;
    p.body = createBody({ model, U, COMMON }); p.body.pass('mirror'); p.body.root.visible = false; scene.add(p.body.root);
    p.body.setOutfit(p.outfit || PRESETS[0]);
    p.tag = makeTag(); drawTag(p);
  }
  // name tags: labels on the screen over each helmet (crisp at any distance, and seen through hedges, as in games)
  const tags = document.createElement('div'); tags.id = 'mpTags'; document.body.append(tags);
  const tst = document.createElement('style'); tst.textContent = `#mpTags { position:fixed; inset:0; pointer-events:none; z-index:4; overflow:hidden; }
    #mpTags div { position:absolute; left:0; top:0; transform:translate(-50%, -100%); white-space:nowrap; font-family:'IBM Plex Mono',monospace; font-size:11px;
      letter-spacing:.08em; color:#efeae0; background:rgba(8,10,14,.5); border:1px solid rgba(233,228,218,.2); border-radius:999px; padding:3px 10px; will-change:transform,opacity; }
    #mpTags div.talk { border-color:var(--tc); box-shadow:0 0 12px var(--tc); }`;
  document.head.append(tst);
  function makeTag() { const d = document.createElement('div'); tags.append(d); return d; }
  function drawTag(p) {
    if (!p.tag) return; const talking = p.level > TALK_RMS;
    p.tag.textContent = (talking ? '🔊 ' : '') + (p.name || '…'); p.tag.classList.toggle('talk', talking);
    p.tag.style.setProperty('--tc', p.outfit ? css(p.outfit.glow) : '#9fe'); p.tagTalk = talking;
  }
  // where they were DELAY seconds ago, between the two packets either side
  const _a = new THREE.Vector3();
  function sample(p, now) {
    const S = p.snaps; if (!S.length) return null;
    const t = now - (p.off || 0) - DELAY;
    let i = S.length - 1; while (i > 0 && S[i - 1].t > t) i--;
    const b = S[i], a = S[Math.max(0, i - 1)];
    if (t >= S[S.length - 1].t) { const l = S[S.length - 1]; return l; }   // ran out (a hiccup): hold the last
    if (a === b || b.t <= a.t) return b;
    const k = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)));
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, y: a.y + (b.y - a.y) * k, yaw: a.yaw + wrapA(b.yaw - a.yaw) * k, pitch: a.pitch + (b.pitch - a.pitch) * k,
      w: b.w, a: b.a, g: b.g, pn: b.pn };
  }

  // ---------------------------------------------------------------- voices
  let micStream = null, micTrack = null, micOpen = false, pttDown = false, mine = null, vOut = null;
  function out() {
    const ctx = o.audio && o.audio().ctx; if (!ctx) return null;
    if (!vOut) { vOut = ctx.createGain(); vOut.gain.value = 1; vOut.connect(ctx.destination); }   // voices don't go through the garden's own sound switch
    return ctx;
  }
  function onTrack(pr, track, stream) {
    const ctx = out(); if (!ctx || track.kind !== 'audio') return;
    let p = others.get(pr.id); if (!p) { syncPeers(); p = others.get(pr.id); if (!p) return; }
    if (p.voice) { try { p.voice.src.disconnect(); p.voice.gain.disconnect(); } catch (_) {} }
    const ms = stream || new MediaStream([track]);
    const el2 = new Audio(); el2.muted = true; el2.srcObject = ms; el2.play?.().catch(() => {});   // Chrome feeds a remote stream to Web Audio only while it plays
    const src = ctx.createMediaStreamSource(ms), an = ctx.createAnalyser(), gain = ctx.createGain(), pan = ctx.createPanner();
    an.fftSize = 512; gain.gain.value = p.muted ? 0 : 1.2;
    Object.assign(pan, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 3, rolloffFactor: 0.7, maxDistance: 400 });
    src.connect(an); gain.connect(vOut);
    p.voice = { el: el2, src, an, gain, pan, buf: new Float32Array(512) }; routeVoice(p);
  }
  function routeVoice(p) {
    const v = p.voice; if (!v) return;
    try { v.src.disconnect(v.pan); } catch (_) {} try { v.src.disconnect(v.gain); } catch (_) {} try { v.pan.disconnect(); } catch (_) {}
    if (hearAll) v.src.connect(v.gain); else { v.src.connect(v.pan); v.pan.connect(v.gain); }
  }
  async function enableMic() {
    if (micStream) return true;
    try { micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } }); }
    catch (_) { setStatus('No microphone (or it was refused): you can still hear everyone.'); o.hint && o.hint('no microphone: you can still hear everyone', 4000); return false; }
    micTrack = micStream.getAudioTracks()[0]; micTrack.enabled = false;
    const ctx = out(); if (ctx) { const src = ctx.createMediaStreamSource(micStream), an = ctx.createAnalyser(); an.fftSize = 512; src.connect(an); mine = { an, buf: new Float32Array(512), level: 0 }; }
    if (room) room.addTrack(micTrack, micStream);
    return true;
  }
  async function setTalk(on) {
    pttDown = on;
    if (on && !(await enableMic())) { pttDown = false; }
    applyMic();
  }
  async function setOpen(on) { micOpen = on; if (on && !(await enableMic())) micOpen = false; applyMic(); }
  function applyMic() {
    const live = !!room && (pttDown || micOpen);
    if (micTrack) micTrack.enabled = live;
    talkB.classList.toggle('live', live); talkB.classList.toggle('open', micOpen);
    talkB.textContent = live ? '🎙 talking' : micOpen ? '🎙 open mic' : '🎙 hold to talk';
  }
  // hold the button (or the ` key) to talk
  talkB.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); talkB.setPointerCapture?.(e.pointerId); setTalk(true); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) talkB.addEventListener(ev, e => { e.stopPropagation(); if (pttDown) setTalk(false); });
  talkB.addEventListener('mousedown', stop); talkB.addEventListener('click', stop);
  function key(e, down) {
    if (e.code !== 'Backquote' || !room) return false;
    const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return false;
    if (down && e.repeat) return true;
    setTalk(down); return true;
  }
  const level = x => { x.an.getFloatTimeDomainData(x.buf); let e = 0; for (const s of x.buf) e += s * s; x.level = (x.level || 0) * 0.6 + Math.sqrt(e / x.buf.length) * 0.4; return x.level; };

  // ---------------------------------------------------------------- each frame
  const _f = new THREE.Vector3(), _u = new THREE.Vector3(), _hp = new THREE.Vector3(), _pr = new THREE.Vector3();
  function update(dt, t, self) {
    if (!room) return;
    const now = performance.now() / 1000;
    // what we send: where we are, how we're turned, what the hands are doing
    sendT -= dt;
    if (sendT <= 0 && room.peers.size) {
      sendT = RATE;
      const m = { k: 's', t: r3(now), x: r3(self.x), z: r3(self.z), y: r3(self.gy), yw: r3(self.yaw), pt: r3(self.pitch) };
      if (self.work) { m.w = 1; if (self.aim) m.a = [r3(self.aim.x), r3(self.aim.y), r3(self.aim.z)]; }
      if (self.gesture) { const g = self.gesture, c = {}; for (const k of ['held', 'effort', 'hover', 'press', 'placing', 'ghost']) if (g[k]) c[k] = typeof g[k] === 'number' ? r3(g[k]) : 1; if (Object.keys(c).length) m.g = c; }
      if (self.point > 0.02) m.pn = r3(self.point);
      if (self.hold) m.h = self.hold;
      const s = JSON.stringify(m);
      for (const pr of room.peers.values()) {
        if (pr.fast && pr.fast.readyState === 'open') { try { pr.fast.send(s); } catch (_) {} }
        else if (pr.dc && pr.dc.readyState === 'open') { try { pr.dc.send(s); } catch (_) {} }
        else if (pr.path === 'relay' && now - (pr.relayAt || 0) > RELAY_RATE) { pr.relayAt = now; room.relayEvent(pr.id, { k: 'm', m }); }
      }
    }
    // the keeper of the clock tells the others every few seconds
    if (!synced && room.id) {
      askWorld(); const now = performance.now();
      if (!room.alone && !openedAt && now - joinedAt > 40000) {   // the room lists others but none can be reached (gone without saying, most likely): carry on as its first
        synced = true; gardenOf = 'yours'; o.hint && o.hint('nobody else in the room can be reached yet: this is your garden', 6000); if (isOpen) render();
      } else if (openedAt && now - openedAt > 45000) {   // they are there, but the garden never came (a link can take twenty seconds to come up; a garden a while to cross a slow one)
        synced = true; pendingW.length = 0; if (W) { try { W.release(); } catch (e) {} W = null; }   // (and nothing of the room's is written into your own)
        o.hint && o.hint('the room\'s garden did not arrive: you can see and hear everyone, but you are building in your own (leave and join again to retry)', 9000);
      }
    }
    skyT -= dt;
    if (skyT <= 0) { skyT = 3; if (isHost(room.id) && room.peers.size && o.getSky) room.send({ k: 'sky', ...o.getSky() }); }
    // the listener is your head
    const ctx = vOut && o.audio().ctx;
    if (ctx) {
      const L = ctx.listener; camera.getWorldDirection(_f); _u.set(0, 1, 0).applyQuaternion(camera.quaternion);
      if (L.positionX) { L.positionX.value = camera.position.x; L.positionY.value = camera.position.y; L.positionZ.value = camera.position.z;
        L.forwardX.value = _f.x; L.forwardY.value = _f.y; L.forwardZ.value = _f.z; L.upX.value = _u.x; L.upY.value = _u.y; L.upZ.value = _u.z; }
      else { L.setPosition(camera.position.x, camera.position.y, camera.position.z); L.setOrientation(_f.x, _f.y, _f.z, _u.x, _u.y, _u.z); }
    }
    if (mine && micTrack && micTrack.enabled) level(mine);
    // the others, a tenth of a second ago
    for (const p of others.values()) {
      if (!p.body) continue;
      const s = sample(p, now);
      if (!s) { p.body.root.visible = false; p.tag.style.opacity = 0; continue; }
      p.body.root.visible = true;
      p.body.setWork(!!s.w, s.a ? _a.fromArray(s.a) : null); p.body.setGesture(s.w ? s.g : null); p.body.point(s.pn || 0);
      p.body.update(dt, { x: s.x, z: s.z, gy: s.y, yaw: s.yaw, pitch: s.pitch, t });
      p.body.setInk(o.ink ? o.ink() : 0.004);
      _hp.set(s.x, s.y + 1.62, s.z);
      const d = camera.position.distanceTo(_hp);
      _pr.set(s.x, s.y + 2.05, s.z).project(camera);
      if (_pr.z < 1 && d > 0.6 && d < 120 && Math.abs(_pr.x) < 1.2 && Math.abs(_pr.y) < 1.2) {
        p.tag.style.transform = `translate(${((_pr.x + 1) / 2 * innerWidth).toFixed(1)}px, ${((1 - _pr.y) / 2 * innerHeight).toFixed(1)}px) translate(-50%, -100%)`;
        p.tag.style.opacity = Math.min(1, (120 - d) / 30).toFixed(2);
      } else p.tag.style.opacity = 0;
      if (p.voice) {
        const v = p.voice, P = v.pan;
        if (P.positionX) { P.positionX.value = _hp.x; P.positionY.value = _hp.y; P.positionZ.value = _hp.z; } else P.setPosition(_hp.x, _hp.y, _hp.z);
        p.level = level(v);
        p.body.setTalk(p.muted ? 0 : Math.min(1, p.level * 14));
        if ((p.level > TALK_RMS) !== !!p.tagTalk) drawTag(p);
      }
    }
  }

  return {
    open, close, toggle: () => (isOpen ? close() : open()), update, key, join,
    get isOpen() { return isOpen; }, get inRoom() { return !!room; }, get code() { return code; }, get count() { return room ? others.size + 1 : 0; },
    get outfit() { return outfit; }, get synced() { return synced; }, _others: others,
    _talk: on => setTalk(on),
    _dbg: () => ({ synced, gardenOf, asked, pending: pendingW.length, big: [...bigIn.values()].map(b => b.got + '/' + b.parts.length), alone: room && room.alone, id: room && room.id, host: !!room && isHost(room.id), peers: room ? [...room.peers.values()].map(p => [p.path, !!p.opened, p.dc && p.dc.readyState, p.n]) : [] }),
    _stats: async () => { const out = { ctx: o.audio && o.audio().ctx ? o.audio().ctx.state : null, links: [] };
      if (room) for (const p of room.peers.values()) if (p.pc) { const r = await p.pc.getStats(); r.forEach(x => { if (x.type === 'inbound-rtp' && x.kind === 'audio') out.links.push({ inBytes: x.bytesReceived, level: x.audioLevel, energy: x.totalAudioEnergy }); if (x.type === 'outbound-rtp' && x.kind === 'audio') out.links.push({ outBytes: x.bytesSent }); }); }
      const v = [...others.values()].find(p => p.voice); if (v) { const b = v.voice.buf; v.voice.an.getFloatTimeDomainData(b); let m = 0; for (const x of b) m = Math.max(m, Math.abs(x)); out.raw = m; }
      return out; },
    _state: () => ({ mic: !!micStream, live: !!(micTrack && micTrack.enabled), ctx: !!(o.audio && o.audio().ctx), peers: room ? [...room.peers.values()].map(p => ({ path: p.path, sig: p.pc && p.pc.signalingState, conn: p.pc && p.pc.connectionState,
      send: p.pc ? p.pc.getSenders().map(x => x.track ? x.track.kind + ':' + x.track.enabled : '-') : [], recv: p.pc ? p.pc.getReceivers().map(x => x.track ? x.track.kind + ':' + x.track.readyState + ':' + x.track.muted : '-') : [] })) : [],
      voices: [...others.values()].map(p => ({ name: p.name, voice: !!p.voice, level: +(p.level || 0).toFixed(4) })) }),
  };
}
