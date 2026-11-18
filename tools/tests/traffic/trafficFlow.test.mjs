// The traffic drivers over the real city plan with a kinematic fleet: the streets fill to the
// tier's count with built models chosen by district, cars keep their lane, nobody runs a red
// light, and ten minutes of driving round Gran Via's signals end without a pile-up. Drivers
// flee gunfire and pull over for a siren.

import assert from 'node:assert/strict';
import test from 'node:test';

import { CITY_DISTRICTS } from '../../../game/src/catalog/cityDistricts.js';
import { VEHICLE_CATALOG } from '../../../game/src/catalog/vehicleCatalog.js';
import { SIGNAL_LIGHT, signalLightAt } from '../../../game/src/traffic/junctionRules.js';
import { projectOnPolyline } from '../../../game/src/traffic/laneRoute.js';
import { createTrafficDrivers } from '../../../game/src/traffic/trafficDrivers.js';
import { buildTrafficMixes, pickTrafficModel, trafficTargetCount } from '../../../game/src/traffic/trafficSpawning.js';
import { createTestWorld, testPlan } from './trafficTestWorld.mjs';

const plan = testPlan();
// A signalled junction on Gran Via Marazul, in the towers of Centro.
const junction = plan.roads.nodes
  .filter((node) => node.control === 'signals')
  .sort((a, b) => Math.hypot(a.x - 300, a.z - 230) - Math.hypot(b.x - 300, b.z - 230))[0];

test('the tier sets the number of cars, the density scales it', () => {
  assert.equal(trafficTargetCount({ maxVehicles: 60, trafficDensity: 1 }, 1), 40);
  assert.equal(trafficTargetCount({ maxVehicles: 28, trafficDensity: 0.55 }, 1), 18);
  assert.equal(trafficTargetCount({ maxVehicles: 60, trafficDensity: 1 }, 0), 0);
});

test('models come from the district mix among the built ones, never scripted ones', () => {
  const built = new Set(['sports_coupe', 'family_sedan', 'police_cruiser']);
  const mixes = buildTrafficMixes(CITY_DISTRICTS, VEHICLE_CATALOG, (id) => built.has(id), 18.8);
  const seen = new Set();
  for (const districtId of Object.keys(CITY_DISTRICTS)) {
    for (let i = 0; i < 50; i += 1) seen.add(pickTrafficModel(mixes, districtId, (i + 0.5) / 50));
  }
  assert.ok(seen.has('family_sedan') && seen.has('sports_coupe'));
  assert.ok(!seen.has('police_cruiser'), 'police cars are not traffic');
  assert.equal(pickTrafficModel(mixes, 'nowhere', 0.3) !== null, true, 'unknown districts use the city-wide mix');
});

test('ten minutes round a Gran Via junction: lanes kept, reds respected, no pile-up', () => {
  const world = createTestWorld(junction);
  const drivers = createTrafficDrivers(world.context, { city: world.city, fleet: world.fleet });
  drivers.refill();
  const dt = 1 / 30;
  const projection = { s: 0, lateral: 0, distance: 0 };
  const firstLane = new Map();
  let strays = 0;
  let samples = 0;
  let redRuns = 0;
  let movingSamples = 0;
  let carSamples = 0;
  let minimumCount = Infinity;
  for (let step = 0; step < 600 / dt; step += 1) {
    drivers.fixedUpdate(dt);
    world.stepCars(dt);
    const time = world.context.simulation.time;
    for (const agent of drivers.agents) {
      const piece = agent.route.pieces[0];
      const previous = firstLane.get(agent.vehicleId);
      // Entering the junction from a lane whose light has been red for over two seconds is a red run.
      if (previous !== undefined && previous >= 0 && piece.lane < 0) {
        const lane = plan.lanes[previous];
        if (lane.control === 'signals') {
          const signal = plan.roads.nodes[lane.signalNode].signal;
          if (signalLightAt(signal, lane.phase, time) === SIGNAL_LIGHT.RED && signalLightAt(signal, lane.phase, time - 2) === SIGNAL_LIGHT.RED) redRuns += 1;
        }
      }
      firstLane.set(agent.vehicleId, piece.lane);
      // A car moving across into another lane (overtaking, or into a turn lane) is on its way, not astray.
      const moving = agent.change.phase !== 0 || agent.change.cooldown > 4.5;
      if (step % 30 === 0 && !moving && piece.lane >= 0 && agent.route.s > 8 && agent.route.s < piece.length - 8) {
        projectOnPolyline(piece.points, agent.entity.position.x, agent.entity.position.z, projection);
        samples += 1;
        if (projection.distance > 1.2) strays += 1;
      }
    }
    if (step % 30 === 0 && time > 20) {
      minimumCount = Math.min(minimumCount, drivers.count);
      for (const agent of drivers.agents) {
        carSamples += 1;
        if (agent.car.speed > 1) movingSamples += 1;
      }
    }
  }
  const target = trafficTargetCount(world.context.quality.tier, 1);
  assert.ok(minimumCount >= target * 0.7, `only ${minimumCount} of ${target} cars at worst`);
  assert.ok(strays / samples < 0.05, `${strays} of ${samples} lane samples off the centre line`);
  assert.equal(redRuns, 0, 'nobody runs a red light');
  assert.ok(movingSamples / carSamples > 0.45, `only ${(100 * movingSamples / carSamples).toFixed(0)} % of cars moving`);
  assert.ok(drivers.stats.removedStuck <= drivers.stats.spawned * 0.05, `${drivers.stats.removedStuck} stuck of ${drivers.stats.spawned}`);
  // No two cars inside each other.
  const cars = drivers.agents.map((agent) => agent.entity.position);
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) assert.ok(Math.hypot(cars[i].x - cars[j].x, cars[i].z - cars[j].z) > 1.5, 'cars overlap');
  }
});

test('gunfire makes drivers flee', () => {
  const world = createTestWorld(junction);
  const drivers = createTrafficDrivers(world.context, { city: world.city, fleet: world.fleet });
  drivers.refill();
  for (let step = 0; step < 300; step += 1) {
    drivers.fixedUpdate(1 / 30);
    world.stepCars(1 / 30);
  }
  const agent = drivers.agents[0];
  drivers.danger(agent.entity.position, 70);
  assert.ok(agent.mood.fleeSeconds > 5);
  const near = drivers.agents.filter((other) => Math.hypot(other.entity.position.x - agent.entity.position.x, other.entity.position.z - agent.entity.position.z) < 50);
  assert.ok(near.every((other) => other.mood.fleeSeconds > 0));
});

test('a siren coming up behind: the car ahead of it signals, slows to the kerb and stops, then drives on', () => {
  const world = createTestWorld(junction);
  const drivers = createTrafficDrivers(world.context, { city: world.city, fleet: world.fleet });
  drivers.refill();
  for (let step = 0; step < 300; step += 1) {
    drivers.fixedUpdate(1 / 30);
    world.stepCars(1 / 30);
  }
  const agent = drivers.agents.find((candidate) => candidate.car.speed > 5) ?? drivers.agents[0];
  const heading = agent.car.heading;
  const fx = Math.sin(heading);
  const fz = -Math.cos(heading);
  // An ambulance with its siren on, 30 m behind on the same line, closing at 18 m/s; it keeps pace
  // 25 m behind once there (it would go round in the real game).
  const p = agent.entity.position;
  const siren = world.entities.add({
    kind: 'vehicle', owner: 'police', position: { x: p.x - fx * 30, y: 0, z: p.z - fz * 30 }, heading: -heading, radius: 2.4,
    tags: ['emergency'], data: { speed: 18, siren: true, driverId: 7 },
  });
  let pulledOver = false;
  let slowest = Infinity;
  let signalledRight = false;
  for (let step = 0; step < 30 * 6; step += 1) {
    const q = agent.entity.position;
    siren.position.x = q.x - fx * 25;
    siren.position.z = q.z - fz * 25;
    drivers.fixedUpdate(1 / 30);
    world.stepCars(1 / 30);
    if (agent.giveWay.mode === 1) pulledOver = true;
    if (agent.controls.indicator === 1) signalledRight = true;
    if (pulledOver) slowest = Math.min(slowest, agent.car.speed);
  }
  assert.ok(pulledOver, 'pulls over');
  assert.ok(signalledRight, 'signals right');
  assert.ok(slowest < 1, `stops (slowest ${slowest.toFixed(2)} m/s)`);
  // The siren switches off and leaves: the driver pulls back out and drives on.
  siren.data.siren = false;
  for (let step = 0; step < 30 * 8; step += 1) {
    drivers.fixedUpdate(1 / 30);
    world.stepCars(1 / 30);
  }
  assert.equal(agent.giveWay.mode, 0, 'back to ordinary driving');
});
