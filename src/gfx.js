// gfx.js: graphics settings. Presets by kind of machine, a guess at which one this is, and what the visitor changed.
//
// Most settings apply as you move them. Two change how the garden is built (how many plants, leaves and blades of
// grass), so they apply the next time the page loads: `detail`, `grass` and `wood` (RELOAD below).
// `wood` is how many boughs the trees deep in the wood carry: all of them, or half. Leaves are never enlarged to make up the difference.

export const PRESETS = {
  phone:   { detail: 'lite', grass: 0.45, msaa: 0, shadow: 1024, refl: 0.25, env: false, ao: false, bloom: true, res: 1.25, adaptive: true,  fpsCap: 30, precip: 0.4, wood: 'half' },
  laptop:  { detail: 'full', grass: 0.7,  msaa: 2, shadow: 2048, refl: 0.35, env: false, ao: false, bloom: true, res: 1.0,  adaptive: true,  fpsCap: 0,  precip: 0.7, wood: 'half' },
  desktop: { detail: 'full', grass: 1.0,  msaa: 4, shadow: 4096, refl: 0.5,  env: true,  ao: true,  bloom: true, res: 1.5,  adaptive: true,  fpsCap: 0,  precip: 1.0, wood: 'full' },
  ultra:   { detail: 'full', grass: 1.5,  msaa: 8, shadow: 8192, refl: 0.75, env: true,  ao: true,  bloom: true, res: 2.0,  adaptive: false, fpsCap: 0,  precip: 1.5, wood: 'full' },
};
export const PRESET_NAMES = { auto: 'auto', phone: 'phone', laptop: 'laptop', desktop: 'desktop', ultra: 'ultra', custom: 'custom' };
export const RELOAD = ['detail', 'grass', 'wood'];
const KEYS = Object.keys(PRESETS.desktop);
const STORE = 'gd.gfx';

/** Which preset suits this machine, from the GPU's name where the browser gives it. */
export function detect(renderer, isTouch) {
  let gpu = '';
  try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || ''); } catch (e) {}
  const cores = navigator.hardwareConcurrency || 4, fine = matchMedia('(pointer: fine)').matches;
  let preset = 'laptop';
  if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(gpu)) preset = 'phone';
  else if (isTouch && !fine) preset = 'phone';                                                           // phones and tablets
  else if (/nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|radeon\(tm\) rx|arc\(tm\) a|intel.*arc|apple m\d+ (pro|max|ultra)/i.test(gpu)) preset = 'desktop';
  else if (/apple m\d|apple gpu|apple/i.test(gpu)) preset = cores >= 10 ? 'desktop' : 'laptop';        // Safari hides the chip's name; core count is a rough stand-in
  else if (/intel|iris|uhd|hd graphics|adreno|mali|powervr|radeon\(tm\) graphics|radeon graphics|vega/i.test(gpu)) preset = 'laptop';
  return { preset, gpu: gpuName(gpu) };
}

// ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version) -> Apple M3 Max;
// ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 (0x2206) Direct3D11 vs_5_0 ps_5_0, D3D11) -> NVIDIA GeForce RTX 3080
export function gpuName(s) {
  if (!s) return 'not reported';
  const m = /^ANGLE \(([^,]*),\s*(.*?)(?:,\s*[^,()]*)?\)$/.exec(s); let r = m ? m[2] : s;
  if (/swiftshader/i.test(s)) return 'SwiftShader (software)';
  r = r.replace(/^ANGLE \w+ Renderer:\s*/i, '').replace(/\s*\(0x[0-9a-f]+\)/ig, '').replace(/\s+(Direct3D|OpenGL|Vulkan|Metal).*$/i, '').trim();
  return r || (m && m[1]) || s;
}
/** The settings to use now: saved choices, else the detected preset; URL options (?gfx=, ?q=low, ?msaa=, ?ao=0, ?env=0, ?grass=) win for testing. */
export function load(renderer, isTouch, QS) {
  const det = detect(renderer, isTouch);
  let saved = null; try { saved = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) {}
  const forced = QS.get('gfx');   // ?gfx=phone|laptop|desktop|ultra tries a preset for one visit, without saving it
  const preset = forced in PRESETS ? forced : saved && (saved.preset in PRESETS || saved.preset === 'custom') ? saved.preset : 'auto';
  const base = PRESETS[preset === 'auto' ? det.preset : preset === 'custom' ? det.preset : preset];
  const G = Object.assign({ preset }, base, preset === 'custom' && saved ? pick(saved) : {});
  const caps = renderer.capabilities;
  G.msaa = Math.min(G.msaa, caps.maxSamples || 0); G.shadow = Math.min(G.shadow, caps.maxTextureSize || 4096);
  if (QS.get('q') === 'low') Object.assign(G, PRESETS.phone, { fpsCap: 0 });
  if (QS.has('msaa')) G.msaa = Math.max(0, parseInt(QS.get('msaa')) || 0);
  if (QS.get('ao') === '0') G.ao = false;
  if (QS.get('env') === '0') G.env = false;
  if (QS.has('grass')) G.grass = parseFloat(QS.get('grass')) || G.grass;
  if (QS.get('wood') === 'full' || QS.get('wood') === 'half') G.wood = QS.get('wood');
  if (QS.has('test')) { G.adaptive = false; G.fpsCap = 0; }
  G.loaded = { detail: G.detail, grass: G.grass, wood: G.wood };   // what this page was built with
  return { G, det };
}
function pick(o) { const r = {}; for (const k of KEYS) if (k in o) r[k] = o[k]; return r; }
export function save(G) { try { localStorage.setItem(STORE, JSON.stringify(Object.assign({ preset: G.preset }, pick(G)))); } catch (e) {} }
/** Settings that differ from what the page was built with, and so need a reload. */
export const pending = G => RELOAD.filter(k => G[k] !== G.loaded[k]);
