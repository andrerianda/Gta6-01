"""Newspaper box A: a coin-operated newspaper vending box, sun-faded and knocked about.

A yellow enamelled steel cabinet on a tapered pedestal bolted to the pavement. The front door
has a glazed window (the "glass" material, drawn alpha-blended by the game) with today's paper
on show behind it, a chrome pull bar and, above it, the coin mechanism and the paper's name
plate. Both sides carry a cream advertising panel. All the wear (chipped edges, rust blooms
and streaks, grime in the creases, dust on top) is baked from the procedural materials.

It also shows how to write a material of one's own with the Graph helpers: newsprint(), a
front page with a masthead, a headline, a photograph and columns of text, drawn from object
coordinates.

Blender axes: Z up, the door faces +Y.
"""
import math

from lib import build, modify, profiles, scene, shading
from lib import materials as M

ASSET = {
    'id': 'newspaper_box_a',
    'kind': 'prop',
    'atlas': 1024,
}

BODY_BOTTOM, BODY_TOP = 0.52, 1.14
FRONT = 0.21                       # y of the cabinet's front face
PAGE = (-0.155, 0.155, 0.63, 0.97)  # the displayed page: x from, x to, z from, z to


def newsprint(seed=0, name='newsprint'):
    """A newspaper front page for the rectangle PAGE of the XZ plane (object coordinates)."""
    graph = M.Graph(name, seed)
    x0, x1, z0, z1 = PAGE
    across = graph.remap(graph.axis('X'), x1, x0)        # 0 at the reader's left
    up = graph.remap(graph.axis('Z'), z0, z1)            # 0 at the foot of the page

    def between(value, low, high, soft=0.004):
        return graph.mul(graph.mask(value, low, soft), graph.invert(graph.mask(value, high, soft)))

    paper = graph.vary((0.74, 0.71, 0.63), amount=0.06, scale=9.0)
    ink = (0.035, 0.035, 0.04)
    inside = between(across, 0.05, 0.95)

    # Masthead: tall letter strokes in a band near the top, with a rule under it.
    strokes = graph.wave(period=0.011, direction='X', distortion=1.2, detail=1.0, detail_scale=3.0)
    letters = graph.noise(scale=55.0, detail=0.0, stretch=(1.0, 1.0, 0.02))
    masthead = graph.mul(graph.mul(between(up, 0.865, 0.955), between(across, 0.12, 0.88)),
                         graph.mul(graph.mask(strokes, 0.42, 0.08), graph.mask(letters, 0.38, 0.05)))
    rule = graph.mul(between(up, 0.832, 0.842, 0.002), inside)

    # Headline: heavy word-shaped blocks across the page.
    words = graph.noise(scale=24.0, detail=1.0, stretch=(1.0, 1.0, 0.02))
    headline = graph.mul(graph.mul(between(up, 0.715, 0.795), inside), graph.mask(words, 0.40, 0.03))

    # Photograph: a grainy grey picture on the left under the headline.
    photo_area = graph.mul(between(up, 0.34, 0.68), between(across, 0.05, 0.56))
    picture = graph.remap(graph.noise(scale=11.0, detail=5.0, roughness=0.7, distortion=1.5), 0.25, 0.75)
    photo = graph.ramp(picture, [(0.0, (0.03, 0.03, 0.03)), (0.5, (0.22, 0.21, 0.20)),
                                 (1.0, (0.62, 0.60, 0.55))])

    # Body text: lines of words in four columns, kept out of the photograph.
    lines = graph.wave(period=0.0085, direction='Z')
    gaps = graph.noise(scale=75.0, detail=1.0, stretch=(1.0, 1.0, 2.0))
    gutters = graph.wave(period=0.0775, direction='X')
    text_area = graph.mul(graph.mul(between(up, 0.04, 0.68), inside), graph.invert(photo_area))
    text = graph.mul(graph.mul(text_area, graph.mask(lines, 0.55, 0.12)),
                     graph.mul(graph.mask(gaps, 0.40, 0.04), graph.mask(gutters, 0.10, 0.03)))

    color = graph.mix(photo_area, paper, photo)
    printed = graph.maximum(graph.maximum(masthead, rule), graph.maximum(headline, graph.mul(text, 0.8)))
    color = graph.mix(printed, color, ink)
    yellowing = graph.noise(scale=6.0, detail=3.0)
    color = graph.mix(graph.remap(yellowing, 0.5, 0.9, 0.0, 0.35), color, (0.55, 0.45, 0.28),
                      blend='MULTIPLY')
    return graph.surface(base_color=color, roughness=0.82, metallic=0.0)


def model_pedestal(dark, zinc):
    """The base plate, its four bolts and the tapered post."""
    plate = build.sweep('plate', profiles.rounded_rectangle(0.46, 0.40, 0.03, 2),
                        [(0.0, 0.0, 0.0), (0.0, 0.0, 0.012)], up=(0.0, 1.0, 0.0))
    post = build.sweep('post', profiles.rounded_rectangle(0.20, 0.17, 0.02, 2),
                       [(0.0, 0.0, 0.012), (0.0, 0.0, 0.07), (0.0, 0.0, 0.46), (0.0, 0.0, BODY_BOTTOM)],
                       up=(0.0, 1.0, 0.0), scales=[1.35, 1.0, 1.0, 1.5], caps=False)
    for part in (plate, post):
        part.data.materials.append(dark)
    nuts = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            nuts.append(build.cylinder(f'nut{sx}{sy}', radius=0.014, depth=0.012, segments=6,
                                       location=(sx * 0.185, sy * 0.155, 0.012), on_ground=True))
    nuts = scene.join(nuts)
    nuts.data.materials.append(zinc)
    return [plate, post, nuts]


def model_cabinet(enamel, cream):
    """The cabinet with its chamfered lid and the advertising panel on each side."""
    body = build.sweep('body', profiles.rounded_rectangle(0.47, 0.42, 0.035, 3),
                       [(0.0, 0.0, BODY_BOTTOM), (0.0, 0.0, BODY_TOP), (0.0, 0.0, BODY_TOP + 0.03)],
                       up=(0.0, 1.0, 0.0), scales=[1.0, 1.0, 0.88])
    body.data.materials.append(enamel)
    panels = []
    for side in (-1, 1):
        panel = build.box(f'panel{side}', (0.006, 0.30, 0.40), location=(side * 0.2365, 0.0, 0.83))
        modify.bevel(panel, width=0.002, segments=1)
        panels.append(panel)
    panels = scene.join(panels)
    panels.data.materials.append(cream)
    return [body, panels]


def model_door(enamel, chrome, glass, paper):
    """The door frame with its window, the paper behind the glass, hinges and the pull bar."""
    frame = build.box('frame', (0.41, 0.016, 0.46), location=(0.0, FRONT + 0.008, 0.80))
    opening = build.box('opening', (0.33, 0.06, 0.32), location=(0.0, FRONT + 0.008, 0.80))
    modify.boolean(frame, opening)
    modify.bevel(frame, width=0.003, segments=1)
    frame.data.materials.append(enamel)

    pane = build.card('pane', width=0.33, height=0.32, location=(0.0, FRONT + 0.012, 0.64))
    pane.data.materials.append(glass)

    page = build.card('page', width=PAGE[1] - PAGE[0], height=PAGE[3] - PAGE[2],
                      location=(0.0, -(FRONT + 0.003), PAGE[2]))
    modify.transform(page, rotation=(0.0, 0.0, math.pi))       # turn the card to face +Y
    page.data.materials.append(paper)

    bar_path = profiles.smooth_path(
        [(-0.13, FRONT + 0.014, 1.045), (-0.13, FRONT + 0.05, 1.05), (-0.10, FRONT + 0.058, 1.05),
         (0.10, FRONT + 0.058, 1.05), (0.13, FRONT + 0.05, 1.05), (0.13, FRONT + 0.014, 1.045)],
        subdivisions=2)
    bar = build.tube('bar', bar_path, radius=0.008, segments=6, up=(0.0, 0.0, 1.0))
    hinges = scene.join([build.cylinder(f'hinge{z}', radius=0.009, depth=0.05, segments=8,
                                        location=(0.212, FRONT + 0.012, z)) for z in (0.66, 0.94)])
    for part in (bar, hinges):
        part.data.materials.append(chrome)
    return [frame, pane, page, bar, hinges]


def model_head(enamel, brushed, plastic, cream):
    """The coin mechanism and the name plate above the door."""
    mech = build.box('mech', (0.15, 0.03, 0.085), location=(0.125, FRONT + 0.015, 1.085))
    modify.bevel(mech, width=0.004, segments=1)
    mech.data.materials.append(brushed)
    slot = build.box('slot', (0.034, 0.004, 0.006), location=(0.14, FRONT + 0.031, 1.105))
    cup = build.box('cup', (0.05, 0.012, 0.03), location=(0.09, FRONT + 0.034, 1.066))
    knob = build.cylinder('knob', radius=0.011, depth=0.014, segments=10, location=(0.165, 0.0, 0.0))
    modify.transform(knob, rotation=(math.pi / 2, 0.0, 0.0), location=(0.0, FRONT + 0.036, 1.068))
    dark = scene.join([slot, cup, knob])
    dark.data.materials.append(plastic)

    name_plate = build.box('name', (0.20, 0.006, 0.07), location=(-0.09, FRONT + 0.003, 1.085))
    modify.bevel(name_plate, width=0.002, segments=1)
    name_plate.data.materials.append(cream)
    stripe = build.box('stripe', (0.19, 0.004, 0.018), location=(-0.09, FRONT + 0.006, 1.066))
    stripe.data.materials.append(enamel)
    return [mech, dark, name_plate, stripe]


def make(a):
    yellow = M.hex_color('#d9941a')
    enamel = M.painted_metal(color=yellow, gloss=0.5, chips=0.5, rust=0.45, grime=0.55, dust=0.4,
                             fade=0.5, seed=21, name='box_enamel')
    dark = M.painted_metal(color=(0.02, 0.022, 0.025), gloss=0.35, chips=0.55, rust=0.5,
                           grime=0.5, dust=0.3, fade=0.2, splash=0.7, seed=22, name='post_enamel')
    cream = M.enamel_sign(color=M.hex_color('#e6dcc3'), chips=0.12, rust=0.3, seed=23,
                          name='panel_enamel')
    chrome = M.chrome(smudges=0.6, seed=24, name='bar_chrome')
    brushed = M.brushed_metal(direction='X', grime=0.5, seed=25, name='mech_steel')
    plastic = M.plastic(color=(0.015, 0.015, 0.016), seed=26, name='slot_plastic')
    zinc = M.galvanized(rust=0.5, seed=27, name='bolt_zinc')
    glass = M.glass(tint=(0.70, 0.78, 0.78), opacity=0.28, name='glass')
    paper = newsprint(seed=28)

    parts = (model_pedestal(dark, zinc) + model_cabinet(enamel, cream)
             + model_door(enamel, chrome, glass, paper) + model_head(enamel, brushed, plastic, cream))
    box = scene.join(parts, 'lod0')
    shading.smooth(box, angle=math.radians(35))
    a.add(box)

    a.add_anchor('anchor_use', (0.0, 0.75, 0.0), forward=(0.0, -1.0, 0.0))
    a.collider_box('body', (0.0, 0.0, 0.59), (0.48, 0.46, 1.18))
    a.auto_lods(ratios=(0.4,), distances=(20.0,))
    a.bake(size=1024, orm_size=512, bevel_radius=0.004, occlusion_distance=0.4,
           material_texels={'newsprint': 2.5})
