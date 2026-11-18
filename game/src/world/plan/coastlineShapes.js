// The shape of the land and the water of Marazul: the mainland and the island as rings whose
// every vertex knows what kind of shore it is (beach, quay, sea wall, rock, marsh), and the
// river, the wetland channels and the ponds as centre lines with a width that are carved out of
// the land. The terrain turns these into a height field; the painter and the boat lanes read
// the polygons.
//
//   const coast = buildCoastlineShapes(random.fork('coast'));
//   coast.landRings[0].ring      // the mainland, counter-clockwise, flat [x, z, ...]
//   coast.carves[0]              // the Rio Tamarindo: points, half widths, outline ring

import { cityPointsToWorld } from './cityFrame.js';
import { cumulativeLengths, offsetPolyline, resamplePolyline, reversePoints, smoothCurve } from './planGeometry.js';

/**
 * The cross-section of each kind of shore. `bank` is the height of the land right at the water,
 * `rise` the distance inland over which it climbs to the level of the plain, `near` the depth of
 * the water right at the edge and `slope` how fast it deepens per metre offshore.
 * @type {ReadonlyArray<Readonly<{name: string, bank: number, rise: number, near: number, slope: number, sand: number}>>}
 */
export const SHORE_KINDS = Object.freeze([
  Object.freeze({ name: 'beach', bank: 0, rise: 105, near: 0, slope: 0.034, sand: 1 }),
  Object.freeze({ name: 'seawall', bank: 2.0, rise: 8, near: 1.6, slope: 0.045, sand: 0 }),
  Object.freeze({ name: 'quay', bank: 2.5, rise: 1, near: 7, slope: 0.012, sand: 0 }),
  Object.freeze({ name: 'rocky', bank: 0.9, rise: 30, near: 0.9, slope: 0.05, sand: 0 }),
  Object.freeze({ name: 'marsh', bank: 0.1, rise: 60, near: 0.2, slope: 0.01, sand: 0 }),
  Object.freeze({ name: 'riverbank', bank: 0.9, rise: 14, near: 1.2, slope: 0.065, sand: 0 }),
  Object.freeze({ name: 'channel', bank: 0.1, rise: 25, near: 0.4, slope: 0.08, sand: 0 }),
]);

const KIND_INDEX = Object.freeze(Object.fromEntries(SHORE_KINDS.map((kind, index) => [kind.name, index])));

// The mainland, as runs of shore in city coordinates, counter-clockwise from the south-west
// corner of the port: [kind, smooth?, noise amplitude, noise wavelength, e0, n0, e1, n1, ...].
const MAINLAND_RUNS = [
  ['quay', false, 0, 0, -1120, -1180, -700, -1180],
  ['seawall', false, 0, 0, -700, -1180, -700, -1330, -672, -1330, -672, -1045],
  ['beach', true, 3, 320, -672, -1045, -640, -1012, -560, -1000, -200, -1004, 200, -998, 600, -1003, 900, -999, 1040, -1002, 1085, -1012],
  ['seawall', true, 0, 0, 1085, -1012, 1105, -1085, 1150, -1160, 1235, -1185, 1290, -1150, 1295, -1090],
  ['quay', false, 0, 0, 1295, -1090, 1295, -735, 1325, -705, 1515, -705, 1545, -735, 1545, -1060],
  ['seawall', true, 0, 0, 1545, -1060, 1560, -1140, 1630, -1185, 1705, -1165, 1742, -1085],
  ['seawall', true, 2, 260, 1742, -1085, 1748, -700, 1742, -300, 1738, 200, 1742, 700, 1732, 1050],
  ['rocky', true, 7, 150, 1732, 1050, 1690, 1250, 1560, 1370, 1350, 1425, 1000, 1400, 600, 1440, 300, 1405],
  ['marsh', true, 12, 130, 300, 1405, 0, 1450, -400, 1410, -800, 1460, -1200, 1425, -1500, 1440, -1680, 1330,
    -1702, 900, -1690, 400, -1702, -100, -1680, -500, -1620, -800, -1530, -960, -1440, -1000],
  ['marsh', true, 4, 140, -1440, -1000, -1395, -900, -1335, -700, -1312, -520, -1310, -425],
  ['riverbank', false, 0, 0, -1310, -425, -1120, -420],
  ['quay', false, 0, 0, -1120, -420, -1120, -1180],
];

/** The island of Isla Coral: centre and radii in city coordinates. */
export const ISLAND_SHAPE = Object.freeze({ e: 1600, n: -1680, radiusE: 290, radiusN: 175 });

// Carved water in city coordinates: [id, kind, shore kind, e, n, half width, ...].
const CARVED_WATER = [
  ['rio_tamarindo', 'river', 'riverbank',
    -1085, 1500, 40, -1125, 1280, 40, -1030, 1080, 42, -1150, 870, 46, -1250, 660, 52, -1262, 400, 54,
    -1238, 150, 55, -1255, 0, 55, -1245, -200, 56, -1250, -330, 62, -1228, -440, 80, -1215, -520, 95],
  ['channel_1', 'channel', 'channel', -560, 1470, 10, -540, 1360, 9, -600, 1280, 8, -560, 1215, 7],
  ['channel_2', 'channel', 'channel', -880, 1480, 11, -860, 1380, 9, -800, 1300, 8, -830, 1230, 7],
  ['channel_3', 'channel', 'channel', -330, 1440, 10, -350, 1330, 9, -280, 1250, 8, -320, 1190, 7],
  ['channel_4', 'channel', 'channel', 520, 1440, 12, 500, 1340, 11, 560, 1250, 10, 530, 1150, 9, 600, 1060, 8, 570, 960, 7],
  ['channel_5', 'channel', 'channel', 560, 1250, 8, 680, 1290, 8, 780, 1420, 10],
  ['channel_6', 'channel', 'channel', -1705, 250, 10, -1640, 270, 9, -1590, 230, 7],
  ['channel_7', 'channel', 'channel', -1700, -250, 10, -1650, -270, 8],
  ['channel_8', 'channel', 'channel', -1350, 1435, 10, -1400, 1330, 9, -1470, 1260, 7],
  ['pond_1', 'pond', 'channel', -820, 900, 15, -700, 880, 18, -600, 920, 14],
  ['pond_2', 'pond', 'channel', -1470, 900, 20, -1430, 960, 22],
  ['pond_3', 'pond', 'channel', 60, 1100, 20, 180, 1130, 24],
];

/**
 * Builds the land rings and the carved water of the city.
 * @param {import('../../core/random/seededRandom.js').SeededRandom} random Seeded generator; it
 *   only shapes the small irregularities of the natural shores.
 * @returns {CoastlineShapes}
 */
export function buildCoastlineShapes(random) {
  const mainland = buildMainlandRing(random.fork('mainland'));
  const island = buildIslandRing(random.fork('island'));
  const carves = CARVED_WATER.map((entry) => buildCarve(entry));
  const waterBodies = carves.map((carve) => ({ id: carve.id, kind: carve.kind, ring: carve.ring }));
  waterBodies.push(
    { id: 'bahia_vista_bay', kind: 'bay', ring: cityPointsToWorld([1295, -1090, 1545, -1060, 1545, -735, 1515, -705, 1325, -705, 1295, -735]) },
    { id: 'tamarindo_estuary', kind: 'estuary', ring: cityPointsToWorld([-1440, -1000, -1120, -1180, -1120, -420, -1310, -425, -1335, -700, -1395, -900]) },
  );
  return {
    landRings: [mainland, island],
    carves,
    waterBodies,
    shoreKinds: SHORE_KINDS,
  };
}

/**
 * @typedef {Object} LandRing
 * @property {string} id 'mainland' or 'isla_coral'.
 * @property {number[]} ring Flat world ring, counter-clockwise seen from above.
 * @property {Uint8Array} kinds The shore kind of each vertex, an index into SHORE_KINDS.
 */
/**
 * @typedef {Object} CarvedWater
 * @property {string} id
 * @property {'river'|'channel'|'pond'} kind
 * @property {number} shoreKind Index into SHORE_KINDS.
 * @property {number[]} points Flat world centre line.
 * @property {number[]} halfWidths Half the width of the water at each point.
 * @property {number[]} ring The outline of the water, for maps.
 */
/**
 * @typedef {Object} CoastlineShapes
 * @property {LandRing[]} landRings
 * @property {CarvedWater[]} carves
 * @property {{id: string, kind: string, ring: number[]}[]} waterBodies Named water for maps and labels.
 * @property {typeof SHORE_KINDS} shoreKinds
 */

function buildMainlandRing(random) {
  const cityRing = [];
  const kinds = [];
  for (const run of MAINLAND_RUNS) {
    const [kindName, smooth, amplitude, wavelength] = run;
    const control = run.slice(4);
    let points = smooth ? smoothCurve(control, 14) : resamplePolyline(control, 20);
    if (amplitude > 0) points = roughenShore(points, amplitude, wavelength, random);
    // Every run ends where the next begins, so its last point is left to the next run.
    for (let i = 0; i < points.length - 2; i += 2) {
      cityRing.push(points[i], points[i + 1]);
      kinds.push(KIND_INDEX[kindName]);
    }
  }
  return { id: 'mainland', ring: cityPointsToWorld(cityRing), kinds: Uint8Array.from(kinds) };
}

function buildIslandRing(random) {
  const { e, n, radiusE, radiusN } = ISLAND_SHAPE;
  const phaseA = random.range(0, Math.PI * 2);
  const phaseB = random.range(0, Math.PI * 2);
  const cityRing = [];
  const kinds = [];
  const steps = 112;
  for (let i = 0; i < steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    const wobble = 1 + 0.05 * Math.sin(angle * 3 + phaseA) + 0.03 * Math.sin(angle * 5 + phaseB);
    cityRing.push(e + Math.cos(angle) * radiusE * wobble, n + Math.sin(angle) * radiusN * wobble);
    // The south shore of the island is a private beach; the rest is a low sea wall.
    kinds.push(Math.sin(angle) < -0.35 ? KIND_INDEX.beach : KIND_INDEX.seawall);
  }
  return { id: 'isla_coral', ring: cityPointsToWorld(cityRing), kinds: Uint8Array.from(kinds) };
}

function buildCarve(entry) {
  const [id, kind, shoreName] = entry;
  const control = [];
  const widths = [];
  for (let i = 3; i < entry.length; i += 3) {
    control.push(entry[i], entry[i + 1]);
    widths.push(entry[i + 2]);
  }
  const cityPoints = smoothCurve(control, 12);
  // Half widths follow the control points by distance along the centre line.
  const controlAlong = cumulativeLengths(control);
  const along = cumulativeLengths(cityPoints);
  const scale = controlAlong[controlAlong.length - 1] / (along[along.length - 1] || 1);
  const halfWidths = along.map((distance) => {
    const d = distance * scale;
    let k = 0;
    while (k < controlAlong.length - 2 && controlAlong[k + 1] < d) k += 1;
    const span = controlAlong[k + 1] - controlAlong[k] || 1;
    const t = Math.min(1, Math.max(0, (d - controlAlong[k]) / span));
    return widths[k] + (widths[k + 1] - widths[k]) * t;
  });
  const points = cityPointsToWorld(cityPoints);
  return { id, kind, shoreKind: KIND_INDEX[shoreName], points, halfWidths, ring: outlineOfCarve(points, halfWidths) };
}

// The outline of a carved channel: its right bank out and its left bank back.
function outlineOfCarve(points, halfWidths) {
  const count = points.length / 2;
  const right = [];
  const left = [];
  const unit = offsetPolyline(points, 1);
  for (let i = 0; i < count; i += 1) {
    const nx = unit[i * 2] - points[i * 2];
    const nz = unit[i * 2 + 1] - points[i * 2 + 1];
    right.push(points[i * 2] + nx * halfWidths[i], points[i * 2 + 1] + nz * halfWidths[i]);
    left.push(points[i * 2] - nx * halfWidths[i], points[i * 2 + 1] - nz * halfWidths[i]);
  }
  // Right bank forward then left bank backward runs clockwise; turn it round.
  return reversePoints(right.concat(reversePoints(left)));
}

// Pushes the points of a natural shore in and out along its normal by smooth noise that fades to
// nothing at both ends, so that neighbouring runs still meet.
function roughenShore(points, amplitude, wavelength, random) {
  const along = cumulativeLengths(points);
  const total = along[along.length - 1];
  const knots = Math.max(2, Math.ceil(total / wavelength) + 1);
  const values = [];
  for (let i = 0; i < knots; i += 1) values.push(random.range(-1, 1));
  const shifted = offsetPolyline(points, 1);
  const out = points.slice();
  for (let i = 1; i < along.length - 1; i += 1) {
    const position = (along[i] / total) * (knots - 1);
    const k = Math.min(knots - 2, Math.floor(position));
    const t = position - k;
    const eased = t * t * (3 - 2 * t);
    const noise = values[k] + (values[k + 1] - values[k]) * eased;
    const fade = Math.min(1, along[i] / 60, (total - along[i]) / 60);
    const push = noise * amplitude * fade;
    out[i * 2] += (shifted[i * 2] - points[i * 2]) * push;
    out[i * 2 + 1] += (shifted[i * 2 + 1] - points[i * 2 + 1]) * push;
  }
  return out;
}
