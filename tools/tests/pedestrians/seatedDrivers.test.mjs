// Drivers seated in traffic's near cars and the obstacle grid round the focus: a driver sits at
// the car's seat anchor (following the car), only for cars traffic lists near the camera; a
// motorcycle gets a rider on its grips and pegs (and is mounted); the player's carjack gets the driver's walker, and once its transit
// starts the driver goes to the crowd; a car the lead has claimed keeps its driver, a gone car
// frees the body. The grid returns the same nearest circles as a scan of all of them.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../city-world/vendoredThreeHook.mjs', import.meta.url);
const THREE = await import('three');
const { createSeatedDrivers, DRIVER_RADIUS } = await import('../../../game/src/pedestrians/seatedDrivers.js');
const { createObstacleGrid } = await import('../../../game/src/pedestrians/obstacleGrid.js');

const SEAT = new THREE.Vector3(-0.36, 0.52, 0.1);
const BIKE_SEAT = new THREE.Vector3(0, 0.91, 0.12);

function world() {
  const cars = new Map(), rigs = new Map();
  const entities = { get: (id) => cars.get(id) ?? null };
  const camera = new THREE.PerspectiveCamera();
  function addCar(id, x, z, yaw, { bike = false } = {}) {
    const root = new THREE.Object3D();
    root.position.set(x, 0, z);
    root.rotation.y = yaw;
    const anchors = { anchor_seat_driver: { position: (bike ? BIKE_SEAT : SEAT).clone(), direction: { x: 0, z: -1 } }, anchor_door_driver: { position: new THREE.Vector3(-1.4, 0, -0.2) } };
    let near = null, car = null;
    if (bike) {
      anchors.anchor_grip_l = { position: new THREE.Vector3(-0.3, 1, -0.5) };
      // The bike's near model: the grips ride on the fork, the pegs on the frame.
      near = new THREE.Object3D();
      const fork = new THREE.Object3D();
      fork.name = 'fork';
      near.add(fork);
      root.add(near);
      for (const [name, parent, x, y, z] of [['anchor_grip_l', fork, -0.33, 0.98, -0.5], ['anchor_grip_r', fork, 0.33, 0.98, -0.5], ['anchor_foot_l', near, -0.2, 0.42, 0.15], ['anchor_foot_r', near, 0.2, 0.42, 0.15]]) {
        const node = new THREE.Object3D();
        node.name = name;
        node.position.set(x, y, z);
        parent.add(node);
      }
      car = { riderSeated: false, lean: 0.2, mounted: 0, mount() { this.riderSeated = true; this.mounted += 1; } };
    }
    rigs.set(id, { root, asset: { anchors, extras: {} }, steeringWheel: null, near, car });
    cars.set(id, { id, position: root.position, heading: -yaw, radius: 2.4, data: { driverId: null }, tags: new Set() });
  }
  const traffic = { nearCars(out, radius) {
    out.length = 0;
    for (const car of cars.values()) if (Math.hypot(car.position.x - camera.position.x, car.position.z - camera.position.z) <= radius) out.push(car.id);
    return out;
  } };
  const fleet = { get: (id) => (rigs.has(id) ? { rig: rigs.get(id), car: rigs.get(id).car } : null) };
  const context = { entities, view: { camera }, systems: { find: (name) => (name === 'traffic' ? traffic : name === 'vehicles' ? fleet : null) } };
  const released = [];
  const bodies = {
    acquire() {
      const instance = new THREE.Object3D();
      const walker = { state: { yaw: 0 }, transit: { kind: null }, seated: null, seatedAt: null, seat: { lean: 0 }, sit(where) { walker.seated = where ? where.kind : null; walker.seatedAt = where; }, exitVehicle() { walker.transit.kind = 'dragged'; } };
      return { instance, walker, input: { moveX: 1, moveZ: 1, facing: 0 }, scale: 1.1 };
    },
    release(body) { released.push(body); },
    animate() {},
  };
  const hauled = [];
  const crowd = { context, bodies, frustum: new THREE.Frustum(), time: 0, player: { id: 99 } };
  const drivers = createSeatedDrivers(crowd, {
    dressFor: () => ({ archetype: { id: 'office_worker' }, look: { height: 1.8, paints: {} }, assetId: 'pedestrian_test' }),
    onHauled: (driver) => hauled.push(driver),
  });
  return { cars, addCar, drivers, released, hauled, camera, crowd };
}

test('traffic cars near the camera get a driver at the seat anchor, following the car', () => {
  const w = world();
  w.addCar(1, 10, 0, 0.5);
  w.addCar(2, DRIVER_RADIUS + 20, 0, 0);
  w.addCar(3, -8, 5, 0, { bike: true });
  w.drivers.update(0.016);
  assert.equal(w.drivers.count, 2, 'the near car and the near motorcycle (not the far car)');
  const driver = w.drivers.seatedDriverOf(1);
  assert.ok(driver && driver.walker, 'the carjack gets the walker');
  assert.equal(driver.walker.seated, 'driver');
  assert.equal(driver.body.scale, 1);
  assert.equal(w.drivers.seatedDriverOf(2), null);
  const expected = SEAT.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.5).add(new THREE.Vector3(10, 0, 0));
  assert.ok(driver.body.instance.position.distanceTo(expected) < 1e-4, 'sits at the seat anchor');
  // The car drives on: the body goes with it.
  w.cars.get(1).position.set(14, 0, -3);
  w.drivers.update(0.016);
  expected.add(new THREE.Vector3(4, 0, -3));
  assert.ok(driver.body.instance.position.distanceTo(expected) < 1e-4, 'follows the car');
  assert.ok(Math.abs(driver.walker.state.yaw - 0.5) < 1e-6, 'the walker faces the way the car does');
});

test('a traffic motorcycle gets a rider on its seat with the hands on the grips and the feet on the pegs', () => {
  const w = world();
  w.addCar(3, -8, 5, 0.3, { bike: true });
  w.drivers.update(0.016);
  const rider = w.drivers.seatedDriverOf(3);
  assert.ok(rider, 'the bike has a rider');
  assert.equal(rider.walker.seated, 'rider');
  const where = rider.walker.seatedAt;
  assert.equal(where.gripL.name, 'anchor_grip_l', 'live grip nodes (they turn with the fork)');
  assert.equal(where.gripR.name, 'anchor_grip_r');
  assert.equal(where.footL.name, 'anchor_foot_l');
  assert.equal(where.footR.name, 'anchor_foot_r');
  assert.equal(where.gripL.parent.name, 'fork');
  const expected = BIKE_SEAT.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.3).add(new THREE.Vector3(-8, 0, 5));
  assert.ok(rider.body.instance.position.distanceTo(expected) < 1e-4, 'hips on the bike seat, not dropped like a car seat');
  const bike = w.cars.get(3) && rider.points.rig.car;
  assert.equal(bike.mounted, 1, 'the bike is mounted (held up, it drives)');
  assert.ok(Math.abs(rider.walker.seat.lean + 0.2 * 0.3) < 1e-6, 'leans a little further than the bank, + to the left');
  // Banked: the seat's orientation carries the bike's roll.
  rider.points.rig.root.rotation.z = -0.3;
  w.drivers.update(0.016);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rider.body.instance.quaternion);
  assert.ok(up.x > 0.2, 'the rider banks with the bike');
  w.drivers.update(0.016);
  assert.equal(bike.mounted, 1, 'mounted once');
});

test('a haul hands the driver to the crowd; a claimed car keeps its driver, a gone car frees the body', () => {
  const w = world();
  w.addCar(1, 5, 0, 0);
  w.addCar(2, -5, 0, 0);
  w.drivers.update(0.016);
  assert.equal(w.drivers.count, 2);
  // The player's 'pull' stage: exitVehicle({dragged: true}) starts the run-time's transit.
  w.drivers.seatedDriverOf(1).walker.exitVehicle({ dragged: true });
  w.drivers.update(0.016);
  assert.equal(w.hauled.length, 1);
  assert.equal(w.hauled[0].vehicleId, 1);
  assert.equal(w.drivers.seatedDriverOf(1), null, 'the seat is empty after the haul');
  w.drivers.update(0.5);
  assert.equal(w.drivers.seatedDriverOf(1), null, 'and stays empty while traffic still lists the car');
  assert.equal(w.released.length, 0, 'the hauled body is not pooled: the crowd has it');
  // The lead claims car 2 (traffic lets it go and it leaves traffic's list): the driver stays.
  w.cars.get(2).data.driverId = 99;
  w.camera.position.set(200, 0, 0);
  w.drivers.update(0.5);
  assert.ok(w.drivers.seatedDriverOf(2), 'claimed by the lead: still at the wheel');
  w.cars.delete(2);
  w.drivers.update(0.5);
  assert.equal(w.drivers.count, 0);
  assert.equal(w.released.length, 1, 'the gone car frees its body');
});

test('an angry driver leaves the seat empty until back', () => {
  const w = world();
  w.addCar(1, 5, 0, 0);
  w.drivers.update(0.016);
  w.drivers.vacate(1, 40);
  assert.equal(w.drivers.count, 0);
  w.drivers.update(0.5);
  assert.equal(w.drivers.count, 0, 'not re-seated while the driver is out');
  w.drivers.vacate(1, 0);
  w.drivers.update(0.5);
  assert.equal(w.drivers.count, 1, 'back in: drawn again');
});

test('the obstacle grid gives the nearest circles a scan of all would', () => {
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const circles = [];
  for (let i = 0; i < 3000; i += 1) circles.push({ x: random() * 200 - 100, z: random() * 200 - 100, radius: 0.1 + random() * 0.6 });
  const grid = createObstacleGrid();
  grid.rebuild(circles, 0, 0, 90);
  for (let q = 0; q < 40; q += 1) {
    const x = random() * 160 - 80, z = random() * 160 - 80;
    const got = [];
    grid.query(x, z, 4.5, 10, (cx, cz, r) => got.push(Math.hypot(cx - x, cz - z) - r));
    const want = circles.filter((c) => Math.abs(c.x) <= 90 && Math.abs(c.z) <= 90)
      .map((c) => Math.hypot(c.x - x, c.z - z) - c.radius).filter((gap) => gap <= 4.5).sort((a, b) => a - b).slice(0, 10);
    assert.equal(got.length, want.length);
    for (let k = 0; k < got.length; k += 1) assert.ok(Math.abs(got[k] - want[k]) < 1e-4);
  }
  assert.ok(grid.covers(0, 0, 4.5) && !grid.covers(88, 0, 4.5));
});
