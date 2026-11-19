"""Numbers instead of pictures: poses the finished rig the way the game does (walk, run, aim, sit
in a car, crouch) and measures how the skin and clothes deform: edge stretch (tearing) and
squash (collapse) per pose, and whether the open rims meant to stay hidden (the hands' wrists
inside the sleeves) stay under the clothes. build_characters.py --check prints the report.
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


def _dirs(side_x):
    return side_x


POSES = {
    'walk': {'thigh_r': (0.0, 0.42, -0.9), 'shin_r': (0.0, 0.1, -1.0), 'thigh_l': (0.0, -0.3, -0.95), 'shin_l': (0.0, -0.45, -0.9),
             'upper_arm_r': (0.12, -0.25, -0.96), 'forearm_r': (0.08, 0.2, -0.97), 'upper_arm_l': (-0.12, 0.3, -0.95), 'forearm_l': (-0.08, 0.55, -0.83)},
    'run': {'thigh_r': (0.0, 0.85, -0.52), 'shin_r': (0.0, -0.35, -0.94), 'thigh_l': (0.0, -0.4, -0.92), 'shin_l': (0.0, -0.95, -0.3),
            'upper_arm_r': (0.15, -0.5, -0.85), 'forearm_r': (0.1, 0.75, -0.65), 'upper_arm_l': (-0.15, 0.55, -0.82), 'forearm_l': (-0.2, 0.95, 0.25)},
    'aim': {'upper_arm_r': (0.08, 1.0, 0.0), 'forearm_r': (-0.05, 1.0, 0.02), 'upper_arm_l': (-0.35, 0.94, -0.1), 'forearm_l': (0.45, 0.9, 0.05),
            'thigh_r': (0.05, 0.0, -1.0), 'thigh_l': (-0.05, 0.1, -1.0)},
    'sit': {'thigh_r': (0.08, 1.0, -0.05), 'shin_r': (0.0, 0.1, -1.0), 'thigh_l': (-0.08, 1.0, -0.05), 'shin_l': (0.0, 0.1, -1.0),
            'upper_arm_r': (0.2, 0.65, -0.73), 'forearm_r': (-0.05, 1.0, 0.25), 'upper_arm_l': (-0.2, 0.65, -0.73), 'forearm_l': (0.05, 1.0, 0.25)},
    'crouch': {'spine': (0.0, 0.35, 0.94), 'thigh_r': (0.1, 0.95, -0.25), 'shin_r': (0.0, -0.55, -0.83), 'thigh_l': (-0.1, 0.95, -0.25),
               'shin_l': (0.0, -0.55, -0.83), 'foot_r': (0.0, 0.9, -0.43), 'foot_l': (0.0, 0.9, -0.43),
               'upper_arm_r': (0.2, 0.3, -0.93), 'forearm_r': (0.0, 0.8, -0.6), 'upper_arm_l': (-0.2, 0.3, -0.93), 'forearm_l': (0.0, 0.8, -0.6)},
    'arms_up': {'upper_arm_r': (0.5, 0.0, 0.86), 'upper_arm_l': (-0.5, 0.0, 0.86), 'forearm_r': (0.4, 0.0, 0.92), 'forearm_l': (-0.4, 0.0, 0.92)},
}


def pose(rig, targets):
    """Points the named bones along world directions (armature space), parents first."""
    from .skeleton import BONES
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    for name, _ in BONES:
        if name not in targets:
            continue
        pb = rig.pose.bones[name]
        want = Vector(targets[name]).normalized()
        current = (pb.tail - pb.head).normalized()
        R = current.rotation_difference(want).to_matrix().to_4x4()
        head = pb.head.copy()
        M = Matrix.Translation(head) @ R @ Matrix.Translation(-head) @ pb.matrix
        pb.matrix = M
        bpy.context.view_layer.update()


def evaluated(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = ev.to_mesh()
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    skin = [i for i, m in enumerate(obj.data.materials) if m and m.name.startswith('paint_skin')]
    polys = [tuple(p.vertices) for p in me.polygons if p.material_index not in skin]
    ev.to_mesh_clear()
    return co, polys


def edges_of(obj):
    me = obj.data
    e = np.empty(len(me.edges) * 2, np.int64)
    me.edges.foreach_get('vertices', e)
    return e.reshape(-1, 2)


def run(rig, lod0, hands, ctx):
    out = {}
    rest0, polys0 = evaluated(lod0)
    resth, _ = evaluated(hands)
    e0, eh = edges_of(lod0), edges_of(hands)
    bm = bmesh.new()
    bm.from_mesh(hands.data)
    rim = np.array([v.index for v in bm.verts if v.is_boundary], np.int64)
    bm.free()
    L0 = np.linalg.norm(rest0[e0[:, 0]] - rest0[e0[:, 1]], axis=1) + 1e-9
    Lh = np.linalg.norm(resth[eh[:, 0]] - resth[eh[:, 1]], axis=1) + 1e-9
    for name, targets in POSES.items():
        pose(rig, targets)
        P0, polys = evaluated(lod0)
        Ph, _ = evaluated(hands)
        r0 = np.linalg.norm(P0[e0[:, 0]] - P0[e0[:, 1]], axis=1) / L0
        rh = np.linalg.norm(Ph[eh[:, 0]] - Ph[eh[:, 1]], axis=1) / Lh
        tree = BVHTree.FromPolygons([tuple(p) for p in P0], polys)
        outside = 0
        worst = 0.0
        for i in rim:
            p = Vector(Ph[i])
            loc, nrm, idx, dist = tree.find_nearest(p)
            if loc is None:
                continue
            if (p - loc).dot(nrm) > 0.0015:
                outside += 1
                worst = max(worst, dist)
        out[name] = {
            'stretch_max': round(float(r0.max()), 2), 'stretch_p999': round(float(np.percentile(r0, 99.9)), 2),
            'squash_min': round(float(r0.min()), 2), 'over_2x': int((r0 > 2.0).sum()), 'under_0.35x': int((r0 < 0.35).sum()),
            'hands_stretch_max': round(float(rh.max()), 2), 'wrist_rim_out': int(outside), 'wrist_rim_worst_mm': round(worst * 1000, 1),
        }
    pose(rig, {})
    return out
