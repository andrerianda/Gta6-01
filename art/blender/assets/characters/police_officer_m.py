"""Police officer (man): the patrol officer of the Policía de Marazul (catalog member
patrol_officer, game/src/catalog/gangsAndFactions.js), 1.80 m, average build.

The force's uniform: a light blue short-sleeved shirt with a turned collar, tucked in; a gold
badge on the left chest, a gold name bar on the right and a blue shoulder patch with a gold mark
on each sleeve; navy trousers on black boots; a black duty belt with the holster on the right
hip and two pouches at the front. A close straight haircut. No cap (the catalog makes it
optional; anchor_head carries one).

    paint_skin    #8D5A3B      paint_hair    #1A1614
    paint_top     #8FB8D8 (shirt)          paint_bottom  #1B2A41 (trousers)
    paint_shoes   #1A1A1C (boots)          atlas  eyes, belt, holster, badge, name bar, patches

Six draw calls. lod0 about 6,100 triangles; a crowd-sized bake (spec 'lean').
"""
import _person
import _wardrobe

ASSET = {
    'id': 'police_officer_m',
    'kind': 'character',
    'atlas': 1024,
    # Over the crowd's ~380 kB: the belt, holster, pouches, badge, name bar and patches add about
    # 600 vertices (police are seen close, in arrests); still under the character default.
    'budget': {'draws': 6, 'triangles': 7000, 'bytes': 470000},
}

SPEC = {
    'figure': dict(height=1.80, sex='m', build='average',
                   face=dict(jaw=1.04, brow=1.0, nose_width=0.98, nose_length=1.02, lips=0.96, age=0.4)),
    'skin': _wardrobe.linear('#8D5A3B'),
    'eyes': (0.050, 0.030, 0.016),
    'beard': 0.3,
    'seed': 21,
    'hair': dict(style='short', color='#1A1614'),
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
