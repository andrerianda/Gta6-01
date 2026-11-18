"""Gang member base, Marsh Jackals: a middle-aged club rider (catalog member jackal_rider,
gangsAndFactions.js), 1.82 m, average build (the catalog's heavy build ballooned the open vest
over the belly), a shaved head and a full beard.

The catalog's first outfit: an open black leather club vest over a grey tee, blue jeans on the
boots, brown riding boots. The crowd system recolours the paint roles for the club's other
colours (tees #E9E4D8 and #3D4A2E, black jeans #26262B, black boots #1A1A1C).

    paint_skin    #B07A55      paint_jacket  #26262B (leather vest)
    paint_top     #5C6166 (tee)             paint_bottom  #2F4A6B (jeans)
    paint_shoes   #3A2A1E (boots)           atlas         eyes

Six draw calls; lod0 about 6,000 triangles; a crowd-sized bake (spec 'lean').
"""
import _person
import _wardrobe

ASSET = {
    'id': 'jackal_rider',
    'kind': 'character',
    'atlas': 1024,
    # The vest over a tee is one more paint role than a tank-top crew member.
    'budget': {'draws': 6, 'triangles': 7500, 'bytes': 420000},
}

SPEC = {
    'figure': dict(height=1.82, sex='m', build='average',
                   face=dict(jaw=1.08, brow=1.10, nose_width=1.05, lips=0.96, age=0.75)),
    'skin': _wardrobe.linear('#B07A55'),
    'eyes': (0.070, 0.055, 0.035),
    'beard': 1.0,
    'seed': 97,
    'hair': dict(style='buzz', color='#3A2E26'),
    # Worn leather: a little glossier than cloth.
    'outfit': dict(top=dict(piece='vest', color='#26262B', secondary='#5C6166', roughness=0.62),
                   bottom=dict(piece='jeans', color='#2F4A6B'),
                   shoes=dict(piece='boots', color='#3A2A1E')),
    'skin_triangles': 2600,
    'detail': 0.8,
    'lean': True,
}


def make(a):
    _person.build(a, SPEC)
