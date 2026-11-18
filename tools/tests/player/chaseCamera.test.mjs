// The chase camera against the owner's direction on the chase point of view (18 Nov 08:25): a
// coupe (4.4 x 1.9 m, roof 1.25 m, size 2.4) at 31 km/h seen from 5.5 to 6.5 m behind its centre,
// 1.9 to 2.2 m above the road, 6 to 10 degrees down, centred, roof 55 to 60 % from the top, about
// 28 to 35 % of the width at 16:10; the far view 8 to 9 m back and about 2.8 m up; bikes closer,
// trucks higher than their roof.
import assert from 'node:assert/strict';
import test from 'node:test';
import { chaseSizeOf, createVehicleChaseCamera } from '../../../game/src/player/vehicleChaseCamera.js';

const still = { lookX: 0, lookY: 0, sensitivity: 0, invertY: false };

function settle(radius, speed, far = false) {
  const chase = createVehicleChaseCamera();
  const target = { x: 0, y: 0, z: 0, heading: 0, speed, radius, steer: 0, lookBehind: false };
  const shot = { pivot: {}, shoulder: {}, camera: {} };
  if (far) chase.toggleDistance();
  chase.cut(target);
  for (let i = 0; i < 600; i += 1) chase.update(1 / 60, target, still, shot);
  return { shot, back: Math.hypot(shot.camera.x, shot.camera.z), up: shot.camera.y, size: chaseSizeOf(radius) };
}

test('the coupe at 31 km/h is framed as the owner asks', () => {
  const { shot, back, up } = settle(2.4, 8.6);
  assert.ok(back >= 5.5 && back <= 6.5, `${back} m behind`);
  assert.ok(up >= 1.9 && up <= 2.2, `${up} m above the road`);
  const down = (-shot.pitch * 180) / Math.PI;
  assert.ok(down >= 6 && down <= 10, `${down} degrees down`);
  assert.ok(Math.abs(shot.camera.x) < 1e-9, 'centred behind the car');
  const fov = 58 + shot.fovOffset;
  assert.ok(fov >= 55 && fov <= 60, `field of view ${fov}`);
  const half = Math.tan((fov * Math.PI) / 360);
  // The car's width at its tail (2.2 m behind the centre) at 16:10.
  const widthShare = 1.9 / (2 * (back - 2.2) * half * 1.6);
  assert.ok(widthShare >= 0.28 && widthShare <= 0.35, `the car takes ${widthShare} of the width`);
  // The roof's rear edge, about 0.9 m behind the centre, 1.25 m high.
  const roofTop = 0.5 + 0.5 * Math.tan(Math.atan2(up - 1.25, back - 0.9) + shot.pitch) / half;
  assert.ok(roofTop >= 0.53 && roofTop <= 0.6, `roof at ${roofTop} from the top`);
});

test('speed eases the camera back a little; the far view is 8 to 9 m back and about 2.8 m up', () => {
  const slow = settle(2.4, 0), fast = settle(2.4, 40);
  assert.ok(fast.back > slow.back && fast.back - slow.back < 1.2, 'a little farther at speed');
  const far = settle(2.4, 0, true);
  assert.ok(far.back >= 8 && far.back <= 9, `far: ${far.back} m back`);
  assert.ok(far.up >= 2.6 && far.up <= 3.0, `far: ${far.up} m up`);
});

test('bikes are framed closer and trucks from above their roof', () => {
  const bike = settle(1.1, 5), truck = settle(4.7, 5);
  assert.ok(bike.back < 5 && bike.up < 1.9, 'a bike closer and lower');
  assert.ok(truck.back > 8 && truck.up > 3.3, `a truck farther and above a 3.3 m roof (${truck.up})`);
});
