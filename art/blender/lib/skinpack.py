"""Draco geometry for skinned .glb files (characters). lib/assetfile.pack_geometry leaves files with
skins alone; this packs their triangle primitives with KHR_draco_mesh_compression too: POSITION,
NORMAL, TEXCOORD_0 quantised as pack_geometry does, JOINTS_0 and WEIGHTS_0 as generic attributes
(weights stored as normalised unsigned bytes, each vertex's four summing to exactly 255). Nodes,
skins, names, materials, images and extras stay as they are. The vendored three.js DRACOLoader
decodes generic attributes by the ids written in the extension, with the accessor's type.
"""
import json

import numpy as np

from .assetfile import DRACO_BITS, _COMPONENTS, _WIDTHS, _read_glb, _write_glb

_KINDS = {0: 'POSITION', 1: 'NORMAL', 3: 'TEXCOORD_0'}
_SUPPORTED = {'POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'}


def _quantise_weights(w):
    w = np.clip(np.asarray(w, np.float64), 0, None)
    total = w.sum(axis=1, keepdims=True)
    w = np.where(total > 0, w / np.maximum(total, 1e-12), np.array([[1.0, 0, 0, 0]]))
    q = np.floor(w * 255.0 + 0.5).astype(np.int32)
    err = 255 - q.sum(axis=1)
    biggest = np.argmax(q, axis=1)
    q[np.arange(len(q)), biggest] += err
    return np.clip(q, 0, 255).astype(np.uint8)


def pack_skinned(path, bits=None):
    """Packs a skinned .glb in place. Returns the number of primitives packed (0: left as is)."""
    import DracoPy
    q = {**DRACO_BITS, **(bits or {})}
    document, binary = _read_glb(path)
    if document is None or 'KHR_draco_mesh_compression' in document.get('extensionsUsed', []):
        return 0
    views, accessors = document.get('bufferViews', []), document.get('accessors', [])
    payload = [binary[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in views]

    def array(index):
        acc = accessors[index]
        view = views[acc['bufferView']]
        dtype = np.dtype(_COMPONENTS[acc['componentType']])
        width = _WIDTHS[acc['type']]
        start = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
        stride = view.get('byteStride', dtype.itemsize * width)
        if stride != dtype.itemsize * width:
            raise ValueError('interleaved accessor')
        out = np.frombuffer(binary, dtype=dtype, count=acc['count'] * width, offset=start).reshape(acc['count'], width)
        if acc.get('normalized'):
            out = out.astype(np.float64) / float(np.iinfo(dtype).max)
        return out

    users = {}
    for mesh in document.get('meshes', []):
        for primitive in mesh['primitives']:
            for index in [primitive.get('indices'), *primitive.get('attributes', {}).values()]:
                if index is not None:
                    users[index] = users.get(index, 0) + 1
    packed = 0
    for mesh in document.get('meshes', []):
        for primitive in mesh['primitives']:
            attributes = primitive.get('attributes', {})
            if (primitive.get('mode', 4) != 4 or 'indices' not in primitive or 'targets' in primitive
                    or not set(attributes) <= _SUPPORTED or 'POSITION' not in attributes):
                continue
            faces = array(primitive['indices']).astype(np.uint32).reshape(-1, 3)
            points = array(attributes['POSITION']).astype(np.float64)
            options = {'quantization_bits': q['position'], 'compression_level': q['level'], 'preserve_order': False}
            if 'NORMAL' in attributes:
                options.update(normals=array(attributes['NORMAL']).astype(np.float64), normal_quantization_bits=q['normal'])
            if 'TEXCOORD_0' in attributes:
                options.update(tex_coord=array(attributes['TEXCOORD_0']).astype(np.float64), tex_coord_quantization_bits=q['uv'])
            generic = {}
            if 'JOINTS_0' in attributes:
                joints = array(attributes['JOINTS_0'])
                generic[100] = joints.astype(np.uint8 if joints.max() < 256 else np.uint16)
            if 'WEIGHTS_0' in attributes:
                generic[101] = _quantise_weights(array(attributes['WEIGHTS_0']))
            if generic:
                options['generic_attributes'] = generic
            blob = DracoPy.encode(points, faces, **options)
            decoded = DracoPy.decode(blob)
            ids = {}
            for a in decoded.attributes:
                if a['attribute_type'] in _KINDS:
                    ids[_KINDS[a['attribute_type']]] = a['unique_id']
                elif a['unique_id'] == 100:
                    ids['JOINTS_0'] = 100
                elif a['unique_id'] == 101:
                    ids['WEIGHTS_0'] = 101
            if set(ids) != set(attributes):
                continue
            payload.append(blob)
            primitive.setdefault('extensions', {})['KHR_draco_mesh_compression'] = {'bufferView': len(payload) - 1, 'attributes': ids}
            count_v = int(len(decoded.points))
            for name, index in attributes.items():
                acc = accessors[index]
                if users.get(index, 0) != 1:
                    raise ValueError('shared accessor')
                acc['count'] = count_v
                acc.pop('bufferView', None)
                acc.pop('byteOffset', None)
                if name == 'JOINTS_0':
                    acc['componentType'] = 5121 if generic[100].dtype == np.uint8 else 5123
                    acc.pop('normalized', None)
                if name == 'WEIGHTS_0':
                    acc['componentType'] = 5121
                    acc['normalized'] = True
                if name in ('POSITION',):
                    pass
            ind = accessors[primitive['indices']]
            ind['count'] = int(np.asarray(decoded.faces).size)
            ind.pop('bufferView', None)
            ind.pop('byteOffset', None)
            ind['componentType'] = 5125 if count_v > 65535 else 5123
            packed += 1
    if not packed:
        return 0
    used = {a['bufferView'] for a in accessors if 'bufferView' in a}
    used |= {i['bufferView'] for i in document.get('images', []) if 'bufferView' in i}
    used |= {p['extensions']['KHR_draco_mesh_compression']['bufferView'] for m in document.get('meshes', []) for p in m['primitives']
             if 'KHR_draco_mesh_compression' in p.get('extensions', {})}
    remap, out_views, out = {}, [], bytearray()
    for old in sorted(used):
        out += b'\x00' * ((4 - len(out) % 4) % 4)
        view = {k: v for k, v in (views[old] if old < len(views) else {}).items() if k not in ('byteOffset', 'byteLength', 'buffer', 'byteStride', 'target')}
        if old < len(views):
            for key in ('byteStride', 'target'):
                if key in views[old]:
                    view[key] = views[old][key]
        view.update(buffer=0, byteOffset=len(out), byteLength=len(payload[old]))
        remap[old] = len(out_views)
        out_views.append(view)
        out += payload[old]
    for acc in accessors:
        if 'bufferView' in acc:
            acc['bufferView'] = remap[acc['bufferView']]
    for skin in document.get('skins', []):
        pass
    for image in document.get('images', []):
        if 'bufferView' in image:
            image['bufferView'] = remap[image['bufferView']]
    for mesh in document['meshes']:
        for primitive in mesh['primitives']:
            ext = primitive.get('extensions', {}).get('KHR_draco_mesh_compression')
            if ext:
                ext['bufferView'] = remap[ext['bufferView']]
    document['bufferViews'] = out_views
    document['buffers'][0]['byteLength'] = len(out) + (4 - len(out) % 4) % 4
    for key in ('extensionsUsed', 'extensionsRequired'):
        names = document.setdefault(key, [])
        if 'KHR_draco_mesh_compression' not in names:
            names.append('KHR_draco_mesh_compression')
    _write_glb(path, document, bytes(out))
    return packed
