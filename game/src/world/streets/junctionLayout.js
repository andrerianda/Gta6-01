// The shape of every junction surface: where three or more roads meet, the asphalt between their
// trimmed ends (one ring, star-shaped about the node) and the pavement corners between
// neighbouring arms, whose kerbs curve from one road's kerb line into the next; where a road
// ends in a cul-de-sac, the turning circle. Pure data built from the sampled centre lines, so
// the edges match the road strips exactly.
//
//   const junction = layOutJunction(node, lines, sections);
//   junction.ring       // [{x, y, z}] clockwise seen from above, kerb to kerb round the node
//   junction.corners    // [{kerb: [{x, y, z}], outer: [{x, y, z}], raised}]

import { crownHeight } from './roadSampling.js';

/** Points per curved kerb of a corner. */
const CORNER_STEPS = 8;

/**
 * Lays out one node; null when the node needs no surface of its own (a bend or a map exit).
 * @param {Object} node A plan node (with `arms`).
 * @param {import('./roadSampling.js').RoadCentreLine[]} lines Sampled centre lines by segment id.
 * @param {import('./roadSampling.js').RoadCrossSection[]} sections Cross-sections by segment id.
 * @returns {?{ring: {x: number, y: number, z: number}[], centre: {x: number, y: number, z: number},
 *   corners: {kerb: {x: number, y: number, z: number}[], outer: {x: number, y: number, z: number}[], raised: boolean}[]}}
 */
export function layOutJunction(node, lines, sections) {
  const arms = node.arms ?? [];
  if (arms.length === 2 || arms.length === 0) return null;
  if (arms.length === 1 && node.control !== 'cul_de_sac') return null;
  const ends = arms.map((arm) => armEnd(arm, lines[arm.segment], sections[arm.segment]));
  const ring = [];
  const corners = [];
  for (let i = 0; i < ends.length; i += 1) {
    const end = ends[i];
    for (const point of end.edge) ring.push(point);
    const next = ends[(i + 1) % ends.length];
    if (ends.length === 1) {
      const circle = turningCircle(node, end);
      for (const point of circle.kerb.slice(1, -1)) ring.push(point);
      corners.push(circle);
      continue;
    }
    const kerb = cornerCurve(end.right, end.leaving, next.left, next.leaving);
    const outer = cornerCurve(end.rightOuter, end.leaving, next.leftOuter, next.leaving);
    for (let k = 1; k < kerb.length - 1; k += 1) ring.push(kerb[k]);
    corners.push({ kerb, outer, raised: end.kerbRight || next.kerbLeft });
  }
  let y = 0;
  for (const point of ring) y += point.y;
  return { ring, centre: { x: node.x, y: y / ring.length, z: node.z }, corners };
}

/** The trimmed end of one arm: its edge across the road and its kerb and outer corner points. */
function armEnd(arm, line, section) {
  const index = arm.atStart ? 0 : line.count - 1;
  const x = line.x[index];
  const z = line.z[index];
  const y = line.y[index];
  const tx = line.tx[index];
  const tz = line.tz[index];
  const at = (s, lift = 0) => ({ x: x - tz * s, y: y + lift, z: z + tx * s });
  // Left and right as seen leaving the node along the arm.
  const sign = arm.atStart ? 1 : -1;
  const lateral = arm.atStart ? section.lateral : [...section.lateral].reverse();
  const edge = lateral.map((s) => at(s, crownHeight(section, s)));
  return {
    edge,
    leaving: { x: tx * sign, z: tz * sign },
    right: at(sign * section.halfWidth),
    left: at(-sign * section.halfWidth),
    rightOuter: at(sign * (arm.atStart ? section.outerRight : section.outerLeft)),
    leftOuter: at(-sign * (arm.atStart ? section.outerLeft : section.outerRight)),
    kerbRight: arm.atStart ? section.kerbRight : section.kerbLeft,
    kerbLeft: arm.atStart ? section.kerbLeft : section.kerbRight,
    halfWidth: section.halfWidth,
    outerWidth: Math.max(section.outerLeft, section.outerRight) - section.halfWidth,
  };
}

/**
 * The kerb from one arm's corner point to the next arm's: a quadratic curve through the meeting
 * point of the two kerb lines when they meet on the node's side, else a straight line.
 */
function cornerCurve(a, aDirection, b, bDirection) {
  const cross = aDirection.x * bDirection.z - aDirection.z * bDirection.x;
  let control = null;
  if (Math.abs(cross) > 0.08) {
    // a + u * aDirection = b + v * bDirection
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const u = (dx * bDirection.z - dz * bDirection.x) / cross;
    const v = (dx * aDirection.z - dz * aDirection.x) / cross;
    if (u < 0.5 && v < 0.5 && u > -60 && v > -60) control = { x: a.x + aDirection.x * u, z: a.z + aDirection.z * u };
  }
  const points = [];
  for (let k = 0; k <= CORNER_STEPS; k += 1) {
    const t = k / CORNER_STEPS;
    const y = a.y + (b.y - a.y) * t;
    if (k === 0) points.push(a);
    else if (k === CORNER_STEPS) points.push(b);
    else if (control) {
      const w0 = (1 - t) * (1 - t);
      const w1 = 2 * t * (1 - t);
      const w2 = t * t;
      points.push({ x: w0 * a.x + w1 * control.x + w2 * b.x, y, z: w0 * a.z + w1 * control.z + w2 * b.z });
    } else {
      points.push({ x: a.x + (b.x - a.x) * t, y, z: a.z + (b.z - a.z) * t });
    }
  }
  return points;
}

/** The turning circle at a cul-de-sac: from the right kerb round the far side to the left kerb. */
function turningCircle(node, end) {
  const radius = Math.max(9, end.halfWidth + 3);
  const cx = node.x;
  const cz = node.z;
  const startAngle = Math.atan2(end.right.z - cz, end.right.x - cx);
  let stopAngle = Math.atan2(end.left.z - cz, end.left.x - cx);
  // Clockwise seen from above is increasing atan2(z, x) here (+Z is south).
  while (stopAngle <= startAngle) stopAngle += Math.PI * 2;
  const steps = 20;
  const kerb = [];
  const outer = [];
  const width = Math.max(1.6, end.outerWidth);
  for (let k = 0; k <= steps; k += 1) {
    const angle = startAngle + ((stopAngle - startAngle) * k) / steps;
    const r = k === 0 || k === steps ? null : radius;
    const point = k === 0 ? end.right : k === steps ? end.left : { x: cx + Math.cos(angle) * r, y: end.right.y, z: cz + Math.sin(angle) * r };
    kerb.push(point);
    const reach = Math.hypot(point.x - cx, point.z - cz) + width;
    outer.push({ x: cx + Math.cos(angle) * reach, y: point.y, z: cz + Math.sin(angle) * reach });
  }
  return { kerb, outer, raised: end.kerbRight || end.kerbLeft };
}
