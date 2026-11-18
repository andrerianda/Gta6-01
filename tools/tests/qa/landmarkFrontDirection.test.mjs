// Guards a bug QA found on 18 Nov: a plan landmark's frontX/frontZ are the unit DIRECTION its lot
// faces (docs/CITY_PLAN.md), but some systems used them as a position (`landmark.frontX ?? landmark.x`),
// so every busted and wasted respawn landed at the world origin. Any `frontX ?? <something>.x`
// (or frontZ with .z) in the shipped game is that mistake. Run with:
//   node --test "tools/tests/qa/*.test.mjs"
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** A front direction falling back to a position: `a.frontX ?? b.x` or `a.frontZ ?? b.z`. */
export const FRONT_AS_POSITION = /\bfront([XZ])\s*\?\?\s*[\w.]*\.([xz])\b/;

async function sourceFiles(directory, found = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await sourceFiles(path, found);
    else if (entry.name.endsWith('.js')) found.push(path);
  }
  return found;
}

test('the pattern catches the mistake and leaves direction uses alone', () => {
  assert.ok(FRONT_AS_POSITION.test('{ x: station.frontX ?? station.x, z: station.frontZ ?? station.z }'));
  assert.ok(FRONT_AS_POSITION.test('Math.hypot((landmark.frontX ?? landmark.x) - x, 1)'));
  assert.ok(!FRONT_AS_POSITION.test('const fx = landmark.frontX ?? 0;'));
  assert.ok(!FRONT_AS_POSITION.test('let x = door.x + frontX * 3.5;'));
});

// Known offenders on 18 Nov 07:50 (filed in /tmp/marazul/qa/BUGS.md to player and police):
// player/healthAndRespawn.js (nearestLandmark, respawn) and police/policeDispatchRuntime.js
// (release, station spawn points). Remove the todo option once they stand at the entrance.
test('no shipped code uses a landmark front direction as a position', { todo: 'healthAndRespawn.js and policeDispatchRuntime.js still do' }, async () => {
  const found = [];
  for (const file of await sourceFiles(join(root, 'game', 'src'))) {
    const lines = (await readFile(file, 'utf8')).split('\n');
    lines.forEach((line, index) => {
      if (FRONT_AS_POSITION.test(line)) found.push(`${relative(root, file)}:${index + 1} ${line.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(found, [], `front direction used as a position:\n${found.join('\n')}`);
});
