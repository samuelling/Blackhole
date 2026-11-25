// Make a plant model small enough to fetch: weld shared vertices, quantize positions, normals and uvs to 16 and 8 bit
// (KHR_mesh_quantization), pack the buffers with meshoptimizer (EXT_meshopt_compression; the garden's loader is given three's
// MeshoptDecoder), and fold the buffer back into the .json.
//   npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
//   node tools/plants/compact.mjs assets/plants/<key>.json ...
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, quantize, dedup, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import fs from 'fs';
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
for (const f of process.argv.slice(2)) {
  const json = JSON.parse(fs.readFileSync(f, 'utf8')), resources = {};
  for (const b of json.buffers || []) if (b.uri && b.uri.startsWith('data:')) { const name = 'b' + Object.keys(resources).length + '.bin'; resources[name] = Buffer.from(b.uri.split(',')[1], 'base64'); b.uri = name; }
  const doc = await io.readJSON({ json, resources }), before = fs.statSync(f).size;
  await doc.transform(dedup(), weld(), prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12 }));
  const out = await io.writeJSON(doc, { format: 'json' }); const bufs = Object.values(out.resources);
  const all = Buffer.concat(bufs.map(b => Buffer.from(b))); out.json.buffers = [{ byteLength: all.length, uri: 'data:application/octet-stream;base64,' + all.toString('base64') }];
  if (bufs.length > 1) throw new Error('more than one buffer');
  fs.writeFileSync(f, JSON.stringify(out.json));
  console.log(f, Math.round(before / 1024), '->', Math.round(fs.statSync(f).size / 1024), 'KB');
}
