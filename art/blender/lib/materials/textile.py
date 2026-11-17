"""Cloth and leather for clothing, seats, awnings and canvas."""
from . import wear
from .nodes import Graph


def fabric(color=(0.12, 0.18, 0.35), thread=0.0016, twill=False, fade=0.3, dirt=0.2, seed=0,
           name='fabric'):
    """Woven cloth with threads `thread` metres apart: plain weave (cotton, canvas, linen) or
    `twill` diagonals (denim, suiting). fade bleaches the folds and exposed areas."""
    graph = Graph(name, seed)
    warp = graph.wave(period=thread, direction='X')
    weft = graph.wave(period=thread, direction='Z')
    if twill:
        diagonal = graph.add(graph.axis('X'), graph.axis('Z'))
        weave = graph.wave(period=thread * 2.0, direction='X',
                           vector=graph.combine(diagonal, 0.0, 0.0))
        weave = graph.add(graph.mul(weave, 0.7), graph.mul(graph.mul(warp, weft), 0.3))
    else:
        weave = graph.add(graph.mul(warp, weft),
                          graph.mul(graph.mul(graph.invert(warp), graph.invert(weft)), 0.8))
    slub = graph.noise(scale=90.0, detail=3.0, stretch=(0.08, 1.0, 1.0))
    cloud = graph.noise(scale=4.0, detail=5.0, roughness=0.6)
    base = graph.hsv(color, value=graph.remap(weave, 0.0, 1.0, 0.82, 1.1))
    base = graph.hsv(base, value=graph.remap(slub, 0.2, 0.8, 0.94, 1.06),
                     saturation=graph.remap(cloud, 0.2, 0.8, 1.0, 1.0 - 0.35 * fade))
    base = graph.hsv(base, value=graph.remap(cloud, 0.2, 0.8, 1.0, 1.0 + 0.25 * fade))
    coat = wear.Coat(graph, base, roughness=0.9, height=graph.add(weave, graph.mul(slub, 0.3)))
    if dirt > 0:
        wear.grime(coat, amount=dirt, distance=0.03)
    return coat.finish(bump_strength=0.5, bump_distance=thread * 0.4, sheen=0.3)


def leather(color=(0.10, 0.05, 0.03), grain=0.7, wear_amount=0.4, seed=0, name='leather'):
    """Grained leather or vinyl for seats, jackets, shoes and bags; `wear_amount` rubs the high
    points pale and opens creases."""
    graph = Graph(name, seed)
    cells = graph.voronoi(scale=520.0, feature='DISTANCE_TO_EDGE')
    pebbles = graph.remap(cells, 0.0, 0.35, 0.0, 1.0, smooth=True)
    creases = graph.noise(scale=18.0, detail=4.0, roughness=0.6, distortion=1.2)
    cloud = graph.noise(scale=3.0, detail=4.0)
    base = graph.hsv(color, value=graph.remap(pebbles, 0.0, 1.0, 0.7, 1.12))
    coat = wear.Coat(graph, base, roughness=graph.remap(pebbles, 0.0, 1.0, 0.62, 0.42),
                     height=graph.mul(pebbles, grain))
    if wear_amount > 0:
        rub = graph.mul(graph.remap(cloud, 0.35, 0.8), wear_amount)
        coat.cover(graph.mul(rub, pebbles), color=graph.hsv(color, saturation=0.7, value=2.4),
                   roughness=0.55)
        fold = graph.mask(creases, 0.72 - 0.15 * wear_amount, 0.04)
        coat.cover(graph.mul(fold, 0.8), color=graph.hsv(color, value=0.5), height=-1.5)
        wear.grime(coat, amount=0.4 * wear_amount, distance=0.02)
    return coat.finish(bump_strength=0.45, bump_distance=0.0006)
