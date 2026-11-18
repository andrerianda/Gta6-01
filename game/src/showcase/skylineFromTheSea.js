// The scale pictures: the city seen from out over the sea at dusk, when the sky still glows and
// the windows of the hotels and towers are lit. Two views, each a showcase scene:
//   `skyline-from-the-sea`   the city plan's `muelle_dorado` vantage raised and swung east of the
//                            pier, so the pier runs in from the corner towards the beach, the hotel
//                            front and the towers of Centro rising behind it;
//   `skyline-causeway-dusk`  the `calzada_coral` vantage on the causeway, looking north-west across
//                            the bay at the hotel front and the towers against the afterglow.
// The lead stands on the sand below each view so the city streams in around it; the camera is
// cut to the vantage and held there.
import { cutCamera, groundAt, openScene, placeLead } from './showcaseStaging.js';

/**
 * The two views. `shift` moves the eye from the vantage (metres east, metres south), `turn`
 * moves the point looked at (metres east, metres south), `leadAt` is how far towards the point
 * looked at the lead stands (0 at the vantage, 1 at the point), heights are metres above the sea.
 */
const VIEWS = Object.freeze([
  Object.freeze({
    name: 'skyline-from-the-sea', vantage: 'muelle_dorado', hours: 19.78, shift: [150, 30], turn: [-170, 0],
    eyeHeight: 38, lookHeight: 46, fieldOfView: 50, leadAt: 0.24,
    // The police helicopter crossing the view (take k5; farther out, 130 m, it was a speck).
    helicopter: Object.freeze({ ahead: 60, right: 15, altitude: 44, beam: 0 }),
    title: 'Marazul from the sea at dusk',
    description: 'The pier, the beach, the hotel front and the downtown towers with their windows lit, from out over the sea.',
  }),
  // High over the surf off Playa Dorada, about 250 m from the hotel front (80 m up and 180 m out
  // filled the frame with rooftops and lost the sea): the surf and the beach below, the hotels on
  // Bulevar Dorado, the boulevard's lamps and traffic, and the towers of Centro rising behind.
  Object.freeze({
    name: 'skyline-bay-dusk', vantage: 'muelle_dorado', hours: 19.85, shift: [311, -35], turn: [-63, 74],
    eyeHeight: 75, lookHeight: 40, fieldOfView: 52, leadAt: 0.26,
    title: 'The hotel front and the towers of Marazul at dusk',
    description: 'From high over the surf: the beach, the lit hotels on Bulevar Dorado and the downtown towers behind them at dusk.',
  }),
  Object.freeze({
    name: 'skyline-causeway-dusk', vantage: 'calzada_coral', hours: 19.78, shift: [0, 0], turn: [0, 0],
    eyeHeight: 30, lookHeight: 22, fieldOfView: 30, leadAt: 0.5,
    title: 'The bay and the towers from the Isla Coral causeway',
    description: 'The hotel front and the towers across the bay against the afterglow, their windows lit.',
  }),
]);

/** Where each vantage is when the plan cannot be read (the plan's values for seed 1). */
const FALLBACK_VANTAGES = Object.freeze({
  muelle_dorado: { x: 79, z: 1165, lookX: 238, lookZ: 226 },
  calzada_coral: { x: 1495, z: 1464, lookX: 346, lookZ: 539 },
});

/**
 * Registers the skyline scenes.
 * @param {object} context The game context.
 * @returns {() => void} Removes the scenes again.
 */
export function registerSkylineFromTheSea(context) {
  const removers = VIEWS.map((view) => context.showcase.register({
    name: view.name,
    title: view.title,
    description: view.description,
    run: (game, tools) => runSkyline(game, tools, view),
  }));
  return () => {
    for (const remove of removers) if (typeof remove === 'function') remove();
  };
}

async function runSkyline(game, tools, view) {
  openScene(game, { hours: view.hours, traffic: 1, crowd: 1.2 });
  const plan = game.systems.find('openWorldCity')?.plan;
  const vantage = plan?.vantagePoints?.find?.((each) => each.id === view.vantage) ?? FALLBACK_VANTAGES[view.vantage];
  const eye = { x: vantage.x + view.shift[0], z: vantage.z + view.shift[1] };
  const look = { x: vantage.lookX + view.turn[0], z: vantage.lookZ + view.turn[1] };
  const dx = look.x - eye.x;
  const dz = look.z - eye.z;
  const length = Math.hypot(dx, dz) || 1;
  // The lead on the beach between the eye and the city, facing it: streaming centres there.
  const beach = { x: vantage.x + (vantage.lookX - vantage.x) * view.leadAt, z: vantage.z + (vantage.lookZ - vantage.z) * view.leadAt };
  await placeLead(game, tools, beach, -Math.atan2(dx / length, -dz / length));
  tools.advance(2);
  const lookGround = Math.max(0, groundAt(game, look.x, look.z));
  cutCamera(game, { x: eye.x, y: view.eyeHeight, z: eye.z }, { x: look.x, y: lookGround + view.lookHeight, z: look.z }, view.fieldOfView);
  // The buildings in view stream in around the camera: without this wait a GPU take at 08:02
  // showed the street grid with no buildings at all.
  await tools.whenIdle();
  flyHelicopter(game, view, eye, { x: dx / length, z: dz / length });
  tools.advance(0.2);
}

/**
 * Puts the police helicopter in the view (the police system's own, kept flying with no stars):
 * `ahead` metres from the eye towards the city, `right` metres to the right, `altitude` metres
 * up, side-on. `&heli=<ahead>,<right>,<altitude>,<beam 0|1>` in the page query tunes it,
 * `&heli=0` drops it.
 */
function flyHelicopter(game, view, eye, toward) {
  const given = new URLSearchParams(globalThis.location?.search ?? '').get('heli');
  if (given === '0') return;
  const [ahead, right, altitude, beam] = (given ?? '').split(',').map(Number);
  const pick = (value, fallback) => (Number.isFinite(value) && given ? value : fallback);
  const setting = view.helicopter;
  if (!setting && !given) return;
  const dispatch = game.systems.find('policeDispatch');
  const helicopter = dispatch?.helicopter;
  if (!helicopter?.place) return;
  const a = pick(ahead, setting?.ahead ?? 130);
  const r = pick(right, setting?.right ?? 30);
  dispatch.forceHelicopter = true;
  helicopter.altitude = pick(altitude, setting?.altitude ?? 50);
  const x = eye.x + toward.x * a - toward.z * r;
  const z = eye.z + toward.z * a + toward.x * r;
  helicopter.place(x, z, 0, Math.atan2(-toward.x, -toward.z) + Math.PI / 2);
  // Its searchlight off (it lights the beach as a flat white wedge from out here): as the police
  // system's helicopter does when it stands down; in the 0.2 s before the picture it barely moves.
  if (!pick(beam, setting?.beam ?? 0)) helicopter.leaving = true;
}
