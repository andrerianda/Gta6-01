// The economy: the player's cash and where it goes. Mission rewards and other payouts arrive by
// ECONOMY_ADD_MONEY, prices are paid by ECONOMY_SPEND_MONEY, and being busted or wasted takes
// the fine or the hospital bill of catalog/wantedLevels.js. Properties of the shop catalog are
// bought or handed over by missions; businesses earn income each in-game day that waits at the
// property. Shops stand at their landmarks as walk-in (or drive-in) markers with a menu.
// Contract: docs/ARCHITECTURE.md, "economy". Pure rules: cashLedger.js, propertyIncome.js,
// shopCounter.js (tested in tools/tests/economy-save/); wiring: economyRuntime.js.
//
// Members: cash; owns(propertyId); ownedProperties() -> ids; pendingIncome(propertyId);
//   buyProperty(propertyId) -> {ok, reason}; collectIncome(propertyId) -> dollars;
//   wornOutfit; ownedOutfits (Set); shops (the shop visits once started, may be null).
// Commands: ECONOMY_ADD_MONEY {amount, reason} -> cash (a negative amount is a charge that takes
//   what there is); ECONOMY_SPEND_MONEY {amount, reason} -> boolean (false when short).
// Publishes: MONEY_CHANGED, ITEM_PURCHASED, PROPERTY_PURCHASED, PROPERTY_INCOME_PAID.
// Saved as { cash, earned, spent, ownedPropertyIds, pendingIncome, lastIncomeDay,
//   purchasedItemIds, ownedOutfitIds, wornOutfit }.

/** Cash before the implementation has loaded (cashLedger.js STARTING_CASH). */
const CASH_BEFORE_INIT = 2000;

/**
 * Creates the money, shops and properties system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createMoneyShopsAndPropertiesSystem(context) {
  let runtime = null;

  const system = {
    name: 'economy',
    loadWeight: 0.5,

    /** Whole dollars in hand. */
    get cash() { return runtime ? runtime.ledger.cash : CASH_BEFORE_INIT; },
    /** The outfit the lead wears (an OUTFIT_CATALOG id), or null for the default clothes. */
    get wornOutfit() { return runtime ? runtime.wardrobe.worn : null; },
    /** Outfits bought (OUTFIT_CATALOG ids). */
    get ownedOutfits() { return runtime ? runtime.wardrobe.owned : new Set(); },
    /** The shop markers and menus, once started (shopVisits.js). */
    get shops() { return runtime ? runtime.shops : null; },

    owns: (propertyId) => Boolean(runtime && runtime.properties.isOwned(propertyId)),
    ownedProperties: () => (runtime ? [...runtime.properties.owned] : []),
    pendingIncome: (propertyId) => (runtime ? runtime.properties.pending[propertyId] ?? 0 : 0),
    buyProperty: (propertyId) => (runtime ? runtime.buyProperty(propertyId) : { ok: false, reason: 'not ready' }),
    collectIncome: (propertyId) => (runtime ? runtime.collectIncome(propertyId) : 0),

    async init(progress) {
      const [{ createEconomyRuntime }, { registerEconomyShowcase }] = await Promise.all([
        import('./economyRuntime.js'),
        import('./economyShowcase.js'),
      ]);
      runtime = createEconomyRuntime(context);
      registerEconomyShowcase(context);
      progress(1, 'economy');
    },

    start() {
      runtime.start();
    },

    fixedUpdate(stepSeconds) {
      runtime.fixedUpdate(stepSeconds);
    },

    update(deltaSeconds) {
      runtime.update(deltaSeconds);
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
