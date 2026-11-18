// The per-weapon stance data (weaponCatalog.js `stance`, owned by combat) and what combat makes of
// it: the run-time hold chosen, the shotgun's pump stroke, the scope's breathing, the arc of a
// throw (launch, flight, bounce) and the Barrio Hierro firefight's street choice.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const { WEAPON_CATALOG } = await import('../../../game/src/catalog/weaponCatalog.js');
const { WEAPON_HOLDS } = await import('../../../game/src/characters/motion/aimPose.js');
const { controllerHoldOf } = await import('../../../game/src/combat/weaponModels.js');
const { PUMP_TRAVEL, createPumpRack, pumpTravel } = await import('../../../game/src/combat/pumpRack.js');
const { breathingSway } = await import('../../../game/src/combat/sniperScope.js');
const { bounceOff, stepFlight, throwVelocity } = await import('../../../game/src/combat/thrownProjectiles.js');
const { candidateStreets, segmentFrame } = await import('../../../game/src/combat/barrioFirefightScene.js');

const HOLDS = ['guard', 'one_hand_club', 'two_hand_bat', 'pistol_two_hand', 'revolver_two_hand', 'smg_compact', 'shotgun_pump', 'rifle', 'sniper', 'launcher_shoulder', 'throw'];
const OFF_HANDS = ['wrap', 'anchor_grip_off', 'pump', 'guard', 'balance', 'point'];
const LOW_READY = ['front45', 'across', 'shoulder', 'hang', 'side', 'relaxed'];
const RELOADS = ['magazine', 'cylinder', 'shells', 'rocket', null];
const CADENCES = ['strike', 'swing', 'single', 'auto', 'pump', 'bolt', 'launch', 'throw'];

test('every weapon has a complete stance in the catalog', () => {
  for (const weapon of Object.values(WEAPON_CATALOG)) {
    const s = weapon.stance;
    assert.ok(s, `${weapon.id} has a stance`);
    assert.ok(HOLDS.includes(s.hold), `${weapon.id} hold ${s.hold}`);
    assert.ok(s.baseHold === null || WEAPON_HOLDS[s.baseHold], `${weapon.id} baseHold ${s.baseHold} exists in the run-time`);
    assert.ok(OFF_HANDS.includes(s.offHand), `${weapon.id} offHand`);
    assert.ok(LOW_READY.includes(s.lowReady), `${weapon.id} lowReady`);
    assert.ok(RELOADS.includes(s.reload), `${weapon.id} reload`);
    assert.ok(CADENCES.includes(s.cadence), `${weapon.id} cadence`);
    assert.ok(s.lean >= 0 && s.lean <= 0.4, `${weapon.id} lean`);
    assert.ok(s.recoil.lift >= 0 && s.recoil.lift < 0.3 && s.recoil.recover > 0 && s.recoil.shake >= 0 && s.recoil.shake <= 1, `${weapon.id} recoil`);
    if (s.cadence === 'pump' || s.cadence === 'bolt') assert.ok(s.cycleSeconds > 0.2 && s.cycleSeconds < 1 / weapon.fireRate, `${weapon.id} cycle fits between shots`);
    if (weapon.magazine !== null && weapon.class !== 'thrown') assert.ok(s.reload, `${weapon.id} reloads somehow`);
  }
  assert.equal(WEAPON_CATALOG.pump_shotgun.stance.offHand, 'pump');
  assert.ok(WEAPON_CATALOG.heavy_revolver.stance.recoil.lift > WEAPON_CATALOG.pistol.stance.recoil.lift, 'the revolver lifts more');
  assert.ok(WEAPON_CATALOG.sniper_rifle.stance.scope.swayRadians > 0);
  assert.ok(WEAPON_CATALOG.rocket_launcher.stance.backblast.length > 2);
});

test('the run-time hold is the stance own hold once built, else its base, else none', () => {
  const fake = { pistol_two_hand: {}, rifle: {}, shotgun: {}, shotgun_pump: {} };
  assert.equal(controllerHoldOf(WEAPON_CATALOG.pump_shotgun, fake), 'shotgun_pump');
  assert.equal(controllerHoldOf(WEAPON_CATALOG.sniper_rifle, fake), 'rifle');
  assert.equal(controllerHoldOf(WEAPON_CATALOG.heavy_revolver, fake), 'pistol_two_hand');
  assert.equal(controllerHoldOf(WEAPON_CATALOG.baseball_bat, fake), null);
  assert.equal(controllerHoldOf({ class: 'smg' }, { smg: {} }), 'smg', 'no stance: the class table');
  for (const weapon of Object.values(WEAPON_CATALOG)) {
    const hold = controllerHoldOf(weapon);
    assert.ok(hold === null || WEAPON_HOLDS[hold], `${weapon.id}: holdWeapon(${hold}) would not throw`);
  }
  assert.equal(controllerHoldOf(WEAPON_CATALOG.pistol), 'pistol_two_hand');
});

test('the pump goes back and forward once after the shot', () => {
  const cycle = WEAPON_CATALOG.pump_shotgun.stance.cycleSeconds;
  assert.equal(pumpTravel(0, cycle), 0);
  assert.ok(pumpTravel(0.1 + cycle * 0.45, cycle) > 0.99, 'fully back at 45 %');
  assert.ok(pumpTravel(0.1 + cycle * 0.2, cycle) > 0 && pumpTravel(0.1 + cycle * 0.8, cycle) < 1);
  assert.equal(pumpTravel(0.1 + cycle + 0.01, cycle), 0);
  // The off hand rides the pump through setWeaponGrip when the run-time has no 'rack'.
  const grips = [];
  const walker = { play(name) { if (name === 'rack') throw new Error('no action "rack"'); }, setWeaponGrip: (x, y, z) => grips.push(z) };
  const pump = { position: { z: 0.2 } };
  const model = { pump, pumpRestZ: 0.2, grip: { x: 0, y: -0.04, z: -0.36 }, heldScale: 1 };
  const rack = createPumpRack();
  rack.start(WEAPON_CATALOG.pump_shotgun, model, walker);
  let most = 0;
  for (let t = 0; t < 0.7; t += 1 / 60) { rack.update(1 / 60, walker); most = Math.max(most, pump.position.z - 0.2); }
  assert.ok(Math.abs(most - PUMP_TRAVEL) < 0.005, `pump travelled ${most}`);
  assert.ok(Math.max(...grips) > -0.36 + PUMP_TRAVEL * 0.9, 'the hand followed');
  assert.equal(pump.position.z, 0.2, 'home after the stroke');
  assert.equal(rack.racking, false);
  // A pistol shot does not rack.
  rack.start(WEAPON_CATALOG.pistol, model, walker);
  assert.equal(rack.racking, false);
});

test('the scope breathes slowly within its amplitude', () => {
  const out = { yaw: 0, pitch: 0 };
  let most = 0;
  for (let t = 0; t < 10; t += 0.05) { breathingSway(out, t, 0.0035, 4.2); most = Math.max(most, Math.abs(out.yaw), Math.abs(out.pitch)); }
  assert.ok(most > 0.002 && most <= 0.0035 * 1.31, `sway ${most}`);
  breathingSway(out, 0.1, 0.0035, 4.2);
  const a = out.yaw; breathingSway(out, 0.15, 0.0035, 4.2);
  assert.ok(Math.abs(out.yaw - a) < 0.0005, 'slow: little change in 50 ms');
});

test('a throw leaves above the aim line and lands on a believable arc', () => {
  const v = { x: 0, y: 0, z: 0 };
  throwVelocity(v, 0, -0.05, -1, 17, 0.3);
  assert.ok(Math.abs(Math.hypot(v.x, v.y, v.z) - 17) < 1e-9);
  assert.ok(v.y > 0 && v.z < 0 && v.x === 0, 'up and forward');
  // Flat ground at y = 0, thrown from 1.72 m: the grenade lands 12-30 m away.
  const body = { x: 0, y: 1.72, z: 0, vx: v.x, vy: v.y, vz: v.z };
  let t = 0;
  while (body.y > 0 && t < 5) { stepFlight(body, 1 / 60, 9.8); t += 1 / 60; }
  assert.ok(-body.z > 12 && -body.z < 30, `landed ${-body.z} m out after ${t.toFixed(2)} s`);
  // Bounce off the ground: up again, slower, still going forward.
  const before = Math.hypot(body.vx, body.vy, body.vz);
  bounceOff(body, 0, 1, 0);
  assert.ok(body.vy > 0 && body.vz < 0 && Math.hypot(body.vx, body.vy, body.vz) < before * 0.75);
  // A steep aim is capped short of straight up.
  throwVelocity(v, 0, 1, -0.01, 10, 0.3);
  assert.ok(Math.abs(v.z) > 0.5);
});

test('the firefight picks a narrow Barrio Hierro street with pavements on both sides', () => {
  const segment = (id, district, width, length, sidewalk) => ({
    id, district, width, halfWidth: width / 2, length, sidewalkLeft: sidewalk, sidewalkRight: sidewalk, bridge: false,
    points: [0, 0, 0, -length / 2, 0, -length],
  });
  const plan = { roads: { segments: [
    segment('avenue', 'barrio_hierro', 28, 200, 4), segment('street', 'barrio_hierro', 11, 120, 2.5),
    segment('alley', 'barrio_hierro', 6, 80, 0), segment('elsewhere', 'centro', 11, 120, 2.5),
  ] } };
  const streets = candidateStreets(plan, 'barrio_hierro');
  assert.deepEqual(streets.map((s) => s.id), ['street']);
  const frame = segmentFrame(streets[0]);
  assert.deepEqual([frame.fx, frame.fz], [0, -1]);
  assert.ok(frame.right > 5.5 && frame.right < 7.2 && frame.left < -5.5, 'pavements beyond the kerbs');
});
