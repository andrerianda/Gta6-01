// Ground cover layout: where ground_cover's four plants grow, as plain data (vegetation 09:59,
// the owner's tree-pit direction of 08:01). variant_d (cover_patch, 1.3 m creeping cover) over
// the soil of every tree pit; variant_a (weeds_kerb, a 1 m run) where the street wear puts kerb
// weeds in the gutter and weeds at wall feet; variant_b (weeds_crack) at the foot of some poles
// in the worn districts; variant_c (grass_clump) round trunks on planted verges and medians.
// Cutout, no collider, no shadow (pool kind 'cover'). No three.js: Node tests it.
import { clutterHash } from '../props/streetClutterLayout.js';

const COVER = 'ground_cover';
/** Districts whose pole feet grow weeds, with the share of poles that do. */
const WORN_POLES = Object.freeze({ barrio_hierro: 0.6, puerto_tamarindo: 0.55, la_marisma: 0.45, los_pantanos: 0.5, centro: 0.12 });

const cover = (object, x, z, rotationY, extra) => ({ assetId: COVER, object, x, z, rotationY, kind: 'cover', halfX: 0.5, halfZ: 0.3, radius: 0.5, mounted: true, zone: 'cover', ...extra });

/**
 * The ground cover of a sector.
 * @param {{plants?: {x: number, z: number, pit?: {rotationY: number}, place?: string}[],
 *   wear?: {object: string, x: number, z: number, rotationY: number, base?: number | null}[],
 *   lamps?: {x: number, z: number, district?: string}[], districtAt?: (x: number, z: number) => string}} input
 * @returns {object[]} Items {assetId 'ground_cover', object 'variant_a'..'variant_d', x, z, rotationY,
 *   kind 'cover', mounted, y?, base?}.
 */
export function layOutGroundCover(input) {
  const items = [];
  let n = 0;
  for (const plant of input.plants ?? []) {
    n += 1;
    const turn = clutterHash(Math.round(plant.x * 10), Math.round(plant.z * 10), 601) * Math.PI * 2;
    // Over the pit's soil (1.2 cm above the paving), the grate's opening shows the leaves.
    if (plant.pit) items.push(cover('variant_d', plant.x, plant.z, turn, { y: 0.012 }));
    else if (clutterHash(n, 0, 602) < 0.7) items.push(cover('variant_c', plant.x + Math.cos(turn) * 0.55, plant.z + Math.sin(turn) * 0.55, turn));
  }
  for (const decal of input.wear ?? []) {
    if (decal.object === 'weeds_kerb') items.push(cover('variant_a', decal.x, decal.z, decal.rotationY));
    else if (decal.object === 'weeds_large') {
      // A wall decal's X runs along the wall, as the weed run's does.
      items.push(cover('variant_a', decal.x, decal.z, decal.rotationY, decal.base === null || decal.base === undefined ? {} : { base: decal.base }));
    }
  }
  for (const lamp of input.lamps ?? []) {
    n += 1;
    const district = lamp.district ?? input.districtAt?.(lamp.x, lamp.z);
    if (clutterHash(n, 1, 603) >= (WORN_POLES[district] ?? 0)) continue;
    const turn = clutterHash(n, 2, 604) * Math.PI * 2;
    items.push(cover('variant_b', lamp.x + Math.cos(turn) * 0.28, lamp.z + Math.sin(turn) * 0.28, turn));
  }
  return items;
}
