// How a police car drives a pursuit, as pure rules that write a vehicle's controls
// (vehicles/vehicleControls.js). Far from the lead it follows the lane graph (plan.lanes: flat
// [x, z, ...] centre lines with successors), choosing at each junction the lane that ends nearest
// the lead. Within sight it leaves the lanes and drives at where the lead will be; close behind a
// moving lead it rams (aiming at the rear quarter for a PIT); when the lead is slow it boxes them
// in, stopping beside or ahead of their nose (each car takes a side). A car that is stuck reverses
// out with the wheel turned the other way. Yaw is three.js rotation.y (0 faces -Z, + turns left).

/** Pursuit modes. */
export const PURSUIT_MODE = Object.freeze({ LANES: 'lanes', CHASE: 'chase', RAM: 'ram', BOX: 'box', LEAVE: 'leave' });

const LANE_REACH = 7;
const CHASE_RANGE = 80;
const FOOT_CHASE_RANGE = 38;
const RAM_RANGE = 16;

/**
 * A new pursuit driver.
 * @param {number} side -1 or 1: the side this car takes when boxing in and ramming.
 * @returns {object}
 */
export function createPursuitState(side = 1) {
  return {
    mode: PURSUIT_MODE.LANES, lane: -1, point: 0, side, stuckSeconds: 0, reverseSeconds: 0,
    targetX: 0, targetZ: 0, distance: Infinity,
  };
}

/**
 * Signed angle from a heading to a point: positive means the point is to the left.
 * @param {number} yaw
 * @param {number} x From.
 * @param {number} z
 * @param {number} tx To.
 * @param {number} tz
 * @returns {number} Radians, -PI..PI.
 */
export function angleTo(yaw, x, z, tx, tz) {
  const wanted = Math.atan2(-(tx - x), -(tz - z));
  let delta = wanted - yaw;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/**
 * Puts the driver on a lane at the point nearest the car.
 * @param {object} pursuit
 * @param {ReadonlyArray<object>} lanes plan.lanes.
 * @param {number} laneId
 * @param {number} x
 * @param {number} z
 */
export function joinLane(pursuit, lanes, laneId, x, z) {
  const lane = lanes[laneId];
  if (!lane) return;
  pursuit.lane = laneId;
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < lane.points.length; i += 2) {
    const d = (lane.points[i] - x) ** 2 + (lane.points[i + 1] - z) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = i / 2;
    }
  }
  pursuit.point = Math.min(best + 1, lane.points.length / 2 - 1);
}

/**
 * Advances along the lane graph towards a goal and writes the next waypoint.
 * @param {object} pursuit
 * @param {ReadonlyArray<object>} lanes plan.lanes.
 * @param {number} x The car.
 * @param {number} z
 * @param {number} goalX Where it is going.
 * @param {number} goalZ
 * @param {{x: number, z: number}} out The waypoint.
 * @returns {boolean} False when the car is on no lane.
 */
export function laneWaypoint(pursuit, lanes, x, z, goalX, goalZ, out) {
  let lane = lanes[pursuit.lane];
  if (!lane) return false;
  for (let guard = 0; guard < 8; guard += 1) {
    const count = lane.points.length / 2;
    if (pursuit.point < count) {
      const i = pursuit.point * 2;
      const px = lane.points[i];
      const pz = lane.points[i + 1];
      const reached = (px - x) ** 2 + (pz - z) ** 2 <= LANE_REACH * LANE_REACH;
      // Passed it: the car is nearer the following point than this point is.
      const passed = pursuit.point < count - 1
        && (lane.points[i + 2] - x) ** 2 + (lane.points[i + 3] - z) ** 2 < (lane.points[i + 2] - px) ** 2 + (lane.points[i + 3] - pz) ** 2;
      if (!reached && !passed) break;
      pursuit.point += 1;
      continue;
    }
    let next = -1;
    let nextDistance = Infinity;
    for (let i = 0; i < lane.successors.length; i += 1) {
      const candidate = lanes[lane.successors[i].lane];
      if (!candidate) continue;
      // The lane that passes closest to the goal (not only the one that ends nearest it), so a car
      // takes the street the lead stands on rather than a side street ending a little nearer.
      let closestPass = Infinity;
      for (let p = 0; p < candidate.points.length; p += 2) {
        const pass = (candidate.points[p] - goalX) ** 2 + (candidate.points[p + 1] - goalZ) ** 2;
        if (pass < closestPass) closestPass = pass;
      }
      const d = closestPass + (lane.successors[i].turn === 'uturn' ? 1e4 : 0);
      if (d < nextDistance) {
        nextDistance = d;
        next = lane.successors[i].lane;
      }
    }
    if (next < 0) return false;
    pursuit.lane = next;
    pursuit.point = 0;
    lane = lanes[next];
  }
  const index = Math.min(pursuit.point, lane.points.length / 2 - 1);
  out.x = lane.points[index * 2];
  out.z = lane.points[index * 2 + 1];
  return true;
}

/**
 * Chooses the mode and the point to drive at.
 * @param {object} pursuit
 * @param {{x: number, z: number, yaw: number, speed: number}} car
 * @param {{x: number, z: number, vx: number, vz: number, speed: number, yaw: number}} lead
 * @param {boolean} leaving True once the wanted level cleared: drive off on the lanes.
 */
export function choosePursuitMode(pursuit, car, lead, leaving) {
  const dx = lead.x - car.x;
  const dz = lead.z - car.z;
  const distance = Math.hypot(dx, dz);
  pursuit.distance = distance;
  // A lead on foot is usually off the carriageway: keep to the lanes until close, so the car does
  // not try to drive through the block between them.
  const chaseRange = lead.inVehicle === false ? FOOT_CHASE_RANGE : CHASE_RANGE;
  if (leaving) pursuit.mode = PURSUIT_MODE.LEAVE;
  else if (distance > chaseRange && pursuit.lane >= 0) pursuit.mode = PURSUIT_MODE.LANES;
  else if (lead.speed < 3 && distance < 30) pursuit.mode = PURSUIT_MODE.BOX;
  else if (distance < RAM_RANGE) pursuit.mode = PURSUIT_MODE.RAM;
  else pursuit.mode = PURSUIT_MODE.CHASE;
  const ahead = Math.min(1.4, distance / 25);
  const fx = -Math.sin(lead.yaw);
  const fz = -Math.cos(lead.yaw);
  if (pursuit.mode === PURSUIT_MODE.BOX) {
    // A spot beside the lead's front wheel on this car's side, or across its nose.
    pursuit.targetX = lead.x + fx * 3.2 - fz * 2.6 * pursuit.side;
    pursuit.targetZ = lead.z + fz * 3.2 + fx * 2.6 * pursuit.side;
  } else if (pursuit.mode === PURSUIT_MODE.RAM) {
    // The rear quarter on this car's side: a PIT that spins the lead round.
    pursuit.targetX = lead.x + lead.vx * 0.35 - fx * 1.2 - fz * 0.9 * pursuit.side;
    pursuit.targetZ = lead.z + lead.vz * 0.35 - fz * 1.2 + fx * 0.9 * pursuit.side;
  } else {
    pursuit.targetX = lead.x + lead.vx * ahead;
    pursuit.targetZ = lead.z + lead.vz * ahead;
  }
}

/**
 * Writes the controls that drive the car at its target.
 * @param {object} controls The vehicle's controls (vehicleFleet controlsOf).
 * @param {object} pursuit With targetX/targetZ set (choosePursuitMode or a lane waypoint).
 * @param {{x: number, z: number, yaw: number, speed: number}} car speed: m/s along the nose.
 * @param {number} cruiseSpeed Top speed wanted (m/s).
 * @param {number} dt Seconds.
 */
export function drivePursuit(controls, pursuit, car, cruiseSpeed, dt) {
  controls.horn = false;
  if (pursuit.reverseSeconds > 0) {
    pursuit.reverseSeconds -= dt;
    controls.reverse = true;
    controls.throttle = 0.8;
    controls.brake = 0;
    controls.handbrake = 0;
    controls.steer = angleTo(car.yaw, car.x, car.z, pursuit.targetX, pursuit.targetZ) > 0 ? 1 : -1;
    return;
  }
  controls.reverse = false;
  const angle = angleTo(car.yaw, car.x, car.z, pursuit.targetX, pursuit.targetZ);
  const distance = Math.hypot(pursuit.targetX - car.x, pursuit.targetZ - car.z);
  controls.steer = Math.max(-1, Math.min(1, -angle * 1.8));
  let wanted = cruiseSpeed;
  if (pursuit.mode === PURSUIT_MODE.BOX) wanted = Math.min(cruiseSpeed, Math.max(0, (distance - 1.5) * 1.4));
  else if (pursuit.mode === PURSUIT_MODE.RAM) wanted = cruiseSpeed * 1.15;
  const turning = Math.abs(angle);
  if (turning > 0.6) wanted = Math.min(wanted, 8 + (Math.PI - turning) * 4);
  const error = wanted - car.speed;
  controls.throttle = error > 0 ? Math.min(1, 0.35 + error * 0.25) : 0;
  controls.brake = error < -2.5 ? Math.min(1, -error * 0.12) : 0;
  controls.handbrake = turning > 1.4 && car.speed > 9 ? 1 : 0;
  // Stuck against something: reverse out with the wheel the other way.
  if (controls.throttle > 0.5 && Math.abs(car.speed) < 0.8 && pursuit.mode !== PURSUIT_MODE.BOX) {
    pursuit.stuckSeconds += dt;
    if (pursuit.stuckSeconds > 1.4) {
      pursuit.stuckSeconds = 0;
      pursuit.reverseSeconds = 1.3;
    }
  } else {
    pursuit.stuckSeconds = Math.max(0, pursuit.stuckSeconds - dt);
  }
}
