"""The ground of the air base as a material library: four tileable ground materials on 4 m quads
(ground_concrete, ground_asphalt, ground_grass, ground_dirt: base colour, normal and roughness maps
that wrap seamlessly) and six alpha decals in ONE shared atlas (decal_tyre_rubber, decal_oil_stain,
decal_crack, decal_paint_white, decal_paint_yellow, decal_scorch; alphaMode BLEND, each material
carries a KHR_texture_transform so that a quad with UV 0..1 shows the whole decal).

Every texture is a procedural node material baked with Cycles (_ground_kit.Graph: 4D noise on a
flat torus, so the bake is periodic by construction); normal maps come from the baked height maps.
The file is written by _ground_kit.write_glb (WebP textures sized to the 0.8 MiB budget); the game
takes the materials off the nodes and puts them on its own ground meshes.

In the game's axes every quad lies flat (normal +Y), u along +X, v along +Z, v = 0 at the image top.
"""
import os

import bpy
import numpy as np

import _ground_kit as gk
from _ground_kit import Graph
from lib import meshkit as mk

ASSET = {'id': 'base_ground', 'atlas': 1024, 'kind': 'prop', 'ground': False, 'views': ((0, 89, 1.3), (25, 28, 2.2, (0, 0, 0)))}

TILE = 4.0
BUDGET = 0.8 * 1048576 - 26000
# name: (width, length) in metres, rectangle in the atlas (x, y, w, h) in pixels, roughness, periodic along v
DECALS = {
    'decal_tyre_rubber': ((6.0, 30.0), (6, 32, 184, 960), 0.86, False),
    'decal_scorch': ((6.0, 8.0), (198, 6, 376, 504), 0.95, False),
    'decal_crack': ((4.0, 4.0), (582, 6, 376, 376), 0.9, False),
    'decal_oil_stain': ((2.0, 2.0), (198, 518, 248, 248), 0.3, False),
    'decal_paint_white': ((1.0, 4.0), (584, 400, 92, 384), 0.62, True),
    'decal_paint_yellow': ((1.0, 4.0), (700, 400, 92, 384), 0.62, True),
}


# --- the four ground tiles -------------------------------------------------------------------------

def concrete():
    """Apron slab: one 4 m slab per tile, the sealed joint on the tile border; broom finish, stains,
    spalled joint edges, hairline cracks."""
    g = Graph('ground_concrete', (TILE, TILE))
    edge = (0.5 - (g.u - 0.5).abs()).min(0.5 - (g.v - 0.5).abs()) * TILE          # metres to the joint
    broad = g.noise(0.6, 4.0).ramp(0.3, 0.7)
    blotch = g.noise(5.0, 4.0, 0.6, seed=1).ramp(0.35, 0.7)
    fine = g.noise(110.0, 2.0, 0.6, seed=2).ramp(0.25, 0.75)
    stones = g.voronoi(150.0, seed=3).ramp(0.15, 0.6)
    broom = g.noise(160.0, 1.0, 0.5, (30.0, 1.0), seed=4).ramp(0.3, 0.7)
    colour = g.mix(broad, Graph.rgb('#8b877c'), Graph.rgb('#a39f93'))
    colour = g.mix(blotch * 0.45, colour, Graph.rgb('#777369'))
    colour = g.tint(colour, fine.ramp(0.0, 1.0, 0.9, 1.06))
    colour = g.tint(colour, stones.ramp(0.0, 1.0, 0.92, 1.03))
    colour = g.tint(colour, broom.ramp(0.0, 1.0, 0.95, 1.03))
    # stains: old spills and water marks, and rust-brown weeping from the joints
    stain = g.noise(1.1, 4.0, 0.62, seed=5).ramp(0.56, 0.7, smooth=True)
    colour = g.mix(stain * 0.38, colour, Graph.rgb('#4c4841'))
    drip = g.noise(2.2, 3.0, 0.6, (1.0, 5.0), seed=6).ramp(0.62, 0.78) * edge.ramp(0.9, 0.05)
    colour = g.mix(drip * 0.4, colour, Graph.rgb('#5e4f3d'))
    grime = edge.ramp(0.22, 0.012, smooth=True) * g.noise(3.0, 3.0, seed=7).ramp(0.3, 0.7)
    colour = g.mix(grime * 0.45, colour, Graph.rgb('#514d45'))
    # hairline cracks: thin contour lines of a low noise, only in some places
    contour = (g.noise(0.75, 3.0, 0.62, seed=11) - 0.5).abs()
    crack = contour.ramp(0.0022, 0.0008) * g.noise(0.55, 2.0, seed=12).ramp(0.53, 0.6)
    colour = g.mix(crack * 0.85, colour, Graph.rgb('#2e2c28'))
    # spalled edges and the sealed joint
    spall = (edge + (g.noise(10.0, 3.0, 0.6, seed=8) - 0.5) * 0.22 + (g.noise(1.3, 2.0, seed=9) - 0.5) * 0.12).ramp(0.014, 0.004)
    colour = g.mix(spall * 0.8, colour, Graph.rgb('#6a665d'))
    joint = edge.ramp(0.013, 0.009)
    sealant = g.mix(g.noise(14.0, 3.0, seed=10).ramp(0.3, 0.7), Graph.rgb('#1f1e1c'), Graph.rgb('#34322d'))
    colour = g.mix(joint, colour, sealant)
    rough = fine.ramp(0.0, 1.0, 0.78, 0.94) - stain * 0.18 - joint * 0.3
    height = fine * 0.0011 + stones * 0.0005 + broom * 0.0009 + broad * 0.002 - spall * 0.006 - crack * 0.004 - edge.ramp(0.02, 0.01) * 0.007
    g.outputs = {'color': colour, 'rough': rough, 'height': height, 'm_crack': crack, 'm_spall': spall, 'm_stain': stain}
    g.finish(colour, rough, 0.0, height)
    return g, 1.6


def asphalt():
    """Runway and taxiway: exposed aggregate, two patch repairs with sealed edges, tar snakes over
    old cracks, a little crazing."""
    g = Graph('ground_asphalt', (TILE, TILE))
    broad = g.noise(0.7, 4.0).ramp(0.3, 0.7)
    cell = g.channel(g.voronoi(95.0, out='Color', seed=1))
    stone = g.voronoi(95.0, seed=1).ramp(0.55, 0.2) * cell.ramp(0.45, 0.9)
    grit = g.noise(180.0, 2.0, 0.6, seed=2).ramp(0.25, 0.75)
    colour = g.mix(broad, Graph.rgb('#2b2b2a'), Graph.rgb('#3d3c39'))
    colour = g.mix(g.noise(4.0, 4.0, 0.6, seed=3).ramp(0.4, 0.72) * 0.4, colour, Graph.rgb('#4a4741'))
    colour = g.tint(colour, grit.ramp(0.0, 1.0, 0.82, 1.1))
    colour = g.mix(stone * 0.55, colour, Graph.rgb('#8d8a82'))
    # patch repairs: fresher, darker, finer mix; their edges sealed with tar
    wobble = (g.noise(5.0, 3.0, seed=4) - 0.5) * 0.07
    patch = None
    tar_edge = None
    for x0, x1, y0, y1 in ((0.9, 1.95, 1.1, 1.85),):      # one small, faint repair: anything bolder shows as a grid of repeats
        inside = (g.x - x0).min(x1 - g.x).min((g.y - y0).min(y1 - g.y)) + wobble
        this, band = inside.ramp(0.0, 0.012), inside.abs().ramp(0.024, 0.013) * g.noise(3.0, 2.0, seed=41).ramp(0.4, 0.5)
        patch = this if patch is None else patch.max(this)
        tar_edge = band if tar_edge is None else tar_edge.max(band)
    fresh = g.tint(g.mix(stone * 0.25, Graph.rgb('#222221'), Graph.rgb('#6a6862')), grit.ramp(0.0, 1.0, 0.85, 1.08))
    colour = g.mix(patch * 0.3, colour, fresh)
    # tar snakes (long sealed cracks that run on from tile to tile) and a little crazing
    snake = (g.noise(0.5, 2.5, 0.5, seed=21) - 0.5).abs().ramp(0.006, 0.003) * g.noise(0.6, 2.0, seed=22).ramp(0.4, 0.47)
    snake = snake * (1.0 - patch)
    craze = g.voronoi(6.5, 'DISTANCE_TO_EDGE', seed=31).ramp(0.014, 0.004) * g.noise(0.4, 2.0, seed=32).ramp(0.57, 0.63) * (1.0 - patch)
    tar = snake.max(tar_edge)
    colour = g.mix(tar * 0.92, colour, g.mix(grit, Graph.rgb('#0d0d0d'), Graph.rgb('#191918')))
    colour = g.mix(craze * 0.7, colour, Graph.rgb('#171716'))
    rough = grit.ramp(0.0, 1.0, 0.84, 0.97) - tar * 0.48 - patch * 0.05
    height = stone * 0.0028 + grit * 0.0012 + broad * 0.002 + tar * 0.0016 - craze * 0.004 - patch * 0.0015 - tar * stone * 0.0025
    g.outputs = {'color': colour, 'rough': rough, 'height': height, 'm_tar': tar, 'm_craze': craze, 'm_patch': patch}
    g.finish(colour, rough, 0.0, height)
    return g, 1.5


def grass():
    """Airfield grass: uneven, part green and part burnt dry, darker clumps, bare sandy patches."""
    g = Graph('ground_grass', (TILE, TILE))
    broad = g.noise(0.55, 3.0).ramp(0.32, 0.68, smooth=True)
    middle = g.noise(3.2, 4.0, 0.6, seed=1).ramp(0.3, 0.7)
    clump = g.voronoi(8.0, seed=2).ramp(0.75, 0.25) * g.noise(1.4, 2.0, seed=3).ramp(0.35, 0.65)
    blade_a = g.noise(210.0, 2.0, 0.6, (1.0, 7.0), seed=4)
    blade_b = g.noise(210.0, 2.0, 0.6, (7.0, 1.0), seed=5)
    blades = blade_a.max(blade_b).ramp(0.42, 0.72)
    shadow = blade_a.min(blade_b).ramp(0.5, 0.3)
    colour = g.mix(broad * 0.65 + middle * 0.35, Graph.rgb('#4b5f2a'), Graph.rgb('#8a8146'))
    colour = g.mix(clump * 0.55, colour, Graph.rgb('#36461f'))
    colour = g.mix(g.noise(22.0, 3.0, 0.6, seed=6).ramp(0.5, 0.75) * 0.35, colour, Graph.rgb('#a39857'))
    colour = g.tint(colour, blades.ramp(0.0, 1.0, 0.8, 1.22))
    colour = g.tint(colour, shadow.ramp(0.0, 1.0, 1.0, 0.72))
    bare = (g.noise(0.85, 4.0, 0.62, seed=7) + (g.noise(9.0, 3.0, seed=8) - 0.5) * 0.12).ramp(0.585, 0.635)
    pebble = g.voronoi(55.0, seed=9).ramp(0.5, 0.2) * g.channel(g.voronoi(55.0, out='Color', seed=9)).ramp(0.6, 0.9)
    soil = g.mix(g.noise(30.0, 3.0, seed=10).ramp(0.3, 0.7), Graph.rgb('#6a563d'), Graph.rgb('#8c7653'))
    soil = g.mix(pebble * 0.6, soil, Graph.rgb('#a39c8c'))
    colour = g.mix(bare, colour, soil)
    rough = blades.ramp(0.0, 1.0, 0.9, 1.0) - bare * 0.06
    height = (blades * 0.012 + clump * 0.03 + middle * 0.01) * (1.0 - bare) + bare * (pebble * 0.006 - 0.012)
    g.outputs = {'color': colour, 'rough': rough, 'height': height, 'm_bare': bare, 'm_dry': broad}
    g.finish(colour, rough, 0.0, height)
    return g, 1.0


def dirt():
    """Patrol track: packed earth with two tyre ruts along v (1.5 m gauge), tread marks, gravel,
    dried mud in the ruts and dry grass on the crown and the verges."""
    g = Graph('ground_dirt', (TILE, TILE))
    wander = (g.noise(1.0, 2.0, seed=1) - 0.5) * 0.045
    offset = (g.u + wander - 0.31).abs().min((g.u + wander - 0.69).abs()) * TILE          # metres to a rut's middle
    rut = (offset + (g.noise(4.0, 3.0, seed=2) - 0.5) * 0.14).ramp(0.3, 0.1, smooth=True)
    core = offset.ramp(0.16, 0.06)
    broad = g.noise(0.9, 4.0).ramp(0.3, 0.7)
    grit = g.noise(120.0, 2.0, 0.65, seed=3).ramp(0.25, 0.75)
    colour = g.mix(broad, Graph.rgb('#6b5539'), Graph.rgb('#8b7350'))
    colour = g.mix(g.noise(6.0, 4.0, seed=4).ramp(0.4, 0.75) * 0.4, colour, Graph.rgb('#5a4630'))
    colour = g.mix(rut * 0.6, colour, Graph.rgb('#9a8866'))
    tread = ((g.v * 32.0 + (offset * 9.0)).fract() - 0.5).abs().ramp(0.2, 0.3) * core * g.noise(1.6, 2.0, stretch=(1.0, 2.5), seed=5).ramp(0.4, 0.6)
    colour = g.mix(tread * 0.4, colour, Graph.rgb('#5f4d36'))
    mud = g.noise(1.3, 3.0, 0.6, (1.0, 3.0), seed=6).ramp(0.6, 0.68) * rut
    colour = g.mix(mud * 0.75, colour, Graph.rgb('#4a3c2b'))
    cell = g.channel(g.voronoi(42.0, out='Color', seed=7))
    gravel = g.voronoi(42.0, seed=7).ramp(0.5, 0.22) * cell.ramp(0.62, 0.8) * (1.0 - mud)
    colour = g.mix(gravel * 0.8, colour, g.mix(cell, Graph.rgb('#7d776b'), Graph.rgb('#aaa497')))
    colour = g.tint(colour, grit.ramp(0.0, 1.0, 0.86, 1.08))
    verge = (1.0 - rut) * (offset.ramp(0.35, 0.6)) * g.noise(2.2, 3.0, 0.6, seed=8).ramp(0.46, 0.6)
    blade = g.noise(200.0, 2.0, 0.6, (1.0, 7.0), seed=9).max(g.noise(200.0, 2.0, 0.6, (7.0, 1.0), seed=10)).ramp(0.42, 0.7)
    tuft = g.tint(g.mix(g.noise(3.0, 2.0, seed=11).ramp(0.35, 0.65), Graph.rgb('#5d6630'), Graph.rgb('#948a4c')), blade.ramp(0.0, 1.0, 0.72, 1.2))
    colour = g.mix(verge, colour, tuft)
    rough = grit.ramp(0.0, 1.0, 0.86, 0.98) - mud * 0.22
    height = grit * 0.002 + broad * 0.008 - rut * 0.03 - tread * 0.005 + gravel * 0.007 + verge * blade * 0.012 - mud * 0.004
    g.outputs = {'color': colour, 'rough': rough, 'height': height, 'm_rut': rut, 'm_gravel': gravel, 'm_verge': verge}
    g.finish(colour, rough, 0.0, height)
    return g, 1.0


# --- the decals ------------------------------------------------------------------------------------

def tyre_rubber(size):
    """Touchdown streaks: two main-gear bands and a faint nose-wheel line, heaviest a third of the way in."""
    g = Graph('decal_tyre_rubber', size, (False, False))
    streak = g.noise(5.0, 3.0, 0.6, (1.0, 28.0)).ramp(0.36, 0.66)
    fibre = g.noise(22.0, 2.0, 0.6, (1.0, 40.0), seed=1).ramp(0.3, 0.7)
    bands = None
    for centre, half, weight in ((0.27, 0.15, 1.0), (0.73, 0.15, 1.0), (0.5, 0.05, 0.45), (0.2, 0.05, 0.5), (0.8, 0.05, 0.5)):
        band = (g.u - centre).abs().ramp(half, half * 0.25, smooth=True) * weight
        bands = band if bands is None else bands.max(band)
    along = g.v.ramp(0.0, 0.16, smooth=True) * g.v.ramp(1.0, 0.45, smooth=True)
    patchy = g.noise(0.35, 3.0, 0.6, (1.0, 2.0), seed=2).ramp(0.3, 0.6)
    alpha = (bands * along * (streak * 0.75 + fibre * 0.35) * patchy.ramp(0.0, 1.0, 0.45, 1.0)).ramp(0.05, 0.85) * 0.93
    colour = g.mix(fibre, Graph.rgb('#0e0e0d'), Graph.rgb('#1d1c1a'))
    g.outputs = {'color': colour, 'alpha': alpha}
    return g


def oil_stain(size):
    """A spill under a parked machine: a dark core, a paler soaked ring, drips around it."""
    g = Graph('decal_oil_stain', size, (False, False))
    dx, dy = g.x - size[0] * 0.5, g.y - size[1] * 0.5
    radius = (dx * dx + dy * dy).power(0.5) + (g.noise(2.2, 3.0, 0.6) - 0.5) * 0.7
    core = radius.ramp(0.48, 0.22, smooth=True)
    soak = radius.ramp(0.82, 0.4, smooth=True)
    drips = g.voronoi(5.5, seed=1).ramp(0.2, 0.08) * g.channel(g.voronoi(5.5, out='Color', seed=1)).ramp(0.55, 0.7) * radius.ramp(1.0, 0.75)
    alpha = (core * 0.55 + soak * 0.42).max(drips * 0.7).min(0.93)
    colour = g.mix(core, Graph.rgb('#2b2318'), Graph.rgb('#0c0b09'))
    g.outputs = {'color': colour, 'alpha': alpha}
    return g


def crack(size):
    """A cracked area of pavement: a network of open cracks with dirt washed along them."""
    g = Graph('decal_crack', size, (False, False))
    dx, dy = g.x - size[0] * 0.5, g.y - size[1] * 0.5
    reach = ((dx * dx + dy * dy).power(0.5) + (g.noise(1.2, 3.0) - 0.5) * 1.4).ramp(1.85, 1.0, smooth=True)
    edge = g.voronoi(1.25, 'DISTANCE_TO_EDGE', seed=3)
    fine = g.voronoi(3.4, 'DISTANCE_TO_EDGE', seed=4)
    width = g.noise(2.0, 2.0, seed=6).ramp(0.3, 0.7, 0.3, 1.0)          # the cracks open and close along their run
    broken = g.noise(1.6, 2.0, seed=7).ramp(0.34, 0.44)
    line = ((edge / width).ramp(0.011, 0.004) * broken).max(fine.ramp(0.008, 0.003) * g.noise(0.9, 2.0, seed=5).ramp(0.5, 0.6))
    halo = edge.ramp(0.09, 0.01, smooth=True) * broken
    alpha = (line * 0.9).max(halo * 0.2) * reach
    colour = g.mix(line, Graph.rgb('#3b352c'), Graph.rgb('#12110f'))
    g.outputs = {'color': colour, 'alpha': alpha}
    return g


def paint(name, size, light, dark):
    """A worn painted line, 1 m wide and 4 m long, periodic along its length: chipped, scuffed, its
    edges eaten away."""
    g = Graph(name, size, (False, True))
    edge = (0.5 - (g.u - 0.5).abs()) * size[0] + (g.noise(7.0, 3.0, 0.6) - 0.5) * 0.09
    body = edge.ramp(0.035, 0.07)
    chips = g.noise(13.0, 4.0, 0.68, seed=1).ramp(0.6, 0.66)
    worn = g.noise(1.6, 3.0, 0.6, (1.0, 3.0), seed=2).ramp(0.52, 0.72)
    flake = (g.voronoi(26.0, seed=3).ramp(0.3, 0.42)) * worn
    alpha = body * (1.0 - chips * 0.9) * (1.0 - flake * 0.85) * (1.0 - worn * 0.35) * 0.96
    scuff = g.noise(9.0, 3.0, 0.6, (1.0, 14.0), seed=4).ramp(0.55, 0.75)
    colour = g.mix(g.noise(3.0, 3.0, seed=5).ramp(0.3, 0.7), Graph.rgb(dark), Graph.rgb(light))
    colour = g.mix(scuff * 0.55, colour, Graph.rgb('#3a3936'))
    colour = g.tint(colour, g.noise(60.0, 2.0, seed=6).ramp(0.3, 0.7, 0.9, 1.05))
    g.outputs = {'color': colour, 'alpha': alpha}
    return g


def scorch(size):
    """Jet blast on the pavement: the nozzle end at v = 0, a soot plume widening and fading along v."""
    g = Graph('decal_scorch', size, (False, False))
    width = g.v * 0.3 + 0.1 + (g.noise(1.0, 2.0) - 0.5) * 0.08
    across = (1.0 - (g.u - 0.5).abs() / width).ramp(0.0, 0.75, smooth=True)
    along = g.v.ramp(0.0, 0.07, smooth=True) * g.v.ramp(1.0, 0.3, smooth=True)
    streak = g.noise(3.0, 3.0, 0.6, (1.0, 9.0), seed=1).ramp(0.3, 0.68)
    soot = g.noise(1.4, 4.0, 0.6, seed=2).ramp(0.28, 0.62)
    alpha = (across * along * (streak * 0.6 + soot * 0.55)).ramp(0.04, 0.8) * 0.9
    heat = across * g.v.ramp(0.35, 0.05)
    colour = g.mix(heat, Graph.rgb('#211a13'), Graph.rgb('#0b0a09'))
    colour = g.mix(g.noise(8.0, 3.0, seed=3).ramp(0.5, 0.75) * 0.4, colour, Graph.rgb('#4a4036'))
    g.outputs = {'color': colour, 'alpha': alpha}
    return g


# --- build -----------------------------------------------------------------------------------------

def make(a):
    a.finish = lambda out_path, work_dir, bake=True: build(out_path, work_dir)


def build(out_path, work_dir):
    os.makedirs(work_dir, exist_ok=True)
    report = {'id': 'base_ground', 'tiles': {}, 'decals': {}}
    images, materials, quads = [], [], []
    tile_budget = (BUDGET - 115000) / 4.0
    preview = []
    views = ((0, 89, 1.45), (20, 24, 3.2, (-5.0, 3.0, 0.0)))
    if os.environ.get('A4_REUSE'):      # artist's shortcut: only re-render the preview from the last bake
        preview_scene(work_dir, ['ground_concrete', 'ground_asphalt', 'ground_grass', 'ground_dirt'])
        return {'id': 'base_ground', 'reused': True, 'sheet': gk.preview(os.path.join(work_dir, 'sheet.jpg'), views, (640, 520), False)}
    # (weight of the tile in the budget, shares of colour / normal / roughness in it)
    plan = {'ground_concrete': (0.86, 0.6, 0.29, 0.11), 'ground_asphalt': (1.0, 0.63, 0.27, 0.1),
            'ground_grass': (1.1, 0.56, 0.36, 0.08), 'ground_dirt': (1.04, 0.6, 0.31, 0.09)}
    for index, maker in enumerate((concrete, asphalt, grass, dirt)):
        graph, relief = maker()
        name = graph.mat.name
        weight, share_base, share_normal, share_orm = plan[name]
        baked = gk.bake_graph(graph, (1024, 1024), ['color', 'rough', 'height'])
        masks = [k for k in graph.outputs if k.startswith('m_')]
        shares = {k[2:]: round(float(v[..., 0].mean()), 4) for k, v in gk.bake_graph(graph, (256, 256), masks, samples=2).items()}
        colour = gk.to_bytes(gk.srgb(baked['color']))
        height = baked['height'][..., 0]
        normal = gk.to_bytes(gk.normal_map(height, (TILE, TILE), relief))
        rough = gk.to_bytes(baked['rough'][..., 0])
        orm = np.dstack([np.full_like(rough, 255), rough, np.zeros_like(rough)])
        normal_small, orm_small = gk.resize(normal, (512, 512)), gk.resize(orm, (512, 512))
        entry = {'shares': shares, 'seam': {'color': gk.seam_error(colour), 'normal': gk.seam_error(normal), 'rough': gk.seam_error(rough)},
                 'mean_srgb': [int(v) for v in colour.reshape(-1, 3).mean(axis=0)], 'rough_mean': round(float(rough.mean() / 255.0), 3),
                 'height_mm': [round(float(height.min() * 1000), 1), round(float(height.max() * 1000), 1)]}
        data = {}
        for key, array, share in (('base', colour, share_base), ('normal', normal_small, share_normal), ('orm', orm_small, share_orm)):
            data[key], quality = gk.webp(array, target=int(tile_budget * weight * share))
            entry[key] = [len(data[key]), quality]
            gk.save_png(array, os.path.join(work_dir, '%s_%s.png' % (name, key)))
        first = len(images)
        images += [data['base'], data['normal'], data['orm']]
        materials.append({'name': name, 'base': first, 'normal': first + 1, 'orm': first + 2, 'repeat': True})
        quads.append({'name': name, 'material': name, 'width': TILE, 'length': TILE, 'x': index * 5.0})
        report['tiles'][name] = entry
        preview.append(name)
        bpy.data.materials.remove(graph.mat)

    atlas = np.zeros((1024, 1024, 4), dtype=np.float32)
    x_cursor = 20.0
    makers = {'decal_tyre_rubber': tyre_rubber, 'decal_scorch': scorch, 'decal_crack': crack, 'decal_oil_stain': oil_stain,
              'decal_paint_white': lambda s: paint('decal_paint_white', s, '#d9d7cc', '#b3b1a6'),
              'decal_paint_yellow': lambda s: paint('decal_paint_yellow', s, '#d0a51f', '#a98318')}
    transforms = {}
    for name, (size, (x, y, w, h), roughness, wraps) in DECALS.items():
        graph = makers[name](size)
        baked = gk.bake_graph(graph, (w, h), ['color', 'alpha'])
        alpha = np.clip(baked['alpha'][..., 0], 0.0, 1.0)
        colour = gk.srgb(gk.bleed(baked['color'], alpha, wrap=False))
        pad = 6
        tile = np.dstack([colour, alpha])
        padded = np.pad(tile, ((pad, pad), (pad, pad), (0, 0)), mode='edge')
        padded[..., 3] = np.pad(alpha, pad, mode='constant')
        if wraps:      # the strip continues into its padding rows, so filtering across v = 0 / 1 finds itself
            padded[:pad, pad:-pad] = tile[-pad:]
            padded[-pad:, pad:-pad] = tile[:pad]
        atlas[y - pad:y + h + pad, x - pad:x + w + pad] = padded
        transforms[name] = ((x / 1024.0, y / 1024.0), (w / 1024.0, h / 1024.0))
        report['decals'][name] = {'metres': list(size), 'rect': [x, y, w, h], 'alpha_mean': round(float(alpha.mean()), 3),
                                  'alpha_max': round(float(alpha.max()), 3), 'edge_alpha': round(float(max(alpha[:, 0].max(), alpha[:, -1].max())), 3),
                                  'wrap_v': gk.seam_error(gk.to_bytes(alpha))['v'] if wraps else None}
        bpy.data.materials.remove(graph.mat)
    atlas8 = gk.to_bytes(atlas)
    # texels no decal owns take the nearest colours, so no black creeps in through the mip chain
    filled = gk.bleed(atlas[..., :3], (atlas[..., :3].sum(axis=-1) > 0.0).astype(np.float32), wrap=False)
    atlas8[..., :3] = gk.to_bytes(filled)
    gk.save_png(atlas8, os.path.join(work_dir, 'decal_atlas.png'))
    atlas_data, quality = gk.webp(atlas8, target=112000)
    report['decal_atlas'] = [len(atlas_data), quality]
    images.append(atlas_data)
    for name, (size, rect, roughness, wraps) in DECALS.items():
        materials.append({'name': name, 'base': len(images) - 1, 'blend': True, 'roughness': roughness, 'transform': transforms[name], 'repeat': False})
        quads.append({'name': name, 'material': name, 'width': size[0], 'length': size[1], 'x': x_cursor + size[0] * 0.5})
        x_cursor += size[0] + 1.0
    extras = {'asset': 'base_ground', 'kind': 'prop', 'lods': 1, 'tile_metres': TILE,
              'decals': {name: {'width': spec[0][0], 'length': spec[0][1], 'tiles_along_v': spec[3]} for name, spec in DECALS.items()}}
    document = gk.write_glb(out_path, quads, materials, images, extras)
    report.update({'nodes': [n['name'] for n in document['nodes']],
                   'materials': {m['name']: m.get('alphaMode', 'OPAQUE') for m in document['materials']},
                   'triangles': [2 * len(quads)], 'bytes': os.path.getsize(out_path), 'budget': int(0.8 * 1048576)})
    preview_scene(work_dir, preview)
    report['sheet'] = gk.preview(os.path.join(work_dir, 'sheet.jpg'), views, (640, 520), False)
    return report


def preview_scene(work_dir, tiles):
    """What --preview renders: every tile laid 3 x 3 (12 m squares, two by two) with the decals on top."""
    def textured(name, base, normal=None, orm=None, repeat=1.0, rect=None, alpha=False):
        mat = bpy.data.materials.new('preview_' + name)
        mat.use_nodes = True
        tree = mat.node_tree
        shader = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
        coords = tree.nodes.new('ShaderNodeTexCoord')
        mapping = tree.nodes.new('ShaderNodeMapping')
        tree.links.new(coords.outputs['UV'], mapping.inputs['Vector'])
        if rect:
            x, y, w, h = rect
            mapping.inputs['Location'].default_value = (x / 1024.0, 1.0 - (y + h) / 1024.0, 0.0)
            mapping.inputs['Scale'].default_value = (w / 1024.0, h / 1024.0, 1.0)
        else:
            mapping.inputs['Scale'].default_value = (repeat, repeat, 1.0)

        def image(path, data):
            node = tree.nodes.new('ShaderNodeTexImage')
            node.image = bpy.data.images.load(path, check_existing=True)
            node.image.colorspace_settings.name = 'Non-Color' if data else 'sRGB'
            tree.links.new(mapping.outputs['Vector'], node.inputs['Vector'])
            return node

        colour = image(base, False)
        tree.links.new(colour.outputs['Color'], shader.inputs['Base Color'])
        if alpha:
            tree.links.new(colour.outputs['Alpha'], shader.inputs['Alpha'])
        if orm:
            split = tree.nodes.new('ShaderNodeSeparateColor')
            tree.links.new(image(orm, True).outputs['Color'], split.inputs['Color'])
            tree.links.new(split.outputs['Green'], shader.inputs['Roughness'])
        if normal:
            bump = tree.nodes.new('ShaderNodeNormalMap')
            tree.links.new(image(normal, True).outputs['Color'], bump.inputs['Color'])
            tree.links.new(bump.outputs['Normal'], shader.inputs['Normal'])
        return mat

    for index, name in enumerate(tiles):
        cx, cy = (index % 2) * 12.0 - 6.0, 6.0 - (index // 2) * 12.0
        plane = mk.quad('show_' + name, [(cx - 6, cy - 6, 0), (cx + 6, cy - 6, 0), (cx + 6, cy + 6, 0), (cx - 6, cy + 6, 0)])
        path = lambda key: os.path.join(work_dir, '%s_%s.png' % (name, key))
        mk.assign(plane, textured(name, path('base'), path('normal'), path('orm'), 3.0))
    spots = {'decal_tyre_rubber': (9.0, 0.0, 0.7), 'decal_scorch': (-6.5, 6.5, 1.0), 'decal_crack': (-8.5, -3.5, 1.0), 'decal_oil_stain': (-2.5, 9.5, 1.0),
             'decal_paint_white': (-1.2, 2.2, 1.0), 'decal_paint_yellow': (-4.0, -8.0, 1.0)}
    for name, (size, rect, roughness, wraps) in DECALS.items():
        cx, cy, scale = spots[name]
        w, l = size[0] * 0.5 * scale, size[1] * 0.5 * scale
        repeats = 3 if wraps else 1
        for k in range(repeats):
            oy = cy + (k - (repeats - 1) / 2.0) * 2.0 * l
            quad = mk.quad('show_%s_%d' % (name, k), [(cx - w, oy - l, 0.01), (cx + w, oy - l, 0.01), (cx + w, oy + l, 0.01), (cx - w, oy + l, 0.01)])
            mk.assign(quad, textured(name, os.path.join(work_dir, 'decal_atlas.png'), rect=rect, alpha=True))
