// The aircraft sound maps: engine spool to pitch, thrust to roar, the afterburner layer, wind by
// airspeed, the stall horn of the trainer and of the jets, the ground-proximity tone, the
// touchdown chirp and the gear and flap motors. And the flight deck's entry module keeps the
// entry-module rule (small, static imports from core only).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import {
  AIRCRAFT_WARNING_SOUNDS, PROPELLER, aircraftVoiceKindOf, jetSoundTargets, motorRunning, propellerSoundTargets, pullUpToneOn,
  stallHornTargets, touchdownChirp, windSoundTargets,
} from '../../../game/src/audio/aircraftSoundTargets.js';
import { ENGINE_PROFILES } from '../../../game/src/audio/engineProfiles.js';
import { VEHICLE_CATALOG, VEHICLE_ENGINE_SOUNDS } from '../../../game/src/catalog/vehicleCatalog.js';
import { GAME_SYSTEM_FACTORIES, GAME_SYSTEM_NAMES } from '../../../game/src/core/systems/gameSystemManifest.js';

const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} is not within ${tolerance} of ${b}`);

test('every airplane in the catalog has an aircraft voice and a foley profile', () => {
  const airplanes = Object.values(VEHICLE_CATALOG).filter((entry) => entry.class === 'airplane');
  assert.ok(airplanes.length >= 4);
  for (const entry of airplanes) {
    const kind = aircraftVoiceKindOf(entry.engine.sound);
    assert.equal(kind, entry.flight.kind === 'piston' ? 'propeller' : 'jet', entry.id);
    assert.ok(VEHICLE_ENGINE_SOUNDS[entry.engine.sound], `${entry.engine.sound} is a catalog sound`);
    assert.ok(ENGINE_PROFILES[entry.engine.sound], `${entry.engine.sound} has an engine profile`);
  }
  assert.equal(aircraftVoiceKindOf('rumbling_eight'), null);
  assert.equal(aircraftVoiceKindOf(null), null);
});

test('a propeller: pitch rises with the spool, the blades beat at twice the shaft speed', () => {
  const sound = VEHICLE_ENGINE_SOUNDS.prop_flat_four;
  const idle = propellerSoundTargets(0.1, 0, sound, {});
  const full = propellerSoundTargets(1, 1, sound, {});
  assert.ok(full.engineHz > idle.engineHz && full.bladeHz > idle.bladeHz);
  near(full.engineHz, sound.redlineHz);
  near(full.bladeHz, (PROPELLER.fullRpm / 60) * PROPELLER.blades);
  assert.ok(full.engineGain > idle.engineGain && full.bladeGain > idle.bladeGain && full.cutoff > idle.cutoff);
  const stopped = propellerSoundTargets(0, 0, sound, {});
  assert.equal(stopped.engineGain, 0);
  assert.equal(stopped.bladeGain, 0);
  const wild = propellerSoundTargets(7, -3, sound, {});
  near(wild.engineHz, sound.redlineHz);
});

test('a jet: the whine follows the spool, the roar the thrust, the burner its own layer', () => {
  const sound = VEHICLE_ENGINE_SOUNDS.jet_afterburner;
  const idle = jetSoundTargets(0.3, 0.05, 0, sound, {});
  const dry = jetSoundTargets(1, 1, 0, sound, {});
  const lit = jetSoundTargets(1, 1, 1, sound, {});
  assert.ok(dry.whineHz > idle.whineHz);
  near(dry.whineHz, sound.redlineHz * 4);
  assert.ok(dry.roarGain > idle.roarGain * 3 && dry.roarCutoff > idle.roarCutoff);
  assert.equal(dry.burnerGain, 0);
  assert.ok(lit.burnerGain > 0.5 && lit.roarGain > dry.roarGain && lit.roarCutoff > dry.roarCutoff);
  const off = jetSoundTargets(0, 0, 0, sound, {});
  assert.equal(off.whineGain, 0);
  assert.equal(off.roarGain, 0);
});

test('wind grows with airspeed and is louder in the cockpit', () => {
  const still = windSoundTargets(0, true, {});
  const slow = windSoundTargets(30, false, {});
  const fast = windSoundTargets(150, false, {});
  const cabin = windSoundTargets(150, true, {});
  assert.equal(still.gain, 0);
  assert.ok(fast.gain > slow.gain && fast.cutoff > slow.cutoff && cabin.gain > fast.gain);
  assert.equal(windSoundTargets(-5, false, {}).gain, 0);
  assert.ok(windSoundTargets(2000, true, {}).gain <= 0.55);
});

test('the stall horn: a steady reed in the trainer, pulsed in the jets, silent on the ground', () => {
  const L = AIRCRAFT_WARNING_SOUNDS;
  assert.equal(stallHornTargets(L.stallHornFrom - 0.01, 'propeller', false, {}).gain, 0);
  const reed = stallHornTargets(0.6, 'propeller', false, {});
  assert.ok(reed.gain > 0 && reed.pulseHz === 0 && reed.hz > 380 && reed.hz < 480);
  const pulsed = stallHornTargets(0.6, 'jet', false, {});
  assert.ok(pulsed.gain > 0);
  assert.equal(pulsed.pulseHz, L.jetHornPulseHz);
  assert.equal(stallHornTargets(1, 'propeller', true, {}).gain, 0);
});

test('the ground-proximity tone needs height running out fast', () => {
  assert.equal(pullUpToneOn({ radarAltitude: 200, verticalSpeed: -40, onGround: false }), true);
  assert.equal(pullUpToneOn({ radarAltitude: 200, verticalSpeed: -3, onGround: false }), false, 'a normal approach');
  assert.equal(pullUpToneOn({ radarAltitude: 700, verticalSpeed: -20, onGround: false }), false, '35 seconds away');
  assert.equal(pullUpToneOn({ radarAltitude: 2000, verticalSpeed: -400, onGround: false }), false, 'above the radar altimeter');
  assert.equal(pullUpToneOn({ radarAltitude: 0, verticalSpeed: -40, onGround: true }), false);
  assert.equal(pullUpToneOn({ radarAltitude: NaN, verticalSpeed: NaN, onGround: false }), false);
});

test('tyres chirp on a touchdown at speed; motors run while the gear or flaps travel', () => {
  assert.equal(touchdownChirp(0, 2, 5), 0, 'taxi speed');
  assert.equal(touchdownChirp(3, 3, 60), 0, 'already down');
  assert.equal(touchdownChirp(2, 0, 60), 0, 'lifting off');
  const light = touchdownChirp(0, 2, 25);
  const heavy = touchdownChirp(0, 3, 80);
  assert.ok(light > 0 && heavy > light && heavy <= 1);
  assert.equal(motorRunning(1, 1), false);
  assert.equal(motorRunning(1, 0.98), true);
  assert.equal(motorRunning(0.2, 0.21), true);
});

test('the flight deck is in the manifest after the camera, and its entry module keeps the import rule', () => {
  const at = GAME_SYSTEM_NAMES.indexOf('flightDeck');
  assert.equal(at, GAME_SYSTEM_NAMES.indexOf('followCamera') + 1);
  assert.equal(GAME_SYSTEM_FACTORIES.length, GAME_SYSTEM_NAMES.length);
  assert.equal(GAME_SYSTEM_FACTORIES[at].name, 'createFlightDeckSystem');
  const path = new URL('../../../game/src/flight/flightDeck.js', import.meta.url);
  assert.ok(statSync(path).size < 6144, 'the entry module stays under 6 KB');
  const source = readFileSync(path, 'utf8');
  for (const match of source.matchAll(/^import\s.*?from\s+'([^']+)'/gm)) {
    assert.ok(match[1].startsWith('../core/'), `static import ${match[1]} is from core`);
  }
  const system = GAME_SYSTEM_FACTORIES[at]({});
  assert.equal(system.name, 'flightDeck');
  assert.equal(system.active, false);
  assert.equal(system.readout, null);
  assert.doesNotThrow(() => { system.update(0.016); system.setContacts([]); system.setHatchOpen(true); system.dispose(); });
});
