// The lead's vitals: armour soaking, the bill and fine, the down timeline, the nearest respawn
// landmark, and a whole wasted and busted run on a fake context; and the lead's paints.
import assert from 'node:assert/strict';
import test from 'node:test';
import { DOWN_TITLES } from '../../../game/src/player/downScreen.js';
import { DOWN_TIMELINE, absorbDamage, chargeFor, createLeadVitals, downPhase, nearestLandmark } from '../../../game/src/player/healthAndRespawn.js';
import { leadPaints, storyCharacter } from '../../../game/src/player/leadAppearance.js';
import { BUSTED_RULES, WASTED_RULES } from '../../../game/src/catalog/wantedLevels.js';
import { GAME_EVENTS } from '../../../game/src/core/events/gameEvents.js';
import { GAME_COMMANDS } from '../../../game/src/core/events/gameCommands.js';

test('armour soaks first, health never below zero', () => {
  assert.deepEqual(absorbDamage(100, 30, 50), { health: 80, armour: 0, taken: 20 });
  assert.deepEqual(absorbDamage(100, 60, 50), { health: 100, armour: 10, taken: 0 });
  assert.deepEqual(absorbDamage(10, 0, 50), { health: 0, armour: 0, taken: 10 });
});

test('bill and fine follow the catalog percent and clamps', () => {
  assert.equal(chargeFor(0, WASTED_RULES, 'billPercentOfCash', 'billMinimum', 'billMaximum'), WASTED_RULES.billMinimum);
  assert.equal(chargeFor(1e9, BUSTED_RULES, 'finePercentOfCash', 'fineMinimum', 'fineMaximum'), BUSTED_RULES.fineMaximum);
  assert.equal(chargeFor(10000, BUSTED_RULES, 'finePercentOfCash', 'fineMinimum', 'fineMaximum'), 1000);
});

test('the down timeline shows the title, fades to black, respawns, fades back', () => {
  assert.equal(downPhase(1).title, 1);
  assert.equal(downPhase(1).black, 0);
  const blackAt = DOWN_TIMELINE.title + DOWN_TIMELINE.fadeOut;
  assert.equal(downPhase(blackAt + 0.1).black, 1);
  assert.equal(downPhase(blackAt + 0.1).respawn, false);
  assert.equal(downPhase(blackAt + DOWN_TIMELINE.black + 0.01).respawn, true);
  assert.equal(downPhase(blackAt + DOWN_TIMELINE.black + DOWN_TIMELINE.fadeIn + 0.01).done, true);
});

test('nearest landmark of a kind', () => {
  const marks = [{ kind: 'hospital', x: 500, z: 0 }, { kind: 'police_station', x: 10, z: 0 }, { kind: 'hospital', x: -100, z: 0 }];
  assert.equal(nearestLandmark(marks, 'hospital', 0, 0).x, -100);
  assert.equal(nearestLandmark(marks, 'police_station', 0, 0).x, 10);
  assert.equal(nearestLandmark(marks, 'fire_station', 0, 0), null);
});

function fakeContext() {
  const handlers = new Map(), listeners = new Map(), emitted = [], sent = [];
  let state = 'playing';
  // As the city plan gives them: frontX / frontZ the unit direction the lot faces (QA bug 1).
  const landmarks = [
    { kind: 'hospital', x: 100, z: 0, frontX: 0, frontZ: 1, entrance: { x: 100, z: 20 } },
    { kind: 'police_station', x: -50, z: 0, frontX: 1, frontZ: 0 },
  ];
  const context = {
    random: () => ({ next: () => 0.5 }),
    systems: { find: (name) => (name === 'openWorldCity' ? { plan: { landmarks } } : name === 'economy' ? { cash: 5000 } : null) },
    commands: {
      handle(name, fn) { handlers.set(name, fn); return () => handlers.delete(name); },
      has: (name) => name === GAME_COMMANDS.ECONOMY_SPEND_MONEY || handlers.has(name),
      send: (name, payload) => sent.push([name, payload]),
      run: (name, payload) => handlers.get(name)(payload),
    },
    events: {
      emit: (name, payload) => emitted.push([name, payload]),
      on: (name, fn) => listeners.set(name, fn),
      off: (name) => listeners.delete(name),
    },
    state: { is: (name) => state === name, enter: (name) => { state = name; }, get timeScale() { return state === 'wasted' ? 0.25 : state === 'busted' ? 0.35 : 1; }, get name() { return state; } },
  };
  return { context, emitted, sent, listeners, getState: () => state };
}

function fakeLead() {
  const placed = [];
  const lead = {
    movement: { state: { x: 0, y: 0, z: 0, groundSpeed: 0 } },
    seat: { vehicle: null, exit() {} },
    figure: { gesture: [false, false], setGesture(a, b) { this.gesture = [a, b]; } },
    teleport({ position }) { placed.push(position); lead.movement.state.x = position.x; lead.movement.state.z = position.z; },
  };
  return { lead, placed };
}

function runFor(vitals, realSeconds, scale) {
  for (let t = 0; t < realSeconds; t += 0.1) vitals.update(0.1 * scale());
}

test('damage to zero wastes the lead, who respawns healed at the nearest hospital', () => {
  const { context, emitted, sent, listeners, getState } = fakeContext();
  const { lead, placed } = fakeLead();
  const entity = { id: 7, data: { health: 100, armour: 20 } };
  const vitals = createLeadVitals(context, { entity, lead });
  listeners.get(GAME_EVENTS.DAMAGE_DEALT)({ targetId: 8, amount: 50 });
  assert.equal(entity.data.health, 100);
  listeners.get(GAME_EVENTS.DAMAGE_DEALT)({ targetId: 7, amount: 50, attackerId: 3, kind: 'bullet' });
  assert.deepEqual([entity.data.health, entity.data.armour], [70, 0]);
  assert.equal(vitals.arrestable, true);
  vitals.damage(80, { cause: 'bullet', attackerId: 3 });
  assert.equal(vitals.down, 'wasted');
  assert.equal(getState(), 'wasted');
  assert.deepEqual(lead.figure.gesture, [false, true]);
  const wasted = emitted.find(([name]) => name === GAME_EVENTS.PLAYER_WASTED)[1];
  assert.equal(wasted.killerId, 3);
  assert.equal(wasted.hospitalBill, 400);
  assert.equal(vitals.damage(10), 0, 'no damage while down');
  runFor(vitals, 6, () => context.state.timeScale);
  assert.equal(vitals.down, null);
  assert.equal(getState(), 'playing');
  assert.equal(entity.data.health, 100);
  assert.equal(placed.length, 1);
  assert.ok(Math.abs(placed[0].x - 100) < 1e-9 && Math.abs(placed[0].z - 21.5) < 1e-9, `on the pavement a step out of the hospital entrance, not at the origin: ${placed[0].x}, ${placed[0].z}`);
  assert.equal(sent.length, 0, 'the economy takes the bill from PLAYER_WASTED; the player spends nothing');
  for (const words of Object.values(DOWN_TITLES)) assert.ok(!/WASTED|BUSTED/.test(words.title), 'original titles on the down screen');
  assert.equal(emitted.at(-1)[0], GAME_EVENTS.PLAYER_RESPAWNED);
  assert.equal(emitted.at(-1)[1].after, 'wasted');
});

test('bust takes the lead to the nearest police station once', () => {
  const { context, emitted, getState } = fakeContext();
  const { lead, placed } = fakeLead();
  const vitals = createLeadVitals(context, { entity: { id: 1, data: { health: 60, armour: 50 } }, lead });
  assert.equal(vitals.bust({ officerId: 4 }), true);
  assert.equal(vitals.bust({ officerId: 4 }), false);
  assert.equal(vitals.arrestable, false);
  assert.equal(getState(), 'busted');
  assert.equal(emitted.find(([name]) => name === GAME_EVENTS.PLAYER_BUSTED)[1].fine, 500);
  runFor(vitals, 6, () => context.state.timeScale);
  assert.ok(Math.abs(placed[0].x - (-50 + 18 + 1.5)) < 1e-9 && Math.abs(placed[0].z) < 1e-9, 'out along the front of a station without an entrance');
  assert.equal(vitals.down, null);
});

test('a lead without a model of their own gets their catalog colours', () => {
  const sol = storyCharacter('sol_arrieta');
  assert.ok(sol && sol.playable);
  const paints = leadPaints(sol.appearance);
  assert.equal(paints.paint_jacket, sol.appearance.outfit.top.color);
  assert.equal(paints.paint_skin, sol.appearance.skinTone);
  assert.equal(Object.keys(paints).length, 6);
});
