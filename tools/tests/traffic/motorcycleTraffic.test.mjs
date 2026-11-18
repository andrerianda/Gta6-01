// Motorcycles in traffic and parked cars pulling out. A traffic bike is mounted (the physics then
// holds it upright and leans it into turns), rides in the left wheel track of its lane, and is
// left lying once a crash throws its rider. A parked car may pull out when nothing moves on the
// lane behind or beside its exit; the parked row beside the lane does not stop it.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

import { projectOnPolyline } from '../../../game/src/traffic/laneRoute.js';
import { BIKE_LANE_BIAS, createTrafficDrivers } from '../../../game/src/traffic/trafficDrivers.js';
import { createTestWorld, testPlan } from './trafficTestWorld.mjs';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const { pullOutClear } = await import('../../../game/src/traffic/kerbsideParking.js');

const plan = testPlan();
const centre = plan.roads.nodes.filter((node) => node.control === 'signals')
  .sort((a, b) => Math.hypot(a.x - 300, a.z - 230) - Math.hypot(b.x - 300, b.z - 230))[0];

test('a traffic motorcycle is ridden, keeps left of its lane centre, and lies still once its rider is thrown', () => {
  const world = createTestWorld(centre);
  const drivers = createTrafficDrivers(world.context, { city: world.city, fleet: world.fleet });
  drivers.setDensity(0);
  // The longest lane near the player, no other traffic.
  const laneId = plan.lanes.map((lane, index) => ({ index, lane }))
    .filter(({ lane }) => Math.hypot(lane.points[0] - centre.x, lane.points[1] - centre.z) < 200)
    .sort((a, b) => b.lane.length - a.lane.length)[0].index;
  assert.ok(drivers.adopt(laneId, 20, 'sport_motorcycle', '#c8281e', 8), 'placed');
  const agent = drivers.agents[0];
  assert.ok(agent.bike, 'known as a bike');
  assert.equal(agent.car.riderSeated, true, 'mounted');
  assert.ok(-agent.laneBias >= BIKE_LANE_BIAS.min && -agent.laneBias <= BIKE_LANE_BIAS.max);
  const projection = { s: 0, lateral: 0, distance: 0 };
  const laterals = [];
  const focus = world.context.focus.position;
  for (let step = 0; step < 30 * 8; step += 1) {
    // The player rides along (a lone car far from the player would be put away).
    focus.x = agent.entity.position.x;
    focus.z = agent.entity.position.z;
    drivers.fixedUpdate(1 / 30);
    world.stepCars(1 / 30);
    // On a lane (not inside a junction), away from its ends, not changing lanes.
    const piece = agent.route.pieces[0];
    const lane = piece.lane >= 0 ? plan.lanes[piece.lane] : null;
    if (step > 45 && lane && agent.route.s > 15 && agent.route.s < lane.length - 15 && agent.change.phase === 0) {
      projectOnPolyline(lane.points, agent.entity.position.x, agent.entity.position.z, projection);
      laterals.push(projection.lateral);
    }
  }
  assert.ok(laterals.length > 30, `rode its lanes (${laterals.length} samples)`);
  laterals.sort((a, b) => a - b);
  const median = laterals[laterals.length >> 1];
  assert.ok(median < -0.2 && median > -1.1, `left wheel track (median lateral ${median.toFixed(2)} m)`);
  assert.ok(agent.car.speed > 4, 'rides on');
  // A crash throws the rider in view of a camera 10 m behind: nobody rides it on, it stays.
  const p = agent.entity.position;
  const fx = Math.sin(agent.car.heading);
  const fz = -Math.cos(agent.car.heading);
  const elements = new Array(16).fill(0);
  [elements[8], elements[10], elements[12], elements[14], elements[15]] = [-fx, -fz, p.x - fx * 10, p.z - fz * 10, 1];
  world.context.view = { camera: { matrixWorld: { elements }, fov: 55, aspect: 1.6 } };
  agent.car.riderSeated = false;
  for (let step = 0; step < 30; step += 1) {
    drivers.fixedUpdate(1 / 30);
    world.stepCars(1 / 30);
  }
  assert.ok(drivers.agents.includes(agent), 'left lying in view');
  assert.equal(agent.controls.throttle, 0);
  assert.equal(agent.controls.brake, 1);
});

test('a parked car pulls out when the lane is clear behind and beside its exit, whatever is parked', () => {
  // A lane running north (-Z) along x = 0; the exit 40 m along it.
  const points = [0, 0, 0, -200];
  const movers = [];
  const countMoving = (x, z, radius) => movers.filter((p) => Math.hypot(p.x - x, p.z - z) <= radius).length;
  assert.equal(pullOutClear(points, 40, countMoving), true, 'empty lane');
  movers.push({ x: 0, z: -20 }); // 20 m behind the exit, coming up
  assert.equal(pullOutClear(points, 40, countMoving), false, 'a car coming up behind');
  movers[0].z = -44; // just past the exit
  assert.equal(pullOutClear(points, 40, countMoving), false, 'a car beside the exit');
  movers[0].z = 20; // well behind, out of reach
  assert.equal(pullOutClear(points, 40, countMoving), true, 'a car far behind');
  movers[0].z = -60; // 20 m ahead, driving away
  assert.equal(pullOutClear(points, 40, countMoving), true, 'a car ahead driving away');
});
