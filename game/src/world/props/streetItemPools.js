// Street item pools: the lamps, palms and trees of every built sector drawn as a few city-wide
// instanced meshes (one per object, distance tier and material) instead of batches per sector.
// A sector's items sit in the pool of its tier: 'near' (level 0; plants cast shadows), 'mid'
// (level 1, no shadows) or 'far' (level 2 of the plants beyond about 250 m; no lamps). A sector
// changes tier only when the camera crosses a threshold, and then rewrites only its own slots
// (the last slots move into the freed ones). Nothing is allocated per frame.
//
//   const pools = createStreetItemPools(assets);
//   scene.add(pools.object3d);
//   const handle = pools.addSector(instances);   // from buildSectorStreetDressing
//   handle.setTier('near');  ...  handle.dispose();
import * as THREE from 'three';
import { objectParts } from './sectorStreetDressing.js';

/** The distance tiers and the asset level each one draws. */
export const STREET_ITEM_TIERS = Object.freeze({ near: 0, mid: 1, far: 2 });

/**
 * Picks a sector's tier from the camera's horizontal distance to its centre, with 8 m of
 * hysteresis so a camera on a threshold does not flip it every frame.
 * @param {number} distance Metres.
 * @param {string | null} current The sector's tier now.
 * @param {{near?: number, mid?: number}} [limits] Default near 140 m, mid 250 m.
 * @returns {'near' | 'mid' | 'far'}
 */
export function streetItemTierAt(distance, current, limits = {}) {
  const near = (limits.near ?? 140) + (current === 'near' ? 8 : 0);
  const mid = (limits.mid ?? 250) + (current === 'mid' ? 8 : 0);
  if (distance < near) return 'near';
  return distance < mid ? 'mid' : 'far';
}

/**
 * Creates the pools.
 * @param {{has: (id: string) => boolean, get: (id: string) => object}} assets The asset library.
 * @returns {{object3d: THREE.Group, addSector: (instances: object[]) => {setTier: (tier: string | null) => void,
 *   dispose: () => void, readonly tier: string | null}, stats: () => {draws: number, instances: number}, dispose: () => void}}
 */
export function createStreetItemPools(assets) {
  const root = new THREE.Group();
  root.name = 'city_dressing_street_items';
  root.matrixAutoUpdate = false;
  const pools = new Map();

  function poolFor(group, tier) {
    const level = STREET_ITEM_TIERS[tier];
    if (group.kind === 'lamp' && level === 2) return null;
    const key = `${group.source.assetId}_${group.source.object ?? 'all'}_${tier}`;
    let pool = pools.get(key);
    if (!pool) {
      const parts = objectParts(assets.get(group.source.assetId), group.source, level);
      pool = { key, parts, shadows: tier === 'near' && group.kind === 'plant', meshes: [], capacity: 0, count: 0, array: null, attribute: null, owner: [], ownerIndex: [] };
      pools.set(key, pool);
    }
    return pool;
  }

  function grow(pool, needed) {
    const capacity = Math.max(64, pool.capacity * 2, needed);
    const array = new Float32Array(capacity * 16);
    if (pool.array) array.set(pool.array.subarray(0, pool.count * 16));
    const attribute = new THREE.InstancedBufferAttribute(array, 16);
    attribute.setUsage(THREE.DynamicDrawUsage);
    for (const mesh of pool.meshes) {
      mesh.removeFromParent();
      mesh.dispose();
    }
    pool.meshes = pool.parts.map((part) => {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, 1);
      mesh.instanceMatrix = attribute;
      mesh.name = pool.key;
      mesh.frustumCulled = false;
      mesh.castShadow = pool.shadows;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      root.add(mesh);
      return mesh;
    });
    Object.assign(pool, { capacity, array, attribute });
  }

  function commit(pool) {
    for (const mesh of pool.meshes) mesh.count = pool.count;
    if (pool.attribute) pool.attribute.needsUpdate = true;
  }

  function insert(pool, group, record) {
    if (pool.count + group.count > pool.capacity) grow(pool, pool.count + group.count);
    for (let i = 0; i < group.count; i += 1) {
      const slot = pool.count;
      pool.count += 1;
      pool.array.set(group.matrices.subarray(i * 16, i * 16 + 16), slot * 16);
      pool.owner[slot] = record;
      pool.ownerIndex[slot] = i;
      record.slots[i] = slot;
    }
    commit(pool);
  }

  function remove(pool, record) {
    // Highest slots first: the tail moved into a freed slot never belongs to this record.
    const slots = record.slots.slice().sort((a, b) => b - a);
    for (const slot of slots) {
      const last = pool.count - 1;
      if (slot !== last) {
        pool.array.copyWithin(slot * 16, last * 16, last * 16 + 16);
        const owner = pool.owner[last];
        const index = pool.ownerIndex[last];
        pool.owner[slot] = owner;
        pool.ownerIndex[slot] = index;
        owner.slots[index] = slot;
      }
      pool.owner[last] = null;
      pool.count = last;
    }
    commit(pool);
  }

  return {
    object3d: root,
    /**
     * Registers a sector's instances (not drawn until setTier).
     * @param {{source: {assetId: string, object: ?string}, kind: string, matrices: Float32Array, count: number}[]} instances
     *   World-space transforms, 16 floats each.
     */
    addSector(instances) {
      const groups = instances.filter((group) => group.count > 0 && assets.has(group.source.assetId));
      const placed = [];
      let tier = null;
      const handle = {
        get tier() {
          return tier;
        },
        setTier(next) {
          if (next === tier) return;
          for (const { pool, record } of placed) remove(pool, record);
          placed.length = 0;
          tier = next;
          if (!next) return;
          for (const group of groups) {
            const pool = poolFor(group, next);
            if (!pool) continue;
            const record = { slots: new Array(group.count) };
            insert(pool, group, record);
            placed.push({ pool, record });
          }
        },
        dispose() {
          handle.setTier(null);
        },
      };
      return handle;
    },
    /** Draw calls and instances of the pools now. */
    stats() {
      let draws = 0;
      let instances = 0;
      for (const pool of pools.values()) {
        if (pool.count > 0) draws += pool.meshes.length;
        instances += pool.count;
      }
      return { draws, instances };
    },
    dispose() {
      for (const pool of pools.values()) for (const mesh of pool.meshes) mesh.dispose();
      pools.clear();
      root.removeFromParent();
    },
  };
}
