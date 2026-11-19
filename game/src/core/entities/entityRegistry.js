// The entity registry shared by every system: each dynamic thing in the world (characters,
// vehicles, pickups, loose props, projectiles, markers) is one plain object with an id, a kind, a
// position, a radius, tags and the name of the system that owns it. The registry answers "who is
// near here?" from a uniform grid. It is not a component framework: the owner keeps its own data
// on the entity (or behind entity.data) and moves it by changing entity.position in place.
//
//   const car = entities.add({ kind: 'vehicle', owner: 'traffic', position, radius: 2.4,
//                              tags: ['traffic'], data: trafficCar });
//   entities.nearest(x, z, 30, { kind: 'vehicle', exclude: car });
//   entities.forEachWithin(x, z, 60, (entity) => entity.data.panic(), { tag: 'pedestrian' });
//   entities.remove(car);
import { createSpatialHashGrid } from './spatialHashGrid.js';

/**
 * @typedef {Object} GameEntity
 * @property {number} id Unique for the session; never reused.
 * @property {string} kind One of ENTITY_KINDS; fixed for life.
 * @property {string} owner The name of the system that created it and moves it.
 * @property {{x: number, y: number, z: number}} position Metres; the owner changes it in place
 *   (a THREE.Vector3 is welcome). The registry re-files moved entities once per fixed step.
 * @property {number} heading Radians; 0 looks north (-Z).
 * @property {number} radius Metres; how far it reaches for proximity queries.
 * @property {Set<string>} tags What it is doing or belongs to; change with addTag()/removeTag().
 * @property {boolean} alive False once removed from the registry.
 * @property {any} data The owner's own object for this entity.
 */

/**
 * @typedef {Object} EntityFilter Narrows a query. All given conditions must hold.
 * @property {string} [kind] Only this kind.
 * @property {string} [tag] Only entities carrying this tag.
 * @property {string} [withoutTag] No entity carrying this tag.
 * @property {GameEntity} [exclude] Not this entity (usually the one asking).
 * @property {(entity: GameEntity) => boolean} [accept] Any further test.
 */

/**
 * Creates the registry.
 * @param {Object} [options]
 * @param {number} [options.cellSize] Grid cell edge in metres; default 32.
 * @param {(entity: GameEntity) => void} [options.onAdded] Called after an entity is added.
 * @param {(entity: GameEntity) => void} [options.onRemoved] Called after an entity is removed.
 * @returns {ReturnType<typeof buildEntityRegistry>}
 */
export function createEntityRegistry(options = {}) {
  return buildEntityRegistry(options);
}

function buildEntityRegistry(options) {
  const grid = createSpatialHashGrid(options.cellSize ?? 32);
  /** @type {Map<number, GameEntity>} */
  const byId = new Map();
  /** @type {Map<string, Set<GameEntity>>} */
  const byKind = new Map();
  /** @type {Map<string, Set<GameEntity>>} */
  const byTag = new Map();
  const noEntities = new Set();
  let nextId = 1;

  const registry = {
    add,
    remove,
    get: (id) => byId.get(id) ?? null,
    addTag,
    removeTag,
    refresh,
    refreshAll,
    ofKind: (kind) => byKind.get(kind) ?? noEntities,
    withTag: (tag) => byTag.get(tag) ?? noEntities,
    firstWithTag,
    forEachWithin,
    within,
    nearest,
    countWithin,
    countByKind,
    removeOwnedBy,
    clear,
    /** How many entities exist. */
    get count() {
      return byId.size;
    },
    /** Every entity, for the rare full sweep. */
    all: () => byId.values(),
    grid,
  };

  /**
   * Registers a new entity.
   * @param {Object} description
   * @param {string} description.kind One of ENTITY_KINDS.
   * @param {string} description.owner The owning system's name.
   * @param {{x: number, y: number, z: number}} [description.position] Used as is (not copied),
   *   so the owner can hand in the vector it already moves; default a new { x: 0, y: 0, z: 0 }.
   * @param {number} [description.heading] Radians; default 0.
   * @param {number} [description.radius] Metres; default 0.5.
   * @param {Iterable<string>} [description.tags] Initial tags.
   * @param {any} [description.data] The owner's object.
   * @returns {GameEntity}
   */
  function add(description) {
    /** @type {GameEntity} */
    const entity = {
      id: nextId,
      kind: description.kind,
      owner: description.owner,
      position: description.position ?? { x: 0, y: 0, z: 0 },
      heading: description.heading ?? 0,
      radius: description.radius ?? 0.5,
      tags: new Set(description.tags ?? []),
      alive: true,
      data: description.data ?? null,
    };
    nextId += 1;
    byId.set(entity.id, entity);
    indexInto(byKind, entity.kind, entity);
    for (const tag of entity.tags) indexInto(byTag, tag, entity);
    grid.insert(entity);
    if (options.onAdded) options.onAdded(entity);
    return entity;
  }

  /**
   * Removes an entity. Safe to call twice and from inside a query visitor.
   * @param {GameEntity | number | null} entityOrId The entity or its id.
   * @returns {boolean} True when it was registered.
   */
  function remove(entityOrId) {
    const entity = typeof entityOrId === 'number' ? byId.get(entityOrId) : entityOrId;
    if (!entity || !entity.alive) return false;
    entity.alive = false;
    byId.delete(entity.id);
    byKind.get(entity.kind)?.delete(entity);
    for (const tag of entity.tags) byTag.get(tag)?.delete(entity);
    grid.remove(entity);
    if (options.onRemoved) options.onRemoved(entity);
    return true;
  }

  /** Adds a tag to an entity. */
  function addTag(entity, tag) {
    if (!entity.alive || entity.tags.has(tag)) return;
    entity.tags.add(tag);
    indexInto(byTag, tag, entity);
  }

  /** Removes a tag from an entity. */
  function removeTag(entity, tag) {
    if (!entity.tags.delete(tag)) return;
    byTag.get(tag)?.delete(entity);
  }

  /**
   * Re-files one entity in the grid now: call it after a teleport when a query in the same step
   * must already see the new place.
   * @param {GameEntity} entity The entity that moved.
   */
  function refresh(entity) {
    if (entity.alive) grid.update(entity);
  }

  /** Re-files every entity that changed cell. The engine calls it after each fixed step. */
  function refreshAll() {
    for (const entity of byId.values()) grid.update(entity);
  }

  /**
   * Any one entity carrying a tag (the player, for instance).
   * @param {string} tag The tag.
   * @returns {GameEntity | null}
   */
  function firstWithTag(tag) {
    const tagged = byTag.get(tag);
    if (!tagged) return null;
    for (const entity of tagged) return entity;
    return null;
  }

  /**
   * Visits the entities whose circle touches a circle on the ground. Allocates nothing.
   * @param {number} x Centre X.
   * @param {number} z Centre Z.
   * @param {number} radius Metres.
   * @param {(entity: GameEntity, distanceSquared: number) => (void | boolean)} visit Return true
   *   to stop the search.
   * @param {EntityFilter} [filter] Which entities to visit.
   */
  function forEachWithin(x, z, radius, visit, filter) {
    grid.forEachInRadius(x, z, radius, (entity, distanceSquared) => {
      if (filter && !passes(/** @type {GameEntity} */ (entity), filter)) return false;
      return visit(/** @type {GameEntity} */ (entity), distanceSquared);
    });
  }

  /**
   * Collects the entities whose circle touches a circle on the ground.
   * @param {number} x Centre X.
   * @param {number} z Centre Z.
   * @param {number} radius Metres.
   * @param {EntityFilter} [filter] Which entities to collect.
   * @param {GameEntity[]} [out] Receives the result (emptied first); a new array when omitted.
   *   Pass your own scratch array in code that runs every step.
   * @returns {GameEntity[]} The entities, nearest first.
   */
  function within(x, z, radius, filter, out = []) {
    out.length = 0;
    grid.forEachInRadius(x, z, radius, (entity) => {
      if (!filter || passes(/** @type {GameEntity} */ (entity), filter)) out.push(entity);
    });
    out.sort((a, b) => distanceSquaredTo(a, x, z) - distanceSquaredTo(b, x, z));
    return out;
  }

  /**
   * The entity whose centre is nearest to a point.
   * @param {number} x Point X.
   * @param {number} z Point Z.
   * @param {number} maxRadius Metres; farther entities are ignored.
   * @param {EntityFilter} [filter] Which entities to consider.
   * @returns {GameEntity | null}
   */
  function nearest(x, z, maxRadius, filter) {
    return /** @type {GameEntity | null} */ (
      grid.nearest(x, z, maxRadius, filter ? (entity) => passes(/** @type {GameEntity} */ (entity), filter) : undefined)
    );
  }

  /**
   * How many entities touch a circle on the ground.
   * @param {number} x Centre X.
   * @param {number} z Centre Z.
   * @param {number} radius Metres.
   * @param {EntityFilter} [filter] Which entities to count.
   * @returns {number}
   */
  function countWithin(x, z, radius, filter) {
    let count = 0;
    grid.forEachInRadius(x, z, radius, (entity) => {
      if (!filter || passes(/** @type {GameEntity} */ (entity), filter)) count += 1;
    });
    return count;
  }

  /**
   * The number of entities of each kind, for the performance overlay and the debug summary.
   * @returns {Record<string, number>}
   */
  function countByKind() {
    const counts = {};
    for (const [kind, set] of byKind) {
      if (set.size > 0) counts[kind] = set.size;
    }
    return counts;
  }

  /**
   * Removes every entity a system owns (when the system shuts down or a save is loaded).
   * @param {string} owner The system's name.
   * @returns {number} How many were removed.
   */
  function removeOwnedBy(owner) {
    let removed = 0;
    for (const entity of [...byId.values()]) {
      if (entity.owner === owner && remove(entity)) removed += 1;
    }
    return removed;
  }

  /** Removes every entity. Ids keep counting up. */
  function clear() {
    for (const entity of [...byId.values()]) remove(entity);
  }

  return registry;
}

function indexInto(index, key, entity) {
  let set = index.get(key);
  if (!set) {
    set = new Set();
    index.set(key, set);
  }
  set.add(entity);
}

function passes(entity, filter) {
  if (filter.kind !== undefined && entity.kind !== filter.kind) return false;
  if (filter.tag !== undefined && !entity.tags.has(filter.tag)) return false;
  if (filter.withoutTag !== undefined && entity.tags.has(filter.withoutTag)) return false;
  if (filter.exclude !== undefined && entity === filter.exclude) return false;
  if (filter.accept !== undefined && !filter.accept(entity)) return false;
  return true;
}

function distanceSquaredTo(entity, x, z) {
  const dx = entity.position.x - x;
  const dz = entity.position.z - z;
  return dx * dx + dz * dz;
}
