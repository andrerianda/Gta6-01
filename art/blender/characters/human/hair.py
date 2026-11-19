"""Hair styles and beards: sculpted volumes over the scalp and jaw (drawn with paint_hair, strand
and coil detail baked into the textures), plus what the skin texture shows (a fade's stubble,
the brows, a shadow of beard).

HAIR = {'style': ..., 'color': '#rrggbb', 'length': 1.0 (thickness multiplier), 'part': 0 (side
parting, -1..1), 'texture': 'straight' | 'wavy' | 'curly' | 'coily'}
Styles: bald, buzz, crop, short, slicked, afro_fade, afro, curly_top, bob, long, ponytail, bun.
BEARD = {'style': 'none' | 'stubble' | 'short' | 'full' | 'goatee' | 'moustache', 'color': ...}
BROWS = {'thickness': 1.0, 'arch': 0.5}
"""
import math

import numpy as np

from .sdf import Ellipsoid, Field, Fn, RoundCone, Sphere, smin, smax

STYLES = {
    # top thickness, side thickness, back thickness, fade height (head space z where the sides
    # start: None for no fade), texture default
    'bald': None,
    'buzz': (0.0025, 0.0022, 0.0022, None, 'straight'),
    'crop': (0.008, 0.004, 0.005, None, 'straight'),
    'short': (0.014, 0.007, 0.008, None, 'wavy'),
    'slicked': (0.010, 0.006, 0.008, None, 'straight'),
    'afro_fade': (0.021, 0.0, 0.0, 0.052, 'coily'),
    'afro': (0.045, 0.040, 0.040, None, 'coily'),
    'curly_top': (0.026, 0.006, 0.006, 0.040, 'curly'),
    'bob': (0.012, 0.012, 0.012, None, 'straight'),
    'long': (0.012, 0.010, 0.012, None, 'straight'),
    'ponytail': (0.007, 0.005, 0.006, None, 'straight'),
    'bun': (0.007, 0.005, 0.006, None, 'straight'),
}

# Hairline height (head space z) by azimuth round the head (0 front, 90 side, 180 back).
HAIRLINE = ((0, 0.088), (25, 0.084), (45, 0.066), (70, 0.046), (88, 0.034), (100, 0.004), (125, 0.010), (150, -0.035), (180, -0.058))


def hairline(az_deg):
    a = np.abs(az_deg)
    xs, ys = zip(*HAIRLINE)
    return np.interp(a, xs, ys)


def head_local(S, P):
    q = (P - S.o) / S.k
    az = np.degrees(np.arctan2(q[:, 0], q[:, 1]))
    return q, az


def coverage(S, P, recede=0.0):
    """0..1: how much of the scalp at P is under the hairline (soft over 6 mm)."""
    q, az = head_local(S, P)
    line = hairline(az) + recede * np.clip(1 - np.abs(az) / 60, 0, 1)
    # Sideburns: a strip in front of the ear down to the ear's middle.
    burn = np.exp(-((np.abs(az) - 98) / 6) ** 2) * (q[:, 2] > -0.012)
    return np.clip((q[:, 2] - line) / 0.006 + 0.5, 0, 1) * (q[:, 2] > -0.075) + burn * (q[:, 2] <= line) * 0.0


def hair_parts(ctx, hair):
    """[(name, Field, details)] for the hair style (empty for bald / texture-only styles)."""
    style = hair.get('style', 'short')
    spec = STYLES.get(style)
    if spec is None:
        return []
    top, side, back, fade, tex = spec
    k = hair.get('length', 1.0)
    S = ctx.b['_head']['S']
    body = ctx.body
    centre = S.p(0, -0.01, 0.03)

    def thickness(P):
        q, az = head_local(S, P)
        cov = coverage(S, P, hair.get('recede', 0.0))
        up = np.clip((q[:, 2] - 0.03) / 0.07, 0, 1)                         # 0 at the ears, 1 on top
        around = np.abs(az) / 180.0
        t = top * up + (side * (1 - around) + back * around) * (1 - up)
        if fade is not None:
            # A clean fade line: full hair above it (rounding off over 2 cm), none below.
            up_f = np.clip((q[:, 2] - fade) / 0.022, 0, 1)
            t = top * (0.35 + 0.65 * up_f ** 0.6) * (q[:, 2] > fade) * (1 + 0.12 * np.clip(q[:, 1] / 0.06, -1, 1))
        t = np.where(cov > 0.5, np.maximum(t, 0.0025 * (t > 0)), 0.0)
        return t * k * S.k

    extras = []
    if style == 'bob':
        extras.append(lambda P: _drape(S, P, -0.075, 0.088))
    if style == 'long':
        extras.append(lambda P: _drape(S, P, -0.21, 0.09))
    if style == 'ponytail':
        a = S.p(0, -0.105, 0.035)
        extras.append(RoundCone(a, S.p(0, -0.135, -0.13), S.l(0.020), S.l(0.012)).dist)
        extras.append(Sphere(a, S.l(0.018)).dist)
    if style == 'bun':
        extras.append(Ellipsoid(S.p(0, -0.085, 0.085), S.r(0.034, 0.03, 0.03)).dist)
    if style == 'afro':
        extras.append(Ellipsoid(S.p(0, -0.01, 0.055), S.r(0.12, 0.135, 0.11)).dist)

    def fn(P):
        t = thickness(P)
        d = body(P) - np.maximum(t, 0.0)
        d = np.where(t > 0.0006 * S.k, d, np.maximum(d, 0.0006))       # no shell where there is no hair
        for e in extras:
            d = smin(d, e(P), 0.012 * S.k)
        # Never in front of the face or below the jaw line at the front.
        q, az = head_local(S, P)
        face = np.minimum(q[:, 1] - 0.03, 0.07 - q[:, 2])
        d = np.maximum(d, np.where(np.abs(az) < 75, -face * S.k, -1.0))
        return d
    f = Field()
    lo = centre - 0.3
    hi = centre + 0.3
    f.add(Fn(fn, lo, hi))
    return [('hair', f, {'kind': 'hair', 'texture': hair.get('texture', tex), 'style': style, 'fade': fade})]


def _drape(S, P, bottom, radius):
    """Hair hanging straight down round the head to bottom (head-space z)."""
    q = (P - S.o) / S.k
    c = np.array([0, -0.012, 0])
    r = np.sqrt((q[:, 0] / 1.0) ** 2 + ((q[:, 1] - c[1]) / 1.08) ** 2)
    side = r - radius
    top = np.maximum(bottom - q[:, 2], q[:, 2] - 0.1)
    front = 0.035 - q[:, 1]      # open in front of the face
    d = np.maximum(np.maximum(side, top), -front)
    return d * S.k


def beard_cover(S, hd, beard, P):
    """0..1 where the skin carries beard (stubble shadow, or the skin under a beard volume)."""
    style = beard.get('style', 'none')
    if style == 'none':
        return np.zeros(len(P), np.float32)
    q, az = head_local(S, P)
    mouth = (hd['mouth'] - S.o) / S.k
    # The cheek line runs from the sideburn down to beside the mouth corner.
    cheek_line = np.interp(np.abs(q[:, 0]), (0.0, 0.028, 0.040, 0.052, 0.064, 0.09), (-0.05, -0.05, -0.040, -0.026, -0.004, 0.004))
    soft = np.clip((cheek_line - q[:, 2]) / 0.006, 0, 1) * np.clip((q[:, 1] + 0.012) / 0.008, 0, 1)
    soft *= np.clip((q[:, 2] + 0.122) / 0.01, 0, 1) if style != 'stubble' else np.clip((q[:, 2] + 0.135) / 0.02, 0, 1)
    if style == 'goatee':
        soft *= np.clip((0.026 - np.abs(q[:, 0])) / 0.004, 0, 1)
    if style == 'moustache':
        soft *= 0
    mous = (np.clip((0.03 - np.abs(q[:, 0])) / 0.004, 0, 1) * np.clip((q[:, 2] - mouth[2] - 0.002) / 0.002, 0, 1)
            * np.clip((mouth[2] + 0.019 - q[:, 2]) / 0.003, 0, 1) * (q[:, 1] > 0.065))
    lips = ((q[:, 0] / 0.027) ** 2 + ((q[:, 2] - mouth[2]) / 0.0105) ** 2) < 1.0
    out = np.maximum(soft, mous) * ~(lips & (q[:, 1] > 0.06))
    return out.astype(np.float32)


def beard_part(ctx, beard):
    style = beard.get('style', 'none')
    if style in ('none', 'stubble'):
        return []
    S = ctx.b['_head']['S']
    hd = ctx.b['_head']
    body = ctx.body
    depth = {'short': 0.0032, 'full': 0.012, 'goatee': 0.005, 'moustache': 0.0035}[style] * beard.get('length', 1.0)
    def fn(P):
        cover = beard_cover(S, hd, beard, P)
        t = depth * S.k * np.clip(cover * 1.6 - 0.3, 0, 1) ** 0.7
        d = body(P) - t
        return np.where(t > 0.0008 * S.k, d, np.maximum(d, 0.0005))
    f = Field()
    c = S.p(0, 0.04, -0.06)
    f.add(Fn(fn, c - 0.14, c + 0.14))
    return [('beard', f, {'kind': 'beard', 'texture': 'coily' if beard.get('coily', True) else 'curly', 'style': style})]
