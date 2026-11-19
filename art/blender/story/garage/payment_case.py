"""The payment case: a ribbed aluminium case 46 x 33 x 15 cm with two latches, a handle and rubber
feet, lined with dark foam and packed with twelve banded stacks of the invented 500 corales note of
the Banco Central de Marazul. It lies flat: origin under its centre, the latches and handle on the
asset's front (+Y here, the game's -Z). The node `lid` has its origin on the hinge line at the back
(game x 0, y 0.095, z +0.165); rotation.x = +1.9 rad in the game opens it wide.
"""
import math

import bpy

import _story_kit as kit
import paint
from lib import meshkit as mk
from lib import surfaces as sf

ASSET = {'id': 'payment_case', 'atlas': 1024, 'kind': 'prop', 'views': ((28, 34, 1.15, (0, 0, 0.12)),)}
W, D, H, SPLIT = 0.46, 0.33, 0.15, 0.095


def shell(name, material, liner, lower):
    outer = mk.box(name, (W, D, H), (0, 0, H / 2), 0.016, 3)
    kit.cut(outer, SPLIT, lower)
    mk.shade(outer, 40)
    mk.assign(outer, material)
    inner = mk.box(name + '_liner', (W - 0.014, D - 0.014, H - 0.014), (0, 0, H / 2), 0.012, 2)
    kit.cut(inner, SPLIT, lower)
    mk.flip(inner)
    mk.shade(inner, 40)
    mk.assign(inner, liner)
    z = SPLIT - 0.004 if lower else SPLIT + 0.004
    rim = [kit.block(name + '_rim', (W + 0.004, 0.009, 0.008), (0, sy * (D / 2 - 0.0035), z), material, 0.002) for sy in (-1, 1)]
    rim += [kit.block(name + '_rim', (0.009, D + 0.004, 0.008), (sx * (W / 2 - 0.0035), 0, z), material, 0.002) for sx in (-1, 1)]
    return [outer, inner] + rim


def make(a, work_dir):
    alu = sf.bare_metal('case_aluminium', '#aeb2b6', 0.34, 0.45)
    foam = sf.coated('case_foam', '#17181a', 0.95, 0.0, 0.3, grain=0.1)
    steel = sf.bare_metal('latch_steel', '#c8cacc', 0.22, 0.3)
    grip = sf.rubber('handle_grip', '#131313')
    lower = shell('lower', alu, foam, True)
    lid = shell('lid_shell', alu, foam, False)
    # ribs pressed into the shell: along the lid and the bottom, and round the walls
    for i in range(7):
        y = -0.12 + 0.04 * i
        lid.append(kit.block('rib_top', (W - 0.07, 0.014, 0.0035), (0, y, H + 0.0008), alu, 0.0015))
        lower.append(kit.block('rib_bottom', (W - 0.07, 0.014, 0.0035), (0, y, -0.0008), alu, 0.0015))
    for z, target in ((0.022, lower), (0.048, lower), (0.074, lower), (0.118, lid), (0.136, lid)):
        for sy in (-1, 1):
            target.append(kit.block('rib_wall', (W - 0.07, 0.0035, 0.012), (0, sy * (D / 2 + 0.0008), z), alu, 0.0015))
        for sx in (-1, 1):
            target.append(kit.block('rib_side', (0.0035, D - 0.07, 0.012), (sx * (W / 2 + 0.0008), 0, z), alu, 0.0015))
    front = D / 2
    for sx in (-1, 1):
        x = sx * 0.145
        lower.append(kit.block('latch_plate', (0.042, 0.003, 0.034), (x, front + 0.003, SPLIT - 0.026), steel, 0.001))
        lower.append(kit.block('latch_lever', (0.03, 0.006, 0.04), (x, front + 0.0075, SPLIT - 0.012), steel, 0.002, (8, 0, 0)))
        lower.append(kit.rod('latch_pin', [(x - 0.019, front + 0.006, SPLIT - 0.03), (x + 0.019, front + 0.006, SPLIT - 0.03)], 0.003, steel, 8))
        lid.append(kit.block('latch_catch', (0.034, 0.005, 0.012), (x, front + 0.003, SPLIT + 0.014), steel, 0.0015))
        lower.append(kit.block('handle_mount', (0.022, 0.012, 0.02), (sx * 0.062, front + 0.006, SPLIT - 0.03), steel, 0.003))
        for y in (-1, 1):
            lower.append(kit.can('foot', 0.013, -0.006, 0.0, grip, (sx * 0.17, y * 0.11), 12))
        lower.append(kit.rod('hinge_lower', [(sx * 0.13 - 0.03, -front - 0.004, SPLIT), (sx * 0.13 + 0.03, -front - 0.004, SPLIT)], 0.005, steel, 8))
    handle = [((-0.062, front + 0.012, SPLIT - 0.03), 0.012, 0.012), ((-0.062, front + 0.024, SPLIT - 0.04), 0.012, 0.012),
              ((-0.045, front + 0.03, SPLIT - 0.055), 0.02, 0.016), ((0.0, front + 0.031, SPLIT - 0.06), 0.024, 0.018),
              ((0.045, front + 0.03, SPLIT - 0.055), 0.02, 0.016), ((0.062, front + 0.024, SPLIT - 0.04), 0.012, 0.012),
              ((0.062, front + 0.012, SPLIT - 0.03), 0.012, 0.012)]
    lower.append(kit.path_loft('handle', handle, grip, 10))

    # the money: 3 x 4 banded stacks, each note 140 x 66 mm
    px, py, z0, z1 = 0.143, 0.074, 0.0075, 0.079
    note = kit.printed('print_note', paint.banknote(work_dir), (-1.5 * px, -2 * py, 0), (px, 0, 0), (0, py, 0), roughness=0.6, repeat=True, bump=0.02)
    edges = kit.printed('print_edges', paint.note_edges(work_dir), (0, 0, z0), (0.04, 0.04, 0), (0, 0, z1 - z0), roughness=0.75, repeat=True)
    band = sf.plain('note_band', '#e4dec6', 0.7)
    stacks = []
    for i in range(3):
        for j in range(4):
            x, y = (i - 1) * px, (j - 1.5) * py
            lean = 0.0015 * math.sin(i * 2.1 + j * 1.3)
            stack = mk.box('stack', (0.14, 0.066, z1 - z0 + lean), (x, y, (z0 + z1 + lean) / 2), 0.0012, 1)
            mk.assign(stack, edges)
            mk.assign_faces(stack, note, lambda centre, normal: normal.z > 0.7)
            wrap = mk.box('band', (0.0285, 0.0668, z1 - z0 + lean + 0.0008), (x - 0.0033, y, (z0 + z1 + lean) / 2), 0.0, 1)
            mk.assign(wrap, band)
            mk.assign_faces(wrap, note, lambda centre, normal: normal.z > 0.7)
            stacks += [stack, wrap]
    a.add_all(lower, 0.9)
    a.add_all(stacks, 1.5)
    body = mk.join('lid', lid)
    body['texel'] = 0.9
    a.node(body, (0, -D / 2, SPLIT), 0.9)
    a.occlusion_distance = 0.12
    a.anchor('handle', (0, front + 0.03, SPLIT - 0.06))
    a.extra('lid_open', {'axis': 'x', 'degrees': 108})


def pose_for_preview():
    lid = bpy.data.objects.get('lid')
    if lid:
        lid.rotation_euler = (math.radians(108), 0, 0)
