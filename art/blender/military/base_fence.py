"""Perimeter fence of the air base, built for instancing: one 6 m panel along X (x -3..3).

A cranked concrete post stands at the panel's -X end and a galvanised tube post in its middle; both
carry an outrigger arm leaning 0.34 m towards +Y (the outside; the game's -Z) with three strands of
barbed wire, and a coil of concertina wire lies in the crook on top (to 3.07 m). Chain-link mesh
2.4 m high hangs between a top rail and a bottom tension wire.

Nodes: lod0 / lod1 / lod2 (the panel), gate_leaf (an 8 m framed leaf, origin on its hinge at
x = -4, with the child gate_leaf_mesh carrying its chain-link, barbed wire and warning sign),
post_end (one more concrete post standing at x = +3 of the panel's frame: draw it with the matrix of
the last panel of a run) and sign_warning (the plate "ZONA MILITAR - PROHIBIDO EL PASO" at the panel
centre, readable from both sides: draw it on a few panels only).

Materials: `atlas` (posts, arms, rails, gate frame; baked) and the alpha-tested, double-sided
`cutout`, whose 512 x 1024 texture is baked from real geometry with Cycles (_ground_kit.bake_card):
woven chain-link wire, twisted barbed strands, a concertina helix with its blades, and the sign
(Blender text on an enamelled, rusting plate). The wires are drawn thicker than life so that they
survive the alpha test at a distance: about 45 % of the chain-link texels are solid.
"""
import math
import os

import bpy
import numpy as np

import _base_kit as kit
import _ground_kit as gk
from _ground_kit import Graph
from lib import meshkit as mk
from lib import surfaces as sf

ASSET = {'id': 'base_fence', 'atlas': 512, 'kind': 'prop', 'views': ((20, 8, 1.6, (0, 0, 1.4)), (160, 20, 2.6, (-1.5, 0, 1.6)))}

WORK = '/tmp/marazul/flight/s4/a4-base-ground/base_fence'
TILE = 1.2                                  # metres of fence one texture width covers
REPEAT = 5.0                                # texture widths along the 6 m panel
# rows of the 512 x 1024 texture, as v from the top (0..1)
CHAIN, BARBED, COIL, SIGN = (0.0, 0.5), (0.5, 0.5625), (0.5625, 0.6875), (0.6875, 0.875)
SIGN_U = (0.0, 0.75)
ARM = ((0.0, 2.42), (0.34, 2.82))           # the outrigger arm in (y, z)
COIL_AT, COIL_RADIUS = (0.13, 2.84), 0.23


# --- the cutout texture, baked from geometry -----------------------------------------------------------

def wire_material(name, size, rust_at=0.56):
    g = Graph(name, size, source='object')
    zinc = g.mix(g.noise(5.0, 3.0).ramp(0.3, 0.7), Graph.rgb('#8c9194'), Graph.rgb('#b5b9ba'))
    rust = (g.noise(2.4, 4.0, 0.6, seed=1) + (g.noise(14.0, 2.0, seed=2) - 0.5) * 0.2).ramp(rust_at, rust_at + 0.1)
    brown = g.mix(g.noise(20.0, 2.0, seed=3).ramp(0.3, 0.7), Graph.rgb('#5a3119'), Graph.rgb('#8b5731'))
    return g.finish(g.mix(rust * 0.9, zinc, brown), 0.5, 0.7)


def chain_source():
    """Woven chain-link over 1.2 x 1.2 m: zigzag wires 37.5 mm apart, each hooked into its neighbours
    (diamonds 75 mm corner to corner, 53 mm between parallel wires)."""
    material = wire_material('wire_chain', (TILE, TILE))
    wires = []
    step = 0.0375
    for i in range(-1, 33):
        x = (i + 0.5) * step
        path = [(x + 0.5 * step * (1 if (k + i) % 2 == 0 else -1), k * step, 0.014 + 0.005 * (1 if (k + i) % 2 == 0 else -1) * (1 if k % 2 == 0 else -1))
                for k in range(-2, 35)]
        wires.append(mk.tube('wire', path, 0.0078, 6))
    return mk.assign(mk.join('chain_source', wires), material)


def barbed_source():
    """One strand of two twisted wires with a four-point barb every 150 mm, over 1.2 x 0.15 m."""
    material = wire_material('wire_barbed', (TILE, 0.15), 0.52)
    parts = []
    for phase in (0.0, math.pi):
        path = [(x, 0.075 + 0.0045 * math.cos(2 * math.pi * x / 0.06 + phase), 0.014 + 0.0045 * math.sin(2 * math.pi * x / 0.06 + phase))
                for x in np.arange(-0.06, TILE + 0.065, 0.0075)]
        parts.append(mk.tube('strand', path, 0.0036, 5))
    for j in range(-1, 9):
        xb = (j + 0.5) * 0.15
        parts.append(mk.cylinder('wrap', 0.0095, 0.022, (xb, 0.075, 0.014), 'X', 8))
        for s in (-1, 1):
            parts.append(mk.tube('barb', [(xb - s * 0.016, 0.036, 0.02), (xb - s * 0.005, 0.063, 0.024), (xb + s * 0.005, 0.087, 0.024), (xb + s * 0.016, 0.114, 0.02)],
                                 [0.0009, 0.0032, 0.0032, 0.0009], 5))
    return mk.assign(mk.join('barbed_source', parts), material)


def coil_source():
    """Concertina wire seen from the side over 1.2 x 0.5 m: two opposite-handed helices, six turns
    each, with a razor blade every tenth of a turn."""
    material = wire_material('wire_coil', (TILE, 0.5), 0.5)
    parts = []
    for hand, shift in ((1, 0.0), (-1, 0.1)):
        steps = [2 * math.pi * i / 24 for i in range(-36, 8 * 24 + 1)]
        at = lambda t: (t * 0.2 / (2 * math.pi) + shift, 0.25 + 0.218 * math.cos(t), 0.27 + hand * 0.218 * math.sin(t))
        parts.append(mk.tube('helix', [at(t) for t in steps], 0.0058, 5))
        for i in range(-15, 80):
            x, y, z = at(2 * math.pi * i / 10 + 0.3)
            parts.append(mk.tube('blade', [(x - 0.021, y, z), (x, y, z), (x + 0.021, y, z)], [0.0008, 0.0085, 0.0008], 4))
    return mk.assign(mk.join('coil_source', parts), material)


def text_mesh(body, height, material):
    """Blender's own font as a flat mesh: lower-left corner on the origin, capitals `height` tall."""
    curve = bpy.data.curves.new('sign_text', 'FONT')
    curve.body = body
    holder = bpy.data.objects.new('sign_text', curve)
    bpy.context.scene.collection.objects.link(holder)
    bpy.context.view_layer.update()
    mesh = bpy.data.meshes.new_from_object(holder.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(holder, do_unlink=True)
    obj = bpy.data.objects.new('sign_text_mesh', mesh)
    bpy.context.scene.collection.objects.link(obj)
    xs, ys = [v.co.x for v in mesh.vertices], [v.co.y for v in mesh.vertices]
    scale = height / (max(ys) - min(ys))
    mk.map_points(obj, lambda v: ((v.x - min(xs)) * scale, (v.y - min(ys)) * scale, 0.0))
    return mk.assign(obj, material), (max(xs) - min(xs)) * scale


def sign_source(size=(0.8, 0.4)):
    """The warning plate: off-white enamel with a red frame, a no-entry disc and two lines of text;
    rust creeping in from the edges and the bolt holes."""
    g = Graph('sign_plate', size, (False, False), source='object')
    edge = g.x.min(size[0] - g.x).min(g.y.min(size[1] - g.y))
    enamel = g.mix(g.noise(6.0, 3.0).ramp(0.3, 0.7), Graph.rgb('#cfcbbd'), Graph.rgb('#e2dfd3'))
    frame = edge.ramp(0.016, 0.018) * edge.ramp(0.032, 0.03)
    colour = g.mix(frame, enamel, Graph.rgb('#a0251d'))
    streak = g.noise(9.0, 3.0, 0.6, (1.0, 8.0), seed=1).ramp(0.5, 0.75)
    colour = g.mix(streak * 0.35, colour, Graph.rgb('#77705f'))
    rust = (edge - g.noise(11.0, 3.0, 0.65, seed=2) * 0.075).ramp(-0.012, -0.03).max(g.noise(5.0, 4.0, 0.65, seed=3).ramp(0.66, 0.71))
    colour = g.mix(rust, colour, g.mix(g.noise(30.0, 2.0, seed=4).ramp(0.3, 0.7), Graph.rgb('#4f2a14'), Graph.rgb('#86512b')))
    plate = mk.assign(mk.quad('plate', [(0, 0, 0), (size[0], 0, 0), (size[0], size[1], 0), (0, size[1], 0)]), g.finish(colour, 0.5))
    black, red, white = sf.plain('sign_black', '#191918'), sf.plain('sign_red', '#a0251d'), sf.plain('sign_white', '#dedbd0')
    parts = [plate, mk.assign(mk.cylinder('disc', 0.105, 0.002, (0.155, 0.2, 0.002), 'Z', 40), red),
             mk.assign(mk.box('bar', (0.15, 0.036, 0.002), (0.155, 0.2, 0.0045)), white)]
    for body, height, top, material in (('ZONA MILITAR', 0.07, 0.315, black), ('PROHIBIDO EL PASO', 0.044, 0.19, red)):
        text, width = text_mesh(body, height, material)
        fit = min(1.0, 0.47 / width)
        mk.transform(text, (0.295 + 0.5 * (0.47 - width * fit), top - height, 0.003), scale=(fit, 1.0, 1.0))
        parts.append(text)
    parts.append(mk.assign(mk.box('rule', (0.47, 0.008, 0.002), (0.53, 0.217, 0.003)), black))
    for x, y in ((0.05, 0.05), (0.75, 0.05), (0.05, 0.35), (0.75, 0.35)):
        parts.append(mk.assign(mk.cylinder('bolt', 0.011, 0.006, (x, y, 0.003), 'Z', 8), sf.plain('sign_bolt', '#5b4a3a')))
    return mk.join('sign_source', parts)


def bake_texture(path):
    """Bakes the four sources into the 512 x 1024 cutout texture; returns its numbers."""
    canvas = np.zeros((1024, 512, 4), dtype=np.float32)
    numbers = {}
    for name, source, size, rows, columns in (('chain', chain_source, (TILE, TILE), (0, 512), 512), ('barbed', barbed_source, (TILE, 0.15), (512, 576), 512),
                                              ('coil', coil_source, (TILE, 0.5), (576, 704), 512), ('sign', sign_source, (0.8, 0.4), (704, 896), 384)):
        obj = source()
        card = gk.bake_card(obj, size, (columns, rows[1] - rows[0]), occlusion_distance=0.05)
        bpy.data.objects.remove(obj, do_unlink=True)
        alpha = card['alpha']
        colour = gk.srgb(gk.bleed(gk.lit(card, 0.5, 0.35), alpha))
        canvas[rows[0]:rows[1], :columns, :3] = colour
        canvas[rows[0]:rows[1], :columns, 3] = alpha
        solid = float((alpha >= 0.5).mean())
        numbers[name] = {'open': round(1.0 - solid, 3), 'seam_u': gk.seam_error(gk.to_bytes(alpha))['u']}
        if name == 'chain':
            numbers[name]['seam_v'] = gk.seam_error(gk.to_bytes(alpha))['v']
    # the unused part of the image takes the wire colour, so the mip chain stays clean
    canvas[896:, :, :3] = canvas[:512, :, :3].mean(axis=(0, 1))
    canvas[704:896, 384:, :3] = canvas[:512, :, :3].mean(axis=(0, 1))
    gk.save_png(gk.to_bytes(canvas), path)
    return numbers


# --- the meshes ----------------------------------------------------------------------------------------

def inset(band, texels=1.5):
    return (band[0] + texels / 1024.0, band[1] - texels / 1024.0)


def arm_point(t):
    return (ARM[0][0] + (ARM[1][0] - ARM[0][0]) * t, ARM[0][1] + (ARM[1][1] - ARM[0][1]) * t)


def wire_cards(sheet, x0, x1, repeat, level):
    """Barbed strands along the arms and the concertina coil as crossed cards."""
    for t in ((0.2, 0.55, 0.92) if level < 2 else (0.55,)):
        y, z = arm_point(t)
        sheet.quad([(x0, y, z - 0.075), (x1, y, z - 0.075), (x1, y, z + 0.075), (x0, y, z + 0.075)], (0.0, repeat), inset(BARBED))
    for angle in ((90, 30, 150), (90, 0), (90,))[level]:
        dy, dz = math.cos(math.radians(angle)) * COIL_RADIUS * 1.09, math.sin(math.radians(angle)) * COIL_RADIUS * 1.09
        y, z = COIL_AT
        sheet.quad([(x0, y - dy, z - dz), (x1, y - dy, z - dz), (x1, y + dy, z + dz), (x0, y + dy, z + dz)], (0.0, repeat), inset(COIL))


def sign_quads(sheet, x, z, y=0.035, size=(0.8, 0.4)):
    """The plate as two faces back to back, so that it reads from both sides."""
    w, h = size[0] * 0.5, size[1] * 0.5
    sheet.quad([(x + w, y, z - h), (x - w, y, z - h), (x - w, y, z + h), (x + w, y, z + h)], SIGN_U, inset(SIGN))
    sheet.quad([(x - w, -y, z - h), (x + w, -y, z - h), (x + w, -y, z + h), (x - w, -y, z + h)], SIGN_U, inset(SIGN))


def concrete_post(name, x, material, steel, level):
    """A concrete post with its galvanised outrigger arm (and a footing at the finest level)."""
    parts = [kit.block(name, (0.13, 0.13, 2.5), (x, 0, 1.25), material, bevel=0.012 if level == 0 else 0.0)]
    length = math.hypot(ARM[1][0] - ARM[0][0], ARM[1][1] - ARM[0][1])
    angle = math.degrees(math.atan2(ARM[1][1] - ARM[0][1], ARM[1][0] - ARM[0][0]))
    middle = arm_point(0.5)
    if level < 2:
        parts.append(kit.block(name + '_arm', (0.045, length + 0.1, 0.05), (x, middle[0], middle[1]), steel, (angle, 0, 0)))
    if level == 0:
        parts.append(kit.block(name + '_footing', (0.34, 0.34, 0.07), (x, 0, 0.035), material, bevel=0.01))
        parts.append(kit.block(name + '_strap', (0.15, 0.15, 0.05), (x, 0, 2.38), steel))
    return parts


def panel(level, concrete, steel, cutout):
    sheet = gk.Sheet()
    for row in range(2):
        z0 = 0.05 + 1.2 * row
        sheet.quad([(-3, 0, z0), (3, 0, z0), (3, 0, z0 + 1.2), (-3, 0, z0 + 1.2)], (0.0, REPEAT), CHAIN)
    wire_cards(sheet, -3.0, 3.0, REPEAT, level)
    parts = concrete_post('post', -3.0, concrete, steel, level)
    if level < 2:
        sides = (8, 4)[level]
        parts.append(kit.drum('mid_post', 0.034, 0.0, 2.5, steel, (0.0, 0.0), sides))
        length = math.hypot(ARM[1][0] - ARM[0][0], ARM[1][1] - ARM[0][1])
        angle = math.degrees(math.atan2(ARM[1][1] - ARM[0][1], ARM[1][0] - ARM[0][0]))
        middle = arm_point(0.5)
        parts.append(kit.block('mid_arm', (0.04, length + 0.1, 0.045), (0.0, middle[0], middle[1]), steel, (angle, 0, 0)))
        parts.append(kit.rod('top_rail', [(-3, 0, 2.47), (3, 0, 2.47)], 0.024, steel, (6, 3)[level]))
    if level == 0:
        parts.append(kit.rod('bottom_wire', [(-3, 0, 0.07), (3, 0, 0.07)], 0.008, steel, 3))
        parts.append(kit.block('mid_footing', (0.3, 0.3, 0.06), (0, 0, 0.03), concrete, bevel=0.01))
        for x in (-1.5, 1.5):
            parts.append(kit.rod('stay', [(x, 0.012, 0.07), (x, 0.012, 2.47)], 0.007, steel, 3))
    return parts, sheet.mesh('panel_mesh%d' % level, cutout, 'atlas')


def gate_leaf(steel, dark, cutout):
    x0, x1, low, top = -3.96, 3.96, 0.14, 2.46
    frame = [kit.rod('gate_frame', [(x0, 0, low), (x1, 0, low), (x1, 0, top), (x0, 0, top), (x0, 0, low), (x0 + 0.01, 0, low)], 0.036, steel, 6),
             kit.rod('gate_mullion', [(0, 0, low), (0, 0, top)], 0.03, steel, 6)]
    for a, b in (((x0, low), (0.0, top)), ((0.0, top), (x1, low))):
        frame.append(kit.block('gate_brace', (math.hypot(b[0] - a[0], b[1] - a[1]), 0.012, 0.05), (0.5 * (a[0] + b[0]), 0.03, 0.5 * (a[1] + b[1])), steel,
                               (0, -math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])), 0)))
    for x in (x0, 0.0, x1):
        frame.append(kit.rod('gate_stub', [(x, 0, top), (x, 0, 2.92)], 0.02, steel, 4))
    for z in (0.45, 2.15):
        frame.append(kit.block('gate_hinge', (0.1, 0.07, 0.12), (x0 - 0.02, 0, z), dark))
    frame.append(kit.block('gate_latch', (0.06, 0.1, 0.22), (x1 + 0.01, 0, 1.2), dark))
    frame.append(kit.block('gate_fork', (0.05, 0.07, 0.16), (x1 - 0.45, 0, 0.13), dark))
    wheel = mk.assign(mk.cylinder('gate_wheel', 0.085, 0.045, (x1 - 0.45, 0, 0.085), 'Y', 10), dark)
    frame.append(mk.shade(wheel, 50))
    sheet = gk.Sheet()
    rows = (top - low) / 2.0
    for row in range(2):
        z0 = low + rows * row
        sheet.quad([(x0, 0, z0), (x1, 0, z0), (x1, 0, z0 + rows), (x0, 0, z0 + rows)], (0.0, 6.6), CHAIN)
    for k in range(3):
        z = 2.52 + 0.14 * k
        sheet.quad([(x0, 0, z), (x1, 0, z), (x1, 0, z + 0.15), (x0, 0, z + 0.15)], (0.13 * k, 6.6 + 0.13 * k), inset(BARBED))
    sign_quads(sheet, -1.98, 1.5, 0.045)
    return mk.join('gate_leaf', frame), sheet.mesh('gate_leaf_mesh', cutout, 'atlas')


def make(a):
    numbers = bake_texture(os.path.join(WORK, 'cutout.png'))
    cutout = gk.image_material('cutout', os.path.join(WORK, 'cutout.png'), 0.5, 0.6)
    concrete = kit.weathered('post_concrete', '#9c978b', 0.9, 0.0, 0.75, soot='#7b5535', soot_range=(0.58, 0.72))
    steel = kit.weathered('galvanised', '#8b9094', 0.5, 0.85, 0.55, soot='#6e3f22', soot_range=(0.54, 0.66))
    dark = kit.painted_steel('gate_iron', '#30332f', 0.55, 0.6)
    for level in range(3):
        parts, mesh = panel(level, concrete, steel, cutout)
        a.parts_of(parts + [mesh], levels=(level,))
    frame, mesh = gate_leaf(steel, dark, cutout)
    a.moving(frame, (-4.0, 0.0, 0.0))
    a.moving(mesh, (-4.0, 0.0, 0.0))
    bpy.context.view_layer.update()
    mesh.parent = frame
    mesh.matrix_parent_inverse = frame.matrix_world.inverted()
    a.moving(mk.join('post_end', concrete_post('post_end', 3.0, concrete, steel, 0)), (0.0, 0.0, 0.0))
    sign = gk.Sheet()
    sign_quads(sign, 0.0, 1.55)
    a.moving(sign.mesh('sign_warning', cutout, 'atlas'), (0.0, 0.0, 0.0))
    a.lod_distances = (45.0, 140.0)
    a.collider_box('panel', (6.0, 0.14, 2.8), (0, 0.0, 1.4))
    a.collider_box('gate_leaf', (8.0, 0.14, 2.6), (0, 0.0, 1.3))
    a.extra('panel_length', 6.0)
    a.extra('gate_leaf', {'length': 8.0, 'hinge_x': -4.0, 'axis': 'z', 'degrees': 90})
    gk.hook_finish(a, images={'atlas.base': (512, 78), 'atlas.orm': (256, 78), 'atlas.normal': (512, 68), 'cutout.base': (1024, 80)},
                   numbers=lambda: {'cutout': numbers,
                                    'sheet': gk.preview('/tmp/marazul/flight/s4/a4-base-ground/sheets/base_fence.jpg',
                                                        ((22, 6, 2.6, (-1.6, 0, 1.7)), (10, 4, 9.0, (-2.9, 0, 2.5))), (640, 360))})
