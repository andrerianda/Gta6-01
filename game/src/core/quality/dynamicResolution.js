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
 * @param {number} [options.windowFrames] Frames averaged per decision; default 30.
 * @returns {ReturnType<typeof buildDynamicResolution>}
 */
export function createDynamicResolution(options = {}) {
  return buildDynamicResolution(options);
}

function buildDynamicResolution(options) {
  const step = options.step ?? 0.05;
  const windowFrames = options.windowFrames ?? 30;
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
    sample,
    reset,
  };

  /**
   * Feeds one frame time.
   * @param {number} frameMilliseconds Time since the previous drawn frame.
   * @returns {number | null} The new scale when it changed, otherwise null.
   */
  function sample(frameMilliseconds) {
    // A stall (tab switch, shader compile) says nothing about the steady load: ignore it.
    if (!controller.enabled || frameMilliseconds > 250) return null;
    sum += frameMilliseconds;
    count += 1;
    if (count < windowFrames) return null;
    const average = sum / count;
    sum = 0;
    count = 0;
    controller.averageMilliseconds = average;
    const target = controller.targetMilliseconds;

    if (average > target * 1.15) {
      calmWindows = 0;
      if (lastChangeWasRaise) patience = Math.min(patience * 2, 96);
      lastChangeWasRaise = false;
      // Far over budget: come down two steps at once.
      return change(-(average > target * 1.5 ? 2 * step : step));
    }
    if (average <= target * 1.05) {
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
