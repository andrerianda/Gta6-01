// The first seconds of a mission: the intro's stage moves off lamp poles and trunks that would
// stand between the cameras and the lead (stageSpot.js, QA bug 8), and an objective whose
// target changes (the nearest foe of a fight) is not announced again (QA bug 9: m05's
// "Take out the loading crew" came three times).
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickClearStage, sightCost } from '../../../game/src/missions/stageSpot.js';
import { createMissionRun } from '../../../game/src/missions/missionRun.js';

// A start on a pavement: the door at z = 0, the street towards +z, the marker 3.5 m out.
const START = { x: 0, y: 0, z: 3.5, frontX: 0, frontZ: 1 };

test('with nothing about, the stage is the old spot: a step from the marker towards the door, facing the street', () => {
  const stage = pickClearStage(START, []);
  assert.equal(stage.blocked, 0);
  assert.ok(Math.abs(stage.position.x) < 1e-9 && Math.abs(stage.position.z - 2.3) < 1e-9);
  const forward = { x: -Math.sin(stage.heading), z: -Math.cos(stage.heading) };
  assert.ok(forward.z > 0.99, 'faces the street');
});

test('a lamp pole between the cameras and the lead moves the stage along the facade to a clear spot', () => {
  const old = { x: 0, y: 0, z: 2.3, heading: Math.atan2(0, -1) };
  // A kerb pole on the establishing shot's line and one behind the lead on the follow camera's.
  const poles = [{ x: -1.4, z: 5.6, radius: 0.12, kind: 'pole' }, { x: 0.3, z: 0.9, radius: 0.12, kind: 'pole' }];
  assert.ok(sightCost(old, poles) > 0, 'the old spot is blocked');
  const stage = pickClearStage(START, poles);
  assert.equal(stage.blocked, 0);
  assert.ok(Math.hypot(stage.position.x, stage.position.z - 2.3) > 0.5, 'moved');
  assert.ok(Math.abs(stage.position.x) <= 4.5 + 1e-9, 'stays in front of the start');
});

test('with poles everywhere the least blocked spot is taken, never nothing', () => {
  const poles = [];
  for (let x = -8; x <= 8; x += 0.8) for (let z = -1; z <= 8; z += 0.8) poles.push({ x, z, radius: 0.15 });
  const stage = pickClearStage(START, poles);
  assert.ok(stage && Number.isFinite(stage.position.x) && stage.blocked > 0);
});

test('a new target for the same objective is passed on as a retarget, not a new objective', () => {
  let moves = 0;
  const kinds = {
    go_to: {
      begin(o) { o.target = { x: 0, z: 0 }; },
      update(o) { moves += 1; if (moves <= 3) { o.target = { x: moves, z: 0 }; o.retarget = true; } return moves > 5 ? 1 : 0; },
    },
  };
  const mission = { id: 'test', objectives: [{ kind: 'go_to', text: 'Go', params: {} }, { kind: 'go_to', text: 'Again', params: {} }], failConditions: [] };
  const world = { place: () => null, player: () => ({ x: 0, y: 0, z: 0 }), marks() {} };
  const heard = [];
  const run = createMissionRun(mission, world, { kinds, on: { objective: (o, retarget = false) => heard.push([o.index, retarget]) } });
  for (let i = 0; i < 8; i += 1) run.update(1 / 60);
  const announced = heard.filter(([, retarget]) => !retarget).map(([index]) => index);
  assert.deepEqual(announced, [0, 1], 'each objective announced once');
  assert.equal(heard.filter(([, retarget]) => retarget).length, 3);
});
