"""Handgun set: the three hand-held firearms of MARAZUL in one file, original designs.

- pistol (catalog `pistol`, the Cordero C9): a compact striker-fired nine-millimetre. Black
  polymer frame with a stippled grip, an accessory rail under the dust cover, a squared trigger
  guard and a beavertail; a dark nitrided steel slide with rear serrations, a raised barrel
  hood over the ejection port, low three-dot sights. 0.19 m long.
- heavy_revolver (catalog `heavy_revolver`, the Alcazar .44 Notario): a large-frame
  double-action revolver in brushed stainless steel: a slab-sided barrel with a full underlug and
  a ramp front sight, a fluted six-shot cylinder, a spur hammer and smooth dark hardwood grips.
  0.29 m long.
- smg (catalog `smg`, the Cordero Avispa): a compact machine pistol: a squared phosphate-grey
  steel receiver with a top rail and flip sights, a vented barrel shroud and threaded muzzle, a
  polymer pistol grip with the long 30-round magazine through it, and a fold-down fore grip.
  0.29 m long.

Each weapon is a node at the point where the hand closes on its grip (see _weaponkit.py):
barrel along +Y (Blender), up +Z. Magazines (the revolver's cylinder) are separate nodes;
anchors mark the muzzle, the ejection port and, on the SMG, the fore grip.

Budget: three weapons in one file, each with its own magazine node: about 7,000 triangles,
six draw calls with all three drawn at level 0 (each weapon alone is under 2,700 and two) and
about 430 kB, mostly geometry at two levels; room is left for the thrown weapons.
"""
import math

from lib import build, modify, scene

import _weaponkit as W
from _weaponkit import WeaponKit

ASSET = {
    'id': 'set_handguns',
    'kind': 'prop',
    'atlas': 1024,
    'budget': {'triangles': 8500, 'draws': 12, 'bytes': 520000},
}


def palette():
    return {
        'slide': W.gun_steel(seed=3, name='slide_steel'),
        'frame': W.polymer(seed=4, name='frame_polymer'),
        'stipple': W.polymer(stipple=1.0, seed=5, name='grip_polymer'),
        'stainless': W.gun_steel(color=(0.42, 0.42, 0.41), roughness=0.3, metallic=1.0,
                                 wear_amount=0.4, bare=(0.72, 0.72, 0.70), seed=6,
                                 name='stainless_steel'),
        'wood': W.gun_wood(seed=7, name='grip_wood'),
        'parker': W.gun_steel(color=(0.060, 0.062, 0.058), roughness=0.62, metallic=0.55,
                              wear_amount=0.6, seed=8, name='receiver_phosphate'),
        'mag': W.gun_steel(color=(0.028, 0.028, 0.030), roughness=0.5, wear_amount=0.7, seed=9,
                           name='magazine_steel'),
        'bore': W.bore_black(),
    }


def serrations(prefix, y0, count, pitch, z0, z1, half_width, mat):
    """Vertical grooves on both sides of a slide (dark strips just proud of the surface)."""
    parts = []
    for index in range(count):
        y = y0 + index * pitch
        for sign in (1.0, -1.0):
            parts.append(W.block(f'{prefix}{index}{"r" if sign > 0 else "l"}',
                                 (0.0008, pitch * 0.45, z1 - z0),
                                 (sign * (half_width + 0.0003), y, (z0 + z1) / 2.0), mat))
    return parts


def pistol(k, m):
    bore_z = 0.058
    frame = W.side('frame', [
        (-0.048, 0.036), (-0.036, 0.043), (0.134, 0.043), (0.137, 0.040), (0.137, 0.024),
        (0.132, 0.020), (0.068, 0.020), (0.064, 0.027), (0.030, 0.030), (0.026, 0.024),
        (0.022, 0.010), (0.017, -0.012), (0.012, -0.034), (0.007, -0.058), (0.004, -0.066),
        (-0.004, -0.071), (-0.036, -0.069), (-0.042, -0.064), (-0.034, -0.030), (-0.028, 0.000),
        (-0.026, 0.016), (-0.030, 0.026), (-0.042, 0.030)], 0.029, m['frame'], bevel=0.0035,
        segments=2)
    panel = W.side('grip_panel', [
        (0.018, 0.008), (0.013, -0.016), (0.008, -0.040), (0.004, -0.058), (-0.036, -0.058),
        (-0.038, -0.040), (-0.031, -0.010), (-0.024, 0.012), (-0.010, 0.016), (0.008, 0.016)],
        0.0302, m['stipple'], bevel=0.0012)
    slide = W.side('slide', [
        (-0.046, 0.045), (-0.045, 0.067), (-0.041, 0.071), (0.131, 0.071), (0.138, 0.066),
        (0.140, 0.050), (0.137, 0.044), (-0.044, 0.044)], 0.0245, m['slide'], bevel=0.003,
        segments=2)
    hood = W.block('hood', (0.0150, 0.034, 0.0016), (0.0, 0.060, 0.0716), m['slide'], 0.0005)
    port = W.block('port', (0.0016, 0.030, 0.010), (0.0121, 0.060, 0.064), m['bore'])
    crown = W.rod('crown', 0.0068, 0.137, 0.1415, (0.0, bore_z), m['slide'], segments=14)
    bore = W.rod('bore', 0.0046, 0.1413, 0.1418, (0.0, bore_z), m['bore'], segments=12)
    front_sight = W.block('front_sight', (0.0038, 0.006, 0.0055), (0.0, 0.128, 0.0735),
                          m['slide'], 0.0008)
    rear_sight = [W.block(f'rear_post{side}', (0.0068, 0.008, 0.0062),
                          (side * 0.0058, -0.034, 0.0738), m['slide'], 0.0008)
                  for side in (1.0, -1.0)]
    dots = [W.rod(f'dot{index}', 0.0011, 0.0, 0.0006, (x, z), m['stainless'], segments=8)
            for index, (x, z) in enumerate(((0.0, 0.0745), (0.0058, 0.0748), (-0.0058, 0.0748)))]
    modify.transform(dots[0], location=(0.0, 0.1247, 0.0))
    for dot in dots[1:]:
        modify.transform(dot, location=(0.0, -0.0381, 0.0))
    rail = [W.block(f'rail{index}', (0.0300, 0.0032, 0.0022), (0.0, 0.080 + index * 0.0095, 0.0215),
                    m['bore']) for index in range(5)]
    guard = W.bar('guard', [(0.066, 0.021), (0.065, 0.007), (0.060, -0.001), (0.046, -0.003),
                            (0.030, -0.002), (0.022, 0.006)], 0.0032, m['frame'], flat=1.7)
    trigger = W.bar('trigger', [(0.041, 0.030), (0.042, 0.021), (0.040, 0.013), (0.036, 0.008)],
                    0.0026, m['frame'], flat=1.3, segments=6)
    lever = W.block('takedown', (0.0012, 0.010, 0.0035), (-0.0151, 0.052, 0.036), m['slide'], 0.0004)
    release = W.block('release', (0.0016, 0.006, 0.006), (-0.0151, 0.024, 0.024), m['frame'], 0.0005)
    parts = ([frame, panel, slide, hood, port, crown, bore, front_sight, *rear_sight, *dots, *rail,
              guard, trigger, lever, release]
             + serrations('ser', -0.040, 7, 0.0036, 0.049, 0.067, 0.01225, m['bore']))
    gun = k.weapon('pistol', parts, 'two_hand_pistol', catalog_id='pistol', lod=0.42)

    body = W.side('mag_body', [(-0.006, 0.028), (0.005, 0.028), (-0.012, -0.066), (-0.026, -0.066)],
                  0.021, m['mag'], bevel=0.001)
    base = W.side('mag_base', [(-0.002, -0.071), (-0.039, -0.069), (-0.041, -0.077), (-0.003, -0.078)],
                  0.0305, m['frame'], bevel=0.0018)
    gun.magazine([body, base], pivot=(0.0, -0.001, 0.028))
    gun.anchor('muzzle', (0.0, 0.1418, bore_z))
    gun.anchor('eject', (0.0125, 0.060, 0.066), forward=(1.0, -0.15, 0.55))


def revolver(k, m):
    axis_z = 0.0485
    bore_z = 0.062
    steel = m['stainless']
    rear = W.side('rear_frame', [
        (-0.012, 0.030), (0.012, 0.024), (0.014, 0.079), (0.004, 0.080), (-0.010, 0.072),
        (-0.016, 0.058), (-0.018, 0.044)], 0.030, steel, bevel=0.003, segments=2)
    strap = W.side('top_strap', [(0.010, 0.070), (0.068, 0.070), (0.068, 0.080), (0.010, 0.080)],
                   0.024, steel, bevel=0.003, segments=2)
    groove = W.block('sight_groove', (0.004, 0.050, 0.0012), (0.0, 0.040, 0.0801), m['bore'])
    rear_sight = W.side('rear_sight', [(-0.002, 0.079), (0.014, 0.079), (0.014, 0.0855),
                                       (0.000, 0.0855)], 0.012, m['slide'], bevel=0.001)
    front_frame = W.side('front_frame', [(0.056, 0.026), (0.070, 0.026), (0.070, 0.079),
                                         (0.056, 0.079)], 0.030, steel, bevel=0.003, segments=2)
    bottom = W.side('bottom_frame', [(0.008, 0.022), (0.060, 0.022), (0.060, 0.030),
                                     (0.008, 0.030)], 0.026, steel, bevel=0.002)
    barrel = W.side('barrel', [
        (0.066, 0.079), (0.231, 0.077), (0.236, 0.073), (0.236, 0.046), (0.231, 0.041),
        (0.100, 0.040), (0.074, 0.032), (0.066, 0.032)], 0.0215, steel, bevel=0.005, segments=3)
    rib = W.block('rib', (0.0085, 0.150, 0.0022), (0.0, 0.150, 0.0788), steel, 0.0008)
    ramp = W.side('front_ramp', [(0.212, 0.079), (0.232, 0.079), (0.232, 0.0865),
                                 (0.226, 0.0865)], 0.004, steel, bevel=0.0006)
    insert = W.block('ramp_insert', (0.0042, 0.003, 0.003), (0.0, 0.229, 0.0845), m['bore'])
    bore = W.rod('bore', 0.0058, 0.2355, 0.2365, (0.0, bore_z), m['bore'], segments=14)
    hammer = W.side('hammer', [(-0.004, 0.064), (-0.002, 0.078), (-0.014, 0.088), (-0.027, 0.091),
                               (-0.030, 0.086), (-0.018, 0.080), (-0.012, 0.062)], 0.008,
                    m['slide'], bevel=0.0015)
    guard = W.bar('guard', [(0.040, 0.023), (0.041, 0.008), (0.034, -0.002), (0.020, -0.004),
                            (0.008, 0.000), (0.004, 0.012), (0.004, 0.024)], 0.0034, steel, flat=1.6)
    trigger = W.bar('trigger', [(0.020, 0.023), (0.022, 0.014), (0.019, 0.006), (0.014, 0.002)],
                    0.0028, steel, flat=1.6, segments=6)
    grip = W.side('grip', [
        (0.006, 0.026), (0.003, 0.010), (-0.002, -0.020), (-0.008, -0.050), (-0.012, -0.066),
        (-0.022, -0.074), (-0.044, -0.072), (-0.052, -0.064), (-0.050, -0.040), (-0.042, -0.010),
        (-0.032, 0.014), (-0.022, 0.034), (-0.014, 0.040), (-0.006, 0.030)], 0.037, m['wood'],
        bevel=0.008, segments=3)
    latch = W.block('latch', (0.0016, 0.010, 0.006), (-0.0155, 0.006, 0.050), steel, 0.0005)
    parts = [rear, strap, groove, rear_sight, front_frame, bottom, barrel, rib, ramp, insert, bore,
             hammer, guard, trigger, grip, latch]
    W.shift(parts, dy=0.016)
    gun = k.weapon('heavy_revolver', parts, 'two_hand_pistol', catalog_id='heavy_revolver',
                   lod=0.42)

    cylinder = W.lathe_y('cylinder', [(0.0, 0.0125), (0.0175, 0.0125), (0.0205, 0.0135),
                                      (0.0210, 0.016), (0.0210, 0.052), (0.0200, 0.0555),
                                      (0.0160, 0.0565), (0.0, 0.0565)], (0.0, axis_z), steel,
                         segments=36)

    def flute(point):
        if 0.022 < point.y < 0.050:
            angle = math.atan2(point.z - axis_z, point.x) + math.pi / 6
            fade = min(1.0, (point.y - 0.022) / 0.005, (0.050 - point.y) / 0.005)
            cut = max(0.0, math.cos(6.0 * angle)) ** 3 * 0.20 * fade
            point.x *= 1.0 - cut
            point.z = axis_z + (point.z - axis_z) * (1.0 - cut)
        return point

    modify.map_vertices(cylinder, flute)
    chambers = []
    for index in range(6):
        angle = math.pi / 2 + index * math.tau / 6
        x, z = 0.0135 * math.cos(angle), axis_z + 0.0135 * math.sin(angle)
        chambers.append(W.rod(f'chamber{index}', 0.0056, 0.0562, 0.0568, (x, z), m['bore'],
                              segments=10))
    pin = W.rod('ejector', 0.0042, 0.0562, 0.0570, (0.0, axis_z), steel, segments=10)
    mag = [cylinder, *chambers, pin]
    W.shift(mag, dy=0.016)
    gun.magazine(mag, pivot=(0.0, 0.016 + 0.0345, axis_z), smooth=50.0)
    gun.anchor('muzzle', (0.0, 0.016 + 0.2365, bore_z))
    gun.anchor('eject', (-0.012, 0.016 + 0.012, axis_z), forward=(-0.45, -1.0, 0.2))


def smg(k, m):
    bore_z = 0.062
    recv = m['parker']
    receiver = W.side('receiver', [
        (-0.078, 0.033), (-0.078, 0.076), (-0.074, 0.081), (0.100, 0.081), (0.104, 0.076),
        (0.104, 0.045), (0.098, 0.036), (0.080, 0.033)], 0.032, recv, bevel=0.0025, segments=2)
    shroud = W.side('shroud', [(0.100, 0.044), (0.100, 0.078), (0.148, 0.077), (0.166, 0.068),
                               (0.166, 0.052), (0.160, 0.046)], 0.027, recv, bevel=0.003,
                    segments=2)
    vents = []
    for index in range(3):
        for sign in (1.0, -1.0):
            vents.append(W.block(f'vent{index}{sign}', (0.0010, 0.011, 0.0055),
                                 (sign * 0.0136, 0.110 + index * 0.016, 0.063), m['bore']))
    # The folded wire stock along the left side: two rails, a hinge block and the butt plate.
    stock = [W.bar(f'stock_rail{index}', [(-0.080, z), (0.090, z)], 0.0026, m['mag'], segments=6)
             for index, z in enumerate((0.044, 0.068))]
    for rail_part in stock:
        modify.transform(rail_part, location=(-0.0195, 0.0, 0.0))
    stock.append(W.block('stock_butt', (0.008, 0.007, 0.036), (-0.0195, 0.093, 0.056), m['frame'],
                         0.0015))
    stock.append(W.block('stock_hinge', (0.006, 0.010, 0.030), (-0.0180, -0.080, 0.056), m['mag'],
                         0.001))
    muzzle = W.rod('muzzle', 0.0072, 0.165, 0.193, (0.0, bore_z), m['mag'], segments=14)
    threads = [W.rod(f'thread{index}', 0.0077, 0.170 + index * 0.0035, 0.1715 + index * 0.0035,
                     (0.0, bore_z), m['mag'], segments=14) for index in range(6)]
    bore = W.rod('bore', 0.0045, 0.1928, 0.1934, (0.0, bore_z), m['bore'], segments=12)
    rail = W.block('rail', (0.016, 0.150, 0.0040), (0.0, 0.005, 0.0830), recv, 0.0008)
    slots = [W.block(f'slot{index}', (0.0165, 0.0030, 0.0012), (0.0, -0.062 + index * 0.0105, 0.0846),
                     m['bore']) for index in range(13)]
    rear_sight = W.side('rear_sight', [(-0.070, 0.085), (-0.052, 0.085), (-0.054, 0.097),
                                       (-0.066, 0.097)], 0.016, m['mag'], bevel=0.0012)
    aperture = W.rod('aperture', 0.0026, -0.0605, -0.0595, (0.0, 0.0925), m['bore'], segments=8)
    ears = [W.side(f'ear{sign}', [(0.128, 0.076), (0.144, 0.076), (0.142, 0.090), (0.134, 0.090)],
                   0.0025, recv, x=sign * 0.0065, bevel=0.0006) for sign in (1.0, -1.0)]
    post = W.block('front_post', (0.0024, 0.004, 0.011), (0.0, 0.136, 0.0815), m['mag'], 0.0005)
    port = W.block('port', (0.0012, 0.034, 0.011), (0.0162, 0.030, 0.066), m['bore'])
    handle = W.rod('handle_stem', 0.0026, 0.0, 0.010, (0.0, 0.0), m['mag'], segments=8)
    modify.transform(handle, rotation=(0.0, 0.0, math.pi / 2))
    modify.transform(handle, location=(-0.021, 0.060, 0.072))
    knob = W.rod('handle_knob', 0.0050, 0.0, 0.007, (0.0, 0.0), m['frame'], segments=12)
    modify.transform(knob, rotation=(0.0, 0.0, math.pi / 2))
    modify.transform(knob, location=(-0.0285, 0.060, 0.072))
    cap = W.side('end_cap', [(-0.086, 0.030), (-0.077, 0.030), (-0.077, 0.083), (-0.086, 0.079)],
                 0.034, m['frame'], bevel=0.002)
    loop = W.bar('sling_loop', [(-0.086, 0.040), (-0.098, 0.044), (-0.100, 0.060), (-0.087, 0.066)],
                 0.0022, m['mag'], segments=6)
    grip = W.side('grip', [
        (0.018, 0.034), (0.014, 0.010), (0.009, -0.020), (0.004, -0.050), (0.002, -0.060),
        (-0.008, -0.064), (-0.040, -0.062), (-0.046, -0.056), (-0.040, -0.020), (-0.034, 0.010),
        (-0.030, 0.034)], 0.030, m['stipple'], bevel=0.004, segments=2)
    guard = W.bar('guard', [(0.058, 0.034), (0.057, 0.010), (0.051, 0.002), (0.036, 0.000),
                            (0.024, 0.004), (0.017, 0.016)], 0.0034, m['frame'], flat=1.7)
    trigger = W.bar('trigger', [(0.036, 0.033), (0.037, 0.024), (0.035, 0.016), (0.031, 0.011)],
                    0.0027, m['mag'], flat=1.3, segments=6)
    selector = W.block('selector', (0.0014, 0.012, 0.005), (-0.0165, 0.006, 0.050), m['mag'], 0.0005)
    fore = W.bar('fore_grip', [(0.124, 0.034), (0.126, 0.010), (0.129, -0.020), (0.131, -0.040)],
                 0.0115, m['stipple'], segments=12)
    fore_hinge = W.block('fore_hinge', (0.020, 0.028, 0.017), (0.0, 0.125, 0.0385), m['mag'],
                         0.0015)
    parts = [receiver, shroud, *vents, *stock, muzzle, *threads, bore, rail, *slots, rear_sight,
             aperture, *ears, post, port, handle, knob, cap, loop, grip, guard, trigger, selector,
             fore, fore_hinge]
    gun = k.weapon('smg', parts, 'two_hand_pistol', catalog_id='smg', lod=0.42)

    body = W.side('mag_body', [(0.004, 0.036), (-0.020, 0.036), (-0.054, -0.160), (-0.030, -0.160)],
                  0.019, m['mag'], bevel=0.0012)
    ribs = [W.side(f'mag_rib{index}', [(-0.004 - 0.0035 * index - 0.012 * index, 0.0 - 0.06 * index),
                                       (0.001 - 0.0035 * index - 0.012 * index, 0.0 - 0.06 * index),
                                       (-0.008 - 0.0035 * index - 0.012 * index, -0.050 - 0.06 * index),
                                       (-0.013 - 0.0035 * index - 0.012 * index, -0.050 - 0.06 * index)],
                   0.0196, m['mag']) for index in range(1)]
    base = W.side('mag_base', [(-0.026, -0.158), (-0.058, -0.158), (-0.060, -0.168),
                               (-0.026, -0.168)], 0.024, m['frame'], bevel=0.002)
    gun.magazine([body, *ribs, base], pivot=(0.0, -0.008, 0.036))
    gun.anchor('muzzle', (0.0, 0.1934, bore_z))
    gun.anchor('eject', (0.017, 0.030, 0.066), forward=(1.0, -0.2, 0.45))
    gun.anchor('grip_off', (0.0, 0.128, -0.004))


def make(a):
    m = palette()
    k = WeaponKit(a)
    pistol(k, m)
    revolver(k, m)
    smg(k, m)
    k.layout()
    a.bake(size=1024, orm_size=512, normal_size=1024, bevel_radius=0.0012,
           occlusion_distance=0.04, occlusion_ground=False)


def assemble(a):
    WeaponKit.of(a).levels()
