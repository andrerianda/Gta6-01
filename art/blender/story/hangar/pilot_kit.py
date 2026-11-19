"""pilot_arm_fp: the pilot's right forearm and gloved hand for first-person shots. Origin at the
elbow, the forearm along +Y here (the game's -Z), palm down, thumb towards -X, 0.47 m to the
fingertips: an olive-grey flight-suit sleeve with a zipped pocket and an invented rank band (two
gold bars and a lozenge), a pale leather-and-fabric flight glove, the hand flat with the fingers
together (a salute hand).

suit_cooler: the pressure suit's portable cooler, a rounded case 0.35 x 0.25 x 0.30 m standing on
its origin, with a carrying handle (anchor_grip), vents, latches, a dial, a coiled hose with its
coupling and a lettered plate.
"""
import math
import os

from PIL import Image, ImageDraw

import _base_kit as kit
import _hk as hk
from lib import meshkit as mk
from lib import surfaces as sf


def rank_image(path):
    image = Image.new('RGB', (512, 64), (24, 30, 44))
    draw = ImageDraw.Draw(image)
    gold = (196, 160, 70)
    draw.rectangle([0, 3, 511, 6], fill=gold)
    draw.rectangle([0, 57, 511, 60], fill=gold)
    for x in (206, 286):
        draw.rectangle([x, 16, x + 20, 48], fill=gold)
    draw.polygon([(256, 14), (272, 32), (256, 50), (240, 32)], fill=gold)
    image.save(path)
    return path


def make_arm(a, work_dir):
    sleeve_mat = hk.canvas('sleeve', '#6a6e5a', 0.5, 0.35)
    pocket_mat = hk.canvas('pocket', '#62664f', 0.5, 0.35)
    leather = sf.coated('glove_leather', '#b7a684', 0.6, 0.0, 0.5, grain=0.3)
    fabric = hk.canvas('glove_fabric', '#8c8f7c', 0.4, 0.35)
    seam = sf.coated('seam', '#4a4636', 0.8, 0.0, 0.3)
    zip_metal = kit.galvanised('zip', '#9a9c9a')
    rank = hk.decal_material('rank_band', rank_image(os.path.join(work_dir, 'rank.png')), 0.7)

    stations = [(0.0, 0.112, 0.108), (0.04, 0.11, 0.102), (0.08, 0.103, 0.097), (0.12, 0.099, 0.09), (0.16, 0.091, 0.084), (0.2, 0.087, 0.076),
                (0.24, 0.08, 0.07), (0.262, 0.083, 0.071), (0.274, 0.083, 0.071)]
    rings = [mk.ring(y, w * (1 + 0.035 * math.sin(k * 2.4)), h * (1 + 0.03 * math.cos(k * 1.7)), 0.0, 0.0, 16) for k, (y, w, h) in enumerate(stations)]
    sleeve = mk.shade(mk.assign(mk.loft('sleeve', rings), sleeve_mat), 60)
    parts = [sleeve]
    band = mk.loft('rank', [mk.ring(0.196, 0.0905, 0.0795, 0.0, 0.0, 16), mk.ring(0.232, 0.0845, 0.0745, 0.0, 0.0, 16)], False, False)
    mk.recalc_normals(band)
    kit.orient(band, (0, 0.214, 0), True)
    hk.set_duv(band, lambda p: (0.5 + math.atan2(p.x, p.z) / (2 * math.pi), (p.y - 0.196) / 0.036))
    band['texel'] = 2.0
    parts.append(mk.shade(mk.assign(band, rank), 60))
    # the zipped pocket on the back of the forearm
    parts.append(kit.block('pocket', (0.062, 0.1, 0.007), (0.0, 0.105, 0.0485), pocket_mat, (-4.5, 0, 0), 0.002))
    parts.append(kit.block('zip', (0.05, 0.005, 0.003), (0.0, 0.148, 0.0492), zip_metal, (-4.5, 0, 0)))
    parts.append(kit.block('zip_pull', (0.006, 0.016, 0.003), (0.024, 0.155, 0.049), zip_metal, (-4.5, 0, 20)))
    parts.append(mk.shade(kit.rod('cuff_seam', mk.ring(0.262, 0.0845, 0.0725, 0.0, 0.0, 12) + mk.ring(0.262, 0.0845, 0.0725, 0.0, 0.0, 12)[:2], 0.0016, seam, 4), 60))

    # the glove: gauntlet, palm, four fingers together, the thumb laid along the palm
    glove = [(0.262, 0.078, 0.064, 2.0), (0.28, 0.074, 0.054, 2.2), (0.3, 0.068, 0.042, 2.4), (0.322, 0.082, 0.034, 2.8), (0.35, 0.09, 0.031, 3.0),
             (0.385, 0.089, 0.028, 3.0), (0.39, 0.086, 0.026, 3.0)]
    hand = mk.loft('hand', [mk.ring(y, w, h, 0.0, 0.0, 16, p) for y, w, h, p in glove])
    mk.assign(hand, leather)
    mk.assign_faces(hand, fabric, lambda c, n: n.z > 0.35 and c.y > 0.3)
    parts.append(mk.shade(hand, 60))
    for i, length in enumerate((0.076, 0.086, 0.079, 0.062)):
        x = -0.0327 + 0.0218 * i
        finger = mk.loft('finger%d' % i, [mk.ring(y, w, h, 0.0, x, 10, 2.6) for y, w, h in (
            (0.382, 0.0212, 0.024), (0.382 + length * 0.45, 0.0206, 0.022), (0.382 + length * 0.85, 0.0185, 0.018), (0.382 + length * 0.97, 0.013, 0.012),
            (0.382 + length, 0.006, 0.006))])
        mk.assign(finger, leather)
        mk.assign_faces(finger, fabric, lambda c, n: n.z > 0.5 and c.y < 0.382 + 0.03)
        parts.append(mk.shade(finger, 60))
        parts.append(kit.rod('finger_seam', [(x, 0.386, 0.0125), (x, 0.382 + length * 0.8, 0.0098)], 0.0009, seam, 3))
        parts.append(kit.rod('back_seam', [(x * 0.8, 0.31, 0.0195), (x, 0.386, 0.0135)], 0.0009, seam, 3))
    thumb = mk.tube('thumb', [(-0.036, 0.318, -0.006), (-0.052, 0.34, -0.006), (-0.0565, 0.37, -0.004), (-0.055, 0.398, -0.002), (-0.0535, 0.412, -0.001)],
                    [0.013, 0.0135, 0.012, 0.0105, 0.005], 8)
    parts.append(mk.shade(mk.assign(thumb, leather), 60))
    parts.append(mk.shade(kit.rod('wrist_band', mk.ring(0.3, 0.07, 0.044, 0.0, 0.0, 12, 2.4) + mk.ring(0.3, 0.07, 0.044, 0.0, 0.0, 12, 2.4)[:2], 0.0022, seam, 4), 60))
    parts.append(kit.block('glove_tab', (0.02, 0.026, 0.004), (0.0, 0.287, 0.0265), leather, (-12, 0, 0), 0.001))
    a.add(mk.join('lod0', parts))
    a.anchor('wrist', (0.0, 0.3, 0.0))
    a.extra('length', 0.468)


def make_cooler(a, work_dir):
    shell = sf.coated('cooler_shell', '#b4b7ae', 0.5, 0.0, 0.5, grain=0.2)
    dark = sf.coated('cooler_dark', '#1d1f21', 0.6, 0.0, 0.4, grain=0.2)
    rubber = sf.rubber('cooler_hose', '#2a2c2c')
    metal = kit.galvanised('cooler_metal', '#8f9396')
    blue = sf.coated('cooler_blue', '#2f5f86', 0.45, 0.0, 0.4)
    plate = hk.decal_material('cooler_plate', hk.board_image(os.path.join(work_dir, 'plate.png'), [('TERMOPAK 7', 0.36), ('SUIT COOLING UNIT', 0.2),
                              ('KEEP UPRIGHT  -  CHARGE 4 h', 0.14)], (512, 224), fg='#16181a', bg='#c8b548', border='#16181a', worn=0.2), 0.6)
    parts = [mk.shade(mk.assign(mk.box('case', (0.35, 0.25, 0.28), (0, 0, 0.16), 0.04, 4), shell), 50)]
    parts.append(kit.block('lid_seam', (0.354, 0.254, 0.008), (0, 0, 0.215), dark, bevel=0.002))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(mk.assign(mk.cylinder('foot', 0.022, 0.022, (sx * 0.125, sy * 0.08, 0.011), 'Z', 10), dark))
        parts.append(kit.block('latch', (0.03, 0.01, 0.05), (sx * 0.125, -0.128, 0.215), metal, bevel=0.002))
        parts.append(kit.block('handle_mount', (0.03, 0.04, 0.025), (sx * 0.09, 0, 0.308), dark, bevel=0.004))
    handle = [(-0.09, 0, 0.31), (-0.09, 0, 0.352), (-0.075, 0, 0.376), (-0.05, 0, 0.385), (0.05, 0, 0.385), (0.075, 0, 0.376), (0.09, 0, 0.352), (0.09, 0, 0.31)]
    parts.append(mk.shade(kit.rod('handle', handle, 0.011, rubber, 8), 60))
    # vents on the right side, the dial and the lettered plate on the front
    parts.append(kit.block('vent_plate', (0.006, 0.17, 0.13), (0.176, 0, 0.13), dark, bevel=0.002))
    for i in range(8):
        parts.append(kit.block('slat', (0.008, 0.16, 0.006), (0.18, 0, 0.078 + 0.015 * i), metal, (0, 25, 0)))
    parts.append(mk.shade(mk.assign(mk.cylinder('dial', 0.026, 0.014, (0.115, -0.131, 0.25), 'Y', 14), dark), 50))
    parts.append(kit.block('dial_mark', (0.004, 0.004, 0.02), (0.115, -0.139, 0.256), blue))
    parts.append(hk.sign('plate', [(-0.115, -0.1262, 0.075), (0.085, -0.1262, 0.075), (0.085, -0.1262, 0.163), (-0.115, -0.1262, 0.163)], plate, 2.2))
    parts.append(kit.block('stripe', (0.3, 0.004, 0.018), (0, -0.126, 0.183), blue))
    # the hose: from its port on the left side, four coils held in a strap, then up to the coupling on the lid
    path = [(-0.176, 0.06, 0.09), (-0.2, 0.06, 0.09)]
    for i in range(49):
        t = i / 48
        angle = 2 * math.pi * 4 * t - math.pi / 2
        path.append((-0.196 - 0.045 * t, 0.075 * math.cos(angle) * -1 + 0.0, 0.15 + 0.075 * math.sin(angle)))
    path += [(-0.245, 0.03, 0.24), (-0.2, 0.05, 0.3), (-0.12, 0.07, 0.325), (-0.06, 0.075, 0.318)]
    parts.append(mk.shade(kit.rod('hose', path, 0.0105, rubber, 6), 60))
    parts.append(mk.shade(mk.assign(mk.cylinder('hose_port', 0.018, 0.02, (-0.182, 0.06, 0.09), 'X', 10), metal), 50))
    parts.append(mk.shade(mk.assign(mk.cylinder('coupling', 0.017, 0.04, (-0.045, 0.075, 0.316), 'X', 10), metal), 50))
    parts.append(mk.shade(mk.assign(mk.cylinder('coupling_ring', 0.021, 0.01, (-0.03, 0.075, 0.316), 'X', 10), blue), 50))
    parts.append(kit.block('coupling_cradle', (0.05, 0.03, 0.02), (-0.045, 0.075, 0.302), dark, bevel=0.003))
    parts.append(kit.block('hose_strap', (0.075, 0.02, 0.006), (-0.215, 0, 0.228), dark))
    a.add(mk.join('lod0', parts))
    a.anchor('grip', (0.0, 0.0, 0.385))
    a.extra('size', {'width': 0.35, 'depth': 0.25, 'height': 0.30})
