// Guard vision for the stealth objectives, in plain numbers: the way the lead must sneak (along
// a building's frontage), where the guards stand beside it, where each looks over time (a
// lookout that keeps turning back to check the wall), whether a guard sees or hears the lead,
// and the suspicion that builds while it does and drains while it does not. A yaw is a three.js
// rotation.y: yaw t looks along (-sin t, -cos t). The objective is stealthObjective.js; the
// people and the cones in the world are missionGuards.js and guardSightView.js.

const TAU = Math.PI * 2;
const DRAIN_PER_SECOND = 0.3;
const TOUCH_DISTANCE = 1.8;

/** The yaw that looks from one point at another. */
export function yawToward(fromX, fromZ, toX, toZ) {
  return Math.atan2(-(toX - fromX), -(toZ - fromZ));
}

/** The signed difference a - b of two angles, in -PI..PI. */
export function angleGap(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

/** How long the sneak is for a number of guards (metres). */
export function sneakLength(count) {
  return Math.max(26, Math.min(60, 12 + 6 * count));
}

/** How far off the facade the sneak runs (metres), so the guards can stand between it and the street. */
export const HUG_OUT = 1.2;
/** The least distance (metres) a guard stands out from the sneak line: past touching, room to slip by. */
export const MIN_POST_GAP = 2.2;

/**
 * Where the sneak starts: just off the facade in front of the door when the place knows its door
 * (missionWorld.place), else the place itself. The marker stands out on the pavement, often at the
 * kerb; a sneak there would leave the guards no pavement but the lead's own path.
 * @param {{x: number, z: number, frontX?: number, frontZ?: number, doorX?: number, doorZ?: number}} zone
 */
export function hugBase(zone) {
  if (!Number.isFinite(zone.doorX) || !Number.isFinite(zone.doorZ)) return zone;
  const fx = zone.frontX ?? 0, fz = zone.frontZ ?? 1;
  const norm = Math.hypot(fx, fz) || 1;
  const out = Math.min(HUG_OUT, (zone.x - zone.doorX) * (fx / norm) + (zone.z - zone.doorZ) * (fz / norm));
  return { ...zone, x: zone.doorX + (fx / norm) * out, z: zone.doorZ + (fz / norm) * out };
}

/**
 * A fair spot for a post that may have fallen on the road: the post itself when it is off the
 * road; else a little further out (up to 3 m); else back toward the sneak, never nearer than
 * MIN_POST_GAP; else further out across the road (up to 20 m beyond); null when none is free
 * (the guard is left out rather than stood on the lead's path).
 * @param {(x: number, z: number) => boolean} isRoad True where traffic runs.
 * @param {{baseX: number, baseZ: number, outX: number, outZ: number, gap: number, x: number, z: number}} post
 * @returns {{x: number, z: number, gap: number} | null}
 */
export function fairPostSpot(isRoad, post) {
  const at = (gap) => ({ x: post.baseX + post.outX * gap, z: post.baseZ + post.outZ * gap, gap });
  const tries = [];
  for (let g = post.gap; g <= post.gap + 3; g += 0.5) tries.push(g);
  for (let g = post.gap - 0.5; g >= MIN_POST_GAP; g -= 0.5) tries.push(g);
  if (tries[tries.length - 1] > MIN_POST_GAP) tries.push(MIN_POST_GAP);
  for (let g = post.gap + 4; g <= post.gap + 20; g += 1) tries.push(g);
  for (const gap of tries) {
    const spot = at(gap);
    if (!isRoad(spot.x, spot.z)) return spot;
  }
  return null;
}

/**
 * The sneak along a frontage: from the zone's door point sideways for `length` metres.
 * @param {{x: number, z: number, frontX?: number, frontZ?: number}} zone A mission place.
 * @param {number} length
 * @param {1|-1} side Which way along the frontage.
 */
export function stealthRoute(zone, length, side = 1) {
  const outX = zone.frontX ?? 0, outZ = zone.frontZ ?? 1;
  const norm = Math.hypot(outX, outZ) || 1;
  const ox = outX / norm, oz = outZ / norm;
  // Along the frontage: the outward direction turned a quarter, on the chosen side.
  const alongX = -oz * side, alongZ = ox * side;
  return {
    from: { x: zone.x, z: zone.z },
    to: { x: zone.x + alongX * length, z: zone.z + alongZ * length },
    alongX, alongZ, outX: ox, outZ: oz, length,
  };
}

/**
 * Where the guards stand and look: spread along the sneak, alternately near (6 m) and far
 * (10 m) out from it, each a lookout facing the street a little up or down the frontage that
 * turns back to check the wall once a cycle; cycles differ so there are gaps to slip through.
 * Each post also carries its foot on the sneak line (baseX/Z), the outward direction and its gap
 * there, and the wall point it checks (checkX/Z), so fairPostSpot can move it off the road.
 * @returns {{x: number, z: number, lookOut: number, lookIn: number, period: number, phase: number,
 *   baseX: number, baseZ: number, outX: number, outZ: number, gap: number, checkX: number, checkZ: number}[]}
 */
export function guardPosts(route, count) {
  const posts = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.55 : 0.18 + (0.72 * i) / (count - 1);
    const along = t * route.length;
    const out = i % 2 === 0 ? 6 : 10;
    const baseX = route.from.x + route.alongX * along, baseZ = route.from.z + route.alongZ * along;
    const x = baseX + route.outX * out;
    const z = baseZ + route.outZ * out;
    const s = i % 2 === 0 ? 1 : -1;
    const a = 0.6;   // about 35 degrees up or down the frontage from straight out
    const lookX = route.outX * Math.cos(a) + route.alongX * Math.sin(a) * s;
    const lookZ = route.outZ * Math.cos(a) + route.alongZ * Math.sin(a) * s;
    const back = along - s * 6;   // checks the wall a few metres back the way the lead comes
    const checkX = route.from.x + route.alongX * back, checkZ = route.from.z + route.alongZ * back;
    posts.push({
      x, z,
      lookOut: Math.atan2(-lookX, -lookZ),
      lookIn: yawToward(x, z, checkX, checkZ),
      period: 8 + (i % 3) * 1.7,
      phase: (i * 0.37) % 1,
      baseX, baseZ, outX: route.outX, outZ: route.outZ, gap: out, checkX, checkZ,
    });
  }
  return posts;
}

const smooth = (a, b, u) => { const k = Math.min(1, Math.max(0, (u - a) / (b - a))); return k * k * (3 - 2 * k); };

/** Where a guard on its post looks at a time: out, a slow sway, and a turn back to the wall. */
export function watchYaw(post, time) {
  const u = (time / post.period + post.phase) % 1;
  const back = smooth(0.5, 0.6, u) * (1 - smooth(0.82, 0.92, u));
  const sway = Math.sin(time * 0.7 + post.phase * TAU) * 0.3;
  return post.lookOut + angleGap(post.lookIn, post.lookOut) * back + sway;
}

/**
 * How well a guard sees the lead, 0 (not at all) to 1: inside the cone (range and degrees
 * wide) nearer is plainer; within touching distance any way round. Walls are the caller's.
 */
export function sightOf(gx, gz, yaw, lx, lz, range, degrees) {
  const d = Math.hypot(lx - gx, lz - gz);
  if (d <= TOUCH_DISTANCE) return 1;
  if (d > range) return 0;
  const off = Math.abs(angleGap(yawToward(gx, gz, lx, lz), yaw));
  if (off > (degrees * Math.PI) / 360) return 0;
  return 1 - (0.55 * d) / range;
}

/** How loud the lead is to a guard at a distance: sprinting carries 9 m, running 4.5 m. */
export function hearingOf(distance, speed) {
  if (speed > 5 && distance < 9) return 0.7;
  if (speed > 2.6 && distance < 4.5) return 0.5;
  return 0;
}

/** The next suspicion level (0..1): rises while sensed (full in detectSeconds when plain), else drains. */
export function nextSuspicion(level, sensed, dt, detectSeconds) {
  const next = sensed > 0 ? level + (sensed / Math.max(0.2, detectSeconds)) * dt : level - DRAIN_PER_SECOND * dt;
  return Math.min(1, Math.max(0, next));
}
