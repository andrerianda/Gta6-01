// Shift 11: helicopters and boats from the lead's seat (flight keys, the landing before stepping
// out, the craft chase framings) and the on-foot camera sliding past poles and trunks instead of
// collapsing into the lead's back (QA bug 9, Tolliver Tow; lamp poles at the m02/m03 starts).
import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { createCameraCollision, SIDE_SLIDE } from '../../../game/src/player/cameraCollision.js';
import {
  CHASE_FRAMING, HELICOPTER_CHASE_FRAMING, chaseFramingFor, chaseReach, chaseSizeOf, createVehicleChaseCamera,
} from '../../../game/src/player/vehicleChaseCamera.js';

register('./vendoredThreeHook.mjs', import.meta.url);
const { FLIGHT_KEYS, LANDING, ensureFlightKeys, flightLift } = await import('../../../game/src/player/vehicleEntry.js');

/** Vertical poles [x, z, radius] seen from above; a sweep starting inside one does not hit it. */
function poleWorld(poles) {
  return {
    sweepSphere(ox, oy, oz, dx, dy, dz, length, radius, mask, ignore, hit) {
      const flat = Math.hypot(dx, dz);
      if (flat < 1e-6) return false;
      const ux = dx / flat, uz = dz / flat;
      let best = Infinity;
      for (const [cx, cz, r] of poles) {
        const R = r + radius, px = cx - ox, pz = cz - oz;
        if (px * px + pz * pz <= R * R) continue;
        const along = px * ux + pz * uz;
        const off2 = px * px + pz * pz - along * along;
        if (along <= 0 || off2 > R * R) continue;
        const t = (along - Math.sqrt(R * R - off2)) / flat;
        if (t < best) best = t;
      }
      if (best >= length) return false;
      hit.hit = true; hit.distance = best;
      return true;
    },
  };
}

function resolvedAmong(poles, wanted) {
  const collision = createCameraCollision(() => poleWorld(poles));
  const camera = { x: 0, y: 0, z: wanted };
  collision.resolve({ x: 0, y: 0, z: 0 }, camera, 0, 0.95);
  return { z: camera.z, clip: collision.clipNear };
}

test('a lamp pole and a trunk in a row behind the lead (too deep to measure) are slid past, not collapsed into', () => {
  const { z, clip } = resolvedAmong([[0, 1.0, 0.2], [0, 1.9, 0.2]], 2.2);
  assert.equal(z, 2.2, 'the camera keeps its distance');
  assert.ok(clip > 0 && clip <= 2.2 - 0.55 + 1e-9, `the poles are cut away, never into the lead (${clip})`);
});

test('a block of posts wider and deeper than the slide (a wall) still pulls the camera in', () => {
  const posts = [];
  for (let x = -2; x <= 2.001; x += 0.3) for (let z = 1.2; z <= 3.3; z += 0.3) posts.push([x, z, 0.12]);
  const { z } = resolvedAmong(posts, 2.2);
  assert.ok(z < 1.2, `a wall-like block stops it (${z})`);
  assert.ok(SIDE_SLIDE >= 0.5 && SIDE_SLIDE <= 0.7);
});

test('helicopters are framed 12-14 m back and higher than cars; boats a little higher than cars', () => {
  const heli = chaseReach(chaseSizeOf(7), 0, 0, HELICOPTER_CHASE_FRAMING);
  assert.ok(heli.distance >= 12 && heli.distance <= 14, `${heli.distance}`);
  const car = chaseReach(chaseSizeOf(2.42), 0, 0, CHASE_FRAMING);
  assert.ok(heli.height > car.height + 2, `${heli.height} vs ${car.height}`);
  const boat = chaseReach(chaseSizeOf(4), 0, 0, chaseFramingFor('boat'));
  const boatAsCar = chaseReach(chaseSizeOf(4), 0, 0, CHASE_FRAMING);
  assert.ok(boat.height > boatAsCar.height && boat.distance >= boatAsCar.distance);
  assert.equal(chaseFramingFor(null), CHASE_FRAMING);

  const chase = createVehicleChaseCamera();
  const target = { x: 0, y: 40, z: 0, heading: 0, speed: 0, radius: 7, steer: 0, lookBehind: false, craft: 'helicopter' };
  const shot = { pivot: {}, shoulder: {}, camera: {} };
  chase.cut(target);
  chase.update(0, target, { lookX: 0, lookY: 0, sensitivity: 0.002, invertY: false }, shot);
  const back = Math.hypot(shot.camera.x, shot.camera.z);
  assert.ok(back >= 11.5 && back <= 14, `camera ${back} m behind the craft`);
  assert.ok(shot.camera.y - 40 >= 5 && shot.camera.y - 40 <= 7, `camera ${shot.camera.y - 40} m over it`);
});

test('flight keys: Space climbs, Shift or Ctrl descends, bridged into the vehicle context when missing', () => {
  const bound = { inVehicle: { handbrake: ['Space'] } };
  const labels = {};
  const controls = {
    labels,
    actions: {
      codesFor: (action, context) => bound[context]?.[action] ?? [],
      rebind: (context, action, codes) => { bound[context][action] = codes; },
    },
  };
  assert.equal(ensureFlightKeys(controls), true);
  assert.deepEqual(bound.inVehicle.ascend, [...FLIGHT_KEYS.ascend]);
  assert.deepEqual(bound.inVehicle.descend, ['ShiftLeft', 'ControlLeft']);
  assert.ok(labels.ascend && labels.descend);
  assert.equal(ensureFlightKeys(null), false);

  const held = new Set();
  const input = { held: (action) => held.has(action) };
  assert.equal(flightLift(input), 0);
  held.add('ascend'); assert.equal(flightLift(input), 1);
  held.add('descend'); assert.equal(flightLift(input), 0);
  held.delete('ascend'); assert.equal(flightLift(input), -1);
  assert.equal(LANDING.stepOut, 1.5);
});
