// Undo the Draco compression in NASA's .glb models so Blender's bpy module can read them (tools/blender/build_suits.py).
//   npm i @gltf-transform/core @gltf-transform/extensions draco3dgltf
//   node tools/undraco.mjs "<NASA-3D-Resources>/3D Models" ../models/plain
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import fs from 'fs'; import path from 'path';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const src = process.argv[2], out = process.argv[3]; fs.mkdirSync(out, { recursive: true });
for (const d of fs.readdirSync(src)) { for (const f of fs.readdirSync(path.join(src, d)).filter(f => f.endsWith('.glb'))) {
  try { const doc = await io.read(path.join(src, d, f)); for (const e of doc.getRoot().listExtensionsUsed()) if (e instanceof KHRDracoMeshCompression) e.dispose();
    await io.write(path.join(out, f.replace(/ /g, '_')), doc); console.log('ok', f); } catch (e) { console.log('ERR', f, String(e).slice(0, 120)); } } }
