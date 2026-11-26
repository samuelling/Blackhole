// sphere.js: Brodie, the little sphere. A glass ball the size of a grapefruit with the garden inside it: the brick walls, the loop
// walk, the pools and the canal, the garden's trees and the ones you've planted (they turn up in the glass as you plant them), the
// lamps, and over it all the black hole, a bead with its ring. It floats at your left shoulder, turns to look at you with its two
// small lights, blinks, and glows when it talks.
//
// It keeps you company and it teaches:
//  - written lines: now and then, when you're not busy, it says something (about the garden, the ship and the story, the time of day,
//    what you're holding); the first time, it says hello. Settings turn the chatter down or off, and Pip off altogether.
//  - talk: press I (or the "brodie" button) and type to it. It really converses (Claude Haiku, told where you are and what you're
//    doing) with either of two keys: your own Anthropic API key, pasted into Settings (kept in this browser, sent only to Anthropic),
//    or the garden's, behind the sphere Worker (worker-sphere/). With neither, or offline, it answers from what's written here.
//  - voice: off, the browser's own voice (free), or Brodie's voice, an ElevenLabs voice spoken through the sphere Worker.
// He says "brody" a lot. It's slang.
//  - tutorials: "teach me…" walks you through getting about, planting, the wall, free builds, climbing and guns, a step at a time, each
//    step done when you've actually done it. Ask it in words ("how do I plant?") and it offers the right one.
//
// Players may be children: what Pip says, written or from Haiku, is kind and simple, and if you tell it you're lonely it's glad of you
// and nudges you, gently, toward the people in your life and a room to share the garden in.
import * as THREE from 'three';
import { NAME as PIP, MODEL, systemPrompt, cleanMessages } from './brodie.js';   // (who Brodie is, for Haiku: brodie.js)

// ---------------------------------------------------------------- what it can teach: a step is done when its test is true
// s: the state of play each frame (from main.js); a: what the tutorial has noted since it began (turned, walked...)
const TUTORIALS = [
  { id: 'walk', title: 'getting about', steps: [
    { say: 'Look around: move the mouse (on a touch screen, drag on the right). Turn right round.', done: (s, a) => a.turn > 5 },
    { say: 'Now walk: W A S D or the arrows (or drag on the left). Ten steps or so. Shift runs.', done: (s, a) => a.walked > 10 },
    { say: 'Jump: Space. Gravity here is a bit under half of Earth’s, so it’s a good one.', done: s => s.jumpY > 0.4 },
    { say: 'See yourself from outside: Shift+V.', done: s => s.selfView },
    { say: 'That’s you. Shift+V again to come back behind your eyes.', done: s => !s.selfView },
    { say: 'That’s getting about, brody. ? shows every control, any time.', end: true } ] },
  { id: 'plant', title: 'planting', steps: [
    { say: 'Open the plant list: P (or “plant” on the rail).', done: s => s.planterOpen },
    { say: 'Pick a plant. Trees are at the end, giants too.', done: s => s.planterArmed },
    { say: 'Now click the ground where you want it (tap, on a touch screen).', done: (s, a) => s.planted > a.planted0 },
    { say: 'It grows on the garden’s own seasons. To dig one up, look at it and press X. Q puts the trowel down.', done: s => !s.planterArmed && !s.planterOpen },
    { say: 'Nice one, brody. Your trees turn up in my glass too: look.', end: true } ] },
  { id: 'wall', title: 'the dry stone wall', steps: [
    { say: 'The wall line is pegged out in stints. Walk to one (look for the markers) and press B to begin it.', done: s => s.wallBusy && !s.wallFree },
    { say: 'Point at a stone so the cross is on it, and click to lift it.', done: s => s.holding },
    { say: 'Turn it with the wheel or Q and E, tip it with R, roll it with V. Click again to set it down.', done: s => !s.holding },
    { say: 'Good. Long side into the wall, joints crossed. P puts the stint away as it stands.', done: s => !s.wallBusy },
    { say: 'That’s walling, brody. What you set stays.', end: true } ] },
  { id: 'free', title: 'free builds', steps: [
    { say: 'Away from the wall line, press B to start a free build where you stand.', done: s => s.wallBusy && s.wallFree },
    { say: 'Click a stone in the heaps (or the junk) to lift it. It hangs where you look.', done: s => s.holding },
    { say: 'Bring it near another piece and press J: it sticks where the green line shows. Shake it hard and it comes apart.', done: s => !s.holding },
    { say: 'P puts the build away. That’s free building.', done: s => !s.wallBusy },
    { say: 'Build anything, brody. Gates are nice.', end: true } ] },
  { id: 'climb', title: 'climbing trees', steps: [
    { say: 'Walk straight into a tree trunk and keep walking.', done: s => s.climbH != null },
    { say: 'W climbs, S goes down, A and D go round. Climb a couple of metres.', done: s => s.climbH != null && s.climbH > 2 },
    { say: 'Space lets go. (Gently does it.)', done: s => s.climbH == null },
    { say: 'That’s climbing, brody. From the top of a giant you can see the whole bubble.', end: true } ] },
  { id: 'guns', title: 'guns', steps: [
    { say: 'There’s a crate of guns just inside the gate. Walk up to it and press Q.', done: s => s.armed },
    { say: 'Click to fire (hold it, for the automatics). Not at the flowers, brody.', done: (s, a) => s.fired > a.fired0 },
    { say: 'Hold the right button to aim down the sight.', done: s => s.aiming > 0.8 },
    { say: 'R reloads.', done: s => s.reloading },
    { say: 'Q puts it away; Shift+Q puts it down.', done: s => !s.armed },
    { say: 'In a room you can shoot each other. If you’d rather not be, Settings → Garden.', end: true } ] },
];
const TUT = Object.fromEntries(TUTORIALS.map(t => [t.id, t]));

// ---------------------------------------------------------------- what it says unprompted (each returns a line, or null if it doesn't fit now)
const pick = a => a[Math.floor(Math.random() * a.length)];
const CHATTER = [
  s => s.hour > 20 || s.hour < 5 ? pick(['Stars are out, brody. They’re the real ones, you know. One day we steer by them.', 'Night, brody. The lamps make the paths look like rivers from in here.', 'Climb a giant tree tonight, brody. You can see every star the ship can.']) : null,
  s => s.hour > 5 && s.hour < 9 ? 'Morning, brody! Dew on everything in my glass too.' : null,
  s => s.armed ? pick(['Brody. Brody. Mind the lupins with that.', 'Shoot a lamp and it stays out till the page loads again, brody. Just saying.', 'Holes in the suits leak, brody. I can hear them hissing.']) : null,
  s => s.planted > 0 ? pick([`Your ${s.planted === 1 ? 'plant is' : s.planted + ' plants are'} coming on, brody. I keep an eye on them.`, 'Trees grow on garden time, brody. Come back in a few garden-years and look up.']) : null,
  s => !s.inRoom && s.alone > 600 ? pick(['Quiet today, brody. Want company? Open a room and send a friend the code. I’ll still be here.', 'Gardens are nicer shared, brody. Just a thought.']) : null,
  s => s.wallBusy ? null : pick(['Every stone in the wall is one somebody chose, brody. That’s what I like about walls.', 'Somewhere out there is World Builder, brody. We’ve only got half its coordinates.',
    'The Shred Hole’s ship lost its Earth blueprint. We still have ours, brody: it’s in the soil under your feet.', 'The wormhole out in the field is how the other ships reach us, brody. Things come through it.',
    'Ship lost its nav centuries ago, brody. We’ll get it back. The stars are still where they were.', 'I’m the whole garden, brody, only small. Everything you do out there, I feel in here.',
    'Brody, the bench at the far end. Best view of the fountain. Trust me.', 'Bored, brody? Plant a giant and come back later. Much later.']),
];
// answers from what's written, for when Haiku isn't there: [pattern, reply or (match) => reply]
const ANSWERS = [
  [/\b(lonely|alone|sad|miss|nobody)\b/i, () => 'I’m really glad you told me, brody. I’m here, and I’ll keep you company. If you can, grab a friend or someone at home to share the garden with: open a room and send them the code.'],
  [/\b(bored|boring|nothing to do)\b/i, () => pick(['Wanna learn something, brody? The wall, free builds, climbing… say “teach me”.', 'Climb the tallest tree and look at the stars, brody. Or plant a giant and wait.', 'Build a gate in a free build, brody. Gates are good for the soul.'])],
  [/\b(plant|flower|seed|garden(ing)?|dig)\b/i, 'Planting? I got you, brody. [[tutorial:plant]]'],
  [/\b(wall|dry ?stone|stint)\b/i, 'Let’s do the wall together, brody. [[tutorial:wall]]'],
  [/\b(build|ultrahand|glue|stick|gate)\b/i, 'Free builds are the best, brody. I’ll walk you through. [[tutorial:free]]'],
  [/\b(climb|tree)\b/i, 'Climbing! Let’s go, brody. [[tutorial:climb]]'],
  [/\b(gun|shoot|reload|aim|fire)\b/i, 'Guns, brody. Careful with the flowers. [[tutorial:guns]]'],
  [/\b(walk|move|look|control|keys?|how do i)\b/i, 'Start with getting about, brody. [[tutorial:walk]]'],
  [/\b(story|ship|probe|nav|world ?builder|shred ?hole|wormhole|earth)\b/i, () => pick(['We’re one of a fleet of probes, brody, looking for somewhere life can carry on. Our nav went centuries ago; the wormhole links us to the other ships.', 'The land under you carries Earth’s blueprint, brody, and a snapshot of everyone in 2027. Worth looking after.'])],
  [/\b(who|what) are you\b/i, `I’m ${PIP}, brody! The garden, only small: I keep a copy of it in my glass. I’m here to keep you company and show you how stuff works.`],
  [/\b(hi|hello|hey)\b/i, () => pick(['Yo brody! Good to see you.', 'Hey brody! What are we doing?'])],
  [/\b(thank|thanks)\b/i, () => pick(['Any time, brody.', 'You got it, brody.'])],
];

export function createSphere(o) {
  const { scene, camera, layout } = o;
  const root = new THREE.Group(); root.name = 'pip'; scene.add(root);
  const R = 0.16;

  // ---------------------------------------------------------------- the glass, its glow, its eyes
  const glass = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 28), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.13, roughness: 0.04, metalness: 0.1, depthWrite: false }));
  glass.renderOrder = 6; root.add(glass);
  const rimU = { uGlow: { value: 0.6 }, uCol: { value: new THREE.Color(0.65, 0.9, 1.0) } };
  const rim = new THREE.Mesh(new THREE.SphereGeometry(R * 1.015, 40, 28), new THREE.ShaderMaterial({ uniforms: rimU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: 'varying vec3 vN, vV; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uGlow; uniform vec3 uCol; varying vec3 vN, vV; void main() { float f = pow(1.0 - abs(dot(vN, vV)), 2.6); gl_FragColor = vec4(uCol * f * uGlow, f * uGlow); }' }));
  rim.renderOrder = 7; root.add(rim);
  const face = new THREE.Group(); root.add(face);   // turned to you
  const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.8, 2.0), toneMapped: false });
  const eyes = [-1, 1].map(s => { const e = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.012, 4, 8), eyeMat); e.position.set(s * 0.035, 0.03, R * 0.985); face.add(e); return e; });

  // ---------------------------------------------------------------- the garden inside: the real one, at 1 to 400
  const mini = new THREE.Group(); root.add(mini); mini.position.y = -0.045;
  const K = 0.105 / 43, CX = 0, CZ = 12, mx = x => (x - CX) * K, mz = z => (z - CZ) * K;
  const M = c => new THREE.MeshLambertMaterial({ color: c, emissive: new THREE.Color(c).multiplyScalar(0.35) });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); mini.add(m); return m; };
  add(new THREE.CylinderGeometry(0.13, 0.115, 0.016, 48), M(0x6f8f4a), 0, -0.008, 0);                                   // the field
  const B = layout.B, bw = (B.x1 - B.x0) * K, bd = (B.z1 - B.z0) * K, bx = mx((B.x0 + B.x1) / 2), bz = mz((B.z0 + B.z1) / 2);
  add(new THREE.BoxGeometry(bw, 0.002, bd), M(0x4f7a35), bx, 0.001, bz);                                                    // the lawns
  const brick = M(0x8a3f2c);
  for (const [w, d, x, z] of [[bw, 0.003, bx, bz - bd / 2], [bw, 0.003, bx, bz + bd / 2], [0.003, bd, bx - bw / 2, bz], [0.003, bd, bx + bw / 2, bz]]) add(new THREE.BoxGeometry(w, 0.007, d), brick, x, 0.0035, z);
  { const pts = layout.loopCurve.getPoints(120).map(p => new THREE.Vector3(mx(p.x), 0.0025, mz(p.z)));                      // the loop walk
    const c = new THREE.CatmullRomCurve3(pts, true); const t = new THREE.Mesh(new THREE.TubeGeometry(c, 160, 0.0012, 4, true), M(0xcdb38a)); t.scale.y = 0.4; mini.add(t); }
  add(new THREE.BoxGeometry(0.0035, 0.002, (layout.B.z1 - 0) * K), M(0xcdb38a), 0, 0.002, mz(layout.B.z1 / 2));            // the long walk to the gate
  const water = new THREE.MeshLambertMaterial({ color: 0x5fb3d9, emissive: new THREE.Color(0x1d5f80) });
  for (const p of layout.pools) add(new THREE.CylinderGeometry(p.r * K, p.r * K, 0.003, 24), water, mx(p.x), 0.002, mz(p.z));
  add(new THREE.BoxGeometry(layout.canal.hw * 2 * K, 0.003, (layout.canal.z1 - layout.canal.z0) * K), water, 0, 0.002, mz((layout.canal.z0 + layout.canal.z1) / 2));
  add(new THREE.ConeGeometry(0.004, 0.012, 8), M(0xbfb8ad), mx(layout.pools[0].x), 0.008, mz(layout.pools[0].z));           // the fountain
  const leaf = M(0x3f7a3a), leafLite = M(0x6fa04a), trunk = M(0x5a4030), gold = new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.5, 0.8), toneMapped: false });
  const treeAt = (x, z, h, giant) => { const g = new THREE.Group(); g.position.set(mx(x), 0, mz(z)); const s = Math.min(0.05, 0.006 + h * K * (giant ? 1 : 1.6));
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.06, s * 0.08, s * 0.5, 5), trunk); tr.position.y = s * 0.25; const cr = new THREE.Mesh(new THREE.IcosahedronGeometry(s * 0.32, 0), Math.random() < 0.5 ? leaf : leafLite); cr.position.y = s * 0.62; g.add(tr, cr); mini.add(g); return g; };
  for (const t of layout.trees) treeAt(t.x, t.z, 12, false);
  for (const [x, z] of layout.lamps) add(new THREE.SphereGeometry(0.0018, 6, 4), gold, mx(x), 0.006, mz(z));
  add(new THREE.BoxGeometry(0.008, 0.008, 0.002), M(0x2a2a2a), mx(layout.gate.x), 0.004, mz(layout.gate.z));               // the gate
  // the trees you've planted: redrawn when they change
  let mine = [], mineKey = '';
  function drawMine() {
    const list = o.arborTrees ? o.arborTrees() : []; const key = list.map(t => `${t.x.toFixed(1)},${t.z.toFixed(1)},${Math.round(t.H)}`).join(';'); if (key === mineKey) return; mineKey = key;
    for (const g of mine) mini.remove(g); mine = list.map(t => treeAt(t.x, t.z, t.H, t.H > 30));
  }
  // over it all, the black hole: a dark bead in its glowing ring
  const hole = new THREE.Group(); hole.position.set(0.02, 0.085, -0.01); root.add(hole);
  hole.add(new THREE.Mesh(new THREE.SphereGeometry(0.011, 16, 12), new THREE.MeshBasicMaterial({ color: 0x000000 })));
  const disk = new THREE.Mesh(new THREE.RingGeometry(0.014, 0.03, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.3, 0.6), side: THREE.DoubleSide, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  disk.rotation.x = Math.PI / 2 - 0.35; hole.add(disk);
  root.traverse(m => { if (m.isMesh) { m.castShadow = false; m.frustumCulled = false; } });

  // ---------------------------------------------------------------- what it says: a bubble beside it, a panel to talk in
  const css = document.createElement('style');
  css.textContent = `#pipBub { position:fixed; z-index:60; max-width:270px; padding:10px 13px; border-radius:14px 14px 14px 4px; background:rgba(16,22,28,.82); color:#eef6ff; font:14px/1.4 "IBM Plex Sans",system-ui,sans-serif; pointer-events:none; opacity:0; transform:translate(0,-100%); transition:opacity .35s; box-shadow:0 2px 14px rgba(0,0,0,.35); border:1px solid rgba(160,220,255,.25); }
    #pipBub .tut { display:block; font:11px "IBM Plex Mono",ui-monospace,monospace; opacity:.6; margin-bottom:4px; }
    #pipBub .acts { display:block; margin-top:8px; } #pipBub button { pointer-events:auto; margin:0 6px 0 0; font:12px "IBM Plex Mono",ui-monospace,monospace; color:#eef6ff; background:rgba(120,190,230,.2); border:1px solid rgba(160,220,255,.4); border-radius:12px; padding:5px 10px; cursor:pointer; }
    #pipPanel { position:fixed; left:calc(16px + env(safe-area-inset-left)); bottom:calc(84px + env(safe-area-inset-bottom)); z-index:61; width:min(340px, calc(100vw - 32px)); background:rgba(14,18,24,.9); color:#eef6ff; border:1px solid rgba(160,220,255,.25); border-radius:16px; font:14px/1.4 "IBM Plex Sans",system-ui,sans-serif; display:none; box-shadow:0 4px 24px rgba(0,0,0,.4); }
    #pipPanel.open { display:block; } #pipPanel header { display:flex; justify-content:space-between; align-items:center; padding:10px 14px 4px; font-weight:600; }
    #pipPanel header small { font:11px "IBM Plex Mono",ui-monospace,monospace; opacity:.55; font-weight:400; margin-left:8px; }
    #pipPanel header button { background:none; border:0; color:#eef6ff; font-size:18px; cursor:pointer; opacity:.7; }
    #pipLog { max-height:min(38vh, 260px); overflow-y:auto; padding:4px 14px; } #pipLog p { margin:6px 0; } #pipLog p.me { text-align:right; opacity:.75; }
    #pipChips { display:flex; flex-wrap:wrap; gap:6px; padding:6px 14px; } #pipChips button { font:12px "IBM Plex Mono",ui-monospace,monospace; color:#eef6ff; background:rgba(120,190,230,.15); border:1px solid rgba(160,220,255,.35); border-radius:12px; padding:5px 10px; cursor:pointer; }
    #pipForm { display:flex; gap:8px; padding:8px 14px 12px; } #pipForm input { flex:1; font:14px "IBM Plex Sans",system-ui,sans-serif; background:rgba(255,255,255,.08); color:#fff; border:1px solid rgba(160,220,255,.3); border-radius:10px; padding:8px 10px; outline:none; }
    #pipForm button { font:13px "IBM Plex Mono",ui-monospace,monospace; color:#0d1418; background:#9fe8ff; border:0; border-radius:10px; padding:0 12px; cursor:pointer; }`;
  document.head.append(css);
  const bub = document.createElement('div'); bub.id = 'pipBub'; document.body.append(bub);
  const panel = document.createElement('div'); panel.id = 'pipPanel';
  panel.innerHTML = `<header><span>${PIP}<small></small></span><button title="close (Esc)">×</button></header><div id="pipLog"></div><div id="pipChips"></div><form id="pipForm"><input placeholder="say something to ${PIP}…" maxlength="400" autocomplete="off"><button>say</button></form>`;
  document.body.append(panel);
  const log = panel.querySelector('#pipLog'), chips = panel.querySelector('#pipChips'), form = panel.querySelector('#pipForm'), input = form.querySelector('input'), sub = panel.querySelector('header small');
  for (const ev of ['mousedown', 'pointerdown', 'click', 'wheel', 'touchstart', 'keydown', 'keyup']) panel.addEventListener(ev, e => { e.stopPropagation(); if (ev === 'keydown' && e.code === 'Escape') close(); });
  panel.querySelector('header button').addEventListener('click', () => close());
  form.addEventListener('submit', e => { e.preventDefault(); const t = input.value.trim(); input.value = ''; if (t) hear(t); });
  function line(text, me) { const p = document.createElement('p'); if (me) p.className = 'me'; p.textContent = text; log.append(p); while (log.children.length > 30) log.firstChild.remove(); log.scrollTop = log.scrollHeight; }
  function setChips(list) { chips.innerHTML = ''; for (const [label, fn] of list) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', fn); chips.append(b); } }
  function homeChips() { setChips([['teach me…', () => setChips(TUTORIALS.map(t => [t.title, () => startTutorial(t.id)]).concat([['back', homeChips]]))], ['I’m bored', () => hear('I’m bored')], [quiet ? 'chat again' : 'hush for now', () => { quiet = !quiet; say(quiet ? 'Okay brody, I’ll keep it down. I’m here if you want me.' : 'Brody! Missed you.'); homeChips(); }]].concat(tut ? [['stop the lesson', () => stopTutorial()]] : [])); }
  let isOpen = false;
  function open() { if (!o.on()) return; isOpen = true; panel.classList.add('open'); if (document.pointerLockElement) document.exitPointerLock(); homeChips(); sub.textContent = online === false && !(o.ownKey && o.ownKey()) ? 'written lines' : ''; setTimeout(() => input.focus(), 30); if (!log.children.length) line(`Yo! I’m ${PIP}. Ask me anything about the garden, or how to do stuff. Or just chat, brody.`); }
  function close() { isOpen = false; panel.classList.remove('open'); input.blur(); }

  // the bubble: a line, gone after a while (longer for longer lines); a lesson's step stays until it's done
  let bubT = 0, talking = 0, bubFixed = false;
  function say(text, opts = {}) {
    const { offer, sticky, tutTitle } = opts;
    bub.innerHTML = ''; if (tutTitle) { const t = document.createElement('span'); t.className = 'tut'; t.textContent = tutTitle; bub.append(t); }
    bub.append(document.createTextNode(text));
    const acts = document.createElement('div'); acts.className = 'acts'; if (offer) bub.append(acts);
    if (offer) for (const [label, fn] of offer) { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', e => { e.stopPropagation(); fn(); }); b.addEventListener('mousedown', e => e.stopPropagation()); b.addEventListener('pointerdown', e => e.stopPropagation()); acts.append(b); }
    bub.style.opacity = 1; bubFixed = !!sticky; bubT = sticky ? 1e9 : 3 + text.length * 0.055 + (offer ? 6 : 0); talking = Math.min(4, 0.6 + text.length * 0.035);
    if (!tutTitle) line(text);
    speak(text.replace(/\[\[.*?\]\]/g, '').trim());
  }

  // his voice: the browser's own (free, a little robotic), or Brodie's (an ElevenLabs voice, through the sphere Worker), which falls
  // back to the browser's if the Worker isn't there
  let audioEl = null, voiceDown = false;
  function browserSay(text) { if (!window.speechSynthesis) return; try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 1.05; u.pitch = 1.3; u.volume = 0.85; speechSynthesis.speak(u); } catch (e) {} }
  async function speak(text) {
    const v = o.voice ? o.voice() : 'off'; if (!text || v === 'off') return;
    if (v === 'brodie' && o.chatUrl && !voiceDown) {
      try {
        const r = await fetch(o.chatUrl + '/speak', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: text.slice(0, 400) }) });
        if (!r.ok) throw new Error('speak ' + r.status);
        const url = URL.createObjectURL(await r.blob()); if (audioEl) { audioEl.pause(); URL.revokeObjectURL(audioEl.src); }
        audioEl = new Audio(url); audioEl.volume = 0.9; await audioEl.play(); return;
      } catch (e) { voiceDown = true; }
    }
    browserSay(text);
  }

  // ---------------------------------------------------------------- tutorials
  let tut = null;   // { T, i, a }
  function startTutorial(id) {
    const T = TUT[id]; if (!T) return false; const s = o.state();
    tut = { T, i: 0, a: { turn: 0, walked: 0, planted0: s.planted, fired0: s.fired, lastYaw: s.yaw, lastX: s.x, lastZ: s.z } };
    if (isOpen) close(); homeChips(); showStep(); return true;
  }
  function stopTutorial() { tut = null; bubT = 0; bubFixed = false; homeChips(); }
  function showStep() { const st = tut.T.steps[tut.i]; say(st.say, { sticky: !st.end, tutTitle: `${tut.T.title} · ${tut.i + 1} of ${tut.T.steps.length}`, offer: st.end ? null : [['skip this step', () => nextStep()], ['stop', () => stopTutorial()]] }); }
  function nextStep() { tut.i++; if (tut.i >= tut.T.steps.length) { tut = null; return; } const st = tut.T.steps[tut.i]; showStep(); if (st.end) { tut = null; bubFixed = false; bubT = 6; homeChips(); } }

  // ---------------------------------------------------------------- talking: Haiku through the sphere Worker, or what's written here
  const history = []; let online = null, busyAsk = false, wroteOnce = false;
  function written(text) {
    for (const [re, a] of ANSWERS) if (re.test(text)) return typeof a === 'function' ? a(text) : a;
    return pick(['I’m listening, brody. Tell me more?', 'Hm! Not sure I follow, brody, but I like hearing it.', 'Want me to teach you something? Say “teach me”.', 'Don’t know that one, brody. The garden might, if you look around.']);
  }
  function act(text) {   // a reply can start a lesson: [[tutorial:id]]
    const m = /\[\[tutorial:([a-z]+)\]\]/.exec(text); const clean = text.replace(/\s*\[\[.*?\]\]\s*/g, ' ').trim();
    if (m && TUT[m[1]]) say(clean || `Let’s do ${TUT[m[1]].title}.`, { offer: [['yes, show me', () => startTutorial(m[1])], ['not now', () => { bubT = 0.5; }]] });
    else say(clean);
    return clean;
  }
  async function hear(text) {
    line(text, true); history.push({ role: 'user', content: text.slice(0, 400) }); while (history.length > 12) history.shift();
    talking = 0.4;
    let reply = null;
    const key = o.ownKey ? o.ownKey() : '';
    if ((key || o.chatUrl) && online !== false && !busyAsk) {
      busyAsk = true; sub.textContent = 'thinking…';
      try {
        const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 15000); let r, j;
        if (key) {   // your own key: straight to Anthropic from this browser
          r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
            body: JSON.stringify({ model: MODEL, max_tokens: 300, system: systemPrompt(context()), messages: cleanMessages(history) }) });
          j = await r.json().catch(() => null); if (j && Array.isArray(j.content)) j = { text: j.content.filter(c => c.type === 'text').map(c => c.text).join(' ') };
          if (r.status === 401) reply = 'That API key didn’t work, brody. Check it in Settings → Garden → Brodie.';
        } else {   // the garden's key, behind the sphere Worker
          r = await fetch(o.chatUrl + '/chat', { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: history, context: context() }) });
          j = await r.json().catch(() => null);
        }
        clearTimeout(tm);
        if (r.ok && j && typeof j.text === 'string' && j.text.trim()) { reply = j.text.trim().slice(0, 700); online = true; }
        else if (r.status === 429) reply = 'Whoa, slow down, brody: I can only talk so fast. Try again in a minute.';
        else if (!reply) online = key ? null : false;
      } catch (e) { online = key ? null : false; }
      busyAsk = false; sub.textContent = online === false && !(o.ownKey && o.ownKey()) ? 'written lines' : '';
    }
    if (!reply) { reply = written(text); if (online === false && !wroteOnce) { wroteOnce = true; reply = '(Can’t reach my thinking part right now, brody, so it’s my written-down lines for a bit.) ' + reply; } }
    const clean = act(reply); history.push({ role: 'assistant', content: clean.slice(0, 700) });
  }
  // what Haiku is told about the moment: where you are, what you're doing, the time
  function context() {
    const s = o.state(), bits = [];
    bits.push(`time: ${Math.floor(s.hour)}:00 (${s.hour > 20 || s.hour < 5 ? 'night' : s.hour < 9 ? 'morning' : s.hour < 17 ? 'day' : 'evening'})`);
    bits.push(`where: ${placeOf(s.x, s.z)}`);
    const doing = []; if (s.armed) doing.push('holding a gun'); if (s.planterArmed) doing.push('holding a trowel, planting'); if (s.wallBusy) doing.push(s.wallFree ? 'in a free build' : 'building the dry stone wall'); if (s.holding) doing.push('lifting a stone'); if (s.climbH != null) doing.push(`climbing a tree, ${Math.round(s.climbH)} m up`); if (s.down) doing.push('shot down, lying on the ground');
    bits.push(`doing: ${doing.join(', ') || 'walking about'}`);
    bits.push(s.inRoom ? `in a room with ${s.others} other${s.others === 1 ? '' : 's'}` : 'alone in their own garden');
    bits.push(`plants they've planted: ${s.planted}`); if (tut) bits.push(`in the lesson: ${tut.T.title}, step ${tut.i + 1}`);
    return bits.join('; ').slice(0, 600);
  }
  function placeOf(x, z) {
    if (!layout.inWalls(x, z)) return Math.hypot(x - (o.heap ? o.heap().x : 50), z - (o.heap ? o.heap().z : 6)) < 14 ? 'out in the field, by the junk heap and the wormhole' : 'out in the field, outside the garden walls';
    const P = [['by the gate', layout.gate.x, layout.gate.z, 7], ['at the fountain', layout.pools[0].x, layout.pools[0].z, 9], ['by the canal', 0, (layout.canal.z0 + layout.canal.z1) / 2, 9], ['on the globe lawn', layout.globeLawn.x, layout.globeLawn.z, 7], ['by the bench at the far end', layout.bench.x, layout.bench.z, 7], ...layout.meadows.map(m => ['in a meadow', m.x, m.z, m.r + 3])];
    let best = 'in the garden', bd = 1e9; for (const [n, px, pz, r] of P) { const d = Math.hypot(x - px, z - pz); if (d < r && d < bd) { bd = d; best = n; } }
    return best;
  }

  // ---------------------------------------------------------------- each frame
  const pos = new THREE.Vector3(), tgt = new THREE.Vector3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(); let placed = false, t = 0, blinkT = 2, chatAt = 90, alone = 0, greeted = false, quiet = false, seen = 0;
  try { greeted = localStorage.getItem('gd.pip.hello') === '1'; } catch (e) {}
  function update(dt) {
    const on = o.on(); root.visible = on; if (!on) { bub.style.opacity = 0; if (isOpen) close(); return; }
    t += dt; const s = o.state();
    // where it floats: at your left shoulder, a little ahead, in view; out of you when you're seen from outside
    if (s.selfView || s.down) tgt.set(s.x + Math.cos(s.yaw) * -0.7, s.gy + 2.0, s.z - Math.sin(s.yaw) * -0.7);
    else tgt.set(-0.5, -0.18, -1.15).applyQuaternion(camera.quaternion).add(camera.position);
    tgt.y += Math.sin(t * 1.3) * 0.03;
    if (!placed || pos.distanceTo(tgt) > 4) { pos.copy(tgt); placed = true; } else pos.lerp(tgt, 1 - Math.exp(-dt * 3.2));   // (far off, after a jump or the space view: just there)
    root.position.copy(pos);
    // it looks at you, and blinks
    camera.getWorldPosition(_v); face.lookAt(_v); face.quaternion.premultiply(_q.copy(root.quaternion).invert());
    blinkT -= dt; const bl = blinkT < 0.12 ? 0.15 : 1; if (blinkT < 0) blinkT = 2 + Math.random() * 4; for (const e of eyes) e.scale.y = bl;
    mini.rotation.y += dt * 0.08; disk.rotation.z += dt * 0.6;
    talking = Math.max(0, talking - dt); rimU.uGlow.value = 0.55 + (talking > 0 ? 0.6 + 0.35 * Math.sin(t * 18) : 0.12 * Math.sin(t * 1.7));
    seen += dt; if (seen > 1.5) { seen = 0; drawMine(); }
    // the bubble follows it on the screen
    _v.copy(pos); _v.y += R * 1.3; _v.project(camera);
    const vis = _v.z < 1 && Math.abs(_v.x) < 1.2 && Math.abs(_v.y) < 1.2;
    bub.style.left = `${Math.min(innerWidth - 280, Math.max(8, (_v.x * 0.5 + 0.5) * innerWidth + 10))}px`; bub.style.top = `${Math.max(90, (-_v.y * 0.5 + 0.5) * innerHeight - 6)}px`;
    if (!bubFixed) { bubT -= dt; if (bubT <= 0) bub.style.opacity = 0; } else bub.style.opacity = 1;
    if (!vis) { bub.style.left = '16px'; bub.style.top = `${Math.round(innerHeight * 0.3)}px`; }   // (off screen: the bubble waits at the left)
    // a lesson: is this step done?
    if (tut) {
      const a = tut.a; let dy = s.yaw - a.lastYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); a.turn += Math.abs(dy); a.lastYaw = s.yaw;
      const dd = Math.hypot(s.x - a.lastX, s.z - a.lastZ); if (dd < 2) a.walked += dd; a.lastX = s.x; a.lastZ = s.z;
      const st = tut.T.steps[tut.i]; if (st && !st.end && st.done(s, a)) { a.planted0 = Math.min(a.planted0, s.planted); nextStep(); }
    }
    // company: hello the first time; now and then a line, when you're not busy
    alone = s.inRoom && s.others > 0 ? 0 : alone + dt; s.alone = alone;
    if (!s.started || tut || isOpen) return;
    if (!greeted && t > 8) { greeted = true; try { localStorage.setItem('gd.pip.hello', '1'); } catch (e) {} say(`Yo brody! I’m ${PIP}: the garden, only small. Press I to talk to me, or I can teach you stuff.`, { offer: [['teach me', () => { open(); setChips(TUTORIALS.map(t => [t.title, () => startTutorial(t.id)]).concat([['back', homeChips]])); }], ['later', () => { bubT = 0.3; }]] }); chatAt = t + 150; return; }
    const chatter = o.chatter ? o.chatter() : 1;
    if (!quiet && chatter > 0 && t > chatAt && !s.wallBusy && !s.planterOpen && !s.busy) {
      chatAt = t + (chatter > 1 ? 90 : 200) + Math.random() * (chatter > 1 ? 90 : 220);
      const lines = CHATTER.map(f => f(s)).filter(Boolean); if (lines.length) say(pick(lines));
    }
  }
  const btn = document.createElement('button'); btn.textContent = PIP.toLowerCase(); btn.title = `${PIP} (I)`; btn.addEventListener('click', e => { e.stopPropagation(); isOpen ? close() : open(); });
  const bar = document.getElementById('btns'); if (bar) bar.insertBefore(btn, document.getElementById('bSettings'));
  return {
    update, open, close, say, hear, startTutorial, stopTutorial,
    get isOpen() { return isOpen; }, get lesson() { return tut ? { id: tut.T.id, step: tut.i } : null; }, tutorials: TUTORIALS.map(t => [t.id, t.title]), context, root, set visibleButton(v) { btn.style.display = v ? '' : 'none'; },
  };
}
