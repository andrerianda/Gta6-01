// Pedestrians: the crowd on the pavements. Spawns people by district archetype and hour out of
// sight on the pavement graph, walks them along pavements and over crossings on the walk phase
// with the character run-time's locomotion controller, parks some in talking pairs, and makes
// them react: diving out of a car's way, knocked down by one, fleeing shots and blasts at a run,
// cowering, gawking, fighting back, and witnessing crimes (CRIME_WITNESSED, phoning the police).
// Implementation: crowdSimulation.js (people and moves), walkingRoutes.js (route choice and
// crossing signals), crowdSpawning.js (who, where, when, what they look like),
// pedestrianReactions.js (reaction rules), pedestrianBodies.js (bodies, paint, levels of detail),
// crowdShowcase.js (the golden-hour crowd scenes). Contract: docs/ARCHITECTURE.md, "pedestrians".
//
// Members: people (each {id, entity, archetype, look, mode, x, z}), count, stimulate(stimulus,
//   x, z, radius, offenderId), witness(crimeId, offenderId, x, z), setDensity(scale).
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
      context.commands.handle(GAME_COMMANDS.PEDESTRIAN_SPAWN, ({ archetypeId, position }) => {
        const person = crowd.spawnAt(archetypeId, position.x, position.z);
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

    stimulate(stimulus, x, z, radius, offenderId) { return crowd ? crowd.stimulate(stimulus, x, z, radius, offenderId) : 0; },
    witness(crimeId, offenderId, x, z) { if (crowd) crowd.witness(crimeId, offenderId, x, z); },
    setDensity(scale) { if (crowd) crowd.setDensity(scale); },
    /** Clears people out of reach and fills the pavements around the focus now. */
    refill() { if (crowd) crowd.refill(); },
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
