// Tests of the sun and moon positions (game/src/render/sky/celestialPositions.js).
// Run with: node --test "tools/tests/render/*.test.mjs"
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CELESTIAL_SETTING,
  compassAzimuthOf,
  computeMoonDirection,
  computeMoonLightDirection,
  computeSunDirection,
  moonElevationAt,
  sunElevationAt,
  sunriseAndSunsetHours,
} from '../../../game/src/render/sky/celestialPositions.js';

const DEGREES = Math.PI / 180;
const vector = () => ({ x: 0, y: 0, z: 0 });
const lengthOf = (v) => Math.hypot(v.x, v.y, v.z);

test('sun direction is a unit vector at every hour', () => {
  for (let hour = 0; hour <= 24; hour += 0.25) {
    assert.ok(Math.abs(lengthOf(computeSunDirection(hour, vector())) - 1) < 1e-9, `hour ${hour}`);
  }
});

test('the sun is highest at solar noon and stands to the south', () => {
  const noon = CELESTIAL_SETTING.solarNoonHour;
  const elevation = sunElevationAt(noon);
  assert.ok(Math.abs(elevation - 79.2 * DEGREES) < 0.01, `noon elevation ${elevation / DEGREES}`);
  assert.ok(elevation > sunElevationAt(noon - 0.5) && elevation > sunElevationAt(noon + 0.5));
  const direction = computeSunDirection(noon, vector());
  assert.ok(direction.z > 0, 'south is +Z');
  assert.ok(Math.abs(direction.x) < 1e-9, 'on the meridian');
});

test('sunrise is in the east near 06:30 and sunset in the west near 19:30', () => {
  const { sunrise, sunset } = sunriseAndSunsetHours();
  assert.ok(Math.abs(sunrise - 6.5) < 0.05, `sunrise ${sunrise}`);
  assert.ok(Math.abs(sunset - 19.5) < 0.05, `sunset ${sunset}`);
  assert.ok(Math.abs(sunElevationAt(sunrise)) < 1e-6);
  assert.ok(Math.abs(sunElevationAt(sunset)) < 1e-6);
  assert.ok(computeSunDirection(sunrise, vector()).x > 0.9, 'rises toward +X (east)');
  assert.ok(computeSunDirection(sunset, vector()).x < -0.9, 'sets toward -X (west)');
  // In summer the sun sets north of due west: -Z is north.
  assert.ok(computeSunDirection(sunset, vector()).z < 0);
});

test('the sun is below the horizon at night and the hours wrap around', () => {
  assert.ok(sunElevationAt(0) < -30 * DEGREES);
  assert.ok(sunElevationAt(3) < 0);
  assert.ok(sunElevationAt(22) < 0);
  const a = computeSunDirection(1, vector());
  const b = computeSunDirection(25, vector());
  const c = computeSunDirection(-23, vector());
  for (const axis of ['x', 'y', 'z']) {
    assert.ok(Math.abs(a[axis] - b[axis]) < 1e-9);
    assert.ok(Math.abs(a[axis] - c[axis]) < 1e-9);
  }
});

test('golden hour (18:50) has a low sun a little north of west', () => {
  const elevation = sunElevationAt(18.85);
  assert.ok(elevation > 5 * DEGREES && elevation < 12 * DEGREES, `elevation ${elevation / DEGREES}`);
  const azimuth = compassAzimuthOf(computeSunDirection(18.85, vector())) / DEGREES;
  assert.ok(azimuth > 280 && azimuth < 292, `azimuth ${azimuth}`);
});

test('compass azimuth: north 0, east 90, south 180, west 270', () => {
  assert.ok(Math.abs(compassAzimuthOf({ x: 0, z: -1 }) / DEGREES - 0) < 1e-9);
  assert.ok(Math.abs(compassAzimuthOf({ x: 1, z: 0 }) / DEGREES - 90) < 1e-9);
  assert.ok(Math.abs(compassAzimuthOf({ x: 0, z: 1 }) / DEGREES - 180) < 1e-9);
  assert.ok(Math.abs(compassAzimuthOf({ x: -1, z: 0 }) / DEGREES - 270) < 1e-9);
});

test('the moon is up through the night and its light never comes from below 28 degrees', () => {
  for (let hour = 20.5; hour <= 28.5; hour += 0.5) {
    assert.ok(moonElevationAt(hour % 24) > 0, `moon up at ${hour % 24}`);
  }
  for (let hour = 0; hour < 24; hour += 0.5) {
    const moon = computeMoonDirection(hour, vector());
    assert.ok(Math.abs(lengthOf(moon) - 1) < 1e-9);
    const light = computeMoonLightDirection(hour, vector());
    assert.ok(Math.abs(lengthOf(light) - 1) < 1e-9, `unit at ${hour}`);
    assert.ok(light.y >= Math.sin(CELESTIAL_SETTING.moonLightMinElevation) - 1e-9, `lifted at ${hour}`);
  }
});
