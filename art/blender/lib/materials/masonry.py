"""Mineral surfaces: concrete, stucco, brick, stone, terracotta, tiles, asphalt and sand."""
from . import wear
from .nodes import Graph


def _cracks(graph, scale=2.5, width=0.012, density=0.5):
    """A 0..1 mask of thin wandering cracks; `density` thins them out in patches."""
    distorted = graph.mapped(scale=1.0)
    wobble = graph.noise(scale=scale * 3.0, detail=4.0, color=True)
    vector = graph.mix(0.12, distorted, wobble)
    edge = graph.voronoi(scale=scale, feature='DISTANCE_TO_EDGE', vector=vector)
    lines = graph.remap(edge, 0.0, width, 1.0, 0.0, smooth=True)
    patches = graph.noise(scale=scale * 0.6, detail=2.0)
    return graph.mul(lines, graph.mask(patches, 1.0 - density, 0.12))


def concrete(color=(0.47, 0.46, 0.44), stains=0.5, cracks=0.35, pits=0.5, seed=0,
             name='concrete'):
    """Cast concrete: blotchy grey with form pits, hairline cracks and rain stains."""
    graph = Graph(name, seed)
    cloud = graph.noise(scale=1.8, detail=6.0, roughness=0.62)
    fine = graph.noise(scale=60.0, detail=5.0, roughness=0.7)
    base = graph.hsv(color, value=graph.remap(cloud, 0.2, 0.8, 0.78, 1.16))
    base = graph.hsv(base, value=graph.remap(fine, 0.2, 0.8, 0.93, 1.07))
    coat = wear.Coat(graph, base, roughness=graph.remap(fine, 0.2, 0.8, 0.78, 0.95),
                     height=graph.mul(fine, 0.35))
    holes = graph.voronoi(scale=55.0, feature='F1')
    hole_mask = graph.mul(graph.remap(holes, 0.0, 0.16, 1.0, 0.0, smooth=True),
                          graph.mask(graph.noise(scale=7.0, detail=2.0), 0.72 - 0.3 * pits, 0.1))
    coat.cover(hole_mask, color=graph.hsv(color, value=0.45), height=-1.0)
    if cracks > 0:
        crack_mask = _cracks(graph, scale=2.2, density=cracks)
        coat.cover(crack_mask, color=graph.hsv(color, value=0.3), height=-1.5)
    if stains > 0:
        runs = graph.noise(scale=6.0, detail=5.0, stretch=(1.0, 1.0, 0.05), distortion=0.2)
        coat.tint(graph.mul(graph.mask(runs, 0.55, 0.15), graph.remap(cloud, 0.3, 0.7)),
                  (0.25, 0.23, 0.20), strength=0.7 * stains)
    wear.grime(coat, amount=0.5 * stains + 0.2)
    wear.ground_splash(coat, amount=0.5 * stains, height=0.3)
    return coat.finish(bump_strength=0.6, bump_distance=0.003)


def painted_concrete(color=(0.80, 0.78, 0.70), peeling=0.3, stains=0.5, seed=0,
                     name='painted_concrete'):
    """Concrete or render under a coat of masonry paint that flakes off in patches."""
    graph = Graph(name, seed)
    cloud = graph.noise(scale=1.4, detail=5.0)
    fine = graph.noise(scale=70.0, detail=4.0, roughness=0.7)
    paint = graph.hsv(graph.vary(color, amount=0.06, scale=1.2),
                      saturation=graph.remap(cloud, 0.3, 0.8, 1.0, 0.85))
    coat = wear.Coat(graph, paint, roughness=0.72, height=graph.mul(fine, 0.2))
    if peeling > 0:
        flakes = graph.noise(scale=5.0, detail=8.0, roughness=0.75, distortion=0.5)
        seeds = graph.add(flakes, graph.mul(graph.edges(radius=0.03), 0.35))
        mask = graph.mask(seeds, threshold=1.0 - 0.42 * peeling, softness=0.015)
        bare = graph.hsv((0.45, 0.44, 0.42), value=graph.remap(fine, 0.2, 0.8, 0.8, 1.15))
        coat.cover(mask, color=bare, roughness=0.9, height=-1.2)
    if stains > 0:
        runs = graph.noise(scale=5.0, detail=5.0, stretch=(1.0, 1.0, 0.045), distortion=0.2)
        coat.tint(graph.mul(graph.mask(runs, 0.56, 0.14), graph.remap(cloud, 0.25, 0.7)),
                  (0.30, 0.27, 0.22), strength=0.65 * stains)
    wear.grime(coat, amount=0.3 + 0.4 * stains)
    wear.ground_splash(coat, amount=0.5 * stains, height=0.35)
    return coat.finish(bump_strength=0.5, bump_distance=0.002)


def stucco(color=(0.93, 0.72, 0.62), texture=0.6, stains=0.45, cracks=0.25, seed=0,
           name='stucco'):
    """Trowelled stucco in any pastel: the wall finish of the whole city. `texture` runs from
    smooth float finish (0.2) to heavy dash (1.0); stains are rain runs from ledges and damp
    rising from the pavement."""
    graph = Graph(name, seed)
    # Relief sized for game textures (a few millimetres per texel): centimetre lumps over
    # broad trowel sweeps. Anything finer would average away in the bake.
    lumps = graph.noise(scale=42.0, detail=3.0, roughness=0.6)
    trowel = graph.noise(scale=7.0, detail=4.0, roughness=0.55, distortion=0.6)
    cloud = graph.noise(scale=0.9, detail=4.0)
    base = graph.hsv(color, value=graph.remap(cloud, 0.2, 0.8, 0.90, 1.06),
                     saturation=graph.remap(cloud, 0.2, 0.8, 1.06, 0.86))
    base = graph.hsv(base, value=graph.remap(graph.add(graph.mul(lumps, 0.6), graph.mul(trowel, 0.4)),
                                             0.3, 0.7, 0.90, 1.07))
    height = graph.add(graph.mul(lumps, texture), graph.mul(trowel, 0.8 * texture))
    coat = wear.Coat(graph, base, roughness=graph.remap(lumps, 0.2, 0.8, 0.8, 0.95), height=height)
    if cracks > 0:
        crack_mask = _cracks(graph, scale=1.6, width=0.008, density=cracks)
        coat.cover(crack_mask, color=graph.hsv(color, saturation=0.5, value=0.35), height=-1.5)
    if stains > 0:
        runs = graph.noise(scale=4.5, detail=5.0, stretch=(1.0, 1.0, 0.04), distortion=0.15)
        coat.tint(graph.mul(graph.mask(runs, 0.57, 0.14), graph.remap(cloud, 0.25, 0.7)),
                  (0.36, 0.33, 0.28), strength=0.6 * stains)
        wear.grime(coat, amount=0.25 + 0.4 * stains)
        wear.ground_splash(coat, amount=0.45 * stains, height=0.4, color=(0.30, 0.27, 0.22))
    return coat.finish(bump_strength=0.8, bump_distance=0.008)


def brick(color=(0.42, 0.16, 0.10), mortar=(0.55, 0.52, 0.47), brick_width=0.22,
          row_height=0.075, variation=0.5, stains=0.4, seed=0, name='brick'):
    """Coursed brickwork in real sizes (metres), with mortar joints sunk into the normal map and
    every brick fired a slightly different colour."""
    graph = Graph(name, seed)
    coords = graph.wall_coords()
    pattern, joint = graph.brick(vector=coords, brick_width=brick_width, row_height=row_height,
                                 mortar=0.011, smooth=0.25, color1=(1.0, 1.0, 1.0),
                                 color2=(0.0, 0.0, 0.0))
    tone = graph.axis('X', pattern)
    fine = graph.noise(scale=90.0, detail=5.0, roughness=0.72)
    burn = graph.noise(scale=3.0, detail=3.0)
    face = graph.hsv(color, hue=graph.remap(tone, 0.0, 1.0, 0.5 - 0.02 * variation,
                                            0.5 + 0.02 * variation),
                     value=graph.remap(tone, 0.0, 1.0, 1.0 - 0.45 * variation,
                                       1.0 + 0.4 * variation))
    face = graph.hsv(face, value=graph.remap(graph.add(fine, graph.mul(burn, 0.6)), 0.4, 1.2,
                                             0.82, 1.12))
    coat = wear.Coat(graph, face, roughness=graph.remap(fine, 0.2, 0.8, 0.8, 0.95),
                     height=graph.mul(fine, 0.25))
    mortar_color = graph.hsv(mortar, value=graph.remap(fine, 0.2, 0.8, 0.85, 1.1))
    coat.cover(joint, color=mortar_color, roughness=0.95, height=-1.0)
    if stains > 0:
        cloud = graph.noise(scale=1.2, detail=4.0)
        coat.tint(graph.mask(cloud, 0.6, 0.15), (0.45, 0.42, 0.38), strength=0.5 * stains)
        wear.grime(coat, amount=0.4 * stains + 0.15)
        wear.ground_splash(coat, amount=0.4 * stains, height=0.3)
    return coat.finish(bump_strength=0.8, bump_distance=0.006)


def stone(color=(0.62, 0.57, 0.48), block=(0.6, 0.3), rough=0.6, stains=0.4, seed=0,
          name='stone'):
    """Cut stone blocks (coral limestone by default) of `block` = (width, height) metres with
    open joints; block=None gives one continuous rock face instead."""
    graph = Graph(name, seed)
    fine = graph.noise(scale=45.0, detail=7.0, roughness=0.75)
    cloud = graph.noise(scale=2.2, detail=5.0, roughness=0.6)
    pores = graph.voronoi(scale=38.0, feature='F1')
    base = graph.hsv(color, value=graph.remap(cloud, 0.2, 0.8, 0.82, 1.14))
    height = graph.add(graph.mul(fine, rough), graph.mul(cloud, 0.6 * rough))
    coat = wear.Coat(graph, base, roughness=graph.remap(fine, 0.2, 0.8, 0.75, 0.95), height=height)
    pore_mask = graph.remap(pores, 0.0, 0.2, 1.0, 0.0, smooth=True)
    coat.cover(graph.mul(pore_mask, rough), color=graph.hsv(color, value=0.5), height=-0.8)
    if block is not None:
        pattern, joint = graph.brick(vector=graph.wall_coords(), brick_width=block[0],
                                     row_height=block[1], mortar=0.008, smooth=0.3,
                                     color1=(1.0, 1.0, 1.0), color2=(0.0, 0.0, 0.0))
        tone = graph.axis('X', pattern)
        coat.color = graph.hsv(coat.color, value=graph.remap(tone, 0.0, 1.0, 0.9, 1.1))
        coat.cover(joint, color=graph.hsv(color, value=0.32), roughness=0.95, height=-2.0)
    if stains > 0:
        runs = graph.noise(scale=5.0, detail=5.0, stretch=(1.0, 1.0, 0.05))
        coat.tint(graph.mul(graph.mask(runs, 0.56, 0.14), graph.remap(cloud, 0.3, 0.7)),
                  (0.30, 0.29, 0.24), strength=0.7 * stains)
        wear.grime(coat, amount=0.3 + 0.3 * stains)
    return coat.finish(bump_strength=0.7, bump_distance=0.005)


def terracotta(color=(0.62, 0.25, 0.12), weathering=0.4, seed=0, name='terracotta'):
    """Fired clay for roof tiles, pots and pavers: orange-red with kiln burns and lichen bloom."""
    graph = Graph(name, seed)
    burn = graph.noise(scale=3.5, detail=5.0, roughness=0.6)
    fine = graph.noise(scale=110.0, detail=5.0, roughness=0.7)
    base = graph.hsv(color, hue=graph.remap(burn, 0.2, 0.8, 0.485, 0.515),
                     value=graph.remap(burn, 0.2, 0.8, 0.7, 1.2))
    base = graph.hsv(base, value=graph.remap(fine, 0.2, 0.8, 0.92, 1.08))
    coat = wear.Coat(graph, base, roughness=graph.remap(fine, 0.2, 0.8, 0.72, 0.9),
                     height=graph.mul(fine, 0.4))
    if weathering > 0:
        bloom = graph.noise(scale=7.0, detail=7.0, roughness=0.7)
        top = graph.facing_up(sharpness=1.0)
        coat.cover(graph.mul(graph.mask(bloom, 0.8 - 0.3 * weathering, 0.08), top),
                   color=(0.50, 0.50, 0.40), roughness=0.95)
        coat.tint(graph.mask(graph.noise(scale=1.5, detail=3.0), 0.55, 0.2), (0.35, 0.30, 0.27),
                  strength=0.5 * weathering)
        wear.grime(coat, amount=0.5 * weathering)
    return coat.finish(bump_strength=0.5, bump_distance=0.002)


def tiles(color=(0.72, 0.70, 0.66), size=0.3, grout=(0.30, 0.29, 0.27), gloss=0.2,
          variation=0.3, stains=0.3, seed=0, name='tiles'):
    """Square tiles or paving slabs of `size` metres with grout joints: pavements, plazas, pool
    surrounds, shop floors. gloss 0 is concrete paver, 0.8 glazed ceramic."""
    graph = Graph(name, seed)
    pattern, joint = graph.brick(vector=graph.wall_coords(), brick_width=size, row_height=size,
                                 mortar=0.006, smooth=0.3, color1=(1.0, 1.0, 1.0),
                                 color2=(0.0, 0.0, 0.0), offset=0.0)
    tone = graph.axis('X', pattern)
    fine = graph.noise(scale=80.0, detail=5.0, roughness=0.7)
    face = graph.hsv(color, value=graph.remap(tone, 0.0, 1.0, 1.0 - 0.3 * variation,
                                              1.0 + 0.3 * variation))
    face = graph.hsv(face, value=graph.remap(fine, 0.2, 0.8, 0.94, 1.06))
    coat = wear.Coat(graph, face, roughness=graph.remap(fine, 0.2, 0.8, 0.85 - 0.7 * gloss,
                                                        0.95 - 0.6 * gloss),
                     height=graph.mul(fine, 0.15 * (1.0 - gloss)))
    coat.cover(joint, color=grout, roughness=0.95, height=-1.0)
    if stains > 0:
        cloud = graph.noise(scale=1.6, detail=5.0)
        coat.tint(graph.mask(cloud, 0.55, 0.2), (0.40, 0.37, 0.33), strength=0.6 * stains)
        spots = graph.voronoi(scale=6.0, feature='F1')
        coat.tint(graph.mul(graph.remap(spots, 0.0, 0.12, 1.0, 0.0, smooth=True), stains),
                  (0.12, 0.11, 0.10), strength=0.8)
    return coat.finish(bump_strength=0.6, bump_distance=0.003)


def asphalt(color=(0.045, 0.045, 0.048), wear_amount=0.5, cracks=0.4, seed=0, name='asphalt'):
    """Road asphalt: dark binder, pale aggregate showing through where traffic polished it,
    cracks and oil patches."""
    graph = Graph(name, seed)
    stones = graph.voronoi(scale=140.0, feature='F1')
    stone_tone = graph.axis('X', graph.voronoi(scale=140.0, output='Color'))
    cloud = graph.noise(scale=0.8, detail=5.0, roughness=0.6)
    exposed = graph.mul(graph.remap(stones, 0.0, 0.35, 1.0, 0.0, smooth=True),
                        graph.remap(cloud, 0.25, 0.75, 0.25 + 0.5 * wear_amount, 1.0))
    aggregate = graph.ramp(stone_tone, [(0.0, (0.10, 0.10, 0.10)), (0.6, (0.22, 0.21, 0.20)),
                                        (1.0, (0.42, 0.40, 0.37))])
    base = graph.hsv(color, value=graph.remap(cloud, 0.2, 0.8, 0.8, 1.5))
    coat = wear.Coat(graph, graph.mix(graph.mul(exposed, 0.85), base, aggregate),
                     roughness=graph.remap(stones, 0.0, 0.5, 0.78, 0.95),
                     height=graph.remap(stones, 0.0, 0.5, 1.0, 0.0))
    if cracks > 0:
        crack_mask = _cracks(graph, scale=0.9, width=0.02, density=cracks)
        coat.cover(crack_mask, color=(0.012, 0.012, 0.012), roughness=0.95, height=-2.5)
    oil = graph.noise(scale=1.7, detail=3.0, distortion=0.8)
    coat.cover(graph.mul(graph.mask(oil, 0.74, 0.05), 0.7), color=(0.015, 0.015, 0.017),
               roughness=0.35)
    return coat.finish(bump_strength=0.8, bump_distance=0.003)


def sand(color=(0.76, 0.66, 0.48), ripples=0.5, wet=0.0, seed=0, name='sand'):
    """Beach sand: sparkling grain, wind ripples, darker and smoother where `wet`."""
    graph = Graph(name, seed)
    grain = graph.noise(scale=420.0, detail=3.0, roughness=0.8)
    cloud = graph.noise(scale=0.7, detail=5.0)
    waves = graph.wave(period=0.14, distortion=4.5, detail=3.0, detail_scale=1.2,
                       direction='X', vector=graph.mapped(scale=1.0))
    base = graph.hsv(color, value=graph.remap(grain, 0.2, 0.8, 0.86, 1.12))
    base = graph.hsv(base, value=graph.remap(cloud, 0.2, 0.8, 0.92, 1.06),
                     saturation=1.0 + 0.5 * wet)
    base = graph.hsv(base, value=1.0 - 0.45 * wet)
    height = graph.add(graph.mul(grain, 0.25), graph.mul(waves, 1.6 * ripples))
    coat = wear.Coat(graph, base, roughness=0.95 - 0.55 * wet, height=height)
    return coat.finish(bump_strength=0.7, bump_distance=0.008)
