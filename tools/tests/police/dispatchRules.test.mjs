// The dispatcher's pure rules: which unit goes next, model fallbacks, pursuit steering on and off
// the lanes, and the arrest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUSTED_RULES, WANTED_LEVELS, WANTED_RULES } from '../../../game/src/catalog/wantedLevels.js';
import { FALLBACK_POLICE_MODEL, colourForUnit, modelForUnit, nextUnitToSend } from '../../../game/src/police/policeUnitKinds.js';
import {
  PURSUIT_MODE, angleTo, choosePursuitMode, createPursuitState, drivePursuit, joinLane, laneWaypoint,
} from '../../../game/src/police/pursuitDriving.js';
import { arrestFine, canArrest, stepArrest } from '../../../game/src/police/arrestRules.js';

const always = () => true;

test('one star brings an officer and a car; quotas hold', () => {
  const first = nextUnitToSend(WANTED_LEVELS[1], {}, always);
  assert.equal(first, 'beat_officer');
  assert.equal(nextUnitToSend(WANTED_LEVELS[1], { beat_officer: 1 }, always), 'patrol_car');
  assert.equal(nextUnitToSend(WANTED_LEVELS[1], { beat_officer: 1, patrol_car: 1 }, always), null);
  assert.equal(nextUnitToSend(WANTED_LEVELS[1], {}, (kind) => kind !== 'beat_officer'), 'patrol_car', 'in a car no officer on foot');
  assert.equal(nextUnitToSend(WANTED_LEVELS[0], {}, always), null);
  const three = nextUnitToSend(WANTED_LEVELS[3], { patrol_car: 3 }, (kind) => kind === 'patrol_car' || kind === 'pursuit_suv');
  assert.equal(three, 'pursuit_suv');
});

test('units without a registered model fall back to the cruiser; aircraft wait', () => {
  const only = (id) => id === 'police_cruiser';
  assert.equal(modelForUnit('patrol_car', only), 'police_cruiser');
  assert.equal(modelForUnit('pursuit_suv', only), FALLBACK_POLICE_MODEL);
  assert.equal(modelForUnit('tactical_team', (id) => id === 'swat_van'), 'swat_van');
  assert.equal(modelForUnit('air_support', only), null);
  assert.equal(modelForUnit('beat_officer', only), null);
});

test('the pursuit SUV wears the civilian SUV in unmarked navy until its own model exists', () => {
  const loaded = (id) => id === 'police_cruiser' || id === 'suv' || id === 'swat_van';
  assert.equal(modelForUnit('pursuit_suv', loaded), 'suv');
  assert.equal(colourForUnit('pursuit_suv', 'suv'), '#16213A');
  assert.equal(modelForUnit('pursuit_suv', (id) => id === 'police_suv' || loaded(id)), 'police_suv');
  assert.equal(colourForUnit('pursuit_suv', 'police_suv'), null);
  assert.equal(colourForUnit('patrol_car', 'police_cruiser'), null);
  const four = nextUnitToSend(WANTED_LEVELS[4], { pursuit_suv: 3, patrol_car: 2 }, (kind) => kind !== 'air_support' && kind !== 'harbor_boat' && kind !== 'beat_officer');
  assert.equal(four, 'tactical_team', 'four stars bring the SWAT van');
  assert.equal(modelForUnit(four, loaded), 'swat_van');
});

test('angles: a point to the left is positive', () => {
  assert.ok(Math.abs(angleTo(0, 0, 0, 0, -10)) < 1e-9, 'straight ahead (-Z)');
  assert.ok(angleTo(0, 0, 0, -10, -10) > 0, 'west of north is left');
  assert.ok(angleTo(0, 0, 0, 10, -10) < 0);
});

test('pursuit modes by distance and the lead\'s speed', () => {
  const pursuit = createPursuitState(1);
  pursuit.lane = 0;
  const car = { x: 0, z: 0, yaw: 0, speed: 20 };
  choosePursuitMode(pursuit, car, { x: 0, z: -200, vx: 0, vz: -20, speed: 20, yaw: 0 }, false);
  assert.equal(pursuit.mode, PURSUIT_MODE.LANES);
  choosePursuitMode(pursuit, car, { x: 0, z: -40, vx: 0, vz: -20, speed: 20, yaw: 0 }, false);
  assert.equal(pursuit.mode, PURSUIT_MODE.CHASE);
  assert.ok(pursuit.targetZ < -40, 'aims where the lead will be');
  choosePursuitMode(pursuit, car, { x: 0, z: -10, vx: 0, vz: -20, speed: 20, yaw: 0 }, false);
  assert.equal(pursuit.mode, PURSUIT_MODE.RAM);
  choosePursuitMode(pursuit, car, { x: 0, z: -10, vx: 0, vz: 0, speed: 0, yaw: 0 }, false);
  assert.equal(pursuit.mode, PURSUIT_MODE.BOX);
  choosePursuitMode(pursuit, car, { x: 0, z: -10, vx: 0, vz: 0, speed: 0, yaw: 0 }, true);
  assert.equal(pursuit.mode, PURSUIT_MODE.LEAVE);
});

test('driving: steers towards the target, brakes to box in, reverses when stuck', () => {
  const controls = { throttle: 0, brake: 0, steer: 0, handbrake: 0, reverse: false, horn: false };
  const pursuit = createPursuitState(1);
  pursuit.mode = PURSUIT_MODE.CHASE;
  pursuit.targetX = -20;
  pursuit.targetZ = -40;
  drivePursuit(controls, pursuit, { x: 0, z: 0, yaw: 0, speed: 10 }, 30, 1 / 60);
  assert.ok(controls.steer < 0, 'target on the left: steer left');
  assert.ok(controls.throttle > 0.5);
  pursuit.mode = PURSUIT_MODE.BOX;
  pursuit.targetX = 0;
  pursuit.targetZ = -2;
  drivePursuit(controls, pursuit, { x: 0, z: 0, yaw: 0, speed: 15 }, 30, 1 / 60);
  assert.ok(controls.brake > 0 && controls.throttle === 0, 'arriving beside the lead it brakes');
  pursuit.mode = PURSUIT_MODE.CHASE;
  pursuit.targetZ = -50;
  for (let i = 0; i < 120; i += 1) drivePursuit(controls, pursuit, { x: 0, z: 0, yaw: 0, speed: 0 }, 30, 1 / 60);
  assert.equal(controls.reverse, true, 'stuck for over a second: reverse out');
});

test('lane following walks the points and picks the successor nearest the goal', () => {
  const lanes = [
    { id: 0, points: [0, 0, 0, -10, 0, -20], successors: [{ lane: 1, turn: 'left' }, { lane: 2, turn: 'right' }] },
    { id: 1, points: [-5, -25, -30, -25], successors: [] },
    { id: 2, points: [5, -25, 30, -25], successors: [] },
  ];
  const pursuit = createPursuitState();
  joinLane(pursuit, lanes, 0, 0, -1);
  const out = { x: 0, z: 0 };
  assert.ok(laneWaypoint(pursuit, lanes, 0, -1, 100, -25, out));
  assert.equal(out.z, -10);
  laneWaypoint(pursuit, lanes, 0, -19, 100, -25, out);
  assert.equal(pursuit.lane, 2, 'turns right towards a goal in the east');
});

test('arrests at one or two stars only, close and slow, after the hold', () => {
  const close = { level: 1, officerDistance: 1.5, leadSpeed: 0.2, inVehicle: false };
  assert.equal(canArrest(close, BUSTED_RULES, WANTED_RULES), true);
  assert.equal(canArrest({ ...close, level: 3 }, BUSTED_RULES, WANTED_RULES), false);
  assert.equal(canArrest({ ...close, leadSpeed: 3 }, BUSTED_RULES, WANTED_RULES), false);
  assert.equal(canArrest({ ...close, officerDistance: 3.5, inVehicle: true, leadSpeed: 1 }, BUSTED_RULES, WANTED_RULES), true);
  let held = 0;
  for (let i = 0; i < 130; i += 1) held = stepArrest(held, 1 / 60, close, BUSTED_RULES, WANTED_RULES);
  assert.ok(held >= BUSTED_RULES.holdSeconds);
  assert.equal(stepArrest(held, 1 / 60, { ...close, leadSpeed: 4 }, BUSTED_RULES, WANTED_RULES), 0, 'running breaks the hold');
  assert.equal(arrestFine(0, BUSTED_RULES), 100);
  assert.equal(arrestFine(20000, BUSTED_RULES), 2000);
  assert.equal(arrestFine(1e7, BUSTED_RULES), 5000);
});
