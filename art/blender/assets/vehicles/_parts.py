"""Shared helper of the everyday cars: the fittings that are not body metal.

wheel() is a road wheel (tyre with sidewall and tread shoulder, dished rim with twin spokes,
brake disc and caliper behind); interior_half() the right half of the cabin (tub, dashboard,
console, front seat and rear bench); steering_wheel() the wheel on its hub; mirror() a door
mirror. Everything is modelled with the library's builders at real size, in the car's own
coordinates unless a function says otherwise, and tagged with the level of detail it survives
to (see _mesh).

Blender axes: Z up, nose towards +Y, right side +X.
"""
import math

from lib import build, modify, scene, shading

import _mesh


def _steel_face(rim, half, segments, materials):
    """The face of a pressed steel wheel: a deep painted dish with a raised ring and eight
    vents, under a domed plated hub cap. materials: steel, chrome, dark."""
    dish = build.lathe('dish', [(rim + 0.006, half - 0.03), (rim + 0.008, half - 0.012),
                                (rim - 0.004, half - 0.014), (rim - 0.016, half - 0.03),
                                (rim - 0.022, half - 0.07), (0.80 * rim, half - 0.075),
                                (0.66 * rim, half - 0.06), (0.56 * rim, half - 0.058),
                                (0.50 * rim, half - 0.068), (0.40 * rim, half - 0.075)],
                       segments=segments)
    scene.set_material(dish, materials['steel'])
    cap = build.lathe('cap', [(0.43 * rim, half - 0.074), (0.41 * rim, half - 0.05),
                              (0.33 * rim, half - 0.036), (0.15 * rim, half - 0.029),
                              (0.0, half - 0.028)], segments=segments)
    scene.set_material(cap, materials['chrome'])
    depth = half - 0.075 + 0.015 * (0.80 - 0.70) / 0.14     # the dish face at 0.70 of the rim
    vent = build.cylinder('vent', radius=0.021, depth=0.008, segments=10)
    modify.transform(vent, scale=(1.5, 1.0, 1.0))
    modify.transform(vent, location=(0.70 * rim, 0.0, depth))
    modify.radial_array(vent, 8, axis='Z')
    scene.set_material(vent, materials['dark'])
    return [dish, cap, vent]


def wheel(name, hub, radius, width, materials, rim_ratio=0.66, spokes=5, segments=24,
          style='alloy'):
    """A wheel for the right side of the car, origin at `hub`, axle along X, outer face +X.
    style 'alloy' (twin spokes) or 'steel' (see _steel_face).
    materials: tyre, alloy or steel and chrome, disc, caliper, dark."""
    rim, half = radius * rim_ratio, 0.5 * width
    tyre = build.lathe('tyre', [(rim, -half + 0.014), (rim + 0.03, -half), (radius - 0.026, -half + 0.003),
                                (radius - 0.006, -half + 0.026), (radius, -half + 0.055),
                                (radius, half - 0.055), (radius - 0.006, half - 0.026),
                                (radius - 0.026, half - 0.003), (rim + 0.03, half),
                                (rim, half - 0.014)], segments=segments)
    scene.set_material(tyre, materials['tyre'])
    back = build.cylinder('back', radius=rim + 0.004, depth=0.012, segments=16,
                          location=(0.0, 0.0, -half + 0.05))
    scene.set_material(back, materials['dark'])
    simple = [_mesh.tag_level(part, 2) for part in (tyre, back)]
    face = _steel_face(rim, half, segments, materials) if style == 'steel' else \
        _alloy_face(rim, half, segments, spokes, materials)
    disc = build.cylinder('disc', radius=rim - 0.035, depth=0.024, segments=20,
                          location=(0.0, 0.0, half - 0.11))
    scene.set_material(disc, materials['disc'])
    caliper = build.box('caliper', (0.07, 0.14, 0.065), location=(-(rim - 0.08), 0.02, half - 0.11))
    modify.bevel(caliper, width=0.012, segments=1)
    scene.set_material(caliper, materials['caliper'])
    detail = [_mesh.tag_level(part, 1) for part in face + [disc, caliper]]

    obj = scene.join(simple + detail, name)
    modify.transform(obj, rotation=(0.0, 0.5 * math.pi, 0.0))
    modify.transform(obj, location=hub)
    scene.set_origin(obj, hub)
    return _mesh.freeze_normals(obj, math.radians(35))      # frozen last: they do not turn


def _alloy_face(rim, half, segments, spokes, materials):
    """The face of an alloy wheel: a dished barrel and twin spokes. materials: alloy."""
    dish = build.lathe('dish', [(rim - 0.02, -half + 0.05), (rim - 0.015, half - 0.07),
                                (rim - 0.009, half - 0.03), (rim + 0.005, half - 0.012)],
                       segments=segments)
    shading.flip(dish)
    lip = build.lathe('lip', [(rim + 0.005, half - 0.012), (rim + 0.004, half - 0.02)],
                      segments=segments)
    face = half - 0.04
    length = rim - 0.04
    bars = []
    for angle in (-0.2, 0.2):
        bar = build.box(f'bar{angle}', (0.032, length, 0.022), location=(0.0, 0.03 + 0.5 * length, face))
        modify.bevel(bar, width=0.006, segments=1)
        modify.transform(bar, rotation=(0.0, 0.0, angle))
        bars.append(bar)
    star = scene.join(bars, 'star')

    def dished(point):
        # The spokes fall away towards the hub, so the face of the wheel is a shallow cone.
        point.z -= 0.022 * (1.0 - min(1.0, math.hypot(point.x, point.y) / rim))
        return point

    modify.map_vertices(star, dished)
    modify.radial_array(star, spokes, axis='Z')
    centre = build.lathe('centre', [(0.075, face - 0.05), (0.07, face - 0.014), (0.052, face - 0.004),
                                    (0.0, face)], segments=14)
    for part in (dish, lip, star, centre):
        scene.set_material(part, materials['alloy'])
    return [dish, lip, star, centre]


def _seat(prefix, x, y, floor, width, material):
    """One seat around the hip point (x, y): cushion, raked back and head restraint."""
    cushion = build.box(f'{prefix}_cushion', (width, 0.52, 0.14), location=(x, y + 0.16, floor + 0.15))
    back = build.box(f'{prefix}_back', (width, 0.12, 0.62))
    modify.transform(back, rotation=(math.radians(-18.0), 0.0, 0.0), location=(x, y - 0.2, floor + 0.5))
    head = build.box(f'{prefix}_head', (0.26, 0.09, 0.19), location=(x, y - 0.33, floor + 0.9))
    parts = [cushion, back, head]
    for part in parts:
        modify.bevel(part, width=0.035, segments=2)
        scene.set_material(part, material)
    return parts


def interior_half(spec, materials):
    """The right half of the cabin: floor, side, bulkheads, parcel shelf, dashboard, console,
    one front seat and half the rear bench. materials: trim (dark plastic), seat. Sizes come
    from spec['cabin'] (rear, front, half_width, floor, belt, seat_x, seat_y, rear_seat_y)."""
    cabin = spec['cabin']
    rear, front, half, floor = cabin['rear'], cabin['front'], cabin['half_width'], cabin['floor']
    seat_x, seat_y, belt = cabin['seat_x'], cabin['seat_y'], cabin['belt']
    length, middle = front - rear, 0.5 * (front + rear)
    shelf = cabin.get('shelf', 0.5)
    shell = [
        build.box('floor', (half, length, 0.03), location=(0.5 * half, middle, floor)),
        build.box('side', (0.03, length, belt - floor), location=(half, middle, 0.5 * (belt + floor))),
        build.box('bulkhead', (half, 0.04, belt - floor + 0.06),
                  location=(0.5 * half, rear, 0.5 * (belt + floor) + 0.03)),
        build.box('shelf', (half, shelf, 0.03), location=(0.5 * half, rear - 0.5 * shelf, belt + 0.05)),
        build.box('firewall', (half, 0.04, belt - floor), location=(0.5 * half, front, 0.5 * (belt + floor))),
        build.box('console', (0.1, 1.0, 0.2), location=(0.05, seat_y + 0.25, floor + 0.11)),
    ]
    dash = build.box('dash', (half, 0.36, 0.26), location=(0.5 * half, front - 0.2, belt - 0.1))
    modify.bevel(dash, width=0.05, segments=2)
    shell.append(dash)
    for part in shell:
        scene.set_material(part, materials['trim'])
    seats = _seat('front', seat_x, seat_y, floor, 0.5, materials['seat'])
    if 'rear_seat_y' in cabin:
        seats += _seat('rear', 0.5 * (half - 0.06), cabin['rear_seat_y'], floor, half - 0.06,
                       materials['seat'])
    return _mesh.tagged(shell + seats, 1)


def steering_wheel(name, materials, radius=0.185):
    """A steering wheel in its own frame: the rim in the XY plane around the origin (the hub),
    the column along -Z. materials: seat (the rim's grip), trim."""
    count = 24
    path = [(radius * math.cos(math.tau * n / count), radius * math.sin(math.tau * n / count), 0.0)
            for n in range(count)]
    rim = build.tube('rim', path, radius=0.016, segments=6, caps=False, closed_path=True)
    scene.set_material(rim, materials['trim'])
    boss = build.cylinder('boss', radius=0.06, depth=0.05, segments=12, location=(0.0, 0.0, -0.03))
    scene.set_material(boss, materials['trim'])
    parts = [rim, boss]
    for angle in (0.0, 0.5 * math.pi, math.pi):
        spoke = build.box(f'spoke{angle}', (radius - 0.04, 0.035, 0.014),
                          location=(0.5 * radius + 0.02, 0.0, -0.018))
        modify.transform(spoke, rotation=(0.0, 0.0, angle + math.pi))
        scene.set_material(spoke, materials['trim'])
        parts.append(spoke)
    column = build.cylinder('column', radius=0.03, depth=0.3, segments=8, location=(0.0, 0.0, -0.2))
    scene.set_material(column, materials['trim'])
    parts.append(column)
    return scene.join(parts, name)        # shaded and tagged by the caller, once it is in place


def door_handle(name, point, materials):
    """A pull handle on a right-hand door skin, `point` being on the skin: a body-coloured grip
    standing a few millimetres proud of a dark finger recess. materials: paint, trim."""
    x, y, z = point
    recess = build.box(f'{name}_recess', (0.004, 0.165, 0.048), location=(x + 0.001, y, z))
    scene.set_material(recess, materials['trim'])
    grip = build.box(f'{name}_grip', (0.016, 0.15, 0.027), location=(x + 0.009, y, z + 0.005))
    modify.bevel(grip, width=0.0065, segments=2)
    scene.set_material(grip, materials['paint'])
    return _mesh.tagged([recess, grip], 1)


def mirror(name, root, materials):
    """A door mirror for the right side: a rounded housing in body paint on a short dark foot,
    `root` being the point on the door skin it grows from."""
    x, y, z = root
    housing = build.box(f'{name}_housing', (0.17, 0.075, 0.12), location=(x + 0.105, y, z + 0.045))
    modify.bevel(housing, width=0.028, segments=2)
    scene.set_material(housing, materials['paint'])
    foot = build.box(f'{name}_foot', (0.09, 0.05, 0.035), location=(x + 0.03, y, z + 0.01))
    scene.set_material(foot, materials['trim'])
    return _mesh.tagged([housing, foot], 1)
