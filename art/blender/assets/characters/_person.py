"""A person, assembled: figure -> dense sculpted skin -> light game mesh -> skeleton, weights, anchors.

build(a, spec) is what every character script calls. The spec is a plain dictionary:

    figure   keyword arguments of _figure.Figure (height, sex, build, face={...}, ...)
    skin     the default skin tone (linear RGB); the game recolours paint_skin per person
    eyes     the iris colour (linear RGB)

What it makes (the contract with the game, see the character brief):

    rig      the shared skeleton, naming.SKELETON_BONES, bones running from joint to joint
    lod0     one skinned mesh (lod1 and lod2 are decimated from it after the bake)
    anchors  anchor_hand_r, anchor_hand_l (in the palm; forward = along the forearm, where a
             pistol's barrel points; up = the thumb side), anchor_head (top of the head),
             anchor_back (between the shoulder blades, pointing backwards), anchor_hip_r (the
             holster on the right hip, pointing down)
    materials  paint_skin (lips, brows and beard shadow are darker shades inside it, so they
             follow the complexion) and atlas (the eyes)

The dense skin (a few hundred thousand vertices, the voxel union of the figure's forms) is only
the surface the textures are baked from. The game mesh is its decimation, with most triangles
kept on the face and the hands. Weights come from Blender's bone-heat solution on a coarse
closed body without fingers, carried over to the game mesh by nearest points and smoothed.

A dressed person (spec['outfit'], spec['hair']) gets its clothes, shoes and hair from
_wardrobe.dress as their own pieces with paint_top, paint_bottom, paint_shoes, paint_hair and
paint_jacket. Every game piece takes the custom normals of its dense source (smooth shading
without facets; the normal map then carries only fine relief).
"""
import math

import bpy
import numpy as np
from mathutils import kdtree

import _figure as G
import _forms as F
import _wardrobe as W
from lib import materials as M
from lib import rig, scene, shading, uv

LOD0_TRIANGLES = 8200                # an undressed body
SKIN_TRIANGLES = 3400                # head, neck and hands of a dressed person
LOD_RATIOS = (0.30, 0.088)           # of a dressed lod0 of about 8,000: 2,400 and 700 triangles
LOD_DISTANCES = (12.0, 30.0)

EYE_WHITE = (0.46, 0.44, 0.41)      # a sclera in the shade of the lids: brighter reads as a stare
IRIS_BROWN = (0.085, 0.045, 0.022)


# ---------------------------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------------------------

def skin_material(tone, seed=0, name='paint_skin', beard=0.22):
    """Skin whose complexion is the tintable paint colour. The vertex colours of the dense
    skin ('mask': red lips, green brows, blue beard shadow) darken it where the face needs it."""
    beard_amount = beard
    graph = M.Graph(name, seed)
    attribute = graph.node('ShaderNodeVertexColor', layer_name='mask')
    split = graph.node('ShaderNodeSeparateColor')
    graph.feed(split.inputs['Color'], attribute.outputs['Color'])
    lips, brows, beard = split.outputs['Red'], split.outputs['Green'], split.outputs['Blue']
    # The bake swaps the paint colour for white, so a hue or saturation shift of it is lost:
    # tone variation is MULTIPLIED in as colours, which then follow any complexion the game
    # tints in. Blood shows through thin skin (nose tip, ears, knuckles, lips' rim: the convex
    # edges) and in blotches (4 cm); an olive-yellow cast drifts over larger areas (11 cm);
    # freckles and small spots (6 mm) are a shade darker.
    blotch = graph.noise(scale=9.0, detail=4.0, roughness=0.55)
    flush = graph.noise(scale=26.0, detail=3.0, roughness=0.6)
    spots = graph.noise(scale=170.0, detail=2.0, roughness=0.5)
    thin = graph.remap(graph.edges(radius=0.006), 0.05, 0.7)
    base = graph.hsv(graph.paint_color(tone), value=graph.remap(blotch, 0.2, 0.8, 0.93, 1.05))
    base = graph.mix(graph.remap(blotch, 0.35, 0.75, 0.0, 0.55), base, (1.0, 0.95, 0.80), blend='MULTIPLY')
    redness = graph.maximum(graph.mul(thin, 0.75), graph.remap(flush, 0.52, 0.80, 0.0, 0.55))
    base = graph.mix(redness, base, (1.0, 0.80, 0.76), blend='MULTIPLY')
    base = graph.mix(graph.remap(spots, 0.62, 0.78, 0.0, 0.35), base, (0.82, 0.74, 0.70), blend='MULTIPLY')
    base = graph.mix(graph.mul(lips, 0.85), base, (0.80, 0.50, 0.50), blend='MULTIPLY')
    base = graph.mix(graph.mul(brows, 0.92), base, (0.16, 0.12, 0.10), blend='MULTIPLY')
    shadow = (0.50, 0.52, 0.56) if beard_amount < 0.4 else (0.20, 0.18, 0.17)
    base = graph.mix(graph.mul(beard, beard_amount), base, shadow, blend='MULTIPLY')
    # Pore-scale relief and roughness at what the atlas holds (about 1 mm a texel on a lead's
    # face): pits of about 2.5 mm cells, a finer stipple (1 mm) and a tight crinkle; the skin
    # is glossier on the oily T-zone-like convex areas and in the pits' rims, matte in the pits.
    pores = graph.voronoi(scale=380.0, feature='F1')
    stipple = graph.voronoi(scale=950.0, feature='F1')
    crinkle = graph.noise(scale=160.0, detail=4.0, roughness=0.7, distortion=0.4)
    rough = graph.add(graph.remap(pores, 0.0, 0.5, 0.62, 0.46), graph.remap(crinkle, 0.25, 0.75, -0.04, 0.05))
    rough = graph.sub(rough, graph.mul(thin, 0.07))
    coat = M.Coat(graph, base, roughness=rough,
                  height=graph.add(graph.add(graph.mul(pores, 0.55), graph.mul(stipple, 0.25)),
                                   graph.mul(crinkle, 0.35)))
    coat.tint(graph.mul(graph.cavities(distance=0.015), 0.7), (0.30, 0.16, 0.12))
    return coat.finish(bump_strength=0.32, bump_distance=0.0005)


def flat_material(name, color, roughness, seed=0):
    graph = M.Graph(name, seed)
    return M.Coat(graph, color, roughness=roughness).finish(bump_strength=0.0)


# ---------------------------------------------------------------------------------------------
# Eyes: almond patches on the lid surface
# ---------------------------------------------------------------------------------------------

def eye_patches(figure, iris=IRIS_BROWN):
    """The visible part of both eyes as thin patches lying on the closed lid surface of the
    skin: the white as an almond between the lids, the iris and the pupil as discs on it.
    They are their own geometry so that the eyes stay sharp and are not tinted with the skin."""
    face = figure.face
    size, tilt = face['eye_size'], math.tan(math.radians(face['eye_tilt']))
    half = G.EYE_HALF * size
    vertices, faces, slots = [], [], []

    def lids(u):
        span = max(1.0 - ((u + 0.0005) / half) ** 2, 0.0)
        return (G.EYE_LOWER * size * span ** 0.60 + u * tilt, G.EYE_UPPER * size * span ** 0.75 + u * tilt)

    def quad(a, b, c, d, sign, slot):
        faces.append((a, d, c, b) if sign > 0 else (a, b, c, d))
        slots.append(slot)

    for sign in (1.0, -1.0):
        centre_x = G.EYE[0] * face['eye_spacing'] * sign

        def on_lid(u, v, lift):
            radius = G.LID_RADIUS + lift
            depth = math.sqrt(max(radius * radius - u * u - v * v, 1e-8))
            return figure.head_point(centre_x + u * sign, G.EYE[1] + depth, G.EYE[2] + v)

        columns = 9
        first = len(vertices)
        for column in range(columns):
            u = -0.0005 + half * 0.985 * math.cos(math.pi * (1.0 - column / (columns - 1)))
            lower, upper = lids(u)
            for row in range(3):
                vertices.append(on_lid(u, lower + (upper - lower) * row / 2.0, 0.0008))
        for column in range(columns - 1):
            for row in range(2):
                a = first + column * 3 + row
                quad(a, a + 3, a + 4, a + 1, sign, 0)
        # The iris and the pupil as discs, cut by the lids (the upper lid covers the top of the
        # iris, the lower one touches it), so the eye looks out calmly.
        for slot, radius, lift, around in ((1, G.IRIS_RADIUS * size, 0.0011, 14), (2, 0.0021 * size, 0.0014, 8)):
            centre = len(vertices)
            vertices.append(on_lid(0.0, 0.0004, lift))
            for step in range(around):
                angle = math.tau * step / around
                u = radius * math.cos(angle)
                lower, upper = lids(u)
                v = min(max(0.0004 + radius * math.sin(angle), lower + 0.0002), upper - 0.0002)
                vertices.append(on_lid(u, v, lift))
            for step in range(around):
                a, b = centre + 1 + step, centre + 1 + (step + 1) % around
                faces.append((centre, b, a) if sign > 0 else (centre, a, b))
                slots.append(slot)
    mesh = bpy.data.meshes.new('eyes')
    mesh.from_pydata([tuple(vertex) for vertex in vertices], [], faces)
    mesh.update()
    obj = scene.new_object('eyes', mesh)
    for material in (flat_material('eye_white', EYE_WHITE, 0.30),
                     flat_material('eye_iris', iris, 0.25),
                     flat_material('eye_pupil', (0.006, 0.006, 0.007), 0.20)):
        mesh.materials.append(material)
    mesh.polygons.foreach_set('material_index', slots)
    mesh.update()
    return obj


# ---------------------------------------------------------------------------------------------
# Skeleton, weights, anchors
# ---------------------------------------------------------------------------------------------

def bones(figure):
    """The shared skeleton for this figure as (name, head, tail, parent) rows, parents first,
    in the order of naming.SKELETON_BONES. Every bone runs from its joint to the next one."""
    j = figure.joints
    rows = [('root', (0.0, 0.0, 0.0), (0.0, 0.0, 0.12 * figure.scale), None),
            ('hips', j['hips'], j['spine'], 'root'), ('spine', j['spine'], j['chest'], 'hips'),
            ('chest', j['chest'], j['neck'], 'spine'), ('neck', j['neck'], j['head'], 'chest'),
            ('head', j['head'], j['head_top'], 'neck')]
    for side in ('l', 'r'):
        rows += [(f'shoulder_{side}', j[f'shoulder_{side}'], j[f'upper_arm_{side}'], 'chest'),
                 (f'upper_arm_{side}', j[f'upper_arm_{side}'], j[f'forearm_{side}'], f'shoulder_{side}'),
                 (f'forearm_{side}', j[f'forearm_{side}'], j[f'hand_{side}'], f'upper_arm_{side}'),
                 (f'hand_{side}', j[f'hand_{side}'], j[f'hand_end_{side}'], f'forearm_{side}')]
    for side in ('l', 'r'):
        rows += [(f'thigh_{side}', j[f'thigh_{side}'], j[f'shin_{side}'], 'hips'),
                 (f'shin_{side}', j[f'shin_{side}'], j[f'foot_{side}'], f'thigh_{side}'),
                 (f'foot_{side}', j[f'foot_{side}'], j[f'toe_{side}'], f'shin_{side}'),
                 (f'toe_{side}', j[f'toe_{side}'], j[f'toe_tip_{side}'], f'foot_{side}')]
    return [(name, tuple(float(v) for v in head), tuple(float(v) for v in tail), parent)
            for name, head, tail, parent in rows]


def nearest_bone(figure, names, points):
    """Rigid weights (each point to the bone it is nearest to): the fallback where the
    bone-heat solution gave nothing."""
    best = np.full(len(points), np.inf)
    choice = np.zeros(len(points), dtype=np.int64)
    for name, head, tail, _parent in bones(figure):
        if name == 'root':
            continue
        distance, _along = F.polyline_distance(points, [head, tail])
        closer = distance < best
        best = np.where(closer, distance, best)
        choice = np.where(closer, names.index(name), choice)
    weights = np.zeros((len(points), len(names)))
    weights[np.arange(len(points)), choice] = 1.0
    return weights


def body_weights(figure, skeleton, targets, pairs, smooth_steps=2):
    """Bone weights for the points `targets` (with the edges `pairs` between them): bone heat on
    a coarse closed body, carried over by nearest points, smoothed, cut to four bones each.
    Returns (bone names, array of len(targets) x bones)."""
    coarse = figure.block().union('weight_body', voxel=0.008)
    figure.soften(coarse, steps=10, swell=0.002, voxel=0.008)
    rig.bind(coarse, skeleton)
    names = [bone.name for bone in skeleton.data.bones]
    column = {group.index: names.index(group.name) for group in coarse.vertex_groups
              if group.name in names}
    matrix = np.zeros((len(coarse.data.vertices), len(names)))
    for vertex in coarse.data.vertices:
        for element in vertex.groups:
            if element.group in column:
                matrix[vertex.index, column[element.group]] = element.weight
    matrix[:, names.index('root')] = 0.0
    points = F.positions(coarse)
    scene.delete(coarse)
    missing = matrix.sum(axis=1) < 1e-6
    if missing.any():
        print(f'_person: bone heat left {int(missing.sum())} of {len(points)} points unweighted; '
              'nearest-bone weights used there')
        matrix[missing] = nearest_bone(figure, names, points[missing])
    tree = kdtree.KDTree(len(points))
    for index, point in enumerate(points):
        tree.insert(point, index)
    tree.balance()
    weights = np.zeros((len(targets), len(names)))
    for index, target in enumerate(targets):
        found = tree.find_n(target, 4)
        share = np.array([1.0 / (distance + 0.002) for _co, _index, distance in found])
        rows = matrix[[item[1] for item in found]]
        weights[index] = (rows * share[:, None]).sum(axis=0) / share.sum()
    for _ in range(smooth_steps):
        weights = 0.5 * weights + 0.5 * F.neighbour_mean(targets, pairs, weights)
    # A point on one side never follows the other leg: the thighs touch at the top, so the
    # nearest coarse point of an inner trouser leg can lie on the wrong thigh. Right is +X.
    for suffix, wrong in (('_l', targets[:, 0] > 0.003), ('_r', targets[:, 0] < -0.003)):
        for bone in ('thigh', 'shin', 'foot', 'toe'):
            weights[wrong, names.index(bone + suffix)] = 0.0
    # The shoulder: bone heat gives the top of the deltoid to the upper arm, so that lowering the
    # arms from the A-pose (the commonest pose in play) swings it out and up into a box-shaped
    # shrug. The upper arm's share grows along the arm's axis from just inside the joint; what
    # lies above and inside the joint stays on the shoulder (clavicle) bone, as the acromion does.
    s = figure.scale
    for suffix, sign in (('_r', 1.0), ('_l', -1.0)):
        joint, elbow = figure.joints['upper_arm' + suffix], figure.joints['forearm' + suffix]
        axis = F.unit(elbow - joint)
        relative = targets - joint
        along = relative @ axis
        lateral = np.linalg.norm(relative - np.outer(along, axis), axis=1)
        near = (lateral < 0.15 * s) & (along > -0.10 * s) & (along < 0.12 * s) & (targets[:, 0] * sign > 0.02 * s)
        arm, clavicle = names.index('upper_arm' + suffix), names.index('shoulder' + suffix)
        total = weights[near, arm] + weights[near, clavicle]
        share = F.smoothstep(-0.015 * s, 0.080 * s, along[near])
        weights[near, arm] = total * share
        weights[near, clavicle] = total * (1.0 - share)
    order = np.argsort(-weights, axis=1)[:, 4:]
    np.put_along_axis(weights, order, 0.0, axis=1)
    weights[weights < 0.02] = 0.0
    total = weights.sum(axis=1, keepdims=True)
    empty = total[:, 0] < 1e-6
    if empty.any():
        weights[empty] = nearest_bone(figure, names, targets[empty])
        total = weights.sum(axis=1, keepdims=True)
    return names, weights / total


def apply_weights(obj, skeleton, names, weights):
    """Binds a mesh to the skeleton with a ready weight array (vertices x bones)."""
    obj.parent = skeleton
    modifier = obj.modifiers.new('armature', 'ARMATURE')
    modifier.object = skeleton
    for column, name in enumerate(names):
        group = obj.vertex_groups.new(name=name)
        for index in np.nonzero(weights[:, column] > 0.0)[0]:
            group.add([int(index)], float(weights[index, column]), 'REPLACE')
    return obj


def add_anchors(a, figure, skeleton):
    """The five anchors of a person, each riding on its bone."""
    j, s, g = figure.joints, figure.scale, figure.girth
    mirror = np.array([-1.0, 1.0, 1.0])
    h = figure.hand_scale
    palm = j['hand_r'] + figure.hand_along * 0.066 * h + figure.hand_palm * 0.026 * h
    chest_z = figure.reference['chest_level'] * s
    placed = [
        ('anchor_hand_r', palm, figure.hand_along, figure.hand_thumb, 'hand_r'),
        ('anchor_hand_l', palm * mirror, figure.hand_along * mirror, figure.hand_thumb * mirror, 'hand_l'),
        ('anchor_head', j['head_top'], (0.0, 1.0, 0.0), (0.0, 0.0, 1.0), 'head'),
        ('anchor_back', (0.0, -0.135 * s * figure.build['depth'], chest_z + 0.06 * s),
         (0.0, -1.0, 0.0), (0.0, 0.0, 1.0), 'chest'),
        ('anchor_hip_r', (j['thigh_r'][0] + 0.105 * g * figure.build['width'], 0.0, j['hips'][2] - 0.02 * s),
         (0.0, 0.0, -1.0), (0.0, 1.0, 0.0), 'hips'),
    ]
    for name, location, forward, up, bone in placed:
        anchor = a.add_anchor(name, tuple(float(v) for v in location),
                              forward=tuple(float(v) for v in forward), up=tuple(float(v) for v in up))
        rig.attach(anchor, skeleton, bone)


# ---------------------------------------------------------------------------------------------
# Assembly
# ---------------------------------------------------------------------------------------------

def unwrap(obj):
    """Unfolds the game mesh along its marked seams only (angle based), so that a garment is
    one or two islands: every vertex on an island border is stored twice in the file, and a
    skinned vertex is dear."""
    uv.ensure_layer(obj)
    scene.activate(obj)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.unwrap(method='ANGLE_BASED', margin=0.004)
    bpy.ops.object.mode_set(mode='OBJECT')
    return obj


def build(a, spec):
    """Models the person described by `spec` and registers everything on the builder `a`.
    Returns (figure, skeleton, lod0). With spec['outfit'] (and spec['hair']) the person is
    dressed by _wardrobe.dress and only the visible skin is kept."""
    figure = G.Figure(**spec.get('figure', {}))
    dressed = 'outfit' in spec
    bomber = dressed and spec['outfit']['top']['piece'] == 'bomber'

    # Under trousers the legs are not sculpted; shorts, skirts and dresses show them.
    parts = ('torso', 'neck', 'head', 'arms', 'hands')
    if not dressed or spec.get('bare_legs'):
        parts = G.ALL_PARTS
    dense = figure.skin(parts)
    points = F.positions(dense)
    masks = figure.face_masks(points)
    if spec.get('hair'):
        masks = W.hairline_shadow(figure, points, masks)
    F.set_vertex_colors(dense, masks)
    scene.set_material(dense, skin_material(spec.get('skin', (0.42, 0.26, 0.18)), seed=spec.get('seed', 1),
                                            beard=spec.get('beard', 0.22)))
    shading.smooth(dense, angle=math.pi)
    eyes = eye_patches(figure, spec.get('eyes', IRIS_BROWN))

    low = scene.duplicate(dense, 'skin_low')
    F.clear_vertex_colors(low)
    pieces = W.dress(figure, spec) if dressed else []
    if bomber:
        F.delete_vertices(low, W.hidden_skin(figure, F.positions(low), hair=bool(spec.get('hair'))))
    elif dressed:
        # Short sleeves, open collars, shorts and skirts: the skin is kept wherever no garment
        # covers it.
        import _outfits
        # (A buzz cut has no shell over the scalp: the scalp stays.)
        shell = bool(spec.get('hair')) and spec['hair']['style'] != 'buzz'
        F.delete_vertices(low, _outfits.hidden_under(figure, low, pieces, hair=shell))
    # Plain edge collapse: its error measure already keeps the triangles where the surface
    # curves most (face, ears, fingers). The decimate modifier's vertex group is no use here:
    # with _forms.decimate(protect=...) the face kept everything and the body collapsed to a kite.
    F.decimate(low, spec.get('skin_triangles', SKIN_TRIANGLES) if dressed
               else LOD0_TRIANGLES - F.triangle_count(eyes))
    W.skin_seams(figure, low)
    W.transfer_normals(low, dense)
    eyes_low = shading.smooth(scene.duplicate(eyes, 'eyes_low'), angle=math.pi)
    lows = [low, eyes_low] + [piece.low() for piece in pieces]
    # Every piece already carries smooth custom normals from its dense source (no re-smoothing
    # after the join: it would throw them away).
    low = scene.join(lows, 'lod0')
    unwrap(low)

    skeleton = rig.armature('rig', bones(figure))
    names, weights = body_weights(figure, skeleton, F.positions(low), F.edges(low))
    apply_weights(low, skeleton, names, weights)

    a.add_rig(skeleton, animations=False)
    a.add(low, sources=[dense, eyes] + [piece.dense for piece in pieces], unwrap='keep')
    add_anchors(a, figure, skeleton)
    a.auto_lods(ratios=LOD_RATIOS, distances=LOD_DISTANCES)
    # A crowd person (spec['lean']) stores a smaller normal and packed map and no tangents (the
    # game derives them per pixel): about a third less per file.
    lean = spec.get('lean', False)
    # A lead seen large over the shoulder (spec['atlas'] = 2048) stores its base colour at 2048
    # (the yarn, the seams' shading and the creases' occlusion at about 1 mm a texel) and its
    # normal map at spec['normal_size']; spec['texels'] gives a material more of the atlas.
    size = spec.get('atlas', 1024)
    # spec['orm_size'] lets a lead keep the skin's pore-scale roughness (1024).
    a.bake(size=size, orm_size=256 if lean else spec.get('orm_size', 512),
           normal_size=512 if lean else spec.get('normal_size', None if size == 1024 else 1024),
           tangents=False if lean else None, cage_extrusion=0.006, max_ray_distance=0.02,
           occlusion_distance=0.25, material_texels=spec.get('texels'))
    a.set_extra('height', round(figure.height, 3))
    if not a.output_path:
        # A source preview renders the whole scene: show the dense skin, not the game mesh
        # lying in the same place.
        low.hide_render = True
    return figure, skeleton, low
