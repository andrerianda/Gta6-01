// Base Aérea Punta Garza in the city plan: raises and flattens the base's pad (the fenced land
// block and the runway causeway out into the western sea) to its ground height, with a short
// rock-armour slope down to the sea floor round it, keeps the shore distance in step, marks the
// runway, taxiways, apron and access road as paved, and describes them as special areas. Authored
// at fixed coordinates (catalog/puntaGarzaAirBase.js); it draws no random number, so the rest of
// the city is the same with or without it.
//
//   const base = layOutAirBaseGround({ terrain, cover, regions, roads, lots });   // after conformTerrain
//   base.areas         // [runway_punta_garza (kind runway), base_aerea_punta_garza (kind airbase)]
//   base.diagnostics   // a line per road or lot found on the pad (none on a good plan)

import { PUNTA_GARZA_AIR_BASE } from '../../catalog/puntaGarzaAirBase.js';
import { CITY_FRAME, cityToWorld } from './cityFrame.js';
import { distanceSquaredToSegment, distanceToRing, pointInRing, projectOnPolyline } from './planGeometry.js';

/** Metres of fall per metre out from the pad's edge: the rock armour. */
const ARMOUR_FALL = 1 / 1.5;
/** Paved shoulder either side of the access road, metres. */
const ROAD_SHOULDER = 1.5;
/** Metres the raised ground reaches beyond the catalog's pad outline. */
const PAD_MARGIN = 8;
/** Boats keep this far from the pad, metres. */
const BOAT_CLEARANCE = 110;

/**
 * Presses the base into the ground of the plan and returns its special areas.
 * @param {{terrain: import('./terrainHeightField.js').TerrainHeightField, cover: import('./lotPlacement.js').GroundCover,
 *   regions: {districtAt: (x: number, z: number) => string}, roads: {segments: Object[]}, lots: Object[]}} city
 * @returns {{areas: Object[], padRing: number[], diagnostics: string[]}}
 */
export function layOutAirBaseGround({ terrain, cover, regions, roads, lots }) {
  const base = PUNTA_GARZA_AIR_BASE;
  const y = base.groundHeight;
  const flat = (pairs) => pairs.flatMap(([e, n]) => cityToWorld(e, n));
  // The catalog's fence and restricted ring run up to five metres outside its pad on the river
  // side: the ground is raised a little wider than the pad, so they stand on it.
  const padRing = offsetRing(flat(base.pad), PAD_MARGIN);
  const diagnostics = [];

  for (const segment of roads.segments) {
    for (let i = 0; i < segment.points.length; i += 2) {
      if (pointInRing(padRing, segment.points[i], segment.points[i + 1])) {
        diagnostics.push(`road ${segment.key} crosses the pad of ${base.name}`);
        break;
      }
    }
  }
  for (const lot of lots) {
    let inside = pointInRing(padRing, lot.x, lot.z);
    for (let i = 0; i < 8 && !inside; i += 2) inside = pointInRing(padRing, lot.ring[i], lot.ring[i + 1]);
    if (inside) diagnostics.push(`lot ${lot.id} lies on the pad of ${base.name}`);
  }

  // The access road outside the pad: a ramp from the highway's height up to the pad.
  const road = flat(base.accessRoad.line);
  const roadHalf = base.accessRoad.width / 2 + ROAD_SHOULDER;
  const roadStartY = terrain.heightAt(road[0], road[1]);
  const rampLength = Math.hypot(road[2] - road[0], road[3] - road[1]);

  raiseGround(terrain, padRing, y, (x, z, height) => {
    const hit = projectOnPolyline(road, x, z);
    if (hit.distance > roadHalf + 6 || hit.along > rampLength) return height;
    const ramp = roadStartY + (y - roadStartY) * Math.min(1, hit.along / rampLength);
    const side = Math.min(1, Math.max(0, (roadHalf + 6 - hit.distance) / 6));
    return cover.codeAt(x, z) === 0 ? height + (Math.max(ramp, 0.4) - height) * side : height;
  });

  // Paved ground: the runway, the taxiways, the apron and the road.
  const paveRing = (ring) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < ring.length; i += 2) {
      minX = Math.min(minX, ring[i]);
      maxX = Math.max(maxX, ring[i]);
      minZ = Math.min(minZ, ring[i + 1]);
      maxZ = Math.max(maxZ, ring[i + 1]);
    }
    const size = cover.cellSize;
    for (let r = Math.max(0, Math.floor((minZ - cover.minZ) / size)); r <= Math.min(cover.rows - 1, Math.ceil((maxZ - cover.minZ) / size)); r += 1) {
      for (let c = Math.max(0, Math.floor((minX - cover.minX) / size)); c <= Math.min(cover.columns - 1, Math.ceil((maxX - cover.minX) / size)); c += 1) {
        const index = r * cover.columns + c;
        if (cover.cells[index] === 0 && pointInRing(ring, cover.minX + (c + 0.5) * size, cover.minZ + (r + 0.5) * size)) cover.cells[index] = 1;
      }
    }
  };
  const strip = ([a, b], width) => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ue = (b[0] - a[0]) / length;
    const un = (b[1] - a[1]) / length;
    const h = width / 2;
    return flat([
      [a[0] - un * h, a[1] + ue * h], [b[0] - un * h, b[1] + ue * h], [b[0] + un * h, b[1] - ue * h], [a[0] + un * h, a[1] - ue * h],
    ]);
  };
  const runwayRing = strip([base.runway.from, base.runway.to], base.runway.width);
  const taxiways = base.taxiways.map((taxiway) => ({ id: taxiway.id, width: taxiway.width, line: flat(taxiway.line), ring: strip(taxiway.line, taxiway.width) }));
  const { west, east, south, north } = base.apron;
  const apronRing = flat([[west, south], [east, south], [east, north], [west, north]]);
  // The taxiway joins the apron: one more strip closes the gap between them.
  const apronJoin = flat([[west, north - 1], [east, north - 1], [east, base.taxiways[0].line[0][1]], [west, base.taxiways[0].line[0][1]]]);
  const roadRings = [];
  for (let i = 0; i + 1 < base.accessRoad.line.length; i += 1) {
    roadRings.push(strip([base.accessRoad.line[i], base.accessRoad.line[i + 1]], base.accessRoad.width + ROAD_SHOULDER * 2));
  }
  for (const ring of [runwayRing, apronRing, apronJoin, ...taxiways.map((taxiway) => taxiway.ring), ...roadRings]) paveRing(ring);

  const [fromX, fromZ] = cityToWorld(...base.runway.from);
  const [toX, toZ] = cityToWorld(...base.runway.to);
  const length = Math.hypot(toX - fromX, toZ - fromZ);
  const [gateX, gateZ] = cityToWorld(...base.gate.at);
  const [padX, padZ] = cityToWorld((west + east) / 2, (south + north) / 2);
  const district = regions.districtAt(padX, padZ);
  const areas = [
    {
      // Like runway_1: `line` runs west to east and `heading` is the take-off heading (westwards).
      id: base.runway.id, kind: 'runway', district, x: (fromX + toX) / 2, z: (fromZ + toZ) / 2, landmarkId: null, ring: runwayRing, y,
      line: [toX, toZ, fromX, fromZ], width: base.runway.width, length, heading: base.runway.heading, surface: 'asphalt',
      designators: base.runway.designators, threshold: { x: fromX, z: fromZ }, farEnd: { x: toX, z: toZ }, restricted: true, name: base.name,
    },
    {
      id: base.id, kind: 'airbase', district, x: padX, z: padZ, landmarkId: null, ring: padRing, y, surface: 'concrete', name: base.name,
      runway: base.runway.id, apron: apronRing, apronJoin, taxiways, fence: fenceRuns(base.fence, flat),
      gate: { x: gateX, z: gateZ, width: base.gate.width, facing: base.gate.facing },
      road: { name: base.accessRoad.name, line: road, width: base.accessRoad.width },
    },
  ];
  return { areas, padRing, diagnostics };
}

/**
 * Moves the boat lanes that would run over the pad out round it, `BOAT_CLEARANCE` from its edge.
 * @param {import('./kerbsideAndBoatLanes.js').BoatLane[]} lanes Changed in place.
 * @param {number[]} padRing The pad as a flat world ring.
 * @param {(x: number, z: number) => boolean} isWaterAt
 */
export function routeBoatLanesRoundPad(lanes, padRing, isWaterAt) {
  const detour = offsetRing(padRing, BOAT_CLEARANCE);
  const count = detour.length / 2;
  const blocked = (x, z) => pointInRing(padRing, x, z) || distanceToRing(padRing, x, z) < BOAT_CLEARANCE - 12;
  // The edge of the detour ring nearest a point (edge i runs from vertex i to vertex i + 1).
  const nearestEdge = (x, z) => {
    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < count; i += 1) {
      const j = (i + 1) % count;
      const d = distanceSquaredToSegment(x, z, detour[i * 2], detour[i * 2 + 1], detour[j * 2], detour[j * 2 + 1]);
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    }
    return best;
  };
  // Beyond the height field it is open sea.
  const wetAt = (x, z) => outsideExtent(x, z) || isWaterAt(x, z);
  // The ring's vertices from edge `from` to edge `to`, walking with (+1) or against (-1) its order.
  const walk = (from, to, step, ax, az, bx, bz) => {
    const points = [];
    let wet = true;
    let lastX = ax;
    let lastZ = az;
    const visit = (x, z) => {
      wet = wet && wetAt(x, z) && wetAt((x + lastX) / 2, (z + lastZ) / 2) && !pointInRing(padRing, (x + lastX) / 2, (z + lastZ) / 2);
      lastX = x;
      lastZ = z;
    };
    for (let edge = from; edge !== to; edge = (edge + step + count) % count) {
      const i = step > 0 ? (edge + 1) % count : edge;
      points.push(detour[i * 2], detour[i * 2 + 1]);
      visit(detour[i * 2], detour[i * 2 + 1]);
    }
    visit(bx, bz);
    return { points, wet };
  };
  for (const lane of lanes) {
    const { points } = lane;
    const total = points.length / 2;
    let first = -1;
    let last = -1;
    for (let i = 0; i < total; i += 1) {
      if (!blocked(points[i * 2], points[i * 2 + 1])) continue;
      if (first < 0) first = i;
      last = i;
    }
    if (first < 0 || lane.kind === 'river') continue;
    // The ends of the detour: the kept neighbours, or the lane's own end where none is left.
    const a = Math.max(0, first - 1);
    const b = Math.min(total - 1, last + 1);
    const from = nearestEdge(points[a * 2], points[a * 2 + 1]);
    const to = nearestEdge(points[b * 2], points[b * 2 + 1]);
    const forward = walk(from, to, 1, points[a * 2], points[a * 2 + 1], points[b * 2], points[b * 2 + 1]);
    const backward = walk(from, to, -1, points[a * 2], points[a * 2 + 1], points[b * 2], points[b * 2 + 1]);
    const round = forward.wet === backward.wet ? (forward.points.length <= backward.points.length ? forward : backward) : forward.wet ? forward : backward;
    const next = points.slice(0, first * 2).concat(round.points, points.slice((last + 1) * 2));
    lane.points = next;
    lane.length = 0;
    for (let i = 2; i < next.length; i += 2) lane.length += Math.hypot(next[i] - next[i - 2], next[i + 1] - next[i - 1]);
    lane.roundAirBase = true;
  }
}

function outsideExtent(x, z) {
  const { minX, maxX, minZ, maxZ } = CITY_FRAME.extent;
  return x < minX || x > maxX || z < minZ || z > maxZ;
}

// Raises the height field to `y` on the pad and to the armour slope round it, and makes the shore
// distance that of the old land joined with the pad. `shape` may reshape a sample outside the pad.
function raiseGround(terrain, ring, y, shape) {
  const { minX, minZ, cellSize, columns, rows, heights, shoreDistance } = terrain;
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    x0 = Math.min(x0, ring[i]);
    x1 = Math.max(x1, ring[i]);
    z0 = Math.min(z0, ring[i + 1]);
    z1 = Math.max(z1, ring[i + 1]);
  }
  const armour = terrain.shoreKindIndex ? terrain.shoreKindIndex('rocky') : -1;
  for (let row = 0; row < rows; row += 1) {
    const z = minZ + row * cellSize;
    const dz = z < z0 ? z0 - z : z > z1 ? z - z1 : 0;
    for (let column = 0; column < columns; column += 1) {
      const x = minX + column * cellSize;
      const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
      const index = row * columns + column;
      const box = Math.hypot(dx, dz);
      // Nothing changes where the old shore is nearer than the pad can be.
      if (box > 120 && -box <= shoreDistance[index]) continue;
      const inside = box === 0 && pointInRing(ring, x, z);
      const edge = distanceToRing(ring, x, z);
      const signed = inside ? edge : -edge;
      if (inside) heights[index] = y;
      else if (edge < 120) heights[index] = shape(x, z, Math.max(heights[index], y - edge * ARMOUR_FALL));
      if (signed > shoreDistance[index]) {
        shoreDistance[index] = signed;
        if (armour >= 0 && terrain.shoreCoordinate) terrain.shoreCoordinate[index] = armour;
      }
    }
  }
}

// The fence as world runs: [[x, z, ...], ...], broken where the plan leaves a gap (the gate).
function fenceRuns(fence, flat) {
  const runs = [];
  let run = [];
  for (const point of fence) {
    if (point) {
      run.push(point);
      continue;
    }
    if (run.length > 1) runs.push(flat(run));
    run = [];
  }
  if (run.length > 1) runs.push(flat(run));
  return runs;
}

// A ring grown outwards by `distance` (mitred corners), whatever way it winds.
function offsetRing(ring, distance) {
  const count = ring.length / 2;
  let area = 0;
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    area += ring[i * 2] * ring[j * 2 + 1] - ring[j * 2] * ring[i * 2 + 1];
  }
  const sign = area > 0 ? 1 : -1;
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const p = (i + count - 1) % count;
    const n = (i + 1) % count;
    const ax = ring[i * 2] - ring[p * 2];
    const az = ring[i * 2 + 1] - ring[p * 2 + 1];
    const bx = ring[n * 2] - ring[i * 2];
    const bz = ring[n * 2 + 1] - ring[i * 2 + 1];
    const al = Math.hypot(ax, az);
    const bl = Math.hypot(bx, bz);
    // Outward normals of the two edges at this corner.
    const n1x = (az / al) * sign;
    const n1z = (-ax / al) * sign;
    const n2x = (bz / bl) * sign;
    const n2z = (-bx / bl) * sign;
    let mx = n1x + n2x;
    let mz = n1z + n2z;
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml;
    mz /= ml;
    const scale = Math.min(2, 1 / Math.max(0.3, mx * n1x + mz * n1z));
    out.push(ring[i * 2] + mx * distance * scale, ring[i * 2 + 1] + mz * distance * scale);
  }
  return out;
}
