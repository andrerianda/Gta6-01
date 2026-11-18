"""Gang member base, Los Remaches: a woman of the yard crew (catalog member remache_stripper,
gangsAndFactions.js), 1.68 m, athletic, her hair drawn back in a ponytail. (The crew's men use
gang_member_street, which wears the same pieces.)

The catalog's first outfit: a sleeveless charcoal tank top with a scoop neck worn over brown
cargo trousers with thigh pockets, black boots. The crowd system recolours the paint roles for
the crew's other tank colours (#F08A3C, #E9E4D8) and grey cargo (#3A3D40).

    paint_skin    #A8754F      paint_hair    #2A1D16
    paint_top     #2B2B2E (tank)            paint_bottom  #4A3B2A (cargo)
    paint_shoes   #1A1A1C (boots)           atlas         eyes

Six draw calls; lod0 about 6,000 triangles; a crowd-sized bake (spec 'lean').
"""
import _person
import _wardrobe

ASSET = {
    'id': 'remache_stripper',
    'kind': 'character',
    'atlas': 1024,
    # Bare arms and shoulders keep more skin than a sleeved crowd person.
    'budget': {'draws': 6, 'triangles': 7500, 'bytes': 420000},
}

SPEC = {
    'figure': dict(height=1.68, sex='f', build='athletic', bust=0.7,
                   face=dict(jaw=0.90, chin=0.88, nose_width=0.94, lips=1.08, age=0.3)),
    'skin': _wardrobe.linear('#A8754F'),
    'eyes': (0.050, 0.030, 0.016),
    'beard': 0.0,
    'seed': 127,
    'hair': dict(style='ponytail', color='#2A1D16'),
    'outfit': dict(top=dict(piece='tank', color='#2B2B2E'),
                   bottom=dict(piece='cargo', color='#4A3B2A'),
                   shoes=dict(piece='boots', color='#1A1A1C'),
                   # The crew's orange bandana (1.0), folded into a band over the hair (atlas).
                   bandana=dict(color='#F08A3C', style='band')),
    'skin_triangles': 2700,
    'detail': 0.8,
    'lean': True,
}


def make(a):
    _person.build(a, SPEC)
