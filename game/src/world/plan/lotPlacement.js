// Places the landmarks and the building lots of the city. A lot is an oriented rectangle set
// along a road frontage: it faces the street, never touches a road corridor, the water or
// another lot, and carries what the building assembler needs (ring, ground height, frontage edge
// with its road, facing, district, zoning, storey range, style, landmark). Landmarks are placed
// first, each on the best free frontage of its district for its wishes; ordinary lots then fill
// every street side by side, sized by district and road.
//
//   const { lots, landmarks, unplaced, cover } = placeLotsAndLandmarks(graph, terrain, regions, requests, random);
//   cover.codeAt(x, z)     // 0 open ground, 1 paved road, 2 dirt road, 3 + lot id

import { CITY_FRAME, cityToWorld, worldToCity } from './cityFrame.js';
import { convexRingsOverlap, headingOfDirection, pointAlongPolyline, projectOnPolyline, rectangleRing } from './planGeometry.js';

const COVER_CELL = 2;
const LOT_HASH = 96;

/**
 * Places landmarks, then ordinary lots, along the roads of the graph.
 * @param {{nodes: Object[], segments: Object[]}} graph The designed road graph (segments carry `district`).
 * @param {import('./terrainHeightField.js').TerrainHeightField} terrain
 * @param {import('./districtRegions.js').DistrictRegions} regions
 * @param {{id: string, name?: string, district: string, kind: string, footprint: string, needs?: readonly string[]}[]} requests
 * @param {import('../../core/random/seededRandom.js').SeededRandom} random
 * @returns {{lots: CityLot[], landmarks: PlacedLandmark[], unplaced: string[], cover: GroundCover}}
 */
export function placeLotsAndLandmarks(graph, terrain, regions, requests, random) {
  const cover = createGroundCover(graph);
  const state = { graph, terrain, regions, cover, lots: [], hash: new Map() };
  const landmarks = [];
  const unplaced = [];
  const order = requests.map((request, index) => ({ request, index, size: FOOTPRINT_ORDER[request.footprint] ?? 1 }));
  const authored = (entry) => (AUTHORED_SITES[entry.request.kind] ? 1 : 0);
  order.sort((p, q) => authored(q) - authored(p) || q.size - p.size || p.index - q.index);
  const landmarkRandom = random.fork('landmarks');
  for (const { request } of order) {
    const lot = placeLandmark(state, request, landmarkRandom);
    if (!lot) {
      unplaced.push(request.id);
      continue;
    }
    landmarks.push({
      id: request.id, kind: request.kind, name: request.name ?? request.id, district: request.district, footprint: request.footprint,
      lot: lot.id, x: lot.x, y: lot.y, z: lot.z, entrance: lot.entrance, frontX: lot.frontX, frontZ: lot.frontZ, facing: lot.heading,
    });
  }
  fillStreets(state, random.fork('lots'));
  addSideFrontages(state);
  return { lots: state.lots, landmarks, unplaced, cover };
}

/**
 * @typedef {Object} CityLot
 * @property {number} id Index in `lots`.
 * @property {number[]} ring The rectangle, counter-clockwise seen from above, flat [x, z, ...]:
 *   front right, front left, back left, back right as the building looks at its street.
 * @property {number} x Centre.
 * @property {number} y Ground height of the level pad.
 * @property {number} z
 * @property {number} frontX Unit direction the lot faces (towards its street).
 * @property {number} frontZ
 * @property {number} heading Compass heading of the facing, radians (0 north, a quarter turn east).
 * @property {number} width Along the street.
 * @property {number} depth
 * @property {number} area
 * @property {{segment: number, ax: number, az: number, bx: number, bz: number}[]} frontages Street
 *   frontage edges with the road segment id; the first is the main one (the front edge). A corner
 *   lot has a second one, a side edge, where that side runs along the other street of its corner.
 *   Every edge goes in ring order (counter-clockwise from above).
 * @property {{x: number, z: number}} entrance The point on the back of the sidewalk in front of the lot.
 * @property {string} district
 * @property {string} zone hotel, tower, retail, mixed_use, residential_low, residential_high,
 *   villa, industrial, port_yard, civic, park, plaza, leisure, rural, landmark.
 * @property {string} zoning commercial_high, commercial_low, residential_high, residential_low,
 *   industrial, civic, leisure or waterfront.
 * @property {number} floorsMin Suggested storey range.
 * @property {number} floorsMax
 * @property {string} style Style hint for the building assembler.
 * @property {boolean} corner Whether the lot stands at a street corner.
 * @property {?string} landmarkId
 * @property {?string} landmarkKind
 */
/**
 * @typedef {Object} PlacedLandmark
 * @property {string} id
 * @property {string} kind
 * @property {string} name
 * @property {string} district
 * @property {string} footprint
 * @property {number} lot Lot id.
 * @property {number} x Lot centre.
 * @property {number} y
 * @property {number} z
 * @property {{x: number, z: number}} entrance On the street side.
 * @property {number} frontX
 * @property {number} frontZ
 * @property {number} facing Compass heading, radians.
 */
/**
 * @typedef {Object} GroundCover
 * @property {number} minX
 * @property {number} minZ
 * @property {number} cellSize 2 m.
 * @property {number} columns
 * @property {number} rows
 * @property {Uint16Array} cells 0 open, 1 paved road corridor, 2 dirt road, 3 + lot id.
 * @property {(x: number, z: number) => number} codeAt
 */

const FOOTPRINT_ORDER = { small: 1, medium: 2, large: 3, huge: 4 };
const FOOTPRINT_SIZE = { small: [18, 20], medium: [34, 34], large: [62, 54], huge: [100, 84] };

// Where a kind of landmark belongs when its district leaves a choice, in city coordinates.
const KIND_HINTS = {
  pier: [200, -900], marina: [1420, -680], yacht_club: [1600, -900], casino_resort: [1380, -575], lighthouse: [1205, -1120],
  container_terminal: [-1000, -920], shipyard: [-1000, -620], train_yard: [-470, 480], scrapyard: [-980, 200], airstrip: [-460, 1000],
  trailer_park: [-1500, 450], radio_tower: [1130, 620], lookout: [1100, 565], city_hall: [140, -50], plaza: [140, -52], bank: [520, -180],
  bus_terminal: [-200, 420], stadium: [-100, 600], shopping_mall: [400, -560], courthouse: [260, -50], helipad: [1600, -1700],
  church: [-480, -120], market: [-480, -240], grand_hotel: [200, -830], beach_house: [1700, -200],
};
const COASTAL_KINDS = new Set(['pier', 'lighthouse', 'beach_house', 'marina', 'yacht_club']);
// Landmarks whose place the plan fixes, by kind; they are placed before every other landmark,
// each on its site before any other frontage. A site names the street the lot fronts, the point
// on it (`at`, city coordinates), a city point on the side the lot stands (`toward`), the setback
// from the road corridor and the sizes to try, [width along the street, depth], largest first.
// - pier: its land end on the beach at the foot of Avenida de los Fundadores (arcade, bait
//   stand), behind the promenade, which takes the first 9.4 m on the sea side of Bulevar Dorado.
//   The pier deck starts inside this lot.
// - shopping_mall: the whole superblock e 310..520, n -690..-520 of Centro, fronting Calle 310.
// - plaza: the civic half-block e 200..310, n -95..75 on Avenida de los Fundadores; the city hall
//   faces it from the other side of the avenue.
// - stadium: the superblock of Barrio Hierro e -470..-250, n 420..660 (Calle 540 stops there),
//   fronting Avenida del Riel.
// - airstrip: the terminal, apron and hangars on the runway side of Camino de la Pista, just south
//   of the runway's east end (the runway itself is a special area at n 1150, planned after lots).
const AUTHORED_SITES = {
  airstrip: { street: 'camino_de_la_pista', at: [-462, 1025], toward: [-570, 1025], setback: 3, sizes: [[96, 110], [80, 96], [64, 80]] },
  stadium: { street: 'avenida_del_riel', at: [-356, 420], toward: [-356, 540], setback: 1.5, sizes: [[190, 196], [170, 170], [150, 140]] },
  pier: { street: 'bulevar_dorado', at: [200, -860], toward: [200, -1000], setback: 11, sizes: [[64, 58], [52, 48], [40, 36]] },
  shopping_mall: { street: 'centro_ns_310', at: [310, -605], toward: [415, -605], setback: 1.5, sizes: [[140, 150], [124, 130], [100, 84]] },
  plaza: { street: 'avenida_de_los_fundadores', at: [200, -10], toward: [260, -10], setback: 1.5, sizes: [[140, 84], [124, 76], [100, 64]] },
};
const ZONING_BY_KIND = {
  leisure: ['park', 'plaza', 'stadium', 'lookout', 'casino_resort', 'nightclub'],
  waterfront: ['pier', 'marina', 'yacht_club', 'lighthouse', 'beach_house'],
  industrial: ['warehouse', 'factory', 'scrapyard', 'container_terminal', 'shipyard', 'train_yard'],
  residential_low: ['mansion', 'trailer_park', 'motel'],
  residential_high: ['safehouse_apartment'],
  civic: ['police_station', 'hospital', 'fire_station', 'city_hall', 'courthouse', 'church', 'bus_terminal', 'airstrip', 'helipad', 'radio_tower', 'market'],
  commercial_high: ['bank', 'grand_hotel', 'shopping_mall'],
};

function zoningOfKind(kind) {
  for (const zoning of Object.keys(ZONING_BY_KIND)) if (ZONING_BY_KIND[zoning].includes(kind)) return zoning;
  return 'commercial_low';
}

function createGroundCover(graph) {
  const { minX, maxX, minZ, maxZ } = CITY_FRAME.extent;
  const columns = Math.ceil((maxX - minX) / COVER_CELL);
  const rows = Math.ceil((maxZ - minZ) / COVER_CELL);
  const cells = new Uint16Array(columns * rows);
  const stamp = (x, z, radius, code) => {
    const c0 = Math.max(0, Math.floor((x - radius - minX) / COVER_CELL));
    const c1 = Math.min(columns - 1, Math.floor((x + radius - minX) / COVER_CELL));
    const r0 = Math.max(0, Math.floor((z - radius - minZ) / COVER_CELL));
    const r1 = Math.min(rows - 1, Math.floor((z + radius - minZ) / COVER_CELL));
    for (let r = r0; r <= r1; r += 1) {
      const dz = minZ + (r + 0.5) * COVER_CELL - z;
      for (let c = c0; c <= c1; c += 1) {
        const dx = minX + (c + 0.5) * COVER_CELL - x;
        if (dx * dx + dz * dz <= radius * radius) cells[r * columns + c] = code;
      }
    }
  };
  for (const segment of graph.segments) {
    const radius = Math.max(segment.corridorLeft, segment.corridorRight) + 0.2;
    const code = segment.paved ? 1 : 2;
    const p = segment.points;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const steps = Math.max(1, Math.ceil(Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]) / 3));
      for (let k = 0; k <= steps; k += 1) stamp(p[i] + ((p[i + 2] - p[i]) * k) / steps, p[i + 1] + ((p[i + 3] - p[i + 1]) * k) / steps, radius, code);
    }
  }
  for (const node of graph.nodes) if (node.culDeSac) stamp(node.x, node.z, 13, 1);
  return {
    minX, minZ, cellSize: COVER_CELL, columns, rows, cells,
    codeAt(x, z) {
      const c = Math.floor((x - minX) / COVER_CELL);
      const r = Math.floor((z - minZ) / COVER_CELL);
      return c < 0 || r < 0 || c >= columns || r >= rows ? 0 : cells[r * columns + c];
    },
  };
}

// Tries a rectangle of `width` by `depth` on one side of a segment, centred `along` metres from
// its start. Returns the new lot, or null when the ground is taken, wet, sandy or too steep.
function tryPlaceLot(state, segment, side, along, width, depth, options) {
  const { terrain, cover } = state;
  const at = pointAlongPolyline(segment.points, along);
  const length = Math.hypot(at.dx, at.dz) || 1;
  const sign = side === 'right' ? 1 : -1;
  const outX = (-at.dz / length) * sign;
  const outZ = (at.dx / length) * sign;
  const corridor = side === 'right' ? segment.corridorRight : segment.corridorLeft;
  const reach = corridor + (options.setback ?? 1.5);
  const x = at.x + outX * (reach + depth / 2);
  const z = at.z + outZ * (reach + depth / 2);
  const alongX = -outZ;
  const alongZ = outX;
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const minimumShore = options.coastal ? 2 : 6;
  const centreHeight = terrain.heightAt(x, z);
  for (let u = -1; u <= 1; u += 1) {
    for (let v = -1; v <= 1; v += 1) {
      const px = x + alongX * u * halfWidth + outX * v * halfDepth;
      const pz = z + alongZ * u * halfWidth + outZ * v * halfDepth;
      if (terrain.shoreDistanceAt(px, pz) < minimumShore) return null;
      if (!options.coastal && terrain.naturalSandAt(px, pz) > 0) return null;
      if (Math.abs(terrain.heightAt(px, pz) - centreHeight) > 7) return null;
    }
  }
  // Roads are found in the cover raster; other lots are tested exactly below.
  const stepsU = Math.ceil(width / 3);
  const stepsV = Math.ceil(depth / 3);
  for (let i = 0; i <= stepsU; i += 1) {
    const u = -halfWidth + (width * i) / stepsU;
    for (let k = 0; k <= stepsV; k += 1) {
      const v = -halfDepth + (depth * k) / stepsV;
      const code = cover.codeAt(x + alongX * u + outX * v, z + alongZ * u + outZ * v);
      if (code === 1 || code === 2) return null;
    }
  }
  const ring = rectangleRing(x, z, -outX, -outZ, halfWidth, halfDepth);
  // The lot hash lists a lot under every cell its bounding box touches, so lots of any size meet
  // there: two rings can only overlap where their boxes share a cell.
  let lowX = Infinity;
  let lowZ = Infinity;
  let highX = -Infinity;
  let highZ = -Infinity;
  for (let i = 0; i < 8; i += 2) {
    lowX = Math.min(lowX, ring[i]);
    highX = Math.max(highX, ring[i]);
    lowZ = Math.min(lowZ, ring[i + 1]);
    highZ = Math.max(highZ, ring[i + 1]);
  }
  const hx0 = Math.floor((lowX - 0.5) / LOT_HASH);
  const hx1 = Math.floor((highX + 0.5) / LOT_HASH);
  const hz0 = Math.floor((lowZ - 0.5) / LOT_HASH);
  const hz1 = Math.floor((highZ + 0.5) / LOT_HASH);
  for (let gx = hx0; gx <= hx1; gx += 1) {
    for (let gz = hz0; gz <= hz1; gz += 1) {
      const cell = state.hash.get(gx * 4096 + gz);
      if (!cell) continue;
      for (const other of cell) if (convexRingsOverlap(ring, other.ring, 0.2)) return null;
    }
  }
  const lot = {
    id: state.lots.length, ring, x, y: Math.max(centreHeight, 1), z, frontX: -outX, frontZ: -outZ, heading: headingOfDirection(-outX, -outZ),
    width, depth, area: width * depth,
    frontages: [{ segment: segment.id, ax: ring[0], az: ring[1], bx: ring[2], bz: ring[3] }],
    entrance: { x: at.x + outX * corridor, z: at.z + outZ * corridor },
    district: options.district ?? segment.district, zone: options.zone, zoning: options.zoning,
    floorsMin: options.floors[0], floorsMax: options.floors[1], style: options.style, corner: options.corner === true,
    landmarkId: options.landmarkId ?? null, landmarkKind: options.landmarkKind ?? null,
  };
  state.lots.push(lot);
  for (let gx = hx0; gx <= hx1; gx += 1) {
    for (let gz = hz0; gz <= hz1; gz += 1) {
      const key = gx * 4096 + gz;
      let cell = state.hash.get(key);
      if (!cell) state.hash.set(key, (cell = []));
      cell.push(lot);
    }
  }
  const code = lot.id + 3;
  for (let u = -halfWidth + 0.5; u <= halfWidth - 0.5; u += 1.4) {
    for (let v = -halfDepth + 0.5; v <= halfDepth - 0.5; v += 1.4) {
      const c = Math.floor((x + alongX * u + outX * v - cover.minX) / COVER_CELL);
      const r = Math.floor((z + alongZ * u + outZ * v - cover.minZ) / COVER_CELL);
      if (c >= 0 && r >= 0 && c < cover.columns && r < cover.rows) cover.cells[r * cover.columns + c] = code;
    }
  }
  return lot;
}

function bearsLots(segment) {
  return !segment.bridge && segment.roadClass !== 'highway' && segment.roadClass !== 'ramp' && segment.roadClass !== 'dirt';
}

function placeLandmark(state, request, random) {
  const { graph, terrain } = state;
  const needs = request.needs ?? [];
  const hint = KIND_HINTS[request.kind] ? cityToWorld(KIND_HINTS[request.kind][0], KIND_HINTS[request.kind][1]) : null;
  const base = FOOTPRINT_SIZE[request.footprint] ?? FOOTPRINT_SIZE.medium;
  const coastal = COASTAL_KINDS.has(request.kind);
  const zoning = zoningOfKind(request.kind);
  const large = (FOOTPRINT_ORDER[request.footprint] ?? 1) >= 3;
  const tall = request.kind === 'bank' || request.kind === 'grand_hotel' || request.kind === 'safehouse_apartment' || request.kind === 'casino_resort';
  const open = request.kind === 'park' || request.kind === 'plaza';
  const options = {
    district: request.district, zone: open ? request.kind : 'landmark', zoning, coastal,
    floors: open ? [0, 0] : tall ? [8, 22] : large ? [2, 6] : [1, 3], style: request.kind, landmarkId: request.id, landmarkKind: request.kind,
  };
  const site = AUTHORED_SITES[request.kind];
  if (site) {
    const lot = placeOnAuthoredSite(state, request, site, options);
    if (lot) return lot;
  }
  for (const scale of [1, 0.8, 0.62, 0.46, 0.34]) {
    const width = Math.max(10, base[0] * scale);
    const depth = Math.max(10, base[1] * scale);
    const candidates = [];
    for (const segment of graph.segments) {
      if (segment.zonedDistrict !== request.district || !bearsLots(segment)) continue;
      const low = segment.trimA + 2;
      const high = segment.length - segment.trimB - 2;
      if (high - low < width) continue;
      const spots = [[low + width / 2, graph.nodes[segment.a].segments.length >= 3], [high - width / 2, graph.nodes[segment.b].segments.length >= 3]];
      if (high - low > width * 2.2) spots.push([(low + high) / 2, false]);
      for (const [along, corner] of spots) {
        const at = pointAlongPolyline(segment.points, along);
        let score = random.next() * 0.4;
        if (needs.includes('on_avenue') && segment.roadClass === 'avenue') score += 3;
        if (needs.includes('on_corner') && corner) score += 2;
        if (needs.includes('secluded') && segment.roadClass !== 'avenue') score += 2;
        if (needs.includes('coastal') || coastal) score += 3 * Math.max(0, 1 - terrain.shoreDistanceAt(at.x, at.z) / 220);
        if (hint) score -= Math.min(8, Math.hypot(at.x - hint[0], at.z - hint[1]) / 160);
        candidates.push({ segment, along, corner, score, side: 'right' }, { segment, along, corner, score: score - 0.01, side: 'left' });
      }
    }
    candidates.sort((p, q) => q.score - p.score);
    for (let i = 0; i < candidates.length && i < 240; i += 1) {
      const candidate = candidates[i];
      options.corner = candidate.corner;
      const lot = tryPlaceLot(state, candidate.segment, candidate.side, candidate.along, width, depth, options);
      if (lot) return lot;
    }
  }
  return null;
}

// Places a landmark on its authored site: on the piece of the named street (in the landmark's
// district) nearest the site's point, on the side the site asks for. Null when nothing fits.
function placeOnAuthoredSite(state, request, site, options) {
  const { graph } = state;
  const [x, z] = cityToWorld(site.at[0], site.at[1]);
  const [towardX, towardZ] = cityToWorld(site.toward[0], site.toward[1]);
  let best = null;
  for (const segment of graph.segments) {
    if (segment.key !== site.street || segment.zonedDistrict !== request.district || !bearsLots(segment)) continue;
    const hit = projectOnPolyline(segment.points, x, z);
    if (!best || hit.distance < best.hit.distance) best = { segment, hit };
  }
  if (!best || best.hit.distance > 40) return null;
  const at = pointAlongPolyline(best.segment.points, best.hit.along);
  const length = Math.hypot(at.dx, at.dz) || 1;
  // The right of the segment is (-dz, dx): the lot stands on the side of the `toward` point.
  const side = (-at.dz / length) * (towardX - at.x) + (at.dx / length) * (towardZ - at.z) > 0 ? 'right' : 'left';
  for (const [width, depth] of site.sizes) {
    const lot = tryPlaceLot(state, best.segment, side, best.hit.along, width, depth, { ...options, setback: site.setback, corner: false });
    if (lot) return lot;
  }
  return null;
}

// A corner lot also faces the street round its corner: a side edge that runs along another street
// of the junction at either end of its main frontage, within SIDE_FRONTAGE_GAP of that street's
// corridor, becomes a second frontage.
const SIDE_FRONTAGE_GAP = 10;
function addSideFrontages(state) {
  const { graph, lots } = state;
  for (const lot of lots) {
    if (!lot.corner) continue;
    const main = graph.segments[lot.frontages[0].segment];
    const r = lot.ring;
    // The side edges in ring order: front left to back left, back right to front right.
    for (const [ax, az, bx, bz] of [[r[2], r[3], r[4], r[5]], [r[6], r[7], r[0], r[1]]]) {
      const length = Math.hypot(bx - ax, bz - az) || 1;
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      let best = null;
      for (const nodeId of [main.a, main.b]) {
        for (const id of graph.nodes[nodeId].segments) {
          const segment = graph.segments[id];
          if (id === main.id || !bearsLots(segment)) continue;
          const hit = projectOnPolyline(segment.points, mx, mz);
          const gap = hit.distance - Math.max(segment.corridorLeft, segment.corridorRight);
          if (gap > SIDE_FRONTAGE_GAP || (best && gap >= best.gap)) continue;
          // The edge must run along the street, not point at it.
          const at = pointAlongPolyline(segment.points, hit.along);
          const tangent = Math.hypot(at.dx, at.dz) || 1;
          if (Math.abs(((bx - ax) * at.dx + (bz - az) * at.dz) / (length * tangent)) < 0.85) continue;
          best = { segment, gap };
        }
      }
      if (best && !lot.frontages.some((frontage) => frontage.segment === best.segment.id)) lot.frontages.push({ segment: best.segment.id, ax, az, bx, bz });
    }
  }
}

// What an ordinary lot on this road is: [zone, zoning, width, depth, floors, style, gap, density].
function lotRule(segment, e, n, random) {
  const avenue = segment.roadClass === 'avenue';
  switch (segment.zonedDistrict ?? segment.district) {
    case 'centro':
      if (n > 420) return ['mixed_use', 'commercial_low', random.range(26, 34), 30, [3, 7], 'office_block', 1, 1];
      if (avenue) return ['tower', 'commercial_high', random.range(36, 46), 38, [14, 40], 'glass_tower', 2, 1];
      if (n < -440) return ['mixed_use', 'residential_high', random.range(26, 34), 32, [6, 14], 'apartment_block', 1, 1];
      return ['tower', 'commercial_high', random.range(28, 36), 34, [8, 24], 'office_tower', 1, 1];
    case 'playa_dorada':
      if (avenue) return ['hotel', 'waterfront', random.range(38, 48), 44, [6, 14], 'art_deco_hotel', 3, 1];
      return ['retail', 'commercial_low', random.range(16, 24), 24, [2, 4], 'art_deco_shop', 0.5, 1];
    case 'la_marisma':
      return ['retail', random.chance(0.5) ? 'commercial_low' : 'residential_low', random.range(10, 17), random.range(14, 18), [2, 4], 'old_town', 0.3, 1];
    case 'puerto_tamarindo':
      return ['port_yard', 'industrial', random.range(48, 62), 50, [1, 2], 'warehouse', 4, 1];
    case 'barrio_hierro':
      return ['industrial', 'industrial', random.range(38, 52), 42, [1, 3], 'factory', 4, 1];
    case 'las_lomas':
      if (n < 60 && avenue) return ['residential_high', 'residential_high', random.range(30, 38), 34, [5, 10], 'apartment_block', 3, 1];
      if (n < 60) return ['residential_low', 'residential_low', random.range(20, 26), 28, [2, 3], 'townhouse', 3, 1];
      return ['villa', 'residential_low', random.range(26, 34), 30, [1, 3], 'villa', random.range(6, 11), 0.85];
    case 'bahia_vista':
      if (avenue) return ['leisure', 'leisure', random.range(34, 44), 38, [4, 10], 'resort', 3, 1];
      return ['retail', 'commercial_low', random.range(20, 28), 26, [2, 5], 'resort_shop', 1, 1];
    case 'isla_coral':
      return ['villa', 'residential_low', random.range(40, 50), 42, [2, 3], 'mansion', random.range(10, 16), 1];
    default:
      return ['rural', 'residential_low', random.range(22, 28), 26, [1, 1], 'rural', random.range(14, 30), 0.4];
  }
}

function fillStreets(state, random) {
  const { graph } = state;
  const order = graph.segments.filter(bearsLots).sort((p, q) => q.priority - p.priority || p.id - q.id);
  for (const segment of order) {
    const low = segment.trimA + 2;
    const high = segment.length - segment.trimB - 2;
    for (const side of ['right', 'left']) {
      // The sea side of the beach drive stays open: promenade, sand and the view.
      if (segment.key === 'bulevar_dorado' && side === 'right') continue;
      let from = low;
      while (from < high - 9) {
        const at = pointAlongPolyline(segment.points, from);
        const [e, n] = worldToCity(at.x, at.z);
        const [zone, zoning, wide, deep, floors, style, gap, density] = lotRule(segment, e, n, random);
        if (density < 1 && !random.chance(density)) {
          from += wide;
          continue;
        }
        // The last lot of a frontage takes what is left of it, so no sliver remains.
        const left = high - from;
        const width = left < wide * 1.45 ? Math.min(left, wide * 1.45) : wide;
        if (width < Math.min(10, wide * 0.6)) break;
        const options = { zone, zoning, floors, style, corner: from === low || from + width >= high - 0.5 };
        const lot =
          tryPlaceLot(state, segment, side, from + width / 2, width, deep, options) ??
          tryPlaceLot(state, segment, side, from + width / 2, width, deep * 0.7, options) ??
          (width > 16 ? tryPlaceLot(state, segment, side, from + width * 0.3, width * 0.6, deep * 0.5, options) : null);
        from += lot ? lot.width + gap : 6;
      }
    }
  }
}
