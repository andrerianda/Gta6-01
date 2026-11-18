// Where and what traffic appears: how many cars the quality tier and the density allow, which
// models drive in each district (the district's trafficMix weights from cityDistricts.js,
// limited to models the asset registry has built and the catalog lets into traffic at this
// hour), and spawn places on the lane graph in a ring around the player, out of the camera's
// sight, never on a bridge deck and never on top of another car. Pure apart from the city and
// entity queries passed in. Tested in tools/tests/traffic/.

/** Spawn ring around the player, metres: inner edge when the camera could see, outer edge. */
export const SPAWN_RING = Object.freeze({ near: 70, hidden: 95, far: 230 });
/** Beyond this distance a traffic car is removed. */
export const DESPAWN_DISTANCE = 270;
/** Metres kept clear around a new car. */
export const SPAWN_CLEARANCE = 10;

/**
 * How many traffic cars to keep around the player.
 * @param {{maxVehicles?: number, trafficDensity?: number}} tier context.quality.tier.
 * @param {number} scale TRAFFIC_SET_DENSITY scale (1 normal, 0 empty streets).
 */
export function trafficTargetCount(tier, scale) {
  const maxVehicles = tier?.maxVehicles ?? 60;
  const density = tier?.trafficDensity ?? 1;
  const count = Math.min(maxVehicles * 0.66, 40 * density) * Math.max(0, scale);
  return Math.max(0, Math.round(Math.min(count, maxVehicles - 8)));
}

function inHours(hours, hour) {
  if (!hours) return true;
  const [from, to] = hours;
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}

/**
 * The models of each district's traffic that can be spawned now.
 * @param {Record<string, {trafficMix?: Record<string, number>}>} districts CITY_DISTRICTS.
 * @param {Record<string, {spawn?: {traffic?: boolean, hours?: [number, number] | null}}>} catalog VEHICLE_CATALOG.
 * @param {(modelId: string) => boolean} isBuilt Whether the asset registry has the model.
 * @param {number} hour 0..24.
 * @returns {Map<string, {ids: string[], cumulative: number[], total: number}>} By district id, plus '*' for anywhere.
 */
export function buildTrafficMixes(districts, catalog, isBuilt, hour) {
  const mixes = new Map();
  const allowed = (id) => {
    const entry = catalog[id];
    return Boolean(entry && entry.spawn?.traffic && isBuilt(id) && inHours(entry.spawn.hours, hour));
  };
  const anywhere = {};
  for (const [districtId, district] of Object.entries(districts)) {
    const mix = { ids: [], cumulative: [], total: 0 };
    for (const [id, weight] of Object.entries(district.trafficMix ?? {})) {
      if (!allowed(id) || !(weight > 0)) continue;
      mix.total += weight;
      mix.ids.push(id);
      mix.cumulative.push(mix.total);
      anywhere[id] = (anywhere[id] ?? 0) + weight;
    }
    if (mix.total > 0) mixes.set(districtId, mix);
  }
  const fallback = { ids: [], cumulative: [], total: 0 };
  const pool = Object.keys(anywhere).length ? anywhere : Object.fromEntries(Object.keys(catalog).filter(allowed).map((id) => [id, 1]));
  for (const [id, weight] of Object.entries(pool)) {
    fallback.total += weight;
    fallback.ids.push(id);
    fallback.cumulative.push(fallback.total);
  }
  mixes.set('*', fallback);
  return mixes;
}

/**
 * Picks a model for a district.
 * @param {Map<string, {ids: string[], cumulative: number[], total: number}>} mixes From buildTrafficMixes.
 * @param {string | null} districtId
 * @param {number} roll 0..1.
 * @returns {string | null} A vehicle id, or null when nothing is built.
 */
export function pickTrafficModel(mixes, districtId, roll) {
  const mix = mixes.get(districtId) ?? mixes.get('*');
  if (!mix || mix.total <= 0) return null;
  const pick = roll * mix.total;
  for (let i = 0; i < mix.ids.length; i += 1) if (pick < mix.cumulative[i]) return mix.ids[i];
  return mix.ids[mix.ids.length - 1];
}

/**
 * Whether a point is out of the camera's sight: behind or beside the view, or far away.
 * @param {number} x
 * @param {number} z
 * @param {{x: number, z: number, forwardX: number, forwardZ: number, cosHalfView: number}} eye Camera on the ground plane.
 * @param {number} [hiddenBeyond] Metres beyond which a car is small enough not to be noticed.
 */
export function outOfSight(x, z, eye, hiddenBeyond = 190) {
  const dx = x - eye.x;
  const dz = z - eye.z;
  const distance = Math.hypot(dx, dz);
  if (distance > hiddenBeyond) return true;
  if (distance < 1) return false;
  return (dx * eye.forwardX + dz * eye.forwardZ) / distance < eye.cosHalfView;
}

/** How much busier a road class is than a plain street (cars per metre of lane). */
export const ROAD_CLASS_TRAFFIC = Object.freeze({ avenue: 5, highway: 2, street: 1, ramp: 0.5, alley: 0.25, service: 0.25 });
const SLOT_SPACING = 18;
const CELL = 64;

/**
 * Spawn slots every 18 m along every lane that can take a new car (not on bridges, not in a
 * dead-end stub), filed in a 64 m grid, each weighted by its road class.
 * @param {object[]} lanes The lane graph.
 * @param {object[]} segments plan.roads.segments.
 */
export function createLaneSpawnIndex(lanes, segments) {
  const cells = new Map();
  const point = { x: 0, z: 0, dx: 0, dz: 0 };
  for (const lane of lanes) {
    if (lane.length < 14 || lane.successors.length === 0 || segments[lane.segment]?.bridge) continue;
    const weight = ROAD_CLASS_TRAFFIC[lane.roadClass] ?? 1;
    for (let along = 6; along < lane.length - 6; along += SLOT_SPACING) {
      laneSlotPoint(lane.points, along, point);
      const key = cellKey(Math.floor(point.x / CELL), Math.floor(point.z / CELL));
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push({ lane: lane.id, along, x: point.x, z: point.z, weight });
    }
  }
  return { cells, candidates: [], cumulative: [] };
}

const cellKey = (cx, cz) => (cx + 4096) * 8192 + (cz + 4096);

function laneSlotPoint(points, along, out) {
  let left = along;
  for (let i = 0; i + 3 < points.length; i += 2) {
    const ex = points[i + 2] - points[i];
    const ez = points[i + 3] - points[i + 1];
    const span = Math.hypot(ex, ez);
    if (left <= span || i + 4 >= points.length) {
      const t = span > 0 ? Math.min(left / span, 1) : 0;
      out.x = points[i] + ex * t;
      out.z = points[i + 1] + ez * t;
      return out;
    }
    left -= span;
  }
  out.x = points[0];
  out.z = points[1];
  return out;
}

/**
 * Looks for a place to spawn one traffic car: a slot in the ring around the player, busy roads
 * more often than quiet ones, out of the camera's sight and clear of other cars.
 * @param {ReturnType<typeof createLaneSpawnIndex>} index
 * @param {{x: number, z: number}} centre The player.
 * @param {() => number} random 0..1.
 * @param {{x: number, z: number, forwardX: number, forwardZ: number, cosHalfView: number} | null} eye Camera; null while filling the streets at a cut.
 * @param {(x: number, z: number) => boolean} isClear Whether nobody stands there.
 * @param {number} [tries]
 * @returns {{lane: number, along: number, x: number, z: number} | null}
 */
export function findTrafficSpawn(index, centre, random, eye, isClear, tries = 6) {
  const inner = eye ? SPAWN_RING.hidden : 12;
  const outer = SPAWN_RING.far;
  const { candidates, cumulative } = index;
  candidates.length = 0;
  cumulative.length = 0;
  let total = 0;
  const x0 = Math.floor((centre.x - outer) / CELL);
  const x1 = Math.floor((centre.x + outer) / CELL);
  const z0 = Math.floor((centre.z - outer) / CELL);
  const z1 = Math.floor((centre.z + outer) / CELL);
  for (let cx = x0; cx <= x1; cx += 1) {
    for (let cz = z0; cz <= z1; cz += 1) {
      const slots = index.cells.get(cellKey(cx, cz));
      if (!slots) continue;
      for (const slot of slots) {
        const distance = Math.hypot(slot.x - centre.x, slot.z - centre.z);
        if (distance < inner || distance > outer) continue;
        total += slot.weight;
        candidates.push(slot);
        cumulative.push(total);
      }
    }
  }
  for (let attempt = 0; attempt < tries && total > 0; attempt += 1) {
    const pick = random() * total;
    let low = 0;
    let high = cumulative.length - 1;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (cumulative[middle] > pick) high = middle;
      else low = middle + 1;
    }
    const slot = candidates[low];
    if (eye && !outOfSight(slot.x, slot.z, eye)) continue;
    if (!isClear(slot.x, slot.z)) continue;
    return slot;
  }
  return null;
}
