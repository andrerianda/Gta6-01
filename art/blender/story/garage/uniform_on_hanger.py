"""The borrowed uniform: an air force service jacket and trousers, pressed, dark blue-grey, on a
timber hanger, with a peaked cap hooked over the hanger's neck. Invented insignia: two gold bars
and a pip on each shoulder strap, a winged disc badge and a ribbon rack on the wearer's left, the
name tape OSORIO on the right. Origin at the top of the hanger's hook (hang it on anchor_hanger);
the jacket's front faces the asset's front (+Y here, the game's -Z). It hangs 1.3 m.
"""
import math

import _story_kit as kit
import paint
from lib import meshkit as mk
from lib import surfaces as sf

ASSET = {'id': 'uniform_on_hanger', 'atlas': 1024, 'kind': 'prop', 'views': ((16, 4, 1.0),), 'ground': False}


def front_y(x, z):
    """The jacket front's depth at a point of the chest (the loft below, roughly)."""
    return 0.066 * (1.0 - min(1.0, abs(x) / 0.25) ** 3.0) ** (1 / 3.0) + (0.006 if z > -0.4 else 0.0)


def flat(name, points, material, thick=0.004, base=0.0):
    """A cut piece of cloth lying on the jacket front: points are (x, z); it follows the chest."""
    count = len(points)
    verts = [(x, front_y(x, z) + base + thick, z) for x, z in points] + [(x, front_y(x, z) + base - 0.01, z) for x, z in points]
    faces = [tuple(range(count))] + [(i, (i + 1) % count, count + (i + 1) % count, count + i) for i in range(count)]
    obj = mk.mesh_object(name, verts, faces)
    mk.recalc_normals(obj)
    if obj.data.polygons[0].normal.y < 0:
        mk.flip(obj)
    return mk.assign(obj, material)


def make(a, work_dir):
    serge = sf.coated('serge', '#2b3443', 0.88, 0.0, 0.3, grain=0.3)
    serge_dark = sf.coated('serge_dark', '#222a37', 0.9, 0.0, 0.3, grain=0.3)
    shirt = sf.coated('shirt', '#a9b8c6', 0.8, 0.0, 0.2, grain=0.1)
    tie = sf.coated('tie', '#141821', 0.7, 0.0, 0.2, grain=0.1)
    gold = sf.bare_metal('gilt', '#c9a245', 0.35, 0.3)
    timber = kit.wood('hanger_wood', '#9a6a3c', 'X', 0.4, 0.3)
    steel = sf.bare_metal('hook_steel', '#b9bbbd', 0.25, 0.2)
    patent = sf.coated('visor_patent', '#0b0c0e', 0.12, 0.0, 0.1, grain=0.05)

    # the hanger
    hook = [(0.028 * math.sin(t) - 0.0, 0, -0.028 - 0.028 * math.cos(t)) for t in [math.radians(v) for v in range(-150, 91, 30)]]
    hook = [(x + 0.0, y, z) for x, y, z in hook] + [(0.0, 0, -0.07), (0.0, 0, -0.1)]
    parts = [kit.rod('hook', hook, 0.0028, steel, 6)]
    arms = [((-0.225, 0, -0.165), 0.02, 0.016), ((-0.15, 0, -0.128), 0.034, 0.02), ((-0.05, 0, -0.1), 0.042, 0.022), ((0.0, 0, -0.094), 0.046, 0.024),
            ((0.05, 0, -0.1), 0.042, 0.022), ((0.15, 0, -0.128), 0.034, 0.02), ((0.225, 0, -0.165), 0.02, 0.016)]
    parts.append(kit.path_loft('hanger', arms, timber, 8))
    parts.append(kit.rod('trouser_bar', [(-0.2, 0, -0.158), (-0.2, 0, -0.27), (0.2, 0, -0.27), (0.2, 0, -0.158)], 0.006, timber, 6))
    a.add_all(parts, 0.8)

    # the jacket: body, sleeves, collar and lapels, pockets, buttons
    body = kit.zloft('jacket', [(-0.84, 0, 0, 0.5, 0.11, 3.0), (-0.83, 0, 0, 0.52, 0.125, 3.0), (-0.6, 0, 0.002, 0.47, 0.125, 3.0), (-0.45, 0, 0.004, 0.485, 0.135, 2.8),
                                (-0.3, 0, 0.004, 0.5, 0.14, 2.6), (-0.2, 0, 0.002, 0.49, 0.125, 2.6), (-0.165, 0, 0, 0.455, 0.095, 2.4),
                                (-0.135, 0, 0, 0.33, 0.085, 2.2), (-0.11, 0, 0, 0.17, 0.09, 2.0), (-0.085, 0, -0.004, 0.13, 0.085, 2.0)], serge, 28)
    sleeves = []
    for sx in (-1, 1):
        sleeves.append(kit.path_loft('sleeve', [((sx * 0.215, 0, -0.165), 0.15, 0.1), ((sx * 0.262, 0.002, -0.24), 0.155, 0.105), ((sx * 0.283, 0.008, -0.45), 0.14, 0.09),
                                                ((sx * 0.292, 0.016, -0.62), 0.125, 0.075), ((sx * 0.298, 0.02, -0.79), 0.115, 0.06)], serge, 12))
        sleeves.append(kit.block('cuff_braid', (0.119, 0.064, 0.022), (sx * 0.2965, 0.019, -0.74), gold))
        sleeves.append(kit.block('strap', (0.115, 0.05, 0.006), (sx * 0.175, 0.0, -0.132), serge_dark, 0.002, (0, sx * 26, 0)))
        for k in range(2):
            sleeves.append(kit.block('rank_bar', (0.012, 0.04, 0.003), (sx * (0.165 + 0.024 * k), 0.0, -0.1235 - 0.0115 * k), gold, 0.001, (0, sx * 26, 0)))
        sleeves.append(kit.can('rank_pip', 0.008, 0, 0.004, gold, (0, 0), 10))
        mk.transform(sleeves[-1], (sx * 0.128, 0.0, -0.108), (0, sx * 26, 0))
    front = [flat('shirt', [(-0.05, -0.105), (0.05, -0.105), (0.0, -0.4)], shirt, 0.001),
             flat('tie', [(-0.022, -0.118), (0.022, -0.118), (0.03, -0.39), (0.0, -0.4), (-0.03, -0.39)], tie, 0.003),
             flat('tie_knot', [(-0.026, -0.108), (0.026, -0.108), (0.017, -0.15), (-0.017, -0.15)], tie, 0.008)]
    for sx in (-1, 1):
        front.append(flat('lapel', [(sx * 0.052, -0.1), (sx * 0.135, -0.2), (sx * 0.1, -0.245), (sx * 0.005, -0.41), (sx * 0.004, -0.38), (sx * 0.03, -0.16)], serge_dark, 0.007))
        front.append(flat('collar', [(sx * 0.045, -0.088), (sx * 0.12, -0.14), (sx * 0.14, -0.195), (sx * 0.09, -0.2), (sx * 0.04, -0.13)], serge, 0.012))
        front.append(flat('chest_flap', [(sx * 0.085, -0.3), (sx * 0.2, -0.3), (sx * 0.2, -0.335), (sx * 0.1425, -0.35), (sx * 0.085, -0.335)], serge_dark, 0.005))
        front.append(flat('chest_pocket', [(sx * 0.088, -0.3), (sx * 0.197, -0.3), (sx * 0.197, -0.42), (sx * 0.088, -0.42)], serge, 0.002))
        front.append(flat('hip_flap', [(sx * 0.07, -0.6), (sx * 0.215, -0.6), (sx * 0.215, -0.655), (sx * 0.07, -0.655)], serge_dark, 0.005))
        front.append(mk.transform(kit.can('pocket_button', 0.007, 0, 0.004, gold, (0, 0), 10), (sx * 0.1425, front_y(0.1425, -0.33) + 0.005, -0.332), (90, 0, 0)))
    front.append(flat('placket', [(0.0, -0.4), (0.012, -0.41), (0.012, -0.835), (-0.004, -0.835)], serge_dark, 0.003))
    front.append(flat('belt', [(-0.245, -0.52), (0.245, -0.52), (0.245, -0.56), (-0.245, -0.56)], serge_dark, 0.004))
    front.append(kit.block('buckle', (0.05, 0.006, 0.046), (0.004, front_y(0, -0.54) + 0.008, -0.54), gold, 0.002))
    for z in (-0.44, -0.6, -0.7, -0.79):
        front.append(mk.transform(kit.can('button', 0.0095, 0, 0.005, gold, (0, 0), 12), (0.004, front_y(0.0, z) + 0.004, z + (0.03 if z == -0.6 else 0)), (90, 0, 0)))
    a.add(body, 1.0)
    a.add_all(sleeves + front, 1.0)

    # insignia: name tape on the wearer's right (+X), badge and ribbons on the left
    def patch(name, image, x, z, w, h, texel):
        y = front_y(x, z) + 0.0065
        a.add(kit.printed_panel(name, image, (x + w / 2, y, z - h / 2), (-w, 0, 0), (0, 0, h), roughness=0.8, back='#2b3443'), texel)

    patch('name_tape', paint.name_tape(work_dir), 0.1425, -0.28, 0.105, 0.0228, 3.0)
    patch('wings', paint.wings_badge(work_dir), -0.1425, -0.238, 0.095, 0.031, 3.0)
    patch('ribbons', paint.ribbons(work_dir), -0.1425, -0.279, 0.09, 0.024, 3.0)

    # the trousers, folded over the bar, hanging inside the jacket and below it
    legs = kit.zloft('trousers', [(-1.3, 0.0, -0.004, 0.235, 0.03, 4.0), (-1.29, 0.0, -0.004, 0.24, 0.036, 4.0), (-0.9, 0.0, -0.004, 0.27, 0.04, 4.0),
                                  (-0.5, 0.0, -0.004, 0.3, 0.046, 4.0), (-0.3, 0.0, -0.004, 0.31, 0.04, 3.0)], serge, 20)
    a.add(legs, 0.9)
    a.add(kit.block('crease', (0.004, 0.003, 0.46), (0.0, 0.0155, -1.07), serge_dark, 0.001), 0.6)

    # the cap, hooked over the hanger's neck, tipped back
    cap = [kit.zloft('cap_band', [(0.0, 0, 0, 0.19, 0.2, 2.0), (0.045, 0, 0, 0.19, 0.2, 2.0)], serge_dark, 24),
           kit.zloft('cap_crown', [(0.045, 0, 0, 0.19, 0.2, 2.0), (0.075, 0, 0.006, 0.235, 0.25, 2.0), (0.098, 0, 0.012, 0.268, 0.28, 2.0),
                                   (0.108, 0, 0.012, 0.258, 0.27, 2.0), (0.112, 0, 0.012, 0.2, 0.21, 2.0)], serge, 24),
           kit.zloft('cap_piping', [(0.043, 0, 0, 0.194, 0.204, 2.0), (0.049, 0, 0, 0.194, 0.204, 2.0)], gold, 24)]
    visor_points = [(0.098 * math.cos(t), 0.1 * math.sin(t) + (0.062 * math.sin(t) ** 2), -0.03 * math.sin(t) ** 1.5) for t in [math.pi * k / 12 for k in range(13)]]
    verts = [(x, y, z + 0.004) for x, y, z in visor_points] + [(x * 0.96, min(y, 0.1 * 0.999) * 0.6, 0.004) for x, y, z in visor_points]
    faces = [(i, i + 1, 13 + i + 1, 13 + i) for i in range(12)]
    visor = mk.mesh_object('visor', verts, faces)
    mk.solidify(visor, 0.004)
    mk.recalc_normals(visor)
    cap.append(mk.shade(mk.assign(visor, patent), 60))
    cap.append(kit.printed_panel('cap_badge', paint.wings_badge(work_dir), (0.045, 0.102, 0.05), (-0.09, 0, 0), (0, 0.004, 0.03), roughness=0.5, back='#222a37'))
    cap.append(kit.rod('chin_strap', [(-0.09, 0.045, 0.006), (-0.05, 0.092, 0.008), (0.0, 0.103, 0.008), (0.05, 0.092, 0.008), (0.09, 0.045, 0.006)], 0.004, gold, 6))
    hat = mk.join('cap', cap)
    mk.transform(hat, (0.0, -0.012, -0.075), (-24, 0, 6))
    a.add(hat, 1.3)
    a.occlusion_distance = 0.12
    a.anchor('collar', (0, 0, -0.1))
