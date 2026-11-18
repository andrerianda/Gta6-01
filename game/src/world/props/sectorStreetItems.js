// Sector street items: every lamp, roadside plant and junction control object of one sector, as
// plain data, kept only where the built street has pavement, verge or a planted median
// (streetClearance.js), with no plant on the spot of a lamp or a signal. Pure; cityDressing.js
// turns the result into instanced batches, the tests check it against the lanes.
import { layOutRoadsidePlanting } from '../vegetation/roadsidePlantingLayout.js';
import { clearPlantingAround, layOutJunctionControls } from './junctionControlLayout.js';
import { layOutBuildingClutter, layOutSidewalkClutter } from './streetClutterLayout.js';
import { insideBounds, layOutStreetLamps } from './streetFurnitureLayout.js';

/** Radii (metres) the clearance keeps around each kind: trunks, poles, signal masts. */
export const ITEM_RADIUS = Object.freeze({ plant: 0.45, lamp: 0.25, control: 0.25 });

/**
 * Lays out a sector's street items.
 * @param {{segments: object[], nodes: object[], allSegments: object[], bounds?: object,
 *   density?: number, vegetationDensity?: number,
 *   clearance?: {isClear: (x: number, z: number, radius: number) => boolean}}} input
 *   segments and nodes of the sector (plan objects), allSegments = plan.roads.segments.
 * @returns {{lamps: object[], plants: object[], controls: object[], dropped: number}}
 */
export function layOutSectorStreetItems(input) {
  const { segments, nodes, allSegments, bounds, clearance } = input;
  const ok = (radius) => (item) => !clearance || clearance.isClear(item.x, item.z, radius);
  let lamps = [];
  let plants = [];
  for (const segment of segments) {
    lamps.push(...layOutStreetLamps(segment, { bounds, density: input.density ?? 1 }));
    plants.push(...layOutRoadsidePlanting(segment, { bounds, density: input.vegetationDensity ?? 1 }));
  }
  let controls = nodes
    .filter((node) => !bounds || insideBounds(bounds, node.x, node.z))
    .flatMap((node) => layOutJunctionControls(node, allSegments));
  const before = lamps.length + plants.length + controls.length;
  lamps = lamps.filter(ok(ITEM_RADIUS.lamp));
  controls = controls.filter(ok(ITEM_RADIUS.control));
  plants = clearPlantingAround(plants.filter(ok(ITEM_RADIUS.plant)), [...lamps, ...controls]);
  return { lamps, plants, controls, dropped: before - lamps.length - plants.length - controls.length };
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
  const kept = [];
  const standing = [];
  for (const item of raw) {
    if (!item.mounted) {
      if (clearance && !clearance.isClear(item.x, item.z, item.fence ? 0.05 : Math.min(item.halfZ, 0.9))) continue;
      if (fixed.some((other) => (other.x - item.x) ** 2 + (other.z - item.z) ** 2 < (item.halfX + 0.9) ** 2)) continue;
      if (!item.fence && standing.some((other) => (other.x - item.x) ** 2 + (other.z - item.z) ** 2 < (other.radius + item.radius + 0.2) ** 2)) continue;
      standing.push(item);
    }
    kept.push(item);
  }
  return kept;
}
