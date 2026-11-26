// The walker's own body: a hard-shell suit (tools/blender/build_astronaut.py), cel-shaded with ink outlines.
// Look down and it is there, and it casts your shadow, helmet and all. The suit is rigid shells on joints, so the
// rig is a tree of groups posed each frame: legs by two-bone IK to planted feet, arms swinging against them.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createHands } from './hands.js';
import { loadSuit } from './suits.js';
import { BODIES } from './outfits.js';
import { NCH, STAND, FIDGET, motionLib, sample, blend } from './motion.js';

const PARENT = { pelvis: null, torso: 'pelvis', head: 'torso', armU_L: 'torso', armL_L: 'armU_L', hand_L: 'armL_L', armU_R: 'torso', armL_R: 'armU_R', hand_R: 'armL_R',
  thigh_L: 'pelvis', shin_L: 'thigh_L', foot_L: 'shin_L', thigh_R: 'pelvis', shin_R: 'thigh_R', foot_R: 'shin_R' };
const EYE = new THREE.Vector3(0, 1.65, 0.08);          // where the eyes sit in the model: ahead of the spine
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// Cel shading. Vertex-colour alpha names the surface: 1 painted shell, .8 gloss, .6 glowing, .4 soft.
// Light arrives in flat bands: the garden's sun or moon (with a hard-edged shadow), the exhibit lights around your
// feet, the sky, and the suit's own lamp, so the bands still read on a dark lawn. Voids drain it like everything else.
const CEL = /* glsl */`
{
  float cls = vColor.a; vec3 alb = vColor.rgb;
  bool isGlow = cls > 0.5 && cls < 0.7, isGloss = cls >= 0.7 && cls < 0.9, isSoft = cls <= 0.5;
  // an outfit (outfits.js): each of the suit's own flat colours swapped for the outfit's
  if (uOutfit > 0.5) {
    if (cls > 0.9) {
      if (distance(alb, vec3(0.80, 0.82, 0.86)) < 0.07) alb = uSuit;
      else if (distance(alb, vec3(0.34, 0.37, 0.43)) < 0.07) alb = uTrim;
      else if (distance(alb, vec3(1.0, 0.30, 0.035)) < 0.1) alb = uAccent;
    } else if (isGloss && distance(alb, vec3(0.95, 0.56, 0.10)) < 0.1) alb = uVisor;
    else if (isGlow && distance(alb, vec3(0.25, 0.95, 1.0)) < 0.1) alb = uGlowC;
  }
  vec3 N = normalize(normal), V = normalize(vViewPosition);
  vec3 Nw = normalize(inverseTransformDirection(N, viewMatrix));
  vec3 light = vec3(0.0), shine = vec3(0.0);
  #if NUM_DIR_LIGHTS > 0
  { vec3 L = directionalLights[0].direction, kc = directionalLights[0].color * RECIPROCAL_PI; float sh = 1.0;
    #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
    sh = getShadow(directionalShadowMap[0], directionalLightShadows[0].shadowMapSize, directionalLightShadows[0].shadowBias, directionalLightShadows[0].shadowRadius, vDirectionalShadowCoord[0]);
    #endif
    float ndl = dot(N, L), lit = smoothstep(0.0, 0.035, ndl) * smoothstep(0.4, 0.6, sh), hi = smoothstep(0.6, 0.635, ndl) * lit;
    light += kc * (0.6 * lit + 0.4 * hi);
    float sp = dot(N, normalize(L + V));
    shine += kc * lit * (isGloss ? smoothstep(0.93, 0.945, sp) * 2.2 : isSoft ? 0.0 : smoothstep(0.985, 0.99, sp) * 0.9);
  }
  #endif
  vec3 sky = uAmb * 1.5 + uSun * 0.25;
  light += sky * mix(0.62, 1.0, smoothstep(-0.05, 0.05, Nw.y));
  vec3 exh = groundLight(vWPos.xz) * uExhibit * uLightGain * clamp(1.25 - vWPos.y * 0.12, 0.35, 1.25);
  light += exh * mix(1.0, 0.5, smoothstep(0.5, 0.54, Nw.y));   // the exhibit glows from around and below: tops sit a band darker
  { vec3 L = normalize((viewMatrix * vec4(uLampDir, 0.0)).xyz); float nl = dot(N, L);
    light += uLampCol * (0.45 * smoothstep(0.0, 0.035, nl) + 0.55 * smoothstep(0.58, 0.615, nl));
    float sp = dot(N, normalize(L + V));
    shine += uLampCol * (isGloss ? smoothstep(0.93, 0.945, sp) * 1.6 : isSoft ? 0.0 : smoothstep(0.985, 0.99, sp) * 0.7); }
  vec3 dd = uDiskPos - vWPos; float dl = length(dd);
  light += uDiskGlow * smoothstep(0.1, 0.14, dot(normalize((viewMatrix * vec4(dd / dl, 0.0)).xyz), N)) / (1.0 + dl * dl / 180.0);
  vec3 fd = uFlashPos - vWPos; float fl = length(fd);
  light += uFlashCol * (0.3 + 0.7 * smoothstep(0.1, 0.14, dot(normalize((viewMatrix * vec4(fd / max(fl, 1e-3), 0.0)).xyz), N))) / (1.0 + fl * fl / 6.0);
  float rim = smoothstep(0.7, 0.735, 1.0 - max(dot(N, V), 0.0)) * (isSoft ? 0.25 : 0.6);
  // a painted cel never blows out: compress the light so the suit keeps its colour and its ink under the brightest lamps
  float lm = max(light.r, max(light.g, light.b)); light *= 0.8 / (0.8 + lm); shine *= 0.8 / (0.8 + lm);
  vec3 col = alb * light * (1.0 + rim) + shine * 0.5;
  if (isGlow) col = alb * (light * 0.35 + uGlow * (0.85 + 0.15 * sin(uTime * 2.3 + vWPos.y * 9.0)));
  float Ld = drainAt(vWPos);
  outgoingLight = gshift(col * mix(1.0, Ld, 0.93), vWPos);
  if (uGhost > 0.5) discard;
}`;

function celMaterial(U, COMMON, own) {
  const m = new THREE.MeshToonMaterial({ vertexColors: true });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, own);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + COMMON + `
uniform float uExhibit; uniform vec3 uDiskPos; uniform vec3 uDiskGlow; uniform vec3 uFlashPos; uniform vec3 uFlashCol;
uniform vec3 uLampDir; uniform vec3 uLampCol; uniform vec3 uBodyFwd; uniform float uGlow; uniform float uGhost; varying vec3 vWPos;
uniform float uOutfit; uniform vec3 uSuit; uniform vec3 uTrim; uniform vec3 uAccent; uniform vec3 uVisor; uniform vec3 uGlowC;`)
      .replace('#include <opaque_fragment>', CEL + '\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'cel-body';
  return m;
}
// Ink: each shell again, turned inside out and swollen along its smoothed normals by a width that stays the same on screen.
function inkMaterial(U, COMMON, own) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, uniforms: Object.assign({}, U, own),
    vertexShader: /* glsl */`uniform float uInk; attribute vec4 color; varying vec3 vCol; varying vec3 vWPos;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vec3 n = normalize(normalMatrix * normal);
  mv.xyz += n * min(uInk * max(-mv.z, 0.1), 0.0075); vWPos = (modelMatrix * vec4(position, 1.0)).xyz; vCol = color.rgb; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: COMMON + /* glsl */`uniform float uGhost; uniform vec3 uLampCol; uniform float uExhibit; varying vec3 vCol; varying vec3 vWPos;
void main(){ if (uGhost > 0.5) discard;
  vec3 l = uAmb + uSun * 0.3 + groundLight(vWPos.xz) * uExhibit * uLightGain + uLampCol;
  gl_FragColor = vec4((vec3(0.02, 0.022, 0.04) + vCol * 0.05) * l * 0.5 * drainAt(vWPos), 1.0); }`,
  });
}

function hullOf(geo) { let hull = geo.clone(); hull.deleteAttribute('normal'); hull = mergeVertices(hull, 2e-4); hull.computeVertexNormals(); return hull; }
// What a helmet can wear on top (outfits.js TOPS): small shapes painted in the suit's own five colours, so an outfit repaints them too.
const SUIT_C = [0.80, 0.82, 0.86, 1], TRIM_C = [0.34, 0.37, 0.43, 1], ACC_C = [1.0, 0.30, 0.035, 1], GLOW_C = [0.25, 0.95, 1.0, 0.6];
function tint(geo, c) { const n = geo.attributes.position.count, a = new Float32Array(n * 4); for (let i = 0; i < n; i++) a.set(c, i * 4); geo.setAttribute('color', new THREE.BufferAttribute(a, 4)); return geo; }
function topperParts(kind, R) {   // [geometry, colour, x, y, z, rx, rz, spins?] in the helmet's frame: y up from its crown, x across, R its radius
  const cyl = (r0, r1, h, n = 12) => new THREE.CylinderGeometry(r0, r1, h, n).translate(0, h / 2, 0), ball = r => new THREE.SphereGeometry(r, 14, 10), cone = (r, h, n = 14) => new THREE.ConeGeometry(r, h, n).translate(0, h / 2, 0);
  const P = [];
  if (kind === 'antenna') { P.push([cyl(0.006, 0.009, 0.2), TRIM_C, R * 0.35, -0.02, 0, 0, -0.12], [ball(0.022), GLOW_C, R * 0.35 + 0.024, 0.178, 0, 0, 0]); }
  else if (kind === 'fin') { const s = new THREE.Shape(); s.moveTo(-R * 0.75, -0.03); s.quadraticCurveTo(-R * 0.2, 0.15, R * 0.55, 0.11); s.quadraticCurveTo(R * 0.8, 0.02, R * 0.7, -0.05); s.lineTo(-R * 0.75, -0.03);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.018, bevelEnabled: false }).translate(0, 0, -0.009).rotateY(Math.PI / 2); P.push([g, ACC_C, 0, -0.01, 0, 0, 0]); }
  else if (kind === 'cat') for (const sx of [-1, 1]) { P.push([cone(0.05, 0.1, 4).rotateY(Math.PI / 4).scale(1, 1, 0.45), SUIT_C, sx * R * 0.55, -0.045, 0, 0, -sx * 0.5], [cone(0.03, 0.06, 4).rotateY(Math.PI / 4).scale(1, 1, 0.3), ACC_C, sx * R * 0.56, -0.03, 0.014, 0, -sx * 0.5]); }
  else if (kind === 'bunny') for (const sx of [-1, 1]) { P.push([new THREE.CapsuleGeometry(0.026, 0.17, 4, 10).translate(0, 0.1, 0).scale(1, 1, 0.5), SUIT_C, sx * R * 0.34, -0.04, 0, -0.12, -sx * 0.2], [new THREE.CapsuleGeometry(0.013, 0.13, 4, 8).translate(0, 0.1, 0).scale(1, 1, 0.4), ACC_C, sx * R * 0.34, -0.035, 0.012, -0.12, -sx * 0.2]); }
  else if (kind === 'halo') P.push([new THREE.TorusGeometry(R * 0.62, 0.012, 8, 36).rotateX(Math.PI / 2), GLOW_C, 0, 0.075, 0, 0.12, 0]);
  else if (kind === 'horns') for (const sx of [-1, 1]) P.push([cone(0.028, 0.12, 10), TRIM_C, sx * R * 0.6, -0.06, 0, 0, -sx * 0.75], [cone(0.012, 0.04, 8), ACC_C, sx * (R * 0.6 + 0.078), 0.02, 0, 0, -sx * 0.25]);
  else if (kind === 'prop') { P.push([cyl(0.008, 0.012, 0.07), TRIM_C, 0, -0.01, 0, 0, 0], [ball(0.016), ACC_C, 0, 0.062, 0, 0, 0]); for (const a of [0, Math.PI]) P.push([new THREE.BoxGeometry(0.13, 0.004, 0.032).translate(0.07, 0, 0).rotateX(0.35).rotateY(a), ACC_C, 0, 0.062, 0, 0, 0, true]); }
  else if (kind === 'crown') { P.push([new THREE.CylinderGeometry(R * 0.5, R * 0.56, 0.03, 20, 1, true), ACC_C, 0, -0.012, 0, 0, 0]); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.2832; P.push([cone(0.022, 0.06, 4), ACC_C, Math.cos(a) * R * 0.5, 0.0, Math.sin(a) * R * 0.5, 0, 0], [ball(0.009), GLOW_C, Math.cos(a) * R * 0.5, 0.064, Math.sin(a) * R * 0.5, 0, 0]); } }
  else if (kind === 'flower') { P.push([cyl(0.006, 0.007, 0.09), TRIM_C, 0, -0.01, 0, 0, 0], [ball(0.02), GLOW_C, 0, 0.09, 0, 0, 0]); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.2832; P.push([ball(0.021).scale(1, 0.35, 0.7), ACC_C, Math.cos(a) * 0.034, 0.088, Math.sin(a) * 0.034, 0, 0, false, -a]); } }
  return P;
}
export function createBody({ model, U, COMMON }) {
  const root = new THREE.Group(); root.name = 'body';
  const own = { uLampDir: { value: new THREE.Vector3(0, 1, 0) }, uLampCol: { value: new THREE.Vector3(0.05, 0.055, 0.065) }, uBodyFwd: { value: new THREE.Vector3(0, 0, 1) },
    uGlow: { value: 0.85 }, uGhost: { value: 0 }, uInk: { value: 0.004 },
    uOutfit: { value: 0 }, uSuit: { value: new THREE.Vector3() }, uTrim: { value: new THREE.Vector3() }, uAccent: { value: new THREE.Vector3() }, uVisor: { value: new THREE.Vector3() }, uGlowC: { value: new THREE.Vector3() } };
  const ghost = { value: 0 }, headOwn = Object.assign({}, own, { uGhost: ghost });
  const mat = celMaterial(U, COMMON, own), headMat = celMaterial(U, COMMON, headOwn); headMat.customProgramCacheKey = () => 'cel-head';
  const ink = inkMaterial(U, COMMON, own), headInk = inkMaterial(U, COMMON, headOwn);
  // The rig: one group per part, parent to child, always the same. What hangs on it (the suit) can be changed: wear(model).
  const B = {}, joint = {}; for (const n in PARENT) { B[n] = new THREE.Group(); B[n].name = n; } for (const n in PARENT) (PARENT[n] ? B[PARENT[n]] : root).add(B[n]);
  const rest = {}, hipRest = { L: new THREE.Vector3(), R: new THREE.Vector3() }, armLen = { u: 0.29, l: 0.26 }; let L1 = 0.42, L2 = 0.39, ANKLE = 0.11, hands = null, wearing = 'astro', wanted = 'astro', neck = 1;
  /** Put a suit on the rig: a model of fifteen meshes named for their parts, each with its origin at its joint, standing at rest. */
  function wear(m, id) {
    m.updateMatrixWorld(true);
    const meshes = []; m.traverse(o => { if (o.isMesh && o.name in PARENT) meshes.push(o); });
    if (meshes.length < 15) return false;
    if (hands) hands.dispose();
    for (const n in B) for (const c of B[n].children.slice()) if (c.userData.skin) { B[n].remove(c); if (!c.geometry.userData.shared) c.geometry.dispose(); }
    for (const o of meshes) joint[o.name] = o.getWorldPosition(new THREE.Vector3());
    for (const o of meshes) {
      const n = o.name, p = PARENT[n], g = B[n], isHead = n === 'head';
      g.position.copy(joint[n]); if (p) g.position.sub(joint[p]); g.quaternion.identity();
      const geo = o.geometry; geo.userData.shared = true;                 // the model's own geometry belongs to everyone wearing this suit
      const mm = new THREE.Mesh(geo, isHead ? headMat : mat); mm.castShadow = true; mm.receiveShadow = true; mm.userData.skin = true; g.add(mm);
      const im = new THREE.Mesh(hullOf(geo), isHead ? headInk : ink); im.userData.skin = true; g.add(im);
    }
    for (const n in B) rest[n] = B[n].position.clone();
    { // the collar, closed: your own head is never drawn for you, and looking down there was a hole where it joins. A seal sits in the neck
      // of the suit, as wide as the bottom of this helmet (under the helmet, nobody else sees it).
      // It is as wide as the suit's own collar (the torso's rim at neck height) and sits a little down inside it, so what you see is the rim with a floor in it.
      const tg = meshes.find(o => o.name === 'torso').geometry.attributes.position, hx = rest.head.x, hy = rest.head.y, hz = rest.head.z; let r = 0;
      for (let i = 0; i < tg.count; i++) { const y = tg.getY(i) - hy; if (y > -0.05 && y < 0.03) r = Math.max(r, Math.hypot(tg.getX(i) - hx, tg.getZ(i) - hz)); }
      r = Math.max(0.07, Math.min(0.135, (r || 0.11) * 0.96));
      const sg = tint(new THREE.CylinderGeometry(r, r, 0.012, 24), TRIM_C);   // in the suit's trim colour: a neck ring, not a dark patch that would still read as a hole
      const seal = new THREE.Mesh(sg, mat); seal.position.copy(rest.head); seal.position.y -= 0.04; seal.userData.skin = true; seal.castShadow = false; B.torso.add(seal);
    }
    L1 = joint.shin_L.distanceTo(joint.thigh_L); L2 = joint.foot_L.distanceTo(joint.shin_L); ANKLE = joint.foot_L.y;
    hipRest.L.copy(joint.thigh_L).sub(joint.pelvis); hipRest.R.copy(joint.thigh_R).sub(joint.pelvis);
    armLen.u = joint.armL_L.distanceTo(joint.armU_L); armLen.l = joint.hand_L.distanceTo(joint.armL_L);
    hands = createHands({ B, mat, ink, hullOf });
    for (const k in spr) delete spr[k];
    for (const c of B.head.children.slice()) if (c.userData.topper) { c.traverse(o => o.geometry && o.geometry.dispose()); B.head.remove(c); }
    wearing = id || 'astro'; { const meta = BODIES.find(b => b.id === wearing); neck = meta && meta.neck != null ? meta.neck : 1; } const tk = topKind; topKind = 'none'; topGroup = null; topSpin = []; setTop(tk);   // the topper again, on this helmet
    return true;
  }
  const spr = {};
  // the helmet's topper: built on its crown, drawn and inked with the head (so it hides with it in first person)
  let topKind = 'none', topGroup = null, topSpin = [];
  function setTop(kind) {
    kind = kind || 'none'; if (kind === topKind || !B.head) return; topKind = kind;
    if (topGroup) { B.head.remove(topGroup); topGroup.traverse(o => o.geometry && o.geometry.dispose()); topGroup = null; topSpin = []; }
    for (const c of B.head.children.slice()) if (c.userData.topper) B.head.remove(c);
    if (kind === 'none') return;
    const hm = B.head.children.find(c => c.isMesh); hm.geometry.computeBoundingBox(); const bb = hm.geometry.boundingBox, R = Math.max(0.08, (bb.max.x - bb.min.x) / 2);
    topGroup = new THREE.Group(); topGroup.userData.topper = true; topGroup.position.set((bb.min.x + bb.max.x) / 2, bb.max.y, (bb.min.z + bb.max.z) / 2); B.head.add(topGroup);
    for (const [geo, c, x, y, z, rx, rz, spins, ry] of topperParts(kind, R)) {
      const g = tint(geo.toNonIndexed ? (geo.index ? geo.toNonIndexed() : geo) : geo, c); g.computeVertexNormals();
      const m = new THREE.Mesh(g, headMat); m.castShadow = true; m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, rz || 0); topGroup.add(m);
      try { const im = new THREE.Mesh(hullOf(g), headInk); m.add(im); } catch (e) { /* no outline for this one */ }
      if (spins) topSpin.push(m);
    }
  }
  let gesture = {}, point = 0, turnKick = 0;
  wear(model, 'astro');   // the gloves get jointed fingers there (hands.js)

  // gait state
  const prev = new THREE.Vector3(); let has = false, speed = 0, move = 0, cyc = 0, vf = 1, vr = 0, reachT = -9, bob = 0, enabled = true;
  // what keeps it from walking like a machine: weight carried over the stance foot, the hips dropping and turning, the spine leaning into
  // starts and turns, every joint arriving a little late and a little past (springs), strides that are never quite the same twice,
  // and, standing still, a person's slow shifting from foot to foot
  const spg = (k, target, dt, stiff = 60, zeta = 0.55) => { let e = spr[k]; if (!e) e = spr[k] = [target, 0]; const c = 2 * Math.sqrt(stiff) * zeta; e[1] += (stiff * (target - e[0]) - c * e[1]) * dt; e[0] += e[1] * dt; return e[0]; };
  let prevYaw = null, turnRate = 0, accel = 0, prevSpeed = 0, stride = 0, lastCyc = 0, strideK = 1, strideW = 0, idleT = 0, idleShift = 0, idleTarget = 0, idleNext = 3;
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const H = v3(), A = v3(), K = v3(), dir = v3(), pole = v3(), kd = v3(), bx = v3(), by = v3(), bz = v3(), tmp = v3(), aim = v3(), sh = v3();
  const q = new THREE.Quaternion(), qP = new THREE.Quaternion(), qT = new THREE.Quaternion(), qS = new THREE.Quaternion(), qI = new THREE.Quaternion(), M = new THREE.Matrix4(), eul = new THREE.Euler();
  const tune = { crane: 0.2, reach: null, work: null, paneX: 0.2 };
  // working at the wall: the left forearm comes up with its console, the right hand points at the stone the suit is lifting
  let workOn = 0, work = 0; const workAim = v3(), wAim = v3(); let hasAim = false;
  let armedOn = 0, armed = 0;   // holding a gun (arms.js): both arms up to it, along where you look
  // The gun is placed where arms.js wants it in the frame of your eye (the camera: at the hip, aimed, kicked back by a shot, tilted
  // through a reload), and then held: the right glove round the pistol grip, thumb up it, the left cupping the fore-end with its
  // fingers round the far side (or, reloading, wherever the reload takes it: the pouch, the mag well, the charging handle). Each arm is
  // two bones solved to its wrist, the elbow hanging toward a pole (the right out and down, the left down and in); the forearm turns
  // with the hand; the torso blades a little into the gun and the left shoulder comes forward, as it does on a rifle. A grip the arm
  // can't reach slides the left hand back along the fore-end rather than letting it float.
  // Shot (arms.js): the whole body flinches away from the round, a quick tip about its feet that springs back; shot down, it topples
  // the way the round pushed it, as a body does when the legs go: slowly, then all at once, and it lies there, slumped. The gun in its
  // hands goes with it.
  const tip = { a: 0, v: 0, ax: v3(1, 0, 0), down: false, th: 0, om: 0, fax: v3(1, 0, 0) }, tipQ = new THREE.Quaternion(), tipM = new THREE.Matrix4(), tipT = new THREE.Matrix4();
  function tipOver(dt) {
    dt = Math.min(dt, 1 / 20);
    tip.v += (-260 * tip.a - 2 * Math.sqrt(260) * 0.5 * tip.v) * dt; tip.a += tip.v * dt;                     // the flinch: a stiff, underdamped spring
    if (tip.down) { if (tip.th < 1.5) { tip.om += (2.2 * Math.sin(tip.th + 0.25) + 0.6) * dt; tip.th = Math.min(1.5, tip.th + tip.om * dt); if (tip.th >= 1.5) tip.om = 0; } }
    else { tip.th = 0; tip.om = 0; }
    if (Math.abs(tip.a) < 1e-4 && tip.th < 1e-4) return;
    if (tip.th > 0) {   // slumped: the knees and the waist give as it goes
      B.torso.quaternion.multiply(tipQ.setFromAxisAngle(XA, 0.35 * Math.min(1, tip.th))); B.head.quaternion.multiply(tipQ.setFromAxisAngle(XA, 0.4 * Math.min(1, tip.th)));
    }
    tipQ.setFromAxisAngle(tip.ax, tip.a); if (tip.th > 0) tipQ.premultiply(qX.setFromAxisAngle(tip.fax, tip.th));
    root.quaternion.premultiply(tipQ);
    if (tip.th > 0) root.position.y += 0.17 * Math.sin(tip.th);   // lying, it rests on its back (or front), not through the ground
    if (gunOk) { tipT.makeTranslation(-root.position.x, -root.position.y, -root.position.z).premultiply(tipM.makeRotationFromQuaternion(tipQ)).premultiply(tipM.makeTranslation(root.position.x, root.position.y, root.position.z)); gunM.premultiply(tipT); }
  }
  // Climbing a tree (main.js keeps you on the trunk): you face it and hold on. Hand over hand: each hand reaches up the bark round
  // the trunk's side and pulls down as the other goes up; the feet push against it lower down, knees out, soles flat to the bark,
  // the same rhythm half a beat behind; the body leans in, head tipped back to look up. The rhythm is driven by how far you've
  // climbed (a cycle every 0.55 m), so going down plays it backwards and hanging still holds a grip, breathing.
  const clim = { on: false, x: 0, z: 0, r: 0.2, w: 0, ph: 0, lastY: null }, cQ = new THREE.Quaternion(), cN = v3(), cP = v3(), cH = v3(), qFoot = new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), -1.05);
  function climbPose(dt, s) {
    clim.w += ((clim.on ? 1 : 0) - clim.w) * Math.min(1, dt * 7); const w = clim.w * clim.w * (3 - 2 * clim.w);
    const gy = s.gy || 0; if (clim.lastY == null) clim.lastY = gy; const dy = gy - clim.lastY; clim.lastY = gy;
    if (Math.abs(dy) < 0.5) clim.ph += dy / 0.55 * Math.PI * 2;
    // face the trunk (root about your own feet: in first person the camera stays where it is)
    const dx = clim.x - s.x, dz = clim.z - s.z, dist = Math.hypot(dx, dz) || 1, ry = Math.atan2(dx / dist, dz / dist);
    let cur = root.rotation.y, d = Math.atan2(Math.sin(ry - cur), Math.cos(ry - cur)); root.rotation.y = cur + d * w;
    // seen from outside, right in against the bark; from your own eyes, where the camera is (it can't go into the bark)
    const inset = ghost.value > 0.5 ? -0.06 : Math.max(-0.06, dist - (clim.r + 0.3));
    root.position.x = s.x + dx / dist * inset * w; root.position.z = s.z + dz / dist * inset * w; root.position.y = gy;
    root.updateMatrixWorld();
    // the trunk in the body's own frame: its axis straight ahead at c, radius r
    const c = Math.max(clim.r + 0.12, dist - inset * w), r = clim.r, ph = clim.ph, still = 0.03 * Math.sin(nowT * 1.3);
    const onBark = (a, y, off, out) => { cN.set(Math.sin(a), 0, -Math.cos(a)); return out.set(r * Math.sin(a), y, c - r * Math.cos(a)).addScaledVector(cN, off); };
    const pel = B.pelvis, tor = B.torso;
    // lean in to the trunk, a little sit in the hips; the head tipped back to look up
    pel.position.copy(rest.pelvis); pel.position.y -= 0.1 * w; pel.position.z += 0.02 * w; pel.quaternion.slerp(cQ.setFromAxisAngle(XA, 0.18), w); qP.copy(pel.quaternion);
    tor.position.copy(rest.torso); tor.quaternion.slerp(cQ.setFromAxisAngle(XA, 0.12), w); B.head.quaternion.slerp(cQ.setFromAxisAngle(XA, -0.35), w);
    qTW.copy(qP).multiply(tor.quaternion); qI.copy(qTW).invert();
    // hands: up and round the trunk's sides, alternately reaching and pulling
    const sh = rest.pelvis.y + rest.torso.y + rest.armU_R.y - 0.1 * w;
    for (const [sd, sg, off] of [['R', -1, 0], ['L', 1, Math.PI]]) {
      const reach = 0.5 + 0.5 * Math.sin(ph + off), y = sh + 0.05 + 0.32 * reach + still;
      onBark(sg * 0.85, y, 0.035, palm);
      cN.set(Math.sin(sg * 0.85), 0, -Math.cos(sg * 0.85));
      xh.copy(cN).multiplyScalar(sd === 'R' ? -1 : 1); yh.set(0, -1, 0); zh.crossVectors(xh, yh);   // palm to the bark, fingers up
      B['armU_' + sd].position.copy(rest['armU_' + sd]);
      armTo(sd, palm, pole.set(-sg * 1, -0.6, -0.4), w);
    }
    // feet: lower down, pushing, the same rhythm half a beat behind; knees out round the trunk
    for (const [sd, sg, off] of [['R', -1, Math.PI * 0.5], ['L', 1, Math.PI * 1.5]]) {
      const lift = 0.5 + 0.5 * Math.sin(ph + off), y = 0.12 + 0.42 * lift;
      onBark(sg * 0.5, y, 0.1, A);
      H.copy(hipRest[sd]).applyQuaternion(qP).add(pel.position);
      pole.set(-sg * 0.7, 0.1, 1); q.copy(qFoot);
      const tq = B['thigh_' + sd].quaternion.clone(), sq = B['shin_' + sd].quaternion.clone(), fq = B['foot_' + sd].quaternion.clone();
      solveLeg(sd);
      if (w < 0.999) { B['thigh_' + sd].quaternion.copy(tq.slerp(B['thigh_' + sd].quaternion, w)); B['shin_' + sd].quaternion.copy(sq.slerp(B['shin_' + sd].quaternion, w)); B['foot_' + sd].quaternion.copy(fq.slerp(B['foot_' + sd].quaternion, w)); }
    }
  }
  const axisFor = (dx, dz, out) => { const l = Math.hypot(dx, dz) || 1; return out.set(dz / l, 0, -dx / l); };   // tipping about this carries the top along (dx, dz)
  let gunSpec = null, gunOk = false; const gunM = new THREE.Matrix4(), gunShort = { L: 0, R: 0 };
  const gP = v3(), gQ = new THREE.Quaternion(), eQ = new THREE.Quaternion(), eP = v3(), rQi = new THREE.Quaternion(), lQ = new THREE.Quaternion(), lP = v3(), gF = v3(), gU = v3(), gR = v3(),
    xh = v3(), yh = v3(), zh = v3(), palm = v3(), pa = v3(), pb = v3(), qU = new THREE.Quaternion(), qH = new THREE.Quaternion(), qX = new THREE.Quaternion(), eE = new THREE.Euler(0, 0, 0, 'YXZ'), ONE = v3(1, 1, 1), ptmp = v3();
  function armTo(sd, palmT, pl, w) {   // xh, yh, zh: the hand's axes; palmT: where its palm goes; pl: the elbow's pole
    const up = B['armU_' + sd], lo = B['armL_' + sd], hd = B['hand_' + sd], u = armLen.u, l = armLen.l;
    T.copy(palmT).addScaledVector(yh, 0.09).addScaledVector(zh, -0.02);                    // the wrist, back up the hand from the palm
    S.copy(up.position).applyQuaternion(B.torso.quaternion).add(B.torso.position).applyQuaternion(qP).add(B.pelvis.position);
    dir.subVectors(T, S); let D = dir.length(); const Dm = u + l - 0.004; gunShort[sd] = Math.max(0, D - Dm); if (D > Dm) { dir.multiplyScalar(Dm / D); T.addVectors(S, dir); D = Dm; } dir.divideScalar(Math.max(D, 1e-4));
    kd.copy(pl).addScaledVector(dir, -pl.dot(dir)).normalize();
    const ca = Math.max(-1, Math.min(1, (u * u + D * D - l * l) / (2 * u * D))), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
    K.copy(S).addScaledVector(dir, u * ca).addScaledVector(kd, u * sa);
    by.subVectors(S, K).normalize(); bx.crossVectors(by, kd).normalize(); bz.crossVectors(bx, by); qT.setFromRotationMatrix(M.makeBasis(bx, by, bz));
    q.copy(qI).multiply(qT); up.quaternion.slerp(q, w);
    // the forearm: elbow to wrist, hinged the way the upper arm is (its own turn is taken up at the wrist)
    by.subVectors(K, T).normalize(); bx.addScaledVector(by, -bx.dot(by)).normalize(); bz.crossVectors(bx, by); qS.setFromRotationMatrix(M.makeBasis(bx, by, bz));
    qU.copy(qTW).multiply(up.quaternion); q.copy(qU).invert().multiply(qS); lo.quaternion.slerp(q, w);
    qH.setFromRotationMatrix(M.makeBasis(xh, yh, zh)); q.copy(qU).multiply(lo.quaternion).invert().multiply(qH); hd.quaternion.slerp(q, w);
  }
  function solveGun(w, s, bobNow) {
    const G = gunSpec;
    // the eye in the world (exactly where the camera is put), and the gun from it
    eQ.setFromEuler(eE.set(s.pitch || 0, s.yaw || 0, 0, 'YXZ')); eP.set(s.x, (s.gy || 0) + EYE.y + bobNow, s.z);
    gQ.setFromEuler(eE.set(G.rot.x, G.rot.y, G.rot.z, 'XYZ')).premultiply(eQ); gP.copy(G.off).applyQuaternion(eQ).add(eP);
    gunM.compose(gP, gQ, ONE); gunOk = true;
    // the same in the body's own frame (as it finally stands this frame)
    rQi.setFromAxisAngle(UPY, -root.rotation.y); lP.copy(gP).sub(root.position).applyQuaternion(rQi); lQ.copy(rQi).multiply(gQ);
    gR.set(1, 0, 0).applyQuaternion(lQ); gU.set(0, 1, 0).applyQuaternion(lQ); gF.set(0, 0, -1).applyQuaternion(lQ);
    const onGun = (v, out) => out.copy(v).applyQuaternion(lQ).add(lP);
    const onEye = (v, out) => out.copy(v).applyQuaternion(eQ).add(eP).sub(root.position).applyQuaternion(rQi);
    // bladed: the torso turns a little to the right, the head back the other way; the left shoulder comes forward
    // a gun held is held steady: the spine comes upright out of whatever the idle was doing (a slouch, a look at the feet)
    const tor = B.torso, tw = 0.42 * w; qP.copy(B.pelvis.quaternion); qTW.copy(qP).multiply(tor.quaternion);
    ptmp.set(0, 1, 0).applyQuaternion(qTW); qX.setFromUnitVectors(ptmp, UP); qH.identity().slerp(qX, 0.85 * w); qTW.premultiply(qH); tor.quaternion.copy(qP).invert().multiply(qTW);
    // bladed into it: the torso turned a little to the right (the head turned back), the left shoulder forward
    tor.quaternion.multiply(qX.setFromAxisAngle(UP, -tw)); B.head.quaternion.premultiply(qX.setFromAxisAngle(UP, tw));
    B.armU_L.position.copy(rest.armU_L); B.armU_L.position.z += 0.07 * w; B.armU_L.position.y += 0.01 * w; B.armU_R.position.copy(rest.armU_R); B.armU_R.position.z += 0.015 * w;
    qTW.copy(qP).multiply(tor.quaternion); qI.copy(qTW).invert();
    // right: the palm against the grip's right side, thumb up it, fingers round its front
    xh.copy(gR).negate(); zh.copy(gU).addScaledVector(gF, 0.35); zh.addScaledVector(xh, -zh.dot(xh)).normalize(); yh.crossVectors(zh, xh);
    onGun(G.grip, palm).addScaledVector(xh, -0.03);
    armTo('R', palm, pole.copy(gR).multiplyScalar(0.8).addScaledVector(gU, -1).addScaledVector(gF, -0.2), w);
    // left: palm up under the fore-end (or along the reload's path), fingers round to the right, thumb along the barrel
    xh.copy(gU).negate(); zh.copy(gF); yh.crossVectors(zh, xh);
    const lh = G.lh; let pt;
    if (lh) { (lh.aEye ? onEye : onGun)(lh.a, pa); (lh.bEye ? onEye : onGun)(lh.b, pb); pt = pa.lerp(pb, lh.k); }
    else pt = onGun(G.sup, pa);
    palm.copy(pt).addScaledVector(gU, -0.012);
    if (!lh) {   // out of reach: slide back along the fore-end, toward the mag well, until it isn't
      S.copy(B.armU_L.position).applyQuaternion(tor.quaternion).add(tor.position).applyQuaternion(qP).add(B.pelvis.position);
      for (let k = 0, slid = 0; k < 6; k++) { const d = ptmp.copy(palm).addScaledVector(yh, 0.09).sub(S).length() - (armLen.u + armLen.l - 0.02); if (d <= 0 || slid > 0.16) break; const st = Math.min(d * 1.3, 0.16 - slid); palm.addScaledVector(gF, -st); slid += st; }
    }
    armTo('L', palm, pole.set(0, 0, 0).addScaledVector(gU, -1).addScaledVector(gR, -0.35).addScaledVector(gF, -0.1), w);
  }
  const qTW = new THREE.Quaternion(), S = v3(), T = v3(), E = v3(), nd = v3(), md = v3(), fw = v3(), upv = v3();
  const PHI = 0.733, CP = Math.cos(PHI), SP = Math.sin(PHI);                       // the wrist display faces 42 degrees round the forearm from its front
  // the console: a pane of light the wrist display throws up over the forearm, lettered along the arm
  // It is a hologram and not a screen: no backing, only the lettering, drawn in scanlines with a little colour fringing and a sweep running up it,
  // and a faint fan of light from the wrist display to its lower edge. It idles dim and brightens for a moment when what it says changes.
  const PW = 0.2, PH = 0.1;
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 320; const cg = cv.getContext('2d');
  const ctex = new THREE.CanvasTexture(cv); ctex.colorSpace = THREE.SRGBColorSpace; ctex.anisotropy = 4;
  const holo = { map: { value: ctex }, uOp: { value: 0 }, uTime: { value: 0 } };
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.ShaderMaterial({ uniforms: holo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D map; uniform float uOp, uTime; varying vec2 vUv;
      void main() {
        vec2 uv = vUv;
        float tick = floor(uTime * 12.0), glitch = step(0.975, fract(sin(tick * 91.7) * 4375.5));                 // now and then a line tears sideways
        uv.x += glitch * 0.01 * step(0.5, fract(sin((floor(uv.y * 16.0) + tick) * 12.9898) * 43758.5));
        float fr = 0.0022 + 0.004 * glitch;
        vec3 c = vec3(texture2D(map, uv + vec2(fr, 0.0)).r, texture2D(map, uv).g, texture2D(map, uv - vec2(fr, 0.0)).b);
        float scan = 0.74 + 0.26 * sin(uv.y * 377.0 - uTime * 2.2);                                              // 60 lines, creeping
        float sweep = 1.0 + 0.55 * smoothstep(0.07, 0.0, abs(fract(uTime * 0.11) * 1.3 - 0.15 - uv.y));          // a bright band running up
        float edge = smoothstep(0.0, 0.035, uv.x) * smoothstep(1.0, 0.965, uv.x) * smoothstep(0.0, 0.05, uv.y) * smoothstep(1.0, 0.95, uv.y);
        float flick = 0.94 + 0.06 * sin(uTime * 31.0) * sin(uTime * 7.3);
        vec2 gq = fract(uv * vec2(32.0, 16.0)) - 0.5;
        float dots = smoothstep(0.16, 0.05, length(gq)) * 0.03;                                                  // the faintest grid of points, so the pane has a plane
        gl_FragColor = vec4((c * scan * sweep + vec3(0.25, 0.9, 1.0) * dots) * edge * flick * uOp, 1.0);
      }` }));
  pane.visible = false; pane.renderOrder = 8; root.add(pane);                   // it hangs in the air over the display, turned to your eye
  const fanG = new THREE.BufferGeometry(); fanG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3)); fanG.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0.5, 0, 0, 1, 1, 1]), 2));
  const fan = new THREE.Mesh(fanG, new THREE.ShaderMaterial({ uniforms: holo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, fog: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uOp, uTime; varying vec2 vUv;
      void main() { float v = vUv.y, a = (vUv.x - 0.5) / max(v, 0.001) + 0.5;                                   // a: across the fan; v: wrist to pane
        float rays = 0.55 + 0.45 * sin(a * 70.0 + sin(uTime * 0.7) * 2.0) * sin(a * 23.0 - uTime * 1.3);
        gl_FragColor = vec4(vec3(0.2, 0.85, 1.0) * 0.11 * rays * pow(1.0 - v, 1.4) * smoothstep(0.0, 0.08, v) * uOp, 1.0); }` }));
  fan.visible = false; fan.frustumCulled = false; fan.renderOrder = 7; root.add(fan);
  let wakeAt = -9, nowT = 0; const pc = v3();
  const DOWN = v3(0, -1, 0), UP = v3(0, 1, 0), XA = v3(1, 0, 0);

  let stepW = 0, legRun = 0;
  function leg(sd, u, duty, travel, lift, pelvisPos) {
    // where this foot should be: planted and sliding back under you through stance, lifted and carried forward through swing
    let along, h, pitch;
    if (u < duty) { const s = u / duty; along = lerp(0.42, -0.58, s) * travel; h = 0; pitch = s < 0.15 ? lerp(-0.18, 0, s / 0.15) : sstep(0.55, 1, s) * 0.62; }
    else { const s = (u - duty) / (1 - duty), e = s * s * (3 - 2 * s); along = lerp(-0.58, 0.42, e) * travel; h = lift * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.8)), 1.2) + legRun * 0.14 * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.7)), 2);   /* running, the heel kicks up behind */ pitch = lerp(0.62, -0.18, sstep(0.1, 0.9, s)) + 0.35 * Math.sin(Math.PI * s) * Math.min(1, lift * 5); }
    along *= move; h *= move; pitch *= move;
    const sx = sd === 'L' ? 1 : -1, hip = hipRest[sd];
    H.copy(hip).applyQuaternion(qP).add(pelvisPos);
    A.set(sx * (0.1 + stepW * move) + vr * along * -1, ANKLE + h + 0.13 * Math.sin(Math.max(pitch, 0)), vf * along);   // model front is +z; the wearer's right is -x
    pole.set(0, 0.25, 1); q.setFromEuler(eul.set(pitch, sx * 0.1, 0));   // toes turned out a little
    solveLeg(sd);
  }
  /** Two bones from the hip (H) to the ankle (A), the knee toward pole, the foot turned to q: all in the body's own frame. */
  function solveLeg(sd) {
    dir.subVectors(A, H); let D = dir.length(); const Dm = L1 + L2 - 0.004; if (D > Dm) { dir.multiplyScalar(Dm / D); A.addVectors(H, dir); D = Dm; }
    dir.divideScalar(D);
    kd.copy(pole).addScaledVector(dir, -pole.dot(dir)); if (kd.lengthSq() < 1e-6) kd.set(0, 0, 1); kd.normalize();
    const ca = (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
    K.copy(H).addScaledVector(dir, L1 * ca).addScaledVector(kd, L1 * sa);
    // thigh: -y down the bone, +z toward the knee side
    by.subVectors(H, K).normalize(); bx.crossVectors(by, kd).normalize(); bz.crossVectors(bx, by);
    qT.setFromRotationMatrix(M.makeBasis(bx, by, bz)); B['thigh_' + sd].quaternion.copy(qI.copy(qP).invert()).multiply(qT);
    by.subVectors(K, A).normalize(); bz.crossVectors(bx, by);
    qS.setFromRotationMatrix(M.makeBasis(bx, by, bz)); B['shin_' + sd].quaternion.copy(qI.copy(qT).invert()).multiply(qS);
    B['foot_' + sd].quaternion.copy(qI.copy(qS).invert()).multiply(q);
  }

  // ---------------------------------------------------------------- motion capture (motion.js): a manner of walking, things done standing, gestures
  // The stride clock, the speed and the direction of travel are the body's own, as before. What changes is where the pose comes from:
  // one stride of somebody really walking (and one of them running), read at the clock's phase, in place of the rules above.
  // A capture was walked at one speed. Slower than that, the steps shorten and slow together; between its walk and its run the two are
  // mixed; faster than its run, the stride lengthens first and then quickens. The feet are not played back as angles: each frame says where
  // the ankle is, and the leg is solved to it, so the same stride serves a longer or shorter leg and can be stretched without the foot skating.
  const cap = { want: 'easy', gait: null, a: new Float32Array(NCH), b: new Float32Array(NCH), loco: new Float32Array(NCH), stand: new Float32Array(NCH), em: new Float32Array(NCH), out: new Float32Array(NCH),
    ks: 1, idle: { clip: null, t: 0, prev: null, pt: 0, fade: 1, next: null, stood: 0, shotAt: 18 + Math.random() * 20 }, emote: { clip: null, id: null, t: 0, w: 0, n: 0, at: -9 } };
  const ease = x => x * x * (3 - 2 * x), footQ = new THREE.Quaternion(), qA = new THREE.Quaternion();
  function capGait(lib) { if (!lib || !cap.want || cap.want === 'classic') return null; if (!cap.gait || cap.gait.id !== cap.want) cap.gait = lib.gaits.find(g => g.id === cap.want) || lib.gaits[0] || null; return cap.gait; }
  /** Advance the stride clock from the capture's own timing and read the stride there. Returns false if there is no capture to walk by. */
  function capStride(dt) {
    const g = capGait(motionLib()); if (!g) return false;
    const Lr = L1 + L2, W = g.walk, R = g.run || g.walk, vw = W.v * Lr, vr2 = Math.max(vw * 1.25, R.v * Lr);
    let wr, rate, ks, T;
    if (speed <= vw) { const k = Math.max(0, speed / vw); wr = 0; ks = Math.sqrt(k); rate = Math.sqrt(k); T = W.T; }
    else if (speed < vr2) { wr = (speed - vw) / (vr2 - vw); ks = 1; rate = 1; T = lerp(W.T, R.T, wr); }
    else { const k = speed / vr2; wr = 1; ks = Math.min(Math.pow(k, 0.7), 1.9); rate = Math.min(k / ks, 1.7); T = R.T; }
    if (speed > 0.05) cyc = (cyc + dt * rate / T) % 1;
    sample(W, cyc * W.n, cap.a); if (wr > 0) { sample(R, cyc * R.n, cap.b); blend(cap.a, cap.b, wr, cap.loco); } else cap.loco.set(cap.a);
    cap.ks = ks; return true;
  }
  /** What the body does standing: one way of standing about after another, eased into each other, and now and then a fidget. */
  function capStand(dt, lib, quiet) {
    const I = cap.idle, C = lib.clip; if (!I.clip) { I.clip = C[STAND[0]] || Object.values(C)[0]; I.t = Math.random() * 2; }
    if (!I.clip) return false;
    I.t += dt; I.stood += dt; const c = I.clip, dur = c.n / c.fps, X = 0.7;
    if (I.t >= dur - X) {
      let id; if (!quiet && I.stood > I.shotAt && !FIDGET.includes(c.id)) { id = FIDGET[Math.floor(Math.random() * FIDGET.length)]; I.shotAt = I.stood + 25 + Math.random() * 35; }
      else { const o = STAND.filter(k => k !== c.id && C[k]); id = o[Math.floor(Math.random() * o.length)]; }
      I.prev = c; I.pt = I.t; I.clip = C[id] || c; I.t = 0; I.fade = 0;
    }
    sample(I.clip, I.t * I.clip.fps, cap.a);
    if (I.fade < 1 && I.prev) { I.fade = Math.min(1, I.fade + dt / X); I.pt += dt; sample(I.prev, I.pt * I.prev.fps, cap.b); blend(cap.b, cap.a, ease(I.fade), cap.stand); } else cap.stand.set(cap.a);
    return true;
  }
  /** The whole pose for this frame from the capture, onto the rig: pelvis, legs, chest and arms. (The head, reaching, the wall and the hands come after, as before.) */
  function capPose(dt, lean, bank, down) {
    const lib = motionLib(), f = cap.out, E = cap.emote;
    if (!capStand(dt, lib, workOn > 0 || move > 0.3)) return false;
    if (move > 0.6) { cap.idle.stood = 0; cap.idle.shotAt = 18 + Math.random() * 20; }
    if (E.clip) {   // a gesture: all of you if you are standing, from the waist up if you are walking
      E.t += dt; const dur = E.clip.n / E.clip.fps; E.w = Math.min(1, E.t / 0.25, Math.max(0, (dur - E.t) / 0.4));
      sample(E.clip, E.t * E.clip.fps, cap.em); if (E.t >= dur) { E.clip = null; E.w = 0; }
    }
    const w = ease(Math.max(0, E.w)); if (w > 0) blend(cap.stand, cap.em, w, cap.stand);
    blend(cap.stand, cap.loco, ease(move), f);
    if (w > 0 && move > 0.01) blend(f, cap.em, w, f, 7, 39);
    const Lr = L1 + L2, pel = B.pelvis, ks = lerp(1, cap.ks, move), fz = lerp(1, vf, move), fx = -vr * move;
    pel.position.set(rest.pelvis.x + f[0] * Lr, rest.pelvis.y + f[1] * Lr - 0.012 * down, rest.pelvis.z + f[2] * Lr);
    q.set(f[3], f[4], f[5], f[6]); qA.setFromEuler(eul.set(lean * 0.4, 0, bank * 0.6)); pel.quaternion.copy(qA).multiply(q); qP.copy(pel.quaternion);
    for (const [sd, c] of [['L', 39], ['R', 49]]) {
      const a = f[c + 2] * Lr * ks;
      H.copy(hipRest[sd]).applyQuaternion(qP).add(pel.position);
      A.set(f[c] * Lr + fx * a, Math.max(ANKLE, ANKLE + f[c + 1] * Lr), fz * a);
      pole.set(f[c + 7], f[c + 8], f[c + 9]); q.set(f[c + 3], f[c + 4], f[c + 5], f[c + 6]); solveLeg(sd);
    }
    const tor = B.torso; tor.position.copy(rest.torso); q.set(f[7], f[8], f[9], f[10]); qA.setFromEuler(eul.set(lean * 0.8 + 0.03 * down, 0, bank * 0.5)); tor.quaternion.copy(q).multiply(qA);
    for (const [sd, c] of [['L', 15], ['R', 27]]) {
      const up = B['armU_' + sd], lo = B['armL_' + sd], hd = B['hand_' + sd]; up.position.copy(rest['armU_' + sd]);
      up.quaternion.set(f[c], f[c + 1], f[c + 2], f[c + 3]); lo.quaternion.set(f[c + 4], f[c + 5], f[c + 6], f[c + 7]); hd.quaternion.set(f[c + 8], f[c + 9], f[c + 10], f[c + 11]);
    }
    headQ.set(f[11], f[12], f[13], f[14]);
    return true;
  }
  const headQ = new THREE.Quaternion(), hp = new THREE.Vector3(), UPY = new THREE.Vector3(0, 1, 0); let capOn = false, capYaw = 0;

  /** Pose the body under the camera. s = { x, z, yaw, pitch, t }. Returns the eye's bob for this frame. */
  function update(dt, s) {
    for (const m of topSpin) m.rotation.y += dt * 11;
    // how fast, and which way relative to the body, from where you actually went (hedges and voids included)
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
    let vx = 0, vz = 0;
    if (has && dt > 0) { vx = (s.x - prev.x) / dt; vz = (s.z - prev.z) / dt; if (Math.hypot(s.x - prev.x, s.z - prev.z) > 1.2) vx = vz = 0; }
    prev.set(s.x, 0, s.z); has = true;
    const sp = Math.min(8, Math.hypot(vx, vz)); speed += (sp - speed) * Math.min(1, dt * 9);
    move += ((speed > 0.25 ? 1 : 0) - move) * Math.min(1, dt * (speed > 0.25 ? 9 : 6));
    if (sp > 0.3) { const f = (vx * fx + vz * fz) / sp, r = (vx * fz * -1 + vz * fx) / sp, k = Math.min(1, dt * 10); vf += (f - vf) * k; vr += (r - vr) * k; const n = Math.hypot(vf, vr) || 1; vf /= n; vr /= n; }
    const run = sstep(2.7, 5.2, speed),   // (by the rules) the ordinary pace is a walk; Shift is a run
          sprint = sstep(3.6, 6.2, speed);
    const stepLen = (0.5 + 0.19 * speed) * strideK, duty = lerp(0.6, 0.4, run), travel = Math.min(0.86, duty * 2 * stepLen), lift = (lerp(0.06, 0.2, run) + 0.06 * sprint) * (0.9 + 0.2 * hash(stride * 3.1));
    capOn = capStride(dt); if (!capOn) cyc = (cyc + speed * dt / (2 * stepLen)) % 1;
    if (cyc < lastCyc) { stride++; strideK = 0.96 + 0.08 * hash(stride); strideW = (hash(stride * 7.3) - 0.5) * 0.03; } lastCyc = cyc;   // no two strides alike
    const psi = 2 * Math.PI * (cyc - duty / 2), two = Math.cos(2 * psi);
    // walking vaults over a stiff leg, so you are highest at mid-stance; running drops onto a bent one, so you are lowest there
    bob = lerp(1, -1, run) * two * lerp(0.016, 0.026, run) * move;
    // how you are changing speed and heading, for leaning into them
    if (dt > 0) { accel += (((speed - prevSpeed) / dt) - accel) * Math.min(1, dt * 4); prevSpeed = speed;
      if (prevYaw != null) { let dy = s.yaw - prevYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); turnRate += (dy / dt - turnRate) * Math.min(1, dt * 5); } prevYaw = s.yaw; }
    // standing: the weight moves from one foot to the other now and then, slowly, the way people stand
    idleT += dt; if (idleT > idleNext) { idleT = 0; idleNext = 3 + 6 * Math.random(); idleTarget = Math.random() < 0.25 ? 0 : (Math.random() < 0.5 ? -1 : 1) * (0.6 + 0.4 * Math.random()); }
    idleShift += (idleTarget - idleShift) * Math.min(1, dt * 0.9);
    const breath = Math.sin(s.t * 1.15) * (1 - 0.6 * move);
    if (!enabled) return bob;

    const down = sstep(0.05, 1.25, -s.pitch), back = EYE.z + tune.crane * down;   // looking down, the head cranes forward over the chest
    root.position.set(s.x - fx * back, s.gy || 0, s.z - fz * back); root.rotation.set(0, s.yaw + Math.PI, 0);   // (upright: a flinch or a fall tips it at the end)
    own.uBodyFwd.value.set(fx, 0, fz);
    own.uLampDir.value.set(0.5, 0.62, 0.6).normalize().applyAxisAngle(UP, s.yaw + Math.PI);

    // pelvis: bobs with the stride, drops a little at speed, turns against the shoulders
    const still = 1 - move, cp = Math.cos(psi);
    const swayX = (lerp(0.028, 0.012, run) * cp * move + 0.024 * idleShift * still) * (1 + 0.15 * Math.sin(s.t * 0.7));   // over the foot that carries you
    const lean = Math.max(-0.12, Math.min(0.12, accel * 0.035)), bank = Math.max(-0.16, Math.min(0.16, -turnRate * speed * 0.05));
    const pel = B.pelvis, tor = B.torso;
    if (capOn) capOn = capPose(dt, lean, bank, down);
    if (!capOn) {
    pel.position.copy(rest.pelvis); pel.position.y += bob * 1.2 - 0.022 - 0.04 * run * move - 0.012 * down - 0.012 * Math.abs(idleShift) * still;
    pel.position.x += spg('swayX', swayX, dt, 40, 0.5);
    // the hip drops on the side of the swinging leg, the pelvis turns with it, and the whole body banks into a turn
    pel.rotation.set(spg('pelX', 0.02 * run * move + lean * 0.4, dt, 50), -0.09 * Math.sin(psi) * move * (1 - 0.3 * run), spg('pelZ', lerp(0.05, 0.03, run) * cp * move + 0.035 * idleShift * still + bank * 0.6, dt, 60, 0.5)); qP.copy(pel.quaternion);
    legRun = run * move; stepW = strideW; leg('L', cyc, duty, travel, lift, pel.position); stepW = -strideW; leg('R', (cyc + 0.5) % 1, duty, travel, lift, pel.position);
    // the spine: shoulders turning against the hips, bending to keep the head level over the dropping hip, leaning into starts and turns, all a beat late
    tor.rotation.set(spg('torX', 0.03 + 0.1 * run * move + 0.004 * breath + 0.03 * down + lean * 0.8, dt, 45, 0.5),
      spg('torY', 0.15 * Math.sin(psi - 0.35) * move, dt, 70, 0.6),
      spg('torZ', -0.75 * pel.rotation.z + bank * 0.5 + 0.01 * Math.sin(s.t * 0.37) * still, dt, 55, 0.5));
    tor.position.copy(rest.torso); tor.position.y += 0.002 * breath;

    }
    // arms: swing against the legs, loose and nearly straight walking, bent and pumping running
    const sw = lerp(0.36, 0.55, run) * move;
    const g = tune.reach != null ? tune.reach : reachT < 0 ? 0 : (() => { const a = s.t - reachT; return a < 0.14 ? sstep(0, 0.14, a) : a < 0.7 ? 1 : 1 - sstep(0.7, 1.25, a); })();
    for (const sd of ['L', 'R']) {
      const sx = sd === 'L' ? 1 : -1, ph = Math.sin(psi) * sx;
      const up = B['armU_' + sd], lo = B['armL_' + sd], hd = B['hand_' + sd];
      if (!capOn) {
      up.position.copy(rest['armU_' + sd]); up.position.y += 0.003 * breath + 0.006 * run * move * Math.max(0, -ph);   // the shoulder rides up a little on the back swing
      // From the shoulder, swinging further forward than back. Jogging, the elbows bend and the hands come across toward the middle of the body
      // as they swing forward and out to the side going back; the elbow closes as the arm comes forward and opens going back, a beat late.
      const phL = Math.sin(psi - 0.45) * sx, fwd = Math.max(ph, 0), bk = Math.max(-ph, 0), rm = run * move;
      const uX = spg('uX' + sd, -0.06 - sw * (fwd * 1.1 - bk * 0.75) + 0.05 * rm + 0.012 * breath * still + 0.03 * idleShift * sx * still, dt, 34, 0.4);
      const uZ = spg('uZ' + sd, sx * (0.08 + 0.06 * rm * bk - 0.07 * rm * fwd + 0.025 * Math.abs(ph) * move * (1 - rm) + 0.01 * Math.sin(s.t * 0.5 + sx)), dt, 36, 0.45);
      const lX = spg('lX' + sd, -(0.28 + 0.92 * rm) - 0.34 * sw * phL - 0.06 * still * (0.5 + 0.5 * Math.sin(s.t * 0.31 + sx * 2)), dt, 28, 0.36);
      up.rotation.set(uX, spg('uY' + sd, sx * 0.12 * rm * fwd, dt, 30, 0.5), uZ); lo.rotation.set(lX, spg('lY' + sd, -sx * (0.12 + 0.3 * rm) * fwd * move, dt, 30, 0.5), -sx * 0.18 * rm);
      hd.rotation.set(spg('hX' + sd, -0.08 + 0.18 * sw * Math.sin(psi - 0.9) * sx, dt, 35, 0.35), 0, sx * 0.1);
      }
      if (sd === 'R' && g > 0) {   // reaching out toward what you are pointing at
        aim.set(0, EYE.y + Math.sin(s.pitch) * 2, back + Math.cos(s.pitch) * 2); sh.copy(rest.armU_R).add(rest.torso).add(rest.pelvis);
        tmp.subVectors(aim, sh).normalize(); q.setFromUnitVectors(DOWN, tmp); up.quaternion.slerp(q, g);
        lo.rotation.x = lerp(lo.rotation.x, -0.22, g); lo.rotation.z = lerp(lo.rotation.z, 0, g); hd.rotation.x = lerp(hd.rotation.x, -0.25, g);
      }
    }
    work += ((tune.work != null ? tune.work : workOn) - work) * Math.min(1, dt * 5); pane.visible = fan.visible = work > 0.02; nowT = s.t != null ? s.t : nowT + dt; holo.uTime.value = nowT;
    holo.uOp.value = Math.min(1, work * 1.2) * (0.5 + 0.5 * Math.exp(-Math.max(0, nowT - wakeAt - 1.6) * 1.1));
    if (work > 0.002) {
      const w = work * work * (3 - 2 * work), pe = Math.max(-1.0, Math.min(0.3, s.pitch));
      qTW.copy(qP).multiply(tor.quaternion); qI.copy(qTW).invert();
      E.set(0, EYE.y + bob, back); fw.set(0, Math.sin(pe), Math.cos(pe)); upv.set(0, Math.cos(pe), -Math.sin(pe));
      { // left arm: two bones to a wrist held up in the lower left of your view, the display turned to your eye
        const up = B.armU_L, lo = B.armL_L, hd = B.hand_L;
        S.copy(up.position).applyQuaternion(tor.quaternion).add(tor.position).applyQuaternion(qP).add(pel.position);
        T.copy(E).addScaledVector(fw, 0.36).addScaledVector(upv, -0.2); T.x += 0.2;
        dir.subVectors(T, S); let D = dir.length(); const Dm = armLen.u + armLen.l - 0.004; if (D > Dm) { dir.multiplyScalar(Dm / D); T.addVectors(S, dir); D = Dm; } dir.divideScalar(D);
        pole.set(1, -0.75, -0.15); kd.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
        const ca = (armLen.u * armLen.u + D * D - armLen.l * armLen.l) / (2 * armLen.u * D), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
        K.copy(S).addScaledVector(dir, armLen.u * ca).addScaledVector(kd, armLen.u * sa);
        by.subVectors(S, K).normalize(); bx.crossVectors(by, kd).normalize(); bz.crossVectors(bx, by); qT.setFromRotationMatrix(M.makeBasis(bx, by, bz));
        q.copy(qI).multiply(qT); up.quaternion.slerp(q, w);
        by.subVectors(K, T).normalize(); nd.subVectors(E, T).addScaledVector(by, 0.1); nd.addScaledVector(by, -nd.dot(by)).normalize(); md.crossVectors(by, nd);
        bz.copy(nd).multiplyScalar(CP).addScaledVector(md, -SP); bx.copy(nd).multiplyScalar(SP).addScaledVector(md, CP); qS.setFromRotationMatrix(M.makeBasis(bx, by, bz));
        // the forearm's parent is the upper arm as posed this frame
        q.copy(qTW).multiply(up.quaternion).invert().multiply(qS); lo.quaternion.slerp(q, w); hd.rotation.set(lerp(hd.rotation.x, -0.12, w), 0, lerp(hd.rotation.z, 0, w));
        // the pane: over the display (taken from where the solved forearm puts it), lifted toward the top of your view, lettered level
        // (held at a fixed place in the lower left of your view, so it can always be read; the wrist comes up beneath it)
        pane.position.copy(E).addScaledVector(fw, 0.42).addScaledVector(upv, -0.128); pane.position.x += tune.paneX;
        // turned to face your eye and a little past it, so the far edge runs away in perspective, and leaning back a touch
        bz.copy(fw).multiplyScalar(-1).addScaledVector(XA, -Math.tan(Math.atan(tune.paneX / 0.42) + 0.16)).addScaledVector(upv, 0.1).normalize();
        bx.crossVectors(upv, bz).normalize(); md.crossVectors(bz, bx); pane.quaternion.setFromRotationMatrix(M.makeBasis(bx, md, bz));
        { const P = fanG.attributes.position; tmp.copy(T).addScaledVector(by, 0.075).addScaledVector(nd, 0.04); P.setXYZ(0, tmp.x, tmp.y, tmp.z);      // from the wrist display
          pc.set(-PW / 2, -PH / 2, 0).applyQuaternion(pane.quaternion).add(pane.position); P.setXYZ(1, pc.x, pc.y, pc.z);
          pc.set(PW / 2, -PH / 2, 0).applyQuaternion(pane.quaternion).add(pane.position); P.setXYZ(2, pc.x, pc.y, pc.z); P.needsUpdate = true; }
      }
      { // right arm: out toward the stone, elbow a little soft, palm turned to it
        const up = B.armU_R, lo = B.armL_R, hd = B.hand_R;
        S.copy(up.position).applyQuaternion(tor.quaternion).add(tor.position).applyQuaternion(qP).add(pel.position);
        if (hasAim) { root.updateMatrixWorld(); aim.copy(wAim); root.worldToLocal(aim); } else aim.copy(E).addScaledVector(fw, 3);
        workAim.lerp(aim, Math.min(1, dt * 9)); tmp.subVectors(workAim, S); if (tmp.lengthSq() < 0.04) tmp.copy(fw); tmp.normalize();
        tmp.y = Math.max(tmp.y, -0.92); tmp.x -= 0.05; tmp.normalize();
        q.setFromUnitVectors(DOWN, tmp); q.premultiply(qI); up.quaternion.slerp(q, w * (0.75 + 0.25 * (hasAim ? 1 : 0)));
        lo.rotation.x = lerp(lo.rotation.x, -0.28, w); lo.rotation.z = lerp(lo.rotation.z, 0, w); hd.rotation.x = lerp(hd.rotation.x, -0.55, w * (hasAim ? 1 : 0.4));
      }
    }
    // holding a gun: the arms are solved to it at the very end, once the body has settled where it stands (solveGun, below)
    armed += (armedOn - armed) * Math.min(1, dt * 8);
    // the hands, last: gestures, springs and their own inertia on top of the arms' pose
    turnKick *= Math.exp(-dt * 5);
    hands.update(dt, s.t || nowT, { move, run, phase: psi, reach: g, reachAge: reachT < 0 ? 9 : s.t - reachT, work, gesture: Object.assign({}, gesture, { turn: turnKick }), point, armed: gunSpec ? armed * (1 - work) : 0 }, root);
    // head: on its neck, nodding with your gaze. You never see it (uGhost), but your shadow has it.
    if (capOn) { B.head.quaternion.identity().slerp(headQ, neck); B.head.quaternion.multiply(qA.setFromEuler(eul.set(-s.pitch * 0.55 * neck, 0, 0))); }
    else B.head.rotation.set((-s.pitch * 0.55 - tor.rotation.x * 0.5) * neck, 0, 0);
    // You are where your head is. A lean, a stoop or a run carries the neck away from where it stands at rest, and looking down you would
    // see the collar slide out from under you; so the body is hung from its neck: the same amount is taken back off the whole of it.
    // (Up to a point: a deep bow still bows away from you.)
    // And you face the way your chest does: a recorded way of standing has the chest turned off to one side of the hips, which from
    // inside is your own chest sitting askew under your gaze. What stays of that turn (slowly followed, so the feet do not swivel) is taken out.
    if (capOn) { hp.set(0, 0, 1).applyQuaternion(tor.quaternion).applyQuaternion(pel.quaternion); const yc = Math.atan2(hp.x, hp.z) * (1 - move) * (1 - Math.max(0, cap.emote.w)); capYaw += (yc - capYaw) * Math.min(1, dt * 0.9); }
    else capYaw *= Math.exp(-dt * 3);
    root.rotation.y -= 0.85 * capYaw;
    hp.copy(rest.head).applyQuaternion(tor.quaternion).add(tor.position).applyQuaternion(pel.quaternion).add(pel.position);
    hp.x -= rest.pelvis.x + rest.torso.x + rest.head.x; hp.z -= rest.pelvis.z + rest.torso.z + rest.head.z; hp.y = 0;
    const hl = hp.length(), HL = 0.24; if (hl > HL) hp.multiplyScalar(HL / hl);
    hp.applyAxisAngle(UPY, root.rotation.y); root.position.x -= hp.x; root.position.z -= hp.z;
    if (gunSpec && armed > 0.002 && work < 0.98) solveGun(armed * armed * (3 - 2 * armed) * (1 - work), s, bob); else gunOk = false;
    if (clim.on || clim.w > 0.002) climbPose(dt, s); else clim.w = 0;
    tipOver(dt);
    return bob;
  }

  return {
    root, update,
    get bob() { return bob; },
    reach(t) { reachT = t; },
    /** 'eye' hides the head (you are inside it); 'mirror' shows it, for any view from outside. The shadow pass always has it. */
    pass(p) { ghost.value = p === 'eye' ? 1 : 0; },
    setInk(k) { own.uInk.value = k; },
    /** Wear an outfit (outfits.js: five linear colours), or null for the suit as built. */
    setOutfit(o) {
      const b = (o && o.b) || 'astro';
      if (b !== wanted) { wanted = b; (b === 'astro' ? Promise.resolve(model) : loadSuit(b)).then(m => { if (wanted === b && wearing !== b) wear(m, b); }, () => { if (wanted === b) wanted = wearing; }); }
      if (o && o.g) cap.want = o.g;
      setTop(o && o.top); own.uOutfit.value = o ? 1 : 0; if (o) for (const [u, k] of [['uSuit', 'suit'], ['uTrim', 'trim'], ['uAccent', 'accent'], ['uVisor', 'visor'], ['uGlowC', 'glow']]) own[u].value.fromArray(o[k]);
    },
    /** How you carry yourself: a gait from the motion library by id ('easy', 'proud', 'old'...), or 'classic' for the body's own rules. */
    setStyle(id) { cap.want = id || 'easy'; }, get style() { return cap.want; },
    /** Do a gesture (a clip id from the motion library). */
    emote(id) { const lib = motionLib(), c = lib && lib.clip[id]; if (!c) return false; const E = cap.emote; E.clip = c; E.id = id; E.t = 0; E.w = 0; E.n++; E.at = nowT; return true; },
    /** The gesture under way or lately begun, for telling the others: [id, count] or null. */
    get emoting() { const E = cap.emote; return E.id && nowT - E.at < 2.5 ? [E.id, E.n] : null; },
    /** Put on another suit's model directly (tests). */
    wear, get wearing() { return wearing; },
    /** Someone talking: the suit's glow strips brighten with their voice (0..1). */
    setTalk(v) { own.uGlow.value = 0.85 + 1.6 * Math.max(0, Math.min(1, v)); },
    /** Free what this body made for itself (another player's body, when they leave). The suit's own geometry is shared and stays. */
    dispose(shared) { root.traverse(o => { if (o.isMesh) { if (!o.geometry.userData.shared && (!shared || !shared.has(o.geometry))) o.geometry.dispose(); } }); for (const m of [mat, headMat, ink, headInk]) m.dispose(); ctex.dispose(); },
    setEnabled(v) { enabled = !!v; root.visible = enabled; },
    /** on: working at the wall (console up, right hand out). aim: the world point the right hand points at, or null for where you look. */
    setWork(on, aim) { workOn = on ? 1 : 0; hasAim = !!aim; if (aim) wAim.copy(aim); },
    /** Holding a gun (arms.js). spec, each frame it's held: { off (m, in the eye's frame: x right, y up, z back), rot (Euler, the gun's
     *  own tilt), grip, sup (points on the gun, its own frame: -z forward), lh: null, or the left hand's way through a reload { a, b, k,
     *  aEye, bEye } (a to b by k; each point on the gun, or in the eye's frame if aEye / bEye) }. Off: null. */
    setArmed(on, spec) { armedOn = on ? 1 : 0; if (spec) gunSpec = spec; else if (!on && armed < 0.01) gunSpec = null; },
    /** Climbing a trunk at (x, z), radius r (m), or not (null). */
    setClimb(c) { if (c && isFinite(c.x) && isFinite(c.z)) { if (!clim.on) clim.lastY = null; clim.on = true; clim.x = c.x; clim.z = c.z; clim.r = Math.max(0.05, Math.min(3, +c.r || 0.2)); } else clim.on = false; },
    get climbing() { return clim.on; },
    /** Hit: flinch away along the round's way (dx, dz in the world), harder for a heavier round (k ~ 1). */
    react(dx, dz, k = 1) { axisFor(dx, dz, tip.ax); tip.v += 2.4 * Math.max(0.2, Math.min(2, k)); },
    /** Down (shot down) or up again; falling the round's way (dx, dz). */
    setDown(on, dx = 0, dz = 1) { if (on && !tip.down) { axisFor(dx, dz, tip.fax); tip.th = 0.02; tip.om = 0.4; } tip.down = !!on; },
    get isDown() { return tip.down; },
    /** Where the held gun is this frame (world): false if it isn't held. */
    gunWorld(out) { if (!gunOk) return false; out.copy(gunM); return true; },
    /** How far each arm fell short of its hold this frame (m), for tests. */
    get gunShort() { return gunShort; }, get armedW() { return armed; },
    /** What the hands are doing at the wall: { held, effort, hover, press, placing, ghost }; turn(sign) when the stone in hand is turned; point(0..1) aims a finger. */
    setGesture(g) { gesture = g || {}; }, turn(sign) { turnKick = Math.max(-0.5, Math.min(0.5, turnKick + 0.22 * sign)); }, point(v) { point += (v - point) * 0.2; },
    get hands() { return hands; },
    /** The right palm, in world space: where the suit's lifting beam starts. */
    palm(out) { return B.hand_R.localToWorld(out.set(0, -0.09, 0.02)); },
    /** The console's canvas: draw on g (640 x 320), then call done(). wake() brightens it for a moment: call it when what it says has changed. */
    console: { g: cg, w: 640, h: 320, done() { ctex.needsUpdate = true; }, wake() { wakeAt = nowT; } },
    get enabled() { return enabled; },
    uniforms: own, bones: B, tune,
  };
}
