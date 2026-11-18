"""Police SUV (the Yunque Custodio of the vehicle catalogue): what the Marazul police send when
a cruiser was not enough.

The SUV's description (_platform.suv) stretched onto the catalogue's bigger main dimensions
(_platform.derive): 5.12 m long over the ram bar, 2.01 m wide, 1.95 m high over the light bar,
on a 3.02 m wheelbase with 0.40 m wheels and 0.22 m of ground clearance; the belt and the roof
are raised a little, so it reads square-jawed and heavy. Its own equipment (_police):
- the roof light bar over the front seats (lamp_siren_a red on the driver's half, lamp_siren_b
  blue on the other) with the driver's A-pillar spotlight, as one extra node `light_bar`;
- a full-width ram bar: two uprights bent over the grille, two cross tubes, rubber pads and a
  lower tube running out round both corners, part of bumper_f;
- black steel wheels with vents;
- cage bars behind the rear side glass;
- the livery: white with the second colour (paint_secondary) on the four door skins; the roof
  stays white for its number panel (anchor_decal_roof, facing up: the game paints the number).
anchor_siren sits on top of the light bar's centre, facing forward.

Budget: the everyday cars' node contract plus the light bar node, three more materials
(paint_secondary, lamp_siren_a, lamp_siren_b), the lamp units with depth, the roof bar, ram bar
and cage: 24,500 triangles, 46 draw calls and 1,300,000 bytes (the geometry is not compressed).

Blender axes: Z up, the car faces +Y, right side +X, origin on the ground at the centre of the
wheelbase; the driver sits on the left (-X).
"""
import _body as B
import _car
import _platform
import _police

ASSET = {
    'id': 'police_suv',
    'kind': 'vehicle',
    'atlas': 1024,
    'budget': {'triangles': 24500, 'draws': 46, 'bytes': 1300000},
}

BAR_Y, BAR_HALF = -0.04, 0.62                          # light bar station and half length

SPEC = _platform.derive(
    _platform.suv(), tail=-2.43, axle_r=-1.51, axle_f=1.51, nose=2.48, width=2.01,
    heights=[(1.155, 1.20), (1.732, 1.79)],
    color='#F2F0E8', secondary_color='#1D4E7A', police=True, clearance=0.22,
    wheel_radius=0.40, tyre_width=0.265, track=1.73, arch_radius=0.445,
    wheel={'style': 'steel', 'rim_ratio': 0.6}, lod1=4900, lod2=1200)
# Doors in the second colour above the cladding; a squarer, deeper bar grille.
SPEC['secondary'] = [(('sill_rear', 'door_front'), (B.COL_GLASS_BASE, B.COLUMNS - 2))]
SPEC['nose_cap'] = [('lamp_head', 5, 8, B.COL_GLASS_BASE, B.COL_BELT + 2),
                    ('lamp_indicator_r', 6, 8, B.COL_BELT + 2, B.COL_BELT + 3),
                    ('grille', 0, 5, B.COL_GLASS_BASE + 1, B.COL_BELT + 5),
                    ('grille', 0, 6, B.COL_BELT + 6, B.COL_BELT + 8)]
BAR_TOP = _police.roof_height(SPEC, BAR_Y, 0.0) + 0.035 + 0.105
SPEC['anchors'] = [('anchor_siren', (0.0, BAR_Y, BAR_TOP), (0, 1, 0)),
                   ('anchor_decal_roof', (0.0, -0.95, _police.roof_height(SPEC, -0.95, 0.0) + 0.003),
                    (0, 0, 1))]


def fittings(shell, spec, mats):
    bar, _top = _police.light_bar(spec, mats, BAR_Y, half=BAR_HALF, foot_x=0.5,
                                  pods=((0.075, 0.33), (0.345, 0.605)))
    ram = _police.push_bar(shell, mats, x=0.33, low=0.36, top=0.98, cross=(0.62, 0.84),
                           probe=(0.45, 0.6, 0.75, 0.9), pad=(0.66, 0.4), wing=(0.48, 0.80))
    cage = _police.cage_bars(shell, mats, (-1.0, -0.8, -0.6, -0.4, -0.22))
    return {'bumper_f': ram, 'lod0': cage,
            'light_bar': bar + _police.spotlight(shell, mats)}


SPEC['fittings'] = fittings


def make(a):
    _car.make_car(a, SPEC)


def assemble(a):
    _car.assemble_car(a)
