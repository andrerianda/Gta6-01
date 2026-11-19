"""Control tower of the air base, 26 m to the antenna tips: an eight-sided board-marked concrete shaft
that flares into a walkway deck at 19 m, a glazed cab with outward-leaning tinted panes (material
glass) between steel mullions under a roof with a wide overhang, a railed walkway, a rotating-beacon
housing, whip antennas, an anemometer mast and an air-conditioning unit on the roof, and a low
rendered annex behind the shaft with its door, canopy, sign, windows, roof plant and a caged escape
ladder from the annex roof to the walkway. The shaft stands at y = +2.5 (towards the front, the
game's -Z), the annex behind it.
Lamp groups: lamp_cab (the cab's ceiling light), lamp_beacon (red, in the beacon housing).
"""
import math

import _base_kit as kit
import _gse_parts as gp
from _gse_parts import B, C, R, beam, decal, lathe, text_mask, worn
from lib import meshkit as mk
from lib import surfaces as sf
from mathutils import Matrix

ASSET = {'id': 'base_control_tower', 'atlas': 1024, 'kind': 'building', 'builder': 'DetailKitAsset', 'cell': (640, 400), 'columns': 1,
         'views': ((28, 8, 1.0), (40, 10, 2.9, (0, 2.5, 21.6)), (22, 12, 2.6, (0, 0.5, 3.0)))}

CY = 2.5
STEP = 2 * math.pi / 8


def ring(radius, z, count=8):
    step = 2 * math.pi / count
    return [(math.cos(step * (i + 0.5)) * radius, CY + math.sin(step * (i + 0.5)) * radius, z) for i in range(count)]


def band(name, r_out, r_in, z0, z1, material):
    """A closed eight-sided ring of rectangular section."""
    obj = mk.loft(name, [ring(r_out, z0), ring(r_out, z1), ring(r_in, z1), ring(r_in, z0), ring(r_out, z0)], False, False)
    mk.recalc_normals(obj)
    return mk.assign(obj, material)


ac_unit = gp.ac_unit


def make(a):
    a.image_quality = 76
    a.occlusion = (32, 0.4, 2.5)
    gp.RELIEF = 0.02
    sign_text = text_mask(['TORRE DE CONTROL', 'BASE AEREA PUNTA GARZA'], 64, stencil=False, frame=5)
    door_text = text_mask(['SOLO PERSONAL', 'AUTORIZADO'], 44, frame=4)
    concrete = worn('concrete', '#8f8a7f', 0.88, 0.0, chips=0.0, rust=0.0, dirt=0.7, fade=0.3, boards=(3.2, 0.32, 'front', 0.03), stains=1.0, scale=0.4,
                    dust=0.5, dust_height=1.5, cavity=0.6, bump=1.3)
    render = worn('annex_wall', '#b0a78e', 0.86, 0.0, chips=0.45, under=('#8f8a7f', '#a09a8c'), rust=0.0, dirt=0.8, fade=0.4, blotches=('#8f8c6c',),
                  blotch_scale=0.16, stains=1.0, stain_color='#2b261d', scale=0.45, dust=0.7, dust_height=1.2, edge=0.06, cavity=0.5, bump=1.2)
    roof = worn('roof', '#6d6c68', 0.85, 0.0, chips=0.0, rust=0.0, dirt=0.9, fade=0.5, stains=0.7, scale=0.6, dust=0.5, dust_height=30.0, cavity=0.5, bump=1.6)
    dark = worn('frame', '#2b2e2c', 0.5, 0.4, chips=0.4, rust=0.3, dirt=0.5, scale=0.6, dust=0.2, edge=0.03, cavity=0.2)
    steel = worn('galvanised', '#8b9094', 0.5, 0.85, chips=0.0, rust=0.35, dirt=0.5, scale=0.6, dust=0.2, cavity=0.2)
    white = worn('unit_white', '#b9bab3', 0.5, 0.2, chips=0.4, rust=0.4, dirt=0.7, stains=0.8, stain_color='#5c2f16', scale=0.7, dust=0.3, cavity=0.3, edge=0.03)
    door_paint = worn('door_paint', '#3e4a40', 0.5, 0.3, chips=0.5, rust=0.4, dirt=0.6, scale=0.7, dust=0.6, dust_height=0.8, edge=0.03, cavity=0.2,
                      decals=[decal(door_text, (-3.4, 1.57, 1.72), (0, 1, 0), 0.36, '#c9c5b2', depth=0.06)])
    sign = worn('sign_board', '#c5c3b6', 0.5, 0.1, chips=0.4, rust=0.35, dirt=0.5, stains=0.8, stain_color='#5c2f16', scale=0.7, dust=0.0, edge=0.03, cavity=0.3,
                decals=[decal(sign_text, (4.7, 1.6, 3.55), (0, 1, 0), 0.74, '#1f2a33', depth=0.06, strength=1.0)])
    console = worn('console', '#35393b', 0.5, 0.1, chips=0.2, rust=0.0, dirt=0.3, scale=0.8, dust=0.0, cavity=0.2)
    screen = sf.plain('monitor', '#1e4a52', 0.2)
    red = sf.plain('lens_red', '#8a1612', 0.25)
    lens = sf.plain('lens_clear', '#c9cdc8', 0.15, 0.3)
    glass_cab = sf.glass('glass', '#1a3134', 0.5)
    glass_win = sf.glass('glass_window', '#0e1a1e', 0.8)
    lamp_cab = sf.lamp('lamp_cab', '#fff0cf', 3.0)
    lamp_beacon = sf.lamp('lamp_beacon', '#ff2c1c', 6.0)

    # --- all levels: shaft, cab glass, roof, annex --------------------------------------------------------
    shaft = mk.loft('shaft', [ring(2.7, 0.0), ring(2.45, 17.2), ring(4.9, 18.7), ring(4.9, 19.0), ring(3.78, 19.0),
                              ring(3.78, 19.9), ring(3.62, 19.9), ring(3.62, 19.06)])
    mk.assign(shaft, concrete)
    panes = mk.assign(mk.loft('panes', [ring(3.7, 19.9), ring(4.35, 22.5)], False, False), glass_cab)
    top = mk.assign(mk.loft('cab_roof', [ring(4.3, 22.45), ring(5.0, 22.6), ring(5.0, 22.95), ring(4.1, 23.25)]), roof)
    annex = [kit.block('annex', (14.0, 8.0, 4.2), (0, -2.5, 2.1), render), kit.block('annex_roof', (14.5, 8.5, 0.3), (0, -2.5, 4.3), roof),
             kit.block('step', (15.0, 9.0, 0.12), (0, -2.5, 0.06), roof)]
    a.parts_of([shaft, panes, top] + annex)
    a.density(shaft, 1.0)
    a.density(top, 0.7)
    a.density(annex[0], 1.15)
    a.density(annex[1], 0.6)
    a.density(annex[2], 0.6)

    # --- levels 0 and 1 ------------------------------------------------------------------------------------
    mid = gp.Parts([kit.polygon('ceiling', ring(3.3, 22.43), lamp_cab, (0, CY, 40), True)])
    mid.append(mk.assign(mk.loft('desk', [ring(3.35, 19.06), ring(3.35, 19.95), ring(2.7, 20.1), ring(2.7, 19.06)]), console))
    mullion = beam('mullion', ring(3.72, 19.9)[0], ring(4.37, 22.5)[0], 0.16, 0.13, dark)
    a.part(mullion, levels=(0, 1))
    a.repeat(mullion, [Matrix.Translation((0, CY, 0)) @ Matrix.Rotation(STEP * i, 4, 'Z') @ Matrix.Translation((0, -CY, 0)) for i in range(1, 8)])
    mid.append(band('sill_band', 3.86, 3.6, 19.82, 19.94, dark))
    mid.append(band('head_band', 4.48, 4.26, 22.4, 22.52, dark))
    mid.append(band('fascia', 5.05, 4.96, 22.58, 22.99, dark))
    mid.append(band('collar', 2.62, 2.3, 16.75, 17.1, concrete))
    mid.append(band('plinth', 2.95, 2.5, 0.0, 0.55, concrete))
    # the rotating-beacon housing
    mid.append(lathe('beacon_drum', [(0.42, 23.2), (0.42, 23.7), (0.3, 23.78), (0.12, 23.8), (0.12, 24.38), (0.34, 24.4), (0.34, 24.46), (0.1, 24.46)], 'Z', (0, CY, 0), dark, 10))
    mid.append(lathe('beacon_cap', [(0.1, 24.86), (0.36, 24.86), (0.36, 24.92), (0.2, 25.02), (0.05, 25.04)], 'Z', (0, CY, 0), dark, 10))
    mid.append(kit.block('beacon', (0.36, 0.36, 0.38), (0, CY, 24.66), lamp_beacon))
    mid.append(ac_unit('roof_unit', (1.3, 1.0, 0.7), (-1.6, CY - 1.2, 23.1), white, dark, 20))
    mid.append(ac_unit('annex_unit_1', (1.8, 1.2, 0.9), (-4.0, -4.0, 4.45), white, dark))
    mid.append(ac_unit('annex_unit_2', (1.8, 1.2, 0.9), (4.2, -3.0, 4.45), white, dark, 90))
    for x in (-0.32, 0.32):
        mid.append(R('ladder_rail', [(x, -2.25, 4.45), (x, -2.25, 20.15)], 0.035, steel, 4))
    a.parts_of(mid, levels=(0, 1))

    # --- level 0 -----------------------------------------------------------------------------------------------
    fine = gp.Parts([kit.railing('deck_rail', ring(4.78, 19.0), 1.1, steel, 0.04)])
    fine.append(band('kick_plate', 4.82, 4.78, 19.0, 19.16, steel))
    for i in range(8):
        p0, p1 = ring(4.78, 19.0)[i], ring(4.78, 19.0)[(i + 1) % 8]
        mid_point = ((p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5, 19.0)
        fine.append(R('rail_post', [mid_point, (mid_point[0], mid_point[1], 20.1)], 0.03, steel, 4))
        low, high = ring(3.72, 19.9), ring(4.37, 22.5)
        fine.append(beam('mullion_mid', [(low[i][k] + low[(i + 1) % 8][k]) * 0.5 for k in range(3)], [(high[i][k] + high[(i + 1) % 8][k]) * 0.5 for k in range(3)],
                         0.07, 0.07, dark))
    for i in range(4):
        fine.append(R('beacon_cage', [(0.3 * math.cos(i * math.pi / 2 + 0.8), CY + 0.3 * math.sin(i * math.pi / 2 + 0.8), 24.46),
                                      (0.3 * math.cos(i * math.pi / 2 + 0.8), CY + 0.3 * math.sin(i * math.pi / 2 + 0.8), 24.86)], 0.02, dark, 4))
    for x, y, tip in ((1.5, 1.2, 26.0), (-1.2, 1.6, 25.6), (2.2, -1.0, 25.2)):
        fine.append(R('whip', [(x, CY + y, 23.3), (x, CY + y, tip)], 0.025, dark, 4))
        fine.append(C('whip_base', 0.09, 0.3, (x, CY + y, 23.3), 'Z', steel, 6))
    # anemometer mast, a folded dipole, obstruction lights
    fine.append(R('wind_mast', [(-2.4, CY + 1.2, 23.2), (-2.4, CY + 1.2, 24.9)], 0.035, steel, 5))
    fine.append(R('wind_arm', [(-2.85, CY + 1.2, 24.75), (-1.95, CY + 1.2, 24.75)], 0.02, steel, 4))
    fine.append(C('wind_cups', 0.16, 0.06, (-2.85, CY + 1.2, 24.86), 'Z', dark, 6), B('wind_vane', (0.03, 0.5, 0.16), (-1.95, CY + 1.2, 24.9), dark, (0, 0, 25)))
    fine.append(R('dipole', [(0.6, CY - 2.6, 23.2), (0.6, CY - 2.6, 24.6)], 0.03, steel, 4))
    for z in (23.9, 24.5):
        fine.append(R('dipole_loop', [(0.6, CY - 2.6, z), (0.95, CY - 2.6, z), (0.95, CY - 2.6, z - 0.4), (0.6, CY - 2.6, z - 0.4)], 0.02, dark, 4))
    for angle in (0.5, 2.6, 4.2):
        fine.append(C('obstruction_light', 0.08, 0.16, (4.6 * math.cos(angle), CY + 4.6 * math.sin(angle), 23.1), 'Z', red, 6))
    # the cab's fittings
    for angle in (1.2, 1.9, 2.6):
        fine.append(B('monitor', (0.55, 0.06, 0.4), (3.0 * math.cos(angle), CY + 3.0 * math.sin(angle), 20.33), screen, (0, 0, math.degrees(angle) - 90)))
    for x in (-0.9, 0.9):
        fine.append(B('chair_seat', (0.5, 0.5, 0.1), (x, CY + 1.4, 19.55), console), B('chair_back', (0.5, 0.08, 0.55), (x, CY + 1.15, 19.9), console),
                    C('chair_post', 0.04, 0.45, (x, CY + 1.4, 19.28), 'Z', dark, 5))
    # shaft windows, annex windows with sills, door, canopy, steps, sign, lamp
    for z in (4.0, 8.0, 12.0, 15.6):
        r = (2.7 - 0.25 * z / 17.2) * math.cos(math.pi / 8)
        fine += kit.window('slit', (0, CY + r - 0.03, z), 0.7, 1.7, '+y', glass_win, dark)
        fine.append(B('slit_sill', (1.0, 0.16, 0.08), (0, CY + r + 0.03, z - 0.95), concrete))
    for x in (-5.2, 5.2):
        fine += kit.window('front_win', (x, 1.5, 2.4), 1.8, 1.2, '+y', glass_win, dark)
        fine.append(B('sill', (2.1, 0.18, 0.08), (x, 1.56, 1.72), concrete))
    for x in (-5.0, -1.7, 1.7, 5.0):
        fine += kit.window('rear_win', (x, -6.5, 2.4), 1.8, 1.2, '-y', glass_win, dark)
        fine.append(B('sill', (2.1, 0.18, 0.08), (x, -6.56, 1.72), concrete))
    for sign_x, facing in ((-1, '-x'), (1, '+x')):
        fine += kit.window('side_win', (sign_x * 7.0, -3.4, 2.4), 2.4, 1.2, facing, glass_win, dark)
        fine.append(B('sill', (0.18, 2.7, 0.08), (sign_x * 7.06, -3.4, 1.72), concrete))
        fine.append(R('down_pipe', [(sign_x * 6.9, -6.58, 4.15), (sign_x * 6.9, -6.58, 0.12)], 0.06, steel, 5))
    fine.append(B('door_frame', (1.3, 0.1, 2.32), (-3.4, 1.53, 1.28), dark))
    fine.append(B('door', (1.1, 0.08, 2.2), (-3.4, 1.56, 1.22), door_paint), B('door_handle', (0.05, 0.06, 0.18), (-3.0, 1.62, 1.2), steel),
                B('door_plate', (1.1, 0.02, 0.3), (-3.4, 1.61, 0.3), steel))
    fine.append(B('door_canopy', (1.8, 0.9, 0.1), (-3.4, 1.95, 2.55), roof), R('canopy_stay', [(-4.2, 1.55, 3.0), (-4.2, 2.35, 2.6)], 0.02, dark, 4),
                R('canopy_stay', [(-2.6, 1.55, 3.0), (-2.6, 2.35, 2.6)], 0.02, dark, 4))
    fine.append(B('door_step', (1.7, 0.42, 0.1), (-3.4, 1.72, 0.17), concrete))
    fine.append(B('door_lamp', (0.3, 0.14, 0.12), (-3.4, 1.58, 2.42), lens))
    board = B('sign', (3.9, 0.06, 0.9), (4.7, 1.54, 3.55), sign, bevel=0.01)
    a.part(board, levels=(0, 1))
    a.density(board, 2.2)
    fine.append(B('wall_unit', (0.3, 0.9, 0.6), (7.16, 0.2, 3.0), white, bevel=0.02))
    fine.append(B('wall_unit_grille', (0.02, 0.6, 0.4), (7.32, 0.2, 3.0), dark))
    fine.append(R('wall_unit_pipe', [(7.05, 0.75, 2.9), (7.05, 0.75, 0.5)], 0.025, dark, 4))
    # roof plant: vent pipes, a dish, the cable tray to the shaft
    for x, y in ((-1.0, -5.2), (1.2, -5.6), (5.8, -5.4)):
        fine.append(R('vent_pipe', [(x, y, 4.45), (x, y, 5.2), (x, y + 0.2, 5.3)], 0.07, steel, 5))
    fine.append(lathe('dish', [(0.05, 0.0), (0.5, 0.12), (0.62, 0.22), (0.6, 0.24), (0.05, 0.04)], 'Y', (-5.6, -0.9, 5.4), white, 10))
    fine.append(R('dish_pole', [(-5.6, -0.95, 4.45), (-5.6, -0.95, 5.4)], 0.05, steel, 5))
    fine.append(B('cable_tray', (0.4, 2.2, 0.1), (1.6, -1.0, 4.52), steel))
    fine.append(R('cable_riser', [(1.6, 0.1, 4.5), (1.6, 0.35, 17.0)], 0.06, dark, 4))
    # the caged escape ladder from the annex roof to the walkway
    for i in range(38):
        fine.append(R('ladder_rung', [(-0.32, -2.25, 4.8 + 0.4 * i), (0.32, -2.25, 4.8 + 0.4 * i)], 0.02, steel, 4))
    for i in range(8):
        z = 7.0 + 1.6 * i
        fine.append(R('ladder_hoop', [(-0.32, -2.25, z), (-0.42, -2.7, z), (0.0, -2.95, z), (0.42, -2.7, z), (0.32, -2.25, z)], 0.02, steel, 4))
    for x, y in ((-0.42, -2.7), (0.0, -2.95), (0.42, -2.7)):
        fine.append(R('ladder_strap', [(x, y, 7.0), (x, y, 18.2)], 0.015, steel, 4))
    for z in (6.0, 10.0, 14.0, 17.4):
        reach = CY - (2.7 - 0.25 * min(z, 17.2) / 17.2) * math.cos(math.pi / 8)
        for x in (-0.32, 0.32):
            fine.append(R('ladder_stay', [(x, -2.25, z), (x * 0.6, reach, z + 0.5)], 0.025, steel, 4))
    a.parts_of(fine, levels=(0,))

    a.lod_distances = (110.0, 380.0)
    a.collider_box('shaft', (5.0, 5.0, 19.0), (0, CY, 9.5))
    a.collider_box('cab', (9.8, 9.8, 4.4), (0, CY, 21.1))
    a.collider_box('annex', (14.0, 8.0, 4.5), (0, -2.5, 2.25))
    a.anchor('cab', (0, CY, 20.6))
    a.anchor('beacon', (0, CY, 24.7))
