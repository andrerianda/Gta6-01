// The rules of police crashes (game/src/police/crashRules.js): what wrecks a pursuing car, what
// a wreck does, the staged wreck a scene asks for, and cars knocking officers down.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BURNING_HEALTH, FIRE_SPEED, KNOCKDOWN_SPEED, WRECK_SPEED, burningDamage, carStrikes, heldBurningHealth, isWreckingImpact,
  stagedImpact, stagedWreck, strikeDamage, wreckFor,
} from '../../../game/src/police/crashRules.js';
import { FIRE_BELOW, damageStageOf, DAMAGE_STAGE, impactDamage } from '../../../game/src/vehicles/vehicleDamage.js';

const sequence = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

test('a hard hit on something fixed wrecks a pursuing car; cars, the ground and taps do not', () => {
  assert.equal(isWreckingImpact({ speed: WRECK_SPEED + 1, ground: false }, false), true);
  assert.equal(isWreckingImpact({ speed: WRECK_SPEED + 8, ground: false }, true), false, 'ramming another car is part of the job');
  assert.equal(isWreckingImpact({ speed: WRECK_SPEED + 8, ground: true }, false), false, 'a hard landing is not a crash');
  assert.equal(isWreckingImpact({ speed: WRECK_SPEED - 2, ground: false }, false), false);
});

test('a wreck keeps or loses its lights, its crew climbs out or stays slumped, and only a fast crash may burn', () => {
  const low = wreckFor(WRECK_SPEED + 1, sequence(0.1, 0.1, 0.0, 0.5));
  assert.equal(low.lights, 'flash');
  assert.equal(low.crew, 'out');
  assert.equal(low.burning, false, 'too slow to catch fire whatever the roll');
  assert.ok(low.crewDelay > 1 && low.crewDelay < 3);
  const high = wreckFor(FIRE_SPEED + 2, sequence(0.9, 0.95, 0.1, 0.5));
  assert.equal(high.lights, 'dead');
  assert.equal(high.crew, 'slumped');
  assert.equal(high.burning, true);
  assert.equal(high.hold, false, 'a chase wreck burns down and blows up like any car');
});

test('the burning damage puts a car in the fleet\'s burning stage, and a held wreck never reaches zero', () => {
  const max = 1000;
  for (const health of [1000, 600, 300]) {
    const left = health - burningDamage(health, max);
    assert.equal(damageStageOf(left, max), DAMAGE_STAGE.BURNING, `from ${health}`);
  }
  assert.equal(burningDamage(50, max), 0, 'already lower: nothing more');
  assert.ok(BURNING_HEALTH < FIRE_BELOW);
  let health = BURNING_HEALTH * max;
  for (let step = 0; step < 6000; step += 1) {
    health -= 0.026 * max / 60;
    health = heldBurningHealth(health, max);
  }
  assert.ok(health > 0 && damageStageOf(health, max) === DAMAGE_STAGE.BURNING, `held at ${health}`);
  assert.equal(heldBurningHealth(0, max), 0, 'a blown-up wreck stays blown up');
});

test('a staged wreck burns, holds and keeps its bar flashing unless told otherwise', () => {
  assert.deepEqual(stagedWreck(true), { lights: 'flash', crew: 'slumped', burning: true, hold: true, crewDelay: 0.4 });
  const custom = stagedWreck({ lights: 'dead', crew: 'out', burning: false });
  assert.equal(custom.lights, 'dead');
  assert.equal(custom.crew, 'out');
  assert.equal(custom.burning, false);
  assert.equal(stagedWreck({ lights: 'disco' }).lights, 'flash');
});

test('a staged impact hits the nose and takes the damage asked through the fleet\'s own maths', () => {
  const mass = 1750;
  const impact = stagedImpact(7, { x: 10, y: 1, z: 20 }, Math.PI / 2, mass, 450);
  // rotation.y = +90 degrees: the nose points along -X.
  assert.ok(Math.abs(impact.position.x - (10 - 2.1)) < 1e-9 && Math.abs(impact.position.z - 20) < 1e-9);
  assert.ok(Math.abs(impact.normal.x + 1) < 1e-9, 'normal from the car towards the obstacle');
  assert.equal(impact.otherId, null);
  assert.equal(impact.ground, false);
  assert.ok(Math.abs(impactDamage(impact.energy, mass) - 450) < 1e-6);
  assert.ok(impact.speed >= WRECK_SPEED, 'the impact itself is a wrecking one');
});

test('a moving car knocks down an officer in front of it, not one beside or behind it, nor at a crawl', () => {
  const heading = 0; // nose along -Z
  assert.equal(carStrikes(0, -2.4, heading, 10), true);
  assert.equal(carStrikes(0, -2.4, heading, KNOCKDOWN_SPEED - 1), false);
  assert.equal(carStrikes(0, 2.4, heading, 10), false, 'behind a car going forward');
  assert.equal(carStrikes(0, 2.4, heading, -6), true, 'behind a car reversing');
  assert.equal(carStrikes(1.6, -1, heading, 10), false, 'beside it');
  assert.ok(strikeDamage(5) < 20 && strikeDamage(16) >= 100);
});
