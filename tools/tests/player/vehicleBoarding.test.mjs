// The lead's way into and out of a car, on a fake fleet and a fake figure whose run-time transit
// is advanced by hand: the door and seat anchors land where the car's model puts them, the walk
// to the door, the transit's door reaching the fleet, the player tag moving to the car as the door
// is pulled shut, the stop before getting out and the capsule handed back where the feet are;
// VEHICLE_STOLEN carries the lead as thiefId and a car traffic was driving is a carjack.
import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

register('./vendoredThreeHook.mjs', import.meta.url);
const THREE = await import('three');
const { createCarDoorAndSeat } = await import('../../../game/src/player/carDoorAndSeat.js');
const { createVehicleEntry, driverDoorPoint, isCarjack, BOARDING, boardingPace } = await import('../../../game/src/player/vehicleEntry.js');
const { createOnFootMovement, ON_FOOT_TUNING } = await import('../../../game/src/player/onFootMovement.js');
const { GAME_EVENTS } = await import('../../../game/src/core/events/gameEvents.js');

function fakeCar(id, { x = 10, z = 0, parked = true } = {}) {
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  const steeringWheel = new THREE.Object3D();
  root.add(steeringWheel);
  const anchors = {
    anchor_door_driver: { position: new THREE.Vector3(-1.45, 0, -0.3), direction: new THREE.Vector3(1, 0, 0) },
    anchor_seat_driver: { position: new THREE.Vector3(-0.38, 0.5, 0.05), direction: new THREE.Vector3(0, 0, -1) },
  };
  const entity = {
    id, kind: 'vehicle', alive: true, position: root.position, heading: 0, radius: 2.4,
    tags: new Set(parked ? ['parked'] : []), data: { modelId: 'family_sedan', driverId: null, speed: 0, health: 100 },
  };
  return { entity, record: { rig: { root, near: null, steeringWheel, asset: { anchors, extras: {} } } } };
}

function fakeWorld(cars) {
  const emitted = [], doors = [], tags = new Map();
  const controls = { throttle: 0, brake: 0, steer: 0, handbrake: 0, horn: false };
  const fleet = {
    get: (id) => cars.find((c) => c.entity.id === id)?.record ?? null,
    nearestEnterable: () => cars[0].entity,
    enter: (id, occupantId) => { cars.find((c) => c.entity.id === id).entity.data.driverId = occupantId; return true; },
    exit: (id) => { cars.find((c) => c.entity.id === id).entity.data.driverId = null; return true; },
    controlsOf: () => controls,
    setDoorOpen: (id, side, amount) => doors.push([id, side, amount]),
  };
  const context = {
    systems: { find: (name) => (name === 'vehicles' ? fleet : null) },
    entities: {
      get: (id) => cars.find((c) => c.entity.id === id)?.entity ?? null,
      addTag: (e, tag) => tags.set(tag, e), removeTag: (e, tag) => { if (tags.get(tag) === e) tags.delete(tag); },
    },
    events: { emit: (type, payload) => emitted.push([type, payload]) },
    controls: { setPlayContext: (name) => { context.play = name; } },
    play: 'onFoot',
  };
  return { context, emitted, doors, tags, controls };
}

function fakeFigure() {
  const transit = { kind: null, stage: null, door: 0, x: 0, z: 0 };
  const calls = [];
  const walker = {
    transit, state: { yaw: 0 }, seated: null,
    enterVehicle(where) { calls.push(['enter', where]); Object.assign(transit, { kind: where.jack ? 'jack' : 'enter', stage: 'turn' }); },
    exitVehicle(where) { calls.push(['exit', where]); Object.assign(transit, { kind: 'exit', stage: 'open' }); },
    sit(seat) { walker.seated = seat ? seat.kind : null; },
  };
  return {
    walker, calls, instance: new THREE.Object3D(),
    transit() {}, seat() {}, reset() {}, setVisible(v) { this.instance.visible = v; },
  };
}

const noKeys = { x: 0, z: 0, jump: false };
const input = (exit = false) => ({ pressed: (a) => exit && a === 'exitVehicle', held: () => false, axis: () => 0 });

test('the door and seat anchors follow the car', () => {
  const car = fakeCar(1, { x: 10, z: 5 });
  car.record.rig.root.rotation.y = Math.PI / 2; // nose to -X
  const fleet = { get: () => car.record };
  const points = createCarDoorAndSeat(fleet, car.entity);
  points.seatAnchor.updateWorldMatrix();
  const seat = new THREE.Vector3().setFromMatrixPosition(points.seatAnchor.matrixWorld);
  assert.ok(Math.abs(seat.x - (10 + 0.05)) < 1e-6 && Math.abs(seat.z - (5 + 0.38)) < 1e-6, `seat at ${seat.x}, ${seat.z}`);
  const forward = new THREE.Vector3(0, 0, -1).transformDirection(points.seatAnchor.matrixWorld);
  assert.ok(forward.x < -0.99, 'the seat faces the nose');
  const stand = new THREE.Vector3();
  points.standPoint(stand);
  assert.ok(Math.abs(stand.z - (5 + 1.45)) < 1e-6, 'the door anchor is on the driver side');
  const door = driverDoorPoint({ x: 0, z: 0 }, 0, 2.4);
  assert.ok(door.x < -1 && Math.abs(door.z) < 1e-9, 'a stand-in steps out left of a car facing north');
});

test('the lead walks to the door, gets in through the transit, drives and gets out', () => {
  const car = fakeCar(7, { x: 3, z: 0 });
  const { context, emitted, doors, tags, controls } = fakeWorld([car]);
  const entity = { id: 99, data: {} };
  const movement = createOnFootMovement({ groundHeightAt: () => 0 });
  movement.placeAt(0, 0, 0, 0);
  const figure = fakeFigure();
  const seat = createVehicleEntry(context, { entity, movement, figure });
  assert.equal(seat.tryEnter(), true);
  assert.equal(seat.phase, 'approach');
  for (let i = 0; i < 240 && seat.phase === 'approach'; i += 1) {
    seat.boardStep(noKeys, 1 / 60);
    // In the game the figure's controller feeds its velocity back (follow); here it is the wish.
    const s = movement.state;
    movement.follow(s.wantX, s.wantZ, 0, Math.hypot(s.wantX, s.wantZ));
  }
  assert.equal(seat.phase, 'enter', 'reached the door');
  assert.equal(figure.calls[0][0], 'enter');
  assert.equal(figure.calls[0][1].kind, 'driver');
  assert.equal(seat.jacking, false, 'a parked car is not a carjack');
  const stolen = emitted.find(([type]) => type === GAME_EVENTS.VEHICLE_STOLEN);
  assert.ok(stolen && stolen[1].thiefId === 99 && stolen[1].vehicleId === 7);
  Object.assign(figure.walker.transit, { stage: 'open', door: 0.6 });
  seat.frame(1 / 60);
  assert.deepEqual(doors.at(-1), [7, 'driver', 0.6], 'the door follows the transit');
  assert.equal(seat.vehicle, null);
  Object.assign(figure.walker.transit, { stage: 'close', door: 0.4 });
  seat.frame(1 / 60);
  assert.equal(seat.vehicle, car.entity, 'driving as the door is pulled shut');
  assert.equal(tags.get('player'), car.entity);
  assert.equal(context.play, 'inVehicle');
  Object.assign(figure.walker.transit, { kind: null, stage: null, door: 0 });
  seat.frame(1 / 60);
  assert.equal(seat.phase, 'seated');
  car.entity.data.speed = 6;
  seat.drive(input(true), 1 / 60);
  assert.equal(seat.phase, 'stopping', 'brakes before getting out');
  seat.drive(input(), 1 / 60);
  assert.equal(controls.brake, 1);
  car.entity.data.speed = 0.5;
  seat.drive(input(), 1 / 60);
  assert.equal(seat.phase, 'exit');
  Object.assign(figure.walker.transit, { kind: null, stage: null, door: 0, x: 1.4, z: -0.3 });
  figure.walker.state.yaw = 2;
  seat.frame(1 / 60);
  assert.equal(seat.phase, null);
  assert.equal(seat.vehicle, null);
  assert.equal(tags.get('player'), entity, 'the tag is back on the lead');
  assert.ok(Math.abs(movement.state.x - 1.4) < 1e-9 && Math.abs(movement.state.z + 0.3) < 1e-9, 'the capsule stands where the feet are');
  assert.equal(car.entity.data.driverId, null);
});

test('QA: F from 2.5 m seats the lead in about 3 s (brisk walk, paced get-in), getting out keeps its pace', async () => {
  const { TRANSIT_SEGMENTS } = await import('../../../game/src/characters/motion/vehicleTransit.js');
  const car = fakeCar(8, { x: 0, z: 0 });
  const { context } = fakeWorld([car]);
  const movement = createOnFootMovement({ groundHeightAt: () => 0 });
  movement.placeAt(-1.45 - 2.5, -0.3, 0, 0); // 2.5 m out from the driver's door
  const seat = createVehicleEntry(context, { entity: { id: 3, data: {} }, movement, figure: fakeFigure() });
  assert.equal(seat.tryEnter(), true);
  let walk = 0, top = 0;
  for (let i = 0; i < 400 && seat.phase === 'approach'; i += 1) {
    seat.boardStep(noKeys, 1 / 60);
    const s = movement.state;
    movement.follow(s.wantX, s.wantZ, 0, Math.hypot(s.wantX, s.wantZ));
    top = Math.max(top, Math.hypot(s.wantX, s.wantZ));
    walk += 1 / 60;
  }
  assert.equal(seat.phase, 'enter');
  assert.ok(top <= BOARDING.brisk + 1e-6 && top > ON_FOOT_TUNING.walkSpeed, `a brisk walk, not a run (${top})`);
  const transit = TRANSIT_SEGMENTS.enter.reduce((sum, s) => sum + s.seconds / boardingPace('enter', s.stage), 0);
  assert.ok(walk + transit < 3.1 && walk + transit > 2.3, `seated after ${(walk + transit).toFixed(2)} s`);
  assert.ok(TRANSIT_SEGMENTS.enter.every((s) => boardingPace('enter', s.stage) <= 1.6), 'not rushed');
  assert.equal(boardingPace('exit', 'open'), 1);
});

test('from the passenger side the lead walks round the car to the driver\'s door (QA bug 2)', () => {
  for (const startZ of [0.6, -1.2]) {
    const car = fakeCar(5, { x: 0, z: 0 });
    const { context } = fakeWorld([car]);
    const movement = createOnFootMovement({ groundHeightAt: () => 0 });
    movement.placeAt(1.4, startZ, 0, 0); // right of a car facing -Z: the passenger side
    const seat = createVehicleEntry(context, { entity: { id: 2, data: {} }, movement, figure: fakeFigure() });
    assert.equal(seat.tryEnter(), true);
    let crossedEnd = false;
    for (let i = 0; i < 600 && seat.phase === 'approach'; i += 1) {
      seat.boardStep(noKeys, 1 / 60);
      const s = movement.state;
      movement.follow(s.wantX, s.wantZ, 0, Math.hypot(s.wantX, s.wantZ));
      if (Math.abs(s.z) > 2.2) crossedEnd = true;
      assert.ok(!(Math.abs(s.x) < 0.8 && Math.abs(s.z) < 2.0), `never through the body (${s.x}, ${s.z})`);
    }
    assert.equal(seat.phase, 'enter', `in through the driver's door from z ${startZ}`);
    assert.ok(crossedEnd && movement.state.x < -1, 'round an end to the driver side');
  }
});

test('a car traffic was driving is a carjack; a move key cancels the walk', () => {
  const known = new Set();
  const moving = fakeCar(3, { parked: false }).entity;
  assert.equal(isCarjack(moving, known), true);
  known.add(3);
  assert.equal(isCarjack(moving, known), false, 'not a car the lead drove before');
  const car = fakeCar(4, { parked: false });
  const { context } = fakeWorld([car]);
  const movement = createOnFootMovement({ groundHeightAt: () => 0 });
  movement.placeAt(0, 0, 0, 0);
  const seat = createVehicleEntry(context, { entity: { id: 1, data: {} }, movement, figure: fakeFigure() });
  assert.equal(seat.tryEnter(), true);
  assert.equal(seat.jacking, true);
  seat.boardStep({ x: 1, z: 0, jump: false }, 1 / 60);
  assert.equal(seat.phase, null, 'cancelled');
});
