// Sector street items: every lamp, roadside plant and junction control object of one sector, as
// plain data, kept only where the built street has pavement, verge or a planted median
// (streetClearance.js), with no plant on the spot of a lamp or a signal. Pure; cityDressing.js
// turns the result into instanced batches, the tests check it against the lanes.
import { layOutRoadsidePlanting } from '../vegetation/roadsidePlantingLayout.js';
import { clearPlantingAround, layOutJunctionControls } from './junctionControlLayout.js';
import { layOutBuildingClutter, layOutOpenLotFence, layOutSidewalkClutter, layOutYardStock, STOCKED_YARDS } from './streetClutterLayout.js';
import { layOutContainerTerminal } from './portTerminalLayout.js';
import { insideBounds, layOutStreetLamps } from './streetFurnitureLayout.js';

/** Radii (metres) the clearance keeps around each kind: trunks, poles, signal masts. */
export const ITEM_RADIUS = Object.freeze({ plant: 0.45, lamp: 0.25, control: 0.25 });

/**
 * Lays out a sector's street items.
 * @param {{segments: object[], nodes: object[], allSegments: object[], allNodes?: object[], bounds?: object,
 *   density?: number, vegetationDensity?: number,
 *   clearance?: {isClear: (x: number, z: number, radius: number) => boolean, kindAt?: Function}}} input
 *   segments and nodes of the sector (plan objects), allSegments = plan.roads.segments,
 *   allNodes = plan.roads.nodes (the neighbours' signals near the edges).
 * @returns {{lamps: object[], plants: object[], controls: object[], nearby: object[]}} The
 *   sector's own items; nearby also holds the neighbours' items just past its edges (what the
 *   clutter must keep clear of). Plants on paving carry their pit (placeTreePits).
 */
export function layOutSectorStreetItems(input) {
  const { segments, nodes, allSegments, bounds, clearance } = input;
  const ok = (radius) => (item) => !clearance || clearance.isClear(item.x, item.z, radius);
  // Everything is laid out a few metres past the sector's edges too, so a tree near the edge
  // keeps clear of the neighbour's lamps and signals and the clutter keeps clear of the
  // neighbour's pits; each item's own choices never depend on the bounds, so neighbours agree.
  const wide = bounds ? grow(bounds, NEIGHBOUR_MARGIN) : undefined;
  const nodeArea = bounds ? grow(bounds, NEIGHBOUR_MARGIN + 46) : undefined;
  let lamps = [];
  let plants = [];
  for (const segment of segments) {
    lamps.push(...layOutStreetLamps(segment, { bounds: wide, density: input.density ?? 1 }));
    plants.push(...layOutRoadsidePlanting(segment, { bounds: wide, density: input.vegetationDensity ?? 1 }));
  }
  const ownNode = (node) => !bounds || insideBounds(bounds, node.x, node.z);
  let controls = (input.allNodes ?? nodes)
    .filter((node) => !nodeArea || insideBounds(nodeArea, node.x, node.z))
    .flatMap((node) => layOutJunctionControls(node, allSegments).map((item) => ({ ...item, own: ownNode(node) })));
  lamps = lamps.filter(ok(ITEM_RADIUS.lamp));
  controls = controls.filter(ok(ITEM_RADIUS.control));
  plants = placeTreePits(clearPlantingAround(plants.filter(ok(ITEM_RADIUS.plant)), [...lamps, ...controls]), clearance);
  if (input.buildings?.length) plants = fitCrownsToFacades(plants, input.buildings);
  const inside = (item) => !bounds || insideBounds(bounds, item.x, item.z);
  const nearby = [...lamps, ...controls, ...plants];
  const own = { lamps: lamps.filter(inside), plants: plants.filter(inside), controls: controls.filter((item) => item.own) };
  return { ...own, nearby };
}

/**
 * How far (metres, at scale 1) each species' crown reaches towards the facade behind it: a street
 * tree's round crown, a royal palm's fronds, a coconut palm's (it leans over the road).
 */
export const CROWN_REACH = Object.freeze({ street_tree: 4.2, street_tree_narrow: 1.95, royal_palm: 3, coconut_palm: 2.6, coconut_palm_leaning: 1.2 });
/** A coconut palm this close to a facade (metres) becomes the leaning one, its crown over the kerb. */
export const LEANING_PALM_DISTANCE = 4;
/** A tree is shrunk to keep its crown off the facades, never below this scale (else dropped). */
export const CROWN_MIN_SCALE = 0.6;

/**
 * Keeps crowns out of the buildings: a tree whose crown (CROWN_REACH x scale) would reach a
 * building's footprint is shrunk to fit, or dropped when it would fall under CROWN_MIN_SCALE.
 * @param {object[]} plants Plants with species, x, z, scale.
 * @param {{footprint?: number[], edges: {ax: number, az: number, bx: number, bz: number}[], height?: number}[]} buildings
 *   Building plans (buildingMassingPlan.js), edges in world metres.
 * @returns {object[]} The kept plants (shrunk ones are copies with a smaller scale).
 */
export function fitCrownsToFacades(plants, buildings) {
  const kept = [];
  for (const plant of plants) {
    const reach = (CROWN_REACH[plant.species] ?? 4) * (plant.scale ?? 1);
    let nearest = Infinity;
    for (const building of buildings) {
      if ((building.height ?? 10) < 3.5) continue;
      for (const edge of building.edges) nearest = Math.min(nearest, distanceToSegment(plant.x, plant.z, edge.ax, edge.az, edge.bx, edge.bz));
    }
    // A side coconut palm near a wall: the leaning palm (vegetation 08:56), +X still over the road.
    if (plant.species === 'coconut_palm' && plant.place !== 'median' && nearest < LEANING_PALM_DISTANCE
      && nearest >= CROWN_REACH.coconut_palm_leaning * (plant.scale ?? 1)) {
      kept.push({ ...plant, species: 'coconut_palm_leaning' });
      continue;
    }
    if (nearest >= reach) {
      kept.push(plant);
      continue;
    }
    // A street tree too close to a wall becomes the columnar variety (vegetation's narrow tree).
    if (plant.species === 'street_tree' && nearest >= CROWN_REACH.street_tree_narrow * (plant.scale ?? 1)) {
      kept.push({ ...plant, species: 'street_tree_narrow' });
      continue;
    }
    const scale = (plant.scale ?? 1) * (nearest / reach);
    if (scale >= CROWN_MIN_SCALE) kept.push({ ...plant, scale });
  }
  return kept;
}

function distanceToSegment(x, z, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const length2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length2));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}

/**
 * Obstacle circles of a sector's street items for walkers: trunks with their pits, lamp and
 * signal poles, and every standing clutter item (long ones as a row of circles along their length).
 * @param {{lamps?: object[], plants?: object[], controls?: object[], clutter?: object[]}} items
 * @returns {{x: number, z: number, radius: number, kind: string}[]}
 */
export function streetObstacleCircles(items) {
  const out = [];
  for (const lamp of items.lamps ?? []) out.push({ x: lamp.x, z: lamp.z, radius: 0.3, kind: 'pole' });
  for (const control of items.controls ?? []) out.push({ x: control.x, z: control.z, radius: 0.3, kind: 'signal' });
  for (const plant of items.plants ?? []) out.push({ x: plant.x, z: plant.z, radius: plant.pit ? TREE_PIT_HALF : 0.45, kind: 'trunk' });
  for (const item of items.clutter ?? []) {
    if (item.legs) {
      // A gantry crane: one circle per leg (people and cars pass between them).
      const c = Math.cos(item.rotationY ?? 0);
      const s = Math.sin(item.rotationY ?? 0);
      for (const [lx, lz, half] of item.legs) out.push({ x: item.x + c * lx + s * lz, z: item.z - s * lx + c * lz, radius: half * Math.SQRT2, kind: 'pole' });
      continue;
    }
    if (item.mounted || item.fence || item.kind === 'cover') continue;
    const halfX = item.halfX ?? 0.3;
    const halfZ = Math.max(0.2, item.halfZ ?? 0.3);
    const count = Math.min(3, Math.max(1, Math.round(halfX / halfZ)));
    const c = Math.cos(item.rotationY ?? 0);
    const s = Math.sin(item.rotationY ?? 0);
    const radius = count === 1 ? Math.max(halfX, halfZ) : Math.max(halfZ, halfX / count);
    for (let k = 0; k < count; k += 1) {
      const along = count === 1 ? 0 : -halfX + radius + (k * (2 * halfX - 2 * radius)) / (count - 1);
      out.push({ x: item.x + c * along, z: item.z - s * along, radius, kind: item.zone === 'stop' ? 'shelter' : 'clutter' });
    }
  }
  return out;
}

/** Metres past a sector's edges that its street items are laid out for clearance. */
const NEIGHBOUR_MARGIN = 4;
const grow = (b, m) => ({ minX: b.minX - m, minZ: b.minZ - m, maxX: b.maxX + m, maxZ: b.maxZ + m });

/** Half the side (metres) of a tree pit: set_sidewalk's cast-iron tree_grate is 1.24 m square. */
export const TREE_PIT_HALF = 0.62;
/** What clutter keeps from a trunk in a pit (metres, plus its own half length): the pit's corner and a step. */
export const TREE_PIT_CLEAR = TREE_PIT_HALF * Math.SQRT2 + 0.6;
/** Planted ground: a trunk stands there without a pit. */
const PLANTED_KINDS = new Set(['verge', 'ground', 'median']);

/**
 * Gives every tree on paved ground a pit (owner, 18 Nov: no trunk may meet bare concrete): a
 * grate square to the street, its whole square (and 5 cm beyond) on pavement, never over the
 * kerb. A tree on a verge, a planted median or open ground keeps its soil; one whose pit would
 * not fit, or that stands on anything else, is dropped. Without a surface query (a preview
 * without the city) every pavement-side tree gets its pit unchecked.
 * @param {object[]} plants From layOutRoadsidePlanting (place, streetYaw).
 * @param {{kindAt?: (x: number, z: number) => string} | undefined} clearance
 * @returns {object[]} The kept plants; those on pavement carry pit {x, z, rotationY} and clear.
 */
export function placeTreePits(plants, clearance) {
  const kept = [];
  const reach = TREE_PIT_HALF + 0.05;
  for (const plant of plants) {
    const kindAt = clearance?.kindAt;
    const kind = kindAt ? kindAt(plant.x, plant.z) : (plant.place === 'median' ? 'median' : 'pavement');
    if (PLANTED_KINDS.has(kind)) {
      kept.push(plant);
      continue;
    }
    if (kind !== 'pavement') continue;
    const yaw = plant.streetYaw ?? 0;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    let fits = true;
    if (kindAt) {
      for (let u = -1; u <= 1 && fits; u += 1) {
        for (let v = -1; v <= 1 && fits; v += 1) {
          if (u === 0 && v === 0) continue;
          // Local (u, v) on the grate -> world: rotation about +Y by yaw.
          const x = plant.x + (u * c + v * s) * reach;
          const z = plant.z + (-u * s + v * c) * reach;
          if (kindAt(x, z) !== 'pavement') fits = false;
        }
      }
    }
    if (!fits) continue;
    kept.push({ ...plant, pit: { x: plant.x, z: plant.z, rotationY: yaw }, clear: TREE_PIT_CLEAR });
  }
  return kept;
}

/**
 * Lays out a sector's street clutter (streetClutterLayout.js): the pavements of its segments and
 * the service sides, yards, fences and walls of its buildings. A standing item is kept only where
 * the clearance allows its depth (half its plan depth plus the clearance margin clear of asphalt),
 * 0.9 m clear of every lamp, plant and signal, and clear of the other items.
 * @param {{segments: object[], buildings?: object[], lotsById?: Map<number, object>, bounds?: object,
 *   density?: number, fixed?: {x: number, z: number}[],
 *   clearance?: {isClear: (x: number, z: number, radius: number) => boolean}}} input
 * @returns {object[]} The kept items.
 */
export function layOutSectorClutter(input) {
  const { segments, buildings = [], lotsById = new Map(), bounds, clearance, fixed = [], density = 1 } = input;
  const inside = (x, z) => !bounds || insideBounds(bounds, x, z);
  const raw = [];
  for (const segment of segments) raw.push(...layOutSidewalkClutter(segment, { density, inside }));
  for (const building of buildings) raw.push(...layOutBuildingClutter(building, lotsById.get(building.lotId), { density }));
  // Open yards with no building (the port's container terminal ...) are stocked.
  // Other open lots of the worn districts (car parks, vacant ground) get pallet fences and a skip.
  for (const lot of input.openLots ?? []) {
    if (lot.landmarkKind === 'container_terminal') raw.push(...layOutContainerTerminal(lot));
    else if (STOCKED_YARDS.has(lot.landmarkKind) || lot.zone === 'port_yard') raw.push(...layOutYardStock(lot));
    else raw.push(...layOutOpenLotFence(lot));
  }
  // Shop-front furniture (awnings, café sets, boards, stalls) gets the same checks.
  for (const extra of input.extra ?? []) raw.push(extra);
  const kept = [];
  const standing = [];
  for (const item of raw) {
    if (!item.mounted) {
      if (clearance && !clearance.isClear(item.x, item.z, item.fence ? 0.05 : Math.min(item.halfZ, 0.9))) continue;
      // A trunk in a pit keeps the pit and a step around it free (other.clear).
      if (fixed.some((other) => (other.x - item.x) ** 2 + (other.z - item.z) ** 2 < (item.halfX + (other.clear ?? 0.9)) ** 2)) continue;
      // Pieces of one block of yard stock stand packed together (item.block).
      if (!item.fence && standing.some((other) => (item.block === undefined || other.block !== item.block)
        && (other.x - item.x) ** 2 + (other.z - item.z) ** 2 < (other.radius + item.radius + 0.2) ** 2)) continue;
      standing.push(item);
    }
    kept.push(item);
  }
  return kept;
}
