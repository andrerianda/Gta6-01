"""Builds MARAZUL's people with Blender's Python (bpy), from the repository root:

    /opt/marazul-blender/bin/python art/build_characters.py --only dez_tolliver --preview
    /opt/marazul-blender/bin/python art/build_characters.py --only dez_tolliver
    /opt/marazul-blender/bin/python art/build_characters.py --only dez_tolliver --sheet
    /opt/marazul-blender/bin/python art/build_characters.py            (every character module)

Each art/blender/characters/<id>.py declares one person (ID, BODY, HAIR, BEARD, BROWS, EYES,
WARDROBE, BUDGET; see art/blender/characters/README.md); the shared human library is
art/blender/characters/human/. A build writes game/assets/characters/<id>.glb (the only file it
writes in the repository) and prints a one-line JSON report. The textures are baked by the
library's own texel baker (numpy, CPU): no Cycles bake, so no GPU is needed.

--preview   no bake, no export: coarser shapes with flat colours rendered to a contact sheet
            (body front, three-quarter, side, back; face close-ups) in a minute or two.
--sheet     after a full build, the same sheet with the baked materials.
--check     after the build, pose the rig (walk, run, aim, sit, crouch, arms up) and report edge
            stretch and squash and whether the hands' wrist rims stay inside the sleeves.
--quality q mesh resolution factor (1 = full; --preview uses 1.5).
--out DIR   write the .glb there instead of game/assets/characters/.
Sheets and working textures go to $MARAZUL_CHARACTER_SCRATCH (default /tmp/marazul/characters).
"""
import importlib.util
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CHARACTERS = os.path.join(HERE, 'blender', 'characters')
sys.path.insert(0, os.path.join(HERE, 'blender'))
sys.path.insert(0, CHARACTERS)

import bpy  # noqa: E402


def available():
    return sorted(f[:-3] for f in os.listdir(CHARACTERS) if f.endswith('.py') and not f.startswith('_'))


def load(name):
    path = os.path.join(CHARACTERS, name + '.py')
    spec = importlib.util.spec_from_file_location('character_' + name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    data = {k: getattr(module, k) for k in dir(module) if k.isupper()}
    data.setdefault('ID', name)
    return data


def main(argv):
    options = {}
    rest = []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a in ('--only', '--quality', '--out') and i + 1 < len(argv):
            options[a] = argv[i + 1]
            i += 2
            continue
        if a.startswith('--'):
            key, _, value = a.partition('=')
            options[key] = value or True
        else:
            rest.append(a)
        i += 1
    names = options['--only'].split(',') if isinstance(options.get('--only'), str) else (rest or available())
    scratch = os.environ.get('MARAZUL_CHARACTER_SCRATCH', '/tmp/marazul/characters')
    os.makedirs(os.path.join(scratch, 'preview'), exist_ok=True)
    from human import character
    for name in names:
        started = time.time()
        bpy.ops.wm.read_factory_settings(use_empty=True)
        spec = load(name)
        preview = '--preview' in options
        quality = float(options.get('--quality', 1.5 if preview else 1.0))
        out_dir = options['--out'] if isinstance(options.get('--out'), str) else os.path.join(ROOT, 'game', 'assets', 'characters')
        sheet = None
        if preview:
            sheet = os.path.join(scratch, 'preview', name + '_source.jpg')
        elif '--sheet' in options:
            sheet = os.path.join(scratch, 'preview', name + '.jpg')
        report = character.build(spec, None if preview else os.path.join(out_dir, name + '.glb'), os.path.join(scratch, name),
                                 quality=quality, preview_path=sheet, bake=not preview, check='--check' in options)
        report['seconds'] = round(time.time() - started, 1)
        print(json.dumps(report))


if __name__ == '__main__':
    main(sys.argv[1:])
