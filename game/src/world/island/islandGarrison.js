// The garrison of the Federasi Norvast on the island: sentries by the hangar and along the strip
// (the crowd's own people, archetype `norvast_soldier`, posted where they stand) and a few parked
// vehicles on the apron. They are mustered when the lead comes near and dismissed with the zone;
// an archetype or a vehicle model the catalogs do not have yet is skipped quietly. This file also
// holds the plan of what they keep there: the stores and ground equipment (ISLAND_PROPS) and the
// grass and scrub by the strip (planIslandPlanting), which islandAirfield.js draws.
import { GAME_COMMANDS } from '../../core/events/gameCommands.js';
import { VEHICLE_CATALOG } from '../../catalog/vehicleCatalog.js';
import { PEDESTRIAN_ARCHETYPES } from '../../catalog/pedestrianArchetypes.js';
import { NORVAST_ISLAND_SHAPE as SHAPE, islandHeightLocal } from './norvastIslandShape.js';

const SOLDIER = 'norvast_soldier';
/** Sentry posts in the island frame: [u, v]. */
export const SENTRY_POSTS = Object.freeze([
  [322, 78], [388, 78], [355, 60], [300, 40], [430, 122],
  [-380, 27], [-100, -26], [150, 27], [470, -26], [520, 30],
]);
/** Parked vehicles in the island frame: [model, u, v, compass heading]. */
export const PARKED = Object.freeze([
  ['army_truck', 262, 140, 105], ['army_truck', 274, 140, 105], ['patrol_jeep', 300, 66, 285], ['patrol_jeep', -360, 34, 105],
]);

/**
 * The garrison's stores and ground equipment on the apron (items of military/base_ground_kit.glb,
 * drawn by islandAirfield.js), in the island frame: [node, u, v, turn] (turn: rotation about +Y;
 * 0 leaves the item's front towards -v, the strip). The hangar stands on u 325..385, v 83..127.
 */
export const ISLAND_PROPS = Object.freeze([
  // Fuel drums in rows east of the hangar, crates on pallets west of it.
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => Object.freeze(['gse_drum', 393.2 + (i % 4) * 0.74, 131.6 + Math.floor(i / 4) * 0.74, i * 1.3])),
  ['gse_drum', 399.4, 133.6, 0.4], ['gse_drum', 400.2, 134.3, 2.2],
  ['gse_crate_stack', 311, 96, 0.05], ['gse_crate_stack', 309.2, 97.8, 1.5], ['gse_crate_stack', 311.4, 99.6, -0.1],
  ['gse_crate_stack', 308.8, 101, 0.2], ['gse_crate_stack', 310.6, 103, 1.62],
  // By the hangar's mouth on the strip side: power unit, tools, extinguishers, the tug that pulls the aircraft in.
  ['gse_generator', 318, 76.5, -0.5], ['gse_tool_trolley', 392, 80.5, 0.3], ['gse_fire_extinguisher_cart', 393.6, 84.2, 1.2],
  ['gse_fire_extinguisher_cart', 316.4, 84.2, -1.1], ['gse_tug', 374, 71, 0.25], ['gse_stairs', 397.5, 97, Math.PI],
  ['gse_fuel_truck', 414, 74, Math.PI / 2], ['gse_chocks', 353.6, 104, 0], ['gse_chocks', 356.4, 104, 0],
  ['gse_cone', 327, 74, 0], ['gse_cone', 383, 74, 0], ['gse_cone', 327, 64, 0], ['gse_cone', 383, 64, 0], ['gse_cone', 411, 69.5, 0], ['gse_cone', 417, 78.5, 0],
]);

const hash = (a, b) => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * Where grass and scrub grow by the strip, in the island frame (x along the strip, z to its
 * north): fringes along both edges, clusters over the flat valley floor, bushes towards the foot
 * of the slopes; nothing on the paving. The same on every build.
 * @returns {{grass: {variant: string, x: number, y: number, z: number, turn: number, scale: number}[],
 *   scrub: {variant: string, x: number, y: number, z: number, turn: number, scale: number}[]}}
 */
export function planIslandPlanting() {
  const { u0, u1, halfWidth, y } = SHAPE.stripLocal;
  const apron = SHAPE.apronLocal;
  const pad = SHAPE.padLocal;
  let n = 0;
  const random = () => hash((n += 1), 7717);
  const between = (low, high) => low + (high - low) * random();
  const flat = (u, v) => Math.abs(islandHeightLocal(u, v) - y) < 0.02 && Math.abs(islandHeightLocal(u + 1.5, v + 1.5) - y) < 0.02;
  const paved = (u, v, margin) => (u > u0 - margin && u < u1 + margin && Math.abs(v) < halfWidth + margin)
    || (u > apron.u0 - margin && u < apron.u1 + margin && v > apron.v0 - margin && v < apron.v1 + margin)
    || Math.hypot(u - pad.u, v - pad.v) < pad.radius + margin;
  const grass = [];
  const scrub = [];
  const tuft = (variant, u, v, scale) => {
    if (!paved(u, v, 0.4) && flat(u, v)) grass.push({ variant, x: u, y, z: v, turn: between(0, Math.PI * 2), scale });
  };
  // Fringes along both edges of the strip.
  for (const side of [-1, 1]) {
    for (let u = u0 - 6; u < u1; u += between(1.2, 3.6)) tuft(random() < 0.85 ? 'variant_c' : 'variant_a', u, side * (halfWidth + between(0.5, 3.4)), between(0.9, 1.9));
  }
  // Clusters over the valley floor either side, bushes towards the foot of the slopes.
  for (let i = 0; i < 420; i += 1) {
    const u = between(u0 - 40, u1);
    const v = (random() < 0.5 ? -1 : 1) * between(halfWidth + 3, 62);
    if (paved(u, v, 2) || !flat(u, v)) continue;
    const size = between(0.6, 1);
    tuft('variant_d', u, v, between(1.2, 2.4));
    const count = Math.round(between(4, 11) * size);
    for (let k = 0; k < count; k += 1) {
      const angle = between(0, Math.PI * 2);
      const reach = Math.sqrt(random()) * 5 * size;
      tuft('variant_c', u + Math.cos(angle) * reach, v + Math.sin(angle) * reach, between(0.9, 2.2) * size);
    }
    if (Math.abs(v) > 40 && random() < 0.5) {
      scrub.push({ variant: random() < 0.5 ? 'variant_a' : 'variant_b', x: u + between(-2, 2), y, z: v + between(-2, 2), turn: between(0, Math.PI * 2), scale: between(0.6, 1.3) });
    }
  }
  return { grass, scrub: scrub.filter((bush) => flat(bush.x, bush.z) && !paved(bush.x, bush.z, 3)) };
}
const MUSTER_WITHIN = 1150, STAND_DOWN_BEYOND = 1650;

/**
 * Creates the garrison.
 * @param {import('../../core/systems/gameContext.js').GameContext} context The game context.
 * @returns {{update: (focusDistance: number) => void, dismiss: () => void, sentries: number, vehicles: number}}
 */
export function createIslandGarrison(context) {
  const vehicleIds = [];
  let posted = false;
  const y = SHAPE.stripLocal.y;

  function muster() {
    posted = true;
    garrison.sentries = 0;
    if (PEDESTRIAN_ARCHETYPES[SOLDIER]) {
      for (const [u, v] of SENTRY_POSTS) {
        const at = SHAPE.toWorld(u, v);
        try {
          const id = context.commands.run(GAME_COMMANDS.PEDESTRIAN_SPAWN, { archetypeId: SOLDIER, position: { x: at.x, y, z: at.z } });
          if (id === null || id === undefined) continue;
          const entity = context.entities.get(id);
          // Posted people stay where they stand and are kept at long range by the crowd.
          if (entity && entity.data) entity.data.posted = true;
          garrison.sentries += 1;
        } catch (error) {
          context.log.debug?.(`norvastIsland: no sentry (${error.message})`);
          break;
        }
      }
    }
    if (vehicleIds.length > 0) return;
    for (const [modelId, u, v, compass] of PARKED) {
      if (!VEHICLE_CATALOG[modelId]) continue;
      const at = SHAPE.toWorld(u, v);
      try {
        const id = context.commands.run(GAME_COMMANDS.VEHICLE_SPAWN, {
          modelId, position: { x: at.x, y, z: at.z }, heading: (-compass * Math.PI) / 180, parked: true, clearance: false,
        });
        if (id !== null && id !== undefined) vehicleIds.push(id);
      } catch (error) {
        context.log.debug?.(`norvastIsland: no ${modelId} (${error.message})`);
      }
    }
    garrison.vehicles = vehicleIds.length;
  }

  const garrison = {
    sentries: 0,
    vehicles: 0,
    /** Musters when the lead is near, and forgets the sentries once the crowd has let them go. */
    update(focusDistance) {
      if (!posted && focusDistance < MUSTER_WITHIN) muster();
      else if (posted && focusDistance > STAND_DOWN_BEYOND) { posted = false; garrison.sentries = 0; }
    },
    dismiss() {
      for (const vehicleId of vehicleIds) {
        try { context.commands.run(GAME_COMMANDS.VEHICLE_REMOVE, { vehicleId }); } catch { /* already gone */ }
      }
      vehicleIds.length = 0;
      garrison.vehicles = 0;
      // The sentries are the crowd's: it lets posted people go once the lead is far away.
      garrison.sentries = 0;
      posted = false;
    },
  };
  return garrison;
}
