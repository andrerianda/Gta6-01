// How a police car drives a pursuit, as pure rules that write a vehicle's controls
// (vehicles/vehicleControls.js). Far from the lead it follows the lane graph (plan.lanes: flat
// [x, z, ...] centre lines with successors), choosing at each junction the lane that ends nearest
// the lead. Within sight, on the lead's street, it leaves the lanes and drives at where the lead will
// be, pressing them (pursuitSpeed: closes in as fast as its own engine and brakes allow, then holds
// on, no yo-yo); close behind a moving lead it rams at three stars and more, PITs gently at two
// (both aiming at the rear quarter) and only follows at one; when the lead is slow it boxes them
// in, stopping beside or ahead of their nose (each car takes a side). A car that is stuck reverses
// out with the wheel turned the other way. Yaw is three.js rotation.y (0 faces -Z, + turns left).

/** Pursuit modes. */
export const PURSUIT_MODE = Object.freeze({ LANES: 'lanes', CHASE: 'chase', RAM: 'ram', BOX: 'box', LEAVE: 'leave' });

/**
 * A lead fleeing by car (faster than leadSpeed m/s): units spawn on a lane spawnRange metres behind
 * (ideal metres best), running the lead's way; once the run has lasted settleSeconds they spawn on
 * the lead's own street, straight behind, already rolling. On the lanes a car more than
 * catchUpBehind metres back drives up to 1.15 x the lead's speed + 4 (at least catchUpCap m/s
 * allowed); a ram comes in at most ramMargin m/s faster than the lead (a nudge, not a wrecking
 * blow), a PIT at two stars pitMargin.
 */
export const FLEEING = Object.freeze({
  leadSpeed: 8, spawnRange: Object.freeze([50, 140]), ideal: 70, catchUpBehind: 35, catchUpCap: 45, ramMargin: 4, pitMargin: 2, settleSeconds: 3,
});

/**
 * How a car presses a lead who drives away (pursuitSpeed): it closes at up to `close` m/s faster
 * than the lead, never beyond `topShare` of its own top speed, and only as fast as it can still
 * brake (`brake` m/s^2) to the lead's speed by its gap: the bumper when it may touch (a PIT or a
 * ram), `follow` metres back at one star. `yieldGap`: metres it keeps behind another police car.
 */
export const PRESSURE = Object.freeze({ brake: 5.5, close: 18, topShare: 0.96, follow: 9, yieldGap: 7 });

/** What a car may do to a lead's car by the stars' tactics: follow (1), PIT (2), ram (3+). */
export const CONTACT = Object.freeze({ FOLLOW: 'follow', PIT: 'pit', RAM: 'ram' });

const LANE_REACH = 7;
const CHASE_RANGE = 80;
const FOOT_CHASE_RANGE = 38;
const RAM_RANGE = 16;
/** Beyond FOOT_CHASE_RANGE a lead this far off the car's nose line is on another street: keep to the lanes. */
const OFF_STREET = 20;

/**
 * A new pursuit driver.
 * @param {number} side -1 or 1: the side this car takes when boxing in and ramming.
 * @returns {object}
 */
export function createPursuitState(side = 1) {
  return {
    mode: PURSUIT_MODE.LANES, lane: -1, point: 0, side, stuckSeconds: 0, reverseSeconds: 0,
    targetX: 0, targetZ: 0, distance: Infinity, contact: CONTACT.RAM, yieldSpeed: Infinity,
  };
}

/**
 * The contact a level's tactics allow (catalog/wantedLevels.js): ram from three stars, a PIT at
 * two, following only at one.
 * @param {ReadonlyArray<string> | undefined} tactics WANTED_LEVELS[stars].tactics.
 * @returns {string} A CONTACT value.
 */
export function contactFor(tactics) {
  if (!tactics || tactics.includes('ram')) return CONTACT.RAM;
  return tactics.includes('pit_manoeuvre') ? CONTACT.PIT : CONTACT.FOLLOW;
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
 * The unit direction a lane runs at its point nearest (x, z).
 * @param {{points: ArrayLike<number>}} lane Flat [x, z, ...] centre line.
 * @param {number} x
 * @param {number} z
 * @param {{x: number, z: number}} out
 * @returns {boolean} False for a lane with fewer than two points.
 */
export function laneDirectionAt(lane, x, z, out) {
  const points = lane?.points;
  if (!points || points.length < 4) return false;
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i + 3 < points.length; i += 2) {
    const mx = (points[i] + points[i + 2]) / 2 - x;
    const mz = (points[i + 1] + points[i + 3]) / 2 - z;
    const d = mx * mx + mz * mz;
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  const dx = points[best + 2] - points[best];
  const dz = points[best + 3] - points[best + 1];
  const length = Math.hypot(dx, dz) || 1;
  out.x = dx / length;
  out.z = dz / length;
  return true;
}

/**
 * How bad a lane point is for a unit sent after a lead fleeing by car (lower is better): behind the
 * lead (never ahead), near FLEEING.ideal metres, on a lane running the lead's way.
 * @param {number} dx Point minus lead, metres.
 * @param {number} dz
 * @param {number} ux The lead's unit way of travel.
 * @param {number} uz
 * @param {{x: number, z: number} | null} laneDirection The lane's direction at the point.
 * @param {boolean} [settled] The run has lasted FLEEING.settleSeconds: the lead's way is known, so
 *   the point straight behind on the lead's own street is best (a parallel street scores worse by
 *   its distance off the lead's line); before that, any lane behind and to the side will do.
 */
export function fleeingSpawnScore(dx, dz, ux, uz, laneDirection, settled = false) {
  const d = Math.hypot(dx, dz) || 1;
  const ahead = (dx * ux + dz * uz) / d;
  const along = laneDirection ? laneDirection.x * ux + laneDirection.z * uz : 0;
  const line = settled ? ahead * 40 + Math.abs(dx * uz - dz * ux) * 1.5 : 0;
  return (ahead > -0.2 ? 200 : 0) + (along < 0.3 ? 150 : 0) + Math.abs(d - FLEEING.ideal) * 0.5 - ahead * 20 + line;
}

/**
 * The cruise speed of a car on the lanes behind a lead who drives away: catches up when far back.
 * @param {number} cruise The level's cruise (m/s).
 * @param {number} distance Car to lead, metres.
 * @param {number} leadSpeed m/s.
 * @param {boolean} leadInVehicle
 * @param {number} [top] The car's own top speed (m/s): a lead faster than catchUpCap is still
 *   followed at a little over its speed, up to this.
 */
export function catchUpSpeed(cruise, distance, leadSpeed, leadInVehicle, top = FLEEING.catchUpCap) {
  if (!leadInVehicle || distance <= FLEEING.catchUpBehind) return cruise;
  return Math.min(Math.max(FLEEING.catchUpCap, Math.min(top, leadSpeed + 3)), Math.max(cruise, leadSpeed * 1.15 + 4));
}

/**
 * The speed of a car chasing a lead off the lanes: up to PRESSURE.close m/s faster than the lead
 * (at least the level's cruise), within its own top speed, and no faster than it can still brake
 * to the lead's speed by `gap` metres off. So it closes in and stays on the lead instead of
 * falling back and catching up again, and never slows below the lead's speed while behind.
 * @param {number} cruise The level's cruise (m/s).
 * @param {number} distance Car to lead, metres.
 * @param {number} leadSpeed m/s.
 * @param {boolean} leadInVehicle A lead on foot gets the cruise.
 * @param {number} gap Metres to hold behind the lead (0: up to the bumper).
 * @param {number} top The car's top speed, m/s.
 * @returns {number} m/s.
 */
export function pursuitSpeed(cruise, distance, leadSpeed, leadInVehicle, gap, top) {
  if (!leadInVehicle) return cruise;
  const closing = Math.sqrt(2 * PRESSURE.brake * Math.max(0, distance - gap));
  return Math.min(top * PRESSURE.topShare, Math.max(cruise, leadSpeed + PRESSURE.close), leadSpeed + closing);
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
 * @param {string} [contact] A CONTACT value (contactFor): at CONTACT.FOLLOW the car never rams.
 */
export function choosePursuitMode(pursuit, car, lead, leaving, contact = CONTACT.RAM) {
  const dx = lead.x - car.x;
  const dz = lead.z - car.z;
  const distance = Math.hypot(dx, dz);
  pursuit.distance = distance;
  pursuit.leadSpeed = lead.speed;
  pursuit.contact = contact;
  // A lead on foot is usually off the carriageway: keep to the lanes until close, so the car does
  // not try to drive through the block between them. A lead in a car well off this car's nose line
  // is on a parallel or cross street: the lanes take the car round the block to it.
  const chaseRange = lead.inVehicle === false ? FOOT_CHASE_RANGE : CHASE_RANGE;
  const offStreet = distance > FOOT_CHASE_RANGE && Math.abs(dx * Math.cos(car.yaw) - dz * Math.sin(car.yaw)) > OFF_STREET;
  if (leaving) pursuit.mode = PURSUIT_MODE.LEAVE;
  else if ((distance > chaseRange || offStreet) && pursuit.lane >= 0) pursuit.mode = PURSUIT_MODE.LANES;
  else if (lead.speed < 3 && distance < 30) pursuit.mode = PURSUIT_MODE.BOX;
  else if (distance < RAM_RANGE && contact !== CONTACT.FOLLOW) pursuit.mode = PURSUIT_MODE.RAM;
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
  // Boxing in: slow enough to stop at the spot (the brakes can do it from here).
  const stop = Math.max(0, distance - 1.5);
  if (pursuit.mode === PURSUIT_MODE.BOX) wanted = Math.min(cruiseSpeed, stop * 1.4, Math.sqrt(2 * PRESSURE.brake * stop));
  else if (pursuit.mode === PURSUIT_MODE.RAM) {
    const margin = pursuit.contact === CONTACT.PIT ? FLEEING.pitMargin : FLEEING.ramMargin;
    wanted = Math.min(cruiseSpeed * 1.15, (pursuit.leadSpeed ?? cruiseSpeed) + margin);
  }
  // Another police car close ahead: no faster than it allows (pursuit.yieldSpeed, the dispatch's).
  wanted = Math.min(wanted, pursuit.yieldSpeed ?? Infinity);
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
