// The Manta Sombra's guided glide bomb as numbers: what may be bombed (only the unmanned coastal
// radar tower: "no bombing of city places"), the release solution (time of fall, where an
// unguided drop would land, how far the fins can move that point), and the flight after release:
// a ballistic fall steered sideways and along the track by fins of limited authority. Released
// inside the envelope it hits; outside it the fins run out of authority and it misses.
// Pure: no DOM, no three.js, nothing allocated per step.

/** The bomb's numbers (SI). */
export const GUIDED_BOMB = Object.freeze({
  gravity: 9.81,
  /** The fins' steering authority: horizontal acceleration, m/s². */
  steerAcceleration: 5.2,
  /** The share of the theoretical reach the release cue trusts. */
  envelopeMargin: 0.8,
  /** No release under this height above the target, metres (the fuze needs the fall). */
  minimumHeight: 300,
  /** No release in a steeper bank than this, radians, or while descending or climbing faster than this, m/s. */
  maximumBank: 0.6,
  maximumVerticalSpeed: 40,
  /** Within this distance of the aim point the target is destroyed, metres. */
  hitRadius: 16,
  /** The seeker designates what lies within this distance and this angle off the nose, degrees. */
  seekerRange: 12000,
  seekerHalfAngle: 60,
});

/** The only kind of target the bomb may be released on. */
export const VALID_BOMB_TARGET_KIND = 'tower';

/**
 * Whether a designated target may be bombed.
 * @param {{kind?: string, alive?: boolean} | null | undefined} target
 */
export function isValidBombTarget(target) {
  return Boolean(target) && target.kind === VALID_BOMB_TARGET_KIND && target.alive !== false;
}

/**
 * The target the seeker designates: the nearest live candidate inside its cone.
 * @param {{x: number, z: number, heading: number}} craft Compass heading in radians.
 * @param {ArrayLike<{x: number, z: number, alive?: boolean}>} candidates
 * @returns {object | null} One of `candidates`.
 */
export function designateTarget(craft, candidates) {
  let best = null;
  let bestDistance = GUIDED_BOMB.seekerRange;
  const nx = Math.sin(craft.heading);
  const nz = -Math.cos(craft.heading);
  const cosine = Math.cos((GUIDED_BOMB.seekerHalfAngle * Math.PI) / 180);
  for (let i = 0; i < candidates.length; i += 1) {
    const c = candidates[i];
    if (!c || c.alive === false) continue;
    const dx = c.x - craft.x;
    const dz = c.z - craft.z;
    const distance = Math.hypot(dx, dz);
    if (distance > bestDistance || (distance > 1 && (dx * nx + dz * nz) / distance < cosine)) continue;
    best = c;
    bestDistance = distance;
  }
  return best;
}

/**
 * Seconds to fall `height` metres starting with a vertical speed.
 * @param {number} height Metres above the target (> 0).
 * @param {number} [verticalSpeed] m/s, up positive.
 */
export function timeOfFall(height, verticalSpeed = 0) {
  if (!(height > 0)) return 0;
  const g = GUIDED_BOMB.gravity;
  return (verticalSpeed + Math.sqrt(verticalSpeed * verticalSpeed + 2 * g * height)) / g;
}

/**
 * A blank release solution.
 * @returns {{range: number, height: number, timeOfFall: number, missUnguided: number, authority: number, alongError: number,
 *   crossError: number, inRange: boolean, inEnvelope: boolean, reason: string}}
 */
export function createReleaseSolution() {
  return { range: 0, height: 0, timeOfFall: 0, missUnguided: 0, authority: 0, alongError: 0, crossError: 0, inRange: false, inEnvelope: false, reason: 'NO TARGET' };
}

/**
 * The release solution now.
 * @param {{x: number, y: number, z: number, vx: number, vy: number, vz: number, roll?: number}} craft World metres and m/s.
 * @param {{x: number, y: number, z: number} | null} target The aim point.
 * @param {ReturnType<typeof createReleaseSolution>} out `alongError` is how far short (+) or long (-) an unguided
 *   drop would fall, `crossError` how far to the right (+) of the track the target lies; `reason` is 'RELEASE' when
 *   the envelope is met, else 'NO TARGET', 'TOO LOW', 'UNSTABLE', 'TOO FAR', 'TOO CLOSE' or 'OFF AXIS'.
 */
export function releaseSolution(craft, target, out) {
  out.inRange = false; out.inEnvelope = false;
  if (!target) { out.reason = 'NO TARGET'; out.range = 0; out.timeOfFall = 0; out.missUnguided = 0; out.authority = 0; return out; }
  const dx = target.x - craft.x;
  const dz = target.z - craft.z;
  out.range = Math.hypot(dx, dz);
  out.height = craft.y - target.y;
  const t = timeOfFall(out.height, craft.vy);
  out.timeOfFall = t;
  const ex = dx - craft.vx * t;
  const ez = dz - craft.vz * t;
  const speed = Math.hypot(craft.vx, craft.vz) || 1;
  out.alongError = (ex * craft.vx + ez * craft.vz) / speed;
  out.crossError = (-ex * craft.vz + ez * craft.vx) / speed;
  out.missUnguided = Math.hypot(ex, ez);
  out.authority = 0.5 * GUIDED_BOMB.steerAcceleration * t * t * GUIDED_BOMB.envelopeMargin;
  out.inRange = Math.abs(out.alongError) <= out.authority;
  if (out.height < GUIDED_BOMB.minimumHeight) out.reason = 'TOO LOW';
  else if (Math.abs(craft.roll ?? 0) > GUIDED_BOMB.maximumBank || Math.abs(craft.vy) > GUIDED_BOMB.maximumVerticalSpeed) out.reason = 'UNSTABLE';
  else if (out.missUnguided <= out.authority) { out.reason = 'RELEASE'; out.inEnvelope = true; }
  else if (!out.inRange) out.reason = out.alongError > 0 ? 'TOO FAR' : 'TOO CLOSE';
  else out.reason = 'OFF AXIS';
  return out;
}

/**
 * A bomb at rest in the bay.
 * @returns {{active: boolean, x: number, y: number, z: number, vx: number, vy: number, vz: number, time: number,
 *   tx: number, ty: number, tz: number, timeToGo: number, steer: number}}
 */
export function createBombState() {
  return { active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, time: 0, tx: 0, ty: 0, tz: 0, timeToGo: 0, steer: 0 };
}

/**
 * Drops the bomb: it leaves with the aircraft's velocity.
 * @param {ReturnType<typeof createBombState>} bomb
 * @param {{x: number, y: number, z: number, vx: number, vy: number, vz: number}} craft
 * @param {{x: number, y: number, z: number}} target The aim point.
 */
export function releaseBomb(bomb, craft, target) {
  bomb.active = true;
  bomb.x = craft.x; bomb.y = craft.y - 2.5; bomb.z = craft.z;
  bomb.vx = craft.vx; bomb.vy = Math.min(craft.vy, 0) - 2; bomb.vz = craft.vz;
  bomb.tx = target.x; bomb.ty = target.y; bomb.tz = target.z;
  bomb.time = 0; bomb.steer = 0;
  bomb.timeToGo = timeOfFall(bomb.y - bomb.ty, bomb.vy);
  return bomb;
}

/**
 * One step of the fall: gravity, and the fins pushing the predicted impact point towards the target
 * with at most GUIDED_BOMB.steerAcceleration.
 * @param {ReturnType<typeof createBombState>} bomb
 * @param {number} dt Seconds.
 * @param {number} [groundHeight] The terrain under the bomb (it bursts there if it is above the aim point).
 * @returns {boolean} True when it has hit the ground (or the aim point's height) in this step; `bomb.active` is then false.
 */
export function stepBomb(bomb, dt, groundHeight = -Infinity) {
  if (!bomb.active) return false;
  const g = GUIDED_BOMB.gravity;
  const tgo = timeOfFall(bomb.y - bomb.ty, bomb.vy);
  bomb.timeToGo = tgo;
  let ax = 0;
  let az = 0;
  if (tgo > 0.05) {
    ax = (2 * (bomb.tx - bomb.x - bomb.vx * tgo)) / (tgo * tgo);
    az = (2 * (bomb.tz - bomb.z - bomb.vz * tgo)) / (tgo * tgo);
    const asked = Math.hypot(ax, az);
    const limit = GUIDED_BOMB.steerAcceleration;
    if (asked > limit) { ax *= limit / asked; az *= limit / asked; }
    bomb.steer = Math.min(1, asked / limit);
  }
  bomb.vx += ax * dt; bomb.vz += az * dt; bomb.vy -= g * dt;
  bomb.x += bomb.vx * dt; bomb.y += bomb.vy * dt; bomb.z += bomb.vz * dt;
  bomb.time += dt;
  const floor = Math.max(bomb.ty, Number.isFinite(groundHeight) ? groundHeight : -Infinity);
  if (bomb.y <= floor) {
    bomb.y = floor;
    bomb.active = false;
    return true;
  }
  return false;
}

/**
 * How far the bomb lies from its aim point (horizontal metres) and whether that destroys the target.
 * @param {ReturnType<typeof createBombState>} bomb
 * @param {{missDistance: number, hit: boolean}} out
 */
export function bombImpact(bomb, out) {
  out.missDistance = Math.hypot(bomb.x - bomb.tx, bomb.z - bomb.tz);
  out.hit = out.missDistance <= GUIDED_BOMB.hitRadius;
  return out;
}
