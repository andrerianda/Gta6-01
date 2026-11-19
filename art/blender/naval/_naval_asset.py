"""NavalAsset: the builder for the ship, the military road vehicles and the island hangar. It wraps
the aircraft pipeline's AircraftAsset (art/blender/lib/assetfile.py, frozen) and adds what these
assets need:

  part(obj)            a moving part in the road-vehicle contract: a child of lod0, level 0 only
                       (wheel_fl, door_fl, hood, bumper_f, steering_wheel, window_front ...)
  source(obj)          a mesh that is baked but only used to build lower levels (simple stand-ins)
  attach(obj, target)  a mesh with its own UVs and an unbaked material (the cutout net and the
                       railings); it is joined into the target mesh after the bake
  level(n, plan)       level n is ONE merged mesh 'lod<n>' made of copies of the named meshes, each
                       decimated to its ratio: plan = [(name, ratio), ...]

Cutout materials (cutout*, alpha tested and double sided in the game) carry a texture with alpha
that the script painted itself; the exporter's file is patched so they are alphaMode MASK.
"""
import json
import os
import struct

import bpy

from lib import assetfile, atlasbake, meshkit
from lib.surfaces import role_of as _lib_role


def role_of(name):
    """The lib's roles plus 'cutout' (the frozen lib takes a cutout material for an atlas one)."""
    if name == 'cutout' or name.startswith('cutout_'):
        return 'cutout'
    return _lib_role(name)


def swap_materials(objs, paths):
    """atlasbake.swap_materials with ONE baked twin per paint material shared by several meshes."""
    made, twins = {}, {}
    for obj in objs:
        for index, source in enumerate(list(obj.data.materials)):
            pointer = source.as_pointer()
            if pointer not in twins:
                role = role_of(source.name)
                if role not in ('atlas', 'paint'):
                    continue
                key = source.name if role == 'paint' else 'atlas'
                if key not in made:
                    tint = source.get('paint_color') if role == 'paint' else None
                    if role == 'paint':
                        source.name = 'source_of_' + key
                    made[key] = atlasbake.game_material(key, paths, tint)
                twins[pointer] = made[key]
            obj.data.materials[index] = twins[pointer]
        atlasbake._merge_slots(obj)
    return made


class NavalAsset(assetfile.AircraftAsset):
    """The builder a naval script's make(a) talks to."""

    def __init__(self, asset_id, atlas=1024, kind='vehicle'):
        super().__init__(asset_id, atlas)
        self.kind = kind
        self.children = []
        self.sources = []
        self.attached = []
        self.plans = {}
        self.lod_distances = (40.0, 110.0)

    def part(self, obj):
        self.meshes.append(obj)
        self.children.append(obj)
        return obj

    def source(self, obj):
        self.sources.append(obj)
        return obj

    def attach(self, obj, target='lod0'):
        self.attached.append((obj, target))
        return obj

    def level(self, number, plan):
        self.plans[number] = list(plan)

    def distances(self, *metres):
        self.lod_distances = tuple(metres)

    # --- the pipeline -------------------------------------------------------------------------

    def finish(self, out_path, work_dir, bake=True):
        baked = [o for o in self.meshes + self.sources
                 if any(role_of(m.name) in ('atlas', 'paint') for m in o.data.materials)]
        if bake and baked:
            atlasbake.unwrap(baked, margin=0.003)
            paths = atlasbake.bake(baked, self.atlas, work_dir)
            swap_materials(baked, paths)
        by_name = {o.name: o for o in self.meshes + self.sources}
        for obj, target in self.attached:
            name = obj.name
            layer = obj.data.uv_layers[0]
            layer.name = by_name[target].data.uv_layers[0].name if by_name[target].data.uv_layers else 'atlas'
            joined = meshkit.join(target, [by_name[target], obj])
            by_name[target] = joined
            by_name[name] = None
        levels = 1
        level_meshes = []
        for number in sorted(self.plans):
            copies = []
            for name, ratio in self.plans[number]:
                copy = meshkit.duplicate(by_name[name], '%s_for_lod%d' % (name, number))
                if ratio < 0.999:
                    meshkit.decimate(copy, ratio)
                copies.append(copy)
            merged = meshkit.join('lod%d' % number, copies)
            # A copy of a moving part carries its pivot: the merged level sits at the origin.
            bpy.ops.object.select_all(action='DESELECT')
            merged.select_set(True)
            bpy.context.view_layer.objects.active = merged
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            meshkit.set_origin(merged, (0, 0, 0))
            atlasbake._merge_slots(merged)
            level_meshes.append(merged)
            levels = max(levels, number + 1)
        body = by_name.get('lod0')
        for child in self.children:
            child.parent = body
        exported = self.meshes + level_meshes
        report = self._report(exported, levels)
        scene = bpy.context.scene
        for key, value in {'asset': self.id, 'kind': self.kind, 'lods': levels,
                           'lod_distances': list(self.lod_distances)[:levels - 1], 'bounds': report['bounds'], **self.extras}.items():
            scene[key] = value
        for obj in self.sources:
            obj.hide_render = True
        bpy.ops.object.select_all(action='DESELECT')
        for obj in exported + self.empties:
            obj.select_set(True)
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB', use_selection=True, export_image_format='WEBP',
                                  export_image_quality=84, export_extras=True, export_yup=True, export_apply=True,
                                  export_animations=False, export_tangents=False, export_cameras=False, export_lights=False)
        assetfile.patch_roles(out_path)
        patch_cutouts(out_path)
        report['bytes'] = os.path.getsize(out_path)
        return report

    def _report(self, exported, levels):
        lo, hi = [1e9] * 3, [-1e9] * 3
        triangles, draws = [0] * levels, [0] * levels
        children = {o.name for o in self.children}
        for obj in exported:
            for v in obj.data.vertices:
                p = obj.matrix_world @ v.co
                for i in range(3):
                    lo[i], hi[i] = min(lo[i], p[i]), max(hi[i], p[i])
            name = obj.name
            level = int(name[-1]) if name[-4:-1] == 'lod' else (0 if name in children else None)
            for i in range(levels):
                if level is None or level == i:
                    triangles[i] += meshkit.triangle_count(obj)
                    draws[i] += len(obj.data.materials)
        bounds = [round(v, 3) for v in (lo[0], lo[2], -hi[1], hi[0], hi[2], -lo[1])]
        return {
            'id': self.id, 'triangles': triangles, 'draws': draws, 'bounds': bounds,
            'nodes': sorted(o.name for o in exported), 'empties': sorted(o.name for o in self.empties),
            'materials': sorted({m.name for o in exported for m in o.data.materials}),
        }


def patch_cutouts(path):
    """Marks the cutout materials of a .glb alpha tested and double sided."""
    with open(path, 'rb') as handle:
        data = handle.read()
    length = struct.unpack_from('<I', data, 12)[0]
    document = json.loads(data[20:20 + length].decode('utf-8'))
    rest = data[20 + length:]
    for material in document.get('materials', []):
        if role_of(material.get('name', '')) == 'cutout':
            material['alphaMode'] = 'MASK'
            material['alphaCutoff'] = 0.5
            material['doubleSided'] = True
    text = json.dumps(document, separators=(',', ':')).encode('utf-8')
    text += b' ' * ((4 - len(text) % 4) % 4)
    out = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(text) + len(rest)) + struct.pack('<I4s', len(text), b'JSON') + text + rest
    with open(path, 'wb') as handle:
        handle.write(out)
