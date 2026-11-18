// The drivers of Marazul's traffic: keeps the right number of cars around the player (spawned
// out of sight on the lane graph, chosen by district, removed when far behind or hopelessly
// stuck), and drives each one through the vehicle fleet's controls: where it is on its route,
// the stop line ahead (signals, stop signs, a left turn waiting for oncoming cars), the car or
// person in its way, sirens, and its driver's mood, turned into a wanted speed and a steering
// target every fixed step. Perception runs for a third of the cars per step. trafficFlow.js is
// the system around it.
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { ENTITY_KINDS, ENTITY_TAGS } from '../core/entities/entityKinds.js';
import { createLaneRoute, distanceToPieceEnd, normaliseLaneRoute, projectOnPolyline, routePointAhead, startLaneRoute } from './laneRoute.js';
import { TURN_SPEED, applyPedals, cruiseSpeed, followingSpeed, lookaheadDistance, pursuitSteer, steeringLockAt } from './laneFollowing.js';
import { COMFORT_BRAKING, mustHoldAtLine, mustYieldLeftTurn, signalLightAt, speedToStopAt } from './junctionRules.js';
import { DESPAWN_DISTANCE, SPAWN_CLEARANCE, buildTrafficMixes, findTrafficSpawn, outOfSight, pickTrafficModel, trafficTargetCount } from './trafficSpawning.js';
import { createDriverMood, feelRammed, hearDanger, hearSiren, moodDriving, updateDriverMood } from './driverReactions.js';

const SAMPLE_STEP = 3;
const SAMPLE_COUNT = 13;
const SEE_AHEAD = 42;
const point = { x: 0, z: 0, dx: 0, dz: -1 };
const projection = { s: 0, lateral: 0, distance: 0 };
const vehicleFilter = { kind: ENTITY_KINDS.VEHICLE };

/**
 * Creates the traffic drivers.
 * @param {object} context The game context.
 * @param {{city: object, fleet: object}} systems openWorldCity and vehicles.
 */
export function createTrafficDrivers(context, { city, fleet }) {
  const lanes = city.laneGraph;
  const nodes = city.plan.roads.nodes;
  const catalog = context.content.get('vehicleCatalog').VEHICLE_CATALOG;
  const districts = context.content.get('cityDistricts').CITY_DISTRICTS;
  const generator = context.random('traffic');
  const random = () => generator.next();
  const agents = [];
  const pool = [];
  const released = [];
  const byVehicle = new Map();
  const eye = { x: 0, z: 0, forwardX: 0, forwardZ: -1, cosHalfView: 0.5 };
  const centre = { x: 0, z: 0 };
  let mixes = buildTrafficMixes(districts, catalog, (id) => Boolean(context.assets?.has?.(id)), context.clock?.timeOfDay ?? 12);
  let densityScale = 1;
  let manageTimer = 0;
  let fillUntil = 0;
  let step = 0;
  let playerId = -1;

  const isClear = (x, z) => context.entities.countWithin(x, z, SPAWN_CLEARANCE, vehicleFilter) === 0;

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
    const half = Math.atan(Math.tan(((camera.fov ?? 60) * Math.PI) / 360) * (camera.aspect ?? 1.6));
    eye.cosHalfView = Math.cos(Math.min(half + 0.25, Math.PI * 0.9));
  }

  function spawnOne(filling) {
    const place = findTrafficSpawn(city, centre, random, filling ? null : eye, isClear);
    if (!place) return false;
    const modelId = pickTrafficModel(mixes, city.districtAt(place.x, place.z), random());
    if (!modelId) return false;
    const agent = pool.pop() ?? { route: createLaneRoute(lanes, random), mood: {}, samples: new Float64Array(SAMPLE_COUNT * 2) };
    startLaneRoute(agent.route, place.lane, place.along);
    routePointAhead(agent.route, 0, point);
    const vehicleId = fleet.spawn({ modelId, position: { x: point.x, z: point.z }, heading: Math.atan2(point.dx, -point.dz), ownerSystem: 'traffic' });
    if (vehicleId === null || vehicleId === undefined) {
      pool.push(agent);
      return false;
    }
    const record = fleet.get(vehicleId);
    context.entities.addTag(record.entity, ENTITY_TAGS.TRAFFIC);
    Object.assign(agent, {
      vehicleId, record, entity: record.entity, car: record.car, controls: record.controls, index: agents.length,
      lineWait: 0, lineDistance: Infinity, cornerLimit: Infinity, gap: Infinity, leaderSpeed: 0, blockerId: -1,
      blockedByPlayer: false, stuckSeconds: 0, reportedBlocked: false, lastFirstLane: agent.route.pieces[0].lane,
    });
    createDriverMood(random, agent.mood);
    agents.push(agent);
    byVehicle.set(vehicleId, agent);
    return true;
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
      const hidden = outOfSight(p.x, p.z, eye);
      const ruined = agent.record.wrecked || agent.stuckSeconds > 40;
      if (distance > DESPAWN_DISTANCE || (hidden && (ruined || (agents.length > target && distance > 120)))) drop(agent, true);
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
      if (obeysSignals && mustHoldAtLine(lane, signal, time, distance, speed, i === 0 ? agent.lineWait : 0)) {
        agent.lineDistance = distance;
        break;
      }
      if (next && next.turn === 'left' && distance < 22 && mustWaitForOncoming(agent)) {
        agent.lineDistance = distance;
        break;
      }
    }
    seeAhead(agent);
  }

  // The nearest oncoming car ahead (for a left turn): one visitor reused, no allocation per step.
  const facing = { agent: null, fx: 0, fz: 0, distance: Infinity, speed: 0, swerve: 0 };
  function visitOncoming(other) {
    const agent = facing.agent;
    if (other === agent.entity) return;
    const p = agent.entity.position;
    const ahead = (other.position.x - p.x) * facing.fx + (other.position.z - p.z) * facing.fz;
    const moving = other.data?.speed ?? 0;
    if (ahead < 2 || moving < 1 || Math.cos(-other.heading - agent.car.heading) > -0.7) return;
    if (ahead < facing.distance) {
      facing.distance = ahead;
      facing.speed = moving;
    }
  }
  function mustWaitForOncoming(agent) {
    const p = agent.entity.position;
    facing.agent = agent;
    facing.fx = Math.sin(agent.car.heading);
    facing.fz = -Math.cos(agent.car.heading);
    facing.distance = Infinity;
    facing.speed = 0;
    context.entities.forEachWithin(p.x, p.z, 60, visitOncoming, vehicleFilter);
    return mustYieldLeftTurn(facing.distance, facing.speed);
  }

  // The nearest thing on the road ahead within reach: its gap, its speed along our way, who it is.
  function visitAhead(other) {
    const agent = facing.agent;
    if (other === agent.entity || other.kind === ENTITY_KINDS.PROP || other.kind === ENTITY_KINDS.MARKER || other.kind === ENTITY_KINDS.PICKUP) return;
    if (other.tags.has(ENTITY_TAGS.EMERGENCY) && (other.data?.speed ?? 0) > 3 && other.data?.siren !== false) hearSiren(agent.mood);
    const otherAgent = byVehicle.get(other.id);
    // Two cars waiting on each other in a junction: the younger one goes first.
    if (otherAgent && otherAgent.blockerId === agent.entity.id && other.id < agent.entity.id) return;
    const samples = agent.samples;
    const reach = 1.25 + Math.min(other.radius ?? 1, 2.4) * 0.55;
    for (let k = 0; k < SAMPLE_COUNT; k += 1) {
      const dx = other.position.x - samples[2 * k];
      const dz = other.position.z - samples[2 * k + 1];
      if (dx * dx + dz * dz > reach * reach) continue;
      const gap = k * SAMPLE_STEP - (other.kind === ENTITY_KINDS.VEHICLE ? (other.radius ?? 2.2) * 0.8 : 0.6);
      if (gap < agent.gap) {
        const isPlayer = other.tags.has(ENTITY_TAGS.PLAYER);
        agent.gap = gap;
        agent.blockerId = other.id;
        agent.blockedByPlayer = isPlayer;
        agent.leaderSpeed = other.kind === ENTITY_KINDS.VEHICLE ? (other.data?.speed ?? 0) * Math.cos(-other.heading - agent.car.heading) : 0;
        // A person on foot in the lane close ahead: steer around them, away from their side.
        if (isPlayer && other.kind === ENTITY_KINDS.CHARACTER && gap < 14) {
          const k1 = k < SAMPLE_COUNT - 1 ? k + 1 : k;
          const k0 = k1 - 1;
          const right = dx * -(samples[2 * k1 + 1] - samples[2 * k0 + 1]) + dz * (samples[2 * k1] - samples[2 * k0]);
          facing.swerve = right >= 0 ? -1.4 : 1.4;
        }
      }
      return;
    }
  }
  function seeAhead(agent) {
    const samples = agent.samples;
    const halfLength = agent.record.entry.dimensions.length * 0.5;
    for (let k = 0; k < SAMPLE_COUNT; k += 1) {
      routePointAhead(agent.route, halfLength + k * SAMPLE_STEP, point);
      samples[2 * k] = point.x;
      samples[2 * k + 1] = point.z;
    }
    agent.gap = Infinity;
    agent.leaderSpeed = 0;
    agent.blockerId = -1;
    agent.blockedByPlayer = false;
    facing.agent = agent;
    facing.swerve = 0;
    const p = agent.entity.position;
    context.entities.forEachWithin(p.x, p.z, SEE_AHEAD, visitAhead);
    agent.mood.swerve = facing.swerve !== 0 ? facing.swerve : agent.mood.swerve * 0.8;
  }

  function drive(agent, dt, time, perceiveNow) {
    if (agent.record.wrecked) {
      agent.controls.throttle = 0;
      agent.controls.brake = 1;
      return;
    }
    localise(agent);
    const mood = agent.mood;
    const driving = moodDriving(mood);
    if (perceiveNow) perceive(agent, time, driving.obeysSignals);
    const car = agent.car;
    const speed = car.speed;
    const lane = lanes[agent.route.pieces[0].lane >= 0 ? agent.route.pieces[0].lane : agent.route.pieces[0].toLane];
    let target = cruiseSpeed(lane.speedLimit, mood.temper) * driving.speedFactor;
    if (agent.cornerLimit < target) target = agent.cornerLimit;
    const follow = followingSpeed(agent.gap, agent.leaderSpeed);
    if (follow < target) target = follow;
    const atLine = agent.lineDistance < Infinity ? speedToStopAt(agent.lineDistance) : Infinity;
    if (atLine < target) target = atLine;
    if (driving.holds) target = 0;
    if (agent.lineDistance < 4 && speed < 0.6) agent.lineWait += dt;
    const held = agent.lineDistance < Infinity || driving.holds;
    agent.stuckSeconds = speed < 0.5 && !held && agent.gap < 12 ? agent.stuckSeconds + dt : 0;
    if (agent.stuckSeconds > 8 && !agent.reportedBlocked) {
      agent.reportedBlocked = true;
      const p = agent.entity.position;
      context.events.queue(GAME_EVENTS.TRAFFIC_BLOCKED, { position: { x: p.x, y: p.y, z: p.z }, vehicleId: agent.vehicleId, seconds: agent.stuckSeconds });
    } else if (agent.stuckSeconds === 0) agent.reportedBlocked = false;

    routePointAhead(agent.route, lookaheadDistance(speed), point);
    const offset = driving.offset;
    const tx = point.x - point.dz * offset;
    const tz = point.z + point.dx * offset;
    const tuning = car.tuning;
    const p = agent.entity.position;
    agent.controls.steer = pursuitSteer(p.x, p.z, car.heading, tx, tz, tuning.wheelbase, steeringLockAt(tuning, speed));
    applyPedals(target, speed, agent.controls, mood.fleeSeconds > 0 ? 0.95 : mood.eagerness);
    agent.controls.horn = updateDriverMood(mood, dt, agent.blockedByPlayer && speed < 1.5, time);
  }

  return {
    get count() {
      return agents.length;
    },
    agents,

    fixedUpdate(dt) {
      step += 1;
      const time = context.simulation.time;
      watchEye();
      manageTimer -= dt;
      if (manageTimer <= 0) {
        manageTimer = 0.25;
        manage();
      }
      for (let i = 0; i < agents.length; i += 1) drive(agents[i], dt, time, (i + step) % 3 === 0);
    },

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
    signalLight: (nodeId, phase) => signalLightAt(nodes[nodeId]?.signal ?? null, phase, context.simulation.time),
    removeAll() {
      while (agents.length) drop(agents[agents.length - 1], true);
    },
  };
}
