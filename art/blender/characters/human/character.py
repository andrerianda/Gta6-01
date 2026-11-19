"""Builds one person from a character module (art/blender/characters/<id>.py): body, face, hands,
hair, wardrobe -> meshes -> hidden parts removed -> decimated to the budget -> one UV atlas ->
textures baked from the fields (texels.py, shaders.py) -> skeleton and weights -> levels of detail
-> .glb (WebP textures, Draco geometry with the skin) with the run-time's node, material and anchor
names. See art/blender/characters/README.md.
"""
import json
import math
import os
import time

import bmesh
import bpy
import numpy as np
from mathutils import Vector

from . import body as bodymod
from . import garments as G
from . import hair as hairmod
from . import hands as handmod
from . import shaders, skeleton, surfnets, texels, weights
from .sdf import Field, Sphere

PAINT_ORDER = ('paint_skin', 'paint_hair', 'paint_jacket', 'paint_top', 'paint_bottom', 'paint_shoes', 'atlas')


def log(msg):
    print('[human] ' + msg, flush=True)


class MeshPart:
    def __init__(self, name, role, color, field, shader, details=None, layer=0, grid=0.004, weight=1.0, hides=False,
                 fabric='cotton', seams=None, mirror=False, side='r', kind='lod0'):
        self.name, self.role, self.color, self.field, self.shader = name, role, color, field, shader
        self.details = details or {}
        self.layer, self.grid, self.weight, self.hides = layer, grid, weight, hides
        self.fabric = fabric
        self.seams = seams
        self.mirror, self.side, self.kind = mirror, side, kind
        self.verts = self.faces = None
        self.obj = None

    def eval(self, P):
        if self.mirror:
            P = P * np.array([-1, 1, 1], np.float32)
        return self.field(P)

    def gradient(self, P):
        if self.mirror:
            g = self.field.gradient(P * np.array([-1, 1, 1], np.float32))
            return g * np.array([-1, 1, 1], np.float32)
        return self.field.gradient(P)

    def project(self, P, it=2):
        P = np.asarray(P, np.float32).copy()
        for _ in range(it):
            d = self.eval(P)
            P -= self.gradient(P) * d[:, None]
        return P


class Ctx:
    """Everything a build knows: the body, its joints and fields, the parts."""
    def __init__(self, spec, quality=1.0):
        self.spec = spec
        self.q = quality
        self.b = bodymod.params(spec['BODY'])
        b = self.b
        b['_hair'] = spec.get('HAIR', {'style': 'short'})
        b['_beard'] = spec.get('BEARD', {'style': 'none'})
        b['brows'] = spec.get('BROWS', {})
        b['eye_color'] = spec.get('EYES', {}).get('color', '#3b2416')
        if 'lip_tint' in spec.get('BODY', {}):
            b['lip_tint'] = spec['BODY']['lip_tint']
        self.s = b['height'] / 1.86
        self.J = skeleton.joints(b)
        self.body = Field('body')
        bodymod.build(self.body, self.J, b)
        self.torso_rows = b['_torso_rows']
        self.anchors = skeleton.anchor_frames(self.J, b)
        self.hand_frame = handmod.frame_for(self.J, self.anchors['anchor_hand_r'][1], b)
        self.parts = []
        self.outer_field = self.body
        self.beard_cover = (lambda P: hairmod.beard_cover(b['_head']['S'], b['_head'], b['_beard'], P)) if b['_beard'].get('style', 'none') != 'none' else None
        self._seams = {}
        self.badge_frames = {}
        self.hand_tips = {}
        self._tags = [prim.tag if op == 'add' else '' for op, prim, k in self.body.steps]

    # --- helpers the shaders use
    def body_tags(self, P):
        which, _ = self.body.labels(P)
        tags = np.array(self._tags + [''], dtype=object)
        return tags[np.where(which < 0, len(self._tags), which)].astype(str)

    def seams_of(self, part):
        if part.name not in self._seams:
            self._seams[part.name] = part.seams(self) if part.seams else []
        return self._seams[part.name]

    def inside_mask(self, part, P):
        f = part.field
        if not hasattr(f, 'region_fn'):
            return np.zeros(len(P), np.float32)
        r = f.region_fn(P)
        o = f.outer_fn(P)
        return ((np.abs(r) < 0.0025) & (o < -0.0022)).astype(np.float32)

    def rib_coord(self, P):
        nk = self.J['neck'][0]
        out = np.arctan2(P[:, 0], P[:, 1] + 0.01) * 0.16
        neck = P[:, 2] > nk[2] - 0.05 * self.s
        out = np.where(neck, np.arctan2(P[:, 0], P[:, 1] - nk[1]) * 0.066, out)
        for side in ('r', 'l'):
            wr, el = self.J['hand_' + side][0], self.J['forearm_' + side][0]
            d = (wr - el) / np.linalg.norm(wr - el)
            near = np.linalg.norm(P - wr, axis=1) < 0.13 * self.s
            q = P - wr
            u = np.cross(d, (0, 1, 0))
            u /= np.linalg.norm(u)
            v = np.cross(d, u)
            out = np.where(near, np.arctan2(q @ u, q @ v) * 0.045, out)
        return out

    def lace_mask(self, P):
        out = np.zeros(len(P), np.float32)
        for side in ('r', 'l'):
            an, toe = self.J['foot_' + side][0], self.J['toe_' + side][0]
            fx = (an[0] + toe[0]) / 2
            dx = P[:, 0] - fx
            y0, y1 = an[1] + 0.02 * self.s, toe[1] - 0.035 * self.s
            inside = (np.abs(dx) < 0.017 * self.s) & (P[:, 1] > y0) & (P[:, 1] < y1) & (P[:, 2] > 0.045 * self.s)
            a = np.abs(((P[:, 1] + dx * 1.1) / 0.013) % 1.0 - 0.5) < 0.17
            b = np.abs(((P[:, 1] - dx * 1.1) / 0.013) % 1.0 - 0.5) < 0.17
            out = np.maximum(out, (inside & (a | b)).astype(np.float32))
        return out

    def nail_mask(self, P, part):
        tips = self.hand_tips.get(part.name)
        if not tips:
            return np.zeros(len(P), np.float32)
        Q = P * np.array([-1, 1, 1], np.float32) if part.mirror else P
        F = self.hand_frame
        out = np.zeros(len(P), np.float32)
        for tip, direction, r in tips:
            rel = Q - tip
            along = rel @ direction
            dist = np.linalg.norm(rel - along[:, None] * direction, axis=1)
            dorsal = np.cross(direction, np.cross(F.w, direction))
            dorsal /= np.linalg.norm(dorsal) + 1e-9
            up = rel @ dorsal
            m = (along > -0.011 * F.k) & (along < 0.004 * F.k) & (up > 0.25 * r * F.k) & (dist < r * F.k * 1.4)
            out = np.maximum(out, m.astype(np.float32))
        return out


# --- meshing ---------------------------------------------------------------------------------

def mesh_body(ctx):
    b = ctx.b
    hd = b['_head']
    o, k = hd['origin'], hd['scale']
    lo, hi = ctx.body.box(0.01)
    q = ctx.q
    fine, base = 0.0016 * q, 0.0045 * q
    xs = surfnets.axis(lo[0], hi[0], base, [(-0.09 * k, 0.09 * k, fine)])
    ys = surfnets.axis(lo[1], hi[1], base, [(o[1] - 0.12 * k, o[1] + 0.14 * k, fine)])
    zs = surfnets.axis(max(lo[2], -0.01), hi[2], base, [(o[2] - 0.14 * k, o[2] + 0.15 * k, fine)])
    return surfnets.mesh(ctx.body, xs, ys, zs)


def mesh_uniform(field, lo, hi, step):
    xs = surfnets.axis(lo[0], hi[0], step)
    ys = surfnets.axis(lo[1], hi[1], step)
    zs = surfnets.axis(lo[2], hi[2], step)
    return surfnets.mesh(field, xs, ys, zs)


def part_box(ctx, field, pad=0.03):
    blo, bhi = ctx.body.box(0.05)
    flo, fhi = field.box(pad)
    lo = np.maximum(blo - 0.12, flo)
    hi = np.minimum(bhi + 0.12, fhi)
    lo[2] = max(lo[2], -0.005)
    return lo, hi


def face_centres(verts, faces):
    return verts[faces].mean(axis=1)


def quad_areas(verts, faces):
    a = verts[faces[:, 0]]
    b = verts[faces[:, 1]]
    c = verts[faces[:, 2]]
    d = verts[faces[:, 3]]
    return 0.5 * np.linalg.norm(np.cross(c - a, d - b), axis=1)


def compact(verts, faces, keep):
    faces = faces[keep]
    used = np.unique(faces)
    remap = np.full(len(verts), -1, np.int64)
    remap[used] = np.arange(len(used))
    return verts[used], remap[faces]


def drop_specks(verts, faces, min_faces=40):
    """Removes small disconnected islands (bits of shells left by the cuts)."""
    if len(faces) == 0:
        return verts, faces
    parent = np.arange(len(verts))

    def find(x):
        root = x
        while parent[root] != root:
            root = parent[root]
        while parent[x] != root:
            parent[x], x = root, parent[x]
        return root
    # Union by faces (vectorised in rounds of pointer jumping).
    a = faces[:, 0].copy()
    for j in range(1, faces.shape[1]):
        bb = faces[:, j]
        for _ in range(64):
            ra, rb = parent[a], parent[bb]
            for _ in range(8):
                ra, rb = parent[ra], parent[rb]
            lo = np.minimum(ra, rb)
            hi = np.maximum(ra, rb)
            changed = lo != hi
            if not changed.any():
                break
            parent[hi[changed]] = lo[changed]
    for _ in range(64):
        nxt = parent[parent]
        if np.array_equal(nxt, parent):
            break
        parent = nxt
    comp = parent[faces[:, 0]]
    ids, counts = np.unique(comp, return_counts=True)
    big = set(ids[counts >= min_faces].tolist())
    keep = np.isin(comp, list(big))
    return compact(verts, faces, keep)


def to_object(name, verts, faces):
    mesh = bpy.data.meshes.new(name)
    nv = len(verts)
    nf = len(faces)
    width = faces.shape[1]
    mesh.vertices.add(nv)
    mesh.vertices.foreach_set('co', np.asarray(verts, np.float32).ravel())
    mesh.loops.add(nf * width)
    mesh.loops.foreach_set('vertex_index', np.asarray(faces, np.int32).ravel())
    mesh.polygons.add(nf)
    mesh.polygons.foreach_set('loop_start', np.arange(0, nf * width, width, dtype=np.int32))
    mesh.update(calc_edges=True)
    mesh.validate()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def obj_arrays(obj):
    me = obj.data
    v = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get('co', v)
    return v.reshape(-1, 3)


def set_coords(obj, verts):
    obj.data.vertices.foreach_set('co', np.asarray(verts, np.float32).ravel())
    obj.data.update()


def poly_list(obj):
    return [tuple(p.vertices) for p in obj.data.polygons]


def decimate(obj, target_tris, symmetric=True, density=None):
    me = obj.data
    me.calc_loop_triangles()
    tris = len(me.loop_triangles)
    if tris <= target_tris:
        return tris
    mod = obj.modifiers.new('decimate', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = max(target_tris / tris, 0.0005)
    mod.use_collapse_triangulate = True
    if symmetric:
        mod.use_symmetry = True
        mod.symmetry_axis = 'X'
    if density is not None:
        vg = obj.vertex_groups.new(name='density')
        for value in np.unique(np.round(density, 2)):
            idx = np.nonzero(np.round(density, 2) == value)[0].tolist()
            vg.add(idx, float(value), 'REPLACE')
        mod.vertex_group = 'density'
        mod.invert_vertex_group = True     # a heavy vertex is expensive to collapse: kept
        mod.vertex_group_factor = 1.0
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    new = bpy.data.meshes.new_from_object(ev)
    old = obj.data
    obj.modifiers.clear()
    obj.data = new
    bpy.data.meshes.remove(old)
    if 'density' in obj.vertex_groups:
        obj.vertex_groups.remove(obj.vertex_groups['density'])
    new.calc_loop_triangles()
    return len(new.loop_triangles)


def bisect_away(obj, point, normal):
    """Cuts the mesh with a plane and removes what lies on the normal's side."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=Vector(point), plane_no=Vector(normal), clear_outer=True, dist=1e-6)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def boundary_verts(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    out = [v.index for v in bm.verts if v.is_boundary]
    bm.free()
    return np.array(out, np.int64)


def snap_to_polyline(P, Q):
    """Moves points P onto the nearest point of the closed polyline through the points Q (any order
    is fine for a convex-ish loop: Q is sorted by angle round its centroid)."""
    c = Q.mean(axis=0)
    u = Q[0] - c
    u /= np.linalg.norm(u)
    nrm = np.cross(Q[1] - c, Q[0] - c)
    if np.linalg.norm(nrm) < 1e-9:
        return P
    nrm /= np.linalg.norm(nrm)
    v = np.cross(nrm, u)
    ang = np.arctan2((Q - c) @ v, (Q - c) @ u)
    Q = Q[np.argsort(ang)]
    A, B = Q, np.roll(Q, -1, axis=0)
    out = P.copy()
    for i, p in enumerate(P):
        ab = B - A
        t = np.clip(np.sum((p - A) * ab, 1) / np.maximum(np.sum(ab * ab, 1), 1e-12), 0, 1)
        X = A + ab * t[:, None]
        j = np.argmin(np.linalg.norm(X - p, axis=1))
        out[i] = X[j]
    return out


# --- the build -------------------------------------------------------------------------------

def collect_parts(ctx):
    spec = ctx.spec
    b = ctx.b
    parts = []
    body_part = MeshPart('body', 'paint_skin', b['skin'], ctx.body, 'skin', {'kind': 'body'}, layer=0, weight=4.5)
    parts.append(body_part)
    wardrobe = spec.get('WARDROBE', [])
    glove = None
    for garment in wardrobe:
        if getattr(garment, 'hands', None):
            glove = garment.hands
        for p in garment.parts:
            parts.append(MeshPart(p.name, p.role, p.color, p, p.shader, p.details, p.layer, p.grid,
                                  weight=1.0 if p.details.get('kind') not in ('shoe', 'badge', 'buckle', 'pocket', 'pouch') else 1.5,
                                  hides=p.hides, fabric=p.fabric, seams=p.seams))
    for name, field, det in hairmod.hair_parts(ctx, ctx.b['_hair']):
        parts.append(MeshPart(name, 'paint_hair', ctx.b['_hair'].get('color', '#1a1410'), field, 'hair', det, layer=7, grid=0.0022, weight=2.2))
    for name, field, det in hairmod.beard_part(ctx, ctx.b['_beard']):
        parts.append(MeshPart(name, 'paint_hair', ctx.b['_beard'].get('color', ctx.b['_hair'].get('color', '#1a1410')), field, 'hair', det,
                              layer=7, grid=0.0013, weight=1.6))
    eyes = Field('eyes')
    for E in b['_head']['eyes']:
        eyes.add(Sphere(E, b['_head']['eye_radius']))
    parts.append(MeshPart('eyes', 'atlas', '#ffffff', eyes, 'eye', {'kind': 'eye'}, layer=0, weight=1.0))
    ctx.glove = glove
    return parts


def make_garment_fields(ctx, parts):
    """Turns the garment Parts' make() into Fields (in layer order, so badges see the outer layer)."""
    outer = []
    for part in sorted(parts, key=lambda p: p.layer):
        if isinstance(part.field, G.Part):
            gp = part.field
            if gp.details.get('kind') == 'badge':
                continue
            f = gp.make(ctx)
            if f.steps and hasattr(f.steps[0][1], 'fn') and len(f.steps) == 1:
                pass
            part.field = f
            outer.append(f)
    if outer:
        fields = [ctx.body] + outer

        def union(P):
            d = fields[0](P)
            for f in fields[1:]:
                d = np.minimum(d, f(P))
            return d
        union_field = Field('outer')
        from .sdf import Fn
        lo, hi = ctx.body.box(0.2)
        union_field.add(Fn(union, lo, hi))
        ctx.outer_field = union_field
    for part in parts:
        if isinstance(part.field, G.Part):
            gp = part.field
            ctx.badge_frames[part.name] = G.badge_frame(ctx, gp.details['at'])
            part.field = gp.make(ctx)


def mesh_parts(ctx, parts):
    for part in parts:
        t = time.time()
        if part.name == 'body':
            v, f = mesh_body(ctx)
        elif part.name == 'eyes':
            v, f = sphere_mesh(ctx)
        else:
            lo, hi = part_box(ctx, part.field)
            v, f = mesh_uniform(part.field, lo, hi, part.grid * ctx.q)
        part.verts, part.faces = v, f
        log('meshed %-14s %7d quads %.1fs' % (part.name, len(f), time.time() - t))


def sphere_mesh(ctx):
    hd = ctx.b['_head']
    R = hd['eye_radius']
    verts, faces = [], []
    rings, segs = 14, 20
    for E in hd['eyes']:
        base = len(verts)
        pts = []
        for i in range(rings + 1):
            th = math.pi * i / rings
            for j in range(segs):
                ph = 2 * math.pi * j / segs
                d = np.array([math.sin(th) * math.cos(ph), math.cos(th), math.sin(th) * math.sin(ph)])
                bulge = 1.0 + 0.06 * max(0.0, d[1] - 0.85) / 0.15     # the cornea
                pts.append(E + d * R * bulge)
        verts.extend(pts)
        for i in range(rings):
            for j in range(segs):
                a = base + i * segs + j
                b_ = base + i * segs + (j + 1) % segs
                c = base + (i + 1) * segs + (j + 1) % segs
                d = base + (i + 1) * segs + j
                faces.append((a, d, c, b_))
    return np.asarray(verts, np.float32), np.asarray(faces, np.int64)


def remove_hidden(ctx, parts):
    """Deletes faces nobody can see: shells inside the body, skin and inner layers under clothes."""
    hiders = [p for p in parts if p.hides and p.name not in ('body', 'eyes')]
    for part in parts:
        if part.faces is None or len(part.faces) == 0:
            continue
        C = face_centres(part.verts, part.faces)
        keep = np.ones(len(C), bool)
        if part.name not in ('body', 'eyes'):
            keep &= ctx.body(C) > -0.0015
        for h in hiders:
            if h is part or h.layer <= part.layer:
                continue
            f = h.field
            if hasattr(f, 'region_fn'):
                inside = (f.outer_fn(C) < -0.0015) & (f.region_fn(C) < -0.028 * ctx.s)
            else:
                inside = f(C) < -0.003
            keep &= ~inside
        v, fc = compact(part.verts, part.faces, keep)
        part.verts, part.faces = drop_specks(v, fc, 40 if part.name != 'eyes' else 1)
        log('visible %-14s %7d quads' % (part.name, len(part.faces)))


def build_hands(ctx):
    """Relaxed hands (both sides) and the two grip hands as MeshParts with meshes."""
    b = ctx.b
    F = ctx.hand_frame
    m = 0.82 + 0.36 * b['build']
    out = []
    poses = (('hand_r', 'relaxed', False, 'r'), ('hand_l', 'relaxed', True, 'l'),
             ('hand_r_grip', 'grip', False, 'r'), ('hand_l_grip', 'support', True, 'l'))
    cache = {}
    for name, pose, mirror, side in poses:
        if pose not in cache:
            f = Field(name)
            for prim, k in bodymod.forearm_prims(ctx.J, 'r', b, m):
                f.add(prim.label('forearm_r', 'forearm'), k)
            info = handmod.build(f, F, b, pose)
            if ctx.glove:
                f.offset(ctx.glove.get('ease', 0.0015))
            c, n = handmod.cut_plane(ctx.J, 'r', b)
            from .sdf import Plane
            f.keep(Plane(c, -n), 0.0)
            lo, hi = f.box(0.01)
            lo = np.maximum(lo, c - 0.2)
            v, fc = mesh_uniform(f, lo, hi, 0.00125 * ctx.q)
            # Drop the flat cap at the cut: the hand opens there and meets the arm.
            C = face_centres(v, fc)
            on_plane = np.abs((C - c) @ n) < 0.0009 * ctx.q
            v, fc = compact(v, fc, ~on_plane)
            v, fc = drop_specks(v, fc, 40)
            cache[pose] = (f, v, fc, info)
        f, v, fc, info = cache[pose]
        if mirror:
            v = v * np.array([-1, 1, 1], np.float32)
            fc = fc[:, ::-1]
        role = ctx.glove['role'] if ctx.glove else 'paint_skin'
        color = ctx.glove['color'] if ctx.glove else b['skin']
        shader = 'fabric' if ctx.glove else 'skin'
        part = MeshPart(name, role, color, f, shader, {'kind': 'hand', 'pose': pose}, layer=0, mirror=mirror, side=side,
                        kind='grip' if 'grip' in name else 'hands', fabric=(ctx.glove or {}).get('fabric', 'leather'))
        part.verts, part.faces = v.copy(), fc.copy()
        ctx.hand_tips[name] = info['tips']
        if pose == 'grip':
            ctx.grip_axis = info['grip']
        out.append(part)
        log('meshed %-14s %7d quads' % (name, len(fc)))
    return out


def build(spec, out_path, work_dir, quality=1.0, preview_path=None, bake=True, report_extra=None):
    """The whole pipeline. Returns the report dictionary."""
    started = time.time()
    os.makedirs(work_dir, exist_ok=True)
    ctx = Ctx(spec, quality)
    budget = spec.get('BUDGET', {})
    total_tris = budget.get('triangles', 16000)
    hand_tris = budget.get('hand_triangles', 1100)
    grip_tris = budget.get('grip_triangles', 900)
    parts = collect_parts(ctx)
    make_garment_fields(ctx, parts)
    mesh_parts(ctx, parts)
    remove_hidden(ctx, parts)
    hand_parts = build_hands(ctx)
    # Grip anchor: on the grip's axis inside the fist (keeps the anchor's rotation convention).
    if getattr(ctx, 'grip_axis', None):
        centre, axis = ctx.grip_axis
        bone, M = ctx.anchors['anchor_hand_r']
        M = M.copy()
        M[:3, 3] = centre
        ctx.anchors['anchor_hand_r'] = (bone, M)
        bone_l, ML = ctx.anchors['anchor_hand_l']
        ML = ML.copy()
        ML[:3, 3] = centre * np.array([-1, 1, 1])
        ctx.anchors['anchor_hand_l'] = (bone_l, ML)
    # Objects.
    for part in parts + hand_parts:
        part.obj = to_object(part.name, part.verts, part.faces)
    body_part = parts[0]
    # The body ends at the wrists where the hands begin.
    for side in ('r', 'l'):
        c, n = handmod.cut_plane(ctx.J, side, ctx.b)
        bisect_away(body_part.obj, c, n)
    # Budgets: triangles shared by visible area times each part's density weight.
    areas = {}
    for part in parts:
        v = obj_arrays(part.obj)
        f = np.array([p.vertices[:] for p in part.obj.data.polygons if len(p.vertices) == 4], np.int64)
        areas[part.name] = float(quad_areas(v, f).sum()) if len(f) else 0.0
    fixed = {'eyes': 2 * 14 * 20 * 2}
    pool = total_tris - sum(fixed.values())
    weight_sum = sum(areas[p.name] * p.weight for p in parts if p.name not in fixed)
    tri_counts = {}
    for part in parts:
        if part.name in fixed:
            tri_counts[part.name] = fixed[part.name]
            continue
        target = max(60, int(pool * areas[part.name] * part.weight / max(weight_sum, 1e-9)))
        symmetric = part.name not in ('eyes',) and part.details.get('kind') not in ('badge',)
        tri_counts[part.name] = decimate(part.obj, target, symmetric=symmetric)
    for part in hand_parts:
        tri_counts[part.name] = decimate(part.obj, grip_tris if 'grip' in part.name else hand_tris, symmetric=False)
    log('triangles ' + json.dumps(tri_counts))
    # Back onto the exact surfaces; normals from the fields.
    for part in parts + hand_parts:
        if part.name == 'eyes':
            v = obj_arrays(part.obj)
            set_normals(part.obj, None)
            continue
        v = obj_arrays(part.obj)
        if len(v) == 0:
            continue
        v = part.project(v, 2)
        set_coords(part.obj, v)
    # Hands meet the arm exactly: their open rim is moved onto the arm's cut rim.
    body_v = obj_arrays(body_part.obj)
    bidx = boundary_verts(body_part.obj)
    for part in hand_parts:
        v = obj_arrays(part.obj)
        hidx = boundary_verts(part.obj)
        side = part.side
        c, n = handmod.cut_plane(ctx.J, side, ctx.b)
        rim_b = bidx[np.abs((body_v[bidx] - c) @ n) < 0.004]
        rim_h = hidx[np.abs((v[hidx] - c) @ n) < 0.006]
        if len(rim_b) > 3 and len(rim_h) > 3:
            v[rim_h] = snap_to_polyline(v[rim_h], body_v[rim_b])
            set_coords(part.obj, v)
    for part in parts + hand_parts:
        if part.name != 'eyes':
            set_normals(part.obj, part)
    # Materials and the atlas.
    materials = {}
    for part in parts + hand_parts:
        if part.role not in materials:
            mat = bpy.data.materials.new(part.role)
            materials[part.role] = mat
        part.obj.data.materials.append(materials[part.role])
    report = {'id': spec['ID'], 'triangles_parts': tri_counts}
    if not bake:
        # Source preview: flat paint colours on the shapes, no atlas, no rig.
        for part in parts + hand_parts:
            mat = bpy.data.materials.new('preview_' + part.name)
            mat.use_nodes = True
            bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
            col = shaders.srgb_to_linear(part.color if part.name != 'eyes' else '#c8c2b8')
            bsdf.inputs['Base Color'].default_value = (col[0], col[1], col[2], 1.0)
            bsdf.inputs['Roughness'].default_value = 0.55 if part.shader != 'eye' else 0.1
            part.obj.data.materials.clear()
            part.obj.data.materials.append(mat)
        report['triangles'] = {'lod0': sum(v for k, v in tri_counts.items() if k in [p.name for p in parts])}
        report['heads_tall'] = round(float(ctx.b['height'] / ctx.b['_head']['hh']), 2)
        if preview_path:
            from . import preview
            report['preview'] = preview.render(preview_path, [p.obj for p in parts + hand_parts if p.kind != 'grip'], ctx.b['height'],
                                               tuple(ctx.b['_head']['origin'] + np.array([0, 0, 0.01])))
        report['seconds'] = round(time.time() - started, 1)
        return report
    unwrap(ctx, parts + hand_parts)
    paths = None
    if bake:
        paths = bake_textures(ctx, parts + hand_parts, work_dir, budget)
    # Skin weights.
    t = time.time()
    for part in parts + hand_parts:
        skin_weights(ctx, part)
    log('weights %.1fs' % (time.time() - t))
    # Join into the run-time's nodes.
    lod0 = join('lod0', [p.obj for p in parts])
    hands0 = join('hands_lod0', [p.obj for p in hand_parts if p.kind == 'hands'])
    grips = [p.obj for p in hand_parts if p.kind == 'grip']
    for obj in grips:
        obj.name = obj.name  # hand_r_grip, hand_l_grip
    if paths:
        swap_game_materials([lod0, hands0] + grips, paths, ctx, parts + hand_parts)
    ratios = budget.get('lod_ratios', (0.32, 0.1))
    lod1 = lod_copy(lod0, 'lod1', ratios[0])
    lod2 = lod_copy(lod0, 'lod2', ratios[1])
    hands1 = lod_copy(hands0, 'hands_lod1', 0.32)
    hands2 = lod_copy(hands0, 'hands_lod2', 0.1)
    rig = skeleton.build_armature(ctx.J)
    meshes = [lod0, lod1, lod2, hands0, hands1, hands2] + grips
    for obj in meshes:
        obj.parent = rig
        mod = obj.modifiers.new('rig', 'ARMATURE')
        mod.object = rig
    anchors = skeleton.add_anchors(rig, ctx.anchors)
    report.update(measure(ctx, meshes, rig))
    if out_path:
        report.update(export(ctx, rig, meshes, anchors, out_path, report))
    if preview_path:
        from . import preview
        tint_for_preview()
        for obj in (lod1, lod2, hands1, hands2) + tuple(grips):
            obj.hide_render = True
        report['preview'] = preview.render(preview_path, [lod0, hands0], ctx.b['height'], tuple(ctx.b['_head']['origin'] + np.array([0, 0, 0.01])))
    report['seconds'] = round(time.time() - started, 1)
    return report


def tint_for_preview():
    """Multiplies the paint colours into the baked materials (only for a sheet, after the export)."""
    for mat in bpy.data.materials:
        tint = mat.get('paint_color')
        if tint is None or not mat.node_tree:
            continue
        tree = mat.node_tree
        bsdf = next((n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf is None or not bsdf.inputs['Base Color'].is_linked:
            continue
        src = bsdf.inputs['Base Color'].links[0].from_socket
        mix = tree.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs[0].default_value = 1.0
        tree.links.new(src, mix.inputs[6])
        mix.inputs[7].default_value = tuple(tint)
        tree.links.new(mix.outputs[2], bsdf.inputs['Base Color'])


def set_normals(obj, part):
    me = obj.data
    me.polygons.foreach_set('use_smooth', np.ones(len(me.polygons), bool))
    if part is None:
        me.update()
        return
    v = obj_arrays(obj)
    g = part.gradient(v)
    me.normals_split_custom_set_from_vertices([tuple(x) for x in g])
    me.update()


def unwrap(ctx, parts, margin=0.003):
    """One atlas over every part: projected islands, scaled by each part's texel priority, packed."""
    objs = [p.obj for p in parts]
    for obj in objs:
        layers = obj.data.uv_layers
        while len(layers):
            layers.remove(layers[0])
        layers.new(name='atlas')
    _select(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale()
    bpy.ops.object.mode_set(mode='OBJECT')
    priority = {'body': 1.7, 'eyes': 4.0, 'hair': 1.0, 'beard': 1.3}
    for p in parts:
        k = priority.get(p.name, 1.0)
        if p.kind in ('hands',):
            k = 1.15
        if p.kind == 'grip':
            k = 0.75
        if p.details.get('kind') == 'badge':
            k = 3.0
        if p.details.get('kind') == 'shoe':
            k = 1.0
        if k != 1.0:
            uv = p.obj.data.uv_layers[0].data
            a = np.empty(len(uv) * 2, np.float32)
            uv.foreach_get('uv', a)
            uv.foreach_set('uv', a * k)
    _select(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(margin=margin, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')


def _select(objs):
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def tri_data(obj):
    me = obj.data
    me.calc_loop_triangles()
    n = len(me.loop_triangles)
    loops = np.empty(n * 3, np.int64)
    me.loop_triangles.foreach_get('loops', loops)
    vidx = np.empty(n * 3, np.int64)
    me.loop_triangles.foreach_get('vertices', vidx)
    co = obj_arrays(obj)
    uv = np.empty(len(me.loops) * 2, np.float32)
    me.uv_layers[0].data.foreach_get('uv', uv)
    uv = uv.reshape(-1, 2)
    cn = np.empty(len(me.loops) * 3, np.float32)
    me.corner_normals.foreach_get('vector', cn) if hasattr(me, 'corner_normals') else None
    cn = cn.reshape(-1, 3)
    return co[vidx].reshape(n, 3, 3), uv[loops].reshape(n, 3, 2), cn[loops].reshape(n, 3, 3)


def bake_textures(ctx, parts, work_dir, budget):
    size = budget.get('atlas', 2048)
    t0 = time.time()
    raster = texels.Raster(size)
    tri_part, offset = [], 0
    data = []
    for i, part in enumerate(parts):
        pos, uv, nrm = tri_data(part.obj)
        texels.rasterize(uv, size, raster, offset)
        data.append((pos, uv, nrm))
        tri_part.append(np.full(len(pos), i, np.int32))
        offset += len(pos)
    tri_part = np.concatenate(tri_part)
    pos = np.concatenate([d[0] for d in data])
    uvs = np.concatenate([d[1] for d in data])
    nrm = np.concatenate([d[2] for d in data])
    gu, gv = texels.tangent_frames(pos, uvs)
    log('rasterised %d triangles in %.1fs' % (len(pos), time.time() - t0))
    mask = raster.tri >= 0
    ys, xs = np.nonzero(mask)
    tri = raster.tri[ys, xs]
    bary = raster.bary[ys, xs]
    P = np.einsum('nk,nkj->nj', bary, pos[tri]).astype(np.float32)
    N = np.einsum('nk,nkj->nj', bary, nrm[tri]).astype(np.float32)
    N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-9
    base = np.zeros((size, size, 3), np.float32)
    rough = np.zeros((size, size), np.float32)
    metal = np.zeros((size, size), np.float32)
    nmap = np.zeros((size, size, 3), np.float32)
    owner = tri_part[tri]
    shading_normal = np.zeros_like(P)
    surface = np.zeros_like(P)
    for i, part in enumerate(parts):
        sel = np.nonzero(owner == i)[0]
        if not len(sel):
            continue
        t = time.time()
        Pp = P[sel]
        if part.name != 'eyes':
            Pp = part.project(Pp, 2)
            G = part.gradient(Pp)
            bad = ~np.isfinite(G).all(axis=1) | (np.sum(G * N[sel], axis=1) < 0.2)
            G[bad] = N[sel][bad]
        else:
            G = N[sel]
        shader = shaders.SHADERS[part.shader]
        out = shader(ctx, Pp, G, part)
        n_final = shaders.perturb(Pp, G, out['height'])
        b = out['base']
        if part.role == 'atlas' and part.shader not in ('eye',):
            b = b * shaders.srgb_to_linear(part.color)[None].astype(np.float32)
        base[ys[sel], xs[sel]] = b
        rough[ys[sel], xs[sel]] = out['rough']
        metal[ys[sel], xs[sel]] = out['metal']
        nmap[ys[sel], xs[sel]] = texels.encode_normals(n_final, N[sel], gu[tri[sel]], gv[tri[sel]])
        shading_normal[sel] = n_final
        surface[sel] = Pp
        log('shaded %-14s %8d texels %.1fs' % (part.name, len(sel), time.time() - t))
    # Occlusion from every field, at a quarter of the texels (then spread to all).
    t = time.time()
    fields = [p for p in parts if p.kind == 'lod0']

    def scene(X):
        d = np.full(len(X), 9.0, np.float32)
        for p in fields:
            d = np.minimum(d, p.eval(X))
        return d
    stride = 3
    sub = np.nonzero((ys % stride == 0) & (xs % stride == 0))[0]
    occ = np.zeros(len(sub), np.float32)
    for h, w in ((0.006, 0.5), (0.016, 0.3), (0.035, 0.18), (0.07, 0.1)):
        X = surface[sub] + shading_normal[sub] * h
        d = scene(X)
        occ += w * np.clip((h - d) / h, 0, 1)
    ao_sub = np.clip(1.0 - 1.1 * occ, 0.15, 1.0)
    ao_img = np.ones((size, size), np.float32)
    ao_img[ys[sub], xs[sub]] = ao_sub
    filled = np.zeros((size, size), bool)
    filled[ys[sub], xs[sub]] = True
    ao3, _ = texels.dilate(ao_img[..., None], filled, steps=stride + 1)
    ao = ao3[..., 0]
    log('occlusion %.1fs' % (time.time() - t))
    shade = 1.0 - 0.45 * (1.0 - ao)
    color = texels.srgb(base * shade[..., None])
    orm = np.stack([ao, rough, metal], axis=-1)
    nimg = nmap * 0.5 + 0.5
    color, _ = texels.dilate(color, mask, 10)
    orm, _ = texels.dilate(orm, mask, 10)
    nimg, _ = texels.dilate(nimg, mask, 10)
    nimg[~_dilated(mask, 10)] = (0.5, 0.5, 1.0)
    paths = {
        'base': texels.save(color, os.path.join(work_dir, 'base.png'), budget.get('base_size', size)),
        'orm': texels.save(orm, os.path.join(work_dir, 'orm.png'), budget.get('orm_size', size // 2)),
        'normal': texels.save(nimg, os.path.join(work_dir, 'normal.png'), budget.get('normal_size', size)),
    }
    log('baked in %.1fs' % (time.time() - t0))
    return paths


def _dilated(mask, steps):
    m = mask.copy()
    for _ in range(steps):
        m = m | np.roll(m, 1, 0) | np.roll(m, -1, 0) | np.roll(m, 1, 1) | np.roll(m, -1, 1)
    return m


def skin_weights(ctx, part):
    obj = part.obj
    v = obj_arrays(obj)
    if len(v) == 0:
        return
    faces = poly_list(obj)
    if part.kind in ('hands', 'grip'):
        F = ctx.hand_frame
        Q = v * np.array([-1, 1, 1], np.float32) if part.mirror else v
        local = F.local(Q)
        W = weights.hand_weights(local[:, 1] * F.k, part.side)
    elif part.name in ('eyes',) or part.shader == 'hair' and part.name == 'beard':
        W = weights.rigid(len(v), 'head')
    elif part.name == 'hair':
        D = weights.bone_distances(ctx.body, v, ctx.J)
        W = weights.soft_weights(D)
        head_z = ctx.J['head'][0][2]
        up = np.clip((v[:, 2] - head_z + 0.02) / 0.04, 0, 1)
        W = W * (1 - up[:, None]) + weights.rigid(len(v), 'head') * up[:, None]
    else:
        D = weights.bone_distances(ctx.body, v, ctx.J)
        W = weights.soft_weights(D, 0.012 if part.name == 'body' else 0.014)
        W = weights.smooth(W, faces, 3)
    weights.assign(obj, W)


def join(name, objs):
    objs = [o for o in objs if o is not None and len(o.data.vertices)]
    _select(objs)
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    obj.data.name = name
    return obj


def swap_game_materials(objs, paths, ctx, parts):
    from lib import atlasbake
    colors = {}
    for p in parts:
        colors.setdefault(p.role, p.color)
    made = {}
    for obj in objs:
        for i, mat in enumerate(list(obj.data.materials)):
            role = mat.name.split('.')[0]
            if role not in made:
                tint = None
                if role.startswith('paint'):
                    tint = list(shaders.srgb_to_linear(colors[role])) + [1.0]
                m = atlasbake.game_material(role + '_game', paths, tint)
                made[role] = m
            obj.data.materials[i] = made[role]
    for role, m in made.items():
        old = bpy.data.materials.get(role)
        if old:
            old.name = role + '_source'
        m.name = role


def lod_copy(obj, name, ratio):
    copy = obj.copy()
    copy.data = obj.data.copy()
    copy.name = name
    copy.data.name = name
    bpy.context.scene.collection.objects.link(copy)
    mod = copy.modifiers.new('decimate', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get()
    new = bpy.data.meshes.new_from_object(copy.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    copy.modifiers.clear()
    old = copy.data
    copy.data = new
    new.name = name
    bpy.data.meshes.remove(old)
    return copy


def measure(ctx, meshes, rig):
    out = {'triangles': {}}
    lo, hi = np.full(3, 1e9), np.full(3, -1e9)
    for obj in meshes:
        obj.data.calc_loop_triangles()
        out['triangles'][obj.name] = len(obj.data.loop_triangles)
        v = obj_arrays(obj)
        if len(v) and obj.name in ('lod0', 'hands_lod0'):
            lo, hi = np.minimum(lo, v.min(0)), np.maximum(hi, v.max(0))
    out['bounds'] = [round(float(x), 4) for x in (lo[0], lo[2], -hi[1], hi[0], hi[2], -lo[1])]
    out['height'] = round(float(ctx.b['height']), 3)
    h = ctx.b['_head']['hh']
    out['heads_tall'] = round(float(ctx.b['height'] / h), 2)
    return out


def export(ctx, rig, meshes, anchors, out_path, report):
    import sys
    from lib import assetfile, skinpack
    scene = bpy.context.scene
    for key in list(scene.keys()):
        del scene[key]
    extras = {'asset': ctx.spec['ID'], 'kind': 'character', 'pipeline': 2, 'lods': 3, 'lod_distances': [12.0, 30.0],
              'bounds': report['bounds'], 'height': report['height']}
    for k, v in extras.items():
        scene[k] = v
    _select([rig] + meshes + anchors)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB', use_selection=True, export_image_format='WEBP',
                              export_image_quality=assetfile.IMAGE_QUALITY, export_extras=True, export_yup=True, export_apply=False,
                              export_animations=False, export_tangents=False, export_cameras=False, export_lights=False,
                              export_skins=True, export_def_bones=False, export_rest_position_armature=True,
                              export_influence_nb=4, export_leaf_bone=False, export_vertex_color='NONE')
    assetfile.patch_roles(out_path)
    raw = os.path.getsize(out_path)
    packed = skinpack.pack_skinned(out_path)
    return {'raw_bytes': raw, 'draco_primitives': packed, 'bytes': os.path.getsize(out_path)}
