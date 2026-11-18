// The places of the city that are neither a road nor an ordinary lot, as plan data: the beach
// promenade along Bulevar Dorado and the pier at the foot of Avenida de los Fundadores, the quays
// of the port with their crane rails, the marina slips in the bay, the airstrip runway in the
// wetlands, the plazas and parks, and surface car parks with their bays.
//
//   const special = planSpecialAreas({ roads, lots, landmarks, terrain, coast, regions, cover });
//   special.areas     // [{id, kind, ring, y, district, ...}]   kind: promenade | pier | quay | marina | runway | plaza | park | parking_lot
//   special.pads      // level rectangles for conformTerrain
//   special.paths     // walkways for the pavement graph
//   special.bays      // parking bays inside the car parks

import { cityToWorld } from './cityFrame.js';
import { headingOfDirection, offsetPolyline, pointAlongPolyline, polylineLength } from './planGeometry.js';
import { STAGING_STREETS } from './roadLayoutArterials.js';

const PROMENADE_WIDTH = 9;
const PIER = { e: 200, endN: -1180, width: 12, deckHeight: 4.2, headWidth: 44, headLength: 30 };
const RUNWAY = { westE: -960, eastE: -510, n: 1150, width: 22, shoulder: 9 };
const BAY = { width: 2.6, length: 5.2, aisle: 6.4 };

/**
 * Plans the special areas. Marks the promenade and the runway as paved in the ground cover and
 * turns a few ordinary lots into car parks (zone `parking`, no storeys).
 * @param {{roads: Object, lots: import('./lotPlacement.js').CityLot[], landmarks: import('./lotPlacement.js').PlacedLandmark[],
 *   terrain: import('./terrainHeightField.js').TerrainHeightField, coast: import('./coastlineShapes.js').CoastlineShapes,
 *   regions: {districtAt: (x: number, z: number) => string}, cover: import('./lotPlacement.js').GroundCover}} city
 * @returns {{areas: SpecialArea[], pads: Object[], paths: {kind: string, points: number[], y: number, width: number}[], bays: Object[], diagnostics: string[]}}
 */
export function planSpecialAreas({ roads, lots, landmarks, terrain, coast, regions, cover }) {
  const areas = [];
  const pads = [];
  const paths = [];
  const bays = [];
  const diagnostics = [];
  const counts = {};
  const add = (kind, area) => {
    counts[kind] = (counts[kind] ?? 0) + 1;
    const [cx, cz] = centreOf(area.ring);
    areas.push({ id: `${kind}_${counts[kind]}`, kind, district: regions.districtAt(cx, cz), x: cx, z: cz, landmarkId: null, ...area });
    return areas[areas.length - 1];
  };
  const landmarkOfKind = (kind) => landmarks.find((landmark) => landmark.kind === kind) ?? null;
  // A rectangle in city coordinates as a world ring, counter-clockwise like the lots.
  const cityRectangle = (e0, n0, e1, n1) => [...cityToWorld(e0, n0), ...cityToWorld(e1, n0), ...cityToWorld(e1, n1), ...cityToWorld(e0, n1)];
  const pave = (e0, n0, e1, n1) => {
    for (let e = e0; e <= e1; e += 1.4) {
      for (let n = n0; n <= n1; n += 1.4) {
        const [x, z] = cityToWorld(e, n);
        const c = Math.floor((x - cover.minX) / cover.cellSize);
        const r = Math.floor((z - cover.minZ) / cover.cellSize);
        if (c >= 0 && r >= 0 && c < cover.columns && r < cover.rows && cover.cells[r * cover.columns + c] === 0) cover.cells[r * cover.columns + c] = 1;
      }
    }
  };
  const [eastX, eastZ] = cityToWorld(1, 0);
  const [originX, originZ] = cityToWorld(0, 0);
  const east = [eastX - originX, eastZ - originZ];
  const north = [east[1], -east[0]];

  // The promenade: a paved strip on the sea side of Bulevar Dorado, level with the street.
  const drive = roads.segments.filter((segment) => segment.key === 'bulevar_dorado');
  let promenadeN = null;
  if (drive.length > 0) {
    const [westE, n, eastE] = STAGING_STREETS.bulevar_dorado.cityLine;
    const corridor = Math.max(...drive.map((segment) => Math.max(segment.corridorLeft, segment.corridorRight)));
    const y = drive[drive.length >> 1].heights[0];
    const n1 = n - corridor - 0.4;
    const n0 = n1 - PROMENADE_WIDTH;
    let e0 = westE + 24;
    let e1 = eastE - 24;
    const dry = (e) => terrain.shoreDistanceAt(...cityToWorld(e, n0 - 4)) > 6;
    while (e0 < e1 && !dry(e0)) e0 += 20;
    while (e1 > e0 && !dry(e1)) e1 -= 20;
    promenadeN = (n0 + n1) / 2;
    const line = [...cityToWorld(e0, promenadeN), ...cityToWorld(e1, promenadeN)];
    add('promenade', { ring: cityRectangle(e0, n0, e1, n1), y, line, width: PROMENADE_WIDTH, length: e1 - e0, surface: 'paving_stones', street: 'bulevar_dorado' });
    const [px, pz] = cityToWorld((e0 + e1) / 2, promenadeN);
    pads.push({ x: px, z: pz, frontX: north[0], frontZ: north[1], width: e1 - e0, depth: PROMENADE_WIDTH + 1, y });
    paths.push({ kind: 'promenade', points: line, y, width: PROMENADE_WIDTH });
    pave(e0, n0, e1, n1);

    // The pier: a deck on piles from the promenade out over the sea, with a wide head at its end.
    const startN = n0;
    const headN = PIER.endN + PIER.headLength;
    if (terrain.shoreDistanceAt(...cityToWorld(PIER.e, PIER.endN)) < -60) {
      const deck = cityRectangle(PIER.e - PIER.width / 2, PIER.endN, PIER.e + PIER.width / 2, startN);
      const head = cityRectangle(PIER.e - PIER.headWidth / 2, PIER.endN, PIER.e + PIER.headWidth / 2, headN);
      const pierLine = [...cityToWorld(PIER.e, promenadeN), ...cityToWorld(PIER.e, PIER.endN + 6)];
      const pier = landmarkOfKind('pier');
      add('pier', {
        ring: deck, head, y: PIER.deckHeight, deckHeight: PIER.deckHeight, line: pierLine, width: PIER.width, length: startN - PIER.endN,
        rampLength: 14, surface: 'planks', landmarkId: pier ? pier.id : null,
      });
      paths.push({ kind: 'pier', points: pierLine, y: PIER.deckHeight, width: PIER.width });
    } else {
      diagnostics.push('no deep water for the pier at the foot of Avenida de los Fundadores');
    }
  }

  // Quays: every stretch of quay shore, with crane rails in the port and slips in the bay.
  const quayKind = coast.shoreKinds.findIndex((kind) => (kind.name ?? kind) === 'quay');
  const marina = landmarkOfKind('marina');
  for (const land of coast.landRings) {
    const count = land.kinds.length;
    let start = 0;
    while (start < count && land.kinds[start] === quayKind) start += 1;
    if (start === count) continue;
    for (let i = start; i < start + count; i += 1) {
      if (land.kinds[i % count] !== quayKind) continue;
      const edge = [];
      while (i < start + count && land.kinds[i % count] === quayKind) {
        edge.push(land.ring[(i % count) * 2], land.ring[(i % count) * 2 + 1]);
        i += 1;
      }
      if (edge.length < 6 || polylineLength(edge) < 60) continue;
      const middle = pointAlongPolyline(edge, polylineLength(edge) / 2);
      // Which side of the edge is land.
      const inland = terrain.shoreDistanceAt(middle.x - middle.dz * 12, middle.z + middle.dx * 12) > 0 ? 1 : -1;
      const apron = offsetPolyline(edge, inland * 24);
      const ring = edge.slice();
      for (let k = apron.length - 2; k >= 0; k -= 2) ring.push(apron[k], apron[k + 1]);
      const y = Math.max(1, terrain.heightAt(middle.x - middle.dz * 14 * inland, middle.z + middle.dx * 14 * inland));
      const district = regions.districtAt(middle.x - middle.dz * 30 * inland, middle.z + middle.dx * 30 * inland);
      const length = polylineLength(edge);
      if (district === 'puerto_tamarindo' || district === 'barrio_hierro') {
        add('quay', { ring, y, edge, length, apronWidth: 24, craneRails: [offsetPolyline(edge, inland * 6), offsetPolyline(edge, inland * 18)], surface: 'concrete' });
        continue;
      }
      // Slips: finger piers every fifteen metres, a berth on each side, bows out.
      const fingers = [];
      const berths = [];
      for (let along = 12; along < length - 12 && fingers.length < 48; along += 15) {
        const at = pointAlongPolyline(edge, along);
        const outX = at.dz * inland;
        const outZ = -at.dx * inland;
        if (marina && Math.hypot(at.x - marina.x, at.z - marina.z) > 420) continue;
        if (terrain.shoreDistanceAt(at.x + outX * 26, at.z + outZ * 26) > -18 || terrain.shoreDistanceAt(at.x + outX * 44, at.z + outZ * 44) > -30) continue;
        fingers.push({ ax: at.x, az: at.z, bx: at.x + outX * 22, bz: at.z + outZ * 22, width: 1.8 });
        for (const side of [-1, 1]) {
          berths.push({ x: at.x + outX * 12 + at.dx * side * 3.8, z: at.z + outZ * 12 + at.dz * side * 3.8, heading: headingOfDirection(outX, outZ), dirX: outX, dirZ: outZ, length: 14, width: 5 });
        }
      }
      add('marina', { ring, y, edge, length, apronWidth: 24, fingers, berths, deckHeight: 1.1, surface: 'planks', landmarkId: marina ? marina.id : null });
    }
  }

  // The runway: a straight strip through the wetlands that heads the way the staging streets do.
  {
    const clear = (e) => {
      for (const offset of [-RUNWAY.width / 2 - 4, 0, RUNWAY.width / 2 + 4]) {
        const [x, z] = cityToWorld(e, RUNWAY.n + offset);
        if (terrain.shoreDistanceAt(x, z) < 8 || cover.codeAt(x, z) !== 0) return false;
      }
      return true;
    };
    let best = [0, 0];
    let from = null;
    for (let e = RUNWAY.westE; e <= RUNWAY.eastE + 1; e += 15) {
      if (clear(e)) {
        if (from === null) from = e;
        if (e - from > best[1] - best[0]) best = [from, e];
      } else {
        from = null;
      }
    }
    const [e0, e1] = best;
    if (e1 - e0 >= 300) {
      let sum = 0;
      let samples = 0;
      for (let e = e0; e <= e1; e += 30) {
        sum += terrain.heightAt(...cityToWorld(e, RUNWAY.n));
        samples += 1;
      }
      const y = Math.max(1.4, sum / samples);
      const half = RUNWAY.width / 2;
      const airstrip = landmarkOfKind('airstrip');
      const [cx, cz] = cityToWorld((e0 + e1) / 2, RUNWAY.n);
      add('runway', {
        ring: cityRectangle(e0, RUNWAY.n - half, e1, RUNWAY.n + half), y, line: [...cityToWorld(e0, RUNWAY.n), ...cityToWorld(e1, RUNWAY.n)],
        width: RUNWAY.width, length: e1 - e0, heading: headingOfDirection(-east[0], -east[1]), surface: 'asphalt', landmarkId: airstrip ? airstrip.id : null,
      });
      pads.push({ x: cx, z: cz, frontX: north[0], frontZ: north[1], width: e1 - e0 + 30, depth: RUNWAY.width + RUNWAY.shoulder * 2, y });
      pave(e0, RUNWAY.n - half, e1, RUNWAY.n + half);
    } else {
      diagnostics.push('no clear ground for the runway in Los Pantanos');
    }
  }

  // Plazas and parks are lots; surface car parks are ordinary lots given over to parking bays.
  for (const lot of lots) {
    if (lot.zone === 'plaza' || lot.zone === 'park') {
      add(lot.zone, { ring: lot.ring, y: lot.y, lot: lot.id, landmarkId: lot.landmarkId, surface: lot.zone === 'plaza' ? 'paving_stones' : 'grass' });
      continue;
    }
    const suits = lot.zone === 'retail' || lot.zone === 'industrial' || lot.zone === 'mixed_use' || lot.zone === 'leisure';
    if (!suits || lot.landmarkId || lot.corner || lot.id % 17 !== 5 || lot.width < 22 || lot.depth < 24) continue;
    lot.zone = 'parking';
    lot.floorsMin = 0;
    lot.floorsMax = 0;
    const first = bays.length;
    const rightX = -lot.frontZ;
    const rightZ = lot.frontX;
    const columns = Math.floor((lot.width - 3) / BAY.width);
    const gate = columns >> 1;
    // Pairs of rows that share an aisle, from the street to the back of the lot.
    for (let v = -lot.depth / 2 + 1.2; v + BAY.length * 2 + BAY.aisle <= lot.depth / 2 - 0.8; v += BAY.length * 2 + BAY.aisle + 0.6) {
      for (const [rowV, facing, isFront] of [[v + BAY.length / 2, 1, v < -lot.depth / 2 + 2], [v + BAY.length * 1.5 + BAY.aisle, -1, false]]) {
        for (let column = 0; column < columns; column += 1) {
          // The drive in from the street passes through the first row.
          if (isFront && Math.abs(column - gate) <= 1) continue;
          const u = (column - (columns - 1) / 2) * BAY.width;
          const dirX = lot.frontX * facing;
          const dirZ = lot.frontZ * facing;
          bays.push({
            kind: 'bay', x: lot.x + rightX * u - lot.frontX * rowV, y: lot.y, z: lot.z + rightZ * u - lot.frontZ * rowV,
            heading: headingOfDirection(dirX, dirZ), dirX, dirZ, segment: lot.frontages[0].segment, side: null, along: 0, lot: lot.id,
            length: BAY.length, width: BAY.width,
          });
        }
      }
    }
    add('parking_lot', { ring: lot.ring, y: lot.y, lot: lot.id, firstBay: first, bays: bays.length - first, surface: 'asphalt' });
  }
  return { areas, pads, paths, bays, diagnostics };
}

function centreOf(ring) {
  let x = 0;
  let z = 0;
  for (let i = 0; i < ring.length; i += 2) {
    x += ring[i];
    z += ring[i + 1];
  }
  return [(x * 2) / ring.length, (z * 2) / ring.length];
}

/**
 * @typedef {Object} SpecialArea
 * @property {string} id Kind and number, for example `pier_1`.
 * @property {'promenade'|'pier'|'quay'|'marina'|'runway'|'plaza'|'park'|'parking_lot'} kind
 * @property {number[]} ring Flat world outline [x, z, ...].
 * @property {number} x Centre.
 * @property {number} z
 * @property {number} y Height of its surface (the deck for a pier, the apron for a quay).
 * @property {string} district
 * @property {?string} landmarkId The landmark of the catalog it belongs to, if any.
 * @property {string} surface paving_stones, planks, concrete, asphalt or grass.
 * @property {number[]} [line] Centre line (promenade, pier, runway).
 * @property {number[]} [head] Outline of the wide end of the pier.
 * @property {number[]} [edge] The water's edge of a quay or a marina.
 * @property {number[][]} [craneRails] The two rails of the port's gantry cranes.
 * @property {{ax: number, az: number, bx: number, bz: number, width: number}[]} [fingers] Finger piers of a marina.
 * @property {{x: number, z: number, heading: number, dirX: number, dirZ: number, length: number, width: number}[]} [berths] Where boats lie, bows out.
 * @property {number} [lot] Lot id (plazas, parks, car parks).
 * @property {number} [firstBay] Index of a car park's first bay in `plan.parkingSpots`.
 * @property {number} [bays] Number of bays of a car park.
 */
