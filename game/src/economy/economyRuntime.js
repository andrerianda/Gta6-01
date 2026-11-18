// The economy's wiring to the running game: the cash ledger behind ECONOMY_ADD_MONEY and
// ECONOMY_SPEND_MONEY with MONEY_CHANGED on every change, the fine and hospital bill of being
// busted or wasted, properties bought or handed over by missions with their daily income, the
// lead's wardrobe, and the save section. The shop markers and menus are shopVisits.js.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { createCashLedger, penaltyFor } from './cashLedger.js';
import { createPropertyBook } from './propertyIncome.js';

/** Dez's room over the garage is his from the start: the first save point. */
const OWNED_AT_START = Object.freeze(['tolliver_loft']);

/**
 * Creates the economy's run-time.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 */
export function createEconomyRuntime(context) {
  const { commands, events } = context;
  const shopsCatalog = context.content.get('shopsAndProperties');
  const wanted = context.content.find('wantedLevels');
  const ledger = createCashLedger();
  const properties = createPropertyBook(shopsCatalog.PROPERTIES_FOR_SALE, shopsCatalog.PROPERTY_RULES);
  const wardrobe = { owned: new Set(), worn: null };
  const purchased = new Set();
  const stops = [];
  for (const id of OWNED_AT_START) properties.take(id);
  properties.lastIncomeDay = context.clock?.day ?? 0;

  const lead = () => context.systems.find('player')?.entity ?? context.entities.firstWithTag('player');
  const rank = () => context.systems.find('progression')?.rank ?? 0;
  const missionDone = (missionId) => Boolean(context.systems.find('missions')?.progress?.completed?.includes(missionId));
  const notify = (text, kind = 'info', seconds = 4) => {
    if (commands.has(GAME_COMMANDS.UI_NOTIFY)) commands.run(GAME_COMMANDS.UI_NOTIFY, { text, kind, seconds });
  };

  /** Announces a change of the balance. */
  function changed(delta, reason) {
    if (delta !== 0) events.emit(GAME_EVENTS.MONEY_CHANGED, { cash: ledger.cash, delta, reason: reason ?? '' });
  }

  const runtime = {
    ledger,
    properties,
    wardrobe,
    purchased,
    shops: null,

    /** Adds (or, negative, charges) money and announces it. @returns {number} The cash. */
    addMoney(amount, reason) {
      changed(ledger.add(amount), reason);
      return ledger.cash;
    },

    /** Pays a price in full or not at all. @returns {boolean} */
    spendMoney(amount, reason) {
      if (!ledger.spend(amount)) return false;
      changed(-Math.round(amount), reason);
      return true;
    },

    /** Buys a property of the catalog. @returns {{ok: boolean, reason: string}} */
    buyProperty(propertyId) {
      const check = properties.canBuy(propertyId, { cash: ledger.cash, completedMissions: missionDone });
      if (!check.ok) return check;
      runtime.spendMoney(check.price, `property:${propertyId}`);
      properties.take(propertyId);
      events.emit(GAME_EVENTS.PROPERTY_PURCHASED, { propertyId, price: check.price });
      if (commands.has(GAME_COMMANDS.SAVE_WRITE)) commands.send(GAME_COMMANDS.SAVE_WRITE, { reason: 'property bought' });
      return check;
    },

    /** Collects the income waiting at a property. @returns {number} Dollars. */
    collectIncome(propertyId) {
      const amount = properties.collect(propertyId);
      if (amount > 0) {
        runtime.addMoney(amount, `income:${propertyId}`);
        events.emit(GAME_EVENTS.PROPERTY_INCOME_PAID, { amount, day: context.clock?.day ?? 0 });
      }
      return amount;
    },

    start() {
      commands.handle(GAME_COMMANDS.ECONOMY_ADD_MONEY, ({ amount, reason } = {}) => runtime.addMoney(amount, reason));
      commands.handle(GAME_COMMANDS.ECONOMY_SPEND_MONEY, ({ amount, reason } = {}) => runtime.spendMoney(amount, reason));
      const listen = (topic, handler) => stops.push(events.on(topic, handler));
      listen(GAME_EVENTS.PLAYER_BUSTED, ({ fine } = {}) => {
        const amount = Number.isFinite(fine) ? fine : penaltyFor('busted', ledger.cash, wanted?.BUSTED_RULES ?? BACKUP_RULES, { characterId: lead()?.data?.characterId });
        changed(-ledger.take(amount), 'busted fine');
      });
      listen(GAME_EVENTS.PLAYER_WASTED, ({ hospitalBill } = {}) => {
        const amount = Number.isFinite(hospitalBill) ? hospitalBill : penaltyFor('wasted', ledger.cash, wanted?.WASTED_RULES ?? BACKUP_RULES, { characterId: lead()?.data?.characterId });
        changed(-ledger.take(amount), 'hospital bill');
      });
      listen(GAME_EVENTS.MISSION_PASSED, ({ missionId } = {}) => {
        for (const id of properties.handedOverBy(missionId)) {
          if (!properties.take(id)) continue;
          events.emit(GAME_EVENTS.PROPERTY_PURCHASED, { propertyId: id, price: 0 });
          notify(`${shopsCatalog.PROPERTIES_FOR_SALE[id].name} is yours.`, 'success', 5);
        }
      });
      listen(GAME_EVENTS.CLOCK_DAY_CHANGED, ({ day } = {}) => {
        if (properties.accrue(day ?? context.clock.day, rank()) > 0) notify('Your businesses have earned. Collect the takings at each property.', 'info', 5);
      });
    },

    fixedUpdate(stepSeconds) {
      runtime.shops?.fixedUpdate(stepSeconds);
    },

    update(deltaSeconds) {
      runtime.shops?.update(deltaSeconds);
    },

    serialise() {
      return {
        ...ledger.serialise(), ...properties.serialise(),
        purchasedItemIds: [...purchased], ownedOutfitIds: [...wardrobe.owned], wornOutfit: wardrobe.worn,
      };
    },

    restore(data) {
      if (!data) return;
      const before = ledger.cash;
      ledger.restore(data);
      properties.restore(data);
      purchased.clear();
      for (const id of data.purchasedItemIds ?? []) purchased.add(id);
      wardrobe.owned.clear();
      for (const id of data.ownedOutfitIds ?? []) if (shopsCatalog.OUTFIT_CATALOG[id]) wardrobe.owned.add(id);
      wardrobe.worn = shopsCatalog.OUTFIT_CATALOG[data.wornOutfit] ? data.wornOutfit : null;
      runtime.shops?.restored();
      events.emit(GAME_EVENTS.MONEY_CHANGED, { cash: ledger.cash, delta: ledger.cash - before, reason: 'load' });
    },

    dispose() {
      for (const stop of stops.splice(0)) if (typeof stop === 'function') stop();
      runtime.shops?.dispose();
    },
  };
  return runtime;
}

/** Used only when the wantedLevels catalog is missing. */
const BACKUP_RULES = Object.freeze({
  finePercentOfCash: 10, fineMinimum: 100, fineMaximum: 5000, billPercentOfCash: 8, billMinimum: 150, billMaximum: 4000, solPaperworkDiscount: 0.25,
});
