"""Builds the pictures of the ONDA Marea 7 handset for the incoming call, with Blender's Python
(bpy), from the repository root:

    /opt/marazul-blender/bin/python art/build_phone.py                 # the final pictures (CPU)
    /opt/marazul-blender/bin/python art/build_phone.py --draft         # 24 samples, only a preview
    /opt/marazul-blender/bin/python art/build_phone.py --gpu

It models the phone (art/blender/ui/onda_phone.py), renders the body pass and the glass pass with
Cycles on a transparent film at twice the shipped size, and writes

    game/assets/ui/onda_phone_body.webp    the handset, the screen a clean dark rectangle
    game/assets/ui/onda_phone_glass.webp   what lies over the live screen: reflections, camera hole

plus a 640 px preview on a dusk backdrop in /tmp/marazul/flight/s3/phone/. It prints one line of
JSON with the picture's size, the screen's four corners (top left, top right, bottom right, bottom
left, in pixels of the shipped picture) and the file sizes; the corners are typed into
game/src/ui/call/screenQuadMatrix.js (PHONE_PICTURE). --draft writes nothing in the repository.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SCRATCH = '/tmp/marazul/flight/s3/phone'
OUT = os.path.join(ROOT, 'game', 'assets', 'ui')
SHIPPED = (304, 560)          # the pictures in the game
sys.path.insert(0, os.path.join(HERE, 'blender', 'ui'))


def glass_overlay(image, hole):
    """Turns the glass pass (reflections on black) into light laid over the live screen: the
    brighter the reflection, the more opaque; the camera hole stays solid."""
    import numpy as np
    from PIL import Image
    data = np.asarray(image.convert('RGBA')).astype(np.float32) / 255
    rgb, coverage = data[..., :3], data[..., 3]
    peak = rgb.max(axis=2)
    alpha = np.clip(peak * 1.15, 0, 1) * coverage
    colour = np.where(alpha[..., None] > 0.004, rgb / np.maximum(peak[..., None], 1e-4), 1.0)
    ys, xs = np.mgrid[0:data.shape[0], 0:data.shape[1]]
    distance = np.hypot(xs + 0.5 - hole[0], ys + 0.5 - hole[1])
    solid = np.clip(hole[2] + 0.5 - distance, 0, 1)
    alpha = np.maximum(alpha, solid * coverage)
    colour = np.where(solid[..., None] > 0, rgb * solid[..., None] + colour * (1 - solid[..., None]), colour)
    out = np.dstack([np.clip(colour, 0, 1), alpha])
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA')


def preview(body, glass, corners, path):
    """The phone on a dusk backdrop with a lit stand-in screen under the glass, 640 px wide."""
    from PIL import Image, ImageDraw
    sheet = Image.new('RGB', (640, body.height + 40), (0, 0, 0))
    draw = ImageDraw.Draw(sheet)
    for y in range(sheet.height):
        t = y / sheet.height
        draw.line([(0, y), (640, y)], fill=(int(60 + 110 * t), int(70 + 60 * t), int(110 - 30 * t)))
    for index, lit in enumerate((False, True)):
        x = 10 + index * 320
        sheet.paste(body, (x, 20), body)
        if lit:
            screen = Image.new('RGBA', body.size, (0, 0, 0, 0))
            ImageDraw.Draw(screen).polygon([tuple(c) for c in corners], fill=(24, 60, 92, 255))
            sheet.paste(screen, (x, 20), screen)
        sheet.paste(glass, (x, 20), glass)
    sheet.save(path, quality=80)


def main(argv):
    draft = '--draft' in argv
    import bpy  # noqa: F401  (fails early with a clear error outside Blender's Python)
    from PIL import Image
    import onda_phone
    os.makedirs(SCRATCH, exist_ok=True)
    scale = 1 if draft else 2
    width, height = SHIPPED[0] * scale, SHIPPED[1] * scale
    model = onda_phone.build()
    onda_phone.frame_camera(model, width, height)
    corners = [(round(x / scale, 2), round(y / scale, 2)) for x, y in onda_phone.screen_corners(model, width, height)]
    hole = [v / scale for v in onda_phone.camera_hole(model, width, height)]
    samples = 24 if draft else (int(argv[argv.index('--samples') + 1]) if '--samples' in argv else 160)
    paths = onda_phone.render_passes(model, SCRATCH, width, height, samples, 'GPU' if '--gpu' in argv else 'CPU')
    body = Image.open(paths['body']).convert('RGBA').resize(SHIPPED, Image.LANCZOS)
    glass = glass_overlay(Image.open(paths['glass']).convert('RGBA').resize(SHIPPED, Image.LANCZOS), hole)
    preview(body, glass, corners, os.path.join(SCRATCH, 'preview.jpg'))
    report = {'size': SHIPPED, 'corners': corners, 'hole': [round(v, 2) for v in hole], 'draft': draft}
    if not draft:
        os.makedirs(OUT, exist_ok=True)
        body_path, glass_path = os.path.join(OUT, 'onda_phone_body.webp'), os.path.join(OUT, 'onda_phone_glass.webp')
        body.save(body_path, 'WEBP', quality=90, method=6)
        glass.save(glass_path, 'WEBP', quality=84, method=6)
        report['bytes'] = {'body': os.path.getsize(body_path), 'glass': os.path.getsize(glass_path)}
    print(json.dumps(report))


if __name__ == '__main__':
    main(sys.argv[1:])
