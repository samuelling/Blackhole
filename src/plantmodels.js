// plantmodels.js: plants modelled in Blender (tools/blender/build_plants.py), drawn in place of the garden's own procedural ones near you.
//
// Each species comes as assets/plants/<key>.json (glTF, buffer embedded), with its atlas <key>.webp and normal map <key>_n.webp. It has
// three variants, each a plant's foliage (leaf_<v>) and stems (stem_<v>) standing on its own origin, empties (fl_<v>_<n>) where its flower
// heads go, and the head meshes; every part also comes in a lighter _lo version.
//
// Distance decides how a plant is drawn: within NEAR it is the full model, out to FAR the light one, and beyond that the garden's own
// procedural plant, which is much cheaper. Each species-part is one InstancedMesh whose instances are re-chosen a few times a second as you
// move. A plant being drawn from its model is flagged in the garden's plant table (uPlantA.w + 8), and the procedural parts of a flagged
// plant fold away to nothing in the shader; so there is never both, and never neither.
//
// The seasons work on the models as on everything else: the instances carry their plant's index (aPlant), so foliage grows in spring and dies
// back, stems stand while there are flowers or seed, heads open with the bloom and brown into seed heads, and the wind sways all of it.
import * as THREE from 'three';
import { loadModel } from './garden.js';

export const MODELLED = ['sesleria', 'geranium', 'lavandula', 'coreopsis', 'nepeta', 'echinacea'];
const FLAG = 8;

/** Fetch every modelled species (missing ones are simply left to the procedural plants). */
export async function loadPlantModels(base, renderer) {
  const tl = new THREE.TextureLoader(), aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy()), out = {};
  const T = (f, srgb) => new Promise((res, rej) => tl.load(base + 'plants/' + f + '.webp', t => { t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = aniso; res(t); }, undefined, rej));
  await Promise.all(MODELLED.map(k => Promise.all([loadModel(base + 'plants/' + k + '.json'), T(k, true), T(k + '_n', false)])
    .then(([scene, map, nmap]) => { out[k] = { scene, map, nmap }; }, () => {})));
  return out;
}

/** o: { scene, P (the garden's material factory), cut, PT, pa, texA, flagsFor, models (from loadPlantModels), lite } */
export function createPlantModels(o) {
  const { P, PT, pa, texA, flagsFor } = o, root = new THREE.Group(); root.name = 'plant models'; o.scene.add(root);
  const NEAR = o.lite ? 5.5 : 8, FAR = o.lite ? 14 : 22, SP = {};
  for (const [k, M] of Object.entries(o.models || {})) {
    const byName = {}; M.scene.traverse(n => { byName[n.name] = n; }); M.scene.updateMatrixWorld(true);
    const geo = n => byName[n] && byName[n].isMesh ? byName[n].geometry : null, nodeM = n => byName[n] ? byName[n].matrixWorld.clone() : new THREE.Matrix4();
    const variants = [];
    for (let v = 0; v < 8 && geo('leaf_' + v); v++) {
      const heads = []; M.scene.traverse(n => { if (n.name.startsWith(`fl_${v}_`)) heads.push(n.matrixWorld.clone()); });
      variants.push({ leaf: [geo('leaf_' + v), geo(`leaf_${v}_lo`)], stem: [geo('stem_' + v), geo(`stem_${v}_lo`)], leafM: [nodeM('leaf_' + v), nodeM(`leaf_${v}_lo`)], stemM: [nodeM('stem_' + v), nodeM(`stem_${v}_lo`)], heads });
    }
    if (!variants.length) continue;
    const head = [geo('head'), geo('head_lo')], headM = [nodeM('head'), nodeM(geo('head_lo') ? 'head_lo' : 'head')];
    const base = { map: M.map, normalMap: M.nmap, normalScale: new THREE.Vector2(0.8, 0.8), alphaTest: 0.4, side: THREE.DoubleSide };
    const mat = {
      leaf: P.std(o.cut(Object.assign({ roughness: 0.6 }, base)), { sway: 1, translucent: true, grow: true, part: 'leaf', model: true, key: 'pm' + k }),
      stem: P.std(o.cut(Object.assign({ roughness: 0.7 }, base)), { sway: 1, grow: true, part: 'stem', model: true, key: 'pm' + k }),
      head: P.std(o.cut(Object.assign({ roughness: 0.55 }, base)), { sway: 1, translucent: true, grow: true, part: 'flower', model: true, key: 'pm' + k }),
    };
    const dep = { leaf: P.depth(M.map, { sway: 1, grow: true, part: 'leaf', model: true }), stem: P.depth(M.map, { sway: 1, grow: true, part: 'stem', model: true }), head: P.depth(M.map, { sway: 1, grow: true, part: 'flower', model: true }) };
    const n = PT.k.filter(kk => kk === k).length + 64, maxHeads = Math.max(...variants.map(V => V.heads.length));
    const meshes = [];
    // one InstancedMesh per variant, part and tier; heads one per tier, shared by every variant
    const mk = (g, part, cap) => {
      if (!g) return null; const gg = g.clone(); gg.setAttribute('aPlant', new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage));
      const im = new THREE.InstancedMesh(gg, mat[part], cap); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.count = 0; im.frustumCulled = false;
      im.customDepthMaterial = dep[part]; im.castShadow = true; im.receiveShadow = true; root.add(im); meshes.push(im); return im;
    };
    const light = (T) => { for (const pp of T.parts) for (const im of [pp.leaf, pp.stem]) if (im) im.castShadow = false; if (T.head) T.head.castShadow = false; return T; };
    const tiers = [0, 1].map(t => ({
      parts: variants.map(V => ({ leaf: mk(V.leaf[t], 'leaf', n), stem: mk(V.stem[t], 'stem', n) })),
      head: mk(head[t] || head[0], 'head', n * maxHeads),
    }));
    light(tiers[1]);   // the light versions, further off, leave their shadows to the procedural plants' scale of things
    SP[k] = { variants, tiers, meshes, headM };
  }
  const keys = Object.keys(SP);
  const m4 = new THREE.Matrix4(), m5 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const hash = i => { let h = (i * 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296; };
  let lastX = 1e9, lastZ = 1e9, lastN = -1, lastA = 1e9, enabled = true; const fwd = new THREE.Vector3();
  const counts = { near: 0, far: 0 };
  function refresh(cx, cz, fx, fz) {   // f: which way you are looking, flattened; plants well behind you stay procedural
    const NP = PT.k.length;
    for (const k of keys) { const S = SP[k]; for (const T of S.tiers) { for (const pp of T.parts) { if (pp.leaf) pp.leaf.count = 0; if (pp.stem) pp.stem.count = 0; } if (T.head) T.head.count = 0; } }
    let changed = false; counts.near = counts.far = 0;
    for (let i = 0; i < NP; i++) {
      const S = SP[PT.k[i]]; let tier = -1;
      if (S && enabled && !PT.gone[i]) { const dx = PT.x[i] - cx, dz = PT.z[i] - cz, d = Math.hypot(dx, dz);
        const c = dx * fx + dz * fz; if (d < 2.5 || (d < NEAR ? c > -0.2 * d : c > 0.45 * d)) tier = d < NEAR ? 0 : d < FAR ? 1 : -1; }   // near: 100 degrees either side of your gaze (all round, close by); further: 63
      if (S) { const w = flagsFor(PT.k[i]) + (tier >= 0 ? FLAG : 0); if (pa[i * 4 + 3] !== w) { pa[i * 4 + 3] = w; changed = true; } }   // (written every time: setting a plant out rewrites its row)
      if (tier < 0) continue;
      const vi = Math.floor(hash(i) * S.variants.length), V = S.variants[vi], T = S.tiers[tier], pp = T.parts[vi];
      // the plant's own turn and a little difference in size, steady from visit to visit
      q.setFromAxisAngle(Y, hash(i + 7919) * Math.PI * 2); const sc = 0.88 + 0.24 * hash(i + 104729); s.set(sc, sc, sc); p.set(PT.x[i], PT.y[i], PT.z[i]); m4.compose(p, q, s);
      for (const [im, NM] of [[pp.leaf, V.leafM[tier]], [pp.stem, V.stemM[tier]]]) if (im) { m5.multiplyMatrices(m4, NM); im.setMatrixAt(im.count, m5); im.geometry.attributes.aPlant.array[im.count] = i; im.count++; }
      if (T.head) for (const H of V.heads) { m5.multiplyMatrices(m4, H).multiply(S.headM[tier]); T.head.setMatrixAt(T.head.count, m5); T.head.geometry.attributes.aPlant.array[T.head.count] = i; T.head.count++; }
      if (tier === 0) counts.near++; else counts.far++;
    }
    for (const k of keys) for (const im of SP[k].meshes) { im.instanceMatrix.needsUpdate = true; im.geometry.attributes.aPlant.needsUpdate = true; }
    if (changed) texA.needsUpdate = true;
  }
  return {
    species: keys, counts,
    /** Re-choose which plants are drawn as models, when you have moved a metre or the garden has changed. */
    update(camera) { const cx = camera.position.x, cz = camera.position.z; if (camera.getWorldDirection) camera.getWorldDirection(fwd); else fwd.set(0, 0, -1); const a = Math.atan2(fwd.x, fwd.z), fl = Math.hypot(fwd.x, fwd.z) || 1;   // (seen from space there is no gaze: the anchor is a bare point)
      let da = Math.abs(a - lastA); if (da > Math.PI) da = 2 * Math.PI - da;
      if (Math.hypot(cx - lastX, cz - lastZ) > 1 || da > 0.35 || PT.k.length !== lastN) { lastX = cx; lastZ = cz; lastA = a; lastN = PT.k.length; refresh(cx, cz, fwd.x / fl, fwd.z / fl); } },
    setEnabled(v) { enabled = !!v; lastX = 1e9; },
    /** Something about the plants has changed (one dug up, one set out): choose again next frame. */
    touch() { lastX = 1e9; },
    get enabled() { return enabled; },
    /** Triangles the models put on screen at most (every instance, before culling), and how many plants each way. */
    stats() { let t = 0; for (const k of keys) for (const im of SP[k].meshes) t += im.count * (im.geometry.index ? im.geometry.index.count : im.geometry.attributes.position.count) / 3; return { triangles: Math.round(t), near: counts.near, far: counts.far }; },
  };
}
