// Where the money goes in Marazul: every shop and service (gun shops, clothes, paint and body,
// tuning garages, the car and boat dealers, food, fuel) with its stock and prices, the outfits
// and vehicle upgrades they sell, and every property the leads can own, with its price, daily
// income and perks. Plain frozen data, no imports.
//
// A shop's id is its landmark's id when the landmark is the shop; shops inside a larger
// landmark have their own id and name the landmark they stand in. Ids: landmarks and districts
// from cityDistricts.js, weapons from weaponCatalog.js (ammunition prices are there), vehicles
// from vehicleCatalog.js (vehicle prices are there), missions from storyMissions.js, outfit
// pieces from CHARACTER_APPEARANCE_VOCABULARY in storyCharacters.js. Money in whole dollars;
// income is per in-game day and waits at the property (up to three days) to be collected.

/**
 * Every shop and service keyed by id.
 * @type {Readonly<Record<string, object>>}
 */
export const SHOPS_AND_SERVICES = freezeCatalog({
  // Gun shops
  trueno_armory_hierro: shop('trueno_armory_hierro', 'Trueno Armory Hierro', 'gun_shop', 'trueno_armory_hierro', 'barrio_hierro', 'm03_stamped_and_sealed', { weapons: ['tire_iron', 'baseball_bat', 'pistol', 'smg', 'pump_shotgun'], sellsArmor: true, priceMultiplier: 1 }),
  trueno_armory_centro: shop('trueno_armory_centro', 'Trueno Armory Centro', 'gun_shop', 'trueno_armory_centro', 'centro', 'm05_night_shift', { weapons: ['pistol', 'heavy_revolver', 'smg', 'pump_shotgun', 'assault_rifle', 'sniper_rifle'], sellsArmor: true, shootingLane: { fee: 100, targets: 20 }, priceMultiplier: 1.1 }),
  pantano_gun_and_bait: shop('pantano_gun_and_bait', 'Pantano Gun & Bait', 'gun_shop', 'pantano_gun_and_bait', 'los_pantanos', 'm07_two_beer_problem', { weapons: ['baseball_bat', 'heavy_revolver', 'pump_shotgun', 'assault_rifle', 'sniper_rifle', 'grenade', 'fire_bottle', 'rocket_launcher'], sellsArmor: true, priceMultiplier: 0.95 }),
  // Clothes
  ropa_vieja_vintage: shop('ropa_vieja_vintage', 'Ropa Vieja Vintage', 'clothing_store', 'ropa_vieja_vintage', 'la_marisma', null, { outfits: ['marisma_sunday', 'second_hand_bomber', 'hierro_workwear', 'remache_colours', 'jackal_leathers'] }),
  brisa_y_hilo: shop('brisa_y_hilo', 'Brisa & Hilo', 'clothing_store', 'brisa_y_hilo', 'playa_dorada', 'm03_stamped_and_sealed', { outfits: ['boardwalk_loud', 'lifeguard_off_duty', 'marisma_sunday'] }),
  linea_blanca_aurora: shop('linea_blanca_aurora', 'Línea Blanca', 'clothing_store', 'galerias_aurora', 'centro', 'm08_clean_hands', { outfits: ['linea_blanca_office', 'aurelia_gala_black', 'boardwalk_loud'] }),
  atelier_lomas: shop('atelier_lomas', 'Atelier Lomas', 'clothing_store', 'atelier_lomas', 'las_lomas', 'm10_dead_air', { outfits: ['lomas_tailored_grey', 'aurelia_gala_black', 'linea_blanca_office'] }),
  casa_lino: shop('casa_lino', 'Casa Lino', 'clothing_store', 'casa_lino', 'bahia_vista', 'm11_house_edge', { outfits: ['bahia_linen', 'aurelia_gala_black', 'lomas_tailored_grey'] }),
  // Paint and body
  capa_fresca_hierro: shop('capa_fresca_hierro', 'Capa Fresca Hierro', 'paint_and_body_shop', 'capa_fresca_hierro', 'barrio_hierro', 'm02_twice_the_weight', { priceMultiplier: 0.85 }),
  capa_fresca_playa: shop('capa_fresca_playa', 'Capa Fresca Playa', 'paint_and_body_shop', 'capa_fresca_playa', 'playa_dorada', 'm02_twice_the_weight', { priceMultiplier: 1 }),
  capa_fresca_lomas: shop('capa_fresca_lomas', 'Capa Fresca Las Lomas', 'paint_and_body_shop', 'capa_fresca_lomas', 'las_lomas', 'm02_twice_the_weight', { priceMultiplier: 1.25 }),
  lodo_y_laca: shop('lodo_y_laca', 'Lodo y Laca', 'paint_and_body_shop', 'lodo_y_laca', 'los_pantanos', 'm02_twice_the_weight', { priceMultiplier: 0.9 }),
  // Tuning garages
  tolliver_tow_garage: shop('tolliver_tow_garage', 'Tolliver Tow & Recovery', 'mod_garage', 'tolliver_tow', 'barrio_hierro', 'm01_hook_and_chain', { upgrades: ['engine', 'brakes', 'tyres', 'suspension'], maxTier: 2, repairs: true, priceMultiplier: 0.9, freeRepairFor: 'dez_tolliver' }),
  el_remache_rebuilds: shop('el_remache_rebuilds', 'El Remache Rebuilds', 'mod_garage', 'chatarreria_el_remache', 'barrio_hierro', 'm04_sparks_fly', { upgrades: ['engine', 'brakes', 'tyres', 'suspension', 'nitro'], maxTier: 3, repairs: true, priceMultiplier: 1, buysScrap: { fractionOfPrice: 0.08, flatForUnpriced: 900 } }),
  marea_motorsport: shop('marea_motorsport', 'Marea Motorsport', 'mod_garage', 'marea_motorsport', 'bahia_vista', 'm09_weigh_her_again', { upgrades: ['engine', 'brakes', 'tyres', 'suspension', 'nitro', 'armor', 'bulletproof_tyres', 'pearl_paint'], maxTier: 3, repairs: true, priceMultiplier: 1.2 }),
  // Dealers
  lomas_prestige_motors: shop('lomas_prestige_motors', 'Lomas Prestige Motors', 'car_dealership', 'lomas_prestige_motors', 'las_lomas', 'm10_dead_air', { vehicles: ['compact_hatch', 'family_sedan', 'suv', 'offroad_4x4', 'pickup_truck', 'cargo_van', 'muscle_car', 'convertible_cruiser', 'sport_motorcycle', 'chopper_motorcycle', 'luxury_sedan', 'sports_coupe', 'supercar'], deliveredToOwnedGarage: true, testDriveSeconds: 120 }),
  prieto_charters: shop('prieto_charters', 'Prieto Charters', 'boat_dealer', 'marina_bahia_vista', 'bahia_vista', 'm06_charter_rates', { vehicles: ['speedboat'], deliveredToOwnedDock: true, boatRental: { vehicle: 'speedboat', feePerGameHour: 150 }, boatRepair: true }),
  // Food and drink
  dos_soles_diner: shop('dos_soles_diner', 'Dos Soles Diner', 'diner', 'dos_soles_diner', 'playa_dorada', 'm02_twice_the_weight', { menu: ['cafecito', 'two_suns_breakfast', 'pressed_sandwich', 'key_lime_slice'] }),
  fonda_dona_pilar: shop('fonda_dona_pilar', 'Fonda Doña Pilar', 'diner', 'fonda_dona_pilar', 'la_marisma', null, { menu: ['cafecito', 'plato_del_dia', 'empanada'] }),
  grua_grill: shop('grua_grill', 'Grúa Grill', 'diner', 'grua_grill', 'puerto_tamarindo', null, { menu: ['cafecito', 'stevedore_plate', 'pressed_sandwich'] }),
  ancla_torcida: shop('ancla_torcida', 'Cantina El Ancla Torcida', 'bar_cantina', 'ancla_torcida', 'la_marisma', null, { menu: ['cerveza_faro', 'empanada'], services: ['la_notaria_favours'] }),
  cantina_la_sentina: shop('cantina_la_sentina', 'Cantina La Sentina', 'bar_cantina', 'cantina_la_sentina', 'puerto_tamarindo', null, { menu: ['cerveza_faro', 'empanada'] }),
  mudline_roadhouse: shop('mudline_roadhouse', 'The Mudline Roadhouse', 'bar_cantina', 'mudline_roadhouse', 'los_pantanos', null, { menu: ['cerveza_faro', 'swamp_boil'] }),
  bodega_la_esquina: shop('bodega_la_esquina', 'Bodega La Esquina', 'convenience_store', 'bodega_la_esquina', 'la_marisma', null, { menu: ['coco_bravo', 'plantain_chips', 'first_aid_kit'], register: { cash: [120, 380], alarmSeconds: 8 } }),
  mercadito_24_puerto: shop('mercadito_24_puerto', 'Mercadito 24 Puerto', 'convenience_store', 'mercadito_24_puerto', 'puerto_tamarindo', null, { menu: ['coco_bravo', 'plantain_chips', 'first_aid_kit'], register: { cash: [150, 450], alarmSeconds: 6 } }),
  pantano_provisions: shop('pantano_provisions', 'Pantano Provisions', 'convenience_store', 'pantano_provisions', 'los_pantanos', null, { menu: ['coco_bravo', 'plantain_chips', 'first_aid_kit'], register: { cash: [80, 260], alarmSeconds: 14 } }),
  // Fuel and quick repair
  solana_bulevar: shop('solana_bulevar', 'Solana Fuel Bulevar', 'fuel_station', 'solana_bulevar', 'playa_dorada', null, { menu: ['coco_bravo', 'plantain_chips'], quickRepair: true }),
  solana_avenida_del_riel: shop('solana_avenida_del_riel', 'Solana Fuel Avenida del Riel', 'fuel_station', 'solana_avenida_del_riel', 'barrio_hierro', null, { menu: ['cafecito', 'coco_bravo'], quickRepair: true }),
  solana_las_lomas: shop('solana_las_lomas', 'Solana Fuel Las Lomas', 'fuel_station', 'solana_las_lomas', 'las_lomas', null, { menu: ['cafecito', 'coco_bravo'], quickRepair: true }),
  petromar_port_gate: shop('petromar_port_gate', 'Petromar Port Gate', 'fuel_station', 'petromar_port_gate', 'puerto_tamarindo', null, { menu: ['cafecito', 'coco_bravo', 'plantain_chips'], quickRepair: true }),
  petromar_cruce_norte: shop('petromar_cruce_norte', 'Petromar Cruce Norte', 'fuel_station', 'petromar_cruce_norte', 'los_pantanos', null, { menu: ['cafecito', 'coco_bravo', 'plantain_chips'], quickRepair: true }),
  // Rooms and phones
  motel_garza_azul: shop('motel_garza_azul', 'Motel Garza Azul', 'motel', 'motel_garza_azul', 'los_pantanos', null, { room: { fee: 60, saves: true, advanceHours: 8, clearsStarsAtMost: 1 } }),
  pim_phone_kiosk: shop('pim_phone_kiosk', "Pim's Phone Fix", 'phone_kiosk', 'galerias_aurora', 'centro', 'm08_clean_hands', { services: ['police_scanner', 'tile_pinger', 'phone_themes'] }),
});

/**
 * What each kind of shop does, its opening hours and the prices that are the same in every
 * branch (a shop's priceMultiplier scales them).
 */
export const SHOP_KINDS = freezeCatalog({
  gun_shop: { id: 'gun_shop', name: 'Gun shop', hours: [8, 22], mapIcon: 'pistol', sells: 'The weapons the branch lists, at weaponCatalog prices, once the weapon is unlocked; ammunition per magazine; body armour.', armorPrice: 1500, refusesAtStarsAbove: 0 },
  clothing_store: { id: 'clothing_store', name: 'Clothing store', hours: [9, 21], mapIcon: 'shirt', sells: 'Outfits from OUTFIT_CATALOG. Changing here unseen removes two stars (three at most).', refusesAtStarsAbove: 3 },
  paint_and_body_shop: { id: 'paint_and_body_shop', name: 'Paint and body shop', hours: null, mapIcon: 'spray_can', sells: 'Respray (clears the wanted level when unseen; price by star level in wantedLevels.js), full repair and a choice of paint.', repairPricePerDurabilityPoint: 1, repairMinimum: 100, paintPrice: 300, paintColors: ['#F2F0E8', '#1E1E20', '#8F8E8B', '#C8372D', '#1D4E7A', '#2F6F6A', '#E0B13C', '#F08A3C', '#F6A6B2', '#7FD6C8', '#5C3A21', '#6B2D5C'], refusesAtStarsAbove: 5 },
  mod_garage: { id: 'mod_garage', name: 'Tuning garage', hours: [7, 23], mapIcon: 'wrench', sells: 'Upgrades from VEHICLE_UPGRADES up to the branch\'s maxTier, repairs and paint.', repairPricePerDurabilityPoint: 0.8, repairMinimum: 80, paintPrice: 300, refusesAtStarsAbove: 0 },
  car_dealership: { id: 'car_dealership', name: 'Car dealership', hours: [9, 19], mapIcon: 'car', sells: 'Vehicles at vehicleCatalog prices, delivered to an owned garage with a free slot.', refusesAtStarsAbove: 0 },
  boat_dealer: { id: 'boat_dealer', name: 'Boat dealer', hours: [6, 20], mapIcon: 'anchor', sells: 'Boats at vehicleCatalog prices, delivered to an owned dock; rentals by the hour.', refusesAtStarsAbove: 0 },
  diner: { id: 'diner', name: 'Diner', hours: [6, 24], mapIcon: 'plate', sells: 'Food from FOOD_AND_DRINK for health.', refusesAtStarsAbove: 1 },
  bar_cantina: { id: 'bar_cantina', name: 'Bar', hours: [12, 4], mapIcon: 'glass', sells: 'Drinks and bar food; rumours that mark a golden tile on the map (one per visit, 200 dollars).', rumourPrice: 200, refusesAtStarsAbove: 1 },
  convenience_store: { id: 'convenience_store', name: 'Convenience store', hours: null, mapIcon: 'basket', sells: 'Snacks, soda and first-aid kits. The register can be held up once per in-game day.', robberyCrime: 'store_robbery', refusesAtStarsAbove: 1 },
  fuel_station: { id: 'fuel_station', name: 'Fuel station', hours: null, mapIcon: 'pump', sells: 'Snacks, and a quick repair that restores a vehicle to 60 percent durability and fixes its tyres.', quickRepairPrice: 150, quickRepairToFraction: 0.6, refusesAtStarsAbove: 1 },
  motel: { id: 'motel', name: 'Motel', hours: null, mapIcon: 'bed', sells: 'A room for the night: a save without owning anything.', refusesAtStarsAbove: 1 },
  phone_kiosk: { id: 'phone_kiosk', name: 'Phone kiosk', hours: [10, 21], mapIcon: 'phone', sells: 'Phone add-ons from PHONE_SERVICES.', refusesAtStarsAbove: 0 },
});

/**
 * Every property the leads can own. `price` 0 with an `unlockedBy`: handed over by that mission.
 * garageSlots count stored vehicles, boatSlips stored boats.
 */
export const PROPERTIES_FOR_SALE = freezeCatalog({
  tolliver_loft: property('tolliver_loft', 'The Loft over Tolliver Tow', 'safehouse', 'tolliver_tow', 'barrio_hierro', 0, 0, 'm01_hook_and_chain', { savePoint: true, garageSlots: 2, wardrobe: true, weaponLocker: true }, 'Dez\'s room above the lifts: a cot, a hot plate and the smell of gear oil. The first save point.'),
  loro_flat: property('loro_flat', 'Callejón del Loro No. 9', 'safehouse', 'callejon_del_loro_9', 'la_marisma', 0, 0, 'm03_stamped_and_sealed', { savePoint: true, garageSlots: 1, wardrobe: true, weaponLocker: true }, 'Sol\'s upstairs flat, with a street parking space and a parrot next door that repeats everything.'),
  cypress_lot_12: property('cypress_lot_12', 'Cypress Hollow, Lot 12', 'safehouse', 'cypress_hollow', 'los_pantanos', 12000, 0, 'm07_two_beer_problem', { savePoint: true, garageSlots: 1, wardrobe: true }, 'A trailer under the cypresses. The cheapest roof in Marazul, and nobody out here calls the police.'),
  dock_12_storage: property('dock_12_storage', 'Dock 12 Warehouse', 'business', 'dock_12_warehouse', 'puerto_tamarindo', 45000, 900, 'm05_night_shift', { savePoint: true, garageSlots: 6, weaponLocker: true, exportRamp: true }, 'The empty warehouse the tile truck is hidden in. Storage nobody asks about, and the ramp the export list ships from.'),
  hangar_3: property('hangar_3', 'Hangar 3', 'business', 'aerodromo_los_pantanos', 'los_pantanos', 60000, 600, 'm07_two_beer_problem', { savePoint: true, garageSlots: 4, weaponLocker: true, helipad: true }, 'A tin hangar on Big Clo\'s runway: four vehicles, a cot and a drag strip at the door.'),
  tolliver_tow_note: property('tolliver_tow_note', 'The Note on Tolliver Tow', 'business', 'tolliver_tow', 'barrio_hierro', 75000, 1800, 'm12_past_due', { freeRepairs: true, towTruckOnCall: true }, 'Pay off the loan for good. The garage earns again, repairs are free for both leads and Hattie sends the tow truck when called.'),
  prieto_charters_share: property('prieto_charters_share', 'A Share in Prieto Charters', 'business', 'marina_bahia_vista', 'bahia_vista', 80000, 1400, 'm06_charter_rates', { boatSlips: 2, freeBoatRental: true }, 'Half of Ozzy\'s charter shack and two slips on the fuel dock.'),
  dos_soles_share: property('dos_soles_share', 'A Share in Dos Soles Diner', 'business', 'dos_soles_diner', 'playa_dorada', 90000, 1300, 'm05_night_shift', { freeMeals: true }, 'The booth by the window is yours, and so is a third of the till.'),
  indigo_loft_31: property('indigo_loft_31', 'Torre Índigo, Loft 31', 'safehouse', 'torre_indigo', 'centro', 140000, 0, 'm05_night_shift', { savePoint: true, garageSlots: 2, wardrobe: true, weaponLocker: true }, 'Blue glass, thirty-one floors up, close to every bad idea downtown.'),
  el_remache_share: property('el_remache_share', 'A Share in El Remache', 'business', 'chatarreria_el_remache', 'barrio_hierro', 150000, 2600, 'm14_heavier_than_it_looks', { scrapAnyVehicle: true, freeNitroRefill: true }, 'Chispa\'s yard, a quarter yours. Any vehicle driven onto the scale is bought for scrap.'),
  suite_808: property('suite_808', 'Hotel Cielo Rosa, Suite 808', 'safehouse', 'hotel_cielo_rosa', 'playa_dorada', 180000, 0, 'm05_night_shift', { savePoint: true, garageSlots: 1, wardrobe: true, valet: true }, 'A pink deco suite over the beach with a valet who asks no questions and returns the car repaired.'),
  marina_5c: property('marina_5c', 'Residencias Marina, Unit 5C', 'safehouse', 'residencias_marina', 'bahia_vista', 260000, 0, 'm06_charter_rates', { savePoint: true, garageSlots: 2, boatSlips: 1, wardrobe: true, weaponLocker: true }, 'A waterfront condominium with its own slip, in sight of the casino.'),
  cabana_sotavento: property('cabana_sotavento', 'Cabaña Sotavento', 'safehouse', 'cabana_sotavento', 'isla_coral', 320000, 0, 'm14_heavier_than_it_looks', { savePoint: true, garageSlots: 1, boatSlips: 1, wardrobe: true }, 'The one modest house on the island: weathered boards, a dock and no neighbours who wave.'),
  club_salitre_deed: property('club_salitre_deed', 'Club Salitre', 'business', 'club_salitre', 'playa_dorada', 400000, 6000, 'm12_past_due', { vipEntrance: true, wardrobe: true }, 'The loudest nightclub on the strip, bought out from under the Circle. The best earner in the game.'),
  villa_buenaventura: property('villa_buenaventura', 'Villa Buenaventura', 'safehouse', 'villa_buenaventura', 'las_lomas', 650000, 0, 'm13_no_further_questions', { savePoint: true, garageSlots: 4, wardrobe: true, weaponLocker: true, pool: true }, 'A tile-roofed villa with a pool terrace and the whole city below it.'),
  casa_caracola: property('casa_caracola', 'Casa Caracola', 'safehouse', 'casa_caracola', 'isla_coral', 1800000, 0, 'm15_the_house_loses', { savePoint: true, garageSlots: 6, boatSlips: 2, helipad: true, wardrobe: true, weaponLocker: true, pool: true }, 'A spiral mansion on its own cove: six cars, two boats, a helipad and Santángel\'s old view.'),
});

/** Rules for owning property. */
export const PROPERTY_RULES = freezeCatalog({
  incomePaidEveryGameHours: 24,
  incomeAccumulatesDays: 3,
  collectBy: 'walking into the green dollar marker at the property',
  sharedBetweenLeads: true,
  saveAdvancesHours: 6,
  saveRestoresHealth: true,
  garageRepairsStoredVehicles: true,
  buySignColor: '#3FBF6A',
  ownedSignColor: '#FFC53D',
  kinds: ['safehouse', 'business'],
});

/**
 * Outfits, each a full set of pieces from the appearance vocabulary with hex colours, worn by
 * either lead. `tags` drive rules: formal opens the casino floor; work slows port guards'
 * detection by 40 percent; circle does the same for Circle guards.
 */
export const OUTFIT_CATALOG = freezeCatalog({
  boardwalk_loud: outfit('boardwalk_loud', 'Boardwalk Loud', ['casual', 'beach'], 180, null, 'open_shirt_over_tee', '#FF7A59', '#F2F0E8', 'shorts', '#2F6F6A', 'sandals', '#5A3A26', [['sunglasses', '#1E1E20']]),
  lifeguard_off_duty: outfit('lifeguard_off_duty', 'Lifeguard, Off Duty', ['casual', 'beach'], 140, null, 'tank', '#C8372D', null, 'shorts', '#F2F0E8', 'sneakers', '#F2F0E8', [['cap', '#C8372D']]),
  marisma_sunday: outfit('marisma_sunday', 'Marisma Sunday', ['casual'], 220, null, 'button_shirt', '#F4E4C1', null, 'chinos', '#8A7A62', 'loafers', '#5A3A26', [['sun_hat', '#E3D3A8']]),
  second_hand_bomber: outfit('second_hand_bomber', 'Second-Hand Bomber', ['casual'], 260, null, 'bomber', '#5B6B3A', '#26262B', 'jeans', '#2F4A6B', 'boots', '#3A2A1E', []),
  hierro_workwear: outfit('hierro_workwear', 'Hierro Workwear', ['work'], 150, null, 'vest', '#E8E23A', '#2F4A6B', 'cargo', '#3A3D40', 'boots', '#3A2A1E', [['hard_hat', '#F2C230'], ['gloves', '#C98A3A']]),
  remache_colours: outfit('remache_colours', 'Remache Colours', ['casual', 'gang'], 400, 'm04_sparks_fly', 'bomber', '#F08A3C', '#2B2B2E', 'jeans', '#26262B', 'sneakers', '#E9E4D8', [['bandana', '#F08A3C']]),
  jackal_leathers: outfit('jackal_leathers', 'Jackal Leathers', ['casual', 'gang'], 700, 'm07_two_beer_problem', 'leather_jacket', '#26262B', '#C9B84A', 'jeans', '#26262B', 'boots', '#1A1A1C', [['bandana', '#C9B84A'], ['gloves', '#1A1A1C']]),
  linea_blanca_office: outfit('linea_blanca_office', 'Línea Blanca Office', ['smart'], 900, null, 'blazer', '#2F3E52', '#F2F0E8', 'chinos', '#B89B5E', 'loafers', '#3A2A1E', [['watch', '#B8BCC2']]),
  bahia_linen: outfit('bahia_linen', 'Bahía Linen', ['smart', 'beach'], 1600, null, 'button_shirt', '#F4EFE6', null, 'chinos', '#D9C7A3', 'loafers', '#8A5A3A', [['sunglasses', '#5A3A26'], ['watch', '#C9A227']]),
  aurelia_gala_black: outfit('aurelia_gala_black', 'Aurelia Gala Black', ['formal'], 2400, null, 'suit_jacket', '#1E1E20', '#F2F0E8', 'suit_trousers', '#1E1E20', 'loafers', '#1A1A1C', [['tie', '#1E1E20'], ['watch', '#C9A227']]),
  lomas_tailored_grey: outfit('lomas_tailored_grey', 'Lomas Tailored Grey', ['formal'], 4800, null, 'suit_jacket', '#6E737A', '#C9D6E2', 'suit_trousers', '#6E737A', 'loafers', '#3A2A1E', [['tie', '#7C2E2E'], ['watch', '#B8BCC2']]),
  circle_cream_blazer: outfit('circle_cream_blazer', 'Circle Cream Blazer', ['formal', 'circle'], 0, 'm11_house_edge', 'blazer', '#EFE6D2', '#1E1E20', 'suit_trousers', '#1E1E20', 'loafers', '#1A1A1C', [['badge', '#C9A227'], ['sunglasses', '#1E1E20']]),
  record_keepers: outfit('record_keepers', "The Record Keeper's", ['formal'], 0, 'm16_for_the_record', 'suit_jacket', '#1D3557', '#F2F0E8', 'suit_trousers', '#1D3557', 'loafers', '#5A3A26', [['tie', '#E8B23A'], ['watch', '#C9A227'], ['sunglasses', '#1E1E20']]),
});

/**
 * Vehicle upgrades sold by tuning garages. Tier prices are a fraction of the vehicle's catalog
 * price with a floor (minimumPrice); flat upgrades have one price. Effects multiply the
 * vehicleCatalog handling numbers.
 */
export const VEHICLE_UPGRADES = freezeCatalog({
  engine: { id: 'engine', name: 'Engine', tiers: [{ priceFraction: 0.08, minimumPrice: 800, topSpeed: 1.05, acceleration: 1.08 }, { priceFraction: 0.14, minimumPrice: 2000, topSpeed: 1.1, acceleration: 1.16 }, { priceFraction: 0.22, minimumPrice: 5000, topSpeed: 1.15, acceleration: 1.25 }] },
  brakes: { id: 'brakes', name: 'Brakes', tiers: [{ priceFraction: 0.04, minimumPrice: 500, braking: 1.12 }, { priceFraction: 0.07, minimumPrice: 1200, braking: 1.25 }, { priceFraction: 0.1, minimumPrice: 2500, braking: 1.4 }] },
  tyres: { id: 'tyres', name: 'Tyres', tiers: [{ priceFraction: 0.03, minimumPrice: 400, grip: 1.05 }, { priceFraction: 0.06, minimumPrice: 1000, grip: 1.1 }, { priceFraction: 0.09, minimumPrice: 2200, grip: 1.16 }] },
  suspension: { id: 'suspension', name: 'Suspension', tiers: [{ priceFraction: 0.03, minimumPrice: 400, bodyRoll: 0.85 }, { priceFraction: 0.05, minimumPrice: 900, bodyRoll: 0.7 }, { priceFraction: 0.08, minimumPrice: 1800, bodyRoll: 0.55 }] },
  armor: { id: 'armor', name: 'Armour plating', requiresFeature: 'vehicle_armor_upgrades', tiers: [{ priceFraction: 0.1, minimumPrice: 3000, durability: 1.25, mass: 1.04 }, { priceFraction: 0.18, minimumPrice: 7000, durability: 1.5, mass: 1.08 }, { priceFraction: 0.3, minimumPrice: 15000, durability: 2, mass: 1.14 }] },
  nitro: { id: 'nitro', name: 'Nitro', price: 6000, boostAcceleration: 1.6, boostSeconds: 3, rechargeSeconds: 20 },
  bulletproof_tyres: { id: 'bulletproof_tyres', name: 'Run-flat tyres', price: 4000, immuneTo: ['gunfire'], spikeStripDamageMultiplier: 0.5 },
  pearl_paint: { id: 'pearl_paint', name: 'Pearl paint', price: 1200, finish: 'pearlescent' },
});

/** Food and drink: what it costs and the health it restores (the lead's health is 100). */
export const FOOD_AND_DRINK = freezeCatalog({
  cafecito: { id: 'cafecito', name: 'Cafecito', price: 4, health: 10 },
  coco_bravo: { id: 'coco_bravo', name: 'Coco Bravo soda', price: 3, health: 8 },
  plantain_chips: { id: 'plantain_chips', name: 'Plantain chips', price: 5, health: 12 },
  empanada: { id: 'empanada', name: 'Empanada', price: 8, health: 25 },
  key_lime_slice: { id: 'key_lime_slice', name: 'Key lime slice', price: 9, health: 25 },
  pressed_sandwich: { id: 'pressed_sandwich', name: 'Pressed sandwich', price: 14, health: 50 },
  two_suns_breakfast: { id: 'two_suns_breakfast', name: 'Two Suns breakfast', price: 22, health: 100 },
  plato_del_dia: { id: 'plato_del_dia', name: 'Plato del día', price: 18, health: 100 },
  stevedore_plate: { id: 'stevedore_plate', name: 'Stevedore plate', price: 24, health: 100 },
  swamp_boil: { id: 'swamp_boil', name: 'Swamp boil', price: 20, health: 100 },
  cerveza_faro: { id: 'cerveza_faro', name: 'Cerveza Faro', price: 6, health: 15, cameraSwaySeconds: 20 },
  first_aid_kit: { id: 'first_aid_kit', name: 'First-aid kit', price: 120, health: 100, carried: true, carryLimit: 3 },
});

/** Phone add-ons from Pim's kiosk and favours La Notaria sells from her booth. */
export const PHONE_SERVICES = freezeCatalog({
  police_scanner: { id: 'police_scanner', name: 'Police scanner', price: 5000, effect: 'Search cones and roadblocks are drawn on the minimap.' },
  tile_pinger: { id: 'tile_pinger', name: 'Tile pinger', price: 8000, effect: 'The phone buzzes within 80 m of a golden tile for either lead.' },
  phone_themes: { id: 'phone_themes', name: 'Phone themes', price: 150, effect: 'Six colour themes for the phone interface.' },
  la_notaria_favours: { id: 'la_notaria_favours', name: "La Notaria's favours", price: null, effect: 'Bribes by phone (prices in wantedLevels.js) and clean plates for one stored vehicle (2,000 dollars).', cleanPlatesPrice: 2000 },
});

/** Builds one shop entry. */
function shop(id, name, kind, landmark, district, unlockedBy, stock) {
  return { id, name, kind, landmark, district, unlockedBy, priceMultiplier: 1, ...stock };
}

/** Builds one property entry. */
function property(id, name, kind, landmark, district, price, incomePerDay, unlockedBy, perks, description) {
  return { id, name, kind, landmark, district, price, incomePerDay, unlockedBy, perks, description };
}

/** Builds one outfit from vocabulary pieces; `under` is the layer beneath an open top, or null. */
function outfit(id, name, tags, price, unlockedBy, top, topColor, under, bottom, bottomColor, shoes, shoeColor, accessories) {
  const topPiece = under ? { piece: top, color: topColor, secondaryColor: under } : { piece: top, color: topColor };
  return {
    id, name, tags, price, unlockedBy,
    top: topPiece,
    bottom: { piece: bottom, color: bottomColor },
    shoes: { piece: shoes, color: shoeColor },
    accessories: accessories.map(([piece, color]) => ({ piece, color })),
  };
}

/** Recursively freezes a plain data tree so that no system can mutate the shared catalog. */
function freezeCatalog(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) freezeCatalog(value[key]);
  }
  return value;
}
