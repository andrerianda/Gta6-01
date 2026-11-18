// Carried weapons and the moments combat hands to others: the run-time carry hold each melee and
// thrown weapon asks for by name, and the pump's (and bolt's) back-of-stroke call that ejects the
// spent case through effects.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const { WEAPON_CATALOG } = await import('../../../game/src/catalog/weaponCatalog.js');
const { CARRY_HOLDS, WEAPON_HOLDS } = await import('../../../game/src/characters/motion/aimPose.js');
const { carryHoldOf } = await import('../../../game/src/combat/playerCombat.js');
const { BACK_SHARE, RACK_DELAY, createPumpRack } = await import('../../../game/src/combat/pumpRack.js');

test('melee and thrown weapons take the run-time carry holds by name; guns and fists do not', () => {
  assert.equal(carryHoldOf(WEAPON_CATALOG.baseball_bat), 'two_hand_bat');
  assert.equal(carryHoldOf(WEAPON_CATALOG.tire_iron), 'one_hand_club');
  assert.equal(carryHoldOf(WEAPON_CATALOG.grenade), 'throw');
  assert.equal(carryHoldOf(WEAPON_CATALOG.fire_bottle), 'throw');
  assert.equal(carryHoldOf(WEAPON_CATALOG.fists), null, 'fists use the guard stance');
  assert.equal(carryHoldOf(WEAPON_CATALOG.pistol), null);
  for (const hold of ['two_hand_bat', 'one_hand_club', 'throw']) {
    assert.ok(CARRY_HOLDS[hold], `${hold} is a carry hold`);
    assert.equal(WEAPON_HOLDS[hold], undefined, `${hold} is not a gun hold`);
  }
});

test('the case is ejected once, at the back of the pump or bolt stroke', () => {
  const backs = [];
  const rack = createPumpRack({ onBack: (weapon) => backs.push({ id: weapon.id, at: time }) });
  const model = { pump: { position: { z: 0 } }, pumpRestZ: 0, grip: null, heldScale: 1 };
  let time = 0;
  const run = (seconds) => { for (const end = time + seconds; time < end - 1e-9; time += 1 / 60) rack.update(1 / 60, null); };
  rack.start(WEAPON_CATALOG.pump_shotgun, model, null);
  run(1);
  const cycle = WEAPON_CATALOG.pump_shotgun.stance.cycleSeconds;
  assert.equal(backs.length, 1);
  assert.equal(backs[0].id, 'pump_shotgun');
  assert.ok(Math.abs(backs[0].at - (RACK_DELAY + BACK_SHARE * cycle)) < 0.03, `ejected at ${backs[0].at}`);
  // The bolt rifle ejects at its own back point (no pump to move).
  time = 0;
  rack.start(WEAPON_CATALOG.sniper_rifle, model, null);
  run(1.5);
  assert.equal(backs.length, 2);
  assert.equal(backs[1].id, 'sniper_rifle');
  // A pistol shot does not.
  rack.start(WEAPON_CATALOG.pistol, model, null);
  run(1);
  assert.equal(backs.length, 2);
});
