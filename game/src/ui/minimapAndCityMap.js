// The minimap and the city map: the rotating radar in the corner of the HUD (roads, the
// player, police, mission and shop blips, the waypoint) and the full-screen map of Marazul on M
// with districts, landmarks, pan, zoom and a waypoint set with a click. Both are painted from the
// city plan of openWorldCity by the plan library's cityPlanPainter: the radar from cached tiles
// (ui/minimapTiles.js, ui/minimapRadar.js), the map from one large picture (ui/cityMapScreen.js).
// It owns UI_SET_WAYPOINT, publishes MAP_WAYPOINT_CHANGED and enters and leaves mapOpen.
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
  const { commands, content, entities, events, input, page, state, systems, view } = context;
  let plan = null;
  let radar = null;
  let cityMap = null;
  let waypoint = null;
  let inVehicle = false;
  let radiusMetres = RADAR_METRES_ON_FOOT;
  let seconds = 0;
  let resizePending = true;
  const frame = { x: 0, z: 0, forwardX: 0, forwardZ: -1, faceX: 0, faceZ: -1, radiusMetres, time: 0 };
  const unsubscribe = [];
  const listen = (topic, handler) => unsubscribe.push(events.on(topic, handler));

  function setWaypoint(position) {
    waypoint = position ? { x: position.x, y: position.y ?? 0, z: position.z } : null;
    radar?.setWaypoint(waypoint);
    cityMap?.setWaypoint(waypoint);
    events.emit(GAME_EVENTS.MAP_WAYPOINT_CHANGED, { position: waypoint });
  }

  function readView() {
    const player = entities.firstWithTag('player');
    const position = player?.position ?? context.focus.position;
    frame.x = position.x;
    frame.z = position.z;
    const m = view.camera.matrixWorld.elements;      // the camera looks down its -Z axis
    const length = Math.hypot(m[8], m[10]);
    if (length > 1e-4) { frame.forwardX = -m[8] / length; frame.forwardZ = -m[10] / length; }
    if (player && Number.isFinite(player.heading)) {
      frame.faceX = -Math.sin(player.heading);
      frame.faceZ = -Math.cos(player.heading);
    } else {
      frame.faceX = frame.forwardX;
      frame.faceZ = frame.forwardZ;
    }
  }

  return {
    name: 'minimap',
    runsWhen: 'always',
    dependsOn: ['openWorldCity'],

    /** The waypoint the player set ({x, y, z}) or null; for the GPS route. */
    get waypoint() { return waypoint; },
    /** The city plan the maps are painted from. */
    get plan() { return plan; },

    async init(progress) {
      plan = systems.find('openWorldCity')?.plan ?? null;
      if (!plan) {
        // openWorldCity does not publish its plan yet: build the same kind of plan here.
        progress(0.1, 'city map');
        const { generateCityPlan } = await import('../world/plan/cityPlanGenerator.js');
        plan = generateCityPlan(context.random('cityPlan'));
      }
      const [{ createMinimapTiles }, { createMinimapRadar }, { createCityMapScreen }] = await Promise.all([
        import('./minimapTiles.js'), import('./minimapRadar.js'), import('./cityMapScreen.js')]);
      const shops = Object.values(content.find('shopsAndProperties')?.SHOPS_AND_SERVICES ?? {})
        .map((shop) => ({ kind: shop.kind, landmark: plan.landmarkById?.[shop.landmark] }))
        .filter((shop) => shop.landmark).map((shop) => ({ kind: shop.kind, x: shop.landmark.x, z: shop.landmark.z }));
      const canvas = page.element('hud-minimap');
      radar = createMinimapRadar(canvas, createMinimapTiles(page.document, plan), entities, shops);
      cityMap = createCityMapScreen(page.document, page.element('city-map-screen'), plan, {
        content, onWaypoint: setWaypoint, onClose: () => state.is(GAME_STATE.MAP_OPEN) && state.back(),
      });
      commands.handle(GAME_COMMANDS.UI_SET_WAYPOINT, ({ position }) => setWaypoint(position));
    },

    start() {
      listen(GAME_EVENTS.VIEWPORT_RESIZED, () => { resizePending = true; });
      listen(GAME_EVENTS.VEHICLE_ENTERED, (event) => { if (event.isPlayer) inVehicle = true; });
      listen(GAME_EVENTS.VEHICLE_EXITED, (event) => { if (event.isPlayer) inVehicle = false; });
      listen(GAME_EVENTS.MISSION_AVAILABLE, ({ missionId, giverId, position }) => {
        const giver = content.find('storyCharacters')?.STORY_CHARACTERS?.[giverId];
        radar.setMissionGiver(missionId, position, (giver?.name ?? '!')[0]);
      });
      listen(GAME_EVENTS.MISSION_STARTED, ({ missionId }) => radar.setMissionGiver(missionId, null));
      listen(GAME_EVENTS.MISSION_OBJECTIVE_CHANGED, ({ target }) => radar.setObjective(target && typeof target === 'object' ? target : null));
      listen(GAME_EVENTS.MISSION_PASSED, () => radar.setObjective(null));
      listen(GAME_EVENTS.MISSION_FAILED, () => radar.setObjective(null));
      listen(GAME_EVENTS.GAME_STATE_CHANGED, ({ to }) => {
        if (to === GAME_STATE.MAP_OPEN) { readView(); cityMap.open(frame); }
        else cityMap.close();
      });
    },

    update(deltaSeconds) {
      seconds += deltaSeconds;
      if (state.is(GAME_STATE.PLAYING) && input.pressed('openMap')) state.enter(GAME_STATE.MAP_OPEN);
      else if (state.is(GAME_STATE.MAP_OPEN)) {
        if (input.pressed('closeMap')) state.back();
        else cityMap.update(deltaSeconds, input);
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
      readView();
      frame.radiusMetres = radiusMetres;
      frame.time = seconds;
      radar.draw(frame);
    },

    dispose() {
      for (const off of unsubscribe.splice(0)) off();
    },
  };
}
