// Where everything of Base Aérea Punta Garza stands in the world, worked out once from the plan of
// the base (catalog/puntaGarzaAirBase.js): runway, taxiways, apron, road, fence panels and gate,
// shelters, tower, guard post, floodlight masts, runway lights, aircraft stands, the patrol route
// and the alarm's road block. Pure numbers (no three.js), so tests and other systems can read it.
//
//   const layout = planAirBaseLayout();
//   layout.runway    // {x0, z0, x1, z1, y, width, length, heading}   end 0 = east threshold, heading in compass degrees
//   layout.fence.panels   // [{x, z, turn, stretch}]  6 m panels; turn is rotation about +Y
// Headings named `heading` are compass radians (0 = north = -Z, clockwise) unless said otherwise.

import { PUNTA_GARZA_AIR_BASE, puntaGarzaToWorld } from '../../catalog/puntaGarzaAirBase.js';

/** Length of one fence panel of the kit, metres. */
export const FENCE_PANEL = 6;
/** Sizes of the kit's models (width along X, height, depth along Z), for stand-ins and colliders. */
export const BASE_KIT_SIZES = Object.freeze({
  base_hardened_shelter: Object.freeze({ width: 58, height: 15, depth: 40 }),
  base_control_tower: Object.freeze({ width: 12, height: 26, depth: 12 }),
  base_guard_post: Object.freeze({ width: 3, height: 3, depth: 4 }),
  base_floodlight_mast: Object.freeze({ width: 0.6, height: 18, depth: 0.6 }),
  base_fence: Object.freeze({ width: FENCE_PANEL, height: 2.8, depth: 0.12 }),
});

/**
 * The ground footprint of a parked Halcón in its own frame (metres): wing span, how far the nose
 * reaches ahead of the model's origin and the tail behind it, and its height. The origin is on the
 * ground between the wheels (the model's gear anchors are at height 0), so it stands at the pad's height.
 */
export const PARKED_FIGHTER_SIZE = Object.freeze({ span: 9.6, noseAhead: 8.5, tailBehind: 7.32, height: 4.75 });

const RADIANS = Math.PI / 180;

/**
 * Lays the base out in world coordinates.
 * @param {typeof PUNTA_GARZA_AIR_BASE} [base]
 * @returns {AirBaseLayout}
 */
export function planAirBaseLayout(base = PUNTA_GARZA_AIR_BASE) {
  const at = ([e, n]) => puntaGarzaToWorld(e, n);
  const y = base.groundHeight;
  const from = at(base.runway.from);
  const to = at(base.runway.to);
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  const ux = (to.x - from.x) / length;
  const uz = (to.z - from.z) / length;
  const runway = { id: base.runway.id, x0: from.x, z0: from.z, x1: to.x, z1: to.z, y, width: base.runway.width, length, heading: base.runway.heading, designators: base.runway.designators };

  // The fence: 6 m panels, each run stretched a little so a whole number fits.
  const panels = [];
  const lines = [];
  let previous = null;
  for (const point of base.fence) {
    const here = point ? at(point) : null;
    if (previous && here) {
      const run = Math.hypot(here.x - previous.x, here.z - previous.z);
      const count = Math.max(1, Math.round(run / FENCE_PANEL));
      const dx = (here.x - previous.x) / run;
      const dz = (here.z - previous.z) / run;
      for (let i = 0; i < count; i += 1) {
        const along = ((i + 0.5) * run) / count;
        panels.push({ x: previous.x + dx * along, z: previous.z + dz * along, turn: Math.atan2(-dz, dx), stretch: run / count / FENCE_PANEL });
      }
      lines.push({ ax: previous.x, az: previous.z, bx: here.x, bz: here.z, x: (previous.x + here.x) / 2, z: (previous.z + here.z) / 2, length: run, heading: Math.atan2(dx, -dz) });
    }
    previous = here;
  }

  const gateAt = at(base.gate.at);
  const post = at(base.gate.guardPost);
  const road = base.accessRoad.line.map(at);
  const placed = (item) => ({ id: item.id, ...at(item.at), heading: (item.facing ?? item.heading) * RADIANS, model: item.model ?? item.holds ?? null });

  // Runway lights: white along both edges every 60 m, green across the east threshold, red across the far end.
  const lights = [];
  const nx = -uz;
  const nz = ux;
  const half = runway.width / 2 + 1.5;
  for (let along = 0; along <= length + 1; along += 60) {
    for (const side of [-1, 1]) lights.push({ x: from.x + ux * along + nx * half * side, z: from.z + uz * along + nz * half * side, colour: 'white' });
  }
  for (let across = -18; across <= 18; across += 6) {
    lights.push({ x: from.x - ux * 2 + nx * across, z: from.z - uz * 2 + nz * across, colour: 'green' });
    lights.push({ x: to.x + ux * 2 + nx * across, z: to.z + uz * 2 + nz * across, colour: 'red' });
  }

  const { west, east, south, north } = base.apron;
  const blockHeading = (base.runway.heading - 270) * RADIANS;
  return {
    id: base.id,
    name: base.name,
    y,
    centre: at([(west + east) / 2, (south + north) / 2]),
    runway,
    /** Unit vector along the runway from the east threshold, and its left-hand normal (north side). */
    along: { x: ux, z: uz },
    taxiways: base.taxiways.map((taxiway) => ({ id: taxiway.id, width: taxiway.width, a: at(taxiway.line[0]), b: at(taxiway.line[1]) })),
    apron: { corners: [at([west, south]), at([east, south]), at([east, north]), at([west, north])], joinNorth: base.taxiways[0].line[0][1] - north },
    road: { points: road, width: base.accessRoad.width, name: base.accessRoad.name },
    fence: { panels, lines },
    gate: { x: gateAt.x, z: gateAt.z, heading: base.gate.facing * RADIANS, width: base.gate.width, post: { x: post.x, z: post.z } },
    shelters: base.shelters.map(placed),
    stands: base.stands.map(placed),
    /** The static parked Halcón: [{id, x, z, heading, model, place: 'apron' | 'shelter', shelter}]. */
    parkedAircraft: (base.parkedFighters ?? []).map((item) => ({ ...placed(item), place: item.place, shelter: item.shelter ?? null })),
    tower: { ...at(base.controlTower.at), heading: base.controlTower.facing * RADIANS },
    masts: base.floodlights.map(at),
    runwayLights: lights,
    patrolRoute: base.patrolRoute.map(at),
    /** Two trucks across the runway while the alarm is up: a third and two thirds along it. */
    roadBlock: [0.34, 0.62].map((share, index) => ({
      x: from.x + ux * length * share, z: from.z + uz * length * share, heading: blockHeading + (index ? Math.PI : 0),
    })),
    /** Where the lead stands with `?stage=base` on foot: on the apron in front of the first stands. */
    visitorSpot: { ...at([(base.stands[0].at[0] + base.stands[1].at[0]) / 2, base.stands[0].at[1] + 45]), heading: Math.PI + 6 * RADIANS },
  };
}

/**
 * Whether a world point lies on the base's pad.
 * @param {number} x
 * @param {number} z
 * @param {typeof PUNTA_GARZA_AIR_BASE} [base]
 * @returns {boolean}
 */
export function isOnAirBasePad(x, z, base = PUNTA_GARZA_AIR_BASE) {
  const cos = Math.cos(6 * RADIANS);
  const sin = Math.sin(6 * RADIANS);
  const e = x * cos + z * sin;
  const n = x * sin - z * cos;
  let inside = false;
  const ring = base.pad;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    if (ring[i][1] > n !== ring[j][1] > n && e < ((ring[j][0] - ring[i][0]) * (n - ring[i][1])) / (ring[j][1] - ring[i][1]) + ring[i][0]) inside = !inside;
  }
  return inside;
}

/**
 * @typedef {ReturnType<typeof planAirBaseLayout>} AirBaseLayout
 */
