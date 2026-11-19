// Pedestrians: the crowd on the pavements, by district archetype and hour, walking, talking,
// sitting, shopping and reacting (diving from cars, fleeing shots, cowering, gawking, fighting,
// witnessing crimes), and the drivers seated in traffic's cars near the camera (carjacks haul
// them out). Implementation: crowdSimulation.js and its parts (crowdPopulation, crowdSteering,
// crowdResponses, seatedDrivers, walkingRoutes, pedestrianBodies, crowdShowcase).
// Members: people, count, stimulate, witness, setDensity, refill, removePerson(id,
//   {whenUnseen}), seatedDriverOf(vehicleId) -> {walker} | null (player's carjack), simulation
//   (placeAt, spawnAt, aimWeapon, muzzleOf for missions and factions).
// Entity: kind character, owner 'pedestrians', tags pedestrian (+ witness, dead), data
//   {archetypeId, health, mode, reaction}.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';

/**
 * Creates the pedestrian crowd system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createPedestrianCrowdSystem(context) {
  let crowd = null;
  const offs = [];

  const system = {
    name: 'pedestrians',
    dependsOn: ['openWorldCity', 'physics'],
    /** The people of the crowd (empty until the city has a pavement graph). */
    get people() { return crowd ? crowd.people : []; },
    get count() { return crowd ? crowd.people.length : 0; },

    async init(progress) {
      progress(0.2, 'crowd');
      const city = context.systems.find('openWorldCity');
      if (!city || !city.pedestrianGraph || typeof city.spawnPointsNear !== 'function') return;
      const { createCrowdSimulation } = await import('./crowdSimulation.js');
      crowd = createCrowdSimulation(context, city);
      context.commands.handle(GAME_COMMANDS.PEDESTRIAN_SPAWN, ({ archetypeId, position, heading }) => {
        // A sentry archetype (a soldier on guard) is posted exactly there and stands his ground.
        const person = crowd.archetypes[archetypeId]?.sentry ? crowd.postSentry(archetypeId, position.x, position.z, heading)
          : crowd.spawnAt(archetypeId, position.x, position.z);
        return person ? person.id : null;
      });
      context.commands.handle(GAME_COMMANDS.PEDESTRIANS_SET_DENSITY, ({ scale }) => crowd.setDensity(scale));
      const { registerCrowdShowcase } = await import('./crowdShowcase.js');
      registerCrowdShowcase(context);
      progress(1, 'crowd');
    },

    start() {
      if (!crowd) return;
      const on = (topic, handler) => { context.events.on(topic, handler); offs.push(() => context.events.off(topic, handler)); };
      on(GAME_EVENTS.WEAPON_FIRED, ({ shooterId, origin, loudness }) => {
        crowd.recoil(shooterId);
        if (origin) crowd.stimulate('gunfire', origin.x, origin.z, 55 * Math.max(0.4, loudness ?? 1), shooterId);
      });
      on(GAME_EVENTS.EXPLOSION_DETONATED, ({ position, radius, causeId }) => {
        if (position) crowd.stimulate('explosion', position.x, position.z, 40 + (radius ?? 5) * 4, causeId);
      });
      on(GAME_EVENTS.DAMAGE_DEALT, ({ targetId, attackerId, amount, fatal, position }) => {
        const target = context.entities.get(targetId);
        const person = target && target.owner === 'pedestrians' ? target.data.person : null;
        if (person) crowd.hurt(person, amount ?? 0, attackerId, fatal);
        if (position) crowd.stimulate('fight_nearby', position.x, position.z, 18, attackerId);
      });
      on(GAME_EVENTS.CHARACTER_KILLED, ({ killerId, position }) => {
        if (position) crowd.stimulate('body_seen', position.x, position.z, 22, killerId);
      });
      on(GAME_EVENTS.CRIME_COMMITTED, ({ crimeId, offenderId, position }) => {
        if (position) crowd.witness(crimeId, offenderId, position.x, position.z);
      });
      // A bench knocked away: its sitters stand up and walk on.
      on(GAME_EVENTS.PROP_BROKEN, ({ position }) => { if (position) crowd.knockSeats(position.x, position.z); });
      // A carjacked driver is hauled out of the seat, gets up and runs.
      on(GAME_EVENTS.VEHICLE_STOLEN, (theft) => {
        if (theft && theft.jacked) crowd.carjacked(theft);
      });
      // A rammed traffic driver who climbs out becomes one of ours (walks back to the car after).
      const traffic = context.systems.find('traffic');
      if (traffic && 'onAngryDriver' in traffic) {
        traffic.onAngryDriver = (driver) => crowd && crowd.angryDriver(driver);
        offs.push(() => { if (traffic.onAngryDriver) traffic.onAngryDriver = null; });
      }
    },

    update(deltaSeconds) {
      if (crowd) crowd.update(deltaSeconds);
    },

    /** After the vehicles' update has placed the cars: seated drivers follow them this frame. */
    lateUpdate() {
      if (crowd) crowd.lateUpdate();
    },

    stimulate(stimulus, x, z, radius, offenderId) { return crowd ? crowd.stimulate(stimulus, x, z, radius, offenderId) : 0; },
    witness(crimeId, offenderId, x, z) { if (crowd) crowd.witness(crimeId, offenderId, x, z); },
    setDensity(scale) { if (crowd) crowd.setDensity(scale); },
    /** Clears people out of reach and fills the pavements around the focus now. */
    refill() { if (crowd) crowd.refill(); },
    /** Takes one person (entity id) out of the crowd; {whenUnseen: true} lets them walk off first. */
    removePerson(id, options) { return crowd ? crowd.removePerson(id, options) : false; },
    /** The driver drawn at the wheel of a traffic car ({walker}), or null: the player's carjack. */
    seatedDriverOf(vehicleId) { return crowd ? crowd.seatedDriverOf(vehicleId) : null; },
    /** The crowd simulation itself, for the factions system (null without a city). */
    get simulation() { return crowd; },

    dispose() {
      for (const off of offs.splice(0)) off();
      if (crowd) crowd.dispose();
      crowd = null;
    },
  };
  return system;
}
