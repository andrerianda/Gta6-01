// The mission world: everything a mission needs from the running game, behind one small
// interface so that the objective kinds stay pure (objectiveKinds.js, missionRun.js). It finds
// landmarks on the city plan, reads the player, spawns and removes mission vehicles at parked
// bays or lanes near a place, drives pursuers, rivals and fleeing targets with a simple
// steering pilot, hooks a towed car behind the tow truck, and reaches the wanted level, the
// player, the HUD and the markers through their commands. A system that is missing is skipped.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';

const TAU = Math.PI * 2;

/**
 * Creates the mission world over the game context.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {{marks?: (points: object[] | null, target: object | null) => void}} [hooks]
 */
export function createMissionWorld(context, hooks = {}) {
  const { commands, entities, events } = context;
  const places = new Map();
  const pilots = new Map();          // vehicleId -> {stuck, reversing}
  const me = { x: 0, y: 0, z: 0, heading: 0, speed: 0, vehicleId: null };
  let towing = null;
  let helpShown = false;

  const city = () => context.systems.find('openWorldCity');
  const fleet = () => context.systems.find('vehicles');
  const ground = (x, z) => city()?.groundHeightAt?.(x, z) ?? 0;
  const run = (name, payload) => (commands.has(name) ? commands.run(name, payload) : undefined);
  const catalogue = () => context.content.find('vehicleCatalog')?.VEHICLE_CATALOG ?? {};

  function place(id) {
    if (!id) return null;
    if (places.has(id)) return places.get(id);
    const landmark = city()?.plan?.landmarkById?.[id];
    let point = null;
    if (landmark) {
      const door = landmark.entrance ?? landmark;
      const x = door.x + (landmark.frontX ?? 0) * 3.5;
      const z = door.z + (landmark.frontZ ?? 0) * 3.5;
      point = { id, name: landmark.name, x, y: ground(x, z), z, frontX: landmark.frontX ?? 0, frontZ: landmark.frontZ ?? 1 };
    }
    places.set(id, point);
    return point;
  }

  function player() {
    const lead = context.systems.find('player')?.entity ?? entities.firstWithTag('player');
    if (!lead) return me;
    const vehicleId = lead.data?.vehicleId ?? null;
    const body = vehicleId ? entities.get(vehicleId) ?? lead : lead;
    me.x = body.position.x; me.y = body.position.y; me.z = body.position.z;
    me.heading = body.heading ?? 0;
    me.speed = vehicleId ? body.data?.speed ?? 0 : context.systems.find('player')?.motion?.groundSpeed ?? 0;
    me.vehicleId = vehicleId;
    return me;
  }

  function pickSpot(near, kind, minDistance, maxDistance, behindOf) {
    const points = city()?.spawnPointsNear?.(near.x, near.z, maxDistance, kind, 160) ?? [];
    let best = null, bestScore = Infinity;
    for (const point of points) {
      const gap = Math.hypot(point.x - near.x, point.z - near.z);
      if (gap < minDistance) continue;
      let score = Math.abs(gap - (minDistance + maxDistance) * 0.5);
      if (behindOf) score -= ((point.x - near.x) * Math.sin(behindOf.heading) + (point.z - near.z) * Math.cos(behindOf.heading)) * 0.5;
      for (const id of pilots.keys()) {
        const other = entities.get(id);
        if (other && Math.hypot(other.position.x - point.x, other.position.z - point.z) < 7) score += 1000;
      }
      if (score < bestScore) { bestScore = score; best = point; }
    }
    return best;
  }

  function spawnVehicle(modelId, near, options = {}) {
    const vehicles = fleet();
    if (!vehicles?.spawn || !catalogue()[modelId] || !near) return null;
    const min = options.minDistance ?? 4, max = options.maxDistance ?? 40;
    const spot = (options.parked && pickSpot(near, 'parked', min, max)) || pickSpot(near, 'vehicle', min, max, options.pursuer ? player() : null);
    const x = spot ? spot.x : near.x + min, z = spot ? spot.z : near.z;
    const id = vehicles.spawn({ modelId, position: { x, y: ground(x, z), z }, heading: -(spot ? spot.heading : 0), colour: options.colour, parked: Boolean(options.parked), ownerSystem: 'missions' });
    if (id && !options.parked) pilots.set(id, { stuck: 0, reversing: 0 });
    return id ?? null;
  }

  /** One fixed step of the steering pilot towards a point: throttle, brake and steer. */
  function drive(id, point, skill = 1) {
    const car = entities.get(id);
    const controls = fleet()?.controlsOf?.(id);
    if (!car || !controls || !point) return;
    const pilot = pilots.get(id) ?? { stuck: 0, reversing: 0 };
    pilots.set(id, pilot);
    const dx = point.x - car.position.x, dz = point.z - car.position.z;
    let error = Math.atan2(-dx, -dz) - (car.heading ?? 0);
    error -= Math.round(error / TAU) * TAU;
    const speed = car.data?.speed ?? 0;
    const step = context.simulation?.stepSeconds ?? 1 / 60;
    pilot.stuck = Math.abs(speed) < 0.8 ? pilot.stuck + step : 0;
    if (pilot.stuck > 2.2) { pilot.reversing = 1.4; pilot.stuck = 0; }
    if (pilot.reversing > 0) {
      pilot.reversing -= step;
      controls.reverse = true; controls.throttle = 0.7; controls.brake = 0; controls.steer = error > 0 ? 1 : -1;
      return;
    }
    controls.reverse = false;
    controls.handbrake = 0;
    controls.steer = Math.max(-1, Math.min(1, -error * 2.2));
    const tooFast = Math.abs(error) > 1.1 && speed > 9;
    controls.throttle = tooFast ? 0 : (Math.abs(error) < 1.3 ? 1 : 0.45) * Math.max(0.3, Math.min(1, skill));
    controls.brake = tooFast ? 0.6 : 0;
  }

  function halt(id) {
    const controls = fleet()?.controlsOf?.(id);
    pilots.delete(id);
    if (!controls) return;
    controls.throttle = 0; controls.brake = 1; controls.steer = 0; controls.reverse = false;
  }

  function tow(hook) {
    const truck = entities.get(hook.truckId);
    const record = fleet()?.get?.(hook.targetId);
    if (!truck || !record?.car || !record.entity) return;
    const h = truck.heading ?? 0;
    const hitchX = truck.position.x + Math.sin(h) * 3.4, hitchZ = truck.position.z + Math.cos(h) * 3.4;
    const towed = record.entity.position;
    let dx = hitchX - towed.x, dz = hitchZ - towed.z;
    const length = Math.hypot(dx, dz) || 1;
    dx /= length; dz /= length;
    const x = hitchX - dx * 2.5, z = hitchZ - dz * 2.5;
    record.car.placeAt(x, ground(x, z) + 0.12, z, -Math.atan2(-dx, -dz));
  }

  function pointNear(at, index, count, spacing) {
    const sideX = -(at.frontZ ?? 1), sideZ = at.frontX ?? 0;
    const along = (index - (count - 1) / 2) * spacing;
    const x = at.x + sideX * along - (at.frontX ?? 0) * 1.5, z = at.z + sideZ * along - (at.frontZ ?? 1) * 1.5;
    return { x, y: ground(x, z), z };
  }

  return {
    place, player, spawnVehicle, drive, halt, tow, pointNear,
    vehicle: (id) => (id ? entities.get(id) ?? null : null),
    removeVehicle(id) {
      pilots.delete(id);
      if (id && id !== player().vehicleId && entities.get(id)) run(GAME_COMMANDS.VEHICLE_REMOVE, { vehicleId: id });
    },
    hook(truckId, targetId) { towing = { truckId, targetId }; },
    unhook() { towing = null; },
    get towing() { return towing; },
    enterVehicle: (id) => Boolean(run(GAME_COMMANDS.PLAYER_ENTER_VEHICLE, { vehicleId: id })),
    switchLead: (characterId) => Boolean(run(GAME_COMMANDS.PLAYER_SWITCH_CHARACTER, { characterId })),
    wantedLevel: () => Number(context.systems.find('wantedLevel')?.level) || 0,
    setWanted: (level) => run(GAME_COMMANDS.WANTED_SET_LEVEL, { level }),
    clearWanted: (reason) => run(GAME_COMMANDS.WANTED_CLEAR, { reason }),
    holding: (action) => Boolean(context.input.held(action)),
    notify: (text) => run(GAME_COMMANDS.UI_NOTIFY, { text, kind: 'mission', seconds: 3 }),
    help(text) {
      if (!text && !helpShown) return;
      helpShown = Boolean(text);
      events.emit(GAME_EVENTS.HELP_PROMPT_CHANGED, text ? { action: null, text } : { action: null });
    },
    marks: (points, target) => hooks.marks?.(points, target),
  };
}
