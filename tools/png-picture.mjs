// Measures a PNG screenshot without looking at it: how bright it is and whether it is blank (one
// flat colour, as a black frame or a page that never drew is). The smoke test and
// `tools/capture.mjs --check-picture` use it to catch an empty picture; it does not replace
// opening the image and looking at it. Node's standard library only: zlib inflates the pixels.
import { inflateSync } from 'node:zlib';

/**
 * Decodes a PNG and measures its picture on a grid of samples.
 * @param {Buffer} png The bytes of an 8-bit RGB or RGBA, non-interlaced PNG (what Chromium's
 *   screenshots are).
 * @returns {{ width: number, height: number, meanLuminance: number, dominantShare: number,
 *   colours: number, blank: boolean }} `meanLuminance` is 0..255; `dominantShare` is the share of
 *   samples that have the most common colour (colours are compared at 5 bits per channel);
 *   `colours` counts the distinct sampled colours; `blank` is true when nearly every sample has
 *   the same colour.
 */
export function measurePngPicture(png) {
  const { width, height, channels, pixels } = decodePng(png);
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / SAMPLE_TARGET)));
  const counts = new Map();
  let samples = 0;
  let luminance = 0;
  for (let y = Math.floor(step / 2); y < height; y += step) {
    for (let x = Math.floor(step / 2); x < width; x += step) {
      const at = (y * width + x) * channels;
      const red = pixels[at];
      const green = pixels[at + 1];
      const blue = pixels[at + 2];
      luminance += 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      const key = ((red >> 3) << 10) | ((green >> 3) << 5) | (blue >> 3);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      samples += 1;
    }
  }
  let dominant = 0;
  for (const count of counts.values()) dominant = Math.max(dominant, count);
  const dominantShare = samples ? dominant / samples : 1;
  return {
    width,
    height,
    meanLuminance: Math.round((luminance / Math.max(1, samples)) * 10) / 10,
    dominantShare: Math.round(dominantShare * 1000) / 1000,
    colours: counts.size,
    blank: dominantShare > BLANK_SHARE,
  };
}

/** A picture is blank when more than this share of it is one colour (a caption may remain). */
export const BLANK_SHARE = 0.97;

const SAMPLE_TARGET = 120000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Decodes the pixels of an 8-bit RGB or RGBA, non-interlaced PNG.
 * @param {Buffer} png
 * @returns {{ width: number, height: number, channels: 3 | 4, pixels: Uint8Array }} Rows from the
 *   top, `channels` bytes per pixel.
 */
export function decodePng(png) {
  if (png.length < 8 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG file');
  let width = 0;
  let height = 0;
  let channels = 0;
  const data = [];
  for (let at = 8; at + 8 <= png.length;) {
    const length = png.readUInt32BE(at);
    const type = png.toString('latin1', at + 4, at + 8);
    const body = png.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const depth = body[8];
      const colourType = body[9];
      const interlace = body[12];
      if (depth !== 8 || (colourType !== 2 && colourType !== 6) || interlace !== 0) {
        throw new Error(`unsupported PNG (bit depth ${depth}, colour type ${colourType}, interlace ${interlace})`);
      }
      channels = colourType === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      data.push(body);
    } else if (type === 'IEND') {
      break;
    }
    at += 12 + length;
  }
  if (!width || !height || !channels) throw new Error('PNG without a header');

  // Each row is one filter byte followed by the filtered bytes; undo the filter in place.
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(data));
  if (raw.length < (stride + 1) * height) throw new Error('PNG pixel data is short');
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const from = y * (stride + 1) + 1;
    const to = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? pixels[to + x - channels] : 0;
      const up = y > 0 ? pixels[to + x - stride] : 0;
      const upLeft = x >= channels && y > 0 ? pixels[to + x - stride - channels] : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) predicted = paethPredictor(left, up, upLeft);
      pixels[to + x] = (raw[from + x] + predicted) & 0xff;
    }
  }
  return { width, height, channels, pixels };
}

/** PNG's Paeth predictor: whichever of left, up and up-left is nearest to left + up - upLeft. */
function paethPredictor(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const fromLeft = Math.abs(estimate - left);
  const fromUp = Math.abs(estimate - up);
  const fromUpLeft = Math.abs(estimate - upLeft);
  if (fromLeft <= fromUp && fromLeft <= fromUpLeft) return left;
  return fromUp <= fromUpLeft ? up : upLeft;
}
