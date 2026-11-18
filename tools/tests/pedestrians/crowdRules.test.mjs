// Pure rules of the pedestrian crowd: route choice and crossing signals on a small pavement
// graph, who walks where and when, what they look like, and how they react to trouble.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createWalkingRoutes, routeWeight, signalStateAt } from '../../../game/src/pedestrians/walkingRoutes.js';
import { archetypeMixAt, bodiesFor, crowdDensityAt, gangBaseFor, hourInRange, pickAppearance } from '../../../game/src/pedestrians/crowdSpawning.js';
import { carThreat, chooseReaction, fleeDirection, knocksDown, stimulusReaches } from '../../../game/src/pedestrians/pedestrianReactions.js';
import { PEDESTRIAN_ARCHETYPES } from '../../../game/src/catalog/pedestrianArchetypes.js';
import { CITY_DISTRICTS } from '../../../game/src/catalog/cityDistricts.js';

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// A plus-shaped corner: node 0 in the middle, pavements east (1), north (2), west (3); a
// signalled crossing south (4) whose conflicting phase is 0.
function plusGraph() {
  const nodes = [
    { id: 0, x: 0, z: 0, edges: [0, 1, 2, 3] },
    { id: 1, x: 20, z: 0, edges: [0] },
    { id: 2, x: 0, z: -20, edges: [1] },
    { id: 3, x: -20, z: 0, edges: [2] },
    { id: 4, x: 0, z: 12, edges: [3] },
  ];
  const edges = [
    { id: 0, a: 0, b: 1, kind: 'sidewalk', paved: true, points: [0, 0, 10, 0, 20, 0], signalNode: -1, conflictPhase: -1 },
    { id: 1, a: 2, b: 0, kind: 'sidewalk', paved: true, points: [0, -20, 0, 0], signalNode: -1, conflictPhase: -1 },
    { id: 2, a: 0, b: 3, kind: 'sidewalk', paved: true, points: [-20, 0, 0, 0], signalNode: -1, conflictPhase: -1 },
    { id: 3, a: 0, b: 4, kind: 'crosswalk', paved: true, points: [0, 0, 0, 12], signalNode: 0, conflictPhase: 0 },
  ];
  const roadNodes = [{ signal: { phases: [{ green: 24, yellow: 3 }, { green: 12, yellow: 3 }], allRed: 2, cycle: 46, offset: 0 } }];
  return createWalkingRoutes({ nodes, edges }, roadNodes);
}

test('place walks an edge either way, keeping right of the direction of travel', () => {
  const routes = plusGraph();
  const out = {};
  routes.place(0, true, 5, 0.5, out);
  assert.ok(Math.abs(out.x - 5) < 1e-9 && Math.abs(out.z - 0.5) < 1e-9, 'eastwards, the right is +Z (south)');
  assert.equal(out.dirX, 1);
  routes.place(0, false, 5, 0.5, out);
  assert.ok(Math.abs(out.x - 15) < 1e-9 && Math.abs(out.z + 0.5) < 1e-9, 'westwards, the right is -Z');
  // Edge 2 has its points from b to a: walking forward still starts at node a.
  routes.place(2, true, 0, 0, out);
  assert.ok(Math.abs(out.x) < 1e-9, 'forward starts at node a whatever the order of the points');
  assert.ok(Math.abs(routes.locate(0, true, 7, 3) - 7) < 1e-9);
  assert.ok(Math.abs(routes.locate(0, false, 7, 3) - 13) < 1e-9);
  assert.equal(routes.lengthOf(0), 20);
});

test('route choice favours straight on, rarely turns back, and is spread over the options', () => {
  const routes = plusGraph();
  const random = seeded(3);
  const counts = { 0: 0, 2: 0, 3: 0, 1: 0 };
  // Arriving at the corner walking east along... from the north (edge 1), heading south (+Z).
  for (let i = 0; i < 4000; i += 1) counts[routes.chooseNextEdge(0, 1, 0, 1, random()).edge] += 1;
  assert.equal(counts[1], 0, 'never back the way they came while there is another way');
  assert.ok(counts[3] > counts[0] && counts[3] > counts[2], 'straight on (the crossing south) is the favourite');
  assert.ok(counts[0] > 400 && counts[2] > 400, 'turning either way happens too');
  const choice = routes.chooseNextEdge(0, 1, 0, 1, 0.999);
  assert.equal(choice.forward, routes.edges[choice.edge].a === 0);
  assert.ok(routeWeight({ kind: 'crosswalk', paved: true }, 1) < routeWeight({ kind: 'sidewalk', paved: true }, 1));
  assert.ok(routeWeight({ kind: 'sidewalk', paved: true }, -1) < routeWeight({ kind: 'sidewalk', paved: true }, 0));
});

test('signalled crossings open only on the walk phase, with a margin before it ends', () => {
  const signal = { phases: [{ green: 24, yellow: 3 }, { green: 12, yellow: 3 }], allRed: 2, cycle: 46, offset: 0 };
  assert.deepEqual(signalStateAt(signal, 0), { phase: 0, left: 27 });
  assert.equal(signalStateAt(signal, 28).phase, -1, 'all red between phases');
  assert.equal(signalStateAt(signal, 30).phase, 1);
  assert.equal(signalStateAt(signal, 46 + 30).phase, 1, 'the cycle repeats');
  const routes = plusGraph();
  assert.equal(routes.crossingOpen(3, 5), false, 'traffic over the crossing has green');
  assert.equal(routes.crossingOpen(3, 31), true, 'walk phase');
  assert.equal(routes.crossingOpen(3, 41.5), false, 'too little of the walk phase left to start');
  assert.equal(routes.crossingOpen(0, 5), true, 'pavements are always open');
});

test('crowds differ by district and hour', () => {
  const beach = archetypeMixAt(CITY_DISTRICTS.playa_dorada, 14, PEDESTRIAN_ARCHETYPES);
  const centro = archetypeMixAt(CITY_DISTRICTS.centro, 14, PEDESTRIAN_ARCHETYPES);
  assert.ok(Object.keys(beach).length > 2 && Object.keys(centro).length > 2);
  assert.notDeepEqual(Object.keys(beach).sort(), Object.keys(centro).sort());
  for (const id of Object.keys(beach)) assert.ok(PEDESTRIAN_ARCHETYPES[id], `${id} is an archetype`);
  const day = archetypeMixAt(CITY_DISTRICTS.playa_dorada, 14, PEDESTRIAN_ARCHETYPES);
  const night = archetypeMixAt(CITY_DISTRICTS.playa_dorada, 3, PEDESTRIAN_ARCHETYPES);
  assert.ok(Object.keys(day).some((id) => night[id] < day[id]), 'some go home at night');
  assert.ok(hourInRange(23.5, [20, 4]) && hourInRange(2, [20, 4]) && !hourInRange(12, [20, 4]));
  assert.ok(crowdDensityAt(CITY_DISTRICTS.centro, 13) >= crowdDensityAt(CITY_DISTRICTS.centro, 3));
});

test('looks come from the archetype ranges and bodies from the registry', () => {
  const random = seeded(11);
  const tourist = PEDESTRIAN_ARCHETYPES.beach_tourist;
  for (let i = 0; i < 50; i += 1) {
    const look = pickAppearance(tourist.appearance, random);
    assert.ok(tourist.appearance.skinTones.includes(look.paints.paint_skin));
    assert.ok(look.height >= tourist.appearance.heightRange[0] - 1e-9 && look.height <= tourist.appearance.heightRange[1] + 1e-9);
    for (const role of ['paint_skin', 'paint_hair', 'paint_jacket', 'paint_top', 'paint_bottom', 'paint_shoes']) assert.match(look.paints[role], /^#[0-9A-F]{6}$/i);
  }
  assert.deepEqual(bodiesFor(['dez_tolliver'], 'female'), ['dez_tolliver']);
  assert.deepEqual(bodiesFor(['dez_tolliver', 'pedestrian_female_a', 'pedestrian_male_a'], 'female'), ['pedestrian_female_a']);
  assert.deepEqual(bodiesFor(['dez_tolliver', 'pedestrian_female_a', 'pedestrian_male_a'], 'male'), ['pedestrian_male_a']);
  assert.deepEqual(bodiesFor(['pedestrian_officer', 'pedestrian_b'], 'male'), ['pedestrian_officer', 'pedestrian_b']);
  // Gang members wear their gang's own base when it is built (characters, shift 9).
  const built = new Set(['jackal_rider', 'remache_stripper', 'gang_member_street']);
  const has = (id) => built.has(id);
  assert.equal(gangBaseFor('marsh_jackals', 'male', has), 'jackal_rider');
  assert.equal(gangBaseFor('los_remaches', 'female', has), 'remache_stripper');
  assert.equal(gangBaseFor('los_remaches', 'male', has), 'gang_member_street');
  assert.equal(gangBaseFor('marsh_jackals', 'female', has), null, 'no woman base: an ordinary one in the colours');
  assert.equal(gangBaseFor('aurelia_circle', 'male', has), null, 'not built: an ordinary one');
  assert.equal(gangBaseFor(undefined, 'male', has), null);
});

test('reactions follow the archetype: tourists flee shots, the bold sometimes fight', () => {
  const random = seeded(5);
  const tally = (archetype, stimulus, situation) => {
    const counts = {};
    for (let i = 0; i < 2000; i += 1) { const r = chooseReaction(archetype, stimulus, random, situation); counts[r] = (counts[r] || 0) + 1; }
    return counts;
  };
  const tourist = tally(PEDESTRIAN_ARCHETYPES.beach_tourist, 'gunfire', {});
  assert.ok(tourist.flee > 1400, 'tourists run');
  const fighters = Object.values(PEDESTRIAN_ARCHETYPES).filter((a) => Object.values(a.reactions).some((t) => t.fight));
  assert.ok(fighters.length > 0, 'some archetypes fight back');
  const bold = fighters[0];
  const stimulus = Object.keys(bold.reactions).find((key) => bold.reactions[key].fight);
  assert.ok((tally(bold, stimulus, { distance: 2, armed: true }).fight || 0) > 0);
  const panicking = tally(PEDESTRIAN_ARCHETYPES.beach_tourist, 'fight_nearby', { panicking: true });
  assert.equal(panicking.film || 0, 0, 'nobody already running stops to film');
  assert.ok(stimulusReaches('gunfire', 50) && !stimulusReaches('gunfire', 80));
  assert.ok(stimulusReaches('gunfire', 80, 2), 'louder guns carry further');
});

test('cars: a threat ahead is seen in time with a side to dive to; a fast touch knocks down', () => {
  // A car at the origin facing north (-Z) at 12 m/s; a person 14 m ahead, slightly to its right.
  const threat = carThreat(0.5, -14, 0, 0, 0, -1, 12);
  assert.ok(threat && threat.seconds > 0.5 && threat.seconds < 1.2);
  assert.equal(threat.side, 1, 'dive to the right of the car, the side they are on');
  assert.equal(carThreat(4, -14, 0, 0, 0, -1, 12), null, 'well to the side is safe');
  assert.equal(carThreat(0, 14, 0, 0, 0, -1, 12), null, 'behind a car going forward is safe');
  assert.ok(carThreat(0, 6, 0, 0, 0, -1, -4), 'a reversing car threatens behind it');
  assert.equal(carThreat(0, -5, 0, 0, 0, -1, 0.5), null, 'a crawling car is no threat');
  assert.ok(knocksDown(0.2, 6) && !knocksDown(0.2, 1) && !knocksDown(2, 10));
  const away = fleeDirection(10, 0, 0, 0, 0, 1);
  assert.ok(away.x > 0 && Math.abs(Math.hypot(away.x, away.z) - 1) < 1e-9, 'away from the trouble');
});
