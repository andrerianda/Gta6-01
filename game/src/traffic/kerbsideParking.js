// Parked cars along the kerbs and in the car parks of the city plan (plan.parkingSpots). Each
// spot is taken or free by a fixed roll of its id, with a model from the district's traffic mix
// and a catalog colour, so a street looks the same when the player comes back. Near the player
// (PARKING_RING.near) a taken spot holds a real parked car of the vehicle fleet (solid, can be
// stolen); farther out, to PARKING_RING.far, it is one more instance in the distant traffic's
// batches. Now and then a parked car near the player pulls out into the lane beside it and
// joins the traffic; its spot stays free from then on.
import * as THREE from 'three';
import { ENTITY_KINDS, ENTITY_TAGS } from '../core/entities/entityKinds.js';
import { pointAlongPolyline } from './laneRoute.js';

/** Metres from the player: real parked cars inside `near` (removed beyond `release`), drawn instances out to `far`. */
export const PARKING_RING = Object.freeze({ near: 65, release: 85, far: 140 });
/** Share of spots with a car in them. */
export const PARKING_OCCUPANCY = 0.58;
const CELL = 64;
const MANAGE_SECONDS = 0.5;
const vehicleFilter = { kind: ENTITY_KINDS.VEHICLE };
const movingFilter = { kind: ENTITY_KINDS.VEHICLE, withoutTag: ENTITY_TAGS.PARKED };
const lanePoint = { x: 0, z: 0, dx: 0, dz: -1 };

/**
 * Whether a parked car may pull out into a lane at `along`: nothing moving on the lane from 30 m
 * behind that point (cars coming up) to 6 m past it. The parked row beside the lane does not
 * count (the old test counted any car near a point behind the spot, so a car in a row never left).
 * @param {number[]} points The lane's polyline (x, z pairs).
 * @param {number} along Metres along it where the car joins.
 * @param {(x: number, z: number, radius: number) => number} countMoving Moving vehicles within a radius.
 * @returns {boolean}
 */
export function pullOutClear(points, along, countMoving) {
  for (let s = along - 30; s <= along + 6; s += 6) {
    pointAlongPolyline(points, Math.max(0, s), lanePoint);
    if (countMoving(lanePoint.x, lanePoint.z, 4) > 0) return false;
  }
  return true;
}

/** A fixed roll 0..1 for a spot id and a salt. */
export function spotRoll(id, salt) {
  let h = Math.imul(id + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 0x27d4eb2f, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/**
 * Creates the kerbside parking.
 * @param {object} context The game context.
 * @param {{city: object, drivers: object, fleet: object}} parts openWorldCity, the traffic drivers, the vehicle fleet.
 */
export function createKerbsideParking(context, { city, drivers, fleet }) {
  const spots = city.plan.parkingSpots ?? [];
  const lanes = city.laneGraph;
  const catalog = context.content.get('vehicleCatalog').VEHICLE_CATALOG;
  const seed = Number(context.seed ?? 1) | 0;
  const cells = new Map();
  for (const spot of spots) {
    const key = (Math.floor(spot.x / CELL) + 4096) * 8192 + (Math.floor(spot.z / CELL) + 4096);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(spot);
  }
  const cars = new Map();
  const vacated = new Set();
  const real = new Map();
  const drawn = [];
  let manageTimer = 0;
  let pullOutTimer = 4;
  const stats = { real: 0, drawn: 0, pulledOut: 0 };
  const countMoving = (x, z, radius) => context.entities.countWithin(x, z, radius, movingFilter);

  function carOf(spot) {
    if (cars.has(spot.id)) return cars.get(spot.id);
    let car = null;
    if (spotRoll(spot.id, seed) < PARKING_OCCUPANCY) {
      const modelId = drivers.pickModel(spot.x, spot.z, spotRoll(spot.id, seed + 1));
      const colours = modelId ? catalog[modelId]?.colors : null;
      if (modelId) {
        const colour = colours?.length ? colours[Math.floor(spotRoll(spot.id, seed + 2) * colours.length) % colours.length] : '#c8ccd0';
        car = { modelId, colourText: colour, colour: new THREE.Color(colour), heading: spot.heading };
      }
    }
    cars.set(spot.id, car);
    return car;
  }

  function capacity() {
    return Math.round((context.quality?.tier?.maxVehicles ?? 60) * 0.15);
  }

  function manage() {
    const centre = drivers.centre;
    // Real cars that drove off, were taken or destroyed free their spot; far ones are put away.
    for (const [spotId, vehicleId] of real) {
      const record = fleet.get(vehicleId);
      const spot = spots[spotId];
      const entity = record?.entity;
      const moved = !entity || Math.hypot(entity.position.x - spot.x, entity.position.z - spot.z) > 1.5
        || !entity.tags.has(ENTITY_TAGS.PARKED) || entity.data.driverId !== null || record.wrecked;
      if (moved) {
        vacated.add(spotId);
        real.delete(spotId);
      } else if (Math.hypot(spot.x - centre.x, spot.z - centre.z) > PARKING_RING.release) {
        fleet.remove(vehicleId);
        real.delete(spotId);
      }
    }
    drawn.length = 0;
    const far = PARKING_RING.far;
    const x0 = Math.floor((centre.x - far) / CELL);
    const x1 = Math.floor((centre.x + far) / CELL);
    const z0 = Math.floor((centre.z - far) / CELL);
    const z1 = Math.floor((centre.z + far) / CELL);
    for (let cx = x0; cx <= x1; cx += 1) {
      for (let cz = z0; cz <= z1; cz += 1) {
        const list = cells.get((cx + 4096) * 8192 + (cz + 4096));
        if (!list) continue;
        for (const spot of list) {
          if (vacated.has(spot.id) || real.has(spot.id)) continue;
          const distance = Math.hypot(spot.x - centre.x, spot.z - centre.z);
          if (distance > far) continue;
          const car = carOf(spot);
          if (!car) continue;
          if (distance < PARKING_RING.near && real.size < capacity()
            && context.entities.countWithin(spot.x, spot.z, 2.2, vehicleFilter) === 0) {
            const vehicleId = fleet.spawn({
              modelId: car.modelId, position: { x: spot.x, y: spot.y, z: spot.z }, heading: spot.heading,
              colour: car.colourText, parked: true, ownerSystem: 'traffic',
            });
            if (vehicleId !== null && vehicleId !== undefined) {
              real.set(spot.id, vehicleId);
              continue;
            }
          }
          if (distance >= PARKING_RING.near * 0.6) drawn.push(spot);
        }
      }
    }
    stats.real = real.size;
    stats.drawn = drawn.length;
  }

  // One parked car near the player, beside a lane going its way, pulls out.
  function pullOutOne() {
    const centre = drivers.centre;
    for (const [spotId, vehicleId] of real) {
      const spot = spots[spotId];
      const distance = Math.hypot(spot.x - centre.x, spot.z - centre.z);
      if (distance < 18 || spotRoll(spotId, seed + Math.floor(context.simulation.time)) > 0.25) continue;
      const hit = city.nearestLane(spot.x, spot.z, 9);
      const lane = hit ? lanes[hit.lane.id ?? hit.lane] : null;
      if (!lane || hit.along > lane.length - 14) continue;
      const dx = lane.points[2] - lane.points[0];
      const dz = lane.points[3] - lane.points[1];
      const facing = (Math.sin(spot.heading) * dx - Math.cos(spot.heading) * dz) / (Math.hypot(dx, dz) || 1);
      if (facing < 0.8) continue;
      const along = Math.min(hit.along + 5, lane.length - 2);
      if (!pullOutClear(lane.points, along, countMoving)) continue;
      if (drivers.pullOut(vehicleId, lane.id, along)) {
        real.delete(spotId);
        vacated.add(spotId);
        stats.pulledOut += 1;
        return;
      }
    }
  }

  return {
    stats,

    fixedUpdate(dt) {
      manageTimer -= dt;
      if (manageTimer <= 0) {
        manageTimer = MANAGE_SECONDS;
        manage();
      }
      pullOutTimer -= dt;
      if (pullOutTimer <= 0) {
        pullOutTimer = 5 + spotRoll(Math.floor(context.simulation.time), seed) * 7;
        pullOutOne();
      }
    },

    /** Adds the drawn parked cars to this frame's batches. */
    draw(batches) {
      for (const spot of drawn) {
        const car = cars.get(spot.id);
        if (car) batches.add(car.modelId, spot.x, spot.y, spot.z, car.heading, car.colour);
      }
    },

    /** After a cut: put the real cars away and look again at once. */
    refill() {
      for (const vehicleId of real.values()) fleet.remove(vehicleId);
      real.clear();
      manageTimer = 0;
    },

    dispose() {
      for (const vehicleId of real.values()) fleet.remove(vehicleId);
      real.clear();
    },
  };
}
