"""Long-gun set: the shouldered weapons of MARAZUL and the two melee pieces, in one file.

Original designs, real proportions:
- pump_shotgun (catalog `pump_shotgun`, the Ballesta 12): a slide-action twelve-gauge with an
  oiled walnut stock and grooved fore-end, a dark steel receiver, a 0.48 m barrel with a
  ventilated rib and bead sight over a full-length tube magazine. The fore-end is the moving
  node pump_shotgun_pump (no box magazine: shells load through the port). 1.06 m.
- assault_rifle (catalog `assault_rifle`, the Cordero CR-7 Tormenta): a gas rifle with a
  full-length top rail, a slotted octagonal handguard, a slotted muzzle brake, flip sights, a
  curved 30-round magazine and sand-coloured polymer furniture. 0.86 m.
- sniper_rifle (catalog `sniper_rifle`, the Halcon LR-70): a bolt action in an olive polymer
  sporter stock with a raised comb, a tapering heavy barrel and muzzle brake, a long scope
  with turrets on two rings, and a small detachable box magazine. 1.17 m.
- rocket_launcher (catalog `rocket_launcher`, the Trabuco RL-4 Pelicano): an olive launch tube
  with a flared rear venturi, a pistol grip, a fore grip, a shoulder pad and a box sight; the
  loaded rocket's warhead, protruding from the front, is the magazine node. 1.2 m.
- baseball_bat (catalog `baseball_bat`, the Fundidores Slugger): a turned ash bat with a taped
  handle and a painted club band. 0.86 m.
- tire_iron (catalog `tire_iron`): a forged L-shaped lug wrench, a hex socket on the bent end and
  a flattened pry tip on the other. 0.45 m.

Each weapon is a node at the point where the (right) hand closes (see _weaponkit.py): barrel
along +Y (Blender), up +Z. Anchors: muzzle, eject, grip_off (where the other hand holds), tip for
the melee pieces, exhaust for the launcher's back-blast.

Budget: six weapons in one file, four with a moving node: about 11,000 triangles and ten draw
calls with all six drawn at level 0 (each weapon alone is under 2,900 and two), about 580 kB,
mostly geometry at two levels.
"""
import math

from lib import build, modify, profiles

import _weaponkit as W
from _weaponkit import WeaponKit

ASSET = {
    'id': 'set_long_guns',
    'kind': 'prop',
    'atlas': 1024,
    'budget': {'triangles': 12000, 'draws': 12, 'bytes': 620000},
}


def palette():
    return {
        'steel': W.gun_steel(seed=21, name='receiver_steel'),
        'blued': W.gun_steel(color=(0.022, 0.024, 0.030), roughness=0.3, wear_amount=0.45,
                             seed=22, name='barrel_blued'),
        'walnut': W.gun_wood(color=(0.16, 0.065, 0.026), seed=23, name='stock_walnut'),
        'sand': W.polymer(color=(0.24, 0.18, 0.11), seed=24, name='furniture_sand'),
        'sand_grip': W.polymer(color=(0.22, 0.165, 0.10), stipple=1.0, seed=25, name='grip_sand'),
        'black': W.polymer(seed=26, name='black_polymer'),
        'grip': W.polymer(stipple=1.0, seed=27, name='black_grip'),
        'olive': W.polymer(color=(0.060, 0.070, 0.040), seed=28, name='stock_olive'),
        'drab': W.gun_steel(color=(0.075, 0.082, 0.050), roughness=0.6, metallic=0.2,
                            wear_amount=0.7, bare=(0.30, 0.30, 0.29), seed=29, name='tube_drab'),
        'warhead': W.gun_steel(color=(0.10, 0.11, 0.065), roughness=0.5, metallic=0.3,
                               wear_amount=0.3, seed=30, name='warhead_paint'),
        'rubber': W.polymer(color=(0.018, 0.018, 0.019), stipple=0.4, seed=31, name='pad_rubber'),
        'lens': W.polymer(color=(0.010, 0.016, 0.030), seed=32, name='scope_lens'),
        'ash': W.gun_wood(color=(0.46, 0.32, 0.17), seed=33, name='bat_ash'),
        'tape': W.polymer(color=(0.020, 0.020, 0.022), stipple=0.7, seed=34, name='grip_tape'),
        'club': W.polymer(color=(0.020, 0.16, 0.17), seed=35, name='club_band'),
        'forged': W.gun_steel(color=(0.045, 0.045, 0.047), roughness=0.55, wear_amount=0.9,
                              seed=36, name='forged_steel'),
        'bore': W.bore_black(),
    }


def pump_shotgun(k, m):
    bore_z, tube_z = 0.068, 0.043
    receiver = W.side('receiver', [
        (0.000, 0.032), (0.000, 0.074), (0.012, 0.082), (0.200, 0.082), (0.212, 0.078),
        (0.212, 0.032)], 0.031, m['steel'], bevel=0.003, segments=2)
    port = W.block('port', (0.0012, 0.070, 0.018), (0.0158, 0.098, 0.060), m['bore'])
    stock = W.side('stock', [
        (0.004, 0.080), (-0.060, 0.074), (-0.150, 0.068), (-0.340, 0.066), (-0.352, 0.062),
        (-0.352, -0.072), (-0.340, -0.078), (-0.200, -0.040), (-0.080, -0.008), (-0.040, -0.002),
        (-0.010, 0.020), (0.004, 0.030)], 0.040, m['walnut'], bevel=0.010, segments=2)
    pad = W.side('butt_pad', [(-0.366, 0.064), (-0.351, 0.064), (-0.351, -0.076), (-0.366, -0.078)],
                 0.042, m['rubber'], bevel=0.004, segments=2)
    guard = W.bar('guard', [(0.080, 0.033), (0.078, 0.012), (0.068, 0.002), (0.045, 0.000),
                            (0.028, 0.006), (0.020, 0.020), (0.020, 0.033)], 0.0036, m['steel'],
                  flat=1.6)
    trigger = W.bar('trigger', [(0.046, 0.032), (0.047, 0.022), (0.044, 0.013), (0.039, 0.008)],
                    0.003, m['steel'], flat=1.3, segments=6)
    barrel = W.rod('barrel', 0.0110, 0.205, 0.690, (0.0, bore_z), m['blued'], segments=16)
    rib = W.block('rib', (0.0075, 0.470, 0.0030), (0.0, 0.448, bore_z + 0.0125), m['blued'], 0.0008)
    posts = [W.block(f'rib_post{index}', (0.004, 0.006, 0.003), (0.0, 0.240 + index * 0.045,
                                                                 bore_z + 0.0095), m['blued'])
             for index in range(10)]
    bead = W.rod('bead', 0.0022, 0.676, 0.681, (0.0, bore_z + 0.016), m['steel'], segments=8)
    muzzle = W.rod('bore', 0.0092, 0.6895, 0.6905, (0.0, bore_z), m['bore'], segments=14)
    tube = W.rod('tube', 0.0115, 0.205, 0.640, (0.0, tube_z), m['blued'], segments=14)
    cap = W.lathe_y('tube_cap', [(0.0, 0.640), (0.0125, 0.640), (0.0125, 0.652), (0.010, 0.658),
                                 (0.0, 0.660)], (0.0, tube_z), m['steel'], segments=14)
    clamp = W.side('clamp', [(0.618, 0.030), (0.632, 0.030), (0.632, 0.080), (0.618, 0.080)],
                   0.026, m['steel'], bevel=0.003)
    parts = [receiver, port, stock, pad, guard, trigger, barrel, rib, *posts, bead, muzzle, tube,
             cap, clamp]
    W.shift(parts, dy=0.045, dz=-0.034)
    gun = k.weapon('pump_shotgun', parts, 'two_hand_long', catalog_id='pump_shotgun', lod=0.4,
                   distance=10.0)

    fore = W.side('fore_end', [(0.300, 0.030), (0.300, 0.058), (0.312, 0.064), (0.470, 0.064),
                               (0.482, 0.058), (0.482, 0.028), (0.470, 0.022), (0.312, 0.022)],
                  0.046, m['walnut'], bevel=0.009, segments=3)
    grooves = []
    for index in range(7):
        for sign in (1.0, -1.0):
            grooves.append(W.block(f'groove{index}{sign}', (0.0012, 0.0045, 0.022),
                                   (sign * 0.0222, 0.330 + index * 0.019, 0.043), m['bore']))
    pump = [fore, *grooves]
    W.shift(pump, dy=0.045, dz=-0.034)
    gun.part('pump', pump, pivot=(0.0, 0.045 + 0.391, tube_z - 0.034))
    gun.anchor('muzzle', (0.0, 0.045 + 0.6905, bore_z - 0.034))
    gun.anchor('eject', (0.017, 0.045 + 0.098, 0.060 - 0.034), forward=(1.0, -0.1, 0.5))
    gun.anchor('grip_off', (0.0, 0.045 + 0.391, tube_z - 0.034))


def assault_rifle(k, m):
    bore_z = 0.080
    grip = W.side('grip', [
        (0.024, 0.032), (0.018, 0.010), (0.012, -0.030), (0.006, -0.070), (0.000, -0.080),
        (-0.032, -0.078), (-0.040, -0.070), (-0.030, -0.030), (-0.022, 0.010), (-0.020, 0.032)],
        0.028, m['sand_grip'], bevel=0.004, segments=2)
    lower = W.side('lower', [
        (-0.042, 0.034), (-0.042, 0.066), (0.150, 0.066), (0.150, 0.040), (0.128, 0.028),
        (0.124, 0.012), (0.062, 0.012), (0.058, 0.030), (0.020, 0.034)], 0.024, m['steel'],
        bevel=0.002, segments=2)
    upper = W.side('upper', [(-0.046, 0.066), (-0.046, 0.097), (0.152, 0.097), (0.152, 0.066)],
                   0.026, m['steel'], bevel=0.003, segments=2)
    rail = W.block('rail', (0.021, 0.440, 0.0075), (0.0, 0.174, 0.1005), m['steel'], 0.001)
    slots = [W.block(f'slot{index}', (0.0215, 0.0045, 0.0018), (0.0, -0.035 + index * 0.021, 0.1036),
                     m['bore']) for index in range(21)]
    port = W.block('port', (0.0012, 0.048, 0.013), (0.0132, 0.045, 0.081), m['bore'])
    charging = W.block('charging', (0.030, 0.012, 0.006), (0.0, -0.050, 0.092), m['black'], 0.001)
    handguard = W.side('handguard', [(0.150, 0.046), (0.150, 0.097), (0.400, 0.097),
                                     (0.400, 0.046)], 0.044, m['sand'], bevel=0.011, segments=2)
    vents = []
    for row, z in enumerate((0.060, 0.080)):
        for index in range(4):
            for sign in (1.0, -1.0):
                vents.append(W.block(f'vent{row}{index}{sign}', (0.0012, 0.034, 0.0065),
                                     (sign * 0.0222, 0.190 + index * 0.054, z), m['bore']))
    barrel = W.rod('barrel', 0.0085, 0.398, 0.505, (0.0, bore_z), m['blued'], segments=14)
    brake = W.rod('brake', 0.0112, 0.500, 0.556, (0.0, bore_z), m['blued'], segments=16)
    brake_ports = []
    for index in range(3):
        for sign in (1.0, -1.0):
            brake_ports.append(W.block(f'brake_port{index}{sign}', (0.0016, 0.0075, 0.007),
                                       (sign * 0.0104, 0.512 + index * 0.014, bore_z), m['bore']))
    bore = W.rod('bore', 0.0055, 0.5555, 0.5565, (0.0, bore_z), m['bore'], segments=12)
    rear_sight = W.side('rear_sight', [(-0.034, 0.104), (-0.010, 0.104), (-0.012, 0.121),
                                       (-0.030, 0.121)], 0.018, m['black'], bevel=0.0015)
    front_sight = W.side('front_sight', [(0.364, 0.104), (0.392, 0.104), (0.388, 0.123),
                                         (0.374, 0.123)], 0.016, m['black'], bevel=0.0015)
    tube = W.rod('buffer_tube', 0.0150, -0.240, -0.040, (0.0, 0.082), m['black'], segments=14)
    stock = W.side('stock', [(-0.150, 0.098), (-0.300, 0.104), (-0.306, 0.094), (-0.306, -0.040),
                             (-0.290, -0.046), (-0.230, 0.018), (-0.150, 0.060)], 0.038, m['sand'],
                   bevel=0.007, segments=2)
    pad = W.side('butt_pad', [(-0.318, 0.104), (-0.305, 0.104), (-0.305, -0.044), (-0.318, -0.046)],
                 0.040, m['rubber'], bevel=0.003)
    guard = W.bar('guard', [(0.060, 0.013), (0.058, 0.002), (0.040, -0.002), (0.024, 0.004),
                            (0.020, 0.020), (0.022, 0.033)], 0.0034, m['steel'], flat=1.6)
    trigger = W.bar('trigger', [(0.040, 0.033), (0.041, 0.024), (0.039, 0.016), (0.035, 0.011)],
                    0.0026, m['steel'], flat=1.3, segments=6)
    parts = [grip, lower, upper, rail, *slots, port, charging, handguard, *vents, barrel, brake,
             *brake_ports, bore, rear_sight, front_sight, tube, stock, pad, guard, trigger]
    gun = k.weapon('assault_rifle', parts, 'two_hand_long', catalog_id='assault_rifle', lod=0.4,
                   distance=10.0)

    mag = W.side('mag_body', [(0.124, 0.034), (0.068, 0.034), (0.066, -0.040), (0.074, -0.110),
                              (0.092, -0.168), (0.150, -0.150), (0.136, -0.090), (0.128, -0.030)],
                 0.023, m['black'], bevel=0.0025, segments=2)
    base = W.side('mag_base', [(0.088, -0.166), (0.154, -0.146), (0.157, -0.154), (0.091, -0.176)],
                  0.026, m['black'], bevel=0.002)
    gun.magazine([mag, base], pivot=(0.0, 0.096, 0.034))
    gun.anchor('muzzle', (0.0, 0.5565, bore_z))
    gun.anchor('eject', (0.014, 0.045, 0.081), forward=(1.0, -0.3, 0.3))
    gun.anchor('grip_off', (0.0, 0.280, 0.071))


def sniper_rifle(k, m):
    bore_z, scope_z = 0.075, 0.127
    stock = W.side('stock', [
        (0.430, 0.060), (0.434, 0.032), (0.420, 0.020), (0.200, 0.012), (0.140, 0.008),
        (0.080, 0.008), (0.012, 0.006), (0.004, -0.020), (-0.006, -0.048), (-0.014, -0.058),
        (-0.042, -0.060), (-0.052, -0.050), (-0.070, -0.035), (-0.400, -0.088), (-0.412, -0.086),
        (-0.412, 0.062), (-0.395, 0.070), (-0.330, 0.090), (-0.180, 0.090), (-0.100, 0.072),
        (-0.060, 0.064), (-0.020, 0.060), (0.200, 0.058)], 0.046, m['olive'], bevel=0.011,
        segments=2)
    pad = W.side('butt_pad', [(-0.426, 0.064), (-0.411, 0.064), (-0.411, -0.088), (-0.426, -0.090)],
                 0.046, m['rubber'], bevel=0.004, segments=2)
    action = W.rod('action', 0.0165, -0.020, 0.205, (0.0, bore_z), m['steel'], segments=18)
    shroud = W.rod('bolt_shroud', 0.0120, -0.040, -0.019, (0.0, bore_z), m['steel'], segments=14)
    port = W.block('port', (0.0012, 0.050, 0.012), (0.0160, 0.080, bore_z + 0.004), m['bore'])
    barrel = W.lathe_y('barrel', [(0.0, 0.200), (0.0140, 0.200), (0.0140, 0.240), (0.0095, 0.700),
                                  (0.0, 0.700)], (0.0, bore_z), m['blued'], segments=18)
    brake = W.lathe_y('brake', [(0.0, 0.698), (0.0125, 0.698), (0.0125, 0.760), (0.0, 0.760)],
                      (0.0, bore_z), m['blued'], segments=18)
    brake_ports = []
    for index in range(3):
        for sign in (1.0, -1.0):
            brake_ports.append(W.block(f'brake_port{index}{sign}', (0.0016, 0.010, 0.008),
                                       (sign * 0.0118, 0.712 + index * 0.016, bore_z), m['bore']))
    bore = W.rod('bore', 0.0045, 0.7598, 0.7605, (0.0, bore_z), m['bore'], segments=12)
    handle = build.tube('bolt_handle', [(0.012, 0.010, bore_z + 0.004), (0.030, 0.010, bore_z),
                                        (0.042, 0.006, bore_z - 0.014)], radius=0.0035, segments=8,
                        up=(0.0, 1.0, 0.0))
    handle.data.materials.append(m['steel'])
    knob = build.sphere('bolt_knob', radius=0.0085, segments=12, rings=6,
                        location=(0.045, 0.005, bore_z - 0.019))
    knob.data.materials.append(m['steel'])
    scope = W.lathe_y('scope', [(0.0, -0.068), (0.0205, -0.068), (0.0215, -0.060), (0.0215, -0.012),
                                (0.0160, 0.010), (0.0150, 0.022), (0.0150, 0.200), (0.0170, 0.214),
                                (0.0250, 0.250), (0.0255, 0.292), (0.0, 0.292)], (0.0, scope_z),
                      m['black'], segments=24)
    lenses = [W.rod('lens_rear', 0.0175, -0.0685, -0.0675, (0.0, scope_z), m['lens'], segments=16),
              W.rod('lens_front', 0.0225, 0.2915, 0.2925, (0.0, scope_z), m['lens'], segments=18)]
    turret_up = build.cylinder('turret_up', radius=0.0115, depth=0.022, segments=14,
                               location=(0.0, 0.100, scope_z + 0.022))
    turret_up.data.materials.append(m['black'])
    turret_side = build.cylinder('turret_side', radius=0.0105, depth=0.020, segments=14)
    modify.transform(turret_side, rotation=(0.0, math.pi / 2, 0.0))
    modify.transform(turret_side, location=(0.022, 0.100, scope_z))
    turret_side.data.materials.append(m['black'])
    saddle = W.block('saddle', (0.026, 0.040, 0.020), (0.0, 0.100, scope_z), m['black'], 0.004)
    rings = []
    for index, y in enumerate((0.030, 0.170)):
        rings.append(W.lathe_y(f'ring{index}', [(0.0172, y - 0.009), (0.0185, y - 0.008),
                                                (0.0185, y + 0.008), (0.0172, y + 0.009)],
                               (0.0, scope_z), m['steel'], segments=20))
        rings.append(W.block(f'ring_base{index}', (0.016, 0.016, 0.034), (0.0, y, bore_z + 0.025),
                             m['steel'], 0.002))
    guard = W.bar('guard', [(0.075, 0.009), (0.072, -0.008), (0.055, -0.015), (0.030, -0.014),
                            (0.016, -0.004), (0.012, 0.006)], 0.0034, m['steel'], flat=1.6)
    trigger = W.bar('trigger', [(0.046, 0.008), (0.047, -0.001), (0.045, -0.007), (0.041, -0.010)],
                    0.0026, m['steel'], flat=1.3, segments=6)
    parts = [stock, pad, action, shroud, port, barrel, brake, *brake_ports, bore, handle, knob,
             scope, *lenses, turret_up, turret_side, saddle, *rings, guard, trigger]
    W.shift(parts, dy=0.028, dz=0.015)
    gun = k.weapon('sniper_rifle', parts, 'two_hand_long', catalog_id='sniper_rifle', lod=0.4,
                   distance=10.0)

    mag = [W.side('mag_body', [(0.062, -0.004), (0.118, -0.004), (0.118, 0.040), (0.062, 0.040)],
                  0.028, m['steel'], bevel=0.002)]
    W.shift(mag, dy=0.028, dz=0.015)
    gun.magazine(mag, pivot=(0.0, 0.028 + 0.090, 0.015 + 0.040))
    gun.anchor('muzzle', (0.0, 0.028 + 0.7605, bore_z + 0.015))
    gun.anchor('eject', (0.018, 0.028 + 0.080, bore_z + 0.015), forward=(1.0, 0.0, 0.4))
    gun.anchor('grip_off', (0.0, 0.028 + 0.270, 0.015 + 0.036))


def rocket_launcher(k, m):
    axis_z = 0.112
    tube = W.lathe_y('tube', [(0.062, -0.450), (0.058, -0.420), (0.048, -0.380), (0.046, -0.340),
                              (0.046, -0.100), (0.046, 0.200), (0.046, 0.500), (0.050, 0.508),
                              (0.050, 0.548)], (0.0, axis_z), m['drab'], segments=28)
    inner = W.rod('venturi_dark', 0.056, -0.446, -0.444, (0.0, axis_z), m['bore'], segments=28)
    mouth = W.rod('mouth_dark', 0.047, 0.5475, 0.5485, (0.0, axis_z), m['bore'], segments=28)
    bands = [W.rod(f'band{index}', 0.0495, y, y + 0.018, (0.0, axis_z), m['drab'], segments=28)
             for index, y in enumerate((-0.300, 0.060, 0.400))]
    pad = W.side('shoulder_pad', [(-0.260, 0.050), (-0.110, 0.050), (-0.100, 0.072),
                                  (-0.270, 0.072)], 0.050, m['rubber'], bevel=0.006, segments=2)
    grip = W.side('grip', [
        (0.024, 0.068), (0.018, 0.010), (0.012, -0.030), (0.006, -0.062), (0.000, -0.070),
        (-0.032, -0.068), (-0.040, -0.060), (-0.030, -0.030), (-0.022, 0.010), (-0.022, 0.068)],
        0.030, m['grip'], bevel=0.004, segments=2)
    housing = W.side('trigger_housing', [(-0.040, 0.066), (0.080, 0.066), (0.080, 0.050),
                                         (0.020, 0.040), (-0.030, 0.046)], 0.030, m['black'],
                     bevel=0.003)
    guard = W.bar('guard', [(0.070, 0.042), (0.068, 0.012), (0.056, 0.002), (0.040, 0.000),
                            (0.026, 0.006), (0.020, 0.022)], 0.0036, m['black'], flat=1.6)
    trigger = W.bar('trigger', [(0.044, 0.042), (0.045, 0.030), (0.043, 0.021), (0.039, 0.016)],
                    0.003, m['steel'], flat=1.3, segments=6)
    fore = W.bar('fore_grip', [(0.220, 0.070), (0.222, 0.030), (0.226, -0.010), (0.229, -0.028)],
                 0.0140, m['grip'], segments=12)
    fore_mount = W.block('fore_mount', (0.030, 0.034, 0.012), (0.0, 0.221, 0.070), m['black'], 0.002)
    sight_arm = W.block('sight_arm', (0.032, 0.020, 0.010), (-0.050, 0.140, axis_z + 0.020),
                        m['black'], 0.002)
    sight = W.side('sight_box', [(0.100, 0.122), (0.188, 0.122), (0.188, 0.162), (0.112, 0.168),
                                 (0.100, 0.160)], 0.030, m['black'], x=-0.074, bevel=0.004,
                   segments=2)
    sight_lens = W.rod('sight_lens', 0.010, 0.0875, 0.0885, (-0.074, 0.142), m['lens'], segments=12)
    modify.transform(sight_lens, location=(0.0, 0.012, 0.0))
    sight_lens_front = W.rod('sight_lens_front', 0.012, 0.1885, 0.1895, (-0.074, 0.142), m['lens'],
                             segments=12)
    parts = [tube, inner, mouth, *bands, pad, grip, housing, guard, trigger, fore, fore_mount,
             sight_arm, sight, sight_lens, sight_lens_front]
    gun = k.weapon('rocket_launcher', parts, 'two_hand_long', catalog_id='rocket_launcher',
                   lod=0.4, distance=12.0)
    warhead = W.lathe_y('warhead', [(0.0, 0.520), (0.040, 0.520), (0.044, 0.546), (0.052, 0.580),
                                    (0.052, 0.640), (0.042, 0.682), (0.024, 0.722), (0.009, 0.744),
                                    (0.0, 0.748)], (0.0, axis_z), m['warhead'], segments=28)
    band = W.rod('warhead_band', 0.0525, 0.596, 0.612, (0.0, axis_z), m['sand'], segments=28)
    gun.magazine([warhead, band], pivot=(0.0, 0.520, axis_z))
    gun.anchor('muzzle', (0.0, 0.548, axis_z))
    gun.anchor('exhaust', (0.0, -0.450, axis_z), forward=(0.0, -1.0, 0.0))
    gun.anchor('grip_off', (0.0, 0.226, 0.010))


def baseball_bat(k, m):
    profile = [(0.0, -0.076), (0.020, -0.075), (0.0225, -0.069), (0.018, -0.061), (0.0138, -0.050),
               (0.0138, 0.020), (0.0142, 0.120), (0.0165, 0.250), (0.0215, 0.360), (0.0275, 0.460),
               (0.0320, 0.560), (0.0338, 0.660), (0.0340, 0.760), (0.0310, 0.778), (0.0200, 0.786),
               (0.0, 0.788)]
    body = W.lathe_y('bat', profile, (0.0, 0.0), m['ash'], segments=24)
    tape = W.lathe_y('tape', [(0.0147, -0.052), (0.0151, -0.046), (0.0151, 0.150), (0.0158, 0.156),
                              (0.0168, 0.160)], (0.0, 0.0), m['tape'], segments=24)
    band = W.lathe_y('band', [(0.0182, 0.284), (0.0184, 0.290), (0.0228, 0.372), (0.0226, 0.378)],
                     (0.0, 0.0), m['club'], segments=24)
    bat = k.weapon('baseball_bat', [body, tape, band], 'two_hand_long', catalog_id='baseball_bat',
                   lod=0.4, distance=10.0, smooth=50.0)
    bat.anchor('tip', (0.0, 0.788, 0.0))
    bat.anchor('grip_off', (0.0, -0.040, 0.0))


def tire_iron(k, m):
    path = [(0.0, -0.110, 0.0), (0.0, 0.200, 0.0), (0.0, 0.290, 0.0), (0.0, 0.318, -0.010),
            (0.0, 0.330, -0.035), (0.0, 0.332, -0.080)]
    bar = build.tube('shaft', profiles.smooth_path(path, subdivisions=3), radius=0.0095,
                     segments=10, up=(1.0, 0.0, 0.0))
    bar.data.materials.append(m['forged'])
    socket = build.cylinder('socket', radius=0.0135, depth=0.040, segments=6,
                            location=(0.0, 0.332, -0.095))
    socket.data.materials.append(m['forged'])
    socket_hole = build.cylinder('socket_hole', radius=0.0085, depth=0.001, segments=6,
                                 location=(0.0, 0.332, -0.1155))
    socket_hole.data.materials.append(m['bore'])
    tip = W.side('pry_tip', [(-0.150, -0.002), (-0.108, -0.009), (-0.104, 0.009), (-0.150, 0.004)],
                 0.020, m['forged'], bevel=0.002)
    iron = k.weapon('tire_iron', [bar, socket, socket_hole, tip], 'one_hand', catalog_id='tire_iron',
                    lod=0.45, distance=8.0, smooth=50.0)
    iron.anchor('tip', (0.0, 0.332, -0.115), forward=(0.0, 0.0, -1.0), up=(0.0, 1.0, 0.0))


def make(a):
    m = palette()
    k = WeaponKit(a)
    pump_shotgun(k, m)
    assault_rifle(k, m)
    sniper_rifle(k, m)
    rocket_launcher(k, m)
    baseball_bat(k, m)
    tire_iron(k, m)
    k.layout()
    a.bake(size=1024, orm_size=512, normal_size=1024, bevel_radius=0.0015,
           occlusion_distance=0.05, occlusion_ground=False)


def assemble(a):
    WeaponKit.of(a).levels()
