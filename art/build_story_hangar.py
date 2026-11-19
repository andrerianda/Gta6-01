"""Builds the final mission's hangar models with Blender's Python (bpy), from the repository root:

    /opt/marazul-blender/bin/python art/build_story_hangar.py hangar_interior_set --preview
    /opt/marazul-blender/bin/python art/build_story_hangar.py --all --preview
    /opt/marazul-blender/bin/python art/build_story_hangar.py --contact

Each asset is a make_<id>(a, work_dir) (or make) in art/blender/story/hangar/, registered on a
StoryAsset: the naval pipeline's builder (art/blender/naval/_naval_asset.py over art/blender/lib)
with two additions: the atlas unwrap gives meshes their 'texel' share (lettering gets more texels),
and the meshes named in a.merge_static become ONE mesh 'lod0' after the bake. A build writes
game/assets/story/<id>.glb (the only file it writes in the repository) and prints a one-line JSON
report; --preview renders the asset's own camera views (PREVIEWS below) into the scratch directory
/tmp/marazul/flight/s3/art-hangar/preview/, and --contact pastes them into hangar.jpg and kit.jpg.
"""
import importlib
import json
import math
import os
import struct
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SCRATCH = '/tmp/marazul/flight/s3/art-hangar'
for folder in ('', 'naval', 'military', 'aircraft', os.path.join('story', 'hangar')):
    sys.path.insert(0, os.path.join(HERE, 'blender', folder))

# id: (module, function, atlas, kind)
ASSETS = {
    'hangar_interior_set': ('hangar_interior_set', 'make', 2048, 'building'),
    'aircraft_covers_manta': ('aircraft_covers', 'make_manta', 1024, 'prop'),
    'aircraft_covers_garza': ('aircraft_covers', 'make_garza', 512, 'prop'),
    'tarpaulin_curtain': ('tarpaulin_curtain', 'make', 1024, 'prop'),
    'helmet_visor_rim': ('helmet_rims', 'make_visor', 512, 'prop'),
    'pressure_helmet_rim': ('helmet_rims', 'make_pressure', 512, 'prop'),
    'pilot_arm_fp': ('pilot_kit', 'make_arm', 1024, 'prop'),
    'suit_cooler': ('pilot_kit', 'make_cooler', 512, 'prop'),
}
EYE = ((0.0, 0.0, 0.0), (0.0, 1.0, 0.0), 60.0)
# Preview views: camera position, target, vertical field of view; 'light' = an inside lamp (position, watts).
PREVIEWS = {
    'hangar_interior_set': {'cell': (640, 270), 'open': 1 / 3, 'views': [
        {'cam': ((0.0, -23.0, 1.7), (0.0, 26.0, 5.5), 62.0), 'world': 9.0},
        {'cam': ((-24.0, -22.0, 6.0), (10.0, 20.0, 4.0), 70.0), 'world': 2.0, 'light': ((0.0, -6.0, 10.5), 220000.0)}]},
    'aircraft_covers_manta': {'with': 'manta_sombra', 'views': [{'cam': ((7.5, 17.0, 5.6), (1.2, 6.0, 2.6), 42.0)}]},
    'aircraft_covers_garza': {'with': 'garza_negra', 'views': [{'cam': ((9.0, 21.0, 4.2), (1.6, 10.5, 2.0), 42.0)}]},
    'tarpaulin_curtain': {'views': [{'cam': ((7.0, -24.0, 5.0), (0.0, 0.0, 6.4), 42.0)}]},
    'helmet_visor_rim': {'views': [{'cam': EYE}], 'backdrop': True},
    'pressure_helmet_rim': {'views': [{'cam': EYE}], 'backdrop': True},
    'pilot_arm_fp': {'views': [{'cam': ((0.42, 0.0, 0.42), (0.0, 0.24, 0.0), 40.0)}]},
    'suit_cooler': {'views': [{'cam': ((0.75, -0.75, 0.55), (0.0, 0.0, 0.17), 40.0)}]},
}


def builder(asset_id, atlas, kind):
    import bpy
    import _hk
    import _naval_asset
    from lib import atlasbake, meshkit

    atlasbake.unwrap = _hk.weighted_unwrap

    class StoryAsset(_naval_asset.NavalAsset):
        merge_static = None

        def finish(self, out_path, work_dir, bake=True):
            original = _naval_asset.swap_materials

            def swap(objs, paths):
                made = original(objs, paths)
                if self.merge_static:
                    chosen = [o for o in self.meshes if o.name in self.merge_static]
                    rest = [o for o in self.meshes if o.name not in self.merge_static]
                    merged = meshkit.join('lod0', chosen)
                    atlasbake._merge_slots(merged)
                    self.meshes = [merged] + rest
                return made

            _naval_asset.swap_materials = swap
            try:
                report = super().finish(out_path, work_dir, bake)
            finally:
                _naval_asset.swap_materials = original
            whiten_glass(out_path)
            report['bytes'] = os.path.getsize(out_path)
            return report

    return StoryAsset(asset_id, atlas, kind)


def whiten_glass(path):
    """A textured glass material (glass_visor) carries its tint in the texture: factor 1, 1, 1."""
    with open(path, 'rb') as handle:
        data = handle.read()
    length = struct.unpack_from('<I', data, 12)[0]
    document = json.loads(data[20:20 + length].decode('utf-8'))
    rest = data[20 + length:]
    for material in document.get('materials', []):
        pbr = material.get('pbrMetallicRoughness', {})
        if material.get('name', '').startswith('glass') and 'baseColorTexture' in pbr:
            pbr['baseColorFactor'] = [1.0, 1.0, 1.0, 1.0]
            material['doubleSided'] = True
    text = json.dumps(document, separators=(',', ':')).encode('utf-8')
    text += b' ' * ((4 - len(text) % 4) % 4)
    out = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(text) + len(rest)) + struct.pack('<I4s', len(text), b'JSON') + text + rest
    with open(path, 'wb') as handle:
        handle.write(out)


def render_views(asset_id, spec, samples):
    """Renders the asset's preview views side by side into preview/<id>.jpg."""
    import bpy
    from mathutils import Vector
    from PIL import Image
    scene = bpy.context.scene
    cell = spec.get('cell', (320, 180))
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = cell
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    world = scene.world or bpy.data.worlds.new('preview_world')
    scene.world = world
    world.use_nodes = True
    background = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    background.inputs['Color'].default_value = (1.0, 0.86, 0.7, 1.0) if asset_id == 'hangar_interior_set' else (0.55, 0.62, 0.72, 1.0)
    for obj in scene.objects:
        if obj.type == 'MESH':
            obj.hide_render = obj.name.startswith('col_')
    if 'with' in spec:
        try:   # the aircraft itself, for judging the fit (this Blender's importer may refuse the file)
            bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'game', 'assets', 'aircraft', spec['with'] + '.glb'))
        except Exception as error:
            print('preview without the aircraft:', str(error)[-80:])
        for obj in scene.objects:
            if obj.type == 'MESH' and (obj.name[-4:-1] == 'lod' and obj.name[-1] != '0' or obj.name.endswith('_blur')):
                obj.hide_render = True
    if 'open' in spec:
        travel = scene['door_travel'] * spec['open']
        scene.objects['door_l'].location.x -= travel
        scene.objects['door_r'].location.x += travel
    if spec.get('backdrop'):
        bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 25, 0), rotation=(math.radians(90), 0, 0))
        plane = bpy.context.active_object
        material = bpy.data.materials.new('backdrop')
        material.use_nodes = True
        tree = material.node_tree
        shader = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
        checker = tree.nodes.new('ShaderNodeTexChecker')
        checker.inputs['Scale'].default_value = 14.0
        checker.inputs['Color1'].default_value = (0.75, 0.7, 0.6, 1)
        checker.inputs['Color2'].default_value = (0.35, 0.45, 0.6, 1)
        tree.links.new(checker.outputs['Color'], shader.inputs['Base Color'])
        plane.data.materials.append(material)
    sun_data = bpy.data.lights.new('preview_sun', 'SUN')
    sun_data.energy = 3.0
    sun = bpy.data.objects.new('preview_sun', sun_data)
    sun.rotation_euler = (math.radians(50), 0, math.radians(150))
    if asset_id != 'hangar_interior_set':
        scene.collection.objects.link(sun)
    camera_data = bpy.data.cameras.new('preview_camera')
    camera_data.sensor_fit = 'VERTICAL'
    camera_data.clip_start, camera_data.clip_end = 0.02, 500.0
    camera = bpy.data.objects.new('preview_camera', camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    tiles = []
    for index, view in enumerate(spec['views']):
        location, target, fov = view['cam']
        camera_data.angle_y = math.radians(fov)
        camera.location = location
        camera.rotation_euler = (Vector(target) - Vector(location)).to_track_quat('-Z', 'Y').to_euler()
        background.inputs['Strength'].default_value = view.get('world', 1.0)
        lamp = None
        if 'light' in view:
            lamp_data = bpy.data.lights.new('preview_lamp', 'POINT')
            lamp_data.energy = view['light'][1]
            lamp_data.shadow_soft_size = 1.0
            lamp = bpy.data.objects.new('preview_lamp', lamp_data)
            lamp.location = view['light'][0]
            scene.collection.objects.link(lamp)
        tile = os.path.join(SCRATCH, 'preview', '_%s_%d.png' % (asset_id, index))
        scene.render.filepath = tile
        bpy.ops.render.render(write_still=True)
        tiles.append(tile)
        if lamp is not None:
            bpy.data.objects.remove(lamp, do_unlink=True)
    sheet = Image.new('RGB', (cell[0], cell[1] * len(tiles)))
    for index, tile in enumerate(tiles):
        sheet.paste(Image.open(tile).convert('RGB'), (0, index * cell[1]))
        os.remove(tile)
    path = os.path.join(SCRATCH, 'preview', asset_id + '.jpg')
    sheet.save(path, quality=80)
    return path


def contact():
    """hangar.jpg (the hangar's two views) and kit.jpg (the seven small assets, two a row)."""
    from PIL import Image
    out = {}
    source = os.path.join(SCRATCH, 'preview', 'hangar_interior_set.jpg')
    if os.path.exists(source):
        Image.open(source).save(os.path.join(SCRATCH, 'hangar.jpg'), quality=76)
        out['hangar'] = os.path.join(SCRATCH, 'hangar.jpg')
    tiles = [Image.open(p) for p in (os.path.join(SCRATCH, 'preview', i + '.jpg') for i in ASSETS if i != 'hangar_interior_set') if os.path.exists(p)]
    if tiles:
        sheet = Image.new('RGB', (640, 180 * ((len(tiles) + 1) // 2)))
        for index, tile in enumerate(tiles):
            sheet.paste(tile, ((index % 2) * 320, (index // 2) * 180))
        sheet.save(os.path.join(SCRATCH, 'kit.jpg'), quality=76)
        out['kit'] = os.path.join(SCRATCH, 'kit.jpg')
    return out


def main(argv):
    options = {a for a in argv if a.startswith('--')}
    ids = [a for a in argv if not a.startswith('--')]
    os.makedirs(os.path.join(SCRATCH, 'preview'), exist_ok=True)
    if '--contact' in options and not ids and '--all' not in options:
        print(json.dumps(contact()))
        return
    if '--all' in options:
        ids = list(ASSETS)
    import bpy
    for asset_id in ids:
        started = time.time()
        module_name, function, atlas, kind = ASSETS[asset_id]
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.context.preferences.addons.get('cycles') or bpy.ops.preferences.addon_enable(module='cycles')
        module = importlib.import_module(module_name)
        work_dir = os.path.join(SCRATCH, asset_id)
        os.makedirs(work_dir, exist_ok=True)
        a = builder(asset_id, atlas, kind)
        getattr(module, function)(a, work_dir)
        report = a.finish(os.path.join(ROOT, 'game', 'assets', 'story', asset_id + '.glb'), work_dir)
        if '--preview' in options:
            report['preview'] = render_views(asset_id, PREVIEWS[asset_id], 20 if asset_id != 'hangar_interior_set' else 48)
        report['seconds'] = round(time.time() - started, 1)
        print(json.dumps(report))
    if '--contact' in options:
        print(json.dumps(contact()))


if __name__ == '__main__':
    main(sys.argv[1:])
