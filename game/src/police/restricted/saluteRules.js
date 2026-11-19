// Who salutes the expected officer and for how long: a guard or a crew member who sees him
// within twelve metres turns to him and salutes once, then not again for a while; the duty
// officer holds the salute until he has walked past. Also the suspicion the cleared lead draws
// (running, bumping people, lingering by an aircraft stand he was not sent to). Pure
// (Node-tested).

/** The numbers of a salute. */
export const SALUTE = Object.freeze({
  /** Metres within which a person who sees the officer salutes. */
  radius: 12,
  /** Half the field of view, degrees: they see him ahead and to the sides, not behind. */
  halfView: 115,
  /** Seconds a salute is held. */
  holdSeconds: 2.4,
  /** Seconds before the same person salutes again. */
  cooldownSeconds: 60,
  /** The duty officer: holds at least and at most this long, until the lead has passed. */
  officerMinSeconds: 1.6,
  officerMaxSeconds: 18,
  /** Metres past the officer (along the way the lead came) that count as passed. */
  passedBy: 2.5,
});

/**
 * A fresh salute record for one person.
 * @returns {{saluting: boolean, since: number, readyAt: number, fromX: number, fromZ: number}}
 */
export function createSaluteRecord() {
  return { saluting: false, since: 0, readyAt: 0, fromX: 0, fromZ: 0 };
}

/**
 * Whether a person at (px, pz) facing `yaw` sees a point (three.js yaw: forward is -Z at 0).
 * @param {number} halfViewDegrees
 */
export function seesPoint(px, pz, yaw, x, z, halfViewDegrees = SALUTE.halfView) {
  const dx = x - px, dz = z - pz, d = Math.hypot(dx, dz);
  if (d < 1e-3) return true;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  return (dx * fx + dz * fz) / d >= Math.cos((halfViewDegrees * Math.PI) / 180);
}

/**
 * Whether a person may start a salute now.
 * @param {ReturnType<typeof createSaluteRecord>} record
 * @param {{x: number, z: number, yaw: number, busy?: boolean}} person busy: fighting, fleeing, down.
 * @param {{x: number, z: number}} lead
 * @param {boolean} access The lead passes as the officer.
 * @param {number} now Seconds.
 */
export function maySalute(record, person, lead, access, now) {
  if (!access || record.saluting || person.busy || now < record.readyAt) return false;
  if (Math.hypot(lead.x - person.x, lead.z - person.z) > SALUTE.radius) return false;
  return seesPoint(person.x, person.z, person.yaw, lead.x, lead.z);
}

/**
 * Starts a salute (the caller has checked maySalute).
 * @param {{x: number, z: number}} person
 * @param {{x: number, z: number}} lead
 */
export function startSalute(record, person, lead, now) {
  record.saluting = true;
  record.since = now;
  // The way the lead came from, seen from the person: passing means crossing to the other side.
  const dx = lead.x - person.x, dz = lead.z - person.z, d = Math.hypot(dx, dz) || 1;
  record.fromX = dx / d;
  record.fromZ = dz / d;
  return record;
}

/**
 * Whether a running salute ends now (and starts its cooldown).
 * @param {'guard'|'groundCrew'|'officer'} role
 * @returns {boolean} True when it ended this call.
 */
export function saluteEnds(record, role, person, lead, access, now) {
  if (!record.saluting) return false;
  const held = now - record.since;
  let done;
  if (!access || person.busy) done = true;
  else if (role === 'officer') {
    const dx = lead.x - person.x, dz = lead.z - person.z;
    const passed = dx * record.fromX + dz * record.fromZ < -SALUTE.passedBy || Math.hypot(dx, dz) > SALUTE.radius * 1.25;
    done = held >= SALUTE.officerMaxSeconds || (passed && held >= SALUTE.officerMinSeconds);
  } else done = held >= SALUTE.holdSeconds;
  if (done) {
    record.saluting = false;
    record.readyAt = now + SALUTE.cooldownSeconds;
  }
  return done;
}

/** The numbers of the suspicion meter (0..1). */
export const SUSPICION = Object.freeze({
  /** Metres a second above which the cleared lead is running. */
  runSpeed: 3.6,
  /** Rise per second while running. */
  runRate: 0.09,
  /** Rise per person bumped. */
  bump: 0.18,
  /** Metres from a stand he was not sent to that count as beside it, the seconds allowed there, and the rise per second after. */
  standRadius: 16,
  lingerGrace: 6,
  lingerRate: 0.06,
  /** Fall per second while he behaves. */
  calmRate: 0.015,
});

/**
 * A fresh suspicion record.
 * @returns {{value: number, lingering: number, cause: string|null}}
 */
export function createSuspicion() {
  return { value: 0, lingering: 0, cause: null };
}

/**
 * Advances the suspicion by dt seconds.
 * @param {ReturnType<typeof createSuspicion>} s Changed in place.
 * @param {{cleared: boolean, speed: number, bumps: number, standId: string|null, expectedStandId: string|null}} input
 *   cleared: the lead is inside as the officer; standId: the stand he is beside, or null;
 *   expectedStandId: the stand he was sent to (null: none, so every stand is someone else's).
 * @param {number} dt
 * @returns {number} The value, 0..1 (reaching 1 does nothing by itself).
 */
export function stepSuspicion(s, input, dt) {
  if (!input.cleared) {
    s.lingering = 0;
    s.cause = null;
    return s.value;
  }
  let rise = 0;
  s.cause = null;
  if (input.speed > SUSPICION.runSpeed) { rise += SUSPICION.runRate * dt; s.cause = 'running'; }
  if (input.standId && input.standId !== input.expectedStandId) {
    s.lingering += dt;
    if (s.lingering > SUSPICION.lingerGrace) { rise += SUSPICION.lingerRate * dt; s.cause = 'lingering'; }
  } else s.lingering = 0;
  if (input.bumps > 0) { rise += SUSPICION.bump * input.bumps; s.cause = 'bumped'; }
  s.value = rise > 0 ? Math.min(1, s.value + rise) : Math.max(0, s.value - SUSPICION.calmRate * dt);
  return s.value;
}

/** The stand a point is beside ({id, x, z}[]), or null. */
export function standBeside(stands, x, z, radius = SUSPICION.standRadius) {
  for (let i = 0; i < stands.length; i += 1) {
    if (Math.abs(stands[i].x - x) < radius && Math.abs(stands[i].z - z) < radius && Math.hypot(stands[i].x - x, stands[i].z - z) < radius) return stands[i].id;
  }
  return null;
}
