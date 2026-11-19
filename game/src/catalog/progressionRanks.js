// Progression in MARAZUL: the eleven reputation ranks (0 to 10) with their thresholds and what
// each unlocks, where reputation comes from, the statistics the game tracks, how the completion
// percentage is weighed, and the fun toggles opened by the epilogue. Plain frozen data, no imports.
//
// Reputation is shared by both leads and never goes down. The sixteen story missions pay 8,000
// in total, which reaches rank 7; ranks 8 to 10 need side activities. A mission's `minRank` in
// storyMissions.js and a weapon's `unlockRank` in weaponCatalog.js are rank numbers from here.
// Ids: weapons from weaponCatalog.js, activities from sideActivities.js, missions from
// storyMissions.js, upgrades from shopsAndProperties.js.

/**
 * The ranks, indexed by rank number.
 * @type {ReadonlyArray<object>}
 */
export const PROGRESSION_RANKS = freezeCatalog([
  { rank: 0, id: 'nobody', name: 'Nobody', reputation: 0, blurb: 'A tow driver and a fired inspector.', maxHealth: 100, maxArmor: 0, weapons: ['fists', 'tire_iron', 'pistol'], perks: [] },
  { rank: 1, id: 'known_on_the_block', name: 'Known on the Block', reputation: 250, blurb: 'The corner store stops charging you for coffee.', maxHealth: 100, maxArmor: 0, weapons: ['baseball_bat'], perks: ['Ammunition costs 5 percent less'] },
  { rank: 2, id: 'hired_hand', name: 'Hired Hand', reputation: 900, blurb: 'People with jobs know your number.', maxHealth: 100, maxArmor: 50, weapons: ['smg', 'pump_shotgun'], perks: ['Body armour is sold at gun shops', 'Garage vehicles are repaired on storage'] },
  { rank: 3, id: 'operator', name: 'Operator', reputation: 1700, blurb: 'You are mentioned in a meeting you were not invited to.', maxHealth: 110, maxArmor: 50, weapons: ['heavy_revolver', 'fire_bottle'], perks: ['Search timers run 10 percent faster'] },
  { rank: 4, id: 'name_in_the_port', name: 'A Name in the Port', reputation: 2600, blurb: 'The dockers lower their voices.', maxHealth: 110, maxArmor: 75, weapons: ['assault_rifle'], perks: ['Bribes cost 10 percent less', 'Third tier of engine upgrades'] },
  { rank: 5, id: 'a_problem', name: 'A Problem', reputation: 3800, blurb: 'Lemaire has a photograph of you on his desk.', maxHealth: 120, maxArmor: 75, weapons: ['sniper_rifle', 'grenade'], perks: ['Faction backup calls cost half'] },
  { rank: 6, id: 'the_other_house', name: 'The Other House', reputation: 5200, blurb: 'There are now two sides in Marazul, and one of them is you.', maxHealth: 120, maxArmor: 100, weapons: [], perks: ['Property income rises 10 percent', 'Resprays cost 20 percent less'] },
  { rank: 7, id: 'housebreaker', name: 'Housebreaker', reputation: 6200, blurb: 'The casino checks its own doors twice.', maxHealth: 130, maxArmor: 100, weapons: ['rocket_launcher'], perks: ['Sprint lasts 25 percent longer'] },
  { rank: 8, id: 'fixture', name: 'A Fixture', reputation: 8500, blurb: 'Tourists are told a version of you.', maxHealth: 140, maxArmor: 100, weapons: [], perks: ['Property income rises a further 10 percent', 'Taxi and courier pay rises 20 percent'] },
  { rank: 9, id: 'legend_of_the_gulf', name: 'Legend of the Gulf', reputation: 11000, blurb: 'Doña Charo dedicates a song.', maxHealth: 150, maxArmor: 125, weapons: [], perks: ['Ammunition costs 25 percent less', 'One star is ignored once per in-game day'] },
  { rank: 10, id: 'marazul_is_yours', name: 'Marazul Is Yours', reputation: 14000, blurb: 'Nobody holds the note on anything of yours.', maxHealth: 150, maxArmor: 150, weapons: [], perks: ['A gold tow truck at Tolliver Tow', 'Every shop gives 15 percent off'] },
]);

/** Where reputation comes from, besides the amounts written in each mission and activity. */
export const REPUTATION_SOURCES = freezeCatalog({
  storyMission: 'reward.reputation of the mission, once',
  missionReplay: 0,
  sideActivity: 'the reputation fields of the activity in sideActivities.js',
  medal: { bronze: 10, silver: 25, gold: 60 },
  loseWantedLevel: [0, 2, 5, 12, 25, 50],
  propertyBought: 40,
  firstTimeInDistrict: 15,
  uniqueVehicleDriven: 5,
  rankUpCashBonusPerRank: 1000,
  rankUpBanner: { seconds: 5, color: '#FFC53D', sound: 'rank_fanfare' },
});

/** The statistics the game tracks and shows in the pause menu. */
export const TRACKED_STATISTICS = freezeCatalog({
  time_played: stat('time_played', 'Time played', 'seconds', 'general'),
  completion_percent: stat('completion_percent', 'Completion', 'percent', 'general'),
  reputation: stat('reputation', 'Reputation', 'points', 'general'),
  time_as_dez: stat('time_as_dez', 'Time as Dez', 'seconds', 'general'),
  time_as_sol: stat('time_as_sol', 'Time as Sol', 'seconds', 'general'),
  missions_passed: stat('missions_passed', 'Missions passed', 'count', 'story'),
  missions_failed: stat('missions_failed', 'Mission attempts failed', 'count', 'story'),
  cash_earned: stat('cash_earned', 'Money earned', 'dollars', 'money'),
  cash_spent: stat('cash_spent', 'Money spent', 'dollars', 'money'),
  property_income: stat('property_income', 'Income from property', 'dollars', 'money'),
  properties_owned: stat('properties_owned', 'Properties owned', 'count', 'money'),
  distance_driven: stat('distance_driven', 'Distance driven', 'metres', 'travel'),
  distance_on_foot: stat('distance_on_foot', 'Distance on foot', 'metres', 'travel'),
  distance_by_boat: stat('distance_by_boat', 'Distance by boat', 'metres', 'travel'),
  distance_flown: stat('distance_flown', 'Distance flown', 'metres', 'travel'),
  top_speed: stat('top_speed', 'Top speed', 'metres_per_second', 'travel'),
  longest_jump: stat('longest_jump', 'Longest jump', 'metres', 'travel'),
  longest_drift: stat('longest_drift', 'Longest drift', 'metres', 'travel'),
  vehicles_stolen: stat('vehicles_stolen', 'Vehicles stolen', 'count', 'crime'),
  vehicles_destroyed: stat('vehicles_destroyed', 'Vehicles destroyed', 'count', 'crime'),
  vehicles_exported: stat('vehicles_exported', 'Vehicles exported', 'count', 'crime'),
  stars_earned: stat('stars_earned', 'Wanted stars earned', 'count', 'crime'),
  highest_wanted_level: stat('highest_wanted_level', 'Highest wanted level', 'stars', 'crime'),
  wanted_levels_lost: stat('wanted_levels_lost', 'Wanted levels lost', 'count', 'crime'),
  longest_pursuit: stat('longest_pursuit', 'Longest pursuit survived', 'seconds', 'crime'),
  times_busted: stat('times_busted', 'Times arrested', 'count', 'crime'),
  times_wasted: stat('times_wasted', 'Times hospitalised', 'count', 'crime'),
  resprays: stat('resprays', 'Resprays', 'count', 'crime'),
  shots_fired: stat('shots_fired', 'Shots fired', 'count', 'combat'),
  accuracy: stat('accuracy', 'Accuracy', 'percent', 'combat'),
  headshots: stat('headshots', 'Headshots', 'count', 'combat'),
  gang_members_defeated: stat('gang_members_defeated', 'Gang members defeated', 'count', 'combat'),
  rampages_passed: stat('rampages_passed', 'Rampages passed', 'count', 'combat'),
  fares_delivered: stat('fares_delivered', 'Taxi fares delivered', 'count', 'activities'),
  repo_orders_done: stat('repo_orders_done', 'Repo orders completed', 'count', 'activities'),
  parcels_delivered: stat('parcels_delivered', 'Parcels delivered', 'count', 'activities'),
  patients_delivered: stat('patients_delivered', 'Patients delivered', 'count', 'activities'),
  races_won: stat('races_won', 'Races won', 'count', 'activities'),
  gold_medals: stat('gold_medals', 'Gold medals', 'count', 'activities'),
  stunt_jumps_landed: stat('stunt_jumps_landed', 'Stunt jumps landed', 'count', 'activities'),
  golden_tiles_found: stat('golden_tiles_found', 'Golden tiles found', 'count', 'activities'),
  favourite_vehicle: stat('favourite_vehicle', 'Favourite vehicle', 'vehicle_id', 'general'),
  favourite_station: stat('favourite_station', 'Favourite radio station', 'station_id', 'general'),
});

/** How the completion percentage is weighed (the weights sum to 100). */
export const COMPLETION_WEIGHTS = freezeCatalog({
  storyMissions: 40,
  sideActivitiesCompleted: 25,
  goldenTiles: 10,
  stuntJumps: 5,
  propertiesOwned: 10,
  goldMedals: 5,
  ranksReached: 5,
  rewardAtHundredPercent: { cash: 500000, gift: 'Santángel\'s helicopter parked at Casa Caracola', title: 'For the Record' },
});

/**
 * Fun toggles, opened in the pause menu by the epilogue (feature fun_toggles). While any is on,
 * medals and statistics are not recorded; saving still works.
 */
export const FUN_TOGGLES = freezeCatalog({
  endless_golden_hour: { id: 'endless_golden_hour', name: 'Endless Golden Hour', effect: 'The clock stops at 18:50.' },
  never_wanted: { id: 'never_wanted', name: 'Friends in the Department', effect: 'No heat is ever added.' },
  always_five_stars: { id: 'always_five_stars', name: 'The Whole City', effect: 'The wanted level is held at five stars.' },
  bottomless_magazines: { id: 'bottomless_magazines', name: 'Bottomless Magazines', effect: 'Weapons never use ammunition.' },
  endless_nitro: { id: 'endless_nitro', name: 'Endless Nitro', effect: 'Nitro recharges instantly on every vehicle.' },
  low_gravity: { id: 'low_gravity', name: 'Low Tide Gravity', effect: 'Gravity is 40 percent of normal for vehicles and people.' },
  supercar_traffic: { id: 'supercar_traffic', name: 'Payday Traffic', effect: 'All traffic is sports cars and supercars.' },
  storm_now: { id: 'storm_now', name: 'Hurricane Season', effect: 'The weather is held at storm.' },
  iron_bumper: { id: 'iron_bumper', name: 'Iron Bumper', effect: 'The lead\'s vehicle takes no collision damage and shoves traffic aside.' },
});

/** Saving. */
export const SAVE_RULES = freezeCatalog({
  slots: 3,
  autosaveAfter: ['mission_passed', 'property_bought', 'rank_up', 'activity_completed'],
  manualSaveAt: 'the bed of any owned safehouse (or a motel room)',
  storage: 'localStorage key marazul.save.<slot>, JSON, versioned',
  saved: ['clock and weather', 'both leads: position, health, armour, outfit', 'cash and reputation', 'weapons and ammunition', 'missions passed', 'properties and stored vehicles with upgrades and paint', 'activity progress and medals', 'collectibles and jumps', 'statistics', 'faction attitudes', 'settings and bindings'],
  notSaved: ['wanted level', 'traffic and pedestrians', 'a vehicle left on the street'],
});

/** Builds one statistic entry. */
function stat(id, name, unit, category) {
  return { id, name, unit, category };
}

/** Recursively freezes a plain data tree so that no system can mutate the shared catalog. */
function freezeCatalog(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) freezeCatalog(value[key]);
  }
  return value;
}
