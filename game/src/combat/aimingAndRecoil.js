// How true a shot flies and how the gun kicks: the cone of spread (the weapon's half-angle,
// wider unaimed, moving, from a car and right after other shots: the bloom), random directions
// inside that cone, and recoil that lifts the aim with every shot and settles back. Pure maths
// on plain numbers and arrays: tools/tests/combat/.

/**
 * The state of one shooter's aim between shots.
 * @returns {{bloom: number, kickPitch: number, kickYaw: number}}
 */
export function createAimState() {
  return { bloom: 0, kickPitch: 0, kickYaw: 0 };
}

/**
 * The half-angle of the cone a shot leaves in, radians.
 * @param {object} weapon A WEAPON_CATALOG entry.
 * @param {{aiming?: boolean, moving?: number, crouching?: boolean, inVehicle?: boolean, bloom?: number}} how
 *   moving is 0 (still) to 1 (running).
 * @param {object} rules COMBAT_RULES.
 */
export function spreadOf(weapon, how, rules) {
  let spread = weapon.spread;
  if (!how.aiming) spread *= rules.unaimedSpreadMultiplier;
  if (how.moving) spread *= 1 + (weapon.movingSpreadMultiplier - 1) * Math.min(1, how.moving);
  if (how.crouching) spread *= rules.crouchSpreadMultiplier;
  if (how.inVehicle) spread *= 1.6;
  return spread * (1 + (how.bloom ?? 0));
}

/**
 * Bloom and kick after one shot. The kick lifts the aim by the weapon's recoil and nudges it
 * sideways a little; the bloom widens the cone by up to 1.5 times.
 * @param {ReturnType<typeof createAimState>} aim
 * @param {object} weapon
 * @param {number} sideways A random number in [0, 1).
 */
export function kickAfterShot(aim, weapon, sideways) {
  aim.kickPitch += weapon.recoil;
  aim.kickYaw += (sideways - 0.5) * weapon.recoil * 0.6;
  aim.bloom = Math.min(1.5, aim.bloom + 0.35 + weapon.recoil * 4);
}

/**
 * Lets the kick and the bloom settle (exponentially, about a third of a second).
 * @returns {{pitch: number, yaw: number}} How much of the kick settled this step (to undo it).
 */
export function settleAim(aim, seconds, out = { pitch: 0, yaw: 0 }) {
  const keep = Math.exp(-seconds * 7);
  out.pitch = aim.kickPitch * (1 - keep);
  out.yaw = aim.kickYaw * (1 - keep);
  aim.kickPitch -= out.pitch;
  aim.kickYaw -= out.yaw;
  aim.bloom *= Math.exp(-seconds * 3.2);
  return out;
}

/**
 * A direction inside a cone around a unit direction, uniform over the cone's cross-section.
 * @param {number[] | Float32Array} out Receives x, y, z.
 * @param {number} dx Unit direction.
 * @param {number} dy
 * @param {number} dz
 * @param {number} halfAngle Radians.
 * @param {number} u1 Random in [0, 1).
 * @param {number} u2 Random in [0, 1).
 */
export function directionInCone(out, dx, dy, dz, halfAngle, u1, u2) {
  const radius = Math.tan(halfAngle) * Math.sqrt(u1);
  const turn = u2 * Math.PI * 2;
  // Two axes across the direction.
  let ax = -dz, ay = 0, az = dx;
  let length = Math.hypot(ax, az);
  if (length < 1e-6) { ax = 1; az = 0; length = 1; }
  ax /= length; az /= length;
  const bx = dy * az - dz * ay, by = dz * ax - dx * az, bz = dx * ay - dy * ax;
  const c = Math.cos(turn) * radius, s = Math.sin(turn) * radius;
  const x = dx + ax * c + bx * s, y = dy + ay * c + by * s, z = dz + az * c + bz * s;
  const n = 1 / Math.hypot(x, y, z);
  out[0] = x * n; out[1] = y * n; out[2] = z * n;
  return out;
}

/** Aims within this pitch of level keep the shooting arm level (owner, 09:00). */
export const LEVEL_ARM_PITCH = (15 * Math.PI) / 180;

/**
 * The pitch the shooting arm takes for the camera's aim pitch (owner, 09:00: the arm follows the
 * camera's aim DIRECTION, not the hit point on the pavement): level within LEVEL_ARM_PITCH of
 * level, so the hand stays at shoulder height, then tilting faster to meet the camera's pitch at
 * three times that angle, and the camera's own pitch beyond.
 * @param {number} pitch The camera's pitch, radians (+ up).
 * @returns {number} The arm's pitch, radians.
 */
export function armAimPitch(pitch) {
  const size = Math.abs(pitch);
  if (size <= LEVEL_ARM_PITCH) return 0;
  const full = LEVEL_ARM_PITCH * 3;
  const posed = size >= full ? size : (size - LEVEL_ARM_PITCH) * (full / (full - LEVEL_ARM_PITCH));
  return Math.sign(pitch) * posed;
}
