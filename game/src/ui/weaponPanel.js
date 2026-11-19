// The weapon panel of the HUD: the silhouette and name of the weapon in hand and its ammunition
// (rounds in the magazine over the reserve). It brightens when the weapon changes and the
// magazine count turns coral when it runs low. Unarmed (fists) it stays out of the picture: a
// change of weapon fades it in for CHANGE_SHOW_SECONDS (so a switch to fists still reads), and it
// stays while a weapon is held. In a vehicle it fades out unless the weapon in hand can be fired
// from the seat (`is-drive-by`). Classes `is-unarmed` and `is-recent` are styled in hud.css.
import { formatAmmunition } from './hudFormatting.js';
import { createHudElement, replayHudAnimation, setHudText } from './hudElements.js';
import { weaponIconFor } from './weaponIcons.js';

/** How long the panel shows after a change of weapon, in seconds, before an unarmed one fades. */
export const CHANGE_SHOW_SECONDS = 3;

/**
 * Builds the weapon panel.
 * @param {Document} document
 * @param {HTMLElement} container `hud-weapon-and-ammunition`.
 * @param {Record<string, {name: string, class: string, magazine: number|null}>} weapons The
 *   weapon catalog (WEAPON_CATALOG), or an empty object while it is missing.
 */
export function createWeaponPanel(document, container, weapons) {
  container.classList.add('hud-weapon');
  const icon = createHudElement(document, 'span', 'hud-weapon-icon', container);
  const text = createHudElement(document, 'span', 'hud-weapon-text', container);
  const name = createHudElement(document, 'span', 'hud-weapon-name', text);
  const ammo = createHudElement(document, 'span', 'hud-weapon-ammo', text);
  const magazine = createHudElement(document, 'b', 'hud-weapon-magazine', ammo);
  const reserve = createHudElement(document, 'span', 'hud-weapon-reserve', ammo);
  let weaponId = '';
  let capacity = 0;
  let recentSeconds = 0;

  const panel = {
    /**
     * Shows the weapon in hand.
     * @param {string} id Weapon catalog id.
     * @param {number|null} [rounds] Rounds in the magazine.
     * @param {number|null} [carried] Reserve rounds.
     */
    equip(id, rounds = null, carried = null) {
      const weapon = weapons[id];
      if (id !== weaponId) {
        const first = weaponId === '';
        weaponId = id;
        icon.innerHTML = weaponIconFor(id, weapon?.class);
        setHudText(name, weapon?.name ?? id);
        container.dataset.weaponClass = weapon?.class ?? 'unarmed';
        container.classList.toggle('is-unarmed', id === 'fists' || (weapon?.class ?? 'unarmed') === 'unarmed');
        container.classList.toggle('is-drive-by', weapon?.driveBy === true);
        // The lead starts unarmed: no card at the start, only after a real change.
        if (!first) {
          recentSeconds = CHANGE_SHOW_SECONDS;
          container.classList.add('is-recent');
          replayHudAnimation(container, 'is-changed');
        }
      }
      capacity = weapon?.magazine ?? 0;
      panel.setAmmunition(weapon?.magazine === null ? null : rounds, carried);
    },
    /**
     * @param {number|null} rounds
     * @param {number|null} carried
     */
    setAmmunition(rounds, carried) {
      const formatted = formatAmmunition(rounds, carried);
      setHudText(magazine, formatted.magazine);
      setHudText(reserve, formatted.reserve);
      ammo.hidden = formatted.magazine === '';
      container.classList.toggle('is-low', capacity > 0 && Number.isFinite(rounds) && rounds <= Math.max(1, capacity * 0.2));
    },
    /** @param {number} deltaSeconds Ends the after-change showing. */
    update(deltaSeconds) {
      if (recentSeconds <= 0) return;
      recentSeconds -= deltaSeconds;
      if (recentSeconds <= 0) container.classList.remove('is-recent');
    },
  };
  panel.equip('fists');
  return panel;
}
