// The story of MARAZUL as data: sixteen missions in three acts and an epilogue. Each mission
// names its giver, where it starts, what the player does step by step (objective kinds the
// mission runner implements), how it fails, the wanted level it provokes, what it pays and
// unlocks, and its opening and closing dialogue. Plain frozen data, no imports.
//
// The plot: Don Aurelio Santángel launders gold through Puerto Tamarindo as glazed bathroom
// tiles (boat -> cold store -> rail yard -> foundry -> the casino's golden pool) and records
// every payoff in a blue ledger. Sol Arrieta, the customs inspector he had fired, and Dez
// Tolliver, whose family garage he is foreclosing on, take the gold, the port, the captain and
// finally the ledger away from him.
//
// Ids: characters from storyCharacters.js, districts and landmarks from cityDistricts.js,
// vehicles from vehicleCatalog.js, enemies from FACTION_MEMBERS in gangsAndFactions.js, shops,
// properties and outfits from shopsAndProperties.js, activities from sideActivities.js, weapons
// from weaponCatalog.js. Distances in metres, times in seconds, clock hours 0 to 24, money in
// whole dollars. `lead` is the lead the mission is played as ('either': whoever is active).

/**
 * The sixteen story missions keyed by id.
 * @type {Readonly<Record<string, object>>}
 */
export const STORY_MISSIONS = freezeCatalog({
  m01_hook_and_chain: {
    id: 'm01_hook_and_chain', order: 1, act: 1, title: 'Hook and Chain',
    giver: 'hattie_tolliver', lead: 'dez_tolliver', requires: [], minRank: 0,
    start: { district: 'barrio_hierro', landmark: 'tolliver_tow', hours: null },
    summary: 'A pearl-white Lucero Regente is three payments behind and parked on the valet row of Hotel Cielo Rosa. Dez takes the tow rig across town to hook it and learns whose driver it belongs to.',
    objectives: [
      step('enter_vehicle', 'Get in the Tolliver tow truck', { vehicle: 'pickup_truck', livery: 'tolliver_tow', at: 'tolliver_tow' }),
      step('go_to', 'Drive to Hotel Cielo Rosa', { landmark: 'hotel_cielo_rosa', radius: 14, by: 'vehicle' }),
      step('tow_vehicle', 'Back up to the Regente and hook it', { target: 'luxury_sedan', color: '#F1EEE6', holdSeconds: 3, alignDegrees: 20 }),
      step('escape_pursuit', 'Shake the men in cream blazers', { pursuers: [{ vehicle: 'suv', crew: 'circle_guard', count: 2 }], loseDistance: 160, loseSeconds: 10, maxHookLostSeconds: 20 }),
      step('deliver_vehicle', 'Tow the Regente back to the garage', { target: 'luxury_sedan', landmark: 'tolliver_tow', radius: 10, maxDamageFraction: 0.6 }),
    ],
    failConditions: [fail('lead_dead', 'Dez flatlined'), fail('lead_busted', 'Dez got cuffed'), fail('vehicle_destroyed', 'The tow truck was wrecked'), fail('target_destroyed', 'The Regente was wrecked'), fail('target_escaped', 'The Regente came off the hook for too long')],
    wantedLevel: { provoked: 0, cap: 2, note: 'No scripted heat; reckless driving still counts.' },
    reward: { cash: 800, reputation: 100 },
    unlocks: [unlock('contact', 'hattie_tolliver'), unlock('property', 'tolliver_loft'), unlock('shop', 'tolliver_tow_garage'), unlock('activity', 'repo_orders'), unlock('activity', 'taxi_fares')],
    intro: [
      say('hattie_tolliver', 'Lucero Regente, pearl white, three payments behind. Hotel Cielo Rosa, valet row.'),
      say('dez_tolliver', 'A Regente at the Cielo Rosa. Whose?'),
      say('hattie_tolliver', "Somebody who can afford to pay and didn't. My favourite kind."),
      say('dez_tolliver', 'And the bank? They call again?'),
      say('hattie_tolliver', 'The bank sold our note to a company with no address, and the payment doubled. Go hook the car, Desmond.'),
    ],
    outro: [
      say('dez_tolliver', 'Two men in cream blazers chased me across three districts. For a repo.'),
      say('hattie_tolliver', 'Then they left something in it. Glovebox. An envelope, Aurelia Group letterhead.'),
      say('hattie_tolliver', 'Same name as on our new loan papers. Huh.'),
      say('dez_tolliver', "That's a lot of coincidence for one Tuesday."),
    ],
  },
  m02_twice_the_weight: {
    id: 'm02_twice_the_weight', order: 2, act: 1, title: 'Twice the Weight',
    giver: 'sol_arrieta', lead: 'sol_arrieta', requires: ['m01_hook_and_chain'], minRank: 0,
    start: { district: 'puerto_tamarindo', landmark: 'frigorificos_golfo', hours: null },
    summary: 'Sol slips back into the cold store to weigh the pallet of tiles that cost her the job. She leaves with photographs, one tile and six dockers behind her, and the only vehicle at the gate is a tow truck.',
    objectives: [
      step('go_to', "Get to the cold store's service door", { landmark: 'frigorificos_golfo', radius: 4, by: 'foot' }),
      step('stealth', 'Reach the scale room unseen', { zone: 'frigorificos_golfo', guards: { member: 'corriente_stevedore', count: 4 }, visionRange: 16, visionDegrees: 70, detectSeconds: 1.6, onDetected: 'restart_checkpoint' }),
      step('photograph', 'Photograph the label, scale and tile', { targets: ['pallet_label', 'scale_readout', 'cracked_tile'], holdSeconds: 1.5, maxDistance: 6 }),
      step('collect', 'Take one tile', { pickup: 'golden_tile', count: 1 }),
      step('escape_pursuit', 'Alarm! Run for the port gate', { landmark: 'petromar_port_gate', radius: 8, by: 'foot', timeLimit: 90, pursuers: [{ crew: 'corriente_stevedore', count: 6 }] }),
      step('switch_lead', 'Dez: get Sol out of the port', { to: 'dez_tolliver', vehicle: 'pickup_truck', passenger: 'sol_arrieta' }),
      step('escape_pursuit', 'Lose the Corriente pickups', { pursuers: [{ vehicle: 'pickup_truck', crew: 'corriente_stevedore', count: 2 }], loseDistance: 150, loseSeconds: 10 }),
      step('lose_wanted', 'Respray at Capa Fresca Hierro', { method: 'respray', landmark: 'capa_fresca_hierro' }),
    ],
    failConditions: [fail('lead_dead', 'Sol or Dez flatlined'), fail('lead_busted', 'Cuffed with the tile'), fail('timer_expired', 'The port gate closed'), fail('vehicle_destroyed', 'The tow truck was wrecked')],
    wantedLevel: { provoked: 1, cap: 3, note: 'Port security reports a break-in when the alarm rings; the respray teaches how to lose it.' },
    reward: { cash: 1500, reputation: 150 },
    unlocks: [unlock('feature', 'lead_switching'), unlock('shop', 'capa_fresca_hierro'), unlock('activity', 'golden_tiles'), unlock('shop', 'dos_soles_diner')],
    intro: [
      say('sol_arrieta', 'Container TMRU 448. Declared contents: bathroom tiles, glazed. Declared weight: nine tonnes.'),
      say('sol_arrieta', 'Weight when I flagged it: nineteen. One week later I was fired for bribes I never took.'),
      say('sol_arrieta', 'For the record, I intend to weigh it again.'),
    ],
    outro: [
      say('dez_tolliver', "Lady, I tow cars. I don't do getaways."),
      say('sol_arrieta', 'You just did one, quite well. What do I owe you?'),
      say('dez_tolliver', 'An answer. Why is a bathroom tile worth six guys with tire irons?'),
      say('sol_arrieta', 'Because it is gold under the glaze. And that cold store belongs to the Aurelia Group.'),
      say('dez_tolliver', 'Aurelia. Okay. You and I need to compare paperwork.'),
    ],
  },
  m03_stamped_and_sealed: {
    id: 'm03_stamped_and_sealed', order: 3, act: 1, title: 'Stamped and Sealed',
    giver: 'ximena_robles', lead: 'either', requires: ['m02_twice_the_weight'], minRank: 0,
    start: { district: 'la_marisma', landmark: 'ancla_torcida', hours: [9, 16] },
    summary: 'La Notaria will forge two port passes, and her price is an errand: three envelopes signed for across the old town and one filed at the Registry before it closes. Men in cream blazers have started asking her couriers what they carry.',
    objectives: [
      step('go_to', 'Meet La Notaria in the back booth', { landmark: 'ancla_torcida', radius: 3, by: 'foot' }),
      step('checkpoint_run', 'Deliver the three envelopes', { stops: ['mercado_marisma', 'iglesia_santa_marea', 'salon_guaracha'], order: 'any', timeLimit: 240, radius: 6 }),
      step('brawl', 'See off the collectors at Salón Guaracha', { enemies: [{ crew: 'circle_guard', count: 3 }], weaponsAllowed: 'melee', gunfireAddsHeat: true }),
      step('checkpoint_run', 'File the deed at the Palacio by five', { stops: ['palacio_municipal'], timeLimit: 150, radius: 8 }),
      step('go_to', 'Return to El Ancla Torcida', { landmark: 'ancla_torcida', radius: 3, by: 'foot' }),
    ],
    failConditions: [fail('lead_dead', 'Flatlined'), fail('lead_busted', 'Cuffed with the envelopes'), fail('timer_expired', 'The Registry closed'), fail('ally_dead', 'A recipient was killed')],
    wantedLevel: { provoked: 0, cap: 2, note: 'A fist fight in La Marisma is not reported; gunfire is.' },
    reward: { cash: 2500, reputation: 200 },
    unlocks: [unlock('contact', 'ximena_robles'), unlock('property', 'loro_flat'), unlock('shop', 'trueno_armory_hierro'), unlock('shop', 'brisa_y_hilo'), unlock('activity', 'gaviota_courier'), unlock('weapon', 'pistol')],
    intro: [
      say('ximena_robles', 'Marisol. And the tow truck. Sit. Do not touch the stamps.'),
      say('sol_arrieta', 'We need port passes. Two. Clean enough for the night gate.'),
      say('ximena_robles', 'Clean costs. Today it costs an errand: three envelopes, three signatures, and the Registry closes at five.'),
      say('dez_tolliver', "That's it? Deliveries?"),
      say('ximena_robles', 'Men in cream blazers have been asking my couriers what they carry. So: deliveries, briskly.'),
    ],
    outro: [
      say('ximena_robles', 'Stamped, sealed, and nobody at the Registry read a word. As God intended.'),
      say('ximena_robles', 'Your passes. And the name of a man behind a shutter in Barrio Hierro who sells things that go bang.'),
      say('sol_arrieta', 'We only want to look at a container.'),
      say('ximena_robles', 'Mija. Nobody in the history of this city has only looked.'),
    ],
  },
  m04_sparks_fly: {
    id: 'm04_sparks_fly', order: 4, act: 1, title: 'Sparks Fly',
    giver: 'jacinto_roldan', lead: 'dez_tolliver', requires: ['m03_stamped_and_sealed'], minRank: 1,
    start: { district: 'barrio_hierro', landmark: 'chatarreria_el_remache', hours: [19, 5] },
    summary: 'Los Remaches once stripped a truck that weighed twice what it should, and Chispa knows its route. He will trade the route for the one thing he wants from Dez: a rematch.',
    objectives: [
      step('go_to', 'Meet Chispa at the scrapyard gate', { landmark: 'chatarreria_el_remache', radius: 8, by: 'any' }),
      step('enter_vehicle', 'Take the Thunderhead or your own car', { vehicle: 'muscle_car', color: '#2B2B2E', ownVehicleAllowed: true }),
      step('race', 'Beat Chispa: stadium, rail yard, home', { via: ['estadio_la_fragua', 'patio_ferroviario', 'solana_avenida_del_riel', 'chatarreria_el_remache'], checkpoints: 16, laps: 1, opponents: [{ driver: 'jacinto_roldan', vehicle: 'muscle_car', skill: 0.82 }, { driver: 'remache_racer', vehicle: 'sports_coupe', skill: 0.7 }, { driver: 'remache_racer', vehicle: 'sport_motorcycle', skill: 0.66 }], mustPlace: 1, offCourseSeconds: 20 }),
      step('lose_wanted', 'Cops at the finish line: lose them', { method: 'any', stars: 2 }),
      step('go_to', 'Return to the scrapyard', { landmark: 'chatarreria_el_remache', radius: 10, by: 'any' }),
    ],
    failConditions: [fail('lead_dead', 'Dez flatlined'), fail('lead_busted', 'Dez got cuffed'), fail('race_lost', "Chispa won. He'll never let it go"), fail('vehicle_destroyed', 'Your car was wrecked'), fail('left_area', 'You left the course')],
    wantedLevel: { provoked: 2, cap: 3, note: 'Two stars are set as the winner crosses the line.' },
    reward: { cash: 4000, reputation: 250 },
    unlocks: [unlock('contact', 'jacinto_roldan'), unlock('activity', 'street_races'), unlock('activity', 'time_trials'), unlock('shop', 'el_remache_rebuilds'), unlock('vehicle', 'muscle_car')],
    intro: [
      say('jacinto_roldan', "Tolliver! Three years. You still drive like you're towing something?"),
      say('dez_tolliver', 'I need to know which truck carries tile out of the port at night.'),
      say('jacinto_roldan', 'And I need my win back. Yard gate, the stadium lot, the rail yard, home. You lose, you tow for me.'),
      say('dez_tolliver', 'And when I win?'),
      say('jacinto_roldan', 'IF. If you win, I tell you about a box truck that rattles like a bank.'),
    ],
    outro: [
      say('jacinto_roldan', "The cops cut me off at the stadium. That doesn't count."),
      say('dez_tolliver', 'It counts.'),
      say('jacinto_roldan', 'Brazo Fletero, cold-store livery. Leaves the rail yard at two, goes to the old foundry. The foundry that is closed.'),
      say('jacinto_roldan', 'We stripped one once. Thing weighed double. I should have asked why.'),
    ],
  },
  m05_night_shift: {
    id: 'm05_night_shift', order: 5, act: 1, title: 'Night Shift',
    giver: 'sol_arrieta', lead: 'either', requires: ['m04_sparks_fly'], minRank: 1,
    start: { district: 'barrio_hierro', landmark: 'patio_ferroviario', hours: [22, 4] },
    summary: 'The tile truck loads at the rail yard at two in the morning. The leads take it before it reaches the foundry and hide it where nobody looks: an empty warehouse on Dock 12.',
    objectives: [
      step('go_to', 'Reach the rail yard after dark', { landmark: 'patio_ferroviario', radius: 20, by: 'any' }),
      step('eliminate', 'Take out the loading crew', { enemies: [{ crew: 'corriente_stevedore', count: 6 }], stealthBonus: { cash: 1500, condition: 'no_alarm' } }),
      step('steal_vehicle', 'Take the tile truck', { vehicle: 'box_truck', livery: 'frigorificos_golfo', massMultiplier: 1.6 }),
      step('deliver_vehicle', 'Drive the truck to Dock 12 in one piece', { target: 'box_truck', landmark: 'dock_12_warehouse', radius: 10, maxDamageFraction: 0.5, pursuers: [{ vehicle: 'pickup_truck', crew: 'corriente_stevedore', count: 2, waves: 3 }], requiresStars: 0 }),
      step('lose_wanted', 'Lose the police before you open up', { method: 'any', stars: 3 }),
    ],
    failConditions: [fail('lead_dead', 'Flatlined'), fail('lead_busted', 'Cuffed with forty pallets of evidence'), fail('vehicle_destroyed', 'The tile truck was wrecked'), fail('cargo_ruined', 'The cargo is all over the avenue')],
    wantedLevel: { provoked: 3, cap: 4, note: 'Three stars when the truck leaves the yard: a stolen heavy vehicle is called in.' },
    reward: { cash: 7500, reputation: 300 },
    unlocks: [unlock('property', 'dock_12_storage'), unlock('activity', 'export_list'), unlock('shop', 'trueno_armory_centro'), unlock('weapon', 'smg'), unlock('feature', 'act_two')],
    intro: [
      say('sol_arrieta', "Two o'clock. Six men, one truck, forty pallets declared as ceramics."),
      say('dez_tolliver', 'And we take it where? My aunt will notice a truck.'),
      say('sol_arrieta', 'Dock 12. Empty since the fire. I inspected it myself; nobody has renewed the lease in four years.'),
      say('dez_tolliver', 'You planned a parking space.'),
      say('sol_arrieta', 'I planned everything. You just have to not hit anything.'),
    ],
    outro: [
      say('dez_tolliver', 'Forty pallets. How much is that?'),
      say('sol_arrieta', 'By weight? More than the garage, the street the garage is on, and the bank that holds the note.'),
      say('dez_tolliver', "So we're rich."),
      say('sol_arrieta', 'We are holding evidence that belongs to the most dangerous man in Marazul. It is not the same thing.'),
      say('sol_arrieta', 'But yes. Somewhat.'),
    ],
  },
  m06_charter_rates: {
    id: 'm06_charter_rates', order: 6, act: 2, title: 'Charter Rates',
    giver: 'ozzy_prieto', lead: 'either', requires: ['m05_night_shift'], minRank: 2,
    start: { district: 'bahia_vista', landmark: 'marina_bahia_vista', hours: [16, 21] },
    summary: 'The gold reaches Marazul by sea before it ever sees a container. Ozzy Prieto will show where it lands, once somebody proves they can drive a boat.',
    objectives: [
      step('go_to', 'Find Ozzy on the marina fuel dock', { landmark: 'marina_bahia_vista', radius: 5, by: 'foot' }),
      step('enter_vehicle', "Take the helm of Ozzy's Pez Vela", { vehicle: 'speedboat', color: '#F4F1E8' }),
      step('checkpoint_run', 'Round the buoys out to Faro del Coral', { checkpoints: 10, via: ['helipuerto_bahia', 'coral_beach_club', 'faro_del_coral'], timeLimit: 170, radius: 14, by: 'boat' }),
      step('tail', 'Tail the Corriente boat from afar', { target: { vehicle: 'speedboat', crew: 'corriente_boat_crew', color: '#1F9AA0' }, minDistance: 40, maxDistance: 150, tooCloseSeconds: 8, lostSeconds: 15, to: 'cobertizo_del_camaronero' }),
      step('photograph', 'Photograph the handover at the shed', { targets: ['boat_to_truck_transfer', 'harbor_patrol_escort'], holdSeconds: 2, maxDistance: 70 }),
      step('lose_wanted', 'Harbor Patrol: lose them in the channels', { method: 'any', stars: 2, by: 'boat' }),
      step('go_to', 'Bring the boat back to the marina', { landmark: 'marina_bahia_vista', radius: 16, by: 'boat' }),
    ],
    failConditions: [fail('lead_dead', 'Flatlined'), fail('lead_busted', 'Cuffed'), fail('vehicle_destroyed', "Ozzy's boat was sunk"), fail('detected', 'The Corriente crew spotted you'), fail('target_escaped', 'You lost the Corriente boat'), fail('timer_expired', 'Too slow round the buoys')],
    wantedLevel: { provoked: 2, cap: 3, note: 'Two stars on the water from a Harbor Patrol boat after the photographs.' },
    reward: { cash: 9000, reputation: 350 },
    unlocks: [unlock('contact', 'ozzy_prieto'), unlock('shop', 'prieto_charters'), unlock('property', 'prieto_charters_share'), unlock('activity', 'boat_races'), unlock('vehicle', 'speedboat')],
    intro: [
      say('ozzy_prieto', 'La Notaria says you two want to see what the tide brings in. First question: can either of you drive a boat?'),
      say('dez_tolliver', "It's a car that leaks. How hard can it be?"),
      say('ozzy_prieto', 'That sentence has drowned better men. Buoys first. Then we follow a friend of mine who is not my friend.'),
      say('sol_arrieta', 'A Corriente boat.'),
      say('ozzy_prieto', 'Pez Vela thirty-two, teal stripe, no lights. Stay far enough back to be scenery.'),
    ],
    outro: [
      say('sol_arrieta', 'They moved it from the boat to a truck in a shrimp shed. And the Harbor Patrol watched.'),
      say('ozzy_prieto', "Strand's boys do not watch. They escort."),
      say('dez_tolliver', 'The police are in on it.'),
      say('ozzy_prieto', 'Son, in this bay the police are a line item.'),
    ],
  },
  m07_two_beer_problem: {
    id: 'm07_two_beer_problem', order: 7, act: 2, title: 'Two-Beer Problem',
    giver: 'clovis_arceneaux', lead: 'either', requires: ['m06_charter_rates'], minRank: 2,
    start: { district: 'los_pantanos', landmark: 'mudline_roadhouse', hours: [17, 3] },
    summary: 'Big Clo flies the Circle\'s cash out of the airstrip because the Circle owns his lease. He will talk after two beers and one favour: La Corriente is coming to take the runway tonight.',
    objectives: [
      step('go_to', 'Walk into the Mudline Roadhouse', { landmark: 'mudline_roadhouse', radius: 4, by: 'foot' }),
      step('brawl', 'Earn the second beer', { enemies: [{ crew: 'jackal_rider', count: 4 }], weaponsAllowed: 'fists', nonLethal: true }),
      step('escort', 'Ride with Big Clo to the airstrip', { vehicle: 'chopper_motorcycle', follow: 'clovis_arceneaux', landmark: 'aerodromo_los_pantanos', maxDistance: 80 }),
      step('defend', 'Hold the hangars', { target: 'aerodromo_los_pantanos', targetHealth: 3000, waves: [{ vehicle: 'pickup_truck', crew: 'corriente_stevedore', count: 5 }, { vehicle: 'cargo_van', crew: 'corriente_stevedore', count: 6 }, { vehicle: 'pickup_truck', crew: 'corriente_boat_crew', count: 6 }, { vehicle: 'cargo_van', crew: 'corriente_boat_crew', count: 8 }], allies: [{ crew: 'jackal_rider', count: 4 }], secondsBetweenWaves: 12 }),
      step('chase', 'Stop the van that took the flight log', { target: { vehicle: 'cargo_van', crew: 'corriente_boat_crew' }, stopBy: 'damage', before: 'petromar_cruce_norte', escapeDistance: 320 }),
      step('collect', 'Take back the flight log', { pickup: 'flight_log', count: 1 }),
    ],
    failConditions: [fail('lead_dead', 'Flatlined'), fail('ally_dead', 'Big Clo was killed'), fail('target_destroyed', 'The hangars burned'), fail('target_escaped', 'The van reached the highway')],
    wantedLevel: { provoked: 0, cap: 2, note: 'Nobody in Los Pantanos calls the police, and it takes them forty seconds to come.' },
    reward: { cash: 12000, reputation: 400 },
    unlocks: [unlock('contact', 'clovis_arceneaux'), unlock('property', 'hangar_3'), unlock('property', 'cypress_lot_12'), unlock('shop', 'pantano_gun_and_bait'), unlock('activity', 'airstrip_drags'), unlock('weapon', 'pump_shotgun'), unlock('vehicle', 'chopper_motorcycle')],
    intro: [
      say('clovis_arceneaux', "City folk walk in here, I got a one-beer problem. City folk asking about my runway, that's two."),
      say('sol_arrieta', 'You fly money for Aurelio Santángel. We want to know where it lands.'),
      say('clovis_arceneaux', 'I fly it because he holds my lease, cher. And tonight the dock rats come to take the strip for themselves.'),
      say('dez_tolliver', 'So you need help.'),
      say('clovis_arceneaux', "I need to see if you're worth the second beer. Boys?"),
    ],
    outro: [
      say('clovis_arceneaux', 'Well. You fight ugly and you ride worse. But the hangars are standing.'),
      say('clovis_arceneaux', "Cash goes out Thursdays. Comes back as a cashier's cheque from Caja Coral, clean as a christening."),
      say('sol_arrieta', 'Caja Coral. The little pink bank beside the casino.'),
      say('clovis_arceneaux', 'Hangar 3 is empty if you want it. Rent is cheap. Landlord\'s a bastard, but he ain\'t me.'),
    ],
  },
  m08_clean_hands: {
    id: 'm08_clean_hands', order: 8, act: 2, title: 'Clean Hands',
    giver: 'ximena_robles', lead: 'either', requires: ['m07_two_beer_problem'], minRank: 3,
    start: { district: 'bahia_vista', landmark: 'caja_coral_bahia', hours: [10, 15] },
    summary: 'Every Thursday a Circle bagman carries the week\'s instructions from Caja Coral on his phone. Take the phone without a scene, get it to Pim\'s kiosk, and find out who else has been watching.',
    objectives: [
      step('go_to', 'Park across from Caja Coral', { landmark: 'caja_coral_bahia', radius: 25, by: 'vehicle' }),
      step('tail', "Tail the bagman's Regente", { target: { vehicle: 'luxury_sedan', crew: 'circle_guard', color: '#1E1E20' }, minDistance: 25, maxDistance: 95, tooCloseSeconds: 6, lostSeconds: 12, to: 'galerias_aurora', noContact: true }),
      step('stealth', 'Follow him through the parking deck', { zone: 'galerias_aurora', guards: { member: 'circle_guard', count: 2 }, visionRange: 14, visionDegrees: 80, detectSeconds: 1.4, onDetected: 'fail' }),
      step('subdue', 'Knock him out and take the phone', { target: 'circle_guard', weaponsAllowed: 'melee', pickup: 'bagman_phone' }),
      step('escape_pursuit', 'Lose the Circle car on the deck', { pursuers: [{ vehicle: 'suv', crew: 'circle_enforcer', count: 3 }], loseDistance: 140, loseSeconds: 12 }),
      step('go_to', "Bring the phone to Pim's kiosk", { landmark: 'galerias_aurora', radius: 3, by: 'foot', requiresStars: 0 }),
      step('cutscene', 'Pim cracks the phone', { camera: 'kiosk_two_shot', seconds: 22 }),
    ],
    failConditions: [fail('lead_dead', 'Flatlined'), fail('lead_busted', 'Cuffed'), fail('detected', 'The bagman made you'), fail('target_escaped', 'The bagman got away'), fail('target_destroyed', 'The phone went up with the car')],
    wantedLevel: { provoked: 1, cap: 3, note: 'One star if the knockout is witnessed; a gunshot in the mall makes it two.' },
    reward: { cash: 15000, reputation: 450 },
    unlocks: [unlock('contact', 'amara_whitlock'), unlock('contact', 'pim_adeyemi'), unlock('contact', 'odette_baptiste'), unlock('shop', 'linea_blanca_aurora'), unlock('activity', 'vigilante_calls'), unlock('weapon', 'heavy_revolver')],
    intro: [
      say('ximena_robles', 'Every Thursday a man with clean hands walks out of Caja Coral with a phone and no briefcase.'),
      say('sol_arrieta', 'The instructions are on the phone.'),
      say('ximena_robles', 'The instructions, the amounts, and who gets an envelope. Follow him. Do not improvise near the bank; the guards are bored and armed.'),
      say('dez_tolliver', 'And once we have it?'),
      say('ximena_robles', 'There is a child at Galerías Aurora who opens phones the way you open cars.'),
    ],
    outro: [
      say('pim_adeyemi', 'Okay, so his passcode was his own birthday, which, honestly, deserved.'),
      say('pim_adeyemi', "Payments to 'Capitán S.' every month. And somebody called O. keeps texting: count room, three a.m., I can get you in."),
      say('amara_whitlock', 'That would be Odette Baptiste. She texts me too. Detective Whitlock, Major Crimes. Nobody run.'),
      say('sol_arrieta', 'Are we under arrest?'),
      say('amara_whitlock', 'You are my second-worst problem. Help me with the first and I will stay very busy elsewhere.'),
    ],
  },
  m09_weigh_her_again: {
    id: 'm09_weigh_her_again', order: 9, act: 2, title: 'Weigh Her Again',
    giver: 'amara_whitlock', lead: 'sol_arrieta', requires: ['m08_clean_hands'], minRank: 3,
    start: { district: 'puerto_tamarindo', landmark: 'terminal_tamarindo', hours: [21, 4] },
    summary: 'The port weighbridge prints a paper log that proves every heavy container. Sol goes back through the gate she was thrown out of to take it, and La Draga is waiting on the quay.',
    objectives: [
      step('go_to', 'Show the forged pass at the night gate', { landmark: 'terminal_tamarindo', radius: 8, by: 'any' }),
      step('collect', 'Take the logbooks from the scale huts', { pickup: 'weighbridge_log', count: 3, hazards: { searchlights: 4, alarmAddsWave: true } }),
      step('eliminate', 'Fight out of the container stacks', { enemies: [{ crew: 'corriente_stevedore', count: 6 }, { crew: 'corriente_boat_crew', count: 6 }, { crew: 'corriente_boat_crew', count: 8 }], waves: 3 }),
      step('enter_vehicle', 'Take the speedboat at the quay', { vehicle: 'speedboat', color: '#1F9AA0' }),
      step('chase', "Stop La Draga's boat before the shipyard", { target: { vehicle: 'speedboat', driver: 'renata_olabarria' }, stopBy: 'damage', before: 'astilleros_olabarria', escapeDistance: 300 }),
      step('collect', 'Take the master log from her boat', { pickup: 'master_log', count: 1 }),
      step('lose_wanted', 'Outrun Harbor Patrol to the marina', { method: 'any', stars: 3, by: 'boat', safeAt: 'marina_bahia_vista' }),
    ],
    failConditions: [fail('lead_dead', 'Sol flatlined'), fail('lead_busted', 'Cuffed with the logbooks'), fail('target_escaped', 'La Draga reached the shipyard'), fail('vehicle_destroyed', 'Your boat was sunk')],
    wantedLevel: { provoked: 3, cap: 4, note: 'Three stars on the water after the master log is taken: Strand sends his boats.' },
    reward: { cash: 22000, reputation: 500 },
    unlocks: [unlock('activity', 'turf_rampages'), unlock('feature', 'port_night_gate'), unlock('weapon', 'assault_rifle'), unlock('shop', 'marea_motorsport')],
    intro: [
      say('amara_whitlock', 'The weighbridge prints a paper log. Paper is hard to delete, and my evidence room keeps losing hard drives.'),
      say('sol_arrieta', 'Three scale huts, one master log in the gatehouse. I signed it every morning for nine years.'),
      say('amara_whitlock', 'I cannot send officers. Half the Harbor Patrol reports to Strand.'),
      say('sol_arrieta', 'For the record, I would rather do it myself.'),
    ],
    outro: [
      say('renata_olabarria', 'Nine years you stamped my boxes, inspector. You should have kept stamping.'),
      say('sol_arrieta', 'Nineteen tonnes of bathroom tile, Renata. I can count.'),
      say('renata_olabarria', 'Count this, then: Santángel knows your name now. Yours and the tow boy.'),
      say('sol_arrieta', 'Good. It will save time when he is served.'),
    ],
  },
  m10_dead_air: {
    id: 'm10_dead_air', order: 10, act: 2, title: 'Dead Air',
    giver: 'nadia_finch', lead: 'either', requires: ['m09_weigh_her_again'], minRank: 4,
    start: { district: 'las_lomas', landmark: 'antena_loma_alta', hours: [20, 2] },
    summary: 'Nadia Finch will put the bagman\'s recordings on the air, live, from the transmitter hut on Loma Alta. The Circle has four minutes to stop a broadcast, and it sends everyone.',
    objectives: [
      step('go_to', 'Drive up to the Antena Loma Alta', { landmark: 'antena_loma_alta', radius: 12, by: 'any' }),
      step('defend', 'Keep the transmitter on the air', { target: 'antena_loma_alta', targetHealth: 2500, seconds: 240, waves: [{ vehicle: 'suv', crew: 'circle_guard', count: 4 }, { vehicle: 'suv', crew: 'circle_guard', count: 6 }, { vehicle: 'luxury_sedan', crew: 'circle_enforcer', count: 4 }, { vehicle: 'suv', crew: 'circle_enforcer', count: 6 }, { vehicle: 'suv', crew: 'circle_enforcer', count: 8 }], secondsBetweenWaves: 10, progressLabel: 'ON AIR' }),
      step('escort', 'Get Nadia down the hill', { passenger: 'nadia_finch', landmark: 'capa_fresca_lomas', pursuers: [{ vehicle: 'suv', crew: 'circle_enforcer', count: 3 }], maxDamageFraction: 0.85 }),
      step('lose_wanted', 'Lose the police', { method: 'any', stars: 3 }),
      step('deliver_vehicle', 'Drop Nadia at Terminal Central', { landmark: 'terminal_central', radius: 10, passenger: 'nadia_finch', requiresStars: 0 }),
    ],
    failConditions: [fail('lead_dead', 'Flatlined'), fail('lead_busted', 'Cuffed'), fail('ally_dead', 'Nadia was killed'), fail('target_destroyed', 'The transmitter went dead'), fail('vehicle_destroyed', 'The car was wrecked with Nadia in it')],
    wantedLevel: { provoked: 3, cap: 4, note: 'Vigía Azul calls in the gunfire: three stars as the car leaves the summit.' },
    reward: { cash: 28000, reputation: 550 },
    unlocks: [unlock('contact', 'nadia_finch'), unlock('feature', 'radio_news_reports'), unlock('shop', 'atelier_lomas'), unlock('shop', 'lomas_prestige_motors'), unlock('weapon', 'sniper_rifle')],
    intro: [
      say('nadia_finch', 'You are the tile people. I have the recordings, a live microphone and a transmitter the Aurelia Group forgot to buy.'),
      say('dez_tolliver', 'How long do you need?'),
      say('nadia_finch', 'Four minutes of air. After the first thirty seconds they will know where I am.'),
      say('dez_tolliver', "So I'm the door."),
      say('nadia_finch', 'You are the door, darling. Marazul, this is La Voz del Golfo, and tonight we have a guest.'),
    ],
    outro: [
      say('nadia_finch', "'Capitán S.' is the most requested song in the city tonight."),
      say('dez_tolliver', 'They sent thirty guys to stop a radio show.'),
      say('nadia_finch', 'Which is how you know it was a good show.'),
      say('nadia_finch', 'Call me when there is more. There is always more.'),
    ],
  },
  m11_house_edge: {
    id: 'm11_house_edge', order: 11, act: 2, title: 'House Edge',
    giver: 'odette_baptiste', lead: 'sol_arrieta', requires: ['m10_dead_air'], minRank: 4,
    start: { district: 'bahia_vista', landmark: 'the_aurelia', hours: [1, 4] },
    summary: 'The blue ledger sits in the count room for one hour at three in the morning. Odette can open two doors and blind the cameras for ninety seconds; the rest is posture.',
    objectives: [
      step('wear_outfit', 'Dress for the casino', { tag: 'formal', suggested: 'aurelia_gala_black', soldAt: ['linea_blanca_aurora', 'casa_lino', 'atelier_lomas'] }),
      step('go_to', 'Arrive at the valet court of The Aurelia', { landmark: 'the_aurelia', radius: 10, by: 'any' }),
      step('stealth', 'Cross the floor to the service corridor', { zone: 'the_aurelia', guards: { member: 'circle_guard', count: 8 }, visionRange: 12, visionDegrees: 60, detectSeconds: 2.2, weaponsHolstered: true, onDetected: 'fail' }),
      step('checkpoint_run', 'Cameras are down: reach the count room', { checkpoints: 5, timeLimit: 90, radius: 3, by: 'foot' }),
      step('photograph', 'Photograph six pages of the blue ledger', { targets: ['ledger_page_1', 'ledger_page_2', 'ledger_page_3', 'ledger_page_4', 'ledger_page_5', 'ledger_page_6'], holdSeconds: 1.2, maxDistance: 2 }),
      step('escape_pursuit', "Lemaire's here: out by the service dock", { pursuers: [{ crew: 'circle_enforcer', count: 6 }, { vehicle: 'suv', crew: 'circle_enforcer', count: 2 }], loseDistance: 180, loseSeconds: 12 }),
      step('lose_wanted', 'Lose the police', { method: 'any', stars: 3 }),
      step('go_to', 'Meet Dez at the marina', { landmark: 'marina_bahia_vista', radius: 8, by: 'any', requiresStars: 0 }),
    ],
    failConditions: [fail('lead_dead', 'Sol flatlined'), fail('lead_busted', 'Cuffed: the photographs are confiscated'), fail('detected', 'Spotted before the count room: Odette is exposed'), fail('timer_expired', 'The cameras came back on')],
    wantedLevel: { provoked: 3, cap: 4, note: 'The casino reports an armed robbery the moment Sol leaves the service dock.' },
    reward: { cash: 40000, reputation: 650 },
    unlocks: [unlock('outfit', 'circle_cream_blazer'), unlock('shop', 'casa_lino'), unlock('weapon', 'grenade'), unlock('feature', 'act_three')],
    intro: [
      say('odette_baptiste', 'The ledger comes down at three and goes back up at four. He writes it by hand. Blue leather, gold corners.'),
      say('sol_arrieta', 'I do not need to take it. I need six pages photographed.'),
      say('odette_baptiste', 'I can give you two doors and ninety seconds without cameras. After that I am a floor manager who saw nothing.'),
      say('sol_arrieta', 'And what do you want, Odette?'),
      say('odette_baptiste', 'Ten years I have counted his money. I want to watch someone else count it. In court.'),
    ],
    outro: [
      say('etienne_lemaire', 'Madame Arrieta. You dress well for a customs clerk.'),
      say('sol_arrieta', 'Former customs clerk. Your employer saw to that.'),
      say('etienne_lemaire', 'He will see to the rest. The garage first, I think. Good evening.'),
      say('dez_tolliver', 'Sol? What did he mean, the garage?'),
    ],
  },
  m12_past_due: {
    id: 'm12_past_due', order: 12, act: 3, title: 'Past Due',
    giver: 'hattie_tolliver', lead: 'dez_tolliver', requires: ['m11_house_edge'], minRank: 5,
    start: { district: 'barrio_hierro', landmark: 'tolliver_tow', hours: null },
    summary: 'The Circle calls in the garage\'s loan the direct way, with petrol. Dez holds Tolliver Tow until the sirens come, then runs down the collector who is carrying the note back to the bank.',
    objectives: [
      step('checkpoint_run', 'Get to the garage. Now', { stops: ['tolliver_tow'], timeLimit: 120, radius: 15 }),
      step('defend', 'Defend Tolliver Tow', { target: 'tolliver_tow', targetHealth: 3500, waves: [{ vehicle: 'luxury_sedan', crew: 'circle_guard', count: 4 }, { vehicle: 'suv', crew: 'circle_enforcer', count: 5 }, { vehicle: 'suv', crew: 'circle_enforcer', count: 6, weapon: 'fire_bottle' }, { vehicle: 'suv', crew: 'circle_enforcer', count: 7 }, { vehicle: 'luxury_sedan', crew: 'circle_enforcer', count: 8, weapon: 'fire_bottle' }], allies: [{ character: 'hattie_tolliver', weapon: 'pump_shotgun' }, { crew: 'remache_stripper', count: 4, fromWave: 3 }], secondsBetweenWaves: 10 }),
      step('chase', 'Stop the collector before he reaches the bank', { target: { vehicle: 'sports_coupe', crew: 'circle_enforcer', color: '#C9A227' }, stopBy: 'damage', before: 'banco_meridiano_tower', escapeDistance: 350 }),
      step('collect', 'Take the loan note', { pickup: 'loan_note', count: 1 }),
      step('go_to', 'Bring the note home', { landmark: 'tolliver_tow', radius: 10, by: 'any', requiresStars: 0 }),
    ],
    failConditions: [fail('lead_dead', 'Dez flatlined'), fail('lead_busted', 'Dez got cuffed'), fail('ally_dead', 'Aunt Hattie was killed'), fail('target_destroyed', 'Tolliver Tow burned down'), fail('target_escaped', 'The note reached the bank'), fail('timer_expired', 'Too late')],
    wantedLevel: { provoked: 2, cap: 4, note: 'Two stars during the chase through Centro.' },
    reward: { cash: 50000, reputation: 700 },
    unlocks: [unlock('property', 'tolliver_tow_note'), unlock('property', 'club_salitre_deed'), unlock('weapon', 'fire_bottle'), unlock('feature', 'faction_backup_calls')],
    intro: [
      say('hattie_tolliver', 'Desmond. There are four cars outside with their lights off and I do not owe any of them a tow.'),
      say('dez_tolliver', 'Lock the shutter. I am two minutes out.'),
      say('hattie_tolliver', "I have your uncle's shotgun and a full pot of coffee. Make it one."),
    ],
    outro: [
      say('hattie_tolliver', 'Thirty-one years I have had that sign. They scorched the T.'),
      say('dez_tolliver', 'I got the note. The actual paper. Nobody holds it but us.'),
      say('hattie_tolliver', 'Then nobody collects on it. Burn it. No. Frame it.'),
      say('hattie_tolliver', 'And Desmond? Whoever sent them. Finish it.'),
    ],
  },
  m13_no_further_questions: {
    id: 'm13_no_further_questions', order: 13, act: 3, title: 'No Further Questions',
    giver: 'amara_whitlock', lead: 'either', requires: ['m12_past_due'], minRank: 5,
    start: { district: 'puerto_tamarindo', landmark: 'harbor_patrol_station', hours: [8, 18] },
    summary: 'Whitlock has a warrant for Captain Strand and nobody she trusts to serve it. Strand runs for open water with a boat of loyal officers, and the leads are deputised for exactly one afternoon.',
    objectives: [
      step('escort', 'Drive Whitlock to the Harbor Patrol station', { passenger: 'amara_whitlock', landmark: 'harbor_patrol_station', radius: 12 }),
      step('eliminate', "Clear Strand's men off the quay", { enemies: [{ crew: 'harbor_officer', count: 6 }, { crew: 'harbor_officer', count: 8 }], waves: 2, allies: [{ character: 'amara_whitlock', weapon: 'pistol' }], noHeatFor: 'corrupt_officers' }),
      step('enter_vehicle', 'Commandeer a patrol boat', { vehicle: 'police_boat' }),
      step('chase', "Disable Strand's boat before the island helipad", { target: { vehicle: 'police_boat', driver: 'emmett_strand' }, stopBy: 'damage', before: 'helipuerto_isla_coral', escapeDistance: 380, mustSurvive: 'emmett_strand' }),
      step('subdue', 'Board the boat and take Strand alive', { target: 'emmett_strand', weaponsAllowed: 'melee', nonLethal: true }),
      step('deliver_vehicle', 'Land the captain at Muelle Dorado for the cameras', { target: 'police_boat', landmark: 'muelle_dorado', radius: 16, passenger: 'emmett_strand' }),
    ],
    failConditions: [fail('lead_dead', 'Flatlined'), fail('ally_dead', 'Detective Whitlock was killed'), fail('target_destroyed', 'Strand is dead: no confession, no case'), fail('target_escaped', 'Strand reached the helipad'), fail('vehicle_destroyed', 'Your boat was sunk')],
    wantedLevel: { provoked: 4, cap: 4, note: 'Four stars are forced during the boat chase (the department does not know whom to believe) and cleared at the arrest.' },
    reward: { cash: 65000, reputation: 800 },
    unlocks: [unlock('property', 'villa_buenaventura'), unlock('feature', 'harbor_patrol_honest'), unlock('activity', 'paramedic_runs'), unlock('feature', 'vehicle_armor_upgrades')],
    intro: [
      say('amara_whitlock', 'Warrant for Emmett Strand. Signed by the one judge he does not play golf with.'),
      say('dez_tolliver', 'So arrest him. You have a whole department.'),
      say('amara_whitlock', 'I have a whole department that warns him. I have you two, a badge, and about an hour.'),
      say('sol_arrieta', 'Are we deputies?'),
      say('amara_whitlock', 'You are concerned citizens standing unusually close to me. No further questions.'),
    ],
    outro: [
      say('emmett_strand', 'You are finished, Whitlock. I have friends on that island.'),
      say('amara_whitlock', 'You had friends. One of them kept a ledger with your name in it forty-one times.'),
      say('emmett_strand', 'I want a lawyer.'),
      say('amara_whitlock', 'First sensible thing you have said. You have the right to remain silent. Please, please use it.'),
    ],
  },
  m14_heavier_than_it_looks: {
    id: 'm14_heavier_than_it_looks', order: 14, act: 3, title: 'Heavier Than It Looks',
    giver: 'jacinto_roldan', lead: 'dez_tolliver', requires: ['m13_no_further_questions'], minRank: 6,
    start: { district: 'barrio_hierro', landmark: 'deposito_riel_norte', hours: [21, 4] },
    summary: 'The last of the gold is being cast into pool tiles at the old foundry tonight. The Remaches open the gate, the Jackals hold the highway, and Dez drives nine tonnes of evidence to the airstrip without breaking it.',
    objectives: [
      step('go_to', 'Meet the crews at the rail depot', { landmark: 'deposito_riel_norte', radius: 10, by: 'any' }),
      step('eliminate', 'Take the foundry floor', { at: 'fundicion_hierro_viejo', enemies: [{ crew: 'circle_guard', count: 8 }, { crew: 'circle_enforcer', count: 8 }, { crew: 'circle_enforcer', count: 10 }], waves: 3, allies: [{ character: 'jacinto_roldan', weapon: 'smg' }, { crew: 'remache_stripper', count: 5 }] }),
      step('collect', 'Load the eight crates of cast tiles', { pickup: 'tile_crate', count: 8, carrySlows: 0.6 }),
      step('enter_vehicle', 'Get in the loaded truck', { vehicle: 'box_truck', massMultiplier: 1.8 }),
      step('deliver_vehicle', 'Drive the gold to the airstrip in one piece', { target: 'box_truck', landmark: 'aerodromo_los_pantanos', radius: 14, maxDamageFraction: 0.6, pursuers: [{ vehicle: 'suv', crew: 'circle_enforcer', count: 2, waves: 4 }], allies: [{ vehicle: 'chopper_motorcycle', crew: 'jackal_rider', count: 4, from: 'petromar_cruce_norte' }], requiresStars: 0 }),
      step('lose_wanted', 'Lose the police before the hangar doors open', { method: 'any', stars: 3 }),
    ],
    failConditions: [fail('lead_dead', 'Dez flatlined'), fail('lead_busted', 'Cuffed with nine tonnes of gold'), fail('ally_dead', 'Chispa was killed'), fail('vehicle_destroyed', 'The truck was wrecked'), fail('cargo_ruined', 'The gold is all over the Autopista')],
    wantedLevel: { provoked: 3, cap: 5, note: 'Three stars from the foundry gate; a fourth if the truck rams a roadblock.' },
    reward: { cash: 150000, reputation: 900 },
    unlocks: [unlock('property', 'el_remache_share'), unlock('weapon', 'rocket_launcher'), unlock('vehicle', 'supercar'), unlock('property', 'cabana_sotavento')],
    intro: [
      say('jacinto_roldan', 'Furnace has been running four nights. Tonight they pour the last of it.'),
      say('dez_tolliver', 'We take all of it. Whitlock gets the tiles; you get your cut in something easier to spend.'),
      say('jacinto_roldan', "My people open the gate. Clo's bikes hold the highway. You drive."),
      say('dez_tolliver', 'Why me?'),
      say('jacinto_roldan', 'Because it weighs nine tonnes and you are the only one who ever beat me. Do not make me say it twice.'),
    ],
    outro: [
      say('clovis_arceneaux', 'That truck is sitting so low it is leaving a groove in my runway.'),
      say('dez_tolliver', 'Heavier than it looks.'),
      say('sol_arrieta', 'Santángel has lost his gold, his captain and his port. He has one thing left.'),
      say('dez_tolliver', 'The ledger.'),
      say('sol_arrieta', 'The original. And he will not leave the island without it.'),
    ],
  },
  m15_the_house_loses: {
    id: 'm15_the_house_loses', order: 15, act: 3, title: 'The House Loses',
    giver: 'sol_arrieta', lead: 'either', requires: ['m14_heavier_than_it_looks'], minRank: 7,
    start: { district: 'bahia_vista', landmark: 'marina_bahia_vista', hours: [21, 24] },
    summary: 'Santángel leaves at midnight by helicopter with the blue ledger. Dez comes in from the sea, Sol through the garden, and it ends where the island does, under the lighthouse.',
    objectives: [
      step('switch_lead', 'Dez: take the boat to the villa dock', { to: 'dez_tolliver', vehicle: 'speedboat' }),
      step('checkpoint_run', "Run the bay to Villa Santángel's dock", { checkpoints: 8, via: ['coral_beach_club', 'villa_santangel'], timeLimit: 200, radius: 16, by: 'boat', pursuers: [{ vehicle: 'speedboat', crew: 'circle_enforcer', count: 2 }] }),
      step('switch_lead', 'Sol: go in through the garden wall', { to: 'sol_arrieta', at: 'villa_santangel' }),
      step('eliminate', 'Fight through the gardens to the colonnade', { at: 'villa_santangel', enemies: [{ crew: 'circle_guard', count: 8 }, { crew: 'circle_enforcer', count: 8 }, { crew: 'circle_enforcer', count: 10 }, { crew: 'circle_enforcer', count: 10 }], waves: 4, allies: [{ character: 'dez_tolliver', weapon: 'pump_shotgun' }] }),
      step('eliminate', 'Lemaire is holding the courtyard', { boss: { character: 'etienne_lemaire', health: 600, armor: 200, weapon: 'heavy_revolver', accuracy: 0.7 }, enemies: [{ crew: 'circle_enforcer', count: 4 }] }),
      step('chase', "Stop Santángel's convoy before the helipad", { target: { vehicle: 'luxury_sedan', driver: 'aurelio_santangel', escorts: [{ vehicle: 'suv', crew: 'circle_enforcer', count: 2 }] }, stopBy: 'damage', before: 'helipuerto_isla_coral', escapeDistance: 400, timeLimit: 150, mustSurvive: 'aurelio_santangel', providedVehicle: 'supercar' }),
      step('go_to', 'He is running for the lighthouse: follow him down the jetty', { landmark: 'faro_del_coral', radius: 6, by: 'foot' }),
      step('collect', 'Take the blue ledger', { pickup: 'blue_ledger', count: 1 }),
      step('survive', 'Hold the jetty until Whitlock lands', { seconds: 60, enemies: [{ crew: 'circle_enforcer', count: 10 }], rescue: { vehicle: 'police_helicopter', character: 'amara_whitlock' } }),
    ],
    failConditions: [fail('lead_dead', 'Sol or Dez flatlined'), fail('target_escaped', 'The helicopter lifted off with the ledger'), fail('target_destroyed', 'Santángel is dead and the ledger burned with him'), fail('timer_expired', 'Midnight: he is gone')],
    wantedLevel: { provoked: 4, cap: 5, note: 'Santángel calls his last friends in the department: four stars during the convoy chase, cleared when Whitlock lands.' },
    reward: { cash: 250000, reputation: 1200 },
    unlocks: [unlock('property', 'casa_caracola'), unlock('feature', 'epilogue')],
    intro: [
      say('sol_arrieta', 'His helicopter is fuelled. He leaves at midnight, with the ledger, for somewhere without an extradition treaty.'),
      say('dez_tolliver', 'I come in from the water. You take the garden.'),
      say('sol_arrieta', 'Lemaire will be between us and the house.'),
      say('dez_tolliver', 'Then he is between us. Sol. Whatever happens: best tow call I ever took.'),
      say('sol_arrieta', 'For the record: mine too.'),
    ],
    outro: [
      say('aurelio_santangel', 'I built this city. Every tower. Every light you can see from here.'),
      say('sol_arrieta', 'You built it with other people\'s money and wrote down every payment. That was your one honest habit.'),
      say('aurelio_santangel', 'Name a price. Either of you.'),
      say('dez_tolliver', 'A garage on a corner in Barrio Hierro. You cannot afford it.'),
      say('amara_whitlock', 'Aurelio Santángel. The house loses.'),
    ],
  },
  m16_for_the_record: {
    id: 'm16_for_the_record', order: 16, act: 4, title: 'For the Record',
    giver: 'amara_whitlock', lead: 'either', requires: ['m15_the_house_loses'], minRank: 7,
    start: { district: 'centro', landmark: 'mpd_headquarters', hours: [7, 9] },
    summary: 'The ledger has to cross Centro from police headquarters to the courthouse evidence dock before the judge sits, and what is left of the Circle has one morning to stop it. After that the city is simply yours to live in.',
    objectives: [
      step('go_to', 'Meet Whitlock at police headquarters', { landmark: 'mpd_headquarters', radius: 10, by: 'any' }),
      step('enter_vehicle', 'Drive the evidence van', { vehicle: 'swat_van', passenger: 'amara_whitlock' }),
      step('checkpoint_run', 'Get the ledger to the Tribunal del Golfo by nine', { checkpoints: 9, via: ['plaza_de_la_marea', 'banco_meridiano_tower', 'palacio_municipal', 'tribunal_del_golfo'], timeLimit: 210, radius: 14, by: 'vehicle', roadblocks: [{ vehicle: 'luxury_sedan', crew: 'circle_enforcer', count: 4 }, { vehicle: 'suv', crew: 'circle_enforcer', count: 5 }, { vehicle: 'box_truck', crew: 'circle_enforcer', count: 6 }] }),
      step('defend', 'Hold the evidence dock while the clerk signs', { target: 'tribunal_del_golfo', targetHealth: 2000, seconds: 90, waves: [{ vehicle: 'suv', crew: 'circle_enforcer', count: 6 }, { vehicle: 'luxury_sedan', crew: 'circle_enforcer', count: 8 }], allies: [{ crew: 'patrol_officer', count: 4 }, { character: 'amara_whitlock', weapon: 'pistol' }] }),
      step('cutscene', 'The verdict, the city, the credits', { camera: 'courthouse_steps_to_skyline', seconds: 45 }),
    ],
    failConditions: [fail('lead_dead', 'Flatlined'), fail('ally_dead', 'Detective Whitlock was killed'), fail('vehicle_destroyed', 'The evidence van was wrecked'), fail('timer_expired', 'The court sat without the ledger'), fail('target_destroyed', 'The evidence dock was overrun')],
    wantedLevel: { provoked: 0, cap: 0, note: 'The police are on your side for one morning: no heat is added during the mission.' },
    reward: { cash: 100000, reputation: 500 },
    unlocks: [unlock('outfit', 'record_keepers'), unlock('feature', 'fun_toggles'), unlock('feature', 'mission_replay'), unlock('vehicle', 'police_cruiser'), unlock('activity', 'linea_12_bus')],
    intro: [
      say('amara_whitlock', 'Evidence dock closes at nine. Between here and there are eleven blocks and every man Lemaire ever hired.'),
      say('dez_tolliver', 'We could take a helicopter.'),
      say('amara_whitlock', 'Chain of custody, Mr Tolliver. It goes by road, with me, and with a signature at each end.'),
      say('sol_arrieta', 'She is right. It is a form.'),
      say('dez_tolliver', 'It is always a form.'),
    ],
    outro: [
      say('amara_whitlock', 'Received: one ledger, blue, handwritten. Signed, Arrieta. Witnessed, Tolliver.'),
      say('sol_arrieta', 'For the record.'),
      say('dez_tolliver', 'So what now? Garage is paid. Port is clean. Ish.'),
      say('sol_arrieta', 'Now? It is a very large city, and nobody is currently chasing us.'),
      say('hattie_tolliver', 'Desmond! Somebody left a Ravello on my lot with no plates. Is this yours?'),
      say('dez_tolliver', "Define 'mine'."),
    ],
  },
});

/** Mission ids in story order. */
export const STORY_MISSION_ORDER = Object.freeze([
  'm01_hook_and_chain', 'm02_twice_the_weight', 'm03_stamped_and_sealed', 'm04_sparks_fly', 'm05_night_shift',
  'm06_charter_rates', 'm07_two_beer_problem', 'm08_clean_hands', 'm09_weigh_her_again', 'm10_dead_air', 'm11_house_edge',
  'm12_past_due', 'm13_no_further_questions', 'm14_heavier_than_it_looks', 'm15_the_house_loses',
  'm16_for_the_record',
]);

/** The three acts and the epilogue (act 4). */
export const STORY_ACTS = freezeCatalog({
  1: { act: 1, title: 'Act One: The Weight', missions: ['m01_hook_and_chain', 'm02_twice_the_weight', 'm03_stamped_and_sealed', 'm04_sparks_fly', 'm05_night_shift'], summary: 'A repossessed car and a pallet of tiles lead a tow driver and a fired customs inspector to the same name. They steal a truck of gold and have to decide what it is evidence of.' },
  2: { act: 2, title: 'Act Two: The Current', missions: ['m06_charter_rates', 'm07_two_beer_problem', 'm08_clean_hands', 'm09_weigh_her_again', 'm10_dead_air', 'm11_house_edge'], summary: 'By sea, by air and by bank: the leads trace the whole route, win the swamp and the scrapyard to their side, take the port from La Draga, and photograph the blue ledger.' },
  3: { act: 3, title: 'Act Three: The House', missions: ['m12_past_due', 'm13_no_further_questions', 'm14_heavier_than_it_looks', 'm15_the_house_loses'], summary: 'Santángel strikes at the garage and loses his captain, his gold and finally his ledger at the foot of the lighthouse.' },
  4: { act: 4, title: 'Epilogue: For the Record', missions: ['m16_for_the_record'], summary: 'The ledger is delivered to the court, and Marazul is open with nothing left to prove.' },
});

/** The objective kinds the mission runner implements, with what each one asks of the player. */
export const MISSION_OBJECTIVE_KINDS = freezeCatalog({
  go_to: 'Reach a landmark (radius in metres) on foot, by vehicle or by boat.',
  enter_vehicle: 'Get into a specific vehicle that the mission provides.',
  steal_vehicle: 'Take a specific vehicle from its owners.',
  tow_vehicle: 'Reverse the tow truck up to a parked vehicle and hold to hook it.',
  deliver_vehicle: 'Bring a vehicle (and any passenger) to a landmark under a damage limit.',
  tail: 'Follow a target between a minimum and a maximum distance until it arrives.',
  chase: 'Stop a fleeing vehicle by damage before it reaches a landmark or gets out of range.',
  race: 'Finish a checkpoint race in the required place.',
  checkpoint_run: 'Pass checkpoints or stops inside a time limit.',
  collect: 'Pick up a number of mission items.',
  photograph: 'Aim the phone camera at each target and hold.',
  stealth: 'Cross a zone without filling any guard\'s detection meter.',
  brawl: 'Win a fight with fists or melee weapons only.',
  eliminate: 'Defeat every enemy, wave by wave.',
  defend: 'Keep a place alive through waves or until a timer ends.',
  escort: 'Stay with or carry an ally to a landmark.',
  escape_pursuit: 'Get out of range of mission pursuers for a number of seconds.',
  lose_wanted: 'Bring the wanted level to zero by any allowed method.',
  subdue: 'Knock a target out without killing them.',
  wear_outfit: 'Be wearing an outfit with the required tag.',
  switch_lead: 'A scripted switch to the other lead.',
  survive: 'Stay alive until the timer ends.',
  cutscene: 'A scripted camera with subtitles; skippable after 2 seconds.',
});

/** Fail-condition kinds and the rules shared by every mission. */
export const MISSION_RULES = freezeCatalog({
  failKinds: ['lead_dead', 'lead_busted', 'ally_dead', 'vehicle_destroyed', 'target_destroyed', 'target_escaped', 'timer_expired', 'detected', 'cargo_ruined', 'race_lost', 'left_area'],
  unlockKinds: ['contact', 'property', 'shop', 'activity', 'weapon', 'vehicle', 'outfit', 'feature'],
  retryFromCheckpoint: true,
  checkpointAfterEachObjective: true,
  failScreenSeconds: 4,
  retryCostsNothing: true,
  wantedClearedOnPass: true,
  leadSwitchDisabledDuringMission: true,
  startMarker: { color: '#FFC53D', radius: 2.2, phoneCallFromGiver: true },
  replayRewardFraction: 0.25,
  subtitleSecondsPerLine: 3.6,
});

/** Builds one objective step: its kind, the HUD line and its parameters. */
function step(kind, text, params) {
  return { kind, text, params };
}

/** Builds one subtitle line. */
function say(speaker, line) {
  return { speaker, line };
}

/** Builds one fail condition: its kind and the line on the fail screen. */
function fail(kind, text) {
  return { kind, text };
}

/** Builds one unlock: its kind and the id in the matching catalog. */
function unlock(kind, id) {
  return { kind, id };
}

/** Recursively freezes a plain data tree so that no system can mutate the shared catalog. */
function freezeCatalog(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) freezeCatalog(value[key]);
  }
  return value;
}
