// Sector street items: every lamp, roadside plant and junction control object of one sector, as
// plain data, kept only where the built street has pavement, verge or a planted median
// (streetClearance.js), with no plant on the spot of a lamp or a signal. Pure; cityDressing.js
// turns the result into instanced batches, the tests check it against the lanes.
import { layOutRoadsidePlanting } from '../vegetation/roadsidePlantingLayout.js';
import { clearPlantingAround, layOutJunctionControls } from './junctionControlLayout.js';
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
