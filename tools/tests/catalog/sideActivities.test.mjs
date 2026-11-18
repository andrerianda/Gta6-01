// The side activities must only use landmarks, vehicles, factions, weapons and missions that
// exist, and every activity a story mission unlocks must be in the catalog.
// Run with: node --test "tools/tests/catalog/*.test.mjs"
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CITY_DISTRICTS, CITY_LANDMARK_REQUESTS } from '../../../game/src/catalog/cityDistricts.js';
import { VEHICLE_CATALOG, VEHICLE_CLASSES } from '../../../game/src/catalog/vehicleCatalog.js';
import { STORY_CHARACTERS } from '../../../game/src/catalog/storyCharacters.js';
import { FACTION_MEMBERS, GANGS_AND_FACTIONS } from '../../../game/src/catalog/gangsAndFactions.js';
import { STORY_MISSIONS } from '../../../game/src/catalog/storyMissions.js';
import { WEAPON_CATALOG } from '../../../game/src/catalog/weaponCatalog.js';
import { SIDE_ACTIVITIES, SIDE_ACTIVITY_ORDER, SIDE_ACTIVITY_RULES } from '../../../game/src/catalog/sideActivities.js';

const landmarks = new Set(CITY_LANDMARK_REQUESTS.map((landmark) => landmark.id));

test('at least ten activities, keyed by id, listed in order, frozen', () => {
  assert.ok(Object.keys(SIDE_ACTIVITIES).length >= 10);
  assert.deepEqual([...SIDE_ACTIVITY_ORDER].sort(), Object.keys(SIDE_ACTIVITIES).sort());
  for (const [key, activity] of Object.entries(SIDE_ACTIVITIES)) {
    assert.equal(activity.id, key);
    assert.ok(SIDE_ACTIVITY_RULES.kinds.includes(activity.kind), `${key}: kind`);
    assert.ok(SIDE_ACTIVITY_RULES.startHows.includes(activity.start.how), `${key}: start`);
    assert.ok(Object.isFrozen(activity.rules) && Object.isFrozen(activity.medals.gold), `${key}: frozen`);
    for (const tier of SIDE_ACTIVITY_RULES.medalNames) assert.ok(tier in activity.medals, `${key}: medal ${tier}`);
    assert.ok(activity.reward.formula.length > 0, `${key}: reward formula`);
  }
});

test('activities use ids that exist', () => {
  for (const activity of Object.values(SIDE_ACTIVITIES)) {
    const label = activity.id;
    if (activity.unlockedBy) assert.ok(activity.unlockedBy in STORY_MISSIONS, `${label}: unlockedBy`);
    for (const landmark of activity.start.at) assert.ok(landmarks.has(landmark), `${label}: start at ${landmark}`);
    if (activity.start.vehicle) assert.ok(activity.start.vehicle in VEHICLE_CATALOG, `${label}: start vehicle`);
    if (activity.start.contact) assert.ok(activity.start.contact in STORY_CHARACTERS, `${label}: contact`);
    for (const event of activity.events || []) {
      if (event.district) assert.ok(event.district in CITY_DISTRICTS, `${label}.${event.id}: district`);
      for (const landmark of event.via || []) assert.ok(landmarks.has(landmark), `${label}.${event.id}: via ${landmark}`);
      for (const vehicleClass of event.classes || []) assert.ok(vehicleClass in VEHICLE_CLASSES, `${label}.${event.id}: class ${vehicleClass}`);
      if (event.landmark) assert.ok(landmarks.has(event.landmark), `${label}.${event.id}: landmark`);
      if (event.vehicle) assert.ok(event.vehicle in VEHICLE_CATALOG, `${label}.${event.id}: vehicle`);
      if (event.goldSeconds) assert.ok(event.goldSeconds < event.silverSeconds && event.silverSeconds < event.bronzeSeconds, `${label}.${event.id}: medal times`);
    }
  }
  const { repo_orders: repo, export_list: exportList, turf_rampages: rampages, stunt_jumps: stunts, golden_tiles: tiles, airstrip_drags: drags, vigilante_calls: vigilante, linea_12_bus: bus } = SIDE_ACTIVITIES;
  for (const vehicleClass of repo.rules.targetClassesByOrder) assert.ok(vehicleClass in VEHICLE_CLASSES, `repo class ${vehicleClass}`);
  assert.equal(repo.rules.targetClassesByOrder.length, repo.rules.orders);
  for (const vehicle of exportList.rules.lists.flat()) assert.ok(vehicle in VEHICLE_CATALOG, `export ${vehicle}`);
  assert.ok(landmarks.has(exportList.rules.deliverTo) && landmarks.has(exportList.rules.boatsDeliverTo));
  for (const event of rampages.rules.events) {
    assert.ok(landmarks.has(event.landmark) && rampages.start.at.includes(event.landmark), `rampage ${event.id}: landmark`);
    assert.equal(GANGS_AND_FACTIONS[event.faction]?.rampageTarget, true, `rampage ${event.id}: faction`);
    assert.ok(event.weapon in WEAPON_CATALOG, `rampage ${event.id}: weapon`);
  }
  assert.ok(stunts.rules.jumps.length >= 12);
  assert.equal(new Set(stunts.rules.jumps.map((jump) => jump.id)).size, stunts.rules.jumps.length);
  for (const jump of stunts.rules.jumps) assert.ok(landmarks.has(jump.landmark), `jump ${jump.id}: landmark`);
  assert.deepEqual(Object.keys(tiles.rules.perDistrict).sort(), Object.keys(CITY_DISTRICTS).sort());
  assert.equal(Object.values(tiles.rules.perDistrict).reduce((sum, count) => sum + count, 0), tiles.rules.total);
  for (const rung of drags.rules.ladder) {
    assert.ok(rung.vehicle in VEHICLE_CATALOG && (rung.rival in FACTION_MEMBERS || rung.rival in STORY_CHARACTERS), 'drag ladder');
  }
  for (const vehicle of vigilante.rules.suspectVehiclesByLevel) assert.ok(vehicle in VEHICLE_CATALOG, `vigilante ${vehicle}`);
  for (const faction of vigilante.rules.suspectFactions) assert.ok(faction in GANGS_AND_FACTIONS);
  for (const stop of bus.rules.stops) assert.ok(landmarks.has(stop), `bus stop ${stop}`);
});

test('every activity a mission unlocks exists', () => {
  for (const mission of Object.values(STORY_MISSIONS)) {
    for (const unlocked of mission.unlocks) {
      if (unlocked.kind !== 'activity') continue;
      assert.ok(unlocked.id in SIDE_ACTIVITIES, `${mission.id} unlocks unknown activity ${unlocked.id}`);
      assert.equal(SIDE_ACTIVITIES[unlocked.id].unlockedBy, mission.id, `${unlocked.id} should name ${mission.id} as its unlock`);
    }
  }
});
