// The follow camera's collision on a fake physics world of slabs across the camera line: a thin
// trunk is passed (QA bug 3: the view collapsed into the lead against a palm), a solid wall pulls
// the camera in, and on foot the camera never comes closer than the clearance that keeps the near
// plane out of the lead's body (the doubled yellow slab in the aim view).
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCameraCollision, LEAD_CLEAR, THIN_OBSTACLE } from '../../../game/src/player/cameraCollision.js';

/**
 * Slabs across the z axis, [from, to]; the swept sphere touches one `radius` early, like the
 * physics' sweepSphere; a sweep that starts inside one (or touching it) does not hit it.
 */
function slabWorld(slabs) {
  return {
    sweepSphere(ox, oy, oz, dx, dy, dz, length, radius, mask, ignore, hit) {
      let best = Infinity;
      for (const [a, b] of slabs) {
        let t = Infinity;
        if (dz > 0 && oz < a - radius) t = (a - radius - oz) / dz;
        else if (dz < 0 && oz > b + radius) t = (oz - b - radius) / -dz;
        if (t < best) best = t;
      }
      if (best >= length) return false;
      hit.hit = true; hit.distance = best;
      return true;
    },
  };
}

function resolved(slabs, wanted, minimum) {
  const collision = createCameraCollision(() => slabWorld(slabs));
  const camera = { x: 0, y: 0, z: wanted };
  collision.resolve({ x: 0, y: 0, z: 0 }, camera, 0, minimum);
  return { z: camera.z, clip: collision.clipNear };
}
const cameraAfter = (slabs, wanted, minimum) => resolved(slabs, wanted, minimum).z;

test('a thin trunk between the lead and the camera does not pull the camera in', () => {
  assert.equal(cameraAfter([[1.0, 1.3]], 2.2, 0.95), 2.2);
});

test('QA bug 3: a 0.45 m palm trunk behind the lead is passed and cut away by the near plane, never into the lead', () => {
  const { z, clip } = resolved([[0.7, 1.15]], 2.2, 0.95);
  assert.equal(z, 2.2, 'the camera keeps its distance');
  assert.ok(clip >= 2.2 - 0.7 - 0.01, `the whole trunk is nearer than the near plane (${clip})`);
  assert.ok(clip <= 2.2 - LEAD_CLEAR + 1e-9, 'the near plane stays out of the lead');
  const inside = resolved([[1.9, 2.35]], 2.2, 0.95);
  assert.equal(inside.z, 2.2, 'a trunk on the camera\'s own spot is passed too');
  assert.ok(inside.clip > 0.3, 'and cut away');
  assert.equal(resolved([[1.2, 6]], 2.2, 0.95).clip, 0, 'a wall is not cut');
  assert.equal(resolved([], 2.2, 0.95).clip, 0, 'nothing to cut in the open');
});

test('a block deeper than THIN_OBSTACLE pulls the camera in like a wall', () => {
  assert.ok(cameraAfter([[1.0, 1.0 + THIN_OBSTACLE + 0.1]], 2.6, 0.95) < 1.0);
});

test('a solid wall pulls the camera in front of it', () => {
  assert.ok(Math.abs(cameraAfter([[1.6, 6]], 2.2, 0.95) - (1.6 - 0.28)) < 1e-9, 'its sphere touching the wall');
});

test('on foot the camera stays clear of the lead\'s body however close the wall', () => {
  assert.ok(Math.abs(cameraAfter([[0.3, 6]], 1.6, 0.95) - 0.95) < 1e-9);
  assert.ok(Math.abs(cameraAfter([[0.3, 6]], 6, 0) - 0.48) < 1e-9, 'in a car the old 8 % floor stays');
});
