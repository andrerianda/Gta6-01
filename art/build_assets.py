"""MARAZUL asset build runner: builds, previews and lists the assets under art/blender/assets/.

Run it from the repository root with Blender's Python. By default, send it to the GPU machine:

    /opt/marazul-tools/gpu-run -- /opt/marazul-blender/bin/python art/build_assets.py build street_lamp_a --preview

and only when no GPU can be had (gpu-run exits with 75) run the same command on this machine:

    /opt/marazul-blender/bin/python art/build_assets.py build street_lamp_a --preview

Commands
    list                         every registered asset with its kind, script and output file
    build <id|domain|all> ...    build assets; unchanged ones are skipped (--force rebuilds);
                                 --preview also renders a Cycles still of each built asset
    preview <id>                 render a built asset in the studio (--source renders the
                                 modelled, unbaked source instead; see --help for views)
    swatches                     render the material library as a sheet of test shapes

--gpu makes `build` and `preview` send their own work through gpu-run: unchanged assets are
skipped here first and only the stale ones travel, which is the quick way to rebuild everything.

An asset is a script art/blender/assets/<domain>/<id>.py with a literal ASSET dictionary and a
make(a) function (see art/README.md). Its output is game/assets/<domain>/<id>.glb. Everything
else this runner writes (hashes, results, working textures, previews) goes under
/tmp/marazul/assets/, never into the repository.
"""
import argparse
import ast
import fcntl
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import time

# Keep Python's bytecode caches out of the repository: a build writes nothing there but .glb files.
sys.dont_write_bytecode = True

ART_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(ART_DIR)
BLENDER_DIR = os.path.join(ART_DIR, 'blender')
ASSETS_DIR = os.path.join(BLENDER_DIR, 'assets')
LIB_DIR = os.path.join(BLENDER_DIR, 'lib')
OUTPUT_DIR = os.path.join(REPO_DIR, 'game', 'assets')
SCRATCH_DIR = '/tmp/marazul/assets'
CACHE_DIR = os.path.join(SCRATCH_DIR, 'cache')
RESULT_DIR = os.path.join(SCRATCH_DIR, 'results')
WORK_DIR = os.path.join(SCRATCH_DIR, 'work')
PREVIEW_DIR = os.path.join(SCRATCH_DIR, 'preview')
LOCK_PATH = '/tmp/marazul/bake.lock'
GPU_RUN = os.environ.get('MARAZUL_GPU_RUN', '/opt/marazul-tools/gpu-run')
GPU_UNAVAILABLE = 75

sys.path.insert(0, BLENDER_DIR)


class Entry:
    """One registered asset: where its script is and where its .glb goes."""

    def __init__(self, domain, script):
        self.domain = domain
        self.script = script
        self.spec = read_spec(script)
        self.id = self.spec['id']
        self.kind = self.spec['kind']
        self.output = os.path.join(OUTPUT_DIR, domain, f'{self.id}.glb')


def read_spec(script):
    """Reads the literal ASSET dictionary of an asset script without running the script."""
    with open(script, 'r', encoding='utf-8') as handle:
        tree = ast.parse(handle.read(), filename=script)
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(
                isinstance(target, ast.Name) and target.id == 'ASSET' for target in node.targets):
            spec = ast.literal_eval(node.value)
            stem = os.path.splitext(os.path.basename(script))[0]
            if spec.get('id') != stem:
                raise SystemExit(f"{script}: ASSET['id'] must be the file name, {stem!r}")
            if 'kind' not in spec:
                raise SystemExit(f"{script}: ASSET needs a 'kind'")
            return spec
    raise SystemExit(f'{script}: no literal ASSET = {{...}} dictionary found')


def registry():
    """Every asset script under art/blender/assets/<domain>/, by id (files starting with an
    underscore are helpers shared by a domain's scripts, not assets)."""
    entries = {}
    for domain in sorted(os.listdir(ASSETS_DIR)):
        folder = os.path.join(ASSETS_DIR, domain)
        if not os.path.isdir(folder) or domain.startswith(('_', '.')):
            continue
        for name in sorted(os.listdir(folder)):
            if not name.endswith('.py') or name.startswith('_'):
                continue
            entry = Entry(domain, os.path.join(folder, name))
            if entry.id in entries:
                raise SystemExit(f'asset id {entry.id!r} is used by both {entries[entry.id].script} '
                                 f'and {entry.script}')
            entries[entry.id] = entry
    return entries


def select(entries, tokens):
    """Entries for a list of ids, domain names or 'all', in registry order without repeats."""
    chosen = []
    for token in tokens:
        if token == 'all':
            matches = list(entries.values())
        elif token in entries:
            matches = [entries[token]]
        else:
            matches = [entry for entry in entries.values() if entry.domain == token]
        if not matches:
            raise SystemExit(f'unknown asset or domain {token!r}; run `list` to see what exists')
        chosen += [entry for entry in matches if entry not in chosen]
    return chosen


# ---------------------------------------------------------------------------------------------
# Content hashing: skip assets whose script and library have not changed
# ---------------------------------------------------------------------------------------------

def library_hash():
    """One hash over every library source file (and this runner)."""
    digest = hashlib.sha256()
    paths = [os.path.abspath(__file__)]
    for root, _folders, files in os.walk(LIB_DIR):
        paths += [os.path.join(root, name) for name in files if name.endswith('.py')]
    for path in sorted(paths):
        digest.update(os.path.relpath(path, ART_DIR).encode())
        with open(path, 'rb') as handle:
            digest.update(handle.read())
    return digest.hexdigest()


def source_hash(entry, shared):
    """The hash an asset's build depends on: its script, its domain's helpers and the library."""
    digest = hashlib.sha256(shared.encode())
    folder = os.path.dirname(entry.script)
    helpers = [os.path.join(folder, name) for name in sorted(os.listdir(folder))
               if name.startswith('_') and name.endswith('.py')]
    for path in [entry.script, *helpers]:
        with open(path, 'rb') as handle:
            digest.update(handle.read())
    return digest.hexdigest()


def file_hash(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def is_current(entry, shared):
    """True when the built file exists and matches the recorded source and output hashes. A
    missing cache (a fresh GPU job, a cleaned /tmp) only means the asset is built again."""
    cache = os.path.join(CACHE_DIR, f'{entry.id}.sha256')
    if not os.path.exists(cache) or not os.path.exists(entry.output):
        return False
    with open(cache, 'r', encoding='utf-8') as handle:
        recorded = handle.read().split()
    return recorded == [source_hash(entry, shared), file_hash(entry.output)]


def record_current(entry, shared):
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(os.path.join(CACHE_DIR, f'{entry.id}.sha256'), 'w', encoding='utf-8') as handle:
        handle.write(f'{source_hash(entry, shared)} {file_hash(entry.output)}\n')


# ---------------------------------------------------------------------------------------------
# One bake at a time on this machine
# ---------------------------------------------------------------------------------------------

class BakeLock:
    """An exclusive lock on /tmp/marazul/bake.lock while Cycles runs here. The GPU machine
    (MARAZUL_GPU=1) runs one job at a time by itself and needs none."""

    def __enter__(self):
        self.handle = None
        if os.environ.get('MARAZUL_GPU') == '1':
            return self
        os.makedirs(os.path.dirname(LOCK_PATH), exist_ok=True)
        self.handle = open(LOCK_PATH, 'w')
        try:
            fcntl.flock(self.handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('waiting for another bake on this machine to finish ...', flush=True)
            fcntl.flock(self.handle, fcntl.LOCK_EX)
        return self

    def __exit__(self, *_exc):
        if self.handle is not None:
            fcntl.flock(self.handle, fcntl.LOCK_UN)
            self.handle.close()


# ---------------------------------------------------------------------------------------------
# Workers (these import Blender)
# ---------------------------------------------------------------------------------------------

def load_module(entry):
    spec = importlib.util.spec_from_file_location(f'marazul_asset_{entry.id}', entry.script)
    module = importlib.util.module_from_spec(spec)
    sys.path.insert(0, os.path.dirname(entry.script))
    spec.loader.exec_module(module)
    return module


def worker_build(asset_id, want_preview, views=None):
    """Builds one asset in this process and writes its result where the parent expects it."""
    from lib import asset, report
    entry = registry()[asset_id]
    module = load_module(entry)
    started = time.time()
    result = asset.run(module, entry.output, os.path.join(WORK_DIR, entry.id))
    seconds = time.time() - started
    print(report.describe(entry.id, result['stats'], result['budget'], seconds), flush=True)
    timings = ', '.join(f'{name} {value:.1f} s' for name, value in result['timings'].items())
    print(f'  stages: {timings}; texel density {result["density"]:.0f} px/m', flush=True)
    os.makedirs(RESULT_DIR, exist_ok=True)
    with open(os.path.join(RESULT_DIR, f'{entry.id}.json'), 'w', encoding='utf-8') as handle:
        json.dump({'stats': result['stats'], 'budget': result['budget'],
                   'problems': result['problems'], 'seconds': seconds,
                   'timings': result['timings']}, handle)
    if want_preview and not result['problems']:
        path = render_preview(entry, views or ['three_quarter'])
        print(f'  preview: {path}', flush=True)


def render_preview(entry, views, source=False, level=0, tone='aces', zoom=1.0, focus=None,
                   samples=None, out=None):
    """Renders a studio still (or a contact sheet of several views) of one asset to a JPEG."""
    from lib import asset, preview, scene
    if source:
        objects = asset.build_source(load_module(entry))
    else:
        if not os.path.exists(entry.output):
            raise SystemExit(f'{entry.output} does not exist: build {entry.id} first '
                             '(or sync game/assets to the GPU machine)')
        scene.reset_scene()
        objects = preview.import_glb(entry.output, level=level)
    label = 'sheet' if len(views) > 1 else views[0] if views[0] in preview.VIEWS else 'shot'
    suffix = ('_source' if source else '') + (f'_lod{level}' if level else '')
    path = out or os.path.join(PREVIEW_DIR, f'{entry.id}_{label}{suffix}.jpg')
    preview.render_views(path, objects, views=views, tone=tone, zoom=zoom, focus=focus,
                         samples=samples)
    query = preview.viewer_query(entry.id, views, tone=tone, level=level, zoom=zoom, focus=focus)
    print(f'  same shots in the engine: tools/preview/asset-viewer.html?{query}', flush=True)
    return path


def render_swatches(names, tone):
    from lib import materials, preview, scene
    scene.reset_scene()
    chosen = names or list(materials.CATALOGUE)
    made = [materials.CATALOGUE[name](seed=index + 1) for index, name in enumerate(chosen)]
    path = os.path.join(PREVIEW_DIR, 'materials.jpg' if not names else f'materials_{names[0]}.jpg')
    print('materials, left to right, top to bottom:', ', '.join(chosen))
    return preview.swatch_sheet(path, made, tone=tone)


# ---------------------------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------------------------

def run_gpu(arguments, sync=('art',)):
    """Runs this script with `arguments` on the GPU machine; returns gpu-run's exit code
    (75 when no GPU machine is available)."""
    command = [GPU_RUN, '--sync', ','.join(sync), '--', sys.executable,
               os.path.relpath(os.path.abspath(__file__), REPO_DIR), *arguments]
    print('gpu:', ' '.join(command), flush=True)
    try:
        return subprocess.call(command, cwd=REPO_DIR)
    except FileNotFoundError:
        return GPU_UNAVAILABLE


def command_list(_arguments):
    for entry in registry().values():
        built = f'{os.path.getsize(entry.output):,} bytes' if os.path.exists(entry.output) else 'not built'
        print(f'{entry.id:28} {entry.kind:11} {os.path.relpath(entry.script, REPO_DIR):48} {built}')


def command_build(arguments):
    from lib import glb, report
    entries = select(registry(), arguments.assets)
    shared = library_hash()
    stale = [entry for entry in entries if arguments.force or not is_current(entry, shared)]
    started = time.time()
    remote = False
    preview_arguments = ['--preview'] if arguments.preview else []
    for view in arguments.view or []:
        preview_arguments.append(f'--view={view}')     # "=": a shot may start with a minus sign
    for entry in stale:
        result_path = os.path.join(RESULT_DIR, f'{entry.id}.json')
        if os.path.exists(result_path):
            os.remove(result_path)
    if arguments.gpu and stale:
        code = run_gpu(['build', *[entry.id for entry in stale], '--force', *preview_arguments])
        remote = code != GPU_UNAVAILABLE
        if not remote:
            print('no GPU machine available: building on this machine instead', flush=True)

    rows, failed = [], False
    for entry in entries:
        row = {'id': entry.id, 'kind': entry.kind, 'status': 'cached', 'seconds': None,
               'stats': None, 'budget': report.budget_for(entry.spec)}
        rows.append(row)
        result_path = os.path.join(RESULT_DIR, f'{entry.id}.json')
        if entry in stale:
            if not remote:
                with BakeLock():
                    code = subprocess.call(
                        [sys.executable, os.path.abspath(__file__), '_worker', entry.id,
                         *preview_arguments], cwd=REPO_DIR)
                if code != 0 and os.path.exists(result_path):
                    os.remove(result_path)
            if not os.path.exists(result_path) or not os.path.exists(entry.output):
                row['status'] = 'FAILED'
                failed = True
                continue
            with open(result_path, 'r', encoding='utf-8') as handle:
                result = json.load(handle)
            row.update(stats=result['stats'], seconds=result['seconds'], status='built')
            if result['problems']:
                row['status'] = 'OVER BUDGET'
                failed = True
                for problem in result['problems']:
                    print(f'{entry.id}: {problem}', file=sys.stderr)
            else:
                record_current(entry, shared)
        else:
            row['stats'] = glb.statistics(glb.Document.read(entry.output),
                                          file_bytes=os.path.getsize(entry.output))
    print()
    print(report.table(rows))
    total = sum(row['stats']['bytes'] for row in rows if row['stats'])
    print(f'\n{len(rows)} assets, {total:,} bytes in all, {time.time() - started:.1f} s '
          f'on {"the GPU machine" if remote or os.environ.get("MARAZUL_GPU") == "1" else "this machine"}')
    if failed:
        raise SystemExit('build failed: see FAILED and OVER BUDGET rows above')


def command_preview(arguments):
    entry = registry()[arguments.asset] if arguments.asset in registry() else None
    if entry is None:
        raise SystemExit(f'unknown asset {arguments.asset!r}; run `list` to see what exists')
    if arguments.gpu:
        forwarded = [argument for argument in sys.argv[1:] if argument != '--gpu']
        code = run_gpu(forwarded, sync=('art',) if arguments.source else ('art', 'game/assets'))
        if code != GPU_UNAVAILABLE:
            raise SystemExit(code)
        print('no GPU machine available: rendering on this machine instead', flush=True)
    from lib import preview
    views = list(arguments.view or [])
    if arguments.turntable:
        views += preview.turntable(arguments.turntable)
    focus = tuple(float(part) for part in arguments.focus.split(',')) if arguments.focus else None
    with BakeLock():
        path = render_preview(entry, views or ['three_quarter'], source=arguments.source,
                              level=arguments.lod, tone=arguments.tone, zoom=arguments.zoom,
                              focus=focus, samples=arguments.samples, out=arguments.out)
    print(f'preview: {path}')


def command_swatches(arguments):
    with BakeLock():
        print(f'preview: {render_swatches(arguments.materials, arguments.tone)}')


def main():
    parser = argparse.ArgumentParser(description='Build and preview MARAZUL assets.')
    commands = parser.add_subparsers(dest='command', required=True)

    commands.add_parser('list', help='list the registered assets')

    build = commands.add_parser('build', help='build assets by id, by domain, or all')
    build.add_argument('assets', nargs='+', help='asset ids, domain names (props, vehicles, ...) or all')
    build.add_argument('--force', action='store_true', help='rebuild even when nothing changed')
    build.add_argument('--preview', action='store_true', help='render a Cycles still of each built asset')
    build.add_argument('--view', action='append', metavar='SHOT',
                       help='with --preview: the shots to render (see `preview --help`)')
    build.add_argument('--gpu', action='store_true', help='send the stale assets through gpu-run')

    preview = commands.add_parser('preview', help='render a Cycles still of one asset')
    preview.add_argument('asset')
    preview.add_argument('--view', action='append', metavar='SHOT',
                         help='a shot: three_quarter (default), front, side, back, top, low or '
                              '"azimuth,elevation" in degrees, optionally followed by @zoom and '
                              '@x,y,z to look at (Blender axes), e.g. "35,10@5@0,0,0.4"; repeat '
                              '--view for a contact sheet of several shots in one image')
    preview.add_argument('--turntable', type=int, default=0, metavar='N',
                         help='add N views around the asset (one contact sheet)')
    preview.add_argument('--zoom', type=float, default=1.0, help='move closer by this factor (close-up)')
    preview.add_argument('--focus', help='"x,y,z" in Blender axes to look at instead of the centre')
    preview.add_argument('--lod', type=int, default=0, help='level of detail to show')
    preview.add_argument('--source', action='store_true',
                         help='render the modelled source with procedural materials, no bake')
    preview.add_argument('--tone', choices=('aces', 'agx', 'neutral', 'none'), default='aces')
    preview.add_argument('--samples', type=int, default=None)
    preview.add_argument('--out', help='output path (default /tmp/marazul/assets/preview/...)')
    preview.add_argument('--gpu', action='store_true', help='render through gpu-run')

    swatches = commands.add_parser('swatches', help='render the material library')
    swatches.add_argument('materials', nargs='*', help='material names (default: all)')
    swatches.add_argument('--tone', choices=('aces', 'agx', 'neutral', 'none'), default='aces')

    worker = commands.add_parser('_worker')
    worker.add_argument('asset')
    worker.add_argument('--preview', action='store_true')
    worker.add_argument('--view', action='append')

    arguments = parser.parse_args()
    if arguments.command == 'list':
        command_list(arguments)
    elif arguments.command == 'build':
        command_build(arguments)
    elif arguments.command == 'preview':
        command_preview(arguments)
    elif arguments.command == 'swatches':
        command_swatches(arguments)
    elif arguments.command == '_worker':
        worker_build(arguments.asset, arguments.preview, arguments.view)


if __name__ == '__main__':
    main()
