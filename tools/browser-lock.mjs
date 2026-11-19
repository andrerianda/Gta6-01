// The machine-wide browser lock of the MARAZUL tools. Headless Chromium renders WebGL in software
// here and a dozen agents share four cores, so only one browser may run at a time: whoever opens
// one first holds an exclusive flock(2) on /tmp/marazul/browser.lock, and everyone else waits.
//
//   const lock = await acquireBrowserLock();
//   try { /* launch the browser, take the pictures */ } finally { await lock.release(); }
//
// The lock is the kernel's, taken through the flock(1) program, so it pairs with a shell script
// that runs `flock /tmp/marazul/browser.lock node my-script.mjs`, and it is released by the
// kernel even when the process that holds it is killed.
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Waits for the exclusive browser lock and holds it until release() is called or this process
 * ends, whichever comes first.
 * @param {object} [options]
 * @param {number} [options.timeoutMs] How long to wait for the lock (default 30 minutes).
 * @param {string} [options.path] The lock file (default /tmp/marazul/browser.lock).
 * @returns {Promise<{ path: string, waitedMs: number, mode: 'held' | 'inherited' | 'unavailable',
 *   release: () => Promise<void> }>} `mode` is 'inherited' when this process was itself started
 *   under `flock` on the same file (the lock is then already ours), and 'unavailable' when the
 *   machine has no flock program (the caller runs unprotected).
 */
export async function acquireBrowserLock({ timeoutMs = DEFAULT_LOCK_TIMEOUT_MS, path = BROWSER_LOCK_PATH } = {}) {
  const started = Date.now();
  mkdirSync(dirname(path), { recursive: true });
  if (isLockInherited(path)) {
    return { path, waitedMs: 0, mode: 'inherited', release: async () => {} };
  }

  // flock(1) takes the lock, then runs a shell that says so and sits in `cat` until our end of its
  // standard input closes: when release() ends the pipe, or when this process dies in any way.
  const seconds = Math.max(1, Math.ceil(timeoutMs / 1000));
  const holder = spawn(
    'flock',
    ['--exclusive', '--timeout', String(seconds), path, 'sh', '-c', 'echo held; exec cat'],
    { stdio: ['pipe', 'pipe', 'ignore'] },
  );
  holder.stdin.on('error', () => {});
  const exited = new Promise((resolveExit) => {
    holder.once('exit', (code) => resolveExit(code));
  });

  const outcome = await new Promise((resolveOutcome) => {
    let said = '';
    holder.stdout.on('data', (chunk) => {
      said += chunk;
      if (said.includes('held')) resolveOutcome('held');
    });
    holder.once('error', (error) => resolveOutcome(error.code === 'ENOENT' ? 'unavailable' : error));
    holder.once('exit', (code) => resolveOutcome(code === 1 ? 'timeout' : new Error(`flock exited with code ${code}`)));
  });

  const waitedMs = Date.now() - started;
  if (outcome === 'unavailable') {
    return { path, waitedMs, mode: 'unavailable', release: async () => {} };
  }
  if (outcome === 'timeout') {
    throw new Error(`the browser lock ${path} stayed busy for ${Math.round(waitedMs / 1000)} s: another headless browser is still running`);
  }
  if (outcome !== 'held') throw outcome;

  let released = false;
  return {
    path,
    waitedMs,
    mode: 'held',
    release: async () => {
      if (released) return;
      released = true;
      holder.stdin.end();
      const forced = setTimeout(() => holder.kill('SIGKILL'), 5000);
      await exited;
      clearTimeout(forced);
    },
  };
}

/** The lock file every MARAZUL browser run shares. */
export const BROWSER_LOCK_PATH = '/tmp/marazul/browser.lock';

/** Thirty minutes: long enough to queue behind several slow software-rendered captures. */
export const DEFAULT_LOCK_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * True when this process was started by `flock <path> ...`: flock(1) hands its open lock file down
 * to the command it runs, so one of our inherited descriptors then points at the lock file, and
 * asking for the lock again would wait for ourselves.
 */
function isLockInherited(path) {
  try {
    const lockFile = realpathSync(path);
    return readdirSync('/proc/self/fd').some((descriptor) => {
      try {
        return readlinkSync(`/proc/self/fd/${descriptor}`) === lockFile;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}
