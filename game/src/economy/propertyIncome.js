// The properties the leads own and the income they earn: buying (price, cash, the mission that
// hands a property over), the daily income of each business that waits at the property for up
// to PROPERTY_RULES.incomeAccumulatesDays days, raised by rank perks, and collecting it by
// walking into the property's marker. Pure, tested in Node (tools/tests/economy-save/).

/** Income perks of catalog/progressionRanks.js (rank 6: +10 percent; rank 8: a further 10). */
export const INCOME_RANK_PERKS = Object.freeze([{ rank: 6, bonus: 0.1 }, { rank: 8, bonus: 0.1 }]);

/** The multiplier of property income at a rank. */
export function incomeMultiplierAt(rank) {
  let multiplier = 1;
  for (const perk of INCOME_RANK_PERKS) if (rank >= perk.rank) multiplier += perk.bonus;
  return Math.round(multiplier * 100) / 100;
}

/**
 * Creates the property book.
 * @param {Readonly<Record<string, object>>} properties PROPERTIES_FOR_SALE.
 * @param {{incomeAccumulatesDays: number}} rules PROPERTY_RULES.
 */
export function createPropertyBook(properties, rules) {
  const owned = new Set();
  /** propertyId -> dollars waiting at the property. */
  const pending = {};

  const book = {
    owned,
    pending,
    /** The last in-game day income was paid for. */
    lastIncomeDay: 0,

    isOwned: (propertyId) => owned.has(propertyId),

    /**
     * Whether a property can be bought now.
     * @param {string} propertyId
     * @param {{cash: number, completedMissions?: (missionId: string) => boolean}} situation
     * @returns {{ok: boolean, reason: string, price: number}} reason: '', 'owned', 'unknown',
     *   'handed over by a mission' (price 0), 'locked' (its mission not passed), 'short'.
     */
    canBuy(propertyId, situation) {
      const property = properties[propertyId];
      if (!property) return { ok: false, reason: 'unknown', price: 0 };
      const price = property.price;
      if (owned.has(propertyId)) return { ok: false, reason: 'owned', price };
      if (!(price > 0)) return { ok: false, reason: 'handed over by a mission', price };
      if (property.unlockedBy && situation.completedMissions && !situation.completedMissions(property.unlockedBy)) {
        return { ok: false, reason: 'locked', price };
      }
      if (situation.cash < price) return { ok: false, reason: 'short', price };
      return { ok: true, reason: '', price };
    },

    /** Marks a property owned (bought or handed over). Gives false when it was already owned. */
    take(propertyId) {
      if (!properties[propertyId] || owned.has(propertyId)) return false;
      owned.add(propertyId);
      pending[propertyId] = 0;
      return true;
    },

    /** The properties a passed mission hands over for nothing (price 0, unlockedBy it). */
    handedOverBy(missionId) {
      return Object.values(properties).filter((each) => each.price === 0 && each.unlockedBy === missionId).map((each) => each.id);
    },

    /**
     * Pays the income of every owned business up to an in-game day, each capped at the days
     * it may accumulate.
     * @param {number} day The current in-game day.
     * @param {number} [rank] The progression rank (income perks).
     * @returns {number} Dollars added to the properties' pending income.
     */
    accrue(day, rank = 0) {
      const days = Math.max(0, Math.floor(day) - book.lastIncomeDay);
      book.lastIncomeDay = Math.max(book.lastIncomeDay, Math.floor(day));
      if (days === 0) return 0;
      const multiplier = incomeMultiplierAt(rank);
      let added = 0;
      for (const id of owned) {
        const daily = Math.round((properties[id]?.incomePerDay ?? 0) * multiplier);
        if (daily <= 0) continue;
        const cap = daily * rules.incomeAccumulatesDays;
        const before = pending[id] ?? 0;
        pending[id] = Math.min(cap, before + daily * days);
        added += pending[id] - before;
      }
      return added;
    },

    /** Takes the income waiting at a property. @returns {number} Dollars collected. */
    collect(propertyId) {
      const amount = pending[propertyId] ?? 0;
      if (amount > 0) pending[propertyId] = 0;
      return amount;
    },

    /** The ownership as plain data for the save file. */
    serialise() {
      return { ownedPropertyIds: [...owned], pendingIncome: { ...pending }, lastIncomeDay: book.lastIncomeDay };
    },

    /** Restores what serialise() gave; unknown ids are dropped. */
    restore(data) {
      if (!data) return;
      owned.clear();
      for (const key of Object.keys(pending)) delete pending[key];
      for (const id of data.ownedPropertyIds ?? []) if (properties[id]) owned.add(id);
      for (const id of owned) pending[id] = Math.max(0, Math.round(data.pendingIncome?.[id] ?? 0));
      if (Number.isFinite(data.lastIncomeDay)) book.lastIncomeDay = data.lastIncomeDay;
    },
  };
  return book;
}
