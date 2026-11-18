// The minimap and the city map: the radar in the corner of the HUD, turning with the camera or
// north up (roads, GPS routes, points of interest, police, mission givers), and the full-screen
// map of Marazul on M (districts, landmarks, the GPS route, a legend, a waypoint set with a
// click). Parts are built by ui/minimapParts.js. Owns UI_SET_WAYPOINT, publishes
// MAP_WAYPOINT_CHANGED.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { GAME_STATE } from '../core/state/gameStates.js';

const RADAR_METRES_ON_FOOT = 165;
const RADAR_METRES_IN_VEHICLE = 270;

/**
 * Creates the minimap and city map system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createMinimapAndCityMapSystem(context) {
  const { commands, events, input, page, settings, state, systems } = context;
  let plan = null, parts = null, waypoint = null;
  let inVehicle = false, northUp = false, resizePending = true;
  let radiusMetres = RADAR_METRES_ON_FOOT;
  let seconds = 0;
  const unsubscribe = [];
  const listen = (topic, handler) => unsubscribe.push(events.on(topic, handler));

  function setWaypoint(position) {
    waypoint = position ? { x: position.x, y: position.y ?? 0, z: position.z } : null;
    parts?.radar.setWaypoint(waypoint);
    parts?.cityMap.setWaypoint(waypoint);
    parts?.gps.setWaypoint(waypoint);
    events.emit(GAME_EVENTS.MAP_WAYPOINT_CHANGED, { position: waypoint });
  }

  return {
    name: 'minimap',
    runsWhen: 'always',
    dependsOn: ['openWorldCity'],

    /** The waypoint the player set ({x, y, z}) or null. */
    get waypoint() { return waypoint; },
    /** The city plan the maps are painted from. */
    get plan() { return plan; },
    /** The GPS routes ({waypointRoute, objectiveRoute}: points x, z and count). */
    get gps() { return parts?.gps ?? null; },
    /** The points of interest on the maps ({kind, x, z, letter, fill, name}). */
    get places() { return parts?.places ?? []; },

    async init(progress) {
      plan = systems.find('openWorldCity')?.plan ?? null;
      if (!plan) {                    // openWorldCity does not publish its plan: build one here
        progress(0.1, 'city map');
        const { generateCityPlan } = await import('../world/plan/cityPlanGenerator.js');
        plan = generateCityPlan(context.random('cityPlan'));
      }
      const { assembleMinimapParts } = await import('./minimapParts.js');
      parts = assembleMinimapParts(context, plan, setWaypoint);
      // Here, not in start(): the missions system offers its givers in its own start(), earlier.
      unsubscribe.push(...parts.listenToMissions());
      commands.handle(GAME_COMMANDS.UI_SET_WAYPOINT, ({ position }) => setWaypoint(position));
      northUp = settings.get('gameplay.minimapRotates') === false;
    },

    start() {
      listen(GAME_EVENTS.VIEWPORT_RESIZED, () => { resizePending = true; });
      listen(GAME_EVENTS.VEHICLE_ENTERED, (event) => { if (event.isPlayer) inVehicle = true; });
      listen(GAME_EVENTS.VEHICLE_EXITED, (event) => { if (event.isPlayer) inVehicle = false; });
      listen(GAME_EVENTS.SETTINGS_CHANGED, ({ key, value }) => {
        if (key === 'gameplay.minimapRotates') northUp = value === false;
      });
      listen(GAME_EVENTS.GAME_STATE_CHANGED, ({ to }) => {
        if (to === GAME_STATE.MAP_OPEN) parts.cityMap.open(parts.viewpoint.read());
      });
    },

    update(deltaSeconds) {
      seconds += deltaSeconds;
      const { cityMap, gps, radar, viewpoint } = parts;
      if (state.is(GAME_STATE.PLAYING) && input.pressed('openMap')) state.enter(GAME_STATE.MAP_OPEN);
      else if (state.is(GAME_STATE.MAP_OPEN)) {
        if (input.pressed('closeMap')) state.back();
        else {
          const frame = viewpoint.read();
          gps.update(deltaSeconds, frame.x, frame.z);
          cityMap.update(deltaSeconds, input);
        }
        return;
      }
      if (page.document.body.dataset.hud !== 'shown') return;
      if (resizePending) {
        const canvas = page.element('hud-minimap');
        radar.resize(canvas.clientWidth || 200, Math.min(2, page.document.defaultView?.devicePixelRatio || 1));
        resizePending = false;
      }
      const target = inVehicle ? RADAR_METRES_IN_VEHICLE : RADAR_METRES_ON_FOOT;
      radiusMetres += (target - radiusMetres) * Math.min(1, deltaSeconds * 2.5);
      const frame = viewpoint.read();
      frame.radiusMetres = radiusMetres;
      frame.time = seconds;
      frame.northUp = northUp;
      gps.update(deltaSeconds, frame.x, frame.z);
      radar.draw(frame, gps);
    },

    dispose() {
      for (const off of unsubscribe.splice(0)) off();
    },
  };
}
