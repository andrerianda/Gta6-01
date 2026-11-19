// The background work tracker: one place that knows whether anything is still being loaded,
// streamed or generated behind the picture. Systems report work as they start and finish it;
// queues and loaders are polled. Automation waits on it before a screenshot, and the loading
// screen waits on it before it lifts.
//
//   const finished = work.begin('city sector 4,7');   ...   finished();
//   await work.track(assets.load(ids), 'vehicle models');
//   work.addSource('jobs', () => jobs.pendingCount);
//   await work.whenIdle({ pump: () => jobs.drain(50) });

/**
 * Creates a tracker.
 * @param {Object} [options]
 * @param {(milliseconds: number) => Promise<void>} [options.wait] How whenIdle() sleeps between
 *   polls; default a timer.
 * @returns {ReturnType<typeof buildBackgroundWorkTracker>}
 */
export function createBackgroundWorkTracker(options = {}) {
  return buildBackgroundWorkTracker(options);
}

function buildBackgroundWorkTracker(options) {
  const wait = options.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  /** @type {Map<number, string>} Reported work in progress: token -> label. */
  const inProgress = new Map();
  /** @type {Map<string, () => number>} Polled sources: name -> pending count. */
  const sources = new Map();
  let nextToken = 1;

  const tracker = {
    begin,
    track,
    addSource,
    removeSource: (name) => sources.delete(name),
    describe,
    whenIdle,
    /** How many pieces of work are outstanding, reported and polled together. */
    get pendingCount() {
      let count = inProgress.size;
      for (const pending of sources.values()) count += Math.max(0, pending() || 0);
      return count;
    },
    /** True when nothing is outstanding. */
    get isIdle() {
      return tracker.pendingCount === 0;
    },
  };

  /**
   * Reports that a piece of background work started.
   * @param {string} label What it is, for diagnostics.
   * @returns {() => void} Call it when the work is finished or abandoned; extra calls are ignored.
   */
  function begin(label) {
    const token = nextToken;
    nextToken += 1;
    inProgress.set(token, label);
    return () => {
      inProgress.delete(token);
    };
  }

  /**
   * Reports a promise as background work until it settles.
   * @template T
   * @param {Promise<T>} promise The work.
   * @param {string} label What it is.
   * @returns {Promise<T>} The same promise.
   */
  function track(promise, label) {
    const finished = begin(label);
    promise.then(finished, finished);
    return promise;
  }

  /**
   * Adds a source that is asked for its outstanding count instead of reporting it.
   * @param {string} name What it is ('jobs', 'assets', 'city sectors').
   * @param {() => number} pendingCount Returns how many items are outstanding now.
   */
  function addSource(name, pendingCount) {
    sources.set(name, pendingCount);
  }

  /**
   * What is outstanding, in words.
   * @returns {string[]} One entry per piece of reported work and per busy source.
   */
  function describe() {
    const lines = [...inProgress.values()];
    for (const [name, pending] of sources) {
      const count = Math.max(0, pending() || 0);
      if (count > 0) lines.push(`${name}: ${count}`);
    }
    return lines;
  }

  /**
   * Waits until nothing is outstanding for two polls in a row (work often starts more work).
   * @param {Object} [waitOptions]
   * @param {() => void} [waitOptions.pump] Called before every poll to push the work along
   *   (drain the job queue, run a streaming update); needed when no frame loop is running.
   * @param {number} [waitOptions.timeoutMilliseconds] Give up after this long; default 120000.
   * @param {number} [waitOptions.pollMilliseconds] Sleep between polls; default 15.
   * @param {() => number} [waitOptions.now] A millisecond clock; default Date.now.
   * @returns {Promise<boolean>} True when idle, false when the time ran out.
   */
  async function whenIdle(waitOptions = {}) {
    const now = waitOptions.now ?? Date.now;
    const deadline = now() + (waitOptions.timeoutMilliseconds ?? 120000);
    const pollMilliseconds = waitOptions.pollMilliseconds ?? 15;
    let idlePolls = 0;
    for (;;) {
      if (waitOptions.pump) waitOptions.pump();
      idlePolls = tracker.isIdle ? idlePolls + 1 : 0;
      if (idlePolls >= 2) return true;
      if (now() >= deadline) return false;
      await wait(pollMilliseconds);
    }
  }

  return tracker;
}
