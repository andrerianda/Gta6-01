// The speedometer, shown while the player drives: the speed in large figures with its unit over
// a sweeping arc that fills toward the top of the dial (a third of the arc at 80 km/h, all of it
// at 240) and warms from cream to coral as it fills.
import { formatSpeed } from './hudFormatting.js';
import { createHudElement, setHudText } from './hudElements.js';

const ARC_LENGTH = 188.5;              // 3/4 of a circle of radius 40, the dial's sweep
const FULL_SCALE_METRES_PER_SECOND = 66.7;

/**
 * Builds the speedometer.
 * @param {Document} document
 * @param {HTMLElement} container `hud-speedometer`.
 */
export function createSpeedometer(document, container) {
  container.classList.add('hud-speed');
  createHudElement(document, 'span', 'hud-speed-dial', container,
    '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="hud-speed-track" cx="50" cy="50" r="40" />'
    + '<circle class="hud-speed-arc" cx="50" cy="50" r="40" /></svg>');
  const arc = /** @type {SVGCircleElement} */ (container.querySelector('.hud-speed-arc'));
  const value = createHudElement(document, 'span', 'hud-speed-value', container);
  const unitLabel = createHudElement(document, 'span', 'hud-speed-unit', container);
  let shownValue = -1;
  let visible = false;
  container.hidden = true;

  return {
    /** @param {boolean} on */
    setVisible(on) {
      visible = Boolean(on);
      container.hidden = !visible;
    },
    /**
     * @param {number} metresPerSecond
     * @param {'kmh'|'mph'} unit
     */
    update(metresPerSecond, unit) {
      if (!visible) return;
      const speed = formatSpeed(metresPerSecond, unit);
      if (speed.value === shownValue) return;
      shownValue = speed.value;
      setHudText(value, speed.text);
      setHudText(unitLabel, speed.unit);
      const fraction = Math.min(1, Math.abs(metresPerSecond) / FULL_SCALE_METRES_PER_SECOND);
      arc.style.strokeDasharray = `${(fraction * ARC_LENGTH).toFixed(1)} 400`;
      container.classList.toggle('is-fast', fraction > 0.7);
    },
  };
}
