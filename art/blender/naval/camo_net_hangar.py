"""The hangar of the Norvast island (an original design): five steel lattice arches 10 m apart,
tied by purlins, under a draped camouflage net that is pegged out over side poles and guy lines.
60 m wide and 44 m deep between the arch feet and the end arches (the net overhangs to 66 x 48 m),
18 m to the inside of the crown and more than 14 m clear over the 46 m an aircraft's wings need,
open at both ends (+Y and -Y here, the game's -Z and +Z). Crates, fuel drums and a covered heap
stand along both sides inside the arch feet.

Origin on the ground at the centre. lod0 carries the stores, poles, guy lines and the net (the
alpha-tested material cutout_net), frame_lod0 the lattice arches; lod1 and lod2 are single meshes
with plain tube arches.
"""
import math
import random

import _naval_parts as np_
from lib import meshkit as mk
from lib import surfaces as sf

ASSET = {'id': 'camo_net_hangar', 'atlas': 1024, 'kind': 'building', 'views': ((28, 16, 1.2), (150, 50, 1.2))}

ARCH_YS = (-20.0, -10.0, 0.0, 10.0, 20.0)
POLE_YS = (-21.0, -10.5, 0.0, 10.5, 21.0)
PROFILE = [(-29.0, 0.0), (-27.5, 9.0), (-23.0, 14.5), (-12.0, 17.3), (0.0, 18.2), (12.0, 17.3), (23.0, 14.5), (27.5, 9.0), (29.0, 0.0)]
NET = [(-33.2, 4.1), (-31.2, 6.6), (-29.0, 9.4), (-24.1, 15.5), (-12.4, 18.75), (0.0, 19.7), (12.4, 18.75), (24.1, 15.5),
       (29.0, 9.4), (31.2, 6.6), (33.2, 4.1)]
DEPTH = 1.3


def resample(points, count):
    """`count` points at equal steps along a polyline."""
    lengths = [0.0]
    for p, q in zip(points, points[1:]):
        lengths.append(lengths[-1] + math.hypot(q[0] - p[0], q[1] - p[1]))
    out = []
    for i in range(count):
        d = lengths[-1] * i / (count - 1)
        k = max(j for j in range(len(points) - 1) if lengths[j] <= d + 1e-9)
        f = (d - lengths[k]) / (lengths[k + 1] - lengths[k])
        out.append((points[k][0] + (points[k + 1][0] - points[k][0]) * f, points[k][1] + (points[k + 1][1] - points[k][1]) * f))
    return out


def outward(point, distance):
    length = math.hypot(point[0], point[1] - 3.0)
    return (point[0] + point[0] / length * distance, max(0.0, point[1] + (point[1] - 3.0) / length * distance))


def lattice_arch(name, material):
    lower = resample(PROFILE, 22)
    upper = [outward(p, DEPTH) for p in lower]
    at = lambda p: (p[0], 0.0, p[1])
    parts = [mk.tube(name + '_lower', [at(p) for p in lower], 0.14, 4), mk.tube(name + '_upper', [at(p) for p in upper], 0.14, 4)]
    for i in range(len(lower)):
        parts.append(mk.tube(name + '_post', [at(lower[i]), at(upper[i])], 0.07, 3))
        if i + 1 < len(lower):
            a, b = (lower[i], upper[i + 1]) if i < len(lower) // 2 else (upper[i], lower[i + 1])
            parts.append(mk.tube(name + '_web', [at(a), at(b)], 0.07, 3))
    feet = [mk.box(name + '_foot', (2.2, 1.2, 0.3), (sx * 29.6, 0, 0.15)) for sx in (-1, 1)]
    return mk.shade(mk.assign(mk.join(name, parts + feet), material), 50)


def net_grid(columns=37, rows=33):
    rng = random.Random(11)
    across = resample(NET, columns)
    grid = []
    for r in range(rows):
        y = -24.0 + 48.0 * r / (rows - 1)
        beyond = max(0.0, (abs(y) - 20.0) / 4.0)
        span = (min(max(y, -20.0), 20.0) + 20.0) % 10.0 / 10.0
        tie = math.sin(math.pi * (min(max(y, -21.0), 21.0) + 21.0) / 10.5) ** 2
        row = []
        for c, (x, z) in enumerate(across):
            middle = math.sin(math.pi * c / (columns - 1))
            z -= 0.65 * math.sin(math.pi * span) ** 2 * (0.35 + 0.65 * middle)
            z -= 2.3 * beyond ** 1.6 * (0.4 + 0.6 * middle)
            if r in (0, rows - 1):
                z -= 0.9 * abs(math.sin(c * math.pi / 4.5)) * middle
            elif r in (1, rows - 2):
                z -= 0.4 * abs(math.sin(c * math.pi / 4.5)) * middle
            if 0 < c < columns - 1 and 0 < r < rows - 1:
                z += rng.uniform(-0.13, 0.13)
            row.append([x, y, z])
        # The hem is tied at the pole tops and pulled in and up between them: scallops.
        for edge, inner, share in ((0, 1, 0.85), (1, 2, 0.3), (columns - 1, columns - 2, 0.85), (columns - 2, columns - 3, 0.3)):
            f = share * tie
            row[edge] = [row[edge][i] + (row[inner][i] - row[edge][i]) * f for i in range(3)]
        grid.append([tuple(p) for p in row])
    return grid, across


def drum(name, x, y, z, material):
    body = mk.cylinder(name, 0.29, 0.88, (x, y, z + 0.44), 'Z', 12)
    rims = [mk.cylinder(name + '_rim', 0.3, 0.03, (x, y, z + h), 'Z', 12) for h in (0.3, 0.6)]
    return mk.shade(mk.assign(mk.join(name, [body] + rims), material), 50)


def make(a, work_dir):
    steel = np_.matt('arch_steel', '#4a4f47', 0.7, 0.5, 0.3)
    pole_mat = np_.matt('pole_olive', '#3e442d', 0.8, 0.4)
    rope = sf.plain('guy_rope', '#6f684f', 0.9)
    wood = sf.coated('crate_wood', '#8a7550', 0.85, 0.0, 0.5, panels=(1.6, 0.22), projection='side')
    crate_olive = np_.matt('crate_olive', '#454b2e', 0.8, 0.45, 0.0, (0.9, 0.5), 'side')
    drum_olive = np_.matt('drum_olive', '#3d452f', 0.6, 0.5, 0.3)
    drum_red = np_.matt('drum_red', '#6e3026', 0.6, 0.5, 0.3)
    tarp = sf.coated('tarp', '#55573a', 0.95, 0.0, 0.5, grain=0.1)
    dark = np_.matt('machine_dark', '#2a2d28', 0.7, 0.5, 0.3)

    # --- lattice arches and purlins (frame_lod0) and their plain twins for the far levels -------
    first = lattice_arch('arch', steel)
    arches = [first] + [mk.transform(mk.duplicate(first, 'arch_copy'), (0, y, 0)) for y in ARCH_YS[1:]]
    mk.transform(first, (0, ARCH_YS[0], 0))
    ridge = [outward(p, DEPTH + 0.1) for p in PROFILE[1:-1]]
    purlins = [mk.assign(mk.tube('purlin', [(x, -20.3, z), (x, 20.3, z)], 0.1, 4), steel) for x, z in ridge]
    a.add(mk.join('frame_lod0', arches + purlins))
    middle = [outward(p, DEPTH * 0.5) for p in resample(PROFILE, 12)]
    plain = [mk.assign(mk.tube('plain_arch', [(x, y, z) for x, z in middle], 0.5, 4), steel) for y in ARCH_YS]
    plain += [mk.assign(mk.tube('plain_purlin', [(x, -20.3, z), (x, 20.3, z)], 0.12, 3), steel) for x, z in ridge[1::2]]
    a.source(mk.shade(mk.join('frame_plain', plain), 50))

    # --- side poles, guy lines, stakes ------------------------------------------------------------
    rigging = []
    for sx in (-1, 1):
        for y in POLE_YS:
            rigging.append(mk.assign(mk.tube('pole', [(sx * 32.3, y, 0.0), (sx * 33.2, y, 4.2)], 0.09, 6), pole_mat))
            for dy in (-1.6, 1.6):
                rigging.append(mk.assign(mk.tube('guy', [(sx * 33.2, y, 4.15), (sx * 36.6, y + dy, 0.0)], 0.03, 3), rope))
                rigging.append(mk.assign(mk.box('stake', (0.12, 0.12, 0.5), (sx * 36.6, y + dy, 0.2)), pole_mat))
        for sy in (-1, 1):
            rigging.append(mk.assign(mk.tube('end_guy', [(sx * 28.6, sy * 20.0, 9.6), (sx * 31.5, sy * 30.0, 0.0)], 0.035, 3), rope))
            rigging.append(mk.assign(mk.box('end_stake', (0.14, 0.14, 0.6), (sx * 31.5, sy * 30.0, 0.25)), pole_mat))

    # --- stores along both sides ------------------------------------------------------------------
    stores = []
    for y in (-16.0, -14.2, -12.4):
        stores.append(mk.assign(mk.box('crate', (1.25, 1.6, 1.0), (-25.6, y, 0.5), 0.02, 1), wood))
    stores.append(mk.assign(mk.box('crate_top', (1.25, 1.6, 1.0), (-25.55, -15.2, 1.5), 0.02, 1), wood))
    stores += [mk.assign(mk.box('ammo', (0.8, 1.7, 0.45), (-25.7, -9.4, 0.225 + 0.46 * i), 0.015, 1), crate_olive) for i in range(3)]
    stores += [mk.assign(mk.box('ammo_b', (0.8, 1.7, 0.45), (-25.6, -7.4, 0.225 + 0.46 * i), 0.015, 1), crate_olive) for i in range(2)]
    stores.append(mk.assign(mk.box('pallet_l', (1.4, 2.2, 0.12), (-25.6, 3.3, 0.06)), wood))
    stores += [drum('drum', -25.95 + 0.62 * i, 2.5 + 0.62 * j, 0.12, drum_olive) for i in range(2) for j in range(3)]
    stores += [mk.assign(mk.box('crate_r', (1.25, 1.6, 1.0), (25.6, y, 0.5), 0.02, 1), wood) for y in (8.0, 9.9)]
    stores.append(mk.assign(mk.box('crate_r_top', (1.0, 1.2, 0.8), (25.6, 8.8, 1.4), 0.02, 1), crate_olive))
    stores.append(mk.assign(mk.box('pallet_r', (1.4, 2.8, 0.12), (25.6, -12.6, 0.06)), wood))
    stores += [drum('drum_r', 25.3 + 0.62 * i, -13.5 + 0.62 * j, 0.12, drum_red if (i, j) == (1, 0) else drum_olive)
               for i in range(2) for j in range(4)]
    stores.append(drum('drum_single', 25.2, -10.3, 0.0, drum_red))
    stores.append(mk.assign(mk.subdivide(np_.frustum('covered_heap', (2.3, 4.2), (1.3, 3.0), 0.0, 1.5, (25.6, -2.0)), 1), tarp))
    stores.append(np_.boxes('generator', dark, [((1.2, 2.0, 1.1), (25.6, 15.0, 0.65)), ((1.0, 0.1, 0.1), (25.6, 14.3, 0.05)),
                                                ((1.0, 0.1, 0.1), (25.6, 15.7, 0.05)), ((0.12, 0.12, 0.7), (25.3, 15.6, 1.5))]))
    for part in rigging + stores:
        mk.shade(part, 45)
    a.add(mk.join('lod0', rigging + stores))

    # --- the net ----------------------------------------------------------------------------------
    grid, across = net_grid()
    run = [0.0]
    for p, q in zip(across, across[1:]):
        run.append(run[-1] + math.hypot(q[0] - p[0], q[1] - p[1]))
    net = np_.uv_sheet('net', grid, lambda row, column, p: (run[column] / 6.0, p[1] / 6.0))
    mk.assign(net, np_.cutout_material('cutout_net', np_.net_texture(work_dir + '/net.png')))
    a.attach(net, 'lod0')

    # --- anchors, collision, levels -----------------------------------------------------------------
    a.anchor('park', (0.0, 0.0, 0.0))
    a.anchor('entry_front', (0.0, 26.0, 0.0), (0, 0, 180))
    a.anchor('entry_back', (0.0, -26.0, 0.0))
    a.collider_box('side_l', (3.4, 42.0, 11.0), (-29.3, 0.0, 5.5))
    a.collider_box('side_r', (3.4, 42.0, 11.0), (29.3, 0.0, 5.5))
    a.collider_box('stores_l', (2.2, 13.0, 2.0), (-25.6, -11.6, 1.0))
    a.collider_box('stores_l2', (1.6, 2.4, 1.1), (-25.6, 3.3, 0.55))
    a.collider_box('stores_r', (2.4, 9.0, 1.6), (25.6, -8.6, 0.8))
    a.collider_box('stores_r2', (1.6, 9.0, 1.9), (25.6, 12.0, 0.95))
    a.extra('clear_height', 16.0)
    a.extra('clear_width', 50.0)
    a.extra('arch_spacing', 10.0)
    a.level(1, [('lod0', 0.55), ('frame_plain', 1.0)])
    a.level(2, [('lod0', 0.18), ('frame_plain', 0.5)])
    a.distances(160.0, 600.0)
