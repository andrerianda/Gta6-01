// Tests of the HUD's text formatting (game/src/ui/hudFormatting.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approachCounter, displayNameFromId, formatAmmunition, formatCash, formatCashDelta, formatSpeed, formatTimer,
  streetLineFor,
} from '../../../game/src/ui/hudFormatting.js';

test('cash has a dollar sign and thousands separators', () => {
  assert.equal(formatCash(0), '$0');
  assert.equal(formatCash(999), '$999');
  assert.equal(formatCash(12450), '$12,450');
  assert.equal(formatCash(1234567.6), '$1,234,568');
  assert.equal(formatCash(-50), '-$50');
  assert.equal(formatCash(Number.NaN), '$0');
});

test('cash changes carry their sign', () => {
  assert.equal(formatCashDelta(500), '+$500');
  assert.equal(formatCashDelta(-1200), '-$1,200');
});

test('ammunition shows magazine and reserve, nothing for melee', () => {
  assert.deepEqual(formatAmmunition(12, 84), { magazine: '12', reserve: '84' });
  assert.deepEqual(formatAmmunition(null, null), { magazine: '', reserve: '' });
  assert.deepEqual(formatAmmunition(3, undefined), { magazine: '3', reserve: '' });
  assert.deepEqual(formatAmmunition(-2, 5.4), { magazine: '0', reserve: '5' });
});

test('speed converts metres per second to the chosen unit', () => {
  assert.deepEqual(formatSpeed(10, 'kmh'), { value: 36, text: '36', unit: 'KM/H' });
  assert.equal(formatSpeed(-10, 'kmh').value, 36);
  assert.equal(formatSpeed(26.8224, 'mph').value, 60);
  assert.equal(formatSpeed(Number.NaN).value, 0);
});

test('timers count in minutes and seconds, rounding up', () => {
  assert.equal(formatTimer(65), '1:05');
  assert.equal(formatTimer(0.2), '0:01');
  assert.equal(formatTimer(0), '0:00');
  assert.equal(formatTimer(-3), '0:00');
  assert.equal(formatTimer(600), '10:00');
});

test('display names come from ids', () => {
  assert.equal(displayNameFromId('playa_dorada'), 'Playa Dorada');
  assert.equal(displayNameFromId('centro'), 'Centro');
  assert.equal(displayNameFromId(''), '');
});

test('the cash counter approaches its target and lands on it', () => {
  let shown = 0;
  for (let i = 0; i < 200 && shown !== 1000; i += 1) shown = approachCounter(shown, 1000, 1 / 60);
  assert.equal(shown, 1000);
  const step = approachCounter(0, 1000, 0.12, 0.12);
  assert.ok(Math.abs(step - 500) < 1e-9);
  assert.equal(approachCounter(999.7, 1000, 0.016), 1000);
});

test('the location card names a street only on it or near its edge', () => {
  const avenue = { name: 'Gran Vía Marazul', halfWidth: 14 };
  assert.equal(streetLineFor({ segment: avenue, distance: 3 }), 'Gran Vía Marazul', 'on the road');
  assert.equal(streetLineFor({ segment: avenue, distance: 14 + 24 }), 'Gran Vía Marazul', '24 m past the edge');
  assert.equal(streetLineFor({ segment: avenue, distance: 14 + 40 }), null, 'on the beach under the pier');
  assert.equal(streetLineFor({ segment: { name: 'Calle 9', width: 10 }, distance: 28 }), 'Calle 9', 'half of width');
  assert.equal(streetLineFor(null), null, 'no road near');
  assert.equal(streetLineFor({ segment: { name: null }, distance: 0 }), null, 'an unnamed road');
});
