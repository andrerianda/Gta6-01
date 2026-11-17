// The sector streamer: turns a focus position (the camera or the player) into activate and
// deactivate calls for the square sectors of the world around it, with hysteresis so a sector on
// the edge is not built and thrown away as the focus wobbles. The open-world city streams its
// meshes and colliders with one of these; traffic and pedestrians can run their own with a
// smaller radius.
//
//   const streamer = createSectorStreamer({
//     sectorSize: 128, activeRadius: 420, releaseMargin: 96,
//     activate: (sector) => buildSector(sector),          // sector.x, .z, .minX, .minZ, .size
//     deactivate: (sector) => disposeSector(sector),
//   });
//   streamer.update(player.x, player.z);                  // every frame

/**
 * @typedef {Object} StreamSector One square of the world grid.
 * @property {number} x Sector column (east is positive).
 * @property {number} z Sector row (south is positive).
 * @property {number} key A number unique to the sector.
 * @property {number} minX World X of its west edge.
 * @property {number} minZ World Z of its north edge.
 * @property {number} size Edge length in metres.
 * @property {number} centreX World X of its centre.
 * @property {number} centreZ World Z of its centre.
 * @property {any} data Whatever activate() returned, kept for deactivate().
 */

/**
 * Creates a streamer.
 * @param {Object} options
 * @param {number} options.sectorSize Edge of a sector in metres.
 * @param {number} options.activeRadius Sectors any part of which is within this distance of the
 *   focus are activated.
 * @param {number} [options.releaseMargin] An active sector is released only beyond
 *   activeRadius + releaseMargin; default half a sector.
 * @param {(sector: StreamSector) => any} options.activate Builds a sector; its return value is
 *   stored as sector.data.
 * @param {(sector: StreamSector) => void} options.deactivate Frees a sector.
 * @param {number} [options.maxActivationsPerUpdate] Spreads the work of a big jump over several
 *   updates; default no limit.
 * @returns {ReturnType<typeof buildSectorStreamer>}
 */
export function createSectorStreamer(options) {
  return buildSectorStreamer(options);
}

/** Sector coordinates are offset by this so that the key is a non-negative integer. */
const SECTOR_OFFSET = 32768;
const SECTOR_SPAN = 65536;

function buildSectorStreamer(options) {
  const sectorSize = options.sectorSize;
  /** @type {Map<number, StreamSector>} */
  const active = new Map();
  /** Candidates of the update in progress: [distanceSquared, x, z] triples, reused. */
  const candidates = [];

  const streamer = {
    sectorSize,
    activeRadius: options.activeRadius,
    releaseMargin: options.releaseMargin ?? sectorSize * 0.5,
    maxActivationsPerUpdate: options.maxActivationsPerUpdate ?? Infinity,
    /** Sectors that should be active but still wait for a later update. */
    waitingCount: 0,
    /** The active sectors by key. */
    active,
    update,
    isActive: (x, z) => active.has(keyOf(x, z)),
    sectorAt,
    sectorIndexAt: (worldCoordinate) => Math.floor(worldCoordinate / sectorSize),
    clear,
  };

  function keyOf(x, z) {
    return (x + SECTOR_OFFSET) * SECTOR_SPAN + (z + SECTOR_OFFSET);
  }

  /** Squared distance from a point to the square of sector (x, z); 0 inside it. */
  function distanceSquaredToSector(focusX, focusZ, x, z) {
    const minX = x * sectorSize;
    const minZ = z * sectorSize;
    const dx = focusX < minX ? minX - focusX : Math.max(0, focusX - (minX + sectorSize));
    const dz = focusZ < minZ ? minZ - focusZ : Math.max(0, focusZ - (minZ + sectorSize));
    return dx * dx + dz * dz;
  }

  /**
   * Moves the focus: releases the sectors now out of range, then activates those in range,
   * nearest first.
   * @param {number} focusX World X of the focus.
   * @param {number} focusZ World Z of the focus.
   * @returns {{activated: number, deactivated: number}} What changed in this update.
   */
  function update(focusX, focusZ) {
    let deactivated = 0;
    const releaseRadius = streamer.activeRadius + streamer.releaseMargin;
    const releaseSquared = releaseRadius * releaseRadius;
    for (const sector of active.values()) {
      if (distanceSquaredToSector(focusX, focusZ, sector.x, sector.z) > releaseSquared) {
        active.delete(sector.key);
        options.deactivate(sector);
        deactivated += 1;
      }
    }

    const radius = streamer.activeRadius;
    const radiusSquared = radius * radius;
    const minX = Math.floor((focusX - radius) / sectorSize);
    const maxX = Math.floor((focusX + radius) / sectorSize);
    const minZ = Math.floor((focusZ - radius) / sectorSize);
    const maxZ = Math.floor((focusZ + radius) / sectorSize);
    candidates.length = 0;
    for (let x = minX; x <= maxX; x += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        if (active.has(keyOf(x, z))) continue;
        const distanceSquared = distanceSquaredToSector(focusX, focusZ, x, z);
        if (distanceSquared <= radiusSquared) candidates.push(distanceSquared, x, z);
      }
    }

    let activated = 0;
    const wanted = candidates.length / 3;
    const limit = Math.min(wanted, streamer.maxActivationsPerUpdate);
    while (activated < limit) {
      // Pick the nearest remaining candidate (the list is short: a selection scan is enough).
      let best = -1;
      for (let i = 0; i < candidates.length; i += 3) {
        if (candidates[i] >= 0 && (best === -1 || candidates[i] < candidates[best])) best = i;
      }
      const sector = makeSector(candidates[best + 1], candidates[best + 2]);
      candidates[best] = -1;
      active.set(sector.key, sector);
      sector.data = options.activate(sector) ?? null;
      activated += 1;
    }
    streamer.waitingCount = wanted - activated;
    return { activated, deactivated };
  }

  /**
   * The active sector under a world position.
   * @param {number} worldX World X.
   * @param {number} worldZ World Z.
   * @returns {StreamSector | null} Null when that sector is not active.
   */
  function sectorAt(worldX, worldZ) {
    return active.get(keyOf(Math.floor(worldX / sectorSize), Math.floor(worldZ / sectorSize))) ?? null;
  }

  /** Releases every active sector. */
  function clear() {
    for (const sector of [...active.values()]) {
      active.delete(sector.key);
      options.deactivate(sector);
    }
    streamer.waitingCount = 0;
  }

  /** @returns {StreamSector} */
  function makeSector(x, z) {
    return {
      x,
      z,
      key: keyOf(x, z),
      minX: x * sectorSize,
      minZ: z * sectorSize,
      size: sectorSize,
      centreX: (x + 0.5) * sectorSize,
      centreZ: (z + 0.5) * sectorSize,
      data: null,
    };
  }

  return streamer;
}
