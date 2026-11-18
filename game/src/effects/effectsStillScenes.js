// Effects stills for the showcase, everything made by the real systems and held with
// 'effects/freeze' at the instant that reads:
// - ?shot=effects-rifle-casing: the lead firing the assault rifle from the aim view on Gran Vía at
//   golden hour, held 0.06 s after the shot: the flash already gone, the brass case in the air
//   just right of the gun (&after=s changes the moment).
// - ?shot=effects-rocket-launch: the rocket launcher fired from the aim view, held 0.2 s after the
//   launch: the back-blast cloud rolling out round the shooter, the ground dust, the rocket away.
// - ?shot=effects-surf: the beach below Bulevar Dorado at golden hour, surf breaking along the
//   water's edge (the ambient emitters of ambientEffects.js), the lead on the sand.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_STATE } from '../core/state/gameStates.js';

/** A point along a staging street (0 east end .. 1 west end), with its unit westward direction. */
function streetPoint(game, key, along) {
  const street = game.systems.find('openWorldCity')?.plan?.stagingStreets?.find((each) => each.key === key);
  if (!street) return null;
  const ex = street.westEnd.x - street.eastEnd.x; const ez = street.westEnd.z - street.eastEnd.z;
  const length = Math.hypot(ex, ez);
  return { x: street.eastEnd.x + ex * along, z: street.eastEnd.z + ez * along, fx: ex / length, fz: ez / length };
}

/** The player's heading for a forward (fx, fz): its forward is (-sin h, -cos h). */
const headingOf = (fx, fz) => Math.atan2(-fx, -fz);

function place(game, tools, hours, at, heading) {
  game.state.enter(GAME_STATE.PLAYING);
  game.commands.run(GAME_COMMANDS.TIME_SET, { hours });
  if (game.commands.has(GAME_COMMANDS.PLAYER_TELEPORT)) game.commands.run(GAME_COMMANDS.PLAYER_TELEPORT, { position: { x: at.x, z: at.z }, heading });
  tools.advance(0.2);
}

/** The lead on Gran Vía's north pavement, aiming `weaponId` down the avenue; one shot, held. */
function aimedShot(game, tools, weaponId, after, settle) {
  const street = streetPoint(game, 'gran_via_marazul', 0.44);
  if (!street) return;
  // the right-hand pavement looking west, the aim a little across the avenue
  const at = { x: street.x - street.fz * 10, z: street.z + street.fx * 10 };
  place(game, tools, 18.9, at, headingOf(street.fx, street.fz) + 0.18);
  const crowd = game.systems.find('pedestrians');
  for (const person of crowd?.people ? [...crowd.people] : []) {
    if (Math.hypot(person.x - at.x, person.z - at.z) < 8) crowd.removePerson?.(person.id);
  }
  game.commands.run(GAME_COMMANDS.PLAYER_GIVE_WEAPON, { weaponId, ammo: 30 });
  game.input.setVirtual('aim', true);
  tools.advance(settle);
  game.commands.run('effects/freeze', { next: 'muzzle_flash', after });
  game.input.setVirtual('attack', true);
  tools.advance(0.05);
  game.input.setVirtual('attack', false);
  tools.advance(after + 0.05);
}

/** The lead on the sand a few metres from the water below Bulevar Dorado, looking along it. */
function beach(game, tools) {
  const plan = game.systems.find('openWorldCity')?.plan;
  const street = streetPoint(game, 'bulevar_dorado', 0.5);
  if (!plan?.shoreDistanceAt || !street) return;
  // the sand and the sea are south of the drive: walk south until the water is near
  let x = street.x; let z = street.z;
  for (let step = 0; step < 200 && plan.shoreDistanceAt(x, z) > 9; step += 1) z += 2;
  // along the shore westward, turned 35 degrees toward the sea
  const fx = -Math.cos(0.6); const fz = Math.sin(0.6);
  place(game, tools, 18.85, { x, z }, headingOf(fx, fz));
  tools.advance(4);
}

/**
 * Registers the stills with the showcase registry.
 * @param {{showcase: {register: Function}}} context The game context.
 */
export function registerEffectsStillScenes(context) {
  context.showcase.register({
    name: 'effects-rifle-casing',
    title: 'A rifle shot frozen with its case in the air',
    description: 'The assault rifle fired from the aim view; 60 ms later the flash is gone and the brass case flies beside the gun.',
    run(game, tools) {
      const after = Number(new URLSearchParams(globalThis.location?.search ?? '').get('after'));
      aimedShot(game, tools, 'assault_rifle', after > 0 ? after : 0.06, 1.1);
    },
  });
  context.showcase.register({
    name: 'effects-rocket-launch',
    title: 'A rocket launch with its back-blast',
    description: 'The rocket launcher fired from the aim view: the back-blast rolling out round the shooter and the dust kicked off the pavement.',
    run(game, tools) { aimedShot(game, tools, 'rocket_launcher', 0.2, 1.2); },
  });
  context.showcase.register({
    name: 'effects-surf',
    title: 'Surf on the beach at golden hour',
    description: 'Waves breaking in white water along the beach below Bulevar Dorado, from the ambient effects.',
    run(game, tools) { beach(game, tools); },
  });
}
