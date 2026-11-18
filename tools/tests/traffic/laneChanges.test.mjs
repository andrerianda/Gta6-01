// Lane changes: a driver behind a slower car on a multi-lane road signals, waits for a gap, and
// eases across into the next lane without a jerk; nobody weaves out of a queue at a light, and
// nobody moves over into a car alongside or one closing fast from behind.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSeededRandom } from '../../../game/src/core/random/seededRandom.js';
import {
  LANE_CHANGE, createLaneChangeState, createLaneChanger, leavesRoom, mergeOffset, wantsToOvertake,
} from '../../../game/src/traffic/laneChanges.js';
import { createLaneRoute, pointAlongPolyline, projectOnPolyline, routePointAhead, startLaneRoute } from '../../../game/src/traffic/laneRoute.js';
import { applyPedals, lookaheadDistance, pursuitSteer, steeringLockAt } from '../../../game/src/traffic/laneFollowing.js';
import { KinematicCar, testPlan } from './trafficTestWorld.mjs';

const plan = testPlan();
const random = createSeededRandom('lane-changes');

test('a driver overtakes a slower car close ahead, but not out of a queue or round a person', () => {
  assert.equal(wantsToOvertake(14, 18, 7, Infinity, true), true);
  assert.equal(wantsToOvertake(14, 18, 0, Infinity, true), true, 'a stalled car mid-lane');
  assert.equal(wantsToOvertake(14, 18, 13, Infinity, true), false, 'nearly as fast');
  assert.equal(wantsToOvertake(14, 60, 5, Infinity, true), false, 'still far');
  assert.equal(wantsToOvertake(14, 6, 0, 12, true), false, 'queued at a light');
  assert.equal(wantsToOvertake(14, 10, 0, Infinity, false), false, 'a person in the road');
});

test('the gap check wants room ahead and behind for the closing speeds', () => {
  assert.equal(leavesRoom(0, 12, 12), false, 'alongside');
  assert.equal(leavesRoom(40, 12, 12), true, 'well ahead at the same speed');
  assert.equal(leavesRoom(16, 14, 4), false, 'a slow car just ahead in the new lane');
  assert.equal(leavesRoom(-14, 10, 18), false, 'a car closing fast from behind');
  assert.equal(leavesRoom(-30, 12, 10), true, 'a slower car well behind');
});

test('the sideways move eases in and out from the old lane to the new one', () => {
  assert.equal(mergeOffset(3.4, 0), 3.4);
  assert.equal(mergeOffset(3.4, 1), 0);
  let last = 3.4;
  let steepest = 0;
  for (let t = 0.01; t <= 1.0001; t += 0.01) {
    const now = mergeOffset(3.4, t);
    assert.ok(now <= last + 1e-9, 'never back towards the old lane');
    steepest = Math.max(steepest, last - now);
    last = now;
  }
  assert.ok(steepest < 0.06, `steepest step ${steepest.toFixed(3)} m per 1 % of the move`);
});

// A car on the real plan's lane with a slower car ahead; `others` are the fake vehicles around.
function setUp(withBlocker) {
  const lane = plan.lanes.find((l) => l.leftLane >= 0 && l.length > 160 && l.speedLimit >= 11);
  assert.ok(lane, 'the plan has a multi-lane road');
  const route = createLaneRoute(plan.lanes, () => random.next());
  startLaneRoute(route, lane.id, 10);
  const at = routePointAhead(route, 0, { x: 0, z: 0, dx: 0, dz: 0 });
  const car = new KinematicCar(at.x, at.z, Math.atan2(at.dx, -at.dz));
  car.speed = 12;
  const entity = { position: { x: car.x, z: car.z }, heading: -car.heading, data: { speed: 12 } };
  const leaderAt = pointAlongPolyline(lane.points, 32, { x: 0, z: 0, dx: 0, dz: 0 });
  const leader = { position: { x: leaderAt.x, z: leaderAt.z }, heading: -car.heading, data: { speed: 6 } };
  const others = [leader];
  if (withBlocker) {
    const leftPoints = plan.lanes[lane.leftLane].points;
    const s = projectOnPolyline(leftPoints, car.x, car.z, { s: 0, lateral: 0, distance: 0 }).s;
    const beside = pointAlongPolyline(leftPoints, s + 1.5, { x: 0, z: 0, dx: 0, dz: 0 });
    others.push({ position: { x: beside.x, z: beside.z }, heading: -car.heading, data: { speed: 12 }, moves: true });
  }
  const changer = createLaneChanger(plan.lanes, (x, z, radius, visit) => {
    visit(entity);
    for (const other of others) if (Math.hypot(other.position.x - x, other.position.z - z) <= radius) visit(other);
  });
  const agent = {
    route, entity, car, change: createLaneChangeState(), gap: 22 - 2.4, leaderSpeed: 6, lineDistance: Infinity, blockerIsVehicle: true,
    lastFirstLane: lane.id, lineWait: 0,
  };
  agent.change.cooldown = 0;
  return { lane, route, car, entity, agent, changer, others };
}

test('a held-up driver signals, then eases into the overtaking lane without a jerk', () => {
  const { lane, route, car, entity, agent, changer } = setUp(false);
  const controls = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
  const target = { x: 0, z: 0, dx: 0, dz: 0 };
  const projection = { s: 0, lateral: 0, distance: 0 };
  const dt = 1 / 60;
  let signalledFor = 0;
  let changedAt = -1;
  let worstSteerStep = 0;
  let lastSteer = 0;
  for (let step = 0, time = 0; step < 60 * 9; step += 1, time += dt) {
    projectOnPolyline(route.pieces[0].points, car.x, car.z, projection);
    route.s = projection.s;
    changer.update(agent, dt, 14, true, step % 3 === 0, time);
    if (changedAt < 0 && changer.indicatorOf(agent.change) === -1) signalledFor += dt;
    if (changedAt < 0 && route.pieces[0].lane === lane.leftLane) changedAt = time;
    const ahead = lookaheadDistance(car.speed);
    routePointAhead(route, ahead, target);
    const offset = changer.steerOffset(agent.change, car.speed, ahead);
    controls.steer = pursuitSteer(car.x, car.z, car.heading, target.x - target.dz * offset, target.z + target.dx * offset, car.tuning.wheelbase, steeringLockAt(car.tuning, car.speed));
    if (step > 0) worstSteerStep = Math.max(worstSteerStep, Math.abs(controls.steer - lastSteer));
    lastSteer = controls.steer;
    applyPedals(12, car.speed, controls);
    car.step(controls, dt);
    entity.position.x = car.x;
    entity.position.z = car.z;
    entity.heading = -car.heading;
    agent.gap = Infinity;
  }
  assert.ok(changedAt > 0, 'the car moved over');
  assert.ok(signalledFor >= LANE_CHANGE.signalSeconds - 0.05, `signalled ${signalledFor.toFixed(2)} s before turning`);
  projectOnPolyline(plan.lanes[lane.leftLane].points, car.x, car.z, projection);
  assert.ok(projection.distance < 0.5, `ended ${projection.distance.toFixed(2)} m off the new lane's centre`);
  assert.ok(worstSteerStep < 0.08, `steering jumped by ${worstSteerStep.toFixed(3)} in one step`);
  assert.equal(changer.indicatorOf(agent.change), 0, 'indicator off once across');
});

test('nobody moves over into a car alongside', () => {
  const { lane, route, agent, changer } = setUp(true);
  for (let step = 0, time = 0; step < 60 * 3; step += 1, time += 1 / 60) changer.update(agent, 1 / 60, 14, true, true, time);
  assert.notEqual(route.pieces[0].lane, lane.leftLane, 'not into the occupied overtaking lane');
});
