// The radio stations and the brands: every station a vehicle is tuned to exists, every brand a
// landmark, a vehicle or an advert names exists, and both catalogs are complete and frozen.
// Run with: node --test "tools/tests/catalog/*.test.mjs"
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CITY_DISTRICTS } from '../../../game/src/catalog/cityDistricts.js';
import { VEHICLE_CATALOG } from '../../../game/src/catalog/vehicleCatalog.js';
import { STORY_CHARACTERS } from '../../../game/src/catalog/storyCharacters.js';
import { STORY_MISSIONS } from '../../../game/src/catalog/storyMissions.js';
import * as radio from '../../../game/src/catalog/radioStations.js';
import * as brands from '../../../game/src/catalog/brandsAndSignage.js';

const { RADIO_STATIONS, RADIO_DIAL_ORDER, RADIO_SCALES, RADIO_RULES } = radio;
const { BRANDS_AND_SIGNAGE, BRAND_KINDS, SIGN_STYLES, BILLBOARD_RULES } = brands;
const HEX = /^#[0-9A-F]{6}$/i;
const PATTERN = /^[x-]{16}$/;

/** True when a value and everything inside it is frozen. */
function isDeepFrozen(value) {
  if (value === null || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

test('both modules are deeply frozen', () => {
  for (const module of [radio, brands]) {
    for (const [name, value] of Object.entries(module)) assert.ok(isDeepFrozen(value), `${name} is not deeply frozen`);
  }
});

test('six stations the synthesiser can play', () => {
  assert.equal(Object.keys(RADIO_STATIONS).length, 6);
  assert.deepEqual([...RADIO_DIAL_ORDER].sort(), Object.keys(RADIO_STATIONS).sort());
  for (const [key, station] of Object.entries(RADIO_STATIONS)) {
    assert.equal(station.id, key);
    const { music } = station;
    assert.ok(music.tempoRange[0] >= 60 && music.tempoRange[0] < music.tempoRange[1] && music.tempoRange[1] <= 220, `${key}: tempo`);
    assert.ok(music.scale in RADIO_SCALES, `${key}: scale ${music.scale}`);
    assert.ok(music.roots.every((note) => Number.isInteger(note) && note >= 36 && note <= 72), `${key}: roots`);
    for (const pattern of [music.bass.pattern, ...Object.values(music.drums)]) assert.match(pattern, PATTERN, `${key}: pattern ${pattern}`);
    assert.ok(station.lines.length >= 8, `${key}: needs eight lines`);
    for (const spoken of station.lines) {
      assert.ok(RADIO_RULES.lineKinds.includes(spoken.kind), `${key}: line kind`);
      assert.ok(spoken.text.length > 0 && spoken.text.length <= 170, `${key}: line too long for a subtitle: ${spoken.text}`);
      if (spoken.kind === 'advert') assert.ok(spoken.brand in BRANDS_AND_SIGNAGE, `${key}: advert brand ${spoken.brand}`);
    }
    if (station.host.character) assert.ok(station.host.character in STORY_CHARACTERS, `${key}: host`);
    if (station.newsReports) assert.ok(station.newsReports.unlockedBy in STORY_MISSIONS, `${key}: news unlock`);
  }
  for (const vehicle of Object.values(VEHICLE_CATALOG)) {
    if (vehicle.radioDefault !== null) assert.ok(vehicle.radioDefault in RADIO_STATIONS, `${vehicle.id}: radio ${vehicle.radioDefault}`);
  }
});

test('at least forty brands with slogans and colour schemes', () => {
  assert.ok(Object.keys(BRANDS_AND_SIGNAGE).length >= 40);
  const names = new Set();
  for (const [key, brand] of Object.entries(BRANDS_AND_SIGNAGE)) {
    assert.equal(brand.id, key);
    assert.ok(BRAND_KINDS.includes(brand.kind), `${key}: kind ${brand.kind}`);
    assert.ok(brand.signStyle in SIGN_STYLES, `${key}: sign style ${brand.signStyle}`);
    assert.ok(brand.slogan.length > 0 && brand.logo.length > 0 && brand.uses.length > 0, `${key}: slogan, logo, uses`);
    for (const color of Object.values(brand.colors)) assert.match(color, HEX, `${key}: colour`);
    assert.ok(!names.has(brand.name), `${key}: duplicate name ${brand.name}`);
    names.add(brand.name);
  }
  for (const required of ['hotel', 'bar', 'diner', 'fuel', 'bank', 'fashion', 'electronics', 'soft_drink', 'airline', 'insurance']) {
    assert.ok(Object.values(BRANDS_AND_SIGNAGE).some((brand) => brand.kind === required), `no brand of kind ${required}`);
  }
  for (const [district, kinds] of Object.entries(BILLBOARD_RULES.districtFavourites)) {
    assert.ok(district in CITY_DISTRICTS, `billboards: district ${district}`);
    for (const kind of kinds) assert.ok(BRAND_KINDS.includes(kind), `billboards: kind ${kind}`);
  }
  assert.deepEqual(Object.keys(BILLBOARD_RULES.districtFavourites).sort(), Object.keys(CITY_DISTRICTS).sort());
});

test('every brand a landmark or a vehicle names exists', () => {
  for (const district of Object.values(CITY_DISTRICTS)) {
    for (const landmark of district.landmarks) {
      if (landmark.brand) assert.ok(landmark.brand in BRANDS_AND_SIGNAGE, `landmark ${landmark.id}: brand ${landmark.brand}`);
    }
  }
  for (const vehicle of Object.values(VEHICLE_CATALOG)) {
    assert.ok(BRANDS_AND_SIGNAGE[vehicle.makeBrand]?.uses.includes('badge'), `${vehicle.id}: make brand ${vehicle.makeBrand}`);
    for (const livery of vehicle.liveryBrands || []) assert.ok(BRANDS_AND_SIGNAGE[livery]?.uses.includes('livery'), `${vehicle.id}: livery brand ${livery}`);
    if (vehicle.livery) assert.ok(BRANDS_AND_SIGNAGE[vehicle.livery.brand]?.uses.includes('livery'), `${vehicle.id}: livery ${vehicle.livery.brand}`);
  }
});
