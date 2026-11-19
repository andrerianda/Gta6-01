"""Shared helper of the hero cars: curves a car is described with.

A car body is written down as a handful of curves over its length (the roof line, the belt
line, the plan outline, ...). Curve turns a short list of (position, value) control points into
a smooth function that never overshoots between its points (a monotone cubic), so a designer's
numbers are what the body passes through. Nothing here touches Blender.
"""
import math


class Curve:
    """A smooth function through control points [(x, value), ...] (monotone cubic Hermite).

    Outside its first and last point the curve stays constant. Two points close together give
    a quick but still smooth step: that is how a corner in a profile is written.
    """

    def __init__(self, *points):
        points = sorted((float(x), float(value)) for x, value in points)
        self.xs = [x for x, _value in points]
        self.values = [value for _x, value in points]
        count = len(points)
        if count == 1:
            self.tangents = [0.0]
            return
        slopes = [(self.values[i + 1] - self.values[i]) / (self.xs[i + 1] - self.xs[i])
                  for i in range(count - 1)]
        tangents = [slopes[0]] + [0.0] * (count - 2) + [slopes[-1]]
        for i in range(1, count - 1):
            if slopes[i - 1] * slopes[i] > 0.0:
                before = self.xs[i] - self.xs[i - 1]
                after = self.xs[i + 1] - self.xs[i]
                weight_a, weight_b = 2.0 * after + before, after + 2.0 * before
                tangents[i] = (weight_a + weight_b) / (weight_a / slopes[i - 1] + weight_b / slopes[i])
        self.tangents = tangents

    def __call__(self, x):
        xs, values = self.xs, self.values
        if x <= xs[0]:
            return values[0]
        if x >= xs[-1]:
            return values[-1]
        low, high = 0, len(xs) - 1
        while high - low > 1:
            middle = (low + high) // 2
            if xs[middle] <= x:
                low = middle
            else:
                high = middle
        span = xs[high] - xs[low]
        t = (x - xs[low]) / span
        t2, t3 = t * t, t * t * t
        return ((2 * t3 - 3 * t2 + 1) * values[low] + (t3 - 2 * t2 + t) * span * self.tangents[low]
                + (-2 * t3 + 3 * t2) * values[high] + (t3 - t2) * span * self.tangents[high])


def constant(value):
    """A curve with one value everywhere."""
    return Curve((0.0, value))


def smoothstep(x):
    """The 0..1 ease of a 0..1 value, clamped."""
    x = min(1.0, max(0.0, x))
    return x * x * (3.0 - 2.0 * x)


def lerp(a, b, t):
    """Linear interpolation of two numbers."""
    return a + (b - a) * t


def norm_ratio(a, b, soft, hard):
    """How far a point (a, b) of the unit square is pulled towards the origin to round the
    square's corner: the ratio of a nearly square norm (exponent `hard`) to a rounder one
    (exponent `soft`). It is 1 on both axes, so a shape scaled by it keeps its length and its
    width and only loses its corner; a smaller `soft` gives a larger corner radius."""
    a, b = abs(a), abs(b)
    if a < 1e-9 or b < 1e-9:
        return 1.0
    return ((a ** hard + b ** hard) ** (1.0 / hard)) / ((a ** soft + b ** soft) ** (1.0 / soft))


def spaced(keys, fine_zones, coarse, fine):
    """Stations along the car from named key positions.

    keys: [(name, y), ...] sorted by y; between two keys the gap is divided evenly into steps
    no longer than `fine` (when the gap lies in one of fine_zones, a list of (y0, y1)) or
    `coarse`. Returns (positions, {name: index})."""
    positions = [keys[0][1]]
    names = {keys[0][0]: 0}
    for (_name, start), (name, end) in zip(keys, keys[1:]):
        if end - start < 1e-6:
            names[name] = len(positions) - 1
            continue
        middle = (start + end) / 2
        step = fine if any(low <= middle <= high for low, high in fine_zones) else coarse
        count = max(1, math.ceil((end - start) / step - 1e-6))
        for index in range(1, count + 1):
            positions.append(start + (end - start) * index / count)
        names[name] = len(positions) - 1
    return positions, names
