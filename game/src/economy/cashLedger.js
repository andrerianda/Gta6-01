// The player's cash: a whole-dollar balance that never goes below zero, the money earned and
// spent over the game, and the fine (busted) and hospital bill (wasted) that the rules of
// catalog/wantedLevels.js take from it. Pure, tested in Node (tools/tests/economy-save/).

/** Cash in hand at the start of a new game: enough for a respray, a meal and a box of rounds. */
export const STARTING_CASH = 2000;

/**
 * Creates the ledger.
 * @param {number} [startingCash] The balance to start with.
 */
export function createCashLedger(startingCash = STARTING_CASH) {
  const ledger = {
    /** Whole dollars in hand, never negative. */
    cash: wholeDollars(startingCash),
    /** Everything earned this game (dollars). */
    earned: 0,
    /** Everything spent or taken this game (dollars). */
    spent: 0,

    /**
     * Adds money; a negative amount is a charge that takes what there is (see take()).
     * @returns {number} The change of the balance (negative for a charge).
     */
    add(amount) {
      const delta = wholeDollars(amount);
      if (delta < 0) return 0 - ledger.take(-delta);
      ledger.cash += delta;
      ledger.earned += delta;
      return delta;
    },

    /**
     * Pays a price in full, or nothing when the cash is short.
     * @returns {boolean} True when paid.
     */
    spend(amount) {
      const price = wholeDollars(amount);
      if (price < 0 || price > ledger.cash) return false;
      ledger.cash -= price;
      ledger.spent += price;
      return true;
    },

    /**
     * Takes a penalty: up to the amount, never more than the cash in hand.
     * @returns {number} The dollars taken.
     */
    take(amount) {
      const taken = Math.min(ledger.cash, Math.max(0, wholeDollars(amount)));
      ledger.cash -= taken;
      ledger.spent += taken;
      return taken;
    },

    /** The ledger as plain data for the save file. */
    serialise() {
      return { cash: ledger.cash, earned: ledger.earned, spent: ledger.spent };
    },

    /** Restores what serialise() gave (a bad value leaves the field as it is). */
    restore(data) {
      if (!data) return;
      if (Number.isFinite(data.cash)) ledger.cash = Math.max(0, wholeDollars(data.cash));
      if (Number.isFinite(data.earned)) ledger.earned = Math.max(0, wholeDollars(data.earned));
      if (Number.isFinite(data.spent)) ledger.spent = Math.max(0, wholeDollars(data.spent));
    },
  };
  return ledger;
}

/**
 * A penalty that is a percentage of the cash in hand between a floor and a ceiling, and never
 * more than the cash itself (a broke lead pays what is in the pockets).
 * @param {number} cash The cash in hand.
 * @param {{percent: number, minimum: number, maximum: number, discount?: number}} rule
 * @returns {number} Whole dollars.
 */
export function penaltyFromCash(cash, rule) {
  const balance = Math.max(0, wholeDollars(cash));
  const raw = Math.round((balance * rule.percent) / 100);
  const bounded = Math.min(rule.maximum, Math.max(rule.minimum, raw));
  const discounted = Math.round(bounded * (1 - (rule.discount ?? 0)));
  return Math.min(balance, discounted);
}

/**
 * The fine for being busted (BUSTED_RULES) or the bill for being wasted (WASTED_RULES).
 * @param {'busted' | 'wasted'} what Which penalty.
 * @param {number} cash The cash in hand.
 * @param {object} rules BUSTED_RULES or WASTED_RULES of catalog/wantedLevels.js.
 * @param {{characterId?: string, privateClinic?: boolean}} [who] Sol's paperwork discount applies to sol_arrieta.
 * @returns {number} Whole dollars.
 */
export function penaltyFor(what, cash, rules, who = {}) {
  const discount = who.characterId === 'sol_arrieta' ? rules.solPaperworkDiscount ?? 0 : 0;
  if (what === 'busted') {
    return penaltyFromCash(cash, { percent: rules.finePercentOfCash, minimum: rules.fineMinimum, maximum: rules.fineMaximum, discount });
  }
  const clinic = who.privateClinic ? rules.privateClinicMultiplier ?? 1 : 1;
  return penaltyFromCash(cash, {
    percent: rules.billPercentOfCash * clinic, minimum: rules.billMinimum * clinic, maximum: rules.billMaximum * clinic, discount,
  });
}

/** Rounds to whole dollars; anything that is not a finite number is zero. */
export function wholeDollars(amount) {
  return Number.isFinite(amount) ? Math.round(amount) : 0;
}

/** '$12,500' (no cents; a minus sign for a negative amount). */
export function formatDollars(amount) {
  const value = wholeDollars(amount);
  const digits = String(Math.abs(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${value < 0 ? '-' : ''}$${digits}`;
}
