// The rules of police crashes, as pure maths (tested in tools/tests/police/crashRules.test.mjs):
// when an impact wrecks a pursuing car (a hard hit on a pole, palm or wall, never a car or the
// ground), what the wreck does (its light bar keeps flashing, burns steady or dies; the crew climbs
// out dazed or stays slumped in the seats; a hard enough crash catches fire through the fleet's
// damage call and burns until the fleet blows it up), a wreck staged by a showcase scene (burns
// and keeps burning, never drives off), the synthetic impact that dents a staged wreck through the
// fleet's own crash path, and when a moving car knocks an officer on foot down.
import { FIRE_BELOW } from '../vehicles/vehicleDamage.js';

/** Closing speed on a fixed obstacle (m/s) that wrecks a pursuing car: about 43 km/h head-on. */
export const WRECK_SPEED = 12;
/** Above this closing speed (m/s, about 60 km/h) a wreck may catch fire. */
export const FIRE_SPEED = 17;
/** Chance that a crash above FIRE_SPEED sets the car burning. */
export const FIRE_CHANCE = 0.45;
/** Share of the maximum health a burning wreck is brought down to (the fleet burns below FIRE_BELOW). */
export const BURNING_HEALTH = FIRE_BELOW * 0.66;
/** A held (staged) burning wreck is topped up to this share so it never explodes. */
export const HELD_BURNING_HEALTH = FIRE_BELOW * 0.4;
/** Seconds before a dazed crew climbs out. */
export const CREW_OUT_DELAY = Object.freeze([1.1, 2.6]);
/** Light bar states of a wreck. */
export const WRECK_LIGHTS = Object.freeze(['flash', 'steady', 'dead']);
/** Slowest car (m/s) that knocks an officer down. */
export const KNOCKDOWN_SPEED = 4;
/** Half the length and width of a car's footprint for a knock-down test, metres (pedestrians agree). */
export const CAR_HALF_LENGTH = 2.3;
export const CAR_HALF_WIDTH = 0.95;

/**
 * Whether an impact wrecks the car that had it.
 * @param {{speed: number, ground?: boolean}} impact VEHICLE_COLLIDED's payload.
 * @param {boolean} otherMoves True when it hit a vehicle or a person (rams and boxes are part of
 *   the job; a person is not a wall).
 * @returns {boolean}
 */
export function isWreckingImpact(impact, otherMoves) {
  return !impact.ground && !otherMoves && impact.speed >= WRECK_SPEED;
}

/**
 * What a crash at this speed leaves behind.
 * @param {number} speed Closing speed, m/s.
 * @param {() => number} roll Random numbers 0..1.
 * @returns {{lights: string, crew: 'out' | 'slumped', burning: boolean, hold: boolean, crewDelay: number}}
 */
export function wreckFor(speed, roll) {
  const lights = roll() < 0.6 ? 'flash' : 'dead';
  const crew = roll() < 0.7 - Math.max(0, speed - WRECK_SPEED) * 0.03 ? 'out' : 'slumped';
  const burning = speed >= FIRE_SPEED && roll() < FIRE_CHANCE;
  const crewDelay = CREW_OUT_DELAY[0] + roll() * (CREW_OUT_DELAY[1] - CREW_OUT_DELAY[0]);
  return { lights, crew, burning, hold: false, crewDelay };
}

/**
 * A wreck staged by a scene (POLICE_SPAWN_UNIT's `wreck`): true takes every default.
 * @param {boolean | {lights?: string, crew?: string, burning?: boolean, hold?: boolean}} options
 * @returns {{lights: string, crew: 'out' | 'slumped', burning: boolean, hold: boolean, crewDelay: number}}
 */
export function stagedWreck(options) {
  const o = options && typeof options === 'object' ? options : {};
  return {
    lights: WRECK_LIGHTS.includes(o.lights) ? o.lights : 'flash',
    crew: o.crew === 'out' ? 'out' : 'slumped',
    burning: o.burning !== false,
    hold: o.hold !== false,
    crewDelay: 0.4,
  };
}

/**
 * Damage that brings a car's health down to the burning share (0 if it is already lower).
 * @param {number} health
 * @param {number} maxHealth
 * @returns {number}
 */
export function burningDamage(health, maxHealth) {
  return Math.max(0, health - BURNING_HEALTH * maxHealth);
}

/**
 * The health a held burning wreck keeps (it never reaches 0, so the fleet never blows it up).
 * @param {number} health
 * @param {number} maxHealth
 * @returns {number}
 */
export function heldBurningHealth(health, maxHealth) {
  return health > 0 ? Math.max(health, HELD_BURNING_HEALTH * maxHealth) : health;
}

/**
 * A VEHICLE_COLLIDED payload for a staged front-end crash into a fixed obstacle, so the fleet dents
 * the bonnet and may drop the bumper the way a real crash would.
 * @param {number} vehicleId
 * @param {{x: number, y: number, z: number}} at The car's position.
 * @param {number} heading three.js rotation.y of the car (its nose points along -Z turned by it).
 * @param {number} mass Kilograms.
 * @param {number} damage Health points the impact should take (the fleet's impactDamage inverted).
 * @returns {{vehicleId: number, otherId: null, speed: number, energy: number, ground: false,
 *   position: {x: number, y: number, z: number}, normal: {x: number, y: number, z: number}}}
 */
export function stagedImpact(vehicleId, at, heading, mass, damage) {
  const fx = -Math.sin(heading);
  const fz = -Math.cos(heading);
  const energy = mass * (Math.max(0, damage) / 4 + 2);
  return {
    vehicleId,
    otherId: null,
    speed: Math.sqrt((2 * energy) / mass),
    energy,
    ground: false,
    position: { x: at.x + fx * 2.1, y: at.y + 0.55, z: at.z + fz * 2.1 },
    normal: { x: fx, y: 0, z: fz },
  };
}

/**
 * Whether a car strikes an officer standing at (dx, dz) from its centre.
 * @param {number} dx Officer minus car, world X.
 * @param {number} dz Officer minus car, world Z.
 * @param {number} heading The car's rotation.y.
 * @param {number} speed The car's speed along its nose, m/s (negative reversing).
 * @returns {boolean}
 */
export function carStrikes(dx, dz, heading, speed) {
  if (Math.abs(speed) < KNOCKDOWN_SPEED) return false;
  const fx = -Math.sin(heading);
  const fz = -Math.cos(heading);
  const ahead = dx * fx + dz * fz;
  const side = dx * -fz + dz * fx;
  return Math.abs(ahead) < CAR_HALF_LENGTH + 0.35 && Math.abs(side) < CAR_HALF_WIDTH + 0.35 && ahead * speed > 0;
}

/**
 * Health a car strike takes from an officer: bruising at a crawl, lethal above about 55 km/h.
 * @param {number} speed m/s.
 * @returns {number}
 */
export function strikeDamage(speed) {
  return Math.round(speed * speed * 0.45);
}
