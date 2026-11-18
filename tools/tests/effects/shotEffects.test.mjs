// What a shot leaves: screen-space tracers live 60 ms and recycle their slots, spent cases fly,
// hop and come to rest on the ground and then go, and WEAPON_FIRED throws the right case per
// weapon class (none from a revolver or the launcher) and long-gun wisps; the rocket back-blast
// recipe (sent by combat) blows out backward.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const THREE = await import('three');
const { createTracerStreaks, TRACER_LIFE } = await import('../../../game/src/effects/tracerStreaks.js');
const { createShellCasings } = await import('../../../game/src/effects/shellCasings.js');
const { createWeaponDischargeEffects } = await import('../../../game/src/effects/weaponDischargeEffects.js');
const { EFFECT_RECIPES } = await import('../../../game/src/effects/effectCatalogue.js');

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test('a tracer shows for 60 ms, its progress runs 0..1, and a full pool reuses the oldest', () => {
  const tracers = createTracerStreaks(4);
  const slot = tracers.add(0, 1.4, 0, 0, 1.2, -30);
  assert.equal(tracers.count, 1);
  assert.equal(tracers.progressOf(slot), 0);
  tracers.update(TRACER_LIFE / 3);
  assert.ok(Math.abs(tracers.progressOf(slot) - 1 / 3) < 1e-5);
  tracers.prepare();
  assert.equal(tracers.mesh.visible, true);
  assert.equal(tracers.mesh.geometry.instanceCount, 1);
  tracers.update(TRACER_LIFE);
  assert.equal(tracers.count, 0);
  assert.equal(tracers.progressOf(slot), -1);
  tracers.prepare();
  assert.equal(tracers.mesh.visible, false);
  for (let i = 0; i < 6; i += 1) tracers.add(i, 1, 0, i, 1, -10);
  assert.equal(tracers.count, 4);
  tracers.dispose();
});

test('spent cases fly out, hop, lie on the ground and are gone after their life', () => {
  const parent = new THREE.Group();
  const casings = createShellCasings(parent, seeded(4), 8);
  const slot = casings.eject('pistol', 0, 1.4, 0, 1, 0.3, 0, 0, -1, 0);
  assert.equal(casings.count, 1);
  assert.equal(casings.mesh.visible, true);
  let peak = 0;
  for (let t = 0; t < 1.5; t += 1 / 60) {
    casings.update(1 / 60);
    peak = Math.max(peak, casings.heightOf(slot));
  }
  assert.ok(peak > 1.4, 'thrown upward first');
  const resting = casings.heightOf(slot);
  assert.ok(resting >= 0 && resting < 0.02, `on the ground (${resting})`);
  for (let t = 0; t < 3; t += 1 / 30) casings.update(1 / 30);
  assert.equal(casings.count, 0);
  assert.equal(casings.mesh.visible, false);
  for (let i = 0; i < 20; i += 1) casings.eject('rifle', 0, 1, 0, 1, 0, 0, 0, -1, 0);
  assert.equal(casings.count, 8, 'a full pool reuses its oldest case');
  casings.dispose();
});

test('WEAPON_FIRED throws a case per class, none from a revolver or launcher, and long-gun wisps', () => {
  const spawned = [];
  const ejected = [];
  const director = {
    spawn: (request) => spawned.push({ id: request.effectId, z: request.direction.z, scale: request.scale }),
    eject: (kind, x, y, z, ex, ey, ez) => ejected.push({ kind, ex, ez }),
  };
  const discharge = createWeaponDischargeEffects({}, director);
  const origin = { x: 0, y: 1.5, z: 0 };
  const direction = { x: 0, y: 0, z: -1 };
  for (const weaponId of ['pistol', 'heavy_revolver', 'smg', 'pump_shotgun', 'assault_rifle', 'sniper_rifle', 'rocket_launcher', 'fists', 'nonsense']) {
    discharge.fired({ shooterId: 7, weaponId, origin, direction });
  }
  assert.deepEqual(ejected.map((e) => e.kind), ['pistol', 'steel', 'shell', 'rifle', 'magnum']);
  for (const e of ejected) assert.ok(e.ex > 0.8, 'out to the right of an aim along -Z');
  const wisps = spawned.filter((s) => s.id === 'muzzle_wisps');
  assert.equal(wisps.length, 4);
  assert.equal(spawned.length, 4, 'combat sends the back-blast itself');
  for (const s of spawned) assert.ok(s.id in EFFECT_RECIPES, s.id);
});
