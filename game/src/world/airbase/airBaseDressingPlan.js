// Where the dressing of Base Aérea Punta Garza goes, as plain numbers (no three.js, so Node tests
// it): the ground equipment of the kit (military/base_ground_kit.glb) on the stands, by the
// shelters and under the nets, the watchtowers and camouflage nets, the worn-ground decals of
// military/base_ground.glb (tyre rubber, oil, jet scorch, cracks), the dirt patrol track, the
// hardstands of the ordnance area, and the grass and scrub of the field.
//
//   const dressing = planAirBaseDressing();        // layout.dressing holds the same thing
//   dressing.props        // [{node, x, z, heading, scale, e, n, collide}]   kit items, world metres
//   dressing.keepClear    // the corridors nothing may stand in (taxi, scramble, patrol, the walk)
//
// Everything is authored in CITY coordinates (e east, n north) like the plan of the base, and every
// aircraft stands nose to city north, so "r metres right, a metres ahead" of a stand is (e + r,
// n + a). Headings in the result are compass radians in the world (0 = north = -Z, clockwise).
// The layout draws no random number from outside: the same base on every build.

import { PUNTA_GARZA_AIR_BASE, puntaGarzaToWorld } from '../../catalog/puntaGarzaAirBase.js';

const RADIANS = Math.PI / 180;
/** The city grid is turned this much: a city-north heading is this compass heading in the world. */
const GRID_TURN = 6;

/**
 * The kit's items: footprint width (x), length (z) and height, metres (a5's NODES.md), and
 * whether the item gets a static box collider (the small ones are walked and driven over).
 */
export const GROUND_KIT_ITEMS = Object.freeze({
  gse_fuel_truck: Object.freeze({ width: 2.9, length: 8.0, height: 3.0, collide: true }),
  gse_tug: Object.freeze({ width: 1.9, length: 3.45, height: 1.7, collide: true, tail: 3.1 }),
  gse_stairs: Object.freeze({ width: 1.45, length: 3.9, height: 3.05, collide: true }),
  gse_generator: Object.freeze({ width: 1.8, length: 3.4, height: 1.85, collide: true }),
  gse_crate_stack: Object.freeze({ width: 1.3, length: 1.1, height: 1.3, collide: true }),
  gse_cone: Object.freeze({ width: 0.4, length: 0.4, height: 0.75, collide: false }),
  gse_drum: Object.freeze({ width: 0.6, length: 0.6, height: 0.9, collide: true }),
  gse_chocks: Object.freeze({ width: 0.5, length: 0.8, height: 0.2, collide: false }),
  gse_fire_extinguisher_cart: Object.freeze({ width: 0.6, length: 0.75, height: 1.2, collide: false }),
  gse_tool_trolley: Object.freeze({ width: 0.55, length: 0.95, height: 1.0, collide: false }),
});

/** Sizes of the perimeter models (a4's NODES.md): width (x), height, depth (z). */
export const PERIMETER_SIZES = Object.freeze({
  base_watchtower: Object.freeze({ width: 4.4, height: 9.2, depth: 5.2 }),
  base_camo_net: Object.freeze({ width: 24, height: 6.2, depth: 18 }),
});

/** Half spans (metres) kept clear either side of the lines aircraft roll along. */
const HALF_SPAN = Object.freeze({ manta_sombra: 25, garza_negra: 10, halcon: 8 });
/** Clear half widths of the jeep's lap and of the lead's walk to the hangar. */
const PATROL_HALF = 3.5;
const WALK_HALF = 3;
/**
 * The lead's marked walk from the gate to the Manta's hangar in city coordinates (the same points
 * as story/final/stages/cross_the_base.js WAY_TO_HANGAR_TWO, which is in world metres).
 */
const WALK_WAY = Object.freeze([[-1500, 796], [-1501, 848], [-1516, 957], [-1546, 1089], [-1583, 1171], [-1603, 1201]]);

/** A small repeatable generator (mulberry32). */
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const segmentDistance = (e, n, a, b) => {
  const de = b[0] - a[0];
  const dn = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((e - a[0]) * de + (n - a[1]) * dn) / (de * de + dn * dn || 1)));
  return Math.hypot(e - (a[0] + de * t), n - (a[1] + dn * t));
};

const insideRing = (ring, e, n) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    if (ring[i][1] > n !== ring[j][1] > n && e < ((ring[j][0] - ring[i][0]) * (n - ring[i][1])) / (ring[j][1] - ring[i][1]) + ring[i][0]) inside = !inside;
  }
  return inside;
};

/**
 * The lines nothing may stand on, in city coordinates: [{id, half, line: [[e, n], ...], closed}].
 * @param {typeof PUNTA_GARZA_AIR_BASE} [base]
 */
export function airBaseKeepClear(base = PUNTA_GARZA_AIR_BASE) {
  const parallel = base.taxiways.find((way) => way.id === 'taxi_parallel').line;
  const link = base.taxiways.find((way) => way.id === 'taxi_link_east').line;
  const taxiNorth = parallel[0][1];
  const runwayNorth = base.runway.from[1];
  const lines = [];
  for (const stand of base.stands) {
    const half = HALF_SPAN[stand.model] ?? 8;
    if (stand.id.startsWith('alert_')) {
      // The alert pair rolls straight ahead from its pad onto the runway.
      lines.push({ id: `scramble_${stand.id}`, half, line: [[stand.at[0], stand.at[1] - 8], [stand.at[0], runwayNorth]], closed: false });
    } else {
      // The mission's taxi line: ahead onto the parallel taxiway, east along it, the east link, the runway.
      lines.push({ id: `taxi_${stand.id}`, half, line: [[stand.at[0], stand.at[1] - 12], [stand.at[0], taxiNorth], [link[0][0], taxiNorth], [link[0][0], runwayNorth + 20]], closed: false });
    }
  }
  lines.push({ id: 'runway', half: base.runway.width / 2 + 3, line: [base.runway.from, base.runway.to], closed: false });
  for (const way of base.taxiways) lines.push({ id: way.id, half: way.width / 2 + 1, line: way.line, closed: false });
  lines.push({ id: 'access_road', half: base.accessRoad.width / 2 + 1, line: base.accessRoad.line, closed: false });
  lines.push({ id: 'patrol', half: PATROL_HALF, line: base.patrolRoute, closed: true });
  lines.push({ id: 'walk', half: WALK_HALF, line: WALK_WAY, closed: false });
  return lines;
}

/**
 * Metres from a city point to a keep-clear line, less the line's half width: negative inside.
 * @param {{half: number, line: number[][], closed: boolean}} clear
 */
export function clearanceTo(clear, e, n) {
  let best = Infinity;
  const count = clear.line.length - (clear.closed ? 0 : 1);
  for (let i = 0; i < count; i += 1) best = Math.min(best, segmentDistance(e, n, clear.line[i], clear.line[(i + 1) % clear.line.length]));
  return best - clear.half;
}

/** City rectangles [west, east, south, north] that are paved or built on (no grass grows there). */
function hardGround(base) {
  const rects = [];
  const { west, east, south, north } = base.apron;
  rects.push([west, east, south, base.taxiways[0].line[0][1]]);
  const half = base.runway.width / 2;
  rects.push([base.runway.to[0], base.runway.from[0], base.runway.from[1] - half, base.runway.from[1] + half]);
  for (const way of base.taxiways) {
    const [a, b] = way.line;
    const grow = way.id === 'taxi_parallel' ? 9 : 0;
    const w = way.width / 2;
    rects.push([Math.min(a[0], b[0]) - (a[1] === b[1] ? grow : w), Math.max(a[0], b[0]) + (a[1] === b[1] ? grow : w),
      Math.min(a[1], b[1]) - (a[1] === b[1] ? w : 0), Math.max(a[1], b[1]) + (a[1] === b[1] ? w : 0)]);
  }
  const road = base.accessRoad;
  rects.push([road.line[0][0] - road.width / 2, road.line[0][0] + road.width / 2, road.line[0][1], road.line[road.line.length - 1][1]]);
  for (const shelter of base.shelters) rects.push([shelter.at[0] - 31, shelter.at[0] + 31, shelter.at[1] - 22, shelter.at[1] + 26]);
  rects.push([base.controlTower.at[0] - 9, base.controlTower.at[0] + 9, base.controlTower.at[1] - 9, base.controlTower.at[1] + 9]);
  rects.push([base.gate.guardPost[0] - 3, base.gate.guardPost[0] + 12, base.gate.guardPost[1] - 3, base.gate.guardPost[1] + 3]);
  return rects;
}

/**
 * Plans the dressing of the base.
 * @param {typeof PUNTA_GARZA_AIR_BASE} [base]
 * @returns {AirBaseDressing}
 */
export function planAirBaseDressing(base = PUNTA_GARZA_AIR_BASE) {
  const random = createRandom(0x9a52a);
  const between = (low, high) => low + (high - low) * random();
  const world = (e, n) => puntaGarzaToWorld(e, n);
  const compass = (cityDegrees) => ((((cityDegrees + GRID_TURN) % 360) + 360) % 360) * RADIANS;
  const keepClear = airBaseKeepClear(base);
  const props = [];
  const decals = [];
  /** A kit item at a city place, its front towards `facing` (city degrees, 0 = city north). */
  const put = (node, e, n, facing = 0, scale = 1) => {
    props.push({ node, e, n, ...world(e, n), heading: compass(facing), scale, collide: GROUND_KIT_ITEMS[node].collide });
  };
  /** A ground decal: its V axis (length) points towards `facing`; alpha 0..1 thins it. */
  const stain = (kind, e, n, facing, width, length, alpha = 1) => {
    decals.push({ kind, e, n, ...world(e, n), heading: compass(facing), width, length, alpha });
  };

  // ---- The stands of the two special aircraft and of the alert pair (real vehicles that taxi
  // away): the equipment waits beside the stand box, clear of the wing and of the way out.
  for (const stand of base.stands) {
    const [e, n] = stand.at;
    const out = (HALF_SPAN[stand.model] ?? 8) + 1.5;
    const big = stand.model === 'manta_sombra';
    // Cones mark the corners of the stand.
    for (const side of [-1, 1]) {
      put('gse_cone', e + side * out, n - 17, between(0, 360));
      put('gse_cone', e + side * out, n - 4, between(0, 360));
    }
    put('gse_fire_extinguisher_cart', e + out + 1.2, n - 9, 250);
    put('gse_chocks', e + out + 0.4, n - 12.5, 80);
    put('gse_chocks', e + out + 1.1, n - 13.4, 20);
    put('gse_tool_trolley', e - out - 1.4, n - 8, 100);
    put('gse_crate_stack', e - out - 1.8, n - 12, between(-12, 12));
    put('gse_drum', e - out - 3.3, n - 12.4, between(0, 360));
    put('gse_drum', e - out - 3.1, n - 11.5, between(0, 360));
    if (big || stand.model === 'garza_negra') put('gse_stairs', e + out + 3.4, n - 20, 300);
    else put('gse_generator', e - out - 1.6, n - 3.5, 80);
    // Oil under the engines, soot behind the nozzles (the blast blows towards city south).
    for (let i = 0; i < 3; i += 1) stain('decal_oil_stain', e + between(-3, 3), n + between(-7, 2), between(0, 360), between(1.6, 3.2), between(1.6, 3.2), between(0.6, 1));
    for (const offset of big ? [-4.5, 4.5] : [0]) stain('decal_scorch', e + offset, n - (big ? 15 : stand.model === 'garza_negra' ? 21 : 12), 180, between(6, 7.5), between(8, 10.5), between(0.7, 1));
  }

  // ---- The parked Halcón (static scenery): chocks at the wheels, cones at the wing tips, a power
  // unit by the nose of every other one, a tool trolley and an extinguisher between them.
  (base.parkedFighters ?? []).forEach((fighter, index) => {
    const [e, n] = fighter.at;
    const sheltered = fighter.place === 'shelter';
    // The Halcón's tyres touch the ground 1.4 m either side and 0.9 m behind its origin, the nose wheel 4.2 m ahead.
    for (const side of [-1, 1]) put('gse_chocks', e + side * 1.4, n - 0.9, 0);
    put('gse_chocks', e, n + 4.2, 0);
    stain('decal_oil_stain', e + between(-1.2, 1.2), n + between(-5, -1), between(0, 360), between(1.8, 3), between(1.8, 3), between(0.6, 1));
    stain('decal_oil_stain', e + between(-1, 1), n + between(1, 4), between(0, 360), between(1.2, 2.2), between(1.2, 2.2), between(0.5, 0.9));
    if (sheltered) {
      put('gse_tool_trolley', e + 8, n - 3, 280);
      put('gse_fire_extinguisher_cart', e - 9, n + 6, 90);
      put('gse_generator', e - 7.5, n + 1.5, 20);
      return;
    }
    stain('decal_scorch', e, n - 11.4, 180, between(6, 7), between(8, 10), between(0.75, 1));
    for (const side of [-1, 1]) {
      put('gse_cone', e + side * 5.6, n - 3.2, between(0, 360));
      put('gse_cone', e + side * 2.2, n + 9.6, between(0, 360));
    }
    if (index % 2 === 0) put('gse_generator', e - 4.6, n + 4.4, 75);
    else put('gse_tool_trolley', e + 6.4, n + 2.2, 200);
    put('gse_fire_extinguisher_cart', e + 7.2, n - 6.5, 260 + index * 20);
    if (index % 2 === 1) put('gse_stairs', e - 6.6, n - 8.5, 20);
  });

  // ---- By the shelters: stores at the west jamb, an extinguisher at the east one (not where the
  // lead's walk passes between shelters one and two).
  base.shelters.forEach((shelter, index) => {
    const [e, n] = shelter.at;
    const door = n + 24;
    put('gse_crate_stack', e - 27.6, door, between(-8, 8));
    put('gse_crate_stack', e - 27.5, door + 1.4, between(80, 100), 0.9);
    put('gse_drum', e - 26.3, door + 2.8, between(0, 360));
    put('gse_drum', e - 27.1, door + 3.2, between(0, 360));
    put('gse_drum', e - 26.6, door + 3.9, between(0, 360));
    if (index !== 0) {
      put('gse_fire_extinguisher_cart', e + 27.4, door + 0.4, 180);
      put('gse_cone', e + 26.2, door + 2.2, 0);
    }
    stain('decal_oil_stain', e + between(-12, 12), door + between(1, 5), between(0, 360), between(2, 3.6), between(2, 3.6), between(0.5, 0.9));
  });

  // ---- Fuel bowsers on the apron's south edge by the tower, one fuelling the first of the line;
  // the tug with its tow bar by the Manta's shelter.
  const line = (base.parkedFighters ?? []).filter((fighter) => fighter.place === 'apron');
  const bowsers = [[-1332, 1164, 0], [-1324, 1164.6, 0]];
  if (line.length > 0) bowsers.push([line[0].at[0] - 15, line[0].at[1] - 4, 0]);
  for (const [e, n, facing] of bowsers) {
    put('gse_fuel_truck', e, n, facing);
    put('gse_cone', e - 2.1, n + 4.8, 0);
    put('gse_cone', e + 2.1, n - 4.8, 0);
    stain('decal_oil_stain', e + between(-0.6, 0.6), n + between(-2, 3), between(0, 360), between(2, 3.4), between(2, 3.4), between(0.6, 1));
  }
  put('gse_fire_extinguisher_cart', -1319.5, 1160.5, 90);
  const mantaShelter = base.shelters.find((shelter) => shelter.holds === 'manta_sombra') ?? base.shelters[0];
  put('gse_tug', mantaShelter.at[0] - 23, mantaShelter.at[1] + 38, 62);
  put('gse_chocks', mantaShelter.at[0] - 25.5, mantaShelter.at[1] + 36, 140);

  // ---- The ordnance area east of the road and a stores revetment in the west field, each under a
  // camouflage net on its own concrete hardstand (the net's propped front faces the base's middle).
  const nets = [
    { id: 'net_ordnance_1', at: [-1262, 978], facing: 270 },
    { id: 'net_ordnance_2', at: [-1262, 1008], facing: 270 },
    { id: 'net_stores_west', at: [-1622, 1000], facing: 90 },
  ];
  const hardstands = [];
  for (const net of nets) {
    const [e, n] = net.at;
    // The net is 24 m along its own X: turned to face east or west that runs north-south.
    hardstands.push({ id: net.id, west: e - 11, east: e + 11, south: n - 13.5, north: n + 13.5 });
    const inward = net.facing === 270 ? -1 : 1;
    for (let i = 0; i < 4; i += 1) put('gse_crate_stack', e - inward * between(0.5, 5), n - 9 + i * 5.6 + between(-0.6, 0.6), between(-10, 10) + (i % 2) * 90);
    for (let i = 0; i < 5; i += 1) put('gse_drum', e - inward * 6.6 + between(-0.25, 0.25), n - 8.5 + i * 0.72, between(0, 360));
    put('gse_tool_trolley', e + inward * 3.2, n + 6.5, 30);
    put('gse_cone', e + inward * 9.5, n - 11.5, 0);
    put('gse_cone', e + inward * 9.5, n + 11.5, 0);
    stain('decal_oil_stain', e + between(-4, 4), n + between(-6, 6), between(0, 360), between(2, 3.4), between(2, 3.4), between(0.5, 0.9));
  }
  put('gse_generator', nets[2].at[0] + 6, nets[2].at[1] - 7.5, 200);

  // ---- Watchtowers: the corners of the fence and the gate, each looking out over the wire.
  const watchtowers = [
    { id: 'watch_gate', at: [-1517, 844], facing: 180 },
    { id: 'watch_south_west', at: [-1678, 843], facing: 225 },
    { id: 'watch_south_east', at: [-1256, 843], facing: 150 },
    { id: 'watch_east', at: [-1172, 1052], facing: 100 },
    { id: 'watch_north_east', at: [-1170, 1262], facing: 90 },
    { id: 'watch_north_west', at: [-1678, 1326], facing: 300 },
  ];

  // ---- Runway wear: black rubber in both touchdown zones, thinner streaks along the centreline,
  // soot where the jets hold on the brakes at the east threshold.
  const [fromE, runwayN] = base.runway.from;
  const toE = base.runway.to[0];
  for (const [start, direction] of [[fromE, -1], [toE, 1]]) {
    for (let i = 0; i < 26; i += 1) {
      const along = 55 + (i / 26) * 300 + between(-10, 10);
      const side = i % 2 === 0 ? -1 : 1;
      stain('decal_tyre_rubber', start + direction * along, runwayN + side * between(1.6, 7.5), 270 + between(-1.2, 1.2), between(5, 7.5), between(26, 40), between(0.55, 1) * (1 - (along - 55) / 520));
    }
  }
  for (let e = fromE - 30; e > toE + 30; e -= 42) {
    stain('decal_tyre_rubber', e + between(-12, 12), runwayN + between(-2.4, 2.4), 270 + between(-0.8, 0.8), between(4.5, 6), between(24, 32), between(0.22, 0.45));
  }
  for (const side of [-3.2, 3.4]) stain('decal_scorch', fromE - 38, runwayN + side, 90, 7, 11, 0.8);
  // Tyre marks where aircraft swing off the taxiway links onto the runway.
  for (const way of base.taxiways) {
    if (way.id === 'taxi_parallel') continue;
    stain('decal_tyre_rubber', way.line[0][0] + between(-1.5, 1.5), runwayN - 26, between(-4, 4), 5, 22, between(0.3, 0.5));
  }

  // ---- Cracks: scattered over the apron, the taxiways, the runway and the road.
  const { west, east, south, north } = base.apron;
  const quarter = () => Math.floor(between(0, 4)) * 90 + between(-6, 6);
  for (let i = 0; i < 70; i += 1) stain('decal_crack', between(west + 4, east - 4), between(south + 4, north - 4), quarter(), between(4, 8), between(4, 8), between(0.55, 1));
  for (let i = 0; i < 46; i += 1) stain('decal_crack', between(toE + 10, fromE - 10), runwayN + between(-18, 18), quarter(), between(4, 9), between(4, 9), between(0.5, 0.95));
  for (const way of base.taxiways) {
    const [a, b] = way.line;
    const count = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 22);
    for (let i = 0; i < count; i += 1) {
      const t = random();
      const across = between(-way.width / 2 + 2.5, way.width / 2 - 2.5);
      const along = a[1] === b[1];
      stain('decal_crack', a[0] + (b[0] - a[0]) * t + (along ? 0 : across), a[1] + (b[1] - a[1]) * t + (along ? across : 0), quarter(), between(4, 7), between(4, 7), between(0.5, 0.95));
    }
  }
  const roadLine = base.accessRoad.line;
  for (let n = roadLine[0][1] + 12; n < roadLine[roadLine.length - 1][1] - 6; n += between(22, 44)) {
    stain('decal_crack', roadLine[0][0] + between(-1.5, 1.5), n, quarter(), between(3.5, 5), between(3.5, 5), between(0.5, 0.9));
  }

  // ---- The dirt patrol track: the jeep's lap, 4 m wide (the paving lies over it where they meet).
  const route = base.patrolRoute;
  const dirtTrack = route.map((point, index) => {
    const next = route[(index + 1) % route.length];
    return { a: world(point[0], point[1]), b: world(next[0], next[1]), width: 4 };
  });

  const vegetation = plantField(base, random, hardstands);
  const placed = (item) => ({ ...item, ...world(item.at[0], item.at[1]), heading: compass(item.facing) });
  return {
    props,
    decals,
    nets: nets.map(placed),
    watchtowers: watchtowers.map(placed),
    hardstands: hardstands.map((stand) => ({
      id: stand.id, corners: [world(stand.west, stand.south), world(stand.east, stand.south), world(stand.east, stand.north), world(stand.west, stand.north)],
      west: stand.west, east: stand.east, south: stand.south, north: stand.north,
    })),
    dirtTrack,
    vegetation,
    keepClear,
  };
}

// Grass and scrub: tall clumps and bushes along the inside of the fence, tufts fringing the
// paving, and uneven clusters over the infield. Nothing on paving, on the track, or in a clear way.
function plantField(base, random, hardstands) {
  const between = (low, high) => low + (high - low) * random();
  const hard = hardGround(base);
  for (const stand of hardstands) hard.push([stand.west, stand.east, stand.south, stand.north]);
  const route = base.patrolRoute;
  const pad = base.pad;
  const free = (e, n, margin) => {
    if (!insideRing(pad, e, n)) return false;
    for (const [w, x, s, t] of hard) if (e > w - margin && e < x + margin && n > s - margin && n < t + margin) return false;
    for (let i = 0; i < route.length; i += 1) if (segmentDistance(e, n, route[i], route[(i + 1) % route.length]) < 2.6 + margin) return false;
    return true;
  };
  const grass = [];
  const scrub = [];
  const tuft = (variant, e, n, scale, margin = 0.35) => {
    if (!free(e, n, margin)) return;
    grass.push({ variant, ...puntaGarzaToWorld(e, n), e, n, turn: between(0, Math.PI * 2), scale });
  };
  const bush = (e, n, scale) => {
    if (!free(e, n, 1.6)) return;
    scrub.push({ variant: random() < 0.5 ? 'variant_a' : 'variant_b', ...puntaGarzaToWorld(e, n), e, n, turn: between(0, Math.PI * 2), scale });
  };

  // Along the inside of the fence (the fence is listed clockwise from the river side: its inside
  // is on the right of each run): tall grass every metre and a half, a bush every few metres.
  let previous = null;
  for (const point of base.fence) {
    if (previous && point) {
      const run = Math.hypot(point[0] - previous[0], point[1] - previous[1]);
      const de = (point[0] - previous[0]) / run;
      const dn = (point[1] - previous[1]) / run;
      // The right-hand normal of the run in (e, n).
      const ie = dn;
      const inn = -de;
      for (let along = 0.6; along < run; along += between(0.9, 2.1)) {
        const inset = between(0.3, 3.8);
        tuft('variant_c', previous[0] + de * along + ie * inset, previous[1] + dn * along + inn * inset, between(1.3, 2.5));
      }
      for (let along = 2; along < run; along += between(3.5, 11)) {
        const inset = between(1.6, 5.2);
        bush(previous[0] + de * along + ie * inset, previous[1] + dn * along + inn * inset, between(0.7, 1.45));
      }
    }
    previous = point;
  }

  // Fringes: tufts and creeping weeds where the paving meets the soil.
  const fringe = (a, b, side, step) => {
    const run = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const de = (b[0] - a[0]) / run;
    const dn = (b[1] - a[1]) / run;
    for (let along = 0; along < run; along += between(step * 0.4, step * 1.6)) {
      const out = between(0.45, 2.2) * side;
      tuft(random() < 0.8 ? 'variant_c' : 'variant_a', a[0] + de * along + dn * out, a[1] + dn * along - de * out, between(0.8, 1.7), 0.3);
    }
  };
  const { west, east, south } = base.apron;
  const half = base.runway.width / 2;
  const [fromE, runwayN] = base.runway.from;
  const toE = base.runway.to[0];
  fringe([toE, runwayN + half], [fromE, runwayN + half], -1, 3.2);
  fringe([toE, runwayN - half], [fromE, runwayN - half], 1, 3.2);
  fringe([west, south], [west, base.taxiways[0].line[0][1] - 9], -1, 2.4);
  fringe([east, south], [east, base.taxiways[0].line[0][1] - 9], 1, 2.4);
  fringe([west, south], [east, south], 1, 2.6);
  const parallel = base.taxiways[0];
  fringe([parallel.line[1][0] - 9, parallel.line[0][1] + 9], [parallel.line[0][0] + 9, parallel.line[0][1] + 9], -1, 2.6);
  const road = base.accessRoad;
  for (const side of [-1, 1]) fringe([road.line[0][0] + side * road.width / 2, road.line[1][1]], [road.line[0][0] + side * road.width / 2, road.line[2][1]], side, 2.2);

  // The infield: clusters of clumps round a patch of creeping cover, uneven in size and height.
  let eMin = Infinity, eMax = -Infinity, nMin = Infinity, nMax = -Infinity;
  for (const [e, n] of pad) {
    eMin = Math.min(eMin, e);
    eMax = Math.max(eMax, e);
    nMin = Math.min(nMin, n);
    nMax = Math.max(nMax, n);
  }
  for (let i = 0; i < 1000; i += 1) {
    const e = between(eMin, eMax);
    const n = between(nMin, nMax);
    if (!free(e, n, 1.5)) continue;
    const size = between(0.6, 1);
    tuft('variant_d', e, n, between(1.2, 2.6));
    const count = Math.round(between(4, 13) * size);
    for (let k = 0; k < count; k += 1) {
      const angle = between(0, Math.PI * 2);
      const reach = Math.sqrt(random()) * 5.5 * size;
      tuft('variant_c', e + Math.cos(angle) * reach, n + Math.sin(angle) * reach, between(0.9, 2.1) * size);
    }
    if (random() < 0.16) bush(e + between(-2, 2), n + between(-2, 2), between(0.55, 1.1));
  }
  return { grass, scrub };
}

/**
 * @typedef {ReturnType<typeof planAirBaseDressing>} AirBaseDressing
 */
