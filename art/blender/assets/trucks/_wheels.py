"""Wheels for the trucks domain: tyres with a sidewall and a moulded tread, steel and alloy rims
with real openings, wheel nuts, hubs and the brake drum seen through the openings, single or
twin.

A wheel is modelled about the Z axis with its outboard face towards +Z and then turned so that
its axle is the X axis and its outboard face looks towards -X: the master is a left-hand wheel
with its origin at the hub. The right-hand wheels are copies turned half a turn about Z.
"""
import math

from lib import build, modify, scene, shading
from lib import materials as M

import _hull as H

TAU = math.tau


def tyre_rubber(radius, width, block=0.045, seed=0, name='tyre'):
    """Tyre rubber with a tread moulded in: grooves round the tyre and angled blocks across it,
    computed from the wheel's own coordinates (axle along X), and fine ribs on the sidewall."""
    graph = M.Graph(name, seed)
    x, y, z = (graph.axis(axis) for axis in 'XYZ')
    radial = graph.math('SQRT', graph.add(graph.mul(y, y), graph.mul(z, z)))
    angle = graph.math('ARCTAN2', z, y)
    tread = graph.remap(radial, radius - 0.034, radius - 0.014, 0.0, 1.0)
    # Three grooves round the tyre.
    lanes = graph.math('ABSOLUTE', graph.math('SINE', graph.mul(x, 3.0 * math.pi / (0.8 * width))))
    grooves = graph.remap(lanes, 0.0, 0.22, 1.0, 0.0)
    # Blocks: a saw of the angle, slanted with the distance from the centre line (a chevron).
    count = round(TAU * radius / block)
    slant = graph.mul(graph.math('ABSOLUTE', x), 9.0)
    phase = graph.math('SINE', graph.add(graph.mul(angle, count), slant))
    sipes = graph.remap(phase, 0.55, 0.9, 0.0, 1.0)
    cut = graph.mul(tread, graph.maximum(grooves, sipes))
    ribs = graph.mul(graph.math('SINE', graph.mul(radial, TAU / 0.014)),
                     graph.remap(radial, radius - 0.07, radius - 0.04, 0.5, 0.0))
    grain = graph.noise(scale=300.0, detail=2.0)
    color = graph.mix(cut, (0.016, 0.016, 0.017), (0.006, 0.006, 0.006))
    coat = M.Coat(graph, color, roughness=graph.remap(grain, 0.3, 0.7, 0.72, 0.88),
                  height=graph.add(graph.mul(cut, -1.0), graph.mul(ribs, 0.12)))
    film = graph.noise(scale=6.0, detail=5.0)
    dust = graph.mul(graph.remap(film, 0.25, 0.8, 0.25, 0.9),
                     graph.remap(radial, radius - 0.2, radius, 0.35, 1.0))
    coat.cover(graph.mul(dust, 0.45), color=(0.16, 0.14, 0.12), roughness=0.95)
    coat.cover(graph.mul(graph.mul(cut, tread), 0.5), color=(0.11, 0.10, 0.085), roughness=0.95)
    return coat.finish(bump_strength=1.0, bump_distance=0.007)


def _radial_out(obj):
    """Turns a lathed surface so that the face furthest from the axis looks away from it."""
    shading.recalc_normals(obj)
    polygon = max(obj.data.polygons, key=lambda p: math.hypot(p.center.x, p.center.y))
    if polygon.normal.x * polygon.center.x + polygon.normal.y * polygon.center.y < 0:
        shading.flip(obj)
    return obj


def tyre(name, radius, width, rim, centre=0.0, segments=22):
    """A tyre about the Z axis, its tread centred on z = centre."""
    wall = radius - rim
    half = width / 2
    profile = [(rim, -0.80 * half), (rim + 0.30 * wall, -0.97 * half), (rim + 0.60 * wall, -half),
               (radius - 0.07 * wall - 0.012, -0.93 * half), (radius - 0.004, -0.74 * half),
               (radius, -0.3 * half), (radius, 0.3 * half), (radius - 0.004, 0.74 * half),
               (radius - 0.07 * wall - 0.012, 0.93 * half), (rim + 0.60 * wall, half),
               (rim + 0.30 * wall, 0.97 * half), (rim, 0.80 * half)]
    obj = build.lathe(name, [(r, z + centre) for r, z in profile], segments=segments)
    return _radial_out(obj)


def _barrel(name, rim, width, centre, segments, lip=0.014):
    """The rim barrel between the beads, seen from inside the dish, with its rolled outer lips."""
    half = width / 2
    profile = [(rim - 0.004, -0.84 * half), (rim + lip, -0.82 * half), (rim + lip, -0.77 * half),
               (rim - 0.012, -0.70 * half), (rim - 0.026, -0.45 * half), (rim - 0.026, 0.45 * half),
               (rim - 0.012, 0.70 * half), (rim + lip, 0.77 * half), (rim + lip, 0.82 * half),
               (rim - 0.004, 0.84 * half)]
    obj = build.lathe(name, [(r, z + centre) for r, z in profile], segments=segments)
    _radial_out(obj)
    return shading.flip(obj)


def _disc(name, rim, face, hub_radius, hub_z, thickness, segments):
    """The wheel disc as a solid plate: a flat hub face at z = hub_z out to hub_radius, then a
    cone to the barrel at z = face. Solid, so openings can be cut through it."""
    edge = rim - 0.024
    front = [(0.0, hub_z), (hub_radius, hub_z), (hub_radius + 0.02, hub_z - 0.006 * (1 if hub_z > face else -1)),
             (0.5 * (hub_radius + edge), 0.5 * (hub_z + face)), (edge - 0.02, face), (edge, face)]
    back = [(r, z - thickness) for r, z in reversed(front)]
    obj = build.lathe(name, front + back, segments=segments)
    shading.recalc_normals(obj)
    return obj


def _openings(disc, count, kind, inner, outer, z_low, z_high, phase=0.0):
    """Cuts `count` openings through a disc between two radii: round holes, slots or the
    windows between spokes."""
    cutters = []
    for index in range(count):
        angle = phase + TAU * index / count
        if kind == 'round':
            radius = (outer - inner) / 2
            polygon = [((inner + radius) + radius * math.cos(TAU * step / 10),
                        radius * math.sin(TAU * step / 10)) for step in range(10)]
        elif kind == 'slot':
            half = 0.34 * TAU / count
            polygon = H.rounded([(inner * math.cos(-half), inner * math.sin(-half)),
                                 (outer * math.cos(-half), outer * math.sin(-half)),
                                 (outer * math.cos(half), outer * math.sin(half)),
                                 (inner * math.cos(half), inner * math.sin(half))],
                                0.45 * (outer - inner), steps=3)
        else:   # the window between two spokes: a wedge that leaves spokes of even width
            spoke = 0.5 * 0.34 * (TAU / count)
            low, high = spoke * 1.25, TAU / count - spoke * 1.25
            steps = 4
            arc_out = [(outer * math.cos(low + (high - low) * step / steps),
                        outer * math.sin(low + (high - low) * step / steps))
                       for step in range(steps + 1)]
            middle = (low + high) / 2
            narrow = 0.5 * (high - low) * 0.45
            arc_in = [(inner * math.cos(middle + narrow), inner * math.sin(middle + narrow)),
                      (inner * math.cos(middle - narrow), inner * math.sin(middle - narrow))]
            polygon = H.rounded(arc_out + arc_in, [0.012] + [0.0] * (steps - 1) + [0.012, 0.01, 0.01],
                                steps=2)
        cutter = H.prism(f'opening{index}', polygon, H.TOP, z_low, z_high)
        scene.move(cutter, rotation=(0.0, 0.0, angle))
        cutters.append(cutter)
    return H.cut(disc, cutters)


def _nuts(name, count, circle, z, size=0.013, height=0.02, phase=0.0):
    nuts = []
    for index in range(count):
        angle = phase + TAU * index / count
        nuts.append(build.cylinder(f'{name}{index}', radius=size, depth=height, segments=6,
                                   location=(circle * math.cos(angle), circle * math.sin(angle), z),
                                   on_ground=True))
    return scene.join(nuts, name)


def wheel(name, radius, width, rim, mats, style='steel', twin=False, segments=22):
    """One wheel (or a twin pair) as a single mesh, origin at the hub, outboard towards -X.

    mats: 'tyre', 'rim', 'cap', 'drum' materials. style: 'steel' (round vent holes, a hub cap),
    'alloy' (six spokes), 'offroad' (a deep steel wheel with slots and a bolted ring) or
    'truck' (a heavy ten-stud wheel with hand holes and a standing hub; with twin=True a dished
    outer wheel over an inner one).
    """
    half = width / 2
    spacing = width + 0.035
    outer_centre = spacing / 2 if twin else 0.0
    parts = []

    def add(obj, material):
        obj.data.materials.append(material)
        parts.append(obj)

    add(tyre(f'{name}_tyre', radius, width, rim, outer_centre, segments), mats['tyre'])
    add(_barrel(f'{name}_barrel', rim, width, outer_centre, segments), mats['rim'])
    if twin:
        add(tyre(f'{name}_tyre_in', radius, width, rim, -outer_centre, segments), mats['tyre'])
        add(_barrel(f'{name}_barrel_in', rim, width, -outer_centre, max(12, segments - 6)),
            mats['drum'])

    out = outer_centre + half
    if style == 'steel':
        face = out - 0.34 * width
        disc = _disc(f'{name}_disc', rim, face, 0.42 * rim, face + 0.035, 0.012, segments)
        _openings(disc, 8, 'round', 0.60 * rim, 0.80 * rim, face - 0.08, face + 0.1,
                  phase=TAU / 16)
        add(disc, mats['rim'])
        cap = build.lathe(f'{name}_cap', [(0.36 * rim, face + 0.035), (0.34 * rim, face + 0.062),
                                          (0.24 * rim, face + 0.085), (0.0, face + 0.092)],
                          segments=14)
        add(_radial_out(cap), mats['cap'])
        add(_nuts(f'{name}_nut', 6, 0.50 * rim, face + 0.03, size=0.012, height=0.026),
            mats['cap'])
        drum_face = face - 0.03
    elif style == 'alloy':
        face = out - 0.30 * width
        disc = _disc(f'{name}_disc', rim, face, 0.30 * rim, face + 0.028, 0.03, segments)
        _openings(disc, 6, 'spoke', 0.40 * rim, 0.88 * rim, face - 0.1, face + 0.1)
        add(disc, mats['rim'])
        cap = build.lathe(f'{name}_cap', [(0.20 * rim, face + 0.028), (0.19 * rim, face + 0.045),
                                          (0.0, face + 0.05)], segments=12)
        add(_radial_out(cap), mats['cap'])
        add(_nuts(f'{name}_nut', 6, 0.25 * rim, face + 0.024, size=0.011, height=0.022,
                  phase=TAU / 12), mats['cap'])
        drum_face = face - 0.045
    elif style == 'offroad':
        face = out - 0.42 * width
        disc = _disc(f'{name}_disc', rim, face, 0.40 * rim, face + 0.02, 0.014, segments)
        _openings(disc, 8, 'slot', 0.56 * rim, 0.84 * rim, face - 0.1, face + 0.1,
                  phase=TAU / 16)
        add(disc, mats['rim'])
        ring = build.lathe(f'{name}_ring', [(rim + 0.016, out - 0.20 * half), (rim + 0.022, out - 0.13 * half),
                                            (rim - 0.02, out - 0.13 * half), (rim - 0.026, out - 0.20 * half)],
                           segments=segments)
        add(_radial_out(ring), mats['rim'])
        add(_nuts(f'{name}_bolt', 16, rim - 0.002, out - 0.135 * half, size=0.008, height=0.01),
            mats['cap'])
        cap = build.lathe(f'{name}_cap', [(0.26 * rim, face + 0.02), (0.25 * rim, face + 0.07),
                                          (0.16 * rim, face + 0.085), (0.0, face + 0.088)],
                          segments=10)
        add(_radial_out(cap), mats['rim'])
        add(_nuts(f'{name}_nut', 5, 0.33 * rim, face + 0.016, size=0.012, height=0.024),
            mats['cap'])
        drum_face = face - 0.03
    else:   # truck
        if twin:
            face = outer_centre - 0.10 * width
            hub_z = face + 0.03
        else:
            face = out - 0.60 * width
            hub_z = out - 0.24 * width
        disc = _disc(f'{name}_disc', rim, face, 0.50 * rim, hub_z, 0.014, segments)
        _openings(disc, 10 if not twin else 8, 'round', 0.66 * rim, 0.84 * rim,
                  min(face, hub_z) - 0.1, max(face, hub_z) + 0.1, phase=TAU / 20)
        add(disc, mats['rim'])
        proud = 0.16 if twin else 0.07
        hub = build.lathe(f'{name}_hub', [(0.30 * rim, hub_z), (0.29 * rim, hub_z + 0.6 * proud),
                                          (0.20 * rim, hub_z + 0.75 * proud),
                                          (0.19 * rim, hub_z + proud),
                                          (0.0, hub_z + proud + 0.01)], segments=12)
        add(_radial_out(hub), mats['drum'])
        add(_nuts(f'{name}_nut', 10, 0.41 * rim, hub_z, size=0.014, height=0.03), mats['cap'])
        drum_face = min(face, hub_z) - 0.03

    # The brake drum behind the disc and the dark back of the wheel.
    inner_end = (-outer_centre - 0.8 * half) if twin else -0.8 * half
    drum = build.lathe(f'{name}_drum', [(0.0, drum_face), (0.72 * rim, drum_face),
                                        (0.80 * rim, drum_face - 0.02),
                                        (0.80 * rim, inner_end + 0.03), (0.5 * rim, inner_end),
                                        (0.0, inner_end)], segments=12)
    add(_radial_out(drum), mats['drum'])

    obj = scene.join(parts, name)
    scene.move(obj, rotation=(0.0, -math.pi / 2, 0.0))      # axle along X, outboard towards -X
    shading.smooth(obj, angle=math.radians(40))
    return obj
