// The follow camera. On foot (onFootCamera.js, numbers in ON_FOOT_FRAMING): free roam keeps the
// lead centred, whole body in view, the camera ~3.9 m behind and above the head looking 10 deg
// down; aiming (right mouse held, or setAimFraming) eases in over the right shoulder in ~0.3 s,
// the lead at a third from the left seen from the waist up, the aim point at the screen centre.
// It pulls back a little when sprinting, swaps shoulder with V, and turns with the mouse. In a
// vehicle it is a centred chase view (vehicleChaseCamera.js) with look-behind on C. Both follow
// a subject sampled every fixed step and interpolated per frame (cameraDirector.js), stay out
// of walls by physics sweeps (cameraCollision.js), and rise over the lead when wasted or busted
// (downedCamera.js). It cuts on teleport, answers CAMERA_CUT_TO, CAMERA_RELEASE and
// CAMERA_SHAKE, emits CAMERA_CUT and CAMERA_MODE_CHANGED, writes `context.focus` and the view
// camera in lateUpdate. Contract: docs/ARCHITECTURE.md, "followCamera".
// Members for other systems (combat, scenes):
//   followCamera.setAimFraming(true|false)  hold the aim framing while aiming or firing (combat);
//   followCamera.aimBlend                   0 roam .. 1 aim, as shown (for the reticle's fade);
//   followCamera.setViewOffset(radians)     turn the on-foot view around the lead (+ left) until
//                                           the mouse moves (showcase scenes: off the sun);
//   followCamera.yaw, followCamera.mode     the camera's heading; 'onFoot' or 'inVehicle'.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';

/**
 * Creates the follow camera system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createFollowCameraSystem(context) {
  let director = null;
  const unsubscribe = [];

  return {
    name: 'followCamera',
    dependsOn: ['player'],

    /** The camera's heading (0 north, growing to the left): the lead walks relative to it. */
    get yaw() { return director ? director.yaw : 0; },
    /** 'onFoot' or 'inVehicle'. */
    get mode() { return director ? director.mode : 'onFoot'; },
    /** Holds the aim framing while `on` (combat calls this while aiming or firing). */
    setAimFraming(on) { if (director) director.setAimFraming(on); },
    /** 0 free roam .. 1 aim framing, as shown now (eases over about 0.3 s). */
    get aimBlend() { return director ? director.aimBlend : 0; },
    /** Turns the on-foot view around the lead (radians, + left) until the mouse moves: scenes. */
    setViewOffset(angle) { if (director) director.setViewOffset(angle); },

    async init(progress) {
      const { createCameraDirector } = await import('./cameraDirector.js');
      director = createCameraDirector(context);
      context.commands.handle(GAME_COMMANDS.CAMERA_CUT_TO, ({ position, target, fieldOfView }) => director.hold({ position, target, fieldOfView }));
      context.commands.handle(GAME_COMMANDS.CAMERA_RELEASE, () => director.release());
      context.commands.handle(GAME_COMMANDS.CAMERA_SHAKE, ({ strength = 1, seconds = 0.4 }) => director.shake(strength, seconds));
      progress(1, 'follow camera');
    },

    start() {
      const cutOn = (topic, reason) => {
        const handler = () => director.cut(reason);
        context.events.on(topic, handler);
        unsubscribe.push(() => context.events.off(topic, handler));
      };
      cutOn(GAME_EVENTS.PLAYER_TELEPORTED, 'teleport');
      cutOn(GAME_EVENTS.PLAYER_SPAWNED, 'spawn');
      cutOn(GAME_EVENTS.PLAYER_RESPAWNED, 'respawn');
    },

    fixedUpdate() {
      director.sampleStep();
    },

    lateUpdate(deltaSeconds, alpha) {
      director.frame(deltaSeconds, alpha);
    },

    dispose() {
      for (const off of unsubscribe) off();
    },
  };
}
