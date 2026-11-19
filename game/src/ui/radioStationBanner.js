// The radio banner: when the car radio changes station (RADIO_STATION_CHANGED), the station's
// name appears at the top centre of the screen under a small "Radio" kicker with a tuner glyph,
// stays for a moment and fades; "Radio off" shows dimmed.
import { createHudElement, replayHudAnimation, setHudText } from './hudElements.js';

const SHOWN_SECONDS = 2.8;
const TUNER_MARKUP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2v-8a2 2 0 012-2z'
  + 'M6 3l12 4.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="8" cy="14" r="3" fill="currentColor"/>'
  + '<path d="M14 12h5M14 16h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

/**
 * Builds the radio banner inside the HUD.
 * @param {Document} document
 * @param {HTMLElement} hud `head-up-display`.
 */
export function createRadioStationBanner(document, hud) {
  const banner = createHudElement(document, 'div', 'hud-radio', hud);
  createHudElement(document, 'span', 'hud-radio-icon', banner, TUNER_MARKUP);
  const body = createHudElement(document, 'div', 'hud-radio-body', banner);
  createHudElement(document, 'span', 'hud-radio-kicker', body).textContent = 'Radio';
  const name = createHudElement(document, 'strong', 'hud-radio-name', body);
  let secondsLeft = 0;

  return {
    /**
     * Shows a station.
     * @param {string} stationName
     * @param {boolean} [off] The radio was switched off.
     */
    show(stationName, off = false) {
      setHudText(name, String(stationName ?? ''));
      banner.classList.toggle('is-off', Boolean(off));
      banner.classList.add('is-shown');
      replayHudAnimation(banner, 'is-tuned');
      secondsLeft = SHOWN_SECONDS;
    },
    /** @param {number} deltaSeconds */
    update(deltaSeconds) {
      if (secondsLeft <= 0) return;
      secondsLeft -= deltaSeconds;
      if (secondsLeft <= 0) banner.classList.remove('is-shown');
    },
  };
}
