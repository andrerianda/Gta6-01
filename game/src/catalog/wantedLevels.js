// The wanted level of MARAZUL: five stars driven by a heat meter. This catalog gives the heat
// threshold of each star, the police units each star sends (ids from POLICE_UNITS in
// gangsAndFactions.js), their tactics, how the search phase and cooling down work, every way to
// lose the police and what it costs, and what happens when a lead is busted or wasted.
// Plain frozen data, no imports.
//
// Heat is added by the crimes in crimeCatalog.js. Distances in metres, times in seconds, money
// in whole dollars, clock time in game hours. Landmark and district ids come from
// cityDistricts.js, mission ids from storyMissions.js, character ids from storyCharacters.js.

/**
 * The six states of the wanted level, indexed by the number of stars (0 to 5).
 * @type {ReadonlyArray<object>}
 */
export const WANTED_LEVELS = freezeCatalog([
  {
    stars: 0, id: 'clean', name: 'Clean', heatThreshold: 0,
    dispatch: [], maxActiveUnits: 0, reinforceSeconds: null,
    tactics: ['patrol'], lethalForce: false, roadblocks: false, spikeStrips: false, helicopter: false,
    searchSeconds: 0, searchRadius: 0, bribeCost: 0, resprayCost: 300, pursuitSpeedFactor: 1, policeAccuracyMultiplier: 1,
    radioCall: null,
    hud: 'No stars shown.',
  },
  {
    stars: 1, id: 'noticed', name: 'Noticed', heatThreshold: 10,
    dispatch: [{ unit: 'beat_officer', max: 2 }, { unit: 'patrol_car', max: 1 }], maxActiveUnits: 2, reinforceSeconds: 20,
    tactics: ['approach', 'order_to_stop', 'arrest_on_foot', 'follow_vehicle'], lethalForce: false, roadblocks: false, spikeStrips: false, helicopter: false,
    searchSeconds: 18, searchRadius: 90, bribeCost: 400, resprayCost: 400, pursuitSpeedFactor: 0.92, policeAccuracyMultiplier: 0.8,
    radioCall: 'Dispatch, disturbance reported. Unit to take a look.',
    hud: 'One star. Officers try to arrest; they do not shoot unless shot at.',
  },
  {
    stars: 2, id: 'pursued', name: 'Pursued', heatThreshold: 30,
    dispatch: [{ unit: 'patrol_car', max: 3 }, { unit: 'beat_officer', max: 2 }, { unit: 'harbor_boat', max: 1 }], maxActiveUnits: 4, reinforceSeconds: 14,
    tactics: ['pursue', 'pit_manoeuvre', 'box_in', 'shoot_if_armed', 'arrest_at_gunpoint'], lethalForce: true, roadblocks: false, spikeStrips: false, helicopter: false,
    searchSeconds: 30, searchRadius: 140, bribeCost: 1200, resprayCost: 800, pursuitSpeedFactor: 1, policeAccuracyMultiplier: 0.9,
    radioCall: 'All units, suspect is fleeing. Pursuit authorised.',
    hud: 'Two stars. Patrol cars chase and ram; officers fire at an armed lead.',
  },
  {
    stars: 3, id: 'hunted', name: 'Hunted', heatThreshold: 60,
    dispatch: [{ unit: 'patrol_car', max: 3 }, { unit: 'pursuit_suv', max: 2 }, { unit: 'air_support', max: 1 }, { unit: 'harbor_boat', max: 2 }], maxActiveUnits: 6, reinforceSeconds: 10,
    tactics: ['pursue', 'ram', 'roadblock', 'helicopter_tracking', 'shoot_to_stop'], lethalForce: true, roadblocks: true, spikeStrips: false, helicopter: true,
    searchSeconds: 45, searchRadius: 200, bribeCost: 3500, resprayCost: 1500, pursuitSpeedFactor: 1.05, policeAccuracyMultiplier: 1,
    radioCall: 'Air One is up. Roadblocks on the avenues. Do not lose this one.',
    hud: 'Three stars. Pursuit SUVs, roadblocks on avenues and a helicopter that calls out your position.',
  },
  {
    stars: 4, id: 'tactical', name: 'Tactical Response', heatThreshold: 100,
    dispatch: [{ unit: 'pursuit_suv', max: 3 }, { unit: 'patrol_car', max: 2 }, { unit: 'tactical_team', max: 1 }, { unit: 'air_support', max: 1 }, { unit: 'harbor_boat', max: 2 }], maxActiveUnits: 8, reinforceSeconds: 8,
    tactics: ['ram', 'armoured_roadblock', 'spike_strip', 'tactical_dismount', 'helicopter_marksman', 'shoot_on_sight'], lethalForce: true, roadblocks: true, spikeStrips: true, helicopter: true,
    searchSeconds: 60, searchRadius: 260, bribeCost: 9000, resprayCost: 3000, pursuitSpeedFactor: 1.1, policeAccuracyMultiplier: 1.15,
    radioCall: 'Tactical is rolling. Spike strips at the bridge and the causeway.',
    hud: 'Four stars. The tactical van, spike strips, and a marksman in the helicopter.',
  },
  {
    stars: 5, id: 'manhunt', name: 'Citywide Manhunt', heatThreshold: 150,
    dispatch: [{ unit: 'tactical_team', max: 2 }, { unit: 'pursuit_suv', max: 4 }, { unit: 'patrol_car', max: 2 }, { unit: 'air_support', max: 1 }, { unit: 'harbor_boat', max: 3 }], maxActiveUnits: 10, reinforceSeconds: 6,
    tactics: ['ram', 'armoured_roadblock', 'spike_strip', 'tactical_dismount', 'flank', 'helicopter_marksman', 'close_bridges', 'shoot_on_sight'], lethalForce: true, roadblocks: true, spikeStrips: true, helicopter: true,
    searchSeconds: 90, searchRadius: 340, bribeCost: null, resprayCost: 6000, pursuitSpeedFactor: 1.15, policeAccuracyMultiplier: 1.3,
    radioCall: 'Every unit in Marazul: bridge and causeway are closed. Bring them in.',
    hud: 'Five stars. Everything the city has; the bridge and the causeway are blocked and nobody takes a bribe.',
  },
]);

/** How heat becomes stars, how stars are lost, and the search phase. */
export const WANTED_RULES = freezeCatalog({
  maxStars: 5,
  maxHeat: 180,
  heatThresholds: [0, 10, 30, 60, 100, 150],
  starsNeverDropDuringPursuit: true,
  heatDecayPerSecondWhenClean: 0.5,
  heatFloorPerStar: [0, 10, 30, 60, 100, 150],
  witness: {
    civilianReportSeconds: 6,
    guardReportSeconds: 2,
    officerReportSeconds: 0,
    civilianReportChance: 0.6,
    reportInterruptedBy: ['witness_fled_out_of_range', 'witness_knocked_out', 'witness_aimed_at_within_4m'],
    sightNeedsLineOfSight: true,
    nightSightMultiplier: 0.7,
    rainHearingMultiplier: 0.75,
    descriptionRemembered: ['vehicle_model_and_colour', 'outfit'],
    friendlyTurf: { faction: 'vecinos_marisma', attitudeAtLeast: 40, ignoredCategories: ['traffic', 'property', 'theft'] },
  },
  pursuit: {
    lostSightSeconds: 6,
    lastKnownPositionMarker: true,
    unitDespawnDistance: 420,
    arrestOnlyAtStarsAtMost: 2,
    roadblockSpacing: 450,
    roadblockAvenuesOnly: true,
    spikeStripTyreDamage: 1,
    helicopterSpotRadius: 110,
    helicopterLosesSightUnder: ['parking_structure', 'tunnel', 'dense_trees', 'building_interior'],
    waterEscapeSendsBoats: true,
    gangTurfDelaySeconds: { puerto_tamarindo: 8, barrio_hierro: 8, los_pantanos: 18 },
  },
  search: {
    description: 'When no unit has seen the lead for lostSightSeconds the stars blink and a search circle of searchRadius is drawn round the last known position. Units sweep it with cones of vision shown on the minimap. Staying unseen for searchSeconds clears every star; being seen resumes the pursuit and restarts the timer.',
    coneRange: 45,
    coneDegrees: 70,
    helicopterConeRange: 110,
    outsideCircleTimeMultiplier: 1.5,
    changedVehicleUnseenTimeMultiplier: 1.4,
    changedOutfitUnseenTimeMultiplier: 1.4,
    hidingInGarageClearsAtStarsAtMost: 3,
    starsBlinkHz: 2,
  },
  waysToLose: {
    evade: { id: 'evade', name: 'Stay out of sight', description: 'Outlast the search timer.', maxStars: 5, cost: 0 },
    respray: { id: 'respray', name: 'Respray', description: 'Drive into a paint and body shop with no unit in sight for 4 seconds. Clears every star; the car leaves in a new colour with new plates.', maxStars: 5, unseenSeconds: 4, costFromLevel: 'resprayCost', atLandmarkKind: 'paint_and_body_shop' },
    change_outfit: { id: 'change_outfit', name: 'Change clothes', description: 'Change outfit unseen at a clothing store or wardrobe: removes two stars.', maxStars: 3, starsRemoved: 2, atLandmarkKinds: ['clothing_store', 'safehouse_apartment', 'beach_house', 'mansion'] },
    bribe: { id: 'bribe', name: 'Call La Notaria', description: 'A phone call to La Notaria makes a report disappear. Clears every star after 5 seconds on the line; not offered at five stars or during a mission that forces heat.', maxStars: 4, contact: 'ximena_robles', unlockedBy: 'm03_stamped_and_sealed', callSeconds: 5, costFromLevel: 'bribeCost', cooldownSeconds: 300 },
    safehouse: { id: 'safehouse', name: 'Lie low', description: 'Enter an owned safehouse unseen and save: clears up to three stars and advances the clock six hours.', maxStars: 3, unseenSeconds: 4, advanceHours: 6 },
  },
  hud: { starColor: '#FFC53D', starBlinkColor: '#7A7F87', flashScreenEdgeAtStars: 3, sirenAudioAtStars: 1, minimapSearchCircleColor: '#3D7BE0' },
});

/** What happens when the police arrest a lead. */
export const BUSTED_RULES = freezeCatalog({
  title: 'CUFFED',
  when: 'At one or two stars an officer within 2.5 m holds the lead at gunpoint for 2 seconds while the lead is on foot and slower than 1 m/s, or opens the door of a vehicle slower than 2 m/s. At three stars and above the police no longer arrest.',
  holdSeconds: 2,
  arrestRange: 2.5,
  escapeByMoving: true,
  finePercentOfCash: 10,
  fineMinimum: 100,
  fineMaximum: 5000,
  losesAmmunition: true,
  keepsWeapons: ['fists', 'tire_iron', 'baseball_bat'],
  losesArmor: true,
  vehicleImpounded: true,
  impoundFee: 250,
  clockAdvanceHours: 6,
  missionFails: true,
  wantedCleared: true,
  solPaperworkDiscount: 0.25,
  releaseAt: {
    playa_dorada: 'precinto_playa', bahia_vista: 'precinto_playa', isla_coral: 'precinto_playa',
    centro: 'mpd_headquarters', la_marisma: 'mpd_headquarters', las_lomas: 'mpd_headquarters',
    puerto_tamarindo: 'harbor_patrol_station', barrio_hierro: 'harbor_patrol_station', los_pantanos: 'harbor_patrol_station',
  },
  lines: ['Released pending paperwork. There is always paperwork.', 'Bail posted. Ammunition confiscated.', 'The desk sergeant kept your change.'],
});

/** What happens when a lead's health reaches zero. */
export const WASTED_RULES = freezeCatalog({
  title: 'FLATLINED',
  when: 'Health reaches zero. The camera pulls up and slows for 3 seconds before the fade.',
  slowMotionSeconds: 3,
  billPercentOfCash: 8,
  billMinimum: 150,
  billMaximum: 4000,
  privateClinicMultiplier: 1.5,
  losesAmmunition: false,
  losesArmor: true,
  respawnHealthFraction: 1,
  clockAdvanceHours: 8,
  missionFails: true,
  wantedCleared: true,
  solPaperworkDiscount: 0.25,
  wakeAt: {
    centro: 'hospital_santa_brisa', la_marisma: 'hospital_santa_brisa', puerto_tamarindo: 'hospital_santa_brisa', barrio_hierro: 'hospital_santa_brisa', los_pantanos: 'hospital_santa_brisa', playa_dorada: 'hospital_santa_brisa',
    las_lomas: 'clinica_las_lomas', bahia_vista: 'clinica_las_lomas', isla_coral: 'clinica_las_lomas',
  },
  lines: ['Discharged against medical advice.', 'The bill is itemised. The coffee was not free.', 'You were lucky. The car was not.'],
});

/** Recursively freezes a plain data tree so that no system can mutate the shared catalog. */
function freezeCatalog(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) freezeCatalog(value[key]);
  }
  return value;
}
