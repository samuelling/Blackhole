// meadow.js: the natural sound of the place, synthesised. Ported from Dry Stack's field soundscape (samuelling/dry-stack src/audio.js).
// Wind in three bands (the low rush, the hiss of grass, leaves), New England birds by day, crickets on summer and autumn nights.
// It follows the garden's own weather, hour and season: more wind, more rush; rain or darkness, no birdsong; no crickets before June.

const rnd = (a, b) => a + (b - a) * Math.random();
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

export function createMeadow(c, dest) {
  const out = c.createGain(); out.gain.value = 0.9; out.connect(dest);
  const noise = kind => {
    const len = c.sampleRate * 6, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let last = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else { b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; } }
    return buf;
  };
  const brown = noise('brown'), pink = noise('pink');
  const loop = (buf, type, freq, q, gain) => { const src = c.createBufferSource(); src.buffer = buf; src.loop = true; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = gain; src.connect(f); f.connect(g); g.connect(out); src.start(0, Math.random() * 5); return { f, g }; };
  const wind = loop(brown, 'lowpass', 420, 0.5, 0.1), hiss = loop(pink, 'bandpass', 4200, 0.5, 0.01), leaves = loop(pink, 'bandpass', 1800, 0.8, 0.006);
  // running water: the brook is a band of bright noise that flutters, the fall a broad low roar; both come up as you come near
  const babble = loop(pink, 'bandpass', 1900, 0.9, 0), roar = loop(brown, 'lowpass', 1100, 0.4, 0), roarHi = loop(pink, 'highpass', 900, 0.5, 0);
  { const l1 = c.createOscillator(), l2 = c.createOscillator(), g1 = c.createGain(), g2 = c.createGain(); l1.frequency.value = 5.3; l2.frequency.value = 8.9; g1.gain.value = 380; g2.gain.value = 260;
    l1.connect(g1); l2.connect(g2); g1.connect(babble.f.frequency); g2.connect(babble.f.frequency); l1.start(); l2.start(); }
  const S = { day: 0, wind: 0.3, rain: 0, doy: 165, on: true };
  let gustT = 0, birdT = 0, cricketT = 0;
  const gust = () => {   // the wind comes and goes on its own, scaled by how windy the weather is
    const t = c.currentTime, g = rnd(0.25, 1.0) * (0.35 + 1.3 * S.wind);
    wind.g.gain.setTargetAtTime(0.05 + 0.3 * g, t, rnd(1.0, 2.5)); wind.f.frequency.setTargetAtTime(260 + 420 * Math.min(1.4, g), t, 1.5);
    hiss.g.gain.setTargetAtTime(0.006 + 0.05 * g * g, t, 1.2); leaves.g.gain.setTargetAtTime(0.003 + 0.032 * g * g, t, 1.0);
    gustT = setTimeout(gust, rnd(2500, 7000));
  };
  gust();
  const panner = pan => { if (!c.createStereoPanner) return c.createGain(); const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); return p; };
  function whistle(t, f0, f1, dur, gain, to, vib = 0, type = 'sine') {
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    if (vib) { const l = c.createOscillator(); l.frequency.value = rnd(18, 28); const lg = c.createGain(); lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05); }
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + Math.min(0.03, dur * 0.3)); g.gain.setValueAtTime(gain, t + dur * 0.7); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(to); o.start(t); o.stop(t + dur + 0.02);
  }
  const birdOut = (pan, dist) => { const g = c.createGain(); g.gain.value = 0.1 * dist; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000 + 6000 * dist; const p = panner(pan); g.connect(lp); lp.connect(p); p.connect(out); return g; };
  const birds = {
    chickadee(pan, d) { const o = birdOut(pan, d), t = c.currentTime + 0.05, n = Math.random() < 0.5 ? 1 : 2;   // "fee-bee"
      for (let i = 0; i < n; i++) { const tt = t + i * 1.6; whistle(tt, 3950, 3900, 0.32, 0.5, o); whistle(tt + 0.4, 3420, 3380, 0.38, 0.45, o, 12); } },
    whiteThroat(pan, d) { const o = birdOut(pan, d), t = c.currentTime + 0.05, base = rnd(3000, 3400);            // "Old Sam Peabody, Peabody, Peabody"
      whistle(t, base, base, 0.75, 0.45, o, 6); whistle(t + 0.85, base * 1.26, base * 1.26, 0.55, 0.45, o, 6);
      for (let i = 0; i < 3; i++) { whistle(t + 1.5 + i * 0.36, base * 1.4, base * 1.38, 0.13, 0.4, o); whistle(t + 1.66 + i * 0.36, base * 1.26, base * 1.25, 0.15, 0.4, o); } },
    blueJay(pan, d) { const o = birdOut(pan, d * 0.6), t = c.currentTime + 0.05; for (let i = 0; i < 2; i++) { whistle(t + i * 0.42, 2300, 1500, 0.3, 0.18, o, 90, 'sawtooth'); whistle(t + i * 0.42, 3300, 2400, 0.3, 0.08, o, 120, 'square'); } },
    crow(pan, d) { const o = birdOut(pan, d * 0.4), t = c.currentTime + 0.05, bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 2.5; bp.connect(o);
      const n = Math.floor(rnd(2, 5)); for (let i = 0; i < n; i++) whistle(t + i * 0.55, 640, 520, 0.36, 0.7, bp, 30, 'sawtooth'); },
    songTrill(pan, d) { const o = birdOut(pan, d), t = c.currentTime + 0.05; for (let i = 0; i < 3; i++) whistle(t + i * 0.2, 4200, 3600, 0.1, 0.35, o);
      for (let i = 0; i < 14; i++) whistle(t + 0.7 + i * 0.045, 5200, 3000, 0.035, 0.25, o); whistle(t + 1.4, 3000, 2600, 0.25, 0.3, o, 40); },
    owl(pan, d) { const o = birdOut(pan, d * 0.7), t = c.currentTime + 0.05;                                          // great horned: hoo, hoo-hoo, hoo, hoo
      [[0, 0.5], [0.75, 0.22], [1.02, 0.4], [1.9, 0.5], [2.75, 0.55]].forEach(([at, dur]) => whistle(t + at, 330, 300, dur, 0.9, o, 3)); },
  };
  const DAY = ['chickadee', 'whiteThroat', 'chickadee', 'blueJay', 'crow', 'songTrill', 'whiteThroat'];
  const sched = () => {
    const winter = S.doy < 75 || S.doy > 320, song = S.day > 0.2 && S.rain < 0.25;
    if (S.on && song && !(winter && Math.random() < 0.6)) birds[winter ? pick(['chickadee', 'crow', 'blueJay']) : pick(DAY)](rnd(-0.9, 0.9), rnd(0.25, 1));
    else if (S.on && S.day < 0.05 && S.rain < 0.25 && Math.random() < 0.12) birds.owl(rnd(-0.9, 0.9), rnd(0.3, 0.8));
    birdT = setTimeout(sched, rnd(2200, 9000));
  };
  birdT = setTimeout(sched, 1800);
  // crickets: three chirpers a little apart in pitch, pulsing in threes
  const cOut = c.createGain(); cOut.gain.value = 0; cOut.connect(out);
  const chirpers = [0, 1, 2].map(i => { const o = c.createOscillator(); o.frequency.value = 4400 + i * 230; const g = c.createGain(); g.gain.value = 0; const p = panner(rnd(-0.8, 0.8)); o.connect(g); g.connect(p); p.connect(cOut); o.start(); return g; });
  let next = c.currentTime + 0.2;
  const tick = () => {
    const now = c.currentTime; if (next < now) next = now + 0.1;
    while (next < now + 1.2) { for (const g of chirpers) { if (Math.random() < 0.15) continue; const t0 = next + Math.random() * 0.25;
      for (let p = 0; p < 3; p++) { const tp = t0 + p * 0.03; g.gain.setValueAtTime(0, tp); g.gain.linearRampToValueAtTime(1, tp + 0.006); g.gain.linearRampToValueAtTime(0, tp + 0.022); } } next += 0.6; }
    cricketT = setTimeout(tick, 500);
  };
  tick();
  return {
    /** day: 0 night to 1 day; wind: 0 to 1; rain: 0 to 1; doy: day of the year. */
    set(day, windLevel, rain, doy) {
      S.day = day; S.wind = windLevel; S.rain = rain; S.doy = doy;
      const season = Math.max(0, Math.min(1, (doy - 150) / 30)) * Math.max(0, Math.min(1, (305 - doy) / 25));      // June to the end of October
      cOut.gain.setTargetAtTime(0.014 * season * (0.25 + 0.75 * (1 - day)) * (1 - Math.min(1, rain * 2)), c.currentTime, 2);
    },
    /** Metres to the nearest running water, and to the fall. */
    water(stream, fall) { const t = c.currentTime, near = x => 1 / (1 + (x / 3.2) * (x / 3.2)), f = 1 / (1 + (fall / 11) * (fall / 11));
      babble.g.gain.setTargetAtTime(0.11 * near(stream), t, 0.3); roar.g.gain.setTargetAtTime(0.55 * f, t, 0.4); roarHi.g.gain.setTargetAtTime(0.07 * f * f, t, 0.4); },
    setEnabled(v) { S.on = !!v; out.gain.setTargetAtTime(v ? 0.9 : 0, c.currentTime, 0.4); },
  };
}
