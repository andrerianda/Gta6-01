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

/**
 * Looks for a place to spawn one traffic car.
 * @param {object} city The openWorldCity system (nearestLane, plan).
 * @param {{x: number, z: number}} centre The player.
 * @param {() => number} random 0..1.
 * @param {{x: number, z: number, forwardX: number, forwardZ: number, cosHalfView: number} | null} eye Camera; null while filling the streets at a cut.
 * @param {(x: number, z: number) => boolean} isClear Whether nobody stands there.
 * @param {number} [tries]
 * @returns {{lane: number, along: number, x: number, z: number} | null}
 */
export function findTrafficSpawn(city, centre, random, eye, isClear, tries = 6) {
  const lanes = city.laneGraph;
  const segments = city.plan?.roads?.segments ?? [];
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const angle = random() * Math.PI * 2;
    const inner = eye ? SPAWN_RING.hidden : SPAWN_RING.near * 0.4;
    const radius = inner + Math.sqrt(random()) * (SPAWN_RING.far - inner);
    const hit = city.nearestLane(centre.x + Math.sin(angle) * radius, centre.z + Math.cos(angle) * radius, 40);
    if (!hit) continue;
    const laneId = typeof hit.lane === 'number' ? hit.lane : hit.lane?.id;
    const lane = lanes[laneId];
    if (!lane || lane.length < 14 || lane.successors.length === 0 || segments[lane.segment]?.bridge) continue;
    const along = Math.min(Math.max(hit.along, 5), lane.length - 6);
    const distance = Math.hypot(hit.x - centre.x, hit.z - centre.z);
    if (distance < (eye ? SPAWN_RING.near : 12) || distance > SPAWN_RING.far + 20) continue;
    if (eye && !outOfSight(hit.x, hit.z, eye)) continue;
    if (!isClear(hit.x, hit.z)) continue;
    return { lane: laneId, along, x: hit.x, z: hit.z };
  }
  return null;
}
