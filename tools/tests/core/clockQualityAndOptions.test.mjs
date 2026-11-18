// The game clock, the quality table and its automatic choice, dynamic resolution, the launch
// options, the logger and the assertion helpers.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_WORLD_SEED, parseClockTime, parseLaunchOptions } from '../../../game/src/core/boot/launchOptions.js';
import { assert as gameAssert, assertFinite, setDevelopmentChecks } from '../../../game/src/core/diagnostics/assertions.js';
import { createLogger } from '../../../game/src/core/diagnostics/logger.js';
import { createDynamicResolution } from '../../../game/src/core/quality/dynamicResolution.js';
import { chooseQualityTierFromBenchmark, resolveQualityTier } from '../../../game/src/core/quality/qualityAutoSelection.js';
import { isQualityTierName, QUALITY_TIER_NAMES, QUALITY_TIERS, qualityTierOf } from '../../../game/src/core/quality/qualityTiers.js';
import { createGameClock, dayPhaseAt } from '../../../game/src/core/time/gameClock.js';
import { ATMOSPHERE_QUALITY } from '../../../game/src/render/lighting/atmosphereQuality.js';

test('the clock: a game day lasts 24 real minutes and every hour is announced once', () => {
  const hours = [];
  const days = [];
  const phases = [];
  const clock = createGameClock({
    startHour: 22,
    onHourChanged: (event) => hours.push(event.hour),
    onDayChanged: (event) => days.push(`${event.day} ${event.weekday}`),
    onDayPhaseChanged: (event) => phases.push(`${event.previous}>${event.phase}`),
  });
  assert.equal(clock.label(), 'Fri 22:00');
  assert.equal(clock.phase, 'night');
  // 60 real seconds are one game hour.
  for (let step = 0; step < 60 * 60; step += 1) clock.advance(1 / 60);
  assert.ok(Math.abs(clock.timeOfDay - 23) < 1e-6, `timeOfDay ${clock.timeOfDay}`);
  assert.deepEqual(hours, [23]);
  // Ten more game hours in ten-second pieces: across midnight and sunrise.
  for (let piece = 0; piece < 60; piece += 1) clock.advance(10);
  assert.ok(Math.abs(clock.timeOfDay - 9) < 1e-6, `timeOfDay ${clock.timeOfDay}`);
  assert.deepEqual(hours, [23, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(days, ['2 Sat']);
  assert.deepEqual(phases, ['night>dawn', 'dawn>day']);
  assert.equal(clock.day, 2);
  assert.equal(clock.timeLabel(), '09:00');
  assert.ok(Math.abs(clock.totalHours - 33) < 1e-6);
});

test('the clock: jumps, skips, freezing and saving', () => {
  const hours = [];
  const clock = createGameClock({ onHourChanged: (event) => hours.push(event.hour) });
  assert.equal(clock.timeOfDay, 15);
  clock.setTimeOfDay(18.8333);
  assert.equal(clock.timeLabel(), '18:49');
  assert.equal(clock.phase, 'dusk');
  clock.setTimeOfDay(-1);
  assert.equal(clock.timeOfDay, 23);
  clock.frozen = true;
  clock.advance(600);
  assert.equal(clock.timeOfDay, 23);
  clock.frozen = false;
  hours.length = 0;
  clock.skipHours(8.5);
  assert.deepEqual(hours, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(clock.timeOfDay, 7.5);
  assert.equal(clock.day, 2);
  const saved = clock.serialise();
  const restored = createGameClock();
  restored.restore(saved);
  assert.deepEqual(restored.serialise(), saved);
  assert.equal(restored.weekday, 'Sat');
  assert.deepEqual([dayPhaseAt(3), dayPhaseAt(6.5), dayPhaseAt(13), dayPhaseAt(19.5), dayPhaseAt(22)],
    ['night', 'dawn', 'day', 'dusk', 'night']);
});

test('the quality table: every tier has every field, and costs rise with the tier', () => {
  assert.deepEqual(QUALITY_TIER_NAMES, ['low', 'medium', 'high', 'ultra', 'cinematic']);
  const fields = Object.keys(QUALITY_TIERS.high).sort();
  for (const name of QUALITY_TIER_NAMES) {
    const tier = QUALITY_TIERS[name];
    assert.ok(Object.isFrozen(tier));
    assert.equal(tier.name, name);
    assert.deepEqual(Object.keys(tier).sort(), fields, name);
    const level = typeof tier.atmosphere === 'string' ? tier.atmosphere : tier.atmosphere.level;
    assert.ok(ATMOSPHERE_QUALITY[level], `${name} maps onto an atmosphere level`);
    assert.ok(tier.streamRadius <= tier.drawDistance, name);
    assert.ok(tier.minRenderScale > 0.4 && tier.minRenderScale <= 1, name);
  }
  for (let i = 1; i < QUALITY_TIER_NAMES.length; i += 1) {
    const cheaper = QUALITY_TIERS[QUALITY_TIER_NAMES[i - 1]];
    const dearer = QUALITY_TIERS[QUALITY_TIER_NAMES[i]];
    for (const field of ['drawDistance', 'streamRadius', 'maxVehicles', 'maxPedestrians', 'maxParticles', 'lodBias']) {
      assert.ok(dearer[field] >= cheaper[field], `${field} of ${dearer.name}`);
    }
  }
  assert.equal(qualityTierOf('nonsense'), QUALITY_TIERS.high);
  assert.ok(isQualityTierName('cinematic') && !isQualityTierName('toString') && !isQualityTierName(3));
});

test('the automatic tier choice', () => {
  assert.equal(chooseQualityTierFromBenchmark({ millisecondsPerPass: 0.4, softwareRenderer: false }), 'ultra');
  assert.equal(chooseQualityTierFromBenchmark({ millisecondsPerPass: 1.8, softwareRenderer: false }), 'high');
  assert.equal(chooseQualityTierFromBenchmark({ millisecondsPerPass: 5, softwareRenderer: false }), 'medium');
  assert.equal(chooseQualityTierFromBenchmark({ millisecondsPerPass: 30, softwareRenderer: false }), 'low');
  assert.equal(chooseQualityTierFromBenchmark({ millisecondsPerPass: 0.2, softwareRenderer: true }), 'low');
  assert.equal(chooseQualityTierFromBenchmark({ millisecondsPerPass: NaN, softwareRenderer: false }), 'medium');
  assert.equal(chooseQualityTierFromBenchmark({ millisecondsPerPass: 0.2, softwareRenderer: false, maxTextureSize: 2048 }), 'low');

  const isTierName = isQualityTierName;
  assert.deepEqual(resolveQualityTier({ requested: 'cinematic', setting: 'low', detected: 'high', isTierName }), { tier: 'cinematic', source: 'query' });
  assert.deepEqual(resolveQualityTier({ requested: 'bogus', setting: 'low', detected: 'high', isTierName }), { tier: 'low', source: 'setting' });
  assert.deepEqual(resolveQualityTier({ setting: 'auto', detected: 'medium', isTierName }), { tier: 'medium', source: 'benchmark' });
  assert.deepEqual(resolveQualityTier({ setting: 'auto', detected: 'ultra', softwareRenderer: true, isTierName }), { tier: 'low', source: 'software' });
  assert.deepEqual(resolveQualityTier({ setting: 'auto', detected: '', isTierName }), { tier: 'high', source: 'default' });
});

test('dynamic resolution drops when frames run long and climbs back carefully', () => {
  const resolution = createDynamicResolution({ minScale: 0.6, windowFrames: 10 });
  const feed = (milliseconds, frames) => {
    const changes = [];
    for (let i = 0; i < frames; i += 1) {
      const changed = resolution.sample(milliseconds);
      if (changed !== null) changes.push(changed);
    }
    return changes;
  };
  assert.deepEqual(feed(16.7, 50), [], 'on time at full scale: nothing to do');
  assert.deepEqual(feed(21, 10), [0.95]);
  assert.deepEqual(feed(30, 10), [0.85], 'far over budget: two steps');
  assert.deepEqual(feed(400, 10), [], 'stalls are ignored');
  for (let i = 0; i < 20; i += 1) feed(40, 10);
  assert.equal(resolution.scale, 0.6, 'never below the minimum');
  assert.deepEqual(feed(16.7, 59), [], 'not yet: six calm windows are needed');
  assert.deepEqual(feed(16.7, 1), [0.65]);
  assert.deepEqual(feed(22, 10), [0.6], 'that was too much: back down');
  assert.deepEqual(feed(16.7, 110), [], 'and more patient next time');
  assert.deepEqual(feed(16.7, 10), [0.65]);
  resolution.enabled = false;
  assert.deepEqual(feed(60, 100), []);
  resolution.reset();
  assert.equal(resolution.scale, 1);
});

test('dynamic resolution decides on the median: a few streaming hitches do not lower the scale', () => {
  const resolution = createDynamicResolution({ windowFrames: 30 });
  const changes = [];
  for (let windowIndex = 0; windowIndex < 4; windowIndex += 1) {
    for (let i = 0; i < 30; i += 1) {
      const changed = resolution.sample(i % 10 === 0 ? 120 : 16.7);
      if (changed !== null) changes.push(changed);
    }
  }
  assert.deepEqual(changes, []);
  assert.equal(resolution.scale, 1);
  assert.ok(resolution.averageMilliseconds > 25, 'the overlay still sees the mean');
  assert.ok(Math.abs(resolution.medianMilliseconds - 16.7) < 1e-9);
});

test('launch options from the query string', () => {
  assert.deepEqual(parseLaunchOptions(''), {
    seed: DEFAULT_WORLD_SEED, shot: null, quality: null, timeOfDay: null, weather: null, autostart: false, debug: false,
  });
  const options = parseLaunchOptions('?shot=beach-chase&seed=42&quality=Cinematic&time=18:50&weather=Rain&debug=1&autostart');
  assert.equal(options.shot, 'beach-chase');
  assert.equal(options.seed, 42);
  assert.equal(options.quality, 'cinematic');
  assert.ok(Math.abs(options.timeOfDay - (18 + 50 / 60)) < 1e-9);
  assert.equal(options.weather, 'rain');
  assert.equal(options.debug, true);
  assert.equal(options.autostart, true);
  assert.equal(parseLaunchOptions('?seed=old-town').seed, 'old-town');
  assert.equal(parseLaunchOptions('?debug=0').debug, false);
  assert.equal(parseLaunchOptions('?time=banana').timeOfDay, null);
  assert.equal(parseClockTime('6.5'), 6.5);
  assert.equal(parseClockTime('24'), 0);
  assert.equal(parseClockTime('25'), null);
});

test('the logger keeps a history and prints only real faults in normal play', () => {
  const printed = [];
  const errors = [];
  const fakeConsole = {
    debug: (...parts) => printed.push(['debug', ...parts]),
    info: (...parts) => printed.push(['info', ...parts]),
    warn: (...parts) => printed.push(['warn', ...parts]),
    error: (...parts) => printed.push(['error', ...parts]),
  };
  const log = createLogger({ console: fakeConsole, historySize: 3, onError: (entry) => errors.push(entry.message) });
  const traffic = log.child('traffic');
  traffic.info('spawned 12 cars');
  traffic.warn('no lane near', { x: 1 });
  assert.deepEqual(printed, []);
  traffic.error('lane graph is empty', 404);
  assert.deepEqual(printed, [['error', '[traffic] lane graph is empty', 404]]);
  assert.deepEqual(errors, ['lane graph is empty']);
  log.info('root message');
  assert.deepEqual(log.history().map((entry) => `${entry.scope}:${entry.level}`), ['traffic:warn', 'traffic:error', ':info']);
  assert.deepEqual(log.history('error').map((entry) => entry.message), ['lane graph is empty']);
  assert.deepEqual(log.counts(), { debug: 0, info: 2, warn: 1, error: 1 });
  log.setConsoleLevel('debug');
  traffic.child('lanes').debug('detail');
  assert.deepEqual(printed[1], ['debug', '[traffic.lanes] detail']);
});

test('assertions vanish unless development checks are on', () => {
  setDevelopmentChecks(false);
  gameAssert(false, 'ignored');
  assertFinite(NaN, 'speed');
  setDevelopmentChecks(true);
  assert.throws(() => gameAssert(false, () => 'lane missing'), /assertion failed: lane missing/);
  assert.throws(() => assertFinite(NaN, 'speed'), /speed is NaN/);
  gameAssert(true, () => { throw new Error('the message is not built when the check passes'); });
  setDevelopmentChecks(false);
});
