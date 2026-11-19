"""Manta Sombra: an original tailless flying-wing bomber, 46 m across and 19.6 m long, standing on
its gear with the origin on the ground under the centre of gravity.

Everything about its shape is straight lines. The planform is the six-cornered polygon OUTLINE
(mirrored): ONE straight leading edge per side from the nose apex to the wingtip, a tip cut
parallel to the opposite leading edge, and a trailing edge of three straight segments per side in a
pattern of our own: a constant-chord outer panel, a long inner edge running back to a tail point
behind each engine pair, and a V notch between the two tail points on the centreline. Every
trailing segment is parallel to one of the two leading edges.

The skin is not lofted through hand-placed sections: its height over the planform is one smooth
analytic function (skin_z). A smooth distance-to-the-outline field takes the thickness to zero at
every edge, so the whole perimeter is a knife edge lying in one plane, and smooth bumps on top of it
make the centre body, the low cockpit crest and the two engine humps, each melting into the wing
without a seam. The four window panes and the elevons are cells of the same grid, cut out.
Inside the crest is the two-seat glass cockpit: the game paints its four displays on the
`instrument_panel` quad. Nose to +Y, right wing to +X; layout numbers are the catalog's
(game/src/catalog/vehicleCatalog.js).
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

import _jet_parts as jp
from lib import meshkit as mk
from lib import surfaces as sf

ASSET = {'id': 'manta_sombra', 'atlas': 2048}

# --- the planform: straight lines only -------------------------------------------------------------
HALF_SPAN = 23.0
NOSE_Y = 10.0
SWEEP = 0.72                  # metres back per metre out: every edge runs at this slope, one way or the other
OUTER_CHORD = 3.6             # streamwise chord of the constant-chord outer panel
TAIL_X, TAIL_Y = 4.0, -9.6    # the tail point behind each engine pair
TIP_Y = NOSE_Y - SWEEP * HALF_SPAN
TIP_CUT_X = HALF_SPAN - OUTER_CHORD / (2 * SWEEP)
TIP_CUT_Y = TIP_Y - SWEEP * (HALF_SPAN - TIP_CUT_X)
NOTCH_Y = TAIL_Y + SWEEP * TAIL_X
KINK_X = (NOSE_Y - OUTER_CHORD - TAIL_Y + SWEEP * TAIL_X) / (2 * SWEEP)
KINK_Y = NOSE_Y - OUTER_CHORD - SWEEP * KINK_X
# Right half, clockwise from the nose: apex, wingtip, tip-cut corner, kink, tail point, centre notch.
OUTLINE = [(0.0, NOSE_Y), (HALF_SPAN, TIP_Y), (TIP_CUT_X, TIP_CUT_Y), (KINK_X, KINK_Y), (TAIL_X, TAIL_Y), (0.0, NOTCH_Y)]
ACROSS = 1.0 / math.sqrt(1.0 + SWEEP * SWEEP)   # streamwise distance to distance square to an edge

EDGE_PLANE = 2.72             # every edge of the aircraft lies at this height
FALL = 5.2                    # distance from an edge over which the skin reaches its full thickness
EYE = (-0.55, 6.3, 4.0)
FLOOR = 2.75
ELEVON = (13.6, 17.3)
HINGE_T = 0.73                # elevon hinge line as a share of the chord (parallel to the trailing edge)
RUDDER = (17.75, 20.2)
ENGINE_X = 4.0

# Grid lines of the skin: span stations and chord shares (window, elevon and outline corners lie on them).
STATIONS = [0.0, 0.14, 0.43, 0.72, 1.02, 1.16, 1.44, 1.72, 2.0, 2.3, 2.6, 2.9, 3.2, 3.5, 3.8, TAIL_X, 4.3, 4.6, 4.9, 5.2, 5.5,
            5.8, 6.2, 6.8, 7.6, 8.6, 9.8, 11.2, 12.2, KINK_X, ELEVON[0], 14.8, 16.0, ELEVON[1], 18.4, 19.5, TIP_CUT_X, 21.2,
            21.9, 22.5, HALF_SPAN]
UPPER_T = [0.0, 0.006, 0.015, 0.03, 0.05, 0.072, 0.095, 0.12, 0.15, 0.19, 0.23, 0.27, 0.30, 0.335, 0.37, 0.41, 0.47, 0.54,
           0.61, 0.67, 0.70, HINGE_T, 0.76, 0.79, 0.83, 0.875, 0.92, 0.955, 0.98, 0.993, 1.0]
LOWER_T = [0.0, 0.01, 0.04, 0.1, 0.2, 0.33, 0.48, 0.62, HINGE_T, 0.82, 0.9, 0.96, 0.99, 1.0]
# The four panes (two a side): (first station, last station, first chord share, last chord share).
PANES = [(0.14, 1.02, 0.095, 0.15), (1.16, 1.72, 0.12, 0.19)]


def leading(x):
    return NOSE_Y - SWEEP * abs(x)


def trailing(x):
    u = abs(x)
    if u <= TAIL_X:
        return NOTCH_Y - SWEEP * u
    if u <= KINK_X:
        return TAIL_Y + SWEEP * (u - TAIL_X)
    if u <= TIP_CUT_X:
        return NOSE_Y - OUTER_CHORD - SWEEP * u
    return TIP_Y - SWEEP * (HALF_SPAN - u)


def _both(*values):
    """Smooth 'inside all of these edges': near one edge it is the distance to it, zero outside any."""
    if min(values) <= 0.0:
        return 0.0
    return sum(v ** -4 for v in values) ** -0.25


def _either(a, b):
    """Smooth 'inside one of these regions' (the notches, where two convex pieces meet)."""
    return (max(a, 0.0) ** 4 + max(b, 0.0) ** 4) ** 0.25


def _behind(x, y):
    """Distance field of one side's trailing edge, valid over the whole plane (x signed for that side)."""
    notch = (y - (NOTCH_Y - SWEEP * x)) * ACROSS
    inner = (y - (TAIL_Y + SWEEP * (x - TAIL_X))) * ACROSS
    outer = (y - (NOSE_Y - OUTER_CHORD - SWEEP * x)) * ACROSS
    tip = (y - (TIP_Y - SWEEP * (HALF_SPAN - x))) * ACROSS
    return _either(_both(notch, inner), _both(outer, tip))


def edge_distance(x, y):
    """A smooth field that is zero on the outline and grows like the distance to the nearest edge."""
    right = (NOSE_Y - SWEEP * x - y) * ACROSS
    left = (NOSE_Y + SWEEP * x - y) * ACROSS
    return _both(right, left, _either(_behind(x, y), _behind(-x, y)))


def _ease(v):
    v = min(max(v, 0.0), 1.0)
    return v * v * v * (v * (6.0 * v - 15.0) + 10.0)


def _fill(x, y):
    """0 on the outline, 1 from FALL metres inside it; a finite slope at the edge makes the knife."""
    return 1.0 - (1.0 - min(edge_distance(x, y) / FALL, 1.0)) ** 3


def _upper(x, y):
    u = abs(x)
    body = 0.9 * math.exp(-(u / 4.4) ** 2) * (1.0 - 0.7 * _ease((3.0 - y) / 10.0))
    # The crest eases off as the skin behind the nose fills out, so the roofline is level and then falls away.
    crest = 0.83 * math.exp(-(u / 1.55) ** 4) * (1.0 - 0.3 * _ease((6.6 - y) / 2.6) - 0.7 * _ease((4.0 - y) / 8.5))
    swept = y + SWEEP * (u - ENGINE_X)            # the intake lip runs parallel to the leading edge
    engine = 0.32 * math.exp(-((u - ENGINE_X) / 1.5) ** 4) * _ease((2.3 - swept) / 1.5) * (1.0 - _ease((-4.8 - y) / 1.2))
    return 0.28 + body + crest + engine


def _lower(x, y):
    return 0.28 + 0.54 * math.exp(-(abs(x) / 4.6) ** 2)


def skin_z(x, y, upper=True):
    """Height of the upper or lower skin over a point of the planform."""
    fill = _fill(x, y)
    return EDGE_PLANE + fill * _upper(x, y) if upper else EDGE_PLANE - fill * _lower(x, y)


class Skin(jp.Planform):
    """The analytic skin behind the shared patch builder (plates that lie on the skin)."""

    def __init__(self):
        super().__init__(leading, trailing, lambda x: EDGE_PLANE, lambda x: 0.0)

    def skin_z(self, x, y, upper=True):
        return skin_z(x, y, upper)


WING = Skin()


def _point(x, t, upper=True, sink=0.0):
    y = leading(x) - t * (leading(x) - trailing(x))
    return (x, y, skin_z(x, y, upper) - sink)


def _in_pane(x0, x1, t0, t1):
    for a, b, c, d in PANES:
        if x0 >= a - 1e-6 and x1 <= b + 1e-6 and t0 >= c - 1e-6 and t1 <= d + 1e-6:
            return True
    return False


def _in_elevon(x0, x1, t0):
    return x0 >= ELEVON[0] - 1e-6 and x1 <= ELEVON[1] + 1e-6 and t0 >= HINGE_T - 1e-6


class _Builder:
    """Collects welded points and faces, each face with the direction it must look towards."""

    def __init__(self):
        self.verts, self.index, self.faces, self.towards = [], {}, [], []

    def vert(self, p):
        key = (round(p[0], 4), round(p[1], 4), round(p[2], 4))
        if key not in self.index:
            self.index[key] = len(self.verts)
            self.verts.append(p)
        return self.index[key]

    def face(self, points, toward):
        ids = []
        for p in points:
            i = self.vert(p)
            if i not in ids:
                ids.append(i)
        if len(ids) >= 3:
            self.faces.append(ids)
            self.towards.append(Vector(toward))

    def object(self, name):
        obj = mk.mesh_object(name, self.verts, self.faces)
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bm.faces.ensure_lookup_table()
        if len(bm.faces) != len(self.faces):
            raise RuntimeError('%s: %d of %d faces survived' % (name, len(bm.faces), len(self.faces)))
        for face, toward in zip(bm.faces, self.towards):
            if face.normal.dot(toward) < 0:
                face.normal_flip()
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update()
        return obj


def _slab(b, xs, upper_t, lower_t, skip=None, closed=False):
    """Upper and lower skin over the grid xs x chord shares; `closed` adds the front and end faces."""
    for sheet, upper in ((upper_t, True), (lower_t, False)):
        for x0, x1 in zip(xs, xs[1:]):
            for t0, t1 in zip(sheet, sheet[1:]):
                if skip and skip(x0, x1, t0, t1, upper):
                    continue
                b.face([_point(x0, t0, upper), _point(x1, t0, upper), _point(x1, t1, upper), _point(x0, t1, upper)], (0, 0, 1 if upper else -1))
    if closed:
        for x0, x1 in zip(xs, xs[1:]):
            b.face([_point(x0, upper_t[0]), _point(x1, upper_t[0]), _point(x1, lower_t[0], False), _point(x0, lower_t[0], False)], (0, 1, 0))
        for x, side in ((xs[0], -1), (xs[-1], 1)):
            b.face([_point(x, t) for t in upper_t] + [_point(x, t, False) for t in reversed(lower_t)], (side, 0, 0))


def hull():
    """The right half of the outer skin: upper and lower sheet sharing the knife-edge perimeter."""
    b = _Builder()

    def skip(x0, x1, t0, t1, upper):
        return _in_elevon(x0, x1, t0) or (upper and _in_pane(x0, x1, t0, t1))

    _slab(b, STATIONS, UPPER_T, LOWER_T, skip)
    # The blunt faces of the elevon bay: along the hinge line and at both ends.
    bay = [x for x in STATIONS if ELEVON[0] - 1e-6 <= x <= ELEVON[1] + 1e-6]
    for x0, x1 in zip(bay, bay[1:]):
        b.face([_point(x0, HINGE_T), _point(x1, HINGE_T), _point(x1, HINGE_T, False), _point(x0, HINGE_T, False)], (0, -1, 0))
    for x, side in ((bay[0], 1), (bay[-1], -1)):
        b.face([_point(x, t) for t in UPPER_T if t >= HINGE_T] + [_point(x, t, False) for t in reversed(LOWER_T) if t >= HINGE_T], (side, 0, 0))
    return b.object('hull')


def panes():
    """Four flat dark panes (two here, two mirrored), a little larger than their openings and just under the skin."""
    b = _Builder()
    for x0, x1, t0, t1 in PANES:
        corners = [_point(x0 - 0.03, t0 - 0.002), _point(x1 + 0.03, t0 - 0.002), _point(x1 + 0.03, t1 + 0.002), _point(x0 - 0.03, t1 + 0.002)]
        b.face([(x, y, z - 0.02) for x, y, z in corners], (0, 0, 1))
    return jp.flat(b.object('panes'))


def elevon(name):
    """One elevon of the right wing, its own closed piece behind the hinge line."""
    b = _Builder()
    xs = [ELEVON[0] + 0.03, 14.5, 15.45, 16.4, ELEVON[1] - 0.03]
    gap = 0.025 / OUTER_CHORD
    _slab(b, xs, [HINGE_T + gap, 0.8, 0.875, 0.94, 0.98, 1.0], [HINGE_T + gap, 0.82, 0.92, 0.98, 1.0], closed=True)
    return b.object(name)


def hinge_frame(obj, origin, turn):
    """Puts the object's origin on its hinge and turns its own X axis along the hinge line (degrees about Z)."""
    frame = Matrix.Translation(Vector(origin)) @ Matrix.Rotation(math.radians(turn), 4, 'Z')
    obj.data.transform(frame.inverted())
    obj.matrix_world = frame
    return obj


def make(a):
    skin = sf.coated('skin', '#33313a', roughness=0.78, wear=0.1, panels=(4.0, 2.3), projection='top', sheen='#2a3a33', grain=0.14)
    dark = sf.plain('duct_dark', '#060607', 0.9)
    trough = sf.bare_metal('trough_metal', '#4d4844', 0.5, wear=0.5)
    rudder_skin = sf.coated('rudder_skin', '#2c2b31', roughness=0.7, wear=0.15, grain=0.14)
    glass = sf.glass('glass', '#080b0e', alpha=0.6)
    metal = sf.bare_metal('gear_metal', '#8d9094', 0.4, wear=0.4)
    hub = sf.bare_metal('gear_hub', '#b4b6b8', 0.3, wear=0.2)
    tyre = sf.rubber('tyre')

    # --- the mirrored outer skin ---------------------------------------------------------------
    shell = mk.assign(mk.shade(hull(), 38), skin)
    glazing = mk.assign(panes(), glass)
    plates = []
    # Intakes: one thin dark slit a side on the rising lip of the engine hump, parallel to the leading edge.
    plates.append(mk.assign(WING.patch('intake_slit', ENGINE_X - 1.25, ENGINE_X + 1.25, lambda x: 1.2 - SWEEP * (x - ENGINE_X),
                                       lambda x: 1.9 - SWEEP * (x - ENGINE_X), lift=0.02, nx=8, ny=3), dark))
    for x in (3.1, 4.9):
        plates.append(mk.assign(WING.patch('exhaust_mouth', x - 0.62, x + 0.62, -5.0, -5.85, lift=0.025, nx=3, ny=4), dark))
        plates.append(mk.assign(WING.patch('trough', x - 0.62, x + 0.62, -5.9, -7.8, lift=0.018, nx=3, ny=5), trough))
    for upper in (True, False):   # the closed clamshell drag rudder: one panel above, one below
        plates.append(mk.assign(WING.patch('drag_rudder', RUDDER[0], RUDDER[1], lambda x: trailing(x) + 0.1, lambda x: trailing(x) + 1.0,
                                           upper=upper, lift=0.008, nx=4, ny=2), rudder_skin))
    lod0 = mk.join('lod0', [shell, glazing] + [mk.shade(p, 40) for p in plates])
    a.add(lod0, mirror=True)

    # --- details that differ left and right ----------------------------------------------------
    details = []
    lamp_x, lamp_y = 22.2, TIP_Y + 0.02
    lamp_z = skin_z(lamp_x, lamp_y) + 0.015
    details.append(mk.assign(mk.box('nav_red', (0.3, 0.2, 0.05), (-lamp_x, lamp_y, lamp_z), 0.015), sf.lamp('lamp_nav_red', '#ff2a1a', 4.0)))
    details.append(mk.assign(mk.box('nav_green', (0.3, 0.2, 0.05), (lamp_x, lamp_y, lamp_z), 0.015), sf.lamp('lamp_nav_green', '#20ff58', 4.0)))
    beacon = sf.lamp('lamp_beacon', '#ff2418', 5.0)
    details.append(mk.assign(mk.cylinder('beacon_top', 0.09, 0.08, (0, 3.2, skin_z(0, 3.2) + 0.03), 'Z', 12, 0.05), beacon))
    details.append(mk.assign(mk.cylinder('beacon_belly', 0.09, 0.08, (0, -2.0, skin_z(0, -2.0, False) - 0.03), 'Z', 12), beacon))
    details.append(mk.assign(mk.box('strobe', (0.16, 0.14, 0.05), (0, NOTCH_Y + 0.2, skin_z(0, NOTCH_Y + 0.2) + 0.015), 0.015), sf.lamp('lamp_strobe', '#f4f6ff', 6.0)))
    serial = sf.plain('serial_grey', '#4b4d52', 0.75)
    for i, (width, depth) in enumerate(((0.3, 0.46), (0.26, 0.46), (0.16, 0.1), (0.26, 0.46), (0.1, 0.46))):   # a serial suggested by blocks
        x0 = -8.2 + i * 0.42
        details.append(mk.assign(WING.patch('serial_%d' % i, x0, x0 + width, -1.2, -1.2 + depth, lift=0.008, nx=1, ny=1), serial))
    details.append(mk.assign(WING.patch('hatch_well', -0.43, 0.43, 3.62, 4.78, upper=False, lift=0.006, nx=2, ny=3), dark))
    a.add(mk.shade(mk.join('detail_lod0', details), 40))

    # --- moving parts ---------------------------------------------------------------------------
    mid = 0.5 * (ELEVON[0] + ELEVON[1])
    hinge = (mid, leading(mid) - HINGE_T * OUTER_CHORD, EDGE_PLANE)
    turn = math.degrees(math.atan(SWEEP))
    right = mk.assign(elevon('elevon_r'), skin)
    left = mk.duplicate(right, 'elevon_l')
    mk.transform(left, scale=(-1, 1, 1))
    a.add(hinge_frame(mk.shade(right, 38), hinge, -turn))
    a.add(hinge_frame(mk.shade(left, 38), (-hinge[0], hinge[1], hinge[2]), turn))

    a.add(jp.gear_leg('gear_nose', (0.0, 6.2, skin_z(0, 6.2, False) + 0.05), 0.55, (-0.3, 0.3), 0.55, 0.3, metal, tyre, hub, strut=0.13,
                      lamp=sf.lamp('lamp_landing', '#fff4dc', 6.0)))
    for name, side in (('gear_l', -1), ('gear_r', 1)):
        a.add(jp.gear_leg(name, (side * 5.5, -1.6, skin_z(5.5, -1.6, False) + 0.05), 0.55, (-0.36, 0.36), 0.55, 0.36, metal, tyre, hub, strut=0.16, bogie=1.35))

    hatch = WING.patch('hatch', -0.45, 0.45, 3.6, 4.8, upper=False, lift=0.02, nx=2, ny=3)
    mk.solidify(hatch, 0.035)
    mk.assign(hatch, skin)
    a.add(mk.set_origin(mk.shade(hatch, 40), (0.45, 4.2, skin_z(0.45, 4.2, False) - 0.02)))
    ladder_parts = []
    for side in (-0.2, 0.2):
        ladder_parts.append(mk.assign(mk.tube('ladder_rail', [(side, 4.75, 2.0), (side, 2.8, 2.0)], 0.018, 8), metal))
    for i in range(6):
        y = 4.5 - i * 0.3
        ladder_parts.append(mk.assign(mk.tube('ladder_rung', [(-0.2, y, 2.0), (0.2, y, 2.0)], 0.014, 6), metal))
    a.add(mk.set_origin(mk.shade(mk.join('ladder', ladder_parts), 40), (0.0, 4.75, 2.0)))

    # --- the glass cockpit ----------------------------------------------------------------------
    a.add(mk.shade(mk.join('cockpit_lod0', cockpit_parts()), 40))
    panel = mk.quad('instrument_panel', [(-0.85, 7.0, 3.37), (0.85, 7.0, 3.37), (0.85, 7.12, 3.8), (-0.85, 7.12, 3.8)])
    mk.assign(panel, sf.screen('screen_panel'))
    a.add(panel)

    # --- what the game looks for ----------------------------------------------------------------
    a.anchor('seat_driver', (-0.55, 6.15, 3.22))
    a.anchor('seat_passenger_1', (0.55, 6.15, 3.22))
    a.anchor('camera', EYE)
    a.anchor('door_driver', (0.0, 3.3, 0.0))
    for i, (x, z) in enumerate(((3.1, 3.2), (4.9, 3.1), (-3.1, 3.2), (-4.9, 3.1)), start=1):
        a.anchor('exhaust_%d' % i, (x, -5.4, z), (0, 0, 180))
    a.anchor('wingtip_l', (-22.9, TIP_Y, EDGE_PLANE))
    a.anchor('wingtip_r', (22.9, TIP_Y, EDGE_PLANE))
    a.anchor('gear_nose', (0.0, 6.2, 0.0))
    a.anchor('gear_l', (-5.5, -1.6, 0.0))
    a.anchor('gear_r', (5.5, -1.6, 0.0))
    a.anchor('light_landing', (0.0, 6.4, 1.5))
    a.collider_box('fuselage', (8.0, 19.4, 2.7), (0.0, -0.4, 3.2))
    a.collider_box('wing', (46.0, 7.0, 1.0), (0.0, -2.6, 2.7))
    a.collider_box('tail', (10.0, 4.0, 1.0), (0.0, -8.0, 2.8))
    a.extra('panel_size', [1.7, 0.45])
    a.extra('eye', list(EYE))
    jp.exact_extras(a, {
        'gear_retract': {'gear_nose': ['x', 95], 'gear_l': ['x', 95], 'gear_r': ['x', 95]},
        'hatch_open': ['y', -88], 'ladder_down': ['x', 75],
    })
    a.lods((0.3, 0.1), (150.0, 500.0))
    print('MANTA outline', [(round(x, 3), round(y, 3)) for x, y in OUTLINE])
    print('MANTA skin', {k: round(v, 3) for k, v in {
        'crest': max(skin_z(0, 4.0 + 0.1 * i) for i in range(50)), 'belly': skin_z(0, 4.2, False), 'exhaust_1': skin_z(3.1, -5.4),
        'exhaust_2': skin_z(4.9, -5.4), 'nose_gear_bay': skin_z(0, 6.2, False), 'main_gear_bay': skin_z(5.5, -1.6, False),
        'over_eye': skin_z(EYE[0], EYE[1]), 'over_headrest': skin_z(0.75, 5.6), 'over_panel': skin_z(0.98, 7.45),
        'pane_low': skin_z(0.5, leading(0.5) - 0.095 * (leading(0.5) - trailing(0.5))),
        'pane_high': skin_z(0.5, leading(0.5) - 0.15 * (leading(0.5) - trailing(0.5))), 'outer_wing_mid': skin_z(17.0, leading(17.0) - 1.8),
    }.items()})


def _cabin_wall(name, start, end, steps, material):
    """A wall of the cabin from the floor up to the lining, along a straight line on the floor."""
    b = _Builder()
    points = [(start[0] + (end[0] - start[0]) * i / steps, start[1] + (end[1] - start[1]) * i / steps) for i in range(steps + 1)]
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        inward = (-0.5 * (x0 + x1), 6.2 - 0.5 * (y0 + y1), 0.0)
        b.face([(x0, y0, FLOOR), (x1, y1, FLOOR), (x1, y1, skin_z(x1, y1) - 0.03), (x0, y0, skin_z(x0, y0) - 0.03)], inward)
    return mk.assign(b.object(name), material)


def _lining(material):
    """The inside of the crest: the skin's own surface 6 cm in, seen from below, with the four panes left open."""
    b = _Builder()
    xs = [x for x in STATIONS if x <= 1.72 + 1e-6] + [1.97]
    ts = [0.03, 0.05, 0.072, 0.095, 0.12, 0.15, 0.19, 0.24, 0.29, 0.34]
    for side in (1, -1):
        for x0, x1 in zip(xs, xs[1:]):
            for t0, t1 in zip(ts, ts[1:]):
                corners = [_point(x0, t0, sink=0.06), _point(x1, t0, sink=0.06), _point(x1, t1, sink=0.06), _point(x0, t1, sink=0.06)]
                if _in_pane(x0, x1, t0, t1) or min(c[2] for c in corners) < FLOOR - 0.25:
                    continue
                b.face([(side * x, y, z) for x, y, z in corners], (0, 0, -1))
    return mk.assign(b.object('lining'), material)


def cockpit_parts():
    """Two seats side by side, sticks, the centre console with four throttles, panel body and lining."""
    wall = sf.coated('cabin_wall', '#2b2d31', roughness=0.75, wear=0.25, grain=0.2)
    floor = sf.coated('cabin_floor', '#202124', roughness=0.85, wear=0.5)
    console = sf.coated('console_grey', '#34373c', roughness=0.6, wear=0.3, grain=0.2)
    cloth = sf.fabric('seat_fabric', '#3b4038')
    frame = sf.bare_metal('seat_frame', '#5a5d61', 0.45)
    grip = sf.rubber('grip', '#161616')
    metal = sf.bare_metal('lever_metal', '#9a9da1', 0.35)
    parts = [_lining(wall)]
    corners = [(-1.95, 4.9), (1.95, 4.9), (1.95, 7.6), (0.9, 8.35), (-0.9, 8.35), (-1.95, 7.6)]
    parts.append(mk.assign(jp.panel_face('floor', [(x, y, FLOOR) for x, y in corners], (0, 0, 1)), floor))
    for i, steps in enumerate((8, 5, 4, 5, 4, 5)):
        parts.append(_cabin_wall('cabin_wall_%d' % i, corners[i], corners[(i + 1) % 6], steps, wall))
    for name, x in (('seat_l', -0.55), ('seat_r', 0.55)):
        parts += jp.seat(name, (x, 6.15, 3.22), cloth, frame)
        parts.append(mk.assign(mk.box(name + '_pedestal', (0.42, 0.5, 0.2), (x, 6.2, FLOOR + 0.1), 0.02), frame))
        parts += jp.stick(name + '_stick', (x, 6.78, FLOOR), 0.74, metal, grip)
    parts.append(mk.assign(mk.box('centre_console', (0.36, 1.3, 0.56), (0.0, 6.55, FLOOR + 0.28), 0.025), console))
    for i, x in enumerate((-0.105, -0.035, 0.035, 0.105)):   # four throttles
        parts += jp.lever('throttle_%d' % i, (x, 6.5, FLOOR + 0.56), 0.15, (0.05, 0.035, 0.045), metal, grip)
    parts += jp.switch_block('caution_panel', (0.0, 7.0, FLOOR + 0.585), (0.3, 0.12, 0.05), 2, 6, console, sf.plain('caution_amber', '#b9801c', 0.45))
    parts += jp.lever('gear_lever', (0.3, 7.14, 3.3), 0.14, (0.06, 0.03, 0.06), metal, sf.plain('gear_knob', '#c6c6c0', 0.5), lean=-70.0)
    parts.append(mk.assign(mk.box('panel_body', (1.96, 0.3, 0.5), (0.0, 7.3, 3.57), 0.02), console))
    parts.append(mk.assign(mk.box('coaming', (2.1, 0.34, 0.03), (0.0, 7.13, 3.83), 0.012), wall))
    for side in (-1, 1):
        parts.append(mk.assign(mk.box('side_console', (0.3, 1.6, 0.5), (side * 1.3, 6.3, FLOOR + 0.25), 0.025), console))
        parts += jp.switch_block('side_switches_%d' % side, (side * 1.3, 6.5, FLOOR + 0.515), (0.22, 0.5, 0.03), 5, 3, console, sf.plain('switch_cap', '#8c8f93', 0.5))
    return parts
