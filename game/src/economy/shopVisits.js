// Shops and properties in the world: each served shop and every property of the catalog stands
// at its landmark's door (like missionWorld.place: the entrance plus 3.5 m out front, spread
// sideways when several share a landmark) with a marker; walking into one shows a prompt and E
// opens its menu, driving slowly into a paint shop, garage or fuel station opens it at once.
// While the menu is open the lead stands still (the input context is 'shop': W/S choose,
// A/D pick a colour, Enter buys, Escape or Backspace leaves). Purchases reach the owners through their
// commands and members: combat for weapons and rounds, the player for health and armour, the
// fleet for paint and repairs, the wanted level for a respray or a change of clothes unseen,
// the lead's paint roles for an outfit, the save system for a room or a safehouse bed.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { setPaint } from '../assets/index.js';
import { formatDollars } from './cashLedger.js';
import { shopOffer, SERVED_SHOP_KINDS } from './shopCounter.js';
import { createShopMarkers, MARKER_COLOURS } from './shopMarkers.js';
import { createShopMenu } from './shopMenu.js';

const WALK_IN_METRES = 2.2;
const DRIVE_IN_METRES = 4;
const MARKER_RANGE_METRES = 150;
const SCAN_SECONDS = 0.25;
const KEYS = 'W/S choose  ·  A/D colour  ·  Enter buy  ·  Esc leave';

/**
 * Creates the shop visits.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {ReturnType<typeof import('./economyRuntime.js').createEconomyRuntime>} economy
 */
export function createShopVisits(context, economy) {
  const { commands, events, input } = context;
  const shops = context.content.get('shopsAndProperties');
  const catalogs = {
    SHOP_KINDS: shops.SHOP_KINDS, OUTFIT_CATALOG: shops.OUTFIT_CATALOG, FOOD_AND_DRINK: shops.FOOD_AND_DRINK,
    WEAPON_CATALOG: context.content.find('weaponCatalog')?.WEAPON_CATALOG ?? {},
    bodyArmor: context.content.find('weaponCatalog')?.COMBAT_RULES?.bodyArmor,
    WANTED_LEVELS: context.content.find('wantedLevels')?.WANTED_LEVELS ?? [],
  };
  const places = buildPlaces(context, shops);
  const markers = createShopMarkers(context.view.layers.dynamic);
  const menu = createShopMenu(context.page.document);
  const shown = new Array(6).fill(null);
  let scan = 0;
  let near = null;
  let open = null;
  let dismissed = null;

  const run = (name, payload) => (commands.has(name) ? commands.run(name, payload) : undefined);
  const notify = (text, kind = 'info') => run(GAME_COMMANDS.UI_NOTIFY, { text, kind, seconds: 4 });
  const player = () => context.systems.find('player');
  const wanted = () => context.systems.find('wantedLevel');
  const fleet = () => context.systems.find('vehicles');

  function vehicleRecord() {
    const id = player()?.entity?.data?.vehicleId;
    return id === null || id === undefined ? null : fleet()?.get?.(id) ?? null;
  }

  function situation() {
    const lead = player()?.entity;
    const progression = context.systems.find('progression');
    const vehicle = vehicleRecord()?.entity?.data ?? null;
    return {
      rank: progression?.rank ?? 0, wantedLevel: wanted()?.level ?? 0, hour: context.clock?.timeOfDay ?? 12, cash: economy.ledger.cash,
      characterId: lead?.data?.characterId, hasWeapon: (id) => Boolean(context.systems.find('combat')?.inventory?.has(id)),
      armour: lead?.data?.armour ?? 0, maxArmour: progression?.rankEntry?.maxArmor || 50, health: lead?.data?.health ?? 100,
      ownedOutfits: economy.wardrobe.owned, wornOutfit: economy.wardrobe.worn,
      vehicle: vehicle ? { colour: vehicle.colour, health: vehicle.health, maxHealth: vehicle.maxHealth } : null,
    };
  }

  function offerFor(place) {
    return place.type === 'shop' ? shopOffer(place.entry, catalogs, situation()) : propertyOffer(place.entry, economy, shops, situation());
  }

  function labels(place) {
    const kind = place.type === 'shop' ? shops.SHOP_KINDS[place.entry.kind]?.name ?? '' : economy.properties.isOwned(place.id) ? 'Your property' : 'Property for sale';
    return { title: place.entry.name, kind, cash: formatDollars(economy.ledger.cash), keys: KEYS };
  }

  function openMenu(place) {
    open = place;
    context.controls.setPlayContext('shop');
    menu.open(labels(place), offerFor(place));
    markers.hideColumn(place.id);
    events.emit(GAME_EVENTS.HELP_PROMPT_CHANGED, { action: null, text: null });
  }

  function closeMenu() {
    if (!open) return;
    dismissed = open.id;
    open = null;
    menu.close();
    markers.hideColumn(null);
    context.controls.setPlayContext(player()?.mode === 'inVehicle' ? 'inVehicle' : 'onFoot');
  }

  function buy(item) {
    if (!item || !item.available) return;
    const place = open;
    const check = precheck(item);
    if (check) { notify(check, 'warning'); return; }
    if (item.price > 0 && !economy.spendMoney(item.price, `${place.type}:${place.id}:${item.id}`)) { notify('Not enough cash.', 'warning'); return; }
    deliver(item, place);
    if (place.type === 'shop') events.emit(GAME_EVENTS.ITEM_PURCHASED, { shopId: place.id, itemId: item.id, kind: item.action, price: item.price });
    if (open) menu.show(labels(open), offerFor(open));
  }

  /** A reason the purchase cannot happen, checked before any money changes hands. */
  function precheck(item) {
    if (item.action !== 'respray') return '';
    if ((wanted()?.level ?? 0) > 0 && policeSeeLead()) return 'The police can see you. Lose them, then come back.';
    return vehicleRecord() ? '' : 'Drive a car in first.';
  }

  /** True while a unit has eyes on the lead (the dispatch's sight; else the wanted level's search). */
  function policeSeeLead() {
    const seen = context.systems.find('policeDispatch')?.playerSeen;
    return typeof seen === 'boolean' ? seen : !wanted()?.searching;
  }

  function deliver(item, place) {
    const lead = player()?.entity;
    const p = item.payload ?? {};
    switch (item.action) {
      case 'weapon': run(GAME_COMMANDS.PLAYER_GIVE_WEAPON, { weaponId: p.weaponId }); break;
      case 'ammo': run(GAME_COMMANDS.PLAYER_GIVE_WEAPON, { weaponId: p.weaponId, ammo: p.rounds }); break;
      case 'armour': run(GAME_COMMANDS.PLAYER_HEAL, { health: lead?.data?.health ?? 100, armour: p.armour }); break;
      case 'food': run(GAME_COMMANDS.PLAYER_HEAL, { health: Math.min(100, (lead?.data?.health ?? 100) + p.health), armour: lead?.data?.armour }); break;
      case 'repair': { const record = vehicleRecord(); if (record) fleet().repair(record.entity.id); break; }
      case 'respray': respray(menu.selectedChoice ?? p.colours?.[0], place); break;
      case 'outfit': wear(p.outfitId, p.outfit); break;
      case 'room': rest(p.advanceHours, p.clearsStarsAtMost, 'motel'); break;
      case 'buy': { const result = economy.buyProperty(place.id); if (result.ok) notify(`${place.entry.name} is yours.`, 'success'); break; }
      case 'collect': { const amount = economy.collectIncome(place.id); if (amount > 0) notify(`Collected ${formatDollars(amount)}.`, 'success'); break; }
      case 'save': rest(shops.PROPERTY_RULES.saveAdvancesHours ?? 6, 3, 'safehouse'); break;
      default: break;
    }
  }

  function respray(colour, place) {
    const record = vehicleRecord();
    if (!record || !colour) return;
    const fleetSystem = fleet();
    if (typeof fleetSystem.repaint === 'function') fleetSystem.repaint(record.entity.id, colour);
    else record.entity.data.colour = colour;
    fleetSystem.repair(record.entity.id);
    events.emit(GAME_EVENTS.VEHICLE_RESPRAYED, { vehicleId: record.entity.id, colour, shopId: place.id });
    if ((wanted()?.level ?? 0) > 0) run(GAME_COMMANDS.WANTED_CLEAR, { reason: 'respray' });
    notify('New paint, new plates. Nobody is looking for this car.', 'success');
  }

  function wear(outfitId, outfit) {
    economy.wardrobe.owned.add(outfitId);
    economy.wardrobe.worn = outfitId;
    paintLead(outfit);
    const w = wanted();
    if (w && w.level > 0 && w.level <= 3 && !policeSeeLead() && typeof w.loseStars === 'function') w.loseStars(2);
  }

  function paintLead(outfit) {
    const instance = player()?.figure?.instance ?? context.view.layers.dynamic.getObjectByName('player-lead');
    if (!instance || !outfit) return;
    try {
      setPaint(instance, outfit.top.color, 'paint_jacket');
      setPaint(instance, outfit.top.secondaryColor ?? outfit.top.color, 'paint_top');
      setPaint(instance, outfit.bottom.color, 'paint_bottom');
      setPaint(instance, outfit.shoes.color, 'paint_shoes');
    } catch (error) {
      context.log?.child?.('economy')?.warn?.(`the outfit could not be painted: ${error?.message ?? error}`);
    }
  }

  function rest(hours, clearsStarsAtMost, reason) {
    const level = wanted()?.level ?? 0;
    if (level > 0 && level <= clearsStarsAtMost) run(GAME_COMMANDS.WANTED_CLEAR, { reason: 'safehouse' });
    run(GAME_COMMANDS.TIME_SKIP, { hours });
    run(GAME_COMMANDS.PLAYER_HEAL, { health: 100, armour: player()?.entity?.data?.armour });
    const saved = run(GAME_COMMANDS.SAVE_WRITE, { reason });
    notify(saved?.ok ? `Slept ${hours} hours. Game saved.` : `Slept ${hours} hours.`, 'success');
  }

  /** Finds the nearest places, places the markers and the place the lead stands in. */
  function rescan() {
    const lead = player()?.entity;
    if (!lead) return;
    const { x, z } = lead.position;
    for (const place of places) place.distance = Math.hypot(place.x - x, place.z - z);
    places.sort(byDistance);
    for (let i = 0; i < shown.length; i += 1) {
      const place = places[i];
      shown[i] = place && place.distance < MARKER_RANGE_METRES ? place : null;
      if (shown[i]) shown[i].colour = colourOf(place, economy);
    }
    markers.place(shown);
    const inVehicle = player()?.mode === 'inVehicle';
    const first = places[0];
    const inside = first && first.distance < (inVehicle ? DRIVE_IN_METRES : WALK_IN_METRES) && (!inVehicle || first.driveIn) ? first : null;
    if (inside?.id !== near?.id) {
      near = inside;
      if (!inside) dismissed = null;
      events.emit(GAME_EVENTS.HELP_PROMPT_CHANGED, inside && !inVehicle ? { action: 'interact', text: `Enter ${inside.entry.name}` } : { action: null, text: null });
    }
    if (inside && inVehicle && !open && dismissed !== inside.id && Math.abs(vehicleRecord()?.entity?.data?.speed ?? 0) < 2.5) openMenu(inside);
  }

  return {
    places,
    get openPlaceId() { return open ? open.id : null; },
    open: (placeId) => { const place = places.find((each) => each.id === placeId); if (place) openMenu(place); return Boolean(place); },
    close: closeMenu,
    menu,

    fixedUpdate(stepSeconds) {
      if (!context.state.is('playing')) { if (open) closeMenu(); return; }
      scan -= stepSeconds;
      if (scan <= 0) { scan = SCAN_SECONDS; rescan(); }
      if (!open && near && player()?.mode !== 'inVehicle' && input.pressed('interact')) openMenu(near);
    },

    update(deltaSeconds) {
      markers.update(deltaSeconds);
      if (!open) return;
      if (input.pressed('menuUp')) menu.move(-1);
      if (input.pressed('menuDown')) menu.move(1);
      if (input.pressed('menuLeft')) menu.cycleChoice(-1);
      if (input.pressed('menuRight')) menu.cycleChoice(1);
      if (input.pressed('menuAccept')) buy(menu.selected);
      if (input.pressed('menuBack')) closeMenu();
    },

    /** After a load: repaint the lead in the outfit worn. */
    restored() {
      const outfit = shops.OUTFIT_CATALOG[economy.wardrobe.worn];
      if (outfit) paintLead(outfit);
    },

    dispose() {
      closeMenu();
      markers.dispose();
      menu.dispose();
    },
  };
}

/** What a property offers: buy it, or (owned) its takings, its bed and its wardrobe. */
function propertyOffer(property, economy, shops, situation) {
  const items = [];
  if (!economy.properties.isOwned(property.id)) {
    const check = economy.properties.canBuy(property.id, { cash: situation.cash });
    const income = property.incomePerDay > 0 ? `Earns ${formatDollars(property.incomePerDay)} a day` : 'A safehouse: save, sleep and change';
    const note = check.ok ? '' : check.reason === 'short' ? 'Not enough cash' : check.reason === 'handed over by a mission' ? 'Not for sale' : '';
    items.push({ id: 'buy', action: 'buy', label: `Buy for ${formatDollars(property.price)}`, detail: income, price: property.price, available: check.ok, note, payload: {} });
    return { open: true, refused: false, message: property.description, items };
  }
  const pending = economy.properties.pending[property.id] ?? 0;
  if (property.incomePerDay > 0) {
    items.push({ id: 'collect', action: 'collect', label: 'Collect the takings', detail: `${formatDollars(property.incomePerDay)} a day, up to three days`, price: 0, available: pending > 0, note: pending > 0 ? formatDollars(pending) : 'Nothing yet', payload: {} });
  }
  if (property.perks?.savePoint) {
    const level = situation.wantedLevel;
    items.push({ id: 'save', action: 'save', label: 'Sleep and save', detail: `Advance ${shops.PROPERTY_RULES.saveAdvancesHours} hours, full health`, price: 0, available: level <= 3, note: level <= 3 ? '' : 'Too hot', payload: {} });
  }
  if (property.perks?.wardrobe) {
    for (const outfitId of economy.wardrobe.owned) {
      const outfit = shops.OUTFIT_CATALOG[outfitId];
      if (outfit) items.push({ id: `outfit:${outfitId}`, action: 'outfit', label: `Wear ${outfit.name}`, detail: 'From the wardrobe', price: 0, available: economy.wardrobe.worn !== outfitId, note: economy.wardrobe.worn === outfitId ? 'Wearing' : '', payload: { outfitId, outfit } });
    }
  }
  return { open: true, refused: false, message: items.length ? '' : 'Home.', items };
}

/** Every served shop and every property at its landmark's door. */
function buildPlaces(context, shops) {
  const plan = context.systems.find('openWorldCity')?.plan;
  const byLandmark = new Map();
  const add = (type, entry) => {
    const landmark = plan?.landmarkById?.[entry.landmark];
    if (!landmark) return;
    if (!byLandmark.has(entry.landmark)) byLandmark.set(entry.landmark, []);
    byLandmark.get(entry.landmark).push({ type, entry, landmark });
  };
  for (const shop of Object.values(shops.SHOPS_AND_SERVICES)) if (SERVED_SHOP_KINDS.includes(shop.kind)) add('shop', shop);
  for (const property of Object.values(shops.PROPERTIES_FOR_SALE)) add('property', property);
  const city = context.systems.find('openWorldCity');
  const places = [];
  for (const group of byLandmark.values()) {
    group.forEach(({ type, entry, landmark }, index) => {
      const door = landmark.entrance ?? landmark;
      const fx = landmark.frontX ?? 0;
      const fz = landmark.frontZ ?? 1;
      const side = (index - (group.length - 1) / 2) * 4.5;
      const x = door.x + fx * 3.5 - fz * side;
      const z = door.z + fz * 3.5 + fx * side;
      const y = city?.groundHeightAt?.(x, z) ?? landmark.y ?? 0;
      const driveIn = type === 'shop' && ['paint_and_body_shop', 'mod_garage', 'fuel_station'].includes(entry.kind);
      places.push({ id: entry.id, type, entry, x, y, z, driveIn, distance: Infinity, colour: '#ffffff' });
    });
  }
  return places;
}

function colourOf(place, economy) {
  if (place.type === 'property') return economy.properties.isOwned(place.id) ? MARKER_COLOURS.property_owned : MARKER_COLOURS.property_for_sale;
  return MARKER_COLOURS[place.entry.kind] ?? '#FFD36B';
}

function byDistance(a, b) {
  return a.distance - b.distance;
}
