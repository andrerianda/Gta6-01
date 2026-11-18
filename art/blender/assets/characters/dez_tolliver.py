"""Dez Tolliver: the starting lead (catalog id dez_tolliver), 28, a tow driver and street racer.

1.86 m, athletic, dark brown skin, a short afro and a short beard; a mustard bomber jacket with
dark rib knit collar, cuffs and waistband, grey cargo trousers and brown boots. The colours are
the catalog's (game/src/catalog/storyCharacters.js) and are the defaults of the paint roles:

    paint_skin    #6B4129      paint_hair    #16120F
    paint_jacket  #E0A526 (the bomber's shell: the catalog's top colour)
    paint_top     #2B2B2E (its rib knit: the catalog's secondary colour)
    paint_bottom  #3A3D40      paint_shoes   #4A3424

Built by the people generator (_person.build with _wardrobe.dress): he stands on Z = 0, faces
+Y, in the A-pose of the shared skeleton. The bomber hangs from his shoulders (draped over the
convex hull of the trunk and the sleeves), every game piece carries the smooth custom normals of
its dense sculpt, and his short afro is a fade: full on the crown, close at the sides, growing
out of a darkened scalp at the hairline. Not modelled yet: his cap and his chain.

Budget: seven draw calls (six paint roles and the atlas with the eyes), one more than the brief's
six because the bomber needs both paint_jacket and paint_top. About 8,400 triangles in lod0
(the character default of 9,000).
"""
import _person
import _wardrobe

ASSET = {
    'id': 'dez_tolliver',
    'kind': 'character',
    'atlas': 1024,
    'budget': {'draws': 7},
}

SPEC = {
    'figure': dict(height=1.86, sex='m', build='athletic',
                   face=dict(jaw=1.05, brow=0.9, nose_width=1.0, lips=1.02, eye_size=1.0,
                             eye_spacing=1.0, age=0.25)),
    'skin': _wardrobe.linear('#6B4129'),
    'eyes': (0.060, 0.030, 0.015),
    'beard': 0.8,
    'seed': 11,
    'hair': dict(style='afro_short', color='#16120F'),
    'outfit': dict(top=dict(piece='bomber', color='#E0A526', trim='#2B2B2E'),
                   bottom=dict(piece='cargo', color='#3A3D40'),
                   shoes=dict(piece='boots', color='#4A3424')),
}


def make(a):
    _person.build(a, SPEC)
