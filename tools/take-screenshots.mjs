// Takes the bounty's screenshots: every picture that shots.json names, each a showcase scene of
// the real game (index.html?shot=<scene>) rendered in headless Chromium, saved as a 16:10 JPEG of
// 1280x800 (it fits the judge's 768x480 cover cell exactly) and stepped down in quality until it
// is under the scorer's 256 KiB. The pictures are captured into a staging directory first; with
// --install they then replace the contents of screenshots/ (the first by name is the cover), and
// every image there that shots.json does not name is removed, so the folder holds exactly the
// 3 or 4 pictures the scorer allows.
//
//   node tools/take-screenshots.mjs                         capture all into /tmp/marazul/showcase/shots
//   node tools/take-screenshots.mjs --only police-chase-dusk
//   node tools/take-screenshots.mjs --install               capture all, then install into screenshots/
//   node tools/take-screenshots.mjs --install --reuse       install the staged pictures without capturing
//   node tools/take-screenshots.mjs --check                 check screenshots/ against the scorer's rules
//
// shots.json is a list of { "name": "1-cover-golden-hour.jpg", "query": "?shot=cover-golden-hour&seed=1&quality=cinematic" }.
// It exits 0 when every picture was captured (and installed) and obeys the rules, 1 otherwise.
import { readFile, readdir, stat, unlink, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** The scorer's rules for screenshots/ (the bounty's RULES.txt, "screenshots"). */
export const SCREENSHOT_RULES = Object.freeze({
  minCount: 3,
  maxCount: 4,
  maxBytes: 262144,
  maxLongSide: 1280,
  minShortSide: 480,
  namePattern: /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/,
});

const REPOSITORY = resolve(fileURLToPath(new URL('..', import.meta.url)));
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

const USAGE = `
node tools/take-screenshots.mjs [options]
  --only <names>      comma-separated picture or scene names (default: every entry of shots.json)
  --out-dir <dir>     staging directory (default /tmp/marazul/showcase/shots)
  --install           replace screenshots/ with the staged pictures named in shots.json
  --reuse             with --install: do not capture, install what is staged
  --check             only check screenshots/ against the scorer's rules
  --accept-errors     keep a picture whose page logged console errors (they are still printed);
                      for other owners' faults that do not touch the picture, never for the hand-in
  --size <WxH>        viewport in CSS pixels (default 960x600)
  --scale <n>         device scale factor (default 1.3333333333333333: 1280x800 pictures)
  --quality <n>       first JPEG quality tried (default 90)
  --max-bytes <n>     largest picture (default 258048, a margin under the 262144 cap)
  --shots <file>      the list (default shots.json at the repository root)
`;

/**
 * Reads and checks the list of pictures.
 * @param {string} file
 * @returns {Promise<{name: string, query: string, scene: string}[]>}
 */
export async function readShotList(file) {
  const list = JSON.parse(await readFile(file, 'utf8'));
  if (!Array.isArray(list)) throw new Error(`${file}: expected a list of {name, query}`);
  return list.map((entry, index) => {
    const name = String(entry?.name ?? '');
    const query = String(entry?.query ?? '');
    if (!SCREENSHOT_RULES.namePattern.test(name) || !IMAGE_EXTENSIONS.has(extname(name).toLowerCase())) {
      throw new Error(`${file}[${index}]: "${name}" is not a valid picture name (letters, digits, . _ -; .jpg, .jpeg or .png)`);
    }
    const scene = new URLSearchParams(query.replace(/^\?/, '')).get('shot');
    if (!scene) throw new Error(`${file}[${index}]: the query "${query}" names no ?shot=<scene>`);
    return { name, query: query.startsWith('?') ? query : `?${query}`, scene };
  });
}

/**
 * The type and size of a PNG or JPEG from its bytes.
 * @param {Uint8Array} bytes
 * @returns {{type: 'png' | 'jpeg', width: number, height: number} | null}
 */
export function imageSizeOf(bytes) {
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { type: 'png', width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) return null;
      const marker = bytes[at + 1];
      const length = (bytes[at + 2] << 8) | bytes[at + 3];
      const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) return { type: 'jpeg', width: (bytes[at + 7] << 8) | bytes[at + 8], height: (bytes[at + 5] << 8) | bytes[at + 6] };
      at += 2 + length;
    }
  }
  return null;
}

/**
 * Checks pictures against the scorer's rules.
 * @param {{name: string, bytes: Uint8Array}[]} pictures In name order.
 * @returns {string[]} The problems found (none when the set is valid).
 */
export function screenshotProblems(pictures) {
  const problems = [];
  if (pictures.length < SCREENSHOT_RULES.minCount || pictures.length > SCREENSHOT_RULES.maxCount) {
    problems.push(`${pictures.length} pictures; the scorer wants ${SCREENSHOT_RULES.minCount} to ${SCREENSHOT_RULES.maxCount}`);
  }
  for (const { name, bytes } of pictures) {
    if (!SCREENSHOT_RULES.namePattern.test(name)) problems.push(`${name}: not a valid name`);
    if (bytes.length > SCREENSHOT_RULES.maxBytes) problems.push(`${name}: ${bytes.length} bytes, over ${SCREENSHOT_RULES.maxBytes}`);
    const size = imageSizeOf(bytes);
    if (!size) {
      problems.push(`${name}: neither a PNG nor a JPEG`);
      continue;
    }
    const long = Math.max(size.width, size.height);
    const short = Math.min(size.width, size.height);
    if (long > SCREENSHOT_RULES.maxLongSide) problems.push(`${name}: long side ${long} over ${SCREENSHOT_RULES.maxLongSide}`);
    if (short < SCREENSHOT_RULES.minShortSide) problems.push(`${name}: short side ${short} under ${SCREENSHOT_RULES.minShortSide}`);
  }
  return problems;
}

/** The image files of a directory in name order (names starting with '.' skipped, as the scorer does). */
async function picturesIn(directory) {
  const names = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.') && IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort();
  return Promise.all(names.map(async (name) => ({ name, bytes: new Uint8Array(await readFile(join(directory, name))) })));
}

async function main() {
  const { readCommandLine, failUsage } = await import('./command-line.mjs');
  const given = readCommandLine({
    usage: USAGE,
    options: {
      only: { type: 'string' },
      'out-dir': { type: 'string', default: '/tmp/marazul/showcase/shots' },
      install: { type: 'boolean' },
      reuse: { type: 'boolean' },
      check: { type: 'boolean' },
      'accept-errors': { type: 'boolean' },
      size: { type: 'string', default: '960x600' },
      scale: { type: 'number', min: 0.25, max: 4, default: 4 / 3 },
      quality: { type: 'integer', min: 30, max: 100, default: 90 },
      'max-bytes': { type: 'integer', min: 10000, max: SCREENSHOT_RULES.maxBytes, default: 258048 },
      shots: { type: 'string', default: join(REPOSITORY, 'shots.json') },
    },
  });
  const screenshotsDir = join(REPOSITORY, 'screenshots');
  if (given.check) process.exit(report(screenshotProblems(await picturesIn(screenshotsDir))));

  const list = await readShotList(given.shots);
  const only = given.only ? new Set(String(given.only).split(',').map((each) => each.trim())) : null;
  const chosen = only ? list.filter((shot) => only.has(shot.name) || only.has(shot.scene)) : list;
  if (chosen.length === 0) failUsage(`--only names nothing in ${given.shots}`);
  const match = /^(\d+)x(\d+)$/.exec(String(given.size));
  if (!match) failUsage(`--size must be WxH, not ${given.size}`);
  const outDir = resolve(String(given['out-dir']));
  await mkdir(outDir, { recursive: true });

  let failed = false;
  if (!given.reuse) {
    const { capturePage } = await import('./capture.mjs');
    for (const shot of chosen) {
      const out = join(outDir, shot.name);
      const summary = await capturePage({
        root: join(REPOSITORY, 'game'),
        page: `index.html${shot.query}`,
        width: Number(match[1]),
        height: Number(match[2]),
        scale: given.scale,
        out,
        jpegQuality: given.quality,
        maxBytes: given['max-bytes'],
        checkPicture: true,
        timeoutMs: 900000,
        waitMs: 1500,
      });
      const saved = summary.bytes > 0 && await stat(out).then(() => true, () => false);
      const size = saved ? imageSizeOf(new Uint8Array(await readFile(out))) : null;
      const kept = summary.ok || (given['accept-errors'] && summary.ready && size !== null);
      console.log(JSON.stringify({ shot: shot.name, scene: shot.scene, ok: summary.ok, kept, bytes: summary.bytes, size, errors: summary.errors, seconds: Math.round(summary.timings.totalMs / 1000) }));
      if (!kept) failed = true;
    }
  }
  if (!given.install) process.exit(failed ? 1 : 0);
  if (failed) {
    console.error('not installing: a capture failed');
    process.exit(1);
  }

  // Install: every picture of the list must be staged and valid before screenshots/ is touched.
  const staged = [];
  for (const shot of list) {
    const file = join(outDir, shot.name);
    const exists = await stat(file).then(() => true, () => false);
    if (!exists) {
      console.error(`not installing: ${file} has not been captured`);
      process.exit(1);
    }
    staged.push({ name: shot.name, bytes: new Uint8Array(await readFile(file)) });
  }
  const problems = screenshotProblems(staged);
  if (problems.length) process.exit(report(problems));
  for (const picture of staged) await writeFile(join(screenshotsDir, picture.name), picture.bytes);
  const keep = new Set(list.map((shot) => shot.name));
  for (const old of await picturesIn(screenshotsDir)) {
    if (!keep.has(old.name)) await unlink(join(screenshotsDir, old.name));
  }
  process.exit(report(screenshotProblems(await picturesIn(screenshotsDir)), staged.map((each) => each.name)));
}

function report(problems, installed = null) {
  console.log(JSON.stringify({ ok: problems.length === 0, installed, problems }));
  return problems.length === 0 ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error?.stack || String(error));
    process.exit(1);
  });
}
