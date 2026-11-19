// Ported from samuelling/shortwood-meadow (src/plantart.js) for three r160 ES modules.
// ---------- PlantArt: procedural textures, geometry and structure for every species ----------
export const PlantArt = (function () {
  const TAU = Math.PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t;
  function rngOf(seed) { let a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
  function hx(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function col(hex, a = 1, k = 0) {
    let [r, g, b] = hx(hex);
    if (k > 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; } else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
    return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
  }

  // ================= leaf textures (greyscale; tinted per instance) =================
  function leafPath(g, len, wid, wpos) {
    g.beginPath(); g.moveTo(0, 0);
    g.bezierCurveTo(wid * 0.9, -len * 0.1, wid * 1.08, -len * wpos * 1.35, 0, -len);
    g.bezierCurveTo(-wid * 1.08, -len * wpos * 1.35, -wid * 0.9, -len * 0.1, 0, 0);
    g.closePath();
  }
  function paintLeaf(g, x, y, ang, len, wid, o = {}) {
    g.save(); g.translate(x, y); g.rotate(ang);
    leafPath(g, len, wid, o.wpos || 0.42);
    const gr = g.createLinearGradient(-wid, 0, wid, 0);
    gr.addColorStop(0, o.edge || '#7a7a7a'); gr.addColorStop(0.47, o.mid || '#efefef'); gr.addColorStop(0.53, '#d6d6d6'); gr.addColorStop(1, '#868686');
    g.fillStyle = gr; g.fill();
    const g2 = g.createLinearGradient(0, 0, 0, -len); g2.addColorStop(0, 'rgba(0,0,0,0.2)'); g2.addColorStop(0.3, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(255,255,255,0.08)');
    g.fillStyle = g2; g.fill();
    if (o.serrate) { g.strokeStyle = 'rgba(0,0,0,0.35)'; g.setLineDash([2, 3]); g.lineWidth = 2; g.stroke(); g.setLineDash([]); }
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = Math.max(0.8, wid * 0.035); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.62)'; g.lineWidth = Math.max(0.8, wid * 0.06);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -len * 0.94); g.stroke();
    if (o.veins !== false) {
      g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = Math.max(0.6, wid * 0.03);
      const nv = o.nv || 7;
      for (let i = 1; i < nv; i++) {
        const yy = -len * i / (nv + 1), w = wid * 0.85 * Math.sin(Math.PI * Math.min(1, (i / (nv + 1)) * 1.1));
        g.beginPath(); g.moveTo(0, yy); g.quadraticCurveTo(w * 0.5, yy - len * 0.03, w, yy - len * 0.09);
        g.moveTo(0, yy); g.quadraticCurveTo(-w * 0.5, yy - len * 0.03, -w, yy - len * 0.09); g.stroke();
      }
    }
    g.restore();
  }
  function stemLine(g, x0, y0, x1, y1, w, c = '#9a9a9a') { g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
  function fuzz(g, w, h, n, a) { const r = rngOf(n); g.globalCompositeOperation = 'source-atop'; for (let i = 0; i < n; i++) { g.fillStyle = `rgba(255,255,255,${a * r()})`; g.fillRect(r() * w, r() * h, 1.5, 1.5); } g.globalCompositeOperation = 'source-over'; }

  const LEAF = {
    lance: [64, 256, g => paintLeaf(g, 32, 255, 0, 250, 25, { wpos: 0.38 })],
    ovate: [128, 256, g => paintLeaf(g, 64, 255, 0, 248, 52, { wpos: 0.46, nv: 8 })],
    serrate: [128, 256, g => paintLeaf(g, 64, 255, 0, 248, 50, { wpos: 0.44, nv: 8, serrate: true })],
    broad: [128, 256, g => paintLeaf(g, 64, 255, 0, 250, 58, { wpos: 0.5, nv: 11 })],
    fuzzy: [128, 256, g => { paintLeaf(g, 64, 255, 0, 250, 56, { wpos: 0.52, nv: 5, mid: '#f4f4f4', edge: '#b8b8b8' }); fuzz(g, 128, 256, 4000, 0.6); }],
    fleshy: [128, 128, g => { for (const [x, y, a] of [[64, 128, 0]]) paintLeaf(g, x, y, a, 124, 50, { wpos: 0.55, veins: false, mid: '#f2f2f2', edge: '#a8a8a8' }); }],
    sprig: [128, 256, g => {
      stemLine(g, 64, 256, 64, 18, 4, '#a8a8a8');
      for (let i = 0; i < 9; i++) { const y = 236 - i * 24, s = i % 2 ? 1 : -1; paintLeaf(g, 64, y, s * (0.95 - i * 0.04), 46 - i * 1.8, 16 - i * 0.6, { wpos: 0.45, nv: 4 }); }
      paintLeaf(g, 64, 24, 0, 24, 9, { wpos: 0.45, veins: false });
    }],
    trifoliate: [256, 256, g => {
      stemLine(g, 128, 256, 128, 150, 5, '#a0a0a0');
      paintLeaf(g, 128, 150, -0.72, 100, 36, { wpos: 0.55 }); paintLeaf(g, 128, 150, 0.72, 100, 36, { wpos: 0.55 }); paintLeaf(g, 128, 150, 0, 112, 38, { wpos: 0.55 });
    }],
    palmate: [256, 256, g => {
      stemLine(g, 128, 256, 128, 150, 5, '#a8a8a8');
      const angs = [-2.25, -1.45, -0.72, 0, 0.72, 1.45, 2.25], lens = [62, 88, 104, 112, 104, 88, 62];
      angs.forEach((a, i) => paintLeaf(g, 128, 150, a, lens[i], 22, { wpos: 0.6, nv: 5 }));
      const rg = g.createRadialGradient(128, 150, 2, 128, 150, 30); rg.addColorStop(0, '#e2e2e2'); rg.addColorStop(1, 'rgba(200,200,200,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(128, 150, 30, 0, TAU); g.fill();
    }],
    digitate: [256, 256, g => {   // lupine: many narrow leaflets radiating
      stemLine(g, 128, 256, 128, 140, 4, '#a8a8a8');
      for (let i = 0; i < 11; i++) { const a = -2.6 + i * 0.52; paintLeaf(g, 128, 140, a, 100, 12, { wpos: 0.5, nv: 3 }); }
    }],
    round: [256, 256, g => {
      stemLine(g, 128, 256, 128, 132, 5, '#a8a8a8');
      g.beginPath();
      for (let i = 0; i <= 240; i++) {
        const th = Math.PI / 2 + 0.16 + (TAU - 0.32) * i / 240;
        const r = 112 * (1 + 0.05 * Math.sin(th * 18)) * (1 - 0.06 * Math.cos(th - Math.PI / 2));
        const x = 128 + Math.cos(th) * r, y = 128 + Math.sin(th) * r; i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.lineTo(128, 128); g.closePath();
      const rg = g.createRadialGradient(128, 128, 4, 128, 128, 115); rg.addColorStop(0, '#f0f0f0'); rg.addColorStop(0.7, '#c4c4c4'); rg.addColorStop(1, '#949494');
      g.fillStyle = rg; g.fill(); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; g.stroke();
      for (let i = 0; i < 11; i++) {
        const th = Math.PI / 2 + 0.35 + (TAU - 0.7) * i / 10;
        g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(th) * 104, 128 + Math.sin(th) * 104); g.stroke();
      }
    }],
    thread: [128, 256, g => {
      stemLine(g, 64, 256, 64, 10, 3.5, '#b4b4b4');
      const r = rngOf(7);
      for (let i = 0; i < 26; i++) {
        const y = 248 - i * 9, s = i % 2 ? 1 : -1, a = s * (0.5 + r() * 0.5), L = 44 - i * 1.1;
        g.strokeStyle = r() < 0.5 ? '#dadada' : '#bdbdbd'; g.lineWidth = 3.4; g.lineCap = 'round';
        g.beginPath(); g.moveTo(64, y); g.quadraticCurveTo(64 + Math.sin(a) * L * 0.5, y - L * 0.5, 64 + Math.sin(a) * L, y - Math.cos(a) * L); g.stroke();
      }
    }],
    fern: [128, 256, g => {   // finely divided (yarrow, poppy)
      stemLine(g, 64, 256, 64, 6, 3, '#b0b0b0');
      for (let i = 0; i < 22; i++) { const y = 246 - i * 11, L = 46 * (1 - i / 26);
        for (const s of [-1, 1]) { g.save(); g.translate(64, y); g.rotate(s * 1.05);
          for (let k = 0; k < 5; k++) paintLeaf(g, 0, -k * L / 5, s * 0.9, L * 0.26, 3.5, { veins: false, wpos: 0.5 });
          stemLine(g, 0, 0, 0, -L, 1.6, '#c0c0c0'); g.restore(); } }
    }],
    compound: [256, 256, g => {
      stemLine(g, 128, 256, 128, 140, 5, '#9a9a9a');
      [[0, 122, 27], [-0.55, 108, 25], [0.55, 108, 25], [-1.15, 88, 22], [1.15, 88, 22]].forEach(([a, L, w]) => paintLeaf(g, 128, 140, a, L, w, { wpos: 0.45, nv: 6 }));
    }],
    rose: [256, 256, g => {   // pinnate, 5 serrated leaflets
      stemLine(g, 128, 256, 128, 40, 4, '#9a9a9a');
      [[0, 40, 0, 70, 30], [-1, 110, -1.25, 66, 28], [1, 110, 1.25, 66, 28], [-1, 175, -1.35, 60, 26], [1, 175, 1.35, 60, 26]].forEach(([s, y, a, L, w]) => paintLeaf(g, 128, y, a, L, w, { wpos: 0.5, nv: 6, serrate: true }));
    }],
    sword: [64, 512, g => {
      g.beginPath(); g.moveTo(18, 512); g.lineTo(14, 70); g.quadraticCurveTo(22, 20, 32, 0); g.quadraticCurveTo(42, 20, 50, 70); g.lineTo(46, 512); g.closePath();
      const gr = g.createLinearGradient(14, 0, 50, 0); gr.addColorStop(0, '#888'); gr.addColorStop(0.45, '#e6e6e6'); gr.addColorStop(1, '#9a9a9a'); g.fillStyle = gr; g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 1;
      for (let x = 20; x < 46; x += 4) { g.beginPath(); g.moveTo(x, 512); g.lineTo(32 + (x - 32) * 0.4, 30); g.stroke(); }
    }],
    blade: [32, 512, g => {
      g.beginPath(); g.moveTo(9, 512); g.lineTo(13, 40); g.quadraticCurveTo(16, 4, 16, 0); g.quadraticCurveTo(17, 4, 19, 40); g.lineTo(23, 512); g.closePath();
      const gr = g.createLinearGradient(9, 0, 23, 0); gr.addColorStop(0, '#8e8e8e'); gr.addColorStop(0.5, '#ececec'); gr.addColorStop(1, '#a0a0a0'); g.fillStyle = gr; g.fill();
      const g2 = g.createLinearGradient(0, 0, 0, 512); g2.addColorStop(0, 'rgba(255,255,255,0.15)'); g2.addColorStop(1, 'rgba(0,0,0,0.25)'); g.fillStyle = g2; g.fill();
    }],
  };

  // ================= flower painters (full colour) =================
  function petal(g, a, r0, len, w, fill, o = {}) {
    g.save(); g.rotate(a); g.beginPath(); g.moveTo(-w * 0.3, r0);
    g.bezierCurveTo(-w, r0 + (len - r0) * 0.35, -w * (o.tipW || 0.9), len * 0.9, -w * 0.25, len);
    if (o.notch) { g.lineTo(-w * 0.12, len * 0.95); g.lineTo(0, len); g.lineTo(w * 0.12, len * 0.95); }
    if (o.fringe) { for (let k = -3; k <= 3; k++) g.lineTo(k * w * 0.1, len + (k % 2 ? -6 : 3)); }
    g.lineTo(w * 0.25, len); g.bezierCurveTo(w * (o.tipW || 0.9), len * 0.9, w, r0 + (len - r0) * 0.35, w * 0.3, r0); g.closePath();
    g.fillStyle = fill; g.fill();
    if (o.stroke) { g.strokeStyle = o.stroke; g.lineWidth = 1; g.stroke(); }
    if (o.veins) { g.strokeStyle = o.veins; g.lineWidth = 1.2; for (let k = -1; k <= 1; k += 0.5) { g.beginPath(); g.moveTo(k * w * 0.1, r0); g.quadraticCurveTo(k * w * 0.45, len * 0.5, k * w * 0.35, len * 0.85); g.stroke(); } }
    g.restore();
  }
  function grad(g, r0, r1, stops) { const gr = g.createRadialGradient(0, 0, r0, 0, 0, r1); stops.forEach(([t, c]) => gr.addColorStop(t, c)); return gr; }
  function centre(g, r, c, type, rnd) {
    const cg = g.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r);
    cg.addColorStop(0, col(c, 1, 0.35)); cg.addColorStop(0.7, col(c, 1, 0)); cg.addColorStop(1, col(c, 1, -0.45));
    g.fillStyle = cg; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    for (let i = 0; i < r * 6; i++) { const a = rnd() * TAU, d = Math.sqrt(rnd()) * r * 0.95; g.fillStyle = type === 'cone' ? col('#e07a10', 0.9, rnd() * 0.3) : col(c, 0.8, rnd() < 0.5 ? -0.4 : 0.3); g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, type === 'cone' ? 2.6 : 1.6, 0, TAU); g.fill(); }
  }
  function daisy(P) {
    return (g, L) => {
      const r = rngOf(P.n * 31 + L.flCol.charCodeAt(3)); const c = L.flCol, tip = L.flCol2 || null, eye = L.flEye || '#e0c040';
      g.translate(128, 128);
      for (let layer = 0; layer < 2; layer++) for (let i = 0; i < P.n; i++) {
        const a = (i + layer * 0.5) / P.n * TAU + (r() - 0.5) * 0.08, len = P.len * (0.88 + r() * 0.12) * (layer ? 0.94 : 1);
        const gr = g.createLinearGradient(0, 0, 0, len); // in rotated space: computed inside petal via fill object
        g.save(); g.rotate(a);
        const lg = g.createLinearGradient(0, P.c0, 0, len);
        if (tip) { lg.addColorStop(0, col(c, 1, -0.2)); lg.addColorStop(0.5, col(c, 1, 0)); lg.addColorStop(0.62, col(tip, 1, 0)); lg.addColorStop(1, col(tip, 1, 0.1)); }
        else { lg.addColorStop(0, col(c, 1, layer ? -0.35 : -0.22)); lg.addColorStop(0.3, col(c, 1, layer ? -0.12 : 0)); lg.addColorStop(1, col(c, 1, layer ? 0 : 0.12)); }
        g.restore();
        petal(g, a, P.c0 * 0.6, len, P.w, lg, { notch: P.notch, stroke: col(c, 0.45, -0.45), veins: col(c, 0.3, -0.4) });
      }
      centre(g, P.c0, eye, P.cone ? 'cone' : 'flat', r);
    };
  }
  function cup(P) {   // broad-petalled flowers: poppy, hibiscus, geranium, anemone, dianthus, platycodon, daylily, lily
    return (g, L) => {
      const r = rngOf(P.n * 17 + L.flCol.charCodeAt(2)), c = L.flCol, eye = L.flEye || '#f0e8c0';
      g.translate(128, 128);
      for (let layer = 0; layer < (P.layers || 1); layer++) for (let i = 0; i < P.n; i++) {
        const a = (i + layer * 0.5) / P.n * TAU + (r() - 0.5) * 0.12, len = P.len * (layer ? 0.8 : 1) * (0.93 + r() * 0.07);
        g.save(); g.rotate(a); const lg = g.createLinearGradient(0, 0, 0, len);
        lg.addColorStop(0, P.eyeStop ? col(eye, 1, 0) : col(c, 1, -0.3)); lg.addColorStop(P.eyeStop || 0.3, col(c, 1, layer ? -0.08 : 0)); lg.addColorStop(1, col(c, 1, P.lightTip || 0.1)); g.restore();
        petal(g, a, 2, len, P.w * (layer ? 0.8 : 1), lg, { fringe: P.fringe, tipW: P.tipW, stroke: col(c, 0.35, -0.5), veins: P.veins ? col(P.veins, 0.55) : null });
        if (P.stripe) { g.save(); g.rotate(a); g.fillStyle = col(P.stripe, 0.6); g.beginPath(); g.ellipse(0, len * 0.5, P.w * 0.08, len * 0.4, 0, 0, TAU); g.fill(); g.restore(); }
      }
      if (P.blotch) for (let i = 0; i < P.n; i++) { g.save(); g.rotate(i / P.n * TAU); g.fillStyle = col(P.blotch, 0.92); g.beginPath(); g.ellipse(0, P.len * 0.22, P.w * 0.32, P.len * 0.13, 0, 0, TAU); g.fill(); g.restore(); }
      if (P.stamens) { g.fillStyle = col(P.stamens, 1, -0.1); g.beginPath(); g.arc(0, 0, P.stamR || 14, 0, TAU); g.fill();
        for (let i = 0; i < 60; i++) { const a = r() * TAU, d = (P.stamR || 14) + r() * (P.stamSpread || 10); g.fillStyle = col(P.stamTip || '#f2d24a', 1, r() * 0.3); g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, 2, 0, TAU); g.fill(); } }
      if (P.pistil) { g.strokeStyle = col(P.pistil, 1); g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(18, -30); g.stroke(); }
      if (P.rose) {   // rose: spiral of petals into a dark heart
        for (let ring = 0; ring < 6; ring++) { const rr = P.len * (0.62 - ring * 0.1), n = 7 - ring;
          for (let i = 0; i < n; i++) { const a = i / n * TAU + ring * 0.7; g.fillStyle = col(c, 1, -0.05 - ring * 0.07 + r() * 0.05); g.beginPath(); g.ellipse(Math.cos(a) * rr * 0.55, Math.sin(a) * rr * 0.55, rr * 0.55, rr * 0.36, a + Math.PI / 2, 0, TAU); g.fill();
            g.strokeStyle = col(c, 0.5, -0.4); g.lineWidth = 1.4; g.stroke(); } }
        g.fillStyle = col(c, 1, -0.5); g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.fill();
      }
    };
  }
  function iris(g, L) {
    const c = L.flCol, eye = L.flEye || '#f2e7c4', beard = L.flCol2 || null;
    g.translate(128, 128);
    const pt = (a, len, w, k) => { const lg = g.createLinearGradient(0, 0, 0, len); lg.addColorStop(0, col(c, 1, -0.35)); lg.addColorStop(0.6, col(c, 1, k)); lg.addColorStop(1, col(c, 1, k - 0.1)); petal(g, a, 0, len, w, lg, { stroke: col(c, 0.4, -0.5) }); };
    for (let i = 0; i < 3; i++) pt(i * TAU / 3 + 0.2, 118, 54, 0.05);
    for (let i = 0; i < 3; i++) { g.save(); g.rotate(i * TAU / 3 + 0.2); g.fillStyle = col(eye, 0.95); g.beginPath(); g.ellipse(0, 40, 10, 26, 0, 0, TAU); g.fill();
      if (beard) { g.fillStyle = col(beard, 1); g.beginPath(); g.ellipse(0, 34, 4, 18, 0, 0, TAU); g.fill(); }
      g.strokeStyle = col(c, 0.8, -0.4); g.lineWidth = 1.5; for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(k * 3, 22); g.lineTo(k * 6, 64); g.stroke(); } g.restore(); }
    for (let i = 0; i < 3; i++) pt(i * TAU / 3 + 0.2 + Math.PI / 3, 74, 36, 0.22);
  }
  function cluster(P) {   // round heads seen face-on: phlox, umbels, alliums, hydrangea, echinops
    return (g, L) => {
      const r = rngOf(P.n * 7 + (P.seed || 1)), c = L.flCol, eye = L.flEye || col(c, 1, -0.3);
      const W = P.full ? 256 : 256; g.translate(128, 128);
      if (P.bg) { g.fillStyle = col(P.bg === true ? c : P.bg, 1, -0.35); g.beginPath(); g.arc(0, 0, P.full ? 128 : P.R * 0.92, 0, TAU); g.fill(); }
      const pts = []; for (let i = 0; i < P.n; i++) { if (P.full) pts.push([r() * 256 - 128, r() * 256 - 128]); else { const a = r() * TAU, d = Math.sqrt(r()) * P.R; pts.push([Math.cos(a) * d, Math.sin(a) * d]); } }
      pts.sort((a, b) => a[1] - b[1]);
      for (const [x, y] of pts) {
        const k = -0.28 + (P.full ? r() * 0.4 : (P.R - y) / (2 * P.R) * 0.35 + r() * 0.1), fr = P.fr * (0.8 + r() * 0.4);
        if (P.stems) { g.strokeStyle = col(P.stems, 0.8); g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, 0); g.lineTo(x, y); g.stroke(); }
        g.fillStyle = col(c, 1, k);
        if (P.floret === 'five' || P.floret === 'four') { const n = P.floret === 'five' ? 5 : 4; for (let p = 0; p < n; p++) { const a = p / n * TAU + r(); g.beginPath(); g.ellipse(x + Math.cos(a) * fr * 0.55, y + Math.sin(a) * fr * 0.55, fr * 0.6, fr * 0.45, a, 0, TAU); g.fill(); }
          g.fillStyle = col(eye, 1, 0); g.beginPath(); g.arc(x, y, fr * 0.22, 0, TAU); g.fill(); }
        else if (P.floret === 'star') { g.beginPath(); for (let p = 0; p < 12; p++) { const rr = p % 2 ? fr * 0.3 : fr, aa = p / 12 * TAU; p ? g.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr) : g.moveTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr); } g.closePath(); g.fill(); }
        else if (P.floret === 'spike') { for (let p = 0; p < 7; p++) { const a = r() * TAU; g.strokeStyle = col(c, 1, k + 0.1); g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * fr, y + Math.sin(a) * fr); g.stroke(); } }
        else if (P.floret === 'tube') { const a = Math.atan2(y, x); g.strokeStyle = col(c, 1, k); g.lineWidth = fr * 0.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(x * 0.3, y * 0.3); g.lineTo(x + Math.cos(a) * fr, y + Math.sin(a) * fr); g.stroke(); }
        else { g.beginPath(); g.arc(x, y, fr * 0.6, 0, TAU); g.fill(); g.fillStyle = col(c, 1, k + 0.35); g.beginPath(); g.arc(x - fr * 0.15, y - fr * 0.15, fr * 0.25, 0, TAU); g.fill(); }
      }
      if (P.centre) { g.fillStyle = col(P.centre, 1); g.beginPath(); g.arc(0, 0, P.centreR || 30, 0, TAU); g.fill(); }
    };
  }
  function spike(P) {   // vertical racemes drawn base-down
    return (g, L, W, H) => {
      const r = rngOf(P.n * 13 + 3), c = L.flCol, cx = W / 2;
      stemLine(g, cx, H, cx, 6, P.stemW || 3, P.stem || '#6f7f60');
      for (let i = 0; i < P.n; i++) {
        const t = i / P.n, y = H - (P.base || 14) - t * (H - (P.base || 14) - 8), s = 1 - t * (P.taper || 0.55);
        const bud = P.budsTop ? t > 0.82 : P.budsBottom ? t < 0.18 : false;
        const per = P.whorl || 2;
        for (let k = 0; k < per; k++) {
          const ang = k / per * TAU + i * 1.3, side = per === 2 ? (k ? 1 : -1) : Math.cos(ang);
          const x = cx + side * (P.spread || 6) * s, yy = y + (per > 2 ? Math.sin(ang) * 4 : 0);
          const kk = bud ? -0.35 : -0.15 + r() * 0.35;
          g.fillStyle = bud && P.budCol ? col(P.budCol, 1, r() * 0.2) : col(P.multi ? P.multi[i % P.multi.length] : c, 1, kk);
          if (P.floret === 'fuzz') { for (let f = 0; f < 6; f++) { g.strokeStyle = g.fillStyle; g.lineWidth = 1.6; const a2 = r() * TAU; g.beginPath(); g.moveTo(cx, yy); g.lineTo(cx + Math.cos(a2) * P.fw * s, yy + Math.sin(a2) * P.fh * s * 0.6); g.stroke(); } }
          else if (P.floret === 'open') { for (let p = 0; p < 5; p++) { const a2 = p / 5 * TAU; g.beginPath(); g.ellipse(x + Math.cos(a2) * P.fw * s * 0.3, yy + Math.sin(a2) * P.fw * s * 0.3, P.fw * s * 0.32, P.fw * s * 0.24, a2, 0, TAU); g.fill(); }
            g.fillStyle = col(P.eye || '#ffffff', 1); g.beginPath(); g.arc(x, yy, P.fw * s * 0.14, 0, TAU); g.fill(); }
          else if (P.floret === 'bell') { g.save(); g.translate(x, yy); g.rotate(side * 0.5); g.beginPath(); g.moveTo(-P.fw * s * 0.2, 0); g.lineTo(-P.fw * s * 0.5, P.fh * s); g.lineTo(P.fw * s * 0.5, P.fh * s); g.lineTo(P.fw * s * 0.2, 0); g.closePath(); g.fill(); g.restore(); }
          else { g.beginPath(); g.ellipse(x, yy, P.fw * s * 0.5, P.fh * s * 0.5, side * 0.6, 0, TAU); g.fill();
            if (!bud && P.lip) { g.fillStyle = col(P.lip === true ? c : P.lip, 0.9, 0.35); g.beginPath(); g.ellipse(x + side * 2 * s, yy - 2 * s, P.fw * s * 0.22, P.fh * s * 0.2, 0, 0, TAU); g.fill(); } }
        }
      }
    };
  }
  function haze(P) {   // airy branched sprays: perovskia, grasses, solidago
    return (g, L, W, H) => {
      const r = rngOf(P.seed || 5), c = L.flCol, cx = W / 2;
      stemLine(g, cx, H, cx + (P.arch ? W * 0.3 : 0), 6, P.stemW || 2.5, P.stem || '#c9cfcc');
      const nb = P.branches || 22;
      for (let i = 0; i < nb; i++) {
        const t = i / nb, y = H - (P.start || 0.15) * H - t * (H * (1 - (P.start || 0.15)) - 8), sx = cx + (P.arch ? W * 0.3 * t * t : 0);
        const s = i % 2 ? 1 : -1, L2 = (P.reach || 46) * (P.taper === false ? 1 : 1 - t * 0.5);
        const ex = sx + s * L2 * (P.narrow ? 0.35 : 1), ey = y - L2 * (P.up || 0.7);
        g.strokeStyle = P.stem || '#c9cfcc'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(sx, y); g.lineTo(ex, ey); g.stroke();
        for (let k = 0; k < (P.dots || 16); k++) { const u = r(); g.fillStyle = col(c, P.alpha || 0.95, -0.25 + r() * 0.45);
          g.beginPath(); g.arc(sx + (ex - sx) * u + (r() - 0.5) * (P.jit || 6), y + (ey - y) * u + (r() - 0.5) * (P.jit || 6), (P.dot || 2.4) + r() * 1.6, 0, TAU); g.fill(); }
      }
    };
  }
  function foxglove(g, L, W, H) {
    const r = rngOf(4), c = L.flCol, cx = W / 2;
    stemLine(g, cx, H, cx, 4, 6, '#7c8a64');
    const n = 22;
    for (let i = 0; i < n; i++) { const t = i / n, y = H - 30 - t * (H - 50), side = i % 2 ? 1 : -1, s = 1 - t * 0.65, bud = t > 0.78;
      g.save(); g.translate(cx + side * 10 * s, y); g.rotate(side * 0.25);
      const bl = 54 * s, bw = 22 * s;
      g.beginPath(); g.moveTo(-bw * 0.4, 0); g.bezierCurveTo(-bw, bl * 0.4, -bw * 1.1, bl * 0.9, -bw * 0.9, bl); g.lineTo(bw * 0.9, bl); g.bezierCurveTo(bw * 1.1, bl * 0.9, bw, bl * 0.4, bw * 0.4, 0); g.closePath();
      const gr = g.createLinearGradient(-bw, 0, bw, 0); gr.addColorStop(0, col(bud ? '#9fb07a' : c, 1, -0.3)); gr.addColorStop(0.5, col(bud ? '#c9a3b0' : c, 1, 0.1)); gr.addColorStop(1, col(bud ? '#9fb07a' : c, 1, -0.2));
      g.fillStyle = gr; g.fill();
      if (!bud) { g.fillStyle = col(c, 1, 0.5); g.beginPath(); g.ellipse(0, bl, bw * 0.85, bw * 0.35, 0, 0, TAU); g.fill();
        for (let k = 0; k < 6; k++) { g.fillStyle = col('#4a1030', 0.85); g.beginPath(); g.arc((r() - 0.5) * bw, bl * (0.75 + r() * 0.2), 1.6 * s + 0.6, 0, TAU); g.fill(); } }
      g.restore(); }
  }
  function ballStyle(P) {   // phlox domes, monarda whorls, froth, amsonia stars (cross-impostors)
    return (g, L) => {
      const st = P.kind, col0 = L.flCol, eye = L.flEye || '#e0c040', r = rngOf(st.length * 97 + col0.charCodeAt(2));
      g.translate(128, 128);
      if (st === 'phlox') {
        const pts = []; for (let i = 0; i < 70; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 100; pts.push([Math.cos(a) * d, Math.sin(a) * d * 0.92]); }
        pts.sort((a, b) => a[1] - b[1]);
        for (const [x, y] of pts) { const k = -0.25 + (100 - y) / 200 * 0.35 + r() * 0.08;
          for (let p = 0; p < 5; p++) { const a = p / 5 * TAU + r(); g.fillStyle = col(col0, 1, k); g.beginPath(); g.ellipse(x + Math.cos(a) * 8, y + Math.sin(a) * 8, 9, 7, a, 0, TAU); g.fill(); }
          g.fillStyle = col(eye, 1, 0); g.beginPath(); g.arc(x, y, 3.4, 0, TAU); g.fill(); }
      } else if (st === 'whorl') {
        g.fillStyle = col('#5b4a3a', 1); g.beginPath(); g.arc(0, 0, 34, 0, TAU); g.fill();
        for (let i = 0; i < 60; i++) { const a = r() * TAU, d0 = 16 + r() * 14, d1 = 70 + r() * 45, bend = (r() - 0.5) * 0.5;
          g.strokeStyle = col(col0, 1, -0.2 + r() * 0.3); g.lineWidth = 7 + r() * 3; g.lineCap = 'round';
          g.beginPath(); g.moveTo(Math.cos(a) * d0, Math.sin(a) * d0); g.quadraticCurveTo(Math.cos(a + bend) * d1 * 0.6, Math.sin(a + bend) * d1 * 0.6, Math.cos(a + bend * 1.6) * d1, Math.sin(a + bend * 1.6) * d1); g.stroke(); }
        for (let i = 0; i < 20; i++) { const a = r() * TAU; g.fillStyle = col(eye, 0.8); g.beginPath(); g.arc(Math.cos(a) * 22, Math.sin(a) * 22, 6, 0, TAU); g.fill(); }
      } else if (st === 'froth') {
        for (let i = 0; i < 14; i++) { const a = r() * TAU, L2 = 60 + r() * 55;
          g.strokeStyle = col('#8c9a54', 0.9); g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * L2, Math.sin(a) * L2); g.stroke();
          for (let k = 0; k < 26; k++) { const t = 0.35 + r() * 0.65, j = (r() - 0.5) * 22; g.fillStyle = col(col0, 1, -0.2 + r() * 0.4); g.beginPath(); g.arc(Math.cos(a) * L2 * t - Math.sin(a) * j, Math.sin(a) * L2 * t + Math.cos(a) * j, 2.2 + r() * 2.2, 0, TAU); g.fill(); } }
      } else if (st === 'star') {
        for (let i = 0; i < 34; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 96, x = Math.cos(a) * d, y = Math.sin(a) * d;
          g.strokeStyle = col('#6c8a4a', 0.8); g.lineWidth = 1.4; g.beginPath(); g.moveTo(0, 0); g.lineTo(x, y); g.stroke();
          g.fillStyle = col(col0, 1, -0.1 + r() * 0.25); g.beginPath();
          for (let p = 0; p < 10; p++) { const rr = p % 2 ? 5 : 14, aa = p / 10 * TAU + a; p ? g.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr) : g.moveTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr); }
          g.closePath(); g.fill(); }
      } else if (st === 'peony') {
        for (let ring = 0; ring < 7; ring++) { const rr = 112 - ring * 15, n = 11 - ring;
          for (let i = 0; i < n; i++) { const a = i / n * TAU + ring * 0.5 + r() * 0.3;
            g.fillStyle = col(col0, 1, -0.22 + ring * 0.07 + r() * 0.06); g.beginPath(); g.ellipse(Math.cos(a) * rr * 0.62, Math.sin(a) * rr * 0.62, rr * 0.42, rr * 0.3, a + Math.PI / 2, 0, TAU); g.fill();
            g.strokeStyle = col(col0, 0.5, -0.35); g.lineWidth = 1.2; g.stroke(); } }
        g.fillStyle = col(eye, 1, 0.1); g.beginPath(); g.arc(0, 0, 14, 0, TAU); g.fill();
      }
    };
  }

  // style → { kind, size [w,h], paint, curve, cone }
  const FL = {
    // discs (face the sun; curve > 0 cups up, < 0 droops)
    shasta: { kind: 'disc', paint: daisy({ n: 26, len: 114, w: 14, c0: 31, notch: true }), curve: -0.04 },
    coneflower: { kind: 'disc', paint: daisy({ n: 15, len: 108, w: 21, c0: 38, cone: true }), curve: -0.3, cone: 0.16 },
    rudbeckia: { kind: 'disc', paint: daisy({ n: 14, len: 108, w: 22, c0: 30 }), curve: -0.1, cone: 0.08 },
    aster: { kind: 'disc', paint: daisy({ n: 36, len: 100, w: 7.5, c0: 26 }), curve: 0.02 },
    coreopsis: { kind: 'disc', paint: daisy({ n: 8, len: 110, w: 40, c0: 24, notch: true }), curve: 0.04 },
    gaillardia: { kind: 'disc', paint: daisy({ n: 14, len: 110, w: 24, c0: 30, notch: true }), curve: 0.05, cone: 0.05 },
    helenium: { kind: 'disc', paint: daisy({ n: 14, len: 104, w: 22, c0: 34, notch: true }), curve: -0.22, cone: 0.16 },
    heliopsis: { kind: 'disc', paint: daisy({ n: 16, len: 110, w: 20, c0: 30 }), curve: 0.02, cone: 0.05 },
    geranium: { kind: 'disc', paint: cup({ n: 5, len: 116, w: 66, eyeStop: 0.3, veins: '#3a2a7a' }), curve: 0.12 },
    anemone: { kind: 'disc', paint: cup({ n: 6, len: 112, w: 56, stamens: '#9bc04a', stamR: 16, stamSpread: 14 }), curve: 0.12 },
    dianthus: { kind: 'disc', paint: cup({ n: 5, len: 112, w: 52, fringe: true, eyeStop: 0.25, stamens: null }), curve: 0.04 },
    platycodon: { kind: 'disc', paint: cup({ n: 5, len: 116, w: 60, tipW: 0.6, veins: '#1e2a7a', stamens: '#f4f4ff', stamR: 8, stamSpread: 4 }), curve: 0.32 },
    poppy: { kind: 'disc', paint: cup({ n: 4, len: 120, w: 84, blotch: '#120a0a', stamens: '#1a1414', stamR: 18, stamSpread: 16, stamTip: '#2a1a40' }), curve: 0.34 },
    hibiscus: { kind: 'disc', paint: cup({ n: 5, len: 122, w: 78, eyeStop: 0.28, veins: '#c0c0c0', pistil: '#f4f0e0' }), curve: 0.26 },
    daylily: { kind: 'disc', paint: cup({ n: 6, len: 120, w: 34, tipW: 0.7, eyeStop: 0.25, stripe: '#fff3c0', pistil: '#f0d060' }), curve: 0.42 },
    lily: { kind: 'disc', paint: cup({ n: 6, len: 122, w: 38, tipW: 0.6, eyeStop: 0.2, blotch: null, stripe: null, stamens: null, pistil: '#6a2a10' }), curve: 0.3 },
    rose: { kind: 'disc', paint: cup({ n: 7, len: 122, w: 56, rose: true }), curve: 0.36 },
    peonyCup: { kind: 'disc', paint: cup({ n: 9, len: 124, w: 54, rose: true, layers: 2 }), curve: 0.4 },
    aquilegia: { kind: 'disc', paint: cup({ n: 5, len: 114, w: 26, tipW: 0.5, eyeStop: 0.45, stamens: '#f2d24a', stamR: 10, stamSpread: 6 }), curve: -0.35 },
    iris: { kind: 'disc', paint: iris, curve: -0.12 },
    umbel: { kind: 'disc', paint: cluster({ n: 140, R: 112, fr: 13, floret: 'five', bg: true }), curve: -0.14 },
    joepye: { kind: 'disc', paint: cluster({ n: 200, R: 116, fr: 9, floret: 'tube', bg: true }), curve: -0.32 },
    // cross-impostor balls
    phlox: { kind: 'ball', paint: ballStyle({ kind: 'phlox' }) }, whorl: { kind: 'ball', paint: ballStyle({ kind: 'whorl' }) },
    froth: { kind: 'ball', paint: ballStyle({ kind: 'froth' }) }, star: { kind: 'ball', paint: ballStyle({ kind: 'star' }) },
    peony: { kind: 'ball', paint: ballStyle({ kind: 'peony' }) },
    // true spheres (alpha-cut florets wrapped on an icosphere)
    allium: { kind: 'sphere', paint: cluster({ n: 260, full: true, fr: 11, floret: 'star' }) },
    echinops: { kind: 'sphere', paint: cluster({ n: 420, full: true, fr: 9, floret: 'spike', bg: true }) },
    hydrangea: { kind: 'sphere', paint: cluster({ n: 180, full: true, fr: 22, floret: 'four', bg: true }) },
    // spikes (crossed cards, base at the bottom)
    nepeta: { kind: 'spike', size: [64, 256], paint: spike({ n: 9, fw: 14, fh: 9, base: 14, whorl: 6, spread: 12, stem: '#8a9a8c', budsTop: true }) },
    salvia: { kind: 'spike', size: [64, 256], paint: spike({ n: 30, fw: 9, fh: 13, stem: '#4d3a5e', lip: true, budsTop: true }) },
    baptisia: { kind: 'spike', size: [128, 512], paint: spike({ n: 18, fw: 22, fh: 18, base: 20, stemW: 5, stem: '#3e4a52', lip: true, budsTop: true }) },
    lupine: { kind: 'spike', size: [128, 512], paint: spike({ n: 26, fw: 20, fh: 16, whorl: 5, spread: 18, taper: 0.7, stemW: 6, stem: '#5a6a48', lip: '#ffffff', budsTop: true }) },
    delphinium: { kind: 'spike', size: [128, 512], paint: spike({ n: 16, fw: 34, fh: 30, whorl: 3, spread: 20, taper: 0.5, floret: 'open', eye: '#f2f2f2', stemW: 5, stem: '#4a6a48', budsTop: true }) },
    liatris: { kind: 'spike', size: [64, 256], paint: spike({ n: 46, fw: 18, fh: 10, floret: 'fuzz', stemW: 4, stem: '#4a5a3a', budsBottom: true, budCol: '#7a6a8a' }) },
    veronica: { kind: 'spike', size: [64, 256], paint: spike({ n: 44, fw: 10, fh: 8, whorl: 3, spread: 5, taper: 0.7, stem: '#4a6a48', budsTop: true }) },
    lavender: { kind: 'spike', size: [64, 256], paint: spike({ n: 12, fw: 10, fh: 9, base: 120, whorl: 5, spread: 6, taper: 0.4, stem: '#8a9a8c' }) },
    agastache: { kind: 'spike', size: [64, 256], paint: spike({ n: 34, fw: 12, fh: 10, whorl: 4, spread: 7, taper: 0.5, stem: '#6a6a7a', budsTop: true }) },
    penstemon: { kind: 'spike', size: [128, 256], paint: haze({ branches: 14, reach: 34, dots: 7, dot: 5, jit: 4, stem: '#6a3a3a', up: 0.6 }) },
    stachys: { kind: 'spike', size: [64, 256], paint: spike({ n: 14, fw: 16, fh: 12, base: 90, whorl: 4, spread: 4, taper: 0.3, floret: 'fuzz', stem: '#c8c8c0', stemW: 5 }) },
    haze: { kind: 'spike', size: [128, 512], paint: haze({}) },
    solidago: { kind: 'spike', size: [128, 512], paint: haze({ arch: true, branches: 20, reach: 40, dots: 22, dot: 2.2, stem: '#6a7a48', up: 0.3 }) },
    plumeFeather: { kind: 'spike', size: [64, 512], paint: haze({ branches: 40, reach: 14, dots: 10, dot: 1.8, jit: 3, start: 0.45, narrow: true, up: 0.9, stem: '#b8a878', taper: false }) },
    plumeAiry: { kind: 'spike', size: [128, 512], paint: haze({ branches: 26, reach: 52, dots: 10, dot: 1.6, jit: 8, start: 0.35, up: 0.8, stem: '#b0a080', alpha: 0.85 }) },
    plumeBrush: { kind: 'spike', size: [64, 256], paint: spike({ n: 40, fw: 22, fh: 8, base: 110, floret: 'fuzz', stem: '#a89a78', taper: 0.25 }) },
    plumeTuft: { kind: 'spike', size: [64, 512], paint: haze({ branches: 18, reach: 12, dots: 8, dot: 2.2, jit: 4, start: 0.3, narrow: true, up: 0.9, stem: '#9a7a5a' }) },
    foxglove: { kind: 'spike', size: [128, 512], paint: foxglove },
  };

  // ================= geometry =================
  function quadsGeo(T, quads) {
    const pos = [], nor = [], uv = [], idx = []; let v = 0;
    const UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (const q of quads) for (let side = 0; side < 2; side++) {
      for (let i = 0; i < 4; i++) { pos.push(...q.p[i]); nor.push(...(q.ns ? q.ns[i] : q.n)); uv.push(...(q.uv ? q.uv[i] : UV[i])); }
      if (side === 0) idx.push(v, v + 1, v + 2, v, v + 2, v + 3); else idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
      v += 4;
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    return g;
  }
  // a leaf card folded along its midrib and arched toward the tip; both faces share the upper normal (thin, translucent leaves)
  function curvedLeaf(T, fold = 0.12, arch = 0.25, ny = 4) {
    const P = (u, v) => { const x = u - 0.5; return [x, v - arch * 0.25 * v * v, Math.abs(x) * fold * 2 - arch * v * v]; };
    const quads = [];
    for (let j = 0; j < ny; j++) for (const [u0, u1] of [[0, 0.5], [0.5, 1]]) {
      const v0 = j / ny, v1 = (j + 1) / ny;
      const p = [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)];
      const nsOf = (u, v) => { const dx = u < 0.5 ? -1 : 1; const n = [-dx * fold * 1.2, 0.25 + arch * v * 0.8, 1]; const l = Math.hypot(...n); return n.map(c => c / l); };
      quads.push({ p, uv: [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], ns: [nsOf(u0, v0), nsOf(u1, v0), nsOf(u1, v1), nsOf(u0, v1)] });
    }
    return quadsGeo(T, quads);
  }
  function strapGeo(T, bend = 0.22, N = 8) {
    const quads = [];
    for (let i = 0; i < N; i++) { const y0 = i / N, y1 = (i + 1) / N, z0 = bend * y0 * y0, z1 = bend * y1 * y1;
      quads.push({ p: [[-.5, y0 * (1 - bend * 0.3 * y0), z0], [.5, y0 * (1 - bend * 0.3 * y0), z0], [.5, y1 * (1 - bend * 0.3 * y1), z1], [-.5, y1 * (1 - bend * 0.3 * y1), z1]], n: [0, 0.3, 1], uv: [[0, y0], [1, y0], [1, y1], [0, y1]] }); }
    return quadsGeo(T, quads);
  }
  function crossGeo(T, n, center, cap) {
    const quads = [], y0 = center ? -0.5 : 0, y1 = center ? 0.5 : 1;
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI, c = Math.cos(a) * 0.5, s = Math.sin(a) * 0.5;
      quads.push({ p: [[-c, y0, -s], [c, y0, s], [c, y1, s], [-c, y1, -s]], n: [0, 1, 0] }); }
    if (cap) { const y = center ? 0.05 : 0.55; quads.push({ p: [[-.5, y, .5], [.5, y, .5], [.5, y, -.5], [-.5, y, -.5]], n: [0, 1, 0] }); }
    return quadsGeo(T, quads);
  }
  // flower head as a polar mesh: cupped (curve>0) or reflexed (curve<0), optional raised cone
  function discGeo(T, curve = 0, cone = 0) {
    const RINGS = 5, SECT = 16, pos = [], uv = [], idx = [];
    pos.push(0, cone * 0.5, 0); uv.push(0.5, 0.5);
    for (let i = 1; i <= RINGS; i++) for (let j = 0; j < SECT; j++) {
      const r = 0.5 * i / RINGS, a = j / SECT * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = curve * Math.pow(r / 0.5, 2) * 0.5 + (r < 0.17 ? cone * 0.5 * (1 - r / 0.17) : 0);
      pos.push(x, y, z); uv.push(0.5 + x, 0.5 - z);
    }
    for (let j = 0; j < SECT; j++) idx.push(0, 1 + (j + 1) % SECT, 1 + j);
    for (let i = 1; i < RINGS; i++) for (let j = 0; j < SECT; j++) {
      const a = 1 + (i - 1) * SECT + j, b = 1 + (i - 1) * SECT + (j + 1) % SECT, c = 1 + i * SECT + j, d = 1 + i * SECT + (j + 1) % SECT;
      idx.push(a, b, d, a, d, c);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    // add back faces with the same (upper) normals so petals read from below too
    const n = g.attributes.normal.array, P = g.attributes.position.array, U = g.attributes.uv.array, cnt = P.length / 3;
    const pos2 = Float32Array.from([...P, ...P]), nor2 = Float32Array.from([...n, ...n]), uv2 = Float32Array.from([...U, ...U]);
    const idx2 = [...idx]; for (let k = 0; k < idx.length; k += 3) idx2.push(idx[k] + cnt, idx[k + 2] + cnt, idx[k + 1] + cnt);
    const g2 = new T.BufferGeometry();
    g2.setAttribute('position', new T.BufferAttribute(pos2, 3)); g2.setAttribute('normal', new T.BufferAttribute(nor2, 3)); g2.setAttribute('uv', new T.BufferAttribute(uv2, 2)); g2.setIndex(idx2);
    return g2;
  }

  function leafTexture(T, key, renderer) { const [w, h, draw] = LEAF[key]; const [c, g] = canvas(w, h); draw(g, w, h); return finish(T, c, renderer); }
  function flowerTexture(T, L, renderer) {
    const F = FL[L.flStyle]; const [w, h] = F.size || [256, 256]; const [c, g] = canvas(w, h); g.save(); F.paint(g, L, w, h); g.restore(); return finish(T, c, renderer);
  }
  function finish(T, c, renderer) { const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t; }
  function leafGeometry(T, L) {
    if (L.leaf === 'sword') return strapGeo(T, L.bend != null ? L.bend : 0.22);
    if (L.leaf === 'blade') return strapGeo(T, L.bend != null ? L.bend : 0.5, 10);
    return curvedLeaf(T, L.fold != null ? L.fold : 0.1, L.arch != null ? L.arch : 0.22);
  }
  function flowerGeometry(T, L) {
    const F = FL[L.flStyle];
    if (F.kind === 'disc') return discGeo(T, L.curve != null ? L.curve : F.curve || 0, F.cone || 0);
    if (F.kind === 'ball') return crossGeo(T, 3, true, true);
    if (F.kind === 'sphere') return new T.IcosahedronGeometry(0.5, 3);
    return crossGeo(T, 3, false, false);
  }

  // ================= plant structure (normalised: x,z in zone radii, y in heights) =================
  function make(T) {
    const V3 = T.Vector3, Q = T.Quaternion, _Y = new V3(0, 1, 0);
    function orient(d, jit, want) {
      const dir = new V3(d[0], d[1], d[2]).normalize();
      const q1 = new Q().setFromUnitVectors(_Y, dir);
      const n = new V3(0, 0, 1).applyQuaternion(q1);
      const w = want ? new V3(...want) : new V3(0, 1, 0);
      w.addScaledVector(dir, -w.dot(dir));
      if (w.lengthSq() < 1e-5) return q1;
      w.normalize();
      const ang = Math.atan2(dir.dot(new V3().crossVectors(n, w)), n.dot(w)) + jit;
      return new Q().setFromAxisAngle(dir, ang).multiply(q1);
    }
    const stemAt = (pts, t) => { const f = t * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), u = f - i; return [0, 1, 2].map(k => lerp(pts[i][k], pts[i + 1][k], u)); };
    function shuffle(a, r) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
    function stemPts(bx, bz, da, lean, tip, curveExp = 1.5) { const pts = []; for (let i = 0; i <= 3; i++) { const t = i / 3; pts.push([bx + Math.cos(da) * lean * Math.pow(t, curveExp), tip * t, bz + Math.sin(da) * lean * Math.pow(t, curveExp)]); } return pts; }

    function gen(L, seed) {
      const r = rngOf(seed), leaves = [], stems = [], fls = [], spires = [];
      const F = FL[L.flStyle] || { kind: 'none' };
      const leaf = (p, d, s, extra = {}) => leaves.push(Object.assign({ p, q: orient(d, (r() - 0.5) * 0.9), s: s * (0.8 + r() * 0.4), v: r(), m: r(), ht: p[1] }, extra));
      const sun = (out) => orient([out[0] * 0.35 + (r() - 0.5) * 0.5, 0.75 + r() * 0.4, 0.55 + r() * 0.45 + out[2] * 0.2], r() * TAU);
      const flower = (p, dir, out, extra = {}) => {
        let q;
        if (F.kind === 'disc') q = (F.curve || 0) < -0.25 || L.nod ? orient([out[0] * 0.8 + (r() - .5) * .4, 0.15 + r() * 0.35, out[2] * 0.8 + 0.3], r() * TAU) : sun(out);
        else if (F.kind === 'ball' || F.kind === 'sphere') q = orient([dir[0] * 0.4 + (r() - 0.5) * 0.3, 1, dir[2] * 0.4 + (r() - 0.5) * 0.3], r() * TAU);
        else q = orient([dir[0] * 0.6 + (r() - 0.5) * 0.25, 1, dir[2] * 0.6 + (r() - 0.5) * 0.25], r() * TAU);
        fls.push(Object.assign({ p, q, s: 0.8 + r() * 0.4 }, extra));
      };
      const form = L.form;
      if (form === 'upright' || form === 'shrub') {
        for (let s = 0; s < L.stems; s++) {
          const a = r() * TAU, b = Math.sqrt(r()) * (form === 'shrub' ? 0.22 : 0.14), bx = Math.cos(a) * b, bz = Math.sin(a) * b;
          const da = a + (r() - 0.5) * 0.9, lean = lerp(L.lean[0], L.lean[1], r()), tip = 0.78 + 0.22 * r();
          const pts = stemPts(bx, bz, da, lean, tip, form === 'shrub' ? 1.1 : 1.5); stems.push(pts);
          const out = [Math.cos(da), 0, Math.sin(da)];
          const t0 = form === 'shrub' ? 0.25 : 0.1;
          for (let j = 0; j < L.perStem; j++) {
            const t = t0 + (0.92 - t0) * (j / L.perStem) + r() * 0.04, p = stemAt(pts, t), n = L.opposite ? 2 : 1, base = j * (L.opposite ? 1.57 : 2.4) + r() * 0.6;
            for (let m = 0; m < n; m++) { const phi = base + m * Math.PI; leaf(p, [Math.cos(phi), 0.45 + r() * 0.4, Math.sin(phi)], 1 - 0.4 * t); }
          }
          if (L.flAt === 'tips') flower(pts[3], [pts[3][0] - pts[2][0], 1, pts[3][2] - pts[2][2]], out);
        }
        const nb = L.basal != null ? Math.max(L.basal, Math.round(L.stems * 0.8)) : Math.round(L.stems * 1.4);   // a ground layer of foliage under the stems
        for (let j = 0; j < nb; j++) { const phi = r() * TAU, rho = Math.sqrt(r()) * (form === 'shrub' ? 0.55 : 0.4); leaf([Math.cos(phi) * rho, 0.01 + r() * (form === 'shrub' ? 0.3 : 0.12), Math.sin(phi) * rho], [Math.cos(phi), 0.3 + r() * 0.35, Math.sin(phi)], 1.15, { basal: true }); }
        const extra = L.flN - (L.flAt === 'tips' ? L.stems : 0);
        for (let i = 0; i < extra; i++) {
          const s = Math.floor(r() * stems.length), pts = stems[s], t = L.flAt === 'upper' ? 0.5 + 0.5 * r() : 0.82 + 0.18 * r(), p = stemAt(pts, t);
          const a = r() * TAU, d = (L.flAt === 'upper' ? 0.05 : 0.03) + r() * 0.1;
          flower([p[0] + Math.cos(a) * d, p[1] + r() * 0.04, p[2] + Math.sin(a) * d], [Math.cos(a), 1, Math.sin(a)], [pts[3][0], 0, pts[3][2]]);
        }
      } else if (form === 'mound') {
        const H0 = L.moundH;
        for (let i = 0; i < L.leaves; i++) {
          const rho = Math.sqrt(r()) * 0.9, th = r() * TAU, y = H0 * Math.pow(1 - rho * rho, 0.55) * (0.5 + 0.5 * r());
          leaf([Math.cos(th) * rho * 0.9, Math.max(0, y - 0.15 * H0), Math.sin(th) * rho * 0.9], [Math.cos(th) * (rho + 0.2) + (r() - 0.5) * 0.4, 0.5 + (1 - rho) * 0.9, Math.sin(th) * (rho + 0.2) + (r() - 0.5) * 0.4], 1);
        }
        for (let i = 0; i < L.flN; i++) {
          const rho = Math.sqrt(r()) * 0.8, th = r() * TAU, y = H0 * Math.pow(1 - rho * rho, 0.55) * (0.75 + 0.25 * r());
          const out = [Math.cos(th) * rho, 0, Math.sin(th) * rho], p = [Math.cos(th) * rho * 0.82, y, Math.sin(th) * rho * 0.82];
          if (L.flAt === 'stalks') {   // wiry stems rising above the mound (anemone, dianthus, veronica, lavender…)
            const top = 0.85 + r() * 0.2, pts = [p, [p[0] * 1.05, lerp(y, top, 0.33), p[2] * 1.05], [p[0] * 1.1, lerp(y, top, 0.66), p[2] * 1.1], [p[0] * 1.15 + (r() - .5) * 0.1, top, p[2] * 1.15 + (r() - .5) * 0.1]];
            stems.push(pts); flower(pts[3], [out[0], 1, out[2]], out);
          } else flower(p, [out[0], 1, out[2]], out);
        }
      } else if (form === 'strap' || form === 'grass') {
        const n = L.blades;
        for (let i = 0; i < n; i++) {
          const a = r() * TAU, b = Math.sqrt(r()) * (form === 'grass' ? 0.16 : 0.22), out = [Math.cos(a), 0, Math.sin(a)], lean = lerp(L.lean ? L.lean[0] : 0.12, L.lean ? L.lean[1] : 0.47, r());
          leaves.push({ p: [out[0] * b, 0, out[2] * b], q: orient([out[0] * lean, 1, out[2] * lean], (r() - 0.5) * 0.3, out), s: 1, sword: (L.bladeLen || 0.8) * (0.7 + r() * 0.3), v: r(), m: r(), ht: 0.5 });
        }
        for (let i = 0; i < L.flN; i++) {
          const a = r() * TAU, b = Math.sqrt(r()) * 0.18, lean = (L.scapeLean || 0.1) * (0.5 + r()), tip = 0.92 + r() * 0.12;
          const pts = []; for (let k = 0; k <= 3; k++) { const t = k / 3; pts.push([Math.cos(a) * (b + lean * t * t), tip * t, Math.sin(a) * (b + lean * t * t)]); }
          stems.push(pts);
          if (F.kind === 'spike') flower(stemAt(pts, L.plumeAt || 0.68), [Math.cos(a) * lean, 1, Math.sin(a) * lean], [Math.cos(a), 0, Math.sin(a)], { hs: true });
          else { const nb = L.perScape || 1; for (let k = 0; k < nb; k++) { const p = stemAt(pts, 1 - k * 0.07); flower(k ? [p[0] + (r() - .5) * 0.12, p[1], p[2] + (r() - .5) * 0.12] : p, [0, 1, 0], [Math.cos(a), 0, Math.sin(a)]); } }
        }
      } else if (form === 'rosette') {
        for (let i = 0; i < L.leaves; i++) {
          const th = i * 2.39996, inner = i >= L.leaves * 0.65;
          leaf([Math.cos(th) * 0.05, 0.01, Math.sin(th) * 0.05], [Math.cos(th), inner ? 0.75 : (L.rosUp || 0.28) + r() * 0.15, Math.sin(th)], inner ? 0.7 : 1);
        }
        const [s0, s1] = L.spires || [1, 3], n = s0 + Math.floor(r() * (s1 - s0 + 0.99));
        for (let i = 0; i < n; i++) {
          const a = r() * TAU, lean = 0.04 + r() * (L.spireLean || 0.12), tip = 0.9 + r() * 0.1, pts = [];
          for (let k = 0; k <= 3; k++) { const t = k / 3; pts.push([Math.cos(a) * (0.05 + lean * t * t), tip * t, Math.sin(a) * (0.05 + lean * t * t)]); }
          spires.push(pts);
          fls.push({ p: stemAt(pts, L.spireAt || 0.36), q: orient([Math.cos(a) * lean * 0.6, 1, Math.sin(a) * lean * 0.6], r() * TAU), s: 0.85 + r() * 0.3, hs: true, spire: true });
          for (let k = 0; k < 6; k++) { const t = 0.05 + k * 0.05, phi = r() * TAU; leaf(stemAt(pts, t), [Math.cos(phi), 0.5, Math.sin(phi)], 0.45, { spireLeaf: true }); }
        }
      }
      shuffle(leaves, r); if (form !== 'rosette') shuffle(fls, r);
      const stubs = []; for (let i = 0; i < 7; i++) { const a = r() * TAU; stubs.push({ a, lean: 0.2 + r() * 0.6, len: 3 + r() * 6 }); }
      return { leaves, stems, fls, spires, stubs, flopDir: r() * TAU };
    }
    function counts(L) {
      const F = FL[L.flStyle] || {};
      const leaves = L.form === 'upright' || L.form === 'shrub' ? L.stems * L.perStem * (L.opposite ? 2 : 1) + Math.max(L.basal || 0, Math.round(L.stems * 1.4)) : L.form === 'strap' || L.form === 'grass' ? L.blades : L.form === 'rosette' ? L.leaves + 6 * ((L.spires || [1, 3])[1]) : L.leaves;
      const stems = (L.form === 'upright' || L.form === 'shrub' ? L.stems : L.form === 'strap' || L.form === 'grass' ? L.flN : L.form === 'rosette' ? (L.spires || [1, 3])[1] : L.flAt === 'stalks' ? L.flN : 0) * 3;
      const fls = L.form === 'rosette' ? (L.spires || [1, 3])[1] : L.flN * ((L.form === 'strap' && L.perScape) ? L.perScape : 1);
      return { leaves, stems, fls };
    }
    return { gen, counts };
  }

  return { FL, LEAF, make, leafTexture, flowerTexture, leafGeometry, flowerGeometry, crossGeo, quadsGeo, curvedLeaf, strapGeo, discGeo, rngOf, canvas, col };
})();
