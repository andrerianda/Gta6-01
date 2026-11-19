// Shift 14 (boat probe: the lead at the helm of a speedboat moored stern-to a beach, as
// missionWorld.waterSpotNear puts one 5 m off the shore, full throttle for 2 s: 0.01 m/s, a third
// of the hull wet, the propeller dry): a boat is moored out along its bow until the water at its
// propeller is deeper than its draft (vehicleCraft.mooringOffset), so it floats and gets under way
// at the helm. A boat in open water is put down where it was asked for.
import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { VEHICLE_CATALOG } from '../../../game/src/catalog/vehicleCatalog.js';
import { PhysicsWorld } from '../../../game/src/physics/PhysicsWorld.js';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const { createCraftBody, driveCraft, mooringOffset, MOORING_DEPTH } = await import('../../../game/src/vehicles/vehicleCraft.js');

// A beach along z = 0: land to the south (+z), the sea bottom falling 0.12 m a metre to the north.
const beach = () => new PhysicsWorld({ ground: { heightAt: (x, z) => (z > 0 ? 0.3 : 0.12 * z) }, waterHeightAt: () => 0 });

test('a boat moored stern-to a beach lies out far enough to float and answers the throttle', () => {
  const world = beach();
  const entry = VEHICLE_CATALOG.speedboat;
  // Bow out to sea (compass 0 = -Z), its middle 5 m off the shore: the stern over the shallows.
  const boat = createCraftBody(world, entry, { position: { x: 0, y: 0, z: -5 }, heading: 0, parked: true }, 1);
  const tuning = boat.tuning;
  const prop = boat.anchorPosition(tuning.propeller, { x: 0, y: 0, z: 0 });
  assert.ok(-world.ground.heightAt(prop.x, prop.z) >= tuning.draft + MOORING_DEPTH - 1e-9, `water at the propeller ${(-world.ground.heightAt(prop.x, prop.z)).toFixed(2)} m`);
  assert.ok(prop.z < -0.6 - 1 && prop.z > -0.6 - 12, `moored ${(-0.6 - prop.z).toFixed(1)} m further out`);
  const craft = { kind: 'boat' };
  const controls = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
  for (let t = 0; t < 60; t += 1) { driveCraft(craft, controls, boat, false); world.step(); }
  controls.throttle = 1;
  for (let t = 0; t < 4 * 60; t += 1) { driveCraft(craft, controls, boat, true); world.step(); }
  assert.ok(boat.propellerWet, 'the propeller is in the water');
  assert.ok(boat.speed > 4, `under way at ${boat.speed.toFixed(1)} m/s`);
});

test('a boat in open water is put down where asked; no water in reach leaves it there too', () => {
  const deep = new PhysicsWorld({ ground: { heightAt: () => -20 }, waterHeightAt: () => 0 });
  const tuning = { draft: 0.5, propeller: { z: 4.4 } };
  assert.equal(mooringOffset(deep, tuning, 10, 10, 1.2), 0);
  const dry = new PhysicsWorld({ ground: { heightAt: () => 2 }, waterHeightAt: () => 0 });
  assert.equal(mooringOffset(dry, tuning, 0, 0, 0), 0);
  assert.equal(mooringOffset(null, tuning, 0, 0, 0), 0);
});
