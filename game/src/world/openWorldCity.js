// The open-world city: builds Marazul from the city plan (world/plan/) and streams it in 128 m
// sectors round the focus: ground, streets (asphalt, road paint, kerbs, pavements, planted
// medians, junctions, bridges), the waterfront (promenade, pier, marina, quays); colliders go to
// physics, buildings and plants come from the city dressing. It answers "where am I": ground
// height, district, road, lane, spawn points, lane and pavement graphs.
//
// Street cross-section, the one source of truth (streets/streetSurfaceQuery.js, the builder's
// own numbers): surfaceAt(x, z).kind is carriageway | median | kerb | pavement | verge |
// crosswalk | junction | ground (+ segment, node, along, offset right of the segment, side,
// raised, planted); streetCrossSection(segmentId) gives carriageways [{from, to, width}],
// median {from, to, width, planted} or null, left/right {kerb, pavement, verge: {from, to}}.
// Dressing hook (see citySectors.js): createCityDressing({ ..., streets }) -> buildSector(...)
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
    surfaceAt: (x, z, out) => (streaming ? streaming.streetSurface.surfaceAt(x, z, out) : null),
    streetCrossSection: (segmentId) => (streaming ? streaming.streetSurface.crossSection(segmentId) : null),
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
