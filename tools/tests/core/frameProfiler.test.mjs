// The frame profiler: CPU per system from the registry's running totals over the simulated frames,
// draw statistics of each drawn frame, the census at the tier's shadow reach.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFrameProfiler, shadowReachOf, SUN_SHADOW_REACH } from '../../../game/src/core/diagnostics/frameProfiler.js';
import { QUALITY_TIERS } from '../../../game/src/core/quality/qualityTiers.js';

test('frame profiler: per-frame CPU by system, drawn frames, census at the shadow reach', () => {
  const totals = { physics: 10, traffic: 4 };
  let drawn = 0;
  let censusReach = null;
  const profiler = createFrameProfiler({
    systemStatus: () => Object.entries(totals).map(([name, totalMilliseconds]) => ({ name, status: 'ready', totalMilliseconds })),
    advance: (seconds) => {
      const steps = Math.round(seconds * 60);
      totals.physics += steps * 0.5;
      totals.traffic += steps * 0.25;
      return steps;
    },
    drawFrame: () => { drawn += 1; },
    drawStatistics: () => ({ drawCalls: 100 * drawn, triangles: 1000, shadowDrawCalls: 40, shadowTriangles: 400 }),
    census: ({ shadowDistance }) => { censusReach = shadowDistance; return []; },
    quality: () => ({ name: 'high', tier: QUALITY_TIERS.high }),
    now: () => 0,
  });
  const report = profiler.profile({ frames: 60, drawnFrames: 2 });
  assert.equal(report.quality, 'high');
  assert.deepEqual(report.systems.map((entry) => [entry.name, entry.milliseconds]), [['physics', 0.5], ['traffic', 0.25]]);
  assert.equal(report.systemsMillisecondsPerFrame, 0.75);
  assert.deepEqual(report.drawn.map((frame) => frame.drawCalls), [100, 200]);
  assert.equal(report.drawn[0].shadowDrawCalls, 40);
  assert.equal(censusReach, SUN_SHADOW_REACH.medium, "'high' draws the sun's shadows at the 'medium' cascades");
});

test('shadow reach of every tier: none on low, growing with the tier', () => {
  const reaches = ['low', 'medium', 'high', 'ultra', 'cinematic'].map((name) => shadowReachOf(QUALITY_TIERS[name]));
  assert.equal(reaches[0], 0);
  for (let i = 1; i < reaches.length; i += 1) assert.ok(reaches[i] >= reaches[i - 1], `${reaches}`);
  // Casting farther than the cascades reach would cost draws that cast nothing.
  for (const tier of Object.values(QUALITY_TIERS)) {
    assert.ok(tier.shadowCasterDistance <= shadowReachOf(tier), tier.name);
  }
});
