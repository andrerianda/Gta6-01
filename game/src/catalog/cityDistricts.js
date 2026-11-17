// The nine districts of Marazul: the single source of truth for what each part of the city is
// called, how it looks, who drives and walks there, who runs it, how hard the police watch it,
// its street names and its named landmarks. The city plan places the landmarks by `kind`,
// `footprint` and `needs`; the building artists model by `kind`; missions, shops and properties
// refer to landmarks by `id`. Plain frozen data, no imports.
//
// Units: metres, seconds, radians. Colours are sRGB hex strings. Weights are relative (a mix of
// 100 is only a convenience). Vehicle ids come from vehicleCatalog.js, pedestrian ids from
// pedestrianArchetypes.js, faction ids from gangsAndFactions.js, brand ids from
// brandsAndSignage.js, building style ids from BUILDING_STYLES below.

/**
 * @typedef {Object} CityLandmark
 * @property {string} id Stable snake_case id, unique across the whole city.
 * @property {string} name The invented name painted on signs and shown on the map.
 * @property {string} kind One of LANDMARK_KINDS.
 * @property {'small'|'medium'|'large'|'huge'} footprint Lot class: up to 20 m, 40 m, 80 m, beyond.
 * @property {string[]} needs Placement wishes drawn from LANDMARK_NEEDS, most important first.
 * @property {string} blurb One line: what it is and why the game cares.
 * @property {string} [brand] Id in brandsAndSignage.js whose colours and lettering it carries.
 * @property {boolean} [purchasable] True when a property in shopsAndProperties.js is sold here.
 */

/**
 * @typedef {Object} CityDistrict
 * @property {string} id
 * @property {string} name
 * @property {string} tagline Shown under the name when the player enters the district.
 * @property {string} description
 * @property {{primary: string, secondary: string, accent: string, facadePalette: string[], neonPalette: string[]}} moodColors
 * @property {Record<string, number>} buildingStyles Weights by BUILDING_STYLES id for ordinary lots.
 * @property {Record<string, number>} trafficMix Weights by civilian vehicle id.
 * @property {{day: number, night: number}} trafficDensity 0 (empty) to 1 (rush hour).
 * @property {number} boatTraffic 0 to 1: how busy the district's water lanes are.
 * @property {Record<string, number>} pedestrianMix Weights by pedestrian archetype id.
 * @property {{day: number, night: number}} pedestrianDensity 0 (deserted) to 1 (crowded).
 * @property {string} controllingFaction Faction id of whoever runs the streets here.
 * @property {{level: 'minimal'|'light'|'moderate'|'heavy', patrolChance: number, responseSeconds: number}} policePresence
 *   patrolChance is the chance that a traffic spawn slot becomes a patrol car; responseSeconds is
 *   how long the first unit takes to arrive after a reported crime.
 * @property {string[]} streetNames Eight to twelve invented names; avenues come first.
 * @property {CityLandmark[]} landmarks Six to ten named places.
 */

/**
 * The nine districts of Marazul, keyed by district id.
 * @type {Readonly<Record<string, CityDistrict>>}
 */
export const CITY_DISTRICTS = freezeCatalog({
  playa_dorada: {
    id: 'playa_dorada',
    name: 'Playa Dorada',
    tagline: 'Two kilometres of sand and no parking',
    description:
      'The beach strip: a palm-lined ocean boulevard, pastel art deco hotels with neon names, a ' +
      'promenade of joggers and street musicians, and the long Muelle Dorado pier. Tourist money ' +
      'by day, club queues by night, and a police precinct that mostly writes parking tickets.',
    moodColors: {
      primary: '#F6A6B2',
      secondary: '#7FD6C8',
      accent: '#FFD36B',
      facadePalette: ['#F7C6CF', '#BFE8DF', '#FBE3A6', '#F9D2B8', '#CDE4F6', '#F4EFE6'],
      neonPalette: ['#FF4FA3', '#3DE0D0', '#FFC53D'],
    },
    buildingStyles: {
      art_deco_hotel: 34,
      pastel_apartment_block: 26,
      strip_mall: 14,
      colonial_shopfront: 10,
      resort_tower: 8,
      parking_structure: 4,
      roadside_box: 4,
    },
    trafficMix: {
      convertible_cruiser: 16,
      compact_hatch: 14,
      family_sedan: 14,
      taxi_cab: 14,
      suv: 10,
      sports_coupe: 8,
      luxury_sedan: 6,
      sport_motorcycle: 5,
      city_bus: 4,
      muscle_car: 4,
      chopper_motorcycle: 3,
      supercar: 2,
    },
    trafficDensity: { day: 0.75, night: 0.6 },
    boatTraffic: 0.5,
    pedestrianMix: {
      beach_tourist: 24,
      sunbather: 16,
      jogger: 10,
      surfer: 8,
      hotel_staff: 8,
      club_goer: 8,
      student: 8,
      street_musician: 4,
      market_vendor: 4,
      office_worker: 4,
      high_roller: 4,
      old_town_elder: 2,
    },
    pedestrianDensity: { day: 0.9, night: 0.7 },
    controllingFaction: 'marazul_police',
    policePresence: { level: 'moderate', patrolChance: 0.06, responseSeconds: 22 },
    streetNames: [
      'Bulevar Dorado',
      'Avenida Flamenco',
      'Paseo de la Espuma',
      'Calle Caracol',
      'Calle Coquina',
      'Calle Sombrilla',
      'Calle Hamaca',
      'Calle Arena Fina',
      'Calle Toldo',
      'Calle Malecón Viejo',
      'Pasaje Marejada',
      'Calle Salvavidas',
    ],
    landmarks: [
      { id: 'muelle_dorado', name: 'Muelle Dorado', kind: 'pier', footprint: 'huge', needs: ['coastal'], blurb: 'The long timber pier off the middle of the beach: arcade, bait stand, moored speedboats and the best stunt jump in the city.' },
      { id: 'hotel_cielo_rosa', name: 'Hotel Cielo Rosa', kind: 'grand_hotel', footprint: 'large', needs: ['on_avenue'], brand: 'hotel_cielo_rosa', purchasable: true, blurb: 'Pink deco flagship of the strip. Suite 808 is for sale and comes with a view and a valet who asks no questions.' },
      { id: 'hotel_pelicano', name: 'The Pelícano', kind: 'grand_hotel', footprint: 'large', needs: ['on_avenue', 'on_corner'], brand: 'hotel_pelicano', blurb: 'Mint-green curves and a rooftop sign of a pelican in sunglasses. Favoured by people paying cash.' },
      { id: 'hotel_marejada', name: 'Hotel Marejada', kind: 'grand_hotel', footprint: 'large', needs: ['on_avenue'], brand: 'hotel_marejada', blurb: 'Butter-yellow tower with porthole windows, owned on paper by eleven different companies.' },
      { id: 'club_salitre', name: 'Club Salitre', kind: 'nightclub', footprint: 'medium', needs: ['on_corner'], brand: 'club_salitre', purchasable: true, blurb: 'The strip\'s loudest nightclub. A business the leads can buy once the Circle loses its grip on it.' },
      { id: 'dos_soles_diner', name: 'Dos Soles Diner', kind: 'diner', footprint: 'small', needs: ['on_avenue'], brand: 'dos_soles_diner', purchasable: true, blurb: 'Chrome-and-neon diner with two suns on the sign. Food for health, and a booth where jobs get discussed.' },
      { id: 'brisa_y_hilo', name: 'Brisa & Hilo', kind: 'clothing_store', footprint: 'small', needs: [], brand: 'brisa_y_hilo', blurb: 'Beachwear and loud shirts. The cheapest way to stop matching a police description.' },
      { id: 'solana_bulevar', name: 'Solana Fuel Bulevar', kind: 'fuel_station', footprint: 'medium', needs: ['on_avenue', 'on_corner'], brand: 'solana_fuel', blurb: 'Fuel station on the boulevard with a snack counter and a quick-repair bay.' },
      { id: 'precinto_playa', name: 'MPD Beach Precinct', kind: 'police_station', footprint: 'medium', needs: ['on_avenue'], brand: 'marazul_police', blurb: 'Pastel-blue police station for the strip. Arrests on the south and east side are released here.' },
      { id: 'capa_fresca_playa', name: 'Capa Fresca Playa', kind: 'paint_and_body_shop', footprint: 'medium', needs: [], brand: 'capa_fresca', blurb: 'Paint and body shop one block behind the hotels. A respray here loses the police if nobody saw you drive in.' },
    ],
  },

  centro: {
    id: 'centro',
    name: 'Centro',
    tagline: 'Glass, marble and other people\'s money',
    description:
      'Downtown: a tight grid of glass towers and older stone offices around Plaza de la Marea. ' +
      'City hall, the courthouse, the Banco Meridiano tower and police headquarters all sit within ' +
      'four blocks of each other, which the city calls efficiency and Sol calls a conflict of interest.',
    moodColors: {
      primary: '#5E86A8',
      secondary: '#D9DEE3',
      accent: '#F2B544',
      facadePalette: ['#C9D3DB', '#9FB4C4', '#E6E0D4', '#7C8C99', '#B8AFA1'],
      neonPalette: ['#49B6FF', '#FFB13D', '#EDEDED'],
    },
    buildingStyles: {
      glass_tower: 30,
      office_midrise: 30,
      civic_neoclassical: 8,
      pastel_apartment_block: 10,
      colonial_shopfront: 8,
      parking_structure: 8,
      strip_mall: 6,
    },
    trafficMix: {
      taxi_cab: 20,
      family_sedan: 20,
      compact_hatch: 14,
      luxury_sedan: 10,
      suv: 10,
      city_bus: 8,
      cargo_van: 6,
      sports_coupe: 4,
      sport_motorcycle: 4,
      box_truck: 3,
      supercar: 1,
    },
    trafficDensity: { day: 0.95, night: 0.45 },
    boatTraffic: 0,
    pedestrianMix: {
      office_worker: 34,
      executive: 12,
      student: 10,
      beach_tourist: 8,
      jogger: 6,
      hillside_resident: 6,
      hotel_staff: 4,
      street_musician: 4,
      market_vendor: 4,
      old_town_elder: 4,
      club_goer: 4,
      high_roller: 2,
      factory_worker: 2,
    },
    pedestrianDensity: { day: 1.0, night: 0.35 },
    controllingFaction: 'marazul_police',
    policePresence: { level: 'heavy', patrolChance: 0.1, responseSeconds: 14 },
    streetNames: [
      'Avenida de los Fundadores',
      'Gran Vía Marazul',
      'Avenida Meridiano',
      'Calle Tesorería',
      'Calle Cabildo',
      'Calle Notarios',
      'Calle Cristal',
      'Calle Aduana',
      'Calle Telégrafo',
      'Calle Imprenta',
      'Calle Almirante',
      'Pasaje del Reloj',
    ],
    landmarks: [
      { id: 'mpd_headquarters', name: 'Marazul Police Headquarters', kind: 'police_station', footprint: 'large', needs: ['on_avenue'], brand: 'marazul_police', blurb: 'MPD headquarters and Major Crimes, where Detective Whitlock keeps a wall of photographs. Arrests in the city centre are released here.' },
      { id: 'palacio_municipal', name: 'Palacio Municipal', kind: 'city_hall', footprint: 'large', needs: ['on_avenue'], blurb: 'City hall: a domed stone palace facing the plaza, where waterfront permits are approved before lunch.' },
      { id: 'tribunal_del_golfo', name: 'Tribunal del Golfo', kind: 'courthouse', footprint: 'large', needs: [], blurb: 'The courthouse, columned and slow. Its evidence dock matters in the epilogue.' },
      { id: 'banco_meridiano_tower', name: 'Banco Meridiano Tower', kind: 'bank', footprint: 'large', needs: ['on_corner', 'on_avenue'], brand: 'banco_meridiano', blurb: 'The tallest glass tower in Marazul and the bank that holds the note on the Tolliver garage.' },
      { id: 'plaza_de_la_marea', name: 'Plaza de la Marea', kind: 'plaza', footprint: 'large', needs: [], blurb: 'The central plaza: a tide-clock fountain, shade trees, pigeons, lunch crowds and a statue of a founder nobody can name.' },
      { id: 'hospital_santa_brisa', name: 'Hospital General Santa Brisa', kind: 'hospital', footprint: 'large', needs: ['on_avenue'], brand: 'santa_brisa_health', blurb: 'The public hospital. Leads knocked out anywhere west of the bay wake up here with a bill.' },
      { id: 'galerias_aurora', name: 'Galerías Aurora', kind: 'shopping_mall', footprint: 'huge', needs: ['on_avenue'], brand: 'galerias_aurora', blurb: 'Three floors of shops under a glass vault: Línea Blanca fashion, Pim\'s phone kiosk and a parking deck made for stunts.' },
      { id: 'torre_indigo', name: 'Torre Índigo', kind: 'safehouse_apartment', footprint: 'medium', needs: [], purchasable: true, blurb: 'Blue-glass residential tower. Loft 31 is for sale: a save point with a two-car garage, close to every bad idea downtown.' },
      { id: 'terminal_central', name: 'Terminal Central', kind: 'bus_terminal', footprint: 'large', needs: ['on_avenue'], brand: 'metro_marazul', blurb: 'The bus terminal: city buses, luggage, and the start of the Línea 12 driving shifts.' },
      { id: 'trueno_armory_centro', name: 'Trueno Armory Centro', kind: 'gun_shop', footprint: 'small', needs: [], brand: 'trueno_armory', blurb: 'Discreet downtown gun shop with a brass door and a shooting lane in the basement.' },
    ],
  },

  la_marisma: {
    id: 'la_marisma',
    name: 'La Marisma',
    tagline: 'Everybody knows, nobody saw',
    description:
      'The old town: crooked streets of terracotta, ochre and teal shutters, a covered market, the ' +
      'bell tower of Santa Marea and cantinas older than the port. The neighbours run it by gossip ' +
      'and a disbarred notary runs the neighbours.',
    moodColors: {
      primary: '#D9673F',
      secondary: '#E8B84A',
      accent: '#2F7F8A',
      facadePalette: ['#E59A6B', '#EFC66A', '#D9785A', '#7FB3A8', '#C7D9E8', '#F0E2C8'],
      neonPalette: ['#FF7A3D', '#39C6B5', '#FFD15C'],
    },
    buildingStyles: {
      colonial_shopfront: 34,
      stucco_rowhouse: 30,
      tile_roof_courtyard_house: 18,
      pastel_apartment_block: 8,
      corrugated_workshop: 6,
      civic_neoclassical: 4,
    },
    trafficMix: {
      compact_hatch: 26,
      family_sedan: 20,
      pickup_truck: 12,
      taxi_cab: 10,
      cargo_van: 10,
      city_bus: 5,
      suv: 5,
      chopper_motorcycle: 4,
      sport_motorcycle: 4,
      convertible_cruiser: 4,
    },
    trafficDensity: { day: 0.6, night: 0.3 },
    boatTraffic: 0.2,
    pedestrianMix: {
      old_town_elder: 22,
      market_vendor: 18,
      student: 12,
      beach_tourist: 10,
      street_musician: 8,
      fisher: 8,
      office_worker: 6,
      mechanic: 4,
      jogger: 4,
      club_goer: 4,
      factory_worker: 4,
    },
    pedestrianDensity: { day: 0.85, night: 0.5 },
    controllingFaction: 'vecinos_marisma',
    policePresence: { level: 'light', patrolChance: 0.04, responseSeconds: 28 },
    streetNames: [
      'Calle Santa Marea',
      'Calle Farolillo',
      'Calle Sal Gruesa',
      'Calle de las Redes',
      'Calle Campanario',
      'Calle Azulejo',
      'Calle Alfarero',
      'Calle Albahaca',
      'Calle Tinajas',
      'Callejón del Loro',
      'Callejón Tres Gatos',
      'Plazuela del Mercado',
    ],
    landmarks: [
      { id: 'mercado_marisma', name: 'Mercado de la Marisma', kind: 'market', footprint: 'large', needs: [], blurb: 'The covered market on the square: fish, fruit, phone cases and every rumour in the city by ten in the morning.' },
      { id: 'iglesia_santa_marea', name: 'Iglesia de Santa Marea', kind: 'church', footprint: 'medium', needs: [], blurb: 'Whitewashed church with a blue bell tower, patron of sailors and of people who are late.' },
      { id: 'ancla_torcida', name: 'Cantina El Ancla Torcida', kind: 'bar_cantina', footprint: 'small', needs: ['on_corner'], brand: 'ancla_torcida', blurb: 'The Crooked Anchor. La Notaria holds office hours in the back booth and stamps things that should not be stamped.' },
      { id: 'ropa_vieja_vintage', name: 'Ropa Vieja Vintage', kind: 'clothing_store', footprint: 'small', needs: [], brand: 'ropa_vieja_vintage', blurb: 'Second-hand clothes named after a stew. Jackets with history and prices without.' },
      { id: 'callejon_del_loro_9', name: 'Callejón del Loro No. 9', kind: 'safehouse_apartment', footprint: 'small', needs: [], purchasable: true, blurb: 'Sol\'s upstairs flat on Parrot Alley: a cheap save point with a street parking space and a neighbour\'s parrot that repeats everything.' },
      { id: 'fonda_dona_pilar', name: 'Fonda Doña Pilar', kind: 'diner', footprint: 'small', needs: [], brand: 'fonda_dona_pilar', blurb: 'Lunch counter with one menu and no substitutions. Restores health; criticism is free.' },
      { id: 'jardin_de_los_faroles', name: 'Jardín de los Faroles', kind: 'park', footprint: 'medium', needs: [], blurb: 'A walled garden of iron lanterns and domino tables where the old town settles its arguments.' },
      { id: 'bodega_la_esquina', name: 'Bodega La Esquina', kind: 'convenience_store', footprint: 'small', needs: ['on_corner'], brand: 'bodega_la_esquina', blurb: 'Corner store with snacks, lottery tickets and a clerk who has been robbed often enough to be bored by it.' },
      { id: 'bomberos_no_1', name: 'Estación de Bomberos No. 1', kind: 'fire_station', footprint: 'medium', needs: ['on_avenue'], brand: 'marazul_fire_rescue', blurb: 'The city\'s oldest fire station, red doors on the avenue; ambulances of Marazul Fire and Rescue start their runs here.' },
      { id: 'salon_guaracha', name: 'Salón Guaracha', kind: 'nightclub', footprint: 'medium', needs: [], brand: 'salon_guaracha', blurb: 'Dance hall with a live band and a strict policy on shoes. La Tumbadora broadcasts from the balcony.' },
    ],
  },

  puerto_tamarindo: {
    id: 'puerto_tamarindo',
    name: 'Puerto Tamarindo',
    tagline: 'Everything arrives, some of it declared',
    description:
      'The container port on the estuary of the Rio Tamarindo: quays, gantry cranes, stacks of ' +
      'steel boxes, cold stores and the Olabarría shipyard. La Corriente decides what the scales ' +
      'read, and the Harbor Patrol decides not to look.',
    moodColors: {
      primary: '#3D6C7A',
      secondary: '#C4552D',
      accent: '#F2C230',
      facadePalette: ['#8C9AA0', '#B5532F', '#2F6F8F', '#C9B458', '#5B6B6F'],
      neonPalette: ['#F2C230', '#4FD0E0', '#FF6A3D'],
    },
    buildingStyles: {
      warehouse_shed: 36,
      container_stack: 26,
      corrugated_workshop: 16,
      office_midrise: 6,
      roadside_box: 8,
      factory_sawtooth: 8,
    },
    trafficMix: {
      box_truck: 26,
      cargo_van: 20,
      pickup_truck: 18,
      family_sedan: 10,
      compact_hatch: 8,
      suv: 6,
      offroad_4x4: 4,
      muscle_car: 4,
      city_bus: 2,
      chopper_motorcycle: 2,
    },
    trafficDensity: { day: 0.65, night: 0.4 },
    boatTraffic: 0.7,
    pedestrianMix: {
      dock_worker: 46,
      fisher: 14,
      factory_worker: 12,
      mechanic: 10,
      swamp_local: 6,
      office_worker: 4,
      old_town_elder: 4,
      market_vendor: 4,
    },
    pedestrianDensity: { day: 0.5, night: 0.3 },
    controllingFaction: 'la_corriente',
    policePresence: { level: 'light', patrolChance: 0.03, responseSeconds: 30 },
    streetNames: [
      'Avenida Tamarindo',
      'Vía del Muelle',
      'Calle Estibadores',
      'Calle Grúa',
      'Calle Dársena',
      'Calle Amarre',
      'Calle Bitácora',
      'Calle Lastre',
      'Calle Cabotaje',
      'Calle Remolcador',
      'Calle Ancla',
    ],
    landmarks: [
      { id: 'terminal_tamarindo', name: 'Terminal de Contenedores Tamarindo', kind: 'container_terminal', footprint: 'huge', needs: ['coastal'], brand: 'naviera_tamarindo', blurb: 'The container terminal: gantry cranes, stacked boxes and the export ramp where stolen cars leave the country.' },
      { id: 'astilleros_olabarria', name: 'Astilleros Olabarría', kind: 'shipyard', footprint: 'huge', needs: ['coastal'], brand: 'olabarria_marine', blurb: 'The family shipyard of La Draga: dry dock, slipways, half-built hulls and the fast boats La Corriente runs at night.' },
      { id: 'harbor_patrol_station', name: 'MPD Harbor Patrol Station', kind: 'police_station', footprint: 'medium', needs: ['coastal'], brand: 'marazul_police', blurb: 'Captain Strand\'s station on the quay, with police boats at its dock. Arrests on the west side are released here.' },
      { id: 'bodega_siete', name: 'Bodega Siete', kind: 'warehouse', footprint: 'large', needs: [], blurb: 'Warehouse 7. Officially empty since a fire; in practice La Corriente\'s sorting floor.' },
      { id: 'frigorificos_golfo', name: 'Frigoríficos Golfo', kind: 'warehouse', footprint: 'large', needs: [], brand: 'frigorificos_golfo', blurb: 'Cold storage for shrimp, fruit and one pallet of bathroom tiles that weighs far too much.' },
      { id: 'dock_12_warehouse', name: 'Almacén Dársena 12', kind: 'warehouse', footprint: 'large', needs: ['coastal'], purchasable: true, blurb: 'The Dock 12 warehouse. The leads take it over as their base for export lists; it earns from storage nobody asks about.' },
      { id: 'petromar_port_gate', name: 'Petromar Port Gate', kind: 'fuel_station', footprint: 'medium', needs: ['on_avenue'], brand: 'petromar', blurb: 'Truck stop at the port gate: diesel, coffee, a quick-repair bay and drivers waiting on paperwork.' },
      { id: 'cantina_la_sentina', name: 'Cantina La Sentina', kind: 'bar_cantina', footprint: 'small', needs: [], brand: 'cantina_la_sentina', blurb: 'The Bilge. A dockers\' bar where a shift ends, a rumour starts and La Corriente recruits.' },
      { id: 'grua_grill', name: 'Grúa Grill', kind: 'diner', footprint: 'small', needs: ['on_avenue'], brand: 'grua_grill', blurb: 'Crane-yellow roadside grill serving plates sized for people who lift containers.' },
      { id: 'mercadito_24_puerto', name: 'Mercadito 24 Puerto', kind: 'convenience_store', footprint: 'small', needs: ['on_corner'], brand: 'mercadito_24', blurb: 'All-night convenience store for the night shift. Snacks, soda and a register worth holding up once.' },
    ],
  },

  las_lomas: {
    id: 'las_lomas',
    name: 'Las Lomas',
    tagline: 'The higher the drive, the lower the taxes',
    description:
      'The hills in the north-east: switchback roads under jacaranda and ceiba, cream villas with ' +
      'tile roofs behind bougainvillea walls, a lookout over the whole city and the red-lit radio ' +
      'mast on top. Private guards wave at residents and photograph everyone else.',
    moodColors: {
      primary: '#F1E9DA',
      secondary: '#B5533C',
      accent: '#B24C8E',
      facadePalette: ['#F3EDE0', '#E7D8C0', '#D9C2A5', '#C9D2C0', '#EBDCD0'],
      neonPalette: ['#FFD79A', '#F58FB8', '#9FE3D6'],
    },
    buildingStyles: {
      spanish_revival_villa: 38,
      modern_villa: 30,
      tile_roof_courtyard_house: 14,
      mansion_estate: 8,
      strip_mall: 6,
      office_midrise: 4,
    },
    trafficMix: {
      luxury_sedan: 22,
      suv: 22,
      sports_coupe: 14,
      convertible_cruiser: 10,
      family_sedan: 10,
      supercar: 6,
      compact_hatch: 6,
      sport_motorcycle: 4,
      cargo_van: 3,
      taxi_cab: 3,
    },
    trafficDensity: { day: 0.4, night: 0.2 },
    boatTraffic: 0,
    pedestrianMix: {
      hillside_resident: 36,
      jogger: 20,
      executive: 12,
      yacht_owner: 6,
      hotel_staff: 6,
      student: 6,
      beach_tourist: 6,
      high_roller: 4,
      mechanic: 4,
    },
    pedestrianDensity: { day: 0.35, night: 0.15 },
    controllingFaction: 'vigia_azul_security',
    policePresence: { level: 'moderate', patrolChance: 0.05, responseSeconds: 20 },
    streetNames: [
      'Camino de las Lomas',
      'Paseo Loma Alta',
      'Vuelta del Halcón',
      'Vuelta Serena',
      'Camino del Mirador',
      'Calle Buganvilla',
      'Calle Mirasol',
      'Calle Jacarandá',
      'Calle Terrazas',
      'Calle Colibrí',
      'Calle Ceiba',
    ],
    landmarks: [
      { id: 'mirador_del_halcon', name: 'Mirador del Halcón', kind: 'lookout', footprint: 'medium', needs: ['secluded'], blurb: 'Hawk\'s Lookout: a stone terrace at the top of the switchbacks with coin telescopes and the whole of Marazul below.' },
      { id: 'antena_loma_alta', name: 'Antena Loma Alta', kind: 'radio_tower', footprint: 'small', needs: ['secluded'], blurb: 'The red-and-white radio mast on the summit, with a fenced transmitter hut every station in the city depends on.' },
      { id: 'villa_buenaventura', name: 'Villa Buenaventura', kind: 'mansion', footprint: 'large', needs: ['secluded'], purchasable: true, blurb: 'A tile-roofed villa with a pool terrace and a four-car garage, for sale to whoever outbids the Circle.' },
      { id: 'villa_serena', name: 'Villa Serena', kind: 'mansion', footprint: 'large', needs: ['secluded'], blurb: 'Captain Strand\'s villa, which costs roughly forty years of a police captain\'s salary.' },
      { id: 'parque_las_terrazas', name: 'Parque Las Terrazas', kind: 'park', footprint: 'large', needs: [], blurb: 'Terraced gardens stepping down the hill: fountains, joggers and dogs with their own trainers.' },
      { id: 'solana_las_lomas', name: 'Solana Fuel Las Lomas', kind: 'fuel_station', footprint: 'medium', needs: ['on_avenue'], brand: 'solana_fuel', blurb: 'The tidiest fuel station in the city, at the foot of the hill road, with a quick-repair bay.' },
      { id: 'atelier_lomas', name: 'Atelier Lomas', kind: 'clothing_store', footprint: 'small', needs: [], brand: 'atelier_lomas', blurb: 'Tailoring by appointment. Suits and blazers that make security guards hold doors.' },
      { id: 'clinica_las_lomas', name: 'Clínica Las Lomas', kind: 'hospital', footprint: 'large', needs: ['on_avenue'], brand: 'clinica_las_lomas', blurb: 'The private clinic. Leads knocked out on the east side wake up here, with a larger bill and better coffee.' },
      { id: 'lomas_prestige_motors', name: 'Lomas Prestige Motors', kind: 'car_dealership', footprint: 'large', needs: ['on_avenue', 'on_corner'], brand: 'lomas_prestige_motors', blurb: 'Glass showroom of cars the leads can buy and have delivered to a garage, or admire and steal.' },
      { id: 'capa_fresca_lomas', name: 'Capa Fresca Las Lomas', kind: 'paint_and_body_shop', footprint: 'medium', needs: [], brand: 'capa_fresca', blurb: 'Paint and body shop at the bottom of the hill, the last hope at the end of a downhill chase.' },
    ],
  },

  bahia_vista: {
    id: 'bahia_vista',
    name: 'Bahía Vista',
    tagline: 'The house always wins, and owns the house',
    description:
      'The bay on the south-east: the marina with its forest of masts, the yacht club, a palm ' +
      'promenade, and above it all The Aurelia Resort and Casino, a white-and-gold tower with a ' +
      'pool that glitters a little too much. Don Aurelio Santángel\'s kingdom, patrolled by the ' +
      'cream blazers of the Aurelia Circle.',
    moodColors: {
      primary: '#1F8FB3',
      secondary: '#F4F1EA',
      accent: '#E0B04A',
      facadePalette: ['#EDEAE2', '#CFE3EA', '#F1D9B5', '#BFD0D6', '#E6C9B8'],
      neonPalette: ['#FFC94A', '#FF6FAE', '#56D7FF'],
    },
    buildingStyles: {
      marina_condo: 32,
      resort_tower: 22,
      pastel_apartment_block: 14,
      strip_mall: 12,
      modern_villa: 10,
      parking_structure: 6,
      art_deco_hotel: 4,
    },
    trafficMix: {
      luxury_sedan: 18,
      sports_coupe: 14,
      taxi_cab: 14,
      suv: 14,
      convertible_cruiser: 12,
      supercar: 8,
      family_sedan: 8,
      compact_hatch: 5,
      sport_motorcycle: 4,
      city_bus: 3,
    },
    trafficDensity: { day: 0.6, night: 0.7 },
    boatTraffic: 0.9,
    pedestrianMix: {
      high_roller: 20,
      yacht_owner: 18,
      beach_tourist: 16,
      hotel_staff: 14,
      club_goer: 10,
      jogger: 8,
      executive: 8,
      fisher: 3,
      street_musician: 3,
    },
    pedestrianDensity: { day: 0.6, night: 0.75 },
    controllingFaction: 'aurelia_circle',
    policePresence: { level: 'moderate', patrolChance: 0.06, responseSeconds: 18 },
    streetNames: [
      'Paseo Bahía',
      'Avenida Aurelia',
      'Paseo de las Palmas',
      'Calle Regata',
      'Calle Catamarán',
      'Calle Barlovento',
      'Calle Timón',
      'Calle Bauprés',
      'Calle Perla',
      'Calle Nácar',
      'Calle Fortuna',
    ],
    landmarks: [
      { id: 'the_aurelia', name: 'The Aurelia Resort & Casino', kind: 'casino_resort', footprint: 'huge', needs: ['coastal', 'on_avenue'], brand: 'the_aurelia', blurb: 'Santángel\'s white-and-gold casino tower: valet court, gaming floor, count room, service dock and the famous golden pool.' },
      { id: 'marina_bahia_vista', name: 'Marina Bahía Vista', kind: 'marina', footprint: 'huge', needs: ['coastal'], brand: 'prieto_charters', purchasable: true, blurb: 'Four piers of slips, a fuel dock and Ozzy Prieto\'s charter shack. Boats are bought, stored and raced from here.' },
      { id: 'bahia_vista_yacht_club', name: 'Bahía Vista Yacht Club', kind: 'yacht_club', footprint: 'large', needs: ['coastal'], brand: 'bahia_vista_yacht_club', blurb: 'Members-only clubhouse with a flag mast and a dress code. The valet lot is an export list waiting to happen.' },
      { id: 'lux_marea', name: 'Lux Marea', kind: 'nightclub', footprint: 'medium', needs: ['on_avenue'], brand: 'lux_marea', blurb: 'The Circle\'s velvet-rope nightclub, where the champagne is real and the receipts are not.' },
      { id: 'casa_lino', name: 'Casa Lino', kind: 'clothing_store', footprint: 'small', needs: [], brand: 'casa_lino', blurb: 'Resort boutique of linen in forty shades of off-white. Dressing like money opens casino doors.' },
      { id: 'caja_coral_bahia', name: 'Caja Coral Savings', kind: 'bank', footprint: 'medium', needs: ['on_corner'], brand: 'caja_coral', blurb: 'A small coral-pink savings bank that handles a surprising volume of casino cash.' },
      { id: 'helipuerto_bahia', name: 'Helipuerto Bahía', kind: 'helipad', footprint: 'medium', needs: ['coastal'], brand: 'canal_6_golfo', blurb: 'Waterfront helipad where the Canal 6 news helicopter lives between car chases.' },
      { id: 'paseo_de_las_palmas', name: 'Paseo de las Palmas', kind: 'park', footprint: 'large', needs: ['coastal'], blurb: 'The palm promenade along the bay: benches, buskers and a clear view of who is boarding which yacht.' },
      { id: 'residencias_marina', name: 'Residencias Marina', kind: 'safehouse_apartment', footprint: 'medium', needs: ['coastal'], purchasable: true, blurb: 'Waterfront condominiums. Unit 5C is for sale with a garage and its own boat slip.' },
      { id: 'marea_motorsport', name: 'Marea Motorsport', kind: 'mod_garage', footprint: 'medium', needs: ['on_avenue'], brand: 'marea_motorsport', blurb: 'Performance garage for the east side: engines, brakes, tyres, armour and paint for people who do not ask the price.' },
    ],
  },

  isla_coral: {
    id: 'isla_coral',
    name: 'Isla Coral',
    tagline: 'Residents only. The gate means you',
    description:
      'An island of mansions off the south-east shore, reached by the 400 metre Calzada Coral ' +
      'causeway. One loop road, gated drives, private docks, a beach club and a lighthouse on the ' +
      'point. Santángel lives at the far end, behind the most guards.',
    moodColors: {
      primary: '#F08A75',
      secondary: '#F6F0E4',
      accent: '#2E9E8F',
      facadePalette: ['#F5EFE3', '#F2D5C4', '#DDE8E2', '#E9E0CC'],
      neonPalette: ['#FFB199', '#7FE0D2', '#FFE2A6'],
    },
    buildingStyles: {
      mansion_estate: 46,
      modern_villa: 30,
      spanish_revival_villa: 24,
    },
    trafficMix: {
      luxury_sedan: 30,
      suv: 20,
      supercar: 16,
      sports_coupe: 16,
      convertible_cruiser: 12,
      cargo_van: 6,
    },
    trafficDensity: { day: 0.2, night: 0.12 },
    boatTraffic: 0.6,
    pedestrianMix: {
      yacht_owner: 30,
      hillside_resident: 24,
      high_roller: 14,
      jogger: 14,
      hotel_staff: 12,
      executive: 6,
    },
    pedestrianDensity: { day: 0.2, night: 0.1 },
    controllingFaction: 'aurelia_circle',
    policePresence: { level: 'light', patrolChance: 0.03, responseSeconds: 26 },
    streetNames: [
      'Calzada Coral',
      'Circuito Coral',
      'Camino Caracola',
      'Camino del Faro',
      'Camino Punta Coral',
      'Calle Madreperla',
      'Calle Anémona',
      'Calle Abanico de Mar',
    ],
    landmarks: [
      { id: 'villa_santangel', name: 'Villa Santángel', kind: 'mansion', footprint: 'huge', needs: ['coastal', 'secluded'], blurb: 'Don Aurelio\'s estate: walled gardens, a private dock, a colonnade of palms and more guards than guests. The finale happens here.' },
      { id: 'casa_caracola', name: 'Casa Caracola', kind: 'mansion', footprint: 'large', needs: ['coastal'], purchasable: true, blurb: 'A spiral-plan mansion on its own cove: the most expensive property in the game, with a six-car garage, dock and helipad access.' },
      { id: 'palacete_aldama', name: 'Palacete Aldama', kind: 'mansion', footprint: 'large', needs: ['secluded'], blurb: 'A banker\'s wedding-cake mansion whose driveway always holds at least one car worth exporting.' },
      { id: 'coral_beach_club', name: 'Coral Beach Club', kind: 'yacht_club', footprint: 'large', needs: ['coastal'], brand: 'coral_beach_club', blurb: 'Private beach club with cabanas, a dock and a membership list that doubles as a list of Santángel\'s partners.' },
      { id: 'helipuerto_isla_coral', name: 'Helipuerto Isla Coral', kind: 'helipad', footprint: 'medium', needs: ['secluded'], blurb: 'The island helipad. Santángel\'s way out when the causeway is closed.' },
      { id: 'faro_del_coral', name: 'Faro del Coral', kind: 'lighthouse', footprint: 'small', needs: ['coastal', 'secluded'], blurb: 'The coral-striped lighthouse on the southern point, at the end of a jetty. The story ends at its foot.' },
      { id: 'reserva_punta_coral', name: 'Reserva Punta Coral', kind: 'park', footprint: 'large', needs: ['coastal'], blurb: 'A strip of dunes and sea grape left wild because nobody could agree who owned it.' },
      { id: 'cabana_sotavento', name: 'Cabaña Sotavento', kind: 'beach_house', footprint: 'medium', needs: ['coastal'], purchasable: true, blurb: 'A weathered beach house on the leeward shore, the one modest building on the island, for sale with a boat dock.' },
    ],
  },

  barrio_hierro: {
    id: 'barrio_hierro',
    name: 'Barrio Hierro',
    tagline: 'Built it, broke it, towed it',
    description:
      'Industry and rail yards along the river north of the port: sawtooth factories, the cold ' +
      'chimneys of the old foundry, scrap piled three storeys high and the Tolliver family garage ' +
      'on its corner since 1974. Los Remaches strip cars here and the ballpark fills on Fridays.',
    moodColors: {
      primary: '#8A4B2F',
      secondary: '#5C6166',
      accent: '#E2772B',
      facadePalette: ['#8E5A44', '#6E7377', '#A38C6D', '#4F5A5E', '#B2674A'],
      neonPalette: ['#FF8A2B', '#E8E0C8', '#D83A2E'],
    },
    buildingStyles: {
      factory_sawtooth: 28,
      corrugated_workshop: 26,
      warehouse_shed: 22,
      stucco_rowhouse: 12,
      roadside_box: 8,
      pastel_apartment_block: 4,
    },
    trafficMix: {
      pickup_truck: 20,
      box_truck: 16,
      muscle_car: 14,
      cargo_van: 14,
      family_sedan: 12,
      compact_hatch: 10,
      chopper_motorcycle: 5,
      offroad_4x4: 4,
      city_bus: 3,
      sport_motorcycle: 2,
    },
    trafficDensity: { day: 0.55, night: 0.3 },
    boatTraffic: 0.3,
    pedestrianMix: {
      factory_worker: 34,
      mechanic: 18,
      dock_worker: 12,
      student: 6,
      old_town_elder: 6,
      market_vendor: 6,
      swamp_local: 6,
      office_worker: 4,
      jogger: 4,
      street_musician: 2,
      fisher: 2,
    },
    pedestrianDensity: { day: 0.5, night: 0.3 },
    controllingFaction: 'los_remaches',
    policePresence: { level: 'light', patrolChance: 0.035, responseSeconds: 30 },
    streetNames: [
      'Avenida del Riel',
      'Calle Fundición',
      'Calle Remache',
      'Calle Yunque',
      'Calle Chatarra',
      'Calle Durmiente',
      'Calle Caldera',
      'Calle Soldadura',
      'Calle Turno Tercero',
      'Calle Hollín',
      'Calle Tolva',
    ],
    landmarks: [
      { id: 'tolliver_tow', name: 'Tolliver Tow & Recovery', kind: 'mod_garage', footprint: 'medium', needs: ['on_corner'], brand: 'tolliver_tow', purchasable: true, blurb: 'Aunt Hattie\'s corner garage: tow yard, two lifts and the loft upstairs that is the leads\' first safehouse. Upgrades and repo orders start here.' },
      { id: 'chatarreria_el_remache', name: 'Chatarrería El Remache', kind: 'scrapyard', footprint: 'huge', needs: [], brand: 'chatarreria_el_remache', purchasable: true, blurb: 'The Rivet scrapyard: car stacks, a crusher, a dirt oval and the headquarters of Los Remaches. Street races start at its gate.' },
      { id: 'patio_ferroviario', name: 'Patio Ferroviario Hierro', kind: 'train_yard', footprint: 'huge', needs: [], blurb: 'The rail yard: sidings of boxcars and tank cars between the port and the foundry, lit by sodium lamps and watched by nobody honest.' },
      { id: 'fundicion_hierro_viejo', name: 'Fundición Hierro Viejo', kind: 'factory', footprint: 'huge', needs: [], blurb: 'The old foundry, officially closed, whose furnace has been warm at night since the tiles started arriving.' },
      { id: 'coco_bravo_bottling', name: 'Coco Bravo Bottling Plant', kind: 'factory', footprint: 'large', needs: ['on_avenue'], brand: 'coco_bravo', blurb: 'Where the city\'s coconut soda is bottled. A giant rotating bottle on the roof is visible from the highway.' },
      { id: 'capa_fresca_hierro', name: 'Capa Fresca Hierro', kind: 'paint_and_body_shop', footprint: 'medium', needs: [], brand: 'capa_fresca', blurb: 'The original Capa Fresca paint and body shop. First respray of the story; cheapest in the city.' },
      { id: 'trueno_armory_hierro', name: 'Trueno Armory Hierro', kind: 'gun_shop', footprint: 'small', needs: [], brand: 'trueno_armory', blurb: 'Gun shop behind a roll-up shutter, between a welder and a tyre shop. First weapons of the story.' },
      { id: 'solana_avenida_del_riel', name: 'Solana Fuel Avenida del Riel', kind: 'fuel_station', footprint: 'medium', needs: ['on_avenue', 'on_corner'], brand: 'solana_fuel', blurb: 'Fuel station on the rail avenue with a quick-repair bay and the worst coffee in three districts.' },
      { id: 'deposito_riel_norte', name: 'Depósito Riel Norte', kind: 'warehouse', footprint: 'large', needs: [], blurb: 'A rail-side depot the Remaches use as a chop shop: half cars in, whole parts out.' },
      { id: 'estadio_la_fragua', name: 'Estadio La Fragua', kind: 'stadium', footprint: 'huge', needs: ['on_avenue'], brand: 'fundidores_de_marazul', blurb: 'The Forge: brick-and-steel ballpark of the Fundidores de Marazul, with a parking lot built for time trials.' },
    ],
  },

  los_pantanos: {
    id: 'los_pantanos',
    name: 'Los Pantanos',
    tagline: 'Paved in places',
    description:
      'The wetlands beyond the highway at the north-west edge: mangrove channels, dirt causeways, ' +
      'herons, a trailer park under cypress trees and a short airstrip that files very few flight ' +
      'plans. The Marsh Jackals ride here and the police mostly do not.',
    moodColors: {
      primary: '#5F7F4E',
      secondary: '#9A8562',
      accent: '#D9C24A',
      facadePalette: ['#8C8F7A', '#A9977A', '#6F7F6A', '#B8B1A0', '#7A6A55'],
      neonPalette: ['#E8D24A', '#FF7043', '#8FE08A'],
    },
    buildingStyles: {
      stilt_shack: 30,
      trailer_home: 28,
      corrugated_workshop: 22,
      roadside_box: 14,
      warehouse_shed: 6,
    },
    trafficMix: {
      pickup_truck: 28,
      offroad_4x4: 24,
      chopper_motorcycle: 14,
      muscle_car: 10,
      family_sedan: 8,
      cargo_van: 6,
      box_truck: 6,
      suv: 4,
    },
    trafficDensity: { day: 0.25, night: 0.12 },
    boatTraffic: 0.25,
    pedestrianMix: {
      swamp_local: 52,
      fisher: 22,
      mechanic: 10,
      factory_worker: 6,
      beach_tourist: 4,
      dock_worker: 4,
      jogger: 2,
    },
    pedestrianDensity: { day: 0.2, night: 0.1 },
    controllingFaction: 'marsh_jackals',
    policePresence: { level: 'minimal', patrolChance: 0.015, responseSeconds: 40 },
    streetNames: [
      'Camino del Manglar',
      'Ruta del Caimán',
      'Camino Garza Azul',
      'Camino Lodo',
      'Camino Ciprés',
      'Camino Camaronero',
      'Camino Tablazón',
      'Camino Nutria',
      'Pista Vieja',
    ],
    landmarks: [
      { id: 'aerodromo_los_pantanos', name: 'Aeródromo Los Pantanos', kind: 'airstrip', footprint: 'huge', needs: ['secluded'], purchasable: true, blurb: 'A single cracked runway, a windsock and three hangars. Hangar 3 can be bought; the runway is the best drag strip in the game.' },
      { id: 'cypress_hollow', name: 'Cypress Hollow Trailer Park', kind: 'trailer_park', footprint: 'large', needs: ['secluded'], purchasable: true, blurb: 'Trailers under cypress trees, home turf of the Marsh Jackals. Lot 12 is the cheapest hideout in Marazul.' },
      { id: 'motel_garza_azul', name: 'Motel Garza Azul', kind: 'motel', footprint: 'medium', needs: ['on_avenue'], brand: 'motel_garza_azul', blurb: 'The Blue Heron Motel on the highway frontage: a neon heron, an ice machine and rooms rented by the hour of sleep.' },
      { id: 'pantano_gun_and_bait', name: 'Pantano Gun & Bait', kind: 'gun_shop', footprint: 'small', needs: [], brand: 'pantano_gun_and_bait', blurb: 'Live bait on the left, long guns on the right. The only shop that sells the heavy hardware.' },
      { id: 'petromar_cruce_norte', name: 'Petromar Cruce Norte', kind: 'fuel_station', footprint: 'medium', needs: ['on_avenue'], brand: 'petromar', blurb: 'Truck stop at the highway junction, the last fuel and quick repair before the swamp roads.' },
      { id: 'mudline_roadhouse', name: 'The Mudline Roadhouse', kind: 'bar_cantina', footprint: 'medium', needs: ['secluded'], brand: 'mudline_roadhouse', blurb: 'The Marsh Jackals\' clubhouse bar: a row of choppers outside, a jukebox inside and Big Clo at the end stool.' },
      { id: 'cobertizo_del_camaronero', name: 'Cobertizo del Camaronero', kind: 'warehouse', footprint: 'medium', needs: ['coastal', 'secluded'], blurb: 'The Shrimper\'s Shed: a tin boathouse on a mangrove channel where a boat can vanish from the sea side of a chase.' },
      { id: 'lodo_y_laca', name: 'Lodo y Laca', kind: 'paint_and_body_shop', footprint: 'medium', needs: [], brand: 'lodo_y_laca', blurb: 'Mud and Lacquer: a backwoods body shop that resprays anything and remembers nothing.' },
      { id: 'pantano_provisions', name: 'Pantano Provisions', kind: 'convenience_store', footprint: 'small', needs: [], brand: 'pantano_provisions', blurb: 'General store on stilts: bait, batteries, snacks, bug spray and unsolicited directions.' },
    ],
  },
});

/**
 * The order in which districts are listed in menus, the map legend and statistics.
 * @type {readonly string[]}
 */
export const CITY_DISTRICT_ORDER = freezeCatalog([
  'playa_dorada',
  'centro',
  'la_marisma',
  'puerto_tamarindo',
  'barrio_hierro',
  'las_lomas',
  'bahia_vista',
  'isla_coral',
  'los_pantanos',
]);

/**
 * The fixed vocabulary of landmark kinds. The city plan places lots by kind and the building
 * artists model one building (or site) per kind.
 * @type {readonly string[]}
 */
export const LANDMARK_KINDS = freezeCatalog([
  'police_station', 'hospital', 'fire_station', 'city_hall', 'courthouse', 'bank', 'casino_resort',
  'grand_hotel', 'motel', 'shopping_mall', 'nightclub', 'diner', 'bar_cantina', 'gun_shop',
  'clothing_store', 'convenience_store', 'fuel_station', 'car_dealership', 'paint_and_body_shop',
  'mod_garage', 'scrapyard', 'pier', 'marina', 'yacht_club', 'lighthouse', 'stadium', 'church',
  'market', 'plaza', 'park', 'bus_terminal', 'train_yard', 'container_terminal', 'shipyard',
  'airstrip', 'helipad', 'safehouse_apartment', 'beach_house', 'mansion', 'trailer_park',
  'warehouse', 'factory', 'radio_tower', 'lookout',
]);

/**
 * Footprint classes with the longest side of the lot, in metres.
 * @type {Readonly<Record<string, {maxSide: number|null, note: string}>>}
 */
export const LANDMARK_FOOTPRINTS = freezeCatalog({
  small: { maxSide: 20, note: 'A shopfront or a single small building.' },
  medium: { maxSide: 40, note: 'A building with forecourt or yard.' },
  large: { maxSide: 80, note: 'A block-sized building or compound.' },
  huge: { maxSide: null, note: 'Beyond 80 m: a site that shapes the plan around it.' },
});

/**
 * Placement wishes a landmark may carry. They are preferences, most important first: when a
 * district cannot satisfy one, the planner relaxes it rather than dropping the landmark.
 * @type {Readonly<Record<string, string>>}
 */
export const LANDMARK_NEEDS = freezeCatalog({
  coastal: 'On navigable water: the sea, the bay, the river or a wetland channel.',
  on_avenue: 'Fronting an avenue, the ocean boulevard or the highway frontage road.',
  on_corner: 'On a corner lot with two street frontages.',
  secluded: 'Away from avenues and crowds: a dead end, a hill road or the edge of the district.',
});

/**
 * Every landmark as a flat placement request for the city plan generator:
 * `{ id, name, district, kind, footprint, needs }`, in district order.
 * @type {readonly {id: string, name: string, district: string, kind: string, footprint: string, needs: readonly string[]}[]}
 */
export const CITY_LANDMARK_REQUESTS = freezeCatalog(
  CITY_DISTRICT_ORDER.flatMap((districtId) =>
    CITY_DISTRICTS[districtId].landmarks.map((landmark) => ({
      id: landmark.id,
      name: landmark.name,
      district: districtId,
      kind: landmark.kind,
      footprint: landmark.footprint,
      needs: landmark.needs,
    })),
  ),
);

/**
 * The named roads that tie the districts together: the highway, the bridges and the eight
 * avenues. `districts` lists what each one passes through or joins, in order.
 * @type {Readonly<Record<string, {id: string, name: string, class: 'highway'|'bridge'|'avenue', districts: string[], note: string}>>}
 */
export const CITY_THOROUGHFARES = freezeCatalog({
  autopista_del_golfo: { id: 'autopista_del_golfo', name: 'Autopista del Golfo', class: 'highway', districts: ['los_pantanos', 'barrio_hierro', 'centro', 'las_lomas'], note: 'The through highway along the northern edge, signed G-1.' },
  puente_rio_tamarindo: { id: 'puente_rio_tamarindo', name: 'Puente Río Tamarindo', class: 'bridge', districts: ['los_pantanos', 'barrio_hierro'], note: 'The highway bridge over the Rio Tamarindo.' },
  calzada_coral: { id: 'calzada_coral', name: 'Calzada Coral', class: 'bridge', districts: ['bahia_vista', 'isla_coral'], note: 'The 400 m causeway bridge to the island, with a guard booth at the island end.' },
  bulevar_dorado: { id: 'bulevar_dorado', name: 'Bulevar Dorado', class: 'avenue', districts: ['puerto_tamarindo', 'playa_dorada', 'bahia_vista'], note: 'The ocean-front boulevard with the palm median.' },
  avenida_de_los_fundadores: { id: 'avenida_de_los_fundadores', name: 'Avenida de los Fundadores', class: 'avenue', districts: ['playa_dorada', 'centro', 'las_lomas'], note: 'The north-south spine from the pier to the highway.' },
  gran_via_marazul: { id: 'gran_via_marazul', name: 'Gran Vía Marazul', class: 'avenue', districts: ['la_marisma', 'centro', 'bahia_vista'], note: 'The east-west spine through downtown.' },
  avenida_meridiano: { id: 'avenida_meridiano', name: 'Avenida Meridiano', class: 'avenue', districts: ['centro', 'las_lomas'], note: 'The banking avenue, one-way pairs through the tower blocks.' },
  avenida_tamarindo: { id: 'avenida_tamarindo', name: 'Avenida Tamarindo', class: 'avenue', districts: ['puerto_tamarindo', 'la_marisma', 'barrio_hierro'], note: 'The truck route along the river from the port gate to the rail yards.' },
  avenida_del_riel: { id: 'avenida_del_riel', name: 'Avenida del Riel', class: 'avenue', districts: ['barrio_hierro', 'centro'], note: 'The rail avenue, beside the tracks, to the highway ramps.' },
  camino_de_las_lomas: { id: 'camino_de_las_lomas', name: 'Camino de las Lomas', class: 'avenue', districts: ['centro', 'las_lomas', 'bahia_vista'], note: 'The hill road: wide at the bottom, switchbacks at the top.' },
  paseo_bahia: { id: 'paseo_bahia', name: 'Paseo Bahía', class: 'avenue', districts: ['playa_dorada', 'bahia_vista'], note: 'The bay-front avenue past the marina to the causeway.' },
});

/**
 * Place names for water and terrain, for the map and for dialogue.
 * @type {Readonly<Record<string, string>>}
 */
export const CITY_GEOGRAPHY_NAMES = freezeCatalog({
  city: 'Marazul',
  sea: 'Golfo de Marazul',
  river: 'Rio Tamarindo',
  estuary: 'Boca del Tamarindo',
  bay: 'Bahía Vista',
  island: 'Isla Coral',
  beach: 'Playa Dorada',
  hill: 'Loma Alta',
  wetland: 'Ciénaga de los Pantanos',
});

/**
 * Ordinary (non-landmark) building styles that districts weight in `buildingStyles`.
 * @type {Readonly<Record<string, {id: string, floors: [number, number], note: string}>>}
 */
export const BUILDING_STYLES = freezeCatalog({
  art_deco_hotel: { id: 'art_deco_hotel', floors: [4, 10], note: 'Pastel stucco, rounded corners, eyebrow ledges, porthole windows, a neon name on a fin.' },
  pastel_apartment_block: { id: 'pastel_apartment_block', floors: [3, 7], note: 'Balconied stucco apartments in sherbet colours with shops at street level.' },
  glass_tower: { id: 'glass_tower', floors: [18, 42], note: 'Curtain-wall office tower with a stone podium and a lit crown.' },
  office_midrise: { id: 'office_midrise', floors: [5, 14], note: 'Stone or concrete offices with regular windows and a ground-floor lobby.' },
  civic_neoclassical: { id: 'civic_neoclassical', floors: [2, 5], note: 'Columns, steps and a pediment: government, courts and old banks.' },
  colonial_shopfront: { id: 'colonial_shopfront', floors: [1, 3], note: 'Arcaded shop below, shuttered rooms above, painted in strong old-town colours.' },
  stucco_rowhouse: { id: 'stucco_rowhouse', floors: [1, 3], note: 'Narrow joined houses with iron balconies and tile eaves.' },
  tile_roof_courtyard_house: { id: 'tile_roof_courtyard_house', floors: [1, 2], note: 'A low house around a patio with a terracotta roof and a street wall.' },
  strip_mall: { id: 'strip_mall', floors: [1, 2], note: 'A row of shop units behind a strip of parking under one long sign band.' },
  roadside_box: { id: 'roadside_box', floors: [1, 1], note: 'A single commercial box with a pole sign: tyre shop, pawn shop, taquería.' },
  parking_structure: { id: 'parking_structure', floors: [3, 6], note: 'Open-deck concrete parking with ramps.' },
  warehouse_shed: { id: 'warehouse_shed', floors: [1, 2], note: 'Long steel shed with roller doors and a loading apron.' },
  container_stack: { id: 'container_stack', floors: [1, 5], note: 'Yard of stacked shipping containers in faded colours.' },
  factory_sawtooth: { id: 'factory_sawtooth', floors: [1, 3], note: 'Brick factory with a sawtooth roof, chimneys and pipe runs.' },
  corrugated_workshop: { id: 'corrugated_workshop', floors: [1, 2], note: 'Tin-walled workshop or garage with a hand-painted sign.' },
  modern_villa: { id: 'modern_villa', floors: [1, 3], note: 'White planes, glass walls, a flat roof and a pool behind a hedge.' },
  spanish_revival_villa: { id: 'spanish_revival_villa', floors: [1, 2], note: 'Cream stucco, arches, terracotta roof and a walled garden.' },
  resort_tower: { id: 'resort_tower', floors: [10, 24], note: 'White balconied resort tower stepping back from a pool deck.' },
  marina_condo: { id: 'marina_condo', floors: [4, 9], note: 'Waterfront condominiums with glass balconies and a dock walk.' },
  mansion_estate: { id: 'mansion_estate', floors: [2, 3], note: 'A gated mansion with wings, a forecourt fountain and a private dock.' },
  stilt_shack: { id: 'stilt_shack', floors: [1, 1], note: 'A timber house on stilts over wet ground, with a tin roof and a porch.' },
  trailer_home: { id: 'trailer_home', floors: [1, 1], note: 'A single-wide trailer with an awning, a satellite dish and a lawn chair.' },
});

/**
 * The clock and the weather. Sunrise, noon and sunset match the atmosphere module; weather ids
 * are the atmosphere module's own names.
 * @type {Readonly<{realSecondsPerGameMinute: number, gameDayRealSeconds: number, newGameClockHours: number, sunriseHours: number, solarNoonHours: number, sunsetHours: number, goldenHourHours: number, nightStartsHours: number, nightEndsHours: number, weather: Record<string, {id: string, weight: number, minHours: number, maxHours: number, gripMultiplier: number, pedestrianMultiplier: number, trafficMultiplier: number, next: string[]}>}>}
 */
export const CITY_CLOCK_AND_WEATHER = freezeCatalog({
  realSecondsPerGameMinute: 2,
  gameDayRealSeconds: 2880,
  newGameClockHours: 18.25,
  sunriseHours: 6.5,
  solarNoonHours: 13,
  sunsetHours: 19.5,
  goldenHourHours: 18.83,
  nightStartsHours: 20.5,
  nightEndsHours: 5.5,
  weather: {
    clear: { id: 'clear', weight: 46, minHours: 4, maxHours: 14, gripMultiplier: 1, pedestrianMultiplier: 1, trafficMultiplier: 1, next: ['hazy', 'overcast'] },
    hazy: { id: 'hazy', weight: 22, minHours: 3, maxHours: 8, gripMultiplier: 1, pedestrianMultiplier: 0.95, trafficMultiplier: 1, next: ['clear', 'overcast'] },
    overcast: { id: 'overcast', weight: 14, minHours: 2, maxHours: 6, gripMultiplier: 1, pedestrianMultiplier: 0.85, trafficMultiplier: 1, next: ['clear', 'hazy', 'rain'] },
    rain: { id: 'rain', weight: 12, minHours: 1, maxHours: 4, gripMultiplier: 0.82, pedestrianMultiplier: 0.45, trafficMultiplier: 0.9, next: ['overcast', 'storm', 'clear'] },
    storm: { id: 'storm', weight: 6, minHours: 1, maxHours: 2.5, gripMultiplier: 0.74, pedestrianMultiplier: 0.2, trafficMultiplier: 0.7, next: ['rain', 'overcast'] },
  },
});

/** Recursively freezes a plain data tree so that no system can mutate the shared catalog. */
function freezeCatalog(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) freezeCatalog(value[key]);
  }
  return value;
}
