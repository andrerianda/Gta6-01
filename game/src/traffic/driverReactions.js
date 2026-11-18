// What traffic drivers do when the street stops being ordinary: lean on the horn when the
// player stands or parks in their way, swerve around something in the lane, flee from gunfire
// and explosions (faster, through red lights, honking), and get angry when rammed (they stop,
// honk, and some climb out to confront the player: a hook the pedestrians and combat systems
// pick up). Sirens and pursuits are sirenGiveWay.js. Each driver keeps a small state object;
// nothing here allocates per step. Pure apart from the hook callback.

/** Seconds of fleeing after a shot or a blast nearby. */
export const FLEE_SECONDS = 14;

/**
 * A driver's temperament and reaction state (one per traffic car, reused from a pool).
 * @param {() => number} random 0..1.
 * @param {object} [into] An object to reset instead of a new one.
 */
export function createDriverMood(random, into = {}) {
  into.temper = 0.88 + random() * 0.2;
  into.eagerness = 0.42 + random() * 0.3;
  into.patience = 1 + random() * 2.5;
  into.bravery = random();
  into.fleeSeconds = 0;
  into.angrySeconds = 0;
  into.hornSeconds = 0;
  into.blockedSeconds = 0;
  into.swerve = 0;
  into.gotOut = false;
  return into;
}

/**
 * A shot or a blast at a distance: drivers close to it flee.
 * @param {object} mood createDriverMood state.
 * @param {number} distance Metres to the danger.
 * @param {number} radius Metres within which drivers react.
 */
export function hearDanger(mood, distance, radius) {
  if (distance > radius) return;
  mood.fleeSeconds = Math.max(mood.fleeSeconds, FLEE_SECONDS * (0.6 + 0.4 * (1 - distance / radius)));
  mood.hornSeconds = Math.max(mood.hornSeconds, 0.8);
}

/**
 * The car was hit by another vehicle.
 * @param {object} mood
 * @param {number} impactSpeed m/s.
 * @param {boolean} byPlayer Whether the player drove the other car.
 * @param {() => number} random 0..1.
 * @returns {boolean} True when the driver climbs out to confront the player.
 */
export function feelRammed(mood, impactSpeed, byPlayer, random) {
  if (impactSpeed < 2.5) return false;
  mood.angrySeconds = Math.max(mood.angrySeconds, 4 + impactSpeed * 0.5);
  mood.hornSeconds = Math.max(mood.hornSeconds, 1.6);
  if (!byPlayer || mood.gotOut || impactSpeed < 4) return false;
  // The brave get out and shout; the rest flee once the anger passes.
  if (mood.bravery > 0.55 && random() < 0.6) {
    mood.gotOut = true;
    return true;
  }
  mood.fleeSeconds = Math.max(mood.fleeSeconds, FLEE_SECONDS * 0.6);
  return false;
}

/**
 * Time passes for a driver: counters run down; the horn sounds in bursts while blocked by the player.
 * @param {object} mood
 * @param {number} dt Seconds.
 * @param {boolean} blockedByPlayer Whether the player is what stops the car.
 * @param {number} time Simulation time, for the honking rhythm.
 * @returns {boolean} Whether the horn sounds now.
 */
export function updateDriverMood(mood, dt, blockedByPlayer, time) {
  if (mood.fleeSeconds > 0) mood.fleeSeconds -= dt;
  if (mood.angrySeconds > 0) mood.angrySeconds -= dt;
  if (mood.hornSeconds > 0) mood.hornSeconds -= dt;
  mood.blockedSeconds = blockedByPlayer ? mood.blockedSeconds + dt : 0;
  if (mood.hornSeconds > 0) return true;
  if (mood.blockedSeconds > mood.patience) {
    // Honk-honk ... honk-honk: two short blasts every two seconds, longer when angry.
    const beat = (time + mood.patience) % 2;
    return beat < 0.18 || (beat > 0.32 && beat < (mood.angrySeconds > 0 ? 1.1 : 0.5));
  }
  return false;
}

/**
 * How the mood changes the drive: speed factor, whether red lights still count, sideways offset.
 * @param {object} mood
 * @returns {{speedFactor: number, obeysSignals: boolean, holds: boolean, offset: number}} Shared object; copy what you need.
 */
export function moodDriving(mood) {
  const out = moodDriving.out;
  out.speedFactor = 1;
  out.obeysSignals = true;
  out.holds = false;
  out.offset = mood.swerve;
  if (mood.fleeSeconds > 0) {
    out.speedFactor = 1.45;
    out.obeysSignals = false;
  } else if (mood.angrySeconds > 0 && mood.gotOut) {
    out.holds = true;
  }
  return out;
}
moodDriving.out = { speedFactor: 1, obeysSignals: true, holds: false, offset: 0 };
