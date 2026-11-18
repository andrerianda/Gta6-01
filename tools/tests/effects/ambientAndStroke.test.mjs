// A pump or bolt gun's case flies on the stroke of its action (timed like combat's pump rack, or
// at combat's 'effects/eject'), never with the shot; the ambient emitters are found along the
// beach, the seawall and the pier from a plan, the nearest ones are chosen round the camera, and
// the new recipes use only known styles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const { createWeaponDischargeEffects, strokeEjectDelay } = await import('../../../game/src/effects/weaponDischargeEffects.js');
const { findAmbientEmitters, nearestEmitters, AMBIENT_KINDS } = await import('../../../game/src/effects/ambientEffects.js');
const { EFFECT_RECIPES, PARTICLE_STYLES } = await import('../../../game/src/effects/effectCatalogue.js');
const { WEAPON_CATALOG } = await import('../../../game/src/catalog/weaponCatalog.js');
const { pumpTravel } = await import('../../../game/src/combat/pumpRack.js');

function discharger() {
  const ejected = [];
  const director = { spawn() {}, eject: (kind) => ejected.push(kind) };
  return { ejected, discharge: createWeaponDischargeEffects({}, director) };
}
const shot = (weaponId, shooterId = 7) => ({ shooterId, weaponId, origin: { x: 0, y: 1.5, z: 0 }, direction: { x: 0, y: 0, z: -1 } });

test('the shotgun shell flies at the back of the pump stroke, not with the shot', () => {
  const stance = WEAPON_CATALOG.pump_shotgun.stance;
  const delay = strokeEjectDelay(stance);
  assert.ok(delay > 0.2 && delay < 0.4, `delay ${delay}`);
  // the pump is fully back at that moment in combat's own stroke
  assert.ok(pumpTravel(delay, stance.cycleSeconds) > 0.99);
  assert.equal(strokeEjectDelay(WEAPON_CATALOG.pistol.stance), 0);
  const { ejected, discharge } = discharger();
  discharge.fired(shot('pump_shotgun'));
  assert.deepEqual(ejected, []);
  assert.equal(discharge.waiting, 1);
  discharge.update(delay - 0.02);
  assert.deepEqual(ejected, []);
  discharge.update(0.03);
  assert.deepEqual(ejected, ['shell']);
  assert.equal(discharge.waiting, 0);
});

test("combat's 'effects/eject' throws the waiting case at once, and from then on it waits for the call", () => {
  const { ejected, discharge } = discharger();
  discharge.fired(shot('pump_shotgun'));
  assert.equal(discharge.eject({ shooterId: 7, weaponId: 'pump_shotgun' }), true);
  assert.deepEqual(ejected, ['shell']);
  discharge.update(1);
  assert.deepEqual(ejected, ['shell'], 'not twice');
  discharge.fired(shot('pump_shotgun'));
  discharge.update(strokeEjectDelay(WEAPON_CATALOG.pump_shotgun.stance) + 0.05);
  assert.deepEqual(ejected, ['shell'], 'waits for the call');
  discharge.eject({ shooterId: 7, weaponId: 'pump_shotgun' });
  assert.deepEqual(ejected, ['shell', 'shell']);
  // another shooter (no call from combat) still gets the timed case
  discharge.fired(shot('pump_shotgun', 9));
  discharge.update(1);
  assert.deepEqual(ejected, ['shell', 'shell', 'shell']);
  assert.equal(discharge.eject({ shooterId: 7, weaponId: 'heavy_revolver' }), false);
});

/** A square island 200 m across: beach on the south edge, seawall elsewhere; a pier south. */
function islandPlan() {
  const ring = [-100, 100, 100, 100, 100, -100, -100, -100];
  const kinds = Uint8Array.from([0, 1, 1, 1]); // edge 0 runs along z = +100 (south): beach
  const shoreDistanceAt = (x, z) => Math.min(100 - Math.abs(x), 100 - Math.abs(z));
  return {
    shoreDistanceAt,
    coast: { landRings: [{ id: 'mainland', ring, kinds }], shoreKinds: [{ name: 'beach' }, { name: 'seawall' }] },
    specialAreas: [{ kind: 'pier', line: [0, 90, 0, 190], width: 6 }],
    roads: { segments: [] },
  };
}

test('surf along the beach, spray along the seawall and round the pier, all out to sea', () => {
  const emitters = findAmbientEmitters(islandPlan());
  const of = (k) => [...emitters.kind].map((kind, i) => [kind, i]).filter(([kind]) => kind === k).map(([, i]) => i);
  const surf = of(0); const spray = of(1); const pier = of(2);
  assert.ok(Math.abs(surf.length - 200 / AMBIENT_KINDS[0].spacing) <= 1, `surf ${surf.length}`);
  for (const i of surf) {
    assert.ok(emitters.z[i] > 100, 'surf stands just off the beach');
    assert.ok(emitters.dz[i] > 0.99, 'facing out to sea');
  }
  assert.ok(spray.length > 35 && spray.length < 50, `spray ${spray.length}`);
  for (const i of spray) assert.ok(Math.abs(emitters.x[i]) > 99.9 || Math.abs(emitters.z[i]) > 99.9);
  assert.ok(pier.length >= 12, `pier ${pier.length}`);
  for (const i of pier) assert.ok(emitters.z[i] > 106 && Math.abs(emitters.x[i]) > 3);
  const out = new Int32Array(4); const distances = new Float32Array(4);
  const n = nearestEmitters(emitters, 0, 104, 30, out, distances);
  assert.equal(n, 4);
  for (let k = 1; k < n; k += 1) assert.ok(distances[k] >= distances[k - 1], 'nearest first');
  assert.ok(distances[0] < 6);
  assert.equal(nearestEmitters(emitters, 0, 0, 30, out, distances), 0, 'none inland');
});

test('the new recipes use known particle styles', () => {
  for (const id of ['surf', 'sea_spray', 'steam_vent', 'boat_wake', 'bow_spray', 'rocket_backblast', 'wreck_fire', 'ground_fire']) {
    for (const burst of EFFECT_RECIPES[id].bursts) assert.ok(burst.style in PARTICLE_STYLES, `${id}: ${burst.style}`);
  }
  for (const kind of AMBIENT_KINDS) assert.ok(kind.effectId in EFFECT_RECIPES, kind.effectId);
});
