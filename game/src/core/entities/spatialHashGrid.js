// A uniform grid over the ground plane for fast proximity queries: every item sits in the square
// cell under its position, and a query looks only at the cells its circle touches. The city is
// single level, so cells are squares in X and Z; height is left to the caller.
//
//   const grid = createSpatialHashGrid(32);
//   grid.insert(car);                                    // car.position.x / .z, car.radius
//   grid.update(car);                                    // after it moved
//   grid.forEachInRadius(x, z, 50, (item, distanceSquared) => { ... });

/**
 * @typedef {Object} GridItem
 * @property {{x: number, z: number}} position Where the item is; read on insert() and update().
 * @property {number} [radius] The item's own radius in metres (default 0).
 * @property {number} [gridKey] Bookkeeping: the cell the item is filed under.
 * @property {number} [gridSlot] Bookkeeping: its index in that cell's list.
 */

/**
 * Creates a grid.
 * @param {number} [cellSize] Edge of a cell in metres; choose about the usual query radius.
 * @returns {ReturnType<typeof buildSpatialHashGrid>}
 */
export function createSpatialHashGrid(cellSize = 32) {
  return buildSpatialHashGrid(cellSize);
}

/** Cell coordinates are offset by this so that the key is a non-negative integer. */
const CELL_OFFSET = 32768;
const CELL_SPAN = 65536;

function buildSpatialHashGrid(cellSize) {
  /** @type {Map<number, GridItem[]>} */
  const cells = new Map();
  const inverseCellSize = 1 / cellSize;

  const grid = {
    cellSize,
    /** How many items the grid holds. */
    size: 0,
    /** The largest radius among the items ever inserted; queries widen their search by it. */
    largestRadius: 0,
    insert,
    remove,
    update,
    forEachInRadius,
    nearest,
    clear,
    cellCount: () => cells.size,
  };

  function keyOf(x, z) {
    const cellX = Math.floor(x * inverseCellSize) + CELL_OFFSET;
    const cellZ = Math.floor(z * inverseCellSize) + CELL_OFFSET;
    return cellX * CELL_SPAN + cellZ;
  }

  /**
   * Files an item under its current position.
   * @param {GridItem} item The item; it must not be in the grid already.
   */
  function insert(item) {
    const key = keyOf(item.position.x, item.position.z);
    let cell = cells.get(key);
    if (!cell) {
      cell = [];
      cells.set(key, cell);
    }
    item.gridKey = key;
    item.gridSlot = cell.length;
    cell.push(item);
    grid.size += 1;
    const radius = item.radius ?? 0;
    if (radius > grid.largestRadius) grid.largestRadius = radius;
  }

  /**
   * Takes an item out of the grid.
   * @param {GridItem} item An item that insert() filed.
   */
  function remove(item) {
    const cell = cells.get(item.gridKey);
    if (!cell || cell[item.gridSlot] !== item) return;
    const last = cell.pop();
    if (last !== item) {
      cell[item.gridSlot] = last;
      last.gridSlot = item.gridSlot;
    }
    if (cell.length === 0) cells.delete(item.gridKey);
    item.gridKey = undefined;
    item.gridSlot = undefined;
    grid.size -= 1;
  }

  /**
   * Re-files an item after it moved. Cheap when it is still in the same cell.
   * @param {GridItem} item An item that insert() filed.
   * @returns {boolean} True when the item changed cell.
   */
  function update(item) {
    const key = keyOf(item.position.x, item.position.z);
    if (key === item.gridKey) return false;
    remove(item);
    insert(item);
    return true;
  }

  /**
   * Visits every item whose circle touches the query circle. Allocates nothing.
   * @param {number} x Centre X of the query.
   * @param {number} z Centre Z of the query.
   * @param {number} radius Radius of the query in metres.
   * @param {(item: GridItem, distanceSquared: number) => (void | boolean)} visit Called per item
   *   with the squared distance between the centres; return true to stop the search.
   * @param {boolean} [touching] When true (the default) an item counts as soon as its own radius
   *   reaches into the query circle; when false only its centre counts.
   */
  function forEachInRadius(x, z, radius, visit, touching = true) {
    const reach = radius + (touching ? grid.largestRadius : 0);
    const minX = Math.floor((x - reach) * inverseCellSize) + CELL_OFFSET;
    const maxX = Math.floor((x + reach) * inverseCellSize) + CELL_OFFSET;
    const minZ = Math.floor((z - reach) * inverseCellSize) + CELL_OFFSET;
    const maxZ = Math.floor((z + reach) * inverseCellSize) + CELL_OFFSET;
    for (let cellX = minX; cellX <= maxX; cellX += 1) {
      for (let cellZ = minZ; cellZ <= maxZ; cellZ += 1) {
        const cell = cells.get(cellX * CELL_SPAN + cellZ);
        if (!cell) continue;
        // Walk backwards so that a visitor may remove the item it is shown.
        for (let i = cell.length - 1; i >= 0; i -= 1) {
          const item = cell[i];
          const dx = item.position.x - x;
          const dz = item.position.z - z;
          const distanceSquared = dx * dx + dz * dz;
          const limit = radius + (touching ? item.radius ?? 0 : 0);
          if (distanceSquared <= limit * limit && visit(item, distanceSquared) === true) return;
        }
      }
    }
  }

  /**
   * The item whose centre is closest to a point.
   * @param {number} x Point X.
   * @param {number} z Point Z.
   * @param {number} maxRadius Items farther than this are ignored.
   * @param {(item: GridItem) => boolean} [accept] Leaves out items it returns false for.
   * @returns {GridItem | null}
   */
  function nearest(x, z, maxRadius, accept) {
    let best = null;
    let bestDistanceSquared = maxRadius * maxRadius;
    forEachInRadius(x, z, maxRadius, (item, distanceSquared) => {
      if (distanceSquared > bestDistanceSquared) return;
      if (accept && !accept(item)) return;
      best = item;
      bestDistanceSquared = distanceSquared;
    }, false);
    return best;
  }

  /** Empties the grid. The items keep stale bookkeeping; insert them again to reuse them. */
  function clear() {
    cells.clear();
    grid.size = 0;
    grid.largestRadius = 0;
  }

  return grid;
}
