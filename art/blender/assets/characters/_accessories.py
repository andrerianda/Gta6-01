"""Accessories the gang catalog asks for (gangsAndFactions.js acc()) and two garment details.

    sunglasses(figure, frame, lens)            wrap-around lenses, a bridge and temples to the ears
    bandana(figure, material, style)           'head': tied over the crown, low on the brow, a knot
                                               and two tails at the nape (shaved and buzz heads);
                                               'band': folded into a band over the hair
    tie(figure, shirt, material)               a ribbon down a dress shirt's front panel, a knot
                                               at the collar, a pointed tip at the waist
    lapels(figure, jacket, material, ...)      a suit jacket's lapels along the V (the jacket's
                                               own paint role, so they recolour with it)
    reflective_bands(figure, vest, material)   two silver-grey bands round a hi-vis vest

Everything but the lapels bakes into the atlas in a fixed colour (each base is one gang's). The
pieces sit a few millimetres over the smooth shape of the garment they lie on (the shape the
game piece is made from) and are open sheets or small closed forms: no extra draw call.
"""
import math

import numpy as np
from mathutils import Vector

import _figure as G
import _forms as F
import _wardrobe as W
from lib import scene


def _surface(piece):
    """The smooth surface of a garment piece (its game shape) if it still has one."""
    return piece.shape if getattr(piece, 'shape', None) is not None else piece.dense


def _front(tree, x, z, start=0.6):
    """Where a ray from the front (+Y) at (x, z) first meets `tree`, and the normal facing it."""
    location, normal, _index, _distance = tree.ray_cast(Vector((x, start, z)), Vector((0.0, -1.0, 0.0)), 2.0)
    if location is None:
        return None, None
    normal = np.array(normal[:])
    if normal[1] < 0.0:
        normal = -normal
    return np.array(location[:]), normal


def _sheet(name, material, grid, flip=False):
    """An open sheet from a grid of points (rows of equal length; None drops a row's quads)."""
    soup = F.Soup()
    rows = [row for row in grid if row is not None and all(p is not None for p in row)]
    if len(rows) < 2:
        return None
    columns = len(rows[0])
    vertices = np.array([p for row in rows for p in row])
    faces = []
    for r in range(len(rows) - 1):
        for c in range(columns - 1):
            a, b = r * columns + c, r * columns + c + 1
            quad = (a, b, b + columns, a + columns)
            faces.append(quad[::-1] if flip else quad)
    soup.add(vertices, faces)
    obj = soup.to_object(name)
    scene.set_material(obj, material)
    W.blank_mask(obj)
    return W.Piece(obj, low=scene.duplicate(obj, name + '_low'))


def _closed(name, material, soup, cut):
    """A small closed form (lenses, a knot) as a piece, cut in two islands by `cut(low)`."""
    obj = soup.to_object(name)
    scene.set_material(obj, material)
    W.blank_mask(obj)
    low = scene.duplicate(obj, name + '_low')
    W.cut_seam(low, cut(low))
    return W.Piece(obj, low=low)


def sunglasses(figure, frame, lens):
    """Wrap-around sunglasses: two dark lenses curving round the eyes, a bridge over the nose and
    thin temples back to the tops of the ears."""
    k, hp = figure.head_scale, figure.head_point
    glass, rims = F.Soup(), F.Soup()
    for side in (1.0, -1.0):
        axes = F.basis((0.22 * side, 1.0, 0.0), (0.0, 0.0, 1.0))
        glass.ellipsoid(hp(0.0320, 0.0935, 0.1180, side), np.array([0.0245, 0.0030, 0.0170]) * k, axes,
                        segments=18, rings=6)
        rims.tube([hp(0.0545, 0.0880, 0.1250, side), hp(0.0750, 0.0720, 0.1250, side),
                   hp(0.0790, 0.0250, 0.1225, side), hp(0.0770, -0.0200, 0.1130, side)],
                  np.full(4, 0.0017 * k), side=(0.0, 0.0, 1.0), segments=6)
    rims.tube([hp(-0.0110, 0.0960, 0.1270), hp(0.0, 0.0985, 0.1290), hp(0.0110, 0.0960, 0.1270)],
              np.full(3, 0.0019 * k), side=(0.0, 0.0, 1.0), segments=6)
    return [_closed('sunglass_lenses', lens, glass, lambda low: F.face_normals(low)[:, 1] > 0.0),
            _closed('sunglass_frame', frame, rims, lambda low: F.face_normals(low)[:, 2] > 0.0)]


def bandana(figure, material, style='head', triangles=420):
    """A cotton bandana. 'head': tied over the crown 5 mm off the scalp, low across the brow,
    above the ears and down to the nape, with a knot and two short tails at the back. 'band':
    folded into a 26 mm band over the hair at the hairline (a ponytail comes out above it)."""
    k, hp = figure.head_scale, figure.head_point
    soup, side = F.Soup(), F.Soup()
    figure._skull(soup, side, 0.0050 if style == 'head' else 0.0100)
    G.absorb(soup, side, mirror=True)
    obj = soup.union('bandana', voxel=0.0035, relax_steps=10, strength=0.5)
    local = figure.to_head(F.positions(obj))
    if style == 'head':
        line = np.interp(local[:, 1], (-0.20, -0.08, -0.02, 0.03, 0.06, 0.20),
                         (0.094, 0.100, 0.142, 0.156, 0.168, 0.168))
        F.delete_vertices(obj, local[:, 2] < line)
    else:
        line = np.interp(local[:, 1], (-0.20, -0.08, 0.0, 0.06, 0.20), (0.150, 0.152, 0.160, 0.172, 0.172))
        F.delete_vertices(obj, (local[:, 2] < line) | (local[:, 2] > line + 0.026))
    F.drop_small_islands(obj)
    scene.set_material(obj, material)
    W.blank_mask(obj)
    back = figure.head_origin[1]
    pieces = [W.Piece(obj, triangles, lambda low: W.cut_seam(low, F.face_centres(low)[:, 0] > 0.0,
                                                               F.face_centres(low)[:, 1] < back))]
    if style == 'head':
        knot = F.Soup()
        knot.ellipsoid(hp(0.0, -0.1150, 0.1270), np.array([0.0150, 0.0095, 0.0120]) * k, segments=12, rings=6)
        for sign in (1.0, -1.0):
            knot.tube([hp(0.0050, -0.1160, 0.1220, sign), hp(0.0120, -0.1110, 0.0980, sign),
                       hp(0.0170, -0.1030, 0.0760, sign)],
                      np.array([[0.0110, 0.0022], [0.0125, 0.0022], [0.0090, 0.0020]]) * k,
                      side=(1.0, 0.0, 0.0), segments=8)
        pieces.append(_closed('bandana_knot', material, knot, lambda low: F.face_normals(low)[:, 1] < 0.0))
    return pieces


def tie(figure, shirt, material):
    """A tie down the front panel of a dress shirt: a knot at the collar, the blade widening to
    the chest and ending in a point at the waist (under a buttoned jacket's V)."""
    s = figure.scale
    surface = _surface(shirt)
    tree = F.tree(surface)
    points = F.positions(surface)
    front = points[(np.abs(points[:, 0]) < 0.012 * s) & (points[:, 1] > 0.0)]
    if len(front) == 0:
        return []
    top = float(front[:, 2].max()) - 0.012 * s
    bottom = (figure.reference['waist'] - 0.01) * s
    grid = []
    for t in np.linspace(0.0, 1.0, 16):
        z = top + (bottom - top) * t
        half = (0.016 + 0.024 * min(t / 0.85, 1.0)) * s
        row = []
        for u in (-1.0, -0.5, 0.0, 0.5, 1.0):
            # The last row draws the point: the middle hangs lowest.
            zz = z + (abs(u) * 0.030 * s if t >= 1.0 else 0.0)
            hit, normal = _front(tree, u * half, zz)
            row.append(None if hit is None else hit + normal * (0.0035 + 0.0012 * (1.0 - abs(u))))
        grid.append(row)
    pieces = []
    blade = _sheet('tie', material, grid)
    if blade is not None:
        pieces.append(blade)
    hit, normal = _front(tree, 0.0, top + 0.004 * s)
    if hit is not None:
        knot = F.Soup()
        knot.ellipsoid(hit + normal * 0.0085, np.array([0.0160, 0.0080, 0.0150]) * s,
                       F.basis(normal, (0.0, 0.0, 1.0)), segments=12, rings=6)
        pieces.append(_closed('tie_knot', material, knot, lambda low: F.face_normals(low)[:, 1] > 0.0))
    return pieces


def lapels(figure, jacket, material, top, bottom):
    """A suit jacket's lapels: lying on its fronts along the V from the collar (`top`, metres)
    down to the button (`bottom`), widest at the notch a quarter of the way down."""
    s, j = figure.scale, figure.joints
    tree = F.tree(_surface(jacket))
    middle = j['chest'][1]
    pieces = []
    for sign in (1.0, -1.0):
        grid = []
        for t in np.linspace(0.0, 1.0, 14):
            z = top + (bottom - top) * t
            edge = None
            for x in np.arange(0.0, 0.16 * s, 0.002):
                hit, _normal = _front(tree, sign * x, z)
                if hit is not None and hit[1] > middle + 0.02 * s:
                    edge = x
                    break
            if edge is None:
                grid.append(None)
                continue
            width = float(np.interp(t, (0.0, 0.20, 0.26, 1.0), (0.034, 0.066, 0.072, 0.006))) * s
            row = []
            for u in (0.0, 0.33, 0.66, 1.0):
                hit, normal = _front(tree, sign * (edge + u * width), z)
                # The roll of the lapel: its folded edge at the opening stands off a little more.
                row.append(None if hit is None else hit + normal * (0.0030 + 0.0025 * (1.0 - u)))
            grid.append(row)
        piece = _sheet('lapel_r' if sign > 0 else 'lapel_l', material, grid, flip=sign < 0)
        if piece is not None:
            pieces.append(piece)
    return pieces


def reflective_bands(figure, vest, material, levels, half=0.025):
    """Retro-reflective bands round a vest at the heights `levels` (metres), each 2 * half wide:
    wherever the vest is (the open front and the armholes leave gaps)."""
    s, j = figure.scale, figure.joints
    tree = F.tree(_surface(vest))
    angles = np.linspace(0.0, math.tau, 121)[:-1]
    pieces = []
    for index, z in enumerate(levels):
        centre_y = float(np.interp(z, [0.9 * s, 1.5 * s], [j['spine'][1], j['chest'][1]]))
        rows = []
        for dz in (half, -half):
            row = []
            for angle in angles:
                d = np.array([math.cos(angle), math.sin(angle), 0.0])
                origin = np.array([0.0, centre_y, z + dz]) + d * 0.5
                location, normal, _i, _dist = tree.ray_cast(Vector(tuple(origin)), Vector(tuple(-d)), 1.0)
                if location is None:
                    row.append(None)
                    continue
                normal = np.array(normal[:])
                if normal @ d < 0.0:
                    normal = -normal
                row.append(np.array(location[:]) + normal * 0.0025)
            rows.append(row)
        soup = F.Soup()
        vertices, faces, ids = [], [], {}
        count = len(angles)

        def vertex(row, i):
            if (row, i) not in ids:
                ids[(row, i)] = len(vertices)
                vertices.append(rows[row][i])
            return ids[(row, i)]

        for i in range(count):
            n = (i + 1) % count
            quad = (rows[0][i], rows[1][i], rows[1][n], rows[0][n])
            if any(p is None for p in quad):
                continue
            if (np.linalg.norm(quad[0] - quad[3]) > 0.03 or np.linalg.norm(quad[1] - quad[2]) > 0.03
                    or np.linalg.norm(quad[0] - quad[1]) > 2.0 * half + 0.02):
                continue
            faces.append((vertex(0, i), vertex(1, i), vertex(1, n), vertex(0, n)))
        if not faces:
            continue
        soup.add(np.array(vertices), faces)
        obj = soup.to_object(f'reflective_band_{index}')
        scene.set_material(obj, material)
        W.blank_mask(obj)
        low = scene.duplicate(obj, obj.name + '_low')
        centres = F.face_centres(low)
        W.cut_seam(low, centres[:, 0] > 0.0, centres[:, 1] < centre_y)
        pieces.append(W.Piece(obj, low=low))
    return pieces
