// The lead's body on screen: one skinned instance of the lead's model, placed between the last
// two fixed steps (so it never stutters at any frame rate) and posed every frame by the
// character run-time's locomotion model. The gait follows a smoothed ground speed (idle, walk,
// jog, run and sprint blend continuously), the stride phase advances at the gait's own stride
// rate (so the planted foot stays planted), the trunk leans with acceleration and banks into
// turns, and the head leads a turn toward where the lead is about to face.
import { createLocomotionScratch, writeLocomotionPose } from '../characters/motion/locomotionPose.js';
import { createCharacterRig } from '../characters/rig/characterRig.js';
import { approach, lerpAngle, wrapAngle } from './smoothMotion.js';

const clamp = (value, low, high) => (value < low ? low : value > high ? high : value);

/**
 * Creates the lead's figure.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {string} assetId The lead's character model.
 * @returns {{instance: object, rig: object, update: (dt: number, alpha: number, state: object) => void,
 *   setVisible: (visible: boolean) => void, dispose: () => void}}
 */
export function createPlayerAnimation(context, assetId) {
  const asset = context.assets.get(assetId);
  const instance = context.assets.instantiate(assetId, { lod: 0 });
  instance.name = 'player-lead';
  instance.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
      node.frustumCulled = false;
    }
  });
  const stature = asset && asset.extras ? asset.extras.height : undefined;
  const rig = createCharacterRig(instance, { stature });
  const scratch = createLocomotionScratch();
  const motion = { speed: 0, phase: 0, time: 0, seed: 7, lean: 0, bank: 0, headYaw: 0 };
  let shownHeading = null;
  context.view.layers.dynamic.add(instance);

  /**
   * Places and poses the figure for this frame.
   * @param {number} dt Frame seconds.
   * @param {number} alpha How far between the last two fixed steps this frame is.
   * @param {ReturnType<typeof import('./onFootMovement.js').createOnFootState>} state
   */
  function update(dt, alpha, state) {
    instance.position.set(
      state.previousX + (state.x - state.previousX) * alpha,
      state.previousY + (state.y - state.previousY) * alpha,
      state.previousZ + (state.z - state.previousZ) * alpha,
    );
    const heading = lerpAngle(state.previousHeading, state.heading, alpha);
    instance.rotation.y = heading;
    const yawRate = shownHeading === null || dt <= 0 ? 0 : wrapAngle(heading - shownHeading) / dt;
    shownHeading = heading;

    const wanted = state.grounded ? state.groundSpeed : motion.speed;
    motion.speed = approach(motion.speed, wanted, 9, dt);
    if (motion.speed < 0.02 && wanted === 0) motion.speed = 0;
    motion.bank = approach(motion.bank, clamp(yawRate * motion.speed * 0.03, -0.26, 0.26), 7, dt);
    motion.lean = approach(motion.lean, clamp(state.acceleration * 0.022, -0.12, 0.13), 5, dt);
    const ahead = state.moving ? wrapAngle(state.wantedHeading - heading) : 0;
    motion.headYaw = approach(motion.headYaw, clamp(ahead * 0.75, -0.9, 0.9), 8, dt);
    motion.phase += scratch.gait.strideRate * dt * (state.grounded ? 1 : 0.3);
    if (motion.phase > 64) motion.phase -= 64;
    motion.time += dt;
    writeLocomotionPose(rig.pose, rig.body, rig.fk, motion, scratch);
    rig.applyPose();
  }

  return {
    instance,
    rig,
    motion,
    update,
    setVisible(visible) { instance.visible = visible; },
    dispose() { instance.removeFromParent(); },
  };
}
