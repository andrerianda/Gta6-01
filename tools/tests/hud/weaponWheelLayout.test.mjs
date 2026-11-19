// The weapon wheel's geometry and choices: the slot under the mouse, the weapons a slot offers,
// the one it shows, stepping through a slot, and the wedge outline.
import assert from 'node:assert/strict';
import test from 'node:test';
import { WEAPON_WHEEL_SLOTS } from '../../../game/src/catalog/weaponCatalog.js';
import {
  cycleWeaponInSlot, orderedWheelSlots, ownedWeaponsOfSlot, shownWeaponOfSlot, wedgePath, wheelAngleOf, wheelSlotAt,
} from '../../../game/src/ui/weaponWheelLayout.js';

const ordered = orderedWheelSlots(WEAPON_WHEEL_SLOTS);

test('slots come in wheel order, clockwise from the top', () => {
  assert.equal(ordered.length, 8);
  assert.deepEqual(ordered.map((slot) => slot.angleDegrees), [0, 45, 90, 135, 180, 225, 270, 315]);
});

test('the pointer chooses the slot it points at, nothing in the dead zone', () => {
  assert.equal(wheelAngleOf(0, -10), 0);
  assert.equal(wheelAngleOf(10, 0), 90);
  assert.equal(wheelAngleOf(-10, 0), 270);
  assert.equal(wheelSlotAt(0, -80, ordered, 20), 'unarmed');
  assert.equal(wheelSlotAt(80, 0, ordered, 20), 'handgun');
  assert.equal(wheelSlotAt(0, 80, ordered, 20), 'shotgun');
  assert.equal(wheelSlotAt(-60, -60, ordered, 20), 'thrown');
  assert.equal(wheelSlotAt(-3, -80, ordered, 20), 'unarmed');      // just left of the top
  assert.equal(wheelSlotAt(5, 5, ordered, 20), null);
});

test('a slot offers what the lead owns and shows the weapon in hand first', () => {
  const owns = (id) => ['baseball_bat', 'tire_iron', 'pistol'].includes(id);
  const melee = ownedWeaponsOfSlot(WEAPON_WHEEL_SLOTS.melee, owns);
  assert.deepEqual(melee, ['tire_iron', 'baseball_bat']);
  assert.deepEqual(ownedWeaponsOfSlot(WEAPON_WHEEL_SLOTS.unarmed, () => false), ['fists']);
  assert.deepEqual(ownedWeaponsOfSlot(WEAPON_WHEEL_SLOTS.rifle, owns), []);
  assert.equal(shownWeaponOfSlot(melee, 'baseball_bat', 'tire_iron'), 'baseball_bat');
  assert.equal(shownWeaponOfSlot(melee, 'pistol', 'baseball_bat'), 'baseball_bat');
  assert.equal(shownWeaponOfSlot(melee, 'pistol', undefined), 'tire_iron');
  assert.equal(shownWeaponOfSlot([], 'pistol', 'smg'), null);
  assert.equal(cycleWeaponInSlot(melee, 'tire_iron', 1), 'baseball_bat');
  assert.equal(cycleWeaponInSlot(melee, 'tire_iron', -1), 'baseball_bat');
  assert.equal(cycleWeaponInSlot(melee, 'baseball_bat', 1), 'tire_iron');
});

test('a wedge outline starts on the outer arc and closes on the inner one', () => {
  const path = wedgePath(0, 40, 50, 100);
  assert.match(path, /^M-34\.20 -93\.97A100 100 0 0 1 34\.20 -93\.97L17\.10 -46\.98A50 50 0 0 0 -17\.10 -46\.98Z$/);
});
