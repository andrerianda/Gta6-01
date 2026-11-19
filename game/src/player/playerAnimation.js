// The lead's body on screen: one skinned instance of the lead's model, placed between the last
// two fixed steps (so it never stutters at any frame rate) and moved and posed every frame by the
// character run-time's locomotion controller: speed with inertia (a step to start and to stop),
// the head leading every turn, walk, jog, run and sprint blended by speed, the stride advanced
// by distance so the planted feet never slide, the lean and the bank. The controller's velocity
// and facing go back to the movement (follow), which carries the capsule by them. On top of the
// gait: the jump's crouch, tuck and landing dip, the hands up of an arrest and the sprawl when
// wasted (poseOverlays.js). Getting in and out of a car the run-time's vehicle transit places
// and poses it (transit()); at the wheel it is placed at the seat anchor and posed by the
// run-time's seat layer (seat()).
import { createLocomotionController } from '../characters/controller/locomotionController.js';
import { airbornePose, dipLegs, landingDip, reachBothHands, sprawlPose, tuckFor } from './poseOverlays.js';
import { approach } from './smoothMotion.js';

/**
 * Creates the lead's figure.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {string} assetId The lead's character model.
 */
export function createPlayerAnimation(context, assetId) {
  const asset = context.assets.get(assetId);
  const instance = context.assets.instantiate(assetId, { lod: 0 });
  instance.name = 'player-lead';
  instance.rotation.order = 'YXZ';
  instance.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
      node.frustumCulled = false;
    }
  });
  const stature = asset && asset.extras ? asset.extras.height : undefined;
  const walker = createLocomotionController(instance, { stature, seed: 7 });
  const rig = walker.rig;
  const input = { moveX: 0, moveZ: 0, facing: NaN, measuredSpeed: undefined };
  const grips = new Float32Array(6);
  const look = { air: 0, landings: 0, landed: 9, impact: 0, handsUp: 0, fallen: 0, handsWanted: 0, fallWanted: 0 };
  context.view.layers.dynamic.add(instance);

  /** The hands-up and sprawl overlays, and the fall onto the back. */
  function gestures(dt) {
    look.handsUp = approach(look.handsUp, look.handsWanted, 5, dt);
    look.fallen = look.fallWanted ? Math.min(1, look.fallen + dt * 2.2) : 0;
    const fall = look.fallen * look.fallen;
    instance.rotation.x = fall * Math.PI * 0.5;
    instance.rotation.z = 0;
    instance.position.y += fall * 0.12;
    sprawlPose(rig.pose, fall);
    if (look.handsUp > 0.001) {
      const head = rig.body.restPosition[5 * 3 + 1];
      grips[0] = -0.3; grips[1] = head + 0.2; grips[2] = 0.05;
      grips[3] = 0.3; grips[4] = head + 0.2; grips[5] = 0.05;
      reachBothHands(rig.pose, rig.body, rig.fk, grips, look.handsUp, -0.2);
    }
  }

  /**
   * Places, moves and poses the figure on foot for this frame.
   * @param {number} dt Frame seconds.
   * @param {number} alpha How far between the last two fixed steps this frame is.
   * @param {ReturnType<typeof import('./onFootMovement.js').createOnFootState>} state
   * @param {{follow: (vx: number, vz: number, yaw: number, speed: number) => void}} movement
   */
  function update(dt, alpha, state, movement) {
    // (the step offset eases a kerb's or a stair's height in instead of a jump in one frame)
    const offset = state.previousStepOffset + (state.stepOffset - state.previousStepOffset) * alpha;
    instance.position.set(
      state.previousX + (state.x - state.previousX) * alpha,
      state.previousY + (state.y - state.previousY) * alpha + offset,
      state.previousZ + (state.z - state.previousZ) * alpha,
    );
    const ws = walker.state;
    if (state.grounded || look.fallWanted) {
      input.moveX = look.fallWanted || look.handsWanted ? 0 : state.wantX;
      input.moveZ = look.fallWanted || look.handsWanted ? 0 : state.wantZ;
    } else {
      input.moveX = ws.vx; input.moveZ = ws.vz;
    }
    input.facing = state.facing;
    // Against a wall the legs slow down with the distance really made.
    input.measuredSpeed = state.grounded && ws.speed > 1 && state.groundSpeed < ws.speed * 0.6 ? state.groundSpeed : undefined;
    walker.update(dt, input);
    movement.follow(ws.vx, ws.vz, ws.yaw, ws.speed);

    // The jump: crouch before the take-off, tuck in the air, dip on landing.
    if (state.landings !== look.landings) {
      look.landings = state.landings;
      look.landed = 0;
      look.impact = state.landedSpeed;
    }
    look.landed += dt;
    look.air = approach(look.air, state.grounded ? 0 : tuckFor(state.verticalSpeed), state.grounded ? 14 : 9, dt);
    const dip = 0.13 * state.takeoff + landingDip(look.landed, look.impact);
    airbornePose(rig.pose, look.air);
    dipLegs(rig.pose, rig.body, dip);
    gestures(dt);
    rig.applyPose();
  }

  /**
   * Draws the figure in, or on its way into or out of, a seat for this frame: the instance goes
   * to `position` (the seated hip point in the seat; the feet when standing) facing along
   * `quaternion`, and the character run-time poses it with its seat layer (walker.sit was called
   * by the vehicle entry: the driver's hands hold the rim and follow the steering wheel).
   * @param {number} dt
   * @param {{x: number, y: number, z: number}} position World.
   * @param {THREE.Quaternion} quaternion The figure's orientation (the car's, seated).
   */
  function seat(dt, position, quaternion) {
    instance.position.set(position.x, position.y, position.z);
    instance.quaternion.copy(quaternion);
    input.moveX = 0; input.moveZ = 0; input.facing = NaN; input.measuredSpeed = undefined;
    walker.update(dt, input);
    // The controller turns rotation.y to its own yaw after posing: the seat's orientation wins.
    instance.quaternion.copy(quaternion);
  }

  /**
   * Poses the figure while the run-time's vehicle transit (walker.enterVehicle / exitVehicle)
   * gets it in or out: the controller places the instance itself from the car's anchors.
   * @param {number} dt
   */
  function transit(dt) {
    instance.rotation.x = 0; instance.rotation.z = 0;
    input.moveX = 0; input.moveZ = 0; input.facing = NaN; input.measuredSpeed = undefined;
    walker.update(dt, input);
  }

  return {
    instance,
    rig,
    walker,
    update,
    seat,
    transit,
    /** Stands the figure still facing `yaw` (teleport, out of a car, respawn). */
    reset(yaw) {
      walker.reset(yaw);
      instance.rotation.set(0, yaw, 0, 'YXZ');
      look.air = 0; look.landed = 9; look.fallen = 0;
    },
    /** Raises the hands (an arrest) or lets the body fall (wasted); false to undo. */
    setGesture(handsUp, fallen) { look.handsWanted = handsUp ? 1 : 0; look.fallWanted = Boolean(fallen); },
    setVisible(visible) { instance.visible = visible; },
    dispose() { instance.removeFromParent(); },
  };
}
