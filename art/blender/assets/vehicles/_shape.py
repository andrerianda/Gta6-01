"""Plain geometry for the car kit: guide curves, rounded outlines and projection frames.

Nothing here touches Blender data except mathutils vectors. A car body is described by a handful
of guide curves over its length (see _body.py); Curve interpolates them without overshoot, so a
profile drawn with a few knots stays the shape that was meant. Outlines are 2D point lists used
as stencils that are projected onto the body (lamps, grilles, wheel arches).
"""
import bisect
import math

from mathutils import Vector


class Curve:
    """A shape-preserving cubic through (t, value) knots (monotone between knots, no overshoot).

    Outside the knots the value is held. Two knots a centimetre or two apart make a crease.
    """

    def __init__(self, knots):
        knots = sorted((float(t), float(v)) for t, v in knots)
        self.t = [t for t, _ in knots]
        self.v = [v for _, v in knots]
        count = len(knots)
        if count == 1:
            self.d = [0.0]
            return
        h = [self.t[i + 1] - self.t[i] for i in range(count - 1)]
        delta = [(self.v[i + 1] - self.v[i]) / h[i] for i in range(count - 1)]
        d = [0.0] * count
        d[0], d[-1] = delta[0], delta[-1]
        for i in range(1, count - 1):
            if delta[i - 1] * delta[i] > 0.0:
                w1, w2 = 2.0 * h[i] + h[i - 1], h[i] + 2.0 * h[i - 1]
                d[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i])
        self.d = d

    def __call__(self, t):
        if t <= self.t[0]:
            return self.v[0]
        if t >= self.t[-1]:
            return self.v[-1]
        i = bisect.bisect_right(self.t, t) - 1
        h = self.t[i + 1] - self.t[i]
        s = (t - self.t[i]) / h
        s2, s3 = s * s, s * s * s
        return ((2 * s3 - 3 * s2 + 1) * self.v[i] + (s3 - 2 * s2 + s) * h * self.d[i]
                + (-2 * s3 + 3 * s2) * self.v[i + 1] + (s3 - s2) * h * self.d[i + 1])

    def slope(self, t, step=0.01):
        """The derivative at t (central difference)."""
        return (self(t + step) - self(t - step)) / (2.0 * step)


def as_curve(value):
    """A Curve from a list of knots, or a constant function from a number."""
    if isinstance(value, Curve):
        return value
    if isinstance(value, (int, float)):
        return Curve([(0.0, value)])
    return Curve(value)


def lerp(a, b, t):
    return a + (b - a) * t


def smoothstep(edge0, edge1, x):
    t = min(1.0, max(0.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def rounded_polygon(points, radius=0.02, steps=3):
    """Rounds the corners of a closed 2D polygon. Each point is (x, y) or (x, y, radius); a
    radius of 0 keeps the corner sharp. Returns a list of (x, y)."""
    count = len(points)
    result = []
    for index in range(count):
        point = points[index]
        corner_radius = point[2] if len(point) > 2 else radius
        here = Vector(point[:2])
        before = Vector(points[index - 1][:2])
        after = Vector(points[(index + 1) % count][:2])
        to_before, to_after = before - here, after - here
        if corner_radius <= 0.0 or to_before.length < 1e-9 or to_after.length < 1e-9:
            result.append((here.x, here.y))
            continue
        angle = to_before.angle(to_after)
        if angle > math.pi - 1e-3 or angle < 1e-3:
            result.append((here.x, here.y))
            continue
        cut = min(corner_radius / math.tan(angle / 2.0), to_before.length * 0.48,
                  to_after.length * 0.48)
        used = cut * math.tan(angle / 2.0)
        start = here + to_before.normalized() * cut
        end = here + to_after.normalized() * cut
        bisector = (to_before.normalized() + to_after.normalized()).normalized()
        centre = here + bisector * (used / math.sin(angle / 2.0))
        a0 = math.atan2(start.y - centre.y, start.x - centre.x)
        a1 = math.atan2(end.y - centre.y, end.x - centre.x)
        sweep = a1 - a0
        while sweep > math.pi:
            sweep -= math.tau
        while sweep < -math.pi:
            sweep += math.tau
        for step in range(steps + 1):
            a = a0 + sweep * step / steps
            result.append((centre.x + used * math.cos(a), centre.y + used * math.sin(a)))
    return result


def circle_outline(centre, radius, segments=24, start=0.0, end=math.tau):
    """Points on a circle (closed when start..end is a full turn, else an open arc)."""
    full = abs(end - start) >= math.tau - 1e-9
    count = segments if full else segments + 1
    return [(centre[0] + radius * math.cos(start + (end - start) * i / segments),
             centre[1] + radius * math.sin(start + (end - start) * i / segments))
            for i in range(count)]


def superellipse_outline(centre, half_width, half_height, exponent=3.0, segments=20):
    """A closed squircle outline."""
    points = []
    for i in range(segments):
        a = math.tau * i / segments
        c, s = math.cos(a), math.sin(a)
        points.append((centre[0] + half_width * math.copysign(abs(c) ** (2.0 / exponent), c),
                       centre[1] + half_height * math.copysign(abs(s) ** (2.0 / exponent), s)))
    return points


def point_in_polygon(point, polygon):
    """Even-odd test of a 2D point against a closed polygon."""
    x, y = point
    inside = False
    count = len(polygon)
    for index in range(count):
        x0, y0 = polygon[index]
        x1, y1 = polygon[(index + 1) % count]
        if (y0 > y) != (y1 > y) and x < x0 + (x1 - x0) * (y - y0) / (y1 - y0):
            inside = not inside
    return inside


def polygon_bounds(polygon):
    xs = [p[0] for p in polygon]
    ys = [p[1] for p in polygon]
    return min(xs), min(ys), max(xs), max(ys)


def offset_polygon(polygon, distance):
    """Grows (positive) or shrinks a roughly convex polygon by moving every point along the
    mean of its two edge normals. Good enough for lamp bezels and frames."""
    area = 0.0
    count = len(polygon)
    for index in range(count):
        x0, y0 = polygon[index]
        x1, y1 = polygon[(index + 1) % count]
        area += x0 * y1 - x1 * y0
    sign = 1.0 if area > 0.0 else -1.0
    result = []
    for index in range(count):
        here = Vector(polygon[index])
        before = Vector(polygon[index - 1])
        after = Vector(polygon[(index + 1) % count])
        e0, e1 = (here - before), (after - here)
        n0 = Vector((e0.y, -e0.x)).normalized() if e0.length > 1e-9 else Vector((0, 0))
        n1 = Vector((e1.y, -e1.x)).normalized() if e1.length > 1e-9 else Vector((0, 0))
        normal = n0 + n1
        if normal.length < 1e-9:
            result.append(tuple(here))
            continue
        normal.normalize()
        scale = 1.0 / max(0.4, normal.dot(n1) if n1.length else 1.0)
        moved = here + normal * (distance * sign * scale)
        result.append((moved.x, moved.y))
    return result


class Frame:
    """A projection frame: 2D stencil coordinates (a, b) lie along `u` and `v` through
    `origin`, and `out` is the direction the stencil is seen from (it points away from the
    surface the stencil is projected on)."""

    def __init__(self, origin, u, v, out):
        self.origin = Vector(origin)
        self.u = Vector(u).normalized()
        self.v = Vector(v).normalized()
        self.out = Vector(out).normalized()

    @classmethod
    def side(cls, origin=(0.0, 0.0, 0.0)):
        """Looking at the car's right side: a = forward (Y), b = up (Z)."""
        return cls(origin, (0, 1, 0), (0, 0, 1), (1, 0, 0))

    @classmethod
    def front(cls, origin=(0.0, 0.0, 0.0)):
        """Looking at the nose: a = the car's right (X), b = up (Z)."""
        return cls(origin, (1, 0, 0), (0, 0, 1), (0, 1, 0))

    @classmethod
    def rear(cls, origin=(0.0, 0.0, 0.0)):
        """Looking at the tail: a = the car's right (X), b = up (Z)."""
        return cls(origin, (1, 0, 0), (0, 0, 1), (0, -1, 0))

    @classmethod
    def top(cls, origin=(0.0, 0.0, 0.0)):
        """Looking down: a = the car's right (X), b = forward (Y)."""
        return cls(origin, (1, 0, 0), (0, 1, 0), (0, 0, 1))

    @classmethod
    def corner(cls, origin, heading, pitch=0.0):
        """Looking at a corner of the car. `heading` is the angle in radians of the view
        direction from the car's front (+Y) towards its right (+X): 0 is the front view,
        pi/2 the right side, pi the rear. a = horizontal, towards the car's right-rear as the
        heading grows; b = up. `pitch` tilts the view direction upwards."""
        out = Vector((math.sin(heading) * math.cos(pitch), math.cos(heading) * math.cos(pitch),
                      math.sin(pitch)))
        u = Vector((math.cos(heading), -math.sin(heading), 0.0))
        v = out.cross(u)
        if v.z < 0.0:
            v = -v
        return cls(origin, u, v, out)

    def to2d(self, point):
        offset = Vector(point) - self.origin
        return offset.dot(self.u), offset.dot(self.v)

    def to3d(self, a, b, depth=0.0):
        return self.origin + self.u * a + self.v * b + self.out * depth

    def depth(self, point):
        return (Vector(point) - self.origin).dot(self.out)
