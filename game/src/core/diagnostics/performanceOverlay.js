// The performance overlay, toggled by a key (F3 by default): frame time and rate, simulation
// steps, draw calls and triangles of the whole frame and of the sun's shadow passes, entities by
// kind, pending background work, the render scale, the CPU time of every busy system, and once a
// second the groups of objects that cost the most draw calls (sceneCostCensus.js). It costs
// nothing while hidden and redraws its text four times a second while shown.

/**
 * @typedef {Object} PerformanceSample What the engine hands the overlay each frame.
 * @property {number} frameMilliseconds Real time since the previous frame.
 * @property {number} steps Fixed steps run in the frame.
 */

/**
 * @typedef {Object} PerformanceSources Where the overlay reads the slower-moving figures.
 * @property {() => {drawCalls: number, triangles: number, geometries: number, textures: number, programs: number}} drawStatistics
 * @property {() => Record<string, number>} entityCounts Entities by kind.
 * @property {() => {name: string, cpuMilliseconds: number, status: string}[]} systemStatus
 * @property {() => string[]} headline Short facts for the first line (state, clock, quality).
 * @property {() => number} pendingWork Outstanding background work.
 * @property {() => number} renderScale The dynamic resolution scale.
 * @property {() => import('./sceneCostCensus.js').SceneCostRow[]} [sceneCost] The cost by group.
 */

/**
 * Creates the overlay, hidden.
 * @param {HTMLElement} parent The element the panel is appended to when first shown.
 * @param {PerformanceSources} sources Where the figures come from.
 * @returns {ReturnType<typeof buildPerformanceOverlay>}
 */
export function createPerformanceOverlay(parent, sources) {
  return buildPerformanceOverlay(parent, sources);
}

function buildPerformanceOverlay(parent, sources) {
  const documentRef = parent.ownerDocument;
  let panel = null;
  let sinceRedraw = 0;
  let frames = 0;
  let timeSum = 0;
  let worstFrame = 0;
  let stepSum = 0;
  let redraws = 0;
  /** The census lines, refreshed every fourth redraw: walking the scene is not free. */
  let costLines = [];

  const overlay = {
    /** Whether the panel is shown. */
    visible: false,
    /** Smoothed figures, kept even while hidden, for the debug object. */
    averageFrameMilliseconds: 0,
    worstFrameMilliseconds: 0,
    toggle,
    setVisible,
    sample,
  };

  /** Shows or hides the panel. */
  function toggle() {
    setVisible(!overlay.visible);
  }

  /**
   * Shows or hides the panel.
   * @param {boolean} visible
   */
  function setVisible(visible) {
    overlay.visible = visible;
    if (visible && !panel) {
      panel = documentRef.createElement('pre');
      panel.className = 'performance-overlay';
      parent.appendChild(panel);
    }
    if (panel) panel.hidden = !visible;
    if (visible) redraw();
  }

  /**
   * Feeds one frame.
   * @param {PerformanceSample} frame The frame's timing.
   */
  function sample(frame) {
    frames += 1;
    timeSum += frame.frameMilliseconds;
    stepSum += frame.steps;
    if (frame.frameMilliseconds > worstFrame) worstFrame = frame.frameMilliseconds;
    sinceRedraw += frame.frameMilliseconds;
    if (sinceRedraw < 250) return;
    overlay.averageFrameMilliseconds = timeSum / frames;
    overlay.worstFrameMilliseconds = worstFrame;
    if (overlay.visible) redraw(stepSum / frames);
    sinceRedraw = 0;
    frames = 0;
    timeSum = 0;
    stepSum = 0;
    worstFrame = 0;
  }

  function redraw(stepsPerFrame = 0) {
    if (!panel) return;
    const average = overlay.averageFrameMilliseconds;
    const draw = sources.drawStatistics();
    const counts = sources.entityCounts();
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const kinds = Object.entries(counts).map(([kind, count]) => `${kind} ${count}`).join(', ');
    const status = sources.systemStatus();
    const systemsTotal = status.reduce((sum, system) => sum + system.cpuMilliseconds, 0);
    const busiest = status
      .filter((system) => system.cpuMilliseconds >= 0.01 || system.status === 'failed')
      .sort((a, b) => b.cpuMilliseconds - a.cpuMilliseconds)
      .slice(0, 14)
      .map((system) => `  ${system.name.padEnd(22)} ${system.status === 'failed' ? 'FAILED' : `${system.cpuMilliseconds.toFixed(2)} ms`}`);
    if (sources.sceneCost && redraws % 4 === 0) {
      costLines = sources.sceneCost().slice(0, 10).map((row) =>
        `  ${row.group.slice(0, 34).padEnd(34)} ${String(row.drawCalls).padStart(5)} draws ${formatCount(row.triangles).padStart(8)} tris ${String(row.shadowCasters).padStart(5)} casters`);
    }
    redraws += 1;
    panel.textContent = [
      sources.headline().join('  |  '),
      `frame ${average.toFixed(1)} ms (${average > 0 ? Math.round(1000 / average) : 0} fps), worst ${overlay.worstFrameMilliseconds.toFixed(1)} ms, ${stepsPerFrame.toFixed(2)} steps/frame`,
      `draw calls ${draw.drawCalls} (shadows ${draw.shadowDrawCalls ?? 0}), triangles ${formatCount(draw.triangles)} (shadows ${formatCount(draw.shadowTriangles ?? 0)})`,
      `geometries ${draw.geometries}, textures ${draw.textures}, programs ${draw.programs}, render scale ${sources.renderScale().toFixed(2)}`,
      `entities ${total}${kinds ? ` (${kinds})` : ''}, background work ${sources.pendingWork()}`,
      `systems CPU ${systemsTotal.toFixed(2)} ms per frame:`,
      ...busiest,
      ...(costLines.length > 0 ? ['in view by group (draws, triangles, shadow casters):', ...costLines] : []),
    ].join('\n');
  }

  return overlay;
}

function formatCount(value) {
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)} M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)} k`;
  return String(value);
}
