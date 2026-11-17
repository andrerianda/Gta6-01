// The naming contract and budgets: the game side (contract.js) must say exactly what the
// Blender side says (art/blender/lib/naming.py and report.py), and the vendored glTF add-on
// bundle must import nothing but "three". Run with: node --test tools/tests/assets/
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ANCHOR_PREFIX, ASSET_BUDGETS, ASSET_KINDS, COLLIDER_PREFIX, COLLIDER_SHAPES, ROLE, colliderShapeOf,
  isAnchorName, isColliderName, lodLevelOf, lodPartOf, materialRoleOf,
} from '../../../game/src/assets/contract.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('level-of-detail names', () => {
  assert.equal(lodLevelOf('lod0'), 0);
  assert.equal(lodLevelOf('body_lod2'), 2);
  assert.equal(lodLevelOf('wheel_fl'), null);
  assert.equal(lodLevelOf('lodge'), null);
  assert.equal(lodPartOf('body_lod1'), 'body');
  assert.equal(lodPartOf('lod1'), '');
  assert.equal(lodPartOf('wheel_fl'), 'wheel_fl');
});

test('anchor and collision proxy names', () => {
  assert.ok(isAnchorName('anchor_light'));
  assert.ok(!isAnchorName('lamp_anchor'));
  assert.ok(isColliderName('col_box_body'));
  assert.equal(colliderShapeOf('col_cyl_pole'), 'cyl');
  assert.equal(colliderShapeOf('col_blob_pole'), null);
  assert.equal(colliderShapeOf('body_lod0'), null);
});

test('material roles', () => {
  assert.equal(materialRoleOf('atlas'), ROLE.ATLAS);
  assert.equal(materialRoleOf('paint'), ROLE.PAINT);
  assert.equal(materialRoleOf('paint_trim'), ROLE.PAINT);
  assert.equal(materialRoleOf('painted'), ROLE.ATLAS);
  assert.equal(materialRoleOf('glass'), ROLE.GLASS);
  assert.equal(materialRoleOf('glass_tint'), ROLE.GLASS);
  assert.equal(materialRoleOf('lamp_head'), ROLE.LAMP);
  assert.equal(materialRoleOf('lamp'), ROLE.ATLAS);
  assert.equal(materialRoleOf('cutout'), ROLE.CUTOUT);
  assert.equal(materialRoleOf('tile_stucco'), ROLE.TILE);
});

test('the game and Blender sides agree on prefixes and shapes', async () => {
  const naming = await readFile(join(root, 'art', 'blender', 'lib', 'naming.py'), 'utf8');
  const constant = (name) => new RegExp(`^${name} = '([^']*)'`, 'm').exec(naming)?.[1];
  assert.equal(constant('ANCHOR_PREFIX'), ANCHOR_PREFIX);
  assert.equal(constant('COLLIDER_PREFIX'), COLLIDER_PREFIX);
  for (const [key, value] of Object.entries(ROLE)) assert.equal(constant(`ROLE_${key}`), value);
  const shapes = /^COLLIDER_SHAPES = \(([^)]*)\)/m.exec(naming)[1].match(/'([a-z]+)'/g).map((text) => text.slice(1, -1));
  assert.deepEqual(shapes, [...COLLIDER_SHAPES]);
});

test('the game and Blender sides agree on budgets', async () => {
  const report = await readFile(join(root, 'art', 'blender', 'lib', 'report.py'), 'utf8');
  for (const kind of ASSET_KINDS) {
    const line = new RegExp(`'${kind}':\\s*\\{([^}]*)\\}`).exec(report);
    assert.ok(line, `report.py has no budget for "${kind}"`);
    for (const key of ['triangles', 'draws', 'bytes']) {
      const value = Number(new RegExp(`'${key}':\\s*([0-9]+)`).exec(line[1])[1]);
      assert.equal(ASSET_BUDGETS[kind][key], value, `${kind}.${key}`);
    }
  }
});

test('the vendored glTF add-ons import only the bare specifier "three"', async () => {
  const bundle = await readFile(join(root, 'game', 'vendor', 'three', 'three-gltf-addons.min.js'), 'utf8');
  const specifiers = [...bundle.matchAll(/\b(?:import|export)\s*[\w\s{},*$]*\bfrom\s*["']([^"']+)["']/g)]
    .map((match) => match[1]);
  assert.ok(specifiers.length > 0, 'the bundle should import from "three"');
  for (const specifier of specifiers) assert.equal(specifier, 'three');
  assert.ok(!/\bimport\s*\(/.test(bundle), 'the bundle must not import anything dynamically');
  for (const name of ['GLTFLoader', 'SkeletonUtils', 'BufferGeometryUtils']) {
    assert.ok(new RegExp(`\\bas ${name}\\b`).test(bundle), `the bundle must export ${name}`);
  }
});
