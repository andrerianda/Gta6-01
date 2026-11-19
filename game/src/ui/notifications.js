// Notifications and key prompts in the top-left corner: short cards that slide in, stay for a
// few seconds and fade (at most three at once, the oldest leaving first), and one standing help
// prompt with its key, such as "F  Steal the car".
// While the lead flies (setFlying) the screen is kept clean: the corner is one notice slot, so a
// single card shows and the rest wait their turn in a short queue; and the help prompt becomes the
// flight's key hint in its own slot above the minimap: it shows for a few seconds after boarding
// (or until the first key), fades, and does not come back unless the player asks (recallHint, H).
import { createHudElement, setHudText } from './hudElements.js';

const MOST_CARDS = 3;
/** Seconds the key hint stays while flying, and how long its fade takes before it is taken out. */
export const FLIGHT_HINT_SECONDS = 8;
const HINT_FADE_SECONDS = 0.7;
/** A key pressed sooner than this after the hint appeared does not dismiss it (the key that boarded). */
const HINT_GRACE_SECONDS = 0.6;
/** While flying a card that others wait behind still gets this long, and the queue holds this many. */
export const NOTICE_MIN_SECONDS = 2.5;
export const NOTICE_QUEUE_LIMIT = 6;

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
  /** @type {{element: HTMLElement, text: HTMLElement, secondsLeft: number, age: number, value: string}[]} */
  const cards = [];
  for (let i = 0; i < MOST_CARDS; i += 1) {
    const element = createHudElement(document, 'div', 'hud-note', stack);
    cards.push({ element, text: createHudElement(document, 'span', 'hud-note-text', element), secondsLeft: 0, age: 0, value: '' });
  }
  /** @type {{text: string, kind: string, seconds: number}[]} */
  const queue = [];
  let flying = false;
  // The standing prompt as it was last asked for, and the flight hint's own clock.
  const asked = { key: null, text: '' };
  const hint = { text: '', key: null, secondsLeft: 0, age: 0, fade: 0, seen: '' };

  function show(card, text, kind, seconds) {
    card.value = String(text ?? '');
    setHudText(card.text, card.value);
    card.element.dataset.kind = kind || 'info';
    card.secondsLeft = Number.isFinite(seconds) ? seconds : 4.5;
    card.age = 0;
    stack.append(card.element);                                   // the newest at the bottom
    card.element.classList.add('is-shown');
  }

  function showHelp(keyLabel, text) {
    help.hidden = !text;
    setHudText(helpKey, keyLabel ?? '');
    helpKey.hidden = !keyLabel;
    setHudText(helpText, text ?? '');
  }

  function showHint(keyLabel, text) {
    hint.text = text;
    hint.key = keyLabel ?? null;
    hint.seen = text;
    hint.secondsLeft = FLIGHT_HINT_SECONDS;
    hint.age = 0;
    hint.fade = 0;
    showHelp(keyLabel, text);
    help.classList.add('is-flight', 'is-shown');
  }

  function fadeHint() {
    if (hint.secondsLeft <= 0) return;
    hint.secondsLeft = 0;
    hint.fade = HINT_FADE_SECONDS;
    help.classList.remove('is-shown');
  }

  return {
    /**
     * Posts a card. While flying one card shows at a time: a second one waits in the queue (and the
     * card on screen makes room once it has had NOTICE_MIN_SECONDS); a repeat of a waiting text is dropped.
     * @param {string} text
     * @param {string} [kind] 'info', 'money', 'warning', 'mission', 'unlock'.
     * @param {number} [seconds]
     */
    post(text, kind = 'info', seconds = 4.5) {
      const value = String(text ?? '');
      if (flying) {
        const shown = cards.find((entry) => entry.secondsLeft > 0);
        if (shown) {
          if (shown.value === value || queue.some((entry) => entry.text === value)) return;
          if (queue.length >= NOTICE_QUEUE_LIMIT) queue.shift();
          queue.push({ text: value, kind, seconds });
          shown.secondsLeft = Math.min(shown.secondsLeft, Math.max(0.05, NOTICE_MIN_SECONDS - shown.age));
          return;
        }
      }
      let card = cards.find((entry) => entry.secondsLeft <= 0);
      if (!card) card = cards.reduce((oldest, entry) => (entry.secondsLeft < oldest.secondsLeft ? entry : oldest));
      show(card, value, kind, seconds);
    },
    /**
     * Shows or hides the standing help prompt. While flying a prompt is the key hint: a new text
     * shows once for FLIGHT_HINT_SECONDS; the same text again does nothing; null takes it down.
     * @param {string|null} keyLabel The key, from controls.promptFor; null hides the prompt.
     * @param {string} [text]
     */
    setHelp(keyLabel, text) {
      asked.key = keyLabel ?? null;
      asked.text = text ?? '';
      if (!flying) { showHelp(keyLabel, text); return; }
      if (!text) fadeHint();
      else if (text !== hint.seen) showHint(keyLabel, text);
    },
    /**
     * The lead took or left an airplane's controls: one notice at a time and the brief key hint.
     * @param {boolean} on
     */
    setFlying(on) {
      const next = Boolean(on);
      if (next === flying) return;
      flying = next;
      stack.classList.toggle('is-flight', flying);
      if (flying) {
        // The cards on screen: the newest stays, the others queue behind it.
        const shown = cards.filter((entry) => entry.secondsLeft > 0).sort((a, b) => a.age - b.age);
        for (let i = 1; i < shown.length; i += 1) {
          queue.push({ text: shown[i].value, kind: shown[i].element.dataset.kind, seconds: shown[i].secondsLeft });
          shown[i].secondsLeft = 0;
          shown[i].element.classList.remove('is-shown');
        }
        hint.seen = '';
        if (asked.text) showHint(asked.key, asked.text);
      } else {
        hint.text = hint.seen = '';
        hint.secondsLeft = hint.fade = 0;
        help.classList.remove('is-flight', 'is-shown');
        showHelp(asked.key, asked.text);
        while (queue.length > 0) {
          const next = queue.shift();
          const card = cards.find((entry) => entry.secondsLeft <= 0);
          if (card) show(card, next.text, next.kind, next.seconds);
        }
      }
    },
    /** The first key after boarding: the hint leaves (not within the grace of the key that boarded). */
    dismissHint() {
      if (flying && hint.secondsLeft > 0 && hint.age >= HINT_GRACE_SECONDS) fadeHint();
    },
    /** The player asks for the keys (H): the last hint again for its seconds, or away if it is up. */
    recallHint() {
      if (!flying || !hint.text) return;
      if (hint.secondsLeft > 0) fadeHint();
      else showHint(hint.key, hint.text);
    },
    /** True while the flight hint is on screen (fading counts until it is taken out). */
    get hintShown() { return flying && !help.hidden; },
    /** How many notices wait behind the one on screen. */
    get waiting() { return queue.length; },
    /** @param {number} deltaSeconds */
    update(deltaSeconds) {
      let shown = false;
      for (const card of cards) {
        if (card.secondsLeft <= 0) continue;
        card.secondsLeft -= deltaSeconds;
        card.age += deltaSeconds;
        if (card.secondsLeft <= 0) card.element.classList.remove('is-shown');
        else shown = true;
      }
      if (flying && !shown && queue.length > 0) {
        const next = queue.shift();
        show(cards[0], next.text, next.kind, next.seconds);
      }
      if (hint.secondsLeft > 0) {
        hint.age += deltaSeconds;
        hint.secondsLeft -= deltaSeconds;
        if (hint.secondsLeft <= 0) {
          hint.secondsLeft = 0.001;
          fadeHint();
        }
      } else if (hint.fade > 0) {
        hint.fade -= deltaSeconds;
        if (hint.fade <= 0 && flying) help.hidden = true;
      }
    },
  };
}
