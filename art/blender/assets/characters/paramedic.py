"""Paramedic: a crew member of Marazul Fire Rescue (catalog member paramedic), a woman of 1.66 m,
average build, her hair in a ponytail.

The catalog's outfit: an off-white crew polo with a turned collar, tucked into navy cargo
trousers under a black belt; red crew patches on the left chest and both sleeves; black boots;
light blue nitrile gloves.

    paint_skin    #B07A55      paint_hair    #3A2A20
    paint_top     #F2F0E8 (polo)            paint_bottom  #1B2A41 (cargo)
    paint_shoes   #1A1A1C (boots)           atlas  eyes, belt, patches (#C8372D), gloves (#6FB7D9)

Six draw calls; lod0 about 6,000 triangles; a crowd-sized bake (spec 'lean'). The game may hang
a medic's bag from anchor_back.
"""
import _person
import _wardrobe

ASSET = {
    'id': 'paramedic',
    'kind': 'character',
    'atlas': 1024,
    'budget': {'draws': 6, 'triangles': 7000, 'bytes': 440000},
}

SPEC = {
    'figure': dict(height=1.66, sex='f', build='average', bust=0.75,
                   face=dict(jaw=0.88, chin=0.86, nose_width=0.92, lips=1.06, eye_size=1.0, age=0.35)),
    'skin': _wardrobe.linear('#B07A55'),
    'eyes': (0.045, 0.030, 0.018),
    'beard': 0.0,
    'seed': 61,
    'hair': dict(style='ponytail', color='#3A2A20'),
    'outfit': dict(top=dict(piece='polo', color='#F2F0E8'),
                   bottom=dict(piece='cargo', color='#1B2A41'),
                   shoes=dict(piece='boots', color='#1A1A1C'),
                   belt=True, gloves='#6FB7D9', patches='#C8372D'),
    'skin_triangles': 2200,
    'detail': 0.85,
    'lean': True,
}


def make(a):
    _person.build(a, SPEC)
