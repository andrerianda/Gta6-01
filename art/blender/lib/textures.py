"""Image work on numpy arrays: everything between a raw Cycles bake and an encoded game texture.

Images are float32 arrays of shape (height, width, channels) in Blender's order, row 0 at the
bottom, linear values. Encoding flips them to the top-down order of image files.
"""
import io

import numpy as np
from PIL import Image

# Lossy WebP quality by map. Normal maps keep the most: their errors turn into lighting errors.
WEBP_QUALITY = {'base': 82, 'orm': 80, 'normal': 90, 'emissive': 80}


def linear_to_srgb(image):
    """The sRGB transfer curve, for colour maps (base colour, emissive)."""
    image = np.clip(image, 0.0, 1.0)
    return np.where(image <= 0.0031308, image * 12.92,
                    1.055 * np.power(np.maximum(image, 1e-9), 1.0 / 2.4) - 0.055)


def srgb_to_linear(image):
    """The inverse of linear_to_srgb()."""
    image = np.clip(image, 0.0, 1.0)
    return np.where(image <= 0.04045, image / 12.92, np.power((image + 0.055) / 1.055, 2.4))


def fill_margins(image, mask):
    """Extends the covered texels (mask > 0) outwards over the whole image (push-pull), so
    bilinear filtering and mipmaps never pull in an unbaked colour at an island's edge."""
    image = np.asarray(image, dtype=np.float32)
    channels = image.shape[2]
    weight = (np.asarray(mask) > 0).astype(np.float32)
    color = image * weight[..., None]
    levels = []
    while color.shape[0] > 1 or color.shape[1] > 1:
        levels.append((color, weight))
        height, width = color.shape[:2]
        pad_h, pad_w = height % 2, width % 2
        if pad_h or pad_w:
            color = np.pad(color, ((0, pad_h), (0, pad_w), (0, 0)))
            weight = np.pad(weight, ((0, pad_h), (0, pad_w)))
            height, width = height + pad_h, width + pad_w
        summed = color.reshape(height // 2, 2, width // 2, 2, channels).sum(axis=(1, 3))
        count = weight.reshape(height // 2, 2, width // 2, 2).sum(axis=(1, 3))
        color = summed / np.maximum(count, 1e-6)[..., None]
        weight = (count > 0).astype(np.float32)
        color *= weight[..., None]
    for fine_color, fine_weight in reversed(levels):
        height, width = fine_color.shape[:2]
        coarse = np.repeat(np.repeat(color, 2, axis=0), 2, axis=1)[:height, :width]
        color = np.where(fine_weight[..., None] > 0, fine_color, coarse)
    return color


def smooth(image, mask, passes=1):
    """A 3x3 blur that only mixes covered texels: takes the grain out of a low-sample AO bake."""
    image = np.asarray(image, dtype=np.float32)
    weight = (np.asarray(mask) > 0).astype(np.float32)
    for _ in range(passes):
        total = np.zeros_like(image)
        count = np.zeros_like(weight)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                shifted_weight = np.roll(weight, (dy, dx), axis=(0, 1))
                total += np.roll(image, (dy, dx), axis=(0, 1)) * shifted_weight[..., None]
                count += shifted_weight
        image = np.where(weight[..., None] > 0, total / np.maximum(count, 1e-6)[..., None], image)
    return image


def resize(image, size):
    """Resamples to (size, size): an exact box filter when shrinking by a whole factor."""
    height, width, channels = image.shape
    if height == size and width == size:
        return image
    if height % size == 0 and width % size == 0 and height // size == width // size:
        factor = height // size
        return image.reshape(size, factor, size, factor, channels).mean(axis=(1, 3))
    planes = [np.asarray(Image.fromarray(image[..., c].astype(np.float32), mode='F')
                         .resize((size, size), Image.LANCZOS)) for c in range(channels)]
    return np.stack(planes, axis=-1)


def normalize_normals(normal_map):
    """Re-normalises a tangent-space normal map (0..1 encoded) after filtering or resizing."""
    vectors = normal_map[..., :3] * 2.0 - 1.0
    length = np.linalg.norm(vectors, axis=-1, keepdims=True)
    flat = np.array([0.0, 0.0, 1.0], dtype=np.float32)
    vectors = np.where(length > 1e-4, vectors / np.maximum(length, 1e-6), flat)
    return vectors * 0.5 + 0.5


def pack_orm(occlusion, roughness, metallic):
    """Packs three single-channel maps into the glTF layout: R occlusion, G roughness,
    B metalness."""
    return np.stack([occlusion, roughness, metallic], axis=-1).astype(np.float32)


def occlude_color(base, occlusion, strength=0.3, tint=(0.75, 0.68, 0.60)):
    """Multiplies part of the ambient occlusion into the base colour, slightly warm, so creases
    stay dark in direct sunlight too (real-time AO maps only dim ambient light)."""
    shade = 1.0 - strength * (1.0 - occlusion[..., None])
    warm = 1.0 - strength * (1.0 - occlusion[..., None]) * (1.0 - np.asarray(tint, dtype=np.float32))
    result = base.copy()
    result[..., :3] = base[..., :3] * shade * warm
    return result


def make_tileable(image, blend=0.25):
    """Makes a square image wrap seamlessly by cross-fading its borders with the image shifted
    half a tile (width `blend` of the tile on each side)."""
    size = image.shape[0]
    shifted = np.roll(image, (size // 2, size // 2), axis=(0, 1))
    ramp = np.clip(np.minimum(np.arange(size), size - 1 - np.arange(size)) / (blend * size), 0, 1)
    ramp = ramp * ramp * (3.0 - 2.0 * ramp)
    weight = np.minimum(ramp[:, None], ramp[None, :])[..., None]
    return image * weight + shifted * (1.0 - weight)


def to_bytes(image, srgb=False):
    """An 8-bit, top-down array ready for an image file (sRGB-encoding the RGB when asked)."""
    image = np.asarray(image, dtype=np.float32)
    if srgb:
        encoded = image.copy()
        encoded[..., :3] = linear_to_srgb(image[..., :3])
        image = encoded
    return (np.clip(image[::-1], 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)


def to_pil(pixels):
    """A Pillow image from an 8-bit array with 1, 3 or 4 channels."""
    if pixels.ndim == 2 or pixels.shape[2] == 1:
        return Image.fromarray(pixels.reshape(pixels.shape[0], pixels.shape[1]), mode='L')
    return Image.fromarray(pixels, mode='RGBA' if pixels.shape[2] == 4 else 'RGB')


def encode_webp(pixels, kind='base', quality=None):
    """WebP bytes for an 8-bit array; `kind` picks the quality ('base', 'orm', 'normal',
    'emissive')."""
    buffer = io.BytesIO()
    to_pil(pixels).save(buffer, format='WEBP', quality=quality or WEBP_QUALITY.get(kind, 82),
                        method=6, alpha_quality=92)
    return buffer.getvalue()


def save_png(pixels, path):
    """Writes an 8-bit array as a PNG (working files under /tmp only, never in the repository)."""
    to_pil(pixels).save(path, format='PNG', compress_level=1)
    return path


def save_jpeg(pixels, path, quality=70):
    """Writes an 8-bit RGB array as a JPEG (previews and contact sheets)."""
    to_pil(pixels[..., :3]).save(path, format='JPEG', quality=quality)
    return path
