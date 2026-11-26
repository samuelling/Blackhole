// voicefx.js: Brodie's voice box. He is a small glass machine, so his voice goes through a harmonizer, half mixed: what he said,
// plus two copies of it, one a fourth below and one a fifth above, and a short metallic ring. The copies are made the way the old
// rack harmonizers made them: a delay line whose length is swept by a sawtooth, so what comes out of it is played back slower or
// faster than it went in (lower or higher), and two such taps half a sweep apart, cross-faded so the jump at the end of each
// sweep is never heard. It needs nothing but the browser's own audio nodes.
//
// createVoiceFx(ctx) → { input, output, setMix(k) }   k: 0 his plain voice, 0.5 half and half (the default), 1 all machine
function shifter(ctx, semis, gain) {
  const r = Math.pow(2, semis / 12), T = 0.085, D = Math.abs(1 - r) * T, sr = ctx.sampleRate, n = Math.round(T * sr);
  const ramp = ctx.createBuffer(1, n, sr), win = ctx.createBuffer(1, n, sr), a = ramp.getChannelData(0), w = win.getChannelData(0);
  for (let i = 0; i < n; i++) { const x = i / n; a[i] = r < 1 ? x : 1 - x; w[i] = Math.sin(Math.PI * x) ** 2; }
  const input = ctx.createGain(), output = ctx.createGain(); output.gain.value = gain; const t0 = ctx.currentTime + 0.05, srcs = [];
  for (const off of [0, T / 2]) {
    const d = ctx.createDelay(0.5); d.delayTime.value = 0.004;
    const rs = ctx.createBufferSource(); rs.buffer = ramp; rs.loop = true; const rg = ctx.createGain(); rg.gain.value = D; rs.connect(rg); rg.connect(d.delayTime);
    const ws = ctx.createBufferSource(); ws.buffer = win; ws.loop = true; const g = ctx.createGain(); g.gain.value = 0; ws.connect(g.gain);
    input.connect(d); d.connect(g); g.connect(output); rs.start(t0, off); ws.start(t0, off); srcs.push(rs, ws);
  }
  return { input, output, stop() { for (const s of srcs) { try { s.stop(); } catch (e) {} } } };
}
export function createVoiceFx(ctx, mix = 0.5) {
  const input = ctx.createGain(), output = ctx.createGain(), dry = ctx.createGain(), wet = ctx.createGain(), bus = ctx.createGain();
  input.connect(dry); dry.connect(output);
  const low = shifter(ctx, -5, 0.9), high = shifter(ctx, 7, 0.6);
  input.connect(low.input); input.connect(high.input); low.output.connect(bus); high.output.connect(bus);
  // the machine's throat: the copies lose their lows and their air, and ring a little
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
  const comb = ctx.createDelay(0.05); comb.delayTime.value = 0.0047; const fb = ctx.createGain(); fb.gain.value = 0.25;
  bus.connect(hp); hp.connect(lp); lp.connect(wet); lp.connect(comb); comb.connect(fb); fb.connect(comb); comb.connect(wet); wet.connect(output);
  const api = { input, output, mix,
    setMix(k) { k = Math.max(0, Math.min(1, +k || 0)); api.mix = k; const t = ctx.currentTime; dry.gain.setTargetAtTime(1 - 0.75 * k, t, 0.03); wet.gain.setTargetAtTime(0.95 * k, t, 0.03); },
    stop() { low.stop(); high.stop(); } };
  api.setMix(mix); return api;
}
/** Play a decoded clip through a voice box. Returns { source, ended (a promise) }. */
export function playThrough(ctx, fx, buffer, dest, gain = 1) {
  const src = ctx.createBufferSource(); src.buffer = buffer; const g = ctx.createGain(); g.gain.value = gain; src.connect(g); g.connect(fx ? fx.input : dest);
  const ended = new Promise(res => { src.onended = res; }); src.start(); return { source: src, ended };
}
