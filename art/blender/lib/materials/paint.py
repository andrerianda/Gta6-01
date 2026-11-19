"""Paint: glossy vehicle paint the game recolours, and worn painted metal for street furniture."""
from . import wear
from .nodes import Graph


def car_paint(color=(0.55, 0.02, 0.02), metallic_flake=0.35, gloss=0.85, dirt=0.25, seed=0,
              name='paint'):
    """Vehicle body paint under a clear coat. Named 'paint' by default, so it takes the paint
    role: the bake stores a neutral coat and the game multiplies the body colour in.

    metallic_flake 0 is solid enamel, 0.3 to 0.6 a metallic finish; dirt adds road film that
    fades upwards from the sills.
    """
    graph = Graph(name, seed)
    base = graph.paint_color(color)
    flakes = graph.noise(scale=900.0, detail=1.0, roughness=0.5)
    base = graph.hsv(base, value=graph.remap(flakes, 0.3, 0.7, 1.0 - 0.12 * metallic_flake,
                                             1.0 + 0.12 * metallic_flake))
    coat = wear.Coat(graph, base, roughness=0.42 - 0.3 * gloss, metallic=0.55 * metallic_flake)
    peel = graph.noise(scale=180.0, detail=2.0)
    coat.height = graph.mul(peel, 0.06)
    if dirt > 0:
        film = graph.noise(scale=7.0, detail=6.0, roughness=0.65)
        low = graph.remap(graph.axis('Z'), 0.1, 0.9, 1.0, 0.0, smooth=True)
        mask = graph.mul(graph.mul(low, graph.remap(film, 0.2, 0.8, 0.3, 1.0)), dirt)
        coat.cover(mask, color=(0.42, 0.38, 0.33), roughness=0.75, metallic=0.0)
        coat.tint(graph.mul(graph.cavities(distance=0.05), 0.8), wear.GRIME, strength=0.5)
    return coat.finish(bump_strength=0.15, bump_distance=0.0005, coat=gloss, coat_roughness=0.04)


def painted_metal(color=(0.05, 0.22, 0.45), gloss=0.5, chips=0.35, rust=0.3, grime=0.45,
                  dust=0.25, fade=0.3, splash=0.0, seed=0, name='painted_metal'):
    """Enamelled or powder-coated steel that has lived on a pavement: lamp posts, bins, railings,
    newspaper boxes, signs. Each wear amount runs from 0 (factory fresh) to 1 (abandoned):
    chips (paint knocked off to primer and steel), rust (blotches and streaks), grime (dirt in
    creases, film and runs), dust (on upward faces), fade (sun chalking) and splash (mud up
    from the ground, for parts whose origin stands on it)."""
    graph = Graph(name, seed)
    base = graph.paint_color(color) if name.startswith('paint') else graph.rgb(color)
    base = graph.vary(base, amount=0.06, scale=2.5)
    coat = wear.Coat(graph, base, roughness=0.62 - 0.4 * gloss)
    coat.height = graph.mul(graph.noise(scale=220.0, detail=2.0), 0.05)
    wear.sun_fade(coat, amount=fade)
    wear.scratches(coat, amount=0.6 * chips)
    wear.chipped_edges(coat, amount=chips)
    wear.rust_spots(coat, amount=rust)
    wear.grime(coat, amount=grime)
    wear.dust(coat, amount=dust)
    wear.ground_splash(coat, amount=splash)
    return coat.finish(bump_strength=0.6, bump_distance=0.0012)


def enamel_sign(color=(0.85, 0.82, 0.74), gloss=0.7, chips=0.15, rust=0.15, seed=0,
                name='enamel_sign'):
    """Smooth, glassy sign enamel with a little edge rust: plates, road signs, appliance panels."""
    return painted_metal(color=color, gloss=gloss, chips=chips, rust=rust, grime=0.25, dust=0.1,
                         seed=seed, name=name)
