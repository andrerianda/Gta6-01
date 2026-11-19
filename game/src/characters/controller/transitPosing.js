// The pose of a person getting into or out of a vehicle, laid over the standing pose by the
// locomotion controller while a transit runs (motion/vehicleTransit.js times it and places the
// root): the seat blended in as the body lowers onto it, the fall of a hauled-out driver, the
// duck under the roof, and the busy hand on the door or the frame. The controller keeps the
// transit's bookkeeping (its events and the stance or seat it ends in). No allocation.
import { reachWithLimb } from '../ik/limbPosing.js';
import { applyFlinch, writeFallSequence } from '../motion/reactionPose.js';
import { writeSeatedPose } from '../motion/seatedPose.js';
import { computeForwardKinematics } from '../skeleton/forwardKinematics.js';
import { ARM_L, ARM_R } from '../skeleton/humanSkeleton.js';
import { readSeatAnchors } from './seatAnchors.js';

/**
 * @typedef {object} TransitPosing The controller's pieces a transit poses with.
 * @property {object} rig The character rig (pose, fk, instance).
 * @property {Float32Array} layerPose The layer scratch pose.
 * @property {Float32Array} sparePose A second scratch pose (the fall sequence).
 * @property {object} seat The seat input (seatedPose.js).
 * @property {object} seatNodes The seat's anchor nodes (seatAnchors.js).
 * @property {(weight: number) => void} endLayer Blends layerPose over the pose by weight.
 * @property {(floor?: number) => void} liftOverFeet Lifts the body so no foot is under the floor.
 */

/**
 * Writes a running transit's layers over the standing pose (rig.fk up to date).
 * @param {TransitPosing} ctx
 * @param {ReturnType<typeof import('../motion/vehicleTransit.js').createVehicleTransit>} transit
 * @param {'driver' | 'passenger'} seatKind The seat the transit goes to or comes from.
 * @param {number} time The person's clock.
 */
export function poseVehicleTransit(ctx, transit, seatKind, time) {
  const rig = ctx.rig, body = rig.body;
  if (transit.seatWeight > 0) {
    ctx.seat.kind = seatKind; ctx.seat.time = time;
    readSeatAnchors(ctx.seat, ctx.seatNodes, rig.instance);
    writeSeatedPose(ctx.layerPose, body, rig.fk, ctx.seat);
    ctx.endLayer(transit.seatWeight);
    if (transit.seatWeight < 1) ctx.liftOverFeet(transit.ground - transit.y);
  }
  if (transit.fall >= 0) {
    const weight = writeFallSequence(ctx.layerPose, ctx.sparePose, body, rig.fk, transit.fall, false, time);
    if (weight > 0) ctx.endLayer(weight);
    ctx.liftOverFeet();
  }
  if (transit.duck > 0) applyFlinch(rig.pose, body, rig.fk, 0, 1, transit.duck * 1.3);
  if (transit.hand && transit.handWeight > 0) {
    if (transit.hand !== 'right') reachTransitHand(rig, transit, ARM_L, transit.handL, transit.handWeight);
    if (transit.hand !== 'left') reachTransitHand(rig, transit, ARM_R, transit.handR, transit.handWeight);
  }
}

/** Moves a hand towards a world point by weight w (the transit's root and yaw are the frame). */
function reachTransitHand(rig, transit, arm, target, w) {
  const body = rig.body, sin = Math.sin(transit.yaw), cos = Math.cos(transit.yaw);
  const wx = target[0] - transit.x, wz = target[2] - transit.z;
  const lx = wx * cos - wz * sin, ly = target[1] - transit.y, lz = wx * sin + wz * cos, p = rig.fk.position, h = arm.end * 3;
  reachWithLimb(rig.pose, body, rig.fk, arm, p[h] + (lx - p[h]) * w, p[h + 1] + (ly - p[h + 1]) * w, p[h + 2] + (lz - p[h + 2]) * w,
    arm.side * 0.6, -0.7, 0.3);
  computeForwardKinematics(body, rig.pose, rig.fk, arm.end, arm.end);
}
