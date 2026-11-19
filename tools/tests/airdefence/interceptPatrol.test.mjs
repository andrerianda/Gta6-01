// The Halcón pair: scramble -> intercept -> formate -> order -> warning shots -> fire on a target
// that ignores them; compliance stands them down; no shots while formating on a complying target;
// the autopilot is an easy target and jinking a hard one; the same seed gives the same fight.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeLead, makePatrol, runPatrol, stagesOf, linesOf } from './airGuardTestKit.mjs';
import { AIR_GUARD_TUNING, AIR_GUARD_RADIO_LINES, INTERCEPT_STAGES } from '../../../game/src/flight/defence/airGuardTuning.js';
import { burstHitChance } from '../../../game/src/flight/defence/interceptorGunnery.js';
import { maxSpeedAt } from '../../../game/src/flight/defence/interceptorSteering.js';

const GUIDED = { guidance: true };

/** Rocks the wings (left, right, left...) between two times. */
const rockBetween = (from, to) => (lead, time) => {
  lead.roll = time >= from && time < to ? (Math.floor((time - from) / 1.2) % 2 === 0 ? -0.35 : 0.35) : 0;
};

test('the speed envelope: faster than the Manta Sombra, slower than a Garza Negra at Mach 3, ceiling 17 km', () => {
  const envelope = AIR_GUARD_TUNING.envelope;
  assert.ok(maxSpeedAt(600, envelope) > 0.85 * 340);
  assert.ok(Math.abs(maxSpeedAt(11000, envelope) - 1.8 * 295) < 1);
  assert.ok(maxSpeedAt(17000, envelope) < 2.5 * 295);
  assert.equal(envelope.ceiling, 17000);
});

test('an ignoring target: scramble, intercept, formate, order (three lines), warning shots, fire, hits', () => {
  const patrol = makePatrol(3);
  const lead = makeLead({ x: -2600, z: -1600, y: 600, speed: 230 });
  assert.equal(patrol.scramble('boundary', lead), true);
  assert.equal(patrol.scramble('boundary', lead), false);
  // Within sight of the base: a real take-off from the pads along runway 27.
  assert.equal(patrol.interceptors[0].phase, 'hold');
  const log = runPatrol(patrol, lead, 400, { env: GUIDED, until: (l) => l.hits >= 8 });
  assert.deepEqual(stagesOf(log), ['scramble', 'intercept', 'formate', 'order', 'warningShots', 'fire']);
  const lines = linesOf(log);
  for (const id of ['airGuard.scramble', 'airGuard.contact', 'airGuard.order1', 'airGuard.order2', 'airGuard.order3', 'airGuard.warningShots', 'airGuard.fire']) {
    assert.ok(lines.includes(id), `line ${id}`);
    assert.ok(AIR_GUARD_RADIO_LINES[id], `line ${id} exists`);
  }
  assert.ok(lines.indexOf('airGuard.order1') < lines.indexOf('airGuard.order2') && lines.indexOf('airGuard.order2') < lines.indexOf('airGuard.order3'));
  const time = Object.fromEntries(log.stages.map(([t, stage]) => [stage, t]));
  assert.ok(time.intercept > AIR_GUARD_TUNING.scramble.delaySeconds, 'a scramble delay and a take-off roll');
  assert.ok(Math.abs(time.warningShots - time.order - AIR_GUARD_TUNING.order.patienceSeconds) < 1.5);
  const warning = log.bursts.filter((burst) => burst.kind === 'warning');
  assert.ok(warning.length >= 4 && warning.every((burst) => !burst.hit), 'warning shots never hit');
  assert.ok(warning.every((burst) => burst.time < time.fire + 0.1));
  assert.ok(log.hits >= 8, `hits ${log.hits}`);
  for (const stage of stagesOf(log)) assert.ok(INTERCEPT_STAGES.includes(stage));
});

test('the take-off runs along runway 27 and the pair climbs out', () => {
  const patrol = makePatrol(1);
  const lead = makeLead({ x: -2600, z: -1600, y: 600, speed: 200 });
  patrol.scramble('command', lead);
  const uno = patrol.interceptors[0];
  let rolled = false;
  for (let t = 0; t < 60 && uno.phase !== 'air'; t += 1 / 30) {
    patrol.update(lead, GUIDED, 1 / 30);
    if (uno.phase === 'roll') {
      rolled = true;
      assert.ok(Math.abs(uno.heading - (276 * Math.PI) / 180) < 0.02);
      assert.equal(uno.y, 1.6);
    }
  }
  assert.ok(rolled);
  assert.equal(uno.phase, 'air');
  assert.ok(uno.speed >= AIR_GUARD_TUNING.scramble.rotateSpeed);
});

test('far from the base the pair appears airborne over it after the delay', () => {
  const patrol = makePatrol(1);
  const lead = makeLead({ x: -6200, z: 150, y: 800 });
  patrol.scramble('boundary', lead);
  assert.equal(patrol.interceptors[0].phase, 'wait');
  const log = runPatrol(patrol, lead, AIR_GUARD_TUNING.scramble.delaySeconds + 0.5, { env: GUIDED });
  assert.deepEqual(stagesOf(log), ['scramble', 'intercept']);
  assert.ok(patrol.interceptors[0].y >= AIR_GUARD_TUNING.scramble.airborneHeight);
});

test('in formation Uno sits on the left wing about 25 m out and Dos behind and above', () => {
  const patrol = makePatrol(1);
  const lead = makeLead({ x: -3200, z: -1700, y: 700, speed: 230 });
  patrol.place('wing', lead);
  runPatrol(patrol, lead, 12, { env: GUIDED });
  const [uno, dos] = patrol.interceptors;
  const right = { x: Math.cos(lead.heading), z: Math.sin(lead.heading) };
  const forward = { x: Math.sin(lead.heading), z: -Math.cos(lead.heading) };
  const side = (uno.x - lead.x) * right.x + (uno.z - lead.z) * right.z;
  const along = (uno.x - lead.x) * forward.x + (uno.z - lead.z) * forward.z;
  assert.ok(Math.abs(side + 25) < 3, `Uno ${side.toFixed(1)} m to the side`);
  assert.ok(along < 0 && along > -15, `Uno ${along.toFixed(1)} m along`);
  assert.ok(Math.abs(uno.speed - lead.speed) < 3);
  const dosAlong = (dos.x - lead.x) * forward.x + (dos.z - lead.z) * forward.z;
  assert.ok(dosAlong < -50 && dos.y > lead.y + 10);
  // They match his bank in a turn.
  lead.roll = 0.4;
  lead.turnRate = 0.03;
  runPatrol(patrol, lead, 4, { env: GUIDED });
  assert.ok(Math.abs(uno.bank - 0.4) < 0.05);
  assert.ok(patrol.slotDistance < 12, `slot error ${patrol.slotDistance.toFixed(1)} m in the turn`);
});

test('rocking the wings is compliance: escort, no shots, and a stand-down back inside', () => {
  const patrol = makePatrol(5);
  const lead = makeLead({ x: -3200, z: -1700, y: 700, speed: 110, headingDegrees: 96 });
  patrol.place('wing', lead, 'command');
  const log = runPatrol(patrol, lead, 60, { env: GUIDED, fly: rockBetween(6, 12) });
  assert.deepEqual(stagesOf(log), ['formate', 'order', 'escort', 'returning']);
  assert.equal(log.bursts.length, 0);
  assert.ok(linesOf(log).includes('airGuard.complied') && linesOf(log).includes('airGuard.standDown'));
  assert.deepEqual(log.standDowns, ['complied']);
});

test('turning back towards Marazul outside the boundary is compliance; they escort him in', () => {
  const patrol = makePatrol(5);
  const lead = makeLead({ x: -6300, z: 150, y: 700, speed: 150, headingDegrees: 270 });
  patrol.place('wing', lead, 'boundary');
  // He lets the first two orders pass, then makes a slow 180 degree turn that outlasts their patience.
  const log = runPatrol(patrol, lead, 140, {
    env: GUIDED,
    fly: (plane, time) => { plane.turnRate = time > 14 && time < 14 + Math.PI / 0.07 ? 0.07 : 0; plane.roll = plane.turnRate ? 0.5 : 0; },
    until: (l) => stagesOf(l).includes('returning'),
  });
  assert.deepEqual(stagesOf(log), ['formate', 'order', 'escort', 'returning']);
  assert.equal(log.bursts.length, 0);
});

test('complying and then heading out again brings the last order and the shots', () => {
  const patrol = makePatrol(5);
  const lead = makeLead({ x: -6300, z: 150, y: 700, speed: 200, headingDegrees: 270 });
  patrol.place('wing', lead, 'boundary');
  const log = runPatrol(patrol, lead, 70, { env: GUIDED, fly: rockBetween(4, 9), until: (l) => stagesOf(l).includes('fire') });
  assert.deepEqual(stagesOf(log), ['formate', 'order', 'escort', 'order', 'warningShots', 'fire']);
  assert.equal(linesOf(log).filter((id) => id === 'airGuard.order3').length, 1);
});

test('compliance during the warning shots and under fire stops the shooting', () => {
  const patrol = makePatrol(5);
  const lead = makeLead({ x: -3200, z: -1700, y: 700, speed: 230 });
  patrol.place('shots', lead, 'command');
  const log = runPatrol(patrol, lead, 9, { env: GUIDED, fly: rockBetween(3, 8) });
  assert.deepEqual(stagesOf(log), ['warningShots', 'escort']);
  assert.ok(log.bursts.length >= 1 && log.bursts.every((burst) => burst.kind === 'warning'));
  const count = log.bursts.length;
  runPatrol(patrol, lead, 10, { env: GUIDED, log });
  assert.equal(log.bursts.length, count);
});

test('beyond the weapons-free radius they fire without orders, and hold fire when he turns back', () => {
  const patrol = makePatrol(9);
  const lead = makeLead({ x: -7400, z: 150, y: 700, speed: 230, headingDegrees: 270 });
  patrol.place('wing', lead, 'boundary');
  const log = runPatrol(patrol, lead, 6, { env: { guidance: true, weaponsFree: true } });
  assert.deepEqual(stagesOf(log), ['formate', 'fire']);
  runPatrol(patrol, lead, 60, {
    env: { guidance: true, weaponsFree: true }, log,
    fly: (plane) => { plane.turnRate = plane.heading < 1.5 * Math.PI + Math.PI - 0.05 ? 0.1 : 0; },
    until: (l) => stagesOf(l).includes('escort'),
  });
  assert.equal(stagesOf(log).at(-1), 'escort');
  assert.ok(linesOf(log).includes('airGuard.ceaseFire'));
});

test('the alert flag makes them relentless: wing rocking does not help', () => {
  const patrol = makePatrol(5);
  const lead = makeLead({ x: -3200, z: -1700, y: 700, speed: 230 });
  patrol.place('wing', lead, 'alert');
  const log = runPatrol(patrol, lead, 60, { env: { guidance: true, relentless: true }, fly: rockBetween(6, 14), until: (l) => stagesOf(l).includes('fire') });
  assert.deepEqual(stagesOf(log), ['formate', 'order', 'warningShots', 'fire']);
});

test('gunnery: the autopilot is an easy target, jinking and speed are not, range and aspect matter', () => {
  const gunnery = AIR_GUARD_TUNING.gunnery;
  const shooter = { x: 0, y: 600, z: 240, heading: 0 };
  const steady = burstHitChance(shooter, { x: 0, y: 600, z: 0, speed: 230 }, 0, gunnery);
  const autopilot = burstHitChance(shooter, { x: 0, y: 600, z: 0, speed: 230, autopilot: true }, 0, gunnery);
  const jinking = burstHitChance(shooter, { x: 0, y: 600, z: 0, speed: 230 }, 1, gunnery);
  const fast = burstHitChance(shooter, { x: 0, y: 600, z: 0, speed: 700 }, 0, gunnery);
  const far = burstHitChance(shooter, { x: 0, y: 600, z: -700, speed: 230 }, 0, gunnery);
  assert.ok(autopilot > steady && steady > fast && steady > far && far > 0);
  assert.ok(jinking < steady * 0.2);
  assert.equal(burstHitChance(shooter, { x: 0, y: 600, z: -1000, speed: 230 }, 0, gunnery), 0);
  assert.equal(burstHitChance(shooter, { x: 300, y: 600, z: 200, speed: 230 }, 0, gunnery), 0);
  assert.ok(autopilot <= gunnery.maxChance);
});

test('a jinking pilot takes fewer hits than the autopilot over the same time', () => {
  const fight = (script, autopilot) => {
    const patrol = makePatrol(11);
    const lead = makeLead({ x: -3200, z: -1700, y: 700, speed: 230, autopilot });
    patrol.place('shots', lead, 'alert');
    return runPatrol(patrol, lead, 70, { env: { guidance: true, relentless: true }, fly: script }).hits;
  };
  const steady = fight(null, true);
  const jinking = fight((plane, time) => { plane.turnRate = Math.sin(time * 1.1) > 0 ? 0.2 : -0.2; plane.roll = plane.turnRate > 0 ? 1 : -1; }, false);
  assert.ok(steady >= 12, `autopilot hits ${steady}`);
  assert.ok(jinking < steady * 0.5, `jinking hits ${jinking} against ${steady}`);
});

test('the same seed gives the same fight; another seed another', () => {
  const fight = (seed) => {
    const patrol = makePatrol(seed);
    const lead = makeLead({ x: -3200, z: -1700, y: 700, speed: 230 });
    patrol.place('shots', lead, 'alert');
    const log = runPatrol(patrol, lead, 60, { env: { guidance: true, relentless: true } });
    return log.bursts.map((burst) => (burst.hit ? '1' : '0')).join('');
  };
  assert.equal(fight(21), fight(21));
  assert.notEqual(fight(21), fight(22));
});

test('stand down and reset: the pair goes home and ends parked on the alert pads', () => {
  const patrol = makePatrol(5);
  const lead = makeLead({ x: -3200, z: -1700, y: 700, speed: 230 });
  patrol.place('wing', lead, 'command');
  runPatrol(patrol, lead, 3, { env: GUIDED });
  patrol.standDown('command');
  assert.equal(patrol.stage, 'returning');
  const log = runPatrol(patrol, lead, 240, { env: GUIDED, until: () => patrol.stage === 'idle' });
  assert.equal(patrol.stage, 'idle');
  assert.equal(log.bursts.length, 0);
  assert.equal(patrol.interceptors[0].phase, 'parked');
  patrol.place('wing', lead, 'command');
  patrol.reset();
  assert.equal(patrol.stage, 'idle');
  assert.equal(patrol.events.length, 0);
});
