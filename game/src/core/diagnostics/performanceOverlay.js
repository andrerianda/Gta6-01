// The performance overlay, toggled by a key (F3 by default): frame time and rate, simulation
// steps, draw calls and triangles of the whole frame, entities by kind, pending background work,
// the render scale and the CPU time of the busiest systems. It costs nothing while hidden and
// redraws its text four times a second while shown.

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
    const busiest = sources.systemStatus()
      .filter((system) => system.cpuMilliseconds >= 0.01 || system.status === 'failed')
      .sort((a, b) => b.cpuMilliseconds - a.cpuMilliseconds)
      .slice(0, 8)
      .map((system) => `  ${system.name.padEnd(22)} ${system.status === 'failed' ? 'FAILED' : `${system.cpuMilliseconds.toFixed(2)} ms`}`);
    panel.textContent = [
      sources.headline().join('  |  '),
      `frame ${average.toFixed(1)} ms (${average > 0 ? Math.round(1000 / average) : 0} fps), worst ${overlay.worstFrameMilliseconds.toFixed(1)} ms, ${stepsPerFrame.toFixed(2)} steps/frame`,
      `draw calls ${draw.drawCalls}, triangles ${formatCount(draw.triangles)}, geometries ${draw.geometries}, textures ${draw.textures}, programs ${draw.programs}`,
      `entities ${total}${kinds ? ` (${kinds})` : ''}, background work ${sources.pendingWork()}, render scale ${sources.renderScale().toFixed(2)}`,
      ...busiest,
    ].join('\n');
  }

  return overlay;
}

function formatCount(value) {
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)} M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)} k`;
  return String(value);
}
