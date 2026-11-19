// Tests of the minimap's projection maths (game/src/ui/minimapProjection.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampToRectangle, compassPointName, minimapArrowAngle, minimapRotationFromForward, projectToMinimap, tileRangeAround,
  tiltRowToMap, tiltToScreen,
} from '../../../game/src/ui/minimapProjection.js';

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} != ${expected}`);
const point = () => ({ x: 0, y: 0, pinned: false });

test('looking north leaves the map north up', () => {
  const rotation = minimapRotationFromForward(0, -1);
  near(rotation, 0, 'rotation');
  const p = projectToMinimap(0, -100, rotation, 0.5, Infinity, point());
  near(p.x, 0, 'x'); near(p.y, -50, 'north is up');
  projectToMinimap(100, 0, rotation, 0.5, Infinity, p);
  near(p.x, 50, 'east is right'); near(p.y, 0, 'y');
});

test('the direction of view always points up the disc', () => {
  for (const [fx, fz] of [[1, 0], [-1, 0], [0, 1], [0.6, -0.8], [-0.28, 0.96]]) {
    const rotation = minimapRotationFromForward(fx, fz);
    const ahead = projectToMinimap(fx * 80, fz * 80, rotation, 1, Infinity, point());
    near(ahead.x, 0, `ahead x for ${fx},${fz}`);
    near(ahead.y, -80, `ahead y for ${fx},${fz}`);
    // Right of the view direction (clockwise from above: forward (fx, fz) turned to (-fz, fx)).
    const right = projectToMinimap(-fz * 30, fx * 30, rotation, 1, Infinity, point());
    near(right.x, 30, `right x for ${fx},${fz}`);
    near(right.y, 0, `right y for ${fx},${fz}`);
  }
});

test('blips beyond the square are pinned to its edge along their direction', () => {
  const p = projectToMinimap(0, -1000, 0, 1, 90, point());
  assert.equal(p.pinned, true);
  near(p.x, 0, 'x'); near(p.y, -90, 'on the top edge');
  projectToMinimap(1000, -500, 0, 1, 90, p);
  assert.equal(p.pinned, true);
  near(p.x, 90, 'on the right edge'); near(p.y, -45, 'same direction');
});

test('the tilted map shrinks what lies ahead and keeps the player in place', () => {
  const tilt = (32 * Math.PI) / 180;
  const out = { x: 0, y: 0, ok: false };
  tiltToScreen(0, 0, tilt, 234, out);
  near(out.x, 0, 'player x'); near(out.y, 0, 'player y');
  const ahead = tiltToScreen(40, -100, tilt, 234, { x: 0, y: 0, ok: false });
  const behind = tiltToScreen(40, 100, tilt, 234, { x: 0, y: 0, ok: false });
  assert.ok(ahead.ok && behind.ok);
  assert.ok(ahead.x < 40 && behind.x > 40, 'ahead narrower, behind wider');
  assert.ok(-ahead.y < 100 && ahead.y < 0, 'ahead foreshortened, still up');
  assert.equal(tiltToScreen(0, 5000, tilt, 234, out).ok, false, 'far behind leaves the view');
});

test('drawing row by row inverts the tilt', () => {
  const tilt = (32 * Math.PI) / 180;
  const screen = { x: 0, y: 0, ok: false };
  const row = { y: 0, scale: 1 };
  for (const mapY of [-150, -60, 0, 35, 80]) {
    tiltToScreen(30, mapY, tilt, 234, screen);
    tiltRowToMap(screen.y, tilt, 234, row);
    near(row.y, mapY, `row of ${mapY}`);
    near(30 * row.scale, screen.x, `scale across at ${mapY}`);
  }
});

test('rays from the player stay rays on the tilted map, and blips pin to the rectangle', () => {
  const tilt = (32 * Math.PI) / 180;
  const near1 = tiltToScreen(3, -4, tilt, 234, { x: 0, y: 0, ok: false });
  const far1 = tiltToScreen(30, -40, tilt, 234, { x: 0, y: 0, ok: false });
  near(near1.x / near1.y, far1.x / far1.y, 'same direction on screen');
  const p = clampToRectangle(300, -50, -100, -80, 100, 48, { x: 0, y: 0, pinned: false });
  assert.equal(p.pinned, true);
  near(p.x, 100, 'right edge'); near(p.y, -50 / 3, 'along the ray');
  clampToRectangle(-40, -200, -100, -80, 100, 48, p);
  near(p.y, -80, 'top edge'); near(p.x, -16, 'along the ray');
  clampToRectangle(10, 10, -100, -80, 100, 48, p);
  assert.equal(p.pinned, false);
});

test('arrows point along their world direction on the turned disc', () => {
  near(minimapArrowAngle(0, -1, 0), 0, 'north on a north-up map');
  near(minimapArrowAngle(1, 0, 0), Math.PI / 2, 'east is a quarter turn clockwise');
  const rotation = minimapRotationFromForward(1, 0);
  const angle = minimapArrowAngle(1, 0, rotation);
  near(Math.cos(angle), 1, 'facing the view direction points up');
});

test('tile ranges cover the reach of the view', () => {
  const range = tileRangeAround(10, -10, 200, 256, { minI: 0, maxI: 0, minJ: 0, maxJ: 0 });
  assert.deepEqual(range, { minI: -1, maxI: 0, minJ: -1, maxJ: 0 });
  tileRangeAround(600, 600, 100, 256, range);
  assert.deepEqual(range, { minI: 1, maxI: 2, minJ: 1, maxJ: 2 });
});

test('compass points name the view direction', () => {
  assert.equal(compassPointName(0, -1), 'N');
  assert.equal(compassPointName(1, 0), 'E');
  assert.equal(compassPointName(0, 1), 'S');
  assert.equal(compassPointName(-1, 0), 'W');
  assert.equal(compassPointName(0.7071, -0.7071), 'NE');
});
