// Reputation and ranks: reputation only grows; each threshold of PROGRESSION_RANKS
// (catalog/progressionRanks.js) passed is a rank reached, with its weapons unlocked, its
// maximum health and armour and a cash bonus per rank. Pure, tested in Node.

/**
 * The rank entry for an amount of reputation.
 * @param {number} reputation
 * @param {ReadonlyArray<{rank: number, reputation: number}>} ranks PROGRESSION_RANKS.
 */
export function rankFor(reputation, ranks) {
  let found = ranks[0];
  for (const entry of ranks) if (reputation >= entry.reputation) found = entry;
  return found;
}

/**
 * Creates the reputation book.
 * @param {ReadonlyArray<object>} ranks PROGRESSION_RANKS.
 */
export function createReputationBook(ranks) {
  const book = {
    reputation: 0,
    /** The rank entry reached. */
    rank: ranks[0],
    /** Ids unlocked by ranks so far (weapons). */
    unlocked: new Set(ranks[0].weapons ?? []),

    /**
     * Adds reputation (a negative or bad amount adds nothing).
     * @returns {{delta: number, reached: object[]}} The ranks newly reached, lowest first.
     */
    add(amount) {
      const delta = Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
      if (delta === 0) return { delta: 0, reached: [] };
      book.reputation += delta;
      const reached = [];
      for (const entry of ranks) {
        if (entry.rank > book.rank.rank && book.reputation >= entry.reputation) {
          reached.push(entry);
          for (const id of entry.weapons ?? []) book.unlocked.add(id);
        }
      }
      if (reached.length) book.rank = reached[reached.length - 1];
      return { delta, reached };
    },

    /** Reputation still needed for the next rank, and the fraction of the way there. */
    toNextRank() {
      const next = ranks[book.rank.rank + 1];
      if (!next) return { next: null, needed: 0, fraction: 1 };
      const span = next.reputation - book.rank.reputation;
      return { next, needed: next.reputation - book.reputation, fraction: span > 0 ? (book.reputation - book.rank.reputation) / span : 1 };
    },

    serialise() {
      return { reputation: book.reputation, rankId: book.rank.id, unlocked: [...book.unlocked] };
    },

    /** Restores what serialise() gave; the rank follows the reputation, not the stored id. */
    restore(data) {
      if (!data) return;
      book.reputation = Number.isFinite(data.reputation) ? Math.max(0, Math.round(data.reputation)) : 0;
      book.rank = rankFor(book.reputation, ranks);
      book.unlocked.clear();
      for (const entry of ranks) if (entry.rank <= book.rank.rank) for (const id of entry.weapons ?? []) book.unlocked.add(id);
      for (const id of data.unlocked ?? []) if (typeof id === 'string') book.unlocked.add(id);
    },
  };
  return book;
}
