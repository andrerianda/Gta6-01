// Standing still, alive: slow breathing, the weight drifting from one leg to the other with the
// hip of the unloaded side dropping, small turns of the pelvis, chest and head. It gives offsets
// that the locomotion pose adds to a standing body and fades out as the person starts to walk.
// A seed shifts every rhythm, so a crowd never moves in step.

/**
 * The offsets of one moment of standing.
 * @typedef {object} IdleSample
 * @property {number} breath -1 breathed out, +1 breathed in.
 * @property {number} sway Pelvis sideways, reference metres (+ to the right).
 * @property {number} list Pelvis roll, radians (negative: the right hip drops).
 * @property {number} drop Pelvis height offset, reference metres (negative: lower).
 * @property {number} pelvisYaw Radians, positive to the left.
 * @property {number} chestYaw Radians, positive to the left.
 * @property {number} headYaw Radians, positive to the left.
 * @property {number} headPitch Radians, positive looks down.
 * @property {number} headRoll Radians.
 * @property {number} armDrift Radians of forward and back drift of the hanging arms.
 */

/**
 * Creates the storage for an idle sample.
 * @returns {IdleSample}
 */
export function createIdleSample() {
  return { breath: 0, sway: 0, list: 0, drop: 0, pelvisYaw: 0, chestYaw: 0, headYaw: 0, headPitch: 0, headRoll: 0, armDrift: 0 };
}

const TWO_PI = Math.PI * 2;

/**
 * Samples the standing idle.
 * @param {IdleSample} out Receives the offsets.
 * @param {number} time Seconds.
 * @param {number} [seed] Any number; people with different seeds stand differently.
 * @param {import('./movementStyle.js').MovementStyle | null} [style] Slower, smaller idles for the old.
 * @returns {IdleSample} `out`.
 */
export function sampleIdleStance(out, time, seed = 0, style = null) {
  const a = seed * 12.9898, b = seed * 78.233;
  const pace = (1 + 0.18 * Math.sin(a)) * (style ? style.idlePace : 1);
  const amount = style ? style.idleSway : 1;
  const breath = Math.sin(TWO_PI * time / (4.1 * pace) + a);
  // The weight rests on one leg for a while, then crosses over: a flattened slow wave.
  const cross = Math.sin(TWO_PI * time / (10.5 * pace) + b) + 0.35 * Math.sin(TWO_PI * time / (4.3 * pace) + a * 0.7);
  const weight = cross / Math.sqrt(1 + cross * cross * 1.6) * 1.25 * Math.min(1.2, amount);
  const drift = Math.sin(TWO_PI * time / (7.3 * pace) + b * 0.37);
  const glance = Math.sin(TWO_PI * time / (13.7 * pace) + a * 1.9) * Math.sin(TWO_PI * time / (5.9 * pace) + b);
  // Now and then a real look round: the head turns well to one side, holds, comes back (about
  // once in 20 seconds, a smooth bump, so it never snaps).
  const lookCycle = 19 * pace, at = (((time + seed * 7.31) % lookCycle) + lookCycle) % lookCycle;
  const look = at < 3.2 ? Math.sin(Math.PI * at / 3.2) ** 2 : 0;
  const lookSide = Math.sin(Math.floor((time + seed * 7.31) / lookCycle) * 2.1 + a) >= 0 ? 1 : -1;
  out.breath = breath;
  out.sway = 0.03 * weight;
  out.list = 0.035 * weight;
  out.drop = -0.003 - 0.007 * weight * weight;
  out.pelvisYaw = 0.03 * drift * amount;
  out.chestYaw = (-0.025 * drift + 0.02 * glance) * amount + 0.08 * look * lookSide;
  out.headYaw = 0.1 * glance * amount + 0.42 * look * lookSide;
  out.headPitch = 0.02 * Math.sin(TWO_PI * time / (8.9 * pace) + a) - 0.01 * breath;
  out.headRoll = -0.02 * weight;
  out.armDrift = 0.025 * drift + 0.012 * breath;
  return out;
}
