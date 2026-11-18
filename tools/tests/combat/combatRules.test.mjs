// Combat rules: the inventory (ammunition, reloading, switching, saving), damage (falloff,
// headshots, armour, crimes), spread and recoil, and the hit shapes of people.
import assert from 'node:assert/strict';
import test from 'node:test';
import { COMBAT_RULES, WEAPON_CATALOG, WEAPON_ORDER, WEAPON_WHEEL_SLOTS } from '../../../game/src/catalog/weaponCatalog.js';
import { createWeaponInventory } from '../../../game/src/combat/weaponInventory.js';
import { crimeOfFiring, crimeOfHit, damageOf, falloffAt, splitArmour, zoneAt } from '../../../game/src/combat/damageRules.js';
import { createAimState, directionInCone, kickAfterShot, settleAim, spreadOf } from '../../../game/src/combat/aimingAndRecoil.js';
import { createHitDetector, createShotResult, raySphere, rayUprightCylinder } from '../../../game/src/combat/hitDetection.js';

const inventory = () => createWeaponInventory(WEAPON_CATALOG, WEAPON_ORDER, WEAPON_WHEEL_SLOTS);

test('a pistol fires its magazine, then reloads from the reserve over its reload time', () => {
  const inv = inventory();
  inv.give('pistol', 20);
  assert.ok(inv.equip('pistol'));
  assert.deepEqual([inv.record.magazine, inv.record.reserve], [14, 6]);
  inv.tick(1);
  let shots = 0;
  for (let step = 0; step < 600 && inv.record.magazine > 0; step += 1) {
    if (inv.tryFire()) shots += 1;
    inv.tick(1 / 60);
  }
  assert.equal(shots, 14);
  assert.equal(inv.tryFire(), false, 'an empty magazine does not fire');
  assert.ok(inv.reloading, 'pulling the trigger on an empty magazine starts a reload');
  let finished = false;
  for (let t = 0; t < WEAPON_CATALOG.pistol.reloadSeconds - 0.05; t += 1 / 60) finished = inv.tick(1 / 60) || finished;
  assert.equal(finished, false, 'not before the reload time');
  for (let i = 0; i < 6; i += 1) finished = inv.tick(1 / 60) || finished;
  assert.ok(finished);
  assert.deepEqual([inv.record.magazine, inv.record.reserve], [6, 0]);
  assert.equal(inv.startReload(), 0, 'no reload with an empty reserve');
});

test('the fire rate limits shots; fists never run out', () => {
  const inv = inventory();
  inv.give('smg', 300);
  inv.equip('smg');
  inv.tick(1);
  let shots = 0;
  for (let step = 0; step < 60; step += 1) { if (inv.tryFire()) shots += 1; inv.tick(1 / 60); }
  assert.ok(shots >= 12 && shots <= 14, `13 rounds a second, got ${shots}`);
  inv.equip('fists');
  inv.tick(1);
  for (let i = 0; i < 50; i += 1) { inv.tick(1); assert.ok(inv.tryFire()); }
});

test('switching cycles owned weapons in catalog order and through wheel slots; saving round-trips', () => {
  const inv = inventory();
  inv.give('baseball_bat'); inv.give('pistol'); inv.give('heavy_revolver', 12);
  assert.equal(inv.cycle(1), 'baseball_bat');
  assert.equal(inv.cycle(1), 'pistol');
  assert.equal(inv.cycle(-1), 'baseball_bat');
  assert.equal(inv.cycle(-1), 'fists');
  assert.equal(inv.cycle(-1), 'heavy_revolver');
  assert.ok(inv.selectSlot('handgun'));
  assert.equal(inv.state.equippedId, 'pistol');
  assert.ok(inv.selectSlot('handgun'));
  assert.equal(inv.state.equippedId, 'heavy_revolver');
  assert.equal(inv.selectSlot('rifle'), false, 'an empty slot selects nothing');
  assert.equal(inv.give('pistol', 9999).reserve, WEAPON_CATALOG.pistol.reserveMax, 'the reserve is capped');
  const saved = JSON.parse(JSON.stringify(inv.serialise()));
  const other = inventory();
  other.restore(saved);
  assert.deepEqual(other.serialise(), inv.serialise());
  assert.equal(other.state.equippedId, 'heavy_revolver');
});

test('damage falls off past range, headshots multiply, vehicles take the vehicle multiplier', () => {
  const pistol = WEAPON_CATALOG.pistol;
  assert.equal(falloffAt(pistol, 10), 1);
  assert.equal(falloffAt(pistol, pistol.maxRange), pistol.rangeFalloffTo);
  assert.equal(falloffAt(pistol, pistol.maxRange + 1), 0);
  assert.ok(Math.abs(falloffAt(pistol, (pistol.range + pistol.maxRange) / 2) - 0.75) < 1e-9);
  assert.equal(damageOf(pistol, 5), 24);
  assert.equal(damageOf(pistol, 5, { zone: 'head' }), 60);
  assert.equal(damageOf(pistol, 5, { vehicle: true }), Math.round(24 * 0.6));
  assert.equal(damageOf(pistol, 500), 0);
  const sniper = WEAPON_CATALOG.sniper_rifle;
  assert.ok(damageOf(sniper, 50, { zone: 'head' }) >= 160 * 3, 'a sniper headshot kills anyone');
  const shotgun = WEAPON_CATALOG.pump_shotgun;
  assert.ok(damageOf(shotgun, 5) * shotgun.pellets > damageOf(shotgun, 25) * shotgun.pellets * 3, 'shotguns fade fast');
});

test('armour soaks its share while it lasts; zones and crimes', () => {
  assert.deepEqual(splitArmour(50, 100, COMBAT_RULES.armorAbsorbs), { armour: 40, health: 10 });
  assert.deepEqual(splitArmour(50, 10, COMBAT_RULES.armorAbsorbs), { armour: 10, health: 40 });
  assert.equal(zoneAt(1.65, 1.8), 'head');
  assert.equal(zoneAt(1.1, 1.8), 'body');
  assert.equal(zoneAt(0.5, 1.8), 'legs');
  assert.equal(crimeOfFiring(WEAPON_CATALOG.pistol), 'discharging_firearm');
  assert.equal(crimeOfFiring(WEAPON_CATALOG.fists), null);
  assert.equal(crimeOfHit(WEAPON_CATALOG.fists, {}), 'assault');
  assert.equal(crimeOfHit(WEAPON_CATALOG.baseball_bat, {}), 'armed_assault');
  assert.equal(crimeOfHit(WEAPON_CATALOG.pistol, { fatal: true }), 'homicide');
  assert.equal(crimeOfHit(WEAPON_CATALOG.pistol, { police: true, fatal: true }), 'officer_down');
  assert.equal(crimeOfHit(WEAPON_CATALOG.pistol, { gang: true, fatal: true }), 'gang_violence');
});

test('spread widens unaimed, moving and with bloom; shots stay inside the cone; recoil settles', () => {
  const pistol = WEAPON_CATALOG.pistol;
  const aimed = spreadOf(pistol, { aiming: true }, COMBAT_RULES);
  assert.equal(aimed, pistol.spread);
  assert.equal(spreadOf(pistol, { aiming: false }, COMBAT_RULES), pistol.spread * COMBAT_RULES.unaimedSpreadMultiplier);
  assert.ok(Math.abs(spreadOf(pistol, { aiming: true, moving: 1 }, COMBAT_RULES) - pistol.spread * pistol.movingSpreadMultiplier) < 1e-12);
  const out = new Float32Array(3);
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  let widest = 0;
  for (let i = 0; i < 500; i += 1) {
    directionInCone(out, 0.6, 0, -0.8, 0.05, rnd(), rnd());
    assert.ok(Math.abs(Math.hypot(out[0], out[1], out[2]) - 1) < 1e-5);
    widest = Math.max(widest, Math.acos(Math.min(1, out[0] * 0.6 - out[2] * 0.8)));
  }
  assert.ok(widest <= 0.0501 && widest > 0.035, `cone ${widest}`);
  const aim = createAimState();
  kickAfterShot(aim, WEAPON_CATALOG.heavy_revolver, 0.5);
  assert.ok(aim.kickPitch > 0.06 && aim.bloom > 0);
  for (let i = 0; i < 60; i += 1) settleAim(aim, 1 / 60);
  assert.ok(aim.kickPitch < 0.07 * 0.01 && aim.bloom < 0.2);
});

test('people are hit on the body and on the head; the nearest of world and person wins', () => {
  assert.ok(Math.abs(raySphere(0, 1.6, 0, 0, 0, -1, 0, 1.6, -10, 0.2) - 9.8) < 1e-9);
  assert.equal(raySphere(0, 1.6, 0, 0, 0, -1, 1, 1.6, -10, 0.2), Infinity);
  assert.ok(Math.abs(rayUprightCylinder(0, 1, 0, 0, 0, -1, 0, -10, 0, 1.4, 0.3) - 9.7) < 1e-9);
  assert.equal(rayUprightCylinder(0, 2, 0, 0, 0, -1, 0, -10, 0, 1.4, 0.3), Infinity);
  const person = { id: 2, kind: 'character', alive: true, tags: new Set(['pedestrian']), position: { x: 0, y: 0, z: -10 }, data: { health: 100 } };
  const shooter = { id: 1, kind: 'character', alive: true, tags: new Set(['player']), position: { x: 0, y: 0, z: 0 }, data: {} };
  const entities = { ofKind: () => [shooter, person], get: (id) => (id === 2 ? person : id === 1 ? shooter : null) };
  let wall = Infinity;
  const physics = {
    raycast(ox, oy, oz, dx, dy, dz, max, mask, ignore, out) {
      if (wall > max) return false;
      Object.assign(out, { hit: true, kind: 2, distance: wall, x: ox + dx * wall, y: oy + dy * wall, z: oz + dz * wall, nx: 0, ny: 0, nz: 1, userRef: null });
      return true;
    },
  };
  const detector = createHitDetector({ physics, entities });
  const shot = createShotResult();
  detector.cast(shot, 0, 1.64, 0, 0, 0, -1, 70, { shooterId: 1 });
  assert.equal(shot.kind, 'character');
  assert.equal(shot.zone, 'head');
  detector.cast(shot, 0, 1.1, 0, 0, 0, -1, 70, { shooterId: 1 });
  assert.equal(shot.zone, 'body');
  wall = 5;
  detector.cast(shot, 0, 1.1, 0, 0, 0, -1, 70, { shooterId: 1 });
  assert.equal(shot.kind, 'world', 'a wall in front stops the shot');
  wall = Infinity;
  detector.cast(shot, 0, 1.1, 0, 0, 0, 1, 70, { shooterId: 1 });
  assert.equal(shot.hit, false, 'nothing behind; the shooter never hits themself');
});
