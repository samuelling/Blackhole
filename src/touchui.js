// touchui.js: the garden on an iPad or a phone. Fingers have no keys, so everything the keys do is a button here.
//
// Two places for buttons, both in reach of a thumb:
//  - the mode rail, down the right edge: walk, plant, build, space view, see yourself, gestures. One tap goes into a mode; tapping the
//    lit one comes back to walking. It is always the same six, in the same order, so they are found by where they are.
//  - the action pad, above the bottom-right corner: what you can do in the mode you are in (jump and open a void when walking; lift,
//    turn, tip, roll, press and the rest while building; the plant list and done while planting). It changes as the mode does.
// The left half of the screen stays the walking stick (now drawn under your thumb), the right half still looks.
//
// Like the controller (gamepad.js), every button sends the key or the click it stands for, so nothing here has a second way of
// happening and what a key means is still decided in one place.

const CSS = `
#tui { position:fixed; inset:0; pointer-events:none; z-index:8; font-family:'IBM Plex Mono',ui-monospace,Menlo,monospace; -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; }
#tui button { pointer-events:auto; touch-action:none; -webkit-tap-highlight-color:transparent; font:inherit; color:#e9e4da; cursor:pointer;
  background:rgba(10,12,16,.55); border:1px solid rgba(233,228,218,.22); backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); }
#tui button.on { background:rgba(120,235,255,.24); border-color:rgba(120,235,255,.75); color:#fff; }
#tui button:active, #tui button.held { background:rgba(255,255,255,.22); }
#tui .rail { position:absolute; right:calc(10px + env(safe-area-inset-right)); top:50%; transform:translateY(-50%); display:flex; flex-direction:column; gap:10px; }
#tui .rail button { width:60px; height:60px; border-radius:18px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; padding:0; }
#tui .rail i { font-style:normal; font-size:22px; line-height:1; }
#tui .rail span { font-size:8px; letter-spacing:.12em; text-transform:uppercase; opacity:.8; }
#tui .pad { position:absolute; right:calc(84px + env(safe-area-inset-right)); bottom:calc(70px + env(safe-area-inset-bottom)); display:grid; grid-template-columns:repeat(var(--cols, 2), 78px); grid-auto-rows:46px; gap:7px; }
#tui .pad button { width:100%; height:100%; border-radius:14px; padding:0 6px; font-size:9.5px; letter-spacing:.08em; text-transform:uppercase; line-height:1.15; }
#tui .pad button.big { grid-row:span 2; border-radius:26px; font-size:12px; background:rgba(120,235,255,.16); border-color:rgba(120,235,255,.5); }
#tui .tray { position:absolute; right:calc(84px + env(safe-area-inset-right)); top:50%; transform:translateY(-50%); display:none; grid-template-columns:repeat(2, auto); gap:8px; }
#tui .tray.open { display:grid; }
#tui .tray button { height:46px; min-width:110px; border-radius:14px; font-size:10px; letter-spacing:.1em; text-transform:uppercase; }
#tui .stick { position:absolute; width:120px; height:120px; margin:-60px 0 0 -60px; border-radius:50%; border:1.5px solid rgba(233,228,218,.35); background:rgba(0,0,0,.12); display:none; }
#tui .stick b { position:absolute; left:50%; top:50%; width:48px; height:48px; margin:-24px 0 0 -24px; border-radius:50%; background:rgba(233,228,218,.35); }
body.tui #btns #bVoid, body.tui #btns #bSpace, body.tui #btns #bPlant { display:none; }    /* (now on the rail and the pad) */
body.tui #btns { right:calc(84px + env(safe-area-inset-right)); bottom:calc(10px + env(safe-area-inset-bottom)); }
body.tui #btns button { padding:11px 14px; }
body.tui #aim.on { width:14px; height:14px; margin:-7px 0 0 -7px; border:1.5px solid rgba(233,228,218,.8); }
@media (max-height:500px) { #tui .rail button { width:48px; height:48px; border-radius:14px; } #tui .rail i { font-size:18px; } #tui .rail span { display:none; } #tui .pad { bottom:calc(58px + env(safe-area-inset-bottom)); right:calc(70px + env(safe-area-inset-right)); } #tui .pad { grid-template-columns:repeat(var(--cols, 2), 66px); grid-auto-rows:40px; gap:5px; } }
`;

// what each mode's pad holds: [label, what it sends, how it behaves]. 'click' is the tap where you are looking; '+' repeats while held;
// 'hold' keeps the key down while the finger is; 'shift' is a toggle for finer turns.
const PADS = {
  walk: [['jump / stand', 'Space', 'big'], ['crouch · hold: lie down', 'KeyC', 'hold'], ['open a void', 'KeyE'], ['vaporize junk', 'KeyX'], ['lift a stone', 'click'], ['gun: pick up / draw', 'KeyQ'], ['sextant', 'KeyN']],
  sextant: [['sight', 'KeyK', 'big'], ['raise / lower', 'KeyL'], ['work the fix', 'KeyR'], ['put away', 'KeyN'], ['jump', 'Space']],
  armed: [['fire', 'KeyK', 'bighold'], ['aim', 'KeyL', 'hold'], ['reload', 'KeyR'], ['crouch · hold: lie down', 'KeyC', 'hold'], ['put away', 'KeyQ'], ['jump / stand', 'Space']],
  build: [['lift / set', 'click', 'big'], ['turn ⟲', 'KeyQ', 'repeat'], ['turn ⟳', 'KeyE', 'repeat'], ['fine', 'shift', 'toggle'],
    ['tip', 'KeyR'], ['roll', 'KeyV'], ['length in', 'KeyT'], ['on edge', 'KeyC'], ['press', 'Space', 'hold'], ['pass through', 'KeyG', 'hold'],
    ['hearting', 'KeyH'], ['more stone', 'KeyN'], ['glue', 'KeyJ'], ['undo', 'Backspace'], ['finish (twice)', 'Enter'], ['put away', 'KeyP']],
  free: [['lift / let go', 'click', 'big'], ['turn ⟲', 'KeyQ'], ['turn ⟳', 'KeyE'], ['fine', 'shift', 'toggle'],
    ['tip', 'KeyR'], ['roll', 'KeyV'], ['nearer', 'Minus', 'repeat'], ['farther', 'Equal', 'repeat'], ['stick', 'KeyJ'], ['unglue', 'KeyJ', 'sh'],
    ['pass through', 'KeyG', 'hold'], ['more stone', 'KeyN'], ['undo', 'Backspace'], ['put away', 'KeyP']],
  plant: [['plant list', 'KeyP', 'big'], ['dig up', 'KeyX'], ['done', 'KeyQ']],
  space: [],
};
const GESTURES = [['wave', '1'], ['bow', '2'], ['beckon', '3'], ['this way', '4'], ['nod', '5'], ['arms up', '6'], ['laugh', '7'], ['dance', '8'], ['chicken', '9'], ['stretch', '0']];

/** o: { context(): 'walk'|'build'|'plant'|'space', key(code, down, shift, repeat), click(), selfView(): bool, started(): bool } */
export function createTouchUI(o) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const root = document.createElement('div'); root.id = 'tui'; document.body.appendChild(root); document.body.classList.add('tui');
  // iOS: no pinch-zoom of the page, no double-tap zoom, no long-press callouts, no rubber-banding
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', e => { if (e.touches.length > 1 || e.target === document.body) e.preventDefault(); }, { passive: false });
  let lastEnd = 0; document.addEventListener('touchend', e => { const n = performance.now(); if (n - lastEnd < 320 && e.target.closest && e.target.closest('#tui')) e.preventDefault(); lastEnd = n; }, { passive: false });

  const press = (code, shift = false) => { o.key(code, true, shift, false); o.key(code, false, shift, false); };
  let fine = false;
  // a button that sends a key: tapped, held (down until lifted) or repeating while held
  function wire(b, code, how) {
    let timer = 0;
    const down = e => { e.preventDefault(); e.stopPropagation(); b.classList.add('held'); if (navigator.vibrate) try { navigator.vibrate(8); } catch (_) {}
      if (code === 'click') { o.click(); return; }
      if (how === 'toggle') { fine = !fine; b.classList.toggle('on', fine); return; }
      if (how === 'sh') { o.key(code, true, true, false); o.key(code, false, true, false); return; }   // with Shift
      o.key(code, true, fine, false);
      if (how === 'repeat') { let first = true; timer = setInterval(() => { o.key(code, true, fine, true); if (first) first = false; }, 130); }
      if (how !== 'hold' && how !== 'repeat') o.key(code, false, fine, false); };
    const up = e => { e.preventDefault(); b.classList.remove('held'); if (timer) { clearInterval(timer); timer = 0; } if (code !== 'click' && (how === 'hold' || how === 'repeat')) o.key(code, false, fine, false); };
    b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
    b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
  }

  // the mode rail
  const rail = document.createElement('div'); rail.className = 'rail'; root.appendChild(rail);
  const tray = document.createElement('div'); tray.className = 'tray'; root.appendChild(tray);
  const MODES = [
    ['walk', '⟡', 'walk', () => leaveMode()],
    ['plant', '❀', 'plant', () => { leaveMode(); press('KeyP'); }],
    ['build', '▦', 'build', () => { leaveMode(); press('KeyB'); }],
    ['space', '◯', 'space', () => { leaveMode(); press('KeyZ'); }],
    ['self', '☺', 'me', () => press('KeyV', true)],
    ['gest', '✋', 'gesture', () => tray.classList.toggle('open')],
  ];
  function leaveMode() {   // back to walking from whatever you are in
    const c = o.context(); tray.classList.remove('open');
    if (c === 'space') press('KeyZ'); else if (c === 'build' || c === 'free') press('KeyP'); else if (c === 'plant') { press('KeyQ'); if (o.context() === 'plant') press('KeyP'); }   // trowel down, and shut the list if it is open
  }
  const railB = {};
  for (const [id, icon, label, fn] of MODES) {
    const b = document.createElement('button'); b.innerHTML = `<i>${icon}</i><span>${label}</span>`; b.title = label; railB[id] = b; rail.appendChild(b);
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (!o.started()) return;
      const c = o.context(); if (id !== 'walk' && id !== 'self' && id !== 'gest' && (c === id || (id === 'build' && c === 'free'))) leaveMode(); else fn(); refresh(true); });
    b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
  }
  for (const [label, d] of GESTURES) { const b = document.createElement('button'); b.textContent = label; tray.appendChild(b); wire(b, 'Digit' + d); b.addEventListener('pointerup', () => tray.classList.remove('open')); }

  // the action pad, rebuilt when the mode changes
  const pad = document.createElement('div'); pad.className = 'pad'; root.appendChild(pad);
  let shown = null;
  function refresh(force) {
    const c = o.started() ? o.context() : 'none';
    for (const id of ['walk', 'plant', 'build', 'space']) railB[id].classList.toggle('on', c === id || (id === 'build' && c === 'free') || (id === 'walk' && (c === 'armed' || c === 'sextant')));
    railB.self.classList.toggle('on', !!(o.selfView && o.selfView()));
    rail.style.display = o.started() ? '' : 'none';
    if (c === shown && !force) return; shown = c; pad.innerHTML = ''; fine = false;
    const rows = PADS[c] || []; pad.style.setProperty('--cols', c === 'build' || c === 'free' ? 4 : 2);
    for (const [label, code, how] of rows) { const b = document.createElement('button'); b.textContent = label; if (how === 'big' || how === 'bighold') b.className = 'big'; pad.appendChild(b); wire(b, code, how === 'big' ? '' : how === 'bighold' ? 'hold' : how); }
  }
  setInterval(() => refresh(false), 200);

  // the walking stick, drawn where your thumb came down
  const stick = document.createElement('div'); stick.className = 'stick'; stick.innerHTML = '<b></b>'; root.appendChild(stick); const knob = stick.firstChild;
  return {
    refresh,
    /** the left thumb: down at (x0, y0), now at (x, y); null when lifted */
    stick(t) { if (!t) { stick.style.display = 'none'; return; } stick.style.display = 'block'; stick.style.left = t.x0 + 'px'; stick.style.top = t.y0 + 'px';
      let dx = t.x - t.x0, dy = t.y - t.y0; const m = Math.hypot(dx, dy), k = m > 48 ? 48 / m : 1; knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`; },
  };
}
