// film.js: the intro. The story so far (STORY.md), told in eight shots before you first walk in, with Brodie telling it:
// Earth and The Event, the fleet, our ship and what its land carries, the navigation lost, the wormhole, the Shred Hole's ship,
// World Builder at half its coordinates, and the crew's task. About a minute and a half; Esc, Enter or "skip" ends it. It plays
// once (the title's "the story so far" plays it again).
//
// Half of it IS the game. Our ship is the real bubble, seen by the game's own space view; the wormhole is the one in the east
// field; the last shot walks in through the light tunnel and climbs out over the garden. For those shots this file only says where
// the camera is (main.js hands it over) and lays a few things into the game's scene (the lights in the ground, what falls through).
// The other half is drawn here, in a scene of its own, through its own bloom and the same tone curve: the Earth (NASA's Blue
// Marble by day, Black Marble by night: real coasts, real cities, which go out), the fleet leaving, the Shred Hole's ship with
// its tower, and World Builder. Every shot then goes through one film grade (a little lens colour, grain, a vignette, and the
// sun's flare), so the two halves sit together.
//
// Brodie's telling was spoken once (tools/narration.json, by the sphere Worker, in his ElevenLabs voice) and is kept in
// assets/film/vo/; it plays through his voice box (voicefx.js). The score is synthesized as it plays.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SPACE_GLSL, CENTRE, BUBBLE, heightAt } from './field.js';
import { bvToRGB } from './astro.js';
import { createVoiceFx, playThrough } from './voicefx.js';

const D2R = Math.PI / 180, KEY = 'gd.film.seen', RATE = 0.93;   // (his clips are played a touch slow: a storyteller's pace)
const ease = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;
const N2 = /* glsl */`
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + vec2(17.0, 5.0); a *= 0.5; } return s; }`;
const N3 = /* glsl */`
float hash3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash3(i), hash3(i+vec3(1,0,0)), f.x), mix(hash3(i+vec3(0,1,0)), hash3(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i+vec3(0,0,1)), hash3(i+vec3(1,0,1)), f.x), mix(hash3(i+vec3(0,1,1)), hash3(i+vec3(1,1,1)), f.x), f.y), f.z); }
float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }`;

// ---------------------------------------------------------------- the script
// Shots: game: true is drawn by the game itself (this file only poses its camera). Lines: [seconds into the shot, clip, its length
// as recorded, the words as they appear: [fraction of the clip at which each caption starts, caption]].
const SHOTS = [
  { id: 'earth', len: 15.5, vo: [[2.6, '01', 1.75, [[0, 'Earth. 2027.']]], [7.3, '02', 1.25, [[0, 'Then came The Event.']]], [11.6, '03', 1.67, [[0, 'Earth became uninhabitable.']]]] },
  { id: 'fleet', len: 9.5, vo: [[1.3, '04', 4.44, [[0, 'A fleet of probes went out,'], [0.36, 'each one looking for a place where life could carry on.']]]] },
  { id: 'ship', len: 13.5, game: true, vo: [[1.3, '05', 0.91, [[0, 'We are one of them.']]], [4.8, '06', 4.86, [[0, 'Our land carries Earth’s blueprint,'], [0.42, 'and a snapshot of everyone alive in 2027.']]]] },
  { id: 'lost', len: 8.5, game: true, vo: [[1.5, '07', 2.87, [[0, 'A few centuries out,'], [0.4, 'our ship lost its navigation.']]]] },
  { id: 'worm', len: 9.5, game: true, vo: [[1.3, '08', 3.34, [[0, 'The wormhole links the ships of the fleet.'], [0.66, 'Things come through it.']]]] },
  { id: 'shred', len: 10.5, vo: [[1.4, '09', 5.15, [[0, 'One ship carries the Shred Hole: a fabricator'], [0.5, 'that lost its Earth blueprint in an accident.']]]] },
  { id: 'world', len: 11.5, vo: [[1.2, '10', 4.02, [[0, 'Before it went dark, another ship found something.'], [0.64, 'It called it World Builder.']]], [7.6, '11', 1.52, [[0, 'We have half the coordinates.']]]] },
  { id: 'home', len: 16.5, game: true, vo: [[1.0, '12', 2.04, [[0, 'So it’s up to us to find our way again.']]], [4.6, '13', 5.04, [[0, 'Until then, we garden.'], [0.27, 'We build the wall.'], [0.5, 'And whatever else suits our fancy, brody.']]]] },
];
const CAPS = [], CLIPS = [];
{ let t = 0; for (const s of SHOTS) { s.t0 = t; t += s.len; s.t1 = t;
    for (const [at, id, dur, segs] of s.vo) { const D = dur / RATE, T0 = s.t0 + at; CLIPS.push({ at: T0, id });
      segs.forEach(([f, text], i) => CAPS.push({ a: T0 + f * D - 0.1, b: T0 + (i + 1 < segs.length ? segs[i + 1][0] * D - 0.12 : D + 0.9), text })); } } }
export const FILM_LENGTH = SHOTS[SHOTS.length - 1].t1;
const at = id => SHOTS.find(s => s.id === id).t0;

/** o: { renderer, cat (the star catalogue), audio(): { ctx, on }, robot(): how much machine in Brodie's voice, isTouch,
 *       game: { scene, hole(): where the wormhole hangs (a Vector3) } } */
export function createFilm(o) {
  const { renderer } = o, G = o.game || {};
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(38, 1, 0.05, 20000); scene.background = new THREE.Color(0x000000);
  cam.userData = { axis: new THREE.Vector3(0, 0, 1), right: new THREE.Vector3(1, 0, 0) };
  const T = { value: 0 }, SUN = new THREE.Vector3(0.2, -0.22, -0.95).normalize(), HEAD = new THREE.Vector3(-0.42, 0.52, -0.74).normalize();
  const uSun = { value: SUN }, uHead = { value: HEAD }, uPR = { value: 1 };
  const sunL = new THREE.DirectionalLight(0xfff0dc, 3.2), hemi = new THREE.HemisphereLight(0x8fa3c8, 0x2a1c12, 0.35); scene.add(sunL, hemi);

  // ---------------------------------------------------------------- deep space: the nebula the game flies toward, the Milky Way, the catalogue's stars, the sun
  const skyU = { uTime: T, uHead, uNeb: { value: 0 }, uMilky: { value: 1 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 32), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false, uniforms: skyU,
    vertexShader: `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime, uNeb, uMilky; varying vec3 vD;${N2}${SPACE_GLSL}
      void main(){ vec3 d = normalize(vD); vec3 c = spaceAt(d, uTime) * uNeb * 2.4;
        vec3 gn = normalize(vec3(0.45, 0.8, 0.4)); float b = exp(-pow(dot(d, gn) * 4.2, 2.0)), m = sfbm(d * 6.0 + 3.0), dk = smoothstep(0.35, 0.6, sfbm(d * 11.0 + 8.0));
        c += mix(vec3(0.5, 0.56, 0.8), vec3(0.85, 0.7, 0.55), m) * b * (0.2 + 0.8 * m) * m * (1.0 - 0.6 * dk * b) * 0.035 * uMilky;
        gl_FragColor = vec4(c, 1.0); }` }));
  sky.renderOrder = -30; sky.frustumCulled = false; scene.add(sky);
  const starU = { uGain: { value: 1 }, uPR, uTime: T };
  const stars = new THREE.Group(); scene.add(stars);
  { const cat = o.cat || [], n = cat.length / 4, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), mag = new Float32Array(n);
    for (let i = 0; i < n; i++) { const ra = cat[i * 4] * D2R, dec = cat[i * 4 + 1] * D2R, c = bvToRGB(cat[i * 4 + 3]); pos.set([Math.cos(dec) * Math.cos(ra) * 8000, Math.sin(dec) * 8000, -Math.cos(dec) * Math.sin(ra) * 8000], i * 3); col.set(c, i * 3); mag[i] = cat[i * 4 + 2]; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aColor', new THREE.BufferAttribute(col, 3)); g.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: starU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uGain, uPR, uTime; attribute vec3 aColor; attribute float aMag; varying vec3 vC;
        void main(){ float flux = pow(10.0, -0.4 * (aMag - 1.0)), tw = 1.0 + 0.1 * sin(uTime * (3.0 + fract(aMag * 7.31) * 5.0) + aMag * 40.0);
          vC = aColor * min(pow(flux, 0.6), 2.6) * 1.7 * uGain * tw; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = (1.3 + 2.2 * clamp((4.5 - aMag) / 5.0, 0.0, 1.5)) * uPR; }`,
      fragmentShader: `varying vec3 vC; void main(){ vec2 q = gl_PointCoord * 2.0 - 1.0; float r2 = dot(q, q); if (r2 > 1.0) discard; gl_FragColor = vec4(vC * exp(-r2 * 3.4), 1.0); }` }));
    pts.frustumCulled = false; pts.renderOrder = -20; stars.add(pts); }
  const radial = stops => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64); for (const [k, v] of stops) r.addColorStop(k, v); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); };
  const disc = radial([[0, '#fff'], [0.3, '#fff'], [0.42, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]), soft = radial([[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,.5)'], [0.5, 'rgba(255,255,255,.12)'], [1, 'rgba(255,255,255,0)']]);
  const sunS = new THREE.Sprite(new THREE.SpriteMaterial({ map: disc, color: new THREE.Color(16, 14, 11), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); sunS.scale.setScalar(150); scene.add(sunS);
  // dust going by: the way the game's space view shows the ship is moving
  const dustU = { uTime: T, uHead, uGain: { value: 0 }, uSpeed: { value: 1 } };
  { const NS = 1800, pos = new Float32Array(NS * 6), seed = new Float32Array(NS * 8), end = new Float32Array(NS * 2);
    for (let i = 0; i < NS; i++) { const s = [Math.random(), Math.random(), Math.random(), Math.random()]; for (let k = 0; k < 2; k++) { seed.set(s, (i * 2 + k) * 4); end[i * 2 + k] = k; } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4)); g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    const m = new THREE.LineSegments(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: dustU,
      vertexShader: `attribute vec4 aSeed; attribute float aEnd; uniform float uTime, uGain, uSpeed; uniform vec3 uHead; varying vec3 vCol;
        void main(){ const float B = 260.0; vec3 ax = normalize(cross(uHead, vec3(0.0, 1.0, 0.0))), ay = cross(ax, uHead);
          float v = (10.0 + 30.0 * aSeed.w * aSeed.w) * uSpeed, along = B * 0.5 - mod(aSeed.z * B + uTime * v, B);
          vec3 rel = ax * (aSeed.x - 0.5) * B + ay * (aSeed.y - 0.5) * B + uHead * (along + aEnd * v * 0.2);
          float clear = smoothstep(11.0, 16.0, length(rel)), fade = smoothstep(B * 0.5, B * 0.34, abs(along));
          vCol = mix(vec3(1.0, 0.72, 0.42), vec3(0.72, 0.84, 1.0), fract(aSeed.x * 91.7)) * (0.25 + 0.75 * fract(aSeed.y * 57.3)) * clear * fade * (1.0 - 0.75 * aEnd) * uGain;
          gl_Position = projectionMatrix * viewMatrix * vec4(rel, 1.0); }`,
      fragmentShader: `varying vec3 vCol; void main(){ gl_FragColor = vec4(vCol, 1.0); }` }));
    m.frustumCulled = false; m.renderOrder = 6; scene.add(m); }

  // ---------------------------------------------------------------- Earth: the Blue Marble, the Black Marble, clouds of its own, an atmosphere; and after
  let loaded = 0, wantTex = false;
  const tex = name => { const t = new THREE.TextureLoader().load(new URL(`../assets/film/${name}`, import.meta.url).href, () => { loaded++; }); t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping; return t; };
  const earthU = { tDay: { value: null }, tNight: { value: null }, tWater: { value: null }, uSun, uTime: T, uOut: { value: 0 }, uDead: { value: 0 }, uOrigin: { value: new THREE.Vector3(0, 0, 1) } };
  const earth = new THREE.Group(); scene.add(earth);
  earth.add(new THREE.Mesh(new THREE.SphereGeometry(10, 192, 128), new THREE.ShaderMaterial({ uniforms: earthU,
    vertexShader: `varying vec3 vN, vO, vW; varying vec2 vUv; void main(){ vUv = uv; vO = normalize(position); vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform sampler2D tDay, tNight, tWater; uniform vec3 uSun, uOrigin; uniform float uTime, uOut, uDead; varying vec3 vN, vO, vW; varying vec2 vUv;${N3}
      void main(){
        vec3 N = normalize(vN), V = normalize(cameraPosition - vW), p = vO; float nl = dot(N, uSun), day = smoothstep(-0.08, 0.32, nl), nv = max(dot(N, V), 0.0);
        vec3 alb = pow(texture2D(tDay, vUv).rgb, vec3(2.2)); float water = texture2D(tWater, vUv).r;
        // the weather: its own, drifting; after The Event it closes over and turns the colour of ash
        vec3 wp = p * 2.6 + vec3(uTime * 0.006, 0.0, uTime * 0.004); wp += 0.35 * vec3(fbm3(p * 4.0 + 3.0), fbm3(p * 4.0 + 9.0), fbm3(p * 4.0 + 17.0));
        float cn = fbm3(wp) * 0.75 + fbm3(wp * 3.1) * 0.25, cl = smoothstep(0.50 - 0.2 * uDead, 0.70 - 0.16 * uDead, cn + 0.06 * (1.0 - abs(p.y)));
        float lum = dot(alb, vec3(0.3, 0.6, 0.1)); vec3 dead = mix(vec3(lum) * vec3(0.9, 0.72, 0.55), vec3(0.075, 0.055, 0.04), 0.45 + 0.4 * water);
        alb = mix(alb, dead, uDead);
        vec3 sunC = mix(vec3(1.0, 0.45, 0.2), vec3(1.0, 0.97, 0.92), smoothstep(0.0, 0.4, nl)) * 2.6;
        vec3 col = alb * day * sunC;
        col += sunC * pow(max(dot(reflect(-uSun, N), V), 0.0), 60.0) * water * (1.0 - cl) * 0.5 * (1.0 - uDead) * day;      // the sun on the sea
        vec3 cloudC = mix(vec3(0.92, 0.94, 0.97), vec3(0.2, 0.15, 0.11), uDead);
        col = mix(col, cloudC * day * sunC * (0.55 + 0.45 * cn), cl * (0.9 - 0.15 * uDead));
        // the cities, on the night side. The Event crosses the world from one place: ahead of its front they surge, behind it they are out
        float ang = acos(clamp(dot(p, uOrigin), -1.0, 1.0)) / 3.14159, front = uOut * 1.12, wob = 0.03 * (fbm3(p * 7.0) - 0.5);
        float on = smoothstep(front - 0.012, front + 0.004, ang + wob), band = exp(-pow((ang + wob - front) / 0.03, 2.0)) * step(0.001, uOut) * step(uOut, 0.999);
        vec3 lights = pow(texture2D(tNight, vUv).rgb, vec3(2.2)); float lit = max(lights.r, max(lights.g, lights.b));
        float city = smoothstep(0.012, 0.14, max(lights.r, lights.g));                                   // (the Black Marble's seas and land are a dim blue: by moonlight)
        col += lights * 1.3 * (1.0 - day) * (1.0 - 0.6 * uDead) + lights * vec3(1.0, 0.78, 0.48) * city * (1.0 - day) * (1.0 - cl * 0.75) * on * (9.0 + 30.0 * band);
        col += vec3(0.55, 0.75, 1.0) * band * (1.0 - day) * (0.02 + 0.5 * lit);
        // the air, seen through its own depth at the limb
        vec3 air = mix(vec3(0.16, 0.42, 1.0), vec3(0.5, 0.3, 0.16), uDead);
        col += air * pow(1.0 - nv, 3.0) * (0.03 + 1.3 * day) + air * 0.012 * day;
        gl_FragColor = vec4(col, 1.0);
      }` })));
  earth.add(new THREE.Mesh(new THREE.SphereGeometry(10.6, 96, 64), new THREE.ShaderMaterial({ uniforms: earthU, transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vN, vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uSun; uniform float uDead; varying vec3 vN, vW; void main(){ vec3 N = normalize(vN), V = normalize(cameraPosition - vW); float f = pow(clamp(dot(-N, V) / 0.33, 0.0, 1.0), 2.4), nl = dot(N, uSun);
      float lit = smoothstep(-0.42, 0.12, nl), fwd = pow(max(dot(-V, uSun), 0.0), 6.0);           // lit by the sun; brightest looking toward it through the air (a sunrise from orbit)
      vec3 blue = mix(vec3(0.2, 0.5, 1.0), vec3(0.55, 0.33, 0.16), uDead), rose = vec3(1.0, 0.42, 0.16);
      gl_FragColor = vec4(mix(rose, blue, smoothstep(-0.25, 0.25, nl)) * f * lit * (0.45 + 2.0 * fwd), 1.0); }` })));

  // ---------------------------------------------------------------- ships: a soap film round a piece of torn-off ground (as the game's own, simply)
  const shellMat = (gain = 1) => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: T, uSunDir: uSun, uHead, uGain: { value: gain } },
    vertexShader: `attribute float aShip; varying vec3 vW, vN, vO; varying float vSeed;
      void main(){ mat4 m = modelMatrix; vSeed = aShip;
        #ifdef USE_INSTANCING
          m = modelMatrix * instanceMatrix;
        #endif
        vO = position; vec4 w = m * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(m) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime, uGain; uniform vec3 uSunDir, uHead; varying vec3 vW, vN, vO; varying float vSeed;${N2}
      void main(){ vec3 N = normalize(vN), V = normalize(cameraPosition - vW); float nv = clamp(dot(N, V), 0.0, 1.0);
        vec3 q = vO * 2.03 + vSeed * 17.0; float th = fbm(q.xz + q.y * 0.7 + vec2(uTime * 0.012, 0.0)) * 1.3 + fbm(q.zy * 2.1 - uTime * 0.02) * 0.5 + vO.y * 0.45;
        vec3 irid = 0.5 + 0.5 * cos(6.2832 * (th * 2.0 + vec3(0.0, 0.33, 0.67)));
        vec3 c = irid * (pow(1.0 - nv, 3.0) * 0.5 + 0.018) * (0.5 + 0.5 * fbm(q.xy * 3.0 + uTime * 0.03));
        c += vec3(0.62, 0.8, 1.0) * pow(1.0 - nv, 5.0) * 0.85;
        c += vec3(1.0, 0.94, 0.82) * 4.0 * pow(max(dot(reflect(-uSunDir, N), V), 0.0), 320.0);
        float lead = max(dot(N, uHead), 0.0);
        c += vec3(1.0, 0.6, 0.24) * (pow(lead, 3.0) * 0.07 + pow(max(dot(reflect(-uHead, N), V), 0.0), 22.0) * 0.22);
        gl_FragColor = vec4(c * uGain, 1.0); }` });
  // the ground: a field on top (or bare rock), a cliff of soil under its edge, then bedded rock narrowing in fins to a keel
  function landGeo(seed = 1) {
    let a = seed * 9301 + 49297; const rnd = () => { a = (a * 9301 + 49297) % 233280; return a / 233280; }; const ph = [rnd() * 6, rnd() * 6, rnd() * 6];
    const NT = 96, NR = 22, pos = [], top = [], idx = [];
    const edge = t => 0.92 * (1 + 0.035 * Math.sin(3 * t + ph[0]) + 0.02 * Math.sin(7 * t + ph[1]));
    for (let i = 0; i < NT; i++) { const t = i / NT * 6.2832, c = Math.cos(t), s = Math.sin(t), E = edge(t);
      for (let k = 0; k <= 5; k++) { const r = E * k / 5; pos.push(c * r, -0.035 + 0.012 * Math.sin(r * 9 + t * 2 + ph[2]) * (k / 5), s * r); top.push(1); }       // the top, centre to brink
      const fin = Math.pow(1 - Math.abs(Math.sin(2.5 * t + ph[0])), 2.2) + 0.5 * Math.pow(1 - Math.abs(Math.sin(5.5 * t + ph[1])), 3);
      for (let k = 1; k <= NR - 6; k++) { const f = k / (NR - 6), d = f * (0.5 + 0.12 * Math.sin(2 * t + ph[2])) + 0.12 * f * f;
        let rho = (1 - Math.pow(f, 1.25)) * (1 - 0.1 * ease(f * 3) + 0.5 * fin * ease(f * 2.5)) + 0.09 * fin * ease((f - 0.3) * 2) * (1 - f);
        rho += 0.06 * Math.sin(t * 13 + f * 17 + ph[1]) * (1 - f) * Math.min(1, f * 6); const r = Math.max(0, rho) * E;
        pos.push(c * r + 0.1 * Math.pow(f, 1.5), -0.04 - d, s * r - 0.07 * Math.pow(f, 1.5)); top.push(0); } }
    const ix = (i, k) => ((i + NT) % NT) * NR + k;
    for (let i = 0; i < NT; i++) for (let k = 0; k < NR - 1; k++) idx.push(ix(i, k), ix(i, k + 1), ix(i + 1, k), ix(i + 1, k), ix(i, k + 1), ix(i + 1, k + 1));
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aTop', new THREE.Float32BufferAttribute(top, 1)); g.setIndex(idx); g.computeBoundingSphere(); return g;
  }
  const landMat = bare => new THREE.ShaderMaterial({ side: THREE.DoubleSide, uniforms: { uSunDir: uSun, uHead, uBare: { value: bare ? 1 : 0 }, uTime: T },
    vertexShader: `attribute float aTop; varying vec3 vW, vO; varying float vTop;
      void main(){ mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
          m = modelMatrix * instanceMatrix;
        #endif
        vO = position; vTop = aTop; vec4 w = m * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uSunDir, uHead; uniform float uBare, uTime; varying vec3 vW, vO; varying float vTop;${N2}
      void main(){ vec3 V = normalize(cameraPosition - vW), N = normalize(cross(dFdx(vW), dFdy(vW))); if (dot(N, V) < 0.0) N = -N;
        float az = atan(vO.z, vO.x), d = -vO.y - 0.035, n = fbm(vec2(az * 12.0, vO.y * 30.0)), n2 = fbm(vec2(az * 40.0, vO.y * 90.0) + 9.0), rr = length(vO.xz);
        vec3 rock = mix(vec3(0.10, 0.09, 0.085), vec3(0.22, 0.19, 0.16), n2); rock *= 0.7 + 0.45 * smoothstep(0.35, 0.65, 0.5 + 0.5 * sin(vO.y * 95.0 + n * 5.0 + az * 3.0));
        vec3 side = mix(mix(vec3(0.05, 0.034, 0.02), vec3(0.15, 0.095, 0.05), smoothstep(0.004, 0.02, d)), rock, smoothstep(0.025, 0.07, d + (n - 0.5) * 0.03));
        float g = fbm(vO.xz * 9.0 + 3.0); vec3 field = mix(vec3(0.045, 0.11, 0.03), vec3(0.11, 0.17, 0.05), g); field = mix(field, vec3(0.02, 0.06, 0.02), smoothstep(0.55, 0.7, fbm(vO.xz * 4.0 + 20.0)));   // meadow, and wood
        vec3 slab = mix(vec3(0.022, 0.021, 0.02), vec3(0.075, 0.066, 0.058), fbm(vO.xz * 22.0) * (0.4 + 0.6 * fbm(vO.xz * 5.0 + 40.0))) * (1.0 - 0.6 * smoothstep(0.42, 0.1, rr) * (0.5 + 0.5 * g));                                                  // bare, and scorched toward the middle
        vec3 col = mix(side, mix(field, slab, uBare), vTop);
        float nl = max(dot(N, uSunDir), 0.0), nh = max(dot(N, uHead), 0.0);
        vec3 c = col * (nl * vec3(1.0, 0.95, 0.86) * 2.6 + nh * vec3(1.0, 0.6, 0.3) * 0.5 + vec3(0.05, 0.06, 0.09));
        // a garden at night in the middle of it: its lights
        float lamp = step(0.72, hash(floor(vO.xz * 46.0))) * smoothstep(0.3, 0.05, abs(rr - 0.2) - 0.1 * g) * vTop * (1.0 - uBare);
        c += vec3(1.0, 0.72, 0.4) * lamp * 5.0 + vec3(1.0, 0.6, 0.3) * exp(-rr * rr * 18.0) * 0.12 * vTop * (1.0 - uBare);
        gl_FragColor = vec4(c, 1.0); }` });
  // the fleet: eighty of them
  const NF = 80, fleet = new THREE.Group(); scene.add(fleet);
  const fShell = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 48, 32), shellMat(1.15), NF), fLand = new THREE.InstancedMesh(landGeo(3), landMat(false), NF);
  fShell.geometry.setAttribute('aShip', new THREE.InstancedBufferAttribute(Float32Array.from({ length: NF }, () => Math.random()), 1));
  fShell.frustumCulled = fLand.frustumCulled = false; fShell.renderOrder = 5; fleet.add(fLand, fShell);
  const fleetP = []; { let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < NF; i++) fleetP.push({ a: rnd() * 6.2832, e: (rnd() - 0.5) * 1.5, t0: rnd() * 5.5 - 2.2, v: 0.75 + rnd() * 0.9, R: 0.3 + 0.25 * rnd(), spin: rnd() * 6.28, side: (rnd() - 0.5) * 2, up: (rnd() - 0.5) * 2 }); }
  // the Shred Hole's ship: bare ground, and the tower in the middle of it
  const shred = new THREE.Group(); scene.add(shred);
  { const land = new THREE.Mesh(landGeo(11), landMat(true)); land.scale.setScalar(10); shred.add(land);
    const sh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), shellMat(0.8)); sh.scale.setScalar(10); sh.renderOrder = 5; shred.add(sh);
    const tw = new THREE.Group(); tw.position.y = -0.34; shred.add(tw); const H = 4.1, Rt = 0.62;
    const steel = new THREE.MeshStandardMaterial({ color: 0x8a9098, metalness: 0.85, roughness: 0.42 }), yellow = new THREE.MeshStandardMaterial({ color: 0xf2b705, metalness: 0.3, roughness: 0.5, emissive: 0x2a1c00 }), dark = new THREE.MeshStandardMaterial({ color: 0x17181b, metalness: 0.6, roughness: 0.6 });
    const pad = (() => { const c = document.createElement('canvas'); c.width = c.height = 1024; const g = c.getContext('2d'); g.fillStyle = '#1b1c1f'; g.fillRect(0, 0, 1024, 1024);
      for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.05})`; g.fillRect(Math.random() * 1024, Math.random() * 1024, 2 + Math.random() * 30, 1 + Math.random() * 3); }
      g.translate(512, 512); for (let i = 0; i < 72; i++) { g.save(); g.rotate(i / 72 * 6.2832); g.fillStyle = i % 2 ? '#f2b705' : '#111'; g.beginPath(); g.moveTo(398, -19); g.lineTo(452, -3); g.lineTo(452, 19); g.lineTo(398, 3); g.fill(); g.restore(); }
      g.strokeStyle = 'rgba(242,183,5,.8)'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 200, 0, 6.3); g.stroke(); g.fillStyle = 'rgba(242,183,5,.75)'; g.font = '700 58px "IBM Plex Mono", monospace'; g.textAlign = 'center';
      const word = 'EVERYTHING MUST GO  ·  SHRED HOLE  ·  '; for (let i = 0; i < word.length; i++) { g.save(); g.rotate(i / word.length * 6.2832); g.fillText(word[i], 0, -292); g.restore(); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; })();
    const floor = new THREE.Mesh(new THREE.CircleGeometry(3.3, 64), new THREE.MeshStandardMaterial({ map: pad, metalness: 0.2, roughness: 0.75 })); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.012; tw.add(floor);
    for (let k = 0; k < 8; k++) { const col = new THREE.Mesh(new THREE.BoxGeometry(0.07, H, 0.07), yellow), a = k / 8 * 6.2832; col.position.set(Math.cos(a) * (Rt + 0.07), H / 2, Math.sin(a) * (Rt + 0.07)); tw.add(col); }
    for (let k = 0; k <= 6; k++) { const hoop = new THREE.Mesh(new THREE.TorusGeometry(Rt + 0.07, k === 0 || k === 6 ? 0.06 : 0.028, 8, 64), k === 0 || k === 6 ? dark : yellow); hoop.rotation.x = Math.PI / 2; hoop.position.y = 0.25 + k * (H - 0.3) / 6; tw.add(hoop); }
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(Rt, Rt, H, 64, 1, true), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uTime: T },
      vertexShader: `varying vec3 vN, vW; varying vec2 vU; void main(){ vU = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uTime; varying vec3 vN, vW; varying vec2 vU; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(cameraPosition - vW))), 2.2);
        float up = pow(1.0 - vU.y, 2.0), swirl = 0.5 + 0.5 * sin(vU.x * 50.0 + vU.y * 22.0 - uTime * 5.0);           // lit from the portal below; the air in it turning
        gl_FragColor = vec4(vec3(0.5, 0.75, 1.0) * f * 0.35 + vec3(0.62, 0.25, 1.0) * up * (0.5 + 0.5 * swirl) * 0.3, 1.0); }` })); glass.position.y = H / 2 + 0.05; tw.add(glass);
    const fan = new THREE.Group(); fan.position.y = 0.42; tw.add(fan); for (let k = 0; k < 5; k++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(Rt * 0.92, 0.02, 0.2), steel); bl.position.x = Rt * 0.48; bl.rotation.x = 0.5; const arm = new THREE.Group(); arm.rotation.y = k / 5 * 6.2832; arm.add(bl); fan.add(arm); }
    fan.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 20), dark)); shred.userData.fan = fan;
    const portal = new THREE.Mesh(new THREE.CircleGeometry(Rt * 0.98, 48), new THREE.ShaderMaterial({ uniforms: { uTime: T }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying vec2 vU; void main(){ vU = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTime; varying vec2 vU; void main(){ float r = length(vU), a = atan(vU.y, vU.x), sw = 0.5 + 0.5 * sin(a * 3.0 + 8.0 * log(r + 0.06) - uTime * 3.5);
        gl_FragColor = vec4((mix(vec3(0.35, 0.1, 0.9), vec3(0.75, 0.5, 1.0), sw) * (0.4 + sw) + vec3(1.0) * exp(-r * r * 14.0)) * smoothstep(1.0, 0.7, r) * 1.5, 1.0); }` })); portal.rotation.x = -Math.PI / 2; portal.position.y = 0.16; tw.add(portal);
    const pl = new THREE.PointLight(0x9a4dff, 8, 9, 1.6); pl.position.y = 0.5; tw.add(pl); shred.userData.pl = pl; shred.userData.beacons = [];
    for (let k = 0; k < 4; k++) { const a = k / 4 * 6.2832 + 0.4, b = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.2, 0.15), toneMapped: false })); b.position.set(Math.cos(a) * (Rt + 0.07), H + 0.14, Math.sin(a) * (Rt + 0.07)); tw.add(b); shred.userData.beacons.push(b); }
    for (let k = 0; k < 3; k++) { const a = k / 3 * 6.2832 + 1.0, lamp = new THREE.SpotLight(0xfff1d0, 16, 9, 0.5, 0.6, 1.4); lamp.position.set(Math.cos(a) * 2.9, 1.5, Math.sin(a) * 2.9); lamp.target.position.set(0, 1.4, 0); tw.add(lamp, lamp.target);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 1.5, 6), dark); post.position.set(Math.cos(a) * 2.9, 0.75, Math.sin(a) * 2.9); tw.add(post);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.7, 2), toneMapped: false })); head.position.copy(lamp.position); tw.add(head); }
    // what is being fed to it, going down the tube; and what comes off the blades
    const ND = 46, deb = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1 }), ND), cols = [0xff5a00, 0xe0262b, 0xf6f6f2, 0x3a7bd5, 0xf2c94c, 0x8a8f94, 0x6fa04a, 0x8a4b2a];
    for (let i = 0; i < ND; i++) deb.setColorAt(i, new THREE.Color(cols[i % cols.length])); deb.instanceColor.needsUpdate = true; deb.frustumCulled = false; tw.add(deb);
    shred.userData.deb = deb; shred.userData.debP = Array.from({ length: ND }, () => ({ ph: Math.random(), a: Math.random() * 6.28, r: 0.1 + Math.random() * 0.38, s: 0.05 + Math.random() * 0.11, w: 1 + Math.random() * 2, ax: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize() })); shred.userData.H = H;
    const n = 500, sd = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) sd[i] = Math.random(); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('aS', new THREE.BufferAttribute(sd, 3));
    const sparks = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: { uTime: T, uPR }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uTime, uPR; attribute vec3 aS; varying float vA; void main(){ float life = fract(uTime * (0.7 + aS.x * 0.9) + aS.y), a = aS.z * 6.2832 + uTime * 2.0, sp = 0.25 + 0.5 * aS.x;
        vec3 p = vec3(cos(a) * (0.5 - sp * life * 0.4), 0.45 + life * (0.5 + 1.6 * aS.y) - life * life * 0.9, sin(a) * (0.5 - sp * life * 0.4)); vA = (1.0 - life) * (1.0 - life);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uPR * (1.0 + 2.0 * aS.x) * clamp(9.0 / -mv.z, 0.6, 3.0); }`,
      fragmentShader: `varying float vA; void main(){ vec2 q = gl_PointCoord * 2.0 - 1.0; if (dot(q, q) > 1.0) discard; gl_FragColor = vec4(mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.9, 0.6), vA) * vA * 1.6, 1.0); }` })); sparks.frustumCulled = false; tw.add(sparks); }

  // ---------------------------------------------------------------- World Builder: something turning, a long way off
  const world = new THREE.Group(); scene.add(world); const vortU = { uTime: T, uPR, uOn: { value: 1 } };
  { const n = 46000, pos = new Float32Array(n * 3), sd = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { const r = Math.pow(Math.random(), 1.7), arm = Math.floor(Math.random() * 2); sd.set([r, arm * Math.PI + (Math.random() - 0.5) * (0.5 + 2.2 * Math.random() * Math.random()), (Math.random() - 0.5) * 2, Math.random()], i * 4); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aS', new THREE.BufferAttribute(sd, 4));
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: vortU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uTime, uPR, uOn; attribute vec4 aS; varying vec3 vC;
        void main(){ float r = 0.045 + aS.x, th = aS.y + 4.2 * log(r + 0.05) + uTime * 0.04 / pow(r + 0.05, 1.5), h = aS.z * 0.035 * (0.3 + r) / (0.25 + r * 2.0);
          vec3 p = vec3(cos(th) * r, h, sin(th) * r) * 100.0;
          vec3 hot = vec3(1.0, 0.9, 0.75), mid = vec3(0.2, 0.85, 0.8), far = vec3(0.5, 0.22, 0.85);
          vC = mix(mix(hot, mid, smoothstep(0.05, 0.4, r)), far, smoothstep(0.35, 1.0, r)) * (0.035 + 0.13 * aS.w) * smoothstep(1.05, 0.7, r) * (1.0 + 2.0 * exp(-r * 9.0)) * uOn;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uPR * (1.0 + 1.5 * aS.w * aS.w) * clamp(300.0 / -mv.z, 0.5, 2.0); }`,
      fragmentShader: `varying vec3 vC; void main(){ vec2 q = gl_PointCoord * 2.0 - 1.0; float r2 = dot(q, q); if (r2 > 1.0) discard; gl_FragColor = vec4(vC * exp(-r2 * 2.6), 1.0); }` }));
    pts.frustumCulled = false; world.add(pts);
    const sp = (col, s) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); m.scale.setScalar(s); world.add(m); return m; };
    world.userData.glows = [sp(new THREE.Color(0.05, 0.085, 0.11), 120), sp(new THREE.Color(2.2, 1.9, 1.6), 12)];
    world.add(new THREE.Mesh(new THREE.SphereGeometry(2.1, 24, 16), new THREE.MeshBasicMaterial({ color: 0x000000 })));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.0, 0.14, 8, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.5, 1.8), toneMapped: false })); ring.rotation.x = Math.PI / 2; world.add(ring);
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 5, 150, 24, 1, true), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uTime: T },
      vertexShader: `varying vec2 vU; varying vec3 vN, vW; void main(){ vU = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uTime; varying vec2 vU; varying vec3 vN, vW; void main(){ float k = abs(vU.y - 0.5) * 2.0, f = pow(abs(dot(normalize(vN), normalize(cameraPosition - vW))), 1.5);
        gl_FragColor = vec4(vec3(0.5, 0.8, 1.0) * f * pow(1.0 - k, 2.0) * (0.6 + 0.4 * sin(k * 40.0 - uTime * 6.0)) * 0.5, 1.0); }` })); world.add(jet);
    world.rotation.set(1.05, 0, 0.42); }

  // ---------------------------------------------------------------- what the film lays into the game's own scene
  const extra = new THREE.Group(); extra.name = 'film'; extra.visible = false; if (G.scene) G.scene.add(extra);
  const seedU = { uOn: { value: 0 }, uTime: T, uPR };
  const seeds = (() => {   // what the land carries: the blueprint and the snapshot, as lights in the torn ground under the garden
    const n = 5200, pos = new Float32Array(n * 3), sd = new Float32Array(n);
    for (let i = 0; i < n; i++) { const f = Math.pow(Math.random(), 0.8) * 0.86, a = Math.random() * 6.2832, r = Math.sqrt(Math.random()) * 96 * (1 - Math.pow(f, 1.25)) * 0.92;
      pos.set([CENTRE.x + 13 * Math.pow(f, 1.5) + Math.cos(a) * r, -3 - f * 62, CENTRE.z - 9 * Math.pow(f, 1.5) + Math.sin(a) * r], i * 3); sd[i] = Math.random(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: seedU, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: `uniform float uOn, uTime, uPR; attribute float aSeed; varying float vA; void main(){ float wave = smoothstep(0.0, 0.2, uOn * 1.3 - (-position.y / 66.0) * 0.9 - aSeed * 0.12);
        vA = wave * (0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (1.2 + aSeed * 2.5) + aSeed * 60.0), 2.0)) * uOn; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = (1.3 + 2.2 * aSeed * aSeed) * uPR * clamp(260.0 / -mv.z, 0.6, 2.4); }`,
      fragmentShader: `varying float vA; void main(){ vec2 q = gl_PointCoord * 2.0 - 1.0; float r2 = dot(q, q); if (r2 > 1.0) discard; gl_FragColor = vec4(mix(vec3(0.4, 1.0, 0.7), vec3(1.0, 0.85, 0.55), step(0.8, vA)) * vA * exp(-r2 * 2.4) * 1.6, 1.0); }` }));
    pts.frustumCulled = false; pts.renderOrder = 9; extra.add(pts); return pts; })();
  const things = []; { const cols = [0xff5a00, 0xe0262b, 0xf6f6f2, 0x3a7bd5, 0xf2c94c, 0x8a8f94, 0x6fa04a, 0xc9a26b, 0x2b2b2b];
    for (let i = 0; i < 9; i++) { const s = 0.35 + Math.random() * 0.5, geo = i % 3 === 0 ? new THREE.ConeGeometry(s * 0.5, s * 1.5, 10) : i % 3 === 1 ? new THREE.BoxGeometry(s, s * (0.4 + Math.random()), s * (0.5 + Math.random())) : new THREE.CylinderGeometry(s * 0.4, s * 0.4, s * 1.2, 12);
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: cols[i], emissive: new THREE.Color(cols[i]).multiplyScalar(0.18) })); m.userData = { t0: 2.6 + i * 0.62 + Math.random() * 0.25, ax: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), dx: -1.5 - Math.random() * 5, dz: (Math.random() - 0.5) * 5, w: 1.5 + Math.random() * 3 }; m.visible = false; extra.add(m); things.push(m); } }

  // ---------------------------------------------------------------- the film's own way to the screen: bloom, the game's tone curve, the grade
  const gradeShader = { uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAmt: { value: 1 }, uAspect: { value: 1.78 }, uSun: { value: new THREE.Vector3(0.5, 0.5, 0) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uAmt, uAspect; uniform vec3 uSun; varying vec2 vUv;
      float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      void main(){ vec2 c = vUv - 0.5; vec2 cs = c * vec2(min(uAspect / 1.78, 1.0), 1.0); float r2 = dot(cs, cs);
        vec2 off = c * r2 * 0.018 * uAmt;                                                             // the lens: colours part company toward the corners
        vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
        if (uSun.z > 0.001) { vec2 d = vUv - uSun.xy; d.x *= uAspect; float l = length(d);            // the sun in the glass: a streak, a halo, ghosts across the middle
          col += vec3(0.5, 0.7, 1.0) * exp(-abs(d.y) * 70.0) * exp(-abs(d.x) * 1.8) * 0.55 * uSun.z + vec3(1.0, 0.9, 0.75) * (exp(-l * 9.0) * 0.4 + exp(-l * 2.6) * 0.07) * uSun.z;
          vec2 ax = vec2(0.5) - uSun.xy;
          for (int i = 1; i <= 4; i++) { float k = float(i) * 0.42 + 0.25; vec2 g = vUv - (uSun.xy + ax * k * 2.0); g.x *= uAspect; float rad = 0.018 + 0.016 * float(i), gl = length(g);
            col += mix(vec3(0.3, 0.8, 0.6), vec3(0.8, 0.4, 1.0), float(i) / 4.0) * smoothstep(rad, rad * 0.75, gl) * (0.4 + 0.6 * smoothstep(rad * 0.4, rad, gl)) * 0.05 * uSun.z; } }
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722)); col *= mix(vec3(0.96, 1.0, 1.05), vec3(1.04, 1.0, 0.95), smoothstep(0.02, 0.7, l));   // cool shadows, warm lights
        col *= 1.0 - 0.6 * uAmt * smoothstep(0.12, 0.62, r2);                                         // the corners fall off
        col += (h21(vUv * vec2(1171.0, 913.0) + fract(uTime * 7.13) * 31.0) - 0.5) * 0.045 * uAmt * (1.0 - 0.6 * l);   // grain, mostly in the dark
        gl_FragColor = vec4(max(col, 0.0), 1.0); }` };
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, cam)); const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.6, 0.82); composer.addPass(bloom);
  composer.addPass(new OutputPass()); const grade = new ShaderPass(gradeShader); composer.addPass(grade);
  /** The same grade, for the game's composer to end on while a game shot is up. */
  const gameGrade = new ShaderPass(gradeShader); gameGrade.enabled = false;
  let cw = 0, ch = 0, cpr = 0;

  // ---------------------------------------------------------------- the words, the bars, the lost compass, the half coordinates
  const css = document.createElement('style');
  css.textContent = `body.filming > *:not(canvas):not(#film):not(#filmVeil):not(script):not(style) { opacity:0 !important; pointer-events:none !important; transition:none !important; }
    #film { position:fixed; inset:0; z-index:40; display:none; pointer-events:none; --bar:min(12.8vh, max(5vh, calc((100vh - 100vw / 2.39) / 2))); } #film.on { display:block; pointer-events:auto; }
    #filmVeil { position:fixed; inset:0; z-index:39; background:#000; opacity:0; pointer-events:none; transition:opacity 1.1s ease; }
    #film .bar { position:absolute; left:0; right:0; height:var(--bar); background:#000; } #film .bar.t { top:0; } #film .bar.b { bottom:0; }
    #film .fade { position:absolute; inset:0; background:#000; opacity:1; }
    #film .cap { position:absolute; left:50%; bottom:calc(var(--bar) + 3.2vh); transform:translateX(-50%); width:min(88vw, 36em); text-align:center; font:500 clamp(19px, 3.3vmin, 32px)/1.35 'Cormorant Garamond', Georgia, serif; color:#f4efe5; text-shadow:0 1px 12px #000, 0 0 3px #000, 0 0 30px rgba(0,0,0,.6); opacity:0; letter-spacing:.012em; }
    #film .skip { position:absolute; right:calc(18px + env(safe-area-inset-right)); bottom:calc(max(10px, var(--bar) / 2 - 15px) + env(safe-area-inset-bottom)); font:11px 'IBM Plex Mono', ui-monospace, monospace; letter-spacing:.2em; text-transform:uppercase; color:rgba(233,228,218,.55); background:none; border:1px solid rgba(233,228,218,.22); border-radius:14px; padding:7px 14px; cursor:pointer; }
    #film .skip:hover { color:#fff; border-color:rgba(233,228,218,.6); }
    #film .title { position:absolute; left:0; right:0; top:calc(var(--bar) + 7vh); text-align:center; font:500 clamp(36px, 8.5vmin, 96px)/1 'Cormorant Garamond', Georgia, serif; color:#f4efe5; opacity:0; text-shadow:0 2px 40px #000, 0 0 4px rgba(0,0,0,.6); letter-spacing:.01em; } #film .title em { font-style:italic; }
    #film .nav { position:absolute; left:66%; top:38%; width:30vmin; height:30vmin; margin:-15vmin 0 0 -15vmin; opacity:0; filter:drop-shadow(0 0 6px rgba(140,255,190,.5)); } #film .nav svg { width:100%; height:100%; overflow:visible; }
    #film .nav text { font:10px 'IBM Plex Mono', ui-monospace, monospace; letter-spacing:.2em; fill:#bfe8cc; } #film .nav.lost { filter:drop-shadow(0 0 8px rgba(255,90,60,.7)); } #film .nav.lost text { fill:#ff8a6a; } #film .nav.lost circle, #film .nav.lost line, #film .nav.lost path { stroke:#ff8a6a; }
    #film .coord { position:absolute; left:0; right:0; top:calc(var(--bar) + 5vh); text-align:center; font:clamp(11px, 1.9vmin, 16px)/1.9 'IBM Plex Mono', ui-monospace, monospace; letter-spacing:.2em; color:#bfe8e0; opacity:0; text-shadow:0 0 12px rgba(120,255,230,.5); } #film .coord b { color:#0b0f0e; background:#bfe8e0; font-weight:400; box-shadow:0 0 12px rgba(120,255,230,.4); }
    #film .wait { position:absolute; left:0; right:0; top:48%; text-align:center; font:11px 'IBM Plex Mono', ui-monospace, monospace; letter-spacing:.3em; text-transform:uppercase; color:rgba(233,228,218,.4); opacity:0; transition:opacity .6s; }`;
  document.head.append(css);
  const el = document.createElement('div'); el.id = 'film';
  el.innerHTML = `<div class="nav"><svg viewBox="-60 -60 120 120"><circle r="50" fill="none" stroke="#bfe8cc" stroke-width="0.6"/><circle r="38" fill="none" stroke="#bfe8cc" stroke-width="0.3" stroke-dasharray="1 3"/>
    ${Array.from({ length: 24 }, (_, i) => `<line x1="0" y1="-50" x2="0" y2="${i % 6 ? -47 : -43}" stroke="#bfe8cc" stroke-width="0.5" transform="rotate(${i * 15})"/>`).join('')}
    <g class="needle"><path d="M0,-36 L4,0 L0,8 L-4,0 Z" fill="none" stroke="#bfe8cc" stroke-width="0.8"/><line x1="0" y1="8" x2="0" y2="30" stroke="#bfe8cc" stroke-width="0.5"/></g><text class="lab" x="0" y="72" text-anchor="middle">NAV · FIX GOOD</text></svg></div>
    <div class="coord"></div><div class="title">Garden of <em>Delight</em></div><div class="fade"></div><div class="wait">the story so far</div><div class="cap"></div><div class="bar t"></div><div class="bar b"></div><button class="skip">skip ›</button>`;
  const veil = document.createElement('div'); veil.id = 'filmVeil'; document.body.append(el, veil);
  const fadeEl = el.querySelector('.fade'), capEl = el.querySelector('.cap'), navEl = el.querySelector('.nav'), needle = el.querySelector('.needle'), navLab = el.querySelector('.lab'), coordEl = el.querySelector('.coord'), titleEl = el.querySelector('.title'), waitEl = el.querySelector('.wait');
  el.querySelector('.skip').addEventListener('click', e => { e.stopPropagation(); finish(true); });
  for (const ev of ['mousedown', 'mouseup', 'click', 'contextmenu', 'touchstart', 'touchend', 'pointerdown', 'wheel']) el.addEventListener(ev, e => e.stopPropagation());
  addEventListener('keydown', e => { if (!active) return; e.stopImmediatePropagation(); if (['Escape', 'Enter', 'Space'].includes(e.code)) { e.preventDefault(); finish(true); } }, true);
  addEventListener('keyup', e => { if (active) e.stopImmediatePropagation(); }, true);

  // ---------------------------------------------------------------- sound: Brodie's telling, and under it a drone, a chord for each shot, a sound for each event
  let mix = null, voices = [], cued = new Set(), fx = null, spoken = new Set(), speaking = null; const clips = new Map();
  const ac = () => { const A = o.audio && o.audio(); return A && A.ctx ? A : null; };
  function loadVoice() { const A = ac(); if (!A) return; for (const c of CLIPS) if (!clips.has(c.id)) { clips.set(c.id, null);
    fetch(new URL(`../assets/film/vo/${c.id}.mp3`, import.meta.url)).then(r => r.ok ? r.arrayBuffer() : Promise.reject()).then(b => A.ctx.decodeAudioData(b)).then(buf => clips.set(c.id, buf)).catch(() => {}); } }
  function startScore() {
    const A = ac(); if (!A) return; const c = A.ctx, vol = A.on === false ? 0 : 1; mix = c.createGain(); mix.gain.value = 0; mix.gain.linearRampToValueAtTime(0.42 * vol, c.currentTime + 2);
    const rev = c.createConvolver(); { const n = Math.floor(c.sampleRate * 3.2), b = c.createBuffer(2, n, c.sampleRate); for (let k = 0; k < 2; k++) { const d = b.getChannelData(k); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6); } rev.buffer = b; }
    const wet = c.createGain(); wet.gain.value = 0.5; mix.connect(c.destination); mix.connect(rev); rev.connect(wet); wet.connect(c.destination);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 170; lp.Q.value = 0.4; const dg = c.createGain(); dg.gain.value = 0.2; lp.connect(dg); dg.connect(mix);
    for (const f of [55, 55.35, 82.5, 110.2]) { const os = c.createOscillator(); os.type = f < 60 ? 'sawtooth' : 'triangle'; os.frequency.value = f; os.connect(lp); os.start(); voices.push(os); }
    const myFx = fx = createVoiceFx(c, o.robot ? o.robot() : 0.5), voBus = c.createGain(); voBus.gain.value = 1.15 * vol; fx.output.connect(voBus); voBus.connect(c.destination); const vs = c.createGain(); vs.gain.value = 0.16; voBus.connect(vs); vs.connect(rev);
    voices.push({ stop() { myFx.stop(); try { wet.disconnect(); voBus.disconnect(); } catch (e) {} } });
  }
  function say(id) { const A = ac(), buf = clips.get(id); if (!A || !buf || !fx) return; if (speaking) { try { speaking.stop(); } catch (e) {} }
    const p = playThrough(A.ctx, fx, buf, A.ctx.destination, 1); p.source.playbackRate.value = RATE; speaking = p.source;
    if (mix) { const c = A.ctx, g = mix.gain, v = 0.42 * (A.on === false ? 0 : 1); g.cancelScheduledValues(c.currentTime); g.setTargetAtTime(v * 0.6, c.currentTime, 0.15); g.setTargetAtTime(v, c.currentTime + buf.duration / RATE + 0.3, 0.6); } }
  const HZ = n => 440 * Math.pow(2, (n - 69) / 12);
  function chord(notes, dur, gain = 0.05, type = 'sine', attack = 1.6) {
    const A = ac(); if (!A || !mix) return; const c = A.ctx, t = c.currentTime;
    for (const n of notes) { const os = c.createOscillator(), g = c.createGain(); os.type = type; os.frequency.value = HZ(n); os.detune.value = (Math.random() - 0.5) * 8;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.setValueAtTime(gain, t + Math.max(attack, dur - 2.2)); g.gain.linearRampToValueAtTime(0, t + dur); os.connect(g); g.connect(mix); os.start(t); os.stop(t + dur + 0.1); }
  }
  function sweep(f0, f1, dur, gain = 0.1, q = 1.2) {
    const A = ac(); if (!A || !mix) return; const c = A.ctx, t = c.currentTime, n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(); s.buffer = b; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + dur * 0.3); g.gain.linearRampToValueAtTime(0, t + dur); s.connect(f); f.connect(g); g.connect(mix); s.start(t);
  }
  function boom(f = 46, dur = 3, gain = 0.5) { const A = ac(); if (!A || !mix) return; const c = A.ctx, t = c.currentTime, os = c.createOscillator(), g = c.createGain(); os.frequency.setValueAtTime(f * 2.2, t); os.frequency.exponentialRampToValueAtTime(f, t + 0.5);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); os.connect(g); g.connect(mix); os.start(t); os.stop(t + dur + 0.1); }
  function glitch() { for (let k = 0; k < 6; k++) setTimeout(() => sweep(600 + Math.random() * 3000, 200 + Math.random() * 2000, 0.06 + Math.random() * 0.12, 0.12, 6), k * 120 + Math.random() * 80); }
  function grind(dur) { const A = ac(); if (!A || !mix) return; const c = A.ctx, t = c.currentTime, os = c.createOscillator(), am = c.createOscillator(), ag = c.createGain(), g = c.createGain(); os.type = 'sawtooth'; os.frequency.value = 68; am.frequency.value = 23; ag.gain.value = 0.05;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 1.5); g.gain.linearRampToValueAtTime(0, t + dur); am.connect(ag); ag.connect(g.gain); os.connect(g); g.connect(mix); os.start(t); am.start(t); os.stop(t + dur); am.stop(t + dur); }
  const CUES = [
    [0.3, () => chord([57, 64, 71, 72], 8, 0.05)], [3.2, () => chord([76, 83, 88], 5, 0.02, 'sine', 2.2)],
    [at('earth') + 7.0, () => { boom(44, 4.5, 0.6); sweep(2400, 120, 3.4, 0.12); chord([45, 46, 52], 8.5, 0.05, 'triangle', 0.4); }],
    [at('fleet') + 0.2, () => { chord([53, 60, 65, 69], 9.5, 0.05); sweep(200, 900, 4, 0.04, 0.8); }],
    [at('ship') + 0.2, () => chord([48, 55, 64, 67], 9, 0.055)], [at('ship') + 4.8, () => chord([72, 76, 79, 84], 9, 0.024, 'sine', 3)],
    [at('lost') + 0.2, () => chord([50, 57, 62], 4, 0.045)], [at('lost') + 3.0, () => { glitch(); boom(60, 1.4, 0.35); chord([49, 50, 56], 5.5, 0.04, 'sawtooth', 0.2); }],
    [at('worm') + 0.2, () => { sweep(180, 2600, 2.4, 0.1); chord([50, 57, 65, 69], 9.5, 0.05); }], [at('worm') + 3.4, () => boom(70, 1.2, 0.2)],
    [at('shred') + 0.2, () => { grind(10); chord([40, 47, 55], 10.5, 0.05, 'triangle'); }],
    [at('world') + 0.2, () => { chord([59, 66, 69, 74], 11.5, 0.042); chord([86, 90, 93], 11.5, 0.012, 'sine', 4); }],
    [at('home') + 0.2, () => chord([45, 57, 64, 69, 73], 16, 0.055, 'triangle', 2.5)], [at('home') + 10.0, () => { chord([81, 85, 88], 6.5, 0.022, 'sine', 2); boom(55, 3, 0.25); }],
  ];
  function stopScore() { const A = ac(); if (speaking) { try { speaking.stop(); } catch (e) {} speaking = null; }
    if (mix && A) { const c = A.ctx, m = mix, vs = voices; m.gain.cancelScheduledValues(c.currentTime); m.gain.setValueAtTime(m.gain.value, c.currentTime); m.gain.linearRampToValueAtTime(0, c.currentTime + 1.2); setTimeout(() => { for (const v of vs) { try { v.stop(); } catch (e) {} } try { m.disconnect(); } catch (e) {} }, 1500); }
    mix = null; voices = []; fx = null; }

  // ---------------------------------------------------------------- the shots
  let active = false, t = 0, onDone = null, ending = 0, frozen = false, lastNow = 0, waiting = 0, gcam = null, sunVis = 0, fadeK = 1, roll = 0, rollV = 0;
  const look = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), _s = new THREE.Vector3();
  const C0 = new THREE.Vector3(CENTRE.x, BUBBLE.y, CENTRE.z), pose = { p: new THREE.Vector3(), q: new THREE.Quaternion(), fov: 40, space: 1, near: 0.07 };
  const show = (...objs) => { for (const m of [earth, fleet, shred, world, sunS]) m.visible = objs.includes(m); };
  const orbitDir = (yaw, pitch, out) => out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  function gameCam(eye, target, fov, space, rollA = 0) { pose.p.copy(eye); _m.lookAt(eye, target, UP); pose.q.setFromRotationMatrix(_m); if (rollA) pose.q.multiply(_q.setFromAxisAngle(_z, rollA)); pose.fov = fov; pose.space = space; pose.near = space ? Math.max(1, (pose.p.distanceTo(C0) - BUBBLE.R) * 0.45) : 0.07; gcam = pose; }
  function frameShot(S, u, ts, dt) {
    const id = S.id; gcam = null; extra.visible = false; sunVis = 0; let inner = 1; if (id !== 'worm') for (const m of things) m.visible = false;
    navEl.style.opacity = 0; coordEl.style.opacity = 0; titleEl.style.opacity = 0; starU.uGain.value = 1; skyU.uNeb.value = 0; skyU.uMilky.value = 1; dustU.uGain.value = 0; bloom.strength = 0.85; bloom.threshold = 0.82;
    if (id === 'earth') {   // the night side from orbit, its cities lit; the sun comes over the limb; then the lights go out across the world, and the air turns
      show(earth, sunS); SUN.set(0.2, -0.22, -0.95).normalize(); const dist = 31 - 2.5 * u, th = (Math.asin(10 / dist) / D2R - 0.7 + 1.5 * ease(ts / 4.5) - 0.5 * ease((ts - 9) / 6)) * D2R;   // the sun stays at the limb: a diamond ring
      _a.copy(SUN).negate().applyAxisAngle(UP, -th).normalize(); cam.position.copy(_a).multiplyScalar(dist); look.set(0, 0, 0).addScaledVector(_b.crossVectors(UP, _a).normalize(), -2.2 + 1.2 * u); cam.fov = 36;
      earth.rotation.y = Math.atan2(_a.x, _a.z) - 0.3 + ts * 0.004;
      earthU.uOut.value = ease((ts - 7.0) / 4.2); earthU.uDead.value = ease((ts - 8.6) / 5.5);
      if (ts < 7.0) earthU.uOrigin.value.copy(_a).applyAxisAngle(UP, 0.55).applyAxisAngle(UP, -earth.rotation.y).normalize();
      const sep = Math.acos(Math.max(-1, Math.min(1, -_a.dot(SUN)))) / D2R, limb = Math.asin(10 / cam.position.length()) / D2R; sunVis = ease((sep - limb + 0.5) / 2.2) * (1 - 0.35 * earthU.uDead.value); sunS.scale.setScalar(150 * (0.4 + 0.6 * sunVis));
      starU.uGain.value = 1 - 0.5 * sunVis; bloom.strength = 0.7; bloom.threshold = 0.9;
    } else if (id === 'fleet') {   // the day side of what's left, and the ships lifting off it, out past us
      show(earth, fleet); SUN.set(0.78, 0.25, 0.57).normalize(); earthU.uOut.value = 1; earthU.uDead.value = 1; earth.rotation.y = 2.1 + ts * 0.004;
      const ax = cam.userData.axis.set(-0.38, 0.3, 0.87).normalize(), rt = cam.userData.right.crossVectors(ax, UP).normalize();
      cam.position.copy(ax).multiplyScalar(44 + 7 * u).addScaledVector(rt, 6 - 3 * u).addScaledVector(UP, 1.5 * u); look.copy(ax).multiplyScalar(8).addScaledVector(rt, -3.5 + 2 * u).addScaledVector(UP, 1.2); cam.fov = 40;
      for (let i = 0; i < NF; i++) { const f = fleetP[i], tt = Math.max(0, ts + 2.2 - f.t0), r = 10.4 + f.v * tt * (1.1 + 0.42 * tt);
        orbitDir(f.a, f.e, _a).multiplyScalar(0.55).add(ax).normalize().multiplyScalar(r).addScaledVector(rt, f.side * (0.4 + 0.12 * r)).addScaledVector(UP, f.up * (0.3 + 0.08 * r));
        _q.setFromAxisAngle(UP, f.spin + ts * 0.05); _m.compose(_a, _q, _s.setScalar(Math.max(f.R * ease(tt * 1.6), 1e-4))); fShell.setMatrixAt(i, _m); fLand.setMatrixAt(i, _m); }
      fShell.instanceMatrix.needsUpdate = fLand.instanceMatrix.needsUpdate = true; skyU.uNeb.value = 0.1; HEAD.copy(ax).multiplyScalar(-1).addScaledVector(UP, 0.5).addScaledVector(rt, -0.7).normalize(); dustU.uGain.value = 0.25 * ease(ts / 4);
    } else if (id === 'ship') {   // ours: the game's own bubble, the nebula behind it; then down under the brink to what its ground carries
      const dn = ease((ts - 4.2) / 6.5), a = 0.72 + 0.42 * u, d = 350 - 118 * ease(u * 1.15);
      orbitDir(a, 0.17 - 0.33 * dn, _a).multiplyScalar(d).add(C0); _b.copy(C0); _b.y += -10 - 26 * dn; gameCam(_a, _b, 34, 1);
      extra.visible = true; seeds.visible = true; seedU.uOn.value = ease((ts - 4.9) / 4.5) * (1 - ease((ts - 12.6) / 0.8));
    } else if (id === 'lost') {   // the compass good, then gone: the ship rolls, the stars swing
      const lostAt = 3.0, k = Math.max(0, ts - lostAt), lost = ts > lostAt;
      if (frozen) { roll = lost ? 1.9 * (1 - Math.exp(-k * 0.42)) + 0.09 * k : 0; } else { rollV += ((lost ? 0.85 * Math.exp(-k * 0.42) + 0.09 : 0) - rollV) * Math.min(1, dt * 4); roll += rollV * dt; }
      orbitDir(1.55 + 0.1 * u + 0.5 * (lost ? 1 - Math.exp(-k * 0.5) : 0), 0.1 + 0.2 * Math.sin(roll * 0.7) * (lost ? 1 : 0), _a).multiplyScalar(305 - 20 * u).add(C0); _b.copy(C0).y -= 6; gameCam(_a, _b, 38, 1, roll);
      navEl.style.opacity = (ease(ts / 1.0) * (1 - ease((ts - 7.6) / 0.7)) * (lost ? 0.5 + 0.5 * Math.round(0.3 + 0.7 * Math.abs(Math.sin(ts * 31) * Math.sin(ts * 7.3))) : 1)).toFixed(3);
      navEl.classList.toggle('lost', lost); navLab.textContent = lost ? 'NAV · NO FIX' : 'NAV · FIX GOOD';
      needle.setAttribute('transform', `rotate(${lost ? k * 420 * Math.exp(-k * 0.22) + 40 * Math.sin(ts * 3) : 18 + 1.5 * Math.sin(ts * 0.9)})`);
    } else if (id === 'worm') {   // in the east field, under it: the wormhole, and what comes through
      const H = G.hole ? G.hole() : _c.set(55.6, 21.7, 4.4), an = 0.35 + 0.5 * u, d = 15 - 4 * u;
      _a.set(H.x + Math.cos(an) * d, H.y - 2.5 - 2.5 * u, H.z + Math.sin(an) * d); _b.set(H.x - 2.5, H.y - 2.2 - 1.5 * u, H.z); gameCam(_a, _b, 46, 0);
      extra.visible = true; seeds.visible = false; const gy = heightAt(H.x - 3, H.z);
      for (const m of things) { const k = ts - m.userData.t0, fall = 0.5 * 4.2 * k * k; m.visible = k > 0 && H.y - 1 - fall > gy + 0.3; if (!m.visible) continue;
        m.position.set(H.x + m.userData.dx * Math.min(1, k * 0.35), H.y - 1 - fall, H.z + m.userData.dz * Math.min(1, k * 0.35)); m.quaternion.setFromAxisAngle(m.userData.ax, k * m.userData.w); m.scale.setScalar(Math.min(1, k * 4)); }
    } else if (id === 'shred') {   // another ship: bare ground, and the tower working
      show(shred); SUN.set(-0.6, 0.45, 0.66).normalize(); HEAD.set(0.7, 0.25, -0.67).normalize(); skyU.uNeb.value = 1; dustU.uGain.value = 0.55;
      const a = 2.5 + 0.55 * u, d = 30 - 20.5 * ease(u * 1.1); orbitDir(a, 0.2 - 0.09 * u, cam.position).multiplyScalar(d); look.set(0, 0.3 + 1.2 * ease(u * 1.1), 0); cam.fov = 36;
      const ud = shred.userData; ud.fan.rotation.y = ts * 11; ud.pl.intensity = 7 + 2 * Math.sin(ts * 9); for (const b of ud.beacons) b.visible = Math.sin(ts * 5) > 0.2;
      for (let i = 0; i < ud.debP.length; i++) { const p = ud.debP[i], k = (p.ph + ts * 0.11 * p.w) % 1, y = lerp(ud.H + 1.5, 0.5, k * k), ang = p.a + k * 9 * p.w, r = y > ud.H ? p.r * (1 + (y - ud.H) * 1.5) : p.r * (0.4 + 0.6 * (y / ud.H));
        _q.setFromAxisAngle(p.ax, ts * 3 * p.w); _m.compose(_a.set(Math.cos(ang) * r, y, Math.sin(ang) * r), _q, _s.set(p.s, p.s * 0.7, p.s * 1.3).multiplyScalar(k > 0.96 ? (1 - k) * 25 : 1)); ud.deb.setMatrixAt(i, _m); }
      ud.deb.instanceMatrix.needsUpdate = true; bloom.strength = 0.55; bloom.threshold = 1.0;
    } else if (id === 'world') {   // far off, something turning; and what we know of where
      show(world); SUN.set(0, 1, 0); skyU.uMilky.value = 1.6; starU.uGain.value = 0.8;
      cam.position.set(-70 + 60 * u, 60 - 18 * u, 330 - 120 * ease(u)); look.set(0, 0, 0); cam.fov = 38; const on = ease(ts / 2.5) * (1 - ease((ts - 10.6) / 0.9)); vortU.uOn.value = on; for (const g of world.userData.glows) g.material.opacity = on; world.rotation.y = ts * 0.02;
      coordEl.style.opacity = (ease((ts - 7.3) / 0.8) * (1 - ease((ts - 10.5) / 0.8))).toFixed(3);
      if (ts > 7 && (Math.floor(ts * 8) !== Math.floor((ts - dt) * 8) || !coordEl.textContent)) { const blk = n => `<b>${'&nbsp;'.repeat(n)}</b>`, fl = () => Math.floor(Math.random() * 10);
        coordEl.innerHTML = `WORLD BUILDER<br>α 17<sup>h</sup> 4${blk(1)}<sup>m</sup> ${blk(2)}<sup>s</sup> &nbsp; δ −2${blk(1)}° ${blk(2)}′<br>r ${blk(3)}${fl()} ly &nbsp; · &nbsp; signal lost`; }
      bloom.strength = 0.75; bloom.threshold = 0.85;
    } else if (id === 'home') {   // in at the gate, through the light tunnel, up over the garden; then the ship going on, and its name
      const cut = 9.6;
      if (ts < cut) { const k = ease(ts / cut * 1.02), z = 51.4 - 20 * k, up = Math.pow(ease((ts - 4.4) / (cut - 4.4)), 1.6);
        _a.set(0.25 * Math.sin(ts * 0.4), heightAt(0, z) + 1.72 + 23 * up, z + 10 * up); _b.set(0, 1.5 + 2.5 * (1 - up), lerp(z - 30, CENTRE.z - 6, up)); gameCam(_a, _b, 56 - 6 * up, 0); inner = Math.min(1, (cut - ts) / 0.55); }
      else { const k = (ts - cut) / (S.len - cut), d = 285 + 150 * ease(k); orbitDir(0.95 + 0.1 * k, 0.14, _a).multiplyScalar(d).add(C0); _b.copy(C0).y += d * 0.13 * ease(k * 1.5); gameCam(_a, _b, 40, 1); inner = Math.min(1, (ts - cut) / 0.55);
        titleEl.style.opacity = (ease((ts - cut - 1.4) / 2.2) * (1 - ease((ts - (S.len - 1.0)) / 0.8))).toFixed(3); }
    }
    // the words
    let line = null, la = 0; for (const c of CAPS) if (t >= c.a && t <= c.b) { line = c.text; la = Math.min(1, (t - c.a) / 0.45, (c.b - t) / 0.6); }
    if (line && capEl.textContent !== line) capEl.textContent = line; capEl.style.opacity = line ? ease(la).toFixed(3) : 0;
    // through black between shots
    fadeK = 1 - ease(Math.min(ts / 0.7, (S.len - ts) / 0.7, inner, 1)); fadeEl.style.opacity = fadeK.toFixed(3);
  }

  function loadPictures() { if (wantTex) return; wantTex = true; earthU.tDay.value = tex('earth_day.jpg'); earthU.tNight.value = tex('earth_night.jpg'); earthU.tWater.value = tex('earth_water.jpg'); }
  function begin(done) {
    if (active) return; active = true; t = 0; ending = 0; frozen = false; onDone = done || null; cued = new Set(); spoken = new Set(); roll = rollV = 0; waiting = 0; lastNow = performance.now(); seedU.uOn.value = 0;
    el.classList.add('on'); document.body.classList.add('filming'); fadeEl.style.opacity = 1; capEl.style.opacity = 0; veil.style.transition = 'none'; veil.style.opacity = 0;
    loadPictures(); startScore(); loadVoice(); try { localStorage.setItem(KEY, '1'); } catch (e) {}
  }
  function finish(skipped) { if (!active || ending) return; ending = skipped ? 0.7 : 0.01; stopScore(); }
  function end() {
    active = false; gcam = null; extra.visible = false; gameGrade.enabled = false; el.classList.remove('on'); document.body.classList.remove('filming');
    veil.style.transition = 'none'; veil.style.opacity = 1; void veil.offsetWidth; veil.style.transition = ''; requestAnimationFrame(() => { veil.style.opacity = 0; });   // the game comes up out of the black
    const d = onDone; onDone = null; if (d) d();
  }
  /** One frame of it. Returns true when it drew the frame itself; false when the shot is the game's (it has set `cam` for it). */
  function frame() {
    if (!active) return false;
    const now = performance.now(), dt = Math.min(0.1, Math.max(0, (now - lastNow) / 1000)); lastNow = now;
    if (!frozen) {
      if (t === 0 && !ending && loaded < 3 && waiting < 7) { waiting += dt; waitEl.style.opacity = waiting > 0.8 ? 1 : 0; renderer.setRenderTarget(null); renderer.setClearColor(0x000000, 1); renderer.clear(); return true; }   // the pictures of Earth are on their way
      waitEl.style.opacity = 0; t += dt;
    }
    T.value = t; grade.uniforms.uTime.value = t; gameGrade.uniforms.uTime.value = t;
    if (ending) { ending -= dt; if (ending <= 0) { end(); return false; } }
    else if (t >= FILM_LENGTH) finish(false);
    if (!ending && !frozen) { for (let i = 0; i < CUES.length; i++) if (!cued.has(i) && t >= CUES[i][0]) { cued.add(i); if (t - CUES[i][0] < 1.5) CUES[i][1](); }
      for (const c of CLIPS) if (!spoken.has(c.id) && t >= c.at) { spoken.add(c.id); if (t - c.at < 0.8) say(c.id); } }
    const S = SHOTS.find(s => t < s.t1) || SHOTS[SHOTS.length - 1], ts = Math.min(t, FILM_LENGTH - 0.001) - S.t0;
    frameShot(S, ts / S.len, ts, dt);
    if (ending) { fadeK = Math.max(fadeK, 1 - Math.max(0, ending) / 0.7); fadeEl.style.opacity = fadeK.toFixed(3); capEl.style.opacity = 0; titleEl.style.opacity = 0; }
    const asp = innerWidth / innerHeight, tall = asp < 1.5 ? 1.5 / asp : 1, wide = f => Math.min(100, 2 * Math.atan(Math.tan(f * D2R / 2) * tall) / D2R);   // a phone held upright keeps the width of the shot
    uPR.value = renderer.getPixelRatio();
    if (gcam) { gcam.fov = wide(gcam.fov); gameGrade.enabled = true; gameGrade.uniforms.uAmt.value = 0.8; gameGrade.uniforms.uAspect.value = asp; gameGrade.uniforms.uSun.value.z = 0; return false; }
    gameGrade.enabled = false;
    cam.aspect = asp; cam.fov = wide(cam.fov); cam.updateProjectionMatrix(); cam.lookAt(look); cam.updateMatrixWorld();
    sky.position.copy(cam.position); stars.position.copy(cam.position); sunS.position.copy(cam.position).addScaledVector(SUN, 8000); sunL.position.copy(SUN).multiplyScalar(50);
    // the sun in the lens: where it is on the screen, and how much of it is clear of the Earth
    _a.copy(sunS.position).project(cam); grade.uniforms.uSun.value.set(_a.x * 0.5 + 0.5, _a.y * 0.5 + 0.5, _a.z < 1 && Math.abs(_a.x) < 1.6 && Math.abs(_a.y) < 1.6 ? sunVis : 0); sunS.material.opacity = sunVis; if (sunVis < 0.001) sunS.visible = false;
    grade.uniforms.uAspect.value = asp; grade.uniforms.uAmt.value = 1;
    const pr = renderer.getPixelRatio(); if (cw !== innerWidth || ch !== innerHeight || cpr !== pr) { cw = innerWidth; ch = innerHeight; cpr = pr; composer.setPixelRatio(pr); composer.setSize(cw, ch); bloom.resolution.set(cw / 2, ch / 2); }
    composer.render(dt); return true;
  }
  return {
    get active() { return active; }, frame, play: begin, skip: () => finish(true), length: FILM_LENGTH, shots: SHOTS.map(s => [s.id, s.t0, s.t1, !!s.game]), grade: gameGrade,
    /** While a game shot is up: where the game's camera should be ({ p, q, fov, space (0 in the garden, 1 outside), near }); otherwise null. */
    get cam() { return active ? gcam : null; },
    /** Seen before (so it isn't played again unasked)? */
    get seen() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } },
    /** Fetch the pictures of Earth ahead of time (they are only needed if it plays). */
    preload: loadPictures, get ready() { return loaded >= 3; },
    /** For tests: hold on one moment of it, without sound. */
    still(when) { if (!active) { active = true; el.classList.add('on'); document.body.classList.add('filming'); loadPictures(); } ending = 0; frozen = true; waiting = 9; t = when; lastNow = performance.now(); },
    stop() { if (active) { stopScore(); end(); } },
  };
}
