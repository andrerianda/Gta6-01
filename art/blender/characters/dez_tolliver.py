"""Dez Tolliver, the starting lead (game/src/catalog/storyCharacters.js): 28, 1.86 m, athletic, a
former air force pilot who drives a tow rig. Dark brown skin, a short afro with a fade and a short
boxed beard. Deep mustard nylon bomber over a dark rib knit collar, cuffs and waistband, grey
cargo trousers with thigh pockets, brown leather ankle boots.
"""
from human import garments as g

ID = 'dez_tolliver'

BODY = {
    'sex': 'male', 'height': 1.86, 'age': 28, 'build': 0.72, 'weight': 0.36, 'skin': '#6b4129',
    'shoulder_width': 1.03, 'neck': 1.02,
    'lip_tint': (0.74, 0.62, 0.66),
    'face': {
        'head_width': 0.99, 'face_length': 1.02, 'jaw_width': 1.04, 'jaw_angle': 0.7, 'chin': 0.15, 'chin_width': 1.05,
        'cheekbones': 1.1, 'cheeks': 0.9, 'brow': 0.9, 'eye_spacing': 1.0, 'eye_tilt': 2.0, 'lid': 0.45,
        'nose_length': 0.98, 'nose_width': 1.2, 'nose_bridge': 0.85, 'nose_tip': 1.12, 'nose_up': 0.05,
        'lip_upper': 1.22, 'lip_lower': 1.25, 'mouth_width': 1.04, 'ear_size': 0.98, 'ear_out': 14.0,
    },
}
HAIR = {'style': 'afro_fade', 'color': '#16120f', 'length': 1.0, 'texture': 'coily'}
BEARD = {'style': 'short', 'color': '#16120f', 'length': 1.0}
BROWS = {'thickness': 1.1, 'arch': 0.35}
EYES = {'color': '#2a170c'}

WARDROBE = [
    g.jacket('bomber', color='#bc9235', rib_color='#2b2b2e', wear=0.3),
    g.trousers('cargo', color='#3a3d40', wear=0.35),
    g.work_boots(color='#4a3424', sole='#1d1a17', height=0.14, wear=0.45),
]

# The lead is seen close over the shoulder: a 2048 atlas, about 18 k triangles at the first level.
BUDGET = {'triangles': 18000, 'hand_triangles': 1100, 'grip_triangles': 900, 'atlas': 2048,
          'base_size': 2048, 'normal_size': 1024, 'orm_size': 512, 'quality': {'base': 80, 'normal': 86, 'orm': 80},
          'bytes': 900000}
