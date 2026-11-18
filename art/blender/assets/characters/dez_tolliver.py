"""Dez Tolliver: the starting lead (catalog id dez_tolliver), 28, a tow driver and street racer.

1.86 m, athletic, dark brown skin, a short afro and a short beard; a muted olive-stone twill
bomber jacket with charcoal rib knit collar and waistband (cuffs knit in the shell colour),
dark indigo slim denim jeans and off-white sneakers (shift 12; was mustard, cargo and boots).
The colours are the defaults of the paint roles:

    paint_skin    #6B4129      paint_hair    #16120F
    paint_jacket  #77745A (the bomber's twill shell)
    paint_top     #2E2F31 (its rib knit collar and waistband)
    paint_bottom  #283044 (denim)          paint_shoes   #D6D3CA

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
    'atlas': 2048,
    # Seen large in every judged picture (over the right shoulder while aiming): his base colour
    # is baked at 2048 (yarn, seams and creases at about 1 mm a texel), the normal map at 1024.
    # (_person.build adds the hand parts to this: three draws and the grip hands' triangles.)
    'budget': {'draws': 7, 'bytes': 900000},
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
    # Muted, modern and his own (owner 13:00): an olive-stone twill bomber with a charcoal rib
    # collar and waistband, welt pockets, a chest patch pocket and a zip pull; dark indigo slim
    # jeans with a belt, yoke and seat pockets; off-white low sneakers with laces.
    'outfit': dict(top=dict(piece='bomber', color='#77745A', trim='#2E2F31'),
                   bottom=dict(piece='jeans', color='#283044'),
                   shoes=dict(piece='sneakers', color='#D6D3CA')),
    'atlas': 2048,
    # The packed occlusion-roughness map at 1024 keeps the skin's pore-scale roughness and the
    # sheen of single coils in the hair (512 blurred both into one value).
    'orm_size': 1024,
    'texels': {'paint_hair': 1.5, 'paint_skin': 1.4},
}


def make(a):
    _person.build(a, SPEC)
