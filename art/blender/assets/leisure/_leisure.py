"""Leisure set tools (a helper module, not an asset): object nodes and shared materials for
set_beach and the later set_waterfront and set_park.

A set is one asset file, one bake and one atlas holding several separate objects, named like
the props sets so the city dressing handles both alike:

    <object>                     an empty at the object's ground centre: the node the game
                                 clones. Its extras carry class ('fixed' or 'knockable') and,
                                 for a knockable object, mass in kilograms.
    <object>_lod0, <object>_lod1 the object's levels (children of the object node; level 1 is
                                 made by the pipeline's auto_lods after the bake)
    col_<shape>_<name>__<object> a collision proxy of that object (child of the object node)
    anchor_<what>__<object>      an anchor of that object (child of the object node)

In the file the objects stand in a row along +X, a gap apart, so that the bake's ambient
occlusion of one does not fall on the next. extras.objects repeats class, mass and the origin
(game axes) for code that reads the file without the registry.

Blender axes: Z up, every object faces +Y (the game's -Z) and stands on Z = 0 at its origin.
"""
import math

from lib import scene, shading
from lib import materials as M

UV_LAYER = 'UVMap'


def single_uv(obj):
    """Leaves a part with exactly one UV layer named as the pipeline expects. Works around a
    library slip (build.box names its layer differently from the other builders, so a joined
    mesh would carry a second, unused set of texture coordinates)."""
    layers = obj.data.uv_layers
    if not layers:
        layers.new(name=UV_LAYER)
    while len(layers) > 1:
        layers.remove(layers[-1])
    if layers[0].name != UV_LAYER:
        layers[0].name = UV_LAYER
    return obj


class SetLayout:
    """Collects the objects of a set in a row and writes their table into the extras."""

    def __init__(self, a, gap=1.5):
        self.a = a
        self.gap = gap
        self.cursor = 0.0
        self.table = {}

    def object(self, name, parts, width, cls='fixed', mass=None, smooth=35.0, colliders=(),
               anchors=(), texel_scale=1.0):
        """Joins `parts` (modelled about the origin) into <name>_lod0 under the node <name>.

        width: the object's extent along X, for the row. colliders: tuples ('box', name,
        centre, size) or ('cyl', name, centre, (radius, height)). anchors: tuples (what, at,
        forward) in the object's own coordinates."""
        if cls not in ('fixed', 'knockable'):
            raise ValueError(f'{name}: class must be fixed or knockable')
        if cls == 'knockable' and mass is None:
            raise ValueError(f'{name}: a knockable object needs a mass')
        for part in parts:
            single_uv(part)
        mesh = scene.join(parts, f'{name}_lod0')
        shading.smooth(mesh, angle=math.radians(smooth))
        root = scene.add_empty(name, (0.0, 0.0, 0.0), size=0.3)
        root['class'] = cls
        if mass is not None:
            root['mass'] = float(mass)
        scene.parent_to(mesh, root)
        self.a.extra_objects.append(root)
        self.a.add(mesh, texel_scale=texel_scale)
        for kind, label, centre, size in colliders:
            if kind == 'box':
                empty = self.a.collider_box(f'{label}__{name}', centre, size)
            else:
                empty = self.a.collider_cylinder(f'{label}__{name}', centre, size[0], size[1])
            scene.parent_to(empty, root)
        for what, at, forward in anchors:
            self.a.add_anchor(f'anchor_{what}__{name}', at, forward=forward, parent=root)
        x = self.cursor + width * 0.5
        self.cursor += width + self.gap
        root.location = (x, 0.0, 0.0)
        self.table[name] = {'class': cls, 'origin': [round(x, 3), 0.0, 0.0]}
        if mass is not None:
            self.table[name]['mass'] = float(mass)
        return root

    def finish(self, lod_ratio=0.35, lod_distance=40.0):
        """Level 1 for every object and the object table in the extras. Call last in make()."""
        self.a.auto_lods(ratios=(lod_ratio,), distances=(lod_distance,))
        self.a.set_extra('objects', self.table)


def paint_canvas(color=(0.62, 0.12, 0.08), seed=0, name='paint_canvas'):
    """Tintable canvas (the paint role: baked neutral, coloured per instance by the game):
    a soft cloudy fade and grime, so a stripe of it sits with the white canvas beside it."""
    graph = M.Graph(name, seed)
    base = graph.paint_color(color)
    cloud = graph.noise(scale=3.0, detail=5.0, roughness=0.6)
    slub = graph.noise(scale=40.0, detail=3.0, stretch=(0.1, 1.0, 1.0))
    base = graph.hsv(base, value=graph.remap(cloud, 0.2, 0.8, 0.86, 1.04))
    base = graph.hsv(base, value=graph.remap(slub, 0.2, 0.8, 0.95, 1.04))
    coat = M.Coat(graph, base, roughness=0.88, height=graph.mul(slub, 0.4))
    return coat.finish(bump_strength=0.2, bump_distance=0.002, sheen=0.3)


def materials(seed=0):
    """The shared library of a leisure set, by short name."""
    return {
        'canvas': paint_canvas(seed=seed),
        'canvas_white': M.fabric(color=(0.80, 0.78, 0.72), thread=0.004, fade=0.4, dirt=0.25,
                                 seed=seed + 1, name='canvas_white'),
        'aluminium': M.brushed_metal(color=(0.60, 0.61, 0.62), roughness=0.38, grime=0.25,
                                     seed=seed + 2, name='aluminium'),
        'white_frame': M.painted_metal(color=(0.80, 0.80, 0.76), gloss=0.55, chips=0.25,
                                       rust=0.15, grime=0.3, dust=0.35, fade=0.2,
                                       seed=seed + 3, name='white_frame'),
        'timber': M.wood(color=(0.40, 0.29, 0.19), weathered=0.65, grain_axis='Z',
                         seed=seed + 4, name='timber'),
        'deck': M.wood(color=(0.44, 0.33, 0.22), weathered=0.7, grain_axis='Y', plank_width=0.14,
                       seed=seed + 5, name='deck'),
        'cabin': M.painted_metal(color=(0.36, 0.62, 0.58), gloss=0.35, chips=0.45, rust=0.05,
                                 grime=0.35, dust=0.3, fade=0.55, seed=seed + 6, name='cabin_paint'),
        'trim': M.painted_metal(color=(0.82, 0.80, 0.74), gloss=0.4, chips=0.4, rust=0.05,
                                grime=0.35, dust=0.3, fade=0.3, seed=seed + 7, name='trim_paint'),
        'roof': M.painted_metal(color=(0.70, 0.33, 0.24), gloss=0.35, chips=0.35, rust=0.15,
                                grime=0.4, dust=0.3, fade=0.6, seed=seed + 8, name='roof_paint'),
        'stucco': M.stucco(color=(0.86, 0.66, 0.52), seed=seed + 9, name='kiosk_stucco'),
        'counter': M.wood(color=(0.36, 0.22, 0.12), weathered=0.2, grain_axis='X', varnish=0.6,
                          seed=seed + 10, name='counter_wood'),
        'plastic': M.plastic(color=(0.05, 0.05, 0.055), seed=seed + 11, name='black_plastic'),
        'seat': M.plastic(color=(0.10, 0.36, 0.40), roughness=0.4, seed=seed + 12,
                          name='seat_plastic'),
        'fridge': M.plastic(color=(0.72, 0.72, 0.70), roughness=0.35, seed=seed + 13,
                            name='fridge_plastic'),
        'sign': M.enamel_sign(color=(0.86, 0.84, 0.76), seed=seed + 14, name='sign_board'),
        'cord': M.fabric(color=(0.05, 0.05, 0.055), thread=0.003, fade=0.1, dirt=0.1,
                         seed=seed + 15, name='net_cord'),
        'rope': M.fabric(color=(0.62, 0.58, 0.48), thread=0.004, fade=0.3, dirt=0.3,
                         seed=seed + 16, name='rope'),
        'flag_red': M.fabric(color=(0.62, 0.07, 0.04), thread=0.004, fade=0.5, dirt=0.1,
                             seed=seed + 17, name='flag_red'),
        'flag_yellow': M.fabric(color=(0.80, 0.58, 0.06), thread=0.004, fade=0.5, dirt=0.1,
                                seed=seed + 18, name='flag_yellow'),
        'towel': M.fabric(color=(0.08, 0.36, 0.44), thread=0.003, fade=0.3, dirt=0.1,
                          seed=seed + 19, name='towel'),
        'interior': M.painted_metal(color=(0.20, 0.19, 0.17), gloss=0.2, chips=0.1, rust=0.0,
                                    grime=0.5, dust=0.2, fade=0.1, seed=seed + 20,
                                    name='interior_paint'),
    }
