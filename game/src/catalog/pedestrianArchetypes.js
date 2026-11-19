// The people of Marazul's pavements: twenty archetypes with the appearance ranges the character
// artist and the crowd spawner draw from, where and when each kind walks, how brave they are,
// how they react to trouble, what is in their pockets and what they say. Plain frozen data, no
// imports.
//
// Appearance uses the fixed vocabulary of storyCharacters.js (CHARACTER_APPEARANCE_VOCABULARY):
// the same sexes, age bands, builds, skin tones, hair styles and colours, facial hair and outfit
// pieces, here as weighted ranges instead of single values. Units: metres, seconds, clock hours
// (a range whose start is later than its end wraps past midnight), whole dollars. District ids
// come from cityDistricts.js and must agree with each district's pedestrianMix; weapon ids come
// from weaponCatalog.js.

/**
 * @typedef {Object} OutfitRange
 * @property {number} weight Relative chance among the archetype's outfits that fit the sex.
 * @property {'any'|'female'|'male'} sex
 * @property {{piece: string, colors: string[], secondaryColors?: string[]}} top
 * @property {{piece: string, colors: string[]}} bottom
 * @property {{piece: string, colors: string[]}} shoes
 * @property {{piece: string, colors: string[], chance: number}[]} accessories Each is worn with its own chance.
 */

/**
 * @typedef {Object} AppearanceRange
 * @property {{female: number, male: number}} sexes Weights.
 * @property {Record<string, number>} ageBands Weights by age band id.
 * @property {[number, number]} heightRange Metres.
 * @property {Record<string, number>} builds Weights by build id.
 * @property {string[]} skinTones Hex values from the vocabulary; picked uniformly.
 * @property {{female: string[], male: string[]}} hairStyles
 * @property {string[]} hairColors
 * @property {Record<string, number>} facialHair Weights (male only).
 * @property {OutfitRange[]} outfits
 */

/**
 * @typedef {Object} PedestrianArchetype
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {AppearanceRange} appearance
 * @property {string[]} districts Where they spawn; weights are in each district's pedestrianMix.
 * @property {[number, number]} hours Clock hours when they are out.
 * @property {'shelter'|'hurry'|'ignore'} rainBehaviour
 * @property {'timid'|'calm'|'bold'|'hot_headed'} temperament
 * @property {number} courage 0 (runs from a raised voice) to 1 (stands their ground).
 * @property {number} aggression 0 (never fights) to 1 (swings first).
 * @property {Record<string, Record<string, number>>} reactions For each PEDESTRIAN_STIMULI id,
 *   weights over PEDESTRIAN_REACTIONS ids.
 * @property {number} reportsCrimeChance Chance that, as a witness, they phone the crime in.
 * @property {[number, number]} moneyCarried Dollars dropped when knocked down or robbed.
 * @property {number} armedChance Chance of carrying `weapon`.
 * @property {string|null} weapon Weapon id, or null.
 * @property {number} walkSpeed Metres per second at an easy walk.
 * @property {Record<string, number>} activities Weights over PEDESTRIAN_ACTIVITIES ids.
 * @property {{pitch: 'low'|'mid'|'high', lines: {bump: string[], fear: string[], anger: string[]}}} voice
 */

/**
 * The pedestrian archetypes, keyed by archetype id.
 * @type {Readonly<Record<string, PedestrianArchetype>>}
 */
export const PEDESTRIAN_ARCHETYPES = freezeCatalog({
  beach_tourist: {
    id: 'beach_tourist',
    name: 'Tourist',
    description: 'Visitors in loud shirts, sunburnt and delighted, photographing everything including crimes in progress.',
    appearance: {
      sexes: { female: 1, male: 1 },
      ageBands: { young_adult: 3, adult: 4, middle_aged: 3, senior: 2 },
      heightRange: [1.52, 1.92],
      builds: { slim: 2, average: 4, athletic: 1, heavy: 3 },
      skinTones: everySkinTone(),
      hairStyles: { female: ['long_straight', 'long_wavy', 'ponytail', 'bob', 'bun'], male: ['short_crop', 'side_part', 'buzz', 'bald', 'curly_short'] },
      hairColors: naturalHairColors(),
      facialHair: { none: 5, stubble: 2, moustache: 1, short_beard: 2 },
      outfits: [
        { weight: 4, sex: 'any', top: { piece: 'open_shirt_over_tee', colors: ['#F26B4E', '#2BB3B1', '#F2C94C', '#E05A9C'], secondaryColors: ['#F4F0E6', '#EDEAE2'] }, bottom: { piece: 'shorts', colors: ['#C9B48A', '#EDEAE2', '#2F4A6B'] }, shoes: { piece: 'sandals', colors: ['#7A5A3C', '#2A2A2E'] }, accessories: [{ piece: 'sun_hat', colors: ['#E8D9B0', '#F4F0E6'], chance: 0.5 }, { piece: 'sunglasses', colors: ['#1E1E20', '#6B4E2A'], chance: 0.6 }, { piece: 'backpack', colors: ['#3A6EA5', '#C8372D', '#3A3D40'], chance: 0.3 }] },
        { weight: 3, sex: 'female', top: { piece: 'dress_top', colors: ['#F4A3B4', '#8FD3C4', '#F2C94C', '#F4F0E6'] }, bottom: { piece: 'dress', colors: ['#F4A3B4', '#8FD3C4', '#F2C94C', '#F4F0E6'] }, shoes: { piece: 'sandals', colors: ['#B98A5A', '#EDEAE2'] }, accessories: [{ piece: 'sun_hat', colors: ['#E8D9B0', '#F4F0E6'], chance: 0.5 }, { piece: 'sunglasses', colors: ['#1E1E20', '#B5533C'], chance: 0.6 }, { piece: 'earrings', colors: ['#C9A24A', '#B8BCC2'], chance: 0.4 }] },
        { weight: 3, sex: 'any', top: { piece: 'tee', colors: ['#F4F0E6', '#7FD6C8', '#F6A6B2', '#9CCBEA'] }, bottom: { piece: 'shorts', colors: ['#C9B48A', '#5E7C99', '#3A3D40'] }, shoes: { piece: 'sneakers', colors: ['#EDEAE2', '#8C8F93'] }, accessories: [{ piece: 'cap', colors: ['#F4F0E6', '#2F4A6B', '#C8372D'], chance: 0.5 }, { piece: 'backpack', colors: ['#3A6EA5', '#3A3D40'], chance: 0.4 }, { piece: 'sunglasses', colors: ['#1E1E20'], chance: 0.4 }] },
      ],
    },
    districts: ['playa_dorada', 'centro', 'la_marisma', 'las_lomas', 'bahia_vista', 'los_pantanos'],
    hours: [8, 23],
    rainBehaviour: 'shelter',
    temperament: 'timid',
    courage: 0.15,
    aggression: 0.05,
    reactions: {
      gunfire: { flee: 8, cower: 2 },
      aimed_at: { hands_up: 6, flee: 4 },
      bumped: { ignore: 7, shout: 3 },
      vehicle_near_miss: { dive_aside: 6, shout: 4 },
      own_vehicle_stolen: { shout: 5, call_police: 5 },
      fight_nearby: { film: 5, flee: 3, gawk: 2 },
      explosion: { flee: 9, cower: 1 },
      body_seen: { flee: 5, call_police: 3, film: 2 },
    },
    reportsCrimeChance: 0.5,
    moneyCarried: [40, 220],
    armedChance: 0,
    weapon: null,
    walkSpeed: 1.2,
    activities: { stroll: 5, take_photo: 3, stand_chat: 2, window_shop: 2, sit: 1 },
    voice: {
      pitch: 'mid',
      lines: {
        bump: ['Oh! Sorry, is this the line for something?', 'Excuse us, we are walking here. Slowly.', 'Mind the camera!'],
        fear: ['This was not in the brochure!', 'I knew we should have gone to the mountains!', 'Take the bag! It is mostly sunscreen!'],
        anger: ['I am leaving a review!', 'One star! One star for this whole city!', 'Where is your manager? Does a city have a manager?'],
      },
    },
  },

  sunbather: {
    id: 'sunbather',
    name: 'Sunbather',
    description: 'Beach regulars who have claimed their square of sand and will defend it with sarcasm.',
    appearance: {
      sexes: { female: 1, male: 1 },
      ageBands: { young_adult: 4, adult: 4, middle_aged: 2, senior: 1 },
      heightRange: [1.55, 1.92],
      builds: { slim: 3, average: 4, athletic: 3, heavy: 2 },
      skinTones: everySkinTone(),
      hairStyles: { female: ['long_wavy', 'long_straight', 'ponytail', 'bun', 'braids'], male: ['short_crop', 'buzz', 'curly_short', 'shaved', 'bald'] },
      hairColors: naturalHairColors(),
      facialHair: { none: 5, stubble: 3, short_beard: 2 },
      outfits: [
        { weight: 5, sex: 'any', top: { piece: 'tank', colors: ['#F4F0E6', '#F26B4E', '#2BB3B1', '#F2C94C', '#1E1E21'] }, bottom: { piece: 'shorts', colors: ['#E05A9C', '#2F7FC1', '#F2C94C', '#3FA7A3', '#EDEAE2'] }, shoes: { piece: 'sandals', colors: ['#7A5A3C', '#2A2A2E', '#F26B4E'] }, accessories: [{ piece: 'sunglasses', colors: ['#1E1E20', '#B5533C', '#F4F0E6'], chance: 0.8 }, { piece: 'sun_hat', colors: ['#E8D9B0', '#F4F0E6'], chance: 0.4 }] },
        { weight: 3, sex: 'female', top: { piece: 'dress_top', colors: ['#F4F0E6', '#F6A6B2', '#7FD6C8', '#FFD36B'] }, bottom: { piece: 'dress', colors: ['#F4F0E6', '#F6A6B2', '#7FD6C8', '#FFD36B'] }, shoes: { piece: 'sandals', colors: ['#B98A5A', '#EDEAE2'] }, accessories: [{ piece: 'sunglasses', colors: ['#1E1E20', '#B5533C'], chance: 0.8 }, { piece: 'sun_hat', colors: ['#E8D9B0'], chance: 0.5 }, { piece: 'earrings', colors: ['#C9A24A'], chance: 0.3 }] },
        { weight: 2, sex: 'male', top: { piece: 'open_shirt_over_tee', colors: ['#F4F0E6', '#9CCBEA', '#F6A6B2'], secondaryColors: ['#F4F0E6', '#C68B63'] }, bottom: { piece: 'shorts', colors: ['#2F7FC1', '#C8372D', '#3A3D40'] }, shoes: { piece: 'sandals', colors: ['#7A5A3C', '#2A2A2E'] }, accessories: [{ piece: 'sunglasses', colors: ['#1E1E20'], chance: 0.7 }, { piece: 'chain', colors: ['#C9A24A', '#B8BCC2'], chance: 0.3 }] },
      ],
    },
    districts: ['playa_dorada'],
    hours: [9, 19],
    rainBehaviour: 'shelter',
    temperament: 'calm',
    courage: 0.3,
    aggression: 0.1,
    reactions: {
      gunfire: { flee: 7, cower: 3 },
      aimed_at: { hands_up: 7, flee: 3 },
      bumped: { shout: 5, ignore: 5 },
      vehicle_near_miss: { dive_aside: 7, shout: 3 },
      own_vehicle_stolen: { shout: 6, call_police: 4 },
      fight_nearby: { gawk: 5, film: 3, flee: 2 },
      explosion: { flee: 8, cower: 2 },
      body_seen: { call_police: 5, flee: 4, gawk: 1 },
    },
    reportsCrimeChance: 0.45,
    moneyCarried: [10, 90],
    armedChance: 0,
    weapon: null,
    walkSpeed: 1.1,
    activities: { lie_down: 5, sit: 3, stroll: 2, stand_chat: 2 },
    voice: {
      pitch: 'mid',
      lines: {
        bump: ['You are in my sun.', 'There is a whole beach. Pick another part.', 'Towel! Towel! That is a towel!'],
        fear: ['Not the beach! Is nothing sacred?', 'I just reapplied!', 'Lifeguard! This feels like a lifeguard thing!'],
        anger: ['I was here at seven for this spot!', 'Go bother the volleyball people!', 'Do you kick sand at everyone, or am I special?'],
      },
    },
  },

  surfer: {
    id: 'surfer',
    name: 'Surfer',
    description: 'Young, salt-bleached and unhurried. The Gulf barely has waves, a fact they refuse to discuss.',
    appearance: {
      sexes: { female: 2, male: 3 },
      ageBands: { young_adult: 7, adult: 3 },
      heightRange: [1.6, 1.94],
      builds: { slim: 4, athletic: 5, average: 1 },
      skinTones: ['#E8C3A4', '#D9A982', '#C68B63', '#B07A52', '#8D5A3B', '#6B4129'],
      hairStyles: { female: ['long_wavy', 'ponytail', 'braids', 'bun'], male: ['long_wavy', 'curly_short', 'short_crop', 'ponytail'] },
      hairColors: ['#CDAA6E', '#A98455', '#6E4428', '#4F3524', '#16120F', '#2FA7A0'],
      facialHair: { none: 4, stubble: 4, goatee: 1, short_beard: 1 },
      outfits: [
        { weight: 5, sex: 'any', top: { piece: 'tank', colors: ['#3FA7A3', '#F26B4E', '#F4F0E6', '#F2C94C', '#26262B'] }, bottom: { piece: 'shorts', colors: ['#2F7FC1', '#E05A9C', '#26262B', '#3FA7A3'] }, shoes: { piece: 'sandals', colors: ['#2A2A2E', '#7A5A3C'] }, accessories: [{ piece: 'chain', colors: ['#E8D9B0', '#B8BCC2'], chance: 0.4 }, { piece: 'sunglasses', colors: ['#1E1E20', '#3FA7A3'], chance: 0.5 }, { piece: 'backpack', colors: ['#3A3D40', '#F26B4E'], chance: 0.2 }] },
        { weight: 3, sex: 'any', top: { piece: 'tee', colors: ['#F4F0E6', '#9CCBEA', '#F6A6B2', '#8FD3C4'] }, bottom: { piece: 'shorts', colors: ['#C9B48A', '#2F4A6B', '#3A3D40'] }, shoes: { piece: 'sandals', colors: ['#2A2A2E', '#7A5A3C'] }, accessories: [{ piece: 'cap', colors: ['#F4F0E6', '#3FA7A3'], chance: 0.3 }, { piece: 'sunglasses', colors: ['#1E1E20'], chance: 0.5 }] },
      ],
    },
    districts: ['playa_dorada'],
    hours: [6, 20],
    rainBehaviour: 'ignore',
    temperament: 'calm',
    courage: 0.45,
    aggression: 0.15,
    reactions: {
      gunfire: { flee: 6, cower: 2, gawk: 2 },
      aimed_at: { hands_up: 8, flee: 2 },
      bumped: { ignore: 8, shout: 2 },
      vehicle_near_miss: { dive_aside: 8, shout: 2 },
      own_vehicle_stolen: { shout: 7, call_police: 3 },
      fight_nearby: { gawk: 5, film: 4, flee: 1 },
      explosion: { flee: 7, gawk: 3 },
      body_seen: { call_police: 5, gawk: 3, flee: 2 },
    },
    reportsCrimeChance: 0.3,
    moneyCarried: [5, 60],
    armedChance: 0,
    weapon: null,
    walkSpeed: 1.3,
    activities: { stroll: 4, stand_chat: 3, sit: 3, lean: 2 },
    voice: {
      pitch: 'mid',
      lines: {
        bump: ['Easy, easy. Plenty of pavement.', 'Whoa. Personal tide line, friend.', 'No worries. Some worries. A few.'],
        fear: ['Heavy! Way too heavy!', 'I am out. I am so out.', 'This is extremely not chill!'],
        anger: ['You are harshing a very rare swell!', 'Not cool. Like, measurably not cool.', 'Karma has your plate number!'],
      },
    },
  },

  jogger: {
    id: 'jogger',
    name: 'Jogger',
    description: 'Runners with watches that count everything. Fast to flee, faster to post about it.',
    appearance: {
      sexes: { female: 1, male: 1 },
      ageBands: { young_adult: 4, adult: 5, middle_aged: 3, senior: 1 },
      heightRange: [1.56, 1.94],
      builds: { slim: 5, athletic: 5, average: 1 },
      skinTones: everySkinTone(),
      hairStyles: { female: ['ponytail', 'bun', 'braids', 'short_crop'], male: ['buzz', 'short_crop', 'shaved', 'bald', 'curly_short'] },
      hairColors: naturalHairColors(),
      facialHair: { none: 6, stubble: 3, short_beard: 1 },
      outfits: [
        { weight: 5, sex: 'any', top: { piece: 'tank', colors: ['#3DE0D0', '#FF4FA3', '#F4F0E6', '#26262B', '#A8C51F'] }, bottom: { piece: 'shorts', colors: ['#26262B', '#2F4A6B', '#8C8F93'] }, shoes: { piece: 'sneakers', colors: ['#F4F0E6', '#FF4FA3', '#A8C51F', '#F28C28'] }, accessories: [{ piece: 'watch', colors: ['#26262B', '#F28C28'], chance: 0.7 }, { piece: 'cap', colors: ['#F4F0E6', '#26262B'], chance: 0.3 }, { piece: 'sunglasses', colors: ['#1E1E20'], chance: 0.3 }] },
        { weight: 4, sex: 'any', top: { piece: 'tee', colors: ['#9CCBEA', '#F4F0E6', '#8C8F93', '#F28C28'] }, bottom: { piece: 'shorts', colors: ['#26262B', '#2F4A6B'] }, shoes: { piece: 'sneakers', colors: ['#F4F0E6', '#3DE0D0', '#26262B'] }, accessories: [{ piece: 'watch', colors: ['#26262B'], chance: 0.7 }, { piece: 'cap', colors: ['#F4F0E6', '#C8372D'], chance: 0.3 }] },
      ],
    },
    districts: ['playa_dorada', 'centro', 'la_marisma', 'las_lomas', 'bahia_vista', 'isla_coral', 'barrio_hierro', 'los_pantanos'],
    hours: [5.5, 21],
    rainBehaviour: 'ignore',
    temperament: 'calm',
    courage: 0.3,
    aggression: 0.05,
    reactions: {
      gunfire: { flee: 10 },
      aimed_at: { hands_up: 5, flee: 5 },
      bumped: { shout: 6, ignore: 4 },
      vehicle_near_miss: { dive_aside: 8, shout: 2 },
      own_vehicle_stolen: { call_police: 6, shout: 4 },
      fight_nearby: { flee: 6, film: 4 },
      explosion: { flee: 10 },
      body_seen: { call_police: 6, flee: 4 },
    },
    reportsCrimeChance: 0.6,
    moneyCarried: [0, 40],
    armedChance: 0,
    weapon: null,
    walkSpeed: 3.1,
    activities: { jog: 8, stretch: 2, stand_chat: 1 },
    voice: {
      pitch: 'mid',
      lines: {
        bump: ['On your left! That was your left!', 'You just ruined a personal best.', 'Pace! I am keeping a pace!'],
        fear: ['Heart rate! Heart rate!', 'This counts as intervals!', 'I am not trained for this distance!'],
        anger: ['I pay taxes on this pavement!', 'Share the path, you absolute cramp!', 'My watch saw everything!'],
      },
    },
  },

  office_worker: {
    id: 'office_worker',
    name: 'Office Worker',
    description: 'Lanyards, lunch queues and a phone held like a shield. The backbone of Centro and of every witness statement.',
    appearance: {
      sexes: { female: 1, male: 1 },
      ageBands: { young_adult: 3, adult: 5, middle_aged: 3 },
      heightRange: [1.54, 1.92],
      builds: { slim: 3, average: 5, athletic: 1, heavy: 2 },
      skinTones: everySkinTone(),
      hairStyles: { female: ['bob', 'bun', 'ponytail', 'long_straight', 'braids'], male: ['side_part', 'short_crop', 'buzz', 'bald', 'slick_back'] },
      hairColors: naturalHairColors(),
      facialHair: { none: 6, stubble: 2, short_beard: 1, moustache: 1 },
      outfits: [
        { weight: 5, sex: 'male', top: { piece: 'button_shirt', colors: ['#F2F0E8', '#BFD6EA', '#F0D6DA', '#D7E3D0'] }, bottom: { piece: 'chinos', colors: ['#2E3238', '#5C6166', '#B9A47A', '#2F4A6B'] }, shoes: { piece: 'loafers', colors: ['#3A2A1E', '#1A1A1C'] }, accessories: [{ piece: 'tie', colors: ['#2F4A6B', '#7A1F3D', '#3A3D40'], chance: 0.35 }, { piece: 'watch', colors: ['#B8BCC2', '#2B2B2E'], chance: 0.5 }, { piece: 'glasses', colors: ['#1E1E20', '#6B4E2A'], chance: 0.3 }, { piece: 'backpack', colors: ['#3A3D40'], chance: 0.15 }] },
        { weight: 5, sex: 'female', top: { piece: 'blazer', colors: ['#2E3238', '#5E86A8', '#B5533C', '#D9C2A5'], secondaryColors: ['#F2F0E8', '#F0D6DA'] }, bottom: { piece: 'suit_trousers', colors: ['#2E3238', '#5C6166', '#D9C2A5'] }, shoes: { piece: 'loafers', colors: ['#1A1A1C', '#3A2A1E'] }, accessories: [{ piece: 'watch', colors: ['#B8BCC2', '#C9A24A'], chance: 0.5 }, { piece: 'glasses', colors: ['#1E1E20', '#7A1F3D'], chance: 0.3 }, { piece: 'earrings', colors: ['#C9A24A', '#B8BCC2'], chance: 0.5 }] },
        { weight: 3, sex: 'female', top: { piece: 'button_shirt', colors: ['#F2F0E8', '#BFD6EA', '#F0D6DA'] }, bottom: { piece: 'skirt', colors: ['#2E3238', '#5C6166', '#2F4A6B'] }, shoes: { piece: 'heels', colors: ['#1A1A1C', '#7A1F3D'] }, accessories: [{ piece: 'watch', colors: ['#C9A24A'], chance: 0.4 }, { piece: 'earrings', colors: ['#C9A24A'], chance: 0.5 }, { piece: 'glasses', colors: ['#1E1E20'], chance: 0.25 }] },
        { weight: 3, sex: 'male', top: { piece: 'polo', colors: ['#2F4A6B', '#F2F0E8', '#3B6B4B', '#8C8F93'] }, bottom: { piece: 'chinos', colors: ['#B9A47A', '#2E3238'] }, shoes: { piece: 'sneakers', colors: ['#F2F0E8', '#3A3D40'] }, accessories: [{ piece: 'badge', colors: ['#F2F0E8'], chance: 0.5 }, { piece: 'watch', colors: ['#2B2B2E'], chance: 0.4 }, { piece: 'backpack', colors: ['#3A3D40', '#2F4A6B'], chance: 0.3 }] },
      ],
    },
    districts: ['playa_dorada', 'centro', 'la_marisma', 'puerto_tamarindo', 'barrio_hierro'],
    hours: [7, 20],
    rainBehaviour: 'hurry',
    temperament: 'timid',
    courage: 0.2,
    aggression: 0.05,
    reactions: {
      gunfire: { flee: 7, cower: 3 },
      aimed_at: { hands_up: 8, flee: 2 },
      bumped: { ignore: 6, shout: 4 },
      vehicle_near_miss: { dive_aside: 6, shout: 4 },
      own_vehicle_stolen: { call_police: 7, shout: 3 },
      fight_nearby: { flee: 5, film: 3, call_police: 2 },
      explosion: { flee: 8, cower: 2 },
      body_seen: { call_police: 6, flee: 4 },
    },
    reportsCrimeChance: 0.7,
    moneyCarried: [20, 160],
    armedChance: 0,
    weapon: null,
    walkSpeed: 1.5,
    activities: { walk: 6, phone_call: 3, stand_chat: 2, sit: 1 },
    voice: {
      pitch: 'mid',
      lines: {
        bump: ['I am on a call. I am always on a call.', 'Per my last step, watch it.', 'That was my lunch break you walked into.'],
        fear: ['I cannot die, I have a two o\'clock!', 'Take the laptop! It is the company\'s!', 'This is going in an email!'],
        anger: ['I will escalate this!', 'Do you know how many meetings I survived today?', 'You have made an enemy in accounts payable!'],
      },
    },
  },

  executive: {
    id: 'executive',
    name: 'Executive',
    description: 'Suits from the towers and the yacht club board: expensive, impatient and certain the police work for them personally.',
    appearance: {
      sexes: { female: 2, male: 3 },
      ageBands: { adult: 4, middle_aged: 5, senior: 2 },
      heightRange: [1.6, 1.93],
      builds: { slim: 2, average: 5, athletic: 1, heavy: 3 },
      skinTones: everySkinTone(),
      hairStyles: { female: ['bob', 'bun', 'long_straight', 'side_part'], male: ['slick_back', 'side_part', 'short_crop', 'bald'] },
      hairColors: ['#16120F', '#2E2019', '#4F3524', '#8F8E8B', '#D8D5CE', '#A98455'],
      facialHair: { none: 7, moustache: 1, short_beard: 2 },
      outfits: [
        { weight: 6, sex: 'male', top: { piece: 'suit_jacket', colors: ['#2B3442', '#3A3D42', '#1F2A44', '#6E6A60'], secondaryColors: ['#F2F0E8', '#BFD6EA'] }, bottom: { piece: 'suit_trousers', colors: ['#2B3442', '#3A3D42', '#1F2A44', '#6E6A60'] }, shoes: { piece: 'loafers', colors: ['#1A1A1C', '#3A2A1E'] }, accessories: [{ piece: 'tie', colors: ['#7A1F3D', '#C9A24A', '#2F4A6B'], chance: 0.6 }, { piece: 'watch', colors: ['#C9A24A', '#B8BCC2'], chance: 0.9 }, { piece: 'sunglasses', colors: ['#1E1E20'], chance: 0.3 }] },
        { weight: 5, sex: 'female', top: { piece: 'suit_jacket', colors: ['#2B3442', '#7A1F3D', '#EDE6D6', '#1F3B32'], secondaryColors: ['#F2F0E8', '#1E1E21'] }, bottom: { piece: 'suit_trousers', colors: ['#2B3442', '#1E1E21', '#EDE6D6'] }, shoes: { piece: 'heels', colors: ['#1A1A1C', '#7A1F3D', '#D9C2A5'] }, accessories: [{ piece: 'watch', colors: ['#C9A24A'], chance: 0.8 }, { piece: 'earrings', colors: ['#C9A24A', '#EDEAE2'], chance: 0.7 }, { piece: 'glasses', colors: ['#1E1E20'], chance: 0.2 }] },
        { weight: 2, sex: 'female', top: { piece: 'blazer', colors: ['#EDE6D6', '#2B3442'], secondaryColors: ['#1E1E21', '#F2F0E8'] }, bottom: { piece: 'skirt', colors: ['#2B3442', '#1E1E21'] }, shoes: { piece: 'heels', colors: ['#1A1A1C'] }, accessories: [{ piece: 'watch', colors: ['#C9A24A'], chance: 0.8 }, { piece: 'earrings', colors: ['#C9A24A'], chance: 0.7 }, { piece: 'sunglasses', colors: ['#1E1E20'], chance: 0.3 }] },
      ],
    },
    districts: ['centro', 'las_lomas', 'bahia_vista', 'isla_coral'],
    hours: [7, 22],
    rainBehaviour: 'hurry',
    temperament: 'calm',
    courage: 0.25,
    aggression: 0.1,
    reactions: {
      gunfire: { flee: 7, cower: 3 },
      aimed_at: { hands_up: 9, flee: 1 },
      bumped: { shout: 8, ignore: 2 },
      vehicle_near_miss: { shout: 6, dive_aside: 4 },
      own_vehicle_stolen: { call_police: 9, shout: 1 },
      fight_nearby: { call_police: 5, flee: 5 },
      explosion: { flee: 8, cower: 2 },
      body_seen: { call_police: 8, flee: 2 },
    },
    reportsCrimeChance: 0.85,
    moneyCarried: [200, 900],
    armedChance: 0,
    weapon: null,
    walkSpeed: 1.5,
    activities: { walk: 5, phone_call: 5, stand_chat: 2 },
    voice: {
      pitch: 'low',
      lines: {
        bump: ['This suit has a deductible.', 'Do you have an appointment to stand there?', 'I bill for interruptions.'],
        fear: ['I will pay! I have people who pay for me!', 'My lawyer is going to hear about this, if I live!', 'Take the watch! It is insured! Twice!'],
        anger: ['I play golf with the chief of police!', 'You just assaulted a board member!', 'I will buy this street and ban you from it!'],
      },
    },
  },

  old_town_elder: {
    id: 'old_town_elder',
    name: 'Old Town Elder',
    description: 'The grandparents of La Marisma: dominoes, church, the market by eight. Afraid of nothing and disappointed in everyone.',
    appearance: {
      sexes: { female: 1, male: 1 },
      ageBands: { middle_aged: 2, senior: 8 },
      heightRange: [1.5, 1.78],
      builds: { slim: 3, average: 4, heavy: 4 },
      skinTones: ['#E8C3A4', '#D9A982', '#C68B63', '#B07A52', '#8D5A3B', '#6B4129'],
      hairStyles: { female: ['bun', 'bob', 'curly_short'], male: ['bald', 'side_part', 'short_crop', 'slick_back'] },
      hairColors: ['#8F8E8B', '#D8D5CE', '#16120F'],
      facialHair: { none: 4, moustache: 4, stubble: 1, full_beard: 1 },
      outfits: [
        { weight: 5, sex: 'male', top: { piece: 'button_shirt', colors: ['#F2F0E8', '#EFE6D2', '#BFD6EA', '#D7E3D0'] }, bottom: { piece: 'chinos', colors: ['#B9A47A', '#6E6A60', '#3A3D40'] }, shoes: { piece: 'loafers', colors: ['#3A2A1E', '#6B4A2E'] }, accessories: [{ piece: 'sun_hat', colors: ['#E8D9B0', '#F4F0E6'], chance: 0.6 }, { piece: 'glasses', colors: ['#6B4E2A', '#1E1E20'], chance: 0.5 }, { piece: 'watch', colors: ['#C9A24A'], chance: 0.3 }] },
        { weight: 5, sex: 'female', top: { piece: 'dress_top', colors: ['#3F5F7F', '#7A1F3D', '#2E4A3A', '#5A4A6B'] }, bottom: { piece: 'dress', colors: ['#3F5F7F', '#7A1F3D', '#2E4A3A', '#5A4A6B'] }, shoes: { piece: 'loafers', colors: ['#1A1A1C', '#3A2A1E'] }, accessories: [{ piece: 'glasses', colors: ['#6B4E2A', '#C9A24A'], chance: 0.5 }, { piece: 'earrings', colors: ['#C9A24A', '#EDEAE2'], chance: 0.5 }, { piece: 'bandana', colors: ['#F2F0E8', '#C8372D'], chance: 0.2 }] },
        { weight: 2, sex: 'female', top: { piece: 'button_shirt', colors: ['#F2F0E8', '#F0D6DA', '#EFC66A'] }, bottom: { piece: 'skirt', colors: ['#3A3D40', '#3F5F7F', '#6E2A2E'] }, shoes: { piece: 'sandals', colors: ['#6B4A2E'] }, accessories: [{ piece: 'glasses', colors: ['#6B4E2A'], chance: 0.5 }, { piece: 'earrings', colors: ['#C9A24A'], chance: 0.5 }] },
      ],
    },
    districts: ['playa_dorada', 'centro', 'la_marisma', 'puerto_tamarindo', 'barrio_hierro'],
    hours: [6, 21],
    rainBehaviour: 'shelter',
    temperament: 'bold',
    courage: 0.7,
    aggression: 0.2,
    reactions: {
      gunfire: { cower: 5, flee: 3, shout: 2 },
      aimed_at: { shout: 5, hands_up: 5 },
      bumped: { shout: 9, ignore: 1 },
      vehicle_near_miss: { shout: 8, dive_aside: 2 },
      own_vehicle_stolen: { shout: 7, call_police: 3 },
      fight_nearby: { shout: 6, gawk: 4 },
      explosion: { cower: 5, flee: 5 },
      body_seen: { call_police: 5, gawk: 5 },
    },
    reportsCrimeChance: 0.35,
    moneyCarried: [5, 70],
    armedChance: 0,
    weapon: null,
    walkSpeed: 0.9,
    activities: { stroll: 4, sit: 4, stand_chat: 4, play_dominoes: 2 },
    voice: {
      pitch: 'low',
      lines: {
        bump: ['In my day we looked where we walked.', 'I knew your grandmother. She would be ashamed.', 'Slowly, mijo. The street is not going anywhere.'],
        fear: ['Ay, Santa Marea!', 'I survived three hurricanes for this?', 'Not before the domino final!'],
        anger: ['I will tell your mother! I will find her!', 'Sinvergüenza!', 'Come back here and I will show you the back of a sandal!'],
      },
    },
  },

  market_vendor: {
    id: 'market_vendor',
    name: 'Market Vendor',
    description: 'Stallholders and street sellers: fruit, phone cases, shaved ice. They hear everything and discount nothing.',
    appearance: {
      sexes: { female: 1, male: 1 },
      ageBands: { young_adult: 2, adult: 4, middle_aged: 4, senior: 1 },
      heightRange: [1.52, 1.86],
      builds: { slim: 2, average: 4, athletic: 1, heavy: 4 },
      skinTones: ['#D9A982', '#C68B63', '#B07A52', '#8D5A3B', '#6B4129', '#4A2C1D'],
      hairStyles: { female: ['bun', 'ponytail', 'braids', 'bob'], male: ['short_crop', 'buzz', 'bald', 'curly_short', 'side_part'] },
      hairColors: ['#16120F', '#2E2019', '#4F3524', '#8F8E8B'],
      facialHair: { none: 3, moustache: 3, stubble: 2, short_beard: 2 },
      outfits: [
        { weight: 5, sex: 'any', top: { piece: 'tee', colors: ['#F2F0E8', '#EFC66A', '#D9785A', '#7FB3A8', '#C8372D'] }, bottom: { piece: 'jeans', colors: ['#34404F', '#5E7C99'] }, shoes: { piece: 'sneakers', colors: ['#EDEAE2', '#3A3D40'] }, accessories: [{ piece: 'cap', colors: ['#C8372D', '#2F4A6B', '#F2F0E8'], chance: 0.5 }, { piece: 'bandana', colors: ['#C8372D', '#EFC66A'], chance: 0.3 }] },
        { weight: 4, sex: 'any', top: { piece: 'polo', colors: ['#3B6B4B', '#D9785A', '#F2F0E8', '#2F7F8A'] }, bottom: { piece: 'shorts', colors: ['#B9A47A', '#3A3D40', '#5E7C99'] }, shoes: { piece: 'sandals', colors: ['#6B4A2E', '#2A2A2E'] }, accessories: [{ piece: 'sun_hat', colors: ['#E8D9B0'], chance: 0.5 }, { piece: 'watch', colors: ['#2B2B2E'], chance: 0.2 }] },
        { weight: 3, sex: 'female', top: { piece: 'button_shirt', colors: ['#F2F0E8', '#EFC66A', '#E59A6B'] }, bottom: { piece: 'skirt', colors: ['#6E2A2E', '#2F7F8A', '#3A3D40'] }, shoes: { piece: 'sandals', colors: ['#6B4A2E'] }, accessories: [{ piece: 'bandana', colors: ['#C8372D', '#F2F0E8'], chance: 0.4 }, { piece: 'earrings', colors: ['#C9A24A'], chance: 0.5 }] },
      ],
    },
    districts: ['playa_dorada', 'centro', 'la_marisma', 'puerto_tamarindo', 'barrio_hierro'],
    hours: [6, 20],
    rainBehaviour: 'shelter',
    temperament: 'bold',
    courage: 0.6,
    aggression: 0.35,
    reactions: {
      gunfire: { cower: 5, flee: 5 },
      aimed_at: { hands_up: 7, shout: 3 },
      bumped: { shout: 7, ignore: 3 },
      vehicle_near_miss: { shout: 7, dive_aside: 3 },
      own_vehicle_stolen: { shout: 5, fight: 3, call_police: 2 },
      fight_nearby: { gawk: 6, shout: 4 },
      explosion: { flee: 6, cower: 4 },
      body_seen: { call_police: 4, gawk: 6 },
    },
    reportsCrimeChance: 0.3,
    moneyCarried: [30, 260],
    armedChance: 0,
    weapon: null,
    walkSpeed: 1.2,
    activities: { tend_stall: 7, stand_chat: 3, walk: 2 },
    voice: {
      pitch: 'mid',
      lines: {
        bump: ['You touch it, you bought it.', 'Careful! Those mangoes have feelings.', 'No refunds for collisions.'],
        fear: ['Take the mangoes, leave the scale!', 'I am closed! Suddenly closed!', 'Not the stall, I just rebuilt the stall!'],
        anger: ['That is coming out of your change!', 'You are banned from the market! All of it!', 'My cousin is a very large man!'],
      },
    },
  },

  street_musician: {
    id: 'street_musician',
    name: 'Street Musician',
    description: 'Buskers on the promenade and the plaza. Will play through anything short of gunfire, and has considered that too.',
    appearance: {
      sexes: { female: 2, male: 3 },
      ageBands: { young_adult: 4, adult: 3, middle_aged: 2, senior: 2 },
      heightRange: [1.55, 1.9],
      builds: { slim: 5, average: 4, heavy: 1 },
      skinTones: everySkinTone(),
      hairStyles: { female: ['long_wavy', 'braids', 'curly_short', 'afro_short'], male: ['long_wavy', 'curly_short', 'afro_short', 'ponytail', 'bald'] },
      hairColors: ['#16120F', '#2E2019', '#4F3524', '#7C3A22', '#8F8E8B', '#C9457F'],
      facialHair: { none: 2, stubble: 3, goatee: 2, short_beard: 2, full_beard: 1 },
      outfits: [
        { weight: 5, sex: 'any', top: { piece: 'open_shirt_over_tee', colors: ['#B5533C', '#2F7F8A', '#5A4A6B', '#E8B84A'], secondaryColors: ['#F2F0E8', '#1E1E21'] }, bottom: { piece: 'jeans', colors: ['#34404F', '#1E2430', '#5E7C99'] }, shoes: { piece: 'boots', colors: ['#3A2A1E', '#1A1A1C'] }, accessories: [{ piece: 'sun_hat', colors: ['#3A2A1E', '#E8D9B0'], chance: 0.5 }, { piece: 'sunglasses', colors: ['#1E1E20'], chance: 0.4 }, { piece: 'chain', colors: ['#B8BCC2'], chance: 0.3 }] },
        { weight: 3, sex: 'any', top: { piece: 'vest', colors: ['#3A2A1E', '#1E1E21', '#6E2A2E'], secondaryColors: ['#F2F0E8', '#EFC66A'] }, bottom: { piece: 'chinos', colors: ['#6E6A60', '#3A3D40'] }, shoes: { piece: 'sneakers', colors: ['#EDEAE2', '#C8372D'] }, accessories: [{ piece: 'earrings', colors: ['#C9A24A', '#B8BCC2'], chance: 0.4 }, { piece: 'bandana', colors: ['#C8372D', '#2F7F8A'], chance: 0.3 }] },
      ],
    },
    districts: ['playa_dorada', 'centro', 'la_marisma', 'bahia_vista', 'barrio_hierro'],
    hours: [10, 24],
    rainBehaviour: 'shelter',
    temperament: 'calm',
    courage: 0.4,
    aggression: 0.1,
    reactions: {
      gunfire: { flee: 6, cower: 4 },
      aimed_at: { hands_up: 8, flee: 2 },
      bumped: { ignore: 6, shout: 4 },
      vehicle_near_miss: { dive_aside: 7, shout: 3 },
      own_vehicle_stolen: { shout: 8, call_police: 2 },
      fight_nearby: { gawk: 7, flee: 3 },
      explosion: { flee: 7, cower: 3 },
      body_seen: { gawk: 5, call_police: 3, flee: 2 },
    },
    reportsCrimeChance: 0.25,
    moneyCarried: [3, 45],
    armedChance: 0,
    weapon: null,
    walkSpeed: 1.2,
    activities: { play_music: 8, sit: 2, walk: 1 },
    voice: {
      pitch: 'mid',
      lines: {
        bump: ['Mind the hat. The hat is the business.', 'That is a tip or an apology. Choose.', 'Hey! I was mid-chorus!'],
        fear: ['Not the hands! I need the hands!', 'Everyone is a critic!', 'I will play quieter! I will play nothing!'],
        anger: ['You owe me a string!', 'No requests for you. Ever.', 'I am writing a song about this, and you will hate it!'],
      },
    },
  },

  student: {
    id: 'student',
    name: 'Student',
    description: 'University students with backpacks and a camera already recording. The reason every chase ends up online.',
    appearance: {
      sexes: { female: 1, male: 1 },
      ageBands: { young_adult: 1 },
      heightRange: [1.55, 1.93],
      builds: { slim: 5, average: 4, athletic: 2, heavy: 1 },
      skinTones: everySkinTone(),
      hairStyles: { female: ['long_straight', 'ponytail', 'braids', 'curly_short', 'afro_short', 'bun'], male: ['curly_short', 'afro_short', 'short_crop', 'buzz', 'long_wavy'] },
      hairColors: ['#16120F', '#2E2019', '#4F3524', '#6E4428', '#CDAA6E', '#2FA7A0', '#C9457F'],
      facialHair: { none: 6, stubble: 3, goatee: 1 },
      outfits: [
        { weight: 5, sex: 'any', top: { piece: 'hoodie', colors: ['#8C8F93', '#2F4A6B', '#6E2A2E', '#3B6B4B', '#26262B', '#B79BE0'] }, bottom: { piece: 'jeans', colors: ['#34404F', '#5E7C99', '#1E2430'] }, shoes: { piece: 'sneakers', colors: ['#F2F0E8', '#26262B', '#C8372D'] }, accessories: [{ piece: 'backpack', colors: ['#26262B', '#2F4A6B', '#F28C28'], chance: 0.8 }, { piece: 'glasses', colors: ['#1E1E20', '#B8BCC2'], chance: 0.3 }, { piece: 'cap', colors: ['#26262B', '#F2F0E8'], chance: 0.3 }] },
        { weight: 5, sex: 'any', top: { piece: 'tee', colors: ['#F2F0E8', '#26262B', '#F2C94C', '#7FD6C8', '#F6A6B2'] }, bottom: { piece: 'shorts', colors: ['#5E7C99', '#26262B', '#B9A47A'] }, shoes: { piece: 'sneakers', colors: ['#F2F0E8', '#26262B'] }, accessories: [{ piece: 'backpack', colors: ['#26262B', '#3A6EA5'], chance: 0.8 }, { piece: 'earrings', colors: ['#B8BCC2'], chance: 0.3 }, { piece: 'sunglasses', colors: ['#1E1E20'], chance: 0.25 }] },
        { weight: 2, sex: 'female', top: { piece: 'tank', colors: ['#F2F0E8', '#26262B', '#E05A9C'] }, bottom: { piece: 'skirt', colors: ['#26262B', '#5E7C99', '#6E2A2E'] }, shoes: { piece: 'sneakers', colors: ['#F2F0E8'] }, accessories: [{ piece: 'backpack', colors: ['#26262B', '#F6A6B2'], chance: 0.7 }, { piece: 'earrings', colors: ['#C9A24A', '#B8BCC2'], chance: 0.5 }] },
      ],
    },
    districts: ['playa_dorada', 'centro', 'la_marisma', 'las_lomas', 'barrio_hierro'],
    hours: [8, 24],
    rainBehaviour: 'hurry',
    temperament: 'calm',
    courage: 0.35,
    aggression: 0.1,
    reactions: {
      gunfire: { flee: 6, film: 2, cower: 2 },
      aimed_at: { hands_up: 7, flee: 3 },
      bumped: { ignore: 6, shout: 4 },
      vehicle_near_miss: { dive_aside: 6, film: 2, shout: 2 },
      own_vehicle_stolen: { film: 4, call_police: 4, shout: 2 },
      fight_nearby: { film: 8, gawk: 2 },
      explosion: { flee: 6, film: 4 },
      body_seen: { film: 4, call_police: 4, flee: 2 },
    },
    reportsCrimeChance: 0.55,
    moneyCarried: [2, 50],
    armedChance: 0,
    weapon: null,
    walkSpeed: 1.4,
    activities: { walk: 5, phone_scroll: 4, stand_chat: 3, sit: 2 },
    voice: {
      pitch: 'high',
      lines: {
        bump: ['Whoa, main character over here.', 'I was texting! That is basically driving!', 'Okay. Rude. Noted. Posted.'],
        fear: ['I have a midterm! I cannot be a statistic!', 'Is this live? Am I live?', 'Do not shoot, I am in debt!'],
        anger: ['You are so getting clipped and captioned!', 'I have followers! Eleven of them!', 'My thesis is about people like you!'],
      },
    },
  },

  dock_worker: {
    id: 'dock_worker',
    name: 'Dock Worker',
    description: 'Stevedores and crane crews of Puerto Tamarindo in high-visibility vests. Strong backs, short tempers, union rules.',
    appearance: {
      sexes: { female: 1, male: 4 },
      ageBands: { young_adult: 3, adult: 5, middle_aged: 3 },
      heightRange: [1.62, 1.96],
      builds: { average: 3, athletic: 4, heavy: 4 },
      skinTones: everySkinTone(),
      hairStyles: { female: ['ponytail', 'bun', 'braids', 'short_crop'], male: ['buzz', 'shaved', 'bald', 'short_crop'] },
      hairColors: ['#16120F', '#2E2019', '#4F3524', '#8F8E8B'],
      facialHair: { none: 2, stubble: 3, short_beard: 3, full_beard: 1, moustache: 1 },
      outfits: [
        { weight: 6, sex: 'any', top: { piece: 'vest', colors: ['#E8E23A', '#F28C28'], secondaryColors: ['#2F4A6B', '#5C6166', '#26262B'] }, bottom: { piece: 'cargo', colors: ['#3A3D40', '#2F4A6B', '#5C4A3A'] }, shoes: { piece: 'boots', colors: ['#3A2A1E', '#1A1A1C'] }, accessories: [{ piece: 'hard_hat', colors: ['#F2C230', '#F2F0E8', '#F28C28'], chance: 0.7 }, { piece: 'gloves', colors: ['#C98A3A', '#3A3D40'], chance: 0.6 }] },
        { weight: 3, sex: 'any', top: { piece: 'tee', colors: ['#2F4A6B', '#5C6166', '#26262B', '#3D6C7A'] }, bottom: { piece: 'cargo', colors: ['#3A3D40', '#5C4A3A'] }, shoes: { piece: 'boots', colors: ['#3A2A1E'] }, accessories: [{ piece: 'cap', colors: ['#2F4A6B', '#26262B'], chance: 0.5 }, { piece: 'gloves', colors: ['#C98A3A'], chance: 0.4 }, { piece: 'bandana', colors: ['#1F9AA0', '#C8372D'], chance: 0.2 }] },
      ],
    },
    districts: ['puerto_tamarindo', 'barrio_hierro', 'los_pantanos'],
    hours: [5, 22],
    rainBehaviour: 'ignore',
    temperament: 'hot_headed',
    courage: 0.75,
    aggression: 0.6,
    reactions: {
      gunfire: { flee: 5, cower: 3, shout: 2 },
      aimed_at: { hands_up: 6, shout: 4 },
      bumped: { shout: 5, fight: 4, ignore: 1 },
      vehicle_near_miss: { shout: 8, dive_aside: 2 },
      own_vehicle_stolen: { fight: 6, shout: 4 },
      fight_nearby: { gawk: 5, fight: 3, shout: 2 },
      explosion: { flee: 6, cower: 4 },
      body_seen: { gawk: 6, call_police: 2, flee: 2 },
    },
    reportsCrimeChance: 0.15,
    moneyCarried: [20, 140],
    armedChance: 0,
    weapon: null,
    walkSpeed: 1.3,
    activities: { walk: 4, stand_chat: 4, carry_load: 3, lean: 2, sit: 1 },
    voice: {
      pitch: 'low',
      lines: {
        bump: ['Watch it. I lift things heavier than you for breakfast.', 'You lost? Customs is that way.', 'That is a hard-hat area, and you are in it.'],
        fear: ['This is not in the contract!', 'Union rep! I want my union rep!', 'I saw nothing! I never see anything!'],
        anger: ['Come here and say that to the forklift!', 'You want a problem? I am on break, I have time!', 'Clock out, tough guy!'],
      },
    },
  },

  factory_worker: {
    id: 'factory_worker',
    name: 'Factory Worker',
    description: 'Shift workers from the bottling plant and the workshops of Barrio Hierro, lunch tin in hand, eyes on the clock.',
    appearance: {
      sexes: { female: 2, male: 3 },
      ageBands: { young_adult: 3, adult: 5, middle_aged: 4, senior: 1 },
      heightRange: [1.55, 1.92],
      builds: { slim: 2, average: 5, athletic: 2, heavy: 3 },
      skinTones: everySkinTone(),
      hairStyles: { female: ['bun', 'ponytail', 'braids', 'bob'], male: ['short_crop', 'buzz', 'bald', 'side_part', 'curly_short'] },
      hairColors: ['#16120F', '#2E2019', '#4F3524', '#6E4428', '#8F8E8B'],
      facialHair: { none: 4, stubble: 3, moustache: 2, short_beard: 1 },
      outfits: [
        { weight: 6, sex: 'any', top: { piece: 'button_shirt', colors: ['#4E6E8E', '#6E7377', '#5C4A3A', '#3B6B4B'] }, bottom: { piece: 'cargo', colors: ['#3A3D40', '#34404F', '#5C4A3A'] }, shoes: { piece: 'boots', colors: ['#3A2A1E', '#1A1A1C'] }, accessories: [{ piece: 'cap', colors: ['#3A3D40', '#8A4B2F'], chance: 0.4 }, { piece: 'gloves', colors: ['#C98A3A'], chance: 0.3 }, { piece: 'hard_hat', colors: ['#F2F0E8', '#F2C230'], chance: 0.2 }] },
        { weight: 4, sex: 'any', top: { piece: 'tee', colors: ['#8C8F93', '#2F4A6B', '#8A4B2F', '#F2F0E8'] }, bottom: { piece: 'jeans', colors: ['#34404F', '#1E2430'] }, shoes: { piece: 'boots', colors: ['#3A2A1E'] }, accessories: [{ piece: 'cap', colors: ['#3A3D40'], chance: 0.4 }, { piece: 'backpack', colors: ['#3A3D40'], chance: 0.3 }] },
      ],
    },
    districts: ['centro', 'la_marisma', 'puerto_tamarindo', 'barrio_hierro', 'los_pantanos'],
    hours: [5, 23],
    rainBehaviour: 'hurry',
    temperament: 'calm',
    courage: 0.5,
    aggression: 0.3,
    reactions: {
      gunfire: { flee: 7, cower: 3 },
      aimed_at: { hands_up: 8, shout: 2 },
      bumped: { shout: 5, ignore: 4, fight: 1 },
      vehicle_near_miss: { shout: 6, dive_aside: 4 },
      own_vehicle_stolen: { shout: 5, fight: 3, call_police: 2 },
      fight_nearby: { gawk: 7, shout: 2, flee: 1 },
      explosion: { flee: 7, cower: 3 },
      body_seen: { call_police: 4, gawk: 4, flee: 2 },
    },
    reportsCrimeChance: 0.3,
    moneyCarried: [15, 120],
    armedChance: 0,
    weapon: null,
    walkSpeed: 1.4,
    activities: { walk: 6, stand_chat: 3, sit: 2, lean: 2 },
    voice: {
      pitch: 'mid',
      lines: {
        bump: ['Twelve hours on my feet and now this.', 'Careful. That lunch is all I have going today.', 'Other side of the line, friend.'],
        fear: ['I do not get paid enough to be here!', 'Shift is over! Shift is very over!', 'Tell the foreman I quit!'],
        anger: ['You are lucky I am tired!', 'I work for a living, what do you do?', 'One more step and it is overtime!'],
      },
    },
  },

  mechanic: {
    id: 'mechanic',
    name: 'Mechanic',
    description: 'Grease to the elbows, a rag in the back pocket. Can tell what you did to that car by the sound, and will say so.',
    appearance: {
      sexes: { female: 1, male: 3 },
      ageBands: { young_adult: 3, adult: 5, middle_aged: 3, senior: 1 },
      heightRange: [1.58, 1.93],
      builds: { slim: 2, average: 4, athletic: 3, heavy: 3 },
      skinTones: everySkinTone(),
      hairStyles: { female: ['ponytail', 'bun', 'braids', 'short_crop'], male: ['buzz', 'short_crop', 'bald', 'curly_short', 'slick_back'] },
      hairColors: ['#16120F', '#2E2019', '#4F3524', '#6E4428', '#8F8E8B'],
      facialHair: { none: 2, stubble: 4, moustache: 1, goatee: 1, short_beard: 2 },
      outfits: [
        { weight: 6, sex: 'any', top: { piece: 'button_shirt', colors: ['#2F4A6B', '#5C6166', '#2E4A3A'] }, bottom: { piece: 'cargo', colors: ['#2F4A6B', '#5C6166', '#2E4A3A'] }, shoes: { piece: 'boots', colors: ['#2E2A27', '#3A2A1E'] }, accessories: [{ piece: 'cap', colors: ['#26262B', '#C8372D', '#E0A526'], chance: 0.5 }, { piece: 'gloves', colors: ['#26262B', '#C98A3A'], chance: 0.5 }, { piece: 'bandana', colors: ['#C8372D', '#E2772B'], chance: 0.3 }] },
        { weight: 4, sex: 'any', top: { piece: 'tank', colors: ['#F2F0E8', '#8C8F93', '#26262B'] }, bottom: { piece: 'cargo', colors: ['#2F4A6B', '#3A3D40'] }, shoes: { piece: 'boots', colors: ['#2E2A27'] }, accessories: [{ piece: 'bandana', colors: ['#C8372D', '#E2772B'], chance: 0.4 }, { piece: 'gloves', colors: ['#26262B'], chance: 0.4 }, { piece: 'cap', colors: ['#26262B'], chance: 0.3 }] },
      ],
    },
    districts: ['la_marisma', 'puerto_tamarindo', 'las_lomas', 'barrio_hierro', 'los_pantanos'],
    hours: [7, 20],
    rainBehaviour: 'ignore',
    temperament: 'bold',
    courage: 0.65,
    aggression: 0.4,
    reactions: {
      gunfire: { flee: 5, cower: 5 },
      aimed_at: { hands_up: 7, shout: 3 },
      bumped: { shout: 6, ignore: 3, fight: 1 },
      vehicle_near_miss: { shout: 8, dive_aside: 2 },
      own_vehicle_stolen: { fight: 5, shout: 5 },
      fight_nearby: { gawk: 7, shout: 3 },
      explosion: { flee: 6, cower: 4 },
      body_seen: { gawk: 5, call_police: 3, flee: 2 },
    },
    reportsCrimeChance: 0.2,
    moneyCarried: [20, 180],
    armedChance: 0.1,
    weapon: 'tire_iron',
    walkSpeed: 1.3,
    activities: { walk: 4, lean: 3, stand_chat: 3, inspect_vehicle: 3 },
    voice: {
      pitch: 'low',
      lines: {
        bump: ['Hey! These hands are precision instruments.', 'You walk like you drive.', 'That will buff out. You will not.'],
        fear: ['Not the garage! The lift is rented!', 'I only fix them, I do not ask!', 'Easy! I have a wrench and no plan!'],
        anger: ['I heard that clutch from here! Shame on you!', 'Come back and I will rotate more than your tyres!', 'You are a walking warranty claim!'],
      },
    },
  },

  hotel_staff: {
    id: 'hotel_staff',
    name: 'Hotel Staff',
    description: 'Valets, bellhops, croupiers on a break and household staff of the hills: uniformed, polite and quick to call security.',
    appearance: {
      sexes: { female: 1, male: 1 },
      ageBands: { young_adult: 5, adult: 4, middle_aged: 2 },
      heightRange: [1.56, 1.9],
      builds: { slim: 4, average: 5, athletic: 2, heavy: 1 },
      skinTones: everySkinTone(),
      hairStyles: { female: ['bun', 'ponytail', 'bob', 'braids'], male: ['side_part', 'short_crop', 'buzz', 'slick_back'] },
      hairColors: ['#16120F', '#2E2019', '#4F3524', '#6E4428'],
      facialHair: { none: 8, moustache: 1, stubble: 1 },
      outfits: [
        { weight: 5, sex: 'any', top: { piece: 'vest', colors: ['#12545C', '#7A1F3D', '#2B3442'], secondaryColors: ['#F2F0E8'] }, bottom: { piece: 'suit_trousers', colors: ['#1C1C1F', '#2B3442'] }, shoes: { piece: 'loafers', colors: ['#1A1A1C'] }, accessories: [{ piece: 'badge', colors: ['#C9A24A'], chance: 0.9 }, { piece: 'tie', colors: ['#C9A24A', '#1C1C1F'], chance: 0.5 }, { piece: 'gloves', colors: ['#F2F0E8'], chance: 0.2 }] },
        { weight: 4, sex: 'any', top: { piece: 'polo', colors: ['#F2F0E8', '#7FD6C8', '#F6A6B2'] }, bottom: { piece: 'chinos', colors: ['#B9A47A', '#2B3442', '#EDEAE2'] }, shoes: { piece: 'sneakers', colors: ['#F2F0E8'] }, accessories: [{ piece: 'badge', colors: ['#C9A24A', '#F2F0E8'], chance: 0.9 }, { piece: 'cap', colors: ['#F2F0E8', '#2B3442'], chance: 0.3 }] },
        { weight: 2, sex: 'female', top: { piece: 'button_shirt', colors: ['#F2F0E8'] }, bottom: { piece: 'skirt', colors: ['#1C1C1F', '#12545C'] }, shoes: { piece: 'heels', colors: ['#1A1A1C'] }, accessories: [{ piece: 'badge', colors: ['#C9A24A'], chance: 0.9 }, { piece: 'earrings', colors: ['#C9A24A'], chance: 0.4 }] },
      ],
    },
    districts: ['playa_dorada', 'centro', 'las_lomas', 'bahia_vista', 'isla_coral'],
    hours: [6, 24],
    rainBehaviour: 'hurry',
    temperament: 'timid',
    courage: 0.25,
    aggression: 0.05,
    reactions: {
      gunfire: { flee: 6, cower: 4 },
      aimed_at: { hands_up: 9, flee: 1 },
      bumped: { ignore: 8, shout: 2 },
      vehicle_near_miss: { dive_aside: 7, shout: 3 },
      own_vehicle_stolen: { call_police: 8, shout: 2 },
      fight_nearby: { call_police: 6, flee: 4 },
      explosion: { flee: 7, cower: 3 },
      body_seen: { call_police: 8, flee: 2 },
    },
    reportsCrimeChance: 0.8,
    moneyCarried: [10, 110],
    armedChance: 0,
    weapon: null,
    walkSpeed: 1.4,
    activities: { walk: 5, stand_post: 5, stand_chat: 2 },
    voice: {
      pitch: 'mid',
      lines: {
        bump: ['Pardon me. Are you a guest with us?', 'Apologies, entirely your fault, sir.', 'Mind the luggage. It is not mine to lose.'],
        fear: ['Security to the front! Security to anywhere!', 'The valet stand is closed! For ever!', 'Please, I am only seasonal!'],
        anger: ['I will remember you at checkout!', 'That is going on your room. I will find your room.', 'No tip is worth this!'],
      },
    },
  },

  high_roller: {
    id: 'high_roller',
    name: 'High Roller',
    description: 'Casino regulars and their entourages: white blazers, gold watches and the calm of people who have never waited for anything.',
    appearance: {
      sexes: { female: 1, male: 1 },
      ageBands: { young_adult: 3, adult: 5, middle_aged: 3, senior: 1 },
      heightRange: [1.58, 1.93],
      builds: { slim: 4, average: 4, athletic: 2, heavy: 2 },
      skinTones: everySkinTone(),
      hairStyles: { female: ['long_straight', 'long_wavy', 'bun', 'bob'], male: ['slick_back', 'side_part', 'short_crop', 'bald'] },
      hairColors: ['#16120F', '#2E2019', '#4F3524', '#CDAA6E', '#8F8E8B', '#7C3A22'],
      facialHair: { none: 4, stubble: 3, goatee: 1, short_beard: 2 },
      outfits: [
        { weight: 5, sex: 'male', top: { piece: 'blazer', colors: ['#F1E9D8', '#E6C9B8', '#CFE3EA', '#1C1C1F'], secondaryColors: ['#1C1C1F', '#F2F0E8', '#12545C'] }, bottom: { piece: 'chinos', colors: ['#F1E9D8', '#1C1C1F', '#2B3442'] }, shoes: { piece: 'loafers', colors: ['#8A5A3A', '#1A1A1C', '#F2F0E8'] }, accessories: [{ piece: 'watch', colors: ['#C9A24A'], chance: 0.9 }, { piece: 'sunglasses', colors: ['#1E1E20', '#6B4E2A'], chance: 0.6 }, { piece: 'chain', colors: ['#C9A24A'], chance: 0.5 }] },
        { weight: 5, sex: 'female', top: { piece: 'dress_top', colors: ['#C9A24A', '#1C1C1F', '#B8252C', '#1F6B57', '#F1E9D8'] }, bottom: { piece: 'dress', colors: ['#C9A24A', '#1C1C1F', '#B8252C', '#1F6B57', '#F1E9D8'] }, shoes: { piece: 'heels', colors: ['#C9A24A', '#1A1A1C', '#F2F0E8'] }, accessories: [{ piece: 'earrings', colors: ['#C9A24A', '#EDEAE2'], chance: 0.8 }, { piece: 'watch', colors: ['#C9A24A'], chance: 0.6 }, { piece: 'sunglasses', colors: ['#1E1E20'], chance: 0.5 }] },
        { weight: 2, sex: 'male', top: { piece: 'button_shirt', colors: ['#1C1C1F', '#F2F0E8', '#7A1F3D'] }, bottom: { piece: 'suit_trousers', colors: ['#1C1C1F', '#F1E9D8'] }, shoes: { piece: 'loafers', colors: ['#1A1A1C'] }, accessories: [{ piece: 'watch', colors: ['#C9A24A'], chance: 0.9 }, { piece: 'chain', colors: ['#C9A24A'], chance: 0.6 }] },
      ],
    },
    districts: ['playa_dorada', 'centro', 'las_lomas', 'bahia_vista', 'isla_coral'],
    hours: [12, 4],
    rainBehaviour: 'shelter',
    temperament: 'calm',
    courage: 0.3,
    aggression: 0.2,
    reactions: {
      gunfire: { flee: 6, cower: 4 },
      aimed_at: { hands_up: 8, shout: 2 },
      bumped: { shout: 7, ignore: 3 },
      vehicle_near_miss: { shout: 6, dive_aside: 4 },
      own_vehicle_stolen: { call_police: 7, shout: 3 },
      fight_nearby: { gawk: 5, call_police: 3, flee: 2 },
      explosion: { flee: 8, cower: 2 },
      body_seen: { call_police: 6, flee: 4 },
    },
    reportsCrimeChance: 0.7,
    moneyCarried: [500, 3000],
    armedChance: 0,
    weapon: null,
    walkSpeed: 1.2,
    activities: { stroll: 5, stand_chat: 4, phone_call: 3 },
    voice: {
      pitch: 'mid',
      lines: {
        bump: ['Careful. This jacket is worth more than your car.', 'I am on a streak. Do not touch me.', 'Do you mind? I am being seen.'],
        fear: ['Take the chips! They are not even mine!', 'I fold! I fold!', 'Put it on my tab! All of it!'],
        anger: ['I know the owner! Personally! Mostly!', 'You just cost me a table minimum!', 'I will have you comped straight out of town!'],
      },
    },
  },

  yacht_owner: {
    id: 'yacht_owner',
    name: 'Yacht Owner',
    description: 'Blazers, boat shoes and strong views on mooring fees. Every one of them has the harbour master on speed dial.',
    appearance: {
      sexes: { female: 2, male: 3 },
      ageBands: { adult: 2, middle_aged: 5, senior: 4 },
      heightRange: [1.58, 1.9],
      builds: { slim: 2, average: 4, heavy: 4 },
      skinTones: ['#F3D9C6', '#E8C3A4', '#D9A982', '#C68B63', '#8D5A3B'],
      hairStyles: { female: ['bob', 'bun', 'long_wavy', 'side_part'], male: ['side_part', 'slick_back', 'bald', 'short_crop'] },
      hairColors: ['#8F8E8B', '#D8D5CE', '#CDAA6E', '#A98455', '#4F3524'],
      facialHair: { none: 6, moustache: 2, short_beard: 2 },
      outfits: [
        { weight: 5, sex: 'male', top: { piece: 'polo', colors: ['#F2F0E8', '#1F2A44', '#F0B7A6', '#CFE3EA'] }, bottom: { piece: 'shorts', colors: ['#F2F0E8', '#E58E7A', '#1F2A44', '#B9A47A'] }, shoes: { piece: 'loafers', colors: ['#8A5A3A', '#1F2A44'] }, accessories: [{ piece: 'sunglasses', colors: ['#1E1E20', '#6B4E2A'], chance: 0.8 }, { piece: 'cap', colors: ['#F2F0E8', '#1F2A44'], chance: 0.4 }, { piece: 'watch', colors: ['#C9A24A', '#B8BCC2'], chance: 0.8 }] },
        { weight: 4, sex: 'female', top: { piece: 'button_shirt', colors: ['#F2F0E8', '#CFE3EA', '#F1D9B5'] }, bottom: { piece: 'chinos', colors: ['#F2F0E8', '#1F2A44', '#E58E7A'] }, shoes: { piece: 'sandals', colors: ['#C9A24A', '#8A5A3A'] }, accessories: [{ piece: 'sunglasses', colors: ['#1E1E20', '#F2F0E8'], chance: 0.8 }, { piece: 'sun_hat', colors: ['#F4F0E6', '#E8D9B0'], chance: 0.4 }, { piece: 'earrings', colors: ['#C9A24A', '#EDEAE2'], chance: 0.6 }, { piece: 'watch', colors: ['#C9A24A'], chance: 0.6 }] },
        { weight: 2, sex: 'male', top: { piece: 'blazer', colors: ['#1F2A44'], secondaryColors: ['#F2F0E8'] }, bottom: { piece: 'chinos', colors: ['#F2F0E8', '#E58E7A'] }, shoes: { piece: 'loafers', colors: ['#8A5A3A'] }, accessories: [{ piece: 'cap', colors: ['#F2F0E8'], chance: 0.5 }, { piece: 'watch', colors: ['#C9A24A'], chance: 0.9 }, { piece: 'sunglasses', colors: ['#1E1E20'], chance: 0.6 }] },
      ],
    },
    districts: ['las_lomas', 'bahia_vista', 'isla_coral'],
    hours: [8, 22],
    rainBehaviour: 'shelter',
    temperament: 'calm',
    courage: 0.2,
    aggression: 0.15,
    reactions: {
      gunfire: { flee: 6, cower: 4 },
      aimed_at: { hands_up: 9, flee: 1 },
      bumped: { shout: 8, ignore: 2 },
      vehicle_near_miss: { shout: 7, dive_aside: 3 },
      own_vehicle_stolen: { call_police: 9, shout: 1 },
      fight_nearby: { call_police: 7, flee: 3 },
      explosion: { flee: 8, cower: 2 },
      body_seen: { call_police: 8, flee: 2 },
    },
    reportsCrimeChance: 0.9,
    moneyCarried: [150, 1200],
    armedChance: 0,
    weapon: null,
    walkSpeed: 1.1,
    activities: { stroll: 5, stand_chat: 4, phone_call: 3, sit: 1 },
    voice: {
      pitch: 'low',
      lines: {
        bump: ['This is a private promenade. Spiritually.', 'Mind the deck shoes.', 'Are you crew? You walk like crew.'],
        fear: ['Take the tender! Leave the yacht!', 'I have a slip! I pay for a slip!', 'Somebody radio the harbour master!'],
        anger: ['I will raise this with the commodore!', 'You are trespassing on my view!', 'My boat is longer than your entire future!'],
      },
    },
  },

  club_goer: {
    id: 'club_goer',
    name: 'Club Goer',
    description: 'The night crowd outside Club Salitre and Lux Marea: dressed up, loud, brave on two drinks and reckless on three.',
    appearance: {
      sexes: { female: 1, male: 1 },
      ageBands: { young_adult: 7, adult: 3 },
      heightRange: [1.56, 1.93],
      builds: { slim: 5, average: 3, athletic: 3, heavy: 1 },
      skinTones: everySkinTone(),
      hairStyles: { female: ['long_straight', 'long_wavy', 'ponytail', 'braids', 'bob', 'afro_short'], male: ['short_crop', 'slick_back', 'buzz', 'curly_short', 'afro_short'] },
      hairColors: ['#16120F', '#2E2019', '#4F3524', '#CDAA6E', '#C9457F', '#2FA7A0', '#D9631E'],
      facialHair: { none: 4, stubble: 4, goatee: 1, short_beard: 1 },
      outfits: [
        { weight: 5, sex: 'female', top: { piece: 'dress_top', colors: ['#FF4FA3', '#1C1C1F', '#3DE0D0', '#C9A24A', '#B8252C'] }, bottom: { piece: 'dress', colors: ['#FF4FA3', '#1C1C1F', '#3DE0D0', '#C9A24A', '#B8252C'] }, shoes: { piece: 'heels', colors: ['#1A1A1C', '#C9A24A', '#F2F0E8'] }, accessories: [{ piece: 'earrings', colors: ['#C9A24A', '#B8BCC2'], chance: 0.7 }, { piece: 'chain', colors: ['#C9A24A'], chance: 0.4 }, { piece: 'watch', colors: ['#C9A24A'], chance: 0.3 }] },
        { weight: 3, sex: 'female', top: { piece: 'tank', colors: ['#1C1C1F', '#F2F0E8', '#FF4FA3'] }, bottom: { piece: 'skirt', colors: ['#1C1C1F', '#B8252C', '#C9A24A'] }, shoes: { piece: 'heels', colors: ['#1A1A1C'] }, accessories: [{ piece: 'earrings', colors: ['#C9A24A', '#B8BCC2'], chance: 0.7 }, { piece: 'chain', colors: ['#B8BCC2'], chance: 0.4 }] },
        { weight: 5, sex: 'male', top: { piece: 'button_shirt', colors: ['#1C1C1F', '#6E2A2E', '#F2F0E8', '#1F2A44'] }, bottom: { piece: 'jeans', colors: ['#1E2430', '#34404F'] }, shoes: { piece: 'loafers', colors: ['#1A1A1C', '#3A2A1E'] }, accessories: [{ piece: 'chain', colors: ['#C9A24A', '#B8BCC2'], chance: 0.5 }, { piece: 'watch', colors: ['#C9A24A', '#B8BCC2'], chance: 0.5 }, { piece: 'sunglasses', colors: ['#1E1E20'], chance: 0.2 }] },
        { weight: 3, sex: 'male', top: { piece: 'bomber', colors: ['#1C1C1F', '#5B2E91', '#12545C'], secondaryColors: ['#F2F0E8', '#1C1C1F'] }, bottom: { piece: 'jeans', colors: ['#1E2430'] }, shoes: { piece: 'sneakers', colors: ['#F2F0E8', '#1A1A1C'] }, accessories: [{ piece: 'chain', colors: ['#C9A24A'], chance: 0.5 }, { piece: 'earrings', colors: ['#B8BCC2'], chance: 0.3 }] },
      ],
    },
    districts: ['playa_dorada', 'centro', 'la_marisma', 'bahia_vista'],
    hours: [20, 5],
    rainBehaviour: 'shelter',
    temperament: 'bold',
    courage: 0.55,
    aggression: 0.45,
    reactions: {
      gunfire: { flee: 7, cower: 2, film: 1 },
      aimed_at: { hands_up: 6, flee: 3, shout: 1 },
      bumped: { shout: 6, fight: 2, ignore: 2 },
      vehicle_near_miss: { shout: 7, dive_aside: 3 },
      own_vehicle_stolen: { shout: 5, fight: 3, call_police: 2 },
      fight_nearby: { film: 5, gawk: 3, fight: 2 },
      explosion: { flee: 8, film: 2 },
      body_seen: { film: 3, call_police: 4, flee: 3 },
    },
    reportsCrimeChance: 0.35,
    moneyCarried: [30, 320],
    armedChance: 0,
    weapon: null,
    walkSpeed: 1.2,
    activities: { stand_chat: 5, queue: 4, dance: 3, stroll: 2, phone_scroll: 2 },
    voice: {
      pitch: 'high',
      lines: {
        bump: ['Hey! These shoes are a whole paycheck!', 'The queue starts behind me. Way behind me.', 'Watch it, I am fragile and expensive.'],
        fear: ['I am not even on the list!', 'This is the worst afterparty!', 'Somebody hold my drink! And me!'],
        anger: ['Say that again when I can stand straight!', 'You and me! Outside! We are outside? Then here!', 'I know the doorman!'],
      },
    },
  },

  hillside_resident: {
    id: 'hillside_resident',
    name: 'Hillside Resident',
    description: 'The villa owners of Las Lomas and Isla Coral, out with the dog or the decorator. Call the police the way other people check the time.',
    appearance: {
      sexes: { female: 1, male: 1 },
      ageBands: { young_adult: 1, adult: 4, middle_aged: 4, senior: 3 },
      heightRange: [1.56, 1.9],
      builds: { slim: 4, average: 5, athletic: 2, heavy: 2 },
      skinTones: everySkinTone(),
      hairStyles: { female: ['bob', 'ponytail', 'long_wavy', 'bun'], male: ['side_part', 'short_crop', 'bald', 'slick_back'] },
      hairColors: ['#16120F', '#4F3524', '#6E4428', '#CDAA6E', '#8F8E8B', '#D8D5CE'],
      facialHair: { none: 6, stubble: 2, short_beard: 2 },
      outfits: [
        { weight: 5, sex: 'male', top: { piece: 'polo', colors: ['#F2F0E8', '#C9D2C0', '#9CCBEA', '#F0B7A6'] }, bottom: { piece: 'chinos', colors: ['#D9C2A5', '#F2F0E8', '#2B3442'] }, shoes: { piece: 'loafers', colors: ['#8A5A3A', '#3A2A1E'] }, accessories: [{ piece: 'watch', colors: ['#C9A24A', '#B8BCC2'], chance: 0.7 }, { piece: 'sunglasses', colors: ['#1E1E20'], chance: 0.5 }] },
        { weight: 5, sex: 'female', top: { piece: 'button_shirt', colors: ['#F2F0E8', '#EBDCD0', '#C9D2C0'] }, bottom: { piece: 'chinos', colors: ['#F2F0E8', '#D9C2A5', '#B5533C'] }, shoes: { piece: 'sandals', colors: ['#8A5A3A', '#C9A24A'] }, accessories: [{ piece: 'sunglasses', colors: ['#1E1E20', '#6B4E2A'], chance: 0.5 }, { piece: 'earrings', colors: ['#C9A24A'], chance: 0.4 }, { piece: 'sun_hat', colors: ['#F4F0E6'], chance: 0.2 }, { piece: 'watch', colors: ['#C9A24A'], chance: 0.6 }] },
        { weight: 3, sex: 'any', top: { piece: 'tee', colors: ['#F2F0E8', '#C9D2C0', '#B24C8E', '#8C8F93'] }, bottom: { piece: 'shorts', colors: ['#2B3442', '#D9C2A5'] }, shoes: { piece: 'sneakers', colors: ['#F2F0E8'] }, accessories: [{ piece: 'cap', colors: ['#F2F0E8', '#2B3442'], chance: 0.3 }, { piece: 'sunglasses', colors: ['#1E1E20'], chance: 0.5 }, { piece: 'watch', colors: ['#B8BCC2'], chance: 0.6 }] },
      ],
    },
    districts: ['centro', 'las_lomas', 'isla_coral'],
    hours: [7, 22],
    rainBehaviour: 'shelter',
    temperament: 'timid',
    courage: 0.15,
    aggression: 0.05,
    reactions: {
      gunfire: { flee: 7, cower: 3 },
      aimed_at: { hands_up: 9, flee: 1 },
      bumped: { shout: 6, ignore: 4 },
      vehicle_near_miss: { shout: 5, dive_aside: 5 },
      own_vehicle_stolen: { call_police: 9, shout: 1 },
      fight_nearby: { call_police: 8, flee: 2 },
      explosion: { flee: 8, cower: 2 },
      body_seen: { call_police: 9, flee: 1 },
    },
    reportsCrimeChance: 0.9,
    moneyCarried: [60, 500],
    armedChance: 0,
    weapon: null,
    walkSpeed: 1.2,
    activities: { stroll: 6, stand_chat: 3, phone_call: 3 },
    voice: {
      pitch: 'mid',
      lines: {
        bump: ['Excuse me, do you live on this hill?', 'The association will hear about this.', 'You are standing on a heritage kerb.'],
        fear: ['I am calling the private police and the regular police!', 'Not near the hedges! They are imported!', 'Take the gardener! No, wait, he is good!'],
        anger: ['Your car is lowering the property values!', 'This is a gated feeling, if not a gated street!', 'I have photographs! Of everything! Always!'],
      },
    },
  },

  swamp_local: {
    id: 'swamp_local',
    name: 'Swamp Local',
    description: 'People of Los Pantanos: shrimp boots, sun-faded caps and a firm belief that the city ends at the highway. Some are armed; all are unimpressed.',
    appearance: {
      sexes: { female: 2, male: 3 },
      ageBands: { young_adult: 2, adult: 4, middle_aged: 4, senior: 2 },
      heightRange: [1.56, 1.96],
      builds: { slim: 3, average: 3, athletic: 2, heavy: 4 },
      skinTones: ['#F3D9C6', '#E8C3A4', '#D9A982', '#C68B63', '#8D5A3B', '#6B4129'],
      hairStyles: { female: ['ponytail', 'long_wavy', 'braids', 'bun'], male: ['bald', 'buzz', 'long_wavy', 'ponytail', 'short_crop'] },
      hairColors: ['#4F3524', '#6E4428', '#A98455', '#CDAA6E', '#8F8E8B', '#16120F'],
      facialHair: { none: 1, stubble: 3, moustache: 1, goatee: 1, short_beard: 2, full_beard: 3 },
      outfits: [
        { weight: 5, sex: 'any', top: { piece: 'open_shirt_over_tee', colors: ['#8A4B2F', '#5F7F4E', '#3F5F7F', '#6E2A2E'], secondaryColors: ['#D8CFB8', '#8C8F93'] }, bottom: { piece: 'jeans', colors: ['#34404F', '#5E7C99'] }, shoes: { piece: 'boots', colors: ['#D8CFB8', '#3A2A1E'] }, accessories: [{ piece: 'cap', colors: ['#5F7F4E', '#C8372D', '#3A3D40', '#D9C24A'], chance: 0.7 }, { piece: 'sunglasses', colors: ['#1E1E20'], chance: 0.2 }] },
        { weight: 4, sex: 'any', top: { piece: 'tank', colors: ['#D8CFB8', '#8C8F93', '#5F7F4E'] }, bottom: { piece: 'cargo', colors: ['#6F7F6A', '#5C4A3A', '#3A3D40'] }, shoes: { piece: 'boots', colors: ['#D8CFB8', '#3A2A1E'] }, accessories: [{ piece: 'cap', colors: ['#5F7F4E', '#3A3D40'], chance: 0.6 }, { piece: 'bandana', colors: ['#C8372D', '#D9C24A'], chance: 0.2 }, { piece: 'gloves', colors: ['#C98A3A'], chance: 0.1 }] },
        { weight: 2, sex: 'any', top: { piece: 'tee', colors: ['#D8CFB8', '#8A4B2F', '#3A3D40'] }, bottom: { piece: 'shorts', colors: ['#6F7F6A', '#5E7C99'] }, shoes: { piece: 'boots', colors: ['#D8CFB8'] }, accessories: [{ piece: 'cap', colors: ['#5F7F4E', '#C8372D'], chance: 0.7 }, { piece: 'sun_hat', colors: ['#E8D9B0'], chance: 0.2 }] },
      ],
    },
    districts: ['puerto_tamarindo', 'barrio_hierro', 'los_pantanos'],
    hours: [5, 23],
    rainBehaviour: 'ignore',
    temperament: 'hot_headed',
    courage: 0.8,
    aggression: 0.55,
    reactions: {
      gunfire: { fight: 3, flee: 4, cower: 3 },
      aimed_at: { hands_up: 4, fight: 3, shout: 3 },
      bumped: { shout: 6, fight: 3, ignore: 1 },
      vehicle_near_miss: { shout: 9, dive_aside: 1 },
      own_vehicle_stolen: { fight: 7, shout: 3 },
      fight_nearby: { gawk: 6, fight: 3, shout: 1 },
      explosion: { flee: 5, cower: 3, gawk: 2 },
      body_seen: { gawk: 7, call_police: 1, flee: 2 },
    },
    reportsCrimeChance: 0.1,
    moneyCarried: [5, 110],
    armedChance: 0.25,
    weapon: 'pistol',
    walkSpeed: 1.2,
    activities: { stand_chat: 4, sit: 4, walk: 3, lean: 3, fish: 2 },
    voice: {
      pitch: 'low',
      lines: {
        bump: ['Road is wide enough for both of us. Barely.', 'You from the city? You walk like the city.', 'Careful. That boot has been places.'],
        fear: ['Lord, not on a fishing day!', 'I knew I should have stayed on the porch!', 'Gator would have been politer!'],
        anger: ['Folks disappear out here, you know. From embarrassment.', 'Get off my road! It is everybody\'s road, but especially mine!', 'I got a cousin, a truck and a free afternoon!'],
      },
    },
  },

  fisher: {
    id: 'fisher',
    name: 'Fisher',
    description: 'Shrimpers, pier anglers and deckhands with a bucket and a thousand-yard stare. Have seen worse weather than you.',
    appearance: {
      sexes: { female: 1, male: 3 },
      ageBands: { young_adult: 1, adult: 3, middle_aged: 5, senior: 4 },
      heightRange: [1.55, 1.9],
      builds: { slim: 4, average: 4, heavy: 3 },
      skinTones: ['#D9A982', '#C68B63', '#B07A52', '#8D5A3B', '#6B4129', '#4A2C1D'],
      hairStyles: { female: ['ponytail', 'bun', 'braids', 'short_crop'], male: ['bald', 'short_crop', 'buzz', 'ponytail', 'curly_short'] },
      hairColors: ['#16120F', '#4F3524', '#8F8E8B', '#D8D5CE'],
      facialHair: { none: 2, stubble: 4, moustache: 1, short_beard: 2, full_beard: 2 },
      outfits: [
        { weight: 5, sex: 'any', top: { piece: 'button_shirt', colors: ['#9CCBEA', '#D8CFB8', '#7FB3A8', '#E8B84A'] }, bottom: { piece: 'shorts', colors: ['#B9A47A', '#5E7C99', '#3A3D40'] }, shoes: { piece: 'sandals', colors: ['#6B4A2E', '#2A2A2E'] }, accessories: [{ piece: 'cap', colors: ['#F2F0E8', '#2F4A6B', '#C8372D'], chance: 0.6 }, { piece: 'sunglasses', colors: ['#1E1E20'], chance: 0.4 }] },
        { weight: 4, sex: 'any', top: { piece: 'vest', colors: ['#B9A47A', '#6F7F6A'], secondaryColors: ['#F2F0E8', '#9CCBEA', '#8C8F93'] }, bottom: { piece: 'cargo', colors: ['#6F7F6A', '#5C4A3A', '#3A3D40'] }, shoes: { piece: 'boots', colors: ['#D8CFB8', '#3A2A1E'] }, accessories: [{ piece: 'sun_hat', colors: ['#E8D9B0', '#B9A47A'], chance: 0.5 }, { piece: 'gloves', colors: ['#F28C28', '#C98A3A'], chance: 0.2 }, { piece: 'sunglasses', colors: ['#1E1E20'], chance: 0.3 }] },
      ],
    },
    districts: ['la_marisma', 'puerto_tamarindo', 'bahia_vista', 'barrio_hierro', 'los_pantanos'],
    hours: [4.5, 20],
    rainBehaviour: 'ignore',
    temperament: 'calm',
    courage: 0.6,
    aggression: 0.2,
    reactions: {
      gunfire: { cower: 5, flee: 4, ignore: 1 },
      aimed_at: { hands_up: 8, shout: 2 },
      bumped: { ignore: 7, shout: 3 },
      vehicle_near_miss: { shout: 6, dive_aside: 4 },
      own_vehicle_stolen: { shout: 7, call_police: 3 },
      fight_nearby: { gawk: 7, ignore: 3 },
      explosion: { cower: 5, flee: 5 },
      body_seen: { call_police: 4, gawk: 6 },
    },
    reportsCrimeChance: 0.25,
    moneyCarried: [5, 90],
    armedChance: 0,
    weapon: null,
    walkSpeed: 1.1,
    activities: { fish: 6, sit: 3, carry_load: 2, walk: 2, stand_chat: 2 },
    voice: {
      pitch: 'low',
      lines: {
        bump: ['You scared the fish. Both of them.', 'Mind the bucket. Dinner is in the bucket.', 'Slow down. Tide is not until six.'],
        fear: ['Seen worse. Not much worse.', 'Not the boat! I still owe on the boat!', 'I am too old to swim for it!'],
        anger: ['I gut things for a living, son.', 'That was my good line!', 'May your nets come up full of boots!'],
      },
    },
  },

  // ---- People in uniform (no district mix: posted by the restricted area and the island) -------
  // `bodies` names the character bases they wear by sex (the first that is built), `uniformKit`
  // the kit of pedestrians/uniformKit.js, `sentry` that they stand their ground on a post.
  base_guard: uniformed({
    id: 'base_guard',
    name: 'Air guard soldier',
    description: 'Guardia Aérea de Marazul: olive-grey fatigues under a dark olive carrier, a sand-yellow band on the helmet and the left arm. Says two sentences and then stops talking.',
    sexes: { male: 1 },
    bodies: { male: ['swat_officer'] },
    uniformKit: 'air_guard',
    outfit: { top: { piece: 'vest', colors: ['#43492F'], secondaryColors: ['#6E7259'] }, bottom: { piece: 'cargo', colors: ['#6E7259'] }, shoes: { piece: 'boots', colors: ['#2A2622'] } },
    sentry: true, armedChance: 1, weapon: 'smg', courage: 0.95, aggression: 0.7, health: 140,
    lines: { bump: ['Step back.', 'Hands where I can see them.'], fear: ['Contact! Contact at my post!'], anger: ['Restricted area. Turn around.', 'Last warning. Leave now.'] },
  }),
  base_ground_crew: uniformed({
    id: 'base_ground_crew',
    name: 'Air guard ground crew',
    description: 'Line mechanics of Punta Garza: grey-blue coveralls, a yellow-green marshalling vest and orange ear defenders. They know every panel of the aircraft and nothing about who flies it.',
    sexes: { male: 1 },
    bodies: { male: ['corriente_stevedore'] },
    uniformKit: 'air_guard_crew',
    outfit: { top: { piece: 'vest', colors: ['#C6D43C'], secondaryColors: ['#56636E'] }, bottom: { piece: 'cargo', colors: ['#56636E'] }, shoes: { piece: 'boots', colors: ['#2E2A27'] } },
    sentry: false, armedChance: 0, weapon: 'fists', courage: 0.4, aggression: 0.1, health: 100,
    lines: { bump: ['Mind the chocks, sir.', 'Careful, the pitot covers are off.'], fear: ['Get the bowser clear!', 'Down! Behind the tug!'], anger: ['Nobody touches that airframe!', 'Who signed you onto this apron?'] },
  }),
  base_officer: uniformed({
    id: 'base_officer',
    name: 'Air guard duty officer',
    description: 'The duty officer of the day: sand dress shirt, dark green trousers and a peaked cap with a gold band. Reads the schedule twice and the faces never.',
    sexes: { male: 3, female: 1 },
    bodies: { male: ['police_officer_m'], female: ['police_officer_f'] },
    uniformKit: 'air_guard_officer',
    outfit: { top: { piece: 'button_shirt', colors: ['#BDB08A'] }, bottom: { piece: 'suit_trousers', colors: ['#3B4636'] }, shoes: { piece: 'loafers', colors: ['#1A1A1C'] } },
    sentry: true, armedChance: 1, weapon: 'pistol', courage: 0.8, aggression: 0.4, health: 110,
    lines: { bump: ['Watch your step, Lieutenant.', 'Steady there.'], fear: ['Sound the alarm!'], anger: ['You are not on my schedule!', 'Guards! To me!'] },
  }),
  norvast_soldier: uniformed({
    id: 'norvast_soldier',
    name: 'Norvast soldier',
    description: 'Federasi Norvast island garrison: slate blue-grey fatigues under a dark slate carrier, a rust-red band on the helmet and on both arms. Has been staring at the same sea for two years.',
    sexes: { male: 1 },
    bodies: { male: ['swat_officer'] },
    uniformKit: 'norvast',
    outfit: { top: { piece: 'vest', colors: ['#3A4452'], secondaryColors: ['#667A8E'] }, bottom: { piece: 'cargo', colors: ['#667A8E'] }, shoes: { piece: 'boots', colors: ['#3A2A1E'] } },
    sentry: true, armedChance: 1, weapon: 'assault_rifle', courage: 0.95, aggression: 0.8, health: 140,
    lines: { bump: ['Back. Now.', 'This shore is closed.'], fear: ['Alarm! Alarm at the hangar!'], anger: ['Halt! Federasi ground!', 'Drop it or we fire!'] },
  }),
});

/**
 * A person in uniform: one fixed outfit on a named base, awake at any hour, no district. A
 * sentry answers trouble with his weapon and never runs; the others react like workers.
 */
function uniformed(spec) {
  const stand = { ignore: 1 };
  const fight = { fight: 1 };
  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    appearance: {
      sexes: spec.sexes,
      ageBands: { young_adult: 4, adult: 5, middle_aged: 1 },
      heightRange: [1.7, 1.9],
      builds: { average: 4, athletic: 5 },
      skinTones: everySkinTone(),
      hairStyles: { female: ['bun', 'ponytail'], male: ['buzz', 'short_crop'] },
      hairColors: ['#16120F', '#2E2019', '#4F3524'],
      facialHair: { none: 8, stubble: 2 },
      outfits: [{ weight: 1, sex: 'any', ...spec.outfit, accessories: [] }],
    },
    bodies: spec.bodies,
    uniformKit: spec.uniformKit,
    sentry: spec.sentry,
    districts: [],
    hours: [0, 24],
    rainBehaviour: 'ignore',
    temperament: spec.sentry ? 'bold' : 'calm',
    courage: spec.courage,
    aggression: spec.aggression,
    health: spec.health,
    reactions: spec.sentry
      ? { gunfire: fight, aimed_at: fight, bumped: stand, vehicle_near_miss: stand, own_vehicle_stolen: fight, fight_nearby: fight, explosion: stand, body_seen: stand }
      : { gunfire: { flee: 5, cower: 5 }, aimed_at: { hands_up: 8, cower: 2 }, bumped: stand, vehicle_near_miss: { dive_aside: 1 }, own_vehicle_stolen: { shout: 1 }, fight_nearby: { flee: 6, cower: 4 }, explosion: { flee: 6, cower: 4 }, body_seen: { flee: 1 } },
    reportsCrimeChance: 0,
    moneyCarried: [0, 40],
    armedChance: spec.armedChance,
    weapon: spec.weapon,
    walkSpeed: 1.3,
    activities: { walk: 2, stand_chat: 2 },
    voice: { pitch: 'low', lines: spec.lines },
  };
}

/**
 * Things a pedestrian can notice, with how far away they notice them (metres) and whether the
 * player must be the cause.
 * @type {Readonly<Record<string, {id: string, radius: number, note: string}>>}
 */
export const PEDESTRIAN_STIMULI = freezeCatalog({
  gunfire: { id: 'gunfire', radius: 60, note: 'A shot fired or a bullet impact nearby.' },
  aimed_at: { id: 'aimed_at', radius: 18, note: 'A weapon pointed at them for more than half a second.' },
  bumped: { id: 'bumped', radius: 1, note: 'Shoved or run into on foot.' },
  vehicle_near_miss: { id: 'vehicle_near_miss', radius: 4, note: 'A vehicle passing within reach faster than 8 m/s, or mounting the pavement.' },
  own_vehicle_stolen: { id: 'own_vehicle_stolen', radius: 30, note: 'Pulled from their car, or watching it driven off.' },
  fight_nearby: { id: 'fight_nearby', radius: 20, note: 'A melee fight or an arrest within sight.' },
  explosion: { id: 'explosion', radius: 90, note: 'An explosion or a burning vehicle.' },
  body_seen: { id: 'body_seen', radius: 25, note: 'Someone lying knocked out in the street.' },
});

/**
 * What a pedestrian can do about it.
 * @type {Readonly<Record<string, string>>}
 */
export const PEDESTRIAN_REACTIONS = freezeCatalog({
  ignore: 'Carry on, perhaps with a look.',
  shout: 'Stop, turn and play an anger line.',
  gawk: 'Stop and watch from a safe distance.',
  film: 'Hold up a phone and record; counts as a witness who will report.',
  flee: 'Run directly away, play a fear line, calm down after 12 seconds out of sight.',
  cower: 'Crouch with hands over head where they stand.',
  hands_up: 'Raise hands and freeze; drops carried money if robbed.',
  dive_aside: 'Jump out of the vehicle\'s path.',
  call_police: 'Phone the crime in: the report lands after 4 seconds unless interrupted.',
  fight: 'Attack the offender with fists, or with the archetype\'s weapon if carrying it.',
});

/**
 * Idle activities, for the animation and crowd systems.
 * @type {Readonly<Record<string, string>>}
 */
export const PEDESTRIAN_ACTIVITIES = freezeCatalog({
  walk: 'Walk the pavement graph with a destination.',
  stroll: 'Walk slowly, pausing to look around.',
  jog: 'Run a loop at jogging pace.',
  stretch: 'Stand and stretch between runs.',
  sit: 'Sit on a bench, wall or step.',
  lie_down: 'Lie on a towel or lounger (beach and pools only).',
  lean: 'Lean on a wall, rail or vehicle.',
  stand_chat: 'Stand in a group of two or three and talk.',
  stand_post: 'Stand at a door, desk or valet stand.',
  phone_call: 'Walk or stand while talking on a phone.',
  phone_scroll: 'Stand or sit looking at a phone.',
  take_photo: 'Stop and photograph a landmark or the view.',
  window_shop: 'Stand facing a shopfront.',
  queue: 'Wait in a line outside a venue.',
  dance: 'Dance on the spot near music.',
  play_music: 'Play an instrument at a busking spot.',
  play_dominoes: 'Sit at a table game in a park.',
  tend_stall: 'Stand behind a stall or cart.',
  carry_load: 'Walk carrying a crate, bucket or sack.',
  inspect_vehicle: 'Stand at an open bonnet.',
  fish: 'Stand or sit at the water\'s edge with a rod.',
});

/**
 * Which archetypes sit behind the wheel of ambient traffic, by vehicle class (weights).
 * @type {Readonly<Record<string, Record<string, number>>>}
 */
export const TRAFFIC_DRIVER_ARCHETYPES = freezeCatalog({
  compact: { student: 3, office_worker: 3, market_vendor: 2, old_town_elder: 1, hotel_staff: 1 },
  sedan: { office_worker: 4, factory_worker: 2, old_town_elder: 1, hillside_resident: 1, beach_tourist: 2 },
  luxury: { executive: 5, high_roller: 3, yacht_owner: 2 },
  sports: { high_roller: 4, executive: 2, club_goer: 3, yacht_owner: 1 },
  super: { high_roller: 6, executive: 2, yacht_owner: 2 },
  muscle: { mechanic: 4, swamp_local: 3, club_goer: 2, factory_worker: 1 },
  classic: { beach_tourist: 3, old_town_elder: 2, yacht_owner: 2, surfer: 2, street_musician: 1 },
  suv: { hillside_resident: 4, executive: 2, yacht_owner: 2, office_worker: 2 },
  offroad: { swamp_local: 5, fisher: 2, mechanic: 2, surfer: 1 },
  pickup: { swamp_local: 3, mechanic: 3, dock_worker: 2, fisher: 2 },
  van: { market_vendor: 3, factory_worker: 3, hotel_staff: 2, dock_worker: 2 },
  truck: { dock_worker: 5, factory_worker: 4, swamp_local: 1 },
  bus: { factory_worker: 1 },
  service: { market_vendor: 2, old_town_elder: 2, office_worker: 1 },
  motorcycle: { student: 3, club_goer: 2, mechanic: 2, surfer: 1 },
  boat: { fisher: 4, yacht_owner: 3, beach_tourist: 2, surfer: 1 },
});

/** The eight skin tones of the shared appearance vocabulary. */
function everySkinTone() {
  return ['#F3D9C6', '#E8C3A4', '#D9A982', '#C68B63', '#B07A52', '#8D5A3B', '#6B4129', '#4A2C1D'];
}

/** The natural hair colours of the shared appearance vocabulary (no dyes). */
function naturalHairColors() {
  return ['#16120F', '#2E2019', '#4F3524', '#6E4428', '#7C3A22', '#A98455', '#CDAA6E', '#8F8E8B', '#D8D5CE'];
}

/** Recursively freezes a plain data tree so that no system can mutate the shared catalog. */
function freezeCatalog(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) freezeCatalog(value[key]);
  }
  return value;
}
