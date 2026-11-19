// The mission showcase scenes, played with the game's own rules through commands:
//   mission-shootout  Night Shift's "Take out the loading crew" fought on the pavement of Gran
//                     Via Marazul at golden hour: the objective on the HUD, the beam over the
//                     nearest stevedore, the crew firing back, the lead aiming over the shoulder.
//   mission-tow-chase Hook and Chain's pursuit: the tow truck with the pearl-white Regente on the
//                     boom, the cream-blazer SUVs coming round the block on the lane graph.
// And the named mission moments other pictures ask for with the command 'missions/moment'
// {name} (missionDirector.js): a real story mission started at that objective, intro skipped,
// so the HUD shows its title and objective line and the game plays it by its own rules.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_STATE } from '../core/state/gameStates.js';

/** Named moments of the story for pictures: the mission and the objective index it starts at. */
export const MISSION_MOMENTS = Object.freeze({
  /** A car chase with the police on the lead's tail: "Cops at the finish line: lose them" (Sparks Fly; 2 stars at least). */
  'police-chase': Object.freeze({ missionId: 'm04_sparks_fly', startIndex: 3 }),
  /** The plain one, any lead, any vehicle: "Lose the police" (Dead Air; 3 stars at least). */
  'lose-the-police': Object.freeze({ missionId: 'm10_dead_air', startIndex: 3 }),
  /** An on-foot fight with a crew: "Take out the loading crew" (Night Shift; the crew stands up round the lead). */
  firefight: Object.freeze({ missionId: 'm05_night_shift', startIndex: 1 }),
  /** The tow truck with a car on the hook and pursuers: "Shake the men in cream blazers" (Hook and Chain). */
  'tow-chase': Object.freeze({ missionId: 'm01_hook_and_chain', startIndex: 3 }),
});

/** A pavement spot on Gran Via, facing along the avenue (the same stage as the combat scenes). */
function avenueSpot(context, along, offset) {
  const city = context.systems.find('openWorldCity');
  const street = city?.plan?.stagingStreets?.find((each) => each.key === 'gran_via_marazul');
  if (!street) return { x: -14, z: 16, heading: -0.75 };
  const heading = -((street.headingDegrees * Math.PI) / 180);
  const x = street.eastEnd.x + (street.westEnd.x - street.eastEnd.x) * along;
  const z = street.eastEnd.z + (street.westEnd.z - street.eastEnd.z) * along;
  const rightX = Math.cos(heading), rightZ = -Math.sin(heading);
  const spot = { x: x + rightX * offset, z: z + rightZ * offset, heading };
  const points = city.spawnPointsNear?.(spot.x, spot.z, 24, 'pedestrian', 64) ?? [];
  let best = Infinity;
  for (const point of points) {
    const gap = Math.hypot(point.x - spot.x, point.z - spot.z);
    if (gap < best) { best = gap; spot.x = point.x; spot.z = point.z; }
  }
  return spot;
}

/**
 * Registers the mission showcase scenes.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 */
export function registerMissionShowcase(context) {
  if (!context.showcase) return;
  if (!context.showcase.has('mission-shootout')) {
    context.showcase.register({
      name: 'mission-shootout',
      title: 'A mission shootout on Gran Via',
      description: 'Night Shift in progress at 18:50: "Take out the loading crew" on the HUD, the objective beam over a stevedore, the crew shooting back as the lead aims over the shoulder.',
      async run(game, tools) {
        game.state.enter(GAME_STATE.PLAYING);
        game.commands.run(GAME_COMMANDS.TIME_SET, { hours: 18.83 });
        const fight = avenueSpot(game, 0.5, 10);
        game.commands.run(GAME_COMMANDS.PLAYER_TELEPORT, { position: { x: fight.x, z: fight.z }, heading: fight.heading });
        await tools.whenIdle();
        // The crew stands round the spot; the lead steps back up the avenue to face them.
        game.commands.run(GAME_COMMANDS.MISSION_START, { missionId: 'm05_night_shift', skipIntro: true, startIndex: 1 });
        tools.advance(0.6);
        const fx = -Math.sin(fight.heading), fz = -Math.cos(fight.heading);
        game.commands.run(GAME_COMMANDS.PLAYER_TELEPORT, { position: { x: fight.x - fx * 15, z: fight.z - fz * 15 }, heading: fight.heading });
        game.commands.run(GAME_COMMANDS.PLAYER_GIVE_WEAPON, { weaponId: 'assault_rifle', ammo: 120 });
        await tools.whenIdle();
        tools.advance(0.5);
        game.input.setVirtual('aim', true);
        tools.advance(2.2);
        game.input.setVirtual('attack', true);
        tools.advance(0.05);
        game.input.setVirtual('attack', false);
      },
    });
  }
  if (!context.showcase.has('mission-tow-chase')) {
    context.showcase.register({
      name: 'mission-tow-chase',
      title: 'Hook and Chain: the tow chase',
      description: 'The tow truck with the pearl-white Regente on its boom at golden hour, the cream-blazer SUVs closing in, the objective "Shake the men in cream blazers" on the HUD.',
      async run(game, tools) {
        game.state.enter(GAME_STATE.PLAYING);
        game.commands.run(GAME_COMMANDS.TIME_SET, { hours: 18.83 });
        const road = avenueSpot(game, 0.42, 0);
        game.commands.run(GAME_COMMANDS.PLAYER_TELEPORT, { position: { x: road.x, z: road.z }, heading: road.heading });
        await tools.whenIdle();
        // From the tow objective: the truck and the Regente stand in, then the hook and the chase.
        game.commands.run(GAME_COMMANDS.MISSION_START, { missionId: 'm01_hook_and_chain', skipIntro: true, startIndex: 3 });
        tools.advance(0.5);
        await tools.whenIdle();
        game.input.setVirtual('accelerate', true);
        tools.advance(4);
        game.input.setVirtual('accelerate', false);
      },
    });
  }
}
