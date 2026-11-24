// gamepad.js: a controller in the hand (PS5 DualSense, Xbox, anything the browser gives the standard layout).
// The left stick walks, and how far you push it is how fast: a lean is a stroll, half way is the ordinary walk, all the way is a run.
// The right stick looks. Everything else is a button doing what a key or the mouse already does, so nothing in the garden has two
// ways of happening: a button press is sent on as that key (or as the click), and what the keys mean is decided where it always was.
// What a button is depends on what you are doing (walking, building, planting, out in the space view): MAP below is the whole of it,
// and the controls sheet (help.js) prints its rows from the same table.
//
// Standard layout: 0 cross/A  1 circle/B  2 square/X  3 triangle/Y  4 L1  5 R1  6 L2  7 R2  8 create/view  9 options/menu
//                  10 L3  11 R3  12-15 d-pad up down left right  16 PS/guide  17 touchpad
const NAMES = { ps: ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →', 'PS', 'Touchpad'],
  xb: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →', 'Guide', 'Share'] };
// each: [button, what it sends, what to call it]. 'click' is the mouse's click; 'help' the controls sheet; a code is that key (held while the button is).
// '+' after a code: it repeats while held (turning a stone). L2 held is Shift for whatever else is pressed.
export const MAP = {
  any: [[9, 'help', 'this sheet'], [10, 'Shift+KeyV', 'see yourself from outside'], [16, 'Shift+KeyG', 'the room panel']],
  walk: [[7, 'click', 'evaporate the void you look at · lift a loose stone'], [0, 'KeyE', 'open a void ahead of you'], [2, 'KeyB', 'build: a stint of wall, or a free build where you stand'], [3, 'KeyP', 'the plant list'],
    [1, 'KeyX', 'vaporize the junk you look at'], [8, 'KeyZ', 'the space view'], [12, 'Digit1', 'wave'], [13, 'Digit2', 'bow'], [14, 'Digit4', 'this way'], [15, 'Digit3', 'beckon'], [4, 'Digit5', 'nod'], [5, 'Digit6', 'arms up'], [11, 'Digit8', 'dance'], [17, 'KeyT', 'night / live time']],
  build: [[7, 'click', 'lift the stone you look at · set it down'], [4, 'KeyQ+', 'turn it left'], [5, 'KeyE+', 'turn it right'], [6, 'shift', 'hold: finer turns'], [12, 'KeyR', 'tip it'], [13, 'KeyV', 'roll it'], [14, 'KeyT', 'length into the wall'], [15, 'KeyC', 'on edge'],
    [0, 'Space', 'hold: press it down'], [1, 'KeyG', 'hold: pass through the other stones'], [2, 'KeyH', 'hearting'], [3, 'KeyN', 'more stone'], [11, 'KeyJ', 'glue (with L2: unglue)'], [8, 'Backspace', 'undo the last stone'], [17, 'KeyP', 'put the work away'], [16, 'Enter', 'twice: finish the stint']],
  plant: [[7, 'click', 'plant where the ring is'], [1, 'KeyX', 'dig up the plant you look at'], [3, 'KeyP', 'the plant list'], [0, 'KeyQ', 'trowel down']],
  space: [[8, 'KeyZ', 'back inside'], [1, 'KeyZ', 'back inside']],
};

/** o: { context(): 'walk'|'build'|'plant'|'space', key(code, down, shift, repeat), click(), help(), start(), started(): bool, hint(text) } */
export function createGamepad(o) {
  const was = [], rep = {}, sent = {}; let index = -1, kind = 'ps', seen = false, used = false;
  const st = { mx: 0, mz: 0, mag: 0, lx: 0, ly: 0, zoom: 0, on: false };
  addEventListener('gamepadconnected', e => { index = e.gamepad.index; kind = /xbox|xinput|microsoft/i.test(e.gamepad.id) ? 'xb' : 'ps'; if (!seen) { seen = true; o.hint && o.hint(`controller connected · ${NAMES[kind][9]} for its controls`); } });
  addEventListener('gamepaddisconnected', e => { if (e.gamepad.index === index) { index = -1; release(); } });
  function release() { for (const k of Object.keys(sent)) { const s = sent[k]; delete sent[k]; if (s.code) o.key(s.code, false, s.shift, false); } was.length = 0; }
  const dead = (x, y, d) => { const m = Math.hypot(x, y); if (m < d) return [0, 0, 0]; const k = Math.min(1, (m - d) / (1 - d)); return [x / m * k, y / m * k, k]; };
  /** Read the controller. Returns the sticks: mx, mz (which way to walk, unit) and mag (how hard, 0..1); lx, ly (look, already curved); zoom (-1..1). */
  function poll(dt, t) {
    st.mx = st.mz = st.mag = st.lx = st.ly = st.zoom = 0; st.on = false;
    const pads = navigator.getGamepads ? navigator.getGamepads() : []; let gp = index >= 0 ? pads[index] : null;
    if (!gp) { for (const p of pads) if (p && p.connected && p.buttons.length >= 10) { gp = p; index = p.index; break; } }
    if (!gp) return st;
    const b = i => gp.buttons[i] ? (gp.buttons[i].pressed || gp.buttons[i].value > 0.5) : false, ax = gp.axes;
    const [x, y, m] = dead(ax[0] || 0, ax[1] || 0, 0.16), [rx, ry] = dead(ax[2] || 0, ax[3] || 0, 0.14);
    if (m > 0) { st.mx = x / m; st.mz = -y / m; st.mag = m; used = true; }
    const curve = v => v * (0.35 + 0.65 * Math.abs(v)); st.lx = curve(rx); st.ly = curve(ry); if (rx || ry) used = true;
    st.on = used;
    if (!o.started()) { if (gp.buttons.some((q, i) => i < 4 && q.pressed) && !was.some(Boolean)) o.start(); for (let i = 0; i < gp.buttons.length; i++) was[i] = b(i); return st; }
    const ctx = o.context(), map = (MAP[ctx] || []).concat(MAP.any), shift = b(6) && ctx === 'build';
    if (ctx === 'space') st.zoom = (gp.buttons[7] ? gp.buttons[7].value : 0) - (gp.buttons[6] ? gp.buttons[6].value : 0);
    for (let i = 0; i < gp.buttons.length; i++) {
      const down = b(i), w = !!was[i]; was[i] = down;
      if (down === w && !(down && rep[i])) continue;
      const row = map.find(r => r[0] === i);
      if (!down) { const s = sent[i]; delete sent[i]; delete rep[i]; if (s && s.code) o.key(s.code, false, s.shift, false); continue; }   // what went down comes up, whatever you are doing by now
      if (!row) continue; used = true;
      let act = row[1], sh = shift; const again = act.endsWith('+'); if (again) act = act.slice(0, -1);
      if (act.startsWith('Shift+')) { act = act.slice(6); sh = true; }
      if (w) { if (t < rep[i]) continue; rep[i] = t + 0.13; o.key(act, true, sh, true); continue; }       // held: a repeat
      if (act === 'click') o.click(); else if (act === 'help') o.help(); else if (act !== 'shift') { o.key(act, true, sh, false); sent[i] = { code: act, shift: sh }; if (again) rep[i] = t + 0.32; }
    }
    return st;
  }
  return { poll, get connected() { return index >= 0; }, get used() { return used; }, get kind() { return kind; }, names: () => NAMES[kind], MAP };
}
