// The wanted stars of the HUD: five stars beside the minimap, lit up to the wanted level. A star
// that lights pops; while the police search for a player they have lost, the lit stars blink;
// with no wanted level the row fades away.
import { createHudElement, replayHudAnimation } from './hudElements.js';
import { STAR_ICON } from './hudIcons.js';

/**
 * Builds the wanted stars in their container.
 * @param {Document} document
 * @param {HTMLElement} container `hud-wanted-stars`.
 * @param {number} [maximum] Stars in the row.
 */
export function createWantedStars(document, container, maximum = 5) {
  container.classList.add('hud-wanted');
  const stars = [];
  for (let i = 0; i < maximum; i += 1) stars.push(createHudElement(document, 'span', 'hud-star', container, STAR_ICON));
  let level = 0;
  container.dataset.level = '0';

  return {
    /** @returns {number} */
    get level() { return level; },
    /**
     * Lights the stars up to `next`.
     * @param {number} next 0..maximum.
     */
    setLevel(next) {
      const clamped = Math.max(0, Math.min(maximum, Math.round(next) || 0));
      for (let i = 0; i < maximum; i += 1) {
        stars[i].classList.toggle('is-lit', i < clamped);
        if (i >= level && i < clamped) replayHudAnimation(stars[i], 'is-new');
      }
      level = clamped;
      container.dataset.level = String(level);
      if (level === 0) container.classList.remove('is-searching');
    },
    /**
     * Blinks the lit stars while the police search for the player.
     * @param {boolean} searching
     */
    setSearching(searching) {
      container.classList.toggle('is-searching', Boolean(searching) && level > 0);
    },
  };
}
