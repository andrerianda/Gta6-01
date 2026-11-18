// The lead's health and armour: PLAYER_HEAL and PLAYER_HEALTH_CHANGED today; being wasted or
// busted and the respawn at a hospital or police station come here next.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';

/** The lead's health when full. */
export const FULL_HEALTH = 100;

/**
 * Registers the health commands of the lead.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {{data: {health: number, armour: number}}} entity The lead's entity.
 */
export function registerPlayerHealth(context, entity) {
  context.commands.handle(GAME_COMMANDS.PLAYER_HEAL, ({ health = FULL_HEALTH, armour } = {}) => {
    const data = entity.data;
    const before = data.health;
    data.health = Math.min(FULL_HEALTH, Math.max(0, health));
    if (typeof armour === 'number') data.armour = Math.min(100, Math.max(0, armour));
    context.events.emit(GAME_EVENTS.PLAYER_HEALTH_CHANGED, {
      health: data.health, armour: data.armour, delta: data.health - before, cause: 'heal',
    });
  });
}
