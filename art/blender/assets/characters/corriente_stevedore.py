"""Gang member base, La Corriente: a stevedore of the port crew (catalog member
corriente_stevedore, gangsAndFactions.js), 1.84 m, athletic (dock muscle; the catalog's
heavy build ballooned the open vest over the belly), buzz cut and a short beard.

The catalog's first outfit: an open orange high-visibility vest hanging over a dark teal tee,
grey cargo trousers with thigh pockets, brown work boots. The crowd system recolours the paint
roles for the crew's other colours (a yellow vest #E8E23A, a light teal tee #1F9AA0, teal cargo
#0E3B43; the tank-top outfit uses gang_member_street).

    paint_skin    #8D5A3B      paint_jacket  #F28C28 (vest)
    paint_top     #0E3B43 (tee)             paint_bottom  #3A3D40 (cargo)
    paint_shoes   #3A2A1E (boots)           atlas         eyes

Six draw calls; lod0 about 6,000 triangles; a crowd-sized bake (spec 'lean').
"""
import _person
import _wardrobe

ASSET = {
    'id': 'corriente_stevedore',
    'kind': 'character',
    'atlas': 1024,
    # The vest over a tee is one more paint role than a tank-top crew member.
    'budget': {'draws': 6, 'triangles': 7500, 'bytes': 420000},
}

SPEC = {
    'figure': dict(height=1.84, sex='m', build='athletic',
                   face=dict(jaw=1.10, brow=1.05, nose_width=1.08, lips=1.0, age=0.45)),
    'skin': _wardrobe.linear('#8D5A3B'),
    'eyes': (0.045, 0.028, 0.015),
    'beard': 0.85,
    'seed': 83,
    'hair': dict(style='buzz', color='#1A1614'),
    'outfit': dict(top=dict(piece='vest', color='#F28C28', secondary='#0E3B43', roughness=0.82),
                   bottom=dict(piece='cargo', color='#3A3D40'),
                   shoes=dict(piece='boots', color='#3A2A1E')),
    'skin_triangles': 2600,
    'detail': 0.8,
    'lean': True,
}


def make(a):
    _person.build(a, SPEC)
