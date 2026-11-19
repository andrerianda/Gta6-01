"""The dark hardened hangar of the final mission, seen from INSIDE (an original design): 60 m wide,
52 m deep, 15 m to the roof deck, origin at the floor centre, the door wall at +Y here (the game's
-Z). Concrete floor slabs with joints, oil stains, tyre marks and painted guide lines; concrete dado
and pilasters under ribbed steel cladding, conduits, extinguishers, a tool crib, lettered boards;
seven steel roof trusses with dead lamp housings; the door wall is a frame with a 54 x 13 m opening
closed by two sliding doors `door_l` and `door_r` (27.2 x 13.2 m each) that hang outside the wall
on a head rail in two planes and overlap 0.2 m at the centre line.
"""
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

import _base_kit as kit
import _hk as hk
from lib import meshkit as mk
from lib import surfaces as sf

W, D, H = 60.0, 52.0, 15.0
HX, HY = W / 2, D / 2
OPEN_W, OPEN_H = 54.0, 13.0
DOOR_W, DOOR_H, DOOR_T = 27.2, 13.2, 0.3
DOOR_Y = (HY + 0.75, HY + 1.15)      # the two door planes (left, right), outside the wall
TRAVEL = 27.2
INSIDE = (0.0, 0.0, 6.0)
TRUSS_YS = (-21.0, -14.0, -7.0, 0.0, 7.0, 14.0, 21.0)
PX = 25.6                            # floor image pixels per metre


def floor_image(path):
    """The whole floor painted at 4 cm a pixel: slabs, joints, stains, tyre marks, guide lines."""
    w, h = int(W * PX), int(D * PX)
    rng = np.random.default_rng(4)

    def cloud(cells):
        small = Image.fromarray((rng.random((int(cells * h / w) + 2, cells + 2)) * 255).astype(np.uint8))
        return np.asarray(small.resize((w, h), Image.BICUBIC), dtype=np.float32) / 255.0

    tone = 0.5 * cloud(9) + 0.3 * cloud(40) + 0.2 * cloud(160)
    base = np.empty((h, w, 3), dtype=np.float32)
    base[:] = (118, 115, 108)
    base *= (0.78 + 0.4 * tone)[..., None]
    # each slab (6 x 6.5 m) a slightly different pour
    for i in range(10):
        for j in range(8):
            x0, y0 = int(i * 6.0 * PX), int(j * 6.5 * PX)
            base[y0:y0 + int(6.5 * PX), x0:x0 + int(6.0 * PX)] *= 0.92 + 0.16 * rng.random()
    image = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))
    draw = ImageDraw.Draw(image, 'RGBA')

    def at(x, y):   # metres (x right, y towards the doors) -> pixels (v up)
        return ((x + HX) * PX, (HY - y) * PX)

    for i in range(1, 10):
        draw.line([at(-HX + i * 6.0, -HY), at(-HX + i * 6.0, HY)], fill=(38, 37, 34, 255), width=3)
    for j in range(1, 8):
        draw.line([at(-HX, -HY + j * 6.5), at(HX, -HY + j * 6.5)], fill=(38, 37, 34, 255), width=3)
    # painted guide lines: the yellow taxi centre line, the nose-wheel stop bar, wing-tip limits, the door line
    yellow, white, red = (190, 152, 34, 235), (196, 192, 178, 225), (150, 40, 32, 230)
    draw.line([at(0, -19.0), at(0, HY)], fill=yellow, width=8)
    draw.line([at(-2.2, 4.0), at(2.2, 4.0)], fill=yellow, width=10)
    for sx in (-1, 1):
        draw.line([at(sx * 25.0, -20.0), at(sx * 25.0, HY)], fill=white, width=5)
        for k in range(26):
            y = -20.0 + k * 1.8
            draw.line([at(sx * 26.2, y), at(sx * 27.4, y + 0.9)], fill=red, width=6)
    for k in range(40):
        x = -27.0 + k * 1.35
        draw.polygon([at(x, HY - 1.3), at(x + 0.68, HY - 1.3), at(x + 1.0, HY - 0.5), at(x + 0.32, HY - 0.5)], fill=yellow)
    draw.rectangle([at(-24.0, -17.0)[0], at(0, -17.0)[1], at(-12.0, 0)[0], at(0, -22.5)[1]], outline=white, width=5)
    font = ImageFont.truetype(hk.FONT, 64)
    draw.text(at(-22.6, -18.2), 'GROUND EQUIPMENT', font=ImageFont.truetype(hk.FONT, 26), fill=white)
    draw.text(at(2.0, 22.5), 'H2', font=font, fill=yellow)
    # tyre marks: long faint arcs from the doors to the stand, and tug marks
    marks = Image.new('L', (w, h), 0)
    md = ImageDraw.Draw(marks)
    for track, sway in ((-5.5, 0.4), (5.5, 0.4), (-0.3, 0.2), (0.3, 0.2), (-6.1, -0.7), (4.9, -0.7), (14.0, 2.5), (15.6, 2.5)):
        pts = [at(track + sway * math.sin(t * 0.21) + 0.02 * t * sway, -12.0 + t) for t in np.arange(0.0, 38.0, 0.5)]
        md.line(pts, fill=int(70 + 60 * rng.random()), width=int(9 + 4 * rng.random()))
    marks = np.asarray(marks.filter(ImageFilter.GaussianBlur(1.6)), dtype=np.float32) / 255.0
    marks *= 0.45 + 0.55 * cloud(60)
    # oil and hydraulic stains: dark, soft-edged, densest under the stand
    stains = Image.new('L', (w, h), 0)
    sd = ImageDraw.Draw(stains)
    for k in range(70):
        near = k < 40
        x = rng.normal(0.0, 7.0) if near else rng.uniform(-28, 28)
        y = rng.normal(-3.0, 6.0) if near else rng.uniform(-24, 24)
        r = rng.uniform(0.15, 0.9) * (1.6 if k % 9 == 0 else 1.0)
        cx, cy = at(x, y)
        sd.ellipse([cx - r * PX, cy - r * PX * rng.uniform(0.6, 1.0), cx + r * PX, cy + r * PX * rng.uniform(0.6, 1.0)],
                   fill=int(rng.uniform(90, 230)))
    stains = np.asarray(stains.filter(ImageFilter.GaussianBlur(4.0)), dtype=np.float32) / 255.0
    stains = np.clip(stains * (0.5 + 0.9 * cloud(90)), 0, 1)
    data = np.asarray(image.convert('RGB'), dtype=np.float32)
    data *= (1.0 - 0.62 * marks)[..., None]
    data = data * (1.0 - 0.8 * stains)[..., None] + (stains * 6.0)[..., None]
    Image.fromarray(np.clip(data, 0, 255).astype(np.uint8)).save(path)
    return path


def truss(name, y, steel):
    """A Pratt truss across the hangar: chords, posts, diagonals, gusset plates at the feet."""
    low, high, bays = 12.4, 14.75, 12
    xs = [-HX + 0.3 + (W - 0.6) * i / bays for i in range(bays + 1)]
    parts = [kit.block(name + '_low', (W - 0.2, 0.34, 0.3), (0, y, low), steel), kit.block(name + '_high', (W - 0.2, 0.3, 0.26), (0, y, high), steel)]
    for i, x in enumerate(xs):
        parts.append(kit.block(name + '_post', (0.2, 0.22, high - low), (x, y, (low + high) / 2), steel))
        if i < bays:
            a, b = (x, xs[i + 1]) if i >= bays // 2 else (xs[i + 1], x)
            parts.append(kit.rod(name + '_web', [(a, y, low + 0.1), (b, y, high - 0.1)], 0.1, steel, 4))
    for sx in (-1, 1):
        parts.append(kit.block(name + '_knee', (1.6, 0.2, 0.22), (sx * (HX - 0.9), y, low - 0.75), steel, (0, sx * 45, 0)))
    return parts


def lamp_housing(name, x, y, steel, lens):
    stem = kit.rod(name + '_stem', [(x, y, 12.25), (x, y, 11.75)], 0.035, steel, 5)
    shade = mk.shade(mk.assign(mk.cylinder(name, 0.2, 0.45, (x, y, 11.55), 'Z', 12, 0.48), steel), 50)
    glass = mk.assign(mk.cylinder(name + '_lens', 0.44, 0.03, (x, y, 11.34), 'Z', 12), lens)
    return [stem, shade, glass]


def extinguisher(name, x, y, facing, red, dark, sign_mat):
    """A wall extinguisher on its bracket, 0.6 m tall, with its board above. facing: +1 looks +X."""
    ox = x + facing * 0.16
    parts = [mk.shade(mk.assign(mk.cylinder(name, 0.085, 0.5, (ox, y, 1.05), 'Z', 12), red), 50),
             mk.shade(mk.assign(mk.cylinder(name + '_neck', 0.085, 0.07, (ox, y, 1.335), 'Z', 12, 0.03), red), 50),
             kit.block(name + '_valve', (0.05, 0.05, 0.09), (ox, y, 1.41), dark),
             kit.block(name + '_lever', (0.04, 0.16, 0.025), (ox, y + 0.05, 1.47), dark),
             kit.rod(name + '_hose', [(ox, y - 0.03, 1.4), (ox, y - 0.14, 1.3), (ox, y - 0.12, 0.95)], 0.014, dark, 5),
             kit.block(name + '_bracket', (0.1, 0.24, 0.06), (x + facing * 0.05, y, 1.1), dark)]
    s = facing
    parts.append(hk.sign(name + '_board', [(x + s * 0.02, y - s * 0.3, 1.75), (x + s * 0.02, y + s * 0.3, 1.75),
                                           (x + s * 0.02, y + s * 0.3, 2.2), (x + s * 0.02, y - s * 0.3, 2.2)], sign_mat, 3.0))
    return parts


def door(name, x0, x1, y, meet_x, steel, rib, hazard, dark, plate, look=-1):
    """One sliding door leaf from x0 to x1 in the plane y: a ribbed steel slab on rollers."""
    cx = (x0 + x1) / 2
    inner = y - DOOR_T / 2
    parts = [kit.block(name + '_slab', (DOOR_W, DOOR_T, DOOR_H), (cx, y, DOOR_H / 2), steel)]
    for i in range(1, 20):
        x = x0 + DOOR_W * i / 20
        parts.append(kit.block(name + '_rib', (0.14, 0.16, DOOR_H - 0.5), (x, inner - 0.08, DOOR_H / 2), rib))
    for z in (0.3, 3.4, 6.6, 9.8, 12.9):
        parts.append(kit.block(name + '_girt', (DOOR_W - 0.1, 0.22, 0.26), (cx, inner - 0.11, z), rib))
    for i in range(4):
        a, b = x0 + DOOR_W * i / 4, x0 + DOOR_W * (i + 1) / 4
        parts.append(kit.rod(name + '_brace', [(a + 0.2, inner - 0.2, 0.45), (b - 0.2, inner - 0.2, 6.45)], 0.07, rib, 4))
        parts.append(kit.rod(name + '_brace2', [(b - 0.2, inner - 0.2, 6.75), (a + 0.2, inner - 0.2, 12.75)], 0.07, rib, 4))
    # the meeting edge: a crisp steel nosing with a warning band beside it
    side = 1 if meet_x > cx else -1
    parts.append(kit.block(name + '_nosing', (0.1, DOOR_T + 0.1, DOOR_H), (meet_x - side * 0.05, y, DOOR_H / 2), dark))
    parts.append(kit.block(name + '_band', (0.5, 0.03, DOOR_H - 0.6), (meet_x - side * 0.5, inner - 0.015, DOOR_H / 2), hazard))
    for i in range(6):
        x = x0 + DOOR_W * (i + 0.5) / 6
        parts.append(mk.assign(mk.cylinder(name + '_roller', 0.2, 0.12, (x, y, DOOR_H + 0.28), 'Y', 10), dark))
        parts.append(kit.block(name + '_hanger', (0.3, 0.1, 0.5), (x, y, DOOR_H + 0.1), dark))
        parts.append(mk.assign(mk.cylinder(name + '_guide', 0.11, 0.1, (x, y, 0.06), 'Z', 8), dark))
    px = cx - side * 6.0
    parts.append(hk.sign(name + '_plate', [(px - 2.2, inner - 0.17, 1.5), (px + 2.2, inner - 0.17, 1.5),
                                           (px + 2.2, inner - 0.17, 3.2), (px - 2.2, inner - 0.17, 3.2)], plate, 2.2))
    out = mk.join(name, parts)
    out['texel'] = 0.8
    return mk.set_origin(out, (cx, y, DOOR_H / 2))


def make(a, work_dir):
    floor_mat = hk.decal_material('floor', floor_image(os.path.join(work_dir, 'floor.png')), 0.86, 0.5)
    concrete = kit.concrete('wall_concrete', '#8a867b', seams=(3.2, 1.3), projection='side', wear=0.65)
    conc_x = kit.concrete('wall_concrete_x', '#8a867b', seams=(3.2, 1.3), projection='front', wear=0.65)
    clad_y = kit.weathered('cladding_back', '#59605a', 0.6, 0.4, 0.65, seams=(0.9, 30.0), seam_width=0.16, projection='front', stagger=False)
    clad_x = kit.weathered('cladding_side', '#59605a', 0.6, 0.4, 0.65, seams=(0.9, 30.0), seam_width=0.16, projection='side', stagger=False)
    deck = kit.weathered('roof_deck', '#3a3f3c', 0.7, 0.4, 0.7, seams=(0.6, 60.0), seam_width=0.2, projection='top', stagger=False)
    steel = kit.painted_steel('truss_steel', '#3c423f', 0.6, 0.6)
    door_steel = kit.weathered('door_steel', '#4d5650', 0.55, 0.45, 0.7, seams=(3.4, 3.2), seam_width=0.03, projection='front')
    rib = kit.painted_steel('door_rib', '#434b46', 0.55, 0.6)
    dark = kit.painted_steel('fittings', '#22252a', 0.5, 0.5)
    hazard = kit.striped('hazard', '#b8982c', '#1c1c1a', 0.8, 'Z', 0.55, 0.5)
    red = sf.coated('extinguisher_red', '#a32219', 0.4, 0.0, 0.4)
    conduit = kit.galvanised('conduit', '#7d8286')
    lens = sf.coated('dead_lens', '#15181a', 0.25, 0.0, 0.5)
    crib_blue = kit.painted_steel('crib_steel', '#3d4f5a', 0.6, 0.6)
    mesh = kit.weathered('crib_mesh', '#565c5c', 0.6, 0.6, 0.5, seams=(0.12, 0.12), seam_width=0.3, projection='front', stagger=False)
    wood = sf.coated('bench_wood', '#7b6444', 0.8, 0.0, 0.6, panels=(1.8, 0.2), projection='top')
    crate = kit.painted_steel('tool_chest', '#7a2a22', 0.5, 0.5)

    def board(key, lines, size=(512, 256), **options):
        return hk.decal_material('board_' + key, hk.board_image(os.path.join(work_dir, key + '.png'), lines, size, **options), 0.7)

    b_h2 = board('h2', [('H2', 0.62), ('HANGAR TWO  -  FLIGHT TEST', 0.12)], (512, 300), fg='#d9d2ba', bg='#2c3230', border='#d9d2ba')
    b_flame = board('flame', [('NO NAKED FLAME', 0.3), ('NO SMOKING WITHIN 30 m', 0.17), ('OF ANY AIRCRAFT', 0.17)], fg='#f1ede0', bg='#8f1f18', border='#f1ede0')
    b_ear = board('ear', [('EAR PROTECTION', 0.26), ('BEYOND THE RED LINE', 0.2), ('WHEN ENGINES TURN', 0.2)], fg='#f1ede0', bg='#1f4a78', border='#f1ede0')
    b_chock = board('chock', [('CHOCK AND GROUND', 0.24), ('EVERY AIRCRAFT', 0.24), ('BEFORE YOU LEAVE IT', 0.16)], fg='#1a1a18', bg='#c9a52f', stripe='#1a1a18')
    b_door = board('door', [('DOORS MOVE WITHOUT WARNING', 0.2), ('KEEP RAILS CLEAR', 0.3)], (640, 256), fg='#1a1a18', bg='#c9a52f', stripe='#1a1a18')
    b_fod = board('fod', [('LOOSE OBJECT WALK', 0.24), ('BEFORE EVERY ENGINE START', 0.17), ('ONE BOLT GROUNDS A FLEET', 0.15)], fg='#e9e5d8', bg='#2f5a3a', border='#e9e5d8')
    b_fire = board('fire', [('FIRE POINT', 0.42), ('DRY POWDER', 0.24)], (256, 192), fg='#f1ede0', bg='#8f1f18', border='#f1ede0')
    b_crib = board('crib', [('TOOL CRIB', 0.4), ('SIGN OUT  -  COUNT IN', 0.2), ('NO TAG, NO TOOL', 0.2)], fg='#e9e5d8', bg='#24323c', border='#e9e5d8')
    b_plate_l = board('plate_l', [('H2  -  DOOR A', 0.5), ('24 TONNES  STAND CLEAR', 0.2)], (640, 256), fg='#d9d2ba', bg='#39403b', border='#d9d2ba')
    b_plate_r = board('plate_r', [('H2  -  DOOR B', 0.5), ('24 TONNES  STAND CLEAR', 0.2)], (640, 256), fg='#d9d2ba', bg='#39403b', border='#d9d2ba')

    # --- floor, walls, roof deck (inside faces only) ----------------------------------------------
    floor = mk.mesh_object('floor', [(-HX, -HY, 0), (HX, -HY, 0), (HX, HY + 1.6, 0), (-HX, HY + 1.6, 0)], [(0, 1, 2, 3)])
    hk.set_duv(floor, lambda p: ((p.x + HX) / W, (p.y + HY) / D))
    mk.assign(floor, floor_mat)
    floor['texel'] = 1.25
    shell = []
    back = kit.polygon('back', [(-HX, -HY, 0), (HX, -HY, 0), (HX, -HY, H), (-HX, -HY, H)], clad_y, INSIDE, False)
    shell.append(back)
    for sx, name in ((-1, 'side_l'), (1, 'side_r')):
        shell.append(kit.polygon(name, [(sx * HX, -HY, 0), (sx * HX, HY, 0), (sx * HX, HY, H), (sx * HX, -HY, H)], clad_x, INSIDE, False))
        # the door wall's pier beside the opening, and its return
        shell.append(kit.polygon(name + '_pier', [(sx * HX, HY, 0), (sx * OPEN_W / 2, HY, 0), (sx * OPEN_W / 2, HY, H), (sx * HX, HY, H)], conc_x, INSIDE, False))
        shell.append(kit.polygon(name + '_jamb', [(sx * OPEN_W / 2, HY, 0), (sx * OPEN_W / 2, HY + 0.6, 0), (sx * OPEN_W / 2, HY + 0.6, OPEN_H),
                                                  (sx * OPEN_W / 2, HY, OPEN_H)], concrete, (0, HY, 6), False))
    shell.append(kit.polygon('header', [(-OPEN_W / 2, HY, OPEN_H), (OPEN_W / 2, HY, OPEN_H), (OPEN_W / 2, HY, H), (-OPEN_W / 2, HY, H)], conc_x, INSIDE, False))
    shell.append(kit.polygon('header_soffit', [(-OPEN_W / 2, HY, OPEN_H), (OPEN_W / 2, HY, OPEN_H), (OPEN_W / 2, HY + 0.6, OPEN_H),
                                               (-OPEN_W / 2, HY + 0.6, OPEN_H)], conc_x, (0, HY, 6), False))
    walls = mk.join('walls', shell)
    walls['texel'] = 0.62
    roof = kit.polygon('roof', [(-HX, -HY, H), (HX, -HY, H), (HX, HY, H), (-HX, HY, H)], deck, INSIDE, False)
    roof['texel'] = 0.3

    # --- concrete dado and pilasters -----------------------------------------------------------
    solid = []
    solid.append(kit.block('dado_back', (W, 0.3, 3.6), (0, -HY + 0.15, 1.8), conc_x))
    for sx in (-1, 1):
        solid.append(kit.block('dado_side', (0.3, D, 3.6), (sx * (HX - 0.15), 0, 1.8), concrete))
        for i in range(9):
            y = -HY + 0.4 + (D - 0.8) * i / 8
            solid.append(kit.block('pilaster', (0.7, 0.8, H), (sx * (HX - 0.35), y, H / 2), concrete, bevel=0.04))
    for i in range(1, 10):
        solid.append(kit.block('pilaster_back', (0.8, 0.7, H), (-HX + W * i / 10, -HY + 0.35, H / 2), conc_x, bevel=0.04))
    solid.append(kit.block('eaves_beam_l', (0.9, D, 0.7), (-HX + 0.45, 0, 12.0), concrete))
    solid.append(kit.block('eaves_beam_r', (0.9, D, 0.7), (HX - 0.45, 0, 12.0), concrete))
    solid.append(kit.block('lintel', (OPEN_W + 3.0, 0.5, 0.9), (0, HY - 0.25, OPEN_H + 0.6), conc_x))
    structure = mk.join('structure', solid)
    structure['texel'] = 0.6

    # --- roof trusses, purlins, dead lamp housings ----------------------------------------------
    roofwork = []
    for index, y in enumerate(TRUSS_YS):
        roofwork += truss('truss%d' % index, y, steel)
        for k, x in enumerate((-20.0, -10.0, 0.0, 10.0, 20.0)):
            if (index + k) % 2 == 0:
                roofwork += lamp_housing('lamp%d_%d' % (index, k), x, y, steel, lens)
    for x in (-25.0, -15.0, -5.0, 5.0, 15.0, 25.0):
        roofwork.append(kit.block('purlin', (0.18, D - 0.4, 0.24), (x, 0, 14.87), steel))
    for sx in (-1, 1):
        for y0, y1 in zip(TRUSS_YS, TRUSS_YS[1:]):
            roofwork.append(kit.rod('wind_brace', [(sx * 5.0, y0, 12.45), (sx * 15.0, y1, 12.45)], 0.05, steel, 3))
    roofwork.append(kit.block('cable_tray', (0.5, D - 1.0, 0.1), (-3.0, 0, 12.15), conduit))
    trusses = mk.join('trusses', roofwork)
    trusses['texel'] = 0.5

    # --- conduits, extinguishers, boards, tool crib --------------------------------------------
    fit = []
    for z, r in ((3.95, 0.045), (4.15, 0.03), (4.3, 0.03)):
        fit.append(kit.rod('conduit_back', [(-HX + 1.0, -HY + 0.36, z), (HX - 1.0, -HY + 0.36, z)], r, conduit, 5))
        for sx in (-1, 1):
            fit.append(kit.rod('conduit_side', [(sx * (HX - 0.36), -HY + 1.0, z), (sx * (HX - 0.36), HY - 1.0, z)], r, conduit, 5))
    for sx in (-1, 1):
        for y in (-19.5, -6.5, 6.5, 19.5):
            fit.append(kit.block('junction', (0.16, 0.45, 0.55), (sx * (HX - 0.38), y + 1.2, 3.6), conduit))
            fit.append(kit.rod('drop', [(sx * (HX - 0.36), y + 1.2, 3.95), (sx * (HX - 0.36), y + 1.2, 1.4)], 0.025, conduit, 4))
            fit.append(kit.block('switch', (0.12, 0.3, 0.4), (sx * (HX - 0.38), y + 1.2, 1.3), dark))
            fit.append(kit.rod('riser', [(sx * (HX - 0.75), y - 2.8, 0.0), (sx * (HX - 0.75), y - 2.8, 12.0)], 0.06, conduit, 5))
        for index, y in enumerate((-13.0, 0.0, 13.0)):
            fit += extinguisher('ext%d' % index, sx * (HX - 0.3), y - 1.6, -sx, red, dark, b_fire)
    x_wall = HX - 0.74

    def side_board(name, y, z, width, height, material, sx):
        x = sx * x_wall
        a, b = (y + width / 2, y - width / 2) if sx > 0 else (y - width / 2, y + width / 2)
        return hk.sign(name, [(x, a, z), (x, b, z), (x, b, z + height), (x, a, z + height)], material, 3.0)

    def back_board(name, x, z, width, height, material):
        y = -HY + 0.74
        return hk.sign(name, [(x + width / 2, y, z), (x - width / 2, y, z), (x - width / 2, y, z + height), (x + width / 2, y, z + height)], material, 3.0)

    fit.append(back_board('b_h2_back', 9.0, 5.2, 7.0, 4.1, b_h2))
    fit.append(back_board('b_fod', -9.0, 1.4, 3.2, 1.6, b_fod))
    fit.append(back_board('b_chock', 3.0, 1.4, 3.2, 1.6, b_chock))
    fit.append(side_board('b_h2_l', 3.2, 5.4, 6.0, 3.5, b_h2, -1))
    fit.append(side_board('b_h2_r', 3.2, 5.4, 6.0, 3.5, b_h2, 1))
    fit.append(side_board('b_flame_l', -9.8, 1.5, 3.0, 1.5, b_flame, -1))
    fit.append(side_board('b_ear_r', -9.8, 1.5, 3.0, 1.5, b_ear, 1))
    fit.append(side_board('b_ear_l', 16.2, 1.5, 3.0, 1.5, b_ear, -1))
    fit.append(side_board('b_door_l', 22.6, 1.5, 3.6, 1.45, b_door, -1))
    fit.append(side_board('b_door_r', 22.6, 1.5, 3.6, 1.45, b_door, 1))
    fit.append(side_board('b_chock_r', 9.6, 1.5, 3.0, 1.5, b_chock, 1))
    # the tool crib in the back right corner: a steel cage 7 x 3.4 m with a counter hatch, racks and a bench
    cx0, cx1, cy0, cy1, ch = 21.5, 28.9, -25.0, -21.4, 2.7
    for x in (cx0, 24.0, 26.4, cx1):
        fit.append(kit.block('crib_post', (0.1, 0.1, ch), (x, cy1, ch / 2), crib_blue))
    fit.append(kit.block('crib_post', (0.1, 0.1, ch), (cx0, cy0 + 0.6, ch / 2), crib_blue))
    fit.append(kit.block('crib_head', (cx1 - cx0, 0.1, 0.12), ((cx0 + cx1) / 2, cy1, ch), crib_blue))
    fit.append(kit.block('crib_head', (0.1, cy1 - cy0, 0.12), (cx0, (cy0 + cy1) / 2, ch), crib_blue))
    fit.append(kit.block('crib_kick', (cx1 - cx0, 0.06, 0.9), ((cx0 + cx1) / 2, cy1, 0.45), crib_blue))
    fit.append(kit.block('crib_kick', (0.06, cy1 - cy0, 0.9), (cx0, (cy0 + cy1) / 2, 0.45), crib_blue))
    fit.append(kit.block('crib_mesh_a', (2.4, 0.03, 1.7), (22.75, cy1, 1.8), mesh))
    fit.append(kit.block('crib_mesh_b', (2.4, 0.03, 1.7), (27.65, cy1, 1.8), mesh))
    fit.append(kit.block('crib_mesh_c', (2.3, 0.03, 0.7), (25.2, cy1, 2.3), mesh))
    fit.append(kit.block('crib_mesh_d', (0.03, cy1 - cy0, 1.7), (cx0, (cy0 + cy1) / 2, 1.8), mesh))
    fit.append(kit.block('crib_counter', (2.5, 0.6, 0.06), (25.2, cy1 + 0.1, 0.95), wood))
    for i in range(3):
        fit.append(kit.block('rack', (6.4, 0.5, 0.05), (25.3, cy0 + 0.35, 0.6 + 0.75 * i), crib_blue))
        for k in range(7):
            fit.append(kit.block('bin', (0.55, 0.4, 0.28 + 0.1 * ((i + k) % 3)), (22.6 + 0.9 * k, cy0 + 0.35, 0.78 + 0.75 * i + 0.05 * ((i + k) % 3)),
                                 crate if (i * 7 + k) % 4 == 0 else dark, bevel=0.01))
    fit.append(hk.sign('b_crib', [(24.4, cy1 + 0.04, 2.85), (22.0, cy1 + 0.04, 2.85), (22.0, cy1 + 0.04, 4.05), (24.4, cy1 + 0.04, 4.05)], b_crib, 3.0))
    # a bench, a rolling tool chest, wheel chocks and a drip tray near the stand
    fit.append(kit.block('bench_top', (3.6, 0.8, 0.08), (15.0, -HY + 0.9, 0.9), wood))
    for dx in (-1.6, 1.6):
        fit.append(kit.block('bench_leg', (0.08, 0.7, 0.86), (15.0 + dx, -HY + 0.9, 0.43), crib_blue))
    fit.append(kit.block('vice', (0.2, 0.3, 0.2), (16.2, -HY + 1.0, 1.04), dark, bevel=0.02))
    fit.append(kit.block('chest', (1.1, 0.55, 0.95), (-22.0, -HY + 1.0, 0.6), crate, bevel=0.02))
    for i in range(4):
        fit.append(kit.block('chest_drawer', (1.0, 0.02, 0.16), (-22.0, -HY + 1.285, 0.3 + 0.2 * i), dark))
    for x, y, r in ((-6.2, -8.0, 20), (6.4, -7.6, -15), (-0.5, 3.0, 5), (0.6, 2.4, 80)):
        fit.append(kit.block('chock', (0.5, 0.2, 0.16), (x, y, 0.08), hazard, (0, 0, r), 0.02))
    fit.append(kit.block('drip_tray', (1.2, 0.8, 0.05), (4.2, -6.0, 0.025), dark, (0, 0, 12)))
    for part in fit:
        if 'texel' not in part:
            part['texel'] = 1.6
    # join by texel share: the lettered boards keep their own
    lettered = [p for p in fit if p.get('texel') == 3.0]
    plain = [p for p in fit if p.get('texel') != 3.0]
    boards = mk.join('boards', lettered)
    boards['texel'] = 3.0
    fittings = mk.join('fittings', plain)
    fittings['texel'] = 1.6

    # --- the door head rail and floor rails (static, outside the wall) -----------------------------
    rails = []
    for y in DOOR_Y:
        rails.append(kit.block('head_rail', (OPEN_W + 2 * TRAVEL + 1.0, 0.36, 0.3), (0, y, DOOR_H + 0.62), dark))
        rails.append(kit.block('floor_rail', (OPEN_W + 2 * TRAVEL + 1.0, 0.08, 0.04), (0, y, 0.02), dark))
    for x in range(-52, 53, 8):
        if abs(x) >= 28:
            rails.append(kit.block('rail_post', (0.3, 0.3, DOOR_H + 0.5), (x, DOOR_Y[1] + 0.5, (DOOR_H + 0.5) / 2), steel))
        rails.append(kit.block('rail_arm', (0.2, 1.4, 0.24), (x, HY + 1.05, DOOR_H + 0.9), steel))
    railwork = mk.join('railwork', rails)
    railwork['texel'] = 0.35

    a.add(floor)
    a.add(walls)
    a.add(roof)
    a.add(structure)
    a.add(trusses)
    a.add(boards)
    a.add(fittings)
    a.add(railwork)
    a.add(door('door_l', -DOOR_W + 0.1, 0.1, DOOR_Y[0], 0.1, door_steel, rib, hazard, dark, b_plate_l))
    a.add(door('door_r', -0.1, DOOR_W - 0.1, DOOR_Y[1], -0.1, door_steel, rib, hazard, dark, b_plate_r))

    a.anchor('aircraft', (0.0, -4.0, 0.0))
    a.anchor('eye_start', (0.0, -23.0, 1.7))
    a.anchor('door_centre', (0.0, HY, 0.0))
    a.extra('door_travel', TRAVEL)
    a.extra('inside', {'width': W, 'depth': D, 'height': H, 'clear_under_trusses': 11.3})
    a.extra('door_opening', {'width': OPEN_W, 'height': OPEN_H})
    a.merge_static = ['floor', 'walls', 'roof', 'structure', 'trusses', 'boards', 'fittings', 'railwork']
