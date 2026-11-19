// Port terminal layout: where set_port's containers, stacks, quay cranes, sheds, forklifts and
// trailers stand, as plain data. The container terminal's lot gets blocks of container_stack
// modules (4-6 long, two deep) with single boxes on top and at the block ends, aisles for the
// trucks, a run of steel sheds along the back with trailers backed onto their doors, forklifts
// on the aisles and the chain-link fence. The quay in front gets ship-to-shore cranes on the
// waterside (their landside legs clear of the road) and, along its whole length, rows of single
// boxes, trailers and forklifts on the apron behind the crane track. Every choice comes from a
// hash of the lot or the station, so a sector lays out the same things whoever asks. Single
// boxes carry `tint` (a shipping line's colour: one instanced batch per box type, coloured per
// instance). No three.js: Node tests it; sectorClutterDressing.js turns it into instances.
import { clutterHash, insideQuad, layOutLotFence } from './streetClutterLayout.js';

const SET = 'set_port';
/** One tier of ISO boxes (metres). */
export const CONTAINER_TIER = 2.591;
/** container_stack: 12.24 m along X, three columns 7.32 m across Z, 3 boxes high in the middle. */
const MODULE_ALONG = 12.24;
const MODULE_ACROSS = 7.32;
const MODULE_TOP = 3 * CONTAINER_TIER;
/** Shipping-line colours (linear RGB) for the `paint` shell of single boxes. */
export const LINE_COLOURS = Object.freeze([
  [0.3, 0.07, 0.05], [0.04, 0.12, 0.32], [0.06, 0.22, 0.1], [0.7, 0.22, 0.03], [0.3, 0.32, 0.33],
  [0.03, 0.25, 0.27], [0.5, 0.04, 0.03], [0.62, 0.56, 0.44], [0.16, 0.19, 0.24],
]);
/** Plan sizes [along X, along Z] and pool kind of each object. */
const OBJECTS = Object.freeze({
  container_20: [6.07, 2.44, 'portYard'], container_40: [12.2, 2.44, 'portYard'], container_stack: [12.24, 7.31, 'portYard'],
  steel_shed: [6.0, 14.74, 'portYard'], steel_shed_end: [0.72, 14.44, 'portYard'], forklift: [1.34, 3.8, 'portYard'],
  box_trailer: [2.61, 14.73, 'portYard'], quay_crane: [24, 98, 'crane'],
});
/** The crane's four legs in its own space (x = +-9 on rails at z = +-15.24) and their half size. */
export const CRANE_LEGS = Object.freeze([[-9, -15.24], [9, -15.24], [-9, 15.24], [9, 15.24]]);
const CRANE_LEG_HALF = 0.9;
const CRANE_HALF_GAUGE = 15.24;
/** Metres between cranes along the quay, and how far from the terminal's front they stand. */
const CRANE_PITCH = 36;
const CRANE_REACH = 70;

function item(object, x, z, rotationY, extra) {
  const [sx, sz, kind] = OBJECTS[object];
  return { assetId: SET, object, x, z, rotationY, kind, halfX: sx / 2, halfZ: sz / 2, radius: Math.hypot(sx, sz) / 2, ...extra };
}

/**
 * A test of whether a point lies on a road's carriageway (lanes, median, parking; not the
 * pavement), from the plan's nearest road.
 * @param {{nearestRoad?: (x: number, z: number, max?: number) => ({segment: object, distance: number} | null)}} plan
 * @returns {(x: number, z: number) => boolean}
 */
export function carriagewayTest(plan) {
  return (x, z) => {
    const near = plan?.nearestRoad?.(x, z, 40);
    const s = near?.segment;
    if (!s) return false;
    const half = ((s.lanesForward ?? 1) + (s.lanesBackward ?? 1)) * (s.laneWidth ?? 3.5) / 2 + (s.medianWidth ?? 0) / 2
      + Math.max(s.parkingLeft ?? 0, s.parkingRight ?? 0) + (s.shoulder ?? 0);
    return near.distance < half + 0.3;
  };
}

/** The middle of each container terminal's front edge (where its cranes stand along the quay). */
export function craneSitesOf(lots) {
  const sites = [];
  for (const lot of lots ?? []) {
    if (lot.landmarkKind !== 'container_terminal' || !lot.ring) continue;
    sites.push({ x: (lot.ring[0] + lot.ring[2]) / 2, z: (lot.ring[1] + lot.ring[3]) / 2 });
  }
  return sites;
}

/** A shipping line's colour from a hash in [0, 1). */
export const lineColourOf = (roll) => LINE_COLOURS[Math.floor(roll * LINE_COLOURS.length) % LINE_COLOURS.length];

/**
 * The container terminal on its lot: stacked blocks, sheds, trailers, forklifts, the fence.
 * @param {object} lot A plan lot (ring of four corners, the front edge first; id, y).
 * @returns {object[]} Items {assetId, object, x, z, rotationY, kind, halfX, halfZ, radius, base,
 *   y?, tint?, block?}; boxes of one block may touch (item.block).
 */
export function layOutContainerTerminal(lot) {
  const items = [];
  const ring = lot?.ring;
  if (!ring || ring.length < 8) return items;
  const id = lot.id ?? 0;
  const [ax, az, bx, bz, , , dx, dz] = ring;
  const width = Math.hypot(bx - ax, bz - az);
  const depth = Math.hypot(dx - ax, dz - az);
  if (width < 40 || depth < 40) return items;
  const tx = (bx - ax) / width;
  const tz = (bz - az) / width;
  const nx = (dx - ax) / depth;
  const nz = (dz - az) / depth;
  const alongU = Math.atan2(-tz, tx); // object +X along the front
  // Object +Z with that turn is (-tz, tx): towards the back (+v) or the front.
  const backTurn = -tz * nx + tx * nz > 0 ? alongU : alongU + Math.PI; // object +Z towards the back
  const at = (u, v) => [ax + tx * u + nx * v, az + tz * u + nz * v];
  const r = (n, salt) => clutterHash(id, n, salt);
  const push = (object, u, v, rotationY, extra = {}) => {
    const [x, z] = at(u, v);
    if (insideQuad(ring, x, z, 0.8)) items.push(item(object, x, z, rotationY, { zone: 'yard', lotId: id, ...extra }));
  };
  const single = (object, u, v, turn, tier, n, block) => push(object, u, v, alongU + turn,
    { y: tier * CONTAINER_TIER, tint: lineColourOf(r(n, 97)), block });

  // Two rows of blocks, each two modules deep, aisles of 6 m between blocks and rows.
  const rows = depth >= 70 ? [9, 9 + 2 * MODULE_ACROSS + 6] : [9];
  let n = 0;
  rows.forEach((v0, row) => {
    let u = 6;
    for (let b = 0; u < width - 6 - 2 * MODULE_ALONG; b += 1) {
      let modules = 4 + Math.floor(r(row * 31 + b, 61) * 3);
      modules = Math.min(modules, Math.floor((width - 6 - u - 7) / MODULE_ALONG));
      if (modules < 2) break;
      const block = `${id}:${row}:${b}`;
      for (let m = 0; m < modules; m += 1) {
        for (let k = 0; k < 2; k += 1, n += 1) {
          const cu = u + (m + 0.5) * MODULE_ALONG;
          const cv = v0 + (k + 0.5) * MODULE_ACROSS;
          const turn = r(n, 62) < 0.5 ? Math.PI : 0;
          push('container_stack', cu, cv, alongU + turn, { block });
          // A single 40 ft box on the 3-high middle column of about half the modules.
          if (r(n, 63) < 0.5) single('container_40', cu, cv, turn, 3, n, block);
        }
      }
      // Single boxes at the block's far end: 20 ft boxes in the three columns, one or two high.
      const endU = u + modules * MODULE_ALONG + 3.4;
      for (let k = 0; k < 2; k += 1) {
        for (let c = -1; c <= 1; c += 1, n += 1) {
          if (r(n, 64) < 0.2) continue;
          const v = v0 + (k + 0.5) * MODULE_ACROSS + c * 2.44;
          single('container_20', endU, v, r(n, 65) < 0.5 ? Math.PI : 0, 0, n, block);
          if (r(n, 66) < 0.45) single('container_20', endU, v, r(n, 67) < 0.5 ? Math.PI : 0, 1, n + 500, block);
        }
      }
      // A forklift in the aisle past the block end.
      if (r(b, 68 + row) < 0.7) push('forklift', endU + 5.2, v0 + MODULE_ACROSS * (0.6 + r(b, 69)), alongU + (r(b, 70) < 0.5 ? Math.PI / 2 : -Math.PI / 2));
      u = endU + 3.4 + 6;
    }
  });

  // A run of steel sheds along the back, doors to the yard, trailers backed onto every other door.
  const shedV = depth - 9;
  const lastRowEnd = rows[rows.length - 1] + 2 * MODULE_ACROSS;
  if (shedV - 7.4 - 15.5 > lastRowEnd + 2) {
    const bays = Math.max(3, Math.min(9, Math.floor((width - 34) / 6)));
    const runStart = (width - bays * 6) / 2;
    // Bays turned so their door (-Z) faces the yard (object +Z towards the back).
    const shedTurn = backTurn;
    for (let k = 0; k < bays; k += 1) push('steel_shed', runStart + 3 + k * 6, shedV, shedTurn, { block: `${id}:shed` });
    // The gable ends: on the run's +X end (object space) as is, turned 180 degrees at the -X end.
    const plusXAtEnd = Math.cos(shedTurn - alongU) > 0;
    const endHigh = runStart + bays * 6 + 0.36;
    const endLow = runStart - 0.36;
    push('steel_shed_end', plusXAtEnd ? endHigh : endLow, shedV, shedTurn, { block: `${id}:shed` });
    push('steel_shed_end', plusXAtEnd ? endLow : endHigh, shedV, shedTurn + Math.PI, { block: `${id}:shed` });
    for (let k = 1; k < bays; k += 2) {
      if (r(k, 71) < 0.25) continue;
      // Kingpin (-Z) towards the yard, the rear doors (+Z) at the shed door.
      push('box_trailer', runStart + 3 + k * 6, shedV - 7.4 - 7.9, backTurn, { block: `${id}:shed` });
    }
    if (r(3, 72) < 0.8) push('forklift', runStart - 4, shedV - 10, backTurn + Math.PI / 2);
  }
  // A roadside billboard (set_roadside) at a front corner, its face (-Z) to the road along the
  // front; the head is 9.4 m up, over the stacks, so only the pole needs a clear spot.
  for (const u of [3, width - 3]) {
    const [x, z] = at(u, 3);
    if (items.some((each) => Math.abs(each.x - x) < (each.halfX ?? 1) + 1.2 && Math.abs(each.z - z) < (each.halfX ?? 1) + 1.2 && !each.fence)) continue;
    items.push({ assetId: 'set_roadside', object: 'billboard_monopole', x, z, rotationY: backTurn, kind: 'billboard', halfX: 1, halfZ: 1,
      radius: 1, zone: 'yard', lotId: id, mounted: true, legs: [[0, 0, 0.95]] });
    break;
  }
  items.push(...layOutLotFence(lot, id));
  for (const each of items) each.base = lot.y ?? 0;
  return items;
}

/**
 * The quay apron: gantry cranes in front of the terminal and single boxes, trailers and forklifts
 * along the whole quay behind the crane track (about 21 m in from the edge).
 * @param {{edge: number[], craneRails?: number[][], y?: number}} quay The plan's quay area.
 * @param {{onRoad?: (x: number, z: number) => boolean, isWater?: (x: number, z: number) => boolean,
 *   craneSites?: {x: number, z: number}[]}} [options] onRoad: the point is on a carriageway;
 *   craneSites: the fronts of the container terminals (cranes stand within 70 m of one).
 * @returns {object[]} Items as layOutContainerTerminal's; cranes carry `legs` (object-space
 *   [x, z, half] boxes) and `mounted` (no box collider round the whole crane).
 */
export function layOutQuayApron(quay, options = {}) {
  const items = [];
  const edge = quay?.edge;
  const rail = quay?.craneRails?.[0];
  if (!edge || edge.length < 4) return items;
  const onRoad = options.onRoad ?? (() => false);
  const isWater = options.isWater ?? (() => false);
  const sites = options.craneSites ?? [];
  const base = quay.y ?? 0;
  // Inland normal per vertex: from the edge to the first crane rail (6 m in), else the left side.
  const count = edge.length / 2;
  let lastCrane = -Infinity;
  let walked = 0;
  for (let i = 0; i + 1 < count; i += 1) {
    const ex = edge[i * 2];
    const ez = edge[i * 2 + 1];
    const fx = edge[i * 2 + 2];
    const fz = edge[i * 2 + 3];
    const length = Math.hypot(fx - ex, fz - ez);
    if (length < 1) continue;
    const tx = (fx - ex) / length;
    const tz = (fz - ez) / length;
    let nx = -tz;
    let nz = tx;
    if (rail && rail.length >= i * 2 + 2) {
      const ix = rail[i * 2] - ex;
      const iz = rail[i * 2 + 1] - ez;
      if (ix * nx + iz * nz < 0) { nx = -nx; nz = -nz; }
    }
    const alongEdge = Math.atan2(-tz, tx);
    const inland = Math.atan2(nx, nz); // object +Z inland
    // Stations every 13 m along the whole edge (not restarting at each vertex).
    const pieceStart = walked;
    walked += length;
    for (let s = Math.ceil(pieceStart / 13) * 13 - pieceStart; s < length; s += 13) {
      const px = ex + tx * s;
      const pz = ez + tz * s;
      const station = Math.round((pieceStart + s) / 13);
      // Cranes: boom (-Z) over the water, waterside legs 1-2.5 m in, landside legs off the road.
      const nearSite = sites.some((site) => Math.hypot(site.x - (px + nx * 30), site.z - (pz + nz * 30)) < CRANE_REACH);
      if (nearSite && pieceStart + s - lastCrane >= CRANE_PITCH) {
        for (const offset of [2.5, 1.8, 1.2]) {
          const cx = px + nx * (offset + CRANE_HALF_GAUGE);
          const cz = pz + nz * (offset + CRANE_HALF_GAUGE);
          const c = Math.cos(inland);
          const sn = Math.sin(inland);
          const clear = CRANE_LEGS.every(([lx, lz]) => {
            const x = cx + c * lx + sn * lz;
            const z = cz - sn * lx + c * lz;
            return !onRoad(x, z) && !isWater(x, z);
          });
          if (!clear) continue;
          items.push(item('quay_crane', cx, cz, inland, {
            zone: 'quay', base, mounted: true, legs: CRANE_LEGS.map(([lx, lz]) => [lx, lz, CRANE_LEG_HALF]),
          }));
          lastCrane = pieceStart + s;
          break;
        }
      }
      // The apron row 21 m in: boxes one or two high, a trailer or a forklift, gaps between groups.
      const roll = clutterHash(station, 0, 91);
      if (clutterHash(Math.floor(station / 4), 1, 92) < 0.3 || roll < 0.12) continue;
      const rx = px + nx * 21;
      const rz = pz + nz * 21;
      const ends = [[rx - tx * 6.5, rz - tz * 6.5], [rx + tx * 6.5, rz + tz * 6.5], [rx + nx * 2, rz + nz * 2]];
      if (ends.some(([x, z]) => onRoad(x, z) || isWater(x, z))) continue;
      const block = `quay:${station}`;
      const tint = lineColourOf(clutterHash(station, 2, 93));
      if (roll < 0.62) {
        const turn = clutterHash(station, 3, 94) < 0.5 ? Math.PI : 0;
        items.push(item('container_40', rx, rz, alongEdge + turn, { zone: 'quay', base, tint, block }));
        if (clutterHash(station, 4, 95) < 0.45) {
          items.push(item('container_40', rx, rz, alongEdge + Math.PI - turn, { zone: 'quay', base, y: CONTAINER_TIER, tint: lineColourOf(clutterHash(station, 5, 96)), block }));
        }
      } else if (roll < 0.78) {
        for (const side of [-1, 1]) items.push(item('container_20', rx + tx * side * 3.15, rz + tz * side * 3.15, alongEdge + (side < 0 ? Math.PI : 0), { zone: 'quay', base, tint: lineColourOf(clutterHash(station, side + 7, 97)), block }));
      } else if (roll < 0.9) {
        // A trailer parked along the quay (its length along the edge).
        items.push(item('box_trailer', rx, rz, alongEdge + Math.PI / 2, { zone: 'quay', base, block }));
      } else {
        items.push(item('forklift', rx, rz, inland + (clutterHash(station, 6, 98) - 0.5) * 1.2, { zone: 'quay', base }));
      }
    }
  }
  return items;
}

export const PORT_OBJECT_SIZES = OBJECTS;
export { MODULE_ALONG, MODULE_ACROSS, MODULE_TOP };
