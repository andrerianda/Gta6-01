// A person thrown as a ragdoll (hit by a car, blown off the feet), for the locomotion controller:
// starts the physics body (physics/ragdoll.js) from the current pose, steps it, keeps the instance
// on the pelvis, and once it comes to rest turns the instance to the way the body lies and blends
// the points (RAGDOLL_SETTLE_SECONDS) into the matching lying pose, after which the controller
// puts the person in the 'fallen' stance. No allocation per frame.
import { writeLyingPoseAfter } from '../motion/deathFall.js';
import {
  createRagdoll, restingPlacement, settleRagdollTowards, startRagdoll, stepRagdoll, writeRagdollPose,
} from '../physics/ragdoll.js';
import { computeForwardKinematics } from '../skeleton/forwardKinematics.js';
import { smoothStep } from '../skeleton/quaternionMath.js';

/**
 * Creates the ragdoll driver of one person (inactive).
 * @param {import('../skeleton/bodyMeasurements.js').BodyModel} body
 */
export function createRagdollDriver(body) {
  return {
    ragdoll: createRagdoll(body),
    placement: { direction: 'back', x: 0, z: 0, yaw: 0 },
    /** The yaw the instance keeps while thrown, then the way the body lies. */
    yaw: 0,
    /** The way the body came to lie ('back' | 'forward' | 'left' | 'right'). */
    direction: 'back',
    /** The weight to blend the written pose with (eases in over 80 ms). */
    weight: 0,
    blendIn: 0,
    settle: -1,
    getUp: false,
  };
}

/** Seconds a ragdoll at rest takes to blend into the lying pose of the way it landed. */
export const RAGDOLL_SETTLE_SECONDS = 0.5;
/** stepRagdollPose results: the step the body came to rest, and the step it finished settling. */
export const RAGDOLL_LANDED = 1;
export const RAGDOLL_SETTLED = 2;

/**
 * Throws the person from the pose in `fk` (see the controller header, RAGDOLL, for options).
 * @param {object} d The driver.
 * @param {import('../skeleton/forwardKinematics.js').FkState} fk
 * @param {{ x: number, y: number, z: number }} position The instance's position.
 * @param {number} yaw
 * @param {object} options
 * @param {((x: number, z: number) => number) | null} ground The person's ground (setGround), used when options give none.
 */
export function throwAsRagdoll(d, fk, position, yaw, options, ground) {
  d.yaw = yaw; d.blendIn = 0; d.weight = 0; d.settle = -1; d.getUp = Boolean(options.getUp);
  startRagdoll(d.ragdoll, fk, position, yaw, options.ground || !ground ? options : { ...options, ground });
}

/** Stops the ragdoll at once (a reset). */
export function stopRagdoll(d) {
  d.ragdoll.active = false; d.settle = -1;
}

/**
 * Advances the thrown body one step, moves the instance's position `at` with it and writes its pose
 * into `out` (blend it with d.weight). Returns RAGDOLL_LANDED on the step it came to rest (d.yaw
 * and d.direction then say how it lies), RAGDOLL_SETTLED when the blend into the lying pose is
 * complete (the ragdoll is inactive again), else 0.
 */
export function stepRagdollPose(d, step, body, fk, at, out, spare, time) {
  const rd = d.ragdoll, P = rd.pos;
  let result = 0;
  if (d.settle < 0) {
    stepRagdoll(rd, step);
    at.x = (P[0] + P[3]) / 2; at.z = (P[2] + P[5]) / 2;
    at.y = rd.ground ? rd.ground(at.x, at.z) : rd.floor;
    if (rd.resting) {
      restingPlacement(rd, d.placement);
      at.x = d.placement.x; at.z = d.placement.z;
      at.y = rd.ground ? rd.ground(at.x, at.z) : rd.floor;
      d.yaw = d.placement.yaw; d.direction = d.placement.direction; d.settle = 0;
      result = RAGDOLL_LANDED;
    }
  } else d.settle = Math.min(1, d.settle + step / RAGDOLL_SETTLE_SECONDS);
  if (d.settle >= 0) { // the points move to the lying pose's joints; the pose follows them
    writeLyingPoseAfter(spare, body, fk, d.direction, time);
    computeForwardKinematics(body, spare, fk);
    settleRagdollTowards(rd, fk, at, d.yaw, smoothStep(0, 1, d.settle), result === RAGDOLL_LANDED);
  }
  writeRagdollPose(out, body, fk, rd, at.x, at.y, at.z, d.yaw);
  d.blendIn = Math.min(1, d.blendIn + step / 0.08);
  d.weight = smoothStep(0, 1, d.blendIn);
  if (d.settle >= 1) {
    rd.active = false; d.settle = -1;
    return RAGDOLL_SETTLED;
  }
  return result;
}
