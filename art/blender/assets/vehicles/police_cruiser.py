"""Police cruiser (the Holloway Warden of the vehicle catalogue): the Marazul police patrol car.

A big rear-drive pursuit saloon on the everyday cars' saloon platform (_platform.derive),
stretched to the catalogue's 5.06 m over the push bar, 1.91 m wide and 1.62 m high over the
light bar, on a 2.96 m wheelbase with 0.35 m wheels and a blunter nose. Its own equipment (bar, spotlight and push bar from the shared helper _police):
- a low roof light bar on two feet over the front seats: a dark housing with four ribbed lens
  pods, lamp_siren_a (red) on the driver's half and lamp_siren_b (blue) on the other, as one
  extra node `light_bar` under lod0 together with
- the spotlight on the driver's A pillar (black housing, plated reflector, a post through the
  pillar);
- a tubular push bar with rubber pads standing in front of the nose, part of bumper_f (it
  comes off with the bumper);
- black steel wheels with vents and plated hub caps;
- the livery's second colour (paint_secondary) on the four door skins and the roof.
anchor_siren sits on top of the light bar's centre, facing forward.

Budget: the everyday cars' node contract plus the light bar node and three more materials
(paint_secondary, lamp_siren_a, lamp_siren_b), and the lamp units with depth (_lamps, about
2,000 triangles and the lens glass): 23,500 triangles, 46 draw calls and 1,250,000 bytes (the
geometry is not compressed).

Blender axes: Z up, the car faces +Y, right side +X, origin on the ground at the centre of the
wheelbase; the driver sits on the left (-X).
"""
import _body as B
import _car
import _platform
import _police

ASSET = {
    'id': 'police_cruiser',
    'kind': 'vehicle',
    'atlas': 1024,
    'budget': {'triangles': 23500, 'draws': 46, 'bytes': 1250000},
}

BAR_Y, BAR_DEPTH, BAR_HALF = -0.10, 0.28, 0.58      # light bar centre station, depth, half length
PUSH_X = 0.30                                         # push bar uprights, either side

SPEC = _platform.derive(
    _platform.saloon(), tail=-2.424, axle_r=-1.48, axle_f=1.48, nose=2.321, width=1.91,
    heights=[(0.95, 1.0), (1.46, 1.49)],
    color='#F2F0E8', secondary_color='#1D4E7A', police=True,
    wheel_radius=0.35, tyre_width=0.235, track=1.64, arch_radius=0.385,
    wheel={'style': 'steel', 'rim_ratio': 0.62}, clearance=0.15,
    nose_bow=0.05, nose_bulge=0.02, lod1=4800, lod2=1200)
SPEC['secondary'] = [(('roof_rear', 'roof_front'), (0, B.COL_RAIL)),
                     (('sill_rear', 'door_front'), (B.COL_GLASS_BASE, B.COLUMNS - 1))]
BAR_TOP = _police.roof_height(SPEC, BAR_Y, 0.0) + 0.035 + 0.105
SPEC['anchors'] = [('anchor_siren', (0.0, BAR_Y, BAR_TOP), (0, 1, 0))]


def fittings(shell, spec, mats):
    bar, _top = _police.light_bar(spec, mats, BAR_Y, depth=BAR_DEPTH, half=BAR_HALF)
    return {'bumper_f': _police.push_bar(shell, mats, x=PUSH_X),
            'light_bar': bar + _police.spotlight(shell, mats)}


SPEC['fittings'] = fittings


def make(a):
    _car.make_car(a, SPEC)


def assemble(a):
    _car.assemble_car(a)
