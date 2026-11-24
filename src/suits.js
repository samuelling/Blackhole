// suits.js: the other suits you can wear (tools/blender/build_suits.py makes them from NASA's free models). Each is a model of the same
// fifteen named parts as the first suit, fetched the first time somebody in the garden wears it and then shared by everyone who does.
import { loadModel } from './garden.js';

const cache = new Map();
/** The model for a suit id (outfits.js BODIES), as a promise. */
export function loadSuit(id) {
  if (!/^[a-z0-9]{2,12}$/.test(id)) return Promise.reject(new Error('no such suit'));
  if (!cache.has(id)) cache.set(id, loadModel(new URL(`../assets/models/suit_${id}.json`, import.meta.url).href).then(sc => { sc.traverse(m => { if (m.isMesh) m.geometry.userData.shared = true; }); return sc; }, e => { cache.delete(id); throw e; }));
  return cache.get(id);
}
