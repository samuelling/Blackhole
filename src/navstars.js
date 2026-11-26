// navstars.js: the navigator's stars. The 57 of the Nautical Almanac, and Polaris: bright, well spread over the sky, and known by
// name to every navigator since. [name, constellation, RA°, Dec°] at J2000 (to find each in the catalogue; the catalogue's own
// position is the one used).
export const NAV_STARS = [
  ['Alpheratz', 'Andromeda', 2.097, 29.090], ['Ankaa', 'Phoenix', 6.571, -42.306], ['Schedar', 'Cassiopeia', 10.127, 56.537], ['Diphda', 'Cetus', 10.897, -17.987],
  ['Achernar', 'Eridanus', 24.429, -57.237], ['Hamal', 'Aries', 31.793, 23.462], ['Polaris', 'Ursa Minor', 37.954, 89.264], ['Acamar', 'Eridanus', 44.565, -40.305],
  ['Menkar', 'Cetus', 45.570, 4.090], ['Mirfak', 'Perseus', 51.081, 49.861], ['Aldebaran', 'Taurus', 68.980, 16.509], ['Rigel', 'Orion', 78.634, -8.202],
  ['Capella', 'Auriga', 79.172, 45.998], ['Bellatrix', 'Orion', 81.283, 6.350], ['Elnath', 'Taurus', 81.573, 28.608], ['Alnilam', 'Orion', 84.053, -1.202],
  ['Betelgeuse', 'Orion', 88.793, 7.407], ['Canopus', 'Carina', 95.988, -52.696], ['Sirius', 'Canis Major', 101.287, -16.716], ['Adhara', 'Canis Major', 104.656, -28.972],
  ['Procyon', 'Canis Minor', 114.825, 5.225], ['Pollux', 'Gemini', 116.329, 28.026], ['Avior', 'Carina', 125.628, -59.510], ['Suhail', 'Vela', 136.999, -43.433],
  ['Miaplacidus', 'Carina', 138.300, -69.717], ['Alphard', 'Hydra', 141.897, -8.659], ['Regulus', 'Leo', 152.093, 11.967], ['Dubhe', 'Ursa Major', 165.932, 61.751],
  ['Denebola', 'Leo', 177.265, 14.572], ['Gienah', 'Corvus', 183.952, -17.542], ['Acrux', 'Crux', 186.650, -63.099], ['Gacrux', 'Crux', 187.791, -57.113],
  ['Alioth', 'Ursa Major', 193.507, 55.960], ['Spica', 'Virgo', 201.298, -11.161], ['Alkaid', 'Ursa Major', 206.885, 49.313], ['Hadar', 'Centaurus', 210.956, -60.373],
  ['Menkent', 'Centaurus', 211.671, -36.370], ['Arcturus', 'Boötes', 213.915, 19.182], ['Rigil Kentaurus', 'Centaurus', 219.900, -60.834], ['Zubenelgenubi', 'Libra', 222.720, -16.042],
  ['Kochab', 'Ursa Minor', 222.676, 74.156], ['Alphecca', 'Corona Borealis', 233.672, 26.715], ['Antares', 'Scorpius', 247.352, -26.432], ['Atria', 'Triangulum Australe', 252.166, -69.028],
  ['Sabik', 'Ophiuchus', 257.595, -15.725], ['Shaula', 'Scorpius', 263.402, -37.104], ['Rasalhague', 'Ophiuchus', 263.734, 12.560], ['Eltanin', 'Draco', 269.152, 51.489],
  ['Kaus Australis', 'Sagittarius', 276.043, -34.385], ['Vega', 'Lyra', 279.235, 38.784], ['Nunki', 'Sagittarius', 283.816, -26.297], ['Altair', 'Aquila', 297.696, 8.868],
  ['Peacock', 'Pavo', 306.412, -56.735], ['Deneb', 'Cygnus', 310.358, 45.280], ['Enif', 'Pegasus', 326.046, 9.875], ['Al Na’ir', 'Grus', 332.058, -46.961],
  ['Fomalhaut', 'Piscis Austrinus', 344.413, -29.622], ['Markab', 'Pegasus', 346.190, 15.205],
];
/** Each navigator's star found in the catalogue (cat: [ra°, dec°, mag, b−v] × n): [{ name, con, ra, dec, mag, i }], the ones not found left out. */
export function findNavStars(cat) {
  const out = [], n = cat.length / 4, D2R = Math.PI / 180;
  for (const [name, con, ra, dec] of NAV_STARS) {
    let best = -1, bm = 9;
    for (let i = 0; i < n; i++) { const dd = Math.abs(cat[i * 4 + 1] - dec); if (dd > 0.7) continue; let dr = Math.abs(cat[i * 4] - ra); if (dr > 180) dr = 360 - dr; if (dr * Math.cos(dec * D2R) > 0.7) continue; if (cat[i * 4 + 2] < bm) { bm = cat[i * 4 + 2]; best = i; } }
    if (best >= 0 && bm < 3.2) out.push({ name, con, ra: cat[best * 4], dec: cat[best * 4 + 1], mag: bm, i: best });
  }
  return out;
}
