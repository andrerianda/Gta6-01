// El Comprador's stealth test as pure logic: the navy picket line, how long the ships have held
// the aircraft, the hail, the missile lock, the missile, and the pass line 900 m beyond the ships.
// Two variants: 'stealth' (Manta Sombra: being painted is fine, being tracked is not) and 'speed'
// (Garza Negra: it cannot hide, so the lock builds whenever it is inside the ships' radar zone
// below the gate speed, and it must be through before the lock completes). Runs in Node.

export const PICKET_RULES = Object.freeze({
  passBeyond: 900,
  stealth: Object.freeze({ hailTrackedSeconds: 6, lockSeconds: 10, missileDelay: 5, breakSeconds: 2.5 }),
  speed: Object.freeze({ gateMach: 1.15, zoneRadius: 2600, hailLock: 4, callLock: 8, completeLock: 12, slowRate: 1.5, decay: 0.5 }),
});

/**
 * Metres beyond the picket line (the line through the first and the last ship), positive on the
 * far side as seen from Marazul's centre.
 * @param {ReadonlyArray<{x: number, z: number}>} ships
 * @param {{x: number, z: number}} centre
 */
export function beyondPicketLine(ships, centre, x, z) {
  const a = ships[0];
  const b = ships[ships.length - 1];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz) || 1;
  const side = (px, pz) => ((px - a.x) * dz - (pz - a.z) * dx) / length;
  const home = side(centre.x, centre.z) >= 0 ? 1 : -1;
  return -home * side(x, z);
}

/**
 * The test. update(sample, dt) returns the events of the frame: 'hail' (st_03), 'lock' (st_04),
 * 'lock_broken', 'missile' (fail), 'passed'.
 * @param {{mode: 'stealth' | 'speed', ships: ReadonlyArray<{x: number, z: number}>, centre: {x: number, z: number}}} options
 */
export function createPicketTest(options) {
  const rules = PICKET_RULES;
  const events = [];
  const test = {
    mode: options.mode,
    trackedSeconds: 0,
    lock: 0,
    locked: false,
    hailed: false,
    missileIn: Infinity,
    beyond: -Infinity,
    outcome: null,
    update,
  };
  let untracked = 0;

  function update(sample, dt) {
    events.length = 0;
    if (test.outcome) return events;
    test.beyond = beyondPicketLine(options.ships, options.centre, sample.x, sample.z);
    if (test.mode === 'speed') stepSpeed(sample, dt); else stepStealth(sample, dt);
    if (test.outcome) return events;
    if (test.beyond >= rules.passBeyond) {
      test.outcome = 'passed';
      events.push('passed');
    }
    return events;
  }

  function stepStealth(sample, dt) {
    const r = rules.stealth;
    if (sample.tracked) {
      test.trackedSeconds += dt;
      untracked = 0;
    } else {
      untracked += dt;
      if (untracked >= r.breakSeconds) {
        test.trackedSeconds = 0;
        if (test.locked) {
          test.locked = false;
          test.missileIn = Infinity;
          events.push('lock_broken');
        }
      }
    }
    test.lock = Math.max(test.trackedSeconds, sample.lockSeconds ?? 0);
    if (!test.hailed && test.trackedSeconds > r.hailTrackedSeconds) {
      test.hailed = true;
      events.push('hail');
    }
    if (!test.locked && sample.tracked && test.lock >= r.lockSeconds) {
      test.locked = true;
      test.missileIn = r.missileDelay;
      events.push('lock');
    }
    if (test.locked) {
      test.missileIn -= dt;
      if (test.missileIn <= 0) fire();
    }
  }

  function stepSpeed(sample, dt) {
    const r = rules.speed;
    let inZone = false;
    for (const ship of options.ships) if (Math.hypot(sample.x - ship.x, sample.z - ship.z) < r.zoneRadius) inZone = true;
    const slow = Math.max(0, 1 - sample.mach / r.gateMach);
    let rate = 0;
    if (inZone) rate += slow * r.slowRate;
    if (sample.tracked && sample.mach < r.gateMach) rate = Math.max(rate, 1);
    if (rate > 0) test.lock += rate * dt; else test.lock = Math.max(0, test.lock - r.decay * dt);
    test.trackedSeconds = test.lock;
    if (!test.hailed && test.lock >= r.hailLock) {
      test.hailed = true;
      events.push('hail');
    }
    if (!test.locked && test.lock >= r.callLock) {
      test.locked = true;
      events.push('lock');
    }
    test.missileIn = test.locked ? Math.max(0, r.completeLock - test.lock) : Infinity;
    if (test.lock >= r.completeLock) fire();
  }

  function fire() {
    test.outcome = 'missile';
    events.push('missile');
  }

  return test;
}
