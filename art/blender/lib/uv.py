"""UV unwrapping and atlas packing at one texel density.

The pipeline calls unwrap() and pack() for every asset, so a script only needs these functions
for special cases. Because the materials are 3D procedurals, seams never show in the colour: UVs
only decide how many texels each surface gets. Hidden faces are left alone by every function
here, which is how the pipeline keeps glass and tiling faces out of the atlas.
"""
import math

import bmesh
import bpy
import numpy as np

from . import scene

UV_LAYER = 'UVMap'


def ensure_layer(obj):
    """Makes sure the mesh has an active UV layer and returns it."""
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name=UV_LAYER)
    if mesh.uv_layers.active is None:
        mesh.uv_layers.active_index = 0
    return mesh.uv_layers.active


def _edit(objects):
    """Enters edit mode on all the objects with every visible face and UV selected."""
    objects = list(objects)
    scene.activate(objects[0], objects[1:])
    bpy.context.scene.tool_settings.use_uv_select_sync = True
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')


def _object_mode():
    bpy.ops.object.mode_set(mode='OBJECT')


def unwrap(obj, method='auto', angle=math.radians(66), margin=0.004, cube_size=1.0):
    """Unwraps the visible faces of a mesh.

    method: 'auto' keeps the UVs the mesh builders wrote (clean strips and flat faces, which
    pack far tighter) and smart-projects only the faces that have none; 'smart' projects
    everything by face angle (use it for a mesh reshaped beyond its builder UVs); 'seams'
    unfolds along edges marked sharp (organic shapes); 'cube', 'cylinder' and 'sphere' project;
    'keep' touches nothing.
    """
    ensure_layer(obj)
    if method == 'keep':
        return obj
    if method == 'auto':
        uvs = read_uvs(obj)
        missing = [polygon.index for polygon in obj.data.polygons
                   if not polygon.hide and _is_stretched(obj.data, uvs, polygon)]
        if not missing:
            return obj
        _edit([obj])
        bpy.context.scene.tool_settings.mesh_select_mode = (False, False, True)
        bpy.ops.mesh.select_all(action='DESELECT')
        edit_mesh = bmesh.from_edit_mesh(obj.data)
        edit_mesh.faces.ensure_lookup_table()
        for index in missing:
            edit_mesh.faces[index].select_set(True)
        bmesh.update_edit_mesh(obj.data)
        bpy.ops.uv.smart_project(angle_limit=angle, island_margin=margin, area_weight=0.0,
                                 correct_aspect=True, scale_to_bounds=False)
        _object_mode()
        return obj
    _edit([obj])
    if method == 'smart':
        bpy.ops.uv.smart_project(angle_limit=angle, island_margin=margin, area_weight=0.0,
                                 correct_aspect=True, scale_to_bounds=False)
    elif method == 'seams':
        bpy.ops.mesh.select_all(action='DESELECT')
        bpy.ops.mesh.select_mode(type='EDGE')
        bpy.ops.mesh.edges_select_sharp(sharpness=math.radians(40))
        bpy.ops.mesh.mark_seam(clear=False)
        bpy.ops.mesh.select_mode(type='FACE')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.unwrap(method='ANGLE_BASED', margin=margin)
    elif method == 'cube':
        bpy.ops.uv.cube_project(cube_size=cube_size, correct_aspect=True, scale_to_bounds=False)
    elif method == 'cylinder':
        bpy.ops.uv.cylinder_project(direction='ALIGN_TO_OBJECT', align='POLAR_ZX',
                                    correct_aspect=True, scale_to_bounds=False)
    elif method == 'sphere':
        bpy.ops.uv.sphere_project(direction='ALIGN_TO_OBJECT', align='POLAR_ZX',
                                  correct_aspect=True, scale_to_bounds=False)
    else:
        _object_mode()
        raise ValueError(f'unknown unwrap method {method!r}')
    _object_mode()
    return obj


def read_uvs(obj):
    """The active UV layer as an (loops, 2) float array."""
    layer = ensure_layer(obj)
    data = np.empty(len(obj.data.loops) * 2, dtype=np.float32)
    layer.data.foreach_get('uv', data)
    return data.reshape(-1, 2)


def write_uvs(obj, uvs):
    """Writes an (loops, 2) array back to the active UV layer."""
    layer = ensure_layer(obj)
    layer.data.foreach_set('uv', np.ascontiguousarray(uvs, dtype=np.float32).ravel())
    obj.data.update()


def scale_uvs(obj, factor):
    """Scales the object's UVs: before pack(), it gives the object `factor` times the texel
    density of the rest (2.0 for a face the player reads up close, 0.5 for an underside)."""
    write_uvs(obj, read_uvs(obj) * factor)
    return obj


def fit_uvs(obj, rect):
    """Fits the object's UVs into rect = (u0, v0, u1, v1), keeping nothing of their old place."""
    uvs = read_uvs(obj)
    low, high = uvs.min(axis=0), uvs.max(axis=0)
    span = np.maximum(high - low, 1e-9)
    target_low = np.array(rect[:2], dtype=np.float32)
    target_span = np.array([rect[2] - rect[0], rect[3] - rect[1]], dtype=np.float32)
    write_uvs(obj, (uvs - low) / span * target_span + target_low)
    return obj


def uv_rect(obj):
    """The bounding rectangle (u0, v0, u1, v1) of the object's UVs: after packing, this is where
    a baked piece lives in the atlas, ready to hand to a builder's uv_rect."""
    uvs = read_uvs(obj)
    low, high = uvs.min(axis=0), uvs.max(axis=0)
    return float(low[0]), float(low[1]), float(high[0]), float(high[1])


def split_long_islands(objects, fill=0.7, longest=0.5):
    """Cuts UV islands that are too long for a square atlas into shorter pieces.

    A pole or a pipe unwraps to one strip as long as the object, and the atlas can then be no
    denser than that strip allows. Every island longer than `longest` times the side of the
    ideal atlas (the square holding the whole surface at `fill` efficiency) is cut across into
    equal pieces; the packer then places the pieces side by side. Call after the islands have
    one common scale (pack() does this).
    """
    from bpy_extras import mesh_utils
    total_area = sum(polygon.area for obj in objects for polygon in obj.data.polygons
                     if not polygon.hide)
    if total_area <= 0.0:
        return 0
    limit = longest * math.sqrt(total_area / fill)
    cuts = 0
    for obj in objects:
        mesh = obj.data
        uvs = read_uvs(obj)
        changed = False
        for faces in mesh_utils.mesh_linked_uv_islands(mesh):
            polygons = [mesh.polygons[index] for index in faces if not mesh.polygons[index].hide]
            if not polygons:
                continue
            loops = np.concatenate([np.arange(polygon.loop_start,
                                              polygon.loop_start + polygon.loop_total)
                                    for polygon in polygons])
            low, high = uvs[loops].min(axis=0), uvs[loops].max(axis=0)
            extent = high - low
            area = sum(polygon.area for polygon in polygons)
            uv_area = sum(_uv_area(uvs, polygon) for polygon in polygons)
            if uv_area <= 1e-12 or area <= 0.0:
                continue
            axis = int(np.argmax(extent))
            length = float(extent[axis]) * math.sqrt(area / uv_area)
            if length <= limit:
                continue
            pieces = math.ceil(length / limit)
            shift = float(extent[1 - axis]) * 1.5 + float(extent[axis]) * 0.02
            used = set()
            for polygon in polygons:
                span = slice(polygon.loop_start, polygon.loop_start + polygon.loop_total)
                along = (uvs[span, axis].mean() - low[axis]) / extent[axis]
                piece = min(pieces - 1, int(along * pieces))
                used.add(piece)
                if piece:
                    uvs[span, 1 - axis] += piece * shift
                    changed = True
            if len(used) < 2:
                print(f'uv: {obj.name} has a UV island {length:.1f} m long made of faces too long '
                      f'to cut (limit {limit:.1f} m); add edge loops across it to free the atlas',
                      flush=True)
            cuts += len(used) - 1
        if changed:
            write_uvs(obj, uvs)
    return cuts


def _is_stretched(mesh, uvs, polygon, limit=4.0):
    """True when a face has no usable UVs: no area, or edges mapped at very different scales
    (what a bevel, a solidify rim or a collapsed pole leaves behind)."""
    if _uv_area(uvs, polygon) < 1e-10:
        return True
    start, count = polygon.loop_start, polygon.loop_total
    ratios = []
    for corner in range(count):
        a, b = start + corner, start + (corner + 1) % count
        length = (mesh.vertices[mesh.loops[a].vertex_index].co
                  - mesh.vertices[mesh.loops[b].vertex_index].co).length
        uv_length = float(np.linalg.norm(uvs[a] - uvs[b]))
        if length < 1e-7:
            continue
        ratios.append(uv_length / length)
    if len(ratios) < 3 or min(ratios) <= 0.0:
        return True
    return max(ratios) / min(ratios) > limit


def _uv_area(uvs, polygon):
    loops = uvs[polygon.loop_start:polygon.loop_start + polygon.loop_total]
    x, y = loops[:, 0], loops[:, 1]
    return 0.5 * abs(float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))))


def _scale_by_material(obj, material_scales):
    """Scales the UVs of the faces of each named material (a face's island should be of one
    material, or the island is distorted where the materials meet)."""
    names = [slot.material.name if slot.material else '' for slot in obj.material_slots]
    factors = [material_scales.get(name, 1.0) for name in names]
    if all(factor == 1.0 for factor in factors):
        return
    uvs = read_uvs(obj)
    for polygon in obj.data.polygons:
        factor = factors[polygon.material_index] if polygon.material_index < len(factors) else 1.0
        if factor != 1.0:
            uvs[polygon.loop_start:polygon.loop_start + polygon.loop_total] *= factor
    write_uvs(obj, uvs)


def pack(objects, size=1024, margin_px=None, texel_scales=None, rotate=True, tight=False,
         split_long=True, material_scales=None):
    """Packs the visible faces of all the objects into one 0..1 atlas at one texel density.

    Islands are first scaled to the same density (texels per metre) across every object, then
    by each object's entry in `texel_scales` (object name -> factor) and each material's entry
    in `material_scales` (material name -> factor); islands too long for a square atlas are cut
    into pieces (split_long); then everything is packed with `margin_px` pixels between islands
    at the given atlas size. Islands are only turned by quarter turns, so straight edges stay
    on the texel grid. `tight` packs by island outline instead of bounding box: a little
    denser, but seconds to minutes slower. Returns the density reached in pixels per metre.
    """
    objects = [obj for obj in objects if obj.type == 'MESH' and len(obj.data.polygons)]
    if not objects:
        return 0.0
    if margin_px is None:
        margin_px = max(3, size // 256)      # enough for clean mipmaps: bakes are filled anyway
    for obj in objects:
        ensure_layer(obj)
    _edit(objects)
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale()
    _object_mode()
    for obj in objects:
        factor = (texel_scales or {}).get(obj.name, 1.0)
        if factor != 1.0:
            scale_uvs(obj, factor)
        if material_scales:
            _scale_by_material(obj, material_scales)
    if split_long:
        split_long_islands(objects)
    _edit(objects)
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=rotate, rotate_method='CARDINAL', margin_method='FRACTION',
                            margin=margin_px / size, merge_overlap=False, scale=True,
                            shape_method='CONCAVE' if tight else 'AABB')
    _object_mode()
    return texel_density(objects, size)


def texel_density(objects, size):
    """The area-weighted mean texel density in pixels per metre over the visible faces."""
    total_area, total_uv_area = 0.0, 0.0
    for obj in objects:
        mesh = obj.data
        uvs = read_uvs(obj)
        for polygon in mesh.polygons:
            if polygon.hide:
                continue
            total_area += polygon.area
            total_uv_area += _uv_area(uvs, polygon)
    if total_area <= 0.0:
        return 0.0
    return math.sqrt(total_uv_area / total_area) * size


def project_tiles(obj, tile_sizes):
    """Gives the faces of tile materials repeating UVs in units of their tile.

    tile_sizes: material name -> tile size in metres. Walls are mapped by distance along the
    wall and height, floors and roofs by X and Y, both from the world origin, so the pattern
    runs unbroken across neighbouring faces and parts (and matches materials.Graph.wall_coords).
    """
    sizes = [tile_sizes.get(slot.material.name if slot.material else '') for slot in obj.material_slots]
    if not any(sizes):
        return obj
    mesh = obj.data
    uvs = read_uvs(obj)
    origin = obj.matrix_world.translation
    for polygon in mesh.polygons:
        size = sizes[polygon.material_index] if polygon.material_index < len(sizes) else None
        if not size:
            continue
        normal = polygon.normal
        flat = abs(normal.z) > 0.7
        horizontal = math.hypot(normal.x, normal.y) or 1.0
        for loop_index in polygon.loop_indices:
            point = mesh.vertices[mesh.loops[loop_index].vertex_index].co + origin
            if flat:
                u, v = point.x, point.y
            else:
                u = (point.y * normal.x - point.x * normal.y) / horizontal
                v = point.z
            uvs[loop_index] = (u / size, v / size)
    write_uvs(obj, uvs)
    return obj


def hide_faces(obj, select):
    """Hides the faces for which select(polygon) is true; returns how many were hidden."""
    count = 0
    for polygon in obj.data.polygons:
        polygon.hide = bool(select(polygon))
        count += polygon.hide
    return count


def show_all_faces(obj):
    """Unhides every face, edge and vertex."""
    mesh = obj.data
    for collection in (mesh.polygons, mesh.edges, mesh.vertices):
        collection.foreach_set('hide', [False] * len(collection))
    mesh.update()
