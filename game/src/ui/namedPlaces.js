// The places the location banner names that are not city districts: Base Aérea Punta Garza on its
// pad and causeway, Aeródromo Los Pantanos on its lot and runway, Isla Norvast around the island,
// and the sea beyond the coast ("Mar de Marazul" inside the closed-sea boundary, "Mar Abierto"
// past it). Pure geometry over the catalogs and the city plan; the banner asks placeAt(x, z) first
// and falls back to the district. No DOM.
import { PUNTA_GARZA_AIR_BASE, puntaGarzaToWorld } from '../catalog/puntaGarzaAirBase.js';
import { SEA_AND_AIRSPACE_CHART } from '../catalog/seaAndAirspaceChart.js';

/** The names of the sea: inside the boundary's warning line, and beyond it. */
export const SEA_NAMES = Object.freeze({ coastal: 'Mar de Marazul', open: 'Mar Abierto' });
/** How far outside a footprint a place still carries its name, metres; how far offshore the sea begins. */
export const PLACE_MARGINS = Object.freeze({ base: 25, airfield: 45, islandFactor: 1.6, offshore: 150 });
const AIRFIELD_ID = 'aerodromo_los_pantanos';

/** Distance from a point to a closed flat ring [x0, z0, x1, z1 ...]; 0 inside. */
export function distanceToRing(ring, x, z) {
  let inside = false;
  let best = Infinity;
  const count = ring.length / 2;
  for (let i = 0, j = count - 1; i < count; j = i, i += 1) {
    const ax = ring[i * 2];
    const az = ring[i * 2 + 1];
    const bx = ring[j * 2];
    const bz = ring[j * 2 + 1];
    if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
    const dx = bx - ax;
    const dz = bz - az;
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSquared)) : 0;
    const distance = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (distance < best) best = distance;
  }
  return inside ? 0 : best;
}

/**
 * Builds the lookup.
 * @param {{landmarkById?: Record<string, {name?: string, x: number, z: number}>, lots?: {landmarkId?: string, ring?: number[]}[],
 *   specialAreas?: {kind: string, landmarkId?: string|null, ring?: number[], name?: string}[],
 *   isWaterAt?: (x: number, z: number) => boolean, shoreDistanceAt?: (x: number, z: number) => number}|null} [plan] The city plan.
 * @param {typeof SEA_AND_AIRSPACE_CHART} [chart]
 * @param {typeof PUNTA_GARZA_AIR_BASE} [base]
 * @returns {{placeAt: (x: number, z: number) => {id: string, name: string, kind: 'base'|'airfield'|'island'|'sea'}|null}}
 */
export function createNamedPlaces(plan = null, chart = SEA_AND_AIRSPACE_CHART, base = PUNTA_GARZA_AIR_BASE) {
  const baseRing = [];
  for (const [e, n] of base?.pad ?? []) {
    const p = puntaGarzaToWorld(e, n);
    baseRing.push(p.x, p.z);
  }
  const basePlace = Object.freeze({ id: base?.id ?? 'air_base', name: base?.name ?? '', kind: 'base' });

  const airfieldRings = [];
  const landmark = plan?.landmarkById?.[AIRFIELD_ID] ?? null;
  for (const lot of plan?.lots ?? []) if (lot.landmarkId === AIRFIELD_ID && lot.ring?.length >= 6) airfieldRings.push(lot.ring);
  for (const area of plan?.specialAreas ?? []) if (area.kind === 'runway' && area.landmarkId === AIRFIELD_ID && area.ring?.length >= 6) airfieldRings.push(area.ring);
  const airfieldPlace = Object.freeze({ id: AIRFIELD_ID, name: landmark?.name ?? 'Aeródromo Los Pantanos', kind: 'airfield' });

  const island = chart?.norvastIsland ?? null;
  const islandPlace = island ? Object.freeze({ id: island.id, name: `Isla ${island.name}`, kind: 'island' }) : null;
  const coastal = Object.freeze({ id: 'mar_de_marazul', name: SEA_NAMES.coastal, kind: 'sea' });
  const open = Object.freeze({ id: 'mar_abierto', name: SEA_NAMES.open, kind: 'sea' });
  const extent = chart?.cityExtent ?? null;
  const warn = chart?.boundary?.warn ?? 5000;

  function atSea(x, z) {
    if (extent && (x < extent.minX || x > extent.maxX || z < extent.minZ || z > extent.maxZ)) return true;
    if (typeof plan?.isWaterAt !== 'function' || typeof plan.shoreDistanceAt !== 'function') return false;
    return Boolean(plan.isWaterAt(x, z)) && plan.shoreDistanceAt(x, z) < -PLACE_MARGINS.offshore;
  }

  return {
    /**
     * The named place at a position, or null (a city district: ask the city).
     * @param {number} x World metres.
     * @param {number} z
     */
    placeAt(x, z) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
      if (baseRing.length >= 6 && distanceToRing(baseRing, x, z) <= PLACE_MARGINS.base) return basePlace;
      for (const ring of airfieldRings) if (distanceToRing(ring, x, z) <= PLACE_MARGINS.airfield) return airfieldPlace;
      if (island && Math.hypot(x - island.x, z - island.z) <= island.radius * PLACE_MARGINS.islandFactor) return islandPlace;
      if (!atSea(x, z)) return null;
      const centre = chart?.centre ?? { x: 0, z: 0 };
      return Math.hypot(x - centre.x, z - centre.z) > warn ? open : coastal;
    },
  };
}
