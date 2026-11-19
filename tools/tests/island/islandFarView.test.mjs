// How the Norvast island shows from far away (game/src/world/island/islandFarView.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FAR_VIEW, farViewBlend, farViewContrast, farViewLens, farViewNearness, farViewOpticalDepth,
} from '../../../game/src/world/island/islandFarView.js';
import { hazeOpticalDepth } from '../../../game/src/render/sea/seaHorizonMaths.js';
import { SEA_AND_AIRSPACE_CHART } from '../../../game/src/catalog/seaAndAirspaceChart.js';

// The hours of the story and of the checks: [density per metre, haze scale height in metres].
const DAWN = [0.0008, 170];
const NOON = [0.0004, 260];
const NIGHT = [0.00056, 260];
const HEIGHTS = [2, 60, 150, 400, 900, 3000];
/** The share of a scene contrast the tone curve leaves on the screen in the bright dawn haze (measured: 0.35 to 0.43). */
const ON_SCREEN = 0.4;

test('the frame haze alone loses the island at dawn (the diagnosed cause)', () => {
  const left = (d) => Math.exp(-hazeOpticalDepth(d, 400, 0, ...DAWN));
  assert.ok(left(8000) < 0.07, `8 km keeps ${left(8000)}`);
  assert.ok(left(10000) < 0.04);
  // Even two kilometres out the real island keeps half of its contrast from 400 m and under a third from 150 m.
  assert.ok(left(2000) < 0.55 && Math.exp(-hazeOpticalDepth(2000, 150, 0, ...DAWN)) < 0.32);
});

test('at dawn the island is a faint dark shape from 8 km and beyond', () => {
  for (const height of [300, 400, 600, 900]) {
    const at8 = farViewContrast(8000, height, ...DAWN);
    const at10 = farViewContrast(10000, height, ...DAWN);
    // On the screen: at least a tenth darker than the haze at 8 km, and not yet a cut-out.
    assert.ok(at8 * ON_SCREEN > 0.1, `8 km from ${height} m: ${at8}`);
    assert.ok(at8 < 0.55, `faint, not a cut-out: ${at8}`);
    assert.ok(at10 * ON_SCREEN > 0.075, `10 km from ${height} m: ${at10}`);
  }
});

test('the dot grows: on the approach of the final mission the island darkens out of the haze and stays dark down to the landing', () => {
  // The mission starts six kilometres out and is at 300 m three kilometres out. Level, the contrast
  // rises all the way in (the next test); on the descent the aircraft sinks into the thick of the
  // haze layer, which holds the contrast level over the last kilometres while the island fills the view.
  const approach = [[10000, 600], [8000, 600], [6000, 550], [4000, 400], [3000, 300], [2000, 190], [1000, 100]];
  let before = 0;
  let best = 0;
  for (const [distance, height] of approach) {
    const now = farViewContrast(distance, height, ...DAWN);
    if (distance >= 4000) assert.ok(now > before, `no darker at ${distance} m (${now} after ${before})`);
    else assert.ok(now > best * 0.94, `fades again at ${distance} m (${now} after ${best})`);
    before = now;
    best = Math.max(best, now);
  }
  assert.ok(farViewContrast(6000, 550, ...DAWN) * ON_SCREEN > 0.14);
  assert.ok(farViewContrast(2000, 190, ...DAWN) * ON_SCREEN > 0.17);
  // The clearer air is worth at least twice the contrast the frame's haze left, from 2 km outward.
  for (const [distance, height] of [[8000, 400], [6000, 400], [4000, 400], [2000, 150]]) {
    const frame = (1 - FAR_VIEW.shade) * Math.exp(-hazeOpticalDepth(distance, height, 0, ...DAWN));
    assert.ok(farViewContrast(distance, height, ...DAWN) > frame * (distance > 2000 ? 2 : 1.5), `${distance} m from ${height} m`);
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
      // Inside the near distance: the frame's own haze, no lens, the stand-in at the island itself and unseen.
      for (const d of [0, 300, near - 1, near]) {
        assert.equal(farViewOpticalDepth(d, height, ...hour), hazeOpticalDepth(d, height, 0, ...hour));
        assert.equal(farViewNearness(d, height, ...hour), 1);
        assert.equal(farViewBlend(d), 0);
        assert.equal(farViewLens(d), false);
      }
      // Just outside: everything within a hair of that.
      const step = farViewOpticalDepth(near + 1, height, ...hour) - farViewOpticalDepth(near, height, ...hour);
      assert.ok(step >= 0 && step < 0.002);
      assert.ok(farViewNearness(near + 1, height, ...hour) > 0.998);
      assert.equal(farViewLens(near + 1), true);
      // Small moves give small changes all the way out.
      for (let d = near; d < 14000; d += 50) {
        const k0 = farViewNearness(d, height, ...hour), k1 = farViewNearness(d + 50, height, ...hour);
        assert.ok(Math.abs(k1 * (d + 50) - k0 * d) < 60, `the stand-in jumps at ${d} m`);
      }
    }
  }
});

test('the stand-in only writes depth over the near island and carries no colour there', () => {
  // The lens (depth without colour) from the near distance to where the colour starts, then the colour fades in.
  assert.ok(FAR_VIEW.nearDistance < FAR_VIEW.colourNear && FAR_VIEW.colourNear < FAR_VIEW.colourFull);
  for (const d of [FAR_VIEW.nearDistance + 1, 1500, FAR_VIEW.colourNear]) {
    assert.equal(farViewLens(d), true);
    assert.equal(farViewBlend(d), 0);
  }
  assert.ok(farViewBlend(FAR_VIEW.colourNear + 20) < 0.001);
  let before = 0;
  for (let d = FAR_VIEW.colourNear; d <= FAR_VIEW.colourFull; d += 100) {
    assert.ok(farViewBlend(d) >= before);
    before = farViewBlend(d);
  }
  // The landing sees the strip through the lens: at 3 km and 300 m twice as much of it is left.
  const real = Math.exp(-hazeOpticalDepth(3000, 300, 0, ...DAWN));
  const lens = Math.exp(-farViewOpticalDepth(3000, 300, ...DAWN));
  assert.ok(lens > real * 1.8 && lens < 0.8, `${lens} through the lens for ${real}`);
});

test('the stand-in is opaque before the zone can load and gets the depth it was solved for', () => {
  assert.ok(FAR_VIEW.fullDistance < SEA_AND_AIRSPACE_CHART.norvastIsland.streamRadius - 300);
  assert.equal(FAR_VIEW.fullDistance, FAR_VIEW.colourFull);
  assert.equal(farViewBlend(FAR_VIEW.fullDistance), 1);
  assert.equal(farViewBlend(9000), 1);
  for (const hour of [DAWN, NOON, NIGHT]) {
    for (const height of HEIGHTS) {
      for (const d of [800, 1500, 3000, 5200, 8000, 10000, 14000]) {
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

test('the lens stays clear of the haze pass\'s sea-plane snap (a far point within 8 % of the sea range)', () => {
  // Beyond 4 km of range the haze pass takes a point within 8 % of the sea plane's range to lie on
  // the sea: the pulled stand-in must be well nearer than that, or the island's foot would lose the lens.
  for (const hour of [DAWN, NOON, NIGHT]) {
    for (const height of [60, 150, 400, 900, 3000]) {
      for (let d = 4000; d <= 14000; d += 500) {
        const k = farViewNearness(d, height, ...hour);
        assert.ok(k * d < 4000 || k < 0.9, `${d} m from ${height} m: nearness ${k}`);
      }
    }
  }
});

test('it is always darker than the haze, never brighter, and never a black cut-out', () => {
  assert.ok(FAR_VIEW.shade >= 0.15 && FAR_VIEW.shade < 1);
  for (const hour of [DAWN, NOON, NIGHT]) {
    for (const d of [2600, 5000, 8000, 14000]) {
      const c = farViewContrast(d, 400, ...hour);
      assert.ok(c > 0 && c < 1 - FAR_VIEW.shade + 1e-9);
    }
  }
});
