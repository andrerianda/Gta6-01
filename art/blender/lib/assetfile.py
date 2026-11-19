"""AircraftAsset: what an aircraft script registers (meshes, moving parts, anchors, collision
proxies, extras) and the pipeline that turns it into one .glb the game's asset library loads:
unwrap, bake (atlasbake.py), mirror, levels of detail, export with WebP textures (EXT_texture_webp:
lossy, alpha kept, read by the vendored three.js GLTFLoader without extra code; smaller than JPEG at
the same quality, so no PNG ever reaches game/), extras and material roles patched into the file,
then the triangle meshes packed with Draco (pack_geometry) unless finish(..., draco=False).

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

# Embedded texture encoding of every export (the glTF exporter's export_image_format / _quality).
IMAGE_FORMAT = 'WEBP'
IMAGE_QUALITY = 86
# Draco quantisation bits: positions (per primitive's own box: ~1 mm on a 15 m airframe), normals,
# texture coordinates (1/16 texel on a 1024 atlas), and the encoder's speed/size level (0-10).
DRACO_BITS = {'position': 14, 'normal': 10, 'uv': 14, 'level': 7}


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

    def finish(self, out_path, work_dir, bake=True, draco=True):
        """Bakes, mirrors, makes the levels, exports. Returns the report dictionary.
        draco: store the triangle meshes with KHR_draco_mesh_compression (pack_geometry; the game's
        loader decodes it). The file is left as exported when the DracoPy module is missing."""
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
        bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB', use_selection=True, export_image_format=IMAGE_FORMAT,
                                  export_image_quality=IMAGE_QUALITY, export_extras=True, export_yup=True, export_apply=True,
                                  export_animations=False, export_tangents=False, export_cameras=False, export_lights=False)
        patch_roles(out_path)
        report['raw_bytes'] = os.path.getsize(out_path)
        report['draco'] = pack_geometry(out_path) if draco else False
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


_COMPONENTS = {5121: 'u1', 5123: '<u2', 5125: '<u4', 5126: '<f4'}
_WIDTHS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
_DRACO_KINDS = {0: 'POSITION', 1: 'NORMAL', 3: 'TEXCOORD_0'}


def _read_glb(path):
    with open(path, 'rb') as handle:
        data = handle.read()
    document, binary, offset = None, b'', 12
    while offset + 8 <= len(data):
        size, kind = struct.unpack_from('<I4s', data, offset)
        chunk = data[offset + 8:offset + 8 + size]
        if kind == b'JSON':
            document = json.loads(chunk.decode('utf-8'))
        elif kind == b'BIN\x00':
            binary = chunk
        offset += 8 + size
    return document, binary


def _write_glb(path, document, binary):
    text = json.dumps(document, separators=(',', ':')).encode('utf-8')
    text += b' ' * ((4 - len(text) % 4) % 4)
    binary += b'\x00' * ((4 - len(binary) % 4) % 4)
    out = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(text) + 8 + len(binary))
    out += struct.pack('<I4s', len(text), b'JSON') + text + struct.pack('<I4s', len(binary), b'BIN\x00') + binary
    with open(path, 'wb') as handle:
        handle.write(out)


def pack_geometry(path, bits=None):
    """Rewrites a .glb with its indexed triangle primitives (POSITION / NORMAL / TEXCOORD_0) in
    KHR_draco_mesh_compression; nodes, names, materials, images and extras stay as they are, and a
    primitive this packer does not handle (other attributes, morph targets, no indices) stays plain.
    bits: overrides of DRACO_BITS. Returns True when it packed at least one primitive, False (file
    untouched) when DracoPy is not installed, the file is already packed or has skins/animations."""
    try:
        import DracoPy
        import numpy as np
    except Exception:
        return False
    q = {**DRACO_BITS, **(bits or {})}
    document, binary = _read_glb(path)
    if (document is None or 'KHR_draco_mesh_compression' in document.get('extensionsUsed', [])
            or document.get('skins') or document.get('animations') or len(document.get('buffers', [])) != 1
            or 'uri' in document['buffers'][0]):
        return False
    views, accessors = document.get('bufferViews', []), document.get('accessors', [])
    payload = [binary[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in views]

    def array(index):
        acc = accessors[index]
        view = views[acc['bufferView']]
        dtype = np.dtype(_COMPONENTS[acc['componentType']])
        width = _WIDTHS[acc['type']]
        if view.get('byteStride', dtype.itemsize * width) != dtype.itemsize * width or acc.get('sparse') or acc.get('normalized'):
            raise ValueError('interleaved, sparse or normalized accessor')
        start = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
        return np.frombuffer(binary, dtype=dtype, count=acc['count'] * width, offset=start).reshape(acc['count'], width)

    users = {}
    for mesh in document.get('meshes', []):
        for primitive in mesh['primitives']:
            for index in [primitive.get('indices'), *primitive.get('attributes', {}).values(),
                          *[i for t in primitive.get('targets', []) for i in t.values()]]:
                if index is not None:
                    users[index] = users.get(index, 0) + 1
    packed, keep_view = 0, set()
    for mesh in document.get('meshes', []):
        for primitive in mesh['primitives']:
            attributes = primitive.get('attributes', {})
            plain = (primitive.get('mode', 4) != 4 or 'indices' not in primitive or 'targets' in primitive
                     or 'POSITION' not in attributes or not set(attributes) <= {'POSITION', 'NORMAL', 'TEXCOORD_0'}
                     or any('bufferView' not in accessors[i] for i in [primitive['indices'], *attributes.values()]))
            if not plain:
                try:
                    faces = array(primitive['indices']).astype(np.uint32).reshape(-1, 3)
                    points = array(attributes['POSITION']).astype(np.float64)
                    options = {'quantization_bits': q['position'], 'compression_level': q['level'], 'preserve_order': False}
                    if 'NORMAL' in attributes:
                        options.update(normals=array(attributes['NORMAL']).astype(np.float64), normal_quantization_bits=q['normal'])
                    if 'TEXCOORD_0' in attributes:
                        options.update(tex_coord=array(attributes['TEXCOORD_0']).astype(np.float64), tex_coord_quantization_bits=q['uv'])
                    blob = DracoPy.encode(points, faces, **options)
                    decoded = DracoPy.decode(blob)
                    ids = {_DRACO_KINDS[a['attribute_type']]: a['unique_id'] for a in decoded.attributes
                           if a['attribute_type'] in _DRACO_KINDS}
                    if set(ids) != set(attributes) or len(decoded.faces) == 0:
                        raise ValueError('decoded attributes differ')
                except Exception:  # anything the encoder refuses stays plain
                    plain = True
            if plain:
                for index in [primitive.get('indices'), *attributes.values(), *[i for t in primitive.get('targets', []) for i in t.values()]]:
                    if index is not None and 'bufferView' in accessors[index]:
                        keep_view.add(index)
                continue
            payload.append(blob)
            primitive.setdefault('extensions', {})['KHR_draco_mesh_compression'] = {'bufferView': len(payload) - 1, 'attributes': ids}
            # The accessors describe the decoded data (Draco drops degenerate faces, may merge vertices).
            counts = {primitive['indices']: int(np.asarray(decoded.faces).size)}
            counts.update({index: int(len(decoded.points)) for index in attributes.values()})
            for index, count in counts.items():
                if users.get(index, 0) == 1:
                    accessors[index]['count'] = count
            packed += 1
    if not packed:
        return False
    for mesh in document.get('meshes', []):
        for primitive in mesh['primitives']:
            if 'KHR_draco_mesh_compression' in primitive.get('extensions', {}):
                for index in [primitive['indices'], *primitive['attributes'].values()]:
                    if index not in keep_view:
                        accessors[index].pop('bufferView', None)
                        accessors[index].pop('byteOffset', None)
    used = {a['bufferView'] for a in accessors if 'bufferView' in a}
    used |= {i['bufferView'] for i in document.get('images', []) if 'bufferView' in i}
    used |= {p['extensions']['KHR_draco_mesh_compression']['bufferView'] for m in document.get('meshes', []) for p in m['primitives']
             if 'KHR_draco_mesh_compression' in p.get('extensions', {})}
    remap, out_views, out = {}, [], bytearray()
    for old in sorted(used):
        out += b'\x00' * ((4 - len(out) % 4) % 4)
        view = {k: v for k, v in (views[old] if old < len(views) else {}).items() if k not in ('byteOffset', 'byteLength', 'buffer')}
        view.update(buffer=0, byteOffset=len(out), byteLength=len(payload[old]))
        remap[old] = len(out_views)
        out_views.append(view)
        out += payload[old]
    for acc in accessors:
        if 'bufferView' in acc:
            acc['bufferView'] = remap[acc['bufferView']]
    for image in document.get('images', []):
        if 'bufferView' in image:
            image['bufferView'] = remap[image['bufferView']]
    for mesh in document['meshes']:
        for primitive in mesh['primitives']:
            extension = primitive.get('extensions', {}).get('KHR_draco_mesh_compression')
            if extension:
                extension['bufferView'] = remap[extension['bufferView']]
    document['bufferViews'] = out_views
    document['buffers'][0]['byteLength'] = len(out) + (4 - len(out) % 4) % 4
    for key in ('extensionsUsed', 'extensionsRequired'):
        names = document.setdefault(key, [])
        if 'KHR_draco_mesh_compression' not in names:
            names.append('KHR_draco_mesh_compression')
    _write_glb(path, document, bytes(out))
    return True
