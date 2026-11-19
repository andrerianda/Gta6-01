// The dressing of Base Aérea Punta Garza (game/src/world/airbase/airBaseDressingPlan.js): the
// ground equipment, watchtowers, nets, wear decals, dirt track and planting stand where a used
// airfield has them and nowhere an aircraft, the jeep or the lead has to pass; and the registry
// of the military and naval models names what the built files really hold.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { test } from 'node:test';
import { MILITARY_BASE_ASSETS } from '../../../game/src/assets/registry/militaryBase.js';
import { NAVAL_AND_ISLAND_ASSETS } from '../../../game/src/assets/registry/navalAndIsland.js';
import { PUNTA_GARZA_AIR_BASE as BASE, puntaGarzaToWorld } from '../../../game/src/catalog/puntaGarzaAirBase.js';
import { WAY_TO_HANGAR_TWO } from '../../../game/src/story/final/stages/cross_the_base.js';
import {
  GROUND_KIT_ITEMS, PERIMETER_SIZES, airBaseKeepClear, clearanceTo, planAirBaseDressing,
} from '../../../game/src/world/airbase/airBaseDressingPlan.js';
import { PARKED_FIGHTER_SIZE, isOnAirBasePad, planAirBaseLayout } from '../../../game/src/world/airbase/airBaseLayout.js';

const layout = planAirBaseLayout();
const dressing = layout.dressing;
const near = (item, e, n, metres) => Math.hypot(item.e - e, item.n - n) <= metres;
const count = (node) => dressing.props.filter((prop) => prop.node === node).length;
const radiusOf = (prop) => Math.hypot(GROUND_KIT_ITEMS[prop.node].width, GROUND_KIT_ITEMS[prop.node].length) / 2 * (prop.scale ?? 1);
const insideRect = (e, n, west, east, south, north, margin = 0) => e > west - margin && e < east + margin && n > south - margin && n < north + margin;
const apronNorth = BASE.taxiways[0].line[0][1] - BASE.taxiways[0].width / 2;

/** The JSON chunk of a .glb. */
function readGlb(file) {
  const buffer = readFileSync(file);
  return JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString('utf8'));
}

test('the plan is the same on every build and the layout carries it', () => {
  assert.deepEqual(planAirBaseDressing(), planAirBaseDressing());
  assert.equal(layout.dressing.props.length, planAirBaseDressing().props.length);
  for (const prop of dressing.props) {
    assert.ok(GROUND_KIT_ITEMS[prop.node], `unknown kit item ${prop.node}`);
    const at = puntaGarzaToWorld(prop.e, prop.n);
    assert.ok(Math.abs(at.x - prop.x) < 1e-9 && Math.abs(at.z - prop.z) < 1e-9);
    assert.ok(prop.heading >= 0 && prop.heading < Math.PI * 2 + 1e-9);
  }
});

test('the kit is out in airfield numbers: bowsers, a tug, stairs, power units, and clutter by the dozen', () => {
  assert.ok(count('gse_fuel_truck') >= 2 && count('gse_fuel_truck') <= 3);
  assert.equal(count('gse_tug'), 1);
  assert.ok(count('gse_stairs') >= 2);
  assert.ok(count('gse_generator') >= 4);
  for (const node of ['gse_cone', 'gse_chocks', 'gse_drum', 'gse_crate_stack']) assert.ok(count(node) >= 20, `${node}: ${count(node)}`);
  for (const node of ['gse_fire_extinguisher_cart', 'gse_tool_trolley']) assert.ok(count(node) >= 8, `${node}: ${count(node)}`);
  assert.ok(dressing.props.length >= 150 && dressing.props.length <= 260, `${dressing.props.length} items`);
  // The tug waits by the Manta's shelter; the bowsers are on the apron.
  const tug = dressing.props.find((prop) => prop.node === 'gse_tug');
  const shelter = BASE.shelters.find((each) => each.holds === 'manta_sombra');
  assert.ok(near(tug, shelter.at[0], shelter.at[1], 50));
  for (const truck of dressing.props.filter((prop) => prop.node === 'gse_fuel_truck')) {
    assert.ok(insideRect(truck.e, truck.n, BASE.apron.west, BASE.apron.east, BASE.apron.south, apronNorth, -3));
  }
});

test('every occupied stand and every shelter is dressed', () => {
  const spots = [...BASE.stands.map((stand) => stand.at), ...BASE.parkedFighters.map((fighter) => fighter.at)];
  for (const [e, n] of spots) {
    const here = dressing.props.filter((prop) => near(prop, e, n, 34));
    const has = (node) => here.some((prop) => prop.node === node);
    assert.ok(has('gse_chocks'), `no chocks at ${e}, ${n}`);
    assert.ok(has('gse_fire_extinguisher_cart'), `no extinguisher at ${e}, ${n}`);
    assert.ok(has('gse_tool_trolley') || has('gse_generator'), `no trolley or power unit at ${e}, ${n}`);
    assert.ok(dressing.decals.some((decal) => decal.kind === 'decal_oil_stain' && near(decal, e, n, 9)), `no oil at ${e}, ${n}`);
  }
  for (const stand of BASE.stands) {
    const here = dressing.props.filter((prop) => near(prop, stand.at[0], stand.at[1], 34));
    assert.ok(here.filter((prop) => prop.node === 'gse_cone').length >= 4);
    assert.ok(here.some((prop) => prop.node === 'gse_crate_stack') && here.some((prop) => prop.node === 'gse_drum'));
  }
  for (const shelter of BASE.shelters) {
    const here = dressing.props.filter((prop) => near(prop, shelter.at[0], shelter.at[1] + 24, 34));
    assert.ok(here.some((prop) => prop.node === 'gse_crate_stack') && here.filter((prop) => prop.node === 'gse_drum').length >= 2, shelter.id);
  }
  // A power unit by the parked Halcón: one at each alert pad, and by at least two of the line.
  const byHalcon = [...BASE.stands.filter((stand) => stand.model === 'halcon').map((stand) => stand.at),
    ...BASE.parkedFighters.filter((fighter) => fighter.place === 'apron').map((fighter) => fighter.at)];
  const powered = byHalcon.filter(([e, n]) => dressing.props.some((prop) => prop.node === 'gse_generator' && near(prop, e, n, 14)));
  assert.ok(powered.length >= 4, `${powered.length} Halcón have a power unit`);
});

test('the chocks of the parked Halcón are at its wheels, and its cones outside its wing tips', () => {
  for (const fighter of BASE.parkedFighters) {
    const [e, n] = fighter.at;
    const chocks = dressing.props.filter((prop) => prop.node === 'gse_chocks' && near(prop, e, n, 6));
    assert.equal(chocks.length, 3, fighter.id);
    // Tyre contact points of the model: 1.4 m either side and 0.9 m behind the origin, the nose wheel 4.2 m ahead.
    for (const [r, a] of [[-1.4, -0.9], [1.4, -0.9], [0, 4.2]]) assert.ok(chocks.some((prop) => near(prop, e + r, n + a, 0.05)), `${fighter.id} wheel ${r}, ${a}`);
  }
});

test('nothing stands in a way: the taxi route, the scramble, the runway and taxiways, the road, the patrol lap, the walk', () => {
  const lines = airBaseKeepClear();
  for (const id of ['taxi_stand_manta', 'taxi_stand_garza', 'scramble_alert_1', 'scramble_alert_2', 'runway', 'taxi_parallel', 'access_road', 'patrol', 'walk']) {
    assert.ok(lines.some((line) => line.id === id), `no keep-clear line ${id}`);
  }
  // The taxi line is the mission's: the stand, the parallel taxiway, the east link, the runway.
  const manta = lines.find((line) => line.id === 'taxi_stand_manta');
  assert.ok(manta.half >= 23, 'the Manta Sombra spans 46 m');
  assert.deepEqual(manta.line[2], BASE.taxiways.find((way) => way.id === 'taxi_link_east').line[0]);
  for (const prop of dressing.props) {
    // The chocks of the static Halcón lie under them, nowhere near a line; everything else keeps
    // its whole footprint clear when it is solid, its centre when it can be walked over.
    const reach = prop.collide ? radiusOf(prop) : 0;
    for (const line of lines) {
      const clear = clearanceTo(line, prop.e, prop.n);
      assert.ok(clear >= reach - 1e-6, `${prop.node} at ${prop.e.toFixed(1)}, ${prop.n.toFixed(1)} is ${clear.toFixed(2)} m from ${line.id}`);
    }
  }
  for (const item of [...dressing.watchtowers, ...dressing.nets]) {
    const size = PERIMETER_SIZES[item.id.startsWith('watch') ? 'base_watchtower' : 'base_camo_net'];
    for (const line of lines) assert.ok(clearanceTo(line, item.at[0], item.at[1]) >= Math.hypot(size.width, size.depth) / 2, `${item.id} near ${line.id}`);
  }
  // The floodlight masts stand clear of every way too (the north row used to stand in the Manta's wing).
  for (const [e, n] of BASE.floodlights) {
    for (const line of lines.filter((each) => each.id.startsWith('taxi_stand') || each.id.startsWith('scramble') || each.id === 'patrol')) {
      assert.ok(clearanceTo(line, e, n) >= 1, `mast at ${e}, ${n} stands in ${line.id}`);
    }
  }
});

test('the walk kept clear is the mission\'s marked way', () => {
  const walk = airBaseKeepClear().find((line) => line.id === 'walk');
  assert.equal(walk.line.length, WAY_TO_HANGAR_TWO.length);
  walk.line.forEach(([e, n], index) => {
    const at = puntaGarzaToWorld(e, n);
    assert.ok(Math.hypot(at.x - WAY_TO_HANGAR_TWO[index].x, at.z - WAY_TO_HANGAR_TWO[index].z) < 2, `point ${index}`);
  });
});

test('everything stands on the pad, inside the wire, off the parked aircraft, the buildings, the posts and each other', () => {
  const solid = dressing.props.filter((prop) => prop.collide);
  for (const prop of dressing.props) {
    assert.ok(isOnAirBasePad(prop.x, prop.z), `${prop.node} is off the pad`);
    for (const post of BASE.posts) assert.ok(!near(prop, post.at[0], post.at[1], 1.5 + (prop.collide ? radiusOf(prop) * 0.5 : 0)), `${prop.node} stands on ${post.id}`);
    for (const [e, n] of BASE.floodlights) assert.ok(!near(prop, e, n, 2 + radiusOf(prop)), `${prop.node} at a mast`);
    assert.ok(!insideRect(prop.e, prop.n, BASE.controlTower.at[0] - 8, BASE.controlTower.at[0] + 8, BASE.controlTower.at[1] - 8, BASE.controlTower.at[1] + 8), `${prop.node} in the tower`);
    // Not in a shelter's side or back wall (inside the shelter, and on its apron lip, is fine).
    for (const shelter of BASE.shelters) {
      const [e, n] = shelter.at;
      const inWalls = insideRect(prop.e, prop.n, e - 31, e + 31, n - 22, n + 20) && !insideRect(prop.e, prop.n, e - 25, e + 25, n - 19, n + 21);
      assert.ok(!inWalls, `${prop.node} in the wall of ${shelter.id}`);
    }
    if (prop.node === 'gse_chocks') continue;
    // Clear of the airframes: outside the wing box and the fuselage box of every parked Halcón...
    for (const fighter of BASE.parkedFighters) {
      const r = Math.abs(prop.e - fighter.at[0]);
      const a = prop.n - fighter.at[1];
      const reach = prop.collide ? Math.max(GROUND_KIT_ITEMS[prop.node].width, GROUND_KIT_ITEMS[prop.node].length) / 2 : 0.3;
      const inWing = r < PARKED_FIGHTER_SIZE.span / 2 + reach && a > -3 - reach && a < 1.8 + reach;
      const inHull = r < 0.85 + reach && a > -PARKED_FIGHTER_SIZE.tailBehind - reach && a < PARKED_FIGHTER_SIZE.noseAhead + reach;
      assert.ok(!inWing && !inHull, `${prop.node} at ${prop.e.toFixed(1)}, ${prop.n.toFixed(1)} is in ${fighter.id}`);
    }
    // ... and of the stand boxes of the aircraft that taxi (12 m either side, 14 m behind to 20 m ahead).
    for (const stand of BASE.stands) {
      const half = stand.model === 'manta_sombra' ? 24 : stand.model === 'garza_negra' ? 9 : 6;
      assert.ok(!insideRect(prop.e, prop.n, stand.at[0] - half, stand.at[0] + half, stand.at[1] - 14, stand.at[1] + 20), `${prop.node} on ${stand.id}`);
    }
  }
  for (let i = 0; i < solid.length; i += 1) {
    for (let j = i + 1; j < solid.length; j += 1) {
      const a = solid[i], b = solid[j];
      const least = (Math.min(GROUND_KIT_ITEMS[a.node].width, GROUND_KIT_ITEMS[a.node].length) + Math.min(GROUND_KIT_ITEMS[b.node].width, GROUND_KIT_ITEMS[b.node].length)) / 2;
      assert.ok(Math.hypot(a.e - b.e, a.n - b.n) >= least, `${a.node} and ${b.node} overlap at ${a.e.toFixed(1)}, ${a.n.toFixed(1)}`);
    }
  }
  // The pictures' standing points are free ground on the apron.
  for (const spot of Object.values(layout.photoSpots)) {
    assert.ok(isOnAirBasePad(spot.x, spot.z));
    for (const prop of dressing.props) assert.ok(Math.hypot(prop.x - spot.x, prop.z - spot.z) > 1.5 + (prop.collide ? radiusOf(prop) : 0));
    for (const fighter of layout.parkedAircraft) assert.ok(Math.hypot(fighter.x - spot.x, fighter.z - spot.z) > 10);
  }
});

test('four to six watchtowers at the corners and the gate, three or four nets on their hardstands', () => {
  assert.ok(dressing.watchtowers.length >= 4 && dressing.watchtowers.length <= 6);
  assert.ok(dressing.watchtowers.some((tower) => Math.hypot(tower.at[0] - BASE.gate.at[0], tower.at[1] - BASE.gate.at[1]) < 30), 'none by the gate');
  const corners = BASE.fence.filter(Boolean);
  for (const tower of dressing.watchtowers) {
    assert.ok(isOnAirBasePad(tower.x, tower.z), `${tower.id} is off the pad`);
    const toCorner = Math.min(...corners.map(([e, n]) => Math.hypot(tower.at[0] - e, tower.at[1] - n)));
    const byGate = Math.hypot(tower.at[0] - BASE.gate.at[0], tower.at[1] - BASE.gate.at[1]) < 30;
    assert.ok(toCorner < 80 || byGate, `${tower.id} is ${toCorner.toFixed(0)} m from a corner of the fence`);
    assert.ok(toCorner > 4, `${tower.id} stands in the wire`);
    for (const other of dressing.watchtowers) if (other !== tower) assert.ok(Math.hypot(tower.at[0] - other.at[0], tower.at[1] - other.at[1]) > 120);
  }
  assert.ok(dressing.nets.length >= 3 && dressing.nets.length <= 4);
  assert.equal(dressing.hardstands.length, dressing.nets.length);
  // One net is the equipment park on the apron itself (on its concrete), in the apron picture's view.
  const park = dressing.nets.filter((net) => net.onApron);
  assert.equal(park.length, 1);
  assert.ok(insideRect(park[0].at[0], park[0].at[1], BASE.apron.west + 12, BASE.apron.east - 9, BASE.apron.south + 12, apronNorth - 12));
  const spot = layout.photoSpots.apron;
  const bearing = Math.atan2(park[0].x - spot.x, -(park[0].z - spot.z));
  const off = Math.abs(((bearing - spot.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  assert.ok(off < 0.45, `the apron net is ${(off * 57.3).toFixed(0)} degrees off the apron picture's axis`);
  dressing.nets.forEach((net, index) => {
    assert.ok(isOnAirBasePad(net.x, net.z));
    const stand = dressing.hardstands[index];
    // The net (24 m along its own X) is turned east or west: its long side runs north-south over the hardstand.
    assert.ok(stand.north - stand.south >= PERIMETER_SIZES.base_camo_net.width && stand.east - stand.west >= PERIMETER_SIZES.base_camo_net.depth);
    assert.ok(insideRect(net.at[0], net.at[1], stand.west, stand.east, stand.south, stand.north, -8));
    assert.ok(dressing.props.filter((prop) => insideRect(prop.e, prop.n, stand.west, stand.east, stand.south, stand.north)).length >= 8, `${net.id} is empty`);
    for (const other of dressing.hardstands) if (other !== stand) assert.ok(stand.north <= other.south || stand.south >= other.north || stand.east <= other.west || stand.west >= other.east);
    for (const corner of stand.corners) assert.ok(isOnAirBasePad(corner.x, corner.z));
  });
});

test('the wear is where aircraft make it: rubber in both touchdown zones, soot behind the nozzles, cracks on the paving', () => {
  const [fromE, runwayN] = BASE.runway.from;
  const toE = BASE.runway.to[0];
  const half = BASE.runway.width / 2;
  const rubber = dressing.decals.filter((decal) => decal.kind === 'decal_tyre_rubber');
  const onRunway = rubber.filter((decal) => insideRect(decal.e, decal.n, toE, fromE, runwayN - half, runwayN + half));
  assert.ok(rubber.length - onRunway.length <= 3, 'rubber off the runway (the three turn-offs excepted)');
  for (const decal of onRunway) assert.ok(Math.abs(decal.n - runwayN) + decal.width / 2 < half, 'a streak hangs over the edge');
  const zone = (start, direction) => onRunway.filter((decal) => (decal.e - start) * direction > 40 && (decal.e - start) * direction < 380).length;
  assert.ok(zone(fromE, -1) >= 20 && zone(toE, 1) >= 20, 'both touchdown zones carry rubber');
  assert.ok(onRunway.filter((decal) => Math.abs(decal.n - runwayN) < 2.5 && decal.e < fromE - 400 && decal.e > toE + 400).length >= 3, 'the centre line carries rubber');
  for (const decal of dressing.decals) assert.ok(decal.alpha > 0.1 && decal.alpha <= 1 && decal.width >= 1 && decal.length >= 1);
  // Soot lies behind (city south of) every aircraft on the apron.
  const jets = [...BASE.stands.map((stand) => stand.at), ...BASE.parkedFighters.filter((fighter) => fighter.place === 'apron').map((fighter) => fighter.at)];
  const scorch = dressing.decals.filter((decal) => decal.kind === 'decal_scorch');
  for (const [e, n] of jets) assert.ok(scorch.some((decal) => Math.abs(decal.e - e) < 6 && decal.n < n - 8 && decal.n > n - 26), `no soot behind ${e}, ${n}`);
  // Cracks: on the apron, the runway, the taxiways and the road, at least a hundred.
  const cracks = dressing.decals.filter((decal) => decal.kind === 'decal_crack');
  assert.ok(cracks.length >= 100);
  const paved = (e, n) => insideRect(e, n, BASE.apron.west, BASE.apron.east, BASE.apron.south, apronNorth)
    || insideRect(e, n, toE, fromE, runwayN - half, runwayN + half)
    || BASE.taxiways.some((way) => clearanceTo({ half: way.width / 2, line: way.line, closed: false }, e, n) <= 0)
    || clearanceTo({ half: BASE.accessRoad.width / 2, line: BASE.accessRoad.line, closed: false }, e, n) <= 0;
  for (const decal of cracks) assert.ok(paved(decal.e, decal.n), `a crack on the grass at ${decal.e.toFixed(0)}, ${decal.n.toFixed(0)}`);
  assert.ok(cracks.filter((decal) => insideRect(decal.e, decal.n, BASE.apron.west, BASE.apron.east, BASE.apron.south, apronNorth)).length >= 40);
});

test('the dirt track is the jeep\'s lap', () => {
  assert.equal(dressing.dirtTrack.length, BASE.patrolRoute.length);
  dressing.dirtTrack.forEach((segment, index) => {
    const a = puntaGarzaToWorld(...BASE.patrolRoute[index]);
    const b = puntaGarzaToWorld(...BASE.patrolRoute[(index + 1) % BASE.patrolRoute.length]);
    assert.ok(Math.hypot(segment.a.x - a.x, segment.a.z - a.z) < 1e-6 && Math.hypot(segment.b.x - b.x, segment.b.z - b.z) < 1e-6);
    assert.ok(segment.width >= 3 && segment.width <= 5);
  });
});

test('grass and scrub: thousands of uneven clumps on the soil only, the tall growth along the wire', () => {
  const { grass, scrub } = dressing.vegetation;
  assert.ok(grass.length >= 3000 && grass.length <= 7000, `${grass.length} clumps`);
  assert.ok(scrub.length >= 120 && scrub.length <= 400, `${scrub.length} bushes`);
  const [fromE, runwayN] = BASE.runway.from;
  const toE = BASE.runway.to[0];
  const half = BASE.runway.width / 2;
  const patrol = airBaseKeepClear().find((line) => line.id === 'patrol');
  for (const plant of [...grass, ...scrub]) {
    assert.ok(isOnAirBasePad(plant.x, plant.z));
    assert.ok(!insideRect(plant.e, plant.n, BASE.apron.west, BASE.apron.east, BASE.apron.south, apronNorth), 'grass on the apron');
    assert.ok(!insideRect(plant.e, plant.n, toE, fromE, runwayN - half, runwayN + half), 'grass on the runway');
    for (const way of BASE.taxiways) assert.ok(clearanceTo({ half: way.width / 2, line: way.line, closed: false }, plant.e, plant.n) > 0, 'grass on a taxiway');
    assert.ok(clearanceTo({ half: BASE.accessRoad.width / 2, line: [BASE.accessRoad.line[1], BASE.accessRoad.line[2]], closed: false }, plant.e, plant.n) > 0, 'grass on the road');
    assert.ok(clearanceTo({ half: 2, line: patrol.line, closed: true }, plant.e, plant.n) > 0, 'grass on the track');
    for (const stand of dressing.hardstands) assert.ok(!insideRect(plant.e, plant.n, stand.west, stand.east, stand.south, stand.north), 'grass on a hardstand');
    assert.ok(plant.scale > 0.4 && plant.scale < 3);
  }
  for (const bush of scrub) assert.ok(clearanceTo({ half: 3, line: patrol.line, closed: true }, bush.e, bush.n) > 0, 'a bush in the jeep\'s way');
  // Uneven: several sizes, and the tall clumps stand along the fence.
  const fenceRuns = [];
  let previous = null;
  for (const point of BASE.fence) {
    if (previous && point) fenceRuns.push([previous, point]);
    previous = point;
  }
  const toFence = (plant) => Math.min(...fenceRuns.map(([a, b]) => clearanceTo({ half: 0, line: [a, b], closed: false }, plant.e, plant.n)));
  const tall = grass.filter((plant) => plant.variant === 'variant_c' && plant.scale > 2.15);
  assert.ok(tall.length >= 150);
  assert.ok(tall.filter((plant) => toFence(plant) < 4.5).length >= tall.length * 0.8, 'the tall grass is not along the wire');
  assert.ok(scrub.filter((bush) => toFence(bush) < 6).length >= scrub.length * 0.5, 'the scrub is not along the wire');
  assert.ok(new Set(grass.map((plant) => plant.variant)).size >= 3);
  // The causeway and the land block both carry grass.
  assert.ok(grass.some((plant) => plant.e < -1800) && grass.some((plant) => plant.e > -1300 && plant.n < 1000));
});

test('the field\'s outline is the pad, six metres wider (the fence stands on it)', () => {
  assert.equal(layout.field.length, BASE.pad.length);
  for (const point of BASE.fence.filter(Boolean)) {
    const at = puntaGarzaToWorld(point[0], point[1]);
    let inside = false;
    const ring = layout.field;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      if (ring[i].z > at.z !== ring[j].z > at.z && at.x < ((ring[j].x - ring[i].x) * (at.z - ring[i].z)) / (ring[j].z - ring[i].z) + ring[i].x) inside = !inside;
    }
    assert.ok(inside, `the fence corner ${point} is off the field`);
  }
});

test('the registry names what the military and naval files really hold', () => {
  for (const [id, entry] of Object.entries({ ...MILITARY_BASE_ASSETS, ...NAVAL_AND_ISLAND_ASSETS })) {
    const file = `game/assets/${entry.file}`;
    assert.ok(existsSync(file), `${id}: ${file} is not built (a registered model is loaded at boot)`);
    const gltf = readGlb(file);
    const nodes = new Set(gltf.nodes.map((node) => node.name));
    const materials = new Set((gltf.materials ?? []).map((material) => material.name));
    for (const name of [...(entry.nodes ?? []), ...(entry.anchors ?? []), ...(entry.colliders ?? [])]) assert.ok(nodes.has(name), `${id} has no node ${name}`);
    for (const name of entry.materials ?? []) assert.ok(materials.has(name), `${id} has no material ${name}`);
    const limit = entry.maxBytes ?? { vehicle: 1000000, building: 1500000, prop: 220000 }[entry.kind];
    assert.ok(statSync(file).size <= limit, `${id}: ${statSync(file).size} bytes over ${limit}`);
  }
  // The ground library: four tiles of 4 m and six decals, each a material of its own.
  const ground = readGlb('game/assets/military/base_ground.glb');
  assert.equal(ground.scenes[0].extras.tile_metres, 4);
  for (const material of ground.materials) {
    if (material.name.startsWith('decal_')) assert.equal(material.alphaMode, 'BLEND', material.name);
    else assert.ok(material.pbrMetallicRoughness.baseColorTexture && material.normalTexture, `${material.name} lacks its maps`);
  }
  // The equipment kit, once it is registered: every item the plan places is a node of the file.
  if (MILITARY_BASE_ASSETS.base_ground_kit) {
    const kit = readGlb(`game/assets/${MILITARY_BASE_ASSETS.base_ground_kit.file}`);
    const names = new Set(kit.nodes.map((node) => node.name));
    for (const node of Object.keys(GROUND_KIT_ITEMS)) assert.ok(names.has(node), `the kit has no ${node}`);
    for (const node of new Set(dressing.props.map((prop) => prop.node))) assert.ok(MILITARY_BASE_ASSETS.base_ground_kit.nodes.includes(node));
  }
});
