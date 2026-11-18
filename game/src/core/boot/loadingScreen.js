// The loading screen: a progress bar and a line of status text over the page while the models
// load and the systems initialise. The bar never moves backwards. The elements are the static
// containers of game/index.html; without them (tests) the screen only keeps its numbers.
//
//   const screen = createLoadingScreen({ bar, status });
//   screen.set(0.4, 'Loading models');   screen.stage(0.5, 0.9)(0.5, 'Preparing traffic');

/**
 * Creates the loading screen controller.
 * @param {Object} [elements]
 * @param {HTMLElement | null} [elements.bar] The element whose width shows the progress.
 * @param {HTMLElement | null} [elements.status] The element that shows the status text.
 * @returns {{fraction: number, label: string, set: (fraction: number, label?: string) => void,
 *   stage: (from: number, to: number) => (fraction: number, label?: string) => void}}
 */
export function createLoadingScreen(elements = {}) {
  const bar = elements.bar ?? null;
  const status = elements.status ?? null;

  const screen = {
    /** Progress shown, 0 to 1. */
    fraction: 0,
    /** The status text shown. */
    label: '',
    set,
    stage,
  };

  /**
   * Shows progress.
   * @param {number} fraction 0 to 1; a smaller value than the one shown is ignored.
   * @param {string} [label] What is being done.
   */
  function set(fraction, label) {
    const clamped = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
    if (clamped > screen.fraction) screen.fraction = clamped;
    if (label) screen.label = label;
    if (bar) bar.style.width = `${(screen.fraction * 100).toFixed(1)}%`;
    if (status) status.textContent = `${screen.label} · ${Math.round(screen.fraction * 100)}%`;
  }

  /**
   * A progress function for one stage of the boot, mapped onto a share of the bar.
   * @param {number} from Where the stage starts on the bar, 0 to 1.
   * @param {number} to Where it ends.
   * @returns {(fraction: number, label?: string) => void}
   */
  function stage(from, to) {
    return (fraction, label) => {
      const local = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
      set(from + (to - from) * local, label);
    };
  }

  return screen;
}
