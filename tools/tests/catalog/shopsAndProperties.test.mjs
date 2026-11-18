// Shops, outfits, upgrades and properties must stand on landmarks that exist, sell things that
// exist, and cover everything the story missions and the city plan promise.
// Run with: node --test "tools/tests/catalog/*.test.mjs"
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CITY_DISTRICTS, CITY_LANDMARK_REQUESTS } from '../../../game/src/catalog/cityDistricts.js';
import { VEHICLE_CATALOG } from '../../../game/src/catalog/vehicleCatalog.js';
import { CHARACTER_APPEARANCE_VOCABULARY as VOCABULARY } from '../../../game/src/catalog/storyCharacters.js';
import { STORY_MISSIONS } from '../../../game/src/catalog/storyMissions.js';
import { CRIME_CATALOG } from '../../../game/src/catalog/crimeCatalog.js';
import { WEAPON_CATALOG } from '../../../game/src/catalog/weaponCatalog.js';
import * as shopsModule from '../../../game/src/catalog/shopsAndProperties.js';

const { SHOPS_AND_SERVICES, SHOP_KINDS, PROPERTIES_FOR_SALE, PROPERTY_RULES, OUTFIT_CATALOG, VEHICLE_UPGRADES, FOOD_AND_DRINK, PHONE_SERVICES } = shopsModule;
const landmarkById = new Map(CITY_LANDMARK_REQUESTS.map((landmark) => [landmark.id, landmark]));
const HEX = /^#[0-9A-F]{6}$/i;

/** True when a value and everything inside it is frozen. */
function isDeepFrozen(value) {
  if (value === null || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

test('every export is deeply frozen and keyed by id', () => {
  for (const [name, value] of Object.entries(shopsModule)) {
    assert.ok(isDeepFrozen(value), `${name} is not deeply frozen`);
    if (name === 'PROPERTY_RULES') continue;
    for (const [key, entry] of Object.entries(value)) assert.equal(entry.id, key, `${name}.${key}`);
  }
});

test('shops stand on their landmarks and sell what exists', () => {
  for (const shop of Object.values(SHOPS_AND_SERVICES)) {
    assert.ok(shop.kind in SHOP_KINDS, `${shop.id}: kind ${shop.kind}`);
    assert.equal(landmarkById.get(shop.landmark)?.district, shop.district, `${shop.id}: landmark and district`);
    if (shop.unlockedBy) assert.ok(shop.unlockedBy in STORY_MISSIONS, `${shop.id}: unlockedBy`);
    for (const weapon of shop.weapons || []) assert.ok(weapon in WEAPON_CATALOG, `${shop.id}: weapon ${weapon}`);
    for (const outfit of shop.outfits || []) assert.ok(outfit in OUTFIT_CATALOG, `${shop.id}: outfit ${outfit}`);
    for (const upgrade of shop.upgrades || []) assert.ok(upgrade in VEHICLE_UPGRADES, `${shop.id}: upgrade ${upgrade}`);
    for (const item of shop.menu || []) assert.ok(item in FOOD_AND_DRINK, `${shop.id}: menu ${item}`);
    for (const service of shop.services || []) assert.ok(service in PHONE_SERVICES, `${shop.id}: service ${service}`);
    for (const vehicle of shop.vehicles || []) assert.ok(Number.isInteger(VEHICLE_CATALOG[vehicle]?.price), `${shop.id}: vehicle ${vehicle} has no price`);
  }
  assert.ok(SHOP_KINDS.convenience_store.robberyCrime in CRIME_CATALOG);
  // Every landmark that is a shop by kind has its shop entry under the landmark's id.
  const shopLandmarkKinds = ['gun_shop', 'clothing_store', 'paint_and_body_shop', 'fuel_station', 'convenience_store', 'diner', 'car_dealership', 'motel'];
  for (const landmark of CITY_LANDMARK_REQUESTS) {
    if (!shopLandmarkKinds.includes(landmark.kind)) continue;
    assert.equal(SHOPS_AND_SERVICES[landmark.id]?.kind, landmark.kind, `landmark ${landmark.id} (${landmark.kind}) needs a shop entry`);
  }
  // Every weapon with a price can be bought somewhere.
  const sold = new Set(Object.values(SHOPS_AND_SERVICES).flatMap((shop) => shop.weapons || []));
  for (const weapon of Object.values(WEAPON_CATALOG)) if (weapon.price > 0) assert.ok(sold.has(weapon.id), `${weapon.id} is sold nowhere`);
});

test('outfits are built from the appearance vocabulary', () => {
  const soldSomewhere = new Set(Object.values(SHOPS_AND_SERVICES).flatMap((shop) => shop.outfits || []));
  for (const outfit of Object.values(OUTFIT_CATALOG)) {
    assert.ok(outfit.top.piece in VOCABULARY.tops && outfit.bottom.piece in VOCABULARY.bottoms && outfit.shoes.piece in VOCABULARY.shoes, `${outfit.id}: pieces`);
    for (const part of [outfit.top, outfit.bottom, outfit.shoes, ...outfit.accessories]) assert.match(part.color, HEX, `${outfit.id}: colour`);
    for (const accessory of outfit.accessories) assert.ok(accessory.piece in VOCABULARY.accessories, `${outfit.id}: accessory ${accessory.piece}`);
    if (outfit.unlockedBy) assert.ok(outfit.unlockedBy in STORY_MISSIONS, `${outfit.id}: unlockedBy`);
    if (outfit.price > 0) assert.ok(soldSomewhere.has(outfit.id), `${outfit.id} is sold nowhere`);
  }
  assert.ok(Object.values(OUTFIT_CATALOG).some((outfit) => outfit.tags.includes('formal') && outfit.price > 0), 'a formal outfit must be for sale');
});

test('properties cover every purchasable landmark', () => {
  assert.ok(Object.keys(PROPERTIES_FOR_SALE).length >= 6);
  const owned = new Set();
  for (const property of Object.values(PROPERTIES_FOR_SALE)) {
    assert.equal(landmarkById.get(property.landmark)?.district, property.district, `${property.id}: landmark and district`);
    assert.ok(PROPERTY_RULES.kinds.includes(property.kind), `${property.id}: kind`);
    assert.ok(Number.isInteger(property.price) && property.price >= 0 && Number.isInteger(property.incomePerDay), `${property.id}: money`);
    if (property.unlockedBy) assert.ok(property.unlockedBy in STORY_MISSIONS, `${property.id}: unlockedBy`);
    if (property.kind === 'safehouse') assert.equal(property.perks.savePoint, true, `${property.id}: a safehouse saves`);
    if (property.price > 0 && property.incomePerDay > 0) assert.ok(property.price / property.incomePerDay >= 30, `${property.id}: pays back too fast`);
    owned.add(property.landmark);
  }
  for (const district of Object.values(CITY_DISTRICTS)) {
    for (const landmark of district.landmarks) if (landmark.purchasable) assert.ok(owned.has(landmark.id), `purchasable landmark ${landmark.id} has no property`);
  }
});

test('everything a mission unlocks or asks for exists', () => {
  const catalogs = { shop: SHOPS_AND_SERVICES, property: PROPERTIES_FOR_SALE, outfit: OUTFIT_CATALOG };
  for (const mission of Object.values(STORY_MISSIONS)) {
    for (const unlocked of mission.unlocks) {
      const catalog = catalogs[unlocked.kind];
      if (!catalog) continue;
      assert.ok(unlocked.id in catalog, `${mission.id} unlocks unknown ${unlocked.kind} ${unlocked.id}`);
      assert.equal(catalog[unlocked.id].unlockedBy, mission.id, `${unlocked.kind} ${unlocked.id} should name ${mission.id}`);
    }
    for (const objective of mission.objectives) {
      if (objective.kind !== 'wear_outfit') continue;
      assert.ok(OUTFIT_CATALOG[objective.params.suggested].tags.includes(objective.params.tag), `${mission.id}: suggested outfit`);
      for (const shop of objective.params.soldAt) assert.ok(SHOPS_AND_SERVICES[shop].outfits.includes(objective.params.suggested), `${mission.id}: ${shop} does not sell it`);
    }
  }
});
