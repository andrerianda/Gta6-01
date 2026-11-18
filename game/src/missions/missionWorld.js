// The mission world: everything a mission needs from the running game, behind one small
// interface so that the objective kinds stay pure (objectiveKinds.js, missionRun.js). It finds
// landmarks on the city plan (snapped onto the pavement in front of the door), reads the player,
// spawns and removes mission vehicles at parked bays or lanes near a place, drives pursuers,
// rivals and fleeing targets along the lane graph (missionCarPilot.js), hooks a towed car behind
// the tow truck, stands up and fights enemy squads (missionEnemies.js), and reaches the wanted
// level, the player, the HUD and the markers through their commands. A missing system is skipped.
import { GAME_COMMANDS } from '../core/events/gameCommands.js';
import { GAME_EVENTS } from '../core/events/gameEvents.js';
import { createMissionCarPilot } from './missionCarPilot.js';
import { createMissionEnemies } from './missionEnemies.js';

/** Metres behind the truck's centre where the wheel-lift boom grips (the truck's tail + a boom). */
const BOOM_REACH = 0.65;

/**
 * Creates the mission world over the game context.
 * @param {import('../core/systems/gameContext.js').GameContext} context
 * @param {{marks?: (points: object[] | null, target: object | null) => void}} [hooks]
 */
export function createMissionWorld(context, hooks = {}) {
  const { commands, entities, events } = context;
  const places = new Map();
  const me = { x: 0, y: 0, z: 0, heading: 0, speed: 0, vehicleId: null };
  let towing = null;
  let helpShown = false;

  const city = () => context.systems.find('openWorldCity');
  const fleet = () => context.systems.find('vehicles');
  const ground = (x, z) => city()?.groundHeightAt?.(x, z) ?? 0;
  const run = (name, payload) => (commands.has(name) ? commands.run(name, payload) : undefined);
  const catalogue = () => context.content.find('vehicleCatalog')?.VEHICLE_CATALOG ?? {};
  const halfLength = (modelId) => (catalogue()[modelId]?.dimensions?.length ?? 4.8) / 2;
  const pilot = createMissionCarPilot({ entities, fleet, city, stepSeconds: () => context.simulation?.stepSeconds ?? 1 / 60 });
  const enemies = createMissionEnemies(context);

  function place(id) {
    if (!id) return null;
    if (places.has(id)) return places.get(id);
    const landmark = city()?.plan?.landmarkById?.[id];
    let point = null;
    if (landmark) {
      const door = landmark.entrance ?? landmark;
      const frontX = landmark.frontX ?? 0, frontZ = landmark.frontZ ?? 1;
      let x = door.x + frontX * 3.5, z = door.z + frontZ * 3.5;
      // Onto the pavement: the nearest walkable point that is not behind the door.
      const walk = city()?.spawnPointsNear?.(x, z, 7, 'pedestrian', 48) ?? [];
      let best = null, bestGap = Infinity;
      for (const spot of walk) {
        const out = (spot.x - door.x) * frontX + (spot.z - door.z) * frontZ;
        const gap = Math.hypot(spot.x - x, spot.z - z);
        if (out > 1.2 && gap < bestGap) { bestGap = gap; best = spot; }
      }
      if (best) { x = best.x; z = best.z; }
      point = { id, name: landmark.name, x, y: ground(x, z), z, frontX, frontZ };
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
      for (const id of pilot.ids()) {
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
    if (id && !options.parked) pilot.track(id);
    return id ?? null;
  }

  /**
   * Keeps a hooked car on the boom: nose first when it was backed up to nose to tail, tail first
   * when the truck came at its back; it swings about the boom as the truck turns.
   */
  function tow(hook) {
    const truck = entities.get(hook.truckId);
    const record = fleet()?.get?.(hook.targetId);
    if (!truck || !record?.car || !record.entity) return;
    const h = truck.heading ?? 0;
    const reach = halfLength(truck.data?.modelId) + BOOM_REACH;
    const hitchX = truck.position.x + Math.sin(h) * reach, hitchZ = truck.position.z + Math.cos(h) * reach;
    const towed = record.entity.position;
    let dx = hitchX - towed.x, dz = hitchZ - towed.z;
    const length = Math.hypot(dx, dz) || 1;
    dx /= length; dz /= length;
    const back = halfLength(record.entity.data?.modelId) + 0.25;
    const x = hitchX - dx * back, z = hitchZ - dz * back;
    // Entity heading facing the hitch is atan2(-dx, -dz); physics headings are its negative.
    const facing = Math.atan2(-dx, -dz) + (hook.tailFirst ? Math.PI : 0);
    record.car.placeAt(x, ground(x, z) + 0.12, z, -facing);
  }

  function pointNear(at, index, count, spacing) {
    const sideX = -(at.frontZ ?? 1), sideZ = at.frontX ?? 0;
    const along = (index - (count - 1) / 2) * spacing;
    const x = at.x + sideX * along - (at.frontX ?? 0) * 1.5, z = at.z + sideZ * along - (at.frontZ ?? 1) * 1.5;
    return { x, y: ground(x, z), z };
  }

  return {
    place, player, spawnVehicle, tow, pointNear,
    drive: (id, point, skill = 1, how) => pilot.drive(id, point, skill, how),
    halt: (id) => pilot.halt(id),
    vehicle: (id) => (id ? entities.get(id) ?? null : null),
    removeVehicle(id) {
      pilot.forget(id);
      if (id && id !== player().vehicleId && entities.get(id)) run(GAME_COMMANDS.VEHICLE_REMOVE, { vehicleId: id });
    },
    hook(truckId, targetId) {
      const truck = entities.get(truckId), car = entities.get(targetId);
      // Tail first when the car faces the same way as the truck's back (the truck came at its tail).
      const tailFirst = Boolean(truck && car && Math.cos((truck.heading ?? 0) - (car.heading ?? 0)) < 0);
      towing = { truckId, targetId, tailFirst };
    },
    unhook() { towing = null; },
    get towing() { return towing; },
    /** Distance from the truck's boom to the nearest end of a car (for the hook check). */
    boomGap(truckId, targetId) {
      const truck = entities.get(truckId), car = entities.get(targetId);
      if (!truck || !car) return Infinity;
      const h = truck.heading ?? 0, reach = halfLength(truck.data?.modelId) + BOOM_REACH * 0.5;
      const bx = truck.position.x + Math.sin(h) * reach, bz = truck.position.z + Math.cos(h) * reach;
      const ch = car.heading ?? 0, half = halfLength(car.data?.modelId);
      const nose = Math.hypot(car.position.x - Math.sin(ch) * half - bx, car.position.z - Math.cos(ch) * half - bz);
      const tail = Math.hypot(car.position.x + Math.sin(ch) * half - bx, car.position.z + Math.cos(ch) * half - bz);
      return Math.min(nose, tail);
    },
    spawnSquad: (groups, near, how) => enemies.spawnSquad(groups, near, how),
    fightSquad: (squad, dt) => enemies.fight(squad, dt),
    nearestEnemy: (squad, from) => enemies.nearest(squad, from),
    releaseSquad: (squad) => enemies.release(squad),
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
