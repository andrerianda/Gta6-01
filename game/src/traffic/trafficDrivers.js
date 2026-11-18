// The drivers of Marazul's traffic: keeps the right number of cars around the player (spawned
// out of sight on the lane graph, chosen by district, removed when far behind or hopelessly
// stuck), and drives each one through the vehicle fleet's controls: where it is on its route,
// the stop line ahead (signals, stop signs, a left turn waiting for oncoming cars), the car or
// person in its way (roadAheadPerception.js), sirens and chases (sirenGiveWay.js), lane changes
// (laneChanges.js) and its driver's mood, turned into a wanted speed and a steering target every
// fixed step. Perception runs for a third of the cars per step. trafficFlow.js is the system
// around it.
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { ENTITY_KINDS, ENTITY_TAGS } from '../core/entities/entityKinds.js';
import {
  createLaneRoute, distanceToPieceEnd, normaliseLaneRoute, pointAlongPolyline, projectOnPolyline, routePointAhead, startLaneRoute,
} from './laneRoute.js';
import { TURN_SPEED, applyPedals, cruiseSpeed, followingSpeed, lookaheadDistance, pursuitSteer, steeringLockAt } from './laneFollowing.js';
import { COMFORT_BRAKING, mustHoldAtLine, signalLightAt, speedToStopAt } from './junctionRules.js';
import { SAMPLE_COUNT, createRoadAheadPerception } from './roadAheadPerception.js';
import {
  DESPAWN_DISTANCE, DISTANT_RING, SPAWN_CLEARANCE, buildTrafficMixes, createLaneSpawnIndex, findTrafficSpawn, outOfSight, pickTrafficModel, trafficTargetCount,
} from './trafficSpawning.js';
import { createDriverMood, feelRammed, hearDanger, moodDriving, updateDriverMood } from './driverReactions.js';
import { createLaneChangeState, createLaneChanger } from './laneChanges.js';
import { addSiren, createGiveWayState, createSirenList, giveWayDriving, senseSirens } from './sirenGiveWay.js';

/**
 * Where a motorcycle rides in its lane: metres left of the lane's centre (the left wheel track,
 * where a rider sees and is seen), between these two, chosen per rider.
 */
export const BIKE_LANE_BIAS = Object.freeze({ min: 0.35, max: 0.85 });

/**
 * Whether a fleet car is ridden (the physics' Motorcycle: mount() puts a rider on and holds it up).
 * @param {{car?: {mount?: Function}}} record A fleet record.
 * @returns {boolean}
 */
export function isRiddenVehicle(record) {
  return typeof record?.car?.mount === 'function';
}

const point = { x: 0, z: 0, dx: 0, dz: -1 };
const projection = { s: 0, lateral: 0, distance: 0 };
const vehicleFilter = { kind: ENTITY_KINDS.VEHICLE };
const movingFilter = { kind: ENTITY_KINDS.VEHICLE, withoutTag: ENTITY_TAGS.PARKED };

/**
 * Creates the traffic drivers.
 * @param {object} context The game context.
 * @param {{city: object, fleet: object, setLamp?: Function}} systems openWorldCity and vehicles, and the
 *   fleet's setVehicleLamp(lamps, group, on) to blink the indicators (optional).
 */
export function createTrafficDrivers(context, { city, fleet, setLamp = null }) {
  const lanes = city.laneGraph;
  const nodes = city.plan.roads.nodes;
  // The shared signal clock of openWorldCity, so cars, walkers and lamps agree (null in older builds and tests).
  const clock = typeof city.signals?.signalLight === 'function' ? city.signals : null;
  const catalog = context.content.get('vehicleCatalog').VEHICLE_CATALOG;
  const districts = context.content.get('cityDistricts').CITY_DISTRICTS;
  const generator = context.random('traffic');
  const random = () => generator.next();
  const agents = [];
  const pool = [];
  const released = [];
  const byVehicle = new Map();
  const { seeAhead, mustWaitForOncoming } = createRoadAheadPerception(context.entities, byVehicle);
  const eye = { x: 0, z: 0, forwardX: 0, forwardZ: -1, cosHalfView: 0.5 };
  const centre = { x: 0, z: 0 };
  let mixes = buildTrafficMixes(districts, catalog, (id) => Boolean(context.assets?.has?.(id)), context.clock?.timeOfDay ?? 12);
  let densityScale = 1;
  let manageTimer = 0;
  let fillUntil = 0;
  let step = 0;
  let playerId = -1;
  const stats = { spawned: 0, removed: 0, removedStuck: 0, demoted: 0, pulledOut: 0 };
  const DEMOTE_DISTANCE = DISTANT_RING.demote;
  const spawnIndex = createLaneSpawnIndex(lanes, city.plan.roads.segments);
  const changer = createLaneChanger(lanes, (x, z, radius, visit) => context.entities.forEachWithin(x, z, radius, visit, vehicleFilter), random);
  const newAgent = () => ({ route: createLaneRoute(lanes, random), mood: {}, change: createLaneChangeState(), giveWay: createGiveWayState(), samples: new Float64Array(SAMPLE_COUNT * 2) });
  // This step's sirens (vehicles tagged emergency with the siren on) and, with stars, the lead's car.
  const sirens = createSirenList();
  const wanted = context.systems?.find?.('wantedLevel') ?? null;
  const gatherSiren = (entity) => {
    const speed = Math.abs(entity.data?.speed ?? 0);
    if (entity.data?.siren === false || speed < 3) return;
    addSiren(sirens, entity.position.x, entity.position.z, -Math.sin(entity.heading) * speed, -Math.cos(entity.heading) * speed, entity.tags.has(ENTITY_TAGS.POLICE));
  };
  function gatherSirens() {
    sirens.count = 0;
    context.entities.withTag(ENTITY_TAGS.EMERGENCY).forEach(gatherSiren);
    const lead = context.entities.firstWithTag(ENTITY_TAGS.PLAYER);
    const speed = Math.abs(lead?.data?.speed ?? 0);
    if (lead && lead.kind === ENTITY_KINDS.VEHICLE && (wanted?.level ?? 0) > 0 && speed > 6) {
      addSiren(sirens, lead.position.x, lead.position.z, -Math.sin(lead.heading) * speed, -Math.cos(lead.heading) * speed, 'only');
    }
  }

  // Clear of moving cars by SPAWN_CLEARANCE; a parked car blocks only when it stands in the lane
  // (the kerbside rows beside a lane used to keep every slot next to them empty).
  const isClear = (x, z) => context.entities.countWithin(x, z, SPAWN_CLEARANCE, movingFilter) === 0
    && context.entities.countWithin(x, z, 2.6, vehicleFilter) === 0;

  function watchEye() {
    const player = context.entities.firstWithTag(ENTITY_TAGS.PLAYER);
    const focus = player ? player.position : context.focus.position;
    playerId = player ? player.id : -1;
    centre.x = focus.x;
    centre.z = focus.z;
    const camera = context.view?.camera;
    if (!camera) return;
    const m = camera.matrixWorld.elements;
    const length = Math.hypot(m[8], m[10]) || 1;
    eye.x = m[12];
    eye.z = m[14];
    eye.forwardX = -m[8] / length;
    eye.forwardZ = -m[10] / length;
    if (player && Math.hypot(eye.x - centre.x, eye.z - centre.z) > 30) {
      // The camera has not caught up with a cut yet (it follows in update): it will look the
      // lead's way from behind, so fill and hide cars for that view, not the old one.
      eye.forwardX = -Math.sin(player.heading);
      eye.forwardZ = -Math.cos(player.heading);
      eye.x = centre.x - eye.forwardX * 3;
      eye.z = centre.z - eye.forwardZ * 3;
    }
    const half = Math.atan(Math.tan(((camera.fov ?? 60) * Math.PI) / 360) * (camera.aspect ?? 1.6));
    eye.cosHalfView = Math.cos(Math.min(half + 0.25, Math.PI * 0.9));
  }

  function spawnOne(filling) {
    const place = findTrafficSpawn(spawnIndex, centre, random, eye, isClear, 6, filling);
    if (!place) return false;
    const modelId = pickTrafficModel(mixes, city.districtAt(place.x, place.z), random());
    if (!modelId) return false;
    // At a cut the cars are already rolling (half the limit; the drivers brake for what is ahead).
    return placeCar(place.lane, place.along, modelId, undefined, filling ? (lanes[place.lane]?.speedLimit || 13.9) * 0.5 : 0);
  }

  // A physics car on a lane at a distance along it, already rolling at `speed`.
  function placeCar(laneId, along, modelId, colour, speed) {
    const agent = pool.pop() ?? newAgent();
    startLaneRoute(agent.route, laneId, along);
    routePointAhead(agent.route, 0, point);
    const heading = Math.atan2(point.dx, -point.dz);
    const vehicleId = fleet.spawn({ modelId, position: { x: point.x, z: point.z }, heading, colour, parked: false, ownerSystem: 'traffic' });
    if (vehicleId === null || vehicleId === undefined) {
      pool.push(agent);
      return false;
    }
    const record = fleet.get(vehicleId);
    context.entities.addTag(record.entity, ENTITY_TAGS.TRAFFIC);
    stats.spawned += 1;
    const velocity = speed > 0 ? record.car?.body?.linearVelocity : null;
    if (velocity) {
      velocity.x = Math.sin(heading) * speed;
      velocity.z = -Math.cos(heading) * speed;
    }
    attach(agent, vehicleId, record);
    return true;
  }

  // Gives a fleet car a driver: the agent (its route already started) drives it from now on.
  function attach(agent, vehicleId, record) {
    // A motorcycle gets its rider (held upright, leaning into turns) and rides left of the lane centre.
    const bike = isRiddenVehicle(record);
    if (bike) record.car.mount();
    Object.assign(agent, {
      bike, laneBias: bike ? -(BIKE_LANE_BIAS.min + random() * (BIKE_LANE_BIAS.max - BIKE_LANE_BIAS.min)) : 0,
      vehicleId, record, entity: record.entity, car: record.car, controls: record.controls, index: agents.length,
      lineWait: 0, lineDistance: Infinity, cornerLimit: Infinity, gap: Infinity, leaderSpeed: 0, blockerId: -1,
      blockedByPlayer: false, blockerIsVehicle: false, blockerParked: false, stuckSeconds: 0, reportedBlocked: false, lastFirstLane: agent.route.pieces[0].lane,
    });
    createDriverMood(random, agent.mood);
    createLaneChangeState(agent.change);
    createGiveWayState(agent.giveWay);
    agent.change.cooldown = 1 + random() * 4;
    agents.push(agent);
    byVehicle.set(vehicleId, agent);
  }

  function drop(agent, removeVehicle) {
    const at = agents.indexOf(agent);
    if (at >= 0) agents.splice(at, 1);
    byVehicle.delete(agent.vehicleId);
    if (removeVehicle) fleet.remove(agent.vehicleId);
    agent.record = agent.entity = agent.car = agent.controls = null;
    pool.push(agent);
  }

  function manage() {
    const target = trafficTargetCount(context.quality?.tier, densityScale);
    const filling = context.simulation.time < fillUntil;
    for (let i = agents.length - 1; i >= 0; i -= 1) {
      const agent = agents[i];
      const p = agent.entity.position;
      const distance = Math.hypot(p.x - centre.x, p.z - centre.z);
      // A bike whose rider was thrown is let go where it fell (removed later, far and unseen).
      if (thrown(agent)) {
        Object.assign(agent.controls, { throttle: 0, steer: 0, brake: 1, indicator: 0 });
        released.push(agent.vehicleId);
        drop(agent, false);
        continue;
      }
      const hidden = outOfSight(p.x, p.z, eye);
      const ruined = agent.record.wrecked || agent.stuckSeconds > 40;
      // Far enough to be one of the distant cars: handed over at the same place and speed.
      if (distance > DEMOTE_DISTANCE && !ruined && agent.stuckSeconds < 8 && drivers.demote?.(agent)) {
        stats.demoted += 1;
        drop(agent, true);
        continue;
      }
      if (distance > DESPAWN_DISTANCE || (hidden && (ruined || (agents.length > target && distance > 120)))) {
        if (agent.stuckSeconds > 40) stats.removedStuck += 1;
        else stats.removed += 1;
        drop(agent, true);
      }
    }
    for (let i = released.length - 1; i >= 0; i -= 1) {
      const entity = fleet.get(released[i])?.entity;
      if (!entity) released.splice(i, 1);
      else if (entity.data.driverId === null && !entity.tags.has(ENTITY_TAGS.PLAYER) && !entity.tags.has(ENTITY_TAGS.PERSISTENT)
        && !entity.tags.has(ENTITY_TAGS.MISSION) && Math.hypot(entity.position.x - centre.x, entity.position.z - centre.z) > DESPAWN_DISTANCE + 40
        && outOfSight(entity.position.x, entity.position.z, eye)) {
        fleet.remove(released[i]);
        released.splice(i, 1);
      }
    }
    let budget = filling ? 8 : 2;
    while (agents.length < target && budget > 0) {
      budget -= 1;
      if (!spawnOne(filling)) break;
    }
  }

  // Where the car is on its route; restarts the route from the nearest lane when it has strayed.
  function localise(agent) {
    const route = agent.route;
    const p = agent.entity.position;
    projectOnPolyline(route.pieces[0].points, p.x, p.z, projection);
    let s = projection.s;
    let off = projection.distance;
    if (s >= route.pieces[0].length - 0.3 && route.count > 1) {
      const first = route.pieces[0].length;
      projectOnPolyline(route.pieces[1].points, p.x, p.z, projection);
      if (projection.distance <= off + 0.5) {
        s = first + projection.s;
        off = projection.distance;
      }
    }
    if (off > 7) {
      const hit = city.nearestLane(p.x, p.z, 30);
      if (hit) startLaneRoute(route, hit.lane.id ?? hit.lane, hit.along);
      changer.reset(agent.change);
      return;
    }
    route.s = s;
    normaliseLaneRoute(route);
    if (route.pieces[0].lane !== agent.lastFirstLane) {
      agent.lastFirstLane = route.pieces[0].lane;
      agent.lineWait = 0;
    }
  }

  function perceive(agent, time, obeysSignals) {
    const route = agent.route;
    const speed = agent.car.speed;
    agent.lineDistance = Infinity;
    agent.cornerLimit = route.pieces[0].lane < 0 ? TURN_SPEED[route.pieces[0].turn] : Infinity;
    for (let i = 0; i < route.count; i += 1) {
      const piece = route.pieces[i];
      if (piece.lane < 0) continue;
      const distance = distanceToPieceEnd(route, i);
      if (distance > 75) break;
      const lane = lanes[piece.lane];
      const next = route.pieces[i + 1];
      if (next && next.turn !== 'straight') {
        const turnSpeed = TURN_SPEED[next.turn];
        agent.cornerLimit = Math.min(agent.cornerLimit, Math.sqrt(turnSpeed * turnSpeed + 2 * COMFORT_BRAKING * Math.max(0, distance)));
      }
      const signal = lane.signalNode >= 0 ? nodes[lane.signalNode].signal : null;
      const shown = clock && lane.signalNode >= 0 ? clock.signalLight(lane.signalNode, lane.phase) : null;
      if (obeysSignals && mustHoldAtLine(lane, signal, time, distance, speed, i === 0 ? agent.lineWait : 0, shown)) {
        agent.lineDistance = distance;
        break;
      }
      if (next && next.turn === 'left' && distance < 22 && mustWaitForOncoming(agent)) {
        agent.lineDistance = distance;
        break;
      }
    }
    seeAhead(agent);
    if (sirens.count > 0 || agent.giveWay.mode !== 0) {
      const heading = agent.car.heading;
      const p = agent.entity.position;
      senseSirens(agent.giveWay, sirens, p.x, p.z, Math.sin(heading), -Math.cos(heading), speed, random());
    }
  }

  // A crash threw the rider off the bike: it lies where it fell, nobody rides it on.
  const thrown = (agent) => agent.bike && agent.car.riderSeated === false;

  function drive(agent, dt, time, perceiveNow) {
    if (agent.record.wrecked || thrown(agent)) {
      agent.controls.throttle = 0;
      agent.controls.brake = 1;
      return;
    }
    localise(agent);
    const mood = agent.mood;
    const driving = moodDriving(mood);
    const car = agent.car;
    const speed = car.speed;
    if (perceiveNow) perceive(agent, time, driving.obeysSignals);
    else {
      // Between looks the line and the car ahead come closer by what was driven.
      agent.lineDistance -= speed * dt;
      agent.gap -= (speed - agent.leaderSpeed) * dt;
    }
    let lane = lanes[agent.route.pieces[0].lane >= 0 ? agent.route.pieces[0].lane : agent.route.pieces[0].toLane];
    // Sirens: signal, slow, into the kerb lane, to the kerb and stop; a pursuit: brake hard and swerve.
    const give = giveWayDriving(agent.giveWay, dt, !(lane.rightLane >= 0));
    const calm = !give.active && !driving.holds && Math.abs(driving.offset) < 0.2 && !(mood.fleeSeconds > 0);
    changer.update(agent, dt, cruiseSpeed(lane.speedLimit, mood.temper) * driving.speedFactor, calm, perceiveNow, time, give.moveRight ? 1 : 0);
    lane = lanes[agent.route.pieces[0].lane >= 0 ? agent.route.pieces[0].lane : agent.route.pieces[0].toLane];
    let target = cruiseSpeed(lane.speedLimit, mood.temper) * driving.speedFactor;
    if (agent.cornerLimit < target) target = agent.cornerLimit;
    const follow = followingSpeed(agent.gap, agent.leaderSpeed, speed);
    if (follow < target) target = follow;
    const atLine = agent.lineDistance < Infinity ? speedToStopAt(agent.lineDistance - speed * 0.3) : Infinity;
    if (atLine < target) target = atLine;
    if (give.speedLimit < target) target = give.speedLimit;
    if (driving.holds) target = 0;
    if (agent.lineDistance < 4 && speed < 0.6) agent.lineWait += dt;
    const held = agent.lineDistance < Infinity || driving.holds || give.active;
    agent.stuckSeconds = speed < 0.5 && !held && agent.gap < 12 ? agent.stuckSeconds + dt : 0;
    if (agent.stuckSeconds > 8 && !agent.reportedBlocked) {
      agent.reportedBlocked = true;
      const p = agent.entity.position;
      context.events.queue(GAME_EVENTS.TRAFFIC_BLOCKED, { position: { x: p.x, y: p.y, z: p.z }, vehicleId: agent.vehicleId, seconds: agent.stuckSeconds });
    } else if (agent.stuckSeconds === 0) agent.reportedBlocked = false;

    const first = agent.route.pieces[0];
    const ahead = lookaheadDistance(speed, first.lane < 0 && first.turn !== 'straight');
    routePointAhead(agent.route, ahead, point);
    const offset = agent.laneBias + driving.offset + give.offset + changer.steerOffset(agent.change, speed, ahead);
    agent.controls.indicator = give.indicator || changer.indicatorOf(agent.change);
    const tx = point.x - point.dz * offset;
    const tz = point.z + point.dx * offset;
    const tuning = car.tuning;
    const p = agent.entity.position;
    agent.controls.steer = pursuitSteer(p.x, p.z, car.heading, tx, tz, tuning.wheelbase, steeringLockAt(tuning, speed));
    applyPedals(target, speed, agent.controls, mood.fleeSeconds > 0 ? 0.95 : mood.eagerness);
    if (give.brakeHard && speed > 0.5) {
      agent.controls.throttle = 0;
      agent.controls.brake = 1;
    }
    agent.controls.horn = updateDriverMood(mood, dt, agent.blockedByPlayer && speed < 1.5, time);
  }

  const drivers = {
    get count() {
      return agents.length;
    },
    agents,
    /** Totals since boot: cars spawned, removed when far or surplus, removed after being stuck, handed to the distant traffic. */
    stats,
    /** The player's place and the camera on the ground plane, as of the last step (read only). */
    centre,
    eye,
    /** The lane spawn slots (trafficSpawning.createLaneSpawnIndex). */
    spawnIndex,
    /** Set by the distant traffic: takes over a physics car driving away (returns true when it did). */
    demote: null,
    /** A traffic model for a place: the district's mix at this hour. */
    pickModel: (x, z, roll) => pickTrafficModel(mixes, city.districtAt(x, z), roll),

    /**
     * A distant car arriving: becomes a physics car if the count allows and the place is clear.
     * @returns {boolean} True when the car was placed.
     */
    adopt(laneId, along, modelId, colour, speed) {
      if (agents.length >= trafficTargetCount(context.quality?.tier, densityScale) + 4) return false;
      pointAlongPolyline(lanes[laneId].points, along, point);
      if (context.entities.countWithin(point.x, point.z, 5.5, vehicleFilter) > 0) return false;
      return placeCar(laneId, along, modelId, colour, speed);
    },

    /**
     * A parked car pulls out: a driver takes it onto the lane beside it.
     * @returns {boolean} True when the car is now driven by traffic.
     */
    pullOut(vehicleId, laneId, along) {
      const record = fleet.get(vehicleId);
      // Two over the count: the streets are always at it, so pull-outs never happened.
      if (!record || byVehicle.has(vehicleId) || agents.length >= trafficTargetCount(context.quality?.tier, densityScale) + 2) return false;
      const agent = pool.pop() ?? newAgent();
      startLaneRoute(agent.route, laneId, along);
      context.entities.removeTag(record.entity, ENTITY_TAGS.PARKED);
      context.entities.addTag(record.entity, ENTITY_TAGS.TRAFFIC);
      record.controls.handbrake = 0;
      attach(agent, vehicleId, record);
      // Out of the parking lane along an eased curve, indicating, instead of a jerk of the wheel.
      projectOnPolyline(lanes[laneId].points, record.entity.position.x, record.entity.position.z, projection);
      changer.easeInto(agent.change, projection.lateral);
      stats.pulledOut += 1;
      return true;
    },

    /**
     * The cars traffic drives within `radius` metres of the camera (the pedestrians system seats a
     * driver at their wheels; entity.data.driverId stays null). Fills and returns `out`.
     * @param {number[]} [out]
     * @param {number} [radius]
     */
    nearCars(out = [], radius = 45) {
      out.length = 0;
      for (let i = 0; i < agents.length; i += 1) {
        const p = agents[i].entity.position;
        if (Math.hypot(p.x - eye.x, p.z - eye.z) <= radius) out.push(agents[i].vehicleId);
      }
      return out;
    },

    fixedUpdate(dt) {
      step += 1;
      const time = context.simulation.time;
      watchEye();
      gatherSirens();
      manageTimer -= dt;
      if (manageTimer <= 0) {
        manageTimer = 0.25;
        manage();
      }
      for (let i = 0; i < agents.length; i += 1) drive(agents[i], dt, time, (i + step) % 3 === 0);
    },

    /** After the fleet drew its lamps: blink the indicators of cars changing lanes (controls.indicator). */
    lateUpdate() {
      if (!setLamp) return;
      const on = context.simulation.time % 0.8 < 0.45;
      for (let i = 0; i < agents.length; i += 1) {
        const agent = agents[i];
        const side = agent.controls.indicator;
        if (side && agent.record.lamps?.lit) setLamp(agent.record.lamps, side < 0 ? 'lamp_indicator_l' : 'lamp_indicator_r', on);
      }
    },
    /** Lane changes since boot: {started, merged, abandoned}. */
    laneChanges: changer.stats,

    /** After a cut (teleport, boot, quality change): fill the streets at once for two seconds. */
    refill() {
      fillUntil = context.simulation.time + 2;
      manageTimer = 0;
    },
    setDensity(scale) {
      densityScale = Math.max(0, Number(scale) || 0);
      manageTimer = 0;
    },
    rebuildMixes() {
      mixes = buildTrafficMixes(districts, catalog, (id) => Boolean(context.assets?.has?.(id)), context.clock?.timeOfDay ?? 12);
    },

    /** A shot or blast: drivers near it flee. */
    danger(position, radius) {
      for (const agent of agents) {
        const p = agent.entity.position;
        hearDanger(agent.mood, Math.hypot(p.x - position.x, p.z - position.z), radius);
      }
    },
    /** VEHICLE_COLLIDED: a rammed driver gets angry; returns the hook payload when one climbs out. */
    collided({ vehicleId, otherId, speed }) {
      for (const [mine, other] of [[vehicleId, otherId], [otherId, vehicleId]]) {
        const agent = byVehicle.get(mine);
        if (!agent) continue;
        const byPlayer = other !== null && other !== undefined && other === playerId;
        if (feelRammed(agent.mood, speed ?? 0, byPlayer, random)) {
          const p = agent.entity.position;
          return { vehicleId: mine, position: { x: p.x, y: p.y, z: p.z }, heading: agent.car.heading, targetId: playerId };
        }
      }
      return null;
    },
    /** The player took a traffic car: it is the player's now, removed only once abandoned far away. */
    release(vehicleId) {
      const agent = byVehicle.get(vehicleId);
      if (!agent) return;
      drop(agent, false);
      released.push(vehicleId);
    },
    forget(vehicleId) {
      const agent = byVehicle.get(vehicleId);
      if (agent) drop(agent, false);
    },
    /** The light of a junction's phase: from the shared signal clock (openWorldCity.signals) when it exists. */
    signalLight: (nodeId, phase) => (clock ? clock.signalLight(nodeId, phase) : signalLightAt(nodes[nodeId]?.signal ?? null, phase, context.simulation.time)),
    removeAll() {
      while (agents.length) drop(agents[agents.length - 1], true);
    },
  };
  return drivers;
}
