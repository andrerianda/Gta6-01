"""Budgets by asset class and the size report.

The whole game ships in 48 MiB, of which about 30 MiB is art (game/assets/). These budgets are
what keeps a full city inside that: an asset over its budget fails the build. A script may set
its own numbers in ASSET['budget'] when it has a reason (a hero vehicle, a whole building kit
in one file), but the default is the contract.

Needs no Blender: the build runner and the tests use it on built files.
"""

# Per class: triangles at the highest level of detail, draw calls at that level, file bytes,
# the default atlas edge in pixels and the texel density (pixels per metre) to aim for.
BUDGETS = {
    'vehicle':    {'triangles': 18000, 'draws': 14, 'bytes': 1000000, 'atlas': 2048, 'density': 256},
    'character':  {'triangles': 9000,  'draws': 5,  'bytes': 600000,  'atlas': 1024, 'density': 512},
    'building':   {'triangles': 8000,  'draws': 8,  'bytes': 1500000, 'atlas': 2048, 'density': 128},
    'prop':       {'triangles': 2500,  'draws': 4,  'bytes': 220000,  'atlas': 512,  'density': 256},
    'vegetation': {'triangles': 3000,  'draws': 3,  'bytes': 400000,  'atlas': 1024, 'density': 256},
    'dev':        {'triangles': 2000,  'draws': 6,  'bytes': 100000,  'atlas': 256,  'density': 128},
}

KINDS = tuple(BUDGETS)


class BudgetError(Exception):
    """An asset is over its budget."""


def budget_for(spec):
    """The budget of an asset: its class defaults overridden by ASSET['budget']."""
    kind = spec.get('kind')
    if kind not in BUDGETS:
        raise ValueError(f"ASSET['kind'] must be one of {KINDS}, not {kind!r}")
    budget = dict(BUDGETS[kind])
    budget.update(spec.get('budget', {}))
    return budget


def check(stats, budget):
    """Returns the list of budget violations (empty when the asset is within budget)."""
    problems = []
    for key, label in (('triangles', 'triangles'), ('draws', 'draw calls'), ('bytes', 'bytes')):
        if stats[key] > budget[key]:
            problems.append(f'{stats[key]:,} {label} is over the budget of {budget[key]:,}')
    return problems


def describe(asset_id, stats, budget=None, seconds=None):
    """A few lines describing one built asset: levels, draw calls, textures and bytes."""
    lines = [f'{asset_id}: {stats["bytes"]:,} bytes '
             f'({stats["geometry_bytes"]:,} geometry and scene, {stats["texture_bytes"]:,} textures)']
    for level, lod in enumerate(stats['lods']):
        lines.append(f'  lod{level}: {lod["triangles"]:,} triangles, {lod["vertices"]:,} vertices, '
                     f'{lod["draws"]} draw calls')
    for image in stats['images']:
        lines.append(f'  texture {image["name"]}: {image["width"]}x{image["height"]} '
                     f'{image["mime"].split("/")[-1]}, {image["bytes"]:,} bytes')
    if stats['materials']:
        lines.append(f'  materials: {", ".join(stats["materials"])}')
    if stats['anchors']:
        lines.append(f'  anchors: {", ".join(stats["anchors"])}')
    if stats['colliders']:
        lines.append(f'  colliders: {", ".join(stats["colliders"])}')
    if budget is not None:
        lines.append(f'  budget: {stats["triangles"]:,}/{budget["triangles"]:,} triangles, '
                     f'{stats["draws"]}/{budget["draws"]} draw calls, '
                     f'{stats["bytes"]:,}/{budget["bytes"]:,} bytes')
    if seconds is not None:
        lines.append(f'  built in {seconds:.1f} s')
    return '\n'.join(lines)


def table(rows):
    """A plain-text summary table. rows: dictionaries with id, kind, status, stats (or None),
    budget (or None) and seconds (or None)."""
    header = ('asset', 'kind', 'status', 'tris (lod0/1/2)', 'draws', 'textures', 'bytes',
              'budget', 'time')
    body = []
    for row in rows:
        stats, budget = row.get('stats'), row.get('budget')
        if stats:
            triangles = '/'.join(f'{lod["triangles"]:,}' for lod in stats['lods'])
            sizes = sorted({f'{image["width"]}' for image in stats['images']}, key=int, reverse=True)
            textures_cell = f'{len(stats["images"])} @ {"/".join(sizes)}' if sizes else '-'
            used = f'{100.0 * stats["bytes"] / budget["bytes"]:.0f} %' if budget else '-'
            cells = (triangles, str(stats['draws']), textures_cell, f'{stats["bytes"]:,}', used)
        else:
            cells = ('-', '-', '-', '-', '-')
        seconds = row.get('seconds')
        body.append((row['id'], row.get('kind', '-'), row['status'], *cells,
                     f'{seconds:.1f} s' if seconds is not None else '-'))
    widths = [max(len(str(line[column])) for line in [header, *body]) for column in range(len(header))]
    def format_line(line):
        return '  '.join(str(cell).ljust(width) for cell, width in zip(line, widths)).rstrip()
    rule = '  '.join('-' * width for width in widths)
    return '\n'.join([format_line(header), rule, *[format_line(line) for line in body]])
