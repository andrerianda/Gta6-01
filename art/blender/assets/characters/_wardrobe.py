"""Wardrobe: clothes, boots and hair as their own geometry over a Figure.

Every piece is modelled twice from the same recipe: a dense source (a voxel shell of the
figure's own forms swollen by the garment's ease, cut open, drawn in at cuffs, hem and collar;
or a ribbed band lofted through rings) that the textures are baked from, and a light game piece
(the decimated shell, or the same band with few segments) that is joined into lod0. Each piece
carries the paint role of its part of the outfit as its material name:

    paint_jacket   the shell of a jacket (the bomber)
    paint_top      the shirt, or the rib knit collar, cuffs and waistband of the bomber
    paint_bottom   trousers
    paint_shoes    boots (the sole is a darker shade inside it)
    paint_hair     hair (a shell over the skull that fades into the scalp at the hairline)

Pieces known so far: top 'bomber', bottom 'cargo', shoes 'boots', hair 'afro_short'.

The skin under the clothes is not kept (hidden_skin): only the head, the neck inside the collar
and the hands are skin. UV seams are marked where a tailor would sew (cut_seam), so that each
garment unfolds into one or two large islands and few vertices are doubled in the file.
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

import _fabric
import _figure as G
import _forms as F
from lib import materials as M
from lib import scene, shading


def linear(code):
    """A catalog colour ('#RRGGBB', sRGB) as linear RGB."""
    values = [int(code[index:index + 2], 16) / 255.0 for index in (1, 3, 5)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in values)


# ---------------------------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------------------------

def cloth(name, color, roughness=0.85, grain=900.0, relief=0.0005, seed=0, folds=0.0, sheen=0.0):
    """A tintable cloth or leather that reads as textile at the atlas's 1 to 2 mm a texel:
    dye clouding (14 cm) and mottling (2.5 cm) in the value, a yarn texture of short vertical
    slubs (a few millimetres: `grain` sets their fineness) in the value, the roughness and the
    relief, a soft crinkle (2 cm) in the relief, darker in the creases, paler and rougher where
    it rubs (convex edges). The vertex colours 'mask' steer it: red darkens (a sole, a zip),
    green is a seam (sunk and a shade darker; _fabric writes it), blue is wear (rubbed paler).
    `folds` (0..1) adds a broad occlusion shade (7 cm) that darkens the hollows of large folds;
    `sheen` lowers the roughness on the crests and open panels by that much (nylon), leaving the
    hollows matte."""
    graph = M.Graph(name, seed)
    attribute = graph.node('ShaderNodeVertexColor', layer_name='mask')
    split = graph.node('ShaderNodeSeparateColor')
    graph.feed(split.inputs['Color'], attribute.outputs['Color'])
    dark, seam, worn = split.outputs['Red'], split.outputs['Green'], split.outputs['Blue']
    yarn_scale = min(max(grain * 0.28, 170.0), 420.0)
    cloud = graph.noise(scale=7.0, detail=4.0, roughness=0.6)
    mottle = graph.noise(scale=40.0, detail=3.0, roughness=0.6)
    yarn = graph.noise(scale=yarn_scale, detail=2.0, roughness=0.5, stretch=(1.0, 1.0, 0.22))
    crinkle = graph.noise(scale=48.0, detail=5.0, roughness=0.65, distortion=0.7)
    rub = graph.maximum(worn, graph.mul(graph.edges(radius=0.008), 0.6))
    base = graph.hsv(graph.paint_color(color), value=graph.remap(cloud, 0.2, 0.8, 0.86, 1.0))
    base = graph.hsv(base, value=graph.remap(mottle, 0.25, 0.75, 0.94, 1.04))
    base = graph.hsv(base, value=graph.remap(yarn, 0.25, 0.75, 0.88, 1.08))
    base = graph.mix(graph.mul(rub, 0.45), base, graph.hsv(base, saturation=0.82, value=1.28))
    base = graph.mix(graph.mul(seam, 0.30), base, (0.55, 0.55, 0.55), blend='MULTIPLY')
    base = graph.mix(graph.mul(dark, 0.85), base, (0.10, 0.10, 0.10), blend='MULTIPLY')
    rough = graph.add(graph.remap(yarn, 0.2, 0.8, roughness - 0.06, roughness + 0.06), graph.mul(rub, 0.06))
    if sheen > 0.0:
        open_ = graph.remap(graph.cavities(distance=0.025), 0.0, 0.12, 1.0, 0.0)
        crest = graph.edges(radius=0.015)
        rough = graph.sub(rough, graph.mul(graph.add(graph.mul(open_, 0.5), graph.mul(crest, 0.5)), sheen))
    height = graph.add(graph.mul(yarn, 0.35), graph.mul(crinkle, 0.65))
    coat = M.Coat(graph, base, roughness=rough, height=graph.sub(height, graph.mul(seam, 0.5)))
    coat.tint(graph.mul(graph.cavities(distance=0.03), 0.7), (0.20, 0.20, 0.22))
    if folds > 0.0:
        coat.tint(graph.mul(graph.cavities(distance=0.07), folds), (0.36, 0.34, 0.33))
    return coat.finish(bump_strength=0.45, bump_distance=max(relief, 0.0006))


def hair_material(color, seed=0, name='paint_hair'):
    """Tightly curled hair: a cellular relief of small curls, darker between them."""
    graph = M.Graph(name, seed)
    # Coils (about 5 mm, distorted so they are not cells), their strands (short streaks that
    # run down the sides of the head), clumps (2 cm) and a darker, flatter root zone in the
    # hollows; the sheen varies coil by coil.
    warp = graph.noise(scale=90.0, detail=2.0, color=True)
    curls = graph.voronoi(scale=190.0, feature='F1', vector=graph.vector_math(
        'ADD', graph.object_coords(), graph.vector_math('MULTIPLY', warp, (0.004, 0.004, 0.004))))
    strands = graph.noise(scale=420.0, detail=2.0, stretch=(1.0, 1.0, 0.3))
    clumps = graph.noise(scale=55.0, detail=3.0)
    base = graph.hsv(graph.paint_color(color), value=graph.remap(curls, 0.0, 0.6, 1.0, 0.42))
    base = graph.hsv(base, value=graph.remap(strands, 0.25, 0.75, 0.80, 1.0))
    # Near-black hair reads by its sheen, not its colour: the top of each coil and the clumps'
    # crests are glossier (they catch the low sun as a sparkle of separate curls), the hollows
    # between them matte. (A uniform 0.7-0.84 read as a felt cap in the engine.)
    tips = graph.remap(curls, 0.0, 0.45, 1.0, 0.0)
    rough = graph.sub(graph.remap(strands, 0.2, 0.8, 0.66, 0.80),
                      graph.add(graph.mul(tips, 0.20), graph.mul(graph.remap(clumps, 0.5, 0.8, 0.0, 1.0), 0.06)))
    coat = M.Coat(graph, base, roughness=rough,
                  height=graph.add(graph.add(graph.remap(curls, 0.0, 0.6, 1.0, 0.0), graph.mul(clumps, 0.6)),
                                   graph.mul(strands, 0.25)))
    coat.tint(graph.mul(graph.cavities(distance=0.01), 0.6), (0.02, 0.02, 0.02))
    return coat.finish(bump_strength=1.0, bump_distance=0.0035)


# ---------------------------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------------------------

def transfer_normals(low, dense):
    """Gives the game mesh the shading normals of its dense source (custom split normals,
    interpolated from the nearest dense face): a decimated surface then shades as smoothly as
    the sculpture it came from, its facets only show in the outline, and the baked normal map
    carries only the fine relief (so it still fits the decimated lower levels)."""
    shading.smooth(low, angle=math.pi)
    modifier = low.modifiers.new('normals', 'DATA_TRANSFER')
    modifier.object = dense
    modifier.use_loop_data = True
    modifier.data_types_loops = {'CUSTOM_NORMAL'}
    modifier.loop_mapping = 'POLYINTERP_NEAREST'
    scene.activate(low)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    return low


def snap_borders(low, dense, reach=0.02):
    """Puts the open borders of a decimated piece (a hem, a cuff opening, the hairline) back on
    the clean borders of its dense source: edge collapse nibbles a border into teeth."""
    bm = bmesh.new()
    bm.from_mesh(dense.data)
    segments = np.array([[edge.verts[0].co[:], edge.verts[1].co[:]] for edge in bm.edges if edge.is_boundary])
    bm.free()
    if not len(segments):
        return low
    start, span = segments[:, 0], segments[:, 1] - segments[:, 0]
    length = np.maximum((span * span).sum(axis=1), 1e-12)
    bm = bmesh.new()
    bm.from_mesh(low.data)
    for vertex in bm.verts:
        if not vertex.is_boundary:
            continue
        point = np.array(vertex.co[:])
        t = np.clip(((point - start) * span).sum(axis=1) / length, 0.0, 1.0)
        nearest = start + span * t[:, None]
        gap = ((nearest - point) ** 2).sum(axis=1)
        index = int(np.argmin(gap))
        if gap[index] < reach * reach:
            vertex.co = Vector(nearest[index])
    bm.to_mesh(low.data)
    bm.free()
    return low


class Piece:
    """One piece of the wardrobe: the dense source and how to make its game mesh."""

    def __init__(self, dense, triangles=0, seams=None, low=None, shape=None):
        self.dense = dense
        self.triangles = triangles
        self.seams = seams
        self.ready = low
        # The smooth surface before _fabric folded the dense source: the game piece is
        # decimated from it and takes its shading normals from it, so the folds live in the
        # normal map only (and the lower levels do not shimmer with them).
        self.shape = shape
        shading.smooth(dense, angle=math.pi)
        if shape is not None:
            shading.smooth(shape, angle=math.pi)

    def low(self):
        source = self.shape if self.shape is not None else self.dense
        if self.ready is not None:
            low = transfer_normals(self.ready, source)
        else:
            low = scene.duplicate(source, self.dense.name + '_low')
            F.clear_vertex_colors(low)
            F.decimate(low, self.triangles)
            snap_borders(low, source)
            if self.seams is not None:
                self.seams(low)
            low = transfer_normals(low, source)
        if self.shape is not None:
            # Not a bake source: it must not shade or occlude the bake.
            bpy.data.objects.remove(self.shape, do_unlink=True)
            self.shape = None
        return low


def hull_tree(points):
    """A BVH tree of the convex hull of `points`."""
    bm = bmesh.new()
    for point in points:
        bm.verts.new(tuple(point))
    bmesh.ops.convex_hull(bm, input=list(bm.verts))
    bmesh.ops.delete(bm, geom=[vertex for vertex in bm.verts if not vertex.link_faces], context='VERTS')
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    return tree


def drape(obj, figure, trunk=0.85, sleeves=0.9, reach=0.05, front=None):
    """Cloth hangs: a garment spans the hollows between the forms it rests on (the waist under
    the chest and the shoulder blades, the spine's groove, the inside of the elbow) instead of
    following every muscle. Each vertex moves towards the convex hull of its own region: the
    trunk, or an arm (straight in the rest pose, so its hull is a tapered sleeve). The arms'
    vertices are mirrored onto the right side so one hull serves both. The trunk's hull is
    made of both halves: a hull of one half has a flat face on the centre plane and leaves the
    hollow between the breasts (and the spine's groove) in the cloth. `front` (0..1) raises the
    weight in front of the chest, so that a blouse spans the bust as one surface."""
    s, j = figure.scale, figure.joints
    points = F.positions(obj)
    shoulder, wrist = j['upper_arm_r'], j['hand_r']
    folded = np.stack([np.abs(points[:, 0]), points[:, 1], points[:, 2]], axis=1)
    axis = F.unit(wrist - shoulder)
    along = (folded - shoulder) @ axis
    distance, _t = F.polyline_distance(folded, [shoulder, wrist])
    arm = (along > 0.0) & (distance < 0.11 * s)
    body = ~arm & (folded[:, 2] < shoulder[2] + 0.02 * s)
    targets = folded.copy()
    arm_tree = hull_tree(folded[arm & (along > 0.03 * s)][::2])
    half = folded[body & (folded[:, 0] < shoulder[0])][::2]
    body_tree = hull_tree(np.concatenate([half, half * np.array([-1.0, 1.0, 1.0])]))
    weight = np.zeros(len(points))
    weight[arm] = sleeves * F.smoothstep(0.02 * s, 0.11 * s, along[arm])
    weight[body] = (trunk * F.smoothstep(shoulder[2] - 0.03 * s, shoulder[2] - 0.13 * s, folded[body, 2])
                    * F.smoothstep(shoulder[0] + 0.01 * s, shoulder[0] - 0.05 * s, folded[body, 0]))
    if front is not None:
        chest = figure.reference['chest_level'] * s
        band = (F.smoothstep(0.0, 0.05 * s, folded[body, 1]) * F.smoothstep(0.20 * s, 0.10 * s,
                np.abs(folded[body, 2] - chest + 0.02 * s)) * F.smoothstep(0.17 * s, 0.11 * s, folded[body, 0]))
        weight[body] = np.maximum(weight[body], front * band)
    for index in np.nonzero(weight > 0.001)[0]:
        tree = arm_tree if arm[index] else body_tree
        location, _normal, _face, _distance = tree.find_nearest(Vector(folded[index]))
        if location is not None:
            targets[index] = location
    move = (targets - folded) * weight[:, None]
    length = np.linalg.norm(move, axis=1, keepdims=True)
    move *= np.minimum(1.0, reach * s / np.maximum(length, 1e-9))
    move[:, 0] *= np.where(points[:, 0] < 0.0, -1.0, 1.0)
    F.set_positions(obj, points + move)
    F.relax(obj, steps=8, strength=0.5, weight=np.clip(weight * 2.0, 0.0, 1.0))
    return obj


def cut_seam(obj, positive, allowed=None):
    """Marks a UV seam along every edge whose two faces differ in `positive` (a boolean per
    face: which side of a cut they lie on) where both faces are `allowed`."""
    positive = np.asarray(positive, dtype=bool)
    allowed = np.ones(len(positive), dtype=bool) if allowed is None else np.asarray(allowed, dtype=bool)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for edge in bm.edges:
        if len(edge.link_faces) == 2:
            a, b = edge.link_faces[0].index, edge.link_faces[1].index
            if positive[a] != positive[b] and allowed[a] and allowed[b]:
                edge.seam = True
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def gather(obj, weight, onto, lift=0.004):
    """Draws a garment in onto what it closes around (a sleeve onto its cuff, a trouser leg onto
    the boot): each vertex moves by its weight towards the nearest point of `onto` (a BVH
    tree), staying `lift` above it."""
    points = F.positions(obj)
    for index in np.nonzero(weight > 0.001)[0]:
        here = Vector(points[index])
        location, normal, _face, _distance = onto.find_nearest(here)
        if location is None:
            continue
        if (here - location).dot(normal) < 0.0:
            normal = -normal
        points[index] += (np.array(location + normal * lift) - points[index]) * weight[index]
    F.set_positions(obj, points)
    return obj


def blank_mask(obj, red=None):
    colors = np.zeros((len(obj.data.vertices), 3))
    if red is not None:
        colors[:, 0] = red
    F.set_vertex_colors(obj, colors)
    return obj


def band(name, rings, material):
    """An open band lofted through closed rings of points (a rib cuff, a collar): the first
    ring is the hidden end under the garment, the last ones turn in over the edge. The seam
    runs along the first point of every ring."""
    rings = np.asarray(rings, dtype=np.float64)
    count, around, _ = rings.shape
    faces = [(i * around + k, i * around + (k + 1) % around, (i + 1) * around + (k + 1) % around,
              (i + 1) * around + k) for i in range(count - 1) for k in range(around)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(rings.reshape(-1, 3).tolist(), [], faces)
    mesh.update()
    obj = scene.new_object(name, mesh)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for edge in bm.edges:
        if edge.verts[0].index % around == 0 and edge.verts[1].index % around == 0:
            edge.seam = True
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material)
    mesh.update()
    return obj


def band_piece(name, rings, material, count, ribs):
    """A rib knit band as a wardrobe piece: `rings(count, ribs, depth)` gives its rings."""
    dense = blank_mask(band(name, rings(count * 16, ribs, 0.0015), material))
    low = band(name + '_low', rings(count, 0, 0.0), material)
    return Piece(dense, low=low), F.tree(low)


def ellipse(centre, u, v, ru, rv, count, ribs=0, depth=0.0):
    angles = np.arange(count) * (math.tau / count)
    wave = 1.0 + (depth / max(min(ru, rv), 1e-6)) * np.cos(angles * ribs) if ribs else 1.0
    return (np.asarray(centre, dtype=np.float64) + np.outer(np.cos(angles) * ru * wave, u)
            + np.outer(np.sin(angles) * rv * wave, v))


def trunk_ring(figure, z, ease, count):
    """The outline of the trunk at the height z (reference metres), swollen by `ease`."""
    loops = np.array(figure.trunk_rings(ease, count))
    heights = loops[:, 0, 2]
    target = z * figure.scale
    index = int(np.clip(np.searchsorted(heights, target) - 1, 0, len(heights) - 2))
    t = (target - heights[index]) / (heights[index + 1] - heights[index])
    return loops[index] + (loops[index + 1] - loops[index]) * t


# ---------------------------------------------------------------------------------------------
# The collar line: where clothes end and the neck shows
# ---------------------------------------------------------------------------------------------

def collar_frame(figure):
    """The centre and the two radii of the collar's outline around the base of the neck."""
    neck = figure.joints['neck']
    centre = np.array([0.0, neck[1] + 0.004 * figure.scale, neck[2]])
    return centre, 0.088 * figure.girth, 0.078 * figure.girth


def collar_reach(figure, points):
    """How far out each point lies from the neck's axis in units of the collar outline
    (1 = on it), and its angle around the neck."""
    centre, rx, ry = collar_frame(figure)
    x, y = points[:, 0] / rx, (points[:, 1] - centre[1]) / ry
    return np.hypot(x, y), np.arctan2(y, x)


def collar_lift(figure, angles):
    """The collar rides up the slope of the shoulders at the sides and dips at the throat."""
    return figure.scale * (0.024 * np.cos(angles) ** 2 - 0.012 * np.maximum(np.sin(angles), 0.0))


HAIRLINE_Y = (-0.120, -0.046, -0.030, 0.012, 0.017, 0.030, 0.038, 0.052, 0.068, 0.100)
HAIRLINE_Z = (0.072, 0.072, 0.152, 0.152, 0.116, 0.116, 0.156, 0.180, 0.195, 0.197)


def hairline(local):
    """The height of the hairline (head space) at each point: the nape, up behind and over the
    ear, the sideburn in front of it, the temple, the forehead."""
    return np.interp(local[:, 1], HAIRLINE_Y, HAIRLINE_Z)


def hidden_skin(figure, points, hair=True):
    """True for the skin vertices no one can see on a dressed figure: everything but the head,
    the neck inside the collar and the hands; and the scalp well under the hair."""
    s, j = figure.scale, figure.joints
    centre, _rx, _ry = collar_frame(figure)
    reach, _angle = collar_reach(figure, points)
    keep = points[:, 2] > figure.chin - 0.004
    keep |= (reach < 0.88) & (points[:, 2] > centre[2] - 0.024 * s)
    for sign in (1.0, -1.0):
        m = np.array([sign, 1.0, 1.0])
        wrist = j['hand_r'] * m
        along = (points - wrist) @ (figure.hand_along * m)
        keep |= (along > -0.036 * s) & (np.linalg.norm(points - wrist, axis=1) < 0.26 * s)
    if hair:
        local = figure.to_head(points)
        keep &= ~(local[:, 2] - hairline(local) > 0.034)
    return ~keep


def hairline_shadow(figure, points, masks):
    """Short hair grows out of the skin: the scalp darkens over about 1.5 cm below the hairline
    (the brows channel of the skin's mask), so the hair's edge is soft and not a cap's rim."""
    local = figure.to_head(points)
    above = local[:, 2] - hairline(local)
    # A barber's fade at the nape and behind the ears: the stubble thins out over about 3.5 cm
    # (in the aim camera the bowed head shows the nape, where a 1.5 cm edge read as a cap's
    # rim); the forehead and the temples keep a short, crisp 1.5 cm edge. The stubble is
    # stippled (per dense vertex, about 2.4 mm) so it is a grain and not a smudge.
    reach = np.interp(local[:, 1], (-0.12, -0.02, 0.02, 0.05), (0.036, 0.030, 0.015, 0.013))
    ramp = np.clip((above + reach) / (reach + 0.003), 0.0, 1.0)
    grain = np.random.default_rng(5).uniform(0.70, 1.0, len(points))
    shadow = 0.82 * ramp ** 1.6 * np.where(ramp < 0.95, grain, 1.0) * (points[:, 2] > figure.chin + 0.02)
    masks = np.array(masks, dtype=np.float64)
    masks[:, 1] = np.maximum(masks[:, 1], shadow)
    return masks


def skin_seams(figure, low):
    """Seams of the skin's game mesh: up the back of the neck (under the hair), and around
    each hand between its back and its palm."""
    centres, normals = F.face_centres(low), F.face_normals(low)
    local = figure.to_head(centres)
    cut_seam(low, centres[:, 0] > 0.0, (local[:, 1] < -0.02) & (centres[:, 2] > figure.chin - 0.10))
    for sign in (1.0, -1.0):
        m = np.array([sign, 1.0, 1.0])
        near = np.linalg.norm(centres - figure.joints['hand_r'] * m, axis=1) < 0.26 * figure.scale
        cut_seam(low, normals @ (figure.hand_palm * m) > 0.0, near)
    return low


# ---------------------------------------------------------------------------------------------
# Pieces
# ---------------------------------------------------------------------------------------------

def boots(figure, color, top=0.205, triangles=520):
    """Ankle boots: the foot's forms with a toe box, a shaft and a welted sole. With a lower
    `top` (reference metres) the same last makes low shoes, sneakers or flats."""
    s, j = figure.scale, figure.joints
    soup = figure.block(('feet',), ease=0.007)
    side = F.Soup()
    ankle, ball, tip = j['foot_r'], j['toe_r'], j['toe_tip_r']
    side.ellipsoid([ball[0] + 0.004, ball[1] + 0.034 * s, 0.036 * s], np.array([0.050, 0.060, 0.033]) * s)
    side.tube([ankle + np.array([0.0, 0.004, -0.035]) * s, ankle + np.array([0.0, 0.0, 0.05]) * s,
               ankle + np.array([0.0, -0.004, 0.14]) * s],
              np.array([(0.045, 0.052), (0.044, 0.050), (0.047, 0.053)]) * s, side=(1.0, 0.0, 0.0), cap=0.3)
    side.tube([[ankle[0] + 0.001, ankle[1] - 0.058 * s, 0.012 * s],
               [ankle[0] + 0.004, ankle[1] + 0.05 * s, 0.012 * s],
               [ball[0] + 0.005, tip[1] - 0.03 * s, 0.012 * s]],
              np.array([(0.040, 0.0135), (0.046, 0.0135), (0.050, 0.0135)]) * s, side=(1.0, 0.0, 0.0), cap=0.6)
    G.absorb(soup, side, mirror=True)
    obj = soup.union('boots', voxel=0.004, relax_steps=5, strength=0.5)
    points = F.positions(obj)
    points[:, 2] = np.maximum(points[:, 2], 0.0)
    F.set_positions(obj, points)
    F.bisect(obj, (0.0, 0.0, top * s), (0.0, 0.0, -1.0))
    scene.set_material(obj, cloth('paint_shoes', color, roughness=0.55, grain=600.0, relief=0.0005, seed=5))
    shape = _fabric.fold_garment(obj, figure, 'boots', seed=5,
                                 red=lambda p: F.smoothstep(0.021 * s, 0.016 * s, p[:, 2]))

    def seams(low):
        centres = F.face_centres(low)
        middle = np.where(centres[:, 0] > 0.0, ankle[0], -ankle[0])
        cut_seam(low, centres[:, 0] > middle, (centres[:, 1] < ankle[1] - 0.01) & (centres[:, 2] > 0.012 * s))
        cut_seam(low, centres[:, 2] > 0.004 * s)

    return Piece(obj, triangles, seams, shape=shape)


def cargo_trousers(figure, color, boots_tree):
    """Straight cargo trousers with a pocket on each thigh, resting on the boots."""
    s, g, j = figure.scale, figure.girth, figure.joints
    soup = figure.block(('torso',), ease=0.008)
    side = F.Soup()
    hip, knee, ankle = j['thigh_r'], j['shin_r'], j['foot_r']
    out = np.array([0.006 * g, 0.0, 0.0])
    loose = g * (1.0 + 0.5 * (figure.build['limb'] - 1.0))
    stations = [(hip + out + np.array([0.0, 0.0, 0.03 * s]), (0.089, 0.100)),
                (F.lerp(hip, knee, 0.25) + out, (0.089, 0.098)), (F.lerp(hip, knee, 0.60) + out, (0.080, 0.086)),
                (knee + out, (0.071, 0.075)), (F.lerp(knee, ankle, 0.45) + out * 0.5, (0.066, 0.070)),
                (F.lerp(knee, ankle, 0.85), (0.061, 0.066)),
                (ankle + np.array([0.0, 0.006 * s, -0.03 * s]), (0.060, 0.066))]
    side.tube([point for point, _ in stations], np.array([pair for _, pair in stations]) * loose,
              side=(1.0, 0.0, 0.0), cap=0.3)
    side.ellipsoid(F.lerp(hip, knee, 0.60) + np.array([0.082 * loose, -0.006, 0.0]),
                   np.array([0.014, 0.060, 0.078]) * g)
    G.absorb(soup, side, mirror=True)
    obj = soup.union('trousers', voxel=0.005, relax_steps=8, strength=0.5)
    F.bisect(obj, (0.0, 0.0, 1.035 * s), (0.0, 0.0, -1.0))
    F.bisect(obj, (0.0, 0.0, 0.105 * s), (0.0, 0.0, 1.0))
    F.drop_small_islands(obj)
    gather(obj, F.smoothstep(0.040, 0.0, F.positions(obj)[:, 2] - 0.105 * s), boots_tree)
    scene.set_material(obj, cloth('paint_bottom', color, roughness=0.88, grain=1200.0, relief=0.0006, seed=6))
    shape = _fabric.fold_garment(obj, figure, 'trousers', seed=6, cargo=True)
    crotch = 0.845 * s
    centre = hip[0] + out[0]

    def seams(low):
        centres = F.face_centres(low)
        cut_seam(low, centres[:, 1] > hip[1], (np.abs(centres[:, 0]) < centre) & (centres[:, 2] < crotch + 0.02))
        cut_seam(low, centres[:, 0] > 0.0, (centres[:, 1] < hip[1]) & (centres[:, 2] > crotch - 0.03))

    return Piece(obj, 1100, seams, shape=shape)


def bomber(figure, color, trim):
    """A bomber jacket zipped to the neck: a full nylon shell gathered into a rib knit collar,
    cuffs and waistband. Returns its pieces (the shell and the four bands)."""
    s, g, j = figure.scale, figure.girth, figure.joints
    rib = cloth('paint_top', trim, roughness=0.9, grain=700.0, relief=0.0006, seed=4)
    # A cotton-nylon shell (0.55 all over read as plastic): matte in the folds, a nylon sheen on
    # the crests and open panels (0.74 -> about 0.56), the hollows of the big folds shaded
    # deeper (a flat saturated yellow at 3 m in the engine).
    shell = cloth('paint_jacket', color, roughness=0.76, grain=1500.0, relief=0.0006, seed=3,
                  folds=0.85, sheen=0.20)
    pieces, onto = [], []

    # Modest volume: a bomber follows the body (the slope of the shoulders from the neck, the
    # chest, the arms) and is only a little blousy over the waistband and the cuffs. (With a
    # 24 mm ease, a long relax and the sleeves draped onto the arm's hull it read as a padded box
    # with sleeves as wide as the trouser legs.)
    obj = figure.block(('torso', 'arms'), ease=0.013).union('jacket', voxel=0.006, relax_steps=18, strength=0.5)
    hem = 0.975 * s
    F.bisect(obj, (0.0, 0.0, hem), (0.0, 0.0, 1.0))
    # It hangs from the chest and spans the waist and the spine's groove; the sleeves only a little.
    drape(obj, figure, trunk=0.8, sleeves=0.30)
    thick = g * figure.build['limb'] * figure.reference['arm']
    wrist_radius = np.array([0.0295, 0.0215]) * thick
    for sign in (1.0, -1.0):
        m = np.array([sign, 1.0, 1.0])
        wrist, d = j['hand_r'] * m, figure.hand_along * m
        u, v = figure.hand_thumb * m, figure.hand_palm * m
        cut = wrist - d * 0.050 * s
        F.bisect(obj, tuple(cut), tuple(-d))

        def cuff(count, ribs=0, depth=0.0, wrist=wrist, d=d, u=u, v=v):
            rows = ((-0.070, 0.007, True), (-0.014, 0.008, True), (-0.018, 0.003, False), (-0.034, -0.003, False))
            return [ellipse(wrist + d * t * s, u, v, wrist_radius[0] + grow, wrist_radius[1] + grow, count,
                            ribs if ribbed else 0, depth) for t, grow, ribbed in rows]

        # The cuffs are knit in the shell's colour (paint_jacket; their ribs are in the normal
        # map): a dark rib cuff read as a black band cutting the arm at the wrist (owner 11:08).
        piece, tree = band_piece('cuff_r' if sign > 0 else 'cuff_l', cuff, shell, 14, 20)
        pieces.append(piece)
        points = F.positions(obj)
        depth = (points - cut) @ -d
        near = np.linalg.norm(points - wrist, axis=1) < 0.20 * s
        gather(obj, F.smoothstep(0.075 * s, 0.0, depth) * near, tree)

    def waistband(count, ribs=0, depth=0.0):
        rows = ((0.995, 0.019, True), (0.925, 0.022, True), (0.929, 0.013, False), (0.960, -0.002, False))
        rings = []
        for z, ease, ribbed in rows:
            loop = trunk_ring(figure, z, ease, count)
            middle = loop.mean(axis=0)
            loop[:, 1] = np.where(loop[:, 1] < middle[1], middle[1] + (loop[:, 1] - middle[1]) * 1.10, loop[:, 1])
            if ribs and ribbed:
                wave = 1.0 + depth / 0.15 * np.cos(np.arange(count) * (math.tau / count) * ribs)
                loop[:, :2] = middle[:2] + (loop[:, :2] - middle[:2]) * wave[:, None]
            rings.append(loop)
        return rings

    piece, tree = band_piece('waistband', waistband, rib, 32, 88)
    pieces.append(piece)
    gather(obj, F.smoothstep(0.08 * s, 0.0, F.positions(obj)[:, 2] - hem), tree)

    centre, rx, ry = collar_frame(figure)

    def collar(count, ribs=0, depth=0.0):
        angles = np.arange(count) * (math.tau / count)
        lift = collar_lift(figure, angles)
        # A rib collar about 30 mm at the throat that stands up to about 45 mm at the back of the
        # neck, leaning in a little against the nape (the aim camera looks down onto it: a 25 mm
        # band there read as a black cord lying on the shoulders), so the neck still shows
        # between it and the jaw in front.
        back = np.maximum(-np.sin(angles), 0.0) ** 1.5
        rows = ((1.06, -0.014, True, 0.0), (0.98, 0.016, True, 0.016), (0.92, 0.014, False, 0.015),
                (0.80, 0.002, False, 0.0))
        rings = []
        for scale, z, ribbed, rise in rows:
            wave = 1.0 + depth / 0.08 * np.cos(angles * ribs) if (ribs and ribbed) else 1.0
            lean = 1.0 - 0.05 * back * (rise > 0.0)
            rings.append(np.stack([np.cos(angles) * rx * scale * wave * lean,
                                   centre[1] + np.sin(angles) * ry * scale * wave * lean,
                                   centre[2] + (z + rise * back) * s + lift], axis=1))
        return rings

    piece, tree = band_piece('collar', collar, rib, 24, 44)
    pieces.append(piece)
    points = F.positions(obj)
    reach, _angle = collar_reach(figure, points)
    F.delete_vertices(obj, (reach < 1.0) & (points[:, 2] > centre[2] - 0.03 * s))
    points = F.positions(obj)
    reach, _angle = collar_reach(figure, points)
    gather(obj, F.smoothstep(1.75, 1.05, reach) * F.smoothstep(centre[2] - 0.14 * s, centre[2] - 0.08 * s, points[:, 2]),
           tree)
    # The shell ends in a clean line on the collar: what rose above it is pressed down onto it.
    points = F.positions(obj)
    reach, angle = collar_reach(figure, points)
    line = centre[2] + 0.006 * s + collar_lift(figure, angle)
    high = (reach < 1.3) & (points[:, 2] > line)
    points[high, 2] = line[high]
    F.set_positions(obj, points)
    F.drop_small_islands(obj)

    # The zip: a groove down the front, dark in the mask.
    points = F.positions(obj)
    zip_line = F.falloff(np.abs(points[:, 0]) / 0.006) * (points[:, 1] > 0.0)
    points[:, 1] -= 0.0025 * zip_line
    F.set_positions(obj, points)
    # A cotton-nylon shell (0.55 all over read as plastic): matte in the folds, a nylon sheen on
    # the crests and open panels (0.74 -> about 0.56), the hollows of the big folds shaded
    # deeper (a flat saturated yellow at 3 m in the engine). Folds, seams and wear are in the
    # dense source only (_fabric), so they are baked; broad diagonal tension folds cross the back.
    scene.set_material(obj, shell)
    shape = _fabric.fold_garment(obj, figure, 'jacket', hem=hem, seed=3, diagonal=0.0032,
                                 red=lambda p: F.falloff(np.abs(p[:, 0]) / 0.004) * (p[:, 1] > 0.0))
    shoulder = j['upper_arm_r']
    pit = shoulder[2] - 0.075 * s

    def seams(low):
        centres = F.face_centres(low)
        across = np.abs(centres[:, 0])
        cut_seam(low, centres[:, 0] > 0.0, centres[:, 1] > shoulder[1])
        relative = np.stack([across, centres[:, 1], centres[:, 2]], axis=1) - shoulder
        under = np.where(across < shoulder[0], (centres[:, 2] < pit) & (across > 0.07),
                         relative @ figure.arm_up < 0.0)
        cut_seam(low, centres[:, 1] > shoulder[1], under)

    pieces.insert(0, Piece(obj, 2000, seams, shape=shape))
    return pieces


def hair(figure, style, color):
    """Hair as a shell over the skull. 'afro_short': thick, tightly curled, cut close at the
    sides and the nape, where it fades into the scalp along the hairline."""
    thickness = 0.011
    soup, side = F.Soup(), F.Soup()
    figure._skull(soup, side, thickness)
    G.absorb(soup, side, mirror=True)
    obj = soup.union('hair', voxel=0.004, relax_steps=6, strength=0.5)
    points, normals = F.positions(obj), F.normals(obj)
    local = figure.to_head(points)
    above = local[:, 2] - hairline(local)
    grown = F.smoothstep(0.0, 0.050, above)
    # Full on top and towards the back of the crown, thinner over the forehead: no visor.
    crown = F.smoothstep(0.150, 0.225, local[:, 2]) * (1.0 - 0.6 * F.smoothstep(0.02, 0.09, local[:, 1]))
    # Below the hairline the shell dives a few millimetres under the scalp, so the visible
    # hairline is where two smooth surfaces cross and not a ragged mesh border. A fade: the
    # sides and the nape lie a few millimetres over the scalp, the crown is full; not a helmet
    # of even depth. hairline_shadow() darkens the scalp below the hairline to match.
    sunk = F.smoothstep(0.004, -0.008, above) * 0.0045
    points += normals * (grown * (crown * 0.008 - (1.0 - crown) * 0.0070)
                         - (1.0 - grown) * (thickness - 0.0015) - sunk)[:, None]
    F.set_positions(obj, points)
    F.delete_vertices(obj, above < -0.014)
    F.drop_small_islands(obj)
    blank_mask(obj)
    scene.set_material(obj, hair_material(color, seed=7))
    return Piece(obj, 800)


def dress(figure, spec):
    """The wardrobe pieces of the person described by `spec` (see _person.build). Outfits other
    than Dez's bomber come from _outfits."""
    outfit = spec.get('outfit', {})
    if outfit['top']['piece'] != 'bomber':
        import _outfits
        return _outfits.dress(figure, spec)
    pieces = []
    footwear = boots(figure, linear(outfit['shoes']['color']))
    pieces.append(footwear)
    pieces.append(cargo_trousers(figure, linear(outfit['bottom']['color']), F.tree(footwear.dense)))
    pieces += bomber(figure, linear(outfit['top']['color']), linear(outfit['top']['trim']))
    if spec.get('hair'):
        pieces.append(hair(figure, spec['hair']['style'], linear(spec['hair']['color'])))
    return pieces
