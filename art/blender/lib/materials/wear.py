"""Wear layers: what turns a clean procedural surface into one that has stood outside for years.

A Coat holds the channels of a surface while layers are stacked on it (colour, roughness,
metalness and a height for the bump), then finish() feeds the Principled BSDF. Each layer takes
an `amount` from 0 (none) to 1 (heavy) and uses masks that only Cycles can compute (worn edges,
dirty cavities), which is exactly why they are baked. Sizes are metres: the defaults suit
street furniture seen from a few metres; scale them down for hand-held things.

    coat = Coat(graph, color, roughness=0.4)
    chipped_edges(coat, amount=0.4)
    rust_spots(coat, amount=0.2)
    grime(coat, amount=0.5)
    material = coat.finish()
"""
from .nodes import Graph

BARE_STEEL = (0.30, 0.29, 0.28)
PRIMER = (0.46, 0.43, 0.39)
RUST_DARK = (0.060, 0.022, 0.010)
RUST_LIGHT = (0.33, 0.11, 0.030)
RUST_STAIN = (0.52, 0.27, 0.10)
GRIME = (0.060, 0.050, 0.040)
DUST = (0.50, 0.45, 0.38)


class Coat:
    """The channels of a surface under construction. Channels are sockets or constants."""

    def __init__(self, graph: Graph, color, roughness=0.5, metallic=0.0, height=0.0):
        self.graph = graph
        self.color = color
        self.roughness = roughness
        self.metallic = metallic
        self.height = height

    def cover(self, mask, color=None, roughness=None, metallic=None, height=None):
        """Lays a material over the current one where `mask` is 1."""
        graph = self.graph
        if color is not None:
            self.color = graph.mix(mask, self.color, color)
        if roughness is not None:
            self.roughness = graph.mix_value(mask, self.roughness, roughness)
        if metallic is not None:
            self.metallic = graph.mix_value(mask, self.metallic, metallic)
        if height is not None:
            self.height = graph.add(self.height, graph.mul(mask, height))
        return self

    def tint(self, mask, color, strength=1.0):
        """Multiplies a colour in where `mask` is 1 (stains, shadows of dirt)."""
        graph = self.graph
        self.color = graph.mix(graph.mul(mask, strength), self.color, color, blend='MULTIPLY')
        return self

    def finish(self, bump_strength=0.5, bump_distance=0.002, **surface):
        """Feeds the Principled BSDF and returns the material; extra keywords go to
        Graph.surface (alpha, emission, coat, ...)."""
        graph = self.graph
        normal = None
        if not isinstance(self.height, (int, float)):
            normal = graph.bump(self.height, strength=bump_strength, distance=bump_distance)
        return graph.surface(base_color=self.color, roughness=self.roughness,
                             metallic=self.metallic, normal=normal, **surface)


def chipped_edges(coat, amount=0.3, edge_radius=0.025, chip_size=0.035, under=PRIMER,
                  metal=BARE_STEEL):
    """Paint knocked off along exposed edges and corners and in scattered scars on the flats:
    primer shows first, bare metal at the core of each chip. chip_size is the typical chip."""
    if amount <= 0:
        return coat
    graph = coat.graph
    edges = graph.remap(graph.edges(radius=edge_radius), 0.1, 0.9)
    coarse = graph.noise(scale=1.0 / chip_size, detail=3.0, roughness=0.55)
    ragged = graph.noise(scale=4.0 / chip_size, detail=3.0, roughness=0.6)
    pattern = graph.add(graph.mul(coarse, 0.72), graph.mul(ragged, 0.28))
    signal = graph.add(pattern, graph.mul(edges, 0.34 + 0.4 * amount))
    threshold = 0.79 - 0.17 * amount
    primer_mask = graph.mask(signal, threshold=threshold, softness=0.012)
    metal_mask = graph.mask(signal, threshold=threshold + 0.07, softness=0.012)
    coat.cover(primer_mask, color=under, roughness=0.8, metallic=0.0, height=-0.7)
    coat.cover(metal_mask, color=metal, roughness=0.45, metallic=0.85, height=-0.3)
    return coat


def rust_spots(coat, amount=0.3, size=0.12, streaks=True):
    """Rust that blooms from creases and worn edges in blotches about `size` across and
    bleeds down the surface in streaks."""
    if amount <= 0:
        return coat
    graph = coat.graph
    blotches = graph.noise(scale=1.0 / size, detail=6.0, roughness=0.62, distortion=0.5)
    cavity = graph.remap(graph.cavities(distance=0.05), 0.05, 0.6)
    edges = graph.remap(graph.edges(radius=0.02), 0.1, 0.9)
    signal = graph.add(blotches, graph.add(graph.mul(cavity, 0.30 + 0.25 * amount),
                                           graph.mul(edges, 0.12 + 0.15 * amount)))
    threshold = 0.84 - 0.24 * amount
    if streaks:
        runs = graph.noise(scale=0.9 / size, detail=3.0, roughness=0.5, stretch=(1.0, 1.0, 0.07))
        fine_runs = graph.noise(scale=4.0 / size, detail=2.0, stretch=(1.0, 1.0, 0.03))
        near = graph.remap(signal, threshold - 0.22, threshold)
        stain = graph.mul(graph.mul(graph.remap(runs, 0.42, 0.7), graph.remap(fine_runs, 0.2, 0.8, 0.4, 1.0)),
                          graph.remap(near, 0.0, 1.0, 0.25, 1.0))
        coat.tint(stain, RUST_STAIN, strength=min(0.9, 0.45 + 0.6 * amount))
    mask = graph.mask(signal, threshold=threshold, softness=0.03)
    grain = graph.noise(scale=18.0 / size, detail=4.0, roughness=0.75)
    color = graph.ramp(grain, [(0.25, RUST_DARK), (0.6, RUST_LIGHT), (0.9, (0.48, 0.21, 0.07))])
    coat.cover(mask, color=color, roughness=0.93, metallic=0.0, height=graph.mul(grain, 0.9))
    return coat


def grime(coat, amount=0.4, distance=0.07, color=GRIME):
    """Dirt packed into creases and under overhangs, a thin uneven film over everything and
    soft vertical runs where rain carried it down."""
    if amount <= 0:
        return coat
    graph = coat.graph
    cavity = graph.remap(graph.cavities(distance=distance), 0.03, 0.55)
    breakup = graph.noise(scale=11.0, detail=5.0, roughness=0.6)
    mask = graph.mul(cavity, graph.remap(breakup, 0.1, 0.9, 0.55, 1.0))
    coat.tint(mask, color, strength=min(1.0, 0.5 + amount * 0.5))
    coat.roughness = graph.mix_value(graph.mul(mask, 0.5 + 0.5 * amount), coat.roughness, 0.92)
    film = graph.noise(scale=2.2, detail=6.0, roughness=0.62)
    coat.tint(graph.remap(film, 0.35, 0.8), (0.42, 0.38, 0.33), strength=0.55 * amount)
    runs = graph.noise(scale=16.0, detail=2.0, stretch=(1.0, 1.0, 0.03))
    large = graph.noise(scale=1.1, detail=3.0)
    run_mask = graph.mul(graph.remap(runs, 0.5, 0.75), graph.remap(large, 0.38, 0.7))
    coat.tint(run_mask, (0.25, 0.22, 0.19), strength=0.75 * amount)
    return coat


def dust(coat, amount=0.3, color=DUST):
    """Pale dust and sun bleaching on everything that faces the sky."""
    if amount <= 0:
        return coat
    graph = coat.graph
    top = graph.facing_up(sharpness=1.2)
    breakup = graph.noise(scale=4.0, detail=5.0, roughness=0.6)
    mask = graph.mul(graph.mul(top, graph.remap(breakup, 0.15, 0.8, 0.45, 1.0)), min(1.0, amount * 1.6))
    coat.cover(mask, color=color, roughness=0.95)
    return coat


def ground_splash(coat, amount=0.4, height=0.3, color=(0.17, 0.14, 0.11)):
    """Mud and splash-back that fades out `height` metres above the ground (object Z = 0)."""
    if amount <= 0:
        return coat
    graph = coat.graph
    low = graph.remap(graph.axis('Z'), 0.0, height, 1.0, 0.0, smooth=True)
    breakup = graph.noise(scale=14.0, detail=6.0, roughness=0.7)
    mask = graph.mul(graph.mul(low, graph.remap(breakup, 0.15, 0.75, 0.3, 1.0)), min(1.0, amount * 1.5))
    coat.cover(mask, color=color, roughness=0.95, metallic=0.0)
    return coat


def scratches(coat, amount=0.3, length=0.25, color=None):
    """Sparse scratches about `length` long that catch the light (rougher, slightly sunk),
    gathered in the patches that get handled; optionally in a colour (the layer beneath)."""
    if amount <= 0:
        return coat
    graph = coat.graph
    lines_a = graph.noise(scale=7.0 / length, detail=1.0, stretch=(1.0, 0.035, 0.25), distortion=0.15)
    lines_b = graph.noise(scale=6.0 / length, detail=1.0, stretch=(0.3, 1.0, 0.03), distortion=0.15)
    patches = graph.remap(graph.noise(scale=1.6 / length, detail=3.0), 0.5, 0.72)
    lines = graph.maximum(graph.mask(lines_a, 0.71, 0.02), graph.mask(lines_b, 0.72, 0.02))
    mask = graph.mul(graph.mul(lines, patches), min(1.0, 0.4 + amount))
    if color is not None:
        coat.cover(mask, color=color)
    coat.roughness = graph.mix_value(mask, coat.roughness, 0.75)
    coat.height = graph.add(coat.height, graph.mul(mask, -0.5))
    return coat


def sun_fade(coat, amount=0.3, chalk=(0.80, 0.80, 0.78)):
    """Paint chalking and bleaching in the sun: paler, duller and rougher in broad patches,
    most on the faces that look up."""
    if amount <= 0:
        return coat
    graph = coat.graph
    patches = graph.noise(scale=1.3, detail=5.0, roughness=0.6)
    exposure = graph.remap(graph.axis('Z', graph.geometry('True Normal')), -0.3, 1.0, 0.45, 1.0)
    mask = graph.mul(graph.mul(graph.remap(patches, 0.3, 0.8), exposure), amount)
    coat.color = graph.mix(graph.mul(mask, 0.55), coat.color, chalk)
    coat.roughness = graph.mix_value(mask, coat.roughness, 0.85)
    return coat
