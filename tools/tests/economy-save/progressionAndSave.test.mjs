// Tests of progression (reputation, ranks, statistics) and of the save file format.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createReputationBook, rankFor } from '../../../game/src/economy/reputationRanks.js';
import { createStatisticsBook, formatStatistic } from '../../../game/src/economy/statisticsBook.js';
import { PROGRESSION_RANKS, TRACKED_STATISTICS } from '../../../game/src/catalog/progressionRanks.js';
import {
  composeSave, sectionsOf, validateSave, summariseSave, slotKey, leadRecord, SAVE_VERSION, SAVE_MIGRATIONS,
} from '../../../game/src/save/saveFileFormat.js';
import { createPersistentStorage } from '../../../game/src/core/storage/persistentStorage.js';

test('reputation reaches ranks at the catalog thresholds and unlocks their weapons', () => {
  const book = createReputationBook(PROGRESSION_RANKS);
  assert.equal(book.rank.id, 'nobody');
  assert.deepEqual(book.add(-50), { delta: 0, reached: [] });
  const first = book.add(249);
  assert.equal(first.reached.length, 0);
  const second = book.add(700);
  assert.deepEqual(second.reached.map((each) => each.rank), [1, 2], 'two ranks at once');
  assert.equal(book.rank.id, 'hired_hand');
  assert.ok(book.unlocked.has('smg') && book.unlocked.has('baseball_bat') && !book.unlocked.has('assault_rifle'));
  const next = book.toNextRank();
  assert.equal(next.next.rank, 3);
  assert.equal(next.needed, 1700 - 949);
  assert.equal(rankFor(14000, PROGRESSION_RANKS).rank, 10);
  const copy = createReputationBook(PROGRESSION_RANKS);
  copy.restore(JSON.parse(JSON.stringify(book.serialise())));
  assert.equal(copy.rank.id, 'hired_hand');
  assert.equal(copy.reputation, 949);
  assert.ok(copy.unlocked.has('pump_shotgun'));
});

test('statistics add, keep records and format by unit', () => {
  const book = createStatisticsBook(TRACKED_STATISTICS);
  assert.equal(book.record('distance_driven', 1500), 1500);
  book.record('vehicles_stolen');
  book.record('vehicles_stolen');
  book.record('top_speed', 40);
  book.record('top_speed', 30);
  assert.equal(book.values.top_speed, 40, 'a record keeps the highest');
  assert.equal(book.record('not_a_statistic', 3), 0);
  const travel = book.rows('travel');
  assert.equal(travel.find((row) => row.id === 'distance_driven').text, '1.5 km');
  assert.equal(travel.find((row) => row.id === 'top_speed').text, '144 km/h');
  assert.equal(formatStatistic(3725, 'seconds'), '1 h 2 min');
  assert.equal(formatStatistic(2, 'stars'), '2 stars');
  const copy = createStatisticsBook(TRACKED_STATISTICS);
  copy.restore(JSON.parse(JSON.stringify(book.serialise())));
  assert.equal(copy.values.vehicles_stolen, 2);
  assert.equal(copy.values.distance_driven, 1500);
});

test('a save holds every saving system under its name and nothing that is not saved', () => {
  const save = composeSave({ seed: 7, playSeconds: 3725.4, clock: { day: 2, timeOfDay: 18.83 }, savedAt: '2026-11-18T06:00:00.000Z' }, [
    ['player', { position: { x: 1, y: 2, z: 3 } }], ['wantedLevel', { level: 3 }], ['economy', { cash: 4321, ownedPropertyIds: ['tolliver_loft'] }],
    ['missions', { completed: ['m01_hook_and_chain'] }], ['progression', { reputation: 100 }], ['traffic', {}], ['combat', undefined],
  ]);
  assert.equal(save.version, SAVE_VERSION);
  assert.equal(save.playSeconds, 3725);
  assert.ok(!('wantedLevel' in save) && !('traffic' in save) && !('combat' in save));
  assert.deepEqual(validateSave(save), { ok: true, reason: '' });
  assert.equal(validateSave({ ...save, version: 99 }).ok, false);
  assert.equal(validateSave(null).ok, false);
  assert.deepEqual(sectionsOf(save, ['player', 'missions', 'economy', 'progression']).map(([name]) => name), ['player', 'missions', 'economy', 'progression']);
  assert.deepEqual(summariseSave(save), { cash: 4321, missions: 1, playTime: '1 h 2 min', savedAt: '2026-11-18T06:00:00.000Z', day: 2 });
  assert.equal(slotKey(), 'save.slot1');
  assert.equal(slotKey(9), 'save.slot3');
});

test('a save survives the storage wrapper unchanged, and a corrupt record is refused', () => {
  const memory = new Map();
  const backend = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null), setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key), key: (index) => [...memory.keys()][index] ?? null, get length() { return memory.size; },
  };
  const storage = createPersistentStorage({ namespace: 'test', backend });
  const save = composeSave({ seed: 1, playSeconds: 10, clock: null }, [['economy', { cash: 99 }]]);
  const written = storage.write(slotKey(1), save, { version: SAVE_VERSION });
  assert.ok(written.ok && written.bytes > 0);
  const read = storage.read(slotKey(1), { version: SAVE_VERSION, migrations: SAVE_MIGRATIONS });
  assert.ok(read.ok);
  assert.deepEqual(read.data, save);
  memory.set('test:save.slot2', '{not json');
  assert.equal(storage.read(slotKey(2), { version: SAVE_VERSION }).ok, false);
});

test('a version 1 save is migrated: the lead moves from the player section to the lead header', () => {
  assert.equal(SAVE_VERSION, 2);
  const memory = new Map();
  const backend = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null), setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key), key: (index) => [...memory.keys()][index] ?? null, get length() { return memory.size; },
  };
  const storage = createPersistentStorage({ namespace: 'test', backend });
  const lead = { characterId: 'dez_tolliver', position: { x: 96.87, y: 0.2, z: -1.07 }, heading: 1.1, health: 80, armour: 25 };
  const version1 = {
    version: 1, savedAt: '2026-11-18T06:45:00.000Z', seed: 1, playSeconds: 600, slot: 1, reason: 'test', clock: { day: 3, timeOfDay: 9.5 },
    player: lead, economy: { cash: 57000, ownedPropertyIds: ['tolliver_loft', 'dock_12_storage'] }, missions: { completed: ['m01_hook_and_chain'] },
    combat: { weapons: [{ weaponId: 'smg', magazine: 30, reserve: 60 }], equippedWeaponId: 'smg' },
  };
  memory.set('test:save.slot1', JSON.stringify({ v: 1, d: version1 }));
  const read = storage.read(slotKey(1), { version: SAVE_VERSION, migrations: SAVE_MIGRATIONS });
  assert.ok(read.ok, read.reason);
  assert.ok(read.migrated);
  const save = read.data;
  assert.equal(save.version, 2);
  assert.deepEqual(validateSave(save), { ok: true, reason: '' });
  assert.deepEqual(save.lead, lead);
  assert.ok(!('player' in save));
  assert.deepEqual(sectionsOf(save, ['missions', 'economy', 'combat']).map(([name]) => name), ['missions', 'economy', 'combat']);
  assert.deepEqual(save.economy, version1.economy);
  assert.equal(summariseSave(save).day, 3);
  // A player section that is the player system's own (no lead fields) stays where it is.
  const own = SAVE_MIGRATIONS[1]({ ...version1, player: { mode: 'onFoot' } });
  assert.deepEqual(own.player, { mode: 'onFoot' });
  assert.equal(own.lead, null);
  assert.ok(validateSave(own).ok);
  // A save newer than the game is refused, not misread.
  memory.set('test:save.slot3', JSON.stringify({ v: 3, d: { ...save, version: 3 } }));
  assert.equal(storage.read(slotKey(3), { version: SAVE_VERSION, migrations: SAVE_MIGRATIONS }).ok, false);
});

test('the lead record rounds the place and fills missing health and armour', () => {
  assert.equal(leadRecord(null), null);
  assert.deepEqual(leadRecord({ position: { x: 1.23456, y: 0, z: -2.0001 }, heading: 0.123456 }), {
    characterId: 'dez_tolliver', position: { x: 1.23, y: 0, z: -2 }, heading: 0.12, health: 100, armour: 0,
  });
  const save = composeSave({ seed: 1, playSeconds: 5, clock: null, lead: leadRecord({ position: { x: 4, y: 0, z: 5 }, health: 60 }) }, [['economy', { cash: 1 }]]);
  assert.equal(save.lead.health, 60);
  assert.ok(validateSave(save).ok);
  assert.equal(validateSave({ ...save, lead: { health: 1 } }).ok, false);
});
