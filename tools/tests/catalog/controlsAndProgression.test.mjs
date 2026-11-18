// The default bindings must not collide inside a context, and the rank ladder must agree with
// the story: mission rank gates are reachable from story reputation alone, and every weapon is
// listed at the rank its catalog entry names.
// Run with: node --test "tools/tests/catalog/*.test.mjs"
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STORY_MISSIONS, STORY_MISSION_ORDER } from '../../../game/src/catalog/storyMissions.js';
import { WEAPON_CATALOG, WEAPON_WHEEL_SLOTS } from '../../../game/src/catalog/weaponCatalog.js';
import { SIDE_ACTIVITY_RULES } from '../../../game/src/catalog/sideActivities.js';
import * as controls from '../../../game/src/catalog/playerControls.js';
import * as progression from '../../../game/src/catalog/progressionRanks.js';

const { PLAYER_CONTROLS, CONTROL_CONTEXTS, WEAPON_SLOT_KEYS } = controls;
const { PROGRESSION_RANKS, TRACKED_STATISTICS, COMPLETION_WEIGHTS, FUN_TOGGLES } = progression;

/** True when a value and everything inside it is frozen. */
function isDeepFrozen(value) {
  if (value === null || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

test('both modules are deeply frozen', () => {
  for (const module of [controls, progression]) {
    for (const [name, value] of Object.entries(module)) assert.ok(isDeepFrozen(value), `${name} is not deeply frozen`);
  }
});

test('bindings: every action has a label and a key, with no collision inside a context', () => {
  const taken = {};
  for (const [key, action] of Object.entries(PLAYER_CONTROLS)) {
    assert.equal(action.id, key);
    assert.ok(action.context in CONTROL_CONTEXTS, `${key}: context`);
    assert.ok(action.label.length > 0 && action.keyCap.length > 0 && action.codes.length > 0, `${key}: label, key cap, codes`);
    for (const code of action.codes) {
      assert.match(code, /^(Key[A-Z]|Digit\d|Arrow(Up|Down|Left|Right)|Mouse[0-2]|Wheel(Up|Down)|Shift(Left|Right)|ControlLeft|Space|Tab|Enter|Escape|Backspace|Period|Comma|F\d+)$/, `${key}: code ${code}`);
      const slot = `${action.context}:${code}`;
      assert.ok(!(slot in taken), `${key} and ${taken[slot]} both use ${code} in ${action.context}`);
      taken[slot] = key;
    }
  }
  // Global actions must not shadow a gameplay key.
  for (const action of Object.values(PLAYER_CONTROLS)) {
    if (action.context !== 'global') continue;
    for (const code of action.codes) {
      for (const context of ['on_foot', 'vehicle', 'boat', 'helicopter']) assert.ok(!(`${context}:${code}` in taken), `${action.id} shadows ${taken[`${context}:${code}`]}`);
    }
  }
  for (const needed of ['move_forward', 'sprint', 'jump', 'enter_vehicle', 'fire', 'aim', 'reload', 'weapon_wheel', 'accelerate', 'handbrake', 'exit_vehicle', 'horn_siren', 'radio_next', 'phone', 'switch_lead', 'pause']) {
    assert.ok(needed in PLAYER_CONTROLS, `missing action ${needed}`);
  }
  assert.ok(SIDE_ACTIVITY_RULES.quitKeyAction in PLAYER_CONTROLS);
  assert.equal(WEAPON_SLOT_KEYS.length, new Set(Object.values(WEAPON_WHEEL_SLOTS).map((slot) => slot.index)).size);
});

test('ranks ascend and agree with missions and weapons', () => {
  PROGRESSION_RANKS.forEach((rank, index) => {
    assert.equal(rank.rank, index);
    if (index > 0) assert.ok(rank.reputation > PROGRESSION_RANKS[index - 1].reputation, `rank ${index}: threshold`);
    for (const weapon of rank.weapons) assert.equal(WEAPON_CATALOG[weapon]?.unlockRank, index, `rank ${index}: weapon ${weapon}`);
  });
  for (const weapon of Object.values(WEAPON_CATALOG)) assert.ok(PROGRESSION_RANKS[weapon.unlockRank].weapons.includes(weapon.id), `${weapon.id}: not listed at rank ${weapon.unlockRank}`);
  let earned = 0;
  for (const id of STORY_MISSION_ORDER) {
    const mission = STORY_MISSIONS[id];
    assert.ok(earned >= PROGRESSION_RANKS[mission.minRank].reputation, `${id}: rank ${mission.minRank} is out of reach with ${earned} reputation`);
    earned += mission.reward.reputation;
  }
  assert.ok(earned < PROGRESSION_RANKS[PROGRESSION_RANKS.length - 1].reputation, 'the top rank should need side activities');
});

test('statistics, completion and fun toggles', () => {
  assert.ok(Object.keys(TRACKED_STATISTICS).length >= 30);
  for (const [key, entry] of Object.entries({ ...TRACKED_STATISTICS, ...FUN_TOGGLES })) assert.equal(entry.id, key);
  const weights = Object.values(COMPLETION_WEIGHTS).filter((value) => typeof value === 'number');
  assert.equal(weights.reduce((sum, weight) => sum + weight, 0), 100);
});
