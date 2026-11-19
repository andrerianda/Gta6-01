// The pure logic of the final mission's flying stages (game/src/story/final/flight/).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TAKEOFF_WINDOW, alongAndOffset, createTakeoffWindow, gradeTakeoff, isLinedUp,
} from '../../../game/src/story/final/flight/takeoffWindow.js';
import { createLandingTracker, gradeLanding, stripPosition } from '../../../game/src/story/final/flight/landingGrading.js';
import { PICKET_RULES, beyondPicketLine, createPicketTest } from '../../../game/src/story/final/flight/picketTest.js';
import { createClimbGate, createInterceptionTracker } from '../../../game/src/story/final/flight/escapeTracker.js';
import { createStageClock } from '../../../game/src/story/final/flight/stageSupport.js';

const RUNWAY = { x0: -1023.8, z0: -1500.2, x1: -1998.4, z1: -1602.7, width: 45 };
const HEADING = (276 * Math.PI) / 180;
const STRIP = { x0: -8813.63, z0: -3196.47, x1: -9682.96, z1: -3429.41, width: 40, length: 900, heading: 285 };
const SHIPS = [{ x: -5650, z: -700 }, { x: -5950, z: -2350 }, { x: -5500, z: -4000 }];
const CENTRE = { x: 0, z: 150 };

const onRunway = (along, offset = 0) => {
  const ux = (RUNWAY.x1 - RUNWAY.x0) / 980;
  const uz = (RUNWAY.z1 - RUNWAY.z0) / 980;
  return { x: RUNWAY.x0 + ux * along - uz * offset, z: RUNWAY.z0 + uz * along + ux * offset };
};
const sampleAt = (place, more = {}) => ({ ...place, heading: HEADING, speed: 0, height: 0, onGround: true, pitch: 0, verticalSpeed: 0, crashed: false, ...more });
const run = (window, sample, seconds, step = 0.25) => {
  const seen = [];
  for (let t = 0; t < seconds; t += step) seen.push(...window.update(sample, step));
  return seen;
};

test('runway geometry: heading 276, along and offset from the two ends', () => {
  const place = alongAndOffset(RUNWAY, ...Object.values(onRunway(300, 7)));
  assert.ok(Math.abs(place.along - 300) < 0.5 && Math.abs(place.offset - 7) < 0.5);
  assert.ok(Math.abs((place.heading * 180) / Math.PI - 276) < 0.5);
  assert.equal(isLinedUp(RUNWAY, sampleAt(onRunway(40))), true);
  assert.equal(isLinedUp(RUNWAY, sampleAt(onRunway(40), { heading: HEADING + 0.4 })), false);
  assert.equal(isLinedUp(RUNWAY, sampleAt(onRunway(40, 30))), false);
  assert.equal(isLinedUp(RUNWAY, sampleAt({ x: -1469, z: -1376 })), false);
});

test('takeoff window: the tower prompts at their times while the player dawdles, then closes', () => {
  const window = createTakeoffWindow({ runway: RUNWAY, rotateSpeed: 52 });
  const stand = sampleAt({ x: -1469, z: -1376 }, { heading: 0.1 });
  assert.deepEqual(run(window, stand, 12), ['tw_01', 'tw_02', 'tw_03']);
  assert.deepEqual(run(window, stand, 80), ['tw_04']);
  assert.ok(Math.abs(window.left - 88) < 0.01);
  assert.deepEqual(run(window, stand, 50), ['tw_05']);
  assert.deepEqual(run(window, stand, 40), ['timeout']);
  assert.equal(window.outcome, 'timeout');
  assert.deepEqual(run(window, stand, 5), []);
});

test('takeoff window: line-up, clearance, roll calls, success and its grade', () => {
  const window = createTakeoffWindow({ runway: RUNWAY, rotateSpeed: 52 });
  run(window, sampleAt({ x: -1469, z: -1376 }, { heading: 0.1 }), 30);
  assert.deepEqual(run(window, sampleAt(onRunway(40)), 6), ['lined_up', 'tw_06', 'tw_07']);
  assert.equal(window.linedUp, true);
  // Lined up early: the suspicious prompts never come.
  const seen = [];
  for (let speed = 0, along = 40; speed < 56; speed += 1, along += 10) seen.push(...window.update(sampleAt(onRunway(along, 2), { speed }), 0.25));
  assert.deepEqual(seen, ['tw_08']);
  seen.length = 0;
  for (let height = 0, pitch = 0; height <= 34; height += 2, pitch = Math.min(0.17, pitch + 0.012)) {
    seen.push(...window.update(sampleAt(onRunway(700), { speed: 56, height, pitch, onGround: height < 1, verticalSpeed: 6 }), 0.25));
  }
  assert.deepEqual(seen, ['tw_09', 'success']);
  assert.equal(window.grade, 'gold');
  assert.ok(window.run.centreline > 1.9 && window.run.centreline < 2.1);
});

test('takeoff window: airborne just in time counts, a crash fails', () => {
  const late = createTakeoffWindow({ runway: RUNWAY, rotateSpeed: 52, seconds: 20 });
  run(late, sampleAt(onRunway(40)), 12);
  run(late, sampleAt(onRunway(400), { speed: 55 }), 7);
  // Wheels off at 12 m as the clock hits zero: not a timeout.
  const climbing = sampleAt(onRunway(800), { speed: 60, height: 12, onGround: false, verticalSpeed: 5, pitch: 0.15 });
  assert.ok(!run(late, climbing, 3).includes('timeout'));
  assert.equal(late.left, 0);
  assert.ok(run(late, { ...climbing, height: 31 }, 0.5).includes('success'));
  const sinking = createTakeoffWindow({ runway: RUNWAY, rotateSpeed: 52, seconds: 5 });
  run(sinking, sampleAt(onRunway(800), { speed: 60, height: 8, onGround: false }), 6);
  assert.deepEqual(run(sinking, sampleAt(onRunway(900), { speed: 50 }), 0.5), ['timeout']);
  const crash = createTakeoffWindow({ runway: RUNWAY, rotateSpeed: 52 });
  assert.ok(run(crash, sampleAt(onRunway(40), { crashed: true }), 0.25).includes('crashed'));
});

test('takeoff grading', () => {
  assert.equal(gradeTakeoff({ centreline: 3, rotateError: 4, pitchRate: 6 }), 'gold');
  assert.equal(gradeTakeoff({ centreline: 7, rotateError: -10, pitchRate: 12 }), 'silver');
  assert.equal(gradeTakeoff({ centreline: 3, rotateError: 4, pitchRate: 25 }), 'bronze');
  assert.equal(gradeTakeoff({ centreline: 15, rotateError: 0, pitchRate: 5 }), 'bronze');
  assert.equal(TAKEOFF_WINDOW.seconds, 180);
});

const onStrip = (along, offset = 0) => {
  const ux = (STRIP.x1 - STRIP.x0) / 900;
  const uz = (STRIP.z1 - STRIP.z0) / 900;
  return { x: STRIP.x0 + ux * along - uz * offset, z: STRIP.z0 + uz * along + ux * offset };
};
const flight = (place, more = {}) => ({ ...place, onGround: false, verticalSpeed: -1.5, speed: 64, groundSpeed: 64, crashed: false, impact: 0, ...more });

test('strip geometry from the two thresholds', () => {
  const mid = stripPosition(STRIP, ...Object.values(onStrip(450, -6)));
  assert.ok(mid.onStrip && Math.abs(mid.along - 450) < 0.5 && Math.abs(mid.offset + 6) < 0.5);
  assert.ok(Math.abs((mid.heading * 180) / Math.PI - 285) < 0.5);
  assert.equal(stripPosition(STRIP, ...Object.values(onStrip(450, 30))).onStrip, false);
  const short = stripPosition(STRIP, ...Object.values(onStrip(-40)));
  assert.ok(short.short && !short.onStrip);
  const end = stripPosition(STRIP, ...Object.values(onStrip(930)));
  assert.ok(end.offTheEnd && !end.onStrip);
});

test('landing grading and the tracker outcomes', () => {
  assert.equal(gradeLanding({ sink: 1.2, speed: 64, approachSpeed: 62, offset: 2 }), 'gold');
  assert.equal(gradeLanding({ sink: 2.6, speed: 75, approachSpeed: 62, offset: 6 }), 'silver');
  assert.equal(gradeLanding({ sink: 4.2, speed: 64, approachSpeed: 62, offset: 2 }), 'bronze');
  const aircraft = { approachSpeed: 62, touchdownLimit: 5 };

  const good = createLandingTracker(STRIP, aircraft);
  assert.equal(good.update(flight(onStrip(-100))), null);
  assert.equal(good.update(flight(onStrip(120, 3), { onGround: true })), null);
  assert.equal(good.update(flight(onStrip(400, 3), { onGround: true, groundSpeed: 30 })), null);
  const landed = good.update(flight(onStrip(600, 3), { onGround: true, groundSpeed: 2 }));
  assert.equal(landed.result, 'landed');
  assert.equal(landed.grade, 'gold');
  assert.ok(Math.abs(landed.touch.sink - 1.5) < 1e-9 && Math.abs(landed.touch.offset - 3) < 0.5);

  const hard = createLandingTracker(STRIP, aircraft);
  hard.update(flight(onStrip(-50), { verticalSpeed: -7 }));
  assert.equal(hard.update(flight(onStrip(60), { onGround: true })).result, 'bad_landing');

  const shortOf = createLandingTracker(STRIP, aircraft);
  shortOf.update(flight(onStrip(-80)));
  assert.equal(shortOf.update(flight(onStrip(-30), { onGround: true })).result, 'off_strip');

  const long = createLandingTracker(STRIP, aircraft);
  long.update(flight(onStrip(500)));
  long.update(flight(onStrip(700), { onGround: true, groundSpeed: 60 }));
  const ranOff = long.update(flight(onStrip(905), { onGround: true, groundSpeed: 30 }));
  assert.equal(ranOff.result, 'off_strip');
  assert.equal(ranOff.ranOff, true);

  const wreck = createLandingTracker(STRIP, aircraft);
  assert.equal(wreck.update(flight(onStrip(100), { crashed: true })).result, 'bad_landing');
});

test('picket line: which side is beyond', () => {
  assert.ok(beyondPicketLine(SHIPS, CENTRE, -4300, -1900) < -1000);
  assert.ok(beyondPicketLine(SHIPS, CENTRE, -6700, -1500) > 900);
});

test('picket test, stealth: painted is fine; tracked gives hail, lock, missile', () => {
  const quiet = createPicketTest({ mode: 'stealth', ships: SHIPS, centre: CENTRE });
  const seen = [];
  for (let x = -4300; x > -7000; x -= 40) seen.push(...quiet.update({ tracked: false, lockSeconds: 0, x, z: -1525, mach: 0.5 }, 0.25));
  assert.deepEqual(seen, ['passed']);

  const caught = createPicketTest({ mode: 'stealth', ships: SHIPS, centre: CENTRE });
  const events = [];
  const at = [];
  for (let t = 0; t < 30 && !caught.outcome; t += 0.25) {
    for (const event of caught.update({ tracked: true, lockSeconds: t, x: -5000, z: -1525, mach: 0.4 }, 0.25)) { events.push(event); at.push(t); }
  }
  assert.deepEqual(events, ['hail', 'lock', 'missile']);
  assert.ok(Math.abs(at[0] - 6) < 0.5 && Math.abs(at[1] - 10) < 0.5 && Math.abs(at[2] - at[1] - 5) < 0.5);

  const escaped = createPicketTest({ mode: 'stealth', ships: SHIPS, centre: CENTRE });
  const got = [];
  for (let t = 0; t < 11; t += 0.25) got.push(...escaped.update({ tracked: true, lockSeconds: t, x: -5000, z: -1525, mach: 0.4 }, 0.25));
  for (let t = 0; t < 8; t += 0.25) got.push(...escaped.update({ tracked: false, lockSeconds: 0, x: -5000, z: -1525, mach: 0.4 }, 0.25));
  assert.deepEqual(got, ['hail', 'lock', 'lock_broken']);
  assert.equal(escaped.outcome, null);
});

test('picket test, speed gate: fast is through, slow is locked', () => {
  const mach = (value, speed) => {
    const gate = createPicketTest({ mode: 'speed', ships: SHIPS, centre: CENTRE });
    const seen = [];
    for (let x = -3000; x > -7500 && !gate.outcome; x -= speed * 0.25) seen.push(...gate.update({ tracked: false, lockSeconds: 0, x, z: -1525, mach: value }, 0.25));
    return seen;
  };
  assert.deepEqual(mach(1.4, 470), ['passed']);
  assert.deepEqual(mach(0.6, 200), ['hail', 'lock', 'missile']);
  assert.ok(PICKET_RULES.speed.gateMach > 1);
});

test('interception outcome tracker', () => {
  const make = () => createInterceptionTracker({ centre: CENTRE });
  const feed = (tracker, sample, seconds) => { let out = null; for (let t = 0; t < seconds && !out; t += 0.5) out = tracker.update(sample, 0.5); return out; };
  const near = { x: -3000, z: -1500 };

  const lost = make();
  assert.equal(feed(lost, { ...near, stage: 'idle' }, 10), null);
  assert.equal(feed(lost, { ...near, stage: 'order' }, 10), null);
  assert.equal(feed(lost, { ...near, stage: 'searching' }, 5), null);
  assert.equal(feed(lost, { ...near, stage: 'intercept' }, 1), null);
  assert.equal(feed(lost, { ...near, stage: 'searching' }, 5.5), null);
  assert.equal(feed(lost, { ...near, stage: 'searching' }, 1), 'lost');

  assert.equal(feed(make(), { x: -6900, z: 150, stage: 'fire' }, 1), null);
  assert.equal(feed(make(), { x: -7001, z: 150, stage: 'fire' }, 1), 'border');
  assert.equal(feed(make(), { ...near, stage: 'fire', shotDown: true, crashed: true }, 1), 'shot_down');
  assert.equal(feed(make(), { ...near, stage: 'fire', crashed: true }, 1), 'crashed');
  const back = make();
  assert.equal(feed(back, { ...near, stage: 'escort' }, 20), null);
  assert.equal(feed(back, { ...near, stage: 'escort' }, 1), 'turned_back');
});

test('Garza climb gate and the stage clock', () => {
  const gate = createClimbGate({ startHeight: 600, gateHeight: 5200 });
  assert.equal(gate.update(600), false);
  assert.equal(gate.remaining, 4600);
  gate.update(2900);
  assert.ok(Math.abs(gate.progress - 0.5) < 1e-9);
  assert.equal(gate.update(5200), true);
  assert.equal(gate.update(100), true);
  const clock = createStageClock();
  const fired = [];
  clock.at(2, () => fired.push('a'));
  clock.update(1.9);
  assert.deepEqual(fired, []);
  clock.update(0.2);
  assert.deepEqual(fired, ['a']);
});
