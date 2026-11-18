// The weapon card stays out of the picture while unarmed and shows for a few seconds after a
// change; the mission end card goes the moment the next mission starts (QA bug 9).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHANGE_SHOW_SECONDS, createWeaponPanel } from '../../../game/src/ui/weaponPanel.js';
import { createMissionObjective, missionHeading } from '../../../game/src/ui/missionObjective.js';

test('a story mission heading carries its place in the story; a side job only its title', () => {
  assert.equal(missionHeading('Sparks Fly', { order: 4, total: 16 }), 'Mission 4/16 · Sparks Fly');
  assert.equal(missionHeading('Taxi Fares', null), 'Taxi Fares');
  assert.equal(missionHeading('Odd', { order: 0, total: 16 }), 'Odd');
});

/** Just enough of the DOM for the HUD widgets: elements with classes, data, text and children. */
function fakeElement(tag = 'div') {
  const classes = new Set();
  return {
    tagName: tag, dataset: {}, hidden: false, textContent: '', innerHTML: '', offsetWidth: 0, children: [],
    set className(value) { classes.clear(); for (const name of String(value).split(/\s+/).filter(Boolean)) classes.add(name); },
    get className() { return [...classes].join(' '); },
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
      toggle: (name, force) => { const on = force ?? !classes.has(name); if (on) classes.add(name); else classes.delete(name); return on; },
    },
    append(child) { this.children.push(child); },
  };
}
const fakeDocument = { createElement: (tag) => fakeElement(tag) };
const WEAPONS = {
  fists: { name: 'Fists', class: 'unarmed', magazine: null },
  pistol: { name: 'Pistol', class: 'handgun', magazine: 12, driveBy: true },
  baseball_bat: { name: 'Baseball bat', class: 'melee', magazine: null },
};

test('the weapon card is hidden unarmed, shows after a change and stays while a weapon is held', () => {
  const card = fakeElement();
  const panel = createWeaponPanel(fakeDocument, card, WEAPONS);
  assert.ok(card.classList.contains('is-unarmed'), 'the lead starts with fists');
  assert.ok(!card.classList.contains('is-recent'), 'no card at the start');

  panel.equip('pistol', 12, 36);
  assert.ok(!card.classList.contains('is-unarmed'));
  assert.ok(card.classList.contains('is-recent'), 'a change shows the card');
  panel.update(CHANGE_SHOW_SECONDS + 0.1);
  assert.ok(!card.classList.contains('is-recent'));
  assert.ok(!card.classList.contains('is-unarmed'), 'a held pistol keeps the card');

  panel.equip('baseball_bat');
  panel.update(CHANGE_SHOW_SECONDS + 0.1);
  assert.ok(!card.classList.contains('is-unarmed'), 'a melee weapon is a weapon held');

  panel.equip('fists');
  assert.ok(card.classList.contains('is-unarmed') && card.classList.contains('is-recent'), 'a switch to fists reads briefly');
  panel.update(1);
  assert.ok(card.classList.contains('is-recent'));
  panel.update(CHANGE_SHOW_SECONDS);
  assert.ok(!card.classList.contains('is-recent'), 'then the unarmed card fades');

  panel.equip('fists');
  assert.ok(!card.classList.contains('is-recent'), 'the same weapon again is no change');
});

test('a new mission clears the end card of the one before and shows its title', () => {
  const hud = fakeElement();
  const container = fakeElement();
  const objective = createMissionObjective(fakeDocument, container, hud);
  const result = hud.children[0];
  objective.start('Twice the Weight');
  objective.setObjective("Get to the cold store's service door");
  objective.clear();
  objective.showResult('failed', 'Twice the Weight', { reason: 'Mission abandoned' });
  assert.ok(result.classList.contains('is-shown'));
  assert.equal(container.hidden, true);

  objective.start('Stamped and Sealed');
  assert.ok(!result.classList.contains('is-shown'), 'the old card goes at once');
  assert.equal(container.hidden, false, 'the title shows');
  objective.setObjective('Meet La Notaria in the back booth');
  assert.equal(container.hidden, false);
  assert.equal(container.children[1].textContent, 'Meet La Notaria in the back booth');
  objective.update(7);
  assert.ok(!result.classList.contains('is-shown'));
});
