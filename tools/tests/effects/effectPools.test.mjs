// Tests of the world effects' pure parts: the particle pool (spawn, budget, death, delay, motion,
// ground, look, sort), the decal ring, the catalogue's consistency and the burst spawner.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createParticlePool, writeParticleLook, sortParticlesFarToNear, PARTICLE_ATTRIBUTE_FLOATS } from '../../../game/src/effects/particlePool.js';
import { createDecalPool } from '../../../game/src/effects/decalPool.js';
import { EFFECT_RECIPES, EFFECT_IDS, PARTICLE_STYLES, STYLE_INDEX, STYLE_LIST, DECAL_CELLS } from '../../../game/src/effects/effectCatalogue.js';
import { spawnEffectBursts } from '../../../game/src/effects/effectSpawning.js';

function seeded(seed = 7) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const smoke = STYLE_INDEX.engineSmoke;
const spark = STYLE_INDEX.spark;

test('particle pool keeps to its budget and counts what it refuses', () => {
  const pool = createParticlePool(5);
  for (let i = 0; i < 8; i += 1) pool.spawn(smoke, 0, 0, 1, 0, 0, 0, 0, 2, 1, 0, 0, 1, 0, 0);
  assert.equal(pool.count, 5);
  assert.equal(pool.dropped, 3);
  assert.equal(pool.spawn(smoke, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0), -1);
});

test('dead particles leave and the live ones stay packed at the front', () => {
  const pool = createParticlePool(10);
  pool.spawn(smoke, 0, 1, 1, 1, 0, 0, 0, 0.5, 1, 0, 0, 1, 0, 0);
  pool.spawn(smoke, 0, 2, 1, 2, 0, 0, 0, 3, 1, 0, 0, 1, 0, 0);
  pool.spawn(smoke, 0, 3, 1, 3, 0, 0, 0, 0.5, 1, 0, 0, 1, 0, 0);
  pool.step(1, STYLE_LIST, 0, 0);
  assert.equal(pool.count, 1);
  assert.equal(pool.px[0], 2);
});

test('a delayed particle waits unseen and still, then lives its full life', () => {
  const pool = createParticlePool(4);
  pool.spawn(spark, 8, 0, 5, 0, 3, 0, 0, 1, 1, 0, 0, 1, 0, 0.5);
  const look = new Float32Array(PARTICLE_ATTRIBUTE_FLOATS);
  writeParticleLook(pool, STYLE_LIST, 0, look, 0);
  assert.equal(look[3], 0, 'no size while waiting');
  pool.step(0.4, STYLE_LIST, 0, 0);
  assert.equal(pool.px[0], 0, 'does not move while waiting');
  pool.step(0.2, STYLE_LIST, 0, 0);
  pool.step(0.8, STYLE_LIST, 0, 0);
  assert.equal(pool.count, 1, 'still alive 1 s after spawning with a 0.5 s delay');
  pool.step(0.3, STYLE_LIST, 0, 0);
  assert.equal(pool.count, 0);
});

test('smoke drifts with the wind and rises; sparks fall and bounce on the ground', () => {
  const pool = createParticlePool(4);
  pool.spawn(smoke, 0, 0, 1, 0, 0, 0, 0, 20, 1, 0, 0, 1, 0, 0);
  pool.spawn(spark, 8, 0, 0.5, 0, 0, -6, 0, 20, 1, 0, 0, 1, 0, 0);
  for (let i = 0; i < 120; i += 1) pool.step(1 / 60, STYLE_LIST, 4, 0);
  const s = PARTICLE_STYLES.engineSmoke;
  assert.ok(pool.vx[0] > 4 * s.wind * 0.8, 'carried by the wind');
  assert.ok(pool.py[0] > 1.5, 'rising');
  assert.ok(pool.py[1] >= 0, 'never below its ground');
  assert.ok(pool.py[1] < 0.5);
});

test('a particle grows, fades in and out, and its emission cools', () => {
  const pool = createParticlePool(2);
  pool.spawn(STYLE_INDEX.flame, 4, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, -1, 0);
  const look = new Float32Array(PARTICLE_ATTRIBUTE_FLOATS);
  writeParticleLook(pool, STYLE_LIST, 0, look, 0);
  const birthOpacity = look[11];
  const birthEmission = look[12];
  pool.step(0.3, STYLE_LIST, 0, 0);
  writeParticleLook(pool, STYLE_LIST, 0, look, 0);
  assert.ok(look[11] > birthOpacity, 'faded in');
  assert.ok(look[12] < birthEmission, 'cooling');
  assert.equal(look[17], 4, 'frame');
  assert.equal(look[15], -1, 'floor height');
});

test('particles are ordered far to near', () => {
  const pool = createParticlePool(8);
  const distances = [5, 80, 1, 300, 20];
  for (const d of distances) pool.spawn(smoke, 0, d, 0, 0, 0, 0, 0, 5, 1, 0, 0, 1, 0, 0);
  const order = new Uint16Array(8);
  sortParticlesFarToNear(pool, 0, 0, 0, order, new Uint16Array(8), new Uint32Array(64));
  const sorted = Array.from(order.slice(0, 5), (i) => pool.px[i]);
  assert.deepEqual(sorted, [300, 80, 20, 5, 1]);
});

test('the decal ring replaces its oldest mark when full and frees faded ones', () => {
  const decals = createDecalPool(3);
  for (let i = 0; i < 3; i += 1) decals.add(0, i, 0, 0, 0, 1, 0, 0, 1, 1, 1, 10);
  assert.equal(decals.count, 3);
  const slot = decals.add(1, 9, 0, 0, 0, 1, 0, 0, 1, 1, 1, 10);
  assert.equal(slot, 0, 'oldest replaced');
  assert.equal(decals.count, 3);
  assert.equal(decals.x[0], 9);
  decals.clean();
  decals.step(11);
  assert.ok(decals.visibleOpacity(1) > 0 && decals.visibleOpacity(1) < 1, 'fading');
  assert.ok(decals.dirtyFrom <= decals.dirtyTo, 'fading marks are dirty');
  decals.step(2);
  assert.equal(decals.count, 0);
  assert.equal(decals.visibleOpacity(1), 0);
  const again = decals.add(2, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 10);
  assert.ok(again >= 0 && again < 3);
  assert.equal(decals.count, 1);
});

test('every recipe names real styles and decal cells; the vehicle effects exist', () => {
  for (const id of ['engine_smoke', 'vehicle_fire', 'vehicle_explosion', 'vehicle_debris', 'muzzle_flash', 'tracer',
    'bullet_impact_asphalt', 'bullet_impact_concrete', 'bullet_impact_glass', 'bullet_impact_metal', 'bullet_impact_water', 'blood_hit']) {
    assert.ok(EFFECT_IDS.includes(id), id);
  }
  for (const [id, recipe] of Object.entries(EFFECT_RECIPES)) {
    for (const burst of recipe.bursts) {
      assert.ok(burst.style in PARTICLE_STYLES, `${id}: ${burst.style}`);
      assert.ok(burst.count[0] <= burst.count[1] && burst.life[0] > 0, id);
    }
    if (recipe.decal) assert.ok(recipe.decal.cell in DECAL_CELLS, id);
    if (recipe.sustain) assert.ok(recipe.sustain.effectId in EFFECT_RECIPES, id);
  }
  for (const style of STYLE_LIST) assert.ok(style.frame >= 0 && style.frame + (style.frames ?? 1) <= 16);
});

test('the burst spawner fills the pool within each burst count and stops at the budget', () => {
  const random = seeded(3);
  const pool = createParticlePool(2000);
  const recipe = EFFECT_RECIPES.vehicle_explosion;
  const n = spawnEffectBursts(pool, recipe, 10, 1, -5, 0, 1, 0, 1, 0, random);
  const min = recipe.bursts.reduce((sum, b) => sum + b.count[0], 0);
  const max = recipe.bursts.reduce((sum, b) => sum + b.count[1], 0);
  assert.ok(n >= min && n <= max, `${n} in ${min}..${max}`);
  assert.equal(pool.count, n);
  for (let i = 0; i < pool.count; i += 1) assert.ok(Number.isFinite(pool.vx[i] + pool.vy[i] + pool.vz[i]));
  const small = createParticlePool(10);
  assert.equal(spawnEffectBursts(small, recipe, 0, 0, 0, 0, 1, 0, 1, 0, random), 10);
  assert.equal(small.count, 10);
});

test('impacts fly out along the surface normal; a rocket back-blast blows out backward', () => {
  const random = seeded(11);
  const pool = createParticlePool(100);
  spawnEffectBursts(pool, EFFECT_RECIPES.bullet_impact_concrete, 0, 1, 0, 1, 0, 0, 1, 0, random);
  let outward = 0;
  for (let i = 0; i < pool.count; i += 1) if (pool.vx[i] > 0) outward += 1;
  assert.equal(outward, pool.count);
  const blast = createParticlePool(100);
  spawnEffectBursts(blast, EFFECT_RECIPES.rocket_backblast, 0, 1.5, 0, 0, 0, 1, 1, 0, random);
  let back = 0; let moving = 0;
  for (let i = 0; i < blast.count; i += 1) {
    if (Math.hypot(blast.vx[i], blast.vz[i]) < 1) continue;
    moving += 1;
    if (blast.vz[i] > 0) back += 1;
  }
  // the jet goes back; a cloud also rolls out all round the shooter (seen from the aim camera)
  assert.ok(back / moving > 0.6, `${back} of ${moving} along the blast`);
});

test('a long run of fire pulses stays within the budget and allocates nothing new', () => {
  const random = seeded(5);
  const pool = createParticlePool(400);
  const arrays = [pool.px, pool.vx, pool.age, pool.style];
  for (let frame = 0; frame < 600; frame += 1) {
    if (frame % 24 === 0) spawnEffectBursts(pool, EFFECT_RECIPES.wreck_fire, 0, 0.5, 0, 0, 1, 0, 1.5, 0, random);
    pool.step(1 / 60, STYLE_LIST, 2, 1);
    assert.ok(pool.count <= 400);
  }
  assert.ok(pool.count > 20);
  assert.deepEqual([pool.px, pool.vx, pool.age, pool.style], arrays);
});
