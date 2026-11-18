// The weapon panel of the HUD: the silhouette and name of the weapon in hand and its ammunition
// (rounds in the magazine over the reserve). It brightens when the weapon changes and the
// magazine count turns coral when it runs low.
import { formatAmmunition } from './hudFormatting.js';
import { createHudElement, replayHudAnimation, setHudText } from './hudElements.js';
import { weaponIconFor } from './weaponIcons.js';

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
        weaponId = id;
        icon.innerHTML = weaponIconFor(id, weapon?.class);
        setHudText(name, weapon?.name ?? id);
        container.dataset.weaponClass = weapon?.class ?? 'unarmed';
        replayHudAnimation(container, 'is-changed');
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
  };
  panel.equip('fists');
  return panel;
}
