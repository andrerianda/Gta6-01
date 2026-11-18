// Street item pools: the lamps, palms, junction controls and street clutter of every built sector,
// each item at its own level by its distance to the camera, as the asset's lod_distances say
// (palms: level 0 within 35 m, level 1 to 90 m, the crossed-card level 2 beyond), and nothing
// beyond its kind's draw distance. A pool is one (object, part selection, state, tint, level); its
// parts are instances in the city-wide BatchedMeshes of streetItemBatches.js, one per material,
// shadow flag and vertex layout, so a set file's atlas parts at every level cost one draw call.
// Only levels that end within the quality tier's shadowCasterDistance cast shadows, and those
// batches cast into the near cascades only. A pass runs when the camera has moved 2 m; an item
// that changes level moves to the other pool. An item can be hidden and shown (a signal lamp's on
// and off copies). Nothing is allocated per frame.
//
//   const pools = createStreetItemPools(assets, { lodBias, shadowCasterDistance, onCaster });
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
import { createStreetItemBatches } from './streetItemBatches.js';

/** Level switch distances (metres, before lodBias) and draw distance, by kind. */
export const STREET_ITEM_LEVELS = Object.freeze({
  plant: { switches: [35, 90], drawDistance: 620 },
  // Thin poles: only the near level casts (shift 8, shadow triangles over budget).
  lamp: { switches: [30, 90], drawDistance: 320, shadowLevels: 1 },
  control: { switches: [30, 90], drawDistance: 300, shadowLevels: 1 },
  // Small clutter: two levels, gone beyond 60 m, never a shadow caster (docs/ARCHITECTURE.md
  // section 11: small props never cast); large clutter casts from its near level only.
  clutter: { switches: [16, 60], drawDistance: 60, shadowLevels: 0 },
  clutterLarge: { switches: [28, 70], drawDistance: 200, shadowLevels: 1 },
  // Front-yard shrubs and hedge modules: three levels, gone beyond 160 m, near level casts.
  shrub: { switches: [30, 80], drawDistance: 160, shadowLevels: 1 },
  // Tree pit grates (two levels in the file): flat, never a shadow caster, drawn to 160 m.
  pit: { switches: [25, 160], drawDistance: 160, shadowLevels: 0 },
  // Port yard (containers, stacks, sheds, trailers, forklifts): seen across the terminal.
  portYard: { switches: [60, 200], drawDistance: 900, shadowLevels: 1 },
  // Roadside billboards (13.5 m): levels switch at 80 and 200 m as the file says.
  billboard: { switches: [80, 200], drawDistance: 900, shadowLevels: 1 },
  // Quay cranes (72 m): their near level casts; drawn as far as the sector streams.
  crane: { switches: [80, 320], drawDistance: 2400, shadowLevels: 1 },
  // Beach furniture (parasols, loungers, towers, kiosks, nets): two levels in the file.
  beach: { switches: [40, 300], drawDistance: 300, shadowLevels: 1 },
  // Shop-front furniture (awnings, café sets, boards, stalls): two levels at most, to 110 m.
  shop: { switches: [25, 110], drawDistance: 110, shadowLevels: 1 },
  // Ground cover (weeds at kerbs and wall feet, cover in the tree pits): cutout, never casts.
  // Two levels only (level 2 never reached), so at most two draws per plant.
  cover: { switches: [15, 40], drawDistance: 40, shadowLevels: 0 },
});

/** Pool kinds drawn with the foliage material (front-lit cutout leaves, dark at night). */
const FOLIAGE_KINDS = new Set(['plant', 'cover']);
/** A material whose albedo takes a per-instance colour (a set's `paint` role: boxes, awnings, canvas). */
const isPaint = (material) => material?.userData?.role === 'paint' || (material?.name ?? '').startsWith('paint');
const whitePaints = new WeakMap();
/** The paint material with a white base, so the instance colour is the colour (one copy per material). */
function whitePaint(material) {
  let copy = whitePaints.get(material);
  if (!copy) {
    copy = material.clone();
    copy.name = `${material.name}_tinted`;
    copy.color.setRGB(1, 1, 1);
    whitePaints.set(material, copy);
  }
  return copy;
}

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
  const objectLevel = objectParts(asset, source, level);
  // source.tint: the paint parts take each instance's colour (the batch's instance colours).
  const parts = source.tint
    ? objectLevel.map((part) => (isPaint(part.material) ? { ...part, material: whitePaint(part.material), tinted: true } : part))
    : objectLevel;
  if (!source.select) return parts;
  const isLamp = (part) => (part.material?.name ?? '').startsWith('lamp_');
  if (source.select === 'body') return parts.filter((part) => !isLamp(part));
  return parts.filter((part) => part.material?.name === source.select)
    .map((part) => ({ ...part, material: source.swap ? source.swap(part.material, source.state) : part.material }));
}

/**
 * Creates the pools.
 * @param {{has: (id: string) => boolean, get: (id: string) => object}} assets The asset library.
 * @param {{lodBias?: number, shadowCasterDistance?: number, onCaster?: (mesh: THREE.BatchedMesh) => void}} [quality]
 *   The quality tier row; onCaster receives every batch that casts (to keep it to the near cascades).
 */
export function createStreetItemPools(assets, quality = {}) {
  const root = new THREE.Group();
  root.name = 'city_dressing_street_items';
  root.matrixAutoUpdate = false;
  const batches = createStreetItemBatches(root, { onCaster: quality.onCaster });
  const pools = new Map();
  const groups = new Set();
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
    const key = `${source.assetId}_${source.object ?? 'all'}${source.select ? `_${source.select}` : ''}${source.state ? `_${source.state}` : ''}${source.tint ? '_tint' : ''}_lod${level}`;
    pool = pools.get(key);
    if (!pool) {
      const parts = sourceParts(assets.get(source.assetId), source, level);
      pool = { key, kind: group.kind, level, noShadow: Boolean(source.noShadow), parts, refs: null, casts: false,
        count: 0, ids: new Int32Array(0), ownerGroup: [], ownerIndex: [] };
      pools.set(key, pool);
    }
    group.pools[level] = pool;
    return pool;
  }

  /** The pool's parts in their batches (first use, and again after a quality change). */
  function refsOf(pool) {
    if (pool.refs) return pool.refs;
    pool.casts = castsShadow(pool);
    pool.refs = pool.parts.map((part) => batches.partFor(FOLIAGE_KINDS.has(pool.kind) ? foliageMaterial(part.material) : part.material,
      pool.casts, part.geometry, Boolean(part.tinted)));
    return pool.refs;
  }

  function place(group, i, level) {
    const pool = poolFor(group, level);
    const refs = refsOf(pool);
    const n = refs.length;
    if ((pool.count + 1) * n > pool.ids.length) {
      const ids = new Int32Array(Math.max(64, pool.ids.length * 2, (pool.count + 1) * n));
      ids.set(pool.ids);
      pool.ids = ids;
    }
    const slot = pool.count;
    pool.count += 1;
    for (let p = 0; p < n; p += 1) pool.ids[slot * n + p] = batches.add(refs[p], group.matrices, i * 16, group.colors ?? null, i * 3);
    pool.ownerGroup[slot] = group;
    pool.ownerIndex[slot] = i;
    group.slot[i] = slot;
    group.level[i] = level;
  }

  function unplace(group, i) {
    const pool = group.pools[group.level[i]];
    const slot = group.slot[i];
    const tail = pool.count - 1;
    const refs = pool.refs;
    const n = refs.length;
    for (let p = 0; p < n; p += 1) batches.remove(refs[p], pool.ids[slot * n + p]);
    if (slot !== tail) {
      pool.ids.copyWithin(slot * n, tail * n, tail * n + n);
      const owner = pool.ownerGroup[tail];
      const index = pool.ownerIndex[tail];
      pool.ownerGroup[slot] = owner;
      pool.ownerIndex[slot] = index;
      owner.slot[index] = slot;
    }
    pool.ownerGroup[tail] = null;
    pool.count = tail;
    group.level[i] = -1;
  }

  function levelOf(group, i, current) {
    if (!group.shown[i] || !Number.isFinite(last.x)) return -1;
    const m = group.matrices;
    const level = streetItemLevelAt(Math.hypot(m[i * 16 + 12] - last.x, m[i * 16 + 14] - last.z), current, group.levels, lodBias);
    // source.maxLevel: a part not drawn at the far levels (a signal's dark lenses).
    if (level > (group.source.maxLevel ?? 2)) return -1;
    // A model with fewer levels draws its last one from the same pool (no duplicate draw).
    return level > group.top ? group.top : level;
  }

  const matrix = new THREE.Matrix4();
  return {
    object3d: root,
    /**
     * Registers a sector's items; they show from the next update.
     * @param {{source: object, kind: string, matrices: Float32Array, count: number, hidden?: boolean, colors?: Float32Array}[]} instances
     *   World-space transforms, 16 floats each; hidden groups start with every item hidden.
     * @returns {{setShown: (group: number, index: number, shown: boolean) => void, dispose: () => void}}
     *   group is the index in `instances`.
     */
    addSector(instances) {
      const all = instances.map((each) => (each.count > 0 && assets.has(each.source.assetId) ? {
        ...each, levels: STREET_ITEM_LEVELS[each.kind] ?? STREET_ITEM_LEVELS.plant, top: topLevelOf(assets.get(each.source.assetId), each.source),
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
        },
        dispose() {
          for (const group of mine) {
            for (let i = 0; i < group.count; i += 1) if (group.level[i] >= 0) unplace(group, i);
            groups.delete(group);
          }
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
    },
    /**
     * Follows a new quality tier: level distances and which levels cast shadows. A pool whose
     * shadow flag changes moves to the other batch: every item is taken out and placed again.
     */
    setQuality(tier = {}) {
      lodBias = tier.lodBias ?? lodBias;
      shadowCasterDistance = tier.shadowCasterDistance ?? shadowCasterDistance;
      let changed = false;
      for (const pool of pools.values()) if (pool.refs && pool.casts !== castsShadow(pool)) changed = true;
      if (changed) {
        for (const group of groups) for (let i = 0; i < group.count; i += 1) if (group.level[i] >= 0) unplace(group, i);
        for (const pool of pools.values()) pool.refs = null;
      }
      last.force = true;
    },
    /** Draw calls (batches drawn), instances and triangles of the pools now (shadow passes not counted), and by kind. */
    stats() {
      let instances = 0;
      let triangles = 0;
      const byKind = {};
      const drawnBy = new Map();
      for (const pool of pools.values()) {
        if (pool.count === 0) continue;
        instances += pool.count;
        let poolTriangles = 0;
        for (const part of pool.parts) poolTriangles += pool.count * ((part.geometry.index?.count ?? part.geometry.attributes.position.count) / 3);
        triangles += poolTriangles;
        const kind = (byKind[pool.kind] ??= { draws: 0, instances: 0, triangles: 0 });
        kind.instances += pool.count;
        kind.triangles += Math.round(poolTriangles);
        const seen = drawnBy.get(pool.kind) ?? new Set();
        for (const ref of pool.refs) seen.add(ref.entry);
        drawnBy.set(pool.kind, seen);
      }
      for (const [kind, seen] of drawnBy) byKind[kind].draws = seen.size;
      const draws = batches.list().filter((each) => each.instances > 0).length;
      return { draws, instances, triangles: Math.round(triangles), byKind };
    },
    /**
     * One pool's state, for tests and the debug overlay: its items, shadow flag, materials and
     * the x of every item's first part.
     */
    describePool(key) {
      const pool = pools.get(key);
      if (!pool?.refs) return null;
      const n = pool.refs.length;
      const xs = [];
      for (let slot = 0; slot < pool.count; slot += 1) {
        pool.refs[0].entry.mesh.getMatrixAt(pool.ids[slot * n], matrix);
        xs.push(matrix.elements[12]);
      }
      return { count: pool.count, castShadow: pool.casts, materials: pool.refs.map((ref) => ref.entry.mesh.material.name),
        meshes: pool.refs.map((ref) => ref.entry.mesh), xs };
    },
    /** Item counts of every pool used so far, by pool key. */
    poolCounts() {
      const counts = {};
      for (const pool of pools.values()) if (pool.refs) counts[pool.key] = pool.count;
      return counts;
    },
    batches: () => batches.list(),
    dispose() {
      batches.dispose();
      pools.clear();
      groups.clear();
      root.removeFromParent();
    },
  };
}

const topLevels = new WeakMap();
/**
 * The highest level a source's model has (0..2): `<object>_lod<n>` nodes for set objects and
 * variants, `lod<n>` for single assets; 2 when the file names no levels.
 */
export function topLevelOf(asset, source) {
  const scene = asset?.scene;
  if (!scene) return 2;
  let cache = topLevels.get(scene);
  if (!cache) topLevels.set(scene, (cache = new Map()));
  const prefix = source.object ? `${source.object}_lod` : 'lod';
  if (!cache.has(prefix)) {
    let top = -1;
    for (let level = 0; level <= 2; level += 1) if (scene.getObjectByName(`${prefix}${level}`)) top = level;
    cache.set(prefix, top < 0 ? 2 : top);
  }
  return cache.get(prefix);
}

const foliageCopies = new WeakMap();
/** Every foliage copy, and the night factor they share (0 by day, 1 at night). */
const foliageMaterials = new Set();
const foliageNight = { value: 0 };

/**
 * Night for the foliage (cityDressing.update, from the atmosphere's night factor): fronds go dark
 * (albedo down to 35 percent) and their faces take their true side again, so a frond is lit from
 * below only by a lamp below it, never by the sky: dark silhouettes, as the owner asked (08:58).
 */
export function setFoliageNightFactor(night) {
  if (foliageNight.value === night) return;
  foliageNight.value = night;
  for (const material of foliageMaterials) material.color.copy(material.userData.dayColor).multiplyScalar(1 - 0.65 * night);
}

/**
 * The plants' two-sided cutout (fronds, leaf cards) lit on both faces as the front is: a frond
 * seen from below shows its sunlit green like a thin leaf against the light, instead of the
 * flipped normal's unlit black (QA: black fronds across the sky under a palm). Other materials
 * (trunks) pass through. One copy per source material.
 */
export function foliageMaterial(material) {
  if (!material || material.side !== THREE.DoubleSide || !(material.alphaTest > 0)) return material;
  let copy = foliageCopies.get(material);
  if (!copy) {
    copy = material.clone();
    copy.name = `${material.name}_foliage`;
    copy.onBeforeCompile = (shader) => {
      // Resolve the chunk, then keep every face's normal (and normal-map frame) unflipped by
      // day; at night the back faces flip again (lit only by what is on their side).
      shader.uniforms.foliageNight = foliageNight;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float foliageNight;')
        .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin)
        .replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;', 'float faceDirection = gl_FrontFacing || foliageNight < 0.5 ? 1.0 : - 1.0;');
    };
    copy.customProgramCacheKey = () => 'foliage_front_lit_back_night';
    copy.userData.dayColor = copy.color.clone();
    copy.color.multiplyScalar(1 - 0.65 * foliageNight.value);
    foliageMaterials.add(copy);
    foliageCopies.set(material, copy);
  }
  return copy;
}
