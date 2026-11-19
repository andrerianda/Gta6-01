// The points of interest the radar and the city map mark with an icon: the shops of the
// shopsAndProperties catalog at their landmarks (a letter on the shop kind's colour), and the
// hospitals, police stations and safehouses of the city plan's landmarks. Placed once at start.

import { SEA_AND_AIRSPACE_CHART } from '../catalog/seaAndAirspaceChart.js';

/** Letters and colours of the shop kinds (SHOP_KINDS ids). */
export const SHOP_ICON_STYLES = Object.freeze({
  gun_shop: ['G', '#ff8a5c'], clothing_store: ['C', '#f39ac0'], paint_and_body_shop: ['S', '#b79cff'],
  mod_garage: ['W', '#6fd6c8'], car_dealership: ['D', '#8fc8ff'], boat_dealer: ['B', '#6fb8ff'], diner: ['F', '#ffd36b'],
  bar_cantina: ['F', '#ffd36b'], convenience_store: ['$', '#9fe39a'], fuel_station: ['P', '#c9e36b'], motel: ['M', '#e3c39a'],
  phone_kiosk: ['T', '#9adfe3'],
});

/** Landmark kinds of the plan that get a service icon, by icon kind (mapIconPainter). */
export const LANDMARK_ICON_KINDS = Object.freeze({
  hospital: 'hospital', police_station: 'police', safehouse_apartment: 'safehouse',
});

/**
 * Places the points of interest.
 * @param {{landmarks?: object[], landmarkById?: Record<string, object>}} plan The city plan.
 * @param {Record<string, {kind: string, landmark: string}>} [shops] SHOPS_AND_SERVICES.
 * @returns {{kind: string, x: number, z: number, letter: string, fill: string, name: string}[]} kind is
 *   'shop', 'hospital', 'police' or 'safehouse'.
 */
export function placePointsOfInterest(plan, shops) {
  const placed = [];
  for (const landmark of plan?.landmarks ?? []) {
    const kind = LANDMARK_ICON_KINDS[landmark.kind];
    if (kind) placed.push({ kind, x: landmark.x, z: landmark.z, letter: '', fill: '', name: landmark.name ?? '' });
  }
  for (const shop of Object.values(shops ?? {})) {
    const landmark = plan?.landmarkById?.[shop.landmark];
    const style = SHOP_ICON_STYLES[shop.kind];
    if (landmark && style) placed.push({ kind: 'shop', x: landmark.x, z: landmark.z, letter: style[0], fill: style[1], name: shop.name ?? '' });
  }
  // The flight phase: Base Aérea Punta Garza (the plan's `airbase` area) and Radar Cabo Lejano.
  for (const area of plan?.specialAreas ?? []) {
    if (area.kind === 'airbase') placed.push({ kind: 'airbase', x: area.x, z: area.z, letter: 'B', fill: '', name: area.name ?? '' });
  }
  const radar = SEA_AND_AIRSPACE_CHART?.radarTower;
  if (radar && plan?.specialAreas) placed.push({ kind: 'radar', x: radar.x, z: radar.z, letter: 'R', fill: '', name: radar.name });
  return placed;
}
