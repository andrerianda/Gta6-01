"""Levels of detail.

A level is a mesh whose node name ends in _lod0, _lod1 ... (or is just lod0, lod1 ...); the game
shows one level at a time and every node without such a suffix at all levels. Lower levels are
made after the bake by decimating level 0, so they keep its UVs and share its textures; a script
can also build a simpler mesh by hand from baked pieces (see AssetBuilder.piece_rect).
"""
from . import modify, naming, scene, shading


def split_name(name):
    """('body', 0) for 'body_lod0', ('', 1) for 'lod1'; (name, None) without a level suffix."""
    match = naming.LOD_PATTERN.match(name)
    if match is None:
        return name, None
    return match.group('part') or '', int(match.group('level'))


def decimated(obj, level, ratio, smooth_angle=None):
    """A copy of `obj` reduced to about `ratio` of its triangles, named as the given level."""
    part, _level = split_name(obj.name)
    copy = scene.duplicate(obj, naming.lod_name(part, level))
    modify.decimate(copy, ratio=ratio)
    copy.data.validate(verbose=False)       # decimation can leave degenerate faces behind
    copy.data.update()
    if smooth_angle is not None:
        shading.smooth(copy, angle=smooth_angle)
    return copy


def make_levels(obj, ratios=(0.45, 0.15), smooth_angle=None):
    """Decimated copies of a level-0 mesh for levels 1, 2, ...: one per entry in `ratios`
    (the share of level 0's triangles to keep)."""
    return [decimated(obj, level, ratio, smooth_angle)
            for level, ratio in enumerate(ratios, start=1)]


def check_levels(objects):
    """Raises ValueError unless each level of each part has fewer triangles than the one above
    and the levels are numbered without gaps from 0."""
    parts = {}
    for obj in objects:
        if obj.type != 'MESH':
            continue
        part, level = split_name(obj.name)
        if level is not None:
            parts.setdefault(part, {})[level] = scene.triangle_count(obj)
    for part, levels in parts.items():
        label = part or 'asset'
        if sorted(levels) != list(range(len(levels))):
            raise ValueError(f'{label}: levels of detail must be numbered 0, 1, 2 without gaps, '
                             f'found {sorted(levels)}')
        for level in range(1, len(levels)):
            if levels[level] >= levels[level - 1]:
                raise ValueError(f'{label}: lod{level} has {levels[level]} triangles, not fewer '
                                 f'than lod{level - 1} ({levels[level - 1]})')
    return parts


def level_count(objects):
    """How many levels of detail the objects define (1 when none is named as a level)."""
    levels = [split_name(obj.name)[1] for obj in objects if obj.type == 'MESH']
    levels = [level for level in levels if level is not None]
    return max(levels) + 1 if levels else 1
