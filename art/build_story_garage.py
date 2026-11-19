"""Builds the night office of Tolliver Tow and the hand props of the final arc's cinematics with
Blender's Python (bpy), from the repository root:

    /opt/marazul-blender/bin/python art/build_story_garage.py foreclosure_letter --preview
    /opt/marazul-blender/bin/python art/build_story_garage.py all --preview
    /opt/marazul-blender/bin/python art/build_story_garage.py --contact

Each art/blender/story/garage/<id>.py holds ASSET = {'id', 'atlas', 'kind', 'views'} and
make(a, work_dir), which models the asset on a StoryAsset (art/blender/story/garage/_story_kit.py).
A build bakes, writes game/assets/story/<id>.glb (the only file it writes in the repository) and
prints a one-line JSON report. --preview renders a JPEG tile into the scratch directory (the office
from inside, under a warm lamp and a cold window); --contact pastes the props' tiles into props.jpg.
MARAZUL_STORY_ATLAS=0.5 halves the atlases and MARAZUL_STORY_AO=6 lowers the samples for quick tries.
"""
import importlib.util
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SCRATCH = '/tmp/marazul/flight/s3/art-garage'
PROPS = ('foreclosure_letter', 'framed_pilot_photo', 'bank_seal_notice', 'forged_pass_card', 'uniform_on_hanger', 'payment_case')
ALL = ('garage_office_set',) + PROPS
sys.path.insert(0, os.path.join(HERE, 'blender'))
sys.path.insert(0, os.path.join(HERE, 'blender', 'story', 'garage'))


def contact_sheet():
    """The props' tiles in one sheet 640 px wide."""
    from PIL import Image
    tiles = [Image.open(p) for p in (os.path.join(SCRATCH, 'preview', i + '.jpg') for i in PROPS) if os.path.exists(p)]
    rows = (len(tiles) + 1) // 2
    out = Image.new('RGB', (640, 240 * rows))
    for index, tile in enumerate(tiles):
        out.paste(tile.resize((320, 240)), ((index % 2) * 320, (index // 2) * 240))
    path = os.path.join(SCRATCH, 'props.jpg')
    out.save(path, quality=80)
    return path


def office_sheet(path, shots):
    """The office from inside: a warm practical at the desk lamp, a cold light through the window."""
    import bpy
    from mathutils import Vector
    from PIL import Image
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 320, 240
    scene.render.image_settings.file_format = 'PNG'
    world = scene.world or bpy.data.worlds.new('night')
    scene.world = world
    world.use_nodes = True
    background = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    background.inputs['Color'].default_value = (0.02, 0.03, 0.06, 1.0)
    background.inputs['Strength'].default_value = 0.4

    def light(kind, location, energy, colour, size=0.1, rotation=(0, 0, 0)):
        data = bpy.data.lights.new('preview_light', kind)
        data.energy, data.color = energy, colour
        if kind == 'AREA':
            data.size = size
        else:
            data.shadow_soft_size = size
        obj = bpy.data.objects.new('preview_light', data)
        obj.location = location
        obj.rotation_euler = [math.radians(a) for a in rotation]
        scene.collection.objects.link(obj)

    lamp = bpy.data.objects.get('lamp_desk')
    spot = lamp.location if lamp else Vector((1.0, 0.0, 1.2))
    light('POINT', (spot.x, spot.y, spot.z - 0.08), 60.0, (1.0, 0.72, 0.42), 0.04)
    light('POINT', (0.0, 0.0, 2.6), 18.0, (1.0, 0.8, 0.6), 0.3)
    light('AREA', (1.3, 3.6, 1.9), 420.0, (0.55, 0.7, 1.0), 1.8, (-78, 0, 180))
    light('AREA', (-2.25, 3.4, 1.5), 90.0, (0.55, 0.7, 1.0), 0.8, (-90, 0, 180))
    data = bpy.data.cameras.new('preview_camera')
    data.clip_start = 0.03
    camera = bpy.data.objects.new('preview_camera', data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    tiles = []
    for index, (eye, target, lens) in enumerate(shots):
        data.lens = lens
        camera.location = eye
        camera.rotation_euler = (Vector(target) - Vector(eye)).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(SCRATCH, 'preview', '_office%d.png' % index)
        bpy.ops.render.render(write_still=True)
        tiles.append(scene.render.filepath)
    sheet = Image.new('RGB', (640, 240 * ((len(tiles) + 1) // 2)))
    for index, tile in enumerate(tiles):
        sheet.paste(Image.open(tile).convert('RGB'), ((index % 2) * 320, (index // 2) * 240))
        os.remove(tile)
    sheet.save(path, quality=80)
    return path


def load_script(asset_id):
    spec = importlib.util.spec_from_file_location('story_' + asset_id, os.path.join(HERE, 'blender', 'story', 'garage', asset_id + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main(argv):
    options = {word for word in argv if word.startswith('--')}
    ids = [word for word in argv if not word.startswith('--')]
    if 'all' in ids:
        ids = list(ALL)
    if 'props' in ids:
        ids = list(PROPS)
    os.makedirs(os.path.join(SCRATCH, 'preview'), exist_ok=True)
    if ids:
        import bpy
        import _story_kit
        from lib import previewsheet
    for asset_id in ids:
        started = time.time()
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.context.preferences.addons.get('cycles') or bpy.ops.preferences.addon_enable(module='cycles')
        module = load_script(asset_id)
        work_dir = os.path.join(SCRATCH, asset_id)
        os.makedirs(work_dir, exist_ok=True)
        a = _story_kit.StoryAsset(module.ASSET['id'], module.ASSET.get('atlas', 1024), module.ASSET.get('kind', 'prop'))
        module.make(a, work_dir)
        report = a.finish(os.path.join(ROOT, 'game', 'assets', 'story', asset_id + '.glb'), work_dir)
        if '--preview' in options:
            if 'shots' in module.ASSET:
                report['preview'] = office_sheet(os.path.join(SCRATCH, 'office.jpg'), module.ASSET['shots'])
            else:
                if hasattr(module, 'pose_for_preview'):
                    module.pose_for_preview()
                report['preview'] = previewsheet.render_sheet(os.path.join(SCRATCH, 'preview', asset_id + '.jpg'), module.ASSET['views'], (320, 240),
                                                              samples=32, columns=1, ground=module.ASSET.get('ground', True))
        report['seconds'] = round(time.time() - started, 1)
        print(json.dumps(report))
    if '--contact' in options:
        print(json.dumps({'contact': contact_sheet()}))


if __name__ == '__main__':
    main(sys.argv[1:])
