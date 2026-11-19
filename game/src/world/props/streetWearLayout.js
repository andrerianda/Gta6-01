// Street wear layout: where the decals of set_street_wear lie, as plain data. On the lanes: oil
// stains, cracks, patches, tyre marks and manholes; in the gutter: storm drains and kerb weeds; on
// the pavement: gum, butts and litter; on the walls of buildings: tags, throw-ups, posters, torn
// flyers, damp along the wall foot and rust or drip streaks. Dense in Barrio Hierro and the port
// (the owner's reference of a lived-in street), light in Centro, a trace elsewhere. Every choice
// comes from a hash of the segment or lot, so a sector lays out the same decals whoever asks. No
// three.js: Node tests it; streetWearDecals.js merges them into one draw per sector per material.
import { clutterHash } from './streetClutterLayout.js';

/** Per district: how much wear (1 = Barrio Hierro). */
export const WEAR_DENSITY = Object.freeze({
  barrio_hierro: 1, puerto_tamarindo: 0.9, la_marisma: 0.75, los_pantanos: 0.5, centro: 0.3,
  las_lomas: 0.15, bahia_vista: 0.12, playa_dorada: 0.1, isla_coral: 0.08,
});
const W = 'set_street_wear';
/** Weighted choices: [object, weight]. */
const LANE = [['oil_stain_small', 3], ['oil_stain_large', 1], ['crack_line', 2], ['crack_web', 2], ['asphalt_patch', 2], ['wet_patch', 1], ['tyre_marks', 1]];
const PAVEMENT = [['gum_spots', 3], ['cigarette_butts', 2], ['litter_scatter', 2], ['crack_line', 1], ['wet_patch', 1], ['weeds_small', 1]];
const WALL = [['graffiti_tag_a', 3], ['graffiti_tag_b', 3], ['graffiti_tag_c', 2], ['graffiti_throwup_a', 1.5], ['graffiti_throwup_b', 1.5], ['poster_wall', 1.5], ['flyers_torn', 2], ['damp_base', 2], ['rust_streak', 1], ['drip_stain', 1]];
/** Decal kind per object: 'ground' and 'wall' share the soft decal material, 'weeds' the cutout. */
export const WEAR_KIND = Object.freeze({ weeds_small: 'weeds', weeds_large: 'weeds', weeds_kerb: 'weeds' });

function pick(list, roll) {
  let total = 0;
  for (const entry of list) total += entry[1];
  let at = roll * total;
  for (const entry of list) {
    at -= entry[1];
    if (at < 0) return entry[0];
  }
  return list[list.length - 1][0];
}

/**
 * Wear of one sector.
 * @param {{segments: object[], buildings?: object[], inside?: (x: number, z: number) => boolean, density?: number,
 *   districtOf?: (lotId: number) => string}} input Building plans (world edges) and their lots' districts.
 * @returns {{assetId: string, object: string, x: number, z: number, rotationY: number, base: number | null,
 *   wall: boolean, kind: 'decal' | 'weeds'}[]} base: the building pad for wall decals, null = the ground there.
 */
export function layOutSectorWear(input) {
  const { segments = [], buildings = [], inside = () => true } = input;
  const density = Math.max(0.1, input.density ?? 1);
  const items = [];
  const push = (object, x, z, rotationY, base = null, wall = false) => {
    if (!inside(x, z)) return;
    items.push({ assetId: W, object, x, z, rotationY, base, wall, kind: WEAR_KIND[object] ?? 'decal' });
  };
  for (const segment of segments) {
    const share = (WEAR_DENSITY[segment.district] ?? 0.1) * density;
    if (segment.bridge || segment.paved === false || segment.streetscape === 'highway') continue;
    const id = segment.id ?? 0;
    const half = segment.halfWidth ?? 4;
    const start = (segment.trimA ?? 0) + 2;
    const end = (segment.length ?? 0) - (segment.trimB ?? 0) - 2;
    walk(segment.points, start, end, 4.5 / share, (x, z, dx, dz, n) => {
      const r = (k) => clutterHash(id, n, k);
      // A stain, crack or patch on the carriageway (tyre marks run along the lane).
      const object = pick(LANE, r(81));
      const lateral = (r(82) * 2 - 1) * Math.max(0, half - 1.2);
      const yaw = object === 'tyre_marks' ? Math.atan2(-dz, dx) + (r(83) - 0.5) * 0.3 : r(83) * Math.PI * 2;
      push(object, x + dz * lateral, z - dx * lateral, yaw);
      // On each side: the gutter (drains, kerb weeds) and the pavement (gum, butts, litter).
      for (const side of [-1, 1]) {
        const sidewalk = side > 0 ? segment.sidewalkLeft : segment.sidewalkRight;
        const leftX = dz * side;
        const leftZ = -dx * side;
        const along = Math.atan2(-dz, dx); // object +X along the street
        if (n % 6 === (side > 0 ? 1 : 4)) push('storm_drain', x + leftX * (half - 0.32), z + leftZ * (half - 0.32), along);
        else if (r(84 + side) < 0.45 * Math.min(1, share * 1.3)) push('weeds_kerb', x + leftX * (half - 0.08), z + leftZ * (half - 0.08), along + (r(86) < 0.5 ? Math.PI : 0));
        if (sidewalk >= 2 && r(87 + side) < 0.8) {
          const out = half + 0.6 + r(89 + side) * Math.max(0, sidewalk - 1.2);
          push(pick(PAVEMENT, r(91 + side)), x + leftX * out, z + leftZ * out, r(93 + side) * Math.PI * 2);
        }
      }
      // A manhole every 30 to 60 m.
      if (n % Math.max(6, Math.round(45 / (4.5 / share))) === 0) {
        const lane = (r(95) - 0.5) * half;
        push(r(96) < 0.7 ? 'manhole_round' : 'utility_cover', x + dz * lane, z - dx * lane, r(97) * Math.PI * 2);
      }
    });
  }
  // Walls: tags, posters and stains on the ground floor of every wall facing the street or alley.
  for (const building of buildings) {
    const share = (WEAR_DENSITY[input.districtOf?.(building.lotId)] ?? 0.1) * density;
    if (building.family === 'tower' || share < 0.12) continue;
    const id = building.lotId ?? 0;
    building.edges.forEach((edge, e) => {
      const facing = Math.atan2(-edge.nx, -edge.nz); // -Z out of the wall
      const count = Math.floor((edge.length / 20) * (4 + 4 * clutterHash(id, e, 101)) * share);
      for (let n = 0; n < count; n += 1) {
        const r = (k) => clutterHash(id, e * 100 + n, k);
        const along = 0.8 + r(102) * Math.max(0, edge.length - 1.6);
        const x = edge.ax + edge.tx * along + edge.nx * 0.025;
        const z = edge.az + edge.tz * along + edge.nz * 0.025;
        push(pick(WALL, r(103)), x, z, facing, building.y ?? 0, true);
      }
      // Weeds at the wall foot on worn lots.
      if (share > 0.6 && clutterHash(id, e, 104) < 0.6) {
        const along = 0.5 + clutterHash(id, e, 105) * Math.max(0, edge.length - 1);
        push('weeds_large', edge.ax + edge.tx * along + edge.nx * 0.3, edge.az + edge.tz * along + edge.nz * 0.3, facing, building.y ?? 0);
      }
    });
  }
  return items;
}

function walk(p, start, end, step, visit) {
  let travelled = 0;
  let next = start;
  let n = 0;
  for (let i = 0; i + 3 < p.length; i += 2) {
    const length = Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]);
    if (length < 1e-6) continue;
    const dx = (p[i + 2] - p[i]) / length;
    const dz = (p[i + 3] - p[i + 1]) / length;
    while (next <= travelled + length && next <= end) {
      visit(p[i] + dx * (next - travelled), p[i + 1] + dz * (next - travelled), dx, dz, n);
      n += 1;
      next += step;
    }
    travelled += length;
  }
}
