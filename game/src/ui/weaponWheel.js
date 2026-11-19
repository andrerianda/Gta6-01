// The weapon wheel's picture: a ring of eight wedges over the blurred, slowed city, each with the
// silhouette of the weapon it holds and its rounds, the wedge under the mouse lit in gold, and in
// the middle the chosen weapon's slot, name, ammunition and a hint when the slot holds several.
// It only draws what weaponWheelControl.js tells it; the backdrop blur is CSS (hud.css).
import { formatAmmunition } from './hudFormatting.js';
import { createHudElement, setHudText } from './hudElements.js';
import { weaponIconFor } from './weaponIcons.js';
import { wedgePath } from './weaponWheelLayout.js';

const INNER = 47;          // ring radii in the dial's frame (-100 .. 100)
const OUTER = 99;
const ITEM_RADIUS = 73;
const GAP_DEGREES = 2.2;

/**
 * The text of a weapon's rounds for the wheel: "14 / 42", a count for thrown weapons ("3"), or
 * '' for melee.
 * @param {{magazine: number|null, reserve: number|null}|null} rounds
 * @param {{class?: string}} [weapon] Its catalog entry.
 */
function roundsText(rounds, weapon) {
  if (!rounds) return '';
  if (weapon?.class === 'thrown') return String(Math.max(0, (rounds.magazine ?? 0) + (rounds.reserve ?? 0)));
  const { magazine, reserve } = formatAmmunition(rounds.magazine, rounds.reserve);
  return reserve ? `${magazine} / ${reserve}` : magazine;
}

/**
 * Builds the wheel (hidden).
 * @param {Document} document
 * @param {HTMLElement} hud The HUD root, which receives the wheel.
 * @param {Array<{id: string, label: string, angleDegrees: number, weapons: string[]}>} ordered
 * @param {Record<string, {name: string, class: string}>} catalog WEAPON_CATALOG.
 */
export function createWeaponWheel(document, hud, ordered, catalog) {
  const root = createHudElement(document, 'div', 'hud-wheel', hud);
  root.hidden = true;
  const dial = createHudElement(document, 'div', 'hud-wheel-dial', root);
  const span = ordered.length > 0 ? 360 / ordered.length : 45;
  dial.innerHTML = `<svg class="hud-wheel-ring" viewBox="-100 -100 200 200" aria-hidden="true">${ordered.map((slot) =>
    `<path class="hud-wheel-wedge" data-slot="${slot.id}" d="${wedgePath(slot.angleDegrees, span - GAP_DEGREES, INNER, OUTER)}"/>`).join('')
  }<circle class="hud-wheel-hub" r="${INNER - 3}"/></svg>`;
  const wedges = new Map();
  for (const path of dial.querySelectorAll('.hud-wheel-wedge')) wedges.set(path.getAttribute('data-slot'), path);
  const items = new Map();
  for (const slot of ordered) {
    const item = createHudElement(document, 'div', 'hud-wheel-item', dial);
    const radians = (slot.angleDegrees * Math.PI) / 180;
    item.style.left = `${50 + (Math.sin(radians) * ITEM_RADIUS) / 2}%`;
    item.style.top = `${50 - (Math.cos(radians) * ITEM_RADIUS) / 2}%`;
    items.set(slot.id, {
      element: item,
      icon: createHudElement(document, 'span', 'hud-wheel-icon', item),
      rounds: createHudElement(document, 'span', 'hud-wheel-rounds', item),
      count: createHudElement(document, 'span', 'hud-wheel-count', item),
      shownId: '',
    });
  }
  const centre = createHudElement(document, 'div', 'hud-wheel-centre', dial);
  const label = createHudElement(document, 'small', 'hud-wheel-label', centre);
  const name = createHudElement(document, 'strong', 'hud-wheel-name', centre);
  const rounds = createHudElement(document, 'span', 'hud-wheel-ammo', centre);
  const hint = createHudElement(document, 'em', 'hud-wheel-hint', centre);
  let selected = null;

  return {
    get isOpen() { return !root.hidden; },
    /** Shows the wheel. */
    open() { root.hidden = false; },
    /** Hides it. */
    close() { root.hidden = true; },
    /**
     * Draws one slot.
     * @param {string} slotId
     * @param {string[]} owned The slot's weapons the lead has.
     * @param {string|null} shownId The weapon the slot shows.
     * @param {{magazine: number|null, reserve: number|null}|null} shownRounds
     */
    setSlot(slotId, owned, shownId, shownRounds) {
      const item = items.get(slotId);
      if (!item) return;
      const slot = ordered.find((entry) => entry.id === slotId);
      const iconId = shownId ?? slot?.weapons[0] ?? 'fists';
      if (item.shownId !== iconId) {
        item.shownId = iconId;
        item.icon.innerHTML = weaponIconFor(iconId, catalog[iconId]?.class);
      }
      item.element.classList.toggle('is-empty', !shownId);
      setHudText(item.rounds, shownId ? roundsText(shownRounds, catalog[shownId]) : '');
      setHudText(item.count, owned.length > 1 ? `${owned.indexOf(shownId) + 1}/${owned.length}` : '');
      if (slotId === selected) this.select(slotId, owned, shownId, shownRounds);
    },
    /**
     * Lights a slot and writes the centre.
     * @param {string|null} slotId
     * @param {string[]} owned
     * @param {string|null} shownId
     * @param {{magazine: number|null, reserve: number|null}|null} shownRounds
     */
    select(slotId, owned = [], shownId = null, shownRounds = null) {
      if (selected !== slotId) {
        if (selected) { wedges.get(selected)?.classList.remove('is-selected'); items.get(selected)?.element.classList.remove('is-selected'); }
        selected = slotId;
        if (selected) { wedges.get(selected)?.classList.add('is-selected'); items.get(selected)?.element.classList.add('is-selected'); }
      }
      const slot = ordered.find((entry) => entry.id === slotId);
      setHudText(label, slot?.label ?? '');
      setHudText(name, shownId ? catalog[shownId]?.name ?? shownId : slot ? 'Empty' : '');
      setHudText(rounds, shownId ? roundsText(shownRounds, catalog[shownId]) : '');
      setHudText(hint, owned.length > 1 ? 'Scroll to switch' : '');
    },
  };
}
