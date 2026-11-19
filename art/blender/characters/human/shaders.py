"""Surface shaders for the texel baker: for points on a part (rest pose, metres) they return the
base colour MULTIPLIER (linear; the paint colour of the part's role multiplies it in the game, so
a recoloured person keeps every shade), roughness, metalness and a height function for the fine
relief that goes into the normal map. Atlas parts get their own colour multiplied in afterwards.

FABRICS lists what garments may name; each is (roughness, colour variation, relief kind).
"""
import math

import numpy as np

from . import hair as hairmod
from .noise import cells, fbm, smoothstep, value

FABRICS = {
    'jersey': (0.88, 0.05, 'knit'), 'cotton': (0.85, 0.05, 'plain'), 'oxford': (0.8, 0.05, 'basket'),
    'pique': (0.86, 0.05, 'knit'), 'denim': (0.82, 0.12, 'twill'), 'twill': (0.8, 0.06, 'twill'),
    'canvas': (0.85, 0.07, 'plain'), 'nylon': (0.5, 0.04, 'ripstop'), 'knit_rib': (0.9, 0.04, 'rib'),
    'fleece': (0.95, 0.05, 'fleece'), 'leather': (0.5, 0.1, 'leather'), 'suede': (0.9, 0.08, 'fleece'),
    'wool': (0.9, 0.06, 'plain'), 'rubber': (0.8, 0.03, 'plain'), 'mesh_nylon': (0.7, 0.04, 'ripstop'),
    'polyester': (0.6, 0.04, 'plain'), 'metal': (0.3, 0.05, 'plain'), 'patch': (0.85, 0.05, 'knit'),
}


def srgb_to_linear(hex_color):
    h = hex_color.lstrip('#')
    c = np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)])
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _tangents(N):
    a = np.where(np.abs(N[:, 2:3]) < 0.9, np.array([[0, 0, 1.0]]), np.array([[1.0, 0, 0]]))
    t = np.cross(N, a)
    t /= np.linalg.norm(t, axis=1, keepdims=True) + 1e-9
    return t, np.cross(N, t)


def perturb(P, N, height, eps=0.0004):
    """The normal tilted by the slope of height(P) (metres) along the surface."""
    if height is None:
        return N
    t, b = _tangents(N)
    h0 = height(P)
    h1 = height(P + t * eps)
    h2 = height(P + b * eps)
    n = N - t * ((h1 - h0) / eps)[:, None] - b * ((h2 - h0) / eps)[:, None]
    return n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-9)


# --- skin ------------------------------------------------------------------------------------

def skin(ctx, P, N, part):
    """Skin of the body and hands: tone variation, redness, pores, creases, lips, brows, stubble,
    the scalp under a fade, nails."""
    b = ctx.b
    n = len(P)
    hd = b['_head']
    S = hd['S']
    age = b['age']
    base = np.ones((n, 3), np.float32) * 0.93
    mott = fbm(P, 22.0, 3, seed=3) - 0.5
    fine = fbm(P, 160.0, 2, seed=5) - 0.5
    base *= (1.0 + 0.10 * mott + 0.05 * fine)[:, None]
    # Warmer, redder where blood is near the skin (applied as a per-channel multiplier).
    red = np.zeros(n, np.float32)
    tags = ctx.body_tags(P) if part.name == 'body' else np.array([''] * n)
    q = (P - S.o) / S.k
    in_head = (q[:, 2] > -0.16) & (np.abs(q[:, 0]) < 0.12)
    cheek = np.exp(-(((np.abs(q[:, 0]) - 0.04) / 0.02) ** 2 + ((q[:, 1] - 0.065) / 0.03) ** 2 + ((q[:, 2] + 0.02) / 0.02) ** 2))
    red += 0.5 * cheek * in_head
    for tag, amount in (('nose_tip', 0.4), ('ala', 0.5), ('ear', 0.45), ('helix', 0.5), ('lobe', 0.5), ('antihelix', 0.4),
                        ('knuckle', 0.4), ('elbow', 0.3), ('patella', 0.3), ('finger_joint', 0.3)):
        red += amount * (tags == tag)
    redness = np.stack([np.ones(n), 1 - 0.07 * red, 1 - 0.09 * red], axis=1)
    base *= redness
    rough = np.full(n, 0.6, np.float32) + 0.08 * (fbm(P, 30.0, 2, seed=8) - 0.5)
    # T-zone sheen.
    tzone = np.exp(-((q[:, 0] / 0.02) ** 2 + ((q[:, 2] - 0.04) / 0.05) ** 2)) * (q[:, 1] > 0.06)
    rough -= 0.1 * tzone * in_head
    # Lips.
    lips = np.isin(tags, ('lip_upper', 'lip_lower'))
    mouth = (P - hd['mouth']) / S.k
    lipmask = lips & (np.abs(mouth[:, 0]) < 0.027) & (np.abs(mouth[:, 2]) < 0.017)
    lipmask = lipmask.astype(np.float32)
    lip_col = np.array(b.get('lip_tint', (0.80, 0.66, 0.68)), np.float32)
    base = base * (1 - lipmask[:, None]) + base * lip_col[None] * lipmask[:, None]
    rough -= 0.15 * lipmask
    # Brows: hair strokes along an arc above each eye.
    brow_k = b.get('brows', {}).get('thickness', 1.0)
    bx = np.abs(q[:, 0])
    arc = 0.031 + 0.006 * np.sin(np.clip((bx - 0.008) / 0.048, 0, 1) * math.pi * 0.9) * b.get('brows', {}).get('arch', 0.5) * 2
    width = (0.0045 + 0.003 * (1 - np.clip((bx - 0.012) / 0.04, 0, 1))) * brow_k
    brow = np.exp(-((q[:, 2] - arc) / width) ** 4) * smoothstep(0.006, 0.013, bx) * (1 - smoothstep(0.05, 0.058, bx)) * (q[:, 1] > 0.05) * in_head
    strokes = value(np.stack([P[:, 0] * 0.3, P[:, 1], P[:, 2] * 3.0], 1), 900.0, seed=11)
    brow_d = brow * (0.55 + 0.45 * strokes)
    base *= (1 - 0.75 * np.clip(brow_d, 0, 1))[:, None]
    # Beard shadow and stubble.
    beard = b.get('_beard', {})
    style = beard.get('style', 'none')
    if style != 'none':
        cover = ctx.beard_cover(P) if ctx.beard_cover else np.zeros(n)
        dots = cells(P, 2400.0, seed=21)
        stub = (1 - smoothstep(0.15, 0.45, dots))
        dark = 0.45 if style != 'stubble' else 0.35
        base *= (1 - cover * (dark * 0.6 + dark * 0.6 * stub))[:, None].clip(0.15, 1)
    # Scalp under a fade, a shaved head's shadow.
    hstyle = b.get('_hair', {}).get('style', 'short')
    if hstyle != 'bald':
        cov = hairmod.coverage(S, P, b.get('_hair', {}).get('recede', 0.0)) * in_head
        dots = cells(P, 2600.0, seed=31)
        follicles = 1 - smoothstep(0.12, 0.42, dots)
        shade = 0.55 + 0.25 * follicles
        base *= (1 - cov * shade)[:, None].clip(0.12, 1)
        rough += 0.25 * cov
    # Eyelids a touch darker, the inner corner pinker.
    for E in hd['eyes']:
        e = np.linalg.norm(P - E, axis=1) / S.k
        rim = np.exp(-((e - 0.016) / 0.004) ** 2) * (np.abs(q[:, 0]) < 0.06)
        base *= (1 - 0.18 * rim)[:, None]
    # Palms and soles lighter (as far as a multiplier allows), nails glossy.
    if part.name.startswith('hand'):
        F = ctx.hand_frame
        loc = F.local(P * np.array([1 if part.side == 'r' else -1, 1, 1]))
        palm = smoothstep(0.0, -0.01, loc[:, 2])
        base = base * (1 - palm[:, None] * 0.0) + palm[:, None] * 0.07
        nails = ctx.nail_mask(P, part)
        base = base * (1 - nails[:, None]) + nails[:, None] * np.array([[0.98, 0.9, 0.88]])
        rough = rough * (1 - nails) + 0.28 * nails
    base = np.clip(base, 0.02, 1.0)

    wrinkle = max(0.0, (age - 25) / 40.0)

    def height(X):
        pores = cells(X, 1500.0, seed=41)
        h = -0.00003 * (1 - smoothstep(0.05, 0.35, pores))
        h += 0.00004 * (fbm(X, 300.0, 2, seed=43) - 0.5)
        qq = (X - S.o) / S.k
        if wrinkle > 0:
            fore = np.exp(-((qq[:, 2] - 0.06) / 0.022) ** 2) * (qq[:, 1] > 0.05)
            h -= wrinkle * 0.00012 * fore * np.abs(np.sin(qq[:, 2] * 2 * math.pi / 0.0075))
        # Vertical lines on the lips.
        lm = (X - hd['mouth']) / S.k
        onlip = (np.abs(lm[:, 0]) < 0.024) & (np.abs(lm[:, 2]) < 0.012) & (lm[:, 1] > -0.01)
        h -= 0.00005 * onlip * np.abs(np.sin(lm[:, 0] * 2 * math.pi / 0.0016))
        return h
    return {'base': base, 'rough': np.clip(rough, 0.25, 0.85), 'metal': np.zeros(n, np.float32), 'height': height}


# --- fabric ----------------------------------------------------------------------------------

def _seam_relief(ctx, part, X, groove_w=0.0011):
    """Seam grooves with stitch dashes: height and a 0..1 mask of the stitch line."""
    h = np.zeros(len(X), np.float32)
    mask = np.zeros(len(X), np.float32)
    for fn, zone in ctx.seams_of(part):
        d = np.abs(fn(X))
        z = zone(X).astype(np.float32)
        g = np.exp(-(d / groove_w) ** 2) * z
        h -= 0.0006 * g
        # Two rows of stitches 3 mm either side of the seam.
        rows = np.exp(-((d - 0.003) / 0.0006) ** 2) * z
        dash = (np.sin((X[:, 0] + X[:, 1] * 1.3 + X[:, 2] * 1.7) * 2 * math.pi / 0.0032) > 0.1).astype(np.float32)
        h += 0.00018 * rows * dash
        mask = np.maximum(mask, np.maximum(g, rows * dash * 0.6))
    return h, mask


def _weave(kind, X, N):
    if kind == 'twill':
        return 0.00005 * np.sin((X[:, 0] + X[:, 2] + X[:, 1]) * 2 * math.pi / 0.0012)
    if kind == 'knit':
        return 0.00004 * (fbm(X, 700.0, 1, seed=51) - 0.5)
    if kind == 'basket':
        return 0.00004 * np.sin(X[:, 0] * 2 * math.pi / 0.001) * np.sin(X[:, 2] * 2 * math.pi / 0.001)
    if kind == 'ripstop':
        a = np.abs(np.sin(X[:, 0] * math.pi / 0.006)) ** 30 + np.abs(np.sin(X[:, 2] * math.pi / 0.006)) ** 30
        return 0.00003 * a
    if kind == 'leather':
        c = cells(X, 900.0, seed=53)
        return 0.00008 * smoothstep(0.1, 0.6, c) + 0.00006 * (fbm(X, 80.0, 3, seed=54) - 0.5)
    if kind == 'fleece':
        return 0.00006 * (fbm(X, 500.0, 2, seed=55) - 0.5)
    return 0.00003 * (fbm(X, 600.0, 1, seed=56) - 0.5)


def fabric(ctx, P, N, part):
    n = len(P)
    rough0, var, relief = FABRICS.get(part.fabric, FABRICS['cotton'])
    wear = part.details.get('wear', 0.3)
    base = np.ones((n, 3), np.float32) * 0.92
    broad = fbm(P, 8.0, 3, seed=61) - 0.5
    slub = fbm(np.stack([P[:, 0] * 6, P[:, 1] * 6, P[:, 2] * 0.6], 1), 40.0, 2, seed=62) - 0.5
    base *= (1 + var * broad + 0.5 * var * slub)[:, None]
    rough = np.full(n, rough0, np.float32) + 0.06 * broad
    metal = np.zeros(n, np.float32)
    kind = part.details.get('kind')
    if part.fabric == 'denim':
        # Fades on the thighs' fronts and the knees, darker creases at the hips.
        fade = smoothstep(0.0, 0.08, P[:, 1]) * (fbm(P, 6.0, 3, seed=63))
        base = base * (0.84 + 0.18 * fade[:, None])
    if part.fabric == 'nylon':
        sheen = fbm(P, 4.0, 2, seed=64)
        rough = rough - 0.1 * sheen
    if part.fabric == 'leather':
        edge = fbm(P, 30.0, 3, seed=65)
        base *= (0.85 + 0.25 * edge * wear)[:, None]
    # Seams darken a little in the groove.
    sh, smask = _seam_relief(ctx, part, P)
    base *= (1 - 0.18 * smask)[:, None]
    # Dirt low on trousers and shoes, grime at cuffs.
    if kind in ('bottom', 'pocket'):
        low = 1 - smoothstep(0.05, 0.45, P[:, 2])
        base *= (1 - 0.18 * wear * low * fbm(P, 12.0, 3, seed=66))[:, None]
    # The inside of a hem or cuff (the cut face of the shell) is in shadow.
    inside = ctx.inside_mask(part, P)
    base *= (1 - 0.72 * inside)[:, None]
    rough = np.clip(rough + 0.1 * inside, 0.2, 1.0)
    if kind == 'rib':
        coord = ctx.rib_coord(P)
        ribs = np.abs(np.sin(coord * math.pi / 0.0032))
        base *= (0.84 + 0.16 * ribs)[:, None]

    def height(X):
        h, _ = _seam_relief(ctx, part, X)
        h += _weave(relief, X, None)
        if kind == 'rib':
            h += 0.0004 * np.abs(np.sin(ctx.rib_coord(X) * math.pi / 0.0032))
        # Small creases everywhere (cloth is never perfectly smooth).
        h += 0.0003 * (fbm(np.stack([X[:, 0] * 1.5, X[:, 1] * 1.5, X[:, 2] * 0.5], 1), 45.0, 2, seed=67) - 0.5)
        return h
    return {'base': np.clip(base, 0.02, 1.0), 'rough': np.clip(rough, 0.2, 1.0), 'metal': metal, 'height': height}


def shoe(ctx, P, N, part):
    out = fabric(ctx, P, N, part)
    d = part.details
    sole_h = d.get('sole_h', 0.03) * ctx.s
    sole = smoothstep(sole_h + 0.002, sole_h - 0.002, P[:, 2])
    tint = srgb_to_linear(part.color)
    sole_lin = srgb_to_linear(d.get('sole_color', '#1a1a1a'))
    lum = np.array([0.2126, 0.7152, 0.0722])
    mult = np.full(3, np.clip(float(sole_lin @ lum) / max(float(tint @ lum), 1e-4), 0.02, 1.0))
    out['base'] = out['base'] * (1 - sole[:, None]) + mult[None] * (0.9 + 0.1 * fbm(P, 50.0, 2, seed=71))[:, None] * sole[:, None]
    out['rough'] = out['rough'] * (1 - sole) + 0.85 * sole
    # Welt stitching just above the sole, laces on the instep.
    welt = np.exp(-((P[:, 2] - sole_h - 0.004) / 0.0012) ** 2)
    out['base'] *= (1 - 0.25 * welt)[:, None]
    if d.get('laces'):
        lace = ctx.lace_mask(P)
        out['base'] *= (1 - 0.35 * lace)[:, None]
    inner = out['height']

    def height(X):
        h = inner(X)
        h += 0.0003 * np.exp(-((X[:, 2] - sole_h) / 0.0015) ** 2)
        if d.get('laces'):
            h += 0.0012 * ctx.lace_mask(X)
        # Tread on the sole's side.
        h -= 0.0004 * (X[:, 2] < sole_h * 0.7) * (np.sin(X[:, 1] * 2 * math.pi / 0.006) > 0.3)
        return h
    out['height'] = height
    return out


# --- hair ------------------------------------------------------------------------------------

def hair(ctx, P, N, part):
    n = len(P)
    tex = part.details.get('texture', 'coily')
    base = np.ones((n, 3), np.float32) * 0.9
    if tex in ('coily', 'curly'):
        scale = 520.0 if tex == 'coily' else 300.0
        c = cells(P, scale, seed=81)
        clump = 1 - smoothstep(0.2, 0.8, c)
        base *= (0.55 + 0.45 * clump)[:, None]
        rough = np.full(n, 0.62, np.float32)
    else:
        streak = fbm(np.stack([P[:, 0] * 8, P[:, 1] * 8, P[:, 2] * 0.5], 1), 60.0, 3, seed=82)
        base *= (0.6 + 0.4 * streak)[:, None]
        rough = np.full(n, 0.42, np.float32)
    base *= (0.85 + 0.3 * (fbm(P, 30.0, 2, seed=83) - 0.5))[:, None]

    def height(X):
        if tex in ('coily', 'curly'):
            c = cells(X, 520.0 if tex == 'coily' else 300.0, seed=81)
            return 0.0006 * (1 - smoothstep(0.2, 0.9, c)) + 0.0003 * (fbm(X, 140.0, 2, seed=84) - 0.5)
        return 0.0003 * fbm(np.stack([X[:, 0] * 8, X[:, 1] * 8, X[:, 2] * 0.5], 1), 60.0, 3, seed=82)
    return {'base': np.clip(base, 0.02, 1), 'rough': rough, 'metal': np.zeros(n, np.float32), 'height': height}


def metal(ctx, P, N, part):
    n = len(P)
    base = np.ones((n, 3), np.float32) * (0.9 + 0.1 * fbm(P, 200.0, 2, seed=91))[:, None]
    return {'base': base, 'rough': np.full(n, 0.32, np.float32), 'metal': np.ones(n, np.float32),
            'height': lambda X: 0.00004 * (fbm(X, 400.0, 2, seed=92) - 0.5)}


def badge(ctx, P, N, part):
    """An original emblem: a star in a ring over the badge's own shape; patches embroidered."""
    d = part.details
    n = len(P)
    c, nrm = ctx.badge_frames[part.name]
    from .sdf import frame_from
    R = frame_from(nrm, (0, 0, 1))
    q = (P - c) @ R.T
    r = np.sqrt(q[:, 0] ** 2 + q[:, 1] ** 2) / (d['size'] * ctx.s / 2)
    ang = np.arctan2(q[:, 1], q[:, 0])
    star = r - (0.28 + 0.2 * np.abs(np.cos(2.5 * (ang - math.pi / 2))) ** 4)
    ring = np.abs(r - 0.62) - 0.05
    emblem = (star < 0) | (ring < 0)
    accent = srgb_to_linear(d.get('accent', '#1b2a41'))
    main = np.ones(3)
    base = np.where(emblem[:, None], main[None], np.clip(accent / np.maximum(srgb_to_linear(part.color), 1e-3), 0, 1)[None] * (0.95 if d['metal'] else 1.0))
    base = base.astype(np.float32)
    rough = np.where(emblem, 0.25 if d['metal'] else 0.8, 0.45 if d['metal'] else 0.85).astype(np.float32)
    metal_ = np.full(n, 1.0 if d['metal'] else 0.0, np.float32) * np.where(emblem, 1.0, 0.6)

    def height(X):
        qq = (X - c) @ R.T
        rr = np.sqrt(qq[:, 0] ** 2 + qq[:, 1] ** 2) / (d['size'] * ctx.s / 2)
        aa = np.arctan2(qq[:, 1], qq[:, 0])
        st = rr - (0.28 + 0.2 * np.abs(np.cos(2.5 * (aa - math.pi / 2))) ** 4)
        rg = np.abs(rr - 0.62) - 0.05
        return 0.0004 * ((st < 0) | (rg < 0)).astype(np.float32)
    return {'base': base, 'rough': rough, 'metal': metal_, 'height': height}


def eye(ctx, P, N, part):
    """Eyeballs: sclera, iris with a limbal ring and fibres, pupil; glossy."""
    hd = ctx.b['_head']
    n = len(P)
    E = np.array(hd['eyes'])
    which = np.argmin(np.stack([np.linalg.norm(P - e, axis=1) for e in E], 1), axis=1)
    centre = E[which]
    v = P - centre
    v /= np.linalg.norm(v, axis=1, keepdims=True) + 1e-9
    look = np.stack([np.where(which == 0, -0.035, 0.035), np.ones(n), np.zeros(n) - 0.02], 1)
    look /= np.linalg.norm(look, axis=1, keepdims=True)
    cosang = np.sum(v * look, axis=1)
    ang = np.degrees(np.arccos(np.clip(cosang, -1, 1)))
    iris_col = srgb_to_linear(ctx.b.get('eye_color', '#3b2416'))
    sclera = np.array([0.80, 0.77, 0.72])
    base = np.tile(sclera, (n, 1)).astype(np.float32)
    veins = fbm(P, 900.0, 2, seed=101)
    base *= (1 - 0.15 * smoothstep(25, 60, ang) * veins)[:, None] * np.array([[1, 0.9, 0.88]])
    iris = ang < 30
    fib = 0.75 + 0.35 * value(np.stack([np.arctan2(v[:, 2], v[:, 0]) * 0.02, ang * 0.0005, P[:, 1]], 1), 400.0, seed=102)
    base = np.where(iris[:, None], iris_col[None] * fib[:, None] * np.clip(1.2 - 0.5 * smoothstep(20, 30, ang), 0.3, 1)[:, None], base)
    pupil = ang < 11
    base = np.where(pupil[:, None], 0.01, base)
    # Fade the sclera into shadow under the lids.
    rough = np.where(ang < 34, 0.06, 0.18).astype(np.float32)

    def height(X):
        return np.zeros(len(X), np.float32)
    return {'base': np.clip(base, 0.005, 1).astype(np.float32), 'rough': rough, 'metal': np.zeros(n, np.float32), 'height': height}


SHADERS = {'skin': skin, 'fabric': fabric, 'shoe': shoe, 'hair': hair, 'metal': metal, 'badge': badge, 'eye': eye}
