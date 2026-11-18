// Names on the props' sign anchors: every listed object and anchor exists in the registry, every
// class has names of our own (or the catalog's invented brands), and the port terminal gets a
// billboard at a front corner, clear of the yard stock.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const { PROP_SIGN_ANCHORS, signNamesOf, SHOP_NAMES, CARGO_NAMES } = await import('../../../game/src/world/props/propSignFaces.js');
const { PROP_ASSETS, PROP_SET_OBJECTS } = await import('../../../game/src/assets/registry/props.js');
const { layOutContainerTerminal } = await import('../../../game/src/world/props/portTerminalLayout.js');

test('every sign-bearing object and anchor is in the registry', () => {
  const allNodes = new Set(Object.values(PROP_ASSETS).flatMap((entry) => entry.anchors ?? []));
  for (const [object, faces] of Object.entries(PROP_SIGN_ANCHORS)) {
    const owner = Object.entries(PROP_SET_OBJECTS).find(([, objects]) => objects[object]);
    assert.ok(owner, `${object} is a registered set object`);
    for (const [anchor] of faces) {
      assert.ok(owner[1][object].anchors.includes(anchor), `${object} has ${anchor}`);
      if (allNodes.size) assert.ok(allNodes.has(`${anchor}__${object}`), `${anchor}__${object} is a node of its file`);
    }
  }
});

test('every class paints names, and the shop and cargo names are our own', () => {
  for (const signClass of ['billboard', 'cargo', 'cargoBand', 'band', 'stand', 'vending']) {
    const names = signNamesOf(signClass);
    assert.ok(names.length >= 2, `${signClass}: ${names.length} names`);
    for (const brand of names) assert.ok(brand.name && brand.colors?.primary, `${signClass}: ${brand.id} paints`);
  }
  assert.ok(signNamesOf('band').every((brand) => SHOP_NAMES.includes(brand.name)));
  assert.ok(CARGO_NAMES.every((name) => signNamesOf('cargo').some((brand) => brand.name === name)));
});

test('the container terminal gets one billboard at a front corner, its pole clear of the stock', () => {
  const ring = [0, 0, 100, 0, 100, 84, 0, 84];
  const items = layOutContainerTerminal({ id: 5, ring, y: 1 });
  const boards = items.filter((item) => item.object === 'billboard_monopole');
  assert.equal(boards.length, 1);
  const [board] = boards;
  assert.equal(board.assetId, 'set_roadside');
  assert.equal(board.kind, 'billboard');
  assert.ok(board.z < 5 && (board.x < 5 || board.x > 95), 'at a front corner');
  for (const item of items) {
    if (item === board || item.fence) continue;
    assert.ok(Math.hypot(item.x - board.x, item.z - board.z) > 1.5, `${item.object} clear of the pole`);
  }
});
