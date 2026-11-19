// The geometry and choices of the weapon wheel, pure: which slot the mouse points at (eight slots
// clockwise from the top, from WEAPON_WHEEL_SLOTS), the weapons a slot offers from the lead's
// inventory, the one it shows, and the SVG outline of a slot's wedge. No DOM.

/**
 * The slots in wheel order.
 * @param {Record<string, {id: string, index: number, angleDegrees: number, label: string, weapons: string[]}>} slots
 * @returns {Array<{id: string, index: number, angleDegrees: number, label: string, weapons: string[]}>}
 */
export function orderedWheelSlots(slots) {
  return Object.values(slots ?? {}).sort((a, b) => a.index - b.index);
}

/**
 * The compass angle of a pointer offset on screen: 0 straight up, growing clockwise, in degrees
 * within [0, 360).
 * @param {number} dx Right of the centre.
 * @param {number} dy Below the centre.
 */
export function wheelAngleOf(dx, dy) {
  const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return degrees < 0 ? degrees + 360 : degrees;
}

/**
 * The slot the pointer offset points at, or null inside the dead zone.
 * @param {number} dx
 * @param {number} dy
 * @param {Array<{id: string, angleDegrees: number}>} ordered orderedWheelSlots().
 * @param {number} deadZone Offsets shorter than this choose nothing.
 * @returns {string|null}
 */
export function wheelSlotAt(dx, dy, ordered, deadZone) {
  if (ordered.length === 0 || Math.hypot(dx, dy) < deadZone) return null;
  const angle = wheelAngleOf(dx, dy);
  let best = null;
  let bestGap = Infinity;
  for (const slot of ordered) {
    let gap = Math.abs(angle - slot.angleDegrees) % 360;
    if (gap > 180) gap = 360 - gap;
    if (gap < bestGap) { bestGap = gap; best = slot.id; }
  }
  return best;
}

/**
 * The weapons of a slot the lead owns. Fists are always there.
 * @param {{weapons: string[]}} slot
 * @param {(weaponId: string) => boolean} owns
 * @returns {string[]}
 */
export function ownedWeaponsOfSlot(slot, owns) {
  return slot.weapons.filter((id) => id === 'fists' || owns(id));
}

/**
 * The weapon a slot shows: the one in hand when it is in the slot, else the one picked last.
 * @param {string[]} owned ownedWeaponsOfSlot().
 * @param {string} equippedId
 * @param {string|undefined} pickedId The weapon last shown in this slot.
 * @returns {string|null}
 */
export function shownWeaponOfSlot(owned, equippedId, pickedId) {
  if (owned.length === 0) return null;
  if (owned.includes(equippedId)) return equippedId;
  return pickedId && owned.includes(pickedId) ? pickedId : owned[0];
}

/**
 * Steps through a slot's weapons (the mouse wheel over the wheel).
 * @param {string[]} owned
 * @param {string|null} shownId
 * @param {number} step +1 or -1.
 */
export function cycleWeaponInSlot(owned, shownId, step) {
  if (owned.length === 0) return null;
  const at = Math.max(0, owned.indexOf(shownId));
  return owned[(at + step + owned.length * 4) % owned.length];
}

/**
 * The outline of a wedge of the ring, in a frame centred on the wheel (y down).
 * @param {number} centreDegrees The slot's angle (0 up, clockwise).
 * @param {number} spanDegrees The wedge's width.
 * @param {number} inner Inner radius.
 * @param {number} outer Outer radius.
 * @returns {string} An SVG path.
 */
export function wedgePath(centreDegrees, spanDegrees, inner, outer) {
  const at = (degrees, radius) => {
    const radians = (degrees * Math.PI) / 180;
    return `${(Math.sin(radians) * radius).toFixed(2)} ${(-Math.cos(radians) * radius).toFixed(2)}`;
  };
  const from = centreDegrees - spanDegrees / 2;
  const to = centreDegrees + spanDegrees / 2;
  const large = spanDegrees > 180 ? 1 : 0;
  return `M${at(from, outer)}A${outer} ${outer} 0 ${large} 1 ${at(to, outer)}L${at(to, inner)}A${inner} ${inner} 0 ${large} 0 ${at(from, inner)}Z`;
}
