"""Shared helper of the hero cars: the fittings that are not body metal.

wheel() is an alloy wheel with a low-profile tyre, brake disc and caliper; tail_lamps() the
round lamp units set into the tail; interior_half() the right half of the cabin (tub, seat,
dashboard, console) and steering_wheel() the wheel on its hub. Everything is modelled with the
library's builders at real size, in the car's own coordinates unless a function says otherwise,
and tagged with the level of detail it survives to (see _mesh).

Blender axes: Z up, nose towards +Y, right side +X.
"""
import math

from lib import build, modify, scene, shading

import _mesh


def wheel(name, hub, radius, width, materials, rim_ratio=0.69, spokes=5):
    """A wheel for the right side of the car, origin at `hub`, axle along X, outer face +X.
    materials: tyre, alloy, disc, caliper, dark."""
    rim, half = radius * rim_ratio, 0.5 * width
    tyre = build.lathe('tyre', [(rim, -half + 0.014), (rim + 0.03, -half), (radius - 0.024, -half + 0.003),
                                (radius - 0.005, -half + 0.028), (radius, -half + 0.06),
                                (radius, half - 0.06), (radius - 0.005, half - 0.028),
                                (radius - 0.024, half - 0.003), (rim + 0.03, half),
                                (rim, half - 0.014)], segments=32)
    scene.set_material(tyre, materials['tyre'])
    back = build.cylinder('back', radius=rim + 0.004, depth=0.012, segments=20,
                          location=(0.0, 0.0, -half + 0.05))
    scene.set_material(back, materials['dark'])
    simple = [_mesh.tag_level(part, 2) for part in (tyre, back)]

    dish = build.lathe('dish', [(rim - 0.022, -half + 0.05), (rim - 0.016, half - 0.07),
                                (rim - 0.010, half - 0.03), (rim + 0.005, half - 0.012)],
                       segments=32)
    shading.flip(dish)
    lip = build.lathe('lip', [(rim + 0.005, half - 0.012), (rim + 0.004, half - 0.02)], segments=32)
    face = half - 0.045
    length = rim - 0.045
    bars = []
    for angle in (-0.17, 0.17):
        bar = build.box(f'bar{angle}', (0.03, length, 0.024), location=(0.0, 0.035 + 0.5 * length, face))
        modify.bevel(bar, width=0.006, segments=1)
        modify.transform(bar, rotation=(0.0, 0.0, angle))
        bars.append(bar)
    star = scene.join(bars, 'star')

    def dished(point):
        # The spokes fall away towards the hub, so the face of the wheel is a shallow cone.
        point.z -= 0.03 * (1.0 - min(1.0, math.hypot(point.x, point.y) / rim))
        return point

    modify.map_vertices(star, dished)
    modify.radial_array(star, spokes, axis='Z')
    centre = build.lathe('centre', [(0.07, face - 0.06), (0.066, face - 0.022), (0.05, face - 0.012),
                                    (0.0, face - 0.008)], segments=16)
    for part in (dish, lip, star, centre):
        scene.set_material(part, materials['alloy'])
    disc = build.cylinder('disc', radius=rim - 0.04, depth=0.026, segments=24,
                          location=(0.0, 0.0, half - 0.12))
    scene.set_material(disc, materials['disc'])
    caliper = build.box('caliper', (0.075, 0.15, 0.07), location=(-(rim - 0.085), 0.02, half - 0.12))
    modify.bevel(caliper, width=0.012, segments=2)
    scene.set_material(caliper, materials['caliper'])
    detail = [_mesh.tag_level(part, 1) for part in (dish, lip, star, centre, disc, caliper)]

    obj = scene.join(simple + detail, name)
    modify.transform(obj, rotation=(0.0, 0.5 * math.pi, 0.0))
    modify.transform(obj, location=hub)
    scene.set_origin(obj, hub)
    return _mesh.freeze_normals(obj, math.radians(35))      # frozen last: they do not turn


def round_lamp(name, centre, radius, ring, core, bezel, facing=-1.0):
    """A round lamp unit facing -Y (facing -1) or +Y: a bright bezel, a ring lens and a domed
    core lens, each with its own material. Returns the list of its parts."""
    rim = build.lathe(f'{name}_bezel', [(radius * 1.12, -0.045), (radius * 1.12, 0.006),
                                        (radius, 0.011)], segments=24)
    scene.set_material(rim, bezel)
    lens = build.lathe(f'{name}_ring', [(radius, 0.009), (radius * 0.56, 0.016)], segments=24)
    scene.set_material(lens, ring)
    dome = build.lathe(f'{name}_core', [(radius * 0.56, 0.016), (radius * 0.3, 0.023),
                                        (0.0, 0.026)], segments=24)
    scene.set_material(dome, core)
    parts = [rim, lens, dome]
    for part in parts:
        modify.transform(part, rotation=(-facing * 0.5 * math.pi, 0.0, 0.0))
        modify.transform(part, location=centre)
    return _mesh.tagged(parts, 1)


def _newell(points):
    """The (unnormalised) normal of a polygon given as a list of (x, y, z)."""
    nx = ny = nz = 0.0
    for (x1, y1, z1), (x2, y2, z2) in zip(points, points[1:] + points[:1]):
        nx += (y1 - y2) * (z1 + z2)
        ny += (z1 - z2) * (x1 + x2)
        nz += (x1 - x2) * (y1 + y2)
    return nx, ny, nz


def sweep_x(name, xs, outline, edges, materials, ends=(True, True), end_material=None, level=1):
    """A block swept along X through the stations `xs`: outline(x) is a closed loop of (y, z)
    points (the same count at every station), so the block can follow a bowed end face. Edge n
    of the loop (point n to point n + 1) gets the material name edges[n], or no faces when it is
    None (a side buried in the body). ends: whether to close the first and the last station
    (False on the centreline of a mirrored half). Returns a one-item list ready to join."""
    data = _mesh.MeshData()
    loops = [[(x, y, z) for y, z in outline(x)] for x in xs]
    ids = [[data.point(p) for p in loop] for loop in loops]
    count = len(loops[0])

    def add(face, outward, material):
        corners = [data.points[k] for k in face]
        normal = _newell(corners)
        if sum(a * b for a, b in zip(normal, outward)) < 0.0:
            face, corners = face[::-1], corners[::-1]
        data.face(face, material, level, uvs=[(p[0] + p[1], p[2] - p[1]) for p in corners])

    for i in range(len(xs) - 1):
        centre_y = sum(p[1] for p in loops[i]) / count
        centre_z = sum(p[2] for p in loops[i]) / count
        for n, material in enumerate(edges):
            if material is None:
                continue
            m = (n + 1) % count
            a, b = loops[i][n], loops[i][m]
            outward = (0.0, 0.5 * (a[1] + b[1]) - centre_y, 0.5 * (a[2] + b[2]) - centre_z)
            add([ids[i][n], ids[i][m], ids[i + 1][m], ids[i + 1][n]], outward, material)
    for index, sign in ((0, -1.0), (-1, 1.0)):
        if ends[index]:
            add(list(ids[index]), (sign, 0.0, 0.0), end_material or edges[0])
    return _mesh.tagged([data.to_object(name, materials)], level, angle=math.radians(30))


def door_mirror(name, mount, materials):
    """A door mirror of the right side: a stalk from `mount` (on the door at the base of the
    glass) to a rounded housing outboard of it, with the mirror glass facing back.
    materials: paint, chrome, trim."""
    x, y, z = mount
    centre = (x + 0.125, y - 0.01, z + 0.066)
    housing = build.box(f'{name}_housing', (0.175, 0.085, 0.098), location=centre)
    modify.bevel(housing, width=0.036, segments=3)
    scene.set_material(housing, materials['paint'])
    glass = build.box(f'{name}_glass', (0.13, 0.006, 0.06),
                      location=(centre[0], centre[1] - 0.043, centre[2]))
    scene.set_material(glass, materials['chrome'])
    stalk = build.box(f'{name}_stalk', (0.1, 0.045, 0.026), location=(x + 0.03, y - 0.01, z + 0.03))
    modify.bevel(stalk, width=0.008, segments=1)
    scene.set_material(stalk, materials['trim'])
    return _mesh.tagged([housing, glass, stalk], 1)


def door_handle(name, centre, materials):
    """A slim bright pull handle lying along the door at `centre`. materials: chrome."""
    grip = build.box(name, (0.024, 0.17, 0.028), location=centre)
    modify.bevel(grip, width=0.009, segments=1)
    scene.set_material(grip, materials['chrome'])
    return _mesh.tagged([grip], 0)


def exhaust_tip(name, mouth, radius, materials, length=0.13):
    """A tail pipe facing -Y with its mouth at `mouth`: a bright sleeve with a dark bore.
    materials: chrome, dark."""
    sleeve = build.lathe(f'{name}_sleeve', [(radius, -length), (radius, 0.0), (radius * 0.9, 0.006)],
                         segments=14)
    scene.set_material(sleeve, materials['chrome'])
    bore = build.lathe(f'{name}_bore', [(radius * 0.86, -0.07), (radius * 0.9, 0.006)], segments=14)
    shading.flip(bore)
    plug = build.cylinder(f'{name}_plug', radius=radius * 0.87, depth=0.004, segments=14,
                          location=(0.0, 0.0, -0.07))
    parts = [sleeve, bore, plug]
    for part in parts[1:]:
        scene.set_material(part, materials['dark'])
    for part in parts:
        modify.transform(part, rotation=(0.5 * math.pi, 0.0, 0.0))
        modify.transform(part, location=mouth)
    return _mesh.tagged(parts, 1)


def slab(name, size, centre, material, bevel=0.0, level=1):
    """A plain block (plate plinth, diffuser fin), as a one-item list ready to join."""
    block = build.box(name, size, location=centre)
    if bevel:
        modify.bevel(block, width=bevel, segments=1)
    scene.set_material(block, material)
    return _mesh.tagged([block], level)


def interior_half(spec, materials):
    """The right half of the cabin: floor, side, bulkheads, dashboard, console and one seat.
    materials: trim (dark plastic), leather. Sizes come from spec['cabin']."""
    cabin = spec['cabin']
    rear, front, half, floor = cabin['rear'], cabin['front'], cabin['half_width'], cabin['floor']
    seat_x, seat_y, belt = cabin['seat_x'], cabin['seat_y'], cabin['belt']
    length, middle = front - rear, 0.5 * (front + rear)
    shell = [
        build.box('floor', (half, length, 0.03), location=(0.5 * half, middle, floor)),
        build.box('side', (0.03, length, belt - floor), location=(half, middle, 0.5 * (belt + floor))),
        build.box('bulkhead', (half, 0.04, belt - floor + 0.06),
                  location=(0.5 * half, rear, 0.5 * (belt + floor) + 0.03)),
        build.box('firewall', (half, 0.04, belt - floor), location=(0.5 * half, front, 0.5 * (belt + floor))),
        build.box('console', (0.11, length - 0.5, 0.2), location=(0.055, middle + 0.1, floor + 0.11)),
    ]
    if not spec.get('open_top'):
        # The parcel shelf under the rear glass (an open car has its tonneau there instead).
        shell.append(build.box('shelf', (half, 0.55, 0.03),
                               location=(0.5 * half, rear - 0.27, belt + 0.05)))
    dash = build.box('dash', (half, 0.36, 0.26), location=(0.5 * half, front - 0.2, belt - 0.1))
    modify.bevel(dash, width=0.05, segments=2)
    shell.append(dash)
    for part in shell:
        scene.set_material(part, materials['trim'])
    cushion = build.box('cushion', (0.5, 0.52, 0.14), location=(seat_x, seat_y + 0.1, floor + 0.1))
    back = build.box('back', (0.5, 0.13, 0.62))
    modify.transform(back, rotation=(math.radians(-20.0), 0.0, 0.0),
                     location=(seat_x, seat_y - 0.26, floor + 0.44))
    head = build.box('head', (0.27, 0.1, 0.2), location=(seat_x, seat_y - 0.4, floor + 0.84))
    seat = [cushion, back, head]
    if 'rear_seat_y' in cabin:
        # A rear bench (half of it) behind the front seat, lower and more reclined, its back
        # against the bulkhead; shaped as two places by a centre dip at the console.
        rear_y = cabin['rear_seat_y']
        bench = build.box('bench', (half - 0.08, 0.46, 0.13),
                          location=(0.5 * (half - 0.08) + 0.04, rear_y + 0.08, floor + 0.13))
        bench_back = build.box('bench_back', (half - 0.08, 0.12, 0.52))
        modify.transform(bench_back, rotation=(math.radians(-24.0), 0.0, 0.0),
                         location=(0.5 * (half - 0.08) + 0.04, rear_y - 0.22, floor + 0.44))
        seat += [bench, bench_back]
    for part in seat:
        modify.bevel(part, width=0.04, segments=2)
        scene.set_material(part, materials['leather'])
    return _mesh.tagged(shell + seat, 1)


def steering_wheel(name, materials, radius=0.18):
    """A steering wheel in its own frame: the rim in the XY plane around the origin (the hub),
    the column along -Z. materials: leather, trim."""
    count = 28
    path = [(radius * math.cos(math.tau * n / count), radius * math.sin(math.tau * n / count), 0.0)
            for n in range(count)]
    rim = build.tube('rim', path, radius=0.016, segments=8, caps=False, closed_path=True)
    scene.set_material(rim, materials['leather'])
    boss = build.cylinder('boss', radius=0.06, depth=0.05, segments=14, location=(0.0, 0.0, -0.03))
    scene.set_material(boss, materials['trim'])
    parts = [rim, boss]
    for angle in (0.0, 0.5 * math.pi, math.pi):
        spoke = build.box(f'spoke{angle}', (radius - 0.04, 0.035, 0.014),
                          location=(0.5 * radius + 0.02, 0.0, -0.018))
        modify.transform(spoke, rotation=(0.0, 0.0, angle + math.pi))
        scene.set_material(spoke, materials['trim'])
        parts.append(spoke)
    column = build.cylinder('column', radius=0.03, depth=0.3, segments=10, location=(0.0, 0.0, -0.2))
    scene.set_material(column, materials['trim'])
    parts.append(column)
    return scene.join(parts, name)        # shaded and tagged by the caller, once it is in place
