// whole.js: things that came through the Shred Hole in one piece, rebuilt from their recipes.
// A Shred Hole object is a recipe: a list of primitive parts (sphere, box, cylinder, lathe, tube, teapot…) with sizes in metres, a
// colour, a material and sometimes a printed pattern. When a thing reaches the portal unbroken, its recipe travels with it, and this
// turns the recipe back into the thing: the same shapes as the Shred Hole builds (js/objects.js there; keep geometryFor and the
// patterns in step with it), merged into one mesh so it can lie on the junk heap, be lifted and be built into a wall like any piece.
// Colours and printed patterns are baked into the vertices; each vertex also carries its material's roughness, metalness and glow
// (aSurf, read by the junk material), so chrome shines, rubber doesn't and a glow stick glows. Glass is drawn clear-ish but not see-through.
import * as THREE from 'three';
import { TeapotGeometry } from 'three/addons/geometries/TeapotGeometry.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// roughness, metalness, glow, and how to tint glass (Shred Hole's MATERIALS)
const SURF = {
  plastic: [0.32, 0, 0], rubber: [0.55, 0, 0], metal: [0.38, 0.9, 0], chrome: [0.07, 1, 0], steel: [0.45, 0.85, 0], iron: [0.7, 0.6, 0],
  glass: [0.04, 0.1, 0, 'glass'], ceramic: [0.16, 0, 0], wood: [0.72, 0, 0], fruit: [0.42, 0, 0], paper: [0.92, 0, 0], fabric: [0.95, 0, 0],
  stone: [0.88, 0, 0], food: [0.7, 0, 0], glow: [0.3, 0, 0.9],
};
const d2r = Math.PI / 180;
const num = (v, d, lo, hi) => { v = +v; if (!isFinite(v)) v = d; return Math.max(lo, Math.min(hi, v)); };

function geometryFor(p) {
  const s = Array.isArray(p.size) ? p.size : [];
  const L = (i, d) => num(s[i], d, 0.0005, 30);
  switch (p.shape) {
    case 'sphere': { const g = new THREE.SphereGeometry(1, 28, 18); g.scale(L(0, 0.1), L(1, s[0] ?? 0.1), L(2, s[0] ?? 0.1)); return g; }
    case 'box': return new THREE.BoxGeometry(L(0, 0.1), L(1, 0.1), L(2, 0.1));
    case 'plate': return new THREE.BoxGeometry(L(0, 0.1), L(1, 0.002), L(2, 0.1));
    case 'roundbox': { const r = num(p.radius, 0.01, 0.0005, Math.min(L(0, .1), L(1, .1), L(2, .1)) / 2.01); return new RoundedBoxGeometry(L(0, 0.1), L(1, 0.1), L(2, 0.1), 3, r); }
    case 'cylinder': {
      const th = p.theta ? [num(p.theta[0], 0, -720, 720) * d2r, num(p.theta[1], 360, 1, 360) * d2r] : [0, Math.PI * 2];
      return new THREE.CylinderGeometry(L(0, 0.05), L(1, s[0] ?? 0.05), L(2, 0.1), 28, 1, false, th[0], th[1]);
    }
    case 'cone': return new THREE.ConeGeometry(L(0, 0.05), L(1, 0.1), 28);
    case 'capsule': return new THREE.CapsuleGeometry(L(0, 0.03), L(1, 0.1), 6, 16);
    case 'torus': return new THREE.TorusGeometry(L(0, 0.1), L(1, 0.02), 12, 32, num(s[2], 360, 10, 360) * d2r);
    case 'dome': {
      const R = L(0, 0.4), h = L(1, 0.2), pts = [];
      for (let i = 0; i <= 12; i++) { const a = i / 12; pts.push(new THREE.Vector2(R * Math.sin(a * Math.PI / 2) + 1e-4, h * Math.cos(a * Math.PI / 2) - h)); }
      for (let i = 12; i >= 0; i--) { const a = i / 12; pts.push(new THREE.Vector2(R * Math.sin(a * Math.PI / 2) * 0.985 + 1e-4, h * Math.cos(a * Math.PI / 2) - h - 0.006)); }
      const g = new THREE.LatheGeometry(pts, 28); g.translate(0, h, 0); return g;
    }
    case 'lathe': {
      const pts = (p.points || [[0, 0], [0.05, 0], [0.05, 0.1], [0, 0.1]]).slice(0, 64).map(([r, y]) => new THREE.Vector2(num(r, 0, 0, 4), num(y, 0, -4, 4)));
      return new THREE.LatheGeometry(pts, 28);
    }
    case 'tube': {
      const pts = (p.points || [[-0.1, 0, 0], [0.1, 0, 0]]).slice(0, 32).map(q => new THREE.Vector3(num(q[0], 0, -16, 16), num(q[1], 0, -16, 16), num(q[2], 0, -16, 16)));
      if (pts.length < 2) pts.push(pts[0].clone().add(new THREE.Vector3(0.1, 0, 0)));
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, num(p.radius, 0.02, 0.001, 1), 10, false);
    }
    case 'teapot': return new TeapotGeometry(num(s[0], 0.1, 0.01, 12), 6);
    default: return new THREE.SphereGeometry(L(0, 0.1), 16, 12);
  }
}

// a printed pattern, drawn as the Shred Hole draws it, then read back so the vertices can take its colours
let cv = null, cx = null;
function patternPixels(p, base) {
  if (!cv) { cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; cx = cv.getContext('2d', { willReadFrequently: true }); }
  const c = cx, W = 256, H = 128, n = Math.max(1, Math.min(48, p.count || 8));
  c.setTransform(0.5, 0, 0, 0.5, 0, 0);   // drawn in the Shred Hole's 512×256 units
  c.fillStyle = base; c.fillRect(0, 0, 512, 256);
  if (p.type === 'stripes') {
    c.fillStyle = p.color || '#000';
    for (let i = 0; i < n; i++) {
      c.beginPath(); const x0 = i * 512 / n;
      for (let y = 0; y <= 256; y += 8) c.lineTo(x0 + 6 * Math.sin(y * 0.09 + i) + 512 / n * 0.42 * Math.sin(Math.PI * y / 256), y);
      for (let y = 256; y >= 0; y -= 8) c.lineTo(x0 + 6 * Math.sin(y * 0.07 + i), y);
      c.fill();
    }
  } else if (p.type === 'segments') {
    const cols = p.colors && p.colors.length ? p.colors : [base, '#ffffff'], m = Math.max(cols.length, 2);
    for (let i = 0; i < m; i++) { c.fillStyle = cols[i % cols.length]; c.fillRect(i * 512 / m, 0, 512 / m + 1, 256); }
  } else if (p.type === 'bands') {
    c.fillStyle = p.color || '#fff';
    for (let i = 0; i < n; i++) c.fillRect(0, 256 * (0.25 + 0.45 * i / n), 512, 256 * 0.12);
  } else if (p.type === 'spots') {
    c.fillStyle = p.color || '#000';
    for (let i = 0; i < n * 4; i++) { c.beginPath(); c.arc(Math.random() * 512, Math.random() * 256, 6 + Math.random() * 10, 0, 7); c.fill(); }
  } else if (p.type === 'screen') {
    const g = c.createLinearGradient(0, 0, 512, 256); g.addColorStop(0, '#2547c9'); g.addColorStop(1, '#8a2be2'); c.fillStyle = g; c.fillRect(0, 0, 512, 256);
  } else if (p.type === 'card') {
    c.fillStyle = '#fbfbf7'; c.fillRect(0, 0, 512, 256); c.fillStyle = '#c8102e'; c.font = 'bold 120px serif'; c.textAlign = 'center'; c.fillText('♥', 256, 170);
  } else if (p.type === 'pizza') {
    c.fillStyle = '#c63a1d'; c.fillRect(0, 0, 512, 256); c.fillStyle = '#f6d36b';
    for (let i = 0; i < 70; i++) { c.beginPath(); c.arc(Math.random() * 512, Math.random() * 256, 10 + Math.random() * 18, 0, 7); c.fill(); }
    c.fillStyle = '#9e1b16'; for (let i = 0; i < 14; i++) { c.beginPath(); c.arc(Math.random() * 512, Math.random() * 256, 14, 0, 7); c.fill(); }
  }
  return { data: c.getImageData(0, 0, W, H).data, W, H };
}

const _c = new THREE.Color();
/** One part: its geometry in the object's frame, non-indexed, with position, normal, colour and surface. */
function partGeometry(p) {
  let g = geometryFor(p);
  const pos = p.pos || [0, 0, 0], rot = p.rot || [0, 0, 0];
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(+pos[0] || 0, +pos[1] || 0, +pos[2] || 0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler((+rot[0] || 0) * d2r, (+rot[1] || 0) * d2r, (+rot[2] || 0) * d2r)), new THREE.Vector3(1, 1, 1)));
  if (g.index) g = g.toNonIndexed();
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count, col = new Float32Array(n * 3), surf = new Float32Array(n * 3);
  const sf = SURF[p.material] || SURF.plastic, base = /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : '#999999';
  const pix = p.pattern && typeof p.pattern === 'object' && g.attributes.uv ? patternPixels(p.pattern, base) : null, uv = g.attributes.uv;
  _c.set(base);   // (three converts #hex from sRGB itself)
  for (let i = 0; i < n; i++) {
    if (pix) {
      const u = uv.getX(i), v = uv.getY(i), x = Math.min(pix.W - 1, Math.floor(((u % 1) + 1) % 1 * pix.W)), y = Math.min(pix.H - 1, Math.floor((1 - Math.min(1, Math.max(0, v))) * pix.H)), k = (y * pix.W + x) * 4;
      _c.setRGB(pix.data[k] / 255, pix.data[k + 1] / 255, pix.data[k + 2] / 255, THREE.SRGBColorSpace);
    }
    let r = _c.r, gg = _c.g, b = _c.b;
    if (sf[3] === 'glass') { r = 0.35 + 0.5 * r; gg = 0.4 + 0.5 * gg; b = 0.45 + 0.5 * b; }   // pale, as glass looks lying in the grass
    col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b;
    surf[i * 3] = 1 + sf[0]; surf[i * 3 + 1] = sf[1]; surf[i * 3 + 2] = sf[2];   // x = 1 + roughness, so 0 means "no surface given"
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.attributes.position); out.setAttribute('normal', g.attributes.normal);
  out.setAttribute('color', new THREE.BufferAttribute(col, 3)); out.setAttribute('aSurf', new THREE.BufferAttribute(surf, 3));
  return out;
}

/** A recipe → the thing, ready for the junk heap: { geo, hull, vol, size, r } centred on its middle (like junk.js shapeOf). */
export function wholeShape(recipe) {
  const parts = (recipe && Array.isArray(recipe.parts) ? recipe.parts : []).slice(0, 40), geos = [];
  for (const p of parts) { if (!p || typeof p !== 'object') continue; try { geos.push(partGeometry(p)); } catch (e) { /* a part it can't make */ } }
  if (!geos.length) return null;
  const geo = mergeGeometries(geos, false); geos.forEach(g => g.dispose()); if (!geo) return null;
  // its hull, for lifting and for the physics: the outermost of its vertices
  const P = geo.attributes.position, all = [], step = Math.max(1, Math.floor(P.count / 1500));
  for (let i = 0; i < P.count; i += step) all.push(new THREE.Vector3().fromBufferAttribute(P, i));
  let hullPts = all, vol = 0; const cen = new THREE.Vector3();
  try {
    const h = new ConvexHull().setFromPoints(all), set = new Set();
    for (const v of h.vertices) set.add(v.point);
    hullPts = [...set];
    // volume and centre, from the hull's faces as tetrahedra about a point inside
    const o = hullPts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(hullPts.length), a = new THREE.Vector3(), b = new THREE.Vector3();
    for (const f of h.faces) { let e = f.edge; const p0 = e.head().point; e = e.next;
      do { const p1 = e.head().point, p2 = e.next.head().point, tv = Math.abs(a.subVectors(p0, o).dot(b.subVectors(p1, o).cross(new THREE.Vector3().subVectors(p2, o)))) / 6;
        vol += tv; cen.addScaledVector(new THREE.Vector3().add(p0).add(p1).add(p2).add(o), tv / 4); e = e.next; } while (e.next !== f.edge); }
    if (vol > 0) cen.divideScalar(vol); else cen.copy(o);
  } catch (e) { geo.computeBoundingBox(); geo.boundingBox.getCenter(cen); }
  if (hullPts.length > 64) { hullPts.sort((p, q) => q.distanceToSquared(cen) - p.distanceToSquared(cen)); hullPts = hullPts.slice(0, 64); }
  geo.translate(-cen.x, -cen.y, -cen.z);
  const hull = new Float32Array(hullPts.length * 3); hullPts.forEach((p, i) => hull.set([p.x - cen.x, p.y - cen.y, p.z - cen.z], i * 3));
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  const size = new THREE.Vector3(); geo.boundingBox.getSize(size);
  return { geo, hull, vol: Math.max(vol, 1e-6), size, r: geo.boundingSphere.radius, whole: true };
}

/** A short key for a recipe, so a hundred rubber ducks keep one copy of it. */
export function recipeKey(r) {
  const s = JSON.stringify([r.name, r.mass, r.parts]); let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return 'r' + (h >>> 0).toString(36);
}
/** The recipe as kept: what is needed to build it again. */
export function keepRecipe(r) {
  if (!r || !Array.isArray(r.parts) || !r.parts.length) return null;
  return { name: String(r.name || 'something').slice(0, 40), icon: typeof r.icon === 'string' ? r.icon.slice(0, 4) : '', mass: num(r.mass, 1, 0.001, 250000), parts: r.parts.slice(0, 40),
    ...(typeof r.weapon === 'string' && /^[a-z0-9]{2,8}$/.test(r.weapon) ? { weapon: r.weapon } : {}) };   // one of Betamax's guns (the Shred Hole's Arsenal): arms.js makes it the real thing
}

/** The junk material learns to read each vertex's own surface (from whole things) when it has one. */
export function surfaceShader(sh) {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aSurf;\nvarying vec3 vSurf;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = aSurf;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSurf;')
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif (vSurf.x > 0.5) roughnessFactor = vSurf.x - 1.0;')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nif (vSurf.x > 0.5) metalnessFactor = vSurf.y;')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vSurf.z;');
}
