"""Pedestrian base: a young man in casual clothes (pedestrian_casual_m). 1.83 m, slim, early
twenties.

A short-sleeved tee with a crew neck worn over straight jeans; low sneakers; a close straight
haircut. The crowd system recolours the paint roles (and the skin and hair) to make many people
from this one file.

    paint_skin    #7A4E33      paint_hair    #121010
    paint_top     #B04A3A (tee)            paint_bottom  #3D5170 (jeans)
    paint_shoes   #DCDAD2 (sneakers)       atlas  eyes

Six draw calls. lod0 about 5,200 triangles; a crowd-sized bake (spec 'lean').
"""
import _person
import _wardrobe

ASSET = {
    'id': 'pedestrian_casual_m',
    'kind': 'character',
    'atlas': 1024,
    'budget': {'draws': 6, 'triangles': 6500, 'bytes': 380000},
}

SPEC = {
    'figure': dict(height=1.83, sex='m', build='slim',
                   face=dict(jaw=0.98, nose_width=0.96, lips=1.0, age=0.1)),
    'skin': _wardrobe.linear('#7A4E33'),
    'eyes': (0.045, 0.026, 0.014),
    'beard': 0.15,
    'seed': 33,
    'hair': dict(style='short', color='#121010'),
    'outfit': dict(top=dict(piece='tee', color='#B04A3A'),
                   bottom=dict(piece='jeans', color='#3D5170'),
                   shoes=dict(piece='sneakers', color='#DCDAD2')),
    'skin_triangles': 2500,
    'detail': 0.8,
    'lean': True,
}


def make(a):
    _person.build(a, SPEC)
