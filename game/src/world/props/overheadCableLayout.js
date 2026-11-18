// Overhead cable layout: where the wires of a lived-in street hang, as plain data. Three lines run
// from cross-arm to cross-arm between neighbouring utility poles (set_street_lighting's
// utility_pole, anchor_wire_1..3), a service drop goes from a pole to the facade behind it, and in
// the crowded districts (Barrio Hierro, La Marisma, the port) wires cross the street from facade to
// facade. Every choice comes from a hash of the segment, so a sector lays out the same cables
// whoever asks. No three.js: Node tests it; overheadCables.js draws the spans.
import { clutterHash } from './streetClutterLayout.js';

/** Per district: how often wires cross the street from facade to facade (1 = every ~12 m). */
export const CABLE_DENSITY = Object.freeze({
  barrio_hierro: 1, la_marisma: 0.8, puerto_tamarindo: 0.5, los_pantanos: 0.3, centro: 0.12,
});
/** utility_pole's wire anchors in the object's space (cross-arm along Z, wires run along X). */
export const POLE_WIRES = Object.freeze([[0.158, 10.3, 1.1], [0, 10.8, 0], [0.158, 10.3, -1.1]]);
/** Where a service drop leaves the pole (object space): under the cross-arm, beside the transformer. */
const POLE_DROP = [0.12, 9.4, 0];
/** Longest span strung between two poles and across a street (metres). */
const MAX_POLE_SPAN = 70;
const MAX_STREET_SPAN = 34;

/**
 * Cables of one sector.
 * @param {{segments: object[], poles: {object: string, x: number, z: number, rotationY: number, segment: number}[],
 *   buildings?: object[], inside?: (x: number, z: number) => boolean, density?: number}} input
 *   segments of the sector, its lamps (utility poles are used), building plans (world edges, y,
 *   height, family), and which points the sector owns (a span belongs to the sector of its start).
 * @returns {{ax: number, ay: number, az: number, bx: number, by: number, bz: number, aBase: number | null,
 *   bBase: number | null, sag: number}[]} Ends in world x, z; ay, by in metres above aBase / bBase
 *   (a building's pad height), or above the ground there when the base is null; sag in metres.
 */
export function layOutSectorCables(input) {
  const { segments = [], poles = [], buildings = [], inside = () => true } = input;
  const density = Math.max(0.1, input.density ?? 1);
  const spans = [];
  const facades = buildings.filter((building) => building.family !== 'tower' && (building.height ?? 0) > 4);
  // Pole to pole, in the order the poles were laid along each segment.
  const bySegment = new Map();
  for (const pole of poles) {
    if (pole.object !== 'utility_pole') continue;
    if (!bySegment.has(pole.segment)) bySegment.set(pole.segment, []);
    bySegment.get(pole.segment).push(pole);
  }
  for (const [segmentId, list] of bySegment) {
    list.forEach((pole, n) => {
      if (!inside(pole.x, pole.z)) return;
      const next = list[n + 1];
      if (next && Math.hypot(next.x - pole.x, next.z - pole.z) < MAX_POLE_SPAN) {
        // Poles on opposite sides face each other: their cross-arms run the other way round.
        const flipped = Math.cos(pole.rotationY - next.rotationY) < 0;
        for (let k = 0; k < 3; k += 1) {
          const a = poleWorld(pole, POLE_WIRES[k]);
          const b = poleWorld(next, POLE_WIRES[flipped ? 2 - k : k]);
          spans.push(span(a, b, null, null, 0.45 + Math.hypot(b[0] - a[0], b[2] - a[2]) * 0.014));
        }
      }
      // A service drop to the building behind the pole (its +Z points away from the road), and
      // often one over the road to the building across it.
      const from = poleWorld(pole, POLE_DROP);
      const awayX = Math.sin(pole.rotationY);
      const awayZ = Math.cos(pole.rotationY);
      const drops = [];
      if (clutterHash(segmentId, n, 51) < 0.75) drops.push([6, 18]);
      const segment = segments.find((each) => each.id === segmentId);
      if (segment && clutterHash(segmentId, n, 52) < 0.5) drops.push([-(2 * (segment.halfWidth ?? 4) + 8), 16]);
      for (const [out, reach] of drops) {
        const hit = facadePoint(facades, pole.x + awayX * out, pole.z + awayZ * out, pole.x, pole.z, reach);
        if (!hit) continue;
        const to = facadeEnd(hit, segmentId, n + (out < 0 ? 500 : 0));
        const length = Math.hypot(to[0] - from[0], to[2] - from[2]);
        if (length < 40) spans.push(span(from, to, null, hit.building.y ?? 0, 0.25 + length * 0.015));
      }
    });
  }
  // Facade to facade across the crowded streets.
  for (const segment of segments) {
    const share = (CABLE_DENSITY[segment.district] ?? 0) * density;
    if (!(share > 0) || segment.bridge || segment.streetscape === 'highway' || segment.roadClass === 'service') continue;
    const step = 12 / Math.min(1.5, share);
    const id = segment.id ?? 0;
    const start = (segment.trimA ?? 0) + 4;
    const end = (segment.length ?? 0) - (segment.trimB ?? 0) - 4;
    const half = segment.halfWidth ?? 4;
    for (let along = start + clutterHash(id, 61) * step, n = 0; along < end; along += step, n += 1) {
      if (clutterHash(id, n, 62) > 0.7) continue;
      const at = pointAlong(segment.points, along);
      if (!at || !inside(at[0], at[1])) continue;
      const [cx, cz, dx, dz] = at;
      const ends = [];
      for (const side of [-1, 1]) {
        const reach = half + (side > 0 ? segment.sidewalkLeft : segment.sidewalkRight) + 0.5;
        if (!(reach > half)) break;
        // A little skew: wires rarely cross square to the street.
        const skew = (clutterHash(id, n, 63 + side) - 0.5) * 5;
        const hit = facadePoint(facades, cx + dz * side * reach + dx * skew, cz - dx * side * reach + dz * skew, cx, cz, 4);
        if (!hit) break;
        ends.push(hit);
      }
      if (ends.length !== 2) continue;
      const [a, b] = ends.map((hit, k) => facadeEnd(hit, id, n * 2 + k));
      const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
      if (length > MAX_STREET_SPAN) continue;
      const sag = 0.3 + length * 0.025;
      spans.push(span(a, b, ends[0].building.y ?? 0, ends[1].building.y ?? 0, sag));
      // Often a second line beside it, a little lower.
      if (clutterHash(id, n, 66) < 0.55) {
        // Along each wall (its tangent), so both ends stay on the walls.
        const [ea, eb] = ends;
        spans.push(span([a[0] - ea.nz * 0.35, a[1] - 0.3, a[2] + ea.nx * 0.35], [b[0] + eb.nz * 0.35, b[1] - 0.3, b[2] - eb.nx * 0.35],
          ea.building.y ?? 0, eb.building.y ?? 0, sag * 1.15));
      }
    }
  }
  return spans;
}

function span(a, b, aBase, bBase, sag) {
  return { ax: a[0], ay: a[1], az: a[2], bx: b[0], by: b[1], bz: b[2], aBase, bBase, sag };
}

/** An object-space point of a pole in world x, z (rotation about +Y) with its height. */
function poleWorld(pole, [x, y, z]) {
  const c = Math.cos(pole.rotationY);
  const s = Math.sin(pole.rotationY);
  return [pole.x + x * c + z * s, y, pole.z - x * s + z * c];
}

/** The fixing point on a facade: 4.6 to 7 m up, under the roof line, a few centimetres proud. */
function facadeEnd(hit, id, n) {
  const height = Math.min((hit.building.height ?? 8) - 0.6, 4.6 + clutterHash(id, n, 67) * 2.4);
  return [hit.x + hit.nx * 0.05, Math.max(3.2, height), hit.z + hit.nz * 0.05];
}

/**
 * The nearest point on a building wall to (x, z) within maxDistance, on a wall that faces the
 * street point (sx, sz). @returns {{x, z, nx, nz, building} | null}
 */
export function facadePoint(buildings, x, z, sx, sz, maxDistance) {
  let best = null;
  let bestDistance = maxDistance;
  for (const building of buildings) {
    for (const edge of building.edges) {
      if (edge.length < 2) continue;
      const t = Math.max(0.6, Math.min(edge.length - 0.6, (x - edge.ax) * edge.tx + (z - edge.az) * edge.tz));
      const px = edge.ax + edge.tx * t;
      const pz = edge.az + edge.tz * t;
      const distance = Math.hypot(px - x, pz - z);
      if (distance >= bestDistance) continue;
      // The wall's outward normal must look towards the street.
      if (edge.nx * (sx - px) + edge.nz * (sz - pz) <= 0) continue;
      bestDistance = distance;
      best = { x: px, z: pz, nx: edge.nx, nz: edge.nz, building };
    }
  }
  return best;
}

function pointAlong(p, along) {
  let travelled = 0;
  for (let i = 0; i + 3 < p.length; i += 2) {
    const length = Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]);
    if (length > 1e-6 && (along <= travelled + length || i + 4 >= p.length)) {
      const dx = (p[i + 2] - p[i]) / length;
      const dz = (p[i + 3] - p[i + 1]) / length;
      const t = Math.min(length, along - travelled);
      return [p[i] + dx * t, p[i + 1] + dz * t, dx, dz];
    }
    travelled += length;
  }
  return null;
}
