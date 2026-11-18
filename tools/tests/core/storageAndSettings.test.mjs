// Persistent storage (namespacing, versions and migration, size checks, safe failure) and the
// settings store built on it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGameSettings, DEFAULT_SETTINGS, SETTINGS_VERSION } from '../../../game/src/core/quality/gameSettings.js';
import { createMemoryBackend, createPersistentStorage } from '../../../game/src/core/storage/persistentStorage.js';

test('records round-trip under a namespace', () => {
  const backend = createMemoryBackend();
  const storage = createPersistentStorage({ namespace: 'marazul', backend });
  const other = createPersistentStorage({ namespace: 'other', backend });
  const result = storage.write('save.slot1', { cash: 1200, position: [1, 2, 3] }, { version: 2 });
  assert.ok(result.ok && result.bytes > 0 && result.reason === '');
  other.write('save.slot1', { cash: 5 });
  assert.deepEqual(storage.read('save.slot1').data, { cash: 1200, position: [1, 2, 3] });
  assert.equal(storage.read('save.slot1').version, 2);
  assert.deepEqual(storage.keys(), ['save.slot1']);
  assert.ok(backend.getItem('marazul:save.slot1'));
  storage.write('settings', {});
  assert.deepEqual(storage.keys('save.'), ['save.slot1']);
  assert.ok(storage.has('settings'));
  assert.ok(storage.bytesUsed() > 0);
  storage.clear();
  assert.deepEqual(storage.keys(), []);
  assert.deepEqual(other.keys(), ['save.slot1'], 'another namespace is untouched');
});

test('old records are migrated step by step to the version asked for', () => {
  const storage = createPersistentStorage({ backend: createMemoryBackend() });
  storage.write('save', { money: 300 }, { version: 1 });
  const migrations = {
    1: (old) => ({ cash: old.money }),
    2: (old) => ({ ...old, reputation: 0 }),
  };
  const result = storage.read('save', { version: 3, migrations });
  assert.ok(result.ok && result.migrated);
  assert.deepEqual(result.data, { cash: 300, reputation: 0 });
  assert.equal(result.version, 1, 'the version it was stored with');
  assert.equal(storage.read('save', { version: 1 }).migrated, false);
});

test('reads fail safely: missing, corrupt, newer, no migration, failing migration', () => {
  const backend = createMemoryBackend();
  const storage = createPersistentStorage({ backend });
  assert.deepEqual(storage.read('nothing', { fallback: { fresh: true } }),
    { ok: false, data: { fresh: true }, version: 0, migrated: false, reason: 'missing' });
  backend.setItem('marazul:broken', '{not json');
  assert.equal(storage.read('broken').reason, 'corrupt');
  backend.setItem('marazul:shape', '[1,2,3]');
  assert.equal(storage.read('shape').reason, 'corrupt');
  storage.write('future', { a: 1 }, { version: 9 });
  assert.equal(storage.read('future', { version: 3 }).reason, 'newer version');
  storage.write('old', { a: 1 }, { version: 1 });
  assert.equal(storage.read('old', { version: 3, migrations: { 2: (data) => data } }).reason, 'no migration from version 1');
  const failing = storage.read('old', { version: 2, migrations: { 1: () => { throw new Error('bad field'); } } });
  assert.equal(failing.ok, false);
  assert.match(failing.reason, /migration from version 1 failed: bad field/);
});

test('writes fail safely: too large, not serialisable, a store that refuses', () => {
  const storage = createPersistentStorage({ backend: createMemoryBackend(), maxRecordBytes: 200 });
  assert.equal(storage.write('big', { text: 'x'.repeat(500) }).reason, 'too large');
  assert.equal(storage.has('big'), false);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(storage.write('cyclic', cyclic).reason, 'not serialisable');

  const refusing = createPersistentStorage({
    backend: {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('quota'); },
      removeItem: () => { throw new Error('denied'); },
      key: () => { throw new Error('denied'); },
      get length() { throw new Error('denied'); },
    },
  });
  assert.equal(refusing.write('a', 1).reason, 'storage refused');
  assert.equal(refusing.read('a').reason, 'missing');
  assert.equal(refusing.has('a'), false);
  assert.deepEqual(refusing.keys(), []);
  refusing.remove('a');
  refusing.clear();
});

test('without a working store the data lives in memory', () => {
  const storage = createPersistentStorage({ backend: null });
  assert.equal(storage.persistent, false);
  storage.write('k', { v: 1 });
  assert.deepEqual(storage.read('k').data, { v: 1 });
});

test('settings: defaults, validation, change events and persistence', () => {
  const backend = createMemoryBackend();
  const storage = createPersistentStorage({ backend });
  const changes = [];
  const settings = createGameSettings({ storage, onChanged: (change) => changes.push(change) });
  assert.equal(settings.loadedFromStorage, false);
  assert.equal(settings.get('graphics.quality'), 'auto');
  assert.equal(settings.get('audio.master'), DEFAULT_SETTINGS.audio.master);
  assert.equal(settings.get('no.such'), undefined);

  assert.equal(settings.set('graphics.quality', 'ultra'), true);
  assert.equal(settings.set('graphics.quality', 'extreme'), false);
  assert.equal(settings.set('audio.master', 1.5), false);
  assert.equal(settings.set('audio.master', '0.5'), false);
  assert.equal(settings.set('audio.muted', true), true);
  assert.equal(settings.set('audio.muted', true), true, 'setting the same value is fine');
  assert.equal(settings.set('no.such', 1), false);
  assert.equal(settings.set('controls.bindings', { onFoot: { jump: ['KeyJ'] } }), true);
  assert.deepEqual(changes.map((change) => change.key), ['graphics.quality', 'audio.muted', 'controls.bindings']);
  assert.deepEqual(changes[0], { key: 'graphics.quality', value: 'ultra', previous: 'auto' });

  const reloaded = createGameSettings({ storage });
  assert.equal(reloaded.loadedFromStorage, true);
  assert.equal(reloaded.get('graphics.quality'), 'ultra');
  assert.deepEqual(reloaded.get('controls.bindings'), { onFoot: { jump: ['KeyJ'] } });
  assert.equal(storage.read('settings').version, SETTINGS_VERSION);

  reloaded.reset('graphics');
  assert.equal(reloaded.get('graphics.quality'), 'auto');
  assert.equal(reloaded.get('audio.muted'), true);
  reloaded.reset();
  assert.equal(reloaded.get('audio.muted'), false);
  assert.ok(Object.isFrozen(DEFAULT_SETTINGS.graphics));
});

test('settings: stored values that are no longer valid fall back to defaults', () => {
  const backend = createMemoryBackend();
  const storage = createPersistentStorage({ backend });
  storage.write('settings', { graphics: { quality: 'potato', fieldOfView: 70 }, audio: 'loud', extra: { a: 1 } },
    { version: SETTINGS_VERSION });
  const settings = createGameSettings({ storage });
  assert.equal(settings.get('graphics.quality'), 'auto');
  assert.equal(settings.get('graphics.fieldOfView'), 70);
  assert.equal(settings.get('audio.master'), DEFAULT_SETTINGS.audio.master);
  const copy = settings.all();
  copy.graphics.fieldOfView = 10;
  assert.equal(settings.get('graphics.fieldOfView'), 70, 'all() is a copy');
});
