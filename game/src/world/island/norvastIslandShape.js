// The shape of the Norvast island as a pure, seeded height function: a rocky island about 1.9 km
// long and 1.2 km wide round the chart's centre, cliffs straight out of the sea, two ridges and
// between them the hidden valley with the airstrip (dead flat at the chart's strip height), the
// apron for the camouflage-net hangar, a turning pad under the western rock wall, and a track
// down to a small cove. No three.js, no DOM: the terrain mesh, the collision ground, the far
// silhouette and the tests all read this one function.
//
// The island's own frame: u runs along the landing direction (the chart's strip heading, so the
// eastern threshold has the lowest u), v to the right of a landing aircraft (the north side).
import { SEA_AND_AIRSPACE_CHART } from '../../catalog/seaAndAirspaceChart.js';

const CHART = SEA_AND_AIRSPACE_CHART.norvastIsland;
const HEADING = (CHART.stripHeading * Math.PI) / 180;
const UX = Math.sin(HEADING), UZ = -Math.cos(HEADING);
const WX = Math.cos(HEADING), WZ = Math.sin(HEADING);
const SEED = 0x4e6f7276;

const STRIP_U0 = -400, STRIP_U1 = STRIP_U0 + CHART.stripLength, STRIP_HALF = CHART.stripWidth / 2;
const STRIP_Y = CHART.stripHeight;
const SEMI_U = 930, SEMI_V = 590;
const PAD = { u: STRIP_U1 + 15, v: 0, radius: 42 };
const APRON = { u0: 230, u1: 480, v0: 0, v1: 165 };
const HANGAR = { u: 355, v: 105 };
const WALL_REACH = 110, FLOOR_REACH = 40;
const TRACK = [[-470, -80], [-600, -150], [-715, -215], [0, 0]];
const COVE = { u: 0, v: 0, radius: 45, height: 1 };

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function latticeValue(ix, iz) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ SEED;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise, 0..1. */
function valueNoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = latticeValue(ix, iz), b = latticeValue(ix + 1, iz);
  const c = latticeValue(ix, iz + 1), d = latticeValue(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a + (a - b + d - c) * sx) * sz;
}

/** The coast's wobble round the island (0.93..1 of the ellipse) at an angle. */
function coastFactor(angle) {
  const n = 0.5 + 0.25 * Math.sin(3 * angle + 1.3) + 0.15 * Math.sin(7 * angle + 0.4) + 0.1 * Math.sin(13 * angle + 2.1);
  return 0.93 + 0.07 * n;
}

/** Metres inland of the coast along the ray from the centre (negative out at sea). */
function inlandDistance(u, v) {
  const e = Math.hypot(u / SEMI_U, v / SEMI_V);
  if (e < 1e-6) return SEMI_V;
  const scaled = e / coastFactor(Math.atan2(v / SEMI_V, u / SEMI_U));
  return Math.hypot(u, v) * (1 / scaled - 1);
}

// The cove lies on the south-east coast where the track's last leg meets the sea.
{
  const angle = Math.atan2(-262 / SEMI_V, -775 / SEMI_U);
  const reach = coastFactor(angle);
  const coastU = Math.cos(angle) * SEMI_U * reach, coastV = Math.sin(angle) * SEMI_V * reach;
  const length = Math.hypot(coastU, coastV);
  COVE.u = coastU * (1 - 22 / length);
  COVE.v = coastV * (1 - 22 / length);
  TRACK[3][0] = COVE.u;
  TRACK[3][1] = COVE.v;
}
const TRACK_LENGTHS = [];
let TRACK_TOTAL = 0;
for (let i = 0; i < TRACK.length - 1; i += 1) {
  TRACK_LENGTHS.push(Math.hypot(TRACK[i + 1][0] - TRACK[i][0], TRACK[i + 1][1] - TRACK[i][1]));
  TRACK_TOTAL += TRACK_LENGTHS[i];
}

const valleyHalfWidth = (u) => 60 + 35 * (1 - smooth(-350, -200, u));
const valleyFloor = (u) => STRIP_Y - 6 * (1 - smooth(-800, -420, u));
const TRACK_TOP = valleyFloor(TRACK[0][0]);

const floor = { distance: 0, height: 0 };
let weightSum = 0, heightSum = 0;
function addFloor(distance, height) {
  if (distance < floor.distance) floor.distance = distance;
  if (distance >= FLOOR_REACH) return;
  const w = distance <= 0 ? 1 : (1 - distance / FLOOR_REACH) ** 2;
  weightSum += w;
  heightSum += w * height;
}

/** The made ground (valley, strip, pad, apron, track, cove): signed distance to it and its height. */
function floorAt(u, v) {
  floor.distance = Infinity;
  weightSum = 0;
  heightSum = 0;
  addFloor(Math.max(Math.abs(v) - valleyHalfWidth(u), u - STRIP_U1), valleyFloor(u));
  addFloor(Math.hypot(u - PAD.u, v - PAD.v) - PAD.radius, STRIP_Y);
  const au = Math.max(APRON.u0 - u, u - APRON.u1), av = Math.max(APRON.v0 - v, v - APRON.v1);
  addFloor(au > 0 && av > 0 ? Math.hypot(au, av) : Math.max(au, av), STRIP_Y);
  let along = 0, best = Infinity, bestAlong = 0;
  for (let i = 0; i < TRACK.length - 1; i += 1) {
    const ax = TRACK[i][0], az = TRACK[i][1];
    const dx = TRACK[i + 1][0] - ax, dz = TRACK[i + 1][1] - az;
    const t = Math.min(1, Math.max(0, ((u - ax) * dx + (v - az) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(u - ax - dx * t, v - az - dz * t);
    if (d < best) { best = d; bestAlong = along + t * TRACK_LENGTHS[i]; }
    along += TRACK_LENGTHS[i];
  }
  addFloor(best - 5, TRACK_TOP + (COVE.height - TRACK_TOP) * (bestAlong / TRACK_TOTAL));
  addFloor(Math.hypot(u - COVE.u, v - COVE.v) - COVE.radius, COVE.height);
  // On the strip, the pad and the apron every floor in reach has the strip's height: exactly flat.
  const height = weightSum > 0 ? heightSum / weightSum : 0;
  floor.height = Math.abs(height - STRIP_Y) < 1e-9 ? STRIP_Y : height;
  return floor;
}

/** The natural rock above the made ground: two ridges, the western wall, and broken detail. */
function ridgeAt(u, v) {
  const north = 92 * Math.exp(-(((v - 340) / 190) ** 2)) * smooth(-650, -450, u) * (1 - smooth(560, 760, u));
  const south = 74 * Math.exp(-(((v + 330) / 175) ** 2)) * smooth(-620, -420, u) * (1 - smooth(520, 720, u));
  const west = 70 * Math.exp(-(((u - 730) / 190) ** 2)) * Math.exp(-((v / 330) ** 2));
  const broad = valueNoise(u / 170 + 11.3, v / 170 - 4.1) * 0.65 + valueNoise(u / 80 - 2.7, v / 80 + 9.9) * 0.35;
  const crags = 1 - Math.abs(2 * broad - 1);
  const fine = valueNoise(u / 42 + 5.5, v / 42 + 1.5) - 0.5 + (valueNoise(u / 13 - 8.2, v / 13 + 3.3) - 0.5) * 0.35;
  const height = 48 + north + south + west + 18 * crags - 9 + 10 * fine;
  return height > 128 ? 128 + (height - 128) * 0.5 : height;
}

/**
 * The island's height in its own frame.
 * @param {number} u Metres along the landing direction from the centre.
 * @param {number} v Metres to the right of it (north side).
 * @returns {number} Height over sea level; negative is sea bed.
 */
export function islandHeightLocal(u, v) {
  const inland = inlandDistance(u, v);
  if (inland <= 0) return Math.max(-30, inland * 0.3) - 0.05;
  const made = floorAt(u, v);
  const wall = smooth(0, WALL_REACH, made.distance);
  const ground = wall >= 1 ? ridgeAt(u, v) : wall <= 0 ? made.height : made.height + (ridgeAt(u, v) - made.height) * wall;
  const rise = inland >= 60 ? 1 : smooth(0, 60, inland) ** 0.7;
  return ground * rise;
}

/**
 * Signed distance to the made ground (strip, apron, pad, valley floor, track, cove), metres;
 * zero or less on it.
 */
export function islandFloorDistanceLocal(u, v) {
  return floorAt(u, v).distance;
}

const worldPoint = (u, v) => ({ x: CHART.x + u * UX + v * WX, z: CHART.z + u * UZ + v * WZ });
const threshold = worldPoint(STRIP_U0, 0), stripEnd = worldPoint(STRIP_U1, 0);

/** The island's plan: frame, extent and the made places, in world metres. */
export const NORVAST_ISLAND_SHAPE = Object.freeze({
  centre: Object.freeze({ x: CHART.x, z: CHART.z }),
  radius: CHART.radius,
  /** Unit vectors of the island frame in world x, z. */
  axisU: Object.freeze({ x: UX, z: UZ }),
  axisV: Object.freeze({ x: WX, z: WZ }),
  /** The island's box in its own frame (the terrain grid covers it). */
  bounds: Object.freeze({ minU: -960, maxU: 960, minV: -640, maxV: 640 }),
  stripLocal: Object.freeze({ u0: STRIP_U0, u1: STRIP_U1, halfWidth: STRIP_HALF, y: STRIP_Y }),
  padLocal: Object.freeze({ ...PAD }),
  apronLocal: Object.freeze({ ...APRON }),
  hangarLocal: Object.freeze({ ...HANGAR }),
  coveLocal: Object.freeze({ ...COVE }),
  trackLocal: Object.freeze(TRACK.map((point) => Object.freeze([...point]))),
  /** The airstrip; end 0 is the eastern threshold a landing from Marazul crosses. */
  strip: Object.freeze({
    x0: threshold.x, z0: threshold.z, x1: stripEnd.x, z1: stripEnd.z,
    y: STRIP_Y, width: CHART.stripWidth, length: CHART.stripLength, heading: CHART.stripHeading,
  }),
  /** The camouflage-net hangar; its open front (model -Z) faces the strip. */
  hangar: Object.freeze({ ...worldPoint(HANGAR.u, HANGAR.v), heading: (CHART.stripHeading + 270) % 360 }),
  /** Where the handover is staged: on the apron in front of the hangar. */
  handoverPoint: Object.freeze({ x: worldPoint(HANGAR.u, 52).x, y: STRIP_Y, z: worldPoint(HANGAR.u, 52).z }),
  toWorld: worldPoint,
});

/**
 * World metres to the island frame.
 * @param {number} x
 * @param {number} z
 * @param {{u: number, v: number}} out
 */
export function islandLocalOf(x, z, out) {
  const dx = x - CHART.x, dz = z - CHART.z;
  out.u = dx * UX + dz * UZ;
  out.v = dx * WX + dz * WZ;
  return out;
}

/**
 * The island's height at a world place.
 * @param {number} x World X.
 * @param {number} z World Z.
 * @returns {number} Height over sea level (negative: sea bed; all sea beyond the chart's radius).
 */
export function norvastIslandHeightAt(x, z) {
  const dx = x - CHART.x, dz = z - CHART.z;
  return islandHeightLocal(dx * UX + dz * UZ, dx * WX + dz * WZ);
}
