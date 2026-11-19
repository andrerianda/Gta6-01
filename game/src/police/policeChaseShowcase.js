// The showcase scenes of the police, seen through the game's own centred chase camera (the owner's
// rule for every judged and in-car picture: no low cinematic cut). Both reuse the showcase
// director's chase staging (showcase/duskPoliceChase.js stagePoliceChase: the lead's red coupe flat
// out, then a handbrake slide, cruisers sent around it with their light bars on steady burn):
// - `police-chase-night`: Gran Via Marazul at 22:40 with five stars and light traffic (the near
//   lanes clear), the police helicopter hanging ahead of the coupe and 40 m to its left so it sits
//   in the top of the frame and its searchlight beam crosses the picture down onto the car.
// - `police-wreck`: Bulevar Dorado at golden hour with three stars and, ahead nosed onto the kerb,
//   a cruiser that crashed during the chase: staged through policeDispatch.stageWreck (crumpled by
//   the fleet's stageWreck, ablaze through effects' 'effects/burn' under a standing smoke column,
//   held so it neither explodes nor drives off, its light bar still flashing, the crew out with
//   their pistols up). It is the check for the cover's burning wreck.
import { stagePoliceChase } from '../showcase/duskPoliceChase.js';
import { pointInFrame } from '../showcase/showcaseStaging.js';

/** [metres right of the coupe, metres ahead, nose turn] for the night's units (see CHASE_CRUISERS). */
const NIGHT_UNITS = Object.freeze([[-3.4, 0.9, 0], [3.3, -0.4, 0], [-3.4, -8.5, 0], [-2.6, 19, 0.35]]);
/**
 * The helicopter at night: high, ahead of the coupe (a negative trail) and off to the median side
 * (a negative side, metres left), so the chase camera sees it in the top of the frame and its beam
 * crosses the picture diagonally down to the car instead of running straight at the camera.
 */
const NIGHT_HELICOPTER = Object.freeze({ altitude: 30, trail: -100, side: -40 });
/**
 * Where the staged wreck stands from the coupe's start: metres ahead, metres past the frame's kerb
 * line (frame.kerb is the outermost spot a car stands at, so + is nosing up onto the kerb), and the
 * nose turned towards the kerb (radians; its right front corner hit).
 */
const WRECK_SPOT = Object.freeze({ ahead: 36, pastKerb: 0.2, turn: 0.5 });
/** The wreck scene's chasers: all on the median side and behind, so the kerb side ahead stays in view. */
const WRECK_CHASERS = Object.freeze([[-3.4, 0.9, 0], [-3.4, -8.5, 0], [-3.0, 22, -0.3]]);
/**
 * The cover's four cruisers: alongside on the median side, ahead in the centre turning in, close
 * behind, and further ahead on the median side; the kerb side ahead stays open for the wreck.
 */
const COVER_CHASERS = Object.freeze([[-3.4, 0.6, 0], [-1.2, 13, -0.35], [-3.2, -8, 0], [-3.4, 27, -0.2]]);
/** The cover's helicopter by day: low, ahead over the street, a little to the median side. */
const COVER_HELICOPTER = Object.freeze({ altitude: 17, trail: -46, side: 5 });
/** Civilian cars hidden ahead of the coupe (metres ahead) within `wide` metres across the frame. */
const COVER_CLEAR = Object.freeze({ from: 4, to: 70, step: 6, wide: 9 });

/**
 * Removes the civilian cars (traffic's, not police, not the lead's) on the street ahead of
 * the coupe, so none stands between the chase camera and the wreck, cruisers and helicopter.
 */
export function hideCiviliansAhead(game, frame, coupe) {
  const fleet = game.systems.get('vehicles');
  const found = [];
  const c = coupe.position;
  for (let ahead = COVER_CLEAR.from; ahead <= COVER_CLEAR.to; ahead += COVER_CLEAR.step) {
    const x = c.x + frame.fx * ahead;
    const z = c.z + frame.fz * ahead;
    game.entities.within(x, z, COVER_CLEAR.wide + COVER_CLEAR.step, { kind: 'vehicle' }, found);
    // Traffic's own cars (it forgets one on VEHICLE_REMOVED); the fleet's level of detail would show a merely hidden one again.
    for (const entity of found) {
      if (entity !== coupe && entity.tags.has('traffic') && !entity.tags.has('police') && !entity.tags.has('player')) fleet.remove(entity.id);
    }
    found.length = 0;
  }
}

/**
 * Brings the police helicopter in by day and holds it on a station over the street ahead of the
 * coupe ({altitude, trail, side}: a negative trail is ahead, + side is right), flying at its speed.
 * @returns {boolean} Whether a helicopter was placed.
 */
export function holdHelicopterAhead(game, frame, coupe, station) {
  const dispatch = game.systems.find('policeDispatch');
  const heli = dispatch?.helicopter;
  if (!heli) return false;
  dispatch.forceHelicopter = true;
  heli.dayStation = { ...station };
  const p = coupe.position;
  const { fx, fz } = frame;
  const { trail, side } = station;
  const speed = Math.abs(coupe.data.speed ?? 0);
  const over = { x: p.x - fx * trail - fz * side, z: p.z - fz * trail + fx * side };
  heli.place(over.x, over.z, p.y, -frame.compass, fx * speed, fz * speed);
  return true;
}

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
      const { fx, fz } = staged.frame;
      const { trail, side } = NIGHT_HELICOPTER;
      // (-fz, fx) is the frame's right (showcaseStaging.pointInFrame).
      const over = { x: p.x - fx * trail - fz * side, z: p.z - fz * trail + fx * side };
      dispatch.helicopter.place(over.x, over.z, p.y, -staged.frame.compass);
      tools.advance(0.05);
    },
  });
  context.showcase.register({
    name: 'police-chase-cover',
    title: 'A golden-hour police chase on Bulevar Dorado with the police helicopter and a burning wreck',
    description: 'Golden hour, four stars, in the chase camera: four cruisers with lit bars closing on the red coupe, the police helicopter low ahead over the sea-front, a crashed cruiser burning at the kerb.',
    async run(game, tools) {
      const staged = await stagePoliceChase(game, tools, {
        street: 'bulevar_dorado', along: 0.5, hours: 18.7, stars: 4, traffic: 0.15, cruisers: COVER_CHASERS,
        prepare(frame) {
          const dispatch = game.systems.find('policeDispatch');
          const position = pointInFrame(frame, frame.kerb + WRECK_SPOT.pastKerb, WRECK_SPOT.ahead);
          dispatch?.stageWreck('patrol_car', position, -(frame.compass + WRECK_SPOT.turn), { lights: 'flash', crew: 'out', burning: true, corner: 'right' });
        },
      });
      const record = game.systems.get('vehicles').get(staged.coupe);
      if (!record) return;
      hideCiviliansAhead(game, staged.frame, record.entity);
      if (holdHelicopterAhead(game, staged.frame, record.entity, COVER_HELICOPTER)) tools.advance(0.05);
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
          const position = pointInFrame(frame, frame.kerb + WRECK_SPOT.pastKerb, WRECK_SPOT.ahead);
          dispatch?.stageWreck('patrol_car', position, -(frame.compass + WRECK_SPOT.turn), { lights: 'flash', crew: 'out', burning: true, corner: 'right' });
          game.log?.info?.(`police-wreck: kerb ${frame.kerb.toFixed(2)}, half ${frame.half.toFixed(2)}, lanes ${frame.laneSide(0).toFixed(2)} / ${frame.laneSide(1).toFixed(2)}`);
        },
      });
    },
  });
}
