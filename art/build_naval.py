"""Builds the navy picket ship, the patrol jeep, the army truck and the camouflage-net hangar with
Blender's Python (bpy), from the repository root, on the CPU:

    /opt/marazul-blender/bin/python art/build_naval.py patrol_jeep
    /opt/marazul-blender/bin/python art/build_naval.py navy_picket_ship --preview --views "40,22,1;200,35,1"
    /opt/marazul-blender/bin/python art/build_naval.py --contact /tmp/marazul/flight/s2/art-naval/preview/all.jpg

Each art/blender/naval/<id>.py holds ASSET = {'id', 'atlas', 'kind'} and make(a, work_dir), which
models the asset and registers its parts on the NavalAsset `a` (art/blender/naval/_naval_asset.py,
a wrapper of the aircraft pipeline's builder in art/blender/lib/). A build bakes, writes
game/assets/naval/<id>.glb (the only file it writes in the repository) and prints a one-line JSON
report. --preview renders a 640 px JPEG sheet of the finished asset into
/tmp/marazul/flight/s2/art-naval/preview/ (--views "azimuth,elevation,zoom[,x,y,z];...", --cell
"320x200"); --contact <file> pastes the sheets that exist there into one 640 px contact sheet and
builds nothing. Working textures land in /tmp/marazul/flight/s2/art-naval/<id>/.
"""
import importlib.util
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SCRATCH = '/tmp/marazul/flight/s2/art-naval'
ALL = ('navy_picket_ship', 'patrol_jeep', 'army_truck', 'camo_net_hangar')
sys.path.insert(0, os.path.join(HERE, 'blender'))
sys.path.insert(0, os.path.join(HERE, 'blender', 'naval'))


def contact_sheet(path):
    """Stacks the per-asset sheets (as many as exist) into one image 640 px wide."""
    from PIL import Image
    sheets = [Image.open(p) for p in (os.path.join(SCRATCH, 'preview', i + '.jpg') for i in ALL) if os.path.exists(p)]
    out = Image.new('RGB', (640, sum(s.height for s in sheets)))
    top = 0
    for sheet in sheets:
        out.paste(sheet, (0, top))
        top += sheet.height
    out.save(path, quality=74)
    return path


def load_script(asset_id):
    spec = importlib.util.spec_from_file_location('naval_' + asset_id, os.path.join(HERE, 'blender', 'naval', asset_id + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def parse_views(text):
    views = []
    for part in text.split(';'):
        numbers = [float(v) for v in part.split(',')]
        views.append((numbers[0], numbers[1], numbers[2]) + ((tuple(numbers[3:6]),) if len(numbers) >= 6 else ()))
    return views


def main(argv):
    options, ids = {}, []
    index = 0
    while index < len(argv):
        word = argv[index]
        if word in ('--views', '--cell', '--contact'):
            options[word] = argv[index + 1]
            index += 1
        elif word.startswith('--'):
            options[word] = True
        else:
            ids.append(word)
        index += 1
    os.makedirs(os.path.join(SCRATCH, 'preview'), exist_ok=True)
    if '--contact' in options:
        print(json.dumps({'contact': contact_sheet(options['--contact'])}))
        return
    import bpy
    import _naval_asset
    from lib import previewsheet
    cell = tuple(int(v) for v in options['--cell'].split('x')) if '--cell' in options else (320, 200)
    for asset_id in ids:
        started = time.time()
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.context.preferences.addons.get('cycles') or bpy.ops.preferences.addon_enable(module='cycles')
        module = load_script(asset_id)
        work_dir = os.path.join(SCRATCH, asset_id)
        os.makedirs(work_dir, exist_ok=True)
        a = _naval_asset.NavalAsset(module.ASSET['id'], module.ASSET.get('atlas', 1024), module.ASSET.get('kind', 'vehicle'))
        module.make(a, work_dir)
        report = a.finish(os.path.join(ROOT, 'game', 'assets', 'naval', asset_id + '.glb'), work_dir)
        if '--preview' in options:
            views = parse_views(options['--views']) if '--views' in options else module.ASSET.get('views', previewsheet.DEFAULT_VIEWS[:2])
            report['preview'] = previewsheet.render_sheet(os.path.join(SCRATCH, 'preview', asset_id + '.jpg'), views, cell,
                                                          ground=module.ASSET.get('ground', True))
        report['seconds'] = round(time.time() - started, 1)
        print(json.dumps(report))


if __name__ == '__main__':
    main(sys.argv[1:])
