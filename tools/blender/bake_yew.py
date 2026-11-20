#!/usr/bin/env python3
"""A yew hedge card baked from real geometry in Blender.

    python3 tools/blender/bake_yew.py          (needs the bpy module and Pillow)

Models sprays of yew — shoots with side shoots, each lined with two ranks of flat, ridged needles, paler at the growing
tips — fans seven of them from one stalk, and renders the fan from straight above with Cycles: once lit, for colour,
and once with every surface coloured by the way it faces, for a normal map. Writes assets/tex/card_yew.webp and
card_yew_n.webp (the cards the hedges are shelled with) and blender/yew.blend."""
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')); TMP = os.path.join(ROOT, 'blender')
rs = np.random.RandomState(7); U = rs.uniform
bm = bmesh.new(); CL = bm.loops.layers.float_color.new('Col'); NL = bm.loops.layers.float_color.new('Nrm')
def face(vs, col):
    f = bm.faces.new([bm.verts.new(v) for v in vs]); n = (vs[1] - vs[0]).cross(vs[-1] - vs[0]).normalized()
    for l in f.loops: l[CL] = (*col, 1.0); l[NL] = (n.x * 0.5 + 0.5, n.y * 0.5 + 0.5, n.z * 0.5 + 0.5, 1.0)   # the camera looks straight down, so world normals are the card's normals
def needle(b, d, n, L, w, col):               # a flat blade with a raised midrib, pointed at the tip
    wv = d.cross(n).normalized() * (w / 2); h = n * (w * 0.28); mid = b + d * (L * 0.5); tip = b + d * L
    face([b - wv * 0.6, b + h, mid + h, mid - wv], col); face([b + h, b + wv * 0.6, mid + wv, mid + h], col)
    face([mid - wv, mid + h, tip], col); face([mid + h, mid + wv, tip], col)
def shoot(p, ang, length, level, shade):      # ang: degrees clockwise from +y, in the plane of the spray
    step = 0.0026; n = max(4, int(length / step)); side = 1; nxt = U(0.012, 0.02); bend = U(-0.25, 0.25) / n * 12
    for i in range(n):
        t = i / n; a = math.radians(ang); d = Vector((math.sin(a), math.cos(a), 0)); q = p + d * step
        wv = Vector((d.y, -d.x, 0)) * (0.0011 * (1.3 - t)); face([p - wv, p + wv, q + wv, q - wv], (0.085 * shade, 0.07 * shade, 0.032 * shade))   # the twig itself
        for sd in (1, -1):                    # two ranks of needles, slightly staggered
            if (i + (sd > 0)) % 2: continue
            na = a + sd * math.radians(U(50, 66)); pitch = math.radians(U(-6, 16)); nd = Vector((math.sin(na) * math.cos(pitch), math.cos(na) * math.cos(pitch), math.sin(pitch)))
            roll = math.radians(U(-28, 28)); nn = (Vector((0, 0, 1)) * math.cos(roll) + nd.cross(Vector((0, 0, 1))) * math.sin(roll)); nn = (nn - nd * nn.dot(nd)).normalized()
            Ln = 0.021 * (0.55 + 0.45 * math.sin(math.pi * min(1, t * 1.25 + 0.12))) * U(0.8, 1.15) * (1 - 0.3 * level)
            young = max(0.0, (t - 0.7) / 0.3) * (0.75 if level < 2 else 0.4); k = shade * U(0.72, 1.25)
            col = ((0.028 + 0.06 * young) * k, (0.075 + 0.1 * young) * k, (0.022 + 0.02 * young) * k)
            needle(p + Vector((0, 0, 0.0006)), nd, nn, Ln, 0.0026 * U(0.85, 1.15), col)
        if level < 2 and t > 0.08 and t * length > nxt and t < 0.9:
            side = -side; nxt = t * length + (U(0.018, 0.03) if level == 0 else U(0.016, 0.03))
            if level == 0 or U(0, 1) < 0.55: shoot(q + Vector((0, 0, U(-0.0015, 0.0015))), ang + side * U(38, 56), (length * (1 - t) * U(0.5, 0.78)) if level == 0 else U(0.018, 0.034), level + 1, shade * U(0.9, 1.08))
        p = q; ang += bend
for k, (ang, ln) in enumerate([(-58, 0.13), (52, 0.14), (-40, 0.10), (38, 0.11), (-26, 0.18), (24, 0.19), (0, 0.225)]):   # later sprays lie on top
    shoot(Vector((0, 0.003, 0.0035 * k)), ang + U(-3, 3), ln, 0, 0.78 + 0.07 * k / 2 + (0.12 if k == 6 else 0))
bpy.ops.wm.read_factory_settings(use_empty=True); scene = bpy.context.scene
me = bpy.data.meshes.new('yew_spray'); bm.to_mesh(me); print('yew fan:', len(bm.faces) // 4, 'needles and twig segments'); bm.free()
ob = bpy.data.objects.new('yew_spray', me); scene.collection.objects.link(ob)
mat = bpy.data.materials.new('yew'); mat.use_nodes = True; nt = mat.node_tree; bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'; nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color']); bsdf.inputs['Roughness'].default_value = 0.42; me.materials.append(mat)
nm = bpy.data.materials.new('facing'); nm.use_nodes = True; nt = nm.node_tree; nb = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')   # glows with each face's normal, unlit
nv = nt.nodes.new('ShaderNodeVertexColor'); nv.layer_name = 'Nrm'; nb.inputs['Base Color'].default_value = (0, 0, 0, 1)
for key, val in (('Emission Strength', 1.0), ('Specular IOR Level', 0.0), ('Roughness', 1.0)):
    if key in nb.inputs: nb.inputs[key].default_value = val
nt.links.new(nv.outputs['Color'], nb.inputs['Emission Color' if 'Emission Color' in nb.inputs else 'Emission'])
bpy.ops.object.camera_add(location=(0, 0.12, 1.0), rotation=(0, 0, 0)); cam = bpy.context.object; cam.data.type = 'ORTHO'; cam.data.ortho_scale = 0.24; scene.camera = cam
bpy.ops.object.light_add(type='SUN', rotation=(math.radians(42), 0, math.radians(-35))); bpy.context.object.data.energy = 2.2; bpy.context.object.data.angle = math.radians(12)
scene.world = bpy.data.worlds.new('World'); scene.world.use_nodes = True; next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND').inputs[1].default_value = 1.0
scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = 40; scene.render.film_transparent = True
scene.render.resolution_x = scene.render.resolution_y = 1024; scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
try: scene.cycles.use_denoising = False
except Exception: pass
os.makedirs(TMP, exist_ok=True); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(TMP, 'yew.blend'))
scene.view_settings.view_transform = 'Standard'; scene.render.filepath = os.path.join(TMP, '_yew_col.png'); bpy.ops.render.render(write_still=True)
scene.cycles.samples = 12; me.materials[0] = nm
next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND').inputs[1].default_value = 0.0
for o in scene.objects:
    if o.type == 'LIGHT': o.hide_render = True
scene.render.filepath = os.path.join(TMP, '_yew_nor.png'); bpy.ops.render.render(write_still=True)

from PIL import Image
c = np.asarray(Image.open(os.path.join(TMP, '_yew_col.png')).convert('RGBA'), np.float32) / 255; a = c[..., 3]; rgb = c[..., :3]
lin = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4); m = a > 0.5
lin *= np.array([0.02, 0.052, 0.012]) / lin[m].mean(0)                    # the tone the garden's hedge lighting was tuned for
rgb = np.clip(np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.clip(lin, 0, None) ** (1 / 2.4) - 0.055), 0, 1)
n = np.asarray(Image.open(os.path.join(TMP, '_yew_nor.png')).convert('RGBA'), np.float32)[..., :3] / 255; n = np.where(n <= 0.04045, n / 12.92, ((n + 0.055) / 1.055) ** 2.4); n[~m] = (0.5, 0.5, 1.0)
filled = m.copy()
for _ in range(24):                                                      # grow colour out under the transparent pixels, so mip-maps don't fringe dark
    acc = np.zeros_like(rgb); cnt = np.zeros(a.shape, np.float32)
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)): f = np.roll(filled, (dy, dx), (0, 1)); acc += np.roll(rgb, (dy, dx), (0, 1)) * f[..., None]; cnt += f
    new = (~filled) & (cnt > 0); rgb[new] = acc[new] / cnt[new][..., None]; filled |= new
rgb[~filled] = rgb[m].mean(0)
out = (np.dstack([rgb, a]) * 255).astype(np.uint8); Image.fromarray(out, 'RGBA').resize((768, 768), Image.LANCZOS).save(os.path.join(ROOT, 'assets', 'tex', 'card_yew.webp'), quality=90, method=6, exact=True)
nn = np.asarray(Image.fromarray((n * 255).astype(np.uint8), 'RGB').resize((768, 768), Image.LANCZOS), np.float32) / 255 * 2 - 1; nn /= np.maximum(np.linalg.norm(nn, axis=2, keepdims=True), 1e-4)
Image.fromarray(((nn * 0.5 + 0.5) * 255).astype(np.uint8), 'RGB').save(os.path.join(ROOT, 'assets', 'tex', 'card_yew_n.webp'), quality=90, method=6)
print('card_yew: coverage', round(float(m.mean()), 2)); os.remove(os.path.join(TMP, '_yew_col.png')); os.remove(os.path.join(TMP, '_yew_nor.png'))
