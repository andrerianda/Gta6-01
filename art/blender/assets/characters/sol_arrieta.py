"""Sol Arrieta: the second playable lead (catalog id sol_arrieta), 31, a former customs inspector.

1.68 m, athletic, warm medium skin, dark brown hair drawn back into a high ponytail. A coral
shirt worn open with its sleeves rolled to below the elbow over a fitted off-white tee tucked
into dark blue jeans; a brown leather belt with a holster low on the right hip; a steel watch on
the left wrist; off-white sneakers. The colours are the catalog's
(game/src/catalog/storyCharacters.js) and are the defaults of the paint roles:

    paint_skin    #C68B63      paint_hair    #2E2019
    paint_jacket  #E07A5F (the open shirt: the catalog's top colour)
    paint_top     #F2EDE4 (the tee: the catalog's secondary colour)
    paint_bottom  #2F4A6B      paint_shoes   #EDEAE2
    atlas         eyes, belt, holster (#5A3A26), watch (#B8BCC2)

Built by the people generator (_person.build with _outfits.dress): she stands on Z = 0, faces
+Y, in the A-pose of the shared skeleton. Her tee spans the bust as one cloth surface (the trunk
hull of both halves, full weight in front of the chest), and the open shirt hangs over it.
Not modelled: her sunglasses.

Budget: seven draw calls (six paint roles and the atlas), as Dez: the open shirt over the tee
needs both paint_jacket and paint_top. About 8,000 triangles in lod0.
"""
import _person
import _wardrobe

ASSET = {
    'id': 'sol_arrieta',
    'kind': 'character',
    'atlas': 1024,
    # A lead: the full-size bake (normal 1024) as Dez; the open shirt, tee, cuffs, belt, holster
    # and watch take her about 4 % over the default 600 kB.
    'budget': {'draws': 7, 'bytes': 640000},
}

SPEC = {
    'figure': dict(height=1.68, sex='f', build='athletic', bust=0.82,
                   face=dict(jaw=0.87, chin=0.86, nose_width=0.90, lips=1.10, eye_size=1.03,
                             eye_spacing=1.0, age=0.3)),
    'skin': _wardrobe.linear('#C68B63'),
    'eyes': (0.055, 0.032, 0.016),
    'beard': 0.0,
    'seed': 41,
    'hair': dict(style='ponytail', color='#2E2019'),
    'outfit': dict(top=dict(piece='open_shirt_over_tee', color='#E07A5F', secondary='#F2EDE4',
                            watch='#B8BCC2'),
                   bottom=dict(piece='jeans', color='#2F4A6B'),
                   shoes=dict(piece='sneakers', color='#EDEAE2'),
                   holster='#5A3A26'),
    'skin_triangles': 3300,
}


def make(a):
    _person.build(a, SPEC)
