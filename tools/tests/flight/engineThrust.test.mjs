// Thrust from the throttle: the propeller's power over speed, the jets' lapse with height, the
// afterburner stage, the ram rise of the fast jet and the spool lag.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VEHICLE_CATALOG } from '../../../game/src/catalog/vehicleCatalog.js';
import { deriveAirplaneTuning } from '../../../game/src/flight/airplaneTuning.js';
import { advanceEngineSpool, afterburnerShare, enginePowerShare, engineThrust } from '../../../game/src/flight/engineThrust.js';
import { createAirSample, standardAtmosphereAt } from '../../../game/src/flight/standardAtmosphere.js';

const engineOf = (id) => deriveAirplaneTuning(VEHICLE_CATALOG[id]).engine;
const air = createAirSample();
const thrustAt = (engine, spool, mach, height) => {
  standardAtmosphereAt(height, air);
  return engineThrust(engine, spool, mach * air.speedOfSound, mach, air.densityRatio, height);
};

test('a piston engine: strong standing still, power over speed on the move, weaker up high', () => {
  const engine = engineOf('gaviota_t2');
  const standing = engineThrust(engine, 1, 0, 0, 1, 0);
  assert.ok(standing > 1800 && standing < 3200, `static thrust ${standing}`);
  const cruising = engineThrust(engine, 1, 56, 0.16, 1, 0);
  assert.ok(cruising < standing * 0.6, 'thrust falls with speed');
  // Never more than the shaft power can give.
  assert.ok(cruising * 56 < engine.power * engine.propEfficiency);
  assert.ok(cruising * 56 > engine.power * 0.6, 'and not much less at cruise');
  assert.ok(thrustAt(engine, 1, 0.16, 3000) < 0.8 * thrustAt(engine, 1, 0.16, 0), 'thinner air, less power');
  assert.equal(engineThrust(engine, 0, 30, 0.1, 1, 0), 0, 'stopped: no thrust');
  assert.ok(engineThrust(engine, engine.idle, 0, 0, 1, 0) < 0.1 * standing, 'idle: a trickle');
});

test('a jet loses thrust with height and fades out above its ceiling', () => {
  const engine = engineOf('manta_sombra');
  const seaLevel = thrustAt(engine, 1, 0, 0);
  assert.ok(Math.abs(seaLevel - 4 * 85000) < 1000, `four engines: ${seaLevel}`);
  const high = thrustAt(engine, 1, 0.8, 11000);
  assert.ok(high < 0.35 * seaLevel && high > 0.15 * seaLevel, `at 11 km: ${high / seaLevel}`);
  assert.ok(thrustAt(engine, 1, 0.8, 0) < seaLevel, 'a turbofan loses thrust with speed');
  assert.ok(thrustAt(engine, 1, 0.8, 17000) < 0.05 * seaLevel, 'nothing left above the ceiling');
});

test('the afterburner lights over the last tenth of the throttle', () => {
  const engine = engineOf('halcon');
  const spoolFor = (lever) => engine.idle + (1 - engine.idle) * lever;
  const dry = thrustAt(engine, spoolFor(0.9), 0, 0);
  const wet = thrustAt(engine, spoolFor(1), 0, 0);
  assert.ok(Math.abs(wet - 115000) < 500, `full reheat ${wet}`);
  assert.ok(Math.abs(dry / wet - engine.dryShare) < 0.01, `dry share ${dry / wet}`);
  assert.equal(afterburnerShare(engine, spoolFor(0.9)), 0);
  assert.ok(Math.abs(afterburnerShare(engine, spoolFor(0.95)) - 0.5) < 1e-6);
  assert.equal(afterburnerShare(engineOf('manta_sombra'), 1), 0, 'no afterburner on the bomber');
});

test('the fast jet gains thrust from ram pressure and chokes past its Mach limit', () => {
  const engine = engineOf('garza_negra');
  assert.ok(thrustAt(engine, 1, 2.5, 20000) > 1.5 * thrustAt(engine, 1, 0.9, 20000), 'ram rise');
  assert.ok(thrustAt(engine, 1, 3.6, 24000) < 0.3 * thrustAt(engine, 1, 3.0, 24000), 'choked');
});

test('engines take time to spool up and to run down', () => {
  for (const id of ['gaviota_t2', 'garza_negra']) {
    const engine = engineOf(id);
    let spool = advanceEngineSpool(engine, 0, 0, true, 100);
    assert.ok(Math.abs(spool - engine.idle) < 1e-9, 'a running engine idles');
    assert.equal(enginePowerShare(engine, spool), 0);
    let seconds = 0;
    while (enginePowerShare(engine, spool) < 0.95 && seconds < 30) {
      spool = advanceEngineSpool(engine, spool, 1, true, 1 / 60);
      seconds += 1 / 60;
    }
    assert.ok(seconds > engine.spoolUpTime * 0.6 && seconds < engine.spoolUpTime * 1.5, `${id} spools up in ${seconds} s`);
    for (let i = 0; i < 3600; i += 1) spool = advanceEngineSpool(engine, spool, 1, false, 1 / 60);
    assert.equal(spool, 0, 'switched off, it stops');
  }
});
