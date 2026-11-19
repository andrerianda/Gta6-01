// Every crime MARAZUL recognises: the label the HUD flashes, the heat it adds to the wanted
// level (wantedLevels.js turns heat into stars), whether somebody has to see or hear it before
// it counts, and from how far. Plain frozen data, no imports.
//
// `heat` is added once per offence. `needsWitness` true: the heat is only added when a witness
// inside seenRadius (with line of sight) or heardRadius finishes reporting it (see
// WANTED_RULES.witness); false: the police know at once. `minStars` is a floor the wanted level
// jumps to at once. `repeatSeconds` is the shortest time before the same crime adds heat again.
// Distances in metres, times in seconds.

/**
 * The crimes keyed by id.
 * @type {Readonly<Record<string, object>>}
 */
export const CRIME_CATALOG = freezeCatalog({
  reckless_driving: crime('reckless_driving', 'Reckless driving', 'traffic', 1, true, 40, 0, 0, 8, 'Running a red light past a unit, driving on the pavement or against traffic. Only officers report it.', { officersOnly: true }),
  street_racing: crime('street_racing', 'Street racing', 'traffic', 3, true, 60, 90, 0, 30, 'Taking part in a street race within sight of a unit.', { officersOnly: true }),
  hit_and_run: crime('hit_and_run', 'Hit and run', 'traffic', 2, true, 45, 60, 0, 4, 'Hitting an occupied vehicle harder than 6 m/s and driving on.'),
  property_damage: crime('property_damage', 'Property damage', 'property', 1, true, 35, 50, 0, 3, 'Flattening street furniture, fences, stalls or shop windows.'),
  vehicle_theft: crime('vehicle_theft', 'Vehicle theft', 'theft', 4, true, 35, 70, 0, 0, 'Breaking into a parked vehicle. The alarm (heardRadius) is the usual witness; Dez\'s Hot Hands perk silences it.'),
  boat_theft: crime('boat_theft', 'Boat theft', 'theft', 5, true, 40, 0, 0, 0, 'Taking a moored boat that is not yours.'),
  carjacking: crime('carjacking', 'Carjacking', 'theft', 8, true, 45, 30, 0, 0, 'Pulling a driver out of a vehicle.'),
  steal_police_vehicle: crime('steal_police_vehicle', 'Stolen police vehicle', 'police', 25, false, 0, 0, 2, 0, 'Driving off in a cruiser, police SUV, tactical van, patrol boat or helicopter. Every unit knows at once.'),
  steal_emergency_vehicle: crime('steal_emergency_vehicle', 'Stolen ambulance', 'theft', 12, false, 0, 0, 1, 0, 'Taking an ambulance; paramedic runs started from a hospital do not count.'),
  shoplifting: crime('shoplifting', 'Walked out without paying', 'theft', 4, true, 15, 0, 0, 0, 'Leaving a shop with unpaid goods.'),
  store_robbery: crime('store_robbery', 'Armed robbery', 'theft', 16, false, 0, 0, 2, 0, 'Holding up a register. The clerk presses the alarm unless knocked out first, in which case it needs a witness like any assault.'),
  trespassing: crime('trespassing', 'Trespassing', 'trespass', 6, true, 30, 0, 0, 20, 'Being seen by a guard inside a restricted zone: the container terminal at night, casino back rooms, a police station yard, a private estate.', { guardsOnly: true }),
  military_trespass: crime('military_trespass', 'Military trespass', 'trespass', 14, false, 0, 0, 2, 15, 'Forcing the gate of Base Aérea Punta Garza, crossing its fence, landing inside or flying low over it without clearance. The guards report it themselves: two stars at once, more the longer it lasts (police/restricted/trespassEscalation.js).'),
  brandishing: crime('brandishing', 'Brandishing a weapon', 'weapons', 3, true, 30, 0, 0, 10, 'Aiming a firearm at a person.'),
  discharging_firearm: crime('discharging_firearm', 'Shots fired', 'weapons', 6, true, 60, 140, 0, 5, 'Firing a gun where anyone can hear it.'),
  assault: crime('assault', 'Assault', 'violence', 5, true, 35, 20, 0, 0, 'Striking a civilian with fists.'),
  armed_assault: crime('armed_assault', 'Armed assault', 'violence', 9, true, 40, 30, 0, 0, 'Striking a civilian with a melee weapon, or wounding one with a gun.'),
  vehicular_assault: crime('vehicular_assault', 'Pedestrian struck', 'violence', 10, true, 50, 40, 0, 0, 'Running a person down.'),
  homicide: crime('homicide', 'Homicide', 'violence', 18, true, 50, 60, 1, 0, 'Killing a civilian by any means.'),
  gang_violence: crime('gang_violence', 'Gang violence', 'violence', 6, true, 40, 80, 0, 0, 'Killing a gang or syndicate member. Counted at a third of a homicide: the city is not sentimental.'),
  attack_emergency_crew: crime('attack_emergency_crew', 'Attack on a rescue crew', 'violence', 15, false, 0, 0, 1, 0, 'Hurting a paramedic or firefighter.'),
  resisting_arrest: crime('resisting_arrest', 'Resisting arrest', 'police', 6, false, 0, 0, 0, 12, 'Breaking away from an officer who has started an arrest.'),
  ramming_police_vehicle: crime('ramming_police_vehicle', 'Police vehicle rammed', 'police', 8, false, 0, 0, 0, 3, 'Hitting a police vehicle harder than 5 m/s.'),
  assault_on_officer: crime('assault_on_officer', 'Assault on an officer', 'police', 20, false, 0, 0, 2, 0, 'Striking or wounding an officer or a Vigía Azul guard on duty.'),
  shooting_at_officer: crime('shooting_at_officer', 'Shots fired at police', 'police', 28, false, 0, 0, 3, 4, 'Bullets passing within 3 m of an officer.'),
  officer_down: crime('officer_down', 'Officer down', 'police', 45, false, 0, 0, 3, 0, 'Killing an officer.'),
  destroy_vehicle: crime('destroy_vehicle', 'Vehicle destroyed', 'property', 10, true, 80, 200, 0, 0, 'Blowing up or burning out a vehicle.'),
  destroy_police_vehicle: crime('destroy_police_vehicle', 'Police vehicle destroyed', 'police', 30, false, 0, 0, 3, 0, 'Destroying a police car, van or boat.'),
  arson: crime('arson', 'Arson', 'explosives', 14, true, 70, 60, 0, 6, 'Setting people, vehicles or buildings alight with a fire bottle.'),
  explosion: crime('explosion', 'Explosion', 'explosives', 22, true, 120, 280, 2, 4, 'Setting off a grenade or a rocket in the city.'),
  helicopter_down: crime('helicopter_down', 'Aircraft shot down', 'police', 70, false, 0, 0, 5, 0, 'Bringing down the police or the news helicopter.'),
});

/** The crime categories, in the order the statistics screen lists them. */
export const CRIME_CATEGORIES = freezeCatalog({
  traffic: { id: 'traffic', name: 'Traffic', color: '#E0B13C' },
  property: { id: 'property', name: 'Property', color: '#C98A3A' },
  theft: { id: 'theft', name: 'Theft', color: '#D9631E' },
  trespass: { id: 'trespass', name: 'Trespass', color: '#8F8E8B' },
  weapons: { id: 'weapons', name: 'Weapons', color: '#C8372D' },
  violence: { id: 'violence', name: 'Violence', color: '#A3262B' },
  explosives: { id: 'explosives', name: 'Explosives', color: '#F28C28' },
  police: { id: 'police', name: 'Against the police', color: '#1D4E7A' },
});

/** How the HUD announces a crime and how repeated crimes combine. */
export const CRIME_REPORTING = freezeCatalog({
  hudFlashSeconds: 2.5,
  hudFlashColor: '#FFC53D',
  showOnlyWhenHeatAdded: true,
  comboWindowSeconds: 10,
  comboHeatMultiplierStep: 0.1,
  comboHeatMultiplierMax: 1.5,
  missionSuppressed: 'A mission step with noHeatFor or a wanted cap limits what its scripted crimes add.',
  inOwnedPropertyHeatMultiplier: 0.5,
  duringStormHeardRadiusMultiplier: 0.6,
});

/** Builds one crime entry. */
function crime(id, name, category, heat, needsWitness, seenRadius, heardRadius, minStars, repeatSeconds, description, extra) {
  return { id, name, category, heat, needsWitness, seenRadius, heardRadius, minStars, repeatSeconds, description, officersOnly: false, guardsOnly: false, ...(extra || {}) };
}

/** Recursively freezes a plain data tree so that no system can mutate the shared catalog. */
function freezeCatalog(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) freezeCatalog(value[key]);
  }
  return value;
}
