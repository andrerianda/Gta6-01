// Pursuit pressure (shift 14): a cruiser behind a lead fleeing by car closes in and stays on the lead
// (no yo-yo round the old 35 m catch-up line), within its own top speed; it rams from three stars,
// PITs gently at two and only follows at one; it boxes in a stopped or slow lead, arriving slowly
// enough to stop; and a settled fleeing spawn is straight behind on the lead's street. The chase is
// a point mass on a straight street (north, -Z) driven through the real choosePursuitMode,
// pursuitSpeed and drivePursuit.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTACT, FLEEING, PRESSURE, PURSUIT_MODE, catchUpSpeed, choosePursuitMode, contactFor, createPursuitState, drivePursuit, fleeingSpawnScore,
  pursuitSpeed,
} from '../../../game/src/police/pursuitDriving.js';
import { WANTED_LEVELS } from '../../../game/src/catalog/wantedLevels.js';

/** The police cruiser's top speed (vehicleCatalog police_cruiser). */
const TOP = 58;
const DT = 1 / 60;

/** Engine pull of a cruiser at a speed (m/s^2): strong at launch, nothing at its top speed. */
function engine(speed) {
  return Math.max(0, Math.min(5, 160 / Math.max(speed, 3)) * (1 - (speed / TOP) ** 3));
}

/**
 * A straight chase: the lead drives north at leadSpeed (braking from `stopAt` seconds), the cruiser
 * starts `gap` metres behind at `start` m/s. Returns the log of distances and speeds.
 */
function chase({ stars, leadSpeed, gap, start, seconds, stopAt = Infinity }) {
  const level = WANTED_LEVELS[stars];
  const contact = contactFor(level.tactics);
  const pursuit = createPursuitState(1);
  pursuit.lane = 0;
  const controls = { throttle: 0, brake: 0, steer: 0, handbrake: 0, reverse: false, horn: false };
  const lead = { x: 0, z: -gap, vx: 0, vz: -leadSpeed, speed: leadSpeed, yaw: 0, inVehicle: true };
  const car = { x: 0, z: 0, yaw: 0, speed: start };
  const log = { distance: [], speed: [], mode: [], contactAt: -1, maxSpeed: 0 };
  for (let t = 0; t < seconds; t += DT) {
    if (t >= stopAt) lead.speed = Math.max(0, lead.speed - 9 * DT);
    lead.vz = -lead.speed;
    lead.z += lead.vz * DT;
    choosePursuitMode(pursuit, car, lead, false, contact);
    const follow = contact === CONTACT.FOLLOW || lead.speed < FLEEING.leadSpeed ? PRESSURE.follow : 0;
    const cruise = pursuitSpeed(33 * level.pursuitSpeedFactor, pursuit.distance, lead.speed, true, follow, TOP);
    drivePursuit(controls, pursuit, car, cruise, DT);
    car.speed += (controls.throttle * engine(car.speed) - controls.brake * 10) * DT;
    car.speed = Math.max(0, car.speed);
    car.z -= car.speed * DT;
    const distance = car.z - lead.z;
    if (distance < 4.8 && log.contactAt < 0) log.contactAt = t;
    // A touch: the cruiser cannot pass through the lead's car.
    if (distance < 4.8) {
      car.z = lead.z + 4.8;
      car.speed = Math.min(car.speed, lead.speed);
    }
    log.distance.push(car.z - lead.z);
    log.speed.push(car.speed);
    log.mode.push(pursuit.mode);
    log.maxSpeed = Math.max(log.maxSpeed, car.speed);
  }
  return log;
}

/** Seconds until the distance first falls below `metres` (Infinity: never). */
function secondsTo(log, metres) {
  const index = log.distance.findIndex((d) => d < metres);
  return index < 0 ? Infinity : index * DT;
}

test('the pressure speed: within the top speed, never below the lead\'s while behind, smaller as the gap closes', () => {
  for (const leadSpeed of [5, 20, 38, 52]) {
    let previous = Infinity;
    for (let distance = 150; distance >= 0; distance -= 1) {
      const speed = pursuitSpeed(33, distance, leadSpeed, true, 0, TOP);
      assert.ok(speed <= TOP * PRESSURE.topShare + 1e-9, `within its top speed (${speed} at ${distance} m)`);
      assert.ok(speed >= Math.min(leadSpeed, TOP * PRESSURE.topShare) - 1e-9, 'never slower than the lead while behind it');
      assert.ok(speed <= previous + 1e-9, 'no step back up as it closes (the old 35 m line made a yo-yo)');
      previous = speed;
    }
  }
  assert.equal(pursuitSpeed(30, 50, 10, false, 0, TOP), 30, 'a lead on foot: the level\'s cruise');
  // A lead faster than the old 45 m/s cap is still followed on the lanes, within the car's top speed.
  assert.ok(catchUpSpeed(27, 120, 50, true, TOP) > 50 && catchUpSpeed(27, 120, 50, true, TOP) <= TOP);
  assert.equal(catchUpSpeed(27, 120, 30, true), Math.min(FLEEING.catchUpCap, 30 * 1.15 + 4), 'the old catch-up without a top speed');
});

test('a cruiser 70 m behind a lead at highway speed closes in, stays on the lead and rams at three stars and more', () => {
  for (const stars of [3, 4, 5]) {
    const log = chase({ stars, leadSpeed: 38, gap: 70, start: 38, seconds: 40 });
    const within15 = secondsTo(log, 15);
    assert.ok(within15 < 20, `${stars} stars: within 15 m after ${within15.toFixed(1)} s`);
    assert.ok(log.contactAt >= 0 && log.contactAt < 30, `${stars} stars: contact after ${log.contactAt.toFixed(1)} s`);
    assert.ok(log.maxSpeed <= TOP, 'no faster than its own top speed');
    // No yo-yo: once within 15 m it never falls back beyond 25 m.
    const from = Math.round(within15 / DT);
    assert.ok(Math.max(...log.distance.slice(from)) < 25, `${stars} stars: stays on the lead`);
  }
});

test('two stars: a gentle PIT, one star: follows close without touching', () => {
  const two = chase({ stars: 2, leadSpeed: 38, gap: 70, start: 38, seconds: 40 });
  assert.ok(two.contactAt >= 0, 'two stars: the PIT touches');
  assert.ok(two.mode.includes(PURSUIT_MODE.RAM));
  const one = chase({ stars: 1, leadSpeed: 30, gap: 70, start: 30, seconds: 40 });
  assert.equal(one.contactAt, -1, 'one star: no contact');
  assert.ok(!one.mode.includes(PURSUIT_MODE.RAM), 'one star: never rams');
  const tail = one.distance.slice(-600);
  assert.ok(Math.max(...tail) < 18 && Math.min(...tail) > 5, `one star: follows ${Math.min(...tail).toFixed(1)}-${Math.max(...tail).toFixed(1)} m behind`);
  // The ram margins: a PIT closes slower than a ram.
  const pursuit = createPursuitState(1);
  const car = { x: 0, z: 10, yaw: 0, speed: 20 };
  choosePursuitMode(pursuit, car, { x: 0, z: 0, vx: 0, vz: -20, speed: 20, yaw: 0, inVehicle: true }, false, CONTACT.PIT);
  assert.equal(pursuit.mode, PURSUIT_MODE.RAM);
  const controls = {};
  drivePursuit(controls, pursuit, { ...car, speed: 20 + FLEEING.pitMargin + 0.5 }, 45, DT);
  assert.equal(controls.throttle, 0, 'a PIT comes in at most pitMargin faster than the lead');
  choosePursuitMode(pursuit, car, { x: 0, z: 0, vx: 0, vz: -20, speed: 20, yaw: 0, inVehicle: true }, false, CONTACT.FOLLOW);
  assert.equal(pursuit.mode, PURSUIT_MODE.CHASE, 'one star never rams');
});

test('the stars\' tactics choose the contact', () => {
  assert.equal(contactFor(WANTED_LEVELS[1].tactics), CONTACT.FOLLOW);
  assert.equal(contactFor(WANTED_LEVELS[2].tactics), CONTACT.PIT);
  for (const stars of [3, 4, 5]) assert.equal(contactFor(WANTED_LEVELS[stars].tactics), CONTACT.RAM);
  assert.equal(contactFor(undefined), CONTACT.RAM, 'no tactics: the old behaviour');
});

test('a lead who stops is boxed in: the cruiser arrives slowly enough to stop, and a slow car is boxed, not rammed', () => {
  for (const stars of [1, 2, 4]) {
    const log = chase({ stars, leadSpeed: 38, gap: 60, start: 38, seconds: 30, stopAt: 4 });
    const last = log.mode.length - 1;
    assert.equal(log.mode[last], PURSUIT_MODE.BOX, `${stars} stars: boxing at the end`);
    assert.ok(log.speed[last] < 0.5, `${stars} stars: stopped (${log.speed[last].toFixed(2)} m/s)`);
    // A lead braking hard from 38 m/s (9 m/s^2) right in front of a ramming car may be touched,
    // but the closing speed stays well under the 38 m/s it came in at.
    let worst = 0;
    log.distance.forEach((d, i) => { if (d <= 4.81 && i > 0) worst = Math.max(worst, log.speed[i - 1] - log.speed[i]); });
    assert.ok(worst < 15, `${stars} stars: no hard hit on a braking lead (${worst.toFixed(1)} m/s)`);
  }
  const pursuit = createPursuitState(1);
  choosePursuitMode(pursuit, { x: 0, z: 10, yaw: 0, speed: 8 }, { x: 0, z: 0, vx: 0, vz: -5, speed: 5, yaw: 0, inVehicle: true }, false, CONTACT.RAM);
  assert.equal(pursuit.mode, PURSUIT_MODE.BOX, 'a car crawling at 5 m/s is boxed, not pushed along');
});

test('a lead on another street is reached on the lanes, not through the block', () => {
  const pursuit = createPursuitState(1);
  pursuit.lane = 3;
  // The car runs north on a parallel street 80 m west of the lead, 30 m behind.
  choosePursuitMode(pursuit, { x: 0, z: 0, yaw: 0, speed: 30 }, { x: 80, z: -30, vx: 0, vz: -30, speed: 30, yaw: 0, inVehicle: true }, false);
  assert.equal(pursuit.mode, PURSUIT_MODE.LANES);
  choosePursuitMode(pursuit, { x: 0, z: 0, yaw: 0, speed: 30 }, { x: 2, z: -70, vx: 0, vz: -30, speed: 30, yaw: 0, inVehicle: true }, false);
  assert.equal(pursuit.mode, PURSUIT_MODE.CHASE, 'on the same street it chases');
});

test('a settled fleeing spawn is straight behind on the lead\'s street, not on a parallel one', () => {
  // The lead drives north (-Z); lanes run north.
  const north = { x: 0, z: -1 };
  const straightBehind = fleeingSpawnScore(0, 70, 0, -1, north, true);
  const parallel = fleeingSpawnScore(80, 25, 0, -1, north, true);
  assert.ok(straightBehind < parallel, `behind ${straightBehind.toFixed(1)} beats a parallel street ${parallel.toFixed(1)}`);
  assert.ok(straightBehind < 150 && fleeingSpawnScore(0, -70, 0, -1, north, true) >= 150, 'never ahead');
  // Before the run settles the score is the old one (scenes stage chases in their first seconds).
  assert.equal(fleeingSpawnScore(80, 25, 0, -1, north), fleeingSpawnScore(80, 25, 0, -1, north, false));
  assert.ok(FLEEING.settleSeconds > 2, 'a run settles after a few seconds');
});
