// Building massing: decides, as plain data, what stands on each lot of the city plan: which
// facade kit, how many storeys, which tints, the footprint, and the bays of every facade edge
// on the module grid (bays of 4, 2 and 8 m, stretched up to 12 percent to fit, 0.5 m corner
// posts). No three.js here, so Node tests it; buildingMeshAssembly.js turns a plan into meshes.

/** Storey heights of the module grid in metres. */
export const MODULE_GRID = Object.freeze({ ground: 4.2, upper: 3.2, upperTall: 4.0, top: 1.2, corner: 0.5, bay: 4, smallBay: 2, wideBay: 8, stretch: 0.12 });

/**
 * The facade kit and look family for each lot style. family selects the procedural fallback
 * when the kit is not built yet; setback is the front set-back and gap the side inset (metres).
 * @type {Record<string, {kit: string, family: string, setback: number, gap: number, tallStorey?: boolean}>}
 */
export const STYLE_KITS = Object.freeze({
  art_deco_hotel: { kit: 'kit_deco_resort', family: 'deco', setback: 0, gap: 0.6 },
  art_deco_shop: { kit: 'kit_deco_resort', family: 'deco', setback: 0, gap: 0.4 },
  grand_hotel: { kit: 'kit_deco_resort', family: 'deco', setback: 0, gap: 0.6 },
  resort: { kit: 'kit_deco_resort', family: 'deco', setback: 4, gap: 3 },
  resort_shop: { kit: 'kit_deco_resort', family: 'deco', setback: 0, gap: 0.5 },
  casino_resort: { kit: 'kit_deco_resort', family: 'deco', setback: 6, gap: 4 },
  nightclub: { kit: 'kit_deco_resort', family: 'deco', setback: 0, gap: 0.5 },
  glass_tower: { kit: 'kit_glass_tower', family: 'tower', setback: 2, gap: 2, tallStorey: true },
  office_tower: { kit: 'kit_glass_tower', family: 'tower', setback: 1, gap: 1, tallStorey: true },
  bank: { kit: 'kit_glass_tower', family: 'tower', setback: 3, gap: 2, tallStorey: true },
  safehouse_apartment: { kit: 'kit_residential_tower', family: 'residential', setback: 1, gap: 1 },
  office_block: { kit: 'kit_downtown_commercial', family: 'office', setback: 0, gap: 0.4 },
  shopping_mall: { kit: 'kit_downtown_commercial', family: 'office', setback: 4, gap: 4 },
  apartment_block: { kit: 'kit_residential_tower', family: 'residential', setback: 2, gap: 1.5 },
  old_town: { kit: 'kit_barrio_lowrise', family: 'lowrise', setback: 0, gap: 0.2 },
  townhouse: { kit: 'kit_residential', family: 'residential', setback: 2, gap: 0.4 },
  villa: { kit: 'kit_residential', family: 'villa', setback: 5, gap: 3 },
  mansion: { kit: 'kit_residential', family: 'villa', setback: 8, gap: 5 },
  beach_house: { kit: 'kit_residential', family: 'villa', setback: 4, gap: 3 },
  rural: { kit: 'kit_residential', family: 'villa', setback: 6, gap: 4 },
  motel: { kit: 'kit_residential', family: 'villa', setback: 8, gap: 3 },
  trailer_park: { kit: 'kit_residential', family: 'villa', setback: 10, gap: 8 },
  factory: { kit: 'kit_industrial_port', family: 'industrial', setback: 4, gap: 3 },
  warehouse: { kit: 'kit_industrial_port', family: 'industrial', setback: 5, gap: 3 },
  shipyard: { kit: 'kit_industrial_port', family: 'industrial', setback: 6, gap: 4 },
  stadium: { kit: 'kit_concrete_civic', family: 'civic', setback: 10, gap: 8 },
  city_hall: { kit: 'kit_concrete_civic', family: 'civic', setback: 8, gap: 4 },
  courthouse: { kit: 'kit_concrete_civic', family: 'civic', setback: 8, gap: 4 },
  police_station: { kit: 'kit_concrete_civic', family: 'civic', setback: 3, gap: 2 },
  hospital: { kit: 'kit_concrete_civic', family: 'civic', setback: 6, gap: 3 },
  fire_station: { kit: 'kit_concrete_civic', family: 'civic', setback: 3, gap: 2 },
  bus_terminal: { kit: 'kit_concrete_civic', family: 'civic', setback: 6, gap: 3 },
  market: { kit: 'kit_barrio_lowrise', family: 'lowrise', setback: 2, gap: 1 },
  church: { kit: 'kit_barrio_lowrise', family: 'lowrise', setback: 6, gap: 4 },
  yacht_club: { kit: 'kit_deco_resort', family: 'deco', setback: 6, gap: 4 },
});

/** Commercial styles whose ground storey is shops (on the street frontage). */
const SHOPFRONT_STYLES = new Set(['art_deco_shop', 'resort_shop', 'office_block', 'old_town',
  'shopping_mall', 'glass_tower', 'office_tower', 'bank', 'art_deco_hotel', 'grand_hotel',
  'diner', 'clothing_store', 'convenience_store', 'gun_shop', 'bar_cantina', 'nightclub']);

/** Landmark kinds and styles that are not a building (open ground, docks, yards). */
const OPEN_KINDS = new Set(['park', 'plaza', 'lookout', 'airstrip', 'pier', 'marina',
  'container_terminal', 'train_yard', 'scrapyard', 'helipad', 'radio_tower', 'lighthouse',
  'fuel_station']);

/** Small commercial landmark kinds that stand as a low shop building. */
const SMALL_SHOP_KINDS = new Set(['diner', 'clothing_store', 'convenience_store', 'gun_shop',
  'bar_cantina', 'car_dealership', 'mod_garage', 'paint_and_body_shop']);

/**
 * The kit rules of one lot.
 * @param {{style?: string, landmarkKind?: string | null, zoning?: string}} lot A plan lot.
 * @returns {{kit: string, family: string, setback: number, gap: number, tallStorey?: boolean} | null}
 *   The rules, or null when the lot carries no building.
 */
export function kitRulesForLot(lot) {
  const kind = lot.landmarkKind ?? null;
  if (kind && OPEN_KINDS.has(kind)) return null;
  if (lot.zone === 'parking' || lot.zone === 'park' || lot.zoning === 'parking') return null;
  if (kind && SMALL_SHOP_KINDS.has(kind)) {
    return lot.district === 'la_marisma' || lot.district === 'barrio_hierro' || lot.district === 'puerto_tamarindo'
      ? { kit: 'kit_barrio_lowrise', family: 'lowrise', setback: 1, gap: 1 }
      : { kit: 'kit_deco_resort', family: 'deco', setback: 1, gap: 1 };
  }
  return STYLE_KITS[kind] ?? STYLE_KITS[lot.style] ?? { kit: 'kit_downtown_commercial', family: 'office', setback: 1, gap: 1 };
}

/**
 * Splits a facade length into bays on the module grid: as many 4 m bays as fit, a 2 m bay
 * where the rest needs one, all stretched by the same factor (at most 12 percent) to fill.
 * @param {number} length The usable length in metres (between the corner posts).
 * @param {{bay?: number, smallBay?: number, stretch?: number}} [grid] Bay sizes.
 * @returns {{nominal: number[], scale: number}} Nominal bay widths and the stretch factor
 *   (actual width = nominal x scale); an empty list when the length is under one small bay.
 */
export function fitBays(length, grid = MODULE_GRID) {
  const bay = grid.bay ?? 4;
  const small = grid.smallBay ?? 2;
  const stretch = grid.stretch ?? 0.12;
  if (length < small * (1 - stretch)) return { nominal: [], scale: 1 };
  let best = null;
  const maxBig = Math.floor(length / (bay * (1 - stretch))) + 1;
  for (let big = Math.max(0, maxBig); big >= 0; big -= 1) {
    for (let smalls = 0; smalls <= 2; smalls += 1) {
      const sum = big * bay + smalls * small;
      if (sum <= 0) continue;
      const scale = length / sum;
      const error = Math.abs(scale - 1) + smalls * 0.01;
      if (!best || error < best.error) best = { big, smalls, scale, error };
    }
  }
  const nominal = [];
  // Put a small bay at each end so a facade stays symmetrical.
  if (best.smalls >= 1) nominal.push(small);
  for (let index = 0; index < best.big; index += 1) nominal.push(bay);
  if (best.smalls >= 2) nominal.push(small);
  return { nominal, scale: best.scale };
}

/**
 * Plans the building on one lot.
 * @param {object} lot A plan lot (docs/CITY_PLAN.md: ring, y, frontages, district, zoning,
 *   floorsMin, floorsMax, style, landmarkKind, frontX, frontZ).
 * @param {{next: () => number, int: (a: number, b: number) => number, pick: <T>(items: T[]) => T}} random
 *   A seeded generator for this lot.
 * @param {{facadePalette?: string[], primary?: string, secondary?: string, accent?: string}} [mood]
 *   The district's mood colours.
 * @returns {BuildingPlan | null} The plan, or null for a lot without a building.
 */
export function planBuilding(lot, random, mood = {}) {
  const rules = kitRulesForLot(lot);
  if (!rules || !Array.isArray(lot.ring) || lot.ring.length < 8) return null;
  const minFloors = Math.max(1, lot.floorsMin ?? 1);
  const maxFloors = Math.max(minFloors, lot.floorsMax ?? minFloors);
  let storeys = random.int(minFloors, maxFloors);
  if (rules.family === 'tower') storeys = Math.max(storeys, Math.round(minFloors + (maxFloors - minFloors) * (0.35 + 0.65 * random.next())));
  const upper = rules.tallStorey ? MODULE_GRID.upperTall : MODULE_GRID.upper;
  const height = MODULE_GRID.ground + Math.max(0, storeys - 1) * upper + MODULE_GRID.top;

  const footprint = insetFootprint(lot.ring, rules, storeys);
  if (!footprint) return null;
  const palette = mood.facadePalette?.length ? mood.facadePalette : ['#EFE6D8', '#E8D9C4', '#F3EEE6'];
  const wall = random.pick(palette);
  const trimChoices = [mood.secondary, mood.primary, '#F7F4EE', '#FFFFFF'].filter(Boolean);
  let trim = random.pick(trimChoices);
  if (trim === wall) trim = '#F7F4EE';
  const shopfront = SHOPFRONT_STYLES.has(lot.style) || SHOPFRONT_STYLES.has(lot.landmarkKind ?? '')
    || /commercial/.test(lot.zoning ?? '');

  const edges = [];
  const [cx, cz] = footprint.centre;
  for (let index = 0; index < 4; index += 1) {
    let ax = footprint.ring[index * 2];
    let az = footprint.ring[index * 2 + 1];
    let bx = footprint.ring[((index + 1) % 4) * 2];
    let bz = footprint.ring[((index + 1) % 4) * 2 + 1];
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 1.2) continue;
    // Outward normal: perpendicular to the edge, away from the centre.
    let nx = (bz - az) / length;
    let nz = -(bx - ax) / length;
    if (nx * ((ax + bx) / 2 - cx) + nz * ((az + bz) / 2 - cz) < 0) { nx = -nx; nz = -nz; }
    // Module +X runs along t = (-nz, nx); traverse the edge in that direction.
    const tx = -nz;
    const tz = nx;
    if ((bx - ax) * tx + (bz - az) * tz < 0) { [ax, bx] = [bx, ax]; [az, bz] = [bz, az]; }
    const front = nx * lot.frontX + nz * lot.frontZ > 0.7;
    const fit = fitBays(length - MODULE_GRID.corner * 2);
    const bays = fit.nominal.map((nominal, bay) => ({
      nominal,
      width: nominal * fit.scale,
      ground: groundSlotFor(front, shopfront, bay, fit.nominal.length, random),
    }));
    edges.push({ ax, az, bx, bz, nx, nz, tx, tz, length, front, scale: fit.scale, bays });
  }
  return {
    lotId: lot.id,
    kit: rules.kit,
    family: rules.family,
    landmarkKind: lot.landmarkKind ?? null,
    y: lot.y ?? 0,
    storeys,
    groundHeight: MODULE_GRID.ground,
    upperHeight: upper,
    topHeight: MODULE_GRID.top,
    height,
    tints: { wall, trim },
    upperVariant: random.int(0, 3),
    balconyEvery: rules.family === 'deco' || rules.family === 'residential' ? random.int(2, 3) : 0,
    litShare: 0.25 + random.next() * 0.3,
    seed: Math.floor(random.next() * 2 ** 31),
    footprint: footprint.ring,
    centre: footprint.centre,
    edges,
  };
}

function groundSlotFor(front, shopfront, bay, count, random) {
  if (!front) return random.next() < 0.2 ? 'ground_entrance' : 'ground_wall';
  if (bay === Math.floor(count / 2)) return 'ground_entrance';
  if (shopfront) return 'ground_shop';
  return random.next() < 0.3 ? 'ground_shop' : 'ground_wall';
}

/**
 * The building footprint: the lot rectangle less the front set-back and side gaps, with towers
 * on big lots kept to a slender plan at the front.
 */
function insetFootprint(ring, rules, storeys) {
  // ring: front right, front left, back left, back right.
  const fr = [ring[0], ring[1]];
  const fl = [ring[2], ring[3]];
  const bl = [ring[4], ring[5]];
  const width = Math.hypot(fl[0] - fr[0], fl[1] - fr[1]);
  const depth = Math.hypot(bl[0] - fl[0], bl[1] - fl[1]);
  if (width < 3 || depth < 3) return null;
  const ux = (fl[0] - fr[0]) / width; // along the front, right to left
  const uz = (fl[1] - fr[1]) / width;
  const vx = (bl[0] - fl[0]) / depth; // from the front to the back
  const vz = (bl[1] - fl[1]) / depth;
  const gap = Math.min(rules.gap, width * 0.2);
  const setback = Math.min(rules.setback, depth * 0.3);
  let w = width - gap * 2;
  let d = depth - setback - Math.min(rules.gap, depth * 0.15);
  const maxSide = storeys > 12 ? 38 : storeys > 6 ? 56 : 90;
  const maxDepth = Math.min(maxSide, storeys > 6 ? 40 : 60);
  w = Math.min(w, maxSide);
  d = Math.min(d, maxDepth);
  if (w < 3 || d < 3) return null;
  const mx = (fr[0] + fl[0]) / 2 + vx * setback;
  const mz = (fr[1] + fl[1]) / 2 + vz * setback;
  const corners = [
    [mx - ux * w / 2, mz - uz * w / 2],
    [mx + ux * w / 2, mz + uz * w / 2],
    [mx + ux * w / 2 + vx * d, mz + uz * w / 2 + vz * d],
    [mx - ux * w / 2 + vx * d, mz - uz * w / 2 + vz * d],
  ];
  return {
    ring: corners.flat(),
    centre: [mx + vx * d / 2, mz + vz * d / 2],
    width: w,
    depth: d,
  };
}

/**
 * @typedef {object} BuildingPlan
 * @property {number} lotId The lot.
 * @property {string} kit The facade kit id (kit_deco_resort ...).
 * @property {string} family The look family of the procedural fallback.
 * @property {number} y Ground height of the pad.
 * @property {number} storeys Storeys, ground included.
 * @property {number} height Height to the top of the parapet.
 * @property {{wall: string, trim: string}} tints paint_wall and paint_trim colours.
 * @property {number[]} footprint Four corners, flat x, z.
 * @property {{ax: number, az: number, bx: number, bz: number, nx: number, nz: number, tx: number,
 *   tz: number, length: number, front: boolean, scale: number,
 *   bays: {nominal: number, width: number, ground: string}[]}[]} edges The facades.
 */
