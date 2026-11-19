"""Garment generators. Each returns a Garment: one or more Parts, each a closed shape (a signed
distance field built round the body) with a material role, a fabric for the texture shaders,
seams and details. Clothes are offsets of the body with ease (how far they stand off it), a drape
hull (how they hang over hollows), a region (where they start and stop: hems, cuffs, the neck
opening) and fold warps; their hems keep a real edge, their insides are drawn dark.

    from human import garments as g
    WARDROBE = [
        g.tshirt(color='#d8d4cc', sleeves='short', fabric='jersey'),
        g.trousers(style='jeans', color='#2f4a6b'),
        g.sneakers(color='#ecebe6', sole='#f2f2f0'),
    ]

Every generator takes color (the paint colour, '#rrggbb'), role (the paint_* material it is drawn
with; defaults as the run-time's registry: tops paint_top, jackets and vests paint_jacket,
trousers paint_bottom, shoes paint_shoes; fixed-colour things such as badges, belts, buckles,
zippers use 'atlas') and fabric (shaders.FABRICS: jersey, cotton, oxford, denim, twill, canvas,
nylon, knit_rib, fleece, leather, suede, wool, rubber, mesh_nylon, polyester). Units are metres.
"""
import math

import numpy as np

from .sdf import BIG, Box, Ellipsoid, Field, Fn, Loft, Plane, RoundCone, Sphere, Torus, frame_from, normalize, smax, smin

ROLE_TOP, ROLE_JACKET, ROLE_BOTTOM, ROLE_SHOES = 'paint_top', 'paint_jacket', 'paint_bottom', 'paint_shoes'


class Part:
    """One closed shape of a garment drawn with one material role.

    make(ctx) returns the Field. layer: 1 underwear/shirts, 2 trousers, 3 jackets, 4 vests and
    kit on top (an outer layer hides what is under it). grid: cell size of its surface (m).
    budget: share of the character's triangles. seams: list of (fn(P) -> signed distance to the
    seam line, zone(P) -> bool); details: free data for the shader (pockets, ribs, prints).
    """
    def __init__(self, name, role, color, fabric, make, layer=1, grid=0.004, budget=0.1, hides=True,
                 seams=None, details=None, shader='fabric'):
        self.name, self.role, self.color, self.fabric = name, role, color, fabric
        self.make, self.layer, self.grid, self.budget, self.hides = make, layer, grid, budget, hides
        self.seams = seams or (lambda ctx: [])
        self.details = details or {}
        self.shader = shader


class Garment:
    def __init__(self, name, parts, wear=0.3):
        self.name, self.parts, self.wear = name, parts, wear
        for p in parts:
            p.details.setdefault('wear', wear)


# --- geometry helpers (ctx is the build context: ctx.J joints, ctx.b body, ctx.body Field) ------

def _seg_dist(P, a, b):
    a = np.asarray(a, np.float32)
    ab = np.asarray(b, np.float32) - a
    t = np.clip(((P - a) @ ab) / max(float(ab @ ab), 1e-9), 0.0, 1.0)
    return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)


def arm_zone(ctx, side):
    """< 0 where a point belongs to the arm rather than the torso."""
    ua, wr = ctx.J['upper_arm_' + side][0], ctx.J['hand_' + side][0]
    hips, neck = ctx.J['hips'][0], ctx.J['neck'][0]
    sx = 1.0 if side == 'r' else -1.0

    def fn(P):
        da = _seg_dist(P, ua, wr + (wr - ua) * 0.3)
        dt = _seg_dist(P, hips, neck)
        out = (P[:, 0] * sx < ua[0] * sx - 0.03).astype(np.float32) * 0.2   # never across the chest
        return da - (dt - 0.075 * ctx.s) + out
    return fn


def arm_point(ctx, side, share):
    """A point along the arm: 0 at the shoulder joint, 1 at the wrist (beyond 1: on the hand)."""
    ua, el, wr = (ctx.J[n + '_' + side][0] for n in ('upper_arm', 'forearm', 'hand'))
    lu, lf = np.linalg.norm(el - ua), np.linalg.norm(wr - el)
    x = share * (lu + lf)
    if x <= lu:
        d = (el - ua) / lu
        return ua + d * x, d
    d = (wr - el) / lf
    return el + d * (x - lu), d


def cuff_region(ctx, side, share):
    """Kept-region distance that ends a sleeve at a share of the arm (perpendicular cut)."""
    c, d = arm_point(ctx, side, share)
    zone = arm_zone(ctx, side)

    def fn(P):
        plane = (P - c) @ d.astype(np.float32)
        return np.minimum(plane, -zone(P))
    return fn


def leg_point(ctx, side, share):
    th, kn, an = (ctx.J[n + '_' + side][0] for n in ('thigh', 'shin', 'foot'))
    lt, ls = np.linalg.norm(kn - th), np.linalg.norm(an - kn)
    x = share * (lt + ls)
    if x <= lt:
        return th + (kn - th) / lt * x
    return kn + (an - kn) / ls * (x - lt)


def body_offset(ctx, ease):
    """The body grown by ease (a number or fn(P) -> metres)."""
    body = ctx.body

    def fn(P):
        e = ease(P) if callable(ease) else ease
        return body(P) - e
    return fn


def torso_hull(ctx, drape=0.7, extra=0.0, z_top=None, z_bottom=None):
    """A loft that hangs straight down from the chest: drape 0 follows the waist, 1 hangs."""
    rows = ctx.torso_rows
    zs = [r[0] for r in rows]
    top = z_top or ctx.J['neck'][0][2] - 0.03 * ctx.s
    out = []
    best_a = best_b = 0.0
    for z, y, a, b, p in sorted(rows, key=lambda r: -r[0]):
        if z > top:
            continue
        best_a, best_b = max(best_a, a), max(best_b, b)
        out.append((z, y, a + drape * (best_a - a) + extra, b + drape * (best_b - b) + extra, p))
    if z_bottom is not None:
        z0, y0, a0, b0, p0 = out[-1]
        out.append((z_bottom, y0, a0, b0, p0))
    return Loft(out)


def fold_warp(axis_a, axis_b, wavelength, amplitude, zone=None, seed=0.0):
    """Ripples across a limb between two points: compression folds (sleeves, trouser legs)."""
    a = np.asarray(axis_a, np.float32)
    d = np.asarray(axis_b, np.float32) - a
    L = float(np.linalg.norm(d))
    d /= L

    def fn(P):
        t = (P - a) @ d
        side = P - a - t[:, None] * d
        ang = np.arctan2(side[:, 2], side[:, 0] + 1e-9)
        phase = 2 * np.pi * t / wavelength + 1.7 * np.sin(ang * 2 + seed) + 0.9 * np.sin(ang * 3 + t * 31 + seed)
        w = np.clip(np.minimum(t, L - t) / (0.25 * L), 0, 1)
        if zone is not None:
            w = w * zone(P)
        return (amplitude * w * np.sin(phase)).astype(np.float32)
    return fn


def _shell(ctx, outer, region, keep_hull=None, k_region=0.003):
    """The Field of a garment: outer surface fn and the region fn (both distances)."""
    f = Field()
    lo = np.array([-1.2, -0.6, -0.05], np.float32)
    hi = np.array([1.2, 0.6, 2.3], np.float32)

    def fn(P):
        g = outer(P)
        r = region(P)
        return smax(g, r, k_region)
    f.add(Fn(fn, lo, hi))
    return f


# --- tops -------------------------------------------------------------------------------------

def _top(name, color, fabric, role, sleeves, ease, drape, hem, neck, collar=None, layer=1, rib=None,
         placket=False, pockets=(), folds=0.004, budget=0.18, grid=0.004, hood=False, zip=False, wear=0.3,
         rib_color=None, rib_role=None, cuff_rib=0.0, extra_parts=()):
    """The shared torso garment: sleeves 'none' | 'short' | 'elbow' | 'long' | a share of the arm;
    hem: height of the hem as a share from the crotch (0) to the armpit (1) (a tucked shirt: 0.25);
    neck: 'crew' | 'v' | 'collar' | 'high' (radius share); rib: height (m) of a knit band at the hem
    and cuffs (bombers, hoodies), drawn as its own part with rib_role / rib_color."""
    share = {'none': 0.0, 'short': 0.22, 'elbow': 0.48, 'long': 1.0, 'rolled': 0.62}.get(sleeves, sleeves)

    def hem_z(ctx):
        crotch = ctx.J['thigh_r'][0][2] - 0.06 * ctx.s
        pit = ctx.J['chest'][0][2] + 0.04 * ctx.s
        return crotch + hem * (pit - crotch)

    def region(ctx, inset_cuff=0.0, inset_hem=0.0):
        hz = hem_z(ctx) + inset_hem
        nk = ctx.J['neck'][0]
        open_r = {'crew': 0.062, 'v': 0.064, 'collar': 0.066, 'high': 0.058, 'scoop': 0.075}[neck] * ctx.s
        cuffs = [cuff_region(ctx, s, max(share - inset_cuff, 0.02)) for s in ('r', 'l')] if share > 0 else []
        arm_zones = [arm_zone(ctx, s) for s in ('r', 'l')]

        def fn(P):
            r = hz - P[:, 2]
            # Neck opening: a vertical tube round the neck, deeper in front for a V or scoop.
            dx = P[:, 0]
            dy = P[:, 1] - (nk[1] + 0.012 * ctx.s)
            rad = np.sqrt(dx * dx + dy * dy)
            front = np.clip(dy / (rad + 1e-6), 0, 1)
            depth = {'crew': 0.0, 'v': 0.09, 'collar': 0.01, 'high': -0.01, 'scoop': 0.06}[neck] * ctx.s
            neck_z = nk[2] - 0.012 * ctx.s - depth * front ** 2
            hole = np.minimum(open_r - rad, P[:, 2] - neck_z)
            if neck == 'v':
                vee = np.minimum(0.012 * ctx.s + (nk[2] - P[:, 2]) * 0.28 - np.abs(dx), (P[:, 1] - 0.02).clip(None, 0) * -1 + 0.0)
                vee = np.minimum(vee, P[:, 2] - (nk[2] - 0.13 * ctx.s))
                vee = np.where(P[:, 1] > 0.0, vee, -1.0)
                hole = np.maximum(hole, vee)
            r = np.maximum(r, hole)
            for c in cuffs:
                r = np.maximum(r, c(P))
            if share <= 0:
                for z in arm_zones:
                    r = np.maximum(r, -z(P) - 0.012 * ctx.s)
            return r
        return fn

    def outer(ctx, ease_scale=1.0, extra=0.0):
        hz = hem_z(ctx)
        hull = torso_hull(ctx, drape, ease * 0.6 * ease_scale + extra, z_bottom=hz - 0.05)
        sleeve_hulls = []
        if share > 0:
            for s in ('r', 'l'):
                a, _ = arm_point(ctx, s, 0.05)
                b_, _ = arm_point(ctx, s, min(share, 1.0))
                r0 = 0.062 * ctx.s * (1 + drape * 0.35)
                r1 = (0.050 if share > 0.5 else 0.058) * ctx.s * (1 + drape * 0.3)
                sleeve_hulls.append(RoundCone(a, b_, r0 + extra, r1 + extra))
        warps = []
        if folds > 0 and share > 0.4:
            for s in ('r', 'l'):
                el = ctx.J['forearm_' + s][0]
                a, _ = arm_point(ctx, s, 0.35)
                b_, _ = arm_point(ctx, s, min(share, 1.0))
                warps.append(fold_warp(a, b_, 0.05 * ctx.s, folds * ease_scale, seed=1.3 if s == 'r' else 2.1))
        body = ctx.body

        def fn(P):
            e = ease * ease_scale + extra
            d = body(P) - e
            d = smin(d, hull.dist(P), 0.03)
            for h in sleeve_hulls:
                d = smin(d, h.dist(P), 0.025)
            for w in warps:
                d = d - w(P)
            return d
        return fn

    def make(ctx):
        return _shell(ctx, outer(ctx), region(ctx, 0.0, rib or 0.0 if rib else 0.0))

    def seams(ctx):
        out = []
        ycor = -0.008 * ctx.s
        sideways = [arm_zone(ctx, s) for s in ('r', 'l')]
        out.append((lambda P: P[:, 1] - ycor, lambda P: (sideways[0](P) > 0) & (sideways[1](P) > 0)))
        if share > 0:
            for s in ('r', 'l'):
                c, d = arm_point(ctx, s, 0.06)
                z = arm_zone(ctx, s)
                out.append((lambda P, c=c, d=d: (P - c) @ d.astype(np.float32), lambda P, z=z: z(P) < 0.02))
                out.append((lambda P, c=c: P[:, 1] - c[1] + 0.0, lambda P, z=z, c=c: (z(P) < 0) & (P[:, 2] < c[2] - 0.02)))
        hz = hem_z(ctx) + (rib or 0.0)
        out.append((lambda P: P[:, 2] - hz - 0.016 * ctx.s, lambda P: P[:, 2] < hz + 0.05))
        if placket:
            out.append((lambda P: np.abs(P[:, 0]) - 0.016 * ctx.s, lambda P: P[:, 1] > 0.02))
        if zip:
            out.append((lambda P: np.abs(P[:, 0]) - 0.012 * ctx.s, lambda P: P[:, 1] > 0.02))
        for pk in pockets:
            out.append(_pocket_seam(ctx, pk))
        return out

    parts = [Part(name, role, color, fabric, make, layer=layer, grid=grid, budget=budget, seams=seams,
                  details={'placket': placket, 'zip': zip, 'pockets': pockets, 'hem_z': hem_z, 'kind': 'top'})]
    if rib:
        rr, rc = rib_role or role, rib_color or color

        def make_rib(ctx):
            hz = hem_z(ctx)
            o = outer(ctx, 0.0, extra=0.0)
            body = ctx.body
            base = region(ctx)
            ease_r = 0.006 * ctx.s

            def outer_rib(P):
                return body(P) - ease_r - np.clip((P[:, 2] - hz) / max(rib, 1e-3), 0, 1) * ease * 0.6
            cuffs = [arm_point(ctx, s, share) for s in ('r', 'l')] if share > 0.9 else []
            nk = ctx.J['neck'][0]

            def reg(P):
                r_hem = np.maximum(hz - P[:, 2], P[:, 2] - (hz + rib))
                out = r_hem
                for c, d in cuffs:
                    t = (P - c) @ d.astype(np.float32)
                    out = np.minimum(out, np.maximum(t, -t - rib * 0.9))
                if neck in ('high', 'collar'):
                    dz = P[:, 2] - (nk[2] - 0.012 * ctx.s)
                    out = np.minimum(out, np.maximum(-dz, dz - 0.05 * ctx.s))
                return np.maximum(out, base(P) if False else out)
            nr = 0.066 * ctx.s

            def rib_outer(P):
                d = outer_rib(P)
                if neck in ('high', 'collar'):
                    dx, dy = P[:, 0], P[:, 1] - (nk[1] + 0.012 * ctx.s)
                    rad = np.sqrt(dx * dx + dy * dy)
                    tube = np.maximum(np.abs(rad - nr - 0.004 * ctx.s) - 0.0055 * ctx.s, np.abs(P[:, 2] - nk[2] - 0.012 * ctx.s) - 0.026 * ctx.s)
                    d = np.minimum(d, tube)
                return d
            return _shell(ctx, rib_outer, reg)
        parts.append(Part(name + '_rib', rr, rc, 'knit_rib', make_rib, layer=layer, grid=grid * 0.8, budget=budget * 0.25,
                          details={'kind': 'rib'}))
    parts.extend(extra_parts)
    return Garment(name, parts, wear)


def _pocket_seam(ctx, pk):
    """A patch pocket outline: pk = (centre (x, y, z) in metres for a 1.86 m person, half w, half h, facing axis)."""
    c, hw, hh, axis = pk
    c = np.asarray(c, np.float32) * ctx.s
    hw, hh = hw * ctx.s, hh * ctx.s

    def fn(P):
        q = P - c
        if axis == 'y':
            a, b = q[:, 0], q[:, 2]
        else:
            a, b = q[:, 1], q[:, 2]
        out = np.maximum(np.abs(a) - hw, np.abs(b) - hh)
        return out

    def zone(P):
        q = P - c
        facing = q[:, 1] if axis == 'y' else q[:, 0] * np.sign(c[0] + 1e-9)
        return facing > -0.05
    return fn, zone


def tshirt(color='#d9d5cc', sleeves='short', fabric='jersey', role=ROLE_TOP, neck='crew', fit=0.5, tucked=False, print_=None, wear=0.25):
    return _top('tshirt', color, fabric, role, sleeves, 0.006 + 0.01 * fit, 0.55 + 0.3 * fit, 0.28 if tucked else 0.06, neck,
                folds=0.003, wear=wear, budget=0.2)


def button_shirt(color='#e9e6df', sleeves='long', fabric='oxford', role=ROLE_TOP, fit=0.5, tucked=True, pocket=True, wear=0.2):
    pockets = [((0.07, 0.11, 1.38), 0.05, 0.06, 'y')] if pocket else []
    return _top('shirt', color, fabric, role, sleeves, 0.007 + 0.01 * fit, 0.5 + 0.3 * fit, 0.28 if tucked else 0.04, 'collar',
                placket=True, pockets=pockets, folds=0.004, wear=wear, budget=0.22)


def polo(color='#f0ede6', fabric='pique', role=ROLE_TOP, fit=0.5, tucked=True, wear=0.2):
    return _top('polo', color, 'jersey' if fabric == 'pique' else fabric, role, 'short', 0.007 + 0.008 * fit, 0.5 + 0.3 * fit,
                0.28 if tucked else 0.06, 'collar', placket=True, folds=0.003, wear=wear, budget=0.2)


def jacket(style='bomber', color='#bc9235', fabric=None, role=ROLE_JACKET, rib_color='#2b2b2e', rib_role=ROLE_TOP, wear=0.3):
    """style: 'bomber' (rib collar, cuffs and waistband), 'leather' (biker cut, hip length),
    'windbreaker' (light, loose, high collar)."""
    if style == 'bomber':
        return _top('bomber', color, fabric or 'nylon', role, 'long', 0.017, 0.85, 0.16, 'high', rib=0.055, rib_role=rib_role,
                    rib_color=rib_color, zip=True, folds=0.0065, layer=3, wear=wear, budget=0.3,
                    pockets=[((0.105, 0.105, 1.11), 0.055, 0.075, 'y'), ((-0.105, 0.105, 1.11), 0.055, 0.075, 'y')])
    if style == 'leather':
        return _top('leather_jacket', color, fabric or 'leather', role, 'long', 0.013, 0.65, 0.14, 'collar', zip=True, folds=0.005,
                    layer=3, wear=wear, budget=0.3)
    return _top('windbreaker', color, fabric or 'nylon', role, 'long', 0.02, 0.9, 0.12, 'high', folds=0.007, layer=3, zip=True,
                wear=wear, budget=0.3)


def hoodie(color='#5a5f66', role=ROLE_TOP, wear=0.3):
    return _top('hoodie', color, 'fleece', role, 'long', 0.016, 0.8, 0.12, 'crew', rib=0.05, folds=0.006, layer=3, wear=wear, budget=0.3,
                pockets=[((0.0, 0.12, 1.08), 0.11, 0.065, 'y')])


def vest(style='tactical', color='#26262b', role=ROLE_JACKET, pouches=3, wear=0.3):
    """A sleeveless outer layer: 'tactical' (plate carrier with pouches) or 'cloth' (waistcoat)."""
    g = _top('vest', color, 'canvas' if style == 'tactical' else 'wool', role, 'none', 0.03 if style == 'tactical' else 0.01,
             0.95, 0.2 if style == 'tactical' else 0.15, 'scoop', folds=0.0, layer=4, wear=wear, budget=0.14)
    if style == 'tactical' and pouches:
        def make_pouches(ctx):
            f = Field()
            s = ctx.s
            chest = ctx.J['chest'][0]
            for i in range(pouches):
                x = (i - (pouches - 1) / 2) * 0.075 * s
                f.add(Box((x, 0.165 * s, chest[2] - 0.02 * s), np.array([0.032, 0.022, 0.06]) * s, round=0.006 * s), 0.004)
            return f
        g.parts.append(Part('vest_pouches', role, color, 'canvas', make_pouches, layer=5, grid=0.003, budget=0.05,
                            details={'kind': 'pouch'}))
    return g


# --- bottoms ----------------------------------------------------------------------------------

def _bottom(name, color, fabric, role, length, ease, flare, waist, pockets=(), cargo=False, folds=0.004, budget=0.2, wear=0.3,
            belt_loops=True, grid=0.004, skirt=False):
    """length: share of the leg from the hip joint (0) to the ankle (1); waist: drop below the
    natural waist in metres (low-rise jeans 0.03)."""
    def waist_z(ctx):
        return ctx.J['hips'][0][2] + (0.05 - waist) * ctx.s

    def region(ctx):
        wz = waist_z(ctx)
        hem = [leg_point(ctx, s, length) for s in ('r', 'l')]

        def fn(P):
            r = P[:, 2] - wz - 0.012 * np.clip(-P[:, 1] / 0.1, -1, 1) * ctx.s   # a little higher at the back
            hz = hem[0][2] if not skirt else hem[0][2]
            r = np.maximum(r, hz - P[:, 2])
            return r
        return fn

    def outer(ctx):
        body = ctx.body
        hulls = []
        if not skirt:
            for s in ('r', 'l'):
                th = ctx.J['thigh_' + s][0]
                kn = leg_point(ctx, s, 0.5)
                an = leg_point(ctx, s, max(length, 0.05))
                hulls.append(RoundCone(th + np.array([0, -0.005, 0.02]) * ctx.s, kn, 0.088 * ctx.s * (1 + 0.15 * flare), 0.066 * ctx.s * (1 + 0.25 * flare)))
                if length > 0.5:
                    hulls.append(RoundCone(kn, an + np.array([0, 0, 0.01]), 0.066 * ctx.s * (1 + 0.25 * flare), 0.058 * ctx.s * (1 + 0.6 * flare)))
        else:
            wz = waist_z(ctx)
            hz = leg_point(ctx, 'r', length)[2]
            hw = ctx.torso_rows[1][2]
            rows = [(wz + 0.02, -0.01 * ctx.s, hw * 0.93, 0.105 * ctx.s, 2.2), (wz - 0.12 * ctx.s, -0.012 * ctx.s, hw + 0.012 * ctx.s, 0.125 * ctx.s, 2.3),
                    (hz, -0.01 * ctx.s, hw + (0.03 + 0.12 * flare) * ctx.s * (wz - hz) / 0.5, 0.13 * ctx.s + 0.08 * flare * ctx.s, 2.2)]
            hulls.append(Loft(rows))
        warps = []
        if folds > 0 and not skirt and length > 0.6:
            for s in ('r', 'l'):
                a = leg_point(ctx, s, 0.62)
                b_ = leg_point(ctx, s, length)
                warps.append(fold_warp(a, b_, 0.06 * ctx.s, folds, seed=0.7 if s == 'r' else 1.9))

        def fn(P):
            d = body(P) - ease
            for h in hulls:
                d = smin(d, h.dist(P), 0.03)
            for w in warps:
                d = d - w(P)
            return d
        return fn

    def make(ctx):
        return _shell(ctx, outer(ctx), region(ctx))

    def seams(ctx):
        out = []
        wz = waist_z(ctx)
        out.append((lambda P: P[:, 2] - wz + 0.04 * ctx.s, lambda P: np.abs(P[:, 2] - wz) < 0.06))   # waistband
        if not skirt:
            for s, sx in (('r', 1), ('l', -1)):
                th = ctx.J['thigh_' + s][0]
                out.append((lambda P, th=th: P[:, 1] - th[1] + 0.004, lambda P, sx=sx, th=th: (P[:, 0] * sx > th[0] * sx) & (P[:, 2] < wz - 0.03)))  # outseam
                out.append((lambda P, th=th: P[:, 1] - th[1], lambda P, sx=sx, th=th: (P[:, 0] * sx < th[0] * sx) & (P[:, 2] < wz - 0.12)))      # inseam
            out.append((lambda P: P[:, 0], lambda P: P[:, 2] > wz - 0.3 * ctx.s))                 # centre seam / fly
        hz = leg_point(ctx, 'r', length)[2]
        out.append((lambda P: P[:, 2] - hz - 0.02 * ctx.s, lambda P: P[:, 2] < hz + 0.05))
        for pk in pockets:
            out.append(_pocket_seam(ctx, pk))
        return out

    parts = [Part(name, role, color, fabric, make, layer=2, grid=grid, budget=budget, seams=seams,
                  details={'kind': 'bottom', 'waist_z': waist_z, 'cargo': cargo})]
    if cargo:
        def make_pockets(ctx):
            f = Field()
            s = ctx.s
            for sd, sx in (('r', 1), ('l', -1)):
                p = leg_point(ctx, sd, 0.36)
                c = p + np.array([sx * 0.082, -0.004, 0]) * s
                rot = frame_from((sx, 0.0, 0.0), (0, 1, 0))
                f.add(Box(c, np.array([0.06, 0.07, 0.008]) * s, rot, round=0.006 * s), 0.004)
                f.add(Box(c + np.array([sx * 0.006, 0, 0.065]) * s, np.array([0.064, 0.018, 0.006]) * s, rot, round=0.004 * s), 0.003)
            return f
        parts.append(Part(name + '_pockets', role, color, fabric, make_pockets, layer=2, grid=0.0028, budget=budget * 0.15,
                          details={'kind': 'pocket'}))
    return Garment(name, parts, wear)


def trousers(style='chinos', color='#3a3d40', role=ROLE_BOTTOM, wear=0.3):
    """style: 'chinos', 'jeans', 'cargo', 'suit', 'work'."""
    if style == 'jeans':
        return _bottom('jeans', color, 'denim', role, 0.985, 0.006, 0.15, 0.03, folds=0.004, wear=wear,
                       pockets=[((0.09, 0.1, 0.98), 0.045, 0.04, 'y'), ((-0.09, 0.1, 0.98), 0.045, 0.04, 'y')])
    if style == 'cargo':
        return _bottom('cargo', color, 'twill', role, 0.99, 0.012, 0.35, 0.02, cargo=True, folds=0.006, wear=wear)
    if style == 'suit':
        return _bottom('suit_trousers', color, 'wool', role, 0.99, 0.01, 0.25, 0.0, folds=0.003, wear=wear)
    return _bottom(style, color, 'twill' if style != 'work' else 'canvas', role, 0.99, 0.009, 0.25, 0.01, folds=0.004, wear=wear)


def shorts(color='#5f6b52', fabric='twill', role=ROLE_BOTTOM, length=0.42, wear=0.3):
    return _bottom('shorts', color, fabric, role, length, 0.01, 0.5, 0.02, folds=0.0, wear=wear, budget=0.14)


def skirt(color='#2c2c34', fabric='wool', role=ROLE_BOTTOM, length=0.55, flare=0.3, wear=0.2):
    return _bottom('skirt', color, fabric, role, length, 0.008, flare, 0.0, folds=0.0, wear=wear, skirt=True, budget=0.14)


def dress(color='#7a2e3a', fabric='cotton', role=ROLE_TOP, length=0.6, sleeves='short', neck='scoop', wear=0.2):
    top = _top('dress_top', color, fabric, role, sleeves, 0.006, 0.4, 0.2, neck, folds=0.002, wear=wear, budget=0.18)
    low = _bottom('dress_skirt', color, fabric, role, length, 0.008, 0.35, 0.06, folds=0.0, wear=wear, skirt=True, budget=0.12)
    return Garment('dress', top.parts + low.parts, wear)


# --- shoes ------------------------------------------------------------------------------------

def _shoe(name, color, fabric, role, height, toe_round, sole_color, sole_h, bulk, laces, budget=0.08, wear=0.35, open_=False):
    """height: shaft top above the ground (m, 1.86 m person); sole_h: sole thickness."""
    def make(ctx):
        f = Field()
        s = ctx.s
        for side, sx in (('r', 1), ('l', -1)):
            an, toe = ctx.J['foot_' + side][0], ctx.J['toe_' + side][0]
            tip = ctx.J['toe_' + side][1]
            heel = np.array([an[0], an[1] - 0.05 * s, 0.0])
            front = np.array([tip[0] - sx * 0.004, tip[1] + 0.012 * s * bulk, 0.0])
            # Sole: a flat slab following the footprint.
            mid = (heel + front) / 2
            L = np.linalg.norm(front - heel)
            rot = frame_from((0, 0, 1), (front - heel))
            f.add(Box(mid + np.array([sx * 0.003 * s, 0, sole_h * s / 2]), np.array([L / 2, 0.046 * s * bulk, sole_h * s / 2 * 0.8]), np.stack([rot[0], rot[1], rot[2]]),
                      round=0.007 * s), 0.0)
            if open_:
                continue
            # Upper: heel counter, vamp and toe box.
            f.add(Sphere(heel + np.array([0, 0.012 * s, 0.045 * s]), 0.040 * s * bulk ** 0.5), 0.02 * s)
            f.add(RoundCone(heel + np.array([0, 0.03 * s, 0.05 * s]), np.array([toe[0], toe[1], 0.032 * s]), 0.041 * s * bulk, 0.034 * s * bulk,
                            side=(1, 0, 0), squash=(1.3, 0.95)), 0.02 * s)
            f.add(Ellipsoid(np.array([front[0], front[1] - 0.034 * s, 0.03 * s * toe_round + 0.01 * s]),
                            np.array([0.038 * bulk, 0.045, 0.024 * toe_round + 0.008]) * s), 0.015 * s)
            f.add(RoundCone(an + np.array([0, 0.004 * s, -0.02 * s]), np.array([toe[0], toe[1] - 0.03 * s, 0.05 * s]), 0.04 * s * bulk, 0.034 * s * bulk), 0.02 * s)
            if height > 0.09:
                f.add(RoundCone(np.array([an[0], an[1] - 0.004 * s, 0.05 * s]), np.array([an[0], an[1] - 0.008 * s, height * s]),
                                0.05 * s * bulk ** 0.5, 0.047 * s), 0.02 * s)
        if not open_:
            # The foot opening: the leg passes through the shaft's top.
            for side in ('r', 'l'):
                kn, an = ctx.J['shin_' + side][0], ctx.J['foot_' + side][0]
                top_z = max(height, 0.085) * s
                cut_c = np.array([an[0], an[1] - 0.006 * s, top_z + 0.4])
                f.cut(RoundCone(np.array([an[0], an[1] - 0.006 * s, top_z + 0.002]), cut_c, 0.040 * s, 0.04 * s), 0.0)
        return f
    return Garment(name, [Part(name, role, color, fabric, make, layer=2, grid=0.003, budget=budget, shader='shoe',
                               details={'kind': 'shoe', 'sole_color': sole_color, 'sole_h': sole_h, 'laces': laces, 'height': height})], wear)


def work_boots(color='#4a3424', sole='#1d1a17', role=ROLE_SHOES, height=0.15, wear=0.4):
    return _shoe('boots', color, 'leather', role, height, 1.15, sole, 0.03, 1.08, True, wear=wear)


def sneakers(color='#ecebe6', sole='#f4f3ef', role=ROLE_SHOES, wear=0.25):
    return _shoe('sneakers', color, 'canvas', role, 0.075, 1.0, sole, 0.028, 1.04, True, wear=wear)


def dress_shoes(color='#1b1714', sole='#120f0d', role=ROLE_SHOES, wear=0.15):
    return _shoe('dress_shoes', color, 'leather', role, 0.07, 0.7, sole, 0.018, 0.98, True, wear=wear)


def sandals(color='#5b4632', sole='#2a2420', role=ROLE_SHOES, wear=0.3):
    g = _shoe('sandals', color, 'leather', role, 0.0, 1.0, sole, 0.02, 1.0, False, wear=wear, open_=True)

    def straps(ctx):
        f = Field()
        s = ctx.s
        for side in ('r', 'l'):
            an, toe = ctx.J['foot_' + side][0], ctx.J['toe_' + side][0]
            body = ctx.body
            mid = (an + toe) / 2
            f.add(Fn(lambda P, mid=mid: np.maximum(body(P) - 0.0035 * s, np.abs((P - mid) @ np.array([0, 1, 0.2], np.float32)) - 0.012 * s),
                     mid - 0.08, mid + 0.08), 0.0)
        return f
    g.parts.append(Part('sandal_straps', role, color, 'leather', straps, layer=3, grid=0.0025, budget=0.03, details={'kind': 'strap'}))
    return g


# --- head and kit -----------------------------------------------------------------------------

def cap(color='#2b2b2e', role='atlas', fabric='twill', brim=1.0, wear=0.3):
    """A baseball cap (crown and brim). A badge on the front: badge(..., at='cap')."""
    def make(ctx):
        hd = ctx.b['_head']
        S = hd['S']
        f = Field()
        body = ctx.body
        crown = S.p(0, -0.004, 0.044)

        def dome(P):
            d = body(P) - 0.01 * S.k
            return np.maximum(d, (S.p(0, 0, 0.035)[2] - P[:, 2]) - 0.25 * np.clip(P[:, 1] - crown[1], -1, 0))
        f.add(Fn(dome, crown - 0.15, crown + 0.15), 0.0)
        f.add(Ellipsoid(S.p(0, 0.105, 0.036), S.r(0.07, 0.075 * brim, 0.004), frame_from((0, -0.25, 1), (1, 0, 0))), 0.004)
        return f
    return Garment('cap', [Part('cap', role, color, fabric, make, layer=6, grid=0.003, budget=0.05, details={'kind': 'cap'})], wear)


def helmet(color='#26262b', role='atlas', wear=0.3):
    def make(ctx):
        S = ctx.b['_head']['S']
        f = Field()
        body = ctx.body
        c = S.p(0, -0.01, 0.04)

        def shell(P):
            return np.maximum(body(P) - 0.022 * S.k, (S.p(0, 0, 0.012)[2] - P[:, 2]) + 0.4 * np.clip(-(P[:, 1] - c[1]), 0, None) * 0)
        f.add(Fn(shell, c - 0.17, c + 0.17), 0.0)
        return f
    return Garment('helmet', [Part('helmet', role, color, 'polyester', make, layer=6, grid=0.003, budget=0.05, details={'kind': 'helmet'})], wear)


def belt(color='#3b2a1e', buckle='#b8b2a4', role='atlas', width=0.038, wear=0.3):
    def make(ctx):
        f = Field()
        body = ctx.body
        z = ctx.J['hips'][0][2] + 0.035 * ctx.s
        w = width * ctx.s

        def band(P):
            return np.maximum(body(P) - 0.016 * ctx.s, np.abs(P[:, 2] - z) - w / 2)
        f.add(Fn(band, (-0.3, -0.3, z - 0.05), (0.3, 0.3, z + 0.05)), 0.0)
        return f

    def make_buckle(ctx):
        f = Field()
        z = ctx.J['hips'][0][2] + 0.035 * ctx.s
        y = ctx.body.project(np.array([[0, 0.3, z]], np.float32), 4)[0][1]
        f.add(Box((0, y + 0.018 * ctx.s, z), np.array([0.027, 0.004, 0.022]) * ctx.s, round=0.003 * ctx.s), 0.0)
        return f
    return Garment('belt', [Part('belt', role, color, 'leather', make, layer=4, grid=0.0028, budget=0.03, hides=False, details={'kind': 'belt'}),
                            Part('buckle', 'atlas', buckle, 'metal', make_buckle, layer=5, grid=0.002, budget=0.01, hides=False,
                                 shader='metal', details={'kind': 'buckle'})], wear)


def gloves(color='#1c1c1e', role='atlas', fabric='leather'):
    """Gloves: the hands (relaxed and grip) are drawn in this material, grown by 1.5 mm."""
    g = Garment('gloves', [], 0.3)
    g.hands = {'role': role, 'color': color, 'fabric': fabric, 'ease': 0.0015}
    return g


def badge(shape='shield', color='#c9a24a', at='chest_l', size=0.06, accent='#1b2a41', role='atlas'):
    """An original badge or patch on the outermost garment: shape 'shield' | 'star' | 'circle' |
    'bar' | 'patch'; at 'chest_l' | 'chest_r' | 'arm_l' | 'arm_r' | 'back' | 'cap'. Drawn in the
    atlas (not recoloured): a metal badge is shiny, a patch embroidered."""
    def make(ctx):
        f = Field()
        c, n = badge_frame(ctx, at)
        outer = ctx.outer_field
        half = size * ctx.s / 2
        rot = frame_from(n, (0, 0, 1))
        hb, wb = (half * 0.35, half * 1.5) if shape == 'bar' else (half, half)

        def fn(P):
            q = (P - c) @ rot.T
            plate = np.abs(outer(P) - 0.002) - 0.0018
            if shape == 'circle':
                flat = np.sqrt(q[:, 0] ** 2 + q[:, 1] ** 2) - half
            elif shape == 'shield':
                y = q[:, 1]
                width = np.where(y > 0, half * 0.82, half * 0.82 * np.sqrt(np.clip(1 - (y / half) ** 2, 0, 1)) + 0.0)
                flat = np.maximum(np.abs(q[:, 0]) - width, np.abs(y) - half)
            elif shape == 'star':
                ang = np.arctan2(q[:, 1], q[:, 0])
                r = np.sqrt(q[:, 0] ** 2 + q[:, 1] ** 2)
                spike = half * (0.55 + 0.45 * np.abs(np.cos(2.5 * ang)) ** 3)
                flat = r - spike
            else:
                flat = np.maximum(np.abs(q[:, 0]) - wb, np.abs(q[:, 1]) - hb)
            return np.maximum(plate, flat)
        f.add(Fn(fn, c - size * 1.5, c + size * 1.5), 0.0)
        return f
    metal = shape in ('shield', 'star', 'bar')
    return Garment('badge_' + at, [Part('badge_' + at, role, color, 'metal' if metal else 'patch', make, layer=9, grid=0.0011, budget=0.01,
                                        hides=False, shader='badge', details={'kind': 'badge', 'shape': shape, 'accent': accent, 'at': at,
                                                                             'size': size, 'metal': metal})], 0.1)


def badge_frame(ctx, at):
    """Centre and outward normal of a badge spot on the outermost garment."""
    s = ctx.s
    chest = ctx.J['chest'][0]
    spots = {
        'chest_l': (np.array([-0.085 * s, 0.4, chest[2] + 0.07 * s]), (0, 1, 0)),
        'chest_r': (np.array([0.085 * s, 0.4, chest[2] + 0.07 * s]), (0, 1, 0)),
        'back': (np.array([0, -0.4, chest[2] + 0.06 * s]), (0, -1, 0)),
    }
    if at in ('arm_l', 'arm_r'):
        side = at[-1]
        p, d = arm_point(ctx, side, 0.18)
        out = np.cross(d, (0, 1, 0)) * (1 if side == 'r' else -1)
        out = normalize(out + np.array([0, 0.3, 0]))
        start = p + out * 0.3
        spots[at] = (start, tuple(out))
    if at == 'cap':
        S = ctx.b['_head']['S']
        spots[at] = (S.p(0, 0.4, 0.075), (0, 1, 0.3))
    start, direction = spots[at]
    direction = normalize(direction)
    # March from outside onto the outermost surface.
    P = np.asarray([start], np.float32)
    for _ in range(40):
        d = ctx.outer_field(P)
        P = P - np.asarray(direction, np.float32)[None] * d[:, None] * 0.9
    n = normalize(np.asarray(direction))
    return P[0], n
