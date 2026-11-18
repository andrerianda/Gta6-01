// Distant traffic: the cars beyond the ring of physics cars, out to the edge of the streamed
// city, so the streets look busy to the end of the view. Each is a point moving along a lane
// route with no physics: it keeps to the speed limit, slows for turns, queues behind the car
// ahead (distant or physics) and waits at red lights and stop signs. It is drawn as one
// instance of its model's far level (distantTrafficBatches.js). A distant car that comes within
// DISTANT_RING.promote of the player becomes a physics car of the fleet at the same place, with
// the same model, colour and speed (trafficDrivers.adopt); a physics car that drives beyond
// DISTANT_RING.demote becomes a distant car again (demote), so the change is not seen.
import * as THREE from 'three';
import { advanceLaneRoute, createLaneRoute, distanceToPieceEnd, routePointAhead, startLaneRoute } from './laneRoute.js';
import { TURN_SPEED, followingSpeed } from './laneFollowing.js';
import { mustHoldAtLine, speedToStopAt } from './junctionRules.js';
import { DISTANT_RING, outOfSight } from './trafficSpawning.js';
import { createDistantTrafficBatches } from './distantTrafficBatches.js';

const CAR_SPACE = 6.2;
const MANAGE_SECONDS = 0.5;
const point = { x: 0, z: 0, dx: 0, dz: -1 };

/**
 * How many distant cars the quality tier and the density allow.
 * @param {{trafficDensity?: number}} tier context.quality.tier.
 * @param {number} scale TRAFFIC_SET_DENSITY scale.
 */
export function distantTrafficCount(tier, scale) {
  return Math.max(0, Math.round(130 * (tier?.trafficDensity ?? 1) * Math.max(0, scale)));
}

/**
 * The outer edge of the distant traffic: the streamed city (its roads) within the draw distance.
 * @param {{streamRadius?: number, drawDistance?: number}} tier context.quality.tier.
 */
export function distantTrafficReach(tier) {
  const reach = Math.min((tier?.streamRadius ?? 520) - 20, (tier?.drawDistance ?? 1000) * 0.6);
  return Math.max(DISTANT_RING.spawn + 60, reach);
}

/**
 * Creates the distant traffic.
 * @param {object} context The game context.
 * @param {{city: object, drivers: object}} parts openWorldCity and the traffic drivers.
 */
export function createDistantTraffic(context, { city, drivers }) {
  const lanes = city.laneGraph;
  const nodes = city.plan.roads.nodes;
  const catalog = context.content.get('vehicleCatalog').VEHICLE_CATALOG;
  const generator = context.random('distantTraffic');
  const random = () => generator.next();
  const cars = [];
  const pool = [];
  const byLane = new Map();
  const candidates = [];
  const cumulative = [];
  const capacityOf = () => distantTrafficCount(context.quality?.tier, densityScale);
  const batches = createDistantTrafficBatches(context.assets, context.view?.layers?.dynamic ?? null, 256);
  let densityScale = 1;
  let manageTimer = 0;
  let filling = true;
  let step = 0;
  const stats = { promoted: 0, demoted: 0, removed: 0 };

  function addCar(laneId, along, modelId, colour, speed) {
    const car = pool.pop() ?? { route: createLaneRoute(lanes, random), colour: new THREE.Color(), colourText: '', x: 0, y: 0, z: 0, heading: 0 };
    startLaneRoute(car.route, laneId, along);
    car.modelId = modelId;
    car.colourText = colour;
    car.colour.set(colour);
    car.speed = speed;
    car.factor = 0.82 + random() * 0.2;
    car.lineWait = 0;
    car.firstLane = laneId;
    place(car);
    car.y = city.groundHeightAt(car.x, car.z);
    cars.push(car);
    return car;
  }

  function removeAt(index) {
    const car = cars[index];
    cars[index] = cars[cars.length - 1];
    cars.pop();
    pool.push(car);
  }

  function place(car) {
    routePointAhead(car.route, 0, point);
    car.x = point.x;
    car.z = point.z;
    car.heading = Math.atan2(point.dx, -point.dz);
  }

  // Cars by the lane they are on (or turning onto, with a negative distance along it), distant
  // and physics alike, for queueing. Arrays are reused.
  function fileByLane() {
    for (const list of byLane.values()) list.length = 0;
    const file = (route, speed) => {
      const first = route.pieces[0];
      const lane = first.lane >= 0 ? first.lane : first.toLane;
      const s = first.lane >= 0 ? route.s : route.s - first.length;
      let list = byLane.get(lane);
      if (!list) byLane.set(lane, (list = []));
      list.push(s, speed);
    };
    for (const car of cars) file(car.route, car.speed);
    for (const agent of drivers.agents) if (agent.route && agent.car) file(agent.route, agent.car.speed);
  }

  // The gap to the nearest car ahead on this lane or the next one, and its speed.
  const ahead = { gap: Infinity, speed: 0 };
  function lookAhead(car) {
    ahead.gap = Infinity;
    ahead.speed = 0;
    const route = car.route;
    const first = route.pieces[0];
    const lane = first.lane >= 0 ? first.lane : first.toLane;
    const mine = first.lane >= 0 ? route.s : route.s - first.length;
    scanLane(byLane.get(lane), mine, true);
    if (ahead.gap === Infinity && first.lane >= 0 && route.count > 1) {
      // Past the junction: positions on the next lane count from its start (negative on the curve into it).
      scanLane(byLane.get(route.pieces[1].toLane), -distanceToPieceEnd(route, 1), false);
    }
  }
  function scanLane(list, from, sameLane) {
    if (!list) return;
    for (let i = 0; i < list.length; i += 2) {
      const gap = list[i] - from;
      if (sameLane && gap <= 0.05) continue;
      if (gap - CAR_SPACE < ahead.gap) {
        ahead.gap = gap - CAR_SPACE;
        ahead.speed = list[i + 1];
      }
    }
  }

  function drive(car, dt, time, perceive) {
    const route = car.route;
    const first = route.pieces[0];
    const laneId = first.lane >= 0 ? first.lane : first.toLane;
    let target = (lanes[laneId]?.speedLimit ?? 13) * car.factor;
    if (first.lane < 0) target = Math.min(target, TURN_SPEED[first.turn] ?? target);
    else {
      if (laneId !== car.firstLane) {
        car.firstLane = laneId;
        car.lineWait = 0;
      }
      const lane = lanes[laneId];
      const distance = distanceToPieceEnd(route, 0);
      const next = route.pieces[1];
      if (next && next.turn !== 'straight' && route.count > 1) target = Math.min(target, Math.sqrt((TURN_SPEED[next.turn] ?? 7) ** 2 + 5 * Math.max(0, distance)));
      const signal = lane.signalNode >= 0 ? nodes[lane.signalNode].signal : null;
      if (mustHoldAtLine(lane, signal, time, distance, car.speed, car.lineWait)) {
        target = Math.min(target, speedToStopAt(distance - car.speed * 0.3));
        if (distance < 4 && car.speed < 0.6) car.lineWait += dt;
      }
    }
    if (perceive) {
      lookAhead(car);
      car.gap = ahead.gap;
      car.leaderSpeed = ahead.speed;
    } else car.gap -= (car.speed - car.leaderSpeed) * dt;
    const follow = followingSpeed(car.gap, car.leaderSpeed, car.speed);
    if (follow < target) target = follow;
    const change = target - car.speed;
    car.speed = Math.max(0, car.speed + Math.max(-7 * dt, Math.min(2.4 * dt, change)));
    if (car.speed > 0) advanceLaneRoute(route, car.speed * dt);
    place(car);
  }

  function spawnSome(centre, eye, count, reach) {
    candidates.length = 0;
    cumulative.length = 0;
    let total = 0;
    const index = drivers.spawnIndex;
    const cell = 64;
    const x0 = Math.floor((centre.x - reach) / cell);
    const x1 = Math.floor((centre.x + reach) / cell);
    const z0 = Math.floor((centre.z - reach) / cell);
    const z1 = Math.floor((centre.z + reach) / cell);
    for (let cx = x0; cx <= x1; cx += 1) {
      for (let cz = z0; cz <= z1; cz += 1) {
        const slots = index.cells.get((cx + 4096) * 8192 + (cz + 4096));
        if (!slots) continue;
        for (const slot of slots) {
          const distance = Math.hypot(slot.x - centre.x, slot.z - centre.z);
          if (distance < DISTANT_RING.spawn || distance > reach) continue;
          total += slot.weight;
          candidates.push(slot);
          cumulative.push(total);
        }
      }
    }
    let made = 0;
    for (let attempt = 0; attempt < count * 3 && made < count && total > 0; attempt += 1) {
      const pick = random() * total;
      let low = 0;
      let high = cumulative.length - 1;
      while (low < high) {
        const middle = (low + high) >> 1;
        if (cumulative[middle] > pick) high = middle;
        else low = middle + 1;
      }
      const slot = candidates[low];
      if (!filling && !outOfSight(slot.x, slot.z, eye)) continue;
      const queue = byLane.get(slot.lane);
      let clear = true;
      if (queue) for (let i = 0; i < queue.length; i += 2) if (Math.abs(queue[i] - slot.along) < 16) clear = false;
      if (!clear) continue;
      const modelId = drivers.pickModel(slot.x, slot.z, random());
      if (!modelId) continue;
      const colours = catalog[modelId]?.colors;
      const colour = colours?.length ? colours[Math.floor(random() * colours.length) % colours.length] : '#c8ccd0';
      addCar(slot.lane, slot.along, modelId, colour, (lanes[slot.lane].speedLimit ?? 12) * 0.8);
      if (!byLane.has(slot.lane)) byLane.set(slot.lane, []);
      byLane.get(slot.lane).push(slot.along, 0);
      made += 1;
    }
  }

  function manage() {
    const centre = drivers.centre;
    const eye = drivers.eye;
    const reach = distantTrafficReach(context.quality?.tier);
    for (let i = cars.length - 1; i >= 0; i -= 1) {
      const car = cars[i];
      const distance = Math.hypot(car.x - centre.x, car.z - centre.z);
      if (distance > reach * 1.1) {
        stats.removed += 1;
        removeAt(i);
      } else if (distance < DISTANT_RING.promote && car.route.pieces[0].lane >= 0) {
        if (drivers.adopt(car.route.pieces[0].lane, car.route.s, car.modelId, car.colourText, car.speed)) {
          stats.promoted += 1;
          removeAt(i);
        } else if (distance < 60 || (distance < 120 && outOfSight(car.x, car.z, eye))) {
          stats.removed += 1;
          removeAt(i);
        }
      }
    }
    const missing = capacityOf() - cars.length;
    if (missing > 0) spawnSome(centre, eye, Math.min(missing, filling ? missing : 6), reach);
    filling = false;
  }

  return {
    stats,
    batches,
    get count() {
      return cars.length;
    },

    fixedUpdate(dt) {
      step += 1;
      const time = context.simulation.time;
      fileByLane();
      manageTimer -= dt;
      if (manageTimer <= 0) {
        manageTimer = MANAGE_SECONDS;
        manage();
      }
      for (let i = 0; i < cars.length; i += 1) {
        const car = cars[i];
        drive(car, dt, time, (i + step) % 3 === 0);
        if ((i + step) % 20 === 0) car.y = city.groundHeightAt(car.x, car.z);
      }
    },

    /**
     * Draws the cars where they are now; once per frame.
     * @param {?(batches: object) => void} [more] Adds other instances (the far parked cars).
     */
    update(more) {
      batches.begin();
      for (const car of cars) batches.add(car.modelId, car.x, car.y, car.z, car.heading, car.colour);
      more?.(batches);
      batches.end((context.atmosphere?.state?.nightFactor ?? 0) > 0.35);
    },

    /**
     * A physics car of the traffic driving away: becomes a distant car if there is room.
     * @returns {boolean} True when it was taken (the drivers then remove the physics car).
     */
    demote(agent) {
      const first = agent.route.pieces[0];
      const data = agent.entity?.data;
      if (first.lane < 0 || !data?.modelId || cars.length >= capacityOf() + 10) return false;
      addCar(first.lane, agent.route.s, data.modelId, data.colour ?? '#c8ccd0', Math.max(0, agent.car.speed));
      stats.demoted += 1;
      return true;
    },

    /** After a cut: fill the ring at once on the next pass. */
    refill() {
      cars.splice(0).forEach((car) => pool.push(car));
      filling = true;
      manageTimer = 0;
    },
    setDensity(scale) {
      densityScale = Math.max(0, Number(scale) || 0);
      manageTimer = 0;
    },
    dispose() {
      cars.length = 0;
      batches.dispose();
    },
  };
}
