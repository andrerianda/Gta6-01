// The kinds and the common tags of the entities in MARAZUL's entity registry. A kind says what a
// thing is and never changes; tags say what it is doing or who it belongs to and may change.

/** What an entity is. Every entity has exactly one kind. */
export const ENTITY_KINDS = Object.freeze({
  CHARACTER: 'character',     // the player, pedestrians, police officers, gang members
  VEHICLE: 'vehicle',         // cars, trucks, motorcycles, boats, helicopters
  PICKUP: 'pickup',           // cash, weapons, health, armour, collectibles
  PROP: 'prop',               // knockable street objects once they are loose
  PROJECTILE: 'projectile',   // thrown explosives, rockets
  MARKER: 'marker',           // mission starts, checkpoints, shop doors, waypoints
});

/** Tags shared between systems. A system may add its own; these are the ones others query. */
export const ENTITY_TAGS = Object.freeze({
  PLAYER: 'player',               // the character or vehicle the player controls right now
  PEDESTRIAN: 'pedestrian',       // an ambient civilian
  POLICE: 'police',               // an officer or a police vehicle
  GANG: 'gang',                   // a member or vehicle of a gang (data.factionId says which)
  TRAFFIC: 'traffic',             // an ambient vehicle driving the lane graph
  PARKED: 'parked',               // a vehicle with nobody in it
  EMERGENCY: 'emergency',         // siren vehicles: traffic gives way
  WATERCRAFT: 'watercraft',
  AIRCRAFT: 'aircraft',
  ARMED: 'armed',                 // carrying a drawn weapon
  HOSTILE: 'hostile',             // attacking the player
  WITNESS: 'witness',             // can report a crime it sees
  DEAD: 'dead',                   // a body or a wreck, kept for a while
  MISSION: 'mission',             // owned by the running mission: never despawned by streaming
  PERSISTENT: 'persistent',       // survives distance culling (the player's last car)
});

/** The list of kind values. */
export const ENTITY_KIND_LIST = Object.freeze(Object.values(ENTITY_KINDS));
