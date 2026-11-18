// When a police car's crew gets out: boxing a slow lead (every kind), and the tactical team pulling
// up short of a lead on foot so the team deploys on the street; the team is sent from nearer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UNIT_PROFILES, approachSpeed, crewGetsOut, deploySpawnScore, stopsForLeadOnFoot,
} from '../../../game/src/police/policeUnitKinds.js';

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

test('a deploying van spawns on a lane that runs towards the lead and past it', () => {
  const band = UNIT_PROFILES.tactical_team.spawnBand;
  // Lane heading north (yaw 0: forward -Z); the lead 65 m up it and 8 m to the side: good.
  const good = deploySpawnScore(band, 8, -65, 0);
  assert.ok(Number.isFinite(good));
  assert.equal(deploySpawnScore(band, 8, 65, 0), Infinity, 'the lead behind the lane: no');
  assert.equal(deploySpawnScore(band, 40, -65, 0), Infinity, 'the lane passes too far to the side: no');
  assert.equal(deploySpawnScore(band, 0, -20, 0), Infinity, 'too close: it would pop in beside the lead');
  assert.ok(deploySpawnScore(band, 2, -66, 0) < deploySpawnScore(band, 15, -90, 0), 'nearer the line and the band\'s near end is better');
  // Heading east (yaw -pi/2: forward +X).
  assert.ok(Number.isFinite(deploySpawnScore(band, 66, 3, -Math.PI / 2)));
});

test('the van eases off coming in to a lead on foot so it pulls up within footDismount', () => {
  const profile = UNIT_PROFILES.tactical_team;
  const cruise = 30;
  assert.equal(approachSpeed(profile, { distance: 60, leadOnFoot: false }, cruise), cruise, 'a lead in a car: full chase');
  assert.equal(approachSpeed(UNIT_PROFILES.patrol_car, { distance: 35, leadOnFoot: true }, cruise), cruise);
  const at = (distance) => approachSpeed(profile, { distance, leadOnFoot: true }, cruise);
  assert.ok(at(100) === cruise && at(60) < cruise && at(40) < at(60) && at(30) <= 6);
  // Braking at ~7 m/s2 from the speed it has when it crosses footDismount stops it well inside it.
  const v = at(profile.footDismount);
  assert.ok((v * v) / (2 * 7) < 10, `stops in ${((v * v) / 14).toFixed(1)} m`);
});
