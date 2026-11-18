// Kerbside parking near the player: walking and then driving down ~900 m of streets with a
// camera behind the player, no parked car appears or vanishes in the camera's view within 60 m,
// and no taken spot within 39 m of the player shows nothing, whether the cap on real parked
// cars is large or small (before shift 12: 8 appeared, 124 vanished, 1411 empty spot-ticks).
// The rail yard's lorry bays prefer box trucks, vans and pickups.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const parking = await import('../../../game/src/traffic/kerbsideParking.js');
const { watchParking } = await import('./parkingWatch.mjs');
const { VEHICLE_CATALOG } = await import('../../../game/src/catalog/vehicleCatalog.js');
const { testPlan } = await import('./trafficTestWorld.mjs');

for (const maxVehicles of [60, 30]) {
  test(`no parked car pops in or out of view near the player (cap ${Math.round(maxVehicles * 0.15)} real cars)`, () => {
    const result = watchParking(parking.createKerbsideParking, { tier: { maxVehicles, trafficDensity: 1 } });
    assert.ok(result.ticks > 100, 'the walk and the drive ran');
    assert.ok(result.shownMax > 20, `parked cars are shown (${result.shownMax})`);
    assert.ok(result.real > 0 && result.real <= Math.round(maxVehicles * 0.15), `real cars within the cap (${result.real})`);
    assert.equal(result.appeared, 0, 'appeared in view within 60 m');
    assert.equal(result.vanished, 0, 'vanished in view within 60 m');
    assert.equal(result.emptyNear, 0, 'taken spots within 39 m showing nothing');
  });
}

test('a spot that showed nothing fills only out of view or far from the camera', () => {
  const eye = { x: 0, z: 0, forwardX: 0, forwardZ: -1, cosHalfView: 0.5 };
  assert.equal(parking.mayAppear(false, false, 0, -30, eye), false, 'ahead, 30 m');
  assert.equal(parking.mayAppear(true, false, 0, -30, eye), true, 'already shown');
  assert.equal(parking.mayAppear(false, true, 0, -30, eye), true, 'at a cut');
  assert.equal(parking.mayAppear(false, false, 0, 30, eye), true, 'behind');
  assert.equal(parking.mayAppear(false, false, 0, -parking.WATCHED_DISTANCE - 5, eye), true, 'far');
});

test("the rail yard's bays prefer box trucks, vans and pickups", () => {
  const models = parking.lotKindModels('train_yard', VEHICLE_CATALOG, () => true);
  for (const id of ['box_truck', 'cargo_van', 'pickup_truck']) assert.ok(models.includes(id), id);
  assert.deepEqual(parking.lotKindModels('train_yard', VEHICLE_CATALOG, () => false), []);
  let own = 0;
  for (let i = 0; i < 400; i += 1) if (parking.pickBayModel(models, parking.spotRoll(i, 7))) own += 1;
  assert.ok(own > 300 && own < 380, `share of the yard's own vehicles ${own}/400`);
  assert.equal(parking.pickBayModel([], 0.1), null);
  // The plan has lorry bays in the rail yard.
  const plan = testPlan();
  const yardBays = plan.parkingSpots.filter((spot) => spot.lot !== undefined && plan.lots[spot.lot]?.landmarkKind === 'train_yard');
  assert.ok(yardBays.length > 10, `rail yard bays ${yardBays.length}`);
});
