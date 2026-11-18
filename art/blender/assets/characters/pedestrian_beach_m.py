"""Pedestrian base: a man at the beach (pedestrian_beach_m). 1.76 m, heavy, in his fifties.

An unbuttoned short-sleeved shirt over his bare chest, knee-length shorts and low sneakers; a
close straight haircut going grey. The crowd system recolours the paint roles (and the skin and
hair) to make many people from this one file.

    paint_skin    #C08A68      paint_hair    #6E655C
    paint_top     #4F9A94 (shirt)          paint_bottom  #C8B48A (shorts)
    paint_shoes   #E2DED4 (sneakers)       atlas  eyes

Six draw calls. lod0 about 5,500 triangles; a crowd-sized bake (spec 'lean').
"""
import _person
import _wardrobe

ASSET = {
    'id': 'pedestrian_beach_m',
    'kind': 'character',
    'atlas': 1024,
    'budget': {'draws': 6, 'triangles': 6500, 'bytes': 380000},
}

SPEC = {
    'figure': dict(height=1.76, sex='m', build='heavy',
                   face=dict(jaw=1.08, nose_width=1.02, nose_length=1.04, lips=0.95, age=0.75)),
    'skin': _wardrobe.linear('#C08A68'),
    'eyes': (0.040, 0.050, 0.060),
    'beard': 0.25,
    'seed': 31,
    'hair': dict(style='short', color='#6E655C'),
    'outfit': dict(top=dict(piece='open_shirt', color='#4F9A94'),
                   bottom=dict(piece='shorts', color='#C8B48A'),
                   shoes=dict(piece='sneakers', color='#E2DED4')),
    'bare_legs': True,
    'skin_triangles': 2900,
    'detail': 0.8,
    'lean': True,
}


def make(a):
    _person.build(a, SPEC)
