// The launch flags of the flight phase (core/boot/launchOptions.js), acted on once the game is
// ready: ?aircraft=<id> puts the lead in that aircraft's seat on the Los Pantanos runway
// threshold with the engine running; &air=<metres> starts it in flight that high over the field
// at cruise speed instead; &flightview and &flightmode choose the camera and the flight mode.
// For captures and for trying an aircraft without walking to it:
//   index.html?autostart=1&aircraft=gaviota_t2&air=300&flightview=cockpit&flightmode=realistic
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { runwayThreshold } from '../vehicles/aerodromeTrainer.js';

/**
 * Arms the aircraft launch when the page asked for one.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {{seat: {enter: (vehicleId: unknown) => boolean}}} lead The player's lead (playerLead.js).
 * @returns {() => void} Disarms it.
 */
export function armAircraftLaunch(context, lead) {
  const launch = context.launch ?? {};
  if (!launch.aircraft || launch.shot) return () => {};
  const result = { vehicleId: null, error: null };
  const onReady = () => {
    context.events.off(GAME_EVENTS.GAME_READY, onReady);
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
  const runway = fleet ? fleet.runway : null;
  if (!runway) throw new Error('no runway in the city plan');
  const assets = context.assets;
  if (assets && assets.registry && assets.registry[entry.id] && !assets.has(entry.id)) {
    try { await assets.load([entry.id]); } catch { /* the fleet's stand-in body flies as well */ }
  }
  if (launch.flightMode && context.settings) context.settings.set('flightMode', launch.flightMode);
  const start = runwayThreshold(runway, 1);
  const flying = typeof launch.air === 'number' && launch.air > 0;
  const position = flying
    ? { x: (runway.x0 + runway.x1) / 2, y: runway.y + launch.air, z: (runway.z0 + runway.z1) / 2 }
    : { x: start.x, z: start.z };
  const vehicleId = fleet.spawn({ modelId: entry.id, position, heading: start.heading, parked: !flying, ownerSystem: 'player' });
  if (vehicleId == null || !lead.seat.enter(vehicleId)) throw new Error('the aircraft could not be boarded');
  const camera = context.systems.find('followCamera');
  if (launch.flightView && camera && typeof camera.setFlightView === 'function') camera.setFlightView(launch.flightView);
  context.events.emit(GAME_EVENTS.PLAYER_TELEPORTED, { position: { x: position.x, y: position.y ?? runway.y, z: position.z }, heading: -start.heading });
  return vehicleId;
}
