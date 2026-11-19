// Everything to do in Marazul between story missions: fourteen side activities (jobs driven
// from a vehicle, races on road, water and runway, challenges and collectibles), each with how
// it starts, its rules as parameters, its reward formula and its medal tiers.
// Plain frozen data, no imports.
//
// Ids: landmarks and districts from cityDistricts.js, vehicles and classes from
// vehicleCatalog.js, missions from storyMissions.js, characters from storyCharacters.js,
// factions and members from gangsAndFactions.js, weapons from weaponCatalog.js. Distances in
// metres, times in seconds, speeds in metres per second, money in whole dollars. A medal's
// `atLeast` or `atMost` is measured in the unit its activity names in `medalMetric`.

/**
 * The side activities keyed by id.
 * @type {Readonly<Record<string, object>>}
 */
export const SIDE_ACTIVITIES = freezeCatalog({
  repo_orders: {
    id: 'repo_orders', name: 'Repo Orders', kind: 'job', lead: 'either', unlockedBy: 'm01_hook_and_chain', hours: null,
    description: 'Aunt Hattie\'s clipboard: find the car that is behind on its payments, hook it with the tow truck and bring it back in one piece. Later orders have owners who object.',
    start: { how: 'enter_vehicle', vehicle: 'pickup_truck', livery: 'tolliver_tow', at: ['tolliver_tow'], prompt: 'Press Y to take a repo order' },
    rules: { orders: 12, targetClassesByOrder: ['compact', 'sedan', 'pickup', 'suv', 'classic', 'muscle', 'van', 'sports', 'luxury', 'offroad', 'sports', 'super'], searchRadius: 60, hookHoldSeconds: 3, maxDamageFraction: 0.5, timeLimitBase: 240, timeLimitPerKm: 45, ownerChasesFromOrder: 5, ownerCrew: { vehicle: 'muscle_car', count: 2 }, hookLostSeconds: 20, deliverTo: 'tolliver_tow' },
    reward: { formula: 'base + perOrder * orderNumber, times (1 - damageFraction)', base: 300, perOrder: 150, reputationPerOrder: 15, completionBonus: { cash: 6000, perk: 'Tow truck hooks in 1 second' } },
    medalMetric: 'orders completed in one shift', medals: medals(3, 400, 6, 1200, 12, 3000),
    wantedRisk: 1,
  },
  taxi_fares: {
    id: 'taxi_fares', name: 'Taxi Fares', kind: 'job', lead: 'either', unlockedBy: 'm01_hook_and_chain', hours: null,
    description: 'Borrow a Tavira Estela Cab and work the meter. Passengers pay for distance, tip for speed and stop tipping when they scream.',
    start: { how: 'enter_vehicle', vehicle: 'taxi_cab', at: [], prompt: 'Press Y to start the meter' },
    rules: { pickupRadius: 250, stopSeconds: 1.5, farePerKm: 90, flagFall: 20, timeLimitBase: 35, timeLimitPerKm: 55, tipMaxFraction: 0.5, tipLostPerCollision: 0.15, passengerLeavesAtDamageFraction: 0.6, streakEvery: 5, shiftEndsOn: ['leave_vehicle', 'timer_expired', 'vehicle_destroyed', 'wanted_stars_2'] },
    reward: { formula: 'flagFall + farePerKm * km + tip; every fifth fare in a row pays streakBonus * streak', streakBonus: 250, reputationPerFare: 4, completionBonus: { fares: 50, cash: 5000, perk: 'Taxis are free to ride as a passenger' } },
    medalMetric: 'fares in a row', medals: medals(5, 300, 10, 900, 20, 2500),
    wantedRisk: 0,
  },
  gaviota_courier: {
    id: 'gaviota_courier', name: 'Gaviota Express Runs', kind: 'job', lead: 'either', unlockedBy: 'm03_stamped_and_sealed', hours: [6, 22],
    description: 'Parcel rounds in a Gaviota Express van: a route of doorsteps, a clock and a cargo of things marked fragile. La Notaria adds the occasional envelope that is not on the manifest.',
    start: { how: 'enter_vehicle', vehicle: 'cargo_van', livery: 'gaviota_express', at: ['terminal_central', 'mercado_marisma', 'petromar_port_gate'], prompt: 'Press Y to start a round' },
    rules: { rounds: 10, parcelsFirstRound: 4, parcelsAddedPerRound: 1, dropRadius: 5, stopSeconds: 1, timePerParcel: 50, fragileDamagePerCollision: 0.12, parcelLostAtFragility: 0, specialEnvelopeEveryRound: 3, specialEnvelopeBonus: 400 },
    reward: { formula: 'perParcel * delivered * cargoCondition + timeBonusPerSecond * secondsLeft', perParcel: 110, timeBonusPerSecond: 6, reputationPerRound: 20, completionBonus: { cash: 7000, perk: 'Vans and trucks take 20 percent less damage' } },
    medalMetric: 'rounds completed in one shift', medals: medals(3, 500, 6, 1500, 10, 3500),
    wantedRisk: 0,
  },
  linea_12_bus: {
    id: 'linea_12_bus', name: 'Línea 12', kind: 'job', lead: 'either', unlockedBy: 'm16_for_the_record', hours: [5, 23],
    description: 'Drive the number 12 for Metro Marazul: every stop from Terminal Central to the beach and back, on time and without making the standing passengers fall over.',
    start: { how: 'enter_vehicle', vehicle: 'city_bus', at: ['terminal_central'], prompt: 'Press Y to start the route' },
    rules: { stops: ['terminal_central', 'plaza_de_la_marea', 'mercado_marisma', 'muelle_dorado', 'hotel_cielo_rosa', 'galerias_aurora', 'terminal_central'], stopRadius: 7, doorSeconds: 4, secondsPerKmAllowed: 85, comfortLostPerHardBrake: 0.08, hardBrakeDeceleration: 7, comfortLostPerCollision: 0.25, routeFailsAtComfort: 0 },
    reward: { formula: 'perStop * stops * comfort + punctualityBonus when no stop is late', perStop: 140, punctualityBonus: 600, reputationPerRoute: 30, completionBonus: { routes: 5, cash: 4000, perk: 'Buses can be boarded as a fast-travel ride' } },
    medalMetric: 'comfort percent at the end of a route', medals: medals(50, 400, 75, 1000, 95, 2500),
    wantedRisk: 0,
  },
  paramedic_runs: {
    id: 'paramedic_runs', name: 'Paramedic Runs', kind: 'job', lead: 'either', unlockedBy: 'm13_no_further_questions', hours: null,
    description: 'Take an ambulance out for Marazul Fire and Rescue: collect patients, keep the ride smooth and reach a hospital before each patient\'s clock runs out.',
    start: { how: 'enter_vehicle', vehicle: 'ambulance', at: ['hospital_santa_brisa', 'clinica_las_lomas', 'bomberos_no_1'], prompt: 'Press Y to go on call' },
    rules: { levels: 10, patientsAtLevel1: 1, patientsAddedPerLevel: 1, maxPatientsAboard: 3, patientClockSeconds: 110, clockLostPerCollision: 8, pickupRadius: 5, stopSeconds: 2, deliverToKinds: ['hospital'], sirenClearsTraffic: true },
    reward: { formula: 'perPatient * patients * level', perPatient: 120, reputationPerLevel: 15, completionBonus: { cash: 8000, perk: 'Maximum health rises to 125' } },
    medalMetric: 'level reached', medals: medals(3, 500, 6, 1500, 10, 4000),
    wantedRisk: 0,
  },
  vigilante_calls: {
    id: 'vigilante_calls', name: 'Vigilante Calls', kind: 'job', lead: 'either', unlockedBy: 'm08_clean_hands', hours: null,
    description: 'Detective Whitlock forwards the calls nobody at the precinct will take. Chase down the suspects and stop them, by any means that leaves the bystanders standing.',
    start: { how: 'phone', contact: 'amara_whitlock', alsoFromVehicleFlag: 'law_enforcement', at: [], prompt: 'Call Whitlock: Take a call' },
    rules: { levels: 12, suspectsAtLevel1: 1, suspectVehiclesByLevel: ['compact_hatch', 'family_sedan', 'pickup_truck', 'muscle_car', 'cargo_van', 'suv', 'sport_motorcycle', 'sports_coupe', 'offroad_4x4', 'luxury_sedan', 'speedboat', 'supercar'], suspectFactions: ['la_corriente', 'los_remaches', 'aurelia_circle'], timeLimitBase: 150, timeAddedPerLevel: 10, escapeDistance: 350, stopBy: ['damage', 'driver_down'], civilianCasualtyPenalty: 300, noHeatFromSuspects: true },
    reward: { formula: 'base * level - civilianCasualtyPenalty * casualties', base: 220, reputationPerLevel: 25, completionBonus: { cash: 12000, perk: 'Body armour is free at gun shops' } },
    medalMetric: 'level reached', medals: medals(4, 800, 8, 2500, 12, 6000),
    wantedRisk: 1,
  },
  street_races: {
    id: 'street_races', name: 'Street Races', kind: 'race', lead: 'either', unlockedBy: 'm04_sparks_fly', hours: [19, 5],
    description: 'Los Remaches run the night races: a buy-in, five rivals and a route through live traffic. Win one to open the next; the police take an interest at the finish.',
    start: { how: 'marker', contact: 'jacinto_roldan', at: ['chatarreria_el_remache', 'muelle_dorado', 'plaza_de_la_marea', 'mirador_del_halcon', 'marina_bahia_vista', 'petromar_cruce_norte'], prompt: 'Press E to enter the race' },
    rules: { opponents: 5, trafficDensityMultiplier: 0.6, offCourseSeconds: 15, wrongWayResetSeconds: 4, rubberBand: 0.12, policeChanceAtFinish: 0.35, policeStarsAtFinish: 2, ownVehicleRequired: true },
    events: [
      race('rivet_run', 'The Rivet Run', 'barrio_hierro', ['chatarreria_el_remache', 'estadio_la_fragua', 'patio_ferroviario', 'chatarreria_el_remache'], 2, ['muscle', 'sports', 'compact', 'sedan', 'classic'], 500, 2500, 0.7),
      race('bulevar_sprint', 'Bulevar Sprint', 'playa_dorada', ['muelle_dorado', 'hotel_cielo_rosa', 'club_salitre', 'solana_bulevar'], 1, ['sports', 'super', 'muscle', 'classic', 'motorcycle'], 1000, 5000, 0.74),
      race('gran_via_dash', 'Gran Vía Dash', 'centro', ['plaza_de_la_marea', 'banco_meridiano_tower', 'terminal_central', 'tribunal_del_golfo', 'plaza_de_la_marea'], 3, ['sports', 'super', 'muscle', 'luxury', 'sedan'], 2000, 9000, 0.78),
      race('switchback_descent', 'Switchback Descent', 'las_lomas', ['mirador_del_halcon', 'parque_las_terrazas', 'solana_las_lomas', 'capa_fresca_lomas'], 1, ['sports', 'super', 'motorcycle', 'compact'], 3000, 14000, 0.82),
      race('causeway_charge', 'Causeway Charge', 'bahia_vista', ['marina_bahia_vista', 'the_aurelia', 'coral_beach_club', 'faro_del_coral'], 1, ['super', 'sports', 'motorcycle'], 5000, 24000, 0.86),
      race('mudline_rally', 'Mudline Rally', 'los_pantanos', ['petromar_cruce_norte', 'mudline_roadhouse', 'cypress_hollow', 'aerodromo_los_pantanos', 'petromar_cruce_norte'], 2, ['offroad', 'pickup', 'suv', 'motorcycle'], 2500, 12000, 0.8),
    ],
    reward: { formula: 'first place takes prize; second gets the buy-in back; third and below lose the buy-in', reputationPerWin: 60, completionBonus: { cash: 20000, perk: 'Nitro refills 50 percent faster' } },
    medalMetric: 'finishing place (3 bronze, 2 silver, 1 gold)', medals: medals(3, 0, 2, 0, 1, 0),
    wantedRisk: 2,
  },
  time_trials: {
    id: 'time_trials', name: 'Time Trials', kind: 'race', lead: 'either', unlockedBy: 'm04_sparks_fly', hours: null,
    description: 'A stopwatch, a course of gates and nobody to blame. Each trial supplies its vehicle, so the times are comparable.',
    start: { how: 'marker', at: ['estadio_la_fragua', 'galerias_aurora', 'mirador_del_halcon', 'terminal_tamarindo', 'solana_avenida_del_riel', 'reserva_punta_coral'], prompt: 'Press E to start the trial' },
    rules: { trafficOnCourse: false, missedGatePenaltySeconds: 3, resetKeyReturnsToLastGate: true, ghostOfBestRun: true },
    events: [
      trial('forge_lot_gymkhana', 'Forge Lot Gymkhana', 'estadio_la_fragua', 'compact_hatch', 18, 75, 62, 54),
      trial('aurora_deck_spiral', 'Aurora Deck Spiral', 'galerias_aurora', 'sport_motorcycle', 14, 70, 58, 50),
      trial('halcon_hillclimb', 'Halcón Hillclimb', 'mirador_del_halcon', 'sports_coupe', 22, 120, 104, 94),
      trial('container_maze', 'Container Maze', 'terminal_tamarindo', 'pickup_truck', 20, 110, 95, 84),
      trial('riel_avenue_blast', 'Riel Avenue Blast', 'solana_avenida_del_riel', 'muscle_car', 12, 80, 68, 60),
      trial('punta_coral_dunes', 'Punta Coral Dunes', 'reserva_punta_coral', 'offroad_4x4', 16, 105, 90, 80),
    ],
    reward: { formula: 'medal prize, paid once per medal', reputationPerGold: 40, completionBonus: { cash: 15000, perk: 'Handbrake turns lose 15 percent less speed' } },
    medalMetric: 'seconds (lower is better); each event lists its own bronze, silver and gold times', medals: medals(null, 500, null, 1500, null, 4000),
    wantedRisk: 0,
  },
  boat_races: {
    id: 'boat_races', name: 'Boat Races', kind: 'race', lead: 'either', unlockedBy: 'm06_charter_rates', hours: [7, 20],
    description: 'Ozzy Prieto\'s buoy races for charter skippers with something to prove. Swell, wakes and three rivals in Pez Velas.',
    start: { how: 'marker', contact: 'ozzy_prieto', at: ['marina_bahia_vista', 'muelle_dorado', 'astilleros_olabarria', 'coral_beach_club'], prompt: 'Press E to enter the race' },
    rules: { opponents: 3, vehicle: 'speedboat', providedVehicle: true, buoyRadius: 14, missedBuoyPenaltySeconds: 5, stormCancels: true },
    events: [
      race('bay_buoys', 'Bahía Buoys', 'bahia_vista', ['marina_bahia_vista', 'helipuerto_bahia', 'paseo_de_las_palmas', 'marina_bahia_vista'], 2, ['boat'], 500, 3000, 0.7),
      race('pier_to_light', 'Pier to Light', 'playa_dorada', ['muelle_dorado', 'coral_beach_club', 'faro_del_coral'], 1, ['boat'], 1000, 6000, 0.76),
      race('estuary_slalom', 'Estuary Slalom', 'puerto_tamarindo', ['astilleros_olabarria', 'terminal_tamarindo', 'cobertizo_del_camaronero', 'astilleros_olabarria'], 1, ['boat'], 2000, 10000, 0.8),
      race('round_the_island', 'Round the Island', 'isla_coral', ['coral_beach_club', 'villa_santangel', 'faro_del_coral', 'cabana_sotavento', 'coral_beach_club'], 2, ['boat'], 4000, 20000, 0.85),
    ],
    reward: { formula: 'first place takes prize; second gets the buy-in back', reputationPerWin: 60, completionBonus: { cash: 15000, perk: 'A Pez Vela is delivered free to any owned dock' } },
    medalMetric: 'finishing place (3 bronze, 2 silver, 1 gold)', medals: medals(3, 0, 2, 0, 1, 0),
    wantedRisk: 0,
  },
  airstrip_drags: {
    id: 'airstrip_drags', name: 'Airstrip Drags', kind: 'race', lead: 'either', unlockedBy: 'm07_two_beer_problem', hours: null,
    description: 'Four hundred metres of cracked runway and a Marsh Jackal waving a shrimp net for a flag. A ladder of eight rivals, pink slips on the last one.',
    start: { how: 'marker', contact: 'clovis_arceneaux', at: ['aerodromo_los_pantanos'], prompt: 'Press E to line up' },
    rules: { distance: 400, ladder: [{ rival: 'jackal_rider', vehicle: 'chopper_motorcycle', time: 14.8 }, { rival: 'jackal_rider', vehicle: 'pickup_truck', time: 14.2 }, { rival: 'remache_racer', vehicle: 'compact_hatch', time: 13.6 }, { rival: 'jackal_rider', vehicle: 'offroad_4x4', time: 13.1 }, { rival: 'remache_racer', vehicle: 'muscle_car', time: 12.4 }, { rival: 'remache_racer', vehicle: 'sports_coupe', time: 11.8 }, { rival: 'jackal_rider', vehicle: 'sport_motorcycle', time: 11.1 }, { rival: 'clovis_arceneaux', vehicle: 'muscle_car', time: 10.6 }], manualLaunch: { perfectWindowSeconds: 0.25, jumpStartPenaltySeconds: 1 }, shiftKeys: true, ownVehicleRequired: true },
    reward: { formula: 'stake * rung; the last rung also pays the rival\'s car', stake: 1000, reputationPerWin: 30, completionBonus: { cash: 10000, vehicle: 'muscle_car', perk: 'Launch control: perfect-start window doubles' } },
    medalMetric: 'rungs beaten', medals: medals(3, 0, 6, 0, 8, 0),
    wantedRisk: 0,
  },
  export_list: {
    id: 'export_list', name: 'The Export List', kind: 'challenge', lead: 'either', unlockedBy: 'm05_night_shift', hours: null,
    description: 'A chalkboard at Dock 12 lists ten vehicles a buyer overseas will pay for. Find each on the street, steal it, lose any police and deliver it clean to the export ramp.',
    start: { how: 'automatic', at: ['dock_12_warehouse'], prompt: 'Deliver a listed vehicle to Dock 12' },
    rules: { lists: [['compact_hatch', 'family_sedan', 'pickup_truck', 'cargo_van', 'suv', 'convertible_cruiser', 'muscle_car', 'offroad_4x4', 'chopper_motorcycle', 'sport_motorcycle'], ['luxury_sedan', 'sports_coupe', 'supercar', 'taxi_cab', 'box_truck', 'city_bus', 'ambulance', 'police_cruiser', 'speedboat', 'swat_van']], deliverTo: 'dock_12_warehouse', boatsDeliverTo: 'terminal_tamarindo', requiresStars: 0, requiresProperty: 'dock_12_storage', minConditionFraction: 0.3 },
    reward: { formula: 'vehicle exportValue (or flatValue when it has none) * condition, +25 percent in the listed colour', flatValue: 15000, reputationPerVehicle: 25, listBonus: [25000, 80000], completionBonus: { cash: 0, perk: 'Listed vehicles can be ordered to any owned garage' } },
    medalMetric: 'vehicles delivered', medals: medals(5, 0, 10, 0, 20, 0),
    wantedRisk: 2,
  },
  turf_rampages: {
    id: 'turf_rampages', name: 'Turf Rampages', kind: 'challenge', lead: 'either', unlockedBy: 'm09_weigh_her_again', hours: null,
    description: 'Eight red rivet-and-anchor markers on hostile turf. Touch one and a clock starts: clear the quota with the weapon supplied before it runs out.',
    start: { how: 'marker', at: ['bodega_siete', 'cantina_la_sentina', 'astilleros_olabarria', 'lux_marea', 'coral_beach_club', 'the_aurelia', 'frigorificos_golfo', 'club_salitre'], prompt: 'Press E to start the rampage' },
    rules: { events: [
      rampage('sentina_last_orders', 'cantina_la_sentina', 'la_corriente', 'baseball_bat', 12, 120),
      rampage('warehouse_seven', 'bodega_siete', 'la_corriente', 'pump_shotgun', 20, 120),
      rampage('cold_storage', 'frigorificos_golfo', 'la_corriente', 'smg', 25, 120),
      rampage('slipway_fire', 'astilleros_olabarria', 'la_corriente', 'fire_bottle', 18, 120),
      rampage('velvet_rope', 'lux_marea', 'aurelia_circle', 'pistol', 16, 120),
      rampage('salt_and_neon', 'club_salitre', 'aurelia_circle', 'heavy_revolver', 16, 120),
      rampage('cabana_service', 'coral_beach_club', 'aurelia_circle', 'assault_rifle', 30, 120),
      rampage('valet_parking', 'the_aurelia', 'aurelia_circle', 'rocket_launcher', 12, 120),
    ], unlimitedAmmo: true, noHeatDuringRampage: true, healthPickupEveryKills: 8, targetsAreVehiclesFor: ['rocket_launcher'] },
    reward: { formula: 'prize per rampage passed', prize: 3000, reputationPerRampage: 50, completionBonus: { cash: 25000, perk: 'Armour capacity rises to 150' } },
    medalMetric: 'rampages passed', medals: medals(2, 0, 5, 0, 8, 0),
    wantedRisk: 0,
  },
  stunt_jumps: {
    id: 'stunt_jumps', name: 'Stunt Jumps', kind: 'challenge', lead: 'either', unlockedBy: null, hours: null,
    description: 'Fifteen ramps the city did not mean to build. Take one fast enough, land on the wheels beyond the mark and the camera gives you a slow-motion replay.',
    start: { how: 'automatic', at: [], prompt: null },
    rules: { jumps: [
      jump('pier_end_leap', 'Pier-End Leap', 'muelle_dorado', 28, 35, true), jump('lifeguard_ramp', 'Lifeguard Ramp', 'hotel_pelicano', 22, 22, false), jump('deck_to_deck', 'Deck to Deck', 'galerias_aurora', 24, 26, false),
      jump('fountain_hop', 'Tide-Clock Hop', 'plaza_de_la_marea', 20, 18, false), jump('market_awning', 'Market Awning', 'mercado_marisma', 19, 16, false), jump('gantry_gap', 'Gantry Gap', 'terminal_tamarindo', 27, 30, false),
      jump('dry_dock_drop', 'Dry-Dock Drop', 'astilleros_olabarria', 25, 28, true), jump('crusher_ramp', 'Crusher Ramp', 'chatarreria_el_remache', 23, 24, false), jump('boxcar_run', 'Boxcar Run', 'patio_ferroviario', 26, 32, false),
      jump('hawks_drop', "Hawk's Drop", 'mirador_del_halcon', 30, 45, false), jump('terrace_steps', 'Terrace Steps', 'parque_las_terrazas', 21, 20, false), jump('valet_flyover', 'Valet Flyover', 'the_aurelia', 26, 27, false),
      jump('causeway_kicker', 'Causeway Kicker', 'coral_beach_club', 29, 34, true), jump('runway_berm', 'Runway Berm', 'aerodromo_los_pantanos', 32, 48, false), jump('levee_launch', 'Levee Launch', 'cobertizo_del_camaronero', 24, 26, true),
    ], mustLandOnWheels: true, slowMotionFactor: 0.35, replaySeconds: 4, boatsAndBikesCount: true },
    reward: { formula: 'perJump on the first clean landing of each', perJump: 500, reputationPerJump: 10, completionBonus: { cash: 15000, perk: 'Bikes never throw the rider on a landing' } },
    medalMetric: 'jumps landed', medals: medals(5, 1000, 10, 3000, 15, 8000),
    wantedRisk: 0,
  },
  golden_tiles: {
    id: 'golden_tiles', name: 'Golden Tiles', kind: 'collectible', lead: 'either', unlockedBy: 'm02_twice_the_weight', hours: null,
    description: 'Sixty glazed tiles that fell off the Circle\'s trucks, boats and balance sheets, hidden across the city. They glint at golden hour; Sol\'s Inspector\'s Eye shows them on the minimap from 60 m.',
    start: { how: 'automatic', at: [], prompt: null },
    rules: { total: 60, perDistrict: { playa_dorada: 7, centro: 7, la_marisma: 7, puerto_tamarindo: 8, barrio_hierro: 7, las_lomas: 6, bahia_vista: 7, isla_coral: 5, los_pantanos: 6 }, pickupRadius: 1.5, glintRange: 40, glintStrongestHours: [18, 19.5], hidingPlaces: ['rooftop', 'under_pier', 'alley_dead_end', 'container_top', 'garden_wall', 'dock_piling', 'jump_landing', 'interior_corner'] },
    reward: { formula: 'perTile each, plus a milestone every ten', perTile: 400, reputationPerTile: 5, milestones: [{ tiles: 10, cash: 2000, gift: 'pistol ammunition is delivered to every safehouse' }, { tiles: 20, cash: 4000, gift: 'body armour at every safehouse' }, { tiles: 30, cash: 6000, gift: 'smg at every safehouse' }, { tiles: 40, cash: 10000, gift: 'assault_rifle at every safehouse' }, { tiles: 50, cash: 15000, gift: 'sniper_rifle at every safehouse' }, { tiles: 60, cash: 60000, gift: 'a gold-painted Ravello Saeta in the Dock 12 warehouse' }], completionBonus: { cash: 0, perk: 'Gold paint at every Capa Fresca' } },
    medalMetric: 'tiles found', medals: medals(20, 0, 40, 0, 60, 0),
    wantedRisk: 0,
  },
});

/** Activity ids in the order the phone's Jobs app lists them. */
export const SIDE_ACTIVITY_ORDER = Object.freeze([
  'repo_orders', 'taxi_fares', 'gaviota_courier', 'linea_12_bus', 'paramedic_runs', 'vigilante_calls',
  'street_races', 'time_trials', 'boat_races', 'airstrip_drags',
  'export_list', 'turf_rampages', 'stunt_jumps', 'golden_tiles',
]);

/** Rules shared by every activity. */
export const SIDE_ACTIVITY_RULES = freezeCatalog({
  kinds: ['job', 'race', 'challenge', 'collectible'],
  startHows: ['enter_vehicle', 'marker', 'phone', 'automatic'],
  cannotStartAtStarsAbove: 0,
  cannotStartDuringMission: true,
  quitKeyAction: 'activity_quit',
  markerColors: { job: '#3DE0D0', race: '#FF4FA3', challenge: '#F28C28', collectible: '#FFC53D' },
  medalNames: ['bronze', 'silver', 'gold'],
  medalReputation: { bronze: 10, silver: 25, gold: 60 },
  completionPercentWeight: { job: 3, race: 3, challenge: 2, collectible: 2 },
});

/** Builds the three medal tiers: the score each needs and the one-off cash prize it pays. */
function medals(bronze, bronzeCash, silver, silverCash, gold, goldCash) {
  return { bronze: { score: bronze, cash: bronzeCash }, silver: { score: silver, cash: silverCash }, gold: { score: gold, cash: goldCash } };
}

/** Builds one race event: route landmarks, laps, allowed vehicle classes, buy-in, prize, rival skill. */
function race(id, name, district, via, laps, classes, buyIn, prize, rivalSkill) {
  return { id, name, district, via, laps, classes, buyIn, prize, rivalSkill };
}

/** Builds one time trial: where it starts, the vehicle supplied, gates, and the medal times. */
function trial(id, name, landmark, vehicle, gates, bronzeSeconds, silverSeconds, goldSeconds) {
  return { id, name, landmark, vehicle, gates, bronzeSeconds, silverSeconds, goldSeconds };
}

/** Builds one rampage: where, against whom, with which weapon, how many, how long. */
function rampage(id, landmark, faction, weapon, quota, seconds) {
  return { id, landmark, faction, weapon, quota, seconds };
}

/** Builds one stunt jump: the ramp's landmark, the take-off speed and distance needed, and whether it lands in water range. */
function jump(id, name, landmark, minSpeed, minDistance, overWater) {
  return { id, name, landmark, minSpeed, minDistance, overWater };
}

/** Recursively freezes a plain data tree so that no system can mutate the shared catalog. */
function freezeCatalog(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) freezeCatalog(value[key]);
  }
  return value;
}
