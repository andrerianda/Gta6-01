"""Binary glTF (.glb) reading, rewriting and measuring, in plain Python (no Blender needed).

A .glb is a 12-byte header, a JSON chunk describing the scene and one binary chunk holding every
buffer view (vertex data, indices, images). Document wraps both so the exporter can swap image
bytes for WebP, shrink vertex attributes, store geometry with Draco and patch material fields,
and so the build runner and the size report can count triangles, draw calls and texture bytes
of any built asset. Draco-compressed primitives keep exact accessor counts, so measuring needs
no decoder; the encoder is Google's Draco through the DracoPy package (draco_encoder()), and
Document.decompress() turns a built file back into plain geometry for the Cycles preview.
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
DRACO_LEVEL = 7             # Draco compression level 0..10 (7: the usual glTF tools' default)


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

    # -- geometry compression (KHR_draco_mesh_compression) -----------------------------------

    def compress(self, bits=None, level=DRACO_LEVEL):
        """Stores the vertices and indices of every triangle primitive with Draco, after
        quantize(): positions on one grid per mesh (so seams between its primitives stay
        closed), normals and the first UV set quantised by Draco, every other attribute
        (joints, weights, colours, tangents, second UVs) stored exactly. Each encoded primitive
        is decoded again at once and checked (attribute ids, counts, integer attributes such as
        joints unchanged) before the file is changed; one that fails keeps its plain data.
        Returns {'primitives', 'skipped', 'failed'}, or None when no encoder can be had."""
        draco = draco_encoder()
        if draco is None:
            print('glb: no Draco encoder (DracoPy); the geometry stays uncompressed', flush=True)
            return None
        bits = dict(DRACO_BITS, **(bits or {}))
        accessors = self.json.get('accessors', [])
        uses = {}
        for mesh in self.json.get('meshes', []):
            for primitive in mesh.get('primitives', []):
                for index in [primitive.get('indices'), *primitive.get('attributes', {}).values()]:
                    uses[index] = uses.get(index, 0) + 1
        # Blender's exporter shares one index list between meshes of equal topology (boxes,
        # repeated kit parts); Draco keeps indices per primitive, so each gets its own accessor.
        for mesh in self.json.get('meshes', []):
            for primitive in mesh.get('primitives', []):
                index = primitive.get('indices')
                if index is not None and uses.get(index, 0) > 1:
                    uses[index] -= 1
                    primitive['indices'] = len(accessors)
                    uses[len(accessors)] = 1
                    accessors.append(json.loads(json.dumps(accessors[index])))
        summary = {'primitives': 0, 'skipped': 0, 'failed': 0}
        for mesh in self.json.get('meshes', []):
            primitives = mesh.get('primitives', [])
            candidates = [primitive for primitive in primitives if self._compressible(primitive, uses)]
            summary['skipped'] += len(primitives) - len(candidates)
            if not candidates:
                continue
            positions = [self.accessor_array(p['attributes']['POSITION']) for p in candidates]
            low = np.min([block.min(axis=0) for block in positions], axis=0).astype(np.float64)
            high = np.max([block.max(axis=0) for block in positions], axis=0).astype(np.float64)
            extent = float(max((high - low).max(), 1e-4))
            for primitive in candidates:
                try:
                    self._compress_primitive(draco, primitive, low, extent, bits, level)
                    summary['primitives'] += 1
                except Exception as error:                  # keep the plain data, say why
                    summary['failed'] += 1
                    print(f'glb: a primitive of mesh {mesh.get("name", "?")!r} stays '
                          f'uncompressed: {error}', flush=True)
        if summary['primitives']:
            self.use_extension(DRACO_EXTENSION, required=True)
            self._prune_views()
            if not self._needs_quantization():
                for key in ('extensionsUsed', 'extensionsRequired'):
                    names = [name for name in self.json.get(key, []) if name != 'KHR_mesh_quantization']
                    if names:
                        self.json[key] = names
                    else:
                        self.json.pop(key, None)
        return summary

    def _compressible(self, primitive, uses):
        if primitive.get('mode', 4) != 4 or 'indices' not in primitive or primitive.get('targets'):
            return False
        if DRACO_EXTENSION in primitive.get('extensions', {}):
            return False
        attributes = primitive.get('attributes', {})
        if 'POSITION' not in attributes:
            return False
        accessors = self.json['accessors']
        for index in [primitive['indices'], *attributes.values()]:
            accessor = accessors[index]
            if uses.get(index, 0) != 1 or 'sparse' in accessor or 'bufferView' not in accessor:
                return False
        position = accessors[attributes['POSITION']]
        return position['componentType'] == FLOAT and position['count'] >= 3

    def _dequantized(self, index):
        """An attribute's values as floats, normalised integers mapped back to 0..1 / -1..1."""
        accessor = self.json['accessors'][index]
        data = self.accessor_array(index).astype(np.float64)
        component = accessor['componentType']
        if component != FLOAT and accessor.get('normalized'):
            data /= {BYTE: 127.0, UNSIGNED_BYTE: 255.0, SHORT: 32767.0, UNSIGNED_SHORT: 65535.0}[component]
            if component in (BYTE, SHORT):
                data = np.maximum(data, -1.0)
        return data

    def _compress_primitive(self, draco, primitive, low, extent, bits, level):
        accessors = self.json['accessors']
        attributes = primitive['attributes']
        points = self.accessor_array(attributes['POSITION']).astype(np.float64)
        faces = self.accessor_array(primitive['indices']).reshape(-1, 3).astype(np.uint32)
        options, generic, generic_semantic, to_float = {}, {}, {}, set()
        for semantic, index in attributes.items():
            component = accessors[index]['componentType']
            if semantic == 'POSITION':
                continue
            if semantic == 'NORMAL':
                options['normals'] = np.ascontiguousarray(self._dequantized(index)[:, :3])
                options['normal_quantization_bits'] = bits['normal']
                to_float.add(semantic)
            elif semantic == 'TEXCOORD_0':
                uv = self._dequantized(index)
                span = float(uv.max() - uv.min()) if len(uv) else 1.0
                # 12 bits per unit of UV: a tiling set spanning many repeats gets more bits
                more = int(np.ceil(np.log2(max(span, 1.0))))
                options['tex_coord'] = np.ascontiguousarray(uv)
                options['tex_coord_quantization_bits'] = min(bits['texcoord'] + more, 20)
                to_float.add(semantic)
            else:
                if component in (UNSIGNED_BYTE, UNSIGNED_SHORT, UNSIGNED_INT, FLOAT):
                    values = self.accessor_array(index)        # exact, the accessor keeps its type
                else:
                    values = self._dequantized(index).astype(np.float32)
                    to_float.add(semantic)
                key = len(generic)
                generic[key] = np.ascontiguousarray(values)
                generic_semantic[key] = semantic
        encoded = draco.encode(points, faces, quantization_bits=bits['position'],
                               compression_level=level, quantization_range=extent,
                               quantization_origin=[float(value) for value in low],
                               generic_attributes=generic or None, **options)
        decoded = draco.decode(encoded)
        ids, seen = {}, set()
        kinds = {0: 'POSITION', 1: 'NORMAL', 3: 'TEXCOORD_0'}
        for attribute in decoded.attributes:
            unique_id = attribute['unique_id']
            if unique_id in seen:
                raise ValueError(f'Draco attribute id {unique_id} is used twice')
            seen.add(unique_id)
            if attribute['attribute_type'] == 4:
                semantic = generic_semantic.get(unique_id)
                if semantic is not None:
                    original = generic[unique_id]
                    if original.dtype.kind in 'ui':
                        back = np.asarray(attribute['data']).astype(original.dtype).reshape(-1, original.shape[1])
                        if not np.array_equal(np.unique(back, axis=0), np.unique(original, axis=0)):
                            raise ValueError(f'{semantic} changed in the Draco round trip')
            else:
                semantic = kinds.get(attribute['attribute_type'])
            if semantic is not None:
                ids[semantic] = unique_id
        missing = set(attributes) - set(ids)
        if missing:
            raise ValueError(f'Draco lost {sorted(missing)}')
        decoded_points = np.asarray(decoded.points, dtype=np.float64).reshape(-1, 3)
        count = len(decoded_points)
        triangles = len(np.asarray(decoded.faces).reshape(-1, 3))
        if count == 0 or triangles == 0:
            raise ValueError('Draco produced an empty mesh')
        for semantic, index in attributes.items():
            accessor = accessors[index]
            accessor.pop('bufferView', None)
            accessor.pop('byteOffset', None)
            accessor['count'] = count
            if semantic in to_float:
                accessor['componentType'] = FLOAT
                accessor.pop('normalized', None)
                accessor.pop('min', None)
                accessor.pop('max', None)
        position = accessors[attributes['POSITION']]
        position['min'] = [float(value) for value in decoded_points.min(axis=0)]
        position['max'] = [float(value) for value in decoded_points.max(axis=0)]
        indices = accessors[primitive['indices']]
        indices.pop('bufferView', None)
        indices.pop('byteOffset', None)
        indices['count'] = triangles * 3
        indices['componentType'] = UNSIGNED_INT if count > 65535 else UNSIGNED_SHORT
        indices.pop('min', None)
        indices.pop('max', None)
        self.json.setdefault('bufferViews', []).append({'buffer': 0, 'byteLength': len(encoded)})
        self.views.append(bytes(encoded))
        primitive.setdefault('extensions', {})[DRACO_EXTENSION] = {
            'bufferView': len(self.views) - 1, 'attributes': ids}

    def decompress(self):
        """The inverse of compress() for tools that cannot read Draco (Blender's glTF importer
        here has no Draco library): decodes every compressed primitive with the same Draco
        decoder into plain accessors and drops the extension. The vertex data is exactly what
        the game's decoder hands three.js: Float32 positions, normals and first UVs, every other
        attribute in its stored type, the same points in the same order and the same triangles.
        Returns the number of primitives decoded (0 when the file has none)."""
        compressed = [primitive for mesh in self.json.get('meshes', [])
                      for primitive in mesh.get('primitives', [])
                      if DRACO_EXTENSION in primitive.get('extensions', {})]
        if not compressed:
            return 0
        draco = draco_encoder()
        if draco is None:
            raise RuntimeError('glb: no Draco decoder (DracoPy) to read compressed geometry')
        accessors = self.json['accessors']
        for primitive in compressed:
            extension = primitive['extensions'].pop(DRACO_EXTENSION)
            if not primitive['extensions']:
                del primitive['extensions']
            decoded = draco.decode(self.views[extension['bufferView']])
            by_id = {attribute['unique_id']: attribute for attribute in decoded.attributes}
            for semantic, index in primitive['attributes'].items():
                attribute = by_id.get(extension['attributes'].get(semantic))
                if attribute is None:
                    raise ValueError(f'glb: {semantic} is missing from the Draco data')
                accessor = accessors[index]
                data = np.asarray(attribute['data'])
                values = data.reshape(len(data), -1)
                components = COMPONENTS[accessor['type']]
                if values.shape[1] != components:
                    raise ValueError(f'glb: {semantic} has {values.shape[1]} components in the '
                                     f'Draco data, {components} in its accessor')
                self._set_plain(index, values.astype(DTYPES[accessor['componentType']]), vertex=True)
            faces = np.asarray(decoded.faces).reshape(-1, 1)
            self._set_plain(primitive['indices'],
                            faces.astype(DTYPES[accessors[primitive['indices']]['componentType']]))
        self._prune_views()
        for key in ('extensionsUsed', 'extensionsRequired'):
            names = [name for name in self.json.get(key, []) if name != DRACO_EXTENSION]
            if names:
                self.json[key] = names
            else:
                self.json.pop(key, None)
        if self._needs_quantization():
            self.use_extension('KHR_mesh_quantization', required=True)
        return len(compressed)

    def _set_plain(self, index, values, vertex=False):
        """Stores (count, components) values as an accessor's own buffer view; vertex rows are
        padded to a multiple of four bytes, as glTF asks of vertex attributes."""
        accessor = self.json['accessors'][index]
        row = values.dtype.itemsize * values.shape[1]
        view = {'buffer': 0, 'byteLength': 0, 'target': 34962 if vertex else 34963}
        if vertex and row % 4:
            stride = row + (-row % 4)
            padded = np.zeros((len(values), stride), dtype=np.uint8)
            padded[:, :row] = np.ascontiguousarray(values).view(np.uint8).reshape(len(values), row)
            payload = padded.tobytes()
            view['byteStride'] = stride
        else:
            payload = np.ascontiguousarray(values).tobytes()
        self.json.setdefault('bufferViews', []).append(view)
        self.views.append(payload)
        accessor['bufferView'] = len(self.views) - 1
        accessor['byteOffset'] = 0
        accessor['count'] = len(values)

    def _prune_views(self):
        """Drops buffer views nothing refers to any more and renumbers the references."""
        gltf = self.json
        primitives = [p for mesh in gltf.get('meshes', []) for p in mesh.get('primitives', [])]
        holders = []                                        # (dictionary, key) pairs naming a view
        for accessor in gltf.get('accessors', []):
            if 'bufferView' in accessor:
                holders.append((accessor, 'bufferView'))
            sparse = accessor.get('sparse')
            if sparse:
                holders += [(sparse['indices'], 'bufferView'), (sparse['values'], 'bufferView')]
        holders += [(image, 'bufferView') for image in gltf.get('images', []) if 'bufferView' in image]
        for primitive in primitives:
            extension = primitive.get('extensions', {}).get(DRACO_EXTENSION)
            if extension:
                holders.append((extension, 'bufferView'))
        used = sorted({holder[key] for holder, key in holders})
        renumber = {old: new for new, old in enumerate(used)}
        gltf['bufferViews'] = [gltf['bufferViews'][old] for old in used]
        self.views = [self.views[old] for old in used]
        for holder, key in holders:
            holder[key] = renumber[holder[key]]

    def _needs_quantization(self):
        """True while some plain vertex attribute still uses a KHR_mesh_quantization type."""
        for mesh in self.json.get('meshes', []):
            for primitive in mesh.get('primitives', []):
                for semantic, index in primitive.get('attributes', {}).items():
                    accessor = self.json['accessors'][index]
                    component = accessor['componentType']
                    if semantic in ('POSITION', 'NORMAL', 'TANGENT') and component != FLOAT:
                        return True
                    if semantic.startswith('TEXCOORD_') and component != FLOAT and (
                            component in (BYTE, SHORT) or not accessor.get('normalized')):
                        return True
        return False


DRACO_EXTENSION = 'KHR_draco_mesh_compression'
DRACO_PACKAGE = 'DracoPy==2.2.0'
DRACO_BITS = {'position': 14, 'normal': 10, 'texcoord': 12}
_draco_module = None


def draco_encoder(install=True):
    """Google's Draco encoder through the DracoPy package, or None when it cannot be had. A
    build machine without it (a freshly rented GPU machine, whose Blender Python may not even
    have pip) installs the pinned package from PyPI into this Python on first use, under a file
    lock so that concurrent build jobs install it once."""
    global _draco_module
    if _draco_module is None:
        try:
            import DracoPy as module
        except ImportError:
            module = _install_draco() if install else None
        _draco_module = module or False
    return _draco_module or None


def _install_draco():
    import fcntl
    import importlib
    import os
    import subprocess
    import sys
    os.makedirs('/tmp/marazul/assets', exist_ok=True)
    with open('/tmp/marazul/assets/draco-install.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        importlib.invalidate_caches()
        try:
            import DracoPy as module                        # another job installed it meanwhile
            return module
        except ImportError:
            pass
        print(f'glb: installing {DRACO_PACKAGE} for geometry compression', flush=True)
        quiet = {'stdout': subprocess.DEVNULL, 'check': False}
        if subprocess.run([sys.executable, '-m', 'pip', '--version'], **quiet).returncode != 0:
            subprocess.run([sys.executable, '-m', 'ensurepip', '--upgrade'], **quiet)
        subprocess.run([sys.executable, '-m', 'pip', 'install', '--quiet',
                        '--disable-pip-version-check', DRACO_PACKAGE], check=False)
        importlib.invalidate_caches()
        try:
            import DracoPy as module
            return module
        except ImportError:
            return None


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
