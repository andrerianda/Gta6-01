"""A pipeline probe, not a game asset: a stub fuselage with half a wing (mirrored after the bake), a
glass patch, a lamp, a live-painted panel quad, a moving part, an anchor and a collision box. Build
it to check the library end to end after changing art/blender/lib/ (its .glb is not registered
and is not shipped: delete game/assets/aircraft/pipeline_probe.glb afterwards).
"""
from lib import meshkit as mk
from lib import surfaces as sf

ASSET = {'id': 'pipeline_probe', 'atlas': 512}


def make(a):
    skin = sf.paint('#d8d4c8', panels=(1.2, 0.6), projection='side')
    body = mk.fuselage('body', [
        {'y': -3.0, 'w': 0.15, 'h': 0.2, 'z': 1.3}, {'y': -1.0, 'w': 0.9, 'h': 1.0, 'z': 1.2},
        {'y': 0.8, 'w': 1.1, 'h': 1.2, 'z': 1.2}, {'y': 2.0, 'w': 0.7, 'h': 0.8, 'z': 1.1}, {'y': 2.6, 'w': 0.1, 'h': 0.1, 'z': 1.05},
    ])
    mk.assign(body, skin)
    mk.assign_faces(body, sf.glass(), lambda c, n: c.y > 0.6 and c.y < 1.6 and n.z > 0.3)
    half = mk.wing('wing_half', [
        {'x': 0.0, 'y': 0.6, 'z': 1.75, 'chord': 1.4}, {'x': 4.0, 'y': 0.4, 'z': 1.85, 'chord': 0.9, 'twist': -2},
    ])
    mk.assign(half, sf.coated('wing_skin', '#c9c5b8', panels=(0.8, 0.5)))
    tip = mk.box('tip_lamp', (0.06, 0.2, 0.06), (4.0, 0.0, 1.85))
    mk.assign(tip, sf.lamp('lamp_nav_green', '#30ff60'))
    a.add(mk.shade(body)).name = 'lod0'
    a.add(mk.shade(mk.join('wing_lod0', [half, tip])), mirror=True)
    flap = mk.box('flap_r', (1.5, 0.3, 0.04), (1.5, -0.95, 1.74))
    mk.assign(flap, sf.bare_metal('flap_metal'))
    a.add(mk.set_origin(flap, (1.5, -0.8, 1.74)))
    panel = mk.quad('instrument_panel', [(-0.4, 1.7, 1.1), (0.4, 1.7, 1.1), (0.4, 1.7, 1.5), (-0.4, 1.7, 1.5)])
    mk.assign(panel, sf.screen())
    a.add(panel)
    a.anchor('seat_driver', (0, 1.0, 1.0))
    a.collider_box('body', (1.1, 5.6, 1.2), (0, -0.2, 1.2))
    a.extra('panel_size', [0.8, 0.4])
