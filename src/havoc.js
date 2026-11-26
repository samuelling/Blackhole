// havoc.js: what rounds do to the garden. arms.js decides what a round hit; this makes it show and stay.
//
//  - holes: a mark where every round lands, kept (the oldest go first): a crater in soil, a splintered hole in wood, a pale chip in
//    stone, a bright dent in metal. Marks on a stone or a piece of junk ride on it (they're its children), so a shot stone carries its
//    scars when it's knocked over.
//  - debris: what the round throws out of what it hit, as real bits: clods, splinters, stone chips, leaves and petals, glass, brass.
//    Each is thrown out round the surface's normal and back along the shot, falls under gravity, bounces on the ground (a little, and
//    less each time), rolls to a stop and lies there a while before it goes. Leaves and petals have drag and flutter down; anything
//    landing in water sinks.
//  - splashes: a crown of drops thrown up out of the water.
//  - props: things that fall whole (a spent magazine), with the same bouncing.
//  - felling: a tree cut through topples away from the shot, as a pole does: slowly at first, faster as it goes (θ'' = 3g/2H · sin θ),
//    lands with a crash and a burst of its leaves, bounces once, lies there a while, then settles into the ground and is gone.
//
// Nothing here is saved: the holes and the litter are this visit's. (What's destroyed for good, plants and trees, is planter.js's
// business: it's dug up the way a trowel would, so the garden's "put back" works on it too.)
import * as THREE from 'three';
import { synthImpact, mulberry32 } from './betamax/gunsound.js';

const G = 9.8;
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _s = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------- the marks, drawn once on canvases
function markTex(kind) {
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), r = mulberry32(kind.length * 977 + kind.charCodeAt(0));
  const blob = (x, y, rad, col, a, jag = 0.25) => {   // an irregular round patch
    g.beginPath(); const n = 22; for (let i = 0; i <= n; i++) { const t = i / n * Math.PI * 2, k = rad * (1 - jag / 2 + jag * r()); i ? g.lineTo(x + Math.cos(t) * k, y + Math.sin(t) * k) : g.moveTo(x + Math.cos(t) * k, y + Math.sin(t) * k); }
    g.closePath(); g.fillStyle = col; g.globalAlpha = a; g.fill(); g.globalAlpha = 1;
  };
  const C = N / 2;
  if (kind === 'soil') {   // a ring of thrown-up earth round a dark scoop, crumbs scattered
    for (let i = 0; i < 40; i++) { const a = r() * 6.28, d = C * (0.45 + 0.45 * r()); blob(C + Math.cos(a) * d, C + Math.sin(a) * d, 2 + 4 * r(), r() < 0.5 ? '#3b2a1c' : '#6b5238', 0.8); }
    blob(C, C, C * 0.62, '#5a4330', 0.9, 0.35); blob(C, C, C * 0.42, '#2e2118', 0.95, 0.3); blob(C, C, C * 0.2, '#120c08', 1, 0.3);
  } else if (kind === 'wood') {   // a dark bore, the fibres torn back pale round it, splinters out along the grain
    for (let i = 0; i < 16; i++) { const a = (r() < 0.5 ? 0 : Math.PI) + (r() - 0.5) * 0.7, L = C * (0.4 + 0.5 * r()); g.strokeStyle = '#d9bf8f'; g.globalAlpha = 0.8; g.lineWidth = 1 + 2 * r(); g.beginPath(); g.moveTo(C, C); g.lineTo(C + Math.cos(a) * L, C + Math.sin(a) * L * 0.4); g.stroke(); }
    g.globalAlpha = 1; blob(C, C, C * 0.36, '#e3cc9c', 0.95, 0.5); blob(C, C, C * 0.2, '#3a2412', 1, 0.3); blob(C, C, C * 0.11, '#0d0805', 1, 0.2);
  } else if (kind === 'stone') {   // a pale crushed chip, a grey crater in it
    blob(C, C, C * 0.7, '#d8d3c8', 0.55, 0.5); blob(C, C, C * 0.48, '#eeeae2', 0.85, 0.45); blob(C, C, C * 0.25, '#7a756d', 0.95, 0.4); blob(C, C, C * 0.1, '#3a3733', 1, 0.3);
    for (let i = 0; i < 8; i++) { const a = r() * 6.28; g.strokeStyle = '#5c5852'; g.globalAlpha = 0.6; g.lineWidth = 1; g.beginPath(); g.moveTo(C + Math.cos(a) * C * 0.25, C + Math.sin(a) * C * 0.25); g.lineTo(C + Math.cos(a) * C * (0.55 + 0.35 * r()), C + Math.sin(a) * C * (0.55 + 0.35 * r())); g.stroke(); }
  } else if (kind === 'suit') {   // a hole through the suit's layers: scorched fabric, the white torn back, the dark of the hole, the glow of its lining at the edge
    blob(C, C, C * 0.92, '#1e1a17', 0.55, 0.55); blob(C, C, C * 0.7, '#2b241e', 0.9, 0.5); blob(C, C, C * 0.52, '#e9e4da', 0.95, 0.6); blob(C, C, C * 0.4, '#7fdcff', 1, 0.35); blob(C, C, C * 0.3, '#0c0a09', 1, 0.3);
    for (let i = 0; i < 12; i++) { const a = r() * 6.28; g.strokeStyle = '#3a342e'; g.globalAlpha = 0.7; g.lineWidth = 1.5; g.beginPath(); g.moveTo(C + Math.cos(a) * C * 0.3, C + Math.sin(a) * C * 0.3); g.lineTo(C + Math.cos(a) * C * (0.55 + 0.35 * r()), C + Math.sin(a) * C * (0.55 + 0.35 * r())); g.stroke(); }
  } else if (kind === 'crack') {   // a visor starred by a round: a white pit, cracks running out and rings across them
    const P = new Path2D();
    for (let k = 0; k < 10; k++) { let a = k / 10 * 6.28 + r() * 0.4, x = C, y = C; P.moveTo(C, C); for (let j = 0; j < 4; j++) { a += (r() - 0.5) * 0.6; const L = C * (0.12 + 0.14 * r()); x += Math.cos(a) * L; y += Math.sin(a) * L; P.lineTo(x, y); } }
    for (const rr of [0.18, 0.4]) { for (let k = 0; k <= 16; k++) { const a = k / 16 * 6.28, q = C * rr * (0.8 + 0.4 * r()); k ? P.lineTo(C + Math.cos(a) * q, C + Math.sin(a) * q) : P.moveTo(C + Math.cos(a) * q, C + Math.sin(a) * q); } }
    g.lineJoin = 'round'; g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 7; g.stroke(P); g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.stroke(P);
    blob(C, C, C * 0.12, '#ffffff', 1, 0.4);
  } else {   // metal: a bright dent, the paint knocked off round it
    blob(C, C, C * 0.6, '#8a8f94', 0.6, 0.3); blob(C, C, C * 0.38, '#e2e6ea', 0.95, 0.2); blob(C, C, C * 0.16, '#55595e', 1, 0.15);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createHavoc({ scene, heightAt, waterAt = () => null, audio }) {   // waterAt(x, z): the water's surface there, or null
  const group = new THREE.Group(); group.name = 'havoc'; scene.add(group);

  // ---------------------------------------------------------------- holes
  const quad = new THREE.PlaneGeometry(1, 1);
  const markMat = {}, marks = {};
  const CAP = { soil: 320, wood: 220, stone: 220, metal: 60, suit: 1, crack: 1 };   // (suit and crack marks only ever ride on a body)
  for (const k of Object.keys(CAP)) {
    markMat[k] = new THREE.MeshStandardMaterial({ map: markTex(k), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: k === 'metal' || k === 'crack' ? 0.3 : 1, metalness: k === 'metal' ? 0.6 : 0 });
    if (k === 'crack') { markMat[k].emissive = new THREE.Color(0xffffff); markMat[k].emissiveMap = markMat[k].map; markMat[k].emissiveIntensity = 0.6; }
    if (k === 'suit') { markMat[k].emissive = new THREE.Color(0x3fb8e8); markMat[k].emissiveMap = markMat[k].map; markMat[k].emissiveIntensity = 0.35; }
    const im = new THREE.InstancedMesh(quad, markMat[k], CAP[k]); im.count = 0; im.frustumCulled = false; im.renderOrder = 1; im.receiveShadow = true; group.add(im);
    marks[k] = { im, n: 0 };
  }
  const riding = [];   // marks on stones and junk: [mesh]
  function hole(kind, at, n, size, parent) {
    _q.setFromUnitVectors(Z, n); _q2.setFromAxisAngle(Z, Math.random() * 6.28); _q.multiply(_q2);
    _v.copy(at).addScaledVector(n, 0.003);
    if (parent) {   // on something that moves: its child, in its own frame
      parent.updateMatrixWorld(); const m = new THREE.Mesh(quad, markMat[kind]); m.renderOrder = kind === 'crack' ? 10 : 3;   // (a crack is drawn over the visor's tinted glass)
      _m.compose(_v, _q, _s.setScalar(size)).premultiply(_inv.copy(parent.matrixWorld).invert()); m.matrixAutoUpdate = false; m.matrix.copy(_m); parent.add(m);
      riding.push(m); if (riding.length > 160) { const o = riding.shift(); o.parent && o.parent.remove(o); }
      return m;
    }
    const M = marks[kind]; _m.compose(_v, _q, _s.setScalar(size)); M.im.setMatrixAt(M.n % CAP[kind], _m); M.n++; M.im.count = Math.min(M.n, CAP[kind]); M.im.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- debris
  // three kinds of body: chunks (lumpy), flats (leaves, petals, shards), brass (little cylinders)
  const chunkGeo = new THREE.IcosahedronGeometry(1, 0); { const P = chunkGeo.attributes.position, r = mulberry32(7); for (let i = 0; i < P.count; i++) P.setXYZ(i, P.getX(i) * (0.7 + 0.5 * r()), P.getY(i) * (0.5 + 0.4 * r()), P.getZ(i) * (0.7 + 0.5 * r())); chunkGeo.computeVertexNormals(); }
  const flatGeo = new THREE.PlaneGeometry(1, 1);
  const brassGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1, true);
  const kinds = {
    chunk: { geo: chunkGeo, mat: new THREE.MeshStandardMaterial({ roughness: 0.95 }), cap: 900 },
    flat: { geo: flatGeo, mat: new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }), cap: 700 },
    brass: { geo: brassGeo, mat: new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 1, side: THREE.DoubleSide }), cap: 160 },
  };
  for (const k of Object.keys(kinds)) {
    const K = kinds[k], im = new THREE.InstancedMesh(K.geo, K.mat, K.cap); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.setColorAt(0, new THREE.Color(1, 1, 1)); im.count = 0; im.frustumCulled = false; im.castShadow = k !== 'flat'; im.receiveShadow = true; group.add(im);
    K.im = im; K.list = [];
  }
  const col = new THREE.Color();
  const STUFF = {   // what each surface throws: body, colours, size (m), count per round, how hard, how bouncy, how long it lies
    soil: { body: 'chunk', cols: ['#4a3626', '#6b5238', '#3a2a1e', '#7a6a50'], size: [0.01, 0.04], n: 12, speed: 4.5, bounce: 0.15, life: 30 },
    sand: { body: 'chunk', cols: ['#b9a888', '#a39272', '#cfc2a4'], size: [0.006, 0.018], n: 8, speed: 4, bounce: 0.15, life: 25 },
    wood: { body: 'chunk', cols: ['#d9bf8f', '#c4a473', '#8a6a44', '#e8d6b0'], size: [0.006, 0.03], n: 8, speed: 5, bounce: 0.3, life: 35, splinter: true },
    bark: { body: 'chunk', cols: ['#5a4a3a', '#3f342a', '#6e5e4c'], size: [0.008, 0.025], n: 5, speed: 4, bounce: 0.3, life: 35 },
    stone: { body: 'chunk', cols: ['#a8a39a', '#8d887f', '#c9c4ba', '#6f6b64'], size: [0.006, 0.026], n: 9, speed: 7, bounce: 0.35, life: 40 },
    leaf: { body: 'flat', cols: ['#4d6b2f', '#5f7d36', '#3c5527', '#7a8f45'], size: [0.02, 0.045], n: 10, speed: 2.5, bounce: 0, life: 40, flutter: true },
    petal: { body: 'flat', cols: ['#e86fa4', '#f2c94c', '#b07ae8', '#f4f1ea', '#e85b4a', '#ff9e5e'], size: [0.012, 0.03], n: 10, speed: 2.5, bounce: 0, life: 40, flutter: true },
    glass: { body: 'flat', cols: ['#e8f4ff', '#cfe6f5', '#ffffff'], size: [0.008, 0.035], n: 22, speed: 5, bounce: 0.2, life: 40, shiny: true },
    metal: { body: 'chunk', cols: ['#c0c4c8', '#8a8f94'], size: [0.003, 0.008], n: 3, speed: 6, bounce: 0.4, life: 20 },
    drop: { body: 'chunk', cols: ['#d6ecf7', '#bcd8e8', '#ffffff'], size: [0.006, 0.018], n: 0, speed: 5, bounce: 0, life: 3, water: true },
  };
  for (const s of Object.values(STUFF)) s.c = s.cols.map(h => new THREE.Color(h));
  function bit(kindName, at, v, sz, c) {
    const S = STUFF[kindName], K = kinds[S.body], L = K.list;
    if (L.length >= K.cap) L.shift();
    const flat = S.body === 'flat';
    L.push({ S, p: at.clone(), v: v.clone(), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6)),
      w: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(30), s: S.splinter && Math.random() < 0.5 ? new THREE.Vector3(sz * 0.4, sz * 0.4, sz * 3) : flat ? new THREE.Vector3(sz, sz * (0.6 + 0.6 * Math.random()), sz) : new THREE.Vector3(sz, sz, sz),
      c: c || S.c[(Math.random() * S.c.length) | 0], age: 0, life: S.life * (0.7 + 0.6 * Math.random()), rest: false, sunk: false, phase: Math.random() * 6 });
  }
  /** Throw n bits of a kind out of a point: round the normal, and back along the shot. */
  function spray(kindName, at, n, D, count, k = 1) {
    const S = STUFF[kindName]; const N = Math.round((count != null ? count : S.n) * k);
    for (let i = 0; i < N; i++) {
      _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(1.4).add(n).normalize();
      if (D) _v.addScaledVector(D, -0.5).normalize();
      _v.multiplyScalar(S.speed * (0.35 + 0.8 * Math.random()) * Math.sqrt(k)); _v.y += 0.6;
      bit(kindName, _w.copy(at).addScaledVector(n, 0.01), _v, S.size[0] + (S.size[1] - S.size[0]) * Math.random() ** 2);
    }
  }
  function brass(at, v, big, shot) {
    const K = kinds.brass; if (K.list.length >= K.cap) K.list.shift();
    K.list.push({ S: { bounce: 0.45, brass: true }, p: at.clone(), v: v.clone(), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, Math.random(), 0)), w: new THREE.Vector3(Math.random() * 20 - 10, Math.random() * 30 - 15, Math.random() * 20 - 10),
      s: shot ? new THREE.Vector3(0.019, 0.06, 0.019) : big ? new THREE.Vector3(0.011, 0.05, 0.011) : new THREE.Vector3(0.01, 0.022, 0.01), c: shot ? new THREE.Color('#a8262a') : new THREE.Color('#d6a84a'), age: 0, life: 45, rest: false, clink: 0 });
  }
  function splash(at, k = 1) {
    for (let i = 0; i < 14 * k; i++) { const a = Math.random() * 6.28, r = Math.random(); _v.set(Math.cos(a) * r * 1.2, 2.5 + 3.5 * Math.random() * (1 - r * 0.6), Math.sin(a) * r * 1.2).multiplyScalar(Math.sqrt(k)); bit('drop', _w.set(at.x, at.y + 0.01, at.z), _v, 0.006 + 0.014 * Math.random()); }
    ring(at);
  }
  // a ring spreading on the water
  const rings = []; const ringMat = new THREE.MeshBasicMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
  const ringGeo = new THREE.RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2);
  function ring(at) { const m = new THREE.Mesh(ringGeo, ringMat.clone()); m.position.set(at.x, at.y + 0.004, at.z); m.scale.setScalar(0.05); group.add(m); rings.push({ m, t: 0 }); }

  // ---------------------------------------------------------------- props: things that fall whole
  const props = [];
  function prop(obj, v, w) { obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } }); group.add(obj); const bb = new THREE.Box3().setFromObject(obj); props.push({ obj, v: v.clone(), w: w.clone(), r: Math.max(0.01, (bb.max.y - bb.min.y) * 0.25), age: 0, rest: false, clinks: 0 }); if (props.length > 24) { const o = props.shift(); group.remove(o.obj); } }

  // ---------------------------------------------------------------- felling
  const falls = [];
  /** objs: the tree's meshes (their matrices are about the world); at its foot (x, y, z); toward (dx, dz); H tall. */
  function fell(objs, foot, dx, dz, H, done) {
    const d = Math.hypot(dx, dz) || 1, axis = new THREE.Vector3().crossVectors(Y, new THREE.Vector3(dx / d, 0, dz / d)).normalize();
    for (const o of objs) { o.matrixAutoUpdate = false; o.userData.m0 = o.matrix.clone(); }
    falls.push({ objs, foot: foot.clone(), axis, H: Math.max(1, H), th: 0.1, om: 0.2, landed: false, t: 0, done, dir: new THREE.Vector3(dx / d, 0, dz / d) });
    creak(foot, H);
  }

  // ---------------------------------------------------------------- sound
  const bufs = {};
  function buf(key, make) { const A = audio && audio(); if (!A || !A.ctx) return null; if (!bufs[key]) { const d = make(A.ctx.sampleRate), b = A.ctx.createBuffer(1, d.length, A.ctx.sampleRate); b.copyToChannel(d, 0); bufs[key] = b; } return bufs[key]; }
  function play(b, at, gain = 0.3, rate = 1, ref = 3) {
    const A = audio && audio(); if (!b || !A || !A.ctx || !A.master) return; const ac = A.ctx;
    const src = ac.createBufferSource(); src.buffer = b; src.playbackRate.value = rate; const g = ac.createGain(); g.gain.value = gain;
    const pn = ac.createPanner(); pn.refDistance = ref; pn.rolloffFactor = 1; pn.positionX ? (pn.positionX.value = at.x, pn.positionY.value = at.y, pn.positionZ.value = at.z) : pn.setPosition(at.x, at.y, at.z);
    src.connect(g); g.connect(pn); pn.connect(A.master); src.start();
  }
  const glassBuf = () => buf('glass', sr => {   // a shatter: a sharp crack, then many little bright rings falling away
    const n = Math.floor(sr * 1.4), d = new Float32Array(n), r = mulberry32(41);
    for (let i = 0; i < 0.004 * sr; i++) d[i] += (r() * 2 - 1) * (1 - i / (0.004 * sr));
    for (let k = 0; k < 60; k++) { const t0 = Math.pow(r(), 1.8) * 1.0, f = 2500 + 6000 * r(), a = 0.25 * (1 - t0) * r(), dec = 0.01 + 0.05 * r(); const i0 = Math.floor(t0 * sr);
      for (let i = i0; i < Math.min(n, i0 + dec * 6 * sr); i++) { const t = (i - i0) / sr; d[i] += a * Math.sin(2 * Math.PI * f * t) * Math.exp(-t / dec); } }
    return d;
  });
  const tinkBuf = () => buf('tink', sr => { const n = Math.floor(sr * 0.25), d = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / sr; d[i] = (Math.sin(2 * Math.PI * 4200 * t) + 0.6 * Math.sin(2 * Math.PI * 6900 * t) + 0.3 * Math.sin(2 * Math.PI * 9800 * t)) * Math.exp(-t / 0.035) * 0.4; } return d; });
  const crashBuf = () => buf('crash', sr => {   // a tree coming down: the crown's rush through the air, the boughs breaking, the thump
    const n = Math.floor(sr * 2.4), d = new Float32Array(n), r = mulberry32(77); let lp = 0, lp2 = 0;
    for (let i = 0; i < n; i++) { const t = i / sr; lp += ((r() * 2 - 1) - lp) * 0.08; lp2 += (lp - lp2) * 0.05; d[i] = lp * Math.exp(-t / 0.5) * 1.2 + Math.sin(2 * Math.PI * 38 * t) * Math.exp(-t / 0.18) * 1.4 + lp2 * 3 * Math.exp(-t / 1.1); }
    for (let k = 0; k < 40; k++) { const i0 = Math.floor(Math.pow(r(), 2) * 1.2 * sr); for (let i = i0; i < Math.min(n, i0 + 0.006 * sr); i++) d[i] += (r() * 2 - 1) * 0.5 * (1 - (i - i0) / (0.006 * sr)); }
    return d;
  });
  const creakBuf = () => buf('creak', sr => {   // the hinge of wood left: a slow, rising groan with snaps in it
    const n = Math.floor(sr * 1.6), d = new Float32Array(n), r = mulberry32(13); let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / sr, f = 70 + 90 * t + 15 * Math.sin(t * 23); ph += f / sr; const saw = (ph % 1) * 2 - 1; d[i] = saw * 0.25 * Math.min(1, t * 4) * Math.exp(-Math.max(0, t - 1.1) * 6) * (0.6 + 0.4 * Math.sin(t * 61)); }
    for (let k = 0; k < 14; k++) { const i0 = Math.floor(r() * 1.3 * sr); for (let i = i0; i < Math.min(n, i0 + 0.004 * sr); i++) d[i] += (r() * 2 - 1) * 0.6 * (1 - (i - i0) / (0.004 * sr)); }
    return d;
  });
  const hissBuf = () => buf('hiss', sr => {   // air out of a holed suit: bright noise, falling away as the pressure does
    const n = Math.floor(sr * 2.6), d = new Float32Array(n), r = mulberry32(5); let a = 0, b = 0;
    for (let i = 0; i < n; i++) { const t = i / sr, x = r() * 2 - 1; a += (x - a) * 0.6; b += (a - b) * 0.05; d[i] = (a - b) * 0.5 * Math.min(1, t * 40) * Math.exp(-t / 0.9); }
    return d;
  });
  const thudBuf = kind => buf('imp' + kind, sr => synthImpact(mulberry32(90 + kind.length * 13), sr, kind));
  function creak(at, H) { play(creakBuf(), at, 0.5, 1.2 - Math.min(0.5, H / 40), 6); }
  let clinkBudget = 0;

  // ---------------------------------------------------------------- each frame
  function step(dt) {
    dt = Math.min(dt, 1 / 30); clinkBudget = Math.min(6, clinkBudget + dt * 12);
    for (const name of Object.keys(kinds)) {
      const K = kinds[name], L = K.list; let i = 0;
      for (let j = 0; j < L.length; j++) {
        const b = L[j]; b.age += dt; if (b.age > b.life + 1) continue;
        if (!b.rest) {
          const flutter = b.S.flutter;
          if (flutter) { b.v.multiplyScalar(Math.exp(-dt * 3.2)); b.v.y -= G * dt * 0.35; b.v.x += Math.sin(b.age * 7 + b.phase) * dt * 1.2; b.v.z += Math.cos(b.age * 5 + b.phase) * dt * 1.2; }
          else { b.v.y -= G * dt; b.v.multiplyScalar(Math.exp(-dt * (b.S.water ? 0.4 : 0.15))); }
          b.p.addScaledVector(b.v, dt);
          _q2.setFromAxisAngle(_v.copy(b.w).normalize(), b.w.length() * dt * (flutter ? 0.25 : 1)); b.q.premultiply(_q2);
          const gy = heightAt(b.p.x, b.p.z), wy = waterAt(b.p.x, b.p.z), wet = wy != null && wy > gy, floor = wet ? wy : gy, r = b.s.y * 0.5;
          if (b.S.water && wet && b.p.y < wy && b.v.y < 0) b.age = b.life;   // a drop falls back into the water
          else if (b.p.y < floor + r) {
            if (wet && !b.S.water) { b.sunk = true; b.rest = true; b.age = Math.max(b.age, b.life - 1.5); }   // sinks
            else if (flutter || b.S.water) { b.p.y = floor + 0.002; b.rest = true; _q.setFromUnitVectors(Y, _v.set(0.05 * Math.random(), 1, 0.05 * Math.random()).normalize()); b.q.copy(_q).multiply(_q2.setFromAxisAngle(Y, Math.random() * 6)); b.q.multiply(_q2.setFromAxisAngle(_v.set(1, 0, 0), Math.PI / 2)); }
            else {
              b.p.y = floor + r; const vin = -b.v.y;
              if (b.S.brass && vin > 1.2 && clinkBudget > 1 && (b.clink = (b.clink || 0) + 1) < 4) { clinkBudget--; play(tinkBuf(), b.p, Math.min(0.15, vin * 0.03), 0.8 + 0.5 * Math.random(), 2); }
              b.v.y = vin * (b.S.bounce || 0.2); b.v.x *= 0.55; b.v.z *= 0.55; b.w.multiplyScalar(0.5);
              if (b.v.lengthSq() < 0.09) { b.rest = true; if (b.S.brass) { b.q.setFromEuler(new THREE.Euler(Math.PI / 2, Math.random() * 6, 0, 'YXZ')); b.p.y = floor + b.s.x * 0.5; } }
            }
          }
        }
        const fade = b.age > b.life ? Math.max(0, 1 - (b.age - b.life)) : 1, sink = b.sunk ? Math.max(0, 1 - (b.age - (b.life - 1.5)) / 1.5) : 1;
        _m.compose(b.p, b.q, _s.copy(b.s).multiplyScalar(fade * sink + 1e-4)); K.im.setMatrixAt(i, _m); K.im.setColorAt(i, b.c); L[i] = b; i++;
      }
      L.length = i; K.im.count = i; if (i) { K.im.instanceMatrix.needsUpdate = true; if (K.im.instanceColor) K.im.instanceColor.needsUpdate = true; }
    }
    for (let j = rings.length - 1; j >= 0; j--) { const R = rings[j]; R.t += dt; R.m.scale.setScalar(0.05 + R.t * 1.1); R.m.material.opacity = 0.5 * Math.max(0, 1 - R.t / 1.2); if (R.t > 1.2) { group.remove(R.m); R.m.material.dispose(); rings.splice(j, 1); } }
    for (let j = props.length - 1; j >= 0; j--) {
      const P = props[j], o = P.obj; P.age += dt;
      if (!P.rest) {
        P.v.y -= G * dt; o.position.addScaledVector(P.v, dt); _q2.setFromAxisAngle(_v.copy(P.w).normalize(), P.w.length() * dt); o.quaternion.premultiply(_q2);
        const gy = heightAt(o.position.x, o.position.z), wy = waterAt(o.position.x, o.position.z), floor = wy != null && wy > gy ? Math.max(gy, wy - 0.3) : gy;
        if (o.position.y < floor + P.r) { o.position.y = floor + P.r; const vin = -P.v.y; if (vin > 1 && P.clinks++ < 3) play(thudBuf('iHard'), o.position, Math.min(0.2, vin * 0.04), 1.6, 2); P.v.y = vin * 0.25; P.v.x *= 0.5; P.v.z *= 0.5; P.w.multiplyScalar(0.4); if (P.v.lengthSq() < 0.1) P.rest = true; }
      }
      if (P.age > 50) { const k = Math.max(0, 1 - (P.age - 50)); o.scale.setScalar(k + 1e-4); if (k <= 0) { group.remove(o); props.splice(j, 1); } }
    }
    for (let j = falls.length - 1; j >= 0; j--) {
      const F = falls[j]; F.t += dt;
      if (!F.landed) {
        F.om += 1.5 * G / F.H * Math.sin(F.th) * dt; F.th += F.om * dt;
        if (F.th >= 1.48) {   // down: a crash, its crown burst on the ground, one bounce
          F.th = 1.48; F.om = -F.om * 0.18; F.landed = true; F.tl = F.t;
          const crown = _v.copy(F.foot).addScaledVector(F.dir, F.H * 0.7); crown.y = heightAt(crown.x, crown.z) + 0.3;
          play(crashBuf(), crown, 0.9, 1, 12);
          for (let k = 0; k < Math.min(8, 2 + F.H / 4); k++) { const p = F.foot.clone().addScaledVector(F.dir, F.H * (0.35 + 0.6 * Math.random())); p.y = heightAt(p.x, p.z) + 0.4; spray('leaf', p, Y, null, 18); }
          spray('wood', F.foot.clone().add(_w.set(0, 0.3, 0)), F.dir, null, 16);
        }
      } else if (F.t - F.tl < 1.2) { F.om -= 1.5 * G / F.H * dt * 2; F.th += F.om * dt; if (F.th > 1.48) { F.th = 1.48; F.om = 0; } }
      _q.setFromAxisAngle(F.axis, F.th);
      const sink = F.landed ? Math.max(0, F.t - F.tl - 18) * 0.25 * Math.min(1, F.H / 8) : 0;   // it lies a while, then settles into the ground and is gone
      for (const o of F.objs) { _m.makeTranslation(-F.foot.x, -F.foot.y, -F.foot.z).premultiply(new THREE.Matrix4().makeRotationFromQuaternion(_q)).premultiply(new THREE.Matrix4().makeTranslation(F.foot.x, F.foot.y - sink, F.foot.z)); o.matrix.copy(_m).multiply(o.userData.m0); o.matrixWorldNeedsUpdate = true; }
      if (F.landed && F.t - F.tl > 22) { falls.splice(j, 1); if (F.done) F.done(); }
    }
  }

  return {
    hole, spray, brass, splash, prop, fell, step, play, thud: (kind, at, gain = 0.18, rate = 1) => play(thudBuf(kind), at, gain, rate), glass: at => play(glassBuf(), at, 0.5, 0.9 + 0.2 * Math.random(), 4), hiss: (at, k = 1) => play(hissBuf(), at, 0.25 * k, 0.9 + 0.25 * Math.random(), 2),
    get count() { return Object.values(kinds).reduce((a, K) => a + K.list.length, 0); }, marks: () => Object.fromEntries(Object.entries(marks).map(([k, M]) => [k, M.im.count])), group,
  };
}
