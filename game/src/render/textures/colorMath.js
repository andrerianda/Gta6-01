// Colour conversions for texture painting. Recipes describe colours the way a designer does
// (sRGB hex numbers such as 0xd9c7a0, CSS strings, or HSL) and paint in linear light, which is
// what physically based shading needs; the finished colour map is encoded back to sRGB bytes.
// Albedo here means the linear reflectance of a surface: about 0.04 for fresh tar, 0.1 for worn
// asphalt, 0.35 for concrete, 0.6 for white paint. Nothing real is pure black or pure white.
//
//   const sand = parseColor(0xd9c7a0);                 // [r, g, b] linear, each 0..1
//   const css = colorToCss(mixColors(sand, parseColor('#3a2f25'), 0.3));

/**
 * Parses a colour into linear RGB.
 * @param {number | string | ArrayLike<number>} color An sRGB hex number (0xrrggbb), a CSS hex
 *   string ('#rgb' or '#rrggbb'), or an array that is already linear [r, g, b].
 * @returns {[number, number, number]} Linear components in 0..1.
 */
export function parseColor(color) {
  if (typeof color === 'number') {
    return [srgbToLinear(((color >> 16) & 255) / 255), srgbToLinear(((color >> 8) & 255) / 255), srgbToLinear((color & 255) / 255)];
  }
  if (typeof color === 'string') {
    let hex = color.trim().replace(/^#/, '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    const value = Number.parseInt(hex, 16);
    return Number.isFinite(value) ? parseColor(value) : [0.5, 0.5, 0.5];
  }
  return [color[0], color[1], color[2]];
}

/** One sRGB component (0..1) to linear light. @param {number} value @returns {number} */
export function srgbToLinear(value) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** One linear component (0..1) to sRGB. @param {number} value @returns {number} */
export function linearToSrgb(value) {
  const v = value < 0 ? 0 : value > 1 ? 1 : value;
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}

/** Entries of the linear-to-sRGB byte table. */
export const SRGB_TABLE_SIZE = 4096;

/**
 * A table from quantised linear values to sRGB bytes: SRGB_BYTE_TABLE[round(linear * 4095)].
 * Encoding a megapixel through it takes a millisecond instead of a power function per texel.
 * @type {Uint8Array}
 */
export const SRGB_BYTE_TABLE = (() => {
  const table = new Uint8Array(SRGB_TABLE_SIZE);
  for (let i = 0; i < SRGB_TABLE_SIZE; i += 1) table[i] = Math.round(linearToSrgb(i / (SRGB_TABLE_SIZE - 1)) * 255);
  return table;
})();

/**
 * Linear interpolation between two linear colours.
 * @param {ArrayLike<number>} from
 * @param {ArrayLike<number>} to
 * @param {number} t
 * @returns {[number, number, number]}
 */
export function mixColors(from, to, t) {
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t];
}

/** A colour multiplied by a factor. @returns {[number, number, number]} */
export function scaleColor(color, factor) {
  return [color[0] * factor, color[1] * factor, color[2] * factor];
}

/** The relative luminance of a linear colour (the weight the eye gives it). @returns {number} */
export function luminanceOf(color) {
  return 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
}

/**
 * Pulls a colour toward its own grey (amount 1) or pushes it away (negative amounts).
 * @param {ArrayLike<number>} color Linear.
 * @param {number} amount
 * @returns {[number, number, number]}
 */
export function desaturateColor(color, amount) {
  const grey = luminanceOf(color);
  return [color[0] + (grey - color[0]) * amount, color[1] + (grey - color[1]) * amount, color[2] + (grey - color[2]) * amount];
}

/**
 * A linear colour from hue, saturation and lightness given in the usual sRGB-based HSL.
 * @param {number} hue Degrees, any value.
 * @param {number} saturation 0..1
 * @param {number} lightness 0..1
 * @returns {[number, number, number]}
 */
export function hslToLinear(hue, saturation, lightness) {
  const h = (((hue % 360) + 360) % 360) / 60;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs((h % 2) - 1));
  const m = lightness - chroma / 2;
  const [r, g, b] = h < 1 ? [chroma, x, 0] : h < 2 ? [x, chroma, 0] : h < 3 ? [0, chroma, x] : h < 4 ? [0, x, chroma] : h < 5 ? [x, 0, chroma] : [chroma, 0, x];
  return [srgbToLinear(r + m), srgbToLinear(g + m), srgbToLinear(b + m)];
}

/**
 * Keeps a linear albedo physically plausible: no component below `floor` or above `ceiling`.
 * @param {ArrayLike<number>} color
 * @param {number} [floor]
 * @param {number} [ceiling]
 * @returns {[number, number, number]}
 */
export function plausibleAlbedo(color, floor = 0.02, ceiling = 0.85) {
  const limit = (v) => (v < floor ? floor : v > ceiling ? ceiling : v);
  return [limit(color[0]), limit(color[1]), limit(color[2])];
}

/** A linear colour as an sRGB hex number (0xrrggbb). @returns {number} */
export function colorToHex(color) {
  const byte = (v) => Math.round(linearToSrgb(v) * 255);
  return (byte(color[0]) << 16) | (byte(color[1]) << 8) | byte(color[2]);
}

/**
 * A linear colour as a CSS colour string for canvas painting.
 * @param {ArrayLike<number>} color Linear.
 * @param {number} [alpha]
 * @returns {string}
 */
export function colorToCss(color, alpha = 1) {
  const byte = (v) => Math.round(linearToSrgb(v) * 255);
  return alpha >= 1 ? `rgb(${byte(color[0])}, ${byte(color[1])}, ${byte(color[2])})` : `rgba(${byte(color[0])}, ${byte(color[1])}, ${byte(color[2])}, ${alpha})`;
}
