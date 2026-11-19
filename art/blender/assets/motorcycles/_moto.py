"""Motorcycle parts shared by the sport bike and the chopper.

Wheels (tyres with a real crown profile and a moulded tread, rims, cast or wire spokes, hubs,
brake discs, calipers), the steering geometry (a raked axis with points given along and across
it), telescopic fork legs, hand controls, final drives (a chain or a belt running round two
sprockets), small lamps on stalks, and the materials both machines use.

Blender axes: Z up, the bike faces +Y, its right side is +X; axles lie along X.
"""
import math

from mathutils import Vector

from lib import build, modify, profiles, scene
from lib import materials as M

import _kit as K

AXLE = (1.0, 0.0, 0.0)
HEAD_LAMP = (1.0, 0.93, 0.80)
TAIL_LAMP = (1.0, 0.05, 0.03)
INDICATOR_LAMP = (1.0, 0.50, 0.05)


# ---------------------------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------------------------

def tyre_rubber(axle, radius, width, pitch=0.055, slant=50.0, seed=0, name='tyre_rubber'):
    """Tyre rubber with chevron grooves moulded into the tread, for a wheel whose axle (along
    X) passes through (y, z) = `axle` in object coordinates. `pitch` is the distance between
    grooves round the tyre, `slant` their angle to the direction of travel in degrees."""
    graph = M.Graph(name, seed)
    across = graph.math('ABSOLUTE', graph.axis('X'))
    y = graph.sub(graph.axis('Y'), axle[0])
    z = graph.sub(graph.axis('Z'), axle[1])
    angle = graph.math('ARCTAN2', z, y)
    distance = graph.math('SQRT', graph.add(graph.mul(y, y), graph.mul(z, z)))
    count = max(8, round(math.tau * radius / pitch))
    lean = count / radius * math.tan(math.radians(slant))
    phase = graph.add(graph.mul(angle, float(count)), graph.mul(across, lean))
    groove = graph.mask(graph.math('SINE', phase), 0.70, 0.10)
    on_tread = graph.mul(graph.mask(distance, radius - 0.34 * width, 0.006),
                         graph.mask(across, 0.011, 0.003))
    groove = graph.mul(groove, on_tread)
    grain = graph.noise(scale=380.0, detail=3.0)
    coat = M.Coat(graph, (0.016, 0.016, 0.017),
                  roughness=graph.remap(grain, 0.3, 0.7, 0.70, 0.88), height=graph.mul(grain, 0.15))
    coat.cover(groove, color=(0.005, 0.005, 0.005), roughness=0.96, height=-1.0)
    # The band that touches the road is scrubbed smooth; dust sits in the sidewall lettering.
    scrubbed = graph.mul(graph.mask(distance, radius - 0.07 * width, 0.01), 0.5)
    coat.roughness = graph.mix_value(scrubbed, coat.roughness, 0.55)
    film = graph.noise(scale=7.0, detail=5.0)
    dust = graph.mul(graph.mul(graph.cavities(distance=0.02), graph.remap(film, 0.2, 0.8, 0.4, 1.0)),
                     0.45)
    coat.cover(dust, color=(0.20, 0.18, 0.15), roughness=0.95)
    return coat.finish(bump_strength=0.9, bump_distance=0.004)


def chain_steel(pitch=0.016, direction='Y', seed=0, name='drive_chain'):
    """An oiled roller chain: bright rollers every `pitch` metres along `direction`, dark
    grease between them."""
    graph = M.Graph(name, seed)
    links = graph.wave(period=pitch, direction=direction)
    grime = graph.noise(scale=30.0, detail=4.0)
    coat = M.Coat(graph, graph.hsv((0.36, 0.33, 0.28), value=graph.remap(grime, 0.2, 0.8, 0.7, 1.1)),
                  roughness=0.42, metallic=1.0, height=links)
    coat.cover(graph.mask(links, 0.35, 0.12), color=(0.030, 0.026, 0.022), roughness=0.75,
               metallic=0.0)
    return coat.finish(bump_strength=0.8, bump_distance=0.003)


def radiator_core(pitch=0.014, seed=0, name='radiator_core'):
    """A radiator matrix: dark aluminium tubes and fins in fine horizontal bands, dusty."""
    graph = M.Graph(name, seed)
    fins = graph.wave(period=pitch, direction='Z')
    tubes = graph.wave(period=pitch * 3.0, direction='X')
    dirt = graph.noise(scale=9.0, detail=5.0)
    color = graph.ramp(fins, [(0.0, (0.012, 0.012, 0.013)), (1.0, (0.16, 0.16, 0.165))])
    coat = M.Coat(graph, color, roughness=0.6, metallic=0.8,
                  height=graph.add(fins, graph.mul(tubes, 0.5)))
    coat.cover(graph.mul(graph.remap(dirt, 0.4, 0.8), 0.6), color=(0.10, 0.09, 0.075),
               roughness=0.9, metallic=0.0)
    return coat.finish(bump_strength=0.9, bump_distance=0.003)


def satin_black(seed=0, name='satin_black', gloss=0.45):
    """Black powder coat on frames, wheels and brackets, with a little road dirt."""
    return M.painted_metal(color=(0.014, 0.014, 0.016), gloss=gloss, chips=0.06, rust=0.0,
                           grime=0.25, dust=0.15, fade=0.05, seed=seed, name=name)


def lamps():
    """The switchable lamp materials every motorcycle has, by role name."""
    return {
        'head': M.lamp(color=HEAD_LAMP, strength=9.0, rib_pitch=0.012, name='lamp_head'),
        'tail': M.lamp(color=TAIL_LAMP, strength=2.5, name='lamp_tail'),
        'brake': M.lamp(color=TAIL_LAMP, strength=9.0, rib_pitch=0.008, name='lamp_brake'),
        'indicator_l': M.lamp(color=INDICATOR_LAMP, strength=6.0, name='lamp_indicator_l'),
        'indicator_r': M.lamp(color=INDICATOR_LAMP, strength=6.0, name='lamp_indicator_r'),
    }


# ---------------------------------------------------------------------------------------------
# Steering geometry
# ---------------------------------------------------------------------------------------------

class Steering:
    """The steering axis of a motorcycle: a line through `origin`, tilted back from vertical by
    the rake. Points on the steered assembly are given as (x, ahead, along): sideways, ahead
    of the axis at right angles to it, and up along it."""

    def __init__(self, origin, rake_degrees):
        self.origin = Vector(origin)
        self.rake = math.radians(rake_degrees)
        self.along = Vector((0.0, -math.sin(self.rake), math.cos(self.rake)))
        self.ahead = Vector((0.0, math.cos(self.rake), math.sin(self.rake)))

    def at(self, x, ahead, along):
        """The world point at (x, ahead, along) in steering coordinates."""
        return tuple(self.origin + Vector((x, 0.0, 0.0)) + self.ahead * ahead + self.along * along)

    def local(self, point):
        """(x, ahead, along) of a world point."""
        offset = Vector(point) - self.origin
        return offset.x, offset.dot(self.ahead), offset.dot(self.along)

    @property
    def euler(self):
        """The pivot's XYZ rotation: its local Z lies along the steering axis."""
        return (self.rake, 0.0, 0.0)

    @property
    def degrees(self):
        return math.degrees(self.rake)


# ---------------------------------------------------------------------------------------------
# Wheels
# ---------------------------------------------------------------------------------------------

def _on_axle(obj, axle):
    """Moves a wheel part built about the Z axis onto the axle through `axle` (a 3D point)."""
    return K.aim(obj, axle, AXLE)


def tyre(name, axle, radius, width, rim_radius, rim_width, arc=5, segments=32):
    """A motorcycle tyre: a round crown (the tread is an arc `arc` points wide), sidewalls
    that tuck into the rim. `radius` is the rolling radius, `width` the widest point."""
    crown = width * 0.56
    half = width / 2
    reach = math.asin(min(1.0, half / crown))
    widest = radius - crown * (1.0 - math.cos(reach))
    bead = rim_radius + 0.002
    tread = [(radius - crown * (1.0 - math.cos(angle)), crown * math.sin(angle))
             for angle in (reach * (2.0 * step / (arc - 1) - 1.0) for step in range(arc))]
    profile = ([(bead, -rim_width / 2 - 0.001),
                (profiles.lerp(bead, widest, 0.55), -half * 0.96)] + tread
               + [(profiles.lerp(bead, widest, 0.55), half * 0.96),
                  (bead, rim_width / 2 + 0.001)])
    return K.soft(_on_axle(build.lathe(name, profile, segments=segments), axle), 50.0)


def rim(name, axle, rim_radius, rim_width, depth=0.026, segments=32):
    """The visible side of a wheel rim: both flange faces and the inner barrel."""
    outer, inner, half = rim_radius + 0.007, rim_radius - depth, rim_width / 2 + 0.005
    obj = build.lathe(name, [(outer, -half), (inner, -half + 0.006), (inner, half - 0.006),
                             (outer, half)], segments=segments)
    obj.data.flip_normals()
    obj.data.update()
    return K.soft(_on_axle(obj, axle), 40.0)


def cast_spokes(name, axle, hub_radius, rim_radius, count=5, twin=True, lean=0.22,
                dish=0.0, width=0.011, thickness=0.013):
    """Cast alloy spokes from the hub to the rim barrel (`rim_radius`): `count` (pairs of)
    tapered spokes swept round the wheel by `lean` radians at the rim. `dish` moves their
    hub end sideways (for a wheel whose hub is not central)."""
    unit = []
    for index, offset in enumerate((-0.17, 0.17) if twin else (0.0,)):
        sections = []
        for step in range(4):
            along = step / 3
            reach = profiles.lerp(hub_radius * 0.8, rim_radius + 0.004, along)
            sweep = offset * (0.4 + 0.6 * along) + lean * along * along
            b = profiles.lerp(width * 1.25, width * 0.8, along)
            t = profiles.lerp(thickness * 1.2, thickness * 0.85, along)
            side = dish * (1.0 - along)
            ring = []
            for corner in range(6):
                turn = math.tau * corner / 6
                tangential = b * math.cos(turn)
                axial = side + t * math.sin(turn)
                angle = sweep + tangential / max(reach, 0.01)
                ring.append((reach * math.cos(angle), reach * math.sin(angle), axial))
            sections.append(ring)
        unit.append(K.skin(f'{name}_{index}', sections))
    spokes = scene.join(unit, name)
    modify.radial_array(spokes, count, axis='Z')
    return K.soft(_on_axle(spokes, axle), 50.0)


def wire_spokes(name, axle, hub_radius, hub_width, rim_radius, count=40, radius=0.0024,
                cross=0.62):
    """A laced wire wheel: `count` spokes running from two hub flanges to the rim, each
    leaving the hub at a tangent (alternately leading and trailing)."""
    spokes = []
    for index in range(count):
        at_rim = math.tau * index / count
        side = -1.0 if index % 2 else 1.0
        at_hub = at_rim + cross * (1.0 if (index // 2) % 2 else -1.0)
        start = (hub_radius * math.cos(at_hub), hub_radius * math.sin(at_hub), side * hub_width / 2)
        end = (rim_radius * math.cos(at_rim), rim_radius * math.sin(at_rim), side * 0.008)
        spokes.append(K.rod(f'{name}_{index}', start, end, radius, segments=3, caps=False))
    return K.soft(_on_axle(scene.join(spokes, name), axle), 80.0)


def hub(name, axle, radius, width, flange=0.0, segments=12):
    """A wheel hub: a barrel between two end caps, with spoke flanges when `flange` is set."""
    half = width / 2
    if flange > 0.0:
        profile = [(0.0, -half - 0.012), (radius * 0.55, -half - 0.012), (radius * 0.6, -half),
                   (flange, -half + 0.002), (flange, -half + 0.008), (radius, -half + 0.02),
                   (radius, half - 0.02), (flange, half - 0.008), (flange, half - 0.002),
                   (radius * 0.6, half), (radius * 0.55, half + 0.012), (0.0, half + 0.012)]
    else:
        profile = [(0.0, -half - 0.014), (radius * 0.5, -half - 0.014), (radius * 0.55, -half),
                   (radius, -half + 0.012), (radius, half - 0.012), (radius * 0.55, half),
                   (radius * 0.5, half + 0.014), (0.0, half + 0.014)]
    return K.soft(_on_axle(build.lathe(name, profile, segments=segments), axle), 40.0)


def brake_disc(name, axle, x, radius, band=0.045, carrier=0.05, thickness=0.005, segments=24):
    """A brake disc at sideways position `x`: the braking band and its carrier. Returns
    (band, carrier): give the band a steel material and the carrier a darker one."""
    centre = (x, axle[1], axle[2])
    ring = K.soft(K.disc(f'{name}_band', radius, thickness, centre, AXLE, segments,
                         inner=radius - band), 40.0)
    outward = 1.0 if x >= 0.0 else -1.0
    web = build.lathe(f'{name}_carrier', [(carrier, 0.004), (radius - band + 0.004, 0.0)],
                      segments=segments)
    if outward < 0.0:
        modify.transform(web, scale=(1.0, 1.0, -1.0))      # the shallow cone faces outboard
    K.aim(web, (x + outward * thickness * 0.6, axle[1], axle[2]), AXLE)
    return ring, K.soft(web, 40.0)


def caliper(name, axle, x, radius, angle_degrees, size=(0.056, 0.105, 0.058)):
    """A brake caliper straddling the disc at sideways position `x`, `radius` from the axle
    at `angle_degrees` round it (0 = ahead of the axle, 90 = above it)."""
    angle = math.radians(angle_degrees)
    centre = (x, axle[1] + radius * math.cos(angle), axle[2] + radius * math.sin(angle))
    body = K.slab(name, size, centre, rotation=(angle_degrees - 90.0, 0.0, 0.0), bevel=0.009)
    return K.soft(body, 30.0)


def drive_loop(name, front, front_radius, rear, rear_radius, x, width, thickness):
    """A chain or belt running round two sprockets. `front` and `rear` are the (y, z) centres
    of the sprockets in the plane at sideways position `x`."""
    dy, dz = front[0] - rear[0], front[1] - rear[1]
    span = math.hypot(dy, dz)
    base = math.atan2(dz, dy)
    spread = math.acos((rear_radius - front_radius) / span)
    top, bottom = base + spread, base - spread
    path = []
    rear_steps, front_steps = 8, 5
    for step in range(rear_steps + 1):          # round the back of the rear sprocket
        angle = top + (bottom + math.tau - top) * step / rear_steps
        path.append((x, rear[0] + rear_radius * math.cos(angle),
                     rear[1] + rear_radius * math.sin(angle)))
    lower_start = path[-1]
    lower_end = (x, front[0] + front_radius * math.cos(bottom),
                 front[1] + front_radius * math.sin(bottom))
    path.append(tuple(profiles.lerp(lower_start, lower_end, 0.5)))
    for step in range(front_steps + 1):         # round the front of the front sprocket
        angle = bottom + (top - bottom) * step / front_steps
        path.append((x, front[0] + front_radius * math.cos(angle),
                     front[1] + front_radius * math.sin(angle)))
    path.append(tuple(profiles.lerp(path[-1], path[0], 0.5)))
    loop = build.sweep(name, profiles.rectangle(thickness, width), path, up=AXLE,
                       closed_path=True)
    if K.signed_volume(loop) < 0.0:
        loop.data.flip_normals()
        loop.data.update()
    return K.soft(loop, 40.0)


# ---------------------------------------------------------------------------------------------
# Fork, controls and small lamps
# ---------------------------------------------------------------------------------------------

def fork_legs(steering, spacing, ahead, top, split, bottom, upper_radius, lower_radius,
              segments=10):
    """The two telescopic legs: an upper tube from `top` down to `split` and a lower one from
    there to `bottom` (heights along the steering axis). Returns (upper tubes, lower tubes)."""
    uppers, lowers = [], []
    for side in (-1.0, 1.0):
        x = side * spacing / 2
        uppers.append(K.rod(f'fork_upper{side}', steering.at(x, ahead, split),
                            steering.at(x, ahead, top), upper_radius, segments, rings=2))
        lowers.append(K.rod(f'fork_lower{side}', steering.at(x, ahead, bottom),
                            steering.at(x, ahead, split + 0.01), lower_radius, segments, rings=2))
    return scene.join(uppers, 'fork_uppers'), scene.join(lowers, 'fork_lowers')


def yoke(name, steering, spacing, ahead, along, thickness, depth=0.085, bevel=0.008):
    """A triple clamp: the plate that holds both fork legs and the steering stem."""
    plate = K.slab(name, (spacing + 0.075, depth, thickness),
                   steering.at(0.0, ahead * 0.55, along),
                   rotation=(steering.degrees, 0.0, 0.0), bevel=bevel)
    return K.soft(plate, 30.0)


def hand_controls(side, grip_start, grip_end, mats, reservoir=False, lever_reach=0.05):
    """A grip with its bar-end weight, lever, perch and switch block. `side` is -1 (left) or
    +1 (right); the grip runs from `grip_start` (inboard) to `grip_end`. `mats` needs
    'grip', 'metal', 'plastic' and 'dark'. Returns a list of parts."""
    start, end = Vector(grip_start), Vector(grip_end)
    axis = (end - start).normalized()
    forward = Vector((0.0, 1.0, -0.25))
    forward = (forward - axis * forward.dot(axis)).normalized()
    up = axis.cross(forward) * (-side)
    if up.z < 0.0:
        up = -up
    tag = 'l' if side < 0 else 'r'
    grip = K.paint(K.rod(f'grip_{tag}', start, end, 0.0175, 10, rings=2), mats['grip'])
    weight = K.paint(K.rod(f'bar_end_{tag}', end, end + axis * 0.024, 0.0165, 10), mats['metal'])
    switch = K.paint(K.rod(f'switch_{tag}', start - axis * 0.062, start - axis * 0.006, 0.022, 8),
                     mats['plastic'])
    perch_at = start - axis * 0.035 + forward * 0.022
    perch = K.paint(K.rod(f'perch_{tag}', perch_at - axis * 0.016, perch_at + axis * 0.016,
                          0.013, 6), mats['dark'])
    lever = K.paint(K.pipe(f'lever_{tag}',
                           [tuple(perch_at + forward * 0.012),
                            tuple(start + axis * 0.03 + forward * (lever_reach + 0.008)),
                            tuple(end - axis * 0.015 + forward * lever_reach)],
                           0.0065, segments=5, smooth=2, radius_end=0.0045), mats['dark'])
    parts = K.until1(grip) + K.only0(weight, switch, perch, lever)
    if reservoir:
        pot = build.cylinder(f'reservoir_{tag}', radius=0.018, depth=0.036, segments=8)
        K.aim(pot, tuple(perch_at + up * 0.035 - axis * 0.012), up)
        parts += K.only0(K.paint(pot, mats['plastic']))
    return parts


def stalk_lamp(name, base, tip, lens_material, body_material, facing=(0.0, 1.0, 0.0),
               radius=0.017, length=0.05):
    """A small lamp on a stalk (an indicator): a rubber stalk from `base` to `tip`, a bullet
    pod there, and its lens facing along `facing`. Returns [stalk, pod, lens]."""
    facing = Vector(facing).normalized()
    stalk = K.paint(K.rod(f'{name}_stalk', base, tip, 0.006, 5), body_material)
    pod = K.turned(f'{name}_pod', [(0.0, -length * 0.55), (radius * 0.6, -length * 0.45),
                                   (radius, -length * 0.1), (radius, length * 0.38)],
                   origin=tip, axis=facing, segments=8)
    K.paint(pod, body_material)
    lens = K.turned(f'{name}_lens', [(radius * 0.96, length * 0.38), (radius * 0.8, length * 0.5),
                                     (0.0, length * 0.56)], origin=tip, axis=facing, segments=8)
    K.paint(lens, lens_material)
    return K.only0(stalk) + K.until1(pod, lens)
