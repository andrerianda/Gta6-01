// Notifications and key prompts in the top-left corner: short cards that slide in, stay for a
// few seconds and fade (at most three at once, the oldest leaving first), and one standing help
// prompt with its key, such as "F  Steal the car".
import { createHudElement, setHudText } from './hudElements.js';

const MOST_CARDS = 3;

/**
 * Builds the notification stack inside the HUD.
 * @param {Document} document
 * @param {HTMLElement} hud `head-up-display`; the stack is appended to it.
 */
export function createNotifications(document, hud) {
  const stack = createHudElement(document, 'div', 'hud-notifications', hud);
  const help = createHudElement(document, 'div', 'hud-help', stack);
  const helpKey = createHudElement(document, 'kbd', 'hud-help-key', help);
  const helpText = createHudElement(document, 'span', 'hud-help-text', help);
  help.hidden = true;
  /** @type {{element: HTMLElement, text: HTMLElement, secondsLeft: number}[]} */
  const cards = [];
  for (let i = 0; i < MOST_CARDS; i += 1) {
    const element = createHudElement(document, 'div', 'hud-note', stack);
    cards.push({ element, text: createHudElement(document, 'span', 'hud-note-text', element), secondsLeft: 0 });
  }

  return {
    /**
     * Posts a card.
     * @param {string} text
     * @param {string} [kind] 'info', 'money', 'warning', 'mission', 'unlock'.
     * @param {number} [seconds]
     */
    post(text, kind = 'info', seconds = 4.5) {
      let card = cards.find((entry) => entry.secondsLeft <= 0);
      if (!card) card = cards.reduce((oldest, entry) => (entry.secondsLeft < oldest.secondsLeft ? entry : oldest));
      setHudText(card.text, String(text ?? ''));
      card.element.dataset.kind = kind || 'info';
      card.secondsLeft = Number.isFinite(seconds) ? seconds : 4.5;
      stack.append(card.element);                                   // the newest at the bottom
      card.element.classList.add('is-shown');
    },
    /**
     * Shows or hides the standing help prompt.
     * @param {string|null} keyLabel The key, from controls.promptFor; null hides the prompt.
     * @param {string} [text]
     */
    setHelp(keyLabel, text) {
      help.hidden = !text;
      setHudText(helpKey, keyLabel ?? '');
      helpKey.hidden = !keyLabel;
      setHudText(helpText, text ?? '');
    },
    /** @param {number} deltaSeconds */
    update(deltaSeconds) {
      for (const card of cards) {
        if (card.secondsLeft <= 0) continue;
        card.secondsLeft -= deltaSeconds;
        if (card.secondsLeft <= 0) card.element.classList.remove('is-shown');
      }
    },
  };
}
