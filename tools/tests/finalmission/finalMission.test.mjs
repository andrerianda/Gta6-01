// Mission 17, POINT OF NO RETURN: the state machine, the suspicion meter, the checkpoint flags.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FINAL_STAGES, FINAL_STAGE_ORDER, FINAL_CHECKPOINTS, FINAL_FAIL_REASONS } from '../../../game/src/story/final/finalMissionStages.js';
import { createFinalMissionMachine, retryChoices, dataForStage, freshFinalData } from '../../../game/src/story/final/finalMissionMachine.js';
import { createSuspicionMeter, suspicionLevel, SUSPICION_RULES as R } from '../../../game/src/story/final/suspicionMeter.js';
import { SERGEANT_CHOICES, FINAL_ARC_LINES } from '../../../game/src/catalog/finalArcScript.js';
import { flagsAtCheckpoint, gateApproach, FINAL_PLACES, STORY_FLAGS } from '../../../game/src/story/final/finalCheckpoints.js';
import { WORLD_FLAGS, WORLD_FLAG_NAMES } from '../../../game/src/core/state/worldFlags.js';

test('the machine walks every stage in order and completes', () => {
  const machine = createFinalMissionMachine();
  assert.equal(machine.arc, 'idle');
  assert.equal(machine.start(), 'midnight_call');
  const seen = [machine.stage];
  while (machine.arc === 'running') { const stage = machine.next(); if (stage) seen.push(stage); }
  assert.deepEqual(seen, FINAL_STAGE_ORDER);
  assert.equal(machine.arc, 'completed');
  assert.equal(machine.stage, null);
  assert.equal(machine.next(), null);
  assert.equal(machine.active, false);
});

test('checkpoints 1 to 5 sit on the right stages', () => {
  assert.deepEqual(FINAL_CHECKPOINTS, { 1: 'gate', 2: 'takeoff_window', 3: 'blind_radar', 4: 'stealth_test', 5: 'dawn_approach' });
  const machine = createFinalMissionMachine();
  machine.start();
  const at = {};
  while (machine.arc === 'running') { at[machine.stage] = machine.checkpoint; machine.next(); }
  assert.equal(at.midnight_call, 0);
  assert.equal(at.insider_call, 0);
  assert.equal(at.gate, 1);
  assert.equal(at.boarding, 1);
  assert.equal(at.takeoff_window, 2);
  assert.equal(at.interception, 3);
  assert.equal(at.time_skip, 4);
  assert.equal(at.epilogue, 5);
  for (let checkpoint = 1; checkpoint <= 5; checkpoint += 1) {
    const fresh = createFinalMissionMachine();
    assert.equal(fresh.start({ checkpoint }), FINAL_CHECKPOINTS[checkpoint]);
    assert.equal(fresh.checkpoint, checkpoint);
  }
});

test('the mission label covers the stages from the gate to the epilogue', () => {
  const machine = createFinalMissionMachine();
  machine.start({ stage: 'insider_call' });
  assert.equal(machine.inMission, false);
  machine.next();
  assert.equal(machine.stage, 'gate');
  assert.equal(machine.inMission, true);
  machine.goto('free_roam');
  assert.equal(machine.inMission, false);
});

test('a failure in every play stage retries from its checkpoint or from the start', () => {
  for (const stage of FINAL_STAGES.filter((each) => each.kind === 'play')) {
    const machine = createFinalMissionMachine();
    machine.start({ stage: stage.id, aircraftId: 'garza_negra' });
    assert.equal(machine.fail('crashed'), FINAL_FAIL_REASONS.crashed);
    assert.equal(machine.arc, 'failed');
    assert.equal(machine.next(), null, 'nothing advances while failed');
    const checkpoint = machine.checkpoint;
    assert.equal(machine.retry('checkpoint'), FINAL_CHECKPOINTS[checkpoint], stage.id);
    assert.equal(machine.arc, 'running');
    assert.equal(machine.data.aircraftId, 'garza_negra');
    machine.goto(stage.id);
    machine.fail('exposed');
    assert.equal(machine.retry('start'), 'gate');
    assert.equal(machine.checkpoint, 1);
  }
});

test('fail needs a running stage; an unknown reason reads as a blown cover', () => {
  const machine = createFinalMissionMachine();
  assert.equal(machine.fail('crashed'), null);
  assert.equal(machine.retry(), null);
  machine.start({ checkpoint: 1 });
  assert.equal(machine.fail('no_such_reason'), FINAL_FAIL_REASONS.exposed);
  assert.equal(machine.failReason, 'exposed');
});

test('what a retry may change: both on restart, the mode at checkpoint 2, nothing later', () => {
  assert.deepEqual(retryChoices('start', 1), { aircraft: true, mode: true });
  assert.deepEqual(retryChoices('checkpoint', 2), { aircraft: false, mode: true });
  assert.deepEqual(retryChoices('checkpoint', 3), { aircraft: false, mode: false });
  const machine = createFinalMissionMachine();
  machine.start({ checkpoint: 2 });
  assert.deepEqual([machine.data.aircraftId, machine.data.flightMode], ['manta_sombra', 'casual']);
  machine.fail('window_closed');
  machine.retry('checkpoint', { aircraftId: 'garza_negra', flightMode: 'realistic' });
  assert.deepEqual([machine.data.aircraftId, machine.data.flightMode], ['manta_sombra', 'realistic']);
  machine.goto('interception');
  machine.fail('caught');
  machine.retry('checkpoint', { aircraftId: 'garza_negra', flightMode: 'casual' });
  assert.equal(machine.stage, 'blind_radar');
  assert.deepEqual([machine.data.aircraftId, machine.data.flightMode], ['manta_sombra', 'realistic']);
  machine.fail('shot_down');
  machine.retry('start', { aircraftId: 'garza_negra', flightMode: 'casual' });
  assert.deepEqual([machine.stage, machine.data.aircraftId, machine.data.flightMode], ['gate', 'garza_negra', 'casual']);
  machine.fail('exposed');
  machine.retry('start', { aircraftId: 'a_real_aircraft' });
  assert.equal(machine.data.aircraftId, 'garza_negra', 'an unknown aircraft is not taken');
});

test('data kept and cleared by where the mission is rebuilt', () => {
  const played = { ...freshFinalData(), suspicion: 44, sergeantAnswer: 'joke', takeoffGrade: 'gold', landingGrade: 'silver', alarm: true, betrayed: true };
  const atGate = dataForStage(played, 'gate');
  assert.deepEqual([atGate.suspicion, atGate.sergeantAnswer, atGate.takeoffGrade, atGate.alarm, atGate.betrayed], [0, null, null, false, false]);
  const atTakeoff = dataForStage(played, 'takeoff_window');
  assert.deepEqual([atTakeoff.suspicion, atTakeoff.sergeantAnswer, atTakeoff.takeoffGrade, atTakeoff.alarm], [44, 'joke', null, false]);
  const atRadar = dataForStage(played, 'blind_radar');
  assert.deepEqual([atRadar.takeoffGrade, atRadar.landingGrade, atRadar.alarm, atRadar.betrayed], ['gold', null, true, false]);
  assert.equal(dataForStage(played, 'epilogue').betrayed, true);
  assert.equal(dataForStage(played, 'free_roam').alarm, false);
});

test('serialise and restore: a round trip, a mid-mission save resumes at its checkpoint', () => {
  const machine = createFinalMissionMachine();
  assert.deepEqual(machine.serialise().arc, 'idle');
  machine.start({ stage: 'interception', aircraftId: 'garza_negra', flightMode: 'realistic' });
  machine.data.takeoffGrade = 'silver';
  const saved = JSON.parse(JSON.stringify(machine.serialise()));
  assert.deepEqual(Object.keys(saved), ['arc', 'stage', 'checkpoint', 'aircraftId', 'flightMode', 'data']);
  assert.deepEqual([saved.arc, saved.stage, saved.checkpoint, saved.aircraftId, saved.flightMode], ['running', 'interception', 3, 'garza_negra', 'realistic']);
  const loaded = createFinalMissionMachine();
  loaded.restore(saved);
  assert.equal(loaded.arc, 'running');
  assert.equal(loaded.resumeStage(), 'blind_radar');
  assert.equal(loaded.data.takeoffGrade, 'silver');
  assert.deepEqual(loaded.serialise(), saved);
  // The fail screen is not a state to save: it loads as running at the checkpoint.
  machine.fail('caught');
  assert.equal(machine.serialise().arc, 'running');
  // The prologue resumes at its own stage.
  const prologue = createFinalMissionMachine();
  prologue.start({ stage: 'new_face' });
  const early = createFinalMissionMachine();
  early.restore(prologue.serialise());
  assert.equal(early.resumeStage(), 'new_face');
  // Completed stays completed; rubbish leaves the arc idle.
  const done = createFinalMissionMachine();
  done.restore({ arc: 'completed', stage: null, checkpoint: 5, aircraftId: 'garza_negra', flightMode: 'casual', data: {} });
  assert.equal(done.arc, 'completed');
  assert.equal(done.resumeStage(), null);
  assert.equal(done.goto('gate'), null);
  for (const rubbish of [null, 7, 'x', { arc: 'running', stage: 'no_such_stage' }, { arc: 'weird' }]) {
    const idle = createFinalMissionMachine();
    idle.restore(rubbish);
    assert.equal(idle.arc, 'idle');
    assert.equal(idle.data.aircraftId, 'manta_sombra');
  }
});

test('suspicion levels', () => {
  assert.equal(suspicionLevel(0), 'calm');
  assert.equal(suspicionLevel(29.9), 'calm');
  assert.equal(suspicionLevel(30), 'watched');
  assert.equal(suspicionLevel(59.9), 'watched');
  assert.equal(suspicionLevel(60), 'suspect');
  assert.equal(suspicionLevel(99.9), 'suspect');
  assert.equal(suspicionLevel(100), 'exposed');
});

const walk = { speed: 1.65 };
function after(seconds, lead, meter = createSuspicionMeter()) {
  for (let t = 0; t < seconds; t += 0.1) meter.update(0.1, lead);
  return meter;
}

test('suspicion: each cause raises it, calm walking lowers it', () => {
  assert.equal(after(5, walk).value, 0);
  const running = after(2, { speed: 4.3 });
  assert.ok(Math.abs(running.value - 2 * R.running) < 1 && running.cause === 'running');
  const sprinting = after(2, { speed: 6.9, sprinting: true });
  assert.ok(sprinting.value > running.value && sprinting.cause === 'sprinting');
  const jumping = createSuspicionMeter();
  jumping.update(0.1, { speed: 0, airborne: true });
  jumping.update(0.1, { speed: 0, airborne: true });
  assert.equal(jumping.value, R.jump, 'one jump counts once');
  assert.equal(jumping.cause, 'jumping');
  assert.equal(after(4, { speed: 1.65, offPath: 25 }).value, 0, 'within 25 m of the way is fine');
  const astray = after(4, { speed: 1.65, offPath: 40 });
  assert.ok(astray.value > 20 && astray.cause === 'offPath');
  assert.equal(after(R.lingerSeconds - 0.5, { speed: 0, nearGuard: true }).value, 0);
  const lingering = after(R.lingerSeconds + 4, { speed: 0, nearGuard: true });
  assert.ok(lingering.value > 15 && lingering.cause === 'lingering');
  assert.equal(after(30, { speed: 0 }).value, 0, 'standing away from a guard is nothing');
  const bumped = createSuspicionMeter();
  bumped.bump();
  assert.deepEqual([bumped.value, bumped.cause], [R.bump, 'bump']);
  const cooling = after(4, walk, after(2, { speed: 4.3 }));
  assert.ok(cooling.value < running.value && cooling.value > running.value - 4 * 3, 'falls slowly');
  assert.equal(after(60, walk, bumped).value, 0);
});

test('suspicion: a salute must be returned within 3 s', () => {
  const ignored = createSuspicionMeter();
  ignored.salute();
  assert.equal(ignored.salutePending, true);
  after(2.8, walk, ignored);
  assert.equal(ignored.cause, null);
  after(0.4, walk, ignored);
  assert.equal(ignored.cause, 'salute');
  assert.ok(ignored.value > 10);
  assert.equal(ignored.salutePending, false);
  const polite = createSuspicionMeter({ value: 20 });
  polite.salute();
  after(1, { speed: 0 }, polite);
  assert.equal(polite.returnSalute(), true);
  assert.equal(polite.value, 20 + R.returnedSalute);
  assert.equal(polite.returnSalute(), false, 'nothing left to return');
  after(5, { speed: 0 }, polite);
  assert.equal(polite.value, 20 + R.returnedSalute);
});

test('suspicion: the three answers to the sergeant, and no answer', () => {
  const lines = Object.keys(FINAL_ARC_LINES);
  assert.equal(SERGEANT_CHOICES.length, 3);
  for (const choice of SERGEANT_CHOICES) {
    assert.ok(lines.includes(choice.say) && lines.includes(choice.reply));
    const meter = createSuspicionMeter({ value: 30 });
    assert.equal(meter.sergeant(choice.id), choice.suspicion);
    assert.equal(meter.value, 30 + choice.suspicion);
  }
  const joke = createSuspicionMeter({ value: 30 }); joke.sergeant('joke');
  const snap = createSuspicionMeter({ value: 30 }); snap.sergeant('snap');
  const schedule = createSuspicionMeter({ value: 30 }); schedule.sergeant('schedule');
  assert.ok(schedule.value < 30 && joke.value > 30 && snap.value > joke.value);
  assert.equal(schedule.level, 'calm');
  assert.equal(snap.level, 'suspect');
  const silent = createSuspicionMeter();
  assert.equal(silent.sergeant(null), R.noAnswer);
  assert.equal(silent.value, 20);
  const blown = createSuspicionMeter({ value: 70 });
  blown.sergeant('snap');
  assert.deepEqual([blown.exposed, blown.failReason, blown.level], [true, 'exposed', 'exposed']);
});

test('suspicion: exposure fails, a drawn weapon at once', () => {
  const runner = after(8, { speed: 6.9, sprinting: true });
  assert.deepEqual([runner.value, runner.level, runner.exposed, runner.failReason], [100, 'exposed', true, 'exposed']);
  after(30, walk, runner);
  assert.equal(runner.value, 100, 'a blown cover does not mend');
  const armed = createSuspicionMeter();
  armed.update(0.016, { speed: 1, weaponDrawn: true });
  assert.deepEqual([armed.value, armed.failReason, armed.cause], [100, 'weapon_drawn', 'weapon']);
});

test('checkpoint worlds: flags and the place outside the gate', () => {
  assert.deepEqual(flagsAtCheckpoint(1, 'manta_sombra'), []);
  assert.deepEqual(flagsAtCheckpoint(2, 'garza_negra'), [WORLD_FLAGS.BASE_OFFICER_ACCESS]);
  assert.ok(flagsAtCheckpoint(2, 'manta_sombra').includes(WORLD_FLAGS.GUIDED_BOMB_LOADED));
  for (const flag of [WORLD_FLAGS.BASE_ALARM, WORLD_FLAGS.SEA_OPEN, WORLD_FLAGS.AIR_DEFENCE_OFF]) assert.ok(flagsAtCheckpoint(3, 'garza_negra').includes(flag));
  assert.ok(!flagsAtCheckpoint(3, 'manta_sombra').includes(WORLD_FLAGS.BASE_OFFICER_ACCESS));
  for (const flag of [WORLD_FLAGS.RADAR_TOWER_DESTROYED, WORLD_FLAGS.SEA_OPEN, WORLD_FLAGS.NAVY_PICKET_ACTIVE, WORLD_FLAGS.AIR_DEFENCE_OFF]) assert.ok(flagsAtCheckpoint(4, 'manta_sombra').includes(flag));
  assert.ok(!flagsAtCheckpoint(4, 'manta_sombra').includes(WORLD_FLAGS.GUIDED_BOMB_LOADED));
  assert.ok(flagsAtCheckpoint(5, 'manta_sombra').includes(WORLD_FLAGS.SEA_OPEN) && !flagsAtCheckpoint(5, 'manta_sombra').includes(WORLD_FLAGS.NAVY_PICKET_ACTIVE));
  assert.deepEqual([...STORY_FLAGS].sort(), [...WORLD_FLAG_NAMES].sort(), 'the end clears every flag');
  const spot = gateApproach(60);
  const gate = FINAL_PLACES.gate;
  assert.ok(Math.abs(Math.hypot(spot.x - gate.x, spot.z - gate.z) - 60) < 0.01);
  assert.ok(spot.z > gate.z, 'south of the gate, on the access road');
  assert.ok(Math.abs(spot.heading) < 0.2, 'facing north, to the gate');
});
