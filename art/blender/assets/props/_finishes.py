"""Finishes for the prop sets: the surface patterns street furniture needs on top of the shared
material library (hazard stripes, slotted grilles, tread plate, blank label panels, wire mesh
for alpha-tested cards, produce, bin bags), each with the library's wear layers on top.

A pattern here is a function of the material graph that returns a colour or a mask, driven by
object coordinates in metres like everything in the library, so it lands where the modelling
puts it. No lettering anywhere: labels and sign faces stay blank for the game to paint.
"""
from lib import materials as M
from lib.materials import wear


def bands(graph, coordinate, period, share=0.5, soft=0.03, phase=0.0):
    """A 0..1 mask of bands repeating every `period` metres along a coordinate: `share` of each
    period is on, centred on the multiples of the period (moved by `phase` periods)."""
    turn = graph.math('FRACT', graph.add(graph.mul(coordinate, 1.0 / period), phase))
    edge = graph.math('ABSOLUTE', graph.sub(graph.mul(turn, 2.0), 1.0))
    return graph.mask(edge, 1.0 - share, soft)


def between(graph, value, low, high, soft=0.004):
    """A 0..1 mask that is on where low < value < high."""
    return graph.mul(graph.mask(value, low, soft), graph.invert(graph.mask(value, high, soft)))


def window(graph, axis_a, low_a, high_a, axis_b, low_b, high_b, soft=0.004):
    """A rectangle on two object axes, as a 0..1 mask."""
    return graph.mul(between(graph, graph.axis(axis_a), low_a, high_a, soft),
                     between(graph, graph.axis(axis_b), low_b, high_b, soft))


def striped(color_a, color_b, period, axes='Z', share=0.5, phase=0.0):
    """A colour pattern of stripes across the sum of the given axes ('XZ' gives diagonals)."""
    def pattern(graph):
        coordinate = graph.axis(axes[0])
        for name in axes[1:]:
            coordinate = graph.add(coordinate, graph.axis(name))
        return graph.mix(bands(graph, coordinate, period, share, phase=phase), color_a, color_b)
    return pattern


def coated(name, color, seed=0, roughness=0.42, metallic=0.0, chips=0.3, rust=0.2, grime=0.4,
           dust=0.2, fade=0.3, splash=0.0, scratches=0.2, plastic=False, height=None, bump=0.0015,
           variation=0.06):
    """A painted or moulded surface with the library's wear on it. `color` is a colour or a
    pattern function of the graph; plastic=True scuffs to a paler tone instead of chipping to
    primer and steel, and never rusts; `height` is an optional relief function of the graph."""
    graph = M.Graph(name, seed)
    base = color(graph) if callable(color) else graph.rgb(color)
    base = graph.vary(base, amount=variation, scale=2.5)
    coat = wear.Coat(graph, base, roughness=roughness, metallic=metallic)
    coat.height = graph.mul(graph.noise(scale=220.0, detail=2.0), 0.05)
    if height is not None:
        coat.height = graph.add(coat.height, height(graph))
    wear.sun_fade(coat, amount=fade)
    wear.scratches(coat, amount=scratches)
    if plastic:
        pale = graph.hsv(base, saturation=0.55, value=1.7)
        patches = graph.remap(graph.noise(scale=5.0, detail=4.0), 0.2, 0.7)
        rubbed = graph.mul(graph.remap(graph.edges(radius=0.012), 0.1, 0.9), patches)
        coat.cover(graph.mul(rubbed, min(1.0, 0.4 + chips)), color=pale, roughness=0.75)
    else:
        wear.chipped_edges(coat, amount=chips)
        wear.rust_spots(coat, amount=rust)
    wear.grime(coat, amount=grime)
    wear.dust(coat, amount=dust)
    wear.ground_splash(coat, amount=splash)
    return coat.finish(bump_strength=0.7, bump_distance=bump)


def enamel(name, color, seed=0, wear_amount=0.4, gloss=0.5, splash=0.0):
    """Painted steel at one overall level of wear (0 new, 1 abandoned)."""
    return M.painted_metal(color=color, gloss=gloss, chips=0.25 + 0.5 * wear_amount,
                           rust=0.15 + 0.6 * wear_amount, grime=0.3 + 0.4 * wear_amount,
                           dust=0.3, fade=0.2 + 0.4 * wear_amount, splash=splash, seed=seed,
                           name=name)


def moulded(name, color, seed=0, wear_amount=0.4, roughness=0.5, splash=0.0):
    """Coloured moulded plastic (bins, barriers, chairs): sun-faded, scuffed pale, never rusty."""
    return coated(name, color, seed=seed, roughness=roughness, chips=0.2 + 0.4 * wear_amount,
                  grime=0.3 + 0.4 * wear_amount, dust=0.25, fade=0.3 + 0.5 * wear_amount,
                  splash=splash, scratches=0.3 + 0.4 * wear_amount, plastic=True)


def slotted(name, color, period=0.02, axis='Z', seed=0, depth=0.004, share=0.45, wear_amount=0.3):
    """Painted sheet with rows of louvres or slots across an axis, sunk into the normal map and
    dark inside: vents, grilles, speaker panels."""
    def pattern(graph):
        slots = bands(graph, graph.axis(axis), period, share)
        return graph.mix(slots, color, (0.012, 0.012, 0.013))

    def relief(graph):
        return graph.mul(bands(graph, graph.axis(axis), period, share), -1.0)

    return coated(name, pattern, seed=seed, chips=0.2 + 0.3 * wear_amount, rust=0.3 * wear_amount,
                  grime=0.4, dust=0.15, fade=0.2, height=relief, bump=depth, variation=0.03)


def checker_plate(name, color=(0.33, 0.33, 0.34), seed=0, rust=0.3):
    """Cast or rolled metal with a raised non-slip pattern of small lozenges."""
    graph = M.Graph(name, seed)
    cells = graph.voronoi(scale=38.0, feature='F1', randomness=0.0, stretch=(1.0, 1.0, 0.0))
    studs = graph.remap(cells, 0.18, 0.34, 1.0, 0.0, smooth=True)
    broad = graph.noise(scale=5.0, detail=4.0)
    base = graph.hsv(color, value=graph.remap(studs, 0.0, 1.0, 0.8, 1.25))
    coat = wear.Coat(graph, graph.hsv(base, value=graph.remap(broad, 0.2, 0.8, 0.85, 1.15)),
                     roughness=graph.remap(studs, 0.0, 1.0, 0.7, 0.4), metallic=1.0, height=studs)
    wear.rust_spots(coat, amount=rust, streaks=False)
    wear.grime(coat, amount=0.6)
    wear.dust(coat, amount=0.35)
    return coat.finish(bump_strength=1.0, bump_distance=0.004)


def wire_mesh(name='cutout', pitch=0.05, wire=0.009, axes=('X', 'Z'), color=(0.45, 0.46, 0.47),
              seed=0, rust=0.25, pitch_b=None):
    """Welded wire mesh for alpha-tested cards (the 'cutout' role): bars every `pitch` metres
    along two object axes, everything between them cut away. For baskets, cages and racks."""
    graph = M.Graph(name, seed)
    first = bands(graph, graph.axis(axes[0]), pitch, share=wire / pitch, soft=0.02)
    second = bands(graph, graph.axis(axes[1]), pitch_b or pitch, share=wire / (pitch_b or pitch),
                   soft=0.02)
    bars = graph.maximum(first, second)
    coat = wear.Coat(graph, graph.vary(color, amount=0.1, scale=6.0), roughness=0.42, metallic=1.0)
    wear.rust_spots(coat, amount=rust, size=0.08, streaks=False)
    material = coat.finish()
    graph.feed(graph.bsdf.inputs['Alpha'], graph.mask(bars, 0.5, 0.2))
    return material


def glazed(name, color, seed=0):
    """Glazed ceramic: insulators, tiles, sanitary ware."""
    graph = M.Graph(name, seed)
    cloud = graph.noise(scale=9.0, detail=3.0)
    coat = wear.Coat(graph, graph.hsv(color, value=graph.remap(cloud, 0.2, 0.8, 0.8, 1.15)),
                     roughness=graph.remap(cloud, 0.2, 0.8, 0.12, 0.3))
    wear.grime(coat, amount=0.6, distance=0.04)
    wear.dust(coat, amount=0.3)
    return coat.finish()
