// The nine districts of Marazul as polygons. They are drawn in city coordinates along the main
// roads that separate them (Avenida Tamarindo, the Calle del Mercado, the highway) and converted
// to world rings; a point is looked up by testing the polygons in a fixed order, so the lookup
// always answers, even at sea (the nearest district by its centre).
//
//   const regions = createDistrictRegions();
//   regions.districtAt(x, z)        // 'centro'
//   regions.byId.centro.ring        // flat world ring [x, z, ...]

import { cityPointsToWorld, worldToCity } from './cityFrame.js';
import { pointInRing, ringCentroid } from './planGeometry.js';

/**
 * Builds the district polygons and their point lookup.
 * @returns {DistrictRegions}
 */
export function createDistrictRegions() {
  const districts = DISTRICT_OUTLINES.map(([id, pattern, cityRing]) => {
    const ring = cityPointsToWorld(cityRing);
    const [x, z] = ringCentroid(ring);
    return { id, pattern, cityRing, ring, x, z };
  });
  const byId = Object.fromEntries(districts.map((district) => [district.id, district]));
  return {
    districts,
    byId,
    districtAt(x, z) {
      const [e, n] = worldToCity(x, z);
      for (const district of districts) {
        if (pointInRing(district.cityRing, e, n)) return district.id;
      }
      let best = districts[0];
      let bestDistance = Infinity;
      for (const district of districts) {
        const distance = (district.x - x) ** 2 + (district.z - z) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = district;
        }
      }
      return best.id;
    },
  };
}

/**
 * The district ids in lookup order.
 * @type {ReadonlyArray<string>}
 */
export const DISTRICT_IDS = Object.freeze([
  'isla_coral', 'puerto_tamarindo', 'playa_dorada', 'bahia_vista', 'la_marisma', 'centro', 'barrio_hierro', 'las_lomas', 'los_pantanos',
]);

/**
 * @typedef {Object} DistrictRegion
 * @property {string} id One of the nine district ids.
 * @property {'grid'|'old_town'|'port'|'industrial'|'hills'|'resort'|'island'|'wetland'|'beach'} pattern The street pattern.
 * @property {number[]} cityRing The outline in city coordinates.
 * @property {number[]} ring The outline in world coordinates, flat [x, z, ...].
 * @property {number} x Centre, for labels.
 * @property {number} z
 */
/**
 * @typedef {Object} DistrictRegions
 * @property {DistrictRegion[]} districts
 * @property {Record<string, DistrictRegion>} byId
 * @property {(x: number, z: number) => string} districtAt The district id at a world point.
 */

// [id, street pattern, outline in city coordinates]. The order is the lookup order.
const DISTRICT_OUTLINES = [
  ['isla_coral', 'island', [1250, -1900, 1950, -1900, 1950, -1470, 1250, -1470]],
  ['puerto_tamarindo', 'port', [-1330, -1360, -650, -1360, -650, -1070, -690, -1070, -690, -470, -1330, -470]],
  ['playa_dorada', 'beach', [-690, -1070, 1100, -1070, 1100, -780, -690, -780]],
  ['bahia_vista', 'resort', [1100, -1260, 1790, -1260, 1790, -430, 760, -430, 760, -780, 1100, -780]],
  ['la_marisma', 'old_town', [-690, -780, -250, -780, -250, 260, -690, 260]],
  ['centro', 'grid', [-250, -780, 760, -780, 760, 420, 520, 420, 520, 800, 340, 745, -250, 745]],
  ['barrio_hierro', 'industrial', [-1330, -470, -690, -470, -690, 260, -250, 260, -250, 745, -1330, 745]],
  ['las_lomas', 'hills', [760, -430, 1790, -430, 1790, 1470, 960, 1470, 900, 1180, 720, 975, 520, 800, 520, 420, 760, 420]],
  ['los_pantanos', 'wetland', [-1780, -1060, -1330, -1060, -1330, 745, 340, 745, 520, 800, 720, 975, 900, 1180, 960, 1470, -1780, 1520]],
];
