// The release checker passes a small valid hand-in and catches each way the scorer would refuse
// one: a symlink in game/, a network import, a screenshot too small, a dossier that is not the
// library's. It also checks the dynamic-import scan and the outline estimate.
// Run with: node --test "tools/tests/release/*.test.mjs"
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { deflateSync } from 'node:zlib';
import { buildDossier } from '../../../vendor/makefun-game.ts';
import {
  checkDossier, checkGameFiles, checkReferences, checkScreenshots, checkScriptsParse,
  DOSSIER_CAPS, dynamicImportLiterals, judgeOutline, pictureSize,
} from '../../release/checkEntry.mjs';

/** A grey PNG of the given size, built with zlib (one filter byte per row). */
function greyPng(width, height) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 0;
  const raw = Buffer.alloc((width + 1) * height, 128);
  for (let y = 0; y < height; y++) raw[y * (width + 1)] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function crc32(bytes) {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

let out;

before(() => {
  out = mkdtempSync(join(tmpdir(), 'marazul-release-'));
  mkdirSync(join(out, 'game/src/world'), { recursive: true });
  mkdirSync(join(out, 'game/vendor/three'), { recursive: true });
  mkdirSync(join(out, 'screenshots'));
  writeFileSync(join(out, 'game/index.html'), '<!doctype html><title>t</title>\n<script type="importmap">{ "imports": { "three": "./vendor/three/three.module.min.js" } }</script>\n<link rel="modulepreload" href="./vendor/three/three.module.min.js">\n<script type="module" src="./src/main.js"></script>\n');
  writeFileSync(join(out, 'game/vendor/three/three.module.min.js'), 'export const REVISION = "185";\n');
  writeFileSync(join(out, 'game/src/main.js'), "import { REVISION } from 'three';\nexport function startCity() { return import('./world/cityStreets.js'); }\n");
  writeFileSync(join(out, 'game/src/world/cityStreets.js'), "// import('./missing.js') in a comment is not an import\nexport const cityStreets = ['Gran Via'];\n");
  for (const name of ['1-cover.png', '2-street.png', '3-sea.png']) writeFileSync(join(out, 'screenshots', name), greyPng(640, 480));
  writeFileSync(join(out, 'dossier.json'), buildDossier(out, DOSSIER_CAPS));
});

after(() => rmSync(out, { recursive: true, force: true }));

test('a small valid hand-in passes every scorer row', () => {
  for (const result of [checkGameFiles(join(out, 'game')), checkReferences(join(out, 'game')), checkScreenshots(join(out, 'screenshots')), checkDossier(out), checkScriptsParse(join(out, 'game'))]) {
    assert.equal(result.pass, true, `${result.name}: ${result.detail}`);
  }
  assert.deepEqual(checkReferences(join(out, 'game')).reachable.sort(), ['src/main.js', 'src/world/cityStreets.js', 'vendor/three/three.module.min.js']);
});

test('a symlink anywhere under game/ fails game_files', () => {
  const link = join(out, 'game/src/world/alias.js');
  symlinkSync('cityStreets.js', link);
  try {
    assert.equal(checkGameFiles(join(out, 'game')).pass, false);
  } finally {
    unlinkSync(link);
  }
});

test('a network import or a missing file fails references', () => {
  const path = join(out, 'game/src/world/cityStreets.js');
  writeFileSync(path, "import 'https://cdn.example.com/lib.js';\nexport const cityStreets = [];\n");
  assert.match(checkReferences(join(out, 'game')).detail, /network/);
  writeFileSync(path, "export const load = () => import('./nowhere.js');\n");
  assert.match(checkReferences(join(out, 'game')).detail, /names no file/);
  writeFileSync(path, "// import('./missing.js') in a comment is not an import\nexport const cityStreets = ['Gran Via'];\n");
  assert.equal(checkReferences(join(out, 'game')).pass, true);
});

test('screenshots: too few, too small or not a whole picture fail', () => {
  const extra = join(out, 'screenshots', '4-small.png');
  writeFileSync(extra, greyPng(640, 360));
  assert.match(checkScreenshots(join(out, 'screenshots')).detail, /short side 360/);
  writeFileSync(extra, greyPng(640, 480).subarray(0, 60));
  assert.match(checkScreenshots(join(out, 'screenshots')).detail, /IEND/);
  unlinkSync(extra);
  assert.deepEqual(pictureSize(greyPng(1280, 800)), { format: 'png', width: 1280, height: 800 });
});

test('a dossier that is not byte for byte the library\'s fails dossier_matches', () => {
  const path = join(out, 'dossier.json');
  const good = buildDossier(out, DOSSIER_CAPS);
  writeFileSync(path, Buffer.concat([Buffer.from(good), Buffer.from('\n')]));
  assert.equal(checkDossier(out).pass, false);
  writeFileSync(path, good);
  assert.equal(checkDossier(out).pass, true);
});

test('dynamic imports are found by literal, never inside strings, comments or regular expressions', () => {
  const source = [
    "const a = import('./a.js');",
    "const b = `import('./not.js')`;",
    "// import('./not-either.js')",
    "const c = /import\\('x'\\)/.test(s) ? 1 / 2 : import(`./c.js`, { with: {} });",
    'const d = import(name);',
  ].join('\n');
  assert.deepEqual(dynamicImportLiterals(source), ['./a.js', './c.js']);
});

test('the outline estimate lists headings in dossier order and stops at the budget', () => {
  const text = ['## Game', '', 'Source files: 3 (10 bytes)', 'Totals: 5 files and directories (20 bytes)', '', '## Sources', '',
    '### game/index.html (1 line, 10 bytes)', '### game/src/main.js (2 lines, 20 bytes)', '### game/src/world/cityStreets.js (2 lines, 30 bytes)'].join('\n');
  const roomy = judgeOutline(text, 3, 5000);
  assert.equal(roomy.shown, 3);
  assert.equal(roomy.headings[1].path, 'game/src/main.js');
  assert.ok(judgeOutline(text, 3, 470).shown < 3);
});
