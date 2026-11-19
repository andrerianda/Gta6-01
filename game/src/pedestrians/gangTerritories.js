// Gangs and factions: who holds which streets, how each faction feels about the player, the
// members who stand on their corners in their colours, and the fights that break out when the
// player crosses the line. Implementation: turfCrews.js (crews on the corners of each faction's
// turf, attitude rules, members turning hostile), carried by the pedestrian crowd
// (pedestrians.simulation). Contract: docs/ARCHITECTURE.md, "factions".
//
// Members: attitudes ({factionId: -100..100}), attitudeOf(factionId), serialise(), restore(data).
// Entities: the crowd's people with tags gang (+ hostile once turned), data {factionId, memberId}.
// Publishes FACTION_ATTITUDE_CHANGED.
import { GAME_EVENTS } from '../core/events/gameEvents.js';

/**
 * Creates the gang territories system.
 * @param {import('../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {import('../core/systems/gameSystemContract.js').GameSystem}
 */
export function createGangTerritoriesSystem(context) {
  let crews = null;
  let saved = null;
  const offs = [];

  return {
    name: 'factions',
    dependsOn: ['pedestrians'],
    /** Each faction's attitude towards the player. */
    get attitudes() { return crews ? crews.attitudes : {}; },
    attitudeOf(factionId) { return crews ? crews.attitudes[factionId] ?? 0 : 0; },

    async init(progress) {
      const pedestrians = context.systems.find('pedestrians');
      const city = context.systems.find('openWorldCity');
      const crowd = pedestrians && pedestrians.simulation;
      if (!crowd || !city || !context.content.has('gangsAndFactions')) return;
      const { createTurfCrews } = await import('./turfCrews.js');
      crews = createTurfCrews(context, crowd, city);
      if (saved) crews.restore(saved);
      progress(1, 'factions');
    },

    start() {
      if (!crews) return;
      const on = (topic, handler) => { context.events.on(topic, handler); offs.push(() => context.events.off(topic, handler)); };
      on(GAME_EVENTS.DAMAGE_DEALT, ({ targetId, attackerId }) => crews.attacked(targetId, attackerId, false));
      on(GAME_EVENTS.CHARACTER_KILLED, ({ victimId, killerId }) => crews.attacked(victimId, killerId, true));
    },

    update(deltaSeconds) {
      if (crews) crews.update(deltaSeconds);
    },

    serialise() { return crews ? crews.serialise() : { attitudes: {} }; },
    restore(data) { saved = data; if (crews) crews.restore(data); },

    dispose() {
      for (const off of offs.splice(0)) off();
      crews = null;
    },
  };
}
