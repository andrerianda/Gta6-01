"""Shared helper of the everyday cars: the police equipment of the cruiser and the police SUV.

roof_height(spec, y, x)    the roof's height at station y and half width x (the shell's crown)
light_bar(spec, mats, y)   the whole roof light bar at station y: a dark housing on two feet with
                           four ribbed lens pods, lamp_siren_a (red) on the driver's (-X) half and
                           lamp_siren_b (blue) on the other, and a centre cap; returns the
                           objects and the height of its top (anchor_siren sits there)
spotlight(shell, mats)     the spotlight on the driver's A pillar
push_bar(shell, mats)      the right half of a tubular push bar in front of the nose (bumper_f),
                           with an optional lower tube running out to the corner (a ram bar)
cage_bars(shell, mats)     the right half of the prisoner cage seen through the rear side glass

Each car passes its own stations and heights; the defaults are the cruiser's. The parts use the
materials that _car.materials() adds for spec['police']: bar (black steel), chrome, gap, trim and
the two siren groups.

Blender axes: Z up, nose towards +Y, right side +X; the driver sits on the left (-X).
"""
import math

from lib import build, modify, scene

import _body as B
import _mesh


def roof_height(spec, y, x):
    """The roof's height at station y and half width x."""
    curves = spec['curves']
    top, rail_x, rail_z = curves['top'](y), curves['rail_x'](y), curves['rail_z'](y)
    return top - (top - rail_z) * min(1.0, abs(x) / rail_x) ** spec.get('crown_power', 2.4)


def _box(name, size, location, material, bevel=0.0, segments=2):
    obj = build.box(name, size, location=location)
    if bevel:
        modify.bevel(obj, width=bevel, segments=segments)
    scene.set_material(obj, material)
    return obj


def light_bar(spec, mats, y, depth=0.28, half=0.58, foot_x=0.45,
              pods=((0.075, 0.31), (0.325, 0.565))):
    """The whole roof light bar at station y; returns (objects tagged level 2, top height)."""
    base = roof_height(spec, y, 0.0) + 0.035
    parts = [_box('bar_housing', (2.0 * half, depth, 0.045), (0.0, y, base + 0.0225), mats['trim'],
                  bevel=0.016),
             _box('bar_centre', (0.13, depth - 0.05, 0.05), (0.0, y, base + 0.065), mats['trim'],
                  bevel=0.014)]
    for sign in (-1.0, 1.0):
        lens = mats['lamp_siren_a' if sign < 0.0 else 'lamp_siren_b']
        for x0, x1 in pods:
            parts.append(_box(f'bar_pod{sign}{x0}', (x1 - x0, depth - 0.025, 0.062),
                              (sign * 0.5 * (x0 + x1), y, base + 0.071), lens, bevel=0.022,
                              segments=3))
        foot = roof_height(spec, y, foot_x) - 0.006
        parts.append(_box(f'bar_foot{sign}', (0.07, 0.17, base - foot),
                          (sign * foot_x, y, 0.5 * (base + foot)), mats['trim'], bevel=0.008,
                          segments=1))
    return _mesh.tagged(parts, 2), base + 0.105


def spotlight(shell, mats):
    """The spotlight on the driver's A pillar, a third of the way up from the mirror."""
    low = shell.point('glass_front', B.COL_GLASS_BASE)
    high = shell.point('roof_front', B.COL_RAIL)
    x, y, z = (p + 0.3 * (q - p) for p, q in zip(low, high))
    x = -(x + 0.075)                                    # the driver's side, clear of the pillar
    y += 0.05
    body = build.lathe('spot_body', [(0.0, -0.085), (0.034, -0.08), (0.054, -0.055),
                                     (0.061, -0.015), (0.062, 0.055), (0.056, 0.062)], segments=14)
    lens = build.lathe('spot_lens', [(0.056, 0.062), (0.03, 0.066), (0.0, 0.067)], segments=14)
    scene.set_material(body, mats['bar'])
    scene.set_material(lens, mats['chrome'])
    pieces = []
    for piece in (body, lens):
        modify.transform(piece, rotation=(-0.5 * math.pi, 0.0, 0.0), location=(x, y, z + 0.02))
        pieces.append(piece)
    post = build.tube('spot_post', [(x + 0.085, y - 0.03, z - 0.035), (x, y - 0.03, z - 0.035),
                                    (x, y - 0.02, z - 0.01)], radius=0.011, segments=6,
                      up=(0.0, 1.0, 0.0))
    scene.set_material(post, mats['bar'])
    handle = build.tube('spot_handle', [(x, y - 0.085, z + 0.02), (x + 0.1, y - 0.11, z + 0.02)],
                        radius=0.008, segments=6, up=(0.0, 0.0, 1.0))
    scene.set_material(handle, mats['bar'])
    return _mesh.tagged(pieces + [post, handle], 1)


def push_bar(shell, mats, x=0.30, low=0.24, top=0.795, cross=(0.50,), probe=(0.3, 0.45, 0.6, 0.72),
             pad=(0.47, 0.34), wing=None):
    """The right half of a tubular push bar in front of the nose (part of bumper_f): an upright
    at half width x from `low` to `top` bent over to the centre, cross tubes at the heights
    `cross`, a mounting tube back under the bumper and a rubber pad (centre height, length).
    wing = (height, half width) adds a lower tube from the centre out to that half width,
    following the nose round the corner (a full-width ram bar)."""
    front = max(shell.cap_y(-1, px, z) for px in (0.0, x) for z in probe)
    y = front + 0.06
    frame = [build.tube('push_upright', [(x, y, low), (x, y, top - 0.075),
                                         (x - 0.015, y - 0.01, top - 0.02),
                                         (x - 0.06, y - 0.02, top), (0.0, y - 0.02, top)],
                        radius=0.024, segments=8, up=(0.0, 1.0, 0.0))]
    for index, z in enumerate(cross):
        frame.append(build.tube(f'push_cross{index}', [(x, y, z), (0.0, y, z)], radius=0.02,
                                segments=8, up=(0.0, 0.0, 1.0)))
    mount = shell.cap_y(-1, x, low + 0.06) - 0.22
    frame.append(build.tube('push_mount', [(x, y, low + 0.03), (x, mount, low + 0.03)], radius=0.022,
                            segments=8, up=(0.0, 0.0, 1.0)))
    if wing:
        z, reach = wing
        path = [(0.0, y, z), (x, y, z)]
        for s in (0.55, 0.75, 0.9, 1.0):
            px = x + (reach - x) * s
            path.append((px, max(y - 0.012 * s, shell.cap_y(-1, px, z) + 0.05), z))
        frame.append(build.tube('push_wing', path, radius=0.022, segments=8, up=(0.0, 0.0, 1.0)))
    for part in frame:
        scene.set_material(part, mats['bar'])
    rubber = _box('push_pad', (0.05, 0.03, pad[1]), (x, y + 0.028, pad[0]), mats['gap'], bevel=0.008,
                  segments=1)
    return _mesh.tagged(frame, 2) + _mesh.tagged([rubber], 1)


def cage_bars(shell, mats, stations, inset=0.05):
    """The right half of the prisoner cage: vertical bars `inset` inboard of the rear side glass
    at the given stations, joined by one rail at mid height (tagged level 1)."""
    ys = shell.ys
    bars, rail = [], []
    for y in stations:
        row = min(range(len(ys)), key=lambda i: abs(ys[i] - y))
        bottom = shell.point(row, B.COL_GLASS_BASE)
        top = shell.point(row, B.COL_RAIL + 1)
        p0 = (bottom[0] - inset, ys[row], bottom[2] + 0.01)
        p1 = (top[0] - inset, ys[row], top[2] - 0.015)
        bars.append(build.tube(f'cage_bar{row}', [p0, p1], radius=0.007, segments=6,
                               up=(0.0, 1.0, 0.0)))
        rail.append(tuple(0.5 * (a + b) for a, b in zip(p0, p1)))
    bars.append(build.tube('cage_rail', rail, radius=0.007, segments=6, up=(0.0, 0.0, 1.0)))
    for bar in bars:
        scene.set_material(bar, mats['bar'])
    return _mesh.tagged(bars, 1)
