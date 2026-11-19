// Feet that stay where they were put. The gait model plants its feet exactly while the speed and
// heading are steady, but a person also speeds up, stops dead, turns on the spot and curves: the
// gait then asks a standing foot to drift with the body. The lock keeps each standing foot's
// ground point (its pivot: the heel, the sole or the ball) and its heading fixed in the world
// while the gait says it carries weight, and hands it back to the gait smoothly over the next
// swing. Standing still with the feet left apart or twisted (after a stop or a turn), it takes a
// short settling step to bring them back under the body. Works in world space from the
// instance's position, yaw and scale; no allocation per frame.
import { LEGS } from '../skeleton/humanSkeleton.js';
import { computeForwardKinematics } from '../skeleton/forwardKinematics.js';
import { quatFromAxisAngle, quatMultiply, quatRotate, smoothStep } from '../skeleton/quaternionMath.js';
import { orientBoneTo, reachWithLimb } from './limbPosing.js';

/** A standing foot further than this from where the stance wants it (metres) steps back in. */
export const SETTLE_DISTANCE = 0.07;
/** ...or turned further than this (radians). */
export const SETTLE_TURN = 0.3;
/** Seconds of a settling step. */
export const SETTLE_SECONDS = 0.34;
/** A lock further than this from the gait (metres) is dropped (a teleport, a long hitch). */
const LOCK_BREAK = 0.6;

const FREE = 0, LOCKED = 1, SETTLING = 2;
const v = new Float32Array(4);
const q = new Float32Array(8);

/**
 * Creates the lock state of both feet.
 * @returns {object}
 */
export function createFootLock() {
  const foot = () => ({
    mode: FREE, lockX: 0, lockZ: 0, lockYaw: 0, offX: 0, offZ: 0, offYaw: 0, relX: 0, relZ: 0, relYaw: 0, t: 0, lift: 0,
    gx: 0, gz: 0, gyaw: 0, px: 0, pz: 0, kind: 0,
  });
  return { feet: [foot(), foot()], settling: -1 };
}

/** Lets go of both feet (a teleport, a seat, a fall): the gait has them again at once. */
export function releaseFootLock(lock) {
  for (const foot of lock.feet) {
    foot.mode = FREE; foot.offX = 0; foot.offZ = 0; foot.offYaw = 0; foot.relX = 0; foot.relZ = 0; foot.relYaw = 0; foot.lift = 0;
  }
  lock.settling = -1;
}

const point = new Float64Array(2);

/**
 * The ground point of a foot that stands still in a steady gait, in the body's space, written to
 * `point`: the heel while it rolls down (kind -1), the ankle over the flat sole (0), the toe joint
 * while the heel rises (1); less its distance along the foot, it is the same ground point
 * whichever of the three carries the weight.
 */
function stillPoint(kind, body, fk, leg, fx, fz) {
  const rest = body.restPosition, p = fk.position, a3 = leg.end * 3, t3 = leg.tip * 3;
  if (kind < 0) {
    quatRotate(v, 0, fk.rotation, leg.end * 4, 0, -rest[a3 + 1], body.heelBack);
    point[0] = p[a3] + v[0] + fx * body.heelBack; point[1] = p[a3 + 2] + v[2] + fz * body.heelBack;
  } else if (kind > 0) {
    // (the toe joint less its rest offset from the ankle, turned with the foot)
    const dx = rest[t3] - rest[a3], dz = rest[t3 + 2] - rest[a3 + 2];
    point[0] = p[t3] - (dx * -fz - dz * fx); point[1] = p[t3 + 2] - (dx * fx + dz * -fz);
  } else {
    point[0] = p[a3]; point[1] = p[a3 + 2];
  }
}

const wrap = (a) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));

/**
 * Applies the lock to a locomotion pose just written (its fk up to date).
 * @param {object} lock From createFootLock.
 * @param {Float32Array} pose
 * @param {import('../skeleton/bodyMeasurements.js').BodyModel} body
 * @param {import('../skeleton/forwardKinematics.js').FkState} fk
 * @param {{gait: object, footL: object, footR: object}} scratch The locomotion scratch the pose was written with.
 * @param {{x: number, y: number, z: number}} at The instance's world position.
 * @param {number} yaw The instance's yaw.
 * @param {number} scale The instance's uniform scale.
 * @param {number} dt Seconds.
 * @returns {boolean} Whether the pose changed.
 */
export function applyFootLock(lock, pose, body, fk, scratch, at, yaw, scale, dt) {
  const gait = scratch.gait, rest = body.restPosition, p = fk.position;
  const sin = Math.sin(yaw), cos = Math.cos(yaw), s = scale > 0 ? scale : 1;
  const standing = gait.move < 0.05;
  let changed = false;
  // Measure both feet: the gait's pivot in the world and the foot's heading.
  for (let side = 0; side < 2; side += 1) {
    const leg = LEGS[side], sample = side ? scratch.footR : scratch.footL, foot = lock.feet[side];
    const a3 = leg.end * 3, t3 = leg.tip * 3;
    // The point of the foot that stands still in a steady gait: the heel while it rolls down, the
    // ankle over the flat sole, the toe joint while the heel rises; less its distance along the
    // foot, it is the same ground point whichever of the three carries the weight.
    quatRotate(v, 0, fk.rotation, leg.end * 4, 0, 0, -1);
    const fl = Math.hypot(v[0], v[2]) || 1, fx = v[0] / fl, fz = v[2] / fl;
    const footYaw = yaw + Math.atan2(-v[0], -v[2]);
    const kind = Math.sign(sample.pivotLocal);
    stillPoint(kind, body, fk, leg, fx, fz);
    const px = point[0], pz = point[1];
    const wx = at.x + s * (px * cos + pz * sin), wz = at.z + s * (-px * sin + pz * cos);
    foot.gx = wx; foot.gz = wz; foot.gyaw = footYaw; foot.px = px; foot.pz = pz;
    const planted = sample.planted === 1 || standing;
    if (foot.mode === LOCKED) {
      if (!planted) {
        // (released with the offset it last had: a swinging foot has no still point to compare)
        foot.mode = FREE; foot.relX = foot.offX; foot.relZ = foot.offZ; foot.relYaw = foot.offYaw;
      } else {
        // (when the weight passes from heel to sole to ball, this frame still holds the old still
        // point, and the new one is held from where that leaves it: on a slope the three points'
        // "same ground point" differ by millimetres, which must not show as a jump)
        // (not into the ball when running: a runner's rise onto the toes moves the ankle that frame)
        if (kind !== foot.kind && (foot.kind < 0 || gait.run < 0.5)) {
          stillPoint(foot.kind, body, fk, leg, fx, fz);
          const ox = at.x + s * (point[0] * cos + point[1] * sin), oz = at.z + s * (-point[0] * sin + point[1] * cos);
          foot.lockX += wx - ox; foot.lockZ += wz - oz;
        }
        foot.offX = foot.lockX - wx; foot.offZ = foot.lockZ - wz; foot.offYaw = wrap(foot.lockYaw - footYaw);
        if (Math.hypot(foot.offX, foot.offZ) > LOCK_BREAK * s) {
          foot.mode = FREE; foot.relX = 0; foot.relZ = 0; foot.relYaw = 0; foot.offX = 0; foot.offZ = 0; foot.offYaw = 0;
        }
      }
    } else if (foot.mode === SETTLING) {
      foot.t += dt / SETTLE_SECONDS;
      if (!standing) {
        foot.mode = FREE; foot.relX = foot.offX; foot.relZ = foot.offZ; foot.relYaw = foot.offYaw; foot.lift = 0;
        lock.settling = -1;
      }
    }
    if (foot.mode === FREE) {
      // Handed back to the gait over the first three quarters of the swing.
      if (sample.swing > 0) {
        const k = 1 - smoothStep(0, 0.75, sample.swing);
        foot.offX = foot.relX * k; foot.offZ = foot.relZ * k; foot.offYaw = foot.relYaw * k;
      } else {
        const decay = Math.exp(-12 * dt);
        foot.offX *= decay; foot.offZ *= decay; foot.offYaw *= decay;
      }
      if (planted) {
        foot.mode = LOCKED;
        foot.lockX = wx + foot.offX; foot.lockZ = wz + foot.offZ; foot.lockYaw = footYaw + foot.offYaw;
      }
    }
    foot.kind = kind;
  }
  // Standing with a foot left out of place: one settling step at a time.
  if (standing && lock.settling < 0) {
    let worst = -1, score = 1;
    for (let side = 0; side < 2; side += 1) {
      const foot = lock.feet[side];
      if (foot.mode !== LOCKED) continue;
      const need = Math.max(Math.hypot(foot.offX, foot.offZ) / (SETTLE_DISTANCE * s), Math.abs(foot.offYaw) / SETTLE_TURN);
      if (need > score) { score = need; worst = side; }
    }
    if (worst >= 0) {
      const foot = lock.feet[worst];
      foot.mode = SETTLING; foot.t = 0; foot.relX = foot.offX; foot.relZ = foot.offZ; foot.relYaw = foot.offYaw;
      lock.settling = worst;
    }
  }
  for (let side = 0; side < 2; side += 1) {
    const foot = lock.feet[side];
    if (foot.mode !== SETTLING) continue;
    const t = Math.min(1, foot.t), k = 1 - smoothStep(0.1, 0.9, t);
    foot.offX = foot.relX * k; foot.offZ = foot.relZ * k; foot.offYaw = foot.relYaw * k;
    foot.lift = 0.05 * body.legScale * Math.sin(Math.PI * t);
    if (t >= 1) {
      foot.mode = LOCKED; foot.lift = 0; foot.lockX = foot.gx; foot.lockZ = foot.gz; foot.lockYaw = foot.gyaw;
      foot.offX = 0; foot.offZ = 0; foot.offYaw = 0;
      lock.settling = -1;
    }
  }
  // Pose the legs to the locked feet.
  for (let side = 0; side < 2; side += 1) {
    const foot = lock.feet[side], leg = LEGS[side];
    if (Math.abs(foot.offX) + Math.abs(foot.offZ) < 1e-4 && Math.abs(foot.offYaw) < 1e-4 && foot.lift <= 0) continue;
    changed = true;
    const a3 = leg.end * 3, k3 = leg.lower * 3, h3 = leg.upper * 3;
    // the offset into the body's space, and the turn about the pivot
    const ox = (foot.offX * cos - foot.offZ * sin) / s, oz = (foot.offX * sin + foot.offZ * cos) / s;
    const c = Math.cos(foot.offYaw), sn = Math.sin(foot.offYaw);
    const rx = p[a3] - foot.px, rz = p[a3 + 2] - foot.pz;
    const tx = foot.px + ox + rx * c + rz * sn, ty = p[a3 + 1] + foot.lift, tz = foot.pz + oz - rx * sn + rz * c;
    // keep the knee pointing where the gait had it
    const mx = (p[h3] + p[a3]) / 2, my = (p[h3 + 1] + p[a3 + 1]) / 2, mz = (p[h3 + 2] + p[a3 + 2]) / 2;
    let kx = p[k3] - mx, ky = p[k3 + 1] - my, kz = p[k3 + 2] - mz;
    const n = Math.hypot(kx, ky, kz);
    if (n < 1e-4) { kx = 0; ky = 0.2; kz = -1; } else { kx /= n; ky /= n; kz /= n; }
    q.set(fk.rotation.subarray(leg.end * 4, leg.end * 4 + 4), 4);
    computeForwardKinematics(body, pose, fk, leg.upper, leg.upper);
    reachWithLimb(pose, body, fk, leg, tx, ty, tz, kx, ky, kz, 0.003);
    quatFromAxisAngle(q, 0, 0, 1, 0, foot.offYaw);
    quatMultiply(q, 0, q, 0, q, 4);
    orientBoneTo(pose, fk, leg.end, q, 0);
    computeForwardKinematics(body, pose, fk, leg.tip, leg.tip);
  }
  return changed;
}

/** The world pivot a foot is locked at (for tests), or null. */
export function lockedPivot(lock, side) {
  const foot = lock.feet[side];
  return foot.mode === LOCKED ? { x: foot.lockX, z: foot.lockZ, yaw: foot.lockYaw } : null;
}
