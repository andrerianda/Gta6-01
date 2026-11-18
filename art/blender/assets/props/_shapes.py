"""Part builders for the prop sets: short calls that return one mesh part, already carrying its
material, its one UV layer and its level-of-detail tags (see _setkit.py).

Every part is built in the object's own space (Z up, front towards +Y, standing on Z = 0) and
left at identity; SetKit.object() joins the parts of an object. `skip=1` keeps a part in level
0 only (bolts, straps, small brackets), `skip=2` in levels 0 and 1; `solid=True` keeps it
undecimated at every level it appears in.

Boxes are swept rectangles, not cubes: their four sides unwrap as one strip, which halves the
number of UV islands a set of several hundred boxes hands to the packer.
"""
import math

from mathutils import Matrix, Vector

from lib import build, modify, profiles, scene

from _setkit import normalise_uv, tag

PLANES = {
    # Where an outline's x and y and the extrusion depth go: columns of the matrix.
    'XY': ((1, 0, 0), (0, 1, 0), (0, 0, 1)),      # lying flat, extruded upwards
    'XZ': ((1, 0, 0), (0, 0, 1), (0, -1, 0)),     # standing, facing +Y, extruded backwards
    'YZ': ((0, 1, 0), (0, 0, 1), (1, 0, 0)),      # a side profile, extruded towards +X
}


def done(obj, mat=None, skip=0, solid=False):
    """Finishes a part: one UV layer, its material and its level tags."""
    normalise_uv(obj)
    if mat is not None:
        scene.set_material(obj, mat)
    tag(obj, skip=skip, solid=1 if solid else 0)
    return obj


def move(obj, at=(0.0, 0.0, 0.0), rot=(0.0, 0.0, 0.0), scale=(1.0, 1.0, 1.0)):
    """Scales, turns (XYZ Euler, radians) and moves a part's mesh."""
    return modify.transform(obj, location=at, rotation=rot, scale=scale)


def join(parts):
    """Several parts as one (materials and tags are kept per face)."""
    for part in parts:
        normalise_uv(part)
    return scene.join(parts)


def copies(obj, placements):
    """The part repeated: placements is a list of (at, rot) or plain offsets; the original is
    moved to the first."""
    made = []
    for index, placement in enumerate(placements):
        at, rot = placement if isinstance(placement[0], (tuple, list)) else (placement, (0.0, 0.0, 0.0))
        target = obj if index == len(placements) - 1 else scene.duplicate(obj)
        made.append(move(target, at=at, rot=rot))
    return join(made)


def mirrored(obj, axis='X'):
    """The part and its mirror image across the plane through the origin."""
    copy = scene.duplicate(obj)
    flip = [-1.0 if name == axis.upper() else 1.0 for name in 'XYZ']
    move(copy, scale=flip)
    return join([obj, copy])


def box(size, at=(0.0, 0.0, 0.0), mat=None, ground=False, rot=None, bevel=0.0, skip=0,
        solid=False, caps=True):
    """A box of full `size` centred on `at` (or standing on it with ground=True)."""
    sx, sy, sz = size
    z0 = 0.0 if ground else -sz / 2
    obj = build.sweep('part', profiles.rectangle(sx, sy), [(0.0, 0.0, z0), (0.0, 0.0, z0 + sz)],
                      up=(0.0, 1.0, 0.0), caps=caps)
    if bevel > 0:
        modify.bevel(obj, width=bevel, segments=1)
    move(obj, at=at, rot=rot or (0.0, 0.0, 0.0))
    return done(obj, mat, skip, solid)


def rbox(width, depth, height, radius, at=(0.0, 0.0, 0.0), mat=None, corner=2, stations=None,
         caps=True, skip=0):
    """An upright box with rounded vertical corners standing on `at`. stations: optional list
    of (height fraction, scale or (scale x, scale y)) to taper or chamfer it."""
    stations = stations or [(0.0, 1.0), (1.0, 1.0)]
    path = [(0.0, 0.0, height * fraction) for fraction, _scale in stations]
    obj = build.sweep('part', profiles.rounded_rectangle(width, depth, radius, corner), path,
                      up=(0.0, 1.0, 0.0), scales=[scale for _fraction, scale in stations], caps=caps)
    move(obj, at=at)
    return done(obj, mat, skip)


def cyl(radius, height, at=(0.0, 0.0, 0.0), mat=None, seg=10, axis='Z', top=None, ground=False,
        caps=(True, True), skip=0, solid=False):
    """A cylinder or cone along an axis, centred on `at` (or with its base on it)."""
    upper = radius if top is None else top
    z0 = 0.0 if ground else -height / 2
    obj = build.lathe('part', [(radius, z0), (upper, z0 + height)], segments=seg,
                      cap_bottom=caps[0], cap_top=caps[1] and upper > 1e-6)
    if axis == 'X':
        move(obj, rot=(0.0, math.pi / 2, 0.0))
    elif axis == 'Y':
        move(obj, rot=(-math.pi / 2, 0.0, 0.0))
    move(obj, at=at)
    return done(obj, mat, skip, solid)


def lathe(profile, mat=None, seg=12, at=(0.0, 0.0, 0.0), caps=(False, False), skip=0, angle=math.tau):
    """A profile of (radius, z) points, bottom to top, turned about the Z axis through `at`."""
    obj = build.lathe('part', profile, segments=seg, angle=angle, cap_bottom=caps[0], cap_top=caps[1])
    move(obj, at=at)
    return done(obj, mat, skip)


def pole(r0, r1, z0, z1, mat=None, seg=10, step=1.3, skip=0):
    """A tapered shaft with a ring every `step` metres, so the packer can cut its long strip."""
    count = max(1, math.ceil((z1 - z0) / step))
    profile = [(profiles.lerp(r0, r1, index / count), profiles.lerp(z0, z1, index / count))
               for index in range(count + 1)]
    return lathe(profile, mat, seg=seg, skip=skip)


def rod(start, end, radius, mat=None, seg=6, caps=False, skip=0, top=None):
    """A straight round bar between two points."""
    radii = [radius, radius if top is None else top]
    obj = build.tube('part', [start, end], radii=radii, segments=seg, caps=caps)
    return done(obj, mat, skip)


def pipe(points, radius, mat=None, seg=6, smooth=0, caps=False, closed=False, radii=None, skip=0,
         up=(0.0, 0.0, 1.0)):
    """A round tube through points; smooth > 0 rounds the path with that many extra points per
    span."""
    path = profiles.smooth_path(points, subdivisions=smooth, closed=closed) if smooth else list(points)
    obj = build.tube('part', path, radius=radius, radii=radii, segments=seg, caps=caps and not closed,
                     closed_path=closed, up=up)
    return done(obj, mat, skip)


def beam(start, end, width, height, mat=None, up=(0.0, 0.0, 1.0), caps=True, skip=0, step=0.0):
    """A rectangular bar between two points: `height` along `up`, `width` across. step > 0
    adds a cross-section every so many metres (long members need them for the packer)."""
    points = [start, end]
    if step > 0:
        count = max(1, math.ceil(math.dist(start, end) / step))
        points = [profiles.lerp(tuple(start), tuple(end), index / count) for index in range(count + 1)]
    obj = build.sweep('part', profiles.rectangle(width, height), points, up=up, caps=caps)
    return done(obj, mat, skip)


def section(outline, points, mat=None, up=(0.0, 0.0, 1.0), caps=True, skip=0, scales=None,
            closed=False):
    """Any closed outline swept along a path (rails, channels, mouldings)."""
    obj = build.sweep('part', outline, points, up=up, caps=caps, scales=scales, closed_path=closed)
    return done(obj, mat, skip)


def extrude(outline, depth, at=(0.0, 0.0, 0.0), mat=None, plane='XY', centred=False, rim=True,
            skip=0, solid=False):
    """A prism from a counter-clockwise outline on a plane: 'XY' lying flat and rising, 'XZ'
    standing and facing +Y (its thickness goes back from `at`), 'YZ' a side profile extruded
    towards +X. centred puts `at` in the middle of the thickness; rim=False leaves the edge
    faces out (thin sheet seen from both sides)."""
    if rim:
        obj = build.extrude_outline('part', outline, depth)
    else:
        front = [(x, y, 0.0) for x, y in outline]
        back = [(x, y, depth) for x, y in outline]
        count = len(outline)
        obj = build.from_data('part', front + back,
                              [list(reversed(range(count))), list(range(count, 2 * count))])
    ex, ey, ez = (Vector(axis) for axis in PLANES[plane])
    matrix = Matrix((ex, ey, ez)).transposed().to_4x4()
    obj.data.transform(matrix)
    shift = Vector(at) - (ez * (depth / 2) if centred else Vector())
    move(obj, at=shift)
    return done(obj, mat, skip, solid)


def sphere(radius, at=(0.0, 0.0, 0.0), mat=None, seg=10, rings=6, scale=(1.0, 1.0, 1.0), skip=0):
    """A ball, optionally squashed."""
    obj = build.sphere('part', radius=radius, segments=seg, rings=rings)
    move(obj, at=at, scale=scale)
    return done(obj, mat, skip)


def torus(major, minor, at=(0.0, 0.0, 0.0), mat=None, seg=14, sides=6, axis='Z', skip=0):
    """A ring: tyres, wheels, hoops. `axis` is the axle."""
    points = [(major * math.cos(math.tau * index / seg), major * math.sin(math.tau * index / seg), 0.0)
              for index in range(seg)]
    obj = build.tube('part', points, radius=minor, segments=sides, closed_path=True)
    if axis == 'X':
        move(obj, rot=(0.0, math.pi / 2, 0.0))
    elif axis == 'Y':
        move(obj, rot=(-math.pi / 2, 0.0, 0.0))
    move(obj, at=at)
    return done(obj, mat, skip)


def card(width, height, at=(0.0, 0.0, 0.0), mat=None, rot_z=0.0, skip=0, solid=False, segments=(1, 1)):
    """An upright sheet facing +Y (before rot_z), its bottom edge centred on `at`."""
    obj = build.card('part', width=width, height=height, segments=segments)
    move(obj, rot=(0.0, 0.0, math.pi + rot_z))
    move(obj, at=at)
    return done(obj, mat, skip, solid)


def slab(width, depth, at=(0.0, 0.0, 0.0), mat=None, skip=0, segments=(1, 1)):
    """A level sheet facing up, centred on `at`."""
    obj = build.grid('part', size=(width, depth), segments=segments, location=at)
    return done(obj, mat, skip)


def nuts(points, mat=None, radius=0.014, height=0.012, axis='Z', skip=1):
    """Hexagon nuts or bolt heads at points (level 0 only by default)."""
    made = [cyl(radius, height, at=point, seg=6, axis=axis, caps=(False, True), ground=axis == 'Z')
            for point in points]
    return done(join(made), mat, skip)


def ring_points(radius, count, z=0.0, start=0.0):
    """`count` points on a circle at height z, starting `start` radians from +X."""
    return [(radius * math.cos(start + math.tau * index / count),
             radius * math.sin(start + math.tau * index / count), z) for index in range(count)]


def base_plate(radius, thickness, mat, bolt_mat, bolts=4, seg=16, bolt_radius=None):
    """A round flange bolted to the pavement: the plate and its studs and nuts."""
    plate = cyl(radius, thickness, mat=mat, seg=seg, ground=True, caps=(False, True))
    circle = ring_points(bolt_radius or radius * 0.8, bolts, z=thickness, start=math.pi / bolts)
    return [plate, nuts(circle, bolt_mat, radius=max(0.012, radius * 0.075), height=0.016)]


def regular(sides, radius, start=None):
    """A regular polygon outline; by default one edge lies level at the bottom."""
    start = -math.pi / 2 + math.pi / sides if start is None else start
    return profiles.circle(radius, sides, start_angle=start)
