// The mission line of the HUD: the title of the mission in play over its current objective,
// with a countdown when the mission is timed, and the big "mission passed" and "mission failed"
// cards when it ends.
import { formatCash, formatTimer } from './hudFormatting.js';
import { createHudElement, replayHudAnimation, setHudText } from './hudElements.js';

/**
 * Builds the mission objective line and the result card.
 * @param {Document} document
 * @param {HTMLElement} container `hud-mission-objective`.
 * @param {HTMLElement} hud `head-up-display`, which receives the result card.
 */
export function createMissionObjective(document, container, hud) {
  container.classList.add('hud-objective');
  const title = createHudElement(document, 'span', 'hud-objective-title', container);
  const line = createHudElement(document, 'span', 'hud-objective-text', container);
  const timer = createHudElement(document, 'span', 'hud-objective-timer', container);
  const result = createHudElement(document, 'div', 'hud-mission-result', hud);
  const resultHeading = createHudElement(document, 'strong', 'hud-mission-result-heading', result);
  const resultDetail = createHudElement(document, 'span', 'hud-mission-result-detail', result);
  let resultSeconds = 0;
  container.hidden = true;
  timer.hidden = true;

  return {
    /**
     * A mission begins: its title at once, the objective when it comes. The end card of the
     * mission before (failed, abandoned or passed) goes at once, so it never sits over the new title.
     * A story mission's place in the story heads the title ("Mission 4/16 · Sparks Fly").
     * @param {string} missionTitle
     * @param {{order: number, total: number}|null} [number] The story order, when it is a story mission.
     */
    start(missionTitle, number = null) {
      result.classList.remove('is-shown');
      resultSeconds = 0;
      setHudText(title, missionHeading(missionTitle, number));
      setHudText(line, '');
      timer.hidden = true;
      container.hidden = false;
      replayHudAnimation(container, 'is-new');
    },
    /** @param {string} text The objective, one short sentence. */
    setObjective(text) {
      setHudText(line, text ?? '');
      container.hidden = !text;
      if (text) replayHudAnimation(container, 'is-new');
    },
    /** @param {number|null} secondsLeft null (or anything not a finite number) hides the timer. */
    setTimer(secondsLeft) {
      timer.hidden = typeof secondsLeft !== 'number' || !Number.isFinite(secondsLeft);
      if (!timer.hidden) {
        setHudText(timer, formatTimer(secondsLeft));
        timer.classList.toggle('is-urgent', secondsLeft <= 10);
      }
    },
    clear() {
      container.hidden = true;
      timer.hidden = true;
    },
    /**
     * Shows the end card of a mission.
     * @param {'passed'|'failed'} outcome
     * @param {string} missionTitle
     * @param {{cash?: number, reason?: string}} [details]
     */
    showResult(outcome, missionTitle, details = {}) {
      result.dataset.outcome = outcome;
      setHudText(resultHeading, outcome === 'passed' ? 'Mission passed' : 'Mission failed');
      setHudText(resultDetail, outcome === 'passed'
        ? `${missionTitle ?? ''}${details.cash ? `   ${formatCash(details.cash)}` : ''}`
        : details.reason ?? missionTitle ?? '');
      replayHudAnimation(result, 'is-shown');
      resultSeconds = 6;
    },
    /** @param {number} deltaSeconds */
    update(deltaSeconds) {
      if (resultSeconds <= 0) return;
      resultSeconds -= deltaSeconds;
      if (resultSeconds <= 0) result.classList.remove('is-shown');
    },
  };
}

/**
 * The objective's heading: the mission title, led by its story number when it has one.
 * @param {string} missionTitle
 * @param {{order: number, total: number}|null} number
 * @returns {string}
 */
export function missionHeading(missionTitle, number) {
  const name = missionTitle ?? '';
  if (!number || !(number.order > 0) || !(number.total >= number.order)) return name;
  return `Mission ${number.order}/${number.total}${name ? ` · ${name}` : ''}`;
}
