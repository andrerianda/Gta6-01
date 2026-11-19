// What a traffic driver sees of the road ahead: the nearest car or person on its route (the route
// sampled every 3 m for about 40 m past its bumper) with the gap, that one's speed along the
// driver's way, whether it is the player, a vehicle, or a car nobody drives (parked, staged,
// abandoned: it stands still whatever its wheels report, and drivers go round it); a person on
// foot close ahead in the lane, to swerve around; and, before a left turn, the nearest oncoming
// car. One shared visitor state and the agent's own sample buffer: nothing allocated per step.
// trafficDrivers.js calls it for a third of the cars each fixed step.
import { ENTITY_KINDS, ENTITY_TAGS } from '../core/entities/entityKinds.js';
import { routePointAhead } from './laneRoute.js';
import { mustYieldLeftTurn } from './junctionRules.js';

/** Metres between two route samples, and how many: each agent keeps SAMPLE_COUNT * 2 numbers. */
export const SAMPLE_STEP = 3;
export const SAMPLE_COUNT = 13;
/** Metres around the car searched for things on its route. */
const SEE_AHEAD = 42;

/**
 * Creates the perception of the traffic drivers.
 * @param {object} entities context.entities (forEachWithin).
 * @param {Map<number, object>} byVehicle The traffic agents by vehicle id.
 * @returns {{seeAhead: (agent: object) => void, mustWaitForOncoming: (agent: object) => boolean}}
 */
export function createRoadAheadPerception(entities, byVehicle) {
  const point = { x: 0, z: 0, dx: 0, dz: -1 };
  const vehicleFilter = { kind: ENTITY_KINDS.VEHICLE };
  const facing = { agent: null, fx: 0, fz: 0, distance: Infinity, speed: 0, swerve: 0 };

  // The nearest oncoming car ahead (for a left turn).
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

  // The nearest thing on the road ahead within reach: its gap, its speed along our way, who it is.
  function visitAhead(other) {
    const agent = facing.agent;
    if (other === agent.entity || other.kind === ENTITY_KINDS.PROP || other.kind === ENTITY_KINDS.MARKER || other.kind === ENTITY_KINDS.PICKUP) return;
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
        const isVehicle = other.kind === ENTITY_KINDS.VEHICLE;
        agent.gap = gap;
        agent.blockerId = other.id;
        agent.blockedByPlayer = isPlayer;
        agent.blockerIsVehicle = isVehicle;
        agent.blockerParked = isVehicle && !otherAgent && !isPlayer && !other.tags.has(ENTITY_TAGS.POLICE)
          && (other.data?.driverId ?? null) === null && (other.tags.has(ENTITY_TAGS.PARKED) || Math.abs(other.data?.speed ?? 0) < 2.5);
        agent.leaderSpeed = isVehicle && !agent.blockerParked ? (other.data?.speed ?? 0) * Math.cos(-other.heading - agent.car.heading) : 0;
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

  return {
    /** Fills the agent's gap, leaderSpeed, blockerId, blockedByPlayer, blockerIsVehicle, blockerParked and mood.swerve. */
    seeAhead(agent) {
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
      agent.blockerIsVehicle = false;
      agent.blockerParked = false;
      facing.agent = agent;
      facing.swerve = 0;
      const p = agent.entity.position;
      entities.forEachWithin(p.x, p.z, SEE_AHEAD, visitAhead);
      agent.mood.swerve = facing.swerve !== 0 ? facing.swerve : agent.mood.swerve * 0.8;
    },

    /** Whether an oncoming car is too close to turn left in front of it now. */
    mustWaitForOncoming(agent) {
      const p = agent.entity.position;
      facing.agent = agent;
      facing.fx = Math.sin(agent.car.heading);
      facing.fz = -Math.cos(agent.car.heading);
      facing.distance = Infinity;
      facing.speed = 0;
      entities.forEachWithin(p.x, p.z, 60, visitOncoming, vehicleFilter);
      return mustYieldLeftTurn(facing.distance, facing.speed);
    },
  };
}
