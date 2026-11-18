// The location banner: when the player enters another district its name sweeps in large in the
// corner, with the street beneath it, and fades after a few seconds; a change of street alone
// shows the street line briefly.
import { createHudElement, replayHudAnimation, setHudText } from './hudElements.js';
import { displayNameFromId } from './hudFormatting.js';

/** A catalog id ("barrio_hierro") is shown as a name ("Barrio Hierro"); names pass unchanged. */
const readable = (name) => (/^[a-z0-9]+(_[a-z0-9]+)*$/.test(name ?? '') ? displayNameFromId(name) : name ?? '');

/**
 * Builds the district and street banner.
 * @param {Document} document
 * @param {HTMLElement} container `hud-location-name`.
 */
export function createLocationBanner(document, container) {
  container.classList.add('hud-location');
  const district = createHudElement(document, 'span', 'hud-location-district', container);
  const street = createHudElement(document, 'span', 'hud-location-street', container);
  let secondsLeft = 0;

  const show = (seconds) => {
    secondsLeft = seconds;
    replayHudAnimation(container, 'is-shown');
  };

  return {
    /**
     * A new district: the full banner.
     * @param {string} name
     * @param {string} [streetName]
     */
    setDistrict(name, streetName) {
      setHudText(district, readable(name));
      if (streetName) setHudText(street, streetName);
      container.classList.remove('is-street-only');
      show(6);
    },
    /** @param {string} name A new street within the district. */
    setStreet(name) {
      if (!name || street.textContent === name) return;
      setHudText(street, name);
      if (secondsLeft > 0) return;
      container.classList.add('is-street-only');
      show(3.5);
    },
    /** @param {number} deltaSeconds */
    update(deltaSeconds) {
      if (secondsLeft <= 0) return;
      secondsLeft -= deltaSeconds;
      if (secondsLeft <= 0) container.classList.remove('is-shown');
    },
  };
}
