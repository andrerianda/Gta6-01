// The default control bindings: the weapon wheel on Tab in play, the shop context for in-world
// shop menus (menu actions, Escape as back), and a label for every bound action.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONTROL_BINDINGS,
  DEFAULT_ACTION_LABELS,
  INPUT_CONTEXTS,
  resolveControlBindings,
} from '../../../game/src/core/input/controlBindings.js';

test('weapon wheel: Tab on foot and in a vehicle', () => {
  assert.deepEqual(DEFAULT_CONTROL_BINDINGS.onFoot.weaponWheel, ['Tab']);
  assert.deepEqual(DEFAULT_CONTROL_BINDINGS.inVehicle.weaponWheel, ['Tab']);
});

test('shop context: the menu actions, Escape also goes back', () => {
  assert.equal(INPUT_CONTEXTS.SHOP, 'shop');
  const shop = DEFAULT_CONTROL_BINDINGS.shop;
  for (const action of Object.keys(DEFAULT_CONTROL_BINDINGS.menu)) assert.ok(shop[action], `shop lacks ${action}`);
  assert.ok(shop.menuBack.includes('Escape'));
  const { bindings } = resolveControlBindings({});
  assert.deepEqual(bindings.shop.menuBack, shop.menuBack);
});

test('every action of the play contexts has a label for menus and prompts', () => {
  for (const contextName of ['always', 'onFoot', 'inVehicle', 'menu', 'shop']) {
    for (const action of Object.keys(DEFAULT_CONTROL_BINDINGS[contextName])) {
      assert.equal(typeof DEFAULT_ACTION_LABELS[action], 'string', `${contextName}.${action} has no label`);
    }
  }
});
