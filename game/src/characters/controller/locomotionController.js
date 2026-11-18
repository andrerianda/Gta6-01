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
//   Set the instance's position before update: world targets (aim, point, seats) are converted
//   with it.
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
//
//   STANCES (police, pedestrians): walker.setStance(name, options) with name one of
//     'stand'
//     'hands_up', 'hands_on_head', 'cuffed' (wrists behind the back)        upper body, can walk
//     'kneel' (hands on head), 'kneel_hands_up', 'kneel_cuffed'             arrest, ignores moves
//     'crouch' (low on the balls of the feet, forearms on the knees: behind cover)  ignores moves
//     'cower' (crouched, arms wrapped over the head, face down: shots, explosions)  ignores moves
//     'sit_bench' (options.seatHeight, default 0.45 m: place the instance on the ground at the
//                 middle of the seat's front edge, facing away from the bench)       ignores moves
//     'fallen' (lying on the back; play('fall') gets there with the fall itself)    ignores moves
//   Event 'stance' { stance, settled: true } when the fade into it is complete. A change from
//   one whole-body stance to another passes through standing.
//
//   GESTURES (pedestrians; upper body over standing, walking, running or sitting; faded 0.35 s;
//   a weapon or a hands stance takes precedence):
//   walker.setGesture('phone')     // the right hand at the ear (a phone call; combine with any stance)
//   walker.setGesture('talk')      // talking with the hands (seeded rhythm, small nods)
//   walker.setGesture('panic')     // arms thrown up over the head, flailing: with a run, the panic run
//   walker.pointAt(x, y, z)        // world point: the right arm straight at it, head and chest turned
//   walker.setGesture(null)        // hands down again
//
//   ACTIONS: walker.play(name, options)
//   'hit'    { fromX, fromZ, strength = 1 }: the trunk and head jolt away from a blow coming from
//            world direction (fromX, fromZ) (from the person towards the attacker; default from in
//            front), arms jerk in; 0.06 s jolt, 0.2 s settle, on top of anything.
//   'fall'   falls onto the back (knees give, sits down hard, rolls flat; FALL_SECONDS 1.0) and
//            stays lying: the stance becomes 'fallen'. Events 'action' { action: 'fall', stage:
//            'start' } and { stage: 'landed' }.
//   'getup'  from lying: sits up, draws the feet in, crouches and stands (GETUP_SECONDS 1.7); the
//            stance becomes 'stand'. Events { action: 'getup', stage: 'start' | 'done' }.
//   'fire', 'reload' as above.
//
//   SEATS (player, traffic, police: vehicles). Place the instance at the seat anchor every frame
//   (position and orientation of anchor_seat_driver / anchor_seat_passenger_N: the hip joints go
//   there, facing its -Z; set person.quaternion from the anchor and pass driveRotation: false, or
//   copy only its yaw), then:
//   walker.sit({ kind: 'driver', wheel: steeringWheelNode, wheelRadius: 0.185 })
//       both hands on the rim at ten to two, following the wheel as the fleet turns the node
//       (sliding on the rim past WHEEL_FOLLOW_LIMIT); the rim's 12 o'clock is taken when sit()
//       is called, so call it while the wheel is straight. Without `wheel`: a typical car's.
//   walker.sit({ kind: 'passenger' })           hands on the thighs, glancing about
//   walker.sit({ kind: 'rider', gripL, gripR, footL, footR })   motorcycle: anchor_grip_l/r and
//       anchor_foot_l/r nodes (any missing one: a typical bike's), crouched forward
//   walker.sit(seat, { fade: 0.6 })             fade seconds (0: at once, e.g. spawned in a car)
//   walker.seat.lean = rad                      body lean, + to the left (corner forces; a bike's bank)
//   walker.seat.lookBack = 0..1                 driver turns to look back, right hand to the seat back
//   walker.sit(null)                            back to standing (faded): move the instance to the
//                                               door anchor while it fades (walker.layers.seat 1 -> 0)
//   Events 'action' { action: 'sit', stage: 'done' } and { action: 'stand_up', stage: 'done' }.
//   Seated, moves are ignored; holdWeapon/aimAt still work over the seat (driving and shooting).
//
//   Events: walker.on(type, handler) returns an unsubscribe function; types 'footstrike', 'fire',
//   'reload', 'stance', 'action'. 'footstrike' { side: -1 left | 1 right, foot, x, y, z (world,
//   the ankle), speed, run (0 walk .. 1 run), time }. Event objects are reused: copy what you keep.
//   Read: walker.state (LocomotionState: vx, vz, speed, yaw, yawRate, spotTurn, phase, lean, bank,
//   headYaw, travelX, travelZ, strafe, gait), walker.aim (AimInput: hold, raise, recoil, reload),
//   walker.stance, walker.gesture, walker.action ('fall' | 'getup' | null), walker.seated (kind or
//   null), walker.layers (eased-in weights 0..1: weapon, aim, hands, body, gesture, seat), walker.rig
//   (bones, rig.node('anchor_hand_r'), body measurements).
//   walker.reset(yaw) stands the person still facing yaw (teleport, leaving a car).
//
//   CROWDS: an update costs about 5 to 8 microseconds in Node (60 people: about 0.4 ms a frame);
//   the pedestrian system calls update every 1, 2 or 4 frames by distance (with the summed dt)
//   and only stepLocomotionState off screen, which keeps the state right at no pose cost.
import { createCharacterRig } from '../rig/characterRig.js';
import { BONE } from '../skeleton/humanSkeleton.js';
import { computeForwardKinematics } from '../skeleton/forwardKinematics.js';
import { blendPoses, createPose } from '../skeleton/poseBuffer.js';
import { smoothStep } from '../skeleton/quaternionMath.js';
import { WEAPON_HOLDS, createAimInput, writeAimPose } from '../motion/aimPose.js';
import { BENCH_SEAT_HEIGHT, createGestureInput, writeBenchSitPose, writeGesturePose } from '../motion/everydayPose.js';
import { createLocomotionScratch, writeLocomotionPose } from '../motion/locomotionPose.js';
import {
  FALL_SECONDS, GETUP_SECONDS, applyFlinch, flinchEnvelope, writeCrouchPose, writeFallSequence, writeLyingPose,
} from '../motion/reactionPose.js';
import { createSeatInput, writeSeatedPose } from '../motion/seatedPose.js';
import { writeHandsPose, writeKneelingPose } from '../motion/surrenderPose.js';
import { readSeatAnchors, takeWheelReference } from './seatAnchors.js';
import { createLocomotionState, resetLocomotionState, stepLocomotionState, yawOfDirection } from './locomotionState.js';

export { FALL_SECONDS, GETUP_SECONDS };

/** Longest step one update integrates; a longer hitch is taken as this (no teleporting legs). */
export const MAX_STEP = 0.1;

/** The stances setStance takes: the whole-body pose (null: standing or moving) and the hands. */
export const STANCES = Object.freeze({
  stand: Object.freeze({ body: null, hands: null }),
  hands_up: Object.freeze({ body: null, hands: 'up' }),
  hands_on_head: Object.freeze({ body: null, hands: 'head' }),
  cuffed: Object.freeze({ body: null, hands: 'behind' }),
  kneel: Object.freeze({ body: 'kneel', hands: 'head' }),
  kneel_hands_up: Object.freeze({ body: 'kneel', hands: 'up' }),
  kneel_cuffed: Object.freeze({ body: 'kneel', hands: 'behind' }),
  crouch: Object.freeze({ body: 'crouch', hands: null }),
  cower: Object.freeze({ body: 'cower', hands: null }),
  sit_bench: Object.freeze({ body: 'bench', hands: null }),
  fallen: Object.freeze({ body: 'lying', hands: null }),
});

/** Seconds of each fade: weapon up/down, aim, hands, gestures, seats, and each whole-body pose. */
export const LAYER_TIMES = Object.freeze({
  weapon: 0.3, aim: 0.22, hands: 0.45, gesture: 0.35, seat: 0.6,
  kneel: 0.9, crouch: 0.4, cower: 0.3, bench: 0.8, lying: 0.6,
});

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
  const aim = createAimInput();
  const gestureInput = createGestureInput();
  gestureInput.seed = seed;
  const seat = createSeatInput();
  seat.seed = seed;
  const seatNodes = { wheel: null, gripL: null, gripR: null, footL: null, footR: null, wheelUp: new Float32Array(3), radius: 0.185 };
  const gripOverride = new Float32Array(3);
  const target3 = { x: 0, y: 0, z: 0 }, point3 = { x: 0, y: 0, z: 0 };
  const layers = { weapon: 0, aim: 0, hands: 0, body: 0, gesture: 0, seat: 0 };
  let holding = null, aiming = false, stance = STANCES.stand, stanceName = 'stand', handsShown = 'up';
  let bodyShown = null, benchHeight = BENCH_SEAT_HEIGHT, gesture = null, gestureShown = 'talk';
  let seatKind = null, seatShown = 'driver', seatFade = LAYER_TIMES.seat, seatSettled = true;
  let action = null, actionAge = 0, hitAge = Infinity, hitStrength = 1, hitX = 0, hitZ = -1;
  let fireAge = Infinity, reloadAge = -1, reloadDuration = 1.6, reloadStage = 0, stanceSettled = true;
  const strike = { type: 'footstrike', side: -1, foot: 'left', x: 0, y: 0, z: 0, speed: 0, run: 0, time: 0 };
  const fireEvent = { type: 'fire', hold: 'pistol', time: 0 };
  const reloadEvent = { type: 'reload', stage: 'mag_out', time: 0 };
  const stanceEvent = { type: 'stance', stance: 'stand', settled: true, time: 0 };
  const actionEvent = { type: 'action', action: 'fall', stage: 'start', time: 0 };
  /** @type {Record<string, Array<(event: object) => void>>} */
  const listeners = { footstrike: [], fire: [], reload: [], stance: [], action: [] };
  let time = 0;

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
  const writeBody = (name) => {
    if (name === 'kneel') writeKneelingPose(layerPose, body, rig.fk, time);
    else if (name === 'crouch' || name === 'cower') writeCrouchPose(layerPose, body, rig.fk, name === 'cower', time);
    else if (name === 'bench') writeBenchSitPose(layerPose, body, rig.fk, benchHeight, time, seed);
    else writeLyingPose(layerPose, body, rig.fk, time);
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
    /** The whole-body action running ('fall' | 'getup'), or null. */
    get action() { return action; },
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
      const still = Boolean(stance.body) || layers.body > 0 || Boolean(seatKind) || layers.seat > 0 || Boolean(action);
      stepInput.moveX = still ? 0 : given.moveX ?? 0;
      stepInput.moveZ = still ? 0 : given.moveZ ?? 0;
      stepInput.facing = given.facing ?? NaN;
      stepInput.strafe = Boolean(given.strafe);
      stepInput.measuredSpeed = given.measuredSpeed;
      if (aiming && holding && !(stepInput.facing === stepInput.facing) && !seatKind) {
        const at = instance.position;
        stepInput.facing = yawOfDirection(target3.x - at.x, target3.z - at.z);
        stepInput.strafe = true;
      }
      if (seatKind || action) stepInput.facing = NaN;
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
        const weight = writeFallSequence(layerPose, sparePose, body, rig.fk, t, action === 'getup', time);
        if (weight > 0) endLayer(weight);
        else computeForwardKinematics(body, rig.pose, rig.fk);
        if (t >= 1) {
          const done = action;
          action = null;
          if (done === 'fall') {
            stance = STANCES.fallen; stanceName = 'fallen'; bodyShown = 'lying'; layers.body = 1; stanceSettled = false;
            emitAction('fall', 'landed');
          } else emitAction('getup', 'done');
        }
      }
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
      const weapon = fade('weapon', Boolean(holding) && !stance.hands && !action, LAYER_TIMES.weapon, step);
      aim.raise = fade('aim', aiming && Boolean(holding), LAYER_TIMES.aim, step);
      if (gesture) gestureShown = gesture;
      const lying = action || bodyShown === 'lying' && layers.body > 0;
      const gestureWeight = fade('gesture', Boolean(gesture) && !stance.hands && !holding && !lying, LAYER_TIMES.gesture, step);
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
      if (gestureWeight > 0) {
        if (gestureShown === 'point') toBody(gestureInput, point3.x, point3.y, point3.z);
        gestureInput.time = time;
        beginLayer();
        writeGesturePose(layerPose, body, rig.fk, gestureShown, gestureInput);
        endLayer(gestureWeight);
      }
      if (weapon > 0 && aim.hold) {
        if (aiming) toBody(aim, target3.x, target3.y, target3.z);
        else { // lowered: the muzzle drifts back to straight ahead
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
     * Starts an upper-body gesture ('phone', 'talk', 'panic', 'point') or ends it (null).
     * @param {'phone' | 'talk' | 'panic' | 'point' | null} name
     */
    setGesture(name) {
      if (name && !['phone', 'talk', 'panic', 'point'].includes(name)) throw new Error(`no gesture "${name}"`);
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
        fireAge = 0;
        fireEvent.hold = aim.hold; fireEvent.time = time;
        emit('fire', fireEvent);
      } else if (name === 'reload') {
        reloadAge = 0; reloadStage = 0; reloadDuration = options.duration ?? 1.6;
      } else if (name === 'hit') {
        const sin = Math.sin(state.yaw), cos = Math.cos(state.yaw);
        const wx = options.fromX ?? -sin, wz = options.fromZ ?? -cos, n = 1 / Math.max(1e-6, Math.hypot(wx, wz));
        hitX = (wx * cos - wz * sin) * n; hitZ = (wx * sin + wz * cos) * n;
        hitStrength = Math.max(0, Math.min(1.5, options.strength ?? 1));
        hitAge = 0;
        emitAction('hit', 'start');
      } else if (name === 'fall') {
        if (action === 'fall' || stanceName === 'fallen') return;
        action = 'fall'; actionAge = 0; layers.body = 0; bodyShown = null;
        stance = STANCES.stand; stanceName = 'stand'; aiming = false;
        emitAction('fall', 'start');
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
      resetLocomotionState(state, yaw);
      if (driveRotation) instance.rotation.y = yaw;
    },
  };
  return controller;
}
