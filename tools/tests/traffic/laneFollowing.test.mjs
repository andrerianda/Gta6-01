// Lane following: a route over the real lane graph is continuous through the junctions, the
// steering keeps a car on the lane centre line through straights and turns, the pedals reach
// and hold the cruising speed gently, and a car stops behind a standing car.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSeededRandom } from '../../../game/src/core/random/seededRandom.js';
import {
  advanceLaneRoute, chooseSuccessor, createLaneRoute, pointAlongPolyline, projectOnPolyline, routePointAhead, startLaneRoute,
} from '../../../game/src/traffic/laneRoute.js';
import { applyPedals, followingSpeed, lookaheadDistance, pursuitSteer, steeringLockAt } from '../../../game/src/traffic/laneFollowing.js';
import { KinematicCar, testPlan } from './trafficTestWorld.mjs';

const plan = testPlan();
const random = createSeededRandom('lanes');

test('a route runs continuously from lane to connector to lane', () => {
  const route = createLaneRoute(plan.lanes, () => random.next());
  const busy = plan.lanes.filter((lane) => lane.successors.length > 0 && lane.length > 40);
  for (let trial = 0; trial < 40; trial += 1) {
    startLaneRoute(route, busy[(trial * 37) % busy.length].id, 5);
    const before = { x: 0, z: 0, dx: 0, dz: 0 };
    const after = { x: 0, z: 0, dx: 0, dz: 0 };
    for (let metres = 0; metres < 600; metres += 1) {
      routePointAhead(route, 0, before);
      advanceLaneRoute(route, 1);
      routePointAhead(route, 0, after);
      const jump = Math.hypot(after.x - before.x, after.z - before.z);
      assert.ok(jump < 1.6, `trial ${trial}: jump of ${jump.toFixed(2)} m at ${metres} m`);
    }
  }
});

test('drivers mostly go straight on and take U-turns only as a last resort', () => {
  const lane = { successors: [{ turn: 'straight' }, { turn: 'left' }, { turn: 'right' }, { turn: 'uturn' }] };
  const counts = { straight: 0, left: 0, right: 0, uturn: 0 };
  for (let i = 0; i < 1000; i += 1) counts[chooseSuccessor(lane, (i + 0.5) / 1000).turn] += 1;
  assert.ok(counts.straight > 500 && counts.left > 100 && counts.right > 100 && counts.uturn < 10);
  assert.equal(chooseSuccessor({ successors: [{ turn: 'uturn' }] }, 0.5).turn, 'uturn');
});

test('polyline sampling and projection agree', () => {
  const line = [0, 0, 0, -10, 10, -10];
  const out = { x: 0, z: 0, dx: 0, dz: 0 };
  pointAlongPolyline(line, 15, out);
  assert.deepEqual([out.x, out.z, out.dx, out.dz], [5, -10, 1, 0]);
  const projected = projectOnPolyline(line, 5, -8, { s: 0, lateral: 0, distance: 0 });
  assert.equal(projected.s, 15);
  assert.equal(projected.lateral, 2, 'south of an eastward line is its right');
});

test('a car following its route keeps to the lane centre through straights and turns', () => {
  const route = createLaneRoute(plan.lanes, () => random.next());
  const start = plan.lanes.find((lane) => lane.roadClass !== 'highway' && lane.length > 80 && lane.successors.some((s) => s.turn !== 'straight'));
  startLaneRoute(route, start.id, 0);
  const at = routePointAhead(route, 0, { x: 0, z: 0, dx: 0, dz: 0 });
  const car = new KinematicCar(at.x, at.z, Math.atan2(at.dx, -at.dz));
  const controls = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
  const target = { x: 0, z: 0, dx: 0, dz: 0 };
  const projection = { s: 0, lateral: 0, distance: 0 };
  let worstOnLanes = 0;
  let worstInTurns = 0;
  const dt = 1 / 30;
  for (let t = 0; t < 90; t += dt) {
    const first = route.pieces[0];
    projectOnPolyline(first.points, car.x, car.z, projection);
    route.s = projection.s;
    advanceLaneRoute(route, 0);
    if (t > 6) {
      // On a lane once settled from the turn (the first and last ten metres blend with the curves).
      const settled = route.s > 10 && route.s < route.pieces[0].length - 10;
      if (route.pieces[0].lane >= 0 && settled) worstOnLanes = Math.max(worstOnLanes, projection.distance);
      else worstInTurns = Math.max(worstInTurns, projection.distance);
    }
    routePointAhead(route, lookaheadDistance(car.speed, route.pieces[0].lane < 0 && route.pieces[0].turn !== 'straight'), target);
    controls.steer = pursuitSteer(car.x, car.z, car.heading, target.x, target.z, car.tuning.wheelbase, steeringLockAt(car.tuning, car.speed));
    const corner = route.pieces[0].lane < 0 && route.pieces[0].turn !== 'straight' ? 7 : 12;
    applyPedals(corner, car.speed, controls);
    car.step(controls, dt);
  }
  assert.ok(worstOnLanes < 0.9, `strayed ${worstOnLanes.toFixed(2)} m from the lane centre`);
  assert.ok(worstInTurns < 1.8, `strayed ${worstInTurns.toFixed(2)} m from the connector curve`);
});

test('the pedals reach the cruising speed without lurching and hold it', () => {
  const car = new KinematicCar(0, 0, 0);
  const controls = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
  let peakThrottle = 0;
  for (let t = 0; t < 30; t += 1 / 30) {
    applyPedals(14, car.speed, controls);
    peakThrottle = Math.max(peakThrottle, controls.throttle);
    car.step(controls, 1 / 30);
  }
  assert.ok(Math.abs(car.speed - 14) < 1.2, `speed ${car.speed.toFixed(1)}`);
  assert.ok(peakThrottle <= 0.55);
});

test('a follower stops behind a standing car and keeps headway behind a moving one', () => {
  assert.equal(followingSpeed(2, 0), 0);
  assert.ok(followingSpeed(30, 0) > 8, 'room to roll up');
  assert.ok(followingSpeed(10, 12) < 12, 'too close at speed: drop back');
  assert.ok(followingSpeed(40, 12) > 12, 'far behind: close up');
  const car = new KinematicCar(0, 0, 0);
  car.speed = 13;
  const controls = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
  const obstacleZ = -60;
  for (let t = 0; t < 20; t += 1 / 30) {
    const gap = car.z - obstacleZ - 2.3;
    applyPedals(Math.min(13, followingSpeed(gap, 0, car.speed)), car.speed, controls);
    car.step(controls, 1 / 30);
  }
  const gap = car.z - obstacleZ - 2.3;
  assert.ok(car.speed < 0.2 && gap > 0.8 && gap < 5, `stopped ${gap.toFixed(2)} m behind at ${car.speed.toFixed(2)} m/s`);
});
