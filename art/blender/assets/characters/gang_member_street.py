"""Gang member base, street style: a yard-crew man of Los Remaches (catalog member
remache_stripper, gangsAndFactions.js), 1.80 m, athletic, buzz cut and a beard shadow.

The catalog's outfit: a sleeveless tank top in the crew's orange worn over grey cargo trousers
with thigh pockets, black boots. The crowd system recolours the paint roles for the crew's other
tank colours (#2B2B2E, #E9E4D8) and for other street crews.

    paint_skin    #7A4E33      paint_top     #F08A3C (tank)
    paint_bottom  #3A3D40 (cargo)          paint_shoes   #1A1A1C (boots)
    atlas         eyes

Five draw calls; lod0 about 5,500 triangles; a crowd-sized bake (spec 'lean').
"""
import _person
import _wardrobe

ASSET = {
    'id': 'gang_member_street',
    'kind': 'character',
    'atlas': 1024,
    'budget': {'draws': 5, 'triangles': 7000, 'bytes': 420000},
}

SPEC = {
    'figure': dict(height=1.80, sex='m', build='athletic',
                   face=dict(jaw=1.04, brow=1.0, nose_width=1.02, lips=1.0, age=0.25)),
    'skin': _wardrobe.linear('#7A4E33'),
    'eyes': (0.050, 0.030, 0.016),
    'beard': 0.7,
    'seed': 71,
    'hair': dict(style='buzz', color='#16120F'),
    'outfit': dict(top=dict(piece='tank', color='#F08A3C'),
                   bottom=dict(piece='cargo', color='#3A3D40'),
                   shoes=dict(piece='boots', color='#1A1A1C')),
    'skin_triangles': 2600,
    'detail': 0.8,
    'lean': True,
}


def make(a):
    _person.build(a, SPEC)
