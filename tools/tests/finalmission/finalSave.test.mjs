// The save file with the world flags and the final mission's section: format 3, the migration
// from format 2 (flags false), and a round trip through compose / sections / restore.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVE_VERSION, SAVE_MIGRATIONS, composeSave, sectionsOf, validateSave, flagsRecord,
} from '../../../game/src/save/saveFileFormat.js';
import { createWorldFlags, WORLD_FLAGS, WORLD_FLAG_NAMES } from '../../../game/src/core/state/worldFlags.js';
import { createFinalMissionMachine } from '../../../game/src/story/final/finalMissionMachine.js';

function migrate(save) {
  let data = save;
  while (data.version < SAVE_VERSION) data = SAVE_MIGRATIONS[data.version](data);
  return data;
}

test('the format is version 3 and every older version has a migration', () => {
  assert.equal(SAVE_VERSION, 3);
  for (let version = 1; version < SAVE_VERSION; version += 1) assert.equal(typeof SAVE_MIGRATIONS[version], 'function');
});

test('a version 2 save migrates: flags all false, everything else kept', () => {
  const old = { version: 2, savedAt: 'x', seed: 1, playSeconds: 90, slot: 1, reason: 'manual', clock: { timeOfDay: 9, day: 2 }, lead: { characterId: 'dez_tolliver', position: { x: 1, y: 2, z: 3 }, heading: 0, health: 80, armour: 0 }, economy: { cash: 500 }, missions: { completed: ['m01'] } };
  const now = migrate(old);
  assert.equal(now.version, 3);
  assert.deepEqual(now.flags, {});
  assert.equal(validateSave(now).ok, true);
  assert.deepEqual(now.economy, { cash: 500 });
  assert.deepEqual(now.lead, old.lead);
  const flags = createWorldFlags({ initial: [WORLD_FLAGS.SEA_OPEN] });
  flags.restore(now.flags);
  for (const name of WORLD_FLAG_NAMES) assert.equal(flags.get(name), false, name);
  assert.deepEqual(sectionsOf(now).map(([name]) => name).sort(), ['economy', 'missions'], 'flags is a header, not a system');
});

test('a version 1 save comes all the way forward', () => {
  const now = migrate({ version: 1, playSeconds: 5, clock: null, player: { characterId: 'dez_tolliver', position: { x: 4, y: 0, z: 5 }, heading: 1, health: 100, armour: 0 } });
  assert.equal(now.version, 3);
  assert.deepEqual(now.lead.position, { x: 4, y: 0, z: 5 });
  assert.deepEqual(now.flags, {});
  assert.equal(validateSave(now).ok, true);
});

test('flags and the final mission ride through a save and back', () => {
  const flags = createWorldFlags();
  flags.set(WORLD_FLAGS.SEA_OPEN, true);
  flags.set(WORLD_FLAGS.BASE_ALARM, true);
  const machine = createFinalMissionMachine();
  machine.start({ stage: 'stealth_test', aircraftId: 'garza_negra', flightMode: 'realistic' });
  const save = JSON.parse(JSON.stringify(composeSave(
    { seed: 1, playSeconds: 1200, clock: { timeOfDay: 6 }, lead: null, flags: flags.serialise() },
    [['economy', { cash: 10 }], ['finalMission', machine.serialise()], ['flags', { hijack: true }]],
  )));
  assert.equal(save.version, 3);
  assert.equal(validateSave(save).ok, true);
  assert.equal(save.flags[WORLD_FLAGS.SEA_OPEN], true);
  assert.equal(save.flags[WORLD_FLAGS.BASE_OFFICER_ACCESS], false);
  assert.equal(save.flags.hijack, undefined, 'a system cannot write over the header');
  const loadedFlags = createWorldFlags({ initial: [WORLD_FLAGS.BASE_OFFICER_ACCESS] });
  loadedFlags.restore(save.flags);
  assert.deepEqual(loadedFlags.serialise(), flags.serialise());
  const sections = Object.fromEntries(sectionsOf(save, ['economy', 'finalMission']));
  const loaded = createFinalMissionMachine();
  loaded.restore(sections.finalMission);
  assert.deepEqual([loaded.arc, loaded.stage, loaded.checkpoint, loaded.resumeStage()], ['running', 'stealth_test', 4, 'stealth_test']);
  assert.deepEqual([loaded.data.aircraftId, loaded.data.flightMode], ['garza_negra', 'realistic']);
});

test('flagsRecord keeps booleans only', () => {
  assert.deepEqual(flagsRecord(null), {});
  assert.deepEqual(flagsRecord([true]), {});
  assert.deepEqual(flagsRecord({ a: true, b: 1, c: 'yes', d: false }), { a: true, b: false, c: false, d: false });
});
