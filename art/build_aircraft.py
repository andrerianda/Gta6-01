"""Builds MARAZUL's aircraft models with Blender's Python (bpy), from the repository root:

    /opt/marazul-blender/bin/python art/build_aircraft.py gaviota_t2 --preview
    /opt/marazul-blender/bin/python art/build_aircraft.py manta_sombra --source --views "35,14,1;0,89,1"
    MARAZUL_BAKE_DEVICE=GPU /opt/marazul-tools/gpu-run -- /opt/marazul-blender/bin/python art/build_aircraft.py garza_negra

Each art/blender/aircraft/<id>.py holds ASSET = {'id': ..., 'atlas': pixels} and make(a), which
models the aircraft and registers its parts on the AircraftAsset `a` (art/blender/lib/assetfile.py).
A build bakes on the CPU, writes game/assets/aircraft/<id>.glb (the only file it writes in the
repository) and prints a one-line JSON report. --source skips the bake and the export and only
renders a contact sheet of the model with its procedural materials (seconds, for iterating);
--preview renders the sheet of the finished asset. Sheets land in /tmp/marazul/flight/art/preview/
as 640 px JPEGs; working textures in /tmp/marazul/flight/art/<id>/. --views takes
"azimuth,elevation,zoom[,x,y,z];..." (see lib/previewsheet.py), --cell "320x180" the size of one view.
"""
import importlib.util
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SCRATCH = '/tmp/marazul/flight/art'
sys.path.insert(0, os.path.join(HERE, 'blender'))

import bpy  # noqa: E402

from lib import assetfile, previewsheet  # noqa: E402


def load_script(asset_id):
    path = os.path.join(HERE, 'blender', 'aircraft', asset_id + '.py')
    sys.path.insert(0, os.path.dirname(path))
    spec = importlib.util.spec_from_file_location('aircraft_' + asset_id, path)
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
    ids = [a for a in argv if not a.startswith('--')]
    options = {a.split('=')[0]: (a.split('=', 1)[1] if '=' in a else True) for a in argv if a.startswith('--')}
    for flag in ('--views', '--cell'):
        if flag in argv and argv.index(flag) + 1 < len(argv):
            options[flag] = argv[argv.index(flag) + 1]
            ids = [i for i in ids if i != options[flag]]
    views = parse_views(options['--views']) if isinstance(options.get('--views'), str) else previewsheet.DEFAULT_VIEWS
    cell = tuple(int(v) for v in options['--cell'].split('x')) if isinstance(options.get('--cell'), str) else (320, 180)
    os.makedirs(os.path.join(SCRATCH, 'preview'), exist_ok=True)
    for asset_id in ids:
        started = time.time()
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.context.preferences.addons.get('cycles') or bpy.ops.preferences.addon_enable(module='cycles')
        module = load_script(asset_id)
        a = assetfile.AircraftAsset(module.ASSET['id'], module.ASSET.get('atlas', 2048))
        module.make(a)
        if '--source' in options:
            sheet = previewsheet.render_sheet(os.path.join(SCRATCH, 'preview', asset_id + '_source.jpg'), views, cell)
            print(json.dumps({'id': asset_id, 'source_preview': sheet, 'seconds': round(time.time() - started, 1)}))
            continue
        out = os.path.join(ROOT, 'game', 'assets', 'aircraft', asset_id + '.glb')
        report = a.finish(out, os.path.join(SCRATCH, asset_id))
        if '--preview' in options:
            report['preview'] = previewsheet.render_sheet(os.path.join(SCRATCH, 'preview', asset_id + '.jpg'), views, cell)
        report['seconds'] = round(time.time() - started, 1)
        print(json.dumps(report))


if __name__ == '__main__':
    main(sys.argv[1:])
