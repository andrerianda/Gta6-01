// The flight picture, scene `manta-cockpit-dawn`: mission 17, POINT OF NO RETURN, a minute after
// the stolen Manta Sombra left runway 27 of Base Aérea Punta Garza. The mission itself is running
// at its stage `blind_radar` (checkpoint 3, ASSISTED): its HUD label, its objective, its hint.
// The aircraft is in the game's own cockpit view (the flight camera decides eye, field of view and
// light; nothing of the cockpit is set here), climbing in a shallow left turn over the coast with
// the low sun ahead and to the left; Coronel Vargas is on the radio in red (line al_02 of the
// script through the story's subtitles), and the air guard's own Halcón Uno has drawn ahead of the
// nose to show himself, placed where the windscreen is clear between the frames.
// What the scene decides and the mission does not: the clock (see DAWN_HOURS), the place and
// heading, the air guard released before the radar stage is over, Vargas's order repeated at this
// moment, and Uno's station ahead of the wing instead of beside it.
import * as THREE from 'three';
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { WORLD_FLAGS } from '../core/state/worldFlags.js';
import { dawnHours, flyMissionAircraftAt, startFinalArc, sunBearing } from './finalArcStaging.js';

const DEGREES = Math.PI / 180;
/** Where the picture is taken (world metres, height above the sea): over the water west of the base. */
const PLACE = Object.freeze({ x: -3350, z: -1180, y: 340, speed: 128, climb: 5 });
/** Degrees the sun stands to the left of the nose: out of the lens, the sky ahead still golden. */
const SUN_LEFT_OF_NOSE = 54;
/** The heading when the atmosphere does not say where the sun is. */
const FALLBACK_HEADING = 128;
/** The radio line on screen. */
const RADIO_LINE = 'al_02';
/** Seconds of flight before the air guard arrives, of the turn with the pair in formation, and of the level-off. */
const FLY = Object.freeze({ before: 1.2, turn: 1.1, ease: 1.3, pull: 0.9 });
/** Metres from the pilot's eye to Halcón Uno. */
const UNO_DISTANCE = 88;
/**
 * Where Uno may show himself, as degrees right of and above the line of sight, best first: the
 * side away from the sun (his lit flank towards the pilot) before the sun's side.
 */
const UNO_BEARINGS = [12, 15, 9, 18, 21, 24, 6, -12, -15, -9, -18, -21, -24, -6];
const UNO_HEIGHTS = [2.5, 4.5, 0.5, 6.5, 8.5];
/** His outline as offsets in degrees around his middle (nose, tail, wing tips at this distance). */
const UNO_OUTLINE = [[0, 0], [-3.4, 0], [3.4, 0], [0, 1.1], [0, -0.9], [-1.8, 0.5], [1.8, 0.5]];

/**
 * Registers the scene.
 * @param {object} context The game context.
 * @returns {() => void} Removes the scene again.
 */
export function registerMantaCockpitDawn(context) {
  return context.showcase.register({
    name: 'manta-cockpit-dawn',
    title: 'Point of no return: the Manta Sombra at dawn',
    description: 'Mission 17 from the cockpit of the stolen Manta Sombra just after takeoff: the low sun through the glass, Coronel Vargas on the radio in red, a Halcón interceptor off the nose.',
    async run(game, tools) {
      const { commands, flags, input } = game;
      const launch = game.launch ?? {};
      const mission = await startFinalArc(game, {
        checkpoint: 3, aircraftId: launch.plane ?? 'manta_sombra', flightMode: launch.flightMode ?? 'casual',
      });
      if (!mission) return;
      commands.run(GAME_COMMANDS.TIME_SET, { hours: dawnHours() });
      tools.advance(0.05);
      const sun = sunBearing(game);
      const heading = sun ? (sun.bearing + SUN_LEFT_OF_NOSE) % 360 : FALLBACK_HEADING;
      const craft = await flyMissionAircraftAt(game, tools, { ...PLACE, heading });
      if (!craft) return;
      game.systems.find('followCamera')?.setFlightView?.('cockpit');
      tools.advance(FLY.before);

      // The pair joins: the air guard's own formation staging, its orders and guns held.
      const guard = game.systems.find('airDefence');
      const pair = guard?.patrol ?? null;
      if (pair && typeof pair.place === 'function') {
        flags.set(WORLD_FLAGS.AIR_DEFENCE_OFF, false);
        pair.place('wing', leadOf(craft), 'mission');
        commands.run(GAME_COMMANDS.AIR_DEFENCE_SCRAMBLE, { holdFire: 600 });
        tools.advance(0.05);
        await tools.whenIdle();
      }

      // A shallow climbing left turn, eased off so the picture holds a few degrees of bank.
      input.setVirtual('rollLeft', true);
      input.setVirtual('pitchUp', true);
      tools.advance(FLY.turn);
      input.setVirtual('rollLeft', false);
      tools.advance(Math.min(FLY.pull, FLY.ease));
      input.setVirtual('pitchUp', false);
      tools.advance(Math.max(0, FLY.ease - FLY.pull));

      if (commands.has(GAME_COMMANDS.STORY_LINE_SPEAK)) commands.run(GAME_COMMANDS.STORY_LINE_SPEAK, { lineId: RADIO_LINE, hold: true });
      tools.advance(0.1);
      const uno = pair?.interceptors?.[0] ?? null;
      if (uno && uno.phase === 'air') {
        showUno(game, craft, uno);
        // One step: the air guard carries him along with the lead and draws him there.
        tools.advance(1 / 60);
      }
    },
  });
}

/** The mission aircraft as the air guard reads a lead: place, velocity, compass heading, bank. */
function leadOf(craft) {
  const place = craft.root?.position ?? craft.entity.position;
  const velocity = craft.car.body?.linearVelocity ?? { x: 0, y: 0, z: 0 };
  const state = craft.car.state ?? {};
  return {
    x: place.x, y: place.y, z: place.z, vx: velocity.x, vy: velocity.y, vz: velocity.z,
    speed: Math.hypot(velocity.x, velocity.y, velocity.z), heading: state.heading ?? 0, roll: state.roll ?? 0,
  };
}

/**
 * Puts Halcón Uno ahead of the nose where the pilot sees him whole: the first bearing whose
 * sight lines from the flight camera pass no solid part of the aircraft's own model.
 */
function showUno(game, craft, uno) {
  const camera = game.view?.camera;
  if (!camera) return;
  camera.updateMatrixWorld(true);
  const eye = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  const solids = [];
  craft.root?.updateMatrixWorld?.(true);
  craft.root?.traverse?.((node) => { if (node.isMesh && shown(node) && !isGlass(node.material)) solids.push(node); });
  const ray = new THREE.Raycaster();
  ray.far = 30;
  const direction = new THREE.Vector3();
  const sightTo = (right, up) => direction.set(Math.tan(right * DEGREES), Math.tan(up * DEGREES), -1).normalize().transformDirection(camera.matrixWorld);
  const blocked = (right, up) => {
    let count = 0;
    for (const [dr, du] of UNO_OUTLINE) {
      ray.set(eye, sightTo(right + dr, up + du));
      if (solids.length && ray.intersectObjects(solids, false).length > 0) count += 1;
    }
    return count;
  };
  let best = { right: UNO_BEARINGS[0], up: UNO_HEIGHTS[0], count: Infinity };
  search: for (const up of UNO_HEIGHTS) {
    for (const right of UNO_BEARINGS) {
      const count = blocked(right, up);
      if (count < best.count) best = { right, up, count };
      if (count === 0) break search;
    }
  }
  const at = sightTo(best.right, best.up).multiplyScalar(UNO_DISTANCE).add(eye);
  uno.x = at.x;
  uno.y = at.y;
  uno.z = at.z;
  // The station keeping starts afresh from here (no leap back to the wing slot in the next step).
  uno.stationed = false;
  /** For the capture tools: where he was put and how many sight lines were blocked there. */
  uno.shownAt = { ...best, solids: solids.length };
}

/** True when a node and all its parents are visible. */
function shown(node) {
  for (let each = node; each; each = each.parent) if (each.visible === false) return false;
  return true;
}

/** Glass and other see-through materials do not block the view. */
function isGlass(material) {
  const list = Array.isArray(material) ? material : [material];
  return list.every((each) => !each || each.transparent === true || /glass|canopy|hud|visor/i.test(each.name ?? ''));
}
