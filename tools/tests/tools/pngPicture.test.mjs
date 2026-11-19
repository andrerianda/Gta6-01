// The PNG reader behind the blank-picture check decodes what Chromium writes and tells a drawn
// picture from a flat one. Run with: node --test "tools/tests/tools/*.test.mjs"
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateSync } from 'node:zlib';
import { decodePng, measurePngPicture } from '../../png-picture.mjs';

/** A PNG chunk; the reader does not check the CRC, so it is left at zero. */
function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body, Buffer.alloc(4)]);
}

/**
 * Encodes pixels as an 8-bit PNG, filtering each row with the PNG filter `filterOf(y)` so that
 * the decoder's five filters are all exercised.
 */
function encodePng(width, height, channels, colourAt, filterOf = () => 0) {
  const stride = width * channels;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) pixels.set(colourAt(x, y).slice(0, channels), y * stride + x * channels);
  }
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const filter = filterOf(y);
    raw[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0;
      const estimate = left + up - upLeft;
      const distances = [Math.abs(estimate - left), Math.abs(estimate - up), Math.abs(estimate - upLeft)];
      const paeth = distances[0] <= distances[1] && distances[0] <= distances[2] ? left : distances[1] <= distances[2] ? up : upLeft;
      const predicted = [0, left, up, (left + up) >> 1, paeth][filter];
      raw[y * (stride + 1) + 1 + x] = (pixels[y * stride + x] - predicted) & 0xff;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = channels === 4 ? 6 : 2;
  return {
    pixels,
    png: Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  };
}

const gradient = (x, y) => [(x * 7) & 0xff, (y * 5) & 0xff, (x * y) & 0xff, 255];

test('pixels survive every PNG row filter, with and without alpha', () => {
  for (const channels of [3, 4]) {
    const { png, pixels } = encodePng(40, 25, channels, gradient, (y) => y % 5);
    const decoded = decodePng(png);
    assert.equal(decoded.width, 40);
    assert.equal(decoded.height, 25);
    assert.equal(decoded.channels, channels);
    assert.deepEqual(decoded.pixels, pixels);
  }
});

test('a drawn picture is not blank', () => {
  const measured = measurePngPicture(encodePng(320, 180, 3, gradient).png);
  assert.equal(measured.blank, false);
  assert.ok(measured.colours > 50);
  assert.ok(measured.dominantShare < 0.5);
});

test('a black frame is blank, and so is a flat page with a small caption', () => {
  const black = measurePngPicture(encodePng(320, 180, 4, () => [0, 0, 0, 255]).png);
  assert.equal(black.blank, true);
  assert.equal(black.meanLuminance, 0);
  assert.equal(black.dominantShare, 1);

  const caption = (x, y) => (y > 170 && x < 60 ? [255, 255, 255, 255] : [11, 16, 22, 255]);
  assert.equal(measurePngPicture(encodePng(320, 180, 3, caption).png).blank, true);
});

test('a half sky, half ground picture is not blank', () => {
  const horizon = (x, y) => (y < 90 ? [140, 190, 230, 255] : [190, 170, 140, 255]);
  const measured = measurePngPicture(encodePng(320, 180, 3, horizon).png);
  assert.equal(measured.blank, false);
  assert.equal(measured.colours, 2);
});

test('what is not a supported PNG is refused with a clear error', () => {
  assert.throws(() => decodePng(Buffer.from('not a png at all')), /not a PNG/);
  const sixteenBit = encodePng(4, 4, 3, gradient).png;
  sixteenBit[8 + 8 + 8] = 16;
  assert.throws(() => decodePng(sixteenBit), /unsupported PNG/);
});
