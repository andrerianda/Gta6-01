// Pure parts of the audio system: engine profiles and targets, siren and horn patterns, the
// voice priority table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE_PROFILES, PHYSICS_RPM, engineProfileFor, engineHarmonics, engineTargets, dopplerFactor } from '../../../game/src/audio/engineProfiles.js';
import { sirenFrequency, sirenPatternFor, hornTonesFor, HORN_TONES } from '../../../game/src/audio/sirenAndHornPatterns.js';
import { createVoicePriorityTable, SOUND_PRIORITY } from '../../../game/src/audio/voicePriorityTable.js';
import { VEHICLE_CATALOG } from '../../../game/src/catalog/vehicleCatalog.js';

test('every catalog engine sound and horn has a profile', () => {
  for (const spec of Object.values(VEHICLE_CATALOG)) {
    assert.ok(ENGINE_PROFILES[spec.engine.sound], `engine sound ${spec.engine.sound} of ${spec.id}`);
    const horn = spec.engine.horn;
    assert.ok(HORN_TONES[horn] || sirenPatternFor(horn), `horn ${horn} of ${spec.id}`);
  }
  assert.equal(engineProfileFor('unknown_eight'), ENGINE_PROFILES.rumbling_eight);
});

test('firing harmonics dominate and lumpy engines carry more off-order energy', () => {
  const offOrderShare = (name) => {
    const engine = ENGINE_PROFILES[name];
    const { real, imag } = engineHarmonics(engine, 48);
    let firing = 0;
    let other = 0;
    for (let k = 1; k <= 48; k += 1) {
      const a = Math.hypot(real[k], imag[k]);
      if (k % engine.cylinders === 0) firing += a; else other += a;
    }
    assert.ok(firing > 0 && Number.isFinite(other));
    return other / firing;
  };
  assert.ok(offOrderShare('burbling_eight') > offOrderShare('smooth_six') * 3);
  assert.ok(offOrderShare('thumping_twin') > offOrderShare('smooth_four'));
});

test('engine targets follow rpm and throttle within each profile range', () => {
  const out = {};
  const v8 = ENGINE_PROFILES.rumbling_eight;
  engineTargets(v8, PHYSICS_RPM.idle, 0, out);
  assert.equal(out.rpm, v8.idleRpm);
  assert.ok(Math.abs(out.firingHz - v8.idleRpm / 120 * 8) < 1e-9);
  const idle = { ...out };
  engineTargets(v8, PHYSICS_RPM.redline, 1, out);
  assert.equal(out.rpm, v8.redlineRpm);
  assert.ok(out.gain > idle.gain && out.cutoffHz > idle.cutoffHz && out.noiseGain > idle.noiseGain);
  assert.ok(idle.lopeDepth > out.lopeDepth, 'idle lopes, redline does not');
  const truck = engineTargets(ENGINE_PROFILES.diesel_six, PHYSICS_RPM.redline, 1, {});
  const bike = engineTargets(ENGINE_PROFILES.screaming_four, PHYSICS_RPM.redline, 1, {});
  assert.ok(truck.rpm < 3000 && bike.rpm > 11000);
  for (const t of [idle, out, truck, bike]) for (const v of Object.values(t)) assert.ok(Number.isFinite(v));
});

test('doppler raises approaching pitch and lowers receding pitch', () => {
  assert.ok(dopplerFactor(20) > 1.05 && dopplerFactor(-20) < 0.95);
  assert.equal(dopplerFactor(0), 1);
  assert.ok(Number.isFinite(dopplerFactor(5000)));
});

test('siren patterns stay in their bands and alternate', () => {
  for (let t = 0; t < 10; t += 0.05) {
    const wail = sirenFrequency('wail', t);
    const yelp = sirenFrequency('yelp', t);
    assert.ok(wail >= 650 && wail <= 1450);
    assert.ok(yelp >= 720 && yelp <= 1560);
    assert.ok([960, 770].includes(sirenFrequency('hilo', t)));
  }
  assert.notEqual(sirenFrequency('hilo', 0.1), sirenFrequency('hilo', 0.7));
  assert.equal(sirenPatternFor('two_tone'), null);
  assert.equal(sirenPatternFor('siren_hilo'), 'hilo');
  assert.deepEqual([...hornTonesFor('air_horn')], [185, 233, 277]);
});

test('voice table: free slots first, then priority and distance decide', () => {
  const table = createVoicePriorityTable(2);
  assert.equal(table.acquire(SOUND_PRIORITY.footstep, 5, 0, 1), 0);
  assert.equal(table.acquire(SOUND_PRIORITY.gunshot, 50, 0, 1), 1);
  // Full: a farther footstep cannot steal; an explosion steals the footstep.
  assert.equal(table.acquire(SOUND_PRIORITY.footstep, 10, 0.1, 1), -1);
  assert.equal(table.acquire(SOUND_PRIORITY.explosion, 100, 0.1, 2), 0);
  // Equal priority: the nearer sound replaces the farther one.
  assert.equal(table.acquire(SOUND_PRIORITY.gunshot, 10, 0.2, 1), 1);
  assert.equal(table.acquire(SOUND_PRIORITY.gunshot, 200, 0.3, 1), -1);
  assert.equal(table.activeCount(0.5), 2);
  // Time frees slots.
  assert.equal(table.acquire(SOUND_PRIORITY.footstep, 1, 1.5, 0.2), 1);
  assert.equal(table.dropped, 2);
  assert.equal(table.stolen, 2);
});
