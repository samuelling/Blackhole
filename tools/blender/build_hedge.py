#!/usr/bin/env python3
"""The clipped face of yew and box, modelled in Blender: a tile of foliage rendered from above into a seamless texture and normal map.

    python3 tools/blender/build_hedge.py            (bpy as a module)

Writes assets/tex/hedge_yew.webp, hedge_yew_n.webp, hedge_box.webp, hedge_box_n.webp (1024 square, tiling every 0.5 m) and
blender/hedge.blend.

From photographs of clipped yew and box hedges and topiary (Flickr via Openverse, credited in assets/models/HEDGE_CREDITS.md): a clipped
face is a close, even pile of short shoots all cut to one surface; yew a dark, matte green of flat two-ranked needles 1.5-2.5 cm long
on shoots a few centimetres long, the season's fresh tips lighter and yellower; box a brighter, finer surface of small opposite,
rounded, faintly glossy leaves 1-2 cm on wiry twigs. Every shoot here is real geometry (a twig and its needles or leaves), thousands
of them scattered over a 0.5 m tile and wrapped round its edges so it repeats without a seam, lit by an overcast sky and rendered
straight down. The normal map is the shoots' own normals, rendered the same way.
"""
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TILE = 0.5
rg = np.random.default_rng(3)


def leaf_mesh(bm, M, L, W, n=3):
    """A flat leaf or needle of length L, width W, in the shoot's frame M (4x4), as a little diamond fan."""
    pts = [(0, 0, 0)] + [(W * 0.5 * math.sin(math.pi * k / n) * (1 if s else -1), L * k / n, 0.0) for k in range(1, n) for s in (0, 1)] + [(0, L, 0)]
    vs = [bm.verts.new(M @ Vector(p)) for p in pts]
    # 0 base, then pairs (left,right) per row, last tip
    rows = [[vs[0]]] + [[vs[1 + 2 * (k - 1)], vs[2 + 2 * (k - 1)]] for k in range(1, n)] + [[vs[-1]]]
    for a, b in zip(rows, rows[1:]):
        if len(a) == 1 and len(b) == 2: bm.faces.new((a[0], b[1], b[0]))
        elif len(a) == 2 and len(b) == 2: bm.faces.new((a[0], a[1], b[1], b[0]))
        elif len(a) == 2 and len(b) == 1: bm.faces.new((a[0], a[1], b[0]))


def shoot(bm_leaf, bm_tip, bm_twig, at, kind):
    """One shoot growing out of the clipped face at `at`: a twig and its needles (yew) or leaves (box)."""
    x, y = at; out = Vector((rg.normal(0, 0.45), rg.normal(0, 0.45), 1.0)).normalized()   # roughly out of the face (+Z)
    side = out.cross(Vector((rg.normal(), rg.normal(), rg.normal()))).normalized()
    L = rg.uniform(0.03, 0.06) if kind == 'yew' else rg.uniform(0.025, 0.045)
    z0 = rg.uniform(-0.02, 0.0)   # all cut back to the same face, give or take
    base = Vector((x, y, z0)); tip = base + out * L
    # the twig, a thin square tube
    for i in range(2):
        a = base + side * 0.0012 * (1 if i else -1); b = tip + side * 0.0008 * (1 if i else -1)
    v = [bm_twig.verts.new(p) for p in (base - side * 0.0012, base + side * 0.0012, tip + side * 0.0008, tip - side * 0.0008)]; bm_twig.faces.new(v)
    fresh = rg.random() < (0.16 if kind == 'yew' else 0.2)
    n = int(rg.integers(10, 16)) if kind == 'yew' else int(rg.integers(4, 7))
    for k in range(n):
        f = (k + 0.5) / n; p = base + out * L * f
        if kind == 'yew':   # two ranks of needles, spread flat either side of the shoot
            for s in (-1, 1):
                d = (side * s * 0.9 + out * 0.45).normalized(); nrm = d.cross(out).cross(d).normalized()
                Mx = Matrix.Identity(4); xv = d.cross(nrm).normalized(); Mx.col[0][:3] = xv; Mx.col[1][:3] = d; Mx.col[2][:3] = nrm; Mx.col[3][:3] = p
                leaf_mesh(bm_tip if (fresh and f > 0.45) else bm_leaf, Mx, rg.uniform(0.014, 0.024) * (1 - 0.3 * f), 0.0024, 3)
        else:               # opposite pairs of rounded leaves, each pair turned a quarter
            ax = side if k % 2 == 0 else out.cross(side).normalized()
            for s in (-1, 1):
                d = (ax * s * 0.8 + out * 0.6).normalized(); nrm = (out - d * out.dot(d)).normalized()
                Mx = Matrix.Identity(4); xv = d.cross(nrm).normalized(); Mx.col[0][:3] = xv; Mx.col[1][:3] = d; Mx.col[2][:3] = nrm; Mx.col[3][:3] = p
                leaf_mesh(bm_tip if (fresh and f > 0.5) else bm_leaf, Mx, rg.uniform(0.011, 0.018), rg.uniform(0.006, 0.009), 4)


def material(name, col, rough, spec=0.3, sss=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*col, 1); b.inputs['Roughness'].default_value = rough
    try: b.inputs['Specular IOR Level'].default_value = spec
    except KeyError: pass
    return m


def lin(h): c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]; return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def build(kind, density):
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
    leafc, tipc, twigc = (('#22381a', '#4c6a24', '#4a3a28') if kind == 'yew' else ('#3e6a26', '#7a9a3a', '#6a6040'))
    mats = [material('leaf', lin(leafc), 0.7 if kind == 'yew' else 0.45), material('tip', lin(tipc), 0.65), material('twig', lin(twigc), 0.8)]
    bms = [bmesh.new() for _ in range(3)]
    n = int(density * TILE * TILE)
    pts = rg.uniform(0, TILE, (n, 2))
    for (x, y) in pts: shoot(*bms, (x, y), kind)
    # the tile is drawn nine times, side by side, so shoots crossing an edge carry on from the far side: it repeats without a seam
    objs = []
    for i, bm in enumerate(bms):
        me = bpy.data.meshes.new(f'{kind}{i}'); bm.to_mesh(me); bm.free(); me.materials.append(mats[i])
        for ox in (-TILE, 0, TILE):
            for oy in (-TILE, 0, TILE):
                o = bpy.data.objects.new(f'{kind}{i}_{ox}_{oy}', me); o.location = (ox, oy, 0); sc.collection.objects.link(o); objs.append(o)
    # the hedge's dark interior under the shoots
    bpy.ops.mesh.primitive_plane_add(size=TILE * 3, location=(TILE / 2, TILE / 2, -0.03)); fl = bpy.context.object; fl.data.materials.append(material('in', lin('#0e180a'), 1.0))
    # overcast sky from above, a little sun for the tips
    sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True; bg = sc.world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.9, 0.95, 1.0, 1); bg.inputs['Strength'].default_value = 1.4
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 1.5; sun.angle = math.radians(20); so = bpy.data.objects.new('sun', sun); so.rotation_euler = (math.radians(25), 0, math.radians(40)); sc.collection.objects.link(so)
    cam = bpy.data.cameras.new('c'); cam.type = 'ORTHO'; cam.ortho_scale = TILE; co = bpy.data.objects.new('c', cam); co.location = (TILE / 2, TILE / 2, 1.0); sc.collection.objects.link(co); sc.camera = co
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 48; sc.render.resolution_x = sc.render.resolution_y = 1024; sc.render.film_transparent = False
    try: sc.cycles.use_denoising = True
    except Exception: pass
    out = os.path.join(ROOT, 'assets', 'tex'); tmp = '/tmp/plants'
    sc.render.filepath = f'{tmp}/hedge_{kind}_col.png'; bpy.ops.render.render(write_still=True)
    # normals: every surface shows its own normal as a colour (camera looks down -Z, so world x,y,z are the tangent frame)
    nm = bpy.data.materials.new('nrm'); nm.use_nodes = True; nt = nm.node_tree; nt.nodes.clear()
    geo = nt.nodes.new('ShaderNodeNewGeometry'); vm = nt.nodes.new('ShaderNodeVectorMath'); vm.operation = 'MULTIPLY_ADD'; vm.inputs[1].default_value = (0.5, 0.5, 0.5); vm.inputs[2].default_value = (0.5, 0.5, 0.5)
    em = nt.nodes.new('ShaderNodeEmission'); outn = nt.nodes.new('ShaderNodeOutputMaterial')
    flip = nt.nodes.new('ShaderNodeMath'); flip.operation = 'MULTIPLY_ADD'; flip.inputs[1].default_value = -2.0; flip.inputs[2].default_value = 1.0   # 1 - 2 * backfacing
    sv = nt.nodes.new('ShaderNodeVectorMath'); sv.operation = 'SCALE'
    nt.links.new(geo.outputs['Backfacing'], flip.inputs[0]); nt.links.new(geo.outputs['Normal'], sv.inputs[0]); nt.links.new(flip.outputs[0], sv.inputs['Scale'])
    nt.links.new(sv.outputs['Vector'], vm.inputs[0]); nt.links.new(vm.outputs['Vector'], em.inputs['Color']); nt.links.new(em.outputs['Emission'], outn.inputs['Surface'])
    for o in sc.objects:
        if o.type == 'MESH': o.data.materials.clear(); o.data.materials.append(nm)
    sc.view_settings.view_transform = 'Raw'; sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.5, 0.5, 1.0, 1); sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0; sc.cycles.samples = 16; sc.render.filepath = f'{tmp}/hedge_{kind}_nrm.png'; bpy.ops.render.render(write_still=True)
    from PIL import Image
    Image.open(f'{tmp}/hedge_{kind}_col.png').convert('RGB').save(os.path.join(out, f'hedge_{kind}.webp'), quality=88)
    Image.open(f'{tmp}/hedge_{kind}_nrm.png').convert('RGB').save(os.path.join(out, f'hedge_{kind}_n.webp'), quality=92)
    print(kind, n, 'shoots on the tile')


if __name__ == '__main__':
    build('yew', 9000)
    build('box', 11000)
