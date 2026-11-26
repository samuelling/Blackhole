// nav.js: star navigation, the first step to getting the ship's navigation back. The sky over the garden is the real one, so the
// old way of finding where you are works here exactly as it did at sea: measure how high three known stars stand, note the time of
// each, and work out the one place those three heights can all be true (navfix.js has the arithmetic, and why it works).
//
// The instrument is a bubble sextant (the kind aircraft navigators used: it carries its own level, a bubble, so it needs no sea
// horizon). The Shred Hole fabricates one (its Instruments shelf) and sends it through the wormhole; it lands by the junk heap.
//
//  - N picks it up, and after that takes it out and puts it away. With it out, the navigator's stars (the 58 of the almanac) are
//    named in the sky. Hold the right button (or L) to put it to your eye: a telescope's narrow field, a cross, and the bubble.
//  - Put the cross on a named star, let the bubble settle into its ring (it swims when you move, as a real one does), and click
//    (or K): that's a sight: the star, its height, the ship's clock. Your reading is as good as your aim and the bubble.
//  - The air in the garden is hazy low down and the lamps glare: from the ground a star swims by most of a degree. Height cures
//    it: every 7 m up cuts it by e, so from the top of a giant tree the instrument is as good as your hands. (A degree of height
//    is 60 nautical miles on the chart: it matters.)
//  - Three sights of three different stars, well spread round the sky, and R (or Enter) works the fix: the chart shows each sight's
//    line of position, the "cocked hat" they leave between them, and the place: the latitude and longitude of the sky the ship is
//    holding. More sights tighten it. A fix within 30 miles restores the ship's first navigation system.
//
// Your body holds the sextant (body.js, as it holds a gun): at your side, and up to your eye; up a tree, with one hand, the other
// on the trunk. In a room the others see you with it. The fix is your own: it isn't sent to the room (it's the place your sky is set to).
import * as THREE from 'three';
import { findNavStars } from './navstars.js';
import { solveFix, ofDate, arc, NM_PER_RAD, fmtLatLon } from './navfix.js';

const TREMOR = 0.2;    // how hard your hands jog the bubble (set so it wanders about 1′: see the test in tools)
const KEY = 'gd.nav.v1', REACH = 2.4, D2R = Math.PI / 180, R2D = 180 / Math.PI, FOV_SCOPE = 12;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3();
const fmtAlt = deg => { const d = Math.floor(Math.abs(deg)), m = (Math.abs(deg) - d) * 60; return `${deg < 0 ? '−' : ''}${d}°${m.toFixed(1).padStart(4, '0')}′`; };
const nice = v => { for (const s of [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]) if (v <= s) return s; return 10000; };

// ---------------------------------------------------------------- the instrument: brass frame, index arm, telescope, mirrors, the bubble
// (its own frame is a gun's: −z forward along the line of sight, +y up, +x right; the handle is on the right, the telescope on the left)
export function buildSextant() {
  const g = new THREE.Group(), plane = new THREE.Group(); plane.rotation.y = Math.PI / 2; g.add(plane);   // plane: +x forward, +y up, +z right
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08a3a, roughness: 0.35, metalness: 0.9 }), dark = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.5, metalness: 0.6 }),
    wood = new THREE.MeshStandardMaterial({ color: 0x4a2f1c, roughness: 0.7 }), glass = new THREE.MeshStandardMaterial({ color: 0xcfe8ff, roughness: 0.05, metalness: 0.9 }),
    silver = new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.3, metalness: 0.9 }), glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 1.6, 0.9), toneMapped: false });
  const add = (geo, mat, x, y, z, rz = 0, parent = plane) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.z = rz; m.castShadow = true; parent.add(m); return m; };
  const R = 0.165, P = [0, 0.1], A = 35 * D2R;   // the arc's radius, the pivot, half the arc
  const arcM = new THREE.Mesh(new THREE.TorusGeometry(R, 0.0045, 6, 28, 2 * A), brass); arcM.position.set(P[0], P[1], 0); arcM.rotation.z = -Math.PI / 2 - A; arcM.castShadow = true; plane.add(arcM);
  const limb = new THREE.Mesh(new THREE.TorusGeometry(R - 0.012, 0.0025, 4, 28, 2 * A), silver); limb.position.copy(arcM.position); limb.rotation.z = arcM.rotation.z; plane.add(limb);   // the graduated limb
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.007, R, 0.006), brass, P[0] + Math.sin(s * A) * R / 2, P[1] - Math.cos(s * A) * R / 2, 0, s * A);   // the frame's two arms
  add(new THREE.BoxGeometry(0.13, 0.006, 0.005), brass, 0, P[1] - R * 0.62, 0);                                                                    // and its brace
  const index = new THREE.Group(); index.position.set(P[0], P[1], 0.005); plane.add(index);                                                        // the index arm, turning about the pivot
  add(new THREE.BoxGeometry(0.009, R + 0.012, 0.004), silver, 0, -(R + 0.012) / 2, 0, 0, index);
  add(new THREE.BoxGeometry(0.03, 0.016, 0.01), brass, 0, -R, 0.002, 0, index);                                                                    // its clamp on the arc
  const drum = add(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 14), silver, 0.018, -R - 0.004, 0.004, 0, index); drum.rotation.x = Math.PI / 2;   // the micrometer drum
  add(new THREE.BoxGeometry(0.03, 0.034, 0.003), glass, 0, 0.004, 0.006, 0.4, index);                                                              // the index mirror, on the pivot
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.008, 14), brass, P[0], P[1], 0.004).rotation.x = Math.PI / 2;
  add(new THREE.BoxGeometry(0.004, 0.03, 0.026), glass, 0.085, 0.03, -0.018);                                                                      // the horizon glass, ahead of the telescope
  const tel = add(new THREE.CylinderGeometry(0.0105, 0.012, 0.1, 14), dark, -0.02, 0.03, -0.018); tel.rotation.z = Math.PI / 2;                    // the telescope
  add(new THREE.CylinderGeometry(0.014, 0.0105, 0.012, 14), dark, -0.074, 0.03, -0.018).rotation.z = Math.PI / 2;                                  // its eyepiece
  add(new THREE.SphereGeometry(0.013, 14, 10), dark, 0.03, 0.062, -0.018); add(new THREE.SphereGeometry(0.0065, 10, 8), glow, 0.03, 0.062, -0.0085);   // the bubble chamber, lit
  const grip = add(new THREE.CapsuleGeometry(0.014, 0.07, 4, 10), wood, 0, 0.02, 0.04);                                                             // the handle, on the right
  for (const y of [-0.02, 0.06]) add(new THREE.BoxGeometry(0.008, 0.008, 0.04), brass, 0, y, 0.022);
  g.userData = { index, grip: new THREE.Vector3(0.04, 0.02, 0), support: new THREE.Vector3(0.0, -0.07, -0.02), eye: new THREE.Vector3(-0.018, 0.03, 0.08) };
  g.traverse(m => { if (m.isMesh) m.frustumCulled = false; });
  return g;
}

/**
 * o: { scene, camera, cat (the star catalogue: [ra°, dec°, mag, b−v] × n), skyM(): Matrix4 (catalogue direction → the scene's), sky(): { J, P },
 *      truth(): { lat, lon } (deg: the place the sky is set to), heightAt, height(): how far your feet are off the ground (m), starGain(), overcast(),
 *      me(): { x, z, gy, yaw, pitch }, body, selfView(), free(), hint(t, ms), audio(), heapSpot(), isTouch, given (start with one: tests),
 *      onFix(fix), onNeed() (N pressed with no sextant), stowGun() }
 */
export function createNav(o) {
  const { scene, camera } = o;
  const stars = o.cat ? findNavStars(o.cat) : [];
  for (const s of stars) s.v = new THREE.Vector3(Math.cos(s.dec * D2R) * Math.cos(s.ra * D2R), Math.cos(s.dec * D2R) * Math.sin(s.ra * D2R), Math.sin(s.dec * D2R));
  let st = { have: false, lying: null, sights: [], fixes: [], fixed: false };
  try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && typeof j === 'object') st = Object.assign(st, j); } catch (e) {}
  if (o.given) st.have = true;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };

  const group = new THREE.Group(); group.name = 'nav'; scene.add(group);
  const sextant = buildSextant(); sextant.matrixAutoUpdate = false; sextant.visible = false; group.add(sextant);
  const ud = sextant.userData;
  let lyingObj = null, fall = null;
  let glint = null;
  function layDown(fromSky) {
    if (lyingObj) { group.remove(lyingObj); lyingObj = null; } if (!st.lying) return;
    const [x, z, yaw] = st.lying, gy = o.heightAt(x, z); lyingObj = buildSextant(); lyingObj.rotation.set(0, yaw, Math.PI / 2 - 0.12); lyingObj.position.set(x, gy + 0.03 + (fromSky ? 6 : 0), z); group.add(lyingObj);
    { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,225,150,1)'); r.addColorStop(0.25, 'rgba(255,200,110,.35)'); r.addColorStop(1, 'rgba(255,190,90,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
      glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); glint.scale.setScalar(0.5); glint.position.set(0, 0, 0.1); lyingObj.add(glint); }   // a glint of brass, so it can be found in the dark
    fall = fromSky ? { vy: 0, floor: gy + 0.03 } : null;
  }
  layDown(false);

  // ---------------------------------------------------------------- the scope, the labels, the log
  const css = document.createElement('style');
  css.textContent = `#navScope { position:fixed; inset:0; z-index:5; pointer-events:none; opacity:0; background:radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 0, rgba(0,0,0,0) 37.5vmin, rgba(0,0,0,.96) 38.5vmin); }
    #navScope .ring { position:absolute; left:50%; top:50%; width:76vmin; height:76vmin; margin:-38vmin 0 0 -38vmin; border-radius:50%; border:2px solid rgba(40,36,28,.9); box-shadow:inset 0 0 6vmin rgba(0,0,0,.6); }
    #navScope .h, #navScope .v { position:absolute; left:50%; top:50%; background:rgba(190,255,210,.55); } #navScope .h { width:60vmin; height:1px; margin-left:-30vmin; } #navScope .v { width:1px; height:60vmin; margin-top:-30vmin; }
    #navScope .lvl { position:absolute; left:50%; top:50%; width:7vmin; height:7vmin; margin:-3.5vmin 0 0 -3.5vmin; border-radius:50%; border:1px solid rgba(190,255,210,.6); }
    #navScope .bub { position:absolute; left:50%; top:50%; width:5vmin; height:5vmin; margin:-2.5vmin 0 0 -2.5vmin; border-radius:50%; border:1.5px solid rgba(190,255,210,.95); background:rgba(160,255,190,.12); box-shadow:0 0 1.5vmin rgba(160,255,190,.35); }
    #navScope .bub.ok { border-color:#fff; background:rgba(200,255,220,.3); }
    #navScope .read { position:absolute; left:0; right:0; top:calc(50% + 40vmin); text-align:center; font:13px/1.5 "IBM Plex Mono",ui-monospace,monospace; color:#cfeeda; text-shadow:0 1px 3px #000; }
    #navScope .read b { color:#fff; font-weight:500; }
    #navTags { position:fixed; inset:0; z-index:4; pointer-events:none; } #navTags span { position:absolute; font:11px "IBM Plex Mono",ui-monospace,monospace; color:rgba(200,240,215,.85); text-shadow:0 1px 3px #000; white-space:nowrap; transform:translate(10px,-50%); }
    #navTags span::before { content:''; position:absolute; left:-17px; top:50%; width:12px; height:12px; margin-top:-7px; border:1px solid rgba(200,240,215,.6); border-radius:50%; }
    #navTags span.on { color:#fff; } #navTags span.on::before { border-color:#fff; box-shadow:0 0 6px rgba(200,255,220,.8); } #navTags span.done { color:rgba(255,220,150,.9); }
    #navHud { position:fixed; left:50%; bottom:calc(74px + env(safe-area-inset-bottom)); transform:translateX(-50%); z-index:6; pointer-events:none; font:12px/1.5 "IBM Plex Mono",ui-monospace,monospace; color:#e9e4da; background:rgba(12,14,12,.6); border-radius:10px; padding:6px 12px; opacity:0; transition:opacity .25s; text-align:center; white-space:nowrap; }
    #navLog { position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); z-index:62; width:min(430px, calc(100vw - 24px)); max-height:calc(100vh - 24px); overflow-y:auto; background:rgba(14,17,15,.95); color:#e9e4da; border:1px solid rgba(190,255,210,.25); border-radius:16px; font:13px/1.5 "IBM Plex Sans",system-ui,sans-serif; display:none; box-shadow:0 6px 30px rgba(0,0,0,.5); }
    #navLog.open { display:block; } #navLog header { display:flex; justify-content:space-between; align-items:center; padding:12px 16px 2px; font:500 22px 'Cormorant Garamond',Georgia,serif; }
    #navLog header button { background:none; border:0; color:#e9e4da; font-size:20px; cursor:pointer; opacity:.7; } #navLog canvas { display:block; margin:6px auto; border-radius:10px; background:#0d1512; }
    #navLog .fix { padding:2px 16px 4px; text-align:center; } #navLog .fix b { display:block; font:500 21px 'Cormorant Garamond',Georgia,serif; color:#fff; } #navLog .fix i { color:#bfe8cc; font-style:normal; }
    #navLog table { width:calc(100% - 32px); margin:6px 16px; border-collapse:collapse; font:11px/1.6 "IBM Plex Mono",ui-monospace,monospace; } #navLog td { padding:0 4px; } #navLog td:nth-child(n+2) { text-align:right; }
    #navLog .why { padding:2px 16px 8px; font-size:12px; opacity:.75; } #navLog .row { display:flex; gap:8px; justify-content:center; padding:6px 16px 14px; }
    #navLog .row button { font:12px "IBM Plex Mono",ui-monospace,monospace; color:#e9e4da; background:rgba(190,255,210,.1); border:1px solid rgba(190,255,210,.35); border-radius:12px; padding:7px 12px; cursor:pointer; }`;
  document.head.append(css);
  const scope = document.createElement('div'); scope.id = 'navScope'; scope.innerHTML = '<div class="ring"></div><div class="h"></div><div class="v"></div><div class="lvl"></div><div class="bub"></div><div class="read"></div>';
  const tags = document.createElement('div'); tags.id = 'navTags'; const hud = document.createElement('div'); hud.id = 'navHud';
  const log = document.createElement('div'); log.id = 'navLog';
  log.innerHTML = '<header><span>Star fix</span><button title="close (Esc)">×</button></header><canvas width="640" height="640" style="width:320px;height:320px"></canvas><div class="fix"></div><table></table><div class="why"></div><div class="row"><button data-a="more">take more sights</button><button data-a="clear">start over</button></div>';
  document.body.append(tags, scope, hud, log);
  const bubEl = scope.querySelector('.bub'), readEl = scope.querySelector('.read');
  for (const ev of ['mousedown', 'pointerdown', 'click', 'wheel', 'touchstart', 'touchend']) log.addEventListener(ev, e => e.stopPropagation());
  log.querySelector('header button').addEventListener('click', () => closeLog());
  log.querySelector('[data-a=more]').addEventListener('click', () => closeLog());
  log.querySelector('[data-a=clear]').addEventListener('click', () => { st.sights = []; save(); closeLog(); o.hint('sights cleared · three stars, well apart', 3000); });
  const tagPool = []; const tag = i => { while (tagPool.length <= i) { const s = document.createElement('span'); tags.append(s); tagPool.push(s); } return tagPool[i]; };

  // ---------------------------------------------------------------- sound: a click for a sight, a small chord for a fix
  function tone(f, t0, dur, gain = 0.08, type = 'sine') { const A = o.audio && o.audio(); if (!A || !A.ctx || !A.master) return; const ac = A.ctx, osc = ac.createOscillator(), g = ac.createGain(); osc.type = type; osc.frequency.value = f;
    g.gain.setValueAtTime(0, ac.currentTime + t0); g.gain.linearRampToValueAtTime(gain, ac.currentTime + t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, ac.currentTime + t0 + dur); osc.connect(g); g.connect(A.master); if (A.send) g.connect(A.send); osc.start(ac.currentTime + t0); osc.stop(ac.currentTime + t0 + dur + 0.05); }

  // ---------------------------------------------------------------- state in the hand
  let out = false, want = false, raise = 0, spec = null, lastYaw = null, lastPitch = 0, logOpen = false, target = null, hintFor = null, lastAlt = 30;
  const bub = { x: 0, y: 0, vx: 0, vy: 0 };
  const seeing = () => 45 * Math.exp(-Math.max(0, o.height()) / 7);   // arcminutes: how much a star swims in the garden's low air, from this height
  const starsUp = () => o.starGain() > 0.45 && o.overcast() < 0.7;
  function dirOf(s, outV) { return outV.copy(s.v).applyMatrix4(o.skyM()).normalize(); }
  function takeOut(on) {
    if (on && !st.have) return; out = on; want = false; if (on && o.stowGun) o.stowGun();
    tone(on ? 880 : 660, 0, 0.08, 0.04, 'triangle');
    if (on) o.hint(starsUp() ? `sextant out · ${o.isTouch ? '“raise”' : 'hold the right button (or L)'} to put it to your eye · the navigator’s stars are named` : 'sextant out · but the stars aren’t: wait for a clear night (T makes it night)', 6000);
    if (!on) closeLog();
  }
  function pickUp() { st.have = true; st.lying = null; layDown(false); save(); takeOut(true); o.hint('a bubble sextant · N takes it out and puts it away · find three named stars, well apart, from as high as you can climb', 9000); }
  function sight() {
    if (!starsUp()) { o.hint('no stars to shoot: wait for a clear night (T makes it night)', 3500); return; }
    if (!target) { o.hint('put the cross on a named star', 2500); return; }
    const s = target.s, sk = o.sky(), aim = Math.asin(Math.max(-1, Math.min(1, camera.getWorldDirection(_d).y))) * R2D;
    if (target.alt < 8) { o.hint(`${s.name} is too low: under 8° the air is too thick to trust`, 3500); return; }
    const hz = seeing(), swim = (Math.random() + Math.random() + Math.random() - 1.5) * 1.15 * hz / 60;                       // the star swimming in the low air (deg)
    const aimed = o.isTouch ? target.alt + (aim - target.alt) * 0.3 : aim;                                                     // (a finger is a blunt pointer: touch is helped)
    const Ho = aimed + bub.y + swim, [ra, dec] = ofDate(s.ra, s.dec, sk.P);
    st.sights.push({ name: s.name, ra, dec, J: sk.J, Ho: Ho * D2R, h: Math.round(o.height()), at: Date.now() }); if (st.sights.length > 12) st.sights.shift(); save();
    tone(1320, 0, 0.06, 0.06, 'square'); tone(1760, 0.07, 0.09, 0.04, 'square');
    const kinds = new Set(st.sights.map(q => q.name)).size, off = Math.hypot(bub.x, bub.y);
    o.hint(`${s.name}: ${fmtAlt(Ho)}${off > 0.12 ? ' · (the bubble was off: let it settle)' : ''}${hz > 12 ? ` · the haze down here is worth ±${Math.round(hz)}′: climb` : ''} · ${kinds >= 3 ? `${o.isTouch ? '“work the fix”' : 'R'} works the fix` : `${3 - kinds} more star${kinds === 2 ? '' : 's'}`}`, 6000);
  }

  // ---------------------------------------------------------------- the fix, and its chart
  function workFix() {
    const kinds = new Set(st.sights.map(q => q.name)).size;
    if (kinds < 3) { o.hint(`a fix wants three different stars, well apart round the sky · you have ${kinds}`, 4500); return null; }
    const f = solveFix(st.sights); if (!f) return null;
    const T = o.truth(), errNm = arc(f.lat, f.lon, T.lat * D2R, T.lon * D2R) * NM_PER_RAD, spreadNm = f.spread * NM_PER_RAD, rmsNm = f.rms * NM_PER_RAD;
    const tight = spreadNm <= 40 || st.sights.length >= 6;   // what the navigator can see of it: lines that cross close, or enough of them to average
    const good = errNm <= 30 && f.hdop < 3.5 && tight, grade = f.rms > 3 * D2R ? 'wrong' : errNm <= 10 && f.hdop < 3.5 ? 'fine' : good ? 'good' : errNm <= 150 ? 'rough' : 'lost';
    const fix = { lat: f.lat * R2D, lon: f.lon * R2D, spreadNm, rmsNm, hdop: f.hdop, n: st.sights.length, grade, good, at: Date.now() };
    st.fixes.push({ lat: +fix.lat.toFixed(3), lon: +fix.lon.toFixed(3), spreadNm: Math.round(spreadNm), grade, at: fix.at }); if (st.fixes.length > 8) st.fixes.shift();
    const first = good && !st.fixed; if (good) st.fixed = true; save();
    drawChart(f, fix); showLog(f, fix, first);
    if (good) { tone(523, 0, 0.9, 0.06); tone(659, 0.12, 0.9, 0.06); tone(784, 0.24, 1.1, 0.06); tone(1047, 0.4, 1.4, 0.05); } else tone(220, 0, 0.5, 0.06, 'triangle');
    if (o.onFix) o.onFix(Object.assign({ first }, fix));
    return fix;
  }
  const COLS = ['#ffd27a', '#8fd8ff', '#ff9bb0', '#b6f09a', '#d9b3ff', '#ffb37a', '#9af0e0', '#f0e68c'];
  function drawChart(f, fix) {
    const c = log.querySelector('canvas'), g = c.getContext('2d'), W = c.width, C = W / 2;
    const dmax = Math.max(...f.lops.map(l => Math.abs(l.d))) * NM_PER_RAD, half = nice(Math.max(8, dmax * 1.5, fix.spreadNm * 0.9)), k = (C - 40) / half;   // px per nm
    g.fillStyle = '#0d1512'; g.fillRect(0, 0, W, W);
    g.strokeStyle = 'rgba(190,255,210,.12)'; g.lineWidth = 1; g.font = '18px "IBM Plex Mono", monospace'; g.fillStyle = 'rgba(190,255,210,.45)'; g.textAlign = 'left';
    for (const r of [half / 2, half]) { g.beginPath(); g.arc(C, C, r * k, 0, 6.3); g.stroke(); g.fillText(`${r} nm`, C + 5, C - r * k - 4); }
    g.beginPath(); g.moveTo(C, 30); g.lineTo(C, W - 30); g.moveTo(30, C); g.lineTo(W - 30, C); g.stroke(); g.textAlign = 'center'; g.fillText('N', C, 24);
    // the cocked hat: the patch the crossings enclose
    if (f.crossings.length >= 3) { const pts = f.crossings.map(([e, n]) => [C + e * NM_PER_RAD * k, C - n * NM_PER_RAD * k]), cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      pts.sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx)); g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fillStyle = 'rgba(255,255,255,.13)'; g.fill(); }
    // each sight's line of position: square to the star's bearing, (Ho − Hc) miles toward it
    const names = [...new Set(st.sights.map(q => q.name))];
    f.lops.forEach((l, i) => {
      const col = COLS[names.indexOf(st.sights[i].name) % COLS.length], d = l.d * NM_PER_RAD * k, sx = Math.sin(l.az), sy = -Math.cos(l.az), px = C + sx * d, py = C + sy * d, L = W;
      g.strokeStyle = col; g.lineWidth = 2.5; g.globalAlpha = 0.9; g.beginPath(); g.moveTo(px - sy * L, py + sx * L); g.lineTo(px + sy * L, py - sx * L); g.stroke();
      g.globalAlpha = 1; });
    names.forEach((nm, j) => {   // each star's name out along its bearing, with an arrow toward it
      const i = st.sights.findIndex(q => q.name === nm), l = f.lops[i], sx = Math.sin(l.az), sy = -Math.cos(l.az), r = C - 34, x = C + sx * r, y = C + sy * r;
      g.fillStyle = COLS[j % COLS.length]; g.font = '500 19px "IBM Plex Mono", monospace'; g.textAlign = sx > 0.3 ? 'right' : sx < -0.3 ? 'left' : 'center'; g.fillText(nm, Math.max(8, Math.min(W - 8, x)), Math.max(22, Math.min(W - 10, y)));
    });
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(C, C, 7, 0, 6.3); g.moveTo(C - 14, C); g.lineTo(C + 14, C); g.moveTo(C, C - 14); g.lineTo(C, C + 14); g.stroke();
  }
  function showLog(f, fix, first) {
    const names = [...new Set(st.sights.map(q => q.name))];
    const word = { fine: 'A navigator’s fix.', good: 'Position fixed.', rough: 'A rough fix.', lost: 'Not a fix yet.', wrong: 'These sights don’t agree.' }[fix.grade];
    log.querySelector('.fix').innerHTML = `<b>${fmtLatLon(fix.lat, fix.lon)}</b>the sky the ship is holding<br><i>${word}</i> Your lines cross within ${fix.spreadNm < 1 ? 'a mile' : Math.round(fix.spreadNm) + ' nautical miles'}.${first ? '<br><i>The ship’s first navigation system is back.</i>' : ''}`;
    log.querySelector('table').innerHTML = '<tr style="opacity:.6"><td>star</td><td>height</td><td>from</td><td>line</td></tr>' + st.sights.map((q, i) => { const d = f.lops[i].d * NM_PER_RAD; return `<tr><td style="color:${COLS[names.indexOf(q.name) % COLS.length]}">${q.name}</td><td>${fmtAlt(q.Ho * R2D)}</td><td>${q.h} m up</td><td>${Math.abs(d) < 0.5 ? 'on it' : `${Math.abs(d).toFixed(0)} nm ${d > 0 ? 'toward' : 'away'}`}</td></tr>`; }).join('');
    const tips = [];
    if (fix.grade === 'wrong') tips.push('One of them is probably not the star it was taken for. Start over.');
    if (fix.hdop >= 3.5) tips.push('Your stars are all in one part of the sky, so the lines cross at a thin angle and the fix slides along them. Pick stars in different directions: a third of the way round from each other is ideal.');
    if (fix.grade !== 'fine' && fix.grade !== 'wrong' && st.sights.some(q => q.h < 12)) tips.push('Sights from low down swim in the haze. Climb: from 15 m a star holds still to a few miles; from the ground, tens of miles.');
    if (fix.grade === 'rough' || fix.grade === 'lost') tips.push('Let the bubble settle in its ring before each sight, and take several: more lines average the errors out.');
    if (!tips.length) tips.push(fix.grade === 'fine' ? 'Each line is one star’s verdict: you are somewhere along it. Where they cross is where you are.' : 'More sights tighten it. Under ten miles is a navigator’s fix.');
    log.querySelector('.why').textContent = tips.join(' ');
    logOpen = true; log.classList.add('open'); if (document.pointerLockElement) document.exitPointerLock();
  }
  function closeLog() { logOpen = false; log.classList.remove('open'); }

  // ---------------------------------------------------------------- input
  function key(code, down) {
    if (logOpen) { if (down && (code === 'Escape' || code === 'Enter' || code === 'KeyR' || code === 'KeyN')) { closeLog(); return true; } return false; }
    if (!o.free()) return false;
    if (code === 'KeyN' && down) {
      if (!st.have) { if (nearLying()) pickUp(); else if (o.onNeed) o.onNeed(); return true; }
      takeOut(!out); return true;
    }
    if (!out) return false;
    if (code === 'KeyL') { if (o.isTouch) { if (down) want = !want; } else want = down; return true; }
    if (code === 'KeyK') { if (down) { if (raise > 0.8) sight(); else o.hint('put it to your eye first', 2000); } return true; }
    if ((code === 'KeyR' || code === 'Enter') && down) { workFix(); return true; }
    if (code === 'KeyQ' && down) { takeOut(false); return true; }
    return false;
  }
  function mouse(button, down) {
    if (!out || logOpen || !o.free()) return false;
    if (button === 2) { want = down; return true; }
    if (button === 0) { if (down) { if (raise > 0.8) sight(); else o.hint('hold the right button to put it to your eye', 2500); } return true; }
    return false;
  }
  addEventListener('keydown', e => { if (e.code === 'Escape' && logOpen) closeLog(); });
  function nearLying() { if (!st.lying) return false; const me = o.me(); return Math.hypot(st.lying[0] - me.x, st.lying[1] - me.z) < REACH; }

  // ---------------------------------------------------------------- each frame
  const offLow = new THREE.Vector3(0.13, -0.25, -0.3), offEye = new THREE.Vector3(-ud.eye.x, -ud.eye.y, -ud.eye.z - 0.02);
  function holdSpec(sp, k) {
    if (!sp) sp = { off: new THREE.Vector3(), rot: new THREE.Euler(), grip: ud.grip, sup: ud.support, lh: null, oneHand: true };
    sp.off.lerpVectors(offLow, offEye, k); sp.rot.set(0.35 * (1 - k), 0.25 * (1 - k), 0); return sp;
  }
  let theirs = new Map(), othersList = [];
  function others(list) { othersList = list; }
  function update(dt) {
    const me = o.me(), free = o.free();
    if (fall && lyingObj) { fall.vy -= 4.2 * dt; lyingObj.position.y += fall.vy * dt; if (lyingObj.position.y <= fall.floor) { lyingObj.position.y = fall.floor; fall = null; tone(180, 0, 0.15, 0.08, 'triangle'); } }
    if (lyingObj && glint) glint.material.opacity = 0.55 + 0.45 * Math.sin(performance.now() * 0.004);
    if (lyingObj && !st.have) { const near = nearLying() && free; if (near !== hintFor) { hintFor = near; if (near) o.hint(`${o.isTouch ? '“sextant”' : 'N'} · pick up the sextant`, 4000); } }
    const holding = out && free;
    raise += ((holding && want ? 1 : 0) - raise) * Math.min(1, dt * 9); if (raise < 0.002) raise = 0;
    // the bubble: it lags when the instrument turns, swings back, and never quite stops (your hands)
    if (holding) {
      const dy = lastYaw == null ? 0 : Math.atan2(Math.sin(me.yaw - lastYaw), Math.cos(me.yaw - lastYaw)) * R2D, dp = lastYaw == null ? 0 : (me.pitch - lastPitch) * R2D; lastYaw = me.yaw; lastPitch = me.pitch;
      bub.x += dy * 0.3; bub.y += dp * 0.3; const W = 5.5, Z = 0.5, tr = TREMOR;
      bub.vx += (-W * W * bub.x - 2 * Z * W * bub.vx) * dt + (Math.random() - 0.5) * tr * Math.sqrt(dt) * 6; bub.vy += (-W * W * bub.y - 2 * Z * W * bub.vy) * dt + (Math.random() - 0.5) * tr * Math.sqrt(dt) * 6;
      bub.x = Math.max(-2, Math.min(2, bub.x + bub.vx * dt)); bub.y = Math.max(-2, Math.min(2, bub.y + bub.vy * dt));
    } else lastYaw = null;
    // held: the body is given the hold, and the instrument goes where the body holds it
    if (o.body && o.body.setArmed && (holding || spec)) {
      if (holding) { spec = holdSpec(spec, raise * raise * (3 - 2 * raise)); o.body.setArmed(true, spec);
        const placed = o.body.gunWorld && o.body.gunWorld(sextant.matrix); sextant.matrixWorldNeedsUpdate = true; sextant.visible = !!placed && (o.selfView() || raise < 0.55);
        ud.index.rotation.z = (lastAlt / 2 - 22) * D2R; }
      else { spec = null; sextant.visible = false; }
    }
    // the navigator's stars, named (with the sextant out); the one under the cross
    let n = 0; target = null;
    if (holding && starsUp() && !logOpen) {
      camera.getWorldDirection(_d); const cosLim = Math.cos((raise > 0.5 ? 8 : 45) * D2R), M = o.skyM(), shown = [];
      for (const s of stars) { dirOf(s, _v); const cd = _v.dot(_d); if (_v.y < 0.1 || cd < cosLim) continue; shown.push({ s, cd, alt: Math.asin(_v.y) * R2D, x: _v.x, y: _v.y, z: _v.z }); }
      shown.sort((a, b) => raise > 0.5 ? b.cd - a.cd : a.s.mag - b.s.mag);
      const best = shown.length ? shown.reduce((a, b) => (b.cd > a.cd ? b : a)) : null, lock = (raise > 0.5 ? 0.6 : 0) * D2R;
      if (best && raise > 0.8 && Math.acos(Math.min(1, best.cd)) < lock) target = best;
      const done = new Set(st.sights.map(q => q.name));
      for (const q of shown.slice(0, raise > 0.5 ? 6 : 9)) {
        _w.set(q.x, q.y, q.z).multiplyScalar(400).add(camera.position).project(camera); if (_w.z > 1 || Math.abs(_w.x) > 1.05 || Math.abs(_w.y) > 1.05) continue;
        const el = tag(n++); el.style.display = ''; el.style.left = `${(_w.x * 0.5 + 0.5) * innerWidth}px`; el.style.top = `${(-_w.y * 0.5 + 0.5) * innerHeight}px`;
        el.textContent = raise > 0.5 ? `${q.s.name} · ${q.s.con}` : q.s.name; el.className = (q === target ? 'on ' : '') + (done.has(q.s.name) ? 'done' : '');
      }
    }
    for (let i = n; i < tagPool.length; i++) tagPool[i].style.display = 'none';
    // the scope
    if (o.body.setHidden) o.body.setHidden(holding && raise > 0.55 && !o.selfView());   // at your eye, your own hands would be all you saw
    scope.style.opacity = o.selfView() ? 0 : Math.max(0, raise * 2 - 1).toFixed(3);
    if (raise > 0.5) {
      const aim = Math.asin(Math.max(-1, Math.min(1, camera.getWorldDirection(_d).y))) * R2D, k = innerHeight / FOV_SCOPE, level = Math.hypot(bub.x, bub.y) < 0.06; lastAlt = aim;
      bubEl.style.transform = `translate(${(-bub.x * k * 0.35).toFixed(1)}px, ${(bub.y * k * 0.35).toFixed(1)}px)`; bubEl.classList.toggle('ok', level);
      const hz = seeing();
      readEl.innerHTML = !starsUp() ? 'no stars: wait for a clear night' : `${target ? `<b>${target.s.name}</b> · ` : ''}height <b>${fmtAlt(aim + bub.y)}</b> · ${level ? 'bubble level' : 'bubble settling…'} · ${hz < 3 ? 'air steady' : `haze ±${Math.round(hz)}′${hz > 8 ? ' (climb)' : ''}`}${target ? ` · ${o.isTouch ? 'tap “sight”' : 'click'}` : ''}`;
    }
    const kinds = new Set(st.sights.map(q => q.name)).size;
    hud.style.opacity = holding && !logOpen && raise < 0.5 ? 1 : 0;
    if (holding && raise < 0.5) hud.textContent = `sextant · ${st.sights.length} sight${st.sights.length === 1 ? '' : 's'} of ${kinds} star${kinds === 1 ? '' : 's'} · ${Math.round(o.height())} m up${kinds >= 3 ? ` · ${o.isTouch ? '“work the fix”' : 'R works the fix'}` : ''}`;
    // the others' sextants, in their hands
    const seen = new Set();
    for (const p of othersList) { if (p.w !== 'sextant' || p.down || !p.body || !p.body.setArmed) continue; seen.add(p.id);
      let t = theirs.get(p.id); if (!t) { t = { prop: buildSextant(), spec: null }; t.prop.matrixAutoUpdate = false; group.add(t.prop); theirs.set(p.id, t); }
      t.spec = holdSpec(t.spec, 0); p.body.setArmed(true, t.spec); const ok = p.body.gunWorld && p.body.gunWorld(t.prop.matrix); t.prop.matrixWorldNeedsUpdate = true; t.prop.visible = !!ok && p.body.root.visible; }
    for (const [id, t] of theirs) if (!seen.has(id)) { group.remove(t.prop); theirs.delete(id); }
  }

  return {
    update, others, key, mouse,
    /** One came through the wormhole (the Shred Hole's Instruments): it falls by the junk heap. */
    arrive() { if (st.have || st.lying) { o.hint('another sextant came through · one is all a navigator needs', 4000); return; }
      const h = o.heapSpot(), a = Math.random() * 6.28; st.lying = [+(h.x + Math.cos(a) * 2.5).toFixed(2), +(h.z + Math.sin(a) * 2.5).toFixed(2), +(Math.random() * 6.28).toFixed(2)]; save(); layDown(true);
      o.hint(`a sextant came through the wormhole · it’s by the heap · ${o.isTouch ? '“sextant”' : 'N'} picks it up`, 8000); },
    get out() { return out && o.free(); }, get have() { return st.have; }, get raised() { return raise; }, get lying() { return st.lying; }, get fixed() { return st.fixed; },
    /** How much the view narrows with it at your eye (1: not at all). */
    get zoom() { return 1 + (FOV_SCOPE / 70 - 1) * raise * raise * (3 - 2 * raise); },
    get sights() { return st.sights; }, get fixes() { return st.fixes; }, get target() { return target && target.s.name; }, get logOpen() { return logOpen; }, closeLog,
    stars, workFix, seeing, give() { st.have = true; save(); }, clear() { st.sights = []; save(); }, putAway() { if (out) takeOut(false); },
    /** For tests: where a navigator's star stands now: { alt, az (from north through east), yaw, pitch (the view that puts the cross on it) }. */
    where(name) { const s = stars.find(q => q.name === name); if (!s) return null; dirOf(s, _v); return { alt: Math.asin(_v.y) * R2D, az: Math.atan2(_v.x, -_v.z) * R2D, yaw: Math.atan2(-_v.x, -_v.z), pitch: Math.asin(_v.y) }; },
    bubble: bub,
  };
}
