"""Hair of the people (the body artist's side of the split: head, neck, skin and hair).

crop(figure, color): a barber's short crop for tightly curled hair (Dez's 'afro_short'): about
16 mm on the top, a taper to 3-4 mm over the sides and the nape, a clumped silhouette (two
scales of plane waves, a few millimetres), a lined-up hairline at the forehead and the temples
and a soft fade into the skin at the nape. The shell is the skull's (and the neck's) own forms
swollen a little, pushed out to the cut's length along its normals, so the hair follows the
head and is never a helmet of even depth. Its material is _wardrobe.hair_material (coils).

hairline_shadow(figure, points, masks, style): the darkened scalp under and below short hair
(the brows channel of the skin's mask): crisp at the front, a long stippled fade at the nape.
"""
import numpy as np

import _figure as G
import _forms as F
import _wardrobe as W
from lib import scene

TOP = 0.016          # the length on the crown
SIDE = 0.0035        # the length over the sides and the nape
EASE = 0.003         # the shell's swell over the skull before it is pushed out

# The crop's nape is cut lower than _wardrobe.HAIRLINE (a tapered nape, not a ledge).
NAPE_Y = (-0.120, -0.060, -0.030, 0.000)
NAPE_DROP = (0.014, 0.014, 0.004, 0.000)


def crop_line(local):
    """The crop's hairline (head space): _wardrobe's line with the nape taken lower."""
    return W.hairline(local) - np.interp(local[:, 1], NAPE_Y, NAPE_DROP)


def clumps(local, seed=17):
    """A clumped surface: plane waves at about 22 mm and 9 mm in fixed random directions, as
    -1..1 per point (head space, metres of the reference head)."""
    rng = np.random.default_rng(seed)
    total = np.zeros(len(local))
    for wavelength, weight, count in ((0.022, 0.70, 6), (0.009, 0.30, 7)):
        directions = rng.normal(size=(count, 3))
        directions /= np.linalg.norm(directions, axis=1, keepdims=True)
        phases = rng.uniform(0.0, np.pi * 2.0, count)
        waves = np.sin(local @ directions.T * (np.pi * 2.0 / wavelength) + phases)
        total += weight * waves.sum(axis=1) / np.sqrt(count / 2.0)
    return np.clip(total, -1.5, 1.5) / 1.5


def crop(figure, color):
    soup, side = F.Soup(), F.Soup()
    figure._skull(soup, side, EASE)
    figure._neck(soup, side, EASE)
    G.absorb(soup, side, mirror=True)
    obj = soup.union('hair', voxel=0.003, relax_steps=4, strength=0.5)
    points, normals = F.positions(obj), F.normals(obj)
    local = figure.to_head(points)
    above = local[:, 2] - crop_line(local)
    # Full on the crown and a little shorter towards the forehead; the taper starts above the
    # temples (the parietal ridge), so the sides and nape lie close.
    crown = F.smoothstep(0.140, 0.200, local[:, 2]) * (1.0 - 0.30 * F.smoothstep(0.04, 0.10, local[:, 1]))
    length = SIDE + (TOP - SIDE) * crown
    # How far above the hairline the hair reaches its length: 4 mm at the forehead (a lined-up
    # edge), 2-2.6 cm at the nape (a fade).
    reach = np.interp(local[:, 1], (-0.12, -0.03, 0.0, 0.03), (0.026, 0.020, 0.008, 0.004))
    grow = F.smoothstep(0.0, reach, above)
    lumps = clumps(local) * (0.0030 * crown + 0.0006 * (1.0 - crown))
    height = 0.0009 + (length - 0.0009) * grow + lumps * grow
    # Below the hairline the shell sinks under the skin (a soft end at the nape, where the
    # scalp's shadow carries the fade); at the front it is cut at the line itself.
    height = np.where(above < 0.0, 0.0009 + above * 0.45, height)
    points += normals * (height - EASE)[:, None]
    F.set_positions(obj, points)
    cut = np.interp(local[:, 1], (-0.03, 0.0), (-0.006, -0.0005))
    F.delete_vertices(obj, above < cut)
    F.drop_small_islands(obj)
    W.blank_mask(obj)
    scene.set_material(obj, W.hair_material(color, seed=7))
    return W.Piece(obj, 800)


LOCKS = {
    # style: (depth of the locks in metres, how far they run along the hair's fall)
    'short': (0.0012, 2.5), 'bob': (0.0018, 4.0), 'bun': (0.0008, 3.0), 'ponytail': (0.0008, 3.0),
}


def locks(local, grown, style):
    """A relief of locks for the straight styles (_outfits.hair): the clump waves stretched
    along the way the hair falls (back over the crown, down the sides), a millimetre or two
    deep, none at the hairline. Added to the shell's push along its normals."""
    depth, stretch = LOCKS.get(style, (0.0, 1.0))
    if not depth:
        return np.zeros(len(local))
    # Over the crown the hair runs front to back; below the widest part of the skull it falls.
    fall = F.smoothstep(0.17, 0.12, local[:, 2])[:, None]
    along_y = local * np.array([1.0, 1.0 / stretch, 1.0])
    along_z = local * np.array([1.0, 1.0, 1.0 / stretch])
    return clumps(along_y * (1.0 - fall) + along_z * fall, seed=23) * depth * grown


def hairline_shadow(figure, points, masks, style):
    """The scalp darkened below short hair. The crop: a crisp 6 mm edge at the forehead and the
    temples, a 3 cm stippled fade at the nape and behind the ears, along crop_line. Other
    styles keep _wardrobe.hairline_shadow."""
    if style != 'afro_short':
        return W.hairline_shadow(figure, points, masks)
    local = figure.to_head(points)
    above = local[:, 2] - crop_line(local)
    reach = np.interp(local[:, 1], (-0.12, -0.02, 0.0, 0.03), (0.030, 0.024, 0.008, 0.006))
    ramp = np.clip((above + reach) / (reach + 0.002), 0.0, 1.0)
    grain = np.random.default_rng(5).uniform(0.70, 1.0, len(points))
    shadow = 0.84 * ramp ** 1.6 * np.where(ramp < 0.95, grain, 1.0) * (points[:, 2] > figure.chin + 0.02)
    masks = np.array(masks, dtype=np.float64)
    masks[:, 1] = np.maximum(masks[:, 1], shadow)
    return masks
