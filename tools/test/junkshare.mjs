// Two-player check of shared junk, run in node with no browser: each player is a real instance of the game's own module, joined by an in-memory bus.
// To run: a folder holding src/ and vendor/ from this repo, `npm i three@0.160`, this file and wtest.json (two Shred Hole deliveries), then `node junkshare.mjs`.
import * as THREE from 'three'; import fs from 'fs';
const mkLS = () => ({ d: {}, getItem(k){ return this.d[k] ?? null; }, setItem(k,v){ this.d[k]=v; } });
globalThis.localStorage = mkLS(); globalThis.addEventListener = () => {}; globalThis.document = { hidden: true };
const { createJunk } = await import('./src/junk.js'); const { heightAt } = await import('./src/field.js');
const P = { std: p => new THREE.MeshStandardMaterial(p) }; const bus = [], peers = {}; let bytes = 0;
function mk(name, host) { const scene = new THREE.Group(); const junk = createJunk({ scene, U: { uTime: { value: 0 } }, COMMON: '', P, heightAt, mailbox: false });
  junk.net.attach({ send: (m, to) => bus.push([name, JSON.stringify(m)]), id: name, host: () => host, ready: () => true }); return peers[name] = { name, junk }; }
const pump = () => { for (const [from, s] of bus.splice(0)) { bytes += s.length; for (const c of Object.values(peers)) if (c.name !== from) c.junk.net.onMsg(JSON.parse(s)); } };
let T = 0; const run = n => { for (let i = 0; i < n; i++) { T += 1 / 60; for (const c of Object.values(peers)) c.junk.update(1 / 60, T, 0, 0); pump(); } };
const ok = (n, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : ''));
const heapOf = c => JSON.stringify([...c.junk.net.snapshot().heap].sort((a, b) => a[0] < b[0] ? -1 : 1));
const L = JSON.parse(fs.readFileSync('wtest.json', 'utf8'));
const H = mk('H', true); H.junk.receive(L[0]); run(60 * 40); H.junk.finish();
const n0 = H.junk.count; ok('host has a delivery', n0 > 0, n0 + ' pieces');
const G = mk('G', false); G.junk.net.adopt(JSON.parse(JSON.stringify(H.junk.net.snapshot())), false); const snapKB = (JSON.stringify(H.junk.net.snapshot()).length / 1024).toFixed(1);
ok('guest takes on the heap', G.junk.count === n0 && heapOf(G) === heapOf(H), 'snapshot ' + snapKB + ' KB');
bytes = 0; const d = JSON.parse(JSON.stringify(L[1] || L[0])); d.id = 'second'; H.junk.receive(d); run(60 * 60);
const fl = [H.junk.flying, G.junk.flying]; H.junk.finish(); G.junk.finish();
ok('a later delivery lands for both, in the same places', H.junk.count > n0 && G.junk.count === H.junk.count && heapOf(G) === heapOf(H), `host ${H.junk.count}, guest ${G.junk.count}, still flying after a minute ${fl}, ${(bytes / 1024).toFixed(1)} KB sent`);
const id = G.junk.net.snapshot().heap[0][0]; G.junk.vaporize(id); run(5);
ok('guest vaporizes a piece: gone for the host', !H.junk.where(id) && H.junk.count === G.junk.count, `${H.junk.count} left`);
const id2 = H.junk.net.snapshot().heap[1][0], e2 = H.junk.net.snapshot().heap[1].slice(); H.junk.take(id2); run(5);
ok('host lifts a piece: off the guest\'s heap', !G.junk.where(id2) && G.junk.count === H.junk.count);
H.junk.giveBack(id2); run(5); ok('put back: back for both', !!G.junk.where(id2) && heapOf(G) === heapOf(H));
const before = G.junk.count; G.junk.net.release(); ok('guest leaves: its own (empty) heap back', G.junk.count === 0 && before > 0);
H.junk.vaporizeAll(); ok('host can clear', H.junk.count === 0);
