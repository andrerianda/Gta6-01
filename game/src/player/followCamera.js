// The follow camera. On foot it is a close, low over-the-shoulder view (onFootCamera.js): the
// lead large on the left, about 40 % from the edge, the aim point at the screen centre, the mouse
// turns it with pointer lock, it pulls back when sprinting and swaps shoulder with V, and every
// change eases. In a vehicle it is a centred chase view (vehicleChaseCamera.js) that swings with
// speed and steering, with look-behind on C. Both follow with a damped lag on a subject sampled
// at every fixed step and interpolated per frame (cameraDirector.js), and stay out of walls by
// physics sweeps (cameraCollision.js). It cuts on teleport, answers CAMERA_CUT_TO,
// CAMERA_RELEASE and CAMERA_SHAKE, emits CAMERA_CUT and CAMERA_MODE_CHANGED, and writes
// `context.focus` and the view camera in lateUpdate. Contract: docs/ARCHITECTURE.md, "followCamera".
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
    /** On-foot framing by name: 'close' (default), 'loose', 'previous' (onFootCamera.js). */
    setFraming(name) { return director ? director.setFraming(name) : false; },
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
