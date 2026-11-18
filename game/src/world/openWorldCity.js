// The open-world city: builds Marazul from the city plan (game/src/world/plan/) and streams it
// in 128 m sectors around the focus: the ground (grass, sand, dirt, wetland, lots), the streets
// (crowned asphalt, kerbs, pavements, planted medians, junctions, bridges with piers) and the
// sea's depth over the coast; each sector's colliders go to the physics system and its
// buildings, props and plants come from the city dressing. It answers "where am I" for every
// other system: ground height, district, nearest road and lane, spawn points, the lane and
// pavement graphs.
//
// Dressing hook (world/buildings/cityDressing.js, by the dressing programmer; see citySectors.js):
//   createCityDressing({ plan, assets, textures, physics, atmosphere, random, quality })
//   await dressing.buildSector({ id, bounds, lots, roads, intersections, specialAreas })
//     -> { object3d, colliders, lights, dispose }
import { GAME_EVENTS } from '../core/events/gameEvents.js';

/**
 * Creates the open-world city system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem & Record<string, any>}
 */
export function createOpenWorldCitySystem(context) {
  let streaming = null;
  let queries = null;
  let district = null;
  let street = null;
  let locationSeconds = 0;
  const subscriptions = [];

  const system = {
    name: 'openWorldCity',
    dependsOn: ['worldRenderPipeline', 'physics'],
    runsWhen: /** @type {'always'} */ ('always'),
    loadWeight: 6,
    /** The city plan: roads, lanes, lots, districts, landmarks, terrain (docs/CITY_PLAN.md). */
    plan: null,
    /** Directed traffic lanes with successors through junctions (plan.lanes). */
    laneGraph: null,
    /** Pavements, crossings and paths: { nodes, edges } (plan.pedestrianGraph). */
    pedestrianGraph: null,
    /** Height of what a foot or a tyre stands on: kerbs, decks and crowns where built. */
    groundHeightAt: (x, z) => (queries ? queries.groundHeightAt(x, z) : 0),
    /** The plan's continuous ground under the streets (no kerbs or decks): for the physics ground. */
    terrainHeightAt: (x, z) => (queries ? queries.terrainHeightAt(x, z) : 0),
    districtAt: (x, z) => (queries ? queries.districtAt(x, z) : null),
    nearestRoad: (x, z, maxDistance) => (queries ? queries.nearestRoad(x, z, maxDistance) : null),
    nearestLane: (x, z, maxDistance) => (queries ? queries.nearestLane(x, z, maxDistance) : null),
    streetNameAt: (x, z) => (queries ? queries.streetNameAt(x, z) : null),
    /** [{x, y, z, heading, lane|spot|edge}] near a point; kind 'vehicle', 'parked' or 'pedestrian'. */
    spawnPointsNear: (x, z, radius, kind, limit) => (queries ? queries.spawnPointsNear(x, z, radius, kind, limit) : []),
    /** The surface library (textures and materials) the city paints with. */
    surfaces: null,

    async init(progress) {
      progress(0.02, 'Planning the city');
      const [{ generateCityPlan }, { createCityQueries }, { createCitySectorStreaming }] = await Promise.all([
        import('./plan/cityPlanGenerator.js'),
        import('./cityQueries.js'),
        import('./citySectors.js'),
      ]);
      const plan = generateCityPlan(context.random('cityPlan'));
      system.plan = plan;
      system.laneGraph = plan.lanes;
      system.pedestrianGraph = plan.pedestrianGraph;
      streaming = await createCitySectorStreaming(context, plan, progress);
      system.surfaces = streaming.surfaces;
      queries = createCityQueries(plan, { surfaceHeightAt: streaming.surfaceHeightAt });
      context.work.addSource('openWorldCity', () => (streaming ? streaming.pendingCount : 0));
      progress(1, 'City ready');
    },

    start() {
      subscriptions.push(
        context.events.on(GAME_EVENTS.QUALITY_CHANGED, (change) => streaming.setStreamRadius(change.quality.streamRadius)),
        context.events.on(GAME_EVENTS.PLAYER_TELEPORTED, ({ position }) => streaming.update(position.x, position.z)),
      );
      streaming.update(context.focus.position.x, context.focus.position.z);
    },

    update(deltaSeconds) {
      if (!streaming) return;
      const focus = context.focus.position;
      streaming.update(focus.x, focus.z);
      locationSeconds += deltaSeconds;
      if (locationSeconds < 0.5 || !context.state.simulates) return;
      locationSeconds = 0;
      const nextDistrict = queries.districtAt(focus.x, focus.z);
      if (nextDistrict !== district) {
        const name = system.plan.districtById?.[nextDistrict]?.name ?? nextDistrict;
        context.events.emit(GAME_EVENTS.DISTRICT_ENTERED, { districtId: nextDistrict, previousId: district, name });
        district = nextDistrict;
      }
      const nextStreet = queries.streetNameAt(focus.x, focus.z);
      if (nextStreet !== street) {
        street = nextStreet;
        context.events.emit(GAME_EVENTS.STREET_CHANGED, { street, districtId: district });
      }
    },

    dispose() {
      for (const unsubscribe of subscriptions) unsubscribe();
      context.work.removeSource('openWorldCity');
      if (streaming) streaming.dispose();
      streaming = null;
      queries = null;
    },
  };
  return system;
}
