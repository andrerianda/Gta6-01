// Boats and helicopters in the fleet (vehicleCraftControls.js): which catalog models are craft, and
// how the car controls the player and AI fill steer a boat and fly a helicopter of the physics
// library (a real Helicopter climbs on Space, flies forward on W and lands on S; a Boat gets under way).
import assert from 'node:assert/strict';
import test from 'node:test';
import { VEHICLE_CATALOG } from '../../../game/src/catalog/vehicleCatalog.js';
import {
  boatInputFrom, craftKindOf, helicopterControlsActive, helicopterInputFrom,
} from '../../../game/src/vehicles/vehicleCraftControls.js';
import { PhysicsWorld } from '../../../game/src/physics/PhysicsWorld.js';
import { Boat, deriveBoatTuning } from '../../../game/src/physics/watercraft/Boat.js';
import { Helicopter, deriveHelicopterTuning } from '../../../game/src/physics/aircraft/Helicopter.js';

const controls = (values = {}) => ({ throttle: 0, brake: 0, steer: 0, handbrake: 0, ...values });

test('boats and helicopters of the catalog are craft, cars and bikes are not', () => {
  assert.equal(craftKindOf(VEHICLE_CATALOG.speedboat), 'boat');
  assert.equal(craftKindOf(VEHICLE_CATALOG.police_boat), 'boat');
  assert.equal(craftKindOf(VEHICLE_CATALOG.news_helicopter), 'helicopter');
  assert.equal(craftKindOf(VEHICLE_CATALOG.police_helicopter), 'helicopter');
  assert.equal(craftKindOf(VEHICLE_CATALOG.sports_coupe), null);
  assert.equal(craftKindOf(VEHICLE_CATALOG.sport_motorcycle), null);
});

test('boat: W ahead, S astern, A/D steer', () => {
  const out = { drive: 0, steer: 0 };
  assert.deepEqual(boatInputFrom(controls({ throttle: 1, steer: -0.5 }), out), { drive: 1, steer: -0.5 });
  assert.deepEqual(boatInputFrom(controls({ brake: 1 }), out), { drive: -1, steer: 0 });
});

test('helicopter: W forward, S slows then sinks, Space climbs, lift wins', () => {
  const out = { collective: 0, pitch: 0, roll: 0, yaw: 0 };
  helicopterInputFrom(controls({ throttle: 1, steer: 1 }), 0, out);
  assert.equal(out.pitch, 1);
  assert.equal(out.yaw, 1);
  assert.equal(out.collective, 0);
  helicopterInputFrom(controls({ brake: 1 }), 20, out);
  assert.equal(out.pitch, -1, 'fast: S slows down');
  assert.equal(out.collective, 0);
  helicopterInputFrom(controls({ brake: 1 }), 1, out);
  assert.equal(out.pitch, 0, 'slow: S sinks');
  assert.equal(out.collective, -1);
  helicopterInputFrom(controls({ handbrake: 1 }), 0, out);
  assert.equal(out.collective, 1);
  helicopterInputFrom({ ...controls({ handbrake: 1 }), lift: -0.5 }, 0, out);
  assert.equal(out.collective, -0.5);
  assert.equal(helicopterControlsActive(controls()), false);
  assert.equal(helicopterControlsActive(controls({ handbrake: 1 })), true);
});

test('a real helicopter takes off on Space, flies forward on W and comes down on S', () => {
  const world = new PhysicsWorld({});
  const heli = new Helicopter(world, deriveHelicopterTuning(VEHICLE_CATALOG.news_helicopter), { x: 0, z: 0, heading: 0, engineOn: true });
  const run = (values, seconds) => {
    for (let t = 0; t < seconds * 60; t += 1) {
      helicopterInputFrom(controls(values), heli.speed, heli.input);
      world.step();
    }
  };
  run({ handbrake: 1 }, 6);
  const high = heli.body.position.y;
  assert.ok(high > 10, `climbed to ${high.toFixed(1)} m`);
  run({ throttle: 1 }, 5);
  assert.ok(heli.speed > 10, `forward ${heli.speed.toFixed(1)} m/s`);
  run({ brake: 1 }, 25);
  assert.ok(heli.body.position.y < high - 5, `came down to ${heli.body.position.y.toFixed(1)} m`);
});

test('a real boat floats and gets under way', () => {
  const world = new PhysicsWorld({ ground: { heightAt: () => -20 }, waterHeightAt: () => 0 });
  const boat = new Boat(world, deriveBoatTuning(VEHICLE_CATALOG.speedboat), { x: 0, z: 0, heading: 0 });
  for (let t = 0; t < 8 * 60; t += 1) {
    boatInputFrom(controls({ throttle: 1 }), boat.input);
    world.step();
  }
  assert.ok(boat.speed > 15, `speed ${boat.speed.toFixed(1)} m/s`);
  assert.ok(Math.abs(boat.body.position.y) < 1.5, `floats at ${boat.body.position.y.toFixed(2)}`);
});
