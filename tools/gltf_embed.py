#!/usr/bin/env python3
"""Fold each model's .bin into its .gltf as a base64 data URI and save it as .json.

Some static hosts only serve familiar extensions; a glTF with embedded buffers is plain JSON, and three's GLTFLoader
reads it the same. Run with no arguments to convert every .gltf under assets/models, or pass .gltf paths."""
import base64, glob, json, os, sys
def embed(path):
    d = os.path.dirname(path); g = json.load(open(path))
    for b in g.get('buffers', []):
        uri = b.get('uri', '')
        if uri and not uri.startswith('data:'):
            raw = open(os.path.join(d, uri), 'rb').read(); b['uri'] = 'data:application/octet-stream;base64,' + base64.b64encode(raw).decode(); os.remove(os.path.join(d, uri))
    out = os.path.splitext(path)[0] + '.json'; json.dump(g, open(out, 'w'), separators=(',', ':')); os.remove(path)
    print(os.path.relpath(out), round(os.path.getsize(out) / 1e6, 2), 'MB'); return out
if __name__ == '__main__':
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    for p in (sys.argv[1:] or glob.glob(os.path.join(root, 'assets', 'models', '**', '*.gltf'), recursive=True)): embed(p)
