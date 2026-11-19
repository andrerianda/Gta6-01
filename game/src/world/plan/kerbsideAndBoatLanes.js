// Where parked cars stand and where boats sail. Kerbside parking spots line every road that has
// a parking lane, each with the heading a parked car faces; boat lanes follow the coast about a
// hundred metres off shore, circle the island and run up the river.
//
//   const spots = buildKerbsideParking(plan.roads);       // [{id, x, y, z, heading, segment, side, along}]
//   const boatLanes = buildBoatLanes(plan.coast, plan.terrain);   // [{id, kind, points, length, closed}]

import { CITY_FRAME } from './cityFrame.js';
import { headingOfDirection, pointAlongPolyline, polylineLength } from './planGeometry.js';
import { roadHeightAlong } from './terrainConforming.js';

const BAY_LENGTH = 6.4;
const CLEAR_OF_JUNCTION = 7;
const OFF_SHORE = 110;

/**
 * Lays parking spots along the parking lanes of every road.
 * @param {{segments: import('./roadGraphAssembly.js').RoadSegment[]}} roads The designed road graph.
 * @returns {ParkingSpot[]}
 */
export function buildKerbsideParking(roads) {
  const spots = [];
  for (const segment of roads.segments) {
    const from = segment.trimA + CLEAR_OF_JUNCTION;
    const to = segment.length - segment.trimB - CLEAR_OF_JUNCTION;
    const count = Math.floor((to - from) / BAY_LENGTH);
    if (count < 1) continue;
    const first = from + (to - from - count * BAY_LENGTH) / 2 + BAY_LENGTH / 2;
    for (const side of ['right', 'left']) {
      const width = side === 'right' ? segment.parkingRight : segment.parkingLeft;
      if (!(width > 0)) continue;
      const offset = (segment.halfWidth - segment.shoulder - width / 2) * (side === 'right' ? 1 : -1);
      // Cars face the way the traffic next to them drives.
      const facing = side === 'right' || segment.lanesBackward === 0 ? 1 : -1;
      for (let k = 0; k < count; k += 1) {
        const along = first + k * BAY_LENGTH;
        const at = pointAlongPolyline(segment.points, along);
        spots.push({
          id: spots.length, kind: 'kerb', x: at.x - at.dz * offset, y: roadHeightAlong(segment, along), z: at.z + at.dx * offset,
          heading: headingOfDirection(at.dx * facing, at.dz * facing), dirX: at.dx * facing, dirZ: at.dz * facing,
          segment: segment.id, side, along, length: BAY_LENGTH - 0.8, width,
        });
      }
    }
  }
  return spots;
}

/**
 * Traces the boat lanes: one along each stretch of sea shore, one round the island and one up
 * each river. Boats sail both ways and keep to the right of the line.
 * @param {import('./coastlineShapes.js').CoastlineShapes} coast
 * @param {import('./terrainHeightField.js').TerrainHeightField} terrain
 * @returns {BoatLane[]}
 */
export function buildBoatLanes(coast, terrain) {
  const lanes = [];
  const add = (kind, points, closed) => {
    if (points.length < 8) return;
    lanes.push({ id: lanes.length, kind, points, length: polylineLength(points), closed, width: 36, speedLimit: kind === 'river' ? 7 : 14 });
  };
  const { minX, maxX, minZ, maxZ } = CITY_FRAME.extent;
  const inside = (x, z) => x > minX + 60 && x < maxX - 60 && z > minZ + 60 && z < maxZ - 60;
  const shore = terrain.shoreDistanceAt;
  // Walks from a shore point down the distance field until it is well off shore.
  const offShore = (x, z) => {
    for (let step = 0; step < 24; step += 1) {
      if (shore(x, z) <= -OFF_SHORE) return inside(x, z) ? [x, z] : null;
      const gx = shore(x + 8, z) - shore(x - 8, z);
      const gz = shore(x, z + 8) - shore(x, z - 8);
      const length = Math.hypot(gx, gz);
      if (length < 1e-6) return null;
      x -= (gx / length) * 14;
      z -= (gz / length) * 14;
    }
    return null;
  };
  coast.landRings.forEach((land, ringIndex) => {
    const { ring } = land;
    const count = ring.length / 2;
    let run = [];
    const runs = [];
    const close = () => {
      if (run.length >= 8) runs.push(run);
      run = [];
    };
    for (let i = 0; i <= count; i += 1) {
      const point = offShore(ring[(i % count) * 2], ring[(i % count) * 2 + 1]);
      if (!point) {
        close();
        continue;
      }
      if (run.length >= 2) {
        const lastX = run[run.length - 2];
        const lastZ = run[run.length - 1];
        const gap = Math.hypot(point[0] - lastX, point[1] - lastZ);
        if (gap < 70) continue;
        if (gap > 420 || shore((point[0] + lastX) / 2, (point[1] + lastZ) / 2) > -40) close();
      }
      run.push(point[0], point[1]);
    }
    close();
    // A ring that never broke is a loop round its land.
    for (const points of runs) {
      const loop = runs.length === 1 && Math.hypot(points[0] - points[points.length - 2], points[1] - points[points.length - 1]) < 420;
      if (loop) points.push(points[0], points[1]);
      add(ringIndex === 0 ? 'coastal' : 'island', points, loop);
    }
  });
  for (const carve of coast.carves) {
    if (carve.kind !== 'river') continue;
    const points = [];
    for (let i = 0; i < carve.points.length; i += 2) {
      if (inside(carve.points[i], carve.points[i + 1]) && shore(carve.points[i], carve.points[i + 1]) < -12) points.push(carve.points[i], carve.points[i + 1]);
    }
    add('river', points, false);
  }
  return lanes;
}

/**
 * @typedef {Object} ParkingSpot
 * @property {number} id Index in the list.
 * @property {'kerb'} kind
 * @property {number} x Centre of the spot.
 * @property {number} y Road height there.
 * @property {number} z
 * @property {number} heading Compass heading a parked car faces: 0 north (-Z), a quarter turn east (+X).
 * @property {number} dirX The same as a unit direction.
 * @property {number} dirZ
 * @property {number} segment Road segment id.
 * @property {'left'|'right'} side Side of the segment.
 * @property {number} along Metres along the segment.
 * @property {number} length Room for the car.
 * @property {number} width Width of the parking lane.
 */

/**
 * @typedef {Object} BoatLane
 * @property {number} id
 * @property {'coastal'|'island'|'river'} kind
 * @property {number[]} points Flat [x, z, ...] over open water.
 * @property {number} length
 * @property {boolean} closed Whether the last point is the first again.
 * @property {number} width Clear water either side of the line, in all.
 * @property {number} speedLimit Metres per second.
 */
