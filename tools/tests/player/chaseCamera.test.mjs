// The chase camera against the owner's direction on the chase point of view (18 Nov 08:25): a
// coupe (size 2.42, tail 2.2 m behind its centre, 1.52 m wide there as it reads from behind in
// the GPU picture chase-cam.jpg, roof edge 1.25 m high about 0.9 m behind the centre) driving at
// 31 km/h, seen from 5.5 to 6.5 m behind its centre, 1.9 to 2.2 m above the road, 6 to 10 degrees
// down, 55 to 60 degrees, centred, its roof 55 to 60 % from the top and 28 to 35 % of the width at
// 16:10; the far view 8 to 9 m back and about 2.8 m up; bikes closer, trucks above their roof.
import assert from 'node:assert/strict';
import test from 'node:test';
import { chaseSizeOf, createVehicleChaseCamera } from '../../../game/src/player/vehicleChaseCamera.js';

const still = { lookX: 0, lookY: 0, sensitivity: 0, invertY: false };

/** Drives a vehicle north (-Z) at `speed` for ten seconds and reads the settled shot. */
function settle(radius, speed, far = false) {
  const chase = createVehicleChaseCamera();
  const target = { x: 0, y: 0, z: 0, heading: 0, speed, radius, steer: 0, lookBehind: false };
  const shot = { pivot: {}, shoulder: {}, camera: {} };
  if (far) chase.toggleDistance();
  chase.cut(target);
  for (let i = 0; i < 600; i += 1) { target.z -= speed / 60; chase.update(1 / 60, target, still, shot); }
  const back = Math.hypot(shot.camera.x - target.x, shot.camera.z - target.z);
  return { shot, back, up: shot.camera.y, size: chaseSizeOf(radius), x: shot.camera.x - target.x };
}

test('the coupe at 31 km/h is framed as the owner asks', () => {
  const { shot, back, up, x } = settle(2.42, 8.6);
  assert.ok(back >= 5.5 && back <= 6.5, `${back} m behind`);
  assert.ok(up >= 1.9 && up <= 2.2, `${up} m above the road`);
  const down = (-shot.pitch * 180) / Math.PI;
  assert.ok(down >= 6 && down <= 10, `${down} degrees down`);
  assert.ok(Math.abs(x) < 1e-9, 'centred behind the car');
  const fov = 58 + shot.fovOffset;
  assert.ok(fov >= 55 && fov <= 60, `field of view ${fov}`);
  const half = Math.tan((fov * Math.PI) / 360);
  // 1.52 m: the tail's width as measured in chase-cam.jpg (26.4 % of 1280 px at 5.59 m, 55.8 deg).
  // The owner's "about 28 to 35 %" and "5.5 to 6.5 m" meet only at the near edge of both: 26 % is
  // accepted here; 28 % needs about 5.3 m behind or 53 degrees.
  const widthShare = 1.52 / (2 * (back - 2.2) * half * 1.6);
  assert.ok(widthShare >= 0.26 && widthShare <= 0.35, `the car takes ${widthShare} of the width`);
  const roofTop = 0.5 + 0.5 * Math.tan(Math.atan2(up - 1.25, back - 0.9) + shot.pitch) / half;
  assert.ok(roofTop >= 0.55 && roofTop <= 0.6, `roof at ${roofTop} from the top`);
});

test('speed eases the camera back a little; the far view is 8 to 9 m back and about 2.8 m up', () => {
  const slow = settle(2.42, 0), fast = settle(2.42, 40), town = settle(2.42, 17.7);
  // QA shift 4: at rest it stood 5.1 m back; the owner's 5.5 to 6.5 m holds at rest and in town.
  for (const [name, shot] of [['rest', slow], ['17.7 m/s', town], ['40 m/s', fast]]) {
    assert.ok(shot.back >= 5.5 && shot.back <= 6.5, `${name}: ${shot.back} m behind`);
  }
  // At 144 km/h: the pull-back and the follow lag together, about 2 m.
  assert.ok(fast.back > slow.back && fast.back - slow.back < 2.3, `a little farther at speed (${slow.back} -> ${fast.back})`);
  assert.ok(fast.shot.fovOffset > slow.shot.fovOffset && 58 + fast.shot.fovOffset <= 60, 'a little wider at speed');
  const far = settle(2.42, 0, true);
  assert.ok(far.back >= 8 && far.back <= 9, `far: ${far.back} m back`);
  assert.ok(far.up >= 2.6 && far.up <= 3.0, `far: ${far.up} m up`);
});

test('bikes are framed closer and trucks from above their roof', () => {
  const bike = settle(1.1, 5), truck = settle(4.7, 5);
  assert.ok(bike.back < 5 && bike.up < 1.9, 'a bike closer and lower');
  assert.ok(truck.back > 7.5 && truck.up > 3.3, `a truck farther and above a 3.3 m roof (${truck.back}, ${truck.up})`);
});
