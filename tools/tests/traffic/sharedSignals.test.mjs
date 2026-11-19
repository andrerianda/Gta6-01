// The traffic's stop-line rule and the city's shared signal clock agree, and the rings of physics,
// distant and parked cars are ordered so cars change places without gaps or doubles.
import assert from 'node:assert/strict';
import test from 'node:test';

import { mustHoldAtLine, signalLightAt } from '../../../game/src/traffic/junctionRules.js';
import { DISTANT_RING, SPAWN_RING } from '../../../game/src/traffic/trafficSpawning.js';
import { createSignalClock } from '../../../game/src/world/streets/signalClock.js';

const signal = { phases: [{ green: 18, yellow: 3 }, { green: 14, yellow: 3 }], allRed: 2, cycle: 42, offset: 7 };

test('traffic lights agree with the shared signal clock over whole cycles', () => {
  let seconds = 0;
  const clock = createSignalClock([{ signal }], () => seconds);
  for (seconds = -50; seconds < 130; seconds += 0.25) {
    for (const phase of [0, 1]) assert.equal(clock.signalLight(0, phase), signalLightAt(signal, phase, seconds), `t=${seconds} phase=${phase}`);
  }
});

test('the light shown by the clock decides at the line', () => {
  const lane = { control: 'signals', phase: 0, signalNode: 0 };
  assert.equal(mustHoldAtLine(lane, signal, 1, 20, 10, 0, 'red'), true);
  assert.equal(mustHoldAtLine(lane, signal, 1, 20, 10, 0, 'green'), false);
});

test('physics, distant and parked rings are ordered', () => {
  assert.ok(DISTANT_RING.promote < SPAWN_RING.far, 'promotion happens inside the physics spawn ring');
  assert.ok(SPAWN_RING.far < DISTANT_RING.spawn, 'distant cars appear beyond the physics ring');
  assert.ok(DISTANT_RING.spawn < DISTANT_RING.demote, 'physics cars leave beyond the distant spawn edge');
});
