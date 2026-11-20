// settings.js — the settings drawer. Every control is described once (label, range, how to read and write it); the
// drawer builds its rows from those descriptions, and main.js hands the same descriptions to Invisible Hands.
//
//   { id, tab, label, kind: 'range' | 'toggle' | 'choice' | 'action', min, max, step, log, fmt, get, set, options, note }
//   range:  get/set work in display units; `log: true` makes the slider logarithmic; `zero: true` lets a log slider reach 0
//   choice: options [{ label, value }]
//   action: set() is called when its button is pressed

const lin = (v, a, b) => a + v * (b - a), unlin = (x, a, b) => (x - a) / (b - a);
export function to01(c, x) {   // display units -> 0..1 (the slider's own position and the Invisible Hands value)
  if (c.kind === 'toggle') return x ? 1 : 0;
  if (c.kind === 'choice') { const i = Math.max(0, c.options.findIndex(o => o.value === x)); return (i + 0.5) / c.options.length; }
  if (c.kind === 'action') return 0;
  if (c.log) { if (c.zero && x <= 0) return 0; const lo = c.zero ? c.min : c.min; const v = Math.log(Math.max(x, lo) / lo) / Math.log(c.max / lo); return c.zero ? 0.04 + 0.96 * v : v; }
  return Math.min(1, Math.max(0, unlin(x, c.min, c.max)));
}
export function from01(c, v) {   // 0..1 -> display units
  v = Math.min(1, Math.max(0, v));
  if (c.kind === 'toggle') return v > 0.5;
  if (c.kind === 'choice') return c.options[Math.min(c.options.length - 1, Math.floor(v * c.options.length))].value;
  if (c.log) { if (c.zero) { if (v < 0.02) return 0; v = (v - 0.04) / 0.96; } return c.min * Math.pow(c.max / c.min, Math.max(0, v)); }
  let x = lin(v, c.min, c.max); if (c.step) x = Math.round(x / c.step) * c.step; return x;
}

const CSS = `
#gdDrawer { position:fixed; top:0; right:0; bottom:0; width:min(360px, 100vw); z-index:20; transform:translateX(105%); transition:transform .28s cubic-bezier(.2,.7,.2,1);
  background:rgba(8,9,13,.86); -webkit-backdrop-filter:blur(14px) saturate(1.2); backdrop-filter:blur(14px) saturate(1.2); border-left:1px solid rgba(233,228,218,.12);
  color:var(--ink, #e9e4da); font-family:'IBM Plex Mono', ui-monospace, monospace; font-size:11px; letter-spacing:.06em; display:flex; flex-direction:column; pointer-events:auto; }
#gdDrawer.open { transform:none; }
#gdDrawer header { display:flex; align-items:center; justify-content:space-between; padding:16px 18px 6px; }
#gdDrawer header b { font-weight:400; letter-spacing:.4em; font-size:10px; color:var(--dim, #b8b2a6); }
#gdDrawer .x { background:none; border:none; color:var(--dim, #b8b2a6); font:inherit; font-size:16px; cursor:pointer; padding:2px 6px; }
#gdDrawer nav { display:flex; gap:4px; padding:6px 14px 10px; border-bottom:1px solid rgba(233,228,218,.1); }
#gdDrawer nav button { flex:1; background:none; border:1px solid transparent; border-radius:999px; color:var(--dim, #b8b2a6); font:inherit; font-size:10px; letter-spacing:.16em;
  text-transform:uppercase; padding:7px 4px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px; }
#gdDrawer nav button.on { color:var(--ink, #e9e4da); border-color:rgba(233,228,218,.25); background:rgba(233,228,218,.06); }
#gdDrawer .pane { display:none; overflow-y:auto; padding:6px 18px 28px; flex:1; }
#gdDrawer .pane.on { display:block; }
#gdDrawer h4 { margin:18px 0 6px; font-weight:400; font-size:9px; letter-spacing:.32em; text-transform:uppercase; color:var(--faint, #7d786f); }
#gdDrawer .row { display:grid; grid-template-columns:1fr auto; align-items:center; gap:4px 10px; padding:7px 0; border-bottom:1px solid rgba(233,228,218,.06); }
#gdDrawer .row label { display:flex; align-items:center; gap:6px; color:var(--ink, #e9e4da); }
#gdDrawer .row output { color:var(--dim, #b8b2a6); font-size:10px; text-align:right; min-width:64px; }
#gdDrawer .row input[type=range] { grid-column:1 / -1; -webkit-appearance:none; appearance:none; width:100%; height:2px; background:rgba(233,228,218,.25); outline:none; cursor:pointer; margin:6px 0 2px; }
#gdDrawer .row input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:12px; height:12px; border-radius:50%; background:var(--ink, #e9e4da); }
#gdDrawer .row input[type=range]::-moz-range-thumb { width:12px; height:12px; border:none; border-radius:50%; background:var(--ink, #e9e4da); }
#gdDrawer .note { grid-column:1 / -1; color:var(--faint, #7d786f); font-size:10px; letter-spacing:.02em; line-height:1.45; }
#gdDrawer .tog, #gdDrawer .act, #gdDrawer .seg button { background:rgba(233,228,218,.05); border:1px solid rgba(233,228,218,.18); border-radius:999px; color:var(--dim, #b8b2a6);
  font:inherit; font-size:10px; letter-spacing:.14em; text-transform:uppercase; padding:6px 12px; cursor:pointer; }
#gdDrawer .tog.on, #gdDrawer .seg button.on { color:#14110c; background:var(--ink, #e9e4da); border-color:var(--ink, #e9e4da); }
#gdDrawer .act:hover, #gdDrawer .tog:hover, #gdDrawer .seg button:hover { border-color:rgba(233,228,218,.45); }
#gdDrawer .seg { display:flex; gap:4px; }
#gdDrawer .row.wide { grid-template-columns:1fr; } #gdDrawer .row.wide .seg { flex-wrap:wrap; }   /* many choices: label above, buttons wrap */
#gdDrawer .num { width:110px; background:rgba(233,228,218,.06); border:1px solid rgba(233,228,218,.2); border-radius:6px; color:var(--ink, #e9e4da); font:inherit; padding:5px 8px; text-align:right; }
#gdDrawer .row output.sub { grid-column:1 / -1; text-align:left; font-size:9px; color:var(--faint, #7d786f); }
#gdDrawer .row.info { display:block; }
#gdDrawer .row output.infoText { display:block; text-align:left; white-space:pre-line; line-height:1.6; color:var(--dim, #b8b2a6); font-size:10px; }
#gdDrawer .acts { display:flex; flex-wrap:wrap; gap:6px; padding:10px 0; }
#gdDrawer .hands { padding-top:10px; }
#gdDrawer .hands input { font:inherit; }
@media (max-width:640px) { #gdDrawer { width:100vw; top:auto; height:72vh; border-left:none; border-top:1px solid rgba(233,228,218,.12); transform:translateY(105%); } #gdDrawer.open { transform:none; } }
`;

export function createDrawer({ tabs, controls, tag = null, onOpenChange = () => {} }) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
  const root = document.createElement('aside'); root.id = 'gdDrawer'; root.setAttribute('aria-label', 'Settings');
  const head = document.createElement('header'), title = document.createElement('b'), x = document.createElement('button');
  title.textContent = 'SETTINGS'; x.className = 'x'; x.textContent = '×'; x.title = 'close (O)'; head.append(title, x);
  const nav = document.createElement('nav'); root.append(head, nav);
  const panes = {}, navs = {}, rows = {};
  for (const t of tabs) {
    const b = document.createElement('button'); b.textContent = t.label; if (t.icon) b.prepend(t.icon); nav.append(b); navs[t.id] = b;
    const p = document.createElement('div'); p.className = 'pane'; root.append(p); panes[t.id] = p;
    if (t.intro) { const n = document.createElement('div'); n.className = 'note'; n.style.padding = '10px 0 0'; n.textContent = t.intro; p.append(n); }
    b.addEventListener('click', () => show(t.id));
  }
  const acts = {};
  for (const c of controls) {
    const pane = panes[c.tab]; if (!pane) continue;
    if (c.group) { const h = document.createElement('h4'); h.textContent = c.group; pane.append(h); }
    if (c.kind === 'action') {   // actions sit together as a row of buttons
      let box = acts[c.tab + (c.group || '')]; if (!box || box.parentNode !== pane || pane.lastChild !== box) { box = document.createElement('div'); box.className = 'acts'; pane.append(box); acts[c.tab + (c.group || '')] = box; }
      const b = document.createElement('button'); b.className = 'act'; b.textContent = c.label; if (c.note) b.title = c.note;
      b.addEventListener('click', () => c.set()); if (tag && c.hands) b.append(tag(c.id)); box.append(b); rows[c.id] = { c }; continue;
    }
    const row = document.createElement('div'); row.className = 'row';
    const lab = document.createElement('label'), name = document.createElement('span'); name.textContent = c.label; lab.append(name);
    if (tag && c.hands) lab.append(tag(c.id));
    const out = document.createElement('output'); row.append(lab);
    const r = { c, out };
    if (c.kind === 'range') {
      const inp = document.createElement('input'); inp.type = 'range'; inp.min = 0; inp.max = 1000; inp.step = 1; inp.setAttribute('aria-label', c.label);
      inp.addEventListener('input', () => { c.set(from01(c, inp.value / 1000)); sync(c.id, true); c.onHand && c.onHand(); });
      row.append(out, inp); r.inp = inp;
    } else if (c.kind === 'toggle') {
      const b = document.createElement('button'); b.className = 'tog';
      b.addEventListener('click', () => { c.set(!c.get()); sync(c.id); c.onHand && c.onHand(); });
      row.append(b); r.btn = b;
    } else if (c.kind === 'choice') {
      const seg = document.createElement('div'); seg.className = 'seg'; r.opts = []; if (c.options.length > 4) row.classList.add('wide');
      for (const o of c.options) { const b = document.createElement('button'); b.textContent = o.label; b.addEventListener('click', () => { c.set(o.value); sync(c.id); c.onHand && c.onHand(); }); seg.append(b); r.opts.push([o.value, b]); }
      row.append(seg);
    } else if (c.kind === 'number') {
      const inp = document.createElement('input'); inp.type = 'number'; inp.step = 'any'; inp.min = c.min; inp.max = c.max; inp.className = 'num'; inp.setAttribute('aria-label', c.label);
      inp.addEventListener('change', () => { const v = parseFloat(inp.value); if (Number.isFinite(v)) c.set(Math.min(c.max, Math.max(c.min, v))); sync(c.id); });
      row.append(inp); r.num = inp; out.className = 'sub'; row.append(out);
    } else if (c.kind === 'info') { row.classList.add('info'); lab.remove(); out.className = 'infoText'; row.append(out); }
    if (c.note) { const n = document.createElement('div'); n.className = 'note'; n.textContent = c.note; row.append(n); }
    pane.append(row); rows[c.id] = r;
  }
  document.body.append(root);
  function sync(id, fromSlider = false) {
    const r = rows[id]; if (!r || !r.c.get) return; const c = r.c, val = c.get();
    if (r.out) r.out.textContent = c.fmt ? c.fmt(val) : String(val);
    if (r.inp && !fromSlider) r.inp.value = Math.round(to01(c, val) * 1000);
    if (r.num && document.activeElement !== r.num) r.num.value = +(+val).toFixed(4);
    if (r.btn) { r.btn.classList.toggle('on', !!val); r.btn.textContent = val ? 'on' : 'off'; }
    if (r.opts) for (const [v, b] of r.opts) b.classList.toggle('on', v === val);
  }
  const syncAll = () => { for (const id in rows) sync(id); };
  let cur = tabs[0].id, isOpen = false;
  function show(id) { cur = id; for (const t of tabs) { navs[t.id].classList.toggle('on', t.id === id); panes[t.id].classList.toggle('on', t.id === id); } }
  function open(id) { if (id) show(id); syncAll(); isOpen = true; root.classList.add('open'); onOpenChange(true); }
  function close() { isOpen = false; root.classList.remove('open'); onOpenChange(false); }
  x.addEventListener('click', close);
  for (const ev of ['mousedown', 'touchstart', 'keydown', 'wheel']) root.addEventListener(ev, e => e.stopPropagation(), { passive: true });
  show(cur);
  return { open, close, toggle: id => (isOpen && (!id || id === cur) ? close() : open(id)), sync, syncAll, pane: id => panes[id], get isOpen() { return isOpen; } };
}
