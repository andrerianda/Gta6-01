// The combat showcase scene: the lead on the north pavement of Gran Vía Marazul at golden hour,
// pistol drawn and aimed down the avenue, seen over the right shoulder by the follow camera as it
// pushes in for the aim. It sets the game up through commands and plays the real rules forward
// (the aim action held), so the picture is the game's own.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_STATE } from '../core/state/gameStates.js';

/** Where along the avenue (0 east end, 1 west end) and how far right of its centre line. */
const STAGE = Object.freeze({ along: 0.46, offset: 12, turn: 0.32 });

/**
 * A spot on the pavement of Gran Vía, facing along it a little towards the far side.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 */
function aimingSpot(context, turn = STAGE.turn) {
  const city = context.systems.find('openWorldCity');
  const street = city?.plan?.stagingStreets?.find((each) => each.key === 'gran_via_marazul');
  if (!street) return { x: -14, z: 16, heading: -0.75 };
  const heading = -((street.headingDegrees * Math.PI) / 180);
  const x = street.eastEnd.x + (street.westEnd.x - street.eastEnd.x) * STAGE.along;
  const z = street.eastEnd.z + (street.westEnd.z - street.eastEnd.z) * STAGE.along;
  const rightX = Math.cos(heading), rightZ = -Math.sin(heading);
  const spot = { x: x + rightX * STAGE.offset, z: z + rightZ * STAGE.offset, heading: heading + turn };
  const points = typeof city.spawnPointsNear === 'function' ? city.spawnPointsNear(spot.x, spot.z, 30, 'pedestrian', 64) : [];
  let best = Infinity;
  for (const point of points) {
    const lateral = (point.x - x) * rightX + (point.z - z) * rightZ;
    const ahead = (point.x - x) * -rightZ + (point.z - z) * rightX;
    if (lateral < 5 || lateral > 32) continue;
    const score = Math.abs(ahead) + Math.abs(lateral - STAGE.offset) * 0.5;
    if (score < best) { best = score; spot.x = point.x; spot.z = point.z; }
  }
  return spot;
}

/** The scenes: which weapon, and whether the trigger is pulled just before the picture. */
const SCENES = Object.freeze([
  { name: 'combat-aim-pistol', weaponId: 'pistol', ammo: 28, shoot: false, title: 'The lead aiming a pistol at golden hour' },
  // The owner's reference: a pistol held out one-handed across the street, the far pavement behind.
  { name: 'combat-aim-across', weaponId: 'pistol', ammo: 28, shoot: false, turn: 1.3, title: 'The lead aiming a pistol across Gran Vía' },
  { name: 'combat-fire-pistol', weaponId: 'pistol', ammo: 28, shoot: true, title: 'The lead firing a pistol on Gran Vía' },
  { name: 'combat-fire-rifle', weaponId: 'assault_rifle', ammo: 90, shoot: true, title: 'The lead firing a rifle on Gran Vía' },
]);

/**
 * Registers the combat showcase scenes.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 */
export function registerCombatShowcase(context) {
  if (!context.showcase) return;
  for (const scene of SCENES) {
    if (context.showcase.has(scene.name)) continue;
    context.showcase.register({
      name: scene.name,
      title: scene.title,
      description: `Gran Vía Marazul at 18:50, the ${scene.weaponId.replace('_', ' ')} raised ${scene.turn ? 'across' : 'down'} the avenue over the right shoulder${scene.shoot ? ', muzzle flash and tracer' : ''}.`,
      async run(game, tools) {
        game.state.enter(GAME_STATE.PLAYING);
        game.commands.run(GAME_COMMANDS.TIME_SET, { hours: 18.83 });
        const spot = aimingSpot(game, scene.turn);
        game.commands.run(GAME_COMMANDS.PLAYER_TELEPORT, { position: { x: spot.x, z: spot.z }, heading: spot.heading });
        await tools.whenIdle();
        game.commands.run(GAME_COMMANDS.PLAYER_TELEPORT, { position: { x: spot.x, z: spot.z }, heading: spot.heading });
        game.commands.run(GAME_COMMANDS.PLAYER_GIVE_WEAPON, { weaponId: scene.weaponId, ammo: scene.ammo });
        tools.advance(0.4);
        game.input.setVirtual('aim', true);
        tools.advance(1.2);
        if (!scene.shoot) return;
        // The trigger pulled just before the picture, and the effects held still 0.02 s after the
        // shot's muzzle flash appears (effects/freeze), so the flash and the tracer stay in the
        // frame however long the engine settles the image. One shot is enough.
        game.commands.run('effects/freeze', { next: 'muzzle_flash', after: 0.02 });
        game.input.setVirtual('attack', true);
        tools.advance(0.06);
        game.input.setVirtual('attack', false);
      },
    });
  }
}
