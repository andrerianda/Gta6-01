// A person's held weapon, for the locomotion controller: which hold is in hand (WEAPON_HOLDS of
// motion/aimPose.js), whether and where it aims, the weapon model's own grip and muzzle points, the
// envelopes of a shot (recoil kick, a pump gun's rack) and of a reload (with its stage events),
// and the weapon layer written over the body: the whole-body shooter's stance (motion/aimStance.js,
// the hold's share of it) under the aim pose; seated (a drive-by) a handgun is held in one hand
// and the legs are left to the seat. The controller's holdWeapon, setWeaponGrip, setWeaponMuzzle,
// aimAt, aimAlong, lowerWeapon and play('fire' | 'reload') call into it. No allocation per frame.
import { WEAPON_HOLDS, createAimInput, rackStroke, writeAimPose } from '../motion/aimPose.js';
import { writeAimStance } from '../motion/aimStance.js';

/**
 * Creates the held-weapon state of one person (nothing in hand).
 * @returns {WeaponHandling}
 */
export function createWeaponHandling() {
  return {
    aim: createAimInput(),
    holding: null,
    aiming: false,
    target: { x: 0, y: 0, z: 0 },
    grip: new Float32Array(3),
    muzzle: new Float32Array(3),
    fireAge: Infinity,
    reloadAge: -1,
    reloadDuration: 1.6,
    reloadStage: 0,
    fireEvent: { type: 'fire', hold: 'pistol', time: 0 },
    reloadEvent: { type: 'reload', stage: 'mag_out', time: 0 },
  };
}

/**
 * @typedef {object} WeaponHandling
 * @property {import('../motion/aimPose.js').AimInput} aim The aim layer's input (the controller's walker.aim).
 * @property {string | null} holding The hold in hand, or null.
 * @property {boolean} aiming Raised and aimed (else at the low ready).
 * @property {{ x: number, y: number, z: number }} target The world point aimed at.
 * @property {Float32Array} grip The weapon's anchor_grip_off in anchor_hand_r's frame.
 * @property {Float32Array} muzzle The weapon's anchor_muzzle in anchor_hand_r's frame.
 */

/** The reload's stage events and the share of its duration at which each is sent. */
export const RELOAD_STAGES = Object.freeze(['mag_out', 'mag_in', 'done']);
const RELOAD_STAGE_AT = Object.freeze([0.3, 0.7, 1]);

/** Recoil envelope of a shot `age` seconds ago: a 40 ms kick, then a 90 ms settle. */
export function recoilEnvelope(age) {
  if (!(age >= 0) || age > 0.7) return 0;
  return age < 0.04 ? age / 0.04 : Math.exp(-(age - 0.04) / 0.09);
}

/** Takes a hold in hand at the low ready (its grip and muzzle back to the hold's own), or none. */
export function holdWeapon(w, hold) {
  if (hold && !WEAPON_HOLDS[hold]) throw new Error(`no weapon hold "${hold}"`);
  w.holding = hold || null;
  if (w.holding) w.aim.hold = w.holding;
  else w.aiming = false;
  w.aim.offGrip = null;
  w.aim.muzzle = null;
}

/** The off hand's grip point from the weapon model (anchor_hand_r's frame, metres). */
export function setWeaponGrip(w, x, y, z) {
  w.grip[0] = x; w.grip[1] = y; w.grip[2] = z;
  w.aim.offGrip = w.grip;
}

/** The muzzle point from the weapon model (anchor_hand_r's frame, metres). */
export function setWeaponMuzzle(w, x, y, z) {
  w.muzzle[0] = x; w.muzzle[1] = y; w.muzzle[2] = z;
  w.aim.muzzle = w.muzzle;
}

/** Aims at a world point (keep calling to track it). */
export function aimWeaponAt(w, x, y, z) {
  w.target.x = x; w.target.y = y; w.target.z = z;
  w.aiming = true;
}

/** A shot: the recoil (and a pump's rack) start; returns the 'fire' event to send. */
export function startShot(w, time) {
  w.fireAge = 0;
  w.fireEvent.hold = w.aim.hold; w.fireEvent.time = time;
  return w.fireEvent;
}

/** A reload of `duration` seconds starts. */
export function startReload(w, duration = 1.6) {
  w.reloadAge = 0; w.reloadStage = 0; w.reloadDuration = duration;
}

/** Advances the shot and reload envelopes; sends each reload stage through emit('reload', event). */
export function stepWeapon(w, step, time, emit) {
  const aim = w.aim;
  w.fireAge += step;
  aim.recoil = recoilEnvelope(w.fireAge);
  aim.rack = rackStroke(w.fireAge); // a pump gun's hand racks after each shot (the hold says if)
  if (w.reloadAge < 0) return;
  w.reloadAge += step;
  const progress = w.reloadAge / w.reloadDuration;
  aim.reload = Math.min(1, progress);
  while (w.reloadStage < 3 && progress >= RELOAD_STAGE_AT[w.reloadStage]) {
    w.reloadEvent.stage = RELOAD_STAGES[w.reloadStage]; w.reloadEvent.time = time;
    w.reloadStage += 1;
    emit('reload', w.reloadEvent);
  }
  if (progress >= 1) { w.reloadAge = -1; aim.reload = -1; }
}

/**
 * Writes the weapon layer over `pose` (fk up to date). The aim's target must already be in the
 * body's frame (or drifting back to ahead when lowered: see lowerTowardsAhead).
 * @param {Float32Array} pose
 * @param {import('../skeleton/bodyMeasurements.js').BodyModel} body
 * @param {import('../skeleton/forwardKinematics.js').FkState} fk
 * @param {WeaponHandling} w
 * @param {boolean} seated In a seat: a handgun one-handed, no stance.
 * @param {boolean} standing On the feet (not seated, not in a vehicle transit): the stance applies.
 */
export function writeWeaponLayer(pose, body, fk, w, seated, standing) {
  const aim = w.aim, chosen = aim.hold;
  if (seated && WEAPON_HOLDS[chosen].from === 'eye') aim.hold = 'pistol_one_hand';
  else if (standing) writeAimStance(pose, body, fk, aim.raise * (WEAPON_HOLDS[chosen].stance ?? 1));
  writeAimPose(pose, body, fk, aim);
  aim.hold = chosen;
}

/** A lowered weapon's aim drifts back to straight ahead at chest height (body frame). */
export function lowerTowardsAhead(aim, step) {
  const k = 1 - Math.exp(-4 * step);
  aim.targetX -= aim.targetX * k; aim.targetY += (1.2 - aim.targetY) * k; aim.targetZ += (-10 - aim.targetZ) * k;
}
