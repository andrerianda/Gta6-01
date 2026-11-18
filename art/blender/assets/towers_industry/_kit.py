"""Shared helpers of the tower and industry kits (not an asset: the name starts with _).

A kit is one asset holding many facade modules. Each module is one bay of one storey on the
module grid: authored facing +Y with the outer wall surface on Y = 0, spanning X from -width/2
to +width/2 and Z from 0 to its height, the back open. Every module ships as two nodes,
<module>_lod0 (the modelled bay) and <module>_lod1 (a flat card on the wall plane of at most
eight triangles whose texture is baked from the modelled bay).

Mesher   collects quads by material key and builds a mesh from them: panels, bars swept along
         X or Z with only the faces that can be seen, single faces. UVs are in metres.
card()   the lod1 card of a module from rectangles, one material key each.
Kit      lays the modules out in a row for the bake (lod0 on Y = 0, the cards with their
         high-detail sources on a second row so that neither shades the other), registers
         them, records slot, width and height as node extras and in the scene extras, and
         after the bake moves each card to the place of its module.

Layout contract for the game: a module's geometry is in module space; the node's translation
is only its place in the catalogue row and is ignored by the assembler. An anchor of a module
sits at the node's translation plus its module-space position.

Materials: paint_wall and paint_trim bake neutral (the game tints them). On a card the trim is
baked with its default colour (the card source uses a twin material that is not paint), so
mullions stay dark inside the glazing quads; wall areas of a card are quads of paint_wall.
"""
import math

from lib import build
from lib import materials as M

BAY = 4.0
PANE = BAY / 3.0                       # the glazing pitch of every tower module
OFFICE_STOREY = 4.0
GROUND_STOREY = 4.2
TOP_PIECE = 1.2
CORNER = 0.5

CEILING = 3.6                          # the suspended ceiling line behind the glass
WINDOW_GLOW = 2.2                      # emissive strength of a lit window
GLASS_TINT = (0.46, 0.54, 0.60)        # mid-tone, slightly cool: metal-like glass mirrors the sky
SPANDREL = (0.085, 0.10, 0.12)         # back-painted spandrel glass, dark and mostly dielectric
WARM_LIGHT = (1.0, 0.80, 0.52)
COOL_LIGHT = (0.80, 0.90, 1.0)


class Mesher:
    """Quads by material key. Every helper leaves out the faces nobody can see."""

    def __init__(self):
        self.vertices, self.faces, self.uvs, self.keys = [], [], [], []

    def quad(self, a, b, c, d, key):
        """One quad; corners counter-clockwise seen from the front."""
        base = len(self.vertices)
        self.vertices += [a, b, c, d]
        self.faces.append((base, base + 1, base + 2, base + 3))
        width, height = math.dist(a, b), math.dist(a, d)
        self.uvs.append([(0.0, 0.0), (width, 0.0), (width, height), (0.0, height)])
        self.keys.append(key)

    def sweep(self, axis, profile, start, end, key):
        """A strip: a polyline `profile` swept along Z (points are x, y) or X (points are y, z)
        as one UV island. Along Z a face looks to the right of the walking direction of the
        profile seen from above; along X a profile running top, front, bottom looks outwards."""
        base = len(self.vertices)
        length = end - start
        along = [0.0]
        for p, q in zip(profile, profile[1:]):
            along.append(along[-1] + math.dist(p, q))
        for p in profile:
            if axis == 'z':
                self.vertices += [(p[0], p[1], start), (p[0], p[1], end)]
            else:
                self.vertices += [(start, p[0], p[1]), (end, p[0], p[1])]
        for index in range(len(profile) - 1):
            low0, high0 = base + 2 * index, base + 2 * index + 1
            low1, high1 = low0 + 2, high0 + 2
            u0, u1 = along[index], along[index + 1]
            if axis == 'z':
                self.faces.append((low0, low1, high1, high0))
                self.uvs.append([(u0, 0.0), (u1, 0.0), (u1, length), (u0, length)])
            else:
                self.faces.append((low0, high0, high1, low1))
                self.uvs.append([(0.0, u0), (length, u0), (length, u1), (0.0, u1)])
            self.keys.append(key)

    def panel(self, x0, x1, z0, z1, y, key):
        """A flat face looking to the street (+Y)."""
        self.sweep('z', [(x1, y), (x0, y)], z0, z1, key)

    def back(self, x0, x1, z0, z1, y, key):
        """A flat face looking into the building (-Y): the roof side of parapets and crowns."""
        self.sweep('z', [(x0, y), (x1, y)], z0, z1, key)

    def vbar(self, x0, x1, y_back, y_front, z0, z1, key, left=True, right=True):
        """An upright bar: its front and the sides asked for."""
        profile = [(x1, y_front), (x0, y_front)]
        if right:
            profile.insert(0, (x1, y_back))
        if left:
            profile.append((x0, y_back))
        self.sweep('z', profile, z0, z1, key)

    def hbar(self, x0, x1, y_back, y_front, z0, z1, key, top=True, bottom=True):
        """A level bar: its front, and the top and underside asked for."""
        profile = [(y_front, z1), (y_front, z0)]
        if top:
            profile.insert(0, (y_back, z1))
        if bottom:
            profile.append((y_back, z0))
        self.sweep('x', profile, x0, x1, key)

    def side(self, x, y0, y1, z0, z1, key, sign=1):
        """A face on a plane of constant X looking along +X (sign 1) or -X (sign -1)."""
        corners = [(x, y0, z0), (x, y1, z0), (x, y1, z1), (x, y0, z1)]
        self.quad(*(corners if sign > 0 else corners[::-1]), key)

    def level(self, z, x0, x1, y0, y1, key, sign=1):
        """A level face looking up (sign 1) or down (sign -1)."""
        corners = [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)]
        self.quad(*(corners if sign > 0 else corners[::-1]), key)

    def slat(self, x0, x1, inner, outer, key):
        """A sloping sheet between two (y, z) edges, seen from both sides: louvre blades,
        tie rods."""
        self.sweep('x', [inner, outer], x0, x1, key)
        self.sweep('x', [outer, inner], x0, x1, key)

    def triangles(self):
        return 2 * len(self.faces)

    def build(self, name, materials):
        """The mesh object, one material slot per key used."""
        obj = build.from_data(name, self.vertices, self.faces, self.uvs)
        used = sorted(set(self.keys))
        for key in used:
            obj.data.materials.append(materials[key])
        obj.data.polygons.foreach_set('material_index', [used.index(key) for key in self.keys])
        obj.data.update()
        return obj


def card(rectangles):
    """The lod1 card: rectangles (plane, u0, u1, z0, z1, key). Plane 'y' is the wall plane
    Y = 0 looking at the street (u is X); plane 'x' is X = +0.25 looking along +X (u is Y),
    the second street face of a corner post."""
    mesher = Mesher()
    for plane, u0, u1, z0, z1, key in rectangles:
        if plane == 'y':
            mesher.quad((u1, 0.0, z0), (u0, 0.0, z0), (u0, 0.0, z1), (u1, 0.0, z1), key)
        else:
            mesher.quad((CORNER / 2, u0, z0), (CORNER / 2, u1, z0), (CORNER / 2, u1, z1),
                        (CORNER / 2, u0, z1), key)
    if mesher.triangles() > 8:
        raise ValueError('a lod1 card has at most 8 triangles')
    return mesher


class Kit:
    """Registers the modules of one kit on the asset builder `a`."""

    GAP = 2.0
    CARD_ROW = 14.0

    def __init__(self, a, materials, source_materials):
        self.a = a
        self.materials = materials
        self.source_materials = {**materials, **source_materials}
        self.cursor = 0.0
        self.pairs = []
        self.table = {}

    def add(self, name, slot, width, height, mesher, lod1, texel_scale=1.0):
        """Adds a module from its Mesher and its card; returns the X of its catalogue place."""
        x = self.cursor + width / 2.0
        self.cursor += width + self.GAP
        detail = mesher.build(f'{name}_lod0', self.materials)
        source = mesher.build(f'{name}_card_source', self.source_materials)
        flat = lod1.build(f'{name}_lod1', self.materials)
        detail.location = (x, 0.0, 0.0)
        source.location = flat.location = (x, self.CARD_ROW, 0.0)
        for obj in (detail, flat):
            obj['slot'], obj['width'], obj['height'] = slot, float(width), float(height)
        self.a.add(detail, texel_scale=texel_scale)
        self.a.add(flat, sources=[source], texel_scale=0.5 * texel_scale)
        self.pairs.append((flat, detail))
        self.table[name] = {'slot': slot, 'width': float(width), 'height': float(height),
                            'origin': [round(x, 3), 0.0, 0.0],
                            'triangles': [mesher.triangles(), lod1.triangles()]}
        return x

    def anchor(self, kind, name, x, position, forward=(0.0, 1.0, 0.0), **props):
        """An anchor of a module: anchor_<kind>_<module> at a module-space position."""
        return self.a.add_anchor(f'anchor_{kind}_{name}',
                                 (x + position[0], position[1], position[2]),
                                 forward=forward, module=name, **props)

    def finish(self):
        """Call at the end of make(): stores the module table in the asset's extras."""
        self.a.set_extra('modules', self.table)
        self.a.set_extra('module_grid', {'bay': BAY, 'pane': round(PANE, 4),
                                         'office_storey': OFFICE_STOREY,
                                         'ground_storey': GROUND_STOREY, 'top': TOP_PIECE})

    def restore(self):
        """Call from assemble(a): moves every card to the catalogue place of its module."""
        for flat, detail in self.pairs:
            flat.location = detail.location


# ---------------------------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------------------------

def window_glass(group, seed, tint=GLASS_TINT):
    """Tower glazing, named lamp_window_<group>. By day it is a mirror for the sky (metalness
    1, roughness about 0.05, a mid-tone tint) with hints of what is behind: the darker ceiling
    void above 3.6 m, blinds let down by a different amount in every pane, furniture below
    desk height. Its emission is the room at night: a warm or cool wash per pane, brighter on
    the blinds, a dashed row of ceiling lights under the ceiling line."""
    g = M.Graph(f'lamp_window_{group}', seed)
    g.material['mz_emissive_strength'] = WINDOW_GLOW
    x, z = g.axis('X'), g.axis('Z')
    cell = g.math('FLOOR', g.mul(g.add(x, 40.0 + PANE / 2.0), 1.0 / PANE))
    shade = g.white_noise(g.combine(cell, 3.7 + seed, 1.3))
    mood = g.white_noise(g.combine(cell, 9.1 + seed, 5.9))

    ceiling = g.mask(z, CEILING, 0.015)
    drop = g.mul(g.power(shade, 2.0), 1.5)
    hung = g.remap(g.sub(z, g.sub(CEILING, drop)), -0.015, 0.015, 0.0, 1.0)
    blind = g.mul(g.invert(ceiling), hung)
    low = g.invert(g.mask(z, 1.9, 0.25))

    base = g.hsv(tint, value=g.remap(mood, 0.0, 1.0, 0.84, 1.12))
    base = g.mix(g.mul(blind, 0.40), base, (0.66, 0.66, 0.62))
    base = g.mix(g.mul(low, 0.16), base, (0.20, 0.22, 0.24))
    base = g.mix(g.mul(ceiling, 0.45), base, (0.17, 0.20, 0.23))
    roughness = g.add(0.05, g.mul(blind, 0.04))

    level = g.remap(mood, 0.0, 1.0, 0.30, 0.62)
    level = g.mix_value(low, level, g.mul(level, 0.55))
    level = g.mix_value(blind, level, g.minimum(g.mul(level, 1.5), 0.9))
    under = g.mul(g.mask(z, CEILING - 0.14, 0.01), g.invert(ceiling))
    step = g.math('FRACT', g.mul(g.add(x, 40.0), 2.0 / PANE))
    dash = g.remap(g.math('ABSOLUTE', g.sub(step, 0.5)), 0.30, 0.34, 1.0, 0.0)
    level = g.maximum(level, g.mul(under, dash))
    level = g.mix_value(ceiling, level, 0.03)
    light = g.mix(g.mask(mood, 0.72, 0.02), WARM_LIGHT, COOL_LIGHT)
    return g.surface(base_color=base, roughness=roughness, metallic=1.0,
                     emission_color=g.hsv(light, value=level), emission_strength=WINDOW_GLOW)


def curtain_wall_tile(name, sill, tint=GLASS_TINT, spandrel=SPANDREL,
                      mullion=(0.07, 0.062, 0.055), seed=0):
    """A repeating curtain wall for the far sides of towers, baked on a 4 m square: panes on
    the 1.333 m pitch, one storey of 4.0 m with an opaque spandrel below `sill`, dark mullions
    and transoms in relief (bump), a darker ceiling void, a little value change per pane."""
    g = M.Graph(name, seed)
    x, z = g.axis('X'), g.axis('Z')
    across = g.math('FRACT', g.mul(g.add(x, 40.0), 1.0 / PANE))
    height = g.mul(g.math('FRACT', g.mul(g.add(z, 40.0), 1.0 / OFFICE_STOREY)), OFFICE_STOREY)
    edge = g.mul(g.minimum(across, g.sub(1.0, across)), PANE)
    bar = g.invert(g.mask(edge, 0.035, 0.006))
    floor_line = g.maximum(g.invert(g.mask(height, 0.06, 0.01)),
                           g.invert(g.mask(g.math('ABSOLUTE', g.sub(height, sill)), 0.04, 0.01)))
    frame = g.maximum(bar, floor_line)
    lower = g.invert(g.mask(height, sill, 0.01))
    ceiling = g.mask(height, CEILING, 0.015)
    cell = g.math('FLOOR', g.mul(g.add(x, 40.0), 1.0 / PANE))
    mood = g.white_noise(g.combine(cell, 4.3 + seed, 2.1))
    glass = g.hsv(tint, value=g.remap(mood, 0.0, 1.0, 0.84, 1.12))
    glass = g.mix(g.mul(ceiling, 0.45), glass, (0.17, 0.20, 0.23))
    base = g.mix(lower, glass, spandrel)
    base = g.mix(frame, base, mullion)
    metallic = g.mix_value(frame, g.mix_value(lower, 1.0, 0.25), 0.0)
    roughness = g.mix_value(frame, g.mix_value(lower, 0.05, 0.16), 0.45)
    return g.surface(base_color=base, roughness=roughness, metallic=metallic,
                     normal=g.bump(frame, strength=0.6, distance=0.04))


def flat(name, color, roughness=0.6, metallic=0.0, seed=0, variation=0.06):
    """A plain finish with soft patches of value: voids, soffits, opaque spandrel glass."""
    g = M.Graph(name, seed)
    return g.surface(base_color=g.vary(color, amount=variation, scale=1.2), roughness=roughness,
                     metallic=metallic)


def coated_panel(name, color, gloss, grime, seed):
    """Powder-coated metal panel or extrusion. Named paint_* it is tintable and bakes neutral;
    under another name the same finish bakes with its colour (the cards' trim)."""
    return M.painted_metal(color=color, gloss=gloss, chips=0.0, rust=0.0, grime=grime,
                           dust=0.25, fade=0.2, seed=seed, name=name)
