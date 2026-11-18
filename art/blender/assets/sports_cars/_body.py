"""Shared helper of the hero cars: the body shell, lofted from a car's curves.

A car is described by a few curves over its length (y, tail to nose) and some marks:

    top      height of the centreline (deck, rear glass, roof, windscreen, hood)
    rail_x   half width and
    rail_z   height of the top edge: the roof rail in the cabin, the fender crest elsewhere
    belt     height of the shoulder line under the side glass
    plan     largest half width (the plan outline)
    shelf    how far the glass base sits inboard of the plan outline
    bottom   height of the sill and of the bumpers' lower edge
    tuck     how far the sill sits inboard of the plan outline

Shell samples them into ONE half quad grid: rows are stations along the car, columns run from
the roof centreline over the rail, down the glass, over the shoulder and down the side to the
sill. Wheel arches are cut by lifting the lower edge of the side onto a circle (the rows there
are spaced on equal chords of that circle) and flaring the metal around it. Normals and UVs are
computed once on the uncut grid; then the grid is cut into panels (hood, doors, bumpers, glass)
by row and column ranges, with a shut gap and an inward flange between painted panels, so the
reflection runs unbroken across every shut line. The ends are closed by bowed caps, the arches
get liners and the underside a floor.

Blender axes: Z up, nose towards +Y, the half that is modelled is the right one (+X).
"""
import math

import numpy as np

import _mesh
from _curves import lerp

N_TOP, N_GLASS, N_SHELF, N_SIDE = 8, 4, 2, 8
COL_RAIL = N_TOP                              # the column of the roof rail / fender crest
COL_GLASS_BASE = N_TOP + N_GLASS              # the column of the glass base
COL_BELT = N_TOP + N_GLASS + N_SHELF          # the column of the shoulder crease
COLUMNS = COL_BELT + N_SIDE                   # cells across the half section
GAP, FLANGE, ARCH_GUARD = 0.005, 0.018, 0.014


def arch_height(spec, y):
    """The height of the wheel-arch opening at station y, or None away from the wheels."""
    radius = spec['arch_radius']
    for axle in (spec['axle_r'], spec['axle_f']):
        offset = abs(y - axle)
        if offset <= radius + 1e-6:
            return spec['wheel_radius'] + math.sqrt(max(0.0, radius * radius - offset * offset))
    return None


def stations(spec):
    """The rows: (positions along the car, {mark name: row index}). The arches get rows on
    equal chords of their circle plus a guard row just outside each end; elsewhere rows are at
    most spec['row_step'] apart. A mark inside an arch snaps to the nearest row."""
    radius, count = spec['arch_radius'], spec.get('arch_rows', 16)
    fixed, spans = [], []
    for axle in (spec['axle_r'], spec['axle_f']):
        ring = [axle - radius * math.cos(math.pi * k / count) for k in range(count + 1)]
        ring[0], ring[-1] = axle - radius, axle + radius
        fixed += ring + [ring[0] - ARCH_GUARD, ring[-1] + ARCH_GUARD]
        spans.append((ring[0] - ARCH_GUARD, ring[-1] + ARCH_GUARD))
    for y in spec['marks'].values():
        if not any(low - 0.03 < y < high + 0.03 for low, high in spans):
            fixed.append(y)
    fixed = sorted(fixed)
    step = spec.get('row_step', 0.11)
    ys = [fixed[0]]
    for start, end in zip(fixed, fixed[1:]):
        if end - start < 1e-5:
            continue
        inside = any(low - 1e-6 <= start and end <= high + 1e-6 for low, high in spans)
        steps = 1 if inside else max(1, math.ceil((end - start) / step - 1e-6))
        ys += [start + (end - start) * n / steps for n in range(1, steps + 1)]
    rows = {name: min(range(len(ys)), key=lambda i: abs(ys[i] - y))
            for name, y in spec['marks'].items()}
    return ys, rows


def section(spec, y):
    """The COLUMNS + 1 points of the half section at station y, centreline first."""
    curves = spec['curves']
    top, plan, belt = curves['top'](y), curves['plan'](y), curves['belt'](y)
    low, tuck = curves['bottom'](y), curves['tuck'](y)
    glass_x, glass_z = plan - curves['shelf'](y), belt + 0.018
    rail_x = min(curves['rail_x'](y), glass_x - 0.012)
    rail_z = min(max(curves['rail_z'](y), glass_z + 0.008), top - 0.004)
    bubble = curves['bubble'](y) if 'bubble' in curves else 0.0
    power = spec.get('crown_power', 2.4)
    points = []
    for j in range(N_TOP):
        s = math.sin(0.5 * math.pi * j / N_TOP)
        x = rail_x * s
        dip = bubble * max(0.0, 1.0 - (x / 0.26) ** 2) ** 2
        points.append((x, y, top - (top - rail_z) * s ** power - dip))
    tall = min(1.0, (rail_z - glass_z) / 0.2)
    for j in range(N_GLASS):
        v = j / N_GLASS
        bow = spec.get('glass_bow', 0.014) * tall * math.sin(math.pi * v)
        points.append((lerp(rail_x, glass_x, v) + bow, y, lerp(rail_z, glass_z, v) + 0.4 * bow))
    belt_x, belt_z = plan - 0.022, belt - 0.02
    points.append((glass_x, y, glass_z))
    points.append((lerp(glass_x, belt_x, 0.7), y, lerp(glass_z, belt_z, 0.3)))
    arch = arch_height(spec, y)
    edge = max(low, arch) if arch is not None else low
    reach = (belt_z - edge) / (belt_z - low)
    widest = spec.get('widest', 0.38)
    scallop = curves['scallop'](y) if 'scallop' in curves else 0.0
    for j in range(N_SIDE + 1):
        t = reach * j / N_SIDE
        if t < widest:
            x = plan - 0.022 * (1.0 - t / widest) ** 2
        else:
            x = plan - tuck * ((t - widest) / (1.0 - widest)) ** 2
        z = belt_z + (low - belt_z) * t
        # The scallop hollows the lower half of the side, leaving a crisp line under the shoulder.
        x += _flare(spec, y, z) - scallop * math.exp(-((t - 0.62) / 0.2) ** 2)
        points.append((x, y, z))
    return points


def _flare(spec, y, z):
    """How far the metal is pushed out at (y, z) by the lip around a wheel arch."""
    radius, width = spec['arch_radius'], 0.09
    for axle in (spec['axle_r'], spec['axle_f']):
        if abs(y - axle) < radius + width:
            distance = math.hypot(y - axle, z - spec['wheel_radius']) - radius
            if -0.002 <= distance < width:
                return spec.get('flare', 0.015) * (1.0 - max(0.0, distance) / width) ** 2
    return 0.0


def sheet_normals(points):
    """Unit normals of a grid of points (rows x columns x 3) whose first column lies on the
    car's centreline: towards the side from which columns run left to right and rows away."""
    across = np.gradient(points, axis=1)
    along = np.gradient(points, axis=0)
    across[:, 0] = (1.0, 0.0, 0.0)
    normals = np.cross(across, along)
    lengths = np.linalg.norm(normals, axis=2, keepdims=True)
    return np.where(lengths > 1e-12, normals / np.maximum(lengths, 1e-12), (0.0, 0.0, 1.0))


class Shell:
    """The half body grid and its division into panels."""

    def __init__(self, spec):
        self.spec = spec
        self.ys, self.rows = stations(spec)
        self.points = np.array([section(spec, y) for y in self.ys], dtype=float)
        self._tuck_ends()
        self.normals = sheet_normals(self.points)
        count = len(self.ys) - 1
        self.owner = np.zeros((count, COLUMNS), dtype=int)
        self.cell_material = [['paint'] * COLUMNS for _ in range(count)]
        self.names = ['lod0']
        self.gapped = [True]

    def _tuck_ends(self):
        """Rakes the tail and the nose (spec 'tail_tuck', 'nose_tuck', metres): below the
        shoulder the last 0.35 m of the body lean in under the car, most at the lower edge, so
        the ends are not upright walls."""
        for end, key, sign in ((0, 'tail_tuck', 1.0), (-1, 'nose_tuck', -1.0)):
            amount = self.spec.get(key, 0.0)
            if not amount:
                continue
            for i, y in enumerate(self.ys):
                weight = 1.0 - abs(y - self.ys[end]) / 0.35
                if weight <= 0.0:
                    continue
                top, low = self.points[i, COL_BELT, 2], self.points[i, -1, 2]
                for j in range(COL_BELT, COLUMNS + 1):
                    depth = (top - self.points[i, j, 2]) / max(top - low, 1e-6)
                    self.points[i, j, 1] += sign * amount * weight ** 2 * max(0.0, depth) ** 1.5

    def near_row(self, y):
        """The index of the row nearest to station y."""
        return min(range(len(self.ys)), key=lambda i: abs(self.ys[i] - y))

    def row(self, mark):
        """A row index from a mark name (or the index itself)."""
        return self.rows[mark] if isinstance(mark, str) else mark

    def assign(self, name, rows, cols, material=None, gap=True):
        """Gives the cells between two rows (marks) and two columns to the panel `name`, and
        optionally a material. gap=False (glass set in a seal) leaves no shut gap."""
        if name not in self.names:
            self.names.append(name)
            self.gapped.append(gap)
        panel = self.names.index(name)
        for i in range(self.row(rows[0]), self.row(rows[1])):
            for j in range(cols[0], cols[1]):
                self.owner[i, j] = panel
                if material:
                    self.cell_material[i][j] = material

    def paint(self, rows, cols, material):
        """Gives the cells between two rows and two columns a material, whoever owns them."""
        for i in range(self.row(rows[0]), self.row(rows[1])):
            for j in range(cols[0], cols[1]):
                self.cell_material[i][j] = material

    def open(self, rows, cols):
        """Leaves the cells between two rows and two columns out of the mesh: the cockpit
        opening of an open car (the interior's walls close it from inside)."""
        self.paint(rows, cols, None)

    def point(self, mark, column):
        """The grid point at a marked row and a column, as a tuple."""
        return tuple(float(value) for value in self.points[self.row(mark), column])

    # -- meshing ----------------------------------------------------------------------------

    def _position(self, panel, i, j, centres):
        """A panel's own copy of grid point (i, j): pulled back by half the shut gap where the
        panel meets another gapped panel."""
        point = self.points[i, j]
        if not self.gapped[panel]:
            return point
        own, rival = [], []
        for ci, cj in ((i - 1, j - 1), (i - 1, j), (i, j - 1), (i, j)):
            if 0 <= ci < centres.shape[0] and 0 <= cj < centres.shape[1]:
                other = self.owner[ci, cj]
                if other == panel:
                    own.append(centres[ci, cj])
                elif self.gapped[other]:
                    rival.append(centres[ci, cj])
        if not own or not rival:
            return point
        away = np.mean(own, axis=0) - np.mean(rival, axis=0)
        length = float(np.linalg.norm(away))
        return point + away * (0.5 * GAP / length) if length > 1e-9 else point

    @staticmethod
    def _flange(data, first, second, normal_a, normal_b, toward):
        """The return flange of a panel edge: a strip going inwards, facing the gap."""
        a, b = np.array(data.points[first]), np.array(data.points[second])
        inner_a, inner_b = a - normal_a * FLANGE, b - normal_b * FLANGE
        indices = [first, second, data.point(inner_b), data.point(inner_a)]
        if float(np.dot(np.cross(b - a, inner_a - a), toward)) < 0.0:
            indices.reverse()
        data.face(indices, 'gap', level=0)

    def build(self, materials):
        """Meshes every panel: returns {panel name: object} (right half, at identity)."""
        points, normals = self.points, self.normals
        row_count, column_count = points.shape[0], points.shape[1]
        centres = 0.25 * (points[:-1, :-1] + points[1:, :-1] + points[:-1, 1:] + points[1:, 1:])
        u = np.zeros((row_count, column_count))
        u[:, 1:] = np.cumsum(np.linalg.norm(points[:, 1:] - points[:, :-1], axis=2), axis=1)
        v = np.zeros((row_count, column_count))
        v[1:, :] = np.cumsum(np.linalg.norm(points[1:] - points[:-1], axis=2), axis=0)
        datas = [_mesh.MeshData() for _name in self.names]
        indices = [{} for _name in self.names]
        for i in range(row_count - 1):
            for j in range(column_count - 1):
                if self.cell_material[i][j] is None:
                    continue                    # an opening (Shell.open)
                panel = int(self.owner[i, j])
                data, index = datas[panel], indices[panel]
                corners = [(i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j)]
                for key in corners:
                    if key not in index:
                        index[key] = data.point(self._position(panel, key[0], key[1], centres))
                data.face([index[key] for key in corners], self.cell_material[i][j], level=2,
                          uvs=[(float(u[key]), float(v[key])) for key in corners],
                          normals=[tuple(normals[key]) for key in corners])
                if not self.gapped[panel]:
                    continue
                for (ni, nj), a, b in (((i - 1, j), (i, j), (i, j + 1)),
                                       ((i + 1, j), (i + 1, j), (i + 1, j + 1)),
                                       ((i, j - 1), (i, j), (i + 1, j)),
                                       ((i, j + 1), (i, j + 1), (i + 1, j + 1))):
                    if not (0 <= ni < row_count - 1 and 0 <= nj < column_count - 1):
                        continue
                    other = int(self.owner[ni, nj])
                    if other != panel and self.gapped[other]:
                        self._flange(data, index[a], index[b], normals[a], normals[b],
                                     centres[ni, nj] - centres[i, j])
        self._cap(datas, 0)
        self._cap(datas, -1)
        self._liners(datas[0])
        self._floor(datas[0])
        return {name: data.to_object(name, materials)
                for name, data in zip(self.names, datas) if data.faces}

    def _cap(self, datas, end):
        """Closes the tail (end 0) or the nose (end -1) with a face bowed in plan; each band of
        the cap belongs to the panel that owns the ring cell it hangs from."""
        ring = self.points[end]
        sign = 1.0 if end else -1.0
        bow = self.spec['nose_bow'] if end else self.spec['tail_bow']
        fractions = [math.sin(0.5 * math.pi * k / N_TOP) for k in range(N_TOP + 1)]
        rows = [[tuple(ring[k]) for k in range(N_TOP + 1)]]
        for j in range(N_TOP, len(ring)):
            x, y, z = ring[j]
            rows.append([(x * s, y + sign * bow * (1.0 - s * s), z) for s in fractions])
        grid = np.array(rows, dtype=float)
        normals = sheet_normals(grid) * sign
        cell_row = self.owner.shape[0] - 1 if end else 0
        # Dark areas of the end face (tail panel, diffuser, grille, intakes): spec 'tail_bands'
        # / 'nose_bands', each (z low, z high, from, to, material) with from / to as fractions
        # of the half width.
        zones = self.spec.get('nose_bands' if end else 'tail_bands', ())
        cache = {}
        for band in range(len(rows) - 1):
            column = 0 if band == 0 else N_TOP + band - 1
            data = datas[int(self.owner[cell_row, column])]
            base = self.cell_material[cell_row][column]
            if base.startswith('lamp') or base.startswith('glass'):
                base = 'paint'
            middle = 0.5 * (grid[band, N_TOP, 2] + grid[band + 1, N_TOP, 2])
            for k in range(N_TOP):
                material = base
                for low, high, start, stop, name in zones:
                    if (band and low <= middle <= high and fractions[k] >= start - 1e-6
                            and fractions[k + 1] <= stop + 1e-6):
                        material = name
                corners = [(band, k), (band, k + 1), (band + 1, k + 1), (band + 1, k)]
                if not end:
                    corners.reverse()
                ids = []
                for key in corners:
                    spot = (id(data),) + tuple(round(float(value), 5) for value in grid[key])
                    if spot not in cache:
                        cache[spot] = data.point(grid[key])
                    ids.append(cache[spot])
                data.face(ids, material, level=2,
                          uvs=[(float(grid[key][0]), float(grid[key][2])) for key in corners],
                          normals=[tuple(normals[key]) for key in corners])

    def cap_y(self, end, x, z):
        """The y of the tail (end 0) or nose (end -1) cap at half width x and height z."""
        ring = self.points[end]
        nearest = min(range(N_TOP, len(ring)), key=lambda j: abs(ring[j][2] - z))
        s = min(1.0, abs(x) / max(ring[nearest][0], 1e-6))
        bow = self.spec['nose_bow'] if end else self.spec['tail_bow']
        return float(ring[nearest][1]) + (1.0 if end else -1.0) * bow * (1.0 - s * s)

    def _liners(self, data):
        """The wheel-arch liners: a tunnel inboard of each arch edge and its end wall."""
        depth = self.spec.get('liner_depth', 0.30)
        for axle in (self.spec['axle_r'], self.spec['axle_f']):
            rows = [i for i, y in enumerate(self.ys)
                    if abs(y - axle) <= self.spec['arch_radius'] + 1e-6]
            edge = [self.points[i, -1] for i in rows]
            inner_x = min(float(point[0]) for point in edge) - depth
            outer = [data.point(point) for point in edge]
            inner = [data.point((inner_x, point[1], point[2])) for point in edge]
            for n in range(len(rows) - 1):
                data.face([outer[n], inner[n], inner[n + 1], outer[n + 1]], 'liner', level=1)
            data.face(inner, 'liner', level=1)

    def _floor(self, data):
        """The underside: a flat sheet from the centreline to the sill, narrower at the arches."""
        curves, depth = self.spec['curves'], self.spec.get('liner_depth', 0.30)
        rows = []
        for i, station in enumerate(self.ys):
            edge = curves['plan'](station) - curves['tuck'](station)
            if arch_height(self.spec, station) is not None:
                edge -= depth
            z = curves['bottom'](station)
            y = float(self.points[i, -1, 1])           # the raked ends carry the floor along
            rows.append([(0.0, y, z), (0.5 * edge, y, z), (edge, y, z)])
        data.quad_grid(rows, 'underbody', level=1, flip=True)
