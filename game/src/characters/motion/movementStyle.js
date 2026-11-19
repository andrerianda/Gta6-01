// How one person moves: the same gait model for everybody, shaded by age, build and a personal
// seed. An older person takes shorter, quicker steps with less push-off, a little stoop and a
// smaller arm swing; a heavy person walks with the feet further apart, more side to side, the
// arms held a little out; an athletic one swings the arms more and carries the chest high. The
// numbers are small multipliers and offsets on the gait (gaitModel.js) and the pose
// (locomotionPose.js); the neutral style changes nothing. Pure data; no allocation per frame.

/**
 * A movement style.
 * @typedef {object} MovementStyle
 * @property {number} stride Stride length at a given speed, x (shorter: more, quicker steps).
 * @property {number} armSwing Arm swing amplitude, x.
 * @property {number} elbow Extra elbow bend, radians.
 * @property {number} armOut Extra abduction of the arms, radians.
 * @property {number} stoop Extra forward bend of the upper back, radians.
 * @property {number} headForward Head carried forward (the neck bent forward, the face kept level), radians.
 * @property {number} knee Extra knee bend while walking (pelvis lower), reference metres.
 * @property {number} width Extra half step width, reference metres.
 * @property {number} sway Side-to-side pelvis travel, x.
 * @property {number} pelvis Pelvis turn and drop, x.
 * @property {number} bounce Vertical bob, x.
 * @property {number} pushOff Heel-strike and toe-off foot angles, x.
 * @property {number} idlePace Idle rhythms (breathing, weight shifts), x (above 1: slower).
 * @property {number} idleSway Idle weight shift and glances, x.
 * @property {number} chest Chest carried high (negative: slumped), radians of upper-back extension.
 */

/** The style that changes nothing. */
export const NEUTRAL_STYLE = Object.freeze({
  stride: 1, armSwing: 1, elbow: 0, armOut: 0, stoop: 0, headForward: 0, knee: 0, width: 0, sway: 1,
  pelvis: 1, bounce: 1, pushOff: 1, idlePace: 1, idleSway: 1, chest: 0,
});

const AGE = {
  young_adult: { stride: 1.02, armSwing: 1.08, stoop: -0.01, headForward: 0, knee: 0, pushOff: 1.05, idlePace: 0.92, idleSway: 1.15, chest: 0.01 },
  adult: { stride: 1, armSwing: 1, stoop: 0, headForward: 0, knee: 0, pushOff: 1, idlePace: 1, idleSway: 1, chest: 0 },
  middle_aged: { stride: 0.97, armSwing: 0.9, stoop: 0.025, headForward: 0.03, knee: 0.004, pushOff: 0.92, idlePace: 1.08, idleSway: 0.9, chest: -0.01 },
  senior: { stride: 0.86, armSwing: 0.62, stoop: 0.09, headForward: 0.09, knee: 0.014, pushOff: 0.7, idlePace: 1.25, idleSway: 0.75, chest: -0.03 },
};
const BUILD = {
  slim: { width: -0.005, sway: 0.9, armOut: 0, armSwing: 1.04, bounce: 1.05, pelvis: 1.05 },
  average: { width: 0, sway: 1, armOut: 0, armSwing: 1, bounce: 1, pelvis: 1 },
  athletic: { width: 0.004, sway: 0.9, armOut: 0.03, armSwing: 1.1, bounce: 1.05, pelvis: 1, chest: 0.025 },
  heavy: { width: 0.022, sway: 1.45, armOut: 0.07, armSwing: 0.82, bounce: 0.85, pelvis: 0.85, elbow: 0.05 },
};

/** A repeatable pseudo-random number in [-1, 1] from a seed and a channel. */
function wobble(seed, channel) {
  const s = Math.sin(seed * 12.9898 + channel * 78.233) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

/**
 * Builds a person's movement style.
 * @param {object} [traits]
 * @param {string} [traits.ageBand] 'young_adult' | 'adult' | 'middle_aged' | 'senior'
 * @param {string} [traits.build] 'slim' | 'average' | 'athletic' | 'heavy'
 * @param {number} [traits.seed] Personal variation (any number; 0 none beyond age and build).
 * @returns {MovementStyle}
 */
export function createMovementStyle(traits = {}) {
  const age = AGE[traits.ageBand] ?? AGE.adult, build = BUILD[traits.build] ?? BUILD.average;
  const seed = traits.seed ?? 0, personal = seed ? 1 : 0;
  const w = (channel) => personal * wobble(seed, channel);
  return Object.freeze({
    stride: age.stride * (1 + 0.035 * w(1)),
    armSwing: age.armSwing * build.armSwing * (1 + 0.12 * w(2)),
    elbow: (build.elbow ?? 0) + 0.05 * w(3),
    armOut: build.armOut + 0.015 * w(4),
    stoop: age.stoop + 0.015 * w(5),
    headForward: age.headForward + 0.02 * w(6),
    knee: age.knee,
    width: build.width + 0.006 * w(7),
    sway: build.sway * (1 + 0.15 * w(8)),
    pelvis: build.pelvis * (1 + 0.12 * w(9)),
    bounce: build.bounce * (1 + 0.1 * w(10)),
    pushOff: age.pushOff,
    idlePace: age.idlePace * (1 + 0.08 * w(11)),
    idleSway: age.idleSway * (1 + 0.15 * w(12)),
    chest: age.chest + (build.chest ?? 0) + 0.01 * w(13),
  });
}
