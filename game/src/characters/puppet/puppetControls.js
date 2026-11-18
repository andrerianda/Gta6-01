// The puppet: the control vector that motions write and the animation controller blends. A
// motion never touches a bone. It sets about a hundred named controls (where the pelvis is,
// how the spine bends, where each foot stands, where each hand reaches or how each arm is
// raised) in units that do not depend on the body: angles in radians and lengths in "reference
// metres", the size of things on a 1.78 m adult. poseFromControls() then turns the controls
// into a pose for the body at hand, with inverse kinematics, so one motion fits every person.
//
// Blending motions is linear interpolation of controls, an upper-body layer is a mask over
// them, and an additive layer simply adds. Signs: forward, up and "outward to the limb's own
// side" are positive; yaw is positive to the left; side bends and rolls are positive to the right.

/** Controls of the body's centre line. */
export const C = Object.freeze({
  /** Root joint: moves the whole figure (reference metres: right, up, forward). */
  ROOT_X: 0, ROOT_Y: 1, ROOT_Z: 2,
  /** Root joint: turns the whole figure about the point on the ground (forward tip, left turn, right roll). */
  ROOT_PITCH: 3, ROOT_YAW: 4, ROOT_ROLL: 5,
  /** Pelvis offset from standing (reference metres: right, up, forward). */
  PELVIS_X: 6, PELVIS_Y: 7, PELVIS_Z: 8,
  /** Pelvis rotation (forward tilt, left turn, right side down). */
  PELVIS_PITCH: 9, PELVIS_YAW: 10, PELVIS_ROLL: 11,
  /** 1 puts the hip joints on the character's origin, for sitting on a seat anchor. */
  SEAT: 12,
  /** Spine and chest together (forward bend, left twist, right side bend). */
  SPINE_PITCH: 13, SPINE_YAW: 14, SPINE_ROLL: 15,
  /** Chest alone, on top of the spine. */
  CHEST_PITCH: 16, CHEST_YAW: 17, CHEST_ROLL: 18,
  /** Neck and head together (nod down, turn left, tilt right). */
  HEAD_PITCH: 19, HEAD_YAW: 20, HEAD_ROLL: 21,
  /** Jaw opening, 0 to 1. */
  JAW: 22,
  /** How firmly each foot is on the ground (foot planting locks a foot while this is high). */
  CONTACT_L: 23, CONTACT_R: 24,
  /** How much each hand obeys an outside goal (a steering wheel, a weapon's fore-end). */
  GOAL_L: 25, GOAL_R: 26,
});

/** Controls of one arm, as offsets from ARM_BASE[0] (left) or ARM_BASE[1] (right). */
export const A = Object.freeze({
  /** Shoulder girdle: shrug up, roll forward (added to what the arm's own lift calls for). */
  SHRUG: 0, SHOULDER_FWD: 1,
  /** Upper arm from hanging at the side: raise forward, raise sideways, turn inward. */
  FLEX: 2, ABDUCT: 3, ROTATE: 4,
  /** Elbow bend. */
  ELBOW: 5,
  /** Wrist: bend towards the palm, towards the thumb, turn palm down. */
  WRIST_FLEX: 6, WRIST_SIDE: 7, WRIST_TWIST: 8,
  /** Elbow swivel for a reaching arm: positive lifts the elbow outward, negative tucks it in. */
  SWIVEL: 9,
  /** Reach target relative to the shoulder socket, in arm lengths (outward, up, forward) and its weight. */
  CHEST_X: 10, CHEST_Y: 11, CHEST_Z: 12, CHEST_W: 13,
  /** Reach target relative to the head joint, reference metres, and its weight. */
  HEAD_X: 14, HEAD_Y: 15, HEAD_Z: 16, HEAD_W: 17,
  /** Reach target relative to the pelvis joint, reference metres, and its weight. */
  PELVIS_X: 18, PELVIS_Y: 19, PELVIS_Z: 20, PELVIS_W: 21,
  /** Reach target relative to the root joint on the ground, reference metres, and its weight. */
  GROUND_X: 22, GROUND_Y: 23, GROUND_Z: 24, GROUND_W: 25,
  /** Hand held to an absolute grip direction (a weapon): weight, yaw left, pitch up, cant. */
  AIM_W: 26, AIM_YAW: 27, AIM_PITCH: 28, AIM_ROLL: 29,
});

/** Controls of one leg, as offsets from LEG_BASE[0] (left) or LEG_BASE[1] (right). */
export const L = Object.freeze({
  /** 1: the foot stands where FOOT_* say (inverse kinematics); 0: the leg follows THIGH_* and KNEE. */
  IK: 0,
  /** Footprint relative to standing (reference metres: outward, up, forward). */
  FOOT_X: 1, FOOT_Y: 2, FOOT_Z: 3,
  /** Foot turned toe-out, toes lifted (negative: heel lifted, standing on the ball), rolled. */
  FOOT_YAW: 4, FOOT_PITCH: 5, FOOT_ROLL: 6,
  /** Knee pointed outward (positive) or inward. */
  KNEE_OUT: 7,
  /** Thigh from standing: raise forward, spread outward, turn outward. */
  THIGH_FLEX: 8, THIGH_ABDUCT: 9, THIGH_ROTATE: 10,
  /** Knee bend, and ankle bend (toes towards the shin positive). */
  KNEE: 11, ANKLE: 12,
});

/** How many controls an arm has. */
export const ARM_CONTROL_COUNT = 30;
/** How many controls a leg has. */
export const LEG_CONTROL_COUNT = 13;
/** Where the left and the right arm's controls start. */
export const ARM_BASE = Object.freeze([27, 27 + ARM_CONTROL_COUNT]);
/** Where the left and the right leg's controls start. */
export const LEG_BASE = Object.freeze([27 + 2 * ARM_CONTROL_COUNT, 27 + 2 * ARM_CONTROL_COUNT + LEG_CONTROL_COUNT]);
/** How many numbers a control vector holds. */
export const CONTROL_COUNT = LEG_BASE[1] + LEG_CONTROL_COUNT;

/** Left arm, right arm, left leg, right leg control offsets by short name. */
export const AL = ARM_BASE[0];
export const AR = ARM_BASE[1];
export const LL = LEG_BASE[0];
export const LR = LEG_BASE[1];

const NEGATED_BY_MIRROR = [
  C.ROOT_X, C.ROOT_YAW, C.ROOT_ROLL, C.PELVIS_X, C.PELVIS_YAW, C.PELVIS_ROLL,
  C.SPINE_YAW, C.SPINE_ROLL, C.CHEST_YAW, C.CHEST_ROLL, C.HEAD_YAW, C.HEAD_ROLL,
  AL + A.AIM_YAW, AL + A.AIM_ROLL, AR + A.AIM_YAW, AR + A.AIM_ROLL,
];

/** Controls that are weights between 0 and 1 (interpolated without overshoot). */
export const WEIGHT_CONTROLS = Object.freeze([
  C.SEAT, C.JAW, C.CONTACT_L, C.CONTACT_R, C.GOAL_L, C.GOAL_R,
  AL + A.CHEST_W, AL + A.HEAD_W, AL + A.PELVIS_W, AL + A.GROUND_W, AL + A.AIM_W,
  AR + A.CHEST_W, AR + A.HEAD_W, AR + A.PELVIS_W, AR + A.GROUND_W, AR + A.AIM_W,
  LL + L.IK, LR + L.IK,
]);

/**
 * Creates a control vector in the neutral standing pose: arms hanging, feet under the hips.
 * @returns {Float32Array}
 */
export function createControls() {
  return resetControls(new Float32Array(CONTROL_COUNT));
}

/**
 * Puts a control vector back to neutral standing.
 * @param {Float32Array} controls
 * @returns {Float32Array} The same vector.
 */
export function resetControls(controls) {
  controls.fill(0);
  controls[C.CONTACT_L] = 1;
  controls[C.CONTACT_R] = 1;
  controls[C.GOAL_L] = 1;
  controls[C.GOAL_R] = 1;
  controls[LL + L.IK] = 1;
  controls[LR + L.IK] = 1;
  return controls;
}

/**
 * Blends two control vectors.
 * @param {Float32Array} out May be `a` or `b`.
 * @param {Float32Array} a
 * @param {Float32Array} b
 * @param {number} t 0 gives a, 1 gives b.
 * @returns {Float32Array} `out`.
 */
export function blendControls(out, a, b, t) {
  for (let i = 0; i < CONTROL_COUNT; i += 1) out[i] = a[i] + (b[i] - a[i]) * t;
  return out;
}

/** Per-control weights of the upper-body layer: spine, head, arms and hand goals. */
export const UPPER_BODY_MASK = (() => {
  const mask = new Float32Array(CONTROL_COUNT);
  for (let i = C.SPINE_PITCH; i <= C.JAW; i += 1) mask[i] = 1;
  mask[C.GOAL_L] = 1;
  mask[C.GOAL_R] = 1;
  for (let i = AL; i < AR + ARM_CONTROL_COUNT; i += 1) mask[i] = 1;
  return mask;
})();

/** Per-control weights of an arms-only layer (carrying, phoning while walking): arms and head. */
export const ARMS_MASK = (() => {
  const mask = new Float32Array(CONTROL_COUNT);
  for (let i = C.HEAD_PITCH; i <= C.JAW; i += 1) mask[i] = 1;
  mask[C.GOAL_L] = 1;
  mask[C.GOAL_R] = 1;
  for (let i = AL; i < AR + ARM_CONTROL_COUNT; i += 1) mask[i] = 1;
  return mask;
})();

/**
 * Lays a layer over a base: each control moves towards the layer's value by weight x mask.
 * @param {Float32Array} base Changed in place.
 * @param {Float32Array} layer
 * @param {Float32Array} mask Per-control weights (UPPER_BODY_MASK ...).
 * @param {number} weight 0 leaves the base, 1 applies the layer where the mask is 1.
 * @returns {Float32Array} `base`.
 */
export function overlayControls(base, layer, mask, weight) {
  for (let i = 0; i < CONTROL_COUNT; i += 1) {
    const w = mask[i] * weight;
    if (w > 0) base[i] += (layer[i] - base[i]) * w;
  }
  return base;
}

/**
 * Adds an additive layer: the difference between a control vector and neutral standing.
 * @param {Float32Array} base Changed in place.
 * @param {Float32Array} delta A control vector whose departure from zero is added (its weight
 *   controls are ignored).
 * @param {number} weight
 * @returns {Float32Array} `base`.
 */
export function addControls(base, delta, weight) {
  for (let i = 0; i < CONTROL_COUNT; i += 1) {
    if (!IS_WEIGHT[i]) base[i] += delta[i] * weight;
  }
  return base;
}

const IS_WEIGHT = (() => {
  const flags = new Uint8Array(CONTROL_COUNT);
  for (const index of WEIGHT_CONTROLS) flags[index] = 1;
  return flags;
})();

/**
 * Whether a control is a 0..1 weight.
 * @param {number} index
 * @returns {boolean}
 */
export function isWeightControl(index) {
  return IS_WEIGHT[index] === 1;
}

/**
 * Mirrors a control vector left to right, in place: limbs swap sides and sideways controls of
 * the centre line change sign. A left hook becomes a right hook.
 * @param {Float32Array} controls
 * @returns {Float32Array} The same vector.
 */
export function mirrorControls(controls) {
  let swap = controls[C.CONTACT_L];
  controls[C.CONTACT_L] = controls[C.CONTACT_R];
  controls[C.CONTACT_R] = swap;
  swap = controls[C.GOAL_L];
  controls[C.GOAL_L] = controls[C.GOAL_R];
  controls[C.GOAL_R] = swap;
  for (let i = 0; i < ARM_CONTROL_COUNT; i += 1) {
    swap = controls[AL + i];
    controls[AL + i] = controls[AR + i];
    controls[AR + i] = swap;
  }
  for (let i = 0; i < LEG_CONTROL_COUNT; i += 1) {
    swap = controls[LL + i];
    controls[LL + i] = controls[LR + i];
    controls[LR + i] = swap;
  }
  for (const index of NEGATED_BY_MIRROR) controls[index] = -controls[index];
  return controls;
}
