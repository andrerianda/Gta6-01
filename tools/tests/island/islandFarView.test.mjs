// How the Norvast island shows from far away (game/src/world/island/islandFarView.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FAR_VIEW, farViewBlend, farViewContrast, farViewNearness, farViewOpticalDepth,
} from '../../../game/src/world/island/islandFarView.js';
import { hazeOpticalDepth } from '../../../game/src/render/sea/seaHorizonMaths.js';
import { SEA_AND_AIRSPACE_CHART } from '../../../game/src/catalog/seaAndAirspaceChart.js';

// The hours of the story and of the checks: [density per metre, haze scale height in metres].
const DAWN = [0.0008, 170];
const NOON = [0.0004, 260];
const NIGHT = [0.00056, 260];
const HEIGHTS = [2, 60, 150, 400, 900, 3000];

test('the frame haze alone loses the island at dawn (the diagnosed cause)', () => {
  const left = (d) => Math.exp(-hazeOpticalDepth(d, 400, 0, ...DAWN));
  assert.ok(left(8000) < 0.05, `8 km keeps ${left(8000)}`);
  assert.ok(left(10000) < 0.02);
});

test('at dawn the island is a faint dark shape from 8 km and beyond', () => {
  for (const height of [150, 400, 900]) {
    const at8 = farViewContrast(8000, height, ...DAWN);
    const at10 = farViewContrast(10000, height, ...DAWN);
    assert.ok(at8 > 0.06, `8 km from ${height} m: ${at8}`);
    assert.ok(at8 < 0.25, `faint, not a cut-out: ${at8}`);
    assert.ok(at10 > 0.04, `10 km from ${height} m: ${at10}`);
  }
});

test('the contrast grows steadily as the distance falls, at every hour and height', () => {
  for (const hour of [DAWN, NOON, NIGHT]) {
    for (const height of HEIGHTS) {
      let before = 0;
      for (let d = 14000; d >= 200; d -= 100) {
        const now = farViewContrast(d, height, ...hour);
        assert.ok(now >= before, `falls at ${d} m from ${height} m`);
        before = now;
      }
    }
  }
});

test('the hand-over to the real terrain has no step', () => {
  const near = FAR_VIEW.nearDistance;
  for (const hour of [DAWN, NOON, NIGHT]) {
    for (const height of HEIGHTS) {
      // Inside the near distance: the frame's own haze, the stand-in at the island itself and unseen.
      for (const d of [0, 500, near - 1, near]) {
        assert.equal(farViewOpticalDepth(d, height, ...hour), hazeOpticalDepth(d, height, 0, ...hour));
        assert.equal(farViewNearness(d, height, ...hour), 1);
        assert.equal(farViewBlend(d), 0);
      }
      // Just outside: everything within a hair of that.
      const step = farViewOpticalDepth(near + 1, height, ...hour) - farViewOpticalDepth(near, height, ...hour);
      assert.ok(step >= 0 && step < 0.002);
      assert.ok(farViewNearness(near + 1, height, ...hour) > 0.999);
      assert.ok(farViewBlend(near + 20) < 0.001);
      // Small moves give small changes all the way out.
      for (let d = near; d < 14000; d += 50) {
        const k0 = farViewNearness(d, height, ...hour), k1 = farViewNearness(d + 50, height, ...hour);
        assert.ok(Math.abs(k1 * (d + 50) - k0 * d) < 60, `the stand-in jumps at ${d} m`);
      }
    }
  }
});

test('the stand-in is opaque before the zone can load and gets the depth it was solved for', () => {
  assert.ok(FAR_VIEW.fullDistance < SEA_AND_AIRSPACE_CHART.norvastIsland.streamRadius - 300);
  assert.equal(farViewBlend(FAR_VIEW.fullDistance), 1);
  assert.equal(farViewBlend(9000), 1);
  for (const hour of [DAWN, NOON, NIGHT]) {
    for (const height of HEIGHTS) {
      for (const d of [3000, 5200, 8000, 10000, 14000]) {
        const k = farViewNearness(d, height, ...hour);
        assert.ok(k > 0 && k <= 1);
        const y = FAR_VIEW.referenceHeight;
        const got = hazeOpticalDepth(k * d, height, height + (y - height) * k, ...hour);
        const whole = hazeOpticalDepth(d, height, y, ...hour);
        const wanted = farViewOpticalDepth(d, height, ...hour) * (whole / hazeOpticalDepth(d, height, 0, ...hour));
        assert.ok(Math.abs(got - wanted) < 1e-3 * Math.max(1, wanted), `${d} m from ${height} m: ${got} for ${wanted}`);
      }
    }
  }
});

test('it is always darker than the haze, never brighter, and never a black cut-out', () => {
  assert.ok(FAR_VIEW.shade > 0.2 && FAR_VIEW.shade < 1);
  for (const hour of [DAWN, NOON, NIGHT]) {
    for (const d of [2600, 5000, 8000, 14000]) {
      const c = farViewContrast(d, 400, ...hour);
      assert.ok(c > 0 && c < 1 - FAR_VIEW.shade + 1e-9);
    }
  }
});
