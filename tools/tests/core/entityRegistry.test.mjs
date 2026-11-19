// The entity registry and its uniform grid: ids, kinds, tags, and proximity queries checked
// against a brute-force search.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ENTITY_KINDS, ENTITY_TAGS } from '../../../game/src/core/entities/entityKinds.js';
import { createEntityRegistry } from '../../../game/src/core/entities/entityRegistry.js';
import { createSpatialHashGrid } from '../../../game/src/core/entities/spatialHashGrid.js';
import { createSeededRandom } from '../../../game/src/core/random/seededRandom.js';

function populate(registry, count, seed = 7) {
  const random = createSeededRandom(seed);
  const entities = [];
  for (let i = 0; i < count; i += 1) {
    const kind = random.pick([ENTITY_KINDS.CHARACTER, ENTITY_KINDS.VEHICLE, ENTITY_KINDS.PICKUP]);
    entities.push(registry.add({
      kind,
      owner: kind === ENTITY_KINDS.VEHICLE ? 'traffic' : 'pedestrians',
      position: { x: random.range(-1500, 1500), y: 2, z: random.range(-1500, 1500) },
      radius: kind === ENTITY_KINDS.VEHICLE ? random.range(1.5, 6) : 0.4,
      tags: random.chance(0.3) ? [ENTITY_TAGS.POLICE] : [],
    }));
  }
  return entities;
}

test('entities get unique ids and are found by id, kind and tag', () => {
  const added = [];
  const removed = [];
  const registry = createEntityRegistry({ onAdded: (entity) => added.push(entity.id), onRemoved: (entity) => removed.push(entity.id) });
  const position = { x: 5, y: 2, z: -3 };
  const car = registry.add({ kind: ENTITY_KINDS.VEHICLE, owner: 'traffic', position, radius: 2.4, tags: [ENTITY_TAGS.TRAFFIC], data: { model: 'taxi_cab' } });
  const player = registry.add({ kind: ENTITY_KINDS.CHARACTER, owner: 'player', tags: [ENTITY_TAGS.PLAYER] });
  assert.notEqual(car.id, player.id);
  assert.equal(car.position, position, 'the position object is used as given');
  assert.equal(registry.get(car.id), car);
  assert.equal(registry.count, 2);
  assert.deepEqual([...registry.ofKind(ENTITY_KINDS.VEHICLE)], [car]);
  assert.equal(registry.firstWithTag(ENTITY_TAGS.PLAYER), player);
  assert.equal(registry.firstWithTag(ENTITY_TAGS.POLICE), null);

  registry.addTag(car, ENTITY_TAGS.PARKED);
  registry.removeTag(car, ENTITY_TAGS.TRAFFIC);
  assert.deepEqual([...registry.withTag(ENTITY_TAGS.PARKED)], [car]);
  assert.equal(registry.withTag(ENTITY_TAGS.TRAFFIC).size, 0);

  assert.equal(registry.remove(car), true);
  assert.equal(registry.remove(car), false);
  assert.equal(car.alive, false);
  assert.equal(registry.get(car.id), null);
  assert.deepEqual(registry.countByKind(), { character: 1 });
  assert.deepEqual(added, [car.id, player.id]);
  assert.deepEqual(removed, [car.id]);
  const next = registry.add({ kind: ENTITY_KINDS.PICKUP, owner: 'economy' });
  assert.ok(next.id > player.id, 'ids are never reused');
});

test('within() matches a brute-force search, nearest first, with filters', () => {
  const registry = createEntityRegistry();
  const entities = populate(registry, 3000);
  const random = createSeededRandom(99);
  for (let query = 0; query < 60; query += 1) {
    const x = random.range(-1500, 1500);
    const z = random.range(-1500, 1500);
    const radius = random.range(5, 260);
    const filter = query % 3 === 0 ? { kind: ENTITY_KINDS.VEHICLE } : query % 3 === 1 ? { tag: ENTITY_TAGS.POLICE } : undefined;
    const expected = entities
      .filter((entity) => {
        if (filter?.kind && entity.kind !== filter.kind) return false;
        if (filter?.tag && !entity.tags.has(filter.tag)) return false;
        return Math.hypot(entity.position.x - x, entity.position.z - z) <= radius + entity.radius;
      })
      .map((entity) => entity.id)
      .sort((a, b) => a - b);
    const found = registry.within(x, z, radius, filter);
    assert.deepEqual(found.map((entity) => entity.id).sort((a, b) => a - b), expected);
    for (let i = 1; i < found.length; i += 1) {
      const before = Math.hypot(found[i - 1].position.x - x, found[i - 1].position.z - z);
      const after = Math.hypot(found[i].position.x - x, found[i].position.z - z);
      assert.ok(before <= after + 1e-9, 'nearest first');
    }
    assert.equal(registry.countWithin(x, z, radius, filter), expected.length);
  }
});

test('nearest() matches a brute-force search and honours exclude and accept', () => {
  const registry = createEntityRegistry();
  const entities = populate(registry, 2000, 11);
  const random = createSeededRandom(5);
  for (let query = 0; query < 60; query += 1) {
    const x = random.range(-1500, 1500);
    const z = random.range(-1500, 1500);
    const maxRadius = random.range(20, 400);
    let best = null;
    let bestDistance = maxRadius;
    for (const entity of entities) {
      if (entity.kind !== ENTITY_KINDS.CHARACTER) continue;
      const distance = Math.hypot(entity.position.x - x, entity.position.z - z);
      if (distance <= bestDistance) {
        best = entity;
        bestDistance = distance;
      }
    }
    const found = registry.nearest(x, z, maxRadius, { kind: ENTITY_KINDS.CHARACTER });
    assert.equal(found?.id ?? null, best?.id ?? null);
    if (best) {
      const second = registry.nearest(x, z, maxRadius, { kind: ENTITY_KINDS.CHARACTER, exclude: best });
      assert.notEqual(second, best);
      assert.equal(registry.nearest(x, z, maxRadius, { accept: () => false }), null);
    }
  }
});

test('moved entities are found at their new place after a refresh', () => {
  const registry = createEntityRegistry();
  const car = registry.add({ kind: ENTITY_KINDS.VEHICLE, owner: 'traffic', position: { x: 0, y: 0, z: 0 }, radius: 2 });
  car.position.x = 900;
  car.position.z = -700;
  assert.equal(registry.within(900, -700, 10).length, 0, 'not re-filed yet');
  registry.refreshAll();
  assert.deepEqual(registry.within(900, -700, 10), [car]);
  assert.equal(registry.within(0, 0, 10).length, 0);
  car.position.x = -5000;
  registry.refresh(car);
  assert.equal(registry.nearest(-5000, -700, 50), car);
});

test('forEachWithin can stop early and can remove what it visits', () => {
  const registry = createEntityRegistry();
  for (let i = 0; i < 50; i += 1) {
    registry.add({ kind: ENTITY_KINDS.PICKUP, owner: 'economy', position: { x: i, y: 0, z: 0 }, radius: 0.5 });
  }
  let visited = 0;
  registry.forEachWithin(25, 0, 100, () => {
    visited += 1;
    return visited === 3;
  });
  assert.equal(visited, 3);
  registry.forEachWithin(25, 0, 100, (entity) => {
    registry.remove(entity);
  });
  assert.equal(registry.count, 0);
});

test('removeOwnedBy and clear', () => {
  const registry = createEntityRegistry();
  populate(registry, 200);
  const before = registry.count;
  const removed = registry.removeOwnedBy('traffic');
  assert.ok(removed > 0 && removed < before);
  assert.equal(registry.ofKind(ENTITY_KINDS.VEHICLE).size, 0);
  registry.clear();
  assert.equal(registry.count, 0);
  assert.equal(registry.grid.size, 0);
});

test('the grid alone: insert, update, remove keep its bookkeeping consistent', () => {
  const grid = createSpatialHashGrid(16);
  const items = Array.from({ length: 300 }, (_, i) => ({ position: { x: (i % 20) * 9, z: Math.floor(i / 20) * 9 }, radius: 1 }));
  for (const item of items) grid.insert(item);
  assert.equal(grid.size, 300);
  for (const item of items) {
    item.position.x += 400;
    grid.update(item);
  }
  let found = 0;
  grid.forEachInRadius(400 + 90, 67, 1000, () => { found += 1; });
  assert.equal(found, 300);
  for (const item of items) grid.remove(item);
  assert.equal(grid.size, 0);
  assert.equal(grid.cellCount(), 0);
});

test('queries stay fast with thousands of entities', () => {
  const registry = createEntityRegistry();
  populate(registry, 5000, 3);
  const scratch = [];
  const started = performance.now();
  for (let i = 0; i < 2000; i += 1) registry.within((i % 100) * 30 - 1500, (i % 37) * 80 - 1500, 60, undefined, scratch);
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 400, `2000 queries took ${elapsed.toFixed(1)} ms`);
});
