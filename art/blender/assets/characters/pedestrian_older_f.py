"""Pedestrian base: an older woman in a dress (pedestrian_older_f). 1.60 m, average build, in
her sixties.

A short-sleeved dress with a round neck and a skirt to below the knee (all paint_top), low
shoes, grey hair in a bob to the jaw. The crowd system recolours the paint roles (and the skin
and hair) to make many people from this one file.

    paint_skin    #D2A486      paint_hair    #A8A49C
    paint_top     #6B7FA8 (dress)          paint_shoes  #5A4636
    atlas         eyes

Five draw calls (no paint_bottom). lod0 about 5,300 triangles; a crowd-sized bake (spec 'lean').
"""
import _person
import _wardrobe

ASSET = {
    'id': 'pedestrian_older_f',
    'kind': 'character',
    'atlas': 1024,
    'budget': {'draws': 5, 'triangles': 6500, 'bytes': 380000},
}

SPEC = {
    'figure': dict(height=1.60, sex='f', build='average', bust=0.8,
                   face=dict(jaw=0.90, chin=0.88, nose_width=0.92, nose_length=1.03, lips=0.98, age=0.9)),
    'skin': _wardrobe.linear('#D2A486'),
    'eyes': (0.050, 0.060, 0.065),
    'beard': 0.0,
    'seed': 34,
    'hair': dict(style='bob', color='#A8A49C'),
    # A floral print day dress.
    'outfit': dict(top=dict(piece='dress', color='#6B7FA8', print='floral'),
                   shoes=dict(piece='shoes', color='#5A4636')),
    'bare_legs': True,
    'skin_triangles': 2700,
    'detail': 0.8,
    'lean': True,
}


def make(a):
    _person.build(a, SPEC)
