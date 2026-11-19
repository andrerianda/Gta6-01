// Staging helpers for the pictures of the final arc (mission 17, POINT OF NO RETURN): they start
// the real mission at one of its stages through the mission's own command, wait for the stage's
// controller, and read or move the mission aircraft through the fleet's own physics. A scene built
// from them shows the mission's own HUD label, objective, hints, radio lines and air guard.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { GAME_STATE } from '../core/state/gameStates.js';

/**
 * The hour of the flight pictures. The mission's own clock at take-off is 05:50 to 05:54, when the
 * game's sun is still 8 degrees under the horizon (it rises at 06:30); the owner's pictures want the
 * low sun in the cockpit and on the aircraft, so the scenes set the clock on to here: the sun 4 to 5
 * degrees up in the east-north-east (`&hours=` tries another moment).
 */
export const DAWN_HOURS = 6.85;

const DEGREES = Math.PI / 180;
const wallClock = (milliseconds) => new Promise((resolve) => { setTimeout(resolve, milliseconds); });

/**
 * Starts the final arc at a stage or a checkpoint and waits until that stage's controller runs
 * (it is loaded as a module of its own). The player's save is left alone: the mission saves at a
 * checkpoint unless it was begun from the page's address, and a picture is.
 * @param {object} game The game context.
 * @param {{stage?: string, checkpoint?: number, aircraftId?: string, flightMode?: string}} options
 * @returns {Promise<object | null>} The mission system, or null when it could not be started.
 */
export async function startFinalArc(game, options) {
  const { commands, events } = game;
  const mission = game.systems.find('finalMission');
  if (!mission || !commands.has(GAME_COMMANDS.FINAL_MISSION_START)) return null;
  if (!game.state.is(GAME_STATE.PLAYING)) game.state.enter(GAME_STATE.PLAYING);
  // The stage announces its objective when the runtime enters it and again when its controller
  // begins (or, for a stage without one of its own, the stage change alone is all there is).
  let objectives = 0;
  const stop = events.on(GAME_EVENTS.MISSION_OBJECTIVE_CHANGED, (payload) => { if (payload?.kind === 'final') objectives += 1; });
  const storage = game.storage;
  const write = storage?.write;
  if (typeof write === 'function') storage.write = () => false;
  let started = false;
  try {
    started = commands.run(GAME_COMMANDS.FINAL_MISSION_START, options) !== false;
  } finally {
    if (typeof write === 'function') storage.write = write;
  }
  for (let i = 0; started && objectives < 2 && i < 150; i += 1) await wallClock(20);
  if (typeof stop === 'function') stop();
  return started ? mission : null;
}

/**
 * The mission aircraft: { car (its physics), root (its model), entity, vehicleId }, or null.
 * @param {object} game
 */
export function missionAircraft(game) {
  const craft = game.systems.find('finalMission')?.rt?.aircraft?.() ?? null;
  return craft && craft.car ? craft : null;
}

/**
 * Puts the mission aircraft in trimmed flight at a place, tells the world the lead moved and waits
 * for the world to stream in around it.
 * @param {object} game
 * @param {object} tools The scene's tools.
 * @param {{x: number, y: number, z: number, heading: number, speed?: number, gearDown?: boolean, climb?: number}} place
 *   Height above the sea, compass heading in degrees, true airspeed and climb rate in metres per second.
 * @returns {Promise<object | null>} The aircraft.
 */
export async function flyMissionAircraftAt(game, tools, place) {
  const craft = missionAircraft(game);
  if (!craft || typeof craft.car.placeAt !== 'function') return null;
  const heading = place.heading * DEGREES;
  const put = () => {
    craft.car.placeAt(place.x, place.y, place.z, heading, place.speed);
    if (place.gearDown && typeof craft.car.setGear === 'function') {
      craft.car.setGear(true);
      if ('gear' in craft.car) craft.car.gear = 1;
    }
    const velocity = craft.car.body?.linearVelocity;
    if (velocity && Number.isFinite(place.climb)) velocity.y = place.climb;
  };
  put();
  game.events.emit(GAME_EVENTS.PLAYER_TELEPORTED, { position: { x: place.x, y: place.y, z: place.z }, heading: -heading });
  tools.advance(0.05);
  await tools.whenIdle();
  put();
  return craft;
}

/**
 * The compass bearing of the sun in degrees (0 north, clockwise) and its height over the horizon,
 * from the atmosphere; null before there is one.
 * @param {object} game
 * @returns {{bearing: number, elevation: number} | null}
 */
export function sunBearing(game) {
  const sun = game.atmosphere?.state?.sunDirection ?? null;
  if (!sun || !Number.isFinite(sun.x)) return null;
  return { bearing: ((Math.atan2(sun.x, -sun.z) / DEGREES) % 360 + 360) % 360, elevation: Math.asin(Math.max(-1, Math.min(1, sun.y))) / DEGREES };
}

/** The scene's hour, or the page's `&hours=` when it gives one between 5 and 9 (takes only). */
export function dawnHours() {
  const given = Number(new URLSearchParams(globalThis.location?.search ?? '').get('hours'));
  return given >= 5 && given <= 9 ? given : DAWN_HOURS;
}
