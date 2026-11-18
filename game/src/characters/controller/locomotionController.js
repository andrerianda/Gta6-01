// The character controller: one call per frame turns "where this person wants to go, face, aim,
// sit or do" into a person walking, running, strafing, backing away, aiming, firing, reloading,
// surrendering, kneeling, cowering, sitting on a bench, phoning, talking, pointing, running in
// panic, being hit, falling and getting up, driving, riding pillion or riding a motorcycle like a
// person. It owns the body's speed with inertia (a step of acceleration to start and to stop),
// its heading (turning on the spot when standing, banking into turns, the head leading every
// turn), the stride phase advanced by distance so the planted feet never slide (forwards,
// sideways or backwards), the lean from acceleration, the cross-fade between standing and moving
// (one gait model, continuous in speed, so walk, jog, run and sprint blend by speed and never
// pop), the layers over it (a whole-body stance or seat, an upper-body aim layer, raised hands or
// a gesture, an additive flinch) each faded in and out with an eased weight so nothing snaps,
// one-shot actions and events. Deterministic for the same inputs and seed; no allocation per
// update. Works on any body of the shared skeleton.
//
// THE INTERFACE is documented in game/src/characters/CONTROLLER.md (the basic loop, weapons and
// their holds, swings and throws, stances, gestures, actions, unarmed combat, seats, getting in
// and out of vehicles, the ragdoll, events and state). In short:
//   const walker = createLocomotionController(person, { seed: 7 });
//   walker.update(dt, { moveX, moveZ, facing: NaN, strafe: false }); // every frame; move the capsule by walker.state.vx/vz
//   walker.holdWeapon(hold); walker.aimAt(x, y, z); walker.play('fire' | 'reload' | 'swing' | 'throw');
//
import { createCharacterRig } from '../rig/characterRig.js';
import { BONE } from '../skeleton/humanSkeleton.js';
import { computeForwardKinematics } from '../skeleton/forwardKinematics.js';
import { POSE_HIPS_TRANSLATION, blendPoses, createPose } from '../skeleton/poseBuffer.js';
import { smoothStep } from '../skeleton/quaternionMath.js';
import {
  aimWeaponAt, createWeaponHandling, holdWeapon, lowerTowardsAhead, recoilEnvelope, setWeaponGrip, setWeaponMuzzle,
  startRack, startReload, startShot, startSwing, stepWeapon, writeWeaponLayer,
} from './weaponHandling.js';
import { BENCH_SEAT_HEIGHT, GESTURES, createGestureInput, writeBenchSitPose, writeGesturePose } from '../motion/everydayPose.js';
import { writeLeanWallPose, writeWatchHands } from '../motion/loiterPose.js';
import { createLocomotionScratch, writeLocomotionPose } from '../motion/locomotionPose.js';
import {
  FALL_SECONDS, GETUP_SECONDS, applyFlinch, flinchEnvelope, writeCrouchPose, writeFallSequence,
} from '../motion/reactionPose.js';
import { COMBO, STRIKES, writeGuardPose, writeStrikePose } from '../motion/brawlPose.js';
import { FALL_DIRECTIONS, fallDirectionFrom, writeDirectionalFall, writeLyingPoseAfter } from '../motion/deathFall.js';
import { writeAimStance } from '../motion/aimStance.js';
import { tiltPoseToGround } from '../motion/groundTilt.js';
import { createSeatInput, writeSeatedPose } from '../motion/seatedPose.js';
import { writeHandsPose, writeKneelingPose } from '../motion/surrenderPose.js';
import {
  TRANSIT_SECONDS, TRANSIT_SEGMENTS, beginTransit, createVehicleTransit, readTransitAnchors, stepTransit, steerTo,
} from '../motion/vehicleTransit.js';
import { reachWithLimb } from '../ik/limbPosing.js';
import {
  RAGDOLL_LANDED, RAGDOLL_SETTLED, RAGDOLL_SETTLE_SECONDS, createRagdollDriver, stepRagdollPose, stopRagdoll, throwAsRagdoll,
} from './ragdollDriver.js';
import { ARM_L, ARM_R } from '../skeleton/humanSkeleton.js';
import { readSeatAnchors, takeWheelReference } from './seatAnchors.js';
import { createLocomotionState, resetLocomotionState, stepLocomotionState, yawOfDirection } from './locomotionState.js';

export {
  COMBO, FALL_DIRECTIONS, FALL_SECONDS, GETUP_SECONDS, RAGDOLL_SETTLE_SECONDS, STRIKES, TRANSIT_SECONDS, TRANSIT_SEGMENTS,
  recoilEnvelope, steerTo,
};

/** Longest step one update integrates; a longer hitch is taken as this (no teleporting legs). */
export const MAX_STEP = 0.1;

/** The stances setStance takes: the whole-body pose (null: standing or moving) and the hands. */
export const STANCES = Object.freeze({
  stand: Object.freeze({ body: null, hands: null }),
  hands_up: Object.freeze({ body: null, hands: 'up' }),
  hands_on_head: Object.freeze({ body: null, hands: 'head' }),
  cuffed: Object.freeze({ body: null, hands: 'behind' }),
  guard: Object.freeze({ body: null, hands: 'guard' }),
  block: Object.freeze({ body: null, hands: 'block' }),
  kneel: Object.freeze({ body: 'kneel', hands: 'head' }),
  kneel_hands_up: Object.freeze({ body: 'kneel', hands: 'up' }),
  kneel_cuffed: Object.freeze({ body: 'kneel', hands: 'behind' }),
  crouch: Object.freeze({ body: 'crouch', hands: null }),
  cower: Object.freeze({ body: 'cower', hands: null }),
  sit_bench: Object.freeze({ body: 'bench', hands: null }),
  watch: Object.freeze({ body: null, hands: 'clasp' }), // a still watch: hands clasped at the belt, head scanning
  lean_wall: Object.freeze({ body: 'lean_wall', hands: null }), // back to a wall ~0.3 m behind, one sole up on it
  fallen: Object.freeze({ body: 'lying', hands: null }),
});

/** Seconds of each fade: weapon up/down, aim, hands, gestures, seats, and each whole-body pose. */
export const LAYER_TIMES = Object.freeze({
  weapon: 0.3, aim: 0.22, hands: 0.45, gesture: 0.35, seat: 0.6,
  kneel: 0.9, crouch: 0.4, cower: 0.3, bench: 0.8, lying: 0.6, lean_wall: 0.8,
});

/** Share of the shooter's stance (feet staggered, knees bent, trunk in) under a boxing guard. */
const GUARD_STANCE = 0.75;


const NO_INPUT = Object.freeze({});

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
  const instance = rig.instance, body = rig.body, rest = body.restPosition, seed = options.seed ?? 0;
  const driveRotation = options.driveRotation !== false && Boolean(instance.rotation);
  const state = createLocomotionState({
    legScale: body.legScale,
    restHalfWidth: (rest[BONE.FOOT_R * 3] - rest[BONE.FOOT_L * 3]) / 2,
    yaw: options.yaw ?? instance.rotation?.y ?? 0,
    tuning: options.tuning,
  });
  const scratch = createLocomotionScratch();
  const layerPose = createPose(), sparePose = createPose();
  const poseInput = {
    speed: 0, phase: 0, time: 0, seed, lean: 0, bank: 0, headYaw: 0, travelX: 0, travelZ: -1,
  };
  const stepInput = { moveX: 0, moveZ: 0, facing: NaN, strafe: false, measuredSpeed: undefined };
  const weaponState = createWeaponHandling(), aim = weaponState.aim, target3 = weaponState.target;
  const gestureInput = createGestureInput();
  gestureInput.seed = seed;
  const seat = createSeatInput();
  seat.seed = seed;
  const seatNodes = { wheel: null, gripL: null, gripR: null, footL: null, footR: null, wheelUp: new Float32Array(3), radius: 0.185 };
  const point3 = { x: 0, y: 0, z: 0 };
  const layers = { weapon: 0, aim: 0, hands: 0, body: 0, gesture: 0, seat: 0 };
  let stance = STANCES.stand, stanceName = 'stand', handsShown = 'up';
  let bodyShown = null, benchHeight = BENCH_SEAT_HEIGHT, gesture = null, gestureShown = 'talk';
  let seatKind = null, seatShown = 'driver', seatFade = LAYER_TIMES.seat, seatSettled = true;
  let action = null, actionAge = 0, hitAge = Infinity, hitStrength = 1, hitX = 0, hitZ = -1, fallDirection = 'back';
  let stanceSettled = true;
  const strike = { type: 'footstrike', side: -1, foot: 'left', x: 0, y: 0, z: 0, speed: 0, run: 0, time: 0 };
  const stanceEvent = { type: 'stance', stance: 'stand', settled: true, time: 0 };
  const actionEvent = { type: 'action', action: 'fall', stage: 'start', time: 0, x: 0, y: 0, z: 0 };
  /** @type {Record<string, Array<(event: object) => void>>} */
  const listeners = { footstrike: [], fire: [], reload: [], stance: [], action: [] };
  let time = 0;
  const transit = createVehicleTransit();
  let transitDoor = null, transitSeat = null, transitAction = 'enter', transitKind = 'driver';
  let blow = null, strikeName = 'jab', strikeAge = 0, strikeLanded = false, comboIndex = -1;
  const strikePoint = new Float64Array(3);
  /** Starts a strike (index: its place in the combination, or -1). */
  const startStrike = (name, index) => {
    blow = STRIKES[name]; strikeName = name; strikeAge = 0; strikeLanded = false; comboIndex = index;
    emitAction(name, 'start');
  };
  const thrown = createRagdollDriver(body), ragdoll = thrown.ragdoll;
  /** The ground-height function lying poses follow (setGround, or a ragdoll's options.ground). */
  let groundAt = null;
  /** How much the person lies on the ground (0 standing .. 1 lying): the share of the slope tilt. */
  const lyingShare = () => {
    if (ragdoll.active) return 0; // the ragdoll's points meet the ground themselves
    if (action === 'fall') return smoothStep(0.35, 1, actionAge / FALL_SECONDS);
    if (action === 'getup') return 1 - smoothStep(0, 0.6, actionAge / GETUP_SECONDS);
    if (action) return 0;
    return bodyShown === 'lying' ? layers.body : 0;
  };

  const emit = (type, event) => {
    const handlers = listeners[type];
    for (let i = 0; i < handlers.length; i += 1) handlers[i](event);
  };
  const emitAction = (name, stage) => {
    actionEvent.action = name; actionEvent.stage = stage; actionEvent.time = time;
    emit('action', actionEvent);
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
    const w = seconds > 0 ? layers[name] + (on ? step : -step) / seconds : on ? 1 : 0;
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
  /** A world point into the body's frame (yaw only, as the body stands). */
  const toBody = (out, x, y, z) => {
    const at = instance.position, sin = Math.sin(state.yaw), cos = Math.cos(state.yaw);
    const wx = x - at.x, wz = z - at.z;
    out.targetX = wx * cos - wz * sin;
    out.targetY = y - at.y;
    out.targetZ = wx * sin + wz * cos;
  };
  /** The fall's direction from play/setStance options: direction, or the world blow fromX/fromZ. */
  const resolveFallDirection = (options) => {
    if (options.direction !== undefined) {
      if (!FALL_DIRECTIONS.includes(options.direction)) throw new Error(`no fall direction "${options.direction}"`);
      return options.direction;
    }
    if (options.fromX === undefined && options.fromZ === undefined) return 'back';
    const sin = Math.sin(state.yaw), cos = Math.cos(state.yaw), wx = options.fromX ?? 0, wz = options.fromZ ?? 0;
    return fallDirectionFrom(wx * cos - wz * sin, wx * sin + wz * cos);
  };
  const writeBody = (name) => {
    if (name === 'kneel') writeKneelingPose(layerPose, body, rig.fk, time);
    else if (name === 'crouch' || name === 'cower') writeCrouchPose(layerPose, body, rig.fk, name === 'cower', time);
    else if (name === 'bench') writeBenchSitPose(layerPose, body, rig.fk, benchHeight, time, seed);
    else if (name === 'lean_wall') writeLeanWallPose(layerPose, body, rig.fk, time, seed);
    else writeLyingPoseAfter(layerPose, body, rig.fk, fallDirection, time);
  };
  /** Blending standing into sitting can swing a foot through the ground: lift the body over it. */
  const liftOverFeet = (floor = 0) => {
    const p = rig.fk.position;
    const under = Math.min(p[BONE.TOE_L * 3 + 1], p[BONE.TOE_R * 3 + 1], p[BONE.FOOT_L * 3 + 1] - body.ankleHeight * 0.7,
      p[BONE.FOOT_R * 3 + 1] - body.ankleHeight * 0.7) - floor;
    if (under < 0) {
      rig.pose[POSE_HIPS_TRANSLATION + 1] -= under;
      computeForwardKinematics(body, rig.pose, rig.fk);
    }
  };
  /** Moves a hand towards a world point by weight w (the transit's root and yaw are the frame). */
  const reachTransitHand = (arm, target, w) => {
    const sin = Math.sin(transit.yaw), cos = Math.cos(transit.yaw), wx = target[0] - transit.x, wz = target[2] - transit.z;
    const lx = wx * cos - wz * sin, ly = target[1] - transit.y, lz = wx * sin + wz * cos, p = rig.fk.position, h = arm.end * 3;
    reachWithLimb(rig.pose, body, rig.fk, arm, p[h] + (lx - p[h]) * w, p[h + 1] + (ly - p[h + 1]) * w, p[h + 2] + (lz - p[h + 2]) * w,
      arm.side * 0.6, -0.7, 0.3);
    computeForwardKinematics(body, rig.pose, rig.fk, arm.end, arm.end);
  };
  /** The transit's pose over the standing one: seat, fall, duck under the roof, the busy hand. */
  const poseTransit = (result) => {
    if (transit.seatWeight > 0) {
      seat.kind = transitKind; seat.time = time;
      readSeatAnchors(seat, seatNodes, instance);
      writeSeatedPose(layerPose, body, rig.fk, seat);
      endLayer(transit.seatWeight);
      if (transit.seatWeight < 1) liftOverFeet(transit.ground - transit.y);
    }
    if (transit.fall >= 0) {
      const weight = writeFallSequence(layerPose, sparePose, body, rig.fk, transit.fall, false, time);
      if (weight > 0) endLayer(weight);
      liftOverFeet();
    }
    if (transit.duck > 0) applyFlinch(rig.pose, body, rig.fk, 0, 1, transit.duck * 1.3);
    if (transit.hand && transit.handWeight > 0) {
      if (transit.hand !== 'right') reachTransitHand(ARM_L, transit.handL, transit.handWeight);
      if (transit.hand !== 'left') reachTransitHand(ARM_R, transit.handR, transit.handWeight);
    }
    if (result === 1) emitAction(transitAction, transit.stage);
    else if (result === 2) {
      const kind = transit.kind;
      transit.kind = null; transit.stage = null; transit.door = kind === 'exit' ? 0 : transit.door;
      if (kind === 'enter' || kind === 'jack') {
        seatKind = transitKind; seatShown = transitKind; layers.seat = 1; seatSettled = true; seatFade = LAYER_TIMES.seat;
        seat.lean = 0; seat.lookBack = 0;
      } else if (kind === 'dragged') {
        fallDirection = 'back'; stance = STANCES.fallen; stanceName = 'fallen'; bodyShown = 'lying'; layers.body = 1; stanceSettled = false;
      }
      emitAction(transitAction, 'done');
    }
  };
  /**
   * The ragdoll's pose: the instance follows the pelvis; at rest it is turned to the way the body
   * lies and the pose blends (RAGDOLL_SETTLE_SECONDS) into the matching lying pose, then 'fallen'.
   */
  const poseRagdoll = (step) => {
    const result = stepRagdollPose(thrown, step, body, rig.fk, instance.position, layerPose, sparePose, time);
    if (result === RAGDOLL_LANDED) {
      fallDirection = thrown.direction;
      resetLocomotionState(state, thrown.yaw);
      if (driveRotation) instance.rotation.y = thrown.yaw;
    }
    endLayer(thrown.weight);
    if (result === RAGDOLL_SETTLED) {
      stance = STANCES.fallen; stanceName = 'fallen'; bodyShown = 'lying'; layers.body = 1; stanceSettled = false;
      emitAction('ragdoll', 'rest');
      if (thrown.getUp) controller.play('getup');
    }
  };
  /** Starts a transit: no seat, stance, gesture or action left over. */
  const startTransit = (kind, door, seatNode) => {
    if (!door?.matrixWorld || !seatNode?.matrixWorld) throw new Error('a vehicle transit needs the door and seat anchor nodes');
    transitDoor = door; transitSeat = seatNode; blow = null; comboIndex = -1;
    seatKind = null; layers.seat = 0; seatSettled = true; action = null;
    stance = STANCES.stand; stanceName = 'stand'; layers.body = 0; bodyShown = null; gesture = null; stanceSettled = true;
    beginTransit(transit, kind, instance.position.x, instance.position.z, state.yaw);
  };

  const controller = {
    rig,
    state,
    aim,
    seat,
    layers,
    /** The current stance's name. */
    get stance() { return stanceName; },
    /** The current gesture, or null. */
    get gesture() { return gesture; },
    /** The whole-body action running ('fall' | 'getup' | 'enter' | 'exit' | 'dragged'), or null. */
    get action() { return action ?? (transit.kind ? transitAction : null); },
    /** The way the last fall went ('back' | 'forward' | 'left' | 'right'): how the person lies. */
    get fallDirection() { return fallDirection; },
    /**
     * The vehicle transit, read-only: kind ('enter' | 'jack' | 'exit' | 'dragged' | null), stage,
     * door (0 shut .. 1 open: pass it to the fleet's setDoorOpen every frame while kind is set),
     * x, y, z, yaw (where the controller has put the instance), seatWeight, age, total.
     */
    transit,
    /** The seat kind while seated (or sitting down), else null. */
    get seated() { return seatKind; },
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
      let transitResult = 0;
      if (transit.kind) { // the transit places the person: root and yaw from the anchors
        readTransitAnchors(transit, transitDoor, transitSeat);
        transitResult = stepTransit(transit, step);
        const at = instance.position;
        at.x = transit.x; at.y = transit.y; at.z = transit.z;
        if (driveRotation) instance.rotation.y = transit.yaw;
      }
      const still = Boolean(stance.body) || layers.body > 0 || Boolean(seatKind) || layers.seat > 0 || Boolean(action)
        || Boolean(transit.kind) || ragdoll.active || blow?.kind === 'kick';
      stepInput.moveX = still ? 0 : given.moveX ?? 0;
      stepInput.moveZ = still ? 0 : given.moveZ ?? 0;
      stepInput.facing = given.facing ?? NaN;
      stepInput.strafe = Boolean(given.strafe);
      stepInput.measuredSpeed = given.measuredSpeed;
      if (weaponState.aiming && weaponState.holding && !(stepInput.facing === stepInput.facing) && !seatKind) {
        const at = instance.position;
        stepInput.facing = yawOfDirection(target3.x - at.x, target3.z - at.z);
        stepInput.strafe = true;
      }
      if (seatKind || action) stepInput.facing = NaN;
      stepLocomotionState(state, step, stepInput);
      if (transit.kind) resetLocomotionState(state, transit.yaw);
      else if (ragdoll.active) resetLocomotionState(state, thrown.yaw);
      poseInput.speed = state.stepSpeed;
      poseInput.phase = state.phase;
      poseInput.time = time;
      poseInput.lean = state.lean;
      poseInput.bank = state.bank;
      poseInput.headYaw = state.headYaw;
      poseInput.travelX = state.travelX;
      poseInput.travelZ = state.travelZ;
      writeLocomotionPose(rig.pose, body, rig.fk, poseInput, scratch);

      // Whole body: a stance's pose (kneel, crouch, cower, bench, lying), faded through standing.
      if (stance.body && layers.body === 0) bodyShown = stance.body;
      const bodyWeight = fade('body', Boolean(stance.body) && stance.body === bodyShown, LAYER_TIMES[bodyShown] ?? 0.6, step);
      if (bodyWeight > 0 && !action) {
        writeBody(bodyShown);
        endLayer(bodyWeight);
      }
      // Whole body: falling and getting up.
      if (action) {
        actionAge += step;
        const t = actionAge / (action === 'fall' ? FALL_SECONDS : GETUP_SECONDS);
        const weight = writeDirectionalFall(layerPose, sparePose, body, rig.fk, t, fallDirection, action === 'getup', time);
        if (weight > 0) endLayer(weight);
        else computeForwardKinematics(body, rig.pose, rig.fk);
        liftOverFeet();
        if (t >= 1) {
          const done = action;
          action = null;
          if (done === 'fall') {
            stance = STANCES.fallen; stanceName = 'fallen'; bodyShown = 'lying'; layers.body = 1; stanceSettled = false;
            emitAction('fall', 'landed');
          } else emitAction('getup', 'done');
        }
      }
      // Whole body: getting into or out of a vehicle, being dragged out.
      if (transit.kind) poseTransit(transitResult);
      // Whole body: thrown by a car or a blast, then settling into lying.
      if (ragdoll.active) poseRagdoll(step);
      // Whole body: seated in a vehicle.
      const seatWeight = fade('seat', Boolean(seatKind), seatFade, step);
      if (seatWeight > 0) {
        seat.kind = seatShown; seat.time = time;
        readSeatAnchors(seat, seatNodes, instance);
        writeSeatedPose(layerPose, body, rig.fk, seat);
        endLayer(seatWeight);
      }
      if (!seatSettled && layers.seat === (seatKind ? 1 : 0)) {
        seatSettled = true;
        emitAction(seatKind ? 'sit' : 'stand_up', 'done');
      }

      // Upper body: hands (surrender, arrest) take precedence over a weapon, a weapon over a gesture.
      if (stance.hands) handsShown = stance.hands;
      const hands = fade('hands', Boolean(stance.hands), LAYER_TIMES.hands, step);
      const holding = weaponState.holding;
      const weapon = fade('weapon', Boolean(holding) && !stance.hands && !action, LAYER_TIMES.weapon, step);
      aim.raise = fade('aim', weaponState.aiming && Boolean(holding), LAYER_TIMES.aim, step);
      if (gesture) gestureShown = gesture;
      const lying = action || bodyShown === 'lying' && layers.body > 0;
      const gestureWeight = fade('gesture', Boolean(gesture) && !stance.hands && !holding && !lying, LAYER_TIMES.gesture, step);
      stepWeapon(weaponState, step, time, emit);
      if (gestureWeight > 0) {
        if (gestureShown === 'point') toBody(gestureInput, point3.x, point3.y, point3.z);
        gestureInput.time = time;
        beginLayer();
        writeGesturePose(layerPose, body, rig.fk, gestureShown, gestureInput);
        endLayer(gestureWeight);
      }
      if (weapon > 0 && aim.hold) {
        if (weaponState.aiming) toBody(aim, target3.x, target3.y, target3.z);
        else lowerTowardsAhead(aim, step);
        weaponState.still = state.stepSpeed < 0.2 ? 1 : Math.max(0, 1 - (state.stepSpeed - 0.2) / 0.6);
        beginLayer();
        writeWeaponLayer(layerPose, body, rig.fk, weaponState, Boolean(seatKind), !seatKind && !transit.kind);
        endLayer(weapon);
      }
      if (hands > 0) {
        beginLayer();
        if (handsShown === 'guard' || handsShown === 'block') { // a boxer's guard on the fighting stance
          if (!seatKind && !transit.kind && !bodyShown) writeAimStance(layerPose, body, rig.fk, GUARD_STANCE);
          writeGuardPose(layerPose, body, rig.fk, handsShown, time);
        } else if (handsShown === 'clasp') writeWatchHands(layerPose, body, rig.fk, time, seed);
        else writeHandsPose(layerPose, body, rig.fk, handsShown, time);
        endLayer(hands);
      }
      // Over the arms (or legs, a kick): an unarmed strike.
      if (blow) {
        strikeAge += step;
        const u = Math.min(1, strikeAge / blow.seconds);
        writeStrikePose(rig.pose, body, rig.fk, blow, u, strikePoint);
        if (!strikeLanded && u >= blow.impact) {
          strikeLanded = true;
          const at = instance.position, sin = Math.sin(state.yaw), cos = Math.cos(state.yaw), sp = strikePoint;
          actionEvent.x = at.x + sp[0] * cos + sp[2] * sin; actionEvent.y = at.y + sp[1]; actionEvent.z = at.z - sp[0] * sin + sp[2] * cos;
          emitAction(strikeName, 'impact');
        }
        if (u >= 1) {
          const done = strikeName;
          blow = null;
          emitAction(done, 'done');
          if (comboIndex >= 0 && comboIndex < COMBO.length - 1) startStrike(COMBO[comboIndex + 1], comboIndex + 1);
          else comboIndex = -1;
        }
      }
      // Additive: the flinch of a hit.
      hitAge += step;
      const flinch = flinchEnvelope(hitAge) * hitStrength;
      if (flinch > 0) applyFlinch(rig.pose, body, rig.fk, hitX, hitZ, flinch);

      if (!stanceSettled && layers.body === (stance.body ? 1 : 0) && (!stance.body || bodyShown === stance.body)
        && layers.hands === (stance.hands ? 1 : 0)) {
        stanceSettled = true;
        stanceEvent.stance = stanceName; stanceEvent.settled = true; stanceEvent.time = time;
        emit('stance', stanceEvent);
      }
      if (groundAt && tiltPoseToGround(rig.pose, groundAt, instance.position.x, instance.position.z, state.yaw, lyingShare())) {
        computeForwardKinematics(body, rig.pose, rig.fk);
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
      holdWeapon(weaponState, hold);
    },
    /** The off hand's grip (the weapon's anchor_grip_off) in anchor_hand_r's frame, metres. */
    setWeaponGrip(x, y, z) {
      setWeaponGrip(weaponState, x, y, z);
    },
    /**
     * The weapon's muzzle (anchor_muzzle) in anchor_hand_r's frame, metres: an aimed handgun puts
     * this point on the line from the shoulder to the target. Call after holdWeapon.
     */
    setWeaponMuzzle(x, y, z) {
      setWeaponMuzzle(weaponState, x, y, z);
    },
    /** Aims the held weapon at a world point (keep calling to track a moving target). */
    aimAt(x, y, z) {
      aimWeaponAt(weaponState, x, y, z);
    },
    /**
     * Aims along a world direction (the aim camera's view): the same as aimAt at a point 30 m
     * along it from the shoulders. Pitches within AIM_LEVEL_BAND of level hold the weapon level.
     */
    aimAlong(dx, dy, dz) {
      const n = Math.hypot(dx, dy, dz) || 1, at = instance.position, k = 30 / n;
      aimWeaponAt(weaponState, at.x + dx * k, at.y + 1.45 * body.heightScale + dy * k, at.z + dz * k);
    },
    /** Lowers the weapon to the low ready. */
    lowerWeapon() {
      weaponState.aiming = false;
    },
    /**
     * Starts an upper-body gesture ('phone', 'talk', 'panic', 'point', 'smoke') or ends it (null).
     * @param {'phone' | 'talk' | 'panic' | 'point' | 'smoke' | null} name
     */
    setGesture(name) {
      if (name && !GESTURES.includes(name)) throw new Error(`no gesture "${name}"`);
      gesture = name || null;
    },
    /** Points the right arm at a world point (the 'point' gesture; call again to follow it). */
    pointAt(x, y, z) {
      point3.x = x; point3.y = y; point3.z = z;
      gesture = 'point';
    },
    /**
     * Plays a one-shot action: 'fire', 'reload' ({ duration }), 'hit' ({ fromX, fromZ, strength }),
     * 'fall', 'getup'. See the header.
     * @param {'fire' | 'reload' | 'hit' | 'fall' | 'getup'} name
     * @param {{ duration?: number, fromX?: number, fromZ?: number, strength?: number }} [options]
     */
    play(name, options = NO_INPUT) {
      if (name === 'fire') {
        emit('fire', startShot(weaponState, time));
      } else if (name === 'reload') {
        startReload(weaponState, options.duration ?? 1.6);
      } else if (name === 'rack') { // a pump's stroke ({ duration, delay }): from now on only when played
        startRack(weaponState, options.duration ?? 0.42, options.delay ?? 0.1);
      } else if (name === 'swing' || name === 'throw') { // a carried hold's swing or throw
        if (!seatKind && !transit.kind && !ragdoll.active && !action
          && startSwing(weaponState, name, options.duration ?? (name === 'throw' ? 0.7 : 0.55))) emitAction(name, 'start');
      } else if (name === 'hit') {
        const sin = Math.sin(state.yaw), cos = Math.cos(state.yaw);
        const wx = options.fromX ?? -sin, wz = options.fromZ ?? -cos, n = 1 / Math.max(1e-6, Math.hypot(wx, wz));
        hitX = (wx * cos - wz * sin) * n; hitZ = (wx * sin + wz * cos) * n;
        hitStrength = Math.max(0, Math.min(1.5, options.strength ?? 1));
        hitAge = 0;
        emitAction('hit', 'start');
      } else if (name === 'fall') {
        if (action === 'fall' || stanceName === 'fallen') return;
        fallDirection = resolveFallDirection(options);
        blow = null; comboIndex = -1;
        action = 'fall'; actionAge = 0; layers.body = 0; bodyShown = null;
        stance = STANCES.stand; stanceName = 'stand'; weaponState.aiming = false;
        emitAction('fall', 'start');
      } else if (STRIKES[name] || name === 'combo') {
        if (seatKind || transit.kind || ragdoll.active || action || stance.body) return;
        startStrike(name === 'combo' ? COMBO[0] : name, name === 'combo' ? 0 : -1);
      } else if (name === 'getup') {
        if (stanceName !== 'fallen' && action !== 'fall') { emitAction('getup', 'done'); return; }
        action = 'getup'; actionAge = 0; layers.body = 0; bodyShown = null;
        stance = STANCES.stand; stanceName = 'stand'; stanceSettled = true;
        emitAction('getup', 'start');
      } else {
        throw new Error(`no action "${name}"`);
      }
    },
    /**
     * Changes stance (faded): see STANCES.
     * @param {keyof typeof STANCES} name
     * @param {{ seatHeight?: number }} [options] sit_bench: the seat's height above the ground.
     */
    setStance(name, options = NO_INPUT) {
      const next = STANCES[name];
      if (!next) throw new Error(`no stance "${name}"`);
      if (name === 'sit_bench') benchHeight = options.seatHeight ?? BENCH_SEAT_HEIGHT;
      if (name === 'fallen' && stanceName !== 'fallen') fallDirection = resolveFallDirection(options);
      if (next !== stance) { stance = next; stanceName = name; stanceSettled = false; }
    },
    /**
     * Sits in a vehicle seat (faded), or stands up again (null). See the header.
     * @param {{ kind: 'driver' | 'passenger' | 'rider', wheel?: object, wheelRadius?: number,
     *   gripL?: object, gripR?: object, footL?: object, footR?: object } | null} where
     * @param {{ fade?: number }} [options]
     */
    sit(where, options = NO_INPUT) {
      seatFade = options.fade ?? LAYER_TIMES.seat;
      transit.kind = null; transit.stage = null;
      if (!where) {
        if (seatKind) { seatKind = null; seatSettled = false; }
        return;
      }
      if (!['driver', 'passenger', 'rider'].includes(where.kind)) throw new Error(`no seat kind "${where.kind}"`);
      seatKind = where.kind; seatShown = where.kind; seatSettled = false;
      seatNodes.wheel = where.wheel ?? null; seatNodes.radius = where.wheelRadius ?? 0.185;
      seatNodes.gripL = where.gripL ?? null; seatNodes.gripR = where.gripR ?? null;
      seatNodes.footL = where.footL ?? null; seatNodes.footR = where.footR ?? null;
      if (seatNodes.wheel) takeWheelReference(seatNodes);
      seat.lean = 0; seat.lookBack = 0;
      if (seatFade <= 0) layers.seat = 1;
    },
    /**
     * Gets into a vehicle seat through its door (see the header, VEHICLES).
     * @param {{ door: object, seat: object, kind?: 'driver' | 'passenger', wheel?: object,
     *   wheelRadius?: number, jack?: boolean }} where Anchor nodes (matrixWorld): anchor_door_*,
     *   anchor_seat_*; the steering wheel node for a driver; jack: haul the occupant out first.
     */
    enterVehicle(where) {
      const kind = where?.kind ?? 'driver';
      if (kind !== 'driver' && kind !== 'passenger') throw new Error(`no vehicle seat kind "${kind}"`);
      seatNodes.wheel = where.wheel ?? null; seatNodes.radius = where.wheelRadius ?? 0.185;
      seatNodes.gripL = null; seatNodes.gripR = null; seatNodes.footL = null; seatNodes.footR = null;
      if (seatNodes.wheel) takeWheelReference(seatNodes);
      startTransit(where.jack ? 'jack' : 'enter', where.door, where.seat);
      transitKind = kind; transitAction = 'enter';
      emitAction('enter', 'start');
    },
    /**
     * Gets out of the vehicle seat through its door, or is dragged out (dragged: true) and thrown
     * on the ground beside it (lying afterwards: stance 'fallen'; play('getup') to rise).
     * @param {{ door: object, seat: object, dragged?: boolean }} where
     */
    exitVehicle(where) {
      transitKind = seatKind ?? (seatShown === 'rider' ? 'driver' : seatShown);
      startTransit(where?.dragged ? 'dragged' : 'exit', where?.door, where?.seat);
      transitAction = where.dragged ? 'dragged' : 'exit';
      emitAction(transitAction, 'start');
    },
    /**
     * Throws the person as a ragdoll (hit by a car, blown off the feet). See the header, RAGDOLL.
     * @param {{ vx?: number, vy?: number, vz?: number, at?: number, spin?: number,
     *   ground?: (x: number, z: number) => number, boxes?: Array<{ x: number, y: number, z: number,
     *   hx: number, hy: number, hz: number, yaw?: number }>, getUp?: boolean }} [options]
     */
    ragdoll(options = NO_INPUT) {
      transit.kind = null; transit.stage = null; seatKind = null; layers.seat = 0; seatSettled = true;
      action = null; layers.body = 0; bodyShown = null; gesture = null; weaponState.aiming = false; weaponState.holding = null; blow = null; comboIndex = -1;
      stance = STANCES.stand; stanceName = 'stand'; stanceSettled = true;
      computeForwardKinematics(body, rig.pose, rig.fk);
      if (options.ground) groundAt = options.ground;
      throwAsRagdoll(thrown, rig.fk, instance.position, state.yaw, options, groundAt);
      emitAction('ragdoll', 'start');
    },
    /**
     * The ground height at world (x, z) (a function, or null: flat): lying, falling and getting up
     * follow its slope, and a ragdoll without options.ground lands on it.
     * @param {((x: number, z: number) => number) | null} ground
     */
    setGround(ground) {
      groundAt = typeof ground === 'function' ? ground : null;
    },
    /** True while thrown as a ragdoll (until the 'rest' event). */
    get ragdolling() { return ragdoll.active; },
    /**
     * Subscribes to an event: 'footstrike', 'fire', 'reload', 'stance', 'action'.
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
      transit.kind = null; transit.stage = null; stopRagdoll(thrown); blow = null; comboIndex = -1;
      resetLocomotionState(state, yaw);
      if (driveRotation) instance.rotation.y = yaw;
    },
  };
  return controller;
}
