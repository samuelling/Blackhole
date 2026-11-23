// The walker's own body: a hard-shell suit (tools/blender/build_astronaut.py), cel-shaded with ink outlines.
// Look down and it is there, and it casts your shadow, helmet and all. The suit is rigid shells on joints, so the
// rig is a tree of groups posed each frame: legs by two-bone IK to planted feet, arms swinging against them.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createHands } from './hands.js';

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
uniform vec3 uLampDir; uniform vec3 uLampCol; uniform vec3 uBodyFwd; uniform float uGlow; uniform float uGhost; varying vec3 vWPos;`)
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
export function createBody({ model, U, COMMON }) {
  const root = new THREE.Group(); root.name = 'body';
  const own = { uLampDir: { value: new THREE.Vector3(0, 1, 0) }, uLampCol: { value: new THREE.Vector3(0.05, 0.055, 0.065) }, uBodyFwd: { value: new THREE.Vector3(0, 0, 1) },
    uGlow: { value: 0.85 }, uGhost: { value: 0 }, uInk: { value: 0.004 } };
  const ghost = { value: 0 }, headOwn = Object.assign({}, own, { uGhost: ghost });
  const mat = celMaterial(U, COMMON, own), headMat = celMaterial(U, COMMON, headOwn); headMat.customProgramCacheKey = () => 'cel-head';
  const ink = inkMaterial(U, COMMON, own), headInk = inkMaterial(U, COMMON, headOwn);
  const B = {}, joint = {};
  model.updateMatrixWorld(true);
  const meshes = []; model.traverse(o => { if (o.isMesh && o.name in PARENT) meshes.push(o); });
  for (const o of meshes) { joint[o.name] = o.getWorldPosition(new THREE.Vector3()); B[o.name] = new THREE.Group(); B[o.name].name = o.name; }
  for (const o of meshes) {
    const n = o.name, p = PARENT[n], g = B[n], isHead = n === 'head';
    (p ? B[p] : root).add(g); g.position.copy(joint[n]); if (p) g.position.sub(joint[p]);
    const geo = o.geometry;
    const m = new THREE.Mesh(geo, isHead ? headMat : mat); m.castShadow = true; m.receiveShadow = true; g.add(m);
    const im = new THREE.Mesh(hullOf(geo), isHead ? headInk : ink); g.add(im);
  }
  // the gloves get jointed fingers (hands.js)
  const hands = createHands({ B, mat, ink, hullOf });
  let gesture = {}, point = 0, turnKick = 0;
  const rest = {}; for (const n in B) rest[n] = B[n].position.clone();
  const L1 = joint.shin_L.distanceTo(joint.thigh_L), L2 = joint.foot_L.distanceTo(joint.shin_L), ANKLE = joint.foot_L.y;
  const hipRest = { L: joint.thigh_L.clone().sub(joint.pelvis), R: joint.thigh_R.clone().sub(joint.pelvis) };

  // gait state
  const prev = new THREE.Vector3(); let has = false, speed = 0, move = 0, cyc = 0, vf = 1, vr = 0, reachT = -9, bob = 0, enabled = true;
  const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const H = v3(), A = v3(), K = v3(), dir = v3(), pole = v3(), kd = v3(), bx = v3(), by = v3(), bz = v3(), tmp = v3(), aim = v3(), sh = v3();
  const q = new THREE.Quaternion(), qP = new THREE.Quaternion(), qT = new THREE.Quaternion(), qS = new THREE.Quaternion(), qI = new THREE.Quaternion(), M = new THREE.Matrix4(), eul = new THREE.Euler();
  const tune = { crane: 0.2, reach: null, work: null, paneX: 0.2 };
  // working at the wall: the left forearm comes up with its console, the right hand points at the stone the suit is lifting
  let workOn = 0, work = 0; const workAim = v3(), wAim = v3(); let hasAim = false;
  const armLen = { u: joint.armL_L.distanceTo(joint.armU_L), l: joint.hand_L.distanceTo(joint.armL_L) };
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

  function leg(sd, u, duty, travel, lift, pelvisPos) {
    // where this foot should be: planted and sliding back under you through stance, lifted and carried forward through swing
    let along, h, pitch;
    if (u < duty) { const s = u / duty; along = lerp(0.42, -0.58, s) * travel; h = 0; pitch = s < 0.15 ? lerp(-0.18, 0, s / 0.15) : sstep(0.55, 1, s) * 0.62; }
    else { const s = (u - duty) / (1 - duty), e = s * s * (3 - 2 * s); along = lerp(-0.58, 0.42, e) * travel; h = lift * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.8)), 1.2); pitch = lerp(0.62, -0.18, sstep(0.1, 0.9, s)) + 0.35 * Math.sin(Math.PI * s) * Math.min(1, lift * 5); }
    along *= move; h *= move; pitch *= move;
    const sx = sd === 'L' ? 1 : -1, hip = hipRest[sd];
    H.copy(hip).applyQuaternion(qP).add(pelvisPos);
    A.set(sx * 0.1 + vr * along * -1, ANKLE + h + 0.13 * Math.sin(Math.max(pitch, 0)), vf * along);   // model front is +z; the wearer's right is -x
    dir.subVectors(A, H); let D = dir.length(); const Dm = L1 + L2 - 0.004; if (D > Dm) { dir.multiplyScalar(Dm / D); A.addVectors(H, dir); D = Dm; }
    dir.divideScalar(D);
    pole.set(0, 0.25, 1); kd.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
    const ca = (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
    K.copy(H).addScaledVector(dir, L1 * ca).addScaledVector(kd, L1 * sa);
    // thigh: -y down the bone, +z toward the knee side
    by.subVectors(H, K).normalize(); bx.crossVectors(by, kd).normalize(); bz.crossVectors(bx, by);
    qT.setFromRotationMatrix(M.makeBasis(bx, by, bz)); B['thigh_' + sd].quaternion.copy(qI.copy(qP).invert()).multiply(qT);
    by.subVectors(K, A).normalize(); bz.crossVectors(bx, by);
    qS.setFromRotationMatrix(M.makeBasis(bx, by, bz)); B['shin_' + sd].quaternion.copy(qI.copy(qT).invert()).multiply(qS);
    q.setFromEuler(eul.set(pitch, 0, 0)); B['foot_' + sd].quaternion.copy(qI.copy(qS).invert()).multiply(q);
  }

  /** Pose the body under the camera. s = { x, z, yaw, pitch, t }. Returns the eye's bob for this frame. */
  function update(dt, s) {
    // how fast, and which way relative to the body, from where you actually went (hedges and voids included)
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
    let vx = 0, vz = 0;
    if (has && dt > 0) { vx = (s.x - prev.x) / dt; vz = (s.z - prev.z) / dt; if (Math.hypot(s.x - prev.x, s.z - prev.z) > 1.2) vx = vz = 0; }
    prev.set(s.x, 0, s.z); has = true;
    const sp = Math.min(8, Math.hypot(vx, vz)); speed += (sp - speed) * Math.min(1, dt * 9);
    move += ((speed > 0.25 ? 1 : 0) - move) * Math.min(1, dt * (speed > 0.25 ? 9 : 6));
    if (sp > 0.3) { const f = (vx * fx + vz * fz) / sp, r = (vx * fz * -1 + vz * fx) / sp, k = Math.min(1, dt * 10); vf += (f - vf) * k; vr += (r - vr) * k; const n = Math.hypot(vf, vr) || 1; vf /= n; vr /= n; }
    const run = sstep(1.4, 3.4, speed), sprint = sstep(3.6, 6.2, speed);
    const stepLen = 0.5 + 0.19 * speed, duty = lerp(0.6, 0.4, run), travel = Math.min(0.86, duty * 2 * stepLen), lift = lerp(0.06, 0.2, run) + 0.06 * sprint;
    cyc = (cyc + speed * dt / (2 * stepLen)) % 1;
    const psi = 2 * Math.PI * (cyc - duty / 2), two = Math.cos(2 * psi);
    bob = -two * lerp(0.012, 0.024, run) * move;                       // lowest in mid-stance, highest in flight
    const breath = Math.sin(s.t * 1.15) * (1 - 0.6 * move);
    if (!enabled) return bob;

    const down = sstep(0.05, 1.25, -s.pitch), back = EYE.z + tune.crane * down;   // looking down, the head cranes forward over the chest
    root.position.set(s.x - fx * back, s.gy || 0, s.z - fz * back); root.rotation.y = s.yaw + Math.PI;
    own.uBodyFwd.value.set(fx, 0, fz);
    own.uLampDir.value.set(0.5, 0.62, 0.6).normalize().applyAxisAngle(UP, s.yaw + Math.PI);

    // pelvis: bobs with the stride, drops a little at speed, turns against the shoulders
    const pel = B.pelvis; pel.position.copy(rest.pelvis); pel.position.y += bob * 1.2 - 0.022 - 0.04 * run * move - 0.012 * down;
    pel.rotation.set(0.02 * run * move, -0.07 * Math.sin(psi) * move, 0.035 * Math.sin(psi) * move); qP.copy(pel.quaternion);
    leg('L', cyc, duty, travel, lift, pel.position); leg('R', (cyc + 0.5) % 1, duty, travel, lift, pel.position);
    const tor = B.torso; tor.rotation.set(0.03 + 0.05 * run * move + 0.004 * breath + 0.03 * down, 0.13 * Math.sin(psi) * move, -0.035 * Math.sin(psi) * move);
    tor.position.copy(rest.torso); tor.position.y += 0.002 * breath;

    // arms: swing against the legs, elbows folding as the pace rises
    const sw = lerp(0.16, 0.5, run) * move, fold = 0.32 + 0.95 * run * move + 0.012 * breath;
    const g = tune.reach != null ? tune.reach : reachT < 0 ? 0 : (() => { const a = s.t - reachT; return a < 0.14 ? sstep(0, 0.14, a) : a < 0.7 ? 1 : 1 - sstep(0.7, 1.25, a); })();
    for (const sd of ['L', 'R']) {
      const sx = sd === 'L' ? 1 : -1, ph = Math.sin(psi) * sx;
      const up = B['armU_' + sd], lo = B['armL_' + sd], hd = B['hand_' + sd];
      up.position.copy(rest['armU_' + sd]); up.position.y += 0.003 * breath;
      up.rotation.set(-0.1 - sw * ph + 0.1 * run * move, 0, sx * (0.075 + 0.05 * run * move)); lo.rotation.set(-fold - 0.3 * sw * Math.max(ph, 0), 0, -sx * 0.25 * run * move); hd.rotation.set(-0.08, 0, sx * 0.1);
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
    // the hands, last: gestures, springs and their own inertia on top of the arms' pose
    turnKick *= Math.exp(-dt * 5);
    hands.update(dt, s.t || nowT, { move, run, reach: g, reachAge: reachT < 0 ? 9 : s.t - reachT, work, gesture: Object.assign({}, gesture, { turn: turnKick }), point }, root);
    // head: on its neck, nodding with your gaze. You never see it (uGhost), but your shadow has it.
    B.head.rotation.set(-s.pitch * 0.55 - tor.rotation.x * 0.5, 0, 0);
    return bob;
  }

  return {
    root, update,
    get bob() { return bob; },
    reach(t) { reachT = t; },
    /** 'eye' hides the head (you are inside it); 'mirror' shows it, for any view from outside. The shadow pass always has it. */
    pass(p) { ghost.value = p === 'eye' ? 1 : 0; },
    setInk(k) { own.uInk.value = k; },
    setEnabled(v) { enabled = !!v; root.visible = enabled; },
    /** on: working at the wall (console up, right hand out). aim: the world point the right hand points at, or null for where you look. */
    setWork(on, aim) { workOn = on ? 1 : 0; hasAim = !!aim; if (aim) wAim.copy(aim); },
    /** What the hands are doing at the wall: { held, effort, hover, press, placing, ghost }; turn(sign) when the stone in hand is turned; point(0..1) aims a finger. */
    setGesture(g) { gesture = g || {}; }, turn(sign) { turnKick = Math.max(-0.5, Math.min(0.5, turnKick + 0.22 * sign)); }, point(v) { point += (v - point) * 0.2; },
    hands,
    /** The right palm, in world space: where the suit's lifting beam starts. */
    palm(out) { return B.hand_R.localToWorld(out.set(0, -0.09, 0.02)); },
    /** The console's canvas: draw on g (640 x 320), then call done(). wake() brightens it for a moment: call it when what it says has changed. */
    console: { g: cg, w: 640, h: 320, done() { ctex.needsUpdate = true; }, wake() { wakeAt = nowT; } },
    get enabled() { return enabled; },
    uniforms: own, bones: B, tune,
  };
}
