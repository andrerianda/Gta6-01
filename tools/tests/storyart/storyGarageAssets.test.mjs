// The garage story models (game/assets/story/, registry storyGarage.js): every registered file
// exists, holds the nodes, anchors and materials its entry promises, and is within its budget of
// triangles, draw calls and bytes; the set and the props together stay under 3 MiB.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ASSET_KINDS, assetBudgetOf } from '../../../game/src/assets/contract.js';
import { ASSETS } from '../../../game/src/assets/registry/index.js';
import { STORY_GARAGE_ASSETS } from '../../../game/src/assets/registry/storyGarage.js';

const ROOT = new URL('../../../game/assets/', import.meta.url);

function readGlb(file) {
  const data = readFileSync(new URL(file, ROOT));
  const length = data.readUInt32LE(12);
  return { bytes: data.length, document: JSON.parse(data.subarray(20, 20 + length).toString('utf8')) };
}

function measure(document) {
  let triangles = 0;
  let draws = 0;
  for (const node of document.nodes ?? []) {
    if (node.mesh === undefined || /lod[1-9]$/.test(node.name)) continue;
    for (const primitive of document.meshes[node.mesh].primitives) {
      draws += 1;
      const accessor = document.accessors[primitive.indices ?? primitive.attributes.POSITION];
      triangles += accessor.count / 3;
    }
  }
  return { triangles, draws };
}

const IDS = ['garage_office_set', 'foreclosure_letter', 'framed_pilot_photo', 'bank_seal_notice', 'forged_pass_card',
  'uniform_on_hanger', 'payment_case'];

test('the seven garage story assets are registered', () => {
  assert.deepEqual(Object.keys(STORY_GARAGE_ASSETS).sort(), [...IDS].sort());
  for (const id of IDS) {
    assert.equal(ASSETS[id], STORY_GARAGE_ASSETS[id]);
    assert.equal(ASSETS[id].file, `story/${id}.glb`);
    assert.ok(ASSET_KINDS.includes(ASSETS[id].kind));
  }
});

for (const id of IDS) {
  test(`${id}: the file holds what the entry promises, within budget`, () => {
    const entry = STORY_GARAGE_ASSETS[id];
    const { bytes, document } = readGlb(entry.file);
    const names = new Set((document.nodes ?? []).map((node) => node.name));
    const materials = new Set((document.materials ?? []).map((material) => material.name));
    for (const name of [...(entry.nodes ?? []), ...(entry.anchors ?? [])]) assert.ok(names.has(name), `node ${name}`);
    for (const name of entry.materials ?? []) assert.ok(materials.has(name), `material ${name}`);
    assert.deepEqual([...materials].sort(), [...entry.materials].sort(), 'no material the entry does not name');
    const budget = assetBudgetOf(entry);
    const { triangles, draws } = measure(document);
    assert.ok(triangles <= budget.triangles, `${triangles} triangles > ${budget.triangles}`);
    assert.ok(draws <= budget.draws, `${draws} draws > ${budget.draws}`);
    assert.ok(bytes <= budget.bytes, `${bytes} bytes > ${budget.bytes}`);
    assert.equal(document.scenes[0].extras.asset, id);
    assert.equal(document.scenes[0].extras.lods, entry.lods);
  });
}

test('the office has its seven anchors and two named nodes; the case has its lid', () => {
  assert.deepEqual([...STORY_GARAGE_ASSETS.garage_office_set.anchors].sort(), ['anchor_hanger', 'anchor_letter', 'anchor_phone',
    'anchor_photo', 'anchor_seal', 'anchor_seat', 'anchor_stand_visitor']);
  assert.ok(STORY_GARAGE_ASSETS.garage_office_set.nodes.includes('lamp_desk'));
  assert.ok(STORY_GARAGE_ASSETS.garage_office_set.nodes.includes('door_office'));
  assert.ok(STORY_GARAGE_ASSETS.garage_office_set.materials.includes('lamp_desk'));
  assert.ok(STORY_GARAGE_ASSETS.payment_case.nodes.includes('lid'));
});

test('the garage story assets stay under 3 MiB together, the set under 1.6 MiB', () => {
  let total = 0;
  for (const id of IDS) total += readGlb(STORY_GARAGE_ASSETS[id].file).bytes;
  assert.ok(total <= 3 * 1024 * 1024, `${total} bytes`);
  assert.ok(readGlb('story/garage_office_set.glb').bytes <= 1.6 * 1024 * 1024);
});
