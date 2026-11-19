// Where the air guard lives, worked out from the two catalogs: the alert pads and runway 27 of
// Base Aérea Punta Garza in world metres and compass radians, the chart's centre and radii, the
// callsigns. The patrol (interceptPatrol.js) is created from this in the game and in the tests.
import { PUNTA_GARZA_AIR_BASE, puntaGarzaToWorld } from '../../catalog/puntaGarzaAirBase.js';
import { SEA_AND_AIRSPACE_CHART } from '../../catalog/seaAndAirspaceChart.js';
import { AIR_GUARD_TUNING } from './airGuardTuning.js';

const RADIANS = Math.PI / 180;

/**
 * The patrol's setup.
 * @param {(() => number) | undefined} [random] Returns 0..1 (seeded in the game and the tests).
 * @returns {object} The `setup` of createInterceptPatrol.
 */
export function createAirGuardSetup(random) {
  const plan = PUNTA_GARZA_AIR_BASE;
  const chart = SEA_AND_AIRSPACE_CHART;
  const from = puntaGarzaToWorld(plan.runway.from[0], plan.runway.from[1]);
  const to = puntaGarzaToWorld(plan.runway.to[0], plan.runway.to[1]);
  const runwayHeading = (Math.atan2(to.x - from.x, -(to.z - from.z)) + Math.PI * 2) % (Math.PI * 2);
  const pads = plan.stands.filter((stand) => stand.id.startsWith('alert_')).map((stand) => {
    const place = puntaGarzaToWorld(stand.at[0], stand.at[1]);
    return { id: stand.id, x: place.x, z: place.z, heading: stand.heading * RADIANS };
  });
  return {
    tuning: AIR_GUARD_TUNING,
    callsigns: chart.airGuard.callsigns,
    random,
    centre: chart.centre,
    clearRadius: chart.boundary.clear,
    borderRadius: chart.airGuard.borderRadius,
    base: {
      id: plan.id,
      x: (pads[0].x + pads[1].x) / 2,
      z: (pads[0].z + pads[1].z) / 2,
      pads,
      runway: { x0: from.x, z0: from.z, x1: to.x, z1: to.z, y: plan.groundHeight, heading: runwayHeading },
    },
  };
}
