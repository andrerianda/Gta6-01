// The sea boundary: states by distance, hysteresis with the clear radius, the repeated warning, the
// weapons-free ring, the hard limit, the open sea, the silenced guard, and the air wanted level.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeaBoundary } from '../../../game/src/flight/defence/seaBoundary.js';
import { airWantedLevel, airWantedWord } from '../../../game/src/flight/defence/airWantedLevel.js';
import { SEA_AND_AIRSPACE_CHART } from '../../../game/src/catalog/seaAndAirspaceChart.js';

const RADII = SEA_AND_AIRSPACE_CHART.boundary;

test('inside -> warned -> violated by distance, with one scramble edge', () => {
  const boundary = createSeaBoundary(RADII);
  assert.equal(boundary.update(4900, 0.1).changed, false);
  assert.equal(boundary.state, 'inside');
  let step = boundary.update(5001, 0.1);
  assert.equal(boundary.state, 'warned');
  assert.ok(step.changed && step.warn && !step.scramble);
  assert.equal(step.previous, 'inside');
  step = boundary.update(6001, 0.1);
  assert.equal(boundary.state, 'violated');
  assert.ok(step.scramble);
  assert.equal(boundary.update(6100, 0.1).scramble, false);
});

test('hysteresis: warned holds between the clear and the warn radius', () => {
  const boundary = createSeaBoundary(RADII);
  boundary.update(5100, 0.1);
  boundary.update(4800, 0.1);
  assert.equal(boundary.state, 'warned');
  assert.ok(Math.abs(boundary.distanceToReturn - 200) < 1e-9);
  const step = boundary.update(4599, 0.1);
  assert.equal(boundary.state, 'inside');
  assert.ok(step.cleared);
  assert.equal(boundary.distanceToReturn, 0);
  boundary.update(4800, 0.1);
  assert.equal(boundary.state, 'inside');
});

test('violated falls back to warned inside the warn radius, then to inside', () => {
  const boundary = createSeaBoundary(RADII);
  boundary.update(6500, 0.1);
  assert.equal(boundary.state, 'violated');
  boundary.update(5500, 0.1);
  assert.equal(boundary.state, 'violated');
  boundary.update(4990, 0.1);
  assert.equal(boundary.state, 'warned');
  boundary.update(4500, 0.1);
  assert.equal(boundary.state, 'inside');
});

test('the warning repeats about every twelve seconds while outside', () => {
  const boundary = createSeaBoundary(RADII, { warningEvery: 12 });
  let warnings = 0;
  for (let t = 0; t < 40; t += 0.1) if (boundary.update(5600, 0.1).warn) warnings += 1;
  assert.equal(warnings, 4);
});

test('weapons free beyond its radius, with hysteresis; the hard limit brings down once', () => {
  const boundary = createSeaBoundary(RADII);
  boundary.update(7100, 0.1);
  assert.equal(boundary.weaponsFree, false);
  assert.ok(boundary.update(7201, 0.1).weaponsFreeBegan);
  boundary.update(7000, 0.1);
  assert.equal(boundary.weaponsFree, true);
  boundary.update(6850, 0.1);
  assert.equal(boundary.weaponsFree, false);
  boundary.update(8500, 0.1);
  assert.equal(boundary.update(8601, 0.1).bringDown, true);
  assert.equal(boundary.update(8700, 0.1).bringDown, false);
});

test('with the sea open the state is open and nothing happens', () => {
  const boundary = createSeaBoundary(RADII);
  const step = boundary.update(9000, 0.1, { open: true });
  assert.equal(boundary.state, 'open');
  assert.ok(!step.warn && !step.scramble && !step.bringDown && !boundary.weaponsFree);
  // Closing the sea again with the aircraft far out goes straight to the violation.
  const closed = boundary.update(6500, 0.1, { open: false });
  assert.equal(boundary.state, 'violated');
  assert.ok(closed.scramble && closed.warn);
});

test('a silenced guard says nothing; a boat is only warned', () => {
  const boundary = createSeaBoundary(RADII);
  const step = boundary.update(8000, 0.1, { silenced: true });
  assert.equal(boundary.state, 'inside');
  assert.ok(!step.warn && !step.scramble);
  const boat = createSeaBoundary(RADII);
  const sail = boat.update(9000, 0.1, { warningOnly: true });
  assert.equal(boat.state, 'warned');
  assert.ok(sail.warn && !sail.scramble && !sail.bringDown && !boat.weaponsFree);
});

test('air wanted: none, watched, intercepted, weapons free', () => {
  assert.equal(airWantedLevel('idle', 'inside', false), 0);
  assert.equal(airWantedLevel('idle', 'warned', false), 1);
  assert.equal(airWantedLevel('returning', 'inside', false), 1);
  for (const stage of ['scramble', 'intercept', 'formate', 'order', 'warningShots', 'escort', 'searching']) assert.equal(airWantedLevel(stage, 'violated', false), 2);
  assert.equal(airWantedLevel('fire', 'inside', false), 3);
  assert.equal(airWantedLevel('intercept', 'violated', true), 3);
  assert.equal(airWantedWord('intercept', 2), 'INTERCEPT');
  assert.equal(airWantedWord('warningShots', 2), 'WARNING SHOTS');
  assert.equal(airWantedWord('fire', 3), 'WEAPONS FREE');
  assert.equal(airWantedWord('searching', 2), 'LOST');
  assert.equal(airWantedWord('idle', 0), '');
});
