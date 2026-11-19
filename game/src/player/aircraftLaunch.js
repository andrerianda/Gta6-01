// The launch flags of the flight phase (core/boot/launchOptions.js), acted on once the game is
// ready: ?aircraft=<id> puts the lead in that aircraft's seat on the Los Pantanos runway
// threshold with the engine running; &air=<metres> starts it in flight that high over the field
// at cruise speed instead; &flightview and &flightmode choose the camera and the flight mode.
// Without &flightview the flight starts in the cockpit, as every flight does.
// For captures and for trying an aircraft without walking to it:
//   index.html?autostart=1&aircraft=gaviota_t2&air=300&flightview=cockpit&flightmode=realistic
// &stage=base starts on runway 27 of Base Aérea Punta Garza instead (east threshold, heading 276);
// ?autostart=1&stage=base without an aircraft puts the lead on foot on the base's apron.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { runwayThreshold } from '../vehicles/aerodromeTrainer.js';

/** The value of `?stage=` that stages the air base. */
const BASE_STAGE = 'base';
/** The longest the launch waits for the aircraft's cockpit model before seating the lead anyway. */
const COCKPIT_WAIT_MS = 15000;

/**
 * Arms the aircraft launch when the page asked for one.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {{seat: {enter: (vehicleId: unknown) => boolean}}} lead The player's lead (playerLead.js).
 * @returns {() => void} Disarms it.
 */
export function armAircraftLaunch(context, lead) {
  const launch = context.launch ?? {};
  const atBase = launch.stage === BASE_STAGE;
  if ((!launch.aircraft && !atBase) || launch.shot) return () => {};
  const result = { vehicleId: null, error: null };
  const onReady = () => {
    context.events.off(GAME_EVENTS.GAME_READY, onReady);
    if (!launch.aircraft) {
      // ?stage=base on foot: the lead stands on the apron of Punta Garza, facing the stands.
      const spot = context.systems.find('airBase')?.layout?.visitorSpot;
      if (spot) context.commands.send(GAME_COMMANDS.PLAYER_TELEPORT, { position: { x: spot.x, z: spot.z }, heading: -spot.heading });
      else context.log?.warn?.('aircraft launch: the air base is not laid out');
      return;
    }
    launchAircraft(context, lead, launch).then((vehicleId) => { result.vehicleId = vehicleId; }, (error) => {
      result.error = error instanceof Error ? error.message : String(error);
      context.log?.warn?.(`aircraft launch: ${result.error}`);
    });
  };
  context.events.on(GAME_EVENTS.GAME_READY, onReady);
  lead.aircraftLaunch = result;
  return () => context.events.off(GAME_EVENTS.GAME_READY, onReady);
}

/**
 * Spawns the aircraft and seats the lead in it.
 * @returns {Promise<unknown>} The aircraft's vehicle id, or null when it could not be done.
 */
export async function launchAircraft(context, lead, launch) {
  const catalog = context.content.get('vehicleCatalog').VEHICLE_CATALOG;
  const entry = catalog[launch.aircraft];
  if (!entry || entry.class !== 'airplane') throw new Error(`no aircraft "${launch.aircraft}" in the vehicle catalog`);
  const fleet = context.systems.find('vehicles');
  // &stage=base: runway 27 of Base Aérea Punta Garza, from its east threshold out over the sea.
  const baseRunway = launch.stage === BASE_STAGE ? context.systems.find('airBase')?.runway ?? null : null;
  const runway = baseRunway
    ? { x0: baseRunway.x1, z0: baseRunway.z1, x1: baseRunway.x0, z1: baseRunway.z0, y: baseRunway.y, width: baseRunway.width, length: baseRunway.length, heading: ((baseRunway.heading + 180) * Math.PI) / 180 }
    : fleet ? fleet.runway : null;
  if (!runway) throw new Error('no runway in the city plan');
  const assets = context.assets;
  if (assets && assets.registry && assets.registry[entry.id] && !assets.has(entry.id)) {
    try { await assets.load([entry.id]); } catch { /* the fleet's stand-in body flies as well */ }
  }
  // Every flight starts in the cockpit: its model (asked for by the flight deck at boot) is in
  // memory before the lead takes the seat, so the first flying frame is the cockpit's.
  const deck = context.systems.find('flightDeck');
  if (deck && typeof deck.preloadCockpit === 'function') {
    let timer = null;
    const patience = new Promise((resolve) => { timer = setTimeout(resolve, COCKPIT_WAIT_MS, false); });
    try { await Promise.race([deck.preloadCockpit(entry.id), patience]); } catch { /* the chase framing waits for it instead */ }
    clearTimeout(timer);
  }
  if (launch.flightMode && context.settings) context.settings.set('flightMode', launch.flightMode);
  const start = runwayThreshold(runway, 1, baseRunway ? 30 : undefined);
  const flying = typeof launch.air === 'number' && launch.air > 0;
  // &at=x,z places the aircraft anywhere (in flight with &air, else standing there); &hdg turns it.
  if (typeof launch.heading === 'number') start.heading = (launch.heading * Math.PI) / 180;
  const position = flying
    ? { x: (runway.x0 + runway.x1) / 2, y: runway.y + launch.air, z: (runway.z0 + runway.z1) / 2 }
    : { x: start.x, z: start.z };
  if (launch.at) {
    position.x = launch.at.x;
    position.z = launch.at.z;
    if (flying) position.y = launch.air;
  }
  const vehicleId = fleet.spawn({ modelId: entry.id, position, heading: start.heading, parked: !flying, ownerSystem: 'player' });
  if (vehicleId == null || !lead.seat.enter(vehicleId)) throw new Error('the aircraft could not be boarded');
  const camera = context.systems.find('followCamera');
  if (launch.flightView && camera && typeof camera.setFlightView === 'function') camera.setFlightView(launch.flightView);
  context.events.emit(GAME_EVENTS.PLAYER_TELEPORTED, { position: { x: position.x, y: position.y ?? runway.y, z: position.z }, heading: -start.heading });
  return vehicleId;
}
