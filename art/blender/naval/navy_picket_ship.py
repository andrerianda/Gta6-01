"""Picket corvette of the invented Armada de Marazul (an original design): 82 m long, 11 m beam,
3 m draught, a raked bow with a cut-away forefoot, a long forecastle with one small gun, a two-deck
house with a bridge, an enclosed pyramid mast carrying the search radar, a raked funnel, two boats,
a low after house with a small mount and an open after deck with a landing circle. Ship grey over a
black boot-topping and red-brown bottom paint. No lettering, no pennant.

Origin on the waterline amidships, bow towards +Y here (the game's -Z), port is -X. The radar is
the node `antenna` (origin on its vertical axis, 24 m above the water): turn it about the vertical.
lod0 is the hull and the big blocks, detail_lod0 the fittings, rails_lod0 the guard rails (cutout);
lod1 and lod2 are single meshes without the rails (lod2 only hull and blocks).
"""
import math

import _naval_parts as np_
from lib import meshkit as mk
from lib import surfaces as sf

ASSET = {'id': 'navy_picket_ship', 'atlas': 1024, 'kind': 'vehicle', 'views': ((38, 20, 1.25), (215, 40, 1.25))}

# Hull stations: y, half beam at the deck edge, half beam at the waterline, deck height, keel depth, bow rake.
STATIONS = [
    (-40.0, 4.9, 4.5, 3.6, -1.0, 0.0), (-34.0, 5.3, 5.0, 3.6, -2.3, 0.0), (-24.0, 5.5, 5.3, 3.65, -3.0, 0.0),
    (-10.0, 5.5, 5.4, 3.9, -3.0, 0.0), (5.0, 5.5, 5.3, 4.4, -3.0, 0.0), (18.0, 5.0, 4.5, 5.1, -3.0, 0.2),
    (28.0, 3.8, 2.9, 5.7, -2.9, 0.8), (35.0, 2.3, 1.3, 6.2, -2.6, 2.2), (39.0, 1.1, 0.45, 6.5, -2.0, 3.6),
    (42.0, 0.1, 0.05, 6.8, -0.5, 5.0),
]


def _spline(rows, steps):
    """Catmull-Rom through the station rows: `steps` rows per span, the last one included."""
    out = []
    for i in range(len(rows) - 1):
        p0, p1, p2, p3 = rows[max(i - 1, 0)], rows[i], rows[i + 1], rows[min(i + 2, len(rows) - 1)]
        for s in range(steps):
            t = s / steps
            out.append(tuple(0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t ** 3)
                             for a, b, c, d in zip(p0, p1, p2, p3)))
    out.append(rows[-1])
    return out


def deck_height(y):
    for a, b in zip(STATIONS, STATIONS[1:]):
        if a[0] <= y <= b[0]:
            return a[3] + (b[3] - a[3]) * (y - a[0]) / (b[0] - a[0])
    return STATIONS[0][3]


def hull_ring(station):
    y, deck, water, top, keel, rake = station
    deck, water = max(deck, 0.05), max(water, 0.03)
    half = [(deck, top), (water + (deck - water) * 0.5, top * 0.5), (water, 0.35), (water * 0.96, -0.5), (water * 0.7, keel * 0.82)]
    points = half + [(0.0, keel)] + [(-x, z) for x, z in reversed(half)]
    return [(x, y - rake * (top - z) / (top - keel), z) for x, z in points]


def sphere(name, radius, centre, material, count=12):
    stations = [{'y': centre[1] + radius * math.cos(math.pi * i / 6), 'w': 2 * radius * max(math.sin(math.pi * i / 6), 0.02),
                 'h': 2 * radius * max(math.sin(math.pi * i / 6), 0.02), 'z': centre[2], 'x': centre[0]} for i in range(7)]
    return mk.assign(mk.fuselage(name, stations, count), material)


def make(a, work_dir):
    grey = np_.matt('hull_grey', '#7c858b', 0.6, 0.4, 0.0, (4.0, 1.6), 'side')
    house = np_.matt('house_grey', '#899196', 0.6, 0.35, 0.0, (3.0, 2.5), 'side')
    deck = np_.ring_marked('deck', '#4d5458', '#c4c8c0', (0.0, -31.0, 3.6), 4.2, 0.4)
    boot = sf.plain('boot_topping', '#191b1d', 0.7)
    bottom = np_.matt('bottom_paint', '#4c2b26', 0.8, 0.5)
    dark = np_.matt('dark_metal', '#23262a', 0.6, 0.4, 0.5)
    window = sf.plain('bridge_window', '#0c1216', 0.12)
    pale = np_.matt('raft_white', '#c6c9c4', 0.6, 0.3)
    boat_mat = np_.matt('boat_dark', '#2c3034', 0.75, 0.4)
    red = sf.lamp('lamp_nav_red', '#ff2a1a', 4.0)
    green = sf.lamp('lamp_nav_green', '#2bff6a', 4.0)
    white = sf.lamp('lamp_mast', '#fff6e0', 5.0)

    # --- hull and deck: one closed loft, the deck is the strip that closes each ring -------------
    rows = _spline(STATIONS, 2)
    hull = mk.loft('hull', [hull_ring(r) for r in rows])
    mk.assign(hull, grey)
    mk.assign_faces(hull, boot, lambda c, n: c.z < 0.36 and n.z < 0.8)
    mk.assign_faces(hull, bottom, lambda c, n: c.z < -0.3)
    mk.assign_faces(hull, deck, lambda c, n: n.z > 0.8 and c.z > 1.0)
    mk.shade(hull, 35)

    # --- the big blocks ---------------------------------------------------------------------------
    blocks = [
        np_.frustum('after_house', (8.4, 8.0), (7.6, 7.0), 3.4, 6.4, (0, -20.0)),
        np_.frustum('mid_house', (9.2, 20.0), (8.6, 19.6), 3.5, 7.0, (0, -6.0)),
        np_.frustum('fore_house', (9.4, 17.0), (8.6, 15.8), 4.0, 8.0, (0, 12.5), (0, -0.6)),
        np_.frustum('bridge_wall', (8.8, 10.0), (8.6, 9.6), 8.0, 9.2, (0, 14.0), (0, -0.2)),
        np_.frustum('mast', (3.4, 4.2), (1.5, 1.8), 10.4, 21.5, (0, 10.5), (0, -1.0)),
        np_.frustum('funnel', (4.2, 6.0), (3.0, 4.2), 7.0, 12.2, (0, -7.0), (0, -1.2)),
        np_.frustum('gun_house', (2.6, 3.6), (1.8, 2.4), 6.0, 7.7, (0, 28.0), (0, -0.3)),
    ]
    for block in blocks:
        mk.assign(block, house)
    band = mk.assign(mk.box('window_band', (8.5, 9.5, 0.95), (0, 13.8, 9.675)), window)
    roof = mk.assign(mk.box('bridge_roof', (9.0, 10.0, 0.25), (0, 13.9, 10.275)), house)
    main = [hull, band, roof] + blocks
    for part in main[1:]:
        mk.shade(part, 30)
    a.add(mk.join('lod0', main))

    # --- fittings ---------------------------------------------------------------------------------
    mullions = np_.boxes('mullions', house, [((0.22, 0.08, 0.95), (-3.4 + 1.133 * i, 18.56, 9.675)) for i in range(7)]
                         + [((0.08, 0.22, 0.95), (sx * 4.26, 9.6 + 1.5 * i, 9.675)) for sx in (-1, 1) for i in range(7)]
                         + [((8.5, 0.08, 0.95), (0, 9.02, 9.675))])
    wings = np_.boxes('bridge_wings', house, [((2.4, 3.2, 0.2), (sx * 5.3, 13.0, 8.1)) for sx in (-1, 1)]
                      + [((0.1, 3.2, 1.0), (sx * 6.45, 13.0, 8.7)) for sx in (-1, 1)]
                      + [((2.3, 0.1, 1.0), (sx * 5.3, 14.6, 8.7)) for sx in (-1, 1)])
    mast_bits = np_.boxes('mast_fittings', house, [((2.8, 2.8, 0.25), (0, 9.5, 21.6)), ((7.0, 0.22, 0.22), (0, 9.9, 18.4)),
                                                   ((0.5, 0.5, 0.7), (-3.3, 9.9, 18.85)), ((0.5, 0.5, 0.7), (3.3, 9.9, 18.85)),
                                                   ((0.3, 1.2, 0.3), (0, 11.0, 21.9)),
                                                   ((0.09, 0.09, 5.0), (-3.9, 9.6, 12.9), (0, -6, 0)), ((0.09, 0.09, 5.0), (3.9, 9.6, 12.9), (0, 6, 0)),
                                                   ((0.09, 0.09, 3.6), (-2.6, -15.2, 8.8)), ((0.09, 0.09, 3.6), (2.6, -15.2, 8.8)),
                                                   ((1.8, 0.16, 0.16), (0, 9.2, 15.2)), ((0.4, 0.4, 0.5), (0, 8.2, 15.2))])
    pedestal = mk.assign(mk.cylinder('radar_pedestal', 0.45, 1.5, (0, 9.5, 22.45), 'Z', 10, 0.32), dark)
    domes = [sphere('bridge_dome', 0.95, (0, 16.4, 11.5), pale), sphere('aft_dome', 0.75, (0, -13.6, 8.3), pale),
             mk.assign(mk.cylinder('dome_base', 0.6, 0.8, (0, 16.4, 10.75), 'Z', 10), house),
             mk.assign(mk.cylinder('aft_dome_base', 0.5, 0.9, (0, -13.6, 7.4), 'Z', 10), house)]
    funnel_top = np_.boxes('funnel_cap', dark, [((2.7, 3.9, 0.3), (0, -8.2, 12.3)), ((0.9, 0.9, 0.7), (0, -7.4, 12.7)),
                                                ((0.9, 0.9, 0.7), (0, -9.0, 12.7))])
    gun = [mk.assign(mk.cylinder('gun_ring', 1.7, 0.5, (0, 28.0, 5.85), 'Z', 16), dark),
           mk.assign(mk.tube('gun_barrel', [(0, 29.2, 7.0), (0, 31.2, 7.25), (0, 33.6, 7.55)], [0.2, 0.12, 0.09], 8), dark),
           np_.boxes('breakwater', house, [((4.2, 0.14, 0.75), (-1.9, 33.3, 6.25), (0, 0, 22)), ((4.2, 0.14, 0.75), (1.9, 33.3, 6.25), (0, 0, -22))]),
           mk.assign(mk.cylinder('capstan_l', 0.35, 0.6, (-1.0, 36.0, 6.55), 'Z', 8), dark),
           mk.assign(mk.cylinder('capstan_r', 0.35, 0.6, (1.0, 36.0, 6.55), 'Z', 8), dark)]
    mount = [mk.assign(mk.cylinder('aft_mount_ring', 1.0, 0.5, (0, -20.5, 6.6), 'Z', 12), dark),
             mk.assign(np_.frustum('aft_mount', (1.5, 1.7), (1.1, 1.2), 6.8, 8.0, (0, -20.5)), house),
             mk.assign(mk.tube('aft_barrel', [(0, -21.3, 7.5), (0, -23.2, 7.8)], [0.09, 0.06], 6), dark)]
    boats = []
    for sx in (-1, 1):
        stations = [{'y': -13.4, 'w': 1.5, 'h': 0.8, 'z': 7.75, 'x': sx * 3.35}, {'y': -12.6, 'w': 1.9, 'h': 1.0, 'z': 7.75, 'x': sx * 3.35},
                    {'y': -9.0, 'w': 1.9, 'h': 1.0, 'z': 7.75, 'x': sx * 3.35}, {'y': -7.9, 'w': 1.3, 'h': 0.8, 'z': 7.85, 'x': sx * 3.35},
                    {'y': -7.3, 'w': 0.3, 'h': 0.3, 'z': 7.95, 'x': sx * 3.35}]
        boats.append(mk.assign(mk.fuselage('boat', stations, 10), boat_mat))
        boats.append(np_.boxes('davits', dark, [((0.2, 0.2, 2.2), (sx * 4.1, y, 8.1)) for y in (-12.4, -8.6)]
                               + [((1.3, 0.16, 0.16), (sx * 3.55, y, 9.2)) for y in (-12.4, -8.6)]
                               + [((1.2, 0.3, 0.25), (sx * 3.35, y, 7.12)) for y in (-12.0, -9.0)]))
    rafts = [mk.assign(mk.cylinder('raft', 0.32, 1.25, (sx * 3.85, y, 7.4), 'Y', 8), pale) for sx in (-1, 1) for y in (-2.6, -0.9, 0.8)]
    deck_bits = np_.boxes('deck_fittings', dark, [((1.6, 1.6, 0.3), (0, 23.5, 5.6)), ((0.4, 0.4, 0.5), (-4.0, -36.5, 3.85)),
                                                  ((0.4, 0.4, 0.5), (4.0, -36.5, 3.85)), ((0.4, 0.4, 0.5), (-3.2, 22.0, 5.6)),
                                                  ((0.4, 0.4, 0.5), (3.2, 22.0, 5.6)), ((2.2, 1.2, 1.1), (0, -25.2, 4.2))])
    staff = mk.assign(mk.tube('ensign_staff', [(0, -39.6, 3.6), (0, -40.2, 7.2)], 0.05, 5), dark)
    lamps = [mk.assign(mk.box('nav_red', (0.3, 0.6, 0.45), (-6.6, 13.6, 8.8)), red),
             mk.assign(mk.box('nav_green', (0.3, 0.6, 0.45), (6.6, 13.6, 8.8)), green),
             np_.boxes('mast_lamps', white, [((0.45, 0.45, 0.45), (0, 11.5, 22.3)), ((0.4, 0.3, 0.4), (0, -40.1, 5.2))])]
    detail = [mullions, wings, mast_bits, pedestal, funnel_top, deck_bits, staff] + domes + gun + mount + boats + rafts + lamps
    for part in detail:
        mk.shade(part, 40)
    a.add(mk.join('detail_lod0', detail))

    # --- the search radar (turns about its origin's vertical axis) ----------------------------------
    dish = np_.boxes('antenna', dark, [((5.2, 0.16, 1.3), (0, 0.25, 0.1)), ((0.3, 0.5, 0.3), (0, -0.05, 0.0)),
                                       ((4.4, 0.1, 0.1), (0, 0.12, 0.55)), ((4.4, 0.1, 0.1), (0, 0.12, -0.35)),
                                       ((0.14, 1.0, 0.14), (0, 0.8, -0.5), (25, 0, 0))])
    hub = mk.assign(mk.cylinder('antenna_hub', 0.3, 0.9, (0, 0, -0.4), 'Z', 8), dark)
    antenna = mk.join('antenna', [dish, hub])
    mk.transform(antenna, (0, 9.5, 24.0))
    a.add(np_.pivot(antenna, (0, 9.5, 24.0)))

    # --- guard rails: a cutout strip along both deck edges and across the stern ---------------------
    rail_mat = np_.cutout_material('cutout_rail', np_.rail_texture(work_dir + '/rail.png'))
    edge = [r for r in _spline(STATIONS, 3) if r[0] < 38.5]
    strips = []
    for sx in (-1, 1):
        run, grid = 0.0, [[], []]
        lengths = [0.0]
        for p, q in zip(edge, edge[1:]):
            run += math.hypot(q[0] - p[0], q[1] - p[1])
            lengths.append(run)
        for r in edge:
            x = sx * max(r[1] - 0.12, 0.05)
            grid[0].append((x, r[0], r[3]))
            grid[1].append((x, r[0], r[3] + 1.1))
        strips.append(np_.uv_sheet('rail', grid, lambda row, column, p: (lengths[column] / 1.6, float(row))))
    stern = [[(-4.75, -39.95, 3.6), (4.75, -39.95, 3.6)], [(-4.75, -39.95, 4.7), (4.75, -39.95, 4.7)]]
    strips.append(np_.uv_sheet('rail_stern', stern, lambda row, column, p: (column * 6.0, float(row))))
    a.add(mk.assign(mk.join('rails_lod0', strips), rail_mat))

    # --- anchors, collision, levels -----------------------------------------------------------------
    a.anchor('light_nav_red', (-6.8, 13.6, 8.8))
    a.anchor('light_nav_green', (6.8, 13.6, 8.8))
    a.anchor('light_mast', (0, 11.8, 22.3))
    a.anchor('light_stern', (0, -40.3, 5.2), (0, 0, 180))
    a.anchor('wake_bow', (0, 37.0, 0.0))
    a.anchor('wake_stern', (0, -40.0, 0.0), (0, 0, 180))
    a.anchor('gun', (0, 28.0, 7.2))
    a.anchor('funnel', (0, -8.2, 13.1), (90, 0, 0))
    a.collider_box('hull', (11.0, 82.0, 9.6), (0, 1.0, 1.8))
    a.collider_box('superstructure', (9.4, 45.0, 6.9), (0, -1.5, 7.2))
    a.collider_box('mast', (3.4, 4.2, 13.0), (0, 10.0, 17.2))
    a.extra('antenna_height', 24.0)
    a.extra('waterline', 0.0)
    a.extra('draught', 3.0)
    a.level(1, [('lod0', 1.0), ('detail_lod0', 0.3)])
    a.level(2, [('lod0', 0.45)])
    a.distances(450.0, 1800.0)
