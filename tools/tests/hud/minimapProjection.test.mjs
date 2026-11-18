// Tests of the minimap's projection maths (game/src/ui/minimapProjection.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compassPointName, insideMinimapSquare, minimapArrowAngle, minimapRotationFromForward, projectToMinimap, tileRangeAround,
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
  assert.ok(insideMinimapSquare(p, 90), 'a pinned blip stays inside the square');
});

test('the corners of the square are map, not a disc', () => {
  // 106 px from the centre: beyond a disc of radius 90, inside the square of half-side 90.
  const p = projectToMinimap(80, 70, 0, 1, 90, point());
  assert.equal(p.pinned, false);
  near(p.x, 80, 'x inside'); near(p.y, 70, 'y inside');
  assert.equal(insideMinimapSquare(p, 90), true);
  assert.equal(insideMinimapSquare({ x: 91, y: 0 }, 90), false);
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
