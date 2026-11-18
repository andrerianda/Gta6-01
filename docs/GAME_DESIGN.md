# MARAZUL: game design

The game bible for engineers. The data lives in `game/src/catalog/*.js` (plain frozen ES modules,
no imports); this file explains how the pieces fit and where each number is. When the two
disagree, the catalog is right. Units everywhere: metres, seconds, kilograms, radians, whole
dollars, clock hours 0 to 24.

## Premise

Marazul is a sun-soaked Gulf-coast metropolis: pastel deco beach hotels, a glass downtown, an old
town, a container port, hillside villas, a marina and casino resort, an island of mansions, rail
yards and wetlands. Don Aurelio Santángel owns the casino and, quietly, the waterfront. He launders
gold through the port as glazed bathroom tiles (boat, cold store, rail yard, foundry, the casino's
golden pool) and writes every payoff in a blue ledger. **Sol Arrieta**, the customs inspector he
had fired for weighing the wrong container, and **Dez Tolliver**, the tow driver whose family
garage he is foreclosing on, find the same name on their paperwork and take the gold, the port,
the police captain and finally the ledger away from him. Tone: a sharp, sunlit crime drama with dry
humour; action-film violence, no gore, no slurs, nothing sexual.

Pillars: (1) a whole city on foot, by car, by boat; (2) heat you cause and can lose in five ways;
(3) two leads with different perks, switched by a phone call; (4) every system pays into money,
reputation and property; (5) golden hour as the signature look.

## Cast (`storyCharacters.js`)

| id | Name | Role | Found at |
|---|---|---|---|
| dez_tolliver | Dez | Playable lead: repo driver, wheelman (starting lead) | tolliver_tow |
| sol_arrieta | Sol | Playable lead: former customs inspector, planner | callejon_del_loro_9 |
| hattie_tolliver | Aunt Hattie | Mechanic, owner of Tolliver Tow | tolliver_tow |
| ximena_robles | La Notaria | Fixer, disbarred notary | ancla_torcida |
| jacinto_roldan | Chispa | Leader of Los Remaches, racing rival then ally | chatarreria_el_remache |
| ozzy_prieto | Ozzy | Charter skipper | marina_bahia_vista |
| clovis_arceneaux | Big Clo | President of the Marsh Jackals | mudline_roadhouse |
| amara_whitlock | Det. Whitlock | The honest detective | mpd_headquarters |
| pim_adeyemi | Pim | Phone-kiosk hacker | galerias_aurora |
| odette_baptiste | Odette | Casino floor manager, the inside woman | the_aurelia |
| nadia_finch | Nadia Finch | Radio host, La Voz del Golfo | antena_loma_alta |
| aurelio_santangel | Don Aurelio | Antagonist, chairman of the Aurelia Group | villa_santangel |
| etienne_lemaire | Lemaire | Head of casino security, commander of the Circle | the_aurelia |
| renata_olabarria | La Draga | Boss of La Corriente | astilleros_olabarria |
| emmett_strand | Capt. Strand | Corrupt Harbor Patrol captain | harbor_patrol_station |

Each entry has a modellable appearance (sex, age band, height, build, hex skin and hair, hair
style, facial hair, outfit pieces with hex colours from `CHARACTER_APPEARANCE_VOCABULARY`), voice
notes, perks for the leads and the mission that unlocks the phone contact. Lead switching: only at
zero stars and outside missions (`PLAYABLE_LEADS.switchRules`).

## Story (`storyMissions.js`)

Sixteen missions; each has ordered objectives (`kind`, HUD `text`, `params`), fail conditions, the
wanted level it provokes, reward, unlocks and intro/outro dialogue with speaker ids.

| # | id | Giver | Starts at | What the player does | Stars | Cash |
|---|---|---|---|---|---|---|
| 1 | m01_hook_and_chain | Hattie | tolliver_tow | Tow a Regente from the hotel, shake Circle minders | 0 | 800 |
| 2 | m02_twice_the_weight | Sol | frigorificos_golfo | Stealth, photograph the tiles, foot escape, getaway, respray | 1 | 1,500 |
| 3 | m03_stamped_and_sealed | La Notaria | ancla_torcida | Timed deliveries, a fist fight, a deadline at city hall | 0 | 2,500 |
| 4 | m04_sparks_fly | Chispa | chatarreria_el_remache | Street race, then lose two stars | 2 | 4,000 |
| 5 | m05_night_shift | Sol | patio_ferroviario | Night raid, steal the tile truck, deliver it undamaged | 3 | 7,500 |
| 6 | m06_charter_rates | Ozzy | marina_bahia_vista | Boat lesson, tail a smuggler's boat, photograph, escape by water | 2 | 9,000 |
| 7 | m07_two_beer_problem | Big Clo | mudline_roadhouse | Bar brawl, ride, defend the airstrip in waves, stop a van | 0 | 12,000 |
| 8 | m08_clean_hands | La Notaria | caja_coral_bahia | Tail by car and on foot, knock out the bagman, escape | 1 | 15,000 |
| 9 | m09_weigh_her_again | Whitlock | terminal_tamarindo | Collect logbooks, shootout in the stacks, boat chase | 3 | 22,000 |
| 10 | m10_dead_air | Nadia | antena_loma_alta | Defend the transmitter 240 s, downhill escort | 3 | 28,000 |
| 11 | m11_house_edge | Odette | the_aurelia | Casino stealth in formal dress, 90 s run, photograph the ledger | 3 | 40,000 |
| 12 | m12_past_due | Hattie | tolliver_tow | Timed dash, defend the garage, chase the collector | 2 | 50,000 |
| 13 | m13_no_further_questions | Whitlock | harbor_patrol_station | Quay shootout, police-boat chase, take Strand alive | 4 | 65,000 |
| 14 | m14_heavier_than_it_looks | Chispa | deposito_riel_norte | Assault the foundry, load crates, drive nine tonnes to the airstrip | 3 | 150,000 |
| 15 | m15_the_house_loses | Sol | marina_bahia_vista | Both leads: boat run, garden assault, Lemaire, convoy chase, lighthouse | 4 | 250,000 |
| 16 | m16_for_the_record | Whitlock | mpd_headquarters | Timed armoured drive through ambushes, defend the evidence dock | 0 | 100,000 |

Acts: one m01-05, two m06-11, three m12-15, epilogue m16 (`STORY_ACTS`). Shared rules
(`MISSION_RULES`): retry from the last objective checkpoint at no cost, wanted level cleared on a
pass, lead switching off during a mission, replay pays a quarter.

## Open-world systems

- **Wanted level** (`wantedLevels.js`, `crimeCatalog.js`): crimes add heat (30 crimes; some need a
  witness inside a seen or heard radius who takes 6 s to report, a guard 2 s, an officer none).
  Stars at 10, 30, 60, 100 and 150 heat. One star: officers arrest. Two: patrol cars, lethal force
  against an armed lead. Three: pursuit SUVs, roadblocks, helicopter. Four: tactical van, spike
  strips, marksman. Five: everything, bridge and causeway closed. Out of sight for 6 s starts the
  search phase (a circle round the last known position, vision cones on the minimap); staying
  unseen for the level's search time clears every star. Also: respray, change of clothes (minus two
  stars), a bribe by phone to La Notaria, lying low in a safehouse. Busted (one or two stars only):
  fine of 10 percent, ammunition lost, released at the district's station. Wasted: hospital bill
  of 8 percent, wake at the side's hospital.
- **Factions** (`gangsAndFactions.js`): police and their six unit types, fire and rescue, the
  Aurelia Circle (bahia_vista, isla_coral), La Corriente (puerto_tamarindo), Los Remaches
  (barrio_hierro), Marsh Jackals (los_pantanos), the Vecinos (la_marisma, neutral), Vigía Azul
  guards (las_lomas). Attitude per lead from -100 to 100, shifted by named missions; -40 or lower
  attacks on sight in turf, 40 or higher defends the lead.
- **Traffic and pedestrians** (`pedestrianArchetypes.js`, district mixes in `cityDistricts.js`):
  twenty archetypes with appearance ranges, activities, a reaction table per stimulus (gunfire,
  aimed at, bumped, near miss, own vehicle stolen, fight, explosion, body seen) and voice lines.
- **Weapons and combat** (`weaponCatalog.js`): twelve weapons on an eight-slot wheel (hold Tab);
  `COMBAT_RULES` holds health, armour, aim assist, vehicle fire and explosion numbers.
- **Economy** (`shopsAndProperties.js`): 33 shops (guns, clothes, paint and body, tuning, car and
  boat dealers, food for health, fuel with quick repair), 13 outfits, vehicle upgrades in tiers,
  16 properties from a free loft to Casa Caracola at 1.8 million, with daily income collected at
  the property.
- **Side activities** (`sideActivities.js`): repo orders, taxi fares, courier rounds, the Línea 12
  bus, paramedic runs, vigilante calls, street races (6), time trials (6), boat races (4), airstrip
  drags, the export list, turf rampages (8), stunt jumps (15), golden tiles (60). Each has start
  rules, parameters, a reward formula and bronze, silver and gold medals.
- **Progression** (`progressionRanks.js`): eleven ranks from Nobody to Marazul Is Yours; the story
  alone reaches rank 7. Ranks gate weapons, health, armour and perks. Tracked statistics,
  completion weights, save rules and the fun toggles opened by the epilogue are there too.
- **Phone**: contacts (unlocked by missions), messages, map, jobs list (`SIDE_ACTIVITY_ORDER`),
  camera for `photograph` objectives, bribe and backup calls.
- **Radio** (`radioStations.js`): Muelle 88 (sunshine pop), La Voz del Golfo (talk and jazz, news
  reports of the player's crimes after m10), Brisa Dorada (lounge), Onda Neón (electronic), Hierro
  Rock (rock), La Tumbadora (salsa); tempo, scale and step patterns for the synthesiser, hosts and
  subtitle lines.
- **Clock and weather** (`CITY_CLOCK_AND_WEATHER`): one game minute is two real seconds; sunrise
  06:30, sunset 19:30, golden hour 18:50; clear, hazy, overcast, rain, storm with grip and crowd
  multipliers.
- **Controls** (`playerControls.js`): keyboard and mouse by action id and context, with menu
  labels and prompt key caps.
- **HUD**: minimap with search circle and cones; wanted stars (blink while searching); health and
  armour; cash; weapon and ammunition; vehicle name on entry, speed in km/h; mission objective
  line and timer; subtitles in the speaker's `subtitleColor`; crime flash (`CRIME_REPORTING`);
  radio station name on change; district name on entry; rank-up banner.

## Districts (`cityDistricts.js`)

| id | Feel | Run by | Landmarks to know |
|---|---|---|---|
| playa_dorada | Beach strip, deco hotels, neon | police | muelle_dorado, hotel_cielo_rosa, club_salitre, dos_soles_diner |
| centro | Glass downtown, civic core | police (heavy) | mpd_headquarters, banco_meridiano_tower, tribunal_del_golfo, galerias_aurora |
| la_marisma | Old town, courtyards, market | vecinos_marisma | ancla_torcida, mercado_marisma, callejon_del_loro_9, salon_guaracha |
| puerto_tamarindo | Container port and shipyard | la_corriente | terminal_tamarindo, astilleros_olabarria, frigorificos_golfo, dock_12_warehouse |
| barrio_hierro | Industry and rail yards | los_remaches | tolliver_tow, chatarreria_el_remache, fundicion_hierro_viejo, estadio_la_fragua |
| las_lomas | Hills and villas | vigia_azul_security | mirador_del_halcon, antena_loma_alta, villa_buenaventura, lomas_prestige_motors |
| bahia_vista | Marina and casino resort | aurelia_circle | the_aurelia, marina_bahia_vista, lux_marea, caja_coral_bahia |
| isla_coral | Island of mansions by a causeway | aurelia_circle | villa_santangel, casa_caracola, faro_del_coral, helipuerto_isla_coral |
| los_pantanos | Wetlands and an airstrip | marsh_jackals | aerodromo_los_pantanos, mudline_roadhouse, cypress_hollow, pantano_gun_and_bait |

Each district carries a tagline, description, mood, facade and neon palettes, weighted building
styles, traffic and pedestrian mixes with day and night density, police presence, eight to twelve
street names, and six to ten landmarks (`id`, `name`, `kind`, `footprint`, `needs`, optional
`brand` and `purchasable`). `CITY_LANDMARK_REQUESTS` is the flat list the city plan places.

## Data: the catalog modules

Every module starts with its main export, is keyed by snake_case ids equal to each entry's `id`,
and is deeply frozen. `tools/tests/catalog/*.test.mjs` checks every cross-reference below.

| Module | Main export | Other exports | Borrows ids from |
|---|---|---|---|
| cityDistricts.js | CITY_DISTRICTS | CITY_DISTRICT_ORDER, CITY_LANDMARK_REQUESTS, LANDMARK_KINDS, LANDMARK_FOOTPRINTS, LANDMARK_NEEDS, BUILDING_STYLES, CITY_THOROUGHFARES, CITY_GEOGRAPHY_NAMES, CITY_CLOCK_AND_WEATHER | vehicles, pedestrians, factions, brands |
| vehicleCatalog.js | VEHICLE_CATALOG | VEHICLE_CLASSES, VEHICLE_FLAGS, VEHICLE_ENGINE_SOUNDS, VEHICLE_SPAWN_RARITY_WEIGHTS | districts, stations, brands |
| storyCharacters.js | STORY_CHARACTERS | STORY_CHARACTER_ORDER, PLAYABLE_LEADS, CHARACTER_APPEARANCE_VOCABULARY | districts, landmarks, factions, missions |
| pedestrianArchetypes.js | PEDESTRIAN_ARCHETYPES | PEDESTRIAN_ACTIVITIES, PEDESTRIAN_REACTIONS, PEDESTRIAN_STIMULI, TRAFFIC_DRIVER_ARCHETYPES | appearance vocabulary |
| gangsAndFactions.js | GANGS_AND_FACTIONS | FACTION_ORDER, POLICE_UNITS, FACTION_MEMBERS, FACTION_ATTITUDE_RULES | districts, landmarks, vehicles, weapons, characters, missions |
| storyMissions.js | STORY_MISSIONS | STORY_MISSION_ORDER, STORY_ACTS, MISSION_OBJECTIVE_KINDS, MISSION_RULES | all of the above, shops, properties, outfits, activities |
| wantedLevels.js | WANTED_LEVELS (array by stars) | WANTED_RULES, BUSTED_RULES, WASTED_RULES | police units, landmarks, crime categories |
| crimeCatalog.js | CRIME_CATALOG | CRIME_CATEGORIES, CRIME_REPORTING | none |
| weaponCatalog.js | WEAPON_CATALOG | WEAPON_ORDER, WEAPON_WHEEL_SLOTS, COMBAT_RULES | crimes, missions, ranks |
| sideActivities.js | SIDE_ACTIVITIES | SIDE_ACTIVITY_ORDER, SIDE_ACTIVITY_RULES | landmarks, vehicles, factions, weapons, missions |
| shopsAndProperties.js | SHOPS_AND_SERVICES | SHOP_KINDS, PROPERTIES_FOR_SALE, PROPERTY_RULES, OUTFIT_CATALOG, VEHICLE_UPGRADES, FOOD_AND_DRINK, PHONE_SERVICES | landmarks, weapons, vehicles, missions, vocabulary |
| radioStations.js | RADIO_STATIONS | RADIO_DIAL_ORDER, RADIO_SCALES, RADIO_RULES | brands, characters, missions |
| brandsAndSignage.js | BRANDS_AND_SIGNAGE | BRAND_KINDS, SIGN_STYLES, BILLBOARD_RULES | districts |
| playerControls.js | PLAYER_CONTROLS | CONTROL_CONTEXTS, WEAPON_SLOT_KEYS, MOUSE_AND_CAMERA_SETTINGS | none |
| progressionRanks.js | PROGRESSION_RANKS (array by rank) | REPUTATION_SOURCES, TRACKED_STATISTICS, COMPLETION_WEIGHTS, FUN_TOGGLES, SAVE_RULES | weapons |

The field-by-field meaning of each entry is in the header comment and the JSDoc of its module.
