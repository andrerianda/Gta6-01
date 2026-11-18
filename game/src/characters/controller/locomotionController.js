// The character controller: one call per frame turns "where this person wants to go, face and
// aim" into a person walking, running, strafing, backing away, aiming, firing, reloading,
// surrendering and kneeling like a person. It owns the body's speed with inertia (a step of
// acceleration to start and to stop), its heading (turning on the spot when standing, banking
// into turns, the head leading every turn), the stride phase advanced by distance so the planted
// feet never slide (forwards, sideways or backwards), the lean from acceleration, the cross-fade
// between standing and moving (one gait model, continuous in speed, so walk, jog, run and sprint
// blend by speed and never pop), the layers over it (an upper-body aim layer, raised hands, a
// whole-body kneel) each faded in and out with an eased weight so nothing snaps, one-shot
// actions and events. Deterministic for the same inputs and seed; no allocation per update.
// Works on any body of the shared skeleton.
//
// THE INTERFACE (player, combat, police and pedestrian programmers)
//
//   import { createLocomotionController } from '../characters/controller/locomotionController.js';
//   const person = assets.instantiate('dez_tolliver');            // any character asset
//   scene.add(person);
//   const walker = createLocomotionController(person, { seed: 7 }); // stature: the asset's extras.height
//   const input = { moveX: 0, moveZ: 0, facing: NaN, strafe: false, measuredSpeed: undefined }; // reuse
//
//   // every rendered frame (variable dt is fine: the result is frame-rate independent):
//   input.moveX = wantX; input.moveZ = wantZ;   // wanted ground velocity, m/s, world axes
//   input.facing = NaN;                          // or a yaw (rotation.y) to face
//   input.strafe = false;                        // true: face `facing` while moving (strafe, back away)
//   walker.update(dt, input);                    // (update(dt) alone reads walker.input)
//   capsule.move(walker.state.vx * dt, walker.state.vz * dt);   // move by the controller's velocity
//   person.position.copy(interpolatedCapsuleFeet);              // the controller never moves it
//   // walker.update has already set person.rotation.y = walker.state.yaw and posed the bones.
//   If the capsule is blocked, pass the speed it really made as input.measuredSpeed (m/s).
//
//   WEAPONS (combat, police). The weapon mesh is a child of rig.node('anchor_hand_r'), its own
//   origin at the grip (the anchor's -Z along the barrel).
//   walker.holdWeapon('pistol' | 'pistol_two_hand' | 'smg' | 'shotgun' | 'rifle')  // low ready
//   walker.holdWeapon(null)                      // put it away: arms swing again (faded)
//   walker.setWeaponGrip(x, y, z)                // the weapon's anchor_grip_off in its own frame
//                                                // (where the off hand holds; default per kind)
//   walker.aimAt(x, y, z)                        // world point: raises the weapon, twists the
//                                                // spine, turns the body and strafes towards it
//                                                // (call each frame to track; facing/strafe are
//                                                // supplied when input.facing is NaN)
//   walker.lowerWeapon()                         // back to the low ready
//   walker.play('fire')                          // recoil kick (event 'fire' at once)
//   walker.play('reload', { duration: 1.6 })     // events 'reload' { stage: 'mag_out' | 'mag_in' | 'done' }
//   STANCES (police, pedestrians): walker.setStance(name) with name one of
//   'stand', 'hands_up', 'hands_on_head', 'cuffed' (wrists behind the back), 'kneel' (hands on
//   head), 'kneel_hands_up', 'kneel_cuffed'. Kneeling ignores moves. Event 'stance' { stance,
//   settled: true } when the fade into it is complete.
//
//   Events: walker.on(type, handler) returns an unsubscribe function. 'footstrike' { side: -1 left
//   | 1 right, foot, x, y, z (world, the ankle), speed, run (0 walk .. 1 run), time }. Event
//   objects are reused: copy what you keep.
//   Read: walker.state (LocomotionState: vx, vz, speed, yaw, yawRate, spotTurn, phase, lean, bank,
//   headYaw, travelX, travelZ, strafe, gait), walker.aim (AimInput: hold, raise, recoil, reload),
//   walker.stance, walker.rig (bones, rig.node('anchor_hand_r'), body measurements).
//   walker.reset(yaw) stands the person still facing yaw (teleport, leaving a car).
import { createCharacterRig } from '../rig/characterRig.js';
import { BONE } from '../skeleton/humanSkeleton.js';
import { computeForwardKinematics } from '../skeleton/forwardKinematics.js';
import { blendPoses, createPose } from '../skeleton/poseBuffer.js';
import { smoothStep } from '../skeleton/quaternionMath.js';
import { WEAPON_HOLDS, createAimInput, writeAimPose } from '../motion/aimPose.js';
import { createLocomotionScratch, writeLocomotionPose } from '../motion/locomotionPose.js';
import { writeHandsPose, writeKneelingPose } from '../motion/surrenderPose.js';
import { createLocomotionState, resetLocomotionState, stepLocomotionState, yawOfDirection } from './locomotionState.js';

/** Longest step one update integrates; a longer hitch is taken as this (no teleporting legs). */
export const MAX_STEP = 0.1;

/** The stances setStance takes: whether the person kneels and where the hands go. */
export const STANCES = Object.freeze({
  stand: Object.freeze({ kneel: false, hands: null }),
  hands_up: Object.freeze({ kneel: false, hands: 'up' }),
  hands_on_head: Object.freeze({ kneel: false, hands: 'head' }),
  cuffed: Object.freeze({ kneel: false, hands: 'behind' }),
  kneel: Object.freeze({ kneel: true, hands: 'head' }),
  kneel_hands_up: Object.freeze({ kneel: true, hands: 'up' }),
  kneel_cuffed: Object.freeze({ kneel: true, hands: 'behind' }),
});

/** Seconds of each fade: raising and lowering a weapon, raising hands, kneeling down or up. */
export const LAYER_TIMES = Object.freeze({ weapon: 0.3, aim: 0.22, hands: 0.45, kneel: 0.9 });

const NO_INPUT = Object.freeze({});
const RELOAD_STAGES = Object.freeze(['mag_out', 'mag_in', 'done']);
const RELOAD_STAGE_AT = Object.freeze([0.3, 0.7, 1]);

/** Recoil envelope of a shot `age` seconds ago: a 40 ms kick, then a 90 ms settle. */
export function recoilEnvelope(age) {
  if (!(age >= 0) || age > 0.7) return 0;
  return age < 0.04 ? age / 0.04 : Math.exp(-(age - 0.04) / 0.09);
}

/**
 * Creates the controller of a character.
 * @param {object} target An instantiated character asset (a THREE.Object3D with the shared
 *   skeleton), or a rig made by createCharacterRig.
 * @param {object} [options]
 * @param {number} [options.stature] The person's height; default the instance's userData.height.
 * @param {number} [options.seed] The person's seed: idle variation (breathing, glances, weight shifts).
 * @param {number} [options.yaw] Starting yaw; default the instance's rotation.y.
 * @param {boolean} [options.driveRotation] Set instance.rotation.y to the body's yaw (default true).
 * @param {object} [options.input] The input object update() reads when called without one.
 * @param {Partial<import('./locomotionState.js').LOCOMOTION_TUNING>} [options.tuning] Feel overrides.
 */
export function createLocomotionController(target, options = {}) {
  const stature = options.stature ?? target.userData?.height;
  const rig = target.body && target.applyPose ? target : createCharacterRig(target, { stature });
  const instance = rig.instance, body = rig.body, rest = body.restPosition;
  const driveRotation = options.driveRotation !== false && Boolean(instance.rotation);
  const state = createLocomotionState({
    legScale: body.legScale,
    restHalfWidth: (rest[BONE.FOOT_R * 3] - rest[BONE.FOOT_L * 3]) / 2,
    yaw: options.yaw ?? instance.rotation?.y ?? 0,
    tuning: options.tuning,
  });
  const scratch = createLocomotionScratch();
  const layerPose = createPose();
  const poseInput = {
    speed: 0, phase: 0, time: 0, seed: options.seed ?? 0, lean: 0, bank: 0, headYaw: 0, travelX: 0, travelZ: -1,
  };
  const stepInput = { moveX: 0, moveZ: 0, facing: NaN, strafe: false, measuredSpeed: undefined };
  const aim = createAimInput();
  const gripOverride = new Float32Array(3);
  const target3 = { x: 0, y: 0, z: 0 };
  const layers = { weapon: 0, aim: 0, hands: 0, kneel: 0 };
  let holding = null, aiming = false, stance = STANCES.stand, stanceName = 'stand', handsShown = 'up';
  let fireAge = Infinity, reloadAge = -1, reloadDuration = 1.6, reloadStage = 0, stanceSettled = true;
  const strike = { type: 'footstrike', side: -1, foot: 'left', x: 0, y: 0, z: 0, speed: 0, run: 0, time: 0 };
  const fireEvent = { type: 'fire', hold: 'pistol', time: 0 };
  const reloadEvent = { type: 'reload', stage: 'mag_out', time: 0 };
  const stanceEvent = { type: 'stance', stance: 'stand', settled: true, time: 0 };
  /** @type {Record<string, Array<(event: object) => void>>} */
  const listeners = { footstrike: [], fire: [], reload: [], stance: [] };
  let time = 0;

  const emit = (type, event) => {
    const handlers = listeners[type];
    for (let i = 0; i < handlers.length; i += 1) handlers[i](event);
  };
  const emitStrike = (side) => {
    if (listeners.footstrike.length === 0) return;
    const a = (side < 0 ? BONE.FOOT_L : BONE.FOOT_R) * 3, p = rig.fk.position;
    const sin = Math.sin(state.yaw), cos = Math.cos(state.yaw), at = instance.position;
    strike.side = side;
    strike.foot = side < 0 ? 'left' : 'right';
    strike.x = at.x + p[a] * cos + p[a + 2] * sin;
    strike.y = at.y + p[a + 1];
    strike.z = at.z - p[a] * sin + p[a + 2] * cos;
    strike.speed = state.speed;
    strike.run = state.gait.run;
    strike.time = time;
    emit('footstrike', strike);
  };
  /** Moves a layer weight towards on/off at a fixed rate; returns the eased weight. */
  const fade = (name, on, seconds, step) => {
    const w = layers[name] + (on ? step : -step) / seconds;
    layers[name] = w < 0 ? 0 : w > 1 ? 1 : w;
    return smoothStep(0, 1, layers[name]);
  };
  /** Copies the main pose into the layer pose (the layer is written over it, then blended back). */
  const beginLayer = () => {
    layerPose.set(rig.pose);
  };
  const endLayer = (weight) => {
    blendPoses(rig.pose, rig.pose, layerPose, weight);
    computeForwardKinematics(body, rig.pose, rig.fk);
  };

  const controller = {
    rig,
    state,
    aim,
    /** The current stance's name. */
    get stance() { return stanceName; },
    /** The input object update() reads when it is given none. */
    input: options.input ?? { moveX: 0, moveZ: 0, facing: NaN, strafe: false, measuredSpeed: undefined },
    /**
     * Advances the person by dt seconds and poses the bones.
     * @param {number} dt
     * @param {object} [input] { moveX, moveZ, facing, strafe, measuredSpeed }; default controller.input.
     */
    update(dt, input = controller.input) {
      const step = Math.min(MAX_STEP, dt > 0 ? dt : 0);
      time += step;
      const given = input ?? NO_INPUT;
      const kneeling = stance.kneel || layers.kneel > 0;
      stepInput.moveX = kneeling ? 0 : given.moveX ?? 0;
      stepInput.moveZ = kneeling ? 0 : given.moveZ ?? 0;
      stepInput.facing = given.facing ?? NaN;
      stepInput.strafe = Boolean(given.strafe);
      stepInput.measuredSpeed = given.measuredSpeed;
      if (aiming && holding && !(stepInput.facing === stepInput.facing)) {
        const at = instance.position;
        stepInput.facing = yawOfDirection(target3.x - at.x, target3.z - at.z);
        stepInput.strafe = true;
      }
      stepLocomotionState(state, step, stepInput);
      poseInput.speed = state.stepSpeed;
      poseInput.phase = state.phase;
      poseInput.time = time;
      poseInput.lean = state.lean;
      poseInput.bank = state.bank;
      poseInput.headYaw = state.headYaw;
      poseInput.travelX = state.travelX;
      poseInput.travelZ = state.travelZ;
      writeLocomotionPose(rig.pose, body, rig.fk, poseInput, scratch);

      // Whole body: kneeling down and getting up.
      const kneel = fade('kneel', stance.kneel, LAYER_TIMES.kneel, step);
      if (kneel > 0) {
        writeKneelingPose(layerPose, body, rig.fk, time);
        endLayer(kneel);
      }
      // Upper body: hands (surrender, arrest) take precedence over a weapon.
      if (stance.hands) handsShown = stance.hands;
      const hands = fade('hands', Boolean(stance.hands), LAYER_TIMES.hands, step);
      const weapon = fade('weapon', Boolean(holding) && !stance.hands, LAYER_TIMES.weapon, step);
      aim.raise = fade('aim', aiming && Boolean(holding), LAYER_TIMES.aim, step);
      fireAge += step;
      aim.recoil = recoilEnvelope(fireAge);
      if (reloadAge >= 0) {
        reloadAge += step;
        const progress = reloadAge / reloadDuration;
        aim.reload = Math.min(1, progress);
        while (reloadStage < 3 && progress >= RELOAD_STAGE_AT[reloadStage]) {
          reloadEvent.stage = RELOAD_STAGES[reloadStage]; reloadEvent.time = time;
          reloadStage += 1;
          emit('reload', reloadEvent);
        }
        if (progress >= 1) { reloadAge = -1; aim.reload = -1; }
      }
      if (weapon > 0 && aim.hold) {
        const at = instance.position, sin = Math.sin(state.yaw), cos = Math.cos(state.yaw);
        if (aiming) { // the world target in character space
          const wx = target3.x - at.x, wz = target3.z - at.z;
          aim.targetX = wx * cos - wz * sin;
          aim.targetY = target3.y - at.y;
          aim.targetZ = wx * sin + wz * cos;
        } else { // lowered: the muzzle drifts back to straight ahead
          const k = 1 - Math.exp(-4 * step);
          aim.targetX -= aim.targetX * k; aim.targetY += (1.2 - aim.targetY) * k; aim.targetZ += (-10 - aim.targetZ) * k;
        }
        beginLayer();
        writeAimPose(layerPose, body, rig.fk, aim);
        endLayer(weapon);
      }
      if (hands > 0) {
        beginLayer();
        writeHandsPose(layerPose, body, rig.fk, handsShown, time);
        endLayer(hands);
      }
      if (!stanceSettled && layers.kneel === (stance.kneel ? 1 : 0) && layers.hands === (stance.hands ? 1 : 0)) {
        stanceSettled = true;
        stanceEvent.stance = stanceName; stanceEvent.settled = true; stanceEvent.time = time;
        emit('stance', stanceEvent);
      }
      rig.applyPose();
      if (driveRotation) instance.rotation.y = state.yaw;
      if (state.strikes & 1) emitStrike(-1);
      if (state.strikes & 2) emitStrike(1);
      return state;
    },
    /**
     * Takes a weapon in hand at the low ready, or puts it away (null).
     * @param {string | null} hold A key of WEAPON_HOLDS.
     */
    holdWeapon(hold) {
      if (hold && !WEAPON_HOLDS[hold]) throw new Error(`no weapon hold "${hold}"`);
      holding = hold || null;
      if (holding) aim.hold = holding;
      else aiming = false;
      aim.offGrip = null;
    },
    /** The off hand's grip (the weapon's anchor_grip_off) in anchor_hand_r's frame, metres. */
    setWeaponGrip(x, y, z) {
      gripOverride[0] = x; gripOverride[1] = y; gripOverride[2] = z;
      aim.offGrip = gripOverride;
    },
    /** Aims the held weapon at a world point (keep calling to track a moving target). */
    aimAt(x, y, z) {
      target3.x = x; target3.y = y; target3.z = z;
      aiming = true;
    },
    /** Lowers the weapon to the low ready. */
    lowerWeapon() {
      aiming = false;
    },
    /**
     * Plays a one-shot action: 'fire' (recoil) or 'reload' ({ duration } seconds, default 1.6).
     * @param {'fire' | 'reload'} action
     * @param {{ duration?: number }} [options]
     */
    play(action, options = {}) {
      if (action === 'fire') {
        fireAge = 0;
        fireEvent.hold = aim.hold; fireEvent.time = time;
        emit('fire', fireEvent);
      } else if (action === 'reload') {
        reloadAge = 0; reloadStage = 0; reloadDuration = options.duration ?? 1.6;
      } else {
        throw new Error(`no action "${action}"`);
      }
    },
    /**
     * Changes stance (faded): see STANCES.
     * @param {keyof typeof STANCES} name
     */
    setStance(name) {
      const next = STANCES[name];
      if (!next) throw new Error(`no stance "${name}"`);
      if (next !== stance) { stance = next; stanceName = name; stanceSettled = false; }
    },
    /**
     * Subscribes to an event: 'footstrike', 'fire', 'reload', 'stance'.
     * @param {string} type
     * @param {(event: object) => void} handler
     * @returns {() => void} Unsubscribes.
     */
    on(type, handler) {
      const list = listeners[type];
      if (!list) throw new Error(`character controller has no event "${type}"`);
      list.push(handler);
      return () => controller.off(type, handler);
    },
    /** Unsubscribes a handler. */
    off(type, handler) {
      const list = listeners[type];
      const index = list ? list.indexOf(handler) : -1;
      if (index >= 0) list.splice(index, 1);
    },
    /** Stands the person still, facing yaw (default: as now). */
    reset(yaw = state.yaw) {
      resetLocomotionState(state, yaw);
      if (driveRotation) instance.rotation.y = yaw;
    },
  };
  return controller;
}
