// arbor.js: trees you plant yourself. A sapling goes in where you point, and grows on its own clock (the same clock as every plant
// here: the season speed runs it, and a void nearby slows it). Most kinds grow to the size they reach in a garden on Earth, over
// decades. The giants keep going.
//
// Why the giants can: a tree's height is capped by how high it can lift water. Sap is pulled up the wood by evaporation from the
// leaves, and the column has to hold its own weight against gravity; the taller the tree, the harder its top leaves are starved
// (Koch et al. 2004 put the limit for redwoods at about 122-130 m). Inside the bubble things weigh 0.43 of what they do on Earth
// (the jump's gravity, 4.2 m/s²), so the same column can be about 2.3 times as tall. A giant is planted as one: it grows slowly, and
// for a long time, toward 2.3 times the height its kind reaches in the wild, until its top nears the bubble's skin.
//
// Each tree is drawn from the wood's own Blender forms (build_trees.py): the fused trunk and limbs, and the bough cards with their
// baked sky shading, a species' twig on each. A young tree is narrower in the crown than a grown one. A bough is never enlarged
// past about twice its size: a big tree's crown is filled by more boughs (the form's crown turned and laid over itself), not bigger ones.
import * as THREE from 'three';
import { BUBBLE, CENTRE } from './field.js';

export const G_BUBBLE = 4.2, G_EARTH = 9.81, LIFT = G_EARTH / G_BUBBLE;   // how much taller sap can be lifted here
export const ARBOR_MAX = 40;
// [species (leaves.js HABIT), common name, botanical name, height grown in a garden (m), height in the wild at its tallest (m), years to most of its height]
const KINDS = [
  ['saccharum', 'Sugar maple', 'Acer saccharum', 24, 36, 30],
  ['rubra', 'Red oak', 'Quercus rubra', 24, 38, 35],
  ['rubrum', 'Red maple', 'Acer rubrum', 18, 30, 20],
  ['papyrifera', 'Paper birch', 'Betula papyrifera', 18, 27, 14],
  ['lime', 'Linden', 'Tilia × europaea', 22, 40, 30],
  ['liquidambar', 'Sweetgum', 'Liquidambar styraciflua', 22, 40, 25],
  ['biloba', 'Ginkgo', 'Ginkgo biloba', 20, 40, 45],
  ['willow', 'Weeping willow', 'Salix babylonica', 14, 26, 10],
];
// the forms' crown radius and top (as garden.js NOM), crown-centre height, clear trunk and trunk radius at the ground (build_trees.py)
export const FORM = { tree_round_a: { A: 3.25, top: 7.0, cy: 4.6, H: 2.7, r0: 0.25 }, tree_round_b: { A: 3.25, top: 7.0, cy: 4.6, H: 2.7, r0: 0.25 },
  tree_weep: { A: 3.25, top: 7.0, cy: 4.6, H: 2.7, r0: 0.25 }, tree_birch: { A: 2.1, top: 8.1, cy: 5.1, H: 2.3, r0: 0.15 },
  tree_oak: { A: 4.0, top: 6.8, cy: 4.3, H: 2.3, r0: 0.33 }, tree_cone: { A: 2.5, top: 8.2, cy: 5.0, H: 1.8, r0: 0.21 } };
const H0 = 1.9;   // a whip from the nursery, about head height
const hash = (x, z, s = 0) => { let h = Math.imul(Math.floor(x * 100) ^ Math.imul(Math.floor(z * 100), 73856093) ^ s, 2654435761); h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return (h >>> 0) / 4294967296; };

/** The catalogue, for the planting menu (flora.js): a tree and a giant of each kind. */
export const TREE_FLORA = [];
export const TREE_SPEC = {};
for (const [sp, name, latin, hG, hW, yrs] of KINDS) {
  TREE_SPEC['T_' + sp] = { sp, giant: false, H: hG, tau: yrs / 1.6, name, latin };
  TREE_SPEC['G_' + sp] = { sp, giant: true, H: Math.round(hW * LIFT), tau: yrs * 2.6, name: `${name}, giant`, latin };
}
/** How high the bubble's skin is above a point of ground (m), less a margin: no tree grows into the skin. */
export function skinRoom(x, z, gy) { const d = Math.hypot(x - CENTRE.x, z - CENTRE.z); return BUBBLE.y + Math.sqrt(Math.max(0, BUBBLE.R * BUBBLE.R - d * d)) - gy - 7; }
/** A tree's height (m) at an age (years) on Earth-size or giant terms, to a ceiling. */
export function heightFor(spec, age, ceil = Infinity) {
  const Hm = Math.min(spec.H, ceil), x = 1 - Math.exp(-Math.max(0, age) / spec.tau);
  return H0 + (Hm - H0) * Math.pow(x, 1.25);
}

export function createArbor({ scene, kit, HABIT, SP_INDEX, twigRect, heightAt, registerPlant, PT, pa, texA, treeSp, flagsFor, nearestPid, onChange = () => {} }) {
  const { TV, vCards, barkT, leafM, leafD, cardGeo } = kit;
  const trees = [];
  const _M = new THREE.Matrix4(), _R = new THREE.Matrix4(), _W = new THREE.Matrix4(), _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3(), _bp = new THREE.Vector3();
  const _q = new THREE.Quaternion(), _Y = new THREE.Vector3(0, 1, 0), _p = new THREE.Vector3(), _s = new THREE.Vector3(), col = new THREE.Color();
  const formOf = (sp, x, z) => { const kind = HABIT[sp].kind; return kind === 'weep' ? 'tree_weep' : kind === 'birch' ? 'tree_birch' : kind === 'oak' ? 'tree_oak' : kind === 'cone' ? 'tree_cone' : hash(x, z, 3) < 0.5 ? 'tree_round_a' : 'tree_round_b'; };

  // the tree's shape at its height: young trees are narrow; giants are slimmer than the form, as tall trees are
  function shapeOf(t, H) {
    const F = FORM[t.form], sy = H / F.top, youth = 0.55 + 0.45 * Math.min(1, (H - H0) / 10), slim = t.spec.giant ? 1 - 0.3 * Math.min(1, Math.max(0, (H - 25) / 50)) : 1;
    const sxz = sy * youth * slim * t.wide;
    return { sy, sxz, r: F.r0 * sxz, cy: F.cy * sy, A: F.A * sxz, top: H, clear: F.H * sy };
  }
  function makeLeaves(t, n) {
    const base = vCards[t.form], N = base.length * n, g = cardGeo.clone();
    g.setAttribute('aPlant', new THREE.InstancedBufferAttribute(new Float32Array(N).fill(t.id), 1));
    const rect = twigRect(SP_INDEX[t.spec.sp]), R = new Float32Array(N * 4), L = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) { R.set(rect, i * 4); const c = base[i % base.length]; L[i * 2] = Math.pow(Math.min(1, Math.max(0, (c.c - 0.3) / 0.7)), 1.2); L[i * 2 + 1] = hash(t.x + i, t.z, 7); }
    g.setAttribute('aRect', new THREE.InstancedBufferAttribute(R, 4)); g.setAttribute('aLeaf', new THREE.InstancedBufferAttribute(L, 2));
    const im = new THREE.InstancedMesh(g, leafM, N); im.customDepthMaterial = leafD; im.castShadow = im.receiveShadow = true; im.frustumCulled = false;
    for (let i = 0; i < N; i++) { const c = base[i % base.length], v = Math.min(1.3, c.c * 1.4) * (0.92 + 0.16 * hash(t.x, t.z + i, 11)); im.setColorAt(i, col.setRGB(v, v, v)); }
    return im;
  }
  // a bough in its tree: placed by the tree's shape, its heading kept, its size its own times kL in every direction
  function boughM(out, M, cm, kL) {
    out.copy(M).multiply(cm); _bx.setFromMatrixColumn(cm, 0); const s0 = _bx.length() * kL;
    _bx.setFromMatrixColumn(out, 0); _by.setFromMatrixColumn(out, 1).normalize(); _bp.setFromMatrixPosition(out);
    _bx.addScaledVector(_by, -_bx.dot(_by)).normalize(); _bz.crossVectors(_bx, _by);
    return out.makeBasis(_bx.multiplyScalar(s0), _by.multiplyScalar(s0), _bz.multiplyScalar(s0)).setPosition(_bp);
  }
  function build(t, H) {
    const S = shapeOf(t, H), gy = heightAt(t.x, t.z);
    _M.compose(_p.set(t.x, gy, t.z), _q.setFromAxisAngle(_Y, t.turn), _s.set(S.sxz, S.sy, S.sxz));
    t.wood.setMatrixAt(0, _M); t.wood.instanceMatrix.needsUpdate = true;
    // boughs: about twice their own size at most; past that, the crown is filled by more of them
    const kL = Math.cbrt(S.sxz * S.sxz * S.sy), n = kL <= 2 ? 1 : Math.min(6, Math.ceil((kL / 2) ** 2)), kb = kL / Math.sqrt(n);
    if (!t.leaves || t.n !== n) { if (t.leaves) { scene.remove(t.leaves); t.leaves.geometry.dispose(); } t.leaves = makeLeaves(t, n); t.n = n; scene.add(t.leaves); }
    const base = vCards[t.form];
    for (let j = 0; j < n; j++) {
      const a = j ? j * 2.39996 + hash(t.x, t.z, j) * 0.4 : 0, sc = j ? 0.94 + 0.06 * hash(t.z, t.x, j) : 1;
      _R.compose(_p.set(t.x, gy, t.z), _q.setFromAxisAngle(_Y, t.turn + a), _s.set(S.sxz * sc, S.sy, S.sxz * sc));
      for (let i = 0; i < base.length; i++) t.leaves.setMatrixAt(j * base.length + i, boughM(_W, _R, base[i].m, kb));
    }
    t.leaves.instanceMatrix.needsUpdate = true;
    pa[t.id * 4 + 1] = gy + S.cy; texA.needsUpdate = true;   // the crown's centre, which its leaves are lit about
    t.H = H; t.S = S; t.gy = gy;
  }
  const ageOf = t => (PT.tau[t.id] - PT.planted[t.id]) / 365;
  const heightNow = t => heightFor(t.spec, ageOf(t), t.ceil);

  function plant(k, x, z, ageDays = 0) {
    const spec = TREE_SPEC[k]; if (!spec || trees.length >= ARBOR_MAX) return null;
    const gy = heightAt(x, z), form = formOf(spec.sp, x, z);
    const id = registerPlant('tree', x, 0, z, x, gy + 3, z);
    treeSp[id] = SP_INDEX[spec.sp]; pa.set([x, gy + 3, z, flagsFor('tree')], id * 4); texA.needsUpdate = true;
    const near = nearestPid(x, z); PT.tau[id] = PT.tau[near] || 0; PT.planted[id] = PT.tau[id] - ageDays;
    const wood = new THREE.InstancedMesh(TV[form].wood, barkT, 1); wood.setColorAt(0, col.setRGB(...HABIT[spec.sp].bark)); wood.castShadow = wood.receiveShadow = true; wood.frustumCulled = false; scene.add(wood);
    const t = { id, k, spec, x, z, form, wood, leaves: null, n: 0, turn: hash(x, z, 1) * Math.PI * 2, wide: 0.9 + 0.2 * hash(x, z, 2), ceil: skinRoom(x, z, gy), H: 0 };
    trees.push(t); build(t, heightNow(t)); onChange(); return id;
  }
  function remove(id) {
    const i = trees.findIndex(t => t.id === id); if (i < 0) return false; const t = trees[i];
    scene.remove(t.wood); scene.remove(t.leaves); t.leaves.geometry.dispose(); PT.gone[id] = 1; trees.splice(i, 1); onChange(); return true;
  }
  // growing: a tree whose height has moved on by more than 1.5% is redrawn, one tree a frame
  let next = 0;
  function update() {
    if (!trees.length) return;
    for (let k = 0; k < trees.length; k++) { const t = trees[(next + k) % trees.length], H = heightNow(t);
      if (Math.abs(H - t.H) > t.H * 0.015) { build(t, H); next = (next + k + 1) % trees.length; return; } }
  }
  const trunkR = (t, y) => t.S.r * (1 - 0.55 * Math.min(1, Math.max(0, y) / Math.max(1, t.S.cy)));
  return {
    plant, remove, update, get count() { return trees.length; }, max: ARBOR_MAX,
    has: id => trees.some(t => t.id === id),
    /** Your tree nearest a point, within d metres of its trunk. */
    near(x, z, d) { let best = null, bd = d; for (const t of trees) { const q = Math.hypot(t.x - x, t.z - z) - t.S.r; if (q < bd) { bd = q; best = t; } }
      return best && { id: best.id, k: best.k, x: best.x, z: best.z, age: ageOf(best), crowd: 1, size: best.H / Math.min(best.spec.H, best.ceil), height: best.H, tree: true }; },
    list: () => trees.map(t => [t.k, Math.round(t.x * 100) / 100, Math.round(t.z * 100) / 100, Math.round(PT.tau[t.id] - PT.planted[t.id])]),
    clear() { for (const t of trees.slice()) remove(t.id); },
    /** Is a point inside one of these trunks (walking)? */
    blocks(x, z) { for (const t of trees) { const r = t.S.r + 0.25; if ((x - t.x) ** 2 + (z - t.z) ** 2 < r * r) return true; } return false; },
    /** The nearest trunk within reach, for climbing (as garden.trunkNear). */
    trunkNear(x, z, reach) { let best = null, bd = reach; for (const t of trees) { const q = Math.hypot(t.x - x, t.z - z) - t.S.r; if (q < bd) { bd = q; best = t; } }
      if (!best) return null; const t = best; return { x: t.x, z: t.z, gy: t.gy, top: Math.max(0.5, t.H - 1.4), r: y => trunkR(t, y), mine: true, H: t.H }; },
    /** Is there room for a trunk here: how near the nearest of these is, less its trunk. */
    gap(x, z) { let g = 1e9; for (const t of trees) g = Math.min(g, Math.hypot(t.x - x, t.z - z) - (t.spec.giant ? 3 : 0)); return g; },
    trees,
  };
}
