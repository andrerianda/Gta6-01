"""Outlines and paths as plain lists of points, the raw material of build.loft, build.sweep,
build.lathe and build.extrude_outline.

A 2D outline is a list of (x, y) tuples in counter-clockwise order (seen with +X to the right and
+Y up); a path is a list of (x, y, z) tuples. Nothing here touches Blender data.
"""
import math


def circle(radius=0.5, segments=16, start_angle=0.0):
    """A circle outline, counter-clockwise, starting at `start_angle` radians from +X."""
    return [(radius * math.cos(start_angle + math.tau * i / segments),
             radius * math.sin(start_angle + math.tau * i / segments)) for i in range(segments)]


def ellipse(radius_x=0.5, radius_y=0.3, segments=16):
    """An ellipse outline."""
    return [(radius_x * math.cos(math.tau * i / segments),
             radius_y * math.sin(math.tau * i / segments)) for i in range(segments)]


def rectangle(width=1.0, height=1.0):
    """A rectangle outline centred on the origin."""
    half_w, half_h = width / 2, height / 2
    return [(-half_w, -half_h), (half_w, -half_h), (half_w, half_h), (-half_w, half_h)]


def rounded_rectangle(width=1.0, height=1.0, radius=0.1, corner_segments=4):
    """A rectangle with circular corners; `radius` is clamped to half the shorter side."""
    radius = min(radius, width / 2 - 1e-6, height / 2 - 1e-6)
    half_w, half_h = width / 2 - radius, height / 2 - radius
    points = []
    corners = ((half_w, -half_h, -math.pi / 2), (half_w, half_h, 0.0),
               (-half_w, half_h, math.pi / 2), (-half_w, -half_h, math.pi))
    for centre_x, centre_y, start in corners:
        for i in range(corner_segments + 1):
            angle = start + (math.pi / 2) * i / corner_segments
            points.append((centre_x + radius * math.cos(angle), centre_y + radius * math.sin(angle)))
    return points


def superellipse(radius_x=0.5, radius_y=0.5, exponent=4.0, segments=24):
    """A superellipse ("squircle"): exponent 2 is an ellipse, larger values approach a rectangle."""
    points = []
    for i in range(segments):
        angle = math.tau * i / segments
        cos_a, sin_a = math.cos(angle), math.sin(angle)
        points.append((radius_x * math.copysign(abs(cos_a) ** (2.0 / exponent), cos_a),
                       radius_y * math.copysign(abs(sin_a) ** (2.0 / exponent), sin_a)))
    return points


def arc(radius=1.0, start_angle=0.0, end_angle=math.pi / 2, segments=8, centre=(0.0, 0.0)):
    """An open arc of segments + 1 points from start_angle to end_angle (radians)."""
    return [(centre[0] + radius * math.cos(start_angle + (end_angle - start_angle) * i / segments),
             centre[1] + radius * math.sin(start_angle + (end_angle - start_angle) * i / segments))
            for i in range(segments + 1)]


def scaled(outline, scale_x=1.0, scale_y=None):
    """The outline scaled about the origin."""
    scale_y = scale_x if scale_y is None else scale_y
    return [(x * scale_x, y * scale_y) for x, y in outline]


def offset(outline, dx=0.0, dy=0.0):
    """The outline moved by (dx, dy)."""
    return [(x + dx, y + dy) for x, y in outline]


def rotated(outline, angle):
    """The outline rotated counter-clockwise by `angle` radians about the origin."""
    cos_a, sin_a = math.cos(angle), math.sin(angle)
    return [(x * cos_a - y * sin_a, x * sin_a + y * cos_a) for x, y in outline]


def on_plane(outline, origin=(0.0, 0.0, 0.0), plane='XY'):
    """Lifts a 2D outline into 3D on a principal plane through `origin` ('XY', 'XZ' or 'YZ')."""
    ox, oy, oz = origin
    if plane == 'XY':
        return [(ox + x, oy + y, oz) for x, y in outline]
    if plane == 'XZ':
        return [(ox + x, oy, oz + y) for x, y in outline]
    if plane == 'YZ':
        return [(ox, oy + x, oz + y) for x, y in outline]
    raise ValueError(f'unknown plane {plane!r}')


def lerp(a, b, t):
    """Linear interpolation between two numbers or two equal-length tuples."""
    if isinstance(a, (int, float)):
        return a + (b - a) * t
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def smoothstep(edge0, edge1, x):
    """The usual smooth 0..1 ramp between two edges."""
    t = min(1.0, max(0.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def polyline_length(points, closed=False):
    """Total length of a polyline of 2D or 3D points."""
    total = 0.0
    count = len(points) if closed else len(points) - 1
    for i in range(count):
        total += math.dist(points[i], points[(i + 1) % len(points)])
    return total


def resample(points, count, closed=False):
    """`count` points evenly spaced by arc length along a polyline (2D or 3D)."""
    source = list(points) + ([points[0]] if closed else [])
    lengths = [0.0]
    for i in range(len(source) - 1):
        lengths.append(lengths[-1] + math.dist(source[i], source[i + 1]))
    total = lengths[-1]
    steps = count if closed else count - 1
    result, segment = [], 0
    for i in range(count):
        target = total * i / steps
        while segment < len(source) - 2 and lengths[segment + 1] < target:
            segment += 1
        span = lengths[segment + 1] - lengths[segment]
        t = 0.0 if span <= 1e-12 else (target - lengths[segment]) / span
        result.append(lerp(source[segment], source[segment + 1], min(1.0, max(0.0, t))))
    return result


def smooth_path(points, subdivisions=4, closed=False):
    """A Catmull-Rom spline through the points: `subdivisions` new points per original span."""
    count = len(points)
    if count < 3:
        return list(points)
    result = []
    spans = count if closed else count - 1
    for i in range(spans):
        if closed:
            p0, p1 = points[(i - 1) % count], points[i]
            p2, p3 = points[(i + 1) % count], points[(i + 2) % count]
        else:
            p0, p1 = points[max(i - 1, 0)], points[i]
            p2, p3 = points[i + 1], points[min(i + 2, count - 1)]
        for step in range(subdivisions):
            t = step / subdivisions
            t2, t3 = t * t, t * t * t
            result.append(tuple(
                0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2
                       + (-a + 3 * b - 3 * c + d) * t3)
                for a, b, c, d in zip(p0, p1, p2, p3)))
    if not closed:
        result.append(tuple(points[-1]))
    return result


def bezier(p0, p1, p2, p3, segments=12):
    """A cubic Bezier curve as segments + 1 points (2D or 3D control points)."""
    result = []
    for i in range(segments + 1):
        t = i / segments
        s = 1.0 - t
        result.append(tuple(s * s * s * a + 3 * s * s * t * b + 3 * s * t * t * c + t * t * t * d
                            for a, b, c, d in zip(p0, p1, p2, p3)))
    return result
