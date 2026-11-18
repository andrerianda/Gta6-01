// Parked cars along the kerbs and in the car parks of the city plan (plan.parkingSpots). Each
// spot is taken or free by a fixed roll of its id, with a model from the district's traffic mix
// and a catalog colour, so a street looks the same when the player comes back. Near the player
// (PARKING_RING.near) a taken spot holds a real parked car of the vehicle fleet (solid, can be
// stolen); farther out, to PARKING_RING.far, it is one more instance in the distant traffic's
// batches. Now and then a parked car near the player pulls out into the lane beside it and
// joins the traffic; its spot stays free from then on. The real cars go to the nearest spots; a
// taken spot beyond the cap on real cars is drawn as an instance, so near the player a kerb is
// never left empty and then filled: a spot that showed nothing may show its car only out of the
// camera's view or more than WATCHED_DISTANCE from it (a cut excepted), and a car leaves only by
// driving off or being taken. Bays of a landmark's car park (the rail yard's lorry bays) prefer
// that landmark's vehicles (LOT_KIND_MODELS and the catalog's parkedAtKinds).
import * as THREE from 'three';
import { ENTITY_KINDS, ENTITY_TAGS } from '../core/entities/entityKinds.js';
import { pointAlongPolyline } from './laneRoute.js';
import { outOfSight } from './trafficSpawning.js';

/** Metres from the player: real parked cars inside `near` (removed beyond `release`), drawn instances out to `far`. */
export const PARKING_RING = Object.freeze({ near: 65, release: 85, far: 140 });
/** Share of spots with a car in them. */
export const PARKING_OCCUPANCY = 0.58;
/** Metres from the camera within which a spot in view must not fill or empty. */
export const WATCHED_DISTANCE = 60;
/** A real car farther than the nearest spot without one by this many metres hands its place over. */
const HAND_OVER_MARGIN = 15;
/** Vehicles that park in the bays of a landmark's car park, besides the catalog's parkedAtKinds. */
export const LOT_KIND_MODELS = Object.freeze({ train_yard: Object.freeze(['box_truck', 'cargo_van', 'pickup_truck']) });
/** Share of a landmark's bays that hold one of its own vehicles (the rest: the district's mix). */
export const LOT_KIND_SHARE = 0.85;

/**
 * Whether a taken spot that showed nothing last time may show its car now: at a cut always,
 * in play only out of the camera's view or farther than WATCHED_DISTANCE from it.
 * @param {boolean} wasShown It showed its car (real or drawn) last time.
 * @param {boolean} filling Filling the city after a cut.
 * @param {number} x
 * @param {number} z
 * @param {{x: number, z: number, forwardX: number, forwardZ: number, cosHalfView: number} | null} eye
 */
export function mayAppear(wasShown, filling, x, z, eye) {
  return wasShown || filling || !eye || outOfSight(x, z, eye, WATCHED_DISTANCE);
}

/**
 * The vehicles that park at a kind of landmark: LOT_KIND_MODELS plus every catalog entry whose
 * spawn.parkedAtKinds names it, limited to built models.
 * @param {string} kind A landmark kind ('train_yard').
 * @param {Record<string, {spawn?: {parked?: boolean, parkedAtKinds?: string[]}}>} catalog VEHICLE_CATALOG.
 * @param {(id: string) => boolean} isBuilt
 * @returns {string[]}
 */
export function lotKindModels(kind, catalog, isBuilt) {
  const ids = new Set(LOT_KIND_MODELS[kind] ?? []);
  for (const [id, entry] of Object.entries(catalog)) {
    if (entry?.spawn?.parked && entry.spawn.traffic && entry.spawn.parkedAtKinds?.includes(kind)) ids.add(id);
  }
  return [...ids].filter((id) => catalog[id] && isBuilt(id));
}

/**
 * A bay's model from its landmark's vehicles, or null (LOT_KIND_SHARE of rolls pick one).
 * @param {string[]} models From lotKindModels.
 * @param {number} roll 0..1.
 */
export function pickBayModel(models, roll) {
  if (!models.length || roll >= LOT_KIND_SHARE) return null;
  return models[Math.min(models.length - 1, Math.floor((roll / LOT_KIND_SHARE) * models.length))];
}
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
  // Spots that showed their car last time and this time (swapped each pass), and the taken
  // spots in range sorted nearest first (pooled entries).
  let shown = new Set();
  let shownNow = new Set();
  const entries = [];
  let entryCount = 0;
  let filling = true;
  const byDistance = (a, b) => a.distance - b.distance;
  const kindModels = new Map();
  const isBuilt = (id) => Boolean(context.assets?.has?.(id));

  function bayModels(spot) {
    if (spot.lot === undefined || spot.kind === 'kerb') return [];
    const kind = city.plan.lots?.[spot.lot]?.landmarkKind;
    if (!kind) return [];
    if (!kindModels.has(kind)) kindModels.set(kind, lotKindModels(kind, catalog, isBuilt));
    return kindModels.get(kind);
  }

  function carOf(spot) {
    if (cars.has(spot.id)) return cars.get(spot.id);
    let car = null;
    if (spotRoll(spot.id, seed) < PARKING_OCCUPANCY) {
      const modelId = pickBayModel(bayModels(spot), spotRoll(spot.id, seed + 3)) ?? drivers.pickModel(spot.x, spot.z, spotRoll(spot.id, seed + 1));
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
    // The taken spots in range, nearest first.
    entryCount = 0;
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
          if (vacated.has(spot.id)) continue;
          const distance = Math.hypot(spot.x - centre.x, spot.z - centre.z);
          if (distance > far || !carOf(spot)) continue;
          if (entryCount === entries.length) entries.push({ spot: null, distance: 0 });
          const entry = entries[entryCount];
          entryCount += 1;
          entry.spot = spot;
          entry.distance = distance;
        }
      }
    }
    for (let i = entryCount; i < entries.length; i += 1) entries[i].distance = Infinity;
    entries.sort(byDistance);
    handOver();
    const eye = drivers.eye ?? null;
    const cap = capacity();
    drawn.length = 0;
    shownNow.clear();
    for (let i = 0; i < entryCount; i += 1) {
      const { spot, distance } = entries[i];
      if (real.has(spot.id)) {
        shownNow.add(spot.id);
        continue;
      }
      const car = cars.get(spot.id);
      const wasShown = shown.has(spot.id);
      // Something stands in the spot (the player's car, a car pulled in): a car shown there stays
      // drawn; one not shown yet waits, and gives the spot up if the camera is looking at it.
      const near = distance < PARKING_RING.near;
      if (near && context.entities.countWithin(spot.x, spot.z, 2.2, vehicleFilter) > 0) {
        if (wasShown) {
          drawn.push(spot);
          shownNow.add(spot.id);
        } else if (!mayAppear(false, filling, spot.x, spot.z, eye)) vacated.add(spot.id);
        continue;
      }
      if (!mayAppear(wasShown, filling, spot.x, spot.z, eye)) continue;
      shownNow.add(spot.id);
      if (near && real.size < cap) {
        const vehicleId = fleet.spawn({
          modelId: car.modelId, position: { x: spot.x, y: spot.y, z: spot.z }, heading: spot.heading,
          colour: car.colourText, parked: true, ownerSystem: 'traffic',
        });
        if (vehicleId !== null && vehicleId !== undefined) {
          real.set(spot.id, vehicleId);
          continue;
        }
      }
      drawn.push(spot);
    }
    const last = shown;
    shown = shownNow;
    shownNow = last;
    filling = false;
    stats.real = real.size;
    stats.drawn = drawn.length;
  }

  // With the cap used up, the farthest real cars give their place to nearer spots that have none
  // (a real car becomes the drawn instance of the same model and colour where it stands).
  function handOver() {
    let swaps = 2;
    for (let i = 0; i < entryCount && swaps > 0 && real.size >= capacity(); i += 1) {
      const { spot, distance } = entries[i];
      if (distance >= PARKING_RING.near) break;
      if (real.has(spot.id)) continue;
      let farthestId = -1;
      let farthest = distance + HAND_OVER_MARGIN;
      for (const spotId of real.keys()) {
        const other = spots[spotId];
        const d = Math.hypot(other.x - drivers.centre.x, other.z - drivers.centre.z);
        if (d > farthest) {
          farthest = d;
          farthestId = spotId;
        }
      }
      if (farthestId < 0) break;
      fleet.remove(real.get(farthestId));
      real.delete(farthestId);
      swaps -= 1;
    }
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
    /** The spots drawn as instances now (for probes). */
    get drawnSpots() {
      return drawn;
    },

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

    /**
     * After a cut (or a quality change): look again at once, filling every spot. The real cars
     * stay (those left far behind are put away by the next pass; removing them all here made
     * the near ones blink out and back on a quality change).
     */
    refill() {
      shown.clear();
      filling = true;
      manageTimer = 0;
    },

    dispose() {
      for (const vehicleId of real.values()) fleet.remove(vehicleId);
      real.clear();
    },
  };
}
