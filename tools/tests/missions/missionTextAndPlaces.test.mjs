// Mission text that a picture or the player reads (objective lines short enough for the HUD, no
// glued words), the named moments the showcase starts, and where givers, locals and enemies stand.
import test from 'node:test';
import assert from 'node:assert/strict';
import { STORY_MISSIONS } from '../../../game/src/catalog/storyMissions.js';
import { PEDESTRIAN_ARCHETYPES } from '../../../game/src/catalog/pedestrianArchetypes.js';
import { MISSION_MOMENTS } from '../../../game/src/missions/missionShowcase.js';
import { companyFor, companySpots } from '../../../game/src/missions/missionGivers.js';
import { nearestRouteEdge, standInCrowd } from '../../../game/src/missions/crowdPlacement.js';

const missions = Object.values(STORY_MISSIONS);
const shownTexts = (mission) => [
  mission.title, mission.summary,
  ...mission.objectives.map((o) => o.text),
  ...mission.failConditions.map((f) => f.text),
  ...[...(mission.intro || []), ...(mission.outro || [])].map((line) => line.line ?? line.text),
].filter((text) => typeof text === 'string');

test('acts one and two: every objective line fits the HUD (40 characters at most)', () => {
  for (const mission of missions.filter((m) => m.act <= 2)) {
    for (const objective of mission.objectives) assert.ok(objective.text.length <= 40, `${mission.id}: "${objective.text}" (${objective.text.length})`);
  }
});

test('no shown mission text has glued words or doubled spaces', () => {
  for (const mission of missions) {
    for (const text of shownTexts(mission)) {
      assert.doesNotMatch(text, /\bwith(?!out\b|in\b)[a-z]+/, `${mission.id}: "${text}"`);
      assert.doesNotMatch(text, / {2}|\s[,.:;!?]/, `${mission.id}: "${text}"`);
    }
  }
});

test('every named moment starts a real objective; the chase moments are "lose the police"', () => {
  for (const [name, moment] of Object.entries(MISSION_MOMENTS)) {
    const mission = STORY_MISSIONS[moment.missionId];
    assert.ok(mission, name);
    assert.ok(mission.objectives[moment.startIndex], name);
  }
  for (const name of ['police-chase', 'lose-the-police']) {
    const { missionId, startIndex } = MISSION_MOMENTS[name];
    assert.equal(STORY_MISSIONS[missionId].objectives[startIndex].kind, 'lose_wanted', name);
  }
});

test('the locals by a start: mechanics at the tow garage, dockers at the port, the district crowd elsewhere', () => {
  const random = () => 0.4;
  assert.deepEqual(companyFor('barrio_hierro', PEDESTRIAN_ARCHETYPES, random), ['mechanic', 'factory_worker', 'mechanic']);
  assert.equal(companyFor('puerto_tamarindo', PEDESTRIAN_ARCHETYPES, random)[0], 'dock_worker');
  const elsewhere = companyFor('playa_dorada', PEDESTRIAN_ARCHETYPES, random);
  assert.equal(elsewhere.length, 3);
  for (const id of elsewhere) assert.ok(PEDESTRIAN_ARCHETYPES[id].districts.includes('playa_dorada'), id);
  assert.deepEqual(companyFor('nowhere', PEDESTRIAN_ARCHETYPES, random), []);
});

test('the locals stand in a small circle along the frontage on the giver\'s side, facing its middle', () => {
  const point = { x: 10, z: 20, frontX: 0, frontZ: 1 };     // the street lies to +Z
  const spots = companySpots(point, 3, 0.3);
  assert.equal(spots.length, 3);
  const cx = spots.reduce((s, p) => s + p.x, 0) / 3, cz = spots.reduce((s, p) => s + p.z, 0) / 3;
  // The giver's side is (-frontZ, frontX) = -X; 6.5 m along, a little back towards the door.
  assert.ok(Math.abs(cx - (10 - 6.5)) < 0.05 && Math.abs(cz - (20 - 0.9)) < 0.05, `${cx}, ${cz}`);
  for (const spot of spots) {
    const fx = -Math.sin(spot.facing), fz = -Math.cos(spot.facing);
    const toMiddle = Math.hypot(cx - spot.x, cz - spot.z);
    assert.ok(Math.abs(fx * (cx - spot.x) + fz * (cz - spot.z) - toMiddle) < 1e-6);
  }
});

test('a person stands at the exact point where the crowd has no pavement near it', () => {
  const routes = {
    edges: [{ points: [0, 0, 10, 0] }, { points: [500, 500, 520, 500] }],
    locate: (edge, forward, x) => Math.max(0, x),
  };
  assert.equal(nearestRouteEdge(routes, 480, 470), 1);
  assert.equal(nearestRouteEdge({ edges: [] }, 0, 0), -1);
  const made = [];
  const simulation = {
    routes,
    spawnAt: () => null,
    spawn: (profile, edge, forward, along, mode, extra) => {
      const person = { id: made.length + 1, x: along, z: 0, mode, timer: 0, entity: { position: { x: along, y: 0, z: 0 }, data: extra?.data } };
      made.push({ edge, person });
      return person;
    },
  };
  const person = standInCrowd(simulation, 'dock_worker', -1155, 704, { extra: { data: { missionEnemy: true } } });
  assert.equal(made[0].edge, 0);
  assert.deepEqual([person.x, person.z, person.entity.position.x, person.entity.position.z], [-1155, 704, -1155, 704]);
  assert.equal(person.timer, Infinity);
  // With pavement near, a non-exact person keeps the crowd's own spot.
  const onPavement = { x: 3, z: 1, mode: 'chat', timer: 0, entity: { position: { x: 3, z: 1 } } };
  const kept = standInCrowd({ spawnAt: () => onPavement }, 'mechanic', 0, 0);
  assert.deepEqual([kept.x, kept.z], [3, 1]);
  assert.deepEqual([standInCrowd({ spawnAt: () => ({ ...onPavement }) }, 'mechanic', 7, 8, { exact: true }).x], [7]);
  assert.equal(standInCrowd(null, 'mechanic', 0, 0), null);
});
