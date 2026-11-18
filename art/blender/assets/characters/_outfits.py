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

import _accessories as A
import _fabric
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
    for piece in pieces:
        if getattr(piece, 'reveal', None) is not None:
            hidden &= ~piece.reveal(points)
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
          role='paint_top', triangles=1200, name='shirt', gap=0.006, roughness=0.88):
    """A shirt or a tee: the trunk and the arms swollen by the ease, hanging from the shoulders,
    cut at the hem and along each sleeve, open at the neck (and down the front to `opening`, a
    height in reference metres, for an unbuttoned shirt or a V; `gap` is the half width of the
    opening at its foot). Sleeves 'short', 'rolled' (turned up to below the elbow), 'long',
    'none'. A woman's shirt spans her bust as one surface. Returns its pieces."""
    s, j = figure.scale, figure.joints
    material = W.cloth(role, color, roughness=roughness, grain=1100.0, relief=0.0005, seed=12)
    obj = figure.block(('torso', 'arms'), ease=ease).union(name, voxel=0.006, relax_steps=30, strength=0.5)
    F.bisect(obj, (0.0, 0.0, hem * s), (0.0, 0.0, 1.0))
    W.drape(obj, figure, trunk=0.8, sleeves=0.85, front=1.0 if figure.sex == 'f' else None)
    shoulder, elbow, wrist = j['upper_arm_r'], j['forearm_r'], j['hand_r']
    for sign in (1.0, -1.0):
        m = np.array([sign, 1.0, 1.0])
        d = F.unit(elbow - shoulder) * m
        if sleeves == 'long':
            cut = wrist * m - figure.hand_along * m * 0.035 * s
        elif sleeves == 'rolled':
            cut = (elbow + (wrist - elbow) * 0.22) * m
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
    reveal = None
    if opening is not None:
        def in_opening(points, margin=0.0):
            rise = np.clip((points[:, 2] - opening * s) / (centre[2] - opening * s), 0.0, 1.0)
            half = (gap + 0.050 * rise ** 0.8) * s + margin
            return (points[:, 1] > 0.0) & (points[:, 2] > opening * s - margin) & (np.abs(points[:, 0]) < half)

        F.delete_vertices(obj, in_opening(F.positions(obj)))

        def reveal(points):
            # The skin seen through the open front stays, with a margin under the edges.
            return in_opening(points, 0.02 * s)
    # (A thin shirt is not pressed down onto the collar line as the padded bomber is: it would
    # sink into the slope of the shoulders. The band's lower ring tucks under its edge instead.)
    F.drop_small_islands(obj)
    scene.set_material(obj, material)
    # Folds (elbows, armpits, shoulder blades), seams and wear in the dense source only (baked).
    shape = _fabric.fold_garment(obj, figure, 'shirt', seed=12)
    piece = W.Piece(obj, triangles, shell_seams(figure), shape=shape)
    piece.reveal = reveal
    pieces.append(piece)

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
        F.bisect(obj, (0.0, 0.0, knee[2] + 0.05 * s), (0.0, 0.0, 1.0))
    else:
        F.bisect(obj, (0.0, 0.0, 0.085 * s), (0.0, 0.0, 1.0))
    F.drop_small_islands(obj)
    if length != 'shorts' and shoe_tree is not None:
        W.gather(obj, F.smoothstep(0.040, 0.0, F.positions(obj)[:, 2] - 0.095 * s), shoe_tree)
    scene.set_material(obj, W.cloth(role, color, roughness=0.9, grain=1300.0, seed=6))
    shape = _fabric.fold_garment(obj, figure, 'trousers', seed=6)
    crotch = figure.reference['trunk'][0][0] * s
    centre = hip[0] + out[0]

    def seams(low):
        centres = F.face_centres(low)
        W.cut_seam(low, centres[:, 1] > hip[1], (np.abs(centres[:, 0]) < centre) & (centres[:, 2] < crotch + 0.02))
        W.cut_seam(low, centres[:, 0] > 0.0, (centres[:, 1] < hip[1]) & (centres[:, 2] > crotch - 0.03))

    return W.Piece(obj, triangles, seams, shape=shape)


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
        # From the waist down the ease grows: the tops of the thighs stand out of the trunk's
        # slices at the front and the sides below the hip bones.
        ease = 0.010 + 0.018 * F.smoothstep(top, hip, max(z, hip))
        if z >= hip:
            loop = W.trunk_ring(figure, z, ease, count)
            bulge = 0.30 * math.exp(-((z - seat) / 0.07) ** 2)
        else:
            loop = W.trunk_ring(figure, hip, ease, count)
            bulge = 0.30 * math.exp(-((hip - seat) / 0.07) ** 2)
        middle = loop.mean(axis=0)
        back = loop[:, 1] < middle[1]
        loop[:, 1] = np.where(back, middle[1] + (loop[:, 1] - middle[1]) * (1.0 + bulge),
                              middle[1] + (loop[:, 1] - middle[1]) * (1.0 + 0.10 * F.smoothstep(top, hip, max(z, hip))))
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
    thickness = {'short': 0.007, 'bob': 0.010, 'bun': 0.005, 'ponytail': 0.0055}[style]
    soup, side = F.Soup(), F.Soup()
    figure._skull(soup, side, thickness)
    line = W.hairline
    tail = None
    if style == 'ponytail':
        # Drawn back sleek and tied high at the back of the crown; the tail swells below the tie
        # and hangs to the nape, clear of the neck, flattened a little side to side.
        tail = [hp(0.0, -0.104, 0.158), hp(0.0, -0.128, 0.138), hp(0.0, -0.142, 0.098),
                hp(0.0, -0.140, 0.050), hp(0.0, -0.130, 0.006), hp(0.0, -0.120, -0.030)]
        soup.ellipsoid(hp(0.0, -0.100, 0.160), np.array([0.020, 0.018, 0.018]) * k)
        soup.tube(tail, np.array([(0.016, 0.018), (0.026, 0.028), (0.028, 0.030), (0.025, 0.026),
                                  (0.018, 0.019), (0.007, 0.008)]) * k, side=(1.0, 0.0, 0.0), cap=0.8)
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
    gain = {'short': (0.005, 0.003), 'bob': (0.006, 0.0), 'bun': (0.0, 0.0), 'ponytail': (0.0, 0.0)}[style]
    sunk = F.smoothstep(0.004, -0.008, above) * 0.0045
    shift = grown * (crown * gain[0] - (1.0 - crown) * gain[1]) - (1.0 - grown) * (thickness - 0.0015) - sunk
    keep = np.zeros(len(points), dtype=bool)
    if tail is not None:
        # The tail keeps its shape below the nape's hairline.
        distance, _along = F.polyline_distance(points, tail)
        keep = distance < 0.034 * k
        keep &= local[:, 1] < -0.105
        shift = np.where(keep, 0.0, shift)
    points += normals * shift[:, None]
    F.set_positions(obj, points)
    F.delete_vertices(obj, (above < -0.014) & ~keep)
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
# Accessories: rings around the arm, a belt with a holster, a watch, a rolled cuff
# ---------------------------------------------------------------------------------------------

def arm_tree(figure):
    """A BVH tree of the bare arms (to wrap a cuff or a watch strap around)."""
    obj = figure.block(('arms', 'hands')).union('arm_probe', voxel=0.004, relax_steps=4, strength=0.5)
    tree = F.tree(obj)
    scene.delete(obj)
    return tree


def around_arm(tree, point, axis, rows, count, side=1.0):
    """Rings around an arm: for each (offset along the axis, lift off the skin) a closed ring of
    `count` points found by rays from outside onto the arm."""
    axis = F.unit(np.asarray(axis, dtype=np.float64))
    u = F.unit(np.cross(axis, (0.0, 1.0, 0.0)))
    v = np.cross(axis, u)
    rings = []
    for offset, lift in rows:
        centre = np.asarray(point, dtype=np.float64) + axis * offset
        ring = []
        for step in range(count):
            angle = math.tau * step / count * side - math.pi / 2.0
            out = u * math.cos(angle) + v * math.sin(angle)
            hit, _n, _i, _d = tree.ray_cast(Vector(tuple(centre + out * 0.12)), Vector(tuple(-out)), 0.2)
            radius = (np.array(hit[:]) - centre) @ out if hit is not None else 0.03
            ring.append(centre + out * (radius + lift))
        rings.append(np.array(ring))
    return rings


def rolled_cuffs(figure, tree, material, ease, triangles=160):
    """A shirt sleeve turned up twice to below the elbow: a thick band on each forearm."""
    j, s = figure.joints, figure.scale
    pieces = []
    for sign in (1.0, -1.0):
        m = np.array([sign, 1.0, 1.0])
        elbow, wrist = j['forearm_r'] * m, j['hand_r'] * m
        axis = F.unit(wrist - elbow)
        cut = elbow + (wrist - elbow) * 0.22
        rows = ((-0.050 * s, ease * 0.6), (-0.046 * s, ease + 0.0055), (0.000, ease + 0.0060),
                (0.004 * s, ease * 0.5))

        def rings(count, ribs=0, depth=0.0, cut=cut, axis=axis, sign=sign):
            return around_arm(tree, cut, axis, rows, count, side=sign)

        piece, _t = W.band_piece('cuff_' + ('r' if sign > 0 else 'l'), rings, material,
                                 max(12, triangles // 8), 0)
        pieces.append(piece)
    return pieces


def watch(figure, tree, strap_color, face_color=(0.50, 0.52, 0.55)):
    """A wristwatch on the left wrist: a metal strap and a round case on the back of the wrist."""
    j, s = figure.joints, figure.scale
    m = np.array([-1.0, 1.0, 1.0])
    hand, elbow = j['hand_r'] * m, j['forearm_r'] * m
    axis = F.unit(hand - elbow)
    spot = hand - axis * 0.030 * s
    strap = flat('watch_strap', strap_color, 0.30, seed=31)
    rows = ((-0.009 * s, 0.0004), (-0.008 * s, 0.0026), (0.008 * s, 0.0026), (0.009 * s, 0.0004))
    piece, _t = W.band_piece('watch', lambda count, ribs=0, depth=0.0: around_arm(tree, spot, axis, rows, count, -1.0),
                             strap, 16, 0)
    back = -(figure.hand_palm * m)
    hit, _n, _i, _d = tree.ray_cast(Vector(tuple(spot + back * 0.12)), Vector(tuple(-back)), 0.2)
    pieces = [piece]
    if hit is not None:
        case = flat('watch_case', face_color, 0.25, seed=32)
        pieces.append(plate('watch_case', case, np.array(hit[:]) + back * 0.005, back, axis,
                            np.array([0.017, 0.0035, 0.017]) * s, segments=12, rings=4))
    return pieces


def belt_and_holster(figure, top, leather_color, belt_color=(0.030, 0.022, 0.018)):
    """A leather belt in the trousers' loops and a holster clipped low on the right hip."""
    s = figure.scale
    belt_leather = flat('belt_leather', belt_color, 0.45, seed=33)
    z = top - 0.022

    def belt(count, ribs=0, depth=0.0):
        # Out far enough to sit over a shirt tucked in under it.
        rows = ((z - 0.017, 0.012), (z - 0.016, 0.020), (z + 0.016, 0.020), (z + 0.017, 0.012))
        return [W.trunk_ring(figure, height, ease, count) for height, ease in rows]

    piece, _tree = W.band_piece('belt', belt, belt_leather, 32, 0)
    if leather_color is None:
        return [piece]
    loop = W.trunk_ring(figure, z - 0.03, 0.02, 64)
    right = loop[np.argmax(loop[:, 0])]
    soup = F.Soup()
    soup.ellipsoid(right + np.array([0.016, -0.010, -0.085 * s]), np.array([0.017, 0.034, 0.066]) * s)
    soup.ellipsoid(right + np.array([0.018, -0.002, -0.020 * s]), np.array([0.015, 0.030, 0.022]) * s)
    holster = soup.union('holster', voxel=0.003, relax_steps=3, strength=0.5)
    scene.set_material(holster, flat('holster_leather', leather_color, 0.50, seed=34))
    W.blank_mask(holster)
    return [piece, W.Piece(holster, 220, lambda low: W.cut_seam(low, F.face_normals(low)[:, 0] > 0.0))]


# ---------------------------------------------------------------------------------------------
# Tactical kit (SWAT) and crew kit (paramedic)
# ---------------------------------------------------------------------------------------------

def outside(tree, centre, direction, lift, fallback):
    """The first surface of `tree` met by a ray from inside along `direction`, lifted off it."""
    hit, _n, _i, _d = tree.ray_cast(Vector(tuple(centre)), Vector(tuple(direction)), 0.5)
    return (np.array(hit[:]) if hit is not None else np.asarray(fallback)) + direction * lift


def tactical_vest(figure, under, material, bottom, top, triangles=900):
    """A plate carrier: a thick padded body lofted around the shirt (rays from the trunk's axis
    meet the shirt, the vest sits 15 mm out), its edges rolled in; webbing straps over the
    shoulders and a row of three magazine pouches on the front, all in one paint role."""
    s, g, j = figure.scale, figure.girth, figure.joints
    tree = F.tree(under)

    # The front and back panels rise higher than the sides, which stop below the armpits (above
    # them a ray from the axis would run out along the merged sleeve).
    side_top, panel_top = top - 0.07, top
    axis_y = W.trunk_ring(figure, (bottom + side_top) / 2.0, 0.0, 64).mean(axis=0)[1]
    reach = 0.24 * g

    def loops(count, rows):
        result = []
        angles = np.arange(count) * (math.tau / count) - math.pi / 2.0
        directions = np.stack([np.cos(angles), np.sin(angles), np.zeros(count)], axis=1)
        tops = side_top + (panel_top - side_top) * np.abs(directions[:, 1]) ** 1.6
        previous = None
        for t in np.linspace(0.0, 1.0, rows):
            ring = []
            for index, d in enumerate(directions):
                z = (bottom + (tops[index] - bottom) * t) * s
                centre = np.array([0.0, axis_y, z])
                hit, _n, _i, _d = tree.ray_cast(Vector(tuple(centre)), Vector(tuple(d)), reach)
                if hit is not None:
                    ring.append(np.array(hit[:]) + d * 0.016)
                elif previous is not None:
                    ring.append(previous[index] + np.array([0.0, 0.0, z - previous[index][2]]))
                else:
                    ring.append(centre + d * 0.15 * g)
            previous = np.array(ring)
            result.append(previous)
        first, last = result[0].copy(), result[-1].copy()
        for loop, dz in ((first, 0.010 * s), (last, -0.010 * s)):
            middle = loop.mean(axis=0)
            loop[:, :2] = middle[:2] + (loop[:, :2] - middle[:2]) * 0.93
            loop[:, 2] += dz
        return [first] + result + [last]

    dense = outward(W.blank_mask(W.band('vest', loops(256, 40), material)))
    low = outward(W.band('vest_low', loops(max(20, triangles // 26), 9), material))
    W.cut_seam(low, F.face_centres(low)[:, 0] > 0.0, F.face_centres(low)[:, 1] < 0.0)
    pieces = [W.Piece(dense, low=low)]

    soup = F.Soup()
    shoulder = j['upper_arm_r']
    for sign in (1.0, -1.0):
        x = 0.095 * g * sign
        crest = outside(tree, np.array([x, shoulder[1], shoulder[2] + 0.25]), np.array([0.0, 0.0, -1.0]), 0.0,
                        [x, shoulder[1], shoulder[2]])
        crest[2] += 0.012
        front = outside(tree, np.array([x, 0.5, top * s]), np.array([0.0, -1.0, 0.0]), 0.0, [x, 0.1, top * s])
        back = outside(tree, np.array([x, -0.5, top * s]), np.array([0.0, 1.0, 0.0]), 0.0, [x, -0.1, top * s])
        front[1] += 0.014
        back[1] -= 0.014
        path = [front + np.array([0.0, -0.004, -0.02 * s]), F.lerp(front, crest, 0.55) + np.array([0.0, 0.010, 0.006]),
                crest, F.lerp(back, crest, 0.55) + np.array([0.0, -0.010, 0.006]), back + np.array([0.0, 0.004, -0.02 * s])]
        soup.tube(path, np.array([(0.026, 0.008)] * 5) * g, side=(1.0, 0.0, 0.0), cap=0.5)
    z = (bottom + 0.075) * s
    for x in (-0.072, 0.0, 0.072):
        spot = outside(tree, np.array([x * g, 0.5, z]), np.array([0.0, -1.0, 0.0]), 0.0, [x * g, 0.12, z])
        # A magazine pouch: an upright flat-ended block standing on the vest's front.
        base = spot + np.array([0.0, 0.036 * g, 0.0])
        soup.tube([base - np.array([0.0, 0.0, 0.045 * s]), base + np.array([0.0, 0.0, 0.045 * s])],
                  np.array([(0.029, 0.020), (0.029, 0.020)]) * g, side=(1.0, 0.0, 0.0), segments=12, cap=0.25)
    gear = soup.union('vest_gear', voxel=0.004, relax_steps=3, strength=0.5)
    scene.set_material(gear, material)
    W.blank_mask(gear)
    pieces.append(W.Piece(gear, int(triangles * 0.6), lambda low: W.cut_seam(low, F.face_normals(low)[:, 1] > 0.0)))
    return pieces


def helmet(figure, material, triangles=420):
    """A ballistic helmet: a smooth shell 20 mm off the skull, its rim over the brow, above the
    ears and across the nape."""
    soup, side = F.Soup(), F.Soup()
    figure._skull(soup, side, 0.027)
    G.absorb(soup, side, mirror=True)
    obj = soup.union('helmet', voxel=0.004, relax_steps=12, strength=0.5)
    local = figure.to_head(F.positions(obj))
    line = np.interp(local[:, 1], (-0.20, -0.07, -0.01, 0.03, 0.065, 0.20), (0.082, 0.088, 0.122, 0.150, 0.172, 0.172))
    F.delete_vertices(obj, local[:, 2] < line)
    F.drop_small_islands(obj)
    scene.set_material(obj, material)
    W.blank_mask(obj)
    return W.Piece(obj, triangles, lambda low: W.cut_seam(low, F.face_centres(low)[:, 0] > 0.0,
                                                           F.face_centres(low)[:, 1] < figure.head_origin[1]))


def knee_pads(figure, trousers_piece, material, triangles=200):
    """Hard knee pads strapped over the trousers."""
    s, g, j = figure.scale, figure.girth, figure.joints
    tree = F.tree(trousers_piece.dense)
    soup = F.Soup()
    for sign in (1.0, -1.0):
        knee = j['shin_r'] * np.array([sign, 1.0, 1.0])
        spot = outside(tree, np.array([knee[0], 0.5, knee[2]]), np.array([0.0, -1.0, 0.0]), 0.0, knee)
        soup.ellipsoid(spot + np.array([0.0, 0.004, 0.004 * s]), np.array([0.050, 0.020, 0.068]) * g, segments=16, rings=10)
    obj = soup.union('knee_pads', voxel=0.003, relax_steps=3, strength=0.5)
    scene.set_material(obj, material)
    W.blank_mask(obj)
    return W.Piece(obj, triangles, lambda low: W.cut_seam(low, F.face_normals(low)[:, 1] > 0.3))


def gloves(figure, material, triangles=520):
    """Gloves: a thin shell over the hands (the hands' skin under them is dropped)."""
    obj = figure.block(('hands',), ease=0.0022).union('gloves', voxel=0.0025, relax_steps=4, strength=0.5)
    scene.set_material(obj, material)
    W.blank_mask(obj)
    return W.Piece(obj, triangles, lambda low: W.cut_seam(low, F.face_normals(low)[:, 2] > 0.0))


def crew_patches(figure, shirt_piece, color):
    """A crew's chest patch (left) and shoulder patches, in the atlas."""
    s, j = figure.scale, figure.joints
    cloth = flat('crew_patch', color, 0.8, seed=35)
    tree = F.tree(shirt_piece.dense)
    pieces = []
    spot, normal = front_point(tree, -0.080 * figure.girth, (figure.reference['chest_level'] + 0.045) * s)
    if spot is not None:
        pieces.append(plate('chest_patch', cloth, spot + normal * 0.002, normal, (0.0, 0.0, 1.0),
                            np.array([0.030, 0.0025, 0.022]) * s))
    shoulder, elbow = j['upper_arm_r'], j['forearm_r']
    d = F.unit(elbow - shoulder)
    out = F.unit(np.cross(d, (0.0, 1.0, 0.0)))
    point = shoulder + d * 0.085 * s
    hit, _n, _i, _d = tree.ray_cast(Vector(tuple(point + out * 0.3)), Vector(tuple(-out)), 0.6)
    if hit is not None:
        for sign, name in ((1.0, 'arm_patch_r'), (-1.0, 'arm_patch_l')):
            m = np.array([sign, 1.0, 1.0])
            pieces.append(plate(name, cloth, (np.array(hit[:]) + out * 0.002) * m, out * m, -d * m,
                                np.array([0.030, 0.0028, 0.034]) * s))
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
    elif top['piece'] == 'polo':
        # A crew polo, tucked in under a belt: a turned collar and a short placket.
        shirt_pieces = shirt(figure, color, 'short', hem=trouser_top - 0.045, ease=0.011, neck='collar',
                             opening=figure.reference['chest_level'] + 0.15, triangles=tris(1100))
    elif top['piece'] == 'tank':
        # A sleeveless vest top: cut at the shoulder joints, a scoop at the throat, worn over the
        # waistband.
        shirt_pieces = shirt(figure, color, 'none', hem=trouser_top - 0.09, ease=0.007, neck='open',
                             opening=figure.reference['chest_level'] + 0.11, gap=0.028, triangles=tris(900))
    elif top['piece'] == 'tactical_shirt':
        # Long sleeves to the gloves, a crew neck, tucked in (the vest goes over it).
        shirt_pieces = shirt(figure, color, 'long', hem=trouser_top - 0.045, ease=0.010, neck='crew',
                             triangles=tris(1000))
    elif top['piece'] == 'open_shirt_over_tee':
        # A fitted tee tucked into the trousers (paint_top, the catalog's secondary colour) under
        # an unbuttoned shirt with rolled sleeves hanging open over it (paint_jacket).
        shirt_pieces = shirt(figure, W.linear(top['secondary']), 'short', hem=trouser_top - 0.045, ease=0.007,
                             neck='crew', triangles=tris(520), name='tee')
        over = shirt(figure, color, 'rolled', hem=trouser_top - 0.055, ease=0.015, neck='open',
                     opening=trouser_top - 0.06, gap=0.040, role='paint_jacket', triangles=tris(1350),
                     name='overshirt')
        over[0].reveal = None
        # Only the tee's front panel shows between the shirt's fronts: the rest would cost
        # triangles and could poke through the shirt.
        # (Its smooth shape, which the game piece is made from, is trimmed the same way.)
        for tee in (shirt_pieces[0].dense, shirt_pieces[0].shape):
            points = F.positions(tee)
            F.delete_vertices(tee, ~((points[:, 1] > -0.005 * figure.scale) & (np.abs(points[:, 0]) < 0.125 * figure.girth)))
            F.drop_small_islands(tee)
        pieces += over
        tree = arm_tree(figure)
        pieces += rolled_cuffs(figure, tree, over[0].dense.active_material, 0.015, triangles=tris(160))
        if top.get('watch'):
            pieces += watch(figure, tree, W.linear(top['watch']))
    elif top['piece'] == 'vest':
        # An open sleeveless vest (a dock worker's hi-vis vest, a club's leather vest) over a
        # tee: the tee (paint_top, the catalog's secondary colour) shows in the wide armholes, as
        # sleeves and between the fronts; the vest (paint_jacket) hangs open to its hem.
        shirt_pieces = shirt(figure, W.linear(top['secondary']), 'short', hem=trouser_top - 0.07, ease=0.006,
                             neck='crew', triangles=tris(800), name='tee')
        # Only the tee's front panel (between the fronts) and its sleeves (out of the armholes)
        # show: its back and sides under the vest would poke through it.
        armhole = figure.joints['upper_arm_r'][0] - 0.012 * figure.scale
        for tee in (shirt_pieces[0].dense, shirt_pieces[0].shape):
            points = F.positions(tee)
            front = (points[:, 1] > -0.005 * figure.scale) & (np.abs(points[:, 0]) < 0.125 * figure.girth)
            F.delete_vertices(tee, ~(front | (np.abs(points[:, 0]) > armhole)))
            F.drop_small_islands(tee)
        over = shirt(figure, color, 'none', hem=trouser_top - 0.08, ease=0.018, neck='open',
                     opening=trouser_top - 0.09, gap=0.045, role='paint_jacket', triangles=tris(900),
                     name='vest', roughness=top.get('roughness', 0.86))
        over[0].reveal = None
        pieces += over
        if top.get('stripes'):
            # A hi-vis vest's two retro-reflective bands (silver grey, in the atlas).
            tape = flat('reflective_tape', (0.40, 0.41, 0.42), 0.32, seed=41)
            pieces += A.reflective_bands(figure, over[0], tape,
                                         [(figure.reference['chest_level'] - 0.05) * figure.scale,
                                          (trouser_top - 0.010) * figure.scale])
    elif top['piece'] == 'suit_jacket':
        # A dark single-button suit jacket over a pale dress shirt: long sleeves to the wrist,
        # the hem over the seat, a V from the collar down to the button at the waist (the
        # shirt's front and its turned collar show in it). Only the shirt's front panel and
        # collar are kept: the rest would cost triangles and could poke through the jacket.
        shirt_pieces = shirt(figure, W.linear(top['secondary']), 'short', hem=trouser_top - 0.045, ease=0.006,
                             neck='collar', triangles=tris(420), name='dress_shirt')
        for front in (shirt_pieces[0].dense, shirt_pieces[0].shape):
            points = F.positions(front)
            F.delete_vertices(front, ~((points[:, 1] > -0.005 * figure.scale)
                                       & (np.abs(points[:, 0]) < 0.11 * figure.girth)
                                       & (points[:, 2] > (figure.reference['waist'] - 0.06) * figure.scale)))
            F.drop_small_islands(front)
        over = shirt(figure, color, 'long', hem=figure.reference['hip_level'] - 0.06, ease=0.018, neck='open',
                     opening=figure.reference['waist'] - 0.02, gap=0.004, role='paint_jacket',
                     triangles=tris(1500), name='suit_jacket', roughness=0.80)
        over[0].reveal = None
        pieces += over
        # Lapels along the V (the jacket's own material, so they recolour with it), and a tie
        # down the shirt's front panel (in the atlas).
        pieces += A.lapels(figure, over[0], over[0].dense.active_material,
                           figure.joints['neck'][2] - 0.03 * figure.scale,
                           (figure.reference['waist'] - 0.02) * figure.scale)
        if outfit.get('tie'):
            silk = W.cloth('tie', W.linear(outfit['tie']), roughness=0.55, grain=1400.0, relief=0.0004, seed=42)
            pieces += A.tie(figure, shirt_pieces[0], silk)
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
        elif piece == 'cargo':
            cargo = W.cargo_trousers(figure, W.linear(bottom['color']), shoe_tree)
            cargo.triangles = tris(1000)
            pieces.append(cargo)
        elif piece == 'shorts':
            # Bare thighs below must not stand out of the legs: wider for heavier limbs.
            pieces.append(trousers(figure, W.linear(bottom['color']), 'shorts',
                                   fit=1.12 + 0.8 * (figure.build['limb'] - 1.0), top=trouser_top,
                                   triangles=tris(600)))
        elif piece == 'skirt':
            pieces.append(skirt(figure, W.linear(bottom['color']), hem=bottom.get('hem'), flare=0.06,
                                triangles=tris(480)))
        else:
            raise ValueError(f'unknown bottom {piece!r}')
    if outfit.get('kit') == 'police':
        pieces += police_kit(figure, shirt_pieces[0], top=trouser_top)
    if outfit.get('holster') or outfit.get('belt'):
        pieces += belt_and_holster(figure, trouser_top, W.linear(outfit['holster']) if outfit.get('holster') else None)
    if outfit.get('kit') == 'tactical':
        gear = flat('tactical_gear', W.linear(outfit.get('gear', '#26262B')), 0.55, seed=36)
        vest_material = W.cloth('paint_jacket', W.linear(outfit['vest']), roughness=0.82, grain=700.0,
                                relief=0.0007, seed=15)
        pieces += tactical_vest(figure, shirt_pieces[0].dense, vest_material, trouser_top + 0.005,
                                figure.reference['chest_level'] + 0.10, triangles=tris(900))
        pieces.append(helmet(figure, gear, triangles=tris(440)))
        legs = next(piece for piece in pieces if piece.dense.name.startswith('trousers'))
        pieces.append(knee_pads(figure, legs, gear, triangles=tris(200)))
    if outfit.get('gloves'):
        pieces.append(gloves(figure, flat('gloves', W.linear(outfit['gloves']), 0.6, seed=37), triangles=tris(520)))
    if outfit.get('patches'):
        pieces += crew_patches(figure, shirt_pieces[0], W.linear(outfit['patches']))
    # The catalog's accessories (in the atlas, in the gang's colour).
    if outfit.get('sunglasses'):
        pieces += A.sunglasses(figure, flat('sunglass_frame', W.linear(outfit['sunglasses']), 0.30, seed=43),
                               flat('sunglass_lens', (0.010, 0.011, 0.013), 0.06, seed=44))
    if outfit.get('bandana'):
        kerchief = outfit['bandana']
        cotton = W.cloth('bandana', W.linear(kerchief['color']), roughness=0.86, grain=900.0, relief=0.0005, seed=45)
        pieces += A.bandana(figure, cotton, style=kerchief.get('style', 'head'), triangles=tris(420))
    if spec.get('hair') and spec['hair']['style'] == 'buzz':
        # A buzz cut is the darkened scalp alone (_wardrobe.hairline_shadow): no shell.
        return pieces
    if spec.get('hair'):
        pieces.append(hair(figure, spec['hair']['style'], W.linear(spec['hair']['color']), triangles=tris(520)))
    return pieces
