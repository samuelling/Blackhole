// seasons.js — phenology for the garden's plants and trees, driven by each plant's own proper time.
// Bloom months come from Shortwood Meadow's sourced species table (0 = May … 4 = September).
// A plant's state is four numbers: leaf scale, flower scale, leaf tint, flower tint.
// Tint < 0 = fresh spring green, 0 = summer, 0.5 = autumn yellow, 1 = brown / straw / dried seed head.

const BLOOM = {
  nepeta: [0, 1, 2, 3, 4], phloxJ: [2, 3, 4], phloxR: [2, 3], monardaF: [2, 3, 4], monardaJ: [1, 2, 3], echinacea: [1, 2, 3], rudbeckia: [2, 3, 4],
  aster: [3, 4], salvia: [0, 1, 2, 3], geranium: [1, 2, 3, 4], peony: [0, 1], iris: [0, 1], alchemilla: [1], leucanthemum: [2, 3, 4], perovskia: [2, 3, 4],
  baptisia: [0, 1], amsonia: [0], coreopsis: [1, 2], digitalis: [0, 1], achillea: [1, 2, 3, 4], agastache: [2, 3, 4], alliumM: [2, 3], alliumG: [0],
  asclepias: [1, 2, 3], calamagrostis: [1, 2, 3, 4], delphinium: [1, 2], dianthus: [0, 1], echinops: [2, 3, 4], eutrochium: [2, 3, 4], gaillardia: [0, 1, 2, 3],
  helenium: [3, 4], heliopsis: [1, 2, 3], hemerocallis: [0, 1, 2, 3], lilium: [1], hibiscus: [2, 3, 4], hydrangea: [1, 2, 3, 4], sedum: [4], irisG: [0],
  lavandula: [1, 2, 3], liatris: [2, 3], lupinus: [0, 1, 2], panicum: [2, 3, 4], papaver: [1, 2], penstemon: [0, 1], platycodon: [1, 2, 3],
  roseKO: [1, 2, 3, 4], roseDA: [1, 2, 3, 4], schizachyrium: [3, 4], sporobolus: [3, 4], stachys: [1, 2], veronica: [1, 2, 3], anemone: [3, 4],
  pennisetum: [3, 4], aquilegia: [0], thymus: [1, 2], solidago: [4], echinaceaS: [1, 2, 3],
};
const GRASS = new Set(['calamagrostis', 'panicum', 'schizachyrium', 'sporobolus', 'pennisetum']);
const WOODY = new Set(['roseKO', 'roseDA', 'hydrangea']);
const EVERGREEN = new Set(['lavandula', 'thymus', 'dianthus', 'stachys']);
const EARLY = new Set(['aquilegia', 'iris', 'irisG', 'peony', 'baptisia', 'alliumG', 'dianthus', 'lupinus', 'digitalis', 'papaver', 'geranium', 'amsonia', 'penstemon']);
const LATE = new Set(['aster', 'helenium', 'eutrochium', 'solidago', 'perovskia', 'sedum', 'anemone', 'hibiscus', 'asclepias']);
// seed heads and plumes that stand after flowering (Shortwood's `persist`, extended into winter for grasses)
const SEEDHEADS = new Set(['achillea', 'echinops', 'sedum', 'echinacea', 'rudbeckia', 'eutrochium', 'hydrangea', 'calamagrostis', 'panicum', 'schizachyrium', 'sporobolus', 'pennisetum', 'alliumG', 'alliumM']);
// foliage that dies down in summer after flowering (Shortwood's `dormant`)
const SUMMER_DORMANT = { alliumG: 1.6, papaver: 2.3 };

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const M0 = 120, MD = 30.6;   // 1 May, days per month
export const FLAG_WOODY = 1, FLAG_TREE = 2;
export function flagsFor(k) { return k === 'tree' ? FLAG_TREE | FLAG_WOODY : WOODY.has(k) ? FLAG_WOODY : 0; }

function bloomAt(k, d) {
  let b = 0; for (const m of BLOOM[k] || []) { const a = M0 + MD * m, e = a + MD; b = Math.max(b, sm(a - 8, a + 6, d) * (1 - sm(e - 4, e + 10, d))); }
  return b;
}
function bloomEnd(k) { const L = BLOOM[k] || []; return L.length ? M0 + MD * (Math.max(...L) + 1) : 240; }

// d: day of year in the plant's own time (0 = 1 Jan); age: years since planting
export function plantState(k, d, age, out) {
  const mature = Math.min(1, 0.4 + 0.6 * age / 2.5);
  if (k === 'tree') {   // deciduous: leaf-out in spring, colour in October, fall in November
    const leaf = sm(95, 128, d) * (1 - sm(304, 326, d));
    out[0] = leaf; out[1] = 0; out[2] = d < 160 ? -0.55 * (1 - sm(118, 160, d)) : sm(268, 305, d) * 0.85; out[3] = 0; return out;
  }
  const e0 = EARLY.has(k) ? 62 : LATE.has(k) ? 98 : 80;
  let leaf, tint, fl = bloomAt(k, d), ftint = 0;
  if (GRASS.has(k)) {   // stands as straw through winter, cut back in late February, regrows
    const grow = sm(70, 150, d), winter = d < 58 ? 1 - sm(50, 58, d) : 0;
    leaf = Math.max(grow, winter); tint = d < 70 ? 1 : d < 150 ? -0.45 * (1 - sm(110, 150, d)) : sm(262, 300, d);
  } else if (WOODY.has(k)) {
    leaf = sm(82, 122, d) * (1 - sm(306, 330, d)); tint = d < 150 ? -0.5 * (1 - sm(115, 150, d)) : sm(278, 312, d) * 0.9;
  } else if (EVERGREEN.has(k)) {
    leaf = 0.8 + 0.2 * sm(70, 130, d); tint = d < 70 || d > 320 ? 0.32 : d < 130 ? -0.3 * sm(70, 90, d) * (1 - sm(100, 130, d)) : sm(290, 320, d) * 0.32;
  } else {
    const grow = sm(e0, e0 + 55, d), die = sm(296, 318, d);
    leaf = grow * (1 - die * 0.98); tint = d < e0 + 70 ? -0.5 * (1 - sm(e0 + 25, e0 + 70, d)) : sm(268, 300, d) * 0.95;
    if (SUMMER_DORMANT[k] != null) { const ds = M0 + MD * SUMMER_DORMANT[k]; tint = Math.max(tint, sm(ds, ds + 20, d)); leaf *= 1 - sm(ds + 12, ds + 30, d); }
  }
  if (SEEDHEADS.has(k) && fl < 0.5) {   // seed heads stand after flowering, browning, until cut back
    const be = bloomEnd(k), after = d >= be - 10 ? sm(be - 10, be + 5, d) : (GRASS.has(k) && d < 58 ? 1 : 0);
    const keep = GRASS.has(k) ? (d < 58 || d > be - 10 ? 1 : 0) : (d > be - 10 && d < 350 ? 1 : 0);
    if (keep && after > 0) { fl = Math.max(fl, 0.78 * after); ftint = Math.min(1, 0.35 + 0.65 * sm(be, be + 45, d < 58 ? d + 365 : d)); }
  }
  if (!GRASS.has(k) && !SEEDHEADS.has(k)) fl *= sm(0.15, 0.45, leaf);
  out[0] = leaf * mature; out[1] = fl * Math.min(1, mature + 0.2); out[2] = tint; out[3] = ftint;
  return out;
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MSTART = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];
export function doyLabel(d) { d = ((Math.floor(d) % 365) + 365) % 365; let m = 0; while (d >= MSTART[m + 1]) m++; return `${d - MSTART[m] + 1} ${MONTHS[m]}`; }
export function doyToMonthDay(d) { d = ((Math.floor(d) % 365) + 365) % 365; let m = 0; while (d >= MSTART[m + 1]) m++; return [m, d - MSTART[m] + 1]; }
// lawn colour through the year (multiplies the grass albedo)
export function lawnTint(d, out) {
  const spring = sm(70, 120, d) * (1 - sm(150, 190, d)), dry = sm(200, 235, d) * (1 - sm(265, 290, d)), autumn = sm(285, 320, d), winter = 1 - sm(60, 105, d) + sm(330, 360, d);
  out[0] = 1 + 0.02 * spring + 0.06 * dry + 0.02 * autumn - 0.08 * winter; out[1] = 1 + 0.1 * spring - 0.02 * dry - 0.05 * autumn - 0.16 * winter; out[2] = 1 - 0.12 * spring - 0.15 * dry - 0.12 * autumn - 0.12 * winter;
  return out;
}
