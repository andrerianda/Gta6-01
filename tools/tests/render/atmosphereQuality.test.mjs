// Tests of the quality levels (game/src/render/lighting/atmosphereQuality.js) and of the shadow
// cascade table they refer to.
// Run with: node --test "tools/tests/render/*.test.mjs"
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ATMOSPHERE_QUALITY, resolveAtmosphereQuality } from '../../../game/src/render/lighting/atmosphereQuality.js';
import { LOCAL_LIGHT_BUDGETS } from '../../../game/src/render/lighting/localLightBudget.js';

const LEVELS = ['low', 'medium', 'high', 'ultra'];

test('every level defines the same switches', () => {
  const keys = Object.keys(ATMOSPHERE_QUALITY.high).sort();
  for (const level of LEVELS) {
    assert.deepEqual(Object.keys(ATMOSPHERE_QUALITY[level]).sort(), keys, level);
    assert.ok(LOCAL_LIGHT_BUDGETS[ATMOSPHERE_QUALITY[level].localLights], `${level} light budget`);
  }
});

test('levels only add work as they go up', () => {
  const costly = ['ambientOcclusion', 'sunShafts', 'heatHaze', 'motionBlur', 'lensFlare', 'grain'];
  for (let i = 1; i < LEVELS.length; i += 1) {
    const lower = ATMOSPHERE_QUALITY[LEVELS[i - 1]];
    const higher = ATMOSPHERE_QUALITY[LEVELS[i]];
    for (const key of costly) assert.ok(!lower[key] || higher[key], `${key} is lost from ${LEVELS[i - 1]} to ${LEVELS[i]}`);
    assert.ok(higher.bloomLevels >= lower.bloomLevels);
    assert.ok(higher.rainDrops >= lower.rainDrops);
    assert.ok(higher.environmentSize >= lower.environmentSize);
  }
  // The cheapest level still tone maps, grades, blooms and anti-aliases: the look must survive.
  assert.ok(ATMOSPHERE_QUALITY.low.bloom && ATMOSPHERE_QUALITY.low.grade && ATMOSPHERE_QUALITY.low.antialias);
});

test('a request is a level name, or a level with overrides', () => {
  assert.deepEqual(resolveAtmosphereQuality('medium'), { ...ATMOSPHERE_QUALITY.medium });
  assert.deepEqual(resolveAtmosphereQuality('nonsense'), { ...ATMOSPHERE_QUALITY.high });
  assert.deepEqual(resolveAtmosphereQuality(undefined), { ...ATMOSPHERE_QUALITY.high });
  const custom = resolveAtmosphereQuality({ level: 'low', ambientOcclusion: true, unknownSwitch: 1 });
  assert.equal(custom.ambientOcclusion, true);
  assert.equal(custom.shadows, 'low');
  assert.equal('unknownSwitch' in custom, false);
  assert.equal('level' in custom, false);
});

test('resolving into an existing object reuses it', () => {
  const target = resolveAtmosphereQuality('ultra');
  const same = resolveAtmosphereQuality('low', target);
  assert.equal(same, target);
  assert.deepEqual(target, { ...ATMOSPHERE_QUALITY.low });
});
