"""Plastics, rubber, glass and the emissive lamp materials."""
from . import wear
from .nodes import Graph


def plastic(color=(0.02, 0.02, 0.022), roughness=0.45, grain=0.5, scuffs=0.3, seed=0,
            name='plastic'):
    """Moulded plastic (black by default) with a fine leather grain: bumpers, trim, bins, cases."""
    graph = Graph(name, seed)
    texture = graph.voronoi(scale=700.0, feature='F1')
    broad = graph.noise(scale=5.0, detail=4.0)
    coat = wear.Coat(graph, graph.vary(color, amount=0.1, scale=3.0),
                     roughness=graph.remap(broad, 0.3, 0.8, roughness, roughness + 0.15),
                     height=graph.mul(texture, grain))
    wear.scratches(coat, amount=scuffs, color=graph.hsv(color, saturation=0.6, value=2.2))
    edge = graph.mul(graph.edges(radius=0.006), graph.remap(broad, 0.2, 0.7))
    coat.cover(graph.mul(edge, scuffs), color=graph.hsv(color, saturation=0.5, value=2.5),
               roughness=0.7)
    wear.grime(coat, amount=0.3)
    wear.dust(coat, amount=0.2)
    return coat.finish(bump_strength=0.35, bump_distance=0.0004)


def rubber(color=(0.012, 0.012, 0.013), dust=0.4, seed=0, name='rubber'):
    """Tyre and seal rubber: matt black, greyed by road dust in every recess."""
    graph = Graph(name, seed)
    grain = graph.noise(scale=400.0, detail=3.0)
    coat = wear.Coat(graph, color, roughness=graph.remap(grain, 0.3, 0.7, 0.78, 0.92),
                     height=graph.mul(grain, 0.3))
    cavity = graph.cavities(distance=0.02)
    film = graph.noise(scale=8.0, detail=5.0)
    coat.cover(graph.mul(graph.mul(cavity, graph.remap(film, 0.2, 0.8, 0.4, 1.0)), dust),
               color=(0.20, 0.18, 0.15), roughness=0.95)
    return coat.finish(bump_strength=0.3, bump_distance=0.0005)


def glass(tint=(0.55, 0.68, 0.70), opacity=0.35, roughness=0.03, seed=0, name='glass'):
    """Window and lens glass. Named 'glass' by default, so it takes the glass role: it is not
    baked, and the game draws it alpha-blended with `opacity` and its own reflection settings."""
    graph = Graph(name, seed)
    graph.material['mz_opacity'] = float(opacity)
    graph.material['mz_tint'] = [float(component) for component in tint[:3]]
    graph.material.use_backface_culling = False
    return graph.surface(base_color=tint, roughness=roughness, metallic=0.0, transmission=1.0,
                         ior=1.5, alpha=1.0)


def lamp(color=(1.0, 0.86, 0.62), strength=8.0, rib_pitch=0.0, rib_direction='X', seed=0,
         name='lamp_main'):
    """A light-emitting lens or diffuser. Name it lamp_<group> (lamp_head, lamp_tail, lamp_brake,
    lamp_indicator_l, ...): each name becomes one material the game switches on and off.

    `strength` is the lit brightness (Blender emission strength, the game's emissiveIntensity);
    rib_pitch adds moulded ribs every so many metres across the lens, as on car lamps.
    """
    graph = Graph(name, seed)
    graph.material['mz_emissive_strength'] = float(strength)
    base = graph.hsv(color, saturation=0.55, value=0.9)
    emission = color
    normal = None
    if rib_pitch > 0:
        ribs = graph.wave(period=rib_pitch, direction=rib_direction)
        emission = graph.hsv(color, value=graph.remap(ribs, 0.0, 1.0, 0.7, 1.0))
        normal = graph.bump(ribs, strength=0.5, distance=0.001)
    return graph.surface(base_color=base, roughness=0.18, metallic=0.0, emission_color=emission,
                         emission_strength=strength, normal=normal)


def emissive(color=(1.0, 1.0, 1.0), strength=2.0, seed=0, name='emissive'):
    """A surface that always glows (screens, neon tube cores, indicator lights)."""
    graph = Graph(name, seed)
    graph.material['mz_emissive_strength'] = float(strength)
    return graph.surface(base_color=color, roughness=0.4, emission_color=color,
                         emission_strength=strength)
