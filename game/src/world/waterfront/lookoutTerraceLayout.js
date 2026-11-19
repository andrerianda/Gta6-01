// The lookout terraces at Marazul's hilltop vantage points (plan.vantagePoints on high ground,
// such as the Mirador de la Loma): a paved platform just past the end of the road, facing the
// view, standing on a plinth that reaches down to the slope, with a railing round its three far
// sides. They are laid out as waterfront pieces ('deck' with the promenade's paving, 'railing'),
// so the waterfront builder makes them, writes their walking surface and gives them colliders.
//
//   const pieces = [...planWaterfrontPieces(plan), ...planLookoutTerracePieces(plan)];

/** Vantage points whose ground is lower than this are the sea's or the shore's, metres. */
const HILLTOP_HEIGHT = 12;
/** The terrace starts this far past the vantage point (the road's end) along the view, metres. */
const TERRACE_START = 1.5;
/** Depth along the view and width across it, metres. */
const TERRACE_DEPTH = 10;
const TERRACE_WIDTH = 16;
/** The paving stands this far above the highest ground under its front half, metres. */
const TERRACE_LIFT = 0.15;
/** The railing stands this far in from the terrace's edges, metres. */
const RAILING_INSET = 0.2;
/** Must match the builder's lift of promenade paving (waterfrontBuilder.js PROMENADE_LIFT). */
const PROMENADE_LIFT = 0.06;

/**
 * Plans the terraces of the plan's hilltop vantage points.
 * @param {{vantagePoints?: {id: string, x: number, z: number, lookX: number, lookZ: number}[],
 *   heightAt: (x: number, z: number) => number, sectors: {minX: number, minZ: number, size: number, columns: number, rows: number}}} plan
 * @returns {Object[]} Waterfront pieces, each with its sector `cell` and the `lookout` id.
 */
export function planLookoutTerracePieces(plan) {
  const pieces = [];
  const grid = plan.sectors;
  const cellOf = (x, z) => {
    const c = Math.min(grid.columns - 1, Math.max(0, Math.floor((x - grid.minX) / grid.size)));
    const r = Math.min(grid.rows - 1, Math.max(0, Math.floor((z - grid.minZ) / grid.size)));
    return r * grid.columns + c;
  };
  for (const vantage of plan.vantagePoints ?? []) {
    const ground = plan.heightAt(vantage.x, vantage.z);
    if (!Number.isFinite(ground) || ground < HILLTOP_HEIGHT) continue;
    const length = Math.hypot(vantage.lookX - vantage.x, vantage.lookZ - vantage.z);
    if (length < 1) continue;
    const dx = (vantage.lookX - vantage.x) / length;
    const dz = (vantage.lookZ - vantage.z) / length;
    const at = (along, across) => [vantage.x + dx * along - dz * across, vantage.z + dz * along + dx * across];
    const near = TERRACE_START;
    const far = TERRACE_START + TERRACE_DEPTH;
    const half = TERRACE_WIDTH / 2;
    // The paving clears the ground under its front half; the plinth reaches the lowest ground.
    let highest = ground;
    let lowest = ground;
    for (let i = 0; i <= 4; i += 1) {
      for (let j = -2; j <= 2; j += 1) {
        const [x, z] = at(near + ((far - near) * i) / 4, (half * j) / 2);
        const y = plan.heightAt(x, z);
        if (!Number.isFinite(y)) continue;
        if (i >= 2) highest = Math.max(highest, y);
        lowest = Math.min(lowest, y);
      }
    }
    const top = highest + TERRACE_LIFT;
    const deckY = top - PROMENADE_LIFT;
    const push = (piece) => pieces.push({ ...piece, lookout: vantage.id, cell: cellOf((piece.ax + piece.bx) / 2, (piece.az + piece.bz) / 2) });
    const [ax, az] = at(near, 0);
    const [bx, bz] = at(far, 0);
    push({ kind: 'deck', surface: 'promenade', piles: false, width: TERRACE_WIDTH, thickness: top - lowest + 0.8, ax, az, bx, bz, ya: deckY, yb: deckY });
    const inner = half - RAILING_INSET;
    const corners = [at(near + RAILING_INSET, -inner), at(far - RAILING_INSET, -inner), at(far - RAILING_INSET, inner), at(near + RAILING_INSET, inner)];
    for (let k = 0; k < 3; k += 1) {
      const [x0, z0] = corners[k];
      const [x1, z1] = corners[k + 1];
      push({ kind: 'railing', ax: x0, az: z0, bx: x1, bz: z1, ya: top, yb: top });
    }
  }
  return pieces;
}
