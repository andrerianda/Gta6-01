// The weapons someone carries and the state of the one in hand: which weapons are owned, the
// rounds in each magazine and in reserve, switching (next and previous in the catalog's order,
// or a wheel slot, cycling inside it), the trigger's cooldown from the fire rate, and reloading
// (a timed refill of the magazine from the reserve, started by hand or by pulling the trigger on
// an empty magazine). Fists are always owned. Pure rules, no engine: tools/tests/combat/.

/**
 * Creates an inventory.
 * @param {Record<string, object>} catalog WEAPON_CATALOG.
 * @param {readonly string[]} order WEAPON_ORDER: the order of switching.
 * @param {Record<string, {weapons: string[]}>} [slots] WEAPON_WHEEL_SLOTS.
 */
export function createWeaponInventory(catalog, order, slots = {}) {
  /** @type {Map<string, {weaponId: string, magazine: number, reserve: number}>} */
  const owned = new Map();
  const state = { equippedId: 'fists', cooldown: 0, reloadLeft: 0, holstered: false };

  const infinite = (weapon) => weapon.magazine === null || weapon.magazine === undefined;

  const inventory = {
    state,
    owned,
    /** The catalog entry of the weapon in hand (fists while holstered). */
    get weapon() { return catalog[state.holstered ? 'fists' : state.equippedId] ?? catalog.fists; },
    /** The record of the weapon in hand. */
    get record() { return owned.get(state.holstered ? 'fists' : state.equippedId); },
    get reloading() { return state.reloadLeft > 0; },
    has: (weaponId) => owned.has(weaponId),

    /**
     * Gives a weapon and rounds (a magazine's worth and two in reserve by default); a weapon
     * already owned only gains the rounds. Rounds fill the magazine first, then the reserve up to
     * its limit.
     * @returns {object | null} The record, or null for an unknown weapon.
     */
    give(weaponId, ammo) {
      const weapon = catalog[weaponId];
      if (!weapon) return null;
      let record = owned.get(weaponId);
      const fresh = !record;
      if (fresh) {
        record = { weaponId, magazine: 0, reserve: 0 };
        owned.set(weaponId, record);
      }
      if (!infinite(weapon)) {
        let rounds = typeof ammo === 'number' ? Math.max(0, Math.floor(ammo)) : weapon.magazine * 3;
        const intoMagazine = fresh ? Math.min(rounds, weapon.magazine) : 0;
        record.magazine += intoMagazine;
        rounds -= intoMagazine;
        record.reserve = Math.min(weapon.reserveMax ?? Infinity, record.reserve + rounds);
      }
      return record;
    },

    /** Puts a weapon in hand. Gives false for one not owned. Cancels a reload. */
    equip(weaponId) {
      if (!owned.has(weaponId)) return false;
      const changed = weaponId !== state.equippedId || state.holstered;
      state.equippedId = weaponId;
      state.holstered = false;
      state.reloadLeft = 0;
      if (changed) state.cooldown = Math.max(state.cooldown, 0.25);
      return true;
    },

    /** Holsters the weapon in hand (fists out), or draws it again. */
    toggleHolster() {
      state.holstered = !state.holstered && state.equippedId !== 'fists';
      state.reloadLeft = 0;
      return state.holstered;
    },

    /**
     * The next (direction 1) or previous (-1) owned weapon in the catalog's order.
     * @returns {string} The weapon now in hand.
     */
    cycle(direction) {
      const start = order.indexOf(state.equippedId);
      for (let step = 1; step <= order.length; step += 1) {
        const id = order[(start + direction * step + order.length * 2) % order.length];
        if (owned.has(id)) {
          inventory.equip(id);
          break;
        }
      }
      return state.equippedId;
    },

    /** Selects a wheel slot; pressing it again cycles inside it. Gives false when it is empty. */
    selectSlot(slotId) {
      const slot = slots[slotId];
      if (!slot) return false;
      const mine = slot.weapons.filter((id) => owned.has(id));
      if (mine.length === 0) return false;
      const at = mine.indexOf(state.equippedId);
      return inventory.equip(mine[(at + 1) % mine.length]);
    },

    /** Starts a reload; gives its length in seconds, or 0 when none is possible. */
    startReload() {
      const weapon = inventory.weapon, record = inventory.record;
      if (!record || infinite(weapon) || state.reloadLeft > 0) return 0;
      if (record.magazine >= weapon.magazine || record.reserve <= 0) return 0;
      state.reloadLeft = weapon.reloadSeconds;
      return state.reloadLeft;
    },

    /**
     * Pulls the trigger once: true when a shot (or swing) goes off, using a round. An empty
     * magazine starts a reload instead.
     */
    tryFire() {
      const weapon = inventory.weapon, record = inventory.record;
      if (!record || state.cooldown > 0 || state.reloadLeft > 0) return false;
      if (!infinite(weapon)) {
        if (record.magazine <= 0) {
          inventory.startReload();
          return false;
        }
        record.magazine -= 1;
      }
      state.cooldown = 1 / Math.max(0.05, weapon.fireRate);
      return true;
    },

    /**
     * Advances the timers.
     * @returns {boolean} True in the step a reload finished.
     */
    tick(seconds) {
      if (state.cooldown > 0) state.cooldown = Math.max(0, state.cooldown - seconds);
      if (state.reloadLeft <= 0) return false;
      state.reloadLeft -= seconds;
      if (state.reloadLeft > 0) return false;
      state.reloadLeft = 0;
      const weapon = inventory.weapon, record = inventory.record;
      const moved = Math.min(weapon.magazine - record.magazine, record.reserve);
      record.magazine += moved;
      record.reserve -= moved;
      return true;
    },

    /** Save data: { weapons: [{weaponId, magazine, reserve}], equippedWeaponId }. */
    serialise() {
      return { weapons: [...owned.values()].map((r) => ({ ...r })), equippedWeaponId: state.equippedId };
    },

    restore(data) {
      owned.clear();
      inventory.give('fists');
      for (const saved of data?.weapons ?? []) {
        if (!catalog[saved.weaponId]) continue;
        owned.set(saved.weaponId, { weaponId: saved.weaponId, magazine: saved.magazine | 0, reserve: saved.reserve | 0 });
      }
      state.equippedId = owned.has(data?.equippedWeaponId) ? data.equippedWeaponId : 'fists';
      state.reloadLeft = 0;
      state.holstered = false;
    },
  };
  inventory.give('fists');
  return inventory;
}
