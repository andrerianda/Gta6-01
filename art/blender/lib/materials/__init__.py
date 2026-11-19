"""The procedural material library: physically based surfaces built from Blender's shader nodes,
made to be baked. Import it as `from lib import materials as M` and call a factory:

    body = M.painted_metal(color=M.hex_color('#1f5f8b'), chips=0.4, rust=0.2, seed=3)
    lens = M.lamp(color=(1.0, 0.85, 0.6), strength=8.0, name='lamp_main')

Every factory takes a `seed` (same seed, same pattern) and a `name`. The name decides the
material's role in the game (see naming.py): 'paint...' is tintable, 'glass...' is not baked,
'lamp_<group>' is a switchable light, 'cutout...' is alpha-tested, 'tile_<name>' (with
M.tile(material, size, pixels)) is baked as a repeating texture for walls and ground, and any
other name is baked into the asset's single opaque atlas material. Colours are linear RGB; use
srgb() or hex_color() for values read from a colour picker. Sizes are metres.

To write a new material, build it with nodes.Graph and wear.Coat as the modules here do: drive
patterns from object coordinates, end in the Principled BSDF, and keep everything the game needs
in Base Color, Roughness, Metallic, Normal (through a Bump node), Emission and Alpha, because
those are the channels the bake reads.
"""
from .masonry import asphalt, brick, concrete, painted_concrete, sand, stone, stucco, terracotta, tiles
from .metal import brushed_metal, cast_metal, chrome, corrugated_metal, galvanized, rusty_metal
from .nodes import Graph, hex_color, srgb, tile
from .organic import bark, foliage, palm_trunk, skin, wood
from .paint import car_paint, enamel_sign, painted_metal
from .synthetic import emissive, glass, lamp, plastic, rubber
from .textile import fabric, leather
from .wear import Coat

CATALOGUE = {
    'car_paint': car_paint, 'painted_metal': painted_metal, 'enamel_sign': enamel_sign,
    'chrome': chrome, 'brushed_metal': brushed_metal, 'cast_metal': cast_metal,
    'galvanized': galvanized, 'rusty_metal': rusty_metal, 'corrugated_metal': corrugated_metal,
    'plastic': plastic, 'rubber': rubber, 'glass': glass, 'lamp': lamp, 'emissive': emissive,
    'concrete': concrete, 'painted_concrete': painted_concrete, 'stucco': stucco, 'brick': brick,
    'stone': stone, 'terracotta': terracotta, 'tiles': tiles, 'asphalt': asphalt, 'sand': sand,
    'wood': wood, 'bark': bark, 'palm_trunk': palm_trunk, 'foliage': foliage, 'skin': skin,
    'fabric': fabric, 'leather': leather,
}

__all__ = ['CATALOGUE', 'Coat', 'Graph', 'hex_color', 'srgb', 'tile', *CATALOGUE]
