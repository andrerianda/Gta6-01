// The pure rules of the restricted area of Punta Garza: the ring and its height band, the gate
// challenge with its countdown and hysteresis, the officer switch, the star table, salutes,
// suspicion, the posts and the catalog entries they lean on.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PUNTA_GARZA_AIR_BASE as PLAN, puntaGarzaToWorld as toWorld } from '../../../game/src/catalog/puntaGarzaAirBase.js';
import { CRIME_CATALOG } from '../../../game/src/catalog/crimeCatalog.js';
import { PEDESTRIAN_ARCHETYPES } from '../../../game/src/catalog/pedestrianArchetypes.js';
import { pickAppearance, uniformBaseFor } from '../../../game/src/pedestrians/crowdSpawning.js';
import { dressForDistrict } from '../../../game/src/pedestrians/districtWardrobe.js';
import { chooseReaction } from '../../../game/src/pedestrians/pedestrianReactions.js';
import { UNIT_PROFILES, modelForUnit } from '../../../game/src/police/policeUnitKinds.js';
import { GESTURES } from '../../../game/src/characters/motion/everydayPose.js';
import { createRestrictedZone, insideHeightBand, pointInRing, yawOfCompass } from '../../../game/src/police/restricted/restrictedZone.js';
import { GATE_CHALLENGE, createGateChallenge, hasOfficerAccess, stepGateChallenge } from '../../../game/src/police/restricted/gateChallenge.js';
import { TRESPASS_STARS, baseAlarmOn, createTrespassRecord, responseUnitsFor, trespassStars } from '../../../game/src/police/restricted/trespassEscalation.js';
import { SALUTE, SUSPICION, createSaluteRecord, createSuspicion, maySalute, saluteEnds, seesPoint, standBeside, startSalute, stepSuspicion } from '../../../game/src/police/restricted/saluteRules.js';
import { POST_ARCHETYPES, garrisonManned, gateGuardSpot, nextCrewPhase, standsOf, worldPostsOf } from '../../../game/src/police/restricted/basePosts.js';
import { restrictedAreaStageSpot } from '../../../game/src/police/restricted/restrictedAreaStages.js';

const zone = createRestrictedZone(PLAN, toWorld);
const gateInput = (over) => ({ inside: false, ringDistance: 40, gateDistance: 100, challengeRadius: 26, access: false, offence: false, present: true, wanted: 0, ...over });
const run = (s, input, seconds, dt = 0.1) => { const lines = []; for (let t = 0; t < seconds - 1e-9; t += dt) { stepGateChallenge(s, input, dt); if (s.line) lines.push(s.line); } return lines; };

test('the ring holds the apron and the runway, not the gate road outside or the aerodrome', () => {
  const apron = toWorld(-1450, 1220), runway = toWorld(-1900, 1385), road = toWorld(-1500, 800), strip = toWorld(-600, 1220);
  assert.equal(zone.contains(apron.x, apron.z), true);
  assert.equal(zone.contains(runway.x, runway.z), true);
  assert.equal(zone.contains(road.x, road.z), false);
  assert.equal(zone.contains(strip.x, strip.z), false);
  assert.equal(pointInRing([{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }], 2, 2), true);
  assert.ok(zone.distanceOutside(road.x, road.z) > 25 && zone.distanceOutside(road.x, road.z) < 40);
  assert.equal(zone.distanceOutside(apron.x, apron.z), 0);
});

test('the height band: on the ground, in the water and a low pass are inside, a high crossing is not', () => {
  const apron = toWorld(-1450, 1220);
  assert.equal(zone.containsAt(apron.x, apron.z, 0), true);
  assert.equal(zone.containsAt(apron.x, apron.z, -2), true);
  assert.equal(zone.containsAt(apron.x, apron.z, 120), true);
  assert.equal(zone.containsAt(apron.x, apron.z, 151), false);
  assert.equal(insideHeightBand(400), false);
});

test('the gate faces south and its guards stand within the challenge radius', () => {
  assert.ok(zone.gate.outZ > 0.98, 'the gate looks out to +Z (south)');
  assert.ok(Math.abs(zone.gate.x - -1405) < 6 && Math.abs(zone.gate.z - -987) < 6);
  assert.ok(Math.abs(yawOfCompass(90) + Math.PI / 2) < 1e-9);
});

test('the challenge: two warnings, then trespass after about eight seconds', () => {
  const s = createGateChallenge();
  assert.deepEqual(run(s, gateInput({ gateDistance: 20 }), 3.9), ['first']);
  assert.equal(s.state, 'challenged');
  assert.deepEqual(run(s, gateInput({ gateDistance: 20 }), 3.9), ['last']);
  assert.equal(s.state, 'challenged');
  run(s, gateInput({ gateDistance: 20 }), 0.5);
  assert.equal(s.state, 'trespassing');
  assert.equal(s.reason, 'ignored_warning');
});

test('walking away in time returns to outside with no penalty; the edge has hysteresis; the countdown recovers slowly', () => {
  const s = createGateChallenge();
  run(s, gateInput({ gateDistance: 20 }), 3);
  run(s, gateInput({ gateDistance: 28 }), 0.5);
  assert.equal(s.state, 'challenged', 'two metres past the radius is still the challenge');
  run(s, gateInput({ gateDistance: 26 + GATE_CHALLENGE.hysteresis + 1 }), 0.2);
  assert.equal(s.state, 'outside');
  assert.equal(s.trespassed, false);
  assert.ok(s.countdown < 5, 'stepping out does not buy a fresh countdown');
  run(s, gateInput({ gateDistance: 60 }), 30);
  assert.equal(s.countdown, GATE_CHALLENGE.seconds);
  assert.deepEqual(run(s, gateInput({ gateDistance: 20 }), 1), ['first']);
});

test('entering the ring by any way is trespass at once; leaving well clear ends it', () => {
  const s = createGateChallenge();
  stepGateChallenge(s, gateInput({ inside: true, ringDistance: 0, gateDistance: 300 }), 0.1);
  assert.equal(s.state, 'trespassing');
  assert.equal(s.reason, 'entered');
  stepGateChallenge(s, gateInput({ ringDistance: 10, gateDistance: 300 }), 0.1);
  assert.equal(s.state, 'trespassing', 'just over the fence is not away');
  stepGateChallenge(s, gateInput({ ringDistance: 45, gateDistance: 300, wanted: 2 }), 0.1);
  assert.equal(s.state, 'outside');
  assert.equal(s.trespassed, true, 'the guards remember while he is wanted');
  stepGateChallenge(s, gateInput({ ringDistance: 900, gateDistance: 900, present: false, wanted: 0 }), 0.1);
  assert.equal(s.trespassed, false);
});

test('a weapon drawn at the gate during the challenge is trespass at once', () => {
  const s = createGateChallenge();
  run(s, gateInput({ gateDistance: 20 }), 1);
  stepGateChallenge(s, gateInput({ gateDistance: 20, offence: true }), 0.1);
  assert.equal(s.state, 'trespassing');
  assert.equal(s.reason, 'weapon_at_gate');
});

test('the officer switch: cleared inside, no challenge at the gate, revoked by an offence for this visit', () => {
  const s = createGateChallenge();
  assert.deepEqual(run(s, gateInput({ gateDistance: 10, access: true }), 12), []);
  assert.equal(s.state, 'outside');
  stepGateChallenge(s, gateInput({ inside: true, ringDistance: 0, access: true }), 0.1);
  assert.equal(s.state, 'cleared');
  assert.equal(hasOfficerAccess(true, s), true);
  stepGateChallenge(s, gateInput({ inside: true, ringDistance: 0, access: true, offence: true }), 0.1);
  assert.equal(s.state, 'trespassing');
  assert.equal(s.reason, 'clearance_revoked');
  assert.equal(hasOfficerAccess(true, s), false);
  stepGateChallenge(s, gateInput({ inside: true, ringDistance: 0, access: true }), 0.1);
  assert.equal(s.state, 'trespassing', 'putting the weapon away does not bring the clearance back');
  stepGateChallenge(s, gateInput({ ringDistance: 900, gateDistance: 900, present: false, access: true }), 0.1);
  stepGateChallenge(s, gateInput({ inside: true, ringDistance: 0, access: true }), 0.1);
  assert.equal(s.state, 'cleared', 'a new visit is a new clearance');
  assert.equal(hasOfficerAccess(false, createGateChallenge()), false);
});

test('the star table: two at once, three and four with time or at once for what he does', () => {
  const r = createTrespassRecord();
  assert.equal(trespassStars(r), 2);
  r.seconds = 19; assert.equal(trespassStars(r), 2);
  r.seconds = 21; assert.equal(trespassStars(r), 3);
  r.seconds = 46; assert.equal(trespassStars(r), 4);
  assert.equal(trespassStars({ ...createTrespassRecord(), weaponDrawn: true }), 3);
  assert.equal(trespassStars({ ...createTrespassRecord(), touchedAircraft: true }), 3);
  assert.equal(trespassStars({ ...createTrespassRecord(), hurtSomeone: true }), 4);
  assert.equal(trespassStars({ ...createTrespassRecord(), boardedAircraft: true }), 4);
  assert.equal(CRIME_CATALOG[TRESPASS_STARS.crimeId].minStars, TRESPASS_STARS.entered);
  assert.equal(CRIME_CATALOG.military_trespass.needsWitness, false);
  assert.equal(baseAlarmOn('trespassing', 2), true);
  assert.equal(baseAlarmOn('trespassing', 0), false);
  assert.equal(baseAlarmOn('outside', 3), false);
  assert.deepEqual(responseUnitsFor(2), []);
  assert.deepEqual(responseUnitsFor(4), ['air_guard_team', 'tactical_team']);
  assert.equal(modelForUnit('air_guard_team', (id) => id === 'patrol_jeep'), 'patrol_jeep');
  assert.equal(modelForUnit('air_guard_team', (id) => id === 'suv'), 'suv');
  assert.ok(UNIT_PROFILES.air_guard_team.tacticalCrew);
});

test('a salute: seen within twelve metres, once, then a cooldown; never without access or from behind', () => {
  const person = { x: 0, z: 0, yaw: 0, busy: false };
  const r = createSaluteRecord();
  assert.equal(seesPoint(0, 0, 0, 0, -5), true);
  assert.equal(seesPoint(0, 0, 0, 0, 5), false);
  assert.equal(maySalute(r, person, { x: 0, z: -13 }, true, 0), false);
  assert.equal(maySalute(r, person, { x: 0, z: 8 }, true, 0), false, 'behind him');
  assert.equal(maySalute(r, person, { x: 2, z: -8 }, false, 0), false);
  assert.equal(maySalute(r, { ...person, busy: true }, { x: 2, z: -8 }, true, 0), false);
  assert.equal(maySalute(r, person, { x: 2, z: -8 }, true, 0), true);
  startSalute(r, person, { x: 2, z: -8 }, 0);
  assert.equal(maySalute(r, person, { x: 2, z: -8 }, true, 1), false);
  assert.equal(saluteEnds(r, 'guard', person, { x: 2, z: -6 }, true, 1), false);
  assert.equal(saluteEnds(r, 'guard', person, { x: 2, z: -4 }, true, SALUTE.holdSeconds + 0.1), true);
  assert.equal(maySalute(r, person, { x: 2, z: -4 }, true, 10), false, 'cooldown');
  assert.equal(maySalute(r, person, { x: 2, z: -4 }, true, SALUTE.holdSeconds + SALUTE.cooldownSeconds + 1), true);
});

test('the duty officer holds the salute until the lead has passed', () => {
  const person = { x: 0, z: 0, yaw: 0, busy: false };
  const r = createSaluteRecord();
  startSalute(r, person, { x: 0, z: -9 }, 0);
  assert.equal(saluteEnds(r, 'officer', person, { x: 1, z: -3 }, true, 6), false, 'still coming');
  assert.equal(saluteEnds(r, 'officer', person, { x: 1, z: 0.5 }, true, 9), false, 'beside him');
  assert.equal(saluteEnds(r, 'officer', person, { x: 1, z: 3 }, true, 11), true, 'past him');
  startSalute(r, person, { x: 0, z: -9 }, 100);
  assert.equal(saluteEnds(r, 'officer', person, { x: 0, z: -9 }, true, 100 + SALUTE.officerMaxSeconds + 1), true, 'not for ever');
});

test('suspicion rises for running, bumping and lingering by the wrong stand, and falls when he behaves', () => {
  const s = createSuspicion();
  const calm = { cleared: true, speed: 1.4, bumps: 0, standId: null, expectedStandId: 'stand_manta' };
  for (let i = 0; i < 50; i += 1) stepSuspicion(s, { ...calm, speed: 6 }, 0.1);
  const ran = s.value;
  assert.ok(ran > 0.3 && ran < 0.6 && s.cause === 'running');
  stepSuspicion(s, { ...calm, bumps: 1 }, 0.1);
  assert.ok(Math.abs(s.value - ran - SUSPICION.bump) < 1e-9);
  const before = s.value;
  for (let i = 0; i < 50; i += 1) stepSuspicion(s, { ...calm, standId: 'stand_manta' }, 0.1);
  assert.ok(s.value < before, 'the stand he was sent to is fine');
  const low = s.value;
  for (let i = 0; i < 120; i += 1) stepSuspicion(s, { ...calm, standId: 'stand_garza' }, 0.1);
  assert.ok(s.value > low && s.cause === 'lingering');
  for (let i = 0; i < 2000; i += 1) stepSuspicion(s, { ...calm, speed: 9 }, 0.1);
  assert.equal(s.value, 1);
  const held = stepSuspicion(s, { ...calm, cleared: false, speed: 9 }, 5);
  assert.equal(held, 1, 'only the cleared lead is watched');
  const stands = standsOf(PLAN, toWorld);
  assert.equal(standBeside(stands, stands[1].x + 5, stands[1].z - 5), 'stand_garza');
  assert.equal(standBeside(stands, stands[1].x + 30, stands[1].z), null);
});

test('the posts: twelve people in three roles on the pad, crew loops to the nearest stand', () => {
  const posts = worldPostsOf(PLAN, toWorld);
  assert.equal(posts.length, 12);
  assert.equal(posts.filter((p) => p.role === 'guard').length, 6);
  assert.equal(posts.filter((p) => p.role === 'groundCrew').length, 5);
  assert.equal(posts.filter((p) => p.atGate).length, 2);
  for (const p of posts) {
    assert.ok(PEDESTRIAN_ARCHETYPES[p.archetypeId], p.archetypeId);
    if (p.role === 'groundCrew') {
      const walk = Math.hypot(p.workX - p.x, p.workZ - p.z);
      assert.ok(p.standId && walk > 3 && walk < 60, `${p.id} walks ${walk.toFixed(1)} m`);
      assert.equal(zone.contains(p.workX, p.workZ), true);
    }
    if (!p.atGate) assert.equal(zone.contains(p.x, p.z), true, p.id);
  }
  assert.equal(posts.find((p) => p.id === 'crew_manta_1').standId, 'stand_manta');
  assert.equal(POST_ARCHETYPES.officer, 'base_officer');
  const gatePost = posts.find((p) => p.id === 'gate_guard_1'), out = { x: 0, z: 0 };
  gateGuardSpot(gatePost, zone.gate, true, out);
  assert.ok(Math.hypot(out.x - zone.gate.x, out.z - zone.gate.z) > Math.hypot(gatePost.x - zone.gate.x, gatePost.z - zone.gate.z) + 1.5, 'aside is further from the road');
  assert.equal(garrisonManned(false, 330), false);
  assert.equal(garrisonManned(false, 300), true);
  assert.equal(garrisonManned(true, 370), true);
  assert.equal(garrisonManned(true, 400), false);
});

test('the crew round goes idle, over, inspect, back', () => {
  const half = () => 0.5;
  assert.equal(nextCrewPhase('idle', true, 3, half), null);
  assert.equal(nextCrewPhase('idle', true, 0, half).phase, 'toWork');
  assert.equal(nextCrewPhase('toWork', false, 30, half), null);
  assert.equal(nextCrewPhase('toWork', true, 30, half).phase, 'inspect');
  assert.equal(nextCrewPhase('inspect', true, 0, half).phase, 'toPost');
  assert.equal(nextCrewPhase('toPost', true, 30, half).phase, 'idle');
});

test('the uniformed archetypes: fixed colours on named bases, sentries who never flee, salute and halt poses', () => {
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const looks = {};
  for (const id of ['base_guard', 'base_ground_crew', 'base_officer', 'norvast_soldier']) {
    const a = PEDESTRIAN_ARCHETYPES[id];
    assert.ok(a && a.uniformKit && a.bodies, id);
    const look = pickAppearance(a.appearance, Math.random);
    const again = dressForDistrict(a, pickAppearance(a.appearance, Math.random), 'x', 'centro', Math.random);
    assert.deepEqual([again.paints.paint_jacket, again.paints.paint_top, again.paints.paint_bottom], [look.paints.paint_jacket, look.paints.paint_top, look.paints.paint_bottom], `${id} always wears the uniform`);
    looks[id] = look.paints;
    assert.equal(uniformBaseFor(a, look.sex, () => true), a.bodies[look.sex][0]);
    assert.equal(uniformBaseFor(a, look.sex, () => false), null);
  }
  assert.equal(uniformBaseFor(PEDESTRIAN_ARCHETYPES.office_worker, 'male', () => true), null);
  // Olive grey against slate blue: the guard's fatigues are greener than blue, the Norvast's bluer.
  const [gr, gg, gb] = hex(looks.base_guard.paint_top), [nr, ng, nb] = hex(looks.norvast_soldier.paint_top);
  assert.ok(gg > gb + 15 && nb > nr + 30 && nb > ng, `${gr},${gg},${gb} vs ${nr},${ng},${nb}`);
  for (const id of ['base_guard', 'base_officer', 'norvast_soldier']) {
    const a = PEDESTRIAN_ARCHETYPES[id];
    assert.equal(a.sentry, true);
    assert.equal(a.armedChance, 1);
    for (const stimulus of ['gunfire', 'aimed_at', 'fight_nearby', 'explosion', 'bumped']) {
      for (let i = 0; i < 20; i += 1) {
        const reaction = chooseReaction(a, stimulus, Math.random, { armed: true, distance: 5 });
        assert.ok(reaction === 'fight' || reaction === 'ignore', `${id} ${stimulus}: ${reaction}`);
      }
    }
  }
  assert.equal(PEDESTRIAN_ARCHETYPES.base_ground_crew.sentry, false);
  assert.ok(GESTURES.includes('salute') && GESTURES.includes('halt'));
});

test('the stages put the lead outside the gate, on the apron and on the gate road', () => {
  const gate = restrictedAreaStageSpot('gate', PLAN);
  assert.ok(Math.abs(zone.distanceToGate(gate.x, gate.z) - 12) < 0.01 && !zone.contains(gate.x, gate.z));
  // He faces the gate: forward (-sin yaw, -cos yaw) points from him to it.
  const fx = -Math.sin(gate.heading), fz = -Math.cos(gate.heading);
  assert.ok(fx * (zone.gate.x - gate.x) + fz * (zone.gate.z - gate.z) > 11.9);
  const trespass = restrictedAreaStageSpot('trespass', PLAN), officer = restrictedAreaStageSpot('officer', PLAN);
  assert.ok(zone.contains(trespass.x, trespass.z) && !trespass.access);
  assert.ok(zone.contains(officer.x, officer.z) && officer.access);
  assert.equal(restrictedAreaStageSpot('island', PLAN), null);
});
