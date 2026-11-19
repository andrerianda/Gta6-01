// Checkpoint 1, the gate of Base Aérea Punta Garza at 05:38: "Lt. Osorio" walks up the access
// road; at the barrier the guard asks for his pass, the player shows it (the interact key), the
// guard reads the schedule and waves him through: the flag base.officerAccess goes up, the barrier
// opens, and Maj. Quiroga, just inside, says one quiet line. Then the walk across the base.
// Walking on without showing the pass is trespass; a drawn weapon ends it at once.
import { GAME_EVENTS } from '../../../core/events/gameEvents.js';
import { WORLD_FLAGS } from '../../../core/state/worldFlags.js';
import { FINAL_PLACES } from '../finalCheckpoints.js';

/** How near the barrier the guard speaks, metres (the restricted area's own challenge begins at 26). */
const ASK_RANGE = 31;
/** The on-foot rules, shown in the help box of both ground stages. */
export const ON_FOOT_RULES = 'You are Lt. Osorio.\nWalk. Shift runs: do not.\nReturn salutes with G.\nKeep your weapon holstered.\nStay on the marked way.';

/** What the ground stages read of the lead: place, speed, whether a weapon is out. */
export function readLead(context) {
  const player = context.systems.find('player');
  const position = player?.entity?.position;
  if (!position) return null;
  const motion = player.motion ?? {};
  const combat = context.systems.find('combat');
  const weapon = combat?.inventory?.weapon ?? null;
  return {
    x: position.x, z: position.z,
    speed: player.mode === 'onFoot' ? Math.hypot(motion.velocityX ?? 0, motion.velocityZ ?? 0) : 0,
    sprinting: Boolean(motion.sprinting), airborne: motion.grounded === false, onFoot: player.mode === 'onFoot',
    weaponDrawn: Boolean(weapon && weapon.id && weapon.id !== 'fists') || Boolean(combat?.aiming),
  };
}

/** An officer walks: the lead walks unless the player holds the sprint key (which is the mistake to make). */
export function keepOfficerPace(context, on = true) {
  const player = context.systems.find('player');
  if (typeof player?.setWalking === 'function') player.setWalking(on && !context.input.held('sprint'));
}

/**
 * @param {object} rt The mission runtime's `rt`.
 */
export function createGateStage(rt) {
  const { context } = rt;
  const gate = FINAL_PLACES.gate;
  let phase = 'approach';

  return {
    enter() {
      phase = 'approach';
      rt.objective('Show your pass at the gate of Base Aérea Punta Garza', { x: gate.x, z: gate.z });
      rt.hint(ON_FOOT_RULES);
    },

    update() {
      const lead = readLead(context);
      if (!lead) return;
      keepOfficerPace(context);
      const distance = Math.hypot(lead.x - gate.x, lead.z - gate.z);
      if (lead.weaponDrawn && distance < 90) { rt.fail('weapon_drawn'); return; }
      if (phase === 'approach' && distance < ASK_RANGE) {
        phase = 'asked';
        rt.speak('gt_01');
        rt.ui.setPrompt('E', 'Show pass');
      } else if (phase === 'asked' && (context.input.pressed('interact') || context.input.pressed('enterVehicle'))) {
        phase = 'checking';
        rt.ui.setPrompt(null, null);
        // The guard reads the pass: the photo is Dez's own, the name is on the schedule.
        rt.after(1.1, () => {
          rt.flags.set(WORLD_FLAGS.BASE_OFFICER_ACCESS, true);
          const seconds = rt.speak('gt_02');
          rt.after(seconds + 0.5, () => {
            phase = 'through';
            rt.after(rt.speak('gt_03', { quiet: true }) + 0.2, () => rt.next());
          });
        });
      }
    },

    onEvent(topic, payload) {
      // Past the barrier without a pass: the guards have their answer ready.
      if (topic === GAME_EVENTS.RESTRICTED_AREA_CHANGED && payload?.state === 'trespassing' && !rt.flags.get(WORLD_FLAGS.BASE_OFFICER_ACCESS)) rt.fail('exposed');
    },

    exit() {
      rt.ui.setPrompt(null, null);
      keepOfficerPace(context, false);
    },
  };
}
