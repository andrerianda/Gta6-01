// Personal space in the crowd: people keep a few metres from the lead (they step aside rather
// than stand in his face or in front of the camera), nobody is put down on top of anyone, and
// people get out of the line of an aimed gun: those it points at put their hands up, cower or
// run, those beside it sidestep out of it. Pure functions; crowdSimulation.js applies them.

/** Metres a passer-by keeps from the lead. */
export const LEAD_SPACE = 2.5;
/** Metres a new person keeps from anyone when put down. */
export const SPAWN_SPACE = 1.5;
/** Metres along an aimed gun that people notice it. */
export const AIM_REACH = 32;

/**
 * The circle a walking person steers round the lead by (pavementObstacles.js adds its body
 * clearance, about 0.36 m, so the walker's path keeps LEAD_SPACE and a little).
 */
export const LEAD_RING = LEAD_SPACE - 0.2;

/**
 * Keeps a person out of the lead's space: a walker steers round LEAD_RING like an obstacle (the
 * caller adds the circle); a person standing still whom the lead comes up to steps back.
 * @param {number} px The person.
 * @param {number} pz
 * @param {number} lx The lead.
 * @param {number} lz
 * @param {{moveX: number, moveZ: number}} move Changed in place when they step back.
 * @param {{count: number, data: Float32Array} | null} circles A walker's obstacle circles: the
 *   lead's ring is appended (the caller drops it after steering).
 * @returns {boolean} True when the lead is close enough to matter.
 */
export function keepFromLead(px, pz, lx, lz, move, circles) {
  const dx = px - lx, dz = pz - lz, d = Math.hypot(dx, dz);
  if (d >= LEAD_SPACE + 4) return false;
  if (Math.hypot(move.moveX, move.moveZ) > 0.2) {
    if (circles && circles.count < circles.data.length / 3) {
      const k = circles.count * 3;
      circles.data[k] = lx;
      circles.data[k + 1] = lz;
      circles.data[k + 2] = LEAD_RING;
      circles.count += 1;
    }
    return true;
  }
  if (d >= LEAD_SPACE + 0.4) return false;
  const ux = d > 1e-3 ? dx / d : 1, uz = d > 1e-3 ? dz / d : 0;
  move.moveX = ux * 1.4;
  move.moveZ = uz * 1.4;
  return true;
}

/**
 * The guard behind keepFromLead: a person inside LEAD_SPACE is moved out, at most a brisk step
 * (2.4 m/s) at a time, so nobody ever stands in the lead or in front of the camera.
 * @param {{x: number, z: number}} p Changed in place.
 * @param {number} lx The lead.
 * @param {number} lz
 * @param {number} dt Seconds.
 * @returns {boolean} True when moved.
 */
export function stepOutOfLeadSpace(p, lx, lz, dt) {
  const dx = p.x - lx, dz = p.z - lz, d = Math.hypot(dx, dz);
  if (d >= LEAD_SPACE || d < 1e-3) return false;
  const step = Math.min(LEAD_SPACE - d, 2.4 * dt);
  p.x += (dx / d) * step;
  p.z += (dz / d) * step;
  return true;
}

/**
 * Where a person stands in relation to an aimed gun's line.
 * @param {number} px The person.
 * @param {number} pz
 * @param {number} ox The gun (the lead).
 * @param {number} oz
 * @param {number} dirX Aim direction on the ground (unit).
 * @param {number} dirZ
 * @param {{ahead: number, lateral: number, aimedAt: boolean, near: boolean}} out
 * @returns {{ahead: number, lateral: number, aimedAt: boolean, near: boolean}} `out`: aimedAt
 *   when the gun points at the person, near when they stand within a couple of metres of its line.
 */
export function lineOfFire(px, pz, ox, oz, dirX, dirZ, out) {
  const dx = px - ox, dz = pz - oz;
  out.ahead = dx * dirX + dz * dirZ;
  out.lateral = dx * -dirZ + dz * dirX;
  const inReach = out.ahead > 0.5 && out.ahead < AIM_REACH;
  const width = 0.8 + out.ahead * 0.035;
  out.aimedAt = inReach && Math.abs(out.lateral) < width;
  out.near = inReach && !out.aimedAt && Math.abs(out.lateral) < width + 2.2;
  return out;
}

/**
 * Whether a spot is free to put a person down.
 * @param {number} x
 * @param {number} z
 * @param {{x: number, z: number}[]} people Everyone already there.
 * @param {{x: number, z: number} | null} lead The lead's position, kept LEAD_SPACE from.
 * @returns {boolean}
 */
export function spotIsFree(x, z, people, lead) {
  if (lead && Math.hypot(x - lead.x, z - lead.z) < LEAD_SPACE) return false;
  for (let i = 0; i < people.length; i += 1) {
    const p = people[i];
    if (Math.abs(p.x - x) < SPAWN_SPACE && Math.abs(p.z - z) < SPAWN_SPACE && Math.hypot(p.x - x, p.z - z) < SPAWN_SPACE) return false;
  }
  return true;
}

/**
 * The nearest free spot to x, z on rings round it (the spot itself first), or null.
 * @param {number} x
 * @param {number} z
 * @param {{x: number, z: number}[]} people
 * @param {{x: number, z: number} | null} lead
 * @param {{x: number, z: number}} out
 * @returns {{x: number, z: number} | null}
 */
export function freeSpotNear(x, z, people, lead, out) {
  if (spotIsFree(x, z, people, lead)) { out.x = x; out.z = z; return out; }
  for (let ring = 1; ring <= 4; ring += 1) {
    const r = ring * SPAWN_SPACE * 1.1;
    for (let k = 0; k < 8; k += 1) {
      const a = (k / 8) * Math.PI * 2 + ring * 0.4;
      const cx = x + Math.cos(a) * r, cz = z + Math.sin(a) * r;
      if (spotIsFree(cx, cz, people, lead)) { out.x = cx; out.z = cz; return out; }
    }
  }
  return null;
}
