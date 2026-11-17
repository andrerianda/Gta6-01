"""The naming contract between Blender and the game. Names are the only interface: the game finds
moving parts, anchors, levels of detail, collision proxies and material roles by these names, and
game/src/assets/ mirrors the same rules (contract.js). art/README.md explains them in full.

Nodes (Blender objects)
    <part>_lod0, <part>_lod1, ...   a visual mesh that belongs to one level of detail
    <part>                          a visual mesh shown at every level (wheels, doors, rotors)
    anchor_<what>[_<which>]         an empty: its position is a point, its +Y (game -Z) a direction
    col_box_*, col_cyl_*, col_sphere_*   empties whose scale is the full size of the proxy in metres
    col_hull_*, col_mesh_*          meshes used for collision only, never drawn

Materials (by prefix)
    paint, paint_*    tintable: baked neutral, the game multiplies its colour in at run time
    glass, glass_*    alpha-blended glass, not baked; the game sets opacity and reflection
    lamp_<group>      emissive lamp the game switches on and off, one material per switchable group
    cutout, cutout_*  alpha-tested cards (foliage, mesh fences, hair), double sided
    tile_<name>       a tiling texture set of its own with repeating UVs in metres (walls, roads)
    anything else     merged into the single opaque material named "atlas"
"""
import re

ANCHOR_PREFIX = 'anchor_'
COLLIDER_PREFIX = 'col_'
COLLIDER_SHAPES = ('box', 'cyl', 'sphere', 'hull', 'mesh')
LOD_PATTERN = re.compile(r'^(?:(?P<part>.+)_)?lod(?P<level>[0-9])$')

ROLE_ATLAS = 'atlas'
ROLE_PAINT = 'paint'
ROLE_GLASS = 'glass'
ROLE_LAMP = 'lamp'
ROLE_CUTOUT = 'cutout'
ROLE_TILE = 'tile'

# Moving parts every vehicle uses; a vehicle may leave out what it does not have.
WHEELS = ('wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr')
STEERING_PIVOTS = ('steer_fl', 'steer_fr')
DOORS = ('door_fl', 'door_fr', 'door_rl', 'door_rr')
PANELS = ('hood', 'trunk')

# Anchors the game looks for, by asset kind. More may be added; these names are fixed.
VEHICLE_ANCHORS = (
    'anchor_seat_driver', 'anchor_seat_passenger_1', 'anchor_seat_passenger_2',
    'anchor_seat_passenger_3', 'anchor_door_driver', 'anchor_light_head_l',
    'anchor_light_head_r', 'anchor_light_tail_l', 'anchor_light_tail_r', 'anchor_exhaust_1',
    'anchor_exhaust_2', 'anchor_camera',
)
CHARACTER_ANCHORS = ('anchor_hand_r', 'anchor_hand_l', 'anchor_head', 'anchor_back')
PROP_ANCHORS = ('anchor_light', 'anchor_use')

# Bones of the shared humanoid skeleton, root first (suffix _l / _r for the two sides).
SKELETON_BONES = (
    'root', 'hips', 'spine', 'chest', 'neck', 'head',
    'shoulder_l', 'upper_arm_l', 'forearm_l', 'hand_l',
    'shoulder_r', 'upper_arm_r', 'forearm_r', 'hand_r',
    'thigh_l', 'shin_l', 'foot_l', 'toe_l',
    'thigh_r', 'shin_r', 'foot_r', 'toe_r',
)


def lod_level(name):
    """The level of detail a node name belongs to (0, 1, 2 ...), or None for an every-level part."""
    match = LOD_PATTERN.match(name)
    return int(match.group('level')) if match else None


def lod_name(part, level):
    """The node name of `part` at a level: lod_name('body', 1) is 'body_lod1', ('', 0) is 'lod0'."""
    return f'{part}_lod{level}' if part else f'lod{level}'


def is_anchor(name):
    return name.startswith(ANCHOR_PREFIX)


def is_collider(name):
    return name.startswith(COLLIDER_PREFIX)


def collider_shape(name):
    """The proxy shape in a collider name ('box', 'cyl', 'sphere', 'hull' or 'mesh'), else None."""
    if not is_collider(name):
        return None
    parts = name.split('_')
    return parts[1] if len(parts) > 1 and parts[1] in COLLIDER_SHAPES else None


def base_name(name):
    """A name without the .001 Blender appends when two data blocks ask for the same name."""
    return re.sub(r'\.[0-9]{3,}$', '', name)


def material_role(name):
    """The role of a material by its name: 'paint', 'glass', 'lamp', 'cutout', 'tile' or 'atlas'."""
    name = base_name(name)
    for role in (ROLE_PAINT, ROLE_GLASS, ROLE_CUTOUT):
        if name == role or name.startswith(role + '_'):
            return role
    for role in (ROLE_LAMP, ROLE_TILE):
        if name.startswith(role + '_') and len(name) > len(role) + 1:
            return role
    return ROLE_ATLAS


def check_node_name(name):
    """Raises ValueError for a node name the game could not read (case, spaces, Blender's .001)."""
    if not re.fullmatch(r'[a-z][a-z0-9_]*', name):
        raise ValueError(
            f'node name {name!r} must be lower-case letters, digits and underscores '
            '(Blender adds .001 to a duplicate name: give every object its own name)')
    if is_collider(name) and collider_shape(name) is None:
        raise ValueError(f'collider {name!r} must be col_<shape>_<name>, shape in {COLLIDER_SHAPES}')
    return name
