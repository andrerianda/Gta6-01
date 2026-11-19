// Every station on the dial has its own complete sound: a drum kit, filters, drive and echo,
// and no two stations share a kit or a filter set.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RADIO_STATION_SOUNDS, radioStationSound } from '../../../game/src/audio/radioStationSounds.js';
import { RADIO_STATIONS, RADIO_DIAL_ORDER } from '../../../game/src/catalog/radioStations.js';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

test('every dial station has a complete sound of its own', () => {
  for (const id of RADIO_DIAL_ORDER) {
    const sound = radioStationSound(id, RADIO_STATIONS[id].music);
    assert.equal(sound, RADIO_STATION_SOUNDS[id], `${id} falls back instead of having its own sound`);
    const { kit } = sound;
    assert.equal(kit.kick.length, 4, id);
    assert.ok(kit.kick.every(finite), id);
    assert.ok(typeof kit.snare[0] === 'string' && kit.snare.slice(1).every(finite), id);
    assert.ok(typeof kit.hat[0] === 'string' && kit.hat.slice(1).every(finite), id);
    for (const key of ['bassHz', 'padHz', 'padQ', 'leadHz', 'drive']) assert.ok(finite(sound[key]), `${id}.${key}`);
    assert.ok(sound.bassHz < sound.padHz && sound.padHz < sound.leadHz, `${id}: bass < pad < lead cut-offs`);
    assert.ok(sound.echo.steps >= 1 && sound.echo.feedback < 0.6 && sound.echo.mix < 0.4, `${id}: echo stays tame`);
  }
});

test('stations sound distinct', () => {
  const signatures = RADIO_DIAL_ORDER.map((id) => {
    const s = RADIO_STATION_SOUNDS[id];
    return JSON.stringify([s.kit, s.bassHz, s.padHz, s.leadHz]);
  });
  assert.equal(new Set(signatures).size, signatures.length);
  assert.equal(new Set(RADIO_DIAL_ORDER.map((id) => RADIO_STATION_SOUNDS[id].kit)).size, RADIO_DIAL_ORDER.length);
});

test('an unknown station falls back by mood, else to a default', () => {
  assert.equal(radioStationSound('nope', { mood: 'smoky' }), RADIO_STATION_SOUNDS.voz_del_golfo);
  assert.ok(radioStationSound('nope', null).kit);
});
