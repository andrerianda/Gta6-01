// The frame-budget job queue, the sector streamer and the background work tracker.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBackgroundWorkTracker } from '../../../game/src/core/jobs/backgroundWorkTracker.js';
import { createFrameBudgetJobQueue, JOB_PRIORITY } from '../../../game/src/core/jobs/frameBudgetJobQueue.js';
import { createSectorStreamer } from '../../../game/src/core/jobs/sectorStreamer.js';

/** A clock that only moves when a slice says it worked. */
function fakeClock() {
  let time = 0;
  return { now: () => time, spend: (milliseconds) => { time += milliseconds; } };
}

test('jobs run by priority, then in the order they were added', () => {
  const queue = createFrameBudgetJobQueue({ now: () => 0 });
  const ran = [];
  queue.add(() => ran.push('normal 1'));
  queue.add(() => ran.push('low'), { priority: JOB_PRIORITY.LOW });
  queue.add(() => ran.push('high'), { priority: JOB_PRIORITY.HIGH });
  queue.add(() => ran.push('normal 2'));
  queue.add(() => ran.push('critical'), { priority: JOB_PRIORITY.CRITICAL });
  assert.equal(queue.pendingCount, 5);
  queue.drain();
  assert.deepEqual(ran, ['critical', 'high', 'normal 1', 'normal 2', 'low']);
  assert.equal(queue.pendingCount, 0);
});

test('a generator job is sliced and run() stops when the budget is spent', async () => {
  const clock = fakeClock();
  const queue = createFrameBudgetJobQueue({ now: clock.now });
  let built = 0;
  const job = queue.add(function* buildSector() {
    for (let lot = 0; lot < 10; lot += 1) {
      built += 1;
      clock.spend(1.5);
      yield;
    }
    return 'sector mesh';
  }, { label: 'sector 4,7', owner: 'openWorldCity' });
  assert.equal(job.state, 'waiting');

  assert.equal(queue.run(4), 3, 'three slices of 1.5 ms pass a 4 ms budget');
  assert.equal(built, 3);
  assert.equal(job.state, 'running');
  assert.deepEqual(queue.pendingLabels(), ['sector 4,7']);
  queue.run(4);
  queue.run(4);
  queue.run(4);
  assert.equal(built, 10);
  assert.equal(job.state, 'done');
  assert.equal(await job.done, 'sector mesh');
  assert.equal(queue.run(4), 0, 'nothing left');
});

test('run() always makes progress, even with no budget', () => {
  const clock = fakeClock();
  const queue = createFrameBudgetJobQueue({ now: clock.now });
  let ran = 0;
  queue.add(() => { ran += 1; clock.spend(50); });
  queue.add(() => { ran += 1; });
  queue.run(0);
  assert.equal(ran, 1);
});

test('a higher priority job added later overtakes a running generator', () => {
  const queue = createFrameBudgetJobQueue({ now: () => 0 });
  const ran = [];
  queue.add(function* slow() {
    ran.push('slow 1');
    yield;
    ran.push('slow 2');
  }, { priority: JOB_PRIORITY.LOW });
  queue.run(-1);
  queue.add(() => ran.push('urgent'), { priority: JOB_PRIORITY.CRITICAL });
  queue.drain();
  assert.deepEqual(ran, ['slow 1', 'urgent', 'slow 2']);
});

test('cancelling: a waiting job never runs, a running generator is closed, owners cancel in bulk', async () => {
  const queue = createFrameBudgetJobQueue({ now: () => 0 });
  let ran = false;
  let cleanedUp = false;
  const waiting = queue.add(() => { ran = true; });
  const running = queue.add(function* work() {
    try {
      yield;
      yield;
    } finally {
      cleanedUp = true;
    }
  }, { priority: JOB_PRIORITY.HIGH, owner: 'city' });
  queue.add(() => {}, { owner: 'city' });
  queue.add(() => {}, { owner: 'city' });
  queue.run(-1);
  waiting.cancel();
  assert.equal(queue.cancelOwnedBy('city'), 3);
  assert.ok(cleanedUp);
  assert.equal(queue.pendingCount, 0);
  queue.drain();
  assert.equal(ran, false);
  assert.equal(waiting.state, 'cancelled');
  assert.equal(running.state, 'cancelled');
  assert.equal(await waiting.done, undefined);
  waiting.cancel();
});

test('a failing job is reported, rejects its promise and does not stop the queue', async () => {
  const failures = [];
  const queue = createFrameBudgetJobQueue({ now: () => 0, onJobError: (failure) => failures.push(failure) });
  let after = false;
  const bad = queue.add(() => { throw new Error('bad geometry'); }, { label: 'facade', owner: 'city' });
  queue.add(() => { after = true; });
  queue.drain();
  assert.ok(after);
  assert.equal(bad.state, 'failed');
  assert.deepEqual(failures.map((failure) => [failure.label, failure.owner, failure.error.message]), [['facade', 'city', 'bad geometry']]);
  await assert.rejects(bad.done, /bad geometry/);
});

function recordingStreamer(options = {}) {
  const log = [];
  const streamer = createSectorStreamer({
    sectorSize: 100,
    activeRadius: 155,
    releaseMargin: 50,
    activate: (sector) => {
      log.push(`+${sector.x},${sector.z}`);
      return { mesh: `mesh ${sector.x},${sector.z}` };
    },
    deactivate: (sector) => {
      assert.deepEqual(sector.data, { mesh: `mesh ${sector.x},${sector.z}` });
      log.push(`-${sector.x},${sector.z}`);
    },
    ...options,
  });
  return { streamer, log };
}

test('the streamer activates every sector within the radius, nearest first', () => {
  const { streamer, log } = recordingStreamer();
  const result = streamer.update(50, 50);
  // Focus in the middle of sector 0,0: sectors whose square is within 155 m.
  assert.equal(log[0], '+0,0');
  assert.equal(result.activated, streamer.active.size);
  assert.ok(streamer.isActive(1, 0) && streamer.isActive(-1, -1) && streamer.isActive(2, 0));
  assert.ok(!streamer.isActive(2, 2), 'the far corner is more than 150 m away');
  assert.ok(!streamer.isActive(2, 1), '158 m away');
  assert.ok(!streamer.isActive(3, 0));
  assert.equal(streamer.active.size, 13);
  const sector = streamer.sectorAt(120, -30);
  assert.deepEqual([sector.x, sector.z, sector.minX, sector.minZ, sector.size, sector.centreX], [1, -1, 100, -100, 100, 150]);
  assert.equal(streamer.sectorAt(5000, 0), null);
  assert.deepEqual(streamer.update(50, 50), { activated: 0, deactivated: 0 }, 'a second update changes nothing');
});

test('hysteresis: a sector is kept until the focus is beyond the release margin', () => {
  const { streamer, log } = recordingStreamer();
  streamer.update(50, 50);
  log.length = 0;
  // Sector -2,0 spans x -200..-100: its distance from x = 50 is 150 (active).
  assert.ok(streamer.isActive(-2, 0));
  streamer.update(90, 50);
  assert.ok(streamer.isActive(-2, 0), '190 m away: inside the 205 m release distance');
  streamer.update(110, 50);
  assert.ok(!streamer.isActive(-2, 0), '210 m away: released');
  assert.ok(log.includes('--2,0'));
  streamer.update(90, 50);
  assert.ok(!streamer.isActive(-2, 0), '190 m away again: not rebuilt until within 155 m');
  streamer.update(50, 50);
  assert.ok(streamer.isActive(-2, 0));
});

test('a limit spreads a big jump over several updates; clear releases everything', () => {
  const { streamer, log } = recordingStreamer({ maxActivationsPerUpdate: 4 });
  assert.deepEqual(streamer.update(50, 50), { activated: 4, deactivated: 0 });
  assert.equal(streamer.waitingCount, 9);
  assert.equal(log[0], '+0,0');
  let updates = 1;
  while (streamer.waitingCount > 0) {
    streamer.update(50, 50);
    updates += 1;
  }
  assert.equal(updates, 4);
  assert.equal(streamer.active.size, 13);
  streamer.clear();
  assert.equal(streamer.active.size, 0);
  assert.equal(log.filter((entry) => entry.startsWith('-')).length, 13);
});

test('the work tracker counts reported work and polled sources, and waits for idle', async () => {
  let clock = 0;
  const tracker = createBackgroundWorkTracker({ wait: async (milliseconds) => { clock += milliseconds; } });
  assert.ok(tracker.isIdle);
  const finishSector = tracker.begin('city sector 1,2');
  let release;
  const load = tracker.track(new Promise((resolve) => { release = resolve; }), 'vehicle models');
  let queued = 3;
  tracker.addSource('jobs', () => queued);
  assert.equal(tracker.pendingCount, 5);
  assert.deepEqual(tracker.describe(), ['city sector 1,2', 'vehicle models', 'jobs: 3']);

  let pumps = 0;
  const idle = await tracker.whenIdle({
    now: () => clock,
    pump: () => {
      pumps += 1;
      if (pumps === 2) finishSector();
      if (pumps === 3) release('done');
      if (pumps >= 4) queued = Math.max(0, queued - 1);
    },
  });
  assert.equal(idle, true);
  assert.equal(await load, 'done');
  assert.ok(pumps >= 7, `pumped ${pumps} times`);
  finishSector();
  assert.equal(tracker.pendingCount, 0);

  tracker.begin('stuck');
  assert.equal(await tracker.whenIdle({ now: () => clock, timeoutMilliseconds: 100 }), false);
});
