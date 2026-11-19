"""AssetBuilder: what an asset script talks to, and the pipeline that finishes the asset.

An asset script defines ASSET (its id, kind and options) and make(a). In make() it models
meshes with procedural materials and registers them:

    a.add(obj)                      a visual mesh: unwrapped, baked into the atlas and exported
    a.add(obj, sources=[high])      ... taking its surface from high-detail meshes
    a.add_piece(obj, ...)           baked like a part but not exported: a source of texture
                                    for geometry made later in assemble(a)
    a.add_copy(name, source, ...)   another node that reuses a part's mesh (wheels)
    a.add_anchor(name, location)    a named point and direction for the game
    a.collider_box(...), a.collider_cylinder(...), ...   collision proxies
    a.auto_lods(ratios, distances)  decimated levels of detail of every *_lod0 part
    a.bake(size=..., bevel_radius=...)   bake options

The build runner then calls a.finish(): unwrap and pack, bake, make the game materials, run the
script's optional assemble(a), make the levels of detail, export and measure.
"""
import os
import time

import bpy  # noqa: F401  (must come first: importing bpy is what makes mathutils importable)
from mathutils import Matrix, Vector

from . import (PIPELINE_VERSION, bake, export, gamemat, lod, modify, naming, report, rig, scene,
               shading, uv)


class _Part:
    def __init__(self, obj, sources, unwrap, texel_scale, mirror, exported):
        self.obj = obj
        self.sources = list(sources or [])
        self.unwrap = unwrap
        self.texel_scale = texel_scale
        self.mirror = mirror
        self.exported = exported
        self.rect = None


class AssetBuilder:
    """Collects the parts of one asset and runs the pipeline on them."""

    def __init__(self, spec, output_path, work_dir, module=None):
        self.spec = spec
        self.id = spec['id']
        self.kind = spec['kind']
        self.budget = report.budget_for(spec)
        self.output_path = output_path
        self.work_dir = work_dir
        self.module = module
        self.parts = []
        self.rigs = []
        self.extra_objects = []        # anchors, colliders, rigs and already-baked meshes
        self.copies = []
        self.extras = {}
        self.lod_ratios = None
        self.lod_distances = None
        self.settings = bake.BakeSettings(size=spec.get('atlas', self.budget['atlas']))
        self.texture_sizes = {}
        self.occlusion_in_color = 0.3
        self.tangents = None
        self.tight_pack = False
        self.material_texels = {}
        self.quantize = True
        self.compress = True
        self.animations = False
        self.groups = []
        self.texture_set = None
        self.density = 0.0
        self.timings = {}
        self._baked = False
        self._stand_ins = []
        self._sources_seen = False

    # -- registration -------------------------------------------------------------------------

    def add(self, obj, sources=None, unwrap='auto', texel_scale=1.0, mirror=None):
        """Registers a visual mesh. Its object name is its node name in the game.

        sources: high-detail meshes whose surface (shape, materials, occlusion) is baked onto
        this mesh; the mesh itself then needs no material.
        unwrap: 'auto' (keep the mesh builders' UVs, project faces without any), 'smart',
        'seams', 'cube', 'cylinder', 'sphere' or 'keep' (see uv.unwrap).
        texel_scale: texel density relative to the rest of the asset (2.0 = twice as sharp).
        mirror: 'X', 'Y' or 'Z' to model one half only: the half is baked (shaded by a mirrored
        stand-in) and then mirrored about its origin, so both halves share the same texels.
        """
        if self._baked:
            raise RuntimeError('add() after the bake: use add_baked() in assemble()')
        naming.check_node_name(obj.name)
        self.parts.append(_Part(obj, sources, unwrap, texel_scale, mirror, exported=True))
        return obj

    def add_piece(self, obj, sources=None, unwrap='keep', texel_scale=1.0):
        """Registers a mesh that is baked but not exported: a swatch of texture. In assemble(a),
        piece_rect(name) gives its place in the atlas for the uv_rect of new geometry."""
        if self._baked:
            raise RuntimeError('add_piece() must be called from make(), before the bake')
        self.parts.append(_Part(obj, sources, unwrap, texel_scale, None, exported=False))
        return obj

    def add_baked(self, obj):
        """Registers a mesh made in assemble(a) from baked pieces: it already has final
        materials (a.material(...)) and UVs inside piece rectangles."""
        naming.check_node_name(obj.name)
        self.extra_objects.append(obj)
        return obj

    def add_copy(self, name, source, location=(0.0, 0.0, 0.0), rotation_z=0.0, mirror_x=False):
        """Adds a node `name` at `location` that reuses the mesh of the part `source` (one mesh
        in the file, one bake). With a rotation or mirror the node is an unrotated pivot holding
        the turned copy, so the game can spin it about the same local axes as the original."""
        naming.check_node_name(name)
        self.copies.append((name, source, Vector(location), rotation_z, mirror_x))

    def add_anchor(self, name, location, forward=None, up=(0.0, 0.0, 1.0), parent=None, **props):
        """Adds an anchor empty. `forward` is the way it points (a light's beam, an exhaust's
        jet, the way a seated driver faces), in Blender axes; props become glTF extras."""
        if not naming.is_anchor(name):
            raise ValueError(f'anchor name {name!r} must start with {naming.ANCHOR_PREFIX!r}')
        naming.check_node_name(name)
        empty = scene.add_empty(name, location, forward=forward, up=up, parent=parent)
        for key, value in props.items():
            empty[key] = value
        self.extra_objects.append(empty)
        return empty

    def _collider_empty(self, name, location, scale, rotation_z):
        naming.check_node_name(name)
        empty = scene.add_empty(name, location)
        empty.empty_display_type = 'CUBE'
        empty.empty_display_size = 0.5
        empty.rotation_euler = (0.0, 0.0, rotation_z)
        empty.scale = scale
        self.extra_objects.append(empty)
        return empty

    def collider_box(self, name, centre, size, rotation_z=0.0):
        """A box proxy col_box_<name>: full `size` (x, y, z) in metres about `centre`."""
        return self._collider_empty(f'col_box_{name}', centre, size, rotation_z)

    def collider_cylinder(self, name, centre, radius, height):
        """An upright cylinder proxy col_cyl_<name> centred on `centre`."""
        return self._collider_empty(f'col_cyl_{name}', centre, (radius * 2, radius * 2, height), 0.0)

    def collider_sphere(self, name, centre, radius):
        """A sphere proxy col_sphere_<name>."""
        return self._collider_empty(f'col_sphere_{name}', centre, (radius * 2,) * 3, 0.0)

    def collider_mesh(self, name, obj, convex=True):
        """A mesh proxy: col_hull_<name> (the game uses its convex hull) or col_mesh_<name>
        (its triangles). Keep it to a few dozen triangles; it is never drawn."""
        obj.name = f'col_hull_{name}' if convex else f'col_mesh_{name}'
        obj.data.name = obj.name
        naming.check_node_name(obj.name)
        obj.data.materials.clear()
        self.extra_objects.append(obj)
        return obj

    def add_rig(self, armature, animations=True):
        """Registers a skeleton made with lib.rig; meshes bound to it are added with add() as
        usual and are baked in the rest pose. Its actions are exported as animation clips."""
        self.extra_objects.append(armature)
        self.rigs.append(armature)
        self.animations = animations
        return armature

    def auto_lods(self, ratios=(0.45, 0.15), distances=(25.0, 60.0)):
        """After the bake, every part named *_lod0 gets decimated copies *_lod1, *_lod2 keeping
        `ratios` of its triangles; the game switches at `distances` metres."""
        self.lod_ratios = tuple(ratios)
        self.lod_distances = [float(distance) for distance in distances]

    def set_lod_distances(self, *distances):
        """The camera distances (metres) at which the game switches to level 1, 2, ..."""
        self.lod_distances = [float(distance) for distance in distances]

    def bake(self, orm_size=None, normal_size=None, emissive_size=None, occlusion_in_color=None,
             tangents=None, quantize=None, tight_pack=None, material_texels=None, compress=None,
             **settings):
        """Overrides bake options: any field of bake.BakeSettings (size, bevel_radius,
        occlusion_distance, occlusion_ground, cage_extrusion, ...), the stored size of the
        packed, normal and emissive maps, how much occlusion is multiplied into the base colour
        (0..1), whether tangents are exported (default: when a part has sources),
        tight_pack=True to pack UV islands by outline (denser, slower), and material_texels, a
        dictionary of source material name -> texel density factor (2.0 gives the faces of that
        material twice the resolution: a label, a face, a dashboard), and compress=False to
        keep the geometry out of Draco (it is on by default; see art/README.md)."""
        if tight_pack is not None:
            self.tight_pack = tight_pack
        if material_texels:
            self.material_texels.update(material_texels)
        for key, value in settings.items():
            if not hasattr(self.settings, key):
                raise ValueError(f'unknown bake setting {key!r}')
            setattr(self.settings, key, value)
        for kind, size in (('orm', orm_size), ('normal', normal_size), ('emissive', emissive_size)):
            if size:
                self.texture_sizes[kind] = size
        if occlusion_in_color is not None:
            self.occlusion_in_color = occlusion_in_color
        if tangents is not None:
            self.tangents = tangents
        if quantize is not None:
            self.quantize = quantize
        if compress is not None:
            self.compress = compress

    def set_extra(self, key, value):
        """Stores a value in the asset's extras (gltf.scene.userData in the game)."""
        self.extras[key] = value

    # -- after the bake -----------------------------------------------------------------------

    def material(self, name=naming.ROLE_ATLAS):
        """A final game material by name ('atlas', 'cutout', 'paint', 'lamp_main', ...)."""
        for group in self.groups:
            if group.name == name:
                return group.material
        raise KeyError(f'{self.id} has no game material {name!r}; it has '
                       f'{[group.name for group in self.groups]}')

    def piece_rect(self, name):
        """The atlas rectangle (u0, v0, u1, v1) of a baked piece or part, by object name."""
        for part in self.parts:
            if part.obj.name == name:
                return part.rect
        raise KeyError(f'{self.id} has no baked part or piece named {name!r}')

    # -- pipeline -----------------------------------------------------------------------------

    def source_objects(self):
        """What a source preview shows: every part as modelled, high-detail sources in place of
        the low meshes they are baked onto."""
        shown = []
        for part in self.parts:
            shown.extend(part.sources if part.sources else [part.obj])
        return shown

    def finish(self):
        """Runs the whole pipeline; returns {'stats', 'budget', 'problems', 'timings'}."""
        started = time.time()
        if not self.parts:
            raise ValueError(f'{self.id}: make() registered no parts')
        targets = self._prepare()
        self._stage('unwrap', self._unwrap_and_pack)
        self._stage('bake', lambda: self._bake(targets))
        self._after_bake()
        if self.module is not None and hasattr(self.module, 'assemble'):
            self.module.assemble(self)
        visuals = self._finalize_objects()
        stats = self._stage('export', lambda: self._export(visuals))
        self.timings['total'] = time.time() - started
        return {'stats': stats, 'budget': self.budget, 'problems': report.check(stats, self.budget),
                'timings': dict(self.timings), 'density': self.density}

    def _stage(self, name, action):
        started = time.time()
        result = action()
        self.timings[name] = time.time() - started
        return result

    def _prepare(self):
        """Checks the parts, bakes transforms into the meshes and sets up mirror stand-ins."""
        self._stand_ins = []
        self._sources_seen = any(part.sources and part.exported for part in self.parts)
        for skeleton in self.rigs:
            rig.rest(skeleton, True)                        # bake in the rest pose
        targets = []
        for part in self.parts:
            obj = part.obj
            if obj.type != 'MESH' or not obj.data.polygons:
                raise ValueError(f'{self.id}: part {obj.name!r} is not a mesh with faces')
            if not part.sources and not obj.material_slots:
                raise ValueError(f'{self.id}: part {obj.name!r} has no material')
            if not part.sources and any(slot.material is None for slot in obj.material_slots):
                raise ValueError(f'{self.id}: part {obj.name!r} has an empty material slot')
            if not any(modifier.type == 'ARMATURE' for modifier in obj.modifiers):
                export.reset_for_export([obj])
            if part.sources and not obj.material_slots:
                obj.data.materials.append(part.sources[0].material_slots[0].material)
            if part.mirror:
                axis = 'XYZ'.index(part.mirror.upper())
                stand_in = scene.duplicate(obj, f'{obj.name}_mirror_stand_in')
                flip = [-1.0 if index == axis else 1.0 for index in range(3)]
                modify.transform(stand_in, scale=flip)
                self._stand_ins.append(stand_in)
            targets.append(bake.BakeTarget(obj, part.sources))
        return targets

    def _unwrap_and_pack(self):
        objects = [part.obj for part in self.parts]
        self.groups = gamemat.plan(objects)
        packed = []
        for part in self.parts:
            obj = part.obj
            shading.triangulate(obj)
            # Glass and tile faces stay out of the atlas: hidden faces are not unwrapped or packed.
            hidden = uv.hide_faces(obj, lambda polygon, obj=obj: not gamemat.in_atlas(
                obj.material_slots[polygon.material_index].material))
            if hidden < len(obj.data.polygons):
                uv.unwrap(obj, method=part.unwrap)
                packed.append(obj)
        scales = {part.obj.name: part.texel_scale for part in self.parts}
        # Pieces keep their islands whole and upright, so piece_rect() means what it says.
        free = all(part.exported for part in self.parts)
        if packed:
            self.density = uv.pack(packed, size=self.settings.size, texel_scales=scales,
                                   tight=self.tight_pack, rotate=free, split_long=free,
                                   material_scales=self.material_texels)
        tile_sizes = gamemat.tile_sizes(self.groups)
        for part in self.parts:
            part.rect = uv.uv_rect(part.obj)
            uv.show_all_faces(part.obj)
            uv.project_tiles(part.obj, tile_sizes)

    def _bake(self, targets):
        objects = [part.obj for part in self.parts]
        self.settings.emission_divisors = gamemat.emission_divisors(self.groups)
        baked = [target for target in targets if self._has_atlas_faces(target.obj)]
        atlas_maps = bake.bake_maps(baked, self.settings) if baked else None
        tile_maps = {group.name: bake.bake_tile(group.sources[0], group.tile_size,
                                                group.tile_pixels, self.settings, group.tile_facing)
                     for group in self.groups if group.role == naming.ROLE_TILE}
        self.texture_set = gamemat.make_textures(
            self.id, atlas_maps, tile_maps, self.groups, self.work_dir, sizes=self.texture_sizes,
            occlusion_in_color=self.occlusion_in_color)
        gamemat.build(objects, self.groups, self.texture_set)
        self._baked = True

    @staticmethod
    def _has_atlas_faces(obj):
        return any(gamemat.in_atlas(slot.material) for slot in obj.material_slots)

    def _after_bake(self):
        """Removes what only the bake needed and completes mirrored parts."""
        scene.delete(*self._stand_ins)
        sources = []
        for part in self.parts:
            sources += [source for source in part.sources if source not in sources]
            part.sources = []
            if part.mirror:
                modify.mirror(part.obj, axis=part.mirror, merge=True)
        scene.delete(*sources)

    def _finalize_objects(self):
        """Levels of detail, copies and the final list of objects to export."""
        visuals = [part.obj for part in self.parts if part.exported]
        scene.delete(*[part.obj for part in self.parts if not part.exported])
        visuals += [obj for obj in self.extra_objects if obj.type == 'MESH'
                    and not naming.is_collider(obj.name)]
        if self.lod_ratios:
            for obj in list(visuals):
                if lod.split_name(obj.name)[1] == 0:
                    visuals += lod.make_levels(obj, self.lod_ratios)
        lod.check_levels(visuals)
        for name, source, location, rotation_z, mirror_x in self.copies:
            visuals += self._make_copy(name, source, location, rotation_z, mirror_x)
        others = [obj for obj in self.extra_objects if obj not in visuals]
        return visuals + others

    def _make_copy(self, name, source, location, rotation_z, mirror_x):
        if abs(rotation_z) < 1e-9 and not mirror_x:
            copy = scene.duplicate(source, name, linked=True)
            copy.matrix_world = Matrix.Translation(location)
            return [copy]
        pivot = scene.add_empty(name, location)
        copy = scene.duplicate(source, f'{name}_mesh', linked=True)
        copy.parent = pivot
        copy.matrix_parent_inverse = Matrix.Identity(4)
        copy.location = (0.0, 0.0, 0.0)
        copy.rotation_euler = (0.0, 0.0, rotation_z)
        copy.scale = (-1.0 if mirror_x else 1.0, 1.0, 1.0)
        return [pivot, copy]

    def _export(self, objects):
        meshes = [obj for obj in objects if obj.type == 'MESH' and obj.data.users == 1
                  and not any(modifier.type == 'ARMATURE' for modifier in obj.modifiers)]
        export.reset_for_export(meshes)
        low, high = scene.world_bounds([obj for obj in objects if obj.type == 'MESH'
                                        and not naming.is_collider(obj.name)])
        extras = {
            'asset': self.id,
            'kind': self.kind,
            'pipeline': PIPELINE_VERSION,
            'lods': lod.level_count(objects),
            'texel_density': round(self.density, 1),
            # Bounds in game axes (x, y up, z = -Blender y): [min x, min y, min z, max x, ...].
            'bounds': [round(value, 4) for value in
                       (low.x, low.z, -high.y, high.x, high.z, -low.y)],
        }
        if self.lod_distances:
            extras['lod_distances'] = self.lod_distances
        extras.update(self.extras)
        tangents = self._sources_seen if self.tangents is None else self.tangents
        for skeleton in self.rigs:
            rig.rest(skeleton, False)                       # the exporter samples the actions
        return export.export_glb(self.output_path, objects, extras=extras,
                                 texture_set=self.texture_set, tangents=tangents,
                                 animations=self.animations, quantize=self.quantize,
                                 compress=self.compress)


def run(module, output_path, work_dir):
    """Builds one asset module from a clean scene: returns AssetBuilder.finish()'s result."""
    scene.reset_scene()
    os.makedirs(work_dir, exist_ok=True)
    builder = AssetBuilder(module.ASSET, output_path, work_dir, module=module)
    module.make(builder)
    return builder.finish()


def build_source(module):
    """Runs only the modelling of an asset module and returns the objects to preview, with
    their procedural materials: fast feedback before any bake."""
    scene.reset_scene()
    builder = AssetBuilder(module.ASSET, '', '', module=module)
    module.make(builder)
    return builder.source_objects()
