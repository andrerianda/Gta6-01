// Front-yard planting of the homes (the residential kit's lots: townhouses, apartments, villas,
// beach houses, motels, Barrio Hierro's residential infill): a clipped hedge along the lot's street
// edge with a gap at the path to the door, and groups of two to four flowering shrubs between the
// hedge and the facade. Pure: plans and lots in, plant items out (species hedge_clipped and
// shrubs_tropical, the vegetation artist's files; VEGETATION_PLACEMENT in assets/registry).
//
//   const plants = layOutFrontYardPlanting(buildingPlans, lotsById);
//   // -> [{species, object, x, z, rotationY, kind: 'shrub', halfX, halfZ}]

/** Building families whose front yards are planted. */
const YARD_FAMILIES = new Set(['residential', 'villa']);
/** Hedge modules are 2 m long, laid end to end with their X along the line. */
const HEDGE_MODULE = 2.0;
/** Metres the hedge's centre line stands inside the lot's street edge. */
const HEDGE_INSET = 0.55;
/** Half the gap left in the hedge at the path to the front door. */
const GATE_HALF = 1.5;
/** A yard shallower than this (metres from the lot edge to the facade) gets nothing. */
const MIN_YARD = 1.8;

/**
 * @param {{lotId: number, family: string, seed?: number, district?: string | null,
 *   edges: {ax: number, az: number, bx: number, bz: number, nx: number, nz: number, tx: number, tz: number, length: number, front: boolean}[]}[]} buildings
 * @param {Map<number, {ring: number[]}>} lotsById
 * @returns {{species: string, object: string, x: number, z: number, rotationY: number, kind: 'shrub', halfX: number, halfZ: number, roll: number}[]}
 */
export function layOutFrontYardPlanting(buildings, lotsById) {
  const plants = [];
  for (const building of buildings ?? []) {
    if (!YARD_FAMILIES.has(building.family)) continue;
    const lot = lotsById?.get?.(building.lotId);
    const front = building.edges?.find((edge) => edge.front);
    if (!lot?.ring || lot.ring.length < 8 || !front) continue;
    const random = seeded(building.seed ?? building.lotId ?? 1);
    // The lot's street edge is its ring's first side (front right to front left).
    const lx0 = lot.ring[0];
    const lz0 = lot.ring[1];
    const lx1 = lot.ring[2];
    const lz1 = lot.ring[3];
    const yard = ((lx0 + lx1) / 2 - front.ax) * front.nx + ((lz0 + lz1) / 2 - front.az) * front.nz;
    if (!(yard >= MIN_YARD)) continue;
    const length = Math.hypot(lx1 - lx0, lz1 - lz0);
    if (length < 4) continue;
    const tx = (lx1 - lx0) / length;
    const tz = (lz1 - lz0) / length;
    // Inward from the lot edge (towards the facade): -n of the building's front.
    const ix = -front.nx * HEDGE_INSET;
    const iz = -front.nz * HEDGE_INSET;
    // The door: the middle of the building's front, projected on the hedge line.
    const doorX = front.ax + front.tx * front.length / 2;
    const doorZ = front.az + front.tz * front.length / 2;
    const gate = (doorX - lx0) * tx + (doorZ - lz0) * tz;
    const tall = random() < 0.55;
    if (random() < 0.75) {
      const count = Math.floor((length - 1) / HEDGE_MODULE);
      const start = (length - count * HEDGE_MODULE) / 2 + HEDGE_MODULE / 2;
      for (let index = 0; index < count; index += 1) {
        const along = start + index * HEDGE_MODULE;
        if (Math.abs(along - gate) < GATE_HALF + HEDGE_MODULE / 2) continue;
        const flip = random() < 0.5 ? Math.PI : 0;
        plants.push({ species: 'hedge_clipped', object: tall ? 'variant_a' : 'variant_b', x: lx0 + tx * along + ix, z: lz0 + tz * along + iz,
          rotationY: Math.atan2(-tz, tx) + flip, kind: 'shrub', halfX: 1.0, halfZ: 0.35, roll: tall ? 0 : 0.99 });
      }
    }
    // Shrub groups in the yard, either side of the path, when it is deep enough for them.
    if (yard < 2.6) continue;
    const depth = Math.min(yard - HEDGE_INSET - 0.9, 1.4);
    for (const share of [0.2, 0.8]) {
      if (random() < 0.25) continue;
      const along = length * share;
      if (Math.abs(along - gate) < GATE_HALF + 1) continue;
      const group = 2 + Math.floor(random() * 3);
      for (let index = 0; index < group; index += 1) {
        const offset = (index - (group - 1) / 2) * 1.35 + (random() - 0.5) * 0.4;
        const back = depth + (random() - 0.5) * 0.5;
        const roll = random();
        plants.push({ species: 'shrubs_tropical', object: roll < 0.5 ? 'variant_a' : 'variant_b',
          x: lx0 + tx * (along + offset) - front.nx * (HEDGE_INSET + back), z: lz0 + tz * (along + offset) - front.nz * (HEDGE_INSET + back),
          rotationY: random() * Math.PI * 2, kind: 'shrub', halfX: 0.6, halfZ: 0.6, roll });
      }
    }
  }
  return plants;
}

function seeded(seed) {
  let state = (Number(seed) >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
