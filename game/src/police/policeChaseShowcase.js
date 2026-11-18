// The showcase scenes of the police, seen through the game's own centred chase camera (the owner's
// rule for every judged and in-car picture: no low cinematic cut). Both reuse the showcase
// director's chase staging (showcase/duskPoliceChase.js stagePoliceChase: the lead's red coupe flat
// out, then a handbrake slide, cruisers sent around it with their light bars on steady burn):
// - `police-chase-night`: Gran Via Marazul at 22:40 with five stars and light traffic (the near
//   lanes clear), the police helicopter hanging ahead of the coupe so it sits in the top of the
//   frame with its searchlight on the car.
// - `police-wreck`: Bulevar Dorado at golden hour with three stars and, ahead at the kerb, a
//   cruiser that crashed into the palms during the chase: staged through policeDispatch.stageWreck
//   (dented by the fleet's own crash path, burning, held so it neither explodes nor drives off, its
//   light bar still flashing). It is the check for the cover's burning wreck.
import { stagePoliceChase } from '../showcase/duskPoliceChase.js';
import { pointInFrame } from '../showcase/showcaseStaging.js';

/** [metres right of the coupe, metres ahead, nose turn] for the night's units (see CHASE_CRUISERS). */
const NIGHT_UNITS = Object.freeze([[-3.4, 0.9, 0], [3.3, -0.4, 0], [-3.4, -8.5, 0], [-2.6, 19, 0.35]]);
/** The helicopter at night: high and ahead of the coupe (a negative trail), so the chase camera sees it. */
const NIGHT_HELICOPTER = Object.freeze({ altitude: 30, trail: -62 });
/** Where the staged wreck stands from the coupe's start: metres ahead, metres in from the kerb, nose turn. */
const WRECK_SPOT = Object.freeze({ ahead: 44, fromKerb: 1.8, turn: 0.55 });
/** The wreck scene's chasers: all on the median side and behind, so the kerb side ahead stays in view. */
const WRECK_CHASERS = Object.freeze([[-3.4, 0.9, 0], [-3.4, -8.5, 0], [-3.0, 22, -0.3]]);

/**
 * Registers the scenes with the showcase registry.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 */
export function registerPoliceChaseShowcase(context) {
  context.showcase.register({
    name: 'police-chase-night',
    title: 'A five-star night chase with the police helicopter over Gran Via Marazul',
    description: 'Five stars at night in the chase camera: cruisers alongside the red coupe throwing red and blue on the avenue, the helicopter ahead with its searchlight on the car.',
    async run(game, tools) {
      const staged = await stagePoliceChase(game, tools, {
        street: 'gran_via_marazul', along: 0.45, hours: 22.65, stars: 5, traffic: 0.15, crowd: 0.8, cruisers: NIGHT_UNITS,
      });
      const dispatch = game.systems.find('policeDispatch');
      const coupe = game.systems.get('vehicles').get(staged.coupe)?.entity;
      if (!dispatch?.helicopter || !coupe) return;
      dispatch.forceHelicopter = true;
      Object.assign(dispatch.helicopter, NIGHT_HELICOPTER);
      const p = coupe.position;
      const over = { x: p.x - staged.frame.fx * NIGHT_HELICOPTER.trail, z: p.z - staged.frame.fz * NIGHT_HELICOPTER.trail };
      dispatch.helicopter.place(over.x, over.z, p.y, -staged.frame.compass);
      tools.advance(0.05);
    },
  });
  context.showcase.register({
    name: 'police-wreck',
    title: 'A burning police cruiser crashed into the palms on Bulevar Dorado',
    description: 'Golden hour, three stars: the red coupe sliding in the chase camera past a cruiser that crashed into the palms and burns at the kerb, its light bar still flashing.',
    async run(game, tools) {
      await stagePoliceChase(game, tools, {
        street: 'bulevar_dorado', along: 0.5, hours: 18.83, stars: 3, cruisers: WRECK_CHASERS,
        prepare(frame) {
          const dispatch = game.systems.find('policeDispatch');
          const position = pointInFrame(frame, frame.kerb - WRECK_SPOT.fromKerb, WRECK_SPOT.ahead);
          dispatch?.stageWreck('patrol_car', position, -(frame.compass + WRECK_SPOT.turn), { lights: 'flash', crew: 'slumped', burning: true });
        },
      });
    },
  });
}
