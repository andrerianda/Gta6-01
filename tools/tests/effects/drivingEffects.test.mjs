// Driving effects and the effect id aliases: pure logic, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVehicleDrivingEffects, DRIVING_EFFECTS } from '../../../game/src/effects/vehicleDrivingEffects.js';
import { EFFECT_ALIASES, EFFECT_RECIPES, PARTICLE_STYLES, effectIdFor } from '../../../game/src/effects/effectCatalogue.js';
import { COMBAT_EFFECTS } from '../../../game/src/combat/weaponFiring.js';

function fakeCar({ slip = 0, surface = 0, speed = 10, throttle = 0, brake = 0 } = {}) {
  return {
    speed, throttle, brake,
    wheelContact: Uint8Array.from([1, 1, 1, 1]),
    wheelSlip: Float64Array.from([slip, slip, slip, slip]),
    wheelSurface: Uint8Array.from([surface, surface, surface, surface]),
    wheelHubPosition(i, out) { out.x = i % 2 ? 0.8 : -0.8; out.y = 0.33; out.z = i < 2 ? -1.3 : 1.3; return out; },
  };
}

function rig(car, { heading = 0 } = {}) {
  const spawned = [];
  const decals = [];
  const entity = { id: 'v1', position: { x: 10, y: 0, z: 20 }, heading, tags: new Set() };
  const effects = createVehicleDrivingEffects({
    spawn: (r) => { spawned.push({ id: r.effectId, x: r.position.x, z: r.position.z, scale: r.scale }); return true; },
    addDecal: (cell, x, y, z, nx, ny, nz, angle, width, length) => { decals.push({ cell, x, z, angle, length }); return 0; },
    vehicles: () => [entity],
    carOf: () => car,
    listener: () => ({ x: 0, z: 0 }),
    groundHeightAt: () => 0,
  });
  return { effects, spawned, decals, entity };
}

test('a sliding car on asphalt smokes and leaves skid marks along its travel', () => {
  const car = fakeCar({ slip: 0.9 });
  const { effects, spawned, decals, entity } = rig(car);
  for (let i = 0; i < 30; i += 1) { entity.position.z -= 0.3; effects.update(1 / 30); }
  assert.ok(spawned.filter((s) => s.id === 'tyre_smoke').length >= 12, 'smoke puffs');
  assert.ok(decals.length >= 8 && decals.every((d) => d.cell === 'skid'), 'skid marks');
  // travelling north (-Z): the mark's length runs north, angle 0
  for (const d of decals) assert.ok(Math.abs(Math.sin(d.angle)) < 1e-6 && d.length >= DRIVING_EFFECTS.skidSegment);
});

test('a rolling car leaves nothing, even on sand; a sliding one throws a little sand dust', () => {
  const quiet = rig(fakeCar({ slip: 0.05 }));
  for (let i = 0; i < 30; i += 1) quiet.effects.update(1 / 30);
  assert.equal(quiet.spawned.length + quiet.decals.length, 0);
  const rolling = rig(fakeCar({ slip: 0, surface: 2, speed: 12 }));
  for (let i = 0; i < 30; i += 1) rolling.effects.update(1 / 30);
  assert.equal(rolling.spawned.length, 0, 'no dust from a tyre that only rolls');
  const sandy = rig(fakeCar({ slip: 0.8, surface: 2, speed: 12 }));
  for (let i = 0; i < 30; i += 1) sandy.effects.update(1 / 30);
  assert.ok(sandy.spawned.length > 8 && sandy.spawned.every((s) => s.id === 'sand_dust'));
  assert.ok(sandy.spawned.length <= 4 * 1 / (DRIVING_EFFECTS.dustInterval / 0.8) + 4, 'a few puffs a second');
  assert.ok(sandy.spawned.every((s) => s.scale <= 1), 'small puffs');
  assert.equal(sandy.decals.length, 0);
});

test('a stopped car throws nothing: no invented burnout, stale slip or dust (carjack)', () => {
  for (const surface of [0, 2, 4]) {
    const { effects, spawned, decals } = rig(fakeCar({ slip: 0.9, speed: 0.3, throttle: 1, brake: 1, surface }));
    for (let i = 0; i < 60; i += 1) effects.update(1 / 30);
    assert.equal(spawned.length + decals.length, 0, `surface ${surface}`);
  }
});

test('tyre smoke, dust and crash dust stay small, short and see-through', () => {
  for (const id of ['tyre_smoke', 'sand_dust', 'dirt_dust', 'vehicle_debris']) {
    for (const burst of EFFECT_RECIPES[id].bursts) {
      const style = PARTICLE_STYLES[burst.style];
      if (style.emission) continue; // sparks
      assert.ok(style.size[1] * (burst.scale?.[1] ?? 1.15) <= 2.2, `${id}/${burst.style} size`);
      assert.ok(style.opacity <= 0.25, `${id}/${burst.style} opacity`);
      assert.ok(burst.life[1] <= 1.4, `${id}/${burst.style} life`);
    }
  }
});

test('wheels are placed in world space by the heading', () => {
  const { effects, spawned } = rig(fakeCar({ slip: 1 }), { heading: Math.PI / 2 });
  effects.update(0.2);
  // heading +90 degrees faces west: the front wheels (model z -1.3) lie west of the centre
  const xs = spawned.map((s) => s.x).sort((a, b) => a - b);
  assert.ok(Math.abs(xs[0] - (10 - 1.3)) < 1e-4 && Math.abs(xs[xs.length - 1] - (10 + 1.3)) < 1e-4);
});

test('a scrape sparks, at most every sparkGap per car', () => {
  const { effects, spawned } = rig(fakeCar());
  const hit = { vehicleId: 'v1', speed: 6, position: { x: 1, y: 0.5, z: 2 }, normal: { x: 1, y: 0, z: 0 } };
  effects.update(0.01);
  effects.collided(hit);
  effects.collided(hit);
  effects.collided({ ...hit, speed: 1 });
  assert.equal(spawned.filter((s) => s.id === 'scrape_sparks').length, 1);
  effects.update(0.2);
  effects.collided(hit);
  assert.equal(spawned.filter((s) => s.id === 'scrape_sparks').length, 2);
});

test('every effect id combat sends resolves to a recipe', () => {
  for (const id of Object.values(COMBAT_EFFECTS)) {
    assert.ok(EFFECT_RECIPES[effectIdFor(id, 0)], `${id} (wall)`);
    assert.ok(EFFECT_RECIPES[effectIdFor(id, 1)], `${id} (floor)`);
  }
  assert.equal(effectIdFor('bullet_impact', 1), 'bullet_impact_asphalt');
  assert.equal(effectIdFor('bullet_impact', 0), 'bullet_impact_concrete');
  for (const target of Object.values(EFFECT_ALIASES)) assert.ok(EFFECT_RECIPES[target], target);
  for (const recipe of Object.values(EFFECT_RECIPES)) if (recipe.sustain) assert.ok(EFFECT_RECIPES[recipe.sustain.effectId]);
});
