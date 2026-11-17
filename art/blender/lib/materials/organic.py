"""Living and once-living surfaces: wood, bark, palm trunk, foliage and skin."""
from . import wear
from .nodes import Graph

_STRETCH = {'X': (0.06, 1.0, 1.0), 'Y': (1.0, 0.06, 1.0), 'Z': (1.0, 1.0, 0.06)}


def wood(color=(0.36, 0.22, 0.12), weathered=0.5, grain_axis='Z', plank_width=0.0, varnish=0.0,
         seed=0, name='wood'):
    """Timber with grain along `grain_axis`. weathered 0 is fresh joinery, 1 is silver driftwood
    with open checks; plank_width > 0 splits the surface into boards; varnish adds gloss."""
    graph = Graph(name, seed)
    stretch = _STRETCH[grain_axis]
    grain = graph.noise(scale=55.0, detail=6.0, roughness=0.6, stretch=stretch, distortion=0.6)
    figure = graph.noise(scale=7.0, detail=4.0, stretch=stretch, distortion=1.5)
    fibres = graph.noise(scale=420.0, detail=2.0, stretch=stretch)
    fresh = graph.ramp(graph.add(graph.mul(grain, 0.6), graph.mul(figure, 0.5)),
                       [(0.25, graph_color(color, 0.55)), (0.55, color),
                        (0.85, graph_color(color, 1.35))])
    grey = graph.ramp(grain, [(0.2, (0.20, 0.19, 0.18)), (0.8, (0.50, 0.48, 0.45))])
    bleach = graph.noise(scale=1.3, detail=3.0)
    base = graph.mix(graph.mul(graph.remap(bleach, 0.2, 0.8, 0.5, 1.0), weathered), fresh, grey)
    height = graph.add(graph.mul(grain, 0.6), graph.mul(fibres, 0.25))
    coat = wear.Coat(graph, base, roughness=graph.remap(grain, 0.2, 0.8, 0.55, 0.85),
                     height=height)
    if plank_width > 0:
        across = {'X': 'Y', 'Y': 'X', 'Z': 'X'}[grain_axis]
        boards = graph.wave(period=plank_width, direction=across, profile='SAW')
        gap = graph.remap(boards, 0.0, 0.03, 1.0, 0.0, smooth=True)
        coat.color = graph.hsv(coat.color, value=graph.remap(
            graph.white_noise(graph.math('FLOOR', graph.mul(graph.axis(across), 1.0 / plank_width))),
            0.0, 1.0, 0.85, 1.15))
        coat.cover(gap, color=(0.03, 0.025, 0.02), roughness=0.95, height=-3.0)
    if weathered > 0:
        checks = graph.noise(scale=22.0, detail=3.0, stretch=_STRETCH[grain_axis], distortion=0.3)
        coat.cover(graph.mask(checks, 0.85 - 0.25 * weathered, 0.03), color=(0.05, 0.045, 0.04),
                   roughness=0.95, height=-2.0)
        wear.grime(coat, amount=0.5 * weathered)
    if varnish > 0:
        coat.roughness = graph.mix_value(varnish, coat.roughness, 0.18)
    return coat.finish(bump_strength=0.6, bump_distance=0.0015 + 0.002 * weathered)


def graph_color(color, value):
    """A colour scaled in brightness (plain tuple arithmetic for ramp stops)."""
    return tuple(min(1.0, component * value) for component in color[:3])


def bark(color=(0.20, 0.15, 0.11), furrow=0.7, moss=0.2, seed=0, name='bark'):
    """Deeply furrowed tree bark with vertical plates; moss greens the shaded hollows."""
    graph = Graph(name, seed)
    plates = graph.voronoi(scale=14.0, feature='DISTANCE_TO_EDGE', stretch=(1.0, 1.0, 0.22))
    ridges = graph.remap(plates, 0.0, 0.22, 0.0, 1.0, smooth=True)
    fine = graph.noise(scale=95.0, detail=6.0, roughness=0.75, stretch=(1.0, 1.0, 0.4))
    cloud = graph.noise(scale=2.0, detail=4.0)
    base = graph.ramp(graph.add(graph.mul(ridges, 0.7), graph.mul(fine, 0.4)),
                      [(0.1, graph_color(color, 0.25)), (0.6, color),
                       (1.0, graph_color(color, 1.7))])
    base = graph.hsv(base, value=graph.remap(cloud, 0.2, 0.8, 0.85, 1.12))
    coat = wear.Coat(graph, base, roughness=0.92,
                     height=graph.add(graph.mul(ridges, furrow), graph.mul(fine, 0.2)))
    if moss > 0:
        patch = graph.noise(scale=4.0, detail=6.0, roughness=0.7)
        mask = graph.mul(graph.mask(patch, 0.75 - 0.3 * moss, 0.08), graph.invert(ridges))
        coat.cover(mask, color=(0.10, 0.16, 0.04), roughness=0.95)
    return coat.finish(bump_strength=1.0, bump_distance=0.012)


def palm_trunk(color=(0.50, 0.47, 0.42), ring_spacing=0.11, lichen=0.4, foot=0.7, seed=0,
               name='palm_trunk'):
    """The smooth grey stem of a royal palm: pale, faintly ringed by old leaf scars every
    `ring_spacing` metres, with fine vertical fissures, lichen blotches and a foot darkened by
    damp and dirt (`foot`, over the first metre above object Z = 0)."""
    graph = Graph(name, seed)
    wobble = graph.noise(scale=3.0, detail=3.0)
    height = graph.add(graph.axis('Z'), graph.mul(wobble, 0.02))
    rings = graph.wave(period=ring_spacing, direction='Z',
                       vector=graph.combine(0.0, 0.0, height), profile='SIN')
    scar = graph.remap(rings, 0.0, 0.07, 1.0, 0.0, smooth=True)
    fissures = graph.noise(scale=75.0, detail=4.0, roughness=0.6, stretch=(1.0, 1.0, 0.05))
    fine = graph.noise(scale=160.0, detail=4.0, roughness=0.7)
    cloud = graph.noise(scale=1.6, detail=5.0, roughness=0.6)
    base = graph.hsv(color, value=graph.remap(cloud, 0.2, 0.8, 0.84, 1.12))
    base = graph.hsv(base, value=graph.remap(fissures, 0.25, 0.8, 1.08, 0.86))
    coat = wear.Coat(graph, base, roughness=graph.remap(fine, 0.2, 0.8, 0.78, 0.92),
                     height=graph.add(graph.mul(fissures, -0.35), graph.mul(fine, 0.1)))
    faded = graph.remap(graph.noise(scale=1.7, detail=4.0, roughness=0.6), 0.25, 0.75, 0.25, 0.9)
    coat.cover(graph.mul(scar, faded), color=graph_color(color, 0.5), roughness=0.95, height=-0.9)
    below = graph.remap(rings, 0.07, 0.6, 1.0, 0.0, smooth=True)
    coat.tint(graph.mul(below, graph.mul(faded, 0.3)), graph_color(color, 0.7))
    streaks = graph.noise(scale=7.0, detail=4.0, roughness=0.6, stretch=(1.0, 1.0, 0.06))
    coat.tint(graph.remap(streaks, 0.5, 0.8), (0.50, 0.47, 0.42), strength=0.6)
    if lichen > 0:
        blotch = graph.noise(scale=6.0, detail=7.0, roughness=0.72, distortion=0.4)
        coat.cover(graph.mul(graph.mask(blotch, 0.8 - 0.25 * lichen, 0.04), 0.8),
                   color=(0.72, 0.73, 0.66), roughness=0.95)
        dark = graph.noise(scale=2.5, detail=6.0, roughness=0.7)
        coat.tint(graph.mask(dark, 0.68, 0.1), (0.42, 0.44, 0.34), strength=0.5 * lichen)
    if foot > 0:
        low = graph.remap(graph.axis('Z'), 0.0, 1.0, 1.0, 0.0, smooth=True)
        coat.tint(graph.mul(low, graph.remap(cloud, 0.2, 0.8, 0.5, 1.0)), (0.45, 0.40, 0.33),
                  strength=foot)
    return coat.finish(bump_strength=0.8, bump_distance=0.006)


def foliage(color=(0.09, 0.22, 0.035), vein_axis='Y', gloss=0.5, dryness=0.15, seed=0,
            name='foliage'):
    """Leaf surface: waxy green with a paler midrib and veins along `vein_axis`, a different tint
    on every separate leaf of the mesh, and brown dry tips and patches by `dryness`."""
    graph = Graph(name, seed)
    stretch = _STRETCH[vein_axis]
    veins = graph.noise(scale=130.0, detail=3.0, stretch=stretch)
    cloud = graph.noise(scale=5.0, detail=4.0)
    island = graph.geometry('Random Per Island')
    base = graph.hsv(color, hue=graph.remap(island, 0.0, 1.0, 0.48, 0.52),
                     value=graph.remap(island, 0.0, 1.0, 0.7, 1.35))
    base = graph.hsv(base, value=graph.remap(veins, 0.2, 0.8, 0.88, 1.15),
                     saturation=graph.remap(cloud, 0.2, 0.8, 0.9, 1.1))
    coat = wear.Coat(graph, base, roughness=graph.remap(veins, 0.2, 0.8, 0.62 - 0.3 * gloss,
                                                        0.72 - 0.3 * gloss),
                     height=graph.mul(veins, 0.5))
    if dryness > 0:
        dry = graph.noise(scale=3.5, detail=6.0, roughness=0.7)
        mask = graph.mask(graph.add(dry, graph.mul(island, 0.35)), 1.12 - 0.45 * dryness, 0.06)
        coat.cover(mask, color=(0.30, 0.20, 0.07), roughness=0.85)
    return coat.finish(bump_strength=0.4, bump_distance=0.001, specular=0.6)


def skin(tone=(0.55, 0.36, 0.26), freckles=0.2, seed=0, name='skin'):
    """Human skin of any `tone`: blotchy warmth, pores in the normal map, a soft sheen. Baked
    lighting does the rest, since the game has no subsurface scattering."""
    graph = Graph(name, seed)
    blotch = graph.noise(scale=9.0, detail=4.0, roughness=0.55)
    pores = graph.voronoi(scale=1400.0, feature='F1')
    fine = graph.noise(scale=500.0, detail=3.0)
    base = graph.hsv(tone, hue=graph.remap(blotch, 0.2, 0.8, 0.492, 0.508),
                     saturation=graph.remap(blotch, 0.2, 0.8, 0.92, 1.12),
                     value=graph.remap(blotch, 0.2, 0.8, 0.94, 1.05))
    coat = wear.Coat(graph, base, roughness=graph.remap(fine, 0.2, 0.8, 0.48, 0.62),
                     height=graph.add(graph.mul(pores, 0.6), graph.mul(fine, 0.3)))
    if freckles > 0:
        spots = graph.voronoi(scale=260.0, feature='F1')
        mask = graph.mul(graph.remap(spots, 0.0, 0.25, 1.0, 0.0, smooth=True),
                         graph.mask(graph.noise(scale=30.0, detail=2.0), 0.72 - 0.2 * freckles))
        coat.tint(mask, graph_color(tone, 0.55), strength=0.6)
    coat.tint(graph.mul(graph.cavities(distance=0.015), 0.7), graph_color(tone, 0.55))
    return coat.finish(bump_strength=0.25, bump_distance=0.0004, specular=0.4, subsurface=0.1)
