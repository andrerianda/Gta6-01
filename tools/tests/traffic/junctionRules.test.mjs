// The junction rules: the two-phase signals cycle green, yellow, all red with never two phases
// open at once; drivers hold at red, decide at yellow by their room to stop, and stand at stop
// signs before pulling out; left turns wait for a close oncoming car.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SIGNAL_LIGHT, STOP_SIGN_WAIT, activeSignalPhase, mustHoldAtLine, mustYieldLeftTurn, signalLightAt, speedToStopAt,
} from '../../../game/src/traffic/junctionRules.js';
import { testPlan } from './trafficTestWorld.mjs';

const signal = { phases: [{ green: 24, yellow: 3 }, { green: 12, yellow: 3 }], allRed: 2, cycle: 46, offset: 0 };

test('a signal cycles green, yellow and all red for each phase in turn', () => {
  assert.equal(signalLightAt(signal, 0, 0), SIGNAL_LIGHT.GREEN);
  assert.equal(signalLightAt(signal, 1, 0), SIGNAL_LIGHT.RED);
  assert.equal(signalLightAt(signal, 0, 25), SIGNAL_LIGHT.YELLOW);
  assert.equal(signalLightAt(signal, 0, 28), SIGNAL_LIGHT.RED);
  assert.equal(signalLightAt(signal, 1, 28), SIGNAL_LIGHT.RED, 'all red between the phases');
  assert.equal(signalLightAt(signal, 1, 30), SIGNAL_LIGHT.GREEN);
  assert.equal(signalLightAt(signal, 1, 42), SIGNAL_LIGHT.YELLOW);
  assert.equal(signalLightAt(signal, 0, 46), SIGNAL_LIGHT.GREEN, 'the cycle repeats');
  assert.equal(signalLightAt(null, -1, 10), SIGNAL_LIGHT.GREEN, 'no signal is always green');
  assert.equal(activeSignalPhase(signal, 44.5), -1);
  assert.equal(activeSignalPhase(signal, 31), 1);
});

test('no two phases of any signal in the city are open at once', () => {
  const plan = testPlan();
  const signals = plan.roads.nodes.filter((node) => node.control === 'signals');
  assert.ok(signals.length > 20);
  for (const node of signals) {
    for (let t = 0; t < node.signal.cycle; t += 0.5) {
      const open = node.signal.phases.filter((_, phase) => signalLightAt(node.signal, phase, t) !== SIGNAL_LIGHT.RED).length;
      assert.ok(open <= 1, `node ${node.id} at ${t}s has ${open} open phases`);
    }
  }
});

test('every lane that ends at a signal knows its phase', () => {
  const plan = testPlan();
  for (const lane of plan.lanes) {
    if (lane.control !== 'signals') continue;
    const node = plan.roads.nodes[lane.signalNode];
    assert.equal(node.id, lane.signalNode);
    assert.ok(lane.phase >= 0 && lane.phase < node.signal.phases.length, `lane ${lane.id}`);
  }
});

test('drivers hold at red, go on green, and stop at yellow only with room', () => {
  const lane = { control: 'signals', phase: 0, mustStop: false };
  assert.equal(mustHoldAtLine(lane, signal, 5, 30, 12, 0), false, 'green');
  assert.equal(mustHoldAtLine(lane, signal, 35, 30, 12, 0), true, 'red');
  assert.equal(mustHoldAtLine(lane, signal, 25, 60, 12, 0), true, 'yellow far away: stop');
  assert.equal(mustHoldAtLine(lane, signal, 25, 4, 14, 0), false, 'yellow too close to stop: go through');
});

test('a stop sign holds until the car has stood still for a moment', () => {
  const lane = { control: 'stop', phase: -1, mustStop: true };
  assert.equal(mustHoldAtLine(lane, null, 0, 2, 0, 0), true);
  assert.equal(mustHoldAtLine(lane, null, 0, 2, 0, STOP_SIGN_WAIT + 0.1), false);
  assert.equal(mustHoldAtLine({ control: 'stop', mustStop: false }, null, 0, 2, 10, 0), false, 'the main road runs through');
});

test('the speed to stop at a line falls to zero at the line', () => {
  assert.equal(speedToStopAt(1), 0);
  assert.ok(speedToStopAt(20) > 8 && speedToStopAt(20) < 11);
});

test('a left turn waits for a close oncoming car and goes in a gap', () => {
  assert.equal(mustYieldLeftTurn(20, 12), true);
  assert.equal(mustYieldLeftTurn(80, 12), false);
  assert.equal(mustYieldLeftTurn(50, 4), false, 'slow and far enough');
  assert.equal(mustYieldLeftTurn(Infinity, 0), false);
});
