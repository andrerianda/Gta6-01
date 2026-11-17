"""Bare and coated metals: chrome, brushed and cast metal, galvanised, rusting and corrugated."""
from . import wear
from .nodes import Graph


def chrome(tint=(0.88, 0.89, 0.90), smudges=0.3, seed=0, name='chrome'):
    """Mirror-bright plating: bumpers, trim, handles. Smudges break up the reflection a little."""
    graph = Graph(name, seed)
    film = graph.noise(scale=12.0, detail=5.0, roughness=0.6)
    roughness = graph.remap(film, 0.3, 0.8, 0.04, 0.04 + 0.22 * smudges)
    coat = wear.Coat(graph, tint, roughness=roughness, metallic=1.0)
    coat.tint(graph.mul(graph.cavities(distance=0.02), 0.9), wear.GRIME, strength=0.6)
    return coat.finish()


def brushed_metal(color=(0.60, 0.61, 0.62), roughness=0.34, direction='Z', grime=0.2, seed=0,
                  name='brushed_metal'):
    """Brushed steel or aluminium; the brushing runs along the object axis `direction`."""
    graph = Graph(name, seed)
    stretch = {'X': (0.012, 1.0, 1.0), 'Y': (1.0, 0.012, 1.0), 'Z': (1.0, 1.0, 0.012)}[direction]
    lines = graph.noise(scale=260.0, detail=3.0, roughness=0.6, stretch=stretch)
    broad = graph.noise(scale=3.0, detail=3.0)
    coat = wear.Coat(graph, graph.hsv(color, value=graph.remap(lines, 0.2, 0.8, 0.9, 1.08)),
                     roughness=graph.remap(lines, 0.2, 0.8, roughness - 0.08, roughness + 0.12),
                     metallic=1.0, height=graph.mul(lines, 0.25))
    coat.roughness = graph.add(coat.roughness, graph.remap(broad, 0.3, 0.8, 0.0, 0.08))
    wear.grime(coat, amount=grime)
    return coat.finish(bump_strength=0.25, bump_distance=0.0004)


def cast_metal(color=(0.10, 0.10, 0.105), roughness=0.55, rust=0.15, seed=0, name='cast_metal'):
    """Cast iron or dark forged steel with a pitted skin: bollards, lamp bases, grates, engines."""
    graph = Graph(name, seed)
    pits = graph.noise(scale=140.0, detail=4.0, roughness=0.7)
    broad = graph.noise(scale=6.0, detail=4.0)
    coat = wear.Coat(graph, graph.hsv(color, value=graph.remap(broad, 0.2, 0.8, 0.8, 1.2)),
                     roughness=graph.remap(pits, 0.2, 0.8, roughness - 0.1, roughness + 0.2),
                     metallic=1.0, height=pits)
    edge = graph.mul(graph.edges(radius=0.01), graph.remap(broad, 0.3, 0.7))
    coat.cover(edge, color=(0.42, 0.41, 0.40), roughness=0.3)
    wear.rust_spots(coat, amount=rust)
    wear.grime(coat, amount=0.3)
    return coat.finish(bump_strength=0.5, bump_distance=0.001)


def galvanized(spangle=0.6, rust=0.1, seed=0, name='galvanized'):
    """Hot-dip galvanised steel with its crystalline spangle: poles, guard rails, ducts, fences."""
    graph = Graph(name, seed)
    crystals = graph.voronoi(scale=55.0, output='Color')
    shade = graph.axis('X', crystals)
    color = graph.ramp(shade, [(0.0, (0.47, 0.49, 0.51)), (1.0, (0.60, 0.62, 0.64))])
    coat = wear.Coat(graph, graph.mix(1.0 - spangle, color, (0.54, 0.56, 0.58)),
                     roughness=graph.remap(shade, 0.0, 1.0, 0.46, 0.58), metallic=1.0)
    chalk = graph.noise(scale=3.0, detail=5.0)
    coat.cover(graph.mul(graph.remap(chalk, 0.45, 0.8), 0.6), color=(0.66, 0.67, 0.68),
               roughness=0.75, metallic=0.3)
    wear.rust_spots(coat, amount=rust)
    wear.grime(coat, amount=0.3)
    return coat.finish()


def rusty_metal(color=(0.30, 0.30, 0.31), rust=0.7, seed=0, name='rusty_metal'):
    """Unprotected steel going over to rust: `rust` 0.3 is spotted, 1.0 is solid scale."""
    graph = Graph(name, seed)
    grain = graph.noise(scale=120.0, detail=5.0, roughness=0.75)
    coat = wear.Coat(graph, graph.vary(color, amount=0.15, scale=4.0), roughness=0.45,
                     metallic=1.0, height=graph.mul(grain, 0.3))
    blotches = graph.noise(scale=3.5, detail=8.0, roughness=0.72, distortion=0.6)
    mask = graph.mask(blotches, threshold=0.95 - 0.75 * rust, softness=0.12)
    rust_color = graph.ramp(graph.noise(scale=30.0, detail=6.0, roughness=0.8),
                            [(0.2, wear.RUST_DARK), (0.55, wear.RUST_LIGHT),
                             (0.85, (0.50, 0.24, 0.08))])
    coat.cover(mask, color=rust_color, roughness=0.93, metallic=0.0, height=grain)
    wear.grime(coat, amount=0.3)
    return coat.finish(bump_strength=0.7, bump_distance=0.0015)


def corrugated_metal(color=(0.56, 0.58, 0.60), pitch=0.076, depth=0.018, direction='X',
                     painted=False, rust=0.4, seed=0, name='corrugated_metal'):
    """Corrugated sheet for roofs, fences and shutters. The waves repeat every `pitch` metres
    along `direction` and are baked into the normal map, so a flat plane reads as ribbed; rust
    gathers in the troughs and at the bottom edge."""
    graph = Graph(name, seed)
    waves = graph.wave(period=pitch, direction=direction)
    broad = graph.noise(scale=1.5, detail=4.0)
    base = graph.vary(color, amount=0.1, scale=2.0)
    coat = wear.Coat(graph, base, roughness=0.5 if painted else 0.4,
                     metallic=0.0 if painted else 1.0, height=waves)
    trough = graph.remap(waves, 0.0, 0.5, 1.0, 0.0)
    coat.tint(graph.mul(trough, graph.remap(broad, 0.2, 0.8, 0.4, 1.0)), wear.GRIME, strength=0.5)
    if rust > 0:
        runs = graph.noise(scale=9.0, detail=5.0, stretch=(1.0, 1.0, 0.08), distortion=0.3)
        mask = graph.mask(graph.add(graph.mul(runs, 0.6), graph.mul(broad, 0.5)),
                          threshold=0.95 - 0.45 * rust, softness=0.08)
        rust_color = graph.ramp(graph.noise(scale=40.0, detail=5.0, roughness=0.8),
                                [(0.2, wear.RUST_DARK), (0.7, wear.RUST_LIGHT)])
        coat.cover(mask, color=rust_color, roughness=0.92, metallic=0.0)
    return coat.finish(bump_strength=1.0, bump_distance=depth)
