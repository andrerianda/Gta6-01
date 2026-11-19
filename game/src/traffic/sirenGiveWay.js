// How Marazul's traffic gives way to sirens and keeps out of a chase. Every fixed step the drivers
// gather the vehicles tagged `emergency` whose siren runs (data.siren not false) and, while the
// lead has stars, the lead's own car, into one flat list. Each driver looks at that list when it
// perceives (a third of the cars per step) and decides:
// - pull over: a siren coming up behind on the same road, oncoming ahead, or crossing close by.
//   The driver signals right, slows, moves into the kerb lane when it is not in it yet (the
//   lane changer does the move), eases to the kerb and stops; once the siren has passed it
//   waits a moment, signals left, eases back into its lane and drives on;
// - scatter: a pursuit (a fast police car, or the wanted lead's car) bearing down on the car's
//   place: brake hard and swerve away from its path until it has gone through.
// Pure numbers: no entities, no allocation per step; tested in Node (tools/tests/traffic/).

/** Tuning of giving way. */
export const SIREN_GIVE_WAY = Object.freeze({
  /** Metres within which a siren is heard. */
  hearRadius: 75,
  /** Metres to an oncoming siren ahead within which drivers pull over too. */
  oncomingRadius: 55,
  /** Metres to a siren crossing the car's way within which the driver stops. */
  crossingRadius: 30,
  /** m/s a siren vehicle must move to count. */
  movingSpeed: 3,
  /** m/s while moving over to the kerb lane, and while easing to the kerb. */
  moveOverSpeed: 7,
  easeSpeed: 3.5,
  /** Metres right of the kerb lane's centre a pulled-over car stops at. */
  kerbOffset: 0.6,
  /** m/s the offset changes while pulling over and back. */
  offsetRate: 0.9,
  /** Seconds a driver waits after the siren has gone, before and after (random between). */
  resumeDelay: [1.1, 2.6],
  /** Seconds the indicator shows while pulling back out. */
  pullOutSeconds: 1.6,
  /** A pursuit: metres within which it scatters traffic, m/s it must move and close at. */
  chaseRadius: 48,
  chaseSpeed: 13,
  chaseClosing: 5,
  /** Metres either side of a pursuit's path that clear out. */
  chasePath: 6.5,
  /** Seconds of hard braking and swerving after the pursuit was last seen coming, metres of swerve. */
  scatterSeconds: 2.6,
  scatterOffset: 1.9,
  scatterRate: 3,
});

/** What a driver is doing about sirens. */
export const GIVE_WAY_MODE = Object.freeze({ NONE: 0, PULL_OVER: 1, PULL_OUT: 2, SCATTER: 3 });
const STRIDE = 5;

/** The step's list of sirens and pursuits: flat [x, z, vx, vz, isChase] per source. */
export function createSirenList(capacity = 24) {
  return { count: 0, capacity, data: new Float64Array(capacity * STRIDE) };
}

/**
 * Adds one source to the step's list (ignored when the list is full).
 * @param {ReturnType<typeof createSirenList>} list
 * @param {number} x Position.
 * @param {number} z
 * @param {number} vx Velocity, m/s.
 * @param {number} vz
 * @param {boolean | 'only'} chase A pursuit that scatters the cars in its path; 'only' for a car
 *   without a siren (the wanted lead's): it scatters the cars in its path and nobody pulls over for it.
 */
export function addSiren(list, x, z, vx, vz, chase) {
  if (list.count >= list.capacity) return;
  const at = list.count * STRIDE;
  list.data[at] = x;
  list.data[at + 1] = z;
  list.data[at + 2] = vx;
  list.data[at + 3] = vz;
  list.data[at + 4] = chase === 'only' ? 2 : chase ? 1 : 0;
  list.count += 1;
}

/** A driver's give-way state (one per traffic car, reset from the pool). */
export function createGiveWayState(out = {}) {
  out.mode = GIVE_WAY_MODE.NONE;
  out.seconds = 0;
  out.offset = 0;
  out.side = 0;
  out.delay = 1.6;
  return out;
}

/**
 * The driver looks at the step's sirens: starts or keeps pulling over or scattering.
 * @param {ReturnType<typeof createGiveWayState>} state
 * @param {ReturnType<typeof createSirenList>} list
 * @param {number} x The car's position.
 * @param {number} z
 * @param {number} fx The car's unit forward direction.
 * @param {number} fz
 * @param {number} speed m/s.
 * @param {number} roll 0..1, for the driver's own delay before pulling back out.
 * @returns {number} The mode now (GIVE_WAY_MODE).
 */
export function senseSirens(state, list, x, z, fx, fz, speed, roll) {
  const tune = SIREN_GIVE_WAY;
  const data = list.data;
  let pull = false;
  for (let i = 0; i < list.count; i += 1) {
    const at = i * STRIDE;
    const rx = data[at] - x;
    const rz = data[at + 1] - z;
    const distance = Math.hypot(rx, rz);
    if (distance > tune.hearRadius || distance < 0.01) continue;
    const vx = data[at + 2];
    const vz = data[at + 3];
    const sourceSpeed = Math.hypot(vx, vz);
    if (sourceSpeed < tune.movingSpeed) continue;
    const closing = -(rx * (vx - fx * speed) + rz * (vz - fz * speed)) / distance;
    if (closing <= 0.3) continue;
    const along = rx * fx + rz * fz;
    const sameWay = (vx * fx + vz * fz) / sourceSpeed;
    if (data[at + 4] && distance < tune.chaseRadius && sourceSpeed > tune.chaseSpeed && closing > tune.chaseClosing) {
      // Where this car stands across the pursuit's path, and whether it is in front of it.
      const across = (rx * vz - rz * vx) / sourceSpeed;
      const inFront = -(rx * vx + rz * vz) > 0;
      if (inFront && Math.abs(across) < tune.chasePath) {
        state.mode = GIVE_WAY_MODE.SCATTER;
        state.seconds = tune.scatterSeconds;
        state.side = (across >= 0 ? 1 : -1) * (sameWay >= -0.2 ? 1 : -1);
        return state.mode;
      }
    }
    if (data[at + 4] === 2) continue;
    if ((along < 6 && sameWay > 0.3 && Math.abs(rx * -fz + rz * fx) < 14)
      || (along > -4 && sameWay < -0.3 && distance < tune.oncomingRadius)
      || distance < tune.crossingRadius) pull = true;
  }
  if (state.mode === GIVE_WAY_MODE.SCATTER) return state.mode;
  if (pull) {
    if (state.mode !== GIVE_WAY_MODE.PULL_OVER) {
      state.mode = GIVE_WAY_MODE.PULL_OVER;
      state.delay = tune.resumeDelay[0] + (tune.resumeDelay[1] - tune.resumeDelay[0]) * roll;
    }
    state.seconds = state.delay;
  }
  return state.mode;
}

/**
 * What giving way does to the drive this step; counts the waiting down. `out` is shared: copy it.
 * @param {ReturnType<typeof createGiveWayState>} state
 * @param {number} dt Seconds.
 * @param {boolean} inKerbLane Whether the car is in the rightmost lane of its road (no lane to its right).
 * @returns {{active: boolean, speedLimit: number, offset: number, indicator: number, moveRight: boolean, brakeHard: boolean}}
 */
export function giveWayDriving(state, dt, inKerbLane) {
  const tune = SIREN_GIVE_WAY;
  const out = giveWayDriving.out;
  out.active = state.mode !== GIVE_WAY_MODE.NONE;
  out.speedLimit = Infinity;
  out.indicator = 0;
  out.moveRight = false;
  out.brakeHard = false;
  let goal = 0;
  let rate = tune.offsetRate;
  if (state.mode === GIVE_WAY_MODE.PULL_OVER) {
    out.indicator = 1;
    out.moveRight = !inKerbLane;
    if (!inKerbLane) out.speedLimit = tune.moveOverSpeed;
    else {
      goal = tune.kerbOffset;
      out.speedLimit = state.offset >= tune.kerbOffset * 0.8 ? 0 : tune.easeSpeed;
    }
    state.seconds -= dt;
    if (state.seconds <= 0) {
      state.mode = GIVE_WAY_MODE.PULL_OUT;
      state.seconds = tune.pullOutSeconds;
    }
  } else if (state.mode === GIVE_WAY_MODE.PULL_OUT) {
    // Signal back into the lane (right after a swerve to the left).
    out.indicator = state.offset < -0.15 ? 1 : state.offset > 0.15 || state.seconds > 0.4 ? -1 : 0;
    out.speedLimit = tune.moveOverSpeed;
    state.seconds -= dt;
    if (state.seconds <= 0 && Math.abs(state.offset) < 0.05) state.mode = GIVE_WAY_MODE.NONE;
  } else if (state.mode === GIVE_WAY_MODE.SCATTER) {
    goal = state.side * tune.scatterOffset;
    rate = tune.scatterRate;
    out.speedLimit = 0;
    out.brakeHard = true;
    state.seconds -= dt;
    if (state.seconds <= 0) {
      state.mode = GIVE_WAY_MODE.PULL_OUT;
      state.seconds = tune.pullOutSeconds;
    }
  }
  const step = rate * dt;
  const error = goal - state.offset;
  state.offset += error > step ? step : error < -step ? -step : error;
  out.offset = state.offset;
  return out;
}
giveWayDriving.out = { active: false, speedLimit: Infinity, offset: 0, indicator: 0, moveRight: false, brakeHard: false };
