"""Procedural materials for the aircraft: each ends in a Principled BSDF whose Base Color, Roughness,
Metallic and Normal (through a Bump node) are baked into the asset's atlas by atlasbake.py.

A material's NAME is its role in the game (game/src/assets/contract.js):
  paint, paint_*   tintable paint: baked neutral, the colour travels as the material's factor
  glass, glass_*   not baked, alpha blended
  lamp_<group>     not baked, emissive, switched by the game per group
  screen_<name>    not baked: a face the game paints live (instrument panels); UVs kept as modelled
  anything else    baked into the one 'atlas' material
Patterns are in object coordinates (metres), so they do not depend on UVs. Colours are sRGB hex.
"""
import bpy


def hex_color(text, alpha=1.0):
    """'#1c6a6e' as linear RGBA."""
    text = text.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(text[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (out[0], out[1], out[2], alpha)


def _principled(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    shader = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
    return mat, tree, shader


def _noise(tree, scale, detail=3.0, roughness=0.55, stretch=(1, 1, 1)):
    coords = tree.nodes.new('ShaderNodeTexCoord')
    mapping = tree.nodes.new('ShaderNodeMapping')
    mapping.inputs['Scale'].default_value = stretch
    tree.links.new(coords.outputs['Object'], mapping.inputs['Vector'])
    noise = tree.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = scale
    noise.inputs['Detail'].default_value = detail
    noise.inputs['Roughness'].default_value = roughness
    tree.links.new(mapping.outputs['Vector'], noise.inputs['Vector'])
    return noise.outputs['Fac']


def _ramp(tree, value, low, high):
    node = tree.nodes.new('ShaderNodeMapRange')
    node.inputs['From Min'].default_value = low
    node.inputs['From Max'].default_value = high
    tree.links.new(value, node.inputs['Value'])
    return node.outputs['Result']


def _mix(tree, factor, a, b, mode='MIX'):
    node = tree.nodes.new('ShaderNodeMix')
    node.data_type = 'RGBA'
    node.blend_type = mode
    for socket, value in ((node.inputs[0], factor), (node.inputs[6], a), (node.inputs[7], b)):
        if hasattr(value, 'is_linked') or hasattr(value, 'node'):
            tree.links.new(value, socket)
        else:
            socket.default_value = value
    return node.outputs[2]


def _panel_lines(tree, size, projection, width=0.012):
    """A 0..1 mask of panel seams: a brick pattern seen from above ('top'), from the side or the front."""
    coords = tree.nodes.new('ShaderNodeTexCoord')
    mapping = tree.nodes.new('ShaderNodeMapping')
    mapping.inputs['Rotation'].default_value = {'top': (0, 0, 0), 'side': (0, 1.5708, 0), 'front': (1.5708, 0, 0)}[projection]
    tree.links.new(coords.outputs['Object'], mapping.inputs['Vector'])
    brick = tree.nodes.new('ShaderNodeTexBrick')
    brick.inputs['Color1'].default_value = brick.inputs['Color2'].default_value = (0, 0, 0, 1)
    brick.inputs['Mortar'].default_value = (1, 1, 1, 1)
    brick.inputs['Scale'].default_value = 1.0
    brick.inputs['Mortar Size'].default_value = width
    brick.inputs['Mortar Smooth'].default_value = 0.3
    brick.inputs['Brick Width'].default_value = size[0]
    brick.inputs['Row Height'].default_value = size[1]
    tree.links.new(mapping.outputs['Vector'], brick.inputs['Vector'])
    return brick.outputs['Color']


def coated(name, color, roughness=0.45, metallic=0.0, wear=0.3, panels=None, projection='top', sheen=None, grain=0.35):
    """A painted or coated skin with a history: mottled colour and gloss, grime streaks, panel seams.

    panels: (length, width) of the skin panels in metres, or None. sheen: a second hex colour the
    coating drifts towards in broad patches (radar-absorbent or heat-tinted skins). wear 0..1.
    """
    mat, tree, shader = _principled(name)
    base = hex_color(color)
    broad = _ramp(tree, _noise(tree, 0.55, 4.0), 0.3, 0.7)
    fine = _ramp(tree, _noise(tree, 9.0, 3.0, 0.6, (1, 0.25, 1)), 0.35, 0.75)
    dark = tuple(c * (1.0 - 0.45 * wear) for c in base[:3]) + (1,)
    colour = _mix(tree, broad, base, dark)
    if sheen:
        colour = _mix(tree, _ramp(tree, _noise(tree, 0.18, 2.0), 0.45, 0.8), colour, hex_color(sheen))
    colour = _mix(tree, _ramp(tree, fine, 0.0, 1.0 / max(wear, 0.05) * 0.5), colour, dark, 'MIX') if wear > 0 else colour
    rough = _ramp(tree, _noise(tree, 2.2, 5.0), 0.2, 0.8)
    rough_node = tree.nodes.new('ShaderNodeMapRange')
    rough_node.inputs['To Min'].default_value = max(0.04, roughness - grain * 0.5 * (0.4 + wear))
    rough_node.inputs['To Max'].default_value = min(1.0, roughness + grain * 0.5 * (0.4 + wear))
    tree.links.new(rough, rough_node.inputs['Value'])
    height = _noise(tree, 28.0, 2.0)
    bump = tree.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.08 + 0.12 * wear
    bump.inputs['Distance'].default_value = 0.004
    tree.links.new(height, bump.inputs['Height'])
    normal = bump.outputs['Normal']
    if panels:
        seams = _panel_lines(tree, panels, projection)
        colour = _mix(tree, seams, colour, tuple(c * 0.35 for c in base[:3]) + (1,))
        groove = tree.nodes.new('ShaderNodeBump')
        groove.invert = True
        groove.inputs['Strength'].default_value = 0.6
        groove.inputs['Distance'].default_value = 0.004
        tree.links.new(seams, groove.inputs['Height'])
        tree.links.new(normal, groove.inputs['Normal'])
        normal = groove.outputs['Normal']
    tree.links.new(colour, shader.inputs['Base Color'])
    tree.links.new(rough_node.outputs['Result'], shader.inputs['Roughness'])
    shader.inputs['Metallic'].default_value = metallic
    tree.links.new(normal, shader.inputs['Normal'])
    return mat


def paint(color, name='paint', roughness=0.32, panels=None, projection='top', wear=0.15):
    """Tintable paint: baked as a neutral coat (its seams, dirt and gloss), tinted by the game."""
    mat = coated(name, '#ffffff', roughness, 0.0, wear, panels, projection, grain=0.2)
    mat['paint_color'] = list(hex_color(color))
    return mat


def bare_metal(name, color='#b9bcc0', roughness=0.3, wear=0.3, panels=None, projection='top'):
    """Polished or brushed metal: struts, exhausts, leading edges."""
    return coated(name, color, roughness, 1.0, wear, panels, projection)


def rubber(name='tyre', color='#141414'):
    """Tyres, seals, grips."""
    return coated(name, color, 0.85, 0.0, 0.5, grain=0.2)


def fabric(name='seat_fabric', color='#3a3d42'):
    """Seat cloth and harness webbing."""
    mat = coated(name, color, 0.9, 0.0, 0.4, grain=0.15)
    return mat


def plain(name, color, roughness=0.6, metallic=0.0):
    """A flat surface with no pattern (small interior parts)."""
    mat, tree, shader = _principled(name)
    shader.inputs['Base Color'].default_value = hex_color(color)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    return mat


def glass(name='glass', tint='#20303a', alpha=0.35, roughness=0.05):
    """Canopy and window glass (not baked; the game blends it and adds the sky's reflection)."""
    mat, tree, shader = _principled(name)
    shader.inputs['Base Color'].default_value = hex_color(tint)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Alpha'].default_value = alpha
    mat['alpha'] = alpha
    return mat


def lamp(name, color, strength=4.0):
    """A switchable lamp: name it lamp_<group> (lamp_nav_red, lamp_landing)."""
    mat, tree, shader = _principled(name)
    shader.inputs['Base Color'].default_value = hex_color(color)
    shader.inputs['Emission Color'].default_value = hex_color(color)
    shader.inputs['Emission Strength'].default_value = strength
    shader.inputs['Roughness'].default_value = 0.2
    return mat


def screen(name='screen_panel', color='#05080a'):
    """A face the game paints live (name it screen_<what>): dark glass until then."""
    mat, tree, shader = _principled(name)
    shader.inputs['Base Color'].default_value = hex_color(color)
    shader.inputs['Roughness'].default_value = 0.25
    return mat


def role_of(name):
    """The role a material name carries: paint, glass, lamp, screen or atlas."""
    for role in ('paint', 'glass'):
        if name == role or name.startswith(role + '_'):
            return role
    for role in ('lamp', 'screen'):
        if name.startswith(role + '_'):
            return role
    return 'atlas'
