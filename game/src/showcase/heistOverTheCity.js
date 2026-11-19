// Judged picture 4, scene `heist-over-the-city`: mission 17, POINT OF NO RETURN, the stolen Manta
// Sombra running low over the towers of Marazul in the late afternoon just before sunset, the low
// golden sun raking across the towers, with the air guard on its tail. It reads as a theft and a getaway, never as a fight (the owner's rule
// for the judged set): the two Halcón interceptors fly beside and behind the stolen aircraft with
// only their navigation lights running (no burner glow), their guns held, nothing fired; on the
// radio Halcón Uno orders the thief to follow them down (red: the hunters); the objective is to
// lose the air patrol, with the wanted stars and the minimap on the HUD. No weapon, lock, target
// box or bay door is in the picture: the bomb flag is put away, the bay stays shut. No police
// helicopter: the owner wants the jets alone in this one.
// The hour (LATE_AFTERNOON_HOURS) is just before sunset, the sun about 7 degrees up in the west:
// golden-orange light from the side with long shadows, the sky still clear above, the windows and
// street lamps not yet on. Brighter and earlier than picture 3's blue hour on the street.
// The mission itself is running (its own start command, checkpoint 3, ASSISTED), seated in the
// aircraft by the mission; the scene puts the aircraft over Gran Vía Marazul downtown, chooses the
// flight camera's chase view explicitly (a flight starts in the cockpit view) and then holds its
// own exterior camera low behind and to the right of the aircraft, looking up past the towers at
// it as it rolls hard into a left turn (BANK) with the vapour streaming from its wingtips
// (wingtipVapourTrails.js): the dark planform cut out against the blue sky, the pair rolled into
// the turn with it, the camera rolled a little with the turn (CAMERA_ROLL).
// What the scene decides and the mission does not: the clock (LATE_AFTERNOON_HOURS), the place,
// height and heading (TURN); the pair released early by the mission's own scramble and held on
// stations around the aircraft (STATIONS), burners out; the stars; the objective worded as an
// escape (OBJECTIVE) and Halcón Uno's order repeated at this moment.
// Tuning takes (never in the judged query): &hours= (18.5 to 19.4), &along=, &alt=, &turn=, &dir=,
// &cam=back,height,side,ahead,fov, &uno=right,up,back, &dos=..., &stars=, &traffic=, &look=0 (the
// hour's own look, without LATE_AFTERNOON_LOOK), &bank=, &pairbank=, &roll=, &curve=, &trails=0.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { WORLD_FLAGS } from '../core/state/worldFlags.js';
import { flyMissionAircraftAt, startFinalArc } from './finalArcStaging.js';
import { groundAt, streetFrameOf } from './showcaseStaging.js';
import { addWingtipVapourTrails, wingtipsOf } from './wingtipVapourTrails.js';

/**
 * The hour: late afternoon just before sunset (19:30 by the clock), the sun still up but low
 * (about 7 degrees, celestialPositions.sunElevationAt), golden light raking across the towers and
 * the aircraft with long shadows, the sky still blue overhead; only a few windows lit yet.
 */
const LATE_AFTERNOON_HOURS = 18.95;
/**
 * The look of this picture over the hour's own (atmosphere.lookOverride, opt-in, held only at
 * this hour): the sky clear blue overhead and orange-gold at the horizon, a strong golden-orange
 * sun with crisp shadows and less fill (contrast), light haze, and the dusk lamps and lit windows
 * held to a few (duskLampCap).
 */
const LATE_AFTERNOON_LOOK = Object.freeze({
  sunColor: [1.0, 0.62, 0.3],
  sunIntensity: 5.6,
  skyIntensity: 0.95,
  zenithTint: [0.42, 0.78, 1.5],
  horizonColor: [0.92, 0.74, 0.5],
  horizonSunColor: [1.9, 0.92, 0.34],
  horizonHeight: 0.07,
  mie: 0.3,
  hazeDensity: 0.00012,
  hazeHeight: 200,
  ambientSky: [0.48, 0.64, 1.0],
  ambientGround: [0.95, 0.64, 0.4],
  ambientIntensity: 0.38,
  envIntensity: 0.85,
  exposure: 1.18,
  bloom: 0.22,
  saturation: 1.18,
  contrast: 1.16,
  splitToning: 0.3,
  heatHaze: 0,
  sunShafts: 0.35,
  shadowSoftness: 1.1,
  duskLampCap: 0.06,
});
/** The street the aircraft crosses downtown, and where along it the picture is (0 east end, 1 west end). */
const STREET = Object.freeze({ key: 'gran_via_marazul', along: 0.55, toward: 'west' });
/**
 * Degrees the flight heading turns from the street's westward line (+ to the right): north-east
 * across downtown, so the low western sun comes in from the left, a little behind, and rakes
 * across the tower faces and the aircraft instead of backlighting them.
 */
const TURN = 110;
/** Metres over the street, true airspeed and climb (m/s). */
const FLIGHT = Object.freeze({ height: 165, speed: 92, climb: 0 });
/** The warm-up before the picture: seconds flown higher up (the pilot's key hint, 8 s, leaves the HUD), and how much higher. */
const WARM_UP = Object.freeze({ seconds: 8.6, above: 160 });
/** Seconds flown on the line before the picture, with the pair coming in. */
const RUN_IN = 1.2;
/** The aircraft the scene flies (the mission's own choice screen offers it). */
const AIRCRAFT = 'manta_sombra';
/** The objective on the HUD: a getaway. */
const OBJECTIVE = 'Lose the air patrol';
/** The radio line on screen: Halcón Uno, red (the hunters), ordering the thief to follow them down. */
const RADIO_LINE = 'airGuard.order3';
/** The flight view the scene chooses before it holds its own exterior camera. */
const FLIGHT_VIEW = 'chase';
/** The flight view of the cockpit take: the flight camera's own, at the pilot's eye. */
const COCKPIT_VIEW = 'cockpit';
/**
 * Wanted stars: the police are on the chase too. Two, under policeHelicopter's
 * DAY_HELICOPTER_STARS, so no police helicopter is called in daylight: the jets are alone.
 */
const STARS = 2;
/** Traffic on the streets under the aircraft. */
const TRAFFIC = 2.2;
/** The pair's guns and orders held for the whole picture (seconds). */
const HOLD_FIRE = 600;
/**
 * Stations around the stolen aircraft, metres in its frame (+right, +up, +back): Halcón Uno off
 * the left wing behind and above (top left of the frame, against the sky), Halcón Dos off the
 * right wing behind and a little below (right of the frame), both nearer the camera than the Manta
 * so each spans about 13 to 16 % of the frame width.
 */
const STATIONS = Object.freeze({
  uno: Object.freeze({ right: -15, up: 9, back: 24 }),
  dos: Object.freeze({ right: 24, up: -6, back: 14 }),
});
/** Half the Halcón's span (vehicleCatalog: width 9.6 m), for the debug read of its share of the frame. */
const HALCON_HALF_SPAN = 4.8;
/**
 * The exterior camera: metres behind and above (here below) the aircraft, to its right (+), the
 * point looked at ahead of it, and the vertical field of view. The banked planform, seen from below
 * against the sky, fills about half the width.
 */
const CAMERA = Object.freeze({ back: 62, height: -14, side: 30, ahead: 40, fov: 46 });
/** Where the camera aims, metres right and up of the point `ahead` (the aircraft framed a little above the centre). */
const AIM = Object.freeze({ right: -14, up: 2 });
/**
 * The getaway turn: degrees the stolen aircraft is rolled into a hard turn to the left (left wing
 * down, its sunlit upper surface toward the camera on the left), the pair rolled into it with
 * him; and the held camera's own roll with the turn (degrees), so the horizon tilts.
 */
const BANK = 24;
const PAIR_BANK = 26;
const CAMERA_ROLL = 5;
/** Metres the wingtip vapour trails bend toward the inside of the turn at their far end. */
const TRAIL_CURVE = 22;
const DEGREES = Math.PI / 180;
/** Half the Manta Sombra's span (vehicleCatalog: width 46 m), for the debug read of its share of the frame. */
const HALF_SPAN = 23;

/**
 * Registers the scene.
 * @param {object} context The game context.
 * @returns {() => void} Removes the scene again.
 */
export function registerHeistOverTheCity(context) {
  const removers = [
    context.showcase.register({
      name: 'heist-over-the-city',
      title: 'Point of no return: the getaway over Marazul',
      description: 'Mission 17 from outside: the stolen Manta Sombra low over the towers of Marazul in the last golden light before sunset, two Halcón interceptors on its tail, Halcón Uno ordering it down on the radio.',
      run: (game, tools) => runHeist(game, tools, { cockpit: false }),
    }),
    // Judged picture 4: the same moment from the pilot's eye (the flight camera's own cockpit view,
    // the gloved hands, the live displays and the combiner glass), the pair on COCKPIT_STATIONS
    // ahead of the nose where the glass shows them, the turn held shallow (COCKPIT_BANK).
    context.showcase.register({
      name: 'heist-cockpit-over-the-city',
      title: 'Point of no return: the getaway from the cockpit',
      description: 'Mission 17 from the pilot\'s seat of the stolen Manta Sombra, low between the towers of Marazul in the last golden light, a Halcón interceptor close beside the nose, Halcón Uno ordering it down on the radio.',
      run: (game, tools) => runHeist(game, tools, { cockpit: true }),
    }),
  ];
  return () => removers.forEach((remove) => remove?.());
}

/** The cockpit take: the pair ahead of the nose, either side, where the canopy shows them (+right, +up, +back). */
const COCKPIT_STATIONS = Object.freeze({
  uno: Object.freeze({ right: -22, up: -2, back: -48 }),
  dos: Object.freeze({ right: 20, up: -8, back: -150 }),
});
/** The cockpit take's bank (degrees, left wing down): a shallow turn, so the towers stay level enough to read. */
const COCKPIT_BANK = 8;
const COCKPIT_PAIR_BANK = 10;
/** The cockpit take's nose-down pitch (degrees) and height over the street (m): the towers and streets fill the glass. */
const COCKPIT_PITCH = 9;
const COCKPIT_HEIGHT = 120;

/** The scene's run, from outside (the held exterior camera) or from the cockpit (the flight camera's own). */
async function runHeist(game, tools, { cockpit }) {
  {
    {
      const { commands, flags } = game;
      const query = new URLSearchParams(globalThis.location?.search ?? '');
      const mission = await startFinalArc(game, { checkpoint: 3, aircraftId: AIRCRAFT, flightMode: 'casual' });
      if (!mission) return;
      const hours = lateAfternoonHours(query);
      commands.run(GAME_COMMANDS.TIME_SET, { hours });
      // This picture's sky, sun, haze and windows (held only at this hour; `&look=0` for takes).
      if (game.atmosphere && query.get('look') !== '0') game.atmosphere.lookOverride = { ...LATE_AFTERNOON_LOOK, hours };
      if (commands.has(GAME_COMMANDS.WEATHER_SET)) commands.run(GAME_COMMANDS.WEATHER_SET, { weather: 'clear', seconds: 0 });
      if (commands.has(GAME_COMMANDS.TRAFFIC_SET_DENSITY)) commands.run(GAME_COMMANDS.TRAFFIC_SET_DENSITY, { scale: tunedNumber(query, 'traffic', TRAFFIC) });

      const along = tunedNumber(query, 'along', STREET.along);
      const street0 = streetFrameOf(game, STREET.key, along > 0 && along < 1 ? along : STREET.along);
      // West along the avenue turned by TURN, so the low sun rakes in from the side (`&dir=east`, `&turn=`: takes only).
      const sign = (query.get('dir') ?? STREET.toward) === 'east' ? -1 : 1;
      const turn = tunedNumber(query, 'turn', TURN) * DEGREES;
      const fx = (street0.fx * Math.cos(turn) - street0.fz * Math.sin(turn)) * sign;
      const fz = (street0.fz * Math.cos(turn) + street0.fx * Math.sin(turn)) * sign;
      const frame = { ...street0, fx, fz, compass: Math.atan2(fx, -fz) };
      const heading = frame.compass / DEGREES;
      const street = groundAt(game, frame.x, frame.z);
      const height = tunedNumber(query, 'alt', cockpit ? COCKPIT_HEIGHT : FLIGHT.height);

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
      game.systems.find('followCamera')?.setFlightView?.(cockpit ? COCKPIT_VIEW : FLIGHT_VIEW);
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
      // No police helicopter in this picture: STARS stays under the daylight call, none is forced,
      // and one already up is sent away below.
      const dispatch = game.systems.find('policeDispatch');
      if (dispatch) dispatch.forceHelicopter = false;
      tools.advance(RUN_IN);
      await tools.whenIdle();

      // The hunters on their stations around him, flying with him.
      const base = cockpit ? COCKPIT_STATIONS : STATIONS;
      const stations = {
        uno: tunedStation(query.get('uno'), base.uno),
        dos: tunedStation(query.get('dos'), base.dos),
      };
      const pose = poseOf(craft);
      if (!pose) return;
      const pairBank = tunedNumber(query, 'pairbank', cockpit ? COCKPIT_PAIR_BANK : PAIR_BANK) * DEGREES;
      if (guard) holdPairOnStations(guard, pose, [stations.uno, stations.dos], pairBank);
      if (dispatch?.helicopter?.active) dispatch.helicopter.remove?.();

      // The objective worded as a getaway, the stage's hint put away.
      mission.rt?.hint?.(null);
      mission.rt?.objective?.(OBJECTIVE);
      tools.advance(1 / 60);
      // The order on the radio in red, last, so no call of the pair's own replaces it before the
      // picture; held, so the wall clock of a slow capture does not take it down.
      if (commands.has(GAME_COMMANDS.STORY_LINES_STOP)) commands.run(GAME_COMMANDS.STORY_LINES_STOP, {});
      if (commands.has(GAME_COMMANDS.STORY_LINE_SPEAK)) commands.run(GAME_COMMANDS.STORY_LINE_SPEAK, { lineId: RADIO_LINE, hold: true });

      // The clock set again: the warm-up and run-in moved it on about ten minutes.
      commands.run(GAME_COMMANDS.TIME_SET, { hours });
      const now = poseOf(craft) ?? pose;
      if (cockpit) {
        // From the pilot's eye: the flight camera places itself in the cockpit; the aircraft is
        // rolled a little into the turn and the pair held on its stations again where it is now.
        rollInto(craft, tunedNumber(query, 'bank', COCKPIT_BANK) * DEGREES, tunedNumber(query, 'pitch', COCKPIT_PITCH) * DEGREES);
        if (guard) holdPairOnStations(guard, now, [stations.uno, stations.dos], pairBank);
        if (dispatch?.helicopter?.active) dispatch.helicopter.remove?.();
        tools.advance(1 / 60);
        const view = game.view?.camera;
        globalThis.__heistFrame = { view: game.systems.find('followCamera')?.flightView ?? null, fov: view?.fov ?? null, hours: round(game.atmosphere?.state?.timeOfDay ?? 0), jets: (guard?.interceptors ?? []).map((jet) => [jet.phase, round(jet.x - now.x), round(jet.y - now.y), round(jet.z - now.z)]) };
        return;
      }
      // The exterior camera, held close behind and above the aircraft where it is now.
      const camera = tunedCamera(query.get('cam'));
      const eye = inFrame(now, camera.side, camera.height, camera.back);
      const look = inFrame(now, AIM.right, AIM.up, -camera.ahead);
      // Rolled hard into the getaway turn, and the vapour streaming from its wingtips.
      const bank = tunedNumber(query, 'bank', BANK) * DEGREES;
      rollInto(craft, bank);
      const tips = query.get('trails') === '0' ? null : wingtipsOf(craft.root);
      if (tips && game.view?.scene) {
        addWingtipVapourTrails(game.view.scene, {
          tips, eye,
          back: { x: -Math.sin(now.heading), y: 0, z: Math.cos(now.heading) },
          side: { x: -Math.cos(now.heading), y: 0, z: -Math.sin(now.heading) },
          curve: tunedNumber(query, 'curve', TRAIL_CURVE),
          // Ending short of the camera, so they stream past it and never across the lens.
          length: camera.back * 0.85,
        });
      }
      tiltCamera(game.view?.camera, eye, look, tunedNumber(query, 'roll', CAMERA_ROLL) * DEGREES);
      if (commands.has(GAME_COMMANDS.CAMERA_CUT_TO)) commands.run(GAME_COMMANDS.CAMERA_CUT_TO, { position: eye, target: look, fieldOfView: camera.fov });
      if (dispatch?.helicopter?.active) dispatch.helicopter.remove?.();
      globalThis.__heistFrame = describeFrame(game, guard, dispatch, now, eye, look, camera.fov);
      if (tips) globalThis.__heistFrame.tips = [tips.left, tips.right].map((tip) => [tip.x - now.x, tip.y - now.y, tip.z - now.z].map(round));
      globalThis.__heistProbe = () => describeFrame(game, guard, dispatch, now, eye, look, camera.fov);
    }
  }
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

/**
 * Rolls the aircraft about its own fore-and-aft axis by `bank` radians to the left (left wing
 * down), in place: its body and its model, which the frame draws from the body.
 */
function rollInto(craft, bank, dive = 0) {
  const body = craft.car?.body;
  if (!body?.quaternion || !body.position || typeof body.setPose !== 'function' || (!bank && !dive)) return;
  const q = body.quaternion;
  // q * (rotation about the body's own z axis, +bank: the right wing rises).
  const s = Math.sin(bank / 2);
  const c = Math.cos(bank / 2);
  let rolled = { x: q.x * c + q.y * s, y: q.y * c - q.x * s, z: q.z * c + q.w * s, w: q.w * c - q.z * s };
  if (dive) {
    // Then the nose lowered by `dive` radians: about the body's own x axis (+ raises the nose).
    const p = rolled;
    const sx = Math.sin(-dive / 2);
    const cx = Math.cos(-dive / 2);
    rolled = { x: p.w * sx + p.x * cx, y: p.y * cx + p.z * sx, z: p.z * cx - p.y * sx, w: p.w * cx - p.x * sx };
  }
  body.setPose(body.position.x, body.position.y, body.position.z, rolled);
  if (craft.root?.quaternion) {
    craft.root.quaternion.set(rolled.x, rolled.y, rolled.z, rolled.w);
    craft.root.updateMatrixWorld(true);
  }
}

/** Rolls the held camera's up direction about its line of sight by `roll` radians (with a left turn). */
function tiltCamera(camera, eye, look, roll) {
  if (!camera?.up || !roll) return;
  const f = normalise({ x: look.x - eye.x, y: look.y - eye.y, z: look.z - eye.z });
  const r = normalise({ x: -f.z, y: 0, z: f.x });
  const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
  // Up turned toward the right of the view: the horizon tilts down to the left, with the turn.
  const c = Math.cos(roll);
  const s = Math.sin(roll);
  camera.up.set(u.x * c + r.x * s, u.y * c + r.y * s, u.z * c + r.z * s);
}

/** Puts the air guard's pair on its stations, at the aircraft's speed and heading, in the turn with him. */
function holdPairOnStations(guard, pose, stations, bank = 0) {
  (guard.interceptors ?? []).forEach((jet, index) => {
    const station = stations[index];
    if (!jet || !station || jet.phase !== 'air') return;
    const at = inFrame(pose, station.right, station.up, station.back);
    jet.x = at.x;
    jet.y = at.y;
    jet.z = at.z;
    jet.heading = pose.heading;
    jet.speed = pose.speed;
    // Left wing down with the stolen aircraft (the pair's bank is + to the right).
    jet.bank = -bank;
    jet.pitch = 0;
    jet.verticalSpeed = 0;
    jet.gear = 0;
    jet.stationed = false;
    // Cruising with the stolen aircraft: the burner the take-off roll lit is out (no tail glow).
    jet.afterburner = false;
  });
}

/** The hour of the picture, or the page's `&hours=` when it gives one between 18.5 and 19.4 (takes only). */
function lateAfternoonHours(query) {
  const given = Number(query.get('hours'));
  return given >= 18.5 && given <= 19.4 ? given : LATE_AFTERNOON_HOURS;
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
  const jets = (guard?.interceptors ?? []).map((jet) => {
    const at = project(jet);
    const span = Math.abs(project(inFrame(jet, HALCON_HALF_SPAN, 0, 0))[0] - project(inFrame(jet, -HALCON_HALF_SPAN, 0, 0))[0]) / 2;
    return [jet.phase, ...at, round(span), Boolean(jet.afterburner)];
  });
  // The jets' nozzles as drawn: [colour, emissive intensity] of each lamp_burner mesh.
  const nozzles = [];
  game.view?.scene?.traverse?.((node) => {
    if (node.isMesh && node.material?.name === 'lamp_burner' && node.parent && hasAncestor(node, 'air_guard_interceptor')) {
      nozzles.push([node.material.color?.getHexString?.(), node.material.emissiveIntensity, node.visible]);
    }
  });
  return {
    lamps: game.atmosphere?.state?.duskLampCap ?? null, hours: round(game.atmosphere?.state?.timeOfDay ?? 0),
    manta: project(pose), share: round(Math.abs(right[0] - left[0]) / 2), jets, nozzles,
    heli: dispatch?.helicopter?.active ? 'active' : null, stage: guard?.stage ?? null, ground: round(groundAt(game, pose.x, pose.z)), y: round(pose.y),
  };
}

function hasAncestor(node, name) {
  for (let at = node.parent; at; at = at.parent) if (at.name === name) return true;
  return false;
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
