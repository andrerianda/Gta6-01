// Roadside planting layout: palms down the medians of the grand avenues and Bulevar Dorado,
// palms on the pavements of palm streets and the beachfront, and street trees elsewhere, as
// plain data (species, foot, turn, scale). Deterministic per segment; no three.js.
import { insideBounds, walkSegment } from '../props/streetFurnitureLayout.js';

/** Where each streetscape plants, the species and the spacing in metres. */
export const PLANTING_RULES = Object.freeze({
  palm_median: { median: { species: 'royal_palm', spacing: 11 }, sides: { species: 'coconut_palm', spacing: 17 } },
  palms: { sides: { species: 'royal_palm', spacing: 13 } },
  tree_median: { median: { species: 'street_tree', spacing: 10 }, sides: { species: 'street_tree', spacing: 15 } },
  trees: { sides: { species: 'street_tree', spacing: 14 } },
  old_town: { sides: { species: 'street_tree', spacing: 22, sparse: 0.5 } },
  hillside: { sides: { species: 'coconut_palm', spacing: 24, sparse: 0.6 } },
});

/**
 * Plants along one segment.
 * @param {object} segment A plan segment (points, streetscape, halfWidth, medianWidth,
 *   sidewalkLeft, sidewalkRight, trimA, trimB, length, id).
 * @param {{bounds?: object, density?: number}} [options] Keep only plants in the bounds;
 *   density (quality vegetationDensity) stretches the spacing.
 * @returns {{species: string, x: number, z: number, rotationY: number, scale: number}[]}
 */
export function layOutRoadsidePlanting(segment, options = {}) {
  const rule = PLANTING_RULES[segment.streetscape];
  if (!rule || segment.bridge) return [];
  const density = Math.max(0.3, options.density ?? 1);
  const items = [];
  const end = (segment.length ?? Infinity) - (segment.trimB ?? 0) - 6;
  const hash = (along, side) => {
    let h = Math.imul((segment.id ?? 0) + 1, 0x9e3779b1) ^ Math.imul(Math.round(along * 10) + side * 7919, 0x85ebca6b);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
    return (h >>> 0) / 4294967296;
  };
  if (rule.median && (segment.medianWidth ?? 0) >= 1.8) {
    const spacing = rule.median.spacing / density;
    walkSegment(segment, (segment.trimA ?? 0) + spacing * 0.5, end, spacing, (x, z, dx, dz, along) => {
      if (!insideBounds(options.bounds, x, z)) return;
      const r = hash(along, 0);
      items.push({ species: rule.median.species, x, z, rotationY: r * Math.PI * 2, scale: 0.9 + r * 0.25 });
    });
  }
  if (rule.sides) {
    const spacing = rule.sides.spacing / density;
    walkSegment(segment, (segment.trimA ?? 0) + spacing * 0.6, end, spacing, (x, z, dx, dz, along) => {
      for (const side of [-1, 1]) {
        const sidewalk = side > 0 ? segment.sidewalkLeft : segment.sidewalkRight;
        if (!(sidewalk > 1.5)) continue;
        const r = hash(along, side);
        if (rule.sides.sparse && r > rule.sides.sparse) continue;
        const offset = (segment.halfWidth ?? 4) + Math.min(1.2, sidewalk * 0.3);
        const px = x + dz * offset * side;
        const pz = z - dx * offset * side;
        if (!insideBounds(options.bounds, px, pz)) continue;
        items.push({ species: rule.sides.species, x: px, z: pz, rotationY: r * Math.PI * 2, scale: 0.85 + r * 0.3 });
      }
    });
  }
  return items;
}
