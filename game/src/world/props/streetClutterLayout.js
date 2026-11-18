// Street clutter layout: where the small things of a lived-in street stand, as plain data. From
// set_sidewalk: litter bins, hydrants, newspaper and post boxes, ticket machines, benches, bike
// racks, planters and bus shelters at the stops of the avenues; from set_alley_and_yard: bin bags,
// cartons, wheelie bins and crates at the back of the pavement, dumpsters, pallets and drums on
// the service sides of buildings, chain-link fences round industrial lots, and air-conditioning
// boxes and gas meters on the walls. The mix and the density follow the district (Barrio Hierro
// and the port crowded, Playa Dorada tidy). Every choice comes from a hash of the segment or lot,
// so a sector lays out the same items whoever asks. No three.js: Node tests it; the dressing
// keeps only the items its surface clearance allows.

/** Per district: how dense each zone is (1 = Barrio Hierro) and which mix it draws from. */
export const CLUTTER_PROFILES = Object.freeze({
  playa_dorada: { kerb: 0.45, wall: 0.08, service: 0.3, wallUnits: 0.02, mix: 'resort' },
  isla_coral: { kerb: 0.4, wall: 0.08, service: 0.3, wallUnits: 0.02, mix: 'resort' },
  bahia_vista: { kerb: 0.5, wall: 0.15, service: 0.4, wallUnits: 0.03, mix: 'resort' },
  las_lomas: { kerb: 0.35, wall: 0.12, service: 0.4, wallUnits: 0.03, mix: 'suburb' },
  centro: { kerb: 0.9, wall: 0.35, service: 0.7, wallUnits: 0.05, mix: 'downtown' },
  la_marisma: { kerb: 1, wall: 0.9, service: 1, wallUnits: 0.18, mix: 'barrio' },
  // Lived-in and worn (owner's reference, 18 Nov): bins, bags, dumpsters and cartons all along the
  // walls, AC boxes on most upper floors, service sides packed.
  barrio_hierro: { kerb: 1.5, wall: 1.9, service: 1.5, wallUnits: 0.32, mix: 'barrio' },
  puerto_tamarindo: { kerb: 1.1, wall: 1.4, service: 1.4, wallUnits: 0.15, mix: 'port' },
  los_pantanos: { kerb: 0.3, wall: 0.3, service: 0.6, wallUnits: 0.05, mix: 'port' },
});
/** Objects too deep for a narrow pavement: on one under 3.2 m they become a pile of bags. */
const DEEP = new Set(['dumpster_closed', 'dumpster_open', 'portable_toilet', 'pallet_stack', 'skip', 'mattress_flat', 'tyre_pile']);
const DEFAULT_PROFILE = CLUTTER_PROFILES.centro;

const S = 'set_sidewalk';
const A = 'set_alley_and_yard';
const Y = 'set_yard_clutter';
/** Weighted choices: [set, object, weight]. */
const MIXES = Object.freeze({
  kerb: {
    resort: [[S, 'bench_slat', 3], [S, 'bin_round', 3], [S, 'planter_round', 2], [S, 'drinking_fountain', 1], [S, 'bike_rack', 1], [S, 'fire_hydrant', 1]],
    downtown: [[S, 'bin_box', 3], [S, 'newspaper_box', 2], [S, 'fire_hydrant', 2], [S, 'ticket_machine', 2], [S, 'bench_concrete', 2], [S, 'mailbox', 1], [S, 'bike_rack', 1], [S, 'phone_kiosk', 1], [S, 'planter_box', 1]],
    barrio: [[S, 'bin_round', 2], [S, 'fire_hydrant', 2], [S, 'newspaper_box', 2], [S, 'phone_kiosk', 1], [S, 'bench_slat', 1], [S, 'mailbox', 1], [A, 'wheelie_bin', 2], [A, 'bin_bags', 2], [A, 'drum_rusty', 1]],
    suburb: [[S, 'mailbox', 2], [S, 'fire_hydrant', 2], [S, 'bin_round', 1], [S, 'bench_slat', 1], [A, 'wheelie_bin', 2]],
    port: [[S, 'fire_hydrant', 2], [S, 'bin_box', 1], [A, 'wheelie_bin', 2], [A, 'drum_rusty', 1], [A, 'tyre_stack', 1], [A, 'bin_bags', 1]],
  },
  wall: {
    resort: [[S, 'planter_box', 2], [S, 'bin_round', 1]],
    downtown: [[A, 'cardboard_stack', 1], [A, 'bin_bags', 1], [S, 'planter_box', 1], [A, 'wheelie_bin', 1]],
    barrio: [[A, 'bin_bags', 3], [A, 'cardboard_stack', 2], [A, 'cardboard_box', 2], [A, 'wheelie_bin', 3], [A, 'crate_wood', 1], [A, 'gas_cylinders', 1],
      [A, 'dumpster_closed', 2], [A, 'dumpster_open', 1], [A, 'pallet', 1], [A, 'drum_rusty', 1], [A, 'tyre_stack', 1], [A, 'portable_toilet', 0.3],
      [Y, 'cinder_stack', 1], [Y, 'cinder_broken', 1], [Y, 'cardboard_leaning', 1.5], [Y, 'cardboard_flat', 1], [Y, 'crate_stack', 1],
      [Y, 'plastic_crate', 1], [Y, 'mattress_leaning', 0.6], [Y, 'tyre_pile', 0.6], [Y, 'shopping_trolley', 0.5]],
    suburb: [[A, 'wheelie_bin', 2], [S, 'planter_round', 1]],
    port: [[A, 'pallet_stack', 2], [A, 'drum_oil', 1], [A, 'drum_rusty', 1], [A, 'tyre_stack', 1], [A, 'cardboard_stack', 1], [A, 'bin_bags', 1],
      [Y, 'tyre_pile', 1], [Y, 'cinder_stack', 1], [Y, 'crate_stack', 1], [Y, 'cardboard_bundle', 1]],
  },
  service: [[A, 'dumpster_closed', 3], [A, 'dumpster_open', 1], [A, 'wheelie_bin', 3], [A, 'bin_bags', 3], [A, 'pallet', 1], [A, 'pallet_stack', 1], [A, 'drum_oil', 1], [A, 'cardboard_stack', 1], [A, 'gas_cylinders', 1],
    [Y, 'crate_stack', 1], [Y, 'cardboard_bundle', 1], [Y, 'mattress_flat', 0.4], [Y, 'cinder_stack', 0.6]],
  yard: [[A, 'pallet_stack', 3], [A, 'pallet', 2], [A, 'drum_oil', 2], [A, 'drum_rusty', 2], [A, 'tyre_stack', 2], [A, 'gas_cylinders', 1], [A, 'dumpster_closed', 1], [A, 'portable_toilet', 1],
    [Y, 'skip', 1], [Y, 'cinder_stack', 1], [Y, 'tyre_pile', 1], [Y, 'cinder_broken', 1]],
});

/** Plan sizes (metres, x along the object, z its depth) and draw kind of every object used. */
export const CLUTTER_OBJECTS = Object.freeze({
  bench_slat: [1.84, 0.65, 'clutterLarge'], bench_concrete: [1.8, 0.5, 'clutterLarge'], bin_round: [0.51, 0.51],
  bin_box: [0.52, 0.46], planter_round: [1.09, 1.07], planter_box: [1.6, 0.6], drinking_fountain: [0.5, 0.5],
  bike_rack: [1.9, 0.82], fire_hydrant: [0.48, 0.4], newspaper_box: [0.48, 0.43], ticket_machine: [0.52, 0.42],
  mailbox: [0.5, 0.57], phone_kiosk: [0.84, 0.7, 'clutterLarge'], bus_shelter: [3.8, 1.68, 'clutterLarge'],
  wheelie_bin: [0.61, 0.84], bin_bags: [1.02, 1.05], drum_rusty: [0.59, 0.58], drum_oil: [0.59, 0.58],
  tyre_stack: [0.72, 0.72], cardboard_stack: [1.17, 0.46], cardboard_box: [0.61, 0.4], crate_wood: [0.6, 0.4],
  gas_cylinders: [0.77, 0.37], pallet: [1.2, 0.8], pallet_stack: [1.28, 0.86], dumpster_closed: [1.96, 1.19, 'clutterLarge'],
  dumpster_open: [1.96, 1.64, 'clutterLarge'], portable_toilet: [1.18, 1.18, 'clutterLarge'],
  fence_panel: [2.68, 0.18, 'clutterLarge'], fence_gate: [1.5, 0.18, 'clutterLarge'],
  ac_window: [0.63, 0.4, 'clutterLarge'], ac_condenser: [0.93, 0.46, 'clutterLarge'], gas_meter: [0.54, 0.26],
  // set_yard_clutter (prop artist, 09:00).
  cinder_block: [0.39, 0.19], cinder_stack: [0.81, 0.4], cinder_broken: [0.85, 0.73], plastic_crate: [0.62, 0.42],
  crate_stack: [1.38, 0.61], tyre_loose: [0.67, 0.65], tyre_pile: [1.51, 0.93], cardboard_flat: [1.37, 0.95],
  cardboard_bundle: [0.97, 0.68], cardboard_leaning: [1.52, 0.26], mattress_leaning: [0.92, 0.6], mattress_flat: [1.07, 1.98],
  shopping_trolley: [0.6, 1.05], skip: [5.53, 2.44, 'clutterLarge'], pallet_fence: [3.38, 0.23, 'clutterLarge'], warning_post: [0.45, 0.08],
});
/** Objects that stand loose (a small random turn) rather than square to the street. */
const LOOSE = new Set(['bin_bags', 'cardboard_box', 'cardboard_stack', 'crate_wood', 'drum_rusty', 'drum_oil', 'tyre_stack', 'pallet', 'pallet_stack', 'gas_cylinders', 'wheelie_bin',
  'cinder_block', 'cinder_broken', 'plastic_crate', 'tyre_loose', 'tyre_pile', 'cardboard_flat', 'cardboard_bundle', 'mattress_flat', 'shopping_trolley']);
/** Road classes whose pavements get bus stops. */
const BUS_ROUTES = new Set(['grand_avenue', 'avenue', 'beach_drive', 'rural_avenue', 'street']);

/** A repeatable number in [0, 1) from integers. */
export function clutterHash(a, b = 0, c = 0) {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35) ^ Math.imul((c | 0) + 0x27d4eb2f, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

function pick(list, roll) {
  let total = 0;
  for (const entry of list) total += entry[2];
  let at = roll * total;
  for (const entry of list) {
    at -= entry[2];
    if (at < 0) return entry;
  }
  return list[list.length - 1];
}

function item(set, object, x, z, rotationY, extra) {
  const size = CLUTTER_OBJECTS[object] ?? [0.6, 0.6];
  return { assetId: set, object, x, z, rotationY, kind: size[2] ?? 'clutter', halfX: size[0] / 2, halfZ: size[1] / 2, radius: Math.hypot(size[0], size[1]) / 2, ...extra };
}

/** The district profile (CLUTTER_PROFILES) of an id, or Centro's. */
export const clutterProfileOf = (district) => CLUTTER_PROFILES[district] ?? DEFAULT_PROFILE;

/**
 * Clutter on the pavements of one segment: the kerb zone (bins, hydrants, boxes, benches), the
 * back of the pavement (bags, cartons, wheelie bins) and a bus shelter on each side of a long
 * avenue. Rotations turn each object's front (-Z) to the street, benches' backs to the traffic.
 * @param {object} segment A plan segment (points, length, trimA, trimB, halfWidth, sidewalkLeft,
 *   sidewalkRight, district, roadClass, streetscape, bridge, id).
 * @param {{bounds?: object, density?: number, inside?: (x: number, z: number) => boolean}} [options]
 * @returns {object[]} Items {assetId, object, x, z, rotationY, kind, halfX, halfZ, radius, zone}.
 */
export function layOutSidewalkClutter(segment, options = {}) {
  if (segment.bridge || segment.paved === false || segment.streetscape === 'highway' || segment.streetscape === 'track') return [];
  const profile = clutterProfileOf(segment.district);
  const density = Math.max(0.1, options.density ?? 1);
  const inside = options.inside ?? (() => true);
  const items = [];
  const start = (segment.trimA ?? 0) + 5;
  const end = (segment.length ?? 0) - (segment.trimB ?? 0) - 5;
  if (end <= start) return items;
  const id = segment.id ?? 0;
  const half = segment.halfWidth ?? 4;
  const p = segment.points;
  const pointAt = (along) => {
    let travelled = 0;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const length = Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]);
      if (length > 1e-6 && (along <= travelled + length || i + 4 >= p.length)) {
        const dx = (p[i + 2] - p[i]) / length;
        const dz = (p[i + 3] - p[i + 1]) / length;
        const t = Math.min(length, along - travelled);
        return [p[i] + dx * t, p[i + 1] + dz * t, dx, dz];
      }
      travelled += length;
    }
    return null;
  };
  const place = (along, side, offset, chosen, zone, turn, extra) => {
    const at = pointAt(along);
    if (!at) return;
    const [cx, cz, dx, dz] = at;
    const leftX = dz;
    const leftZ = -dx;
    const x = cx + leftX * offset * side;
    const z = cz + leftZ * offset * side;
    if (!inside(x, z)) return;
    // Front (-Z) towards the street centre: -Z = -left * side.
    const facing = Math.atan2(leftX * side, leftZ * side);
    items.push(item(chosen[0], chosen[1], x, z, facing + turn, { zone, segment: id, ...extra }));
  };

  for (const side of [-1, 1]) {
    const sidewalk = side > 0 ? segment.sidewalkLeft : segment.sidewalkRight;
    // A service road (the port's yards) has no pavement: its stock stands on the ground beside it.
    const service = !(sidewalk > 0) && segment.roadClass === 'service';
    if (!(sidewalk >= 2) && !service) continue;
    const salt = side > 0 ? 1 : 2;
    // Kerb zone: 0.55 m behind the kerb, every 11 m at full density.
    const kerbStep = service ? Infinity : 11 / Math.max(0.15, profile.kerb * density);
    for (let along = start + clutterHash(id, salt, 7) * kerbStep, n = 0; along < end; along += kerbStep, n += 1) {
      if (clutterHash(id, salt * 1000 + n, 1) > 0.8) continue;
      const chosen = pick(MIXES.kerb[profile.mix], clutterHash(id, salt * 1000 + n, 2));
      const [, depth] = CLUTTER_OBJECTS[chosen[1]] ?? [0.6, 0.6];
      const bench = chosen[1].startsWith('bench');
      const loose = LOOSE.has(chosen[1]) ? (clutterHash(id, salt * 1000 + n, 3) - 0.5) * 0.9 : 0;
      place(along, side, half + 0.55 + depth / 2, chosen, 'kerb', bench ? Math.PI : loose);
    }
    // Back of the pavement: against the shop fronts and walls.
    {
      const back = service ? 2.2 : sidewalk;
      const wallStep = 9 / Math.max(0.05, profile.wall * density);
      for (let along = start + clutterHash(id, salt, 8) * wallStep, n = 0; along < end; along += wallStep, n += 1) {
        if (clutterHash(id, salt * 1000 + n, 4) > 0.75) continue;
        let chosen = pick(MIXES.wall[profile.mix], clutterHash(id, salt * 1000 + n, 5));
        if (DEEP.has(chosen[1]) && !service && sidewalk < 3.2) chosen = [A, 'bin_bags'];
        const [, depth] = CLUTTER_OBJECTS[chosen[1]] ?? [0.6, 0.6];
        const loose = LOOSE.has(chosen[1]) ? (clutterHash(id, salt * 1000 + n, 6) - 0.5) * 0.8 : 0;
        place(along, side, half + back - 0.35 - depth / 2, chosen, 'wall', loose);
        // A dumpster gathers bags at one end and cartons at the other.
        if (chosen[1].startsWith('dumpster') && clutterHash(id, salt * 1000 + n, 12) < 0.75) {
          place(along + 1.7, side, half + back - 0.35 - 0.53, [A, 'bin_bags'], 'wall', (clutterHash(id, n, 13) - 0.5) * 0.8);
          if (clutterHash(id, salt * 1000 + n, 14) < 0.5) place(along - 1.75, side, half + back - 0.35 - 0.23, [A, 'cardboard_stack'], 'wall', (clutterHash(id, n, 15) - 0.5) * 0.8);
        }
        // Bags and cartons gather in twos and threes.
        if ((chosen[1] === 'bin_bags' || chosen[1].startsWith('cardboard')) && clutterHash(id, salt * 1000 + n, 9) < 0.6) {
          const next = pick(MIXES.wall[profile.mix], clutterHash(id, salt * 1000 + n, 10));
          const [, nextDepth] = CLUTTER_OBJECTS[next[1]] ?? [0.6, 0.6];
          place(along + 1.4, side, half + back - 0.35 - nextDepth / 2, next, 'wall', (clutterHash(id, n, 11) - 0.5) * 0.8);
        }
      }
    }
    // A bus stop on each side of a long avenue, staggered; a bin beside it.
    if (BUS_ROUTES.has(segment.roadClass) && sidewalk >= 3.6 && end - start > 100 && (segment.roadClass !== 'street' || clutterHash(id, 77) < 0.25)) {
      const along = start + (end - start) * (side > 0 ? 0.32 : 0.68);
      place(along, side, half + sidewalk - 0.95, [S, 'bus_shelter'], 'stop', 0, { stop: true });
      place(along + 2.8, side, half + 0.8, [S, 'bin_round'], 'kerb', 0);
    }
  }
  return items;
}

/**
 * Clutter round one building: dumpsters, wheelie bins, bags and pallets on its service sides
 * (the side and back walls, where the lot leaves room), yard stock and a chain-link fence round
 * an industrial lot, and air-conditioning boxes and gas meters on the walls.
 * @param {object} building A building plan (buildingMassingPlan.js: lotId, family, y, storeys,
 *   upperHeight, edges with ax, az, nx, nz, tx, tz, length, front, bays).
 * @param {object} lot Its plan lot (ring, district, zone, frontX, frontZ).
 * @param {{density?: number}} [options]
 * @returns {object[]} Items as layOutSidewalkClutter's, plus y (metres above the lot) for wall units.
 */
export function layOutBuildingClutter(building, lot, options = {}) {
  const items = [];
  if (!building || !lot?.ring) return items;
  const profile = clutterProfileOf(lot.district);
  const density = Math.max(0.1, options.density ?? 1);
  const id = building.lotId ?? lot.id ?? 0;
  const inLot = (x, z, margin) => insideQuad(lot.ring, x, z, margin);
  const industrial = building.family === 'industrial' || lot.zone === 'industrial';
  const tower = building.family === 'tower';
  building.edges.forEach((edge, e) => {
    const facing = Math.atan2(-edge.nx, -edge.nz); // object -Z along the wall's outward normal
    const at = (along, out) => [edge.ax + edge.tx * along + edge.nx * out, edge.az + edge.tz * along + edge.nz * out];
    // Service sides: a few items along each side and back wall, where the lot leaves room.
    if (!edge.front || industrial) {
      const share = profile.service * density * (edge.front ? 0.6 : 1);
      const count = Math.floor(edge.length / (7 / Math.max(1, profile.service)));
      for (let n = 0; n < count; n += 1) {
        if (clutterHash(id, e * 100 + n, 21) > share * 0.55) continue;
        const chosen = pick(edge.front ? MIXES.yard : (industrial ? [...MIXES.service, ...MIXES.yard] : MIXES.service), clutterHash(id, e * 100 + n, 22));
        const [, depth] = CLUTTER_OBJECTS[chosen[1]] ?? [0.6, 0.6];
        const along = (n + 0.5 + (clutterHash(id, e * 100 + n, 23) - 0.5) * 0.6) * (edge.length / count);
        const out = (edge.front ? 1.5 : 0.25) + depth / 2;
        const [x, z] = at(along, out);
        if (!inLot(x, z, depth / 2 + 0.2)) continue;
        const loose = LOOSE.has(chosen[1]) ? (clutterHash(id, e * 100 + n, 24) - 0.5) * 0.9 : 0;
        items.push(item(chosen[0], chosen[1], x, z, facing + loose, { zone: edge.front ? 'yard' : 'service', lotId: id }));
      }
    }
    // Wall units: air-conditioning boxes under upper windows, a condenser and a gas meter low on
    // side walls. Not on glass towers.
    if (tower) return;
    const units = profile.wallUnits * density;
    let along = 0.5;
    edge.bays.forEach((bay, b) => {
      const centre = along + bay.width / 2;
      along += bay.width;
      const storeys = Math.min(building.storeys - 1, 6);
      for (let storey = 1; storey <= storeys; storey += 1) {
        if (clutterHash(id, e * 1000 + b * 10 + storey, 31) > units * (edge.front ? 0.6 : 1.3)) continue;
        const [x, z] = at(centre + (clutterHash(id, b, storey) - 0.5) * bay.width * 0.4, 0);
        items.push(item(A, 'ac_window', x, z, facing, { zone: 'mounted', lotId: id, y: (building.groundHeight ?? 4.2) + (storey - 1) * (building.upperHeight ?? 3.2), mounted: true }));
      }
      if (!edge.front || profile.mix === 'barrio') {
        const roll = clutterHash(id, e * 1000 + b, 32);
        if (roll < units * 0.6) {
          const [x, z] = at(centre, 0);
          items.push(item(A, 'ac_condenser', x, z, facing, { zone: 'mounted', lotId: id, y: 0, mounted: true }));
        } else if (roll < units && inLot(...at(centre, 0.3), 0)) {
          const [x, z] = at(centre + bay.width * 0.3, 0);
          items.push(item(A, 'gas_meter', x, z, facing, { zone: 'mounted', lotId: id, y: 0, mounted: true }));
        }
      }
    });
  });
  // About half the industrial lots are fenced (front and sides; the back meets the neighbour).
  if (industrial && clutterHash(id, 41) < 0.55) items.push(...layOutLotFence(lot, id));
  // Everything stands on the building's pad.
  for (const each of items) each.base = building.y ?? 0;
  return items;
}

/** Landmark lots with no building that are open yards to stock (the port's container terminal ...). */
export const STOCKED_YARDS = new Set(['container_terminal', 'shipyard', 'warehouse', 'fuel_depot', 'scrapyard', 'truck_depot']);
/** Blocks of yard stock: [object, rows, columns, pitch along, pitch across]. */
const STOCK_BLOCKS = Object.freeze([
  ['pallet_stack', 2, 3, 1.5, 1.1], ['drum_oil', 2, 4, 0.7, 0.7], ['drum_rusty', 2, 3, 0.7, 0.7],
  ['tyre_stack', 2, 3, 0.85, 0.85], ['gas_cylinders', 1, 3, 0.95, 0.6], ['dumpster_closed', 1, 2, 2.3, 1.5],
  ['pallet', 2, 2, 1.35, 1.0], ['portable_toilet', 1, 2, 1.35, 1.3],
]);

/**
 * Stock on an open yard lot (no building): blocks of pallet stacks, drums, tyres, cylinders and
 * skips in rows with aisles between them (a quarter of the places left open for vehicles), and a
 * chain-link fence round it. Drawn as large clutter (seen across the yard).
 * @param {object} lot A plan lot (ring, id, y).
 * @returns {object[]} Items as layOutSidewalkClutter's, with base = the lot's height.
 */
export function layOutYardStock(lot) {
  const items = [];
  const ring = lot?.ring;
  if (!ring) return items;
  const id = lot.id ?? 0;
  const [ax, az, bx, bz, , , dx, dz] = ring;
  const width = Math.hypot(bx - ax, bz - az);
  const depth = Math.hypot(dx - ax, dz - az);
  if (width < 12 || depth < 12) return items;
  const tx = (bx - ax) / width;
  const tz = (bz - az) / width;
  const nx = (dx - ax) / depth;
  const nz = (dz - az) / depth;
  const rotationY = Math.atan2(-tz, tx); // object +X along the front edge
  let n = 0;
  for (let u = 7; u < width - 7; u += 14) {
    for (let v = 9; v < depth - 7; v += 11, n += 1) {
      if (clutterHash(id, n, 71) < 0.25) continue;
      const [object, rows, columns, along, across] = STOCK_BLOCKS[Math.floor(clutterHash(id, n, 72) * STOCK_BLOCKS.length)];
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < columns; c += 1) {
          if (clutterHash(id, n * 31 + r * 7 + c, 73) < 0.12) continue;
          const pu = u + (c - (columns - 1) / 2) * along;
          const pv = v + (r - (rows - 1) / 2) * across;
          const x = ax + tx * pu + nx * pv;
          const z = az + tz * pu + nz * pv;
          if (!insideQuad(ring, x, z, 1.5)) continue;
          const loose = LOOSE.has(object) ? (clutterHash(id, n * 31 + r * 7 + c, 74) - 0.5) * 0.5 : 0;
          items.push(item(A, object, x, z, rotationY + loose, { zone: 'yard', lotId: id, kind: 'clutterLarge', block: `${id}:${n}` }));
        }
      }
    }
  }
  items.push(...layOutLotFence(lot, id));
  for (const each of items) each.base = lot.y ?? 0;
  return items;
}

/**
 * A chain-link fence 0.35 m inside an industrial lot's edges: panels at a 2.5 m pitch, a 7 m
 * opening for vehicles in the middle of the front with a gate beside it.
 */
export function layOutLotFence(lot, id = lot.id ?? 0) {
  const items = [];
  const ring = lot.ring;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < 8; i += 2) { cx += ring[i] / 4; cz += ring[i + 1] / 4; }
  for (let k = 0; k < 4; k += 1) {
    if (k === 2) continue; // the back edge
    let ax = ring[k * 2]; let az = ring[k * 2 + 1];
    let bx = ring[((k + 1) % 4) * 2]; let bz = ring[((k + 1) % 4) * 2 + 1];
    // Pull the edge 0.35 m towards the lot centre.
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 4) continue;
    const tx = (bx - ax) / length;
    const tz = (bz - az) / length;
    let nx = -tz;
    let nz = tx;
    if (nx * (cx - ax) + nz * (cz - az) < 0) { nx = -nx; nz = -nz; }
    ax += nx * 0.35; az += nz * 0.35; bx += nx * 0.35; bz += nz * 0.35;
    const front = k === 0;
    const rotationY = Math.atan2(-tz, tx); // object +X along the edge
    const panels = Math.floor((length - 1) / 2.5);
    const gapFrom = front && panels >= 6 ? panels / 2 - 1.6 : Infinity;
    const gapTo = front && panels >= 6 ? panels / 2 + 1.6 : -Infinity;
    for (let n = 0; n < panels; n += 1) {
      const along = 0.5 + 1.25 + n * 2.5;
      if (n + 0.5 > gapFrom && n + 0.5 < gapTo) continue;
      const gate = front && n + 1.5 > gapFrom && n + 0.5 <= gapFrom;
      items.push(item(A, gate ? 'fence_gate' : 'fence_panel', ax + tx * along, az + tz * along, rotationY, { zone: 'fence', lotId: id, fence: true }));
    }
  }
  return items;
}

/** Whether a point lies inside a convex four-corner ring, at least `margin` metres from its edges. */
export function insideQuad(ring, x, z, margin = 0) {
  let area = 0;
  for (let k = 0; k < 4; k += 1) area += ring[k * 2] * ring[((k + 1) % 4) * 2 + 1] - ring[((k + 1) % 4) * 2] * ring[k * 2 + 1];
  const sign = area < 0 ? -1 : 1;
  for (let k = 0; k < 4; k += 1) {
    const ax = ring[k * 2]; const az = ring[k * 2 + 1];
    const bx = ring[((k + 1) % 4) * 2]; const bz = ring[((k + 1) % 4) * 2 + 1];
    const length = Math.hypot(bx - ax, bz - az) || 1;
    const cross = ((bx - ax) * (z - az) - (bz - az) * (x - ax)) / length;
    if (cross * sign < margin) return false;
  }
  return true;
}
