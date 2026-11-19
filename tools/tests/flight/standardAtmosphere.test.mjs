// The standard atmosphere against the published table, and the skin temperature at speed.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAirSample, recoveryTemperature, standardAtmosphereAt } from '../../../game/src/flight/standardAtmosphere.js';

const near = (actual, expected, tolerance, what) => assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual} is not within ${tolerance} of ${expected}`);

test('density, temperature, pressure and the speed of sound follow the standard table', () => {
  const air = createAirSample();
  // height m, temperature K, pressure Pa, density kg/m^3, speed of sound m/s
  const table = [
    [0, 288.15, 101325, 1.225, 340.29],
    [2000, 275.15, 79495, 1.0065, 332.53],
    [5000, 255.65, 54020, 0.7361, 320.53],
    [11000, 216.65, 22632, 0.3639, 295.07],
    [15000, 216.65, 12045, 0.1937, 295.07],
    [20000, 216.65, 5475, 0.088, 295.07],
    [24000, 220.65, 2930, 0.0463, 297.78],
    [30000, 226.65, 1172, 0.018, 301.8],
  ];
  for (const [height, temperature, pressure, density, sound] of table) {
    standardAtmosphereAt(height, air);
    near(air.temperature, temperature, 0.1, `temperature at ${height} m`);
    near(air.pressure / pressure, 1, 0.01, `pressure at ${height} m`);
    near(air.density / density, 1, 0.01, `density at ${height} m`);
    near(air.speedOfSound, sound, 0.3, `speed of sound at ${height} m`);
    near(air.densityRatio, air.density / 1.225, 1e-9, 'density ratio');
  }
});

test('the air thins steadily with height and the layers join without a step', () => {
  const air = createAirSample();
  let last = Infinity;
  for (let height = 0; height <= 32000; height += 250) {
    const density = standardAtmosphereAt(height, air).density;
    assert.ok(density < last, `density falls at ${height} m`);
    if (last !== Infinity) assert.ok(last / density < 1.05, `no step at ${height} m`);
    last = density;
  }
  assert.equal(standardAtmosphereAt(90000, air).density, standardAtmosphereAt(32000, createAirSample()).density);
});

test('the skin heats with the square of the Mach number: about 300 C at Mach 3 and 24 km', () => {
  const air = standardAtmosphereAt(24000, createAirSample());
  assert.equal(recoveryTemperature(air.temperature, 0), air.temperature);
  near(recoveryTemperature(air.temperature, 3) - 273.15, 300, 30, 'skin at Mach 3');
  assert.ok(recoveryTemperature(air.temperature, 2) < recoveryTemperature(air.temperature, 3));
});
