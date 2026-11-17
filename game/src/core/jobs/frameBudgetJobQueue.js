// The frame-budget job queue: heavy generation (terrain patches, facade textures, building
// meshes) runs here in slices, a few milliseconds per frame, so the game never hitches. A job is
// a plain function for a single piece of work, or a generator that yields between slices.
//
//   const job = jobs.add(function* buildSector() {
//     for (const lot of lots) { buildLot(lot); yield; }      // one slice per lot
//     return sectorMesh;
//   }, { priority: JOB_PRIORITY.HIGH, owner: 'openWorldCity', label: 'sector 4,7' });
//   job.done.then((mesh) => scene.add(mesh));
//   job.cancel();                                            // the sector was streamed out again
//
//   jobs.run(4);        // each frame: up to 4 ms of work
//   jobs.drain();       // loading screens and deterministic automation: everything, now

/**
 * @typedef {Object} JobHandle
 * @property {number} id
 * @property {string} label For diagnostics.
 * @property {string} owner The system that added it.
 * @property {number} priority
 * @property {'waiting' | 'running' | 'done' | 'failed' | 'cancelled'} state
 * @property {Promise<any>} done Resolves with the job's result (undefined when cancelled);
 *   rejects when the job threw.
 * @property {() => void} cancel Drops the job; a running generator is closed.
 */

/**
 * Creates a job queue.
 * @param {Object} [options]
 * @param {() => number} [options.now] A millisecond clock; default performance.now.
 * @param {(failure: {label: string, owner: string, error: Error}) => void} [options.onJobError]
 *   Receives the error of a job that threw.
 * @returns {ReturnType<typeof buildFrameBudgetJobQueue>}
 */
export function createFrameBudgetJobQueue(options = {}) {
  return buildFrameBudgetJobQueue(options);
}

/** Suggested priorities. Higher runs first; equal priorities run in the order they were added. */
export const JOB_PRIORITY = Object.freeze({
  CRITICAL: 100,   // the player would see a hole without it
  HIGH: 50,        // the sector the player is in or drives toward
  NORMAL: 0,
  LOW: -50,        // far sectors, levels of detail, warm-up
});

function buildFrameBudgetJobQueue(options) {
  const now = options.now ?? (() => performance.now());
  /** Waiting and running jobs, highest priority first, oldest first within a priority. */
  const jobs = [];
  let nextId = 1;

  const queue = {
    add,
    run,
    drain,
    cancelOwnedBy,
    /** Jobs not finished yet. */
    get pendingCount() {
      return jobs.length;
    },
    /** Slices run since the start. */
    slicesRun: 0,
    /** Milliseconds the last run() used. */
    lastRunMilliseconds: 0,
    /** Labels of the pending jobs, in running order, for diagnostics. */
    pendingLabels: () => jobs.map((job) => job.handle.label),
  };

  /**
   * Adds a job.
   * @param {(() => any) | (() => Iterator<any, any>) | Iterator<any, any>} work A function that
   *   does the whole job, or a generator function (or iterator) that yields between slices and
   *   returns the result.
   * @param {{priority?: number, label?: string, owner?: string}} [jobOptions]
   * @returns {JobHandle}
   */
  function add(work, jobOptions = {}) {
    let resolveDone;
    let rejectDone;
    const done = new Promise((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    });
    // A job nobody awaits must not raise an unhandled rejection; onJobError reports it.
    done.catch(() => {});
    const job = {
      work,
      iterator: null,
      resolveDone,
      rejectDone,
      /** @type {JobHandle} */
      handle: {
        id: nextId,
        label: jobOptions.label ?? `job ${nextId}`,
        owner: jobOptions.owner ?? '',
        priority: jobOptions.priority ?? JOB_PRIORITY.NORMAL,
        state: 'waiting',
        done,
        cancel: () => cancel(job),
      },
    };
    nextId += 1;
    // Insert behind the last job of the same or a higher priority.
    let index = jobs.length;
    while (index > 0 && jobs[index - 1].handle.priority < job.handle.priority) index -= 1;
    jobs.splice(index, 0, job);
    return job.handle;
  }

  /**
   * Runs jobs until the budget is used up. At least one slice runs per call, so work always
   * advances; a slice that overruns the budget ends the call.
   * @param {number} budgetMilliseconds How long this call may take.
   * @returns {number} How many slices ran.
   */
  function run(budgetMilliseconds) {
    const started = now();
    let slices = 0;
    while (jobs.length > 0) {
      runSlice(jobs[0]);
      slices += 1;
      if (now() - started >= budgetMilliseconds) break;
    }
    queue.lastRunMilliseconds = now() - started;
    return slices;
  }

  /**
   * Runs every job to the end, including jobs added meanwhile.
   * @param {number} [maxMilliseconds] Give up after this long; default no limit.
   * @returns {boolean} True when the queue is empty.
   */
  function drain(maxMilliseconds = Infinity) {
    const started = now();
    while (jobs.length > 0) {
      runSlice(jobs[0]);
      if (now() - started >= maxMilliseconds) break;
    }
    return jobs.length === 0;
  }

  /**
   * Cancels every pending job of one owner.
   * @param {string} owner The owner given to add().
   * @returns {number} How many were cancelled.
   */
  function cancelOwnedBy(owner) {
    let cancelled = 0;
    for (const job of jobs.slice()) {
      if (job.handle.owner === owner) {
        cancel(job);
        cancelled += 1;
      }
    }
    return cancelled;
  }

  function runSlice(job) {
    queue.slicesRun += 1;
    try {
      if (job.handle.state === 'waiting') {
        job.handle.state = 'running';
        const started = typeof job.work === 'function' ? job.work() : job.work;
        if (isIterator(started)) {
          job.iterator = started;
        } else {
          finish(job, 'done', started);
          return;
        }
      }
      const step = job.iterator.next();
      if (step.done) finish(job, 'done', step.value);
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      finish(job, 'failed', failure);
      if (options.onJobError) {
        options.onJobError({ label: job.handle.label, owner: job.handle.owner, error: failure });
      }
    }
  }

  function cancel(job) {
    if (job.handle.state !== 'waiting' && job.handle.state !== 'running') return;
    if (job.iterator && typeof job.iterator.return === 'function') {
      try {
        job.iterator.return(undefined);
      } catch {
        // A generator's cleanup that throws has nothing left to clean.
      }
    }
    finish(job, 'cancelled', undefined);
  }

  function finish(job, state, value) {
    job.handle.state = state;
    const index = jobs.indexOf(job);
    if (index !== -1) jobs.splice(index, 1);
    if (state === 'failed') job.rejectDone(value);
    else job.resolveDone(value);
  }

  return queue;
}

function isIterator(value) {
  return value !== null && typeof value === 'object' && typeof value.next === 'function';
}
