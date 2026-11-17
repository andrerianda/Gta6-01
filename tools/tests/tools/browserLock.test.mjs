// The browser lock lets one holder in at a time and frees itself on release. The tests use a lock
// file of their own, so they never wait for (or block) a real browser run.
// Run with: node --test "tools/tests/tools/*.test.mjs"
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { acquireBrowserLock, BROWSER_LOCK_PATH } from '../../browser-lock.mjs';

let directory;
let path;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'marazul-browser-lock-'));
  path = join(directory, 'nested', 'test.lock');
});

after(async () => {
  await rm(directory, { recursive: true, force: true });
});

test('the shared lock file is the one every agent was told about', () => {
  assert.equal(BROWSER_LOCK_PATH, '/tmp/marazul/browser.lock');
});

test('a second holder waits until the first releases', async () => {
  const first = await acquireBrowserLock({ path, timeoutMs: 5000 });
  assert.equal(first.mode, 'held');

  await assert.rejects(acquireBrowserLock({ path, timeoutMs: 1000 }), /stayed busy/);

  let secondHasIt = false;
  const second = acquireBrowserLock({ path, timeoutMs: 10000 }).then((lock) => {
    secondHasIt = true;
    return lock;
  });
  await new Promise((resolveDelay) => {
    setTimeout(resolveDelay, 300);
  });
  assert.equal(secondHasIt, false, 'the lock is exclusive while the first holder has it');

  await first.release();
  const lock = await second;
  assert.equal(lock.mode, 'held');
  assert.ok(lock.waitedMs >= 250, `the second holder waited (${lock.waitedMs} ms)`);
  await lock.release();
});

test('release can be called twice and the lock is free afterwards', async () => {
  const lock = await acquireBrowserLock({ path, timeoutMs: 5000 });
  await lock.release();
  await lock.release();
  const again = await acquireBrowserLock({ path, timeoutMs: 2000 });
  assert.equal(again.mode, 'held');
  await again.release();
});
