// How a traffic driver drives along its route: pure-pursuit steering on the lane centre line
// (with an optional sideways offset for pulling over or swerving), a cruising speed from the
// road's limit and the driver's temper, slower through turns, a safe following speed behind
// the car ahead, and gentle pedals that turn a wanted speed into throttle and brake. Pure: the
// car is given as numbers (compass heading, 0 = -Z, clockwise from above), the answer is the
// fleet's controls (steer -1 left .. 1 right). Tested in tools/tests/traffic/.

const G = 9.81;

/** Speed through a junction by turn, m/s. */
export const TURN_SPEED = Object.freeze({ straight: Infinity, right: 6.5, left: 7.5, uturn: 3.5 });
/** Bumper-to-bumper gap kept behind a standing car, metres. */
export const STANDING_GAP = 2.4;
/** Seconds of headway kept behind a moving car. */
export const HEADWAY_SECONDS = 1.1;

/**
 * Metres ahead the driver aims at.
 * @param {number} speed m/s.
 * @param {boolean} [turning] In a junction turn: aim closer so the car does not cut the corner.
 */
export function lookaheadDistance(speed, turning = false) {
  const ahead = (4 + Math.abs(speed) * 0.72) * (turning ? 0.7 : 1);
  return ahead > 24 ? 24 : ahead;
}

/**
 * The steering lock the physics allows at a speed (the same rule as physics/vehicles/Vehicle.js).
 * @param {{wheelbase: number, grip: number, maxSteer: number}} tuning
 * @param {number} speed m/s.
 */
export function steeringLockAt(tuning, speed) {
  const lock = Math.atan((tuning.wheelbase * G * tuning.grip * 1.5) / Math.max(speed * speed, 1)) + 0.012;
  return lock > tuning.maxSteer ? tuning.maxSteer : lock;
}

/**
 * Pure-pursuit steering towards a target point.
 * @param {number} x Car position (the centre of the rear axle is close enough).
 * @param {number} z
 * @param {number} heading Compass heading of the car.
 * @param {number} targetX
 * @param {number} targetZ
 * @param {number} wheelbase Metres.
 * @param {number} lock Steering lock now, radians.
 * @returns {number} steer -1 (left) .. 1 (right).
 */
export function pursuitSteer(x, z, heading, targetX, targetZ, wheelbase, lock) {
  const fx = Math.sin(heading);
  const fz = -Math.cos(heading);
  const dx = targetX - x;
  const dz = targetZ - z;
  const forward = dx * fx + dz * fz;
  const right = dx * -fz + dz * fx;
  const distanceSquared = dx * dx + dz * dz;
  if (distanceSquared < 1e-6) return 0;
  let angle;
  if (forward <= 0) angle = right >= 0 ? lock : -lock;
  else angle = Math.atan((2 * wheelbase * right) / distanceSquared);
  const steer = angle / Math.max(lock, 1e-3);
  return steer > 1 ? 1 : steer < -1 ? -1 : steer;
}

/**
 * The speed a driver cruises at on a lane.
 * @param {number} speedLimit m/s.
 * @param {number} temper 0.85 (calm) .. 1.1 (in a hurry).
 */
export function cruiseSpeed(speedLimit, temper) {
  return (speedLimit || 13.9) * temper;
}

/**
 * Fastest speed that keeps a safe distance behind a car ahead.
 * @param {number} gap Metres between bumpers.
 * @param {number} leaderSpeed m/s along our way (0 for anything standing).
 * @param {number} [ownSpeed] The follower's speed, m/s: a reaction margin of a third of a second.
 * @param {number} [braking] m/s^2 the follower plans with.
 */
export function followingSpeed(gap, leaderSpeed, ownSpeed = 0, braking = 3) {
  const leader = leaderSpeed > 0 ? leaderSpeed : 0;
  const room = gap - STANDING_GAP - leader * HEADWAY_SECONDS - (ownSpeed > 0 ? ownSpeed * 0.35 : 0);
  if (room <= 0) return leader * Math.max(0, (gap - STANDING_GAP) / (leader * HEADWAY_SECONDS + 1e-3)) * 0.9;
  return Math.sqrt(leader * leader + 2 * braking * room);
}

/**
 * Turns a wanted speed into the fleet's pedals, gently.
 * @param {number} target Wanted speed, m/s.
 * @param {number} speed Speed now (forward), m/s.
 * @param {{throttle: number, brake: number, handbrake: number}} controls Written.
 * @param {number} [eagerness] Most throttle the driver uses, 0..1.
 */
export function applyPedals(target, speed, controls, eagerness = 0.55) {
  controls.handbrake = 0;
  if (target < 0.25 && speed < 1.2) {
    controls.throttle = 0;
    controls.brake = 1;
    return controls;
  }
  const error = target - speed;
  if (error > 0.25) {
    const throttle = 0.12 + error * 0.16;
    controls.throttle = throttle > eagerness ? eagerness : throttle;
    controls.brake = 0;
  } else if (error < -0.5) {
    const brake = 0.05 - error * 0.3;
    controls.brake = brake > 1 ? 1 : brake;
    controls.throttle = 0;
  } else {
    // Hold the speed: a light throttle against the drag, nothing when a little fast.
    controls.throttle = error > -0.2 ? 0.1 + error * 0.1 : 0;
    controls.brake = 0;
  }
  return controls;
}
