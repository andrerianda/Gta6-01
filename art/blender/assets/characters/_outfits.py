"""Outfits: the shirts, trousers, shorts, skirts, dresses, shoes, hair styles and the police kit
of the uniformed people and the pedestrians (Dez's bomber, cargo trousers, boots and short afro
are in _wardrobe, whose tools these pieces share).

Pieces (spec['outfit'] in _person.build):

    top     'police_shirt'  short sleeves, a turned collar, tucked in under the duty belt
            'tee'           short sleeves, a crew neck band, worn over the waistband
            'open_shirt'    short sleeves, a collar, unbuttoned down to the chest
            'blouse'        short sleeves, a collar, a small V at the throat, worn over the skirt
            'dress'         a short-sleeved bodice and a skirt to below the knee (both paint_top)
    bottom  'trousers', 'jeans' (straight legs on the shoes), 'shorts' (above the knee),
            'skirt' (straight, to the knee); none with a dress
    shoes   'boots' (ankle), 'shoes' and 'sneakers' (low), 'flats' (lower still)
    hair    'afro_short' (_wardrobe), 'short' (a close straight cut), 'bob' (to the jaw,
            covering the ears), 'bun' (drawn back into a knot at the crown)
    kit     'police': duty belt with a holster and pouches, a badge on the left chest, a name
            bar on the right, shoulder patches on both sleeves (all in the atlas)

Every piece is one paint role (paint_top, paint_bottom, paint_shoes, paint_hair) so the crowd
system recolours it; the police kit bakes into the atlas. Seams are cut where a tailor would
sew (front centre, under the arms, the legs' inner seams, the skirt's side), so each garment
unfolds into one or two islands. Triangle counts scale with spec['detail'].
"""
import math

import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

import _figure as G
import _forms as F
import _wardrobe as W
from lib import materials as M
from lib import scene

SHOE_TOPS = {'boots': 0.205, 'shoes': 0.100, 'sneakers': 0.105, 'flats': 0.075}


def flat(name, color, roughness, seed=0):
    graph = M.Graph(name, seed)
    return M.Coat(graph, color, roughness=roughness).finish(bump_strength=0.0)


def straight_hair_material(color, seed=0, name='paint_hair'):
    """Straight or wavy hair: fine streaks of light and shade with a soft sheen."""
    graph = M.Graph(name, seed)
    streaks = graph.voronoi(scale=900.0, feature='F1')
    clumps = graph.noise(scale=40.0, detail=3.0)
    base = graph.hsv(graph.paint_color(color), value=graph.remap(clumps, 0.2, 0.8, 0.80, 1.08))
    coat = M.Coat(graph, base, roughness=0.55, height=graph.add(graph.mul(streaks, 0.5), graph.mul(clumps, 0.5)))
    return coat.finish(bump_strength=0.5, bump_distance=0.0015)


# ---------------------------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------------------------

def cut_across(obj, point, normal, near):
    """Cuts a shell with a plane only among the faces where `near(centres)` holds (a sleeve, a
    trouser leg) and removes their part on the side the normal points to: a clean hem without
    touching the trunk the same plane passes through."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    centres = np.array([face.calc_center_median()[:] for face in bm.faces])
    chosen = [face for face, inside in zip(bm.faces, near(centres)) if inside]
    edges = list({edge for face in chosen for edge in face.edges})
    verts = list({vertex for face in chosen for vertex in face.verts})
    bmesh.ops.bisect_plane(bm, geom=chosen + edges + verts, plane_co=Vector(tuple(point)),
                           plane_no=Vector(tuple(normal)), clear_outer=True)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return obj


def garment_tree(pieces):
    """One BVH tree over the dense sources of every garment (not the hair)."""
    vertices, polygons, offset = [], [], 0
    for piece in pieces:
        if piece.dense.name.startswith('hair'):
            continue
        mesh = piece.dense.data
        points = F.positions(piece.dense)
        vertices.extend(points.tolist())
        polygons.extend([[offset + index for index in polygon.vertices] for polygon in mesh.polygons])
        offset += len(points)
    return BVHTree.FromPolygons(vertices, polygons)


def hidden_under(figure, obj, pieces, hair=True):
    """True for the skin vertices of `obj` that lie under a garment (a ray along the normal meets
    one within 6 cm), keeping a margin of a centimetre or two under every hem; the head is never
    hidden, and the scalp well under the hair is."""
    tree = garment_tree(pieces)
    hidden = F.covered(obj, tree, reach=0.06, margin_rings=6)
    points = F.positions(obj)
    hidden &= points[:, 2] < figure.chin - 0.004
    if hair:
        local = figure.to_head(points)
        hidden |= (local[:, 2] - W.hairline(local) > 0.034) & (points[:, 2] > figure.chin)
    return hidden


def shell_seams(figure):
    """Seams of a shirt: down the front centre and under each arm."""
    shoulder = figure.joints['upper_arm_r']
    pit = shoulder[2] - 0.075 * figure.scale

    def seams(low):
        centres = F.face_centres(low)
        across = np.abs(centres[:, 0])
        W.cut_seam(low, centres[:, 0] > 0.0, centres[:, 1] > shoulder[1])
        relative = np.stack([across, centres[:, 1], centres[:, 2]], axis=1) - shoulder
        under = np.where(across < shoulder[0], (centres[:, 2] < pit) & (across > 0.07),
                         relative @ figure.arm_up < 0.0)
        W.cut_seam(low, centres[:, 1] > shoulder[1], under)
    return seams


def front_point(tree, x, z, start=0.6):
    """Where a ray from the front (+Y) at (x, z) meets the surface behind `tree`, and its normal."""
    location, normal, _index, _distance = tree.ray_cast(Vector((x, start, z)), Vector((0.0, -1.0, 0.0)), 2.0)
    if location is None:
        return None, None
    normal = np.array(normal[:])
    if normal[1] < 0.0:
        normal = -normal
    return np.array(location[:]), normal


# ---------------------------------------------------------------------------------------------
# Tops
# ---------------------------------------------------------------------------------------------

def shirt(figure, color, sleeves='short', hem=0.93, ease=0.012, neck='crew', opening=None,
          role='paint_top', triangles=1200, name='shirt'):
    """A shirt or a tee: the trunk and the arms swollen by the ease, hanging from the shoulders,
    cut at the hem and along each sleeve, open at the neck (and down the front to `opening`, a
    height in reference metres, for an unbuttoned shirt or a V). Returns its pieces."""
    s, j = figure.scale, figure.joints
    material = W.cloth(role, color, roughness=0.88, grain=1100.0, relief=0.0005, seed=12)
    obj = figure.block(('torso', 'arms'), ease=ease).union(name, voxel=0.006, relax_steps=30, strength=0.5)
    F.bisect(obj, (0.0, 0.0, hem * s), (0.0, 0.0, 1.0))
    W.drape(obj, figure, trunk=0.8, sleeves=0.85)
    shoulder, elbow, wrist = j['upper_arm_r'], j['forearm_r'], j['hand_r']
    for sign in (1.0, -1.0):
        m = np.array([sign, 1.0, 1.0])
        d = F.unit(elbow - shoulder) * m
        if sleeves == 'long':
            cut = wrist * m - figure.hand_along * m * 0.035 * s
        else:
            cut = (shoulder + (elbow - shoulder) * (0.55 if sleeves == 'short' else 0.05)) * m
        start = shoulder * m

        def near(centres, start=start, d=d):
            relative = centres - start
            along = relative @ d
            lateral = np.linalg.norm(relative - np.outer(along, d), axis=1)
            return (along > -0.01 * s) & (lateral < 0.10 * s)

        cut_across(obj, cut, d, near)
    F.drop_small_islands(obj)
    pieces = []
    centre, rx, ry = W.collar_frame(figure)
    points = F.positions(obj)
    reach, _angle = W.collar_reach(figure, points)
    F.delete_vertices(obj, (reach < 1.02) & (points[:, 2] > centre[2] - 0.03 * s))
    if opening is not None:
        points = F.positions(obj)
        rise = np.clip((points[:, 2] - opening * s) / (centre[2] - opening * s), 0.0, 1.0)
        half = (0.006 + 0.050 * rise ** 0.8) * s
        F.delete_vertices(obj, (points[:, 1] > 0.0) & (points[:, 2] > opening * s) & (np.abs(points[:, 0]) < half))
    # (A thin shirt is not pressed down onto the collar line as the padded bomber is: it would
    # sink into the slope of the shoulders. The band's lower ring tucks under its edge instead.)
    F.drop_small_islands(obj)
    W.blank_mask(obj)
    scene.set_material(obj, material)
    pieces.append(W.Piece(obj, triangles, shell_seams(figure)))

    if neck in ('crew', 'collar'):
        rows = (((0.96, -0.022), (1.00, 0.008), (0.95, 0.007), (0.86, -0.002)) if neck == 'crew' else
                ((0.96, -0.024), (1.00, 0.018), (1.08, 0.006), (1.14, -0.008)))
        def collar(count, ribs=0, depth=0.0):
            # Starting at the back of the neck, so the band's seam lies under the hair.
            angles = np.arange(count) * (math.tau / count) - math.pi / 2.0
            lift = W.collar_lift(figure, angles)
            rings = []
            for scale, z in rows:
                rings.append(np.stack([np.cos(angles) * rx * scale, centre[1] + np.sin(angles) * ry * scale,
                                       centre[2] + z * s + lift], axis=1))
            return rings

        piece, _tree = W.band_piece('collar', collar, material, 24, 0)
        pieces.append(piece)
    return pieces


# ---------------------------------------------------------------------------------------------
# Bottoms
# ---------------------------------------------------------------------------------------------

def trousers(figure, color, length='long', fit=1.0, shoe_tree=None, top=1.035, triangles=800,
             role='paint_bottom', name='trousers'):
    """Straight trousers or jeans (on the shoes) or shorts (cut a hand above the knee)."""
    s, g, j = figure.scale, figure.girth, figure.joints
    soup = figure.block(('torso',), ease=0.008)
    side = F.Soup()
    hip, knee, ankle = j['thigh_r'], j['shin_r'], j['foot_r']
    out = np.array([0.006 * g, 0.0, 0.0])
    loose = g * fit * (1.0 + 0.5 * (figure.build['limb'] - 1.0))
    stations = [(hip + out + np.array([0.0, 0.0, 0.03 * s]), (0.087, 0.098)),
                (F.lerp(hip, knee, 0.25) + out, (0.085, 0.094)), (F.lerp(hip, knee, 0.60) + out, (0.076, 0.082)),
                (knee + out, (0.066, 0.070)), (F.lerp(knee, ankle, 0.45) + out * 0.5, (0.061, 0.065)),
                (F.lerp(knee, ankle, 0.85), (0.058, 0.062)),
                (ankle + np.array([0.0, 0.006 * s, -0.03 * s]), (0.058, 0.063))]
    side.tube([point for point, _ in stations], np.array([pair for _, pair in stations]) * loose,
              side=(1.0, 0.0, 0.0), cap=0.3)
    G.absorb(soup, side, mirror=True)
    obj = soup.union(name, voxel=0.005, relax_steps=8, strength=0.5)
    F.bisect(obj, (0.0, 0.0, top * s), (0.0, 0.0, -1.0))
    if length == 'shorts':
        F.bisect(obj, (0.0, 0.0, knee[2] + 0.11 * s), (0.0, 0.0, 1.0))
    else:
        F.bisect(obj, (0.0, 0.0, 0.085 * s), (0.0, 0.0, 1.0))
    F.drop_small_islands(obj)
    if length != 'shorts' and shoe_tree is not None:
        W.gather(obj, F.smoothstep(0.040, 0.0, F.positions(obj)[:, 2] - 0.095 * s), shoe_tree)
    W.blank_mask(obj)
    scene.set_material(obj, W.cloth(role, color, roughness=0.9, grain=1300.0, seed=6))
    crotch = figure.reference['trunk'][0][0] * s
    centre = hip[0] + out[0]

    def seams(low):
        centres = F.face_centres(low)
        W.cut_seam(low, centres[:, 1] > hip[1], (np.abs(centres[:, 0]) < centre) & (centres[:, 2] < crotch + 0.02))
        W.cut_seam(low, centres[:, 0] > 0.0, (centres[:, 1] < hip[1]) & (centres[:, 2] > crotch - 0.03))

    return W.Piece(obj, triangles, seams)


def skirt(figure, color, hem=None, flare=0.10, top=None, role='paint_bottom', triangles=500, name='skirt',
          material=None):
    """A straight skirt from the waist (`top`, reference metres) to the hem, over the hips and the
    seat and falling free past the thighs: lofted through rings, with a turned hem."""
    s, j = figure.scale, figure.joints
    ref = figure.reference
    top = ref['waist'] if top is None else top
    hip = ref['hip_level']
    hem = (j['shin_r'][2] / s + 0.04) if hem is None else hem
    seat = ref['glute'][2]

    def ring(z, count):
        if z >= hip:
            loop = W.trunk_ring(figure, z, 0.010, count)
            bulge = 0.30 * math.exp(-((z - seat) / 0.07) ** 2)
        else:
            loop = W.trunk_ring(figure, hip, 0.010, count)
            bulge = 0.30 * math.exp(-((hip - seat) / 0.07) ** 2)
        middle = loop.mean(axis=0)
        back = loop[:, 1] < middle[1]
        loop[:, 1] = np.where(back, middle[1] + (loop[:, 1] - middle[1]) * (1.0 + bulge), loop[:, 1])
        if z < hip:
            # Past the hips it falls free and clear of the thighs (wider still at the front,
            # where the thighs stand out of the trunk's last slice).
            t = (hip - z) / max(hip - hem, 1e-6)
            grow = 1.0 + 0.10 * min(t * 3.0, 1.0) + flare * t
            front = np.where(loop[:, 1] > middle[1], 1.0 + 0.10 * min(t * 3.0, 1.0), 1.0)
            loop[:, 0] = middle[0] + (loop[:, 0] - middle[0]) * grow
            loop[:, 1] = middle[1] + (loop[:, 1] - middle[1]) * grow * front
            loop[:, 2] = z * s
        return loop

    def rings(count, rows):
        heights = list(np.linspace(hem, top, rows))
        loops = [ring(z, count) for z in heights]
        inner = loops[0].copy()
        middle = inner.mean(axis=0)
        inner[:, :2] = middle[:2] + (inner[:, :2] - middle[:2]) * 0.975
        inner[:, 2] += 0.012 * s
        return [inner] + loops

    if material is None:
        material = W.cloth(role, color, roughness=0.86, grain=1200.0, seed=13)
    dense = outward(W.blank_mask(W.band(name, rings(320, 48), material)))
    low = outward(W.band(name + '_low', rings(max(16, triangles // 20), 10), material))
    W.cut_seam(low, F.face_centres(low)[:, 0] > 0.0, F.face_centres(low)[:, 1] < 0.0)
    return W.Piece(dense, low=low)


def outward(obj):
    """Turns a lofted tube's faces to face away from its axis (the game culls back faces)."""
    centres, normals = F.face_centres(obj), F.face_normals(obj)
    middle = centres.mean(axis=0)
    away = ((centres[:, :2] - middle[:2]) * normals[:, :2]).sum(axis=1)
    if np.mean(away) < 0.0:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update()
    return obj


# ---------------------------------------------------------------------------------------------
# Hair
# ---------------------------------------------------------------------------------------------

def hair(figure, style, color, triangles=500):
    """The hair styles beyond _wardrobe's short afro: 'short', 'bob', 'bun'."""
    if style == 'afro_short':
        piece = W.hair(figure, style, color)
        piece.triangles = triangles
        return piece
    k = figure.head_scale
    hp = figure.head_point
    thickness = {'short': 0.007, 'bob': 0.010, 'bun': 0.005}[style]
    soup, side = F.Soup(), F.Soup()
    figure._skull(soup, side, thickness)
    line = W.hairline
    if style == 'bob':
        # It falls straight from the widest part of the skull to the jaw, over the ears.
        side.tube([hp(0.066, -0.020, 0.175), hp(0.070, -0.020, 0.120), hp(0.070, -0.016, 0.050)],
                  np.array([(0.020, 0.052), (0.022, 0.054), (0.020, 0.050)]) * k, side=(1.0, 0.0, 0.0), cap=0.6)
        soup.tube([hp(0.0, -0.070, 0.180), hp(0.0, -0.084, 0.110), hp(0.0, -0.080, 0.050)],
                  np.array([(0.070, 0.040), (0.074, 0.040), (0.070, 0.036)]) * k, side=(1.0, 0.0, 0.0), cap=0.6)

        def line(local):
            return np.interp(local[:, 1], (-0.20, -0.004, 0.026, 0.045, 0.20), (0.045, 0.045, 0.150, 0.172, 0.172))
    elif style == 'bun':
        soup.ellipsoid(hp(0.0, -0.098, 0.165), np.array([0.034, 0.030, 0.032]) * k)
    G.absorb(soup, side, mirror=True)
    obj = soup.union('hair', voxel=0.004, relax_steps=6, strength=0.5)
    points, normals = F.positions(obj), F.normals(obj)
    local = figure.to_head(points)
    above = local[:, 2] - line(local)
    grown = F.smoothstep(0.0, 0.030, above)
    crown = F.smoothstep(0.150, 0.225, local[:, 2]) * (1.0 - 0.6 * F.smoothstep(0.02, 0.09, local[:, 1]))
    gain = {'short': (0.005, 0.003), 'bob': (0.006, 0.0), 'bun': (0.0, 0.0)}[style]
    sunk = F.smoothstep(0.004, -0.008, above) * 0.0045
    points += normals * (grown * (crown * gain[0] - (1.0 - crown) * gain[1])
                         - (1.0 - grown) * (thickness - 0.0015) - sunk)[:, None]
    F.set_positions(obj, points)
    F.delete_vertices(obj, above < -0.014)
    F.drop_small_islands(obj)
    W.blank_mask(obj)
    scene.set_material(obj, straight_hair_material(color, seed=8))
    return W.Piece(obj, triangles)


# ---------------------------------------------------------------------------------------------
# The police kit (atlas)
# ---------------------------------------------------------------------------------------------

def plate(name, material, centre, normal, up, radii, segments=14, rings=6):
    """A small flat part lying on a surface (a badge, a patch): an ellipsoid as its own object."""
    soup = F.Soup()
    soup.ellipsoid(centre, radii, F.basis(normal, up), segments=segments, rings=rings)
    obj = soup.to_object(name)
    scene.set_material(obj, material)
    W.blank_mask(obj)
    low = scene.duplicate(obj, name + '_low')
    # Face and back as two islands (a closed shape will not unfold).
    W.cut_seam(low, F.face_normals(low) @ np.asarray(normal, dtype=np.float64) > 0.0)
    return W.Piece(obj, low=low)


def police_kit(figure, shirt_piece, top=1.035):
    """Duty belt with holster and pouches; badge, name bar and shoulder patches on the shirt."""
    s, j = figure.scale, figure.joints
    leather = flat('belt_leather', (0.018, 0.018, 0.020), 0.42, seed=21)
    gold = flat('badge_gold', W.linear('#E8B23A'), 0.32, seed=22)
    blue = flat('patch_blue', W.linear('#1D4E7A'), 0.85, seed=23)
    pieces = []
    z = top - 0.030

    def belt(count, ribs=0, depth=0.0):
        rows = ((z - 0.024, 0.008), (z - 0.022, 0.020), (z + 0.022, 0.020), (z + 0.024, 0.008))
        return [W.trunk_ring(figure, height, ease, count) for height, ease in rows]

    piece, _tree = W.band_piece('belt', belt, leather, 32, 0)
    pieces.append(piece)
    loop = W.trunk_ring(figure, z - 0.03, 0.02, 64)
    right = loop[np.argmax(loop[:, 0])]
    soup = F.Soup()
    soup.ellipsoid(right + np.array([0.020, -0.006, -0.050 * s]), np.array([0.020, 0.036, 0.080]) * s)
    soup.ellipsoid(right + np.array([0.022, 0.004, 0.012 * s]), np.array([0.016, 0.034, 0.022]) * s)
    for x in (-0.06, -0.11):
        front = loop[np.argmin(np.abs(loop[:, 0] - x) - (loop[:, 1] > 0) * 1.0)]
        soup.ellipsoid(front + np.array([0.0, 0.012, -0.004 * s]), np.array([0.020, 0.012, 0.026]) * s)
    holster = soup.union('holster', voxel=0.003, relax_steps=3, strength=0.5)
    scene.set_material(holster, leather)
    W.blank_mask(holster)
    pieces.append(W.Piece(holster, 260, lambda low: W.cut_seam(low, F.face_normals(low)[:, 0] > 0.0)))

    tree = F.tree(shirt_piece.dense)
    chest = figure.reference['chest_level'] + 0.04
    spot, normal = front_point(tree, -0.075 * figure.girth, chest * s)
    if spot is not None:
        pieces.append(plate('badge', gold, spot + normal * 0.002, normal, (0.0, 0.0, 1.0),
                            np.array([0.019, 0.0025, 0.023]) * s))
    spot, normal = front_point(tree, 0.075 * figure.girth, (chest - 0.005) * s)
    if spot is not None:
        pieces.append(plate('name_bar', gold, spot + normal * 0.0015, normal, (0.0, 0.0, 1.0),
                            np.array([0.026, 0.0015, 0.0055]) * s, segments=10, rings=4))
    shoulder, elbow = j['upper_arm_r'], j['forearm_r']
    d = F.unit(elbow - shoulder)
    outward = F.unit(np.cross(d, (0.0, 1.0, 0.0)))
    point = shoulder + d * 0.085 * s
    location, hit_normal, _index, _distance = tree.ray_cast(Vector(tuple(point + outward * 0.3)),
                                                            Vector(tuple(-outward)), 0.6)
    if location is not None:
        spot = np.array(location[:])
        for sign, name in ((1.0, 'patch_r'), (-1.0, 'patch_l')):
            m = np.array([sign, 1.0, 1.0])
            pieces.append(plate(name, blue, (spot + outward * 0.002) * m, outward * m, -d * m,
                                np.array([0.030, 0.0028, 0.038]) * s))
            pieces.append(plate(name + '_mark', gold, (spot + outward * 0.0042) * m, outward * m, -d * m,
                                np.array([0.011, 0.0015, 0.014]) * s, segments=10, rings=4))
    return pieces


# ---------------------------------------------------------------------------------------------
# A whole outfit
# ---------------------------------------------------------------------------------------------

def dress(figure, spec):
    """The pieces of the person described by `spec` (see _person.build and the table above)."""
    outfit, detail = spec['outfit'], spec.get('detail', 1.0)
    tris = lambda count: int(count * detail)
    pieces = []
    shoes = outfit['shoes']
    footwear = W.boots(figure, W.linear(shoes['color']), top=SHOE_TOPS[shoes['piece']], triangles=tris(440))
    pieces.append(footwear)
    shoe_tree = F.tree(footwear.dense)
    top, bottom = outfit['top'], outfit.get('bottom')
    color = W.linear(top['color'])
    trouser_top = 1.035 if figure.sex == 'm' else figure.reference['waist'] + 0.005
    if top['piece'] == 'police_shirt':
        # Tucked in: the hem ends under the duty belt.
        shirt_pieces = shirt(figure, color, 'short', hem=trouser_top - 0.045, ease=0.010, neck='collar',
                             opening=figure.reference['chest_level'] + 0.13, triangles=tris(1300))
    elif top['piece'] == 'tee':
        shirt_pieces = shirt(figure, color, 'short', hem=trouser_top - 0.10, ease=0.014, neck='crew',
                             triangles=tris(1100))
    elif top['piece'] == 'open_shirt':
        shirt_pieces = shirt(figure, color, 'short', hem=trouser_top - 0.09, ease=0.016, neck='open',
                             opening=figure.reference['chest_level'] - 0.08, triangles=tris(1100))
    elif top['piece'] == 'blouse':
        shirt_pieces = shirt(figure, color, 'short', hem=figure.reference['hip_level'] + 0.02, ease=0.010,
                             neck='collar', opening=figure.reference['chest_level'] + 0.10, triangles=tris(1100))
    elif top['piece'] == 'dress':
        shirt_pieces = shirt(figure, color, 'short', hem=figure.reference['hip_level'] + 0.04, ease=0.010,
                             neck='crew', opening=figure.reference['chest_level'] + 0.12, triangles=tris(1000))
        # One cloth: the skirt shares the bodice's paint_top material.
        pieces.append(skirt(figure, color, hem=top.get('hem'), flare=0.14, top=figure.reference['waist'] + 0.02,
                            role='paint_top', triangles=tris(520), name='dress_skirt',
                            material=shirt_pieces[0].dense.active_material))
    else:
        raise ValueError(f'unknown top {top["piece"]!r}')
    pieces += shirt_pieces
    if bottom is not None:
        piece = bottom['piece']
        if piece in ('trousers', 'jeans'):
            pieces.append(trousers(figure, W.linear(bottom['color']), 'long', fit=0.96 if piece == 'jeans' else 1.0,
                                   shoe_tree=shoe_tree, top=trouser_top, triangles=tris(900)))
        elif piece == 'shorts':
            pieces.append(trousers(figure, W.linear(bottom['color']), 'shorts', fit=1.05, top=trouser_top,
                                   triangles=tris(600)))
        elif piece == 'skirt':
            pieces.append(skirt(figure, W.linear(bottom['color']), hem=bottom.get('hem'), flare=0.06,
                                triangles=tris(480)))
        else:
            raise ValueError(f'unknown bottom {piece!r}')
    if outfit.get('kit') == 'police':
        pieces += police_kit(figure, shirt_pieces[0], top=trouser_top)
    if spec.get('hair'):
        pieces.append(hair(figure, spec['hair']['style'], W.linear(spec['hair']['color']), triangles=tris(520)))
    return pieces
