"""Ground covers of the two secret aircraft, each in its aircraft's OWN model space (origin = the
aircraft's origin; Blender axes: nose +Y, right +X, Z up), so the game parents them to the aircraft:
`cover_nose`, `cover_intake_l`, `cover_intake_r`, olive canvas with a red rope hem, each carrying a
red streamer lettered REMOVE BEFORE FLIGHT. Every node's origin is at its own centre.

Manta Sombra (a flying wing: nose apex at y 10, edge plane z 2.72, intake slits on the engine humps
at x +-4): a fitted wedge sock over the first 1.6 m of the nose and two quilted blankets over the
slits, their streamers lying forward on the skin. Garza Negra (needle nose to y 17.9, nacelles at
x +-4.2 with intake spikes to y 5.4): a nose-and-pitot sock and two conical intake plugs over the
spikes, their streamers hanging.
"""
import math

import _base_kit as kit
import _hk as hk
from lib import meshkit as mk


def _materials(work_dir):
    cloth = hk.canvas('cover_canvas', '#7d8266', 0.4, 0.3)
    hem = hk.canvas('cover_hem', '#8c2a20', 0.5, 0.3)
    brass = kit.galvanised('cover_ring', '#9a8a5a')
    return cloth, hem, brass, hk.streamer_material(work_dir)


def _hem(name, loop, material, radius=0.022, closed=True):
    path = list(loop) + ([loop[0], loop[1]] if closed else [])
    return mk.shade(kit.rod(name, path, radius, material, 5), 60)


def _finish(a, name, parts, centre):
    obj = mk.join(name, parts)
    a.add(mk.set_origin(obj, centre))
    return obj


def make_manta(a, work_dir):
    import manta_sombra as ms
    cloth, hem, brass, red = _materials(work_dir)
    plane, sweep, nose = ms.EDGE_PLANE, ms.SWEEP, ms.NOSE_Y

    # --- the nose sock: a wedge of canvas over the apex, 1.6 m back along both leading edges --------
    rings = []
    stations = [8.4, 8.6, 8.85, 9.1, 9.35, 9.6, 9.8, 9.95, 10.06]
    for y in stations:
        half = max((nose - y) / sweep, 0.0) + 0.035
        ring = []
        for i in range(20):
            upper = i <= 10
            t = -1 + 2 * i / 10 if upper else 1 - 2 * (i - 10) / 10
            x = half * t
            inside_x = max(-1.0, min(1.0, t)) * max(half - 0.06, 0.0)
            inside_y = min(y, nose - 0.02)
            lift = 0.035 * (1 - t ** 4) + 0.012 * math.sin(y * 11.0 + x * 5.0) * (1 - t * t)
            if y > nose:
                z = plane + (0.03 if upper else -0.03) * (1 - t * t)
            elif upper:
                z = plane + (ms.skin_z(inside_x, inside_y, True) - plane) * (1 - t ** 6) + lift
            else:
                z = plane - (plane - ms.skin_z(inside_x, inside_y, False)) * (1 - t ** 6) - lift
            ring.append((x, y, z))
        rings.append(ring)
    sock = mk.loft('nose_sock', rings, cap_start=False, cap_end=True)
    mk.recalc_normals(sock)
    kit.orient(sock, (0, 9.2, plane), True)
    mk.shade(mk.assign(sock, cloth), 60)
    parts = [hk.two_sided(sock), _hem('nose_hem', rings[0], hem, 0.028)]
    for sx in (-1, 1):   # two webbing straps under the chin with buckles
        x = sx * 0.9
        parts.append(kit.rod('strap', [(x, 8.6, ms.skin_z(x, 8.6, False) - 0.05), (x * 0.4, 9.2, ms.skin_z(x * 0.4, 9.2, False) - 0.06)], 0.02, hem, 4))
        parts.append(kit.block('buckle', (0.06, 0.08, 0.02), (x * 0.7, 8.9, ms.skin_z(x * 0.7, 8.9, False) - 0.075), brass))
    parts.append(mk.assign(mk.cylinder('nose_ring', 0.035, 0.02, (0.0, 9.86, plane - 0.1), 'Z', 8), brass))
    path = [(0.03 * math.sin(4.0 * s), 9.86 + 0.06 * math.sin(2.2 * s), plane - 0.1 - 1.85 * s) for s in (i / 12 for i in range(13))]
    parts.append(hk.ribbon('nose_streamer', path, 0.15, red, 85.0, (1, 0, 0)))
    _finish(a, 'cover_nose', parts, (0.0, 9.3, plane))

    # --- the intake blankets -------------------------------------------------------------------
    for sx, side in ((1, 'r'), (-1, 'l')):
        def point(u, v, lift=0.035):
            x = 2.5 + 3.0 * u
            y = 0.85 + 1.5 * v - sweep * (x - ms.ENGINE_X)
            quilt = 0.016 * abs(math.sin(u * math.pi * 6)) * abs(math.sin(v * math.pi * 3)) * (1 if 0 < u < 1 and 0 < v < 1 else 0)
            return (sx * x, y, ms.skin_z(x, y, True) + lift + quilt)

        rows = [[point(i / 18, j / 9) for i in range(19)] for j in range(10)]
        blanket = hk.sheet('blanket_' + side, rows, cloth, (sx * 4.0, 1.5, 0.0), True)
        loop = rows[0] + [r[-1] for r in rows[1:]] + rows[-1][-2::-1] + [r[0] for r in rows[-2:0:-1]]
        parts = [hk.two_sided(blanket), _hem('blanket_hem_' + side, loop, hem, 0.02)]
        for u, v in ((0.0, 0.0), (1.0, 0.0), (0.0, 1.0), (1.0, 1.0), (0.5, 1.0)):
            p = point(u, v, 0.05)
            parts.append(mk.assign(mk.cylinder('tie_ring', 0.035, 0.02, p, 'Z', 8), brass))
        start = point(0.5, 1.0, 0.045)
        path = []
        for i in range(13):
            s = i / 12
            x = abs(start[0]) + 0.16 * math.sin(3.0 * s)
            y = start[1] + 1.75 * s
            path.append((sx * x, y, ms.skin_z(x, y, True) + 0.03 + 0.05 * s * s * (1 + math.sin(7 * s))))
        parts.append(hk.ribbon('blanket_streamer_' + side, path, 0.15, red, 28.0, (1, 0, 0)))
        centre = point(0.5, 0.5, 0.0)
        _finish(a, 'cover_intake_' + side, parts, centre)
    a.extra('fits', 'manta_sombra')


def make_garza(a, work_dir):
    cloth, hem, brass, red = _materials(work_dir)

    # --- the nose and pitot sock ---------------------------------------------------------------
    stations = [(15.6, 0.62, 0.55, 2.265), (16.0, 0.54, 0.48, 2.25), (16.5, 0.4, 0.36, 2.215), (17.0, 0.28, 0.26, 2.18),
                (17.6, 0.14, 0.14, 2.14), (17.85, 0.07, 0.07, 2.135), (17.99, 0.05, 0.05, 2.13)]
    rings = [mk.ring(y, w * (1 + 0.03 * math.sin(k * 2.1)), h, z, 0.0, 16) for k, (y, w, h, z) in enumerate(stations)]
    sock = mk.loft('nose_sock', rings, cap_start=False, cap_end=True)
    mk.recalc_normals(sock)
    kit.orient(sock, (0, 16.6, 2.2), True)
    mk.shade(mk.assign(sock, cloth), 60)
    parts = [hk.two_sided(sock), _hem('nose_hem', rings[0], hem, 0.022), _hem('pitot_tie', mk.ring(17.62, 0.16, 0.16, 2.14, 0.0, 8), hem, 0.012)]
    parts.append(mk.assign(mk.cylinder('nose_ring', 0.03, 0.02, (0.0, 16.3, 1.99), 'Z', 8), brass))
    path = [(0.03 * math.sin(4.0 * s), 16.3 + 0.05 * math.sin(2.4 * s), 1.98 - 1.4 * s) for s in (i / 12 for i in range(13))]
    parts.append(hk.ribbon('nose_streamer', path, 0.12, red, 80.0, (1, 0, 0)))
    _finish(a, 'cover_nose', parts, (0.0, 16.8, 2.2))

    # --- the intake plugs: a padded sleeve round the lip and a soft cone over the spike ------------
    for sx, side in ((1, 'r'), (-1, 'l')):
        cx, cz = sx * 4.2, 2.4
        profile = [(3.22, 0.785), (3.42, 0.72), (3.6, 0.665), (3.7, 0.63), (3.95, 0.5), (4.6, 0.3), (5.3, 0.09), (5.5, 0.035)]
        rings = [mk.ring(y, 2 * r, 2 * r * (1 - 0.04 * (k % 2)), cz, cx, 18) for k, (y, r) in enumerate(profile)]
        plug = mk.loft('plug_' + side, rings, cap_start=False, cap_end=True)
        mk.recalc_normals(plug)
        kit.orient(plug, (cx, 4.0, cz), True)
        mk.shade(mk.assign(plug, cloth), 60)
        parts = [hk.two_sided(plug), _hem('plug_hem_' + side, rings[0], hem, 0.024), _hem('plug_band_' + side, rings[3], hem, 0.016)]
        parts.append(kit.rod('plug_handle', [(cx - 0.12, 3.9, cz + 0.5), (cx - 0.08, 4.1, cz + 0.62), (cx + 0.08, 4.1, cz + 0.62), (cx + 0.12, 3.9, cz + 0.5)], 0.016, hem, 5))
        parts.append(mk.assign(mk.cylinder('plug_ring', 0.03, 0.02, (cx, 3.45, cz - 0.735), 'Z', 8), brass))
        path = [(cx + 0.03 * math.sin(4.0 * s + sx), 3.45 + 0.05 * math.sin(2.0 * s), cz - 0.74 - 1.3 * s) for s in (i / 12 for i in range(13))]
        parts.append(hk.ribbon('plug_streamer_' + side, path, 0.12, red, 75.0 * sx, (1, 0, 0)))
        _finish(a, 'cover_intake_' + side, parts, (cx, 4.2, cz))
    a.extra('fits', 'garza_negra')
