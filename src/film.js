// film.js: the intro. The story so far (STORY.md), told in eight shots before you first walk in: Earth and The Event, the fleet,
// our ship and what its land carries, the navigation lost, the wormhole, the Shred Hole's ship, World Builder at half its
// coordinates, and the crew's task. About ninety seconds; Esc, Enter or "skip" ends it. It plays once (the title's "the story so
// far" plays it again).
//
// It's made of the game's own things: the real stars of the catalogue; the ship is Brodie's miniature of the garden (sphere.js),
// under its bubble, on its torn-off ground; the rest (an Earth whose lights go out, the fleet, the wormhole, the Shred Hole's ship,
// the vortex) is drawn here, in shaders. The score is synthesized as it plays: a drone, a chord for each shot, a sound for each
// event. While it runs the garden isn't drawn at all (main.js hands the frame over), so it costs less than the garden does.
import * as THREE from 'three';
import { miniGarden } from './sphere.js';
import { bvToRGB } from './astro.js';

const NOISE = `
  float hash3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vn3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash3(i), hash3(i+vec3(1,0,0)), f.x), mix(hash3(i+vec3(0,1,0)), hash3(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(hash3(i+vec3(0,0,1)), hash3(i+vec3(1,0,1)), f.x), mix(hash3(i+vec3(0,1,1)), hash3(i+vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn3(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }`;
const ease = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;
const KEY = 'gd.film.seen';

// the script: [seconds in, seconds out, the line], by shot
const SHOTS = [
  { id: 'earth', len: 15, lines: [[1.2, 5.6, 'Earth. 2027.'], [6.6, 10.2, 'Then came The Event.'], [10.8, 14.4, 'Earth became uninhabitable.']] },
  { id: 'fleet', len: 11, lines: [[0.8, 5.2, 'A fleet of probes went out,'], [5.4, 10.2, 'each to find a place where life could carry on.']] },
  { id: 'ship', len: 14, lines: [[0.8, 4.2, 'We are one of them.'], [4.8, 9.0, 'Our land carries Earth’s blueprint,'], [9.2, 13.4, 'and a snapshot of everyone alive in 2027.']] },
  { id: 'lost', len: 10, lines: [[0.8, 4.6, 'A few centuries out,'], [4.8, 9.4, 'our ship lost its navigation.']] },
  { id: 'worm', len: 10, lines: [[0.8, 4.6, 'The wormhole links the ships of the fleet.'], [5.0, 9.4, 'Things come through it.']] },
  { id: 'shred', len: 11, lines: [[0.8, 5.0, 'One ship carries the Shred Hole: a fabricator'], [5.2, 10.4, 'that lost its Earth blueprint in an accident.']] },
  { id: 'world', len: 12, lines: [[0.8, 5.0, 'Before it went dark, another ship found something.'], [5.4, 8.6, 'It called it World Builder.'], [8.8, 11.4, 'We have half the coordinates.']] },
  { id: 'home', len: 15, lines: [[0.8, 4.6, 'So it is up to us to find our way again.'], [5.2, 8.4, 'Until then, we garden.'], [8.6, 11.4, 'We build the wall.'], [11.6, 14.4, 'And whatever else suits our fancy.']] },
];
{ let t = 0; for (const s of SHOTS) { s.t0 = t; t += s.len; s.t1 = t; } }
export const FILM_LENGTH = SHOTS[SHOTS.length - 1].t1;

/** o: { renderer, cat (the star catalogue), layout (the garden's), audio(): { ctx, master, send }, isTouch } */
export function createFilm(o) {
  const { renderer } = o;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(38, 1, 0.02, 6000);
  scene.add(new THREE.AmbientLight(0x8899aa, 0.9)); const sunL = new THREE.DirectionalLight(0xfff2e0, 2.6); sunL.position.set(1, 0.5, 0.6); scene.add(sunL);
  const SUN = new THREE.Vector3(1, 0.3, 0.55).normalize(), T = { value: 0 };

  // ---------------------------------------------------------------- the stars: the catalogue's own, about the camera
  const sky = new THREE.Group(); scene.add(sky); const starU = { uGain: { value: 1 }, uPR: { value: 1 }, uTime: T, uStreak: { value: 0 } };
  { const cat = o.cat || [], n = cat.length / 4, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), mag = new Float32Array(n), D = Math.PI / 180;
    for (let i = 0; i < n; i++) { const ra = cat[i * 4] * D, dec = cat[i * 4 + 1] * D, c = bvToRGB(cat[i * 4 + 3]); pos.set([Math.cos(dec) * Math.cos(ra) * 3000, Math.sin(dec) * 3000, -Math.cos(dec) * Math.sin(ra) * 3000], i * 3); col.set(c, i * 3); mag[i] = cat[i * 4 + 2]; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aColor', new THREE.BufferAttribute(col, 3)); g.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
    const m = new THREE.ShaderMaterial({ uniforms: starU, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uGain, uPR, uTime; attribute vec3 aColor; attribute float aMag; varying vec3 vC;
        void main(){ float flux = pow(10.0, -0.4 * (aMag - 1.0)); float tw = 1.0 + 0.12 * sin(uTime * (3.0 + fract(aMag * 7.31) * 5.0) + aMag * 40.0);
          vC = aColor * min(pow(flux, 0.55), 3.5) * 1.5 * uGain * tw; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = (1.4 + 2.6 * clamp((4.0 - aMag) / 5.0, 0.0, 1.4)) * uPR; }`,
      fragmentShader: `varying vec3 vC; void main(){ vec2 q = gl_PointCoord * 2.0 - 1.0; float r2 = dot(q, q); if (r2 > 1.0) discard; gl_FragColor = vec4(vC * exp(-r2 * 3.2), 1.0); }` });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = -10; sky.add(pts); }

  // ---------------------------------------------------------------- Earth: seas, land, ice, cloud; its cities lit on the night side; and after
  const earthU = { uSun: { value: SUN }, uDead: { value: 0 }, uOut: { value: 0 }, uTime: T, uCam: { value: new THREE.Vector3() } };
  const earth = new THREE.Mesh(new THREE.SphereGeometry(10, 96, 64), new THREE.ShaderMaterial({ uniforms: earthU,
    vertexShader: `varying vec3 vN, vO, vW; void main(){ vO = normalize(position); vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uSun, uCam; uniform float uDead, uOut, uTime; varying vec3 vN, vO, vW;` + NOISE + `
      void main(){
        vec3 p = vO, N = normalize(vN), V = normalize(uCam - vW);
        float h = fbm(p * 1.7 + 3.7) + 0.16 * fbm(p * 7.0), land = smoothstep(0.555, 0.575, h), lat = abs(p.y);
        vec3 sea = mix(vec3(0.015, 0.07, 0.22), vec3(0.03, 0.2, 0.38), fbm(p * 5.0));
        vec3 veg = mix(vec3(0.13, 0.33, 0.1), vec3(0.62, 0.5, 0.28), smoothstep(0.6, 0.72, h + 0.2 * (1.0 - lat) * fbm(p * 3.0)));
        vec3 col = mix(sea, veg, land); col = mix(col, vec3(0.88, 0.92, 0.95), smoothstep(0.80, 0.9, lat + 0.12 * fbm(p * 7.0)));
        float cl = smoothstep(0.54, 0.74, fbm(p * 3.2 + vec3(uTime * 0.012, 0.0, uTime * 0.004)));
        col = mix(col, vec3(0.95), cl * 0.85);
        // after The Event: the colour goes out of it, under a brown overcast
        vec3 dead = mix(vec3(0.16, 0.13, 0.11), vec3(0.3, 0.24, 0.19), fbm(p * 4.0 + 11.0));
        float pall = smoothstep(0.34, 0.62, fbm(p * 2.6 + vec3(uTime * 0.02, 5.0, 0.0)));
        dead = mix(dead, vec3(0.38, 0.31, 0.25), pall);
        col = mix(col, dead, uDead);
        float nl = dot(N, uSun), day = smoothstep(-0.12, 0.28, nl);
        vec3 lit = col * (0.012 + day);
        lit += vec3(0.6, 0.75, 1.0) * pow(max(dot(reflect(-uSun, N), V), 0.0), 40.0) * (1.0 - land) * (1.0 - cl) * 0.5 * (1.0 - uDead) * day;   // the sun on the sea
        // the cities, on the night side: they go out a region at a time
        float dens = smoothstep(0.46, 0.66, fbm(p * 9.0 + 2.0)) * (1.0 - smoothstep(0.62, 0.8, lat)), cell = hash3(floor(p * 170.0));
        float city = (step(1.0 - 0.36 * dens, cell) + 0.3 * smoothstep(0.5, 0.7, fbm(p * 30.0)) * dens) * land;
        float region = hash3(floor(p * 5.0 + 0.5));
        lit += vec3(1.0, 0.74, 0.38) * city * (1.0 - day) * 1.5 * step(uOut * 1.05, region) * (1.0 - cl * 0.7);
        float rim = pow(1.0 - max(dot(N, V), 0.0), 3.2);
        lit += mix(vec3(0.22, 0.48, 1.0), vec3(0.45, 0.27, 0.14), uDead) * rim * (0.12 + 0.9 * day);
        gl_FragColor = vec4(lit, 1.0);
      }` }));
  scene.add(earth);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(10.35, 64, 48), new THREE.ShaderMaterial({ uniforms: earthU, transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vN, vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uSun, uCam; uniform float uDead; varying vec3 vN, vW; void main(){ vec3 V = normalize(uCam - vW); float f = pow(max(dot(-normalize(vN), V), 0.0), 2.5), day = smoothstep(-0.3, 0.4, dot(-normalize(vN), uSun) * -1.0 + 0.2);
      gl_FragColor = vec4(mix(vec3(0.25, 0.5, 1.0), vec3(0.5, 0.3, 0.16), uDead) * f * 0.55 * (0.25 + day), 1.0); }` }));
  earth.add(halo);

  // ---------------------------------------------------------------- a ship of the fleet: a bubble, and the land in it
  const glassMat = (r, g, b, k = 1) => new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color(r, g, b) }, uK: { value: k }, uCam: earthU.uCam }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vN, vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uCol, uCam; uniform float uK; varying vec3 vN, vW; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(uCam - vW))), 2.4); gl_FragColor = vec4(uCol * (0.04 + f) * uK, 1.0); }` });
  const rock = new THREE.MeshLambertMaterial({ color: 0x5a4636, emissive: 0x1a130d }), rockDark = new THREE.MeshLambertMaterial({ color: 0x2c2a2a, emissive: 0x0c0b0b });
  function underside(R, depth, mat) {   // the torn-off ground under the land: a rough bowl
    const g = new THREE.SphereGeometry(R, 40, 20, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), P = g.attributes.position;
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), n = 1 + 0.16 * Math.sin(x * 9.1 + z * 7.3) * Math.cos(z * 11.7 - x * 5.2); P.setXYZ(i, x * (y < -0.02 ? n : 1), y * depth / R * n, z * (y < -0.02 ? n : 1)); }
    g.computeVertexNormals(); return new THREE.Mesh(g, mat);
  }
  // ours
  const ship = new THREE.Group(); scene.add(ship);
  const land = new THREE.Group(); ship.add(land); land.position.y = -0.16;
  if (o.layout) { const mg = miniGarden(o.layout).group; mg.scale.setScalar(5.3); land.add(mg); } else land.add(new THREE.Mesh(new THREE.CylinderGeometry(0.69, 0.69, 0.02, 40), new THREE.MeshLambertMaterial({ color: 0x4f7a35 })));
  { const u = underside(0.69, 0.42, rock); u.position.y = -0.085; land.add(u); }
  ship.add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), glassMat(0.55, 0.85, 1.0)));
  { const hole = new THREE.Group(); hole.position.set(0.1, 0.42, -0.05); ship.add(hole);   // the black hole that lights the garden, and its ring
    hole.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 20, 14), new THREE.MeshBasicMaterial({ color: 0x000000 })));
    const d = new THREE.Mesh(new THREE.RingGeometry(0.065, 0.15, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.72, 0.4), side: THREE.DoubleSide, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    d.rotation.x = Math.PI / 2 - 0.35; hole.add(d); ship.userData.disk = d; }
  // what the land carries: the blueprint and the snapshot, as lights in the ground
  const seedU = { uOn: { value: 0 }, uTime: T, uPR: starU.uPR };
  { const n = 2600, pos = new Float32Array(n * 3), sd = new Float32Array(n); let k = 0;
    while (k < n) { const x = (Math.random() * 2 - 1) * 0.66, z = (Math.random() * 2 - 1) * 0.66, y = -Math.random() * 0.4, r = Math.hypot(x, z); if (r > 0.66 * Math.sqrt(Math.max(0, 1 - (y / 0.42) ** 2))) continue; pos.set([x, y - 0.09, z], k * 3); sd[k] = Math.random(); k++; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: seedU, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uOn, uTime, uPR; attribute float aSeed; varying float vA; void main(){ float wave = smoothstep(0.0, 0.25, uOn * 1.25 - (position.y + 0.5) * 0.9 - aSeed * 0.15);
        vA = wave * (0.45 + 0.55 * sin(uTime * (1.5 + aSeed * 3.0) + aSeed * 60.0)) * uOn; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = (1.2 + 1.6 * aSeed) * uPR * clamp(2.6 / -mv.z, 0.5, 3.0); }`,
      fragmentShader: `varying float vA; void main(){ vec2 q = gl_PointCoord * 2.0 - 1.0; float r2 = dot(q, q); if (r2 > 1.0) discard; gl_FragColor = vec4(vec3(0.55, 1.0, 0.75) * vA * exp(-r2 * 2.5), 1.0); }` }));
    pts.frustumCulled = false; land.add(pts); }
  // the fleet: each a point of glass with a fleck of green in it
  const NF = 90, fleetPos = new Float32Array(NF * 3), fleetSeed = new Float32Array(NF), fleetU = { uPR: starU.uPR, uGain: { value: 1 } }, fleetP = [];
  for (let i = 0; i < NF; i++) { const a = Math.random() * 6.28, e = (Math.random() - 0.3) * 1.2, d = new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)).lerp(new THREE.Vector3(-0.5, 0.45, 0.75), 0.72).normalize();
    fleetP.push({ d, side: new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize(), t0: Math.random() * 6.5, v: 6.5 + Math.random() * 5, w: (Math.random() - 0.5) * 0.5 }); fleetSeed[i] = Math.random(); }
  const fleetGeo = new THREE.BufferGeometry(); fleetGeo.setAttribute('position', new THREE.BufferAttribute(fleetPos, 3)); fleetGeo.setAttribute('aSeed', new THREE.BufferAttribute(fleetSeed, 1));
  const fleet = new THREE.Points(fleetGeo, new THREE.ShaderMaterial({ uniforms: fleetU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uPR; attribute float aSeed; varying float vS; void main(){ vS = aSeed; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(uPR * (300.0 + 200.0 * aSeed) / -mv.z, 3.0 * uPR, 60.0 * uPR); }`,
    fragmentShader: `uniform float uGain; varying float vS; void main(){ vec2 q = gl_PointCoord * 2.0 - 1.0; float r = length(q); if (r > 1.0) discard;
      float rim = smoothstep(0.62, 0.92, r) * smoothstep(1.0, 0.92, r), land = smoothstep(0.5, 0.42, length(q * vec2(1.0, 3.2) + vec2(0.0, 0.25))), glow = exp(-r * r * 5.0) * 0.25;
      gl_FragColor = vec4((vec3(0.55, 0.85, 1.0) * (rim + glow) + vec3(0.35, 0.8, 0.3) * land) * uGain, 1.0); }` }));
  fleet.frustumCulled = false; scene.add(fleet);

  // ---------------------------------------------------------------- the wormhole: a ring, the swirl in it, and its threads to the fleet
  const worm = new THREE.Group(); scene.add(worm); const wormU = { uTime: T, uOn: { value: 0 } };
  worm.add(new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.018, 10, 80), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.9, 1.0), toneMapped: false })));
  worm.add(new THREE.Mesh(new THREE.CircleGeometry(0.62, 64), new THREE.ShaderMaterial({ uniforms: wormU, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vU; void main(){ vU = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime, uOn; varying vec2 vU; void main(){ float r = length(vU), a = atan(vU.y, vU.x); float sw = 0.5 + 0.5 * sin(a * 3.0 + 9.0 * log(r + 0.08) - uTime * 2.2);
      float core = exp(-r * r * 9.0), edge = smoothstep(1.0, 0.75, r); vec3 c = mix(vec3(0.1, 0.25, 0.7), vec3(0.6, 0.9, 1.0), sw) * edge * (0.25 + 0.75 * sw) + vec3(1.0) * core * 0.9; gl_FragColor = vec4(c * uOn, 1.0); }` })));
  const threads = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: new THREE.Color(0.35, 0.6, 0.9), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  { const far = [[-60, 22, -90], [70, -14, -120], [20, 46, -140], [-30, -30, -100], [95, 30, -70]], v = []; for (const f of far) v.push(0, 0, 0, ...f); threads.geometry.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); worm.add(threads); worm.userData.far = far; }
  const junk = []; { const cols = [0xff5a00, 0xe0262b, 0xf6f6f2, 0x3a7bd5, 0xf2c94c, 0x8a8f94, 0x6fa04a];
    for (let i = 0; i < 9; i++) { const s = 0.03 + Math.random() * 0.04, m = new THREE.Mesh(i % 3 ? new THREE.BoxGeometry(s, s * (0.5 + Math.random()), s * (0.6 + Math.random())) : new THREE.ConeGeometry(s * 0.6, s * 1.6, 8), new THREE.MeshLambertMaterial({ color: cols[i % cols.length], emissive: new THREE.Color(cols[i % cols.length]).multiplyScalar(0.25) }));
      m.userData = { t0: i * 0.75 + Math.random() * 0.3, ax: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), off: new THREE.Vector3((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.25, 0) }; scene.add(m); junk.push(m); } }

  // ---------------------------------------------------------------- the Shred Hole's ship: bare rock, the shaft through it, the blades, the sparks
  const shred = new THREE.Group(); scene.add(shred);
  shred.add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), glassMat(1.0, 0.55, 0.3)));
  { const l = new THREE.Group(); l.position.y = -0.16; shred.add(l); l.add(new THREE.Mesh(new THREE.CylinderGeometry(0.69, 0.69, 0.03, 48), rockDark)); const u = underside(0.69, 0.42, rockDark); u.position.y = -0.015; l.add(u);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.95, 32, 1, true), new THREE.MeshLambertMaterial({ color: 0x3a3d42, emissive: 0x15171a, side: THREE.DoubleSide })); shaft.position.y = 0.2; l.add(shaft);
    for (const y of [0.0, 0.33, 0.66]) { const b = new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.012, 6, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.45, 0.12), toneMapped: false })); b.rotation.x = Math.PI / 2; b.position.y = y - 0.02; l.add(b); }
    const fan = new THREE.Group(); fan.position.y = 0.05; l.add(fan); for (let k = 0; k < 3; k++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.008, 0.045), new THREE.MeshLambertMaterial({ color: 0xb8bcc2, emissive: 0x33363a })); bl.rotation.y = k * Math.PI / 3; fan.add(bl); } shred.userData.fan = fan;
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.15, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.5, 0.15), toneMapped: false })); mouth.rotation.x = -Math.PI / 2; mouth.position.y = 0.6; l.add(mouth); fan.position.y = 0.62; fan.scale.setScalar(0.95);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.14, 0.5, 32, 1, true), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: `varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`, fragmentShader: `varying float vY; void main(){ gl_FragColor = vec4(vec3(1.0, 0.45, 0.12) * pow(1.0 - vY, 2.0) * 0.5, 1.0); }` })); beam.position.y = 0.92; l.add(beam);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.155, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.4, 0.1), toneMapped: false, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })); glow.rotation.x = -Math.PI / 2; glow.position.y = -0.2; l.add(glow); }
  const sparkU = { uTime: T, uPR: starU.uPR };
  { const n = 420, sd = new Float32Array(n * 3), pos = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) sd[i] = Math.random();
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aS', new THREE.BufferAttribute(sd, 3));
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: sparkU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uTime, uPR; attribute vec3 aS; varying float vA; void main(){ float life = fract(uTime * (0.5 + aS.x * 0.6) + aS.y), a = aS.z * 6.2832, sp = 0.18 + 0.5 * aS.x;
        vec3 p = vec3(cos(a) * sp * life * (0.3 + aS.y), -0.3 - life * (0.5 + 0.7 * aS.y) - life * life * 0.6, sin(a) * sp * life * (0.3 + aS.y)); vA = (1.0 - life) * (1.0 - life);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uPR * (1.0 + 2.0 * aS.x) * clamp(3.0 / -mv.z, 0.6, 3.0); }`,
      fragmentShader: `varying float vA; void main(){ vec2 q = gl_PointCoord * 2.0 - 1.0; if (dot(q, q) > 1.0) discard; gl_FragColor = vec4(mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.9, 0.6), vA) * vA * 1.4, 1.0); }` }));
    pts.frustumCulled = false; shred.add(pts); }

  // ---------------------------------------------------------------- World Builder: a vortex, far off, not understood
  const vortU = { uTime: T, uOn: { value: 0 } };
  const vortex = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: vortU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vU; void main(){ vU = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime, uOn; varying vec2 vU;` + NOISE + ` void main(){ float r = length(vU), a = atan(vU.y, vU.x); if (r > 1.0) discard;
      float arms = 0.5 + 0.5 * sin(a * 2.0 - 7.0 * log(r + 0.03) + uTime * 0.5), n = fbm(vec3(vU * 4.0 + vec2(cos(uTime * 0.1), sin(uTime * 0.1)) , uTime * 0.05));
      float body = smoothstep(1.0, 0.1, r) * (0.15 + 0.85 * arms * arms) * (0.5 + n), core = exp(-r * r * 60.0) * 2.5, hole = smoothstep(0.035, 0.07, r);
      vec3 c = mix(vec3(0.5, 0.2, 0.8), vec3(0.2, 0.85, 0.8), smoothstep(0.1, 0.8, r + 0.25 * n)) * body * hole + vec3(1.0, 0.95, 0.9) * core * hole; gl_FragColor = vec4(c * uOn, 1.0); }` }));
  scene.add(vortex);

  // ---------------------------------------------------------------- the words, the bars, the lost compass, the half coordinates
  const css = document.createElement('style');
  css.textContent = `body.filming > *:not(canvas):not(#film):not(script):not(style) { opacity:0 !important; pointer-events:none !important; transition:none !important; }
    #film { position:fixed; inset:0; z-index:40; display:none; pointer-events:none; } #film.on { display:block; pointer-events:auto; }
    #film .bar { position:absolute; left:0; right:0; height:9vh; background:#000; } #film .bar.t { top:0; } #film .bar.b { bottom:0; }
    #film .fade { position:absolute; inset:0; background:#000; opacity:1; }
    #film .cap { position:absolute; left:50%; bottom:14vh; transform:translateX(-50%); width:min(88vw, 34em); text-align:center; font:500 clamp(19px, 3.4vmin, 31px)/1.35 'Cormorant Garamond', Georgia, serif; color:#f1ece2; text-shadow:0 1px 10px #000, 0 0 2px #000; opacity:0; letter-spacing:.01em; }
    #film .skip { position:absolute; right:calc(18px + env(safe-area-inset-right)); bottom:calc(2.2vh + env(safe-area-inset-bottom)); font:11px 'IBM Plex Mono', ui-monospace, monospace; letter-spacing:.2em; text-transform:uppercase; color:rgba(233,228,218,.6); background:none; border:1px solid rgba(233,228,218,.25); border-radius:14px; padding:7px 14px; cursor:pointer; }
    #film .skip:hover { color:#fff; border-color:rgba(233,228,218,.6); }
    #film .title { position:absolute; left:0; right:0; top:19vh; text-align:center; font:500 clamp(34px, 8vmin, 84px)/1 'Cormorant Garamond', Georgia, serif; color:#f1ece2; opacity:0; text-shadow:0 2px 30px #000; } #film .title em { font-style:italic; }
    #film .nav { position:absolute; left:64%; top:40%; width:34vmin; height:34vmin; margin:-17vmin 0 0 -17vmin; opacity:0; } #film .nav svg { width:100%; height:100%; overflow:visible; }
    #film .nav text { font:11px 'IBM Plex Mono', ui-monospace, monospace; letter-spacing:.2em; fill:#bfe8cc; } #film .nav.lost text { fill:#ff8a6a; } #film .nav.lost circle, #film .nav.lost line, #film .nav.lost path { stroke:#ff8a6a; }
    #film .coord { position:absolute; left:0; right:0; top:22vh; text-align:center; font:clamp(11px, 1.9vmin, 16px)/1.9 'IBM Plex Mono', ui-monospace, monospace; letter-spacing:.2em; color:#bfe8e0; opacity:0; text-shadow:0 0 12px rgba(120,255,230,.5); } #film .coord b { color:#0b0f0e; background:#bfe8e0; font-weight:400; }`;
  document.head.append(css);
  const el = document.createElement('div'); el.id = 'film';
  el.innerHTML = `<div class="fade"></div><div class="nav"><svg viewBox="-60 -60 120 120"><circle r="50" fill="none" stroke="#bfe8cc" stroke-width="0.6"/><circle r="38" fill="none" stroke="#bfe8cc" stroke-width="0.3" stroke-dasharray="1 3"/>
    ${Array.from({ length: 24 }, (_, i) => `<line x1="0" y1="-50" x2="0" y2="${i % 6 ? -47 : -43}" stroke="#bfe8cc" stroke-width="0.5" transform="rotate(${i * 15})"/>`).join('')}
    <g class="needle"><path d="M0,-36 L4,0 L0,8 L-4,0 Z" fill="none" stroke="#bfe8cc" stroke-width="0.8"/><line x1="0" y1="8" x2="0" y2="30" stroke="#bfe8cc" stroke-width="0.5"/></g><text class="lab" x="0" y="72" text-anchor="middle">NAV · FIX GOOD</text></svg></div>
    <div class="coord"></div><div class="title">Garden of <em>Delight</em></div><div class="cap"></div><div class="bar t"></div><div class="bar b"></div><button class="skip">skip ›</button>`;
  document.body.append(el);
  const fadeEl = el.querySelector('.fade'), capEl = el.querySelector('.cap'), navEl = el.querySelector('.nav'), needle = el.querySelector('.needle'), navLab = el.querySelector('.lab'), coordEl = el.querySelector('.coord'), titleEl = el.querySelector('.title');
  el.querySelector('.skip').addEventListener('click', e => { e.stopPropagation(); finish(true); });
  for (const ev of ['mousedown', 'touchstart', 'pointerdown', 'wheel']) el.addEventListener(ev, e => e.stopPropagation());
  addEventListener('keydown', e => { if (!active) return; if (['Escape', 'Enter', 'Space'].includes(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); finish(true); } }, true);

  // ---------------------------------------------------------------- the score: a drone, a chord for each shot, a sound for each event
  let mix = null, voices = [], droneOn = false, cued = new Set();
  const ac = () => { const A = o.audio && o.audio(); return A && A.ctx ? A : null; };
  function startScore() {
    const A = ac(); if (!A) return; const c = A.ctx; mix = c.createGain(); mix.gain.value = 0; mix.gain.linearRampToValueAtTime(o.audio().on === false ? 0 : 0.5, c.currentTime + 2); mix.connect(c.destination);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180; lp.Q.value = 0.4; const dg = c.createGain(); dg.gain.value = 0.16; lp.connect(dg); dg.connect(mix);
    for (const f of [55, 55.35, 82.5, 110.2]) { const os = c.createOscillator(); os.type = f < 60 ? 'sawtooth' : 'triangle'; os.frequency.value = f; os.connect(lp); os.start(); voices.push(os); }
    droneOn = true;
  }
  const HZ = n => 440 * Math.pow(2, (n - 69) / 12);
  function chord(notes, dur, gain = 0.05, type = 'sine', attack = 1.6) {
    const A = ac(); if (!A || !mix) return; const c = A.ctx, t = c.currentTime;
    for (const n of notes) { const os = c.createOscillator(), g = c.createGain(); os.type = type; os.frequency.value = HZ(n); os.detune.value = (Math.random() - 0.5) * 8;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.setValueAtTime(gain, t + Math.max(attack, dur - 2.2)); g.gain.linearRampToValueAtTime(0, t + dur); os.connect(g); g.connect(mix); os.start(t); os.stop(t + dur + 0.1); }
  }
  function sweep(f0, f1, dur, gain = 0.1, q = 1.2) {   // filtered noise, swept: a whoosh up or a fall down
    const A = ac(); if (!A || !mix) return; const c = A.ctx, t = c.currentTime, n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(); s.buffer = b; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + dur * 0.3); g.gain.linearRampToValueAtTime(0, t + dur); s.connect(f); f.connect(g); g.connect(mix); s.start(t);
  }
  function boom(f = 46, dur = 3, gain = 0.5) { const A = ac(); if (!A || !mix) return; const c = A.ctx, t = c.currentTime, os = c.createOscillator(), g = c.createGain(); os.frequency.setValueAtTime(f * 2.2, t); os.frequency.exponentialRampToValueAtTime(f, t + 0.5);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); os.connect(g); g.connect(mix); os.start(t); os.stop(t + dur + 0.1); }
  function glitch() { for (let k = 0; k < 5; k++) setTimeout(() => sweep(600 + Math.random() * 3000, 200 + Math.random() * 2000, 0.06 + Math.random() * 0.12, 0.12, 6), k * 130 + Math.random() * 80); }
  function grind(dur) { const A = ac(); if (!A || !mix) return; const c = A.ctx, t = c.currentTime, os = c.createOscillator(), am = c.createOscillator(), ag = c.createGain(), g = c.createGain(); os.type = 'sawtooth'; os.frequency.value = 68; am.frequency.value = 23; ag.gain.value = 0.05;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 1.5); g.gain.linearRampToValueAtTime(0, t + dur); am.connect(ag); ag.connect(g.gain); os.connect(g); g.connect(mix); os.start(t); am.start(t); os.stop(t + dur); am.stop(t + dur); }
  const CUES = [   // [seconds into the whole film, what]
    [0.3, () => chord([57, 64, 71, 72], 7.5, 0.045)], [6.8, () => { boom(44, 4, 0.55); sweep(2400, 120, 3.2, 0.12); chord([45, 46, 52], 8, 0.05, 'triangle', 0.4); }],
    [15.2, () => chord([53, 60, 65, 69], 11, 0.05)], [26.2, () => chord([48, 55, 64, 67], 9, 0.05)], [30.8, () => chord([72, 76, 79, 84], 9.5, 0.022, 'sine', 3)],
    [40.2, () => chord([50, 57, 62], 5, 0.045)], [44.6, () => { glitch(); boom(60, 1.2, 0.3); chord([49, 50, 56], 6, 0.04, 'sawtooth', 0.2); }],
    [50.2, () => { sweep(180, 2600, 2.4, 0.11); chord([50, 57, 65, 69], 10, 0.05); }], [60.2, () => { grind(10.5); chord([40, 47, 55], 11, 0.05, 'triangle'); }],
    [71.2, () => { chord([59, 66, 69, 74], 12, 0.04); chord([86, 90, 93], 12, 0.012, 'sine', 4); }], [83.2, () => chord([45, 57, 64, 69, 73], 15, 0.055, 'triangle', 2.5)], [91.8, () => chord([81, 85, 88], 6, 0.02, 'sine', 2)],
  ];
  function stopScore() { const A = ac(); if (mix && A) { const c = A.ctx, m = mix, vs = voices; m.gain.cancelScheduledValues(c.currentTime); m.gain.setValueAtTime(m.gain.value, c.currentTime); m.gain.linearRampToValueAtTime(0, c.currentTime + 1.2); setTimeout(() => { for (const v of vs) { try { v.stop(); } catch (e) {} } try { m.disconnect(); } catch (e) {} }, 1500); } mix = null; voices = []; droneOn = false; }

  // ---------------------------------------------------------------- the shots
  const TUNE = { earthRot: 4.0 };
  let active = false, t = 0, onDone = null, saved = null, ending = 0, shotNow = null;
  const SHIP = new THREE.Vector3(-420, 130, 620), WORM = new THREE.Vector3(2.3, 0.35, -0.6), SHRED = new THREE.Vector3(900, -200, -700), VORT = new THREE.Vector3(-300, 40, -2600);
  const look = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), skyQ = new THREE.Quaternion(), _q = new THREE.Quaternion(), tumble = { ax: new THREE.Vector3(0.3, 1, 0.2).normalize(), w: 0 };
  ship.position.copy(SHIP); worm.position.copy(SHIP).add(WORM); shred.position.copy(SHRED); vortex.position.copy(VORT); vortex.scale.setScalar(520);
  const show = (...objs) => { for (const m of [earth, fleet, ship, worm, shred, vortex, ...junk]) m.visible = objs.includes(m) || (objs.includes('junk') && junk.includes(m)); };
  function frameShot(S, u, ts, dt) {
    const id = S.id;
    navEl.style.opacity = 0; coordEl.style.opacity = 0; titleEl.style.opacity = 0; starU.uGain.value = 1.35; fleetU.uGain.value = 1;
    if (id === 'earth') {   // the lit limb, the cities on the dark side; then they go out and the colour with them
      show(earth); const a = -0.62 + 0.1 * u; cam.position.set(Math.sin(a) * 31, 5 - 2 * u, Math.cos(a) * 31); look.set(-1.5, 0, 0); cam.fov = 38;
      earth.rotation.y = TUNE.earthRot + ts * 0.012; earthU.uOut.value = ease((ts - 6.6) / 3.2); earthU.uDead.value = ease((ts - 8.0) / 5.5);
    } else if (id === 'fleet') {   // the bubbles lifting off the dead Earth and away past us
      show(earth, fleet); earthU.uOut.value = 1; earthU.uDead.value = 1; earth.rotation.y = TUNE.earthRot + 0.2 + ts * 0.012;
      cam.position.set(-13 - 6 * u, 7 + 3 * u, 40 + 9 * u); look.set(-6 - 5 * u, 3 + 3 * u, 6); cam.fov = 42;
      const P = fleetGeo.attributes.position; for (let i = 0; i < NF; i++) { const f = fleetP[i], tt = Math.max(0, ts + 1.5 - f.t0), r = 10.3 + f.v * tt * (0.35 + 0.1 * tt); _a.copy(f.d).multiplyScalar(r).addScaledVector(f.side, Math.sin(tt * 0.5 + i) * 0.6 * f.w * tt); if (tt <= 0) _a.set(0, 0, 0); P.setXYZ(i, _a.x, _a.y, _a.z); } P.needsUpdate = true;
    } else if (id === 'ship') {   // ours, close: the garden under its glass; then what its ground carries
      show(ship, fleet); const a = 0.7 + 0.55 * u, d = 4.2 - 1.3 * ease(u * 1.4), y = 0.9 - 1.05 * ease((ts - 4.2) / 5);
      cam.position.set(SHIP.x + Math.sin(a) * d, SHIP.y + y, SHIP.z + Math.cos(a) * d); look.copy(SHIP).y += -0.1 - 0.12 * ease((ts - 4.2) / 5); cam.fov = 36;
      seedU.uOn.value = ease((ts - 4.6) / 3.5); fleetAway(ts, 0.5);
    } else if (id === 'lost') {   // over the ship's shoulder at the stars; the compass; then it all swings loose
      show(ship); cam.position.set(SHIP.x - 1.6 - 0.3 * u, SHIP.y + 0.5, SHIP.z + 3.6); look.set(SHIP.x + 1.5, SHIP.y + 0.5, SHIP.z - 2); cam.fov = 44; seedU.uOn.value = 0.25; starU.uGain.value = 1.9;
      const lost = ts > 4.5; tumble.w += ((lost ? 0.9 * Math.exp(-(ts - 4.5) * 0.5) + 0.07 : 0) - tumble.w) * Math.min(1, dt * 3);
      navEl.style.opacity = ease(ts / 1.2) * (1 - ease((ts - 8.8) / 1)) * (lost ? 0.55 + 0.45 * Math.round(Math.random() * 0.7 + 0.3 * Math.sin(ts * 31) ** 2) : 1);
      navEl.classList.toggle('lost', lost); navLab.textContent = lost ? 'NAV · NO FIX' : 'NAV · FIX GOOD';
      needle.setAttribute('transform', `rotate(${lost ? (ts - 4.5) * 420 * Math.exp(-(ts - 4.5) * 0.25) + 40 * Math.sin(ts * 3) : 18 + 1.5 * Math.sin(ts * 0.9)})`);
    } else if (id === 'worm') {   // beside the ship, the ring opens; things tumble out of it and across
      show(ship, worm, 'junk'); const a = -0.5 + 0.25 * u; cam.position.set(SHIP.x + 1.1 + Math.sin(a) * 5.2, SHIP.y + 0.9 - 0.3 * u, SHIP.z + Math.cos(a) * 5.2); look.set(SHIP.x + 1.25, SHIP.y + 0.15, SHIP.z - 0.3); cam.fov = 38;
      wormU.uOn.value = ease(ts / 1.6); worm.scale.setScalar(0.2 + 0.8 * ease(ts / 1.4)); worm.lookAt(_a.copy(SHIP).add(_b.set(0, 0.25, 0)));
      threads.material.opacity = 0.5 * ease((ts - 1) / 2);
      for (const m of junk) { const k = ((ts - 2.2 - m.userData.t0) / 3.2); m.visible = k > 0 && k < 1; if (!m.visible) continue;
        _a.copy(worm.position); _b.copy(SHIP).add(look.set(0.42, 0.05, 0.2)); m.position.lerpVectors(_a, _b, ease(k)).addScaledVector(m.userData.off, Math.sin(k * Math.PI)); m.position.y += Math.sin(k * Math.PI) * 0.28; m.quaternion.setFromAxisAngle(m.userData.ax, ts * 2.4 + m.userData.t0); m.scale.setScalar(0.6 + 2.0 * Math.min(1, k * 3) * (1 - 0.6 * k)); }
      look.set(SHIP.x + 1.25, SHIP.y + 0.15, SHIP.z - 0.3);
    } else if (id === 'shred') {   // another ship: bare rock, the shaft, the sparks
      show(shred); const a = 2.3 + 0.5 * u; cam.position.set(SHRED.x + Math.sin(a) * (5.0 - 1.1 * u), SHRED.y + 1.0 + 0.5 * u, SHRED.z + Math.cos(a) * (5.0 - 1.1 * u)); look.copy(SHRED).y += 0.02; cam.fov = 36;
      shred.userData.fan.rotation.y = ts * 9;
    } else if (id === 'world') {   // far off, something turning; and what we know of where
      show(vortex); cam.position.set(-40 + 30 * u, 10, 0 - 260 * u); look.copy(VORT); cam.fov = 40; vortU.uOn.value = ease(ts / 3) * (1 - ease((ts - 10.8) / 1.2)); vortex.lookAt(cam.position); vortex.rotateZ(0.4);
      starU.uGain.value = 0.55;
      coordEl.style.opacity = ease((ts - 8.2) / 0.8) * (1 - ease((ts - 11.2) / 0.8));
      if (ts > 8 && (Math.floor(ts * 8) !== Math.floor((ts - dt) * 8) || !coordEl.textContent)) { const blk = n => `<b>${'&nbsp;'.repeat(n)}</b>`, fl = () => Math.floor(Math.random() * 10);
        coordEl.innerHTML = `WORLD BUILDER<br>α 17<sup>h</sup> 4${blk(1)}<sup>m</sup> ${blk(2)}<sup>s</sup> &nbsp; δ −2${blk(1)}° ${blk(2)}′<br>r ${blk(3)}${fl()} ly &nbsp; · &nbsp; signal lost`; }
    } else if (id === 'home') {   // ours again, going on among the stars; the title
      show(ship, fleet); const a = 3.6 + 0.35 * u, d = 3.1 + 5.5 * ease(u); cam.position.set(SHIP.x + Math.sin(a) * d, SHIP.y + 0.55 + 0.9 * u, SHIP.z + Math.cos(a) * d); look.copy(SHIP).y += 0.05 + 0.5 * ease(u); cam.fov = 36;
      seedU.uOn.value = 0.3; tumble.w += (0.012 - tumble.w) * Math.min(1, dt * 2); fleetAway(ts + 30, 0.25);
      titleEl.style.opacity = 0;
    }
    ship.userData.disk.rotation.z += dt * 0.5; ship.rotation.y = 0.25 * Math.sin(t * 0.05);
    // the words
    let line = null, la = 0; for (const [a, b, txt] of S.lines) if (ts >= a && ts <= b) { line = txt; la = Math.min(1, (ts - a) / 0.7, (b - ts) / 0.7); }
    if (line && capEl.textContent !== line) capEl.textContent = line; capEl.style.opacity = line ? ease(la).toFixed(3) : 0;
    // through black between shots, and in and out of the whole
    const edge = Math.min(ts / 0.8, (S.len - ts) / 0.8, 1); fadeEl.style.opacity = (1 - ease(edge)).toFixed(3);
  }
  function fleetAway(ts, gain) {   // the rest of the fleet, far off and going their own ways
    fleet.position.set(0, 0, 0); fleetU.uGain.value = gain; const P = fleetGeo.attributes.position;
    for (let i = 0; i < NF; i++) { const f = fleetP[i], r = 30 + 140 * fleetSeed[i] + ts * 0.3; _a.copy(SHIP).addScaledVector(f.d, r * (i % 2 ? 1 : -1)).addScaledVector(f.side, 60 * f.w + 20 * Math.sin(i)); _a.y += 30 * Math.sin(i * 2.3); P.setXYZ(i, _a.x, _a.y, _a.z); } P.needsUpdate = true;
  }

  function begin(done) {
    if (active) return; active = true; t = 0; ending = 0; onDone = done || null; cued = new Set(); tumble.w = 0; skyQ.identity(); sky.quaternion.identity(); wormU.uOn.value = 0; vortU.uOn.value = 0; seedU.uOn.value = 0; shotNow = null;
    saved = { exposure: renderer.toneMappingExposure, tone: renderer.toneMapping }; el.classList.add('on'); document.body.classList.add('filming'); fadeEl.style.opacity = 1; capEl.style.opacity = 0;
    startScore(); try { localStorage.setItem(KEY, '1'); } catch (e) {}
  }
  function finish(skipped) {
    if (!active || ending) return; ending = skipped ? 0.7 : 0.01; stopScore();
  }
  function end() {
    active = false; el.classList.remove('on'); document.body.classList.remove('filming'); if (saved) { renderer.toneMappingExposure = saved.exposure; renderer.toneMapping = saved.tone; } const d = onDone; onDone = null; if (d) d();
  }
  /** One frame of it: advance, pose, draw. (main.js calls this in place of the garden's frame while it's on.) */
  function frame(dt) {
    if (!active) return;
    dt = Math.min(dt, 0.1); t += dt; T.value = t;
    if (ending) { ending -= dt; fadeEl.style.opacity = Math.max(+fadeEl.style.opacity, 1 - Math.max(0, ending) / 0.7).toFixed(3); capEl.style.opacity = 0; if (ending <= 0) { end(); return; } }
    else if (t >= FILM_LENGTH) { finish(false); }
    for (let i = 0; i < CUES.length; i++) if (!cued.has(i) && t >= CUES[i][0] && !ending) { cued.add(i); if (t - CUES[i][0] < 1.5) CUES[i][1](); }
    pose(dt); draw();
  }
  function pose(dt) {
    const S = SHOTS.find(s => t < s.t1) || SHOTS[SHOTS.length - 1], ts = Math.min(t, FILM_LENGTH - 0.001) - S.t0;
    if (shotNow !== S) { shotNow = S; if (S.id !== 'lost' && S.id !== 'home') tumble.w = 0; }
    if (!ending) frameShot(S, ts / S.len, ts, dt);
    if (S.id === 'home' && !ending) titleEl.style.opacity = (ease((ts - 9.5) / 2.5) * (1 - ease((ts - 14.2) / 0.8))).toFixed(3);
    if (tumble.w) { _q.setFromAxisAngle(tumble.ax, tumble.w * dt); skyQ.premultiply(_q); sky.quaternion.copy(skyQ); }
    cam.aspect = innerWidth / innerHeight;
    if (cam.aspect < 1.5) cam.fov = Math.min(100, 2 * Math.atan(Math.tan(cam.fov * Math.PI / 360) * 1.5 / cam.aspect) * 180 / Math.PI);   // a phone held upright: keep the width of the shot, and see more above and below
    cam.updateProjectionMatrix(); cam.lookAt(look); cam.updateMatrixWorld();
    sky.position.copy(cam.position); earthU.uCam.value.copy(cam.position); starU.uPR.value = renderer.getPixelRatio();
  }
  function draw() {
    renderer.toneMapping = THREE.NoToneMapping; renderer.setRenderTarget(null); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, cam);
  }
  return {
    get active() { return active; }, frame, play: begin, skip: () => finish(true), length: FILM_LENGTH, tune: TUNE, shots: SHOTS.map(s => [s.id, s.t0, s.t1]),
    /** Seen before (so it isn't played again unasked)? */
    get seen() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } },
    /** For tests: jump to a moment and draw it, without sound. */
    still(at) { if (!active) { active = true; el.classList.add('on'); document.body.classList.add('filming'); saved = { exposure: renderer.toneMappingExposure, tone: renderer.toneMapping }; } ending = 0; tumble.w = 0; t = at; T.value = at; pose(1 / 30); pose(1 / 30); draw(); },
    stop() { if (active) { stopScore(); end(); } },
  };
}
