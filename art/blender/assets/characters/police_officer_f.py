"""Police officer (woman): the patrol officer of the Policía de Marazul (catalog member
patrol_officer), 1.70 m, athletic, her hair drawn back into a bun under where a cap would sit.

The same uniform as police_officer_m: light blue short-sleeved shirt with a turned collar, tucked
in; gold badge, gold name bar, blue shoulder patches with a gold mark; navy trousers on black
boots; a black duty belt with the holster on the right hip and two pouches.

    paint_skin    #C69A7A      paint_hair    #3A2A20
    paint_top     #8FB8D8      paint_bottom  #1B2A41      paint_shoes  #1A1A1C
    atlas         eyes, belt, holster, badge, name bar, patches

Six draw calls. lod0 about 6,000 triangles; a crowd-sized bake (spec 'lean').
"""
import _person
import _wardrobe

ASSET = {
    'id': 'police_officer_f',
    'kind': 'character',
    'atlas': 1024,
    'budget': {'draws': 6, 'triangles': 7000, 'bytes': 420000},
}

SPEC = {
    'figure': dict(height=1.70, sex='f', build='athletic', bust=0.75,
                   face=dict(jaw=0.86, chin=0.84, nose_width=0.88, lips=1.12, age=0.25)),
    'skin': _wardrobe.linear('#C69A7A'),
    'eyes': (0.060, 0.040, 0.020),
    'beard': 0.0,
    'seed': 22,
    'hair': dict(style='bun', color='#3A2A20'),
    'outfit': dict(top=dict(piece='police_shirt', color='#8FB8D8'),
                   bottom=dict(piece='trousers', color='#1B2A41'),
                   shoes=dict(piece='boots', color='#1A1A1C'),
                   kit='police'),
    'skin_triangles': 2700,
    'detail': 0.9,
    'lean': True,
}


def make(a):
    _person.build(a, SPEC)
