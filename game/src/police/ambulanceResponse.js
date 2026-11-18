// Ambulances: when someone is knocked down or killed near the lead, an ambulance (once its model is
// loaded) sets off from out of sight on the lane graph with its light bar flashing, pulls up beside
// the casualty, waits there with the lights on, then drives away and is removed. While its lights
// run it is tagged emergency with data.siren true, so traffic pulls over for it. One at a time, with
// a cool-down, so it costs one car at most. Driven by the pursuit rules of pursuitDriving.js.
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { ENTITY_KINDS, ENTITY_TAGS } from '../core/entities/entityKinds.js';
import { PURSUIT_MODE, choosePursuitMode, createPursuitState, drivePursuit, joinLane, laneWaypoint } from './pursuitDriving.js';
import { createSirenLights, releaseSirenLights, updateSirenLights } from './sirenLights.js';

/** When and how an ambulance answers a call. */
export const AMBULANCE_RULES = Object.freeze({
  modelId: 'ambulance', cooldown: 45, callRange: 220, spawn: Object.freeze([90, 170]), hiddenFromLead: 70,
  waitSeconds: 12, leaveSeconds: 22, cruise: 19, despawn: 260,
});

/**
 * Creates the ambulance service.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @returns {{start: () => void, fixedUpdate: (dt: number) => void, update: (dt: number) => void, dispose: () => void, readonly active: object | null}}
 */
export function createAmbulanceResponse(context) {
  const { entities, events } = context;
  const fleet = context.systems.find('vehicles');
  const city = context.systems.find('openWorldCity');
  const lanes = city?.laneGraph ?? [];
  const scene = { x: 0, z: 0, vx: 0, vz: 0, speed: 0, yaw: 0, inVehicle: false };
  const car = { x: 0, z: 0, yaw: 0, speed: 0 };
  const waypoint = { x: 0, z: 0 };
  const vehicleFilter = { kind: ENTITY_KINDS.VEHICLE };
  const stops = [];
  let active = null;
  let cooldown = 0;

  function leadPosition() {
    const entity = entities.firstWithTag(ENTITY_TAGS.PLAYER);
    return entity ? entity.position : context.focus.position;
  }

  function findSpawn(x, z, lead) {
    const points = city.spawnPointsNear(x, z, AMBULANCE_RULES.spawn[1], 'vehicle', 128);
    let best = null;
    let bestScore = Infinity;
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      const d = Math.hypot(point.x - x, point.z - z);
      if (d < AMBULANCE_RULES.spawn[0] || Math.hypot(point.x - lead.x, point.z - lead.z) < AMBULANCE_RULES.hiddenFromLead) continue;
      const score = Math.abs(d - 110);
      if (score < bestScore && entities.countWithin(point.x, point.z, 7, vehicleFilter) === 0) {
        best = point;
        bestScore = score;
      }
    }
    return best;
  }

  /** Someone is hurt at a position: send an ambulance if one is free. */
  function call(position) {
    if (!position || active || cooldown > 0 || !fleet || !city || !context.assets?.has?.(AMBULANCE_RULES.modelId)) return;
    const lead = leadPosition();
    if (Math.hypot(position.x - lead.x, position.z - lead.z) > AMBULANCE_RULES.callRange) return;
    const spot = findSpawn(position.x, position.z, lead);
    if (!spot) return;
    const y = spot.y ?? city.groundHeightAt(spot.x, spot.z);
    const vehicleId = fleet.spawn({ modelId: AMBULANCE_RULES.modelId, position: { x: spot.x, y, z: spot.z }, heading: -(spot.heading ?? 0), parked: false, ownerSystem: 'policeDispatch' });
    const record = vehicleId === null || vehicleId === undefined ? null : fleet.get(vehicleId);
    if (!record) return;
    entities.addTag(record.entity, ENTITY_TAGS.EMERGENCY);
    record.entity.data.siren = true;
    const pursuit = createPursuitState(1);
    const laneId = typeof spot.lane === 'number' ? spot.lane : spot.lane?.id;
    if (typeof laneId === 'number') joinLane(pursuit, lanes, laneId, spot.x, spot.z);
    active = { vehicleId, entity: record.entity, pursuit, siren: createSirenLights(record.rig, 0.21), stage: 'respond', seconds: 0, x: position.x, z: position.z };
    cooldown = AMBULANCE_RULES.cooldown;
  }

  function finish() {
    if (!active) return;
    releaseSirenLights(active.siren, context.atmosphere);
    if (fleet.get(active.vehicleId)) fleet.remove(active.vehicleId);
    active = null;
  }

  function drive(dt) {
    const record = fleet.get(active.vehicleId);
    if (!record || record.entity.data.health <= 0 || record.entity.tags.has(ENTITY_TAGS.PLAYER)) {
      if (record?.entity.tags.has(ENTITY_TAGS.PLAYER)) {
        releaseSirenLights(active.siren, context.atmosphere);
        record.entity.data.siren = false;
        active = null;
        return;
      }
      finish();
      return;
    }
    const entity = record.entity;
    car.x = entity.position.x;
    car.z = entity.position.z;
    car.yaw = entity.heading;
    car.speed = entity.data.speed ?? 0;
    const pursuit = active.pursuit;
    const leaving = active.stage === 'leave';
    scene.x = active.x;
    scene.z = active.z;
    choosePursuitMode(pursuit, car, scene, leaving);
    if ((pursuit.mode === PURSUIT_MODE.LANES || pursuit.mode === PURSUIT_MODE.LEAVE) && pursuit.lane >= 0) {
      const goalX = leaving ? car.x * 2 - scene.x : scene.x;
      const goalZ = leaving ? car.z * 2 - scene.z : scene.z;
      if (laneWaypoint(pursuit, lanes, car.x, car.z, goalX, goalZ, waypoint)) {
        pursuit.targetX = waypoint.x;
        pursuit.targetZ = waypoint.z;
      }
    }
    const controls = record.controls;
    if (active.stage === 'attend') {
      controls.throttle = 0;
      controls.brake = 1;
      controls.steer = 0;
      controls.reverse = false;
    } else {
      drivePursuit(controls, pursuit, car, leaving ? 12 : AMBULANCE_RULES.cruise, dt);
    }
    if (active.stage === 'respond' && pursuit.distance < 10) {
      active.stage = 'attend';
      active.seconds = 0;
    }
  }

  return {
    get active() { return active; },
    call,
    start() {
      stops.push(
        events.on(GAME_EVENTS.PEDESTRIAN_KNOCKED_DOWN, ({ position }) => call(position)),
        events.on(GAME_EVENTS.CHARACTER_KILLED, ({ position }) => call(position)),
      );
    },
    fixedUpdate(dt) {
      cooldown = Math.max(0, cooldown - dt);
      if (!active) return;
      active.seconds += dt;
      if (active.stage === 'attend' && active.seconds > AMBULANCE_RULES.waitSeconds) {
        active.stage = 'leave';
        active.seconds = 0;
        active.entity.data.siren = false;
      }
      drive(dt);
      if (!active) return;
      const lead = leadPosition();
      const far = Math.hypot(active.entity.position.x - lead.x, active.entity.position.z - lead.z) > AMBULANCE_RULES.despawn;
      if (far || (active.stage === 'leave' && active.seconds > AMBULANCE_RULES.leaveSeconds)) finish();
    },
    update(dt) {
      if (!active) return;
      const p = active.entity.position;
      const camera = context.view.camera.position;
      updateSirenLights(active.siren, dt, active.stage !== 'leave', context.atmosphere, Math.hypot(p.x - camera.x, p.z - camera.z));
    },
    dispose() {
      for (const stop of stops.splice(0)) if (typeof stop === 'function') stop();
      finish();
    },
  };
}
