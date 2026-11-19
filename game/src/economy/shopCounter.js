// The shop counter: what a shop of catalog/shopsAndProperties.js offers the lead right now and
// at what price. Gun shops sell the branch's weapons at weaponCatalog prices once the rank
// allows, a magazine of ammunition for a weapon already carried and body armour; clothing
// stores their outfits; paint and body shops a respray in a chosen colour (priced by the wanted
// level) for the car being driven; garages and fuel stations a repair; diners, bars and stores
// their food; the motel a room. Opening hours and the stars at which a shop refuses service
// come from SHOP_KINDS, discounts from the rank perks. Pure, tested in Node.

/** Price perks of catalog/progressionRanks.js, by what is bought. */
export const PRICE_RANK_PERKS = Object.freeze({
  ammo: Object.freeze([{ rank: 1, factor: 0.95 }, { rank: 9, factor: 0.75 }]),
  respray: Object.freeze([{ rank: 6, factor: 0.8 }]),
  everything: Object.freeze([{ rank: 10, factor: 0.85 }]),
});

/** The shop kinds the counter serves (others have no marker yet). */
export const SERVED_SHOP_KINDS = Object.freeze([
  'gun_shop', 'clothing_store', 'paint_and_body_shop', 'mod_garage', 'diner', 'bar_cantina', 'convenience_store', 'fuel_station', 'motel',
]);

/**
 * The final price of something at a shop: base price, the branch's multiplier and rank perks.
 * @param {number} base Catalog price.
 * @param {{priceMultiplier?: number}} shop The branch.
 * @param {'weapon'|'ammo'|'armour'|'respray'|'repair'|'outfit'|'food'|'room'} what
 * @param {number} rank Progression rank.
 */
export function priceAt(base, shop, what, rank) {
  let factor = shop?.priceMultiplier ?? 1;
  for (const perk of PRICE_RANK_PERKS[what] ?? []) if (rank >= perk.rank) factor = Math.min(factor, (shop?.priceMultiplier ?? 1) * perk.factor);
  for (const perk of PRICE_RANK_PERKS.everything) if (rank >= perk.rank) factor *= perk.factor;
  return Math.max(0, Math.round(base * factor));
}

/**
 * Whether a shop with these hours is open at a clock hour; null hours mean always; a closing
 * hour below the opening hour runs past midnight.
 * @param {[number, number] | null} hours
 * @param {number} hour Clock hours, 0 to 24.
 */
export function isOpenAt(hours, hour) {
  if (!hours) return true;
  const [open, close] = hours;
  if (open < close) return hour >= open && hour < close;
  return hour >= open || hour < close;
}

/**
 * What a shop offers now.
 * @param {object} shop A SHOPS_AND_SERVICES entry.
 * @param {{SHOP_KINDS: object, OUTFIT_CATALOG: object, FOOD_AND_DRINK: object, WEAPON_CATALOG: object,
 *   bodyArmor?: {price: number, unlockRank: number}, WANTED_LEVELS: object[]}} catalogs
 * @param {{rank: number, wantedLevel: number, hour: number, cash: number, characterId?: string,
 *   hasWeapon: (id: string) => boolean, armour: number, maxArmour: number, health: number,
 *   ownedOutfits: Set<string>, wornOutfit?: string | null, vehicle?: {colour: string, health: number, maxHealth: number} | null}} situation
 * @returns {{open: boolean, refused: boolean, message: string, items: object[]}} Each item:
 *   {id, action, label, detail, price, available, note, choices?, payload}.
 */
export function shopOffer(shop, catalogs, situation) {
  const kind = catalogs.SHOP_KINDS[shop.kind] ?? {};
  if (!isOpenAt(kind.hours ?? null, situation.hour)) {
    return { open: false, refused: false, message: `Closed. Open ${clock(kind.hours[0])} to ${clock(kind.hours[1])}.`, items: [] };
  }
  if (situation.wantedLevel > (kind.refusesAtStarsAbove ?? 5)) {
    return { open: true, refused: true, message: 'The clerk will not serve you with the police after you.', items: [] };
  }
  const items = [];
  const builders = { gun_shop: gunShop, clothing_store: clothes, paint_and_body_shop: paintShop, mod_garage: garage, fuel_station: fuel, motel: room };
  builders[shop.kind]?.(shop, kind, catalogs, situation, items);
  food(shop, catalogs, situation, items);
  for (const item of items) {
    if (item.available && item.price > situation.cash) {
      item.available = false;
      item.note = 'Not enough cash';
    }
  }
  const message = items.length ? '' : situation.vehicle === null && (shop.kind === 'paint_and_body_shop' || shop.kind === 'mod_garage')
    ? 'Drive a car in to have it worked on.' : 'Nothing for sale right now.';
  return { open: true, refused: false, message, items };
}

function gunShop(shop, kind, catalogs, situation, items) {
  for (const weaponId of shop.weapons ?? []) {
    const weapon = catalogs.WEAPON_CATALOG[weaponId];
    if (!weapon) continue;
    const name = weapon.name ?? weaponId;
    if (situation.hasWeapon(weaponId)) {
      if (!weapon.magazine || !(weapon.ammoPrice > 0)) continue;
      items.push(item(`ammo:${weaponId}`, 'ammo', `${name} rounds`, `+${weapon.magazine} ${weapon.magazine === 1 ? 'round' : 'rounds'}`,
        priceAt(weapon.ammoPrice, shop, 'ammo', situation.rank), true, '', { weaponId, rounds: weapon.magazine }));
    } else {
      const locked = situation.rank < (weapon.unlockRank ?? 0);
      items.push(item(`weapon:${weaponId}`, 'weapon', name, weapon.class ? capitalise(weapon.class.replace(/_/g, ' ')) : '',
        priceAt(weapon.price, shop, 'weapon', situation.rank), !locked, locked ? `Rank ${weapon.unlockRank}` : '', { weaponId }));
    }
  }
  if (shop.sellsArmor) {
    const armour = catalogs.bodyArmor ?? { price: kind.armorPrice ?? 1500, unlockRank: 2 };
    const locked = situation.rank < armour.unlockRank;
    const full = !locked && situation.armour >= situation.maxArmour;
    items.push(item('armour', 'armour', 'Body armour', `Armour to ${situation.maxArmour}`, priceAt(kind.armorPrice ?? armour.price, shop, 'armour', situation.rank),
      !locked && !full, locked ? `Rank ${armour.unlockRank}` : full ? 'Full' : '', { armour: situation.maxArmour }));
  }
}

function clothes(shop, kind, catalogs, situation, items) {
  for (const outfitId of shop.outfits ?? []) {
    const outfit = catalogs.OUTFIT_CATALOG[outfitId];
    if (!outfit) continue;
    const owned = situation.ownedOutfits.has(outfitId);
    const wearing = situation.wornOutfit === outfitId;
    items.push(item(`outfit:${outfitId}`, 'outfit', outfit.name, outfit.tags.join(', '), owned ? 0 : priceAt(outfit.price, shop, 'outfit', situation.rank),
      !wearing, wearing ? 'Wearing' : owned ? 'Owned' : '', { outfitId, outfit }));
  }
}

function paintShop(shop, kind, catalogs, situation, items) {
  if (!situation.vehicle) return;
  const level = Math.max(0, Math.min(5, situation.wantedLevel));
  const base = catalogs.WANTED_LEVELS[level]?.resprayCost ?? kind.paintPrice ?? 300;
  const choices = (kind.paintColors ?? []).filter((colour) => colour.toLowerCase() !== String(situation.vehicle.colour).toLowerCase());
  items.push(item('respray', 'respray', level > 0 ? 'Respray and lose the heat' : 'Respray', 'New colour, new plates, full repair',
    priceAt(base, shop, 'respray', situation.rank), choices.length > 0, '', { colours: choices }, choices));
}

function garage(shop, kind, catalogs, situation, items) {
  const vehicle = situation.vehicle;
  if (!vehicle || !shop.repairs) return;
  const missing = Math.max(0, vehicle.maxHealth - vehicle.health);
  const free = shop.freeRepairFor && shop.freeRepairFor === situation.characterId;
  const price = free ? 0 : priceAt(Math.max(kind.repairMinimum ?? 0, missing * (kind.repairPricePerDurabilityPoint ?? 1)), shop, 'repair', situation.rank);
  items.push(item('repair', 'repair', 'Full repair', free ? 'On the house' : 'Body, glass and engine', price, missing > 0, missing > 0 ? '' : 'Like new', { toFraction: 1 }));
}

function fuel(shop, kind, catalogs, situation, items) {
  const vehicle = situation.vehicle;
  if (!vehicle || !shop.quickRepair) return;
  const fraction = vehicle.maxHealth > 0 ? vehicle.health / vehicle.maxHealth : 1;
  const to = kind.quickRepairToFraction ?? 0.6;
  items.push(item('repair', 'repair', 'Quick repair', `Back to ${Math.round(to * 100)} percent`, priceAt(kind.quickRepairPrice ?? 150, shop, 'repair', situation.rank),
    fraction < to, fraction < to ? '' : 'Runs fine', { toFraction: to }));
}

function room(shop, kind, catalogs, situation, items) {
  const stay = shop.room;
  if (!stay) return;
  items.push(item('room', 'room', 'A room for the night', `Save and sleep ${stay.advanceHours} hours`, priceAt(stay.fee, shop, 'room', situation.rank), true, '',
    { advanceHours: stay.advanceHours, clearsStarsAtMost: stay.clearsStarsAtMost }));
}

function food(shop, catalogs, situation, items) {
  for (const foodId of shop.menu ?? []) {
    const dish = catalogs.FOOD_AND_DRINK[foodId];
    if (!dish) continue;
    items.push(item(`food:${foodId}`, 'food', dish.name, `+${dish.health} health`, priceAt(dish.price, shop, 'food', situation.rank),
      situation.health < 100, situation.health < 100 ? '' : 'Not hungry', { health: dish.health }));
  }
}

function item(id, action, label, detail, price, available, note, payload, choices = null) {
  return { id, action, label, detail, price, available, note, payload, choices };
}

function clock(hour) {
  return `${String(hour % 24).padStart(2, '0')}:00`;
}

function capitalise(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
