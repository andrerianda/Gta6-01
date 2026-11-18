"""Kit: glass tower. Facade modules for modern office and hotel towers of 15 to 45 storeys.

Office grid: bays 4 m wide, upper storeys 4.0 m, ground storey 4.2 m, top pieces 1.2 m, glazing
on a 1.333 m pitch in every module so that mullions line up from the lobby to the crown. Every
module faces +Y with the outer wall plane on Y = 0 and comes as <module>_lod0 (modelled) and
<module>_lod1 (a card of at most 8 triangles baked from the modelled bay). The modules stand in
a catalogue row along X; their geometry is in module space and the node translation is not part
of the grid (see _kit.py).

Modules of this build:
    upper_window_4_a       curtain wall with deep mullion fins and dark spandrel glass
    upper_window_4_b       ribbon windows set back between tintable panel bands with a sun blade
    upper_window_4_c       flush structural glazing with fine joints and a slim floor-line cap
    upper_mechanical_4_a   plant floor: two louvre banks between panel bands
    corner_upper_a         glazed corner post, 0.5 m square, glass on both street faces
    top_parapet_4_a        panel upstand with a metal coping
    top_crown_4_a          stackable crown screen: fins before a perforated screen, a lit band
    ground_entrance_8_a    lobby: stone piers, tall glazing, a portal with doors, a hung canopy
    ground_shop_4_a        shopfront: display window, glazed door, sign fascia, awning blade
    corner_ground_a        stone corner pier (4.2 m)
    corner_top_a           parapet corner (1.2 m)

Materials: paint_wall (panel bands, fascias, parapets) and paint_trim (mullions, fins, copings,
canopies) are tintable; lamp_window_a, _b and _c are the glazing (a mirror by day, the lit room
at night; the three groups are spread over the panes of every bay); lamp_crown is the crown's
light band; everything else is in the atlas. Glass tint: the game multiplies the colour of the
lamp_window_* materials (the baked glass is a neutral cool mid-tone).

The budget is overridden because a whole kit lives in this one file: many modules, each with
its own few materials (draw calls are per module, and the game draws modules instanced).

Blender axes: Z up, every module faces +Y.
"""
import _kit
from _kit import Mesher, card
from lib import materials as M

ASSET = {
    'id': 'kit_glass_tower',
    'kind': 'building',
    'atlas': 1024,
    'budget': {'draws': 160, 'bytes': 940000},
}

H = _kit.OFFICE_STOREY
G = _kit.GROUND_STOREY
T = _kit.TOP_PIECE
EDGES = (-2.0, -2.0 / 3.0, 2.0 / 3.0, 2.0)       # pane edges of a 4 m bay
SILL = 1.1                                        # top of the spandrel zone of variants a
WALL_COLOR = (0.62, 0.60, 0.56)
TRIM_COLOR = (0.07, 0.062, 0.055)

KIT = None


def mullions(m, y_back, y_front, half, z0, z1, key):
    """Upright bars on the pane edges of a 4 m bay; the two on the bay's edges are halves that
    meet the neighbour's."""
    for x in EDGES[1:3]:
        m.vbar(x - half, x + half, y_back, y_front, z0, z1, key)
    m.vbar(-2.0, -2.0 + half, y_back, y_front, z0, z1, key, left=False)
    m.vbar(2.0 - half, 2.0, y_back, y_front, z0, z1, key, right=False)


def panes(m, groups, z0, z1, y):
    """Three panes of glazing, one lamp group each; returns the card rectangles for them."""
    rectangles = []
    for index, group in enumerate(groups):
        key = f'glass_{group}'
        m.panel(EDGES[index], EDGES[index + 1], z0, z1, y, key)
        rectangles.append(('y', EDGES[index], EDGES[index + 1], z0, z1, key))
    return rectangles


def window_fins():
    """a: vertical fins 0.28 m deep on every pane edge, opaque spandrel glass below the sill."""
    m = Mesher()
    glazing = panes(m, 'abc', SILL, H, -0.10)
    m.panel(-2.0, 2.0, 0.0, SILL, -0.08, 'spandrel')
    m.hbar(-2.0, 2.0, -0.10, -0.02, SILL - 0.04, SILL + 0.04, 'trim')
    m.hbar(-2.0, 2.0, -0.10, -0.02, 0.0, 0.07, 'trim', bottom=False)
    mullions(m, -0.10, 0.18, 0.035, 0.0, H, 'trim')
    return m, card([('y', -2.0, 2.0, 0.0, SILL, 'atlas')] + glazing)


def window_bands():
    """b: a tintable panel band 1.3 m high with a projecting sun blade, ribbon glazing set
    0.22 m back between slim dark mullions."""
    m = Mesher()
    band, recess = 1.3, -0.22
    glazing = panes(m, 'bca', band, H, recess)
    m.hbar(-2.0, 2.0, recess, 0.0, 0.0, band, 'wall')
    m.hbar(-2.0, 2.0, 0.0, 0.35, band - 0.10, band - 0.02, 'trim')
    mullions(m, recess, recess + 0.05, 0.025, band, H, 'frame')
    m.hbar(-2.0, 2.0, recess, recess + 0.06, H - 0.06, H, 'frame', top=False)
    return m, card([('y', -2.0, 2.0, 0.0, band, 'wall')] + glazing)


def window_flush():
    """c: flush structural glazing; joints are fine dark lines, a slim cap marks each floor."""
    m = Mesher()
    plane, spandrel = -0.03, 0.95
    glazing = panes(m, 'cab', spandrel, H, plane)
    m.panel(-2.0, 2.0, 0.0, spandrel, plane, 'spandrel')
    for x in EDGES[1:3]:
        m.panel(x - 0.015, x + 0.015, 0.0, H, plane + 0.006, 'frame')
    m.panel(-2.0, -1.985, 0.0, H, plane + 0.006, 'frame')
    m.panel(1.985, 2.0, 0.0, H, plane + 0.006, 'frame')
    m.panel(-2.0, 2.0, spandrel - 0.015, spandrel + 0.015, plane + 0.008, 'frame')
    m.hbar(-2.0, 2.0, plane, 0.06, 0.0, 0.07, 'trim', bottom=False)
    return m, card([('y', -2.0, 2.0, 0.0, spandrel, 'atlas')] + glazing)


def mechanical():
    """Plant floor: two banks of fourteen sloping blades before a dark void, between panel
    bands at floor and ceiling."""
    m = Mesher()
    low, high, recess = 0.55, 3.45, -0.30
    m.hbar(-2.0, 2.0, recess, 0.0, 0.0, low, 'wall', bottom=False)
    m.hbar(-2.0, 2.0, recess, 0.0, high, H, 'wall', top=False)
    m.vbar(-2.0, -1.85, recess, 0.0, low, high, 'trim', left=False)
    m.vbar(-0.10, 0.10, recess, 0.0, low, high, 'trim')
    m.vbar(1.85, 2.0, recess, 0.0, low, high, 'trim', right=False)
    m.panel(-1.85, 1.85, low, high, recess + 0.02, 'void')
    for x0, x1 in ((-1.85, -0.10), (0.10, 1.85)):
        for index in range(14):
            z = low + 0.05 + 0.2 * index
            m.slat(x0, x1, (-0.17, z + 0.16), (-0.02, z), 'louvre')
    return m, card([('y', -2.0, 2.0, 0.0, low, 'wall'), ('y', -2.0, 2.0, high, H, 'wall'),
                    ('y', -2.0, 2.0, low, high, 'atlas')])


def corner_upper():
    """A glazed corner: a slim square post on the outer corner, glass and spandrel on both
    street faces (Y = 0 and X = +0.25) in line with the bays of variant a."""
    m = Mesher()
    m.vbar(0.13, 0.25, -0.12, 0.0, 0.0, H, 'trim')
    m.back(0.15, 0.25, 0.0, H, -0.12, 'trim')
    m.panel(-0.25, 0.13, SILL, H, -0.10, 'glass_c')
    m.panel(-0.25, 0.13, 0.0, SILL, -0.08, 'spandrel')
    m.hbar(-0.25, 0.13, -0.10, -0.02, SILL - 0.04, SILL + 0.04, 'trim')
    m.hbar(-0.25, 0.13, -0.10, -0.02, 0.0, 0.07, 'trim', bottom=False)
    m.side(0.15, -0.5, -0.12, SILL, H, 'glass_c')
    m.side(0.17, -0.5, -0.12, 0.0, SILL, 'spandrel')
    for z0, z1 in ((SILL - 0.04, SILL + 0.04), (0.0, 0.07)):
        m.side(0.23, -0.5, -0.12, z0, z1, 'trim')
        m.level(z1, 0.15, 0.23, -0.5, -0.12, 'trim')
    m.level(SILL - 0.04, 0.15, 0.23, -0.5, -0.12, 'trim', sign=-1)
    return m, card([('y', -0.25, 0.25, SILL, H, 'glass_c'), ('y', -0.25, 0.25, 0.0, SILL, 'atlas'),
                    ('x', -0.5, 0.0, SILL, H, 'glass_c'), ('x', -0.5, 0.0, 0.0, SILL, 'atlas')])


def parapet():
    """Panel upstand on the pane rhythm under a projecting metal coping; the roof side is
    closed too, because towers are seen from the air."""
    m = Mesher()
    m.panel(-2.0, 2.0, 0.0, 1.08, -0.04, 'wall')
    mullions(m, -0.04, 0.0, 0.025, 0.0, 1.08, 'trim')
    m.hbar(-2.0, 2.0, -0.42, 0.06, 1.08, T, 'trim')
    m.back(-2.0, 2.0, 0.0, T, -0.42, 'wall')
    return m, card([('y', -2.0, 2.0, 0.0, 1.08, 'wall'), ('y', -2.0, 2.0, 1.08, T, 'atlas')])


def crown():
    """A crown screen that stacks: fins every 0.667 m before a perforated screen, a light band
    (lamp_crown) behind the fins near the foot, a cap rail on top."""
    m = Mesher()
    m.panel(-2.0, 2.0, 0.0, T, -0.30, 'louvre')
    m.back(-2.0, 2.0, 0.0, T, -0.34, 'louvre')
    m.panel(-2.0, 2.0, 0.12, 0.40, -0.28, 'crown')
    for index in range(-2, 3):
        x = index * 2.0 / 3.0
        m.vbar(x - 0.03, x + 0.03, -0.30, 0.0, 0.0, T - 0.10, 'trim')
    m.vbar(-2.0, -1.97, -0.30, 0.0, 0.0, T - 0.10, 'trim', left=False)
    m.vbar(1.97, 2.0, -0.30, 0.0, 0.0, T - 0.10, 'trim', right=False)
    m.hbar(-2.0, 2.0, -0.36, 0.03, T - 0.10, T, 'trim')
    return m, card([('y', -2.0, 2.0, 0.12, 0.40, 'crown'), ('y', -2.0, 2.0, 0.0, 0.12, 'atlas'),
                    ('y', -2.0, 2.0, 0.40, T, 'atlas')])


def entrance():
    """The lobby, 8 m wide: stone piers, glazing 3.35 m tall on the tower's pane pitch, a
    projecting portal with a pair of doors in the middle pane, a canopy 5.2 m wide hung from
    two rods, and a panel fascia above for the name of the building."""
    m = Mesher()
    recess, head, pier = -0.32, 3.35, 10.0 / 3.0
    m.vbar(-4.0, -pier, recess, 0.0, 0.0, head, 'stone', left=False)
    m.vbar(pier, 4.0, recess, 0.0, 0.0, head, 'stone', right=False)
    m.hbar(-4.0, 4.0, recess, 0.0, head, G, 'wall', top=False)
    m.panel(-pier, pier, 0.0, head, recess, 'glass_a')
    m.hbar(-pier, -0.80, recess, recess + 0.10, 0.0, 0.12, 'stone', bottom=False)
    m.hbar(0.80, pier, recess, recess + 0.10, 0.0, 0.12, 'stone', bottom=False)
    for x in (-2.0, 2.0):
        m.vbar(x - 0.03, x + 0.03, recess, recess + 0.09, 0.12, head, 'trim')
    m.hbar(-pier, -0.80, recess, recess + 0.08, 2.58, 2.66, 'trim')
    m.hbar(0.80, pier, recess, recess + 0.08, 2.58, 2.66, 'trim')
    # The portal and the doors.
    m.vbar(-0.80, -2.0 / 3.0, recess, -0.05, 0.0, 2.72, 'trim')
    m.vbar(2.0 / 3.0, 0.80, recess, -0.05, 0.0, 2.72, 'trim')
    m.hbar(-0.80, 0.80, recess, -0.05, 2.58, 2.72, 'trim')
    m.vbar(-0.025, 0.025, recess, recess + 0.05, 0.0, 2.58, 'frame')
    m.hbar(-0.58, -0.10, recess + 0.03, recess + 0.08, 1.00, 1.06, 'louvre')
    m.hbar(0.10, 0.58, recess + 0.03, recess + 0.08, 1.00, 1.06, 'louvre')
    # The canopy and its rods.
    m.hbar(-2.6, 2.6, recess, 1.5, 2.95, 3.13, 'trim', bottom=False)
    m.level(2.95, -2.6, 2.6, recess, 1.5, 'soffit', sign=-1)
    m.side(2.6, recess, 1.5, 2.95, 3.13, 'trim')
    m.side(-2.6, recess, 1.5, 2.95, 3.13, 'trim', sign=-1)
    for x in (-1.9, 1.9):
        m.slat(x - 0.03, x + 0.03, (0.0, 4.0), (1.3, 3.13), 'louvre')
    return m, card([('y', -4.0, 4.0, head, G, 'wall'), ('y', -pier, pier, 0.0, head, 'glass_a'),
                    ('y', -4.0, -pier, 0.0, head, 'atlas'), ('y', pier, 4.0, 0.0, head, 'atlas')])


def shop():
    """A shopfront, 4 m wide: half piers, a display window over a stone riser, a glazed door
    on the right, a panel fascia for the sign and a slim awning blade."""
    m = Mesher()
    recess, head = -0.22, 3.3
    m.vbar(-2.0, -1.8, recess, 0.0, 0.0, head, 'stone', left=False)
    m.vbar(1.8, 2.0, recess, 0.0, 0.0, head, 'stone', right=False)
    m.hbar(-2.0, 2.0, recess, 0.0, head, G, 'wall', top=False)
    m.panel(-1.8, 1.8, 0.0, head, recess, 'glass_b')
    m.hbar(-1.8, 0.63, recess, recess + 0.10, 0.0, 0.42, 'stone', bottom=False)
    m.vbar(0.63, 0.70, recess, recess + 0.08, 0.0, head, 'trim')
    m.vbar(-0.70, -0.63, recess, recess + 0.07, 0.42, head, 'trim')
    m.hbar(0.70, 1.8, recess, recess + 0.08, 2.40, 2.48, 'trim')
    m.hbar(-1.8, 0.63, recess, recess + 0.06, 2.86, 2.92, 'trim')
    m.vbar(0.82, 0.86, recess + 0.03, recess + 0.08, 0.90, 1.30, 'louvre')
    m.hbar(-1.9, 1.9, recess, 0.9, 3.10, 3.18, 'trim')
    m.side(1.9, recess, 0.9, 3.10, 3.18, 'trim')
    m.side(-1.9, recess, 0.9, 3.10, 3.18, 'trim', sign=-1)
    return m, card([('y', -2.0, 2.0, head, G, 'wall'), ('y', -1.8, 1.8, 0.0, head, 'glass_b'),
                    ('y', -2.0, -1.8, 0.0, head, 'atlas'), ('y', 1.8, 2.0, 0.0, head, 'atlas')])


def corner_ground():
    """A stone corner pier with a plinth and a metal band at fascia level."""
    m = Mesher()
    m.vbar(-0.25, 0.25, -0.5, 0.0, 0.0, G, 'stone', left=False)
    m.vbar(-0.25, 0.27, -0.5, 0.02, 0.0, 0.5, 'stone', left=False)
    m.level(0.5, -0.25, 0.27, -0.5, 0.02, 'stone')
    m.vbar(-0.25, 0.265, -0.5, 0.015, 3.30, 3.38, 'trim', left=False)
    return m, card([('y', -0.25, 0.25, 0.0, G, 'atlas'), ('x', -0.5, 0.0, 0.0, G, 'atlas')])


def corner_top():
    """The parapet's corner: panel upstand and coping on both street faces."""
    m = Mesher()
    m.vbar(-0.25, 0.21, -0.5, -0.04, 0.0, 1.08, 'wall', left=False)
    m.vbar(-0.25, 0.31, -0.5, 0.06, 1.08, T, 'trim', left=False)
    m.level(T, -0.25, 0.31, -0.5, 0.06, 'trim')
    return m, card([('y', -0.25, 0.25, 0.0, T, 'wall'), ('x', -0.5, 0.0, 0.0, T, 'wall')])


def make(a):
    global KIT
    materials = {
        'wall': _kit.coated_panel('paint_wall', WALL_COLOR, gloss=0.3, grime=0.5, seed=11),
        'trim': _kit.coated_panel('paint_trim', TRIM_COLOR, gloss=0.55, grime=0.3, seed=12),
        'glass_a': _kit.window_glass('a', seed=1),
        'glass_b': _kit.window_glass('b', seed=2),
        'glass_c': _kit.window_glass('c', seed=3),
        'crown': M.lamp(color=(1.0, 0.90, 0.74), strength=6.0, name='lamp_crown'),
        'spandrel': _kit.flat('spandrel_glass', (0.17, 0.22, 0.26), roughness=0.12, metallic=0.9,
                              seed=4, variation=0.04),
        'frame': _kit.flat('frame_dark', (0.035, 0.035, 0.038), roughness=0.5, seed=5),
        'void': _kit.flat('void_dark', (0.02, 0.02, 0.022), roughness=0.9, seed=6),
        'soffit': _kit.flat('soffit_panel', (0.62, 0.61, 0.58), roughness=0.5, seed=7),
        'louvre': M.brushed_metal(color=(0.50, 0.51, 0.52), roughness=0.42, direction='X',
                                  grime=0.35, seed=8, name='louvre_metal'),
        'stone': M.stone(color=(0.50, 0.47, 0.42), block=(1.2, 0.6), rough=0.3, stains=0.35,
                         seed=9, name='stone_clad'),
    }
    materials['atlas'] = materials['frame']
    # On the cards the trim keeps its colour: a twin of paint_trim that is not a paint.
    twins = {'trim': _kit.coated_panel('trim_baked', TRIM_COLOR, gloss=0.55, grime=0.3, seed=12)}
    KIT = kit = _kit.Kit(a, materials, twins)

    for name, slot, width, height, builder in (
            ('upper_window_4_a', 'upper_window', 4.0, H, window_fins),
            ('upper_window_4_b', 'upper_window', 4.0, H, window_bands),
            ('upper_window_4_c', 'upper_window', 4.0, H, window_flush),
            ('upper_mechanical_4_a', 'upper_mechanical', 4.0, H, mechanical),
            ('corner_upper_a', 'corner_upper', 0.5, H, corner_upper),
            ('top_parapet_4_a', 'top_parapet', 4.0, T, parapet),
            ('corner_top_a', 'corner_top', 0.5, T, corner_top)):
        kit.add(name, slot, width, height, *builder())

    x = kit.add('top_crown_4_a', 'top_crown', 4.0, T, *crown())
    kit.anchor('sign', 'top_crown_4_a', x, (0.0, 0.04, 0.72), width=3.6, height=0.6)
    x = kit.add('ground_entrance_8_a', 'ground_entrance', 8.0, G, *entrance(), texel_scale=1.3)
    kit.anchor('sign', 'ground_entrance_8_a', x, (0.0, 0.02, 3.78), width=6.0, height=0.6)
    kit.anchor('light', 'ground_entrance_8_a', x, (0.0, 0.6, 2.93), forward=(0.0, 0.0, -1.0),
               up=(0.0, 1.0, 0.0), light='spot', color=[1.0, 0.86, 0.66], range=9.0, cone=1.4)
    x = kit.add('ground_shop_4_a', 'ground_shop', 4.0, G, *shop(), texel_scale=1.3)
    kit.anchor('sign', 'ground_shop_4_a', x, (0.0, 0.02, 3.75), width=3.4, height=0.6)
    kit.anchor('light', 'ground_shop_4_a', x, (0.0, 0.45, 3.08), forward=(0.0, 0.0, -1.0),
               up=(0.0, 1.0, 0.0), light='spot', color=[1.0, 0.86, 0.66], range=7.0, cone=1.4)
    kit.add('corner_ground_a', 'corner_ground', 0.5, G, *corner_ground(), texel_scale=1.3)
    kit.finish()

    a.set_lod_distances(160.0)
    a.bake(emissive_size=512, occlusion_distance=1.0, occlusion_ground=False,
           cage_extrusion=1.7,
           material_texels={'lamp_window_a': 0.6, 'lamp_window_b': 0.6, 'lamp_window_c': 0.6,
                            'spandrel_glass': 0.6, 'void_dark': 0.5})


def assemble(a):
    """After the bake: the cards go to the catalogue places of their modules."""
    KIT.restore()
