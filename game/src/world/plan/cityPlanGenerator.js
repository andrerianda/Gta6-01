// The city plan of Marazul: one call turns a seeded generator into the whole city as data
// (terrain and coastline, districts, the road graph with its intersections, lots, landmarks) with
// fast queries over it. Pure data: nothing here draws, and nothing imports three.js.
//
//   import { createSeededRandom } from '../../core/random/seededRandom.js';
//   const plan = generateCityPlan(createSeededRandom('marazul'));
//   plan.heightAt(x, z); plan.districtAt(x, z); plan.surfaceAt(x, z); plan.lotAt(x, z);
//   plan.nearestRoad(x, z);            // {segment, along, distance, x, z}
//   plan.roads.segments, plan.roads.nodes, plan.lots, plan.landmarks, plan.landmarkById
//   plan.sectorAt(x, z)                // {segments: [...ids], nodes: [...], lots: [...]}

import { CITY_LANDMARK_REQUESTS } from '../../catalog/cityDistricts.js';
import { CITY_FRAME, cityToWorld } from './cityFrame.js';
import { buildCoastlineShapes } from './coastlineShapes.js';
import { createDistrictRegions } from './districtRegions.js';
import { designIntersections } from './intersectionDesign.js';
import { buildLaneGraph } from './laneGraph.js';
import { placeLotsAndLandmarks } from './lotPlacement.js';
import { projectOnPolyline } from './planGeometry.js';
import { assembleRoadGraph } from './roadGraphAssembly.js';
import { layOutArterialRoads, STAGING_STREETS } from './roadLayoutArterials.js';
import { layOutDistrictStreets } from './roadLayoutDistrictStreets.js';
import { createRoadStrokeSet } from './roadStrokes.js';
import { createTerrainHeightField, wetlandFactor } from './terrainHeightField.js';

const SECTOR_SIZE = 128;

/**
 * Generates the complete plan of the city.
 * @param {import('../../core/random/seededRandom.js').SeededRandom} random The seeded generator;
 *   the same seed gives the same plan (compare `plan.digest`).
 * @param {{landmarks?: {id: string, name?: string, district: string, kind: string, footprint: string, needs?: readonly string[]}[],
 *   streetNames?: Record<string, string>}} [options] The story team's landmark requests (the
 *   districts catalog by default) and street names by road key.
 * @returns {CityPlan}
 */
export function generateCityPlan(random, options = {}) {
  const coast = buildCoastlineShapes(random.fork('coast'));
  const terrain = createTerrainHeightField(coast, random.fork('terrain'));
  const regions = createDistrictRegions();

  const set = createRoadStrokeSet(options.streetNames);
  layOutArterialRoads(set);
  layOutDistrictStreets(set, random.fork('streets'));
  const roads = assembleRoadGraph(set.strokes, terrain);
  for (const segment of roads.segments) {
    const middle = (segment.points.length >> 2) * 2;
    segment.district = regions.districtAt(segment.points[middle], segment.points[middle + 1]);
  }
  designIntersections(roads);

  const requests = options.landmarks ?? CITY_LANDMARK_REQUESTS;
  const { lots, landmarks, unplaced, cover } = placeLotsAndLandmarks(roads, terrain, regions, requests, random.fork('lots'));
  const landmarkById = Object.fromEntries(landmarks.map((landmark) => [landmark.id, landmark]));
  const sectors = buildSectors(roads, lots);

  const sectorAt = (x, z) => {
    const c = Math.floor((x - sectors.minX) / SECTOR_SIZE);
    const r = Math.floor((z - sectors.minZ) / SECTOR_SIZE);
    return c < 0 || r < 0 || c >= sectors.columns || r >= sectors.rows ? null : sectors.cells[r * sectors.columns + c];
  };
  const lotAt = (x, z) => {
    const code = cover.codeAt(x, z);
    return code >= 3 ? lots[code - 3] : null;
  };
  const nearestRoad = (x, z, maxDistance = 96) => {
    const reach = Math.ceil(maxDistance / SECTOR_SIZE);
    const c0 = Math.floor((x - sectors.minX) / SECTOR_SIZE);
    const r0 = Math.floor((z - sectors.minZ) / SECTOR_SIZE);
    let best = null;
    for (let r = r0 - reach; r <= r0 + reach; r += 1) {
      for (let c = c0 - reach; c <= c0 + reach; c += 1) {
        if (c < 0 || r < 0 || c >= sectors.columns || r >= sectors.rows) continue;
        for (const id of sectors.cells[r * sectors.columns + c].segments) {
          const hit = projectOnPolyline(roads.segments[id].points, x, z);
          if (hit.distance <= maxDistance && (!best || hit.distance < best.distance)) {
            best = { segment: roads.segments[id], along: hit.along, distance: hit.distance, x: hit.x, z: hit.z };
          }
        }
      }
    }
    return best;
  };
  const surfaceAt = (x, z) => {
    const code = cover.codeAt(x, z);
    if (code === 1) return 'paved';
    if (code === 2) return 'dirt';
    if (terrain.shoreDistanceAt(x, z) < 0) return 'water';
    if (code >= 3) return lots[code - 3].zone === 'park' ? 'grass' : 'paved';
    if (terrain.naturalSandAt(x, z) > 0) return 'sand';
    const district = regions.districtAt(x, z);
    return district === 'puerto_tamarindo' || district === 'barrio_hierro' ? 'dirt' : 'grass';
  };

  const lanes = buildLaneGraph(roads);
  const lanesOfSegment = roads.segments.map(() => []);
  for (const lane of lanes) lanesOfSegment[lane.segment].push(lane);
  const nearestLane = (x, z, maxDistance = 96) => {
    const reach = Math.ceil(maxDistance / SECTOR_SIZE);
    const c0 = Math.floor((x - sectors.minX) / SECTOR_SIZE);
    const r0 = Math.floor((z - sectors.minZ) / SECTOR_SIZE);
    let best = null;
    for (let r = r0 - reach; r <= r0 + reach; r += 1) {
      for (let c = c0 - reach; c <= c0 + reach; c += 1) {
        if (c < 0 || r < 0 || c >= sectors.columns || r >= sectors.rows) continue;
        for (const id of sectors.cells[r * sectors.columns + c].segments) {
          for (const lane of lanesOfSegment[id]) {
            const hit = projectOnPolyline(lane.points, x, z);
            if (hit.distance <= maxDistance && (!best || hit.distance < best.distance)) {
              best = { lane, along: hit.along, distance: hit.distance, x: hit.x, z: hit.z };
            }
          }
        }
      }
    }
    return best;
  };

  const plan = {
    frame: CITY_FRAME,
    coast,
    terrain,
    districts: regions.districts,
    districtById: regions.byId,
    roads,
    lanes,
    lots,
    landmarks,
    landmarkById,
    unplacedLandmarks: unplaced,
    cover,
    sectors,
    stagingStreets: Object.entries(STAGING_STREETS).map(([key, street]) => {
      const [eastX, eastZ] = cityToWorld(street.cityLine[2], street.cityLine[3]);
      const [westX, westZ] = cityToWorld(street.cityLine[0], street.cityLine[1]);
      return { key, district: street.district, headingDegrees: street.headingDegrees, note: street.note, eastEnd: { x: eastX, z: eastZ }, westEnd: { x: westX, z: westZ } };
    }),
    vantagePoints: SKYLINE_VANTAGE_POINTS.map(([id, e, n, lookE, lookN, note]) => {
      const [x, z] = cityToWorld(e, n);
      const [lookX, lookZ] = cityToWorld(lookE, lookN);
      return { id, x, z, lookX, lookZ, note };
    }),
    heightAt: terrain.heightAt,
    normalAt: terrain.normalAt,
    shoreDistanceAt: terrain.shoreDistanceAt,
    isWaterAt: terrain.isWaterAt,
    districtAt: regions.districtAt,
    wetlandAt: (x, z) => wetlandFactor(x * CITY_FRAME.eastX + z * CITY_FRAME.eastZ, x * CITY_FRAME.northX + z * CITY_FRAME.northZ),
    surfaceAt,
    lotAt,
    nearestRoad,
    nearestLane,
    streetNameAt: (x, z) => nearestRoad(x, z)?.segment.name ?? null,
    sectorAt,
    diagnostics: roads.diagnostics,
  };
  plan.stats = collectStatistics(plan, requests.length);
  plan.digest = digestOfPlan(plan);
  return plan;
}

/**
 * @typedef {Object} CityPlan
 * @property {typeof CITY_FRAME} frame The city frame (grid turned six degrees) and world extent.
 * @property {import('./coastlineShapes.js').CoastlineShapes} coast Land rings and carved water.
 * @property {import('./terrainHeightField.js').TerrainHeightField} terrain
 * @property {import('./districtRegions.js').DistrictRegion[]} districts
 * @property {{nodes: import('./roadGraphAssembly.js').RoadNode[], segments: import('./roadGraphAssembly.js').RoadSegment[]}} roads
 * @property {import('./laneGraph.js').TrafficLane[]} lanes The directed lane graph for traffic.
 * @property {import('./lotPlacement.js').CityLot[]} lots
 * @property {import('./lotPlacement.js').PlacedLandmark[]} landmarks
 * @property {Record<string, import('./lotPlacement.js').PlacedLandmark>} landmarkById
 * @property {string[]} unplacedLandmarks Ids of requests that found no lot (none on the default list).
 * @property {(x: number, z: number) => number} heightAt Ground height anywhere, far out to sea too.
 * @property {(x: number, z: number) => number} shoreDistanceAt Metres to the coast: positive on land.
 * @property {(x: number, z: number) => string} districtAt
 * @property {(x: number, z: number) => 'paved'|'dirt'|'water'|'sand'|'grass'} surfaceAt
 * @property {(x: number, z: number) => ?import('./lotPlacement.js').CityLot} lotAt
 * @property {(x: number, z: number, maxDistance?: number) => ?{segment: Object, along: number, distance: number, x: number, z: number}} nearestRoad
 * @property {(x: number, z: number, maxDistance?: number) => ?{lane: import('./laneGraph.js').TrafficLane, along: number, distance: number, x: number, z: number}} nearestLane
 *   The nearest traffic lane with the projection of the point on it.
 * @property {(x: number, z: number) => ?string} streetNameAt
 * @property {(x: number, z: number) => ?{segments: number[], nodes: number[], lots: number[]}} sectorAt
 * @property {Object} stats Road length, intersections, lots by zone and district, landmarks.
 * @property {string} digest A hash of the plan: equal for equal seeds.
 */

// [id, e, n, look-at e, look-at n, note] in city coordinates.
const SKYLINE_VANTAGE_POINTS = [
  ['mirador_de_la_loma', 1100, 565, 250, -300, 'The lookout under the summit of Las Lomas: all of Centro and the beach below, looking south-west.'],
  ['calzada_coral', 1640, -1300, 400, -500, 'The middle of the causeway to Isla Coral: the hotel front and the towers across the water, looking north-west.'],
  ['muelle_dorado', 200, -1150, 260, -200, 'Out over the sea at the foot of Avenida de los Fundadores: the beach, the hotels and the skyline head-on.'],
  ['puente_rio_tamarindo', -1210, 745, 100, -100, 'The highway bridge over the Rio Tamarindo: factories in front, the downtown towers behind, looking south-east.'],
];

function buildSectors(roads, lots) {
  const { minX, maxX, minZ, maxZ } = CITY_FRAME.extent;
  const columns = Math.ceil((maxX - minX) / SECTOR_SIZE);
  const rows = Math.ceil((maxZ - minZ) / SECTOR_SIZE);
  const cells = [];
  for (let i = 0; i < columns * rows; i += 1) cells.push({ segments: [], nodes: [], lots: [] });
  const cellOf = (x, z) => {
    const c = Math.min(columns - 1, Math.max(0, Math.floor((x - minX) / SECTOR_SIZE)));
    const r = Math.min(rows - 1, Math.max(0, Math.floor((z - minZ) / SECTOR_SIZE)));
    return cells[r * columns + c];
  };
  const addOnce = (list, id) => {
    if (list[list.length - 1] !== id && !list.includes(id)) list.push(id);
  };
  for (const segment of roads.segments) {
    for (let i = 0; i < segment.points.length; i += 2) addOnce(cellOf(segment.points[i], segment.points[i + 1]).segments, segment.id);
  }
  for (const node of roads.nodes) cellOf(node.x, node.z).nodes.push(node.id);
  for (const lot of lots) {
    addOnce(cellOf(lot.x, lot.z).lots, lot.id);
    for (let i = 0; i < 8; i += 2) addOnce(cellOf(lot.ring[i], lot.ring[i + 1]).lots, lot.id);
  }
  return { minX, minZ, size: SECTOR_SIZE, columns, rows, cells };
}

function collectStatistics(plan, requested) {
  const count = (items, key) => {
    const totals = {};
    for (const item of items) totals[item[key]] = (totals[item[key]] ?? 0) + 1;
    return totals;
  };
  const roadLengthByClass = {};
  let roadLength = 0;
  for (const segment of plan.roads.segments) {
    roadLength += segment.length;
    roadLengthByClass[segment.roadClass] = Math.round((roadLengthByClass[segment.roadClass] ?? 0) + segment.length);
  }
  return {
    roadLength: Math.round(roadLength),
    roadLengthByClass,
    segments: plan.roads.segments.length,
    intersections: plan.roads.nodes.filter((node) => node.segments.length >= 3).length,
    signalIntersections: plan.roads.nodes.filter((node) => node.control === 'signals').length,
    lots: plan.lots.length,
    lotsByZone: count(plan.lots, 'zone'),
    lotsByDistrict: count(plan.lots, 'district'),
    landmarksRequested: requested,
    landmarksPlaced: plan.landmarks.length,
    landmarksByDistrict: count(plan.landmarks, 'district'),
  };
}

// A 32-bit FNV-1a hash over the rounded numbers that define the plan.
function digestOfPlan(plan) {
  let hash = 0x811c9dc5;
  const mix = (value) => {
    hash ^= Math.round(value * 16) | 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  };
  for (const node of plan.roads.nodes) {
    mix(node.x);
    mix(node.y);
    mix(node.z);
  }
  for (const segment of plan.roads.segments) {
    mix(segment.a);
    mix(segment.b);
    mix(segment.length);
  }
  for (const lot of plan.lots) {
    mix(lot.x);
    mix(lot.z);
    mix(lot.width);
    mix(lot.depth);
  }
  for (const landmark of plan.landmarks) mix(landmark.lot);
  for (let i = 0; i < plan.terrain.heights.length; i += 97) mix(plan.terrain.heights[i]);
  return hash.toString(16).padStart(8, '0');
}
