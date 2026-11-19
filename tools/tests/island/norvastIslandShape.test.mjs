// The Norvast island's height function: the strip is dead flat, the approach from Marazul is
// clear under a 4 degree glide path, the valley is hidden behind its ridges, the coast is steep,
// everything beyond the chart's radius is sea, and the same place always has the same height.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SEA_AND_AIRSPACE_CHART } from '../../../game/src/catalog/seaAndAirspaceChart.js';
import {
  NORVAST_ISLAND_SHAPE as SHAPE, islandHeightLocal, islandLocalOf, norvastIslandHeightAt,
} from '../../../game/src/world/island/norvastIslandShape.js';
import { createIslandHeightGrid } from '../../../game/src/world/island/islandHeightGrid.js';

const CHART = SEA_AND_AIRSPACE_CHART.norvastIsland;
const { u0, u1, halfWidth, y: stripY } = SHAPE.stripLocal;

test('the strip follows the chart and is dead flat, with the pad and the apron', () => {
  assert.equal(SHAPE.strip.length, CHART.stripLength);
  assert.equal(SHAPE.strip.heading, CHART.stripHeading);
  assert.ok(Math.abs(Math.hypot(SHAPE.strip.x1 - SHAPE.strip.x0, SHAPE.strip.z1 - SHAPE.strip.z0) - CHART.stripLength) < 1e-6);
  assert.ok(SHAPE.strip.x0 > SHAPE.strip.x1, 'end 0 is the eastern threshold');
  for (let u = u0; u <= u1; u += 5) {
    for (let v = -halfWidth; v <= halfWidth; v += 2) assert.equal(islandHeightLocal(u, v), stripY);
  }
  const strip = SHAPE.strip;
  for (let t = 0; t <= 1; t += 0.05) {
    assert.equal(norvastIslandHeightAt(strip.x0 + (strip.x1 - strip.x0) * t, strip.z0 + (strip.z1 - strip.z0) * t), stripY);
  }
  const apron = SHAPE.apronLocal;
  for (let u = apron.u0; u <= apron.u1; u += 10) for (let v = apron.v0; v <= apron.v1; v += 5) assert.equal(islandHeightLocal(u, v), stripY);
  assert.equal(islandHeightLocal(SHAPE.padLocal.u + 30, 0), stripY);
  assert.equal(norvastIslandHeightAt(SHAPE.handoverPoint.x, SHAPE.handoverPoint.z), stripY);
  assert.equal(norvastIslandHeightAt(SHAPE.hangar.x, SHAPE.hangar.z), stripY);
});

test('the approach from the east is clear under a 4 degree glide path, 60 m either side of the strip', () => {
  const slope = Math.tan((4 * Math.PI) / 180);
  for (let d = 0; d <= 1200; d += 3) {
    for (let v = -(halfWidth + 60); v <= halfWidth + 60; v += 4) {
      const height = islandHeightLocal(u0 - d, v);
      assert.ok(height <= stripY + d * slope + 1e-9, `terrain ${height.toFixed(1)} m at ${d} m out, ${v} m off the line`);
    }
  }
});

test('the valley is hidden: ridges at least 50 m over the strip on both sides, a rock wall at the far end', () => {
  for (let u = u0; u <= u1; u += 20) {
    let north = 0, south = 0;
    for (let v = halfWidth; v <= 600; v += 4) {
      north = Math.max(north, islandHeightLocal(u, v));
      south = Math.max(south, islandHeightLocal(u, -v));
    }
    assert.ok(north >= stripY + 50 && south >= stripY + 50, `ridges ${north.toFixed(0)} / ${south.toFixed(0)} m at u ${u}`);
  }
  let wall = 0;
  for (let u = u1; u <= u1 + 300; u += 4) wall = Math.max(wall, islandHeightLocal(u, 0));
  assert.ok(wall >= stripY + 50, `the western wall is ${wall.toFixed(0)} m`);
});

test('cliffs rise straight out of the sea, the peak is about the chart height, and beyond the radius is sea', () => {
  let steep = 0, bearings = 0, peak = 0;
  for (let degrees = 0; degrees < 360; degrees += 5) {
    const c = Math.cos((degrees * Math.PI) / 180), s = Math.sin((degrees * Math.PI) / 180);
    let low = 0, high = CHART.radius;
    for (let i = 0; i < 40; i += 1) {
      const middle = (low + high) / 2;
      if (islandHeightLocal(c * middle, s * middle) > 0) low = middle; else high = middle;
    }
    bearings += 1;
    if (islandHeightLocal(c * (low - 45), s * (low - 45)) >= 30) steep += 1;
  }
  assert.ok(steep / bearings >= 0.8, `${steep} of ${bearings} bearings have a steep coast`);
  for (let u = -960; u <= 960; u += 8) for (let v = -640; v <= 640; v += 8) peak = Math.max(peak, islandHeightLocal(u, v));
  assert.ok(peak >= CHART.peakHeight - 20 && peak <= CHART.peakHeight + 8, `peak ${peak.toFixed(1)} m`);
  for (let degrees = 0; degrees < 360; degrees += 1) {
    for (const radius of [CHART.radius, CHART.radius + 40, CHART.radius + 900, 5000]) {
      const x = CHART.x + radius * Math.cos((degrees * Math.PI) / 180), z = CHART.z + radius * Math.sin((degrees * Math.PI) / 180);
      assert.ok(norvastIslandHeightAt(x, z) < 0, `land at ${radius} m, bearing ${degrees}`);
    }
  }
  assert.ok(norvastIslandHeightAt(0, 150) < 0, 'Marazul is not on the island');
});

test('the track runs down from the valley to a low sand cove', () => {
  const track = SHAPE.trackLocal;
  const heights = track.map(([u, v]) => islandHeightLocal(u, v));
  for (let i = 1; i < heights.length; i += 1) assert.ok(heights[i] < heights[i - 1], 'the track descends');
  assert.ok(heights[0] > 15 && heights.at(-1) > 0 && heights.at(-1) < 2.5, `track ${heights.map((h) => h.toFixed(1))}`);
});

test('the shape is deterministic and the frame maps both ways', () => {
  const again = [];
  for (let i = 0; i < 200; i += 1) again.push(islandHeightLocal(-900 + i * 9.1, -600 + i * 6.3));
  for (let i = 0; i < 200; i += 1) assert.equal(islandHeightLocal(-900 + i * 9.1, -600 + i * 6.3), again[i]);
  assert.equal(Math.round(islandHeightLocal(310, 300) * 1000), Math.round(islandHeightLocal(310, 300) * 1000));
  const local = islandLocalOf(SHAPE.strip.x0, SHAPE.strip.z0, { u: 0, v: 0 });
  assert.ok(Math.abs(local.u - u0) < 1e-9 && Math.abs(local.v) < 1e-9);
  const back = SHAPE.toWorld(local.u, local.v);
  assert.ok(Math.abs(back.x - SHAPE.strip.x0) < 1e-9 && Math.abs(back.z - SHAPE.strip.z0) < 1e-9);
});

test('the baked height grid matches the function and is flat on the strip', () => {
  const grid = createIslandHeightGrid();
  for (const _ of grid.bake(64)) void _;
  assert.ok(grid.ready);
  for (let u = u0; u <= u1; u += 7.3) for (let v = -halfWidth; v <= halfWidth; v += 3.1) assert.equal(grid.heightLocal(u, v), stripY);
  let worst = 0;
  for (let u = -900; u <= 900; u += 36) for (let v = -600; v <= 600; v += 28) worst = Math.max(worst, Math.abs(grid.heightLocal(u, v) - islandHeightLocal(u, v)));
  assert.ok(worst < 1e-4, 'grid points carry the function (to single precision)');
  assert.ok(grid.heightLocal(5000, 0) < 0 && grid.heightLocal(-961, 0) < 0);
  const normal = grid.normalLocal(0, 0, { x: 0, y: 0, z: 0 });
  assert.ok(Math.abs(normal.y - 1) < 1e-6);
});
