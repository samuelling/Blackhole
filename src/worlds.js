// worlds.js: gardens kept online (the garden-worlds Cloudflare Worker, worker/worlds.js), and garden files.
//
// Your own garden is kept in this browser as before, and now also online, under a secret link (an id and a key, made the first time
// it is saved). Open that link on another device and the same garden comes up there; whichever device last changed it, its garden is
// the one the others take on when they open. A room's garden is kept online by its code: whoever has been in the room longest saves
// it now and then, and someone opening the room when nobody is there gets it as it was left. A garden file is the whole garden in one
// download (gzip'd JSON), to keep or to load anywhere, with no server.
//
// What travels: the garden in four parts (the wall and free builds; the planting; the junk heap; the junk's pieces, which are its
// heavy part and change least). A save sends only the parts that changed since the last one, every 20 s at most (15 s in a room),
// and only while the page is in front. The worker keeps each garden's last 12 saves.

export const WORLDS = new URLSearchParams(location.search).get('worlds') || window.GD_WORLDS || 'https://garden-worlds.samuelling.workers.dev';
const KEY = 'gd.online.v1', PREV = 'gd.online.prev';
const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
const rand = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(b => B32[b & 31]).join(''); };
const fnv = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36) + ':' + s.length; };
/** The garden in parts, as strings. */
export function toParts(w) {
  const j = w.junk || null;
  const parts = { wall: JSON.stringify(w.wall || null), plants: JSON.stringify(w.plants || null) };
  if (w.arms) parts.arms = JSON.stringify(w.arms);   // the guns lying about (arms.js)
  if (j) { parts.heap = JSON.stringify({ heap: j.heap, seq: j.seq, since: j.since, recipes: j.recipes }); parts.pieces = JSON.stringify(j.pieces || {}); }
  return parts;
}
export function fromParts(p) {
  const P = k => { try { return p[k] ? JSON.parse(p[k]) : null; } catch (e) { return null; } };
  const w = { wall: P('wall'), plants: P('plants'), arms: P('arms') }, h = P('heap'), pc = P('pieces');
  if (h) w.junk = { ...h, pieces: pc || {} };
  return w;
}
const when = t => { const d = new Date(t), now = new Date(); return d.toDateString() === now.toDateString() ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };

/**
 * o: { world: { snapshot(light), adopt(w), guest }, multi (inRoom, synced, keeper, code) or null, hint(text, ms), started(): bool }
 */
export function createWorlds(o) {
  let me = null; try { me = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(me)); } catch (e) {} };
  const room = { code: '', rev: 0, h: {}, failed: '' };   // failed: a room whose saved garden could not be fetched, so is never saved over
  let ready = false, busy = false, nextAt = 0, status = me ? 'online' : 'not yet saved online', lastErr = '', soloAt = 0, roomAt = 0;
  const req = async (path, opt = {}, key) => {
    const r = await fetch(WORLDS + path, { ...opt, headers: { ...(opt.headers || {}), ...(key ? { 'x-key': key } : {}), ...(opt.body ? { 'content-type': 'application/json' } : {}) } });
    if (r.status === 404) return null;
    if (!r.ok) { let e = ''; try { e = (await r.json()).error; } catch (_) {} throw new Error(e || 'HTTP ' + r.status); }
    return r.json();
  };
  const ownWid = () => { try { return o.world.snapshot(true).wall.wid; } catch (e) { return ''; } };
  /** Take a garden on as your own (this browser keeps it from now on). */
  function makeMine(w) {
    if (o.world.guest) return false;
    if (w.wall) w.wall.wid = ownWid();
    return o.world.adopt(w);
  }
  // ---------------------------------------------------------------- saving
  async function put(path, key, parts, last) {
    const changed = {}, h = {}; let n = 0;
    for (const [k, s] of Object.entries(parts)) { h[k] = fnv(s); if (h[k] !== last[k]) { changed[k] = s; n++; } }
    if (!n) return null;
    const r = await req(path, { method: 'PUT', body: JSON.stringify({ parts: changed }) }, key);
    return r ? { rev: r.rev, t: r.t, h } : null;
  }
  async function saveSolo(force) {
    if (o.world.guest) return;
    if (!me) { me = { id: 's' + rand(16), key: rand(24), rev: 0, h: {}, changedAt: Date.now(), savedAt: 0 }; keep(); }
    const snap = o.world.snapshot(false); if (snap.wall) snap.wall = { ...snap.wall, wid: me.id };   // stored under the garden's own name, not this browser's
    const parts = toParts(snap), h = {}; for (const [k, s] of Object.entries(parts)) h[k] = fnv(s);
    if (!me) { me = { id: 's' + rand(16), key: rand(24), rev: 0, h: {}, changedAt: Date.now(), savedAt: 0 }; keep(); }
    if (Object.keys(h).some(k => h[k] !== me.h[k])) { if (!me.dirty) { me.dirty = true; me.changedAt = Date.now(); keep(); } } else if (!force) return;
    const r = await put('/w/' + me.id, me.key, parts, force ? {} : me.h);
    if (r) { me.rev = r.rev; me.h = r.h; me.savedAt = r.t; me.dirty = false; keep(); status = `saved online ${when(r.t)}`; }
  }
  async function saveRoom() {
    const m = o.multi; if (!m || !m.inRoom || !m.synced || !m.keeper || room.failed === m.code) return;
    if (room.code !== m.code) { room.code = m.code; room.rev = 0; room.h = {}; }
    const r = await put('/w/r-' + m.code, null, toParts(o.world.snapshot(false)), room.h);
    if (r) { room.rev = r.rev; room.h = r.h; status = `room ${m.code} saved online ${when(r.t)}`; }
  }
  async function tick() {
    if (!ready || busy || document.hidden || !o.started()) return;   // (nothing is saved until the online garden has been looked at)
    const now = performance.now(), inRoom = o.multi && o.multi.inRoom;
    if (now < nextAt) return; nextAt = now + (inRoom ? 15000 : 20000);
    busy = true;
    try { if (inRoom) await saveRoom(); if (!o.world.guest) await saveSolo(false); lastErr = ''; }
    catch (e) { lastErr = String(e.message || e); status = `could not save online (${lastErr}); kept in this browser`; if (lastErr === 'too soon') nextAt = now + 5000; }
    busy = false;
  }
  // ---------------------------------------------------------------- opening
  /** At start: a garden link in the address, or this browser's online garden if it has changed elsewhere since. */
  async function init() { try { await open(); } finally { ready = true; } }
  async function open() {
    const q = new URLSearchParams(location.search), g = q.get('garden');
    let fromLink = false;
    if (g && /^s[a-z2-7]{16}\.[a-z2-7]{24}$/.test(g)) {
      const [id, key] = g.split('.');
      if (!me || me.id !== id) { if (me) try { localStorage.setItem(PREV, JSON.stringify(me)); } catch (e) {} me = { id, key, rev: 0, h: {}, changedAt: 0, savedAt: 0 }; keep(); fromLink = true; }
      try { const u = new URL(location.href); u.searchParams.delete('garden'); history.replaceState(null, '', u); } catch (e) {}
    }
    if (!me) return;
    try {
      const meta = await req(`/w/${me.id}/meta`, {}, me.key);
      if (!meta) { status = 'not yet saved online'; return; }
      if (meta.rev <= me.rev && !fromLink) { status = `online · saved ${when(meta.t)}`; return; }
      if (me.dirty && me.changedAt > meta.t && !fromLink) { status = 'this browser has newer changes: they will be saved online'; return; }   // changed here since, offline
      const w = await req(`/w/${me.id}`, {}, me.key); if (!w) return;
      if (makeMine(fromParts(w.parts))) {
        me.rev = w.rev; me.h = Object.fromEntries(Object.entries(w.parts).map(([k, s]) => [k, fnv(s)])); me.savedAt = w.t; me.dirty = false; keep();
        status = `online · saved ${when(w.t)}`;
        o.hint(fromLink ? 'your garden, from its link: this browser keeps it now too' : `your garden as it was saved online ${when(w.t)} (on another device)`, 7000);
      }
    } catch (e) { status = `offline: the garden in this browser is used (${e.message || e})`; }
  }
  /** A room with nobody in it: its garden as it was left, or null to start it from yours. Mine (it is this browser's own) only if newer. */
  async function roomGarden(code) {
    try {
      const w = await Promise.race([req('/w/r-' + code), new Promise(r => setTimeout(() => r('slow'), 60000))]);
      if (w === 'slow') throw new Error('slow');
      if (room.failed === code) room.failed = '';
      if (!w) return null;
      const g = fromParts(w.parts);
      room.code = code; room.rev = w.rev; room.h = Object.fromEntries(Object.entries(w.parts).map(([k, s]) => [k, fnv(s)]));
      if (g.wall && g.wall.wid === ownWid() && me && me.changedAt > w.t) return null;   // your own garden, changed here since the room last saved it
      return g;
    } catch (e) { room.failed = code; o.hint(`the room's saved garden could not be fetched: you are in yours, and the room's is left as it was`, 7000); return null; }
  }
  /** A code for a new room that no saved garden has. */
  async function newCode() { try { const r = await Promise.race([req('/room/new'), new Promise(r => setTimeout(() => r(null), 5000))]); return r && r.code || null; } catch (e) { return null; } }

  // ---------------------------------------------------------------- earlier saves, and files
  async function earlier() {
    const m = o.multi, inRoom = m && m.inRoom;
    if (inRoom && m.count > 1) { o.hint('only with nobody else in the room', 4000); return; }
    const path = inRoom ? '/w/r-' + m.code : me ? '/w/' + me.id : null, key = inRoom ? null : me && me.key;
    if (!path) { o.hint('nothing saved online yet', 3000); return; }
    let revs; try { revs = await req(path + '/revs', {}, key); } catch (e) { o.hint('could not reach the saves: ' + e.message, 4000); return; }
    if (!revs || !revs.length) { o.hint('nothing saved online yet', 3000); return; }
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);font:13px/1.5 "IBM Plex Mono",ui-monospace,monospace;color:#e9e4da';
    box.innerHTML = `<div style="background:rgba(10,12,14,.96);border:1px solid rgba(233,228,218,.2);border-radius:14px;padding:16px 18px;min-width:280px;max-height:80vh;overflow:auto">
      <div style="font:500 20px 'Cormorant Garamond',Georgia,serif;margin-bottom:8px">${inRoom ? 'Room ' + m.code + ': earlier saves' : 'Your garden: earlier saves'}</div>
      ${revs.map((r, i) => `<button data-rev="${r.rev}" style="display:block;width:100%;text-align:left;margin:4px 0;padding:8px 10px;border-radius:9px;border:1px solid rgba(233,228,218,.16);background:none;color:inherit;font:inherit;cursor:pointer">${when(r.t)}${i ? '' : ' · latest'} <span style="opacity:.5">· ${Math.round(r.size / 1024)} KB</span></button>`).join('')}
      <button data-x="1" style="margin-top:8px;padding:6px 12px;border-radius:9px;border:0;background:#e9e4da;color:#111;font:inherit;cursor:pointer">cancel</button></div>`;
    document.body.append(box);
    box.addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) { if (e.target === box) box.remove(); return; } if (b.dataset.x) { box.remove(); return; }
      box.remove();
      try { const w = await req(path + '?rev=' + b.dataset.rev, {}, key); if (!w) return; const g = fromParts(w.parts);
        if (inRoom) o.world.adopt(g); else makeMine(g);
        nextAt = 0; if (me && !inRoom) { me.h = {}; } if (inRoom) room.h = {};   // and save it as the latest
        o.hint(`back to the garden as it was ${when(w.t)}`, 5000);
      } catch (err) { o.hint('could not fetch that save: ' + err.message, 4000); }
    });
  }
  async function exportFile() {
    const s = JSON.stringify({ gardenOfDelight: 1, saved: new Date().toISOString(), parts: toParts(o.world.snapshot(false)) });
    let blob = new Blob([s], { type: 'application/json' }), ext = 'json';
    if (window.CompressionStream) { blob = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob(); ext = 'json.gz'; }
    const a = document.createElement('a'), d = new Date();
    a.href = URL.createObjectURL(blob); a.download = `garden-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.garden.${ext}`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    o.hint(`saved to a file (${Math.round(blob.size / 1024)} KB)`, 4000);
  }
  function importFile() {
    if (o.world.guest || (o.multi && o.multi.inRoom)) { o.hint('leave the room first: a garden file loads into your own garden', 4000); return; }
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.gz,.json,application/json,application/gzip';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      try {
        const head = new Uint8Array(await f.slice(0, 2).arrayBuffer()), gz = head[0] === 0x1f && head[1] === 0x8b;
        const text = gz ? await new Response(f.stream().pipeThrough(new DecompressionStream('gzip'))).text() : await f.text();
        const d = JSON.parse(text); if (!d || !d.gardenOfDelight || !d.parts) throw new Error('not a garden file');
        if (!confirm('Replace the garden in this browser with the one in this file? (The one here now stays among your online saves.)')) return;
        if (makeMine(fromParts(d.parts))) { nextAt = 0; o.hint('the garden from the file is here', 4000); }
      } catch (e) { o.hint('could not load that file: ' + (e.message || e), 5000); }
    };
    inp.click();
  }
  async function copyLink() {
    if (!me) { try { await saveSolo(true); } catch (e) { o.hint('could not save online: ' + e.message, 4000); return; } }
    const url = `https://linglab.org/blackhole/?garden=${me.id}.${me.key}`;
    try { await navigator.clipboard.writeText(url); o.hint('link to your garden copied · anyone with it can open and change your garden, so keep it to yourself', 7000); }
    catch (e) { prompt('Your garden\'s link (keep it to yourself: anyone with it can change your garden):', url); }
  }
  return { init, tick, roomGarden, newCode, earlier, exportFile, importFile, copyLink,
    get status() { return status; }, get id() { return me && me.id; },
    saveNow: () => { nextAt = 0; return tick(); } };
}
