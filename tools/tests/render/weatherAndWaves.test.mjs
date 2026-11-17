// Tests of the pure weather and water models: weather states and transitions, wetness, lightning
// and thunder timing, wind, and the wave height function the boat physics uses.
// Run with: node --test "tools/tests/render/*.test.mjs"
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createWaveSet,
  packWaveUniforms,
  sampleWaveHeight,
  sampleWaveSurface,
  WAVE_COUNT,
} from '../../../game/src/render/water/waveModel.js';
import { createLightningModel } from '../../../game/src/render/weather/lightningModel.js';
import {
  createWeatherModel,
  WEATHER_FIELDS,
  WEATHER_STATES,
  weatherStateNames,
} from '../../../game/src/render/weather/weatherModel.js';
import { wetLookOf } from '../../../game/src/render/weather/wetSurface.js';
import { createWindModel } from '../../../game/src/render/weather/windModel.js';

test('the five weather states exist and are complete', () => {
  assert.deepEqual(weatherStateNames(), ['clear', 'hazy', 'overcast', 'rain', 'storm']);
  for (const name of weatherStateNames()) {
    for (const field of WEATHER_FIELDS) assert.ok(Number.isFinite(WEATHER_STATES[name][field]), `${name}.${field}`);
  }
  assert.throws(() => createWeatherModel('blizzard'));
});

test('a weather change blends monotonically over its duration', () => {
  const weather = createWeatherModel('clear');
  weather.setWeather('storm', 10);
  let previous = weather.current.rain;
  for (let i = 0; i < 102; i += 1) {
    weather.update(0.1);
    assert.ok(weather.current.rain >= previous - 1e-12, 'rain never decreases on the way to a storm');
    previous = weather.current.rain;
  }
  assert.equal(weather.transition, 1);
  for (const field of WEATHER_FIELDS) {
    assert.ok(Math.abs(weather.current[field] - WEATHER_STATES.storm[field]) < 1e-9, field);
  }
  // A change in the middle of a change starts from where the values are.
  weather.setWeather('clear', 10);
  for (let i = 0; i < 50; i += 1) weather.update(0.1);
  const middle = weather.current.cloudCover;
  weather.setWeather('overcast', 4);
  assert.ok(Math.abs(weather.current.cloudCover - middle) < 1e-12);
  weather.setWeather('rain', 0);
  assert.equal(weather.current.rain, WEATHER_STATES.rain.rain);
});

test('rain soaks the ground quickly, puddles follow, and both dry slowly', () => {
  const weather = createWeatherModel('clear');
  assert.equal(weather.wetness, 0);
  weather.setWeather('rain', 0);
  let seconds = 0;
  while (weather.wetness < 1 && seconds < 300) {
    weather.update(0.5);
    seconds += 0.5;
  }
  assert.ok(seconds > 5 && seconds < 60, `soaked after ${seconds} s`);
  assert.ok(weather.puddles < 1, 'puddles lag behind');
  for (let i = 0; i < 400; i += 1) weather.update(0.5);
  assert.ok(weather.puddles > 0.95);

  weather.setWeather('clear', 0);
  weather.update(30);
  assert.ok(weather.wetness < 1 && weather.wetness > 0.5, 'drying takes minutes');
  assert.ok(weather.puddles > weather.wetness - 0.3, 'puddles outlast the film');
  for (let i = 0; i < 100; i += 1) weather.update(10);
  assert.equal(weather.wetness, 0);
  assert.equal(weather.puddles, 0);
});

test('thunder follows its lightning by the distance over the speed of sound', () => {
  const heard = [];
  const lightning = createLightningModel({ onThunder: (strike) => heard.push({ ...strike }) });
  lightning.trigger(1715, 1.0);
  lightning.update(0.01, 0);
  assert.ok(lightning.flash > 0.3, 'the flash is immediate');
  let seconds = 0.01;
  while (heard.length === 0 && seconds < 20) {
    lightning.update(0.05, 0);
    seconds += 0.05;
  }
  assert.equal(heard.length, 1);
  assert.ok(Math.abs(seconds - 1715 / 343) < 0.11, `thunder after ${seconds} s`);
  assert.equal(heard[0].distance, 1715);
  assert.equal(heard[0].azimuth, 1.0);
  assert.equal(lightning.flash, 0, 'the flash is long over');
});

test('lightning strikes about as often as the storm asks for', () => {
  let strikes = 0;
  const lightning = createLightningModel({ onThunder: () => (strikes += 1) });
  for (let i = 0; i < 60 * 600; i += 1) lightning.update(1 / 60, 0.1);
  assert.ok(strikes > 30 && strikes < 90, `${strikes} strikes in 10 minutes at 0.1 per second`);
  const quiet = createLightningModel();
  for (let i = 0; i < 6000; i += 1) quiet.update(1 / 60, 0);
  assert.equal(quiet.flash, 0);
});

test('the wind blows at about the asked speed and gusts stay in range', () => {
  const wind = createWindModel();
  let total = 0;
  let steps = 0;
  for (let t = 0; t < 600; t += 0.1) {
    wind.update(0.1, 8);
    assert.ok(wind.gust >= 0 && wind.gust <= 1);
    assert.ok(Math.abs(Math.hypot(wind.x, wind.z) - wind.speed) < 1e-9);
    total += wind.speed;
    steps += 1;
  }
  const mean = total / steps;
  assert.ok(mean > 6 && mean < 10, `mean speed ${mean}`);
});

test('wave heights stay within the sum of amplitudes and scale with the sea state', () => {
  const waves = createWaveSet('sea');
  let limit = 0;
  for (let i = 0; i < WAVE_COUNT; i += 1) limit += waves.amplitude[i];
  let highest = 0;
  for (let i = 0; i < 2000; i += 1) {
    const x = (i * 37.7) % 900;
    const z = (i * 91.3) % 700;
    const h = sampleWaveHeight(waves, x, z, i * 0.13, 1);
    assert.ok(Math.abs(h) <= limit + 1e-6);
    highest = Math.max(highest, Math.abs(h));
    const doubled = sampleWaveHeight(waves, x, z, i * 0.13, 0);
    assert.equal(doubled, 0, 'a flat sea at scale 0');
  }
  assert.ok(highest > limit * 0.5, 'the sea actually moves');
  assert.ok(limit > 0.6 && limit < 1.4, `sea amplitude ${limit}`);
});

test('the wave field is continuous in space and time and calmer bodies are calmer', () => {
  const sea = createWaveSet('sea');
  const here = sampleWaveHeight(sea, 120, -40, 10, 1);
  assert.ok(Math.abs(sampleWaveHeight(sea, 120.01, -40, 10, 1) - here) < 0.01);
  assert.ok(Math.abs(sampleWaveHeight(sea, 120, -40, 10.01, 1) - here) < 0.02);
  const sumOf = (kind) => createWaveSet(kind).amplitude.reduce((sum, a) => sum + a, 0);
  assert.ok(sumOf('sea') > sumOf('marina') && sumOf('marina') > sumOf('river') && sumOf('river') > sumOf('pool'));
  assert.throws(() => createWaveSet('lava'));
});

test('the surface normal matches the slope of the height field', () => {
  const waves = createWaveSet('marina');
  const out = { height: 0, normalX: 0, normalY: 0, normalZ: 0 };
  sampleWaveSurface(waves, 30, 12, 4, 1, out);
  assert.ok(Math.abs(Math.hypot(out.normalX, out.normalY, out.normalZ) - 1) < 1e-9);
  assert.ok(out.normalY > 0.9, 'gentle water points up');
  assert.ok(Math.abs(out.height - sampleWaveHeight(waves, 30, 12, 4, 1)) < 1e-12);
});

test('the shader receives exactly the numbers of the wave set', () => {
  const waves = createWaveSet('sea', 0.5);
  const a = new Float32Array(WAVE_COUNT * 4);
  const b = new Float32Array(WAVE_COUNT * 4);
  packWaveUniforms(waves, a, b);
  for (let i = 0; i < WAVE_COUNT; i += 1) {
    assert.equal(a[i * 4], waves.directionX[i]);
    assert.equal(a[i * 4 + 1], waves.directionZ[i]);
    assert.equal(a[i * 4 + 2], waves.wavenumber[i]);
    assert.equal(a[i * 4 + 3], waves.amplitude[i]);
    assert.equal(b[i * 4], waves.frequency[i]);
    assert.equal(b[i * 4 + 1], waves.steepness[i]);
    assert.ok(Math.abs(Math.hypot(a[i * 4], a[i * 4 + 1]) - 1) < 1e-6, 'unit direction');
  }
});

test('wet surfaces are darker and glossier', () => {
  const dry = wetLookOf(0, 0.9);
  const wet = wetLookOf(1, 0.9);
  assert.equal(dry.albedoScale, 1);
  assert.equal(dry.roughness, 0.9);
  assert.ok(wet.albedoScale < 0.7 && wet.roughness < 0.4);
  assert.equal(wetLookOf(1, 0.9, 0).albedoScale, 1, 'a non-porous surface does not darken');
});
