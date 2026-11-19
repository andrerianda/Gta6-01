// A bench for the flight tests: a real PhysicsWorld over flat ground at sea level, an aircraft of
// the vehicle catalog in it, and helpers that fly it step by step with a scripted pilot.
import { VEHICLE_CATALOG } from '../../../game/src/catalog/vehicleCatalog.js';
import { PhysicsWorld } from '../../../game/src/physics/PhysicsWorld.js';
import { Airplane, deriveAirplaneTuning } from '../../../game/src/physics/aircraft/Airplane.js';

/** The four aircraft of the flight phase. */
export const AIRCRAFT_IDS = ['gaviota_t2', 'manta_sombra', 'garza_negra', 'halcon'];

/** Knots per metre per second. */
export const KNOTS = 1.943844;

/**
 * An aircraft in a fresh flat world.
 * @param {string} id A catalog id.
 * @param {{y?: number, speed?: number, heading?: number, mode?: 'casual' | 'realistic', wind?: {x: number, z: number}}} [options]
 *   Without `y` it stands on the runway with the engine running and the brakes off.
 * @returns {{world: PhysicsWorld, plane: Airplane, tuning: object}}
 */
export function createFlightBench(id, options = {}) {
  const world = new PhysicsWorld({});
  if (options.wind) world.wind = options.wind;
  const tuning = deriveAirplaneTuning(VEHICLE_CATALOG[id]);
  const plane = new Airplane(world, tuning, { x: 0, y: options.y, z: 0, heading: options.heading ?? 0, speed: options.speed });
  plane.mode = options.mode ?? 'realistic';
  plane.engineOn = true;
  return { world, plane, tuning };
}

/**
 * Steps the world for some seconds; `pilot(plane, time, dt)` runs before each step and may return
 * true to stop early.
 * @returns {number} Seconds flown.
 */
export function fly(bench, seconds, pilot) {
  const dt = bench.world.fixedStep;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i += 1) {
    if (pilot && pilot(bench.plane, i * dt, dt) === true) return i * dt;
    bench.world.step();
  }
  return seconds;
}

/** The model origin's world position (x, y, z). */
export function positionOf(plane) {
  return plane.body.modelPosition({ x: 0, y: 0, z: 0 });
}

/**
 * A takeoff from standing: full throttle (flaps at `notch`), stick back from rotate speed until
 * the wheels leave, then a gentle climb. Returns the ground roll and the lift-off speed.
 */
export function takeOff(bench, notch = 0) {
  const { plane, tuning } = bench;
  plane.setFlaps(notch);
  plane.input.throttle = 1;
  let roll = null;
  let liftOffSpeed = 0;
  let wasOnGround = true;
  const seconds = fly(bench, 90, (p) => {
    const s = p.state;
    p.input.pitch = s.indicatedAirspeed >= tuning.rotateSpeed ? (s.onGround ? 0.75 : 0.25) : 0;
    if (wasOnGround && !s.onGround && s.radarAltitude > 0.3 && s.airspeed > 10) {
      wasOnGround = false;
      roll = Math.hypot(positionOf(p).x, positionOf(p).z);
      liftOffSpeed = s.indicatedAirspeed;
    }
    return roll !== null && s.radarAltitude > 15;
  });
  return { roll, liftOffSpeed, seconds };
}
