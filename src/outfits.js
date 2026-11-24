// Outfits: the suit repainted. The astronaut (tools/blender/build_astronaut.py) is painted in a handful of flat colours, a white shell,
// grey joints and trim, orange patches, a gold visor and cyan glow strips, so an outfit is just five colours, and the cel shader swaps
// each of the suit's own colours for the outfit's (body.js, setOutfit). Colours here are linear RGB, as the shader uses them.
import * as THREE from 'three';

export const PRESETS = [
  { id: 'apollo',   name: 'Apollo',    suit: [0.80, 0.82, 0.86], trim: [0.34, 0.37, 0.43], accent: [1.00, 0.30, 0.035], visor: [0.95, 0.56, 0.10], glow: [0.25, 0.95, 1.00] },
  { id: 'pumpkin',  name: 'Pumpkin',   suit: [1.00, 0.30, 0.04], trim: [0.80, 0.82, 0.86], accent: [0.30, 0.32, 0.37], visor: [0.95, 0.56, 0.10], glow: [1.00, 0.62, 0.12] },
  { id: 'mercury',  name: 'Mercury',   suit: [0.58, 0.60, 0.64], trim: [0.10, 0.11, 0.13], accent: [0.06, 0.20, 0.85], visor: [0.30, 0.34, 0.42], glow: [0.40, 0.70, 1.00] },
  { id: 'mars',     name: 'Mars',      suit: [0.52, 0.11, 0.045], trim: [0.05, 0.05, 0.06], accent: [0.85, 0.76, 0.60], visor: [0.15, 0.75, 0.55], glow: [1.00, 0.36, 0.14] },
  { id: 'midnight', name: 'Midnight',  suit: [0.03, 0.032, 0.04], trim: [0.26, 0.28, 0.33], accent: [1.00, 0.30, 0.035], visor: [0.45, 0.12, 0.95], glow: [0.70, 0.30, 1.00] },
  { id: 'sakura',   name: 'Sakura',    suit: [1.00, 0.52, 0.62], trim: [0.80, 0.82, 0.86], accent: [0.70, 0.06, 0.30], visor: [0.95, 0.70, 0.82], glow: [1.00, 0.55, 0.85] },
  { id: 'mint',     name: 'Mint',      suit: [0.22, 0.72, 0.56], trim: [0.04, 0.18, 0.16], accent: [1.00, 0.82, 0.16], visor: [0.08, 0.45, 0.90], glow: [0.30, 1.00, 0.70] },
  { id: 'lemon',    name: 'Lemon',     suit: [1.00, 0.80, 0.08], trim: [0.05, 0.05, 0.06], accent: [0.05, 0.05, 0.06], visor: [0.12, 0.28, 0.90], glow: [1.00, 0.95, 0.40] },
  { id: 'cobalt',   name: 'Cobalt',    suit: [0.05, 0.16, 0.70], trim: [0.80, 0.82, 0.86], accent: [1.00, 0.30, 0.035], visor: [0.95, 0.56, 0.10], glow: [0.25, 0.95, 1.00] },
  { id: 'moss',     name: 'Moss',      suit: [0.20, 0.26, 0.10], trim: [0.42, 0.30, 0.18], accent: [0.85, 0.76, 0.60], visor: [0.20, 0.22, 0.12], glow: [0.70, 1.00, 0.30] },
];
// The suits themselves: the garden's own, and others made from NASA's models (tools/blender/build_suits.py; fetched when first worn).
// Each is painted in the same five flat colours, so any outfit repaints any suit; own is the suit in its real colours.
// neck: how far the helmet turns with the head (0 for a helmet that is one piece with the shell).
export const BODIES = [
  { id: 'astro', name: 'Garden suit', note: 'the garden\'s own hard-shell suit', own: { suit: [0.80, 0.82, 0.86], trim: [0.34, 0.37, 0.43], accent: [1.00, 0.30, 0.035], visor: [0.95, 0.56, 0.10], glow: [0.25, 0.95, 1.00] } },
  { id: 'aces', name: 'ACES', note: 'Advanced Crew Escape Suit: the Shuttle\'s orange launch-and-entry suit', own: { suit: [0.79, 0.25, 0.08], trim: [0.07, 0.19, 0.47], accent: [0.72, 0.02, 0.02], visor: [0.02, 0.022, 0.03], glow: [1.00, 0.62, 0.12] } },
  { id: 'mark3', name: 'Mark III', note: 'NASA\'s hard-shell prototype of the 1980s, with a rear-entry hatch and bearings at every joint', neck: 0, own: { suit: [0.82, 0.83, 0.90], trim: [0.36, 0.37, 0.40], accent: [0.14, 0.32, 0.83], visor: [0.09, 0.10, 0.12], glow: [0.25, 0.95, 1.00] } },
  { id: 'mercury', name: 'Mercury', note: 'the slim pressure suit of the first American flights', own: { suit: [0.62, 0.64, 0.68], trim: [0.14, 0.16, 0.31], accent: [0.72, 0.02, 0.02], visor: [0.20, 0.24, 0.30], glow: [0.40, 0.70, 1.00] } },
  { id: 'gemini', name: 'Gemini', note: 'the Gemini suit, with its harness', own: { suit: [0.86, 0.86, 0.84], trim: [0.63, 0.66, 0.59], accent: [0.06, 0.30, 0.80], visor: [0.20, 0.24, 0.30], glow: [0.25, 0.95, 1.00] } },
  { id: 'eva', name: 'EVA suit', note: 'a spacewalk suit with its life-support pack on its back', own: { suit: [0.88, 0.88, 0.86], trim: [0.50, 0.50, 0.52], accent: [0.75, 0.10, 0.10], visor: [0.95, 0.62, 0.18], glow: [0.25, 0.95, 1.00] } },
  { id: 'z2', name: 'Z-2', note: 'NASA\'s planetary prototype of 2014, with a bubble helmet and a hatch on the back', neck: 0, own: { suit: [0.86, 0.85, 0.82], trim: [0.42, 0.42, 0.45], accent: [0.10, 0.25, 0.75], visor: [0.02, 0.022, 0.03], glow: [0.30, 1.00, 0.70] } },
];
// the suit colours and visors to pick from, after a preset
export const SUITS = [[0.80, 0.82, 0.86], [1.00, 0.30, 0.04], [0.52, 0.11, 0.045], [1.00, 0.80, 0.08], [0.22, 0.72, 0.56], [0.05, 0.16, 0.70],
  [0.40, 0.08, 0.60], [1.00, 0.52, 0.62], [0.58, 0.60, 0.64], [0.20, 0.26, 0.10], [0.42, 0.30, 0.18], [0.03, 0.032, 0.04]];
export const GLOWS = [[0.25, 0.95, 1.00], [1.00, 0.62, 0.12], [1.00, 0.36, 0.14], [0.70, 0.30, 1.00], [1.00, 0.55, 0.85], [0.30, 1.00, 0.70], [1.00, 0.95, 0.40], [0.95, 0.97, 1.00]];
// what the helmet wears on top (body.js builds them)
export const TOPS = [['none', '—'], ['antenna', 'antenna'], ['fin', 'fin'], ['cat', 'cat ears'], ['bunny', 'bunny ears'], ['halo', 'halo'], ['horns', 'horns'], ['prop', 'propeller'], ['crown', 'crown'], ['flower', 'flower']];
export const VISORS = [[0.95, 0.56, 0.10], [0.30, 0.34, 0.42], [0.08, 0.45, 0.90], [0.15, 0.75, 0.55], [0.45, 0.12, 0.95], [0.95, 0.70, 0.82], [0.90, 0.10, 0.08]];

const KEY = 'gd.outfit';
const clamp01 = v => Math.max(0, Math.min(1, +v || 0));
const col3 = c => Array.isArray(c) && c.length === 3 ? c.map(v => Math.round(clamp01(v) * 1000) / 1000) : null;
/** An outfit as it travels and is kept: { b: which suit, p: preset id, suit, trim, accent, visor, glow, top } (anything missing comes from the preset). */
export function cleanOutfit(o) {
  const base = PRESETS.find(p => o && p.id === o.p) || PRESETS[0], out = { p: o && o.p === 'own' ? 'own' : base.id };
  for (const k of ['suit', 'trim', 'accent', 'visor', 'glow']) out[k] = (o && col3(o[k])) || base[k].slice();
  out.top = o && TOPS.some(t => t[0] === o.top) ? o.top : 'none';
  out.b = o && BODIES.some(b => b.id === o.b) ? o.b : 'astro';
  out.g = o && typeof o.g === 'string' && /^[a-z-]{2,12}$/.test(o.g) ? o.g : 'easy';   // how they carry themselves (a gait in motion.js, or 'classic')
  return out;
}
export function fromPreset(id, keep) { return cleanOutfit({ p: id, top: keep && keep.top, b: keep && keep.b, g: keep && keep.g }); }   // new colours keep the suit and what was on the helmet
/** Another suit, in its own colours. */
export function fromBody(id, keep) { const b = BODIES.find(x => x.id === id) || BODIES[0]; return cleanOutfit(Object.assign({ p: 'own', top: keep && keep.top, b: b.id, g: keep && keep.g }, b.own)); }
export function loadOutfit() { try { return cleanOutfit(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { return cleanOutfit(null); } }
export function saveOutfit(o) { try { localStorage.setItem(KEY, JSON.stringify(cleanOutfit(o))); } catch (e) { /* storage blocked */ } }
/** A linear colour as CSS, for the swatches. */
export function css(c) { return '#' + new THREE.Color().setRGB(c[0], c[1], c[2], THREE.LinearSRGBColorSpace).getHexString(); }
