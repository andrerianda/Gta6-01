// The bounty's screenshots: shots.json names 3 or 4 valid pictures in cover-first order, each a
// scene of the showcase director; screenshots/ obeys the scorer's rules (count, bytes, sides);
// the director's entry module keeps the import rule and size of docs/ARCHITECTURE.md section 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageSizeOf, readShotList, screenshotProblems, SCREENSHOT_RULES } from '../../take-screenshots.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

test('shots.json names 3 or 4 director scenes in sorted, cover-first order', async () => {
  const list = await readShotList(join(ROOT, 'shots.json'));
  assert.ok(list.length >= SCREENSHOT_RULES.minCount && list.length <= SCREENSHOT_RULES.maxCount);
  const names = list.map((shot) => shot.name);
  assert.deepEqual([...names].sort(), names, 'the list is in name order, so its first entry is the cover');
  const { SHOWCASE_DIRECTOR_SCENES } = await import('../../../game/src/showcase/showcaseDirector.js');
  for (const shot of list) assert.ok(SHOWCASE_DIRECTOR_SCENES.includes(shot.scene), `${shot.scene} is a director scene`);
});

test('screenshots/ obeys the scorer: 3 or 4 PNG or JPEG pictures, small enough, the right sides', async () => {
  const directory = join(ROOT, 'screenshots');
  const names = (await readdir(directory)).filter((name) => !name.startsWith('.')).sort();
  const pictures = await Promise.all(names.map(async (name) => ({ name, bytes: new Uint8Array(await readFile(join(directory, name))) })));
  assert.deepEqual(screenshotProblems(pictures), []);
});

test('imageSizeOf reads PNG and JPEG headers, and the rules catch an oversized picture', () => {
  const png = new Uint8Array(32);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  new DataView(png.buffer).setUint32(16, 1280);
  new DataView(png.buffer).setUint32(20, 800);
  assert.deepEqual(imageSizeOf(png), { type: 'png', width: 1280, height: 800 });
  // SOI, then an SOF0 segment: length 17, precision 8, height 480, width 1400.
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x05, 0x78, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(imageSizeOf(jpeg), { type: 'jpeg', width: 1400, height: 480 });
  const problems = screenshotProblems([{ name: 'a.png', bytes: png }, { name: 'b.jpg', bytes: jpeg }]);
  assert.equal(problems.length, 2, problems.join('; '));
});

test('the director entry module stays small and imports nothing statically outside core', async () => {
  const source = await readFile(join(ROOT, 'game/src/showcase/showcaseDirector.js'), 'utf8');
  assert.ok(Buffer.byteLength(source) < 6144, 'under 6 KB');
  for (const [, path] of source.matchAll(/^import\s[^'"]*['"]([^'"]+)['"]/gm)) {
    assert.ok(path.startsWith('../core/'), `${path} is a core import`);
  }
});
