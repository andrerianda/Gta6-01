// The lead on foot: turns the camera-relative move input into a facing and a ground speed with
// inertia (a step of acceleration to start, a shorter one to stop, a slower pace through sharp
// turns), walk, run and sprint, and the jump; then moves the body, through the physics
// character capsule when the physics system offers one, or over a ground-height function
// otherwise. Each fixed step keeps the previous and current pose so drawing can interpolate.
import { approachAngle, moveToward, wrapAngle } from './smoothMotion.js';

/** Paces and rates of the lead on foot (metres, seconds, radians). */
export const ON_FOOT_TUNING = Object.freeze({
  walkSpeed: 1.65,
  runSpeed: 4.3,
  sprintSpeed: 6.9,
  acceleration: 6.5,
  deceleration: 11,
  turnRate: 9,
  maxTurnRate: 8.5,
  airTurnRate: 1.5,
  jumpSpeed: 4.8,
  gravity: 15,
  stepHeight: 0.4,
});

/**
 * Creates the state of a lead on foot.
 * @param {number} x Feet position.
 * @param {number} y
 * @param {number} z
 * @param {number} heading Radians, 0 north, growing to the left (three.js rotation.y).
 */
export function createOnFootState(x = 0, y = 0, z = 0, heading = 0) {
  return {
    x, y, z, previousX: x, previousY: y, previousZ: z,
    heading, previousHeading: heading, wantedHeading: heading,
    speed: 0, groundSpeed: 0, acceleration: 0, verticalSpeed: 0,
    velocityX: 0, velocityZ: 0, grounded: true, sprinting: false, moving: false, groundLevel: y,
  };
}

/**
 * One step of the movement rules: facing and speed from the intent.
 * @param {ReturnType<typeof createOnFootState>} state Updated in place.
 * @param {{x: number, z: number, sprint: boolean, walk: boolean}} intent The wanted direction in
 *   world axes with a length of 0..1.
 * @param {number} dt Seconds.
 * @param {typeof ON_FOOT_TUNING} [tuning]
 */
export function steerOnFoot(state, intent, dt, tuning = ON_FOOT_TUNING) {
  const amount = Math.min(1, Math.hypot(intent.x, intent.z));
  state.moving = amount > 0.05;
  let target = 0;
  if (state.moving) {
    state.wantedHeading = Math.atan2(-intent.x, -intent.z);
    const pace = intent.walk ? tuning.walkSpeed : intent.sprint ? tuning.sprintSpeed : tuning.runSpeed;
    target = pace * amount;
    // A sharp turn slows the lead down instead of sliding it sideways.
    const turn = Math.abs(wrapAngle(state.wantedHeading - state.heading));
    target *= Math.max(0.2, Math.cos(Math.min(turn, Math.PI / 2) * 0.85));
  }
  state.sprinting = state.moving && intent.sprint && !intent.walk;
  if (state.grounded) {
    const before = state.speed;
    state.speed = moveToward(state.speed, target, tuning.acceleration, tuning.deceleration, dt);
    state.acceleration = (state.speed - before) / dt;
    const rate = state.moving ? tuning.turnRate : 0;
    state.heading = approachAngle(state.heading, state.wantedHeading, rate, dt, tuning.maxTurnRate);
  } else {
    state.acceleration = 0;
    state.heading = approachAngle(state.heading, state.wantedHeading, state.moving ? tuning.airTurnRate : 0, dt);
  }
  state.velocityX = -Math.sin(state.heading) * state.speed;
  state.velocityZ = -Math.cos(state.heading) * state.speed;
}

/**
 * Reads the on-foot actions into an intent: the move keys turned by the camera's yaw (so W
 * walks away from the camera), sprint, walk and jump.
 * @param {{axis: (name: string) => number, held: (action: string) => boolean, pressed: (action: string) => boolean}} input
 * @param {number} cameraYaw Radians, the same convention as a heading.
 * @param {{x: number, z: number, sprint: boolean, walk: boolean, jump: boolean}} out
 * @param {boolean} [walkForced] Walk whatever the keys say (scenes, scripted moments).
 */
export function readOnFootIntent(input, cameraYaw, out, walkForced = false) {
  const across = input.axis('moveX');
  const ahead = input.axis('moveZ');
  const sin = Math.sin(cameraYaw);
  const cos = Math.cos(cameraYaw);
  let x = -sin * ahead + cos * across;
  let z = -cos * ahead - sin * across;
  const length = Math.hypot(x, z);
  if (length > 1) { x /= length; z /= length; }
  out.x = x; out.z = z;
  out.sprint = input.held('sprint');
  out.walk = walkForced || input.held('walk');
  out.jump = input.pressed('jump');
  return out;
}

/**
 * Creates the mover that carries the lead's body: the physics capsule or a ground follower.
 * @param {object} options
 * @param {any} [options.physics] The physics system (used when it has createCharacterController).
 * @param {(x: number, z: number, fromY: number) => number} options.groundHeightAt Ground under a point.
 * @param {typeof ON_FOOT_TUNING} [options.tuning]
 */
export function createOnFootMovement({ physics, groundHeightAt, tuning = ON_FOOT_TUNING }) {
  const state = createOnFootState();
  const capsule = physics && typeof physics.createCharacterController === 'function'
    ? physics.createCharacterController({ x: 0, z: 0, jumpSpeed: tuning.jumpSpeed, userRef: 'player' })
    : null;
  let jumpQueued = false;

  /** Puts the lead somewhere at rest. */
  function placeAt(x, z, heading = state.heading, y = groundHeightAt(x, z, 4)) {
    state.x = state.previousX = x; state.y = state.previousY = y; state.z = state.previousZ = z;
    state.heading = state.previousHeading = state.wantedHeading = heading;
    state.speed = state.groundSpeed = state.verticalSpeed = 0;
    state.grounded = true;
    state.groundLevel = y;
    if (capsule) capsule.placeAt(x, y, z);
  }

  /** Carries the body one step (the capsule moves in the physics step that follows). */
  function moveBody(dt) {
    if (capsule) {
      capsule.input.x = state.velocityX;
      capsule.input.z = state.velocityZ;
      capsule.input.jump = jumpQueued;
      jumpQueued = false;
      const p = capsule.position;
      state.x = p.x; state.y = p.y; state.z = p.z;
      state.grounded = capsule.grounded !== false;
      state.groundLevel = groundHeightAt(p.x, p.z, p.y + tuning.stepHeight);
      return;
    }
    state.x += state.velocityX * dt;
    state.z += state.velocityZ * dt;
    const ground = groundHeightAt(state.x, state.z, state.y + tuning.stepHeight);
    if (state.grounded && jumpQueued) {
      state.verticalSpeed = tuning.jumpSpeed;
      state.grounded = false;
    }
    jumpQueued = false;
    if (!state.grounded) {
      state.verticalSpeed -= tuning.gravity * dt;
      state.y += state.verticalSpeed * dt;
      if (state.y <= ground && state.verticalSpeed <= 0) {
        state.y = ground;
        state.verticalSpeed = 0;
        state.grounded = true;
      }
    } else if (ground < state.y - tuning.stepHeight) {
      state.grounded = false;
    } else {
      state.y = ground;
    }
    state.groundLevel = ground;
  }

  /**
   * One fixed step.
   * @param {{x: number, z: number, sprint: boolean, walk: boolean, jump: boolean}} intent
   * @param {number} dt
   */
  function step(intent, dt) {
    state.previousX = state.x; state.previousY = state.y; state.previousZ = state.z;
    state.previousHeading = state.heading;
    if (intent.jump && state.grounded) jumpQueued = true;
    steerOnFoot(state, intent, dt, tuning);
    moveBody(dt);
    // What the legs see: the distance the body really covered (zero against a wall).
    const covered = Math.hypot(state.x - state.previousX, state.z - state.previousZ) / dt;
    state.groundSpeed = capsule ? Math.min(covered, state.speed + 0.5) : state.speed;
    if (capsule && state.grounded) state.speed = Math.min(state.speed, state.groundSpeed + 1.5);
  }

  function dispose() {
    if (capsule && typeof capsule.dispose === 'function') capsule.dispose();
    if (capsule && physics && typeof physics.removeCharacterController === 'function') physics.removeCharacterController(capsule);
  }

  return { state, capsule, placeAt, step, dispose };
}
