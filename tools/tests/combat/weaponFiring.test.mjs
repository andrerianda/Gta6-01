// One pull of the trigger against a stand-in game: the events the rest of the game hears.
import assert from 'node:assert/strict';
import test from 'node:test';
import { COMBAT_RULES, WEAPON_CATALOG } from '../../../game/src/catalog/weaponCatalog.js';
import { GAME_EVENTS } from '../../../game/src/core/events/gameEvents.js';
import { COMBAT_EFFECTS, IMPACT_BY_SURFACE, createWeaponFiring } from '../../../game/src/combat/weaponFiring.js';
import { EFFECT_IDS } from '../../../game/src/effects/effectCatalogue.js';

function standInGame({ health = 100, police = false } = {}) {
  const lead = { id: 1, kind: 'character', alive: true, tags: new Set(['player']), position: { x: 0, y: 0, z: 0 }, data: {} };
  const walker = { id: 2, kind: 'character', alive: true, tags: new Set(police ? ['police'] : ['pedestrian']), position: { x: 0, y: 0, z: -12 }, data: { health } };
  const car = { id: 3, kind: 'vehicle', alive: true, tags: new Set(), position: { x: 0, y: 0, z: 20 }, data: { health: 850 } };
  const all = [lead, walker, car];
  const heard = [];
  const effects = [];
  const physics = {
    raycast(ox, oy, oz, dx, dy, dz, max, mask, ignore, out) {
      // The car is a body 19 m behind the lead (+Z); nothing else solid.
      if (dz > 0.9 && 19 <= max) {
        Object.assign(out, { hit: true, kind: 3, distance: 19, x: ox, y: oy, z: oz + 19, nx: 0, ny: 0, nz: -1, userRef: 3 });
        return true;
      }
      return false;
    },
  };
  const context = {
    entities: { ofKind: (kind) => all.filter((e) => e.kind === kind), get: (id) => all.find((e) => e.id === id) ?? null, within: () => [] },
    events: { queue: (topic, payload) => heard.push([topic, payload]), emit: (topic, payload) => heard.push([topic, payload]) },
    commands: { has: () => true, send: (name, payload) => effects.push(payload.effectId) },
    systems: { find: (name) => (name === 'physics' ? physics : name === 'player' ? { entity: lead } : null) },
    simulation: { time: 0 },
  };
  let seed = 3;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const firing = createWeaponFiring(context, { rules: COMBAT_RULES, random });
  const topics = () => heard.map(([topic]) => topic);
  const of = (topic) => heard.filter(([t]) => t === topic).map(([, p]) => p);
  return { firing, lead, walker, car, heard, effects, topics, of };
}

test('a pistol shot at a pedestrian is heard, hurts, and is a crime', () => {
  const game = standInGame();
  const result = game.firing.fire(game.lead, WEAPON_CATALOG.pistol, { x: 0, y: 1.1, z: 0 }, { x: 0, y: 0, z: -1 }, { spread: 0 });
  assert.equal(result.hits, 1);
  assert.deepEqual(game.of(GAME_EVENTS.WEAPON_FIRED).map((e) => e.loudness), [WEAPON_CATALOG.pistol.noiseRadius]);
  const damage = game.of(GAME_EVENTS.DAMAGE_DEALT)[0];
  assert.equal(damage.targetId, 2);
  assert.equal(damage.amount, 24);
  assert.equal(damage.fatal, false);
  assert.deepEqual(game.of(GAME_EVENTS.CRIME_COMMITTED).map((c) => c.crimeId), ['discharging_firearm', 'armed_assault']);
  assert.ok(game.effects.includes('muzzle_flash') && game.effects.includes('tracer') && game.effects.includes('blood_hit'));
});

test('a headshot kills: CHARACTER_KILLED and homicide; an officer is officer_down', () => {
  const game = standInGame({ health: 40 });
  game.firing.fire(game.lead, WEAPON_CATALOG.pistol, { x: 0, y: 1.64, z: 0 }, { x: 0, y: 0, z: -1 }, { spread: 0 });
  const damage = game.of(GAME_EVENTS.DAMAGE_DEALT)[0];
  assert.equal(damage.kind, 'bullet');
  assert.equal(damage.headshot, true);
  assert.equal(game.of(GAME_EVENTS.CHARACTER_KILLED)[0].headshot, true);
  assert.equal(damage.amount, 60);
  assert.equal(damage.fatal, true);
  assert.equal(game.of(GAME_EVENTS.CHARACTER_KILLED)[0].victimId, 2);
  assert.ok(game.of(GAME_EVENTS.CRIME_COMMITTED).some((c) => c.crimeId === 'homicide'));
  const officer = standInGame({ health: 10, police: true });
  officer.firing.fire(officer.lead, WEAPON_CATALOG.pistol, { x: 0, y: 1.1, z: 0 }, { x: 0, y: 0, z: -1 }, { spread: 0 });
  assert.ok(officer.of(GAME_EVENTS.CRIME_COMMITTED).some((c) => c.crimeId === 'officer_down'));
});

test('vehicles take DAMAGE_DEALT with their id; fists are silent and hit only at arm\'s length', () => {
  const game = standInGame();
  game.firing.fire(game.lead, WEAPON_CATALOG.heavy_revolver, { x: 0, y: 1.1, z: 0 }, { x: 0, y: 0, z: 1 }, { spread: 0 });
  const damage = game.of(GAME_EVENTS.DAMAGE_DEALT)[0];
  assert.equal(damage.targetId, 3);
  assert.equal(damage.amount, Math.round(68 * 1.4));
  assert.ok(game.effects.includes('bullet_impact_metal'));
  const quiet = standInGame();
  const miss = quiet.firing.fire(quiet.lead, WEAPON_CATALOG.fists, { x: 0, y: 1.3, z: 0 }, { x: 0, y: 0, z: -1 }, { spread: 0 });
  assert.equal(miss.hits, 0, 'the pedestrian 12 m away is out of reach');
  assert.equal(quiet.of(GAME_EVENTS.WEAPON_FIRED).length, 0);
  quiet.walker.position.z = -1;
  const blow = quiet.firing.fire(quiet.lead, WEAPON_CATALOG.fists, { x: 0, y: 1.3, z: 0 }, { x: 0, y: 0, z: -1 }, { spread: 0 });
  assert.equal(blow.hits, 1);
  assert.equal(quiet.of(GAME_EVENTS.DAMAGE_DEALT)[0].kind, 'melee');
  assert.ok(quiet.of(GAME_EVENTS.CRIME_COMMITTED).some((c) => c.crimeId === 'assault'));
});

test('a death is published once: pellets in one frame add up before the owner applies them', () => {
  const game = standInGame({ health: 30 });
  game.walker.position.z = -6;
  game.firing.fire(game.lead, WEAPON_CATALOG.pump_shotgun, { x: 0, y: 1.1, z: 0 }, { x: 0, y: 0, z: -1 }, { spread: 0 });
  game.firing.fire(game.lead, WEAPON_CATALOG.pistol, { x: 0, y: 1.1, z: 0 }, { x: 0, y: 0, z: -1 }, { spread: 0 });
  assert.equal(game.of(GAME_EVENTS.CHARACTER_KILLED).length, 1);
  assert.equal(game.of(GAME_EVENTS.DAMAGE_DEALT).filter((d) => d.fatal).length, 1);
});

test('an officer whose owner keeps no health still dies once (combat keeps 100) and is not hit again', () => {
  const game = standInGame({ police: true });
  delete game.walker.data.health;
  let kills = 0;
  for (let i = 0; i < 8; i += 1) kills += game.firing.fire(game.lead, WEAPON_CATALOG.pistol, { x: 0, y: 1.1, z: 0 }, { x: 0, y: 0, z: -1 }, { spread: 0 }).kills;
  assert.equal(kills, 1);
  const killed = game.of(GAME_EVENTS.CHARACTER_KILLED);
  assert.equal(killed.length, 1);
  assert.equal(killed[0].police, true);
  assert.equal(game.of(GAME_EVENTS.DAMAGE_DEALT).length, 5, 'four 24-point hits and the fatal fifth, then no more');
});

test('every effect combat sends is one the effects system handles', () => {
  const sent = new Set([...Object.values(COMBAT_EFFECTS), ...IMPACT_BY_SURFACE, 'scrape_sparks']);
  for (const id of sent) assert.ok(EFFECT_IDS.includes(id), `effects has no "${id}"`);
});
