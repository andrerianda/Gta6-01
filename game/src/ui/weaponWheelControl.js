// The weapon wheel's behaviour: holding Tab (action `weaponWheel`) in play opens the wheel over
// the slowed world, the mouse points at a slot (its movement no longer turns the camera, a click
// no longer fires), the mouse wheel steps through the weapons of that slot, and letting go of Tab
// (or a click) puts the chosen weapon in the lead's hand through combat's inventory. Combat then
// announces it (WEAPON_EQUIPPED) as for any switch.
import { createWeaponWheel } from './weaponWheel.js';
import {
  cycleWeaponInSlot, orderedWheelSlots, ownedWeaponsOfSlot, shownWeaponOfSlot, wheelSlotAt,
} from './weaponWheelLayout.js';

const WHEEL_ACTION = 'weaponWheel';
const SLOW_MOTION = 0.2;           // the world's pace while the wheel is open
const DEAD_ZONE = 22;              // pixels of mouse travel before a slot is chosen
const REACH = 160;                 // the pointer offset is held within this radius (pointer lock)

/**
 * Creates the wheel and its control.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {HTMLElement} hud The HUD root.
 * @param {{slots?: object, catalog?: object}} weapons WEAPON_WHEEL_SLOTS and WEAPON_CATALOG.
 */
export function createWeaponWheelControl(context, hud, weapons) {
  const { input, page, simulation, state, systems } = context;
  const ordered = orderedWheelSlots(weapons.slots);
  const catalog = weapons.catalog ?? {};
  const wheel = createWeaponWheel(page.document, hud, ordered, catalog);
  const win = page.document.defaultView;
  const picked = {};               // slot id -> the weapon it showed last
  const owned = {};                // slot id -> the lead's weapons in it, while open
  const pointer = { x: 0, y: 0 };
  let selected = null;
  let inventory = null;
  let open = false;
  let latched = false;

  const rounds = (weaponId) => {
    const record = inventory?.owned?.get(weaponId);
    return record && catalog[weaponId]?.magazine != null ? record : null;
  };
  const equippedId = () => (inventory?.state?.holstered ? 'fists' : inventory?.state?.equippedId ?? 'fists');

  function drawSlot(slotId) {
    const shown = picked[slotId] ?? null;
    wheel.setSlot(slotId, owned[slotId], shown, rounds(shown));
  }

  function point(x, y) {
    const length = Math.hypot(x, y);
    const k = length > REACH ? REACH / length : 1;
    pointer.x = x * k;
    pointer.y = y * k;
    const slotId = wheelSlotAt(pointer.x, pointer.y, ordered, DEAD_ZONE);
    if (slotId && slotId !== selected) {
      selected = slotId;
      wheel.select(slotId, owned[slotId], picked[slotId] ?? null, rounds(picked[slotId]));
    }
  }

  const onMove = (event) => {
    event.stopPropagation();
    if (page.document.pointerLockElement) point(pointer.x + event.movementX, pointer.y + event.movementY);
    else point(event.clientX - win.innerWidth / 2, event.clientY - win.innerHeight / 2);
  };
  const onWheel = (event) => {
    event.stopPropagation();
    event.preventDefault();
    if (!selected || event.deltaY === 0) return;
    picked[selected] = cycleWeaponInSlot(owned[selected], picked[selected], event.deltaY > 0 ? 1 : -1);
    drawSlot(selected);
  };
  const onDown = (event) => {
    event.stopPropagation();
    event.preventDefault();
    if (event.button !== 0) return;
    closeWheel(true);
    latched = true;                // Tab is still down: stay closed until it is let go
  };
  const listeners = [['mousemove', onMove], ['wheel', onWheel], ['mousedown', onDown]];

  function openWheel() {
    inventory = systems.find('combat')?.inventory ?? null;
    if (!inventory) return;
    open = true;
    const owns = (id) => inventory.owned.has(id);
    selected = null;
    for (const slot of ordered) {
      owned[slot.id] = ownedWeaponsOfSlot(slot, owns);
      picked[slot.id] = shownWeaponOfSlot(owned[slot.id], equippedId(), picked[slot.id]);
      drawSlot(slot.id);
      if (owned[slot.id].includes(equippedId())) selected = slot.id;
    }
    pointer.x = 0; pointer.y = 0;
    wheel.select(selected, owned[selected] ?? [], picked[selected] ?? null, rounds(picked[selected]));
    wheel.open();
    simulation.slowMotion = SLOW_MOTION;
    for (const [type, handler] of listeners) win.addEventListener(type, handler, { capture: true, passive: false });
  }

  function closeWheel(apply) {
    if (!open) return;
    open = false;
    for (const [type, handler] of listeners) win.removeEventListener(type, handler, { capture: true });
    wheel.close();
    if (simulation.slowMotion === SLOW_MOTION) simulation.slowMotion = 1;
    const choice = selected ? picked[selected] : null;
    if (!apply || !choice || choice === equippedId()) return;
    if (inventory.owned.has(choice)) inventory.equip(choice);
    else if (choice === 'fists' && !inventory.state.holstered) inventory.toggleHolster();
  }

  return {
    get isOpen() { return open; },
    /**
     * Moves the pointer (for scripts and tests): an offset from the centre in pixels.
     * @param {number} x @param {number} y
     */
    point(x, y) { if (open) point(x, y); },
    /** Per frame: opens while the action is held in play, applies the choice on release. */
    update() {
      const playing = state.is('playing');
      const wanted = playing && input.held(WHEEL_ACTION);
      if (!wanted) latched = false;
      if (wanted && !open && !latched) openWheel();
      else if (!wanted && open) closeWheel(playing);
    },
    dispose() { closeWheel(false); },
  };
}
