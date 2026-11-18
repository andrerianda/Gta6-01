// Shader warm-up for the boot: compiles the shader programs of every mesh in the scene (shown or
// hidden: far levels, pooled cars, idle effects) before the first frame is drawn. three.js's
// renderer.compileAsync() links them through KHR_parallel_shader_compile where the driver offers
// it, so the programs build side by side while the loading screen is up, instead of one at a
// time inside the first frame (and inside later frames, as hidden objects first come into view).
// It never blocks the boot for long: after `timeoutMilliseconds` the boot goes on and whatever is
// not linked yet finishes in the first frames, exactly as without the warm-up.
//
//   const report = await warmUpShaders(view.renderer, view.scene, view.camera);
//   // { programs: 212, milliseconds: 840, timedOut: false }

/**
 * Compiles the scene's shader programs ahead of the first frame.
 * @param {{compileAsync?: Function, info?: {programs?: unknown[] | null}}} renderer The WebGL renderer.
 * @param {object} scene The scene to draw (its lights decide the programs' light counts).
 * @param {object} camera The camera of the first frame.
 * @param {Object} [options]
 * @param {number} [options.timeoutMilliseconds] Longest wait; default 6000.
 * @param {() => number} [options.now] Clock in milliseconds; default performance.now.
 * @returns {Promise<{programs: number, milliseconds: number, timedOut: boolean, skipped: boolean}>}
 */
export async function warmUpShaders(renderer, scene, camera, options = {}) {
  const now = options.now ?? (() => globalThis.performance.now());
  const timeout = options.timeoutMilliseconds ?? 6000;
  const programsBefore = programCount(renderer);
  const started = now();
  if (typeof renderer.compileAsync !== 'function') {
    return { programs: 0, milliseconds: 0, timedOut: false, skipped: true };
  }
  let timer = null;
  const expired = new Promise((resolve) => { timer = setTimeout(() => resolve(true), timeout); });
  const finished = Promise.resolve(renderer.compileAsync(scene, camera)).then(() => false);
  let timedOut = false;
  try {
    timedOut = await Promise.race([finished, expired]);
  } finally {
    clearTimeout(timer);
  }
  return {
    programs: programCount(renderer) - programsBefore,
    milliseconds: Math.round(now() - started),
    timedOut,
    skipped: false,
  };
}

function programCount(renderer) {
  const programs = renderer.info?.programs;
  return Array.isArray(programs) ? programs.length : 0;
}
