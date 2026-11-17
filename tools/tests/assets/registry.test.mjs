// Every registered asset against its built file: it exists, parses as a binary glTF, stays in
// its budget and carries the names the registry promises. Run with: node --test tools/tests/assets/
import assert from 'node:assert/strict';
import { readdir, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ASSET_BUDGETS, ASSET_KINDS } from '../../../game/src/assets/contract.js';
import { ASSETS } from '../../../game/src/assets/registry/index.js';
import { measureGltf, readGlb } from './glbFile.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(here, '..', '..', '..', 'game', 'assets');
const ART_BUDGET_BYTES = 30 * 1024 * 1024;

// What the game's glTF loader (three.js r185 GLTFLoader, no Draco, Meshopt or KTX2 decoders)
// can read. A file that requires anything else would fail to load in the game.
const SUPPORTED_REQUIRED_EXTENSIONS = new Set([
  'EXT_texture_webp', 'KHR_mesh_quantization', 'KHR_texture_transform',
  'KHR_materials_emissive_strength', 'KHR_materials_clearcoat', 'KHR_materials_unlit',
]);
const EMBEDDED_IMAGE_TYPES = new Set(['image/webp', 'image/jpeg', 'image/png']);

async function listGlbFiles(directory) {
  const found = [];
  let entries = [];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await listGlbFiles(path));
    else found.push(path);
  }
  return found;
}

test('registry entries are well formed', () => {
  assert.ok(Object.keys(ASSETS).length > 0, 'the registry is empty');
  for (const [id, entry] of Object.entries(ASSETS)) {
    assert.match(id, /^[a-z][a-z0-9_]*$/, `${id}: ids are lower-case letters, digits and underscores`);
    assert.ok(ASSET_KINDS.includes(entry.kind), `${id}: unknown kind "${entry.kind}"`);
    assert.match(entry.file, /^[a-z0-9_]+\/[a-z0-9_]+\.glb$/, `${id}: file must be <domain>/<id>.glb`);
    assert.equal(entry.file.split('/')[1], `${id}.glb`, `${id}: the file name must be the id`);
    assert.ok(Number.isInteger(entry.lods) && entry.lods >= 1 && entry.lods <= 4, `${id}: lods must be 1 to 4`);
    for (const anchor of entry.anchors ?? []) assert.match(anchor, /^anchor_/, `${id}: anchor "${anchor}"`);
    for (const collider of entry.colliders ?? []) assert.match(collider, /^col_(box|cyl|sphere|hull|mesh)_/, `${id}: collider "${collider}"`);
  }
});

for (const [id, entry] of Object.entries(ASSETS)) {
  test(`asset ${id}`, async (context) => {
    const path = join(assetsDir, entry.file);
    const glb = await readGlb(path);
    const gltf = glb.json;
    const measured = measureGltf(gltf);
    const budget = { ...ASSET_BUDGETS[entry.kind], ...(entry.maxBytes ? { bytes: entry.maxBytes } : {}) };

    await context.test('is a self-contained binary glTF 2.0 file', () => {
      assert.equal(glb.version, 2);
      assert.equal(glb.declaredLength, glb.bytes, 'the header length must equal the file size');
      assert.equal(gltf.asset?.version, '2.0');
      assert.equal(gltf.buffers?.length, 1, 'exactly one (embedded) buffer');
      assert.equal(gltf.buffers[0].uri, undefined, 'the buffer must be the binary chunk, not a file');
      assert.ok(glb.binaryLength >= gltf.buffers[0].byteLength, 'the binary chunk is shorter than the buffer');
      for (const image of gltf.images ?? []) {
        assert.equal(image.uri, undefined, `image ${image.name}: textures must be embedded`);
        assert.ok(EMBEDDED_IMAGE_TYPES.has(image.mimeType), `image ${image.name}: ${image.mimeType}`);
      }
      for (const extension of gltf.extensionsRequired ?? []) {
        assert.ok(SUPPORTED_REQUIRED_EXTENSIONS.has(extension), `the game cannot load ${extension}`);
      }
      for (const view of gltf.bufferViews ?? []) {
        assert.ok((view.byteOffset ?? 0) + view.byteLength <= gltf.buffers[0].byteLength, 'a buffer view runs past the buffer');
      }
    });

    await context.test('stays within its budget', () => {
      assert.ok(glb.bytes <= budget.bytes, `${glb.bytes} bytes is over the budget of ${budget.bytes}`);
      assert.ok(measured.lods[0].triangles <= budget.triangles,
        `${measured.lods[0].triangles} triangles is over the budget of ${budget.triangles}`);
      assert.ok(measured.lods[0].draws <= budget.draws,
        `${measured.lods[0].draws} draw calls is over the budget of ${budget.draws}`);
    });

    await context.test('has the levels of detail the registry promises', () => {
      assert.equal(measured.lods.length, entry.lods, `registry says ${entry.lods} levels`);
      measured.lods.forEach((lod, index) => {
        assert.equal(lod.level, index, 'levels must be numbered 0, 1, 2 without gaps');
        if (index > 0) {
          assert.ok(lod.triangles < measured.lods[index - 1].triangles,
            `lod${index} (${lod.triangles} triangles) must be lighter than lod${index - 1}`);
        }
      });
    });

    await context.test('carries the names the registry promises', () => {
      for (const name of entry.nodes ?? []) assert.ok(measured.nodes.includes(name), `node "${name}" is missing`);
      for (const name of entry.anchors ?? []) assert.ok(measured.anchors.includes(name), `anchor "${name}" is missing`);
      for (const name of entry.colliders ?? []) assert.ok(measured.colliders.includes(name), `collider "${name}" is missing`);
      for (const name of entry.materials ?? []) assert.ok(measured.materials.includes(name), `material "${name}" is missing`);
      for (const name of entry.animations ?? []) assert.ok(measured.animations.includes(name), `animation "${name}" is missing`);
      assert.deepEqual(measured.badColliders, [], 'collision proxies must be named col_<shape>_<name>');
      for (const name of measured.nodes) {
        assert.match(name, /^[A-Za-z][A-Za-z0-9_]*$/, `node name "${name}" (a Blender ".001" duplicate?)`);
      }
      assert.deepEqual([...measured.anchors].sort(), [...(entry.anchors ?? [])].sort(),
        'the registry must list every anchor in the file');
      assert.deepEqual([...measured.materials].sort(), [...(entry.materials ?? [])].sort(),
        'the registry must list every material in the file');
    });

    await context.test('says what it is in its extras', () => {
      assert.equal(measured.extras.asset, id);
      assert.equal(measured.extras.kind, entry.kind);
      assert.equal(measured.extras.lods, entry.lods);
      assert.equal(measured.extras.bounds?.length, 6);
    });
  });
}

test('game/assets holds only registered models, within the art budget', async () => {
  const registered = new Set(Object.values(ASSETS).map((entry) => entry.file));
  let total = 0;
  for (const path of await listGlbFiles(assetsDir)) {
    const name = relative(assetsDir, path).split('\\').join('/');
    assert.match(name, /\.(glb|webp|jpg|png)$/, `${name}: only binary models and textures belong in game/assets`);
    if (name.endsWith('.glb')) assert.ok(registered.has(name), `${name} is not in the asset registry`);
    total += (await stat(path)).size;
  }
  assert.ok(total <= ART_BUDGET_BYTES, `game/assets is ${total} bytes, over the ${ART_BUDGET_BYTES} byte art budget`);
});
