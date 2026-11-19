// Subtitles: the line being spoken at the bottom of the screen, the speaker's name in the warm
// accent colour, on a soft dark band that keeps it legible over sky and street alike. A line
// stays for its own duration (or a time derived from its length) and then fades.
import { createHudElement, setHudText } from './hudElements.js';

/**
 * Builds the subtitle line.
 * @param {Document} document
 * @param {HTMLElement} container `hud-subtitles`.
 */
export function createSubtitles(document, container) {
  container.classList.add('hud-subtitles');
  const speaker = createHudElement(document, 'span', 'hud-subtitle-speaker', container);
  const words = createHudElement(document, 'span', 'hud-subtitle-text', container);
  let secondsLeft = 0;
  let enabled = true;

  return {
    /**
     * Shows a line.
     * @param {string|null|undefined} speakerName
     * @param {string} text
     * @param {number} [seconds] Defaults to about one second per 14 characters, at least 2.5.
     */
    show(speakerName, text, seconds) {
      setHudText(speaker, speakerName ? `${speakerName}:` : '');
      speaker.hidden = !speakerName;
      setHudText(words, text ?? '');
      secondsLeft = Number.isFinite(seconds) ? seconds : Math.max(2.5, String(text ?? '').length / 14);
      container.classList.toggle('is-shown', enabled && Boolean(text));
    },
    clear() {
      secondsLeft = 0;
      container.classList.remove('is-shown');
    },
    /** @param {boolean} on The gameplay.subtitles setting. */
    setEnabled(on) {
      enabled = on !== false;
      if (!enabled) container.classList.remove('is-shown');
    },
    /** @param {number} deltaSeconds */
    update(deltaSeconds) {
      if (secondsLeft <= 0) return;
      secondsLeft -= deltaSeconds;
      if (secondsLeft <= 0) container.classList.remove('is-shown');
    },
  };
}
