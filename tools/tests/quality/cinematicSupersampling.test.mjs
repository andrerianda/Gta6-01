// The cinematic tier supersamples: a 2x drawing buffer even on a ratio-1 screen, clamped to the
// GPU's largest buffer side, while every play tier keeps its pixel ratio and the image pipeline
// sees no supersampling outside 'cinematic'.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  QUALITY_TIERS, pixelRatioFor, pixelRatioWithinLimit, supersampleFactorOf,
} from '../../../game/src/core/quality/qualityTiers.js';

const ratioOf = (name, device) => pixelRatioFor(device, QUALITY_TIERS[name].pixelRatioCap, QUALITY_TIERS[name].pixelRatioFloor);

test('cinematic renders at pixel ratio 2 on a ratio-1 screen, without dynamic resolution', () => {
  const tier = QUALITY_TIERS.cinematic;
  assert.equal(tier.pixelRatioFloor, 2);
  assert.equal(tier.dynamicResolution, false);
  assert.equal(tier.minRenderScale, 1);
  assert.equal(ratioOf('cinematic', 1), 2);
  assert.equal(supersampleFactorOf(ratioOf('cinematic', 1), 1), 2);
});

test('play tiers keep their ratio and see no supersampling', () => {
  for (const name of ['low', 'medium', 'high', 'ultra']) {
    assert.equal(ratioOf(name, 1), 1, name);
    assert.equal(supersampleFactorOf(ratioOf(name, 1), 1), 1, name);
    assert.equal(supersampleFactorOf(ratioOf(name, 2), 2), 1, `${name} on a ratio-2 screen`);
  }
  assert.equal(ratioOf('high', 2), 1.5);
  assert.equal(ratioOf('ultra', 2), 2);
});

test('the pixel ratio is clamped to the GPU buffer limit, never below 1', () => {
  assert.equal(pixelRatioWithinLimit(2, 1280, 800, 8192), 2);
  assert.equal(pixelRatioWithinLimit(2, 3840, 2160, 4096), 4096 / 3840);
  assert.equal(pixelRatioWithinLimit(2, 5000, 3000, 4096), 1);
  assert.equal(pixelRatioWithinLimit(2, 1280, 800, 0), 2);
});
