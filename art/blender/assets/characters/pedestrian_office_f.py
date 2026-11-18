"""Pedestrian base: a woman in office clothes (pedestrian_office_f). 1.68 m, slim, about thirty.

A short-sleeved blouse with a collar and a small V at the throat, worn over a straight skirt to
the knee; low flats; dark hair drawn back into a bun. The crowd system recolours the paint roles
(and the skin and hair) to make many people from this one file.

    paint_skin    #A8754F      paint_hair    #2A1D16
    paint_top     #E6DFD2 (blouse)         paint_bottom  #2E3440 (skirt)
    paint_shoes   #2A2222 (flats)          atlas  eyes

Six draw calls. lod0 about 5,500 triangles; a crowd-sized bake (spec 'lean').
"""
import _person
import _wardrobe

ASSET = {
    'id': 'pedestrian_office_f',
    'kind': 'character',
    'atlas': 1024,
    'budget': {'draws': 6, 'triangles': 6500, 'bytes': 380000},
}

SPEC = {
    'figure': dict(height=1.68, sex='f', build='slim', bust=0.7,
                   face=dict(jaw=0.92, nose_width=0.90, lips=1.0, eye_size=1.02, age=0.2)),
    'skin': _wardrobe.linear('#A8754F'),
    'eyes': (0.070, 0.040, 0.020),
    'beard': 0.0,
    'seed': 32,
    'hair': dict(style='bun', color='#2A1D16'),
    'outfit': dict(top=dict(piece='blouse', color='#E6DFD2'),
                   bottom=dict(piece='skirt', color='#2E3440'),
                   shoes=dict(piece='flats', color='#2A2222')),
    'bare_legs': True,
    'skin_triangles': 2900,
    'detail': 0.8,
    'lean': True,
}


def make(a):
    _person.build(a, SPEC)
