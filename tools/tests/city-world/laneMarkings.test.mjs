// Tests of the road paint layout: lines lie between the plan's traffic lanes (never on a lane
// centre), the frame (s right of the segment) matches plan.lanes, stop bars cover every
// arriving lane at signalled junctions, dashes and arrows follow the rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeededRandom } from '../../../game/src/core/random/seededRandom.js';
import { generateCityPlan } from '../../../game/src/world/plan/cityPlanGenerator.js';
import { crownHeight, roadCrossSection, sampleRoadCentreLines } from '../../../game/src/world/streets/roadSampling.js';
import { approachOf, arrowTurnOf, forEachDash, laneLinesOf, meshCrownAt } from '../../../game/src/world/streets/laneMarkingLayout.js';

const plan = generateCityPlan(createSeededRandom(1));
const lines = sampleRoadCentreLines(plan);
const sections = plan.roads.segments.map(roadCrossSection);

/** Signed offset of (x, z) right of a centre line, at its nearest sample. */
function lateralOffset(line, x, z) {
  let best = Infinity;
  let offset = 0;
  for (let i = 0; i < line.count; i += 1) {
    const d = Math.hypot(x - line.x[i], z - line.z[i]);
    if (d < best) {
      best = d;
      offset = (x - line.x[i]) * -line.tz[i] + (z - line.z[i]) * line.tx[i];
    }
  }
  return offset;
}

test('plan lane centres sit where approachOf puts them (same right-of-segment frame)', () => {
  let checked = 0;
  for (const lane of plan.lanes) {
    const segment = plan.roads.segments[lane.segment];
    if (segment.paved === false || lane.points.length < 4) continue;
    const approach = approachOf(segment, { control: 'signals', arms: [] }, lane.direction > 0);
    if (!approach) continue;
    const expected = approach.lanes.find((entry) => entry.index === lane.index);
    assert.ok(expected, `lane ${lane.id}`);
    const mid = Math.floor(lane.points.length / 4) * 2;
    const offset = lateralOffset(lines[segment.id], lane.points[mid], lane.points[mid + 1]);
    assert.ok(Math.abs(offset - expected.s) < 0.6, `lane ${lane.id}: plan ${offset.toFixed(2)} vs paint ${expected.s.toFixed(2)}`);
    checked += 1;
  }
  assert.ok(checked > 500, `checked ${checked}`);
});

test('no painted line runs down a lane centre, and two-way streets have a double yellow', () => {
  let doubles = 0;
  for (const segment of plan.roads.segments) {
    const marks = laneLinesOf(segment, sections[segment.id]);
    const centres = [];
    for (const atEnd of [true, false]) {
      const approach = approachOf(segment, { control: 'signals', arms: [] }, atEnd);
      if (approach) centres.push(...approach.lanes.map((lane) => lane.s));
    }
    for (const mark of marks) {
      for (const s of centres) assert.ok(Math.abs(mark.s - s) > segment.laneWidth / 2 - 0.35, `segment ${segment.id}`);
      assert.ok(Math.abs(mark.s) < segment.halfWidth, `segment ${segment.id} line inside the kerbs`);
    }
    const yellow = marks.filter((mark) => mark.color === 'yellow' && mark.dash === 0 && Math.abs(mark.s) < segment.halfWidth - 1);
    if (segment.lanesForward > 0 && segment.lanesBackward > 0 && !sections[segment.id].median && segment.paved !== false && segment.roadClass !== 'dirt') {
      assert.equal(yellow.length, 2, `segment ${segment.id}`);
      doubles += 1;
    }
    if (segment.oneWay) assert.ok(!marks.some((mark) => mark.width < 0.13), 'no double yellow on a one-way street');
  }
  assert.ok(doubles > 50);
});

test('every signalled approach gets a stop bar over all its arriving lanes', () => {
  let bars = 0;
  for (const node of plan.roads.nodes) {
    if (node.control !== 'signals') continue;
    for (const arm of node.arms) {
      const segment = plan.roads.segments[arm.segment];
      const approach = approachOf(segment, node, !arm.atStart);
      const arriving = arm.atStart ? segment.lanesBackward : segment.lanesForward;
      if (arriving === 0 || segment.paved === false) continue;
      assert.ok(approach && approach.signals, `node ${node.id}`);
      assert.equal(approach.lanes.length, arriving);
      assert.ok(approach.to - approach.from > arriving * segment.laneWidth - 0.01);
      bars += 1;
    }
  }
  assert.ok(bars > 100, `${bars} bars`);
  const quiet = plan.roads.nodes.find((node) => node.control === 'none' && node.arms.length > 0);
  if (quiet) assert.equal(approachOf(plan.roads.segments[quiet.arms[0].segment], quiet, true), null);
});

test('dashes repeat 3 m on, 6 m off, continuous across sample boundaries', () => {
  const painted = [];
  forEachDash(0, 5, 3, 9, (a, b) => painted.push([a, b]));
  forEachDash(5, 20, 3, 9, (a, b) => painted.push([a, b]));
  assert.deepEqual(painted, [[0, 3], [9, 12], [18, 20]]);
  const solid = [];
  forEachDash(2, 7, 0, 0, (a, b) => solid.push([a, b]));
  assert.deepEqual(solid, [[2, 7]]);
});

test('arrows follow the lane turns and the paint follows the mesh crown', () => {
  assert.equal(arrowTurnOf({ successors: [{ turn: 'left' }, { turn: 'uturn' }] }), 'left');
  assert.equal(arrowTurnOf({ successors: [{ turn: 'right' }] }), 'right');
  assert.equal(arrowTurnOf({ successors: [{ turn: 'straight' }, { turn: 'left' }] }), 'straight');
  const section = sections.find((candidate) => candidate.crown > 0.05);
  for (const s of section.lateral) assert.ok(Math.abs(meshCrownAt(section, s, crownHeight) - crownHeight(section, s)) < 1e-9);
});
