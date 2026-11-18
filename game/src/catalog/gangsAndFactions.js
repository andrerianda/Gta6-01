// The organised sides of Marazul: the police department and its units, the fire and rescue
// service, the casino syndicate, the port smugglers, the scrapyard crew, the swamp motorcycle
// club, and the neutral groups. Each has its colours, turf, vehicles, weapons, uniforms (in the
// appearance vocabulary of storyCharacters.js) and its attitude to each playable lead.
// Plain frozen data, no imports.
//
// Ids used here: districts and landmarks from cityDistricts.js, vehicles from vehicleCatalog.js,
// weapons from weaponCatalog.js, characters from storyCharacters.js, missions from
// storyMissions.js. Attitude runs from -100 (attack on sight) to 100 (fights at the lead's
// side); at -40 or lower members attack on sight inside their turf, at 40 or higher they
// defend the lead there. Health in hit points (a pedestrian has 100), accuracy from 0 to 1,
// money in whole dollars, colours as sRGB hex.

/**
 * Every faction keyed by id.
 * @type {Readonly<Record<string, object>>}
 */
export const GANGS_AND_FACTIONS = freezeCatalog({
  marazul_police: {
    id: 'marazul_police',
    name: 'Policía de Marazul',
    shortName: 'MPD',
    kind: 'law',
    motto: 'Guardianes del Golfo',
    description: 'The city police: underpaid on the street, well paid at the top. Patrols every district, thinnest in the port and the wetlands, and answers the wanted level.',
    leader: null,
    notableMembers: ['amara_whitlock', 'emmett_strand'],
    colors: { primary: '#1D4E7A', secondary: '#F2F0E8', accent: '#E8B23A' },
    emblem: 'A gold lighthouse inside a blue shield.',
    turf: ['centro', 'playa_dorada'],
    headquarters: 'mpd_headquarters',
    hangouts: ['mpd_headquarters', 'precinto_playa', 'harbor_patrol_station'],
    vehicles: { police_cruiser: 10, police_suv: 4, swat_van: 1, police_boat: 2, police_helicopter: 1 },
    vehicleColors: ['#F2F0E8'],
    weapons: ['pistol', 'pump_shotgun', 'smg', 'assault_rifle', 'sniper_rifle'],
    members: ['patrol_officer', 'harbor_officer', 'tactical_officer', 'detective'],
    attitude: { dez_tolliver: 0, sol_arrieta: 0 },
    attitudeNote: 'Neutral until a crime is reported; driven by the wanted level, never by reputation.',
    storyShifts: [
      { afterMission: 'm08_clean_hands', note: 'Detective Whitlock becomes a contact; nothing else changes.' },
      { afterMission: 'm13_no_further_questions', note: 'With Strand gone the Harbor Patrol stops ignoring La Corriente boats.' },
    ],
    relations: { aurelia_circle: 'paid_to_look_away', la_corriente: 'paid_to_look_away', los_remaches: 'hostile', marsh_jackals: 'wary', vecinos_marisma: 'neutral', vigia_azul_security: 'allied', marazul_fire_rescue: 'allied' },
    rampageTarget: false,
    barks: ['Policía de Marazul! Stop the vehicle!', 'Suspect on foot, heading for the boulevard.', 'Hands where I can see them!', 'Dispatch, I need another unit. And a coffee.'],
  },
  marazul_fire_rescue: {
    id: 'marazul_fire_rescue',
    name: 'Marazul Fire and Rescue',
    shortName: 'MFR',
    kind: 'emergency',
    motto: 'Primero en llegar',
    description: 'Paramedics and fire crews out of Estación de Bomberos No. 1. Ambulances drive to anyone left on the pavement and revive pedestrians; crews never fight.',
    leader: null,
    notableMembers: [],
    colors: { primary: '#C8372D', secondary: '#F2F0E8', accent: '#F2C230' },
    emblem: 'A red anchor crossed with a fire axe.',
    turf: [],
    headquarters: 'bomberos_no_1',
    hangouts: ['bomberos_no_1', 'hospital_santa_brisa', 'clinica_las_lomas'],
    vehicles: { ambulance: 1 },
    vehicleColors: ['#F2F0E8'],
    weapons: ['fists'],
    members: ['paramedic', 'firefighter'],
    attitude: { dez_tolliver: 20, sol_arrieta: 20 },
    attitudeNote: 'Always neutral; attacking a crew adds heat as an assault on an officer would.',
    storyShifts: [],
    relations: { marazul_police: 'allied' },
    rampageTarget: false,
    barks: ['Make room, make room!', 'Stay with me. Insurance? No? Stay with me anyway.', 'Third one on this corner today.'],
  },
  aurelia_circle: {
    id: 'aurelia_circle',
    name: 'The Aurelia Circle',
    shortName: 'The Circle',
    kind: 'syndicate',
    motto: 'The house remembers',
    description: 'The private security of the Aurelia Group, which is to say Don Aurelio\'s army: cream blazers on the casino floor, dark suits everywhere else. They collect, they warn, and they launder gold as glazed tiles.',
    leader: 'aurelio_santangel',
    notableMembers: ['etienne_lemaire'],
    colors: { primary: '#EFE6D2', secondary: '#C9A227', accent: '#1E1E20' },
    emblem: 'A gold ring of laurel around a capital A.',
    turf: ['bahia_vista', 'isla_coral'],
    headquarters: 'the_aurelia',
    hangouts: ['the_aurelia', 'lux_marea', 'villa_santangel', 'coral_beach_club', 'club_salitre'],
    vehicles: { luxury_sedan: 6, suv: 5, sports_coupe: 2, speedboat: 2 },
    vehicleColors: ['#1E1E20', '#EFE6D2', '#C9A227'],
    weapons: ['pistol', 'heavy_revolver', 'smg', 'assault_rifle'],
    members: ['circle_guard', 'circle_enforcer'],
    attitude: { dez_tolliver: 0, sol_arrieta: -10 },
    attitudeNote: 'Polite strangers at first: guards only react to weapons and trespass. Open enemies once the phone is stolen.',
    storyShifts: [
      { afterMission: 'm08_clean_hands', attitude: { dez_tolliver: -50, sol_arrieta: -50 }, note: 'The Circle knows both faces; guards attack on sight inside turf.' },
      { afterMission: 'm12_past_due', attitude: { dez_tolliver: -90, sol_arrieta: -90 }, note: 'Hit cars hunt the leads in every district at night.' },
      { afterMission: 'm15_the_house_loses', attitude: { dez_tolliver: -30, sol_arrieta: -30 }, note: 'Leaderless; remaining crews hold only the casino.' },
    ],
    relations: { marazul_police: 'pays_off', la_corriente: 'allied', los_remaches: 'hostile', marsh_jackals: 'holds_the_lease', vecinos_marisma: 'hostile', vigia_azul_security: 'employer' },
    rampageTarget: true,
    barks: ['Mister Lemaire would like a word.', 'This is a private property. So is the pavement.', 'You are costing the house money.', 'Cameras off. Now.'],
  },
  la_corriente: {
    id: 'la_corriente',
    name: 'La Corriente',
    shortName: 'Corriente',
    kind: 'gang',
    motto: 'Todo llega',
    description: 'The Current: La Draga\'s dock crews and night-boat runners. They own the port scales, the cranes\' blind hours and the fast boats built at the Olabarría yard, and they move the Circle\'s tiles.',
    leader: 'renata_olabarria',
    notableMembers: [],
    colors: { primary: '#1F9AA0', secondary: '#0E3B43', accent: '#F28C28' },
    emblem: 'A teal wave curling into a cargo hook.',
    turf: ['puerto_tamarindo'],
    headquarters: 'astilleros_olabarria',
    hangouts: ['astilleros_olabarria', 'bodega_siete', 'cantina_la_sentina', 'terminal_tamarindo'],
    vehicles: { pickup_truck: 6, cargo_van: 5, box_truck: 3, speedboat: 4 },
    vehicleColors: ['#1F9AA0', '#0E3B43', '#E9E4D8'],
    weapons: ['tire_iron', 'pistol', 'pump_shotgun', 'smg', 'fire_bottle'],
    members: ['corriente_stevedore', 'corriente_boat_crew'],
    attitude: { dez_tolliver: -10, sol_arrieta: -45 },
    attitudeNote: 'They got Sol fired and remember her face; Dez is nobody until the cold store.',
    storyShifts: [
      { afterMission: 'm02_twice_the_weight', attitude: { dez_tolliver: -45, sol_arrieta: -60 }, note: 'Both leads are marked in the port.' },
      { afterMission: 'm09_weigh_her_again', attitude: { dez_tolliver: -80, sol_arrieta: -80 }, note: 'Boat crews chase the leads on the water anywhere west of the pier.' },
    ],
    relations: { marazul_police: 'pays_off', aurelia_circle: 'allied', los_remaches: 'hostile', marsh_jackals: 'hostile', vecinos_marisma: 'wary', vigia_azul_security: 'neutral' },
    rampageTarget: true,
    barks: ['Wrong dock, inspector.', 'Port is closed. For you, permanently.', 'La Draga says hello!', 'That crate is spoken for.'],
  },
  los_remaches: {
    id: 'los_remaches',
    name: 'Los Remaches',
    shortName: 'Remaches',
    kind: 'gang',
    motto: 'Nothing leaves whole',
    description: 'The Rivets: Chispa\'s scrapyard crew in Barrio Hierro. Car thieves, strippers and street racers in orange and soot. Loud, fast and loyal once beaten fairly.',
    leader: 'jacinto_roldan',
    notableMembers: [],
    colors: { primary: '#F08A3C', secondary: '#2B2B2E', accent: '#C0C4C8' },
    emblem: 'A steel rivet head with a spark struck off it.',
    turf: ['barrio_hierro'],
    headquarters: 'chatarreria_el_remache',
    hangouts: ['chatarreria_el_remache', 'deposito_riel_norte', 'patio_ferroviario', 'estadio_la_fragua'],
    vehicles: { muscle_car: 6, sports_coupe: 3, compact_hatch: 3, pickup_truck: 3, sport_motorcycle: 3 },
    vehicleColors: ['#F08A3C', '#2B2B2E', '#C0C4C8'],
    weapons: ['tire_iron', 'baseball_bat', 'pistol', 'smg', 'fire_bottle'],
    members: ['remache_stripper', 'remache_racer'],
    attitude: { dez_tolliver: -25, sol_arrieta: 0 },
    attitudeNote: 'Dez beat Chispa once and the yard has not forgiven it. They shove and heckle rather than shoot.',
    storyShifts: [
      { afterMission: 'm04_sparks_fly', attitude: { dez_tolliver: 45, sol_arrieta: 30 }, note: 'Uneasy allies: street races open and the yard defends the leads in Barrio Hierro.' },
      { afterMission: 'm14_heavier_than_it_looks', attitude: { dez_tolliver: 70, sol_arrieta: 60 }, note: 'Paid in gold; crews can be called as backup from the phone.' },
    ],
    relations: { marazul_police: 'hostile', aurelia_circle: 'hostile', la_corriente: 'hostile', marsh_jackals: 'wary', vecinos_marisma: 'neutral', vigia_azul_security: 'hostile' },
    rampageTarget: true,
    barks: ['Nice car. Shame about the doors.', 'Tolliver! Still driving the tow truck?', 'Chispa wants a rematch.', 'Strip it before it cools!'],
  },
  marsh_jackals: {
    id: 'marsh_jackals',
    name: 'Marsh Jackals MC',
    shortName: 'Jackals',
    kind: 'gang',
    motto: 'Paved in places',
    description: 'The motorcycle club of Los Pantanos: shrimpers, mechanics and bush pilots under Big Clo. They hold the airstrip on a lease the Circle owns, and fly the Circle\'s cash because of it.',
    leader: 'clovis_arceneaux',
    notableMembers: [],
    colors: { primary: '#C9B84A', secondary: '#26262B', accent: '#5C3A21' },
    emblem: 'A grinning jackal skull over crossed cypress knees.',
    turf: ['los_pantanos'],
    headquarters: 'mudline_roadhouse',
    hangouts: ['mudline_roadhouse', 'cypress_hollow', 'aerodromo_los_pantanos', 'cobertizo_del_camaronero'],
    vehicles: { chopper_motorcycle: 10, offroad_4x4: 4, pickup_truck: 3 },
    vehicleColors: ['#26262B', '#C9B84A', '#5C3A21'],
    weapons: ['baseball_bat', 'heavy_revolver', 'pump_shotgun', 'fire_bottle'],
    members: ['jackal_rider'],
    attitude: { dez_tolliver: -15, sol_arrieta: -15 },
    attitudeNote: 'City people are tolerated on the highway and watched on the dirt roads.',
    storyShifts: [
      { afterMission: 'm07_two_beer_problem', attitude: { dez_tolliver: 50, sol_arrieta: 50 }, note: 'Allies: Hangar 3 goes on sale and riders escort the leads in the wetlands.' },
    ],
    relations: { marazul_police: 'wary', aurelia_circle: 'resentful_tenant', la_corriente: 'hostile', los_remaches: 'wary', vecinos_marisma: 'neutral', vigia_azul_security: 'neutral' },
    rampageTarget: true,
    barks: ['You lost, city?', 'Clo says you are all right. Clo has been wrong before.', 'Mind the bikes.', 'Road ends here. So might you.'],
  },
  vecinos_marisma: {
    id: 'vecinos_marisma',
    name: 'Vecinos de la Marisma',
    shortName: 'Los Vecinos',
    kind: 'neighbourhood',
    motto: 'Everybody knows, nobody saw',
    description: 'The old town\'s residents\' association: shopkeepers, domino players and grandmothers with a phone tree. Not a gang; they simply decide what the police get told. La Notaria is their unofficial clerk.',
    leader: 'ximena_robles',
    notableMembers: [],
    colors: { primary: '#C75B7A', secondary: '#F4E4C1', accent: '#2F6F6A' },
    emblem: 'A parrot perched on an iron street lantern.',
    turf: ['la_marisma'],
    headquarters: 'ancla_torcida',
    hangouts: ['ancla_torcida', 'mercado_marisma', 'jardin_de_los_faroles', 'fonda_dona_pilar'],
    vehicles: { compact_hatch: 5, family_sedan: 4, cargo_van: 2 },
    vehicleColors: ['#C75B7A', '#F4E4C1', '#2F6F6A'],
    weapons: ['fists', 'baseball_bat'],
    members: ['vecino_lookout'],
    attitude: { dez_tolliver: 10, sol_arrieta: 45 },
    attitudeNote: 'Sol lives here. While attitude is 40 or more, witnesses in La Marisma do not report the lead\'s crimes unless a neighbour is hurt.',
    storyShifts: [
      { afterMission: 'm03_stamped_and_sealed', attitude: { dez_tolliver: 45, sol_arrieta: 60 }, note: 'Dez is vouched for; the witness rule covers both leads.' },
    ],
    relations: { marazul_police: 'neutral', aurelia_circle: 'hostile', la_corriente: 'wary', los_remaches: 'neutral', marsh_jackals: 'neutral', vigia_azul_security: 'wary' },
    rampageTarget: false,
    barks: ['I saw nothing. What colour was the nothing?', 'Tell Ximena I said hello.', 'Not on this street, mijo.', 'The parrot heard everything.'],
  },
  vigia_azul_security: {
    id: 'vigia_azul_security',
    name: 'Vigía Azul Security',
    shortName: 'Vigía Azul',
    kind: 'private_security',
    motto: 'Siempre despiertos',
    description: 'The blue-shirted guard company of the hills, the mall and the bank lobbies. They shout, radio the police twice as fast as a citizen and draw only when shot at. The Aurelia Group is their largest client.',
    leader: null,
    notableMembers: [],
    colors: { primary: '#2456A6', secondary: '#F2F0E8', accent: '#F2C230' },
    emblem: 'A blue eye inside a watchtower.',
    turf: ['las_lomas'],
    headquarters: 'parque_las_terrazas',
    hangouts: ['villa_serena', 'villa_buenaventura', 'lomas_prestige_motors', 'galerias_aurora', 'banco_meridiano_tower', 'caja_coral_bahia'],
    vehicles: { suv: 6, family_sedan: 3 },
    vehicleColors: ['#F2F0E8', '#2456A6'],
    weapons: ['fists', 'pistol'],
    members: ['security_guard'],
    attitude: { dez_tolliver: 0, sol_arrieta: 0 },
    attitudeNote: 'Neutral. A guard who sees a crime reports it in 2 seconds instead of a citizen\'s 6.',
    storyShifts: [
      { afterMission: 'm10_dead_air', attitude: { dez_tolliver: -40, sol_arrieta: -40 }, note: 'Guards in Las Lomas challenge the leads on sight and call it in.' },
      { afterMission: 'm16_for_the_record', attitude: { dez_tolliver: 0, sol_arrieta: 0 }, note: 'Contract cancelled; back to neutral.' },
    ],
    relations: { marazul_police: 'allied', aurelia_circle: 'client', la_corriente: 'neutral', los_remaches: 'hostile', marsh_jackals: 'neutral', vecinos_marisma: 'wary' },
    rampageTarget: false,
    barks: ['Sir. SIR. This is a residents\' road.', 'Control, I have a situation at the gate.', 'I am authorised to be very disappointed.', 'Move along, please.'],
  },
});

/** Faction ids in the order menus and the map legend list them. */
export const FACTION_ORDER = Object.freeze([
  'marazul_police', 'marazul_fire_rescue', 'aurelia_circle', 'la_corriente', 'los_remaches', 'marsh_jackals', 'vecinos_marisma', 'vigia_azul_security',
]);

/**
 * The police units the wanted level dispatches (wantedLevels.js names them by id).
 * `vehicle` is a vehicleCatalog id or null for a foot unit; `crew` lists FACTION_MEMBERS ids.
 */
export const POLICE_UNITS = freezeCatalog({
  beat_officer: { id: 'beat_officer', name: 'Beat officer', vehicle: null, crew: ['patrol_officer'], crewSize: 2, minStars: 1, weapons: ['pistol'], tactics: ['approach_on_foot', 'order_to_surrender', 'arrest_at_close_range'], shootsAtStars: 2, spawnDistance: [45, 90], maxActive: 4 },
  patrol_car: { id: 'patrol_car', name: 'Patrol car', vehicle: 'police_cruiser', crew: ['patrol_officer'], crewSize: 2, minStars: 1, weapons: ['pistol', 'pump_shotgun'], tactics: ['follow', 'block_road', 'pit_manoeuvre', 'dismount_and_arrest'], shootsAtStars: 2, spawnDistance: [120, 220], maxActive: 6 },
  pursuit_suv: { id: 'pursuit_suv', name: 'Pursuit SUV', vehicle: 'police_suv', crew: ['patrol_officer'], crewSize: 4, minStars: 3, weapons: ['pistol', 'smg', 'pump_shotgun'], tactics: ['ram', 'box_in', 'roadblock', 'spike_strip'], shootsAtStars: 3, spawnDistance: [140, 260], maxActive: 4 },
  harbor_boat: { id: 'harbor_boat', name: 'Harbor Patrol boat', vehicle: 'police_boat', crew: ['harbor_officer'], crewSize: 3, minStars: 2, weapons: ['pistol', 'smg'], tactics: ['intercept_on_water', 'ram', 'searchlight'], shootsAtStars: 2, spawnDistance: [150, 300], maxActive: 3, onlyWhenTargetOnWater: true },
  air_support: { id: 'air_support', name: 'Air support', vehicle: 'police_helicopter', crew: ['tactical_officer'], crewSize: 2, minStars: 3, weapons: ['sniper_rifle'], tactics: ['track_from_above', 'searchlight', 'call_out_position', 'marksman_fire'], shootsAtStars: 4, spawnDistance: [250, 400], maxActive: 1, altitude: 55 },
  tactical_team: { id: 'tactical_team', name: 'Tactical team', vehicle: 'swat_van', crew: ['tactical_officer'], crewSize: 6, minStars: 4, weapons: ['smg', 'assault_rifle', 'pump_shotgun'], tactics: ['armoured_roadblock', 'dismount_in_cover', 'advance_in_pairs', 'flank'], shootsAtStars: 4, spawnDistance: [160, 280], maxActive: 2 },
});

/**
 * The people of each faction as the character artist models them and the combat system spawns
 * them. `appearance` has the same shape as a pedestrian archetype's: weighted ranges drawn from
 * CHARACTER_APPEARANCE_VOCABULARY in storyCharacters.js, and outfits whose pieces carry hex colours.
 */
export const FACTION_MEMBERS = freezeCatalog({
  patrol_officer: member('patrol_officer', 'MPD Patrol Officer', 'marazul_police', 'patrol', 120, 30, 0.42, ['pistol', 'pump_shotgun'], [40, 120],
    crewLook({ female: 2, male: 3 }, ['bun', 'ponytail', 'bob', 'braids'], ['buzz', 'short_crop', 'side_part', 'shaved'], { none: 5, moustache: 2, stubble: 1 }, [
      outfit(10, 'police_shirt', ['#8FB8D8'], null, 'suit_trousers', ['#1B2A41'], 'boots', ['#1A1A1C'], [acc('badge', ['#E8B23A'], 1), acc('holster', ['#1A1A1C'], 1), acc('cap', ['#1B2A41'], 0.5), acc('sunglasses', ['#1E1E20'], 0.4)]),
    ])),
  harbor_officer: member('harbor_officer', 'Harbor Patrol Officer', 'marazul_police', 'water patrol', 110, 20, 0.4, ['pistol', 'smg'], [40, 140],
    crewLook({ female: 1, male: 3 }, ['ponytail', 'bun', 'short_crop'], ['buzz', 'short_crop', 'shaved'], { none: 4, stubble: 2, short_beard: 1 }, [
      outfit(10, 'police_shirt', ['#F2F0E8'], null, 'shorts', ['#1B2A41'], 'sneakers', ['#F2F0E8'], [acc('badge', ['#E8B23A'], 1), acc('holster', ['#1A1A1C'], 1), acc('cap', ['#1D4E7A'], 0.8), acc('sunglasses', ['#1E1E20'], 0.7)]),
    ])),
  tactical_officer: member('tactical_officer', 'MPD Tactical Officer', 'marazul_police', 'tactical', 160, 100, 0.55, ['smg', 'assault_rifle', 'pump_shotgun', 'sniper_rifle'], [60, 150],
    crewLook({ female: 1, male: 4 }, ['bun', 'short_crop'], ['buzz', 'shaved', 'short_crop'], { none: 4, stubble: 2, short_beard: 1 }, [
      outfit(10, 'tactical_vest', ['#26262B'], ['#1B2A41'], 'cargo', ['#1B2A41'], 'boots', ['#1A1A1C'], [acc('helmet', ['#26262B'], 1), acc('gloves', ['#1A1A1C'], 1), acc('holster', ['#1A1A1C'], 1), acc('badge', ['#E8B23A'], 0.5)]),
    ], ['athletic', 'heavy'])),
  detective: member('detective', 'Major Crimes Detective', 'marazul_police', 'plain clothes', 110, 20, 0.5, ['pistol', 'heavy_revolver'], [80, 220],
    crewLook({ female: 2, male: 3 }, ['bob', 'bun', 'braids', 'long_wavy'], ['side_part', 'short_crop', 'slick_back', 'bald'], { none: 4, stubble: 2, moustache: 2, goatee: 1 }, [
      outfit(6, 'blazer', ['#5C6166', '#6B5B4B', '#2F3E52'], ['#F2F0E8', '#C9D6E2'], 'chinos', ['#3A3D40', '#8A7A62'], 'loafers', ['#3A2A1E'], [acc('badge', ['#E8B23A'], 1), acc('holster', ['#5A3A26'], 1), acc('tie', ['#7C2E2E', '#1D4E7A'], 0.5), acc('watch', ['#B8BCC2'], 0.6)]),
      outfit(4, 'button_shirt', ['#C9D6E2', '#F2F0E8'], null, 'suit_trousers', ['#3A3D40'], 'loafers', ['#1A1A1C'], [acc('badge', ['#E8B23A'], 1), acc('holster', ['#5A3A26'], 1), acc('sunglasses', ['#1E1E20'], 0.4)]),
    ])),
  paramedic: member('paramedic', 'MFR Paramedic', 'marazul_fire_rescue', 'medic', 100, 0, 0, ['fists'], [20, 80],
    crewLook({ female: 3, male: 3 }, ['ponytail', 'bun', 'braids', 'bob'], ['short_crop', 'buzz', 'curly_short', 'afro_short'], { none: 5, stubble: 2, short_beard: 1 }, [
      outfit(10, 'polo', ['#F2F0E8'], null, 'cargo', ['#1B2A41'], 'boots', ['#1A1A1C'], [acc('badge', ['#C8372D'], 1), acc('gloves', ['#6FB7D9'], 0.8), acc('backpack', ['#C8372D'], 0.6), acc('watch', ['#1A1A1C'], 0.6)]),
    ])),
  firefighter: member('firefighter', 'MFR Firefighter', 'marazul_fire_rescue', 'fire crew', 130, 20, 0, ['fists'], [20, 80],
    crewLook({ female: 1, male: 4 }, ['bun', 'ponytail'], ['buzz', 'short_crop', 'shaved'], { none: 3, moustache: 3, stubble: 2, short_beard: 1 }, [
      outfit(7, 'tee', ['#1B2A41'], null, 'cargo', ['#B89B5E'], 'boots', ['#1A1A1C'], [acc('helmet', ['#F2C230', '#C8372D'], 0.7), acc('gloves', ['#C98A3A'], 0.7)]),
      outfit(3, 'vest', ['#B89B5E'], ['#1B2A41'], 'cargo', ['#B89B5E'], 'boots', ['#1A1A1C'], [acc('helmet', ['#F2C230'], 1), acc('gloves', ['#C98A3A'], 1)]),
    ], ['athletic', 'heavy'])),
  circle_guard: member('circle_guard', 'Aurelia Floor Guard', 'aurelia_circle', 'guard', 120, 20, 0.45, ['pistol', 'smg'], [150, 400],
    crewLook({ female: 2, male: 4 }, ['bun', 'ponytail', 'bob', 'long_straight'], ['slick_back', 'side_part', 'buzz', 'short_crop'], { none: 5, stubble: 2, goatee: 1 }, [
      outfit(10, 'blazer', ['#EFE6D2'], ['#1E1E20'], 'suit_trousers', ['#1E1E20'], 'loafers', ['#1A1A1C'], [acc('badge', ['#C9A227'], 1), acc('holster', ['#1A1A1C'], 1), acc('watch', ['#C9A227'], 0.7), acc('sunglasses', ['#1E1E20'], 0.5)]),
    ], ['athletic', 'average'])),
  circle_enforcer: member('circle_enforcer', 'Circle Enforcer', 'aurelia_circle', 'enforcer', 170, 60, 0.58, ['heavy_revolver', 'smg', 'assault_rifle'], [300, 800],
    crewLook({ female: 1, male: 4 }, ['bun', 'ponytail'], ['slick_back', 'shaved', 'buzz', 'bald'], { none: 3, stubble: 3, short_beard: 2, goatee: 1 }, [
      outfit(7, 'suit_jacket', ['#1E1E20', '#2A2A33'], ['#F2F0E8'], 'suit_trousers', ['#1E1E20'], 'loafers', ['#1A1A1C'], [acc('sunglasses', ['#1E1E20'], 0.8), acc('holster', ['#1A1A1C'], 1), acc('tie', ['#C9A227'], 0.7), acc('watch', ['#C9A227'], 0.8), acc('gloves', ['#1A1A1C'], 0.4)]),
      outfit(3, 'tactical_vest', ['#1E1E20'], ['#EFE6D2'], 'suit_trousers', ['#1E1E20'], 'boots', ['#1A1A1C'], [acc('sunglasses', ['#1E1E20'], 0.6), acc('holster', ['#1A1A1C'], 1), acc('gloves', ['#1A1A1C'], 0.8)]),
    ], ['athletic', 'heavy'])),
  corriente_stevedore: member('corriente_stevedore', 'Corriente Stevedore', 'la_corriente', 'dock muscle', 130, 0, 0.36, ['tire_iron', 'pistol', 'pump_shotgun'], [60, 220],
    crewLook({ female: 1, male: 4 }, ['ponytail', 'braids', 'bun'], ['buzz', 'shaved', 'bald', 'short_crop'], { none: 2, stubble: 3, short_beard: 3, full_beard: 1 }, [
      outfit(6, 'vest', ['#F28C28', '#E8E23A'], ['#0E3B43', '#1F9AA0'], 'cargo', ['#3A3D40', '#0E3B43'], 'boots', ['#3A2A1E'], [acc('bandana', ['#1F9AA0'], 1), acc('gloves', ['#C98A3A'], 0.6), acc('hard_hat', ['#1F9AA0', '#F2F0E8'], 0.4)]),
      outfit(4, 'tank', ['#1F9AA0', '#0E3B43', '#E9E4D8'], null, 'cargo', ['#3A3D40'], 'boots', ['#1A1A1C'], [acc('bandana', ['#1F9AA0'], 1), acc('chain', ['#B8BCC2'], 0.4), acc('gloves', ['#3A3D40'], 0.4)]),
    ], ['athletic', 'heavy'])),
  corriente_boat_crew: member('corriente_boat_crew', 'Corriente Boat Crew', 'la_corriente', 'night-boat runner', 110, 10, 0.44, ['pistol', 'smg', 'fire_bottle'], [100, 350],
    crewLook({ female: 2, male: 3 }, ['ponytail', 'braids', 'long_wavy'], ['short_crop', 'curly_short', 'buzz'], { none: 3, stubble: 3, goatee: 1, short_beard: 2 }, [
      outfit(6, 'hoodie', ['#1F9AA0', '#0E3B43'], null, 'shorts', ['#26262B', '#3A3D40'], 'sneakers', ['#E9E4D8', '#26262B'], [acc('bandana', ['#1F9AA0'], 0.8), acc('sunglasses', ['#F28C28', '#1E1E20'], 0.6), acc('chain', ['#C9A227'], 0.5)]),
      outfit(4, 'open_shirt_over_tee', ['#1F9AA0'], ['#E9E4D8', '#26262B'], 'jeans', ['#2F4A6B'], 'sneakers', ['#E9E4D8'], [acc('cap', ['#0E3B43'], 0.6), acc('chain', ['#C9A227'], 0.5), acc('holster', ['#3A2A1E'], 0.6)]),
    ], ['slim', 'average', 'athletic'])),
  remache_stripper: member('remache_stripper', 'Remache Stripper', 'los_remaches', 'yard crew', 115, 0, 0.34, ['tire_iron', 'baseball_bat', 'pistol'], [40, 180],
    crewLook({ female: 2, male: 4 }, ['ponytail', 'braids', 'bun', 'bob'], ['buzz', 'curly_short', 'short_crop', 'afro_short'], { none: 4, stubble: 3, goatee: 2 }, [
      outfit(6, 'tank', ['#2B2B2E', '#F08A3C', '#E9E4D8'], null, 'cargo', ['#3A3D40', '#4A3B2A'], 'boots', ['#1A1A1C'], [acc('bandana', ['#F08A3C'], 1), acc('gloves', ['#C98A3A'], 0.7), acc('chain', ['#C0C4C8'], 0.4)]),
      outfit(4, 'vest', ['#2B2B2E'], ['#F08A3C'], 'jeans', ['#26262B', '#2F4A6B'], 'boots', ['#3A2A1E'], [acc('bandana', ['#F08A3C'], 0.8), acc('cap', ['#2B2B2E'], 0.5), acc('gloves', ['#3A3D40'], 0.5)]),
    ])),
  remache_racer: member('remache_racer', 'Remache Racer', 'los_remaches', 'driver', 100, 0, 0.4, ['pistol', 'smg', 'fire_bottle'], [120, 500],
    crewLook({ female: 3, male: 3 }, ['ponytail', 'long_straight', 'braids', 'bob'], ['short_crop', 'slick_back', 'curly_short', 'buzz'], { none: 5, stubble: 3, goatee: 1 }, [
      outfit(6, 'bomber', ['#F08A3C'], ['#2B2B2E', '#E9E4D8'], 'jeans', ['#26262B', '#2F4A6B'], 'sneakers', ['#E9E4D8', '#F08A3C'], [acc('sunglasses', ['#1E1E20', '#F08A3C'], 0.6), acc('chain', ['#C0C4C8'], 0.6), acc('gloves', ['#1A1A1C'], 0.5), acc('cap', ['#2B2B2E'], 0.3)]),
      outfit(4, 'hoodie', ['#2B2B2E'], null, 'jeans', ['#3A3D40'], 'sneakers', ['#F08A3C'], [acc('bandana', ['#F08A3C'], 0.8), acc('watch', ['#C0C4C8'], 0.4)]),
    ], ['slim', 'average', 'athletic'], ['young_adult', 'adult'])),
  jackal_rider: member('jackal_rider', 'Marsh Jackal Rider', 'marsh_jackals', 'club member', 150, 10, 0.4, ['baseball_bat', 'heavy_revolver', 'pump_shotgun'], [60, 260],
    crewLook({ female: 1, male: 4 }, ['long_wavy', 'braids', 'ponytail'], ['bald', 'ponytail', 'long_wavy', 'shaved', 'buzz'], { full_beard: 5, short_beard: 3, moustache: 2, stubble: 1, none: 1 }, [
      outfit(6, 'vest', ['#26262B'], ['#5C6166', '#E9E4D8', '#3D4A2E'], 'jeans', ['#2F4A6B', '#26262B'], 'boots', ['#3A2A1E', '#1A1A1C'], [acc('bandana', ['#C9B84A'], 0.9), acc('sunglasses', ['#1E1E20'], 0.6), acc('chain', ['#B8BCC2'], 0.5), acc('gloves', ['#1A1A1C'], 0.5)]),
      outfit(4, 'leather_jacket', ['#26262B', '#3A2A1E'], ['#C9B84A', '#5C6166'], 'jeans', ['#26262B'], 'boots', ['#1A1A1C'], [acc('helmet', ['#26262B', '#C9B84A'], 0.5), acc('bandana', ['#C9B84A'], 0.6), acc('gloves', ['#1A1A1C'], 0.7)]),
    ], ['heavy', 'athletic', 'average'], ['adult', 'middle_aged', 'senior'])),
  vecino_lookout: member('vecino_lookout', 'Marisma Neighbour', 'vecinos_marisma', 'lookout', 100, 0, 0.2, ['fists', 'baseball_bat'], [20, 90],
    crewLook({ female: 3, male: 3 }, ['bun', 'bob', 'long_wavy', 'braids'], ['side_part', 'short_crop', 'bald', 'curly_short'], { none: 4, moustache: 3, stubble: 1, short_beard: 1 }, [
      outfit(6, 'button_shirt', ['#F4E4C1', '#C75B7A', '#8FB8D8', '#F2F0E8'], null, 'chinos', ['#8A7A62', '#3A3D40', '#B89B5E'], 'sandals', ['#5A3A26'], [acc('sun_hat', ['#E3D3A8'], 0.4), acc('glasses', ['#3A2A1E'], 0.4), acc('watch', ['#C9A227'], 0.4)]),
      outfit(4, 'dress_top', ['#C75B7A', '#2F6F6A', '#E0B13C'], null, 'dress', ['#C75B7A', '#2F6F6A', '#E0B13C'], 'sandals', ['#5A3A26'], [acc('earrings', ['#C9A227'], 0.7), acc('glasses', ['#3A2A1E'], 0.3)], 'female'),
    ], ['average', 'heavy', 'slim'], ['adult', 'middle_aged', 'senior'])),
  security_guard: member('security_guard', 'Vigía Azul Guard', 'vigia_azul_security', 'guard', 110, 10, 0.3, ['fists', 'pistol'], [30, 110],
    crewLook({ female: 2, male: 4 }, ['bun', 'ponytail', 'bob'], ['short_crop', 'buzz', 'side_part', 'bald'], { none: 4, moustache: 3, stubble: 2 }, [
      outfit(10, 'police_shirt', ['#DDE6EE'], null, 'suit_trousers', ['#2456A6'], 'boots', ['#1A1A1C'], [acc('cap', ['#2456A6'], 0.8), acc('badge', ['#F2C230'], 1), acc('holster', ['#1A1A1C'], 0.7), acc('glasses', ['#3A3D40'], 0.2)]),
    ], ['average', 'heavy', 'athletic'])),
});

/** How attitude numbers turn into behaviour, for the faction and combat systems. */
export const FACTION_ATTITUDE_RULES = freezeCatalog({
  range: [-100, 100],
  attackOnSightAtOrBelow: -40,
  defendLeadAtOrAbove: 40,
  perKill: -12,
  perAssault: -5,
  perVehicleStolen: -4,
  recoveryPerGameDay: 3,
  recoveryStopsAtStoryValue: true,
  turfWarningSeconds: 6,
  backupCallCost: 500,
  backupCallCooldownSeconds: 240,
  backupCrewSize: 3,
});

/** Builds one member entry. */
function member(id, name, faction, role, health, armor, accuracy, weapons, cashCarried, appearance) {
  return { id, name, faction, role, health, armor, accuracy, weapons, cashCarried, appearance };
}

/** Builds an appearance range block in the shape pedestrianArchetypes.js uses. */
function crewLook(sexes, femaleHair, maleHair, facialHair, outfits, builds, ageBands) {
  const buildWeights = {};
  for (const build of builds || ['average', 'athletic']) buildWeights[build] = 1;
  const ageWeights = {};
  for (const band of ageBands || ['young_adult', 'adult', 'middle_aged']) ageWeights[band] = 1;
  return {
    sexes,
    ageBands: ageWeights,
    heightRange: [1.6, 1.94],
    builds: buildWeights,
    skinTones: ['#F3D9C6', '#E8C3A4', '#D9A982', '#C68B63', '#B07A52', '#8D5A3B', '#6B4129', '#4A2C1D'],
    hairStyles: { female: femaleHair, male: maleHair },
    hairColors: ['#16120F', '#2E2019', '#4F3524', '#6E4428', '#8F8E8B'],
    facialHair,
    outfits,
  };
}

/** Builds one weighted outfit; `secondary` is the layer under an open top, or null. */
function outfit(weight, top, topColors, secondary, bottom, bottomColors, shoes, shoeColors, accessories, sex) {
  const topPiece = secondary ? { piece: top, colors: topColors, secondaryColors: secondary } : { piece: top, colors: topColors };
  return { weight, sex: sex || 'any', top: topPiece, bottom: { piece: bottom, colors: bottomColors }, shoes: { piece: shoes, colors: shoeColors }, accessories };
}

/** Builds one accessory with the chance (0 to 1) that a spawned member wears it. */
function acc(piece, colors, chance) {
  return { piece, colors, chance };
}

/** Recursively freezes a plain data tree so that no system can mutate the shared catalog. */
function freezeCatalog(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) freezeCatalog(value[key]);
  }
  return value;
}
