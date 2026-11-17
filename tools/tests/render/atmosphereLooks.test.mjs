// Tests of the hand-tuned looks and their interpolation (game/src/render/sky/atmosphereLooks.js).
// Run with: node --test "tools/tests/render/*.test.mjs"
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  blendAtmosphereLooks,
  createAtmosphereLook,
  LOOK_COLOR_FIELDS,
  LOOK_KEYFRAMES,
  LOOK_SCALAR_FIELDS,
  nearestLookName,
  sampleAtmosphereLook,
} from '../../../game/src/render/sky/atmosphereLooks.js';
import { sunElevationAt } from '../../../game/src/render/sky/celestialPositions.js';

const DEGREES = Math.PI / 180;

test('keyframes are in clock order and complete', () => {
  for (let i = 1; i < LOOK_KEYFRAMES.length; i += 1) {
    assert.ok(LOOK_KEYFRAMES[i].hour > LOOK_KEYFRAMES[i - 1].hour, `keyframe ${i} out of order`);
  }
  for (const { name, look } of LOOK_KEYFRAMES) {
    for (const field of LOOK_SCALAR_FIELDS) {
      assert.equal(typeof look[field], 'number', `${name}.${field}`);
      assert.ok(Number.isFinite(look[field]), `${name}.${field}`);
    }
    for (const field of LOOK_COLOR_FIELDS) {
      assert.equal(look[field].length, 3, `${name}.${field}`);
      for (const channel of look[field]) assert.ok(Number.isFinite(channel) && channel >= 0, `${name}.${field}`);
    }
  }
});

test('sampling at a keyframe returns that keyframe', () => {
  const look = createAtmosphereLook();
  for (const keyframe of LOOK_KEYFRAMES) {
    sampleAtmosphereLook(keyframe.hour, look);
    for (const field of LOOK_SCALAR_FIELDS) {
      assert.ok(Math.abs(look[field] - keyframe.look[field]) < 1e-9, `${keyframe.name}.${field}`);
    }
    for (const field of LOOK_COLOR_FIELDS) {
      for (let i = 0; i < 3; i += 1) {
        assert.ok(Math.abs(look[field][i] - keyframe.look[field][i]) < 1e-9, `${keyframe.name}.${field}`);
      }
    }
  }
});

test('interpolation is continuous through the day and across midnight', () => {
  const previous = createAtmosphereLook();
  const current = createAtmosphereLook();
  const step = 1 / 120;
  sampleAtmosphereLook(-step, previous);
  for (let hour = 0; hour <= 24 + step; hour += step) {
    sampleAtmosphereLook(hour, current);
    // Half a minute of game time never changes a value by more than a few percent of its range.
    assert.ok(Math.abs(current.exposure - previous.exposure) < 0.08, `exposure jumps at ${hour}`);
    assert.ok(Math.abs(current.sunIntensity - previous.sunIntensity) < 0.12, `sun jumps at ${hour}`);
    for (let i = 0; i < 3; i += 1) {
      assert.ok(Math.abs(current.horizonSunColor[i] - previous.horizonSunColor[i]) < 0.06, `horizon jumps at ${hour}`);
    }
    blendAtmosphereLooks(current, current, 0, previous);
  }
});

test('values between two keyframes stay between them', () => {
  const look = createAtmosphereLook();
  for (let i = 0; i < LOOK_KEYFRAMES.length; i += 1) {
    const a = LOOK_KEYFRAMES[i];
    const b = LOOK_KEYFRAMES[(i + 1) % LOOK_KEYFRAMES.length];
    const span = (b.hour - a.hour + 24) % 24 || 24;
    for (const fraction of [0.2, 0.5, 0.8]) {
      sampleAtmosphereLook(a.hour + span * fraction, look);
      for (const field of LOOK_SCALAR_FIELDS) {
        const low = Math.min(a.look[field], b.look[field]) - 1e-9;
        const high = Math.max(a.look[field], b.look[field]) + 1e-9;
        assert.ok(look[field] >= low && look[field] <= high, `${a.name}->${b.name} ${field}`);
      }
    }
  }
});

test('the looks agree with where the sun is', () => {
  const look = createAtmosphereLook();
  // No sunlight while the sun is well below the horizon, no moonlight while it is well above.
  for (let hour = 0; hour < 24; hour += 0.25) {
    sampleAtmosphereLook(hour, look);
    const elevation = sunElevationAt(hour) / DEGREES;
    if (elevation < -5) assert.equal(look.sunIntensity, 0, `sunlight at ${hour} (elevation ${elevation})`);
    if (elevation > 12) assert.equal(look.moonIntensity, 0, `moonlight at ${hour}`);
    if (elevation > 12) assert.ok(look.stars < 0.01, `stars at ${hour}`);
    // Astronomical night: the sun more than 19 degrees down.
    if (elevation < -19.5) assert.ok(look.stars > 0.9, `no stars at ${hour}`);
  }
  // The named keyframes sit where their names say.
  const hourOf = (name) => LOOK_KEYFRAMES.find((keyframe) => keyframe.name === name).hour;
  const golden = sunElevationAt(hourOf('golden hour')) / DEGREES;
  assert.ok(golden > 5 && golden < 12, `golden hour elevation ${golden}`);
  assert.ok(sunElevationAt(hourOf('noon')) / DEGREES > 75);
  assert.ok(Math.abs(sunElevationAt(hourOf('sunset')) / DEGREES) < 1.5);
  const dusk = sunElevationAt(hourOf('dusk')) / DEGREES;
  assert.ok(dusk < -2 && dusk > -8, `dusk elevation ${dusk}`);
  assert.ok(sunElevationAt(hourOf('blue hour')) / DEGREES < -7);
});

test('golden hour is warm on the sun side and cool in the fill; night is dark and exposed up', () => {
  const golden = sampleAtmosphereLook(18.85, createAtmosphereLook());
  assert.ok(golden.sunColor[0] > golden.sunColor[1] && golden.sunColor[1] > golden.sunColor[2], 'warm key');
  assert.ok(golden.ambientSky[2] > golden.ambientSky[0], 'cool fill');
  assert.ok(golden.horizonSunColor[0] > golden.horizonSunColor[2] * 3, 'glowing horizon');
  const noon = sampleAtmosphereLook(13, createAtmosphereLook());
  const night = sampleAtmosphereLook(1, createAtmosphereLook());
  assert.ok(night.exposure > noon.exposure * 3);
  assert.ok(night.skyIntensity < noon.skyIntensity * 0.1);
  assert.ok(noon.heatHaze > 0.9 && night.heatHaze === 0);
});

test('nearestLookName names the hours', () => {
  assert.equal(nearestLookName(13), 'noon');
  assert.equal(nearestLookName(18.9), 'golden hour');
  assert.equal(nearestLookName(2), 'night');
  assert.equal(nearestLookName(23.9), 'night');
  assert.equal(nearestLookName(6.5), 'dawn');
});
