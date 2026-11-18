// A fight with a gang, as in the Night Shift playtest (six hostile crew downed at the rail yard in
// 0.15 s took the stars from 0 to 5): the wanted run-time on a real entity registry, event bus and
// command queue records violence against a gang member as gang_violence, one report per victim,
// at most every 1.5 s, only through a witness who is not one of the crew, and never above two stars.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as wantedLevels from '../../../game/src/catalog/wantedLevels.js';
import * as crimeCatalog from '../../../game/src/catalog/crimeCatalog.js';
import { ENTITY_KINDS, ENTITY_TAGS } from '../../../game/src/core/entities/entityKinds.js';
import { createEntityRegistry } from '../../../game/src/core/entities/entityRegistry.js';
import { createEventBus } from '../../../game/src/core/events/eventBus.js';
import { createCommandQueue } from '../../../game/src/core/events/commandQueue.js';
import { GAME_EVENTS } from '../../../game/src/core/events/gameEvents.js';
import { createSeededRandom } from '../../../game/src/core/random/seededRandom.js';
import { createWantedLevelRuntime } from '../../../game/src/police/wantedLevelRuntime.js';
import { GANG_VIOLENCE_RULES, crimeAgainstVictim, isGangMember, starCapFor } from '../../../game/src/police/crimeHeat.js';
import { spacedDelay } from '../../../game/src/police/witnessRules.js';

const STEP = 1 / 60;
const quiet = { warn() {}, info() {}, debug() {}, error() {}, child() { return quiet; } };

/** The rail yard: the lead, six hostile crew 8-14 m away, and whoever else the case adds. */
function railYard({ officer = false, civilians = 0 } = {}) {
  const entities = createEntityRegistry();
  const events = createEventBus();
  const commands = createCommandQueue();
  const lead = entities.add({ kind: ENTITY_KINDS.CHARACTER, owner: 'player', position: { x: 0, y: 0, z: 0 }, radius: 0.4, tags: [ENTITY_TAGS.PLAYER] });
  const crew = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    crew.push(entities.add({
      kind: ENTITY_KINDS.CHARACTER, owner: 'pedestrians', radius: 0.4,
      position: { x: Math.cos(angle) * (8 + i), y: 0, z: Math.sin(angle) * (8 + i) },
      tags: [ENTITY_TAGS.PEDESTRIAN, ENTITY_TAGS.GANG, ENTITY_TAGS.HOSTILE],
      data: { factionId: 'los_carriles', missionEnemy: true, health: 100 },
    }));
  }
  if (officer) entities.add({ kind: ENTITY_KINDS.CHARACTER, owner: 'police', position: { x: 30, y: 0, z: 5 }, radius: 0.4, tags: [ENTITY_TAGS.POLICE] });
  const people = [];
  for (let i = 0; i < civilians; i += 1) {
    people.push(entities.add({ kind: ENTITY_KINDS.CHARACTER, owner: 'pedestrians', position: { x: -18, y: 0, z: 4 * i }, radius: 0.4, tags: [ENTITY_TAGS.PEDESTRIAN] }));
  }
  const context = {
    content: { get: (name) => (name === 'wantedLevels' ? wantedLevels : crimeCatalog) },
    events, entities, commands,
    log: quiet,
    random: () => createSeededRandom(7),
    systems: { find: () => null },
    focus: { position: lead.position },
  };
  const wanted = createWantedLevelRuntime(context);
  wanted.start();
  const witnessed = [];
  const levels = [];
  events.on(GAME_EVENTS.CRIME_WITNESSED, (event) => witnessed.push({ ...event, time: wanted.state.time }));
  events.on(GAME_EVENTS.WANTED_LEVEL_CHANGED, ({ level }) => levels.push({ level, time: wanted.state.time }));
  return { entities, events, wanted, lead, crew, people, witnessed, levels };
}

/** What combat sends for the fight: shots, a wound and the kill of each of the six. */
function downTheCrew(yard, killCrime = 'gang_violence') {
  const at = { x: 0, y: 0, z: 0 };
  for (const member of yard.crew) {
    yard.events.emit(GAME_EVENTS.CRIME_COMMITTED, { crimeId: 'discharging_firearm', offenderId: yard.lead.id, victimId: null, position: at });
    yard.events.emit(GAME_EVENTS.CRIME_COMMITTED, { crimeId: 'armed_assault', offenderId: yard.lead.id, victimId: member.id, position: at });
    yard.events.emit(GAME_EVENTS.CRIME_COMMITTED, { crimeId: killCrime, offenderId: yard.lead.id, victimId: member.id, position: at });
    yard.entities.addTag(member, ENTITY_TAGS.DEAD);
    yard.wanted.fixedUpdate(0.025);
  }
}

function run(yard, seconds) {
  let top = yard.wanted.state.level;
  for (let t = 0; t < seconds; t += STEP) {
    yard.wanted.fixedUpdate(STEP);
    top = Math.max(top, yard.wanted.state.level);
  }
  return top;
}

test('gang rules: violence against a gang member is gang_violence; gang violence and shots stop at two stars', () => {
  const { CRIME_CATALOG } = crimeCatalog;
  const { WANTED_RULES } = wantedLevels;
  assert.equal(crimeAgainstVictim('homicide', CRIME_CATALOG, true), 'gang_violence');
  assert.equal(crimeAgainstVictim('armed_assault', CRIME_CATALOG, true), 'gang_violence');
  assert.equal(crimeAgainstVictim('homicide', CRIME_CATALOG, false), 'homicide');
  assert.equal(crimeAgainstVictim('discharging_firearm', CRIME_CATALOG, true), 'discharging_firearm');
  assert.equal(isGangMember({ tags: new Set(['pedestrian', 'hostile']), data: {} }), true);
  assert.equal(isGangMember({ tags: new Set(['pedestrian']), data: { missionEnemy: true } }), true);
  assert.equal(isGangMember({ tags: new Set(['police']), data: { factionId: 'policia' } }), false);
  assert.equal(isGangMember({ tags: new Set(['pedestrian']), data: {} }), false);
  assert.equal(starCapFor('gang_violence', WANTED_RULES), GANG_VIOLENCE_RULES.maxStars);
  assert.equal(starCapFor('homicide', WANTED_RULES), WANTED_RULES.maxStars);
  const gate = { nextAt: -Infinity };
  assert.equal(spacedDelay(gate, 10, 0, 1.5), 0);
  assert.equal(spacedDelay(gate, 10, 0, 1.5), 1.5);
  assert.equal(spacedDelay(gate, 10, 6, 1.5), 6, 'a slow witness keeps its own delay');
  assert.equal(spacedDelay(gate, 10.5, 0, 1.5), 7, 'and later reports queue behind it');
});

test('Night Shift: six crew downed in 0.15 s with an officer watching brings two stars, slowly', () => {
  const yard = railYard({ officer: true, civilians: 2 });
  downTheCrew(yard);
  assert.ok(yard.wanted.state.level <= 1, `right after the fight: ${yard.wanted.state.level} stars`);
  const top = run(yard, 20);
  assert.equal(top, 2, 'the fight alone is worth two stars, never more');
  assert.equal(yard.wanted.state.level, 2);
  const gang = yard.witnessed.filter((event) => event.crimeId === 'gang_violence');
  assert.equal(gang.length, 6, 'one report per victim (the wound and the kill are one crime)');
  for (let i = 1; i < gang.length; i += 1) {
    assert.ok(gang[i].time - gang[i - 1].time >= GANG_VIOLENCE_RULES.spacingSeconds - 2 * STEP, `reports ${i - 1} and ${i} are ${gang[i].time - gang[i - 1].time} s apart`);
  }
  assert.ok(yard.witnessed.every((event) => event.crimeId !== 'homicide' && event.crimeId !== 'armed_assault'));
  const twoStars = yard.levels.find((change) => change.level === 2);
  assert.ok(twoStars && twoStars.time > 1, `two stars only after a few reports (${twoStars?.time} s)`);
});

test('Night Shift with the old combat (kills sent as homicide) is mapped the same way', () => {
  const yard = railYard({ officer: true });
  downTheCrew(yard, 'homicide');
  assert.equal(run(yard, 20), 2);
});

test('the crew are not witnesses: with nobody else around the fight brings no stars', () => {
  const yard = railYard();
  downTheCrew(yard);
  assert.equal(run(yard, 15), 0);
  assert.equal(yard.witnessed.length, 0);
});

test('killing a civilian is still a homicide', () => {
  const yard = railYard({ officer: true, civilians: 2 });
  yard.events.emit(GAME_EVENTS.CRIME_COMMITTED, { crimeId: 'homicide', offenderId: yard.lead.id, victimId: yard.people[0].id, position: { x: 0, y: 0, z: 0 } });
  run(yard, 1);
  assert.equal(yard.witnessed[0]?.crimeId, 'homicide');
  assert.ok(yard.wanted.state.level >= 1);
});
