// Player progression: reputation earned from missions, activities and mayhem, the ranks of
// catalog/progressionRanks.js it reaches and what each unlocks (weapons, a cash bonus), and
// the statistics page (distance driven and on foot, cars stolen, stars earned and lost, the
// longest pursuit, shots fired, money earned and spent) for the phone and the pause menu.
// Contract: docs/ARCHITECTURE.md, "progression". Pure rules: reputationRanks.js and
// statisticsBook.js (tested in tools/tests/economy-save/); wiring: progressionRuntime.js.
//
// Members: reputation; rank (number); rankEntry (the catalog entry); toNextRank() ->
//   {next, needed, fraction}; isUnlocked(id); statistic(id); statisticRows(category?) ->
//   [{id, name, category, value, text}].
// Commands: PROGRESSION_ADD_REPUTATION {amount, reason} -> reputation;
//   PROGRESSION_RECORD {statistic, amount?} (adds, or raises a record).
// Publishes: REPUTATION_CHANGED, RANK_REACHED, CONTENT_UNLOCKED, STATISTIC_CHANGED.
// Saved as { reputation, rankId, unlocked, statistics, districtsVisited }.

/**
 * Creates the player progression system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createPlayerProgressionSystem(context) {
  let runtime = null;

  const system = {
    name: 'progression',
    dependsOn: ['economy'],
    loadWeight: 0.3,

    /** Reputation earned (it never goes down). */
    get reputation() { return runtime ? runtime.reputation.reputation : 0; },
    /** The rank number, 0 to 10. */
    get rank() { return runtime ? runtime.reputation.rank.rank : 0; },
    /** The catalog entry of the rank reached. */
    get rankEntry() { return runtime ? runtime.reputation.rank : null; },
    toNextRank: () => (runtime ? runtime.reputation.toNextRank() : { next: null, needed: 0, fraction: 0 }),
    isUnlocked: (id) => Boolean(runtime && runtime.reputation.unlocked.has(id)),
    statistic: (id) => (runtime ? runtime.statistics.values[id] ?? 0 : 0),
    statisticRows: (category = null) => (runtime ? runtime.statistics.rows(category) : []),

    async init(progress) {
      const { createProgressionRuntime } = await import('./progressionRuntime.js');
      runtime = createProgressionRuntime(context);
      progress(1, 'progression');
    },

    start() {
      runtime.start();
    },

    fixedUpdate(stepSeconds) {
      runtime.fixedUpdate(stepSeconds);
    },

    serialise() {
      return runtime ? runtime.serialise() : null;
    },

    restore(data) {
      if (runtime) runtime.restore(data);
    },

    dispose() {
      if (runtime) runtime.dispose();
      runtime = null;
    },
  };
  return system;
}
