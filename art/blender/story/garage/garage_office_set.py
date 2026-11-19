"""The office corner of Tolliver Tow at night, modelled from the inside (the cinematic camera stands
in the room; the shell is single sided). Inner size 7.0 (x) x 5.5 (z) x 3.0 m, origin at the floor
centre. Blender axes here: +Y is the game's -Z, so the door and window wall (the game's -Z wall) is
at y = +2.75.

  door wall (game -Z)   glazed door `door_office`, opening x -2.7..-1.8 (hinge at x -2.7, the leaf
                        swings in with rotation.y < 0 in the game), key rack, the window x 0.2..2.4,
                        sill 0.95, head 2.25, blind half down, rain on the glass
  +X wall               the photograph's place (anchor_photo at 1.6 m), the calendar
  back wall (game +Z)   steel shelves with oil tins and parts boxes, the clock, the pegboard of tools,
                        the filing cabinet in the +X corner
  -X wall               the enamel sign TOLLIVER TOW, the coat hook (anchor_hanger at 1.9 m)
  the desk              1.6 x 0.8 m, top at 0.76 m, centred x 1.6, game z +0.3; the chair behind it
                        faces the door wall; the lamp `lamp_desk` (shade, with the emissive lamp_desk bulb)
"""
import math

import _story_kit as kit
import paint
from lib import meshkit as mk
from lib import surfaces as sf

ASSET = {'id': 'garage_office_set', 'atlas': 1536, 'kind': 'building',
         'shots': (((-3.1, -2.35, 1.65), (1.4, 1.6, 1.05), 17), ((3.1, 2.3, 1.7), (-0.8, -2.2, 1.0), 17),
                   ((0.2, 0.9, 1.35), (1.7, -0.9, 0.85), 26), ((0.9, -1.6, 1.5), (-2.2, 2.75, 1.25), 24))}
X, Y, Z = 3.5, 2.75, 3.0
DOOR = (-2.7, -1.8, 2.05)
WINDOW = (0.2, 2.4, 0.95, 2.25)
DESK = (1.6, -0.3, 0.76)
V = lambda h: (0, 0, h)


def on_wall(wall, along, z, w, h, off=0.004):
    """(origin, u, v) of an upright rectangle w x h centred at `along` and height z on a wall's inner face."""
    if wall == 'N':
        return (along - w / 2, Y - off, z - h / 2), (w, 0, 0), V(h)
    if wall == 'S':
        return (along + w / 2, -Y + off, z - h / 2), (-w, 0, 0), V(h)
    if wall == 'E':
        return (X - off, along + w / 2, z - h / 2), (0, -w, 0), V(h)
    return (-X + off, along - w / 2, z - h / 2), (0, w, 0), V(h)


def make(a, work_dir):
    a.occlusion_distance = 0.8
    wall = kit.plaster('plaster')
    ceiling = kit.plaster('ceiling_plaster', '#a9a493', '#57492f', 0.8)
    floor = kit.lino()
    trim = kit.wood('trim_wood', '#3d2b1c', 'X', 0.5, 0.5)
    trim_up = kit.wood('trim_wood_upright', '#3d2b1c', 'Z', 0.5, 0.5)
    desk_wood = kit.wood('desk_wood', '#6a4526', 'X', 0.42, 0.7)
    desk_side = kit.wood('desk_wood_upright', '#5c3b20', 'Z', 0.5, 0.6)
    steel = sf.bare_metal('tool_steel', '#9a9da0', 0.32, 0.5)
    dark_steel = sf.coated('shelf_steel', '#3c4346', 0.55, 0.6, 0.6)
    cabinet = sf.coated('cabinet_green', '#4c5a4c', 0.5, 0.2, 0.6)
    brass = sf.bare_metal('brass', '#a8843c', 0.35, 0.4)
    black = sf.coated('black_plastic', '#141416', 0.45, 0.0, 0.3, grain=0.2)
    rubber = sf.rubber('rubber', '#161616')
    card = sf.coated('cardboard', '#8d7350', 0.9, 0.0, 0.5)
    red = sf.coated('red_enamel', '#8e241c', 0.4, 0.1, 0.5)
    enamel = sf.coated('shade_enamel','#2f5a48', 0.3, 0.2, 0.4)
    cream = sf.coated('cream_paint', '#c9c2a8', 0.5, 0.0, 0.5)
    leather = sf.coated('seat_leather', '#3a2418', 0.55, 0.0, 0.6, grain=0.3)
    shell, wood_parts, parts, small = [], [], [], []

    # --- the shell --------------------------------------------------------------------------------
    def face(name, origin, u, v, material):
        obj = kit.panel(name, origin, u, v)
        obj.data.materials.append(material)
        return obj

    shell.append(face('wall_s', (X, -Y, 0), (-2 * X, 0, 0), V(Z), wall))
    shell.append(face('wall_e', (X, Y, 0), (0, -2 * Y, 0), V(Z), wall))
    shell.append(face('wall_w', (-X, -Y, 0), (0, 2 * Y, 0), V(Z), wall))
    d0, d1, dh = DOOR
    w0, w1, ws, wh = WINDOW
    for x0, x1, z0, z1 in ((-X, d0, 0, Z), (d0, d1, dh, Z), (d1, w0, 0, Z), (w0, w1, 0, ws), (w0, w1, wh, Z), (w1, X, 0, Z)):
        shell.append(face('wall_n', (x0, Y, z0), (x1 - x0, 0, 0), V(z1 - z0), wall))
    depth = 0.16
    for x0, x1, z0, z1, sill in ((w0, w1, ws, wh, True), (d0, d1, 0, dh, False)):
        shell.append(face('reveal_l', (x0, Y, z0), (0, depth, 0), V(z1 - z0), wall))
        shell.append(face('reveal_r', (x1, Y + depth, z0), (0, -depth, 0), V(z1 - z0), wall))
        shell.append(face('reveal_head', (x0, Y + depth, z1), (x1 - x0, 0, 0), (0, -depth, 0), wall))
        shell.append(face('reveal_sill', (x0, Y, z0), (x1 - x0, 0, 0), (0, depth, 0), wall if sill else floor))
    a.add_all(shell, 0.62)
    a.add(face('floor', (-X, -Y, 0), (2 * X, 0, 0), (0, 2 * Y, 0), floor), 0.8)
    a.add(face('ceiling', (-X, Y, Z), (2 * X, 0, 0), (0, -2 * Y, 0), ceiling), 0.36)

    # skirting, door and window joinery
    for name, size, at in (('skirt_s', (2 * X, 0.016, 0.11), (0, -Y + 0.008, 0.055)), ('skirt_e', (0.016, 2 * Y, 0.11), (X - 0.008, 0, 0.055)),
                           ('skirt_w', (0.016, 2 * Y, 0.11), (-X + 0.008, 0, 0.055)), ('skirt_n1', (d0 + X - 0.07, 0.016, 0.11), ((d0 - 0.07 - X) / 2, Y - 0.008, 0.055)),
                           ('skirt_n2', (X - d1 - 0.07, 0.016, 0.11), ((X + d1 + 0.07) / 2, Y - 0.008, 0.055))):
        wood_parts.append(kit.block(name, size, at, trim, 0.004))
    for x in (d0 - 0.035, d1 + 0.035):
        wood_parts.append(kit.block('door_jamb', (0.07, 0.2, dh + 0.07), (x, Y + 0.07, (dh + 0.07) / 2), trim_up, 0.006))
    wood_parts.append(kit.block('door_head', (d1 - d0 + 0.14, 0.2, 0.07), ((d0 + d1) / 2, Y + 0.07, dh + 0.035), trim, 0.006))
    wood_parts.append(kit.block('threshold', (d1 - d0, 0.2, 0.02), ((d0 + d1) / 2, Y + 0.07, 0.008), trim, 0.004))
    wc, wz = (w0 + w1) / 2, (ws + wh) / 2
    for x in (w0 + 0.03, wc, w1 - 0.03):
        wood_parts.append(kit.block('window_post', (0.06 if x != wc else 0.045, 0.07, wh - ws), (x, Y + 0.105, wz), trim_up, 0.005))
    for z in (ws + 0.03, wh - 0.03):
        wood_parts.append(kit.block('window_rail', (w1 - w0, 0.07, 0.06), (wc, Y + 0.105, z), trim, 0.005))
    wood_parts.append(kit.block('window_board', (w1 - w0 + 0.16, 0.2, 0.035), (wc, Y + 0.04, ws - 0.012), trim, 0.008))
    rain = kit.textured_glass('glass_rain', paint.rain_glass(work_dir))
    for x0, x1 in ((w0 + 0.06, wc - 0.0225), (wc + 0.0225, w1 - 0.06)):
        pane = kit.panel('pane', (x0, Y + 0.105, ws + 0.06), (x1 - x0, 0, 0), V(wh - ws - 0.12))
        pane.data.materials.append(rain)
        a.add(pane)

    # the blind, half down: head rail, slats on their ladder cords, bottom rail, pull cord
    blind = [kit.block('blind_head', (w1 - w0 - 0.02, 0.05, 0.045), (wc, Y - 0.035, wh + 0.03), cream, 0.004)]
    low = 1.62
    for i in range(20):
        z = wh - 0.01 - i * (wh - low) / 20
        sag = 0.003 * math.sin(i * 1.7)
        blind.append(kit.block('slat', (w1 - w0 - 0.05, 0.036, 0.0025), (wc + 0.004 * math.sin(i), Y - 0.035, z + sag), cream, 0.0, (38 + 4 * math.sin(i * 2.3), 0.25 * math.sin(i * 0.9), 0)))
    blind.append(kit.block('blind_bottom', (w1 - w0 - 0.04, 0.04, 0.02), (wc, Y - 0.035, low - 0.03), cream, 0.003, (0, 0.5, 0)))
    for x in (w0 + 0.25, wc, w1 - 0.25):
        blind.append(kit.rod('blind_cord', [(x, Y - 0.052, wh + 0.01), (x, Y - 0.052, low - 0.03)], 0.0015, cream, 4))
    blind.append(kit.rod('blind_pull', [(w1 - 0.1, Y - 0.06, wh + 0.01), (w1 - 0.1, Y - 0.062, 1.3), (w1 - 0.09, Y - 0.06, 1.18)], 0.002, cream, 4))
    blind.append(kit.can('blind_toggle', 0.008, 1.14, 1.18, cream, (w1 - 0.09, Y - 0.06), 8, 0.004))
    parts += blind

    # --- the door: a glazed leaf on its hinge ------------------------------------------------------
    lw, y0 = d1 - d0 - 0.008, Y + 0.05
    leaf = [kit.block('stile', (0.1, 0.042, dh - 0.012), (x, y0, dh / 2), trim_up, 0.004) for x in (d0 + 0.054, d1 - 0.054)]
    for z, h in ((0.11, 0.2), (1.01, 0.12), (dh - 0.07, 0.12)):
        leaf.append(kit.block('rail', (lw - 0.2, 0.042, h), ((d0 + d1) / 2, y0, z), trim, 0.004))
    leaf.append(kit.block('door_panel', (lw - 0.2, 0.018, 0.75), ((d0 + d1) / 2, y0, 0.58), desk_side, 0.0))
    for sy in (-1, 1):
        leaf.append(kit.block('lock_plate', (0.045, 0.004, 0.2), (d1 - 0.06, y0 + sy * 0.023, 1.02), brass, 0.001))
        leaf.append(kit.rod('door_lever', [(d1 - 0.06, y0 + sy * 0.022, 1.05), (d1 - 0.06, y0 + sy * 0.065, 1.05), (d1 - 0.17, y0 + sy * 0.07, 1.045)], 0.009, brass, 8))
    for z in (0.25, 1.05, 1.85):
        leaf.append(kit.can('hinge', 0.009, z - 0.05, z + 0.05, brass, (d0 + 0.004, y0 - 0.026), 8))
    door = mk.join('door_office', leaf)
    a.node(door, (d0, y0, 0.0), 1.1)
    glass = kit.panel('door_glass', (d0 + 0.1, y0 + 0.014, 1.07), (lw - 0.19, 0, 0), V(dh - 0.13 - 1.07))
    glass.data.materials.append(rain)
    a.join_into(glass, door)
    a.anchor('seal', ((d0 + d1) / 2, y0 + 0.024, 1.5))
    a.anchor('stand_visitor', ((d0 + d1) / 2, Y - 1.0, 0.0), (0, 0, 180))

    # --- the desk, its chair and what stands on it ------------------------------------------------
    dx, dy, dz = DESK
    desk = [kit.block('desk_top', (1.6, 0.8, 0.04), (dx, dy, dz - 0.02), desk_wood, 0.006)]
    for sx in (-1, 1):
        px = dx + sx * 0.56
        desk.append(kit.block('pedestal', (0.42, 0.72, dz - 0.1), (px, dy, (dz - 0.1) / 2 + 0.06), desk_side, 0.004))
        desk.append(kit.block('plinth', (0.4, 0.7, 0.06), (px, dy, 0.03), trim, 0.0))
        for k, (z, h) in enumerate(((0.62, 0.13), (0.45, 0.17), (0.22, 0.25))):
            desk.append(kit.block('drawer', (0.37, 0.02, h), (px, dy - 0.365 - (0.012 if (sx, k) == (1, 1) else 0), z), desk_wood, 0.004))
            desk.append(kit.rod('drawer_pull', [(px - 0.05, dy - 0.378, z), (px - 0.04, dy - 0.4, z), (px + 0.04, dy - 0.4, z), (px + 0.05, dy - 0.378, z)], 0.005, brass, 6))
    desk.append(kit.block('modesty', (0.72, 0.02, 0.5), (dx, dy + 0.33, 0.47), desk_side, 0.0))
    desk.append(kit.block('desk_drawer', (0.68, 0.02, 0.08), (dx, dy - 0.365, 0.68), desk_wood, 0.004))
    wood_parts += desk
    cx, cy = dx + 0.03, dy - 0.78
    chair = [kit.block('seat', (0.46, 0.45, 0.035), (cx, cy, 0.455), desk_wood, 0.01),
             kit.block('seat_pad', (0.42, 0.41, 0.04), (cx, cy + 0.005, 0.49), leather, 0.016)]
    for sx in (-1, 1):
        chair.append(kit.rod('leg_front', [(cx + sx * 0.2, cy + 0.19, 0.44), (cx + sx * 0.21, cy + 0.2, 0.0)], [0.021, 0.015], desk_side, 8))
        chair.append(kit.rod('leg_back', [(cx + sx * 0.2, cy - 0.3, 0.99), (cx + sx * 0.2, cy - 0.21, 0.46), (cx + sx * 0.21, cy - 0.24, 0.0)], [0.017, 0.022, 0.015], desk_side, 8))
        chair.append(kit.rod('stretcher', [(cx + sx * 0.205, cy + 0.195, 0.18), (cx + sx * 0.205, cy - 0.225, 0.18)], 0.011, desk_side, 6))
        chair.append(kit.rod('arm', [(cx + sx * 0.2, cy - 0.245, 0.69), (cx + sx * 0.235, cy - 0.05, 0.69), (cx + sx * 0.225, cy + 0.14, 0.67), (cx + sx * 0.205, cy + 0.17, 0.46)],
                             [0.014, 0.017, 0.017, 0.013], desk_side, 8))
    for z, h in ((0.97, 0.07), (0.82, 0.045), (0.7, 0.045)):
        slat = kit.block('back_slat', (0.42, 0.018, h), (0, 0, 0), desk_wood, 0.005)
        mk.map_points(slat, lambda p: (p.x, p.y - 0.5 * p.x * p.x, p.z))
        chair.append(mk.transform(slat, (cx, cy - 0.215 - (z - 0.46) * 0.17 + 0.02, z), (-9, 0, 0)))
    chair.append(kit.rod('stretcher_x', [(cx - 0.205, cy - 0.02, 0.18), (cx + 0.205, cy - 0.02, 0.18)], 0.011, desk_side, 6))
    seat = mk.join('chair', chair)
    mk.transform(seat, (-cx, -cy, 0))
    mk.transform(seat, (cx, cy, 0), (0, 0, -14))
    a.add(seat, 1.25)
    a.anchor('seat', (cx, cy, 0.52))
    a.anchor('letter', (dx - 0.02, dy - 0.14, dz + 0.001))
    a.anchor('phone', (dx + 0.42, dy - 0.02, dz + 0.001), (0, 0, -18))

    lx, ly = dx - 0.55, dy + 0.2
    lamp = [kit.can('lamp_base', 0.085, dz, dz + 0.018, enamel, (lx, ly), 20, 0.07),
            kit.rod('lamp_stem', [(lx, ly, dz + 0.015), (lx, ly, dz + 0.3), (lx + 0.03, ly - 0.02, dz + 0.4), (lx + 0.13, ly - 0.08, dz + 0.46), (lx + 0.21, ly - 0.13, dz + 0.44)], 0.008, brass, 8),
            kit.rod('lamp_flex', [(lx - 0.07, ly + 0.02, dz + 0.008), (lx - 0.16, ly + 0.14, dz + 0.004), (lx - 0.12, ly + 0.36, dz + 0.004), (lx - 0.18, ly + 0.42, dz - 0.3)], 0.003, black, 5)]
    small += lamp
    sx_, sy_, sz_ = lx + 0.24, ly - 0.15, dz + 0.4
    shade = kit.zloft('lamp_desk', [(sz_ - 0.055, sx_, sy_, 0.2, 0.2, 2.0), (sz_ - 0.05, sx_, sy_, 0.204, 0.204, 2.0), (sz_ + 0.005, sx_, sy_, 0.15, 0.15, 2.0),
                                    (sz_ + 0.04, sx_, sy_, 0.075, 0.075, 2.0), (sz_ + 0.062, sx_, sy_, 0.04, 0.04, 2.0)], enamel, 20, False)
    mk.solidify(shade, 0.003)
    cap = kit.can('lamp_cap', 0.02, sz_ + 0.06, sz_ + 0.066, enamel, (sx_, sy_), 12)
    shade = mk.join('lamp_desk', [shade, cap])
    a.node(shade, (sx_, sy_, sz_), 1.2)
    glow = sf.lamp('lamp_desk', '#ffd9a0', 6.0)
    bulb = kit.zloft('lamp_bulb', [(sz_ - 0.052, sx_, sy_, 0.19, 0.19, 2.0), (sz_ - 0.02, sx_, sy_, 0.17, 0.17, 2.0), (sz_ + 0.0, sx_, sy_, 0.12, 0.12, 2.0)], glow, 16, True)
    a.join_into(bulb, shade)
    a.extra('lamp_desk_bulb', [round(sx_, 3), round(sz_ - 0.03, 3), round(-sy_, 3)])

    # desk clutter: ledger, papers, mug, pen pot, ashtray with a tow hook as a paperweight
    small.append(kit.block('ledger', (0.24, 0.32, 0.03), (dx - 0.36, dy - 0.12, dz + 0.015), sf.coated('ledger_cloth', '#3a2025', 0.8, 0.0, 0.5), 0.004, (0, 0, 12)))
    small.append(kit.block('ledger_pages', (0.225, 0.305, 0.022), (dx - 0.357, dy - 0.117, dz + 0.016), cream, 0.0, (0, 0, 12)))
    for k, (title, px_, py_, turn) in enumerate((('INVOICE', dx + 0.3, dy + 0.2, -8), ('TOW LOG', dx + 0.56, dy + 0.22, 14), ('OVERDUE', dx + 0.34, dy + 0.19, 5))):
        c, s = math.cos(math.radians(turn)), math.sin(math.radians(turn))
        u, v = (0.21 * c, 0.21 * s, 0), (-0.297 * s, 0.297 * c, 0)
        a.add(kit.printed_panel('paper%d' % k, paint.papers(work_dir, str(k), 30 + k, title), (px_ - 0.5 * (u[0] + v[0]), py_ - 0.5 * (u[1] + v[1]), dz + 0.002 + 0.0012 * k), u, v), 1.6)
    small.append(kit.can('mug', 0.04, dz, dz + 0.09, sf.coated('mug_glaze', '#c9c3b0', 0.25, 0.0, 0.5), (dx + 0.62, dy - 0.2), 14))
    small.append(kit.can('mug_coffee', 0.034, dz + 0.086, dz + 0.0915, sf.plain('coffee', '#1c120b', 0.2), (dx + 0.62, dy - 0.2), 12))
    small.append(kit.rod('mug_handle', [(dx + 0.655, dy - 0.2, dz + 0.07), (dx + 0.685, dy - 0.2, dz + 0.06), (dx + 0.685, dy - 0.2, dz + 0.03), (dx + 0.655, dy - 0.2, dz + 0.02)], 0.006,
                         sf.coated('mug_glaze2', '#c9c3b0', 0.25, 0.0, 0.5), 6))
    small.append(kit.can('pen_pot', 0.038, dz, dz + 0.1, dark_steel, (dx - 0.1, dy + 0.3), 12))
    for k in range(4):
        small.append(kit.rod('pen', [(dx - 0.1 + 0.012 * math.cos(k * 1.7), dy + 0.3 + 0.012 * math.sin(k * 1.7), dz + 0.02),
                                     (dx - 0.1 + 0.035 * math.cos(k * 1.7), dy + 0.3 + 0.035 * math.sin(k * 1.7), dz + 0.17)], 0.004, (red, black, brass, steel)[k], 6))
    small.append(kit.can('ashtray', 0.06, dz, dz + 0.022, sf.coated('ashtray_glass', '#4d3d22', 0.15, 0.0, 0.3), (dx + 0.1, dy + 0.3), 14, 0.07))
    small.append(kit.rod('tow_hook', [(dx + 0.68, dy + 0.05, dz + 0.012), (dx + 0.62, dy + 0.06, dz + 0.012), (dx + 0.58, dy + 0.02, dz + 0.012), (dx + 0.6, dy - 0.03, dz + 0.012),
                                      (dx + 0.65, dy - 0.03, dz + 0.012)], [0.012, 0.012, 0.011, 0.009, 0.006], steel, 8))

    # --- back wall: shelves with tins and boxes, clock, pegboard of tools, filing cabinet ---------
    s0, s1, sd, sh = -3.3, -1.7, 0.4, 1.95
    for x in (s0, s1):
        for y in (-Y + 0.03, -Y + sd):
            parts.append(kit.block('shelf_post', (0.035, 0.035, sh), (x, y, sh / 2), dark_steel, 0.0))
    levels = (0.12, 0.58, 1.02, 1.46, 1.9)
    for z in levels:
        parts.append(kit.block('shelf', (s1 - s0 + 0.03, sd, 0.025), ((s0 + s1) / 2, -Y + sd / 2 + 0.01, z), dark_steel, 0.003))
    yf = -Y + sd - 0.06

    def tin(x, z, colour, name, lines, mark, w=0.17, h=0.26, d=0.11, turn=0):
        body = kit.block('tin_' + name, (w, d, h), (x, yf - d / 2, z + h / 2), sf.coated('tin_' + name, colour, 0.35, 0.6, 0.5), 0.008)
        parts.append(body)
        parts.append(kit.can('tin_cap', 0.018, z + h, z + h + 0.02, black, (x + w * 0.28, yf - d / 2), 8))
        parts.append(kit.rod('tin_grip', [(x - w * 0.3, yf - d / 2, z + h), (x - w * 0.25, yf - d / 2, z + h + 0.025), (x + 0.0, yf - d / 2, z + h + 0.025), (x + 0.03, yf - d / 2, z + h)], 0.004, steel, 5))
        back = tuple(int(colour[i:i + 2], 16) for i in (1, 3, 5))
        image = paint.label(work_dir, name, (256, 320), lines[0][4] if len(lines[0]) > 4 else (232, 224, 200), [l[:4] + (l[5],) for l in lines], mark)
        a.add(kit.printed_panel('label_' + name + str(int(x * 100)), image, (x + w * 0.44, yf + 0.0008, z + h * 0.1), (-w * 0.88, 0, 0), V(h * 0.8), roughness=0.45, metallic=0.2), 3.2)

    cream_l, ink = (232, 224, 200), (26, 30, 34)
    orca = [('ORCA', 'narrow_bold', 76, (20, 40, 80), cream_l, 0.58), ('MOTOR OIL', 'sans_bold', 30, (20, 40, 80), cream_l, 0.75), ('20W-50 · 5 L', 'sans_bold', 24, (160, 30, 30), cream_l, 0.88)]
    faro = [('FARO', 'narrow_bold', 76, (150, 30, 26), (236, 206, 110), 0.58), ('GEAR OIL', 'sans_bold', 32, (40, 30, 20), (236, 206, 110), 0.75), ('EP 90 · 5 L', 'sans_bold', 24, (40, 30, 20), (236, 206, 110), 0.88)]
    linga = [('LINGA', 'narrow_bold', 66, (232, 226, 206), (36, 70, 56), 0.58), ('BRAKE FLUID', 'sans_bold', 26, (232, 226, 206), (36, 70, 56), 0.75), ('DOT 4', 'sans_bold', 26, (236, 190, 70), (36, 70, 56), 0.88)]
    tin(-3.12, levels[2] + 0.0125, '#1f3a66', 'orca', orca, ('drop', (20, 40, 80)))
    tin(-2.92, levels[2] + 0.0125, '#1f3a66', 'orca', orca, ('drop', (20, 40, 80)))
    tin(-2.66, levels[2] + 0.0125, '#b08a2c', 'faro', faro, ('peak', (150, 30, 26)))
    tin(-2.2, levels[3] + 0.0125, '#27503e', 'linga', linga, ('gear', (236, 190, 70)), 0.12, 0.19, 0.08)
    tin(-2.05, levels[3] + 0.0125, '#27503e', 'linga', linga, ('gear', (236, 190, 70)), 0.12, 0.19, 0.08)
    tin(-1.9, levels[1] + 0.0125, '#b08a2c', 'faro', faro, ('peak', (150, 30, 26)))

    def box(x, z, w, h, d, name, lines, back, mark=None):
        parts.append(kit.block('box_' + name, (w, d, h), (x, yf - d / 2 + 0.01, z + h / 2), card, 0.003))
        image = paint.label(work_dir, name, (320, 200), back, lines, mark)
        lw_, lh_ = min(w * 0.8, 0.2), min(h * 0.7, 0.125)
        a.add(kit.printed_panel('label_' + name + str(int(x * 100)), image, (x + lw_ / 2, yf + 0.0108, z + h * 0.5 - lw_ * 0.3125), (-lw_, 0, 0), V(lw_ * 0.625), roughness=0.7), 3.2)

    ferragut = [('FERRAGUT', 'narrow_bold', 60, (150, 36, 30), 0.3), ('AUTOPARTES', 'sans_bold', 28, (30, 30, 34), 0.56), ('OIL FILTER  F-417', 'sans_bold', 24, (30, 30, 34), 0.8)]
    vela = [('VELA', 'narrow_bold', 72, (236, 230, 210), 0.32), ('BUJÍAS · SPARK PLUGS', 'sans_bold', 23, (236, 230, 210), 0.62), ('SET OF 4', 'sans_bold', 24, (240, 200, 90), 0.82)]
    brisa = [('BRISA', 'narrow_bold', 70, (24, 60, 110), 0.32), ('WIPER BLADES', 'sans_bold', 28, (24, 60, 110), 0.6), ('18 in · PAIR', 'sans', 24, (30, 30, 34), 0.82)]
    for i in range(3):
        box(-3.1 + i * 0.26, levels[1] + 0.0125, 0.24, 0.16, 0.26, 'ferragut', ferragut, (232, 224, 200))
    box(-3.1, levels[1] + 0.1725, 0.24, 0.16, 0.26, 'ferragut', ferragut, (232, 224, 200))
    for i in range(4):
        box(-3.14 + i * 0.17, levels[3] + 0.0125, 0.16, 0.11, 0.2, 'vela', vela, (150, 36, 30))
    box(-3.05, levels[3] + 0.1225, 0.16, 0.11, 0.2, 'vela', vela, (150, 36, 30))
    box(-2.3, levels[2] + 0.0125, 0.5, 0.1, 0.14, 'brisa', brisa, (226, 222, 204))
    box(-2.3, levels[2] + 0.1125, 0.5, 0.1, 0.14, 'brisa', brisa, (226, 222, 204))
    box(-2.6, levels[0] + 0.0125, 0.42, 0.3, 0.3, 'ferragut', ferragut, (232, 224, 200))
    for i in range(3):
        parts.append(kit.can('oil_can', 0.052, levels[4] + 0.0125, levels[4] + 0.16, (red, cabinet, red)[i], (-3.1 + i * 0.13, yf - 0.08), 12))
    parts.append(kit.block('battery', (0.26, 0.17, 0.2), (-2.0, yf - 0.1, levels[0] + 0.1125), black, 0.008))
    for sxx in (-1, 1):
        parts.append(kit.can('battery_post', 0.01, levels[0] + 0.21, levels[0] + 0.235, steel, (-2.0 + sxx * 0.09, yf - 0.1), 8))
    parts.append(kit.block('jack_box', (0.5, 0.26, 0.2), (-2.2, yf - 0.14, levels[4] + 0.1125), red, 0.01))
    parts.append(kit.rod('jump_red', [(-2.7 + 0.13 * math.cos(t), yf - 0.15 + 0.11 * math.sin(t), levels[4] + 0.03 + 0.004 * k) for k, t in enumerate([i * 0.7 for i in range(22)])], 0.009, red, 5))
    tyre = kit.rod('tyre', [(0.24 * math.cos(t), 0, 0.24 * math.sin(t)) for t in [2 * math.pi * k / 20 for k in range(21)]], 0.095, rubber, 10)
    parts.append(mk.transform(tyre, (-1.3, -Y + 0.2, 0.335), (-14, 0, 0)))
    tyre2 = kit.rod('tyre2', [(0.24 * math.cos(t), 0, 0.24 * math.sin(t)) for t in [2 * math.pi * k / 20 for k in range(21)]], 0.095, rubber, 10)
    parts.append(mk.transform(tyre2, (-1.18, -Y + 0.42, 0.335), (-20, 0, 8)))

    origin, u, v = on_wall('S', -0.55, 2.42, 0.3, 0.3, 0.052)
    parts.append(mk.transform(kit.can('clock_case', 0.17, 0, 0.05, black, (0, 0), 24), (-0.55, -Y, 2.42), (-90, 0, 0)))
    a.add(kit.printed_panel('clock_face', paint.clock_face(work_dir), origin, u, v, roughness=0.3), 2.2)

    p0, p1, pz0, pz1 = 0.15, 2.65, 1.02, 2.2
    board = sf.coated('pegboard', '#8a6f48', 0.75, 0.0, 0.5, panels=(0.05, 0.05), projection='front')
    parts.append(kit.block('pegboard', (p1 - p0, 0.012, pz1 - pz0), ((p0 + p1) / 2, -Y + 0.02, (pz0 + pz1) / 2), board, 0.0))
    for x0, x1, z0, z1 in ((p0, p1, pz1, pz1 + 0.04), (p0, p1, pz0 - 0.04, pz0)):
        wood_parts.append(kit.block('peg_frame', (x1 - x0 + 0.08, 0.03, z1 - z0), ((x0 + x1) / 2, -Y + 0.02, (z0 + z1) / 2), trim, 0.004))
    for x in (p0 - 0.02, p1 + 0.02):
        wood_parts.append(kit.block('peg_frame_side', (0.04, 0.03, pz1 - pz0), (x, -Y + 0.02, (pz0 + pz1) / 2), trim_up, 0.004))
    ty = -Y + 0.04
    handle_red = sf.coated('tool_handle', '#7c2a1e', 0.45, 0.0, 0.5)
    ash = kit.wood('ash_handle', '#a8824e', 'Z', 0.5, 0.5)
    for i in range(7):
        x, length, r = 0.34 + i * 0.105, 0.3 - i * 0.026, 0.021 - i * 0.0014
        top = 2.08
        parts.append(kit.block('spanner', (0.014 - i * 0.0005, 0.005, length), (x, ty, top - length / 2), steel, 0.002))
        ring = kit.can('spanner_ring', r, 0, 0.007, steel, (0, 0), 10)
        parts.append(mk.transform(ring, (x, ty + 0.0035, top), (90, 0, 0)))
        jaw = kit.block('spanner_jaw', (r * 2.1, 0.006, r * 1.5), (x, ty, top - length), steel, 0.002, (0, 18, 0))
        parts.append(jaw)
        parts.append(kit.rod('peg', [(x, -Y + 0.02, top + 0.002), (x, ty + 0.03, top + 0.008)], 0.0025, steel, 4))
    parts.append(kit.rod('hammer_handle', [(1.3, ty + 0.01, 2.05), (1.3, ty + 0.01, 1.72)], [0.013, 0.016], ash, 8))
    parts.append(kit.block('hammer_head', (0.115, 0.032, 0.034), (1.305, ty + 0.01, 2.06), steel, 0.007))
    parts.append(kit.rod('mallet_handle', [(1.48, ty + 0.01, 2.05), (1.48, ty + 0.01, 1.74)], 0.014, ash, 8))
    parts.append(mk.transform(kit.can('mallet_head', 0.032, -0.06, 0.06, rubber, (0, 0), 12), (1.48, ty + 0.012, 2.07), (0, 90, 0)))
    for i in range(5):
        x = 1.7 + i * 0.075
        parts.append(kit.can('driver_handle', 0.014, 2.0, 2.1, handle_red if i % 2 == 0 else black, (x, ty + 0.012), 8, 0.011))
        parts.append(kit.rod('driver_shaft', [(x, ty + 0.012, 2.0), (x, ty + 0.012, 1.86 - 0.02 * i)], 0.0035, steel, 5))
    parts.append(kit.block('driver_rack', (0.4, 0.03, 0.012), (1.85, ty + 0.012, 1.995), trim, 0.002))
    saw = [(2.2, ty, 2.06), (2.5, ty, 2.06), (2.5, ty, 1.95)]
    parts.append(kit.rod('saw_frame', [(2.2, ty, 1.95)] + saw, 0.006, steel, 6))
    parts.append(kit.block('saw_blade', (0.3, 0.002, 0.014), (2.35, ty, 1.95), steel, 0.0))
    parts.append(kit.block('saw_grip', (0.03, 0.022, 0.12), (2.19, ty, 1.97), handle_red, 0.008, (0, -12, 0)))
    for i, x in enumerate((0.36, 0.56)):
        for sgn in (-1, 1):
            parts.append(kit.rod('pliers', [(x + sgn * 0.004, ty, 1.62), (x - sgn * 0.004, ty, 1.55), (x - sgn * (0.022 + 0.004 * i), ty + 0.003, 1.42)], [0.006, 0.007, 0.006], steel if sgn > 0 else handle_red, 6))
    parts.append(kit.rod('tow_chain', [(0.86 + 0.085 * math.cos(t), ty + 0.006 + 0.002 * k, 1.5 + 0.11 * math.sin(t)) for k, t in enumerate([i * 0.55 for i in range(26)])], 0.008, dark_steel, 5))
    parts.append(kit.rod('jump_black', [(1.2 + 0.1 * math.cos(t), ty + 0.006 + 0.0025 * k, 1.47 + 0.12 * math.sin(t)) for k, t in enumerate([i * 0.6 for i in range(24)])], 0.007, black, 5))
    parts.append(kit.block('square', (0.3, 0.003, 0.035), (1.72, ty, 1.36), steel, 0.0))
    parts.append(kit.block('square_arm', (0.035, 0.003, 0.2), (1.5875, ty, 1.4425), steel, 0.0))
    for k, x in enumerate((2.0, 2.14, 2.28, 2.42)):
        parts.append(mk.transform(kit.can('socket', 0.016 + 0.003 * k, 0, 0.05, steel, (0, 0), 10), (x, ty + 0.03, 1.5), (90, 0, 0)))
    parts.append(kit.block('socket_rail', (0.56, 0.012, 0.02), (2.2, ty, 1.5), dark_steel, 0.0))
    parts.append(kit.rod('wheel_brace', [(2.05, ty + 0.01, 1.22), (2.45, ty + 0.01, 1.22)], 0.011, steel, 6))
    parts.append(kit.rod('wheel_brace_x', [(2.25, ty + 0.012, 1.4), (2.25, ty + 0.012, 1.08)], 0.011, steel, 6))

    fx, fy = 3.2, -Y + 0.33
    parts.append(kit.block('filing_cabinet', (0.47, 0.62, 1.32), (fx, fy, 0.66), cabinet, 0.008))
    for k in range(4):
        z = 0.19 + k * 0.315
        out = 0.05 if k == 2 else 0.0
        parts.append(kit.block('file_drawer', (0.43, 0.02, 0.29), (fx, fy + 0.315 + out, z), cabinet, 0.004))
        parts.append(kit.rod('file_pull', [(fx - 0.06, fy + 0.325 + out, z + 0.03), (fx - 0.05, fy + 0.35 + out, z + 0.03), (fx + 0.05, fy + 0.35 + out, z + 0.03), (fx + 0.06, fy + 0.325 + out, z + 0.03)], 0.005, steel, 6))
        parts.append(kit.block('file_tag', (0.09, 0.003, 0.035), (fx, fy + 0.327 + out, z + 0.09), cream, 0.0))
    parts.append(kit.block('cabinet_box', (0.36, 0.28, 0.22), (fx - 0.02, fy - 0.05, 1.43), card, 0.004, (0, 0, 9)))
    parts.append(kit.block('cabinet_files', (0.3, 0.22, 0.05), (fx, fy - 0.03, 1.565), cream, 0.003, (0, 0, -6)))

    # --- the other walls: calendar and the photograph's nail, key rack, sign, coat hook ------------
    origin, u, v = on_wall('E', 1.45, 1.55, 0.3, 0.44, 0.006)
    a.add(kit.printed_panel('calendar', paint.calendar(work_dir), origin, u, v, 1, 4, lambda s, t: 0.004 * (1 - t) ** 2, roughness=0.6), 2.4)
    parts.append(kit.rod('calendar_nail', [(X, 1.45, 1.79), (X - 0.014, 1.45, 1.792)], 0.002, steel, 4))
    parts.append(kit.rod('photo_nail', [(X, -0.6, 1.75), (X - 0.016, -0.6, 1.753)], 0.002, steel, 4))
    a.anchor('photo', (X - 0.004, -0.6, 1.6), (0, 0, 90))

    kx, kz = -1.0, 1.5
    wood_parts.append(kit.block('key_board', (0.62, 0.018, 0.3), (kx, Y - 0.009, kz), desk_wood, 0.004))
    tags = [sf.plain('key_tag_%d' % i, c, 0.5) for i, c in enumerate(('#b0281e', '#d9b23a', '#2b5a8a', '#d8d2bc'))]
    for row in range(2):
        for col in range(5):
            x, z = kx - 0.24 + col * 0.12, kz + 0.09 - row * 0.14
            small.append(kit.rod('key_hook', [(x, Y - 0.018, z), (x, Y - 0.04, z - 0.004), (x, Y - 0.044, z + 0.012)], 0.002, brass, 4))
            if (row * 5 + col) % 4 != 3:
                swing = 0.006 * math.sin(col * 2.0 + row)
                small.append(kit.block('key_blade', (0.011, 0.002, 0.05), (x + swing, Y - 0.04, z - 0.032), steel, 0.0, (0, 6 * math.sin(col * 1.3), 0)))
                small.append(kit.block('key_tag', (0.028, 0.003, 0.05), (x + swing + 0.012, Y - 0.045, z - 0.05), tags[(row + col) % 4], 0.002, (0, -14 + 9 * col, 0)))

    origin, u, v = on_wall('W', 0.7, 2.05, 1.2, 0.45, 0.012)
    parts.append(kit.block('sign_plate', (0.01, 1.2, 0.45), (-X + 0.006, 0.7, 2.05), dark_steel, 0.0))
    a.add(kit.printed_panel('sign', paint.sign(work_dir), origin, u, v, roughness=0.3, metallic=0.2, bump=0.06), 2.2)
    hy, hz = -0.8, 1.9
    wood_parts.append(kit.block('hook_board', (0.02, 0.5, 0.09), (-X + 0.01, hy, hz + 0.02), desk_wood, 0.004))
    for off in (-0.17, 0.0, 0.17):
        small.append(kit.rod('coat_hook', [(-X + 0.02, hy + off, hz + 0.03), (-X + 0.06, hy + off, hz + 0.022), (-X + 0.075, hy + off, hz + 0.0), (-X + 0.06, hy + off, hz - 0.012),
                                           (-X + 0.045, hy + off, hz + 0.0)], 0.005, brass, 6))
    a.anchor('hanger', (-X + 0.06, hy, hz - 0.007), (0, 0, -90))

    # --- ceiling batten (dead tube), switch, floor things -------------------------------------------
    parts.append(kit.block('batten', (1.3, 0.12, 0.06), (0.3, 0.0, Z - 0.03), cream, 0.008))
    for sy in (-1, 1):
        parts.append(kit.rod('tube', [(-0.3, sy * 0.03, Z - 0.075), (0.9, sy * 0.03, Z - 0.075)], 0.014, sf.coated('dead_tube', '#bdbcb0', 0.3, 0.0, 0.5), 8))
    parts.append(kit.rod('conduit', [(0.3, 0.0, Z - 0.012), (0.3, Y - 0.012, Z - 0.012), (-1.55, Y - 0.012, Z - 0.012), (-1.55, Y - 0.012, 1.32)], 0.009, cream, 6))
    parts.append(kit.block('switch', (0.085, 0.03, 0.085), (-1.55, Y - 0.015, 1.3), cream, 0.006))
    parts.append(kit.block('switch_dolly', (0.012, 0.012, 0.03), (-1.55, Y - 0.034, 1.3), black, 0.003, (20, 0, 0)))
    parts.append(mk.solidify(kit.zloft('bin', [(0.0, 0.75, -0.75, 0.22, 0.22, 2.0), (0.3, 0.75, -0.75, 0.28, 0.28, 2.0)], dark_steel, 14, False), 0.004))
    parts.append(kit.can('bin_floor', 0.11, 0.0, 0.004, dark_steel, (0.75, -0.75), 14))
    for k in range(3):
        parts.append(kit.block('bin_paper', (0.12, 0.1, 0.07), (0.75 + 0.03 * (k - 1), -0.75 + 0.03 * math.sin(k * 2), 0.2 + 0.045 * k), cream, 0.02, (20 * k, 30 * k, 50 * k)))
    parts.append(kit.block('door_mat', (0.8, 0.5, 0.012), ((d0 + d1) / 2, Y - 0.35, 0.006), sf.coated('mat_coir', '#4a3a26', 0.95, 0.0, 0.6, grain=0.1), 0.003))
    parts.append(kit.block('floor_box', (0.5, 0.4, 0.34), (-3.1, 0.9, 0.17), card, 0.004, (0, 0, 12)))
    parts.append(kit.block('floor_box2', (0.4, 0.34, 0.26), (-3.08, 0.86, 0.47), card, 0.004, (0, 0, -8)))
    parts.append(kit.block('heater', (0.5, 0.16, 0.42), (2.9, Y - 0.14, 0.27), cream, 0.012))
    for k in range(9):
        parts.append(kit.block('heater_fin', (0.012, 0.012, 0.34), (2.7 + k * 0.05, Y - 0.224, 0.27), dark_steel, 0.0))
    for sxx in (-1, 1):
        parts.append(kit.block('heater_foot', (0.03, 0.2, 0.06), (2.9 + sxx * 0.2, Y - 0.14, 0.03), black, 0.0))

    a.add_all(wood_parts, 1.0)
    a.add_all(parts, 1.15)
    a.add_all(small, 1.4)
    a.extra('inner_size', [2 * X, Z, 2 * Y])
    a.extra('door_swing', {'axis': 'z', 'degrees': -95})
