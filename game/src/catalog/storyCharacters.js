// The cast of MARAZUL: the two playable leads and the thirteen people around them, with a
// concrete appearance spec the character artist models from, how each one talks, where they are
// found and what they are to the story. The appearance vocabulary below (hair styles, outfit
// pieces, skin and hair palettes) is the fixed list that this file, pedestrianArchetypes.js and
// the uniforms in gangsAndFactions.js all draw from. Plain frozen data, no imports.
//
// Units: height in metres. Colours are sRGB hex. District and landmark ids come from
// cityDistricts.js, faction ids from gangsAndFactions.js, mission ids from storyMissions.js.

/**
 * @typedef {Object} OutfitPiece
 * @property {string} piece An id from the matching list in CHARACTER_APPEARANCE_VOCABULARY.
 * @property {string} color Main colour of the piece.
 * @property {string} [secondaryColor] Colour of the layer under an open or sleeveless top (the
 *   tee under an open shirt, bomber, blazer, jacket or vest), or of a trim.
 */

/**
 * @typedef {Object} CharacterAppearance
 * @property {'female'|'male'} sex
 * @property {'young_adult'|'adult'|'middle_aged'|'senior'} ageBand
 * @property {number} height Metres, standing, without shoes or hat.
 * @property {'slim'|'average'|'athletic'|'heavy'} build
 * @property {string} skinTone Hex; one of the vocabulary's skinTones.
 * @property {string} hairStyle One of the vocabulary's hairStyles.
 * @property {string} hairColor Hex (also the colour of facial hair).
 * @property {string} facialHair One of the vocabulary's facialHair.
 * @property {{top: OutfitPiece, bottom: OutfitPiece, shoes: OutfitPiece, accessories: OutfitPiece[]}} outfit
 */

/**
 * @typedef {Object} StoryCharacter
 * @property {string} id
 * @property {string} name The name shown in subtitles and on the phone.
 * @property {string} fullName
 * @property {string|null} alias Street name or title, if any.
 * @property {number} age
 * @property {'lead'|'ally'|'contact'|'rival'|'antagonist'|'law'} roleKind
 * @property {string} role What they do in the story, in a phrase.
 * @property {string} bio One or two lines.
 * @property {string|null} faction Faction id, or null for the unaffiliated.
 * @property {boolean} playable
 * @property {{id: string, name: string, effect: string}[]} [perks] Passive perks of a playable lead.
 * @property {CharacterAppearance} appearance
 * @property {{pitch: 'low'|'mid'|'high', pace: 'slow'|'measured'|'quick', notes: string, sayings: string[]}} voice
 * @property {string} subtitleColor Colour of the speaker name in subtitles.
 * @property {string} homeDistrict
 * @property {string} foundAt Landmark id where they wait between missions.
 * @property {{number: string, unlockedBy: string|null}|null} phone Phone contact; unlockedBy is
 *   the mission that adds it (null: from the start); null phone: never a contact.
 */

/**
 * The cast, keyed by character id.
 * @type {Readonly<Record<string, StoryCharacter>>}
 */
export const STORY_CHARACTERS = freezeCatalog({
  sol_arrieta: {
    id: 'sol_arrieta',
    name: 'Sol',
    fullName: 'Marisol Arrieta',
    alias: 'Sol',
    age: 31,
    roleKind: 'lead',
    role: 'Playable lead: former customs inspector, the planner',
    bio: 'Nine years an inspector at Puerto Tamarindo until she flagged a container of bathroom tiles that weighed twice what tiles weigh. A week later she had been fired for bribes she never took. She knows every form, seal and blind spot in the port.',
    faction: null,
    playable: true,
    perks: [
      { id: 'paperwork', name: 'Paperwork', effect: 'Bail, hospital bills, resprays and La Notaria\'s fees cost 25 percent less while Sol is the active lead.' },
      { id: 'inspectors_eye', name: 'Inspector\'s Eye', effect: 'Golden tiles and contraband pickups within 60 m show on the minimap, and guards take 25 percent longer to notice her in stealth zones.' },
      { id: 'steady_hands', name: 'Steady Hands', effect: 'Handgun spread and recoil are reduced by 25 percent.' },
    ],
    appearance: {
      sex: 'female',
      ageBand: 'adult',
      height: 1.68,
      build: 'athletic',
      skinTone: '#C68B63',
      hairStyle: 'ponytail',
      hairColor: '#2E2019',
      facialHair: 'none',
      outfit: {
        top: { piece: 'open_shirt_over_tee', color: '#E07A5F', secondaryColor: '#F2EDE4' },
        bottom: { piece: 'jeans', color: '#2F4A6B' },
        shoes: { piece: 'sneakers', color: '#EDEAE2' },
        accessories: [
          { piece: 'watch', color: '#B8BCC2' },
          { piece: 'sunglasses', color: '#1E1E20' },
          { piece: 'holster', color: '#5A3A26' },
        ],
      },
    },
    voice: {
      pitch: 'mid',
      pace: 'measured',
      notes: 'Precise and dry, a clerk\'s habit of numbering her points. Never raises her voice; lowers it when angry. Slips into Spanish for endearments and insults.',
      sayings: ['For the record.', 'That is not what the manifest says.', 'Sign here. Metaphorically.'],
    },
    subtitleColor: '#E07A5F',
    homeDistrict: 'la_marisma',
    foundAt: 'callejon_del_loro_9',
    phone: { number: '555-0101', unlockedBy: null },
  },

  dez_tolliver: {
    id: 'dez_tolliver',
    name: 'Dez',
    fullName: 'Desmond Tolliver',
    alias: 'Dez',
    age: 28,
    roleKind: 'lead',
    role: 'Playable lead: repo driver and former street racer, the wheelman',
    bio: 'Drives the tow rig for his aunt\'s garage in Barrio Hierro and used to win races he was not supposed to enter. The bank sold the garage\'s loan to a company with no address, and the payments doubled. He can start anything with wheels and most things without.',
    faction: null,
    playable: true,
    perks: [
      { id: 'wrench', name: 'Wrench', effect: 'Vehicles Dez drives take 25 percent less collision damage, and quick repairs at Tolliver Tow are free.' },
      { id: 'hot_hands', name: 'Hot Hands', effect: 'Dez starts a locked parked car in 1.5 seconds instead of 4, and its alarm does not sound.' },
      { id: 'tow_arm', name: 'Tow Arm', effect: 'Fists and melee weapons do 30 percent more damage.' },
    ],
    appearance: {
      sex: 'male',
      ageBand: 'young_adult',
      height: 1.86,
      build: 'athletic',
      skinTone: '#6B4129',
      hairStyle: 'afro_short',
      hairColor: '#16120F',
      facialHair: 'short_beard',
      outfit: {
        top: { piece: 'bomber', color: '#BC9235', secondaryColor: '#2B2B2E' },   // deep mustard nylon (was a flat #E0A526)
        bottom: { piece: 'cargo', color: '#3A3D40' },
        shoes: { piece: 'boots', color: '#4A3424' },
        accessories: [
          { piece: 'cap', color: '#2B2B2E' },
          { piece: 'chain', color: '#C9A24A' },
        ],
      },
    },
    voice: {
      pitch: 'low',
      pace: 'quick',
      notes: 'Warm, fast and teasing; talks to cars as if they can hear him. Goes quiet and exact when driving hard. Calls everyone older than him by a title.',
      sayings: ['Easy, girl, easy.', 'I can fix that. I did not say cheap.', 'Buckle up, Inspector.'],
    },
    subtitleColor: '#E0A526',
    homeDistrict: 'barrio_hierro',
    foundAt: 'tolliver_tow',
    phone: { number: '555-0102', unlockedBy: null },
  },

  hattie_tolliver: {
    id: 'hattie_tolliver',
    name: 'Aunt Hattie',
    fullName: 'Harriet Tolliver',
    alias: 'Aunt Hattie',
    age: 58,
    roleKind: 'ally',
    role: 'Mechanic and owner of Tolliver Tow & Recovery; gives the first job',
    bio: 'Has run the corner garage since her brother died and has never once been wrong about an engine. Raised Dez among the lifts. Believes in paying debts, including the ones owed to her.',
    faction: null,
    playable: false,
    appearance: {
      sex: 'female',
      ageBand: 'middle_aged',
      height: 1.63,
      build: 'heavy',
      skinTone: '#6B4129',
      hairStyle: 'bun',
      hairColor: '#8F8E8B',
      facialHair: 'none',
      outfit: {
        top: { piece: 'button_shirt', color: '#3F5F7F' },
        bottom: { piece: 'cargo', color: '#3F5F7F' },
        shoes: { piece: 'boots', color: '#2E2A27' },
        accessories: [
          { piece: 'bandana', color: '#C8372D' },
          { piece: 'gloves', color: '#8A6A45' },
        ],
      },
    },
    voice: {
      pitch: 'low',
      pace: 'slow',
      notes: 'Unhurried Gulf drawl, every sentence a verdict. Affection arrives disguised as criticism. Hums when she is worried.',
      sayings: ['Mm-hm.', 'That is not a noise, that is a confession.', 'You break it, you bring it home.'],
    },
    subtitleColor: '#6FA3CF',
    homeDistrict: 'barrio_hierro',
    foundAt: 'tolliver_tow',
    phone: { number: '555-0110', unlockedBy: 'm01_hook_and_chain' },
  },

  ximena_robles: {
    id: 'ximena_robles',
    name: 'La Notaria',
    fullName: 'Ximena Robles',
    alias: 'La Notaria',
    age: 52,
    roleKind: 'contact',
    role: 'Fixer: a disbarred notary who brokers jobs, papers and favours',
    bio: 'Lost her licence for notarising a deed to the municipal fountain. Kept the stamps. Works from the back booth of El Ancla Torcida, where half of La Marisma brings its problems and the other half brings the first half\'s secrets.',
    faction: 'vecinos_marisma',
    playable: false,
    appearance: {
      sex: 'female',
      ageBand: 'middle_aged',
      height: 1.6,
      build: 'slim',
      skinTone: '#D9A982',
      hairStyle: 'bob',
      hairColor: '#16120F',
      facialHair: 'none',
      outfit: {
        top: { piece: 'blazer', color: '#7A1F3D', secondaryColor: '#F2EDE4' },
        bottom: { piece: 'skirt', color: '#2A2A2E' },
        shoes: { piece: 'heels', color: '#7A1F3D' },
        accessories: [
          { piece: 'glasses', color: '#C9A24A' },
          { piece: 'earrings', color: '#C9A24A' },
          { piece: 'watch', color: '#C9A24A' },
        ],
      },
    },
    voice: {
      pitch: 'mid',
      pace: 'measured',
      notes: 'Courtroom formal, velvet over a paper cut. Speaks of crimes as clerical matters and never uses a contraction. Punctuates with the thump of a rubber stamp.',
      sayings: ['Let the record show.', 'A small clerical correction.', 'I charge by the signature.'],
    },
    subtitleColor: '#C75B7A',
    homeDistrict: 'la_marisma',
    foundAt: 'ancla_torcida',
    phone: { number: '555-0123', unlockedBy: 'm03_stamped_and_sealed' },
  },

  aurelio_santangel: {
    id: 'aurelio_santangel',
    name: 'Don Aurelio',
    fullName: 'Aurelio Santángel',
    alias: 'Don Aurelio',
    age: 64,
    roleKind: 'antagonist',
    role: 'Chairman of the Aurelia Group; owns the casino and, quietly, the waterfront',
    bio: 'Arrived with one suitcase and now has his name on a tower. Launders gold through the port as glazed tiles and keeps every payoff in a blue ledger written by hand, because he trusts paper more than people. Gracious until the instant he is not.',
    faction: 'aurelia_circle',
    playable: false,
    appearance: {
      sex: 'male',
      ageBand: 'senior',
      height: 1.78,
      build: 'heavy',
      skinTone: '#D9A982',
      hairStyle: 'slick_back',
      hairColor: '#D8D5CE',
      facialHair: 'moustache',
      outfit: {
        top: { piece: 'suit_jacket', color: '#F1E9D8', secondaryColor: '#E58E7A' },
        bottom: { piece: 'suit_trousers', color: '#F1E9D8' },
        shoes: { piece: 'loafers', color: '#8A5A3A' },
        accessories: [
          { piece: 'watch', color: '#C9A24A' },
          { piece: 'sunglasses', color: '#6B4E2A' },
        ],
      },
    },
    voice: {
      pitch: 'low',
      pace: 'slow',
      notes: 'A host\'s warmth, grandfatherly and unhurried, with old-fashioned courtesy. Threats come as hospitality: an offer of a drink, a compliment on your family.',
      sayings: ['Please, sit. You are my guest.', 'Marazul is a house, and a house has an owner.', 'I never gamble. I own the table.'],
    },
    subtitleColor: '#E8C46A',
    homeDistrict: 'isla_coral',
    foundAt: 'villa_santangel',
    phone: null,
  },

  etienne_lemaire: {
    id: 'etienne_lemaire',
    name: 'Lemaire',
    fullName: 'Étienne Lemaire',
    alias: null,
    age: 47,
    roleKind: 'antagonist',
    role: 'Head of security at The Aurelia and commander of the Aurelia Circle',
    bio: 'A former soldier of somebody else\'s army who runs Santángel\'s security like a small tidy war. Collects the envelopes, delivers the warnings and has never been late for either.',
    faction: 'aurelia_circle',
    playable: false,
    appearance: {
      sex: 'male',
      ageBand: 'middle_aged',
      height: 1.88,
      build: 'athletic',
      skinTone: '#E8C3A4',
      hairStyle: 'buzz',
      hairColor: '#A98455',
      facialHair: 'none',
      outfit: {
        top: { piece: 'blazer', color: '#EFE6D2', secondaryColor: '#1C1C1F' },
        bottom: { piece: 'suit_trousers', color: '#1C1C1F' },
        shoes: { piece: 'loafers', color: '#1C1C1F' },
        accessories: [
          { piece: 'holster', color: '#1C1C1F' },
          { piece: 'gloves', color: '#1C1C1F' },
          { piece: 'watch', color: '#B8BCC2' },
        ],
      },
    },
    voice: {
      pitch: 'low',
      pace: 'measured',
      notes: 'Clipped, accented and exact; gives the time to the minute and distances in metres. No jokes, which the leads find very funny.',
      sayings: ['You are four minutes late.', 'This is not personal. It is scheduled.', 'Monsieur Santángel sends his regards.'],
    },
    subtitleColor: '#D8CFB8',
    homeDistrict: 'bahia_vista',
    foundAt: 'the_aurelia',
    phone: null,
  },

  renata_olabarria: {
    id: 'renata_olabarria',
    name: 'La Draga',
    fullName: 'Renata Olabarría',
    alias: 'La Draga',
    age: 49,
    roleKind: 'antagonist',
    role: 'Boss of La Corriente; owner of the Olabarría shipyard',
    bio: 'Third generation of boat builders and first generation of smugglers. Named after a dredger because she moves anything off the bottom for a price. Her crews run the port scales, the night boats and the people who used to ask questions.',
    faction: 'la_corriente',
    playable: false,
    appearance: {
      sex: 'female',
      ageBand: 'middle_aged',
      height: 1.72,
      build: 'athletic',
      skinTone: '#B07A52',
      hairStyle: 'short_crop',
      hairColor: '#8F8E8B',
      facialHair: 'none',
      outfit: {
        top: { piece: 'vest', color: '#1E3557', secondaryColor: '#1F9AA0' },
        bottom: { piece: 'cargo', color: '#3B3F45' },
        shoes: { piece: 'boots', color: '#3A2A1E' },
        accessories: [
          { piece: 'chain', color: '#B8BCC2' },
          { piece: 'gloves', color: '#C98A3A' },
          { piece: 'holster', color: '#3A2A1E' },
        ],
      },
    },
    voice: {
      pitch: 'low',
      pace: 'slow',
      notes: 'Gravel and salt, the patience of someone who works with tides. Talks about people in tonnage. Laughs once per conversation, never at a joke.',
      sayings: ['Everything floats or sinks. Choose.', 'The tide does not negotiate.', 'Weigh her again.'],
    },
    subtitleColor: '#3FB6BC',
    homeDistrict: 'puerto_tamarindo',
    foundAt: 'astilleros_olabarria',
    phone: null,
  },

  jacinto_roldan: {
    id: 'jacinto_roldan',
    name: 'Chispa',
    fullName: 'Jacinto Roldán',
    alias: 'Chispa',
    age: 26,
    roleKind: 'rival',
    role: 'Leader of Los Remaches; Dez\'s old racing rival, later an uneasy ally',
    bio: 'Runs the scrapyard crew that strips cars in Barrio Hierro and the street races that start at its gate. Lost to Dez once, three years ago, and mentions it daily. All spark, short fuse, long memory.',
    faction: 'los_remaches',
    playable: false,
    appearance: {
      sex: 'male',
      ageBand: 'young_adult',
      height: 1.74,
      build: 'slim',
      skinTone: '#C68B63',
      hairStyle: 'short_crop',
      hairColor: '#D9631E',
      facialHair: 'goatee',
      outfit: {
        top: { piece: 'leather_jacket', color: '#1E1E21', secondaryColor: '#E2772B' },
        bottom: { piece: 'jeans', color: '#2A2D33' },
        shoes: { piece: 'sneakers', color: '#E2772B' },
        accessories: [
          { piece: 'bandana', color: '#E2772B' },
          { piece: 'chain', color: '#B8BCC2' },
          { piece: 'earrings', color: '#B8BCC2' },
        ],
      },
    },
    voice: {
      pitch: 'high',
      pace: 'quick',
      notes: 'Rapid, boastful and musical, sentences that start as threats and end as jokes. Refers to himself in the third person when winning.',
      sayings: ['Chispa never loses. Chispa reschedules.', 'Pink slips, hermano.', 'You hear that? That is the sound of second place.'],
    },
    subtitleColor: '#F08A3C',
    homeDistrict: 'barrio_hierro',
    foundAt: 'chatarreria_el_remache',
    phone: { number: '555-0134', unlockedBy: 'm04_sparks_fly' },
  },

  clovis_arceneaux: {
    id: 'clovis_arceneaux',
    name: 'Big Clo',
    fullName: 'Clovis Arceneaux',
    alias: 'Big Clo',
    age: 55,
    roleKind: 'contact',
    role: 'President of the Marsh Jackals; holds the lease on the airstrip',
    bio: 'Shrimper, mechanic, pilot and president of the motorcycle club that runs Los Pantanos. Flies cash out for the Circle because the Circle holds his lease, and resents every kilometre of it.',
    faction: 'marsh_jackals',
    playable: false,
    appearance: {
      sex: 'male',
      ageBand: 'middle_aged',
      height: 1.93,
      build: 'heavy',
      skinTone: '#E8C3A4',
      hairStyle: 'bald',
      hairColor: '#8F8E8B',
      facialHair: 'full_beard',
      outfit: {
        top: { piece: 'vest', color: '#2A2623', secondaryColor: '#5A6B3A' },
        bottom: { piece: 'jeans', color: '#34404F' },
        shoes: { piece: 'boots', color: '#2A2018' },
        accessories: [
          { piece: 'bandana', color: '#D9C24A' },
          { piece: 'sunglasses', color: '#1A1A1C' },
          { piece: 'chain', color: '#8F8E8B' },
        ],
      },
    },
    voice: {
      pitch: 'low',
      pace: 'slow',
      notes: 'A soft bayou rumble, courteous and immovable. Weather, bait and engine metaphors. Says "cher" to friends and nothing at all to enemies.',
      sayings: ['Swamp keeps what it takes, cher.', 'That is a two-beer problem.', 'I do not fly angry and I do not fly cheap.'],
    },
    subtitleColor: '#C9B84A',
    homeDistrict: 'los_pantanos',
    foundAt: 'mudline_roadhouse',
    phone: { number: '555-0147', unlockedBy: 'm07_two_beer_problem' },
  },

  amara_whitlock: {
    id: 'amara_whitlock',
    name: 'Det. Whitlock',
    fullName: 'Amara Whitlock',
    alias: null,
    age: 41,
    roleKind: 'law',
    role: 'Major Crimes detective: the one honest file in the cabinet',
    bio: 'Has been building a case against the Aurelia Group for six years and watching it disappear from evidence rooms. Suspects the leads of everything, correctly, and has decided they are the second-worst problem in Marazul.',
    faction: 'marazul_police',
    playable: false,
    appearance: {
      sex: 'female',
      ageBand: 'adult',
      height: 1.75,
      build: 'slim',
      skinTone: '#8D5A3B',
      hairStyle: 'braids',
      hairColor: '#16120F',
      facialHair: 'none',
      outfit: {
        top: { piece: 'blazer', color: '#3C5A73', secondaryColor: '#EDEAE2' },
        bottom: { piece: 'suit_trousers', color: '#2E3238' },
        shoes: { piece: 'boots', color: '#2A2220' },
        accessories: [
          { piece: 'badge', color: '#C9A24A' },
          { piece: 'holster', color: '#3A2A1E' },
          { piece: 'watch', color: '#2B2B2E' },
        ],
      },
    },
    voice: {
      pitch: 'mid',
      pace: 'measured',
      notes: 'Tired, level and funny without smiling. Asks questions she knows the answers to. Coffee is a recurring topic.',
      sayings: ['I am not arresting you today.', 'Hypothetically.', 'Walk me through the part where that was legal.'],
    },
    subtitleColor: '#7FA6C4',
    homeDistrict: 'centro',
    foundAt: 'mpd_headquarters',
    phone: { number: '555-0158', unlockedBy: 'm08_clean_hands' },
  },

  emmett_strand: {
    id: 'emmett_strand',
    name: 'Capt. Strand',
    fullName: 'Emmett Strand',
    alias: null,
    age: 53,
    roleKind: 'antagonist',
    role: 'Captain of the Harbor Patrol, on Santángel\'s payroll',
    bio: 'Commands the police boats and the port precinct, and owns a villa in Las Lomas on a public salary. Sees nothing at the docks, professionally. Fond of press conferences.',
    faction: 'marazul_police',
    playable: false,
    appearance: {
      sex: 'male',
      ageBand: 'middle_aged',
      height: 1.81,
      build: 'heavy',
      skinTone: '#E8C3A4',
      hairStyle: 'side_part',
      hairColor: '#4F3524',
      facialHair: 'moustache',
      outfit: {
        top: { piece: 'police_shirt', color: '#F2F0E8' },
        bottom: { piece: 'suit_trousers', color: '#1F2D3F' },
        shoes: { piece: 'boots', color: '#1A1A1C' },
        accessories: [
          { piece: 'badge', color: '#C9A24A' },
          { piece: 'tie', color: '#1F2D3F' },
          { piece: 'holster', color: '#1A1A1C' },
          { piece: 'watch', color: '#C9A24A' },
        ],
      },
    },
    voice: {
      pitch: 'mid',
      pace: 'measured',
      notes: 'Smooth press-conference baritone, every answer a statement. Says "my harbor". Blusters when cornered.',
      sayings: ['Nothing moves in my harbor without my say.', 'No further questions.', 'That is a matter for the department.'],
    },
    subtitleColor: '#9CC3D9',
    homeDistrict: 'las_lomas',
    foundAt: 'harbor_patrol_station',
    phone: null,
  },

  nadia_finch: {
    id: 'nadia_finch',
    name: 'Nadia Finch',
    fullName: 'Nadia Finch',
    alias: null,
    age: 38,
    roleKind: 'contact',
    role: 'Late-night radio host on La Voz del Golfo; puts the story on the air',
    bio: 'Hosts the call-in show the whole city pretends not to listen to. Was a newspaper reporter until the Aurelia Group bought the newspaper. Collects recordings, grudges and anonymous callers.',
    faction: null,
    playable: false,
    appearance: {
      sex: 'female',
      ageBand: 'adult',
      height: 1.66,
      build: 'average',
      skinTone: '#F3D9C6',
      hairStyle: 'long_wavy',
      hairColor: '#7C3A22',
      facialHair: 'none',
      outfit: {
        top: { piece: 'leather_jacket', color: '#6B2430', secondaryColor: '#1E1E21' },
        bottom: { piece: 'jeans', color: '#1E2430' },
        shoes: { piece: 'heels', color: '#1E1E21' },
        accessories: [
          { piece: 'glasses', color: '#1E1E21' },
          { piece: 'earrings', color: '#B8BCC2' },
        ],
      },
    },
    voice: {
      pitch: 'low',
      pace: 'measured',
      notes: 'A smoky microphone voice that lingers on consonants. Always sounds on air: pauses for effect, signs off her own sentences.',
      sayings: ['You are on the air, caller.', 'Allegedly, Marazul. Allegedly.', 'Stay up. Stay curious.'],
    },
    subtitleColor: '#D06A7C',
    homeDistrict: 'centro',
    foundAt: 'antena_loma_alta',
    phone: { number: '555-0166', unlockedBy: 'm10_dead_air' },
  },

  ozzy_prieto: {
    id: 'ozzy_prieto',
    name: 'Ozzy',
    fullName: 'Osvaldo Prieto',
    alias: 'Ozzy',
    age: 61,
    roleKind: 'contact',
    role: 'Charter skipper at the marina; teaches the sea and lends the boat',
    bio: 'Forty years on the Gulf, some of them legal. Runs Prieto Charters from a shack on the marina fuel dock and knows every channel, sandbar and patrol schedule between the estuary and the island.',
    faction: null,
    playable: false,
    appearance: {
      sex: 'male',
      ageBand: 'senior',
      height: 1.7,
      build: 'slim',
      skinTone: '#B07A52',
      hairStyle: 'ponytail',
      hairColor: '#D8D5CE',
      facialHair: 'stubble',
      outfit: {
        top: { piece: 'open_shirt_over_tee', color: '#3FA7A3', secondaryColor: '#EDEAE2' },
        bottom: { piece: 'shorts', color: '#B9A47A' },
        shoes: { piece: 'sandals', color: '#6B4A2E' },
        accessories: [
          { piece: 'cap', color: '#EDEAE2' },
          { piece: 'sunglasses', color: '#2A2A2E' },
          { piece: 'watch', color: '#2B2B2E' },
        ],
      },
    },
    voice: {
      pitch: 'mid',
      pace: 'slow',
      notes: 'Sun-cured and amused, tells half a story and trails off into the weather. Calls every boat "she" and every problem "a little chop".',
      sayings: ['Little chop today.', 'She will hold. Probably.', 'I was never there, and neither was the boat.'],
    },
    subtitleColor: '#5CC4BE',
    homeDistrict: 'bahia_vista',
    foundAt: 'marina_bahia_vista',
    phone: { number: '555-0172', unlockedBy: 'm06_charter_rates' },
  },

  pim_adeyemi: {
    id: 'pim_adeyemi',
    name: 'Pim',
    fullName: 'Pim Adeyemi',
    alias: 'Pim',
    age: 22,
    roleKind: 'ally',
    role: 'Phone-repair kiosk owner at Galerías Aurora; opens anything with a lock screen',
    bio: 'Fixes cracked screens for the mall crowd and reads other people\'s phones for the leads. Treats security systems as puzzles somebody left out. Paid in cash and snacks.',
    faction: null,
    playable: false,
    appearance: {
      sex: 'female',
      ageBand: 'young_adult',
      height: 1.62,
      build: 'slim',
      skinTone: '#4A2C1D',
      hairStyle: 'curly_short',
      hairColor: '#2FA7A0',
      facialHair: 'none',
      outfit: {
        top: { piece: 'hoodie', color: '#8E5BD1' },
        bottom: { piece: 'cargo', color: '#26262B' },
        shoes: { piece: 'sneakers', color: '#F2EDE4' },
        accessories: [
          { piece: 'glasses', color: '#F2C230' },
          { piece: 'backpack', color: '#26262B' },
          { piece: 'earrings', color: '#2FA7A0' },
        ],
      },
    },
    voice: {
      pitch: 'high',
      pace: 'quick',
      notes: 'Bright, breathless and a step ahead, explains in acronyms then translates with snacks as units. Completely calm under fire, annoyed by slow wifi.',
      sayings: ['Okay, so, funny thing.', 'Ninety seconds. Maybe a hundred. Bring chips.', 'His password was his own name. Twice.'],
    },
    subtitleColor: '#B58CF0',
    homeDistrict: 'centro',
    foundAt: 'galerias_aurora',
    phone: { number: '555-0189', unlockedBy: 'm08_clean_hands' },
  },

  odette_baptiste: {
    id: 'odette_baptiste',
    name: 'Odette',
    fullName: 'Odette Baptiste',
    alias: null,
    age: 34,
    roleKind: 'contact',
    role: 'Floor manager at The Aurelia: the inside woman',
    bio: 'Dealt cards at The Aurelia for ten years and manages its gaming floor. Counts everything: chips, cameras, guards, the days until she can leave. Wants one thing from the leads, and it is not money.',
    faction: null,
    playable: false,
    appearance: {
      sex: 'female',
      ageBand: 'adult',
      height: 1.71,
      build: 'slim',
      skinTone: '#8D5A3B',
      hairStyle: 'long_straight',
      hairColor: '#16120F',
      facialHair: 'none',
      outfit: {
        top: { piece: 'vest', color: '#12545C', secondaryColor: '#F2EDE4' },
        bottom: { piece: 'suit_trousers', color: '#1C1C1F' },
        shoes: { piece: 'heels', color: '#1C1C1F' },
        accessories: [
          { piece: 'tie', color: '#C9A24A' },
          { piece: 'badge', color: '#C9A24A' },
          { piece: 'earrings', color: '#C9A24A' },
        ],
      },
    },
    voice: {
      pitch: 'mid',
      pace: 'measured',
      notes: 'A dealer\'s calm: soft, even, impossible to read. Speaks in odds and counts. The politeness is professional; the anger underneath is not.',
      sayings: ['Place your bets.', 'Eleven cameras, nine guards, one door.', 'The house wins until it does not.'],
    },
    subtitleColor: '#3FA9B3',
    homeDistrict: 'bahia_vista',
    foundAt: 'the_aurelia',
    phone: { number: '555-0195', unlockedBy: 'm08_clean_hands' },
  },
});

/**
 * The fixed appearance vocabulary for every modelled person in the game. Story characters use
 * single values; pedestrian archetypes and faction uniforms use ranges over the same lists.
 * @type {Readonly<{sexes: string[], ageBands: Record<string, {id: string, minAge: number, maxAge: number}>, builds: Record<string, string>, heightRange: [number, number], skinTones: string[], hairStyles: Record<string, string>, hairColors: string[], facialHair: string[], tops: Record<string, string>, bottoms: Record<string, string>, shoes: Record<string, string>, accessories: Record<string, string>}>}
 */
export const CHARACTER_APPEARANCE_VOCABULARY = freezeCatalog({
  sexes: ['female', 'male'],
  ageBands: {
    young_adult: { id: 'young_adult', minAge: 18, maxAge: 29 },
    adult: { id: 'adult', minAge: 30, maxAge: 44 },
    middle_aged: { id: 'middle_aged', minAge: 45, maxAge: 59 },
    senior: { id: 'senior', minAge: 60, maxAge: 80 },
  },
  builds: {
    slim: 'Narrow shoulders and waist, light limbs.',
    average: 'Ordinary proportions.',
    athletic: 'Broad shoulders, defined limbs, flat waist.',
    heavy: 'Thick torso and limbs, soft waist.',
  },
  heightRange: [1.5, 1.98],
  skinTones: ['#F3D9C6', '#E8C3A4', '#D9A982', '#C68B63', '#B07A52', '#8D5A3B', '#6B4129', '#4A2C1D'],
  hairStyles: {
    bald: 'No hair; smooth scalp.',
    shaved: 'Scalp-short stubble all over.',
    buzz: 'Even clipper cut, a few millimetres.',
    short_crop: 'Short on the sides, a little length and texture on top.',
    side_part: 'Short to medium, combed over from a side parting.',
    slick_back: 'Medium length combed straight back from the forehead.',
    curly_short: 'A short cap of loose curls.',
    afro_short: 'A short rounded afro.',
    ponytail: 'Pulled back and tied at the crown or nape, tail to the shoulders.',
    bun: 'Pulled back into a knot at the back or top of the head.',
    bob: 'Straight cut level with the jaw.',
    long_straight: 'Straight, past the shoulders.',
    long_wavy: 'Loose waves, past the shoulders.',
    braids: 'Rows of braids, to the nape or tied back.',
  },
  hairColors: ['#16120F', '#2E2019', '#4F3524', '#6E4428', '#7C3A22', '#A98455', '#CDAA6E', '#8F8E8B', '#D8D5CE', '#2FA7A0', '#C9457F', '#D9631E'],
  facialHair: ['none', 'stubble', 'moustache', 'goatee', 'short_beard', 'full_beard'],
  tops: {
    tee: 'Short-sleeved crew-neck tee.',
    polo: 'Short-sleeved collared polo.',
    tank: 'Sleeveless vest top.',
    button_shirt: 'Collared shirt, buttoned, sleeves rolled or long.',
    open_shirt_over_tee: 'Loose short-sleeved shirt worn open over a tee (secondaryColor is the tee).',
    hoodie: 'Hooded sweatshirt, hood down.',
    bomber: 'Short zip jacket with ribbed hem, worn open over a tee (secondaryColor).',
    blazer: 'Unstructured jacket worn open over a shirt or tee (secondaryColor).',
    suit_jacket: 'Tailored jacket, buttoned, over a shirt (secondaryColor).',
    leather_jacket: 'Waist-length leather jacket, open over a tee (secondaryColor).',
    police_shirt: 'Short-sleeved uniform shirt with epaulettes and chest pockets.',
    vest: 'Sleeveless outer layer (work vest, leather cut, waistcoat) over a shirt or tee (secondaryColor).',
    tactical_vest: 'Plate carrier with pouches over a long-sleeved combat shirt (secondaryColor).',
    dress_top: 'The upper part of a dress; always paired with the bottom piece "dress" in the same colour.',
  },
  bottoms: {
    jeans: 'Straight denim jeans.',
    chinos: 'Light cotton trousers.',
    shorts: 'Knee-length shorts.',
    cargo: 'Work trousers with thigh pockets.',
    suit_trousers: 'Pressed tailored trousers.',
    skirt: 'Knee-length skirt.',
    dress: 'The lower part of a knee-length dress; paired with the top piece "dress_top".',
  },
  shoes: {
    sneakers: 'Low trainers.',
    boots: 'Ankle or work boots.',
    loafers: 'Leather slip-ons or dress shoes.',
    sandals: 'Open sandals.',
    heels: 'Low to mid heels.',
  },
  accessories: {
    cap: 'Peaked cap.',
    sun_hat: 'Brimmed straw or cloth hat.',
    sunglasses: 'Tinted glasses, worn.',
    glasses: 'Clear spectacles; color is the frame.',
    chain: 'Neck chain.',
    watch: 'Wrist watch, left wrist.',
    earrings: 'A pair of earrings.',
    holster: 'Belt or shoulder holster.',
    badge: 'Metal badge on the belt or chest, or a name badge.',
    bandana: 'Cloth tied at the neck, the head or the wrist.',
    backpack: 'Small backpack.',
    tie: 'Necktie or bow tie.',
    helmet: 'Ballistic or motorcycle helmet.',
    hard_hat: 'Site safety helmet.',
    gloves: 'Work, driving or tactical gloves.',
  },
});

/**
 * Character ids in the order the cast is listed in menus and the credits.
 * @type {readonly string[]}
 */
export const STORY_CHARACTER_ORDER = freezeCatalog([
  'sol_arrieta', 'dez_tolliver', 'hattie_tolliver', 'ximena_robles', 'jacinto_roldan',
  'ozzy_prieto', 'clovis_arceneaux', 'odette_baptiste', 'pim_adeyemi', 'nadia_finch',
  'amara_whitlock', 'emmett_strand', 'renata_olabarria', 'etienne_lemaire', 'aurelio_santangel',
]);

/**
 * The two leads the player switches between, and how switching works.
 * @type {Readonly<{leads: string[], startingLead: string, switchRules: {allowedWhenWantedStarsAtMost: number, allowedDuringMission: boolean, cooldownSeconds: number, transition: string, idleSpots: Record<string, string[]>}, sharedBetweenLeads: string[], separatePerLead: string[]}>}
 */
export const PLAYABLE_LEADS = freezeCatalog({
  leads: ['dez_tolliver', 'sol_arrieta'],
  startingLead: 'dez_tolliver',
  switchRules: {
    allowedWhenWantedStarsAtMost: 0,
    allowedDuringMission: false,
    cooldownSeconds: 10,
    transition: 'A phone call between the two: the screen splits like an incoming call, the other lead answers, and play resumes on their side.',
    idleSpots: {
      sol_arrieta: ['callejon_del_loro_9', 'ancla_torcida', 'fonda_dona_pilar', 'plaza_de_la_marea'],
      dez_tolliver: ['tolliver_tow', 'dos_soles_diner', 'chatarreria_el_remache', 'solana_avenida_del_riel'],
    },
  },
  sharedBetweenLeads: ['cash', 'reputation', 'properties', 'garage vehicles', 'weapons and ammunition', 'mission progress', 'phone contacts'],
  separatePerLead: ['position', 'current vehicle', 'health and armour', 'outfit', 'perks'],
});

/** Recursively freezes a plain data tree so that no system can mutate the shared catalog. */
function freezeCatalog(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) freezeCatalog(value[key]);
  }
  return value;
}
