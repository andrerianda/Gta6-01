// A small stand-in world for the traffic tests: the real city plan, the real entity registry and
// a vehicle fleet of kinematic cars (a bicycle model with the physics' steering lock, simple
// engine and brakes) driven by the same controls the real fleet reads.

import { CITY_DISTRICTS } from '../../../game/src/catalog/cityDistricts.js';
import { VEHICLE_CATALOG } from '../../../game/src/catalog/vehicleCatalog.js';
import { createEntityRegistry } from '../../../game/src/core/entities/entityRegistry.js';
import { createSeededRandom } from '../../../game/src/core/random/seededRandom.js';
import { generateCityPlan } from '../../../game/src/world/plan/cityPlanGenerator.js';
import { steeringLockAt } from '../../../game/src/traffic/laneFollowing.js';

let cachedPlan = null;
/** The default city plan, built once per test file. */
export function testPlan() {
  cachedPlan ??= generateCityPlan(createSeededRandom('marazul'));
  return cachedPlan;
}

/** Kinematic stand-in for a physics car. */
export class KinematicCar {
  constructor(x, z, heading) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.steerAngle = 0;
    this.tuning = { wheelbase: 2.7, grip: 0.95, maxSteer: 0.6 };
  }

  step(controls, dt) {
    const lock = steeringLockAt(this.tuning, this.speed);
    const wanted = controls.steer * lock;
    const rate = 3.2 * dt;
    this.steerAngle += Math.max(-rate, Math.min(rate, wanted - this.steerAngle));
    let accel = controls.throttle * 4.5 - 0.15 - this.speed * this.speed * 0.0012;
    if (controls.brake > 0) accel = -controls.brake * 8;
    this.speed = Math.max(0, this.speed + accel * dt);
    this.heading += (this.speed / this.tuning.wheelbase) * Math.tan(this.steerAngle) * dt;
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z -= Math.cos(this.heading) * this.speed * dt;
  }
}

/**
 * A game context with a kinematic fleet, centred on a point of the city.
 * @param {{x: number, z: number}} centre Where the player stands.
 * @param {{maxVehicles?: number, trafficDensity?: number}} [tier]
 */
export function createTestWorld(centre, tier = { maxVehicles: 44, trafficDensity: 0.8 }) {
  const plan = testPlan();
  const entities = createEntityRegistry();
  const records = new Map();
  const events = [];
  const fleet = {
    spawn({ modelId, position, heading }) {
      const car = new KinematicCar(position.x, position.z, heading);
      const entity = entities.add({
        kind: 'vehicle', owner: 'vehicles', position: { x: position.x, y: 0, z: position.z }, heading: -heading, radius: 2.4, tags: [],
        data: { modelId, speed: 0, driverId: null },
      });
      const controls = { throttle: 0, brake: 0, steer: 0, handbrake: 0, reverse: false, autoReverse: false, horn: false, headlights: null };
      records.set(entity.id, { id: entity.id, entity, car, controls, entry: VEHICLE_CATALOG[modelId], wrecked: false });
      return entity.id;
    },
    remove(id) {
      const record = records.get(id);
      if (!record) return false;
      entities.remove(record.entity);
      records.delete(id);
      return true;
    },
    get: (id) => records.get(id) ?? null,
  };
  const context = {
    content: { get: (name) => (name === 'vehicleCatalog' ? { VEHICLE_CATALOG } : { CITY_DISTRICTS }) },
    random: (label) => createSeededRandom(`test:${label}`),
    entities,
    focus: { position: { x: centre.x, y: 0, z: centre.z } },
    simulation: { time: 0 },
    quality: { tier },
    assets: { has: (id) => ['sports_coupe', 'family_sedan', 'police_cruiser'].includes(id) },
    clock: { timeOfDay: 18.8 },
    events: { queue: (topic, payload) => events.push({ topic, payload }), emit() {} },
    view: null,
  };
  const city = {
    plan,
    laneGraph: plan.lanes,
    nearestLane: plan.nearestLane,
    districtAt: plan.districtAt,
  };
  /** Steps the cars by their controls and re-files the entity grid, as the engine does. */
  function stepCars(dt) {
    for (const record of records.values()) {
      record.car.step(record.controls, dt);
      record.entity.position.x = record.car.x;
      record.entity.position.z = record.car.z;
      record.entity.heading = -record.car.heading;
      record.entity.data.speed = record.car.speed;
    }
    entities.refreshAll();
    context.simulation.time += dt;
  }
  return { plan, context, city, fleet, records, entities, events, stepCars };
}
