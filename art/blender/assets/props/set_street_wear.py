"""Street wear set: the stains, marks, cracks, covers, litter, graffiti, posters and damp that make
a MARAZUL street look lived in, as decals the city dressing can scatter by the hundred.

Every decal is one flat quad (two triangles; a few long ones have a couple more) carrying one
shared material, cutout_decal, whose baked alpha is soft where the mark is soft (stains, damp,
tyre rubber, overspray) and crisp where it is crisp (covers, posters, litter). The game can draw
it alpha-tested (the loader's default for cutout materials) or, better, blended: see the registry
note. The three weed objects are crossed cards with the plain cutout material (alpha-tested
blades). So the whole set is two game materials on one atlas: merged per sector by the dressing
it costs one draw for every decal and one for every weed in view.

Ground decals lie 4 mm above the ground (z = 0) facing up, centred on their origin. Wall decals
stand 4 mm in front of a wall on the plane y = 0 behind them, facing out (+Y here, -Z in the
game), at their usual height above the wall foot (the origin). Every pattern is original and is
drawn by shader maths in object coordinates; the graffiti is MARAZUL's own invented handstyle
and bubble lettering made of strokes and blobs, and spells nothing; posters and flyers carry
blank bars where print would be.

    ground   oil_stain_large, oil_stain_small, wet_patch, tyre_marks, asphalt_patch, crack_line,
             crack_web, manhole_round, utility_cover, storm_drain, gum_spots, cigarette_butts,
             litter_scatter
    wall     graffiti_throwup_a, graffiti_throwup_b, graffiti_tag_a, graffiti_tag_b,
             graffiti_tag_c, poster_wall, flyers_torn, rust_streak, damp_base, drip_stain
    weeds    weeds_small, weeds_large, weeds_kerb (crossed or paired cards, 6 to 4 triangles)

The budget is raised for draws only because each object is its own node (26 draw calls when all
are drawn side by side; 2 when the dressing merges them), and for bytes because the 2048 atlas
is nearly all colour and alpha detail.
"""
import math
import random

from lib import materials as M

import _finishes as F
import _shapes as S
from _setkit import SetKit

ASSET = {
    'id': 'set_street_wear',
    'kind': 'prop',
    'atlas': 2048,
    'budget': {'triangles': 600, 'draws': 30, 'bytes': 900000},
}

LIFT = 0.004
DECAL = 'cutout_decal'
WEED = 'cutout'


# -- shape maths on a material graph (distances in metres) -----------------------------------

def local(g, u, v, cx, cy, angle=0.0):
    """Coordinates relative to a centre, turned by `angle`."""
    du, dv = g.sub(u, cx), g.sub(v, cy)
    if angle:
        c, s = math.cos(angle), math.sin(angle)
        du, dv = g.add(g.mul(du, c), g.mul(dv, s)), g.sub(g.mul(dv, c), g.mul(du, s))
    return du, dv


def blob(g, u, v, cx, cy, rx, ry, angle=0.0, power=2.0):
    """A superellipse: about the distance in metres to its rim, negative inside."""
    du, dv = local(g, u, v, cx, cy, angle)
    a = g.power(g.math('ABSOLUTE', g.mul(du, 1.0 / rx)), power)
    b = g.power(g.math('ABSOLUTE', g.mul(dv, 1.0 / ry)), power)
    return g.mul(g.sub(g.power(g.add(a, b), 1.0 / power), 1.0), math.sqrt(rx * ry))


def segment(g, u, v, a, b):
    """Distance in metres to the segment from a to b."""
    vx, vy = b[0] - a[0], b[1] - a[1]
    length2 = max(vx * vx + vy * vy, 1e-8)
    px, py = g.sub(u, a[0]), g.sub(v, a[1])
    h = g.math('MULTIPLY', g.add(g.mul(px, vx), g.mul(py, vy)), 1.0 / length2, clamp=True)
    return g.vector_math('LENGTH', g.combine(g.sub(px, g.mul(h, vx)), g.sub(py, g.mul(h, vy)), 0.0))


def union(g, fields, smooth=0.0):
    result = fields[0]
    for field in fields[1:]:
        result = g.math('SMOOTH_MIN', result, field, smooth) if smooth else g.minimum(result, field)
    return result


def inside(g, field, soft=0.003):
    """1 inside a distance field, 0 outside, with a soft rim."""
    return g.remap(g.mul(field, -1.0), -soft, soft, smooth=True)


def rect(g, u, v, x0, x1, y0, y1, soft=0.002):
    return g.mul(F.between(g, u, x0, x1, soft), F.between(g, v, y0, y1, soft))


def radius(g, u, v):
    return g.vector_math('LENGTH', g.combine(u, v, 0.0))


def wobble(g, amount, scale, detail=5.0):
    """A noise of mean 0 and the given amplitude, for ragged rims."""
    return g.mul(g.sub(g.noise(scale=scale, detail=detail), 0.5), amount)


def cells(g, u, v, scale):
    """Scattered items: offsets in metres from the nearest of random points `1/scale` apart,
    and three random values of that point."""
    node = g.node('ShaderNodeTexVoronoi', voronoi_dimensions='2D', feature='F1')
    vector = g.combine(g.mul(u, scale), g.mul(v, scale), 0.0)
    g.links.new(vector, node.inputs['Vector'])
    node.inputs['Scale'].default_value = 1.0
    node.inputs['Randomness'].default_value = 0.85
    position, color = node.outputs['Position'], node.outputs['Color']
    du = g.mul(g.sub(g.axis('X', vector), g.axis('X', position)), 1.0 / scale)
    dv = g.mul(g.sub(g.axis('Y', vector), g.axis('Y', position)), 1.0 / scale)
    return du, dv, [g.axis(name, color) for name in 'XYZ']


def turned(g, du, dv, angle):
    """Offsets turned by an angle given as a socket."""
    c, s = g.math('COSINE', angle), g.math('SINE', angle)
    return g.add(g.mul(du, c), g.mul(dv, s)), g.sub(g.mul(dv, c), g.mul(du, s))


def shown(g, value, share, density=1.0):
    """1 for the items whose random value falls in the top `share` (times a density socket)."""
    keep = g.mul(density, share) if not isinstance(density, (int, float)) else share * density
    return g.mask(g.sub(value, g.sub(1.0, keep)), 0.0, 0.002)


def falloff(g, u, v, inner, outer):
    """1 near the centre of the quad, 0 beyond `outer` metres, ragged."""
    r = g.add(radius(g, u, v), wobble(g, (outer - inner) * 0.6, 3.0 / outer))
    return g.remap(r, inner, outer, 1.0, 0.0)


def ground(g):
    return g.axis('X'), g.axis('Y')


def wall(g, z0=0.0):
    """Wall coordinates as a viewer in front of the wall reads them: u to the right, v up from
    the quad's lower edge at height z0."""
    return g.mul(g.axis('X'), -1.0), g.sub(g.axis('Z'), z0)


def layer(g, color, mask, over):
    return g.mix(mask, color, g.rgb(over) if isinstance(over, tuple) else over)


def finish(g, color, alpha, roughness=0.6, metallic=0.0, height=None, depth=0.002, strength=0.8):
    normal = g.bump(height, strength=strength, distance=depth) if height is not None else None
    g.surface(base_color=color, roughness=roughness, metallic=metallic, normal=normal, alpha=alpha)
    return g.material


# -- ground decals ---------------------------------------------------------------------------

def stain(seed, rx, ry, drops, dark, pale, gloss, opacity, tide=0.0, tide_color=None):
    """A spill soaked into the ground: a ragged pool with satellites, darker and glossier at the
    heart, an optional dried tide line at the rim."""
    g = M.Graph(DECAL, seed)
    u, v = ground(g)
    rnd = random.Random(seed)
    small = min(rx, ry)
    shapes = [blob(g, u, v, 0.0, 0.0, rx * 0.8, ry * 0.8, angle=rnd.uniform(-0.4, 0.4), power=1.8)]
    for _ in range(drops):
        angle, reach = rnd.uniform(0.0, math.tau), rnd.uniform(0.55, 0.95)
        size = rnd.uniform(0.12, 0.32) * small
        shapes.append(blob(g, u, v, math.cos(angle) * rx * reach, math.sin(angle) * ry * reach,
                           size, size * rnd.uniform(0.55, 1.0), angle=rnd.uniform(0, 3)))
    field = g.add(union(g, shapes, smooth=0.12 * small), wobble(g, 0.3 * small, 3.5 / small))
    depth = g.mul(field, -1.0 / small)
    body = inside(g, field, 0.012 * small / 0.5)
    heart = g.remap(depth, 0.05, 0.55, smooth=True)
    mottle = g.remap(g.noise(scale=22.0, detail=4.0), 0.25, 0.75, 0.65, 1.0)
    alpha = g.mul(g.mul(body, g.add(opacity[0], g.mul(heart, opacity[1] - opacity[0]))), mottle)
    color = g.mix(heart, pale, dark)
    rough = g.mix_value(heart, gloss[0], gloss[1])
    if tide:
        ring = g.mul(g.remap(depth, 0.0, 0.05), g.remap(depth, 0.09, 0.05))
        color = layer(g, color, ring, tide_color)
        alpha = g.maximum(alpha, g.mul(ring, tide))
        rough = g.mix_value(ring, rough, 0.8)
    return finish(g, color, alpha, roughness=rough)


def tyre_marks_material(seed):
    """Two skid marks a car's track apart, curving, fading in where the brakes bit."""
    g = M.Graph(DECAL, seed)
    u, v = ground(g)
    bend = g.mul(g.power(g.mul(g.add(u, 2.0), 0.25), 2.0), 0.12)
    streaks = g.remap(g.noise(scale=18.0, detail=3.0, stretch=(0.06, 1.0, 1.0)), 0.3, 0.7, 0.45, 1.0)
    ramp = g.mul(g.remap(u, -1.95, -1.1, smooth=True), g.remap(u, 1.95, 1.4, smooth=True))
    marks = None
    for side in (-0.77, 0.77):
        offset = g.math('ABSOLUTE', g.sub(g.sub(v, bend), side - 0.06))
        band = g.remap(offset, 0.105, 0.085, smooth=True)
        marks = band if marks is None else g.maximum(marks, band)
    alpha = g.mul(g.mul(marks, streaks), g.mul(ramp, 0.72))
    return finish(g, g.rgb((0.012, 0.012, 0.013)), alpha, roughness=0.45)


def asphalt_patch_material(seed):
    """A cut-out-and-filled patch of newer, darker asphalt with tar-sealed seams."""
    g = M.Graph(DECAL, seed)
    u, v = ground(g)
    field = g.add(blob(g, u, v, 0.0, 0.0, 0.86, 0.5, angle=0.05, power=7.0),
                  wobble(g, 0.05, 6.0))
    body = inside(g, field, 0.004)
    seam = g.mul(inside(g, g.sub(g.math('ABSOLUTE', g.add(field, 0.02)), 0.028), 0.006),
                 g.remap(g.noise(scale=9.0), 0.3, 0.55))
    stones = g.voronoi(scale=160.0, feature='F1')
    speckle = g.remap(stones, 0.22, 0.12, smooth=True)
    base = g.vary((0.042, 0.042, 0.044), amount=0.12, scale=4.0)
    color = layer(g, base, g.mul(speckle, 0.6), (0.085, 0.083, 0.08))
    color = layer(g, color, seam, (0.012, 0.012, 0.013))
    alpha = g.maximum(g.mul(body, 0.96), g.mul(seam, 0.9))
    rough = g.mix_value(seam, g.mix_value(speckle, 0.82, 0.7), 0.32)
    height = g.add(g.mul(speckle, 0.5), g.mul(seam, 0.3))
    return finish(g, color, alpha, roughness=rough, height=height, depth=0.003)


def crack_line_material(seed):
    """A long tapering crack with two branches and a fan of hairlines, dirt-darkened edges."""
    g = M.Graph(DECAL, seed)
    u, v = ground(g)
    path = g.add(g.add(g.mul(g.math('SINE', g.add(g.mul(u, 2.1), 1.0)), 0.07),
                       g.mul(g.math('SINE', g.mul(u, 5.3)), 0.03)), wobble(g, 0.05, 3.0))
    width = g.add(0.003, g.mul(g.remap(g.math('ABSOLUTE', u), 1.15, 0.0), 0.008))
    main = g.sub(g.math('ABSOLUTE', g.sub(v, path)), width)
    rnd = random.Random(seed)
    branches = []
    for _ in range(2):
        x0 = rnd.uniform(-0.7, 0.6)
        y0 = 0.07 * math.sin(2.1 * x0 + 1.0) + 0.03 * math.sin(5.3 * x0)
        end = (x0 + rnd.uniform(0.25, 0.45), y0 + rnd.choice((-1, 1)) * rnd.uniform(0.06, 0.1))
        mid = ((x0 + end[0]) / 2 + 0.03, (y0 + end[1]) / 2 + 0.03)
        branches.append(g.sub(g.minimum(segment(g, u, v, (x0, y0), mid),
                                        segment(g, u, v, mid, end)), 0.0025))
    crack = union(g, [main] + branches)
    near = g.remap(g.math('ABSOLUTE', g.sub(v, path)), 0.1, 0.0)
    hair = g.mul(g.remap(g.voronoi(scale=7.0, feature='DISTANCE_TO_EDGE'), 0.02, 0.008), near)
    halo = g.mul(inside(g, g.sub(crack, 0.02), 0.015), 0.35)
    line = g.maximum(inside(g, crack, 0.0015), g.mul(hair, 0.8))
    alpha = g.mul(g.maximum(line, halo), g.remap(g.math('ABSOLUTE', u), 1.2, 1.05))
    color = g.mix(line, (0.035, 0.034, 0.032), (0.008, 0.008, 0.008))
    return finish(g, color, alpha, roughness=0.9, height=g.mul(line, -1.0), depth=0.006)


def crack_web_material(seed):
    """Alligator cracking: a patch of asphalt broken into small plates, some sunk and darker."""
    g = M.Graph(DECAL, seed)
    u, v = ground(g)
    area = inside(g, g.add(blob(g, u, v, 0.0, 0.0, 0.62, 0.5, power=2.2), wobble(g, 0.18, 2.5)), 0.08)
    warp = g.combine(g.add(u, wobble(g, 0.05, 6.0)), g.add(v, wobble(g, 0.05, 6.0)), 0.0)
    node = g.node('ShaderNodeTexVoronoi', voronoi_dimensions='2D', feature='DISTANCE_TO_EDGE')
    g.links.new(warp, node.inputs['Vector'])
    node.inputs['Scale'].default_value = 5.5
    crack = g.remap(node.outputs['Distance'], 0.03, 0.012, smooth=True)
    plates = g.voronoi(scale=5.5, feature='F1', output='Color', vector=warp)
    sunk = g.mul(g.mask(g.axis('X', plates), 0.75, 0.01), 0.3)
    alpha = g.mul(area, g.maximum(g.mul(crack, 0.9), g.add(sunk, 0.08)))
    color = g.mix(crack, (0.03, 0.03, 0.03), (0.008, 0.008, 0.008))
    return finish(g, color, alpha, roughness=0.88, height=g.mul(crack, -1.0), depth=0.005)


def manhole_material(seed):
    """A round cast-iron cover in its frame: concentric and radial ribs worn bright, grimy
    recesses, two pick holes and a blank central boss."""
    g = M.Graph(DECAL, seed)
    u, v = ground(g)
    r = radius(g, u, v)
    angle = g.math('ARCTAN2', v, u)
    disc = inside(g, g.sub(r, 0.36), 0.002)
    frame = F.between(g, r, 0.334, 0.36, 0.002)
    gap = F.between(g, r, 0.322, 0.334, 0.002)
    rings = F.bands(g, r, 0.045, share=0.35, soft=0.05)
    spokes = F.bands(g, g.mul(angle, 16.0 / math.tau), 1.0, share=0.22, soft=0.06)
    boss = inside(g, g.sub(r, 0.085), 0.003)
    holes = g.maximum(rect(g, u, v, 0.215, 0.265, -0.007, 0.007), rect(g, u, v, -0.265, -0.215, -0.007, 0.007))
    raised = g.maximum(g.maximum(rings, spokes), g.maximum(boss, frame))
    raised = g.mul(raised, g.invert(g.maximum(gap, holes)))
    worn = g.remap(g.noise(scale=7.0, detail=4.0), 0.3, 0.7, 0.75, 1.15)
    bright = g.hsv((0.15, 0.142, 0.132), value=worn)
    rusty = g.mix(g.mask(g.noise(scale=11.0), 0.62, 0.08), (0.05, 0.045, 0.04), (0.11, 0.055, 0.025))
    color = g.mix(raised, rusty, bright)
    color = layer(g, color, g.maximum(gap, holes), (0.006, 0.006, 0.006))
    rough = g.mix_value(raised, 0.85, 0.38)
    metal = g.mix_value(raised, 0.35, 0.9)
    return finish(g, color, disc, roughness=rough, metallic=metal, height=raised, depth=0.006,
                  strength=1.0)


def utility_cover_material(seed):
    """A square steel access cover with raised tread dots, a frame, keyholes and a blank plate."""
    g = M.Graph(DECAL, seed)
    u, v = ground(g)
    body = rect(g, u, v, -0.31, 0.31, -0.31, 0.31, 0.002)
    lid = rect(g, u, v, -0.285, 0.285, -0.285, 0.285, 0.002)
    frame = g.sub(body, rect(g, u, v, -0.297, 0.297, -0.297, 0.297, 0.002))
    k = math.tau / 0.034
    dots = g.mask(g.mul(g.math('COSINE', g.mul(g.add(u, v), k)), g.math('COSINE', g.mul(g.sub(u, v), k))), 0.55, 0.1)
    plate = rect(g, u, v, -0.09, 0.09, -0.045, 0.045, 0.002)
    keys = g.maximum(rect(g, u, v, 0.2, 0.24, 0.2, 0.212), rect(g, u, v, -0.24, -0.2, -0.212, -0.2))
    raised = g.maximum(g.mul(g.mul(dots, lid), g.invert(plate)), g.maximum(plate, frame))
    worn = g.remap(g.noise(scale=6.0, detail=4.0), 0.3, 0.7, 0.8, 1.2)
    color = g.mix(raised, (0.06, 0.055, 0.05), g.hsv((0.17, 0.165, 0.155), value=worn))
    color = layer(g, color, g.mul(g.mask(g.noise(scale=9.0), 0.6, 0.1), 0.7), (0.12, 0.06, 0.03))
    color = layer(g, color, g.maximum(keys, g.sub(body, g.maximum(lid, frame))), (0.006, 0.006, 0.006))
    return finish(g, color, body, roughness=g.mix_value(raised, 0.8, 0.4), metallic=0.8,
                  height=raised, depth=0.004)


def storm_drain_material(seed):
    """A gutter grate along the kerb: a cast frame, bars across the flow, black slots with a
    few leaves and a paper scrap caught in them."""
    g = M.Graph(DECAL, seed)
    u, v = ground(g)
    body = rect(g, u, v, -0.47, 0.47, -0.23, 0.23, 0.002)
    inner = rect(g, u, v, -0.43, 0.43, -0.19, 0.19, 0.002)
    slots = g.mul(g.mul(inner, g.invert(F.bands(g, u, 0.046, share=0.45, soft=0.04))),
                  g.invert(rect(g, u, v, -0.5, 0.5, -0.012, 0.012)))
    leaves = g.mul(g.mask(g.noise(scale=14.0, detail=3.0), 0.66, 0.03), slots)
    worn = g.remap(g.noise(scale=6.0, detail=4.0), 0.3, 0.7, 0.8, 1.2)
    color = g.hsv((0.12, 0.112, 0.105), value=worn)
    color = layer(g, color, g.mul(g.mask(g.noise(scale=8.0), 0.55, 0.1), 0.8), (0.1, 0.05, 0.025))
    color = layer(g, color, slots, (0.005, 0.005, 0.005))
    color = layer(g, color, leaves, g.mix(g.noise(scale=30.0), (0.16, 0.09, 0.03), (0.3, 0.22, 0.1)))
    raised = g.sub(body, slots)
    return finish(g, color, body, roughness=g.mix_value(slots, 0.5, 0.95), metallic=g.mix_value(slots, 0.85, 0.0),
                  height=raised, depth=0.008, strength=1.0)


def gum_material(seed):
    """Trodden chewing gum: grey-black discs scattered thick near a doorway or a stop."""
    g = M.Graph(DECAL, seed)
    u, v = ground(g)
    du, dv, (r1, r2, r3) = cells(g, u, v, 11.0)
    size = g.add(0.007, g.mul(r2, 0.011))
    spot = inside(g, g.sub(radius(g, du, dv), size), 0.0015)
    keep = shown(g, r1, 0.8, falloff(g, u, v, 0.22, 0.5))
    alpha = g.mul(spot, keep)
    color = g.mix(r3, (0.035, 0.035, 0.034), (0.2, 0.2, 0.19))
    color = g.mix(g.remap(radius(g, du, dv), 0.0, 0.015), g.hsv(color, value=1.2), color)
    return finish(g, color, g.mul(alpha, 0.95), roughness=0.6, height=spot, depth=0.0015)


def butts_material(seed):
    """Cigarette ends: tan filters, off-white paper, burnt tips, a little ash."""
    g = M.Graph(DECAL, seed)
    u, v = ground(g)
    du, dv, (r1, r2, r3) = cells(g, u, v, 9.0)
    tu, tv = turned(g, du, dv, g.mul(r2, math.pi))
    length = g.add(0.024, g.mul(r3, 0.016))
    a = g.power(g.math('ABSOLUTE', g.math('DIVIDE', tu, g.mul(length, 0.5))), 5.0)
    b = g.power(g.math('ABSOLUTE', g.mul(tv, 1.0 / 0.0042)), 5.0)
    body = g.remap(g.add(a, b), 1.15, 0.85, smooth=True)
    keep = shown(g, r1, 0.55, falloff(g, u, v, 0.1, 0.25))
    filt = g.mask(g.sub(g.mul(length, -0.12), tu), 0.0, 0.0015)
    burnt = g.mask(g.sub(tu, g.mul(length, 0.4)), 0.0, 0.002)
    ash = g.mul(g.mask(g.noise(scale=60.0), 0.6, 0.05), falloff(g, u, v, 0.05, 0.2))
    color = g.mix(filt, (0.68, 0.66, 0.6), g.mix(g.noise(scale=400.0), (0.5, 0.3, 0.1), (0.62, 0.42, 0.18)))
    color = layer(g, color, burnt, (0.06, 0.055, 0.05))
    color = layer(g, color, g.mul(ash, g.invert(body)), (0.3, 0.3, 0.29))
    alpha = g.maximum(g.mul(body, keep), g.mul(ash, 0.35))
    return finish(g, color, alpha, roughness=0.8, height=body, depth=0.003)


def litter_material(seed):
    """Paper scraps, a receipt, wrappers, foil and a dry leaf or two, crumpled flat."""
    g = M.Graph(DECAL, seed)
    u, v = ground(g)
    du, dv, (r1, r2, r3) = cells(g, u, v, 6.5)
    tu, tv = turned(g, du, dv, g.mul(r2, math.pi))
    w = g.add(0.022, g.mul(r3, 0.035))
    h = g.add(0.015, g.mul(r2, 0.025))
    a = g.power(g.math('ABSOLUTE', g.math('DIVIDE', tu, w)), 6.0)
    b = g.power(g.math('ABSOLUTE', g.math('DIVIDE', tv, h)), 6.0)
    ragged = wobble(g, 0.5, 40.0, 3.0)
    piece = g.remap(g.add(g.add(a, b), ragged), 1.1, 0.9, smooth=True)
    keep = shown(g, r1, 0.8, falloff(g, u, v, 0.3, 0.55))
    kind = g.axis('X', g.voronoi(scale=1.0, feature='F1', output='Color',
                                 vector=g.combine(g.mul(r2, 7.0), g.mul(r3, 7.0), 0.0)))
    palette = g.ramp(kind, [(0.0, (0.7, 0.68, 0.62)), (0.22, (0.78, 0.76, 0.7)),
                            (0.36, (0.42, 0.07, 0.05)), (0.5, (0.07, 0.17, 0.42)),
                            (0.62, (0.5, 0.5, 0.52)), (0.74, (0.42, 0.3, 0.16)),
                            (0.88, (0.3, 0.19, 0.07))], interpolation='CONSTANT')
    crumple = g.voronoi(scale=90.0, feature='DISTANCE_TO_EDGE')
    color = g.hsv(palette, value=g.remap(crumple, 0.0, 0.3, 0.75, 1.05))
    color = g.hsv(color, value=g.remap(g.noise(scale=12.0), 0.3, 0.7, 0.7, 1.0))
    foil = g.mul(F.between(g, kind, 0.62, 0.74, 0.001), piece)
    return finish(g, color, g.mul(piece, keep), roughness=g.mix_value(foil, 0.75, 0.3),
                  metallic=foil, height=g.mul(g.invert(crumple), piece), depth=0.003)


# -- wall decals -----------------------------------------------------------------------------

def bubble_letter(g, u, v, letter, dx=0.0, dy=0.0):
    """The field of one bubble letter (a swollen block with its counters and notches cut),
    evaluated at (u - dx, v - dy)."""
    if dx or dy:
        u, v = g.sub(u, dx), g.sub(v, dy)
    cx, cy, rx, ry, angle, kind = letter
    field = blob(g, u, v, cx, cy, rx, ry, angle=angle, power=2.8)
    cuts = []
    if kind in ('hole', 'pair'):
        top = cy + (0.3 * ry if kind == 'pair' else 0.12 * ry)
        cuts.append(blob(g, u, v, cx + 0.06 * rx, top, 0.34 * rx, 0.22 * ry, angle=angle))
    if kind == 'pair':
        cuts.append(blob(g, u, v, cx + 0.04 * rx, cy - 0.36 * ry, 0.34 * rx, 0.2 * ry, angle=angle))
    if kind == 'notch_top':
        cuts.append(blob(g, u, v, cx + 0.04 * rx, cy + 0.62 * ry, 0.15 * rx, 0.62 * ry, angle=angle, power=3.0))
    if kind == 'notch_low':
        cuts.append(blob(g, u, v, cx - 0.04 * rx, cy - 0.6 * ry, 0.15 * rx, 0.62 * ry, angle=angle, power=3.0))
    if kind == 'bite':
        cuts.append(blob(g, u, v, cx + 0.72 * rx, cy + 0.05 * ry, 0.42 * rx, 0.16 * ry, angle=angle, power=3.0))
    for cut in cuts:
        field = g.maximum(field, g.mul(cut, -1.0))
    return field


def letter_row(seed, width, height, count):
    rnd = random.Random(seed)
    kinds = ['hole', 'notch_top', 'pair', 'bite', 'notch_low', 'hole']
    rnd.shuffle(kinds)
    step = width / (count + 0.1)
    letters = []
    for index in range(count):
        cx = -width / 2 + step * (index + 0.55)
        cy = height * 0.52 + rnd.uniform(-0.05, 0.05) * height + 0.04 * height * math.sin(index * 1.7)
        letters.append((cx, cy, step * rnd.uniform(0.54, 0.6), height * rnd.uniform(0.38, 0.45),
                        rnd.uniform(-0.16, 0.16), kinds[index % len(kinds)]))
    return letters


def throwup_material(seed, z0, width, height, count, fill, fill_low, outline, block, shine,
                     metal=0.0):
    """A bubble-letter throw-up: fill with a fade, a thick outline, a 3D block down-right, a
    shine on the upper-left rims, overspray and a few drips; patchy where the wall's grain took
    little paint. The quad's lower edge is at height z0."""
    g = M.Graph(DECAL, seed)
    u, v = wall(g, z0)
    letters = letter_row(seed, width * 0.85, height * 0.8, count)
    letters = [(cx, cy + height * 0.1, rx, ry, a, kind) for cx, cy, rx, ry, a, kind in letters]
    fields = [bubble_letter(g, u, v, letter) for letter in letters]
    shifted = [bubble_letter(g, u, v, letter, dx=0.055, dy=-0.05) for letter in letters]
    main = union(g, fields)
    shadow = union(g, shifted)
    fill_mask = inside(g, main, 0.0025)
    outline_mask = inside(g, g.sub(main, 0.036), 0.003)
    block_mask = inside(g, g.sub(shadow, 0.036), 0.003)
    halo = g.mul(inside(g, g.sub(g.minimum(main, shadow), 0.1), 0.05), 0.22)
    rnd = random.Random(seed + 7)
    drips = []
    for cx, cy, rx, ry, _a, _kind in letters:
        for _ in range(rnd.choice((1, 1, 2))):
            x = cx + rnd.uniform(-0.5, 0.5) * rx
            top = cy - ry * 0.85
            drips.append(segment(g, u, v, (x, top), (x + 0.004, top - rnd.uniform(0.05, 0.22))))
    drip_mask = inside(g, g.sub(union(g, drips), 0.006), 0.002)
    shade = g.remap(v, height * 0.25, height * 0.85)
    color = g.rgb(outline)
    color = layer(g, color, block_mask, block)
    fill_color = g.mix(shade, fill_low, fill)
    for field, moved in zip(fields, shifted):
        # Each letter is outlined and filled over the one before it, so the joins read.
        color = layer(g, color, inside(g, g.sub(field, 0.036), 0.003), outline)
        color = layer(g, color, inside(g, field, 0.0025), fill_color)
        shine_mask = g.mul(g.mul(inside(g, g.add(field, 0.014), 0.002), g.mask(moved, 0.0, 0.004)),
                           inside(g, g.mul(g.add(field, 0.05), -1.0), 0.003))
        color = layer(g, color, shine_mask, shine)
    paint = g.maximum(g.maximum(block_mask, outline_mask), drip_mask)
    grain = g.remap(g.noise(scale=45.0, detail=3.0), 0.2, 0.45, 0.62, 1.0)
    alpha = g.mul(g.maximum(paint, halo), grain)
    metal_mask = g.mul(fill_mask, metal) if metal else 0.0
    return finish(g, color, alpha, roughness=g.mix_value(fill_mask, 0.7, 0.55 - 0.15 * metal),
                  metallic=metal_mask)


GLYPHS = {
    'stem': [(0.0, 0.0), (0.12, 1.0), (0.22, 0.05), (1.0, 0.14)],
    'arch': [(0.0, 0.0), (0.02, 0.72), (0.45, 0.78), (0.68, 0.3), (0.72, 0.0), (1.0, 0.12)],
    'loop': [(0.62, 0.55), (0.3, 0.68), (0.04, 0.36), (0.24, 0.0), (0.6, 0.16), (0.66, 0.62),
             (0.72, 0.05), (1.0, 0.12)],
    'zig': [(0.0, 0.62), (0.55, 0.68), (0.05, 0.0), (0.62, 0.05), (1.0, 0.16)],
    'tall': [(0.0, 0.0), (0.3, 1.3), (0.36, 0.82), (0.1, 0.42), (0.62, 0.0), (1.0, 0.14)],
    'dip': [(0.0, 0.5), (0.38, 0.0), (0.42, -0.45), (0.18, -0.36), (0.6, 0.08), (1.0, 0.12)],
    'cross': [(0.0, 0.0), (0.5, 0.95), (0.62, 0.1), (0.15, 0.55), (0.85, 0.6), (1.0, 0.1)],
}


def tag_strokes(seed, width, height):
    """An invented handstyle signature: connected glyph strokes slanted forward, an underline
    swoosh with a hook, and a three-point crown. Returns segments in (u, v) metres."""
    rnd = random.Random(seed)
    names = list(GLYPHS)
    count = rnd.randint(4, 6)
    advance = width * 0.8 / count
    slant = 0.3
    x = -width / 2 + 0.02
    base = height * 0.32
    size = height * 0.42
    points = []
    for _ in range(count):
        shape = GLYPHS[rnd.choice(names)]
        gw = advance * rnd.uniform(0.85, 1.1)
        gh = size * rnd.uniform(0.8, 1.1)
        for px, py in shape:
            vx, vy = x + px * gw, base + py * gh
            points.append((vx + slant * (vy - base), vy))
        x += gw
    segments = list(zip(points[:-1], points[1:]))
    y0 = base - 0.16 * height
    swoosh = [(-width / 2 + 0.04, y0 + 0.02), (-0.1 * width, y0 - 0.03), (0.25 * width, y0 - 0.02),
              (width / 2 - 0.06, y0 + 0.03), (width / 2 - 0.1, y0 + 0.11)]
    segments += list(zip(swoosh[:-1], swoosh[1:]))
    cx = rnd.uniform(-0.2, 0.1) * width
    top = base + size * 1.05
    crown = [(cx, top), (cx + 0.03, top + 0.07), (cx + 0.06, top + 0.02), (cx + 0.09, top + 0.08),
             (cx + 0.12, top)]
    segments += list(zip(crown[:-1], crown[1:]))
    return segments


def tag_material(seed, z0, width, height, color, stroke=0.012, metal=0.0):
    """A sprayed tag: one colour, soft overspray, a drip or two."""
    g = M.Graph(DECAL, seed)
    u, v = wall(g, z0)
    segments = tag_strokes(seed, width, height)
    field = union(g, [segment(g, u, v, a, b) for a, b in segments])
    line = inside(g, g.sub(field, stroke), 0.0025)
    spray = g.mul(inside(g, g.sub(field, stroke * 2.8), 0.01), 0.25)
    rnd = random.Random(seed + 3)
    drips = []
    for a, _b in rnd.sample(segments, 2):
        drips.append(segment(g, u, v, a, (a[0] + 0.003, a[1] - rnd.uniform(0.04, 0.12))))
    drip = inside(g, g.sub(union(g, drips), 0.004), 0.0015)
    grain = g.remap(g.noise(scale=45.0, detail=3.0), 0.2, 0.45, 0.7, 1.0)
    alpha = g.mul(g.maximum(g.maximum(line, drip), spray), grain)
    return finish(g, g.rgb(color), alpha, roughness=0.6 - 0.2 * metal, metallic=metal * 0.6)


def poster(g, u, v, x0, y0, w, h, back, ink, accent, layout):
    """One printed poster: (mask, colour). Print is blank bars; the art is a shape."""
    mask = rect(g, u, v, x0, x0 + w, y0, y0 + h, 0.0015)
    color = g.rgb(back)
    if layout == 'disc':
        art = inside(g, g.sub(radius(g, g.sub(u, x0 + w * 0.5), g.sub(v, y0 + h * 0.6)), w * 0.3), 0.002)
        color = layer(g, color, art, g.mix(g.remap(v, y0 + h * 0.35, y0 + h * 0.85), accent, ink))
    elif layout == 'band':
        slope = g.sub(g.sub(u, x0 + w * 0.15), g.mul(g.sub(v, y0 + h * 0.3), 0.7))
        art = g.mul(F.between(g, slope, 0.0, w * 0.28, 0.002), rect(g, u, v, x0, x0 + w, y0 + h * 0.28, y0 + h * 0.8))
        color = layer(g, color, art, accent)
    else:
        art = rect(g, u, v, x0 + w * 0.08, x0 + w * 0.92, y0 + h * 0.3, y0 + h * 0.78)
        color = layer(g, color, art, g.mix(g.remap(u, x0, x0 + w), accent, ink))
    head = rect(g, u, v, x0 + w * 0.08, x0 + w * 0.92, y0 + h * 0.84, y0 + h * 0.93)
    color = layer(g, color, head, ink)
    for index in range(3):
        line_y = y0 + h * (0.08 + 0.06 * index)
        color = layer(g, color, rect(g, u, v, x0 + w * 0.12, x0 + w * (0.88 - 0.15 * index),
                                     line_y, line_y + h * 0.025), ink)
    return mask, color


def poster_wall_material(seed, z0):
    """Three pasted posters over the torn remains of older ones, one corner ripped away."""
    g = M.Graph(DECAL, seed)
    u, v = wall(g, z0)
    old = g.mul(rect(g, u, v, -0.93, 0.9, 0.02, 0.97, 0.003),
                g.mask(g.add(g.noise(scale=5.0, detail=6.0), g.mul(g.remap(v, 0.2, 0.6), 0.2)), 0.5, 0.02))
    color = g.mix(g.noise(scale=4.0), (0.52, 0.48, 0.4), (0.38, 0.22, 0.16))
    alpha = g.mul(old, 0.95)
    posters = [(-0.88, 0.08, 0.58, 0.82, (0.44, 0.07, 0.04), (0.02, 0.02, 0.02), (0.62, 0.5, 0.12), 'disc'),
               (-0.29, 0.1, 0.58, 0.82, (0.03, 0.14, 0.16), (0.64, 0.6, 0.5), (0.55, 0.12, 0.08), 'band'),
               (0.3, 0.06, 0.58, 0.82, (0.6, 0.55, 0.44), (0.03, 0.03, 0.035), (0.06, 0.2, 0.4), 'block')]
    for index, (x0, y0, w, h, back, ink, accent, layout) in enumerate(posters):
        mask, paper = poster(g, u, v, x0, y0, w, h, back, ink, accent, layout)
        if index == 1:
            tear = g.add(g.sub(g.sub(u, x0 + w * 0.7), g.sub(v, y0 + h * 0.2)), wobble(g, 0.06, 18.0))
            mask = g.mul(mask, g.mask(g.mul(tear, -1.0), 0.0, 0.002))
        if index == 2:
            rip = g.add(g.sub(v, y0 + h * 0.86), wobble(g, 0.05, 14.0))
            mask = g.mul(mask, g.mask(g.mul(rip, -1.0), 0.0, 0.002))
        color = layer(g, color, mask, paper)
        alpha = g.maximum(alpha, mask)
    color = g.mix(0.22, color, (0.62, 0.6, 0.54))
    wrinkle = g.noise(scale=9.0, detail=3.0, stretch=(1.0, 1.0, 0.25))
    return finish(g, color, alpha, roughness=0.75, height=wrinkle, depth=0.0015)


def flyers_material(seed, z0):
    """Small handbills stapled up and torn down, one with a fringe of tear-off tabs."""
    g = M.Graph(DECAL, seed)
    u, v = wall(g, z0)
    sheets = [(-0.32, 0.22, 0.15, 0.21, (0.72, 0.7, 0.62)), (-0.14, 0.3, 0.15, 0.21, (0.7, 0.62, 0.3)),
              (0.04, 0.18, 0.21, 0.15, (0.6, 0.45, 0.48)), (-0.25, 0.0, 0.15, 0.21, (0.5, 0.62, 0.48)),
              (0.12, 0.38, 0.15, 0.2, (0.72, 0.7, 0.64))]
    color = g.rgb((0.6, 0.58, 0.5))
    alpha = 0.0
    rnd = random.Random(seed)
    for index, (x0, y0, w, h, paper) in enumerate(sheets):
        mask = rect(g, u, v, x0, x0 + w, y0, y0 + h, 0.0015)
        if index in (2, 4):
            cut = g.add(g.sub(v, y0 + h * rnd.uniform(0.35, 0.6)), wobble(g, 0.04, 30.0))
            mask = g.mul(mask, g.mask(cut, 0.0, 0.002))
        ink = rect(g, u, v, x0 + w * 0.1, x0 + w * 0.9, y0 + h * 0.75, y0 + h * 0.88)
        for row in range(3):
            line_y = y0 + h * (0.35 + 0.1 * row)
            ink = g.maximum(ink, rect(g, u, v, x0 + w * 0.12, x0 + w * 0.82, line_y, line_y + 0.007))
        sheet = layer(g, g.rgb(paper), ink, (0.06, 0.06, 0.07))
        if index == 0:
            tabs = F.bands(g, g.sub(u, x0), 0.021, share=0.82, soft=0.05)
            index_id = g.math('FLOOR', g.mul(g.sub(u, x0), 1.0 / 0.021))
            missing = g.mask(g.white_noise(vector=g.combine(index_id, 3.0, 0.0)), 0.55, 0.01)
            fringe = g.mul(g.mul(tabs, g.invert(missing)), rect(g, u, v, x0, x0 + w, y0 - 0.06, y0))
            mask = g.maximum(mask, fringe)
        staple = inside(g, g.sub(segment(g, u, v, (x0 + w * 0.45, y0 + h - 0.01), (x0 + w * 0.55, y0 + h - 0.01)), 0.0015), 0.0005)
        sheet = layer(g, sheet, staple, (0.4, 0.4, 0.42))
        color = layer(g, color, mask, sheet)
        alpha = g.maximum(alpha, mask) if index else mask
    color = g.mix(0.2, color, (0.6, 0.58, 0.52))
    return finish(g, color, alpha, roughness=0.78, height=g.noise(scale=25.0), depth=0.001)


def streak_material(seed, top, length, width, color_top, color_low, opacity, spread=0.0,
                    algae=False):
    """A stain running down a wall from a source at height `top` over `length` metres:
    rivulets, fading as it falls, widening by `spread` per metre."""
    g = M.Graph(DECAL, seed)
    u, v = wall(g)
    fall = g.sub(top, v)
    half = g.add(width / 2, g.mul(g.maximum(fall, 0.0), spread))
    across = g.math('DIVIDE', g.math('ABSOLUTE', g.add(u, wobble(g, width * 0.4, 4.0))), half)
    body = g.remap(across, 1.0, 0.45, smooth=True)
    rivulets = g.remap(g.noise(scale=26.0, detail=3.0, stretch=(1.0, 1.0, 0.06)), 0.3, 0.7, 0.35, 1.0)
    fade = g.mul(g.remap(fall, -0.03, 0.02), g.remap(fall, 0.0, length, 1.0, 0.0))
    alpha = g.mul(g.mul(body, rivulets), g.mul(fade, opacity))
    color = g.mix(g.remap(fall, 0.0, length * 0.8), color_top, color_low)
    if algae:
        color = layer(g, color, g.mul(g.remap(v, 0.4, 0.05), 0.6), (0.04, 0.06, 0.025))
    return finish(g, color, alpha, roughness=0.75)


def damp_material(seed):
    """Rising damp at a wall foot: a dark wet band with a ragged tide line, white salt bloom
    under it, green-black algae and splash dirt at the bottom."""
    g = M.Graph(DECAL, seed)
    u, v = wall(g)
    line = g.add(0.42, g.add(wobble(g, 0.22, 2.2, 4.0), wobble(g, 0.05, 12.0)))
    below = g.sub(line, v)
    wet = g.remap(below, -0.01, 0.12, smooth=True)
    salt = g.mul(g.mul(g.remap(below, -0.02, 0.0), g.remap(below, 0.07, 0.01)),
                 g.mask(g.noise(scale=30.0, detail=4.0), 0.45, 0.08))
    ends = g.mul(g.remap(g.math('ABSOLUTE', u), 1.2, 0.95), g.remap(v, 0.0, 0.01))
    algae = g.remap(v, 0.22, 0.0)
    color = g.mix(algae, (0.05, 0.05, 0.045), (0.035, 0.05, 0.025))
    color = layer(g, color, g.mul(g.remap(v, 0.12, 0.0), 0.7), (0.09, 0.07, 0.05))
    color = layer(g, color, salt, (0.58, 0.57, 0.53))
    alpha = g.mul(g.maximum(g.mul(wet, g.add(0.5, g.mul(algae, 0.3))), g.mul(salt, 0.75)), ends)
    alpha = g.mul(alpha, g.remap(g.noise(scale=18.0, detail=4.0), 0.25, 0.7, 0.7, 1.0))
    return finish(g, color, alpha, roughness=g.mix_value(wet, 0.8, 0.45))


# -- weeds -----------------------------------------------------------------------------------

def weed_material(seed, theta, height, half, dry=0.3):
    """Grass and weed blades on an upright card turned `theta`: tapering blades of varied height,
    bent a little, dark at the root, yellowing at some tips."""
    g = M.Graph(WEED, seed)
    x, y, z = g.axis('X'), g.axis('Y'), g.axis('Z')
    along = g.add(g.mul(x, math.cos(theta)), g.mul(y, math.sin(theta)))
    rel_height = g.mul(z, 1.0 / height)
    sway = g.mul(wobble(g, 0.14, 5.0, 2.0), g.power(rel_height, 2.0))
    bent = g.add(along, sway)
    dome = g.remap(g.math('ABSOLUTE', along), 0.0, half, 1.0, 0.3)
    blades = None
    for period, offset in ((0.021, 0.0), (0.029, 0.37)):
        tall = g.remap(g.noise(scale=30.0, detail=2.0, stretch=(1.0, 1.0, 0.02)), 0.3, 0.7, 0.3, 1.0)
        top = g.mul(g.mul(tall, dome), height)
        rel = g.math('DIVIDE', z, g.maximum(top, 0.01))
        share = g.mul(g.sub(1.0, rel, clamp=True), 0.62)
        turn = g.math('FRACT', g.add(g.mul(bent, 1.0 / period), offset))
        edge = g.math('ABSOLUTE', g.sub(g.mul(turn, 2.0), 1.0))
        blade = g.mask(g.sub(edge, g.sub(1.0, share)), 0.0, 0.05)
        blades = blade if blades is None else g.maximum(blades, blade)
    tint = g.ramp(rel_height, [(0.0, (0.02, 0.035, 0.01)), (0.45, (0.06, 0.1, 0.025)),
                               (1.0, (0.12, 0.15, 0.045))])
    straw = g.mul(g.mask(g.noise(scale=12.0, detail=2.0), 1.0 - dry * 0.5, 0.05), rel_height)
    color = layer(g, tint, straw, (0.27, 0.21, 0.09))
    g.surface(base_color=color, roughness=0.6, alpha=blades)
    return g.material


# -- objects ---------------------------------------------------------------------------------

def floor(k, name, w, d, material, segments=(1, 1), texel=1.0):
    obj = k.object(name, [S.slab(w, d, at=(0.0, 0.0, LIFT), mat=material, segments=segments)],
                   cls='fixed', lods=(), distances=(), smooth=60.0, texel_scale=texel)
    obj.root['decal'] = 'ground'
    return obj


def upright(k, name, w, h, z0, material, texel=1.0):
    obj = k.object(name, [S.card(w, h, at=(0.0, LIFT, z0), mat=material)],
                   cls='fixed', lods=(), distances=(), smooth=60.0, texel_scale=texel)
    obj.root['decal'] = 'wall'
    return obj


def tuft(k, name, width, height, angles, seed, dry):
    cards = [S.card(width, height, mat=weed_material(seed + index, theta, height, width / 2, dry),
                    rot_z=theta) for index, theta in enumerate(angles)]
    obj = k.object(name, cards, cls='fixed', lods=(), distances=(), smooth=60.0, texel_scale=1.3)
    obj.root['decal'] = 'weeds'
    return obj


def make(a):
    k = SetKit(a, gap=0.5, row_gap=1.0, row_width=11.0)
    floor(k, 'oil_stain_large', 1.4, 1.0, stain(301, 0.62, 0.42, 4, (0.01, 0.009, 0.008),
                                                 (0.04, 0.035, 0.03), (0.5, 0.16), (0.35, 0.85)))
    floor(k, 'oil_stain_small', 0.7, 0.5, stain(302, 0.28, 0.2, 3, (0.012, 0.01, 0.009),
                                                 (0.045, 0.04, 0.034), (0.55, 0.2), (0.3, 0.8)))
    floor(k, 'wet_patch', 1.6, 1.0, stain(303, 0.7, 0.42, 3, (0.022, 0.024, 0.026),
                                           (0.035, 0.037, 0.04), (0.35, 0.06), (0.25, 0.55),
                                           tide=0.4, tide_color=(0.3, 0.29, 0.27)))
    floor(k, 'gum_spots', 1.2, 1.2, gum_material(304))
    floor(k, 'cigarette_butts', 0.6, 0.6, butts_material(305), texel=2.4)
    floor(k, 'manhole_round', 0.74, 0.74, manhole_material(306), texel=1.4)
    floor(k, 'utility_cover', 0.64, 0.64, utility_cover_material(307), texel=1.3)
    floor(k, 'storm_drain', 0.96, 0.48, storm_drain_material(308), texel=1.3)
    k.row()
    floor(k, 'tyre_marks', 4.0, 2.0, tyre_marks_material(309), segments=(4, 1), texel=0.35)
    floor(k, 'asphalt_patch', 1.8, 1.1, asphalt_patch_material(310), segments=(2, 1), texel=0.6)
    floor(k, 'crack_line', 2.4, 0.5, crack_line_material(311), segments=(3, 1))
    floor(k, 'crack_web', 1.6, 1.3, crack_web_material(312), segments=(2, 1), texel=0.7)
    floor(k, 'litter_scatter', 1.6, 1.2, litter_material(313))
    k.row()
    upright(k, 'graffiti_throwup_a', 2.4, 1.1, 0.35,
            throwup_material(321, 0.35, 2.4, 1.1, 4, (0.6, 0.6, 0.62), (0.36, 0.37, 0.4),
                             (0.012, 0.012, 0.014), (0.02, 0.03, 0.09), (0.85, 0.85, 0.85), metal=0.5),
            texel=0.6)
    upright(k, 'graffiti_throwup_b', 2.0, 1.0, 0.4,
            throwup_material(322, 0.4, 2.0, 1.0, 3, (0.62, 0.17, 0.26), (0.66, 0.32, 0.05),
                             (0.015, 0.02, 0.06), (0.08, 0.32, 0.42), (0.86, 0.84, 0.8)), texel=0.6)
    upright(k, 'graffiti_tag_a', 1.0, 0.45, 1.1, tag_material(323, 1.1, 1.0, 0.45, (0.012, 0.012, 0.013)))
    upright(k, 'graffiti_tag_b', 0.8, 0.4, 1.2, tag_material(324, 1.2, 0.8, 0.4, (0.55, 0.56, 0.58), metal=0.6))
    upright(k, 'graffiti_tag_c', 1.2, 0.5, 0.9, tag_material(325, 0.9, 1.2, 0.5, (0.36, 0.03, 0.03), stroke=0.014))
    k.row()
    upright(k, 'poster_wall', 1.9, 1.0, 0.9, poster_wall_material(326, 0.9), texel=0.9)
    upright(k, 'flyers_torn', 0.66, 0.65, 1.15, flyers_material(327, 1.15), texel=1.5)
    upright(k, 'rust_streak', 0.36, 1.4, 0.8, streak_material(328, 2.12, 1.3, 0.1, (0.24, 0.09, 0.03),
                                                              (0.15, 0.065, 0.03), 1.0, spread=0.1), texel=0.7)
    upright(k, 'drip_stain', 0.6, 1.9, 0.1, streak_material(329, 1.95, 1.85, 0.08, (0.04, 0.045, 0.04),
                                                             (0.03, 0.04, 0.03), 0.85, spread=0.12, algae=True), texel=0.5)
    upright(k, 'damp_base', 2.4, 0.8, 0.0, damp_material(330), texel=0.5)
    k.row()
    tuft(k, 'weeds_small', 0.28, 0.18, (0.0, math.pi / 3, 2 * math.pi / 3), 340, dry=0.3)
    tuft(k, 'weeds_large', 0.5, 0.34, (0.2, 0.2 + math.pi / 3, 0.2 + 2 * math.pi / 3), 343, dry=0.45)
    tuft(k, 'weeds_kerb', 1.3, 0.14, (0.0, 0.1), 346, dry=0.6)
    k.layout()
    a.bake(size=2048, orm_size=512, normal_size=1024, occlusion_distance=0.15,
           occlusion_in_color=0.15)


def assemble(a):
    SetKit.of(a).levels()
