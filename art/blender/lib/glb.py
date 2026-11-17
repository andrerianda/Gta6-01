"""Binary glTF (.glb) reading, rewriting and measuring, in plain Python (no Blender needed).

A .glb is a 12-byte header, a JSON chunk describing the scene and one binary chunk holding every
buffer view (vertex data, indices, images). Document wraps both so the exporter can swap image
bytes for WebP, shrink vertex attributes and patch material fields, and so the build runner and
the size report can count triangles, draw calls and texture bytes of any built asset.
"""
import io
import json
import struct

import numpy as np

from . import naming

GLB_MAGIC = 0x46546C67
CHUNK_JSON = 0x4E4F534A
CHUNK_BIN = 0x004E4942

FLOAT, BYTE, UNSIGNED_BYTE, SHORT, UNSIGNED_SHORT, UNSIGNED_INT = 5126, 5120, 5121, 5122, 5123, 5125
COMPONENTS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
DTYPES = {FLOAT: np.float32, BYTE: np.int8, UNSIGNED_BYTE: np.uint8, SHORT: np.int16,
          UNSIGNED_SHORT: np.uint16, UNSIGNED_INT: np.uint32}


class Document:
    """A parsed .glb: `json` is the glTF dictionary, `views` the bytes of each buffer view."""

    def __init__(self, gltf, views):
        self.json = gltf
        self.views = views

    @classmethod
    def read(cls, path):
        with open(path, 'rb') as handle:
            data = handle.read()
        magic, _version, _length = struct.unpack_from('<III', data, 0)
        if magic != GLB_MAGIC:
            raise ValueError(f'{path} is not a binary glTF file')
        offset, gltf, binary = 12, None, b''
        while offset < len(data):
            chunk_length, chunk_type = struct.unpack_from('<II', data, offset)
            chunk = data[offset + 8:offset + 8 + chunk_length]
            if chunk_type == CHUNK_JSON:
                gltf = json.loads(chunk.decode('utf-8'))
            elif chunk_type == CHUNK_BIN:
                binary = chunk
            offset += 8 + chunk_length + (-chunk_length % 4)
        views = []
        for view in gltf.get('bufferViews', []):
            start = view.get('byteOffset', 0)
            views.append(bytes(binary[start:start + view['byteLength']]))
        return cls(gltf, views)

    def to_bytes(self):
        """The whole .glb file: views are laid out again, 4-byte aligned, offsets updated."""
        binary = bytearray()
        for view, payload in zip(self.json.get('bufferViews', []), self.views):
            binary.extend(b'\x00' * (-len(binary) % 4))
            view['buffer'] = 0
            view['byteOffset'] = len(binary)
            view['byteLength'] = len(payload)
            binary.extend(payload)
        binary.extend(b'\x00' * (-len(binary) % 4))
        self.json['buffers'] = [{'byteLength': len(binary)}]
        text = json.dumps(self.json, separators=(',', ':')).encode('utf-8')
        text += b' ' * (-len(text) % 4)
        total = 12 + 8 + len(text) + 8 + len(binary)
        out = io.BytesIO()
        out.write(struct.pack('<III', GLB_MAGIC, 2, total))
        out.write(struct.pack('<II', len(text), CHUNK_JSON))
        out.write(text)
        out.write(struct.pack('<II', len(binary), CHUNK_BIN))
        out.write(bytes(binary))
        return out.getvalue()

    def write(self, path):
        data = self.to_bytes()
        with open(path, 'wb') as handle:
            handle.write(data)
        return len(data)

    # -- extensions ---------------------------------------------------------------------------

    def use_extension(self, name, required=False):
        used = self.json.setdefault('extensionsUsed', [])
        if name not in used:
            used.append(name)
        if required:
            needed = self.json.setdefault('extensionsRequired', [])
            if name not in needed:
                needed.append(name)

    # -- images -------------------------------------------------------------------------------

    def image_bytes(self, index):
        return self.views[self.json['images'][index]['bufferView']]

    def set_image(self, index, payload, mime_type):
        """Replaces an embedded image; WebP images are referenced through EXT_texture_webp."""
        image = self.json['images'][index]
        self.views[image['bufferView']] = payload
        image['mimeType'] = mime_type
        if mime_type == 'image/webp':
            self.use_extension('EXT_texture_webp', required=True)
            for texture in self.json.get('textures', []):
                if texture.get('source') == index:
                    del texture['source']
                    texture.setdefault('extensions', {})['EXT_texture_webp'] = {'source': index}

    def texture_image(self, texture_index):
        """The image index behind a texture, whichever way it is referenced."""
        texture = self.json['textures'][texture_index]
        webp = texture.get('extensions', {}).get('EXT_texture_webp')
        return webp['source'] if webp else texture.get('source')

    # -- accessors ----------------------------------------------------------------------------

    def accessor_array(self, index):
        """An accessor's data as a (count, components) array."""
        accessor = self.json['accessors'][index]
        view = self.json['bufferViews'][accessor['bufferView']]
        components = COMPONENTS[accessor['type']]
        dtype = np.dtype(DTYPES[accessor['componentType']])
        payload = self.views[accessor['bufferView']]
        start = accessor.get('byteOffset', 0)
        stride = view.get('byteStride') or dtype.itemsize * components
        count = accessor['count']
        if stride == dtype.itemsize * components:
            flat = np.frombuffer(payload, dtype=dtype, count=count * components, offset=start)
            return flat.reshape(count, components)
        rows = np.lib.stride_tricks.as_strided(
            np.frombuffer(payload, dtype=np.uint8, offset=start),
            shape=(count, dtype.itemsize * components), strides=(stride, 1))
        return np.ascontiguousarray(rows).view(dtype).reshape(count, components)

    def quantize(self):
        """Stores normals and tangents as normalised bytes and 0..1 UVs as normalised shorts
        (KHR_mesh_quantization): about 40 % fewer vertex bytes, no visible difference."""
        done, changed = set(), False
        for mesh in self.json.get('meshes', []):
            for primitive in mesh.get('primitives', []):
                for semantic, index in primitive.get('attributes', {}).items():
                    if index in done:
                        continue
                    done.add(index)
                    changed |= self._quantize_accessor(semantic, index)
        if changed:
            self.use_extension('KHR_mesh_quantization', required=True)
        return changed

    def _quantize_accessor(self, semantic, index):
        accessor = self.json['accessors'][index]
        if accessor['componentType'] != FLOAT or 'sparse' in accessor:
            return False
        view_index = accessor['bufferView']
        sharing = sum(1 for other in self.json['accessors'] if other.get('bufferView') == view_index)
        if sharing != 1:
            return False
        data = self.accessor_array(index)
        view = self.json['bufferViews'][view_index]
        if semantic in ('NORMAL', 'TANGENT'):
            packed = np.zeros((len(data), 4), dtype=np.int8)
            packed[:, :data.shape[1]] = np.clip(np.round(data * 127.0), -127, 127).astype(np.int8)
            accessor['componentType'] = BYTE
            view['byteStride'] = 4
        elif semantic.startswith('TEXCOORD_'):
            if len(data) == 0 or data.min() < 0.0 or data.max() > 1.0:
                return False
            packed = np.round(data * 65535.0).astype(np.uint16)
            accessor['componentType'] = UNSIGNED_SHORT
            view['byteStride'] = 4
        else:
            return False
        accessor['normalized'] = True
        accessor['byteOffset'] = 0
        accessor.pop('min', None)
        accessor.pop('max', None)
        self.views[view_index] = packed.tobytes()
        return True


def statistics(document, file_bytes=None):
    """Measures an asset: triangles and draw calls per level of detail, textures, names, bytes."""
    gltf = document.json
    nodes = gltf.get('nodes', [])
    meshes = gltf.get('meshes', [])
    accessors = gltf.get('accessors', [])
    parents = {}
    for index, node in enumerate(nodes):
        for child in node.get('children', []):
            parents[child] = index

    def level_of(index):
        while index is not None:
            level = naming.lod_level(nodes[index].get('name', ''))
            if level is not None:
                return level
            index = parents.get(index)
        return None

    def hidden(index):
        while index is not None:
            if naming.is_collider(nodes[index].get('name', '')):
                return True
            index = parents.get(index)
        return False

    levels, always = {}, {'triangles': 0, 'draws': 0, 'vertices': 0}
    collider_triangles = 0
    for index, node in enumerate(nodes):
        if 'mesh' not in node:
            continue
        triangles = draws = vertices = 0
        for primitive in meshes[node['mesh']].get('primitives', []):
            if 'indices' in primitive:
                triangles += accessors[primitive['indices']]['count'] // 3
            else:
                triangles += accessors[primitive['attributes']['POSITION']]['count'] // 3
            vertices += accessors[primitive['attributes']['POSITION']]['count']
            draws += 1
        if hidden(index):
            collider_triangles += triangles
            continue
        level = level_of(index)
        bucket = always if level is None else levels.setdefault(
            level, {'triangles': 0, 'draws': 0, 'vertices': 0})
        bucket['triangles'] += triangles
        bucket['draws'] += draws
        bucket['vertices'] += vertices
    if not levels:
        levels[0] = {'triangles': 0, 'draws': 0, 'vertices': 0}
    lods = []
    for level in sorted(levels):
        lods.append({key: levels[level][key] + always[key] for key in always})

    images = []
    for index, image in enumerate(gltf.get('images', [])):
        payload = document.image_bytes(index)
        width = height = 0
        try:
            from PIL import Image
            with Image.open(io.BytesIO(payload)) as opened:
                width, height = opened.size
        except Exception:
            pass
        images.append({'name': image.get('name', f'image{index}'), 'width': width,
                       'height': height, 'bytes': len(payload),
                       'mime': image.get('mimeType', '')})
    texture_bytes = sum(image['bytes'] for image in images)
    total = file_bytes if file_bytes is not None else len(document.to_bytes())
    names = [node.get('name', '') for node in nodes]
    return {
        'lods': lods,
        'triangles': lods[0]['triangles'],
        'draws': lods[0]['draws'],
        'vertices': lods[0]['vertices'],
        'collider_triangles': collider_triangles,
        'images': images,
        'texture_bytes': texture_bytes,
        'geometry_bytes': total - texture_bytes,
        'bytes': total,
        'nodes': names,
        'anchors': [name for name in names if naming.is_anchor(name)],
        'colliders': [name for name in names if naming.is_collider(name)],
        'materials': [material.get('name', '') for material in gltf.get('materials', [])],
        'animations': [animation.get('name', '') for animation in gltf.get('animations', [])],
        'skins': len(gltf.get('skins', [])),
        'extras': (gltf.get('scenes') or [{}])[0].get('extras', {}),
    }
