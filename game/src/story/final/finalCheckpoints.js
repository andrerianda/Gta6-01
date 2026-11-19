// The world as each checkpoint of POINT OF NO RETURN finds it (contract section D), rebuilt on a
// retry, on a start at a checkpoint and where the story itself cuts there (1, 2 and 5): the story
// flags, the clock, the radar emitters, the air guard, the wanted level, the lead's health, and
// where the lead stands or flies. Also the end: every story flag cleared.
//
//   restoreCheckpoint(rt, 3);     clearStoryFlags(rt.flags);
import { GAME_COMMANDS } from '../../core/events/gameCommands.js';
import { WORLD_FLAGS as F } from '../../core/state/worldFlags.js';

/** Places of the mission (world metres; S2 report). */
export const FINAL_PLACES = Object.freeze({
  gate: { x: -1404.5, z: -987.2 },
  /** The junction the access road leaves the Autopista at. */
  roadStart: { x: -1413, z: -905 },
  stands: { manta_sombra: { x: -1469, z: -1376 }, garza_negra: { x: -1406, z: -1359 } },
  /** Runway 27: east threshold and west end; take-off heading 276. */
  runwayWest: { x: -1998.4, z: -1602.7 },
  islandCentre: { x: -9200, z: -3300 },
});

/** The story flags the mission holds; all false in free roam. */
export const STORY_FLAGS = Object.freeze([
  F.BASE_OFFICER_ACCESS, F.BASE_ALARM, F.SEA_OPEN, F.AIR_DEFENCE_ALERT, F.AIR_DEFENCE_OFF,
  F.RADAR_TOWER_DESTROYED, F.NAVY_PICKET_ACTIVE, F.GUIDED_BOMB_LOADED,
]);

/** The flags true at each checkpoint (every other story flag is false there). */
export const CHECKPOINT_FLAGS = Object.freeze({
  1: [],
  2: [F.BASE_OFFICER_ACCESS],
  3: [F.BASE_ALARM, F.SEA_OPEN, F.AIR_DEFENCE_OFF],
  4: [F.BASE_ALARM, F.SEA_OPEN, F.AIR_DEFENCE_OFF, F.RADAR_TOWER_DESTROYED, F.NAVY_PICKET_ACTIVE],
  5: [F.BASE_ALARM, F.SEA_OPEN, F.AIR_DEFENCE_OFF, F.RADAR_TOWER_DESTROYED],
});

/**
 * The flags of a checkpoint for an aircraft: the Manta Sombra still carries its bomb at 2 and 3.
 * @param {number} checkpoint
 * @param {string} aircraftId
 * @returns {string[]}
 */
export function flagsAtCheckpoint(checkpoint, aircraftId) {
  const flags = [...(CHECKPOINT_FLAGS[checkpoint] ?? [])];
  if (aircraftId === 'manta_sombra' && (checkpoint === 2 || checkpoint === 3)) flags.push(F.GUIDED_BOMB_LOADED);
  return flags;
}

/** The lead's heading (the player's yaw) that faces `to` from `from`. */
export function facing(from, to) {
  return -Math.atan2(to.x - from.x, -(to.z - from.z));
}

/** Where the lead stands at checkpoint 1: `metres` up the access road from the gate, facing it. */
export function gateApproach(metres = 60) {
  const { gate, roadStart } = FINAL_PLACES;
  const length = Math.hypot(roadStart.x - gate.x, roadStart.z - gate.z);
  const spot = { x: gate.x + ((roadStart.x - gate.x) / length) * metres, z: gate.z + ((roadStart.z - gate.z) / length) * metres };
  return { ...spot, heading: facing(spot, gate) };
}

/** Sets exactly the given story flags. */
export function setStoryFlags(flags, on) {
  for (const name of STORY_FLAGS) flags.set(name, on.includes(name));
}

/** Clears every story flag (the end of the mission, and a start from nothing). */
export function clearStoryFlags(flags) {
  setStoryFlags(flags, []);
}

/**
 * Rebuilds the world of a checkpoint.
 * @param {object} rt The mission runtime's `rt`.
 * @param {number} checkpoint 1 to 5.
 */
export function restoreCheckpoint(rt, checkpoint) {
  const { context } = rt;
  const run = (name, payload) => (context.commands.has(name) ? context.commands.run(name, payload) : undefined);
  const aircraftId = rt.data.aircraftId;
  run(GAME_COMMANDS.STORY_LINES_STOP, {});
  run(GAME_COMMANDS.AIR_DEFENCE_STAND_DOWN, { reason: 'mission' });
  run(GAME_COMMANDS.WANTED_CLEAR, { reason: 'mission' });
  run(GAME_COMMANDS.PLAYER_HEAL, { health: 100 });
  // The emitters stand again unless the checkpoint lies after the tower fell.
  if (checkpoint <= 3) {
    context.flags.set(F.RADAR_TOWER_DESTROYED, false);
    run(GAME_COMMANDS.RADAR_EMITTER_RESTORE, {});
  }
  rt.removeAircraft();
  setStoryFlags(context.flags, flagsAtCheckpoint(checkpoint, aircraftId));
  rt.setStoryState({ alarm: checkpoint >= 3, betrayed: false });
  const P = FINAL_PLACES;
  if (checkpoint === 1) {
    rt.setClock(5 + 38 / 60, 'clear');
    rt.leadOnFoot(gateApproach(60));
  } else if (checkpoint === 2) {
    rt.setClock(5 + 50 / 60, 'clear');
    const stand = standOf(context, aircraftId);
    rt.seatLeadInAircraft({ x: stand.x, z: stand.z, heading: stand.heading, engineOn: true, view: 'cockpit' });
  } else if (checkpoint === 3) {
    rt.setClock(5 + 54 / 60, 'clear');
    rt.seatLeadInAircraft({ x: P.runwayWest.x - 160, z: P.runwayWest.z - 17, y: 600, heading: 276, engineOn: true, view: 'cockpit' });
  } else if (checkpoint === 4) {
    rt.setClock(6, 'clear');
    rt.seatLeadInAircraft({ x: -4300, z: -1900, y: aircraftId === 'garza_negra' ? 6000 : 400, heading: 270, engineOn: true, view: 'cockpit' });
  } else if (checkpoint === 5) {
    rt.setClock(6.5, 'clear');
    // 6 km east of the island on the strip's extended centreline (landing heading 285).
    const back = (285 * Math.PI) / 180;
    rt.seatLeadInAircraft({
      x: P.islandCentre.x - Math.sin(back) * 6000, z: P.islandCentre.z + Math.cos(back) * 6000, y: 700, heading: 285, engineOn: true, view: 'cockpit',
    });
  }
}

/** The chosen aircraft's stand: {x, z, heading (compass degrees)} from the base's layout, else the report's numbers. */
export function standOf(context, aircraftId) {
  const stands = context.systems.find('airBase')?.layout?.stands ?? [];
  const stand = stands.find((each) => each.model === aircraftId);
  if (stand) return { x: stand.x, z: stand.z, heading: (stand.heading * 180) / Math.PI };
  const fallback = FINAL_PLACES.stands[aircraftId] ?? FINAL_PLACES.stands.manta_sombra;
  return { ...fallback, heading: 0 };
}
