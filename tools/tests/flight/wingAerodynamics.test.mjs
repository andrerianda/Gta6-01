// The lift curve (slope, stall break, plateau, flaps) and the drag polar (parasitic, induced, wave,
// gear, flaps, ground effect) of every aircraft in the catalog.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VEHICLE_CATALOG } from '../../../game/src/catalog/vehicleCatalog.js';
import { deriveAirplaneTuning } from '../../../game/src/flight/airplaneTuning.js';
import {
  alphaForLift, dragCoefficient, liftCoefficient, maxLiftCoefficient, sideForceCoefficient, waveDragFactor,
} from '../../../game/src/flight/wingAerodynamics.js';
import { AIRCRAFT_IDS, KNOTS } from './flightTestBench.mjs';

const tunings = AIRCRAFT_IDS.map((id) => deriveAirplaneTuning(VEHICLE_CATALOG[id]));
const near = (actual, expected, tolerance, what) => assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual} vs ${expected}`);

test('lift rises in a straight line to the critical angle', () => {
  for (const { id, wing } of tunings) {
    const step = wing.criticalAlpha / 8;
    for (let alpha = 0; alpha < wing.criticalAlpha - step; alpha += step) {
      near((liftCoefficient(wing, alpha + step, 0) - liftCoefficient(wing, alpha, 0)) / step, wing.liftSlope, 1e-6, `${id} slope`);
    }
    near(liftCoefficient(wing, wing.criticalAlpha, 0), wing.clMaxClean, 1e-9, `${id} peak`);
    assert.ok(wing.criticalAlpha > 0.2 && wing.criticalAlpha < 0.42, `${id} stalls at a believable angle`);
  }
});

test('past the critical angle the lift breaks, then holds a lower plateau', () => {
  for (const { id, wing } of tunings) {
    const peak = wing.clMaxClean;
    const justPast = liftCoefficient(wing, wing.criticalAlpha + 0.02, 0);
    const broken = liftCoefficient(wing, wing.criticalAlpha + 0.1, 0);
    const deep = liftCoefficient(wing, wing.criticalAlpha + 0.3, 0);
    assert.ok(justPast < peak, `${id} loses lift at once`);
    assert.ok(broken < 0.72 * peak && broken > 0.5 * peak, `${id} break: ${broken / peak}`);
    assert.ok(deep > 0.4 * peak && deep < 0.95 * peak, `${id} plateau: ${deep / peak}`);
    // Inverted, it stalls too, at a smaller lift.
    assert.ok(liftCoefficient(wing, wing.negativeAlpha - 0.1, 0) > liftCoefficient(wing, wing.negativeAlpha, 0), `${id} inverted break`);
    assert.ok(-liftCoefficient(wing, wing.negativeAlpha, 0) < peak, `${id} inverted peak is lower`);
  }
});

test('the largest lift coefficients are the catalog stall speeds, clean and with flaps', () => {
  for (const tuning of tunings) {
    const flight = VEHICLE_CATALOG[tuning.id].flight;
    const speedAt = (lift) => Math.sqrt((tuning.mass * 9.81) / (0.5 * 1.225 * tuning.wing.area * lift));
    near(speedAt(maxLiftCoefficient(tuning.wing, 0)) * KNOTS, flight.stallSpeedClean * KNOTS, 0.01, `${tuning.id} clean`);
    near(speedAt(maxLiftCoefficient(tuning.wing, 1)) * KNOTS, flight.stallSpeedFlaps * KNOTS, 0.01, `${tuning.id} flaps`);
  }
});

test('flaps lift the whole curve and add drag; alphaForLift inverts the straight part', () => {
  for (const { id, wing } of tunings) {
    const alpha = 0.08;
    assert.ok(liftCoefficient(wing, alpha, 1) >= liftCoefficient(wing, alpha, 0), `${id} flap lift`);
    near(alphaForLift(wing, liftCoefficient(wing, alpha, 0.5), 0.5), alpha, 1e-9, `${id} inverse`);
    assert.equal(alphaForLift(wing, 99, 0), wing.criticalAlpha);
    assert.ok(dragCoefficient(wing, 0.4, alpha, 0.2, 1, 0, 0) > dragCoefficient(wing, 0.4, alpha, 0.2, 0, 0, 0), `${id} flap drag`);
  }
  const trainer = tunings[0].wing;
  assert.ok(trainer.flapLift > 0.3, 'the trainer has real flaps');
});

test('the drag polar: parasitic plus induced CL^2 / (pi e AR)', () => {
  for (const { id, wing } of tunings) {
    near(dragCoefficient(wing, 0, 0, 0.2, 0, 0, 0), wing.cd0, 1e-9, `${id} zero-lift drag`);
    for (const lift of [0.2, 0.5, 0.9]) {
      near(dragCoefficient(wing, lift, 0.05, 0.2, 0, 0, 0) - wing.cd0, lift * lift * wing.inducedFactor, 1e-9, `${id} induced at ${lift}`);
    }
    near(wing.inducedFactor, 1 / (Math.PI * VEHICLE_CATALOG[id].flight.oswald * wing.aspectRatio), 1e-9, `${id} induced factor`);
    // Close to the runway the wing's downwash is cut, and with it the induced drag.
    assert.ok(dragCoefficient(wing, 0.9, 0.05, 0.2, 0, 0, 1) < dragCoefficient(wing, 0.9, 0.05, 0.2, 0, 0, 0), `${id} ground effect`);
    // A stalled wing is a barn door.
    assert.ok(dragCoefficient(wing, 0.8, wing.criticalAlpha + 0.2, 0.2, 0, 0, 0) > dragCoefficient(wing, 0.8, 0.1, 0.2, 0, 0, 0) + 0.25, `${id} separated drag`);
  }
  const jet = tunings[2].wing;
  assert.ok(dragCoefficient(jet, 0.1, 0.02, 0.3, 0, 1, 0) > dragCoefficient(jet, 0.1, 0.02, 0.3, 0, 0, 0), 'gear drag');
});

test('wave drag: none below the critical Mach number, a peak past Mach 1, less beyond', () => {
  for (const { id, wing } of tunings.slice(1)) {
    assert.equal(waveDragFactor(wing, wing.criticalMach - 0.05), 1, `${id} subsonic`);
    const peak = waveDragFactor(wing, 1.1);
    assert.ok(peak > 1.5, `${id} transonic rise`);
    assert.ok(waveDragFactor(wing, 2.6) < peak && waveDragFactor(wing, 2.6) > 1, `${id} supersonic plateau`);
  }
});

test('sideslip pushes the aircraft back towards the airflow', () => {
  const wing = tunings[0].wing;
  assert.ok(sideForceCoefficient(wing, 0.1) < 0);
  assert.ok(sideForceCoefficient(wing, -0.1) > 0);
  assert.equal(Math.abs(sideForceCoefficient(wing, 0)), 0);
});
