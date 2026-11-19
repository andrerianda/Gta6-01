// Tests of the economy's pure rules: the cash ledger and its penalties, property ownership and
// income, and the shop counter's offers and prices against the real catalogs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCashLedger, penaltyFor, formatDollars, STARTING_CASH } from '../../../game/src/economy/cashLedger.js';
import { createPropertyBook, incomeMultiplierAt } from '../../../game/src/economy/propertyIncome.js';
import { shopOffer, priceAt, isOpenAt, SERVED_SHOP_KINDS } from '../../../game/src/economy/shopCounter.js';
import { SHOPS_AND_SERVICES, SHOP_KINDS, PROPERTIES_FOR_SALE, PROPERTY_RULES, OUTFIT_CATALOG, FOOD_AND_DRINK } from '../../../game/src/catalog/shopsAndProperties.js';
import { WEAPON_CATALOG, COMBAT_RULES } from '../../../game/src/catalog/weaponCatalog.js';
import { WANTED_LEVELS, BUSTED_RULES, WASTED_RULES } from '../../../game/src/catalog/wantedLevels.js';

const catalogs = { SHOP_KINDS, OUTFIT_CATALOG, FOOD_AND_DRINK, WEAPON_CATALOG, WANTED_LEVELS, bodyArmor: COMBAT_RULES.bodyArmor };

function situation(overrides = {}) {
  return {
    rank: 0, wantedLevel: 0, hour: 12, cash: 50000, characterId: 'dez_tolliver', hasWeapon: (id) => id === 'pistol',
    armour: 0, maxArmour: 50, health: 60, ownedOutfits: new Set(), wornOutfit: null, vehicle: null, ...overrides,
  };
}

test('the ledger adds, spends only what it has and takes penalties down to zero', () => {
  const ledger = createCashLedger();
  assert.equal(ledger.cash, STARTING_CASH);
  assert.equal(ledger.add(500.4), 500);
  assert.equal(ledger.spend(10000), false);
  assert.equal(ledger.cash, STARTING_CASH + 500);
  assert.equal(ledger.spend(500), true);
  assert.equal(ledger.take(1e9), STARTING_CASH);
  assert.equal(ledger.cash, 0);
  assert.equal(ledger.add(-100), 0, 'a charge on an empty wallet takes nothing');
  assert.equal(ledger.add(Number.NaN), 0);
  const copy = createCashLedger(0);
  copy.restore(JSON.parse(JSON.stringify({ ...ledger.serialise(), cash: 1234 })));
  assert.equal(copy.cash, 1234);
  assert.equal(copy.spent, ledger.spent);
  assert.equal(formatDollars(1234567), '$1,234,567');
  assert.equal(formatDollars(-50), '-$50');
});

test('fines and hospital bills follow the wanted-level rules', () => {
  assert.equal(penaltyFor('busted', 50000, BUSTED_RULES), 5000, '10 percent of 50,000');
  assert.equal(penaltyFor('busted', 200000, BUSTED_RULES), 5000, 'capped at the maximum');
  assert.equal(penaltyFor('busted', 300, BUSTED_RULES), 100, 'the minimum');
  assert.equal(penaltyFor('busted', 40, BUSTED_RULES), 40, 'never more than the cash');
  assert.equal(penaltyFor('wasted', 10000, WASTED_RULES), 800, '8 percent');
  assert.equal(penaltyFor('wasted', 10000, WASTED_RULES, { characterId: 'sol_arrieta' }), 600, 'Sol pays a quarter less');
  assert.equal(penaltyFor('wasted', 1000, WASTED_RULES), 150);
});

test('properties are bought, handed over by missions and pay capped income by the day', () => {
  const book = createPropertyBook(PROPERTIES_FOR_SALE, PROPERTY_RULES);
  assert.equal(book.canBuy('dock_12_storage', { cash: 100 }).reason, 'short');
  assert.equal(book.canBuy('tolliver_loft', { cash: 1e6 }).reason, 'handed over by a mission');
  assert.equal(book.canBuy('dock_12_storage', { cash: 1e6, completedMissions: () => false }).reason, 'locked');
  assert.equal(book.canBuy('dock_12_storage', { cash: 1e6 }).ok, true);
  assert.deepEqual(book.handedOverBy('m01_hook_and_chain'), ['tolliver_loft']);
  assert.ok(book.take('dock_12_storage'));
  assert.equal(book.take('dock_12_storage'), false);
  assert.equal(book.canBuy('dock_12_storage', { cash: 1e6 }).reason, 'owned');
  book.take('tolliver_loft');
  assert.equal(book.accrue(1), 900, 'one day of the warehouse; the loft earns nothing');
  assert.equal(book.accrue(1), 0, 'the same day pays once');
  book.accrue(10);
  assert.equal(book.pending.dock_12_storage, 900 * PROPERTY_RULES.incomeAccumulatesDays, 'capped at three days');
  assert.equal(book.collect('dock_12_storage'), 2700);
  assert.equal(book.collect('dock_12_storage'), 0);
  assert.equal(incomeMultiplierAt(8), 1.2);
  book.accrue(11, 6);
  assert.equal(book.pending.dock_12_storage, 990);
  const copy = createPropertyBook(PROPERTIES_FOR_SALE, PROPERTY_RULES);
  copy.restore(JSON.parse(JSON.stringify({ ...book.serialise(), ownedPropertyIds: [...book.serialise().ownedPropertyIds, 'nowhere'] })));
  assert.deepEqual([...copy.owned].sort(), ['dock_12_storage', 'tolliver_loft']);
  assert.equal(copy.pending.dock_12_storage, 990);
  assert.equal(copy.lastIncomeDay, 11);
});

test('every served shop kind has a shop in the catalog and gives an offer', () => {
  for (const kind of SERVED_SHOP_KINDS) {
    const shops = Object.values(SHOPS_AND_SERVICES).filter((each) => each.kind === kind);
    assert.ok(shops.length > 0, kind);
    for (const shop of shops) {
      const offer = shopOffer(shop, catalogs, situation({ vehicle: { colour: '#C8372D', health: 400, maxHealth: 1000 } }));
      assert.ok(offer.open, shop.id);
      assert.ok(offer.items.length > 0, `${shop.id} offers something`);
      for (const each of offer.items) assert.ok(Number.isInteger(each.price) && each.price >= 0, `${shop.id} ${each.id}`);
    }
  }
});

test('the gun shop sells by rank, ammunition for weapons carried and armour from rank 2', () => {
  const shop = SHOPS_AND_SERVICES.trueno_armory_hierro;
  const offer = shopOffer(shop, catalogs, situation());
  const byId = Object.fromEntries(offer.items.map((each) => [each.id, each]));
  assert.equal(byId['ammo:pistol'].price, WEAPON_CATALOG.pistol.ammoPrice);
  assert.equal(byId['weapon:smg'].available, false);
  assert.equal(byId['weapon:smg'].note, 'Rank 2');
  assert.equal(byId['weapon:tire_iron'].available, true);
  assert.equal(byId.armour.note, 'Rank 2');
  const later = shopOffer(shop, catalogs, situation({ rank: 2 }));
  assert.ok(later.items.find((each) => each.id === 'weapon:smg').available);
  assert.ok(later.items.find((each) => each.id === 'armour').available);
  assert.equal(priceAt(35, shop, 'ammo', 1), 33, 'five percent off ammunition at rank 1');
  assert.equal(priceAt(100, { priceMultiplier: 1 }, 'weapon', 10), 85, 'fifteen percent off everything at rank 10');
  const refused = shopOffer(shop, catalogs, situation({ wantedLevel: 1 }));
  assert.equal(refused.refused, true, 'a gun shop refuses a wanted lead');
  assert.equal(shopOffer(shop, catalogs, situation({ hour: 23 })).open, false, 'closed at 23:00');
  const poor = shopOffer(shop, catalogs, situation({ cash: 10 }));
  assert.equal(poor.items.find((each) => each.id === 'weapon:tire_iron').note, 'Not enough cash');
});

test('the paint shop resprays the car being driven at the price of the stars, in a new colour', () => {
  const shop = SHOPS_AND_SERVICES.capa_fresca_playa;
  assert.equal(shopOffer(shop, catalogs, situation()).items.length, 0, 'nothing on foot');
  const car = { colour: '#C8372D', health: 1000, maxHealth: 1000 };
  const calm = shopOffer(shop, catalogs, situation({ vehicle: car })).items[0];
  assert.equal(calm.action, 'respray');
  assert.equal(calm.price, WANTED_LEVELS[0].resprayCost);
  assert.ok(!calm.choices.includes('#C8372D'), 'the current colour is not offered');
  const hot = shopOffer(shop, catalogs, situation({ vehicle: car, wantedLevel: 3 })).items[0];
  assert.equal(hot.price, WANTED_LEVELS[3].resprayCost);
  assert.equal(shopOffer(SHOPS_AND_SERVICES.capa_fresca_lomas, catalogs, situation({ vehicle: car, wantedLevel: 3, rank: 6 })).items[0].price,
    Math.round(WANTED_LEVELS[3].resprayCost * 1.25 * 0.8));
  assert.ok(isOpenAt(null, 3) && isOpenAt([12, 4], 2) && !isOpenAt([12, 4], 8) && isOpenAt([6, 24], 23.5));
});

test('clothes, food and the garage', () => {
  const clothes = shopOffer(SHOPS_AND_SERVICES.ropa_vieja_vintage, catalogs, situation({ ownedOutfits: new Set(['marisma_sunday']), wornOutfit: 'hierro_workwear' }));
  const sunday = clothes.items.find((each) => each.id === 'outfit:marisma_sunday');
  assert.equal(sunday.price, 0);
  assert.equal(clothes.items.find((each) => each.id === 'outfit:hierro_workwear').note, 'Wearing');
  assert.equal(shopOffer(SHOPS_AND_SERVICES.ropa_vieja_vintage, catalogs, situation({ wantedLevel: 4 })).refused, true);
  const diner = shopOffer(SHOPS_AND_SERVICES.dos_soles_diner, catalogs, situation({ health: 100 }));
  assert.ok(diner.items.every((each) => !each.available && each.note === 'Not hungry'));
  const tow = shopOffer(SHOPS_AND_SERVICES.tolliver_tow_garage, catalogs, situation({ vehicle: { colour: '#fff', health: 300, maxHealth: 1000 } }));
  assert.equal(tow.items[0].price, 0, 'Dez repairs for free at Tolliver Tow');
  const remache = shopOffer(SHOPS_AND_SERVICES.el_remache_rebuilds, catalogs, situation({ vehicle: { colour: '#fff', health: 300, maxHealth: 1000 } }));
  assert.equal(remache.items[0].price, Math.round(700 * SHOP_KINDS.mod_garage.repairPricePerDurabilityPoint));
});
