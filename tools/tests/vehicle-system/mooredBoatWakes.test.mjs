// Shift 14 (boat probe: the lead at the helm of a speedboat moored at the quay, full throttle for
// 2 s, 0.01 m/s): a boat at rest against the bottom (or the quay) falls asleep in the physics
// world, and its thrust went to a sleeping body the world no longer steps. driveCraft wakes it as
// soon as the helm asks for way, as a car's Vehicle.beforeStep wakes on drive.
import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { VEHICLE_CATALOG } from '../../../game/src/catalog/vehicleCatalog.js';
import { PhysicsWorld } from '../../../game/src/physics/PhysicsWorld.js';
import { Boat, deriveBoatTuning } from '../../../game/src/physics/watercraft/Boat.js';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const { driveCraft } = await import('../../../game/src/vehicles/vehicleCraft.js');

test('a boat moored in the shallows sleeps, and the throttle wakes it and gets it under way', () => {
  // The bottom just under the keel: the hull touches it and comes to rest.
  const world = new PhysicsWorld({ ground: { heightAt: () => -0.55 }, waterHeightAt: () => 0 });
  const boat = new Boat(world, deriveBoatTuning(VEHICLE_CATALOG.speedboat), { x: 0, z: 0, heading: 0 });
  const craft = { kind: 'boat' };
  const controls = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
  for (let t = 0; t < 6 * 60 && !boat.body.asleep; t += 1) {
    driveCraft(craft, controls, boat, false);
    world.step();
  }
  if (!boat.body.asleep) boat.body.sleep(); // however it came to rest: asleep, as at the quay
  controls.throttle = 1;
  for (let t = 0; t < 3 * 60; t += 1) {
    driveCraft(craft, controls, boat, true);
    world.step();
  }
  assert.equal(boat.body.asleep, false, 'awake at the helm');
  assert.ok(Math.abs(boat.speed) > 2, `under way at ${boat.speed.toFixed(2)} m/s`);
});
