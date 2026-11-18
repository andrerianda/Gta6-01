// The wanted level's pure rules: heat to stars at the catalog thresholds, witnesses and their
// report delays, the search phase and the ways the stars clear.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WANTED_LEVELS, WANTED_RULES } from '../../../game/src/catalog/wantedLevels.js';
import { CRIME_CATALOG, CRIME_REPORTING } from '../../../game/src/catalog/crimeCatalog.js';
import {
  WANTED_STEP, addCrimeHeat, createWantedState, removeStars, searchSecondsLeft, setWantedLevel, starsForHeat,
  stepWanted, wayToLoseAllows,
} from '../../../game/src/police/crimeHeat.js';
import {
  WITNESS_KIND, chooseWitness, createReportQueue, noticesCrime, queueReport, reportDelayFor, stepReports,
} from '../../../game/src/police/witnessRules.js';

const here = { x: 0, y: 0, z: 0 };
const step = 1 / 60;

function run(state, seconds, seen, at = here) {
  const codes = [];
  for (let t = 0; t < seconds; t += step) {
    const code = stepWanted(state, step, seen, at, WANTED_RULES, WANTED_LEVELS);
    if (code !== WANTED_STEP.NONE) codes.push(code);
  }
  return codes;
}

test('heat becomes stars at the catalog thresholds', () => {
  const t = WANTED_RULES.heatThresholds;
  assert.equal(starsForHeat(0, t), 0);
  assert.equal(starsForHeat(9.9, t), 0);
  assert.equal(starsForHeat(10, t), 1);
  assert.equal(starsForHeat(59, t), 2);
  assert.equal(starsForHeat(60, t), 3);
  assert.equal(starsForHeat(180, t), 5);
});

test('crimes add heat, combos multiply, repeats wait, minStars is a floor', () => {
  const state = createWantedState();
  addCrimeHeat(state, CRIME_CATALOG.vehicular_assault, WANTED_RULES, CRIME_REPORTING, here);
  assert.equal(state.heat, 10);
  assert.equal(state.level, 1);
  const second = addCrimeHeat(state, CRIME_CATALOG.vehicular_assault, WANTED_RULES, CRIME_REPORTING, here);
  assert.ok(Math.abs(second - 11) < 1e-9, 'second crime inside the combo window is worth 1.1x');
  addCrimeHeat(state, CRIME_CATALOG.ramming_police_vehicle, WANTED_RULES, CRIME_REPORTING, here);
  const blocked = addCrimeHeat(state, CRIME_CATALOG.ramming_police_vehicle, WANTED_RULES, CRIME_REPORTING, here);
  assert.equal(blocked, 0, 'ramming again within repeatSeconds adds nothing');
  const fresh = createWantedState();
  addCrimeHeat(fresh, CRIME_CATALOG.steal_police_vehicle, WANTED_RULES, CRIME_REPORTING, here);
  assert.equal(fresh.level, 2, 'stealing a police car jumps to two stars');
  assert.ok(fresh.heat >= WANTED_RULES.heatFloorPerStar[2]);
  const cap = createWantedState();
  for (let i = 0; i < 10; i += 1) {
    cap.time += 100;
    addCrimeHeat(cap, CRIME_CATALOG.helicopter_down, WANTED_RULES, CRIME_REPORTING, here);
  }
  assert.equal(cap.level, 5);
  assert.equal(cap.heat, WANTED_RULES.maxHeat);
});

test('seen holds the stars; unseen starts the search, then clears', () => {
  const state = createWantedState();
  setWantedLevel(state, 1, WANTED_RULES, here);
  assert.deepEqual(run(state, 30, true), [], 'in sight nothing changes');
  assert.equal(state.level, 1);
  const lost = WANTED_RULES.pursuit.lostSightSeconds;
  assert.deepEqual(run(state, lost + 0.1, false), [WANTED_STEP.SEARCH_STARTED]);
  assert.ok(state.searching);
  assert.ok(searchSecondsLeft(state, WANTED_LEVELS) <= WANTED_LEVELS[1].searchSeconds);
  assert.deepEqual(run(state, 3, true), [WANTED_STEP.SPOTTED], 'being seen ends the search');
  assert.equal(state.searching, false);
  const codes = run(state, lost + WANTED_LEVELS[1].searchSeconds + 0.5, false);
  assert.deepEqual(codes, [WANTED_STEP.SEARCH_STARTED, WANTED_STEP.CLEARED]);
  assert.equal(state.level, 0);
  assert.equal(state.heat, 0);
});

test('the search runs faster outside the circle', () => {
  const inside = createWantedState();
  const outside = createWantedState();
  setWantedLevel(inside, 3, WANTED_RULES, here);
  setWantedLevel(outside, 3, WANTED_RULES, here);
  const far = { x: WANTED_LEVELS[3].searchRadius + 50, y: 0, z: 0 };
  run(inside, 30, false);
  run(outside, 30, false, far);
  assert.equal(inside.level, 3);
  assert.ok(searchSecondsLeft(outside, WANTED_LEVELS) < searchSecondsLeft(inside, WANTED_LEVELS));
});

test('clean heat drains; ways to lose follow their star limits', () => {
  const state = createWantedState();
  state.heat = 5;
  run(state, 4, false);
  assert.ok(state.heat < 5 && state.heat > 0);
  assert.equal(wayToLoseAllows('bribe', 4, WANTED_RULES), true);
  assert.equal(wayToLoseAllows('bribe', 5, WANTED_RULES), false);
  assert.equal(wayToLoseAllows('safehouse', 4, WANTED_RULES), false);
  assert.equal(wayToLoseAllows('respray', 5, WANTED_RULES), true);
  assert.equal(wayToLoseAllows('busted', 5, WANTED_RULES), true);
  const outfit = createWantedState();
  setWantedLevel(outfit, 3, WANTED_RULES, here);
  removeStars(outfit, 2, WANTED_RULES);
  assert.equal(outfit.level, 1);
});

test('witnesses: officers report at once, civilians later and only within sight or hearing', () => {
  const theft = CRIME_CATALOG.vehicle_theft;
  assert.equal(reportDelayFor(theft, WITNESS_KIND.OFFICER, WANTED_RULES), 0);
  assert.equal(reportDelayFor(theft, WITNESS_KIND.CIVILIAN, WANTED_RULES), 6);
  assert.equal(reportDelayFor(CRIME_CATALOG.reckless_driving, WITNESS_KIND.CIVILIAN, WANTED_RULES), -1);
  assert.equal(noticesCrime(theft, 30, WANTED_RULES), true);
  assert.equal(noticesCrime(theft, 80, WANTED_RULES), false);
  assert.equal(noticesCrime(CRIME_CATALOG.shoplifting, 10, WANTED_RULES, { night: 1 }), true);
  assert.equal(noticesCrime(CRIME_CATALOG.shoplifting, 12, WANTED_RULES, { night: 0 }), true);
  assert.equal(noticesCrime(CRIME_CATALOG.shoplifting, 12, WANTED_RULES, { night: 1 }), false, 'night shortens sight');
  const people = [
    { id: 1, kind: WITNESS_KIND.CIVILIAN, x: 10, z: 0 },
    { id: 2, kind: WITNESS_KIND.OFFICER, x: 30, z: 0 },
    { id: 3, kind: WITNESS_KIND.OFFICER, x: 300, z: 0 },
  ];
  assert.deepEqual(chooseWitness(theft, 0, 0, people, WANTED_RULES, () => 0), { witnessId: 2, kind: 'officer', delay: 0 });
  assert.equal(chooseWitness(theft, 0, 0, [people[2]], WANTED_RULES, () => 0), null);
  assert.equal(chooseWitness(theft, 0, 0, [people[0]], WANTED_RULES, () => 0.99), null, 'a civilian may not bother');
});

test('reports finish after their delay and are lost with their witness', () => {
  const queue = createReportQueue();
  queueReport(queue, { crimeId: 'assault', witnessId: 7, position: here, delay: 6 });
  queueReport(queue, { crimeId: 'assault', witnessId: 8, position: here, delay: 6 });
  const done = [];
  stepReports(queue, 3, () => true, (r) => done.push(r));
  assert.equal(done.length, 0);
  stepReports(queue, 3.1, (id) => id !== 8, (r) => done.push(r));
  assert.equal(done.length, 1);
  assert.equal(done[0].witnessId, 7);
  assert.equal(queue.pending.length, 0);
});
