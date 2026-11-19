// The game loop of MARAZUL as pure arithmetic: a fixed 60 Hz simulation step fed by an accumulator
// with clamped catch-up, a variable frame with an interpolation alpha, pause, a time scale for
// slow motion, and a deterministic mode that advances a requested time in fixed steps without
// drawing. It knows nothing about the browser: the frame scheduler feeds it the clock, and the
// callbacks do the work.
//
//   const loop = createFixedStepGameLoop({ fixedStep, frame, render });
//   loop.tick(performance.now() / 1000);      // one displayed frame
//   loop.advance(2.5);                         // automation: 150 steps, nothing drawn

/**
 * @typedef {Object} FrameTiming What a frame callback is told. The loop reuses one object.
 * @property {number} realDelta Wall-clock seconds since the previous frame, clamped to 0.25.
 * @property {number} delta Simulated seconds this frame covers: realDelta times the time scale,
 *   0 while the simulation is paused.
 * @property {number} alpha How far the picture is between the last two fixed steps, 0 to 1:
 *   interpolate rendered positions with it.
 * @property {number} steps How many fixed steps ran in this frame.
 * @property {boolean} virtual True for the frames of advance(), which are never drawn.
 */

/**
 * @typedef {Object} GameLoopCallbacks
 * @property {(stepSeconds: number) => void} fixedStep Runs one simulation step.
 * @property {(timing: FrameTiming) => void} frame Runs the per-frame work after the steps.
 * @property {(timing: FrameTiming) => void} [render] Draws the frame.
 */

/**
 * Creates the loop.
 * @param {GameLoopCallbacks & {stepSeconds?: number, maxCatchUpSteps?: number}} options The
 *   callbacks, the step (default 1/60 s) and how many steps one frame may run to catch up
 *   (default 5; time beyond that is dropped, so a stall never causes a spiral of work).
 * @returns {ReturnType<typeof buildGameLoop>}
 */
export function createFixedStepGameLoop(options) {
  return buildGameLoop(options);
}

/** The simulation step in seconds: physics, AI and rules all run at 60 Hz. */
export const FIXED_STEP_SECONDS = 1 / 60;

function buildGameLoop(options) {
  const stepSeconds = options.stepSeconds ?? FIXED_STEP_SECONDS;
  const maxCatchUpSteps = options.maxCatchUpSteps ?? 5;
  /** @type {FrameTiming} */
  const timing = { realDelta: 0, delta: 0, alpha: 0, steps: 0, virtual: false };
  let accumulator = 0;
  let lastClock = null;

  const loop = {
    stepSeconds,
    /** While true no fixed step runs and frames get a delta of 0 (the interface still animates). */
    paused: false,
    /** Simulated seconds per real second: 1 normal, 0.3 slow motion. */
    timeScale: 1,
    /** Fixed steps run since the start. */
    stepCount: 0,
    /** Frames run since the start, drawn or virtual. */
    frameCount: 0,
    /** Simulated seconds since the start (stepCount times the step). */
    simulationTime: 0,
    /** Real seconds spent in tick() frames since the start. */
    realTime: 0,
    /** The timing of the frame in progress or just finished. */
    timing,
    tick,
    advance,
    resetClock,
  };

  /**
   * Runs one displayed frame: the fixed steps that are due, the frame work, then the drawing.
   * @param {number} clockSeconds A monotonic clock reading in seconds.
   * @param {{render?: boolean}} [frameOptions] Pass render: false to skip the drawing.
   * @returns {FrameTiming}
   */
  function tick(clockSeconds, frameOptions) {
    const elapsed = lastClock === null ? 0 : clockSeconds - lastClock;
    lastClock = clockSeconds;
    const realDelta = Math.min(Math.max(elapsed, 0), 0.25);
    const scale = loop.paused ? 0 : Math.max(loop.timeScale, 0);
    const delta = realDelta * scale;

    let steps = 0;
    if (!loop.paused) {
      accumulator += delta;
      const ceiling = stepSeconds * maxCatchUpSteps;
      if (accumulator > ceiling) accumulator = ceiling;
      // The small epsilon keeps a frame of exactly one step from being lost to rounding.
      while (accumulator >= stepSeconds - 1e-9 && steps < maxCatchUpSteps) {
        accumulator -= stepSeconds;
        runFixedStep();
        steps += 1;
      }
      if (accumulator < 0) accumulator = 0;
    }

    timing.realDelta = realDelta;
    timing.delta = delta;
    timing.alpha = loop.paused ? 1 : Math.min(1, accumulator / stepSeconds);
    timing.steps = steps;
    timing.virtual = false;
    loop.realTime += realDelta;
    loop.frameCount += 1;
    options.frame(timing);
    if (options.render && frameOptions?.render !== false) options.render(timing);
    return timing;
  }

  /**
   * Deterministic mode: advances the simulation by a requested time in whole fixed steps, each
   * followed by the frame work of a virtual frame of exactly one step, and draws nothing. The
   * result does not depend on the machine's speed or on the pause flag.
   * @param {number} seconds Simulated time to advance; rounded to whole steps.
   * @returns {number} The number of steps run.
   */
  function advance(seconds) {
    const steps = Math.max(0, Math.round(seconds / stepSeconds));
    for (let i = 0; i < steps; i += 1) {
      runFixedStep();
      timing.realDelta = stepSeconds;
      timing.delta = stepSeconds;
      timing.alpha = 1;
      timing.steps = 1;
      timing.virtual = true;
      loop.frameCount += 1;
      options.frame(timing);
    }
    // The next displayed frame starts from a clean slate instead of catching up on the wait.
    accumulator = 0;
    lastClock = null;
    return steps;
  }

  /** Forgets the last clock reading, so the next tick() does not count the time spent away. */
  function resetClock() {
    lastClock = null;
  }

  function runFixedStep() {
    options.fixedStep(stepSeconds);
    loop.stepCount += 1;
    loop.simulationTime = loop.stepCount * stepSeconds;
  }

  return loop;
}
