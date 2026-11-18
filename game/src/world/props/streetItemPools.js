// Street item pools: the lamps, palms, junction controls and street clutter of every built sector
// drawn as a few city-wide instanced meshes (one per object, part selection, level and material)
// instead of batches per sector. Each item takes its own level by its distance to the camera, as
// the asset's lod_distances say (palms: level 0 within 35 m, level 1 to 90 m, the crossed-card
// level 2 beyond), and nothing beyond its kind's draw distance. Only levels that end within the
// quality tier's shadowCasterDistance cast shadows. A pass runs when the camera has moved 2 m; an
// item that changes level moves to the other pool (the pool's last slot fills the hole). An item
// can be hidden and shown (a signal lamp's on and off copies). Nothing is allocated per frame.
//
//   const pools = createStreetItemPools(assets, { lodBias, shadowCasterDistance });
//   scene.add(pools.object3d);
//   const handle = pools.addSector(instances);   // handle.setShown(group, index, shown); handle.dispose()
//   pools.update(camera.x, camera.z);            // once per frame
//   pools.setQuality({ lodBias, shadowCasterDistance });   // on QUALITY_CHANGED
//
// An instance group's source is { assetId, object, select?, state?, swap?, noShadow? }: select
// 'body' keeps the parts whose material is not a lamp_*, select 'lamp_red' keeps only that lamp's
// parts, with swap(material, state) choosing their material (lit or dark copy).
import * as THREE from 'three';
import { objectParts } from './sectorStreetDressing.js';

/** Level switch distances (metres, before lodBias) and draw distance, by kind. */
export const STREET_ITEM_LEVELS = Object.freeze({
  plant: { switches: [35, 90], drawDistance: 620 },
  lamp: { switches: [30, 90], drawDistance: 320 },
  control: { switches: [30, 90], drawDistance: 300 },
  // Small clutter: two levels, gone beyond 60 m, never a shadow caster (docs/ARCHITECTURE.md
  // section 11: small props never cast); large clutter casts from its near level only.
  clutter: { switches: [16, 60], drawDistance: 60, shadowLevels: 0 },
  clutterLarge: { switches: [28, 70], drawDistance: 200, shadowLevels: 1 },
});

/**
 * The level an item draws at a distance: 0, 1, 2, or -1 (not drawn), with 2 m of hysteresis
 * round the current level's limits.
 * @param {number} distance Metres to the camera.
 * @param {number} current The item's level now (-1 none).
 * @param {{switches: number[], drawDistance: number}} levels
 * @param {number} [bias] The quality tier's lodBias.
 * @returns {number}
 */
export function streetItemLevelAt(distance, current, levels, bias = 1) {
  const slack = (level) => (level === current ? 2 : 0);
  if (distance < levels.switches[0] * bias + slack(0)) return 0;
  if (distance < levels.switches[1] * bias + slack(1)) return 1;
  return distance < levels.drawDistance * bias + slack(2) ? 2 : -1;
}

/**
 * The parts of a source at a level: objectParts, narrowed to the body or one lamp and with the
 * lamp's material swapped.
 */
export function sourceParts(asset, source, level) {
  const parts = objectParts(asset, source, level);
  if (!source.select) return parts;
  const isLamp = (part) => (part.material?.name ?? '').startsWith('lamp_');
  if (source.select === 'body') return parts.filter((part) => !isLamp(part));
  return parts.filter((part) => part.material?.name === source.select)
    .map((part) => ({ ...part, material: source.swap ? source.swap(part.material, source.state) : part.material }));
}

/**
 * Creates the pools.
 * @param {{has: (id: string) => boolean, get: (id: string) => object}} assets The asset library.
 * @param {{lodBias?: number, shadowCasterDistance?: number}} [quality] The quality tier row.
 */
export function createStreetItemPools(assets, quality = {}) {
  const root = new THREE.Group();
  root.name = 'city_dressing_street_items';
  root.matrixAutoUpdate = false;
  const pools = new Map();
  const groups = new Set();
  const dirty = new Set();
  let lodBias = quality.lodBias ?? 1;
  let shadowCasterDistance = quality.shadowCasterDistance ?? 90;
  const last = { x: Infinity, z: Infinity, force: true };

  const castsShadow = (pool) => {
    const levels = STREET_ITEM_LEVELS[pool.kind] ?? STREET_ITEM_LEVELS.plant;
    return !pool.noShadow && pool.level < (levels.shadowLevels ?? 2) && levels.switches[pool.level] * lodBias <= shadowCasterDistance;
  };

  function poolFor(group, level) {
    let pool = group.pools[level];
    if (pool) return pool;
    const { source } = group;
    const key = `${source.assetId}_${source.object ?? 'all'}${source.select ? `_${source.select}` : ''}${source.state ? `_${source.state}` : ''}_lod${level}`;
    pool = pools.get(key);
    if (!pool) {
      const parts = sourceParts(assets.get(source.assetId), source, level);
      pool = { key, kind: group.kind, level, noShadow: Boolean(source.noShadow), parts, meshes: [], capacity: 0, count: 0, array: null, attribute: null, ownerGroup: [], ownerIndex: [] };
      pools.set(key, pool);
    }
    group.pools[level] = pool;
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
      mesh.castShadow = castsShadow(pool);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.count = 0;
      root.add(mesh);
      return mesh;
    });
    Object.assign(pool, { capacity, array, attribute });
  }

  function place(group, i, level) {
    const pool = poolFor(group, level);
    if (pool.count + 1 > pool.capacity) grow(pool, pool.count + 1);
    const slot = pool.count;
    pool.count += 1;
    pool.array.set(group.matrices.subarray(i * 16, i * 16 + 16), slot * 16);
    pool.ownerGroup[slot] = group;
    pool.ownerIndex[slot] = i;
    group.slot[i] = slot;
    group.level[i] = level;
    dirty.add(pool);
  }

  function unplace(group, i) {
    const pool = group.pools[group.level[i]];
    const slot = group.slot[i];
    const tail = pool.count - 1;
    if (slot !== tail) {
      pool.array.copyWithin(slot * 16, tail * 16, tail * 16 + 16);
      const owner = pool.ownerGroup[tail];
      const index = pool.ownerIndex[tail];
      pool.ownerGroup[slot] = owner;
      pool.ownerIndex[slot] = index;
      owner.slot[index] = slot;
    }
    pool.ownerGroup[tail] = null;
    pool.count = tail;
    group.level[i] = -1;
    dirty.add(pool);
  }

  function commit() {
    for (const pool of dirty) {
      for (const mesh of pool.meshes) mesh.count = pool.count;
      if (pool.attribute) pool.attribute.needsUpdate = true;
    }
    dirty.clear();
  }

  function levelOf(group, i, current) {
    if (!group.shown[i] || !Number.isFinite(last.x)) return -1;
    const m = group.matrices;
    return streetItemLevelAt(Math.hypot(m[i * 16 + 12] - last.x, m[i * 16 + 14] - last.z), current, group.levels, lodBias);
  }

  return {
    object3d: root,
    /**
     * Registers a sector's items; they show from the next update.
     * @param {{source: object, kind: string, matrices: Float32Array, count: number, hidden?: boolean}[]} instances
     *   World-space transforms, 16 floats each; hidden groups start with every item hidden.
     * @returns {{setShown: (group: number, index: number, shown: boolean) => void, dispose: () => void}}
     *   group is the index in `instances`.
     */
    addSector(instances) {
      const all = instances.map((each) => (each.count > 0 && assets.has(each.source.assetId) ? {
        ...each, levels: STREET_ITEM_LEVELS[each.kind] ?? STREET_ITEM_LEVELS.plant,
        level: new Int8Array(each.count).fill(-1), slot: new Int32Array(each.count), pools: [null, null, null],
        shown: new Uint8Array(each.count).fill(each.hidden ? 0 : 1),
      } : null));
      const mine = all.filter(Boolean);
      for (const group of mine) groups.add(group);
      last.force = true;
      return {
        setShown(index, i, shown) {
          const group = all[index];
          if (!group || i < 0 || i >= group.count || Boolean(group.shown[i]) === shown) return;
          group.shown[i] = shown ? 1 : 0;
          if (!groups.has(group)) return;
          const current = group.level[i];
          const level = levelOf(group, i, current);
          if (level === current) return;
          if (current >= 0) unplace(group, i);
          if (level >= 0) place(group, i, level);
          commit();
        },
        dispose() {
          for (const group of mine) {
            for (let i = 0; i < group.count; i += 1) if (group.level[i] >= 0) unplace(group, i);
            groups.delete(group);
          }
          commit();
        },
      };
    },
    /** Moves items between levels for a camera at x, z (a pass every 2 m of movement). */
    update(x, z) {
      if (!last.force && Math.abs(x - last.x) + Math.abs(z - last.z) < 2) return;
      last.x = x;
      last.z = z;
      last.force = false;
      for (const group of groups) {
        for (let i = 0; i < group.count; i += 1) {
          const current = group.level[i];
          const level = levelOf(group, i, current);
          if (level === current) continue;
          if (current >= 0) unplace(group, i);
          if (level >= 0) place(group, i, level);
        }
      }
      commit();
    },
    /** Follows a new quality tier: level distances and which levels cast shadows. */
    setQuality(tier = {}) {
      lodBias = tier.lodBias ?? lodBias;
      shadowCasterDistance = tier.shadowCasterDistance ?? shadowCasterDistance;
      for (const pool of pools.values()) for (const mesh of pool.meshes) mesh.castShadow = castsShadow(pool);
      last.force = true;
    },
    /** Draw calls, instances and triangles of the pools now (shadow passes not counted), and by kind. */
    stats() {
      let draws = 0;
      let instances = 0;
      let triangles = 0;
      const byKind = {};
      for (const pool of pools.values()) {
        if (pool.count === 0) continue;
        draws += pool.meshes.length;
        instances += pool.count;
        let poolTriangles = 0;
        for (const mesh of pool.meshes) poolTriangles += pool.count * ((mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3);
        triangles += poolTriangles;
        const kind = (byKind[pool.kind] ??= { draws: 0, instances: 0, triangles: 0 });
        kind.draws += pool.meshes.length;
        kind.instances += pool.count;
        kind.triangles += Math.round(poolTriangles);
      }
      return { draws, instances, triangles: Math.round(triangles), byKind };
    },
    dispose() {
      for (const pool of pools.values()) for (const mesh of pool.meshes) mesh.dispose();
      pools.clear();
      groups.clear();
      root.removeFromParent();
    },
  };
}
