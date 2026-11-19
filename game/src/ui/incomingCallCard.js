// The missed call card. A call itself is shown by the handset (ui/incomingCalls.js); when one is
// declined or rings out (PHONE_CALL_ENDED 'declined' / 'missed'), this card slides in on the right
// under the cash with the caller's initial and name and the key that opens the phone, where the
// caller's line waits as a text; it stays a few seconds and slides out.
import { createHudElement, replayHudAnimation, setHudText } from './hudElements.js';

const SHOWN_SECONDS = 5;
const PHONE_MARKUP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 2.8l2.6-.6 1.9 4.6-2 1.6a12.5 12.5 0 006.5 6.5l1.6-2 4.6 1.9-.6 2.6'
  + 'a2.4 2.4 0 01-2.4 1.8C10.5 19 5 13.5 4.8 5.2a2.4 2.4 0 011.8-2.4z" fill="currentColor"/></svg>';

/**
 * Builds the call card inside the HUD.
 * @param {Document} document
 * @param {HTMLElement} hud `head-up-display`.
 */
export function createIncomingCallCard(document, hud) {
  const card = createHudElement(document, 'div', 'hud-call', hud);
  createHudElement(document, 'span', 'hud-call-ring', card, PHONE_MARKUP);
  const avatar = createHudElement(document, 'span', 'hud-call-avatar', card);
  const body = createHudElement(document, 'div', 'hud-call-body', card);
  createHudElement(document, 'span', 'hud-call-kicker', body).textContent = 'Missed call';
  const name = createHudElement(document, 'strong', 'hud-call-name', body);
  const prompt = createHudElement(document, 'span', 'hud-call-prompt', body);
  const key = createHudElement(document, 'kbd', 'hud-call-key', prompt);
  createHudElement(document, 'span', 'hud-call-action', prompt).textContent = 'Open phone';
  let secondsLeft = 0;

  return {
    /**
     * Shows a call.
     * @param {string} callerName
     * @param {string} [keyLabel] The phone key, from controls.promptFor('openPhone').
     */
    show(callerName, keyLabel = 'T') {
      const caller = String(callerName || 'Unknown');
      setHudText(name, caller);
      setHudText(avatar, caller.charAt(0).toUpperCase());
      setHudText(key, keyLabel || 'T');
      card.classList.add('is-shown');
      replayHudAnimation(card, 'is-ringing');
      secondsLeft = SHOWN_SECONDS;
    },
    /** @param {number} deltaSeconds */
    update(deltaSeconds) {
      if (secondsLeft <= 0) return;
      secondsLeft -= deltaSeconds;
      if (secondsLeft <= 0) card.classList.remove('is-shown', 'is-ringing');
    },
  };
}
