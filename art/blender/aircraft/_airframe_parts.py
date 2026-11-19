"""Parts shared by the Gaviota T-2 and the Halcón: lifting surfaces cut along the chord and the span
(so ailerons, flaps, elevators and rudders are their own hinged pieces), bodies addressed by ring and
facet (windows, stripes, doors), wheels, seats and small fittings. Blender axes: +Y nose, +X right.
"""
import math

import bmesh
import bpy

from lib import atlasbake
from lib import meshkit as mk


def _swap_materials(objs, paths):
    """lib.atlasbake.swap_materials, corrected: a paint material shared by several meshes gets ONE baked
    twin (the library renames the source on the first mesh and then takes it for a new paint on the next,
    which left paint_source, paint_source_source ... in the file). The library is frozen, so this module
    installs the corrected function when it is imported.
    """
    made, twins = {}, {}
    for obj in objs:
        for index, source in enumerate(list(obj.data.materials)):
            pointer = source.as_pointer()
            if pointer not in twins:
                role = atlasbake.role_of(source.name)
                if role not in ('atlas', 'paint'):
                    continue
                key = source.name if role == 'paint' else 'atlas'
                if key not in made:
                    tint = source.get('paint_color') if role == 'paint' else None
                    if role == 'paint':
                        source.name = 'source_of_' + key
                    made[key] = atlasbake.game_material(key, paths, tint)
                twins[pointer] = made[key]
            obj.data.materials[index] = twins[pointer]
        atlasbake._merge_slots(obj)
    return made


atlasbake.swap_materials = _swap_materials


def _outline(chord, thickness, camber, c0, c1, count):
    upper, lower = [], []
    for i in range(count + 1):
        f = i / count
        t = c0 + (c1 - c0) * (0.5 * (1 - math.cos(math.pi * f)) if c0 == 0.0 and c1 == 1.0 else (f * f if c0 == 0.0 else f))
        half = 5 * thickness * (0.2969 * math.sqrt(t) - 0.126 * t - 0.3516 * t ** 2 + 0.2843 * t ** 3 - 0.1015 * t ** 4)
        bend = camber * 4 * t * (1 - t)
        upper.append((t * chord, (bend + half) * chord))
        lower.append((t * chord, (bend - half) * chord))
    if c0 == 0.0:
        lower = lower[1:]
    return upper + lower[::-1]


def cut(sections, a, b, key='x'):
    """The sections of a surface between two span positions (interpolated ends, inner ones kept)."""
    def at(v):
        for s0, s1 in zip(sections, sections[1:]):
            if s0[key] <= v <= s1[key] or s0 is sections[-2]:
                f = (v - s0[key]) / (s1[key] - s0[key])
                out = dict(s0)
                for k in set(s0) | set(s1):
                    if isinstance(s0.get(k, 0.0), (int, float)):
                        out[k] = s0.get(k, 0.0) + (s1.get(k, s0.get(k, 0.0)) - s0.get(k, 0.0)) * f
                return out
    inner = [dict(s) for s in sections if a < s[key] < b]
    return [at(a)] + inner + [at(b)]


def surface(name, sections, c0=0.0, c1=1.0, count=10):
    """A lifting surface (see lib.meshkit.wing) limited to the chord fractions c0..c1."""
    rings = []
    for s in sections:
        twist, cant = math.radians(s.get('twist', 0.0)), math.radians(s.get('cant', 0.0))
        points = []
        for back, up in _outline(s['chord'], s.get('thickness', 0.12), s.get('camber', 0.02), c0, c1, count):
            b = back * math.cos(twist) + up * math.sin(twist)
            u = up * math.cos(twist) - back * math.sin(twist)
            points.append((s['x'] - u * math.sin(cant), s['y'] - b, s.get('z', 0.0) + u * math.cos(cant)))
        rings.append(points)
    return mk.loft(name, rings)


def hinge(section, fraction):
    """The point at a chord fraction of a section's chord line."""
    return (section['x'], section['y'] - fraction * section['chord'], section.get('z', 0.0))


def facet_assign(obj, material, count, choose):
    """Gives a material to the facets choose(ring, facet) of a lofted body with `count` points per ring."""
    names = [m.name for m in obj.data.materials]
    if material.name not in names:
        obj.data.materials.append(material)
        names.append(material.name)
    index = names.index(material.name)
    for poly in obj.data.polygons:
        if len(poly.vertices) == 4 and choose(poly.index // count, poly.index % count):
            poly.material_index = index
    return obj


def _delete(obj, indices):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    doomed = [bm.faces[i] for i in indices]
    bmesh.ops.delete(bm, geom=doomed, context='FACES')
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def facet_split(obj, name, count, choose, drop=None):
    """Moves the chosen facets into a new object; `drop` facets are deleted from the original as well."""
    total = len(obj.data.polygons)
    quads = [p.index for p in obj.data.polygons if len(p.vertices) == 4]
    chosen = {i for i in quads if choose(i // count, i % count)}
    dropped = {i for i in quads if drop and drop(i // count, i % count)}
    part = mk.duplicate(obj, name)
    _delete(part, [i for i in range(total) if i not in chosen])
    _delete(obj, sorted(chosen | dropped))
    return part


def mirror_copy(obj, name):
    """The left-hand twin of a right-hand part."""
    return mk.transform(mk.duplicate(obj, name), scale=(-1, 1, 1))


def wheel(name, radius, width, location, tyre, hub):
    """A tyre with a rounded shoulder on a dished hub (rim lip, sunk web, hub cap), axle along X."""
    profile = [(-0.44, 0.17), (-0.3, 0.26), (-0.3, 0.45), (-0.5, 0.53), (-0.47, 0.8), (-0.36, 0.94), (-0.15, 1.0),
               (0.15, 1.0), (0.36, 0.94), (0.47, 0.8), (0.5, 0.53), (0.3, 0.45), (0.3, 0.26), (0.44, 0.17)]
    rings = []
    for side, scale in profile:
        rings.append([(location[0] + side * width, location[1] + math.sin(a) * radius * scale, location[2] + math.cos(a) * radius * scale)
                      for a in (2 * math.pi * i / 20 for i in range(20))])
    obj = mk.loft(name, rings)
    mk.assign(obj, tyre)
    mk.assign_faces(obj, hub, lambda c, n: math.hypot(c.y - location[1], c.z - location[2]) < radius * 0.535)
    return mk.shade(obj, 50)


def section_at(sections, value, key='x'):
    """The section of a lifting surface at a span position (see cut())."""
    return cut(sections, value, sections[-1][key], key)[0]


def structure(chart, at, stations, fractions, merge=0.3, rivets=0.07, tone=0.5, seam=0.9, width=0.008, row=0.02):
    """Draws a surface's structure on a chart (jet parts' Chart): members along the `fractions` run
    unbroken (spars, fuselage frames), members at the `stations` only between them, and neighbouring
    bays are merged at random into longer panels, each with its own shade. at(station, fraction) is
    the chart point; rivets the fastener spacing along every joint (None for a bonded skin)."""
    for t0, t1 in zip(fractions, fractions[1:]):
        j = 0
        while j < len(stations) - 1:
            k = j + 1
            while k < len(stations) - 1 and chart.rng.random() < merge:
                k += 1
            chart.fill('tone', [at(stations[j], t0), at(stations[k], t0), at(stations[k], t1), at(stations[j], t1)], 0.5 + chart.rng.uniform(-0.5, 0.5) * tone)
            if k < len(stations) - 1:
                chart.seam([at(stations[k], t0), at(stations[k], t1)], width, seam, rivets, row)
            j = k
    for t in fractions:
        chart.seam([at(v, t) for v in stations], width, seam, rivets, row)
    for v in (stations[0], stations[-1]):
        chart.seam([at(v, t) for t in fractions], width, seam, rivets, row)


def edge_wear(chart, points, width=0.05, strength=0.9, reach=0.3):
    """Paint eroded off a leading edge: a chipped band on the edge itself and a fainter scatter behind it."""
    chart.line('wear', points, reach, strength * 0.3, soft=reach * 0.35)
    chart.line('wear', points, width, strength, soft=width * 0.3)


def seat(name, x, y, floor, cloth, frame, width=0.44, pan_height=0.2, back_height=0.66, belts=None):
    """A crew seat: pan, raked back, headrest and (with a belts material) a harness."""
    parts = []
    pan = mk.box(name + '_pan', (width, 0.46, 0.1), (x, y + 0.05, floor + pan_height - 0.05), 0.03)
    back = mk.box(name + '_back', (width, 0.09, back_height), (0, 0, back_height * 0.5), 0.03)
    mk.transform(back, (x, y - 0.2, floor + pan_height - 0.04), (-12, 0, 0))
    head = mk.box(name + '_head', (width * 0.55, 0.08, 0.2), (0, 0, back_height + 0.1), 0.03)
    mk.transform(head, (x, y - 0.2, floor + pan_height - 0.04), (-12, 0, 0))
    for part in (pan, back, head):
        mk.assign(part, cloth)
    base = mk.box(name + '_base', (width * 0.8, 0.36, pan_height - 0.1), (x, y + 0.03, floor + (pan_height - 0.1) * 0.5))
    mk.assign(base, frame)
    parts += [pan, back, head, base]
    if belts is not None:
        for side in (-1, 1):
            strap = mk.box(name + '_strap', (0.045, 0.012, back_height * 0.9), (side * width * 0.2, 0.052, back_height * 0.5))
            mk.transform(strap, (x, y - 0.2, floor + pan_height - 0.04), (-12, 0, 0))
            mk.assign(strap, belts)
            parts.append(strap)
        lap = mk.box(name + '_lap', (width * 0.96, 0.05, 0.012), (x, y - 0.05, floor + pan_height + 0.006))
        mk.assign(lap, belts)
        parts.append(lap)
    return parts


def lamp_bulb(name, location, material, size=(0.07, 0.12, 0.06)):
    """A small rounded lamp lens."""
    return mk.assign(mk.box(name, size, location, min(size) * 0.3, 2), material)


def knob(name, start, end, shaft, cap, radius=0.022):
    """A push-pull control: a thin shaft with a knob at its end."""
    rod = mk.assign(mk.tube(name + '_rod', [start, end], 0.006, 6), shaft)
    head = mk.assign(mk.cylinder(name + '_knob', radius, 0.03, end, 'Y', 12), cap)
    return [rod, head]
