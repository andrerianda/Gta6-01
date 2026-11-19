// Stages of the restricted area for captures (`?stage=` on the page): `gate` puts the lead on
// foot twelve metres outside the gate, facing it, so the guards challenge him; `trespass` puts
// him on the apron without access, so the stars come and the guards fire; `officer` sets the flag
// base.officerAccess and walks him from the gate road towards the stands past the duty officer
// and the crew, who salute.
import { GAME_COMMANDS } from '../../core/events/gameCommands.js';
import { WORLD_FLAGS } from '../../core/state/worldFlags.js';
import { puntaGarzaToWorld } from '../../catalog/puntaGarzaAirBase.js';

/** The stage names this system answers. */
export const RESTRICTED_AREA_STAGES = Object.freeze(['gate', 'trespass', 'officer']);

/**
 * Where a stage puts the lead: world metres and the yaw he faces (three.js rotation.y).
 * @param {string} stage
 * @param {{gate: {at: number[], facing: number}}} plan
 * @returns {{x: number, z: number, heading: number, access: boolean, walking: boolean} | null}
 */
export function restrictedAreaStageSpot(stage, plan) {
  const facing = (plan.gate.facing * Math.PI) / 180;
  const outX = Math.sin(facing), outZ = -Math.cos(facing);
  const gate = puntaGarzaToWorld(plan.gate.at[0], plan.gate.at[1]);
  // Facing in through the gate: the opposite of the way it faces.
  const inward = Math.atan2(outX, outZ);
  if (stage === 'gate') return { x: gate.x + outX * 12, z: gate.z + outZ * 12, heading: inward, access: false, walking: false };
  if (stage === 'trespass') {
    // On the apron's east side, in front of the guard there.
    const at = puntaGarzaToWorld(-1292, 1236), guard = puntaGarzaToWorld(-1270, 1240);
    return { x: at.x, z: at.z, heading: Math.atan2(-(guard.x - at.x), -(guard.z - at.z)), access: false, walking: false };
  }
  if (stage === 'officer') {
    // On the gate road just short of the duty officer, the stands ahead to the left.
    const at = puntaGarzaToWorld(-1503, 1161);
    return { x: at.x, z: at.z, heading: inward, access: true, walking: true };
  }
  return null;
}

/**
 * Runs the stage the page asked for, once the lead exists.
 * @param {import('../../core/systems/gameContext.js').GameContext} context
 * @param {object} runtime The restricted area's run-time (unused by the stages so far).
 * @param {object} plan The base plan.
 * @returns {boolean} True when a stage moved the lead.
 */
export function runRestrictedAreaStage(context, runtime, plan) {
  void runtime;
  const stage = context.launch ? context.launch.stage : null;
  const spot = stage ? restrictedAreaStageSpot(stage, plan) : null;
  if (!spot || !context.commands.has(GAME_COMMANDS.PLAYER_TELEPORT)) return false;
  if (spot.access) context.flags.set(WORLD_FLAGS.BASE_OFFICER_ACCESS, true);
  context.commands.send(GAME_COMMANDS.PLAYER_TELEPORT, { position: { x: spot.x, z: spot.z }, heading: spot.heading });
  const player = context.systems.find('player');
  if (spot.walking && player && typeof player.setWalking === 'function') player.setWalking(true);
  return true;
}
