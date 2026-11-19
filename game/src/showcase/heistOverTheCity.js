// Judged picture 4, scene `heist-over-the-city`: mission 17, POINT OF NO RETURN, the stolen Manta
// Sombra running low over the towers of Marazul at dawn with the air guard and the police on its
// tail. It reads as a theft and a getaway, never as a fight (the owner's rule for the judged set):
// the two Halcón interceptors fly beside and behind the stolen aircraft with their lights running,
// their guns held, nothing fired; the police helicopter joins the chase over the avenue; on the
// radio Halcón Uno orders the thief to follow them down (red: the hunters); the objective is to
// lose the air patrol, with the wanted stars and the minimap on the HUD. No weapon, lock, target
// box or bay door is in the picture: the bomb flag is put away, the bay stays shut.
// The mission itself is running (its own start command, checkpoint 3, ASSISTED), seated in the
// aircraft by the mission; the scene puts the aircraft over Gran Vía Marazul downtown, chooses the
// flight camera's chase view explicitly (a flight starts in the cockpit view) and then holds its
// own exterior camera close behind and above the aircraft (a short cinematic framing), so the
// stealth planform is large in the frame whatever the flight camera does.
// What the scene decides and the mission does not: the clock (DAWN_HOURS), the place, height and
// heading; the pair released early by the mission's own scramble and held on stations around the
// aircraft (STATIONS); the police helicopter called by the dispatch's own switch; the stars; the
// objective worded as an escape (OBJECTIVE) and Halcón Uno's order repeated at this moment.
// Tuning takes (never in the judged query): &along=, &alt=, &cam=back,height,side,ahead,fov,
// &uno=right,up,back, &dos=..., &heli=right,up,back, &stars=, &traffic=.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { WORLD_FLAGS } from '../core/state/worldFlags.js';
import { dawnHours, flyMissionAircraftAt, startFinalArc } from './finalArcStaging.js';
import { groundAt, streetFrameOf } from './showcaseStaging.js';

/** The street the aircraft follows downtown, and where along it the picture is (0 east end, 1 west end). */
const STREET = Object.freeze({ key: 'gran_via_marazul', along: 0.55 });
/** Metres over the street, true airspeed and climb (m/s). */
const FLIGHT = Object.freeze({ height: 130, speed: 92, climb: 0 });
/** The warm-up before the picture: seconds flown higher up (the pilot's key hint, 8 s, leaves the HUD), and how much higher. */
const WARM_UP = Object.freeze({ seconds: 8.6, above: 160 });
/** Seconds flown on the line before the picture, with the pair and the helicopter coming in. */
const RUN_IN = 1.2;
/** The aircraft the scene flies (the mission's own choice screen offers it). */
const AIRCRAFT = 'manta_sombra';
/** The objective on the HUD: a getaway. */
const OBJECTIVE = 'Lose the air patrol';
/** The radio line on screen: Halcón Uno, red (the hunters), ordering the thief to follow them down. */
const RADIO_LINE = 'airGuard.order3';
/** The flight view the scene chooses before it holds its own exterior camera. */
const FLIGHT_VIEW = 'chase';
/** Wanted stars: the police are on the chase too. */
const STARS = 3;
/** Traffic on the streets under the aircraft. */
const TRAFFIC = 2.2;
/** The pair's guns and orders held for the whole picture (seconds). */
const HOLD_FIRE = 600;
/**
 * Stations around the stolen aircraft, metres in its frame (+right, +up, +back): Halcón Uno off
 * the left wing, Halcón Dos off the right wing and higher, both a little ahead so the close
 * camera holds them (anything further back sits beside the lens); the police helicopter over
 * the avenue ahead, cutting him off.
 */
const STATIONS = Object.freeze({
  uno: Object.freeze({ right: -32, up: 18, back: -12 }),
  dos: Object.freeze({ right: 32, up: 8, back: -6 }),
  heli: Object.freeze({ right: -4, up: 22, back: -30 }),
});
/**
 * The exterior camera: metres behind and above the aircraft, to its right (+), the point looked
 * at ahead of it, and the vertical field of view. The planform fills about half the width.
 */
const CAMERA = Object.freeze({ back: 70, height: 26, side: -8, ahead: 15, fov: 40 });
const DEGREES = Math.PI / 180;
/** Half the Manta Sombra's span (vehicleCatalog: width 46 m), for the debug read of its share of the frame. */
const HALF_SPAN = 23;

/**
 * Registers the scene.
 * @param {object} context The game context.
 * @returns {() => void} Removes the scene again.
 */
export function registerHeistOverTheCity(context) {
  return context.showcase.register({
    name: 'heist-over-the-city',
    title: 'Point of no return: the getaway over Marazul',
    description: 'Mission 17 from outside: the stolen Manta Sombra low over the towers of Marazul at dawn, two Halcón interceptors and the police helicopter on its tail, Halcón Uno ordering it down on the radio.',
    async run(game, tools) {
      const { commands, flags } = game;
      const query = new URLSearchParams(globalThis.location?.search ?? '');
      const mission = await startFinalArc(game, { checkpoint: 3, aircraftId: AIRCRAFT, flightMode: 'casual' });
      if (!mission) return;
      commands.run(GAME_COMMANDS.TIME_SET, { hours: dawnHours() });
      if (commands.has(GAME_COMMANDS.WEATHER_SET)) commands.run(GAME_COMMANDS.WEATHER_SET, { weather: 'clear', seconds: 0 });
      if (commands.has(GAME_COMMANDS.TRAFFIC_SET_DENSITY)) commands.run(GAME_COMMANDS.TRAFFIC_SET_DENSITY, { scale: tunedNumber(query, 'traffic', TRAFFIC) });

      const along = tunedNumber(query, 'along', STREET.along);
      const frame = streetFrameOf(game, STREET.key, along > 0 && along < 1 ? along : STREET.along);
      const heading = frame.compass / DEGREES;
      const street = groundAt(game, frame.x, frame.z);
      const height = tunedNumber(query, 'alt', FLIGHT.height);

      // The warm-up: the same line further east and higher, so the key hint has gone by the picture.
      const run = FLIGHT.speed * WARM_UP.seconds;
      const warm = await flyMissionAircraftAt(game, tools, {
        x: frame.x - frame.fx * run, z: frame.z - frame.fz * run, y: street + height + WARM_UP.above, heading, speed: FLIGHT.speed, climb: FLIGHT.climb,
      });
      if (!warm) return;
      tools.advance(WARM_UP.seconds);

      // On the line, low over the avenue, the towers around; the chase view chosen explicitly.
      const back = FLIGHT.speed * RUN_IN;
      const craft = await flyMissionAircraftAt(game, tools, {
        x: frame.x - frame.fx * back, z: frame.z - frame.fz * back, y: street + height, heading, speed: FLIGHT.speed, climb: FLIGHT.climb,
      });
      if (!craft) return;
      game.systems.find('followCamera')?.setFlightView?.(FLIGHT_VIEW);
      // Nothing armed: the stage's bomb is put away and the bay stays shut.
      flags.set(WORLD_FLAGS.GUIDED_BOMB_LOADED, false);
      if (commands.has(GAME_COMMANDS.WANTED_SET_LEVEL)) commands.run(GAME_COMMANDS.WANTED_SET_LEVEL, { level: tunedNumber(query, 'stars', STARS) });

      // The pair sent the way the mission sends it, its orders and guns held: an interception, no fight.
      const guard = game.systems.find('airDefence');
      if (guard && commands.has(GAME_COMMANDS.AIR_DEFENCE_SCRAMBLE)) {
        flags.set(WORLD_FLAGS.AIR_DEFENCE_OFF, false);
        commands.run(GAME_COMMANDS.AIR_DEFENCE_SCRAMBLE, { reason: 'mission' });
        commands.run(GAME_COMMANDS.AIR_DEFENCE_SCRAMBLE, { holdFire: HOLD_FIRE });
      }
      const dispatch = game.systems.find('policeDispatch');
      if (dispatch) dispatch.forceHelicopter = true;
      tools.advance(RUN_IN);
      await tools.whenIdle();

      // The hunters on their stations around him, flying with him.
      const stations = {
        uno: tunedStation(query.get('uno'), STATIONS.uno),
        dos: tunedStation(query.get('dos'), STATIONS.dos),
        heli: tunedStation(query.get('heli'), STATIONS.heli),
      };
      const pose = poseOf(craft);
      if (!pose) return;
      if (guard) holdPairOnStations(guard, pose, [stations.uno, stations.dos]);
      if (dispatch?.helicopter) placeHelicopter(game, dispatch.helicopter, pose, stations.heli);

      // The objective worded as a getaway, the stage's hint put away.
      mission.rt?.hint?.(null);
      mission.rt?.objective?.(OBJECTIVE);
      tools.advance(1 / 60);
      // The order on the radio in red, last, so no call of the pair's own replaces it before the
      // picture; held, so the wall clock of a slow capture does not take it down.
      if (commands.has(GAME_COMMANDS.STORY_LINES_STOP)) commands.run(GAME_COMMANDS.STORY_LINES_STOP, {});
      if (commands.has(GAME_COMMANDS.STORY_LINE_SPEAK)) commands.run(GAME_COMMANDS.STORY_LINE_SPEAK, { lineId: RADIO_LINE, hold: true });

      // The exterior camera, held close behind and above the aircraft where it is now.
      const now = poseOf(craft) ?? pose;
      const camera = tunedCamera(query.get('cam'));
      const eye = inFrame(now, camera.side, camera.height, camera.back);
      const look = inFrame(now, 0, 0, -camera.ahead);
      if (commands.has(GAME_COMMANDS.CAMERA_CUT_TO)) commands.run(GAME_COMMANDS.CAMERA_CUT_TO, { position: eye, target: look, fieldOfView: camera.fov });
      globalThis.__heistFrame = describeFrame(game, guard, dispatch, now, eye, look, camera.fov);
    },
  });
}

/** The aircraft's place and compass heading (radians), or null. */
function poseOf(craft) {
  const at = craft.root?.position;
  const heading = craft.car?.state?.heading;
  if (!at || !Number.isFinite(heading)) return null;
  const velocity = craft.car.body?.linearVelocity;
  const speed = Math.hypot(velocity?.x ?? 0, velocity?.z ?? 0) || FLIGHT.speed;
  return { x: at.x, y: at.y, z: at.z, heading, speed };
}

/** A point in the aircraft's frame: metres right, up and back (forward is (sin h, -cos h)). */
function inFrame(pose, right, up, back) {
  const sin = Math.sin(pose.heading);
  const cos = Math.cos(pose.heading);
  return { x: pose.x + cos * right - sin * back, y: pose.y + up, z: pose.z + sin * right + cos * back };
}

/** Puts the air guard's pair on its stations, at the aircraft's speed and heading, level. */
function holdPairOnStations(guard, pose, stations) {
  (guard.interceptors ?? []).forEach((jet, index) => {
    const station = stations[index];
    if (!jet || !station || jet.phase !== 'air') return;
    const at = inFrame(pose, station.right, station.up, station.back);
    jet.x = at.x;
    jet.y = at.y;
    jet.z = at.z;
    jet.heading = pose.heading;
    jet.speed = pose.speed;
    jet.bank = 0;
    jet.pitch = 0;
    jet.verticalSpeed = 0;
    jet.gear = 0;
    jet.stationed = false;
  });
}

/** Brings the police helicopter in at its station, flying the aircraft's way. */
function placeHelicopter(game, heli, pose, station) {
  const at = inFrame(pose, station.right, station.up, station.back);
  const ground = groundAt(game, at.x, at.z);
  const height = Math.max(20, at.y - ground);
  heli.dayStation = { altitude: height, trail: station.back, side: station.right };
  heli.altitude = height;
  heli.trail = station.back;
  heli.side = station.right;
  const speed = 40;
  heli.place(at.x, at.z, at.y, -pose.heading, Math.sin(pose.heading) * speed, -Math.cos(pose.heading) * speed);
}

/**
 * Where the subjects fall in the held frame (x and y from -1 to 1, the aspect of the page): read
 * by tuning takes (`--eval "JSON.stringify(__heistFrame)"`), never shown.
 */
function describeFrame(game, guard, dispatch, pose, eye, look, fov) {
  const view = game.view?.camera;
  const aspect = view?.aspect ?? 1.6;
  const f = normalise({ x: look.x - eye.x, y: look.y - eye.y, z: look.z - eye.z });
  const r = normalise({ x: -f.z, y: 0, z: f.x });
  const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
  const t = Math.tan((fov * DEGREES) / 2);
  const project = (p) => {
    const d = { x: p.x - eye.x, y: p.y - eye.y, z: p.z - eye.z };
    const depth = d.x * f.x + d.y * f.y + d.z * f.z;
    return [round((d.x * r.x + d.y * r.y + d.z * r.z) / depth / (t * aspect)), round((d.x * u.x + d.y * u.y + d.z * u.z) / depth / t), round(depth)];
  };
  const left = project(inFrame(pose, -HALF_SPAN, 0, 0));
  const right = project(inFrame(pose, HALF_SPAN, 0, 0));
  const jets = (guard?.interceptors ?? []).map((jet) => [jet.phase, ...project(jet)]);
  const heli = dispatch?.helicopter?.root?.position;
  return {
    manta: project(pose), share: round(Math.abs(right[0] - left[0]) / 2), jets,
    heli: heli ? project(heli) : null, stage: guard?.stage ?? null, ground: round(groundAt(game, pose.x, pose.z)), y: round(pose.y),
  };
}

function normalise(v) {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

const round = (value) => Math.round(value * 1000) / 1000;

/** A number from the page query (tuning takes), or the fallback. */
function tunedNumber(query, key, fallback) {
  const given = query.get(key);
  return given !== null && given !== '' && Number.isFinite(Number(given)) ? Number(given) : fallback;
}

/** A station from `right,up,back` in the page query (tuning takes), over the default. */
function tunedStation(given, fallback) {
  if (!given) return fallback;
  const [right, up, back] = given.split(',').map(Number);
  const pick = (value, base) => (Number.isFinite(value) ? value : base);
  return { right: pick(right, fallback.right), up: pick(up, fallback.up), back: pick(back, fallback.back) };
}

/** The camera from `back,height,side,ahead,fov` in the page query (tuning takes), over CAMERA. */
function tunedCamera(given) {
  if (!given) return CAMERA;
  const values = given.split(',').map(Number);
  const keys = ['back', 'height', 'side', 'ahead', 'fov'];
  const out = { ...CAMERA };
  keys.forEach((key, index) => { if (Number.isFinite(values[index]) && given.split(',')[index] !== '') out[key] = values[index]; });
  return out;
}
