// Lane changes of Marazul's traffic. On a road with more than one lane each way, a driver held
// up by a slower car ahead (or a stalled one that is not waiting at a light) puts the indicator
// on, waits for a gap in the next lane (room ahead for its speed, and a car coming up behind far
// enough back for its closing speed), then moves across along an eased curve over two to three
// seconds; after an overtake it drifts back to the right-hand lane when that is clear. No change
// near the end of a lane or in a junction, none while fleeing or pulled over, and a pause after
// each one. Pure decisions over numbers and the lane graph, plus one small planner per car that
// trafficDrivers.js calls every fixed step; tested in Node (tools/tests/traffic/).

import { projectOnPolyline, startLaneRoute } from './laneRoute.js';

/** Tuning of the lane changes. */
export const LANE_CHANGE = Object.freeze({
  /** m/s the car ahead must be slower than the driver wants, to be worth overtaking. */
  slowerBy: 2.2,
  /** Metres to the car ahead within which the driver thinks of overtaking. */
  lookGap: 30,
  /** Seconds the indicator blinks before the wheel turns. */
  signalSeconds: 1.2,
  /** Seconds a driver waits for a gap before giving up. */
  patience: 5,
  /** Metres of lane that must be left before the junction to start a change (an urgent one: for a siren). */
  minLaneLeft: 34,
  urgentLaneLeft: 14,
  /** Seconds the indicator blinks before an urgent move. */
  urgentSignalSeconds: 0.5,
  /** Seconds between two changes of one car. */
  cooldown: 6,
  /** Seconds after an overtake before the driver moves back to the right. */
  keepRightAfter: 7,
  /** Metres of clear road ahead in the new lane, plus speed and closing terms. */
  frontGap: 8,
  /** Metres of clear road behind in the new lane, plus the closing speed of the car there. */
  rearGap: 6,
  /** Seconds of the closing speed of a car coming up behind that the gap must cover. */
  rearSeconds: 2.4,
  /** Metres from the target lane's centre line within which a car counts as in that lane. */
  inLane: 2.6,
  /** Bumper allowance between two car centres, metres. */
  carLength: 4.8,
  /** Metres before the junction where a driver decides whether to turn there, and the share who move into a turn lane. */
  turnDecideAt: 160,
  turnShare: 0.3,
  /** Seconds between the steps of a move across two lanes towards a turn. */
  turnCooldown: 1,
});

/**
 * Whether a driver in a lane of a road with several lanes each way decides to turn at the next
 * junction from the edge lane that has the turn: 'left' (innermost lane) or 'right' (kerb lane),
 * or '' to drive on as the route goes.
 * @param {object[]} lanes The lane graph.
 * @param {object} lane The driver's lane.
 * @param {number} roll 0..1.
 * @returns {'' | 'left' | 'right'}
 */
export function chooseTurnLane(lanes, lane, roll) {
  if (!(lane.lanesInGroup > 1) || roll >= LANE_CHANGE.turnShare) return '';
  const left = lane.leftLane >= 0 && edgeLaneTurns(lanes, lane, 'leftLane', 'left');
  const right = lane.rightLane >= 0 && edgeLaneTurns(lanes, lane, 'rightLane', 'right');
  if (left && right) return roll < LANE_CHANGE.turnShare * 0.5 ? 'left' : 'right';
  return left ? 'left' : right ? 'right' : '';
}

function edgeLaneTurns(lanes, lane, side, turn) {
  let edge = lane;
  for (let i = 0; i < 6 && edge[side] >= 0; i += 1) edge = lanes[edge[side]];
  for (let i = 0; i < edge.successors.length; i += 1) if (edge.successors[i].turn === turn) return true;
  return false;
}

const IDLE = 0;
const SIGNALLING = 1;
const MERGING = 2;

/** Smoothstep 0..1: the share of the sideways move done at progress t. */
export function mergeEase(t) {
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/**
 * Seconds a move across one lane takes at a speed: longer when slow, never abrupt.
 * @param {number} speed m/s.
 */
export function mergeSeconds(speed) {
  const seconds = 3.3 - Math.abs(speed) * 0.05;
  return seconds < 2.3 ? 2.3 : seconds;
}

/**
 * Whether a driver held up by the car ahead wants to overtake it.
 * @param {number} wanted The speed the driver would drive on an empty road, m/s.
 * @param {number} gap Metres to the car ahead (Infinity for none).
 * @param {number} leaderSpeed Its speed along our way, m/s.
 * @param {number} lineDistance Metres to the stop line the driver is holding for (Infinity for none).
 * @param {boolean} leaderIsVehicle The one ahead is a vehicle (not a person on foot).
 * @param {boolean} [leaderParked] Nobody drives it: worth going round even from right behind it.
 */
export function wantsToOvertake(wanted, gap, leaderSpeed, lineDistance, leaderIsVehicle, leaderParked = false) {
  if (!leaderIsVehicle || !(gap < LANE_CHANGE.lookGap) || gap < (leaderParked ? 0.4 : 1.6) || wanted < 6) return false;
  // Queued for a light or a stop sign: everyone waits, nobody weaves.
  if (lineDistance < gap + 25) return false;
  return leaderSpeed < wanted - LANE_CHANGE.slowerBy;
}

/**
 * The lane an overtaking driver moves into: the one to the left when there is one, else the right.
 * @param {{leftLane?: number, rightLane?: number}} lane
 * @returns {number} Lane id, or -1 for none.
 */
export function overtakingLane(lane) {
  if (lane.leftLane >= 0) return lane.leftLane;
  return lane.rightLane >= 0 ? lane.rightLane : -1;
}

/**
 * Whether a car in the target lane leaves room for us to move in.
 * @param {number} ds Its distance along the target lane minus ours, metres (positive ahead).
 * @param {number} speed Our speed, m/s.
 * @param {number} otherSpeed Its speed along the lane, m/s.
 */
export function leavesRoom(ds, speed, otherSpeed) {
  if (ds >= 0) return ds - LANE_CHANGE.carLength >= LANE_CHANGE.frontGap + Math.max(0, speed - otherSpeed) * 1.2 + speed * 0.3;
  return -ds - LANE_CHANGE.carLength >= LANE_CHANGE.rearGap + Math.max(0, otherSpeed - speed) * LANE_CHANGE.rearSeconds;
}

/**
 * The sideways offset (metres, positive to the right of the new lane) to steer at, a time ahead
 * of the car on its eased path from the old lane into the new one.
 * @param {number} from Offset from the new lane's centre where the move began.
 * @param {number} t Progress 0..1.
 */
export function mergeOffset(from, t) {
  return from * (1 - mergeEase(t));
}

/** A planner's state for one car (reused through the pool). */
export function createLaneChangeState(out = {}) {
  out.phase = IDLE;
  out.side = 0;
  out.target = -1;
  out.timer = 0;
  out.t = 0;
  out.seconds = 3;
  out.from = 0;
  out.cooldown = 2;
  out.overtookAt = -Infinity;
  out.changes = 0;
  out.turn = '';
  out.decidedLane = -1;
  out.towardsTurn = false;
  return out;
}

/**
 * The lane-change planner of the traffic drivers.
 * @param {object[]} lanes openWorldCity.laneGraph.
 * @param {(x: number, z: number, radius: number, visit: (entity: object) => void) => void} forEachVehicleNear
 *   Visits the vehicles within a radius (entities: position, heading = three.js rotation.y, data.speed).
 * @param {() => number} [random] 0..1, for the drivers' choice of turn lanes.
 */
export function createLaneChanger(lanes, forEachVehicleNear, random = Math.random) {
  const projection = { s: 0, lateral: 0, distance: 0 };
  const probe = { points: null, s: 0, speed: 0, heading: 0, self: null, free: true };
  const stats = { started: 0, merged: 0, abandoned: 0, intoTurnLane: 0 };

  function visitProbe(other) {
    if (!probe.free || other === probe.self) return;
    projectOnPolyline(probe.points, other.position.x, other.position.z, projection);
    if (projection.distance > LANE_CHANGE.inLane) return;
    const otherSpeed = (other.data?.speed ?? 0) * Math.cos(-other.heading - probe.heading);
    if (!leavesRoom(projection.s - probe.s, probe.speed, otherSpeed)) probe.free = false;
  }

  /** Whether the car can move into a lane now. */
  function gapIsFree(entity, heading, speed, laneId) {
    const points = lanes[laneId].points;
    projectOnPolyline(points, entity.position.x, entity.position.z, projection);
    if (projection.distance > 6) return false;
    probe.points = points;
    probe.s = projection.s;
    probe.speed = speed;
    probe.heading = heading;
    probe.self = entity;
    probe.free = true;
    forEachVehicleNear(entity.position.x, entity.position.z, 48, visitProbe);
    probe.self = null;
    return probe.free;
  }

  function cancel(change) {
    if (change.phase === SIGNALLING) stats.abandoned += 1;
    change.phase = IDLE;
    change.side = 0;
    change.target = -1;
  }

  /** Starts the move: the route jumps to the new lane, the steering eases across from where the car is. */
  function commit(agent, change, speed, time) {
    const p = agent.entity.position;
    projectOnPolyline(lanes[change.target].points, p.x, p.z, projection);
    // Into the lane that has the turn: the route takes it at the next junction.
    const turnLane = change.towardsTurn && !(lanes[change.target][change.turn === 'left' ? 'leftLane' : 'rightLane'] >= 0);
    if (turnLane) agent.route.preferTurn = change.turn;
    startLaneRoute(agent.route, change.target, projection.s);
    if (turnLane) {
      change.turn = '';
      stats.intoTurnLane += 1;
    }
    agent.lastFirstLane = change.target;
    agent.lineWait = 0;
    // The old lane's leader is no longer in the way; the next look fills these in for the new lane.
    agent.gap = Infinity;
    agent.leaderSpeed = 0;
    agent.blockerId = -1;
    if (change.side < 0 && !change.towardsTurn) change.overtookAt = time;
    change.from = projection.lateral;
    change.t = 0;
    change.seconds = mergeSeconds(speed);
    change.phase = MERGING;
    change.changes += 1;
    stats.merged += 1;
  }

  return {
    stats,

    /**
     * One fixed step of a car's lane changes. `agent` has route, entity, car {speed, heading},
     * gap, leaderSpeed, lineDistance, blockerIsVehicle and change (createLaneChangeState).
     * @param {object} agent
     * @param {number} dt Seconds.
     * @param {number} wanted The driver's free-road speed now, m/s.
     * @param {boolean} calm False while fleeing, pulling over or holding.
     * @param {boolean} looked Whether the driver looked around this step (perception ran).
     * @param {number} time Simulation seconds.
     * @param {number} [urge] 1 to move one lane right now (a siren: shorter signal, no pause, closer
     *   to the junction), 0 for ordinary driving.
     */
    update(agent, dt, wanted, calm, looked, time, urge = 0) {
      const change = agent.change;
      change.cooldown -= dt;
      if (change.phase === MERGING) {
        change.t += dt / change.seconds;
        if (change.t >= 1) {
          change.phase = IDLE;
          change.side = 0;
          change.cooldown = change.turn ? LANE_CHANGE.turnCooldown : LANE_CHANGE.cooldown;
        }
        return;
      }
      const route = agent.route;
      const first = route.pieces[0];
      const laneLeft = first.lane >= 0 ? first.length - route.s : 0;
      // Once per lane, some way before its junction: turn there, from the lane that has the turn?
      if (first.lane >= 0 && first.lane !== change.decidedLane && laneLeft < LANE_CHANGE.turnDecideAt) {
        change.decidedLane = first.lane;
        change.turn = chooseTurnLane(lanes, lanes[first.lane], random());
      }
      if (first.lane < 0 || !(calm || urge) || laneLeft < (urge ? LANE_CHANGE.urgentLaneLeft : LANE_CHANGE.minLaneLeft)) {
        if (change.phase !== IDLE) cancel(change);
        return;
      }
      const speed = agent.car.speed;
      if (change.phase === SIGNALLING) {
        change.timer += dt;
        if (change.timer > LANE_CHANGE.patience * (urge ? 3 : 1) || lanes[first.lane][change.side < 0 ? 'leftLane' : 'rightLane'] !== change.target) cancel(change);
        else if (change.timer >= (urge ? LANE_CHANGE.urgentSignalSeconds : LANE_CHANGE.signalSeconds) && looked && gapIsFree(agent.entity, agent.car.heading, speed, change.target)) commit(agent, change, speed, time);
        return;
      }
      if (!looked || (change.cooldown > 0 && !urge)) return;
      const lane = lanes[first.lane];
      let target = -1;
      let towardsTurn = false;
      if (urge > 0) target = lane.rightLane;
      else if (change.turn) {
        target = change.turn === 'left' ? lane.leftLane : lane.rightLane;
        towardsTurn = target >= 0;
        if (!towardsTurn) change.turn = '';
      } else if (wantsToOvertake(wanted, agent.gap, agent.leaderSpeed, agent.lineDistance, agent.blockerIsVehicle, agent.blockerParked)) {
        target = overtakingLane(lane);
        if (target >= 0 && target === lane.leftLane && lane.rightLane >= 0 && !gapIsFree(agent.entity, agent.car.heading, speed, target)) target = lane.rightLane;
      } else if (lane.rightLane >= 0 && time - change.overtookAt > LANE_CHANGE.keepRightAfter && time - change.overtookAt < 60 && agent.gap > 30) {
        // Back to the right after an overtake, once well past.
        target = lane.rightLane;
        change.overtookAt = -Infinity;
      }
      if (target < 0) return;
      change.phase = SIGNALLING;
      change.towardsTurn = towardsTurn;
      change.target = target;
      change.side = target === lane.leftLane ? -1 : 1;
      change.timer = 0;
      stats.started += 1;
    },

    /**
     * The extra sideways steering offset of a car moving across (0 otherwise), aimed `ahead` metres on.
     * @param {object} change The car's state.
     * @param {number} speed m/s.
     * @param {number} ahead Lookahead metres.
     */
    steerOffset(change, speed, ahead) {
      if (change.phase !== MERGING) return 0;
      // The aim point leads the car along the eased path; the lead grows in over the first quarter
      // so the aim starts exactly on the old lane and the wheel turns in without a jolt.
      const lead = ahead / ((speed > 2 ? speed : 2) * change.seconds);
      return mergeOffset(change.from, change.t + lead * (change.t < 0.25 ? change.t * 4 : 1));
    },

    /** -1 left, 1 right, 0 off: what the indicator shows (on until most of the move is done). */
    indicatorOf(change) {
      if (change.phase === SIGNALLING) return change.side;
      return change.phase === MERGING && change.t < 0.75 ? change.side : 0;
    },

    /**
     * A parked car pulling out: eases from `lateral` metres off its lane's centre (projectOnPolyline's
     * sign) into the lane over a few seconds, indicating towards it.
     */
    easeInto(change, lateral) {
      change.phase = MERGING;
      change.from = lateral;
      change.t = 0;
      change.seconds = 3.4;
      change.side = lateral > 0 ? -1 : 1;
      change.target = -1;
    },

    /** The car was put somewhere else (route restarted): forget the change. */
    reset(change) {
      change.phase = IDLE;
      change.side = 0;
      change.target = -1;
      change.turn = '';
    },
  };
}
