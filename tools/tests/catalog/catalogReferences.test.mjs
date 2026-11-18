// The content catalogs must agree with each other: ids are unique and equal their keys, every
// id one catalog borrows from another exists there, and everything exported is deeply frozen.
// Run with: node --test "tools/tests/catalog/*.test.mjs"
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as districts from '../../../game/src/catalog/cityDistricts.js';
import * as vehicles from '../../../game/src/catalog/vehicleCatalog.js';
import * as cast from '../../../game/src/catalog/storyCharacters.js';
import * as people from '../../../game/src/catalog/pedestrianArchetypes.js';
import * as factions from '../../../game/src/catalog/gangsAndFactions.js';
import * as missions from '../../../game/src/catalog/storyMissions.js';
import * as wanted from '../../../game/src/catalog/wantedLevels.js';
import * as crimes from '../../../game/src/catalog/crimeCatalog.js';
import * as weapons from '../../../game/src/catalog/weaponCatalog.js';

const { CITY_DISTRICTS, CITY_LANDMARK_REQUESTS, LANDMARK_KINDS } = districts;
const { VEHICLE_CATALOG } = vehicles;
const { STORY_CHARACTERS, CHARACTER_APPEARANCE_VOCABULARY: VOCABULARY } = cast;
const { PEDESTRIAN_ARCHETYPES } = people;
const { GANGS_AND_FACTIONS, FACTION_MEMBERS, POLICE_UNITS } = factions;
const { STORY_MISSIONS, STORY_MISSION_ORDER, MISSION_OBJECTIVE_KINDS, MISSION_RULES } = missions;
const { WANTED_LEVELS, WANTED_RULES, BUSTED_RULES, WASTED_RULES } = wanted;
const { CRIME_CATALOG, CRIME_CATEGORIES } = crimes;
const { WEAPON_CATALOG, WEAPON_ORDER, WEAPON_WHEEL_SLOTS } = weapons;

const landmarkById = new Map(CITY_LANDMARK_REQUESTS.map((landmark) => [landmark.id, landmark]));
const HEX = /^#[0-9A-F]{6}$/i;

/** True when a value and everything inside it is frozen. */
function isDeepFrozen(value) {
  if (value === null || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

/** Asserts that a keyed catalog's entries carry their own key as id. */
function assertKeyedByIds(catalog, label) {
  for (const [key, entry] of Object.entries(catalog)) {
    assert.equal(entry.id, key, `${label}.${key} has id ${entry.id}`);
    assert.match(key, /^[a-z0-9_]+$/, `${label}.${key} is not snake_case`);
  }
}

/** Asserts an appearance range block (pedestrians, faction members) uses only vocabulary pieces. */
function assertAppearanceRange(appearance, label) {
  for (const style of [...appearance.hairStyles.female, ...appearance.hairStyles.male]) {
    assert.ok(style in VOCABULARY.hairStyles, `${label}: hair style ${style}`);
  }
  for (const facial of Object.keys(appearance.facialHair)) assert.ok(VOCABULARY.facialHair.includes(facial), `${label}: facial hair ${facial}`);
  for (const tone of appearance.skinTones) assert.match(tone, HEX, `${label}: skin tone`);
  assert.ok(appearance.outfits.length > 0, `${label}: no outfit`);
  for (const outfit of appearance.outfits) {
    assert.ok(outfit.top.piece in VOCABULARY.tops, `${label}: top ${outfit.top.piece}`);
    assert.ok(outfit.bottom.piece in VOCABULARY.bottoms, `${label}: bottom ${outfit.bottom.piece}`);
    assert.ok(outfit.shoes.piece in VOCABULARY.shoes, `${label}: shoes ${outfit.shoes.piece}`);
    for (const accessory of outfit.accessories) assert.ok(accessory.piece in VOCABULARY.accessories, `${label}: accessory ${accessory.piece}`);
    for (const part of [outfit.top, outfit.bottom, outfit.shoes, ...outfit.accessories]) {
      for (const color of part.colors) assert.match(color, HEX, `${label}: colour ${color}`);
    }
  }
}

test('every catalog export is deeply frozen', () => {
  for (const [name, module] of Object.entries({ districts, vehicles, cast, people, factions, missions, wanted, crimes, weapons })) {
    for (const [exportName, value] of Object.entries(module)) {
      assert.ok(isDeepFrozen(value), `${name}.${exportName} is not deeply frozen`);
    }
  }
});

test('keyed catalogs use their keys as ids', () => {
  assertKeyedByIds(CITY_DISTRICTS, 'CITY_DISTRICTS');
  assertKeyedByIds(VEHICLE_CATALOG, 'VEHICLE_CATALOG');
  assertKeyedByIds(STORY_CHARACTERS, 'STORY_CHARACTERS');
  assertKeyedByIds(PEDESTRIAN_ARCHETYPES, 'PEDESTRIAN_ARCHETYPES');
  assertKeyedByIds(GANGS_AND_FACTIONS, 'GANGS_AND_FACTIONS');
  assertKeyedByIds(FACTION_MEMBERS, 'FACTION_MEMBERS');
  assertKeyedByIds(POLICE_UNITS, 'POLICE_UNITS');
  assertKeyedByIds(STORY_MISSIONS, 'STORY_MISSIONS');
  assertKeyedByIds(CRIME_CATALOG, 'CRIME_CATALOG');
  assertKeyedByIds(WEAPON_CATALOG, 'WEAPON_CATALOG');
});

test('the nine districts, their landmarks and their mixes', () => {
  assert.equal(Object.keys(CITY_DISTRICTS).length, 9);
  assert.equal(landmarkById.size, CITY_LANDMARK_REQUESTS.length, 'duplicate landmark id');
  const kindCounts = {};
  for (const district of Object.values(CITY_DISTRICTS)) {
    assert.ok(district.controllingFaction in GANGS_AND_FACTIONS, `${district.id}: faction ${district.controllingFaction}`);
    for (const vehicle of Object.keys(district.trafficMix)) assert.ok(vehicle in VEHICLE_CATALOG, `${district.id}: traffic ${vehicle}`);
    for (const archetype of Object.keys(district.pedestrianMix)) assert.ok(archetype in PEDESTRIAN_ARCHETYPES, `${district.id}: pedestrian ${archetype}`);
    assert.ok(district.streetNames.length >= 8 && district.streetNames.length <= 12, `${district.id}: street names`);
    assert.ok(district.landmarks.length >= 6 && district.landmarks.length <= 10, `${district.id}: landmark count`);
    for (const landmark of district.landmarks) {
      assert.ok(LANDMARK_KINDS.includes(landmark.kind), `${landmark.id}: kind ${landmark.kind}`);
      assert.equal(landmarkById.get(landmark.id)?.district, district.id, `${landmark.id}: request list disagrees`);
      kindCounts[landmark.kind] = (kindCounts[landmark.kind] || 0) + 1;
    }
  }
  const atLeast = { police_station: 3, hospital: 2, fuel_station: 4, paint_and_body_shop: 3, gun_shop: 3, clothing_store: 4, pier: 1, marina: 1, lighthouse: 1, casino_resort: 1, stadium: 1, container_terminal: 1, airstrip: 1 };
  for (const [kind, count] of Object.entries(atLeast)) assert.ok((kindCounts[kind] || 0) >= count, `the city needs ${count} ${kind}`);
});

test('the twenty-four vehicles', () => {
  assert.equal(Object.keys(VEHICLE_CATALOG).length, 24);
  for (const vehicle of Object.values(VEHICLE_CATALOG)) {
    for (const district of vehicle.spawn.districts) assert.ok(district in CITY_DISTRICTS, `${vehicle.id}: spawn district ${district}`);
    for (const color of vehicle.colors) assert.match(color, HEX, `${vehicle.id}: colour`);
    assert.ok(vehicle.handling.topSpeed > 0 && vehicle.mass > 0, `${vehicle.id}: handling`);
  }
});

test('the cast', () => {
  assert.ok(Object.keys(STORY_CHARACTERS).length >= 12);
  for (const character of Object.values(STORY_CHARACTERS)) {
    if (character.faction) assert.ok(character.faction in GANGS_AND_FACTIONS, `${character.id}: faction`);
    assert.ok(character.homeDistrict in CITY_DISTRICTS, `${character.id}: home district`);
    assert.ok(landmarkById.has(character.foundAt), `${character.id}: found at ${character.foundAt}`);
    if (character.phone?.unlockedBy) assert.ok(character.phone.unlockedBy in STORY_MISSIONS, `${character.id}: phone unlock`);
    const look = character.appearance;
    assert.ok(look.hairStyle in VOCABULARY.hairStyles, `${character.id}: hair`);
    assert.ok(look.outfit.top.piece in VOCABULARY.tops && look.outfit.bottom.piece in VOCABULARY.bottoms && look.outfit.shoes.piece in VOCABULARY.shoes, `${character.id}: outfit`);
    for (const accessory of look.outfit.accessories) assert.ok(accessory.piece in VOCABULARY.accessories, `${character.id}: accessory ${accessory.piece}`);
  }
  for (const lead of cast.PLAYABLE_LEADS.leads) assert.equal(STORY_CHARACTERS[lead].playable, true);
});

test('pedestrians and faction members are modellable from the vocabulary', () => {
  assert.ok(Object.keys(PEDESTRIAN_ARCHETYPES).length >= 16);
  for (const archetype of Object.values(PEDESTRIAN_ARCHETYPES)) assertAppearanceRange(archetype.appearance, archetype.id);
  for (const member of Object.values(FACTION_MEMBERS)) {
    assertAppearanceRange(member.appearance, member.id);
    assert.ok(member.faction in GANGS_AND_FACTIONS, `${member.id}: faction`);
    assert.ok(GANGS_AND_FACTIONS[member.faction].members.includes(member.id), `${member.id}: not listed by its faction`);
    for (const weapon of member.weapons) assert.ok(weapon in WEAPON_CATALOG, `${member.id}: weapon ${weapon}`);
  }
});

test('factions and police units', () => {
  assert.deepEqual([...factions.FACTION_ORDER].sort(), Object.keys(GANGS_AND_FACTIONS).sort());
  for (const faction of Object.values(GANGS_AND_FACTIONS)) {
    for (const landmark of [faction.headquarters, ...faction.hangouts]) assert.ok(landmarkById.has(landmark), `${faction.id}: landmark ${landmark}`);
    for (const district of faction.turf) assert.ok(district in CITY_DISTRICTS, `${faction.id}: turf ${district}`);
    for (const vehicle of Object.keys(faction.vehicles)) assert.ok(vehicle in VEHICLE_CATALOG, `${faction.id}: vehicle ${vehicle}`);
    for (const weapon of faction.weapons) assert.ok(weapon in WEAPON_CATALOG, `${faction.id}: weapon ${weapon}`);
    for (const member of faction.members) assert.ok(member in FACTION_MEMBERS, `${faction.id}: member ${member}`);
    for (const person of [faction.leader, ...faction.notableMembers]) if (person) assert.ok(person in STORY_CHARACTERS, `${faction.id}: ${person}`);
    for (const shift of faction.storyShifts) assert.ok(shift.afterMission in STORY_MISSIONS, `${faction.id}: shift ${shift.afterMission}`);
    for (const other of Object.keys(faction.relations)) assert.ok(other in GANGS_AND_FACTIONS, `${faction.id}: relation ${other}`);
    for (const lead of cast.PLAYABLE_LEADS.leads) assert.equal(typeof faction.attitude[lead], 'number', `${faction.id}: attitude to ${lead}`);
    for (const color of Object.values(faction.colors)) assert.match(color, HEX);
  }
  for (const unit of Object.values(POLICE_UNITS)) {
    if (unit.vehicle) assert.ok(unit.vehicle in VEHICLE_CATALOG, `${unit.id}: vehicle`);
    for (const member of unit.crew) assert.ok(member in FACTION_MEMBERS, `${unit.id}: crew ${member}`);
    for (const weapon of unit.weapons) assert.ok(weapon in WEAPON_CATALOG, `${unit.id}: weapon ${weapon}`);
  }
});

test('the sixteen story missions resolve every id they use', () => {
  assert.equal(STORY_MISSION_ORDER.length, 16);
  assert.deepEqual([...STORY_MISSION_ORDER].sort(), Object.keys(STORY_MISSIONS).sort());
  const landmarkKeys = new Set(['landmark', 'before', 'at', 'zone', 'safeAt', 'from']);
  const personKeys = new Set(['driver', 'character', 'passenger', 'follow', 'mustSurvive']);
  const check = (value, path) => {
    if (Array.isArray(value)) return value.forEach((item, index) => check(item, `${path}[${index}]`));
    if (value === null || typeof value !== 'object') return undefined;
    for (const [key, inner] of Object.entries(value)) {
      const where = `${path}.${key}=${inner}`;
      if (key === 'vehicle' || key === 'providedVehicle') assert.ok(inner in VEHICLE_CATALOG, where);
      else if (key === 'crew' || key === 'member') assert.ok(inner in FACTION_MEMBERS, where);
      else if (key === 'weapon') assert.ok(inner in WEAPON_CATALOG, where);
      else if (landmarkKeys.has(key) && typeof inner === 'string') assert.ok(landmarkById.has(inner), where);
      else if (key === 'to' && typeof inner === 'string') assert.ok(landmarkById.has(inner) || inner in STORY_CHARACTERS, where);
      else if (key === 'via' || key === 'stops') inner.forEach((id) => assert.ok(landmarkById.has(id), `${path}.${key}: ${id}`));
      else if (personKeys.has(key) && typeof inner === 'string') assert.ok(inner in STORY_CHARACTERS || inner in FACTION_MEMBERS, where);
      check(inner, `${path}.${key}`);
    }
    return undefined;
  };
  STORY_MISSION_ORDER.forEach((id, index) => {
    const mission = STORY_MISSIONS[id];
    assert.equal(mission.order, index + 1, `${id}: order`);
    assert.ok(mission.giver in STORY_CHARACTERS, `${id}: giver`);
    assert.ok(mission.lead === 'either' || cast.PLAYABLE_LEADS.leads.includes(mission.lead), `${id}: lead`);
    assert.equal(landmarkById.get(mission.start.landmark)?.district, mission.start.district, `${id}: start`);
    for (const required of mission.requires) assert.ok(STORY_MISSIONS[required].order < mission.order, `${id}: requires ${required}`);
    assert.ok(mission.objectives.length >= 4, `${id}: objectives`);
    for (const objective of mission.objectives) {
      assert.ok(objective.kind in MISSION_OBJECTIVE_KINDS, `${id}: objective kind ${objective.kind}`);
      assert.ok(objective.text.length > 0 && objective.text.length <= 70, `${id}: HUD line "${objective.text}"`);
    }
    check(mission.objectives, id);
    for (const failure of mission.failConditions) assert.ok(MISSION_RULES.failKinds.includes(failure.kind), `${id}: fail kind ${failure.kind}`);
    assert.ok(mission.wantedLevel.provoked >= 0 && mission.wantedLevel.provoked <= 5 && mission.wantedLevel.cap <= 5, `${id}: wanted`);
    assert.ok(Number.isInteger(mission.reward.cash) && mission.reward.cash > 0 && mission.reward.reputation > 0, `${id}: reward`);
    for (const lines of [mission.intro, mission.outro]) {
      assert.ok(lines.length >= 3 && lines.length <= 8, `${id}: dialogue length`);
      for (const line of lines) assert.ok(line.speaker in STORY_CHARACTERS, `${id}: speaker ${line.speaker}`);
    }
    for (const unlocked of mission.unlocks) {
      assert.ok(MISSION_RULES.unlockKinds.includes(unlocked.kind), `${id}: unlock kind ${unlocked.kind}`);
      if (unlocked.kind === 'contact') assert.ok(unlocked.id in STORY_CHARACTERS, `${id}: contact ${unlocked.id}`);
      if (unlocked.kind === 'weapon') assert.ok(unlocked.id in WEAPON_CATALOG, `${id}: weapon ${unlocked.id}`);
      if (unlocked.kind === 'vehicle') assert.ok(unlocked.id in VEHICLE_CATALOG, `${id}: vehicle ${unlocked.id}`);
    }
  });
  const kindsUsed = new Set(Object.values(STORY_MISSIONS).flatMap((mission) => mission.objectives.map((objective) => objective.kind)));
  assert.ok(kindsUsed.size >= 16, 'the missions should vary their objectives');
});

test('wanted levels, busted and wasted', () => {
  assert.equal(WANTED_LEVELS.length, 6);
  WANTED_LEVELS.forEach((level, stars) => {
    assert.equal(level.stars, stars);
    assert.equal(level.heatThreshold, WANTED_RULES.heatThresholds[stars]);
    if (stars > 0) assert.ok(level.heatThreshold > WANTED_LEVELS[stars - 1].heatThreshold, 'thresholds ascend');
    for (const order of level.dispatch) {
      assert.ok(order.unit in POLICE_UNITS, `stars ${stars}: unit ${order.unit}`);
      assert.ok(POLICE_UNITS[order.unit].minStars <= stars, `stars ${stars}: ${order.unit} is sent too early`);
    }
  });
  assert.ok(WANTED_RULES.waysToLose.bribe.contact in STORY_CHARACTERS);
  assert.ok(WANTED_RULES.waysToLose.bribe.unlockedBy in STORY_MISSIONS);
  assert.ok(WANTED_RULES.witness.friendlyTurf.faction in GANGS_AND_FACTIONS);
  for (const category of WANTED_RULES.witness.friendlyTurf.ignoredCategories) assert.ok(category in CRIME_CATEGORIES);
  for (const district of Object.keys(CITY_DISTRICTS)) {
    assert.equal(landmarkById.get(BUSTED_RULES.releaseAt[district])?.kind, 'police_station', `${district}: release`);
    assert.equal(landmarkById.get(WASTED_RULES.wakeAt[district])?.kind, 'hospital', `${district}: hospital`);
  }
});

test('crimes and weapons', () => {
  assert.ok('steal_police_vehicle' in CRIME_CATALOG);
  for (const crime of Object.values(CRIME_CATALOG)) {
    assert.ok(crime.category in CRIME_CATEGORIES, `${crime.id}: category`);
    assert.ok(crime.heat > 0 && crime.minStars >= 0 && crime.minStars <= 5, `${crime.id}: heat`);
    if (crime.needsWitness) assert.ok(crime.seenRadius > 0 || crime.heardRadius > 0, `${crime.id}: needs a radius`);
  }
  assert.deepEqual([...WEAPON_ORDER].sort(), Object.keys(WEAPON_CATALOG).sort());
  for (const weapon of Object.values(WEAPON_CATALOG)) {
    assert.ok(weapon.crime in CRIME_CATALOG, `${weapon.id}: crime ${weapon.crime}`);
    assert.ok(WEAPON_WHEEL_SLOTS[weapon.wheelSlot].weapons.includes(weapon.id), `${weapon.id}: wheel slot`);
    if (weapon.unlockedBy) assert.ok(weapon.unlockedBy in STORY_MISSIONS, `${weapon.id}: unlocked by`);
    assert.ok(Number.isInteger(weapon.price) && weapon.price >= 0, `${weapon.id}: price`);
  }
  for (const id of ['fists', 'tire_iron', 'pistol', 'heavy_revolver', 'smg', 'pump_shotgun', 'assault_rifle', 'sniper_rifle', 'grenade', 'fire_bottle', 'rocket_launcher']) {
    assert.ok(id in WEAPON_CATALOG, `missing weapon ${id}`);
  }
});
