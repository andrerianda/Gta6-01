// Assembles the parts of the minimap and city map system (the viewpoint reader, the GPS, the
// points of interest, the radar with its tile cache, the city map screen) and wires the mission
// events they show: mission givers, the objective and its route. Loaded by
// ui/minimapAndCityMap.js in init(), so the entry module stays small.
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { createCityMapScreen } from './cityMapScreen.js';
import { createMinimapGps } from './minimapGps.js';
import { placePointsOfInterest } from './minimapPointsOfInterest.js';
import { createMinimapRadar } from './minimapRadar.js';
import { createMinimapTiles } from './minimapTiles.js';
import { createMinimapViewpoint } from './minimapViewpoint.js';

/**
 * Builds the radar, the city map and their helpers.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {object} plan The city plan.
 * @param {(position: object|null) => void} onWaypoint Called when the map sets or clears the waypoint.
 */
export function assembleMinimapParts(context, plan, onWaypoint) {
  const { content, entities, events, page } = context;
  const viewpoint = createMinimapViewpoint(context);
  const gps = createMinimapGps(plan);
  const places = placePointsOfInterest(plan, content.find('shopsAndProperties')?.SHOPS_AND_SERVICES);
  const radar = createMinimapRadar(page.element('hud-minimap'), createMinimapTiles(page.document, plan), entities, places);
  const cityMap = createCityMapScreen(page.document, page.element('city-map-screen'), plan, { content, onWaypoint, gps, places });
  const setObjective = (target) => {
    const position = target && typeof target === 'object' && Number.isFinite(target.x) ? target : null;
    radar.setObjective(position);
    gps.setObjective(position);
    cityMap.setObjective(position);
  };

  return {
    viewpoint, gps, radar, cityMap, places,
    /**
     * Listens to the mission events the maps show.
     * @returns {Function[]} The unsubscribe calls.
     */
    listenToMissions() {
      const E = GAME_EVENTS;
      return [
        events.on(E.MISSION_AVAILABLE, ({ missionId, giverId, position }) => {
          const giver = content.find('storyCharacters')?.STORY_CHARACTERS?.[giverId];
          radar.setMissionGiver(missionId, position, (giver?.name ?? '!')[0]);
          cityMap.setMissionGiver(missionId, position, (giver?.name ?? '!')[0]);
        }),
        events.on(E.MISSION_STARTED, ({ missionId }) => {
          radar.setMissionGiver(missionId, null);
          cityMap.setMissionGiver(missionId, null);
        }),
        events.on(E.MISSION_OBJECTIVE_CHANGED, ({ target }) => setObjective(target)),
        events.on(E.MISSION_PASSED, () => setObjective(null)),
        events.on(E.MISSION_FAILED, () => setObjective(null)),
      ];
    },
  };
}
