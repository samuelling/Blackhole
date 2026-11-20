// weather.js: the weather over the place the sky is set to, and the rain and snow that fall through the garden.
//
// Conditions come from Open-Meteo (https://open-meteo.com, free, no key). Only the latitude and longitude are sent,
// rounded to two decimals (about a kilometre). Where the page cannot reach it (some hosts block outside requests),
// the garden falls back on the weather you set by hand.
import * as THREE from 'three';

// WMO weather codes -> how hard it rains or snows (0..1), and what to call it
const RAIN = { 51: 0.15, 53: 0.25, 55: 0.38, 56: 0.2, 57: 0.38, 61: 0.4, 63: 0.65, 65: 1, 66: 0.4, 67: 0.8, 80: 0.45, 81: 0.7, 82: 1, 95: 0.85, 96: 0.9, 99: 1 };
const SNOW = { 71: 0.35, 73: 0.65, 75: 1, 77: 0.3, 85: 0.5, 86: 0.9 };
const LABEL = { 0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'freezing fog', 51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 56: 'freezing drizzle', 57: 'freezing drizzle',
  61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'heavy freezing rain', 71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains', 80: 'light showers', 81: 'showers', 82: 'violent showers',
  85: 'snow showers', 86: 'heavy snow showers', 95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'thunderstorm with hail' };
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const num = (x, d = 0) => (typeof x === 'number' && isFinite(x) ? x : d);

/** Open-Meteo's answer -> { tempC, code, label, cloud, windMs, gustMs, windFrom, rain, snow, fog, snowDepth, isDay, time } */
export function normalize(j) {
  const c = (j && j.current) || {}, h = (j && j.hourly) || {}, code = num(c.weather_code, 0) | 0;
  let rain = RAIN[code] || 0, snow = SNOW[code] || 0;
  if (!rain && !snow) {   // a code that says "cloudy" while something is falling: go by the amounts
    const sf = num(c.snowfall), rf = num(c.rain) + num(c.showers);
    if (sf > 0) snow = clamp(0.25 + sf * 0.5); else if (rf > 0) rain = clamp(0.15 + rf * 0.3);
  }
  let i = Array.isArray(h.time) && typeof c.time === 'string' ? h.time.indexOf(c.time.slice(0, 13) + ':00') : -1; if (i < 0) i = 0;
  const depth = num(h.snow_depth && h.snow_depth[i]), vis = h.visibility ? h.visibility[i] : null;
  let fog = code === 45 || code === 48 ? 0.9 : 0;
  if (typeof vis === 'number') fog = Math.max(fog, 0.8 * Math.pow(clamp((6000 - vis) / 6000), 1.5));
  return { tempC: num(c.temperature_2m, NaN), code, label: LABEL[code] || 'weather code ' + code, cloud: clamp(num(c.cloud_cover) / 100), windMs: num(c.wind_speed_10m), gustMs: num(c.wind_gusts_10m),
    windFrom: num(c.wind_direction_10m), rain, snow, fog, snowDepth: depth, isDay: c.is_day !== 0, time: c.time || '' };
}
export async function fetchWeather(lat, lon) {
  const q = `latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&current=temperature_2m,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m`
    + '&hourly=snow_depth,visibility&forecast_days=1&wind_speed_unit=ms&timezone=auto';
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, to = ctl && setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch('https://api.open-meteo.com/v1/forecast?' + q, ctl ? { signal: ctl.signal } : undefined);
    if (!r.ok) throw new Error('the weather service answered ' + r.status);
    return normalize(await r.json());
  } finally { if (to) clearTimeout(to); }
}
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
/** One line for people: "38°F · light rain · wind 11 mph from the NW, gusts 20" */
export function describe(w, imperial) {
  const t = isNaN(w.tempC) ? '' : imperial ? `${Math.round(w.tempC * 9 / 5 + 32)}°F` : `${Math.round(w.tempC)}°C`;
  const sp = v => imperial ? Math.round(v * 2.237) : Math.round(v * 3.6), unit = imperial ? 'mph' : 'km/h';
  const wind = w.windMs < 0.5 ? 'calm' : `wind ${sp(w.windMs)} ${unit} from the ${COMPASS[Math.round(w.windFrom / 22.5) % 16]}` + (w.gustMs > w.windMs * 1.3 + 1 ? `, gusts ${sp(w.gustMs)}` : '');
  const snow = w.snowDepth > 0.005 ? ` · ${imperial ? (w.snowDepth * 39.37).toFixed(w.snowDepth < 0.1 ? 1 : 0) + ' in' : Math.round(w.snowDepth * 100) + ' cm'} of snow lying` : '';
  return [t, w.label, wind].filter(Boolean).join(' · ') + snow;
}
/** Conditions -> what the garden's controls understand. The scene's compass: +x east, -z north. */
export function toScene(w) {
  const a = w.windFrom * Math.PI / 180, wet = w.rain > 0 || w.snow > 0;
  return { cloud: w.cloud, over: Math.max(clamp((w.cloud - 0.7) / 0.3), wet ? 0.85 + 0.15 * Math.max(w.rain, w.snow) : 0, w.fog * 0.8),
    wind: clamp(w.windMs / 11, 0, 1.5), gusts: clamp((w.gustMs / Math.max(w.windMs, 1.5) - 1) * 1.6, 0.3, 2), dirX: -Math.sin(a), dirZ: Math.cos(a),
    rain: w.rain, snow: w.snow, fog: w.fog, ground: clamp(w.snowDepth / 0.03) };
}

// ---------------------------------------------------------------- what falls
// One box of drops (and one of flakes) that travels with you and wraps, so there is always weather around the eye and
// never any far away. Each streak is lit by the light where it is, so rain glints in the exhibit's colours, goes dark
// in a void's reach, and bends toward the horizon on its way down.
export function createPrecip({ U, COMMON, count = 9000 }) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0], 3)); geo.setIndex([0, 1, 2, 1, 3, 2]);
  const seed = new Float32Array(count * 4); for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4)); geo.instanceCount = count;
  const own = () => ({ uOff: { value: new THREE.Vector3() }, uFall: { value: 0 }, uAmount: { value: 0 }, uVel: { value: new THREE.Vector3(0, -9, 0) } });
  const HEAD = COMMON + /* glsl */`
attribute vec4 aSeed; uniform vec3 uOff; uniform float uFall; uniform float uAmount; uniform vec3 uVel; uniform float uPx; uniform float uExhibit;
varying float vA; varying vec3 vCol; varying vec2 vUv;
const vec3 BOX = vec3(26.0, 14.0, 26.0);
vec3 place(float sp){
  vec3 p = aSeed.xyz * BOX + vec3(uOff.x, -uFall * sp, uOff.z);
  vec3 org = vec3(cameraPosition.x, cameraPosition.y + 4.5, cameraPosition.z);
  p = org + mod(p - org + 0.5 * BOX, BOX) - 0.5 * BOX;
  for (int i = 0; i < MAXV; i++) { float s = uVoid[i].w; if (s < 0.001) continue;
    vec3 d = uVoid[i].xyz - p; float f = 1.0 - smoothstep(uVoidAux[i].z * 0.2, uVoidAux[i].z, length(d)); p += d * min(0.85, s * f * f * 0.9); }
  return p;
}
vec3 lightAt(vec3 p){ return (uAmb * 1.3 + uSun * 0.45 + groundLight(p.xz) * uExhibit * uLightGain * clamp(1.25 - p.y * 0.12, 0.3, 1.25)) * drainAt(p); }
float shown(vec3 p){ vec3 e = abs(p - vec3(cameraPosition.x, cameraPosition.y + 4.5, cameraPosition.z)) / (0.5 * BOX);
  return step(fract(aSeed.w * 7.13 + aSeed.x * 3.71), uAmount) * step(0.03, p.y) * (1.0 - smoothstep(0.8, 1.0, max(e.x, e.z))); }`;
  const mk = (vs, fs, blending) => new THREE.ShaderMaterial({ uniforms: Object.assign({}, U, own()), vertexShader: HEAD + vs, fragmentShader: 'varying float vA; varying vec3 vCol; varying vec2 vUv;\n' + fs,
    transparent: true, depthWrite: false, blending, side: THREE.DoubleSide });
  const rainMat = mk(/* glsl */`
void main(){
  float sp = 0.8 + 0.05 * floor(aSeed.w * 8.0); vec3 p = place(sp);   // speeds in steps, so the fall can wrap without a jump
  vec3 vel = vec3(uVel.x, uVel.y * sp, uVel.z), dirv = normalize(vel);
  float dist = length(cameraPosition - p), w = max(0.0035, 1.15 * dist / uPx), len = 0.04 * length(vel);   // a streak is what a drop does in a 25th of a second
  vec3 side = normalize(cross(dirv, cameraPosition - p));
  vec3 wp = p + dirv * (position.y - 0.5) * len + side * position.x * w;
  vA = shown(p) * 0.55 * min(1.0, 0.006 / w + 0.35) * smoothstep(0.25, 1.2, dist); vCol = lightAt(p); vUv = vec2(position.x + 0.5, position.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`, /* glsl */`void main(){ float a = vA * (1.0 - abs(vUv.x * 2.0 - 1.0)) * smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.5, vUv.y); gl_FragColor = vec4(vCol * 1.6, a); }`, THREE.AdditiveBlending);
  const snowMat = mk(/* glsl */`
void main(){
  float sp = 0.7 + 0.05 * floor(aSeed.w * 12.0); vec3 p = place(sp);
  p.xz += vec2(sin(uTime * 0.9 + aSeed.w * 40.0), cos(uTime * 0.7 + aSeed.x * 33.0)) * 0.28;    // flakes wander
  float dist = length(cameraPosition - p), r = max(0.013 + 0.013 * aSeed.z, 1.5 * dist / uPx);
  vec4 mv = viewMatrix * vec4(p, 1.0); mv.xy += vec2(position.x, position.y - 0.5) * 2.0 * r;
  vA = shown(p) * 0.92 * smoothstep(0.2, 0.9, dist); vCol = min(lightAt(p) * 1.5, vec3(1.15)); vUv = vec2(position.x + 0.5, position.y);
  gl_Position = projectionMatrix * mv;
}`, /* glsl */`void main(){ float d = length(vUv - 0.5) * 2.0; float a = vA * smoothstep(1.0, 0.35, d); if (a < 0.01) discard; gl_FragColor = vec4(vCol, a); }`, THREE.NormalBlending);
  const rain = new THREE.Mesh(geo, rainMat), snow = new THREE.Mesh(geo, snowMat);
  const group = new THREE.Group(); group.name = 'precipitation';
  for (const m of [rain, snow]) { m.frustumCulled = false; m.renderOrder = 5; group.add(m); }
  // rain and snow keep their own running offsets, so a change of wind bends the fall without making it jump
  const offR = new THREE.Vector3(), offS = new THREE.Vector3(); let fallR = 0, fallS = 0;
  /** amounts 0..1; wind as a ground velocity in m/s (x east, z south) */
  function update(dt, rainAmt, snowAmt, wx, wz) {
    rain.visible = rainAmt > 0.004; snow.visible = snowAmt > 0.004;
    if (rain.visible) { offR.x = (offR.x + wx * dt) % 26; offR.z = (offR.z + wz * dt) % 26; fallR = (fallR + 9 * dt) % 280;
      rainMat.uniforms.uOff.value.copy(offR); rainMat.uniforms.uFall.value = fallR; rainMat.uniforms.uAmount.value = rainAmt; rainMat.uniforms.uVel.value.set(wx, -9, wz); }
    if (snow.visible) { offS.x = (offS.x + wx * 0.8 * dt) % 26; offS.z = (offS.z + wz * 0.8 * dt) % 26; fallS = (fallS + 1.5 * dt) % 280;
      snowMat.uniforms.uOff.value.copy(offS); snowMat.uniforms.uFall.value = fallS; snowMat.uniforms.uAmount.value = snowAmt; }
  }
  return { group, update, setDensity: k => { geo.instanceCount = Math.max(200, Math.min(count, Math.round(count * k))); } };
}
