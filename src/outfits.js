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
// the suit colours and visors to pick from, after a preset
export const SUITS = [[0.80, 0.82, 0.86], [1.00, 0.30, 0.04], [0.52, 0.11, 0.045], [1.00, 0.80, 0.08], [0.22, 0.72, 0.56], [0.05, 0.16, 0.70],
  [0.40, 0.08, 0.60], [1.00, 0.52, 0.62], [0.58, 0.60, 0.64], [0.20, 0.26, 0.10], [0.42, 0.30, 0.18], [0.03, 0.032, 0.04]];
export const VISORS = [[0.95, 0.56, 0.10], [0.30, 0.34, 0.42], [0.08, 0.45, 0.90], [0.15, 0.75, 0.55], [0.45, 0.12, 0.95], [0.95, 0.70, 0.82], [0.90, 0.10, 0.08]];

const KEY = 'gd.outfit';
const clamp01 = v => Math.max(0, Math.min(1, +v || 0));
const col3 = c => Array.isArray(c) && c.length === 3 ? c.map(v => Math.round(clamp01(v) * 1000) / 1000) : null;
/** An outfit as it travels and is kept: { p: preset id, suit, trim, accent, visor, glow } (anything missing comes from the preset). */
export function cleanOutfit(o) {
  const base = PRESETS.find(p => o && p.id === o.p) || PRESETS[0], out = { p: base.id };
  for (const k of ['suit', 'trim', 'accent', 'visor', 'glow']) out[k] = (o && col3(o[k])) || base[k].slice();
  return out;
}
export function fromPreset(id) { return cleanOutfit({ p: id }); }
export function loadOutfit() { try { return cleanOutfit(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { return cleanOutfit(null); } }
export function saveOutfit(o) { try { localStorage.setItem(KEY, JSON.stringify(cleanOutfit(o))); } catch (e) { /* storage blocked */ } }
/** A linear colour as CSS, for the swatches. */
export function css(c) { return '#' + new THREE.Color().setRGB(c[0], c[1], c[2], THREE.LinearSRGBColorSpace).getHexString(); }
