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
//   walker.holdWeapon(hold)                      // low ready; aimed, the whole body takes the
//     hold's stance (motion/aimStance.js under motion/aimPose.js; WEAPON_HOLDS):
//     'pistol' (= 'pistol_two_hand') two-handed isosceles; 'revolver_two_hand' the same, heavier
//     lift; 'smg' (= 'smg_compact') compact at the eye, elbows tucked, hand on the magazine well;
//     'shotgun' (= 'shotgun_pump') cheeked, hand under the pump, which racks back and forward after
//     each play('fire'); 'rifle' cheeked, hand far forward under the handguard, elbow out;
//     'sniper' the rifle steadier and more upright. Seated, handguns go one-handed by themselves.
//   walker.holdWeapon(null)                      // put it away: arms swing again (faded)
//   walker.setWeaponGrip(x, y, z)                // the weapon's anchor_grip_off in its own frame
//                                                // (where the off hand holds; default per kind)
//   walker.setWeaponMuzzle(x, y, z)              // the weapon's anchor_muzzle in its own frame: an
//                                                // aimed handgun puts it on the shoulder-target
//                                                // line (call both after holdWeapon)
//   walker.aimAt(x, y, z)                        // world point: raises the weapon, twists the
//                                                // spine, turns the body and strafes towards it
//                                                // (call each frame to track; facing/strafe are
//                                                // supplied when input.facing is NaN); aims within
//                                                // 15 degrees of level hold the gun level at the
//                                                // shoulder (AIM_LEVEL_BAND), beyond it the arm tilts
//   walker.aimAlong(dx, dy, dz)                  // or along a world direction (the aim camera's)
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
//   'fall'   a death fall or knock-down (FALL_SECONDS 1.0); the person stays lying and the stance
//            becomes 'fallen'. Options pick the way the body goes:
//              { direction: 'back' | 'forward' | 'left' | 'right' }, or
//              { fromX, fromZ }: world direction from the person towards the shooter, car or blast
//              (a blow from the front falls back, from behind forward, from the left to the right);
//              none: 'back'.
//            back: knees give, sits down hard, rolls flat onto the back. forward: drops onto the
//            knees and topples face down. left / right: buckles into a crouch and goes over onto
//            that hip and side. Events 'action' { action: 'fall', stage: 'start' } and
//            { stage: 'landed' }; walker.fallDirection tells how the person lies.
//   'getup'  from lying, to standing (GETUP_SECONDS 1.7), the way the fall left them: from the back
//            sits up, draws the feet in, crouches and stands; face down pushes up into a crouch
//            and stands; from a side rolls up to sitting first. The stance becomes 'stand'. Events
//            { action: 'getup', stage: 'start' | 'done' }.
//            setStance('fallen', { direction | fromX, fromZ }) lays a person down without the fall
//            (bodies placed by a mission, a spawned casualty).
//   'fire', 'reload' as above.
//
//   UNARMED COMBAT (combat, gang members, police): face the opponent with input.facing (or turn
//   the instance), then
//     walker.setStance('guard')   fists at the chin, left hand leading, chin tucked, on the
//                                 fighting stance (lower, left foot ahead, knees bent, eyes on the
//                                 opponent); walks and strafes; 'stand' drops it
//     walker.setStance('block')   forearms up before the face (hold it while blocking; back to
//                                 'guard' after)
//     walker.play('jab')          left straight, 0.38 s, lands at 38 %
//     walker.play('cross')        right straight with the chest turned into it, 0.48 s, at 42 %
//     walker.play('hook')         right hook, elbow up, swung round to the centre line, 0.55 s, at 46 %
//     walker.play('kick')         right front push kick at hip height, 0.85 s, at 42 % (stands
//                                 still meanwhile: moves are ignored)
//     walker.play('combo')        jab, cross, hook one after another
//   Events 'action' { action: 'jab' | 'cross' | 'hook' | 'kick', stage: 'start' | 'impact' |
//   'done', x, y, z }: at 'impact' x, y, z is the world point where the fist (wrist joint) or the
//   kicking foot's ball is: test it against the opponent and send the damage then. Strikes work
//   from any upright stance (best from 'guard'); a fall, ragdoll, vehicle or reset cancels them.
//   Being hit: play('hit', { fromX, fromZ, strength }) (a jab 0.6, a cross or hook 1, a kick 1.3);
//   knocked down: play('fall', { fromX, fromZ }) then play('getup'). STRIKES and COMBO are
//   exported from motion/brawlPose.js.
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
//   VEHICLES: getting in and out through the door (player, police, traffic's angry drivers).
//   1. Walk to the door anchor (anchor_door_driver / anchor_door_passenger: on the ground beside
//      the door, facing it): steerTo(walker.input, at.x, at.z, door.x, door.z, 1.4) writes the
//      move and returns the distance left; move the capsule as usual.
//   2. Under about 0.2 m: walker.enterVehicle({ door: doorNode, seat: seatNode, kind: 'driver',
//      wheel: steeringWheelNode, wheelRadius: 0.185, jack: false }). From then until the action
//      event { action: 'enter', stage: 'done' } THE CONTROLLER PLACES THE INSTANCE itself (position
//      and rotation.y from the anchors: stop writing them; the capsule can be parked) and the
//      person turns to the door, reaches the handle, opens it stepping back with it, steps round
//      it ducking under the roof, sits and swings in, then pulls the door shut (TRANSIT_SECONDS
//      enter 3.0 s, jack 3.55 s). Every frame meanwhile pass walker.transit.door (0 shut .. 1
//      open) to fleet.setDoorOpen(vehicleId, side, amount). At 'done' the person is seated exactly
//      as after walker.sit({ kind, wheel }): place the instance at the seat anchor from then on.
//      jack: true (carjacking) adds a stage 'pull' (both hands into the cabin, hauling back): at
//      the event { action: 'enter', stage: 'pull' } call the occupant's
//      walker.exitVehicle({ door, seat, dragged: true }).
//   3. Getting out: walker.exitVehicle({ door, seat }) from the seat: pushes the door open, swings
//      out and stands up in the doorway, steps clear and pushes it shut (2.6 s); the controller
//      places the instance until { action: 'exit', stage: 'done' }, then hand the capsule back at
//      walker.transit.x / z (the feet) facing walker.state.yaw.
//   4. Dragged out: walker.exitVehicle({ door, seat, dragged: true }) yanks the person out and
//      throws them on the ground beside the door (1.35 s, the door held open); at { action:
//      'dragged', stage: 'done' } the stance is 'fallen'; play('getup') stands them up.
//   Stage events { action: 'enter' | 'exit' | 'dragged', stage } for every stage: enter: start,
//   reach, open, (pull), step_in, close, done; exit: start, step_out, close, done; dragged: start,
//   thrown, done. walker.action reads 'enter' | 'exit' | 'dragged' meanwhile. The door is taken
//   as hinged at its front edge (DOOR_SHAPE in motion/vehicleTransit.js); any side, any vehicle
//   with the two anchors. walker.sit(...) or walker.reset() cancel a transit.
//
//   RAGDOLL (hit by a car, thrown by an explosion): walker.ragdoll(options) throws the person as
//   points and constraints over the skeleton (physics/ragdoll.js) that fall onto the ground and
//   out of boxes, the pose rebuilt from the points every frame. Options:
//     vx, vy, vz   world velocity given to the body, m/s (a car: its velocity plus 1 to 2 up; a
//                  blast: 4 to 8 away from the centre and 3 to 5 up)
//     at           height of the blow as a share of the stature (a bumper 0.3, a blast 0.5):
//                  points far from it get less, so a car sweeps the legs and the body turns over
//     spin         rad/s about the vertical
//     ground(x, z) the ground height (default: flat at the instance's height)
//     boxes        [{ x, y, z, hx, hy, hz, yaw }] centre, half sizes and turn (the car, a wall)
//     getUp        true: play('getup') as soon as the body has come to rest
//   From then until { action: 'ragdoll', stage: 'rest' } THE CONTROLLER MOVES THE INSTANCE with
//   the pelvis (stop writing its position; hand the capsule back at the instance afterwards). At
//   rest (still 0.45 s, or 5 s) the instance is turned to the way the body lies and the pose
//   blends (RAGDOLL_SETTLE_SECONDS 0.5) into the lying pose of that way: on the back, face down
//   or on a side (walker.fallDirection); the stance is then 'fallen' and play('getup') rises the
//   matching way. A held weapon is dropped (holding null). walker.ragdolling is true meanwhile.
//   Events 'action' { action: 'ragdoll', stage: 'start' | 'rest' }. reset() cancels it.
//   SLOPES: walker.setGround((x, z) => height) once (or a ragdoll's options.ground) makes lying,
//   falling, getting up and the ragdoll's settle follow the ground's slope (motion/groundTilt.js).
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
import { POSE_HIPS_TRANSLATION, blendPoses, createPose } from '../skeleton/poseBuffer.js';
import { smoothStep } from '../skeleton/quaternionMath.js';
import {
  aimWeaponAt, createWeaponHandling, holdWeapon, lowerTowardsAhead, recoilEnvelope, setWeaponGrip, setWeaponMuzzle,
  startReload, startShot, stepWeapon, writeWeaponLayer,
} from './weaponHandling.js';
import { BENCH_SEAT_HEIGHT, createGestureInput, writeBenchSitPose, writeGesturePose } from '../motion/everydayPose.js';
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
  fallen: Object.freeze({ body: 'lying', hands: null }),
});

/** Seconds of each fade: weapon up/down, aim, hands, gestures, seats, and each whole-body pose. */
export const LAYER_TIMES = Object.freeze({
  weapon: 0.3, aim: 0.22, hands: 0.45, gesture: 0.35, seat: 0.6,
  kneel: 0.9, crouch: 0.4, cower: 0.3, bench: 0.8, lying: 0.6,
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
        beginLayer();
        writeWeaponLayer(layerPose, body, rig.fk, weaponState, Boolean(seatKind), !seatKind && !transit.kind);
        endLayer(weapon);
      }
      if (hands > 0) {
        beginLayer();
        if (handsShown === 'guard' || handsShown === 'block') { // a boxer's guard on the fighting stance
          if (!seatKind && !transit.kind && !bodyShown) writeAimStance(layerPose, body, rig.fk, GUARD_STANCE);
          writeGuardPose(layerPose, body, rig.fk, handsShown, time);
        } else writeHandsPose(layerPose, body, rig.fk, handsShown, time);
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
        emit('fire', startShot(weaponState, time));
      } else if (name === 'reload') {
        startReload(weaponState, options.duration ?? 1.6);
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
