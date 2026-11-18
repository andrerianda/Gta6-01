"""Fabric: what makes clothes read as cloth and not as painted plastic.

Two halves, both applied to a garment's DENSE source only (the surface the textures are baked
from), so that everything here ends up in the normal map, the occlusion and the colour of the
atlas, while the light game mesh keeps the smooth shape it was decimated from:

    folds    displacements along the normals in metres, worked out from the figure's joints:
             compression folds in the crook of the elbow, the sleeve bunching above a rib cuff,
             the blousing gathered into a waistband, folds radiating from the armpits, trouser
             legs stacking on the boots, folds behind the knee and from the crotch, creases
             across a boot's vamp, and a faint irregular undulation everywhere.
    seams    sewn seams as a sunk line with a top-stitch ridge beside it and a little puckering
             (shoulder, armhole, sleeve underseam, side seams; outseam and inseam of trousers;
             the cargo pocket's flap), written into the green channel of the vertex colours
             'mask' (the cloth material darkens the groove), and wear (rubbed paler: elbows,
             cuff edges, hems, knees) into the blue channel. Red stays what it was (a sole, a
             zip, darker).

fold_garment() subdivides the dense shell once (6 mm voxels -> about 3 mm, fine enough for a
seam) and returns the smooth copy taken before it, which _wardrobe.Piece decimates into the game
piece and takes its shading normals from.
"""
import math

import numpy as np

import _forms as F
from lib import modify, scene


def _arm(figure, sign):
    j = figure.joints
    m = np.array([sign, 1.0, 1.0])
    shoulder, elbow, wrist = j['upper_arm_r'] * m, j['forearm_r'] * m, j['hand_r'] * m
    axis = F.unit(wrist - shoulder)
    front = F.unit(figure.arm_front * m)
    up = F.unit(np.cross(axis, front)) * sign
    return shoulder, elbow, wrist, axis, front, up


def _cyl(points, origin, axis, front, up):
    """Along, radius and angle (0 = front, +pi/2 = up) of points around a limb's axis."""
    rel = points - origin
    along = rel @ axis
    radial = rel - np.outer(along, axis)
    radius = np.linalg.norm(radial, axis=1)
    angle = np.arctan2(radial @ up, radial @ front)
    return along, radius, angle


def _undulation(points, amplitude, period, seed):
    """A faint irregular waviness: cloth is never a perfectly smooth shell."""
    rng = np.random.default_rng(seed)
    total = np.zeros(len(points))
    for _ in range(5):
        direction = F.unit(rng.normal(size=3))
        k = math.tau / (period * rng.uniform(0.7, 1.4))
        total += np.sin(points @ direction * k + rng.uniform(0.0, math.tau))
    return total * (amplitude / 5.0 ** 0.5)


def _seam(distance, along, groove=0.0010, width=0.0022, stitch=0.005):
    """(displacement, mask) of a sewn seam at `distance` metres from its line; `along` is a
    coordinate along it for the puckering."""
    core = np.exp(-(distance / width) ** 2)
    ridge = np.exp(-((distance - stitch) / 0.0012) ** 2)
    pucker = np.exp(-(distance / 0.008) ** 2) * np.sin(along * (math.tau / 0.013)) * 0.00045
    return -groove * core + 0.00035 * ridge + pucker, np.maximum(core, 0.55 * ridge)


def _radiating(points2d, centre, rays, radius, inner, amplitude, phase=0.0, inward=0.0):
    """Folds fanning out from a point (an armpit, the crotch) in a plane, only into the sector
    below it (and towards `inward`, -1 or +1 along the plane's first axis): cloth hangs and
    drags down and in from where it is held, it does not form a star."""
    rel = points2d - centre
    r = np.linalg.norm(rel, axis=1)
    psi = np.arctan2(rel[:, 1], rel[:, 0])
    window = F.smoothstep(inner * 0.4, inner, r) * np.exp(-(r / radius) ** 2)
    unit = rel / np.maximum(r, 1e-9)[:, None]
    sector = np.clip(-unit[:, 1] + 0.7 * inward * unit[:, 0], 0.0, 1.0) ** 0.7
    return amplitude * window * sector * np.sin(psi * rays + phase + 0.6 * np.sin(r / 0.03))


def fold_garment(obj, figure, kind, hem=None, red=None, seed=0, cargo=False, diagonal=0.0):
    """Folds and seams the dense shell `obj` of a garment of `kind` ('jacket', 'shirt',
    'trousers', 'boots'). Returns the smooth copy taken before (the game piece's shape). `red`
    is a function of the final positions giving the red mask channel (a zip, a sole); `hem`
    (metres) gathers a jacket into its waistband; `cargo` adds the thigh pockets' flaps;
    `diagonal` (metres) is the depth of broad tension folds running across the back from each
    armpit down to the small of the back."""
    shape = scene.duplicate(obj, obj.name + '_shape')
    modify.subdivide(obj, levels=1, simple=True)
    points, normals = F.positions(obj), F.normals(obj)
    s = figure.scale
    disp = _undulation(points, 0.0007, 0.09 * s, seed)
    seam = np.zeros(len(points))
    wear = np.zeros(len(points))

    def add_seam(distance, along, region, **kw):
        nonlocal disp, seam
        d, m = _seam(distance, along, **kw)
        disp += d * region
        seam = np.maximum(seam, m * region)

    if kind in ('jacket', 'shirt'):
        j = figure.joints
        arm_weight = np.zeros(len(points))
        pit_z = j['upper_arm_r'][2] - 0.075 * s
        for sign in (1.0, -1.0):
            shoulder, elbow, wrist, axis, front, up = _arm(figure, sign)
            along, radius, angle = _cyl(points, shoulder, axis, front, up)
            on = (radius < 0.13 * s) & (along > -0.02 * s) & (points[:, 0] * sign > 0.0)
            weight = F.smoothstep(-0.005 * s, 0.045 * s, along) * on
            arm_weight = np.maximum(arm_weight, weight)
            length, bend = np.linalg.norm(wrist - shoulder), np.linalg.norm(elbow - shoulder)
            # The crook of the elbow: compression folds, deepest on the inside.
            crook = 0.30 + 0.70 * np.clip(np.cos(angle - 0.35), 0.0, 1.0)
            window = np.exp(-((along - bend) / (0.065 * s)) ** 2)
            phase = along * (math.tau / (0.031 * s)) + 1.1 * np.sin(angle * 3.0 + sign)
            disp += 0.0028 * window * crook * np.sin(phase) * (0.6 + 0.4 * np.sin(angle * 2.0 - sign)) * weight
            wear = np.maximum(wear, 0.7 * window * np.clip(-np.cos(angle), 0.0, 1.0) * weight)
            # The sleeve bunched above the cuff (or a short sleeve's hem): rings and pleats.
            cuff = length - 0.050 * s
            bunch = F.smoothstep(cuff - 0.18 * s, cuff - 0.08 * s, along) * F.smoothstep(cuff + 0.01 * s, cuff - 0.03 * s, along)
            # (Irregular: the amplitude wanders around the sleeve, and two wavelengths beat.)
            rings = (np.sin(along * (math.tau / (0.026 * s)) + 1.4 * np.sin(angle * 2.0 + 2.0 * sign))
                     * (0.55 + 0.45 * np.sin(angle * 3.0 + along / (0.04 * s)))
                     + 0.4 * np.sin(along * (math.tau / (0.041 * s)) - angle))
            pleats = np.sin(angle * 7.0 + along / (0.02 * s))
            disp += (0.0016 * rings + 0.0011 * pleats) * bunch * weight
            wear = np.maximum(wear, 0.5 * F.smoothstep(cuff - 0.05 * s, cuff, along) * weight)
            # Long soft twists down the upper arm.
            upper = F.smoothstep(0.05 * s, 0.10 * s, along) * F.smoothstep(bend - 0.03 * s, bend - 0.10 * s, along)
            disp += 0.0011 * upper * np.sin(along * (math.tau / (0.075 * s)) + angle * 1.0) * weight
            # Seams: the set-in armhole and the underseam.
            hole = (radius < 0.12 * s) & (np.abs(along - 0.012 * s) < 0.02 * s) & (points[:, 0] * sign > 0.0)
            add_seam(np.abs(along - 0.012 * s), angle * 0.08, hole.astype(float))
            gap = np.abs(np.angle(np.exp(1j * (angle + math.pi / 2.0)))) * radius
            add_seam(gap, along, (along > 0.03 * s) * on * (along < length - 0.04 * s))
            # The shoulder seam across the top, from the collar to the sleeve.
            top = ((points[:, 0] * sign > 0.05 * s) & (points[:, 0] * sign < shoulder[0] + 0.005 * s)
                   & (points[:, 2] > shoulder[2] - 0.01 * s)).astype(float) * (1.0 - weight)
            add_seam(np.abs(points[:, 1] - (j['neck'][1] - 0.006 * s)), points[:, 0], top)
            wear = np.maximum(wear, 0.35 * top * F.smoothstep(shoulder[2] - 0.01 * s, shoulder[2] + 0.05 * s, points[:, 2]))
            # Folds fanning from the armpit, front and back.
            pit = np.array([sign * (shoulder[0] - 0.035 * s), pit_z])
            for facing, phase0 in ((1.0, 0.3), (-1.0, 1.9)):
                side = (points[:, 1] - shoulder[1]) * facing > 0.0
                plane = np.stack([points[:, 0], points[:, 2]], axis=1)
                disp += (_radiating(plane, pit, 6.0, 0.13 * s, 0.03 * s, 0.0022, phase0, inward=-sign)
                         * side * (1.0 - weight))
            # The side seam under the arm, down to the hem.
            middle = np.interp(points[:, 2], [0.9 * s, 1.5 * s], [j['spine'][1], j['chest'][1]])
            lateral = (np.abs(points[:, 0]) > 0.07 * s) & (points[:, 2] < pit_z) & (points[:, 0] * sign > 0.0)
            add_seam(np.abs(points[:, 1] - middle), points[:, 2], lateral * (1.0 - weight))
        trunk = 1.0 - arm_weight
        if hem is not None:
            # Blousing: the shell gathered into the waistband in soft vertical pleats, with a
            # little overhang just above it.
            h = points[:, 2] - hem
            centre_y = np.interp(points[:, 2], [0.9 * s, 1.5 * s], [j['spine'][1], j['chest'][1]])
            phi = np.arctan2(points[:, 1] - centre_y, points[:, 0])
            blouse = F.smoothstep(0.17 * s, 0.0, h) * (h > -0.01)
            pleat = np.sin(phi * 24.0 + 1.6 * np.sin(phi * 5.0) + h / (0.05 * s)) * (0.55 + 0.45 * np.sin(phi * 4.0 + 1.7))
            disp += (0.0030 * blouse ** 1.3 * pleat + 0.0024 * np.exp(-((h - 0.028 * s) / (0.016 * s)) ** 2)) * trunk
            wear = np.maximum(wear, 0.4 * F.smoothstep(0.03 * s, 0.0, h) * trunk)
        # A soft fold across the small of the back and over the shoulder blades.
        back = (points[:, 1] < j['spine'][1]).astype(float) * trunk
        blades = np.exp(-((points[:, 2] - (pit_z + 0.02 * s)) / (0.05 * s)) ** 2) * np.exp(-(points[:, 0] / (0.09 * s)) ** 2)
        disp += 0.0016 * blades * np.sin(points[:, 2] * (math.tau / (0.05 * s)) + points[:, 0] * 20.0) * back
        if diagonal > 0.0:
            # The pull of the arms on a closed shell: two or three broad ridges in a band from
            # each armpit down to the middle of the small of the back (seen from the game's
            # camera behind the lead), fading in at the armpit and out above the waistband.
            low_z = (hem if hem is not None else j['spine'][2]) + 0.10 * s
            plane = np.stack([points[:, 0], points[:, 2]], axis=1)
            for sign in (1.0, -1.0):
                start = np.array([sign * (j['upper_arm_r'][0] - 0.05 * s), pit_z - 0.01 * s])
                run = np.array([sign * 0.03 * s, low_z]) - start
                length = np.linalg.norm(run)
                run = run / length
                rel = plane - start
                t = rel @ run / length
                d = rel @ np.array([-run[1], run[0]])
                envelope = (F.smoothstep(0.0, 0.18, t) * F.smoothstep(1.0, 0.70, t)
                            * np.exp(-(d / (0.075 * s)) ** 2) * (points[:, 0] * sign > -0.02 * s))
                ridge = np.sin(d * (math.tau / (0.058 * s)) + 0.8 * np.sin(t * 5.0 + sign))
                disp += diagonal * ridge * envelope * back

    elif kind == 'trousers':
        j = figure.joints
        for sign in (1.0, -1.0):
            m = np.array([sign, 1.0, 1.0])
            hip, knee, ankle = j['thigh_r'] * m, j['shin_r'] * m, j['foot_r'] * m
            axis = F.unit(ankle - hip)
            front = F.unit(np.cross(np.array([1.0, 0.0, 0.0]), axis)) * -1.0
            if front[1] < 0.0:
                front = -front
            up = F.unit(np.cross(axis, front)) * sign      # points outwards
            along, radius, angle = _cyl(points, hip, axis, front, up)
            leg = ((points[:, 0] * sign > 0.0) & (radius < 0.13 * s)).astype(float)
            length, bend = np.linalg.norm(ankle - hip), np.linalg.norm(knee - hip)
            # Stacking on the boots.
            stack = F.smoothstep(length - 0.26 * s, length - 0.10 * s, along)
            disp += 0.0026 * stack * np.sin(along * (math.tau / (0.034 * s)) + 1.3 * np.sin(angle * 2.0 + sign)) * leg
            # Behind the knee (and a little in front).
            window = np.exp(-((along - bend) / (0.06 * s)) ** 2)
            behind = 0.25 + 0.75 * np.clip(-np.cos(angle), 0.0, 1.0)
            disp += 0.0020 * window * behind * np.sin(along * (math.tau / (0.028 * s)) + angle) * leg
            wear = np.maximum(wear, 0.5 * window * np.clip(np.cos(angle), 0.0, 1.0) * leg)
            # Outseam and inseam.
            out_gap = np.abs(np.angle(np.exp(1j * (angle - math.pi / 2.0)))) * radius
            in_gap = np.abs(np.angle(np.exp(1j * (angle + math.pi / 2.0)))) * radius
            add_seam(out_gap, along, leg * (along > 0.02 * s))
            add_seam(in_gap, along, leg * (along > 0.10 * s))
            if cargo:
                # The cargo pocket's flap: its lower edge, its top seam and its sides.
                pocket = F.lerp(hip, knee, 0.60)
                outer = (points[:, 0] * sign > abs(pocket[0]) + 0.02 * s).astype(float) * leg
                dz = points[:, 2] - pocket[2]
                dy = np.abs(points[:, 1] - pocket[1])
                inside = F.smoothstep(0.062 * s, 0.054 * s, dy) * outer
                add_seam(np.abs(dz - 0.062 * s), points[:, 1], inside)
                flap = F.smoothstep(0.032 * s, 0.036 * s, dz) * F.smoothstep(0.064 * s, 0.060 * s, dz)
                disp += 0.0012 * flap * inside
                disp -= 0.0012 * np.exp(-((dz - 0.034 * s) / 0.0018) ** 2) * inside
                seam = np.maximum(seam, np.exp(-((dz - 0.034 * s) / 0.0022) ** 2) * inside)
                sides = ((dz > -0.07 * s) & (dz < 0.062 * s)).astype(float)
                add_seam(np.abs(dy - 0.058 * s), points[:, 2], outer * sides)
            hems = F.smoothstep(0.03 * s, 0.0, points[:, 2] - 0.105 * s)
            wear = np.maximum(wear, 0.6 * hems * leg)
        # Drag folds fanning from the crotch, front and back.
        crotch = np.array([0.0, 0.845 * s])
        plane = np.stack([points[:, 0], points[:, 2]], axis=1)
        for facing, phase0 in ((1.0, 0.0), (-1.0, 1.4)):
            side = (points[:, 1] - j['thigh_r'][1]) * facing > 0.0
            disp += _radiating(plane, crotch, 5.0, 0.12 * s, 0.025 * s, 0.0018, phase0) * side

    elif kind == 'boots':
        j = figure.joints
        top = np.clip(normals[:, 2], 0.0, 1.0)
        for sign in (1.0, -1.0):
            ball = j['toe_r'] * np.array([sign, 1.0, 1.0])
            near = (points[:, 0] * sign > 0.0).astype(float)
            window = np.exp(-((points[:, 1] - ball[1] - 0.012 * s) / (0.022 * s)) ** 2)
            disp -= 0.0011 * window * top * near * np.abs(np.sin((points[:, 1] + 0.004 * np.sin(points[:, 0] / 0.01))
                                                                   * (math.tau / (0.022 * s))))
            wear = np.maximum(wear, 0.6 * window * top * near)
        # The welt: a stitched groove where the upper meets the sole.
        welt = np.exp(-((points[:, 2] - 0.029 * s) / 0.0016) ** 2)
        disp -= 0.0007 * welt
        seam = np.maximum(seam, welt)
        disp *= 0.7
    if kind == 'jacket':
        # A nylon bomber puckers into deeper, softer folds than shirting (in the engine the
        # cotton amplitudes read as smooth plastic at 3 m). (Until shift 9 this sat in an elif
        # after the jacket's own branch and never ran.)
        disp *= 1.6

    points = points + normals * disp[:, None]
    F.set_positions(obj, points)
    colors = np.zeros((len(points), 3))
    if red is not None:
        colors[:, 0] = red(points)
    colors[:, 1] = np.clip(seam, 0.0, 1.0)
    colors[:, 2] = np.clip(wear, 0.0, 1.0)
    F.set_vertex_colors(obj, colors)
    return shape
