"""police_boat: the Harbour Patrol's rigid patrol boat (catalogue: Olabarria Rompeolas 36), 11.0 m
overall (hull 10.1 m), 3.3 m over the foam collar, draught 0.7 m, 3.4 m to the light bar.

Built with boats/_boat.py. A deep-vee aluminium hull with spray rails inside a thick grey foam
collar that runs round the bow; a three-window wheelhouse amidships (reverse-raked front screens,
side windows, an open back) with a radar arch on its roof carrying the light bar and a radar
dome, a searchlight on the roof's front edge; a bow post and a towing bitt, stainless grab rails,
fenders, a bench aft of the wheelhouse, twin cowled outboards behind a guard rail. Livery: white
topsides, blue boot and roof band (paint_secondary), lettering painted by the game at the
anchor_decal_side_* anchors (the model carries none).

Faces +Y (the bow), origin at the waterline at mid hull length: the hull floats on Z = 0.
engine_l / engine_r: origin on the steering pivot at the transom; swing about the vertical.
propeller_l / propeller_r (children of the engines): origin at the hub, spin about Y.
steering_wheel: an empty on the hub, local Z up the column toward the helmsman.

Budget: the body, two engines, two propellers and the wheel are separate nodes with eleven
game materials (atlas, paint, paint_secondary, glass, lamp_head, lamp_nav_red, lamp_nav_green,
lamp_tail, lamp_siren_a, lamp_siren_b, lamp_searchlight): about 18 draws at level 0, so the
draw cap is raised; triangles and bytes within the brief's boat targets.
"""
import math

from lib import materials as M
from lib import modify, scene, shading

import _boat as K

ASSET = {
    'id': 'police_boat',
    'kind': 'vehicle',
    'atlas': 1024,
    'budget': {'triangles': 16000, 'draws': 20, 'bytes': 430000},
}

TRANSOM_Y = -4.90
# Hull keys: (y, keel z, chine x, chine z, sheer x, sheer z).
HULL = [
    (-4.90, -0.62, 1.20, -0.14, 1.34, 1.08),
    (-3.20, -0.66, 1.25, -0.12, 1.39, 1.10),
    (-1.00, -0.68, 1.26, -0.10, 1.41, 1.13),
    (1.20, -0.62, 1.16, -0.03, 1.37, 1.20),
    (3.00, -0.42, 0.88, 0.14, 1.19, 1.30),
    (4.20, -0.12, 0.50, 0.38, 0.82, 1.40),
    (4.90, 0.38, 0.16, 0.72, 0.38, 1.48),
    (5.20, 1.10, 0.02, 1.25, 0.04, 1.52),
]
SOLE_Z = 0.42
COLLAR_R = 0.25
# Wheelhouse: aft and forward ends at deck level, half width, window sill and roof heights.
CAB_AFT, CAB_FWD, CAB_HALF = -1.10, 1.45, 0.98
SILL_Z, ROOF_Z = 1.42, 2.42
WHEEL_HUB = (0.48, 1.00, 1.30)
COLUMN = (0.0, -0.80, 0.60)
ENGINE_X = 0.44
SEARCHLIGHT = (0.0, 1.38, ROOF_Z + 0.20)
SIREN = (0.0, 0.95, ROOF_Z + 0.12)                # light bar on the roof, behind the searchlight


def materials():
    lamp = M.lamp
    return {
        'paint': M.car_paint(color=M.hex_color('#F2F0E8'), metallic_flake=0.05, gloss=0.8,
                             dirt=0.3, seed=171, name='paint'),
        'secondary': M.car_paint(color=M.hex_color('#1D4E7A'), metallic_flake=0.2, gloss=0.8,
                                 dirt=0.25, seed=172, name='paint_secondary'),
        'bottom': M.painted_metal(color=(0.05, 0.06, 0.08), gloss=0.3, chips=0.3, rust=0.0,
                                  grime=0.6, dust=0.0, fade=0.3, seed=173, name='antifouling'),
        'collar': M.plastic(color=(0.16, 0.17, 0.18), roughness=0.75, grain=0.6, scuffs=0.6,
                            seed=174, name='collar_foam'),
        'deck': M.plastic(color=(0.30, 0.31, 0.32), roughness=0.9, grain=1.0, scuffs=0.5,
                          seed=175, name='deck_nonslip'),
        'gelcoat': M.plastic(color=(0.70, 0.70, 0.68), roughness=0.35, grain=0.2, scuffs=0.35,
                             seed=176, name='gelcoat_white'),
        'seat': M.leather(color=(0.05, 0.05, 0.055), grain=0.4, wear_amount=0.35, seed=177,
                          name='seat_vinyl'),
        'trim': M.plastic(color=(0.022, 0.022, 0.024), roughness=0.5, seed=178,
                          name='trim_plastic'),
        'chrome': M.chrome(seed=179, name='stainless'),
        'cowl': M.car_paint(color=(0.05, 0.05, 0.055), metallic_flake=0.3, gloss=0.85,
                            dirt=0.1, seed=180, name='cowl_paint'),
        'engine_trim': M.painted_metal(color=(0.04, 0.04, 0.045), gloss=0.5, chips=0.2,
                                       rust=0.0, grime=0.4, dust=0.0, fade=0.2, seed=181,
                                       name='engine_paint'),
        'prop': M.brushed_metal(color=(0.55, 0.56, 0.57), roughness=0.25, seed=182,
                                name='prop_steel'),
        'wheel': M.rubber(color=(0.02, 0.02, 0.022), seed=183, name='wheel_rubber'),
        'fender': M.rubber(color=(0.04, 0.06, 0.12), seed=184, name='fender_rubber'),
        'housing': M.painted_metal(color=(0.08, 0.08, 0.085), gloss=0.5, chips=0.25, rust=0.0,
                                   grime=0.3, dust=0.1, fade=0.1, seed=185, name='housing_paint'),
        'radome': M.plastic(color=(0.68, 0.68, 0.66), roughness=0.4, grain=0.2, scuffs=0.2,
                            seed=186, name='radome_white'),
        'glass': M.glass(tint=(0.20, 0.26, 0.30), opacity=0.55, seed=187, name='glass'),
        'lamp_head': lamp(color=(1.0, 0.96, 0.90), strength=8.0, seed=188, name='lamp_head'),
        'lamp_nav_red': lamp(color=(1.0, 0.06, 0.04), strength=5.0, seed=189,
                             name='lamp_nav_red'),
        'lamp_nav_green': lamp(color=(0.08, 1.0, 0.3), strength=5.0, seed=190,
                               name='lamp_nav_green'),
        'lamp_tail': lamp(color=(1.0, 0.96, 0.90), strength=6.0, seed=191, name='lamp_tail'),
        'lamp_siren_a': lamp(color=(1.0, 0.05, 0.04), strength=10.0, seed=192,
                             name='lamp_siren_a'),
        'lamp_siren_b': lamp(color=(0.06, 0.25, 1.0), strength=10.0, seed=193,
                             name='lamp_siren_b'),
        'lamp_searchlight': lamp(color=(1.0, 0.96, 0.88), strength=14.0, seed=194,
                                 name='lamp_searchlight'),
    }


def _hull_material(centre, normal):
    """Index into [paint, secondary, bottom]: antifouling, blue boot band, white topsides."""
    if centre.z < 0.10:
        return 2
    if centre.z < 0.34:
        return 1
    return 0


def _cabin_ring(z, aft, fwd, half, chamfer=0.16):
    """A horizontal ring of the wheelhouse at height z (counter-clockwise from above)."""
    c = chamfer
    return [(half, aft + c, z), (half, fwd - c, z), (half - c, fwd, z), (-half + c, fwd, z),
            (-half, fwd - c, z), (-half, aft + c, z), (-half + c, aft, z), (half - c, aft, z)]


def _cabin_material(centre, normal):
    """Index into [paint, secondary, glass, trim]: windows in a band, a blue roof band."""
    z, y = centre.z, centre.y
    if SILL_Z + 0.04 < z < ROOF_Z - 0.16:
        if normal.y > 0.5:
            return 2                                     # three front screens
        if abs(normal.x) > 0.5 and y > CAB_AFT + 0.35:
            return 2                                     # side windows
        if normal.y < -0.5 and abs(centre.x) > 0.30:
            return 2                                     # back windows beside the door
    if z > ROOF_Z - 0.14 and abs(normal.z) < 0.6:
        return 1
    if z < SOLE_Z + 0.08:
        return 3
    return 0


def wheelhouse(mats):
    parts = []
    rings = []
    for z, aft, fwd, half in ((SOLE_Z, CAB_AFT, CAB_FWD, CAB_HALF),
                              (SILL_Z, CAB_AFT, CAB_FWD, CAB_HALF),
                              (SILL_Z + 0.04, CAB_AFT, CAB_FWD + 0.01, CAB_HALF - 0.005),
                              (ROOF_Z - 0.16, CAB_AFT, CAB_FWD + 0.16, CAB_HALF - 0.06),
                              (ROOF_Z - 0.14, CAB_AFT, CAB_FWD + 0.17, CAB_HALF - 0.06),
                              (ROOF_Z, CAB_AFT - 0.05, CAB_FWD + 0.24, CAB_HALF - 0.04)):
        rings.append(_cabin_ring(z, aft, fwd, half))
    shell = K.build.loft('wheelhouse', rings, closed=True, cap_start=False, cap_end=True)
    shading.recalc_normals(shell)
    K.assign(shell, [mats['paint'], mats['secondary'], mats['glass'], mats['trim']],
             _cabin_material)
    modify.solidify(shell, thickness=0.04, offset=-1.0)
    parts.append(shell)
    # Window mullions between the three front screens, a roof grab rail, wipers.
    for x in (-0.33, 0.33):
        parts.append(K.rod(f'mullion_{x:+.2f}', (x, CAB_FWD + 0.02, SILL_Z + 0.03),
                           (x, CAB_FWD + 0.17, ROOF_Z - 0.15), 0.025, mats['trim'], 6))
    for x in (-0.62, 0.0, 0.62):
        parts.append(K.rod(f'wiper_{x:+.2f}', (x, CAB_FWD + 0.05, SILL_Z + 0.10),
                           (x + 0.18, CAB_FWD + 0.10, SILL_Z + 0.48), 0.008, mats['trim'], 4))
    for sx in (-1.0, 1.0):
        parts.append(K.tube(f'roof_rail_{sx:+.0f}', [(sx * 0.80, CAB_AFT + 0.15, ROOF_Z),
                                                     (sx * 0.80, CAB_AFT + 0.15, ROOF_Z + 0.10),
                                                     (sx * 0.80, CAB_FWD - 0.10, ROOF_Z + 0.10),
                                                     (sx * 0.80, CAB_FWD - 0.10, ROOF_Z)],
                            0.016, mats['chrome'], 6))
    # Radar arch: two raked legs from the roof's aft corners and a crossbar carrying the radar
    # dome, a masthead light and the antennas. The light bar sits on the roof in front of it.
    for sx in (-1.0, 1.0):
        parts.append(K.tube(f'arch_leg_{sx:+.0f}', [(sx * 0.82, CAB_AFT + 0.10, ROOF_Z),
                                                    (sx * 0.74, CAB_AFT + 0.55, 2.98),
                                                    (sx * 0.62, CAB_AFT + 0.75, 3.05)], 0.055,
                            mats['gelcoat'], 10))
    parts.append(K.box('arch_bar', (1.36, 0.22, 0.10), (0.0, -0.32, 3.05), mats['gelcoat'],
                       bevel=0.03))
    parts.append(K.box('light_bar_base', (1.10, 0.22, 0.06), (0.0, SIREN[1], ROOF_Z + 0.04),
                       mats['trim'], bevel=0.01))
    for sx, lamp in ((-1.0, 'lamp_siren_a'), (1.0, 'lamp_siren_b')):
        parts.append(K.box(f'light_bar_{sx:+.0f}', (0.50, 0.18, 0.09),
                           (sx * 0.28, SIREN[1], ROOF_Z + 0.115), mats[lamp], bevel=0.02))
    parts.append(K.axis_cylinder('radome', 0.30, 0.20, (0.0, -0.32, 3.22), 'Z', mats['radome'],
                                 24, radius_top=0.27))
    parts.append(K.axis_cylinder('radome_base', 0.10, 0.08, (0.0, -0.32, 3.10), 'Z',
                                 mats['housing'], 12))
    parts.append(K.rod('antenna_whip', (0.55, -0.36, 3.10), (0.62, -0.30, 4.05), 0.010,
                       mats['trim'], 6))
    parts.append(K.rod('antenna_vhf', (-0.55, -0.36, 3.10), (-0.58, -0.32, 3.75), 0.014,
                       mats['radome'], 6))
    parts.append(K.axis_cylinder('mast_light', 0.035, 0.07, (0.0, -0.32, 3.36), 'Z',
                                 mats['lamp_head'], 12))
    # Searchlight on the roof's front edge, aimed forward.
    sx_, sy, sz = SEARCHLIGHT
    parts.append(K.axis_cylinder('searchlight_post', 0.04, 0.16, (sx_, sy - 0.02, ROOF_Z + 0.08),
                                 'Z', mats['housing'], 10))
    parts.append(K.axis_cylinder('searchlight_drum', 0.11, 0.26, (sx_, sy, sz), 'Y',
                                 mats['housing'], 18))
    parts.append(K.axis_cylinder('searchlight_bezel', 0.12, 0.03, (sx_, sy + 0.14, sz), 'Y',
                                 mats['chrome'], 18, caps=False))
    parts.append(K.axis_cylinder('searchlight_lens', 0.10, 0.01, (sx_, sy + 0.135, sz), 'Y',
                                 mats['lamp_searchlight'], 18))
    return parts


def body(mats):
    parts = []
    hull = K.hull_shell('hull', HULL, step=0.32, thickness=0.05)
    K.assign(hull, [mats['paint'], mats['secondary'], mats['bottom']], _hull_material)
    parts.append(hull)
    stern = K.transom('transom', HULL)
    K.assign(stern, [mats['paint'], mats['secondary'], mats['bottom']], _hull_material)
    parts.append(stern)
    # The foam collar: one tube from the port quarter round the bow to the starboard quarter,
    # with a rubbing strake along its waist.
    port = K.sheer_line(HULL, -1.0, TRANSOM_Y + 0.05, 4.55, step=0.35)
    starboard = K.sheer_line(HULL, 1.0, TRANSOM_Y + 0.05, 4.55, step=0.35)

    def out(points, side, dx, dz):
        return [(x + side * dx, y, z + dz) for x, y, z in points]

    path = (out(port, -1.0, 0.0, -0.06) + [(0.0, 5.24, 1.47)]
            + list(reversed(out(starboard, 1.0, 0.0, -0.06))))
    parts.append(K.tube('collar', K.smooth(path, 1), COLLAR_R, mats['collar'], 14))
    strake = (out(port, -1.0, COLLAR_R, -0.06) + [(0.0, 5.49, 1.47)]
              + list(reversed(out(starboard, 1.0, COLLAR_R, -0.06))))
    parts.append(K.tube('collar_strake', K.smooth(strake, 1), 0.035, mats['trim'], 6))
    # Decks: foredeck at the sheer, cockpit sole, aft deck over the transom.
    parts.append(K.mat(K.deck('foredeck', HULL, 1.90, 5.15, crown=0.05), mats['deck']))
    parts.append(K.box('sole', (2.20, 6.70, 0.06), (0.0, -1.47, SOLE_Z), mats['deck']))
    parts.append(K.box('aft_deck', (2.40, 0.50, 0.06), (0.0, -4.62, 0.78), mats['deck']))
    # Inner bulwarks from the sole up under the collar.
    for sx in (-1.0, 1.0):
        parts.append(K.box(f'liner_{sx:+.0f}', (0.04, 5.95, 0.62), (sx * 1.22, -1.775, 0.76),
                           mats['gelcoat']))
    parts += wheelhouse(mats)
    # Helm inside the wheelhouse (starboard): console, wheel column, throttles, screens.
    hx, hy, hz = WHEEL_HUB
    parts.append(K.box('helm', (0.72, 0.42, 0.70), (hx, hy + 0.22, SOLE_Z + 0.35), mats['trim'],
                       bevel=0.03))
    parts.append(K.box('dash', (1.70, 0.38, 0.06), (0.0, CAB_FWD - 0.22, SOLE_Z + 0.78),
                       mats['trim'], rotation=(0.40, 0.0, 0.0), bevel=0.01))
    parts.append(K.rod('column', (hx, hy + 0.20, hz - 0.15), WHEEL_HUB, 0.025, mats['trim'], 8))
    parts.append(K.box('throttle_box', (0.12, 0.16, 0.10), (hx + 0.30, hy + 0.22, SOLE_Z + 0.76),
                       mats['trim'], bevel=0.02))
    # Seats: two helm seats in the wheelhouse, a bench aft of it.
    for sx in (-1.0, 1.0):
        x = sx * 0.48
        parts.append(K.rod(f'pedestal_{sx:+.0f}', (x, 0.30, SOLE_Z), (x, 0.30, SOLE_Z + 0.45),
                           0.05, mats['chrome'], 10))
        parts.append(K.box(f'seat_{sx:+.0f}', (0.50, 0.50, 0.14), (x, 0.30, SOLE_Z + 0.52),
                           mats['seat'], bevel=0.05))
        parts.append(K.box(f'seat_back_{sx:+.0f}', (0.50, 0.14, 0.52), (x, 0.02, SOLE_Z + 0.82),
                           mats['seat'], rotation=(-0.15, 0.0, 0.0), bevel=0.05))
    parts.append(K.box('bench_base', (1.80, 0.55, 0.40), (0.0, -2.05, SOLE_Z + 0.20),
                       mats['gelcoat'], bevel=0.04))
    parts.append(K.box('bench', (1.84, 0.58, 0.13), (0.0, -2.05, SOLE_Z + 0.46), mats['seat'],
                       bevel=0.05))
    parts.append(K.box('bench_back', (1.84, 0.16, 0.44), (0.0, -2.40, SOLE_Z + 0.74),
                       mats['seat'], rotation=(-0.18, 0.0, 0.0), bevel=0.05))
    # Bow post, towing bitt, cleats, grab rails, fenders, guard rail over the engines.
    parts.append(K.axis_cylinder('bow_post', 0.06, 0.32, (0.0, 4.55, 1.58), 'Z', mats['chrome'],
                                 12))
    parts.append(K.axis_cylinder('bow_post_cap', 0.08, 0.03, (0.0, 4.55, 1.75), 'Z',
                                 mats['chrome'], 12))
    parts.append(K.axis_cylinder('towing_bitt', 0.09, 0.40, (0.0, -4.55, 0.98), 'Z',
                                 mats['housing'], 14))
    parts.append(K.axis_cylinder('bitt_pin', 0.025, 0.40, (0.0, -4.55, 1.08), 'X', mats['chrome'],
                                 8))
    for sx in (-1.0, 1.0):
        _k, _cx, _cz, sxh, szh = K.hull_station(HULL, 3.4)
        parts.append(K.box(f'cleat_{sx:+.0f}', (0.05, 0.22, 0.05), (sx * (sxh - 0.15), 3.4,
                                                                   szh + 0.05), mats['chrome'],
                           bevel=0.012))
        rail = K.sheer_line(HULL, sx, 2.5, 4.4, inset=0.18, drop=-0.40)
        parts.append(K.tube(f'bow_rail_{sx:+.0f}', rail, 0.016, mats['chrome'], 8))
        for point in rail[::3]:
            parts.append(K.rod(f'bow_stanchion_{sx:+.0f}_{point[1]:+.2f}',
                               (point[0], point[1], point[2] - 0.40), point, 0.013,
                               mats['chrome'], 6))
        parts.append(K.rod(f'cabin_grab_{sx:+.0f}', (sx * (CAB_HALF + 0.05), CAB_AFT + 0.4, 1.55),
                           (sx * (CAB_HALF + 0.05), CAB_FWD - 0.3, 1.55), 0.016, mats['chrome'],
                           6))
        for y in (-3.6,):
            _k, _cx, _cz, sxh, szh = K.hull_station(HULL, y)
            parts.append(K.axis_cylinder(f'fender_{sx:+.0f}_{y:+.1f}', 0.11, 0.55,
                                         (sx * (sxh + 0.40), y, szh - 0.55), 'Z',
                                         mats['fender'], 12))
            parts.append(K.rod(f'fender_line_{sx:+.0f}_{y:+.1f}', (sx * (sxh + 0.40), y,
                                                                   szh - 0.27),
                               (sx * (sxh + 0.10), y, szh + 0.08), 0.006, mats['trim'], 4))
        lamp = mats['lamp_nav_red'] if sx < 0 else mats['lamp_nav_green']
        parts.append(K.box(f'nav_light_{sx:+.0f}', (0.03, 0.12, 0.06),
                           (sx * (CAB_HALF - 0.02), CAB_FWD - 0.05, ROOF_Z - 0.02), lamp,
                           bevel=0.008))
    guard = [(-1.25, TRANSOM_Y + 0.05, 1.10), (-1.25, TRANSOM_Y - 0.35, 1.45),
             (-1.10, TRANSOM_Y - 1.10, 1.55), (1.10, TRANSOM_Y - 1.10, 1.55),
             (1.25, TRANSOM_Y - 0.35, 1.45), (1.25, TRANSOM_Y + 0.05, 1.10)]
    parts.append(K.tube('guard_rail', K.smooth(guard, 2), 0.025, mats['chrome'], 8))
    parts.append(K.rod('stern_pole', (-1.20, -4.55, 1.10), (-1.20, -4.55, 2.20), 0.02,
                       mats['chrome'], 8))
    parts.append(K.axis_cylinder('stern_light', 0.035, 0.07, (-1.20, -4.55, 2.24), 'Z',
                                 mats['lamp_tail'], 12))
    parts.append(K.axis_cylinder('bow_light', 0.035, 0.05, (0.0, 4.52, 1.80), 'Z',
                                 mats['lamp_head'], 12))
    return parts


def make(a):
    mats = materials()
    lod0 = scene.join(body(mats), 'lod0')
    shading.smooth(lod0, math.radians(35.0))
    parts = {'lod0': a.add(lod0, unwrap='smart')}
    for side, x in (('l', -ENGINE_X), ('r', ENGINE_X)):
        engine, propeller = K.outboard(side, x, TRANSOM_Y, mats, scale=1.12)
        shading.smooth(engine, math.radians(40.0))
        shading.smooth(propeller, math.radians(40.0))
        parts[f'engine_{side}'] = a.add(engine, unwrap='smart')
        parts[f'propeller_{side}'] = a.add(propeller, unwrap='smart')
    wheel = K.steering_wheel_mesh('steering_wheel_mesh', WHEEL_HUB, COLUMN, mats, radius=0.19)
    shading.smooth(wheel, math.radians(40.0))
    parts['steering_wheel_mesh'] = a.add(wheel, unwrap='smart')
    K.STATE[a.id] = {'parts': parts, 'spec': {'lod1': 3500, 'lod2': 900, 'column': COLUMN,
                                              'wheel_hub': WHEEL_HUB}}

    hip = SOLE_Z + 0.66
    a.add_anchor('anchor_seat_driver', (0.48, 0.34, hip), forward=(0.0, 1.0, 0.0))
    a.add_anchor('anchor_seat_passenger_1', (-0.48, 0.34, hip), forward=(0.0, 1.0, 0.0))
    a.add_anchor('anchor_seat_passenger_2', (-0.50, -1.98, SOLE_Z + 0.60),
                 forward=(0.0, 1.0, 0.0))
    a.add_anchor('anchor_seat_passenger_3', (0.50, -1.98, SOLE_Z + 0.60),
                 forward=(0.0, 1.0, 0.0))
    a.add_anchor('anchor_board', (0.90, -4.60, 0.81), forward=(-1.0, 0.0, 0.0))
    a.add_anchor('anchor_wake', (0.0, TRANSOM_Y - 0.05, 0.0), forward=(0.0, -1.0, 0.0))
    for name, sx in (('anchor_spray_l', -1.0), ('anchor_spray_r', 1.0)):
        _k, cx, cz, _sx, _sz = K.hull_station(HULL, 2.6)
        a.add_anchor(name, (sx * (cx + 0.05), 2.6, cz), forward=(sx * 0.8, 0.6, 0.0))
    a.add_anchor('anchor_light_head_l', (0.0, 4.52, 1.84), forward=(0.0, 1.0, 0.0),
                 color=[1.0, 0.96, 0.90])
    a.add_anchor('anchor_light_tail_l', (-1.20, -4.55, 2.28), forward=(0.0, -1.0, 0.0),
                 color=[1.0, 0.96, 0.90])
    a.add_anchor('anchor_siren', (0.0, SIREN[1], ROOF_Z + 0.17), forward=(0.0, 1.0, 0.0))
    a.add_anchor('anchor_searchlight', (SEARCHLIGHT[0], SEARCHLIGHT[1] + 0.15, SEARCHLIGHT[2]),
                 forward=(0.0, 1.0, 0.0), light='spot', range=140.0, angle=9.0,
                 color=[1.0, 0.96, 0.88])
    a.add_anchor('anchor_camera', (0.0, -1.0, 2.0), forward=(0.0, 1.0, 0.0))
    for name, sx in (('anchor_decal_side_l', -1.0), ('anchor_decal_side_r', 1.0)):
        # The white topsides between the blue boot band and the collar, amidships.
        a.add_anchor(name, (sx * 1.39, -0.30, 0.56), forward=(sx, 0.0, 0.0), width=2.6,
                     height=0.40)
    coarse = [K.section(HULL, y) for y in (-4.90, -2.5, 0.5, 3.0, 4.5, 5.2)]
    coarse = [[point for index, point in enumerate(ring) if index % 4 == 0 or index == len(ring)
               - 1] for ring in coarse]
    collider = shading.recalc_normals(K.build.loft('hull_proxy', coarse, closed=True,
                                                   cap_start=True, cap_end=True))
    a.collider_mesh('hull', collider, convex=True)
    a.collider_box('cabin', (0.0, 0.18, 0.5 * (SOLE_Z + ROOF_Z)),
                   (2.0 * CAB_HALF, CAB_FWD - CAB_AFT + 0.25, ROOF_Z - SOLE_Z))
    a.set_extra('hull_length', 10.10)
    a.set_extra('overall_length', 11.0)
    a.set_extra('beam', 3.30)
    a.set_extra('draught', 0.70)
    a.set_extra('freeboard', 1.13)
    a.set_extra('seats', 4)
    a.set_lod_distances(60.0, 160.0)
    a.bake(size=1024, orm_size=512, normal_size=512, occlusion_distance=0.6,
           material_texels={'antifouling': 0.4, 'deck_nonslip': 0.8, 'engine_paint': 0.6,
                            'prop_steel': 0.5, 'rub_rail': 0.5, 'fender_rubber': 0.5})


def assemble(a):
    K.assemble_boat(a)
