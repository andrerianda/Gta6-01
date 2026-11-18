// The loading screen: a progress bar, a percentage, a line of status text and a tip about play
// over the drawn sunset skyline of game/index.html while the models load and the systems
// initialise. The bar never moves backwards; the tip changes as the bar passes each share of it.
// The elements are the static containers of game/index.html; without them (tests) the screen only
// keeps its numbers.
//
//   const screen = createLoadingScreen({ bar, status, percent, tip });
//   screen.set(0.4, 'Loading models');   screen.stage(0.5, 0.9)(0.5, 'Preparing traffic');

/** Tips shown while the game loads, one after another as the bar fills. */
export const LOADING_TIPS = Object.freeze([
  'Walk up to any car and press F to take the wheel. Owners rarely take it well.',
  'Hold the right mouse button to aim; the left one fires. Tab opens the weapon wheel.',
  'Break the line of sight and the police search where they last saw you: the stars fade when they give up.',
  'Press M for the city map and set a route; the minimap draws it street by street.',
  'Your phone (T) rings when someone in Marazul has work for you.',
  'Golden hour on Bulevar Dorado is around ten to seven in the evening. Worth the drive.',
  'Shift sprints on foot. In a car, Space is the handbrake and V changes the chase camera.',
  'Barrio Hierro and the port belong to the gangs. Walk in armed and expect an answer.',
]);

/**
 * Creates the loading screen controller.
 * @param {Object} [elements]
 * @param {HTMLElement | null} [elements.bar] The element whose width shows the progress.
 * @param {HTMLElement | null} [elements.status] The element that shows the status text.
 * @param {HTMLElement | null} [elements.percent] The element that shows the percentage.
 * @param {HTMLElement | null} [elements.tip] The element that shows a tip.
 * @returns {{fraction: number, label: string, tip: string, set: (fraction: number, label?: string) => void,
 *   stage: (from: number, to: number) => (fraction: number, label?: string) => void}}
 */
export function createLoadingScreen(elements = {}) {
  const bar = elements.bar ?? null;
  const status = elements.status ?? null;
  const percent = elements.percent ?? null;
  const tipElement = elements.tip ?? null;

  const screen = {
    /** Progress shown, 0 to 1. */
    fraction: 0,
    /** The status text shown. */
    label: '',
    /** The tip shown. */
    tip: '',
    set,
    stage,
  };
  showTip();

  /**
   * Shows progress.
   * @param {number} fraction 0 to 1; a smaller value than the one shown is ignored.
   * @param {string} [label] What is being done.
   */
  function set(fraction, label) {
    const clamped = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
    if (clamped > screen.fraction) screen.fraction = clamped;
    if (label) screen.label = label;
    const shown = Math.round(screen.fraction * 100);
    if (bar) bar.style.width = `${(screen.fraction * 100).toFixed(1)}%`;
    if (percent) percent.textContent = `${shown}%`;
    if (status) status.textContent = percent ? screen.label : `${screen.label} · ${shown}%`;
    showTip();
  }

  /** Shows the tip for the share of the bar reached. */
  function showTip() {
    const index = Math.min(LOADING_TIPS.length - 1, Math.floor(screen.fraction * LOADING_TIPS.length * 0.999));
    const tip = LOADING_TIPS[index];
    if (tip === screen.tip) return;
    screen.tip = tip;
    if (tipElement) tipElement.textContent = tip;
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
