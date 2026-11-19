// Shift 14 (getting in took over 5.5 s, a pedestrian could block the door, boats were not boarded
// from the quay): the way to a door is planned round the car's footprint every step, a car nobody
// drives is got into by the passenger door from the pavement side, a lead stopped short of the
// door gets in from there instead of standing beside the car, a moored boat is reached by its swim
// platform and left onto the quay (never into the water), and the crowd steps out of the doorway.
import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { DOORWAY_SPACE, LEAD_SPACE, doorwayExit, stepOutOfDoorway } from '../../../game/src/pedestrians/personalSpace.js';

register('./vendoredThreeHook.mjs', import.meta.url);
const THREE = await import('three');
const { wayRoundCar } = await import('../../../game/src/player/carDoorAndSeat.js');
const { createVehicleEntry, BOARDING, boardingPace } = await import('../../../game/src/player/vehicleEntry.js');
const { createOnFootMovement } = await import('../../../game/src/player/onFootMovement.js');

const DOOR = new THREE.Vector3(-1.45, 0, -0.3);
const PASSENGER_DOOR = new THREE.Vector3(1.45, 0, -0.3);

function fakeCar(id, { passengerDoor = false, boat = false, x = 0, z = 0 } = {}) {
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.updateMatrixWorld(true);
  const anchors = boat ? {
    anchor_board: { position: new THREE.Vector3(0.9, 0.24, 4.6), direction: new THREE.Vector3(0, 0, -1) },
    anchor_seat_driver: { position: new THREE.Vector3(0.6, 0.84, 0.36), direction: new THREE.Vector3(0, 0, -1) },
  } : {
    anchor_door_driver: { position: DOOR.clone(), direction: new THREE.Vector3(1, 0, 0) },
    anchor_seat_driver: { position: new THREE.Vector3(-0.38, 0.5, 0.05), direction: new THREE.Vector3(0, 0, -1) },
  };
  if (passengerDoor) anchors.anchor_door_passenger = { position: PASSENGER_DOOR.clone(), direction: new THREE.Vector3(-1, 0, 0) };
  const bounds = boat ? new THREE.Box3(new THREE.Vector3(-1.2, -0.5, -4.4), new THREE.Vector3(1.2, 1.4, 4.4))
    : new THREE.Box3(new THREE.Vector3(-0.93, 0, -2.31), new THREE.Vector3(0.93, 1.45, 2.41));
  const entity = {
    id, kind: 'vehicle', owner: 'vehicles', alive: true, position: root.position, heading: 0, radius: boat ? 4.6 : 2.4,
    tags: new Set(boat ? ['boat', 'parked'] : ['parked']), data: { modelId: boat ? 'speedboat' : 'family_sedan', driverId: null, speed: 0, health: 100 },
  };
  return { entity, record: { rig: { root, near: null, steeringWheel: null, asset: { anchors, extras: {}, bounds } } } };
}

function fakeWorld(cars, shore = () => -10) {
  const doors = [];
  const controls = { throttle: 0, brake: 0, steer: 0, handbrake: 0, horn: false };
  const prompts = [];
  const fleet = {
    get: (id) => cars.find((c) => c.entity.id === id)?.record ?? null,
    nearestEnterable: (x, z, reach) => cars.map((c) => c.entity).find((e) => Math.hypot(e.position.x - x, e.position.z - z) <= reach) ?? null,
    enter: (id, occupantId) => { cars.find((c) => c.entity.id === id).entity.data.driverId = occupantId; return true; },
    exit: (id) => { cars.find((c) => c.entity.id === id).entity.data.driverId = null; return true; },
    controlsOf: () => controls,
    setDoorOpen: (id, side, amount) => doors.push([id, side, amount]),
  };
  const context = {
    systems: { find: (name) => (name === 'vehicles' ? fleet : name === 'openWorldCity' ? { plan: { shoreDistanceAt: shore } } : null) },
    entities: {
      get: (id) => cars.find((c) => c.entity.id === id)?.entity ?? null,
      nearest: (x, z, reach, filter) => cars.map((c) => c.entity).find((e) => (!filter.tag || e.tags.has(filter.tag))
        && Math.hypot(e.position.x - x, e.position.z - z) <= reach && (!filter.accept || filter.accept(e))) ?? null,
      addTag() {}, removeTag() {},
    },
    events: { emit: (type, payload) => { if (payload && 'text' in payload) prompts.push(payload.text); } },
    controls: { setPlayContext() {} },
  };
  return { context, doors, controls, prompts };
}

function fakeFigure() {
  const transit = { kind: null, stage: null, door: 0, x: 0, z: 0 };
  const calls = [];
  const walker = {
    transit, state: { yaw: 0 },
    enterVehicle(where) { calls.push(['enter', where]); Object.assign(transit, { kind: where.jack ? 'jack' : 'enter', stage: 'turn' }); },
    exitVehicle(where) { calls.push(['exit', where]); Object.assign(transit, { kind: 'exit', stage: 'open' }); },
    sit() {},
  };
  return { walker, calls, instance: new THREE.Object3D(), transit() {}, seat() {}, reset() {}, setVisible(v) { this.instance.visible = v; } };
}

const noKeys = { x: 0, z: 0, jump: false };
const at = (node) => new THREE.Vector3().setFromMatrixPosition((node.updateWorldMatrix(), node.matrixWorld));

/** Walks the approach with the capsule following its wish; `block` may hold the feet back. */
function walk(seat, movement, seconds, block = null) {
  let t = 0;
  for (; t < seconds && seat.phase === 'approach'; t += 1 / 60) {
    seat.boardStep(noKeys, 1 / 60);
    const s = movement.state, px = s.x, pz = s.z;
    movement.follow(s.wantX, s.wantZ, 0, Math.hypot(s.wantX, s.wantZ));
    if (block && block(s)) { s.x = px; s.z = pz; s.previousX = px; s.previousZ = pz; }
  }
  return t;
}

test('the way to a door goes round the footprint, never through it, and straight when nothing is in the way', () => {
  const out = { x: 0, z: 0 };
  const hw = 1.35, hl = 2.8;
  assert.equal(wayRoundCar(out, -3, -0.3, -1.45, -0.3, hw, hl), 1.55, 'straight from the driver side');
  assert.deepEqual([out.x, out.z], [-1.45, -0.3]);
  // From the passenger side: a corner of the nearer end, on the lead's own side first.
  const length = wayRoundCar(out, 1.8, -1.5, -1.45, -0.3, hw, hl);
  assert.ok(out.x > hw && out.z < -hl, `first the front-right corner (${out.x}, ${out.z})`);
  assert.ok(length > 6 && length < 10, `about the way round the nose (${length})`);
  assert.ok(wayRoundCar(out, 1.8, 2.5, -1.45, -0.3, hw, hl) > 0 && out.z > hl, 'from the tail end: round the tail');
  // Pressed against the side inside the margin band: still a corner, not into the body.
  wayRoundCar(out, 1.2, 0, -1.45, -0.3, hw, hl);
  assert.ok(Math.abs(out.x) > hw && Math.abs(out.z) > hl, 'a corner from inside the band');
});

test('from the passenger side the lead gets in by the passenger door and slides across (a car nobody drives)', () => {
  const car = fakeCar(21, { passengerDoor: true });
  const { context, doors } = fakeWorld([car]);
  const movement = createOnFootMovement({ groundHeightAt: () => 0 });
  movement.placeAt(2.4, 0.4, 0, 0);
  const figure = fakeFigure();
  const seat = createVehicleEntry(context, { entity: { id: 1, data: {} }, movement, figure });
  assert.equal(seat.tryEnter(), true);
  const t = walk(seat, movement, 6);
  assert.equal(seat.phase, 'enter');
  assert.ok(t < 1, `at the passenger door after ${t.toFixed(2)} s`);
  const where = figure.calls[0][1];
  assert.ok(at(where.door).x > 1, 'the transit starts at the passenger door');
  assert.ok(at(where.seat).x < 0, 'and ends in the driver\'s seat');
  Object.assign(figure.walker.transit, { stage: 'open', door: 0.7 });
  seat.frame(1 / 60);
  assert.deepEqual(doors.at(-1), [21, 'passenger', 0.7], 'the passenger door swings');
  Object.assign(figure.walker.transit, { stage: 'close', door: 0.2 });
  seat.frame(1 / 60);
  Object.assign(figure.walker.transit, { kind: null, stage: null, door: 0 });
  seat.frame(1 / 60);
  assert.equal(seat.phase, 'seated');
  car.entity.data.speed = 0;
  seat.drive({ pressed: (a) => a === 'exitVehicle', held: () => false, axis: () => 0 }, 1 / 60);
  seat.drive({ pressed: () => false, held: () => false, axis: () => 0 }, 1 / 60);
  assert.equal(seat.phase, 'exit');
  assert.ok(at(figure.calls[1][1].door).x < -1, 'out by the driver\'s door');
});

test('a carjack, or the driver\'s side, keeps the driver\'s door', () => {
  const car = fakeCar(22, { passengerDoor: true });
  const { context } = fakeWorld([car]);
  const movement = createOnFootMovement({ groundHeightAt: () => 0 });
  movement.placeAt(-2.6, 1.2, 0, 0);
  const figure = fakeFigure();
  const seat = createVehicleEntry(context, { entity: { id: 1, data: {} }, movement, figure });
  assert.equal(seat.tryEnter(), true);
  walk(seat, movement, 6);
  assert.ok(at(figure.calls[0][1].door).x < -1);

  const jacked = fakeCar(23, { passengerDoor: true });
  jacked.entity.tags.delete('parked'); // traffic's car: a carjack
  const world = fakeWorld([jacked]);
  const legs = createOnFootMovement({ groundHeightAt: () => 0 });
  legs.placeAt(2.4, 0.4, 0, 0);
  const lead = fakeFigure();
  const jack = createVehicleEntry(world.context, { entity: { id: 2, data: {} }, movement: legs, figure: lead });
  assert.equal(jack.tryEnter(), true);
  walk(jack, legs, 8);
  assert.equal(jack.phase, 'enter');
  assert.ok(at(lead.calls[0][1].door).x < -1, 'round to the driver\'s door to haul him out');
});

test('someone who will not step aside at the driver\'s door (seated, fighting, a mission\'s person): the other door', () => {
  for (const data of [{ mode: 'sit' }, { mode: 'chat', missionGiver: true }]) {
    const car = fakeCar(26, { passengerDoor: true });
    const { context } = fakeWorld([car]);
    const person = { kind: 'character', tags: new Set(['pedestrian']), position: { x: DOOR.x, z: DOOR.z }, data };
    context.entities.within = (x, z, radius, filter, out) => {
      if (Math.hypot(person.position.x - x, person.position.z - z) <= radius && person.tags.has(filter.tag)) out.push(person);
      return out;
    };
    const movement = createOnFootMovement({ groundHeightAt: () => 0 });
    movement.placeAt(-3.4, -0.3, 0, 0); // 2 m out from the driver's door
    const figure = fakeFigure();
    const seat = createVehicleEntry(context, { entity: { id: 1, data: {} }, movement, figure });
    assert.equal(seat.tryEnter(), true);
    walk(seat, movement, 8);
    assert.equal(seat.phase, 'enter');
    assert.ok(at(figure.calls[0][1].door).x > 1, `round to the passenger door past a ${data.mode} person`);
  }
  // A passer-by (walking, chatting) is not a blocker: they step aside, the driver's door is kept.
  const car = fakeCar(27, { passengerDoor: true });
  const { context } = fakeWorld([car]);
  context.entities.within = (x, z, radius, filter, out) => {
    out.push({ kind: 'character', tags: new Set(['pedestrian']), position: { x: DOOR.x, z: DOOR.z }, data: { mode: 'chat' } });
    return out;
  };
  const movement = createOnFootMovement({ groundHeightAt: () => 0 });
  movement.placeAt(-3.4, -0.3, 0, 0);
  const figure = fakeFigure();
  const seat = createVehicleEntry(context, { entity: { id: 1, data: {} }, movement, figure });
  assert.equal(seat.tryEnter(), true);
  walk(seat, movement, 8);
  assert.ok(at(figure.calls[0][1].door).x < -1);
});

test('stopped short of the door by something in the way, the lead gets in from there (never left standing)', () => {
  const car = fakeCar(24);
  const { context } = fakeWorld([car]);
  const movement = createOnFootMovement({ groundHeightAt: () => 0 });
  movement.placeAt(-4.3, -0.3, 0, 0);
  const figure = fakeFigure();
  const seat = createVehicleEntry(context, { entity: { id: 1, data: {} }, movement, figure });
  assert.equal(seat.tryEnter(), true);
  // A wall of bins 1.8 m out from the door: no sidestep gets past it.
  const t = walk(seat, movement, 8, (s) => s.x > DOOR.x - 1.8);
  assert.equal(seat.phase, 'enter', `getting in after ${t.toFixed(2)} s`);
  assert.ok(t < 2.5, `not the walk's time limit (${t.toFixed(2)} s)`);
  assert.ok(seat.phase === 'enter' && BOARDING.reachAnyway >= 1.8);
});

test('the rear passenger corner (shift 14 probe: pressed against the side for 4 s) walks round to the door', () => {
  const car = fakeCar(25);
  const { context } = fakeWorld([car]);
  const movement = createOnFootMovement({ groundHeightAt: () => 0 });
  movement.placeAt(1.62, 2.81, 0, 0);
  const seat = createVehicleEntry(context, { entity: { id: 1, data: {} }, movement, figure: fakeFigure() });
  assert.equal(seat.tryEnter(), true);
  let inside = false;
  const t = walk(seat, movement, 8, (s) => {
    const into = Math.abs(s.x) < 0.93 + 0.3 && Math.abs(s.z) < 2.41 + 0.3;
    inside = inside || into;
    return into; // the body stops the capsule
  });
  assert.equal(seat.phase, 'enter');
  assert.ok(!inside, 'never pressed into the body');
  assert.ok(t < 3.2, `round the tail and in after ${t.toFixed(2)} s`);
});

test('a moored boat is boarded from the quay by its swim platform and left onto the quay, never into the water', () => {
  const boat = fakeCar(30, { boat: true });
  const quay = (x, z) => z - 7.5; // land from z 7.5 on (the stern's platform is at z 4.6)
  const { context, prompts } = fakeWorld([boat], quay);
  const movement = createOnFootMovement({ groundHeightAt: () => 0 });
  movement.placeAt(0.9, 8.6, 0, 0); // on the quay, 4 m behind the platform, 8.6 m from the middle
  const figure = fakeFigure();
  const seat = createVehicleEntry(context, { entity: { id: 1, data: {} }, movement, figure });
  assert.equal(seat.tryEnter(), true, 'found by its platform');
  walk(seat, movement, 4);
  assert.equal(seat.phase, 'enter');
  assert.ok(movement.state.z > 6.9, `stepped aboard from the quay's edge (z ${movement.state.z.toFixed(2)})`);
  assert.ok(boardingPace('enter', 'step_in', 0, true) < 1, 'walks forward to the helm');
  Object.assign(figure.walker.transit, { kind: null, stage: null, door: 0 });
  seat.frame(1 / 60);
  assert.equal(seat.phase, 'seated');
  seat.drive({ pressed: (a) => a === 'exitVehicle', held: () => false, axis: () => 0 }, 1 / 60);
  seat.drive({ pressed: () => false, held: () => false, axis: () => 0 }, 1 / 60);
  assert.equal(seat.phase, 'exit');
  const door = at(figure.calls[1][1].door);
  assert.ok(quay(door.x, door.z) > 0.6, `out onto the quay (${door.x.toFixed(2)}, ${door.z.toFixed(2)})`);

  // Out at sea: F keeps the lead at the helm and says why.
  const far = fakeCar(31, { boat: true });
  const sea = fakeWorld([far], () => -40);
  const legs = createOnFootMovement({ groundHeightAt: () => 0 });
  legs.placeAt(0.9, 6.5, 0, 0);
  const lead = fakeFigure();
  const helm = createVehicleEntry(sea.context, { entity: { id: 2, data: {} }, movement: legs, figure: lead });
  assert.equal(helm.enter(31), true);
  helm.drive({ pressed: (a) => a === 'exitVehicle', held: () => false, axis: () => 0 }, 1 / 60);
  helm.drive({ pressed: () => false, held: () => false, axis: () => 0 }, 1 / 60);
  assert.equal(helm.phase, 'seated', 'not dropped into the water');
  assert.ok(helm.vehicle);
  assert.ok(sea.prompts.some((text) => /quay|beach/.test(text || '')));
  assert.equal(lead.calls.length, 0);
  assert.ok(prompts.length >= 0);
});

test('out of the car the capsule stands at the height the transit posed the feet at, not the pavement beside the kerb', () => {
  const car = fakeCar(40);
  const { context } = fakeWorld([car]);
  const movement = createOnFootMovement({ groundHeightAt: () => 3.2 }); // the kerb's pavement, read near the door
  movement.placeAt(-3, -0.3, 0, 3.055);
  const figure = fakeFigure();
  const seat = createVehicleEntry(context, { entity: { id: 1, data: {} }, movement, figure });
  assert.equal(seat.enter(40), true);
  seat.drive({ pressed: (a) => a === 'exitVehicle', held: () => false, axis: () => 0 }, 1 / 60);
  seat.drive({ pressed: () => false, held: () => false, axis: () => 0 }, 1 / 60);
  assert.equal(seat.phase, 'exit');
  Object.assign(figure.walker.transit, { kind: null, stage: null, door: 0, x: -1.8, y: 3.055, z: -0.6 });
  seat.frame(1 / 60);
  assert.equal(seat.phase, null);
  assert.equal(movement.state.y, 3.055, 'no pop up onto the pavement level');
  // Bailing out (leaveNow): the door anchor's own height while the car stands upright.
  car.record.rig.root.position.y = 3.055;
  car.record.rig.root.updateMatrixWorld(true);
  assert.equal(seat.enter(40), true);
  seat.exit(true);
  assert.ok(Math.abs(movement.state.y - 3.055) < 1e-9, `bailed out at ${movement.state.y}`);
});

test('the crowd steps out of the doorway along the car, never into it', () => {
  const door = { x: -1.45, z: -0.3, ox: -1, oz: 0 }; // driver's door of a car facing -Z: out is -X
  const way = { x: 0, z: 0 };
  for (const [px, pz] of [[-1.45, -0.3], [-1.2, 0.2], [-1.9, -0.9], [-1.0, -0.3]]) {
    doorwayExit(px, pz, door, way);
    assert.ok(way.x * door.ox + way.z * door.oz > 0, `out of the car, not into it, from (${px}, ${pz})`);
    assert.ok(Math.abs(Math.hypot(way.x, way.z) - 1) < 1e-9);
  }
  const p = { x: -1.45, z: -0.3 };
  for (let i = 0; i < 120; i += 1) stepOutOfDoorway(p, door, 1 / 60);
  assert.ok(Math.hypot(p.x - door.x, p.z - door.z) >= Math.min(LEAD_SPACE, 2.3), 'clear of the door in a second or so');
  assert.ok(p.x < -1.2, 'still outside the car');
  const passer = { x: -6, z: 3 };
  assert.equal(stepOutOfDoorway(passer, door, 1 / 60), false, 'nobody further off is moved');
  assert.ok(DOORWAY_SPACE <= LEAD_SPACE);
});
