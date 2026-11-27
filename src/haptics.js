// haptics.js: what a controller in your hands feels.
//
// Two ways in. Rumble, the two motors in the grips (a heavy slow one on the left, a light quick one on the right), goes through the
// browser's own gamepad haptics (Chrome, Edge, Safari on a Mac): nothing to set up. Everything a DualSense can do besides, the
// resistance in L2 and R2 and the light bar, isn't in that API: for those the page talks to the controller itself over WebHID (Chrome or
// Edge on a computer), sending the same output report a PS5 sends. That needs the player to pick the controller once (Settings →
// Controller → Connect); after that it reconnects by itself. With WebHID open the rumble goes that way too, so one thing drives the motors.
//
// Rumble is a mix: one-off effects (a shot, a landing, a hit), each with a strength on each motor and a shape in time, plus a held level
// that the game sets every frame (the strain of a stone in your hands). Every frame the motors are set to the loudest of them.
//
// The DualSense output report (USB report 0x02, 47 bytes after the id; Bluetooth 0x31, the same 47 bytes two in, then a CRC32 at the
// end). Offsets in the 47 (as Linux's hid-playstation lays them out): 0 flags (bit0 rumble, bit1 rumble-not-haptics, bit2 R2 effect,
// bit3 L2 effect) · 1 flags (bit2 light bar colour, bit4 player lights) · 2 right motor · 3 left motor · 10..20 R2 effect · 21..31 L2
// effect · 38 flags (bit1 light bar setup, bit2 newer rumble emulation) · 41 light bar setup · 43 player lights · 44..46 red green blue.
// Trigger effects are encoded as Sony's own effect types (0x21 feedback, 0x25 weapon, 0x26 vibration, 0x05 off), after Nielk1's notes.

const SONY = 0x054c, PIDS = [0x0ce6, 0x0df2];   // DualSense, DualSense Edge
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---- trigger effects: 11 bytes each
export const TRIG = {
  off: () => [0x05, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  /** resistance from `pos` (0..9 of the pull) on, at `strength` (1..8) */
  feedback(pos, strength) {
    pos = clamp(pos | 0, 0, 9); const f = (clamp(strength | 0, 1, 8) - 1) & 7; let force = 0, zones = 0;
    for (let i = pos; i < 10; i++) { force |= f << (3 * i); zones |= 1 << i; }
    return [0x21, zones & 0xff, zones >> 8, force & 0xff, (force >>> 8) & 0xff, (force >>> 16) & 0xff, (force >>> 24) & 0xff, 0, 0, 0, 0];
  },
  /** a trigger that resists from `start` (2..7) and gives way, with a snap, at `end` (start+1..8): a gun's break */
  weapon(start, end, strength) {
    start = clamp(start | 0, 2, 7); end = clamp(end | 0, start + 1, 8); const z = (1 << start) | (1 << end);
    return [0x25, z & 0xff, z >> 8, clamp(strength | 0, 1, 8) - 1, 0, 0, 0, 0, 0, 0, 0];
  },
  /** buzzing from `pos` on: amplitude 1..8, `freq` in Hz (a gun's cyclic rate) */
  vibration(pos, amp, freq) {
    pos = clamp(pos | 0, 0, 9); const a = (clamp(amp | 0, 1, 8) - 1) & 7; let s = 0, zones = 0;
    for (let i = pos; i < 10; i++) { s |= a << (3 * i); zones |= 1 << i; }
    return [0x26, zones & 0xff, zones >> 8, s & 0xff, (s >>> 8) & 0xff, (s >>> 16) & 0xff, (s >>> 24) & 0xff, 0, 0, clamp(Math.round(freq), 1, 255), 0];
  },
};

let crcT = null;
function crc32(bytes) {
  if (!crcT) { crcT = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; } }
  let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = crcT[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0;
}

/** o: { gamepad(): the Gamepad being played, or null · on(): rumble wanted · gain(): 0..1.5 · triggersOn(): trigger effects wanted · hint(text) } */
export function createHaptics(o) {
  const fx = [];   // { t0, dur, s, w, shape, attack }
  let hold = [0, 0], now = 0, lastS = -1, lastW = -1, lastSent = 0, apiBusy = false;
  // ---------------------------------------------------------------- WebHID: the DualSense itself
  const hid = { dev: null, bt: false, seq: 0, busy: false, want: null, trig: { r: null, l: null }, sentTrig: { r: '', l: '' }, light: [0, 0, 0], sentLight: '', setup: false };
  const hasHID = typeof navigator !== 'undefined' && 'hid' in navigator;
  async function open(dev) {
    try {
      if (!dev.opened) await dev.open();
      hid.dev = dev; hid.bt = dev.collections.some(c => (c.outputReports || []).some(r => r.reportId === 0x31));
      try { await dev.receiveFeatureReport(0x05); } catch (e) {}   // over Bluetooth this asks it for its full reports (and it then takes ours)
      hid.setup = false; hid.sentTrig = { r: '', l: '' }; hid.sentLight = ''; lastS = lastW = -1;
      flush(true);
      return true;
    } catch (e) { hid.dev = null; if (o.hint) o.hint('couldn’t open the controller: ' + (e.message || e)); return false; }
  }
  if (hasHID) {
    navigator.hid.getDevices().then(ds => { const d = ds.find(x => x.vendorId === SONY && PIDS.includes(x.productId)); if (d) open(d); }).catch(() => {});
    navigator.hid.addEventListener('connect', e => { const d = e.device; if (!hid.dev && d.vendorId === SONY && PIDS.includes(d.productId)) open(d); });
    navigator.hid.addEventListener('disconnect', e => { if (e.device === hid.dev) hid.dev = null; });
    addEventListener('pagehide', () => { if (hid.dev) { hid.trig.r = hid.trig.l = TRIG.off(); hid.want = [0, 0]; flush(true); } });
  }
  /** Ask for the DualSense (must come from a click). */
  async function connect() {
    if (!hasHID) { if (o.hint) o.hint('trigger effects and the light bar need Chrome or Edge on a computer (WebHID)'); return false; }
    try {
      const ds = await navigator.hid.requestDevice({ filters: PIDS.map(p => ({ vendorId: SONY, productId: p })) });
      if (!ds.length) return false;
      const ok = await open(ds[0]); if (ok && o.hint) o.hint('DualSense connected: its triggers and light bar are the garden’s now', 5000); return ok;
    } catch (e) { if (o.hint) o.hint('couldn’t connect: ' + (e.message || e)); return false; }
  }
  // one report with whatever changed (the newest state wins; a report already on its way isn't queued behind)
  function flush(force) {
    const d = hid.dev; if (!d || !d.opened) return;
    if (hid.busy) { hid.again = true; return; }
    const c = new Uint8Array(47); let any = false;
    if (!hid.setup) { c[38] |= 0x02; c[41] = 0x02; c[1] |= 0x10; c[43] = 0x04; hid.setup = true; any = true; }   // take the light bar from the system; one player light, the middle one
    if (hid.want) { c[0] |= 0x03; c[38] |= 0x04; c[3] = Math.round(hid.want[0] * 255); c[2] = Math.round(hid.want[1] * 255); hid.want = null; any = true; }
    for (const [k, off, bit] of [['r', 10, 0x04], ['l', 21, 0x08]]) {
      const t = hid.trig[k] || TRIG.off(), key = t.join(','); if (!force && key === hid.sentTrig[k]) continue;
      c.set(t, off); c[0] |= bit; hid.sentTrig[k] = key; any = true;
    }
    const lk = hid.light.join(','); if (force || lk !== hid.sentLight) { c[1] |= 0x04; c[44] = hid.light[0]; c[45] = hid.light[1]; c[46] = hid.light[2]; hid.sentLight = lk; any = true; }
    if (!any) return;
    let id = 0x02, data = c;
    if (hid.bt) {
      id = 0x31; data = new Uint8Array(77); data[0] = (hid.seq & 0x0f) << 4; data[1] = 0x10; data.set(c, 2); hid.seq = (hid.seq + 1) & 0x0f;
      const pre = new Uint8Array(75); pre[0] = 0xa2; pre[1] = 0x31; pre.set(data.subarray(0, 73), 2);
      const crc = crc32(pre); data[73] = crc & 0xff; data[74] = (crc >>> 8) & 0xff; data[75] = (crc >>> 16) & 0xff; data[76] = (crc >>> 24) & 0xff;
    }
    hid.busy = true;
    d.sendReport(id, data).catch(() => {}).finally(() => { hid.busy = false; if (hid.again) { hid.again = false; flush(false); } });
  }
  // ---------------------------------------------------------------- rumble
  /** A one-off: s, w (strong left, weak right motor, 0..1), dur seconds, shape 'decay' | 'flat' | 'rise' (swells, then stops), delay seconds. */
  function play(s, w, dur, shape = 'decay', delay = 0) { fx.push({ t0: now + delay, dur, s, w, shape }); if (fx.length > 24) fx.shift(); }
  function level() {
    let s = hold[0], w = hold[1];
    for (let i = fx.length - 1; i >= 0; i--) {
      const e = fx[i], u = (now - e.t0) / e.dur; if (u < 0) continue; if (u >= 1) { fx.splice(i, 1); continue; }
      const k = e.shape === 'flat' ? 1 : e.shape === 'rise' ? u * u : Math.exp(-4 * u) * (1 - u * u * 0.3);
      s = Math.max(s, e.s * k); w = Math.max(w, e.w * k);
    }
    const g = o.gain ? o.gain() : 1; return [clamp(s * g, 0, 1), clamp(w * g, 0, 1)];
  }
  function update(dt) {
    const on = !o.on || o.on();
    let [s, w] = on ? level() : [0, 0];   // (read before the clock moves on, so a kick is felt at full strength on the frame it happens)
    now += dt;
    if (s < 0.02) s = 0; if (w < 0.02) w = 0;
    const changed = Math.abs(s - lastS) > 0.03 || Math.abs(w - lastW) > 0.03 || ((s === 0) !== (lastS === 0)) || ((w === 0) !== (lastW === 0));
    if (hid.dev) {
      if (changed && now - lastSent > (hid.bt ? 0.03 : 0.016)) { hid.want = [s, w]; lastS = s; lastW = w; lastSent = now; }
      if (o.triggersOn && !o.triggersOn()) hid.trig.r = hid.trig.l = TRIG.off();
      flush(false);
      return;
    }
    const gp = o.gamepad && o.gamepad(), act = gp && gp.vibrationActuator;
    if (!act || apiBusy) return;
    // the browser's haptics: an effect a little longer than our step, renewed while it changes or before it runs out
    if (s === 0 && w === 0) { if (lastS > 0 || lastW > 0) { lastS = lastW = 0; try { act.reset ? act.reset() : act.playEffect('dual-rumble', { duration: 1, strongMagnitude: 0, weakMagnitude: 0 }); } catch (e) {} } return; }
    if (!changed && now - lastSent < 0.09) return;
    lastS = s; lastW = w; lastSent = now;
    try { const p = act.playEffect('dual-rumble', { startDelay: 0, duration: 140, strongMagnitude: s, weakMagnitude: w }); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  }
  return {
    update, play, connect,
    /** the level held while something lasts (a stone in your hands); [0, 0] when it's over */
    hold(s, w) { hold[0] = s; hold[1] = w; },
    /** the triggers' effects (arrays from TRIG; null is off) */
    triggers(r, l) { hid.trig.r = r; hid.trig.l = l; },
    /** the light bar, 0..1 each */
    light(r, g, b) { hid.light[0] = Math.round(clamp(r, 0, 1) * 255); hid.light[1] = Math.round(clamp(g, 0, 1) * 255); hid.light[2] = Math.round(clamp(b, 0, 1) * 255); },
    get hid() { return !!hid.dev; }, get canHID() { return hasHID; }, get bluetooth() { return hid.bt; },
    get level() { return level(); },
  };
}
