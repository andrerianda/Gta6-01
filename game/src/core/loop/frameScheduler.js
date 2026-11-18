// The frame scheduler: asks the browser for animation frames and hands each one to the game loop.
// It can be held, which automation uses under a software renderer (a frame takes seconds there):
// the picture stays as it is and the debug object advances and draws on request, until the
// player presses a key or a script resumes it. On a real GPU it simply runs.
//
//   const scheduler = createFrameScheduler({ requestFrame, cancelFrame, onFrame: (ms) => loop.tick(ms / 1000) });
//   scheduler.start();   scheduler.hold();   scheduler.resume();   scheduler.stop();

/**
 * Creates the scheduler, stopped.
 * @param {Object} options
 * @param {(milliseconds: number) => void} options.onFrame Runs one frame; receives the browser's
 *   frame time in milliseconds.
 * @param {(callback: (milliseconds: number) => void) => number} options.requestFrame Usually
 *   window.requestAnimationFrame.
 * @param {(handle: number) => void} options.cancelFrame Usually window.cancelAnimationFrame.
 * @param {() => void} [options.onResume] Called when a hold ends, before the next frame (the
 *   loop forgets its clock so the time spent held is not simulated).
 * @returns {{running: boolean, held: boolean, framesRun: number, start: () => void,
 *   stop: () => void, hold: () => void, resume: () => void}}
 */
export function createFrameScheduler(options) {
  let handle = null;

  const scheduler = {
    /** True between start() and stop(). */
    running: false,
    /** True while frames are withheld. */
    held: false,
    /** Frames handed to onFrame since the start. */
    framesRun: 0,
    start,
    stop,
    hold,
    resume,
  };

  function schedule() {
    if (handle === null && scheduler.running && !scheduler.held) {
      handle = options.requestFrame(run);
    }
  }

  function cancel() {
    if (handle !== null) {
      options.cancelFrame(handle);
      handle = null;
    }
  }

  function run(milliseconds) {
    handle = null;
    if (!scheduler.running || scheduler.held) return;
    scheduler.framesRun += 1;
    try {
      options.onFrame(milliseconds);
    } finally {
      schedule();
    }
  }

  /** Starts asking for frames. */
  function start() {
    if (scheduler.running) return;
    scheduler.running = true;
    schedule();
  }

  /** Stops for good (until start() is called again). */
  function stop() {
    scheduler.running = false;
    scheduler.held = false;
    cancel();
  }

  /** Withholds frames until resume(). */
  function hold() {
    scheduler.held = true;
    cancel();
  }

  /** Ends a hold. */
  function resume() {
    if (!scheduler.held) return;
    scheduler.held = false;
    if (options.onResume) options.onResume();
    schedule();
  }

  return scheduler;
}
