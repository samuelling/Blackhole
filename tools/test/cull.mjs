// An overfull junk heap vaporizes pieces off its top until it is under the mark again. Run as share.mjs is run (see there).
import * as THREE from 'three'; import fs from 'fs';
globalThis.localStorage = { d: {}, getItem(k){ return this.d[k] ?? null; }, setItem(k,v){ this.d[k]=v; } }; globalThis.addEventListener = () => {}; globalThis.document = { hidden: false };
const { createJunk } = await import('./src/junk.js'); const { heightAt } = await import('./src/field.js');
const hints = []; let vap = 0;
const junk = createJunk({ scene: new THREE.Group(), U: { uTime: { value: 0 } }, COMMON: '', P: { std: p => new THREE.MeshStandardMaterial(p) }, heightAt, mailbox: false, hint: t => hints.push(t), onVaporize: () => vap++ });
const L = JSON.parse(fs.readFileSync('wtest.json', 'utf8')); let T = 0; const run = n => { for (let i = 0; i < n; i++) { T += 1 / 30; junk.update(1 / 30, T); } };
for (let k = 0; k < 19; k++) { const d = JSON.parse(JSON.stringify(L[1])); d.id = 'd' + k; junk.receive(d); } junk.finish();
const n0 = junk.count, y0 = junk.hole.y; run(30 * 90);
console.log('pieces before', n0, 'after', junk.count, 'vaporized with a flash', vap, 'hint:', hints.find(h => /too big/.test(h)) ? 'yes' : 'no', '| hole y', y0.toFixed(1), '->', junk.hole.y.toFixed(1));
console.log(junk.count <= 700 * 0.85 + 1 && n0 > 700 ? 'PASS' : 'FAIL');
