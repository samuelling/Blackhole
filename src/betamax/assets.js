// From Betamax (samuelling/betamax, src/assets.js): only its model loader, for the two downloaded rifles the guns are dressed in.
// The models live in assets/betamax/models/ (binary glTF as base64 in .json).
import * as THREE from 'three';
const BASE = (() => { try { return new URL('./assets/betamax/', location.href).href; } catch (e) { return './assets/betamax/'; } })();
const OFF = typeof location !== 'undefined' && /[?&]noassets\b/.test(location.search);
// downloaded models (glTF binary, meshopt-compressed, WebP textures): one load per file, shared by every user
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
const models = new Map();
export function loadModel(file) {
  if (!models.has(file)) models.set(file, new Promise((res, rej) => {
    if (OFF) return rej(new Error('off'));
    const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder);
    // the binary glTF travels as base64 inside a .json (a type any static host will serve)
    fetch(BASE + 'models/' + file.replace(/\.glb$/, '.json')).then((r) => { if (!r.ok) throw new Error('missing ' + file); return r.json(); }).then((j) => {
      const bin = atob(j.glb), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      l.parse(u8.buffer, '', (g) => { g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; for (const m of [].concat(o.material)) { if (m.map) m.map.anisotropy = 8; if (m.transmission > 0) { m.transmission = 0; m.thickness = 0; m.transparent = false; m.opacity = 1; m.color.multiplyScalar(0.12); m.roughness = 0.08; m.metalness = 0.3; } } } }); res(g.scene); }, (e) => rej(e)); }).catch(rej);
  }));
  return models.get(file);
}
// first node (depth-first) whose name contains the text
export function findNode(root, text) { let hit = null; root.traverse((o) => { if (!hit && o.name && o.name.toLowerCase().includes(text.toLowerCase())) hit = o; }); return hit; }

export function loadJSON_(file) { return OFF ? Promise.reject(new Error('off')) : fetch(BASE + file).then((r) => { if (!r.ok) throw new Error('missing ' + file); return r.json(); }); }
