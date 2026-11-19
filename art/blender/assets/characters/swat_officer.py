"""SWAT officer: the tactical officer of the Policía de Marazul (catalog member tactical_officer),
1.84 m, athletic, a buzz cut under the helmet.

The catalog's outfit: a near-black plate carrier (a padded vest lofted around the shirt, webbing
straps over the shoulders, three magazine pouches on the front) over a navy long-sleeved shirt;
navy cargo trousers with thigh pockets on black boots; a ballistic helmet, knee pads and black
gloves.

    paint_skin    #8D5A3B      paint_jacket  #26262B (the vest: the catalog's top colour)
    paint_top     #1B2A41 (the shirt: the catalog's secondary colour)
    paint_bottom  #1B2A41      paint_shoes   #1A1A1C
    atlas         eyes, helmet and knee pads (#26262B), gloves (#1A1A1C)

Six draw calls; lod0 about 6,500 triangles; a crowd-sized bake (spec 'lean'). The game hangs
a long gun from anchor_hand_r or anchor_back.
"""
import _person
import _wardrobe

ASSET = {
    'id': 'swat_officer',
    'kind': 'character',
    'atlas': 1024,
    # Over the crowd's ~380 kB for the vest, helmet, pads and gloves (as police_officer_m).
    'budget': {'draws': 6, 'triangles': 7500, 'bytes': 480000},
}

SPEC = {
    'figure': dict(height=1.84, sex='m', build='athletic',
                   face=dict(jaw=1.06, brow=0.95, nose_width=1.0, lips=0.96, age=0.35)),
    'skin': _wardrobe.linear('#8D5A3B'),
    'eyes': (0.050, 0.030, 0.016),
    'beard': 0.45,
    'seed': 51,
    'hair': dict(style='buzz', color='#1C1612'),
    'outfit': dict(top=dict(piece='tactical_shirt', color='#1B2A41'),
                   bottom=dict(piece='cargo', color='#1B2A41'),
                   shoes=dict(piece='boots', color='#1A1A1C'),
                   kit='tactical', vest='#26262B', gear='#26262B', gloves='#1A1A1C'),
    'skin_triangles': 1900,
    'detail': 0.85,
    'lean': True,
}


def make(a):
    _person.build(a, SPEC)
