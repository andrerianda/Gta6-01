"""Gang member base, the Aurelia Circle: an enforcer in a dark suit (catalog member
circle_enforcer, gangsAndFactions.js), 1.85 m, athletic, a buzz cut and stubble.

The catalog's first outfit: a charcoal single-button suit jacket over an off-white dress shirt
(its turned collar and front show in the jacket's V), suit trousers on low black shoes (the
catalog's loafers). The crowd system recolours the paint roles for the Circle's other suit
(#2A2A33) and for the floor guards' pale blazer (#EFE6D2).

    paint_skin    #C68B63      paint_jacket  #1E1E20 (suit jacket)
    paint_top     #F2F0E8 (shirt)           paint_bottom  #1E1E20 (suit trousers)
    paint_shoes   #1A1A1C (shoes)           atlas         eyes

Six draw calls; lod0 about 6,500 triangles; a crowd-sized bake (spec 'lean').
"""
import _person
import _wardrobe

ASSET = {
    'id': 'circle_enforcer',
    'kind': 'character',
    'atlas': 1024,
    # A jacket over a shirt is one more paint role than a single top.
    'budget': {'draws': 6, 'triangles': 7500, 'bytes': 420000},
}

SPEC = {
    'figure': dict(height=1.85, sex='m', build='athletic',
                   face=dict(jaw=1.06, brow=1.0, nose_width=0.96, lips=0.94, age=0.4)),
    'skin': _wardrobe.linear('#C68B63'),
    'eyes': (0.040, 0.026, 0.014),
    'beard': 0.35,
    'seed': 113,
    'hair': dict(style='buzz', color='#1E1915'),
    'outfit': dict(top=dict(piece='suit_jacket', color='#1E1E20', secondary='#F2F0E8'),
                   bottom=dict(piece='trousers', color='#1E1E20'),
                   shoes=dict(piece='shoes', color='#1A1A1C')),
    'skin_triangles': 2600,
    'detail': 0.8,
    'lean': True,
}


def make(a):
    _person.build(a, SPEC)
