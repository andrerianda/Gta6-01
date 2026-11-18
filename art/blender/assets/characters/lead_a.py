"""Lead A: the first playable lead, a man of about thirty, 1.82 m, athletic build.

Built by the people generator (_person.build): a sculpted skin fused from anatomical forms,
decimated to the game mesh, skinned to the shared skeleton in an A-pose (arms 40 degrees below
horizontal, palms down). He stands on Z = 0 and faces +Y. This first version is the body alone
(head, hands, feet); his street clothes, shoes and hair are the next pieces of the generator.

Size: the brief asks for about 280 kB per person; this first build is 564 kB, inside the
character default but twice the brief. Nearly all of it is geometry: a skinned vertex costs
about 46 bytes and the projected UV islands split 4,100 vertices into 6,200 (the lower levels
fare worse). Unwrapping along a few marked seams is the next saving.
"""
import _person

ASSET = {
    'id': 'lead_a',
    'kind': 'character',
    'atlas': 1024,
}

SPEC = {
    'figure': dict(height=1.82, sex='m', build='athletic',
                   face=dict(jaw=1.04, brow=0.9, nose_width=1.04, lips=0.95, age=0.35)),
    'skin': (0.36, 0.21, 0.14),
    'eyes': (0.085, 0.045, 0.022),
    'seed': 11,
}


def make(a):
    _person.build(a, SPEC)
