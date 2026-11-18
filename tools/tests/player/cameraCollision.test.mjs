// The follow camera's collision on a fake physics world of slabs across the camera line: a thin
// trunk is passed (QA bug 3: the view collapsed into the lead against a palm), a solid wall pulls
// the camera in, and on foot the camera never comes closer than the clearance that keeps the near
// plane out of the lead's body (the doubled yellow slab in the aim view).
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCameraCollision } from '../../../game/src/player/cameraCollision.js';

/** Slabs across the z axis, [from, to]; a sweep that starts inside one does not hit it. */
function slabWorld(slabs) {
  return {
    sweepSphere(ox, oy, oz, dx, dy, dz, length, radius, mask, ignore, hit) {
      let best = Infinity;
      for (const [a, b] of slabs) {
        let t = Infinity;
        if (dz > 0 && oz < a) t = (a - oz) / dz;
        else if (dz < 0 && oz > b) t = (oz - b) / -dz;
        if (t < best) best = t;
      }
      if (best >= length) return false;
      hit.hit = true; hit.distance = best;
      return true;
    },
  };
}

function cameraAfter(slabs, wanted, minimum) {
  const collision = createCameraCollision(() => slabWorld(slabs));
  const camera = { x: 0, y: 0, z: wanted };
  collision.resolve({ x: 0, y: 0, z: 0 }, camera, 0, minimum);
  return camera.z;
}

test('a thin trunk between the lead and the camera does not pull the camera in', () => {
  assert.equal(cameraAfter([[1.0, 1.3]], 2.2, 0.95), 2.2);
});

test('a solid wall pulls the camera in front of it', () => {
  assert.equal(cameraAfter([[1.2, 6]], 2.2, 0.95), 1.2);
});

test('on foot the camera stays clear of the lead\'s body however close the wall', () => {
  assert.equal(cameraAfter([[0.3, 6]], 1.6, 0.95), 0.95);
  assert.ok(Math.abs(cameraAfter([[0.3, 6]], 6, 0) - 0.48) < 1e-9, 'in a car the old 8 % floor stays');
});
