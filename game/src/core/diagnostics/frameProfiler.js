// The frame profiler: measures where a frame goes, for the system owners and the quality tiers.
// It runs the simulation forward a number of 60 Hz frames and reads each system's CPU time from
// the system registry, then draws a few ordinary frames and reads the renderer's draw calls and
// triangles (with the sun's shadow passes apart) and the scene cost census by group.
//
//   const report = profiler.profile({ frames: 120, drawnFrames: 3 });   // MARAZUL.profile()

/**
 * @typedef {Object} FrameProfile
 * @property {string} quality The tier in use.
 * @property {number} frames Simulated frames measured (one fixed step each).
 * @property {number} systemsMillisecondsPerFrame CPU per frame of all systems together.
 * @property {{name: string, milliseconds: number, status: string}[]} systems CPU per frame by
 *   system, dearest first (fixed step, update and late update together).
 * @property {{drawCalls: number, triangles: number, shadowDrawCalls: number, shadowTriangles: number,
 *   renderMilliseconds: number}[]} drawn Each drawn frame: every pass together, the shadow passes
 *   apart, and the CPU time of the draw call (meaningless under a software renderer).
 * @property {import('./sceneCostCensus.js').SceneCostRow[]} census The cost by group of objects.
 */

/**
 * Creates the profiler.
 * @param {Object} sources
 * @param {() => {name: string, status: string, totalMilliseconds: number}[]} sources.systemStatus
 * @param {(seconds: number) => number} sources.advance Runs whole fixed steps with their frame work.
 * @param {() => void} sources.drawFrame Draws one ordinary frame.
 * @param {() => {drawCalls: number, triangles: number, shadowDrawCalls: number, shadowTriangles: number}} sources.drawStatistics
 * @param {(options: {shadowDistance: number}) => import('./sceneCostCensus.js').SceneCostRow[]} sources.census
 * @param {() => {name: string, tier: {atmosphere: string | {level: string, shadows?: string}}}} sources.quality
 * @param {() => number} [sources.now] A millisecond clock.
 * @returns {{profile: (options?: {frames?: number, drawnFrames?: number}) => FrameProfile}}
 */
export function createFrameProfiler(sources) {
  const now = sources.now ?? (() => performance.now());
  const round = (value) => Math.round(value * 1000) / 1000;

  /**
   * Measures the game as it stands (call it with the game in the state to measure).
   * @param {{frames?: number, drawnFrames?: number}} [options] Simulated frames (default 120)
   *   and drawn frames (default 3: the far shadow cascades refresh every few frames).
   * @returns {FrameProfile}
   */
  function profile(options = {}) {
    const frames = Math.max(1, Math.round(options.frames ?? 120));
    const drawnFrames = Math.max(0, Math.round(options.drawnFrames ?? 3));
    const before = new Map(sources.systemStatus().map((entry) => [entry.name, entry.totalMilliseconds]));
    sources.advance(frames / 60);
    const systems = sources.systemStatus()
      .map((entry) => ({
        name: entry.name,
        milliseconds: round((entry.totalMilliseconds - (before.get(entry.name) ?? 0)) / frames),
        status: entry.status,
      }))
      .sort((a, b) => b.milliseconds - a.milliseconds);
    const drawn = [];
    for (let i = 0; i < drawnFrames; i += 1) {
      const started = now();
      sources.drawFrame();
      const renderMilliseconds = round(now() - started);
      const statistics = sources.drawStatistics();
      drawn.push({
        drawCalls: statistics.drawCalls,
        triangles: statistics.triangles,
        shadowDrawCalls: statistics.shadowDrawCalls,
        shadowTriangles: statistics.shadowTriangles,
        renderMilliseconds,
      });
    }
    const quality = sources.quality();
    return {
      quality: quality.name,
      frames,
      systemsMillisecondsPerFrame: round(systems.reduce((sum, entry) => sum + entry.milliseconds, 0)),
      systems,
      drawn,
      census: sources.census({ shadowDistance: shadowReachOf(quality.tier), nearShadowDistance: nearShadowReachOf(quality.tier) }),
    };
  }

  return { profile };
}

/**
 * The reach of the sun's shadows a tier asks for.
 * @param {{atmosphere: string | {level: string, shadows?: string}}} tier A quality tier row.
 * @returns {number} Metres.
 */
export function shadowReachOf(tier) {
  const atmosphere = tier.atmosphere;
  const level = typeof atmosphere === 'string' ? atmosphere : atmosphere.shadows ?? atmosphere.level;
  return SUN_SHADOW_REACH[level] ?? SUN_SHADOW_REACH.high;
}

/** How far the sun's shadows reach at each atmosphere shadow level, in metres: the largest cascade
 * radius of render/lighting/sunShadowRig.js (SHADOW_QUALITY), for the census of shadow casters. */
export const SUN_SHADOW_REACH = Object.freeze({ off: 0, low: 46, medium: 96, high: 230, ultra: 640 });

/**
 * The reach of the near cascades a tier draws: the largest cascade radius whose shadow camera is
 * narrower than 140 m (world/buildings/buildingShadowProxies.js FAR_CASCADE_WIDTH). Casters tagged
 * userData.shadowCascades = 'near' count within it (sceneCostCensus.js).
 * @param {{atmosphere: string | {level: string, shadows?: string}}} tier A quality tier row.
 * @returns {number} Metres.
 */
export function nearShadowReachOf(tier) {
  const atmosphere = tier.atmosphere;
  const level = typeof atmosphere === 'string' ? atmosphere : atmosphere.shadows ?? atmosphere.level;
  return NEAR_SHADOW_REACH[level] ?? NEAR_SHADOW_REACH.high;
}

/** The near cascades' reach at each shadow level, metres (SHADOW_QUALITY radii under 70 m). */
export const NEAR_SHADOW_REACH = Object.freeze({ off: 0, low: 46, medium: 21, high: 62, ultra: 52 });
