// When a police car's crew gets out: boxing a slow lead (every kind), and the tactical team pulling
// up short of a lead on foot so the team deploys on the street; the team is sent from nearer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNIT_PROFILES, crewGetsOut, stopsForLeadOnFoot } from '../../../game/src/police/policeUnitKinds.js';

const scene = (over) => ({ boxing: false, carSpeed: 0, distance: 50, leadOnFoot: false, ...over });

test('a patrol car crew gets out only when boxing a slow lead close by, the car nearly still', () => {
  const patrol = UNIT_PROFILES.patrol_car;
  assert.equal(crewGetsOut(patrol, scene({ boxing: true, distance: 12 })), true);
  assert.equal(crewGetsOut(patrol, scene({ boxing: true, distance: 12, carSpeed: 4 })), false);
  assert.equal(crewGetsOut(patrol, scene({ boxing: true, distance: 25 })), false);
  // A lead on foot does not stop a patrol car on its own (it boxes first).
  assert.equal(stopsForLeadOnFoot(patrol, { distance: 10, leadOnFoot: true }), false);
  assert.equal(crewGetsOut(patrol, scene({ leadOnFoot: true, distance: 10 })), false);
});

test('the tactical van stops short of a lead on foot and the team gets out once it is still', () => {
  const swat = UNIT_PROFILES.tactical_team;
  assert.ok(swat.footDismount >= 20 && swat.footDismount <= 40);
  assert.equal(stopsForLeadOnFoot(swat, { distance: swat.footDismount - 1, leadOnFoot: true }), true);
  assert.equal(stopsForLeadOnFoot(swat, { distance: swat.footDismount + 1, leadOnFoot: true }), false);
  assert.equal(stopsForLeadOnFoot(swat, { distance: 5, leadOnFoot: false }), false);
  assert.equal(crewGetsOut(swat, scene({ leadOnFoot: true, distance: 20, carSpeed: 6 })), false);
  assert.equal(crewGetsOut(swat, scene({ leadOnFoot: true, distance: 20, carSpeed: 0.8 })), true);
});

test('the tactical team is sent from nearer than the other cars', () => {
  const [near, far] = UNIT_PROFILES.tactical_team.spawnBand;
  assert.ok(near >= 40 && far <= 110 && near < far);
  assert.equal(UNIT_PROFILES.patrol_car.spawnBand, undefined);
});
