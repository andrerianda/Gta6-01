// The locomotion controller: one call per frame turns "where the player wants to go and face"
// into a person walking, running, starting, stopping and turning like a person. It owns the
// body's speed with inertia (a step of acceleration to start and to stop), its heading (turning
// on the spot when standing, banking into turns when moving, the head leading every turn), the
// stride phase advanced by distance so the planted feet never slide, the lean from acceleration,
// the cross-fade between standing and moving (one gait model, continuous in speed, so walk, jog,
// run and sprint blend by speed and never pop), and foot-strike events. Deterministic for the
// same inputs and seed; no allocation per update. Works on any body of the shared skeleton.
//
// THE INTERFACE (for the player programmer)
//
//   import { createLocomotionController } from '../characters/controller/locomotionController.js';
//   const person = assets.instantiate('dez_tolliver');            // any character asset
//   scene.add(person);
//   const walker = createLocomotionController(person, { stature: assets.get('dez_tolliver').extras.height, seed: 7 });
//   const input = { moveX: 0, moveZ: 0, facing: NaN, measuredSpeed: undefined }; // keep and reuse
//   const off = walker.on('footstrike', (strike) => playStep(strike.side, strike.x, strike.z, strike.run));
//
//   // every rendered frame (variable dt is fine: the result is frame-rate independent):
//   input.moveX = wantX; input.moveZ = wantZ;   // wanted ground velocity, m/s, world axes
//   input.facing = NaN;                          // or a yaw to face when standing (rotation.y)
//   walker.update(dt, input);                    // (update(dt) alone reads walker.input)
//   capsule.move(walker.state.vx * dt, walker.state.vz * dt);   // move by the controller's velocity
//   person.position.copy(interpolatedCapsuleFeet);              // the controller never moves it
//   // walker.update has already set person.rotation.y = walker.state.yaw and posed the bones.
//
//   If the capsule is blocked, pass the speed it really made as input.measuredSpeed (m/s); the
//   legs then slow down with it instead of running on the spot.
//   Events: 'footstrike' { side: -1 left | 1 right, foot: 'left' | 'right', x, y, z (world, the
//   ankle), speed, run (0 walk .. 1 run, for the sound), time }. The object is reused: copy what
//   you keep. on() returns a function that unsubscribes.
//   Read: walker.state (LocomotionState: vx, vz, speed, yaw, yawRate, spotTurn, phase, lean, bank,
//   headYaw, gait), walker.rig (bones, anchors via rig.node('anchor_hand_r'), body measurements).
//   walker.reset(yaw) stands the person still facing yaw (teleport, leaving a car).
import { createCharacterRig } from '../rig/characterRig.js';
import { BONE } from '../skeleton/humanSkeleton.js';
import { createLocomotionScratch, writeLocomotionPose } from '../motion/locomotionPose.js';
import { createLocomotionState, resetLocomotionState, stepLocomotionState } from './locomotionState.js';

/** Longest step one update integrates; a longer hitch is taken as this (no teleporting legs). */
export const MAX_STEP = 0.1;

const NO_INPUT = Object.freeze({});

/**
 * Creates the locomotion controller of a character.
 * @param {object} target An instantiated character asset (a THREE.Object3D with the shared
 *   skeleton), or a rig made by createCharacterRig.
 * @param {object} [options]
 * @param {number} [options.stature] The person's height; default the instance's userData.height
 *   (the asset's extras), else estimated from the skeleton.
 * @param {number} [options.seed] The person's seed: idle variation (breathing, glances, weight shifts).
 * @param {number} [options.yaw] Starting yaw; default the instance's rotation.y.
 * @param {boolean} [options.driveRotation] Set instance.rotation.y to the body's yaw (default true).
 * @param {object} [options.input] The input object update() reads when called without one.
 * @param {Partial<import('./locomotionState.js').LOCOMOTION_TUNING>} [options.tuning] Feel overrides.
 */
export function createLocomotionController(target, options = {}) {
  // An instance carries the asset's extras (userData.height is the person's height).
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
  const poseInput = { speed: 0, phase: 0, time: 0, seed: options.seed ?? 0, lean: 0, bank: 0, headYaw: 0 };
  const strike = { type: 'footstrike', side: -1, foot: 'left', x: 0, y: 0, z: 0, speed: 0, run: 0, time: 0 };
  /** @type {Record<string, Array<(event: object) => void>>} */
  const listeners = { footstrike: [] };
  let time = 0;

  const emitStrike = (side) => {
    const handlers = listeners.footstrike;
    if (handlers.length === 0) return;
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
    for (let i = 0; i < handlers.length; i += 1) handlers[i](strike);
  };

  const controller = {
    rig,
    state,
    /** The input object update() reads when it is given none. */
    input: options.input ?? { moveX: 0, moveZ: 0, facing: NaN, measuredSpeed: undefined },
    /**
     * Advances the person by dt seconds and poses the bones.
     * @param {number} dt
     * @param {object} [input] { moveX, moveZ, facing, measuredSpeed }; default controller.input.
     */
    update(dt, input = controller.input) {
      const step = Math.min(MAX_STEP, dt > 0 ? dt : 0);
      time += step;
      stepLocomotionState(state, step, input ?? NO_INPUT);
      poseInput.speed = state.stepSpeed;
      poseInput.phase = state.phase;
      poseInput.time = time;
      poseInput.lean = state.lean;
      poseInput.bank = state.bank;
      poseInput.headYaw = state.headYaw;
      writeLocomotionPose(rig.pose, body, rig.fk, poseInput, scratch);
      rig.applyPose();
      if (driveRotation) instance.rotation.y = state.yaw;
      if (state.strikes & 1) emitStrike(-1);
      if (state.strikes & 2) emitStrike(1);
      return state;
    },
    /**
     * Subscribes to an event ('footstrike').
     * @param {string} type
     * @param {(event: object) => void} handler
     * @returns {() => void} Unsubscribes.
     */
    on(type, handler) {
      const list = listeners[type];
      if (!list) throw new Error(`locomotion controller has no event "${type}"`);
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
