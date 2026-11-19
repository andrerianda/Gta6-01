"""The painted images of the garage story models (PIL only): letterheads, notices, labels, the pass,
the banknotes, the rain on the glass and the photograph of the young pilot. Every name, mark, crest
and currency here is invented for MARAZUL. Each function writes a PNG and returns its path.
"""
import math
import os
import random

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

FONTS = {
    'serif': '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf',
    'serif_bold': '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
    'sans': '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    'sans_bold': '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    'narrow_bold': '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    'mono': '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
}


def font(kind, size):
    try:
        return ImageFont.truetype(FONTS[kind], int(size))
    except Exception:
        try:
            return ImageFont.load_default(int(size))
        except Exception:
            return ImageFont.load_default()


def text(draw, xy, words, kind, size, fill, anchor='la', spacing=0):
    f = font(kind, size)
    if spacing:
        x = xy[0]
        if anchor[0] == 'm':
            x -= (sum(draw.textlength(c, font=f) for c in words) + spacing * (len(words) - 1)) / 2
        for c in words:
            draw.text((x, xy[1]), c, font=f, fill=fill, anchor='l' + anchor[1])
            x += draw.textlength(c, font=f) + spacing
    else:
        draw.text(xy, words, font=f, fill=fill, anchor=anchor)


def grain(image, amount=6, seed=1, blotch=0.0):
    """Paper or print grain: fine noise and, with blotch, broad uneven tone."""
    rng = np.random.default_rng(seed)
    data = np.asarray(image.convert('RGBA')).astype(np.float32)
    h, w = data.shape[:2]
    noise = rng.normal(0.0, amount, (h, w, 1))
    if blotch:
        small = rng.normal(0.0, 1.0, (max(2, h // 64), max(2, w // 64)))
        broad = np.asarray(Image.fromarray((small * 40 + 128).clip(0, 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)).astype(np.float32) - 128
        noise = noise + broad[..., None] * blotch
    data[..., :3] = np.clip(data[..., :3] + noise, 0, 255)
    return Image.fromarray(data.astype(np.uint8), 'RGBA')


def save(image, work_dir, name):
    path = os.path.join(work_dir, name + '.png')
    image.save(path)
    return path


def meridiano_mark(draw, cx, cy, r, colour, paper):
    """The invented mark of Banco Meridiano: a disc crossed by a meridian and two arcs over a horizon bar."""
    w = max(2, int(r * 0.12))
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=colour)
    draw.ellipse((cx - r + w, cy - r + w, cx + r - w, cy + r - w), fill=paper)
    draw.ellipse((cx - r * 0.45, cy - r + w, cx + r * 0.45, cy + r - w), outline=colour, width=w)
    draw.line((cx, cy - r, cx, cy + r), fill=colour, width=w)
    draw.rectangle((cx - r, cy - w, cx + r, cy + w), fill=colour)
    draw.polygon([(cx - r * 0.3, cy - r * 1.28), (cx + r * 0.3, cy - r * 1.28), (cx, cy - r * 0.98)], fill=colour)


def stamp(size, words, colour=(176, 24, 30), sub=None, angle=-11, seed=5):
    """A rubber stamp with a double border, unevenly inked. Returns an RGBA image."""
    w, h = size
    image = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((4, 4, w - 5, h - 5), 14, outline=colour + (255,), width=9)
    draw.rounded_rectangle((20, 20, w - 21, h - 21), 8, outline=colour + (255,), width=3)
    text(draw, (w / 2, h * (0.44 if sub else 0.5)), words, 'narrow_bold', h * (0.5 if sub else 0.6), colour + (255,), 'mm')
    if sub:
        text(draw, (w / 2, h * 0.79), sub, 'sans_bold', h * 0.13, colour + (255,), 'mm')
    rng = np.random.default_rng(seed)
    small = rng.uniform(0.35, 1.25, (h // 6 + 1, w // 6 + 1))
    wear = np.asarray(Image.fromarray((small.clip(0, 1) * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)).astype(np.float32) / 255
    speck = rng.uniform(0, 1, (h, w)) > 0.06
    data = np.asarray(image).astype(np.float32)
    data[..., 3] *= np.clip(wear, 0.25, 1) * speck * 0.9
    return Image.fromarray(data.astype(np.uint8), 'RGBA').rotate(angle, expand=True, resample=Image.BICUBIC)


def body_lines(draw, x0, x1, y, count, pitch, colour, seed=3, height=5):
    """Body text as lines of words (grey dashes of word length), ragged right."""
    rng = random.Random(seed)
    for row in range(count):
        x, end = x0, x1 - (rng.uniform(0.25, 0.7) * (x1 - x0) if row == count - 1 else rng.uniform(0, 30))
        while x < end - 20:
            length = rng.uniform(14, 78)
            draw.rectangle((x, y, min(x + length, end), y + height), fill=colour)
            x += length + 11
        y += pitch
    return y


def letter(work_dir):
    """The foreclosure letter, A4 (1050 x 1485)."""
    w, h = 1050, 1485
    paper = (238, 234, 222)
    green, ink = (22, 62, 52), (34, 34, 38)
    image = Image.new('RGBA', (w, h), paper + (255,))
    draw = ImageDraw.Draw(image)
    meridiano_mark(draw, 150, 150, 52, green, paper)
    text(draw, (232, 92), 'BANCO MERIDIANO', 'serif_bold', 64, green)
    text(draw, (236, 172), 'CASA MATRIZ  ·  AVENIDA DEL FARO 114  ·  PUERTO MARAZUL', 'sans', 19, green)
    draw.rectangle((90, 236, w - 90, 241), fill=green)
    draw.rectangle((90, 247, w - 90, 248), fill=green)
    text(draw, (w - 92, 276), 'Loans Recovery Division', 'sans', 21, ink, 'ra')
    text(draw, (w - 92, 306), 'Ref. LR / 88-2193 / TT', 'mono', 20, ink, 'ra')
    text(draw, (92, 290), 'The Proprietor', 'serif', 25, ink)
    text(draw, (92, 324), 'TOLLIVER TOW  ·  Recovery & Repairs', 'serif_bold', 25, ink)
    text(draw, (92, 358), 'Calle del Astillero, Dársena Vieja', 'serif', 25, ink)
    draw.rectangle((90, 440, w - 90, 548), fill=(28, 28, 32))
    text(draw, (w / 2, 494), 'FINAL NOTICE OF FORECLOSURE', 'narrow_bold', 51, (240, 236, 224), 'mm')
    text(draw, (92, 590), 'Secured loan 88-2193  —  premises, plant and vehicles', 'serif_bold', 25, ink)
    y = body_lines(draw, 92, w - 92, 650, 5, 30, (86, 86, 92), 3)
    text(draw, (92, y + 16), 'Amount now due in full:', 'serif', 26, ink)
    text(draw, (w - 92, y + 12), '412,600.00', 'mono', 34, ink, 'ra')
    draw.rectangle((w - 300, y + 56, w - 92, y + 58), fill=ink)
    y = body_lines(draw, 92, w - 92, y + 96, 6, 30, (86, 86, 92), 8)
    y = body_lines(draw, 92, w - 92, y + 26, 4, 30, (86, 86, 92), 12)
    text(draw, (92, y + 30), 'For and on behalf of Banco Meridiano,', 'serif', 24, ink)
    points = [(110 + i * 9, y + 120 + math.sin(i * 0.9) * (22 - i * 0.5) - i * 0.8) for i in range(32)]
    draw.line(points, fill=(26, 30, 96), width=3, joint='curve')
    draw.line((100, y + 138, 420, y + 122), fill=(26, 30, 96), width=2)
    draw.rectangle((92, y + 164, 420, y + 165), fill=ink)
    text(draw, (92, y + 174), 'Director of Recoveries', 'sans', 20, ink)
    draw.rectangle((90, h - 108, w - 90, h - 106), fill=green)
    text(draw, (w / 2, h - 78), 'Banco Meridiano S.A.  ·  Sirviendo a Marazul desde siempre', 'sans', 18, green, 'mm')
    mark = stamp((430, 190), '30 DAYS', sub='TO VACATE  ·  NO EXTENSION')
    image.alpha_composite(mark, (w - 92 - mark.width + 10, y + 6))
    return save(grain(image, 4, 2, 0.05), work_dir, 'letter')


def seal_notice(work_dir):
    """The notice on the sealed door, 40 x 30 cm (1024 x 768)."""
    w, h = 1024, 768
    paper, red, ink = (236, 231, 214), (168, 22, 28), (26, 26, 30)
    image = Image.new('RGBA', (w, h), paper + (255,))
    draw = ImageDraw.Draw(image)
    draw.rectangle((16, 16, w - 17, h - 17), outline=red, width=16)
    draw.rectangle((42, 42, w - 43, h - 43), outline=red, width=3)
    meridiano_mark(draw, w / 2, 122, 44, ink, paper)
    text(draw, (w / 2, 232), 'SEALED BY ORDER OF', 'narrow_bold', 82, red, 'mm')
    text(draw, (w / 2, 338), 'BANCO MERIDIANO', 'serif_bold', 84, ink, 'mm')
    draw.rectangle((90, 398, w - 90, 402), fill=ink)
    text(draw, (w / 2, 440), 'PREMISES AND CONTENTS HELD AS SECURITY  ·  LOAN 88-2193', 'sans_bold', 24, ink, 'mm')
    text(draw, (w / 2, 486), 'ENTRY PROHIBITED.  BREAKING THIS SEAL IS AN OFFENCE.', 'sans_bold', 26, red, 'mm')
    body_lines(draw, 100, 640, 540, 4, 30, (80, 80, 86), 21, 6)
    draw.rectangle((100, 690, 420, 692), fill=ink)
    text(draw, (100, 698), 'Bailiff of record', 'sans', 20, ink)
    seal = Image.new('RGBA', (220, 220), (0, 0, 0, 0))
    sd = ImageDraw.Draw(seal)
    sd.ellipse((6, 6, 213, 213), outline=red + (235,), width=10)
    sd.ellipse((34, 34, 185, 185), outline=red + (235,), width=4)
    meridiano_mark(sd, 110, 116, 40, red + (235,), paper + (0,))
    for i, c in enumerate('BANCO · MERIDIANO · SELLADO · '):
        a = -math.pi / 2 + i * 2 * math.pi / 30
        text(sd, (110 + 88 * math.cos(a), 110 + 88 * math.sin(a)), c, 'sans_bold', 17, red + (235,), 'mm')
    image.alpha_composite(seal.rotate(14, resample=Image.BICUBIC), (720, 500))
    return save(grain(image, 5, 4, 0.08), work_dir, 'seal_notice')


def seal_tape(work_dir):
    """Red and white barrier tape with the bank's lettering, 1.4 m x 5 cm (2048 x 72)."""
    w, h = 2048, 72
    image = Image.new('RGBA', (w, h), (232, 228, 216, 255))
    draw = ImageDraw.Draw(image)
    for x in range(-h, w, 292):
        draw.polygon([(x, h), (x + h, 0), (x + h + 70, 0), (x + 70, h)], fill=(172, 24, 30, 255))
        draw.polygon([(x + 110, h), (x + 110 + h, 0), (x + 180 + h, 0), (x + 180, h)], fill=(172, 24, 30, 255))
        text(draw, (x + 268, h / 2), '', 'sans', 10, (0, 0, 0, 255))
    for x in range(168, w, 584):
        draw.rectangle((x + 100, 8, x + 392, h - 9), fill=(232, 228, 216, 255))
        text(draw, (x + 246, h / 2), 'BANCO MERIDIANO · SEALED', 'narrow_bold', 21, (150, 18, 24, 255), 'mm')
    return save(grain(image, 5, 6), work_dir, 'seal_tape')


def crest(draw, cx, cy, s, dark, light, gold):
    """The invented crest of Base Aérea Punta Garza: a shield, a rising heron wing, a headland and three waves."""
    shield = [(cx - s, cy - s), (cx + s, cy - s), (cx + s, cy + s * 0.2), (cx, cy + s * 1.25), (cx - s, cy + s * 0.2)]
    draw.polygon(shield, fill=dark, outline=gold)
    draw.line(shield + [shield[0]], fill=gold, width=max(2, int(s * 0.09)))
    draw.polygon([(cx - s * 0.75, cy + s * 0.1), (cx - s * 0.1, cy - s * 0.7), (cx + s * 0.15, cy - s * 0.2), (cx + s * 0.72, cy - s * 0.62),
                  (cx + s * 0.3, cy + s * 0.18), (cx - s * 0.05, cy + s * 0.02)], fill=light)
    draw.polygon([(cx - s * 0.1, cy - s * 0.7), (cx - s * 0.02, cy - s * 0.92), (cx + s * 0.22, cy - s * 0.86), (cx + s * 0.04, cy - s * 0.66)], fill=gold)
    for i in range(3):
        y = cy + s * (0.42 + 0.2 * i)
        half = s * (0.62 - 0.2 * i)
        draw.arc((cx - half, y - s * 0.12, cx, y + s * 0.12), 180, 360, fill=gold, width=max(2, int(s * 0.06)))
        draw.arc((cx, y - s * 0.12, cx + half, y + s * 0.12), 180, 360, fill=gold, width=max(2, int(s * 0.06)))


def portrait(size, seed=2):
    """A neutral head-and-shoulders portrait for a pass: soft, front lit, no likeness."""
    w, h = size
    scale = 3
    image = Image.new('RGB', (w * scale, h * scale), (150, 160, 172))
    draw = ImageDraw.Draw(image)
    W, H = w * scale, h * scale
    for y in range(H):
        draw.line((0, y, W, y), fill=(int(162 - 30 * y / H), int(172 - 30 * y / H), int(184 - 28 * y / H)))
    cx = W / 2
    draw.polygon([(cx - W * 0.47, H), (cx - W * 0.42, H * 0.82), (cx - W * 0.17, H * 0.72), (cx + W * 0.17, H * 0.72),
                  (cx + W * 0.42, H * 0.82), (cx + W * 0.47, H)], fill=(52, 60, 74))
    draw.polygon([(cx - W * 0.12, H * 0.72), (cx, H * 0.9), (cx + W * 0.12, H * 0.72)], fill=(206, 208, 210))
    draw.polygon([(cx - W * 0.025, H * 0.78), (cx + W * 0.025, H * 0.78), (cx + W * 0.035, H), (cx - W * 0.035, H)], fill=(24, 28, 40))
    draw.rectangle((cx - W * 0.1, H * 0.56, cx + W * 0.1, H * 0.76), fill=(150, 108, 82))
    draw.ellipse((cx - W * 0.2, H * 0.18, cx + W * 0.2, H * 0.68), fill=(186, 138, 106))
    draw.ellipse((cx - W * 0.235, H * 0.38, cx - W * 0.17, H * 0.5), fill=(170, 122, 94))
    draw.ellipse((cx + W * 0.17, H * 0.38, cx + W * 0.235, H * 0.5), fill=(170, 122, 94))
    draw.pieslice((cx - W * 0.215, H * 0.14, cx + W * 0.215, H * 0.5), 180, 360, fill=(30, 24, 22))
    draw.polygon([(cx - W * 0.21, H * 0.32), (cx - W * 0.17, H * 0.4), (cx - W * 0.2, H * 0.44)], fill=(30, 24, 22))
    draw.polygon([(cx + W * 0.21, H * 0.32), (cx + W * 0.17, H * 0.4), (cx + W * 0.2, H * 0.44)], fill=(30, 24, 22))
    for side in (-1, 1):
        ex = cx + side * W * 0.085
        draw.line((ex - W * 0.045, H * 0.385, ex + W * 0.045, H * 0.38), fill=(34, 26, 22), width=scale * 2)
        draw.ellipse((ex - W * 0.03, H * 0.405, ex + W * 0.03, H * 0.435), fill=(48, 36, 30))
    draw.polygon([(cx - W * 0.012, H * 0.42), (cx + W * 0.03, H * 0.52), (cx - W * 0.02, H * 0.53)], fill=(164, 116, 90))
    draw.line((cx - W * 0.06, H * 0.59, cx + W * 0.06, H * 0.59), fill=(120, 70, 62), width=scale * 2)
    shade = Image.new('L', (W, H), 0)
    ImageDraw.Draw(shade).rectangle((cx + W * 0.04, 0, W, H), fill=70)
    image = Image.composite(Image.new('RGB', (W, H), (40, 40, 52)), image, shade.filter(ImageFilter.GaussianBlur(W * 0.08)))
    image = image.filter(ImageFilter.GaussianBlur(scale * 1.6)).resize((w, h), Image.LANCZOS)
    return grain(image, 5, seed).convert('RGB')


def pass_card(work_dir, back=False):
    """The forged base pass, 86 x 54 mm (1032 x 648)."""
    w, h = 1032, 648
    navy, pale, gold, ink = (30, 46, 78), (226, 228, 224), (190, 150, 62), (22, 24, 30)
    image = Image.new('RGBA', (w, h), pale + (255,))
    draw = ImageDraw.Draw(image)
    if back:
        draw.rectangle((0, 70, w, 190), fill=(26, 22, 20, 255))
        body_lines(draw, 70, w - 70, 260, 6, 34, (120, 124, 130), 5, 7)
        text(draw, (w / 2, 540), 'PROPERTY OF BASE AÉREA PUNTA GARZA  ·  RETURN TO THE GUARD ROOM', 'sans_bold', 19, navy + (255,), 'mm')
        return save(grain(image, 3, 9), work_dir, 'pass_back')
    for i in range(0, w + h, 14):
        draw.line((i, 0, i - h, h), fill=(214, 219, 222, 255), width=3)
    draw.rectangle((0, 0, w, 150), fill=navy + (255,))
    draw.rectangle((0, 150, w, 160), fill=gold + (255,))
    crest(draw, 92, 70, 50, (18, 30, 54), (228, 230, 232), gold)
    text(draw, (176, 22), 'BASE AÉREA PUNTA GARZA', 'narrow_bold', 60, (238, 238, 232, 255))
    text(draw, (180, 96), 'FUERZA AÉREA DE MARAZUL  ·  CONTROL DE ACCESO', 'sans_bold', 23, gold + (255,))
    image.paste(portrait((270, 340)), (44, 190))
    draw.rectangle((44, 190, 313, 529), outline=navy + (255,), width=4)
    text(draw, (350, 196), 'NAME / NOMBRE', 'sans', 19, (90, 96, 108, 255))
    text(draw, (348, 220), 'LT. RAMIRO OSORIO', 'narrow_bold', 62, ink + (255,))
    text(draw, (350, 304), 'STATUS / CONDICIÓN', 'sans', 19, (90, 96, 108, 255))
    draw.rectangle((346, 330, 912, 396), fill=(150, 26, 32, 255))
    text(draw, (629, 364), 'VISITING TEST PILOT', 'narrow_bold', 53, (244, 240, 232, 255), 'mm')
    text(draw, (350, 416), 'PASS No.', 'sans', 19, (90, 96, 108, 255))
    text(draw, (350, 440), 'PG-V-20417', 'mono', 36, ink + (255,))
    text(draw, (640, 416), 'AREAS', 'sans', 19, (90, 96, 108, 255))
    text(draw, (640, 440), 'FLIGHT LINE · H3', 'sans_bold', 29, ink + (255,))
    rng = random.Random(4)
    x = 350
    while x < 700:
        bar = rng.choice((3, 3, 5, 8))
        draw.rectangle((x, 504, x + bar, 574), fill=ink + (255,))
        x += bar + rng.choice((3, 4, 6))
    text(draw, (44, 548), 'ESCORT NOT REQUIRED', 'sans_bold', 22, navy + (255,))
    text(draw, (44, 586), 'VALID WITH ORDERS ONLY', 'sans', 19, (90, 96, 108, 255))
    patch = Image.new('RGBA', (190, 120), (0, 0, 0, 0))
    data = np.zeros((120, 190, 4), dtype=np.float32)
    yy, xx = np.mgrid[0:120, 0:190]
    phase = (xx * 0.035 + yy * 0.05)
    rings = 0.5 + 0.5 * np.sin(np.hypot(xx - 95, yy - 60) * 0.55)
    data[..., 0] = 150 + 90 * np.sin(phase * 2.0) * (0.6 + 0.4 * rings)
    data[..., 1] = 170 + 70 * np.sin(phase * 2.0 + 2.1) * (0.6 + 0.4 * rings)
    data[..., 2] = 190 + 60 * np.sin(phase * 2.0 + 4.2) * (0.6 + 0.4 * rings)
    data[..., 3] = 235
    patch = Image.fromarray(data.clip(0, 255).astype(np.uint8), 'RGBA')
    pd = ImageDraw.Draw(patch)
    crest(pd, 95, 52, 34, (255, 255, 255, 60), (255, 255, 255, 150), (255, 255, 255, 200))
    mask = Image.new('L', (190, 120), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, 189, 119), 18, fill=255)
    image.paste(patch, (800, 466), mask)
    text(draw, (w - 30, 176), 'V', 'narrow_bold', 150, (150, 26, 32, 70), 'ra')
    return save(grain(image, 3, 7), work_dir, 'pass_front')


def name_tape(work_dir, words='OSORIO'):
    """A woven name tape, 12 x 2.6 cm (480 x 104)."""
    image = Image.new('RGBA', (480, 104), (24, 30, 44, 255))
    draw = ImageDraw.Draw(image)
    draw.rectangle((5, 5, 474, 98), outline=(170, 150, 96, 255), width=3)
    text(draw, (240, 52), words, 'narrow_bold', 66, (214, 210, 196, 255), 'mm', 8)
    return save(grain(image, 9, 3), work_dir, 'name_tape')


def wings_badge(work_dir):
    """An invented flying badge: two swept wings about a disc with the meridian star (400 x 130)."""
    image = Image.new('RGBA', (400, 130), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    silver = (196, 192, 176, 255)
    for side in (-1, 1):
        for k in range(4):
            y = 40 + k * 15
            draw.polygon([(200 + side * 34, y), (200 + side * (190 - k * 26), y - 22 + k * 5), (200 + side * (176 - k * 26), y + 9 + k * 2),
                          (200 + side * 34, y + 12)], fill=silver, outline=(70, 70, 66, 255))
    draw.ellipse((158, 20, 242, 104), fill=(30, 40, 66, 255), outline=silver, width=6)
    draw.polygon([(200, 34), (210, 56), (232, 62), (212, 72), (216, 94), (200, 80), (184, 94), (188, 72), (168, 62), (190, 56)], fill=silver)
    return save(image, work_dir, 'wings')


def ribbons(work_dir):
    """A ribbon rack of invented decorations, 3 x 2 (300 x 80)."""
    image = Image.new('RGBA', (300, 80), (20, 20, 24, 255))
    draw = ImageDraw.Draw(image)
    sets = [((30, 60, 110), (220, 210, 190), (150, 30, 30)), ((200, 160, 50), (30, 80, 50), (200, 160, 50)), ((120, 26, 30), (230, 226, 210), (30, 50, 100)),
            ((40, 90, 110), (220, 190, 70), (40, 90, 110)), ((225, 222, 205), (150, 30, 30), (225, 222, 205)), ((30, 40, 60), (120, 150, 180), (220, 210, 190))]
    for i, colours in enumerate(sets):
        x, y = 2 + (i % 3) * 99, 2 + (i // 3) * 39
        draw.rectangle((x, y, x + 96, y + 36), fill=colours[0] + (255,))
        draw.rectangle((x + 30, y, x + 66, y + 36), fill=colours[1] + (255,))
        draw.rectangle((x + 43, y, x + 53, y + 36), fill=colours[2] + (255,))
    return save(grain(image, 6, 5), work_dir, 'ribbons')


def banknote(work_dir):
    """A banded stack seen from above: the invented 500 corales note, 140 x 66 mm (560 x 264), with a
    paper band across it. The image has a dark margin: the gap between stacks."""
    w, h = 572, 296
    image = Image.new('RGBA', (w, h), (16, 16, 16, 255))
    draw = ImageDraw.Draw(image)
    x0, y0, x1, y1 = 6, 16, w - 7, h - 17
    draw.rectangle((x0, y0, x1, y1), fill=(196, 208, 186, 255))
    for i in range(0, 560, 7):
        a = i * 0.07
        draw.line((x0 + i, y0 + 20 + 14 * math.sin(a), x0 + i + 7, y0 + 20 + 14 * math.sin(a + 0.49)), fill=(70, 128, 120, 255), width=2)
        draw.line((x0 + i, y1 - 20 + 14 * math.sin(a + 2), x0 + i + 7, y1 - 20 + 14 * math.sin(a + 2.49)), fill=(70, 128, 120, 255), width=2)
    draw.rectangle((x0 + 8, y0 + 8, x1 - 8, y1 - 8), outline=(40, 96, 96, 255), width=4)
    for r in range(18, 96, 9):
        draw.ellipse((440 - r, 148 - r * 0.8, 440 + r, 148 + r * 0.8), outline=(150, 70, 110, 255), width=2)
    meridian = (150, 70, 110, 255)
    draw.polygon([(440, 108), (452, 138), (482, 148), (452, 158), (440, 188), (428, 158), (398, 148), (428, 138)], fill=meridian)
    text(draw, (34, 44), '500', 'serif_bold', 70, (30, 78, 84, 255))
    text(draw, (36, 128), 'BANCO CENTRAL DE MARAZUL', 'sans_bold', 17, (30, 78, 84, 255))
    text(draw, (36, 156), 'QUINIENTOS CORALES', 'serif_bold', 22, (118, 44, 84, 255))
    text(draw, (x1 - 22, y1 - 20), '500', 'serif_bold', 44, (30, 78, 84, 255), 'rs')
    text(draw, (36, 226), 'C 4170 882193', 'mono', 18, (130, 30, 34, 255))
    draw.rectangle((216, y0 - 2, 330, y1 + 2), fill=(232, 226, 204, 255))
    draw.rectangle((216, y0 - 2, 222, y1 + 2), fill=(150, 70, 110, 255))
    draw.rectangle((324, y0 - 2, 330, y1 + 2), fill=(150, 70, 110, 255))
    band = Image.new('RGBA', (240, 60), (0, 0, 0, 0))
    text(ImageDraw.Draw(band), (120, 30), '50 000  ·  B.C.M.', 'sans_bold', 24, (90, 30, 60, 255), 'mm')
    band = band.rotate(90, expand=True)
    image.alpha_composite(band, (243, 28))
    return save(grain(image, 5, 8), work_dir, 'banknote')


def note_edges(work_dir):
    """The side of a stack of notes: fine paper edges with a band (64 x 256)."""
    rng = np.random.default_rng(3)
    rows = rng.normal(0, 16, (256, 1, 1)) + np.array([[[196, 204, 184]]], dtype=np.float32)
    data = np.repeat(rows, 64, axis=1) + rng.normal(0, 4, (256, 64, 3))
    alpha = np.full((256, 64, 1), 255, dtype=np.float32)
    return save(Image.fromarray(np.concatenate([data, alpha], axis=2).clip(0, 255).astype(np.uint8), 'RGBA'), work_dir, 'note_edges')


def rain_glass(work_dir, seed=4):
    """Night glass with rain on it: a faint cold tint, beads, and streaks that run down and gather (512 x 512 RGBA)."""
    size = 512
    rng = random.Random(seed)
    wet = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(wet)
    for _ in range(64):
        x, y = rng.uniform(0, size), rng.uniform(-40, size * 0.8)
        length, width = rng.uniform(60, 420), rng.choice((1, 2, 2, 3))
        points = []
        for step in range(int(length / 6)):
            x += rng.uniform(-1.6, 1.6) + (rng.choice((-5, 5)) if rng.random() < 0.05 else 0)
            points.append((x, y + step * 6))
        if len(points) > 1:
            draw.line(points, fill=rng.randint(120, 230), width=width)
            draw.ellipse((points[-1][0] - 4, points[-1][1] - 3, points[-1][0] + 4, points[-1][1] + 7), fill=255)
    for _ in range(520):
        x, y, r = rng.uniform(0, size), rng.uniform(0, size), rng.uniform(0.8, 3.4)
        draw.ellipse((x - r, y - r, x + r, y + r * 1.25), fill=rng.randint(110, 255))
    wet = ImageChops.lighter(wet.filter(ImageFilter.GaussianBlur(0.8)), wet.filter(ImageFilter.GaussianBlur(5)).point(lambda v: v * 0.5))
    mist = np.asarray(Image.effect_noise((size, size), 60).filter(ImageFilter.GaussianBlur(40))).astype(np.float32) / 255
    wetness = np.asarray(wet).astype(np.float32) / 255
    data = np.zeros((size, size, 4), dtype=np.float32)
    data[..., 0] = 20 + 150 * wetness
    data[..., 1] = 30 + 165 * wetness
    data[..., 2] = 44 + 180 * wetness
    data[..., 3] = 255 * np.clip(0.2 + 0.16 * (mist - 0.5) * 4 + 0.6 * wetness, 0.1, 0.9)
    return save(Image.fromarray(data.clip(0, 255).astype(np.uint8), 'RGBA'), work_dir, 'rain_glass')


def label(work_dir, name, size, back, lines, mark=None):
    """A tin or box label: lines are (text, font kind, size, colour, y). mark: (kind, colour)."""
    w, h = size
    image = Image.new('RGBA', (w, h), back + (255,))
    draw = ImageDraw.Draw(image)
    draw.rectangle((5, 5, w - 6, h - 6), outline=lines[0][3] + (255,), width=4)
    if mark:
        kind, colour = mark
        cx, cy, r = w / 2, h * 0.3, h * 0.17
        if kind == 'drop':
            draw.ellipse((cx - r * 0.7, cy - r * 0.3, cx + r * 0.7, cy + r * 1.1), fill=colour + (255,))
            draw.polygon([(cx, cy - r * 1.2), (cx - r * 0.62, cy + r * 0.1), (cx + r * 0.62, cy + r * 0.1)], fill=colour + (255,))
        elif kind == 'gear':
            for k in range(8):
                a = k * math.pi / 4
                draw.line((cx, cy, cx + r * 1.2 * math.cos(a), cy + r * 1.2 * math.sin(a)), fill=colour + (255,), width=int(r * 0.34))
            draw.ellipse((cx - r * 0.9, cy - r * 0.9, cx + r * 0.9, cy + r * 0.9), fill=colour + (255,))
            draw.ellipse((cx - r * 0.38, cy - r * 0.38, cx + r * 0.38, cy + r * 0.38), fill=back + (255,))
        else:
            draw.polygon([(cx - r * 1.3, cy + r), (cx, cy - r * 1.1), (cx + r * 1.3, cy + r)], fill=colour + (255,))
            draw.polygon([(cx - r * 0.5, cy + r), (cx, cy), (cx + r * 0.5, cy + r)], fill=back + (255,))
    for words, kind, points, colour, y in lines:
        text(draw, (w / 2, h * y), words, kind, points, colour + (255,), 'mm')
    return save(grain(image, 7, len(name), 0.12), work_dir, 'label_' + name)


def calendar(work_dir):
    """The wall calendar of an invented parts supplier, 30 x 44 cm (420 x 616): a month grid with days crossed off."""
    w, h = 420, 616
    image = Image.new('RGBA', (w, h), (232, 228, 214, 255))
    draw = ImageDraw.Draw(image)
    for y in range(250):
        draw.line((0, y, w, y), fill=(int(40 + y * 0.5), int(70 + y * 0.42), int(104 + y * 0.2), 255))
    draw.polygon([(0, 250), (0, 190), (90, 150), (190, 196), (300, 128), (420, 182), (420, 250)], fill=(34, 52, 60, 255))
    draw.ellipse((276, 46, 336, 106), fill=(244, 214, 150, 255))
    draw.polygon([(60, 250), (90, 214), (250, 214), (290, 236), (330, 240), (330, 250)], fill=(150, 36, 30, 255))
    draw.ellipse((96, 236, 132, 262), fill=(20, 20, 20, 255))
    draw.ellipse((262, 236, 298, 262), fill=(20, 20, 20, 255))
    draw.rectangle((0, 250, w, 300), fill=(150, 36, 30, 255))
    text(draw, (w / 2, 275), 'FERRAGUT AUTOPARTES', 'narrow_bold', 30, (240, 234, 216, 255), 'mm')
    text(draw, (24, 314), 'OCTUBRE', 'serif_bold', 30, (30, 30, 34, 255))
    for i, day in enumerate('LMMJVSD'):
        text(draw, (48 + i * 54, 372), day, 'sans_bold', 17, (150, 36, 30, 255) if i == 6 else (60, 60, 66, 255), 'mm')
    for n in range(31):
        col, row = (n + 2) % 7, (n + 2) // 7
        x, y = 48 + col * 54, 408 + row * 40
        text(draw, (x, y), str(n + 1), 'sans', 19, (150, 36, 30, 255) if col == 6 else (40, 40, 46, 255), 'mm')
        if n < 19:
            draw.line((x - 13, y - 12, x + 13, y + 12), fill=(30, 40, 120, 255), width=2)
        if n == 30:
            draw.ellipse((x - 19, y - 17, x + 19, y + 17), outline=(190, 20, 26, 255), width=3)
    return save(grain(image, 5, 11, 0.06), work_dir, 'calendar')


def clock_face(work_dir):
    """A workshop wall clock face (256 x 256), the hands at ten to two in the night."""
    s = 256
    image = Image.new('RGBA', (s * 2, s * 2), (226, 220, 200, 255))
    draw = ImageDraw.Draw(image)
    c = s
    for k in range(60):
        a = k * math.pi / 30
        r0 = c * (0.8 if k % 5 == 0 else 0.88)
        draw.line((c + r0 * math.sin(a), c - r0 * math.cos(a), c + c * 0.93 * math.sin(a), c - c * 0.93 * math.cos(a)), fill=(24, 24, 26, 255), width=8 if k % 5 == 0 else 3)
    for k in range(1, 13):
        a = k * math.pi / 6
        text(draw, (c + c * 0.64 * math.sin(a), c - c * 0.64 * math.cos(a)), str(k), 'sans_bold', 54, (24, 24, 26, 255), 'mm')
    text(draw, (c, c * 1.38), 'TOLLIVER TOW', 'sans_bold', 24, (150, 36, 30, 255), 'mm')
    for a, length, width in ((math.radians(55), 0.46, 16), (math.radians(300), 0.72, 10)):
        draw.line((c - 20 * math.sin(a), c + 20 * math.cos(a), c + c * length * math.sin(a), c - c * length * math.cos(a)), fill=(18, 18, 20, 255), width=width)
    draw.ellipse((c - 16, c - 16, c + 16, c + 16), fill=(18, 18, 20, 255))
    return save(grain(image.resize((s, s), Image.LANCZOS), 4, 13, 0.08), work_dir, 'clock')


def sign(work_dir):
    """The enamelled tin sign of the garage, 120 x 45 cm (960 x 360), chipped and rusted at the edges."""
    w, h = 960, 360
    image = Image.new('RGBA', (w, h), (30, 54, 66, 255))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((12, 12, w - 13, h - 13), 22, outline=(226, 196, 110, 255), width=8)
    text(draw, (w / 2, 122), 'TOLLIVER TOW', 'narrow_bold', 138, (232, 222, 196, 255), 'mm', 6)
    draw.rectangle((90, 204, w - 90, 210), fill=(226, 196, 110, 255))
    text(draw, (w / 2, 258), '24 HR RECOVERY  ·  REPAIRS  ·  KEYS CUT', 'sans_bold', 38, (226, 196, 110, 255), 'mm')
    text(draw, (w / 2, 312), 'DÁRSENA VIEJA  ·  FAMILY RUN', 'sans', 26, (200, 206, 204, 255), 'mm')
    rng = random.Random(9)
    for _ in range(46):
        edge = rng.choice('tblr')
        x = rng.uniform(0, w) if edge in 'tb' else (rng.uniform(0, 40) if edge == 'l' else w - rng.uniform(0, 40))
        y = rng.uniform(0, h) if edge in 'lr' else (rng.uniform(0, 30) if edge == 't' else h - rng.uniform(0, 30))
        r = rng.uniform(4, 20)
        draw.ellipse((x - r, y - r * 0.7, x + r, y + r * 0.7), fill=(92, 52, 30, 255))
        draw.ellipse((x - r * 0.5, y - r * 0.35, x + r * 0.5, y + r * 0.35), fill=(44, 26, 18, 255))
    return save(grain(image, 7, 15, 0.2), work_dir, 'sign')


def papers(work_dir, name, seed, title):
    """A typed sheet or invoice for the desk and the notice board (300 x 424)."""
    image = Image.new('RGBA', (300, 424), (230, 226, 212, 255))
    draw = ImageDraw.Draw(image)
    text(draw, (20, 20), title, 'sans_bold', 19, (40, 40, 46, 255))
    draw.rectangle((20, 50, 280, 52), fill=(40, 40, 46, 255))
    body_lines(draw, 20, 280, 70, 20, 16, (96, 96, 104), seed, 4)
    return save(grain(image, 5, seed, 0.1), work_dir, 'paper_' + name)


# --- the photograph ---------------------------------------------------------------------------------

def _lit(layer, mask, sun_dx, warm, cool, rim=10, depth=22):
    """Gives a flat painted shape volume: a warm rim on the sun side, a cool falling shadow on the other."""
    lit_edge = ImageChops.subtract(mask, ImageChops.offset(mask, sun_dx * rim, 0)).filter(ImageFilter.GaussianBlur(rim * 0.55))
    dark_edge = ImageChops.subtract(mask, ImageChops.offset(mask, -sun_dx * depth, 0)).filter(ImageFilter.GaussianBlur(depth * 0.6))
    lit_edge = ImageChops.multiply(lit_edge, mask)
    dark_edge = ImageChops.multiply(dark_edge, mask)
    out = Image.composite(Image.new('RGB', layer.size, cool), layer, dark_edge.point(lambda v: int(v * 0.72)))
    return Image.composite(Image.new('RGB', layer.size, warm), out, lit_edge.point(lambda v: int(v * 0.8)))


def pilot_photo(work_dir):
    """The print in the frame (600 x 800 after supersampling): a young pilot in an olive flight suit, helmet
    under his arm, by the nose of a jet at golden hour; a faded colour print with a white border."""
    S = 3
    w, h = 600 * S, 800 * S
    horizon = int(h * 0.6)
    sky = np.zeros((h, w, 3), dtype=np.float32)
    t = np.linspace(0, 1, horizon)[:, None]
    top, low = np.array([92, 118, 150.0]), np.array([246, 190, 118.0])
    sky[:horizon] = (top * (1 - t) ** 1.4 + low * (1 - (1 - t) ** 1.4))[:, None, :]
    xx = np.linspace(0, 1, w)[None, :, None]
    glow = np.exp(-((xx - 0.12) ** 2) / 0.05) * (t[:, None, :] ** 3 if False else np.linspace(0, 1, horizon)[:, None, None] ** 2.5)
    sky[:horizon] += glow * np.array([40, 34, 6.0])
    g = np.linspace(0, 1, h - horizon)[:, None]
    sky[horizon:] = (np.array([150, 128, 104.0]) * (1 - g) + np.array([92, 84, 78.0]) * g)[:, None, :]
    image = Image.fromarray(sky.clip(0, 255).astype(np.uint8), 'RGB')
    draw = ImageDraw.Draw(image)
    draw.polygon([(0, horizon), (0, horizon - 40 * S), (w * 0.2, horizon - 62 * S), (w * 0.42, horizon - 30 * S), (w * 0.62, horizon - 48 * S),
                  (w, horizon - 20 * S), (w, horizon)], fill=(150, 120, 108))
    for k in range(5):
        draw.rectangle((w * (0.06 + 0.07 * k), horizon - (14 + 5 * (k % 2)) * S, w * (0.1 + 0.07 * k), horizon), fill=(120, 98, 92))
    for k in range(7):
        x = w * (-0.4 + 0.3 * k)
        draw.line((w * 0.5 + (x - w * 0.5) * 0.12, horizon, x + (x - w * 0.5) * 2.2, h), fill=(110, 98, 88), width=2 * S)
    for k in range(1, 5):
        y = horizon + (h - horizon) * (k / 4.6) ** 1.8
        draw.line((0, y, w, y), fill=(112, 100, 90), width=S + k)

    # the jet's nose, coming in from the right: radome, fuselage, canopy, intake, nose gear
    jet = Image.new('RGB', (w, h), (0, 0, 0))
    mask = Image.new('L', (w, h), 0)
    jd, md = ImageDraw.Draw(jet), ImageDraw.Draw(mask)
    ny = h * 0.36
    body = [(w * 0.3, ny + 6 * S), (w * 0.4, ny - 14 * S), (w * 0.55, ny - 38 * S), (w * 0.72, ny - 60 * S), (w * 0.86, ny - 74 * S), (w * 1.02, ny - 80 * S),
            (w * 1.02, ny + 84 * S), (w * 0.84, ny + 80 * S), (w * 0.66, ny + 62 * S), (w * 0.5, ny + 40 * S), (w * 0.38, ny + 22 * S)]
    md.polygon(body, fill=255)
    for y in range(int(ny - 90 * S), int(ny + 90 * S)):
        f = (y - (ny - 90 * S)) / (180 * S)
        tone = 1.0 - 0.62 * f ** 1.3
        jd.line((0, y, w, y), fill=(int(176 * tone + 28), int(170 * tone + 22), int(160 * tone + 20)))
    jd.polygon([(w * 0.3, ny + 6 * S), (w * 0.4, ny - 14 * S), (w * 0.455, ny - 22 * S), (w * 0.455, ny + 33 * S), (w * 0.38, ny + 22 * S)], fill=(74, 72, 70))
    canopy = [(w * 0.6, ny - 44 * S), (w * 0.7, ny - 92 * S), (w * 0.86, ny - 112 * S), (w * 1.02, ny - 108 * S), (w * 1.02, ny - 78 * S), (w * 0.86, ny - 74 * S),
              (w * 0.72, ny - 60 * S)]
    md.polygon(canopy, fill=255)
    jd.polygon(canopy, fill=(70, 76, 86))
    jd.polygon([(w * 0.66, ny - 60 * S), (w * 0.73, ny - 88 * S), (w * 0.86, ny - 104 * S), (w * 0.86, ny - 80 * S), (w * 0.74, ny - 66 * S)], fill=(232, 196, 140))
    jd.line(canopy + [canopy[0]], fill=(52, 52, 54), width=3 * S)
    jd.line((w * 0.86, ny - 112 * S, w * 0.86, ny - 74 * S), fill=(52, 52, 54), width=4 * S)
    jd.polygon([(w * 0.84, ny + 20 * S), (w * 1.02, ny + 8 * S), (w * 1.02, ny + 84 * S), (w * 0.84, ny + 80 * S)], fill=(30, 28, 28))
    jd.line((w * 0.84, ny + 20 * S, w * 0.84, ny + 80 * S), fill=(200, 190, 176), width=3 * S)
    for x in (0.52, 0.64, 0.78):
        jd.line((w * x, ny - 60 * S, w * x - 6 * S, ny + 70 * S), fill=(96, 92, 88), width=S)
    jd.line((w * 0.455, ny + 4 * S, w * 0.84, ny + 4 * S), fill=(96, 92, 88), width=S)
    jd.rectangle((w * 0.56, ny + 12 * S, w * 0.74, ny + 20 * S), fill=(150, 50, 40))
    jd.rectangle((w * 0.56, ny + 22 * S, w * 0.74, ny + 25 * S), fill=(214, 204, 180))
    try:
        jd.text((w * 0.6, ny - 26 * S), '417', font=font('narrow_bold', 26 * S), fill=(48, 48, 50))
    except Exception:
        pass
    jet = _lit(jet, mask, 1, (255, 214, 150), (40, 40, 52), 6 * S, 16 * S)
    image.paste(jet, (0, 0), mask.filter(ImageFilter.GaussianBlur(S * 0.7)))
    draw = ImageDraw.Draw(image)
    draw.line((w * 0.3, ny + 6 * S, w * 0.2, ny + 12 * S), fill=(60, 56, 54), width=2 * S)
    gx, gy = w * 0.74, ny + 66 * S
    foot = h * 0.87
    draw.line((gx, gy, gx - 8 * S, foot - 22 * S), fill=(150, 144, 136), width=7 * S)
    draw.line((gx + 22 * S, gy + 4 * S, gx - 4 * S, foot - 60 * S), fill=(110, 106, 100), width=3 * S)
    draw.ellipse((gx - 34 * S, foot - 48 * S, gx + 18 * S, foot + 4 * S), fill=(32, 30, 30))
    draw.ellipse((gx - 20 * S, foot - 34 * S, gx + 4 * S, foot - 10 * S), fill=(124, 120, 112))
    shadow = Image.new('L', (w, h), 0)
    sd = ImageDraw.Draw(shadow)
    sd.polygon([(w * 0.42, foot + 4 * S), (w * 1.02, foot - 30 * S), (w * 1.02, foot + 60 * S), (w * 0.62, foot + 46 * S)], fill=150)

    # the pilot: left of centre, weight on one leg, helmet in the crook of his left arm
    px, top_y, base_y = w * 0.34, h * 0.335, h * 0.93
    H = base_y - top_y
    fig = Image.new('RGB', (w, h), (0, 0, 0))
    fmask = Image.new('L', (w, h), 0)
    fd, fm = ImageDraw.Draw(fig), ImageDraw.Draw(fmask)
    olive, olive_dark, skin, boot = (104, 108, 66), (74, 80, 50), (206, 150, 112), (34, 30, 28)

    def shape(points, colour):
        pts = [(px + x * H, top_y + y * H) for x, y in points]
        fd.polygon(pts, fill=colour)
        fm.polygon(pts, fill=255)

    def oval(cx, cy, rx, ry, colour):
        box = (px + (cx - rx) * H, top_y + (cy - ry) * H, px + (cx + rx) * H, top_y + (cy + ry) * H)
        fd.ellipse(box, fill=colour)
        fm.ellipse(box, fill=255)

    shape([(-0.105, 0.985), (-0.02, 0.985), (-0.015, 1.0), (-0.135, 1.0), (-0.13, 0.975)], boot)
    shape([(0.03, 0.985), (0.115, 0.985), (0.145, 1.0), (0.025, 1.0)], boot)
    shape([(-0.1, 0.5), (0.0, 0.5), (-0.015, 0.74), (-0.02, 0.985), (-0.1, 0.985), (-0.105, 0.74)], olive)
    shape([(0.0, 0.5), (0.105, 0.5), (0.115, 0.74), (0.11, 0.985), (0.035, 0.985), (0.03, 0.74)], olive)
    shape([(-0.125, 0.165), (-0.06, 0.145), (0.06, 0.145), (0.125, 0.165), (0.118, 0.36), (0.108, 0.53), (-0.103, 0.53), (-0.113, 0.36)], olive)
    shape([(-0.125, 0.165), (-0.168, 0.19), (-0.178, 0.36), (-0.168, 0.52), (-0.122, 0.525), (-0.122, 0.36), (-0.11, 0.21)], olive)
    oval(-0.146, 0.55, 0.026, 0.034, skin)
    shape([(0.125, 0.165), (0.17, 0.2), (0.2, 0.36), (0.19, 0.42), (0.08, 0.5), (0.06, 0.455), (0.14, 0.37), (0.108, 0.22)], olive)
    oval(0.168, 0.445, 0.085, 0.082, (222, 220, 210))
    shape([(0.108, 0.47), (0.22, 0.45), (0.228, 0.5), (0.13, 0.528)], (40, 42, 48))
    oval(0.168, 0.415, 0.05, 0.036, (238, 236, 226))
    oval(0.086, 0.485, 0.03, 0.026, skin)
    shape([(-0.032, 0.105), (0.032, 0.105), (0.04, 0.155), (-0.04, 0.155)], (184, 130, 98))
    shape([(-0.062, 0.145), (0.0, 0.2), (0.062, 0.145), (0.05, 0.13), (0.0, 0.17), (-0.05, 0.13)], olive_dark)
    oval(0.0, 0.06, 0.052, 0.066, skin)
    shape([(-0.054, 0.05), (-0.05, 0.012), (-0.02, -0.008), (0.03, -0.006), (0.054, 0.02), (0.054, 0.05), (0.04, 0.026), (-0.03, 0.022)], (44, 32, 26))
    fd = ImageDraw.Draw(fig)
    P = lambda x, y: (px + x * H, top_y + y * H)
    fd.line([P(0.0, 0.17), P(0.002, 0.5)], fill=(60, 62, 44), width=2 * S)
    for sx in (-1, 1):
        fd.polygon([P(sx * 0.03, 0.24), P(sx * 0.092, 0.24), P(sx * 0.092, 0.3), P(sx * 0.03, 0.3)], outline=olive_dark, fill=(98, 102, 62))
        fd.polygon([P(sx * 0.03 + 0.012, 0.62), P(sx * 0.088 + 0.012, 0.62), P(sx * 0.088 + 0.012, 0.71), P(sx * 0.03 + 0.012, 0.71)], outline=olive_dark, fill=(98, 102, 62))
    fd.line([P(-0.103, 0.5), P(0.108, 0.5)], fill=olive_dark, width=3 * S)
    fd.rectangle((P(0.05, 0.2)[0], P(0, 0.2)[1], P(0.088, 0)[0], P(0, 0.218)[1]), fill=(44, 50, 60))
    fd.line([P(-0.022, 0.05), P(-0.01, 0.05)], fill=(40, 30, 26), width=2 * S)
    fd.line([P(0.012, 0.05), P(0.026, 0.05)], fill=(40, 30, 26), width=2 * S)
    fd.line([P(-0.012, 0.094), P(0.018, 0.09)], fill=(150, 90, 76), width=S)
    fd.polygon([P(0.0, 0.055), P(0.012, 0.078), P(-0.004, 0.08)], fill=(186, 130, 98))
    fd.line([P(-0.06, 0.62), P(-0.04, 0.8), P(-0.07, 0.96)], fill=olive_dark, width=S)
    fd.line([P(0.07, 0.6), P(0.06, 0.8), P(0.085, 0.96)], fill=olive_dark, width=S)
    fig = _lit(fig, fmask, 1, (255, 208, 140), (34, 36, 44), 5 * S, 13 * S)
    sd.polygon([(px - 0.12 * H, base_y), (px + 0.14 * H, base_y), (px + 1.3 * H, base_y - 0.05 * H), (px + 1.25 * H, base_y - 0.12 * H)], fill=170)
    image = Image.composite(Image.new('RGB', (w, h), (44, 40, 44)), image, shadow.filter(ImageFilter.GaussianBlur(5 * S)))
    image.paste(fig, (0, 0), fmask.filter(ImageFilter.GaussianBlur(S * 0.7)))

    image = image.filter(ImageFilter.GaussianBlur(S * 0.9)).resize((600, 800), Image.LANCZOS)
    data = np.asarray(image).astype(np.float32)
    grey = data.mean(axis=2, keepdims=True)
    data = grey + (data - grey) * 0.78
    data = 20 + data * 0.87
    data *= np.array([1.03, 0.99, 0.9])
    yy, xx2 = np.mgrid[0:800, 0:600]
    vignette = 1.0 - 0.2 * (((xx2 - 300) / 300.0) ** 2 + ((yy - 400) / 400.0) ** 2)
    data *= vignette[..., None]
    data += np.random.default_rng(6).normal(0, 4.5, data.shape)
    print_ = Image.fromarray(data.clip(0, 255).astype(np.uint8), 'RGB')
    sheet = Image.new('RGBA', (660, 880), (226, 220, 202, 255))
    sheet.paste(print_, (30, 34))
    return save(sheet, work_dir, 'pilot_photo')
