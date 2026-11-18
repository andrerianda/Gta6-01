"""Modelled leaves, the high-detail sources of every plant texture (a helper module, not an
asset).

Leaves are never painted: each card of foliage in the game is baked from real geometry, a
frond with every leaflet or a spray of twigs with every leaf, so the card carries the true
outline, the true surface normals and the occlusion between the leaves. A Soup collects such
geometry as arrays (thousands of leaves are built in a moment and can be stamped again and
again, bent or turned, to make the whole detailed plant an impostor is baked from).

A part is a tuple (vertices, quads, uvs) of arrays. Leaf parts carry UVs made for
leaf_material: U runs from -1 to 1 across the blade and V from 0 at the stalk to 1 at the tip.

Blender axes: Z up. Flat parts lie on Z = 0 and grow along +Y from the origin.
"""
import math
import random

import bpy
import numpy as np

from lib import materials as M
from lib import scene


# ---------------------------------------------------------------------------------------------
# Soup: detailed geometry as arrays
# ---------------------------------------------------------------------------------------------

class Soup:
    """Collects parts into one mesh."""

    def __init__(self):
        self.vertices, self.quads, self.uvs = [], [], []
        self.count = 0

    def add(self, part, matrix=None, offset=None):
        """Adds a part, optionally turned by a 3x3 `matrix` and moved by `offset`."""
        vertices, quads, uvs = part
        vertices = np.asarray(vertices, dtype=np.float32)
        if matrix is not None:
            vertices = vertices @ np.asarray(matrix, dtype=np.float32).T
        if offset is not None:
            vertices = vertices + np.asarray(offset, dtype=np.float32)
        self.vertices.append(vertices)
        self.quads.append(np.asarray(quads, dtype=np.int32) + self.count)
        self.uvs.append(np.asarray(uvs, dtype=np.float32))
        self.count += len(vertices)
        return self

    def empty(self):
        return self.count == 0

    def part(self):
        """Everything collected so far as one part, to stamp into other soups."""
        return (np.concatenate(self.vertices), np.concatenate(self.quads),
                np.concatenate(self.uvs))

    def object(self, name, material, location=(0.0, 0.0, 0.0)):
        """A mesh object of the collected geometry with `material`."""
        vertices, quads, uvs = self.part()
        mesh = bpy.data.meshes.new(name)
        mesh.vertices.add(len(vertices))
        mesh.vertices.foreach_set('co', vertices.ravel())
        mesh.loops.add(len(quads) * 4)
        mesh.loops.foreach_set('vertex_index', quads.ravel())
        mesh.polygons.add(len(quads))
        mesh.polygons.foreach_set('loop_start', np.arange(len(quads), dtype=np.int32) * 4)
        mesh.polygons.foreach_set('loop_total', np.full(len(quads), 4, dtype=np.int32))
        mesh.update(calc_edges=True)
        mesh.polygons.foreach_set('use_smooth', [True] * len(quads))
        layer = mesh.uv_layers.new(name='UVMap')
        layer.data.foreach_set('uv', uvs[quads.ravel()].ravel())
        mesh.materials.append(material)
        mesh.update()
        obj = scene.new_object(name, mesh)
        obj.location = location
        return obj


def rotation(axis, angle):
    """A 3x3 rotation matrix about 'X', 'Y' or 'Z'."""
    c, s = math.cos(angle), math.sin(angle)
    if axis == 'X':
        return np.array([[1, 0, 0], [0, c, -s], [0, s, c]], dtype=np.float32)
    if axis == 'Y':
        return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]], dtype=np.float32)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], dtype=np.float32)


def basis(right, forward, up):
    """A 3x3 matrix that takes a part's X, Y and Z to the three given directions."""
    return np.array([right, forward, up], dtype=np.float32).T


def _frames(path, up):
    path = np.asarray(path, dtype=np.float64)
    tangent = np.gradient(path, axis=0)
    tangent /= np.maximum(np.linalg.norm(tangent, axis=1, keepdims=True), 1e-9)
    side = np.cross(tangent, np.asarray(up, dtype=np.float64))
    short = np.linalg.norm(side, axis=1) < 1e-4
    side[short] = np.cross(tangent[short], np.array([1.0, 0.0, 0.0]))
    side /= np.maximum(np.linalg.norm(side, axis=1, keepdims=True), 1e-9)
    lift = np.cross(side, tangent)
    return path, tangent, side, lift


def ribbon(path, widths, fold=0.0, up=(0.0, 0.0, 1.0), v_range=(0.0, 1.0)):
    """A blade along `path`: `widths[i]` wide, facing `up`, its edges lifted by `fold` times
    the half width (a V section along the midrib). Returns a leaf part."""
    path, _tangent, side, lift = _frames(path, up)
    half = (np.asarray(widths, dtype=np.float64) * 0.5)[:, None]
    edge = lift * (fold * half)
    vertices = np.stack([path - side * half + edge, path, path + side * half + edge], axis=1)
    count = len(path)
    rings = np.arange(count - 1)
    quads = np.concatenate([np.stack([rings * 3 + c, rings * 3 + c + 1, rings * 3 + c + 4,
                                      rings * 3 + c + 3], axis=1) for c in (0, 1)])
    v = np.linspace(v_range[0], v_range[1], count)
    uvs = np.stack([np.tile(np.array([-1.0, 0.0, 1.0]), count), np.repeat(v, 3)], axis=1)
    return vertices.reshape(-1, 3).astype(np.float32), quads, uvs.astype(np.float32)


def tube(path, radii, sides=6, up=(0.0, 0.0, 1.0)):
    """A round twig or stalk along `path`. Its UVs run 0..1 around and along."""
    path, _tangent, side, lift = _frames(path, up)
    radii = np.broadcast_to(np.asarray(radii, dtype=np.float64), (len(path),))[:, None, None]
    angles = np.linspace(0.0, math.tau, sides, endpoint=False)
    ring = side[:, None, :] * np.cos(angles)[None, :, None] + lift[:, None, :] * np.sin(angles)[None, :, None]
    vertices = path[:, None, :] + ring * radii
    count = len(path)
    quads = []
    for r in range(count - 1):
        for c in range(sides):
            n = (c + 1) % sides
            quads.append((r * sides + c, (r + 1) * sides + c, (r + 1) * sides + n, r * sides + n))
    uvs = np.stack([np.tile(np.arange(sides) / sides, count),
                    np.repeat(np.linspace(0.0, 1.0, count), sides)], axis=1)
    return (vertices.reshape(-1, 3).astype(np.float32), np.array(quads, dtype=np.int32),
            uvs.astype(np.float32))


def ball(radius, squash=(1.0, 1.0, 1.0), segments=10, rings=6):
    """An ellipsoid (a fruit, a bud) centred on the origin."""
    vertices, quads = [], []
    for r in range(rings + 1):
        polar = math.pi * clamp(r / rings, 0.02, 0.98)
        for c in range(segments):
            angle = math.tau * c / segments
            vertices.append((radius * squash[0] * math.sin(polar) * math.cos(angle),
                             radius * squash[1] * math.sin(polar) * math.sin(angle),
                             -radius * squash[2] * math.cos(polar)))
    for r in range(rings):
        for c in range(segments):
            n = (c + 1) % segments
            quads.append((r * segments + c, r * segments + n, (r + 1) * segments + n,
                          (r + 1) * segments + c))
    uvs = [(c / segments, r / rings) for r in range(rings + 1) for c in range(segments)]
    return (np.array(vertices, dtype=np.float32), np.array(quads, dtype=np.int32),
            np.array(uvs, dtype=np.float32))


def disc(radius, sides=40, rings=3, wobble=0.15, rise=0.05, seed=0):
    """A low mound with a ragged outline: the soil or sand under a plant."""
    rng = random.Random(seed)
    edge = [1.0 + wobble * (0.6 * math.sin(3 * math.tau * c / sides + rng.uniform(0, 6))
                            + rng.uniform(-0.5, 0.5)) for c in range(sides)]
    vertices, quads = [], []
    for r in range(rings + 1):
        t = max(r / rings, 0.03)
        for c in range(sides):
            angle = math.tau * c / sides
            reach = radius * t * lerp(1.0, edge[c], t)
            vertices.append((reach * math.cos(angle), reach * math.sin(angle),
                             rise * (1.0 - t * t) + 0.004))
    for r in range(rings):
        for c in range(sides):
            n = (c + 1) % sides
            quads.append((r * sides + c, r * sides + n, (r + 1) * sides + n, (r + 1) * sides + c))
    uvs = [(vertex[0], vertex[1]) for vertex in vertices]
    return (np.array(vertices, dtype=np.float32), np.array(quads, dtype=np.int32),
            np.array(uvs, dtype=np.float32))


def lerp(a, b, t):
    return a + (b - a) * t


def clamp(value, low=0.0, high=1.0):
    return max(low, min(high, value))


# ---------------------------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------------------------

def leaf_material(color, name, seed=0, midrib=(0.30, 0.36, 0.10), veins=9.0, vein_strength=0.5,
                  gloss=0.5, vary=0.25, hue_vary=0.02, turned=0.0,
                  turned_color=(0.45, 0.30, 0.04), dry=0.0, dry_color=(0.27, 0.17, 0.07),
                  tip=None, margin=None):
    """A leaf blade driven by the leaf part's UVs: a paler midrib, side veins running to the
    margin, a different tone on every leaf, a waxy sheen by `gloss`.

    turned: the share of leaves in `turned_color` (yellowing, or the reds of a croton);
    dry: brown dead patches and tips; tip and margin: colours towards the tip and the edge.
    """
    graph = M.Graph(name, seed)
    uv = graph.uv_coords()
    across = graph.math('ABSOLUTE', graph.axis('X', uv))
    along = graph.axis('Y', uv)
    island = graph.geometry('Random Per Island')
    other = graph.white_noise(graph.combine(island, 0.37, 0.11))
    cloud = graph.noise(scale=9.0, detail=4.0)
    base = graph.hsv(color, hue=graph.remap(island, 0.0, 1.0, 0.5 - hue_vary, 0.5 + hue_vary),
                     value=graph.remap(other, 0.0, 1.0, 1.0 - vary, 1.0 + vary))
    base = graph.hsv(base, value=graph.remap(cloud, 0.2, 0.8, 0.9, 1.1))
    if tip is not None:
        base = graph.mix(graph.remap(along, 0.45, 1.0, 0.0, 0.8), base, tip)
    if margin is not None:
        base = graph.mix(graph.remap(across, 0.55, 1.0, 0.0, 0.85), base, margin)
    if turned > 0:
        pick = graph.mask(graph.white_noise(graph.combine(island, 0.83, 0.59)), 1.0 - turned, 0.01)
        tone = graph.hsv(turned_color, value=graph.remap(cloud, 0.2, 0.8, 0.8, 1.2))
        base = graph.mix(graph.mul(pick, graph.remap(other, 0.0, 1.0, 0.6, 1.0)), base, tone)
    rib = graph.remap(across, 0.0, 0.16, 1.0, 0.0, smooth=True)
    chevron = graph.wave(period=1.0 / veins, vector=graph.combine(
        graph.sub(along, graph.mul(across, 0.45)), 0.0, 0.0))
    side_veins = graph.mul(graph.remap(chevron, 0.0, 0.22, 1.0, 0.0), vein_strength)
    base = graph.mix(graph.mul(side_veins, 0.35), base, midrib)
    base = graph.mix(graph.mul(rib, 0.75), base, midrib)
    coat = M.Coat(graph, base,
                  roughness=graph.remap(cloud, 0.2, 0.8, 0.60 - 0.34 * gloss, 0.70 - 0.34 * gloss),
                  height=graph.add(graph.mul(rib, -0.8), graph.mul(side_veins, -0.4)))
    if dry > 0:
        patch = graph.noise(scale=6.0, detail=6.0, roughness=0.7)
        ends = graph.remap(along, 0.55, 1.0, 0.0, 0.5)
        mask = graph.mask(graph.add(graph.add(patch, graph.mul(other, 0.3)), ends),
                          1.2 - 0.55 * dry, 0.06)
        coat.cover(mask, color=dry_color, roughness=0.85)
    return coat.finish(bump_strength=0.5, bump_distance=0.0012, specular=0.6)


def stalk_material(color, name, seed=0, gloss=0.4, streaks=0.5):
    """A green or straw stalk: midribs, petioles, twigs still in leaf."""
    graph = M.Graph(name, seed)
    fibres = graph.noise(scale=160.0, detail=3.0, stretch=(1.0, 0.04, 1.0))
    cloud = graph.noise(scale=5.0, detail=4.0)
    base = graph.hsv(color, value=graph.remap(fibres, 0.2, 0.8, 1.0 - 0.2 * streaks,
                                               1.0 + 0.2 * streaks))
    base = graph.hsv(base, value=graph.remap(cloud, 0.2, 0.8, 0.85, 1.12))
    coat = M.Coat(graph, base, roughness=0.62 - 0.3 * gloss, height=graph.mul(fibres, 0.4))
    return coat.finish(bump_strength=0.4, bump_distance=0.001)


def litter_material(color, name, seed=0, speckle=0.4):
    """Loose ground under a plant: soil, mulch, sand with debris, in broken tones."""
    graph = M.Graph(name, seed)
    lumps = graph.voronoi(scale=45.0, feature='F1')
    grain = graph.noise(scale=220.0, detail=4.0, roughness=0.75)
    cloud = graph.noise(scale=3.0, detail=5.0)
    base = graph.hsv(color, value=graph.remap(lumps, 0.0, 0.6, 1.25, 0.6))
    base = graph.hsv(base, value=graph.remap(cloud, 0.2, 0.8, 0.8, 1.2),
                     hue=graph.remap(cloud, 0.2, 0.8, 0.49, 0.51))
    base = graph.hsv(base, value=graph.remap(grain, 0.2, 0.8, 1.0 - speckle * 0.4,
                                              1.0 + speckle * 0.4))
    coat = M.Coat(graph, base, roughness=0.93,
                  height=graph.add(graph.mul(lumps, -0.8), graph.mul(grain, 0.3)))
    return coat.finish(bump_strength=0.9, bump_distance=0.006)


# ---------------------------------------------------------------------------------------------
# Feather fronds (palms)
# ---------------------------------------------------------------------------------------------

def feather_profile(along):
    """Leaflet length along a royal or date palm frond: short at the stalk, longest before the
    middle, shortest at the tip."""
    return 0.44 + 0.56 * math.sin(math.pi * min(1.0, along * 1.25) ** 0.8)


def coconut_profile(along):
    """Leaflet length along a coconut frond: long from the start, tapering evenly to the tip."""
    return 0.38 + 0.62 * math.sin(math.pi * min(1.0, 0.18 + along * 1.0) ** 0.75)


def pinnate_frond(length, pairs, reach, seed, width=0.042, bare=0.07, angles=(62.0, 30.0),
                  plumose=1.0, lift=0.05, droop=0.035, rachis=(0.022, 0.004), ragged=0.0,
                  missing=0.0, profile=feather_profile, fold=0.32, stalk_width=1.0):
    """A feather frond lying flat along +Y: returns (leaflets, stalk) as two Soups.

    pairs leaflets on each side of the midrib, the longest `reach` metres, leaving the
    midrib at angles[0] degrees near the stalk and angles[1] at the tip. plumose sets the
    leaflets in two ranks at different angles and heights, as a royal palm's are; ragged
    (0..1) is the disorder of an old or dead frond and missing the share of leaflets lost.
    """
    rng = random.Random(seed)
    leaves, stalk = Soup(), Soup()
    midrib_length = length - reach * 0.36 * math.cos(math.radians(angles[1]))
    steps = np.linspace(0.0, 1.0, 6)
    taper = np.array([0.6, 1.0, 0.96, 0.78, 0.44, 0.05])
    for side in (-1.0, 1.0):
        for index in range(pairs):
            along = (index + 0.5 + 0.25 * side) / pairs
            if along < bare or rng.random() < missing:
                continue
            y = along * midrib_length
            size = reach * profile(along) * rng.uniform(0.9, 1.08)
            rank = index % 2
            angle = math.radians(lerp(angles[0], angles[1], along) + rng.uniform(-7.0, 7.0)
                                 + plumose * (11.0 if rank else -9.0)
                                 + ragged * rng.uniform(-22.0, 22.0))
            rise = 0.012 + plumose * 0.02 * rank
            sag = droop * (1.0 + ragged * rng.uniform(0.0, 3.0))
            x = side * (0.012 + math.sin(angle) * size * steps)
            path = np.stack([x, y + math.cos(angle) * size * steps,
                             rise + lift * np.sin(math.pi * 0.9 * steps) - sag * steps * steps],
                            axis=1)
            if ragged > 0:
                path[:, 0] += ragged * 0.05 * np.sin(steps * rng.uniform(3.0, 9.0)) * size
            blade = width * rng.uniform(0.85, 1.15) * (1.0 - 0.35 * ragged)
            leaves.add(ribbon(path, blade * taper, fold=fold))
    count = 12
    spine = [(0.0, midrib_length * step / (count - 1), 0.006) for step in range(count)]
    radii = [lerp(rachis[0], rachis[1], (step / (count - 1)) ** 0.8) for step in range(count)]
    part = tube(spine, radii, sides=6)
    part[0][:, 0] *= stalk_width          # a broad, flat stalk
    stalk.add(part)
    return leaves, stalk


def strands(count, length, seed, spread=60.0, thickness=0.006, droop=0.35, wave=0.04,
            beads=0.0, origin=(0.0, 0.0, 0.0)):
    """A broom of thin strands fanning out from `origin` along +Y in the XY plane: a palm's
    flower stalk, fibres, roots. beads adds small fruits along them. Returns a Soup."""
    rng = random.Random(seed)
    soup = Soup()
    steps = np.linspace(0.0, 1.0, 8)
    for index in range(count):
        angle = math.radians(rng.uniform(-spread, spread))
        reach = length * rng.uniform(0.55, 1.0)
        bend = droop * rng.uniform(0.4, 1.0) * (1.0 if angle >= 0 else -1.0)
        heading = angle + bend * steps * steps
        x = origin[0] + np.cumsum(np.sin(heading)) * reach / len(steps)
        y = origin[1] + np.cumsum(np.cos(heading)) * reach / len(steps)
        x += wave * reach * np.sin(steps * rng.uniform(6.0, 14.0) + rng.uniform(0.0, 6.0)) * steps
        z = origin[2] + 0.01 + 0.03 * rng.random() + 0.0 * steps
        path = np.stack([x, y, z], axis=1)
        soup.add(ribbon(path, np.full(len(steps), thickness * rng.uniform(0.7, 1.3))))
        if beads > 0:
            for step in range(2, len(steps)):
                if rng.random() < beads:
                    soup.add(ball(thickness * 1.6, segments=6, rings=4), offset=path[step])
    return soup


# ---------------------------------------------------------------------------------------------
# Grass and ground litter
# ---------------------------------------------------------------------------------------------

def grass_tuft(blades, height, seed, spread=42.0, width=0.012, droop=0.5, depth=0.06,
               foot=0.0):
    """A tuft of grass standing in the XZ plane (to bake onto an upright card): blades fan out
    from a point on the ground and bend over. Returns a Soup."""
    rng = random.Random(seed)
    soup = Soup()
    steps = np.linspace(0.0, 1.0, 7)
    taper = np.array([0.9, 1.0, 0.95, 0.8, 0.6, 0.35, 0.04])
    for index in range(blades):
        lean = math.radians(rng.uniform(-spread, spread))
        tall = height * rng.uniform(0.45, 1.0)
        bend = droop * rng.uniform(0.2, 1.0) * (1.0 if lean >= 0 else -1.0)
        heading = lean + bend * steps * steps
        x = rng.uniform(-foot, foot) + np.cumsum(np.sin(heading)) * tall / len(steps)
        z = np.cumsum(np.cos(heading)) * tall / len(steps)
        y = rng.uniform(-depth, depth) + 0.0 * steps
        path = np.stack([x, y, np.maximum(z, 0.0)], axis=1)
        path[0, 2] = 0.0
        soup.add(ribbon(path, width * rng.uniform(0.7, 1.3) * taper, fold=0.25,
                        up=(0.0, -1.0, 0.0)))
    return soup


def litter(radius, seed, chips=160, chip=(0.07, 0.025), scatter=1.25, leaves=0):
    """What lies under a plant, to bake onto a square ground card: returns (mound, chips,
    leaves) as three Soups about the origin: a ragged mound of soil, flat chips of mulch or
    shell strewn over and beyond it, and dead leaflets."""
    rng = random.Random(seed)
    mound, bits, dead = Soup(), Soup(), Soup()
    mound.add(disc(radius * 0.86, sides=48, rings=4, wobble=0.16, rise=0.05, seed=seed))
    for _ in range(chips):
        reach = radius * scatter * math.sqrt(rng.random())
        if reach > radius and rng.random() < 0.55:
            continue
        angle = rng.uniform(0.0, math.tau)
        turn = rng.uniform(0.0, math.pi)
        long, wide = chip[0] * rng.uniform(0.5, 1.4), chip[1] * rng.uniform(0.6, 1.5)
        path = [(-long * 0.5, 0.0, 0.0), (long * 0.5, 0.0, 0.0)]
        part = ribbon(path, [wide, wide * rng.uniform(0.5, 1.0)], up=(0.0, 0.0, 1.0))
        tilt = rotation('X', rng.uniform(-0.35, 0.35)) @ rotation('Z', turn)
        height = 0.05 * (1.0 - min(1.0, reach / radius) ** 2) + rng.uniform(0.012, 0.035)
        bits.add(part, matrix=tilt, offset=(reach * math.cos(angle), reach * math.sin(angle), height))
    steps = np.linspace(0.0, 1.0, 5)
    for _ in range(leaves):
        reach = radius * 1.15 * math.sqrt(rng.random())
        angle = rng.uniform(0.0, math.tau)
        long = rng.uniform(0.25, 0.6)
        path = np.stack([long * (steps - 0.5), 0.03 * np.sin(steps * 5.0), 0.0 * steps], axis=1)
        part = ribbon(path, 0.03 * np.array([0.6, 1.0, 0.9, 0.6, 0.1]), fold=0.2)
        dead.add(part, matrix=rotation('Z', rng.uniform(0.0, math.tau)),
                 offset=(reach * math.cos(angle), reach * math.sin(angle),
                         0.06 * (1.0 - min(1.0, reach / radius) ** 2) + rng.uniform(0.03, 0.05)))
    return mound, bits, dead
