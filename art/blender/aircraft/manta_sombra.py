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
import numpy as np
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


def _pairs(values):
    return list(zip(values, values[1:]))


def _cowl_top(x, y):
    """The exhaust cowl: it leaves the hump flush and overhangs SLOT_H above the skin at the slot."""
    rise = min(max((-4.3 - y) / (-4.3 - SLOT_Y), 0.0), 1.0)
    return (x, y, skin_z(x, y) + 0.004 + SLOT_H * rise ** 1.4)


def exhaust_cowls():
    """Over each exhaust a shallow cowl rising out of the engine hump to an overhanging lip."""
    b = _Builder()
    ys = [-4.3 + (SLOT_Y + 4.3) * i / 6 for i in range(7)]
    for xe in EXHAUST_X:
        xs = [xe - 0.66 + 1.32 * i / 6 for i in range(7)]
        for x0, x1 in _pairs(xs):
            for y0, y1 in _pairs(ys):
                b.face([_cowl_top(x0, y0), _cowl_top(x1, y0), _cowl_top(x1, y1), _cowl_top(x0, y1)], (0, 0, 1))
        for x, side in ((xs[0], -1), (xs[-1], 1)):
            for y0, y1 in _pairs(ys):
                b.face([(x, y0, skin_z(x, y0) - 0.01), (x, y1, skin_z(x, y1) - 0.01), _cowl_top(x, y1), _cowl_top(x, y0)], (side, 0, 0))
        lip = [_cowl_top(x, SLOT_Y) for x in xs]   # the lip's thickness, seen from behind
        for p, q in _pairs(lip):
            b.face([p, q, (q[0], q[1] - 0.02, q[2]), (p[0], p[1] - 0.02, p[2])], (0, 0, 1))
            b.face([(p[0], p[1] - 0.02, p[2]), (q[0], q[1] - 0.02, q[2]), (q[0], q[1] - 0.02, q[2] - 0.03), (p[0], p[1] - 0.02, p[2] - 0.03)], (0, -1, 0))
    return b.object('exhaust_cowl')


def exhaust_slots():
    """The dark mouths under the cowl lips."""
    b = _Builder()
    for xe in EXHAUST_X:
        xs = [xe - 0.66 + 1.32 * i / 6 for i in range(7)]
        for x0, x1 in _pairs(xs):
            b.face([(x0, SLOT_Y, skin_z(x0, SLOT_Y) - 0.01), (x1, SLOT_Y, skin_z(x1, SLOT_Y) - 0.01), _cowl_top(x1, SLOT_Y), _cowl_top(x0, SLOT_Y)], (0, -1, 0))
    return b.object('exhaust_slot')


def trough_fences():
    """Low walls either side of each trough, as high as the lip at the slot and running out aft."""
    b = _Builder()
    ys = [SLOT_Y + (TROUGH_END - SLOT_Y) * i / 8 for i in range(9)]

    def height(y):
        return 0.015 + (SLOT_H - 0.015) * (1.0 - (SLOT_Y - y) / (SLOT_Y - TROUGH_END)) ** 1.3

    for xe in EXHAUST_X:
        for wall, side in ((xe - 0.645, -1), (xe + 0.645, 1)):
            xo, xi = wall + side * 0.016, wall - side * 0.016
            for y0, y1 in _pairs(ys):
                b.face([(xo, y0, skin_z(xo, y0) - 0.01), (xo, y1, skin_z(xo, y1) - 0.01), (xo, y1, skin_z(xo, y1) + height(y1)), (xo, y0, skin_z(xo, y0) + height(y0))], (side, 0, 0))
                b.face([(xi, y0, skin_z(xi, y0) - 0.01), (xi, y1, skin_z(xi, y1) - 0.01), (xi, y1, skin_z(xi, y1) + height(y1)), (xi, y0, skin_z(xi, y0) + height(y0))], (-side, 0, 0))
                b.face([(xi, y0, skin_z(xi, y0) + height(y0)), (xo, y0, skin_z(xo, y0) + height(y0)), (xo, y1, skin_z(xo, y1) + height(y1)), (xi, y1, skin_z(xi, y1) + height(y1))], (0, 0, 1))
            y = ys[-1]
            b.face([(xi, y, skin_z(xi, y) - 0.01), (xo, y, skin_z(xo, y) - 0.01), (xo, y, skin_z(xo, y) + height(y)), (xi, y, skin_z(xi, y) + height(y))], (0, -1, 0))
    return b.object('trough_fence')


# --- the skin's history: joints, tape, doors, stains, stencils -------------------------------------
# The structure under the skin runs in the planform's own two directions: members parallel to this
# side's leading edge (SPARS: metres behind it) and members parallel to the other side's (RIBS: where
# they cross the centreline). Every joint, door edge and marking follows one of them or the airflow.
SPARS = [0.5, 1.5, HINGE_T * OUTER_CHORD, 4.4, 6.6, 9.2, 12.2, 15.4, 19.2]
RIBS = [-23.12, -21.0, -18.7, -16.4, -14.3, -12.48, -10.1, -7.7, -5.1, -2.3, 0.7, 4.0, 7.2, 9.5]
TAPED_SPARS, TAPED_RIBS = (4.4, 9.2), (-18.7, -7.7)
EDGE_BAND = 0.5               # width of the edge members round the whole perimeter
# A matte absorber that drinks light: dark, high and even roughness (no glossy clouds), a faint purple-green
# drift, the edge erosion only a little lighter than the coat.
SKIN = dict(color='#2b2a31', roughness=0.82, gloss=0.045, mottle=0.07, sheen=[('#352a42', 0.4), ('#22342b', 0.4)], tone=0.16, tone_gloss=0.05,
            wear_color='#47444a', wear_rough=0.92, grime_color='#0d0b0a', grime_rough=0.5, tint_color='#323138', tint_rough=0.62,
            tint_height=0.0016, seam_depth=0.006, seam_dark=0.55, dust=0.06, dust_color='#4a4640')
EXHAUST_X = (3.1, 4.9)        # the four exhausts (two a side), each an overhanging slot and a fenced trough
SLOT_Y, SLOT_H, TROUGH_END = -5.0, 0.135, -7.75


def edge_field(x, y):
    """edge_distance() for whole arrays of points."""
    def both(*values):
        stack = np.stack(values)
        return np.where(stack.min(axis=0) <= 0.0, 0.0, np.sum(np.maximum(stack, 1e-6) ** -4.0, axis=0) ** -0.25)

    def either(p, q):
        return (np.maximum(p, 0.0) ** 4 + np.maximum(q, 0.0) ** 4) ** 0.25

    def behind(x):
        notch = (y - (NOTCH_Y - SWEEP * x)) * ACROSS
        inner = (y - (TAIL_Y + SWEEP * (x - TAIL_X))) * ACROSS
        outer = (y - (NOSE_Y - OUTER_CHORD - SWEEP * x)) * ACROSS
        tip = (y - (TIP_Y - SWEEP * (HALF_SPAN - x))) * ACROSS
        return either(both(notch, inner), both(outer, tip))

    return both((NOSE_Y - SWEEP * x - y) * ACROSS, (NOSE_Y + SWEEP * x - y) * ACROSS, either(behind(x), behind(-x)))


def _inside(p):
    return 0.0 <= p[0] <= HALF_SPAN and edge_distance(p[0], p[1]) > EDGE_BAND


def _cross(d, c):
    """Where the spar d metres behind the leading edge meets the rib that crosses the centreline at c."""
    x = (NOSE_Y - d - c) / (2 * SWEEP)
    return (x, c + SWEEP * x)


def _joint(chart, points, taped):
    """A joint between panels: filled with putty, or (a production joint) under a strip of tape."""
    for run in jp.runs(points, _inside):
        if taped:
            chart.line('tint', run, 0.075)
        else:
            chart.seam(run, 0.016, 0.6)


def _hinge_y(x):
    return leading(x) - HINGE_T * OUTER_CHORD


def _structure(chart, merge):
    """Panels between the spars and ribs (neighbours merged at random into longer panels), then the perimeter."""
    for d0, d1 in zip(SPARS, SPARS[1:]):
        j = 0
        while j < len(RIBS) - 1:
            k = j + 1
            while k < len(RIBS) - 1 and RIBS[k] not in TAPED_RIBS and chart.rng.random() < merge:
                k += 1
            chart.fill('tone', [_cross(d0, RIBS[j]), _cross(d0, RIBS[k]), _cross(d1, RIBS[k]), _cross(d1, RIBS[j])], 0.5 + chart.rng.uniform(-0.5, 0.5) * 0.85)
            _joint(chart, jp.sampled(_cross(d0, RIBS[k]), _cross(d1, RIBS[k]), 0.08), RIBS[k] in TAPED_RIBS)
            j = k
    for d in SPARS[1:]:
        _joint(chart, jp.sampled((0.0, NOSE_Y - d), (HALF_SPAN, NOSE_Y - d - SWEEP * HALF_SPAN), 0.08), d in TAPED_SPARS)


def _perimeter(chart):
    """The edge members (a darker, denser absorber with a taped inner joint) and the erosion of the leading edge."""
    x, y = chart.grid()
    x = np.abs(x)
    distance = edge_field(x, y)
    lead = np.maximum((NOSE_Y - SWEEP * x - y) * ACROSS, 0.0)
    chart.put('tone', np.where(distance < EDGE_BAND, 0.26, chart.array('tone')), 'set')
    chart.put('tint', (np.abs(distance - EDGE_BAND) < 0.04).astype(np.float32))
    chart.put('wear', np.where(distance > 0.0, 0.65 * np.exp(-lead / 0.05) + 0.18 * np.exp(-lead / 0.45), 0.0))


def charts():
    """The upper and the lower drawing of the right half (the left is its mirror image)."""
    lo, hi = (-0.2, -10.3), (HALF_SPAN + 0.2, NOSE_Y + 0.3)
    top = jp.Chart('top', lo, hi, 120, seed=11, ink='#5f6066')
    _structure(top, 0.4)
    turn = -math.degrees(math.atan(SWEEP))
    # Engine bay doors over each hump, service doors along the structure, the refuelling slipway on the centreline.
    for x in (3.1, 4.9):
        for y, depth in ((-0.9, 1.9), (-3.3, 1.7)):
            door = top.hatch((x, y), (1.3, depth), chamfer=0.14, fasteners=None, tone=0.7, seam=0.75, width=0.018)
            top.streaks('grime', [door[0], door[1]], 3, (0.25, 0.8), (0.03, 0.06), (0.25, 0.6))
    for centre, size in (((1.55, 2.5), (0.55, 0.36)), ((7.6, 0.2), (0.7, 0.42)), ((10.6, -1.7), (0.6, 0.4)), ((16.0, -3.2), (0.55, 0.34)), ((19.3, -5.6), (0.5, 0.3)),
                         ((8.4, -4.6), (0.8, 0.5)), ((6.9, -6.4), (0.6, 0.4))):
        top.hatch(centre, size, turn, chamfer=0.07, fasteners=None, tone=0.6, seam=0.7, width=0.016)
    top.fill('tone', [(0.0, 0.2), (0.34, 0.2), (0.34, 1.3), (0.0, 1.3)], 0.22)
    top.seam([(0.0, 0.2), (0.34, 0.2), (0.34, 1.3), (0.0, 1.3)], 0.018, 0.9)
    top.mark_line([(0.55, 2.9), (0.4, 1.45)], 0.03)
    top.mark_line([(0.34, 1.38), (0.6, 1.38)], 0.03)
    for x0, x1, t0, t1 in PANES:   # a thin frame line of sealant round each pane
        frame = [_point(x0 - 0.035, t0 - 0.003)[:2], _point(x1 + 0.035, t0 - 0.003)[:2], _point(x1 + 0.035, t1 + 0.003)[:2], _point(x0 - 0.035, t1 + 0.003)[:2]]
        top.line('tint', frame + [frame[0]], 0.035)
        top.seam(frame, 0.014, 0.8, closed=True)
    y = 6.0
    while y > -4.4:   # the walkway border along the body, dashed
        top.mark_line([(2.2, y), (2.2, y - 0.5)], 0.028)
        y -= 0.78
    # Exhaust: the skin behind each trough bleached by heat, soot along the trough edges and round the mouths.
    for x in (3.1, 4.9):
        top.streak('wear', (x, -5.2), 4.4, 1.25, 0.8, spread=1.3, soft=0.22)
        for side in (-0.64, 0.64):
            top.streak('grime', (x + side, -5.0), 4.2, 0.12, 0.85, spread=2.2)
        top.streak('grime', (x, -7.7), 1.6, 0.5, 0.5, spread=1.6, soft=0.15)
        top.line('grime', [(x - 0.7, -4.95), (x + 0.7, -4.95)], 0.14, 0.7, soft=0.07)
    top.streaks('grime', [(2.8, 2.05), (5.2, 0.32)], 12, (0.3, 1.0), (0.03, 0.08), (0.15, 0.45))
    # Hydraulic fluid drawn back from the elevon hinge line and the drag rudder's forward edge.
    top.seam([(ELEVON[0], _hinge_y(ELEVON[0])), (ELEVON[1], _hinge_y(ELEVON[1]))], 0.02, 0.9)
    top.streaks('grime', [(ELEVON[0] + 0.1, _hinge_y(ELEVON[0] + 0.1) - 0.03), (ELEVON[1] - 0.1, _hinge_y(ELEVON[1] - 0.1) - 0.03)], 18, (0.2, 0.95), (0.02, 0.05), (0.35, 0.95))
    rudder = [(RUDDER[0], trailing(RUDDER[0]) + 1.0), (RUDDER[1], trailing(RUDDER[1]) + 1.0), (RUDDER[1], trailing(RUDDER[1]) + 0.1), (RUDDER[0], trailing(RUDDER[0]) + 0.1)]
    top.fill('tone', rudder, 0.36)
    top.streaks('grime', rudder[:2], 9, (0.2, 0.8), (0.02, 0.045), (0.3, 0.8))
    _perimeter(top)

    bottom = jp.Chart('bottom', lo, hi, 120, seed=23, ink='#64656b')
    _structure(bottom, 0.55)
    # Doors: the payload bay (two leaves a side), the nose and main gear bays, engine access, the drains.
    bay = [(0.0, -5.6), (2.2, -5.6), (2.2, 2.5), (0.0, 2.5)]
    bottom.fill('tone', bay, 0.62)
    bottom.seam(bay, 0.024, 1.0, closed=True)
    bottom.seam([(1.1, -5.6), (1.1, 2.5)], 0.02, 0.9)
    bottom.streaks('grime', [(0.0, -5.6), (2.2, -5.6)], 12, (0.4, 1.7), (0.03, 0.07), (0.3, 0.8))
    bottom.streaks('grime', [(1.1, 2.3), (1.1, -5.4)], 10, (0.2, 0.7), (0.02, 0.05), (0.2, 0.6))
    for centre, size, legs in (((0.0, 6.2), (1.0, 2.5), 0.3), ((5.5, -1.6), (1.9, 4.0), 0.75)):
        door = bottom.hatch(centre, size, chamfer=0.1, fasteners=None, tone=0.5, seam=1.0, width=0.022)
        bottom.seam([(centre[0], centre[1] - size[1] * 0.5), (centre[0], centre[1] + size[1] * 0.5)], 0.02, 0.9)
        bottom.fill('grime', bottom.box(centre, (legs, legs * 1.7)), 0.9, soft=0.12)
        bottom.streaks('grime', [door[0], door[1]], 12, (0.8, 3.6), (0.03, 0.09), (0.3, 0.9))
    for x in (3.1, 4.9):
        bottom.hatch((x, -3.2), (1.2, 2.4), chamfer=0.1, fasteners=None, tone=0.55, seam=0.8, width=0.018)
        for y in (-2.6, -3.9):
            bottom.dot('seam', (x + 0.2, y), 0.03)
            bottom.streak('grime', (x + 0.2, y), bottom.rng.uniform(1.4, 3.2), 0.05, 0.9, spread=2.4)
    bottom.streaks('grime', [(0.0, 3.6), (0.45, 3.6)], 4, (0.3, 1.2), (0.02, 0.05), (0.3, 0.7))
    bottom.seam([(ELEVON[0], _hinge_y(ELEVON[0])), (ELEVON[1], _hinge_y(ELEVON[1]))], 0.02, 0.9)
    bottom.streaks('grime', [(ELEVON[0] + 0.1, _hinge_y(ELEVON[0] + 0.1) - 0.03), (ELEVON[1] - 0.1, _hinge_y(ELEVON[1] - 0.1) - 0.03)], 14, (0.2, 0.9), (0.02, 0.05), (0.3, 0.9))
    for centre in ((2.9, 3.6), (7.4, -0.7), (12.2, -2.4), (17.9, -5.2)):   # jacking points: a ring and a cross
        ring = [(centre[0] + 0.1 * math.cos(math.radians(t)), centre[1] + 0.1 * math.sin(math.radians(t))) for t in range(0, 361, 20)]
        bottom.mark_line(ring, 0.022)
        bottom.mark_line([(centre[0] - 0.17, centre[1]), (centre[0] + 0.17, centre[1])], 0.018)
        bottom.mark_line([(centre[0], centre[1] - 0.17), (centre[0], centre[1] + 0.17)], 0.018)
    _perimeter(bottom)
    return top, bottom


def stencil(name, lines, centre, right, height, color, base, upper=True):
    """A stencilled marking that must read the right way round on its own side: a thin plate on the
    skin carrying the skin's own finish plus the lettering (the hull's texels are shared by both halves)."""
    return jp.stencil_plate(WING, ASSET['id'], name, lines, centre, right, height, color,
                            lambda chart: jp.skin('stencil_' + name, asset_id=ASSET['id'], chart=base, decal=chart, **SKIN), upper)


def texel_share(name, centre, normal, material):
    """What the atlas spends where: lettering most, the upper skin fully, the underside and gear less, the cabin least."""
    if material.startswith('stencil_'):
        return 1.8
    if name.startswith('cockpit'):
        return 0.4
    if name.startswith('gear') or name == 'ladder':
        return 0.8
    return 0.74 if normal.z < -0.2 else 1.0


def make(a):
    jp.detail_pipeline(a, density=texel_share, quality={'base': 84, 'orm': 74, 'normal': 92})
    top_chart, bottom_chart = charts()
    skin = jp.skin('skin', asset_id=ASSET['id'], chart=top_chart, **SKIN)
    belly = jp.skin('skin_belly', asset_id=ASSET['id'], chart=bottom_chart, **SKIN)
    dark = sf.plain('duct_dark', '#060607', 0.9)
    trough = jp.heat_metal('trough_metal', -8.6, -5.1, '#4d4946', 0.55, rings=0.48)
    glass = sf.glass('glass', '#080b0e', alpha=0.6)
    metal = jp.skin('gear_metal', '#aeb2b6', ASSET['id'], roughness=0.42, gloss=0.14, dust=0.45, grain=0.0006)
    hub = jp.skin('gear_hub', '#c3c5c7', ASSET['id'], roughness=0.36, metallic=0.6, dust=0.5)
    chrome = sf.plain('gear_chrome', '#e2e4e6', 0.09, 1.0)
    hose = sf.plain('gear_hose', '#0e0e0f', 0.55)
    bezel = sf.plain('seat_gasket', '#0a0a0b', 0.3)
    tyre = jp.tyre_rubber('tyre', 0.075)

    def two_sided(obj):
        mk.assign(obj, skin)
        return mk.assign_faces(obj, belly, lambda c, n: n.z < 0.0)

    # --- the mirrored outer skin ---------------------------------------------------------------
    shell = two_sided(mk.shade(hull(), 38))
    glazing = mk.assign(panes(), glass)
    plates = []
    # Intakes: one thin dark slit a side on the rising lip of the engine hump, parallel to the leading edge.
    plates.append(mk.assign(WING.patch('intake_slit', ENGINE_X - 1.25, ENGINE_X + 1.25, lambda x: 1.2 - SWEEP * (x - ENGINE_X),
                                       lambda x: 1.9 - SWEEP * (x - ENGINE_X), lift=0.02, nx=8, ny=3), dark))
    # Exhausts: an overhanging cowl lip over a dark slot, then a heat-stained trough between two low fences.
    plates.append(mk.assign(exhaust_cowls(), skin))
    plates.append(mk.assign(exhaust_slots(), dark))
    plates.append(mk.assign_faces(mk.assign(trough_fences(), skin), trough,
                                  lambda c, n: abs(n.x) > 0.7 and n.x * (c.x - min(EXHAUST_X, key=lambda e: abs(e - c.x))) < 0.0))
    for x in EXHAUST_X:
        plates.append(mk.assign(WING.patch('trough', x - 0.629, x + 0.629, SLOT_Y + 0.01, TROUGH_END, lift=0.012, nx=4, ny=8), trough))
    for upper in (True, False):   # the closed clamshell drag rudder: one panel above, one below
        plates.append(mk.assign(WING.patch('drag_rudder', RUDDER[0], RUDDER[1], lambda x: trailing(x) + 0.1, lambda x: trailing(x) + 1.0,
                                           upper=upper, lift=0.008, nx=4, ny=2), skin if upper else belly))
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
    # Lamp seats: a dark gasket under each lens.
    for side in (-1, 1):
        details.append(mk.assign(WING.patch('nav_seat', side * lamp_x - 0.19, side * lamp_x + 0.19, lamp_y - 0.14, lamp_y + 0.14, lift=0.004, nx=1, ny=1), bezel))
    details.append(mk.assign(mk.cylinder('beacon_top_seat', 0.13, 0.02, (0, 3.2, skin_z(0, 3.2) + 0.006), 'Z', 12), bezel))
    details.append(mk.assign(mk.cylinder('beacon_belly_seat', 0.13, 0.02, (0, -2.0, skin_z(0, -2.0, False) - 0.006), 'Z', 12), bezel))
    # Stencils (low-visibility greys, a muted yellow and red): the serial where it has always been, on the left wing.
    grey = '#5d5e64'
    edge = (1.0, SWEEP)
    details.append(stencil('serial', ['MS-01'], (-7.25, -0.95), edge, 0.46, '#56575d', top_chart))
    details.append(stencil('step_l', ['NO PISAR'], (-15.45, _hinge_y(15.45) + 0.42), edge, 0.13, grey, top_chart))
    details.append(stencil('step_r', ['NO PISAR'], (15.45, _hinge_y(15.45) + 0.42), (1.0, -SWEEP), 0.13, grey, top_chart))
    details.append(stencil('rescue', ['RESCATE', 'CORTAR AQUI >'], (-2.8, 6.45), (1.0, 0.0), 0.12, '#8f7d2c', top_chart))
    details.append(stencil('hot_l', ['PELIGRO', 'ESCAPE'], (-4.0, -4.42), (1.0, 0.0), 0.1, '#7c3a32', top_chart))
    details.append(stencil('hot_r', ['PELIGRO', 'ESCAPE'], (4.0, -4.42), (1.0, 0.0), 0.1, '#7c3a32', top_chart))
    details.append(stencil('fuel', ['COMBUSTIBLE', 'JP-M  PRESION 3.4'], (1.75, 0.75), (0.0, 1.0), 0.075, grey, top_chart))
    details.append(stencil('crew', ['ACCESO TRIPULACION', 'MS-01'], (-1.55, 4.2), (-1.0, 0.0), 0.085, '#6a6b70', bottom_chart, upper=False))
    details.append(stencil('jack', ['PUNTO DE GATO'], (-2.9, 3.25), (-1.0, 0.0), 0.06, '#6a6b70', bottom_chart, upper=False))
    details.append(mk.assign(WING.patch('hatch_well', -0.43, 0.43, 3.62, 4.78, upper=False, lift=0.006, nx=2, ny=3), dark))
    a.add(mk.shade(mk.join('detail_lod0', details), 40))

    # --- moving parts ---------------------------------------------------------------------------
    mid = 0.5 * (ELEVON[0] + ELEVON[1])
    hinge = (mid, leading(mid) - HINGE_T * OUTER_CHORD, EDGE_PLANE)
    turn = math.degrees(math.atan(SWEEP))
    right = two_sided(elevon('elevon_r'))
    left = mk.duplicate(right, 'elevon_l')
    mk.transform(left, scale=(-1, 1, 1))
    a.add(hinge_frame(mk.shade(right, 38), hinge, -turn))
    a.add(hinge_frame(mk.shade(left, 38), (-hinge[0], hinge[1], hinge[2]), turn))

    a.add(jp.gear_leg('gear_nose', (0.0, 6.2, skin_z(0, 6.2, False) + 0.05), 0.55, (-0.3, 0.3), 0.55, 0.3, metal, tyre, hub, strut=0.13,
                      lamp=sf.lamp('lamp_landing', '#fff4dc', 6.0), chrome=chrome, hose=hose))
    for name, side in (('gear_l', -1), ('gear_r', 1)):
        a.add(jp.gear_leg(name, (side * 5.5, -1.6, skin_z(5.5, -1.6, False) + 0.05), 0.55, (-0.36, 0.36), 0.55, 0.36, metal, tyre, hub, strut=0.16, bogie=1.35,
                          chrome=chrome, hose=hose))

    hatch = WING.patch('hatch', -0.45, 0.45, 3.6, 4.8, upper=False, lift=0.02, nx=2, ny=3)
    mk.solidify(hatch, 0.035)
    mk.assign(hatch, belly)
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
