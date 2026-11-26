// help.js: every control in the garden, on one sheet. ? (or / or F1, or the "controls" button) opens it; Esc or ? again closes it.
// It opens on what you are doing: the sections for where you are now (at the wall, a free build, planting, out in space, in a room)
// come first and are marked, and the rest follow. One list, kept here, so the sheet and the game cannot drift apart unnoticed:
// when a key changes in main.js, walling.js, planter.js or multi.js, change it here.

const K = (...k) => k;   // a row: [keys..., what it does]; a key written 'a|b' is drawn as two caps that do the same thing
const SECTIONS = [
  { id: 'walk', title: 'Walking and looking', rows: [
    K('W|A|S|D', 'arrows', 'walk'), K('Shift', 'run'), K('Space', 'jump (gravity here is a little under half the Earth’s)'), K('climb', 'walk into a tree trunk and keep going: W up, S down, A D round it, Space lets go'), K('mouse', 'look · click the garden first to take the pointer, Esc gives it back'),
    K('Shift+V', 'see yourself from outside'), K('Z', 'the space view: the whole bubble from outside'), K('Shift+F', 'full screen'),
    K('O', 'settings'), K('M', 'sound on / off'), K('F', 'frame rate'), K('?', 'this sheet') ] },
  { id: 'gesture', title: 'Gestures and bearing', rows: [
    K('1', 'wave'), K('2', 'bow'), K('3', 'beckon'), K('4', 'this way'), K('5', 'nod'), K('6', 'arms up'), K('7', 'laugh'), K('8', 'dance'), K('9', 'chicken dance'), K('0', 'stretch'),
    K('Shift+G', 'the room panel: more gestures, how you carry yourself, your suit and its colours') ] },
  { id: 'voids', title: 'Voids', rows: [
    K('E', 'open a void ahead of you'), K('click', 'on a void: evaporate it'), K('X', 'looking at a piece of junk: vaporize it for good') ] },
  { id: 'time', title: 'Time and seasons', rows: [
    K('T', 'night / live time of day'), K('Y', 'season speed: paused, then faster each press'), K('R', 'replant the garden (it fills in over about three years)'),
    K('sliders', 'the bar below: day of the year, and hour of the day') ] },
  { id: 'wall', title: 'Building the wall', note: 'A pegged-out stint of the dry stone wall. Stone comes in a pile; what you set stays.', rows: [
    K('B', 'at a stint: begin it, take it up again, or join whoever is working it'),
    K('click', 'lift the stone you point at · click again to set it down'), K('wheel', 'Q|E', 'turn it · with Shift, finer'),
    K('R', 'tip it'), K('V', 'roll it'), K('T', 'turn its length into the wall'), K('C', 'stand it on edge'),
    K('Space', 'hold: press it down'), K('G', 'hold: pass through the other stones'),
    K('H', 'hearting: pour small stone into the middle'), K('N', 'more stone'), K('Backspace', 'undo the last stone'),
    K('P', 'put the stint away, as it stands'), K('Enter', 'twice: finish the stint · what stands is fixed') ] },
  { id: 'guns', title: 'Guns', note: 'Betamax\'s guns come through the wormhole when the Shred Hole sends them (its Arsenal shelf): they land by the junk heap. For now there\'s also a crate of them just inside the gate.', rows: [
    K('Q', 'pick up the gun you look at (swapping for yours) · draw or put away your own'), K('Shift+Q', 'put it down'),
    K('click', 'fire (hold, for the automatics)'), K('right button', 'aim'), K('R', 'reload'),
    K('rounds', 'leave craters and holes and throw real debris; shoot through a plant and it\'s gone (Settings → Garden puts the garden\'s own back); cut through a tree you planted and it falls; lamps can be shot out'),
    K('in a room', 'others can be shot, and so can you: hits flinch you, hole your suit (it leaks) and crack your visor; down at nothing left, you choose when to get up: E here, G at the gate (Settings → Garden turns being shot off for you)') ] },
  { id: 'free', title: 'Free builds (Ultrahand)', note: 'Anywhere off the wall line: build with stone from the heaps and with the Shred Hole\'s junk, as with Ultrahand in Tears of the Kingdom.', rows: [
    K('B', 'away from the wall: start a free build where you stand, or take up the one that is there'),
    K('click', 'lift from the stone heaps, the junk heap, or the build · it hangs where you look · click lets it go'),
    K('wheel', '-|=', 'nearer / farther'), K('Q|E', 'turn it an eighth · R tip · V roll · with Shift, a twenty-fourth'),
    K('J', 'stick it where the green line shows: it is pulled in, welded, and you hold the lot'), K('shake', 'swing it side to side, fast: it comes apart'), K('Shift+J', 'unglue it'),
    K('G', 'hold: pass through the other pieces'), K('N', 'bring a pile of stone'), K('P', 'put the build away') ] },
  { id: 'plant', title: 'Planting', rows: [
    K('P', 'the plant list · choose one and the trowel is in your hand'), K('click', 'plant where the ring is (red: not there)'),
    K('X', 'trowel in hand: dig up the plant you are looking at · the garden\'s own plants too'), K('Q', 'trowel down') ] },
  { id: 'space', title: 'The space view', rows: [
    K('Z', 'go out, and come back inside'), K('drag', 'turn the view round the bubble'), K('wheel', 'nearer / farther') ] },
  { id: 'room', title: 'Together', note: 'Up to six of you in one garden: that of whoever was in the room first.', rows: [
    K('Shift+G', 'the room: name, suit, colours, who is here'), K('`', 'hold to talk (or tick open mic in the room panel)'),
    K('B', 'at a place someone else is building: join them') ] },
];
const TOUCH = [
  { id: 'walk', title: 'Walking and looking', rows: [K('drag left', 'walk · the further you drag, the faster, up to a run'), K('drag right', 'look'), K('jump', 'the big button, or a quick flick up on the walking side'),
    K('climb', 'walk into a tree trunk and keep pushing: up the stick climbs, down comes down, sideways goes round · jump lets go'),
    K('rail', 'down the right edge: walk, plant, build, space, me (see yourself), gesture · tap the lit one to come back to walking')] },
  { id: 'guns', title: 'Guns', note: 'Near a gun by the junk heap, “gun: pick up” takes it; with one in hand the pad has fire (hold), aim (hold), reload and put away. Aim by looking (drag right).', rows: [] },
  { id: 'voids', title: 'Voids', rows: [K('double-tap', 'or “open a void”: a new one ahead of you'), K('tap', 'on a void: evaporate it')] },
  { id: 'plant', title: 'Planting', rows: [K('plant', 'on the rail, then the plant list'), K('tap', 'the ground: plant it there'), K('dig up', 'the plant you look at'), K('done', 'trowel down')] },
  { id: 'space', title: 'The space view', rows: [K('one finger', 'turn the view round the bubble'), K('pinch', 'nearer / farther')] },
  { id: 'free', title: 'Free builds (Ultrahand)', note: 'Lift a piece and it hangs where you look. The pad: nearer, farther, turn and tip an eighth at a time, stick (to where the green line shows), unglue, let go. Swing a held piece side to side, fast, and it comes apart.', rows: [] },
  { id: 'wall', title: 'Building', note: 'Look at a stone so the cross is on it, then the pad: lift / set, turn (hold), fine, tip, roll, length in, on edge, press and pass through (hold), hearting, more stone, glue, undo, finish (twice), put away.', rows: [K('build', 'on the rail: at a pegged-out stint, that stint; anywhere else, a free build where you stand')] },
];

const CSS = `
#help { position:fixed; inset:0; z-index:30; display:none; align-items:center; justify-content:center; background:rgba(4,5,8,.45); pointer-events:auto; }
#help.on { display:flex; }
#help .sheet { width:min(920px, calc(100vw - 28px)); max-height:min(86vh, 820px); overflow:auto; box-sizing:border-box; font-family:'IBM Plex Mono',ui-monospace,Menlo,monospace; font-size:11px; line-height:1.5;
  letter-spacing:.04em; color:var(--ink,#e9e4da); background:rgba(8,10,14,.9); border:1px solid rgba(233,228,218,.18); border-radius:14px; padding:18px 20px 16px;
  backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); }
#help h2 { font:400 22px 'Cormorant Garamond',Georgia,serif; letter-spacing:.02em; margin:0; }
#help .top { display:flex; align-items:baseline; gap:12px; margin-bottom:6px; } #help .top span { color:var(--dim,#9a958c); font-size:10px; flex:1; }
#help .x { background:none; border:1px solid rgba(233,228,218,.2); color:var(--dim,#9a958c); border-radius:999px; font:inherit; padding:4px 10px; cursor:pointer; }
#help .cols { columns:2; column-gap:26px; } @media (max-width:700px) { #help .cols { columns:1; } }
#help section { break-inside:avoid; margin:12px 0 0; padding:10px 12px 8px; border:1px solid transparent; border-radius:10px; }
#help section.now { border-color:rgba(120,235,255,.4); background:rgba(120,235,255,.05); }
#help h3 { font-size:9px; letter-spacing:.22em; text-transform:uppercase; color:var(--dim,#9a958c); margin:0 0 6px; font-weight:400; }
#help section.now h3 { color:#bff6ff; } #help section.now h3::after { content:' · now'; }
#help .note { color:var(--dim,#9a958c); margin:0 0 6px; font-size:10px; }
#help .hr { display:flex; gap:10px; align-items:baseline; padding:2px 0; } #help .hk { flex:0 0 auto; min-width:92px; display:flex; flex-wrap:wrap; gap:3px; max-width:150px; }
#help kbd { font:inherit; font-size:10px; color:var(--ink,#e9e4da); padding:1px 6px; border:1px solid rgba(233,228,218,.3); border-bottom-width:2px; border-radius:5px; background:rgba(255,255,255,.05); white-space:nowrap; }
#help .hw { color:#cfcabf; flex:1; }
`;

/** o: { isTouch, context(): Set of section ids that are 'now', pad(): the connected controller (gamepad.js) or null, onToggle(open) } */
export function createHelp(o) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
  const el = document.createElement('div'); el.id = 'help'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'controls'); document.body.append(el);
  let isOpen = false;
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const caps = k => k.split('|').map(x => `<kbd>${esc(x)}</kbd>`).join('');
  function render() {
    const now = o.context ? o.context() : new Set(), pd = o.pad ? o.pad() : null; let list = (o.isTouch ? TOUCH : SECTIONS).slice();
    if (pd) {   // a controller is connected: its buttons, from the same table it is read by (gamepad.js)
      const N = pd.names(), M = pd.MAP, rows = k => M[k].map(r => K(N[r[0]] || 'button ' + r[0], r[2]));
      const pads = [{ id: 'pad', title: 'Controller', note: 'Its buttons do what the keys do, by what you are doing.', rows: [K('left stick', 'walk · a lean strolls, half way is the ordinary walk, all the way runs'), K('right stick', 'look'), ...rows('any')], now: true },
        { id: 'pad-walk', title: 'Controller: walking', rows: rows('walk'), now: now.has('walk') }, { id: 'pad-build', title: 'Controller: building a wall', rows: rows('build'), now: now.has('wall') }, { id: 'pad-free', title: 'Controller: free builds (Ultrahand)', rows: rows('free'), now: now.has('free') }, { id: 'pad-armed', title: 'Controller: with a gun', rows: rows('armed'), now: false },
        { id: 'pad-plant', title: 'Controller: planting', rows: rows('plant'), now: now.has('plant') }, { id: 'pad-space', title: 'Controller: the space view', rows: [K('right stick', 'turn the view round the bubble'), K(N[6], N[7], 'farther / nearer'), ...rows('space')], now: now.has('space') }];
      for (const q of pads) if (q.now) now.add(q.id);
      list = pd.used ? pads.concat(list) : list.concat(pads);
    }
    list.sort((a, b) => (now.has(b.id) ? 1 : 0) - (now.has(a.id) ? 1 : 0));   // what you are doing first; the rest in their own order
    el.innerHTML = `<div class="sheet"><div class="top"><h2>Controls</h2><span>${o.isTouch ? 'touch' : pd ? 'keys, mouse and controller' : 'keys and mouse'} · what you are doing now comes first</span><button class="x" data-x>close · Esc</button></div><div class="cols">`
      + list.map(s => `<section class="${now.has(s.id) ? 'now' : ''}"><h3>${esc(s.title)}</h3>${s.note ? `<p class="note">${esc(s.note)}</p>` : ''}`
        + s.rows.map(r => `<div class="hr"><span class="hk">${r.slice(0, -1).map(caps).join('')}</span><span class="hw">${esc(r[r.length - 1])}</span></div>`).join('') + '</section>').join('')
      + '</div></div>';
  }
  function open() { if (isOpen) return; isOpen = true; render(); el.classList.add('on'); try { document.exitPointerLock && document.exitPointerLock(); } catch (e) { /* no pointer to give back */ } o.onToggle && o.onToggle(true); }
  function close() { if (!isOpen) return; isOpen = false; el.classList.remove('on'); o.onToggle && o.onToggle(false); }
  el.addEventListener('mousedown', e => { e.stopPropagation(); if (e.target === el || e.target.closest('[data-x]')) close(); });
  el.addEventListener('click', e => e.stopPropagation()); el.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
  for (const ev of ['touchstart', 'touchmove', 'touchend']) el.addEventListener(ev, e => { e.stopPropagation(); if (ev === 'touchend' && (e.target === el || e.target.closest('[data-x]'))) close(); }, { passive: true });
  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return; const t = e.target; if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && !/^(range|button|checkbox)$/.test(t.type)))) return;
    if (e.code === 'Slash' || e.code === 'F1') { if (o.ready && !o.ready()) return; e.preventDefault(); e.stopImmediatePropagation(); isOpen ? close() : open(); }
    else if (isOpen && e.code === 'Escape') { e.stopImmediatePropagation(); close(); }
    else if (isOpen && !/^(Shift|Control|Alt|Meta)/.test(e.code)) e.stopImmediatePropagation();   // with the sheet up, keys do nothing in the garden
  }, true);
  return { open, close, toggle() { isOpen ? close() : open(); }, get isOpen() { return isOpen; }, sections: SECTIONS, touch: TOUCH };
}
