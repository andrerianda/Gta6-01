"""Builds the military base kit (shelter, tower, guard post, fence, floodlight, radar tower and its
wreck, guided bomb) with Blender's Python (bpy), from the repository root, on the CPU:

    /opt/marazul-blender/bin/python art/build_military.py base_hardened_shelter --preview
    /opt/marazul-blender/bin/python art/build_military.py radar_tower guided_bomb
    /opt/marazul-blender/bin/python art/build_military.py --sheet=all base_fence radar_tower   (sheet only)

Each art/blender/military/<id>.py holds ASSET = {'id', 'atlas', 'kind', optional 'views'} and
make(a), which models the asset and registers its parts on a KitAsset (art/blender/military/
_base_kit.py). A build bakes, writes game/assets/military/<id>.glb (the only file it writes in the
repository), prints a one-line JSON report and saves it as report.json in the asset's scratch
directory /tmp/marazul/flight/s2/art-base/<id>/. --preview also renders a strip of two views to
/tmp/marazul/flight/s2/art-base/preview/<id>.jpg; --sheet=<name> stacks the strips of the given ids
into preview/<name>.jpg (640 px wide) without building anything.
"""
import importlib.util
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SCRATCH = '/tmp/marazul/flight/s2/art-base'
DOMAIN = os.path.join(HERE, 'blender', 'military')
sys.path.insert(0, os.path.join(HERE, 'blender'))
sys.path.insert(0, DOMAIN)

import bpy  # noqa: E402
from PIL import Image  # noqa: E402

from lib import previewsheet  # noqa: E402

import _base_kit  # noqa: E402


def load_script(asset_id):
    spec = importlib.util.spec_from_file_location('military_' + asset_id, os.path.join(DOMAIN, asset_id + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def stack_sheet(name, ids):
    strips = [Image.open(p) for p in (os.path.join(SCRATCH, 'preview', i + '.jpg') for i in ids) if os.path.exists(p)]
    sheet = Image.new('RGB', (640, sum(s.height for s in strips)))
    top = 0
    for s in strips:
        sheet.paste(s, (0, top))
        top += s.height
    path = os.path.join(SCRATCH, 'preview', name + '.jpg')
    sheet.save(path, quality=74)
    return path


def main(argv):
    ids = [a for a in argv if not a.startswith('--')]
    options = {a.split('=')[0]: (a.split('=', 1)[1] if '=' in a else True) for a in argv if a.startswith('--')}
    os.makedirs(os.path.join(SCRATCH, 'preview'), exist_ok=True)
    if isinstance(options.get('--sheet'), str):
        print(json.dumps({'sheet': stack_sheet(options['--sheet'], ids)}))
        return
    for asset_id in ids:
        started = time.time()
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.context.preferences.addons.get('cycles') or bpy.ops.preferences.addon_enable(module='cycles')
        module = load_script(asset_id)
        spec = module.ASSET
        # ASSET['builder'] names another builder class of _base_kit (DetailKitAsset); 'cell' and 'columns'
        # shape the preview sheet (default: two 320 x 180 views side by side).
        builder = getattr(_base_kit, spec.get('builder', 'KitAsset'))
        a = builder(spec['id'], spec.get('atlas', 1024), spec.get('kind', 'building'))
        module.make(a)
        work = os.path.join(SCRATCH, asset_id)
        os.makedirs(work, exist_ok=True)
        report = a.finish(os.path.join(ROOT, 'game', 'assets', 'military', asset_id + '.glb'), work)
        if '--preview' in options:
            views = spec.get('views', ((35, 14, 1.0), (205, 30, 1.0)))
            report['preview'] = previewsheet.render_sheet(os.path.join(SCRATCH, 'preview', asset_id + '.jpg'), views,
                                                            spec.get('cell', (320, 180)), columns=spec.get('columns', 2),
                                                            ground=spec.get('ground', True))
        report['seconds'] = round(time.time() - started, 1)
        with open(os.path.join(work, 'report.json'), 'w') as handle:
            json.dump(report, handle)
        print(json.dumps(report))


if __name__ == '__main__':
    main(sys.argv[1:])
