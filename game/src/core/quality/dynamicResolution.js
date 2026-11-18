// Dynamic resolution scaling: watches the frame time and lowers the internal render scale when
// frames run long, then feels its way back up when they are comfortably on time. Pure arithmetic;
// the world render pipeline applies the scale to the image pipeline.
//
//   const resolution = createDynamicResolution({ minScale: 0.75 });
//   const changed = resolution.sample(frameMilliseconds);     // every drawn frame
//   if (changed !== null) atmosphere.setQuality({ level, renderScale: changed });

/**
 * Creates the controller.
 * @param {Object} [options]
 * @param {number} [options.targetMilliseconds] The frame time to hold; default 16.7 (60 fps).
 * @param {number} [options.minScale] The lowest render scale; default 0.6.
 * @param {number} [options.maxScale] The highest render scale; default 1.
 * @param {number} [options.step] How much one adjustment changes the scale; default 0.05.
 * @param {number} [options.windowFrames] Frames per decision (their median decides); default 30.
 * @returns {ReturnType<typeof buildDynamicResolution>}
 */
export function createDynamicResolution(options = {}) {
  return buildDynamicResolution(options);
}

/** A frame longer than this is a pause (a hidden tab, a debugger), not load: it is ignored. */
export const STALL_MILLISECONDS = 1500;
/** A window may close early, after about this long, once it holds MIN_WINDOW_FRAMES frames. */
const WINDOW_MILLISECONDS = 1000;
const MIN_WINDOW_FRAMES = 6;

function buildDynamicResolution(options) {
  const step = options.step ?? 0.05;
  const windowFrames = options.windowFrames ?? 30;
  // The window's frame times: decisions use their median, so a few streaming hitches in a window
  // (a sector built, a shader compiled) do not lower the scale; a steady load still does.
  const frameTimes = new Float64Array(windowFrames);
  let sum = 0;
  let count = 0;
  /** Consecutive on-time windows since the last change. */
  let calmWindows = 0;
  /** On-time windows required before trying a higher scale; doubles after a failed attempt. */
  let patience = 6;
  /** True when the last change was an increase: a drop right after it means it was too much. */
  let lastChangeWasRaise = false;

  const controller = {
    targetMilliseconds: options.targetMilliseconds ?? 1000 / 60,
    minScale: options.minScale ?? 0.6,
    maxScale: options.maxScale ?? 1,
    /** Off: sample() keeps the scale where it is. */
    enabled: true,
    /** The current render scale. */
    scale: options.maxScale ?? 1,
    /** The average frame time of the last full window, for the performance overlay. */
    averageMilliseconds: 0,
    /** The median frame time of the last full window: what the decisions use. */
    medianMilliseconds: 0,
    sample,
    reset,
  };

  /**
   * Feeds one frame time.
   * @param {number} frameMilliseconds Time since the previous drawn frame.
   * @returns {number | null} The new scale when it changed, otherwise null.
   */
  function sample(frameMilliseconds) {
    // A pause (tab switch, debugger) says nothing about the load: ignore it. Shorter stalls (a
    // shader compiled, a sector built) are counted; the window's median sets them aside, while a
    // weak machine's steady 300 ms frames still lower the scale.
    if (!controller.enabled || frameMilliseconds > STALL_MILLISECONDS) return null;
    sum += frameMilliseconds;
    frameTimes[count] = frameMilliseconds;
    count += 1;
    // A window closes after `windowFrames` frames, or after about a second once it holds a few:
    // at 10 frames a second a 30-frame window would take three seconds per decision.
    if (count < windowFrames && (count < MIN_WINDOW_FRAMES || sum < WINDOW_MILLISECONDS)) return null;
    controller.averageMilliseconds = sum / count;
    const window = frameTimes.subarray(0, count);
    window.sort();
    const middle = count >> 1;
    const typical = count % 2 === 1 ? window[middle] : (window[middle - 1] + window[middle]) / 2;
    controller.medianMilliseconds = typical;
    sum = 0;
    count = 0;
    const target = controller.targetMilliseconds;

    if (typical > target * 1.15) {
      calmWindows = 0;
      if (lastChangeWasRaise) patience = Math.min(patience * 2, 96);
      lastChangeWasRaise = false;
      // Far over budget: aim straight at the scale whose pixel count fits the target (the cost
      // of the image follows the pixel count, the square of the scale), at most 0.25 at once.
      if (typical > target * 2) {
        const aimed = controller.scale * Math.sqrt(target / typical);
        return change(-Math.min(0.25, Math.max(2 * step, controller.scale - aimed)));
      }
      return change(-(typical > target * 1.5 ? 2 * step : step));
    }
    if (typical <= target * 1.05) {
      calmWindows += 1;
      if (calmWindows >= patience && controller.scale < controller.maxScale) {
        calmWindows = 0;
        lastChangeWasRaise = true;
        return change(step);
      }
      return null;
    }
    calmWindows = 0;
    return null;
  }

  /**
   * Starts afresh at a scale (after a quality change or a resize).
   * @param {number} [scale] Default the maximum.
   */
  function reset(scale = controller.maxScale) {
    controller.scale = clampScale(scale);
    sum = 0;
    count = 0;
    calmWindows = 0;
    patience = 6;
    lastChangeWasRaise = false;
  }

  function change(amount) {
    const next = clampScale(Math.round((controller.scale + amount) * 100) / 100);
    if (next === controller.scale) return null;
    controller.scale = next;
    return next;
  }

  function clampScale(scale) {
    return Math.min(controller.maxScale, Math.max(controller.minScale, scale));
  }

  return controller;
}
