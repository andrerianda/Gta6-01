"""AircraftAsset: what an aircraft script registers (meshes, moving parts, anchors, collision
proxies, extras) and the pipeline that turns it into one .glb the game's asset library loads:
unwrap, bake (atlasbake.py), mirror, levels of detail, export with WebP textures, extras and
material roles patched into the file.

The naming contract is game/src/assets/contract.js: lod0 / <part>_lod0 meshes (levels 1 and 2 are
decimated from them), moving parts under their own names with the origin on the pivot, anchor_*
empties (pointing along Blender +Y, the game's -Z), col_box_* empties whose scale is the full size.
"""
import json
import os
import struct

import bpy

from . import atlasbake, meshkit
from .surfaces import role_of


class AircraftAsset:
    """The builder a script's make(a) talks to."""

    def __init__(self, asset_id, atlas=2048):
        self.id = asset_id
        self.atlas = atlas
        self.meshes = []
        self.mirrored = set()
        self.empties = []
        self.extras = {}
        self.lod_ratios = (0.45, 0.18)
        self.lod_distances = (70.0, 220.0)

    def add(self, obj, mirror=False):
        """Registers a mesh. mirror: it is the +X half; the other half is added after the bake (shared texels)."""
        self.meshes.append(obj)
        if mirror:
            self.mirrored.add(obj.name)
        return obj

    def anchor(self, name, location, rotation=(0, 0, 0), **extras):
        """An anchor_<name> empty; extras become glTF extras the game can read."""
        obj = meshkit.empty(name if name.startswith('anchor_') else 'anchor_' + name, location, rotation)
        for key, value in extras.items():
            obj[key] = value
        self.empties.append(obj)
        return obj

    def collider_box(self, name, size, location):
        """A col_box_<name> proxy of full size (x, y, z) centred on location."""
        self.empties.append(meshkit.empty('col_box_' + name, location, (0, 0, 0), size))

    def extra(self, key, value):
        """A scene extra (asset.extras in the game)."""
        self.extras[key] = value

    def lods(self, ratios=(0.45, 0.18), distances=(70.0, 220.0)):
        """Triangle shares of levels 1 and 2 and the camera distances where they take over."""
        self.lod_ratios, self.lod_distances = tuple(ratios), tuple(distances)

    # --- the pipeline -------------------------------------------------------------------------

    def finish(self, out_path, work_dir, bake=True):
        """Bakes, mirrors, makes the levels, exports. Returns the report dictionary."""
        baked = [o for o in self.meshes if any(role_of(m.name) in ('atlas', 'paint') for m in o.data.materials)]
        if bake and baked:
            atlasbake.unwrap(baked)
            paths = atlasbake.bake(baked, self.atlas, work_dir)
            atlasbake.swap_materials(baked, paths)
        for obj in self.meshes:
            if obj.name in self.mirrored:
                meshkit.mirror_x(obj)
        levels = 1
        for obj in list(self.meshes):
            if obj.name == 'lod0' or obj.name.endswith('_lod0'):
                for level, ratio in enumerate(self.lod_ratios, start=1):
                    copy = meshkit.duplicate(obj, obj.name[:-1] + str(level))
                    meshkit.decimate(copy, ratio)
                    self.meshes.append(copy)
                    levels = max(levels, level + 1)
        report = self._measure(levels)
        scene = bpy.context.scene
        for key, value in {'asset': self.id, 'kind': 'vehicle', 'lods': levels, 'lod_distances': list(self.lod_distances)[:levels - 1],
                           'bounds': report['bounds'], **self.extras}.items():
            scene[key] = value
        bpy.ops.object.select_all(action='DESELECT')
        for obj in self.meshes + self.empties:
            obj.select_set(True)
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB', use_selection=True, export_image_format='WEBP',
                                  export_image_quality=86, export_extras=True, export_yup=True, export_apply=True,
                                  export_animations=False, export_tangents=False, export_cameras=False, export_lights=False)
        patch_roles(out_path)
        report['bytes'] = os.path.getsize(out_path)
        return report

    def _measure(self, levels):
        lo, hi = [1e9] * 3, [-1e9] * 3
        triangles = [0] * levels
        for obj in self.meshes:
            for v in obj.data.vertices:
                p = obj.matrix_world @ v.co
                for i in range(3):
                    lo[i], hi[i] = min(lo[i], p[i]), max(hi[i], p[i])
            name = obj.name
            level = int(name[-1]) if name[-4:-1] == 'lod' else None
            for i in range(levels):
                if level is None or level == i:
                    triangles[i] += meshkit.triangle_count(obj)
        # Blender (x, y, z) is the game's (x, z, -y).
        bounds = [round(v, 3) for v in (lo[0], lo[2], -hi[1], hi[0], hi[2], -lo[1])]
        return {
            'id': self.id, 'triangles': triangles, 'bounds': bounds,
            'nodes': sorted(o.name for o in self.meshes), 'empties': sorted(o.name for o in self.empties),
            'materials': sorted({m.name for o in self.meshes for m in o.data.materials}),
            'draws': sum(len(o.data.materials) for o in self.meshes if not o.name[-4:] in ('lod1', 'lod2')),
        }


def patch_roles(path):
    """Writes what the exporter cannot know into the .glb: paint colours, blended glass."""
    with open(path, 'rb') as handle:
        data = handle.read()
    length = struct.unpack_from('<I', data, 12)[0]
    document = json.loads(data[20:20 + length].decode('utf-8'))
    rest = data[20 + length:]
    for material in document.get('materials', []):
        role = role_of(material.get('name', ''))
        extras = material.get('extras', {})
        pbr = material.setdefault('pbrMetallicRoughness', {})
        if role == 'paint' and 'paint_color' in extras:
            pbr['baseColorFactor'] = [round(c, 4) for c in extras['paint_color']]
        elif role == 'glass':
            factor = pbr.get('baseColorFactor', [0.1, 0.15, 0.18, 1.0])
            factor[3] = round(extras.get('alpha', 0.35), 3)
            pbr['baseColorFactor'] = factor
            material['alphaMode'] = 'BLEND'
    text = json.dumps(document, separators=(',', ':')).encode('utf-8')
    text += b' ' * ((4 - len(text) % 4) % 4)
    out = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(text) + len(rest)) + struct.pack('<I4s', len(text), b'JSON') + text + rest
    with open(path, 'wb') as handle:
        handle.write(out)
