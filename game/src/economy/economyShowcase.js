// The economy's showcase scenes. `economy-gun-shop`: golden hour in Barrio Hierro, the lead walks
// into the marker at the door of Trueno Armory and opens its counter with E; the menu lists the
// guns, rounds and armour of his rank. `economy-respray`: dusk at Capa Fresca on Playa Dorada, the
// lead with two stars drives a red coupe into the paint shop's marker, picks a colour and pays;
// the car comes out in its new paint and the stars are gone. Both are played through the real
// controls (virtual key presses) and the shop rules of shopVisits.js; nothing is staged by hand.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_STATE } from '../core/state/gameStates.js';

const GUN_SHOP = Object.freeze({ placeId: 'trueno_armory_hierro', hours: 18.6, back: 2.2, rowsDown: 1 });
const RESPRAY = Object.freeze({ placeId: 'capa_fresca_playa', hours: 19.45, out: 2.0, stars: 2, swatchesRight: 4, modelId: 'sports_coupe', colour: '#C2161B' });

/** Taps an action through the input's virtual keys, as a key press would. */
function tap(game, tools, action, times = 1) {
  for (let i = 0; i < times; i += 1) {
    game.input.setVirtual(action, true);
    tools.advance(1 / 30);
    game.input.setVirtual(action, false);
    tools.advance(1 / 30);
  }
}

/** The shop's place and its door's outward direction (unit x, z). */
function placeOf(game, placeId) {
  const shops = game.systems.find('economy')?.shops;
  const place = shops?.places.find((each) => each.id === placeId);
  if (!place) return null;
  shops.markersInShot = true;           // these scenes are about the shop markers: draw them
  const landmark = place.entry && game.systems.find('openWorldCity')?.plan?.landmarkById?.[place.entry.landmark];
  const fx = landmark?.frontX ?? 0;
  const fz = landmark?.frontZ ?? 1;
  return { shops, place, fx, fz };
}

/** A compass heading (0 = -Z, clockwise) along (x, z). */
function compass(x, z) {
  return Math.atan2(x, -z);
}

function begin(game, hours) {
  game.state.enter(GAME_STATE.PLAYING);
  game.commands.run(GAME_COMMANDS.TIME_SET, { hours });
  if (game.commands.has(GAME_COMMANDS.WEATHER_SET)) game.commands.run(GAME_COMMANDS.WEATHER_SET, { weather: 'clear', seconds: 0 });
}

/**
 * Registers the scenes with the showcase registry.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 */
export function registerEconomyShowcase(context) {
  if (!context.showcase?.register) return;
  context.showcase.register({
    name: 'economy-gun-shop',
    title: 'Walking into Trueno Armory at golden hour',
    description: 'The lead at the gun shop door in Barrio Hierro, its counter open: guns, rounds and armour priced by rank.',
    run(game, tools) {
      begin(game, GUN_SHOP.hours);
      tools.advance(0.1);
      const at = placeOf(game, GUN_SHOP.placeId);
      if (!at) return;
      const { place, fx, fz, shops } = at;
      // A step out from the marker, facing the door, then walk-in distance: the prompt shows.
      game.commands.run(GAME_COMMANDS.PLAYER_TELEPORT, { position: { x: place.x + fx * 0.6, z: place.z + fz * 0.6 }, heading: -compass(-fx, -fz) });
      tools.advance(1.2);
      tap(game, tools, 'interact');
      if (!shops.openPlaceId) shops.open(place.id);
      tap(game, tools, 'menuDown', GUN_SHOP.rowsDown);
      tools.advance(0.3);
    },
  });

  context.showcase.register({
    name: 'economy-respray',
    title: 'A respray at Capa Fresca clears two stars',
    description: 'Dusk on Playa Dorada: the coupe rolls into the paint shop with two stars, comes out in new paint, and the police lose it.',
    run(game, tools) {
      begin(game, RESPRAY.hours);
      tools.advance(0.1);
      const at = placeOf(game, RESPRAY.placeId);
      const fleet = game.systems.find('vehicles');
      if (!at || !fleet) return;
      const { place, fx, fz, shops } = at;
      // Along the kerb with the shop on the driver's left, inside the drive-in marker.
      const along = compass(fz, -fx);
      const spot = { x: place.x + fx * RESPRAY.out, z: place.z + fz * RESPRAY.out };
      game.commands.run(GAME_COMMANDS.PLAYER_TELEPORT, { position: { x: spot.x + fx * 3, z: spot.z + fz * 3 }, heading: -along });
      tools.advance(0.2);
      const car = fleet.spawn({ modelId: RESPRAY.modelId, position: spot, heading: along, colour: RESPRAY.colour, parked: true, ownerSystem: 'showcase' });
      game.commands.run(GAME_COMMANDS.PLAYER_ENTER_VEHICLE, { vehicleId: car });
      tools.advance(1.2);
      game.commands.run(GAME_COMMANDS.WANTED_SET_LEVEL, { level: RESPRAY.stars });
      tools.advance(0.6);
      if (!shops.openPlaceId) shops.open(place.id);
      for (let i = 0; i < 8 && shops.menu.selected && shops.menu.selected.action !== 'respray'; i += 1) tap(game, tools, 'menuDown');
      tap(game, tools, 'menuRight', RESPRAY.swatchesRight);
      tap(game, tools, 'menuAccept');
      tools.advance(0.5);
    },
  });
}
