// Marazul's waterfront as buildable pieces, pure data from the plan's special areas: the paved
// promenade on the sea side of Bulevar Dorado with its low sea wall (open where the pier starts
// and at steps down to the sand), the pier at the foot of Avenida de los Fundadores (a ramp up
// from the promenade, a deck on piles, a wide head, railings all round), the marina's quay wall
// and its finger pontoons (a gangway down from the quay, then a low deck on piles), and the
// port quays (a sheer concrete wall to the water and the crane rails on the apron). Long things
// are cut into pieces of at most 24 m, each owned by the 128 m sector holding its midpoint.
//
//   const pieces = planWaterfrontPieces(plan);   // [{ kind, cell, ... }]
//   kinds: 'deck' (ax, az, bx, bz, width, ya, yb, surface, piles), 'wall' (ax, az, bx, bz, top,
//   bottom, nx, nz: the face looks that way), 'railing' (ax, az, bx, bz, y), 'rail' (ax, az, bx, bz, y)

import { KERB_HEIGHT } from '../streets/roadSampling.js';

/** Crane rails are set into the ground in lengths of at most this, metres. */
const RAIL_STEP = 12;
/** Longest piece, metres. */
export const WATERFRONT_PIECE_LENGTH = 24;
const PROMENADE_WALL_GAP = 4;
const PROMENADE_STEPS_EVERY = 90;
/** The promenade's steps to the sand: tread depth and rise of one step, metres. */
const STEP_TREAD = 0.36;
const STEP_RISE = 0.17;
const DECK_THICKNESS = 0.35;
/** How far a marina or port quay wall reaches inland: its top is the apron's edge and covers
 * the terrain grid's last 4 m cell, which slopes down behind the wall to the carved sea floor
 * (the port's waterside crane rail is 2.5 m in, on the wall's top). */
const QUAY_WALL_DEPTH = 5;

/**
 * @param {Object} plan The city plan (specialAreas, sectors, heightAt).
 * @returns {Object[]} Pieces, each with `cell` (the owning sector's index) and `kind`.
 */
export function planWaterfrontPieces(plan) {
  const pieces = [];
  const grid = plan.sectors;
  const cellOf = (x, z) => {
    const c = Math.min(grid.columns - 1, Math.max(0, Math.floor((x - grid.minX) / grid.size)));
    const r = Math.min(grid.rows - 1, Math.max(0, Math.floor((z - grid.minZ) / grid.size)));
    return r * grid.columns + c;
  };
  const push = (piece) => pieces.push({ ...piece, cell: cellOf((piece.ax + piece.bx) / 2, (piece.az + piece.bz) / 2) });
  /** Cuts a straight run into pieces of at most the piece length, interpolating `ya`/`yb`. */
  const cut = (base, ax, az, bx, bz, ya = 0, yb = ya) => {
    const length = Math.hypot(bx - ax, bz - az);
    const count = Math.max(1, Math.ceil(length / WATERFRONT_PIECE_LENGTH));
    for (let k = 0; k < count; k += 1) {
      const t0 = k / count;
      const t1 = (k + 1) / count;
      push({ ...base, ax: ax + (bx - ax) * t0, az: az + (bz - az) * t0, bx: ax + (bx - ax) * t1, bz: az + (bz - az) * t1, ya: ya + (yb - ya) * t0, yb: ya + (yb - ya) * t1 });
    }
  };
  const cutPolyline = (base, points) => {
    for (let i = 0; i + 3 < points.length; i += 2) cut(base, points[i], points[i + 1], points[i + 2], points[i + 3]);
  };
  const safeHeight = (x, z, fallback) => {
    const y = plan.heightAt(x, z);
    return Number.isFinite(y) ? y : fallback;
  };
  // The height a crane rail piece is drawn at (its top is 0.1 m above): within the quay wall's
  // depth the wall's top, else the ground there, raised by the kerb on a road's pavement.
  const railBedAt = (area, x, z, dx, dz) => {
    const length = Math.hypot(dx, dz) || 1;
    let nx = dz / length;
    let nz = -dx / length;
    if (plan.shoreDistanceAt(x + nx * 3, z + nz * 3) < plan.shoreDistanceAt(x - nx * 3, z - nz * 3)) {
      nx = -nx;
      nz = -nz;
    }
    const shore = plan.shoreDistanceAt(x, z);
    if (shore < QUAY_WALL_DEPTH) {
      const inland = 8 - Math.max(0, shore);
      return Math.max(1, Math.min(area.y, safeHeight(x + nx * inland, z + nz * inland, area.y)) + 0.03) - 0.07;
    }
    const road = plan.nearestRoad?.(x, z, 24);
    const segment = road?.segment;
    const pavement = segment && road.distance > segment.halfWidth && road.distance < segment.halfWidth + Math.max(segment.sidewalkLeft ?? 0, segment.sidewalkRight ?? 0) + 0.3;
    return safeHeight(x, z, area.y) + (pavement ? KERB_HEIGHT : 0) - 0.07;
  };

  const promenade = plan.specialAreas.find((area) => area.kind === 'promenade');
  const pier = plan.specialAreas.find((area) => area.kind === 'pier');
  let pierAt = null;
  if (promenade) {
    const [ax, az, bx, bz] = promenade.line;
    const length = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / length;
    const dz = (bz - az) / length;
    // The sea side: the right of the line (-dz, dx) or its left, whichever is lower ground.
    const probe = promenade.width / 2 + 6;
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    const side = safeHeight(mx - dz * probe, mz + dx * probe, 0) < safeHeight(mx + dz * probe, mz - dx * probe, 0) ? 1 : -1;
    const sx = -dz * side;
    const sz = dx * side;
    cut({ kind: 'deck', width: promenade.width, surface: 'promenade', piles: false, thickness: 0.6 }, ax, az, bx, bz, promenade.y, promenade.y);
    // The sea wall, broken by steps to the sand and by the pier's mouth.
    if (pier) {
      const [px, pz] = pier.line;
      pierAt = (px - ax) * dx + (pz - az) * dz;
    }
    const half = promenade.width / 2 - 0.2;
    const openings = [];
    for (let a = PROMENADE_STEPS_EVERY / 2; a < length; a += PROMENADE_STEPS_EVERY) {
      openings.push([a - PROMENADE_WALL_GAP / 2, a + PROMENADE_WALL_GAP / 2]);
      // A flight of steps from the paving's sea edge down to the sand, as long as the drop needs.
      const ex = ax + dx * a + sx * (promenade.width / 2);
      const ez = az + dz * a + sz * (promenade.width / 2);
      const top = promenade.y + 0.06;
      let run = STEP_TREAD;
      while (run < 14 && top - (run / STEP_TREAD) * STEP_RISE > safeHeight(ex + sx * run, ez + sz * run, top) + STEP_RISE) run += STEP_TREAD;
      const bottom = top - (run / STEP_TREAD) * STEP_RISE;
      if (run > STEP_TREAD) cut({ kind: 'steps', width: PROMENADE_WALL_GAP - 0.2, tread: STEP_TREAD, rise: STEP_RISE }, ex, ez, ex + sx * run, ez + sz * run, top, bottom);
    }
    if (pierAt !== null) openings.push([pierAt - (pier.width / 2 + 0.5), pierAt + pier.width / 2 + 0.5]);
    openings.sort((p, q) => p[0] - q[0]);
    let from = 0;
    const wall = (a0, a1) => {
      if (a1 - a0 < 1) return;
      const x0 = ax + dx * a0 + sx * half;
      const z0 = az + dz * a0 + sz * half;
      const x1 = ax + dx * a1 + sx * half;
      const z1 = az + dz * a1 + sz * half;
      const bottom = Math.min(safeHeight(x0 + sx * 2, z0 + sz * 2, promenade.y), safeHeight(x1 + sx * 2, z1 + sz * 2, promenade.y)) - 0.4;
      cut({ kind: 'wall', top: promenade.y + 0.6, bottom, nx: sx, nz: sz, thickness: 0.4 }, x0, z0, x1, z1);
    };
    for (const [o0, o1] of openings) {
      wall(from, Math.min(o0, length));
      from = Math.max(from, o1);
    }
    wall(from, length);
  }

  if (pier) {
    const [p0x, p0z, p1x, p1z] = pier.line;
    const length = Math.hypot(p1x - p0x, p1z - p0z);
    const dx = (p1x - p0x) / length;
    const dz = (p1z - p0z) / length;
    const rx = -dz;
    const rz = dx;
    const startY = promenade ? promenade.y : pier.deckHeight;
    const startOffset = promenade ? promenade.width / 2 : 0;
    const head = extentsAlong(pier.head, p0x, p0z, dx, dz);
    const endOffset = head.far;
    const headFrom = head.near;
    const at = (a, s) => [p0x + dx * a + rx * s, p0z + dz * a + rz * s];
    const ramp = pier.rampLength ?? 14;
    const deckY = pier.deckHeight;
    const deck = { kind: 'deck', width: pier.width, surface: 'planks', piles: true, thickness: DECK_THICKNESS };
    cut({ ...deck, piles: false }, ...at(startOffset, 0), ...at(startOffset + ramp, 0), startY, deckY);
    cut(deck, ...at(startOffset + ramp, 0), ...at(headFrom, 0), deckY, deckY);
    const headWidth = head.right - head.left;
    cut({ ...deck, width: headWidth }, ...at(headFrom, (head.left + head.right) / 2), ...at(endOffset, (head.left + head.right) / 2), deckY, deckY);
    // Railings: along both sides of the ramp and deck, round the head, open towards the deck.
    const w = pier.width / 2 - 0.1;
    for (const s of [-w, w]) {
      cut({ kind: 'railing' }, ...at(startOffset, s), ...at(startOffset + ramp, s), startY, deckY);
      cut({ kind: 'railing' }, ...at(startOffset + ramp, s), ...at(headFrom, s), deckY, deckY);
    }
    const l = head.left + 0.1;
    const r = head.right - 0.1;
    const near = headFrom + 0.1;
    const far = endOffset - 0.1;
    cut({ kind: 'railing' }, ...at(near, l), ...at(far, l), deckY, deckY);
    cut({ kind: 'railing' }, ...at(far, l), ...at(far, r), deckY, deckY);
    cut({ kind: 'railing' }, ...at(far, r), ...at(near, r), deckY, deckY);
    cut({ kind: 'railing' }, ...at(near, l), ...at(near, -w), deckY, deckY);
    cut({ kind: 'railing' }, ...at(near, w), ...at(near, r), deckY, deckY);
  }

  for (const area of plan.specialAreas) {
    if (area.kind !== 'marina' && area.kind !== 'quay') continue;
    const edge = area.edge;
    // The quay wall: from the apron's height down into the water, its face to the sea.
    for (let i = 0; i + 3 < edge.length; i += 2) {
      const ax = edge[i];
      const az = edge[i + 1];
      const bx = edge[i + 2];
      const bz = edge[i + 3];
      const length = Math.hypot(bx - ax, bz - az);
      if (length < 0.5) continue;
      let nx = (bz - az) / length;
      let nz = -(bx - ax) / length;
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      if (safeHeight(mx + nx * 6, mz + nz * 6, 0) > safeHeight(mx - nx * 6, mz - nz * 6, 0)) {
        nx = -nx;
        nz = -nz;
      }
      const top = Math.max(1, Math.min(area.y, safeHeight(mx - nx * 8, mz - nz * 8, area.y)) + 0.03);
      cut({ kind: 'wall', top, bottom: -3.5, nx, nz, thickness: QUAY_WALL_DEPTH, cap: true }, ax, az, bx, bz);
    }
    if (area.kind === 'quay') {
      // Each length of crane rail is set into what lies under it: the wall's top by the edge,
      // the apron or the road's pavement inland (the landside rail is ~33 m in).
      for (const rail of area.craneRails || []) {
        for (let i = 0; i + 3 < rail.length; i += 2) {
          const length = Math.hypot(rail[i + 2] - rail[i], rail[i + 3] - rail[i + 1]);
          const steps = Math.max(1, Math.ceil(length / RAIL_STEP));
          for (let s = 0; s < steps; s += 1) {
            const ax = rail[i] + ((rail[i + 2] - rail[i]) * s) / steps;
            const az = rail[i + 1] + ((rail[i + 3] - rail[i + 1]) * s) / steps;
            const bx = rail[i] + ((rail[i + 2] - rail[i]) * (s + 1)) / steps;
            const bz = rail[i + 1] + ((rail[i + 3] - rail[i + 1]) * (s + 1)) / steps;
            cut({ kind: 'rail', y: railBedAt(area, (ax + bx) / 2, (az + bz) / 2, bx - ax, bz - az) }, ax, az, bx, bz);
          }
        }
      }
    } else {
      for (const finger of area.fingers || []) {
        const length = Math.hypot(finger.bx - finger.ax, finger.bz - finger.az);
        const ux = (finger.bx - finger.ax) / length;
        const uz = (finger.bz - finger.az) / length;
        const top = Math.max(1, Math.min(area.y, safeHeight(finger.ax - ux * 2, finger.az - uz * 2, area.y)) + 0.05);
        const deckY = Math.min(area.deckHeight ?? 1.1, top);
        const gangway = 4;
        const deck = { kind: 'deck', width: finger.width, surface: 'planks', piles: false, thickness: 0.3 };
        cut(deck, finger.ax, finger.az, finger.ax + ux * gangway, finger.az + uz * gangway, top, deckY);
        cut({ ...deck, piles: true }, finger.ax + ux * gangway, finger.az + uz * gangway, finger.bx, finger.bz, deckY, deckY);
      }
    }
  }
  return pieces;
}

/** Extents of a ring along a direction from an origin: {near, far} along it, {left, right} across. */
function extentsAlong(ring, ox, oz, dx, dz) {
  let near = Infinity;
  let far = -Infinity;
  let left = Infinity;
  let right = -Infinity;
  for (let i = 0; i + 1 < ring.length; i += 2) {
    const a = (ring[i] - ox) * dx + (ring[i + 1] - oz) * dz;
    const s = (ring[i] - ox) * -dz + (ring[i + 1] - oz) * dx;
    near = Math.min(near, a);
    far = Math.max(far, a);
    left = Math.min(left, s);
    right = Math.max(right, s);
  }
  return { near, far, left, right };
}
