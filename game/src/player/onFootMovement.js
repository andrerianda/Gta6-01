// The lead on foot: turns the camera-relative move input into the ground velocity the lead
// wants (run by default, sprint with Shift, walk), and carries the body: through the physics
// character capsule when the physics system offers one, or over a ground-height function
// otherwise. Speed and facing with inertia (the step to start and stop, the turn that leads with
// the head) belong to the character run-time's locomotion controller, which the lead's figure
// runs every frame (playerAnimation.js) and which hands its velocity back through follow(): the
// capsule moves by that velocity. The jump has a short crouch before the take-off; the landing
// is recorded (impact speed) for the dip. Each fixed step keeps the previous and current feet
// position so drawing can interpolate.

/** Paces and rates of the lead on foot (metres, seconds). */
export const ON_FOOT_TUNING = Object.freeze({
  walkSpeed: 1.65,
  runSpeed: 4.3,
  sprintSpeed: 6.9,
  takeoffSeconds: 0.1,
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
    heading, previousHeading: heading, wantedHeading: heading, facing: NaN,
    wantX: 0, wantZ: 0, speed: 0, groundSpeed: 0, verticalSpeed: 0,
    velocityX: 0, velocityZ: 0, grounded: true, sprinting: false, moving: false, groundLevel: y,
    takeoff: 0, airTime: 0, landedSpeed: 0, landings: 0,
  };
}

/**
 * The movement rule: the ground velocity the lead wants from the intent.
 * @param {ReturnType<typeof createOnFootState>} state Updated in place (wantX, wantZ, moving,
 *   wantedHeading, sprinting).
 * @param {{x: number, z: number, sprint: boolean, walk: boolean}} intent The wanted direction in
 *   world axes with a length of 0..1.
 * @param {typeof ON_FOOT_TUNING} [tuning]
 */
export function steerOnFoot(state, intent, tuning = ON_FOOT_TUNING) {
  const amount = Math.min(1, Math.hypot(intent.x, intent.z));
  state.moving = amount > 0.05;
  state.sprinting = state.moving && intent.sprint && !intent.walk;
  if (!state.moving) {
    state.wantX = 0; state.wantZ = 0;
    return;
  }
  const pace = intent.walk ? tuning.walkSpeed : intent.sprint ? tuning.sprintSpeed : tuning.runSpeed;
  state.wantX = (intent.x / amount) * pace * amount;
  state.wantZ = (intent.z / amount) * pace * amount;
  state.wantedHeading = Math.atan2(-intent.x, -intent.z);
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
  let crouching = -1;

  /** Puts the lead somewhere at rest. */
  function placeAt(x, z, heading = state.heading, y = groundHeightAt(x, z, 4)) {
    state.x = state.previousX = x; state.y = state.previousY = y; state.z = state.previousZ = z;
    state.heading = state.previousHeading = state.wantedHeading = heading;
    state.speed = state.groundSpeed = state.verticalSpeed = 0;
    state.velocityX = state.velocityZ = state.wantX = state.wantZ = 0;
    state.grounded = true;
    state.groundLevel = y;
    state.takeoff = 0; state.airTime = 0; state.landedSpeed = 0;
    crouching = -1; jumpQueued = false;
    if (capsule) capsule.placeAt(x, y, z);
  }

  /**
   * Takes the locomotion controller's result (called every frame by the figure).
   * @param {number} vx Ground velocity, m/s.
   * @param {number} vz
   * @param {number} yaw Facing (rotation.y).
   * @param {number} speed
   */
  function follow(vx, vz, yaw, speed) {
    state.velocityX = vx; state.velocityZ = vz; state.heading = yaw; state.speed = speed;
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
      state.verticalSpeed = (state.y - state.previousY) / dt;
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
        state.grounded = true;
      }
    } else if (ground < state.y - tuning.stepHeight) {
      state.grounded = false;
      state.verticalSpeed = 0;
    } else {
      state.y = ground;
      state.verticalSpeed = 0;
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
    steerOnFoot(state, intent, tuning);
    // The jump: a short crouch, then the take-off.
    if (intent.jump && state.grounded && crouching < 0) crouching = tuning.takeoffSeconds;
    if (crouching >= 0) {
      crouching -= dt;
      state.takeoff = Math.min(1, 1 - crouching / tuning.takeoffSeconds);
      if (crouching <= 0) { jumpQueued = true; crouching = -1; state.takeoff = 0; }
    }
    const wasGrounded = state.grounded;
    const falling = state.verticalSpeed;
    moveBody(dt);
    if (!wasGrounded && state.grounded && state.airTime > 0.12) {
      state.landedSpeed = Math.max(0, -falling);
      state.landings += 1;
    }
    state.airTime = state.grounded ? 0 : state.airTime + dt;
    // What the legs see: the distance the body really covered (zero against a wall).
    const covered = Math.hypot(state.x - state.previousX, state.z - state.previousZ) / dt;
    state.groundSpeed = capsule ? Math.min(covered, state.speed + 0.5) : state.speed;
  }

  function dispose() {
    if (capsule && typeof capsule.dispose === 'function') capsule.dispose();
    if (capsule && physics && typeof physics.removeCharacterController === 'function') physics.removeCharacterController(capsule);
  }

  return { state, capsule, placeAt, follow, step, dispose };
}
